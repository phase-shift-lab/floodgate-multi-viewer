import type { GameSummary } from './types';

const CSA_NAME = /([^/"'<>]+\.csa)(?:[?#][^"'<>]*)?$/i;

function dateFromId(id: string): string {
  const raw = id.match(/(\d{8})(\d{6})/);
  return raw ? `${raw[1].slice(0, 4)}-${raw[1].slice(4, 6)}-${raw[1].slice(6, 8)}T${raw[2].slice(0, 2)}:${raw[2].slice(2, 4)}:${raw[2].slice(4, 6)}+09:00` : '';
}

function decode(value: string): string {
  try { return decodeURIComponent(value); } catch { return value; }
}

export function summaryFromCsaName(fileName: string, context = ''): GameSummary | null {
  const clean = decode(fileName.replace(/\.csa$/i, ''));
  const fields = clean.split('+');
  if (fields.length < 4) return null;
  const stamp = fields.at(-1) ?? '';
  if (!/^\d{14}$/.test(stamp)) return null;
  const black = fields.at(-3) ?? '先手不明';
  const white = fields.at(-2) ?? '後手不明';
  const group = fields.slice(1, -3).join('+') || fields[0] || 'floodgate';
  const resultMatch = context.match(/(?:result|結果)\s*[:：]?\s*([^|\s<]+)/i);
  const movesMatch = context.match(/(?:moves?|手数)\s*[:：]?\s*(\d+)/i);
  const live = !/(?:TORYO|SENNICHITE|JISHOGI|blackwin|whitewin|先手勝|後手勝|draw|finished|終局)/i.test(context);
  return {
    id: clean,
    group,
    black,
    white,
    startedAt: dateFromId(clean),
    live,
    result: resultMatch?.[1],
    moves: movesMatch ? Number(movesMatch[1]) : undefined,
    csaPath: fileName,
  };
}

export function parseGameListHtml(html: string): GameSummary[] {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const seen = new Set<string>();
  const games: GameSummary[] = [];
  for (const anchor of doc.querySelectorAll<HTMLAnchorElement>('a[href]')) {
    const href = anchor.getAttribute('href') ?? '';
    const matched = href.match(CSA_NAME);
    if (!matched) continue;
    const container = anchor.closest('li.gameitem, tr') ?? anchor.parentElement;
    const summary = summaryFromCsaName(matched[1], container?.textContent ?? '');
    if (summary && !seen.has(summary.id)) {
      const moves = container?.querySelector('.gi-moves')?.textContent?.trim();
      const upstreamResult = container?.querySelector('.gi-result')?.textContent?.trim().toLowerCase();
      if (moves && /^\d+$/.test(moves)) summary.moves = Number(moves);
      if (upstreamResult) {
        summary.live = false;
        summary.result = upstreamResult === 'blackwin' ? '先手勝ち'
          : upstreamResult === 'whitewin' ? '後手勝ち'
            : upstreamResult === 'draw' ? '引き分け' : upstreamResult;
      }
      seen.add(summary.id);
      games.push(summary);
    }
  }
  return games.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

export function parsePlayerRatingsHtml(html: string): Map<string, number> {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const ratings = new Map<string, number>();
  for (const row of doc.querySelectorAll('tr')) {
    const cells = [...row.querySelectorAll('td,th')].map((cell) => cell.textContent?.trim() ?? '');
    if (cells.length < 2) continue;
    const rateIndex = cells.findIndex((cell) => /^-?\d{3,5}(?:\.\d+)?$/.test(cell));
    if (rateIndex > 0) ratings.set(cells[rateIndex - 1], Number(cells[rateIndex]));
  }
  const text = doc.body.textContent ?? '';
  for (const match of text.matchAll(/([^\s:：]+)\s*[:：]\s*(-?\d{3,5}(?:\.\d+)?)/g)) {
    ratings.set(match[1], Number(match[2]));
  }
  return ratings;
}

export function attachRatings(games: GameSummary[], ratings: Map<string, number>): GameSummary[] {
  return games.map((game) => ({
    ...game,
    blackRate: game.blackRate ?? ratings.get(game.black),
    whiteRate: game.whiteRate ?? ratings.get(game.white),
  }));
}
