import React, { useEffect, useRef, useState } from 'react';
import { Eraser, RefreshCw } from 'lucide-react';
import { playWheelTick, unlockGameAudio } from '../../utils/gameAudio';
import { cryptoRandomInt } from '../rosterStorage';
import type { MinigameProps, RosterStudent } from '../types';

export const ScratchCardGame: React.FC<MinigameProps> = ({ students, muted, onPickStudent }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [target, setTarget] = useState<RosterStudent | null>(null);
  const [revealed, setRevealed] = useState(false);
  const drawingRef = useRef(false);
  const scratchCountRef = useRef(0);

  const pickNewTarget = () => {
    if (students.length === 0) {
      setTarget(null);
      return;
    }
    setRevealed(false);
    scratchCountRef.current = 0;
    setTarget(students[cryptoRandomInt(students.length)]);
  };

  useEffect(() => {
    pickNewTarget();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [students.length]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !target) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = 460;
    canvas.height = 240;
    ctx.globalCompositeOperation = 'source-over';
    const grad = ctx.createLinearGradient(0, 0, 460, 240);
    grad.addColorStop(0, '#94a3b8');
    grad.addColorStop(0.5, '#cbd5e1');
    grad.addColorStop(1, '#64748b');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 460, 240);

    ctx.fillStyle = '#1e293b';
    ctx.font = '900 22px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('🪙 RÊ CHUỘT / TAY ĐỂ CÀO THẺ', 230, 125);
  }, [target]);

  const scratchAt = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas || revealed) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * canvas.width;
    const y = ((clientY - rect.top) / rect.height) * canvas.height;

    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.arc(x, y, 28, 0, Math.PI * 2);
    ctx.fill();

    scratchCountRef.current += 1;
    if (scratchCountRef.current % 6 === 0 && !muted) playWheelTick();

    if (scratchCountRef.current >= 42 && !revealed && target) {
      setRevealed(true);
      onPickStudent(target);
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-5 p-4">
      <p className="text-sm font-bold opacity-85 text-center">
        Thẻ cào Bạc — Cào trực tiếp trên màn hình để dần hé lộ tên sinh viên!
      </p>

      {!target ? (
        <div className="font-bold opacity-75">Chưa có sinh viên khả dụng.</div>
      ) : (
        <div className="relative w-full max-w-[460px] h-[240px] rounded-3xl overflow-hidden border-4 border-amber-400 shadow-2xl bg-gradient-to-br from-indigo-900 to-slate-900 flex flex-col items-center justify-center p-6 select-none">
          <div className="text-xs font-bold uppercase tracking-widest text-amber-300">
            Người được chọn
          </div>
          <div className="text-3xl sm:text-4xl font-black text-white text-center mt-2">
            {target.name}
          </div>
          {target.studentCode && (
            <div className="text-sm font-mono text-indigo-300 mt-1">{target.studentCode}</div>
          )}

          {!revealed && (
            <canvas
              ref={canvasRef}
              onPointerDown={(e) => {
                void unlockGameAudio();
                drawingRef.current = true;
                scratchAt(e.clientX, e.clientY);
              }}
              onPointerMove={(e) => {
                if (drawingRef.current) scratchAt(e.clientX, e.clientY);
              }}
              onPointerUp={() => {
                drawingRef.current = false;
              }}
              onPointerLeave={() => {
                drawingRef.current = false;
              }}
              className="absolute inset-0 w-full h-full cursor-crosshair touch-none"
            />
          )}
        </div>
      )}

      <div className="flex gap-3">
        {target && !revealed && (
          <button
            type="button"
            onClick={() => {
              void unlockGameAudio();
              setRevealed(true);
              onPickStudent(target);
            }}
            className="px-6 py-3 rounded-2xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-sm flex items-center gap-2"
          >
            <Eraser className="w-4 h-4" /> Mở nhanh toàn bộ thẻ
          </button>
        )}
        <button
          type="button"
          onClick={pickNewTarget}
          className="px-5 py-3 rounded-2xl bg-white/15 hover:bg-white/25 font-bold text-sm flex items-center gap-2"
        >
          <RefreshCw className="w-4 h-4" /> Đổi thẻ mới
        </button>
      </div>
    </div>
  );
};

export default ScratchCardGame;
