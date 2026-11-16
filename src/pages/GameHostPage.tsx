import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import * as XLSX from 'xlsx';
import {
  ArrowLeft,
  ArrowRight,
  Award,
  CheckCircle2,
  Copy,
  Download,
  Flame,
  Lock,
  Play,
  SkipForward,
  Trophy,
  Unlock,
  Users,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import {
  advanceGameState,
  fetchGameHostView,
  kickGamePlayer,
  pollGameStatus,
  subscribeLocalGameUpdates,
  toggleGameLock,
} from '../services/gameApi';
import { GAME_OPTION_STYLES, type GameHostView, type GameQuestionSnapshot } from '../types/game';
import { playPodiumSound, playRevealSound, playTickSound } from '../utils/gameAudio';

function getQuestionTypeBadge(q: GameQuestionSnapshot | null): string {
  if (!q) return '';
  if (q.type === 'SINGLE_CHOICE') return 'CHỌN 1 ĐÁP ÁN';
  if (q.type === 'MULTI_CHOICE') return 'CHỌN NHIỀU ĐÁP ÁN';
  if (q.type === 'TRUE_FALSE') {
    return (q.trueFalseItems?.length ?? 0) > 1 ? 'ĐÚNG / SAI (NHIỀU Ý)' : 'ĐÚNG HAY SAI';
  }
  if (q.type === 'NUMERICAL') return 'NHẬP ĐÁP ÁN SỐ';
  if (q.type === 'ESSAY') return 'GÕ TỪ KHÓA NHANH';
  return q.type;
}

export const GameHostPage: React.FC = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [view, setView] = useState<GameHostView | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [muted, setMuted] = useState(false);
  const mutedRef = useRef(false);
  mutedRef.current = muted;
  const [nowMs, setNowMs] = useState(Date.now());
  const clockOffsetRef = useRef(0);
  const lastVersionRef = useRef<number>(-1);
  const lastCountsRef = useRef<string>('');
  const advancingRef = useRef(false);
  const lastBeepSecRef = useRef<number>(-1);
  const lastSoundStateRef = useRef<string>('');

  const loadHostView = useCallback(async () => {
    if (!sessionId) return;
    const data = await fetchGameHostView(sessionId);
    if (data) {
      clockOffsetRef.current = data.session.serverNowMs - Date.now();
      lastVersionRef.current = data.session.stateVersion;
      lastCountsRef.current = `${data.players.length}:${data.answeredCount}`;
      setView(data);
    }
    setLoading(false);
  }, [sessionId]);

  useEffect(() => {
    void loadHostView();
  }, [loadHostView]);

  // Poll + BroadcastChannel subscription
  useEffect(() => {
    if (!sessionId) return;
    const unsub = subscribeLocalGameUpdates((updatedId) => {
      if (updatedId === sessionId || updatedId === '*') {
        void loadHostView();
      }
    });

    const interval = window.setInterval(async () => {
      if (!view?.session.gamePin) return;
      const poll = await pollGameStatus(view.session.gamePin);
      if (!poll) return;
      clockOffsetRef.current = poll.now - Date.now();
      const countKey = `${poll.pc}:${poll.ac}`;
      if (poll.v !== lastVersionRef.current || countKey !== lastCountsRef.current) {
        await loadHostView();
      }
    }, 900);

    return () => {
      unsub();
      window.clearInterval(interval);
    };
  }, [sessionId, view?.session.gamePin, loadHostView]);

  // High-frequency local UI timer & auto-advance
  useEffect(() => {
    const tick = window.setInterval(() => {
      const syncedNow = Date.now() + clockOffsetRef.current;
      setNowMs(syncedNow);

      if (!view || advancingRef.current || !sessionId) return;
      const { state, questionEndsAtMs } = view.session;

      if (!mutedRef.current) {
        const stateKey = `${state}:${view.session.currentQIndex}`;
        if (stateKey !== lastSoundStateRef.current) {
          lastSoundStateRef.current = stateKey;
          if (state === 'QUESTION_RESULT') playRevealSound();
          if (state === 'ENDED') playPodiumSound();
        }
        if (state === 'QUESTION_ACTIVE') {
          const sec = Math.ceil((questionEndsAtMs - syncedNow) / 1000);
          if (sec >= 1 && sec <= 5 && sec !== lastBeepSecRef.current) {
            lastBeepSecRef.current = sec;
            playTickSound();
          }
        } else {
          lastBeepSecRef.current = -1;
        }
      }

      if (state === 'QUESTION_INTRO' && syncedNow >= questionEndsAtMs) {
        advancingRef.current = true;
        void (async () => {
          try {
            await advanceGameState(sessionId);
            await loadHostView();
          } finally {
            advancingRef.current = false;
          }
        })();
      } else if (state === 'QUESTION_ACTIVE') {
        const allAnswered =
          view.players.length > 0 && view.answeredCount >= view.players.length;
        if (syncedNow >= questionEndsAtMs || allAnswered) {
          advancingRef.current = true;
          void (async () => {
            try {
              await advanceGameState(sessionId);
              await loadHostView();
            } finally {
              advancingRef.current = false;
            }
          })();
        }
      }
    }, 150);

    return () => window.clearInterval(tick);
  }, [view, sessionId, loadHostView]);

  const handleNext = async () => {
    if (!sessionId || advancingRef.current) return;
    advancingRef.current = true;
    try {
      await advanceGameState(sessionId);
      await loadHostView();
    } finally {
      advancingRef.current = false;
    }
  };

  const handleCopyJoinLink = () => {
    if (!view) return;
    const url = `${window.location.origin}/play/${view.session.gamePin}`;
    void navigator.clipboard.writeText(url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  const handleExportExcel = () => {
    if (!view) return;
    const rows = view.players.map((p) => ({
      Hang: p.rank,
      Nickname: p.nickname,
      MSSV: p.studentCode || '',
      Doi: p.teamName || '',
      TongDiem: p.score,
      SoCauDung: p.correctCount,
      TongSoCau: view.session.totalQuestions,
      ChuoiDungHienTai: p.streak,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'BangDiemLiveGame');
    XLSX.writeFile(wb, `LiveGame_${view.session.gamePin}.xlsx`);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center text-lg font-bold">
        Đang tải phòng điều khiển Game...
      </div>
    );
  }

  if (!view) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center gap-4 p-6">
        <p className="text-xl font-bold">Không tìm thấy phiên Game.</p>
        <Link to="/admin" className="px-4 py-2 rounded-xl bg-indigo-600 font-bold">
          ← Quay về Trang Quản trị
        </Link>
      </div>
    );
  }

  const { session, currentQuestion, players, answeredCount, optionCounts } = view;
  const totalTimeMs = Math.max(
    1000,
    session.questionEndsAtMs - session.questionStartedAtMs,
  );
  const remainingMs = Math.max(0, session.questionEndsAtMs - nowMs);
  const remainingSec = Math.ceil(remainingMs / 1000);
  const progressPct = Math.max(0, Math.min(100, (remainingMs / totalTimeMs) * 100));

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col">
      {/* Top Bar */}
      <header className="px-6 py-3 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            to="/admin"
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition"
            title="Quay về Admin"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="min-w-0">
            <div className="text-xs font-bold uppercase tracking-wider text-indigo-400">
              VNE Live Arena • PIN: {session.gamePin}
            </div>
            <h1 className="font-bold text-lg truncate">{session.title}</h1>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => setMuted((m) => !m)}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition"
            title={muted ? 'Bật âm thanh' : 'Tắt âm thanh'}
          >
            {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
          {session.totalQuestions > 0 && session.state !== 'LOBBY' && (
            <span className="px-3 py-1.5 rounded-xl bg-slate-800 text-sm font-bold text-slate-200">
              Câu {session.currentQIndex + 1} / {session.totalQuestions}
            </span>
          )}
          <span className="px-3 py-1.5 rounded-xl bg-indigo-500/20 border border-indigo-400/30 text-indigo-200 text-sm font-bold flex items-center gap-1.5">
            <Users className="w-4 h-4" /> {players.length}
          </span>
        </div>
      </header>

      {/* Main Stage */}
      <main className="flex-1 flex flex-col p-6 max-w-6xl w-full mx-auto">
        {session.state === 'LOBBY' && (
          <div className="flex-1 flex flex-col items-center justify-center gap-8">
            <div className="w-full max-w-3xl bg-gradient-to-br from-indigo-900/80 to-violet-900/80 border border-indigo-500/30 rounded-3xl p-8 shadow-2xl flex flex-col sm:flex-row items-center justify-between gap-6">
              <div className="text-center sm:text-left flex-1">
                <div className="text-sm font-bold uppercase tracking-widest text-indigo-200">
                  Truy cập {window.location.origin}/play và nhập Mã PIN
                </div>
                <div className="text-6xl sm:text-7xl font-black tracking-[0.18em] text-amber-300 my-4 select-all">
                  {session.gamePin}
                </div>

                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3 mt-4">
                  <button
                    type="button"
                    onClick={handleCopyJoinLink}
                    className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-sm font-bold flex items-center gap-2 transition"
                  >
                    <Copy className="w-4 h-4" />
                    {copied ? 'Đã sao chép link!' : 'Sao chép link vào nhanh'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void toggleGameLock(session.id).then(loadHostView)}
                    className={`px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition ${
                      session.isLocked
                        ? 'bg-rose-500/30 border border-rose-400/40 text-rose-100'
                        : 'bg-white/10 hover:bg-white/20 text-white'
                    }`}
                  >
                    {session.isLocked ? (
                      <>
                        <Lock className="w-4 h-4" /> Đã khóa phòng
                      </>
                    ) : (
                      <>
                        <Unlock className="w-4 h-4" /> Khóa phòng
                      </>
                    )}
                  </button>
                </div>
              </div>

              <div className="bg-white p-2.5 rounded-2xl shadow-lg shrink-0">
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(`${window.location.origin}/play/${session.gamePin}`)}`}
                  alt={`QR vào phòng ${session.gamePin}`}
                  className="w-36 h-36 rounded-lg"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                  }}
                />
              </div>
            </div>

            {/* Players Grid */}
            <div className="w-full">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-bold text-slate-200 flex items-center gap-2">
                  <Users className="w-5 h-5 text-emerald-400" />
                  Người chơi đã tham gia ({players.length})
                </h2>
                <button
                  type="button"
                  disabled={players.length === 0}
                  onClick={handleNext}
                  className="px-7 py-3.5 rounded-2xl bg-gradient-to-r from-emerald-400 to-teal-500 hover:from-emerald-300 hover:to-teal-400 text-slate-950 font-black text-lg shadow-xl shadow-emerald-500/20 flex items-center gap-2 transition disabled:opacity-40"
                >
                  <Play className="w-5 h-5 fill-current" /> Bắt đầu Game
                </button>
              </div>

              {players.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-700 p-10 text-center text-slate-400">
                  Đang chờ sinh viên nhập mã PIN để vào phòng...
                </div>
              ) : (
                <div className="flex flex-wrap gap-3">
                  {players.map((p) => (
                    <div
                      key={p.id}
                      className="group px-4 py-2.5 rounded-2xl bg-slate-800 border border-slate-700 font-bold text-base flex items-center gap-2"
                    >
                      <span>{p.nickname}</span>
                      {p.teamName && (
                        <span className="text-xs px-2 py-0.5 rounded-md bg-violet-500/25 text-violet-200">
                          {p.teamName}
                        </span>
                      )}
                      {p.studentCode && (
                        <span className="text-xs px-2 py-0.5 rounded-md bg-indigo-500/20 text-indigo-300">
                          {p.studentCode}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => void kickGamePlayer(session.id, p.id).then(loadHostView)}
                        className="opacity-60 hover:opacity-100 text-rose-400 p-0.5"
                        title="Mời ra khỏi phòng"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {session.state === 'QUESTION_INTRO' && currentQuestion && (
          <div className="flex-1 flex flex-col items-center justify-center text-center gap-6">
            <div className="flex items-center gap-3">
              <span className="px-4 py-1.5 rounded-full bg-indigo-500/20 border border-indigo-400/40 text-indigo-200 font-black text-sm tracking-wider">
                {getQuestionTypeBadge(currentQuestion)}
              </span>
              {currentQuestion.isDoublePoints && (
                <span className="px-4 py-1.5 rounded-full bg-amber-400 text-slate-950 font-black text-sm tracking-wider">
                  ★ x2 ĐIỂM CÂU CUỐI
                </span>
              )}
            </div>
            <h2 className="text-3xl sm:text-5xl font-black leading-tight max-w-4xl whitespace-pre-line">
              {currentQuestion.content}
            </h2>
            <div className="text-6xl font-black text-amber-400 mt-4">{remainingSec}</div>
          </div>
        )}

        {(session.state === 'QUESTION_ACTIVE' || session.state === 'QUESTION_RESULT') &&
          currentQuestion && (
            <div className="flex-1 flex flex-col gap-5">
              {/* Timer + Stats Bar */}
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center text-3xl font-black shrink-0">
                  {session.state === 'QUESTION_ACTIVE' ? remainingSec : '0'}
                </div>
                <div className="flex-1 space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider">
                    <span className="text-indigo-300">
                      {getQuestionTypeBadge(currentQuestion)}
                      {currentQuestion.isDoublePoints ? ' • ★ x2 ĐIỂM' : ''}
                    </span>
                    <span className="text-emerald-300">
                      Đã trả lời: {answeredCount} / {players.length}
                    </span>
                  </div>
                  <div className="h-3.5 w-full rounded-full bg-slate-800 overflow-hidden">
                    <div
                      className={`h-full transition-all duration-150 ${
                        remainingSec <= 5
                          ? 'bg-rose-500'
                          : remainingSec <= 10
                            ? 'bg-amber-400'
                            : 'bg-emerald-400'
                      }`}
                      style={{
                        width: `${session.state === 'QUESTION_ACTIVE' ? progressPct : 0}%`,
                      }}
                    />
                  </div>
                </div>

                {session.state === 'QUESTION_ACTIVE' ? (
                  <button
                    type="button"
                    onClick={handleNext}
                    className="px-4 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 font-bold text-sm flex items-center gap-2 shrink-0"
                  >
                    <SkipForward className="w-4 h-4" /> Kết thúc câu
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleNext}
                    className="px-5 py-3 rounded-xl bg-indigo-500 hover:bg-indigo-400 text-white font-black text-sm flex items-center gap-2 shrink-0 shadow-lg"
                  >
                    {session.currentQIndex + 1 >= session.totalQuestions
                      ? 'Xem Bục Vinh Danh'
                      : 'Bảng xếp hạng'}
                    <ArrowRight className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Question Card */}
              <div className="bg-white text-slate-900 rounded-3xl p-6 sm:p-8 shadow-2xl text-center">
                <h2 className="text-2xl sm:text-3xl font-extrabold leading-snug whitespace-pre-line">
                  {currentQuestion.content}
                </h2>
              </div>

              {/* Result Chart (when QUESTION_RESULT) */}
              {session.state === 'QUESTION_RESULT' &&
                (currentQuestion.type === 'SINGLE_CHOICE' ||
                  currentQuestion.type === 'MULTI_CHOICE') &&
                currentQuestion.options && (
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 items-end h-32">
                      {currentQuestion.options.map((opt, idx) => {
                        const style = GAME_OPTION_STYLES[idx % GAME_OPTION_STYLES.length];
                        const count = optionCounts[opt.id] ?? 0;
                        const pct =
                          answeredCount > 0 ? Math.round((count / answeredCount) * 100) : 0;
                        const isRight = (currentQuestion.correctOptionIds ?? []).includes(opt.id);
                        return (
                          <div key={opt.id} className="flex flex-col items-center h-full justify-end">
                            <div className="text-xs font-bold mb-1">
                              {count} {isRight && '✅'}
                            </div>
                            <div className="w-full max-w-[64px] bg-slate-800 rounded-t-lg h-20 flex items-end overflow-hidden">
                              <div
                                className={`w-full ${style.barBg} transition-all duration-500`}
                                style={{ height: `${Math.max(8, pct)}%` }}
                              />
                            </div>
                            <div className="text-xs font-black mt-1">
                              {style.shape} {style.letter}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

              {/* Options Display */}
              {(currentQuestion.type === 'SINGLE_CHOICE' ||
                currentQuestion.type === 'MULTI_CHOICE') &&
                currentQuestion.options && (
                  <div
                    className={`grid gap-3 flex-1 ${
                      currentQuestion.options.length <= 2
                        ? 'grid-cols-1 sm:grid-cols-2'
                        : currentQuestion.options.length <= 4
                          ? 'grid-cols-1 sm:grid-cols-2'
                          : 'grid-cols-1 sm:grid-cols-3'
                    }`}
                  >
                    {currentQuestion.options.map((opt, idx) => {
                      const style = GAME_OPTION_STYLES[idx % GAME_OPTION_STYLES.length];
                      const isRight = (currentQuestion.correctOptionIds ?? []).includes(opt.id);
                      const dimmed = session.state === 'QUESTION_RESULT' && !isRight;
                      return (
                        <div
                          key={opt.id}
                          className={`${style.bg} rounded-2xl p-4 sm:p-5 flex items-center gap-4 shadow-lg transition ${
                            dimmed ? 'opacity-35' : ''
                          } ${
                            session.state === 'QUESTION_RESULT' && isRight
                              ? 'ring-4 ring-white'
                              : ''
                          }`}
                        >
                          <div className="w-12 h-12 rounded-xl bg-black/25 flex items-center justify-center text-2xl font-black shrink-0">
                            {style.shape}
                          </div>
                          <div className="font-bold text-lg sm:text-xl leading-snug flex-1">
                            {opt.text}
                          </div>
                          {session.state === 'QUESTION_RESULT' && isRight && (
                            <CheckCircle2 className="w-8 h-8 text-white shrink-0" />
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

              {currentQuestion.type === 'TRUE_FALSE' && currentQuestion.trueFalseItems && (
                <div className="space-y-3 flex-1">
                  {currentQuestion.trueFalseItems.length === 1 ? (
                    <div className="grid grid-cols-2 gap-4 h-40">
                      {[
                        { label: 'ĐÚNG', val: true, style: GAME_OPTION_STYLES[1] },
                        { label: 'SAI', val: false, style: GAME_OPTION_STYLES[0] },
                      ].map((btn) => {
                        const isRight = currentQuestion.trueFalseItems![0].answer === btn.val;
                        const dimmed = session.state === 'QUESTION_RESULT' && !isRight;
                        return (
                          <div
                            key={btn.label}
                            className={`${btn.style.bg} rounded-3xl flex items-center justify-center gap-4 text-3xl font-black shadow-xl ${
                              dimmed ? 'opacity-30' : ''
                            } ${
                              session.state === 'QUESTION_RESULT' && isRight
                                ? 'ring-4 ring-white'
                                : ''
                            }`}
                          >
                            <span>{btn.style.shape}</span>
                            <span>{btn.label}</span>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {currentQuestion.trueFalseItems.map((it, idx) => (
                        <div
                          key={it.id}
                          className="bg-slate-800 border border-slate-700 rounded-2xl p-4 flex items-center justify-between gap-3"
                        >
                          <div className="font-semibold text-base">
                            <span className="text-indigo-400 font-black mr-2">
                              {String.fromCharCode(97 + idx)})
                            </span>
                            {it.statement}
                          </div>
                          {session.state === 'QUESTION_RESULT' && (
                            <span
                              className={`px-3 py-1 rounded-lg font-black text-xs shrink-0 ${
                                it.answer
                                  ? 'bg-blue-600 text-white'
                                  : 'bg-rose-600 text-white'
                              }`}
                            >
                              {it.answer ? 'ĐÚNG' : 'SAI'}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* NUMERICAL & ESSAY View on Host */}
              {(currentQuestion.type === 'NUMERICAL' || currentQuestion.type === 'ESSAY') && (
                <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4">
                  {session.state === 'QUESTION_ACTIVE' ? (
                    <div className="text-center py-6 text-slate-300 font-bold text-lg">
                      Sinh viên đang nhập đáp án trên điện thoại...
                      {currentQuestion.numericalUnit && (
                        <span className="block text-sm text-amber-300 mt-1">
                          Đơn vị tính: {currentQuestion.numericalUnit}
                        </span>
                      )}
                    </div>
                  ) : (
                    <>
                      <div className="flex flex-wrap items-center justify-between gap-3 bg-emerald-500/15 border border-emerald-400/40 rounded-2xl p-4">
                        <div>
                          <div className="text-xs font-bold uppercase tracking-wider text-emerald-300">
                            Đáp án chuẩn
                          </div>
                          <div className="text-2xl font-black text-white mt-0.5">
                            {currentQuestion.type === 'NUMERICAL'
                              ? `${currentQuestion.expectedValue ?? '—'} ${currentQuestion.numericalUnit ?? ''} (±${currentQuestion.tolerance ?? 0.01})`
                              : currentQuestion.sampleAnswer || 'Chấm theo Rubric từ khóa'}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-xs text-slate-400 font-bold">Tỷ lệ đúng</div>
                          <div className="text-2xl font-black text-emerald-400">
                            {answeredCount > 0
                              ? `${Math.round((view.correctAnsweredCount / answeredCount) * 100)}%`
                              : '0%'}
                          </div>
                        </div>
                      </div>

                      {view.topAnswers && view.topAnswers.length > 0 && (
                        <div className="space-y-2">
                          <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
                            Top câu trả lời phổ biến nhất
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {view.topAnswers.map((ans, idx) => (
                              <div
                                key={idx}
                                className={`px-4 py-2.5 rounded-xl border flex items-center justify-between gap-2 ${
                                  ans.isCorrect
                                    ? 'bg-emerald-500/15 border-emerald-400/40 text-emerald-100'
                                    : 'bg-slate-800 border-slate-700 text-slate-200'
                                }`}
                              >
                                <span className="font-bold truncate">{ans.label}</span>
                                <span className="text-xs font-black px-2 py-0.5 rounded-md bg-black/30 shrink-0">
                                  {ans.count} bạn
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          )}

        {session.state === 'LEADERBOARD' && (
          <div className="flex-1 flex flex-col items-center justify-center max-w-2xl w-full mx-auto gap-6">
            <div className="flex items-center gap-3">
              <Trophy className="w-9 h-9 text-amber-400" />
              <h2 className="text-3xl font-black">
                {session.gameMode === 'TEAM' ? 'Bảng xếp hạng Đội (Điểm TB)' : 'Bảng xếp hạng Top 5'}
              </h2>
            </div>

            {session.gameMode === 'TEAM' && view.teamLeaderboard && view.teamLeaderboard.length > 0 ? (
              <div className="w-full space-y-3">
                {view.teamLeaderboard.map((t, idx) => (
                  <div
                    key={t.teamName}
                    className={`rounded-2xl px-5 py-4 flex items-center justify-between border ${
                      idx === 0
                        ? 'bg-amber-400/15 border-amber-400/50'
                        : 'bg-slate-900 border-slate-800'
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <span className="w-9 h-9 rounded-xl bg-slate-800 flex items-center justify-center font-black text-lg">
                        #{t.rank}
                      </span>
                      <div>
                        <div className="font-bold text-lg">{t.teamName}</div>
                        <div className="text-xs text-slate-400">
                          {t.memberCount} thành viên • Tổng {t.totalScore.toLocaleString('vi-VN')} đ
                        </div>
                      </div>
                    </div>
                    <div className="text-2xl font-black text-emerald-400">
                      {t.avgScore.toLocaleString('vi-VN')} <span className="text-xs text-slate-400">TB</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="w-full space-y-3">
                {players.slice(0, 5).map((p, idx) => (
                  <div
                    key={p.id}
                    className={`rounded-2xl px-5 py-4 flex items-center justify-between border ${
                      idx === 0
                        ? 'bg-amber-400/15 border-amber-400/50'
                        : 'bg-slate-900 border-slate-800'
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <span className="w-9 h-9 rounded-xl bg-slate-800 flex items-center justify-center font-black text-lg">
                        #{p.rank}
                      </span>
                      <div>
                        <div className="font-bold text-lg">{p.nickname}</div>
                        {p.streak >= 2 && (
                          <div className="text-xs text-amber-300 font-bold flex items-center gap-1">
                            <Flame className="w-3.5 h-3.5" /> Chuỗi {p.streak} câu đúng
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="text-2xl font-black text-emerald-400">
                      {p.score.toLocaleString('vi-VN')}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <button
              type="button"
              onClick={handleNext}
              className="px-8 py-4 rounded-2xl bg-indigo-500 hover:bg-indigo-400 font-black text-lg flex items-center gap-2 shadow-xl"
            >
              Câu tiếp theo <ArrowRight className="w-5 h-5" />
            </button>
          </div>
        )}

        {session.state === 'ENDED' && (
          <div className="flex-1 flex flex-col items-center justify-center gap-8 max-w-4xl w-full mx-auto">
            <div className="text-center">
              <Award className="w-14 h-14 text-amber-400 mx-auto mb-2" />
              <h2 className="text-4xl font-black">Bục Vinh Danh</h2>
              <p className="text-slate-400 text-sm mt-1">
                Tổng kết {session.totalQuestions} câu hỏi • {players.length} người chơi
              </p>
            </div>

            {/* Podium Top 3 */}
            {session.gameMode === 'TEAM' && view.teamLeaderboard && view.teamLeaderboard.length > 0 ? (
              <div className="grid grid-cols-3 gap-4 items-end w-full max-w-2xl">
                {[view.teamLeaderboard[1], view.teamLeaderboard[0], view.teamLeaderboard[2]].map((t, slot) => {
                  const place = slot === 0 ? 2 : slot === 1 ? 1 : 3;
                  const height = place === 1 ? 'h-48' : place === 2 ? 'h-36' : 'h-28';
                  const color =
                    place === 1
                      ? 'from-amber-400 to-yellow-500 text-slate-950'
                      : place === 2
                        ? 'from-slate-300 to-slate-400 text-slate-950'
                        : 'from-orange-600 to-amber-700 text-white';
                  return (
                    <div key={place} className="flex flex-col items-center">
                      {t ? (
                        <>
                          <div className="font-black text-lg text-center truncate max-w-full">
                            {t.teamName}
                          </div>
                          <div className="text-sm font-bold text-emerald-400 mb-2">
                            {t.avgScore.toLocaleString('vi-VN')} TB ({t.memberCount} TV)
                          </div>
                        </>
                      ) : (
                        <div className="text-slate-600 text-sm mb-2">—</div>
                      )}
                      <div
                        className={`w-full ${height} rounded-t-3xl bg-gradient-to-b ${color} flex items-center justify-center text-4xl font-black shadow-2xl`}
                      >
                        #{place}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-4 items-end w-full max-w-2xl">
                {[players[1], players[0], players[2]].map((p, slot) => {
                  const place = slot === 0 ? 2 : slot === 1 ? 1 : 3;
                  const height = place === 1 ? 'h-48' : place === 2 ? 'h-36' : 'h-28';
                  const color =
                    place === 1
                      ? 'from-amber-400 to-yellow-500 text-slate-950'
                      : place === 2
                        ? 'from-slate-300 to-slate-400 text-slate-950'
                        : 'from-orange-600 to-amber-700 text-white';
                  return (
                    <div key={place} className="flex flex-col items-center">
                      {p ? (
                        <>
                          <div className="font-black text-lg text-center truncate max-w-full">
                            {p.nickname}
                          </div>
                          <div className="text-sm font-bold text-emerald-400 mb-2">
                            {p.score.toLocaleString('vi-VN')} đ
                          </div>
                        </>
                      ) : (
                        <div className="text-slate-600 text-sm mb-2">—</div>
                      )}
                      <div
                        className={`w-full ${height} rounded-t-3xl bg-gradient-to-b ${color} flex items-center justify-center text-4xl font-black shadow-2xl`}
                      >
                        #{place}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={handleExportExcel}
                className="px-6 py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black flex items-center gap-2 shadow-lg"
              >
                <Download className="w-4 h-4" /> Xuất bảng điểm Excel (.xlsx)
              </button>
              <Link
                to="/admin"
                className="px-6 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-500 font-bold"
              >
                Quay về Trang Quản trị
              </Link>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
