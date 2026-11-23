import React, { useEffect, useRef, useState } from 'react';
import { Flashlight } from 'lucide-react';
import { playWheelTick, unlockGameAudio } from '../../utils/gameAudio';
import { cryptoRandomInt } from '../rosterStorage';
import { scalePaceMs, useMinigameStageSettings } from '../stageContext';
import type { MinigameProps } from '../types';

export const SpotlightSweepGame: React.FC<MinigameProps> = ({ students, muted, onPickStudent }) => {
  const { paceMode } = useMinigameStageSettings();
  const [litId, setLitId] = useState<string | null>(null);
  const [sweeping, setSweeping] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, []);

  const startSweep = () => {
    if (sweeping || students.length === 0) return;
    void unlockGameAudio();
    if (students.length === 1) {
      onPickStudent(students[0]);
      return;
    }

    setSweeping(true);
    const winner = students[cryptoRandomInt(students.length)];
    const totalHops = paceMode === 'EPIC' ? 44 : paceMode === 'NORMAL' ? 34 : 22;
    let hop = 0;

    const next = () => {
      hop++;
      if (hop >= totalHops) {
        setLitId(winner.id);
        setSweeping(false);
        onPickStudent(winner);
        return;
      }
      setLitId(students[cryptoRandomInt(students.length)].id);
      if (!muted) playWheelTick();
      const baseDelay = 110 + Math.pow(hop / totalHops, 2.3) * 540;
      const delay = scalePaceMs(baseDelay, paceMode);
      timerRef.current = window.setTimeout(next, delay);
    };

    next();
  };

  return (
    <div className="flex-1 flex flex-col gap-4 p-4 max-w-6xl w-full mx-auto">
      <div className="bg-white/10 backdrop-blur-md border border-white/15 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-black text-base sm:text-lg flex items-center gap-2">
            🔦 Đèn Sân khấu Quét tên ({students.length} sinh viên)
          </h2>
          <p className="text-xs opacity-75">
            Chùm đèn rọi nhảy qua các thẻ tên trên sân khấu tối và khóa sáng 1 người!
          </p>
        </div>
        <button
          type="button"
          disabled={sweeping || students.length === 0}
          onClick={startSweep}
          className="px-7 py-3 rounded-xl bg-gradient-to-r from-amber-400 to-yellow-500 hover:from-amber-300 hover:to-yellow-400 text-slate-950 font-black text-sm flex items-center gap-2 shadow-lg disabled:opacity-40"
        >
          <Flashlight className="w-4 h-4" />
          {sweeping ? 'Đèn đang rọi...' : 'BẬT ĐÈN SÂN KHẤU!'}
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2.5 flex-1 content-start bg-slate-950/80 border border-white/10 rounded-3xl p-4">
        {students.map((s) => {
          const lit = litId === s.id;
          return (
            <div
              key={s.id}
              className={`px-3 py-3.5 rounded-2xl border font-bold text-xs text-center transition-all duration-100 ${
                lit
                  ? 'bg-amber-300 text-slate-950 border-white ring-4 ring-amber-400 scale-105 shadow-[0_0_35px_rgba(251,191,36,0.9)]'
                  : 'bg-slate-900/80 border-white/10 text-white/35'
              }`}
            >
              {s.name}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default SpotlightSweepGame;
