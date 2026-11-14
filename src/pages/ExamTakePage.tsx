import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  Calculator,
  ChevronLeft,
  ChevronRight,
  Clock,
  Flag,
  LayoutGrid,
  Send,
  ShieldCheck,
  X,
} from 'lucide-react';
import { AntiCheatGuard } from '../components/exam/AntiCheatGuard';
import { DynamicWatermark } from '../components/exam/DynamicWatermark';
import { ExamCalculatorSheet } from '../components/exam/ExamCalculatorSheet';
import { PauseWarningModal } from '../components/exam/PauseWarningModal';
import { QuestionRenderer } from '../components/exam/QuestionRenderer';
import { useExamPlatform } from '../context/ExamContext';
import type { KeystrokeTelemetry, ViolationEvent } from '../types/exam';

function formatClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export const ExamTakePage: React.FC = () => {
  const { examId } = useParams<{ examId: string }>();
  const [searchParams] = useSearchParams();
  const attemptId = searchParams.get('attempt') ?? '';
  const navigate = useNavigate();

  const {
    exams,
    questions,
    attempts,
    saveAnswer,
    toggleFlagQuestion,
    updateCurrentIndex,
    recordViolation,
    submitUnlockRequestNote,
    verifyRescuePin,
    submitAttempt,
  } = useExamPlatform();

  const exam = exams.find((e) => e.id === examId);
  const attempt = attempts.find((a) => a.id === attemptId);

  const [fontSizePx, setFontSizePx] = useState(16);
  const [calcOpen, setCalcOpen] = useState(false);
  const [gridOpen, setGridOpen] = useState(false);
  const [confirmSubmitOpen, setConfirmSubmitOpen] = useState(false);
  const [pausedModal, setPausedModal] = useState(false);
  const [pauseReason, setPauseReason] = useState('');
  const [remainingSeconds, setRemainingSeconds] = useState(900);
  const [oneWaySeconds, setOneWaySeconds] = useState(exam?.perQuestionSeconds ?? 60);

  const questionMap = useMemo(
    () => new Map(questions.map((q) => [q.id, q])),
    [questions],
  );

  // Redirect automatically if already SUBMITTED / AUTO_SUBMITTED (e.g. Instructor Reject / Sweeper)
  useEffect(() => {
    if (!attempt || !exam) return;
    if (attempt.status === 'SUBMITTED' || attempt.status === 'AUTO_SUBMITTED') {
      navigate(`/exam/${exam.id}/result?attempt=${attempt.id}`, { replace: true });
    }
  }, [attempt, exam, navigate]);

  // Global countdown with bonusSeconds compensation
  useEffect(() => {
    if (!exam || !attempt) return;
    const computeLeft = () => {
      const startedMs = new Date(attempt.startedAt).getTime();
      const totalAllowedMs =
        (exam.durationMinutes * 60 + attempt.bonusSeconds) * 1000;
      return Math.max(0, Math.floor((startedMs + totalAllowedMs - Date.now()) / 1000));
    };

    setRemainingSeconds(computeLeft());
    const id = window.setInterval(() => {
      const left = computeLeft();
      setRemainingSeconds(left);
      if (left <= 0) {
        window.clearInterval(id);
        void submitAttempt(attempt.id, true);
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [attempt, exam, submitAttempt]);

  const currentIndex = Math.min(
    attempt?.currentQuestionIndex ?? 0,
    Math.max(0, (attempt?.assignedQuestions.length ?? 1) - 1),
  );
  const currentSnapshot = attempt?.assignedQuestions[currentIndex];
  const currentQuestion = currentSnapshot
    ? questionMap.get(currentSnapshot.questionId)
    : undefined;

  // One-way micro-timer per question if enabled
  useEffect(() => {
    if (!exam?.oneWayMode || !attempt || attempt.status === 'LOCKED' || pausedModal) {
      return;
    }
    setOneWaySeconds(exam.perQuestionSeconds);
    const id = window.setInterval(() => {
      setOneWaySeconds((prev) => {
        if (prev <= 1) {
          if (currentIndex < attempt.assignedQuestions.length - 1) {
            updateCurrentIndex(attempt.id, currentIndex + 1);
          } else {
            void submitAttempt(attempt.id, false);
          }
          return exam.perQuestionSeconds;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [attempt, currentIndex, exam, pausedModal, submitAttempt, updateCurrentIndex]);

  const handlePauseChange = useCallback(
    (paused: boolean, _awayDelta: number, reason: string) => {
      setPausedModal(paused);
      if (reason) setPauseReason(reason);
    },
    [],
  );

  const handleViolation = useCallback(
    (event: Omit<ViolationEvent, 'id' | 'occurredAt'>) => {
      if (!attempt) return;
      const res = recordViolation(attempt.id, event);
      if (res.locked) {
        setPausedModal(true);
      }
    },
    [attempt, recordViolation],
  );

  if (!exam || !attempt || !currentSnapshot || !currentQuestion) {
    return (
      <div className="min-h-screen bg-surface-100 flex flex-col items-center justify-center p-6 text-center">
        <p className="text-sm text-ink-700 mb-3">Không tìm thấy phiên thi đang hoạt động.</p>
        <button
          type="button"
          onClick={() => navigate('/')}
          className="px-4 py-2.5 rounded-xl bg-brand-600 text-white text-xs font-bold"
        >
          Về trang chủ
        </button>
      </div>
    );
  }

  const isLocked = attempt.status === 'LOCKED';
  const currentAnswer = attempt.answers[currentQuestion.id];
  const maxLeavesAllowed = exam.maxLeaveCount + attempt.extraLeaveAllowance;
  const answeredCount = Object.keys(attempt.answers).length;
  const isFlagged = attempt.flaggedQuestionIds.includes(currentQuestion.id);

  const handleAnswerChange = (
    payload: string | string[] | Record<string, boolean>,
    telemetry?: KeystrokeTelemetry,
  ) => {
    saveAnswer(attempt.id, currentQuestion.id, payload, telemetry, currentIndex);
    if (
      currentQuestion.type === 'SINGLE_CHOICE' &&
      currentQuestion.aiHoneypotOptionId &&
      payload === currentQuestion.aiHoneypotOptionId
    ) {
      recordViolation(attempt.id, {
        severity: 'HONEYPOT',
        eventType: 'AI_HONEYPOT_OPTION',
        durationSeconds: 0,
        detail: `Chọn đúng đáp án Bẫy AI ở câu ${currentIndex + 1}`,
      });
    }
  };

  const handleConfirmSubmit = async () => {
    setConfirmSubmitOpen(false);
    await submitAttempt(attempt.id, false);
    navigate(`/exam/${exam.id}/result?attempt=${attempt.id}`, { replace: true });
  };

  const lockedWait = attempt.lockedAt
    ? attempt.lockedWaitSeconds +
      Math.max(0, Math.round((Date.now() - new Date(attempt.lockedAt).getTime()) / 1000))
    : attempt.lockedWaitSeconds;

  return (
    <div className="h-[100dvh] flex flex-col bg-surface-100 overflow-hidden relative select-none">
      <DynamicWatermark
        studentCode={attempt.studentCode}
        studentName={attempt.studentName}
        deviceToken={attempt.deviceToken}
      />

      <AntiCheatGuard
        enabled={!isLocked}
        gracePeriodMs={exam.gracePeriodMs}
        isLocked={isLocked}
        onPauseChange={handlePauseChange}
        onViolation={handleViolation}
      />

      {/* Fixed Top Bar (56px) */}
      <header className="h-14 shrink-0 bg-white border-b border-slate-200 px-3 flex items-center justify-between gap-2 z-30">
        <div className="flex items-center gap-2">
          <div
            className={`px-2.5 py-1 rounded-lg font-mono text-sm font-bold flex items-center gap-1.5 ${
              remainingSeconds < 300
                ? 'bg-rose-100 text-rose-700 animate-pulse'
                : 'bg-brand-50 text-brand-700'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            {formatClock(remainingSeconds)}
          </div>
          <span className="text-xs font-mono font-bold text-ink-800">
            {currentIndex + 1}/{attempt.assignedQuestions.length}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <span
            className={`text-[11px] font-semibold px-2 py-1 rounded-lg flex items-center gap-1 ${
              attempt.leaveCount > 0
                ? 'bg-amber-100 text-amber-800'
                : 'bg-support-50 text-support-700'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            {attempt.leaveCount}/{maxLeavesAllowed}
          </span>

          <button
            type="button"
            onClick={() => setFontSizePx((s) => Math.max(14, s - 1))}
            className="w-7 h-7 rounded-lg border border-slate-200 text-xs font-bold text-ink-700 bg-slate-50"
            title="Giảm cỡ chữ"
          >
            A-
          </button>
          <button
            type="button"
            onClick={() => setFontSizePx((s) => Math.min(20, s + 1))}
            className="w-7 h-7 rounded-lg border border-slate-200 text-xs font-bold text-ink-700 bg-slate-50"
            title="Tăng cỡ chữ"
          >
            A+
          </button>
        </div>
      </header>

      {/* One-way micro-timer bar */}
      {exam.oneWayMode && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-1.5 flex items-center justify-between text-[11px] font-semibold text-amber-900 z-30">
          <span>Chế độ 1 chiều (Không quay lại câu trước)</span>
          <span className="font-mono font-bold text-rose-700">
            Chuyển câu sau: {oneWaySeconds}s
          </span>
        </div>
      )}

      {/* Main Scrollable Question Card */}
      <main className="flex-1 overflow-y-auto px-3 sm:px-4 py-4 z-30">
        <div className="max-w-xl mx-auto bg-white rounded-2xl border border-slate-200 shadow-card p-4 sm:p-6">
          <div className="flex items-center justify-between mb-3 pb-2.5 border-b border-slate-100">
            <span className="text-xs font-mono font-extrabold text-brand-600 uppercase">
              Câu hỏi số {currentIndex + 1}
            </span>
            <span className="text-[11px] text-support-600 font-medium">
              {currentAnswer ? '✓ Đã tự lưu câu này' : 'Chưa trả lời'}
            </span>
          </div>

          <QuestionRenderer
            question={currentQuestion}
            snapshot={currentSnapshot}
            value={currentAnswer?.answerPayload}
            fontSizePx={fontSizePx}
            canvasAntiOcr={exam.canvasAntiOcr}
            watermarkLabel={`${attempt.studentCode} - ${attempt.studentName}`}
            onChange={handleAnswerChange}
          />
        </div>
      </main>

      {/* Fixed Bottom Navigation Thumb-Zone (64px) */}
      <footer className="h-16 shrink-0 bg-white border-t border-slate-200 px-3 flex items-center justify-between gap-2 z-30">
        <div className="flex items-center gap-1.5">
          {!exam.oneWayMode && (
            <button
              type="button"
              disabled={currentIndex === 0}
              onClick={() => updateCurrentIndex(attempt.id, currentIndex - 1)}
              className="h-11 px-3 rounded-xl border border-slate-200 bg-slate-50 text-ink-800 disabled:opacity-40 text-xs font-bold flex items-center gap-1"
            >
              <ChevronLeft className="w-4 h-4" />
              Trước
            </button>
          )}
          <button
            type="button"
            onClick={() => toggleFlagQuestion(attempt.id, currentQuestion.id)}
            className={`h-11 w-11 rounded-xl border flex items-center justify-center transition ${
              isFlagged
                ? 'bg-amber-100 border-amber-300 text-amber-800'
                : 'bg-white border-slate-200 text-ink-600'
            }`}
            title="Đánh dấu xem lại"
          >
            <Flag className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setCalcOpen((o) => !o)}
            className={`h-11 px-3 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition ${
              calcOpen
                ? 'bg-brand-600 text-white border-brand-600'
                : 'bg-white border-slate-200 text-ink-700'
            }`}
          >
            <Calculator className="w-4 h-4" />
            <span className="hidden sm:inline">Máy tính</span>
          </button>
          <button
            type="button"
            onClick={() => setGridOpen(true)}
            className="h-11 px-3 rounded-xl border border-slate-200 bg-white text-ink-700 text-xs font-bold flex items-center gap-1"
          >
            <LayoutGrid className="w-4 h-4" />
            <span>{answeredCount}/{attempt.assignedQuestions.length}</span>
          </button>
        </div>

        {currentIndex < attempt.assignedQuestions.length - 1 ? (
          <button
            type="button"
            onClick={() => updateCurrentIndex(attempt.id, currentIndex + 1)}
            className="h-11 px-4 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm"
          >
            Câu tiếp
            <ChevronRight className="w-4 h-4" />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmSubmitOpen(true)}
            className="h-11 px-4 rounded-xl bg-support-600 hover:bg-support-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm"
          >
            <Send className="w-4 h-4" />
            Nộp bài
          </button>
        )}
      </footer>

      <ExamCalculatorSheet isOpen={calcOpen} onClose={() => setCalcOpen(false)} />

      <PauseWarningModal
        isOpen={isLocked || pausedModal}
        isLocked={isLocked}
        reason={pauseReason}
        leaveCount={attempt.leaveCount}
        maxLeaveCount={maxLeavesAllowed}
        totalAwaySeconds={attempt.totalAwaySeconds}
        lockedWaitSeconds={lockedWait}
        onResumeWarning={() => {
          setPausedModal(false);
          document.documentElement.requestFullscreen?.().catch(() => {});
        }}
        onSendUnlockNote={(note) => submitUnlockRequestNote(attempt.id, note)}
        onVerifyRescuePin={(pin) => {
          const ok = verifyRescuePin(attempt.id, pin);
          if (ok) setPausedModal(false);
          return ok;
        }}
      />

      {/* Question Navigator Bottom Sheet */}
      {gridOpen && (
        <div className="fixed inset-0 z-[75] bg-ink-900/50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full max-w-md bg-white rounded-t-2xl sm:rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-ink-900">
                Danh sách câu hỏi ({answeredCount}/{attempt.assignedQuestions.length} đã làm)
              </h3>
              <button
                type="button"
                onClick={() => setGridOpen(false)}
                className="p-1.5 rounded-lg text-ink-500 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="grid grid-cols-5 gap-2">
              {attempt.assignedQuestions.map((snap, idx) => {
                const isDone = Boolean(attempt.answers[snap.questionId]);
                const flagged = attempt.flaggedQuestionIds.includes(snap.questionId);
                const isCur = idx === currentIndex;
                return (
                  <button
                    key={snap.questionId}
                    type="button"
                    disabled={exam.oneWayMode && idx < currentIndex}
                    onClick={() => {
                      updateCurrentIndex(attempt.id, idx);
                      setGridOpen(false);
                    }}
                    className={`h-11 rounded-xl font-mono text-xs font-bold border-2 relative transition disabled:opacity-35 ${
                      isCur
                        ? 'border-brand-600 bg-brand-600 text-white'
                        : isDone
                          ? 'border-support-500 bg-support-50 text-support-700'
                          : 'border-slate-200 bg-white text-ink-700'
                    }`}
                  >
                    {idx + 1}
                    {flagged && (
                      <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-amber-500 border border-white" />
                    )}
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() => {
                setGridOpen(false);
                setConfirmSubmitOpen(true);
              }}
              className="w-full h-11 rounded-xl bg-support-600 text-white text-xs font-bold flex items-center justify-center gap-2"
            >
              <Send className="w-4 h-4" /> Kết thúc & Nộp bài
            </button>
          </div>
        </div>
      )}

      {/* Submit Confirm Modal */}
      {confirmSubmitOpen && (
        <div className="fixed inset-0 z-[80] bg-ink-900/60 flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white rounded-2xl p-5 space-y-4 shadow-2xl">
            <h3 className="text-base font-extrabold text-ink-900">
              Xác nhận nộp bài thi?
            </h3>
            <p className="text-xs text-ink-600 leading-relaxed">
              Bạn đã trả lời <strong>{answeredCount}/{attempt.assignedQuestions.length}</strong> câu hỏi. Sau khi nộp bài, hệ thống sẽ tự chấm và gửi email về <strong>{attempt.studentEmail}</strong>.
            </p>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setConfirmSubmitOpen(false)}
                className="h-11 rounded-xl border border-slate-300 text-xs font-bold text-ink-700"
              >
                Làm tiếp
              </button>
              <button
                type="button"
                onClick={handleConfirmSubmit}
                className="h-11 rounded-xl bg-support-600 text-white text-xs font-bold"
              >
                Chắc chắn nộp
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
