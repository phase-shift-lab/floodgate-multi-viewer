import { RecordAnalysisPanel } from './RecordAnalysisPanel';
import { hasRecordRecovery } from '../engine/recordRecovery';
import { DetailPanel, type DetailTab } from './DetailPanel';
import { BoardSurface, BoardControls } from './BoardSurface';
import { ToolsMenu } from './ToolsMenu';
import { StudyView, type ReturnToSource } from './StudyView';
import type { StudySession } from '../domain/studySession';
import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import { loadGame, type GameStatSummary } from '../data/client';
import { shareUrl } from '../data/preferences';
import { boardAt, formatMoveInGame } from '../domain/csa';
import { updateLivePosition } from '../domain/liveFollow';
import { clampPlaybackSeconds, nextPlaybackPly, playbackDelayMs } from '../domain/playback';
import type { ConnectionState, GameSummary, Move, ParsedGame } from '../domain/types';
import { WatchBoard } from './WatchBoard';
import type { BoardPlayers } from './PlayerLabel';
import { LocalEvaluation } from './LocalEvaluation';
import type { PanelSnapshot } from '../engine/isolation';
import { toEnginePosition } from '../domain/localEvaluation';
import { loadAnalysisEnabled, saveAnalysisEnabled } from '../data/analysisPreferences';
import { playPieceSound } from '../data/pieceSound';
import { positionKey, strictInitial } from '../domain/studyRules';

const SPEEDS = [0.25, 0.5, 1, 2, 3, 5, 10];

interface Props {
  summary: GameSummary;
  stats?: GameStatSummary;
  games: GameSummary[];
  defaultSpeed: number;
  initialPly?: number;
  initialFollowingLatest?: boolean;
  defaultFlipped: boolean;
  pinned: boolean;
  favoriteNames: string[];
  onSelect: (id: string) => void;
  onPin: () => void;
  onFavorite: (name: string) => void;
  onViewed: (id: string) => void;
  onGameFinished?: (game: GameSummary) => void;
  onSpeedChange: (seconds: number) => void;
  onExpand: () => void;
  expanded: boolean;
  boardCount: 1 | 2 | 4;
  fixture: boolean;
  onOrientationChange: (flipped: boolean) => void;
  initialAnalysisEnabled?: boolean;
  onAnalysisSnapshot?: (snapshot: PanelSnapshot) => void;
  onPrepareAnalysis?: (signal?: AbortSignal) => Promise<boolean>;
  suspended?: boolean;
  initialGame?: ParsedGame;
  onResumeStudy?: () => void;
  onStudy?: (game: ParsedGame, ply: number, snapshot: PanelSnapshot, move:Move, isCurrent:()=>boolean) => Promise<boolean>;
  sound?: boolean;
  study?: StudySession;
  onStudyChange?: (session: StudySession) => void;
  onReturnStudy?: (target?: ReturnToSource) => Promise<void>;
  onSound?: () => void;
  onDialogChange?: (id: string, open: boolean) => void;
  settingsRequest?: number;
}

export function GamePanel(props: Props) {
  const onViewed = props.onViewed;
  const reportFinished = useEffectEvent((game:GameSummary) => props.onGameFinished?.(game));

  const [game, setGame] = useState<ParsedGame | undefined>(props.initialGame);
  const gameRef = useRef(game);
  useEffect(() => { gameRef.current = game; },[game]);
  const [ply, setPly] = useState(props.initialPly ?? Number.MAX_SAFE_INTEGER);
  const [followingLatest, setFollowingLatest] = useState(() => props.initialFollowingLatest
    ?? (props.initialPly === undefined || props.initialPly === Number.MAX_SAFE_INTEGER));
  const [flipped, setFlipped] = useState(props.defaultFlipped);
  const recordOwner='watch:'+props.summary.id;
  const [dialogOpen,setDialogOpen] = useState(()=>hasRecordRecovery(recordOwner));
  const [detailTab,setDetailTab] = useState<DetailTab>('record');
  const [headerTarget,setHeaderTarget] = useState<HTMLDivElement | null>(null);
  const [detailsTarget,setDetailsTarget] = useState<HTMLDivElement | null>(null);
  const heldFollowing = useRef<boolean | undefined>(undefined);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(props.defaultSpeed);
  const [connection, setConnection] = useState<ConnectionState>('connecting');
  const [fetchedAt, setFetchedAt] = useState<Date>();
  const [newMoves, setNewMoves] = useState(false);
  const [shareMessage, setShareMessage] = useState('');
  const [watchNotice,setWatchNotice] = useState('');
  const [analysisEnabled, setAnalysisEnabled] = useState(() => props.initialAnalysisEnabled !== false && loadAnalysisEnabled(props.summary.id));
  const changeAnalysisEnabled = (enabled: boolean) => { saveAnalysisEnabled(props.summary.id, enabled); setAnalysisEnabled(enabled); };
  const failures = useRef(0);
  const lastPly = useRef(ply);
  const followingRef = useRef(followingLatest);
  const gameLengthRef = useRef(0);

  const changeFollowing = useCallback((following: boolean) => {
    followingRef.current = following;
    setFollowingLatest(following);
  }, []);

  useEffect(() => {
    onViewed(props.summary.id);
  }, [props.summary.id, onViewed]);

  useEffect(() => {
    lastPly.current = ply;
  }, [ply]);

  useEffect(() => {
    if (props.suspended) return;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();
    const poll = async () => {
      try {
        const result = await loadGame(props.summary, controller.signal);
        if (controller.signal.aborted) return;
        const failureCount = result.fixture ? failures.current + 1 : 0;
        failures.current = failureCount;
        const fetchedGame = result.fixture && gameRef.current ? gameRef.current : result.game;
        const nextLength = fetchedGame.moveList.length;
        const update = updateLivePosition(lastPly.current, gameLengthRef.current, nextLength, followingRef.current);
        setGame(fetchedGame);
        setPly(update.ply);
        const hasNewMoves = gameLengthRef.current > 0 && update.hasNewMoves;
        if (followingRef.current && gameLengthRef.current > 0 && nextLength > gameLengthRef.current) playPieceSound(Boolean(props.sound));
        setNewMoves((current) => followingRef.current ? false : current || hasNewMoves);
        lastPly.current = update.ply;
        gameLengthRef.current = nextLength;
        setConnection(result.fixture ? failureCount >= 5 ? 'paused' : 'offline' : result.stale ? 'stale' : 'online');
        setFetchedAt(result.fetchedAt);
        if (!result.fixture && !result.stale && !fetchedGame.live) reportFinished(fetchedGame);
      } catch {
        if (controller.signal.aborted) return;
        failures.current += 1;
        setConnection(failures.current >= 5 ? 'paused' : 'stale');
      } finally {
        if (!controller.signal.aborted && !props.fixture && (props.summary.live || gameRef.current?.live)) {
          const delay = Math.min(120_000, 30_000 * 2 ** Math.min(failures.current, 2));
          timeout = setTimeout(poll, document.hidden ? Math.max(120_000, delay) : delay);
        }
      }
    };
    void poll();
    return () => { controller.abort(); if (timeout) clearTimeout(timeout); };
  }, [props.summary, props.suspended, props.sound, props.fixture]);

  const maxPly = game?.moveList.length ?? 0;
  const safePly = Math.min(ply, maxPly);
  const board = useMemo(() => game ? boardAt(game, safePly) : undefined, [game, safePly]);
  const enginePosition = useMemo(() => game ? toEnginePosition(game, safePly) : '', [game, safePly]);
  const studyUnavailable = useMemo(() => {
    if (!game) return '棋譜を取得中です';
    try { if (positionKey(strictInitial(game.sourceText)) !== positionKey(game.initial)) return '初期局面と棋譜が一致しません'; }
    catch (error) { return (error as Error).message; }
  },[game]);
  const onAnalysisSnapshot = props.onAnalysisSnapshot;
  useEffect(() => {
    onAnalysisSnapshot?.({ summary: props.summary, pinned: props.pinned, ply: game ? safePly : ply, flipped, enabled: analysisEnabled, followingLatest, speed, game });
  }, [onAnalysisSnapshot, props.summary, props.pinned, safePly, ply, game, flipped, analysisEnabled, followingLatest, speed]);

  useEffect(() => {
    if (!playing || !game || props.suspended) return;
    if (safePly >= maxPly) return;
    const timer = setTimeout(() => {
      const next = nextPlaybackPly(lastPly.current, maxPly);
      lastPly.current = next;
      setPly(next);
      playPieceSound(Boolean(props.sound));
      changeFollowing(next >= maxPly);
      if (next >= maxPly) {
        setPlaying(false);
        setNewMoves(false);
      }
    }, playbackDelayMs(speed));
    return () => clearTimeout(timer);
  }, [playing, game, safePly, maxPly, speed, changeFollowing, props.suspended, props.sound]);

  const moveTo = useCallback((next: number, resume = false) => {
    const clamped = Math.max(0, Math.min(maxPly, next));
    setPlaying(false);
    setPly(clamped);
    if (clamped !== lastPly.current) playPieceSound(Boolean(props.sound));
    lastPly.current = clamped;
    changeFollowing(resume);
    if (clamped >= maxPly) setNewMoves(false);
  }, [maxPly, changeFollowing, props.sound]);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if ((event.target as HTMLElement).closest('button, summary, input, select, a')) return;
    if (event.key === 'ArrowLeft') moveTo(safePly - 1);
    else if (event.key === 'ArrowRight') moveTo(safePly + 1);
    else if (event.key === 'Home') moveTo(0);
    else if (event.key === 'End') moveTo(maxPly,true);
    else if (event.key === ' ') setPlaying((value) => !value);
    else return;
    event.preventDefault();
  };

  const copyShare = async () => {
    const url = shareUrl({ game: props.summary.id, ply: safePly, view: props.summary.live ? 'live' : 'archive', boards: props.boardCount, orientation: flipped ? 'white' : 'black' });
    try { await navigator.clipboard.writeText(url); setShareMessage('URLをコピーしました'); }
    catch { setShareMessage(url); }
  };

  const snapshot = (): PanelSnapshot => ({ summary:props.summary, pinned:props.pinned, ply:safePly, flipped, enabled:analysisEnabled, followingLatest, speed, game });

  const openDetails = (tab: DetailTab) => {
    setPlaying(false);
    if (!dialogOpen) { heldFollowing.current=followingRef.current; changeFollowing(false); }
    setDetailTab(tab); setDialogOpen(true); props.onDialogChange?.(props.summary.id,true);
  };
  const closeDetails = (restore = true) => {
    setDialogOpen(false); props.onDialogChange?.(props.summary.id,false);
    if (restore && heldFollowing.current !== undefined) {
      changeFollowing(heldFollowing.current);
      if (heldFollowing.current) { const latest=gameRef.current?.moveList.length ?? maxPly; setPly(latest); lastPly.current=latest; setNewMoves(false); }
    }
    heldFollowing.current=undefined;
  };
  const onDialogChange=props.onDialogChange, summaryId=props.summary.id;
  useEffect(() => { if(dialogOpen)onDialogChange?.(summaryId,true); return () => onDialogChange?.(summaryId,false); },[onDialogChange,summaryId,dialogOpen]);
  const requestSettings=useEffectEvent(() => { if (!props.study) openDetails('settings'); });
  const lastSettingsRequest=useRef(props.settingsRequest);
  useEffect(() => { if (props.settingsRequest && props.settingsRequest !== lastSettingsRequest.current) requestSettings(); lastSettingsRequest.current=props.settingsRequest; },[props.settingsRequest]);
  const gameMenu = <ToolsMenu disabled={Boolean(props.study)||props.suspended} label={<span>{props.fixture ? 'FIXTURE' : (game ?? props.summary).live ? '● LIVE' : '終局'} · {props.summary.black} vs {props.summary.white}</span>}>
      <label>表示する対局<select aria-label="表示する対局" value={props.summary.id} onChange={event => props.onSelect(event.target.value)}>{props.games.map(item => <option key={item.id} value={item.id}>{item.black} vs {item.white}</option>)}</select></label>
      <button aria-pressed={props.pinned} onClick={props.onPin}>{props.pinned ? 'ピン解除' : 'ピン留め'}</button>
      {props.onResumeStudy && <button onClick={props.onResumeStudy}>前の検討を再開</button>}
      <button onClick={() => moveTo(0)}>最初</button><button onClick={() => moveTo(maxPly,true)}>最新</button>
      <button onClick={props.onExpand}>{props.expanded ? '一覧へ戻る' : '単局拡大'}</button>
      <p>{safePly}手 / {maxPly}手 · {board?.turn === '+' ? '先手番' : '後手番'} · {game?.result ?? (game?.live ? '対局中' : '結果不明')}</p>
      <p>観戦 {formatPeoplePerDay(props.stats?.viewsToday)} · 同時 {formatPeople(props.stats?.concurrent)}</p>
    </ToolsMenu>;
  const players:BoardPlayers={
    '+':{name:props.summary.black,rating:game?.blackRate??props.summary.blackRate,favorite:props.favoriteNames.includes(props.summary.black),onFavorite:()=>props.onFavorite(props.summary.black)},
    '-':{name:props.summary.white,rating:game?.whiteRate??props.summary.whiteRate,favorite:props.favoriteNames.includes(props.summary.white),onFavorite:()=>props.onFavorite(props.summary.white)},
  };
  if (props.study && props.onStudyChange && props.onReturnStudy) return <StudyView settingsRequest={props.settingsRequest} session={props.study} onChange={props.onStudyChange} onReturn={props.onReturnStudy} sound={Boolean(props.sound)} onSound={props.onSound ?? (() => {})} players={players} />;

  const settings = <div className="board-settings">
    <label>再生速度<select value={SPEEDS.includes(speed) ? speed : 'custom'} onChange={event => { if (event.target.value !== 'custom') { const value=Number(event.target.value); setSpeed(value); props.onSpeedChange(value); } }}>{SPEEDS.map(value => <option key={value} value={value}>{value}秒</option>)}<option value="custom">任意</option></select></label>
    <label>任意秒数<input aria-label="任意再生速度（秒）" type="number" min="0.1" max="60" step="0.1" value={speed} onChange={event => { const value=clampPlaybackSeconds(Number(event.target.value)); setSpeed(value); props.onSpeedChange(value); }} /></label>
    <p>観戦の端末解析は約0.5秒ずつ順番に実行します。解析の切替・ライセンスは「読み筋」にあります。</p>
    {props.onSound && <button aria-pressed={props.sound} onClick={props.onSound}>駒音 {props.sound ? 'ON' : 'OFF'}</button>}
    {game?.evaluationsTrusted && <details><summary>CSA評価値</summary><p>AI間で尺度は同じとは限りません。</p><ul>{game.moveList.filter(move => move.evaluation !== undefined).map(move => <li key={move.index}>{move.index}手: {move.evaluation}</li>)}</ul></details>}
  </div>;
  return <BoardSurface label={props.summary.black+' 対 '+props.summary.white} onKeyDown={onKeyDown}
    caption={gameMenu}
    captionActions={<><button className="context-share" onClick={copyShare}>共有</button>{shareMessage&&<output className="sr-message share-result" aria-live="polite">{shareMessage}</output>}</>}
    evaluation={board && props.onPrepareAnalysis && <LocalEvaluation board={board} position={enginePosition} enabled={analysisEnabled} onEnabledChange={changeAnalysisEnabled} onPrepare={props.onPrepareAnalysis} suspended={props.suspended} detailsTarget={detailsTarget} onDetails={() => openDetails('analysis')} />}
    board={board ? <WatchBoard board={board} revision={props.summary.id+'|'+safePly+'|'+enginePosition} flipped={flipped} players={players} lastMove={safePly ? game?.moveList[safePly-1] : undefined} disabled={!props.onStudy||Boolean(studyUnavailable)||Boolean(props.suspended)} onNotice={setWatchNotice} onMove={async(move,isCurrent)=>{if(!game||!props.onStudy)return false;return props.onStudy(game,safePly,snapshot(),move,isCurrent);}}/> : <div className="loading" role="status">棋譜を読み込んでいます…</div>}
    status={!followingLatest ? <><span>{watchNotice||(newMoves ? '本譜に新しい指し手があります' : '過去の局面を表示中')}</span><button onClick={() => moveTo(maxPly,true)}>最新</button></> : <span>{watchNotice||'最新手に追従中'}</span>}
    controls={<BoardControls onFlip={() => { setFlipped(!flipped); props.onOrientationChange(!flipped); }} current={safePly && game ? formatMoveInGame(game,safePly) : '開始局面'} ply={safePly} max={maxPly} onPrevious={() => moveTo(safePly-1)} onNext={() => moveTo(safePly+1)} onCurrent={() => openDetails('record')} onSeek={next => moveTo(next)} action={playing ? '停止' : '再生'} onAction={() => setPlaying(!playing)} disabled={!game || props.suspended} previousDisabled={safePly === 0} nextDisabled={safePly === maxPly} />}
    footer={<div className="connection"><span className={'dot '+connection} aria-hidden="true" />接続: {connectionLabel(connection)}<span>取得 {fetchedAt ? fetchedAt.toLocaleTimeString('ja-JP') : '—'}</span></div>}
    modal={<DetailPanel open={dialogOpen} tab={detailTab} onHeaderTarget={setHeaderTarget} onClose={() => closeDetails()}>
      <div className="record-pane" hidden={detailTab !== 'record'}>{game && <RecordAnalysisPanel recordSelector={<div className="record-kind" role="group" aria-label="棋譜の種類"><button aria-pressed="true">本譜</button><button disabled title="盤面の駒を動かすと変化を作成できます">変化</button></div>} headerTarget={headerTarget} owner={recordOwner} game={game} ply={safePly} active={dialogOpen && detailTab === 'record' && !props.suspended} onPrepare={props.onPrepareAnalysis} onPick={(next,record) => { if(record.id===game.id && positionKey(record.initial)===positionKey(game.initial) && record.moveList.slice(0,next).every((m,i)=>m.raw===game.moveList[i]?.raw)) { moveTo(next); closeDetails(false); } }} />}</div>
      <div hidden={detailTab !== 'analysis'} ref={setDetailsTarget} className="unified-analysis" />
      <div hidden={detailTab !== 'settings'}>{settings}</div>
    </DetailPanel>} />;
}

function connectionLabel(state: ConnectionState): string { return { connecting:'接続中',online:'オンライン',stale:'stale',offline:'fixture',paused:'再接続待ち' }[state]; }
function formatPeoplePerDay(value: number | undefined): string { return typeof value === 'number' && Number.isFinite(value) ? value.toLocaleString('ja-JP')+'人/日' : '-'; }
function formatPeople(value: number | undefined): string { return typeof value === 'number' && Number.isFinite(value) ? value.toLocaleString('ja-JP')+'人' : '-'; }
