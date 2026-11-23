import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Anchor, RefreshCw } from 'lucide-react';
import { playDrumroll, playWheelTick, unlockGameAudio } from '../../utils/gameAudio';
import { cryptoShuffle } from '../rosterStorage';
import type { MinigameProps, RosterStudent } from '../types';

export const GoldMinerGame: React.FC<MinigameProps> = ({ students, muted, onPickStudent }) => {
  const [angle, setAngle] = useState(0);
  const [extending, setExtending] = useState(false);
  const [grabLen, setGrabLen] = useState(40);
  const [sampleSeed, setSampleSeed] = useState(0);
  const dirRef = useRef(1);
  const extendingRef = useRef(false);

  const nuggets = useMemo(() => {
    const pool = students.length <= 7 ? students : cryptoShuffle(students).slice(0, 7);
    return pool.map((s, i) => ({
      student: s,
      angleDeg: -60 + (i * 120) / Math.max(1, pool.length - 1),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [students, sampleSeed]);

  useEffect(() => {
    const iv = window.setInterval(() => {
      if (extendingRef.current) return;
      setAngle((a) => {
        const next = a + dirRef.current * 2.2;
        if (next >= 65) dirRef.current = -1;
        if (next <= -65) dirRef.current = 1;
        return next;
      });
    }, 30);
    return () => window.clearInterval(iv);
  }, []);

  const handleDropHook = () => {
    if (extendingRef.current || nuggets.length === 0) return;
    void unlockGameAudio();
    extendingRef.current = true;
    setExtending(true);
    if (!muted) playDrumroll(800);

    // Find closest nugget to current swing angle
    let best = nuggets[0];
    let bestDiff = 999;
    for (const n of nuggets) {
      const diff = Math.abs(n.angleDeg - angle);
      if (diff < bestDiff) {
        bestDiff = diff;
        best = n;
      }
    }

    setGrabLen(200);
    window.setTimeout(() => {
      if (!muted) playWheelTick();
      setGrabLen(40);
      window.setTimeout(() => {
        extendingRef.current = false;
        setExtending(false);
        const picked: RosterStudent = best.student;
        onPickStudent(picked);
      }, 650);
    }, 850);
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-between gap-4 p-4 max-w-4xl w-full mx-auto">
      <div className="text-center space-y-1.5">
        <p className="text-sm font-bold opacity-85">
          Đào Vàng Cổ điển — Canh móc câu lắc và bấm THẢ MÓC để gắp sinh viên!
        </p>
        {students.length > 7 && (
          <button
            type="button"
            disabled={extending}
            onClick={() => setSampleSeed((s) => s + 1)}
            className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full bg-white/15 hover:bg-white/25 disabled:opacity-40"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Đổi 7 cục vàng mới
          </button>
        )}
      </div>

      {/* Mine Stage */}
      <div className="relative w-full h-80 rounded-3xl bg-gradient-to-b from-amber-950/60 to-stone-950/95 border-2 border-amber-500/40 overflow-hidden flex flex-col items-center">
        {/* Pivot + Swinging Rope */}
        <div className="relative mt-4 flex flex-col items-center">
          <div className="w-10 h-10 rounded-full bg-amber-400 text-slate-950 flex items-center justify-center font-black shadow-lg z-10">
            ⛏️
          </div>
          <div
            style={{
              transform: `rotate(${angle}deg)`,
              transformOrigin: 'top center',
              height: `${grabLen}px`,
            }}
            className="w-1 bg-amber-300 transition-[height] duration-700 flex flex-col items-center justify-end"
          >
            <span className="text-2xl translate-y-3">🪝</span>
          </div>
        </div>

        {/* Gold Nuggets at bottom */}
        <div className="mt-auto w-full px-4 pb-5 grid grid-cols-3 sm:grid-cols-7 gap-2 items-end">
          {nuggets.map((n) => (
            <div
              key={n.student.id}
              className="rounded-2xl bg-gradient-to-b from-yellow-300 to-amber-500 text-slate-950 p-2 text-center shadow-lg border-2 border-yellow-200"
            >
              <div className="text-lg leading-none">🪙</div>
              <div className="text-[11px] font-black truncate mt-1">{n.student.name}</div>
            </div>
          ))}
        </div>
      </div>

      <button
        type="button"
        disabled={extending || nuggets.length === 0}
        onClick={handleDropHook}
        className="px-10 py-4 rounded-2xl bg-gradient-to-r from-yellow-400 to-amber-500 hover:from-yellow-300 hover:to-amber-400 text-slate-950 font-black text-xl flex items-center gap-2 shadow-xl disabled:opacity-40"
      >
        <Anchor className="w-6 h-6" />
        {extending ? 'Đang kéo vàng...' : 'THẢ MÓC CÂU!'}
      </button>
    </div>
  );
};

export default GoldMinerGame;
