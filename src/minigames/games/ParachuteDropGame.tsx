import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ConfettiBurst } from '../../components/game/ConfettiBurst';
import {
  playCatchSound,
  playWheelTick,
  playWinnerFanfare,
  startLobbyMusic,
  stopBackgroundMusic,
  unlockGameAudio,
} from '../../utils/gameAudio';
import { cryptoShuffle } from '../rosterStorage';
import { useMinigameStageSettings, type PaceMode } from '../stageContext';
import type { MinigameProps, RosterStudent } from '../types';

const VIEW_W = 1280;
const VIEW_H = 620;

const WORLD_W = 2160;
const WORLD_H = 920;

// Cliff geometry in world coordinates
const CLIFF_W = 540;
const CLIFF_H = 720;
const CLIFF_X = 0;
const CLIFF_Y = 230;
// Top green grass ledge in cliff.png sits around 12.5% of image height (~y = 320 in world)
const CLIFF_LEDGE_Y = CLIFF_Y + CLIFF_H * 0.135;
const CLIFF_EDGE_X = 335;

const FLIGHT_MS_BY_PACE: Record<PaceMode, number> = {
  TURBO: 3600,
  FAST: 8500,
  NORMAL: 15500,
  EPIC: 23000,
};

const ASSET_PATHS = {
  bgValley: '/assets/minigames/nhay-du/bg-valley.jpg',
  cliff: '/assets/minigames/nhay-du/cliff.png',
  boyFly: '/assets/minigames/nhay-du/hs-nam-fly.png',
  girlFly: '/assets/minigames/nhay-du/hs-nu-fly.png',
  boyCharred: '/assets/minigames/nhay-du/hs-nam-charred.png',
  girlCharred: '/assets/minigames/nhay-du/hs-nu-charred.png',
  stormCloud: '/assets/minigames/nhay-du/storm-cloud.png',
  flyingDuck: '/assets/minigames/nhay-du/flying-duck.png',
} as const;

type AssetKey = keyof typeof ASSET_PATHS;
type LoadedAssets = Record<AssetKey, HTMLImageElement>;

type GamePhase = 'IDLE' | 'COUNTDOWN' | 'FLYING' | 'ZOOM_REVEAL';
type RuleMode = 'NEAREST' | 'FARTHEST';

const PARACHUTE_PALETTES: Array<[string, string, string]> = [
  ['#ef4444', '#fde047', '#ffffff'],
  ['#3b82f6', '#fb923c', '#fef08a'],
  ['#a855f7', '#f472b6', '#ffffff'],
  ['#10b981', '#facc15', '#ecfdf5'],
  ['#f97316', '#06b6d4', '#ffffff'],
  ['#ec4899', '#38bdf8', '#fef9c3'],
  ['#eab308', '#ef4444', '#3b82f6'],
  ['#14b8a6', '#f43f5e', '#ffffff'],
];

const FEMALE_TOKENS = new Set([
  'thị', 'ngọc', 'lan', 'linh', 'vy', 'nhi', 'thảo', 'trúc', 'hà', 'hân',
  'quỳnh', 'ngân', 'yến', 'mai', 'duyên', 'châu', 'trang', 'hương', 'phương',
  'hoa', 'thu', 'thủy', 'nga', 'nhung', 'my', 'chi', 'tiên',
  'trinh', 'oanh', 'ly', 'huyền', 'hiền', 'vân', 'nguyệt', 'bích', 'diễm',
  'tuyết', 'như', 'uyên', 'tâm', 'hạnh', 'đào', 'nhã', 'khuê', 'thư',
]);

const MALE_TOKENS = new Set([
  'văn', 'bảo', 'duy', 'huy', 'kiệt', 'long', 'nam', 'phong', 'sơn', 'tuấn',
  'vinh', 'hùng', 'hưng', 'hiếu', 'khang', 'khôi', 'mạnh', 'đức', 'hoàng',
  'quốc', 'tùng', 'đạt', 'trung', 'dũng', 'khoa', 'phúc', 'quân', 'thịnh',
  'tiến', 'tài', 'cường', 'nhật', 'lâm', 'nghĩa', 'trí', 'thành', 'hải',
  'quang', 'toàn', 'sang', 'phát', 'bình', 'thắng', 'công', 'tân', 'trọng',
  'tấn', 'khải', 'triết', 'vũ', 'lộc', 'nhân', 'anh',
]);

function guessIsGirl(student: RosterStudent, index: number): boolean {
  const g = (student.gender || '').toLowerCase().trim();
  if (g === 'nữ' || g === 'nu' || g === 'female' || g === 'f') return true;
  if (g === 'nam' || g === 'male' || g === 'm') return false;
  const tokens = student.name.toLowerCase().trim().split(/\s+/);
  if (tokens.includes('thị')) return true;
  if (tokens.includes('văn')) return false;
  const given = tokens[tokens.length - 1];
  if (FEMALE_TOKENS.has(given)) return true;
  if (MALE_TOKENS.has(given)) return false;
  for (const t of tokens) {
    if (FEMALE_TOKENS.has(t)) return true;
    if (MALE_TOKENS.has(t)) return false;
  }
  return index % 2 === 1;
}

function getShortName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length <= 2) return fullName.trim();
  return parts.slice(-2).join(' ');
}

function playZapSound(muted: boolean): void {
  if (muted) return;
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(680, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(95, ctx.currentTime + 0.28);
    gain.gain.setValueAtTime(0.24, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.32);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.34);
    osc.onended = () => ctx.close().catch(() => {});
  } catch {
    // Ignore audio error
  }
}

interface Jumper {
  student: RosterStudent;
  shortName: string;
  isGirl: boolean;
  palette: [string, string, string];
  // Starting position on cliff top
  startX: number;
  startY: number;
  // Current world position
  x: number;
  y: number;
  // Predetermined target landing spot (fairly randomized!)
  targetX: number;
  targetY: number;
  // Flight timing
  jumpDelay: number; // 0..0.45s stagger
  flightDuration: number; // fraction of total flight window (0.68..0.98)
  swayPhase: number;
  swayAmp: number;
  // Status & hilarious mid-air events
  isWinner: boolean;
  willGetZapped: boolean;
  zapAtProgress: number; // 0..1
  isZapped: boolean;
  willHitDuck: boolean;
  duckAtProgress: number;
  duckTriggered: boolean;
  willGetBoost: boolean;
  boostAtProgress: number;
  boostTriggered: boolean;
  landed: boolean;
  badgeText: string;
  badgeColor: string;
  badgeUntilMs: number;
}

interface ActiveDuck {
  x: number;
  y: number;
  vx: number;
  vy: number;
  flapPhase: number;
}

interface ActiveCloud {
  x: number;
  y: number;
  alpha: number;
  boltAlpha: number;
  bornMs: number;
}

interface SmokePuff {
  x: number;
  y: number;
  r: number;
  vy: number;
  alpha: number;
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawParachuteCanopy(
  ctx: CanvasRenderingContext2D,
  cx: number,
  topY: number,
  width: number,
  height: number,
  palette: [string, string, string],
  handLeftX: number,
  handRightX: number,
  handY: number,
): void {
  const halfW = width / 2;
  const bottomY = topY + height;

  // Suspension cords connecting canopy rim to both raised hands
  ctx.save();
  ctx.strokeStyle = '#3b2416';
  ctx.lineWidth = 1.8;
  const attachOffsets = [-0.9, -0.45, 0, 0.45, 0.9];
  attachOffsets.forEach((f, idx) => {
    const ax = cx + halfW * f;
    const tx = idx < 2 ? handLeftX : idx > 2 ? handRightX : (handLeftX + handRightX) / 2;
    ctx.beginPath();
    ctx.moveTo(ax, bottomY - 2);
    ctx.lineTo(tx, handY);
    ctx.stroke();
  });

  // 5 colorful scalloped panels
  const panels = 5;
  for (let i = 0; i < panels; i++) {
    const t0 = i / panels;
    const t1 = (i + 1) / panels;
    const x0 = cx - halfW + width * t0;
    const x1 = cx - halfW + width * t1;
    const midX = (x0 + x1) / 2;

    ctx.beginPath();
    ctx.moveTo(cx, topY);
    ctx.quadraticCurveTo(x0, topY + height * 0.15, x0, bottomY);
    ctx.quadraticCurveTo(midX, bottomY - 7, x1, bottomY);
    ctx.quadraticCurveTo(x1, topY + height * 0.15, cx, topY);
    ctx.closePath();
    ctx.fillStyle = palette[i % palette.length];
    ctx.fill();
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = '#2b1b17';
    ctx.stroke();
  }

  // Glossy cel-shaded highlight arc
  ctx.beginPath();
  ctx.arc(cx - width * 0.14, topY + height * 0.36, width * 0.16, Math.PI * 1.1, Math.PI * 1.65);
  ctx.strokeStyle = 'rgba(255,255,255,0.45)';
  ctx.lineWidth = 3.5;
  ctx.lineCap = 'round';
  ctx.stroke();
  ctx.restore();
}

function drawWindsock(ctx: CanvasRenderingContext2D, x: number, baseY: number, tSec: number): void {
  ctx.save();
  // Pole
  ctx.strokeStyle = '#475569';
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x, baseY);
  ctx.lineTo(x, baseY - 95);
  ctx.stroke();

  // Animated striped windsock flapping right
  const poleTopY = baseY - 90;
  const flutter = Math.sin(tSec * 7.5) * 6;
  const segments = 4;
  const segLen = 15;
  for (let i = 0; i < segments; i++) {
    const x0 = x + 3 + i * segLen;
    const x1 = x0 + segLen;
    const yOff0 = Math.sin(tSec * 7.5 - i * 0.7) * (2 + i * 1.8);
    const yOff1 = Math.sin(tSec * 7.5 - (i + 1) * 0.7) * (2 + (i + 1) * 1.8);
    const h0 = 22 - i * 3.5;
    const h1 = 22 - (i + 1) * 3.5;

    ctx.beginPath();
    ctx.moveTo(x0, poleTopY - h0 / 2 + yOff0);
    ctx.lineTo(x1, poleTopY - h1 / 2 + yOff1 + flutter * 0.15);
    ctx.lineTo(x1, poleTopY + h1 / 2 + yOff1 + flutter * 0.15);
    ctx.lineTo(x0, poleTopY + h0 / 2 + yOff0);
    ctx.closePath();
    ctx.fillStyle = i % 2 === 0 ? '#ef4444' : '#ffffff';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#2b1b17';
    ctx.stroke();
  }
  ctx.restore();
}

function createInitialJumpers(students: RosterStudent[]): Jumper[] {
  const n = students.length;
  if (n === 0) return [];
  const leftBound = 92;
  const rightBound = CLIFF_EDGE_X - 24;
  const span = Math.max(40, rightBound - leftBound);

  return students.map((student, i) => {
    const frac = n === 1 ? 0.5 : i / (n - 1);
    const row = n > 14 ? i % 2 : 0;
    const startX = leftBound + frac * span;
    const startY = CLIFF_LEDGE_Y - (row === 1 ? 14 : 0);
    return {
      student,
      shortName: getShortName(student.name),
      isGirl: guessIsGirl(student, i),
      palette: PARACHUTE_PALETTES[i % PARACHUTE_PALETTES.length],
      startX,
      startY,
      x: startX,
      y: startY,
      targetX: startX + 600,
      targetY: 790,
      jumpDelay: 0,
      flightDuration: 0.85,
      swayPhase: (i * 1.63) % (Math.PI * 2),
      swayAmp: 22 + (i % 4) * 9,
      isWinner: false,
      willGetZapped: false,
      zapAtProgress: 0.45,
      isZapped: false,
      willHitDuck: false,
      duckAtProgress: 0.35,
      duckTriggered: false,
      willGetBoost: false,
      boostAtProgress: 0.5,
      boostTriggered: false,
      landed: false,
      badgeText: '',
      badgeColor: '#ef4444',
      badgeUntilMs: 0,
    };
  });
}

export const ParachuteDropGame: React.FC<MinigameProps> = ({
  students,
  allStudents,
  onPickStudent,
  muted,
}) => {
  const { paceMode } = useMinigameStageSettings();

  const [assets, setAssets] = useState<LoadedAssets | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [phase, setPhase] = useState<GamePhase>('IDLE');
  const [ruleMode, setRuleMode] = useState<RuleMode>('NEAREST');
  const [countdownNum, setCountdownNum] = useState<string>('');
  const [winner, setWinner] = useState<RosterStudent | null>(null);
  const [winnerReason, setWinnerReason] = useState<string>('');
  const [showConfetti, setShowConfetti] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  const paceRef = useRef(paceMode);
  paceRef.current = paceMode;
  const ruleRef = useRef(ruleMode);
  ruleRef.current = ruleMode;

  const totalCount = allStudents.length;

  const simRef = useRef<{
    phase: GamePhase;
    phaseStartMs: number;
    flightTotalMs: number;
    jumpers: Jumper[];
    winner: RosterStudent | null;
    ducks: ActiveDuck[];
    clouds: ActiveCloud[];
    smoke: SmokePuff[];
    // Camera state (world center & zoom)
    camX: number;
    camY: number;
    camZoom: number;
    lastCountdownStep: number;
  }>({
    phase: 'IDLE',
    phaseStartMs: 0,
    flightTotalMs: FLIGHT_MS_BY_PACE.NORMAL,
    jumpers: [],
    winner: null,
    ducks: [],
    clouds: [],
    smoke: [],
    camX: 600,
    camY: 420,
    camZoom: 1.0,
    lastCountdownStep: -1,
  });

  // Preload all 8 CHIBI_CEL assets
  useEffect(() => {
    let cancelled = false;
    const entries = Object.entries(ASSET_PATHS) as [AssetKey, string][];
    Promise.all(
      entries.map(
        ([key, src]) =>
          new Promise<[AssetKey, HTMLImageElement]>((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve([key, img]);
            img.onerror = () => reject(new Error(`Không tải được ảnh: ${src}`));
            img.src = src;
          }),
      ),
    )
      .then((loaded) => {
        if (cancelled) return;
        const map = {} as LoadedAssets;
        for (const [k, img] of loaded) map[k] = img;
        setAssets(map);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Lỗi tải đồ họa');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Refresh lineup on cliff when students change in IDLE
  useEffect(() => {
    if (simRef.current.phase === 'IDLE') {
      simRef.current.jumpers = createInitialJumpers(students);
      simRef.current.ducks = [];
      simRef.current.clouds = [];
      simRef.current.smoke = [];
    }
  }, [students]);

  useEffect(() => {
    return () => {
      stopBackgroundMusic();
    };
  }, []);

  const startJump = useCallback(() => {
    if (students.length === 0) return;
    unlockGameAudio();
    if (!mutedRef.current) startLobbyMusic();

    const shuffled = cryptoShuffle([...students]);
    const chosenWinner = shuffled[0];
    const isNearest = ruleRef.current === 'NEAREST';

    const jumpers = createInitialJumpers(students);
    const others = cryptoShuffle(jumpers.filter((j) => j.student.id !== chosenWinner.id));

    // Assign dramatic landing spots across the lush valley!
    jumpers.forEach((j) => {
      j.jumpDelay = Math.random() * 0.35;
      j.landed = false;
      j.isZapped = false;
      j.duckTriggered = false;
      j.boostTriggered = false;
      j.badgeText = '';
      j.badgeUntilMs = 0;

      if (j.student.id === chosenWinner.id) {
        j.isWinner = true;
        if (isNearest) {
          // Closest to the cliff edge (gets hilariously zapped by lightning!)
          j.targetX = 595 + Math.random() * 95;
          j.targetY = 815 + Math.random() * 30;
          j.flightDuration = 0.62;
          j.willGetZapped = true;
          j.zapAtProgress = 0.44 + Math.random() * 0.14;
        } else {
          // Farthest across the valley (lands right on the red-tiled rooftop!)
          j.targetX = 1915 + Math.random() * 110;
          j.targetY = 765 + Math.random() * 45;
          j.flightDuration = 0.96;
          j.willGetBoost = true;
          j.boostAtProgress = 0.42;
        }
      }
    });

    // Spread all other students organically across the valley so the race looks packed & exciting
    others.forEach((j, idx) => {
      const frac = others.length <= 1 ? 0.5 : idx / (others.length - 1);
      if (isNearest) {
        // Safely farther than the nearest loser (820 .. 2010)
        j.targetX = 830 + frac * 1160 + (Math.random() - 0.5) * 70;
        j.targetY = 765 + (idx % 4) * 26 + Math.random() * 14;
        j.flightDuration = 0.72 + Math.random() * 0.24;
      } else {
        // Safely closer than the farthest winner (640 .. 1760)
        j.targetX = 640 + frac * 1100 + (Math.random() - 0.5) * 70;
        j.targetY = 770 + (idx % 4) * 26 + Math.random() * 14;
        j.flightDuration = 0.68 + Math.random() * 0.24;
      }

      // Assign hilarious duck collisions to ~20% of jumpers (at least 1-2 ducks!)
      if (idx === 0 || (idx < 4 && Math.random() < 0.45)) {
        j.willHitDuck = true;
        j.duckAtProgress = 0.28 + Math.random() * 0.32;
      } else if (idx >= others.length - 2 && isNearest) {
        // 1-2 lucky flyers get a tailwind boost all the way to the rooftops/haystacks
        j.willGetBoost = true;
        j.boostAtProgress = 0.35 + Math.random() * 0.2;
      }
    });

    const now = performance.now();
    simRef.current.phase = 'COUNTDOWN';
    simRef.current.phaseStartMs = now;
    simRef.current.flightTotalMs = FLIGHT_MS_BY_PACE[paceRef.current];
    simRef.current.jumpers = jumpers;
    simRef.current.winner = chosenWinner;
    simRef.current.ducks = [];
    simRef.current.clouds = [];
    simRef.current.smoke = [];
    simRef.current.lastCountdownStep = -1;

    setWinner(null);
    setWinnerReason('');
    setShowConfetti(false);
    setCountdownNum('3');
    setPhase('COUNTDOWN');
  }, [students]);

  const resetToCliff = useCallback(() => {
    stopBackgroundMusic();
    simRef.current.phase = 'IDLE';
    simRef.current.jumpers = createInitialJumpers(students);
    simRef.current.winner = null;
    simRef.current.ducks = [];
    simRef.current.clouds = [];
    simRef.current.smoke = [];
    setWinner(null);
    setWinnerReason('');
    setShowConfetti(false);
    setCountdownNum('');
    setPhase('IDLE');
  }, [students]);

  // Main 60fps Canvas Loop with Dynamic Camera Follow & Zoom
  useEffect(() => {
    if (!assets) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let rafId = 0;
    let lastTime = performance.now();

    const render = (now: number) => {
      const dt = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000));
      lastTime = now;
      const tSec = now / 1000;
      const sim = simRef.current;

      // --- 1. UPDATE SIMULATION & CAMERA TARGET ---
      let targetCamX = 640;
      let targetCamY = 420;
      let targetCamZoom = 1.0;

      if (sim.phase === 'IDLE') {
        targetCamX = 600;
        targetCamY = 395;
        targetCamZoom = 1.06;
      } else if (sim.phase === 'COUNTDOWN') {
        const elapsed = (now - sim.phaseStartMs) / 1000;
        targetCamX = 600;
        targetCamY = 395;
        targetCamZoom = 1.08;

        const step = elapsed < 0.7 ? 0 : elapsed < 1.4 ? 1 : elapsed < 2.1 ? 2 : 3;
        if (step !== sim.lastCountdownStep) {
          sim.lastCountdownStep = step;
          if (step === 0) {
            setCountdownNum('3');
            if (!mutedRef.current) playWheelTick();
          } else if (step === 1) {
            setCountdownNum('2');
            if (!mutedRef.current) playWheelTick();
          } else if (step === 2) {
            setCountdownNum('1');
            if (!mutedRef.current) playWheelTick();
          } else {
            setCountdownNum('NHẢY!');
            if (!mutedRef.current) playCatchSound();
          }
        }
        if (elapsed >= 2.55) {
          sim.phase = 'FLYING';
          sim.phaseStartMs = now;
          setPhase('FLYING');
          setCountdownNum('');
        }
      } else if (sim.phase === 'FLYING') {
        const elapsedMs = now - sim.phaseStartMs;
        const totalSec = sim.flightTotalMs / 1000;
        let allLanded = true;
        let sumX = 0;
        let sumY = 0;

        for (const j of sim.jumpers) {
          const jElapsed = elapsedMs / 1000 - j.jumpDelay;
          if (jElapsed <= 0) {
            allLanded = false;
            sumX += j.x;
            sumY += j.y;
            continue;
          }

          const dur = Math.max(1.8, totalSec * j.flightDuration);
          const u = Math.min(1, jElapsed / dur);

          // Trigger hilarious mid-air events
          if (j.willGetZapped && !j.isZapped && u >= j.zapAtProgress) {
            j.isZapped = true;
            j.badgeText = '⚡ BỊ SÉT ĐÁNH!';
            j.badgeColor = '#dc2626';
            j.badgeUntilMs = now + 2600;
            sim.clouds.push({
              x: j.x,
              y: j.y - 105,
              alpha: 1,
              boltAlpha: 1,
              bornMs: now,
            });
            playZapSound(mutedRef.current);
          }

          if (j.willHitDuck && !j.duckTriggered && u >= j.duckAtProgress) {
            j.duckTriggered = true;
            j.badgeText = '🦆 GIẢM TỐC ĐỘ!';
            j.badgeColor = '#ea580c';
            j.badgeUntilMs = now + 2000;
            sim.ducks.push({
              x: j.x + 260,
              y: j.y - 25,
              vx: -540,
              vy: (Math.random() - 0.5) * 40,
              flapPhase: Math.random() * Math.PI * 2,
            });
            if (!mutedRef.current) playWheelTick();
          }

          if (j.willGetBoost && !j.boostTriggered && u >= j.boostAtProgress) {
            j.boostTriggered = true;
            j.badgeText = '💨 GẶP GIÓ XUÔI!';
            j.badgeColor = '#0284c7';
            j.badgeUntilMs = now + 2000;
          }

          // Compute flight trajectory (smooth leap off cliff -> gentle swaying parachute glide -> drop if zapped!)
          if (u < 1) {
            allLanded = false;
            // Initial upward hop off the cliff during u = 0..0.14
            const leapArc = u < 0.16 ? Math.sin((u / 0.16) * Math.PI) * 95 : 0;

            // Horizontal glide ease
            let horizU = 1 - Math.pow(1 - u, 1.35);
            if (j.isZapped) {
              // Once zapped, horizontal drift stalls sharply and falls steeply!
              const zapHoriz = 1 - Math.pow(1 - j.zapAtProgress, 1.35);
              const postU = (u - j.zapAtProgress) / Math.max(0.01, 1 - j.zapAtProgress);
              horizU = zapHoriz + (1 - zapHoriz) * Math.pow(postU, 0.5) * 0.35;
              // Fast gravity drop after zap
              const fallY = j.startY + (j.targetY - j.startY) * (j.zapAtProgress + (1 - j.zapAtProgress) * Math.pow(postU, 0.72));
              j.x = j.startX + (j.targetX - j.startX) * Math.min(1, horizU + (1 - horizU) * postU);
              j.y = fallY;

              // Emit comical dark smoke puffs while falling charred!
              if (Math.random() < 0.42) {
                sim.smoke.push({
                  x: j.x + (Math.random() - 0.5) * 24,
                  y: j.y - 24,
                  r: 8 + Math.random() * 10,
                  vy: -35 - Math.random() * 30,
                  alpha: 0.72,
                });
              }
            } else {
              const sway = Math.sin(tSec * 2.8 + j.swayPhase) * j.swayAmp * Math.sin(u * Math.PI);
              j.x = j.startX + (j.targetX - j.startX) * horizU + sway;
              j.y = j.startY + (j.targetY - j.startY) * Math.pow(u, 1.15) - leapArc;
            }
          } else {
            if (!j.landed) {
              j.landed = true;
              j.x = j.targetX;
              j.y = j.targetY;
              if (!j.isZapped) {
                if (j.targetX > 1840) {
                  j.badgeText = '🏠 TRÊN NÓC NHÀ!';
                  j.badgeColor = '#16a34a';
                  j.badgeUntilMs = now + 2600;
                } else if (j.targetX > 1580) {
                  j.badgeText = '🌾 ĐỐNG RƠM!';
                  j.badgeColor = '#ca8a04';
                  j.badgeUntilMs = now + 2400;
                }
              }
            }
          }

          sumX += j.x;
          sumY += j.y;
        }

        // Camera glides from cliff out into wide valley panorama tracking the flock
        const avgX = sumX / Math.max(1, sim.jumpers.length);
        const avgY = sumY / Math.max(1, sim.jumpers.length);
        const flightProg = Math.min(1, elapsedMs / sim.flightTotalMs);
        const minSafeZoom = Math.max(VIEW_W / WORLD_W, VIEW_H / WORLD_H) + 0.01;
        targetCamZoom = flightProg < 0.15 ? 0.96 : Math.max(minSafeZoom, 0.69);
        targetCamX = Math.max(VIEW_W / (2 * targetCamZoom), Math.min(WORLD_W - VIEW_W / (2 * targetCamZoom), avgX + 60));
        targetCamY = Math.max(VIEW_H / (2 * targetCamZoom), Math.min(WORLD_H - VIEW_H / (2 * targetCamZoom), avgY - 40));

        if (allLanded && elapsedMs > sim.flightTotalMs * 0.78) {
          sim.phase = 'ZOOM_REVEAL';
          sim.phaseStartMs = now;
          stopBackgroundMusic();
          setPhase('ZOOM_REVEAL');
          if (sim.winner) {
            setWinner(sim.winner);
            setWinnerReason(
              ruleRef.current === 'NEAREST'
                ? 'BAY GẦN NHẤT — THUA RỒI!'
                : 'BAY XA NHẤT — LÊN BẢNG!',
            );
            setShowConfetti(true);
            if (!mutedRef.current) {
              playCatchSound();
              setTimeout(() => {
                if (!mutedRef.current) playWinnerFanfare();
              }, 260);
            }
            onPickStudent(
              sim.winner,
              ruleRef.current === 'NEAREST'
                ? 'Bay gần nhất trong Nhảy Dù Trả Bài'
                : 'Bay xa nhất trong Nhảy Dù Trả Bài',
            );
          }
        }
      } else if (sim.phase === 'ZOOM_REVEAL') {
        const winJumper = sim.jumpers.find((j) => j.isWinner);
        if (winJumper) {
          targetCamZoom = 1.38;
          targetCamX = Math.max(
            VIEW_W / (2 * targetCamZoom),
            Math.min(WORLD_W - VIEW_W / (2 * targetCamZoom), winJumper.x),
          );
          targetCamY = Math.max(
            VIEW_H / (2 * targetCamZoom),
            Math.min(WORLD_H - VIEW_H / (2 * targetCamZoom), winJumper.y - 75),
          );
          // Keep emitting tiny comical smoke puffs if winner got zapped!
          if (winJumper.isZapped && Math.random() < 0.16) {
            sim.smoke.push({
              x: winJumper.x + (Math.random() - 0.5) * 18,
              y: winJumper.y - 46,
              r: 6 + Math.random() * 7,
              vy: -24 - Math.random() * 18,
              alpha: 0.55,
            });
          }
        }
      }

      // Smooth camera interpolation
      const camLerp = Math.min(1, dt * 3.8);
      sim.camX += (targetCamX - sim.camX) * camLerp;
      sim.camY += (targetCamY - sim.camY) * camLerp;
      sim.camZoom += (targetCamZoom - sim.camZoom) * camLerp;

      // Update hazards & particles
      for (const d of sim.ducks) {
        d.x += d.vx * dt;
        d.y += d.vy * dt + Math.sin(tSec * 14 + d.flapPhase) * 28 * dt;
      }
      sim.ducks = sim.ducks.filter((d) => d.x > -200);

      for (const c of sim.clouds) {
        const age = (now - c.bornMs) / 1000;
        c.boltAlpha = age < 0.45 ? 1 - age / 0.45 : 0;
        c.alpha = age < 1.3 ? 1 : Math.max(0, 1 - (age - 1.3) / 0.7);
      }
      sim.clouds = sim.clouds.filter((c) => c.alpha > 0.02);

      for (const s of sim.smoke) {
        s.y += s.vy * dt;
        s.r += dt * 10;
        s.alpha -= dt * 0.65;
      }
      sim.smoke = sim.smoke.filter((s) => s.alpha > 0.02);

      // --- 2. RENDER WORLD WITH CAMERA TRANSFORM ---
      const dpr = window.devicePixelRatio || 1;
      if (canvas.width !== VIEW_W * dpr || canvas.height !== VIEW_H * dpr) {
        canvas.width = VIEW_W * dpr;
        canvas.height = VIEW_H * dpr;
      }

      ctx.save();
      ctx.scale(dpr, dpr);

      // Apply camera transform
      ctx.translate(VIEW_W / 2, VIEW_H / 2);
      ctx.scale(sim.camZoom, sim.camZoom);
      ctx.translate(-sim.camX, -sim.camY);

      // 2A. Panoramic Vietnamese Valley Backdrop
      ctx.drawImage(assets.bgValley, 0, 0, WORLD_W, WORLD_H);

      // 2B. Left Cliff & Flapping Windsock
      ctx.drawImage(assets.cliff, CLIFF_X, CLIFF_Y, CLIFF_W, CLIFF_H);
      drawWindsock(ctx, 56, CLIFF_LEDGE_Y + 4, tSec);

      // 2C. Smoke puffs behind characters
      for (const s of sim.smoke) {
        ctx.save();
        ctx.fillStyle = `rgba(71, 85, 105, ${s.alpha})`;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // 2D. Jumpers (sorted by Y for clean depth overlap)
      const sortedJumpers = [...sim.jumpers].sort((a, b) => a.y - b.y);
      const baseSpriteH = sim.jumpers.length > 26 ? 68 : 78;

      for (const j of sortedJumpers) {
        const isAirborne = sim.phase === 'FLYING' && !j.landed && (now - sim.phaseStartMs) / 1000 > j.jumpDelay;
        const showParachute = isAirborne && !j.isZapped;

        const sprite = j.isZapped
          ? j.isGirl
            ? assets.girlCharred
            : assets.boyCharred
          : j.isGirl
            ? assets.girlFly
            : assets.boyFly;

        const drawH = baseSpriteH;
        const drawW = (sprite.width / sprite.height) * drawH;

        const idleBounce =
          sim.phase === 'IDLE' || sim.phase === 'COUNTDOWN'
            ? Math.abs(Math.sin(tSec * 4.5 + j.swayPhase)) * -5
            : 0;
        const swayTilt = showParachute ? Math.sin(tSec * 2.8 + j.swayPhase) * 0.14 : j.isZapped && !j.landed ? Math.sin(tSec * 16) * 0.28 : 0;

        ctx.save();
        ctx.translate(j.x, j.y + idleBounce);

        // Ground shadow when standing on cliff or landed
        if (!isAirborne) {
          ctx.fillStyle = 'rgba(15, 23, 42, 0.25)';
          ctx.beginPath();
          ctx.ellipse(0, 2, drawW * 0.34, 6, 0, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.rotate(swayTilt);

        // Draw Parachute canopy & ropes above character while gliding!
        if (showParachute) {
          drawParachuteCanopy(
            ctx,
            0,
            -drawH - 68,
            drawW * 1.95,
            46,
            j.palette,
            -drawW * 0.32,
            drawW * 0.32,
            -drawH * 0.72,
          );
        }

        // Draw student sprite (feet anchored at y = 0)
        ctx.drawImage(sprite, -drawW / 2, -drawH, drawW, drawH);
        ctx.restore();

        // Name Tag Pill below feet
        const tagFont = sim.jumpers.length > 26 ? 11 : 12;
        ctx.font = `800 ${tagFont}px system-ui, -apple-system, sans-serif`;
        const tw = ctx.measureText(j.shortName).width;
        const pw = Math.max(44, tw + 12);
        const ph = tagFont + 8;
        const px = j.x - pw / 2;
        const py = j.y + 6;

        ctx.save();
        drawRoundedRect(ctx, px, py, pw, ph, 6);
        ctx.fillStyle = j.isWinner && sim.phase === 'ZOOM_REVEAL' ? '#fef08a' : 'rgba(255,255,255,0.92)';
        ctx.fill();
        ctx.lineWidth = j.isWinner && sim.phase === 'ZOOM_REVEAL' ? 2.5 : 1.5;
        ctx.strokeStyle = j.isWinner && sim.phase === 'ZOOM_REVEAL' ? '#dc2626' : '#334155';
        ctx.stroke();
        ctx.fillStyle = j.isWinner && sim.phase === 'ZOOM_REVEAL' ? '#991b1b' : '#0f172a';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(j.shortName, j.x, py + ph / 2 + 0.5);
        ctx.restore();

        // Comic Event Callout Bubble above character!
        const showWinnerBubble = j.isWinner && sim.phase === 'ZOOM_REVEAL';
        const activeBadge = showWinnerBubble
          ? ruleRef.current === 'NEAREST'
            ? 'BAY GẦN NHẤT — THUA RỒI!'
            : 'BAY XA NHẤT — LÊN BẢNG!'
          : now < j.badgeUntilMs
            ? j.badgeText
            : '';

        if (activeBadge) {
          ctx.save();
          ctx.font = '900 13px system-ui, sans-serif';
          const bw = ctx.measureText(activeBadge).width + 18;
          const bh = 24;
          const bx = j.x - bw / 2;
          const by = j.y - drawH - (showParachute ? 96 : 34);
          drawRoundedRect(ctx, bx, by, bw, bh, 12);
          ctx.fillStyle = showWinnerBubble ? '#dc2626' : j.badgeColor;
          ctx.fill();
          ctx.lineWidth = 2;
          ctx.strokeStyle = '#ffffff';
          ctx.stroke();
          ctx.fillStyle = '#ffffff';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(activeBadge, j.x, by + bh / 2 + 0.5);
          ctx.restore();
        }
      }

      // 2E. Angry Storm Clouds & Lightning Zaps
      for (const c of sim.clouds) {
        ctx.save();
        ctx.globalAlpha = c.alpha;
        if (c.boltAlpha > 0.02) {
          ctx.strokeStyle = `rgba(254, 240, 138, ${c.boltAlpha})`;
          ctx.lineWidth = 6;
          ctx.shadowColor = '#facc15';
          ctx.shadowBlur = 18;
          ctx.beginPath();
          ctx.moveTo(c.x, c.y + 30);
          ctx.lineTo(c.x - 14, c.y + 68);
          ctx.lineTo(c.x + 12, c.y + 82);
          ctx.lineTo(c.x - 4, c.y + 125);
          ctx.stroke();
        }
        const cw = 136;
        const ch = (assets.stormCloud.height / assets.stormCloud.width) * cw;
        ctx.drawImage(assets.stormCloud, c.x - cw / 2, c.y - ch / 2, cw, ch);
        ctx.restore();
      }

      // 2F. Flying Ducks zooming across the sky
      for (const d of sim.ducks) {
        ctx.save();
        ctx.translate(d.x, d.y);
        // Flip horizontally so the duck faces LEFT (flying right-to-left)
        ctx.scale(-1, 1);
        const dw = 92;
        const dh = (assets.flyingDuck.height / assets.flyingDuck.width) * dw;
        ctx.drawImage(assets.flyingDuck, -dw / 2, -dh / 2, dw, dh);
        ctx.restore();
      }

      ctx.restore(); // End camera + DPR scale
      rafId = requestAnimationFrame(render);
    };

    rafId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(rafId);
  }, [assets, onPickStudent]);

  const isRunning = phase === 'COUNTDOWN' || phase === 'FLYING';

  return (
    <div className="w-full flex flex-col items-center gap-3 select-none">
      <ConfettiBurst active={showConfetti} />

      {/* Main 16:9 Cartoon Stage */}
      <div className="relative w-full max-w-6xl rounded-3xl overflow-hidden shadow-2xl border-4 border-sky-400/50 bg-sky-200">
        {/* Top Floating HUD */}
        <div className="absolute top-3 left-3 right-3 z-10 flex items-center justify-between gap-2 pointer-events-none">
          <span className="px-3.5 py-1.5 rounded-full bg-white/90 border-2 border-sky-600/40 text-slate-900 font-black text-xs sm:text-sm shadow">
            🪂 Còn {students.length}/{totalCount} bạn trên vách đá
          </span>

          <span className="px-4 py-1.5 rounded-full bg-amber-400 border-2 border-amber-900/70 text-amber-950 font-black text-xs sm:text-sm shadow-md uppercase tracking-wide">
            {ruleMode === 'NEAREST' ? '⚡ AI BAY GẦN NHẤT LÀ THUA!' : '🏠 AI BAY XA NHẤT LÊN BẢNG!'}
          </span>
        </div>

        {/* Big Cartoon Countdown Overlay */}
        {phase === 'COUNTDOWN' && countdownNum && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center pointer-events-none">
            <div
              key={countdownNum}
              className="text-7xl sm:text-9xl font-black text-yellow-300 drop-shadow-[0_6px_0_rgba(124,45,18,0.95)] animate-bounce"
            >
              {countdownNum}
            </div>
            <div className="mt-2 px-5 py-1.5 rounded-full bg-sky-900/80 border-2 border-yellow-300 text-white font-black text-sm sm:text-lg tracking-wider uppercase shadow-xl">
              {ruleMode === 'NEAREST' ? 'AI BAY GẦN NHẤT LÀ THUA!' : 'AI BAY XA NHẤT LÊN BẢNG!'}
            </div>
          </div>
        )}

        {/* Canvas or Loader */}
        {loadError ? (
          <div className="w-full aspect-[1280/620] flex items-center justify-center bg-sky-100 text-rose-700 font-bold p-6">
            ⚠️ {loadError}
          </div>
        ) : !assets ? (
          <div className="w-full aspect-[1280/620] flex flex-col items-center justify-center gap-3 bg-gradient-to-b from-sky-200 to-emerald-100 text-sky-950">
            <div className="w-10 h-10 rounded-full border-4 border-sky-600/30 border-t-sky-600 animate-spin" />
            <p className="font-bold text-sm">Đang chuẩn bị vách đá & dù lượn cho cả lớp...</p>
          </div>
        ) : (
          <canvas ref={canvasRef} className="w-full h-auto block aspect-[1280/620]" />
        )}

        {/* Winner Reveal Card Overlay (matches the video's parachute banner card!) */}
        {phase === 'ZOOM_REVEAL' && winner && (
          <div className="absolute top-14 left-1/2 -translate-x-1/2 z-20 w-[90%] max-w-md rounded-3xl bg-white/95 border-4 border-orange-500 shadow-[0_18px_45px_rgba(15,23,42,0.45)] p-5 text-center backdrop-blur-md">
            <div className="inline-block px-4 py-1 rounded-full bg-gradient-to-r from-red-500 to-orange-500 text-white font-black text-xs uppercase tracking-wider mb-2 shadow">
              🪂 {winnerReason}
            </div>
            <div className="text-2xl sm:text-3xl font-black text-slate-900 mb-1">
              {winner.name}
            </div>
            {winner.studentCode && (
              <div className="text-xs font-mono font-bold text-slate-500 mb-3">
                {winner.studentCode}
              </div>
            )}
            <button
              type="button"
              onClick={resetToCliff}
              className="mt-2 px-6 py-2.5 rounded-full bg-gradient-to-r from-orange-500 to-amber-500 hover:brightness-110 text-white font-black text-sm shadow-lg shadow-orange-500/30 transition active:scale-95"
            >
              🪂 Lượt nhảy tiếp theo
            </button>
          </div>
        )}
      </div>

      {/* Bottom Control Bar */}
      <div className="w-full max-w-4xl flex flex-wrap items-center justify-center gap-3 bg-slate-900/85 border border-sky-400/30 backdrop-blur-md rounded-2xl px-4 py-3 text-white shadow-xl">
        <button
          type="button"
          disabled={isRunning || !assets || students.length === 0}
          onClick={startJump}
          className="px-7 py-2.5 rounded-full bg-gradient-to-r from-orange-500 via-amber-500 to-yellow-400 hover:brightness-110 disabled:opacity-45 text-slate-950 font-black text-sm shadow-lg shadow-orange-500/30 transition active:scale-95"
        >
          🪂 Bắt đầu nhảy dù!
        </button>

        {/* Rule Mode Toggle */}
        <div className="flex items-center bg-black/40 p-1 rounded-full border border-white/15">
          <button
            type="button"
            disabled={isRunning}
            onClick={() => setRuleMode('NEAREST')}
            className={`px-3.5 py-1.5 rounded-full text-xs font-black transition ${
              ruleMode === 'NEAREST'
                ? 'bg-rose-500 text-white shadow'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            ⚡ Bay gần nhất lên bảng
          </button>
          <button
            type="button"
            disabled={isRunning}
            onClick={() => setRuleMode('FARTHEST')}
            className={`px-3.5 py-1.5 rounded-full text-xs font-black transition ${
              ruleMode === 'FARTHEST'
                ? 'bg-emerald-500 text-white shadow'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            🏠 Bay xa nhất lên bảng
          </button>
        </div>
      </div>
    </div>
  );
};

export default ParachuteDropGame;
