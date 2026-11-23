import React, { useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { playBalloonPop, playDrumroll, unlockGameAudio } from '../../utils/gameAudio';
import { cryptoShuffle } from '../rosterStorage';
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
  const [shuffleKey, setShuffleKey] = useState(0);
  const [openedIds, setOpenedIds] = useState<Record<string, boolean>>({});
  const [shaking, setShaking] = useState(false);

  const cards = useMemo(() => {
    const shuffled = cryptoShuffle(students);
    return shuffled.slice(0, 24);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [students, shuffleKey]);

  useEffect(() => {
    setOpenedIds({});
  }, [shuffleKey]);

  const handleOpen = (stu: RosterStudent) => {
    if (openedIds[stu.id]) return;
    void unlockGameAudio();

    if (smashEffect) {
      if (!muted) playBalloonPop();
      setShaking(true);
      window.setTimeout(() => setShaking(false), 220);
      setOpenedIds((prev) => ({ ...prev, [stu.id]: true }));
      onPickStudent(stu);
    } else {
      if (!muted) playDrumroll(450);
      setOpenedIds((prev) => ({ ...prev, [stu.id]: true }));
      window.setTimeout(() => {
        onPickStudent(stu);
      }, 460);
    }
  };

  return (
    <div
      className={`flex-1 flex flex-col gap-5 p-4 max-w-6xl w-full mx-auto transition-transform ${
        shaking ? 'translate-x-1 -translate-y-1' : ''
      }`}
    >
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
                disabled={opened}
                onClick={() => handleOpen(stu)}
                className={`aspect-square rounded-3xl border border-white/20 flex flex-col items-center justify-center gap-1.5 p-2 shadow-xl transition-all duration-300 ${
                  opened
                    ? 'bg-slate-900/70 scale-95 opacity-80'
                    : `bg-gradient-to-br ${cardGradient} hover:scale-105 active:scale-95 ${
                        floating ? 'animate-bounce' : ''
                      }`
                }`}
                style={
                  floating && !opened
                    ? { animationDuration: `${2.2 + (idx % 4) * 0.4}s` }
                    : undefined
                }
              >
                <span className="text-4xl sm:text-5xl drop-shadow">
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
