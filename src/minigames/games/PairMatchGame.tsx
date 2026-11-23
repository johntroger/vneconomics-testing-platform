import React, { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { Download, Shuffle } from 'lucide-react';
import { GameAvatarBadge } from '../../components/game/GameAvatarBadge';
import { ConfettiBurst } from '../../components/game/ConfettiBurst';
import { playDrumroll, playWinnerFanfare, unlockGameAudio } from '../../utils/gameAudio';
import { cryptoShuffle } from '../rosterStorage';
import type { MinigameProps, RosterStudent } from '../types';

export const PairMatchGame: React.FC<MinigameProps> = ({ allStudents, muted }) => {
  const present = useMemo(() => allStudents.filter((s) => !s.absent), [allStudents]);
  const [pairs, setPairs] = useState<RosterStudent[][]>([]);
  const [pairing, setPairing] = useState(false);
  const [confetti, setConfetti] = useState(false);

  const handlePair = () => {
    if (present.length < 2 || pairing) return;
    void unlockGameAudio();
    setPairing(true);
    setConfetti(false);
    if (!muted) playDrumroll(1400);

    window.setTimeout(() => {
      const shuffled = cryptoShuffle(present);
      const out: RosterStudent[][] = [];
      for (let i = 0; i < shuffled.length; i += 2) {
        if (i + 3 === shuffled.length) {
          out.push([shuffled[i], shuffled[i + 1], shuffled[i + 2]]);
          break;
        }
        out.push(shuffled.slice(i, i + 2));
      }
      setPairs(out);
      setPairing(false);
      setConfetti(true);
      if (!muted) playWinnerFanfare();
      window.setTimeout(() => setConfetti(false), 3200);
    }, 1450);
  };

  const handleExport = () => {
    if (pairs.length === 0) return;
    const rows = pairs.map((g, idx) => ({
      Cap: `Cặp ${idx + 1}`,
      ThanhVien1: g[0]?.name ?? '',
      ThanhVien2: g[1]?.name ?? '',
      ThanhVien3: g[2]?.name ?? '',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'GhepCap');
    XLSX.writeFile(wb, 'GhepCap_NgauNhien.xlsx');
  };

  return (
    <div className="flex-1 flex flex-col gap-5 p-4 max-w-6xl w-full mx-auto">
      <ConfettiBurst active={confetti} />
      <div className="bg-white/10 backdrop-blur-md border border-white/15 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-black text-base sm:text-lg flex items-center gap-2">
            🤝 Ghép cặp Ngẫu nhiên ({present.length} sinh viên có mặt)
          </h2>
          <p className="text-xs opacity-75">
            Ghép đôi 1–1 cho thảo luận cặp hoặc chấm chéo Peer Review (tự lập nhóm 3 nếu lẻ).
          </p>
        </div>

        <div className="flex items-center gap-2">
          {pairs.length > 0 && (
            <button
              type="button"
              onClick={handleExport}
              className="px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs flex items-center gap-1.5"
            >
              <Download className="w-4 h-4" /> Xuất Excel
            </button>
          )}
          <button
            type="button"
            disabled={pairing || present.length < 2}
            onClick={handlePair}
            className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-pink-500 to-violet-600 hover:from-pink-400 hover:to-violet-500 text-white font-black text-sm flex items-center gap-2 shadow-lg disabled:opacity-40"
          >
            <Shuffle className="w-4 h-4" />
            {pairing ? 'Đang ghép cặp...' : 'GHÉP CẶP NGAY!'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
        {pairs.map((group, idx) => (
          <div
            key={idx}
            className="rounded-2xl border border-pink-400/35 bg-gradient-to-br from-pink-500/20 to-violet-600/15 p-4 space-y-2.5 shadow-lg"
          >
            <div className="text-xs font-black uppercase tracking-wider text-pink-300">
              Cặp #{idx + 1}
            </div>
            {group.map((m) => (
              <div key={m.id} className="flex items-center gap-2.5 bg-black/25 rounded-xl px-3 py-2">
                <GameAvatarBadge avatarId={m.avatarId} size="sm" />
                <div className="min-w-0">
                  <div className="font-bold text-sm truncate">{m.name}</div>
                  {m.studentCode && <div className="text-[11px] opacity-75">{m.studentCode}</div>}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};

export default PairMatchGame;
