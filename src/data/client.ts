import type { GameSummary, ParsedGame } from '../domain/types';
import { fixtureGame, fixtureSummaries } from './fixtures';

export const STATIC_MODE = true;

export class DataError extends Error {
  constructor(message: string, readonly status?: number) { super(message); }
}

export interface CatalogResult { games: GameSummary[]; stale: boolean; fixture: boolean; fetchedAt: Date }
export interface GameResult { game: ParsedGame; stale: boolean; fixture: boolean; fetchedAt: Date }

export async function loadCatalog(signal: AbortSignal): Promise<CatalogResult> {
  if (signal.aborted) throw signal.reason;
  return { games: fixtureSummaries, stale: false, fixture: true, fetchedAt: new Date() };
}

export async function loadDay(date: string, signal: AbortSignal): Promise<CatalogResult> {
  void date;
  if (signal.aborted) throw signal.reason;
  return { games: fixtureSummaries, stale: false, fixture: true, fetchedAt: new Date() };
}

export async function loadGame(summary: GameSummary, signal: AbortSignal): Promise<GameResult> {
  if (signal.aborted) throw signal.reason;
  return { game: fixtureGame(summary), stale: false, fixture: true, fetchedAt: new Date() };
}

export function pollDelay(failures: number, hidden: boolean): number {
  const base = hidden ? 20_000 : 3_000;
  return Math.min(60_000, base * 2 ** Math.min(failures, 4));
}
