import React, { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { Crown, Download, Users } from 'lucide-react';
import { GameAvatarBadge } from '../../components/game/GameAvatarBadge';
import { ConfettiBurst } from '../../components/game/ConfettiBurst';
import { playDrumroll, playRevealSound, playWinnerFanfare, unlockGameAudio } from '../../utils/gameAudio';
import { cryptoShuffle } from '../rosterStorage';
import type { MinigameProps, RosterStudent } from '../types';

export const CaptainDraftGame: React.FC<MinigameProps> = ({ allStudents, muted }) => {
  const present = useMemo(() => allStudents.filter((s) => !s.absent), [allStudents]);
  const [teamCount, setTeamCount] = useState(4);
  const [captains, setCaptains] = useState<RosterStudent[]>([]);
  const [teams, setTeams] = useState<Array<{ captain: RosterStudent; members: RosterStudent[] }>>([]);
  const [busy, setBusy] = useState(false);
  const [confetti, setConfetti] = useState(false);

  const handlePickCaptains = () => {
    if (present.length < 2 || busy) return;
    void unlockGameAudio();
    setBusy(true);
    setTeams([]);
    setConfetti(false);
    if (!muted) playDrumroll(1300);

    window.setTimeout(() => {
      const k = Math.max(2, Math.min(teamCount, present.length));
      const shuffled = cryptoShuffle(present);
      setCaptains(shuffled.slice(0, k));
      setBusy(false);
      if (!muted) playRevealSound();
    }, 1350);
  };

  const handleAssignSoldiers = () => {
    if (captains.length === 0 || busy) return;
    void unlockGameAudio();
    setBusy(true);
    if (!muted) playDrumroll(1400);

    window.setTimeout(() => {
      const capIds = new Set(captains.map((c) => c.id));
      const rest = cryptoShuffle(present.filter((s) => !capIds.has(s.id)));
      const out = captains.map((c) => ({ captain: c, members: [] as RosterStudent[] }));
      rest.forEach((stu, idx) => {
        out[idx % out.length].members.push(stu);
      });
      setTeams(out);
      setBusy(false);
      setConfetti(true);
      if (!muted) playWinnerFanfare();
      window.setTimeout(() => setConfetti(false), 3500);
    }, 1450);
  };

  const handleExport = () => {
    if (teams.length === 0) return;
    const rows: Array<Record<string, string | number>> = [];
    teams.forEach((t, idx) => {
      rows.push({ Doi: `Đội ${idx + 1}`, VaiTro: 'Đội trưởng', MSSV: t.captain.studentCode || '', HoTen: t.captain.name });
      t.members.forEach((m) => {
        rows.push({ Doi: `Đội ${idx + 1}`, VaiTro: 'Thành viên', MSSV: m.studentCode || '', HoTen: m.name });
      });
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'DoiTruong_Quan');
    XLSX.writeFile(wb, 'BauDoiTruong_ChiaQuan.xlsx');
  };

  return (
    <div className="flex-1 flex flex-col gap-5 p-4 max-w-6xl w-full mx-auto">
      <ConfettiBurst active={confetti} />
      <div className="bg-white/10 backdrop-blur-md border border-white/15 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs font-bold uppercase tracking-wider opacity-80">Số Đội trưởng:</span>
          {[2, 3, 4, 5, 6].map((n) => (
            <button
              key={n}
              type="button"
              disabled={busy}
              onClick={() => setTeamCount(n)}
              className={`px-3 py-1.5 rounded-xl font-black text-sm ${
                teamCount === n ? 'bg-amber-400 text-slate-950' : 'bg-white/10 hover:bg-white/20'
              }`}
            >
              {n}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {teams.length > 0 && (
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
            disabled={busy || present.length < 2}
            onClick={handlePickCaptains}
            className="px-5 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-xs flex items-center gap-1.5 disabled:opacity-40"
          >
            <Crown className="w-4 h-4" /> Bước 1: Bầu {teamCount} Đội trưởng
          </button>
          <button
            type="button"
            disabled={busy || captains.length === 0}
            onClick={handleAssignSoldiers}
            className="px-5 py-2.5 rounded-xl bg-indigo-500 hover:bg-indigo-400 text-white font-black text-xs flex items-center gap-1.5 disabled:opacity-40"
          >
            <Users className="w-4 h-4" /> Bước 2: Chia quân về Đội
          </button>
        </div>
      </div>

      {captains.length > 0 && teams.length === 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {captains.map((c, idx) => (
            <div
              key={c.id}
              className="rounded-2xl border-2 border-amber-400/60 bg-amber-400/15 p-5 text-center space-y-2 shadow-xl"
            >
              <div className="text-xs font-black uppercase text-amber-300">
                👑 Đội trưởng Đội {idx + 1}
              </div>
              <div className="flex justify-center">
                <GameAvatarBadge avatarId={c.avatarId} streak={2} size="md" />
              </div>
              <div className="font-black text-lg">{c.name}</div>
            </div>
          ))}
        </div>
      )}

      {teams.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {teams.map((t, idx) => (
            <div
              key={t.captain.id}
              className="rounded-2xl border border-indigo-400/40 bg-indigo-950/50 p-4 space-y-2.5 shadow-xl"
            >
              <div className="flex items-center gap-2.5 bg-amber-400/20 border border-amber-400/40 rounded-xl p-2.5">
                <GameAvatarBadge avatarId={t.captain.avatarId} streak={2} size="sm" />
                <div className="min-w-0">
                  <div className="text-[10px] font-black uppercase text-amber-300">
                    👑 Đội trưởng Đội {idx + 1}
                  </div>
                  <div className="font-black text-sm truncate">{t.captain.name}</div>
                </div>
              </div>
              {t.members.map((m) => (
                <div key={m.id} className="flex items-center gap-2 bg-black/25 rounded-xl px-3 py-2">
                  <GameAvatarBadge avatarId={m.avatarId} size="sm" />
                  <span className="font-bold text-sm truncate">{m.name}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default CaptainDraftGame;
