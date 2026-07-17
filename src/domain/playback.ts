export function clampPlaybackSeconds(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(60, Math.max(0.1, value));
}

export function playbackDelayMs(seconds: number): number {
  return clampPlaybackSeconds(seconds) * 1_000;
}

export function nextPlaybackPly(current: number, maximum: number): number {
  return Math.min(Math.max(0, maximum), Math.max(0, current) + 1);
}
