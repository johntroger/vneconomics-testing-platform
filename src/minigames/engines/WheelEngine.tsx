import React, { useEffect, useMemo, useRef, useState } from 'react';
import { RefreshCw, Sparkles } from 'lucide-react';
import { cryptoRandomInt, cryptoShuffle } from '../rosterStorage';
import type { RosterStudent } from '../types';
import { playWheelTick, unlockGameAudio } from '../../utils/gameAudio';

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
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const angleRef = useRef(0);
  const spinningRef = useRef(false);
  const [spinning, setSpinning] = useState(false);
  const [pointerKick, setPointerKick] = useState(false);
  const [sampleSeed, setSampleSeed] = useState(0);

  // Smart sampling when > 28 students so text stays readable on projector
  const wheelStudents = useMemo(() => {
    if (students.length <= 28) return students;
    return cryptoShuffle(students).slice(0, 28);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [students, sampleSeed]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const size = 440;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const cx = size / 2;
    const cy = size / 2;
    const radius = size / 2 - 14;
    const count = Math.max(1, wheelStudents.length);
    const sliceAngle = (Math.PI * 2) / count;

    ctx.clearRect(0, 0, size, size);

    // Outer rim glow
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius + 6, 0, Math.PI * 2);
    ctx.fillStyle = '#0f172a';
    ctx.fill();
    ctx.restore();

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
      ctx.strokeStyle = 'rgba(255,255,255,0.65)';
      ctx.stroke();

      // Label
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(start + sliceAngle / 2);
      ctx.textAlign = 'right';
      ctx.fillStyle = '#ffffff';
      const fontSize = count > 20 ? 11 : count > 12 ? 13 : 16;
      ctx.font = `800 ${fontSize}px system-ui, -apple-system, sans-serif`;
      const rawName = wheelStudents[i].name;
      const label = rawName.length > 18 ? `${rawName.slice(0, 16)}…` : rawName;
      ctx.shadowColor = 'rgba(0,0,0,0.45)';
      ctx.shadowBlur = 3;
      ctx.fillText(label, radius - 16, fontSize / 3);
      ctx.restore();
    }

    // Center cap
    ctx.beginPath();
    ctx.arc(cx, cy, 30, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#0f172a';
    ctx.stroke();
  }, [wheelStudents, palette, spinning]);

  const drawFrame = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const size = 440;
    const cx = size / 2;
    const cy = size / 2;
    const radius = size / 2 - 14;
    const count = wheelStudents.length;
    if (count === 0) return;
    const sliceAngle = (Math.PI * 2) / count;
    const angle = angleRef.current;

    ctx.clearRect(0, 0, size, size);
    ctx.beginPath();
    ctx.arc(cx, cy, radius + 6, 0, Math.PI * 2);
    ctx.fillStyle = '#0f172a';
    ctx.fill();

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
      ctx.strokeStyle = 'rgba(255,255,255,0.65)';
      ctx.stroke();

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(start + sliceAngle / 2);
      ctx.textAlign = 'right';
      ctx.fillStyle = '#ffffff';
      const fontSize = count > 20 ? 11 : count > 12 ? 13 : 16;
      ctx.font = `800 ${fontSize}px system-ui, -apple-system, sans-serif`;
      const rawName = wheelStudents[i].name;
      const label = rawName.length > 18 ? `${rawName.slice(0, 16)}…` : rawName;
      ctx.shadowColor = 'rgba(0,0,0,0.45)';
      ctx.shadowBlur = 3;
      ctx.fillText(label, radius - 16, fontSize / 3);
      ctx.restore();
    }

    ctx.beginPath();
    ctx.arc(cx, cy, 30, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#0f172a';
    ctx.stroke();
  };

  const handleSpin = () => {
    if (spinningRef.current || wheelStudents.length === 0) return;
    void unlockGameAudio();

    if (wheelStudents.length === 1) {
      onPickStudent(wheelStudents[0]);
      return;
    }

    spinningRef.current = true;
    setSpinning(true);

    const count = wheelStudents.length;
    const sliceAngle = (Math.PI * 2) / count;
    const startAngle = angleRef.current;
    // Extra 6 to 9 full rotations + random offset
    const extraSpins = (6 + cryptoRandomInt(4)) * Math.PI * 2;
    const randomOffset = (cryptoRandomInt(3600) / 3600) * Math.PI * 2;
    const targetAngle = startAngle + extraSpins + randomOffset;
    const duration = 4600;
    const startTime = performance.now();
    let lastSliceIdx = -1;

    const animate = (now: number) => {
      const elapsed = now - startTime;
      const t = Math.min(1, elapsed / duration);
      // Cubic ease-out for natural inertia
      const ease = 1 - Math.pow(1 - t, 3.2);
      const current = startAngle + (targetAngle - startAngle) * ease;
      angleRef.current = current;
      drawFrame();

      // Pointer is at top (-Math.PI / 2)
      const normalized = (((-Math.PI / 2 - current) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      const sliceIdx = Math.floor(normalized / sliceAngle) % count;
      if (sliceIdx !== lastSliceIdx) {
        lastSliceIdx = sliceIdx;
        if (!muted) playWheelTick();
        setPointerKick(true);
        window.setTimeout(() => setPointerKick(false), 60);
      }

      if (t < 1) {
        requestAnimationFrame(animate);
      } else {
        spinningRef.current = false;
        setSpinning(false);
        const winner = wheelStudents[sliceIdx];
        if (winner) onPickStudent(winner);
      }
    };

    requestAnimationFrame(animate);
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-5 p-4">
      <div className="text-center">
        <p className="text-sm font-bold opacity-80">{title}</p>
        {students.length > 28 && (
          <button
            type="button"
            disabled={spinning}
            onClick={() => setSampleSeed((s) => s + 1)}
            className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full bg-white/15 hover:bg-white/25 disabled:opacity-40"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Đổi nhóm 28 người trên vòng quay ({students.length} chưa gọi)
          </button>
        )}
      </div>

      <div className="relative flex items-center justify-center">
        {/* Top Pointer */}
        <div
          className={`absolute -top-4 left-1/2 -translate-x-1/2 z-20 transition-transform duration-75 ${
            pointerKick ? '-rotate-12 scale-110' : 'rotate-0'
          }`}
        >
          <div className="w-0 h-0 border-l-[16px] border-l-transparent border-r-[16px] border-r-transparent border-t-[30px] border-t-amber-400 drop-shadow-lg" />
        </div>

        <canvas
          ref={canvasRef}
          onClick={handleSpin}
          className="w-[320px] h-[320px] sm:w-[440px] sm:h-[440px] cursor-pointer drop-shadow-2xl"
        />

        <button
          type="button"
          onClick={handleSpin}
          disabled={spinning || wheelStudents.length === 0}
          className="absolute w-14 h-14 rounded-full bg-white text-slate-900 font-black text-2xl flex items-center justify-center shadow-lg hover:scale-105 active:scale-95 transition disabled:opacity-50"
          title="Quay ngay"
        >
          {centerEmoji}
        </button>
      </div>

      <button
        type="button"
        disabled={spinning || wheelStudents.length === 0}
        onClick={handleSpin}
        className="px-10 py-4 rounded-2xl bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-300 hover:to-orange-400 text-slate-950 font-black text-xl shadow-xl shadow-amber-500/25 flex items-center gap-2.5 transition active:scale-95 disabled:opacity-40"
      >
        <Sparkles className="w-6 h-6" />
        {spinning ? 'Đang quay...' : 'QUAY NGAY!'}
      </button>
    </div>
  );
};
