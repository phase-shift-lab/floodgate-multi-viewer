import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { loadGame } from '../data/client';
import { shareUrl } from '../data/preferences';
import { boardAt, formatFinalReason, formatMoveInGame, formatMoveSource } from '../domain/csa';
import { updateLivePosition } from '../domain/liveFollow';
import { clampPlaybackSeconds, nextPlaybackPly, playbackDelayMs } from '../domain/playback';
import { rateLabel } from '../domain/selection';
import type { ConnectionState, GameSummary, ParsedGame } from '../domain/types';
import { ShogiBoard } from './ShogiBoard';

const SPEEDS = [0.25, 0.5, 1, 2, 3, 5, 10];

interface Props {
  summary: GameSummary;
  games: GameSummary[];
  defaultSpeed: number;
  initialPly?: number;
  defaultFlipped: boolean;
  pinned: boolean;
  favoriteNames: string[];
  onSelect: (id: string) => void;
  onPin: () => void;
  onFavorite: (name: string) => void;
  onViewed: (id: string) => void;
  onSpeedChange: (seconds: number) => void;
  onExpand: () => void;
  expanded: boolean;
  boardCount: 1 | 2 | 4;
  fixture: boolean;
  onOrientationChange: (flipped: boolean) => void;
}

export function GamePanel(props: Props) {
  const onViewed = props.onViewed;
  const [game, setGame] = useState<ParsedGame>();
  const [ply, setPly] = useState(props.initialPly ?? Number.MAX_SAFE_INTEGER);
  const [flipped, setFlipped] = useState(props.defaultFlipped);
  const [movesOpen, setMovesOpen] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(props.defaultSpeed);
  const [connection, setConnection] = useState<ConnectionState>('connecting');
  const [fetchedAt, setFetchedAt] = useState<Date>();
  const [newMoves, setNewMoves] = useState(false);
  const [shareMessage, setShareMessage] = useState('');
  const failures = useRef(0);
  const lastPly = useRef(ply);
  const followingRef = useRef(true);
  const gameLengthRef = useRef(0);
  const currentMoveRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    onViewed(props.summary.id);
  }, [props.summary.id, onViewed]);

  useEffect(() => {
    lastPly.current = ply;
  }, [ply]);

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();
    followingRef.current = props.initialPly === undefined;
    const poll = async () => {
      try {
        const result = await loadGame(props.summary, controller.signal);
        const failureCount = result.fixture ? failures.current + 1 : 0;
        failures.current = failureCount;
        const nextLength = result.game.moveList.length;
        const update = updateLivePosition(lastPly.current, gameLengthRef.current, nextLength, followingRef.current);
        setGame(result.game);
        setPly(update.ply);
        setNewMoves((current) => followingRef.current ? false : current || update.hasNewMoves);
        lastPly.current = update.ply;
        gameLengthRef.current = nextLength;
        setConnection(result.fixture ? failureCount >= 5 ? 'paused' : 'offline' : result.stale ? 'stale' : 'online');
        setFetchedAt(result.fetchedAt);
        if (props.summary.live && !result.fixture) timeout = setTimeout(poll, 30_000);
      } catch {
        if (controller.signal.aborted) return;
        failures.current += 1;
        setConnection(failures.current >= 5 ? 'paused' : 'stale');
      }
    };
    void poll();
    return () => { controller.abort(); if (timeout) clearTimeout(timeout); };
  }, [props.summary, props.initialPly]);

  const maxPly = game?.moveList.length ?? 0;
  const safePly = Math.min(ply, maxPly);
  const board = useMemo(() => game ? boardAt(game, safePly) : undefined, [game, safePly]);
  const moveLabels = useMemo(() => game ? game.moveList.map((move) => ({
    move,
    label: formatMoveInGame(game, move.index),
    source: formatMoveSource(move),
  })) : [], [game]);
  const finalReason = useMemo(() => game ? formatFinalReason(game) : undefined, [game]);

  useEffect(() => {
    if (!playing || !game) return;
    if (safePly >= maxPly) return;
    const timer = setTimeout(() => setPly((value) => {
      const next = nextPlaybackPly(value, maxPly);
      lastPly.current = next;
      followingRef.current = next >= maxPly;
      if (next >= maxPly) {
        setPlaying(false);
        setNewMoves(false);
      }
      return next;
    }), playbackDelayMs(speed));
    return () => clearTimeout(timer);
  }, [playing, game, safePly, maxPly, speed]);

  const moveTo = useCallback((next: number, keepPlaying = false) => {
    const clamped = Math.max(0, Math.min(maxPly, next));
    if (!keepPlaying) setPlaying(false);
    setPly(clamped);
    lastPly.current = clamped;
    followingRef.current = clamped >= maxPly;
    if (clamped >= maxPly) setNewMoves(false);
  }, [maxPly]);

  useEffect(() => {
    if (!movesOpen) return;
    currentMoveRef.current?.scrollIntoView({ block: 'nearest' });
  }, [movesOpen, safePly]);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return;
    if (event.key === 'ArrowLeft') moveTo(safePly - 1);
    else if (event.key === 'ArrowRight') moveTo(safePly + 1);
    else if (event.key === 'Home') moveTo(0);
    else if (event.key === 'End') moveTo(maxPly);
    else if (event.key === ' ') setPlaying((value) => !value);
    else return;
    event.preventDefault();
  };

  const copyShare = async () => {
    const url = shareUrl({ game: props.summary.id, ply: safePly, view: props.summary.live ? 'live' : 'archive', boards: props.boardCount, orientation: flipped ? 'white' : 'black' });
    try { await navigator.clipboard.writeText(url); setShareMessage('URLをコピーしました'); }
    catch { setShareMessage(url); }
  };

  return (
    <article className={`game-panel ${props.expanded ? 'expanded' : ''}`} tabIndex={0} onKeyDown={onKeyDown} aria-label={`${props.summary.black} 対 ${props.summary.white}`}>
      <header className="game-header">
        <div className="game-selector-row">
          <select aria-label="表示する対局" value={props.summary.id} onChange={(event) => props.onSelect(event.target.value)}>
            {props.games.map((item) => <option key={item.id} value={item.id}>{item.live ? '●' : '○'} {item.black} vs {item.white}</option>)}
          </select>
          <span className={`badge ${props.summary.live && !props.fixture ? 'live' : ''}`}>{props.fixture ? 'FIXTURE' : props.summary.live ? 'LIVE' : '終局'}</span>
          <button type="button" aria-pressed={props.pinned} onClick={props.onPin}>{props.pinned ? 'ピン解除' : 'ピン留め'}</button>
        </div>
      </header>

      <div className="players">
        <div><button className="star" aria-label={`${props.summary.black}をお気に入り${props.favoriteNames.includes(props.summary.black) ? '解除' : '登録'}`} onClick={() => props.onFavorite(props.summary.black)}>{props.favoriteNames.includes(props.summary.black) ? '★' : '☆'}</button><strong title={props.summary.black}>▲ {props.summary.black}</strong><span>{rateLabel(game?.blackRate ?? props.summary.blackRate)}</span></div>
        <div><button className="star" aria-label={`${props.summary.white}をお気に入り${props.favoriteNames.includes(props.summary.white) ? '解除' : '登録'}`} onClick={() => props.onFavorite(props.summary.white)}>{props.favoriteNames.includes(props.summary.white) ? '★' : '☆'}</button><strong title={props.summary.white}>△ {props.summary.white}</strong><span>{rateLabel(game?.whiteRate ?? props.summary.whiteRate)}</span></div>
      </div>

      <div className="meta-row" aria-live="polite">
        <span>{safePly}手 / {maxPly}手</span>
        <span>手番 {board?.turn === '+' ? '先手' : '後手'}</span>
        <span>{game?.result ?? (game?.live ? '対局中' : '結果不明')}</span>
      </div>

      <div className="last-move-text" aria-live="polite"><strong>直前手</strong><span>{safePly ? moveLabels[safePly - 1]?.label : '開始局面'}</span></div>

      {board ? <ShogiBoard state={board} flipped={flipped} lastMove={safePly ? game?.moveList[safePly - 1] : undefined} /> : <div className="loading" role="status">棋譜を読み込んでいます…</div>}

      <div className="top-control-shelf">
        {newMoves && <div className="new-moves">新しい指し手があります <button onClick={() => moveTo(maxPly)}>最新局面へ</button></div>}
        <div className="panel-actions">
          <button onClick={() => setFlipped((value) => { const next = !value; props.onOrientationChange(next); return next; })}>盤面反転</button>
          <button onClick={props.onExpand}>{props.expanded ? '一覧へ戻る' : '単局拡大'}</button>
          <button aria-expanded={movesOpen} onClick={() => setMovesOpen((value) => !value)}>棋譜{movesOpen ? 'を閉じる' : 'を表示'}</button>
          <button onClick={copyShare}>共有</button>
        </div>
        <div className="replay" aria-label="棋譜再生操作">
          <button aria-label="最初" onClick={() => moveTo(0)}>⏮</button>
          <button className="step-button" aria-label="1手戻る" onClick={() => moveTo(safePly - 1)}>◀</button>
          <button aria-label={playing ? '停止' : '再生'} onClick={() => setPlaying((value) => !value)}>{playing ? '停止' : '再生'}</button>
          <button className="step-button" aria-label="1手進む" onClick={() => moveTo(safePly + 1)}>▶</button>
          <button aria-label="最後" onClick={() => moveTo(maxPly)}>⏭</button>
          <input aria-label="手数" type="range" min="0" max={maxPly} value={safePly} onChange={(event) => moveTo(Number(event.target.value))} />
          <span className="replay-status" aria-label="現在手数">{safePly} / {maxPly}手</span>
        </div>
        {shareMessage && <output className="sr-message">{shareMessage}</output>}
        <details className="panel-details">
          <summary>詳細設定</summary>
          <div className="replay-settings">
            <label>再生速度
              <select value={SPEEDS.includes(speed) ? speed : 'custom'} onChange={(event) => {
                if (event.target.value !== 'custom') { const value = Number(event.target.value); setSpeed(value); props.onSpeedChange(value); }
              }}>
                {SPEEDS.map((value) => <option key={value} value={value}>{value}秒</option>)}
                <option value="custom">任意</option>
              </select>
            </label>
            <label className="custom-speed">任意秒数<input aria-label="任意再生速度（秒）" type="number" min="0.1" max="60" step="0.1" value={speed} onChange={(event) => { const value = clampPlaybackSeconds(Number(event.target.value)); setSpeed(value); props.onSpeedChange(value); }} /></label>
          </div>
          {game?.evaluationsTrusted && <details className="evaluations"><summary>CSA評価値</summary><p>評価値の尺度はAI間で同じとは限りません。</p><ul>{game.moveList.filter((move) => move.evaluation !== undefined).map((move) => <li key={move.index}>{move.index}手: {move.evaluation}</li>)}</ul></details>}
        </details>
        <div className="connection">
          <span className={`dot ${connection}`} aria-hidden="true" />接続: {connectionLabel(connection)}
          <span>取得 {fetchedAt ? fetchedAt.toLocaleTimeString('ja-JP') : '—'}</span>
          {connection === 'paused' && <span>更新停止（自動再試行中）</span>}
        </div>
      </div>

      {movesOpen && game && <ol className="move-list" aria-label="棋譜">
        {moveLabels.map(({ move, label, source }) => <li key={move.index}><button ref={safePly === move.index ? currentMoveRef : undefined} aria-current={safePly === move.index ? 'step' : undefined} title={source ? `移動元 ${source}` : undefined} onClick={() => moveTo(move.index)}>{move.index}. {label}{source ? ` ${source}` : ''}{move.time !== undefined ? ` (${move.time}秒)` : ''}</button></li>)}
        {finalReason && <li className="move-result"><span>{game.moveList.length + 1}. {finalReason}</span></li>}
      </ol>}
    </article>
  );
}

function connectionLabel(state: ConnectionState): string {
  return { connecting: '接続中', online: 'オンライン', stale: 'stale', offline: 'fixture', paused: '更新停止' }[state];
}
