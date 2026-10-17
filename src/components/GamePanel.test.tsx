import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadGame, type GameResult } from '../data/client';
import { fixtureGames, fixtureSummaries } from '../data/fixtures';
import type { PanelSnapshot } from '../engine/isolation';
import { GamePanel } from './GamePanel';

vi.mock('../data/client', () => ({ loadGame: vi.fn() }));

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
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('GamePanel live following', () => {
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
    expect(screen.queryByText('新しい指し手があります')).not.toBeInTheDocument();
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
    expect(screen.getByText('新しい指し手があります')).toBeInTheDocument();
    expect(props.onAnalysisSnapshot).toHaveBeenLastCalledWith(expect.objectContaining({ ply: 1, followingLatest: false }));
    fireEvent.click(screen.getByRole('button', { name: '最新局面へ' }));
    await pollNext(4);
    expect(screen.getByLabelText('現在手数')).toHaveTextContent('4 / 4手');
    vi.mocked(loadGame).mockResolvedValue(resultAt(5));
    view.rerender(<GamePanel {...props} summary={{ ...props.summary, moves: 5 }} />);
    await flushLoad();
    expect(screen.getByLabelText('現在手数')).toHaveTextContent('5 / 5手');
    expect(screen.queryByText('新しい指し手があります')).not.toBeInTheDocument();
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
    fireEvent.click(screen.getByRole('button', { name: '最後' }));
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
