import React, { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { playDrumroll, playWheelTick, unlockGameAudio } from '../../utils/gameAudio';
import { cryptoRandomInt } from '../rosterStorage';
import { scalePaceMs, useMinigameStageSettings } from '../stageContext';
import type { MinigameProps } from '../types';

export const BambooSticksGame: React.FC<MinigameProps> = ({ students, muted, onPickStudent }) => {
  const { paceMode } = useMinigameStageSettings();
  const [shaking, setShaking] = useState(false);
  const [risenName, setRisenName] = useState<string | null>(null);

  const handleShake = () => {
    if (shaking || students.length === 0) return;
    void unlockGameAudio();
    if (students.length === 1) {
      onPickStudent(students[0]);
      return;
    }

    const shakeMs = scalePaceMs(5200, paceMode);
    setShaking(true);
    setRisenName(null);
    if (!muted) playDrumroll(shakeMs - 200);

    const clack = window.setInterval(() => {
      if (!muted) playWheelTick();
    }, 170);

    window.setTimeout(() => {
      window.clearInterval(clack);
      setShaking(false);
      const winner = students[cryptoRandomInt(students.length)];
      setRisenName(winner.name);
      window.setTimeout(() => onPickStudent(winner), 500);
    }, shakeMs);
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-6 p-4">
      <p className="text-sm font-bold opacity-85 text-center">
        Rút Thẻ Tre — Lắc ống xăm cổ điển để rút ra 1 thẻ tên may mắn!
      </p>

      <div className="relative h-72 flex items-end justify-center pt-16">
        {/* Risen stick */}
        <div
          className={`absolute top-2 w-16 h-44 rounded-t-xl bg-gradient-to-b from-amber-200 to-amber-400 border-2 border-amber-700 flex items-center justify-center p-2 shadow-xl transition-all duration-500 ${
            risenName ? 'translate-y-0 opacity-100' : 'translate-y-24 opacity-0'
          }`}
        >
          <span className="font-black text-xs text-slate-900 text-center leading-tight">
            {risenName}
          </span>
        </div>

        {/* Bamboo cup */}
        <div
          onClick={handleShake}
          className={`relative z-10 w-36 h-44 rounded-b-3xl rounded-t-lg bg-gradient-to-r from-lime-700 via-emerald-700 to-lime-800 border-4 border-amber-900 shadow-2xl flex flex-col items-center justify-center cursor-pointer ${
            shaking ? 'animate-wobble-suspense' : ''
          }`}
        >
          <span className="text-5xl">🎋</span>
          <span className="text-xs font-black text-amber-200 mt-2">ỐNG THẺ TRE</span>
        </div>
      </div>

      <button
        type="button"
        disabled={shaking || students.length === 0}
        onClick={handleShake}
        className="px-10 py-4 rounded-2xl bg-gradient-to-r from-lime-400 to-emerald-500 hover:from-lime-300 hover:to-emerald-400 text-slate-950 font-black text-xl flex items-center gap-2 shadow-xl disabled:opacity-40"
      >
        <Sparkles className="w-6 h-6" />
        {shaking ? 'Đang xóc ống thẻ...' : 'LẮC ỐNG THẺ!'}
      </button>
    </div>
  );
};

export default BambooSticksGame;
