import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { advantageScale, formatPrincipalVariation, scoreLabel } from '../domain/localEvaluation';
import type { BoardState } from '../domain/types';
import { hasAnalysisSetup, removeAnalysisSetup } from '../engine/isolation';
import { localAnalysis, type AnalysisState } from '../engine/localAnalysis';

interface Props { board: BoardState; position: string; enabled: boolean; onEnabledChange: (enabled: boolean) => void; onPrepare: () => Promise<boolean> }

export function LocalEvaluation({ board, position, enabled, onEnabledChange, onPrepare }: Props) {
  const key = useId();
  const [result, setResult] = useState<{ position: string; state: AnalysisState }>();
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState('');
  const attemptedSetup = useRef(false);
  const state = result?.position === position ? result.state : undefined;
  useEffect(() => {
    if (!enabled) return;
    if (!globalThis.crossOriginIsolated) {
      if (attemptedSetup.current) return;
      attemptedSetup.current = true;
      let cancelled = false;
      void Promise.resolve().then(() => {
        if (cancelled) return;
        setPreparing(true);
        return onPrepare();
      }).catch((error) => { if (!cancelled) setError(error instanceof Error ? error.message : String(error)); })
        .finally(() => { if (!cancelled) setPreparing(false); });
      return () => { cancelled = true; attemptedSetup.current = false; };
    }
    return localAnalysis.request(key, position, board.turn, (state) => setResult({ position, state }));
  }, [key, enabled, position, board.turn, onPrepare]);

  const toggle = () => {
    if (enabled) { onEnabledChange(false); setResult(undefined); return; }
    setError('');
    onEnabledChange(true);
  };
  const phase = state?.phase;
  const label = phase ? { loading: '読み込み中…', queued: '解析待ち', running: '解析中', done: '解析完了', paused: '非表示のため停止中', error: '解析停止' }[phase] : '';
  const score = enabled ? state?.score : undefined;
  const candidates = (enabled ? state?.candidates ?? [] : []).map((candidate) => ({ ...candidate, labels: formatPrincipalVariation(board, candidate.pv) }));
  const first = candidates.find((candidate) => candidate.rank === 1)?.labels[0];
  const leader = !score ? '形勢' : score.kind === 'mate' ? '詰み' : Math.abs(score.value) < 100 ? '互角' : score.value > 0 ? '先手リード' : '後手リード';
  return <section className={`local-evaluation ${!enabled ? 'is-off' : ''}`} aria-label="AI局面解説" style={{ '--black-share': `${advantageScale(score)}%` } as CSSProperties}>
    <div className="evaluation-head">
      <span className="evaluation-leader">{leader}</span>
      <output className="evaluation-number" aria-label="先手基準の評価値" aria-live="polite">{score ? scoreLabel(score) : '—'}</output>
      <span className="evaluation-status">{!enabled ? '解析OFF' : preparing ? '準備中' : label || '解析待ち'}</span>
    </div>
    <div className="advantage-meter" role="img" aria-label={score ? `先手基準の形勢ゲージ ${scoreLabel(score)}。勝率ではありません。` : '形勢未評価'}><span /></div>
    <div className="evaluation-bottom"><span className="first-candidate"><span>候補</span> <strong>{first ?? '—'}</strong></span><span className="evaluation-depth">{score ? `深さ ${score.depth}` : 'micro'}</span>
      <details className="analysis-lines"><summary>候補手・読み筋</summary><div className="analysis-popover">
        <div className="analysis-title"><strong>AIの読み筋</strong><span>つようら王11micro · 先手基準</span></div>
        {candidates.some((candidate) => candidate.labels.length) ? <ol>{candidates.filter((candidate) => candidate.labels.length).map((candidate) => <li key={candidate.rank}><div><b>第{candidate.rank}候補</b><strong>{scoreLabel(candidate.score)}</strong><small>深さ{candidate.score.depth}</small></div><p>{candidate.labels.join(' → ')}</p></li>)}</ol> : <p>読み筋はまだ取得できていません。</p>}
        {(error || state?.message) && <p role="alert">{error || state?.message}</p>}
        <div className="analysis-settings"><button type="button" aria-pressed={enabled} onClick={toggle}>{`端末で解析 ${enabled ? 'ON' : 'OFF'}`}</button><a href={`${import.meta.env.BASE_URL}engine/NOTICE.txt`} target="_blank" rel="noreferrer">ライセンス</a>{hasAnalysisSetup() && <button type="button" onClick={() => { onEnabledChange(false); void removeAnalysisSetup().catch((error) => setError(String(error))); }}>解析用設定を解除して再読み込み</button>}</div>
        <p className="analysis-note">端末で約0.5秒ずつ順番に解析します。数値・読み筋は短時間解析の参考値です。ゲージは勝率ではありません。</p>
      </div></details>
    </div>
    {(error || state?.message) && <span className="analysis-error" role="alert">解析停止：候補手・読み筋を開いて確認してください。</span>}
  </section>;
}
