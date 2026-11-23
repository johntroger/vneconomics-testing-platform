import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Flag, RefreshCw, Zap } from 'lucide-react';
import { GameAvatarBadge } from '../../components/game/GameAvatarBadge';
import { playRaceStartHorn, playTickSound, unlockGameAudio } from '../../utils/gameAudio';
import { cryptoShuffle } from '../rosterStorage';
import type { RosterStudent } from '../types';

export interface RaceEngineProps {
  students: RosterStudent[];
  muted: boolean;
  racerEmoji: string;
  title: string;
  trackBgClass: string;
  laneBgClass?: string;
  trailEmoji?: string;
  onPickStudent: (student: RosterStudent) => void;
}

interface RacerState {
  student: RosterStudent;
  progress: number;
  speed: number;
  boosting: boolean;
  finishedOrder: number;
}

export const RaceEngine: React.FC<RaceEngineProps> = ({
  students,
  muted,
  racerEmoji,
  title,
  trackBgClass,
  laneBgClass = 'bg-white/10 border-white/15',
  trailEmoji = '💨',
  onPickStudent,
}) => {
  const [sampleSeed, setSampleSeed] = useState(0);
  const [pickMode, setPickMode] = useState<'FIRST' | 'LAST'>('FIRST');
  const [speedMode, setSpeedMode] = useState<'DRAMA' | 'FAST'>('DRAMA');
  const [countdownText, setCountdownText] = useState<string | null>(null);
  const [commentary, setCommentary] = useState<string>('Sẵn sàng tại vạch xuất phát!');
  const [racing, setRacing] = useState(false);
  const [racers, setRacers] = useState<RacerState[]>([]);
  const racingRef = useRef(false);
  const rafRef = useRef<number>(0);

  const laneStudents = useMemo(() => {
    return students.length <= 14 ? students : cryptoShuffle(students).slice(0, 14);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [students, sampleSeed]);

  useEffect(() => {
    setRacers(
      laneStudents.map((s) => ({
        student: s,
        progress: 0,
        speed: 0,
        boosting: false,
        finishedOrder: 0,
      })),
    );
    setCommentary('Sẵn sàng tại vạch xuất phát!');
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      racingRef.current = false;
    };
  }, [laneStudents]);

  const startRace = () => {
    if (racingRef.current || laneStudents.length === 0) return;
    void unlockGameAudio();
    if (laneStudents.length === 1) {
      onPickStudent(laneStudents[0]);
      return;
    }

    racingRef.current = true;
    setRacing(true);

    // 3 - 2 - 1 - XUẤT PHÁT!
    const seq = ['3', '2', '1', 'XUẤT PHÁT!'];
    seq.forEach((label, idx) => {
      window.setTimeout(() => {
        setCountdownText(label);
        if (!muted) {
          if (idx < 3) playTickSound(idx === 2);
          else playRaceStartHorn();
        }
      }, idx * 620);
    });

    window.setTimeout(() => {
      setCountdownText(null);
      const mult = speedMode === 'DRAMA' ? 0.22 : 0.55;
      const state: RacerState[] = laneStudents.map((s) => ({
        student: s,
        progress: 0,
        speed: (0.2 + Math.random() * 0.2) * mult,
        boosting: false,
        finishedOrder: 0,
      }));

      let finishCounter = 0;
      let frameCount = 0;
      let lastLeaderId = '';

      const step = () => {
        frameCount++;
        let allFinished = true;
        let firstWinner: RosterStudent | null = null;
        let lastWinner: RosterStudent | null = null;

        for (const r of state) {
          if (r.progress >= 100) continue;
          allFinished = false;

          // Dynamic overtakes & comeback drama in final 30%
          if (frameCount % 26 === 0) {
            const roll = Math.random();
            const isBehind = r.progress < 75 && roll > 0.7;
            r.boosting = roll > 0.76 || isBehind;
            r.speed = r.boosting
              ? (0.55 + Math.random() * 0.35) * mult
              : (0.1 + Math.random() * 0.26) * mult;
          }

          r.progress = Math.min(100, r.progress + r.speed);
          if (r.progress >= 100 && r.finishedOrder === 0) {
            finishCounter++;
            r.finishedOrder = finishCounter;
            if (finishCounter === 1) firstWinner = r.student;
            if (finishCounter === state.length) lastWinner = r.student;
          }
        }

        // Update live commentary when leader changes
        if (frameCount % 15 === 0) {
          const sorted = [...state].sort((a, b) => b.progress - a.progress);
          const leader = sorted[0];
          if (leader && leader.student.id !== lastLeaderId && leader.progress > 10) {
            lastLeaderId = leader.student.id;
            setCommentary(
              leader.boosting
                ? `🔥 ${leader.student.name} vừa bật Nitro vượt lên dẫn đầu!`
                : `🏁 ${leader.student.name} đang tạm dẫn đầu đường đua!`,
            );
          }
        }

        setRacers([...state]);

        if (pickMode === 'FIRST' && firstWinner) {
          racingRef.current = false;
          setRacing(false);
          onPickStudent(firstWinner);
          return;
        }

        if (allFinished || (pickMode === 'LAST' && lastWinner)) {
          racingRef.current = false;
          setRacing(false);
          const chosen =
            pickMode === 'FIRST'
              ? state.find((x) => x.finishedOrder === 1)?.student
              : lastWinner ?? state[state.length - 1]?.student;
          if (chosen) onPickStudent(chosen);
          return;
        }

        rafRef.current = requestAnimationFrame(step);
      };

      rafRef.current = requestAnimationFrame(step);
    }, 2500);
  };

  // Compute live ranks
  const rankMap = useMemo(() => {
    const sorted = [...racers].sort((a, b) => b.progress - a.progress);
    const map = new Map<string, number>();
    sorted.forEach((r, idx) => {
      if (r.progress > 2) map.set(r.student.id, idx + 1);
    });
    return map;
  }, [racers]);

  return (
    <div className="flex-1 flex flex-col gap-3.5 p-4 max-w-6xl w-full mx-auto relative">
      {/* Controls */}
      <div className="bg-white/10 backdrop-blur-md border border-white/15 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-black text-base sm:text-lg flex items-center gap-2">
            <span>{racerEmoji}</span> {title}
          </h2>
          <p className="text-xs text-amber-300 font-bold mt-0.5">{commentary}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-xl bg-black/25 p-1 text-xs font-bold">
            <button
              type="button"
              disabled={racing}
              onClick={() => setSpeedMode('DRAMA')}
              className={`px-2.5 py-1.5 rounded-lg transition ${
                speedMode === 'DRAMA' ? 'bg-indigo-500 text-white' : 'opacity-80'
              }`}
            >
              Hồi hộp (17s)
            </button>
            <button
              type="button"
              disabled={racing}
              onClick={() => setSpeedMode('FAST')}
              className={`px-2.5 py-1.5 rounded-lg transition ${
                speedMode === 'FAST' ? 'bg-indigo-500 text-white' : 'opacity-80'
              }`}
            >
              Nhanh (7s)
            </button>
          </div>

          <div className="flex rounded-xl bg-black/25 p-1 text-xs font-bold">
            <button
              type="button"
              disabled={racing}
              onClick={() => setPickMode('FIRST')}
              className={`px-3 py-1.5 rounded-lg transition ${
                pickMode === 'FIRST' ? 'bg-amber-400 text-slate-950' : 'opacity-80'
              }`}
            >
              Về Nhất lên bảng
            </button>
            <button
              type="button"
              disabled={racing}
              onClick={() => setPickMode('LAST')}
              className={`px-3 py-1.5 rounded-lg transition ${
                pickMode === 'LAST' ? 'bg-rose-500 text-white' : 'opacity-80'
              }`}
            >
              Về Chót lên bảng
            </button>
          </div>

          {students.length > 14 && (
            <button
              type="button"
              disabled={racing}
              onClick={() => setSampleSeed((s) => s + 1)}
              className="px-3 py-2 rounded-xl bg-white/15 hover:bg-white/25 text-xs font-bold flex items-center gap-1 disabled:opacity-40"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Đổi lượt người
            </button>
          )}

          <button
            type="button"
            disabled={racing || laneStudents.length === 0}
            onClick={startRace}
            className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-300 hover:to-orange-400 text-slate-950 font-black text-sm flex items-center gap-2 shadow-lg disabled:opacity-40"
          >
            <Flag className="w-4 h-4" />
            {racing ? 'Đang đua...' : 'XUẤT PHÁT!'}
          </button>
        </div>
      </div>

      {/* Race Track */}
      <div
        className={`flex-1 rounded-3xl border border-white/15 p-4 relative overflow-hidden flex flex-col justify-center gap-2 ${trackBgClass}`}
      >
        {/* 3 - 2 - 1 Countdown Overlay */}
        {countdownText && (
          <div className="absolute inset-0 z-30 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center">
            <div
              key={countdownText}
              className="text-7xl sm:text-8xl font-black text-amber-400 drop-shadow-[0_6px_25px_rgba(251,191,36,0.7)] animate-countdown-pop"
            >
              {countdownText}
            </div>
          </div>
        )}

        {/* Finish Line */}
        <div
          className="absolute top-0 bottom-0 right-10 w-3.5 opacity-85 pointer-events-none"
          style={{
            backgroundImage:
              'repeating-linear-gradient(0deg, #fff 0px, #fff 10px, #0f172a 10px, #0f172a 20px)',
          }}
        />

        {racers.length === 0 ? (
          <div className="text-center py-12 font-bold opacity-75">
            Chưa có sinh viên khả dụng trong danh sách.
          </div>
        ) : (
          racers.map((r) => {
            const rank = rankMap.get(r.student.id);
            return (
              <div
                key={r.student.id}
                className={`relative h-11 rounded-xl border px-3 flex items-center ${laneBgClass} ${
                  rank === 1 ? 'ring-1 ring-amber-400/60 bg-amber-400/10' : ''
                }`}
              >
                <div className="w-40 sm:w-48 truncate text-xs font-bold z-10 pr-2 flex items-center gap-1.5 drop-shadow">
                  {rank && rank <= 3 && (
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-black shrink-0 ${
                        rank === 1
                          ? 'bg-amber-400 text-slate-950'
                          : rank === 2
                            ? 'bg-slate-200 text-slate-900'
                            : 'bg-orange-500 text-white'
                      }`}
                    >
                      #{rank}
                    </span>
                  )}
                  <span className="truncate">{r.student.name}</span>
                </div>

                <div className="flex-1 relative h-full flex items-center mr-8">
                  <div
                    className="absolute flex items-center gap-1 transition-none"
                    style={{ left: `calc(${r.progress}% - 24px)` }}
                  >
                    {r.boosting && (
                      <span className="text-[10px] font-black text-amber-300 flex items-center animate-pulse bg-black/40 px-1.5 py-0.5 rounded-full">
                        <Zap className="w-3 h-3" /> {trailEmoji}
                      </span>
                    )}
                    <GameAvatarBadge avatarId={r.student.avatarId} streak={r.boosting ? 2 : 0} size="sm" />
                    <span className="text-2xl leading-none drop-shadow-md">{racerEmoji}</span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
