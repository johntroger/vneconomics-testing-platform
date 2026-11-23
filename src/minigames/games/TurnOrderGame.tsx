import React, { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { Download, Eye, ListOrdered, Shuffle } from 'lucide-react';
import { GameAvatarBadge } from '../../components/game/GameAvatarBadge';
import { ConfettiBurst } from '../../components/game/ConfettiBurst';
import { playDrumroll, playRevealSound, playWinnerFanfare, unlockGameAudio } from '../../utils/gameAudio';
import { cryptoShuffle } from '../rosterStorage';
import type { MinigameProps, RosterStudent } from '../types';

export const TurnOrderGame: React.FC<MinigameProps> = ({ allStudents, muted }) => {
  const present = useMemo(() => allStudents.filter((s) => !s.absent), [allStudents]);
  const [order, setOrder] = useState<RosterStudent[]>([]);
  const [revealedCount, setRevealedCount] = useState(0);
  const [shuffling, setShuffling] = useState(false);
  const [confetti, setConfetti] = useState(false);

  const handleGenerate = (revealAllImmediately: boolean) => {
    if (present.length === 0 || shuffling) return;
    void unlockGameAudio();
    setShuffling(true);
    setConfetti(false);
    if (!muted) playDrumroll(1200);

    window.setTimeout(() => {
      const shuffled = cryptoShuffle(present);
      setOrder(shuffled);
      setRevealedCount(revealAllImmediately ? shuffled.length : 1);
      setShuffling(false);
      if (revealAllImmediately) {
        setConfetti(true);
        if (!muted) playWinnerFanfare();
        window.setTimeout(() => setConfetti(false), 3000);
      } else if (!muted) {
        playRevealSound();
      }
    }, 1250);
  };

  const handleRevealNext = () => {
    if (revealedCount >= order.length) return;
    const next = revealedCount + 1;
    setRevealedCount(next);
    if (!muted) {
      if (next === order.length) playWinnerFanfare();
      else playRevealSound();
    }
    if (next === order.length) {
      setConfetti(true);
      window.setTimeout(() => setConfetti(false), 3000);
    }
  };

  const handleExport = () => {
    if (order.length === 0) return;
    const rows = order.map((s, idx) => ({
      ThuTu: idx + 1,
      MSSV: s.studentCode || '',
      HoTen: s.name,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'ThuTuThuyetTrinh');
    XLSX.writeFile(wb, 'ThuTu_ThuyetTrinh.xlsx');
  };

  return (
    <div className="flex-1 flex flex-col gap-5 p-4 max-w-5xl w-full mx-auto">
      <ConfettiBurst active={confetti} />
      <div className="bg-white/10 backdrop-blur-md border border-white/15 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-black text-base sm:text-lg flex items-center gap-2">
            📋 Bốc thăm Thứ tự Thuyết trình ({present.length} sinh viên có mặt)
          </h2>
          <p className="text-xs opacity-75">
            Xáo trộn ngẫu nhiên thứ tự 1 → N, có thể mở từng lượt để tạo hồi hộp!
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {order.length > 0 && (
            <button
              type="button"
              onClick={handleExport}
              className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs flex items-center gap-1.5"
            >
              <Download className="w-4 h-4" /> Xuất Excel
            </button>
          )}
          <button
            type="button"
            disabled={shuffling || present.length === 0}
            onClick={() => handleGenerate(false)}
            className="px-4 py-2.5 rounded-xl bg-indigo-500 hover:bg-indigo-400 text-white font-black text-xs flex items-center gap-1.5 disabled:opacity-40"
          >
            <ListOrdered className="w-4 h-4" /> Xáo &amp; Mở từng lượt
          </button>
          <button
            type="button"
            disabled={shuffling || present.length === 0}
            onClick={() => handleGenerate(true)}
            className="px-5 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-xs flex items-center gap-1.5 disabled:opacity-40"
          >
            <Shuffle className="w-4 h-4" /> Mở toàn bộ ngay
          </button>
        </div>
      </div>

      {order.length > 0 && revealedCount < order.length && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={handleRevealNext}
            className="px-8 py-3 rounded-2xl bg-gradient-to-r from-amber-400 to-orange-500 text-slate-950 font-black text-base flex items-center gap-2 shadow-xl"
          >
            <Eye className="w-5 h-5" /> Mở lượt tiếp theo (#{revealedCount + 1})
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
        {order.map((s, idx) => {
          const shown = idx < revealedCount;
          return (
            <div
              key={s.id}
              className={`rounded-2xl border p-3.5 flex items-center gap-3 transition-all duration-300 ${
                shown
                  ? 'bg-white/15 border-white/25 shadow-lg'
                  : 'bg-black/25 border-white/10 opacity-50'
              }`}
            >
              <span className="w-9 h-9 rounded-xl bg-amber-400 text-slate-950 font-black text-base flex items-center justify-center shrink-0">
                #{idx + 1}
              </span>
              {shown ? (
                <>
                  <GameAvatarBadge avatarId={s.avatarId} size="sm" />
                  <div className="min-w-0">
                    <div className="font-bold text-sm truncate">{s.name}</div>
                    {s.studentCode && (
                      <div className="text-[11px] opacity-75">{s.studentCode}</div>
                    )}
                  </div>
                </>
              ) : (
                <div className="font-bold text-sm opacity-60">??? (Chưa mở)</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default TurnOrderGame;
