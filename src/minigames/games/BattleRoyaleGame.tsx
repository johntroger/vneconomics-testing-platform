import React, { useEffect, useRef, useState } from 'react';
import { Zap } from 'lucide-react';
import { playBalloonPop, playTickSound, unlockGameAudio } from '../../utils/gameAudio';
import { cryptoRandomInt } from '../rosterStorage';
import type { MinigameProps } from '../types';

export const BattleRoyaleGame: React.FC<MinigameProps> = ({ students, muted, onPickStudent }) => {
  const [eliminated, setEliminated] = useState<Record<string, boolean>>({});
  const [running, setRunning] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    setEliminated({});
    setRunning(false);
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [students]);

  const startBattle = () => {
    if (running || students.length === 0) return;
    void unlockGameAudio();
    if (students.length === 1) {
      onPickStudent(students[0]);
      return;
    }
    setEliminated({});
    setRunning(true);

    let survivors = [...students];
    const elimMap: Record<string, boolean> = {};

    const round = () => {
      if (survivors.length <= 1) {
        setRunning(false);
        if (survivors[0]) onPickStudent(survivors[0]);
        return;
      }
      const dropCount = survivors.length > 16 ? Math.ceil(survivors.length / 4) : survivors.length > 6 ? 2 : 1;
      for (let i = 0; i < dropCount && survivors.length > 1; i++) {
        const idx = cryptoRandomInt(survivors.length);
        const victim = survivors[idx];
        elimMap[victim.id] = true;
        survivors.splice(idx, 1);
      }
      setEliminated({ ...elimMap });
      if (!muted) {
        if (survivors.length <= 3) playBalloonPop();
        else playTickSound(survivors.length <= 5);
      }
      timerRef.current = window.setTimeout(round, survivors.length <= 4 ? 1300 : 850);
    };

    timerRef.current = window.setTimeout(round, 800);
  };

  return (
    <div className="flex-1 flex flex-col gap-4 p-4 max-w-6xl w-full mx-auto">
      <div className="bg-white/10 backdrop-blur-md border border-white/15 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-black text-base sm:text-lg flex items-center gap-2">
            ⚡ Loại trừ Sinh tồn (Battle Royale)
          </h2>
          <p className="text-xs opacity-75">
            Tia sét loại dần từng người cho đến khi chỉ còn 1 người sống sót cuối cùng!
          </p>
        </div>
        <button
          type="button"
          disabled={running || students.length === 0}
          onClick={startBattle}
          className="px-7 py-3 rounded-xl bg-gradient-to-r from-purple-500 to-rose-600 hover:from-purple-400 hover:to-rose-500 text-white font-black text-sm flex items-center gap-2 shadow-lg disabled:opacity-40"
        >
          <Zap className="w-4 h-4" />
          {running ? 'Đang loại trừ...' : 'BẮT ĐẦU SINH TỒN!'}
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-2.5 flex-1 content-start">
        {students.map((s) => {
          const out = Boolean(eliminated[s.id]);
          return (
            <div
              key={s.id}
              className={`px-3 py-3 rounded-2xl border font-bold text-sm text-center transition-all duration-300 ${
                out
                  ? 'bg-rose-950/50 border-rose-500/20 text-rose-300/40 line-through scale-90'
                  : 'bg-white/15 border-white/25 text-white shadow-md'
              }`}
            >
              {out ? '💥 ' : ''}
              {s.name}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default BattleRoyaleGame;
