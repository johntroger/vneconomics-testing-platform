import React, { useEffect, useRef, useState } from 'react';
import type { MinigameProps, RosterStudent } from '../types';
import { cryptoRandomInt } from '../rosterStorage';
import { useMinigameStageSettings, type PaceMode } from '../stageContext';
import {
  playDogBarkSound,
  playRevealSound,
  startChaseMusic,
  stopBackgroundMusic,
  unlockGameAudio,
} from '../../utils/gameAudio';

const LOGICAL_W = 1280;
const LOGICAL_H = 640;
const MAX_VISIBLE_CROWD = 22;

const TOTAL_MS_BY_PACE: Record<PaceMode, number> = {
  TURBO: 3300,
  FAST: 9000,
  NORMAL: 16800,
  EPIC: 25500,
};

const ASSET_BASE = '/assets/minigames/cho-ruot/';
const SPRITE_MANIFEST = {
  bg: `${ASSET_BASE}bg-street.jpg`,
  dogBark: `${ASSET_BASE}dog-bark.png`,
  dogRun: `${ASSET_BASE}dog-run.png`,
  boyIdle: `${ASSET_BASE}hs-nam-idle.png`,
  boyRun: `${ASSET_BASE}hs-nam-run.png`,
  girlIdle: `${ASSET_BASE}hs-nu-idle.png`,
} as const;

type SpriteKey = keyof typeof SPRITE_MANIFEST;
type LoadedSprites = Record<SpriteKey, HTMLImageElement>;

interface RunnerActor {
  student: RosterStudent;
  isGirl: boolean;
  x: number;
  y: number;
  laneY: number;
  laneScale: number;
  heightVar: number;
  phaseOffset: number;
  isWinner: boolean;
  escapeAt: number;
  escaped: boolean;
}

interface FxParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vRot: number;
  life: number;
  maxLife: number;
  kind: 'TEAR' | 'DUST' | 'PETAL' | 'NOTE';
  size: number;
  color: string;
  glyph?: string;
}

const FEMALE_TOKENS = new Set([
  'thị',
  'ngọc',
  'thảo',
  'hân',
  'nhi',
  'linh',
  'trang',
  'phương',
  'mai',
  'lan',
  'hương',
  'thư',
  'vy',
  'quỳnh',
  'trâm',
  'yến',
  'châu',
  'hà',
  'my',
  'tuệ',
  'ngân',
  'uyên',
  'diễm',
  'thúy',
  'thu',
  'hạnh',
  'diệu',
  'nhung',
  'trinh',
  'vân',
  'ánh',
  'xuân',
]);

const MALE_TOKENS = new Set([
  'văn',
  'đức',
  'minh',
  'hoàng',
  'tuấn',
  'hùng',
  'dũng',
  'phát',
  'khang',
  'khoa',
  'nam',
  'long',
  'đạt',
  'hải',
  'quân',
  'kiệt',
  'thịnh',
  'phúc',
  'khôi',
  'huy',
  'tài',
  'nghĩa',
  'trung',
  'thành',
  'tùng',
  'sơn',
  'cường',
  'phong',
]);

function hashCode(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function inferIsFemale(student: RosterStudent, fallbackIdx: number): boolean {
  const g = (student.gender ?? '').trim().toLowerCase();
  if (g === 'f' || g === 'female' || g === 'nữ' || g === 'nu') return true;
  if (g === 'm' || g === 'male' || g === 'nam') return false;

  const tokens = student.name.trim().toLowerCase().split(/\s+/);
  // Check given name (last token) first, then middle tokens
  for (let i = tokens.length - 1; i >= 1; i--) {
    if (FEMALE_TOKENS.has(tokens[i])) return true;
    if (MALE_TOKENS.has(tokens[i])) return false;
  }
  return fallbackIdx % 2 === 1;
}

function shortDisplayName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length <= 2) return fullName.trim();
  return parts.slice(-2).join(' ');
}

const DEPTH_LANES = [
  { y: 476, scale: 0.84 },
  { y: 516, scale: 0.9 },
  { y: 558, scale: 0.96 },
  { y: 600, scale: 1.03 },
] as const;

export const DogChaseGame: React.FC<MinigameProps> = ({
  students,
  muted,
  onPickStudent,
}) => {
  const { paceMode } = useMinigameStageSettings();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const finishTimerRef = useRef<number | null>(null);
  const spritesRef = useRef<LoadedSprites | null>(null);

  const [assetsReady, setAssetsReady] = useState(false);
  const [running, setRunning] = useState(false);
  const [statusText, setStatusText] = useState('Cả lớp đang tụ tập trước cổng trường — Sẵn sàng!');

  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  const onPickRef = useRef(onPickStudent);
  onPickRef.current = onPickStudent;

  const actorsRef = useRef<RunnerActor[]>([]);
  const particlesRef = useRef<FxParticle[]>([]);
  const simRef = useRef<{
    active: boolean;
    startTime: number;
    durationMs: number;
    scrollX: number;
    barked: boolean;
    barkTime: number;
    danceStarted: boolean;
    winner: RosterStudent | null;
    finished: boolean;
  }>({
    active: false,
    startTime: 0,
    durationMs: 16800,
    scrollX: 0,
    barked: false,
    barkTime: 0,
    danceStarted: false,
    winner: null,
    finished: false,
  });

  // Preload 2D Chibi sprites & illustrated street backdrop once
  useEffect(() => {
    let cancelled = false;
    const entries = Object.entries(SPRITE_MANIFEST) as Array<[SpriteKey, string]>;
    Promise.all(
      entries.map(
        ([key, src]) =>
          new Promise<[SpriteKey, HTMLImageElement]>((resolve, reject) => {
            const img = new Image();
            img.decoding = 'async';
            img.onload = () => resolve([key, img]);
            img.onerror = () => reject(new Error(`Failed to load ${src}`));
            img.src = src;
          }),
      ),
    )
      .then((pairs) => {
        if (cancelled) return;
        spritesRef.current = Object.fromEntries(pairs) as LoadedSprites;
        setAssetsReady(true);
      })
      .catch(() => {
        if (!cancelled) setStatusText('Không tải được bộ đồ họa game — vui lòng tải lại trang.');
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Build idle schoolyard crowd whenever student list updates while idle
  useEffect(() => {
    if (simRef.current.active) return;
    const pool = students.slice(0, MAX_VISIBLE_CROWD);
    const cols = Math.max(1, Math.ceil(pool.length / DEPTH_LANES.length));
    actorsRef.current = pool.map((st, idx) => {
      const h = hashCode(st.id + st.name);
      const laneIdx = idx % DEPTH_LANES.length;
      const col = Math.floor(idx / DEPTH_LANES.length);
      const lane = DEPTH_LANES[laneIdx];
      const spreadX = Math.min(76, 560 / Math.max(1, cols));
      const x = 445 + col * spreadX + (laneIdx % 2) * 32 + ((h % 18) - 9);
      return {
        student: st,
        isGirl: inferIsFemale(st, idx),
        x,
        y: lane.y,
        laneY: lane.y,
        laneScale: lane.scale,
        heightVar: 0.96 + (h % 9) * 0.01,
        phaseOffset: (h % 100) / 14,
        isWinner: false,
        escapeAt: 1,
        escaped: false,
      };
    });
  }, [students]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopBackgroundMusic();
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      if (finishTimerRef.current !== null) window.clearTimeout(finishTimerRef.current);
    };
  }, []);

  // Sync background music with running & muted state
  useEffect(() => {
    if (running && !muted && !simRef.current.danceStarted) {
      startChaseMusic();
    } else if (muted || !running) {
      stopBackgroundMusic();
    }
  }, [running, muted]);

  // High-DPI 60fps Canvas Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, 2);
    canvas.width = LOGICAL_W * dpr;
    canvas.height = LOGICAL_H * dpr;

    // Seed gentle floating flamboyant petals
    if (particlesRef.current.length === 0) {
      for (let i = 0; i < 14; i++) {
        particlesRef.current.push({
          x: Math.random() * LOGICAL_W,
          y: Math.random() * 380,
          vx: -0.6 - Math.random() * 0.8,
          vy: 0.6 + Math.random() * 0.6,
          rot: Math.random() * Math.PI * 2,
          vRot: (Math.random() - 0.5) * 0.06,
          life: Math.floor(Math.random() * 200),
          maxLife: 320,
          kind: 'PETAL',
          size: 5 + Math.random() * 3,
          color: i % 2 === 0 ? '#ef4444' : '#f97316',
        });
      }
    }

    let prevTime = performance.now();

    const drawComicBubble = (
      x: number,
      y: number,
      text: string,
      opts: { bg?: string; fg?: string; border?: string; scale?: number; burst?: boolean } = {},
    ) => {
      const {
        bg = '#ffffff',
        fg = '#1e1b4b',
        border = '#271713',
        scale = 1,
        burst = false,
      } = opts;

      const clampedX = Math.max(150, Math.min(LOGICAL_W - 150, x));
      const clampedY = Math.max(66, y);

      ctx.save();
      ctx.translate(clampedX, clampedY);
      ctx.scale(scale, scale);

      ctx.font = burst
        ? '900 26px system-ui, -apple-system, sans-serif'
        : '800 17px system-ui, -apple-system, sans-serif';
      const padX = burst ? 26 : 18;
      const bw = Math.max(108, ctx.measureText(text).width + padX * 2);
      const bh = burst ? 52 : 40;

      if (burst) {
        // Spiky comic shout burst for "GÂU!!"
        const spikes = 16;
        const rx = bw * 0.62;
        const ry = bh * 0.72;
        ctx.beginPath();
        for (let i = 0; i < spikes * 2; i++) {
          const ang = (i * Math.PI) / spikes;
          const radX = i % 2 === 0 ? rx : rx * 0.76;
          const radY = i % 2 === 0 ? ry : ry * 0.74;
          const px = Math.cos(ang) * radX;
          const py = -bh / 2 + Math.sin(ang) * radY;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fillStyle = '#fde047';
        ctx.fill();
        ctx.lineWidth = 4;
        ctx.strokeStyle = border;
        ctx.stroke();

        ctx.fillStyle = '#dc2626';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 4;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.strokeText(text, 0, -bh / 2 + 1);
        ctx.fillText(text, 0, -bh / 2 + 1);
      } else {
        const rx = -bw / 2;
        const ry = -bh;

        // Crisp cel drop-shadow
        ctx.fillStyle = 'rgba(24, 15, 12, 0.28)';
        ctx.beginPath();
        ctx.roundRect(rx + 4, ry + 5, bw, bh, 16);
        ctx.fill();

        // Tail
        ctx.fillStyle = bg;
        ctx.strokeStyle = border;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.roundRect(rx, ry, bw, bh, 16);
        ctx.fill();
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(-9, -2);
        ctx.lineTo(-2, 12);
        ctx.lineTo(9, -2);
        ctx.closePath();
        ctx.fillStyle = bg;
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(-9, -1);
        ctx.lineTo(-2, 12);
        ctx.lineTo(9, -1);
        ctx.stroke();

        ctx.fillStyle = fg;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, 0, ry + bh / 2 + 1);
      }

      ctx.restore();
    };

    const drawSeamlessBackdrop = (bgImg: HTMLImageElement, scrollX: number) => {
      const tileH = LOGICAL_H;
      const tileW = Math.round(tileH * (bgImg.naturalWidth / bgImg.naturalHeight));
      const startIdx = Math.floor(scrollX / tileW) - 1;

      for (let k = 0; k < 4; k++) {
        const tileIndex = startIdx + k;
        const exactX = tileIndex * tileW - scrollX;
        if (exactX > LOGICAL_W || exactX + tileW < 0) continue;

        const mirrored = Math.abs(tileIndex) % 2 === 1;
        ctx.save();
        if (mirrored) {
          ctx.translate(exactX + tileW, 0);
          ctx.scale(-1, 1);
          ctx.drawImage(bgImg, 0, 0, tileW + 1, tileH);
        } else {
          ctx.drawImage(bgImg, exactX, 0, tileW + 1, tileH);
        }
        ctx.restore();

        // Crisp Vietnamese gold lettering centered inside the school gate wooden signboard
        const plaqueRatioX = mirrored ? 1 - 0.3075 : 0.3075;
        const plaqueX = exactX + tileW * plaqueRatioX;
        const plaqueY = tileH * 0.3515;
        if (plaqueX > -120 && plaqueX < LOGICAL_W + 120) {
          ctx.save();
          ctx.font = '900 12.5px system-ui, -apple-system, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = '#fde047';
          ctx.shadowColor = 'rgba(0,0,0,0.65)';
          ctx.shadowBlur = 2;
          ctx.fillText('MÁI TRƯỜNG THÂN YÊU', plaqueX, plaqueY);
          ctx.restore();
        }
      }

      // Crisp scrolling white road center dashes on asphalt for tactile speed feel
      ctx.save();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.58)';
      const dashPeriod = 132;
      const dashOff = ((scrollX % dashPeriod) + dashPeriod) % dashPeriod;
      for (let dx = -dashOff; dx < LOGICAL_W; dx += dashPeriod) {
        ctx.beginPath();
        ctx.roundRect(dx, 536, 68, 7, 3.5);
        ctx.fill();
      }
      ctx.restore();
    };

    const drawSpriteActor = (
      actor: RunnerActor,
      sprites: LoadedSprites,
      tSec: number,
      mode: 'IDLE' | 'SHOCK' | 'RUN' | 'CAUGHT' | 'DANCE',
    ) => {
      const baseH = 148 * actor.laneScale * actor.heightVar;
      let img: HTMLImageElement;
      if (actor.isGirl) {
        img = sprites.girlIdle;
      } else if (mode === 'RUN' || mode === 'SHOCK') {
        // Alternate rapid stride tuck for lively frame-flipping animation
        const stride = Math.sin(tSec * 20 + actor.phaseOffset);
        img = mode === 'SHOCK' || stride > -0.55 ? sprites.boyRun : sprites.boyIdle;
      } else {
        img = sprites.boyIdle;
      }

      const aspect = img.naturalWidth / img.naturalHeight;
      const drawH = baseH;
      const drawW = drawH * aspect;

      let bounceY = 0;
      let stretch = 0;
      let tilt = 0;
      let flipX = 1;

      if (mode === 'IDLE') {
        const phase = tSec * 4.2 + actor.phaseOffset;
        bounceY = Math.abs(Math.sin(phase)) * 3;
        stretch = Math.sin(phase) * 0.02;
      } else if (mode === 'SHOCK') {
        bounceY = 22 * Math.abs(Math.sin(tSec * 14 + actor.phaseOffset));
        stretch = 0.08;
        tilt = -0.06;
      } else if (mode === 'RUN') {
        const phase = tSec * 19 + actor.phaseOffset;
        bounceY = Math.abs(Math.sin(phase)) * 13;
        stretch = Math.sin(phase * 2) * 0.075;
        tilt = actor.isGirl ? 0.13 + Math.sin(phase) * 0.05 : 0.06 + Math.sin(phase) * 0.05;
      } else if (mode === 'CAUGHT') {
        const shiver = Math.sin(tSec * 36) * 2.2;
        bounceY = 0;
        tilt = shiver * 0.015;
      } else if (mode === 'DANCE') {
        const beat = tSec * 11;
        bounceY = Math.abs(Math.sin(beat)) * 16;
        stretch = Math.sin(beat * 2) * 0.08;
        tilt = Math.sin(beat * 0.5) * 0.13;
        flipX = Math.sin(beat * 0.5) >= 0 ? 1 : -1;
      }

      // 1. Soft elliptical ground shadow anchored on street
      const shadowScale = Math.max(0.55, 1 - bounceY * 0.014);
      ctx.save();
      ctx.fillStyle = 'rgba(15, 23, 42, 0.28)';
      ctx.beginPath();
      ctx.ellipse(
        actor.x,
        actor.y - 3,
        28 * actor.laneScale * shadowScale,
        8.5 * actor.laneScale * shadowScale,
        0,
        0,
        Math.PI * 2,
      );
      ctx.fill();
      ctx.restore();

      // 2. Character Sprite with Squash & Stretch around bottom-center shoe anchor
      ctx.save();
      ctx.translate(actor.x, actor.y - bounceY);
      ctx.rotate(tilt);
      ctx.scale(flipX * (1 - stretch * 0.75), 1 + stretch);
      ctx.drawImage(img, -drawW / 2, -drawH, drawW, drawH);

      // Comedic anime sweat/tear drop on girl running or caught student
      if ((actor.isGirl && mode === 'RUN') || mode === 'CAUGHT') {
        ctx.fillStyle = '#38bdf8';
        ctx.strokeStyle = '#1e3a8a';
        ctx.lineWidth = 1.6;
        const sx = mode === 'CAUGHT' ? -18 : -14;
        const sy = -drawH * 0.66 + Math.sin(tSec * 16) * 3;
        ctx.beginPath();
        ctx.moveTo(sx, sy - 9);
        ctx.quadraticCurveTo(sx + 7, sy + 2, sx, sy + 7);
        ctx.quadraticCurveTo(sx - 7, sy + 2, sx, sy - 9);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();

      // 3. High-contrast Name Badge above head
      const label = shortDisplayName(actor.student.name);
      const highlightWinner = actor.isWinner && (mode === 'CAUGHT' || mode === 'DANCE');
      ctx.save();
      ctx.font = highlightWinner
        ? '900 14px system-ui, -apple-system, sans-serif'
        : '800 12.5px system-ui, -apple-system, sans-serif';
      const tw = ctx.measureText(label).width;
      const pw = tw + 16;
      const ph = highlightWinner ? 24 : 21;
      const badgeY = actor.y - drawH - bounceY - ph - 6;

      ctx.fillStyle = highlightWinner ? '#fef08a' : 'rgba(255, 255, 255, 0.94)';
      ctx.strokeStyle = highlightWinner ? '#dc2626' : '#271713';
      ctx.lineWidth = highlightWinner ? 2.4 : 1.8;
      ctx.beginPath();
      ctx.roundRect(actor.x - pw / 2, badgeY, pw, ph, 8);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#0f172a';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, actor.x, badgeY + ph / 2 + 0.5);
      ctx.restore();
    };

    const drawPuppy = (
      x: number,
      y: number,
      sprites: LoadedSprites,
      tSec: number,
      state: 'CREEP' | 'BARK' | 'RUN' | 'FACE_STUDENT' | 'DANCE',
    ) => {
      const img = state === 'RUN' ? sprites.dogRun : sprites.dogBark;
      const drawH = 142;
      const drawW = drawH * (img.naturalWidth / img.naturalHeight);

      let bounceY = 0;
      let stretch = 0;
      let tilt = 0;
      let flipX = 1;

      if (state === 'CREEP') {
        bounceY = Math.abs(Math.sin(tSec * 8)) * 5;
        stretch = Math.sin(tSec * 8) * 0.03;
      } else if (state === 'BARK') {
        bounceY = 12 * Math.abs(Math.sin(tSec * 16));
        stretch = 0.07;
        tilt = -0.07;
      } else if (state === 'RUN') {
        const phase = tSec * 17;
        bounceY = Math.abs(Math.sin(phase)) * 16;
        stretch = Math.sin(phase * 2) * 0.085;
        tilt = Math.sin(phase) * 0.09;
      } else if (state === 'FACE_STUDENT') {
        flipX = -1; // Turn around to look right at the caught student!
        bounceY = Math.abs(Math.sin(tSec * 6)) * 4;
      } else if (state === 'DANCE') {
        const beat = tSec * 11;
        bounceY = Math.abs(Math.sin(beat + 0.6)) * 18;
        stretch = Math.sin(beat * 2) * 0.09;
        tilt = -Math.sin(beat * 0.5) * 0.14;
        flipX = Math.sin(beat * 0.5) >= 0 ? -1 : 1;
      }

      const shadowScale = Math.max(0.5, 1 - bounceY * 0.013);
      ctx.save();
      ctx.fillStyle = 'rgba(15, 23, 42, 0.3)';
      ctx.beginPath();
      ctx.ellipse(x, y - 3, 42 * shadowScale, 10 * shadowScale, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      ctx.save();
      ctx.translate(x, y - bounceY);
      ctx.rotate(tilt);
      ctx.scale(flipX * (1 - stretch * 0.7), 1 + stretch);
      ctx.drawImage(img, -drawW / 2, -drawH, drawW, drawH);
      ctx.restore();
    };

    const render = (now: number) => {
      const dt = Math.min(0.05, Math.max(0.001, (now - prevTime) / 1000));
      prevTime = now;
      const tSec = now / 1000;
      const sim = simRef.current;
      const sprites = spritesRef.current;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.clearRect(0, 0, LOGICAL_W, LOGICAL_H);

      if (!sprites) {
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
        ctx.fillStyle = '#f8fafc';
        ctx.font = '800 20px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('🎨 Đang tải bối cảnh cổng trường Chibi...', LOGICAL_W / 2, LOGICAL_H / 2);
        rafRef.current = requestAnimationFrame(render);
        return;
      }

      let dogX = 215;
      let dogY = 556;
      let dogState: 'CREEP' | 'BARK' | 'RUN' | 'FACE_STUDENT' | 'DANCE' = 'CREEP';
      let dogBubble: {
        text: string;
        bg?: string;
        fg?: string;
        scale?: number;
        burst?: boolean;
      } | null = null;
      let winnerBubble: string | null = null;
      let spotlightTargetX: number | null = null;

      if (sim.active) {
        const elapsed = now - sim.startTime;
        const p = Math.min(1, elapsed / sim.durationMs);

        if (p < 0.1) {
          // Act 1: Puppy trots up to the school gate
          const sub = p / 0.1;
          dogX = 120 + sub * 155;
          dogY = 556;
          dogState = 'CREEP';
          dogBubble = {
            text: 'Grừ... Đứa nào chưa học bài?',
            bg: '#fef08a',
            fg: '#7c2d12',
          };
        } else if (p < 0.18) {
          // Act 2: Explosive BARK!
          dogX = 278;
          dogY = 552;
          dogState = 'BARK';
          dogBubble = { text: 'GÂU!!', burst: true, scale: 1.1 };
          if (!sim.barked) {
            sim.barked = true;
            sim.barkTime = now;
            if (!mutedRef.current) playDogBarkSound();
            setStatusText('Á á á! Cả lớp chạy tán loạn khắp con phố!!');
          }
        } else if (p < 0.84) {
          // Act 3: High-speed street chase & fake-outs
          const chaseP = (p - 0.18) / (0.84 - 0.18);
          const scrollSpeed = paceMode === 'TURBO' ? 760 : 540;
          sim.scrollX += scrollSpeed * dt;
          dogState = 'RUN';

          dogX = 250 + Math.sin(chaseP * Math.PI * 3) * 95 + chaseP * 235;
          dogY = 548 + Math.sin(tSec * 4.2) * 32;

          if (paceMode !== 'TURBO' && chaseP > 0.28 && chaseP < 0.44) {
            dogBubble = {
              text: 'Ơ... không phải đứa này!',
              bg: '#ffffff',
              fg: '#0f172a',
            };
          } else if (
            (paceMode === 'NORMAL' || paceMode === 'EPIC') &&
            chaseP > 0.62 &&
            chaseP < 0.77
          ) {
            dogBubble = {
              text: 'Đứng lại kiểm tra vở mauuu!',
              bg: '#ffedd5',
              fg: '#9a3412',
            };
          }

          actorsRef.current.forEach((actor) => {
            if (actor.escaped) return;
            if (!actor.isWinner && chaseP >= actor.escapeAt) {
              actor.x += 780 * dt;
              if (actor.x > LOGICAL_W + 110) actor.escaped = true;
            } else if (actor.isWinner) {
              const targetX = 695 + Math.sin(tSec * 3.4) * 52;
              actor.x += (targetX - actor.x) * Math.min(1, dt * 5.5);
              actor.y += (554 - actor.y) * Math.min(1, dt * 4);
            } else {
              const rank = hashCode(actor.student.id) % 6;
              const targetX =
                545 + rank * 86 + Math.sin(tSec * 4.8 + actor.phaseOffset) * 38;
              actor.x += (targetX - actor.x) * Math.min(1, dt * 4.5);
              actor.y = actor.laneY + Math.sin(tSec * 6 + actor.phaseOffset) * 6;
            }

            // Cartoon teardrops & puffy shoe dust
            if (Math.random() < 0.26) {
              particlesRef.current.push({
                x: actor.x - 10,
                y: actor.y - 105 * actor.laneScale,
                vx: -140 - Math.random() * 90,
                vy: -75 - Math.random() * 65,
                rot: -0.4,
                vRot: -0.05,
                life: 0,
                maxLife: 28,
                kind: 'TEAR',
                size: 5.5 + Math.random() * 2.5,
                color: '#38bdf8',
              });
            }
            if (Math.random() < 0.22) {
              particlesRef.current.push({
                x: actor.x - 14,
                y: actor.y - 6,
                vx: -190 - Math.random() * 100,
                vy: -22 - Math.random() * 30,
                rot: 0,
                vRot: 0,
                life: 0,
                maxLife: 22,
                kind: 'DUST',
                size: 8 + Math.random() * 7,
                color: 'rgba(255, 255, 255, 0.82)',
              });
            }
          });
        } else {
          // Act 4: Caught & Joyful Cha-Cha-Cha Dance!
          const isDancing = p >= 0.91;
          dogState = isDancing ? 'DANCE' : 'FACE_STUDENT';
          dogX = 720;
          dogY = 562;
          spotlightTargetX = 635;

          const winActor = actorsRef.current.find((a) => a.isWinner);
          if (winActor) {
            winActor.x += (555 - winActor.x) * Math.min(1, dt * 9);
            winActor.y += (562 - winActor.y) * Math.min(1, dt * 9);
            winActor.laneScale += (1.06 - winActor.laneScale) * Math.min(1, dt * 6);
          }

          // Clear stragglers off-screen cleanly
          actorsRef.current.forEach((a) => {
            if (!a.isWinner && !a.escaped) {
              a.x += 920 * dt;
              if (a.x > LOGICAL_W + 120) a.escaped = true;
            }
          });

          if (!isDancing) {
            winnerBubble = 'Em... em chưa chuẩn bị bài ạ!';
          } else {
            dogBubble = {
              text: 'Cha cha cha nào! 💃🎶',
              bg: '#fef08a',
              fg: '#7c2d12',
              scale: 1.12,
            };
            if (!sim.danceStarted) {
              sim.danceStarted = true;
              stopBackgroundMusic();
              if (!mutedRef.current) playRevealSound();
              if (sim.winner) {
                setStatusText(`🎉 Chốt đơn kiểm tra bài: ${sim.winner.name}!`);
              }
            }
            if (Math.random() < 0.25) {
              const notes = ['♪', '♫', '✨', '🎵'];
              particlesRef.current.push({
                x: 635 + (Math.random() - 0.5) * 190,
                y: 445,
                vx: (Math.random() - 0.5) * 40,
                vy: -85 - Math.random() * 45,
                rot: 0,
                vRot: 0,
                life: 0,
                maxLife: 40,
                kind: 'NOTE',
                size: 20,
                color: '#fde047',
                glyph: notes[Math.floor(Math.random() * notes.length)],
              });
            }
          }

          if (p >= 1 && !sim.finished) {
            sim.finished = true;
            sim.active = false;
            stopBackgroundMusic();
            setRunning(false);
            if (sim.winner) {
              const picked = sim.winner;
              finishTimerRef.current = window.setTimeout(() => {
                onPickRef.current(picked);
              }, 350);
            }
          }
        }
      } else if (sim.finished) {
        dogX = 720;
        dogY = 562;
        dogState = 'DANCE';
        spotlightTargetX = 635;
      }

      // Camera shake impulse right when the dog barks "GÂU!!"
      let shakeX = 0;
      let shakeY = 0;
      if (sim.barkTime > 0) {
        const sinceBark = now - sim.barkTime;
        if (sinceBark >= 0 && sinceBark < 340) {
          const mag = (1 - sinceBark / 340) * 9;
          shakeX = (Math.random() - 0.5) * 2 * mag;
          shakeY = (Math.random() - 0.5) * 2 * mag;
        }
      }

      ctx.save();
      ctx.translate(shakeX, shakeY);

      // 1. Illustrated Vietnamese School Gate & Shophouses Backdrop
      drawSeamlessBackdrop(sprites.bg, sim.scrollX);

      // 2. Optional Finale Stage Spotlight Cone
      if (spotlightTargetX !== null) {
        ctx.save();
        ctx.fillStyle = 'rgba(15, 23, 42, 0.34)';
        ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);

        const cone = ctx.createLinearGradient(spotlightTargetX, 0, spotlightTargetX, LOGICAL_H);
        cone.addColorStop(0, 'rgba(254, 240, 138, 0.36)');
        cone.addColorStop(1, 'rgba(254, 240, 138, 0.08)');
        ctx.fillStyle = cone;
        ctx.beginPath();
        ctx.moveTo(spotlightTargetX - 70, 0);
        ctx.lineTo(spotlightTargetX + 70, 0);
        ctx.lineTo(spotlightTargetX + 215, LOGICAL_H);
        ctx.lineTo(spotlightTargetX - 215, LOGICAL_H);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }

      // 3. Draw Depth-Sorted Chibi Crowd + Puppy
      const visibleActors = actorsRef.current.filter((a) => !a.escaped);
      type RenderEntity =
        | { kind: 'STUDENT'; y: number; actor: RunnerActor }
        | { kind: 'DOG'; y: number };

      const entities: RenderEntity[] = [
        ...visibleActors.map((actor) => ({ kind: 'STUDENT' as const, y: actor.y, actor })),
        { kind: 'DOG' as const, y: dogY },
      ].sort((a, b) => a.y - b.y);

      entities.forEach((ent) => {
        if (ent.kind === 'DOG') {
          drawPuppy(dogX, dogY, sprites, tSec, dogState);
        } else {
          let mode: 'IDLE' | 'SHOCK' | 'RUN' | 'CAUGHT' | 'DANCE' = 'IDLE';
          if (sim.active) {
            const p = (now - sim.startTime) / sim.durationMs;
            if (p < 0.1) mode = 'IDLE';
            else if (p < 0.18) mode = 'SHOCK';
            else if (p < 0.84) mode = 'RUN';
            else if (ent.actor.isWinner) mode = p < 0.91 ? 'CAUGHT' : 'DANCE';
            else mode = 'RUN';
          } else if (sim.finished && ent.actor.isWinner) {
            mode = 'DANCE';
          }
          drawSpriteActor(ent.actor, sprites, tSec, mode);
        }
      });

      // 4. Update & Render Stylized Cartoon Particles (Petals, Dust, Teardrops, Notes)
      const nextParticles: FxParticle[] = [];
      for (const pt of particlesRef.current) {
        pt.life += 1;
        if (pt.kind === 'PETAL') {
          const extraScroll = sim.active ? 2.4 : 0;
          pt.x += pt.vx - extraScroll + Math.sin(tSec * 2 + pt.y * 0.02) * 0.5;
          pt.y += pt.vy;
          pt.rot += pt.vRot;
          if (pt.x < -20) pt.x = LOGICAL_W + 20;
          if (pt.y > 460) {
            pt.y = -15;
            pt.x = Math.random() * LOGICAL_W;
          }
          ctx.save();
          ctx.translate(pt.x, pt.y);
          ctx.rotate(pt.rot);
          ctx.fillStyle = pt.color;
          ctx.beginPath();
          ctx.ellipse(0, 0, pt.size, pt.size * 0.55, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
          nextParticles.push(pt);
          continue;
        }

        pt.x += pt.vx * dt;
        pt.y += pt.vy * dt;
        if (pt.kind === 'TEAR') pt.vy += 360 * dt;

        if (pt.life < pt.maxLife) {
          const alpha = Math.max(0, 1 - pt.life / pt.maxLife);
          ctx.save();
          ctx.globalAlpha = alpha;
          if (pt.kind === 'NOTE' && pt.glyph) {
            ctx.font = `900 ${pt.size}px system-ui, sans-serif`;
            ctx.fillStyle = pt.color;
            ctx.fillText(pt.glyph, pt.x, pt.y);
          } else if (pt.kind === 'TEAR') {
            ctx.translate(pt.x, pt.y);
            ctx.rotate(Math.atan2(pt.vy, pt.vx));
            ctx.fillStyle = '#38bdf8';
            ctx.strokeStyle = '#0284c7';
            ctx.lineWidth = 1.4;
            ctx.beginPath();
            ctx.ellipse(0, 0, pt.size * 1.25, pt.size * 0.65, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
          } else {
            // Fluffy cartoon dust puff
            ctx.fillStyle = pt.color;
            const r = pt.size * (0.7 + (pt.life / pt.maxLife) * 0.65);
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, r, 0, Math.PI * 2);
            ctx.arc(pt.x + r * 0.65, pt.y - r * 0.2, r * 0.75, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.restore();
          nextParticles.push(pt);
        }
      }
      particlesRef.current = nextParticles;

      // 5. Comic Speech Bubbles on top of everything
      if (dogBubble) {
        drawComicBubble(dogX + 10, dogY - 158, dogBubble.text, dogBubble);
      }
      if (winnerBubble) {
        const winActor = actorsRef.current.find((a) => a.isWinner);
        if (winActor) {
          drawComicBubble(winActor.x - 10, winActor.y - 196, winnerBubble, {
            bg: '#ffffff',
            fg: '#dc2626',
            scale: 1.05,
          });
        }
      }

      ctx.restore();
      rafRef.current = requestAnimationFrame(render);
    };

    rafRef.current = requestAnimationFrame(render);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [paceMode]);

  const handleStart = () => {
    if (running || !assetsReady || students.length === 0) return;
    void unlockGameAudio().then((ok) => {
      if (ok && !mutedRef.current && simRef.current.active) {
        startChaseMusic();
      }
    });

    const winner = students[cryptoRandomInt(students.length)];
    const others = students.filter((s) => s.id !== winner.id);
    const chosenOthers = others.slice(0, Math.max(0, MAX_VISIBLE_CROWD - 1));
    const crowd = [...chosenOthers, winner];

    for (let i = crowd.length - 1; i > 0; i--) {
      const j = cryptoRandomInt(i + 1);
      [crowd[i], crowd[j]] = [crowd[j], crowd[i]];
    }

    const cols = Math.max(1, Math.ceil(crowd.length / DEPTH_LANES.length));
    actorsRef.current = crowd.map((st, idx) => {
      const h = hashCode(st.id + st.name);
      const laneIdx = idx % DEPTH_LANES.length;
      const col = Math.floor(idx / DEPTH_LANES.length);
      const lane = DEPTH_LANES[laneIdx];
      const spreadX = Math.min(76, 560 / Math.max(1, cols));
      const isWinner = st.id === winner.id;
      return {
        student: st,
        isGirl: inferIsFemale(st, idx),
        x: 445 + col * spreadX + (laneIdx % 2) * 32 + ((h % 18) - 9),
        y: lane.y,
        laneY: lane.y,
        laneScale: lane.scale,
        heightVar: 0.96 + (h % 9) * 0.01,
        phaseOffset: (h % 100) / 14,
        isWinner,
        escapeAt: isWinner ? 1.5 : 0.22 + (idx / Math.max(1, crowd.length)) * 0.72,
        escaped: false,
      };
    });

    // Keep petals, clear transient chase particles
    particlesRef.current = particlesRef.current.filter((pt) => pt.kind === 'PETAL');

    simRef.current = {
      active: true,
      startTime: performance.now(),
      durationMs: TOTAL_MS_BY_PACE[paceMode],
      scrollX: 0,
      barked: false,
      barkTime: 0,
      danceStarted: false,
      winner,
      finished: false,
    };

    setRunning(true);
    setStatusText('🐕 Chú chó đang lững thững tiến lại cổng trường...');
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-3 sm:p-4 gap-3.5 select-none">
      <div className="w-full max-w-6xl rounded-3xl overflow-hidden border-2 border-amber-300/40 shadow-[0_20px_60px_rgba(0,0,0,0.45)] bg-slate-900 relative">
        <canvas
          ref={canvasRef}
          className="w-full h-auto block aspect-[2/1]"
        />
        <div className="absolute top-3 left-3 px-3.5 py-1.5 rounded-full bg-slate-950/75 border border-white/15 text-white text-xs sm:text-sm font-bold backdrop-blur-md shadow-lg">
          {statusText}
        </div>
      </div>

      <button
        type="button"
        disabled={running || !assetsReady || students.length === 0}
        onClick={handleStart}
        className="px-8 py-3.5 rounded-2xl bg-gradient-to-r from-amber-400 via-orange-500 to-rose-500 hover:brightness-110 disabled:opacity-50 text-slate-950 font-black text-base sm:text-lg shadow-xl shadow-orange-500/30 transition active:scale-95"
      >
        {!assetsReady
          ? '🎨 Đang chuẩn bị bối cảnh...'
          : running
            ? '🐕 Đang rượt kiểm tra bài...'
            : students.length === 0
              ? 'Danh sách học sinh trống'
              : '🐕 THẢ CHÓ KIỂM TRA BÀI!'}
      </button>
    </div>
  );
};

export default DogChaseGame;
