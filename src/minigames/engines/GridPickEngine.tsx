import React, { useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { playBalloonPop, playDrumroll, unlockGameAudio } from '../../utils/gameAudio';
import { cryptoShuffle } from '../rosterStorage';
import { useMinigameStageSettings } from '../stageContext';
import type { RosterStudent } from '../types';

export interface GridPickEngineProps {
  students: RosterStudent[];
  muted: boolean;
  title: string;
  itemEmoji: string;
  openedEmoji: string;
  cardGradient: string;
  smashEffect?: boolean;
  floating?: boolean;
  onPickStudent: (student: RosterStudent) => void;
}

export const GridPickEngine: React.FC<GridPickEngineProps> = ({
  students,
  muted,
  title,
  itemEmoji,
  openedEmoji,
  cardGradient,
  smashEffect = false,
  floating = false,
  onPickStudent,
}) => {
  const { paceMode } = useMinigameStageSettings();
  const [shuffleKey, setShuffleKey] = useState(0);
  const [openedIds, setOpenedIds] = useState<Record<string, boolean>>({});
  const [pendingItem, setPendingItem] = useState<{ stu: RosterStudent; num: number } | null>(null);
  const [shaking, setShaking] = useState(false);

  const cards = useMemo(() => {
    const shuffled = cryptoShuffle(students);
    return shuffled.slice(0, 24);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [students, shuffleKey]);

  useEffect(() => {
    setOpenedIds({});
    setPendingItem(null);
  }, [shuffleKey]);

  const handleOpen = (stu: RosterStudent, num: number) => {
    if (openedIds[stu.id] || pendingItem) return;
    void unlockGameAudio();
    const waitMs = paceMode === 'EPIC' ? 5200 : paceMode === 'NORMAL' ? 3200 : 1600;
    setPendingItem({ stu, num });
    if (!muted) playDrumroll(waitMs - 100);

    window.setTimeout(() => {
      setPendingItem(null);
      setOpenedIds((prev) => ({ ...prev, [stu.id]: true }));
      if (smashEffect) {
        if (!muted) playBalloonPop();
        setShaking(true);
        window.setTimeout(() => setShaking(false), 260);
      }
      onPickStudent(stu);
    }, waitMs);
  };

  return (
    <div
      className={`flex-1 flex flex-col gap-5 p-4 max-w-6xl w-full mx-auto relative transition-transform ${
        shaking ? 'translate-x-1.5 -translate-y-1.5' : ''
      }`}
    >
      {/* Center-Stage Suspense Zoom Overlay (2.2s) */}
      {pendingItem && (
        <div className="fixed inset-0 z-40 bg-slate-950/75 backdrop-blur-sm flex flex-col items-center justify-center gap-6 pointer-events-auto">
          <div className="relative flex items-center justify-center">
            <div
              className="w-72 h-72 rounded-full opacity-45 animate-sunburst"
              style={{
                background:
                  'conic-gradient(from 0deg, transparent 0deg 20deg, rgba(251,191,36,0.55) 20deg 40deg, transparent 40deg 60deg, rgba(251,191,36,0.55) 60deg 80deg, transparent 80deg 100deg, rgba(251,191,36,0.55) 100deg 120deg, transparent 120deg 140deg, rgba(251,191,36,0.55) 140deg 160deg, transparent 160deg 180deg, rgba(251,191,36,0.55) 180deg 200deg, transparent 200deg 220deg, rgba(251,191,36,0.55) 220deg 240deg, transparent 240deg 260deg, rgba(251,191,36,0.55) 260deg 280deg, transparent 280deg 300deg, rgba(251,191,36,0.55) 300deg 320deg, transparent 320deg 340deg, rgba(251,191,36,0.55) 340deg 360deg)',
              }}
            />
            <div
              className={`absolute w-40 h-40 rounded-3xl bg-gradient-to-br ${cardGradient} border-4 border-amber-300 shadow-[0_0_50px_rgba(251,191,36,0.7)] flex flex-col items-center justify-center gap-1 animate-wobble-suspense`}
            >
              <span className="text-7xl drop-shadow-lg">{itemEmoji}</span>
              <span className="text-sm font-black px-3 py-0.5 rounded-full bg-black/40 text-white">
                #{pendingItem.num}
              </span>
            </div>
          </div>
          <div className="text-2xl font-black text-amber-300 tracking-wider animate-pulse">
            {smashEffect ? 'CHUẨN BỊ NỔ...' : 'ĐANG MỞ KẾT QUẢ...'}
          </div>
        </div>
      )}

      <div className="bg-white/10 backdrop-blur-md border border-white/15 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-black text-base sm:text-lg flex items-center gap-2">
            <span>{itemEmoji}</span> {title}
          </h2>
          <p className="text-xs opacity-75">
            Chạm vào một ô bất kỳ để mở tên sinh viên ngẫu nhiên ({cards.length} ô đang hiển thị)
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShuffleKey((k) => k + 1)}
          className="px-4 py-2 rounded-xl bg-white/15 hover:bg-white/25 text-xs font-bold flex items-center gap-1.5"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Xáo trộn lại bảng
        </button>
      </div>

      {cards.length === 0 ? (
        <div className="flex-1 flex items-center justify-center font-bold opacity-75">
          Chưa có sinh viên khả dụng.
        </div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3.5 flex-1 content-center">
          {cards.map((stu, idx) => {
            const opened = Boolean(openedIds[stu.id]);
            return (
              <button
                key={stu.id}
                type="button"
                disabled={opened || Boolean(pendingItem)}
                onClick={() => handleOpen(stu, idx + 1)}
                className={`group relative overflow-hidden aspect-square rounded-3xl border border-white/25 flex flex-col items-center justify-center gap-1.5 p-2 shadow-xl transition-all duration-300 ${
                  opened
                    ? 'bg-slate-900/70 scale-95 opacity-80'
                    : `bg-gradient-to-br ${cardGradient} hover:scale-105 active:scale-95 hover:shadow-2xl ${
                        floating ? 'animate-bounce' : ''
                      }`
                }`}
                style={
                  floating && !opened
                    ? { animationDuration: `${2.2 + (idx % 4) * 0.4}s` }
                    : undefined
                }
              >
                {!opened && (
                  <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                )}
                <span className="text-4xl sm:text-5xl drop-shadow-md">
                  {opened ? openedEmoji : itemEmoji}
                </span>
                {opened ? (
                  <span className="text-xs font-black text-amber-300 text-center line-clamp-2">
                    {stu.name}
                  </span>
                ) : (
                  <span className="text-sm font-black px-2.5 py-0.5 rounded-full bg-black/25">
                    #{idx + 1}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
