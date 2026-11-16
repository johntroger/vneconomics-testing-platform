import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

function isAnswerPayloadFilled(payload: unknown): boolean {
  if (typeof payload === 'string') return payload.trim().length > 0;
  if (Array.isArray(payload)) {
    return payload.some((item) => String(item ?? '').trim().length > 0);
  }
  if (payload && typeof payload === 'object') {
    return Object.keys(payload).length > 0;
  }
  return false;
}

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
    serverClockOffsetMs,
    syncStatus,
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
  const [viewMode, setViewMode] = useState<'ONE' | 'TEN' | 'ALL'>('ONE');
  const mainScrollRef = useRef<HTMLElement | null>(null);
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
      const nowServerMs = Date.now() + serverClockOffsetMs;
      return Math.max(0, Math.floor((startedMs + totalAllowedMs - nowServerMs) / 1000));
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
  }, [attempt, exam, serverClockOffsetMs, submitAttempt]);

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
  const maxLeavesAllowed = exam.maxLeaveCount + attempt.extraLeaveAllowance;
  const answeredCount = attempt.assignedQuestions.filter((snap) =>
    isAnswerPayloadFilled(attempt.answers[snap.questionId]?.answerPayload),
  ).length;
  const isFlagged = attempt.flaggedQuestionIds.includes(currentQuestion.id);

  const handleQuestionAnswerChange = (
    targetQuestion: NonNullable<typeof currentQuestion>,
    targetIdx: number,
    payload: string | string[] | Record<string, boolean>,
    telemetry?: KeystrokeTelemetry,
  ) => {
    saveAnswer(attempt.id, targetQuestion.id, payload, telemetry, targetIdx);
    if (
      targetQuestion.type === 'SINGLE_CHOICE' &&
      targetQuestion.aiHoneypotOptionId &&
      payload === targetQuestion.aiHoneypotOptionId
    ) {
      recordViolation(attempt.id, {
        severity: 'HONEYPOT',
        eventType: 'AI_HONEYPOT_OPTION',
        durationSeconds: 0,
        detail: `Chọn đúng đáp án Bẫy AI ở câu ${targetIdx + 1}`,
      });
    }
  };

  const effectiveViewMode: 'ONE' | 'TEN' | 'ALL' = exam.oneWayMode ? 'ONE' : viewMode;
  const totalQuestions = attempt.assignedQuestions.length;
  const pageSize = 10;
  const currentPage = Math.floor(currentIndex / pageSize);
  const totalPages = Math.max(1, Math.ceil(totalQuestions / pageSize));
  const visibleSliceStart =
    effectiveViewMode === 'ONE'
      ? currentIndex
      : effectiveViewMode === 'TEN'
        ? currentPage * pageSize
        : 0;
  const visibleSliceEnd =
    effectiveViewMode === 'ONE'
      ? currentIndex + 1
      : effectiveViewMode === 'TEN'
        ? Math.min(totalQuestions, (currentPage + 1) * pageSize)
        : totalQuestions;
  const visibleEntries = attempt.assignedQuestions
    .slice(visibleSliceStart, visibleSliceEnd)
    .map((snap, offset) => ({
      snap,
      idx: visibleSliceStart + offset,
      qObj: questionMap.get(snap.questionId),
    }));

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
        requireFullscreen={Boolean(exam.requireFullscreen)}
        onPauseChange={handlePauseChange}
        onViolation={handleViolation}
      />

      {/* Fixed Top Bar */}
      <header className="safe-top shrink-0 bg-white border-b border-slate-200 z-30">
        <div className="min-h-[52px] py-1.5 px-2.5 sm:px-4 flex items-center justify-between gap-1.5">
          <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
            <div
              className={`px-2 sm:px-2.5 py-1 rounded-lg font-mono text-xs sm:text-sm font-bold flex items-center gap-1 shrink-0 whitespace-nowrap ${
                remainingSeconds < 300
                  ? 'bg-rose-100 text-rose-700 animate-pulse'
                  : 'bg-brand-50 text-brand-700'
              }`}
            >
              <Clock className="w-3.5 h-3.5 shrink-0" />
              {formatClock(remainingSeconds)}
            </div>
            <span className="text-xs font-mono font-bold text-ink-800 shrink-0 whitespace-nowrap">
              {currentIndex + 1}/{attempt.assignedQuestions.length}
            </span>
          </div>

          <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
            <span
              className={`text-[11px] font-semibold px-2 py-1 rounded-lg flex items-center gap-1 shrink-0 whitespace-nowrap ${
                attempt.leaveCount > 0
                  ? 'bg-amber-100 text-amber-800'
                  : 'bg-support-50 text-support-700'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
              {attempt.leaveCount}/{maxLeavesAllowed}
            </span>

            <span
              className={`hidden sm:inline-flex items-center px-2 py-1 rounded-lg text-[10px] font-bold whitespace-nowrap ${
                syncStatus === 'SAVED'
                  ? 'bg-emerald-50 text-emerald-700'
                  : syncStatus === 'SAVING'
                    ? 'bg-amber-50 text-amber-800'
                    : 'bg-slate-100 text-ink-600'
              }`}
              title="Trạng thái lưu bài làm"
            >
              {syncStatus === 'SAVED'
                ? 'Đã lưu ✓'
                : syncStatus === 'SAVING'
                  ? 'Đang lưu...'
                  : 'Lưu cục bộ'}
            </span>

            <button
              type="button"
              onClick={() => setFontSizePx((s) => Math.max(14, s - 1))}
              className="w-7 h-7 rounded-lg border border-slate-200 text-xs font-bold text-ink-700 bg-slate-50 shrink-0"
              title="Giảm cỡ chữ"
            >
              A-
            </button>
            <button
              type="button"
              onClick={() => setFontSizePx((s) => Math.min(20, s + 1))}
              className="w-7 h-7 rounded-lg border border-slate-200 text-xs font-bold text-ink-700 bg-slate-50 shrink-0"
              title="Tăng cỡ chữ"
            >
              A+
            </button>
          </div>
        </div>
      </header>

      {/* View Mode Switcher Bar (1 câu / 10 câu / Tất cả) */}
      {!exam.oneWayMode && (
        <div className="bg-slate-50 border-b border-slate-200 px-2.5 sm:px-4 py-1.5 flex items-center justify-between gap-2 z-30 shrink-0">
          <span className="text-[11px] font-semibold text-ink-600 hidden sm:inline">
            Chế độ hiển thị:
          </span>
          <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl p-0.5 mx-auto sm:mx-0">
            {(
              [
                ['ONE', '1 câu'],
                ['TEN', '10 câu / trang'],
                ['ALL', `Tất cả (${totalQuestions})`],
              ] as const
            ).map(([modeKey, label]) => (
              <button
                key={modeKey}
                type="button"
                onClick={() => {
                  setViewMode(modeKey);
                  mainScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition whitespace-nowrap ${
                  effectiveViewMode === modeKey
                    ? 'bg-brand-600 text-white shadow-2xs'
                    : 'text-ink-600 hover:bg-slate-50'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {effectiveViewMode === 'TEN' && (
            <span className="text-[11px] font-mono font-bold text-brand-700 whitespace-nowrap">
              Trang {currentPage + 1}/{totalPages}
            </span>
          )}
        </div>
      )}

      {/* One-way micro-timer bar */}
      {exam.oneWayMode && (
        <div className="bg-amber-50 border-b border-amber-200 px-3 sm:px-4 py-1.5 flex items-center justify-between gap-2 text-[11px] font-semibold text-amber-900 z-30 shrink-0">
          <span className="truncate">Chế độ 1 chiều (Không quay lại câu trước)</span>
          <span className="font-mono font-bold text-rose-700 shrink-0 whitespace-nowrap">
            Chuyển câu sau: {oneWaySeconds}s
          </span>
        </div>
      )}

      {/* Main Scrollable Question Card(s) */}
      <main ref={mainScrollRef} className="flex-1 overflow-y-auto px-3 sm:px-4 pt-3.5 pb-6 z-30">
        <div className="max-w-xl mx-auto space-y-4">
          {visibleEntries.map(({ snap, idx, qObj }) => {
            if (!qObj) return null;
            const ans = attempt.answers[qObj.id];
            const isAnsDone = isAnswerPayloadFilled(ans?.answerPayload);
            const itemFlagged = attempt.flaggedQuestionIds.includes(qObj.id);
            return (
              <div
                key={snap.questionId}
                id={`exam-q-${idx}`}
                className="bg-white rounded-2xl border border-slate-200 shadow-card p-4 sm:p-6"
              >
                <div className="flex items-center justify-between gap-2 mb-3 pb-2.5 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-extrabold text-brand-600 uppercase">
                      Câu hỏi số {idx + 1}
                    </span>
                    {effectiveViewMode !== 'ONE' && (
                      <button
                        type="button"
                        onClick={() => toggleFlagQuestion(attempt.id, qObj.id)}
                        className={`p-1 rounded-lg border text-[10px] font-bold flex items-center gap-1 ${
                          itemFlagged
                            ? 'bg-amber-50 border-amber-400 text-amber-700'
                            : 'bg-white border-slate-200 text-ink-500 hover:bg-slate-50'
                        }`}
                        title="Đánh dấu xem lại"
                      >
                        <Flag className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                  <span
                    className={`text-[11px] font-medium shrink-0 ${
                      isAnsDone ? 'text-support-600' : 'text-ink-400'
                    }`}
                  >
                    {isAnsDone ? '✓ Đã tự lưu câu này' : 'Chưa trả lời'}
                  </span>
                </div>

                <QuestionRenderer
                  question={qObj}
                  snapshot={snap}
                  value={ans?.answerPayload}
                  fontSizePx={fontSizePx}
                  canvasAntiOcr={exam.canvasAntiOcr}
                  watermarkLabel={`${attempt.studentCode} - ${attempt.studentName}`}
                  onChange={(payload, telemetry) =>
                    handleQuestionAnswerChange(qObj, idx, payload, telemetry)
                  }
                />
              </div>
            );
          })}
        </div>
      </main>

      {/* Fixed Bottom Navigation Thumb-Zone */}
      <footer className="min-h-[60px] pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] shrink-0 bg-white border-t border-slate-200 px-2.5 sm:px-4 flex items-center justify-between gap-1.5 z-30">
        <div className="flex items-center gap-1 sm:gap-1.5 min-w-0">
          {!exam.oneWayMode && effectiveViewMode !== 'ALL' && (
            <button
              type="button"
              disabled={effectiveViewMode === 'ONE' ? currentIndex === 0 : currentPage === 0}
              onClick={() => {
                if (effectiveViewMode === 'ONE') {
                  updateCurrentIndex(attempt.id, currentIndex - 1);
                } else {
                  updateCurrentIndex(attempt.id, Math.max(0, (currentPage - 1) * pageSize));
                  mainScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
                }
              }}
              aria-label={effectiveViewMode === 'ONE' ? 'Câu trước' : 'Trang trước'}
              className="h-10 px-2 sm:px-3 rounded-xl border border-slate-200 bg-slate-50 text-ink-800 disabled:opacity-40 text-xs font-bold flex items-center gap-1 shrink-0 whitespace-nowrap"
            >
              <ChevronLeft className="w-4 h-4" />
              <span className="hidden min-[360px]:inline">
                {effectiveViewMode === 'ONE' ? 'Trước' : 'Trang trước'}
              </span>
            </button>
          )}
          <button
            type="button"
            onClick={() => toggleFlagQuestion(attempt.id, currentQuestion.id)}
            className={`h-10 w-10 rounded-xl border flex items-center justify-center transition shrink-0 ${
              isFlagged
                ? 'bg-amber-100 border-amber-300 text-amber-800'
                : 'bg-white border-slate-200 text-ink-600'
            }`}
            title="Đánh dấu xem lại"
            aria-label="Đánh dấu xem lại"
          >
            <Flag className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setCalcOpen((o) => !o)}
            className={`h-10 w-10 sm:w-auto sm:px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition shrink-0 ${
              calcOpen
                ? 'bg-brand-600 text-white border-brand-600'
                : 'bg-white border-slate-200 text-ink-700'
            }`}
            title="Máy tính & Bảng nháp"
            aria-label="Máy tính & Bảng nháp"
          >
            <Calculator className="w-4 h-4" />
            <span className="hidden sm:inline">Máy tính</span>
          </button>
          <button
            type="button"
            onClick={() => setGridOpen(true)}
            className="h-10 px-2.5 rounded-xl border border-slate-200 bg-white text-ink-700 text-xs font-bold flex items-center gap-1 shrink-0 whitespace-nowrap"
            title="Danh sách câu hỏi"
          >
            <LayoutGrid className="w-4 h-4" />
            <span>{answeredCount}/{attempt.assignedQuestions.length}</span>
          </button>
        </div>

        {effectiveViewMode === 'ONE' && currentIndex < totalQuestions - 1 ? (
          <button
            type="button"
            onClick={() => updateCurrentIndex(attempt.id, currentIndex + 1)}
            className="h-10 px-3.5 sm:px-4 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm shrink-0 whitespace-nowrap"
          >
            Câu tiếp
            <ChevronRight className="w-4 h-4" />
          </button>
        ) : effectiveViewMode === 'TEN' && currentPage < totalPages - 1 ? (
          <button
            type="button"
            onClick={() => {
              updateCurrentIndex(attempt.id, Math.min(totalQuestions - 1, (currentPage + 1) * pageSize));
              mainScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className="h-10 px-3.5 sm:px-4 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm shrink-0 whitespace-nowrap"
          >
            Trang tiếp
            <ChevronRight className="w-4 h-4" />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmSubmitOpen(true)}
            className="h-10 px-3.5 sm:px-4 rounded-xl bg-support-600 hover:bg-support-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm shrink-0 whitespace-nowrap"
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
          <div className="w-full max-w-md bg-white rounded-t-2xl sm:rounded-2xl max-h-[82dvh] flex flex-col overflow-hidden">
            <div className="px-5 pt-4 pb-3 flex items-center justify-between border-b border-slate-100 shrink-0">
              <h3 className="text-sm font-bold text-ink-900">
                Danh sách câu hỏi ({answeredCount}/{attempt.assignedQuestions.length} đã làm)
              </h3>
              <button
                type="button"
                onClick={() => setGridOpen(false)}
                className="p-1.5 rounded-lg text-ink-500 hover:bg-slate-100 shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto max-h-[55dvh]">
              <div className="grid grid-cols-5 gap-2">
                {attempt.assignedQuestions.map((snap, idx) => {
                  const isDone = isAnswerPayloadFilled(
                    attempt.answers[snap.questionId]?.answerPayload,
                  );
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
                        if (effectiveViewMode !== 'ONE') {
                          window.requestAnimationFrame(() => {
                            document
                              .getElementById(`exam-q-${idx}`)
                              ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                          });
                        }
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
            </div>
            <div className="px-5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] border-t border-slate-100 bg-white shrink-0">
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
            {(() => {
              const unansweredIndices = attempt.assignedQuestions
                .map((snap, idx) => (!attempt.answers[snap.questionId] ? idx : -1))
                .filter((idx) => idx >= 0);
              const flaggedIndices = attempt.assignedQuestions
                .map((snap, idx) =>
                  attempt.flaggedQuestionIds.includes(snap.questionId) ? idx : -1,
                )
                .filter((idx) => idx >= 0);

              if (unansweredIndices.length === 0 && flaggedIndices.length === 0) {
                return null;
              }
              return (
                <div className="space-y-2 text-[11px]">
                  {unansweredIndices.length > 0 && (
                    <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 space-y-1.5">
                      <div className="font-bold text-rose-800">
                        Còn {unansweredIndices.length} câu chưa trả lời:
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {unansweredIndices.map((idx) => (
                          <button
                            key={idx}
                            type="button"
                            disabled={exam.oneWayMode}
                            onClick={() => {
                              updateCurrentIndex(attempt.id, idx);
                              setConfirmSubmitOpen(false);
                            }}
                            className="px-2 py-0.5 rounded-md bg-white border border-rose-300 text-rose-700 font-mono font-bold hover:bg-rose-100 disabled:opacity-60"
                          >
                            Câu {idx + 1}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {flaggedIndices.length > 0 && (
                    <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 space-y-1.5">
                      <div className="font-bold text-amber-900">
                        Đang gắn cờ xem lại ({flaggedIndices.length} câu):
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {flaggedIndices.map((idx) => (
                          <button
                            key={idx}
                            type="button"
                            disabled={exam.oneWayMode}
                            onClick={() => {
                              updateCurrentIndex(attempt.id, idx);
                              setConfirmSubmitOpen(false);
                            }}
                            className="px-2 py-0.5 rounded-md bg-white border border-amber-300 text-amber-800 font-mono font-bold hover:bg-amber-100 disabled:opacity-60"
                          >
                            Câu {idx + 1}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
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
