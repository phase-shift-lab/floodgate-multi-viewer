import type { GameSummary } from '../domain/types';
import { disableAutomaticAnalysis } from '../data/analysisPreferences';

export interface PanelSnapshot { summary: GameSummary; pinned: boolean; ply: number; flipped: boolean; enabled: boolean; followingLatest?: boolean }
export interface AnalysisRecovery { slots: PanelSnapshot[]; view: 'live' | 'archive'; expanded?: number; at: number }
const KEY = 'fgmv:analysis-reload:v1';

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
export function prepareAnalysis(recovery: Omit<AnalysisRecovery, 'at'>): Promise<boolean> {
  if (globalThis.crossOriginIsolated) return Promise.resolve(true);
  preparation ??= prepareOnce(recovery);
  return preparation;
}

async function prepareOnce(recovery: Omit<AnalysisRecovery, 'at'>): Promise<boolean> {
  if (globalThis.crossOriginIsolated) return true;
  if (!isSecureContext || !('serviceWorker' in navigator)) throw new Error('このブラウザーでは端末解析を利用できません。');
  if (analysisRecovery) throw new Error('解析用の配信設定を有効にできませんでした。「解析用設定を解除」後にご確認ください。');
  const registrations = await navigator.serviceWorker.getRegistrations();
  const scope = new URL(import.meta.env.BASE_URL, location.origin).href;
  if (registrations.some((item) => item.scope === scope && (item.active ?? item.waiting ?? item.installing)?.scriptURL !== workerUrl)) {
    throw new Error('別のService Workerがあるため、解析用設定を追加できません。');
  }
  const registration = await navigator.serviceWorker.register(workerUrl, { scope: import.meta.env.BASE_URL });
  await new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => { cleanup(); reject(new Error('解析用設定の準備がタイムアウトしました。')); }, 15_000);
    const check = () => { if (navigator.serviceWorker.controller?.scriptURL === workerUrl) { cleanup(); resolve(); } };
    const cleanup = () => { clearTimeout(timeout); navigator.serviceWorker.removeEventListener('controllerchange', check); };
    navigator.serviceWorker.addEventListener('controllerchange', check);
    if (registration.active) check();
  });
  sessionStorage.setItem(KEY, JSON.stringify({ ...recovery, at: Date.now() }));
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
  location.reload();
}

export function hasAnalysisSetup(): boolean {
  return navigator.serviceWorker?.controller?.scriptURL === workerUrl;
}
