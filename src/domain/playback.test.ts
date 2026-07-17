import { clampPlaybackSeconds, nextPlaybackPly, playbackDelayMs } from './playback';

describe('playback timer rules', () => {
  it('supports presets and clamps custom delay to 0.1 through 60 seconds', () => {
    expect(playbackDelayMs(0.25)).toBe(250);
    expect(clampPlaybackSeconds(0)).toBe(0.1);
    expect(clampPlaybackSeconds(100)).toBe(60);
    expect(clampPlaybackSeconds(Number.NaN)).toBe(1);
  });

  it('advances one ply without passing the end', () => {
    expect(nextPlaybackPly(4, 10)).toBe(5);
    expect(nextPlaybackPly(10, 10)).toBe(10);
  });
});
