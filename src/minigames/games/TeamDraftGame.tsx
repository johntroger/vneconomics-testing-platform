import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import { Crown, Download, Shuffle, Users } from 'lucide-react';
import { GameAvatarBadge } from '../../components/game/GameAvatarBadge';
import { ConfettiBurst } from '../../components/game/ConfettiBurst';
import { cryptoShuffle } from '../rosterStorage';
import type { MinigameProps, RosterStudent } from '../types';
import { playDrumroll, playWinnerFanfare, unlockGameAudio } from '../../utils/gameAudio';

interface DraftedTeam {
  teamName: string;
  captainId?: string;
  members: RosterStudent[];
}

const TEAM_COLORS = [
  'from-rose-500/25 to-rose-600/10 border-rose-400/40',
  'from-blue-500/25 to-blue-600/10 border-blue-400/40',
  'from-emerald-500/25 to-emerald-600/10 border-emerald-400/40',
  'from-amber-500/25 to-amber-600/10 border-amber-400/40',
  'from-violet-500/25 to-violet-600/10 border-violet-400/40',
  'from-cyan-500/25 to-cyan-600/10 border-cyan-400/40',
];

export const TeamDraftGame: React.FC<MinigameProps> = ({
  allStudents,
  muted,
}) => {
  const presentStudents = React.useMemo(
    () => allStudents.filter((s) => !s.absent),
    [allStudents],
  );
  const [groupCount, setGroupCount] = useState(4);
  const [balanceGender, setBalanceGender] = useState(true);
  const [pickCaptain, setPickCaptain] = useState(true);
  const [drafting, setDrafting] = useState(false);
  const [teams, setTeams] = useState<DraftedTeam[]>([]);
  const [confetti, setConfetti] = useState(false);

  const handleDraft = () => {
    if (presentStudents.length === 0 || drafting) return;
    void unlockGameAudio();
    setDrafting(true);
    setConfetti(false);
    if (!muted) playDrumroll(900);

    window.setTimeout(() => {
      const k = Math.max(2, Math.min(groupCount, presentStudents.length));
      let ordered: RosterStudent[] = [];

      if (balanceGender) {
        const females = cryptoShuffle(
          presentStudents.filter((s) => /nữ|nu|female|^f$/i.test(s.gender || '')),
        );
        const males = cryptoShuffle(
          presentStudents.filter((s) => /nam|male|^m$/i.test(s.gender || '')),
        );
        const others = cryptoShuffle(
          presentStudents.filter(
            (s) =>
              !/nữ|nu|female|^f$/i.test(s.gender || '') &&
              !/nam|male|^m$/i.test(s.gender || ''),
          ),
        );
        ordered = [...females, ...males, ...others];
      } else {
        ordered = cryptoShuffle(presentStudents);
      }

      const buckets: RosterStudent[][] = Array.from({ length: k }, () => []);
      ordered.forEach((stu, idx) => {
        buckets[idx % k].push(stu);
      });

      const drafted: DraftedTeam[] = buckets.map((members, idx) => ({
        teamName: `Nhóm ${idx + 1}`,
        captainId: pickCaptain && members.length > 0 ? members[0].id : undefined,
        members,
      }));

      setTeams(drafted);
      setDrafting(false);
      setConfetti(true);
      if (!muted) playWinnerFanfare();
      window.setTimeout(() => setConfetti(false), 3500);
    }, 950);
  };

  const handleExport = () => {
    if (teams.length === 0) return;
    const rows: Array<Record<string, string | number>> = [];
    teams.forEach((t) => {
      t.members.forEach((m, idx) => {
        rows.push({
          Nhom: t.teamName,
          STT: idx + 1,
          MSSV: m.studentCode || '',
          HoTen: m.name,
          GioiTinh: m.gender || '',
          VaiTro: t.captainId === m.id ? 'Nhóm trưởng' : 'Thành viên',
        });
      });
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'DanhSachNhom');
    XLSX.writeFile(wb, 'ChiaNhom_NgauNhien.xlsx');
  };

  return (
    <div className="flex-1 flex flex-col gap-5 p-4 max-w-6xl w-full mx-auto">
      <ConfettiBurst active={confetti} />

      {/* Controls */}
      <div className="bg-white/10 backdrop-blur-md border border-white/15 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider opacity-80">
              Số nhóm:
            </span>
            {[2, 3, 4, 5, 6, 8].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setGroupCount(n)}
                className={`px-3 py-1.5 rounded-xl font-black text-sm transition ${
                  groupCount === n
                    ? 'bg-amber-400 text-slate-950'
                    : 'bg-white/10 hover:bg-white/20'
                }`}
              >
                {n}
              </button>
            ))}
          </div>

          <label className="flex items-center gap-2 text-xs font-bold cursor-pointer">
            <input
              type="checkbox"
              checked={balanceGender}
              onChange={(e) => setBalanceGender(e.target.checked)}
              className="accent-amber-400 w-4 h-4"
            />
            Cân bằng giới tính
          </label>

          <label className="flex items-center gap-2 text-xs font-bold cursor-pointer">
            <input
              type="checkbox"
              checked={pickCaptain}
              onChange={(e) => setPickCaptain(e.target.checked)}
              className="accent-amber-400 w-4 h-4"
            />
            Chọn ngẫu nhiên Nhóm trưởng
          </label>
        </div>

        <div className="flex items-center gap-2">
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
            disabled={drafting || presentStudents.length < 2}
            onClick={handleDraft}
            className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-300 hover:to-orange-400 text-slate-950 font-black text-sm flex items-center gap-2 shadow-lg disabled:opacity-40"
          >
            <Shuffle className="w-4 h-4" />
            {drafting ? 'Đang chia đội...' : 'Chia nhóm ngay!'}
          </button>
        </div>
      </div>

      {/* Result Grid */}
      {teams.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center gap-3 opacity-80">
          <Users className="w-16 h-16 text-amber-300" />
          <p className="text-lg font-bold">
            Sẵn sàng chia {presentStudents.length} sinh viên có mặt thành {groupCount} nhóm ngẫu nhiên
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {teams.map((team, idx) => (
            <div
              key={team.teamName}
              className={`rounded-2xl border bg-gradient-to-br p-4 space-y-3 shadow-xl ${
                TEAM_COLORS[idx % TEAM_COLORS.length]
              }`}
            >
              <div className="flex items-center justify-between border-b border-white/15 pb-2">
                <h3 className="font-black text-lg">{team.teamName}</h3>
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-black/25">
                  {team.members.length} thành viên
                </span>
              </div>
              <div className="space-y-2">
                {team.members.map((m) => {
                  const isCap = team.captainId === m.id;
                  return (
                    <div
                      key={m.id}
                      className="flex items-center gap-2.5 bg-black/20 rounded-xl px-2.5 py-2"
                    >
                      <GameAvatarBadge avatarId={m.avatarId} size="sm" />
                      <div className="min-w-0 flex-1">
                        <div className="font-bold text-sm truncate flex items-center gap-1">
                          {m.name}
                          {isCap && (
                            <span title="Nhóm trưởng">
                              <Crown className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                            </span>
                          )}
                        </div>
                        {m.studentCode && (
                          <div className="text-[11px] opacity-75">{m.studentCode}</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default TeamDraftGame;
