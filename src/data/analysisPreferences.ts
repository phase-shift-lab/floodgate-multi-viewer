const KEY = 'fgmv:analysis:v1';
interface Preferences { disabled?: boolean; games?: Record<string, boolean> }
function read(): Preferences {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '{}') ?? {}; } catch { return {}; }
}
export function loadAnalysisEnabled(gameId: string): boolean {
  const value = read();
  let sessionDisabled = false;
  try { sessionDisabled = sessionStorage.getItem('fgmv:analysis-disabled') === '1'; } catch { /* Use local preferences. */ }
  return !sessionDisabled && !value.disabled && value.games?.[gameId] !== false;
}
export function saveAnalysisEnabled(gameId: string, enabled: boolean): void {
  const value = read();
  const games = { ...value.games, [gameId]: enabled };
  if (enabled) try { sessionStorage.removeItem('fgmv:analysis-disabled'); } catch { /* Use local preferences. */ }
  try { localStorage.setItem(KEY, JSON.stringify({ disabled: enabled ? false : value.disabled, games })); } catch { /* Session controls still work without storage. */ }
}
export function disableAutomaticAnalysis(): void {
  try { localStorage.setItem(KEY, JSON.stringify({ ...read(), disabled: true })); } catch { /* Use the session fallback. */ }
  try { sessionStorage.setItem('fgmv:analysis-disabled', '1'); } catch { /* Storage may be unavailable. */ }
}
