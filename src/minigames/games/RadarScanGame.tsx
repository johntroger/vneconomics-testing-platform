import React, { useEffect, useRef, useState } from 'react';
import { Radio } from 'lucide-react';
import { playTickSound, unlockGameAudio } from '../../utils/gameAudio';
import { cryptoRandomInt } from '../rosterStorage';
import { scalePaceMs, useMinigameStageSettings } from '../stageContext';
import type { MinigameProps } from '../types';

export const RadarScanGame: React.FC<MinigameProps> = ({ students, muted, onPickStudent }) => {
  const { paceMode } = useMinigameStageSettings();
  const [lockedId, setLockedId] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, []);

  const startScan = () => {
    if (scanning || students.length === 0) return;
    void unlockGameAudio();
    if (students.length === 1) {
      onPickStudent(students[0]);
      return;
    }

    setScanning(true);
    const winner = students[cryptoRandomInt(students.length)];
    const totalSteps =
      paceMode === 'EPIC' ? 44 : paceMode === 'NORMAL' ? 34 : paceMode === 'FAST' ? 22 : 12;
    let step = 0;

    const tick = () => {
      step++;
      if (step >= totalSteps) {
        setLockedId(winner.id);
        setScanning(false);
        onPickStudent(winner);
        return;
      }
      const preview = students[cryptoRandomInt(students.length)];
      setLockedId(preview.id);
      if (!muted) playTickSound(step > totalSteps - 6);
      const baseDelay = 120 + Math.pow(step / totalSteps, 2.2) * 520;
      const delay = scalePaceMs(baseDelay, paceMode);
      timerRef.current = window.setTimeout(tick, delay);
    };

    tick();
  };

  return (
    <div className="flex-1 flex flex-col gap-4 p-4 max-w-6xl w-full mx-auto">
      <div className="bg-emerald-950/60 backdrop-blur-md border border-emerald-400/30 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-black text-base sm:text-lg text-emerald-300 flex items-center gap-2">
            📡 Radar Quét Mục tiêu ({students.length} sinh viên)
          </h2>
          <p className="text-xs text-emerald-200/75">
            Tia sonar quét toàn bộ lưới lớp học và khóa mục tiêu ngẫu nhiên!
          </p>
        </div>
        <button
          type="button"
          disabled={scanning || students.length === 0}
          onClick={startScan}
          className="px-7 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-sm flex items-center gap-2 shadow-lg disabled:opacity-40"
        >
          <Radio className="w-4 h-4" />
          {scanning ? 'Đang quét Radar...' : 'QUÉT MỤC TIÊU!'}
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2.5 flex-1 content-start bg-emerald-950/30 border border-emerald-500/20 rounded-3xl p-4">
        {students.map((s) => {
          const active = lockedId === s.id;
          return (
            <div
              key={s.id}
              className={`px-3 py-3 rounded-xl border font-mono font-bold text-xs text-center transition-all duration-100 ${
                active
                  ? 'bg-emerald-400 text-slate-950 border-white ring-4 ring-emerald-300 scale-105 shadow-[0_0_25px_rgba(52,211,153,0.8)]'
                  : 'bg-emerald-950/60 border-emerald-500/25 text-emerald-200/80'
              }`}
            >
              {active ? '🎯 ' : ''}
              {s.name}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default RadarScanGame;
