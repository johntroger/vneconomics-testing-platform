import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  Layers,
  Lock,
  Mail,
  Radio,
  ShieldAlert,
  Shuffle,
  Smartphone,
  Sparkles,
  Users,
} from 'lucide-react';
import { GAME_AVATARS, GameAvatarBadge } from '../components/game/GameAvatarBadge';
import { useExamPlatform } from '../context/ExamContext';
import {
  mergeLobbyPeers,
  resolveAttemptAvatarId,
} from '../utils/examWaitingRoom';

const LOBBY_CHEERS = [
  { emoji: '🔥', label: 'Quyết tâm' },
  { emoji: '💪', label: 'Sẵn sàng' },
  { emoji: '🍀', label: 'May mắn' },
  { emoji: '🚀', label: '10 điểm' },
  { emoji: '❤️', label: 'Thả tim' },
] as const;

export const ExamLobbyPage: React.FC = () => {
  const { examId } = useParams<{ examId: string }>();
  const [searchParams] = useSearchParams();
  const attemptId = searchParams.get('attempt') ?? '';
  const navigate = useNavigate();

  const {
    exams,
    courses,
    shifts,
    attempts,
    lobbyPeers,
    beginAttemptTake,
    updateAttemptAvatar,
  } = useExamPlatform();
  const [agreed, setAgreed] = useState(false);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState('');
  const [countdown, setCountdown] = useState<number | null>(null);
  const [floatingCheers, setFloatingCheers] = useState<
    Array<{ id: string; emoji: string; left: number }>
  >([]);
  const wasWaitingRef = useRef(false);
  const launchingRef = useRef(false);

  const exam = exams.find((e) => e.id === examId);
  const course = courses.find((c) => c.id === exam?.courseId);
  const attempt = attempts.find((a) => a.id === attemptId);
  const activeShift = attempt?.shiftId
    ? shifts.find((s) => s.id === attempt.shiftId)
    : exam
      ? shifts.find((s) => s.examId === exam.id && s.roomPin === exam.roomPin)
      : undefined;
  const effectiveRoomStatus = activeShift?.status ?? exam?.status ?? 'OPEN';
  const isWaitingRoom = effectiveRoomStatus === 'WAITING';

  const myAvatarId = attempt ? resolveAttemptAvatarId(attempt) : 'fox';
  const myAvatarSpec =
    GAME_AVATARS.find((a) => a.id === myAvatarId) ?? GAME_AVATARS[0];

  const mergedPeers = useMemo(() => {
    if (!exam || !attempt) return [];
    const localRoomAttempts = attempts.filter(
      (a) =>
        a.examId === exam.id &&
        (!attempt.shiftId || !a.shiftId || a.shiftId === attempt.shiftId),
    );
    return mergeLobbyPeers(attempt.id, localRoomAttempts, lobbyPeers);
  }, [attempt, attempts, exam, lobbyPeers]);

  const handleSelectAvatar = (nextAvatarId: string) => {
    if (!attempt) return;
    void updateAttemptAvatar(attempt.id, nextAvatarId);
  };

  const handleRandomAvatar = () => {
    if (!attempt) return;
    const pool = GAME_AVATARS.filter((a) => a.id !== myAvatarId);
    const picked = pool[Math.floor(Math.random() * pool.length)] ?? GAME_AVATARS[0];
    void updateAttemptAvatar(attempt.id, picked.id);
  };

  const handleSpawnCheer = (emoji: string) => {
    const id = `chr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`;
    const left = 12 + Math.floor(Math.random() * 76);
    setFloatingCheers((prev) => [...prev.slice(-14), { id, emoji, left }]);
    window.setTimeout(() => {
      setFloatingCheers((prev) => prev.filter((c) => c.id !== id));
    }, 2600);
  };

  const launchTakePage = useCallback(async () => {
    if (!exam || !attempt || launchingRef.current) return;
    launchingRef.current = true;
    setStarting(true);
    setStartError('');
    const res = await beginAttemptTake(attempt.id);
    if (!res.ok) {
      launchingRef.current = false;
      setStarting(false);
      setCountdown(null);
      setStartError(res.error ?? 'Chưa thể bắt đầu làm bài lúc này.');
      return;
    }
    navigate(`/exam/${exam.id}/take?attempt=${attempt.id}`);
  }, [attempt, beginAttemptTake, exam, navigate]);

  useEffect(() => {
    if (effectiveRoomStatus === 'WAITING') {
      wasWaitingRef.current = true;
      setCountdown(null);
      return;
    }
    if (
      wasWaitingRef.current &&
      effectiveRoomStatus === 'OPEN' &&
      agreed &&
      countdown === null &&
      !launchingRef.current
    ) {
      setCountdown(3);
    }
  }, [agreed, countdown, effectiveRoomStatus]);

  useEffect(() => {
    if (countdown === null) return;
    if (countdown <= 0) {
      void launchTakePage();
      return;
    }
    const timer = window.setTimeout(() => {
      setCountdown((prev) => (prev !== null ? prev - 1 : null));
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [countdown, launchTakePage]);

  if (!exam || !attempt) {
    return (
      <div className="min-h-screen bg-surface-100 flex flex-col items-center justify-center p-6 text-center">
        <p className="text-sm font-semibold text-ink-700 mb-3">
          Không tìm thấy phiên phòng chờ hợp lệ.
        </p>
        <button
          type="button"
          onClick={() => navigate('/')}
          className="px-4 py-2.5 rounded-xl bg-brand-600 text-white text-xs font-bold"
        >
          Quay lại cổng vào thi
        </button>
      </div>
    );
  }

  if (attempt.status === 'SUBMITTED' || attempt.status === 'AUTO_SUBMITTED') {
    return (
      <div className="min-h-screen bg-surface-100 flex flex-col items-center justify-center p-6 text-center">
        <div className="max-w-sm w-full bg-white rounded-2xl border border-slate-200 shadow-card p-6 space-y-3">
          <CheckCircle2 className="w-10 h-10 text-support-600 mx-auto" />
          <h2 className="text-base font-extrabold text-ink-900">
            Bài thi của bạn đã được nộp
          </h2>
          <p className="text-xs text-ink-600 leading-relaxed">
            Thí sinh <strong>{attempt.studentName}</strong> ({attempt.studentCode}) đã hoàn thành ca thi này. Bấm nút bên dưới để xem biên nhận & kết quả.
          </p>
          <div className="flex flex-col gap-2 pt-1">
            <button
              type="button"
              onClick={() => navigate(`/exam/${exam.id}/result?attempt=${attempt.id}`)}
              className="w-full py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold"
            >
              Xem Biên nhận & Điểm số
            </button>
            <button
              type="button"
              onClick={() => navigate('/')}
              className="w-full py-2 rounded-xl border border-slate-200 text-ink-700 text-xs font-semibold hover:bg-slate-50"
            >
              Quay lại cổng vào thi
            </button>
          </div>
        </div>
      </div>
    );
  }

  const handleStartExam = () => {
    if (isWaitingRoom) {
      setAgreed(true);
      setStartError('');
      return;
    }
    if (!agreed) return;
    void launchTakePage();
  };

  return (
    <div className="min-h-screen bg-surface-100 pt-5 pb-12 safe-bottom px-4">
      {countdown !== null && (
        <div className="fixed inset-0 z-50 bg-ink-900/90 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center text-white">
          <div className="w-16 h-16 rounded-2xl bg-brand-600/30 border border-brand-400/40 flex items-center justify-center mb-4">
            <Sparkles className="w-8 h-8 text-amber-300 animate-pulse" />
          </div>
          <p className="text-xs font-bold uppercase tracking-widest text-emerald-300">
            Giảng viên vừa bấm Phát đề đồng loạt!
          </p>
          <div className="text-7xl font-mono font-black text-white my-3">
            {countdown > 0 ? countdown : 'Bắt đầu!'}
          </div>
          <p className="text-sm text-slate-300 max-w-xs">
            Đang tự động mở câu hỏi số 1 và đồng bộ thời gian làm bài cho cả lớp...
          </p>
        </div>
      )}

      <div className="max-w-2xl mx-auto space-y-4">
        <button
          type="button"
          onClick={() => navigate('/')}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-600 hover:text-brand-600"
        >
          <ArrowLeft className="w-4 h-4" /> Đổi phòng thi khác
        </button>

        {/* Area 1: Kahoot-Style Hero Player Card & Avatar Picker */}
        <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-950 via-violet-900 to-slate-950 text-white p-5 sm:p-6 shadow-2xl border border-indigo-500/30 space-y-4">
          {/* Floating Cheers Overlay */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 h-56 overflow-hidden z-20"
          >
            {floatingCheers.map((c) => (
              <span
                key={c.id}
                style={{ left: `${c.left}%` }}
                className="absolute bottom-2 text-3xl animate-float-up drop-shadow-md"
              >
                {c.emoji}
              </span>
            ))}
          </div>

          <div className="relative z-10 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3.5 min-w-0">
              <GameAvatarBadge avatarId={myAvatarId} size="lg" />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5 mb-1">
                  <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-white/15 text-indigo-100 border border-white/15">
                    {course?.code} • PIN {exam.roomPin}
                  </span>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      isWaitingRoom
                        ? 'bg-emerald-400/20 text-emerald-200 border border-emerald-400/30'
                        : 'bg-amber-400/20 text-amber-200 border border-amber-400/30'
                    }`}
                  >
                    {isWaitingRoom ? '● PHÒNG CHỜ ĐIỂM DANH' : '● ĐANG MỞ THI'}
                  </span>
                </div>
                <h2 className="text-lg sm:text-xl font-black tracking-tight truncate">
                  {attempt.studentName}
                </h2>
                <p className="text-xs text-indigo-200 truncate">
                  MSSV {attempt.studentCode} • {attempt.className} •{' '}
                  <span className="text-amber-300 font-semibold">{myAvatarSpec.label}</span>
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleRandomAvatar}
              className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 text-xs font-bold flex items-center gap-1.5 transition shrink-0"
            >
              <Shuffle className="w-3.5 h-3.5 text-amber-300" />
              <span>Đổi ngẫu nhiên</span>
            </button>
          </div>

          {/* 12 Mascot Avatar Picker Grid */}
          <div className="relative z-10 space-y-2">
            <div className="text-[11px] font-bold uppercase tracking-wider text-indigo-200">
              Chọn linh vật đại diện của bạn trên sảnh chờ:
            </div>
            <div className="grid grid-cols-6 sm:grid-cols-12 gap-2">
              {GAME_AVATARS.map((av) => {
                const selected = av.id === myAvatarId;
                return (
                  <button
                    key={av.id}
                    type="button"
                    onClick={() => handleSelectAvatar(av.id)}
                    aria-label={`Chọn linh vật ${av.label}`}
                    title={av.label}
                    className={`p-1 rounded-2xl flex items-center justify-center transition ${
                      selected
                        ? 'ring-2 ring-amber-300 bg-white/20 scale-105 shadow-lg'
                        : 'bg-white/5 hover:bg-white/15 opacity-80 hover:opacity-100'
                    }`}
                  >
                    <GameAvatarBadge avatarId={av.id} size="sm" />
                  </button>
                );
              })}
            </div>
          </div>

          {/* Quick Cheer Reaction Strip */}
          <div className="relative z-10 flex flex-wrap items-center gap-1.5 pt-1 border-t border-white/10">
            <span className="text-[11px] font-semibold text-indigo-200 mr-1">
              Thả cổ vũ:
            </span>
            {LOBBY_CHEERS.map((ch) => (
              <button
                key={ch.emoji}
                type="button"
                onClick={() => handleSpawnCheer(ch.emoji)}
                className="px-2.5 py-1 rounded-full bg-white/10 hover:bg-white/20 active:scale-95 text-[11px] font-bold flex items-center gap-1 transition"
              >
                <span>{ch.emoji}</span>
                <span>{ch.label}</span>
              </button>
            ))}
          </div>
        </section>

        {/* Area 2: Live Classmates Wall (Kahoot Waiting Roster) */}
        <section className="rounded-2xl bg-gradient-to-b from-slate-900 to-indigo-950 text-white p-4 sm:p-5 border border-indigo-500/25 shadow-card space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs sm:text-sm font-extrabold">
              <Users className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>
                Phòng chờ Trực tiếp • {mergedPeers.length} sinh viên đã có mặt
              </span>
            </div>
            <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-white/10 text-indigo-200 border border-white/10">
              {isWaitingRoom ? 'Đang đợi Giảng viên phát đề' : 'Đề thi đã mở'}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 max-h-64 overflow-y-auto pr-0.5">
            {mergedPeers.map((peer) => (
              <div
                key={peer.id || peer.studentCode}
                className={`p-2.5 rounded-2xl border flex items-center gap-2.5 min-w-0 transition ${
                  peer.isMe
                    ? 'border-amber-400/80 bg-amber-400/15 shadow-md'
                    : 'border-white/10 bg-white/10'
                }`}
              >
                <GameAvatarBadge avatarId={peer.avatarId} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1 min-w-0">
                    <span className="text-xs font-extrabold truncate text-white">
                      {peer.studentName}
                    </span>
                    {peer.isMe && (
                      <span className="px-1.5 py-0.5 rounded bg-amber-400 text-slate-950 font-black text-[9px] shrink-0">
                        BẠN
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] font-mono text-indigo-200/85 truncate">
                    ••{peer.studentCode.slice(-4)}
                    {peer.className ? ` • ${peer.className}` : ''}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Area 3: Exam Info, Rules & Start Action */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-card p-4 sm:p-5 space-y-4">
          <div>
            <span className="text-[11px] font-mono font-bold px-2.5 py-1 rounded-full bg-brand-50 text-brand-700">
              {course?.code} • PIN {exam.roomPin}
            </span>
            <h1 className="text-lg font-extrabold text-ink-900 mt-2 leading-snug">
              {exam.title}
            </h1>
            <p className="text-xs text-ink-600 mt-1">
              Thí sinh: <strong>{attempt.studentName}</strong> ({attempt.studentCode}) • {attempt.className}
            </p>
          </div>

          <div className="grid grid-cols-3 gap-1.5 sm:gap-2 text-center">
            <div className="bg-slate-50 rounded-xl p-2.5 border border-slate-200">
              <Clock className="w-4 h-4 text-brand-600 mx-auto mb-1" />
              <div className="text-sm font-mono font-bold text-ink-900">
                {exam.durationMinutes}p
              </div>
              <div className="text-[10px] text-ink-500">Thời lượng</div>
            </div>
            <div className="bg-slate-50 rounded-xl p-2.5 border border-slate-200">
              <Layers className="w-4 h-4 text-support-600 mx-auto mb-1" />
              <div className="text-sm font-mono font-bold text-ink-900">
                {attempt.assignedQuestions.length} câu
              </div>
              <div className="text-[10px] text-ink-500">Đề trộn riêng</div>
            </div>
            <div className="bg-slate-50 rounded-xl p-2.5 border border-slate-200">
              <ShieldAlert className="w-4 h-4 text-amber-600 mx-auto mb-1" />
              <div className="text-sm font-mono font-bold text-ink-900">
                Tối đa {exam.maxLeaveCount} lần
              </div>
              <div className="text-[10px] text-ink-500">Rời màn hình</div>
            </div>
          </div>

          {/* Stratified Chapter Distribution Summary */}
          {exam.chapterMatrix.length > 0 && (
            <div className="bg-slate-50 rounded-xl border border-slate-200 p-3.5 space-y-2">
              <p className="text-xs font-bold text-ink-800">
                Cấu trúc phân bổ câu hỏi theo Chương:
              </p>
              <div className="space-y-1.5">
                {exam.chapterMatrix.map((rule) => (
                  <div
                    key={rule.chapterCategory}
                    className="flex items-center justify-between text-xs"
                  >
                    <span className="text-ink-700 truncate pr-2">
                      {rule.chapterCategory}
                    </span>
                    <span className="font-mono font-semibold text-brand-700 shrink-0">
                      {rule.questionCount} câu ({rule.pointsPerQuestion ?? 1}đ/câu)
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Anti-AI Rules */}
          <div className="bg-amber-50/80 border border-amber-200 rounded-xl p-3.5 space-y-2 text-xs text-amber-950">
            <p className="font-bold flex items-center gap-1.5 text-amber-900">
              <Lock className="w-3.5 h-3.5" /> Quy chế giám sát 8 lớp trong phòng thi:
            </p>
            <ul className="list-disc pl-4 space-y-1 text-[11px] leading-relaxed">
              <li>
                Rời khỏi màn hình trên <strong>{(exam.gracePeriodMs / 1000).toFixed(1)} giây</strong> sẽ bị ẩn đề tức thì, tạm dừng làm bài và tính 1 lần vi phạm (vẫn đếm giờ tổng).
              </li>
              <li>
                Nếu rời màn hình quá <strong>{exam.maxLeaveCount} lần</strong> hoặc vắng mặt quá <strong>{exam.maxAwaySeconds}s</strong>, bài thi sẽ khóa chờ Giảng viên bấm <strong>Accept / Reject</strong>.
              </li>
              <li>
                Cấm chia đôi màn hình, cấm sao chép/dán (Paste), tích hợp sẵn <strong>Máy tính & Bảng nháp</strong> ngay trong trang thi để bạn không cần thoát app.
              </li>
              {exam.oneWayMode && (
                <li>
                  <strong>Chế độ 1 chiều đang bật:</strong> Mỗi câu có đồng hồ riêng ({exam.perQuestionSeconds}s), không quay lại câu trước.
                </li>
              )}
            </ul>
          </div>

          <div className="flex items-center gap-2 text-[11px] text-ink-600 bg-brand-50/60 border border-brand-200 rounded-xl p-3">
            <Mail className="w-4 h-4 text-brand-600 shrink-0" />
            <span>
              Email nhận kết quả: <strong>{attempt.studentEmail}</strong> (
              {exam.emailDeliveryMode === 'DELAYED_BATCH'
                ? 'Nhận biên nhận ngay, nhận điểm sau khi đóng ca'
                : 'Nhận điểm ngay sau khi nộp bài'}
              ).
            </span>
          </div>

          {isWaitingRoom && (
            <div className="rounded-xl border border-indigo-200 bg-indigo-50/80 p-3.5 space-y-1.5 text-xs text-indigo-950">
              <div className="flex items-center justify-between gap-2">
                <p className="font-extrabold flex items-center gap-1.5 text-indigo-900">
                  <Radio className="w-4 h-4 text-emerald-600 animate-pulse shrink-0" />
                  <span>Phòng chờ Điểm danh Tập trung — Đã ghi nhận có mặt</span>
                </p>
                <span className="px-2 py-0.5 rounded-full bg-white text-indigo-700 border border-indigo-200 font-mono text-[10px] font-bold shrink-0">
                  CHƯA TÍNH GIỜ
                </span>
              </div>
              <p className="text-[11px] text-indigo-900/90 leading-relaxed">
                Bạn đã điểm danh thành công vào ca thi. Thời gian làm bài <strong>CHƯA bị trừ</strong> trong lúc chờ. Hãy tích xác nhận quy chế bên dưới; ngay khi Giảng viên bấm <strong>Phát đề đồng loạt</strong>, màn hình của bạn sẽ tự động đếm ngược 3 giây và mở câu hỏi số 1 cùng cả lớp.
              </p>
            </div>
          )}

          <label className="flex items-start gap-2.5 cursor-pointer select-none pt-1">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
            />
            <span className="text-xs text-ink-800 font-medium leading-snug">
              Tôi đã tắt thông báo nổi/đa nhiệm và cam kết tự làm bài trung thực theo quy chế phòng thi.
            </span>
          </label>

          {startError && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
              {startError}
            </div>
          )}

          {isWaitingRoom && agreed ? (
            <div className="w-full min-h-[48px] px-4 py-3 rounded-xl border border-emerald-300 bg-emerald-50 text-emerald-800 font-bold text-xs sm:text-sm flex items-center justify-center gap-2 text-center">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping shrink-0" />
              <span>Đã sẵn sàng nhận đề — Đang chờ Giảng viên bấm Phát đề đồng loạt...</span>
            </div>
          ) : (
            <button
              type="button"
              disabled={(!isWaitingRoom && !agreed) || starting || effectiveRoomStatus === 'CLOSED'}
              onClick={handleStartExam}
              className="w-full h-12 rounded-xl bg-brand-600 hover:bg-brand-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-bold text-sm flex items-center justify-center gap-2 shadow-sm transition px-3"
            >
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span className="truncate">
                {isWaitingRoom
                  ? 'Xác nhận Điểm danh & Sẵn sàng chờ Giảng viên phát đề'
                  : effectiveRoomStatus === 'CLOSED'
                    ? 'Ca thi đã đóng'
                    : starting
                      ? 'Đang mở đề thi...'
                      : Object.keys(attempt.answers).length > 0
                        ? 'Khôi phục phiên thi & Làm bài tiếp'
                        : 'Bắt đầu làm bài ngay'}
              </span>
            </button>
          )}
        </div>

        <p className="text-center text-[11px] text-ink-500 flex items-center justify-center gap-1.5">
          <Smartphone className="w-3.5 h-3.5" /> Khuyên dùng thao tác một tay theo chiều dọc trên điện thoại
        </p>
      </div>
    </div>
  );
};
