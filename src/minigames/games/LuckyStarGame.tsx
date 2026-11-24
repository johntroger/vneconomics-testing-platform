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

const AUTO_STOP_MS_BY_PACE: Record<PaceMode, number> = {
  TURBO: 3000,
  FAST: 9000,
  NORMAL: 17000,
  EPIC: 26000,
};

interface SphereNode {
  student: RosterStudent;
  // Unit sphere coordinates (Fibonacci lattice)
  ux: number;
  uy: number;
  uz: number;
  twinklePhase: number;
}

interface BgStar {
  x: number;
  y: number;
  r: number;
  phase: number;
  speed: number;
  color: string;
}

function shortUpperName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  const display = parts.length <= 2 ? fullName.trim() : parts.slice(-2).join(' ');
  return display.toUpperCase();
}

function buildFibonacciSphere(list: RosterStudent[]): SphereNode[] {
  const n = list.length;
  if (n === 0) return [];
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  return list.map((student, i) => {
    const y = n === 1 ? 0 : 1 - (i / (n - 1)) * 2; // 1 to -1
    const radiusAtY = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = goldenAngle * i;
    return {
      student,
      ux: Math.cos(theta) * radiusAtY,
      uy: y,
      uz: Math.sin(theta) * radiusAtY,
      twinklePhase: (i * 1.7) % (Math.PI * 2),
    };
  });
}

function drawRoundedStar(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  outerR: number,
  glowIntensity: number,
): void {
  const innerR = outerR * 0.48;
  const points = 5;

  ctx.save();
  ctx.translate(cx, cy);

  if (glowIntensity > 0) {
    ctx.shadowColor = '#facc15';
    ctx.shadowBlur = outerR * 0.85 * glowIntensity;
  }

  const grad = ctx.createRadialGradient(
    -outerR * 0.2,
    -outerR * 0.25,
    outerR * 0.1,
    0,
    0,
    outerR * 1.05,
  );
  grad.addColorStop(0, '#fefce8');
  grad.addColorStop(0.38, '#fde047');
  grad.addColorStop(0.78, '#f59e0b');
  grad.addColorStop(1, '#d97706');

  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const angle = (i * Math.PI) / points - Math.PI / 2;
    const x = Math.cos(angle) * r;
    const y = Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(2, outerR * 0.14);
  ctx.strokeStyle = '#fde047';
  ctx.stroke();
  ctx.fillStyle = grad;
  ctx.fill();

  // Subtle glossy specular highlight on top center
  ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.42)';
  ctx.beginPath();
  ctx.ellipse(-outerR * 0.12, -outerR * 0.22, outerR * 0.18, outerR * 0.1, -0.4, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

export const LuckyStarGame: React.FC<MinigameProps> = ({
  students,
  muted,
}) => {
  const { paceMode } = useMinigameStageSettings();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const confettiTimerRef = useRef<number | null>(null);

  const [phase, setPhase] = useState<'IDLE' | 'SPINNING' | 'REVEAL'>('IDLE');
  const [pickCount, setPickCount] = useState<number>(1);
  const [showCountMenu, setShowCountMenu] = useState<boolean>(false);
  const [speedMult, setSpeedMult] = useState<number>(1.0);
  const [remainingSec, setRemainingSec] = useState<number>(0);
  const [winners, setWinners] = useState<RosterStudent[]>([]);
  const [confetti, setConfetti] = useState<boolean>(false);

  const nodes = useMemo(() => buildFibonacciSphere(students), [students]);

  // Refs for 60fps Canvas loop
  const nodesRef = useRef<SphereNode[]>(nodes);
  nodesRef.current = nodes;
  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  const speedMultRef = useRef(speedMult);
  speedMultRef.current = speedMult;
  const pickCountRef = useRef(pickCount);
  pickCountRef.current = pickCount;

  const lastCountdownRef = useRef<number>(-1);
  const bgStarsRef = useRef<BgStar[]>([]);

  const spinRef = useRef<{
    state: 'IDLE' | 'SPINNING' | 'DECEL' | 'REVEAL';
    rotY: number;
    rotX: number;
    velY: number;
    velX: number;
    startMs: number;
    autoStopMs: number;
    decelStartMs: number;
    lastTickMs: number;
  }>({
    state: 'IDLE',
    rotY: 0,
    rotX: 0.18,
    velY: 0.25,
    velX: 0.05,
    startMs: 0,
    autoStopMs: 17000,
    decelStartMs: 0,
    lastTickMs: 0,
  });

  // Cleanup timers & music on unmount
  useEffect(() => {
    return () => {
      stopBackgroundMusic();
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      if (confettiTimerRef.current !== null) window.clearTimeout(confettiTimerRef.current);
    };
  }, []);

  // Sync upbeat background groove with spinning & mute toggle
  useEffect(() => {
    if (phase === 'SPINNING' && !muted) {
      startLobbyMusic();
    } else {
      stopBackgroundMusic();
    }
  }, [phase, muted]);

  const commitWinners = useCallback(() => {
    const currentPool = nodesRef.current.map((n) => n.student);
    if (currentPool.length === 0) {
      spinRef.current.state = 'IDLE';
      setPhase('IDLE');
      return;
    }

    const k = Math.min(pickCountRef.current, currentPool.length);
    const chosen = cryptoShuffle(currentPool).slice(0, k);
    const chosenIds = new Set(chosen.map((c) => c.id));

    // Persist all chosen stars into store so "Không gọi trùng" excludes them on next round
    const store = readMinigameStore();
    const nowIso = new Date().toISOString();
    const nextStudents = store.students.map((s) =>
      chosenIds.has(s.id) ? { ...s, called: true } : s,
    );
    const newEntries = chosen.map((st, idx) => ({
      id: `hist_${Date.now().toString(36)}_${idx}`,
      studentId: st.id,
      studentName: st.name,
      studentCode: st.studentCode,
      gameId: 'ngoi-sao-may-man',
      gameName: 'Ngôi Sao May Mắn',
      bonusAwarded: 0,
      status: 'PICKED' as const,
      at: nowIso,
    }));
    writeMinigameStore({
      ...store,
      students: nextStudents,
      history: [...newEntries, ...store.history].slice(0, 500),
    });

    spinRef.current.state = 'REVEAL';
    setWinners(chosen);
    setPhase('REVEAL');
    stopBackgroundMusic();
    setConfetti(true);

    if (!mutedRef.current) {
      playCatchSound();
      playWinnerFanfare();
    }
    if (confettiTimerRef.current !== null) window.clearTimeout(confettiTimerRef.current);
    confettiTimerRef.current = window.setTimeout(() => setConfetti(false), 3800);
  }, []);

  const triggerStop = useCallback(() => {
    if (spinRef.current.state !== 'SPINNING') return;
    spinRef.current.state = 'DECEL';
    spinRef.current.decelStartMs = performance.now();
  }, []);

  // 60fps High-DPI 3D Star Sphere Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, 2);
    canvas.width = LOGICAL_W * dpr;
    canvas.height = LOGICAL_H * dpr;

    if (bgStarsRef.current.length === 0) {
      const palette = ['#ffffff', '#fef08a', '#bae6fd', '#fde68a'];
      for (let i = 0; i < 165; i++) {
        bgStarsRef.current.push({
          x: Math.random() * LOGICAL_W,
          y: Math.random() * LOGICAL_H,
          r: 0.7 + Math.random() * 1.9,
          phase: Math.random() * Math.PI * 2,
          speed: 1.5 + Math.random() * 3,
          color: palette[i % palette.length],
        });
      }
    }

    let prevNow = performance.now();

    const render = (now: number) => {
      const dt = Math.min(0.05, Math.max(0.001, (now - prevNow) / 1000));
      prevNow = now;
      const tSec = now / 1000;
      const spin = spinRef.current;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, LOGICAL_W, LOGICAL_H);

      // 1. Deep Cosmic Night Background
      const bgGrad = ctx.createRadialGradient(
        LOGICAL_W / 2,
        LOGICAL_H / 2,
        40,
        LOGICAL_W / 2,
        LOGICAL_H / 2,
        LOGICAL_W * 0.65,
      );
      bgGrad.addColorStop(0, '#0f172a');
      bgGrad.addColorStop(0.55, '#070b18');
      bgGrad.addColorStop(1, '#02040a');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);

      // 2. Twinkling Starfield
      for (const st of bgStarsRef.current) {
        const a = 0.25 + 0.75 * (0.5 + 0.5 * Math.sin(tSec * st.speed + st.phase));
        ctx.fillStyle = st.color;
        ctx.globalAlpha = a;
        ctx.beginPath();
        ctx.arc(st.x, st.y, st.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // 3. Update 3D Sphere Physics
      const spd = speedMultRef.current;
      if (spin.state === 'IDLE') {
        spin.velY = 0.22 * spd;
        spin.velX = 0.04 * spd;
      } else if (spin.state === 'SPINNING') {
        const targetVelY = 2.65 * spd;
        const targetVelX = 0.72 * spd;
        spin.velY += (targetVelY - spin.velY) * Math.min(1, dt * 4);
        spin.velX += (targetVelX - spin.velX) * Math.min(1, dt * 4);

        const elapsed = now - spin.startMs;
        const rem = Math.max(0, (spin.autoStopMs - elapsed) / 1000);
        const rounded = Math.ceil(rem * 10) / 10;
        if (rounded !== lastCountdownRef.current) {
          lastCountdownRef.current = rounded;
          setRemainingSec(rounded);
        }

        if (now - spin.lastTickMs >= Math.max(70, 150 / spd)) {
          spin.lastTickMs = now;
          if (!mutedRef.current) playWheelTick();
        }

        // Auto-stop smoothly right when paceMode timer completes
        if (elapsed >= spin.autoStopMs) {
          spin.state = 'DECEL';
          spin.decelStartMs = now;
        }
      } else if (spin.state === 'DECEL') {
        const decelMs = 1150;
        const dp = Math.min(1, (now - spin.decelStartMs) / decelMs);
        spin.velY *= Math.pow(0.08, dt);
        spin.velX *= Math.pow(0.08, dt);
        if (now - spin.lastTickMs >= 110 + dp * 260) {
          spin.lastTickMs = now;
          if (!mutedRef.current) playWheelTick();
        }
        if (dp >= 1) {
          commitWinners();
        }
      } else if (spin.state === 'REVEAL') {
        spin.velY = 0.14;
        spin.velX = 0.02;
      }

      spin.rotY += spin.velY * dt;
      spin.rotX += spin.velX * dt;

      // 4. Project 3D Fibonacci Sphere Stars & Depth-Sort
      const currentNodes = nodesRef.current;
      const cx = LOGICAL_W / 2;
      const cy = LOGICAL_H / 2 + 12;
      const sphereR = Math.min(LOGICAL_W, LOGICAL_H) * 0.37;
      const focal = 720;

      const cosY = Math.cos(spin.rotY);
      const sinY = Math.sin(spin.rotY);
      const cosX = Math.cos(spin.rotX);
      const sinX = Math.sin(spin.rotX);

      const projected = currentNodes.map((node) => {
        // Rotate around Y
        const x1 = node.ux * cosY - node.uz * sinY;
        const z1 = node.ux * sinY + node.uz * cosY;
        const y1 = node.uy;
        // Rotate around X
        const y2 = y1 * cosX - z1 * sinX;
        const z2 = y1 * sinX + z1 * cosX;

        const zWorld = z2 * sphereR;
        const persp = focal / (focal - zWorld);
        return {
          node,
          sx: cx + x1 * sphereR * persp,
          sy: cy + y2 * sphereR * persp,
          depth: (z2 + 1) / 2, // 0 = far back, 1 = closest front
          persp,
        };
      });

      projected.sort((a, b) => a.depth - b.depth);

      const dimFactor = spin.state === 'REVEAL' ? 0.25 : 1;
      const denseScale = currentNodes.length > 36 ? 0.84 : currentNodes.length > 22 ? 0.94 : 1.06;

      for (const p of projected) {
        const alpha = (0.28 + p.depth * 0.72) * dimFactor;
        const starR = (11 + p.depth * 14) * denseScale;
        const fontPx = Math.round((9.5 + p.depth * 6) * denseScale);

        ctx.save();
        ctx.globalAlpha = alpha;
        drawRoundedStar(ctx, p.sx, p.sy, starR, p.depth * 0.9);

        ctx.font = `900 ${fontPx}px system-ui, -apple-system, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillStyle = p.depth > 0.65 ? '#fef9c3' : '#e2e8f0';
        ctx.shadowColor = 'rgba(0,0,0,0.9)';
        ctx.shadowBlur = 4;
        ctx.fillText(shortUpperName(p.node.student.name), p.sx, p.sy + starR + 4);
        ctx.restore();
      }

      rafRef.current = requestAnimationFrame(render);
    };

    rafRef.current = requestAnimationFrame(render);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [commitWinners]);

  const handleStart = () => {
    if (phase === 'SPINNING' || students.length === 0) return;
    void unlockGameAudio();
    setShowCountMenu(false);
    setWinners([]);
    const autoMs = AUTO_STOP_MS_BY_PACE[paceMode];
    lastCountdownRef.current = -1;
    setRemainingSec(autoMs / 1000);
    spinRef.current.state = 'SPINNING';
    spinRef.current.startMs = performance.now();
    spinRef.current.autoStopMs = autoMs;
    spinRef.current.lastTickMs = 0;
    setPhase('SPINNING');
  };

  const handleNewRound = () => {
    stopBackgroundMusic();
    setShowCountMenu(false);
    setWinners([]);
    spinRef.current.state = 'IDLE';
    setPhase('IDLE');
    const store = readMinigameStore();
    writeMinigameStore({
      ...store,
      students: store.students.map((s) => ({ ...s, called: false, absent: false })),
    });
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-3 sm:p-4 gap-3.5 select-none">
      {/* Main Cosmic Stage */}
      <div className="w-full max-w-6xl rounded-3xl overflow-hidden border-2 border-amber-400/35 shadow-[0_20px_60px_rgba(0,0,0,0.65)] bg-slate-950 relative">
        <ConfettiBurst active={confetti} />

        {/* Glowing Title Header inside Stage */}
        <div className="absolute top-3 left-0 right-0 z-10 text-center pointer-events-none px-4">
          <div className="inline-block font-black text-xl sm:text-3xl tracking-wide bg-gradient-to-b from-yellow-200 via-amber-400 to-orange-500 bg-clip-text text-transparent drop-shadow-[0_2px_12px_rgba(251,191,36,0.55)]">
            ✨ NGÔI SAO MAY MẮN LÀ AI? ✨
          </div>
          {phase === 'SPINNING' && (
            <div className="mt-1">
              <span className="px-3 py-0.5 rounded-full bg-amber-400/20 border border-amber-300/40 text-amber-200 text-xs font-black backdrop-blur-sm">
                ⏱️ Tự dừng sau {remainingSec.toFixed(1)}s • Hoặc bấm Dừng lại bất cứ lúc nào
              </span>
            </div>
          )}
        </div>

        <canvas
          ref={canvasRef}
          className="w-full h-auto block aspect-[1280/620]"
        />

        {/* Winner Reveal Overlay (1 to 5 Giant Glowing Stars Centered!) */}
        {phase === 'REVEAL' && winners.length > 0 && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-slate-950/55 backdrop-blur-[2px] p-4 animate-fade-in">
            <div className="text-xs sm:text-sm font-black uppercase tracking-[0.2em] text-amber-300 mb-4 drop-shadow">
              {winners.length > 1
                ? `🎉 ${winners.length} NGÔI SAO MAY MẮN ĐƯỢC CHỌN!`
                : '🎉 XIN CHÚC MỪNG NGÔI SAO MAY MẮN!'}
            </div>

            <div className="flex flex-wrap items-center justify-center gap-5 sm:gap-8 max-w-5xl">
              {winners.map((w) => (
                <div
                  key={w.id}
                  className="flex flex-col items-center gap-2.5 animate-bounce"
                  style={{ animationDuration: '2.2s' }}
                >
                  <svg
                    viewBox="0 0 120 120"
                    className={`${
                      winners.length === 1
                        ? 'w-36 h-36 sm:w-44 sm:h-44'
                        : winners.length <= 3
                          ? 'w-28 h-28 sm:w-36 sm:h-36'
                          : 'w-20 h-20 sm:w-28 sm:h-28'
                    } drop-shadow-[0_0_26px_rgba(250,204,21,0.85)]`}
                  >
                    <defs>
                      <radialGradient id={`starGrad-${w.id}`} cx="38%" cy="35%" r="65%">
                        <stop offset="0%" stopColor="#fefce8" />
                        <stop offset="40%" stopColor="#fde047" />
                        <stop offset="80%" stopColor="#f59e0b" />
                        <stop offset="100%" stopColor="#d97706" />
                      </radialGradient>
                    </defs>
                    <polygon
                      points="60,8 74,40 109,44 82,68 90,103 60,85 30,103 38,68 11,44 46,40"
                      fill={`url(#starGrad-${w.id})`}
                      stroke="#fef08a"
                      strokeWidth="5"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <div
                    className={`font-black text-white text-center uppercase tracking-wide drop-shadow-[0_2px_8px_rgba(0,0,0,0.95)] ${
                      winners.length === 1
                        ? 'text-2xl sm:text-4xl'
                        : winners.length <= 3
                          ? 'text-lg sm:text-2xl'
                          : 'text-sm sm:text-lg'
                    }`}
                  >
                    {w.name}
                  </div>
                  {w.studentCode && (
                    <div className="text-xs font-mono font-bold text-amber-200/90">
                      {w.studentCode}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={() => {
                spinRef.current.state = 'IDLE';
                setPhase('IDLE');
                setWinners([]);
              }}
              className="mt-6 px-6 py-2.5 rounded-full bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-sm shadow-xl shadow-amber-500/30 transition active:scale-95"
            >
              ✨ Tiếp tục quay lượt mới
            </button>
          </div>
        )}
      </div>

      {/* Bottom Control Bar matching the video UX */}
      <div className="w-full max-w-4xl flex flex-wrap items-center justify-center gap-3 bg-slate-900/80 border border-amber-400/25 backdrop-blur-md rounded-2xl px-4 py-3 text-white shadow-xl">
        <button
          type="button"
          disabled={phase === 'SPINNING' || students.length === 0}
          onClick={handleStart}
          className="px-6 py-2.5 rounded-full bg-gradient-to-r from-yellow-300 via-amber-400 to-orange-400 hover:brightness-110 disabled:opacity-45 text-slate-950 font-black text-sm shadow-lg shadow-amber-500/25 transition active:scale-95"
        >
          ⭐ Bắt đầu
        </button>

        <button
          type="button"
          disabled={phase !== 'SPINNING'}
          onClick={triggerStop}
          className="px-6 py-2.5 rounded-full bg-gradient-to-r from-rose-500 to-amber-500 hover:brightness-110 disabled:opacity-35 text-white font-black text-sm shadow-lg transition active:scale-95"
        >
          ⏹️ Dừng lại
        </button>

        {/* Speed Slider */}
        <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-black/35 border border-white/15">
          <span className="text-xs font-bold text-amber-200">Tốc độ</span>
          <input
            type="range"
            min={0.4}
            max={2.4}
            step={0.1}
            value={speedMult}
            onChange={(e) => setSpeedMult(Number(e.target.value))}
            className="w-24 sm:w-32 accent-amber-400 cursor-pointer"
            title="Chỉnh tốc độ xoay quả cầu ngôi sao"
          />
        </div>

        {/* Pick Count Selector (1..5) */}
        <div className="relative">
          <button
            type="button"
            disabled={phase === 'SPINNING'}
            onClick={() => setShowCountMenu((v) => !v)}
            className="px-4 py-2.5 rounded-full bg-amber-400/90 hover:bg-amber-300 disabled:opacity-45 text-slate-950 font-black text-sm transition"
          >
            Chọn số: {pickCount} ⭐
          </button>

          {showCountMenu && (
            <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 flex items-center gap-1.5 p-2 rounded-2xl bg-slate-950/95 border border-amber-400/50 shadow-2xl z-30">
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
                      ? 'bg-amber-400 text-slate-950 scale-110 shadow'
                      : 'bg-white/10 text-white hover:bg-amber-400/30'
                  }`}
                >
                  {num}
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          type="button"
          disabled={phase === 'SPINNING'}
          onClick={handleNewRound}
          className="px-5 py-2.5 rounded-full bg-white/15 hover:bg-white/25 disabled:opacity-40 text-amber-200 border border-amber-300/35 font-black text-sm transition"
          title="Khôi phục toàn bộ tên ngôi sao để bắt đầu vòng mới"
        >
          🔄 Vòng mới
        </button>
      </div>
    </div>
  );
};

export default LuckyStarGame;
