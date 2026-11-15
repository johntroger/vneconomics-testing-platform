let sharedAudioCtx: AudioContext | null = null;

function getAudioCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  if (!sharedAudioCtx) {
    sharedAudioCtx = new Ctx();
  }
  if (sharedAudioCtx.state === 'suspended') {
    void sharedAudioCtx.resume().catch(() => {});
  }
  return sharedAudioCtx;
}

function playTone(
  freq: number,
  durationSec: number,
  type: OscillatorType = 'sine',
  gainValue = 0.08,
  delaySec = 0,
): void {
  try {
    const ctx = getAudioCtx();
    if (!ctx) return;
    const now = ctx.currentTime + delaySec;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    gain.gain.setValueAtTime(gainValue, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + durationSec);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + durationSec);
  } catch {
    // Ignore audio errors when autoplay is blocked
  }
}

export function playTickSound(): void {
  playTone(880, 0.08, 'triangle', 0.06);
}

export function playRevealSound(): void {
  playTone(523.25, 0.14, 'sine', 0.08, 0);
  playTone(659.25, 0.18, 'sine', 0.08, 0.1);
}

export function playPodiumSound(): void {
  playTone(523.25, 0.16, 'triangle', 0.09, 0);
  playTone(659.25, 0.16, 'triangle', 0.09, 0.12);
  playTone(783.99, 0.16, 'triangle', 0.09, 0.24);
  playTone(1046.5, 0.35, 'triangle', 0.1, 0.36);
}
