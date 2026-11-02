const KEY = 'fgmv:piece-sound:v1';
let context: AudioContext | undefined;
export function loadPieceSound(): boolean { try { return localStorage.getItem(KEY) === 'on'; } catch { return false; } }
export function savePieceSound(on: boolean): void {
  try { localStorage.setItem(KEY,on ? 'on' : 'off'); } catch { /* Current session still works. */ }
  if (on) void unlockSound();
}
async function unlockSound(): Promise<void> {
  try { context ??= new AudioContext(); if (context.state === 'suspended') await context.resume(); } catch { /* Sound is optional. */ }
}
/** Short synthesized wooden click: no downloads, third-party samples, or autoplay. */
export function playPieceSound(on: boolean): void {
  if (!on || document.hidden) return;
  void unlockSound().then(() => {
    if (!context || context.state !== 'running') return;
    const buffer = context.createBuffer(1,Math.ceil(context.sampleRate*.045),context.sampleRate);
    const channel = buffer.getChannelData(0);
    for (let i=0;i<channel.length;i++) channel[i] = (Math.random()*2-1)*Math.exp(-i/(context.sampleRate*.007));
    const source = context.createBufferSource(), filter = context.createBiquadFilter(), gain = context.createGain();
    source.buffer = buffer; filter.type = 'bandpass'; filter.frequency.value=1900; filter.Q.value=.7; gain.gain.value=.3;
    source.connect(filter); filter.connect(gain); gain.connect(context.destination); source.start();
    source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); };
  }).catch(() => { /* A blocked audio context must not block moves. */ });
}
