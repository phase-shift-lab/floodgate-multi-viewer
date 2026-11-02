import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadGame, type GameResult } from '../data/client';
import { fixtureGames, fixtureSummaries } from '../data/fixtures';
import type { PanelSnapshot } from '../engine/isolation';
import { GamePanel } from './GamePanel';
import { playPieceSound } from '../data/pieceSound';

vi.mock('../data/client', () => ({ loadGame: vi.fn() }));
vi.mock('../data/pieceSound', () => ({ playPieceSound:vi.fn() }));

function resultAt(ply: number): GameResult {
  return { game: { ...fixtureGames[0], live: true, moveList: fixtureGames[0].moveList.slice(0, ply), moves: ply }, fixture: false, stale: false, fetchedAt: new Date() };
}

function panelProps() {
  return {
    summary: { ...fixtureSummaries[0], live: true }, games: fixtureSummaries,
    defaultSpeed: 1, defaultFlipped: false, pinned: false, favoriteNames: [],
    onSelect: vi.fn(), onPin: vi.fn(), onFavorite: vi.fn(), onViewed: vi.fn(),
    onSpeedChange: vi.fn(), onExpand: vi.fn(), onOrientationChange: vi.fn(),
    onAnalysisSnapshot: vi.fn<(value: PanelSnapshot) => void>(),
    expanded: false, boardCount: 1 as const, fixture: false, initialAnalysisEnabled: false,
  };
}

async function flushLoad() { await act(async () => { await Promise.resolve(); }); }
async function pollNext(ply: number) {
  vi.mocked(loadGame).mockResolvedValue(resultAt(ply));
  await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
}

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  vi.mocked(loadGame).mockReset().mockResolvedValue(resultAt(2));
  vi.mocked(playPieceSound).mockReset();
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('GamePanel live following', () => {
  it('opens the score sheet from the current move, selects without entering study and retains favorites',async()=>{
    Object.defineProperty(HTMLElement.prototype,'scrollIntoView',{configurable:true,value:vi.fn()});
    const props=panelProps(),onStudy=vi.fn(); render(<GamePanel {...props} onStudy={onStudy} />); await flushLoad();
    expect(screen.queryByRole('group',{name:'表示モード'})).toBeNull();
    fireEvent.click(screen.getByRole('button',{name:props.summary.black+'をお気に入り登録'}));
    expect(props.onFavorite).toHaveBeenCalledWith(props.summary.black);
    fireEvent.click(screen.getByRole('button',{name:'棋譜を開く'}));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:/^1\./}));
    expect(screen.getByLabelText('現在手数')).toHaveTextContent('1 / 2手');
    expect(screen.queryByRole('dialog')).toBeNull(); expect(onStudy).not.toHaveBeenCalled();
  });
  it('holds the displayed position while the popup is open and restores following only on cancel',async()=>{
    const props=panelProps(); render(<GamePanel {...props} />); await flushLoad();
    fireEvent.click(screen.getByRole('button',{name:'棋譜を開く'}));
    await pollNext(3); expect(screen.getByLabelText('現在手数')).toHaveTextContent('2 / 3手');
    fireEvent.click(screen.getByRole('button',{name:'閉じる'}));
    expect(screen.getByLabelText('現在手数')).toHaveTextContent('3 / 3手');
    fireEvent.click(screen.getByRole('button',{name:'棋譜を開く'}));
    fireEvent.click(screen.getByRole('button',{name:/^3\./}));
    await pollNext(4); expect(screen.getByLabelText('現在手数')).toHaveTextContent('3 / 4手');
    expect(props.onAnalysisSnapshot).toHaveBeenLastCalledWith(expect.objectContaining({followingLatest:false}));
  });
  it('sounds only for incoming followed moves, not initial load or updates while viewing past moves',async()=>{
    render(<GamePanel {...panelProps()} sound />); await flushLoad(); expect(playPieceSound).not.toHaveBeenCalled();
    await pollNext(3); expect(playPieceSound).toHaveBeenCalledWith(true);
    fireEvent.click(screen.getByRole('button',{name:'1手戻る'}));vi.mocked(playPieceSound).mockClear();
    await pollNext(4);expect(playPieceSound).not.toHaveBeenCalled();
  });
  it('suspends live polling for study, then keeps prior same-game data on failed fetch', async () => {
    const props=panelProps(), view=render(<GamePanel {...props} />); await flushLoad();
    fireEvent.click(screen.getByRole('button',{name:'1手戻る'}));
    const loaded=vi.mocked(loadGame).mock.calls.length;
    view.rerender(<GamePanel {...props} suspended />); await act(async()=>{await vi.advanceTimersByTimeAsync(60_000);});
    expect(vi.mocked(loadGame).mock.calls.length).toBe(loaded);
    vi.mocked(loadGame).mockResolvedValue({...resultAt(16),fixture:true});
    view.rerender(<GamePanel {...props} suspended={false} />); await flushLoad();
    expect(screen.getByLabelText('現在手数')).toHaveTextContent('1 / 2手');
  });
  it.each([
    { name: '通常観戦', initialPly: undefined, initialFollowingLatest: undefined },
    { name: '最新手の復元', initialPly: 2, initialFollowingLatest: true },
    { name: '取得前の最新手指定', initialPly: Number.MAX_SAFE_INTEGER, initialFollowingLatest: undefined },
  ])('$nameでは新着手へ追従する', async (initial) => {
    const props = panelProps();
    render(<GamePanel {...props} initialPly={initial.initialPly} initialFollowingLatest={initial.initialFollowingLatest} />);
    await flushLoad();
    expect(screen.getByLabelText('現在手数')).toHaveTextContent('2 / 2手');
    await pollNext(3);
    expect(screen.getByLabelText('現在手数')).toHaveTextContent('3 / 3手');
    expect(screen.queryByText('本譜に新しい指し手があります')).not.toBeInTheDocument();
    expect(props.onAnalysisSnapshot).toHaveBeenLastCalledWith(expect.objectContaining({ ply: 3, followingLatest: true }));
  });

  it('過去手を一覧更新でも維持し、最新局面へ戻ると追従を再開する', async () => {
    const props = panelProps();
    const view = render(<GamePanel {...props} />);
    await flushLoad();
    fireEvent.click(screen.getByRole('button', { name: '1手戻る' }));
    vi.mocked(loadGame).mockResolvedValue(resultAt(3));
    view.rerender(<GamePanel {...props} summary={{ ...props.summary, moves: 3 }} />);
    await flushLoad();
    expect(screen.getByLabelText('現在手数')).toHaveTextContent('1 / 3手');
    expect(screen.getByText('本譜に新しい指し手があります')).toBeInTheDocument();
    expect(props.onAnalysisSnapshot).toHaveBeenLastCalledWith(expect.objectContaining({ ply: 1, followingLatest: false }));
    fireEvent.click(screen.getByRole('button', { name: '最新へ' }));
    await pollNext(4);
    expect(screen.getByLabelText('現在手数')).toHaveTextContent('4 / 4手');
    vi.mocked(loadGame).mockResolvedValue(resultAt(5));
    view.rerender(<GamePanel {...props} summary={{ ...props.summary, moves: 5 }} />);
    await flushLoad();
    expect(screen.getByLabelText('現在手数')).toHaveTextContent('5 / 5手');
    expect(screen.queryByText('本譜に新しい指し手があります')).not.toBeInTheDocument();
  });

  it('共有URLなどの明示した過去手は自動で動かさない', async () => {
    render(<GamePanel {...panelProps()} initialPly={1} />);
    await flushLoad();
    await pollNext(3);
    expect(screen.getByLabelText('現在手数')).toHaveTextContent('1 / 3手');
  });

  it('同じ最新手で最後ボタンを押しても、追従の再開を復元データへ反映する', async () => {
    const props = panelProps();
    const view = render(<GamePanel {...props} initialPly={2} initialFollowingLatest={false} />);
    await flushLoad();
    fireEvent.click(screen.getByRole('button', { name: '最新へ' }));
    const saved = props.onAnalysisSnapshot.mock.calls.at(-1)![0];
    expect(saved).toMatchObject({ ply: 2, followingLatest: true });
    view.unmount();
    vi.mocked(loadGame).mockResolvedValue(resultAt(3));
    render(<GamePanel {...props} initialPly={saved.ply} initialFollowingLatest={saved.followingLatest} />);
    await flushLoad();
    expect(screen.getByLabelText('現在手数')).toHaveTextContent('3 / 3手');
  });

  it('再生で最新手に到達した後も新着へ追従する', async () => {
    render(<GamePanel {...panelProps()} initialPly={0} initialFollowingLatest={false} />);
    await flushLoad();
    fireEvent.click(screen.getByRole('button', { name: '再生' }));
    for (let step = 0; step < 2; step++) {
      await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
    }
    expect(screen.getByLabelText('現在手数')).toHaveTextContent('2 / 2手');
    await pollNext(3);
    expect(screen.getByLabelText('現在手数')).toHaveTextContent('3 / 3手');
  });

  it('一覧更新で中止された取得の遅い応答を反映しない', async () => {
    let finishOld!: (value: GameResult) => void;
    vi.mocked(loadGame).mockImplementationOnce(() => new Promise((resolve) => { finishOld = resolve; }));
    const props = panelProps();
    const view = render(<GamePanel {...props} />);
    vi.mocked(loadGame).mockResolvedValue(resultAt(3));
    view.rerender(<GamePanel {...props} summary={{ ...props.summary, moves: 3 }} />);
    await flushLoad();
    await act(async () => { finishOld(resultAt(2)); });
    expect(screen.getByLabelText('現在手数')).toHaveTextContent('3 / 3手');
  });
});
