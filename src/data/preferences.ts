import { BOARD_COUNTS, type BoardCount, type ViewerSettings } from '../domain/types';

const SETTINGS_KEY = 'fgmv:settings:v1';
const SETTINGS_MIGRATION_KEY = 'fgmv:settings:migrated:auto-switch-finished-default-on';
const FAVORITES_KEY = 'fgmv:favorites:v1';
const RECENT_KEY = 'fgmv:recent:v1';
const ARCHIVE_FILTERS_KEY = 'fgmv:archive-filters:v1';
const STATS_SESSION_KEY = 'fgmv:stats-session:v1';
const STATS_SESSION_PATTERN = /^[a-zA-Z0-9_-]{8,80}$/;

export const DEFAULT_SETTINGS: ViewerSettings = {
  boardCount: typeof matchMedia === 'function' && matchMedia('(max-width: 767px)').matches ? 1 : 3,
  playbackSeconds: 1,
  orientation: 'black',
  theme: 'dark',
  autoSwitchFinished: true,
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
  const autoSwitchFinished = localStorage.getItem(SETTINGS_MIGRATION_KEY)
    ? value.autoSwitchFinished
    : DEFAULT_SETTINGS.autoSwitchFinished;
  if (!localStorage.getItem(SETTINGS_MIGRATION_KEY)) {
    localStorage.setItem(SETTINGS_MIGRATION_KEY, '1');
  }
  return {
    ...DEFAULT_SETTINGS,
    ...value,
    boardCount: BOARD_COUNTS.includes(value.boardCount) ? value.boardCount : DEFAULT_SETTINGS.boardCount,
    playbackSeconds: Math.min(60, Math.max(0.1, Number(value.playbackSeconds) || 1)),
    autoSwitchFinished,
  };
}

export function saveSettings(settings: ViewerSettings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export interface ArchiveFilters {
  query:string; group:string; historyDate:string; minRate:string; maxRate:string;
  resultFilter:'all'|'live'|'finished'|'先手'|'後手';
  sort:'new'|'high'|'low'; favoriteOnly:boolean;
}
export const DEFAULT_ARCHIVE_FILTERS:ArchiveFilters = {
  query:'',group:'all',historyDate:'',minRate:'',maxRate:'',resultFilter:'all',sort:'new',favoriteOnly:false,
};

export function loadArchiveFilters():ArchiveFilters {
  try {
    const raw:unknown=JSON.parse(localStorage.getItem(ARCHIVE_FILTERS_KEY)??'{}');
    const value=raw&&typeof raw==='object'&&!Array.isArray(raw)?raw as Record<string,unknown>:{};
    const text=(key:string)=>typeof value[key]==='string'?(value[key] as string).slice(0,200):'';
    const rate=(key:string)=>{const value=text(key).trim();return value&&Number.isFinite(Number(value))?value:'';};
    const date=text('historyDate');
    return {
      query:text('query'),group:text('group')||'all',
      historyDate:/^\d{4}-\d{2}-\d{2}$/.test(date)&&Number.isFinite(Date.parse(date))&&new Date(date).toISOString().slice(0,10)===date?date:'',
      minRate:rate('minRate'),maxRate:rate('maxRate'),
      resultFilter:['all','live','finished','先手','後手'].includes(text('resultFilter'))?text('resultFilter') as ArchiveFilters['resultFilter']:'all',
      sort:['new','high','low'].includes(text('sort'))?text('sort') as ArchiveFilters['sort']:'new',
      favoriteOnly:value.favoriteOnly===true,
    };
  }catch{return {...DEFAULT_ARCHIVE_FILTERS};}
}

export function saveArchiveFilters(filters:ArchiveFilters):boolean {
  try {localStorage.setItem(ARCHIVE_FILTERS_KEY,JSON.stringify(filters));return true;}
  catch{return false;}
}

export function loadFavorites(): string[] { return read<string[]>(FAVORITES_KEY, []); }
export function saveFavorites(names: string[]): void { localStorage.setItem(FAVORITES_KEY, JSON.stringify([...new Set(names)])); }
export function loadRecent(): string[] { return read<string[]>(RECENT_KEY, []); }
export function addRecent(id: string): string[] {
  const next = [id, ...loadRecent().filter((value) => value !== id)].slice(0, 20);
  localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  return next;
}

export function getStatsSessionId(): string {
  const existing = localStorage.getItem(STATS_SESSION_KEY);
  if (existing && STATS_SESSION_PATTERN.test(existing)) return existing;
  const generated = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `s_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;
  localStorage.setItem(STATS_SESSION_KEY, generated);
  return generated;
}

export interface ShareState { game?: string; ply?: number; view?: 'live' | 'archive'; boards?: BoardCount; orientation?: 'black' | 'white' }

export function readShareState(search = location.search): ShareState {
  const params = new URLSearchParams(search);
  const boards = Number(params.get('boards'));
  return {
    game: params.get('game') ?? undefined,
    ply: params.has('ply') ? Math.max(0, Number(params.get('ply'))) : undefined,
    view: params.get('view') === 'archive' ? 'archive' : params.get('view') === 'live' ? 'live' : undefined,
    boards: BOARD_COUNTS.includes(boards as BoardCount) ? boards as BoardCount : undefined,
    orientation: params.get('orientation') === 'white' ? 'white' : params.get('orientation') === 'black' ? 'black' : undefined,
  };
}

export function shareUrl(state: ShareState): string {
  const url = new URL(location.href);
  url.search = '';
  if (state.game) url.searchParams.set('game', state.game);
  if (state.ply !== undefined) url.searchParams.set('ply', String(state.ply));
  if (state.view) url.searchParams.set('view', state.view);
  if (state.boards) url.searchParams.set('boards', String(state.boards));
  if (state.orientation) url.searchParams.set('orientation', state.orientation);
  return url.toString();
}
