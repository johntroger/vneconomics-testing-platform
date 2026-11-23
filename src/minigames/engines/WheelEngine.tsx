import React, { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { RefreshCw, Sparkles } from 'lucide-react';
import { cryptoRandomInt, cryptoShuffle } from '../rosterStorage';
import { PACE_META, useMinigameStageSettings } from '../stageContext';
import type { RosterStudent } from '../types';
import { playWheelTick, unlockGameAudio } from '../../utils/gameAudio';

const WheelEngine3D = lazy(() =>
  import('./WheelEngine3D').then((m) => ({ default: m.WheelEngine3D })),
);

const WHEEL_PALETTE = [
  '#f43f5e',
  '#3b82f6',
  '#f59e0b',
  '#10b981',
  '#8b5cf6',
  '#ec4899',
  '#06b6d4',
  '#84cc16',
];

interface WheelEngineProps {
  students: RosterStudent[];
  muted: boolean;
  title?: string;
  palette?: string[];
  centerEmoji?: string;
  onPickStudent: (student: RosterStudent) => void;
}

export const WheelEngine: React.FC<WheelEngineProps> = ({
  students,
  muted,
  title = 'Bấm QUAY để chọn ngẫu nhiên',
  palette = WHEEL_PALETTE,
  centerEmoji = '🎯',
  onPickStudent,
}) => {
  const { paceMode, render3D } = useMinigameStageSettings();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const angleRef = useRef(0);
  const spinningRef = useRef(false);
  const tickStepRef = useRef(0);
  const raf2DRef = useRef<number>(0);

  useEffect(() => {
    return () => {
      if (raf2DRef.current) cancelAnimationFrame(raf2DRef.current);
    };
  }, []);
  const [spinning, setSpinning] = useState(false);
  const [spinTrigger, setSpinTrigger] = useState(0);
  const [spinProgress, setSpinProgress] = useState(0);
  const [webglFailed, setWebglFailed] = useState(false);
  const [pointerKick, setPointerKick] = useState(false);
  const [currentPointerName, setCurrentPointerName] = useState('');
  const [sampleSeed, setSampleSeed] = useState(0);

  const use3D = render3D && !webglFailed;

  const wheelStudents = useMemo(() => {
    if (students.length <= 28) return students;
    return cryptoShuffle(students).slice(0, 28);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [students, sampleSeed]);

  const drawWheel = (ledPhase = 0) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const size = 480;
    if (canvas.width !== size * dpr) {
      canvas.width = size * dpr;
      canvas.height = size * dpr;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const cx = size / 2;
    const cy = size / 2;
    const radius = size / 2 - 22;
    const count = Math.max(1, wheelStudents.length);
    const sliceAngle = (Math.PI * 2) / count;

    ctx.clearRect(0, 0, size, size);

    // Outer metallic rim + shadow
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius + 16, 0, Math.PI * 2);
    const rimGrad = ctx.createRadialGradient(cx, cy, radius, cx, cy, radius + 16);
    rimGrad.addColorStop(0, '#1e293b');
    rimGrad.addColorStop(0.7, '#0f172a');
    rimGrad.addColorStop(1, '#334155');
    ctx.fillStyle = rimGrad;
    ctx.fill();
    ctx.restore();

    // 24 Chasing LED bulbs around outer rim
    const bulbCount = 24;
    for (let b = 0; b < bulbCount; b++) {
      const ba = (b / bulbCount) * Math.PI * 2;
      const bx = cx + Math.cos(ba) * (radius + 9);
      const by = cy + Math.sin(ba) * (radius + 9);
      const lit = (b + ledPhase) % 2 === 0;
      ctx.beginPath();
      ctx.arc(bx, by, lit ? 4.2 : 3, 0, Math.PI * 2);
      ctx.fillStyle = lit ? '#fde047' : '#64748b';
      if (lit) {
        ctx.shadowColor = '#facc15';
        ctx.shadowBlur = 10;
      } else {
        ctx.shadowBlur = 0;
      }
      ctx.fill();
    }
    ctx.shadowBlur = 0;

    if (wheelStudents.length === 0) {
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fillStyle = '#334155';
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 18px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Chưa có sinh viên khả dụng', cx, cy);
      return;
    }

    const angle = angleRef.current;
    for (let i = 0; i < count; i++) {
      const start = angle + i * sliceAngle;
      const end = start + sliceAngle;

      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, radius, start, end);
      ctx.closePath();
      ctx.fillStyle = palette[i % palette.length];
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(255,255,255,0.75)';
      ctx.stroke();

      // Label
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(start + sliceAngle / 2);
      ctx.textAlign = 'right';
      ctx.fillStyle = '#ffffff';
      const fontSize = count > 20 ? 11.5 : count > 12 ? 14 : 17;
      ctx.font = `800 ${fontSize}px system-ui, -apple-system, sans-serif`;
      const rawName = wheelStudents[i].name;
      const label = rawName.length > 18 ? `${rawName.slice(0, 16)}…` : rawName;
      ctx.shadowColor = 'rgba(0,0,0,0.55)';
      ctx.shadowBlur = 4;
      ctx.fillText(label, radius - 16, fontSize / 3);
      ctx.restore();
    }

    // 3D Glossy Radial Highlight Overlay
    const gloss = ctx.createRadialGradient(cx - 45, cy - 45, 20, cx, cy, radius);
    gloss.addColorStop(0, 'rgba(255,255,255,0.22)');
    gloss.addColorStop(0.55, 'rgba(255,255,255,0.03)');
    gloss.addColorStop(1, 'rgba(0,0,0,0.22)');
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = gloss;
    ctx.fill();

    // Center hub
    ctx.beginPath();
    ctx.arc(cx, cy, 34, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#0f172a';
    ctx.stroke();
  };

  useEffect(() => {
    if (!use3D) drawWheel(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wheelStudents, palette, use3D]);

  const handleSpin = () => {
    if (spinningRef.current || spinning || wheelStudents.length === 0) return;
    void unlockGameAudio();

    if (wheelStudents.length === 1) {
      onPickStudent(wheelStudents[0]);
      return;
    }

    if (use3D) {
      setSpinTrigger((c) => c + 1);
      return;
    }

    spinningRef.current = true;
    setSpinning(true);
    setSpinProgress(0);

    const count = wheelStudents.length;
    const sliceAngle = (Math.PI * 2) / count;
    const startAngle = angleRef.current;
    const extraLoops = paceMode === 'EPIC' ? 9 + cryptoRandomInt(3) : paceMode === 'NORMAL' ? 6 + cryptoRandomInt(3) : 4 + cryptoRandomInt(2);
    const extraSpins = extraLoops * Math.PI * 2;
    const randomOffset = (cryptoRandomInt(3600) / 3600) * Math.PI * 2;
    const targetAngle = startAngle + extraSpins + randomOffset;
    const duration = PACE_META[paceMode].wheelMs;
    const startTime = performance.now();
    let lastSliceIdx = -1;

    const animate = (now: number) => {
      const elapsed = now - startTime;
      const t = Math.min(1, elapsed / duration);
      const ease = 1 - Math.pow(1 - t, 3.4);
      const current = startAngle + (targetAngle - startAngle) * ease;
      angleRef.current = current;
      setSpinProgress(t);

      const normalized = (((-Math.PI / 2 - current) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      const sliceIdx = Math.floor(normalized / sliceAngle) % count;

      if (sliceIdx !== lastSliceIdx) {
        lastSliceIdx = sliceIdx;
        tickStepRef.current += 1;
        setCurrentPointerName(wheelStudents[sliceIdx]?.name ?? '');
        if (!muted) playWheelTick();
        setPointerKick(true);
        window.setTimeout(() => setPointerKick(false), 65);
      }

      drawWheel(tickStepRef.current);

      if (t < 1) {
        raf2DRef.current = requestAnimationFrame(animate);
      } else {
        spinningRef.current = false;
        setSpinning(false);
        const winner = wheelStudents[sliceIdx];
        if (winner) onPickStudent(winner);
      }
    };

    raf2DRef.current = requestAnimationFrame(animate);
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-4 p-4">
      <div className="text-center space-y-2">
        <p className="text-sm font-bold opacity-80">{title}</p>
        {students.length > 28 && (
          <button
            type="button"
            disabled={spinning}
            onClick={() => setSampleSeed((s) => s + 1)}
            className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full bg-white/15 hover:bg-white/25 disabled:opacity-40"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Đổi nhóm 28 người trên vòng quay ({students.length} chưa gọi)
          </button>
        )}
      </div>

      {/* Live Pointer Ticker Banner */}
      <div
        className={`h-11 px-6 rounded-2xl border flex items-center justify-center min-w-[260px] transition-all ${
          spinning
            ? spinProgress > 0.65
              ? 'bg-rose-500/25 border-rose-400/70 text-rose-100 scale-110 shadow-xl shadow-rose-500/30 animate-pulse'
              : 'bg-amber-400/20 border-amber-300/60 text-amber-200 scale-105 shadow-lg shadow-amber-500/20'
            : 'bg-white/10 border-white/15 text-white/70'
        }`}
      >
        <span className="font-black text-base tracking-wide truncate max-w-xs">
          {currentPointerName
            ? `${spinProgress > 0.65 && spinning ? '🔥 SẮP DỪNG: ' : '▼ '}${currentPointerName}`
            : 'Sẵn sàng quay'}
        </span>
      </div>

      {use3D ? (
        <div className="w-full max-w-4xl relative rounded-3xl overflow-hidden border border-white/15 bg-slate-950/50 shadow-[0_24px_80px_rgba(0,0,0,0.65)]">
          <Suspense
            fallback={
              <div className="h-[380px] sm:h-[480px] lg:h-[520px] flex items-center justify-center font-bold opacity-75">
                Đang dựng sân khấu 3D...
              </div>
            }
          >
            <WheelEngine3D
              students={wheelStudents}
              palette={palette}
              centerEmoji={centerEmoji}
              muted={muted}
              paceMode={paceMode}
              spinTrigger={spinTrigger}
              onSpinStateChange={(s) => {
                spinningRef.current = s;
                setSpinning(s);
              }}
              onPointerNameChange={setCurrentPointerName}
              onProgressChange={setSpinProgress}
              onPickStudent={onPickStudent}
              onWebGLError={() => setWebglFailed(true)}
            />
          </Suspense>
          {spinning && (
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 w-56 h-1.5 rounded-full bg-white/15 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-cyan-400 via-amber-400 to-rose-500 transition-all duration-75"
                style={{ width: `${Math.round(spinProgress * 100)}%` }}
              />
            </div>
          )}
        </div>
      ) : (
        <div className="relative flex items-center justify-center">
          {/* Top Pointer */}
          <div
            className={`absolute -top-4 left-1/2 -translate-x-1/2 z-20 transition-transform duration-75 ${
              pointerKick ? '-rotate-12 scale-115' : 'rotate-0'
            }`}
          >
            <div className="w-0 h-0 border-l-[18px] border-l-transparent border-r-[18px] border-r-transparent border-t-[34px] border-t-amber-400 drop-shadow-[0_4px_10px_rgba(251,191,36,0.6)]" />
          </div>

          <canvas
            ref={canvasRef}
            onClick={handleSpin}
            className="w-[330px] h-[330px] sm:w-[480px] sm:h-[480px] cursor-pointer drop-shadow-[0_20px_50px_rgba(0,0,0,0.6)]"
          />

          <button
            type="button"
            onClick={handleSpin}
            disabled={spinning || wheelStudents.length === 0}
            className="absolute w-16 h-16 rounded-full bg-white text-slate-900 font-black text-3xl flex items-center justify-center shadow-xl hover:scale-105 active:scale-95 transition disabled:opacity-50"
            title="Quay ngay"
          >
            {centerEmoji}
          </button>
        </div>
      )}

      <button
        type="button"
        disabled={spinning || wheelStudents.length === 0}
        onClick={handleSpin}
        className="px-10 py-4 rounded-2xl bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-300 hover:to-orange-400 text-slate-950 font-black text-xl shadow-xl shadow-amber-500/30 flex items-center gap-2.5 transition active:scale-95 disabled:opacity-40"
      >
        <Sparkles className="w-6 h-6" />
        {spinning
          ? `Đang quay (${PACE_META[paceMode].badge})...`
          : `QUAY NGAY (${PACE_META[paceMode].shortLabel})!`}
      </button>
    </div>
  );
};
