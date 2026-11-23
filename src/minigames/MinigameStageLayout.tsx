import React, { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  BookOpen,
  Download,
  Eye,
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
import { useExamPlatform } from '../context/ExamContext';
import { ADMIN_TOKEN_KEY } from '../services/apiClient';
import type { Question } from '../types/exam';
import {
  evaluateFormula,
  generateSeedVarsForQuestion,
  interpolateText,
} from '../utils/dynamicQuestionEngine';
import { playWinnerFanfare, unlockGameAudio } from '../utils/gameAudio';
import { MinigameErrorBoundary } from './MinigameErrorBoundary';
import { MINIGAME_REGISTRY } from './registry';
import {
  cryptoRandomInt,
  exportMinigameHistoryXlsx,
  readMinigameStore,
  subscribeMinigameSync,
  writeMinigameStore,
} from './rosterStorage';
import { MinigameStageContext, PACE_META, type PaceMode } from './stageContext';
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
  const [searchParams] = useSearchParams();
  const backUrl =
    searchParams.get('from') === 'admin'
      ? '/admin?tab=LIVE_GAME&sub=MINIGAME'
      : '/minigame';
  const plugin = useMemo(
    () => MINIGAME_REGISTRY.find((g) => g.id === gameId) ?? MINIGAME_REGISTRY[0],
    [gameId],
  );

  const { courses, questions } = useExamPlatform();
  const isInstructor = Boolean(
    typeof window !== 'undefined' && sessionStorage.getItem(ADMIN_TOKEN_KEY),
  );

  const [store, setStore] = useState<MinigameStateStore>(() => readMinigameStore());
  const [theme, setTheme] = useState<StageTheme>('NEON');
  const [paceMode, setPaceMode] = useState<PaceMode>('EPIC');
  const [render3D, setRender3D] = useState(true);
  const [muted, setMuted] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [winner, setWinner] = useState<RosterStudent | null>(null);
  const [confetti, setConfetti] = useState(false);
  const [pickedQuestion, setPickedQuestion] = useState<{
    question: Question;
    renderedContent: string;
    renderedOptions: Array<{ id: string; text: string; isCorrect: boolean }>;
    renderedExpected: string;
  } | null>(null);
  const [revealAnswer, setRevealAnswer] = useState(false);

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
    setPickedQuestion(null);
    setRevealAnswer(false);
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

  const handleOpenBankQuestion = () => {
    if (!isInstructor || questions.length === 0) return;
    const pool = store.courseId
      ? questions.filter((q) => q.courseId === store.courseId)
      : questions;
    const activePool = pool.length > 0 ? pool : questions;
    const q = activePool[cryptoRandomInt(activePool.length)];
    const vars = generateSeedVarsForQuestion(q, 'MINIGAME_STAGE', String(Date.now()));
    const renderedContent = interpolateText(q.content, vars);
    const renderedOptions = (q.options ?? []).map((o) => ({
      id: o.id,
      text: interpolateText(o.text, vars),
      isCorrect: (q.correctOptionIds ?? []).includes(o.id),
    }));
    let renderedExpected = '';
    if (q.type === 'NUMERICAL' && q.numericalFormula) {
      const val = Math.round(evaluateFormula(q.numericalFormula, vars) * 1000) / 1000;
      renderedExpected = `${val} ${q.numericalUnit ?? ''}`.trim();
    } else if (q.type === 'TRUE_FALSE' && q.trueFalseItems) {
      renderedExpected = q.trueFalseItems
        .map((it, idx) => `${idx + 1}. ${interpolateText(it.statement, vars)} → ${it.answer ? 'ĐÚNG' : 'SAI'}`)
        .join(' | ');
    } else if (q.sampleAnswer) {
      renderedExpected = interpolateText(q.sampleAnswer, vars);
    }
    setPickedQuestion({ question: q, renderedContent, renderedOptions, renderedExpected });
    setRevealAnswer(false);
  };

  const GameComponent = plugin.component;

  return (
    <div className={`min-h-screen flex flex-col transition-colors duration-300 ${THEME_CLASSES[theme]}`}>
      <ConfettiBurst active={confetti} />

      {/* Top Stage Bar */}
      <header className="px-4 sm:px-6 py-3 border-b border-white/10 backdrop-blur-md bg-black/15 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            to={backUrl}
            className="p-2 rounded-xl bg-white/10 hover:bg-white/20 transition shrink-0 flex items-center gap-1.5 text-xs font-bold"
            title="Quay về Danh sách Minigame"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Danh sách Game</span>
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
              setPaceMode((p) => (p === 'EPIC' ? 'NORMAL' : p === 'NORMAL' ? 'FAST' : 'EPIC'))
            }
            className={`px-3 py-1.5 rounded-xl text-xs font-black transition flex items-center gap-1 ${
              paceMode === 'EPIC'
                ? 'bg-gradient-to-r from-rose-500 to-amber-500 text-slate-950 shadow-lg shadow-amber-500/25'
                : 'bg-white/10 hover:bg-white/20'
            }`}
            title={`Nhịp độ hiện tại: ${PACE_META[paceMode].label} (bấm để đổi)`}
          >
            {PACE_META[paceMode].shortLabel}
          </button>

          <button
            type="button"
            onClick={() => setRender3D((v) => !v)}
            className={`px-3 py-1.5 rounded-xl text-xs font-black transition ${
              render3D
                ? 'bg-cyan-400 text-slate-950 shadow-lg shadow-cyan-500/25'
                : 'bg-white/10 hover:bg-white/20'
            }`}
            title="Chuyển đổi chế độ đồ họa WebGL 3D / 2D nhẹ"
          >
            {render3D ? '🧊 3D' : '🖼️ 2D'}
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
            <MinigameStageContext.Provider value={{ paceMode, render3D, theme }}>
              <GameComponent
                students={availableStudents}
                allStudents={store.students}
                muted={muted}
                theme={theme}
                onPickStudent={handlePickStudent}
              />
            </MinigameStageContext.Provider>
          </Suspense>
        </MinigameErrorBoundary>
      </main>

      {/* Spotlight Winner Modal */}
      {winner && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 overflow-hidden">
          <div
            className="absolute w-[620px] h-[620px] rounded-full opacity-25 pointer-events-none animate-sunburst"
            style={{
              background:
                'conic-gradient(from 0deg, transparent 0deg 18deg, rgba(251,191,36,0.5) 18deg 36deg, transparent 36deg 54deg, rgba(251,191,36,0.5) 54deg 72deg, transparent 72deg 90deg, rgba(251,191,36,0.5) 90deg 108deg, transparent 108deg 126deg, rgba(251,191,36,0.5) 126deg 144deg, transparent 144deg 162deg, rgba(251,191,36,0.5) 162deg 180deg, transparent 180deg 198deg, rgba(251,191,36,0.5) 198deg 216deg, transparent 216deg 234deg, rgba(251,191,36,0.5) 234deg 252deg, transparent 252deg 270deg, rgba(251,191,36,0.5) 270deg 288deg, transparent 288deg 306deg, rgba(251,191,36,0.5) 306deg 324deg, transparent 324deg 342deg, rgba(251,191,36,0.5) 342deg 360deg)',
            }}
          />
          <div className="relative z-10 bg-gradient-to-b from-slate-900 to-indigo-950 border-2 border-amber-400/70 text-white rounded-3xl max-w-2xl w-full max-h-[90dvh] overflow-y-auto p-6 sm:p-8 text-center shadow-[0_0_60px_rgba(251,191,36,0.3)] space-y-5">
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

            {/* Optional Instructor Question Bank Drawer */}
            {isInstructor && questions.length > 0 && (
              <div className="pt-1 space-y-3 text-left">
                {!pickedQuestion ? (
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    {courses.length > 1 && (
                      <select
                        value={store.courseId}
                        onChange={(e) => updateStore({ ...store, courseId: e.target.value })}
                        className="px-3 py-2 rounded-xl bg-white/10 border border-white/20 text-xs font-bold text-white"
                      >
                        <option value="" className="text-slate-900">
                          Tất cả học phần
                        </option>
                        {courses.map((c) => (
                          <option key={c.id} value={c.id} className="text-slate-900">
                            {c.code} — {c.name}
                          </option>
                        ))}
                      </select>
                    )}
                    <button
                      type="button"
                      onClick={handleOpenBankQuestion}
                      className="px-4 py-2 rounded-xl bg-indigo-500/30 hover:bg-indigo-500/50 border border-indigo-400/50 text-indigo-100 font-bold text-xs flex items-center gap-1.5"
                    >
                      <BookOpen className="w-4 h-4" /> Mở câu hỏi Ngân hàng đề
                    </button>
                  </div>
                ) : (
                  <div className="bg-white/10 border border-white/20 rounded-2xl p-4 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-black uppercase tracking-wider text-amber-300">
                        Câu hỏi phỏng vấn nhanh
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={handleOpenBankQuestion}
                          className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-white/15 hover:bg-white/25"
                        >
                          Đổi câu khác
                        </button>
                        <button
                          type="button"
                          onClick={() => setRevealAnswer((r) => !r)}
                          className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-amber-400 text-slate-950 flex items-center gap-1"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          {revealAnswer ? 'Ẩn đáp án' : 'Hiện đáp án'}
                        </button>
                      </div>
                    </div>

                    <p className="font-bold text-sm sm:text-base whitespace-pre-line">
                      {pickedQuestion.renderedContent}
                    </p>

                    {pickedQuestion.renderedOptions.length > 0 && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {pickedQuestion.renderedOptions.map((o, idx) => (
                          <div
                            key={o.id}
                            className={`px-3 py-2 rounded-xl text-xs font-semibold border ${
                              revealAnswer && o.isCorrect
                                ? 'bg-emerald-500/30 border-emerald-400 text-emerald-100'
                                : 'bg-black/25 border-white/10 text-slate-200'
                            }`}
                          >
                            <span className="font-black mr-1.5">
                              {String.fromCharCode(65 + idx)}.
                            </span>
                            {o.text}
                          </div>
                        ))}
                      </div>
                    )}

                    {revealAnswer && pickedQuestion.renderedExpected && (
                      <div className="p-2.5 rounded-xl bg-emerald-500/20 border border-emerald-400/40 text-emerald-200 text-xs font-bold">
                        Đáp án: {pickedQuestion.renderedExpected}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

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
