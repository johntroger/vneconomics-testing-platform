import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
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
  apiRequestDetailed,
  getOrCreateDeviceToken,
  pingPhpApi,
  STORAGE_KEY,
  SYNC_CHANNEL_NAME,
} from '../services/apiClient';
import type {
  AttemptAnswer,
  Course,
  EmailLogEntry,
  Exam,
  ExamAttempt,
  InstructorUser,
  KeystrokeTelemetry,
  Question,
  RubricSlot,
  ViolationEvent,
} from '../types/exam';
import { buildExamCsvContent } from '../utils/csvExport';
import { normalizeRosterDob, normalizeRosterText } from '../utils/studentRosterXlsx';
import {
  buildAssignedQuestions,
  computeChapterMastery,
  gradeAnswer,
  gradeMicroEssayRubric,
  recalculateAttemptScores,
} from '../utils/dynamicQuestionEngine';

export interface RoomMatchOption {
  examId: string;
  examTitle: string;
  status: string;
  durationMinutes: number;
  courseId: string;
  courseCode: string;
  courseName: string;
}

interface StartAttemptInput {
  pin: string;
  examId?: string;
  studentCode: string;
  studentName: string;
  lastName?: string;
  firstName?: string;
  gender?: string;
  dob?: string;
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
  needsExamChoice?: boolean;
  matches?: RoomMatchOption[];
}

interface ExamPlatformState {
  courses: Course[];
  questions: Question[];
  exams: Exam[];
  attempts: ExamAttempt[];
  emailLogs: EmailLogEntry[];
}

interface AuthActionResult {
  ok: boolean;
  error?: string;
}

interface ExamContextValue extends ExamPlatformState {
  backendConnected: boolean;
  isAdminAuthenticated: boolean;
  instructorUser: InstructorUser | null;
  googleClientId: string;
  adminLogin: (passcode: string) => Promise<boolean>;
  instructorLogin: (email: string, password: string) => Promise<AuthActionResult>;
  instructorRegister: (fullName: string, email: string, password: string) => Promise<AuthActionResult>;
  instructorGoogleLogin: (credential: string) => Promise<AuthActionResult>;
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
  addCourse: (course: Omit<Course, 'id'>) => Course;
  updateCourse: (course: Course) => Promise<{ ok: boolean; error?: string }>;
  deleteCourse: (courseId: string) => Promise<{ ok: boolean; error?: string }>;
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
  upsertExam: (exam: Exam) => Promise<{ ok: boolean; error?: string }>;
  deleteExam: (examId: string) => Promise<{ ok: boolean; error?: string }>;
  cloneExam: (examId: string, customTitle?: string) => Exam | null;
  resendStudentScoreEmail: (attemptId: string, editedEmail?: string) => void;
  sendTestMailer: (recipient: string) => EmailLogEntry;
  resetDemoData: () => void;
}

const ExamContext = createContext<ExamContextValue | null>(null);

function upsertById<T extends { id: string }>(existing: T[], incoming: T[]): T[] {
  const map = new Map<string, T>();
  for (const item of existing) map.set(item.id, item);
  for (const item of incoming) map.set(item.id, item);
  return Array.from(map.values());
}

function normalizeServerExam(raw: Exam): Exam {
  return {
    ...raw,
    unlockPin: raw.unlockPin ?? '',
    rosterWhitelist: Array.isArray(raw.rosterWhitelist) ? raw.rosterWhitelist : [],
    rosterEntries: Array.isArray(raw.rosterEntries) ? raw.rosterEntries : [],
    requiresRosterVerification: Boolean(
      raw.requiresRosterVerification ||
        (Array.isArray(raw.rosterEntries) && raw.rosterEntries.length > 0),
    ),
    chapterMatrix: Array.isArray(raw.chapterMatrix) ? raw.chapterMatrix : [],
    pinnedQuestionIds: Array.isArray(raw.pinnedQuestionIds) ? raw.pinnedQuestionIds : [],
  };
}

function normalizeServerEmailLog(raw: Record<string, unknown>): EmailLogEntry {
  return {
    id: String(raw.id ?? `mail_${Date.now().toString(36)}`),
    recipient: String(raw.recipient ?? ''),
    subject: String(raw.subject ?? ''),
    kind: (raw.kind as EmailLogEntry['kind']) ?? 'STUDENT_SCORE',
    status: raw.status === 'FAILED' ? 'FAILED' : 'SENT',
    summary: String(raw.summary ?? ''),
    csvAttachmentName:
      typeof raw.csvAttachmentName === 'string' && raw.csvAttachmentName
        ? raw.csvAttachmentName
        : undefined,
    sentAt: String(raw.sentAt || raw.created_at || new Date().toISOString()),
  };
}

function normalizeServerAttempt(raw: Record<string, unknown>): ExamAttempt {
  const rawAnswers = raw.answers;
  const answersMap: Record<string, AttemptAnswer> =
    rawAnswers && typeof rawAnswers === 'object' && !Array.isArray(rawAnswers)
      ? (rawAnswers as Record<string, AttemptAnswer>)
      : {};
  return {
    ...(raw as unknown as ExamAttempt),
    deviceToken: typeof raw.deviceToken === 'string' ? raw.deviceToken : '',
    assignedQuestions: Array.isArray(raw.assignedQuestions)
      ? (raw.assignedQuestions as ExamAttempt['assignedQuestions'])
      : [],
    answers: answersMap,
    flaggedQuestionIds: Array.isArray(raw.flaggedQuestionIds)
      ? (raw.flaggedQuestionIds as string[])
      : [],
    violations: Array.isArray(raw.violations)
      ? (raw.violations as ViolationEvent[])
      : [],
    lockedAt: typeof raw.lockedAt === 'string' && raw.lockedAt ? raw.lockedAt : undefined,
    unlockRequestNote:
      typeof raw.unlockRequestNote === 'string' && raw.unlockRequestNote
        ? raw.unlockRequestNote
        : undefined,
    aiFlagReason:
      typeof raw.aiFlagReason === 'string' && raw.aiFlagReason
        ? raw.aiFlagReason
        : undefined,
    emailSentAt:
      typeof raw.emailSentAt === 'string' && raw.emailSentAt
        ? raw.emailSentAt
        : undefined,
    submittedAt:
      typeof raw.submittedAt === 'string' && raw.submittedAt
        ? raw.submittedAt
        : undefined,
    emailEditCount: Number(raw.emailEditCount ?? 0),
  };
}

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

const INSTRUCTOR_USER_KEY = 'vne_instructor_user_v1';

function loadStoredInstructorUser(): InstructorUser | null {
  try {
    const raw = sessionStorage.getItem(INSTRUCTOR_USER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as InstructorUser;
    if (parsed && typeof parsed.role === 'string') return parsed;
  } catch {
    // ignore
  }
  return null;
}

export const ExamProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [state, setState] = useState<ExamPlatformState>(loadInitialState);
  const stateRef = useRef<ExamPlatformState>(state);
  stateRef.current = state;
  const autoSubmittedPollRef = useRef<string | null>(null);
  const heartbeatQueueRef = useRef<
    Map<string, { timer: number; attemptId: string; body: string }>
  >(new Map());
  const flushPendingHeartbeats = useCallback(async (attemptId?: string) => {
    const entries = Array.from(heartbeatQueueRef.current.entries()).filter(
      ([, entry]) => !attemptId || entry.attemptId === attemptId,
    );
    if (entries.length === 0) return;
    await Promise.all(
      entries.map(([key, entry]) => {
        window.clearTimeout(entry.timer);
        heartbeatQueueRef.current.delete(key);
        return apiRequest('/api/attempts.php?action=heartbeat', {
          method: 'POST',
          body: entry.body,
        });
      }),
    );
  }, []);
  const [backendConnected, setBackendConnected] = useState(false);
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(() =>
    Boolean(sessionStorage.getItem(ADMIN_TOKEN_KEY)),
  );
  const [instructorUser, setInstructorUser] = useState<InstructorUser | null>(
    loadStoredInstructorUser,
  );
  const [googleClientId, setGoogleClientId] = useState('');

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
    pingPhpApi().then((alive) => {
      setBackendConnected(alive);
      if (alive) {
        void apiRequestDetailed<{
          ok: boolean;
          googleClientId?: string;
        }>('/api/admin_auth.php?action=config', { method: 'GET' }).then((cfgRes) => {
          if (cfgRes.ok && cfgRes.data?.ok) {
            setGoogleClientId(String(cfgRes.data.googleClientId ?? ''));
          }
        });

        if (sessionStorage.getItem(ADMIN_TOKEN_KEY)) {
          void apiRequestDetailed<{
            ok: boolean;
            user?: InstructorUser | null;
          }>('/api/admin_auth.php', { method: 'GET' }).then((meRes) => {
            if (meRes.reachedJson) {
              if (meRes.ok && meRes.data?.ok && meRes.data.user) {
                sessionStorage.setItem(INSTRUCTOR_USER_KEY, JSON.stringify(meRes.data.user));
                setInstructorUser(meRes.data.user);
                setIsAdminAuthenticated(true);
              } else {
                sessionStorage.removeItem(ADMIN_TOKEN_KEY);
                sessionStorage.removeItem(INSTRUCTOR_USER_KEY);
                setInstructorUser(null);
                setIsAdminAuthenticated(false);
              }
            }
          });
        }
      }
    });

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

  useEffect(() => {
    if (!backendConnected || !isAdminAuthenticated) return;

    let cancelled = false;
    let inFlight = false;

    const pullAdminState = async (withBootstrap: boolean) => {
      if (cancelled || inFlight) return;
      inFlight = true;
      try {
        let nextCourses: Course[] | undefined;
        let nextQuestions: Question[] | undefined;
        let nextExams: Exam[] | undefined;
        let nextEmailLogs: EmailLogEntry[] | undefined;

        if (withBootstrap) {
          const bootRes = await apiRequestDetailed<{
            ok: boolean;
            courses?: Course[];
            questions?: Question[];
            exams?: Exam[];
            emailLogs?: Array<Record<string, unknown>>;
          }>('/api/exams.php?action=bootstrap', { method: 'GET' });

          if (cancelled) return;
          if (bootRes.reachedJson && (bootRes.status === 401 || bootRes.status === 403)) {
            sessionStorage.removeItem(ADMIN_TOKEN_KEY);
            setIsAdminAuthenticated(false);
            return;
          }
          if (bootRes.ok && bootRes.data?.ok) {
            nextCourses = bootRes.data.courses;
            nextQuestions = bootRes.data.questions;
            nextExams = Array.isArray(bootRes.data.exams)
              ? bootRes.data.exams.map(normalizeServerExam)
              : undefined;
            nextEmailLogs = Array.isArray(bootRes.data.emailLogs)
              ? bootRes.data.emailLogs.map(normalizeServerEmailLog)
              : undefined;
          }
        }

        const liveRes = await apiRequestDetailed<{
          ok: boolean;
          attempts?: Array<Record<string, unknown>>;
        }>('/api/proctor.php?action=live', { method: 'GET' });

        if (cancelled) return;
        if (liveRes.reachedJson && (liveRes.status === 401 || liveRes.status === 403)) {
          sessionStorage.removeItem(ADMIN_TOKEN_KEY);
          setIsAdminAuthenticated(false);
          return;
        }

        const nextAttempts =
          liveRes.ok && liveRes.data?.ok && Array.isArray(liveRes.data.attempts)
            ? liveRes.data.attempts.map(normalizeServerAttempt)
            : undefined;

        if (nextCourses || nextQuestions || nextExams || nextEmailLogs || nextAttempts) {
          updateState((prev) => ({
            courses: nextCourses ?? prev.courses,
            questions: nextQuestions ?? prev.questions,
            exams: nextExams ?? prev.exams,
            attempts: nextAttempts ?? prev.attempts,
            emailLogs: nextEmailLogs ?? prev.emailLogs,
          }));
        }
      } finally {
        inFlight = false;
      }
    };

    void pullAdminState(true);
    let tickCount = 0;
    const intervalId = window.setInterval(() => {
      tickCount += 1;
      void pullAdminState(tickCount % 5 === 0);
    }, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [backendConnected, isAdminAuthenticated, updateState]);

  const saveAuthSession = useCallback((token: string, user: InstructorUser) => {
    sessionStorage.setItem(ADMIN_TOKEN_KEY, token);
    sessionStorage.setItem(INSTRUCTOR_USER_KEY, JSON.stringify(user));
    setInstructorUser(user);
    setIsAdminAuthenticated(true);
  }, []);

  const adminLogin = useCallback(async (passcode: string): Promise<boolean> => {
    const res = await apiRequestDetailed<{
      ok: boolean;
      token?: string;
      user?: InstructorUser;
    }>('/api/admin_auth.php', {
      method: 'POST',
      body: JSON.stringify({ passcode }),
    });

    if (res.reachedJson) {
      setBackendConnected(true);
      if (res.ok && res.data?.ok && res.data.token) {
        const fallbackUser: InstructorUser =
          passcode.trim() === 'vne2026'
            ? {
                id: 'DEMO_INSTRUCTOR',
                email: 'demo@vneconomics.com',
                name: 'Giảng viên Demo',
                role: 'DEMO',
                authProvider: 'DEMO',
              }
            : {
                id: 'MASTER_ADMIN',
                email: 'giangvien@vneconomics.com',
                name: 'Quản trị viên Hệ thống',
                role: 'OFFICIAL',
                authProvider: 'PASSCODE',
              };
        saveAuthSession(res.data.token, res.data.user ?? fallbackUser);
        return true;
      }
      return false;
    }

    if (passcode.trim() === 'vne2026' || passcode.trim() === '8888') {
      const localToken = `local_hmac_${btoa(passcode + ':' + Date.now())}`;
      saveAuthSession(localToken, {
        id: passcode.trim() === 'vne2026' ? 'DEMO_INSTRUCTOR' : 'MASTER_ADMIN',
        email: passcode.trim() === 'vne2026' ? 'demo@vneconomics.com' : 'giangvien@vneconomics.com',
        name: passcode.trim() === 'vne2026' ? 'Giảng viên Demo' : 'Quản trị viên',
        role: passcode.trim() === 'vne2026' ? 'DEMO' : 'OFFICIAL',
        authProvider: passcode.trim() === 'vne2026' ? 'DEMO' : 'PASSCODE',
      });
      return true;
    }
    return false;
  }, [saveAuthSession]);

  const instructorLogin = useCallback(
    async (email: string, password: string): Promise<AuthActionResult> => {
      const res = await apiRequestDetailed<{
        ok: boolean;
        token?: string;
        user?: InstructorUser;
        error?: string;
      }>('/api/admin_auth.php?action=login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });

      if (!res.reachedJson) {
        return { ok: false, error: 'Không thể kết nối máy chủ xác thực.' };
      }
      setBackendConnected(true);
      if (res.ok && res.data?.ok && res.data.token && res.data.user) {
        saveAuthSession(res.data.token, res.data.user);
        return { ok: true };
      }
      return { ok: false, error: res.data?.error ?? 'Đăng nhập thất bại.' };
    },
    [saveAuthSession],
  );

  const instructorRegister = useCallback(
    async (fullName: string, email: string, password: string): Promise<AuthActionResult> => {
      const res = await apiRequestDetailed<{
        ok: boolean;
        token?: string;
        user?: InstructorUser;
        error?: string;
      }>('/api/admin_auth.php?action=register', {
        method: 'POST',
        body: JSON.stringify({ fullName, email, password }),
      });

      if (!res.reachedJson) {
        return { ok: false, error: 'Không thể kết nối máy chủ đăng ký.' };
      }
      setBackendConnected(true);
      if (res.ok && res.data?.ok && res.data.token && res.data.user) {
        saveAuthSession(res.data.token, res.data.user);
        return { ok: true };
      }
      return { ok: false, error: res.data?.error ?? 'Đăng ký thất bại.' };
    },
    [saveAuthSession],
  );

  const instructorGoogleLogin = useCallback(
    async (credential: string): Promise<AuthActionResult> => {
      const res = await apiRequestDetailed<{
        ok: boolean;
        token?: string;
        user?: InstructorUser;
        error?: string;
      }>('/api/admin_auth.php?action=google', {
        method: 'POST',
        body: JSON.stringify({ credential }),
      });

      if (!res.reachedJson) {
        return { ok: false, error: 'Không thể kết nối máy chủ xác thực Google.' };
      }
      setBackendConnected(true);
      if (res.ok && res.data?.ok && res.data.token && res.data.user) {
        saveAuthSession(res.data.token, res.data.user);
        return { ok: true };
      }
      return { ok: false, error: res.data?.error ?? 'Đăng nhập Google thất bại.' };
    },
    [saveAuthSession],
  );

  const adminLogout = useCallback(() => {
    sessionStorage.removeItem(ADMIN_TOKEN_KEY);
    sessionStorage.removeItem(INSTRUCTOR_USER_KEY);
    setInstructorUser(null);
    setIsAdminAuthenticated(false);
  }, []);

  const startOrResumeAttempt = useCallback(
    async (input: StartAttemptInput): Promise<StartAttemptResult> => {
      const normalizedPin = input.pin.trim();
      const normalizedCode = input.studentCode.trim().toUpperCase();
      const normalizedEmail = input.studentEmail.trim().toLowerCase();
      const myDeviceToken = getOrCreateDeviceToken();

      let alive = backendConnected;
      if (!alive) {
        alive = await pingPhpApi();
        if (alive) setBackendConnected(true);
      }

      if (alive) {
        const roomUrl = `/api/exams.php?action=room&pin=${encodeURIComponent(normalizedPin)}${
          input.examId ? `&examId=${encodeURIComponent(input.examId)}` : ''
        }`;
        const roomRes = await apiRequestDetailed<{
          ok: boolean;
          multipleMatches?: boolean;
          matches?: RoomMatchOption[];
          exam?: Exam;
          course?: Course | null;
          questions?: Question[];
        }>(roomUrl, {
          method: 'GET',
        });

        if (roomRes.reachedJson) {
          if (!roomRes.ok || !roomRes.data?.ok || !roomRes.data.exam) {
            return {
              ok: false,
              error: roomRes.error ?? 'Không tìm thấy phòng thi với mã PIN này.',
            };
          }

          if (
            !input.examId &&
            roomRes.data.multipleMatches &&
            Array.isArray(roomRes.data.matches) &&
            roomRes.data.matches.length > 1
          ) {
            return {
              ok: false,
              needsExamChoice: true,
              matches: roomRes.data.matches,
              error: 'Mã PIN này đang dùng cho nhiều học phần/bài kiểm tra. Vui lòng chọn đúng học phần và bài thi.',
            };
          }

          const serverExam = normalizeServerExam(roomRes.data.exam);
          if (serverExam.status !== 'OPEN') {
            return {
              ok: false,
              error:
                serverExam.status === 'CLOSED'
                  ? 'Ca thi này đã kết thúc và đóng cổng nộp bài.'
                  : 'Phòng thi đang ở trạng thái Nháp, giảng viên chưa mở phòng.',
            };
          }

          const serverCourse = roomRes.data.course ?? null;
          const serverQuestions = Array.isArray(roomRes.data.questions)
            ? roomRes.data.questions
            : [];

          updateState((prev) => {
            const existingExam = prev.exams.find((e) => e.id === serverExam.id);
            const mergedExam: Exam = existingExam
              ? {
                  ...existingExam,
                  ...serverExam,
                  unlockPin: serverExam.unlockPin || existingExam.unlockPin,
                  rosterWhitelist:
                    serverExam.rosterWhitelist.length > 0
                      ? serverExam.rosterWhitelist
                      : existingExam.rosterWhitelist,
                  rosterEntries:
                    (serverExam.rosterEntries?.length ?? 0) > 0
                      ? serverExam.rosterEntries
                      : existingExam.rosterEntries,
                  requiresRosterVerification: Boolean(
                    serverExam.requiresRosterVerification ||
                      (serverExam.rosterEntries?.length ?? 0) > 0 ||
                      (existingExam.rosterEntries?.length ?? 0) > 0,
                  ),
                }
              : serverExam;

            const prevQMap = new Map(prev.questions.map((q) => [q.id, q]));
            const mergedQuestions = serverQuestions.map((sq) => {
              const eq = prevQMap.get(sq.id);
              return eq
                ? {
                    ...eq,
                    ...sq,
                    trueFalseItems: sq.trueFalseItems ?? eq.trueFalseItems,
                  }
                : sq;
            });

            return {
              ...prev,
              courses: serverCourse
                ? upsertById(prev.courses, [serverCourse])
                : prev.courses,
              questions: upsertById(prev.questions, mergedQuestions),
              exams: upsertById(prev.exams, [mergedExam]),
            };
          });

          const assigned = buildAssignedQuestions(
            serverExam,
            serverQuestions,
            normalizedCode,
          );
          if (assigned.length === 0) {
            return { ok: false, error: 'Đề thi chưa có câu hỏi trong ngân hàng.' };
          }

          const maxTotalScore =
            Math.round(assigned.reduce((s, q) => s + q.maxPoints, 0) * 100) / 100;
          const clientAttemptId = `att_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
          const clientStartedAt = new Date().toISOString();

          const startRes = await apiRequestDetailed<{
            ok: boolean;
            resumed?: boolean;
            alreadySubmitted?: boolean;
            attemptId?: string;
            examId?: string;
            assignedQuestions?: ExamAttempt['assignedQuestions'];
            answers?: Record<string, AttemptAnswer>;
            attempt?: Record<string, unknown>;
            status?: ExamAttempt['status'];
            currentQuestionIndex?: number;
            flaggedQuestionIds?: string[];
            leaveCount?: number;
            extraLeaveAllowance?: number;
            minorBlurCount?: number;
            totalAwaySeconds?: number;
            lockedAt?: string | null;
            lockedWaitSeconds?: number;
            bonusSeconds?: number;
            unlockRequestNote?: string | null;
            integrityScore?: number;
            startedAt?: string;
          }>('/api/attempts.php?action=start', {
            method: 'POST',
            body: JSON.stringify({
              id: clientAttemptId,
              pin: normalizedPin,
              examId: serverExam.id,
              studentCode: normalizedCode,
              studentName: input.studentName.trim(),
              lastName: input.lastName?.trim() ?? '',
              firstName: input.firstName?.trim() ?? '',
              gender: input.gender?.trim() ?? '',
              dob: input.dob?.trim() ?? '',
              studentEmail: normalizedEmail,
              className: input.className.trim(),
              deviceToken: myDeviceToken,
              assignedQuestions: assigned,
              startedAt: clientStartedAt,
            }),
          });

          if (startRes.reachedJson && !startRes.ok) {
            return {
              ok: false,
              error: startRes.error ?? 'Không thể tham gia phòng thi.',
            };
          }

          if (startRes.ok && startRes.data?.ok) {
            const payload = startRes.data;
            const resolvedAttemptId = payload.attemptId ?? clientAttemptId;

            if (payload.alreadySubmitted) {
              const submittedAtt: ExamAttempt = payload.attempt
                ? normalizeServerAttempt(payload.attempt)
                : {
                    id: resolvedAttemptId,
                    examId: serverExam.id,
                    studentCode: normalizedCode,
                    studentName: input.studentName.trim(),
                    studentEmail: normalizedEmail,
                    className: input.className.trim(),
                    deviceToken: myDeviceToken,
                    assignedQuestions: assigned,
                    answers: {},
                    status: 'SUBMITTED',
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
                    emailSentStatus: 'SENT',
                    emailEditCount: 0,
                    startedAt: clientStartedAt,
                    violations: [],
                  };

              updateState((prev) => ({
                ...prev,
                attempts: upsertById(prev.attempts, [submittedAtt]),
              }));

              return {
                ok: true,
                attemptId: resolvedAttemptId,
                examId: serverExam.id,
                resumed: true,
                alreadySubmitted: true,
              };
            }

            const serverAnswers =
              payload.answers && !Array.isArray(payload.answers)
                ? payload.answers
                : {};
            const localSame = stateRef.current.attempts.find(
              (a) => a.id === resolvedAttemptId,
            );
            const syncedAttempt: ExamAttempt = {
              id: resolvedAttemptId,
              examId: serverExam.id,
              studentCode: normalizedCode,
              studentName: input.studentName.trim(),
              studentEmail: normalizedEmail,
              className: input.className.trim(),
              deviceToken: myDeviceToken,
              assignedQuestions:
                Array.isArray(payload.assignedQuestions) &&
                payload.assignedQuestions.length > 0
                  ? payload.assignedQuestions
                  : assigned,
              answers: { ...serverAnswers, ...(localSame?.answers ?? {}) },
              status: payload.status ?? 'IN_PROGRESS',
              currentQuestionIndex:
                payload.currentQuestionIndex ?? localSame?.currentQuestionIndex ?? 0,
              flaggedQuestionIds: Array.isArray(payload.flaggedQuestionIds)
                ? payload.flaggedQuestionIds
                : (localSame?.flaggedQuestionIds ?? []),
              leaveCount: payload.leaveCount ?? localSame?.leaveCount ?? 0,
              extraLeaveAllowance:
                payload.extraLeaveAllowance ?? localSame?.extraLeaveAllowance ?? 0,
              minorBlurCount:
                payload.minorBlurCount ?? localSame?.minorBlurCount ?? 0,
              totalAwaySeconds:
                payload.totalAwaySeconds ?? localSame?.totalAwaySeconds ?? 0,
              lockedAt: payload.lockedAt || undefined,
              lockedWaitSeconds:
                payload.lockedWaitSeconds ?? localSame?.lockedWaitSeconds ?? 0,
              bonusSeconds: payload.bonusSeconds ?? localSame?.bonusSeconds ?? 0,
              unlockRequestNote: payload.unlockRequestNote || undefined,
              integrityScore:
                payload.integrityScore ?? localSame?.integrityScore ?? 100,
              aiFlag: localSame?.aiFlag ?? false,
              autoScore: localSame?.autoScore ?? 0,
              essayScore: localSame?.essayScore ?? 0,
              totalScore: localSame?.totalScore ?? 0,
              maxTotalScore,
              scale10Score: localSame?.scale10Score ?? 0,
              emailSentStatus: localSame?.emailSentStatus ?? 'PENDING',
              emailEditCount: localSame?.emailEditCount ?? 0,
              startedAt: payload.startedAt ?? clientStartedAt,
              violations: localSame?.violations ?? [],
            };

            updateState((prev) => ({
              ...prev,
              attempts: upsertById(prev.attempts, [syncedAttempt]),
            }));

            return {
              ok: true,
              attemptId: resolvedAttemptId,
              examId: serverExam.id,
              resumed: Boolean(payload.resumed),
            };
          }

          return {
            ok: false,
            error: 'Mất kết nối máy chủ khi khởi tạo bài thi. Vui lòng thử lại.',
          };
        }
      }

      const currentState = stateRef.current;
      const exam = currentState.exams.find((e) => e.roomPin === normalizedPin);
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
      if (exam.rosterEntries && exam.rosterEntries.length > 0) {
        const matchedRoster = exam.rosterEntries.find(
          (entry) => entry.studentCode.trim().toUpperCase() === normalizedCode,
        );
        if (!matchedRoster) {
          return {
            ok: false,
            error: `MSSV ${normalizedCode} không có tên trong danh sách sinh viên được phép thi ca này.`,
          };
        }
        const mismatches: string[] = [];
        if (normalizeRosterText(input.lastName ?? '') !== normalizeRosterText(matchedRoster.lastName)) {
          mismatches.push('Họ đệm');
        }
        if (normalizeRosterText(input.firstName ?? '') !== normalizeRosterText(matchedRoster.firstName)) {
          mismatches.push('Tên');
        }
        if (normalizeRosterText(input.gender ?? '') !== normalizeRosterText(matchedRoster.gender)) {
          mismatches.push('Giới tính');
        }
        if (normalizeRosterDob(input.dob ?? '') !== normalizeRosterDob(matchedRoster.dob)) {
          mismatches.push('Ngày sinh');
        }
        if (mismatches.length > 0) {
          return {
            ok: false,
            error: `Thông tin sinh viên không khớp với danh sách ca thi (kiểm tra lại: ${mismatches.join(', ')}).`,
          };
        }
      }

      const existing = currentState.attempts.find(
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

      const assigned = buildAssignedQuestions(
        exam,
        currentState.questions,
        normalizedCode,
      );
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

      return {
        ok: true,
        attemptId: newAttempt.id,
        examId: exam.id,
        resumed: false,
      };
    },
    [backendConnected, updateState],
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
        const attSnap = stateRef.current.attempts
          .find((a) => a.id === attemptId)
          ?.assignedQuestions.find((s) => s.questionId === questionId);
        const key = `${attemptId}:${questionId}`;
        const existing = heartbeatQueueRef.current.get(key);
        if (existing) {
          window.clearTimeout(existing.timer);
        }
        const body = JSON.stringify({
          attemptId,
          questionId,
          chapterCategory: attSnap?.chapterCategory,
          renderedSeedVars: attSnap?.seedVars,
          maxPoints: attSnap?.maxPoints,
          answerPayload: payload,
          keystrokeTelemetry: telemetry,
          currentQuestionIndex: nextQuestionIndex,
        });
        const timer = window.setTimeout(() => {
          heartbeatQueueRef.current.delete(key);
          void apiRequest('/api/attempts.php?action=heartbeat', {
            method: 'POST',
            body,
          });
        }, 500);
        heartbeatQueueRef.current.set(key, { timer, attemptId, body });
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
      const currentState = stateRef.current;
      const current = currentState.attempts.find((a) => a.id === attemptId);
      if (!current) return null;
      if (current.status === 'SUBMITTED' || current.status === 'AUTO_SUBMITTED') {
        return current;
      }

      const exam = currentState.exams.find((e) => e.id === current.examId);
      const localScored = recalculateAttemptScores(current, currentState.questions);
      const nowIso = new Date().toISOString();
      const isDelayed =
        exam?.emailDeliveryMode === 'DELAYED_BATCH' && exam.status !== 'CLOSED';

      let finalized: ExamAttempt = {
        ...localScored,
        status: forcedByRejectOrSweep ? 'AUTO_SUBMITTED' : 'SUBMITTED',
        submittedAt: localScored.submittedAt ?? nowIso,
        lockedAt: undefined,
        emailSentStatus: isDelayed ? 'RECEIPT_SENT' : 'SENT',
        emailSentAt: nowIso,
      };

      if (backendConnected) {
        await flushPendingHeartbeats(attemptId);
        const submitRes = await apiRequestDetailed<{
          ok: boolean;
          result?: Partial<ExamAttempt>;
          answers?: Array<{
            questionId: string;
            chapterCategory?: string;
            isCorrect?: boolean | null;
            maxPoints?: number;
            earnedPoints?: number;
            gradingFeedback?: string;
            gradingStatus?: AttemptAnswer['gradingStatus'];
            rubricBreakdown?: AttemptAnswer['rubricBreakdown'];
            matchedHighlights?: string[];
            blockedHighlights?: string[];
            honeypotTriggered?: boolean;
          }>;
        }>('/api/attempts.php?action=submit', {
          method: 'POST',
          body: JSON.stringify({
            ...localScored,
            attemptId: current.id,
            forcedByRejectOrSweep,
          }),
        });

        if (submitRes.ok && submitRes.data?.ok && submitRes.data.result) {
          const srv = submitRes.data.result;
          const mergedAnswers: Record<string, AttemptAnswer> = {
            ...localScored.answers,
          };
          let hasHoneypot = current.aiFlag;
          for (const sa of submitRes.data.answers ?? []) {
            const prevAns = mergedAnswers[sa.questionId];
            if (sa.honeypotTriggered) hasHoneypot = true;
            const snap = current.assignedQuestions.find(
              (s) => s.questionId === sa.questionId,
            );
            mergedAnswers[sa.questionId] = {
              questionId: sa.questionId,
              chapterCategory:
                sa.chapterCategory ??
                prevAns?.chapterCategory ??
                snap?.chapterCategory ??
                '',
              renderedSeedVars: prevAns?.renderedSeedVars ?? snap?.seedVars ?? {},
              answerPayload: prevAns?.answerPayload ?? '',
              keystrokeTelemetry: prevAns?.keystrokeTelemetry,
              isCorrect: sa.isCorrect ?? prevAns?.isCorrect ?? null,
              maxPoints: sa.maxPoints ?? prevAns?.maxPoints ?? snap?.maxPoints ?? 1,
              earnedPoints: sa.earnedPoints ?? prevAns?.earnedPoints ?? 0,
              gradingFeedback: sa.gradingFeedback ?? prevAns?.gradingFeedback,
              gradingStatus: sa.gradingStatus ?? prevAns?.gradingStatus ?? 'AUTO',
              rubricBreakdown: sa.rubricBreakdown ?? prevAns?.rubricBreakdown,
              matchedHighlights: sa.matchedHighlights ?? prevAns?.matchedHighlights,
              blockedHighlights: sa.blockedHighlights ?? prevAns?.blockedHighlights,
              honeypotTriggered: Boolean(sa.honeypotTriggered),
            };
          }

          finalized = {
            ...localScored,
            answers: mergedAnswers,
            status:
              srv.status ?? (forcedByRejectOrSweep ? 'AUTO_SUBMITTED' : 'SUBMITTED'),
            submittedAt: srv.submittedAt ?? nowIso,
            lockedAt: undefined,
            autoScore: srv.autoScore ?? localScored.autoScore,
            essayScore: srv.essayScore ?? localScored.essayScore,
            totalScore: srv.totalScore ?? localScored.totalScore,
            maxTotalScore: srv.maxTotalScore ?? localScored.maxTotalScore,
            scale10Score: srv.scale10Score ?? localScored.scale10Score,
            integrityScore: srv.integrityScore ?? localScored.integrityScore,
            aiFlag: hasHoneypot,
            emailSentStatus:
              srv.emailSentStatus ?? (isDelayed ? 'RECEIPT_SENT' : 'SENT'),
            emailSentAt: nowIso,
          };
        }
      }

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

      updateState((prev) => ({
        ...prev,
        attempts: prev.attempts.map((a) => (a.id === attemptId ? finalized : a)),
        emailLogs: [mailLog, ...prev.emailLogs],
      }));

      return finalized;
    },
    [backendConnected, updateState],
  );

  const myDeviceTokenForPoll = getOrCreateDeviceToken();
  const activePollAttempt = state.attempts.find(
    (a) =>
      a.deviceToken === myDeviceTokenForPoll &&
      (a.status === 'IN_PROGRESS' || a.status === 'PAUSED' || a.status === 'LOCKED'),
  );
  const activePollAttemptId = activePollAttempt?.id ?? null;

  useEffect(() => {
    if (!backendConnected || !activePollAttemptId) return;

    let cancelled = false;
    let inFlight = false;

    const tickPoll = async () => {
      if (cancelled || inFlight) return;
      inFlight = true;
      try {
        const res = await apiRequestDetailed<{
          ok: boolean;
          s?: ExamAttempt['status'];
          b?: number;
          x?: number;
          w?: number;
          e?: Exam['status'];
        }>(`/api/proctor.php?action=poll&attemptId=${encodeURIComponent(activePollAttemptId)}`, {
          method: 'GET',
        });

        if (cancelled || !res.ok || !res.data?.ok || !res.data.s) return;
        const { s, b, x, w, e } = res.data;

        if (s === 'AUTO_SUBMITTED' || s === 'SUBMITTED' || e === 'CLOSED') {
          if (e === 'CLOSED') {
            const targetExamId = stateRef.current.attempts.find(
              (a) => a.id === activePollAttemptId,
            )?.examId;
            if (targetExamId) {
              updateState((prev) => ({
                ...prev,
                exams: prev.exams.map((ex) =>
                  ex.id === targetExamId && ex.status !== 'CLOSED'
                    ? { ...ex, status: 'CLOSED' }
                    : ex,
                ),
              }));
            }
          }
          if (autoSubmittedPollRef.current !== activePollAttemptId) {
            autoSubmittedPollRef.current = activePollAttemptId;
            void submitAttempt(activePollAttemptId, true);
          }
          return;
        }

        const curr = stateRef.current.attempts.find((a) => a.id === activePollAttemptId);
        const currExam = curr
          ? stateRef.current.exams.find((ex) => ex.id === curr.examId)
          : undefined;
        const attemptChanged =
          curr &&
          (curr.status !== s ||
            (b !== undefined && curr.bonusSeconds !== b) ||
            (x !== undefined && curr.extraLeaveAllowance !== x) ||
            (w !== undefined && curr.lockedWaitSeconds !== w));
        const examChanged = Boolean(currExam && e && currExam.status !== e);

        if (!attemptChanged && !examChanged) return;

        updateState((prev) => ({
          ...prev,
          exams:
            examChanged && currExam && e
              ? prev.exams.map((ex) =>
                  ex.id === currExam.id ? { ...ex, status: e } : ex,
                )
              : prev.exams,
          attempts: attemptChanged
            ? prev.attempts.map((a) => {
                if (a.id !== activePollAttemptId) return a;
                return {
                  ...a,
                  status: s,
                  lockedAt: s === 'IN_PROGRESS' ? undefined : a.lockedAt,
                  bonusSeconds: b ?? a.bonusSeconds,
                  extraLeaveAllowance: x ?? a.extraLeaveAllowance,
                  lockedWaitSeconds: w ?? a.lockedWaitSeconds,
                };
              })
            : prev.attempts,
        }));
      } finally {
        inFlight = false;
      }
    };

    let timeoutId: number | null = null;

    const scheduleNext = () => {
      if (cancelled) return;
      const jitterMs = Math.floor(Math.random() * 2500 - 1250);
      timeoutId = window.setTimeout(() => {
        void runLoop();
      }, 6000 + jitterMs);
    };

    const runLoop = async () => {
      if (cancelled) return;
      if (document.visibilityState !== 'hidden') {
        await tickPoll();
      }
      scheduleNext();
    };

    const handleVisibilityChange = () => {
      if (!cancelled && document.visibilityState === 'visible') {
        void tickPoll();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    scheduleNext();

    return () => {
      cancelled = true;
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [backendConnected, activePollAttemptId, submitAttempt, updateState]);

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
        if (backendConnected) {
          const nowIso = new Date().toISOString();
          updateState((prev) => ({
            ...prev,
            attempts: prev.attempts.map((a) =>
              a.id === attemptId
                ? {
                    ...a,
                    status: 'AUTO_SUBMITTED',
                    submittedAt: a.submittedAt ?? nowIso,
                    lockedAt: undefined,
                  }
                : a,
            ),
          }));
          void apiRequest<{ ok: boolean; attempt?: Partial<ExamAttempt> }>(
            '/api/proctor.php?action=decision',
            {
              method: 'POST',
              body: JSON.stringify({ attemptId, decision: 'REJECT' }),
            },
          ).then((res) => {
            if (res?.ok && res.attempt) {
              updateState((prev) => ({
                ...prev,
                attempts: prev.attempts.map((a) =>
                  a.id === attemptId
                    ? { ...a, ...res.attempt, lockedAt: undefined }
                    : a,
                ),
              }));
            }
          });
          return;
        }
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
    (course: Omit<Course, 'id'>): Course => {
      const newCourse: Course = {
        ...course,
        ownerId: course.ownerId ?? instructorUser?.id,
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
      return newCourse;
    },
    [backendConnected, instructorUser?.id, updateState],
  );

  const updateCourse = useCallback(
    async (course: Course): Promise<{ ok: boolean; error?: string }> => {
      const prevCourse = stateRef.current.courses.find((c) => c.id === course.id);
      updateState((prev) => ({
        ...prev,
        courses: prev.courses.map((c) => (c.id === course.id ? course : c)),
      }));

      if (backendConnected) {
        const res = await apiRequestDetailed<{ ok: boolean; course?: Course; error?: string }>(
          '/api/exams.php?action=save_course',
          {
            method: 'POST',
            body: JSON.stringify(course),
          },
        );
        if (!res.ok || !res.data?.ok) {
          if (prevCourse) {
            updateState((prev) => ({
              ...prev,
              courses: prev.courses.map((c) => (c.id === course.id ? prevCourse : c)),
            }));
          }
          return {
            ok: false,
            error: res.error || res.data?.error || 'Không thể cập nhật học phần.',
          };
        }
      }
      return { ok: true };
    },
    [backendConnected, updateState],
  );

  const deleteCourse = useCallback(
    async (courseId: string): Promise<{ ok: boolean; error?: string }> => {
      const prevCourses = stateRef.current.courses;
      const prevQuestions = stateRef.current.questions;
      updateState((prev) => ({
        ...prev,
        courses: prev.courses.filter((c) => c.id !== courseId),
        questions: prev.questions.filter((q) => q.courseId !== courseId),
      }));

      if (backendConnected) {
        const res = await apiRequestDetailed<{ ok: boolean; error?: string }>(
          '/api/exams.php?action=delete_course',
          {
            method: 'POST',
            body: JSON.stringify({ id: courseId }),
          },
        );
        if (!res.ok || !res.data?.ok) {
          updateState((prev) => ({
            ...prev,
            courses: prevCourses,
            questions: prevQuestions,
          }));
          return {
            ok: false,
            error: res.error || res.data?.error || 'Không thể xóa học phần.',
          };
        }
      }
      return { ok: true };
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
    async (exam: Exam): Promise<{ ok: boolean; error?: string }> => {
      const prevExam = stateRef.current.exams.find((e) => e.id === exam.id);
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
        const res = await apiRequestDetailed<{ ok: boolean; exam?: Exam; error?: string }>(
          '/api/exams.php?action=save_exam',
          {
            method: 'POST',
            body: JSON.stringify(exam),
          },
        );
        if (!res.ok || !res.data?.ok) {
          updateState((prev) => ({
            ...prev,
            exams: prevExam
              ? prev.exams.map((e) => (e.id === exam.id ? prevExam : e))
              : prev.exams.filter((e) => e.id !== exam.id),
          }));
          return {
            ok: false,
            error: res.error || res.data?.error || 'Không thể lưu đề thi lên máy chủ.',
          };
        }
        if (res.data.exam) {
          const saved = normalizeServerExam(res.data.exam);
          updateState((prev) => ({
            ...prev,
            exams: prev.exams.map((e) => (e.id === exam.id ? saved : e)),
          }));
        }
      }
      return { ok: true };
    },
    [backendConnected, updateState],
  );

  const deleteExam = useCallback(
    async (examId: string): Promise<{ ok: boolean; error?: string }> => {
      const prevExams = stateRef.current.exams;
      updateState((prev) => ({
        ...prev,
        exams: prev.exams.filter((e) => e.id !== examId),
      }));

      if (backendConnected) {
        const res = await apiRequestDetailed<{ ok: boolean; error?: string }>(
          '/api/exams.php?action=delete_exam',
          {
            method: 'POST',
            body: JSON.stringify({ id: examId }),
          },
        );
        if (!res.ok || !res.data?.ok) {
          updateState((prev) => ({
            ...prev,
            exams: prevExams,
          }));
          return {
            ok: false,
            error: res.error || res.data?.error || 'Không thể xóa đề thi.',
          };
        }
      }
      return { ok: true };
    },
    [backendConnected, updateState],
  );

  const cloneExam = useCallback(
    (examId: string, customTitle?: string): Exam | null => {
      const source = state.exams.find((e) => e.id === examId);
      if (!source) return null;
      const randomPin = String(Math.floor(100000 + Math.random() * 900000));
      const cloned: Exam = {
        ...source,
        id: `exam_${Date.now().toString(36)}`,
        title: customTitle?.trim() || `${source.title} (Ca mới)`,
        roomPin: randomPin,
        rosterWhitelist: [],
        rosterEntries: [],
        requiresRosterVerification: false,
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

    if (backendConnected) {
      void (async () => {
        const res = await apiRequestDetailed<{
          ok: boolean;
          courses?: Course[];
          questions?: Question[];
          exams?: Exam[];
        }>('/api/exams.php?action=reset_demo', {
          method: 'POST',
          body: JSON.stringify({}),
        });
        if (res.ok && res.data?.ok) {
          const liveRes = await apiRequestDetailed<{
            ok: boolean;
            attempts?: Array<Record<string, unknown>>;
          }>('/api/proctor.php?action=live', { method: 'GET' });
          const nextAttempts =
            liveRes.ok && liveRes.data?.ok && Array.isArray(liveRes.data.attempts)
              ? liveRes.data.attempts.map(normalizeServerAttempt)
              : undefined;
          updateState((prev) => ({
            ...prev,
            courses: res.data?.courses ?? prev.courses,
            questions: res.data?.questions ?? prev.questions,
            exams: Array.isArray(res.data?.exams)
              ? res.data.exams.map(normalizeServerExam)
              : prev.exams,
            attempts: nextAttempts ?? prev.attempts,
          }));
        }
      })();
    }
  }, [backendConnected, persistState, updateState]);

  return (
    <ExamContext.Provider
      value={{
        ...state,
        backendConnected,
        isAdminAuthenticated,
        instructorUser,
        googleClientId,
        adminLogin,
        instructorLogin,
        instructorRegister,
        instructorGoogleLogin,
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
        updateCourse,
        deleteCourse,
        upsertQuestion,
        deleteQuestion,
        importQuestionsBulk,
        upsertExam,
        deleteExam,
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
