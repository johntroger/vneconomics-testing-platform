import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Award,
  Check,
  CheckCircle2,
  Clock,
  Flame,
  Send,
  TrendingUp,
  Trophy,
  XCircle,
} from 'lucide-react';
import {
  fetchGamePlayerView,
  pollGameStatus,
  submitGameAnswer,
  subscribeLocalGameUpdates,
} from '../services/gameApi';
import {
  GAME_OPTION_STYLES,
  type GamePlayerView,
  type GameQuestionSnapshot,
} from '../types/game';

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

export const GamePlayPage: React.FC = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const playerId = sessionId ? sessionStorage.getItem(`vne_game_player_${sessionId}`) : null;

  const [view, setView] = useState<GamePlayerView | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submittedLocal, setSubmittedLocal] = useState(false);
  const [multiSelected, setMultiSelected] = useState<string[]>([]);
  const [tfSelected, setTfSelected] = useState<Record<string, boolean>>({});
  const [textAnswer, setTextAnswer] = useState('');
  const [nowMs, setNowMs] = useState(Date.now());

  const clockOffsetRef = useRef(0);
  const lastVersionRef = useRef<number>(-1);
  const lastQIndexRef = useRef<number>(-1);

  const loadPlayerView = useCallback(async () => {
    if (!sessionId || !playerId) {
      setError('Phiên chơi không hợp lệ hoặc bạn chưa nhập mã PIN.');
      setLoading(false);
      return;
    }
    const res = await fetchGamePlayerView(sessionId, playerId);
    if (!res.ok || !res.data) {
      setError(res.error ?? 'Không thể tải trạng thái phòng chơi.');
      setLoading(false);
      return;
    }
    clockOffsetRef.current = res.data.session.serverNowMs - Date.now();
    lastVersionRef.current = res.data.session.stateVersion;

    if (res.data.session.currentQIndex !== lastQIndexRef.current) {
      lastQIndexRef.current = res.data.session.currentQIndex;
      setSubmittedLocal(false);
      setMultiSelected([]);
      setTfSelected({});
      setTextAnswer('');
    }
    if (res.data.myAnswer) {
      setSubmittedLocal(true);
    }

    setView(res.data);
    setLoading(false);
  }, [sessionId, playerId]);

  useEffect(() => {
    void loadPlayerView();
  }, [loadPlayerView]);

  // Adaptive polling with ±150ms jitter + BroadcastChannel
  useEffect(() => {
    if (!sessionId || !playerId) return;
    const unsub = subscribeLocalGameUpdates((updatedId) => {
      if (updatedId === sessionId || updatedId === '*') {
        void loadPlayerView();
      }
    });

    let timer: number;
    let cancelled = false;

    const scheduleNext = () => {
      if (cancelled) return;
      const state = view?.session.state;
      const baseMs =
        state === 'QUESTION_ACTIVE' ? (submittedLocal ? 1200 : 2000) : 900;
      const jitter = Math.floor(Math.random() * 300) - 150;
      timer = window.setTimeout(async () => {
        if (view?.session.gamePin) {
          const poll = await pollGameStatus(view.session.gamePin);
          if (poll) {
            clockOffsetRef.current = poll.now - Date.now();
            if (poll.v !== lastVersionRef.current) {
              await loadPlayerView();
            }
          }
        }
        scheduleNext();
      }, Math.max(500, baseMs + jitter));
    };

    scheduleNext();
    return () => {
      cancelled = true;
      unsub();
      window.clearTimeout(timer);
    };
  }, [sessionId, playerId, view?.session.gamePin, view?.session.state, submittedLocal, loadPlayerView]);

  useEffect(() => {
    const tick = window.setInterval(() => {
      setNowMs(Date.now() + clockOffsetRef.current);
    }, 200);
    return () => window.clearInterval(tick);
  }, []);

  const handleSubmit = async (payload: string | string[] | Record<string, boolean>) => {
    if (!sessionId || !playerId || !view || submitting || submittedLocal) return;
    setSubmitting(true);
    setSubmittedLocal(true);
    const res = await submitGameAnswer({
      sessionId,
      playerId,
      questionIndex: view.session.currentQIndex,
      answerPayload: payload,
    });
    setSubmitting(false);
    if (!res.ok) {
      setError(res.error ?? 'Không gửi được đáp án.');
    } else {
      void loadPlayerView();
    }
  };

  if (loading) {
    return (
      <div className="min-h-[100dvh] bg-slate-950 text-white flex items-center justify-center font-bold">
        Đang kết nối phòng chơi...
      </div>
    );
  }

  if (error || !view) {
    return (
      <div className="min-h-[100dvh] bg-slate-950 text-white flex flex-col items-center justify-center p-6 text-center gap-4">
        <XCircle className="w-12 h-12 text-rose-400" />
        <p className="font-bold text-lg">{error || 'Không tìm thấy phòng chơi.'}</p>
        <Link
          to="/play"
          className="px-5 py-3 rounded-2xl bg-indigo-600 font-bold text-sm"
        >
          Nhập lại mã PIN
        </Link>
      </div>
    );
  }

  const { session, player, question, myAnswer } = view;
  const remainingSec = Math.max(0, Math.ceil((session.questionEndsAtMs - nowMs) / 1000));
  const rankDelta = player.prevRank > 0 && player.rank > 0 ? player.prevRank - player.rank : 0;

  return (
    <div className="min-h-[100dvh] bg-slate-950 text-white flex flex-col select-none">
      {/* Compact Header */}
      <header className="px-4 py-3 bg-slate-900 border-b border-slate-800 flex items-center justify-between gap-2 shrink-0">
        <div className="min-w-0">
          <div className="text-[11px] font-bold text-indigo-400 uppercase tracking-wider">
            PIN {session.gamePin} • Câu {session.currentQIndex + 1}/{session.totalQuestions}
          </div>
          <div className="font-black text-base truncate">{player.nickname}</div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {player.streak >= 2 && (
            <span className="px-2.5 py-1 rounded-xl bg-amber-500/20 text-amber-300 text-xs font-black flex items-center gap-1">
              <Flame className="w-3.5 h-3.5" /> {player.streak}
            </span>
          )}
          <span className="px-3 py-1 rounded-xl bg-emerald-500/20 text-emerald-300 font-black text-sm">
            {player.score.toLocaleString('vi-VN')} đ
          </span>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col p-4 max-w-xl w-full mx-auto">
        {session.state === 'LOBBY' && (
          <div className="flex-1 flex flex-col items-center justify-center text-center gap-4">
            <div className="w-20 h-20 rounded-3xl bg-indigo-600/30 border border-indigo-400/40 flex items-center justify-center animate-pulse">
              <Clock className="w-10 h-10 text-indigo-300" />
            </div>
            <h2 className="text-2xl font-black">Bạn đã vào phòng!</h2>
            <p className="text-slate-300 text-sm">
              Hãy nhìn lên màn hình của giảng viên và chờ trò chơi bắt đầu.
            </p>
            <div className="px-5 py-2.5 rounded-2xl bg-slate-900 border border-slate-800 font-bold text-indigo-300">
              {player.nickname} {player.studentCode ? `(${player.studentCode})` : ''}
            </div>
          </div>
        )}

        {session.state === 'QUESTION_INTRO' && (
          <div className="flex-1 flex flex-col items-center justify-center text-center gap-5">
            <span className="px-4 py-1.5 rounded-full bg-indigo-500/25 border border-indigo-400/40 text-indigo-200 font-black text-sm tracking-wider">
              {getQuestionTypeBadge(question)}
            </span>
            {question?.isDoublePoints && (
              <span className="px-4 py-1.5 rounded-full bg-amber-400 text-slate-950 font-black text-sm">
                ★ x2 ĐIỂM CÂU CUỐI
              </span>
            )}
            <div className="text-6xl font-black text-amber-400">{remainingSec}</div>
            <p className="text-slate-400 text-sm">Chuẩn bị chọn đáp án...</p>
          </div>
        )}

        {session.state === 'QUESTION_ACTIVE' && question && (
          <div className="flex-1 flex flex-col gap-3">
            {/* Timer Strip */}
            <div className="flex items-center justify-between text-xs font-bold text-slate-300 px-1">
              <span>{getQuestionTypeBadge(question)}</span>
              <span
                className={`text-base font-black ${
                  remainingSec <= 5 ? 'text-rose-400' : 'text-amber-300'
                }`}
              >
                {remainingSec}s
              </span>
            </div>

            {submittedLocal ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center gap-4 bg-slate-900/70 border border-slate-800 rounded-3xl p-6">
                <CheckCircle2 className="w-16 h-16 text-emerald-400 animate-bounce" />
                <h3 className="text-2xl font-black">Đã ghi nhận đáp án!</h3>
                <p className="text-slate-400 text-sm">
                  Đang chờ các bạn khác hoàn thành hoặc hết giờ...
                </p>
              </div>
            ) : (
              <>
                {session.showQuestionOnPlayer && question.content && (
                  <div className="bg-white text-slate-900 rounded-2xl p-4 font-bold text-base leading-snug shadow-lg whitespace-pre-line">
                    {question.content}
                  </div>
                )}

                {/* SINGLE_CHOICE */}
                {question.type === 'SINGLE_CHOICE' && question.options && (
                  <div
                    className={`flex-1 grid gap-3 ${
                      question.options.length <= 2
                        ? 'grid-cols-1'
                        : question.options.length <= 4
                          ? 'grid-cols-2'
                          : 'grid-cols-2'
                    }`}
                  >
                    {question.options.map((opt, idx) => {
                      const style = GAME_OPTION_STYLES[idx % GAME_OPTION_STYLES.length];
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => void handleSubmit(opt.id)}
                          className={`${style.bg} ${style.hover} touch-manipulation rounded-2xl p-4 flex flex-col items-center justify-center gap-2 shadow-xl transition active:scale-95 min-h-[110px]`}
                        >
                          <div className="flex items-center gap-2 text-3xl font-black">
                            <span>{style.shape}</span>
                            <span className="text-xl opacity-90">{style.letter}</span>
                          </div>
                          {session.showQuestionOnPlayer && opt.text && (
                            <span className="text-sm font-bold text-center leading-tight line-clamp-3">
                              {opt.text}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* MULTI_CHOICE */}
                {question.type === 'MULTI_CHOICE' && question.options && (
                  <div className="flex-1 flex flex-col gap-3">
                    <div className="grid grid-cols-2 gap-3 flex-1">
                      {question.options.map((opt, idx) => {
                        const style = GAME_OPTION_STYLES[idx % GAME_OPTION_STYLES.length];
                        const active = multiSelected.includes(opt.id);
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() =>
                              setMultiSelected((prev) =>
                                prev.includes(opt.id)
                                  ? prev.filter((x) => x !== opt.id)
                                  : [...prev, opt.id],
                              )
                            }
                            className={`${style.bg} touch-manipulation rounded-2xl p-4 flex flex-col items-center justify-center gap-2 relative transition ${
                              active ? 'ring-4 ring-white scale-[0.98]' : 'opacity-75'
                            }`}
                          >
                            {active && (
                              <span className="absolute top-2 right-2 w-6 h-6 rounded-full bg-white text-slate-900 flex items-center justify-center">
                                <Check className="w-4 h-4 stroke-[3]" />
                              </span>
                            )}
                            <div className="flex items-center gap-2 text-2xl font-black">
                              <span>{style.shape}</span>
                              <span>{style.letter}</span>
                            </div>
                            {session.showQuestionOnPlayer && opt.text && (
                              <span className="text-xs font-bold text-center leading-tight">
                                {opt.text}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                    <button
                      type="button"
                      disabled={multiSelected.length === 0}
                      onClick={() => void handleSubmit(multiSelected)}
                      className="w-full py-4 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-lg flex items-center justify-center gap-2 disabled:opacity-40 touch-manipulation"
                    >
                      <Send className="w-5 h-5" /> Gửi đáp án ({multiSelected.length})
                    </button>
                  </div>
                )}

                {/* TRUE_FALSE */}
                {question.type === 'TRUE_FALSE' && question.trueFalseItems && (
                  <>
                    {question.trueFalseItems.length === 1 ? (
                      <div className="flex-1 grid grid-cols-2 gap-3">
                        <button
                          type="button"
                          onClick={() =>
                            void handleSubmit({
                              [question.trueFalseItems![0].id]: true,
                            })
                          }
                          className="bg-blue-600 hover:bg-blue-500 touch-manipulation rounded-3xl flex flex-col items-center justify-center gap-2 text-3xl font-black shadow-xl active:scale-95"
                        >
                          <span>◆</span>
                          <span>ĐÚNG</span>
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            void handleSubmit({
                              [question.trueFalseItems![0].id]: false,
                            })
                          }
                          className="bg-rose-600 hover:bg-rose-500 touch-manipulation rounded-3xl flex flex-col items-center justify-center gap-2 text-3xl font-black shadow-xl active:scale-95"
                        >
                          <span>▲</span>
                          <span>SAI</span>
                        </button>
                      </div>
                    ) : (
                      <div className="flex-1 flex flex-col gap-3">
                        <div className="space-y-2.5 flex-1 overflow-y-auto">
                          {question.trueFalseItems.map((it, idx) => {
                            const val = tfSelected[it.id];
                            return (
                              <div
                                key={it.id}
                                className="bg-slate-900 border border-slate-800 rounded-2xl p-3 flex items-center justify-between gap-3"
                              >
                                <div className="text-sm font-semibold flex-1">
                                  <span className="text-indigo-400 font-black mr-1.5">
                                    {String.fromCharCode(97 + idx)})
                                  </span>
                                  {it.statement}
                                </div>
                                <div className="flex gap-1.5 shrink-0">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setTfSelected((p) => ({ ...p, [it.id]: true }))
                                    }
                                    className={`px-3 py-2 rounded-xl font-black text-xs touch-manipulation ${
                                      val === true
                                        ? 'bg-blue-600 text-white ring-2 ring-white'
                                        : 'bg-slate-800 text-slate-400'
                                    }`}
                                  >
                                    Đúng
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setTfSelected((p) => ({ ...p, [it.id]: false }))
                                    }
                                    className={`px-3 py-2 rounded-xl font-black text-xs touch-manipulation ${
                                      val === false
                                        ? 'bg-rose-600 text-white ring-2 ring-white'
                                        : 'bg-slate-800 text-slate-400'
                                    }`}
                                  >
                                    Sai
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        <button
                          type="button"
                          disabled={
                            Object.keys(tfSelected).length < question.trueFalseItems.length
                          }
                          onClick={() => void handleSubmit(tfSelected)}
                          className="w-full py-4 rounded-2xl bg-emerald-500 text-slate-950 font-black text-lg flex items-center justify-center gap-2 disabled:opacity-40 touch-manipulation"
                        >
                          <Send className="w-5 h-5" /> Gửi đáp án
                        </button>
                      </div>
                    )}
                  </>
                )}

                {/* NUMERICAL (Always show unit + inline Submit for mobile keyboard safety) */}
                {question.type === 'NUMERICAL' && (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (textAnswer.trim()) void handleSubmit(textAnswer.trim());
                    }}
                    className="space-y-3 pt-2"
                  >
                    <div className="bg-slate-900 border border-slate-700 rounded-2xl p-4 space-y-2">
                      <label className="block text-xs font-bold uppercase tracking-wider text-indigo-300">
                        Nhập kết quả số {question.numericalUnit ? `(Đơn vị: ${question.numericalUnit})` : ''}
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={textAnswer}
                          onChange={(e) => setTextAnswer(e.target.value)}
                          placeholder="VD: 12.5"
                          autoFocus
                          className="flex-1 min-w-0 px-4 py-3.5 rounded-xl bg-white text-slate-900 text-xl font-black focus:outline-none focus:ring-4 focus:ring-amber-400/50"
                        />
                        {question.numericalUnit && (
                          <span className="px-3 py-3 rounded-xl bg-slate-800 text-amber-300 font-bold text-sm shrink-0">
                            {question.numericalUnit}
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      type="submit"
                      disabled={!textAnswer.trim()}
                      className="w-full py-3.5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-lg flex items-center justify-center gap-2 disabled:opacity-40 touch-manipulation"
                    >
                      <Send className="w-5 h-5" /> Gửi đáp án
                    </button>
                  </form>
                )}

                {/* ESSAY (Type Answer / Keyword Rubric) */}
                {question.type === 'ESSAY' && (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (textAnswer.trim()) void handleSubmit(textAnswer.trim());
                    }}
                    className="space-y-3 pt-2"
                  >
                    <div className="bg-slate-900 border border-slate-700 rounded-2xl p-4 space-y-2">
                      <label className="block text-xs font-bold uppercase tracking-wider text-indigo-300">
                        Gõ câu trả lời ngắn / từ khóa chính
                      </label>
                      <textarea
                        rows={3}
                        maxLength={450}
                        value={textAnswer}
                        onChange={(e) => setTextAnswer(e.target.value)}
                        placeholder="Nhập câu trả lời ngắn gọn..."
                        autoFocus
                        className="w-full px-3.5 py-3 rounded-xl bg-white text-slate-900 font-semibold text-base focus:outline-none focus:ring-4 focus:ring-amber-400/50"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={!textAnswer.trim()}
                      className="w-full py-3.5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-lg flex items-center justify-center gap-2 disabled:opacity-40 touch-manipulation"
                    >
                      <Send className="w-5 h-5" /> Gửi đáp án
                    </button>
                  </form>
                )}
              </>
            )}
          </div>
        )}

        {(session.state === 'QUESTION_RESULT' || session.state === 'LEADERBOARD') && (
          <div className="flex-1 flex flex-col items-center justify-center text-center gap-5">
            {myAnswer ? (
              myAnswer.isCorrect ? (
                <div className="w-full rounded-3xl bg-emerald-600/25 border border-emerald-400/50 p-6 space-y-2">
                  <CheckCircle2 className="w-16 h-16 text-emerald-400 mx-auto" />
                  <h2 className="text-3xl font-black text-emerald-300">Chính xác!</h2>
                  <div className="text-2xl font-black">
                    +{myAnswer.pointsEarned.toLocaleString('vi-VN')} điểm
                  </div>
                </div>
              ) : myAnswer.earnedRatio > 0 ? (
                <div className="w-full rounded-3xl bg-amber-500/20 border border-amber-400/40 p-6 space-y-2">
                  <CheckCircle2 className="w-14 h-14 text-amber-300 mx-auto" />
                  <h2 className="text-2xl font-black text-amber-200">
                    Đúng {Math.round(myAnswer.earnedRatio * 100)}%
                  </h2>
                  <div className="text-2xl font-black">
                    +{myAnswer.pointsEarned.toLocaleString('vi-VN')} điểm
                  </div>
                </div>
              ) : (
                <div className="w-full rounded-3xl bg-rose-600/25 border border-rose-400/40 p-6 space-y-2">
                  <XCircle className="w-16 h-16 text-rose-400 mx-auto" />
                  <h2 className="text-3xl font-black text-rose-300">Chưa chính xác</h2>
                  <div className="text-sm text-rose-200">Cố gắng ở câu tiếp theo nhé!</div>
                </div>
              )
            ) : (
              <div className="w-full rounded-3xl bg-slate-900 border border-slate-800 p-6 space-y-2">
                <Clock className="w-14 h-14 text-slate-400 mx-auto" />
                <h2 className="text-2xl font-black text-slate-300">Hết giờ!</h2>
                <div className="text-sm text-slate-400">Bạn chưa kịp gửi đáp án ở lượt này.</div>
              </div>
            )}

            <div className="w-full bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-slate-400 text-sm font-bold">Thứ hạng hiện tại</span>
                <span className="text-2xl font-black text-amber-300">
                  #{player.rank} / {player.totalPlayers}
                </span>
              </div>
              {rankDelta > 0 && (
                <div className="text-xs font-bold text-emerald-400 flex items-center justify-center gap-1">
                  <TrendingUp className="w-4 h-4" /> Bạn vừa tăng {rankDelta} bậc!
                </div>
              )}
              {player.rank > 1 && player.gapToAbove > 0 && (
                <div className="text-xs text-indigo-300 font-medium">
                  Chỉ còn cách hạng #{player.rank - 1} đúng{' '}
                  <strong>{player.gapToAbove.toLocaleString('vi-VN')}</strong> điểm
                </div>
              )}
            </div>
          </div>
        )}

        {session.state === 'ENDED' && (
          <div className="flex-1 flex flex-col items-center justify-center text-center gap-5">
            {player.rank <= 3 ? (
              <Trophy className="w-20 h-20 text-amber-400" />
            ) : (
              <Award className="w-20 h-20 text-indigo-400" />
            )}
            <div>
              <div className="text-sm uppercase tracking-widest text-indigo-300 font-bold">
                Kết quả chung cuộc
              </div>
              <h2 className="text-4xl font-black text-amber-300 mt-1">
                Hạng #{player.rank}
              </h2>
              <p className="text-slate-400 text-sm mt-1">
                Tổng {player.totalPlayers} người chơi
              </p>
            </div>

            <div className="w-full bg-slate-900 border border-slate-800 rounded-3xl p-5 grid grid-cols-2 gap-4">
              <div>
                <div className="text-xs text-slate-400 font-bold">Tổng điểm</div>
                <div className="text-2xl font-black text-emerald-400">
                  {player.score.toLocaleString('vi-VN')}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-400 font-bold">Câu đúng</div>
                <div className="text-2xl font-black text-white">
                  {player.correctCount} / {session.totalQuestions}
                </div>
              </div>
            </div>

            <Link
              to="/play"
              className="px-6 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-500 font-bold text-sm"
            >
              Chơi phòng khác
            </Link>
          </div>
        )}
      </main>
    </div>
  );
};
