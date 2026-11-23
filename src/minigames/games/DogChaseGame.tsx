import React, { useEffect, useRef, useState } from 'react';
import type { MinigameProps, RosterStudent } from '../types';
import { cryptoRandomInt } from '../rosterStorage';
import { useMinigameStageSettings, type PaceMode } from '../stageContext';

const MAX_VISIBLE_CROWD = 22;

// Note: keep all drawing self-contained in Canvas 2D for crisp 60fps crowd + parallax street
interface RunnerActor {
  student: RosterStudent;
  x: number;
  y: number;
  baseY: number;
  vx: number;
  phaseOffset: number;
  shirtColor: string;
  hairColor: string;
  skinColor: string;
  isWinner: boolean;
  escapeAt: number; // progress [0..1] when non-winner escapes off-screen right
  treeClimber: boolean;
  escaped: boolean;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  kind: 'TEAR' | 'DUST' | 'SPARK';
  size: number;
  color: string;
}

const SHIRT_COLORS = [
  '#38bdf8',
  '#f472b6',
  '#a78bfa',
  '#34d399',
  '#fbbf24',
  '#fb7185',
  '#60a5fa',
  '#f97316',
];
const HAIR_COLORS = ['#1e293b', '#3f2e21', '#0f172a', '#451a03', '#27272a'];
const SKIN_COLORS = ['#fde68a', '#fed7aa', '#fcd34d', '#ffedd5'];

const TOTAL_MS_BY_PACE: Record<PaceMode, number> = {
  TURBO: 3200,
  FAST: 9000,
  NORMAL: 16500,
  EPIC: 25000,
};

function hashCode(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function shortDisplayName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length <= 2) return fullName.trim();
  return parts.slice(-2).join(' ');
}

function playDogBark(muted: boolean): void {
  if (muted || typeof window === 'undefined') return;
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const now = ctx.currentTime;

    // Two playful low-mid barks ("Gâu! Gâu!")
    [0, 0.19].forEach((offset) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(240, now + offset);
      osc.frequency.exponentialRampToValueAtTime(115, now + offset + 0.13);
      gain.gain.setValueAtTime(0.001, now + offset);
      gain.gain.linearRampToValueAtTime(0.14, now + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.15);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + offset);
      osc.stop(now + offset + 0.16);
    });

    window.setTimeout(() => {
      void ctx.close().catch(() => {});
    }, 600);
  } catch {
    // Ignore audio restrictions
  }
}

export const DogChaseGame: React.FC<MinigameProps> = ({
  students,
  muted,
  onPickStudent,
}) => {
  const { paceMode } = useMinigameStageSettings();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const finishTimerRef = useRef<number | null>(null);

  const [running, setRunning] = useState(false);
  const [statusText, setStatusText] = useState('Sẵn sàng trước cổng trường — Bấm để bắt đầu!');

  // Store latest callbacks/props in refs for animation loop
  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  const onPickRef = useRef(onPickStudent);
  onPickRef.current = onPickStudent;

  const actorsRef = useRef<RunnerActor[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const simRef = useRef<{
    active: boolean;
    startTime: number;
    durationMs: number;
    scrollX: number;
    barked: boolean;
    fakeoutShown: number;
    winner: RosterStudent | null;
    finished: boolean;
  }>({
    active: false,
    startTime: 0,
    durationMs: 16500,
    scrollX: 0,
    barked: false,
    fakeoutShown: 0,
    winner: null,
    finished: false,
  });

  // Build idle preview crowd whenever students change and not running
  useEffect(() => {
    if (simRef.current.active) return;
    const pool = students.slice(0, MAX_VISIBLE_CROWD);
    const cols = Math.max(1, Math.min(8, Math.ceil(pool.length / 3)));
    actorsRef.current = pool.map((st, idx) => {
      const h = hashCode(st.id + st.name);
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      const x = 430 + col * 82 + (row % 2) * 28;
      const baseY = 345 + row * 48;
      return {
        student: st,
        x,
        y: baseY,
        baseY,
        vx: 0,
        phaseOffset: (h % 100) / 15,
        shirtColor: SHIRT_COLORS[h % SHIRT_COLORS.length],
        hairColor: HAIR_COLORS[h % HAIR_COLORS.length],
        skinColor: SKIN_COLORS[h % SKIN_COLORS.length],
        isWinner: false,
        escapeAt: 1,
        treeClimber: false,
        escaped: false,
      };
    });
    particlesRef.current = [];
  }, [students]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      if (finishTimerRef.current !== null) window.clearTimeout(finishTimerRef.current);
    };
  }, []);

  // Main 60fps Canvas Render Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = 1200;
    const H = 560;

    const drawSpeechBubble = (
      x: number,
      y: number,
      text: string,
      bg = '#ffffff',
      fg = '#0f172a',
      scale = 1,
    ) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(scale, scale);
      ctx.font = '800 17px system-ui, -apple-system, sans-serif';
      const padX = 16;
      const metrics = ctx.measureText(text);
      const bw = Math.max(96, metrics.width + padX * 2);
      const bh = 38;
      const rx = -bw / 2;
      const ry = -bh;

      // Shadow
      ctx.fillStyle = 'rgba(15, 23, 42, 0.22)';
      ctx.beginPath();
      ctx.roundRect(rx + 3, ry + 4, bw, bh, 14);
      ctx.fill();

      // Bubble body
      ctx.fillStyle = bg;
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.roundRect(rx, ry, bw, bh, 14);
      ctx.fill();
      ctx.stroke();

      // Pointer tail
      ctx.beginPath();
      ctx.moveTo(-8, 0);
      ctx.lineTo(0, 12);
      ctx.lineTo(8, 0);
      ctx.closePath();
      ctx.fillStyle = bg;
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = fg;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, 0, ry + bh / 2 + 1);
      ctx.restore();
    };

    const drawVietnameseStreet = (scrollX: number) => {
      // Sky gradient
      const sky = ctx.createLinearGradient(0, 0, 0, 340);
      sky.addColorStop(0, '#38bdf8');
      sky.addColorStop(1, '#bae6fd');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, 340);

      // Sun & clouds
      ctx.fillStyle = 'rgba(254, 240, 138, 0.85)';
      ctx.beginPath();
      ctx.arc(1060, 75, 42, 0, Math.PI * 2);
      ctx.fill();

      for (let i = 0; i < 4; i++) {
        const cx = ((i * 340 - scrollX * 0.12) % (W + 240) + W + 240) % (W + 240) - 120;
        const cy = 60 + (i % 2) * 34;
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.beginPath();
        ctx.arc(cx, cy, 24, 0, Math.PI * 2);
        ctx.arc(cx + 22, cy - 8, 28, 0, Math.PI * 2);
        ctx.arc(cx + 48, cy, 22, 0, Math.PI * 2);
        ctx.fill();
      }

      // Repeating Townhouses & School Gate background
      const tileW = 1200;
      const offset = ((scrollX % tileW) + tileW) % tileW;
      for (let rep = -1; rep <= 1; rep++) {
        const ox = rep * tileW - offset;
        if (ox > W || ox + tileW < 0) continue;

        // School wall & gate on left half of tile
        ctx.fillStyle = '#fef08a';
        ctx.fillRect(ox + 20, 190, 520, 135);
        ctx.fillStyle = '#dc2626';
        ctx.fillRect(ox + 20, 182, 520, 12);

        // School Gate pillars
        ctx.fillStyle = '#fde047';
        ctx.strokeStyle = '#92400e';
        ctx.lineWidth = 2;
        ctx.fillRect(ox + 185, 130, 32, 195);
        ctx.strokeRect(ox + 185, 130, 32, 195);
        ctx.fillRect(ox + 395, 130, 32, 195);
        ctx.strokeRect(ox + 395, 130, 32, 195);

        // Gate arch banner
        ctx.fillStyle = '#b91c1c';
        ctx.fillRect(ox + 180, 118, 252, 34);
        ctx.fillStyle = '#fef08a';
        ctx.font = '900 15px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('CỔNG TRƯỜNG ĐẠI HỌC', ox + 306, 140);

        // Iron gate bars
        ctx.strokeStyle = '#1e293b';
        ctx.lineWidth = 3;
        for (let b = 228; b < 390; b += 18) {
          ctx.beginPath();
          ctx.moveTo(ox + b, 170);
          ctx.lineTo(ox + b, 325);
          ctx.stroke();
        }

        // Flamboyant Tree (Cây phượng đỏ)
        ctx.fillStyle = '#78350f';
        ctx.beginPath();
        ctx.moveTo(ox + 95, 325);
        ctx.lineTo(ox + 112, 200);
        ctx.lineTo(ox + 132, 200);
        ctx.lineTo(ox + 142, 325);
        ctx.closePath();
        ctx.fill();
        // Branches
        ctx.strokeStyle = '#78350f';
        ctx.lineWidth = 8;
        ctx.beginPath();
        ctx.moveTo(ox + 120, 215);
        ctx.lineTo(ox + 60, 165);
        ctx.moveTo(ox + 125, 215);
        ctx.lineTo(ox + 185, 160);
        ctx.stroke();
        // Leaves + red flowers
        const foliage = [
          [85, 155, 58, '#16a34a'],
          [145, 145, 64, '#15803d'],
          [115, 120, 56, '#22c55e'],
          [65, 135, 32, '#ef4444'],
          [110, 108, 36, '#dc2626'],
          [158, 132, 34, '#ef4444'],
          [130, 156, 26, '#f87171'],
        ] as const;
        foliage.forEach(([fx, fy, fr, fc]) => {
          ctx.fillStyle = fc;
          ctx.beginPath();
          ctx.arc(ox + fx, fy, fr, 0, Math.PI * 2);
          ctx.fill();
        });

        // Vietnamese Shophouses on right half (ox + 560..1180)
        const houses = [
          { x: 560, w: 140, h: 210, body: '#fbcfe8', roof: '#be185d', sign: 'TRÀ SỮA' },
          { x: 705, w: 150, h: 235, body: '#bbf7d0', roof: '#15803d', sign: 'BÁNH MÌ' },
          { x: 860, w: 145, h: 195, body: '#fed7aa', roof: '#c2410c', sign: 'PHOTOCOPY' },
          { x: 1010, w: 165, h: 225, body: '#c7d2fe', roof: '#4338ca', sign: 'CÀ PHÊ SV' },
        ];
        houses.forEach((hs) => {
          const top = 325 - hs.h;
          ctx.fillStyle = hs.body;
          ctx.strokeStyle = '#334155';
          ctx.lineWidth = 2;
          ctx.fillRect(ox + hs.x, top, hs.w, hs.h);
          ctx.strokeRect(ox + hs.x, top, hs.w, hs.h);

          // Roof
          ctx.fillStyle = hs.roof;
          ctx.fillRect(ox + hs.x - 6, top - 14, hs.w + 12, 18);

          // Windows
          ctx.fillStyle = '#0ea5e9';
          for (let wy = top + 24; wy < 250; wy += 52) {
            ctx.fillRect(ox + hs.x + 18, wy, 36, 34);
            ctx.fillRect(ox + hs.x + hs.w - 54, wy, 36, 34);
          }

          // Signboard
          ctx.fillStyle = '#fef08a';
          ctx.fillRect(ox + hs.x + 14, 258, hs.w - 28, 22);
          ctx.strokeRect(ox + hs.x + 14, 258, hs.w - 28, 22);
          ctx.fillStyle = '#991b1b';
          ctx.font = '800 11px system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(hs.sign, ox + hs.x + hs.w / 2, 273);
        });
      }

      // Sidewalk
      ctx.fillStyle = '#e2e8f0';
      ctx.fillRect(0, 325, W, 36);
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, 325);
      ctx.lineTo(W, 325);
      ctx.moveTo(0, 361);
      ctx.lineTo(W, 361);
      ctx.stroke();

      // Asphalt Road
      ctx.fillStyle = '#334155';
      ctx.fillRect(0, 361, W, H - 361);

      // Dashed Road Markings
      ctx.fillStyle = '#f8fafc';
      const dashOffset = ((scrollX * 1.0) % 110 + 110) % 110;
      for (let dx = -dashOffset; dx < W; dx += 110) {
        ctx.fillRect(dx, 455, 62, 8);
      }
    };

    const drawStudent = (
      actor: RunnerActor,
      tSec: number,
      mode: 'IDLE' | 'RUN' | 'TREE' | 'CAUGHT' | 'DANCE',
    ) => {
      const { x, y, shirtColor, hairColor, skinColor, phaseOffset } = actor;
      const swing = mode === 'RUN' ? Math.sin(tSec * 22 + phaseOffset) : 0;
      const bounce =
        mode === 'RUN'
          ? Math.abs(Math.cos(tSec * 22 + phaseOffset)) * 6
          : mode === 'DANCE'
            ? Math.abs(Math.sin(tSec * 10)) * 9
            : Math.sin(tSec * 3 + phaseOffset) * 2;

      ctx.save();
      ctx.translate(x, y - bounce);

      // Ground shadow
      if (mode !== 'TREE') {
        ctx.fillStyle = 'rgba(15, 23, 42, 0.25)';
        ctx.beginPath();
        ctx.ellipse(0, 34 + bounce, 18, 6, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      // Legs
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-5, 14);
      ctx.lineTo(-5 - swing * 12, 32);
      ctx.moveTo(5, 14);
      ctx.lineTo(5 + swing * 12, 32);
      ctx.stroke();

      // Torso / Uniform Shirt
      ctx.fillStyle = shirtColor;
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(-12, -10, 24, 26, 7);
      ctx.fill();
      ctx.stroke();

      // Arms
      ctx.strokeStyle = skinColor;
      ctx.lineWidth = 5;
      ctx.beginPath();
      if (mode === 'RUN') {
        // Flailing arms up in panic
        ctx.moveTo(-11, -4);
        ctx.lineTo(-22, -14 + swing * 8);
        ctx.moveTo(11, -4);
        ctx.lineTo(22, -14 - swing * 8);
      } else if (mode === 'DANCE') {
        ctx.moveTo(-11, -4);
        ctx.lineTo(-22, -16 + Math.sin(tSec * 12) * 8);
        ctx.moveTo(11, -4);
        ctx.lineTo(22, -16 - Math.sin(tSec * 12) * 8);
      } else {
        ctx.moveTo(-11, -4);
        ctx.lineTo(-15, 10);
        ctx.moveTo(11, -4);
        ctx.lineTo(15, 10);
      }
      ctx.stroke();

      // Head
      ctx.fillStyle = skinColor;
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, -24, 15, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Hair cap
      ctx.fillStyle = hairColor;
      ctx.beginPath();
      ctx.arc(0, -28, 15, Math.PI, Math.PI * 2);
      ctx.fill();

      // Eyes & Mouth expression
      ctx.fillStyle = '#0f172a';
      if (mode === 'RUN' || mode === 'CAUGHT') {
        // Wide panicked eyes + O mouth
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(-5, -24, 3.8, 0, Math.PI * 2);
        ctx.arc(5, -24, 3.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.arc(-4.5, -24, 1.6, 0, Math.PI * 2);
        ctx.arc(5.5, -24, 1.6, 0, Math.PI * 2);
        ctx.fill();
        // Open screaming mouth
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.ellipse(1, -15, 4.5, 5, 0, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.arc(-5, -24, 2, 0, Math.PI * 2);
        ctx.arc(5, -24, 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(0, -18, 4, 0, Math.PI);
        ctx.stroke();
      }

      // Name Tag Pill above head
      const label = shortDisplayName(actor.student.name);
      ctx.font = '800 12px system-ui, -apple-system, sans-serif';
      const tw = ctx.measureText(label).width;
      const pw = tw + 14;
      const ph = 20;
      ctx.fillStyle = actor.isWinner && (mode === 'CAUGHT' || mode === 'DANCE')
        ? '#fef08a'
        : 'rgba(255,255,255,0.94)';
      ctx.strokeStyle = actor.isWinner && (mode === 'CAUGHT' || mode === 'DANCE') ? '#dc2626' : '#0f172a';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.roundRect(-pw / 2, -64, pw, ph, 7);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#0f172a';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, 0, -54);

      ctx.restore();
    };

    const drawDog = (
      x: number,
      y: number,
      tSec: number,
      state: 'CREEP' | 'BARK' | 'RUN' | 'DANCE',
    ) => {
      const gallop = state === 'RUN' ? Math.sin(tSec * 24) : 0;
      const bounce =
        state === 'RUN'
          ? Math.abs(Math.cos(tSec * 24)) * 8
          : state === 'DANCE'
            ? Math.abs(Math.sin(tSec * 10)) * 12
            : state === 'BARK'
              ? 6
              : Math.sin(tSec * 5) * 2;

      ctx.save();
      ctx.translate(x, y - bounce);

      // Shadow
      ctx.fillStyle = 'rgba(15, 23, 42, 0.28)';
      ctx.beginPath();
      ctx.ellipse(0, 26 + bounce, 28, 8, 0, 0, Math.PI * 2);
      ctx.fill();

      // Wagging Tail
      const tailWag = Math.sin(tSec * 18) * 10;
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 7;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-24, -2);
      ctx.quadraticCurveTo(-38, -14 + tailWag, -42, -24 + tailWag);
      ctx.stroke();

      // Back & Front Legs
      ctx.strokeStyle = '#d97706';
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(-16, 10);
      ctx.lineTo(-18 - gallop * 14, 26);
      ctx.moveTo(14, 10);
      ctx.lineTo(18 + gallop * 14, 26);
      ctx.stroke();

      // Dog Body (Becgie black-tan style)
      ctx.fillStyle = '#d97706';
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.ellipse(0, 2, 26, 16, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Black saddle on back
      ctx.fillStyle = '#1e293b';
      ctx.beginPath();
      ctx.ellipse(-4, -5, 16, 8, 0, 0, Math.PI * 2);
      ctx.fill();

      // Red collar
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(15, -10);
      ctx.lineTo(22, 6);
      ctx.stroke();

      // Dog Head
      ctx.save();
      ctx.translate(24, -14);
      if (state === 'BARK') ctx.rotate(-0.15);

      // Pointy Ears
      ctx.fillStyle = '#1e293b';
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-8, -10);
      ctx.lineTo(-12, -28);
      ctx.lineTo(0, -14);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(2, -12);
      ctx.lineTo(8, -29);
      ctx.lineTo(12, -10);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Head base
      ctx.fillStyle = '#f59e0b';
      ctx.beginPath();
      ctx.arc(0, 0, 16, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Snout
      ctx.fillStyle = '#fef3c7';
      ctx.beginPath();
      ctx.ellipse(12, 4, 9, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Nose
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.arc(18, 2, 3.5, 0, Math.PI * 2);
      ctx.fill();

      // Eyes
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(4, -4, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.arc(5, -4, 2.2, 0, Math.PI * 2);
      ctx.fill();

      // Tongue / Barking Mouth
      if (state === 'BARK' || state === 'RUN') {
        ctx.fillStyle = '#fb7185';
        ctx.beginPath();
        ctx.ellipse(10, 11, 4, 5.5, 0.2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      ctx.restore();
    };

    const renderFrame = (now: number) => {
      const tSec = now / 1000;
      const sim = simRef.current;

      ctx.clearRect(0, 0, W, H);

      let dogX = 165;
      let dogY = 445;
      let dogState: 'CREEP' | 'BARK' | 'RUN' | 'DANCE' = 'CREEP';
      let dogBubble: { text: string; bg?: string; fg?: string; scale?: number } | null = null;
      let winnerBubble: string | null = null;

      if (sim.active) {
        const elapsed = now - sim.startTime;
        const p = Math.min(1, elapsed / sim.durationMs);

        if (p < 0.08) {
          // Phase 1a: Dog sneaks in
          dogX = 110 + (p / 0.08) * 145;
          dogY = 445;
          dogState = 'CREEP';
          dogBubble = { text: 'Grừ... Đứa nào chưa học bài?', bg: '#fef08a', fg: '#7c2d12' };
        } else if (p < 0.16) {
          // Phase 1b: BARK!
          dogX = 255;
          dogY = 440;
          dogState = 'BARK';
          dogBubble = { text: 'GÂU!!', bg: '#ef4444', fg: '#ffffff', scale: 1.35 };
          if (!sim.barked) {
            sim.barked = true;
            playDogBark(mutedRef.current);
            setStatusText('Cả lớp chạy tán loạn! Chú chó đang truy tìm...');
          }
        } else if (p < 0.85) {
          // Phase 2 & 3: Chase + Parallax + Fakeouts
          const chaseP = (p - 0.16) / (0.85 - 0.16);
          const speedPxPerSec = paceMode === 'TURBO' ? 560 : 390;
          sim.scrollX += speedPxPerSec * (1 / 60);
          dogState = 'RUN';

          // Dog surges forward & weaves slightly
          dogX = 240 + Math.sin(chaseP * Math.PI * 3) * 85 + chaseP * 260;
          dogY = 442 + Math.sin(tSec * 4) * 18;

          // Fake-out speech bubbles
          if (paceMode !== 'TURBO' && chaseP > 0.32 && chaseP < 0.46) {
            dogBubble = { text: 'Ơ... không phải đứa này!', bg: '#ffffff', fg: '#0f172a' };
          } else if ((paceMode === 'NORMAL' || paceMode === 'EPIC') && chaseP > 0.65 && chaseP < 0.78) {
            dogBubble = { text: 'Đứng lại mauuu!', bg: '#fed7aa', fg: '#9a3412' };
          }

          // Update actors running + escaping
          actorsRef.current.forEach((actor) => {
            if (actor.escaped) return;
            if (actor.treeClimber && chaseP < 0.4) {
              // Brief comedic tree-climb moment near start
              actor.x = 120 - (sim.scrollX % 1200) * 0.2;
              actor.y = 190;
              return;
            }
            if (!actor.isWinner && chaseP >= actor.escapeAt) {
              actor.x += 13;
              if (actor.x > W + 90) actor.escaped = true;
            } else if (actor.isWinner) {
              // Winner stays ahead of dog until ~85%
              const targetX = 640 + Math.sin(tSec * 3.5) * 45;
              actor.x += (targetX - actor.x) * 0.08;
              actor.y = 438;
            } else {
              // Panic run with bobbing
              const targetX = 520 + ((hashCode(actor.student.id) % 5) * 85) + Math.sin(tSec * 5 + actor.phaseOffset) * 38;
              actor.x += (targetX - actor.x) * 0.06;
              actor.y = actor.baseY + Math.sin(tSec * 6 + actor.phaseOffset) * 8;
            }

            // Spawn tears & dust
            if (Math.random() < 0.22) {
              particlesRef.current.push({
                x: actor.x - 10,
                y: actor.y - 22,
                vx: -2 - Math.random() * 2,
                vy: -1 - Math.random() * 1.5,
                life: 0,
                maxLife: 24,
                kind: 'TEAR',
                size: 3 + Math.random() * 2,
                color: '#38bdf8',
              });
            }
            if (Math.random() < 0.18) {
              particlesRef.current.push({
                x: actor.x - 8,
                y: actor.y + 32,
                vx: -3 - Math.random() * 2,
                vy: -0.5 - Math.random(),
                life: 0,
                maxLife: 20,
                kind: 'DUST',
                size: 5 + Math.random() * 4,
                color: 'rgba(226, 232, 240, 0.7)',
              });
            }
          });
        } else {
          // Phase 4: Caught & Cha Cha Cha!
          dogState = p < 0.92 ? 'BARK' : 'DANCE';
          dogX = 635;
          dogY = 445;

          const winActor = actorsRef.current.find((a) => a.isWinner);
          if (winActor) {
            winActor.x += (545 - winActor.x) * 0.16;
            winActor.y = 440;
          }

          if (p < 0.92) {
            winnerBubble = 'Em... em chưa chuẩn bị!';
          } else {
            dogBubble = { text: 'Cha cha cha nào! 💃', bg: '#fef08a', fg: '#7c2d12', scale: 1.1 };
          }

          if (p >= 1 && !sim.finished) {
            sim.finished = true;
            sim.active = false;
            setRunning(false);
            if (sim.winner) {
              setStatusText(`Đã tóm gọn: ${sim.winner.name}!`);
              const picked = sim.winner;
              finishTimerRef.current = window.setTimeout(() => {
                onPickRef.current(picked);
              }, 350);
            }
          }
        }
      }

      // 1. Draw Background
      drawVietnameseStreet(sim.scrollX);

      // 2. Update & Draw Particles
      particlesRef.current = particlesRef.current.filter((pt) => {
        pt.life += 1;
        pt.x += pt.vx;
        pt.y += pt.vy;
        if (pt.kind === 'TEAR') pt.vy += 0.16;
        ctx.fillStyle = pt.color;
        ctx.globalAlpha = Math.max(0, 1 - pt.life / pt.maxLife);
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        return pt.life < pt.maxLife;
      });

      // 3. Draw Student Actors sorted by Y for depth
      const visibleActors = actorsRef.current
        .filter((a) => !a.escaped)
        .sort((a, b) => a.y - b.y);

      visibleActors.forEach((actor) => {
        let mode: 'IDLE' | 'RUN' | 'TREE' | 'CAUGHT' | 'DANCE' = 'IDLE';
        if (sim.active) {
          const p = (now - sim.startTime) / sim.durationMs;
          if (p < 0.16) mode = 'IDLE';
          else if (p < 0.85) mode = actor.treeClimber && p < 0.42 ? 'TREE' : 'RUN';
          else if (actor.isWinner) mode = p < 0.92 ? 'CAUGHT' : 'DANCE';
          else mode = 'RUN';
        } else if (sim.finished && actor.isWinner) {
          mode = 'DANCE';
        }
        drawStudent(actor, tSec, mode);
      });

      // 4. Draw Dog
      drawDog(dogX, dogY, tSec, dogState);

      // 5. Speech Bubbles on top
      if (dogBubble) {
        drawSpeechBubble(
          dogX + 20,
          dogY - 58,
          dogBubble.text,
          dogBubble.bg,
          dogBubble.fg,
          dogBubble.scale ?? 1,
        );
      }
      if (winnerBubble) {
        const winActor = actorsRef.current.find((a) => a.isWinner);
        if (winActor) {
          drawSpeechBubble(winActor.x, winActor.y - 82, winnerBubble, '#ffffff', '#dc2626', 1.05);
        }
      }

      rafRef.current = requestAnimationFrame(renderFrame);
    };

    rafRef.current = requestAnimationFrame(renderFrame);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [paceMode]);

  const handleStart = () => {
    if (running || students.length === 0) return;
    const winner = students[cryptoRandomInt(students.length)];

    // Ensure winner is in the visible crowd
    const others = students.filter((s) => s.id !== winner.id);
    const chosenOthers = others.slice(0, Math.max(0, MAX_VISIBLE_CROWD - 1));
    const crowd = [...chosenOthers, winner];

    // Shuffle crowd order
    for (let i = crowd.length - 1; i > 0; i--) {
      const j = cryptoRandomInt(i + 1);
      [crowd[i], crowd[j]] = [crowd[j], crowd[i]];
    }

    const cols = Math.max(1, Math.min(8, Math.ceil(crowd.length / 3)));
    actorsRef.current = crowd.map((st, idx) => {
      const h = hashCode(st.id + st.name);
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      const isWinner = st.id === winner.id;
      return {
        student: st,
        x: 430 + col * 82 + (row % 2) * 28,
        y: 345 + row * 48,
        baseY: 345 + row * 48,
        vx: 0,
        phaseOffset: (h % 100) / 15,
        shirtColor: SHIRT_COLORS[h % SHIRT_COLORS.length],
        hairColor: HAIR_COLORS[h % HAIR_COLORS.length],
        skinColor: SKIN_COLORS[h % SKIN_COLORS.length],
        isWinner,
        escapeAt: isWinner ? 1.5 : 0.2 + (idx / Math.max(1, crowd.length)) * 0.72,
        treeClimber: !isWinner && idx === 1 && crowd.length > 5,
        escaped: false,
      };
    });

    particlesRef.current = [];
    simRef.current = {
      active: true,
      startTime: performance.now(),
      durationMs: TOTAL_MS_BY_PACE[paceMode],
      scrollX: 0,
      barked: false,
      fakeoutShown: 0,
      winner,
      finished: false,
    };

    setRunning(true);
    setStatusText('Chú chó đang tiến lại gần cổng trường...');
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-4 gap-4 select-none">
      <div className="w-full max-w-6xl rounded-3xl overflow-hidden border-2 border-white/20 shadow-2xl bg-sky-200 relative">
        <canvas
          ref={canvasRef}
          width={1200}
          height={560}
          className="w-full h-auto block aspect-[1200/560]"
        />
        <div className="absolute top-3 left-3 px-3 py-1.5 rounded-full bg-slate-950/75 text-white text-xs font-bold backdrop-blur-sm">
          {statusText}
        </div>
      </div>

      <button
        type="button"
        disabled={running || students.length === 0}
        onClick={handleStart}
        className="px-8 py-3.5 rounded-2xl bg-gradient-to-r from-amber-400 via-orange-500 to-rose-500 hover:brightness-110 disabled:opacity-50 text-slate-950 font-black text-base sm:text-lg shadow-xl shadow-orange-500/30 transition active:scale-95"
      >
        {running
          ? '🐕 Đang rượt đuổi...'
          : students.length === 0
            ? 'Danh sách sinh viên trống'
            : '🐕 THẢ CHÓ KIỂM TRA BÀI!'}
      </button>
    </div>
  );
};

export default DogChaseGame;
