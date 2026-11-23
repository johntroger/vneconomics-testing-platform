import React, { useEffect, useRef, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { playRevealSound, playWheelTick, unlockGameAudio } from '../../utils/gameAudio';
import { cryptoRandomInt } from '../rosterStorage';
import { scalePaceMs, useMinigameStageSettings } from '../stageContext';
import type { MinigameProps, RosterStudent } from '../types';

export const SlotMachineGame: React.FC<MinigameProps> = ({ students, muted, onPickStudent }) => {
  const { paceMode } = useMinigameStageSettings();
  const [reelCount, setReelCount] = useState<1 | 2 | 3>(1);
  const [spinning, setSpinning] = useState(false);
  const [reels, setReels] = useState<string[]>(['?', '?', '?']);
  const [locked, setLocked] = useState<boolean[]>([false, false, false]);
  const timersRef = useRef<number[]>([]);
  const timeoutsRef = useRef<number[]>([]);

  useEffect(() => {
    return () => {
      timersRef.current.forEach((t) => window.clearInterval(t));
      timeoutsRef.current.forEach((t) => window.clearTimeout(t));
    };
  }, []);

  const handlePull = () => {
    if (spinning || students.length === 0) return;
    void unlockGameAudio();
    timersRef.current.forEach((t) => window.clearInterval(t));
    timersRef.current = [];
    timeoutsRef.current.forEach((t) => window.clearTimeout(t));
    timeoutsRef.current = [];

    setSpinning(true);
    setLocked([false, false, false]);

    const winners: RosterStudent[] = [];
    const pool = [...students];
    for (let i = 0; i < reelCount; i++) {
      const idx = cryptoRandomInt(pool.length);
      winners.push(pool[idx]);
      if (pool.length > 1) pool.splice(idx, 1);
    }

    const intervals: number[] = [];
    for (let r = 0; r < reelCount; r++) {
      const iv = window.setInterval(() => {
        setReels((prev) => {
          const next = [...prev];
          next[r] = students[cryptoRandomInt(students.length)].name;
          return next;
        });
        if (r === 0 && !muted) playWheelTick();
      }, 90);
      intervals.push(iv);
      timersRef.current.push(iv);

      const tid = window.setTimeout(() => {
        window.clearInterval(iv);
        setReels((prev) => {
          const next = [...prev];
          next[r] = winners[r].name;
          return next;
        });
        setLocked((prev) => {
          const next = [...prev];
          next[r] = true;
          return next;
        });
        if (!muted) playRevealSound();

        if (r === reelCount - 1) {
          setSpinning(false);
          onPickStudent(winners[0]);
        }
      }, scalePaceMs(4200 + r * 2400, paceMode));
      timeoutsRef.current.push(tid);
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-6 p-4">
      <div className="text-center space-y-2">
        <p className="text-sm font-bold opacity-85">
          Máy Xèng Quay số — Gọi cùng lúc 1, 2 hoặc 3 sinh viên!
        </p>
        <div className="inline-flex rounded-xl bg-white/10 p-1 text-xs font-bold">
          {([1, 2, 3] as const).map((cnt) => (
            <button
              key={cnt}
              type="button"
              disabled={spinning}
              onClick={() => setReelCount(cnt)}
              className={`px-3.5 py-1.5 rounded-lg transition ${
                reelCount === cnt ? 'bg-amber-400 text-slate-950' : 'opacity-80'
              }`}
            >
              Gọi {cnt} người
            </button>
          ))}
        </div>
      </div>

      <div className="bg-gradient-to-b from-amber-500/20 to-rose-600/20 border-4 border-amber-400 rounded-3xl p-6 shadow-2xl flex flex-wrap items-center justify-center gap-4">
        {Array.from({ length: reelCount }).map((_, idx) => (
          <div
            key={idx}
            className={`w-56 h-32 rounded-2xl bg-slate-950 border-2 flex items-center justify-center p-4 text-center shadow-inner transition ${
              locked[idx] ? 'border-emerald-400 ring-2 ring-emerald-400/50' : 'border-white/20'
            }`}
          >
            <span className="font-black text-xl text-white leading-snug">{reels[idx]}</span>
          </div>
        ))}
      </div>

      <button
        type="button"
        disabled={spinning || students.length === 0}
        onClick={handlePull}
        className="px-10 py-4 rounded-2xl bg-gradient-to-r from-amber-400 to-red-500 hover:from-amber-300 hover:to-red-400 text-slate-950 font-black text-xl flex items-center gap-2 shadow-xl disabled:opacity-40"
      >
        <Sparkles className="w-6 h-6" />
        {spinning ? 'Đang quay xèng...' : 'KÉO CẦN GẠT!'}
      </button>
    </div>
  );
};

export default SlotMachineGame;
