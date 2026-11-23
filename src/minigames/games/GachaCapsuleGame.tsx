import React, { useEffect, useRef, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { playDrumroll, playWheelTick, unlockGameAudio } from '../../utils/gameAudio';
import { cryptoRandomInt } from '../rosterStorage';
import { scalePaceMs, useMinigameStageSettings } from '../stageContext';
import type { MinigameProps } from '../types';

const BALL_COLORS = ['#f43f5e', '#3b82f6', '#fbbf24', '#10b981', '#a855f7', '#ec4899'];

export const GachaCapsuleGame: React.FC<MinigameProps> = ({ students, muted, onPickStudent }) => {
  const { paceMode } = useMinigameStageSettings();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [spinning, setSpinning] = useState(false);
  const speedMultRef = useRef(1);
  const tickIvRef = useRef<number | null>(null);
  const doneTidRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (tickIvRef.current) window.clearInterval(tickIvRef.current);
      if (doneTidRef.current) window.clearTimeout(doneTidRef.current);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const size = 340;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const cx = size / 2;
    const cy = size / 2;
    const domeR = 142;

    const balls = Array.from({ length: Math.min(20, Math.max(8, students.length)) }, (_, i) => ({
      x: cx + (Math.random() - 0.5) * 140,
      y: cy + (Math.random() - 0.5) * 140,
      vx: (Math.random() - 0.5) * 2.4,
      vy: (Math.random() - 0.5) * 2.4,
      r: 18,
      color: BALL_COLORS[i % BALL_COLORS.length],
    }));

    let raf = 0;
    const loop = () => {
      ctx.clearRect(0, 0, size, size);

      // Glass dome
      ctx.beginPath();
      ctx.arc(cx, cy, domeR + 8, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(15,23,42,0.7)';
      ctx.fill();
      ctx.lineWidth = 6;
      ctx.strokeStyle = '#f472b6';
      ctx.stroke();

      for (const b of balls) {
        b.x += b.vx * speedMultRef.current;
        b.y += b.vy * speedMultRef.current;
        const dx = b.x - cx;
        const dy = b.y - cy;
        const dist = Math.hypot(dx, dy);
        if (dist + b.r > domeR) {
          const nx = dx / dist;
          const ny = dy / dist;
          const dot = b.vx * nx + b.vy * ny;
          b.vx -= 2 * dot * nx;
          b.vy -= 2 * dot * ny;
          b.x = cx + nx * (domeR - b.r);
          b.y = cy + ny * (domeR - b.r);
        }

        // Draw 2-tone Gacha capsule
        ctx.save();
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, Math.PI, true);
        ctx.fillStyle = b.color;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, Math.PI, false);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#0f172a';
        ctx.stroke();
        ctx.restore();
      }

      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [students.length]);

  const handleTurn = () => {
    if (spinning || students.length === 0) return;
    void unlockGameAudio();
    if (students.length === 1) {
      onPickStudent(students[0]);
      return;
    }
    const spinMs = scalePaceMs(6000, paceMode);
    setSpinning(true);
    speedMultRef.current = 4.2;
    if (!muted) playDrumroll(spinMs - 200);

    tickIvRef.current = window.setInterval(() => {
      if (!muted) playWheelTick();
    }, 180);

    doneTidRef.current = window.setTimeout(() => {
      if (tickIvRef.current) window.clearInterval(tickIvRef.current);
      speedMultRef.current = 1;
      setSpinning(false);
      const winner = students[cryptoRandomInt(students.length)];
      if (winner) onPickStudent(winner);
    }, spinMs);
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-5 p-4">
      <p className="text-sm font-bold opacity-85 text-center">
        Máy quay Bóng Gacha — Xoay lồng kính và mở quả cầu may mắn!
      </p>

      <canvas
        ref={canvasRef}
        onClick={handleTurn}
        className="w-[300px] h-[300px] sm:w-[340px] sm:h-[340px] cursor-pointer drop-shadow-2xl"
      />

      <button
        type="button"
        disabled={spinning || students.length === 0}
        onClick={handleTurn}
        className="px-10 py-4 rounded-2xl bg-gradient-to-r from-pink-500 to-rose-600 hover:from-pink-400 hover:to-rose-500 text-white font-black text-xl flex items-center gap-2 shadow-xl disabled:opacity-40"
      >
        <Sparkles className="w-6 h-6" />
        {spinning ? 'Đang xóc bóng...' : 'VẶN NÚT GACHA!'}
      </button>
    </div>
  );
};

export default GachaCapsuleGame;
