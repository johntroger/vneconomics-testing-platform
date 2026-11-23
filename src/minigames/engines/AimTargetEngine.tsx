import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Crosshair, RefreshCw } from 'lucide-react';
import { cryptoShuffle } from '../rosterStorage';
import { useMinigameStageSettings } from '../stageContext';
import type { RosterStudent } from '../types';
import { playBalloonPop, playWheelTick, unlockGameAudio } from '../../utils/gameAudio';

interface AimTargetEngineProps {
  students: RosterStudent[];
  muted: boolean;
  title: string;
  projectileEmoji: string;
  actionLabel: string;
  palette?: string[];
  onPickStudent: (student: RosterStudent) => void;
}

const TARGET_PALETTE = ['#e11d48', '#0f172a', '#d97706', '#059669', '#2563eb', '#7c3aed'];

export const AimTargetEngine: React.FC<AimTargetEngineProps> = ({
  students,
  muted,
  title,
  projectileEmoji,
  actionLabel,
  palette = TARGET_PALETTE,
  onPickStudent,
}) => {
  const { paceMode } = useMinigameStageSettings();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const angleRef = useRef(0);
  const speedRef = useRef(0.032);
  const firingRef = useRef(false);
  const decelRafRef = useRef<number>(0);
  const finishTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (decelRafRef.current) cancelAnimationFrame(decelRafRef.current);
      if (finishTimeoutRef.current) window.clearTimeout(finishTimeoutRef.current);
    };
  }, []);
  const [firing, setFiring] = useState(false);
  const [arrowFlying, setArrowFlying] = useState(false);
  const [sampleSeed, setSampleSeed] = useState(0);
  const [aimName, setAimName] = useState('');

  const boardStudents = useMemo(() => {
    if (students.length <= 24) return students;
    return cryptoShuffle(students).slice(0, 24);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [students, sampleSeed]);

  useEffect(() => {
    let raf = 0;
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
    const radius = size / 2 - 18;
    const count = Math.max(1, boardStudents.length);
    const slice = (Math.PI * 2) / count;
    let lastIdx = -1;

    const loop = () => {
      angleRef.current += speedRef.current;
      const angle = angleRef.current;

      ctx.clearRect(0, 0, size, size);
      ctx.beginPath();
      ctx.arc(cx, cy, radius + 8, 0, Math.PI * 2);
      ctx.fillStyle = '#0f172a';
      ctx.fill();

      if (boardStudents.length > 0) {
        for (let i = 0; i < count; i++) {
          const start = angle + i * slice;
          const end = start + slice;
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.arc(cx, cy, radius, start, end);
          ctx.closePath();
          ctx.fillStyle = palette[i % palette.length];
          ctx.fill();
          ctx.lineWidth = 2;
          ctx.strokeStyle = 'rgba(255,255,255,0.6)';
          ctx.stroke();

          ctx.save();
          ctx.translate(cx, cy);
          ctx.rotate(start + slice / 2);
          ctx.textAlign = 'right';
          ctx.fillStyle = '#fff';
          const fs = count > 16 ? 12 : 14;
          ctx.font = `800 ${fs}px system-ui, sans-serif`;
          const raw = boardStudents[i].name;
          const lbl = raw.length > 16 ? `${raw.slice(0, 14)}…` : raw;
          ctx.fillText(lbl, radius - 14, fs / 3);
          ctx.restore();
        }

        // Concentric target rings
        [0.65, 0.35].forEach((rPct) => {
          ctx.beginPath();
          ctx.arc(cx, cy, radius * rPct, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(255,255,255,0.22)';
          ctx.lineWidth = 2;
          ctx.stroke();
        });
        ctx.beginPath();
        ctx.arc(cx, cy, 22, 0, Math.PI * 2);
        ctx.fillStyle = '#fbbf24';
        ctx.fill();

        const norm = (((-Math.PI / 2 - angle) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
        const idx = Math.floor(norm / slice) % count;
        if (idx !== lastIdx) {
          lastIdx = idx;
          setAimName(boardStudents[idx]?.name ?? '');
        }
      }

      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [boardStudents, palette]);

  const handleFire = () => {
    if (firingRef.current || boardStudents.length === 0) return;
    void unlockGameAudio();
    firingRef.current = true;
    setFiring(true);
    setArrowFlying(true);

    // Decelerate target smoothly after firing based on paceMode
    const origSpeed = speedRef.current;
    const start = performance.now();
    const slowMs = paceMode === 'EPIC' ? 8500 : paceMode === 'NORMAL' ? 5200 : 2800;
    const decel = () => {
      const t = Math.min(1, (performance.now() - start) / slowMs);
      speedRef.current = origSpeed * Math.pow(1 - t, 1.85);
      if (t < 1) {
        decelRafRef.current = requestAnimationFrame(decel);
      } else {
        speedRef.current = 0;
        if (!muted) playBalloonPop();
        const count = boardStudents.length;
        const slice = (Math.PI * 2) / count;
        const norm =
          (((-Math.PI / 2 - angleRef.current) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
        const idx = Math.floor(norm / slice) % count;
        const winner = boardStudents[idx];
        finishTimeoutRef.current = window.setTimeout(() => {
          firingRef.current = false;
          setFiring(false);
          setArrowFlying(false);
          speedRef.current = 0.032;
          if (winner) onPickStudent(winner);
        }, 450);
      }
    };
    if (!muted) playWheelTick();
    decelRafRef.current = requestAnimationFrame(decel);
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-4 p-4">
      <div className="text-center space-y-1.5">
        <p className="text-sm font-bold opacity-85">{title}</p>
        {students.length > 24 && (
          <button
            type="button"
            disabled={firing}
            onClick={() => setSampleSeed((s) => s + 1)}
            className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full bg-white/15 hover:bg-white/25 disabled:opacity-40"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Đổi nhóm 24 người trên bia
          </button>
        )}
      </div>

      <div className="px-5 py-2 rounded-2xl bg-amber-400/20 border border-amber-300/50 text-amber-200 font-black text-base min-w-[220px] text-center">
        🎯 Đang nhắm: {aimName || '—'}
      </div>

      <div className="relative flex items-center justify-center">
        <div
          className={`absolute left-1/2 -translate-x-1/2 z-20 text-4xl transition-all duration-300 ${
            arrowFlying ? 'top-8 scale-125' : '-top-8'
          }`}
        >
          {projectileEmoji}
        </div>
        <canvas
          ref={canvasRef}
          onClick={handleFire}
          className="w-[320px] h-[320px] sm:w-[440px] sm:h-[440px] cursor-crosshair drop-shadow-2xl"
        />
      </div>

      <button
        type="button"
        disabled={firing || boardStudents.length === 0}
        onClick={handleFire}
        className="px-10 py-4 rounded-2xl bg-gradient-to-r from-rose-500 to-amber-500 hover:from-rose-400 hover:to-amber-400 text-white font-black text-xl shadow-xl flex items-center gap-2.5 transition active:scale-95 disabled:opacity-40"
      >
        <Crosshair className="w-6 h-6" />
        {firing ? 'Đang phóng...' : actionLabel}
      </button>
    </div>
  );
};
