let sharedAudioCtx: AudioContext | null = null;
let noiseBuffer: AudioBuffer | null = null;
let musicTimer: number | null = null;
let currentTrack: 'NONE' | 'LOBBY' | 'COUNTDOWN' = 'NONE';
let stepIndex = 0;

function getAudioCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  if (!sharedAudioCtx) {
    sharedAudioCtx = new Ctx();
  }
  return sharedAudioCtx;
}

export function isAudioReady(): boolean {
  const ctx = getAudioCtx();
  return Boolean(ctx && ctx.state === 'running');
}

export async function unlockGameAudio(): Promise<boolean> {
  try {
    const ctx = getAudioCtx();
    if (!ctx) return false;
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }
    return ctx.state === 'running';
  } catch {
    return false;
  }
}

function getNoiseBuffer(ctx: AudioContext): AudioBuffer {
  if (noiseBuffer && noiseBuffer.sampleRate === ctx.sampleRate) {
    return noiseBuffer;
  }
  const length = Math.floor(ctx.sampleRate * 0.12);
  const buf = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < length; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  noiseBuffer = buf;
  return buf;
}

function playKick(ctx: AudioContext, time: number, gainVal = 0.22): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(145, time);
  osc.frequency.exponentialRampToValueAtTime(42, time + 0.11);
  gain.gain.setValueAtTime(gainVal, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.13);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(time);
  osc.stop(time + 0.14);
}

function playHiHat(ctx: AudioContext, time: number, gainVal = 0.05): void {
  const src = ctx.createBufferSource();
  src.buffer = getNoiseBuffer(ctx);
  const filter = ctx.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.setValueAtTime(6500, time);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(gainVal, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.05);
  src.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  src.start(time);
  src.stop(time + 0.055);
}

function playSynthNote(
  ctx: AudioContext,
  freq: number,
  time: number,
  duration: number,
  type: OscillatorType,
  gainVal: number,
): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, time);
  gain.gain.setValueAtTime(0.001, time);
  gain.gain.linearRampToValueAtTime(gainVal, time + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.001, time + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(time);
  osc.stop(time + duration + 0.01);
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
    playSynthNote(ctx, freq, ctx.currentTime + delaySec, durationSec, type, gainValue);
  } catch {
    // Ignore when autoplay is blocked
  }
}

export function stopBackgroundMusic(): void {
  if (musicTimer !== null) {
    window.clearInterval(musicTimer);
    musicTimer = null;
  }
  currentTrack = 'NONE';
  stepIndex = 0;
}

// Upbeat 124 BPM Kahoot-style Lobby Groove (Kick + Hi-hat + Bass + Arpeggio)
export function startLobbyMusic(): void {
  if (currentTrack === 'LOBBY') return;
  stopBackgroundMusic();
  currentTrack = 'LOBBY';
  const bassNotes = [130.81, 0, 164.81, 0, 196.0, 0, 164.81, 196.0, 146.83, 0, 174.61, 0, 220.0, 0, 196.0, 174.61];
  const leadNotes = [523.25, 659.25, 783.99, 659.25, 587.33, 698.46, 880.0, 783.99];

  musicTimer = window.setInterval(() => {
    try {
      const ctx = getAudioCtx();
      if (!ctx || ctx.state !== 'running') return;
      const t = ctx.currentTime + 0.02;
      const step = stepIndex % 16;

      if (step % 4 === 0) playKick(ctx, t, 0.16);
      if (step % 2 === 1) playHiHat(ctx, t, 0.035);

      const bass = bassNotes[step];
      if (bass > 0) playSynthNote(ctx, bass, t, 0.18, 'triangle', 0.09);

      if (step % 2 === 0) {
        const lead = leadNotes[(step / 2) % leadNotes.length];
        playSynthNote(ctx, lead, t, 0.14, 'sine', 0.045);
      }
      stepIndex++;
    } catch {
      // Ignore
    }
  }, 240);
}

// Driving Countdown Pulse during QUESTION_ACTIVE
export function startCountdownMusic(): void {
  if (currentTrack === 'COUNTDOWN') return;
  stopBackgroundMusic();
  currentTrack = 'COUNTDOWN';
  const pulseNotes = [146.83, 146.83, 174.61, 146.83, 196.0, 146.83, 220.0, 196.0];

  musicTimer = window.setInterval(() => {
    try {
      const ctx = getAudioCtx();
      if (!ctx || ctx.state !== 'running') return;
      const t = ctx.currentTime + 0.02;
      const step = stepIndex % 8;
      if (step % 2 === 0) playKick(ctx, t, 0.14);
      playHiHat(ctx, t, step % 2 === 1 ? 0.045 : 0.02);
      playSynthNote(ctx, pulseNotes[step], t, 0.14, 'sawtooth', 0.032);
      stepIndex++;
    } catch {
      // Ignore
    }
  }, 250);
}

export function playTickSound(urgent = false): void {
  playTone(urgent ? 1174.66 : 880, 0.09, 'triangle', urgent ? 0.1 : 0.06);
}

export function playPlayerJoinSound(): void {
  playTone(587.33, 0.08, 'sine', 0.07, 0);
  playTone(880, 0.11, 'sine', 0.07, 0.06);
}

export function playIntroWhoosh(): void {
  playTone(392, 0.1, 'triangle', 0.07, 0);
  playTone(523.25, 0.1, 'triangle', 0.07, 0.08);
  playTone(659.25, 0.16, 'triangle', 0.08, 0.16);
}

export function playRevealSound(): void {
  playTone(523.25, 0.14, 'sine', 0.09, 0);
  playTone(659.25, 0.14, 'sine', 0.09, 0.09);
  playTone(783.99, 0.22, 'triangle', 0.09, 0.18);
}

export function playCorrectSound(): void {
  playTone(523.25, 0.1, 'sine', 0.09, 0);
  playTone(659.25, 0.1, 'sine', 0.09, 0.07);
  playTone(1046.5, 0.22, 'triangle', 0.1, 0.14);
}

export function playWrongSound(): void {
  playTone(220, 0.16, 'sawtooth', 0.05, 0);
  playTone(174.61, 0.24, 'sawtooth', 0.05, 0.12);
}

export function playStreakSound(): void {
  playTone(659.25, 0.09, 'triangle', 0.08, 0);
  playTone(783.99, 0.09, 'triangle', 0.08, 0.07);
  playTone(987.77, 0.09, 'triangle', 0.08, 0.14);
  playTone(1318.5, 0.22, 'triangle', 0.09, 0.21);
}

export function playPowerUpSound(): void {
  playTone(440, 0.08, 'sine', 0.08, 0);
  playTone(659.25, 0.08, 'sine', 0.08, 0.06);
  playTone(880, 0.08, 'sine', 0.08, 0.12);
  playTone(1174.66, 0.2, 'triangle', 0.1, 0.18);
}

export function playPodiumSound(): void {
  playTone(261.63, 0.4, 'triangle', 0.08, 0);
  playTone(523.25, 0.15, 'triangle', 0.09, 0);
  playTone(659.25, 0.15, 'triangle', 0.09, 0.14);
  playTone(783.99, 0.15, 'triangle', 0.09, 0.28);
  playTone(1046.5, 0.45, 'triangle', 0.11, 0.42);
  playTone(783.99, 0.45, 'sine', 0.07, 0.42);
}

export function playWheelTick(): void {
  playTone(1350, 0.028, 'triangle', 0.09);
}

export function playDrumroll(durationMs = 1100): void {
  const steps = Math.max(6, Math.floor(durationMs / 75));
  for (let i = 0; i < steps; i++) {
    playTone(165 + (i % 2) * 25, 0.05, 'triangle', 0.05, (i * 75) / 1000);
  }
}

export function playBalloonPop(): void {
  try {
    const ctx = getAudioCtx();
    if (!ctx) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = getNoiseBuffer(ctx);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.24, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
    src.connect(gain);
    gain.connect(ctx.destination);
    src.start(t);
    src.stop(t + 0.1);
  } catch {
    // Ignore
  }
}

export function playRaceStartHorn(): void {
  playTone(440, 0.14, 'sawtooth', 0.06, 0);
  playTone(440, 0.14, 'sawtooth', 0.06, 0.28);
  playTone(659.25, 0.35, 'sawtooth', 0.08, 0.56);
}

export function playWinnerFanfare(): void {
  playPodiumSound();
}
