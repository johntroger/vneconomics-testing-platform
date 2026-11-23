import React, { useEffect, useRef, useState } from 'react';
import { Flame } from 'lucide-react';
import { playBalloonPop, playTickSound, unlockGameAudio } from '../../utils/gameAudio';
import { cryptoRandomInt } from '../rosterStorage';
import type { MinigameProps } from '../types';

export const BombPassGame: React.FC<MinigameProps> = ({ students, muted, onPickStudent }) => {
  const [holderId, setHolderId] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, []);

  const startBomb = () => {
    if (running || students.length === 0) return;
    void unlockGameAudio();
    if (students.length === 1) {
      onPickStudent(students[0]);
      return;
    }

    setRunning(true);
    const totalMs = 6500 + cryptoRandomInt(3500);
    const start = performance.now();
    let currentIdx = cryptoRandomInt(students.length);

    const hop = () => {
      const elapsed = performance.now() - start;
      const ratio = elapsed / totalMs;
      currentIdx = (currentIdx + 1 + cryptoRandomInt(Math.max(1, students.length - 1))) % students.length;
      const stu = students[currentIdx];
      setHolderId(stu.id);

      if (ratio >= 1) {
        if (!muted) playBalloonPop();
        setRunning(false);
        onPickStudent(stu);
        return;
      }

      if (!muted) playTickSound(ratio > 0.72);
      const delay = Math.max(95, 360 - ratio * 250);
      timerRef.current = window.setTimeout(hop, delay);
    };

    hop();
  };

  return (
    <div className="flex-1 flex flex-col gap-4 p-4 max-w-6xl w-full mx-auto">
      <div className="bg-white/10 backdrop-blur-md border border-white/15 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-black text-base sm:text-lg flex items-center gap-2">
            💣 Chuyền Bom Hẹn giờ
          </h2>
          <p className="text-xs opacity-75">
            Quả bom nhảy qua các tên nhanh dần — nổ trúng ai người đó lên bảng!
          </p>
        </div>
        <button
          type="button"
          disabled={running || students.length === 0}
          onClick={startBomb}
          className="px-7 py-3 rounded-xl bg-gradient-to-r from-red-500 to-orange-600 hover:from-red-400 hover:to-orange-500 text-white font-black text-sm flex items-center gap-2 shadow-lg disabled:opacity-40"
        >
          <Flame className="w-4 h-4" />
          {running ? 'Bom đang chạy...' : 'CHÂM NGÒI BOM!'}
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-2.5 flex-1 content-start">
        {students.map((s) => {
          const holding = holderId === s.id;
          return (
            <div
              key={s.id}
              className={`px-3 py-3.5 rounded-2xl border font-bold text-sm text-center transition-all duration-100 ${
                holding
                  ? 'bg-rose-600 border-amber-300 ring-4 ring-amber-400 scale-105 text-white shadow-xl'
                  : 'bg-white/10 border-white/15 text-white/80'
              }`}
            >
              {holding ? '💣 ' : ''}
              {s.name}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default BombPassGame;
