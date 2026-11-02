import type { GameSummary, ParsedGame, ViewerSettings } from '../domain/types';
import { disableAutomaticAnalysis } from '../data/analysisPreferences';

export interface PanelSnapshot { summary: GameSummary; pinned: boolean; ply: number; flipped: boolean; enabled: boolean; followingLatest?: boolean; speed?: number; game?: ParsedGame }
export interface AnalysisRecovery { slots: PanelSnapshot[]; view: 'live' | 'archive'; expanded?: number; at: number; settings?: ViewerSettings }
const KEY = 'fgmv:analysis-reload:v1';
const MARKER = 'fgmv:analysis-preparation:v2';
const BLOCKED = 'fgmv:analysis-preparation-failed:v2';
interface PreparationMarker { schema: 2; purpose: 'watch' | 'study'; studySessionId?: string; nonce: string; attempt: 1; at: number }
function consumeMarker(): PreparationMarker | undefined {
  try {
    const raw = sessionStorage.getItem(MARKER);
    sessionStorage.removeItem(MARKER);
    if (!raw) return;
    const value = JSON.parse(raw) as PreparationMarker;
    // Consumed attempts never silently become new automatic attempts, even after a manual reload.
    if (!globalThis.crossOriginIsolated) sessionStorage.setItem(BLOCKED, '1');
    if (value.schema !== 2 || value.attempt !== 1 || typeof value.nonce !== 'string' || !['watch','study'].includes(value.purpose) || !Number.isFinite(value.at) || Date.now()-value.at < 0 || Date.now()-value.at > 120_000) return;
    if (performance.getEntriesByType('navigation').some((entry) => (entry as PerformanceNavigationTiming).type === 'reload')) return value;
  } catch { /* No automatic restoration on unverified navigation. */ }
}
export const preparationRecovery = consumeMarker();

function readRecovery(): AnalysisRecovery | undefined {
  try {
    const raw = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    if (!raw) return;
    const value = JSON.parse(raw) as AnalysisRecovery;
    const age = Date.now() - value.at;
    if (!Number.isFinite(value.at) || age < 0 || age > 120_000 || !Array.isArray(value.slots) || value.slots.length > 4) return;
    if (!value.slots.every((slot) => typeof slot.summary?.id === 'string' && Number.isFinite(slot.ply)
      && (slot.followingLatest === undefined || typeof slot.followingLatest === 'boolean'))) return;
    return value;
  } catch { return; }
}

// Retain across React StrictMode's double initialization, but consume on navigation.
export const analysisRecovery = readRecovery();
const workerUrl = new URL(`${import.meta.env.BASE_URL}analysis-isolation-sw.js`, location.origin).href;

let preparation: Promise<boolean> | undefined;
let preparationPhase: 'idle' | 'preparing' | 'awaiting-reload' | 'ready' | 'failed' = 'idle';
export function retryAnalysisPreparation(): void {
  if (preparationPhase === 'preparing' || preparationPhase === 'awaiting-reload') return;
  preparation = undefined; preparationPhase = 'idle';
  try { sessionStorage.removeItem(BLOCKED); } catch { /* prepare reports storage failure. */ }
}
export function prepareAnalysis(recovery: Omit<AnalysisRecovery, 'at'>, studySessionId?: string, signal?: AbortSignal): Promise<boolean> {
  if (globalThis.crossOriginIsolated) { preparationPhase = 'ready'; return Promise.resolve(true); }
  preparation ??= prepareOnce(recovery,studySessionId,signal).catch((error) => { preparationPhase = 'failed'; throw error; });
  return preparation;
}

async function prepareOnce(recovery: Omit<AnalysisRecovery, 'at'>, studySessionId?: string, signal?: AbortSignal): Promise<boolean> {
  const checkCancelled = () => { if (signal?.aborted) throw new Error('解析準備を取り消しました。ONまたは再解析で再試行できます。'); };
  checkCancelled();
  if (globalThis.crossOriginIsolated) return true;
  if (!isSecureContext || !('serviceWorker' in navigator)) throw new Error('このブラウザーでは端末解析を利用できません。');
  if (sessionStorage.getItem(BLOCKED)) throw new Error('解析用の配信設定を有効にできませんでした。解析をONにし直すか、再試行してください。');
  preparationPhase = 'preparing';
  const registrations = await navigator.serviceWorker.getRegistrations();
  checkCancelled();
  const scope = new URL(import.meta.env.BASE_URL, location.origin).href;
  if (registrations.some((item) => item.scope === scope && (item.active ?? item.waiting ?? item.installing)?.scriptURL !== workerUrl)) {
    throw new Error('別のService Workerがあるため、解析用設定を追加できません。');
  }
  const registration = await navigator.serviceWorker.register(workerUrl, { scope: import.meta.env.BASE_URL });
  checkCancelled();
  await new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => { cleanup(); reject(new Error('解析用設定の準備がタイムアウトしました。')); }, 15_000);
    const check = () => { if (navigator.serviceWorker.controller?.scriptURL === workerUrl) { cleanup(); resolve(); } };
    const abort = () => { cleanup(); reject(new Error('解析準備を取り消しました')); };
    const cleanup = () => { clearTimeout(timeout); navigator.serviceWorker.removeEventListener('controllerchange', check); signal?.removeEventListener('abort',abort); };
    navigator.serviceWorker.addEventListener('controllerchange', check);
    signal?.addEventListener('abort',abort,{once:true});
    if (signal?.aborted) { abort(); return; }
    if (registration.active) check();
  });
  checkCancelled();
  sessionStorage.setItem(KEY, JSON.stringify({ ...recovery, at: Date.now() }));
  sessionStorage.setItem(MARKER, JSON.stringify({ schema:2, purpose:studySessionId ? 'study' : 'watch', studySessionId, nonce:crypto.randomUUID(), attempt:1, at:Date.now() } satisfies PreparationMarker));
  preparationPhase = 'awaiting-reload';
  location.reload();
  return false;
}

export async function removeAnalysisSetup(): Promise<void> {
  disableAutomaticAnalysis();
  const registrations = await navigator.serviceWorker.getRegistrations();
  for (const registration of registrations) {
    if ((registration.active ?? registration.waiting ?? registration.installing)?.scriptURL === workerUrl) await registration.unregister();
  }
  sessionStorage.removeItem(KEY);
  sessionStorage.removeItem(MARKER);
  sessionStorage.removeItem(BLOCKED);
  location.reload();
}

export function hasAnalysisSetup(): boolean {
  return navigator.serviceWorker?.controller?.scriptURL === workerUrl;
}
