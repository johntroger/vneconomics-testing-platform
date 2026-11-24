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
import { cryptoShuffle } from '../rosterStorage';
import { useMinigameStageSettings, type PaceMode } from '../stageContext';
import type { MinigameProps, RosterStudent } from '../types';

const LOGICAL_W = 1280;
const LOGICAL_H = 620;

const DANCE_MS_BY_PACE: Record<PaceMode, number> = {
  TURBO: 2600,
  FAST: 6800,
  NORMAL: 11500,
  EPIC: 17500,
};

const ASSET_PATHS = {
  // Reuse crisp schoolyard, red chair & student dance/sit/sad sprites from gianh-ghe
  bgYard: '/assets/minigames/gianh-ghe/bg-schoolyard.jpg',
  chairRed: '/assets/minigames/gianh-ghe/chair-red.png',
  boyDance: '/assets/minigames/gianh-ghe/hs-nam-dance.png',
  girlDance: '/assets/minigames/gianh-ghe/hs-nu-dance.png',
  boySit: '/assets/minigames/gianh-ghe/hs-nam-sit.png',
  girlSit: '/assets/minigames/gianh-ghe/hs-nu-sit.png',
  boySad: '/assets/minigames/gianh-ghe/hs-nam-sad.png',
  girlSad: '/assets/minigames/gianh-ghe/hs-nu-sad.png',
  // Exclusive Last Chair sprites
  chuTuMc: '/assets/minigames/chiec-ghe-cuoi/chu-tu-mc.png',
  boyDive: '/assets/minigames/chiec-ghe-cuoi/hs-nam-dive.png',
  girlDive: '/assets/minigames/chiec-ghe-cuoi/hs-nu-dive.png',
  guardChair: '/assets/minigames/chiec-ghe-cuoi/guard-chair.png',
  blackCat: '/assets/minigames/chiec-ghe-cuoi/black-cat.png',
} as const;

type AssetKey = keyof typeof ASSET_PATHS;
type LoadedAssets = Record<AssetKey, HTMLImageElement>;

type GamePhase =
  | 'IDLE'
  | 'DANCING'
  | 'FAKE_STOP'
  | 'CUTSCENE_BUTTON'
  | 'CUTSCENE_DUEL'
  | 'SPOTLIGHT'
  | 'TWIST_GUARD'
  | 'REVEAL';

type TwistOutcome = 'NONE' | 'GUARD' | 'CAT';
type GroupSizeOption = 'ALL' | 6 | 10 | 16;

interface ChairPos {
  x: number;
  y: number;
}

interface Dancer {
  student: RosterStudent;
  shortName: string;
  isGirl: boolean;
  trackT: number;
  x: number;
  y: number;
  facingLeft: boolean;
  bobPhase: number;
  isLoser: boolean;
  isDuelWinner: boolean;
  chairIdx: number;
  seated: boolean;
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

function playRecordScratch(muted: boolean): void {
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
    osc.frequency.setValueAtTime(520, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(110, ctx.currentTime + 0.18);
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.22);
    osc.onended = () => ctx.close().catch(() => {});
  } catch {
    // Ignore audio error
  }
}

function layoutChairs(studentCount: number): ChairPos[] {
  const chairCount = Math.max(0, studentCount - 1);
  if (chairCount === 0) return [];
  const useTwoRows = chairCount > 10;
  const chairs: ChairPos[] = [];
  const leftX = 215;
  const rightX = 945;
  const spanX = rightX - leftX;

  if (!useTwoRows) {
    for (let i = 0; i < chairCount; i++) {
      const t = chairCount === 1 ? 0.5 : i / (chairCount - 1);
      const effSpan = Math.min(spanX, Math.max(190, (chairCount - 1) * 76));
      const startX = (leftX + rightX) / 2 - effSpan / 2;
      chairs.push({ x: startX + t * effSpan, y: 470 });
    }
  } else {
    const topCount = Math.ceil(chairCount / 2);
    const botCount = chairCount - topCount;
    for (let i = 0; i < topCount; i++) {
      const t = topCount === 1 ? 0.5 : i / (topCount - 1);
      chairs.push({ x: leftX + t * spanX, y: 438 });
    }
    for (let i = 0; i < botCount; i++) {
      const t = botCount === 1 ? 0.5 : i / (botCount - 1);
      const inset = 18;
      chairs.push({ x: leftX + inset + t * (spanX - inset * 2), y: 500 });
    }
  }
  return chairs;
}

function sampleOvalTrack(tNorm: number, chairCount: number): { x: number; y: number; facingLeft: boolean } {
  const t = ((tNorm % 1) + 1) % 1;
  const angle = t * Math.PI * 2;
  const cx = 580;
  const cy = 468;
  const rx = chairCount > 10 ? 445 : Math.min(420, Math.max(210, chairCount * 46 + 90));
  const ry = chairCount > 10 ? 114 : 92;
  const x = cx + Math.cos(angle) * rx;
  const y = cy + Math.sin(angle) * ry;
  return { x, y, facingLeft: Math.sin(angle) > 0 };
}

function createDancers(list: RosterStudent[]): Dancer[] {
  const n = list.length;
  const chairCount = Math.max(0, n - 1);
  return list.map((student, i) => {
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
      isDuelWinner: false,
      chairIdx: -1,
      seated: false,
    };
  });
}

export const LastChairGame: React.FC<MinigameProps> = ({
  students,
  allStudents,
  onPickStudent,
  muted,
}) => {
  const { paceMode } = useMinigameStageSettings();

  const [assets, setAssets] = useState<LoadedAssets | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [phase, setPhase] = useState<GamePhase>('IDLE');
  const [groupSize, setGroupSize] = useState<GroupSizeOption>('ALL');
  const [enableTwist, setEnableTwist] = useState<boolean>(true);
  const [activePool, setActivePool] = useState<RosterStudent[]>(students);
  const [mcSpeech, setMcSpeech] = useState<string>('Alo alo! Chiếc ghế cuối cùng sẵn sàng!');
  const [loser, setLoser] = useState<RosterStudent | null>(null);
  const [twistOutcome, setTwistOutcome] = useState<TwistOutcome>('NONE');
  const [showConfetti, setShowConfetti] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  const paceRef = useRef(paceMode);
  paceRef.current = paceMode;
  const twistEnabledRef = useRef(enableTwist);
  twistEnabledRef.current = enableTwist;

  const totalCount = allStudents.length;

  const displayPool = useMemo(() => {
    if (groupSize === 'ALL' || students.length <= groupSize) return students;
    return students.slice(0, groupSize);
  }, [students, groupSize]);

  const simRef = useRef<{
    phase: GamePhase;
    phaseStartMs: number;
    danceElapsedMs: number;
    danceTotalMs: number;
    didFakeStop: boolean;
    twist: TwistOutcome;
    chairs: ChairPos[];
    dancers: Dancer[];
    loserDancer: Dancer | null;
    duelWinnerDancer: Dancer | null;
    guardX: number;
    committed: boolean;
  }>({
    phase: 'IDLE',
    phaseStartMs: 0,
    danceElapsedMs: 0,
    danceTotalMs: DANCE_MS_BY_PACE.NORMAL,
    didFakeStop: false,
    twist: 'NONE',
    chairs: [],
    dancers: [],
    loserDancer: null,
    duelWinnerDancer: null,
    guardX: -120,
    committed: false,
  });

  // Preload all 13 sprites
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

  // Refresh chairs & dancers in IDLE when pool changes
  useEffect(() => {
    if (simRef.current.phase === 'IDLE') {
      setActivePool(displayPool);
      simRef.current.chairs = layoutChairs(displayPool.length);
      simRef.current.dancers = createDancers(displayPool);
    }
  }, [displayPool]);

  useEffect(() => {
    return () => {
      stopBackgroundMusic();
    };
  }, []);

  const enterCutsceneButton = useCallback(() => {
    const sim = simRef.current;
    if (sim.phase !== 'DANCING' && sim.phase !== 'FAKE_STOP') return;

    stopBackgroundMusic();
    playRecordScratch(mutedRef.current);

    // Seat all dancers except the 2 finalists (or all except loser) for when we return to the yard
    const remainingChairs = sim.chairs.map((_, idx) => idx);
    for (const d of sim.dancers) {
      if (d.isLoser) {
        d.chairIdx = -1;
        d.seated = false;
        d.x = 580;
        d.y = 562;
        continue;
      }
      const cIdx = remainingChairs.shift();
      d.chairIdx = cIdx ?? -1;
      d.seated = true;
      if (cIdx !== undefined) {
        d.x = sim.chairs[cIdx].x;
        d.y = sim.chairs[cIdx].y;
      }
    }

    sim.phase = 'CUTSCENE_BUTTON';
    sim.phaseStartMs = performance.now();
    setPhase('CUTSCENE_BUTTON');
    setMcSpeech('TẠCH! Tắt nhạc rồi nha!');
  }, []);

  const startRound = useCallback(() => {
    if (students.length === 0) return;
    unlockGameAudio();
    if (!mutedRef.current) startLobbyMusic();

    // Pick subset if playing by group size (6 / 10 / 16)
    const pool =
      groupSize === 'ALL' || students.length <= groupSize
        ? [...students]
        : cryptoShuffle([...students]).slice(0, groupSize);

    setActivePool(pool);

    const chairs = layoutChairs(pool.length);
    const dancers = createDancers(pool);

    // Fairly pick the loser and the duel contender
    const shuffled = cryptoShuffle([...dancers]);
    const pickedLoser = shuffled[0];
    const pickedDuelWinner = shuffled[1] || shuffled[0];
    pickedLoser.isLoser = true;
    if (pickedDuelWinner !== pickedLoser) {
      pickedDuelWinner.isDuelWinner = true;
    }

    // Decide Plot Twist outcome (~38% chance when Plot Twist toggle is ON!)
    let twist: TwistOutcome = 'NONE';
    if (twistEnabledRef.current && pool.length >= 2 && Math.random() < 0.38) {
      twist = Math.random() < 0.5 ? 'GUARD' : 'CAT';
    }

    const totalMs = DANCE_MS_BY_PACE[paceRef.current];
    const now = performance.now();

    simRef.current.chairs = chairs;
    simRef.current.dancers = dancers;
    simRef.current.loserDancer = pickedLoser;
    simRef.current.duelWinnerDancer = pickedDuelWinner;
    simRef.current.twist = twist;
    simRef.current.danceElapsedMs = 0;
    simRef.current.danceTotalMs = totalMs;
    simRef.current.didFakeStop = paceRef.current === 'TURBO'; // Skip fake-out in 3s turbo mode
    simRef.current.guardX = -120;
    simRef.current.committed = false;
    simRef.current.phase = 'DANCING';
    simRef.current.phaseStartMs = now;

    setLoser(pickedLoser.student);
    setTwistOutcome(twist);
    setShowConfetti(false);
    setPhase('DANCING');
    setMcSpeech(`Alo alo! Mời ${pool.length} bạn nhảy quanh ${Math.max(0, pool.length - 1)} ghế!`);
  }, [students, groupSize]);

  const resetToIdle = useCallback(() => {
    stopBackgroundMusic();
    simRef.current.phase = 'IDLE';
    simRef.current.chairs = layoutChairs(displayPool.length);
    simRef.current.dancers = createDancers(displayPool);
    simRef.current.loserDancer = null;
    simRef.current.duelWinnerDancer = null;
    simRef.current.committed = false;
    setPhase('IDLE');
    setLoser(null);
    setTwistOutcome('NONE');
    setShowConfetti(false);
    setMcSpeech('Alo alo! Chiếc ghế cuối cùng sẵn sàng!');
  }, [displayPool]);

  // Main 60fps Canvas Loop (Yard + Fake-out + Anime Cutscenes + Twists!)
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

      // --- 1. UPDATE STATE MACHINE ---
      if (sim.phase === 'DANCING') {
        sim.danceElapsedMs += dt * 1000;
        const progress = Math.min(1, sim.danceElapsedMs / sim.danceTotalMs);

        const speed = 0.14 + progress * 0.09;
        for (const d of sim.dancers) {
          d.trackT = (d.trackT + speed * dt) % 1;
          const pos = sampleOvalTrack(d.trackT, sim.chairs.length);
          d.x = pos.x;
          d.y = pos.y;
          d.facingLeft = pos.facingLeft;
        }

        // Trigger hilarious fake-out ("Đùa thôi, hi hi!") around 48% of dance duration
        if (!sim.didFakeStop && progress >= 0.48) {
          sim.didFakeStop = true;
          sim.phase = 'FAKE_STOP';
          sim.phaseStartMs = now;
          stopBackgroundMusic();
          playRecordScratch(mutedRef.current);
          setPhase('FAKE_STOP');
          setMcSpeech('Đùa thôi, hi hi! 😂 Nhảy tiếp đi!');
        } else if (sim.danceElapsedMs >= sim.danceTotalMs) {
          enterCutsceneButton();
        }
      } else if (sim.phase === 'FAKE_STOP') {
        const fakeSec = (now - sim.phaseStartMs) / 1000;
        if (fakeSec >= 1.55) {
          sim.phase = 'DANCING';
          if (!mutedRef.current) startLobbyMusic();
          setPhase('DANCING');
          setMcSpeech('Không ai biết lúc nào tắt thật đâu nha! 😎');
        }
      } else if (sim.phase === 'CUTSCENE_BUTTON') {
        const btnSec = (now - sim.phaseStartMs) / 1000;
        if (btnSec >= 0.85) {
          sim.phase = 'CUTSCENE_DUEL';
          sim.phaseStartMs = now;
          setPhase('CUTSCENE_DUEL');
          if (!mutedRef.current) playCatchSound();
        }
      } else if (sim.phase === 'CUTSCENE_DUEL') {
        const duelSec = (now - sim.phaseStartMs) / 1000;
        const duelTotal = sim.twist === 'CAT' ? 3.2 : 2.6;
        if (duelSec >= duelTotal) {
          if (sim.twist === 'CAT') {
            // Twist 2: Black Cat saved everyone -> Happy End reveal!
            sim.phase = 'REVEAL';
            sim.phaseStartMs = now;
            setPhase('REVEAL');
            setShowConfetti(true);
            if (!mutedRef.current) playWinnerFanfare();
          } else {
            sim.phase = 'SPOTLIGHT';
            sim.phaseStartMs = now;
            setPhase('SPOTLIGHT');
            setMcSpeech('Chiếc ghế cuối cùng đã có chủ!');
            if (!mutedRef.current) playWheelTick();
          }
        }
      } else if (sim.phase === 'SPOTLIGHT') {
        const spotSec = (now - sim.phaseStartMs) / 1000;
        if (sim.twist === 'GUARD' && spotSec >= 1.2) {
          sim.phase = 'TWIST_GUARD';
          sim.phaseStartMs = now;
          sim.guardX = -90;
          setPhase('TWIST_GUARD');
          setMcSpeech('Khoan đã... Bác Bảo Vệ tới kìa!! 😮');
          if (!mutedRef.current) playCatchSound();
        } else if (sim.twist === 'NONE' && spotSec >= 1.25) {
          sim.phase = 'REVEAL';
          sim.phaseStartMs = now;
          setPhase('REVEAL');
          setShowConfetti(true);
          if (!mutedRef.current) playWinnerFanfare();
          if (!sim.committed && sim.loserDancer) {
            sim.committed = true;
            onPickStudent(
              sim.loserDancer.student,
              `Chậm chân mất một nhịp trong Chiếc Ghế Cuối Cùng`,
            );
          }
        }
      } else if (sim.phase === 'TWIST_GUARD') {
        const gSec = (now - sim.phaseStartMs) / 1000;
        const targetGuardX = 460;
        sim.guardX += (targetGuardX - sim.guardX) * Math.min(1, dt * 4.5);
        if (gSec >= 2.2) {
          sim.phase = 'REVEAL';
          sim.phaseStartMs = now;
          setPhase('REVEAL');
          setShowConfetti(true);
          if (!mutedRef.current) playWinnerFanfare();
        }
      }

      // --- 2. DRAW CANVAS ---
      const dpr = window.devicePixelRatio || 1;
      if (canvas.width !== LOGICAL_W * dpr || canvas.height !== LOGICAL_H * dpr) {
        canvas.width = LOGICAL_W * dpr;
        canvas.height = LOGICAL_H * dpr;
      }
      ctx.save();
      ctx.scale(dpr, dpr);

      // ============================================================
      // ANIME CUTSCENE 1: BIG RED STOP BUTTON ("TẠCH!")
      // ============================================================
      if (sim.phase === 'CUTSCENE_BUTTON') {
        const btnSec = (now - sim.phaseStartMs) / 1000;
        const pressed = btnSec > 0.28;

        // Rotating anime sunburst yellow/orange background
        ctx.fillStyle = '#fde047';
        ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
        ctx.save();
        ctx.translate(LOGICAL_W / 2, LOGICAL_H / 2);
        ctx.rotate(tSec * 1.4);
        ctx.fillStyle = '#facc15';
        for (let i = 0; i < 16; i++) {
          ctx.rotate((Math.PI * 2) / 16);
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(-48, -900);
          ctx.lineTo(48, -900);
          ctx.closePath();
          ctx.fill();
        }
        ctx.restore();

        // Big 3D Cartoon Red Stop Button
        const cx = LOGICAL_W / 2;
        const cy = LOGICAL_H / 2 + 30;
        const pressOffset = pressed ? 18 : 0;

        // Metal base
        ctx.fillStyle = '#475569';
        ctx.strokeStyle = '#1e293b';
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.ellipse(cx, cy + 36, 155, 58, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Red button cylinder
        ctx.fillStyle = '#b91c1c';
        ctx.beginPath();
        ctx.ellipse(cx, cy + 16, 118, 44, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.ellipse(cx, cy - 22 + pressOffset, 114, 42, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Specular shine
        ctx.fillStyle = 'rgba(255,255,255,0.45)';
        ctx.beginPath();
        ctx.ellipse(cx - 32, cy - 32 + pressOffset, 38, 12, -0.2, 0, Math.PI * 2);
        ctx.fill();

        if (pressed) {
          // Comic impact text "TẠCH!"
          ctx.save();
          ctx.font = '900 84px system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillStyle = '#dc2626';
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 14;
          ctx.strokeText('TẠCH!', cx, 145);
          ctx.fillText('TẠCH!', cx, 145);
          ctx.restore();
        }

        ctx.restore();
        rafId = requestAnimationFrame(render);
        return;
      }

      // ============================================================
      // ANIME CUTSCENE 2: SLOW-MOTION DUEL FOR "CHIẾC GHẾ CUỐI CÙNG!"
      // ============================================================
      if (sim.phase === 'CUTSCENE_DUEL') {
        const duelSec = (now - sim.phaseStartMs) / 1000;
        const isCatTwist = sim.twist === 'CAT';

        // Zoomed-in courtyard floor backdrop with dramatic vignette
        ctx.drawImage(assets.bgYard, -160, -140, LOGICAL_W + 320, LOGICAL_H + 220);
        ctx.fillStyle = 'rgba(15, 23, 42, 0.42)';
        ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);

        // Anime speed lines on left & right edges
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
        ctx.lineWidth = 3;
        for (let i = 0; i < 14; i++) {
          const ly = 110 + i * 36;
          const jitter = ((tSec * 900 + i * 73) % 180);
          ctx.beginPath();
          ctx.moveTo(0, ly);
          ctx.lineTo(140 + jitter, ly);
          ctx.moveTo(LOGICAL_W, ly);
          ctx.lineTo(LOGICAL_W - 140 - jitter, ly);
          ctx.stroke();
        }
        ctx.restore();

        // Top Dramatic Title
        ctx.save();
        ctx.font = '900 44px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.strokeStyle = '#451a03';
        ctx.lineWidth = 10;
        const title = isCatTwist && duelSec > 1.3 ? 'PLOT TWIST! MÈO MUN CHIẾM GHẾ!' : 'CHIẾC GHẾ CUỐI CÙNG!';
        ctx.strokeText(title, LOGICAL_W / 2, 86);
        ctx.fillStyle = isCatTwist && duelSec > 1.3 ? '#facc15' : '#fef08a';
        ctx.fillText(title, LOGICAL_W / 2, 86);
        ctx.restore();

        // Glowing Golden Aura around THE LAST RED CHAIR in the dead center!
        const chairCx = LOGICAL_W / 2;
        const chairCy = 470;
        const glow = ctx.createRadialGradient(chairCx, chairCy - 110, 20, chairCx, chairCy - 110, 210);
        glow.addColorStop(0, 'rgba(254, 240, 138, 0.92)');
        glow.addColorStop(0.5, 'rgba(250, 204, 21, 0.38)');
        glow.addColorStop(1, 'rgba(250, 204, 21, 0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(chairCx, chairCy - 110, 210, 0, Math.PI * 2);
        ctx.fill();

        const bigChairH = 225;
        const bigChairW = (assets.chairRed.width / assets.chairRed.height) * bigChairH;
        ctx.drawImage(assets.chairRed, chairCx - bigChairW / 2, chairCy - bigChairH, bigChairW, bigChairH);

        const loserD = sim.loserDancer;
        const winnerD = sim.duelWinnerDancer;

        if (duelSec < 1.32) {
          // PHASE A: Slow-motion dive from LEFT (loser) and RIGHT (winner) toward the center chair!
          const u = Math.min(1, duelSec / 1.32);
          const ease = 1 - Math.pow(1 - u, 2.2);

          if (loserD) {
            const spr = loserD.isGirl ? assets.girlDive : assets.boyDive;
            const sh = 148;
            const sw = (spr.width / spr.height) * sh;
            const lx = 110 + ease * 315;
            const ly = 395 + Math.sin(u * Math.PI) * -28;
            ctx.drawImage(spr, lx - sw / 2, ly - sh / 2, sw, sh);
          }
          if (winnerD && winnerD !== loserD) {
            const spr = winnerD.isGirl ? assets.girlDive : assets.boyDive;
            const sh = 148;
            const sw = (spr.width / spr.height) * sh;
            const rx = LOGICAL_W - 110 - ease * 345;
            const ry = 395 + Math.sin(u * Math.PI) * -28;
            ctx.save();
            ctx.translate(rx, ry);
            ctx.scale(-1, 1); // Diving toward the LEFT
            ctx.drawImage(spr, -sw / 2, -sh / 2, sw, sh);
            ctx.restore();
          }
        } else if (isCatTwist) {
          // PHASE B (CAT TWIST!): Smug Black Cat drops onto the red chair ("VỤT! MEOW!") & knocks both kids away!
          const postU = Math.min(1, (duelSec - 1.32) / 0.55);
          const catY = chairCy - bigChairH * 0.48 - Math.pow(1 - postU, 2) * 340;
          const catH = 152;
          const catW = (assets.blackCat.width / assets.blackCat.height) * catH;
          ctx.drawImage(assets.blackCat, chairCx - catW / 2, catY - catH / 2, catW, catH);

          // Comic "MEOW!" bubble
          ctx.save();
          ctx.font = '900 32px system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 8;
          ctx.strokeText('MEOW! 🐾', chairCx, catY - 96);
          ctx.fillStyle = '#1e293b';
          ctx.fillText('MEOW! 🐾', chairCx, catY - 96);
          ctx.restore();

          // Both kids bounced to the sides looking shocked!
          if (loserD) {
            const spr = loserD.isGirl ? assets.girlSad : assets.boySad;
            const sh = 160;
            const sw = (spr.width / spr.height) * sh;
            ctx.drawImage(spr, 260 - sw / 2, 490 - sh, sw, sh);
          }
          if (winnerD && winnerD !== loserD) {
            const spr = winnerD.isGirl ? assets.girlSad : assets.boySad;
            const sh = 160;
            const sw = (spr.width / spr.height) * sh;
            ctx.drawImage(spr, LOGICAL_W - 260 - sw / 2, 490 - sh, sw, sh);
          }
        } else {
          // PHASE B (NORMAL): Winner lands "BỐP!" on chair, Loser tumbles "BỊCH!" on the left!
          if (winnerD) {
            const spr = winnerD.isGirl ? assets.girlSit : assets.boySit;
            const sh = 215;
            const sw = (spr.width / spr.height) * sh;
            ctx.drawImage(spr, chairCx - sw / 2, chairCy - sh - 18, sw, sh);

            ctx.save();
            ctx.font = '900 44px system-ui, sans-serif';
            ctx.textAlign = 'center';
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 9;
            ctx.strokeText('BỐP!', chairCx + 115, 250);
            ctx.fillStyle = '#ea580c';
            ctx.fillText('BỐP!', chairCx + 115, 250);
            ctx.restore();
          }
          if (loserD) {
            const spr = loserD.isGirl ? assets.girlSad : assets.boySad;
            const sh = 175;
            const sw = (spr.width / spr.height) * sh;
            const shake = Math.sin(tSec * 28) * 3;
            ctx.drawImage(spr, 285 - sw / 2 + shake, 500 - sh, sw, sh);

            ctx.save();
            ctx.font = '900 36px system-ui, sans-serif';
            ctx.textAlign = 'center';
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 8;
            ctx.strokeText('BỊCH! ⭐', 285, 310);
            ctx.fillStyle = '#dc2626';
            ctx.fillText('BỊCH! ⭐', 285, 310);
            ctx.restore();
          }
        }

        // Bottom Name Corners for the 2 contenders
        if (loserD) {
          ctx.save();
          drawRoundedRect(ctx, 28, LOGICAL_H - 58, 175, 40, 12);
          ctx.fillStyle = 'rgba(255,255,255,0.95)';
          ctx.fill();
          ctx.strokeStyle = '#dc2626';
          ctx.lineWidth = 3;
          ctx.stroke();
          ctx.font = '900 18px system-ui, sans-serif';
          ctx.fillStyle = '#991b1b';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(loserD.shortName, 28 + 87.5, LOGICAL_H - 38);
          ctx.restore();
        }
        if (winnerD && winnerD !== loserD) {
          ctx.save();
          drawRoundedRect(ctx, LOGICAL_W - 203, LOGICAL_H - 58, 175, 40, 12);
          ctx.fillStyle = 'rgba(255,255,255,0.95)';
          ctx.fill();
          ctx.strokeStyle = '#16a34a';
          ctx.lineWidth = 3;
          ctx.stroke();
          ctx.font = '900 18px system-ui, sans-serif';
          ctx.fillStyle = '#14532d';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(winnerD.shortName, LOGICAL_W - 203 + 87.5, LOGICAL_H - 38);
          ctx.restore();
        }

        ctx.restore();
        rafId = requestAnimationFrame(render);
        return;
      }

      // ============================================================
      // STANDARD SCHOOLYARD VIEW (IDLE / DANCING / FAKE_STOP / SPOTLIGHT / TWIST_GUARD / REVEAL)
      // ============================================================
      ctx.drawImage(assets.bgYard, 0, 0, LOGICAL_W, LOGICAL_H);

      const studentScale = sim.dancers.length > 26 ? 0.72 : sim.dancers.length > 15 ? 0.84 : 0.98;
      const chairH = 56 * studentScale;
      const chairW = (assets.chairRed.width / assets.chairRed.height) * chairH;
      const spriteH = 86 * studentScale;

      type RenderItem = { y: number; zBias: number; draw: () => void };
      const items: RenderItem[] = [];

      // Chú Tư MC on right side
      items.push({
        y: 472,
        zBias: 0,
        draw: () => {
          const th = 148;
          const tw = (assets.chuTuMc.width / assets.chuTuMc.height) * th;
          const bob = sim.phase === 'DANCING' ? Math.abs(Math.sin(tSec * 8)) * -6 : 0;
          const tx = 1152;
          const ty = 472;

          ctx.fillStyle = 'rgba(15, 23, 42, 0.22)';
          ctx.beginPath();
          ctx.ellipse(tx, ty + 2, tw * 0.42, 8, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.drawImage(assets.chuTuMc, tx - tw / 2, ty - th + bob, tw, th);

          // Speech bubble above Chú Tư
          ctx.save();
          ctx.font = '800 13px system-ui, -apple-system, sans-serif';
          const textW = ctx.measureText(mcSpeech).width;
          const bw = Math.min(265, textW + 22);
          const bh = 32;
          const bx = Math.min(LOGICAL_W - bw - 14, tx - bw / 2);
          const by = ty - th - 42 + bob;
          drawRoundedRect(ctx, bx, by, bw, bh, 12);
          ctx.fillStyle = '#ffffff';
          ctx.fill();
          ctx.lineWidth = 2;
          ctx.strokeStyle = '#ea580c';
          ctx.stroke();
          ctx.fillStyle = '#7c2d12';
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

      // Students
      for (const d of sim.dancers) {
        if (d.isLoser && (sim.phase === 'SPOTLIGHT' || sim.phase === 'TWIST_GUARD' || (sim.phase === 'REVEAL' && sim.twist !== 'CAT'))) {
          continue;
        }
        items.push({
          y: d.y,
          zBias: d.seated ? 1 : 0.5,
          draw: () => {
            const sprite = d.seated
              ? d.isGirl
                ? assets.girlSit
                : assets.boySit
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

            // Name pill
            const tagFont = sim.dancers.length > 26 ? 10 : 12;
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

            // Comic "Ơ... chú Tư!" bubble on a couple of students during FAKE_STOP
            if (sim.phase === 'FAKE_STOP' && d.isLoser) {
              ctx.save();
              ctx.font = '800 13px system-ui, sans-serif';
              const txt = 'Ơ... chú Tư!! 😅';
              const bw = ctx.measureText(txt).width + 18;
              drawRoundedRect(ctx, d.x - bw / 2, py - 32, bw, 26, 10);
              ctx.fillStyle = '#fef08a';
              ctx.fill();
              ctx.strokeStyle = '#b45309';
              ctx.lineWidth = 2;
              ctx.stroke();
              ctx.fillStyle = '#7c2d12';
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillText(txt, d.x, py - 19);
              ctx.restore();
            }
          },
        });
      }

      items.sort((a, b) => a.y - b.y || a.zBias - b.zBias);
      for (const item of items) item.draw();

      // Spotlight / Guard Twist overlay on top of schoolyard
      if (sim.phase === 'SPOTLIGHT' || sim.phase === 'TWIST_GUARD' || (sim.phase === 'REVEAL' && sim.twist !== 'CAT')) {
        const loserD = sim.loserDancer;
        if (loserD) {
          const lx = loserD.x;
          const ly = loserD.y;

          if (sim.phase === 'SPOTLIGHT' || (sim.phase === 'REVEAL' && sim.twist === 'NONE')) {
            ctx.save();
            ctx.fillStyle = 'rgba(15, 23, 42, 0.54)';
            ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);

            const beamGrad = ctx.createLinearGradient(lx, 0, lx, ly + 40);
            beamGrad.addColorStop(0, 'rgba(254, 240, 138, 0.12)');
            beamGrad.addColorStop(0.65, 'rgba(254, 240, 138, 0.34)');
            beamGrad.addColorStop(1, 'rgba(250, 204, 21, 0.48)');
            ctx.fillStyle = beamGrad;
            ctx.beginPath();
            ctx.moveTo(lx - 45, 0);
            ctx.lineTo(lx + 45, 0);
            ctx.lineTo(lx + 110, ly + 35);
            ctx.lineTo(lx - 110, ly + 35);
            ctx.closePath();
            ctx.fill();

            ctx.fillStyle = 'rgba(254, 240, 138, 0.38)';
            ctx.beginPath();
            ctx.ellipse(lx, ly + 4, 72, 20, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          }

          // If TWIST_GUARD is active, draw Security Guard jogging in with an extra red chair!
          const guardArrived = (sim.phase === 'TWIST_GUARD' && sim.guardX > 400) || (sim.phase === 'REVEAL' && sim.twist === 'GUARD');
          if (sim.phase === 'TWIST_GUARD' || (sim.phase === 'REVEAL' && sim.twist === 'GUARD')) {
            const gh = 148;
            const gw = (assets.guardChair.width / assets.guardChair.height) * gh;
            const gx = sim.guardX;
            const gy = ly;
            const gBob = sim.phase === 'TWIST_GUARD' && !guardArrived ? Math.abs(Math.sin(tSec * 12)) * -8 : 0;
            ctx.drawImage(assets.guardChair, gx - gw / 2, gy - gh + gBob, gw, gh);

            ctx.save();
            ctx.font = '900 14px system-ui, sans-serif';
            const gMsg = 'Thiếu ghế hả con? Có luôn! 🪑';
            const bw = ctx.measureText(gMsg).width + 24;
            drawRoundedRect(ctx, gx - bw / 2, gy - gh - 40, bw, 32, 12);
            ctx.fillStyle = '#dcfce7';
            ctx.fill();
            ctx.strokeStyle = '#15803d';
            ctx.lineWidth = 2.5;
            ctx.stroke();
            ctx.fillStyle = '#14532d';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(gMsg, gx, gy - gh - 23.5);
            ctx.restore();
          }

          // Draw Loser (saved & happy if guard arrived, otherwise sad & shivering!)
          if (guardArrived) {
            ctx.drawImage(assets.chairRed, lx - chairW / 2, ly - chairH, chairW, chairH);
            const happySpr = loserD.isGirl ? assets.girlSit : assets.boySit;
            const hh = 112;
            const hw = (happySpr.width / happySpr.height) * hh;
            ctx.drawImage(happySpr, lx - hw / 2, ly - hh - 8, hw, hh);
          } else {
            const sadSpr = loserD.isGirl ? assets.girlSad : assets.boySad;
            const bigH = 122;
            const bigW = (sadSpr.width / sadSpr.height) * bigH;
            const shiver = Math.sin(tSec * 22) * 2.2;
            ctx.drawImage(sadSpr, lx - bigW / 2 + shiver, ly - bigH, bigW, bigH);

            ctx.save();
            const cryText = 'Huhu... chậm mất một nhịp! 😭';
            ctx.font = '900 15px system-ui, sans-serif';
            const cw = ctx.measureText(cryText).width + 28;
            drawRoundedRect(ctx, lx - cw / 2, ly - bigH - 46, cw, 34, 14);
            ctx.fillStyle = '#ffffff';
            ctx.fill();
            ctx.lineWidth = 2.5;
            ctx.strokeStyle = '#dc2626';
            ctx.stroke();
            ctx.fillStyle = '#7f1d1d';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(cryText, lx, ly - bigH - 28.5);
            ctx.restore();
          }
        }
      }

      ctx.restore(); // End DPR scale
      rafId = requestAnimationFrame(render);
    };

    rafId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(rafId);
  }, [assets, mcSpeech, onPickStudent, enterCutsceneButton]);

  const isRunning = phase !== 'IDLE' && phase !== 'REVEAL';
  const chairCount = Math.max(0, activePool.length - 1);

  return (
    <div className="w-full flex flex-col items-center gap-3 select-none">
      <ConfettiBurst active={showConfetti} />

      {/* Main 16:9 Stage */}
      <div className="relative w-full max-w-6xl rounded-3xl overflow-hidden shadow-2xl border-4 border-orange-500/45 bg-amber-50">
        {/* Top Floating HUD (auto-hides during fullscreen anime cutscenes so title is 100% unobstructed) */}
        {phase !== 'CUTSCENE_BUTTON' && phase !== 'CUTSCENE_DUEL' && (
          <div className="absolute top-3 left-3 right-3 z-10 flex items-center justify-between gap-2 pointer-events-none">
            <div className="flex items-center gap-2">
              <span className="px-3.5 py-1.5 rounded-full bg-white/95 border-2 border-orange-500/40 text-amber-950 font-black text-xs sm:text-sm shadow">
                👥 {activePool.length} bạn trên sân (lớp {totalCount})
              </span>
              <span className="px-3.5 py-1.5 rounded-full bg-red-600 text-white font-black text-xs sm:text-sm shadow">
                🪑 {chairCount} ghế đỏ
              </span>
            </div>

            <span className="hidden sm:inline-block px-3.5 py-1.5 rounded-full bg-slate-900/80 border border-amber-300/40 text-amber-200 font-extrabold text-xs shadow backdrop-blur-sm">
              {enableTwist ? '🎭 Plot Twist: ĐANG BẬT (Bảo Vệ / Mèo Mun)' : '🎯 Chế độ chuẩn: 100% gọi lên bảng'}
            </span>
          </div>
        )}

        {/* Canvas or Loader */}
        {loadError ? (
          <div className="w-full aspect-[1280/620] flex items-center justify-center bg-amber-50 text-rose-700 font-bold p-6">
            ⚠️ {loadError}
          </div>
        ) : !assets ? (
          <div className="w-full aspect-[1280/620] flex flex-col items-center justify-center gap-3 bg-gradient-to-b from-amber-100 to-orange-50 text-amber-950">
            <div className="w-10 h-10 rounded-full border-4 border-orange-500/30 border-t-orange-500 animate-spin" />
            <p className="font-bold text-sm">Chú Tư đang kéo loa ra sân trường...</p>
          </div>
        ) : (
          <canvas ref={canvasRef} className="w-full h-auto block aspect-[1280/620]" />
        )}

        {/* Reveal Overlay Card (Normal Loser OR Happy End Plot Twist!) */}
        {phase === 'REVEAL' && loser && (
          <div className="absolute top-12 left-1/2 -translate-x-1/2 z-20 w-[92%] max-w-md rounded-3xl bg-slate-900/95 border-4 border-amber-400 shadow-[0_20px_55px_rgba(0,0,0,0.65)] p-5 text-center backdrop-blur-md text-white">
            {twistOutcome === 'GUARD' ? (
              <>
                <div className="inline-block px-3.5 py-1 rounded-full bg-emerald-500 text-white font-black text-xs uppercase tracking-wider mb-2">
                  👮‍♂️ PLOT TWIST — HAPPY END!
                </div>
                <div className="text-xl sm:text-2xl font-black text-emerald-300 mb-1">
                  Bác Bảo Vệ đã cứu {loser.name}!
                </div>
                <p className="text-sm font-bold text-slate-200 mb-4">
                  Bác mang thêm ghế đỏ đúng lúc! Bấm chơi lại — lần này chưa chắc có ai cứu đâu nha! 😂
                </p>
                <button
                  type="button"
                  onClick={startRound}
                  className="px-6 py-2.5 rounded-full bg-gradient-to-r from-emerald-400 to-teal-500 hover:brightness-110 text-slate-950 font-black text-sm shadow-lg transition active:scale-95"
                >
                  🔄 Chơi lại lượt mới ngay!
                </button>
              </>
            ) : twistOutcome === 'CAT' ? (
              <>
                <div className="inline-block px-3.5 py-1 rounded-full bg-violet-500 text-white font-black text-xs uppercase tracking-wider mb-2">
                  🐈‍⬛ PLOT TWIST — MÈO MUN CHIẾM GHẾ!
                </div>
                <div className="text-xl sm:text-2xl font-black text-amber-300 mb-1">
                  Mèo Mun đã cứu {loser.name} thoát nạn!
                </div>
                <p className="text-sm font-bold text-slate-200 mb-4">
                  Chú Tư bó tay: &ldquo;Ghế này... của mèo?!&rdquo; Bấm chơi lượt mới để tìm người lên bảng nào!
                </p>
                <button
                  type="button"
                  onClick={startRound}
                  className="px-6 py-2.5 rounded-full bg-gradient-to-r from-violet-400 to-fuchsia-500 hover:brightness-110 text-white font-black text-sm shadow-lg transition active:scale-95"
                >
                  🔄 Chơi lại lượt mới ngay!
                </button>
              </>
            ) : (
              <>
                <div className="inline-block px-3.5 py-1 rounded-full bg-rose-500 text-white font-black text-xs uppercase tracking-wider mb-2">
                  🪑 Bạn lên bảng hôm nay là...
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
                  {activePool.length} bạn giành {chairCount} ghế — em chậm chân mất một nhịp!
                </p>
                <button
                  type="button"
                  onClick={resetToIdle}
                  className="px-6 py-2.5 rounded-full bg-gradient-to-r from-amber-400 to-orange-500 hover:brightness-110 text-slate-950 font-black text-sm shadow-lg transition active:scale-95"
                >
                  🪑 Lượt tiếp theo
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Bottom Control Bar: Start + Manual Stop + Group Size + Plot Twist Toggle */}
      <div className="w-full max-w-5xl flex flex-wrap items-center justify-center gap-2.5 bg-slate-900/85 border border-orange-400/30 backdrop-blur-md rounded-2xl px-4 py-3 text-white shadow-xl">
        <button
          type="button"
          disabled={isRunning || !assets || students.length === 0}
          onClick={startRound}
          className="px-6 py-2.5 rounded-full bg-gradient-to-r from-orange-500 via-red-500 to-amber-500 hover:brightness-110 disabled:opacity-45 text-white font-black text-sm shadow-lg shadow-orange-500/30 transition active:scale-95"
        >
          🎬 Bắt đầu Chiếc Ghế Cuối Cùng!
        </button>

        {phase === 'DANCING' && (
          <button
            type="button"
            onClick={enterCutsceneButton}
            className="px-5 py-2.5 rounded-full bg-red-600 hover:bg-red-500 text-white font-black text-sm shadow-lg transition active:scale-95"
          >
            🔴 Bấm TẠCH! (Giành ghế ngay)
          </button>
        )}

        {/* Group Size Selector: Cả lớp / 6 / 10 / 16 */}
        <div className="flex items-center gap-1 bg-black/40 p-1 rounded-full border border-white/15">
          {(['ALL', 6, 10, 16] as GroupSizeOption[]).map((opt) => (
            <button
              key={String(opt)}
              type="button"
              disabled={isRunning}
              onClick={() => setGroupSize(opt)}
              className={`px-3 py-1.5 rounded-full text-xs font-black transition ${
                groupSize === opt
                  ? 'bg-amber-400 text-slate-950 shadow'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              {opt === 'ALL' ? 'Cả lớp' : `${opt} bạn`}
            </button>
          ))}
        </div>

        {/* Plot Twist Toggle Button right below the stage! */}
        <button
          type="button"
          disabled={isRunning}
          onClick={() => setEnableTwist((v) => !v)}
          className={`px-4 py-2 rounded-full text-xs font-black border transition ${
            enableTwist
              ? 'bg-violet-600/90 border-violet-300/60 text-white shadow-md shadow-violet-500/25'
              : 'bg-white/10 border-white/20 text-slate-300 hover:bg-white/15'
          }`}
          title="Bật để thỉnh thoảng xuất hiện Bác Bảo Vệ hoặc Mèo Mun bất ngờ cứu học sinh!"
        >
          {enableTwist ? '🎭 Plot Twist: BẬT' : '🎭 Plot Twist: TẮT'}
        </button>
      </div>
    </div>
  );
};

export default LastChairGame;
