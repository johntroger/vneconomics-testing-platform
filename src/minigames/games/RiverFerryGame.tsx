import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ConfettiBurst } from '../../components/game/ConfettiBurst';
import {
  playCatchSound,
  playWheelTick,
  playWinnerFanfare,
  startLobbyMusic,
  stopBackgroundMusic,
  unlockGameAudio,
} from '../../utils/gameAudio';
import {
  cryptoShuffle,
  readMinigameStore,
  writeMinigameStore,
} from '../rosterStorage';
import { useMinigameStageSettings, type PaceMode } from '../stageContext';
import type { MinigameProps, RosterStudent } from '../types';

const LOGICAL_W = 1280;
const LOGICAL_H = 620;

const VOYAGE_MS_BY_PACE: Record<PaceMode, number> = {
  TURBO: 3600,
  FAST: 9000,
  NORMAL: 17000,
  EPIC: 26000,
};

const ASSET_PATHS = {
  bgRiver: '/assets/minigames/chuyen-do/bg-river.jpg',
  bgDock: '/assets/minigames/chuyen-do/bg-school-dock.jpg',
  boat: '/assets/minigames/chuyen-do/boat.png',
  teacher: '/assets/minigames/chuyen-do/teacher-row.png',
  boyAwake: '/assets/minigames/chuyen-do/hs-nam-awake.png',
  girlAwake: '/assets/minigames/chuyen-do/hs-nu-awake.png',
  boySleep: '/assets/minigames/chuyen-do/hs-nam-sleep.png',
  girlSleep: '/assets/minigames/chuyen-do/hs-nu-sleep.png',
} as const;

type AssetKey = keyof typeof ASSET_PATHS;
type LoadedAssets = Record<AssetKey, HTMLImageElement>;

type GamePhase = 'IDLE' | 'DEPART' | 'STORM' | 'ARRIVING' | 'DISEMBARK' | 'REVEAL';

interface Passenger {
  student: RosterStudent;
  shortName: string;
  isGirl: boolean;
  /** Seat coordinates relative to boat center */
  seatX: number;
  seatY: number;
  row: number;
  bobPhase: number;
  isSleepyWinner: boolean;
  /** Disembark animation (only for awake students) */
  leaveDelay: number;
  leaveProgress: number; // 0 = seated, 1 = inside school
  startWorldX: number;
  startWorldY: number;
  /** Brief decoy yawn during storm */
  decoyNodOffset: number;
}

interface RainDrop {
  x: number;
  y: number;
  len: number;
  speed: number;
  alpha: number;
}

interface FoamBubble {
  x: number;
  y: number;
  r: number;
  vx: number;
  vy: number;
  alpha: number;
}

const FEMALE_TOKENS = new Set([
  'thị', 'ngọc', 'lan', 'linh', 'vy', 'nhi', 'thảo', 'trúc', 'hà', 'hân',
  'quỳnh', 'ngân', 'yến', 'mai', 'duyên', 'châu', 'trang', 'hương', 'phương',
  'hoa', 'tâm', 'thu', 'thủy', 'thanh', 'nga', 'nhung', 'my', 'chi', 'tiên',
  'trinh', 'oanh', 'ly', 'huyền', 'giang', 'hiền', 'vân', 'nguyệt', 'bích',
]);

function guessIsGirl(name: string, index: number): boolean {
  const tokens = name.toLowerCase().trim().split(/\s+/);
  for (const t of tokens) {
    if (FEMALE_TOKENS.has(t)) return true;
  }
  return index % 2 === 1;
}

function getLastWordName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  return parts[parts.length - 1] || fullName.trim();
}

function playSoftThunder(muted: boolean): void {
  if (muted) return;
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const duration = 0.75;
    const bufferSize = Math.floor(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      const env = Math.pow(1 - i / bufferSize, 1.8);
      data[i] = (Math.random() * 2 - 1) * env;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(190, ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(55, ctx.currentTime + duration);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.22, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    noise.start();
    noise.onended = () => {
      ctx.close().catch(() => {});
    };
  } catch {
    // Ignore audio errors
  }
}

function layoutPassengers(students: RosterStudent[], winnerIds: Set<string>): Passenger[] {
  const count = students.length;
  if (count === 0) return [];

  // Seat area inside boat hull: x from -240 to +285 relative to boat center
  // Distribute across 1, 2, or 3 rows depending on class size
  const numRows = count <= 10 ? 1 : count <= 24 ? 2 : 3;
  const rows: RosterStudent[][] = Array.from({ length: numRows }, () => []);
  students.forEach((s, i) => {
    const rowIdx = Math.floor((i * numRows) / count);
    rows[Math.min(numRows - 1, rowIdx)].push(s);
  });

  const passengers: Passenger[] = [];
  let globalIdx = 0;

  rows.forEach((rowList, rowIdx) => {
    const n = rowList.length;
    // Back row sits slightly higher, front row sits slightly lower
    const rowYOffset =
      numRows === 1
        ? -24
        : numRows === 2
          ? rowIdx === 0
            ? -44
            : -10
          : rowIdx === 0
            ? -56
            : rowIdx === 1
              ? -28
              : 0;

    // Slight stagger between rows so faces & name tags don't collide
    const spanLeft = -230 + rowIdx * 10;
    const spanRight = 275 - rowIdx * 8;
    const span = spanRight - spanLeft;

    rowList.forEach((student, colIdx) => {
      const t = n === 1 ? 0.5 : colIdx / (n - 1);
      const seatX = spanLeft + t * span;
      // Follow gentle upward curve of the wooden boat at bow/stern
      const curveLift = Math.pow((t - 0.5) * 2, 2) * 8;
      const seatY = rowYOffset - curveLift;

      passengers.push({
        student,
        shortName: getLastWordName(student.name),
        isGirl: guessIsGirl(student.name, globalIdx),
        seatX,
        seatY,
        row: rowIdx,
        bobPhase: (globalIdx * 1.37) % (Math.PI * 2),
        isSleepyWinner: winnerIds.has(student.id),
        leaveDelay: 0,
        leaveProgress: 0,
        startWorldX: 0,
        startWorldY: 0,
        decoyNodOffset: (globalIdx * 2.13) % 10,
      });
      globalIdx++;
    });
  });

  // Sort back-to-front so front row renders cleanly in front of back row
  passengers.sort((a, b) => a.row - b.row || a.seatX - b.seatX);
  return passengers;
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

export const RiverFerryGame: React.FC<MinigameProps> = ({
  students,
  allStudents,
  onPickStudent,
  muted,
}) => {
  const totalCount = allStudents.length;
  const calledCount = useMemo(
    () => allStudents.filter((s) => s.called && !s.absent).length,
    [allStudents],
  );
  const { paceMode } = useMinigameStageSettings();

  const [assets, setAssets] = useState<LoadedAssets | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [phase, setPhase] = useState<GamePhase>('IDLE');
  const [pickCount, setPickCount] = useState<number>(1);
  const [showCountMenu, setShowCountMenu] = useState(false);
  const [remainingSec, setRemainingSec] = useState<number>(0);
  const [statusBanner, setStatusBanner] = useState<string>('Ai sẽ ngủ gục trên chuyến đò hôm nay?');
  const [winners, setWinners] = useState<RosterStudent[]>([]);
  const [showConfetti, setShowConfetti] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  const paceRef = useRef(paceMode);
  paceRef.current = paceMode;

  const effectivePickCount = useMemo(
    () => Math.max(1, Math.min(pickCount, Math.max(1, students.length))),
    [pickCount, students.length],
  );

  // Simulation state stored in ref for smooth 60fps RAF loop
  const simRef = useRef<{
    phase: GamePhase;
    voyageStartMs: number;
    voyageTotalMs: number;
    disembarkStartMs: number;
    revealStartMs: number;
    scrollX: number;
    dockSlide: number; // 0 = offscreen right, 1 = fully docked at x=0
    stormAlpha: number; // 0..1
    lightningAlpha: number;
    lightningX: number;
    nextLightningMs: number;
    teacherWalkX: number; // relative offset from stern (-340) toward sleeping winners
    passengers: Passenger[];
    winners: RosterStudent[];
    rain: RainDrop[];
    foam: FoamBubble[];
    lastTickStep: number;
  }>({
    phase: 'IDLE',
    voyageStartMs: 0,
    voyageTotalMs: VOYAGE_MS_BY_PACE.NORMAL,
    disembarkStartMs: 0,
    revealStartMs: 0,
    scrollX: 0,
    dockSlide: 0,
    stormAlpha: 0,
    lightningAlpha: 0,
    lightningX: 700,
    nextLightningMs: 0,
    teacherWalkX: -340,
    passengers: [],
    winners: [],
    rain: Array.from({ length: 120 }, () => ({
      x: Math.random() * LOGICAL_W,
      y: Math.random() * LOGICAL_H,
      len: 14 + Math.random() * 18,
      speed: 620 + Math.random() * 340,
      alpha: 0.28 + Math.random() * 0.4,
    })),
    foam: Array.from({ length: 34 }, () => ({
      x: 80 + Math.random() * 240,
      y: 440 + Math.random() * 55,
      r: 3 + Math.random() * 8,
      vx: -(70 + Math.random() * 110),
      vy: (Math.random() - 0.5) * 18,
      alpha: Math.random(),
    })),
    lastTickStep: -1,
  });

  // Preload all 8 watercolor assets
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

  // Refresh seated passengers whenever student list changes in IDLE
  useEffect(() => {
    if (simRef.current.phase === 'IDLE') {
      simRef.current.passengers = layoutPassengers(students, new Set());
      simRef.current.dockSlide = 0;
      simRef.current.stormAlpha = 0;
      simRef.current.teacherWalkX = -340;
    }
  }, [students]);

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      stopBackgroundMusic();
    };
  }, []);

  const commitWinnersToStore = useCallback(
    (chosen: RosterStudent[]) => {
      if (chosen.length === 1) {
        onPickStudent(chosen[0], 'Ngủ gục trên Chuyến Đò Vượt Sóng');
      } else if (chosen.length > 1) {
        // Persist all selected students as called in store
        try {
          const store = readMinigameStore();
          const chosenIds = new Set(chosen.map((s) => s.id));
          const updatedStudents = store.students.map((s) =>
            chosenIds.has(s.id) ? { ...s, called: true } : s,
          );
          writeMinigameStore({ ...store, students: updatedStudents });
        } catch {
          // Ignore storage error
        }
      }
    },
    [onPickStudent],
  );

  const handleResetClass = useCallback(() => {
    try {
      const store = readMinigameStore();
      const resetStudents = store.students.map((s) => ({ ...s, called: false }));
      writeMinigameStore({ ...store, students: resetStudents });
    } catch {
      // Ignore storage error
    }
  }, []);

  const startVoyage = useCallback(() => {
    if (students.length === 0) return;
    unlockGameAudio();
    if (!mutedRef.current) startLobbyMusic();

    const shuffled = cryptoShuffle([...students]);
    const chosen = shuffled.slice(0, effectivePickCount);
    const winnerIds = new Set(chosen.map((s) => s.id));

    const passengers = layoutPassengers(students, winnerIds);

    // Assign staggered disembark delays to all awake students (0.15s -> 2.1s)
    const awakeList = cryptoShuffle(passengers.filter((p) => !p.isSleepyWinner));
    awakeList.forEach((p, idx) => {
      const frac = awakeList.length <= 1 ? 0 : idx / (awakeList.length - 1);
      p.leaveDelay = 0.25 + frac * 1.95;
      p.leaveProgress = 0;
    });

    const totalMs = VOYAGE_MS_BY_PACE[paceRef.current];
    const now = performance.now();

    simRef.current.phase = 'DEPART';
    simRef.current.voyageStartMs = now;
    simRef.current.voyageTotalMs = totalMs;
    simRef.current.dockSlide = 0;
    simRef.current.stormAlpha = 0;
    simRef.current.lightningAlpha = 0;
    simRef.current.nextLightningMs = now + totalMs * 0.28;
    simRef.current.teacherWalkX = -340;
    simRef.current.passengers = passengers;
    simRef.current.winners = chosen;
    simRef.current.lastTickStep = -1;

    setWinners([]);
    setShowConfetti(false);
    setShowCountMenu(false);
    setPhase('DEPART');
    setRemainingSec(totalMs / 1000);
    setStatusBanner('Rời bến! Cả lớp bám chắc nhé!');
  }, [students, effectivePickCount]);

  const dockImmediately = useCallback(() => {
    const sim = simRef.current;
    if (sim.phase !== 'DEPART' && sim.phase !== 'STORM') return;
    // Fast-forward to ARRIVING phase (~1.4s left)
    const now = performance.now();
    sim.voyageStartMs = now - sim.voyageTotalMs * 0.84;
  }, []);

  const resetToIdle = useCallback(() => {
    stopBackgroundMusic();
    simRef.current.phase = 'IDLE';
    simRef.current.dockSlide = 0;
    simRef.current.stormAlpha = 0;
    simRef.current.lightningAlpha = 0;
    simRef.current.teacherWalkX = -340;
    simRef.current.passengers = layoutPassengers(students, new Set());
    simRef.current.winners = [];
    setPhase('IDLE');
    setWinners([]);
    setShowConfetti(false);
    setStatusBanner('Ai sẽ ngủ gục trên chuyến đò hôm nay?');
  }, [students]);

  // Main 60fps Canvas Animation Loop
  useEffect(() => {
    if (!assets) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let rafId = 0;
    let lastTime = performance.now();

    const renderFrame = (now: number) => {
      const dt = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000));
      lastTime = now;

      const sim = simRef.current;
      const tSec = now / 1000;

      // --- 1. UPDATE SIMULATION STATE ---
      let scrollSpeed = 0;
      let waveAmp = 4;
      let waveFreq = 1.9;
      let tiltAmp = 0.014;

      if (sim.phase === 'DEPART' || sim.phase === 'STORM' || sim.phase === 'ARRIVING') {
        const elapsed = now - sim.voyageStartMs;
        const progress = Math.min(1, elapsed / sim.voyageTotalMs);
        const rem = Math.max(0, (sim.voyageTotalMs - elapsed) / 1000);
        setRemainingSec(rem);

        if (progress < 0.22) {
          if (sim.phase !== 'DEPART') {
            sim.phase = 'DEPART';
            setPhase('DEPART');
            setStatusBanner('Rời bến! Cả lớp bám chắc nhé!');
          }
          scrollSpeed = 190;
          waveAmp = 6;
          waveFreq = 2.6;
          tiltAmp = 0.022;
          sim.stormAlpha = Math.max(0, sim.stormAlpha - dt * 1.5);
        } else if (progress < 0.76) {
          if (sim.phase !== 'STORM') {
            sim.phase = 'STORM';
            setPhase('STORM');
            setStatusBanner('⛈️ Sóng lên rồi! Đợi cập bến mới biết ai ngủ gục nha!');
          }
          scrollSpeed = 310;
          waveAmp = 15;
          waveFreq = 4.2;
          tiltAmp = 0.062;
          sim.stormAlpha = Math.min(1, sim.stormAlpha + dt * 1.4);

          // Periodic lightning & thunder
          if (now >= sim.nextLightningMs) {
            sim.lightningAlpha = 1;
            sim.lightningX = 240 + Math.random() * 820;
            sim.nextLightningMs = now + 1800 + Math.random() * 2400;
            playSoftThunder(mutedRef.current);
          }
        } else if (progress < 1) {
          if (sim.phase !== 'ARRIVING') {
            sim.phase = 'ARRIVING';
            setPhase('ARRIVING');
            setStatusBanner('🌤️ Trời quang mây tạnh! Sắp cập bến trường rồi!');
          }
          const arriveProg = (progress - 0.76) / 0.24;
          // Smooth ease-out for dock arrival
          const eased = 1 - Math.pow(1 - arriveProg, 3);
          sim.dockSlide = eased;
          scrollSpeed = (1 - eased) * 180;
          waveAmp = 12 * (1 - eased) + 3.5;
          waveFreq = 3.2 * (1 - eased) + 1.8;
          tiltAmp = 0.04 * (1 - eased) + 0.01;
          sim.stormAlpha = Math.max(0, 1 - arriveProg * 1.7);
        } else {
          // Transition to DISEMBARK
          sim.phase = 'DISEMBARK';
          sim.dockSlide = 1;
          sim.stormAlpha = 0;
          sim.disembarkStartMs = now;
          sim.lastTickStep = -1;
          stopBackgroundMusic();
          setPhase('DISEMBARK');
          setRemainingSec(0);
          setStatusBanner('🏫 Đò cập bến! Các bạn tỉnh táo lên bờ nào!');
        }
      } else if (sim.phase === 'DISEMBARK') {
        const disElapsed = (now - sim.disembarkStartMs) / 1000;
        let allAwakeGone = true;

        // Boat docked gently at wooden pier
        const boatCenterX = 435;
        const boatCenterY = 448;

        for (const p of sim.passengers) {
          if (p.isSleepyWinner) continue;
          if (disElapsed < p.leaveDelay) {
            allAwakeGone = false;
            continue;
          }
          if (p.leaveProgress === 0) {
            p.startWorldX = boatCenterX + p.seatX;
            p.startWorldY = boatCenterY + p.seatY;
            const step = Math.floor(disElapsed * 8);
            if (step !== sim.lastTickStep) {
              sim.lastTickStep = step;
              if (!mutedRef.current) playWheelTick();
            }
          }
          p.leaveProgress = Math.min(1, p.leaveProgress + dt * 1.45);
          if (p.leaveProgress < 1) allAwakeGone = false;
        }

        // Teacher walks gently toward the sleeping students once most awake students left
        if (disElapsed > 1.35) {
          const avgWinnerX =
            sim.passengers
              .filter((p) => p.isSleepyWinner)
              .reduce((acc, p) => acc + p.seatX, 0) /
            Math.max(1, sim.winners.length);
          const targetTeacherX = Math.max(-320, Math.min(120, avgWinnerX - 95));
          sim.teacherWalkX += (targetTeacherX - sim.teacherWalkX) * Math.min(1, dt * 3.5);
        }

        if (allAwakeGone && disElapsed > 2.75) {
          sim.phase = 'REVEAL';
          sim.revealStartMs = now;
          setPhase('REVEAL');
          setWinners(sim.winners);
          setShowConfetti(true);
          setStatusBanner(
            sim.winners.length > 1
              ? `😴 Phát hiện ${sim.winners.length} bạn ngủ gục trên đò!`
              : '😴 Phát hiện 1 bạn ngủ gục trên đò!',
          );
          if (!mutedRef.current) {
            playCatchSound();
            setTimeout(() => {
              if (!mutedRef.current) playWinnerFanfare();
            }, 300);
          }
          commitWinnersToStore(sim.winners);
        }
      }

      sim.scrollX = (sim.scrollX + scrollSpeed * dt) % (LOGICAL_W * 2);
      sim.lightningAlpha = Math.max(0, sim.lightningAlpha - dt * 3.8);

      // Update rain
      if (sim.stormAlpha > 0.05) {
        for (const drop of sim.rain) {
          drop.x -= drop.speed * 0.28 * dt;
          drop.y += drop.speed * dt;
          if (drop.y > LOGICAL_H + 20) {
            drop.y = -20;
            drop.x = Math.random() * (LOGICAL_W + 240);
          }
        }
      }

      // Update boat wake foam
      const wakeActive = sim.phase === 'DEPART' || sim.phase === 'STORM' || sim.phase === 'ARRIVING';
      for (const b of sim.foam) {
        b.x += (b.vx - scrollSpeed * 0.45) * dt;
        b.y += b.vy * dt;
        b.alpha -= dt * (wakeActive ? 0.9 : 1.4);
        if (b.alpha <= 0) {
          b.x = 120 + Math.random() * 140;
          b.y = 455 + Math.random() * 48;
          b.r = 3 + Math.random() * (sim.stormAlpha > 0.3 ? 11 : 7);
          b.alpha = wakeActive ? 0.55 + Math.random() * 0.4 : 0;
        }
      }

      // --- 2. DRAW SCENE ---
      const dpr = window.devicePixelRatio || 1;
      if (canvas.width !== LOGICAL_W * dpr || canvas.height !== LOGICAL_H * dpr) {
        canvas.width = LOGICAL_W * dpr;
        canvas.height = LOGICAL_H * dpr;
      }
      ctx.save();
      ctx.scale(dpr, dpr);

      // 2A. Scrolling River Background (seamless mirrored pair)
      const bgW = LOGICAL_W;
      const bgH = LOGICAL_H;
      const offset = sim.scrollX % (bgW * 2);

      // Draw 3 tiles to always cover viewport
      for (let tile = -1; tile <= 2; tile++) {
        const tx = tile * bgW - (offset % bgW);
        const tileIndex = Math.floor(offset / bgW) + tile;
        const mirrored = ((tileIndex % 2) + 2) % 2 === 1;
        ctx.save();
        if (mirrored) {
          ctx.translate(tx + bgW, 0);
          ctx.scale(-1, 1);
          ctx.drawImage(assets.bgRiver, 0, 0, bgW, bgH);
        } else {
          ctx.drawImage(assets.bgRiver, tx, 0, bgW, bgH);
        }
        ctx.restore();
      }

      // 2B. School Dock Background sliding in from the right during ARRIVING / DISEMBARK / REVEAL
      if (sim.dockSlide > 0.001) {
        const dockX = (1 - sim.dockSlide) * LOGICAL_W;
        ctx.save();
        // Soft edge fade on left edge of dock image while sliding in
        ctx.drawImage(assets.bgDock, dockX, 0, LOGICAL_W, LOGICAL_H);
        if (sim.dockSlide < 0.99) {
          const blendGrad = ctx.createLinearGradient(dockX - 60, 0, dockX + 80, 0);
          blendGrad.addColorStop(0, 'rgba(135, 206, 235, 0)');
          blendGrad.addColorStop(0.5, 'rgba(190, 230, 240, 0.35)');
          blendGrad.addColorStop(1, 'rgba(135, 206, 235, 0)');
          ctx.fillStyle = blendGrad;
          ctx.fillRect(dockX - 60, 0, 140, LOGICAL_H);
        }
        ctx.restore();
      }

      // 2C. Storm sky darkening + lightning bolts
      if (sim.stormAlpha > 0.01) {
        const skyGrad = ctx.createLinearGradient(0, 0, 0, LOGICAL_H);
        skyGrad.addColorStop(0, `rgba(12, 26, 48, ${sim.stormAlpha * 0.68})`);
        skyGrad.addColorStop(0.55, `rgba(22, 46, 72, ${sim.stormAlpha * 0.45})`);
        skyGrad.addColorStop(1, `rgba(14, 38, 58, ${sim.stormAlpha * 0.32})`);
        ctx.fillStyle = skyGrad;
        ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
      }

      if (sim.lightningAlpha > 0.02) {
        ctx.save();
        // Ambient flash
        ctx.fillStyle = `rgba(226, 242, 255, ${sim.lightningAlpha * 0.25})`;
        ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);

        // Jagged bolt
        ctx.strokeStyle = `rgba(255, 255, 240, ${sim.lightningAlpha})`;
        ctx.lineWidth = 4;
        ctx.shadowColor = '#93c5fd';
        ctx.shadowBlur = 18;
        ctx.beginPath();
        let lx = sim.lightningX;
        let ly = 0;
        ctx.moveTo(lx, ly);
        for (let seg = 0; seg < 7; seg++) {
          lx += (seg % 2 === 0 ? 1 : -1) * (16 + (seg * 7) % 22);
          ly += 42 + seg * 5;
          ctx.lineTo(lx, ly);
        }
        ctx.stroke();
        ctx.restore();
      }

      // 2D. Back water ripples & wake foam
      ctx.save();
      for (const b of sim.foam) {
        if (b.alpha <= 0.02) continue;
        ctx.fillStyle = `rgba(255, 255, 255, ${b.alpha * 0.72})`;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      // 2E. Boat + Teacher + Seated Passengers (transformed together with wave bob & pitch)
      const isDocked = sim.phase === 'DISEMBARK' || sim.phase === 'REVEAL';
      const boatBaseX = isDocked ? 435 : 515;
      const boatBaseY = isDocked ? 448 : 438;
      const bobY = Math.sin(tSec * waveFreq) * waveAmp;
      const boatTilt = Math.sin(tSec * waveFreq * 0.85 + 0.65) * tiltAmp;
      const boatW = 820;
      const boatH = 178;

      ctx.save();
      ctx.translate(boatBaseX, boatBaseY + bobY);
      ctx.rotate(boatTilt);

      // Soft water reflection / shadow under boat
      ctx.fillStyle = 'rgba(12, 48, 66, 0.24)';
      ctx.beginPath();
      ctx.ellipse(0, 74, boatW * 0.44, 18, 0, 0, Math.PI * 2);
      ctx.fill();

      // Draw Boat Back Rim (full boat drawn first, then students sit inside, then foreground wave covers bottom)
      ctx.drawImage(assets.boat, -boatW / 2, -boatH / 2, boatW, boatH);

      // Draw Teacher at stern (or walking toward sleeping students during reveal)
      const isRowing = sim.phase === 'DEPART' || sim.phase === 'STORM' || sim.phase === 'ARRIVING';
      const rowAngle = isRowing ? Math.sin(tSec * (sim.phase === 'STORM' ? 7.5 : 4.8)) * 0.14 : 0;
      const walkBob =
        sim.phase === 'DISEMBARK' && sim.teacherWalkX > -335
          ? Math.abs(Math.sin(tSec * 9)) * -6
          : 0;

      ctx.save();
      ctx.translate(sim.teacherWalkX, -76 + walkBob);
      ctx.rotate(rowAngle);
      const tH = 196;
      const tW = (assets.teacher.width / assets.teacher.height) * tH;
      ctx.drawImage(assets.teacher, -tW / 2, -tH / 2, tW, tH);
      ctx.restore();

      // Draw Seated Students inside boat
      const studentScale =
        sim.passengers.length <= 12
          ? 0.96
          : sim.passengers.length <= 24
            ? 0.8
            : 0.68;

      for (const p of sim.passengers) {
        if (p.leaveProgress > 0) continue; // Already disembarking in world space

        const showSleeping =
          p.isSleepyWinner && (sim.phase === 'DISEMBARK' || sim.phase === 'REVEAL');

        // Subtle playful decoy nod during storm (never reveals actual winner!)
        const stormBounce =
          sim.phase === 'STORM'
            ? Math.sin(tSec * 6 + p.bobPhase) * 3.5
            : Math.sin(tSec * 2.5 + p.bobPhase) * 1.5;

        const sleepNod = showSleeping ? Math.sin(tSec * 2.2 + p.bobPhase) * 0.11 : 0;

        const sprite = showSleeping
          ? p.isGirl
            ? assets.girlSleep
            : assets.boySleep
          : p.isGirl
            ? assets.girlAwake
            : assets.boyAwake;

        const drawH = 92 * studentScale;
        const drawW = (sprite.width / sprite.height) * drawH;

        // Golden spotlight beam from sky onto sleeping winners during REVEAL / late DISEMBARK
        if (showSleeping && (sim.phase === 'REVEAL' || (sim.phase === 'DISEMBARK' && (now - sim.disembarkStartMs) > 1700))) {
          ctx.save();
          const beamGrad = ctx.createLinearGradient(p.seatX, -380, p.seatX, p.seatY + 30);
          beamGrad.addColorStop(0, 'rgba(254, 240, 138, 0.02)');
          beamGrad.addColorStop(0.55, 'rgba(254, 240, 138, 0.28)');
          beamGrad.addColorStop(1, 'rgba(250, 204, 21, 0.45)');
          ctx.fillStyle = beamGrad;
          ctx.beginPath();
          ctx.moveTo(p.seatX - 22, -380);
          ctx.lineTo(p.seatX + 22, -380);
          ctx.lineTo(p.seatX + 54, p.seatY + 26);
          ctx.lineTo(p.seatX - 54, p.seatY + 26);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        }

        ctx.save();
        ctx.translate(p.seatX, p.seatY + stormBounce);
        ctx.rotate(sleepNod);
        ctx.drawImage(sprite, -drawW / 2, -drawH * 0.72, drawW, drawH);
        ctx.restore();

        // Floating "Zzz" animation above sleeping students
        if (showSleeping) {
          ctx.save();
          const zCycle = (tSec * 0.9 + p.bobPhase) % 1;
          const zx = p.seatX + 16 + zCycle * 18;
          const zy = p.seatY - drawH * 0.62 - zCycle * 34;
          ctx.font = `900 ${Math.round(13 + zCycle * 7)}px system-ui, sans-serif`;
          ctx.fillStyle = `rgba(255, 251, 235, ${1 - zCycle * 0.85})`;
          ctx.strokeStyle = `rgba(92, 51, 23, ${1 - zCycle * 0.85})`;
          ctx.lineWidth = 3;
          ctx.strokeText('Zzz', zx, zy);
          ctx.fillText('Zzz', zx, zy);
          ctx.restore();
        }

        // Name Tag Pill above head
        const tagFontSize = sim.passengers.length > 26 ? 11 : 13;
        ctx.font = `800 ${tagFontSize}px system-ui, -apple-system, sans-serif`;
        const textW = ctx.measureText(p.shortName).width;
        const pillW = Math.max(38, textW + 14);
        const pillH = tagFontSize + 8;
        const pillX = p.seatX - pillW / 2;
        const pillY = p.seatY - drawH * 0.76 - pillH + 2 + stormBounce;

        ctx.save();
        drawRoundedRect(ctx, pillX, pillY, pillW, pillH, 6);
        ctx.fillStyle = showSleeping ? '#fef08a' : 'rgba(255, 251, 235, 0.94)';
        ctx.fill();
        ctx.lineWidth = showSleeping ? 2.2 : 1.5;
        ctx.strokeStyle = showSleeping ? '#b45309' : '#5c3a21';
        ctx.stroke();

        ctx.fillStyle = showSleeping ? '#7c2d12' : '#29170b';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(p.shortName, p.seatX, pillY + pillH / 2 + 0.5);
        ctx.restore();
      }

      // Draw a subtle front wooden gunwale highlight strip so students look tucked INSIDE the boat
      ctx.save();
      ctx.strokeStyle = 'rgba(133, 77, 14, 0.65)';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(-290, 2);
      ctx.quadraticCurveTo(0, 18, 315, -4);
      ctx.stroke();
      ctx.restore();

      ctx.restore(); // End boat transform

      // 2F. Disembarking Awake Students hopping happily onto the wooden pier & into the village school!
      if (sim.phase === 'DISEMBARK') {
        const targetDockX = 955;
        const targetDockY = 345;
        for (const p of sim.passengers) {
          if (p.isSleepyWinner || p.leaveProgress <= 0 || p.leaveProgress >= 1) continue;
          const u = p.leaveProgress;
          const wx = p.startWorldX + (targetDockX - p.startWorldX) * u;
          const baseWy = p.startWorldY + (targetDockY - p.startWorldY) * u;
          // Happy rhythmic hops along the pier
          const hopY = -Math.abs(Math.sin(u * Math.PI * 5)) * 22;
          const alpha = u > 0.8 ? (1 - u) / 0.2 : 1;
          const scale = 0.78 - u * 0.22;

          const sprite = p.isGirl ? assets.girlAwake : assets.boyAwake;
          const drawH = 92 * scale;
          const drawW = (sprite.width / sprite.height) * drawH;

          ctx.save();
          ctx.globalAlpha = Math.max(0, alpha);
          ctx.translate(wx, baseWy + hopY);
          ctx.drawImage(sprite, -drawW / 2, -drawH * 0.72, drawW, drawH);

          // Tiny name tag
          ctx.font = '800 11px system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillStyle = '#fefce8';
          ctx.strokeStyle = '#451a03';
          ctx.lineWidth = 3;
          ctx.strokeText(p.shortName, 0, -drawH * 0.78);
          ctx.fillText(p.shortName, 0, -drawH * 0.78);
          ctx.restore();
        }
      }

      // 2G. Foreground Animated Watercolor Waves in front of the boat
      ctx.save();
      const waveHeight = 8 + sim.stormAlpha * 16;
      const waveSpeed = (wakeActive ? 4.4 : 1.4) + sim.stormAlpha * 2.8;
      ctx.beginPath();
      ctx.moveTo(0, LOGICAL_H);
      for (let x = 0; x <= LOGICAL_W; x += 28) {
        const y =
          522 +
          Math.sin(x * 0.014 + tSec * waveSpeed) * waveHeight +
          Math.cos(x * 0.029 - tSec * waveSpeed * 0.7) * (waveHeight * 0.4);
        ctx.lineTo(x, y);
      }
      ctx.lineTo(LOGICAL_W, LOGICAL_H);
      ctx.closePath();

      const waterGrad = ctx.createLinearGradient(0, 500, 0, LOGICAL_H);
      if (sim.stormAlpha > 0.35) {
        waterGrad.addColorStop(0, `rgba(30, 82, 114, ${0.72 + sim.stormAlpha * 0.16})`);
        waterGrad.addColorStop(1, 'rgba(14, 48, 74, 0.92)');
      } else {
        waterGrad.addColorStop(0, 'rgba(56, 178, 192, 0.56)');
        waterGrad.addColorStop(1, 'rgba(20, 128, 152, 0.82)');
      }
      ctx.fillStyle = waterGrad;
      ctx.fill();

      // White foam crest along foreground wave
      ctx.strokeStyle = `rgba(255, 255, 255, ${0.42 + sim.stormAlpha * 0.38})`;
      ctx.lineWidth = 3 + sim.stormAlpha * 2;
      ctx.beginPath();
      for (let x = 0; x <= LOGICAL_W; x += 28) {
        const y =
          522 +
          Math.sin(x * 0.014 + tSec * waveSpeed) * waveHeight +
          Math.cos(x * 0.029 - tSec * waveSpeed * 0.7) * (waveHeight * 0.4);
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.restore();

      // 2H. Slanted Raindrops during storm
      if (sim.stormAlpha > 0.05) {
        ctx.save();
        ctx.strokeStyle = `rgba(224, 242, 254, ${sim.stormAlpha * 0.65})`;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        for (const drop of sim.rain) {
          ctx.moveTo(drop.x, drop.y);
          ctx.lineTo(drop.x - drop.len * 0.28, drop.y + drop.len);
        }
        ctx.stroke();
        ctx.restore();
      }

      ctx.restore(); // End DPR scale

      rafId = requestAnimationFrame(renderFrame);
    };

    rafId = requestAnimationFrame(renderFrame);
    return () => cancelAnimationFrame(rafId);
  }, [assets, commitWinnersToStore]);

  const isRunning = phase === 'DEPART' || phase === 'STORM' || phase === 'ARRIVING' || phase === 'DISEMBARK';

  return (
    <div className="w-full flex flex-col items-center gap-3 select-none">
      <ConfettiBurst active={showConfetti} />

      {/* Main 16:9 Watercolor Stage */}
      <div className="relative w-full max-w-6xl rounded-3xl overflow-hidden shadow-2xl border-4 border-amber-800/35 bg-sky-100">
        {/* Top Floating Status Bar */}
        <div className="absolute top-3 left-3 right-3 z-10 flex items-center justify-between gap-2 pointer-events-none">
          <div className="flex items-center gap-2">
            {(phase === 'DEPART' || phase === 'STORM' || phase === 'ARRIVING') && (
              <span className="px-3.5 py-1.5 rounded-full bg-amber-50/95 border-2 border-amber-700/50 text-amber-950 font-black text-xs sm:text-sm shadow-md">
                ⏱️ {Math.ceil(remainingSec)} giây
              </span>
            )}
            <span className="px-3.5 py-1.5 rounded-full bg-amber-50/90 border border-amber-800/30 text-amber-950 font-bold text-xs shadow-sm backdrop-blur-sm">
              🚣 Còn {students.length}/{totalCount} bạn trên đò
            </span>
          </div>

          <div className="hidden sm:block px-4 py-1.5 rounded-full bg-amber-950/75 border border-amber-200/40 text-amber-50 font-extrabold text-sm shadow-lg backdrop-blur-sm">
            {statusBanner}
          </div>
        </div>

        {/* Mobile status banner */}
        <div className="sm:hidden absolute top-14 left-3 right-3 z-10 flex justify-center pointer-events-none">
          <span className="px-3 py-1 rounded-full bg-amber-950/75 text-amber-50 font-bold text-xs shadow">
            {statusBanner}
          </span>
        </div>

        {/* Canvas or Loading State */}
        {loadError ? (
          <div className="w-full aspect-[1280/620] flex items-center justify-center bg-amber-50 text-rose-700 font-bold p-6">
            ⚠️ {loadError}
          </div>
        ) : !assets ? (
          <div className="w-full aspect-[1280/620] flex flex-col items-center justify-center gap-3 bg-gradient-to-b from-sky-100 to-teal-100 text-amber-950">
            <div className="w-10 h-10 rounded-full border-4 border-amber-700/30 border-t-amber-700 animate-spin" />
            <p className="font-bold text-sm">Đang trải tranh màu nước Chuyến Đò Vượt Sóng...</p>
          </div>
        ) : (
          <canvas
            ref={canvasRef}
            className="w-full h-auto block aspect-[1280/620]"
          />
        )}

        {/* Winner Reveal Card Overlay (Full Names) */}
        {phase === 'REVEAL' && winners.length > 0 && (
          <div className="absolute top-14 left-1/2 -translate-x-1/2 z-20 w-[92%] max-w-2xl rounded-3xl bg-amber-50/95 border-4 border-amber-600/80 shadow-[0_18px_50px_rgba(69,26,3,0.45)] p-5 text-center backdrop-blur-md">
            <div className="text-xs font-black uppercase tracking-widest text-amber-700 mb-1">
              🏫 Đò đã cập bến!
            </div>
            <h3 className="text-lg sm:text-2xl font-black text-amber-950 mb-3">
              {winners.length > 1
                ? `Mời ${winners.length} bạn ngủ gục sau lên bảng trả bài!`
                : 'Mời bạn ngủ gục sau lên bảng trả bài!'}
            </h3>

            <div className="flex flex-wrap items-center justify-center gap-2.5 mb-4">
              {winners.map((w) => (
                <div
                  key={w.id}
                  className="px-4 py-2 rounded-2xl bg-gradient-to-r from-amber-200 via-yellow-100 to-amber-200 border-2 border-amber-600/60 shadow-sm"
                >
                  <div className="text-base sm:text-xl font-black text-amber-950">
                    😴 {w.name}
                  </div>
                  {w.studentCode && (
                    <div className="text-xs font-mono font-bold text-amber-800/80">
                      {w.studentCode}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={resetToIdle}
              className="px-6 py-2.5 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 hover:brightness-110 text-white font-black text-sm shadow-lg shadow-amber-500/30 transition active:scale-95"
            >
              🚣 Chuyến đò tiếp theo
            </button>
          </div>
        )}
      </div>

      {/* Bottom Watercolor Control Bar */}
      <div className="w-full max-w-4xl flex flex-wrap items-center justify-center gap-3 bg-amber-50/95 border-2 border-amber-800/25 rounded-2xl px-4 py-3 text-amber-950 shadow-lg">
        <button
          type="button"
          disabled={isRunning || !assets || students.length === 0}
          onClick={startVoyage}
          className="px-6 py-2.5 rounded-full bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 hover:brightness-110 disabled:opacity-45 text-white font-black text-sm shadow-lg shadow-orange-500/25 transition active:scale-95"
        >
          🚣 Chèo đò!
        </button>

        {(phase === 'DEPART' || phase === 'STORM') && (
          <button
            type="button"
            onClick={dockImmediately}
            className="px-5 py-2.5 rounded-full bg-teal-600 hover:bg-teal-500 text-white font-black text-sm shadow-md transition active:scale-95"
          >
            ⚓ Cập bến ngay
          </button>
        )}

        {/* Pick Count Selector (1..5) */}
        <div className="relative">
          <button
            type="button"
            disabled={isRunning}
            onClick={() => setShowCountMenu((v) => !v)}
            className="px-4 py-2.5 rounded-full bg-amber-200/80 hover:bg-amber-300/80 disabled:opacity-45 border border-amber-700/30 text-amber-950 font-black text-sm transition"
          >
            Gọi mỗi chuyến: {effectivePickCount} bạn ▾
          </button>

          {showCountMenu && (
            <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 flex items-center gap-1.5 p-2 rounded-2xl bg-amber-50 border-2 border-amber-700/40 shadow-2xl z-30">
              {[1, 2, 3, 4, 5].map((num) => (
                <button
                  key={num}
                  type="button"
                  onClick={() => {
                    setPickCount(num);
                    setShowCountMenu(false);
                  }}
                  className={`w-9 h-9 rounded-full font-black text-sm transition ${
                    pickCount === num
                      ? 'bg-amber-600 text-white scale-110 shadow'
                      : 'bg-amber-100 text-amber-950 hover:bg-amber-200'
                  }`}
                >
                  {num}
                </button>
              ))}
            </div>
          )}
        </div>

        {calledCount > 0 && (
          <button
            type="button"
            disabled={isRunning}
            onClick={() => {
              handleResetClass();
              resetToIdle();
            }}
            className="px-4 py-2.5 rounded-full bg-white hover:bg-amber-100 disabled:opacity-40 text-amber-900 border border-amber-700/30 font-bold text-sm transition"
            title="Khôi phục toàn bộ học sinh đã gọi lên đò lại từ đầu"
          >
            🔄 Gọi lại cả lớp ({calledCount})
          </button>
        )}
      </div>
    </div>
  );
};

export default RiverFerryGame;
