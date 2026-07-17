import type { ViewerSettings } from '../domain/types';

const SETTINGS_KEY = 'fgmv:settings:v1';
const FAVORITES_KEY = 'fgmv:favorites:v1';
const RECENT_KEY = 'fgmv:recent:v1';

export const DEFAULT_SETTINGS: ViewerSettings = {
  boardCount: typeof matchMedia === 'function' && matchMedia('(max-width: 767px)').matches ? 1 : 4,
  playbackSeconds: 1,
  orientation: 'black',
  theme: 'system',
  autoSwitchFinished: false,
};

function read<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(key);
    if (!value) return fallback;
    const parsed: unknown = JSON.parse(value);
    if (Array.isArray(fallback)) {
      return (Array.isArray(parsed) ? parsed : fallback) as T;
    }
    if (typeof fallback === 'object' && fallback !== null && typeof parsed === 'object' && parsed !== null) {
      return { ...fallback, ...parsed };
    }
    return parsed as T;
  } catch { return fallback; }
}

export function loadSettings(): ViewerSettings {
  const value = read(SETTINGS_KEY, DEFAULT_SETTINGS);
  return {
    ...DEFAULT_SETTINGS,
    ...value,
    boardCount: [1, 2, 4].includes(value.boardCount) ? value.boardCount : DEFAULT_SETTINGS.boardCount,
    playbackSeconds: Math.min(60, Math.max(0.1, Number(value.playbackSeconds) || 1)),
  };
}

export function saveSettings(settings: ViewerSettings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export function loadFavorites(): string[] { return read<string[]>(FAVORITES_KEY, []); }
export function saveFavorites(names: string[]): void { localStorage.setItem(FAVORITES_KEY, JSON.stringify([...new Set(names)])); }
export function loadRecent(): string[] { return read<string[]>(RECENT_KEY, []); }
export function addRecent(id: string): string[] {
  const next = [id, ...loadRecent().filter((value) => value !== id)].slice(0, 20);
  localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  return next;
}

export interface ShareState { game?: string; ply?: number; view?: 'live' | 'archive'; boards?: 1 | 2 | 4 }

export function readShareState(search = location.search): ShareState {
  const params = new URLSearchParams(search);
  const boards = Number(params.get('boards'));
  return {
    game: params.get('game') ?? undefined,
    ply: params.has('ply') ? Math.max(0, Number(params.get('ply'))) : undefined,
    view: params.get('view') === 'archive' ? 'archive' : params.get('view') === 'live' ? 'live' : undefined,
    boards: [1, 2, 4].includes(boards) ? boards as 1 | 2 | 4 : undefined,
  };
}

export function shareUrl(state: ShareState): string {
  const url = new URL(location.href);
  url.search = '';
  if (state.game) url.searchParams.set('game', state.game);
  if (state.ply !== undefined) url.searchParams.set('ply', String(state.ply));
  if (state.view) url.searchParams.set('view', state.view);
  if (state.boards) url.searchParams.set('boards', String(state.boards));
  return url.toString();
}
