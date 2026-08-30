import { parseCsa } from '../domain/csa';
import { attachRatings, parseGameListHtml, parsePlayerRatingsHtml } from '../domain/html';
import type { GameSummary, ParsedGame } from '../domain/types';
import { fixtureGame, fixtureSummaries } from './fixtures';

const configuredBase = (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, '');
export const API_BASE = configuredBase ?? '';
export const STATIC_MODE = !API_BASE;

export class DataError extends Error {
  constructor(message: string, readonly status?: number) { super(message); }
}

export interface CatalogResult { games: GameSummary[]; stale: boolean; fixture: boolean; fetchedAt: Date }
export interface GameResult { game: ParsedGame; stale: boolean; fixture: boolean; fetchedAt: Date }
export interface GameStatSummary { viewsToday: number; concurrent: number }
export interface ViewerStats { available: boolean; day: string; pageViewsToday: number; games: Record<string, GameStatSummary> }

async function fetchText(path: string, signal: AbortSignal, attempts = 2): Promise<{ text: string; stale: boolean }> {
  if (!API_BASE) throw new DataError('LIVE中継が未設定です');
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(`${API_BASE}${path}`, { signal, headers: { Accept: 'text/plain,text/html' } });
      if (!response.ok) throw new DataError(`中継API ${response.status}`, response.status);
      return { text: await response.text(), stale: response.headers.get('x-fgmv-stale') === '1' };
    } catch (error) {
      lastError = error;
      if (signal.aborted || (error instanceof DataError && error.status && error.status < 500 && error.status !== 429)) throw error;
      if (attempt + 1 < attempts) await new Promise((resolve) => setTimeout(resolve, 300 * 2 ** attempt));
    }
  }
  throw lastError instanceof Error ? lastError : new DataError('LIVE中継の取得に失敗しました');
}

function localDate(date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

async function loadRatedCatalog(path: string, date: string, signal: AbortSignal): Promise<CatalogResult> {
  const [catalog, rating] = await Promise.allSettled([
    fetchText(path, signal),
    fetchText(`/api/ratings?date=${encodeURIComponent(date)}`, signal, 1),
  ]);
  if (catalog.status === 'rejected') throw catalog.reason;
  const parsed = parseGameListHtml(catalog.value.text);
  if (!parsed.length) throw new DataError('対局一覧が空です');
  return {
    games: rating.status === 'fulfilled' ? attachRatings(parsed, parsePlayerRatingsHtml(rating.value.text)) : parsed,
    stale: catalog.value.stale || (rating.status === 'fulfilled' && rating.value.stale),
    fixture: false,
    fetchedAt: new Date(),
  };
}

export async function loadCatalog(signal: AbortSignal): Promise<CatalogResult> {
  try { return await loadRatedCatalog('/api/today', localDate(), signal); }
  catch (error) {
    if (signal.aborted) throw error;
    return { games: fixtureSummaries, stale: true, fixture: true, fetchedAt: new Date() };
  }
}

export async function loadDay(date: string, signal: AbortSignal): Promise<CatalogResult> {
  try { return await loadRatedCatalog(`/api/day?date=${encodeURIComponent(date)}`, date, signal); }
  catch (error) {
    if (signal.aborted) throw error;
    return { games: fixtureSummaries, stale: true, fixture: true, fetchedAt: new Date() };
  }
}

export async function loadGame(summary: GameSummary, signal: AbortSignal): Promise<GameResult> {
  try {
    const response = await fetchText(`/api/csa?file=${encodeURIComponent(summary.csaPath)}`, signal);
    if (!/^V\d+(?:\.\d+)?\s*$/m.test(response.text) || !/^N\+.+$/m.test(response.text) || !/^N-.+$/m.test(response.text)) throw new DataError('CSAではない応答を受信しました');
    return { game: { ...parseCsa(response.text, summary.id), ...summary, sourceText: response.text }, stale: response.stale, fixture: false, fetchedAt: new Date() };
  } catch (error) {
    if (signal.aborted) throw error;
    return { game: fixtureGame(summary), stale: true, fixture: true, fetchedAt: new Date() };
  }
}

async function fetchStats(path: string, init: RequestInit, signal: AbortSignal): Promise<ViewerStats | undefined> {
  if (!API_BASE) return undefined;
  try {
    const headers = new Headers(init.headers);
    headers.set('Accept', 'application/json');
    if (init.body) headers.set('Content-Type', 'application/json');
    const response = await fetch(`${API_BASE}${path}`, { ...init, signal, headers });
    if (!response.ok) return undefined;
    const stats = await response.json() as ViewerStats;
    return stats.available ? stats : undefined;
  } catch (error) {
    if (signal.aborted) throw error;
    return undefined;
  }
}

export function recordPageView(sessionId: string, signal: AbortSignal): Promise<ViewerStats | undefined> {
  return fetchStats('/api/stats/page', { method: 'POST', body: JSON.stringify({ sessionId }) }, signal);
}

export function heartbeatStats(sessionId: string, gameIds: string[], signal: AbortSignal): Promise<ViewerStats | undefined> {
  return fetchStats('/api/stats/heartbeat', { method: 'POST', body: JSON.stringify({ sessionId, gameIds }) }, signal);
}

export function pollDelay(failures: number, hidden: boolean): number {
  const base = hidden ? 20_000 : 3_000;
  return Math.min(60_000, base * 2 ** Math.min(failures, 4));
}
