import React, { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Download,
  Maximize2,
  Minimize2,
  Palette,
  RotateCcw,
  Star,
  UserX,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { ConfettiBurst } from '../components/game/ConfettiBurst';
import { GameAvatarBadge } from '../components/game/GameAvatarBadge';
import { playWinnerFanfare, unlockGameAudio } from '../utils/gameAudio';
import { MinigameErrorBoundary } from './MinigameErrorBoundary';
import { MINIGAME_REGISTRY } from './registry';
import {
  exportMinigameHistoryXlsx,
  readMinigameStore,
  subscribeMinigameSync,
  writeMinigameStore,
} from './rosterStorage';
import type { MinigameStateStore, RosterStudent, StageTheme } from './types';

const THEME_CLASSES: Record<StageTheme, string> = {
  NEON: 'bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-950 text-white',
  SUNNY: 'bg-gradient-to-br from-sky-50 via-amber-50 to-indigo-50 text-slate-900',
  GOLD: 'bg-gradient-to-br from-slate-950 via-slate-900 to-amber-950 text-amber-50',
};

function speakVietnameseName(name: string): void {
  try {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(`Xin mời bạn ${name}`);
    const voices = window.speechSynthesis.getVoices();
    const viVoice = voices.find((v) => v.lang.toLowerCase().startsWith('vi'));
    if (viVoice) {
      utter.voice = viVoice;
      utter.lang = viVoice.lang;
    } else {
      utter.lang = 'vi-VN';
    }
    utter.rate = 1.0;
    window.speechSynthesis.speak(utter);
  } catch {
    // Graceful fallback when TTS unsupported
  }
}

export const MinigameStageLayout: React.FC = () => {
  const { gameId } = useParams<{ gameId: string }>();
  const plugin = useMemo(
    () => MINIGAME_REGISTRY.find((g) => g.id === gameId) ?? MINIGAME_REGISTRY[0],
    [gameId],
  );

  const [store, setStore] = useState<MinigameStateStore>(() => readMinigameStore());
  const [theme, setTheme] = useState<StageTheme>('NEON');
  const [muted, setMuted] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [winner, setWinner] = useState<RosterStudent | null>(null);
  const [confetti, setConfetti] = useState(false);

  useEffect(() => {
    const unsub = subscribeMinigameSync(() => {
      setStore(readMinigameStore());
    });
    const onFs = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFs);
    return () => {
      unsub();
      document.removeEventListener('fullscreenchange', onFs);
    };
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      void document.documentElement.requestFullscreen().catch(() => {});
    } else {
      void document.exitFullscreen().catch(() => {});
    }
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'f' || e.key === 'F') toggleFullscreen();
      if (e.key === 'm' || e.key === 'M') setMuted((m) => !m);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggleFullscreen]);

  const availableStudents = useMemo(
    () =>
      store.students.filter(
        (s) => !s.absent && (!store.excludeCalled || !s.called),
      ),
    [store.students, store.excludeCalled],
  );

  const updateStore = (next: MinigameStateStore) => {
    setStore(next);
    writeMinigameStore(next);
  };

  const handlePickStudent = (student: RosterStudent) => {
    void unlockGameAudio();
    setWinner(student);
    setConfetti(true);
    if (!muted) playWinnerFanfare();
    if (voiceEnabled && !muted) speakVietnameseName(student.name);
    window.setTimeout(() => setConfetti(false), 3800);

    const nextStudents = store.students.map((s) =>
      s.id === student.id ? { ...s, called: true } : s,
    );
    const nextHistory = [
      {
        id: `hist_${Date.now().toString(36)}`,
        studentId: student.id,
        studentName: student.name,
        studentCode: student.studentCode,
        gameId: plugin.id,
        gameName: plugin.name,
        bonusAwarded: 0,
        status: 'PICKED' as const,
        at: new Date().toISOString(),
      },
      ...store.history,
    ].slice(0, 500);

    updateStore({ ...store, students: nextStudents, history: nextHistory });
  };

  const handleAwardWinner = (pts: number) => {
    if (!winner) return;
    const nextStudents = store.students.map((s) =>
      s.id === winner.id ? { ...s, bonusPoints: s.bonusPoints + pts } : s,
    );
    const nextHistory = [...store.history];
    if (nextHistory[0] && nextHistory[0].studentId === winner.id) {
      nextHistory[0] = { ...nextHistory[0], bonusAwarded: nextHistory[0].bonusAwarded + pts };
    }
    updateStore({ ...store, students: nextStudents, history: nextHistory });
    setWinner(null);
  };

  const handleMarkWinnerAbsent = () => {
    if (!winner) return;
    const nextStudents = store.students.map((s) =>
      s.id === winner.id ? { ...s, absent: true, called: false } : s,
    );
    const nextHistory = [...store.history];
    if (nextHistory[0] && nextHistory[0].studentId === winner.id) {
      nextHistory[0] = { ...nextHistory[0], status: 'ABSENT' };
    }
    updateStore({ ...store, students: nextStudents, history: nextHistory });
    setWinner(null);
  };

  const handleResetCalls = () => {
    const nextStudents = store.students.map((s) => ({
      ...s,
      called: false,
      absent: false,
    }));
    updateStore({ ...store, students: nextStudents });
  };

  const GameComponent = plugin.component;

  return (
    <div className={`min-h-screen flex flex-col transition-colors duration-300 ${THEME_CLASSES[theme]}`}>
      <ConfettiBurst active={confetti} />

      {/* Top Stage Bar */}
      <header className="px-4 sm:px-6 py-3 border-b border-white/10 backdrop-blur-md bg-black/15 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            to="/admin"
            className="p-2 rounded-xl bg-white/10 hover:bg-white/20 transition shrink-0"
            title="Quay về Tab 7"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="min-w-0">
            <div className="text-[11px] font-bold uppercase tracking-wider opacity-75 truncate">
              {store.activePresetName} • Còn {availableStudents.length}/{store.students.length} sinh viên
            </div>
            <h1 className="font-black text-base sm:text-lg flex items-center gap-2 truncate">
              <span>{plugin.icon}</span>
              <span>{plugin.name}</span>
            </h1>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="px-3 py-1.5 rounded-xl bg-white/10 text-xs font-bold flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={store.excludeCalled}
              onChange={(e) => updateStore({ ...store, excludeCalled: e.target.checked })}
              className="accent-amber-400"
            />
            Không gọi trùng
          </label>

          <button
            type="button"
            onClick={handleResetCalls}
            className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-bold flex items-center gap-1"
            title="Khôi phục toàn bộ danh sách chưa gọi"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Reset
          </button>

          <button
            type="button"
            onClick={() =>
              setTheme((t) => (t === 'NEON' ? 'SUNNY' : t === 'SUNNY' ? 'GOLD' : 'NEON'))
            }
            className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-bold flex items-center gap-1"
            title="Đổi giao diện sân khấu"
          >
            <Palette className="w-3.5 h-3.5" />
            {theme === 'NEON' ? 'Đêm Gala' : theme === 'SUNNY' ? 'Sáng' : 'VNE Gold'}
          </button>

          <button
            type="button"
            onClick={() => setVoiceEnabled((v) => !v)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
              voiceEnabled ? 'bg-amber-400 text-slate-950' : 'bg-white/10 hover:bg-white/20'
            }`}
            title="Đọc to tên sinh viên bằng giọng nói"
          >
            🗣️ {voiceEnabled ? 'Đọc tên: Bật' : 'Đọc tên: Tắt'}
          </button>

          <button
            type="button"
            onClick={() => {
              void unlockGameAudio();
              setMuted((m) => !m);
            }}
            className="p-2 rounded-xl bg-white/10 hover:bg-white/20"
            title={muted ? 'Bật âm (M)' : 'Tắt âm (M)'}
          >
            {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>

          <button
            type="button"
            onClick={() =>
              exportMinigameHistoryXlsx(store.students, store.history, store.activePresetName)
            }
            className="px-3 py-1.5 rounded-xl bg-emerald-500/85 hover:bg-emerald-400 text-slate-950 text-xs font-black flex items-center gap-1"
          >
            <Download className="w-3.5 h-3.5" /> Excel
          </button>

          <button
            type="button"
            onClick={toggleFullscreen}
            className="p-2 rounded-xl bg-white/10 hover:bg-white/20"
            title="Toàn màn hình (F)"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </header>

      {/* Main Game Stage */}
      <main className="flex-1 flex flex-col">
        <MinigameErrorBoundary>
          <Suspense
            fallback={
              <div className="flex-1 flex items-center justify-center font-bold text-lg">
                Đang tải trò chơi {plugin.name}...
              </div>
            }
          >
            <GameComponent
              students={availableStudents}
              allStudents={store.students}
              muted={muted}
              theme={theme}
              onPickStudent={handlePickStudent}
            />
          </Suspense>
        </MinigameErrorBoundary>
      </main>

      {/* Spotlight Winner Modal */}
      {winner && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-gradient-to-b from-slate-900 to-indigo-950 border-2 border-amber-400/60 text-white rounded-3xl max-w-lg w-full p-8 text-center shadow-2xl space-y-5 animate-bounce-once">
            <div className="text-xs font-black uppercase tracking-[0.2em] text-amber-300">
              🎉 Xin chúc mừng sinh viên được chọn!
            </div>

            <div className="flex justify-center">
              <GameAvatarBadge avatarId={winner.avatarId} streak={3} size="lg" />
            </div>

            <div>
              <div
                className="font-black leading-tight text-white"
                style={{ fontSize: 'clamp(1.85rem, 4.5vw, 3.25rem)' }}
              >
                {winner.name}
              </div>
              {winner.studentCode && (
                <div className="text-base font-mono font-bold text-indigo-300 mt-1">
                  MSSV: {winner.studentCode}
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-center gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => handleAwardWinner(1)}
                className="px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-sm flex items-center gap-1.5"
              >
                <Star className="w-4 h-4 fill-current" /> +1 Điểm (Đạt)
              </button>
              <button
                type="button"
                onClick={() => handleAwardWinner(2)}
                className="px-4 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-sm flex items-center gap-1.5"
              >
                <Star className="w-4 h-4 fill-current" /> +2 Điểm (Xuất sắc)
              </button>
              <button
                type="button"
                onClick={handleMarkWinnerAbsent}
                className="px-4 py-2.5 rounded-xl bg-rose-500/25 border border-rose-400/40 hover:bg-rose-500/40 text-rose-100 font-bold text-sm flex items-center gap-1.5"
              >
                <UserX className="w-4 h-4" /> Vắng (Quay lại)
              </button>
            </div>

            <button
              type="button"
              onClick={() => setWinner(null)}
              className="text-xs text-slate-300 hover:text-white underline pt-1"
            >
              Đóng &amp; Tiếp tục
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default MinigameStageLayout;
