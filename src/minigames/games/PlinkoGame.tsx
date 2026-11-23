import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Play, RefreshCw } from 'lucide-react';
import { playWheelTick, unlockGameAudio } from '../../utils/gameAudio';
import { cryptoRandomInt, cryptoShuffle } from '../rosterStorage';
import type { MinigameProps } from '../types';

export const PlinkoGame: React.FC<MinigameProps> = ({ students, muted, onPickStudent }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [dropping, setDropping] = useState(false);
  const [sampleSeed, setSampleSeed] = useState(0);
  const droppingRef = useRef(false);

  const slots = useMemo(() => {
    if (students.length <= 10) return students;
    return cryptoShuffle(students).slice(0, 10);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [students, sampleSeed]);

  const drawBoard = (ball?: { x: number; y: number }) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = 640;
    const h = 420;
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== w * dpr) {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    // Draw Pegs
    const rows = 7;
    const startY = 65;
    const rowGap = 42;
    for (let r = 0; r < rows; r++) {
      const cols = r + 3;
      const spacing = 54;
      const offsetX = w / 2 - ((cols - 1) * spacing) / 2;
      for (let c = 0; c < cols; c++) {
        ctx.beginPath();
        ctx.arc(offsetX + c * spacing, startY + r * rowGap, 5, 0, Math.PI * 2);
        ctx.fillStyle = '#e2e8f0';
        ctx.shadowColor = '#38bdf8';
        ctx.shadowBlur = 6;
        ctx.fill();
      }
    }
    ctx.shadowBlur = 0;

    // Draw Slots at bottom
    const count = Math.max(1, slots.length);
    const slotW = (w - 40) / count;
    const colors = ['#f43f5e', '#3b82f6', '#f59e0b', '#10b981', '#8b5cf6'];
    for (let i = 0; i < count; i++) {
      const sx = 20 + i * slotW;
      ctx.fillStyle = colors[i % colors.length];
      ctx.fillRect(sx + 2, h - 54, slotW - 4, 46);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      const label = slots[i]?.name ?? '';
      const short = label.length > 9 ? `${label.slice(0, 8)}…` : label;
      ctx.fillText(short, sx + slotW / 2, h - 27);
    }

    if (ball) {
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, 11, 0, Math.PI * 2);
      ctx.fillStyle = '#fbbf24';
      ctx.shadowColor = '#f59e0b';
      ctx.shadowBlur = 14;
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  };

  useEffect(() => {
    drawBoard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slots]);

  const handleDrop = () => {
    if (droppingRef.current || slots.length === 0) return;
    void unlockGameAudio();
    if (slots.length === 1) {
      onPickStudent(slots[0]);
      return;
    }
    droppingRef.current = true;
    setDropping(true);

    const w = 640;
    const h = 420;
    const targetIdx = cryptoRandomInt(slots.length);
    const slotW = (w - 40) / slots.length;
    const targetX = 20 + targetIdx * slotW + slotW / 2;

    const waypoints: Array<{ x: number; y: number }> = [{ x: w / 2 + (Math.random() - 0.5) * 20, y: 20 }];
    for (let r = 0; r < 7; r++) {
      const t = (r + 1) / 8;
      const jitter = (Math.random() - 0.5) * 55 * (1 - t);
      const wx = w / 2 + (targetX - w / 2) * t + jitter;
      waypoints.push({ x: Math.max(36, Math.min(w - 36, wx)), y: 65 + r * 42 });
    }
    waypoints.push({ x: targetX, y: h - 38 });

    let seg = 0;
    let prog = 0;
    const step = () => {
      prog += 0.085;
      if (prog >= 1) {
        prog = 0;
        seg++;
        if (!muted) playWheelTick();
      }
      if (seg >= waypoints.length - 1) {
        drawBoard({ x: targetX, y: h - 38 });
        droppingRef.current = false;
        setDropping(false);
        onPickStudent(slots[targetIdx]);
        return;
      }
      const p0 = waypoints[seg];
      const p1 = waypoints[seg + 1];
      const x = p0.x + (p1.x - p0.x) * prog;
      const bounceY = Math.sin(prog * Math.PI) * -10;
      const y = p0.y + (p1.y - p0.y) * prog + bounceY;
      drawBoard({ x, y });
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-4 p-4">
      <div className="text-center space-y-1.5">
        <p className="text-sm font-bold opacity-85">
          Bảng Đinh Plinko — Thả bóng nảy zíc-zắc rơi vào ô tên sinh viên!
        </p>
        {students.length > 10 && (
          <button
            type="button"
            disabled={dropping}
            onClick={() => setSampleSeed((s) => s + 1)}
            className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full bg-white/15 hover:bg-white/25 disabled:opacity-40"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Đổi 10 người ở đáy bảng ({students.length} chưa gọi)
          </button>
        )}
      </div>

      <canvas
        ref={canvasRef}
        onClick={handleDrop}
        className="w-full max-w-[640px] aspect-[640/420] rounded-3xl bg-slate-900/90 border-2 border-cyan-400/40 shadow-2xl cursor-pointer"
      />

      <button
        type="button"
        disabled={dropping || slots.length === 0}
        onClick={handleDrop}
        className="px-10 py-3.5 rounded-2xl bg-gradient-to-r from-cyan-400 to-emerald-500 hover:from-cyan-300 hover:to-emerald-400 text-slate-950 font-black text-lg flex items-center gap-2 shadow-xl disabled:opacity-40"
      >
        <Play className="w-5 h-5 fill-current" />
        {dropping ? 'Bóng đang rơi...' : 'THẢ BÓNG NGAY!'}
      </button>
    </div>
  );
};

export default PlinkoGame;
