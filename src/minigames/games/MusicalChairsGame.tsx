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

const LOGICAL_W = 1280;
const LOGICAL_H = 620;

const DANCE_MS_BY_PACE: Record<PaceMode, number> = {
  TURBO: 3000,
  FAST: 8500,
  NORMAL: 15500,
  EPIC: 24000,
};

const ASSET_PATHS = {
  bgYard: '/assets/minigames/gianh-ghe/bg-schoolyard.jpg',
  chairRed: '/assets/minigames/gianh-ghe/chair-red.png',
  teacherMc: '/assets/minigames/gianh-ghe/teacher-mc.png',
  boyDance: '/assets/minigames/gianh-ghe/hs-nam-dance.png',
  girlDance: '/assets/minigames/gianh-ghe/hs-nu-dance.png',
  boySit: '/assets/minigames/gianh-ghe/hs-nam-sit.png',
  girlSit: '/assets/minigames/gianh-ghe/hs-nu-sit.png',
  boySad: '/assets/minigames/gianh-ghe/hs-nam-sad.png',
  girlSad: '/assets/minigames/gianh-ghe/hs-nu-sad.png',
} as const;

type AssetKey = keyof typeof ASSET_PATHS;
type LoadedAssets = Record<AssetKey, HTMLImageElement>;

type GamePhase = 'IDLE' | 'DANCING' | 'GRAB' | 'REVEAL';

interface ChairPos {
  x: number;
  y: number;
  row: number;
}

interface Dancer {
  student: RosterStudent;
  shortName: string;
  isGirl: boolean;
  /** Progress around the oval track [0, 1) */
  trackT: number;
  x: number;
  y: number;
  facingLeft: boolean;
  bobPhase: number;
  isLoser: boolean;
  /** Assigned chair index during GRAB (-1 for loser) */
  chairIdx: number;
  grabStartX: number;
  grabStartY: number;
  grabTargetX: number;
  grabTargetY: number;
  seated: boolean;
}

interface FloatingNote {
  x: number;
  y: number;
  vx: number;
  vy: number;
  symbol: string;
  color: string;
  alpha: number;
  size: number;
}

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
  return parts[parts.length - 1] || fullName.trim();
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

function layoutChairs(studentCount: number): ChairPos[] {
  const chairCount = Math.max(0, studentCount - 1);
  if (chairCount === 0) return [];

  // Place N-1 red plastic chairs in 1 row (<= 10 chairs) or 2 tidy rows (> 10 chairs)
  const useTwoRows = chairCount > 10;
  const chairs: ChairPos[] = [];
  const leftX = 210;
  const rightX = 960;
  const spanX = rightX - leftX;

  if (!useTwoRows) {
    for (let i = 0; i < chairCount; i++) {
      const t = chairCount === 1 ? 0.5 : i / (chairCount - 1);
      // Center narrowly when few students so the circle looks cozy
      const effSpan = Math.min(spanX, Math.max(180, (chairCount - 1) * 78));
      const startX = (leftX + rightX) / 2 - effSpan / 2;
      chairs.push({ x: startX + t * effSpan, y: 468, row: 0 });
    }
  } else {
    const topCount = Math.ceil(chairCount / 2);
    const botCount = chairCount - topCount;
    for (let i = 0; i < topCount; i++) {
      const t = topCount === 1 ? 0.5 : i / (topCount - 1);
      chairs.push({ x: leftX + t * spanX, y: 438, row: 0 });
    }
    for (let i = 0; i < botCount; i++) {
      const t = botCount === 1 ? 0.5 : i / (botCount - 1);
      const inset = 18;
      chairs.push({ x: leftX + inset + t * (spanX - inset * 2), y: 500, row: 1 });
    }
  }
  return chairs;
}

/**
 * Evaluates a point along a smooth stadium/oval track surrounding the red chairs.
 */
function sampleOvalTrack(tNorm: number, chairCount: number): { x: number; y: number; facingLeft: boolean } {
  const t = ((tNorm % 1) + 1) % 1;
  const angle = t * Math.PI * 2; // 0 = right, PI/2 = bottom, PI = left, 3PI/2 = top
  const cx = 585;
  const cy = 468;
  const rx = chairCount > 10 ? 455 : Math.min(430, Math.max(210, chairCount * 46 + 90));
  const ry = chairCount > 10 ? 116 : 94;

  const x = cx + Math.cos(angle) * rx;
  const y = cy + Math.sin(angle) * ry;
  // Moving clockwise (increasing angle): dx/dt = -sin(angle) * rx -> negative on bottom half (moving left)
  const facingLeft = Math.sin(angle) > 0;
  return { x, y, facingLeft };
}

function createInitialDancers(students: RosterStudent[]): Dancer[] {
  const n = students.length;
  const chairCount = Math.max(0, n - 1);
  return students.map((student, i) => {
    const trackT = n === 0 ? 0 : i / n;
    const pos = sampleOvalTrack(trackT, chairCount);
    return {
      student,
      shortName: getShortName(student.name),
      isGirl: guessIsGirl(student, i),
      trackT,
      x: pos.x,
      y: pos.y,
      facingLeft: pos.facingLeft,
      bobPhase: (i * 1.43) % (Math.PI * 2),
      isLoser: false,
      chairIdx: -1,
      grabStartX: pos.x,
      grabStartY: pos.y,
      grabTargetX: pos.x,
      grabTargetY: pos.y,
      seated: false,
    };
  });
}

export const MusicalChairsGame: React.FC<MinigameProps> = ({
  students,
  allStudents,
  onPickStudent,
  muted,
}) => {
  const { paceMode } = useMinigameStageSettings();

  const [assets, setAssets] = useState<LoadedAssets | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [phase, setPhase] = useState<GamePhase>('IDLE');
  const [mcSpeech, setMcSpeech] = useState<string>('Sẵn sàng giành ghế chưa cả lớp!');
  const [loser, setLoser] = useState<RosterStudent | null>(null);
  const [showCard, setShowCard] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  const paceRef = useRef(paceMode);
  paceRef.current = paceMode;

  const totalCount = allStudents.length;
  const chairCount = Math.max(0, students.length - 1);

  const simRef = useRef<{
    phase: GamePhase;
    phaseStartMs: number;
    danceTotalMs: number;
    chairs: ChairPos[];
    dancers: Dancer[];
    loser: RosterStudent | null;
    notes: FloatingNote[];
    lastNoteMs: number;
    cardShown: boolean;
  }>({
    phase: 'IDLE',
    phaseStartMs: 0,
    danceTotalMs: DANCE_MS_BY_PACE.NORMAL,
    chairs: [],
    dancers: [],
    loser: null,
    notes: [],
    lastNoteMs: 0,
    cardShown: false,
  });

  // Preload all 9 CHIBI_CEL assets
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

  // Refresh chairs & dancers in IDLE when roster changes
  useEffect(() => {
    if (simRef.current.phase === 'IDLE') {
      simRef.current.chairs = layoutChairs(students.length);
      simRef.current.dancers = createInitialDancers(students);
      simRef.current.notes = [];
    }
  }, [students]);

  useEffect(() => {
    return () => {
      stopBackgroundMusic();
    };
  }, []);

  const triggerMusicStopAndGrab = useCallback(() => {
    const sim = simRef.current;
    if (sim.phase !== 'DANCING') return;

    stopBackgroundMusic();
    if (!mutedRef.current) playCatchSound();

    // Fairly pick 1 loser; assign every other dancer to their nearest available red chair!
    const shuffledDancers = cryptoShuffle([...sim.dancers]);
    const pickedLoser = shuffledDancers[0];
    const winners = sim.dancers.filter((d) => d.student.id !== pickedLoser.student.id);

    // Greedy nearest-chair assignment so students dash naturally to the closest open chair
    const remainingChairIndices = sim.chairs.map((_, idx) => idx);
    for (const d of winners) {
      d.isLoser = false;
      d.grabStartX = d.x;
      d.grabStartY = d.y;
      d.seated = false;

      let bestPos = 0;
      let bestDist = Infinity;
      for (let i = 0; i < remainingChairIndices.length; i++) {
        const c = sim.chairs[remainingChairIndices[i]];
        const dist = Math.hypot(c.x - d.x, c.y - d.y);
        if (dist < bestDist) {
          bestDist = dist;
          bestPos = i;
        }
      }
      const chosenIdx = remainingChairIndices.splice(bestPos, 1)[0];
      d.chairIdx = chosenIdx ?? -1;
      if (chosenIdx !== undefined) {
        const c = sim.chairs[chosenIdx];
        d.grabTargetX = c.x;
        d.grabTargetY = c.y;
      }
    }

    // Loser dashes toward center-front looking for a chair and ends up standing alone in the spotlight!
    pickedLoser.isLoser = true;
    pickedLoser.chairIdx = -1;
    pickedLoser.grabStartX = pickedLoser.x;
    pickedLoser.grabStartY = pickedLoser.y;
    pickedLoser.grabTargetX = 585;
    pickedLoser.grabTargetY = 568;
    pickedLoser.seated = false;

    sim.loser = pickedLoser.student;
    sim.phase = 'GRAB';
    sim.phaseStartMs = performance.now();
    sim.cardShown = false;

    setPhase('GRAB');
    setMcSpeech('NHẠC TẮT! GIÀNH GHẾ MAU! ⚡');
  }, []);

  const startMusicRound = useCallback(() => {
    if (students.length === 0) return;
    unlockGameAudio();
    if (!mutedRef.current) startLobbyMusic();

    const chairs = layoutChairs(students.length);
    const dancers = createInitialDancers(students);
    const totalMs = DANCE_MS_BY_PACE[paceRef.current];

    simRef.current.chairs = chairs;
    simRef.current.dancers = dancers;
    simRef.current.loser = null;
    simRef.current.notes = [];
    simRef.current.phase = 'DANCING';
    simRef.current.phaseStartMs = performance.now();
    simRef.current.danceTotalMs = totalMs;
    simRef.current.cardShown = false;

    setLoser(null);
    setShowCard(false);
    setShowConfetti(false);
    setPhase('DANCING');
    setMcSpeech('Cả lớp lên sân nhảy nào! 🎶');
  }, [students]);

  const resetToIdle = useCallback(() => {
    stopBackgroundMusic();
    simRef.current.phase = 'IDLE';
    simRef.current.chairs = layoutChairs(students.length);
    simRef.current.dancers = createInitialDancers(students);
    simRef.current.loser = null;
    simRef.current.notes = [];
    simRef.current.cardShown = false;
    setPhase('IDLE');
    setLoser(null);
    setShowCard(false);
    setShowConfetti(false);
    setMcSpeech('Sẵn sàng giành ghế chưa cả lớp!');
  }, [students]);

  // Main 60fps Canvas Render Loop
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

      // --- 1. UPDATE SIMULATION ---
      if (sim.phase === 'DANCING') {
        const elapsed = now - sim.phaseStartMs;
        const progress = Math.min(1, elapsed / sim.danceTotalMs);

        // Speed up slightly as music nears cutoff for classroom suspense!
        const angularSpeed = 0.14 + progress * 0.08;
        for (const d of sim.dancers) {
          d.trackT = (d.trackT + angularSpeed * dt) % 1;
          const pos = sampleOvalTrack(d.trackT, sim.chairs.length);
          d.x = pos.x;
          d.y = pos.y;
          d.facingLeft = pos.facingLeft;
        }

        if (progress > 0.65) {
          setMcSpeech('Chuẩn bị chưa nè... sắp tắt nhạc đó! 👀');
        }

        // Spawn colorful musical notes floating from teacher's speaker
        if (now - sim.lastNoteMs > 320) {
          sim.lastNoteMs = now;
          const symbols = ['♪', '♫', '♬'];
          const colors = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#a855f7'];
          sim.notes.push({
            x: 1175 + (Math.random() - 0.5) * 30,
            y: 445,
            vx: -24 - Math.random() * 28,
            vy: -48 - Math.random() * 24,
            symbol: symbols[Math.floor(Math.random() * symbols.length)],
            color: colors[Math.floor(Math.random() * colors.length)],
            alpha: 1,
            size: 18 + Math.random() * 10,
          });
        }

        if (elapsed >= sim.danceTotalMs) {
          triggerMusicStopAndGrab();
        }
      } else if (sim.phase === 'GRAB') {
        const grabSec = (now - sim.phaseStartMs) / 1000;
        const grabDur = 0.72;
        const u = Math.min(1, grabSec / grabDur);
        // Snappy ease-out dash
        const ease = 1 - Math.pow(1 - u, 3);

        for (const d of sim.dancers) {
          d.x = d.grabStartX + (d.grabTargetX - d.grabStartX) * ease;
          d.y = d.grabStartY + (d.grabTargetY - d.grabStartY) * ease;
          d.facingLeft = d.grabTargetX < d.grabStartX;
          if (!d.isLoser && u >= 0.92) {
            d.seated = true;
          }
        }

        if (grabSec >= 0.95) {
          sim.phase = 'REVEAL';
          sim.phaseStartMs = now;
          setPhase('REVEAL');
          setMcSpeech('Chiếc ghế cuối cùng đã có chủ!');
          if (sim.loser) {
            setLoser(sim.loser);
            if (!mutedRef.current) playWheelTick();
          }
        }
      } else if (sim.phase === 'REVEAL') {
        const revSec = (now - sim.phaseStartMs) / 1000;
        if (revSec >= 1.15 && !sim.cardShown && sim.loser) {
          sim.cardShown = true;
          setShowCard(true);
          setShowConfetti(true);
          if (!mutedRef.current) playWinnerFanfare();
          onPickStudent(sim.loser, 'Chậm chân mất một nhịp trong Giành Ghế Âm Nhạc');
        }
      }

      // Update musical notes
      for (const note of sim.notes) {
        note.x += note.vx * dt;
        note.y += note.vy * dt;
        note.alpha -= dt * 0.62;
      }
      sim.notes = sim.notes.filter((n) => n.alpha > 0.02);

      // --- 2. DRAW SCENE ---
      const dpr = window.devicePixelRatio || 1;
      if (canvas.width !== LOGICAL_W * dpr || canvas.height !== LOGICAL_H * dpr) {
        canvas.width = LOGICAL_W * dpr;
        canvas.height = LOGICAL_H * dpr;
      }
      ctx.save();
      ctx.scale(dpr, dpr);

      // 2A. Schoolyard background
      ctx.drawImage(assets.bgYard, 0, 0, LOGICAL_W, LOGICAL_H);

      // Build unified Y-sorted draw queue (Chairs + Seated/Dancing Students + Teacher MC)
      const studentScale = sim.dancers.length > 28 ? 0.72 : sim.dancers.length > 16 ? 0.84 : 0.98;
      const chairH = 56 * studentScale;
      const chairW = (assets.chairRed.width / assets.chairRed.height) * chairH;
      const spriteH = 86 * studentScale;

      type RenderItem = {
        y: number;
        zBias: number; // chairs slightly behind seated students at same Y
        draw: () => void;
      };
      const items: RenderItem[] = [];

      // Teacher MC + portable speaker on right side
      items.push({
        y: 472,
        zBias: 0,
        draw: () => {
          const th = 144;
          const tw = (assets.teacherMc.width / assets.teacherMc.height) * th;
          const bob = sim.phase === 'DANCING' ? Math.abs(Math.sin(tSec * 7.5)) * -5 : 0;
          const tx = 1155;
          const ty = 472;

          // Shadow
          ctx.fillStyle = 'rgba(15, 23, 42, 0.22)';
          ctx.beginPath();
          ctx.ellipse(tx, ty + 2, tw * 0.42, 8, 0, 0, Math.PI * 2);
          ctx.fill();

          ctx.drawImage(assets.teacherMc, tx - tw / 2, ty - th + bob, tw, th);

          // Speech bubble above teacher
          ctx.save();
          ctx.font = '800 13px system-ui, -apple-system, sans-serif';
          const textW = ctx.measureText(mcSpeech).width;
          const bw = Math.min(250, textW + 22);
          const bh = 32;
          const bx = Math.min(LOGICAL_W - bw - 14, tx - bw / 2);
          const by = ty - th - 42 + bob;
          drawRoundedRect(ctx, bx, by, bw, bh, 12);
          ctx.fillStyle = '#ffffff';
          ctx.fill();
          ctx.lineWidth = 2;
          ctx.strokeStyle = '#92400e';
          ctx.stroke();

          ctx.fillStyle = '#451a03';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(mcSpeech, bx + bw / 2, by + bh / 2 + 0.5, bw - 14);
          ctx.restore();
        },
      });

      // Red plastic chairs
      for (const c of sim.chairs) {
        items.push({
          y: c.y,
          zBias: 0,
          draw: () => {
            ctx.fillStyle = 'rgba(15, 23, 42, 0.18)';
            ctx.beginPath();
            ctx.ellipse(c.x, c.y + 1, chairW * 0.42, 5, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.drawImage(assets.chairRed, c.x - chairW / 2, c.y - chairH, chairW, chairH);
          },
        });
      }

      // Students (dancers / seated winners; loser is drawn separately on top during REVEAL spotlight!)
      for (const d of sim.dancers) {
        if (d.isLoser && sim.phase === 'REVEAL') continue;

        items.push({
          y: d.y,
          zBias: d.seated ? 1 : 0.5,
          draw: () => {
            const sprite = d.seated
              ? d.isGirl
                ? assets.girlSit
                : assets.boySit
              : d.isLoser && sim.phase === 'GRAB'
                ? d.isGirl
                  ? assets.girlSad
                  : assets.boySad
                : d.isGirl
                  ? assets.girlDance
                  : assets.boyDance;

            const dw = (sprite.width / sprite.height) * spriteH;
            const danceBounce =
              sim.phase === 'DANCING'
                ? Math.abs(Math.sin(tSec * 9.5 + d.bobPhase)) * -11
                : sim.phase === 'IDLE'
                  ? Math.abs(Math.sin(tSec * 3.5 + d.bobPhase)) * -4
                  : 0;
            const danceTilt = sim.phase === 'DANCING' ? Math.sin(tSec * 9.5 + d.bobPhase) * 0.1 : 0;

            // Sit slightly higher so legs align nicely with the red chair seat
            const yOffset = d.seated ? -8 * studentScale : danceBounce;

            if (!d.seated) {
              ctx.fillStyle = 'rgba(15, 23, 42, 0.22)';
              ctx.beginPath();
              ctx.ellipse(d.x, d.y + 2, dw * 0.34, 5.5, 0, 0, Math.PI * 2);
              ctx.fill();
            }

            ctx.save();
            ctx.translate(d.x, d.y + yOffset);
            if (!d.seated && d.facingLeft) ctx.scale(-1, 1);
            ctx.rotate(danceTilt);
            ctx.drawImage(sprite, -dw / 2, -spriteH, dw, spriteH);
            ctx.restore();

            // Crisp Name Tag above head
            const tagFont = sim.dancers.length > 28 ? 10 : 12;
            ctx.font = `800 ${tagFont}px system-ui, -apple-system, sans-serif`;
            const tw = ctx.measureText(d.shortName).width;
            const pw = Math.max(36, tw + 12);
            const ph = tagFont + 7;
            const px = d.x - pw / 2;
            const py = d.y - spriteH + yOffset - ph - 2;

            ctx.save();
            drawRoundedRect(ctx, px, py, pw, ph, 6);
            ctx.fillStyle = d.seated ? 'rgba(220, 252, 231, 0.94)' : 'rgba(255, 255, 255, 0.94)';
            ctx.fill();
            ctx.lineWidth = 1.5;
            ctx.strokeStyle = d.seated ? '#15803d' : '#475569';
            ctx.stroke();
            ctx.fillStyle = d.seated ? '#14532d' : '#0f172a';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(d.shortName, d.x, py + ph / 2 + 0.5);
            ctx.restore();
          },
        });
      }

      // Sort by Y (back-to-front)
      items.sort((a, b) => a.y - b.y || a.zBias - b.zBias);
      for (const item of items) item.draw();

      // Floating musical notes
      for (const note of sim.notes) {
        ctx.save();
        ctx.globalAlpha = note.alpha;
        ctx.font = `900 ${Math.round(note.size)}px system-ui, sans-serif`;
        ctx.fillStyle = note.color;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3;
        ctx.strokeText(note.symbol, note.x, note.y);
        ctx.fillText(note.symbol, note.x, note.y);
        ctx.restore();
      }

      // 2B. Dramatic Spotlight & Sad Loser on top during REVEAL!
      if (sim.phase === 'REVEAL') {
        const loserDancer = sim.dancers.find((d) => d.isLoser);
        if (loserDancer) {
          // Dim the rest of the schoolyard
          ctx.save();
          ctx.fillStyle = 'rgba(15, 23, 42, 0.54)';
          ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);

          // Warm golden spotlight cone beaming onto the loser
          const lx = loserDancer.x;
          const ly = loserDancer.y;
          const beamGrad = ctx.createLinearGradient(lx, 0, lx, ly + 40);
          beamGrad.addColorStop(0, 'rgba(254, 240, 138, 0.12)');
          beamGrad.addColorStop(0.65, 'rgba(254, 240, 138, 0.32)');
          beamGrad.addColorStop(1, 'rgba(250, 204, 21, 0.45)');
          ctx.fillStyle = beamGrad;
          ctx.beginPath();
          ctx.moveTo(lx - 45, 0);
          ctx.lineTo(lx + 45, 0);
          ctx.lineTo(lx + 110, ly + 35);
          ctx.lineTo(lx - 110, ly + 35);
          ctx.closePath();
          ctx.fill();

          // Spotlight floor ring
          ctx.fillStyle = 'rgba(254, 240, 138, 0.38)';
          ctx.beginPath();
          ctx.ellipse(lx, ly + 4, 72, 20, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();

          // Draw Loser larger & trembling comically in the spotlight!
          const sadSprite = loserDancer.isGirl ? assets.girlSad : assets.boySad;
          const bigH = 122;
          const bigW = (sadSprite.width / sadSprite.height) * bigH;
          const shiver = Math.sin(tSec * 22) * 2.2;

          ctx.save();
          ctx.translate(lx + shiver, ly);
          ctx.drawImage(sadSprite, -bigW / 2, -bigH, bigW, bigH);
          ctx.restore();

          // Highlighted name pill
          ctx.save();
          ctx.font = '900 15px system-ui, sans-serif';
          const nw = ctx.measureText(loserDancer.shortName).width + 20;
          drawRoundedRect(ctx, lx - nw / 2, ly - bigH - 30, nw, 26, 8);
          ctx.fillStyle = '#fef08a';
          ctx.fill();
          ctx.lineWidth = 2.5;
          ctx.strokeStyle = '#dc2626';
          ctx.stroke();
          ctx.fillStyle = '#991b1b';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(loserDancer.shortName, lx, ly - bigH - 16.5);

          // Comic speech bubble: "Huhu... chậm mất một nhịp!"
          const cryText = 'Huhu... chậm mất một nhịp! 😭';
          ctx.font = '900 15px system-ui, sans-serif';
          const cw = ctx.measureText(cryText).width + 28;
          drawRoundedRect(ctx, lx - cw / 2, ly - bigH - 72, cw, 34, 14);
          ctx.fillStyle = '#ffffff';
          ctx.fill();
          ctx.lineWidth = 2.5;
          ctx.strokeStyle = '#dc2626';
          ctx.stroke();
          ctx.fillStyle = '#7f1d1d';
          ctx.fillText(cryText, lx, ly - bigH - 54.5);
          ctx.restore();
        }
      }

      ctx.restore(); // End DPR scale
      rafId = requestAnimationFrame(render);
    };

    rafId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(rafId);
  }, [assets, mcSpeech, onPickStudent, triggerMusicStopAndGrab]);

  const isRunning = phase === 'DANCING' || phase === 'GRAB';

  return (
    <div className="w-full flex flex-col items-center gap-3 select-none">
      <ConfettiBurst active={showConfetti} />

      {/* Main 16:9 Schoolyard Stage */}
      <div className="relative w-full max-w-6xl rounded-3xl overflow-hidden shadow-2xl border-4 border-rose-500/40 bg-amber-50">
        {/* Top Floating Badges */}
        <div className="absolute top-3 left-3 right-3 z-10 flex items-center justify-between gap-2 pointer-events-none">
          <div className="flex items-center gap-2">
            <span className="px-3.5 py-1.5 rounded-full bg-white/95 border-2 border-amber-600/40 text-amber-950 font-black text-xs sm:text-sm shadow">
              👥 {students.length}/{totalCount} bạn
            </span>
            <span className="px-3.5 py-1.5 rounded-full bg-rose-600 text-white font-black text-xs sm:text-sm shadow">
              🪑 {chairCount} ghế đỏ
            </span>
          </div>

          <span className="hidden sm:inline-block px-4 py-1.5 rounded-full bg-amber-950/80 border border-amber-200/40 text-amber-50 font-extrabold text-xs sm:text-sm shadow-lg backdrop-blur-sm">
            {students.length} bạn • {chairCount} ghế — Ai chậm chân sẽ lên bảng!
          </span>
        </div>

        {/* Canvas or Loader */}
        {loadError ? (
          <div className="w-full aspect-[1280/620] flex items-center justify-center bg-amber-50 text-rose-700 font-bold p-6">
            ⚠️ {loadError}
          </div>
        ) : !assets ? (
          <div className="w-full aspect-[1280/620] flex flex-col items-center justify-center gap-3 bg-gradient-to-b from-amber-100 to-rose-50 text-amber-950">
            <div className="w-10 h-10 rounded-full border-4 border-rose-500/30 border-t-rose-500 animate-spin" />
            <p className="font-bold text-sm">Đang xếp ghế nhựa đỏ ngoài sân trường...</p>
          </div>
        ) : (
          <canvas ref={canvasRef} className="w-full h-auto block aspect-[1280/620]" />
        )}

        {/* Reveal Modal Overlay matching the video's charming announcement card! */}
        {phase === 'REVEAL' && showCard && loser && (
          <div className="absolute top-12 left-1/2 -translate-x-1/2 z-20 w-[90%] max-w-md rounded-3xl bg-slate-900/95 border-4 border-amber-400 shadow-[0_20px_55px_rgba(0,0,0,0.65)] p-5 text-center backdrop-blur-md text-white">
            <div className="inline-block px-3.5 py-1 rounded-full bg-rose-500 text-white font-black text-xs uppercase tracking-wider mb-2">
              🪑 Hết ghế rồi!
            </div>
            <div className="text-2xl sm:text-3xl font-black text-amber-300 mb-1">
              {loser.name}
            </div>
            {loser.studentCode && (
              <div className="text-xs font-mono font-bold text-slate-400 mb-2">
                {loser.studentCode}
              </div>
            )}
            <p className="text-sm font-bold text-amber-100/90 mb-4">
              Mời em lên bảng nhé! ({students.length} bạn, {chairCount} ghế — chậm mất một nhịp!)
            </p>
            <button
              type="button"
              onClick={resetToIdle}
              className="px-6 py-2.5 rounded-full bg-gradient-to-r from-amber-400 to-orange-500 hover:brightness-110 text-slate-950 font-black text-sm shadow-lg shadow-amber-500/30 transition active:scale-95"
            >
              🪑 Chơi lượt tiếp theo
            </button>
          </div>
        )}
      </div>

      {/* Bottom Control Bar */}
      <div className="w-full max-w-4xl flex flex-wrap items-center justify-center gap-3 bg-slate-900/85 border border-rose-400/30 backdrop-blur-md rounded-2xl px-4 py-3 text-white shadow-xl">
        <button
          type="button"
          disabled={isRunning || !assets || students.length === 0}
          onClick={startMusicRound}
          className="px-7 py-2.5 rounded-full bg-gradient-to-r from-rose-500 via-red-500 to-amber-500 hover:brightness-110 disabled:opacity-45 text-white font-black text-sm shadow-lg shadow-rose-500/30 transition active:scale-95"
        >
          🎵 Bắt đầu bật nhạc!
        </button>

        {phase === 'DANCING' && (
          <button
            type="button"
            onClick={triggerMusicStopAndGrab}
            className="px-6 py-2.5 rounded-full bg-gradient-to-r from-amber-400 to-yellow-300 hover:brightness-110 text-slate-950 font-black text-sm shadow-lg transition active:scale-95"
          >
            ⏹️ Tắt nhạc ngay! (Giành ghế)
          </button>
        )}
      </div>
    </div>
  );
};

export default MusicalChairsGame;
