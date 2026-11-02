import { createPortal } from 'react-dom';
import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { advantageScale, formatPrincipalVariation, scoreLabel } from '../domain/localEvaluation';
import type { BoardState } from '../domain/types';
import { hasAnalysisSetup, removeAnalysisSetup, retryAnalysisPreparation } from '../engine/isolation';
import { localAnalysis, type AnalysisState, type AnalysisOptions } from '../engine/localAnalysis';
import { validatedPv } from '../domain/studyRules';

interface Props { board: BoardState; position: string; enabled: boolean; onEnabledChange: (enabled: boolean) => void; onPrepare: (signal?: AbortSignal) => Promise<boolean>; study?: boolean; milliseconds?: AnalysisOptions['milliseconds']; requestId?: number; stopped?: boolean; suspended?: boolean; detailsTarget?: HTMLElement | null; onDetails?: () => void }

export function LocalEvaluation({ board, position, enabled, onEnabledChange, onPrepare, study = false, milliseconds = 500, requestId = 0, stopped = false, suspended = false, detailsTarget, onDetails }: Props) {
  const key = useId();
  const [result, setResult] = useState<{ position: string; state: AnalysisState }>();
  const [preparing, setPreparing] = useState(false);
  const [removing,setRemoving] = useState(false);
  const [error, setError] = useState('');
  const [cancelledError,setCancelledError] = useState(false);
  const [retrySequence,setRetrySequence] = useState(0);
  const prepareRef = useRef(onPrepare);
  useLayoutEffect(() => { prepareRef.current = onPrepare; }, [onPrepare]);
  const resultKey = `${position}|${milliseconds}|${requestId}|${retrySequence}`;
  const state = result?.position === resultKey ? result.state : undefined;
  useEffect(() => {
    if (!enabled || stopped || suspended || globalThis.crossOriginIsolated) return;
    const controller = new AbortController();
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (cancelled) return;
      setPreparing(true); setError(''); setCancelledError(false);
      return prepareRef.current(controller.signal);
    }).catch((error) => { if (!cancelled) { setError(error instanceof Error ? error.message : String(error)); setCancelledError(error?.name === 'AbortError'); } })
      .finally(() => { if (!cancelled) setPreparing(false); });
    return () => { cancelled = true; controller.abort(); };
  }, [enabled, stopped, suspended, requestId, retrySequence]);
  useEffect(() => {
    if (!enabled || stopped || suspended || !globalThis.crossOriginIsolated) return;
    const cancel = localAnalysis.request(key, position, board.turn, (state) => setResult({ position:resultKey, state }), { milliseconds, bypassCache:requestId > 0 || retrySequence > 0 });
    return cancel;
  }, [key, enabled, position, board.turn, resultKey, milliseconds, requestId, retrySequence, stopped, suspended]);

  const toggle = () => {
    if (enabled) { onEnabledChange(false); setResult(undefined); return; }
    retry();
    onEnabledChange(true);
  };
  const retry = () => {
    setError(''); setCancelledError(false); setResult(undefined);
    retryAnalysisPreparation(); localAnalysis.retry();
    setRetrySequence(value => value+1);
  };
  const phase = state?.phase;
  const label = phase ? { loading: '読み込み中…', queued: '解析待ち', running: '解析中', done: '解析完了', paused: '非表示のため停止中', error: '解析停止' }[phase] : '';
  const score = enabled ? state?.score : undefined;
  const candidates = (enabled ? state?.candidates ?? [] : []).map((candidate) => ({ ...candidate, ...(study ? validatedPv(board,candidate.pv,12) : {labels:formatPrincipalVariation(board,candidate.pv),truncated:false}) }));
  const first = candidates.find((candidate) => candidate.rank === 1)?.labels[0];
  const leader = !score ? '形勢' : score.kind === 'mate' ? '詰み' : Math.abs(score.value) < 100 ? '互角' : score.value > 0 ? '先手リード' : '後手リード';
  const analysisDetails = <details className="analysis-lines" open={Boolean(detailsTarget) || (study && !matchMedia('(max-width:767px)').matches) || undefined}><summary>候補手・読み筋</summary><div className="analysis-popover">
        <div className="analysis-title"><strong>AIの読み筋</strong><span>つようら王11micro · 先手基準</span></div>
        {candidates.some((candidate) => candidate.labels.length) ? <ol>{candidates.filter((candidate) => candidate.labels.length).map((candidate) => <li key={candidate.rank}><div><b>第{candidate.rank}候補</b><strong>{scoreLabel(candidate.score)}</strong><small>深さ{candidate.score.depth}</small></div><p>{candidate.labels.join(' → ')}</p></li>)}</ol> : <p>読み筋はまだ取得できていません。</p>}
        {candidates.some((candidate) => candidate.truncated) && <p>読み筋の一部を表示できません。</p>}
        {(error || state?.message) && <p role="alert">{error || state?.message}</p>}
        <div className="analysis-settings"><button type="button" disabled={removing} aria-pressed={enabled} onClick={toggle}>{`端末で解析 ${enabled ? 'ON' : 'OFF'}`}</button><a href={`${import.meta.env.BASE_URL}engine/NOTICE.txt`} target="_blank" rel="noreferrer">ライセンス</a>{!study && hasAnalysisSetup() && <button type="button" disabled={removing} onClick={() => { setRemoving(true); onEnabledChange(false); void removeAnalysisSetup().catch((error) => { setError(String(error)); setRemoving(false); }); }}>{removing ? '解析用設定を解除中…' : '解析用設定を解除して再読み込み'}</button>}</div>
        <p className="analysis-note">{study ? `端末で1局面${milliseconds/1000}秒、各12手まで表示します。解析時間は設定タブで変更できます。` : '端末で約0.5秒ずつ順番に解析します。各6手まで表示します。'}数値・読み筋は参考値です。ゲージは勝率ではありません。</p>
      </div></details>;
  return <section className={`local-evaluation ${!enabled ? 'is-off' : ''}`} aria-label="AI局面解説" style={{ '--black-share': `${advantageScale(score)}%` } as CSSProperties}>
    {onDetails && <button className="evaluation-open" aria-label="候補手・読み筋を開く" onClick={event => { event.currentTarget.focus({preventScroll:true}); onDetails(); }}><span>読み筋 ›</span></button>}
    <div className="evaluation-head">
      <span className="evaluation-leader">{leader}</span>
      <output className="evaluation-number" data-kind={score?.kind} aria-label="先手基準の評価値" aria-live="polite">{score ? <>{scoreLabel({ ...score, bound: undefined })}{score.bound && <small>{score.bound === 'lowerbound' ? '以上' : '以下'}</small>}</> : '—'}</output>
      <span className="evaluation-status">{!enabled ? '解析OFF' : stopped ? '停止中' : error ? cancelledError ? '準備中断' : '解析停止' : preparing ? '準備中' : label || '解析待ち'}</span>
    </div>
    <div className="advantage-meter" role="img" aria-label={score ? `先手基準の形勢ゲージ ${scoreLabel(score)}。勝率ではありません。` : '形勢未評価'}><span /></div>
    <div className="evaluation-bottom"><span className="first-candidate"><span>第一候補</span> <strong>{first ?? '—'}</strong></span><span className="evaluation-depth">{score ? `深さ ${score.depth}` : 'micro'}</span>
      {detailsTarget ? createPortal(analysisDetails, detailsTarget) : !onDetails ? analysisDetails : null}
    </div>
    {enabled && !stopped && (error || state?.message) && <span className="analysis-error" role="alert">{cancelledError ? '解析準備を中断しました。' : '解析を開始できませんでした。'}<button type="button" onClick={retry}>解析を再試行</button></span>}
  </section>;
}
