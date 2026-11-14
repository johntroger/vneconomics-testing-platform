import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  SEED_ATTEMPTS,
  SEED_COURSES,
  SEED_EMAIL_LOGS,
  SEED_EXAMS,
  SEED_QUESTIONS,
} from '../data/seedEconomicsData';
import {
  ADMIN_TOKEN_KEY,
  apiRequest,
  getOrCreateDeviceToken,
  pingPhpApi,
  STORAGE_KEY,
  SYNC_CHANNEL_NAME,
} from '../services/apiClient';
import type {
  Course,
  EmailLogEntry,
  Exam,
  ExamAttempt,
  KeystrokeTelemetry,
  Question,
  RubricSlot,
  ViolationEvent,
} from '../types/exam';
import { buildExamCsvContent } from '../utils/csvExport';
import {
  buildAssignedQuestions,
  computeChapterMastery,
  gradeAnswer,
  gradeMicroEssayRubric,
  recalculateAttemptScores,
} from '../utils/dynamicQuestionEngine';

interface StartAttemptInput {
  pin: string;
  studentCode: string;
  studentName: string;
  className: string;
  studentEmail: string;
}

interface StartAttemptResult {
  ok: boolean;
  error?: string;
  attemptId?: string;
  examId?: string;
  resumed?: boolean;
  alreadySubmitted?: boolean;
}

interface ExamPlatformState {
  courses: Course[];
  questions: Question[];
  exams: Exam[];
  attempts: ExamAttempt[];
  emailLogs: EmailLogEntry[];
}

interface ExamContextValue extends ExamPlatformState {
  backendConnected: boolean;
  isAdminAuthenticated: boolean;
  adminLogin: (passcode: string) => Promise<boolean>;
  adminLogout: () => void;
  startOrResumeAttempt: (input: StartAttemptInput) => Promise<StartAttemptResult>;
  saveAnswer: (
    attemptId: string,
    questionId: string,
    payload: string | string[] | Record<string, boolean>,
    telemetry?: KeystrokeTelemetry,
    nextQuestionIndex?: number,
  ) => void;
  toggleFlagQuestion: (attemptId: string, questionId: string) => void;
  updateCurrentIndex: (attemptId: string, idx: number) => void;
  recordViolation: (
    attemptId: string,
    event: Omit<ViolationEvent, 'id' | 'occurredAt'>,
  ) => { locked: boolean };
  submitUnlockRequestNote: (attemptId: string, note: string) => void;
  verifyRescuePin: (attemptId: string, pin: string) => boolean;
  submitAttempt: (
    attemptId: string,
    forcedByRejectOrSweep?: boolean,
  ) => Promise<ExamAttempt | null>;
  correctStudentEmail: (attemptId: string, newEmail: string) => boolean;
  proctorDecision: (
    attemptId: string,
    decision: 'ACCEPT_KEEP' | 'ACCEPT_COMPENSATE' | 'REJECT',
    extraSeconds?: number,
  ) => void;
  resetAttemptDevice: (attemptId: string) => void;
  addBonusTimeToAttempt: (attemptId: string, extraSeconds: number) => void;
  closeExamAndSweep: (examId: string) => { sweptCount: number };
  overrideEssayScore: (
    attemptId: string,
    questionId: string,
    newScore: number,
    note?: string,
  ) => void;
  enrichRubricAndRegradeExam: (
    examId: string,
    questionId: string,
    slotId: string,
    newPhrase: string,
  ) => { updatedCount: number };
  addCourse: (course: Omit<Course, 'id'>) => void;
  upsertQuestion: (question: Question) => void;
  deleteQuestion: (questionId: string) => void;
  importQuestionsBulk: (
    questions: Question[],
    options?: {
      mode?: 'UPSERT' | 'APPEND' | 'REPLACE_COURSE';
      courseId?: string;
      syncExamId?: string;
    },
  ) => { addedCount: number; updatedCount: number; syncedChapters: number };
  upsertExam: (exam: Exam) => void;
  cloneExam: (examId: string) => Exam | null;
  resendStudentScoreEmail: (attemptId: string, editedEmail?: string) => void;
  sendTestMailer: (recipient: string) => EmailLogEntry;
  resetDemoData: () => void;
}

const ExamContext = createContext<ExamContextValue | null>(null);

function loadInitialState(): ExamPlatformState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as ExamPlatformState;
      if (
        Array.isArray(parsed.courses) &&
        Array.isArray(parsed.questions) &&
        Array.isArray(parsed.exams) &&
        Array.isArray(parsed.attempts)
      ) {
        return {
          courses: parsed.courses,
          questions: parsed.questions,
          exams: parsed.exams,
          attempts: parsed.attempts,
          emailLogs: Array.isArray(parsed.emailLogs) ? parsed.emailLogs : SEED_EMAIL_LOGS,
        };
      }
    }
  } catch {
    // Fallback cleanly to seed data
  }
  return {
    courses: SEED_COURSES,
    questions: SEED_QUESTIONS,
    exams: SEED_EXAMS,
    attempts: SEED_ATTEMPTS,
    emailLogs: SEED_EMAIL_LOGS,
  };
}

export const ExamProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [state, setState] = useState<ExamPlatformState>(loadInitialState);
  const [backendConnected, setBackendConnected] = useState(false);
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(() =>
    Boolean(sessionStorage.getItem(ADMIN_TOKEN_KEY)),
  );

  const persistState = useCallback((next: ExamPlatformState) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      if (typeof BroadcastChannel !== 'undefined') {
        const ch = new BroadcastChannel(SYNC_CHANNEL_NAME);
        ch.postMessage({ type: 'STATE_UPDATED', ts: Date.now() });
        ch.close();
      }
    } catch {
      // Ignore storage quota issues gracefully
    }
  }, []);

  const updateState = useCallback(
    (updater: (prev: ExamPlatformState) => ExamPlatformState) => {
      setState((prev) => {
        const next = updater(prev);
        persistState(next);
        return next;
      });
    },
    [persistState],
  );

  useEffect(() => {
    pingPhpApi().then((alive) => setBackendConnected(alive));

    const handleStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue) as ExamPlatformState;
          setState(parsed);
        } catch {
          // Ignore malformed external update
        }
      }
    };

    let ch: BroadcastChannel | null = null;
    if (typeof BroadcastChannel !== 'undefined') {
      ch = new BroadcastChannel(SYNC_CHANNEL_NAME);
      ch.onmessage = () => {
        setState(loadInitialState());
      };
    }

    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener('storage', handleStorage);
      if (ch) ch.close();
    };
  }, []);

  const adminLogin = useCallback(
    async (passcode: string): Promise<boolean> => {
      if (backendConnected) {
        const res = await apiRequest<{ ok: boolean; token?: string }>(
          '/api/admin_auth.php',
          {
            method: 'POST',
            body: JSON.stringify({ passcode }),
          },
        );
        if (res?.ok && res.token) {
          sessionStorage.setItem(ADMIN_TOKEN_KEY, res.token);
          setIsAdminAuthenticated(true);
          return true;
        }
      }
      if (passcode.trim() === 'vne2026' || passcode.trim() === '8888') {
        const localToken = `local_hmac_${btoa(passcode + ':' + Date.now())}`;
        sessionStorage.setItem(ADMIN_TOKEN_KEY, localToken);
        setIsAdminAuthenticated(true);
        return true;
      }
      return false;
    },
    [backendConnected],
  );

  const adminLogout = useCallback(() => {
    sessionStorage.removeItem(ADMIN_TOKEN_KEY);
    setIsAdminAuthenticated(false);
  }, []);

  const startOrResumeAttempt = useCallback(
    async (input: StartAttemptInput): Promise<StartAttemptResult> => {
      const normalizedPin = input.pin.trim();
      const normalizedCode = input.studentCode.trim().toUpperCase();
      const normalizedEmail = input.studentEmail.trim().toLowerCase();

      const exam = state.exams.find((e) => e.roomPin === normalizedPin);
      if (!exam) {
        return { ok: false, error: 'Không tìm thấy phòng thi với mã PIN này.' };
      }
      if (exam.status !== 'OPEN') {
        return {
          ok: false,
          error:
            exam.status === 'CLOSED'
              ? 'Ca thi này đã kết thúc và đóng cổng nộp bài.'
              : 'Phòng thi đang ở trạng thái Nháp, giảng viên chưa mở phòng.',
        };
      }
      if (
        exam.rosterWhitelist.length > 0 &&
        !exam.rosterWhitelist.map((s) => s.trim().toUpperCase()).includes(normalizedCode)
      ) {
        return {
          ok: false,
          error: `MSSV ${normalizedCode} không nằm trong danh sách lớp được phép thi ca này.`,
        };
      }

      const myDeviceToken = getOrCreateDeviceToken();
      const existing = state.attempts.find(
        (a) =>
          a.examId === exam.id &&
          a.studentCode.toUpperCase() === normalizedCode,
      );

      if (existing) {
        if (
          existing.status === 'SUBMITTED' ||
          existing.status === 'AUTO_SUBMITTED'
        ) {
          return {
            ok: true,
            attemptId: existing.id,
            examId: exam.id,
            resumed: true,
            alreadySubmitted: true,
          };
        }
        if (existing.deviceToken && existing.deviceToken !== myDeviceToken) {
          updateState((prev) => ({
            ...prev,
            attempts: prev.attempts.map((a) =>
              a.id === existing.id
                ? {
                    ...a,
                    aiFlag: true,
                    aiFlagReason: 'Phát hiện đăng nhập trùng MSSV từ thiết bị thứ 2',
                    violations: [
                      ...a.violations,
                      {
                        id: `vio_${Date.now()}`,
                        severity: 'DUPLICATE_DEVICE',
                        eventType: 'DUPLICATE_LOGIN',
                        durationSeconds: 0,
                        detail: 'Cố gắng mở bài thi từ thiết bị khác cùng MSSV',
                        occurredAt: new Date().toISOString(),
                      },
                    ],
                  }
                : a,
            ),
          }));
          return {
            ok: false,
            error:
              'MSSV này đang làm bài trên một thiết bị khác (Single-Device Lock). Nếu bạn đổi điện thoại dự phòng, vui lòng nhờ Giảng viên bấm "Reset Thiết bị MSSV".',
          };
        }

        // Same device -> Seamless Crash & Reload recovery
        updateState((prev) => ({
          ...prev,
          attempts: prev.attempts.map((a) =>
            a.id === existing.id ? { ...a, deviceToken: myDeviceToken } : a,
          ),
        }));
        return {
          ok: true,
          attemptId: existing.id,
          examId: exam.id,
          resumed: true,
        };
      }

      const assigned = buildAssignedQuestions(exam, state.questions, normalizedCode);
      if (assigned.length === 0) {
        return { ok: false, error: 'Đề thi chưa có câu hỏi trong ngân hàng.' };
      }

      const maxTotalScore =
        Math.round(assigned.reduce((s, q) => s + q.maxPoints, 0) * 100) / 100;
      const newAttempt: ExamAttempt = {
        id: `att_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
        examId: exam.id,
        studentCode: normalizedCode,
        studentName: input.studentName.trim(),
        studentEmail: normalizedEmail,
        className: input.className.trim(),
        deviceToken: myDeviceToken,
        assignedQuestions: assigned,
        answers: {},
        status: 'IN_PROGRESS',
        currentQuestionIndex: 0,
        flaggedQuestionIds: [],
        leaveCount: 0,
        extraLeaveAllowance: 0,
        minorBlurCount: 0,
        totalAwaySeconds: 0,
        lockedWaitSeconds: 0,
        bonusSeconds: 0,
        integrityScore: 100,
        aiFlag: false,
        autoScore: 0,
        essayScore: 0,
        totalScore: 0,
        maxTotalScore,
        scale10Score: 0,
        emailSentStatus: 'PENDING',
        emailEditCount: 0,
        startedAt: new Date().toISOString(),
        violations: [],
      };

      updateState((prev) => ({
        ...prev,
        attempts: [newAttempt, ...prev.attempts],
      }));

      if (backendConnected) {
        void apiRequest('/api/attempts.php?action=start', {
          method: 'POST',
          body: JSON.stringify(newAttempt),
        });
      }

      return {
        ok: true,
        attemptId: newAttempt.id,
        examId: exam.id,
        resumed: false,
      };
    },
    [backendConnected, state.attempts, state.exams, state.questions, updateState],
  );

  const saveAnswer = useCallback(
    (
      attemptId: string,
      questionId: string,
      payload: string | string[] | Record<string, boolean>,
      telemetry?: KeystrokeTelemetry,
      nextQuestionIndex?: number,
    ) => {
      updateState((prev) => {
        const question = prev.questions.find((q) => q.id === questionId);
        if (!question) return prev;

        return {
          ...prev,
          attempts: prev.attempts.map((a) => {
            if (a.id !== attemptId) return a;
            const snap = a.assignedQuestions.find((s) => s.questionId === questionId);
            if (!snap) return a;
            const graded = gradeAnswer(question, snap, payload);
            if (telemetry) {
              graded.keystrokeTelemetry = telemetry;
            }
            const updated: ExamAttempt = {
              ...a,
              currentQuestionIndex:
                nextQuestionIndex !== undefined
                  ? nextQuestionIndex
                  : a.currentQuestionIndex,
              answers: {
                ...a.answers,
                [questionId]: graded,
              },
            };
            return recalculateAttemptScores(updated, prev.questions);
          }),
        };
      });

      if (backendConnected) {
        void apiRequest('/api/attempts.php?action=heartbeat', {
          method: 'POST',
          body: JSON.stringify({
            attemptId,
            questionId,
            answerPayload: payload,
            keystrokeTelemetry: telemetry,
            currentQuestionIndex: nextQuestionIndex,
          }),
        });
      }
    },
    [backendConnected, updateState],
  );

  const toggleFlagQuestion = useCallback(
    (attemptId: string, questionId: string) => {
      updateState((prev) => ({
        ...prev,
        attempts: prev.attempts.map((a) => {
          if (a.id !== attemptId) return a;
          const exists = a.flaggedQuestionIds.includes(questionId);
          return {
            ...a,
            flaggedQuestionIds: exists
              ? a.flaggedQuestionIds.filter((id) => id !== questionId)
              : [...a.flaggedQuestionIds, questionId],
          };
        }),
      }));
    },
    [updateState],
  );

  const updateCurrentIndex = useCallback(
    (attemptId: string, idx: number) => {
      updateState((prev) => ({
        ...prev,
        attempts: prev.attempts.map((a) =>
          a.id === attemptId ? { ...a, currentQuestionIndex: idx } : a,
        ),
      }));
    },
    [updateState],
  );

  const recordViolation = useCallback(
    (
      attemptId: string,
      event: Omit<ViolationEvent, 'id' | 'occurredAt'>,
    ): { locked: boolean } => {
      let lockedResult = false;
      updateState((prev) => ({
        ...prev,
        attempts: prev.attempts.map((a) => {
          if (a.id !== attemptId) return a;
          if (a.status === 'SUBMITTED' || a.status === 'AUTO_SUBMITTED') return a;

          const exam = prev.exams.find((e) => e.id === a.examId);
          const maxLeaves =
            (exam?.maxLeaveCount ?? 3) + (a.extraLeaveAllowance ?? 0);
          const maxAway = exam?.maxAwaySeconds ?? 45;

          const isMinor = event.severity === 'MINOR_BLUR';
          const isMajor =
            event.severity === 'MAJOR_LEAVE' ||
            event.severity === 'SPLIT_SCREEN' ||
            event.severity === 'DEVTOOLS';

          const nextLeave = isMajor ? a.leaveCount + 1 : a.leaveCount;
          const nextMinor = isMinor ? a.minorBlurCount + 1 : a.minorBlurCount;
          const nextAway = a.totalAwaySeconds + event.durationSeconds;

          const shouldLock =
            event.severity === 'SPLIT_SCREEN' ||
            nextLeave >= maxLeaves ||
            nextAway >= maxAway;

          lockedResult = shouldLock;

          const nextIntegrity = Math.max(
            0,
            Math.min(
              100,
              100 -
                nextLeave * 12 -
                Math.floor(nextAway / 5) * 3 -
                nextMinor * 2 -
                (event.severity === 'HONEYPOT' ? 40 : 0),
            ),
          );

          const fullEvent: ViolationEvent = {
            ...event,
            id: `vio_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`,
            occurredAt: new Date().toISOString(),
          };

          return {
            ...a,
            leaveCount: nextLeave,
            minorBlurCount: nextMinor,
            totalAwaySeconds: nextAway,
            integrityScore: nextIntegrity,
            aiFlag: a.aiFlag || event.severity === 'HONEYPOT',
            aiFlagReason:
              event.severity === 'HONEYPOT'
                ? 'Phát hiện từ khóa / đáp án Bẫy AI Honeypot'
                : a.aiFlagReason,
            status: shouldLock ? 'LOCKED' : a.status,
            lockedAt:
              shouldLock && !a.lockedAt
                ? new Date().toISOString()
                : a.lockedAt,
            violations: [...a.violations, fullEvent],
          };
        }),
      }));

      if (backendConnected) {
        void apiRequest('/api/proctor.php?action=log', {
          method: 'POST',
          body: JSON.stringify({ attemptId, ...event }),
        });
      }

      return { locked: lockedResult };
    },
    [backendConnected, updateState],
  );

  const submitUnlockRequestNote = useCallback(
    (attemptId: string, note: string) => {
      updateState((prev) => ({
        ...prev,
        attempts: prev.attempts.map((a) =>
          a.id === attemptId ? { ...a, unlockRequestNote: note } : a,
        ),
      }));

      if (backendConnected) {
        void apiRequest('/api/proctor.php?action=unlock_note', {
          method: 'POST',
          body: JSON.stringify({ attemptId, note }),
        });
      }
    },
    [backendConnected, updateState],
  );

  const verifyRescuePin = useCallback(
    (attemptId: string, pin: string): boolean => {
      const attempt = state.attempts.find((a) => a.id === attemptId);
      const exam = state.exams.find((e) => e.id === attempt?.examId);
      if (!attempt || !exam) return false;
      if (pin.trim() !== exam.unlockPin.trim()) return false;

      updateState((prev) => ({
        ...prev,
        attempts: prev.attempts.map((a) => {
          if (a.id !== attemptId) return a;
          const waitDelta = a.lockedAt
            ? Math.max(
                0,
                Math.round((Date.now() - new Date(a.lockedAt).getTime()) / 1000),
              )
            : 0;
          return {
            ...a,
            status: 'IN_PROGRESS',
            lockedAt: undefined,
            lockedWaitSeconds: a.lockedWaitSeconds + waitDelta,
            extraLeaveAllowance: Math.max(
              a.extraLeaveAllowance + 1,
              a.leaveCount - (exam.maxLeaveCount - 1),
            ),
          };
        }),
      }));

      if (backendConnected) {
        void apiRequest('/api/proctor.php?action=rescue_pin', {
          method: 'POST',
          body: JSON.stringify({ attemptId, pin }),
        });
      }

      return true;
    },
    [backendConnected, state.attempts, state.exams, updateState],
  );

  const submitAttempt = useCallback(
    async (
      attemptId: string,
      forcedByRejectOrSweep = false,
    ): Promise<ExamAttempt | null> => {
      let finalized: ExamAttempt | null = null;
      const nowIso = new Date().toISOString();

      updateState((prev) => {
        const current = prev.attempts.find((a) => a.id === attemptId);
        if (!current) return prev;
        const exam = prev.exams.find((e) => e.id === current.examId);
        const reScored = recalculateAttemptScores(current, prev.questions);

        const isDelayed = exam?.emailDeliveryMode === 'DELAYED_BATCH' && exam.status !== 'CLOSED';
        finalized = {
          ...reScored,
          status: forcedByRejectOrSweep ? 'AUTO_SUBMITTED' : 'SUBMITTED',
          submittedAt: reScored.submittedAt ?? nowIso,
          lockedAt: undefined,
          emailSentStatus: isDelayed ? 'RECEIPT_SENT' : 'SENT',
          emailSentAt: nowIso,
        };

        const mailLog: EmailLogEntry = {
          id: `mail_${Date.now().toString(36)}`,
          recipient: finalized.studentEmail,
          subject: isDelayed
            ? `[VNEconomics Testing] Biên nhận nộp bài: ${exam?.title ?? ''}`
            : `[VNEconomics Testing] Kết quả bài thi: ${exam?.title ?? ''}`,
          kind: isDelayed ? 'STUDENT_RECEIPT' : 'STUDENT_SCORE',
          status: 'SENT',
          summary: isDelayed
            ? `Biên nhận thu bài thành công (${finalized.studentCode}). Điểm chi tiết gửi sau khi đóng ca thi.`
            : `Điểm quy đổi ${finalized.scale10Score.toFixed(2)}/10 (${finalized.totalScore}/${finalized.maxTotalScore}đ) | Tin cậy: ${finalized.integrityScore}%`,
          sentAt: nowIso,
        };

        return {
          ...prev,
          attempts: prev.attempts.map((a) => (a.id === attemptId ? finalized! : a)),
          emailLogs: [mailLog, ...prev.emailLogs],
        };
      });

      if (backendConnected && finalized) {
        void apiRequest('/api/attempts.php?action=submit', {
          method: 'POST',
          body: JSON.stringify(finalized),
        });
      }

      return finalized;
    },
    [backendConnected, updateState],
  );

  const correctStudentEmail = useCallback(
    (attemptId: string, newEmail: string): boolean => {
      const att = state.attempts.find((a) => a.id === attemptId);
      if (!att || att.emailEditCount >= 1) return false;
      const submittedTime = att.submittedAt
        ? new Date(att.submittedAt).getTime()
        : Date.now();
      if (Date.now() - submittedTime > 5 * 60 * 1000) return false;

      const cleanEmail = newEmail.trim().toLowerCase();
      const nowIso = new Date().toISOString();
      const exam = state.exams.find((e) => e.id === att.examId);

      updateState((prev) => ({
        ...prev,
        attempts: prev.attempts.map((a) =>
          a.id === attemptId
            ? {
                ...a,
                studentEmail: cleanEmail,
                emailEditCount: a.emailEditCount + 1,
                emailSentAt: nowIso,
              }
            : a,
        ),
        emailLogs: [
          {
            id: `mail_${Date.now().toString(36)}`,
            recipient: cleanEmail,
            subject: `[VNEconomics Testing] Gửi lại kết quả bài thi: ${exam?.title ?? ''}`,
            kind:
              exam?.emailDeliveryMode === 'DELAYED_BATCH' && exam.status !== 'CLOSED'
                ? 'STUDENT_RECEIPT'
                : 'STUDENT_SCORE',
            status: 'SENT',
            summary: `Sinh viên tự điều chỉnh email nhận kết quả (MSSV: ${att.studentCode}).`,
            sentAt: nowIso,
          },
          ...prev.emailLogs,
        ],
      }));

      if (backendConnected) {
        void apiRequest('/api/attempts.php?action=correct_email', {
          method: 'POST',
          body: JSON.stringify({ attemptId, newEmail: cleanEmail }),
        });
      }

      return true;
    },
    [backendConnected, state.attempts, state.exams, updateState],
  );

  const proctorDecision = useCallback(
    (
      attemptId: string,
      decision: 'ACCEPT_KEEP' | 'ACCEPT_COMPENSATE' | 'REJECT',
      extraSeconds?: number,
    ) => {
      if (decision === 'REJECT') {
        void submitAttempt(attemptId, true);
        return;
      }

      updateState((prev) => ({
        ...prev,
        attempts: prev.attempts.map((a) => {
          if (a.id !== attemptId) return a;
          const waitSec = a.lockedAt
            ? Math.max(
                0,
                Math.round((Date.now() - new Date(a.lockedAt).getTime()) / 1000),
              )
            : 0;
          const bonusAdded =
            decision === 'ACCEPT_COMPENSATE' ? (extraSeconds ?? waitSec) : 0;
          return {
            ...a,
            status: 'IN_PROGRESS',
            lockedAt: undefined,
            lockedWaitSeconds: a.lockedWaitSeconds + waitSec,
            bonusSeconds: a.bonusSeconds + bonusAdded,
            extraLeaveAllowance: a.extraLeaveAllowance + 2,
          };
        }),
      }));

      if (backendConnected) {
        void apiRequest('/api/proctor.php?action=decision', {
          method: 'POST',
          body: JSON.stringify({ attemptId, decision, extraSeconds }),
        });
      }
    },
    [backendConnected, submitAttempt, updateState],
  );

  const resetAttemptDevice = useCallback(
    (attemptId: string) => {
      updateState((prev) => ({
        ...prev,
        attempts: prev.attempts.map((a) =>
          a.id === attemptId
            ? {
                ...a,
                deviceToken: '',
                status: a.status === 'LOCKED' ? 'IN_PROGRESS' : a.status,
                lockedAt: undefined,
              }
            : a,
        ),
      }));

      if (backendConnected) {
        void apiRequest('/api/proctor.php?action=reset_device', {
          method: 'POST',
          body: JSON.stringify({ attemptId }),
        });
      }
    },
    [backendConnected, updateState],
  );

  const addBonusTimeToAttempt = useCallback(
    (attemptId: string, extraSeconds: number) => {
      updateState((prev) => ({
        ...prev,
        attempts: prev.attempts.map((a) =>
          a.id === attemptId
            ? { ...a, bonusSeconds: a.bonusSeconds + extraSeconds }
            : a,
        ),
      }));

      if (backendConnected) {
        void apiRequest('/api/proctor.php?action=bonus_time', {
          method: 'POST',
          body: JSON.stringify({ attemptId, extraSeconds }),
        });
      }
    },
    [backendConnected, updateState],
  );

  const closeExamAndSweep = useCallback(
    (examId: string): { sweptCount: number } => {
      let sweptCount = 0;
      const nowIso = new Date().toISOString();

      updateState((prev) => {
        const exam = prev.exams.find((e) => e.id === examId);
        if (!exam) return prev;

        const newMailLogs: EmailLogEntry[] = [];
        const updatedAttempts = prev.attempts.map((a) => {
          if (a.examId !== examId) return a;

          let nextA = recalculateAttemptScores(a, prev.questions);
          if (
            nextA.status === 'IN_PROGRESS' ||
            nextA.status === 'PAUSED' ||
            nextA.status === 'LOCKED'
          ) {
            sweptCount += 1;
            nextA = {
              ...nextA,
              status: 'AUTO_SUBMITTED',
              submittedAt: nowIso,
              lockedAt: undefined,
            };
          }

          if (nextA.emailSentStatus !== 'SENT') {
            nextA = {
              ...nextA,
              emailSentStatus: 'SENT',
              emailSentAt: nowIso,
            };
            newMailLogs.push({
              id: `mail_${Date.now().toString(36)}_${nextA.studentCode}`,
              recipient: nextA.studentEmail,
              subject: `[VNEconomics Testing] Bảng điểm chính thức: ${exam.title}`,
              kind: 'STUDENT_SCORE',
              status: 'SENT',
              summary: `Điểm quy đổi ${nextA.scale10Score.toFixed(2)}/10 (${nextA.totalScore}/${nextA.maxTotalScore}đ) | Tin cậy: ${nextA.integrityScore}%`,
              sentAt: nowIso,
            });
          }
          return nextA;
        });

        const chapterStats = computeChapterMastery(updatedAttempts, examId);
        const csvName = `VNE_BangDiem_${exam.roomPin}_${nowIso.slice(0, 10)}.csv`;
        buildExamCsvContent(exam, updatedAttempts, chapterStats);

        const instructorReportLog: EmailLogEntry = {
          id: `mail_rep_${Date.now().toString(36)}`,
          recipient: exam.instructorEmail,
          subject: `[VNEconomics Testing] Báo cáo Tổng hợp Ca thi (${exam.roomPin}): ${exam.title}`,
          kind: 'INSTRUCTOR_REPORT',
          status: 'SENT',
          summary: `Đã chốt ${updatedAttempts.filter((x) => x.examId === examId).length} bài thi (thu tự động ${sweptCount} bài treo) kèm thống kê theo Chương.`,
          csvAttachmentName: csvName,
          sentAt: nowIso,
        };

        return {
          ...prev,
          exams: prev.exams.map((e) =>
            e.id === examId
              ? {
                  ...e,
                  status: 'CLOSED',
                  reportSentStatus: 'SENT',
                  reportSentAt: nowIso,
                }
              : e,
          ),
          attempts: updatedAttempts,
          emailLogs: [instructorReportLog, ...newMailLogs, ...prev.emailLogs],
        };
      });

      if (backendConnected) {
        void apiRequest('/api/attempts.php?action=sweep', {
          method: 'POST',
          body: JSON.stringify({ examId }),
        });
      }

      return { sweptCount };
    },
    [backendConnected, updateState],
  );

  const overrideEssayScore = useCallback(
    (
      attemptId: string,
      questionId: string,
      newScore: number,
      note?: string,
    ) => {
      updateState((prev) => ({
        ...prev,
        attempts: prev.attempts.map((a) => {
          if (a.id !== attemptId) return a;
          const existingAns = a.answers[questionId];
          if (!existingAns) return a;
          const clamped = Math.max(
            0,
            Math.min(existingAns.maxPoints, Math.round(newScore * 100) / 100),
          );
          const updated: ExamAttempt = {
            ...a,
            answers: {
              ...a.answers,
              [questionId]: {
                ...existingAns,
                earnedPoints: clamped,
                gradingStatus: 'MANUAL_OVERRIDE',
                isCorrect: clamped >= existingAns.maxPoints * 0.5,
                gradingFeedback: note
                  ? `${note} (Giảng viên chấm ${clamped}/${existingAns.maxPoints}đ)`
                  : `Giảng viên điều chỉnh trực tiếp: ${clamped}/${existingAns.maxPoints}đ`,
              },
            },
          };
          return recalculateAttemptScores(updated, prev.questions);
        }),
      }));
    },
    [updateState],
  );

  const enrichRubricAndRegradeExam = useCallback(
    (
      examId: string,
      questionId: string,
      slotId: string,
      newPhrase: string,
    ): { updatedCount: number } => {
      const cleanPhrase = newPhrase.trim();
      if (!cleanPhrase) return { updatedCount: 0 };

      let updatedCount = 0;
      updateState((prev) => {
        const nextQuestions = prev.questions.map((q) => {
          if (q.id !== questionId || !q.gradingRubric) return q;
          const nextRubric: RubricSlot[] = q.gradingRubric.map((slot) => {
            if (slot.id !== slotId) return slot;
            if (slot.acceptedPhrases.includes(cleanPhrase)) return slot;
            return {
              ...slot,
              acceptedPhrases: [...slot.acceptedPhrases, cleanPhrase],
            };
          });
          return { ...q, gradingRubric: nextRubric };
        });

        const updatedQuestion = nextQuestions.find((q) => q.id === questionId);
        if (!updatedQuestion) return prev;

        const nextAttempts = prev.attempts.map((a) => {
          if (a.examId !== examId) return a;
          const ans = a.answers[questionId];
          if (!ans || ans.gradingStatus === 'MANUAL_OVERRIDE') return a;

          const snap = a.assignedQuestions.find((s) => s.questionId === questionId);
          if (!snap) return a;

          const text =
            typeof ans.answerPayload === 'string' ? ans.answerPayload : '';
          const res = gradeMicroEssayRubric(
            updatedQuestion,
            text,
            snap.seedVars,
            snap.maxPoints,
          );
          updatedCount += 1;

          const nextAttempt: ExamAttempt = {
            ...a,
            answers: {
              ...a.answers,
              [questionId]: {
                ...ans,
                earnedPoints: res.earnedPoints,
                gradingFeedback: res.feedback,
                rubricBreakdown: res.breakdown,
                matchedHighlights: res.matchedHighlights,
                blockedHighlights: res.blockedHighlights,
                honeypotTriggered: res.honeypotTriggered,
                isCorrect:
                  res.earnedPoints >= snap.maxPoints * 0.5
                    ? true
                    : res.earnedPoints > 0
                      ? null
                      : false,
              },
            },
          };
          return recalculateAttemptScores(nextAttempt, nextQuestions);
        });

        return {
          ...prev,
          questions: nextQuestions,
          attempts: nextAttempts,
        };
      });

      return { updatedCount };
    },
    [updateState],
  );

  const addCourse = useCallback(
    (course: Omit<Course, 'id'>) => {
      const newCourse: Course = {
        ...course,
        id: `course_${Date.now().toString(36)}`,
      };
      updateState((prev) => ({
        ...prev,
        courses: [...prev.courses, newCourse],
      }));

      if (backendConnected) {
        void apiRequest('/api/exams.php?action=save_course', {
          method: 'POST',
          body: JSON.stringify(newCourse),
        });
      }
    },
    [backendConnected, updateState],
  );

  const upsertQuestion = useCallback(
    (question: Question) => {
      updateState((prev) => {
        const exists = prev.questions.some((q) => q.id === question.id);
        return {
          ...prev,
          questions: exists
            ? prev.questions.map((q) => (q.id === question.id ? question : q))
            : [question, ...prev.questions],
        };
      });

      if (backendConnected) {
        void apiRequest('/api/exams.php?action=save_question', {
          method: 'POST',
          body: JSON.stringify(question),
        });
      }
    },
    [backendConnected, updateState],
  );

  const deleteQuestion = useCallback(
    (questionId: string) => {
      updateState((prev) => ({
        ...prev,
        questions: prev.questions.filter((q) => q.id !== questionId),
      }));

      if (backendConnected) {
        void apiRequest('/api/exams.php?action=delete_question', {
          method: 'POST',
          body: JSON.stringify({ id: questionId }),
        });
      }
    },
    [backendConnected, updateState],
  );

  const importQuestionsBulk = useCallback(
    (
      incoming: Question[],
      options?: {
        mode?: 'UPSERT' | 'APPEND' | 'REPLACE_COURSE';
        courseId?: string;
        syncExamId?: string;
      },
    ): { addedCount: number; updatedCount: number; syncedChapters: number } => {
      const mode = options?.mode ?? 'UPSERT';
      const targetCourseId = options?.courseId ?? incoming[0]?.courseId;
      let addedCount = 0;
      let updatedCount = 0;
      let syncedChapters = 0;
      let preparedIncoming = incoming;

      updateState((prev) => {
        const existingIdSet = new Set(prev.questions.map((q) => q.id));

        if (mode === 'APPEND') {
          preparedIncoming = incoming.map((q, idx) =>
            existingIdSet.has(q.id)
              ? {
                  ...q,
                  id: `q_app_${Date.now().toString(36)}_${idx}_${Math.random().toString(36).slice(2, 5)}`,
                }
              : q,
          );
          addedCount = preparedIncoming.length;
        } else if (mode === 'REPLACE_COURSE') {
          addedCount = incoming.length;
        } else {
          for (const q of incoming) {
            if (existingIdSet.has(q.id)) {
              updatedCount += 1;
            } else {
              addedCount += 1;
            }
          }
        }

        const incomingMap = new Map(preparedIncoming.map((q) => [q.id, q]));
        let nextQuestions: Question[];

        if (mode === 'REPLACE_COURSE' && targetCourseId) {
          const otherCourseQuestions = prev.questions.filter(
            (q) => q.courseId !== targetCourseId,
          );
          nextQuestions = [...preparedIncoming, ...otherCourseQuestions];
        } else if (mode === 'APPEND') {
          nextQuestions = [...preparedIncoming, ...prev.questions];
        } else {
          const updatedExisting = prev.questions.map(
            (q) => incomingMap.get(q.id) ?? q,
          );
          const brandNew = preparedIncoming.filter((q) => !existingIdSet.has(q.id));
          nextQuestions = [...brandNew, ...updatedExisting];
        }

        let nextExams = prev.exams;
        if (options?.syncExamId) {
          const incomingChapters = Array.from(
            new Set(
              preparedIncoming
                .map((q) => q.chapterCategory.trim())
                .filter(Boolean),
            ),
          );
          nextExams = prev.exams.map((ex) => {
            if (ex.id !== options.syncExamId) return ex;
            const knownChapters = new Set(
              ex.chapterMatrix.map((r) => r.chapterCategory),
            );
            const additions = incomingChapters
              .filter((ch) => !knownChapters.has(ch))
              .map((ch) => ({
                chapterCategory: ch,
                questionCount: 1,
                percent: 0,
                pointsPerQuestion: 1,
              }));
            syncedChapters = additions.length;
            if (additions.length === 0) return ex;
            return {
              ...ex,
              chapterMatrix: [...ex.chapterMatrix, ...additions],
            };
          });
        }

        return {
          ...prev,
          questions: nextQuestions,
          exams: nextExams,
        };
      });

      if (backendConnected && preparedIncoming.length > 0) {
        void apiRequest('/api/exams.php?action=import_questions_bulk', {
          method: 'POST',
          body: JSON.stringify({
            mode,
            courseId: targetCourseId,
            questions: preparedIncoming,
          }),
        });
      }

      return { addedCount, updatedCount, syncedChapters };
    },
    [backendConnected, updateState],
  );

  const upsertExam = useCallback(
    (exam: Exam) => {
      updateState((prev) => {
        const exists = prev.exams.some((e) => e.id === exam.id);
        return {
          ...prev,
          exams: exists
            ? prev.exams.map((e) => (e.id === exam.id ? exam : e))
            : [exam, ...prev.exams],
        };
      });

      if (backendConnected) {
        void apiRequest('/api/exams.php?action=save_exam', {
          method: 'POST',
          body: JSON.stringify(exam),
        });
      }
    },
    [backendConnected, updateState],
  );

  const cloneExam = useCallback(
    (examId: string): Exam | null => {
      const source = state.exams.find((e) => e.id === examId);
      if (!source) return null;
      const randomPin = String(Math.floor(100000 + Math.random() * 900000));
      const cloned: Exam = {
        ...source,
        id: `exam_${Date.now().toString(36)}`,
        title: `${source.title} (Bản sao)`,
        roomPin: randomPin,
        status: 'DRAFT',
        reportSentStatus: 'PENDING',
        reportSentAt: undefined,
        createdAt: new Date().toISOString(),
      };
      updateState((prev) => ({
        ...prev,
        exams: [cloned, ...prev.exams],
      }));

      if (backendConnected) {
        void apiRequest('/api/exams.php?action=save_exam', {
          method: 'POST',
          body: JSON.stringify(cloned),
        });
      }

      return cloned;
    },
    [backendConnected, state.exams, updateState],
  );

  const resendStudentScoreEmail = useCallback(
    (attemptId: string, editedEmail?: string) => {
      const nowIso = new Date().toISOString();
      updateState((prev) => {
        const att = prev.attempts.find((a) => a.id === attemptId);
        if (!att) return prev;
        const exam = prev.exams.find((e) => e.id === att.examId);
        const finalEmail = editedEmail ? editedEmail.trim().toLowerCase() : att.studentEmail;
        return {
          ...prev,
          attempts: prev.attempts.map((a) =>
            a.id === attemptId
              ? {
                  ...a,
                  studentEmail: finalEmail,
                  emailSentStatus: 'SENT',
                  emailSentAt: nowIso,
                }
              : a,
          ),
          emailLogs: [
            {
              id: `mail_${Date.now().toString(36)}`,
              recipient: finalEmail,
              subject: `[VNEconomics Testing] Cập nhật & Gửi lại điểm: ${exam?.title ?? ''}`,
              kind: 'STUDENT_SCORE',
              status: 'SENT',
              summary: `Điểm quy đổi ${att.scale10Score.toFixed(2)}/10 (${att.totalScore}/${att.maxTotalScore}đ) | Gửi lại bởi Giảng viên.`,
              sentAt: nowIso,
            },
            ...prev.emailLogs,
          ],
        };
      });
    },
    [updateState],
  );

  const sendTestMailer = useCallback(
    (recipient: string): EmailLogEntry => {
      const entry: EmailLogEntry = {
        id: `mail_test_${Date.now().toString(36)}`,
        recipient: recipient.trim(),
        subject: '[VNEconomics Testing] Email Kiểm thử Hệ thống Pre-Flight',
        kind: 'TEST_MAIL',
        status: 'SENT',
        summary: 'Xác nhận SMTP / Mailer sẵn sàng trước giờ mở ca thi.',
        sentAt: new Date().toISOString(),
      };
      updateState((prev) => ({
        ...prev,
        emailLogs: [entry, ...prev.emailLogs],
      }));

      if (backendConnected) {
        void apiRequest('/api/mailer.php?action=test', {
          method: 'POST',
          body: JSON.stringify({ to: recipient.trim() }),
        });
      }

      return entry;
    },
    [backendConnected, updateState],
  );

  const resetDemoData = useCallback(() => {
    const fresh: ExamPlatformState = {
      courses: SEED_COURSES,
      questions: SEED_QUESTIONS,
      exams: SEED_EXAMS,
      attempts: SEED_ATTEMPTS,
      emailLogs: SEED_EMAIL_LOGS,
    };
    persistState(fresh);
    setState(fresh);
  }, [persistState]);

  return (
    <ExamContext.Provider
      value={{
        ...state,
        backendConnected,
        isAdminAuthenticated,
        adminLogin,
        adminLogout,
        startOrResumeAttempt,
        saveAnswer,
        toggleFlagQuestion,
        updateCurrentIndex,
        recordViolation,
        submitUnlockRequestNote,
        verifyRescuePin,
        submitAttempt,
        correctStudentEmail,
        proctorDecision,
        resetAttemptDevice,
        addBonusTimeToAttempt,
        closeExamAndSweep,
        overrideEssayScore,
        enrichRubricAndRegradeExam,
        addCourse,
        upsertQuestion,
        deleteQuestion,
        importQuestionsBulk,
        upsertExam,
        cloneExam,
        resendStudentScoreEmail,
        sendTestMailer,
        resetDemoData,
      }}
    >
      {children}
    </ExamContext.Provider>
  );
};

export function useExamPlatform(): ExamContextValue {
  const ctx = useContext(ExamContext);
  if (!ctx) {
    throw new Error('useExamPlatform must be used within ExamProvider');
  }
  return ctx;
}
