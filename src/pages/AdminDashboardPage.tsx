import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Activity,
  BarChart3,
  BookOpen,
  CheckCircle2,
  Copy,
  Download,
  Eye,
  FileJson,
  FileSpreadsheet,
  Layers,
  LogOut,
  Mail,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Smartphone,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { CoursesTabPanel } from '../components/admin/CoursesTabPanel';
import { EssayGradingModal } from '../components/admin/EssayGradingModal';
import { ExamAnalyticsCharts } from '../components/admin/ExamAnalyticsCharts';
import { ExcelQuestionBankModal } from '../components/admin/ExcelQuestionBankModal';
import { GoogleSignInButton } from '../components/admin/GoogleSignInButton';
import { LiveProctorTable } from '../components/admin/LiveProctorTable';
import { QuestionEditorModal } from '../components/admin/QuestionEditorModal';
import { CaptchaField } from '../components/common/CaptchaField';
import { InfoHint } from '../components/common/InfoHint';
import { useExamPlatform } from '../context/ExamContext';
import type {
  ChapterQuotaRule,
  EmailDeliveryMode,
  Question,
  QuestionType,
  ShuffleModeOption,
} from '../types/exam';
import {
  buildExamCsvContent,
  downloadTextFile,
  exportExamGradebookXlsx,
  exportQuestionBankJson,
} from '../utils/csvExport';
import {
  buildAssignedQuestions,
  computeChapterMastery,
  computeItemAnalysis,
} from '../utils/dynamicQuestionEngine';
import {
  ALL_QUESTION_TYPES,
  downloadQuestionBankTemplateXlsx,
  exportCourseQuestionsToXlsx,
} from '../utils/excelQuestionBank';

type AdminTab =
  | 'COURSES'
  | 'BANK'
  | 'EXAMS'
  | 'LIVE'
  | 'ANALYTICS_ESSAY'
  | 'EMAILS';

const BANK_TEMPLATE_TYPE_OPTIONS: { type: QuestionType; label: string }[] = [
  { type: 'SINGLE_CHOICE', label: 'Trắc nghiệm 4 phương án (1 đáp án)' },
  { type: 'MULTI_CHOICE', label: 'Trắc nghiệm nhiều đáp án' },
  { type: 'TRUE_FALSE', label: 'Đúng / Sai (các mệnh đề Đ/S)' },
  { type: 'NUMERICAL', label: 'Tính toán số (biến động)' },
  { type: 'ESSAY', label: 'Tự luận ngắn (Rubric)' },
];

export const AdminDashboardPage: React.FC = () => {
  const {
    courses,
    questions,
    exams,
    attempts,
    emailLogs,
    isAdminAuthenticated,
    instructorUser,
    googleClientId,
    adminLogin,
    instructorLogin,
    instructorRegister,
    instructorGoogleLogin,
    adminLogout,
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
    checkDemoMailerQuota,
    sendTestMailer,
    resetDemoData,
  } = useExamPlatform();

  const [searchParams, setSearchParams] = useSearchParams();
  const [authTab, setAuthTab] = useState<'LOGIN' | 'REGISTER'>('LOGIN');
  const [authFullName, setAuthFullName] = useState('');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [showPasscodeBox, setShowPasscodeBox] = useState(false);
  const [passcode, setPasscode] = useState('');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [captchaToken, setCaptchaToken] = useState('');
  const [captchaAnswer, setCaptchaAnswer] = useState('');
  const [captchaRefreshKey, setCaptchaRefreshKey] = useState(0);
  const demoAutoLoginTriedRef = useRef(false);
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);
  const [createExamModalOpen, setCreateExamModalOpen] = useState(false);
  const [newExamTitle, setNewExamTitle] = useState('');
  const [newExamCourseId, setNewExamCourseId] = useState('');
  const [newExamPin, setNewExamPin] = useState(() =>
    String(Math.floor(100000 + Math.random() * 900000)),
  );
  const [newExamDuration, setNewExamDuration] = useState(45);
  const [newExamStatus, setNewExamStatus] = useState<'OPEN' | 'DRAFT'>('OPEN');
  const [selectedCourseId, setSelectedCourseId] = useState(courses[0]?.id ?? '');
  const [selectedExamId, setSelectedExamId] = useState(exams[0]?.id ?? '');
  const [activeTab, setActiveTab] = useState<AdminTab>(() =>
    exams.length > 0 ? 'LIVE' : 'COURSES',
  );
  const [templateBoxOpen, setTemplateBoxOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  const [questionModalOpen, setQuestionModalOpen] = useState(false);
  const [questionModalDefaultChapter, setQuestionModalDefaultChapter] = useState<string | undefined>(undefined);
  const [editingQuestion, setEditingQuestion] = useState<Question | undefined>(
    undefined,
  );
  const [customChaptersByCourse, setCustomChaptersByCourse] = useState<Record<string, string[]>>({});
  const [newChapterOpen, setNewChapterOpen] = useState(false);
  const [newChapterName, setNewChapterName] = useState('');
  const [essayModalAttemptId, setEssayModalAttemptId] = useState<string | null>(
    null,
  );
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewStudentCode, setPreviewStudentCode] = useState('3122102099');
  const [excelModalOpen, setExcelModalOpen] = useState(false);
  const [bankSearch, setBankSearch] = useState('');
  const [bankChapterFilter, setBankChapterFilter] = useState('ALL');
  const [bankTypeFilter, setBankTypeFilter] = useState<'ALL' | QuestionType>('ALL');
  const [newCourseOpen, setNewCourseOpen] = useState(false);
  const [newCourseCode, setNewCourseCode] = useState('');
  const [newCourseName, setNewCourseName] = useState('');
  const [modalCourseOpen, setModalCourseOpen] = useState(false);
  const [modalCourseCode, setModalCourseCode] = useState('');
  const [modalCourseName, setModalCourseName] = useState('');
  const [bankTemplateTypes, setBankTemplateTypes] = useState<QuestionType[]>([]);
  const [testMailerModalOpen, setTestMailerModalOpen] = useState(false);
  const [testMailerEmail, setTestMailerEmail] = useState('');
  const [testMailerSending, setTestMailerSending] = useState(false);
  const [testMailerError, setTestMailerError] = useState('');
  const [testMailerSuccess, setTestMailerSuccess] = useState('');
  const [testMailerQuota, setTestMailerQuota] = useState<{
    loading: boolean;
    allowed: boolean;
    alreadyTestedRecipient?: string;
    message?: string;
  }>({ loading: false, allowed: true });

  const effectiveBankTemplateTypes = useMemo<QuestionType[]>(
    () => (bankTemplateTypes.length > 0 ? bankTemplateTypes : ['SINGLE_CHOICE']),
    [bankTemplateTypes],
  );
  const isDefaultFourOptionTemplate =
    effectiveBankTemplateTypes.length === 1 &&
    effectiveBankTemplateTypes[0] === 'SINGLE_CHOICE';

  const toggleBankTemplateType = (type: QuestionType) => {
    setBankTemplateTypes((prev) =>
      prev.includes(type) ? prev.filter((item) => item !== type) : [...prev, type],
    );
  };

  const showToast = (msg: string) => {
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
    }
    setToast(msg);
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, 2200);
  };

  useEffect(() => {
    if (
      searchParams.get('demo') === '1' &&
      !isAdminAuthenticated &&
      !demoAutoLoginTriedRef.current
    ) {
      demoAutoLoginTriedRef.current = true;
      setAuthLoading(true);
      void adminLogin('vne2026').then((ok) => {
        setAuthLoading(false);
        if (ok) {
          const next = new URLSearchParams(searchParams);
          next.delete('demo');
          setSearchParams(next, { replace: true });
          showToast('Đã đăng nhập Tài khoản Giảng viên Demo (vne2026).');
        } else {
          setAuthError('Không thể tự động đăng nhập tài khoản Giảng viên Demo.');
        }
      });
    }
  }, [adminLogin, isAdminAuthenticated, searchParams, setSearchParams]);

  const selectedExam = useMemo(
    () => exams.find((e) => e.id === selectedExamId) ?? exams[0],
    [exams, selectedExamId],
  );
  const selectedCourse = useMemo(
    () =>
      courses.find((c) => c.id === selectedCourseId) ??
      courses.find((c) => c.id === selectedExam?.courseId) ??
      courses[0],
    [courses, selectedCourseId, selectedExam],
  );
  const courseQuestions = useMemo(
    () => questions.filter((q) => q.courseId === selectedCourse?.id),
    [questions, selectedCourse],
  );

  const chapterGroups = useMemo(() => {
    const map = new Map<string, Question[]>();
    if (selectedCourse) {
      for (const ch of customChaptersByCourse[selectedCourse.id] ?? []) {
        if (!map.has(ch)) map.set(ch, []);
      }
    }
    for (const q of courseQuestions) {
      const arr = map.get(q.chapterCategory) ?? [];
      arr.push(q);
      map.set(q.chapterCategory, arr);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b, 'vi'));
  }, [courseQuestions, customChaptersByCourse, selectedCourse]);

  const handleDownloadTemplateXlsx = () => {
    downloadQuestionBankTemplateXlsx(
      selectedCourse?.code ?? 'COURSE',
      selectedCourse?.name ?? 'Học phần',
      Array.from(
        new Set([
          ...chapterGroups.map(([name]) => name),
          ...(selectedExam?.chapterMatrix.map((r) => r.chapterCategory) ?? []),
        ]),
      ),
      effectiveBankTemplateTypes,
    );
  };

  const filteredCourseQuestions = useMemo(() => {
    const term = bankSearch.trim().toLowerCase();
    return courseQuestions.filter((q) => {
      if (bankChapterFilter !== 'ALL' && q.chapterCategory !== bankChapterFilter) {
        return false;
      }
      if (bankTypeFilter !== 'ALL' && q.type !== bankTypeFilter) {
        return false;
      }
      if (term) {
        const hay = `${q.id} ${q.chapterCategory} ${q.content} ${q.sampleAnswer ?? ''}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
  }, [bankChapterFilter, bankSearch, bankTypeFilter, courseQuestions]);

  const filteredChapterGroups = useMemo(() => {
    const map = new Map<string, Question[]>();
    for (const q of filteredCourseQuestions) {
      const arr = map.get(q.chapterCategory) ?? [];
      arr.push(q);
      map.set(q.chapterCategory, arr);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b, 'vi'));
  }, [filteredCourseQuestions]);

  const chapterMasteryStats = useMemo(
    () =>
      selectedExam ? computeChapterMastery(attempts, selectedExam.id) : [],
    [attempts, selectedExam],
  );

  const itemAnalysisRows = useMemo(
    () =>
      selectedExam
        ? computeItemAnalysis(
            attempts.filter((a) => a.examId === selectedExam.id),
            questions,
          )
        : [],
    [attempts, questions, selectedExam],
  );

  const previewAssigned = useMemo(() => {
    if (!previewOpen || !selectedExam) return [];
    return buildAssignedQuestions(
      selectedExam,
      questions,
      previewStudentCode || '3122102099',
    );
  }, [previewOpen, previewStudentCode, questions, selectedExam]);

  const essayAttemptTarget = useMemo(
    () => attempts.find((a) => a.id === essayModalAttemptId) ?? null,
    [attempts, essayModalAttemptId],
  );

  const isDemoMode = instructorUser?.role !== 'OFFICIAL';

  const requireOfficialOrPrompt = (): boolean => {
    if (!isDemoMode) return true;
    setAuthError('');
    setUpgradeModalOpen(true);
    return false;
  };

  const saveExamSetting = (nextExam: typeof exams[number]) => {
    if (!requireOfficialOrPrompt()) return;
    void upsertExam(nextExam).then((res) => {
      if (!res.ok) {
        showToast(res.error || 'Không thể lưu thay đổi lên máy chủ.');
      }
    });
  };

  if (!isAdminAuthenticated) {
    const handleEmailAuth = async (e: React.FormEvent) => {
      e.preventDefault();
      setAuthError('');
      setAuthLoading(true);
      const res =
        authTab === 'REGISTER'
          ? await instructorRegister(
              authFullName,
              authEmail,
              authPassword,
              captchaToken,
              captchaAnswer,
            )
          : await instructorLogin(authEmail, authPassword, captchaToken, captchaAnswer);
      setAuthLoading(false);
      if (!res.ok) {
        setAuthError(res.error ?? 'Không thể xác thực tài khoản giảng viên.');
        setCaptchaRefreshKey((k) => k + 1);
      }
    };

    const handleGoogleCredential = async (credential: string) => {
      setAuthError('');
      setAuthLoading(true);
      const res = await instructorGoogleLogin(credential);
      setAuthLoading(false);
      if (!res.ok) {
        setAuthError(res.error ?? 'Đăng nhập Google thất bại.');
      }
    };

    const handleAuth = async (e: React.FormEvent) => {
      e.preventDefault();
      setAuthError('');
      setAuthLoading(true);
      const ok = await adminLogin(passcode, captchaToken, captchaAnswer);
      setAuthLoading(false);
      if (!ok) {
        setAuthError('Mã khóa hoặc CAPTCHA chưa đúng. Mã Giảng viên Demo công khai: vne2026');
        setCaptchaRefreshKey((k) => k + 1);
      }
    };

    const handleDemoLogin = async () => {
      setAuthError('');
      setAuthLoading(true);
      const ok = await adminLogin('vne2026');
      setAuthLoading(false);
      if (!ok) {
        setAuthError('Không thể kết nối đăng nhập Giảng viên Demo (vne2026).');
      }
    };

    return (
      <div className="min-h-screen bg-surface-100 flex items-center justify-center p-4 py-8">
        <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-card p-6 space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-brand-600 text-white flex items-center justify-center mx-auto">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div className="text-center">
            <h1 className="text-lg font-extrabold text-ink-900">
              Cổng Giảng viên (/admin)
            </h1>
            <p className="text-xs text-ink-500 mt-1">
              Đăng ký / Đăng nhập tài khoản để tạo &amp; quản lý đề thi chính thức
            </p>
          </div>

          {/* Official Instructor Auth Tabs */}
          <div className="grid grid-cols-2 p-1 bg-slate-100 rounded-xl text-xs font-bold">
            <button
              type="button"
              onClick={() => {
                setAuthTab('LOGIN');
                setAuthError('');
              }}
              className={`py-2 rounded-lg transition ${
                authTab === 'LOGIN'
                  ? 'bg-white text-brand-700 shadow-2xs'
                  : 'text-ink-600 hover:text-ink-900'
              }`}
            >
              Đăng nhập Giảng viên
            </button>
            <button
              type="button"
              onClick={() => {
                setAuthTab('REGISTER');
                setAuthError('');
              }}
              className={`py-2 rounded-lg transition ${
                authTab === 'REGISTER'
                  ? 'bg-white text-brand-700 shadow-2xs'
                  : 'text-ink-600 hover:text-ink-900'
              }`}
            >
              Đăng ký tài khoản mới
            </button>
          </div>

          {/* Google Sign-In */}
          <GoogleSignInButton
            googleClientId={googleClientId}
            disabled={authLoading}
            onCredential={handleGoogleCredential}
          />

          <div className="flex items-center gap-2 text-[11px] text-ink-400">
            <div className="h-px bg-slate-200 flex-1" />
            <span>Hoặc dùng Email &amp; Mật khẩu</span>
            <div className="h-px bg-slate-200 flex-1" />
          </div>

          <form onSubmit={handleEmailAuth} className="space-y-2.5">
            {authTab === 'REGISTER' && (
              <input
                type="text"
                required
                value={authFullName}
                onChange={(e) => setAuthFullName(e.target.value)}
                placeholder="Họ và tên giảng viên (VD: TS. Nguyễn Văn A)"
                className="w-full h-11 px-3.5 rounded-xl border border-slate-300 text-sm"
              />
            )}
            <input
              type="email"
              required
              value={authEmail}
              onChange={(e) => setAuthEmail(e.target.value)}
              placeholder="Email giảng viên (@vneconomics.com, @gmail.com...)"
              className="w-full h-11 px-3.5 rounded-xl border border-slate-300 text-sm"
            />
            <input
              type="password"
              required
              minLength={6}
              value={authPassword}
              onChange={(e) => setAuthPassword(e.target.value)}
              placeholder="Mật khẩu (tối thiểu 6 ký tự)"
              className="w-full h-11 px-3.5 rounded-xl border border-slate-300 text-sm"
            />
            <CaptchaField
              answer={captchaAnswer}
              onAnswerChange={setCaptchaAnswer}
              onTokenChange={setCaptchaToken}
              refreshKey={captchaRefreshKey}
              disabled={authLoading}
            />
            {authError && (
              <p className="text-xs text-rose-600 font-semibold">{authError}</p>
            )}
            <button
              type="submit"
              disabled={authLoading}
              className="w-full h-11 rounded-xl bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white text-xs font-bold"
            >
              {authLoading
                ? 'Đang xử lý...'
                : authTab === 'REGISTER'
                  ? 'Đăng ký & Vào tạo đề chính thức'
                  : 'Đăng nhập Giảng viên'}
            </button>
          </form>

          {/* 1-Tap Public Demo Instructor Box */}
          <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-3.5 space-y-2">
            <div>
              <p className="text-xs font-extrabold text-amber-900">
                Chỉ muốn xem thử? Dùng Tài khoản Demo (vne2026)
              </p>
              <p className="text-[11px] text-amber-800 mt-0.5 leading-relaxed">
                Chế độ Demo chỉ cho phép trải nghiệm 3 phòng mẫu (<span className="font-mono">101202</span>, <span className="font-mono">202303</span>, <span className="font-mono">303404</span>) và không được tạo đề thi chính thức mới.
              </p>
            </div>
            <button
              type="button"
              disabled={authLoading}
              onClick={() => void handleDemoLogin()}
              className="w-full h-9 rounded-xl bg-amber-600 hover:bg-amber-700 disabled:opacity-60 text-white text-xs font-bold shadow-xs transition"
            >
              Vào trải nghiệm Chế độ Demo (vne2026)
            </button>
          </div>

          <div className="space-y-2 pt-1">
            <div className="flex items-center justify-between text-xs">
              <Link to="/" className="font-semibold text-brand-600 hover:underline">
                ← Cổng thi Sinh viên
              </Link>
              <button
                type="button"
                onClick={() => setShowPasscodeBox((prev) => !prev)}
                className="font-semibold text-ink-500 hover:text-ink-800"
              >
                {showPasscodeBox ? 'Ẩn mã khóa riêng' : 'Dùng mã khóa quản trị'}
              </button>
            </div>

            {showPasscodeBox && (
              <form onSubmit={handleAuth} className="space-y-2 pt-1">
                <div className="flex gap-2">
                  <input
                    type="password"
                    value={passcode}
                    onChange={(e) => setPasscode(e.target.value)}
                    placeholder="Nhập mã khóa..."
                    className="flex-1 h-9 px-3 rounded-lg border border-slate-300 text-xs font-mono"
                  />
                  <button
                    type="submit"
                    disabled={authLoading}
                    className="h-9 px-3 rounded-lg bg-slate-800 text-white text-xs font-bold"
                  >
                    Vào
                  </button>
                </div>
                {passcode.trim() !== 'vne2026' && (
                  <CaptchaField
                    answer={captchaAnswer}
                    onAnswerChange={setCaptchaAnswer}
                    onTokenChange={setCaptchaToken}
                    refreshKey={captchaRefreshKey}
                    disabled={authLoading}
                  />
                )}
              </form>
            )}
          </div>
        </div>
      </div>
    );
  }

  const updateMatrixRule = (
    chapterCategory: string,
    patch: Partial<ChapterQuotaRule>,
  ) => {
    if (!requireOfficialOrPrompt() || !selectedExam) return;
    const existing = selectedExam.chapterMatrix.find(
      (r) => r.chapterCategory === chapterCategory,
    );
    const nextMatrix = existing
      ? selectedExam.chapterMatrix.map((r) =>
          r.chapterCategory === chapterCategory ? { ...r, ...patch } : r,
        )
      : [
          ...selectedExam.chapterMatrix,
          {
            chapterCategory,
            questionCount: patch.questionCount ?? 1,
            pointsPerQuestion: patch.pointsPerQuestion ?? 1,
            percent: patch.percent ?? 25,
          },
        ];
    saveExamSetting({ ...selectedExam, chapterMatrix: nextMatrix });
  };

  const totalMatrixQuestions = (selectedExam?.chapterMatrix ?? []).reduce(
    (s, r) => s + (r.questionCount || 0),
    0,
  );
  const totalMatrixPoints = (selectedExam?.chapterMatrix ?? []).reduce(
    (s, r) => s + (r.questionCount || 0) * (r.pointsPerQuestion ?? 1),
    0,
  );

  const handleDuplicateQuestion = (q: Question) => {
    if (!requireOfficialOrPrompt()) return;
    const cloned: Question = {
      ...q,
      id: `q_copy_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`,
      content: `${q.content} (Bản sao)`,
    };
    upsertQuestion(cloned);
    showToast('Đã nhân bản câu hỏi.');
  };

  return (
    <div className="min-h-screen bg-surface-100 pb-12 safe-bottom">
      {/* Top Admin Navbar */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40 safe-top">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 py-2.5 flex flex-col md:flex-row md:items-center md:justify-between gap-2.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-brand-600 text-white flex items-center justify-center font-bold shrink-0">
              <ShieldCheck className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xs sm:text-sm font-extrabold text-ink-900 truncate">
                  VNEconomics Instructor Control Center
                </h1>
                {isDemoMode ? (
                  <button
                    type="button"
                    onClick={() => setUpgradeModalOpen(true)}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300 text-[10px] font-extrabold hover:bg-amber-200 transition"
                  >
                    CHẾ ĐỘ DEMO • Bấm để đăng ký tạo đề thật
                  </button>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-support-100 text-support-800 border border-support-300 text-[10px] font-extrabold">
                    GV: {instructorUser?.name || instructorUser?.email}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-ink-500 truncate">
                Ma trận Chương • Chấm Rubric &lt; 1ms • Live Proctoring
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto no-scrollbar pb-0.5 md:pb-0 md:flex-wrap">
            {courses.length > 0 && (
              <label className="inline-flex items-center h-9 px-2.5 sm:px-3 rounded-xl border border-slate-300 bg-slate-50 shrink-0">
                <span className="text-[11px] font-semibold text-ink-500 mr-1.5 whitespace-nowrap">
                  Học phần:
                </span>
                <select
                  value={selectedCourse?.id ?? ''}
                  onChange={(e) => {
                    const cid = e.target.value;
                    setSelectedCourseId(cid);
                    const firstCourseExam = exams.find((ex) => ex.courseId === cid);
                    if (firstCourseExam) {
                      setSelectedExamId(firstCourseExam.id);
                    }
                  }}
                  aria-label="Chọn học phần"
                  className="bg-transparent text-xs font-bold text-ink-900 max-w-[160px] focus:outline-none"
                >
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.code} — {c.name}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <label className="inline-flex items-center h-9 px-2.5 sm:px-3 rounded-xl border border-slate-300 bg-slate-50 shrink-0">
              <span className="text-[11px] font-semibold text-ink-500 mr-1.5 whitespace-nowrap">
                Đề thi:
              </span>
              <select
                value={selectedExam?.id ?? ''}
                onChange={(e) => {
                  const eid = e.target.value;
                  setSelectedExamId(eid);
                  const ex = exams.find((item) => item.id === eid);
                  if (ex) setSelectedCourseId(ex.courseId);
                }}
                disabled={exams.length === 0}
                aria-label="Chọn đề thi"
                className="bg-transparent text-xs font-bold text-ink-900 min-w-[130px] max-w-[200px] focus:outline-none disabled:opacity-60"
              >
                {exams.length === 0 ? (
                  <option value="">Chưa có đề thi nào</option>
                ) : (
                  exams.map((ex) => (
                    <option key={ex.id} value={ex.id}>
                      PIN {ex.roomPin} — {ex.title}
                    </option>
                  ))
                )}
              </select>
            </label>

            {isDemoMode && (
              <button
                type="button"
                onClick={() => {
                  resetDemoData();
                  showToast('Đã khôi phục 3 phòng thi và ngân hàng câu hỏi mẫu Demo.');
                }}
                title="Khôi phục dữ liệu mẫu Demo (101202, 202303, 303404)"
                className="h-9 px-3 rounded-xl border border-slate-200 bg-white text-ink-700 text-xs font-bold flex items-center gap-1.5 hover:bg-slate-50 hover:border-brand-300 shrink-0 whitespace-nowrap"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Khôi phục mẫu</span>
              </button>
            )}

            <button
              type="button"
              onClick={adminLogout}
              title="Đăng xuất"
              className="h-9 w-9 rounded-xl border border-slate-200 bg-white text-rose-600 flex items-center justify-center hover:bg-rose-50 shrink-0"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="max-w-7xl mx-auto px-3 sm:px-4 flex gap-1 overflow-x-auto no-scrollbar border-t border-slate-100">
          {[
            { id: 'COURSES' as const, label: `1. Học phần (${courses.length})`, icon: BookOpen },
            { id: 'BANK' as const, label: `2. Ngân hàng câu hỏi (${courseQuestions.length})`, icon: Layers },
            { id: 'EXAMS' as const, label: `3. Tạo & Cấu hình Đề thi (${exams.length})`, icon: FileSpreadsheet },
            { id: 'LIVE' as const, label: '4. Giám sát Live & Duyệt', icon: Activity },
            { id: 'ANALYTICS_ESSAY' as const, label: '5. Thống kê & Tự luận', icon: BarChart3 },
            { id: 'EMAILS' as const, label: `6. Nhật ký Email (${emailLogs.length})`, icon: Mail },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`px-3 sm:px-4 py-2.5 text-xs font-bold border-b-2 flex items-center gap-1.5 whitespace-nowrap shrink-0 transition ${
                  active
                    ? 'border-brand-600 text-brand-700'
                    : 'border-transparent text-ink-500 hover:text-ink-800'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-3 sm:px-4 pt-4 sm:pt-5 space-y-5">
        {toast && (
          <div className="bg-support-600 text-white text-xs font-bold px-3.5 py-2 rounded-xl shadow flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span className="truncate">{toast}</span>
            </div>
            <button
              type="button"
              onClick={() => setToast(null)}
              className="p-0.5 rounded hover:bg-white/20 shrink-0"
              aria-label="Đóng thông báo"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* TAB 1: COURSES */}
        {activeTab === 'COURSES' && (
          <CoursesTabPanel
            courses={courses}
            questions={questions}
            exams={exams}
            selectedCourseId={selectedCourse?.id ?? ''}
            onSelectCourse={(cid) => setSelectedCourseId(cid)}
            onGoToBank={(cid) => {
              setSelectedCourseId(cid);
              setActiveTab('BANK');
            }}
            onGoToExams={(cid) => {
              setSelectedCourseId(cid);
              const firstEx = exams.find((ex) => ex.courseId === cid);
              if (firstEx) setSelectedExamId(firstEx.id);
              setActiveTab('EXAMS');
            }}
            onAddCourse={addCourse}
            onUpdateCourse={updateCourse}
            onDeleteCourse={deleteCourse}
            requireOfficialOrPrompt={requireOfficialOrPrompt}
            showToast={showToast}
          />
        )}

        {/* Empty Exam Notice only for exam-dependent tabs */}
        {!selectedExam &&
          (activeTab === 'LIVE' || activeTab === 'ANALYTICS_ESSAY') && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-10 text-center max-w-xl mx-auto my-6 space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-brand-50 text-brand-600 flex items-center justify-center mx-auto">
                <Layers className="w-6 h-6" />
              </div>
              <div className="space-y-1.5">
                <h2 className="text-lg font-extrabold text-ink-900">
                  Chưa có đề thi nào để theo dõi
                </h2>
                <p className="text-xs sm:text-sm text-ink-600 leading-relaxed">
                  Hãy tạo Học phần, nhập Ngân hàng câu hỏi rồi sang tab <strong>3. Tạo &amp; Cấu hình Đề thi</strong> để mở phòng thi.
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => setActiveTab('EXAMS')}
                  className="h-10 px-4 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-xs sm:text-sm font-bold inline-flex items-center gap-1.5 shadow-sm"
                >
                  <Plus className="w-4 h-4" /> Sang tab Tạo Đề thi
                </button>
              </div>
            </div>
          )}

        {/* TAB 4: LIVE PROCTORING */}
        {selectedExam && activeTab === 'LIVE' && (
          <div className="space-y-4">
            {/* Shift Switcher & Create Separate Shift Bar */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2.5">
                <div>
                  <h2 className="text-sm font-extrabold text-ink-900 flex items-center gap-1.5">
                    <span>Chọn Ca thi để Giám sát &amp; Nhập danh sách Sinh viên riêng</span>
                    <InfoHint
                      title="Quản lý nhiều Ca thi riêng biệt"
                      text={
                        '• Mỗi ca thi có một Mã phòng PIN 6 số, Danh sách sinh viên và Bảng điểm riêng.\n• Nếu dạy nhiều nhóm/lớp cùng một học phần, bấm "+ Tạo Ca thi mới" để tạo thêm Ca 2, Ca 3... dùng lại toàn bộ Ma trận đề mà không bị trộn lẫn danh sách điểm giữa các lớp.'
                      }
                    />
                  </h2>
                  <p className="text-[11px] text-ink-500">
                    Mỗi ca thi có mã PIN, danh sách sinh viên và bảng điểm tổng hợp gửi Email giảng viên riêng biệt.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {selectedExam.status === 'DRAFT' && (
                    <button
                      type="button"
                      onClick={() => {
                        if (!requireOfficialOrPrompt()) return;
                        upsertExam({ ...selectedExam, status: 'OPEN' });
                        showToast(`Đã mở phòng thi ${selectedExam.title} (PIN ${selectedExam.roomPin}).`);
                      }}
                      className="h-9 px-3 rounded-xl bg-support-600 hover:bg-support-700 text-white text-xs font-bold"
                    >
                      Mở phòng thi ngay
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={async () => {
                      if (!requireOfficialOrPrompt()) return;
                      const sameCourseCount = exams.filter((e) => e.courseId === selectedExam.courseId).length;
                      const defaultName = `${selectedExam.title.replace(/\s*\(Ca.*\)$/i, '')} - Ca ${sameCourseCount + 1}`;
                      const entered = window.prompt('Nhập tên Ca thi mới (giữ nguyên cấu trúc đề, danh sách SV riêng):', defaultName);
                      if (entered === null) return;
                      const res = await cloneExam(selectedExam.id, entered.trim() || defaultName);
                      if (!res.exam) {
                        showToast(res.error || 'Không thể lưu ca thi mới lên máy chủ.');
                        return;
                      }
                      setSelectedExamId(res.exam.id);
                      showToast(`Đã tạo "${res.exam.title}" (PIN ${res.exam.roomPin}) với danh sách sinh viên riêng.`);
                    }}
                    className="h-9 px-3 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold flex items-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" /> Tạo Ca thi mới
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {exams
                  .filter((ex) => ex.courseId === selectedExam.courseId)
                  .map((ex) => {
                    const active = ex.id === selectedExam.id;
                    const rosterCount = ex.rosterEntries?.length ?? 0;
                    return (
                      <button
                        key={ex.id}
                        type="button"
                        onClick={() => setSelectedExamId(ex.id)}
                        className={`px-3 py-2 rounded-xl border text-left text-xs transition ${
                          active
                            ? 'bg-brand-600 text-white border-brand-600 shadow-xs'
                            : 'bg-slate-50 text-ink-800 border-slate-200 hover:border-brand-300'
                        }`}
                      >
                        <div className="font-bold flex items-center gap-1.5">
                          <span>{ex.title}</span>
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              active
                                ? 'bg-white/20 text-white'
                                : ex.status === 'OPEN'
                                  ? 'bg-support-100 text-support-700'
                                  : ex.status === 'CLOSED'
                                    ? 'bg-slate-200 text-ink-600'
                                    : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {ex.status === 'OPEN' ? 'MỞ' : ex.status === 'CLOSED' ? 'ĐÓNG' : 'NHÁP'}
                          </span>
                        </div>
                        <div className={`text-[11px] mt-0.5 font-mono ${active ? 'text-brand-100' : 'text-ink-500'}`}>
                          PIN {ex.roomPin} • {rosterCount > 0 ? `${rosterCount} SV` : 'Chưa import DS'}
                        </div>
                      </button>
                    );
                  })}
              </div>
            </div>

            <LiveProctorTable
            exam={selectedExam}
            attempts={attempts}
            onProctorDecision={(id, dec, sec) => {
              proctorDecision(id, dec, sec);
              showToast(
                dec === 'REJECT'
                  ? 'Đã thu bài thí sinh và gửi Email kết quả.'
                  : 'Đã chấp nhận mở khóa cho sinh viên tiếp tục thi!',
              );
            }}
            onResetDevice={(id) => {
              resetAttemptDevice(id);
              showToast('Đã giải phóng Device Lock — sinh viên có thể đăng nhập từ máy mới.');
            }}
            onAddBonusTime={(id, sec) => {
              addBonusTimeToAttempt(id, sec);
              showToast(`Đã cộng thêm +${sec} giây cho thí sinh.`);
            }}
            onCloseExamAndSweep={(eid) => {
              const res = closeExamAndSweep(eid);
              showToast(
                isDemoMode
                  ? `Đã đóng ca thi Demo & thu tự động ${res.sweptCount} bài còn treo (Chế độ Demo: không gửi email thực tế).`
                  : `Đã đóng ca thi, thu tự động ${res.sweptCount} bài còn treo & xuất Email tổng hợp cho ${selectedExam.instructorEmail}`,
              );
            }}
            onOpenEssayReview={(attId) => setEssayModalAttemptId(attId)}
            onResendEmail={(attId, newMail) => {
              resendStudentScoreEmail(attId, newMail);
              showToast(
                isDemoMode
                  ? 'Đã cập nhật thông tin trên giao diện Demo (Chế độ Demo: không gửi email thực tế).'
                  : 'Đã cập nhật & gửi lại Email điểm cho sinh viên.',
              );
            }}
            onUpdateRoster={(_eid, entries) => {
              if (!requireOfficialOrPrompt() || !selectedExam) return;
              upsertExam({
                ...selectedExam,
                rosterEntries: entries,
                rosterWhitelist: entries.map((item) => item.studentCode),
                requiresRosterVerification: entries.length > 0,
              });
              showToast(
                entries.length > 0
                  ? `Đã cập nhật danh sách ${entries.length} sinh viên cho ca thi.`
                  : 'Đã xóa danh sách sinh viên của ca thi.',
              );
            }}
          />
          </div>
        )}

        {/* TAB 3: EXAM CREATION, ALLOCATION MATRIX & ROOM SETTINGS */}
        {activeTab === 'EXAMS' && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs p-4 flex flex-wrap items-center justify-between gap-2.5">
              <div>
                <h2 className="text-sm font-extrabold text-ink-900">
                  Quản lý Đề thi &amp; Ca thi ({exams.length})
                </h2>
                <p className="text-[11px] text-ink-500">
                  Tạo đề theo học phần, cấu hình ma trận phân bổ Chương và thông số phòng thi.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (!requireOfficialOrPrompt()) return;
                    setNewExamCourseId(selectedCourse?.id || selectedExam?.courseId || courses[0]?.id || '');
                    setNewExamPin(String(Math.floor(100000 + Math.random() * 900000)));
                    setNewExamTitle('');
                    setModalCourseOpen(courses.length === 0);
                    setCreateExamModalOpen(true);
                  }}
                  className="h-9 px-3 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" /> Tạo Đề thi mới
                  <InfoHint
                    title="Tạo Đề thi mới"
                    text={
                      '• Tạo một phòng thi hoàn toàn mới cho Học phần đang chọn.\n• Hệ thống tự cấp Mã PIN 6 số ngẫu nhiên; thầy/cô có thể tự đổi lại số dễ nhớ (ví dụ: 202601) ở bảng cài đặt bên dưới.'
                    }
                  />
                </button>
                <button
                  type="button"
                  disabled={!selectedExam}
                  onClick={async () => {
                    if (!requireOfficialOrPrompt() || !selectedExam) return;
                    const res = await cloneExam(selectedExam.id);
                    if (!res.exam) {
                      showToast(res.error || 'Không thể nhân bản ca thi lên máy chủ.');
                      return;
                    }
                    setSelectedExamId(res.exam.id);
                    showToast(`Đã nhân bản ca thi với PIN mới: ${res.exam.roomPin}`);
                  }}
                  className="h-9 px-3 rounded-xl border border-slate-200 bg-white text-ink-700 text-xs font-bold flex items-center gap-1.5 hover:border-brand-300 disabled:opacity-40"
                >
                  <Copy className="w-3.5 h-3.5" /> Nhân bản đề
                  <InfoHint
                    title="Nhân bản đề cho lớp / ca thi khác"
                    text={
                      '• Sao chép y hệt cấu trúc Ma trận Chương và toàn bộ cài đặt bảo mật sang một Ca thi mới.\n• Ca thi mới sẽ tự động có Mã PIN 6 số mới và danh sách sinh viên trống để không bị lẫn bài làm của lớp trước.'
                    }
                  />
                </button>
                <button
                  type="button"
                  disabled={!selectedExam}
                  onClick={() => setPreviewOpen(true)}
                  className="h-9 px-3 rounded-xl border border-brand-200 bg-brand-50 text-brand-700 text-xs font-bold flex items-center gap-1.5 disabled:opacity-40"
                >
                  <Eye className="w-3.5 h-3.5" /> Preview Mobile
                  <InfoHint
                    title="Xem thử đề thi trên màn hình Điện thoại"
                    text={
                      '• Mở màn hình mô phỏng để thầy/cô xem trước đề thi thực tế trông như thế nào trên điện thoại sinh viên.\n• Có thể gõ thử các MSSV khác nhau để kiểm tra biến số động {a}, {b} có nhảy số đúng chưa.'
                    }
                  />
                </button>
                {selectedExam && (
                  <button
                    type="button"
                    onClick={() => {
                      if (!requireOfficialOrPrompt()) return;
                      if (!window.confirm(`Xóa đề thi "${selectedExam.title}" (PIN ${selectedExam.roomPin})?`)) return;
                      void deleteExam(selectedExam.id).then((res) => {
                        if (!res.ok) {
                          showToast(res.error || 'Không thể xóa đề thi.');
                        } else {
                          showToast('Đã xóa đề thi.');
                        }
                      });
                    }}
                    className="h-9 px-3 rounded-xl border border-rose-200 bg-rose-50 text-rose-700 text-xs font-bold flex items-center gap-1.5 hover:bg-rose-100"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Xóa đề
                  </button>
                )}
              </div>
            </div>

            {!selectedExam ? (
              <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center space-y-3">
                <p className="text-sm font-bold text-ink-800">Chưa có đề thi nào</p>
                <p className="text-xs text-ink-500">
                  Bấm nút <strong>+ Tạo Đề thi mới</strong> ở trên để tạo đề thi đầu tiên cho học phần của bạn.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                {/* Left: Exam Matrix */}
                <div className="lg:col-span-5">
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-card p-5 space-y-4 text-xs">
                    <div className="flex items-center justify-between">
                      <h2 className="text-sm font-extrabold text-ink-900 flex items-center gap-1.5">
                        <Layers className="w-4 h-4 text-brand-600" />
                        <span>Ma trận Phân bổ Câu hỏi theo Chương</span>
                        <InfoHint
                          title="Ma trận rút đề tự động cho từng sinh viên"
                          text={
                            '• Giúp đề thi phủ đều kiến thức các chương và hạn chế quay cóp.\n• Mỗi sinh viên khi vào thi sẽ được bốc ngẫu nhiên đúng số câu đã cài ở mỗi chương (tự động cân bằng tỷ lệ câu Dễ - Trung bình - Khó).\n• Nếu đặt "Số câu bốc" = 0, chương đó sẽ không xuất hiện trong đề thi này.'
                          }
                        />
                      </h2>
                      <span className="font-mono font-bold text-support-700 bg-support-50 px-2.5 py-1 rounded-full">
                        {totalMatrixQuestions} câu • {totalMatrixPoints.toFixed(1)}đ
                      </span>
                    </div>

                    <div className="space-y-2.5">
                      {chapterGroups.length === 0 ? (
                        <div className="p-4 rounded-xl bg-slate-50 border border-dashed border-slate-200 text-center space-y-2">
                          <p className="text-ink-600">
                            Học phần <strong>{selectedCourse?.code}</strong> chưa có câu hỏi nào trong ngân hàng.
                          </p>
                          <button
                            type="button"
                            onClick={() => setActiveTab('BANK')}
                            className="px-3 py-1.5 rounded-lg bg-brand-600 text-white font-bold"
                          >
                            Sang tab Ngân hàng câu hỏi
                          </button>
                        </div>
                      ) : (
                        chapterGroups.map(([chapterName, qs]) => {
                    const rule = selectedExam.chapterMatrix.find(
                      (r) => r.chapterCategory === chapterName,
                    );
                    const qCount = rule?.questionCount ?? 0;
                    const slotPts = rule?.pointsPerQuestion ?? 1;
                    const shortfall = qCount > qs.length;
                    const pct =
                      totalMatrixQuestions > 0
                        ? Math.round((qCount / totalMatrixQuestions) * 100)
                        : 0;

                    return (
                      <div
                        key={chapterName}
                        className={`p-3 rounded-xl border space-y-2 ${
                          shortfall
                            ? 'bg-rose-50 border-rose-300'
                            : 'bg-slate-50 border-slate-200'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold text-ink-900 truncate">
                            {chapterName}
                          </span>
                          <span className="font-mono text-[11px] text-ink-500 shrink-0">
                            Kho: {qs.length} câu ({pct}%)
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <label className="flex items-center justify-between gap-1 bg-white px-2.5 py-1.5 rounded-lg border">
                            <span className="inline-flex items-center gap-1">
                              <span>Số câu bốc</span>
                              <InfoHint
                                title="Số câu lấy ra từ chương này"
                                text={
                                  '• Số lượng câu hỏi của chương này sẽ bốc cho MỖI sinh viên (không được vượt quá tổng số câu đang có trong kho).\n• Đặt 0 nếu không muốn thi chương này.'
                                }
                              />
                              <span>:</span>
                            </span>
                            <input
                              type="number"
                              min={0}
                              max={qs.length + 10}
                              value={qCount}
                              onChange={(e) =>
                                updateMatrixRule(chapterName, {
                                  questionCount: Math.max(0, Number(e.target.value)),
                                })
                              }
                              className="w-12 text-right font-mono font-bold outline-none"
                            />
                          </label>
                          <label className="flex items-center justify-between gap-1 bg-white px-2.5 py-1.5 rounded-lg border">
                            <span className="inline-flex items-center gap-1">
                              <span>Điểm/câu</span>
                              <InfoHint
                                title="Thang điểm mỗi câu trong chương"
                                text={
                                  '• Điểm tính cho mỗi câu thuộc chương này (hệ thống tự quy đổi tổng điểm các chương sang thang 10 ở bảng điểm).\n• Riêng câu Tự luận ngắn vẫn giữ điểm chi tiết theo Rubric đã soạn.'
                                }
                              />
                              <span>:</span>
                            </span>
                            <input
                              type="number"
                              step="0.25"
                              min={0.25}
                              value={slotPts}
                              onChange={(e) =>
                                updateMatrixRule(chapterName, {
                                  pointsPerQuestion: Math.max(
                                    0.25,
                                    Number(e.target.value),
                                  ),
                                })
                              }
                              className="w-14 text-right font-mono font-bold outline-none"
                            />
                          </label>
                        </div>
                        {shortfall && (
                          <p className="text-[11px] text-rose-700 font-semibold">
                            Cảnh báo: Số câu bốc ({qCount}) vượt quá kho câu hiện có ({qs.length})!
                          </p>
                        )}
                      </div>
                    );
                  })
                  )}
                </div>
              </div>
            </div>

            {/* Right: Exam Settings */}
            <div className="lg:col-span-7">
              <div className="bg-white rounded-2xl border border-slate-200 shadow-card p-5 space-y-4 text-xs">
                {/* Shuffle & Exam Policy */}
                <div className="space-y-3">
                  <h3 className="text-sm font-extrabold text-ink-900 flex items-center gap-1.5">
                    <span>Chính sách Trộn Đề Đa tầng &amp; Ca thi</span>
                    <InfoHint
                      title="Cài đặt chung cho phòng thi này"
                      text={
                        '• Quy định mã PIN vào phòng, thời gian làm bài, cách trộn câu hỏi/đáp án và chế độ giám sát chống rời màn hình.\n• Mọi thay đổi ở bảng này được lưu tự động ngay lập tức.'
                      }
                    />
                  </h3>
                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="flex items-center gap-1.5 font-semibold mb-1">
                        <span>Mã phòng thi (6 số)</span>
                        <InfoHint
                          title="Mã phòng thi (PIN 6 số)"
                          text={
                            '• Mã gồm 6 chữ số để thầy/cô đọc hoặc chiếu lên bảng.\n• Sinh viên mở trang chủ làm bài và nhập đúng 6 số này để vào phòng thi.'
                          }
                        />
                      </label>
                      <input
                        type="text"
                        inputMode="numeric"
                        maxLength={6}
                        value={selectedExam.roomPin}
                        onChange={(e) =>
                          saveExamSetting({
                            ...selectedExam,
                            roomPin: e.target.value.replace(/\D/g, '').slice(0, 6),
                          })
                        }
                        placeholder="101202"
                        className="w-full h-9 px-2.5 rounded-lg border border-slate-300 font-mono font-bold tracking-wider"
                      />
                    </div>
                    <div>
                      <label className="flex items-center gap-1.5 font-semibold mb-1">
                        <span>Thời lượng làm bài (phút)</span>
                        <InfoHint
                          title="Tổng thời gian làm bài"
                          text={
                            '• Tổng số phút đồng hồ đếm ngược trên màn hình sinh viên.\n• Khi hết giờ, hệ thống sẽ tự động lưu hết đáp án đang chọn và thu bài ngay lập tức.'
                          }
                        />
                      </label>
                      <input
                        type="number"
                        min={5}
                        max={240}
                        value={selectedExam.durationMinutes}
                        onChange={(e) =>
                          saveExamSetting({
                            ...selectedExam,
                            durationMinutes: Math.max(5, Number(e.target.value) || 5),
                          })
                        }
                        className="w-full h-9 px-2.5 rounded-lg border border-slate-300 font-mono font-bold"
                      />
                    </div>
                  </div>
                  <div className="space-y-2.5">
                    <div>
                      <label className="flex items-center gap-1.5 font-semibold mb-1.5">
                        <span>Kiểu trộn thứ tự câu (có thể chọn 1 hoặc nhiều)</span>
                        <InfoHint
                          title="Quy tắc chọn Kiểu trộn thứ tự câu"
                          text={
                            '• Không trộn đề: Giữ nguyên thứ tự câu hỏi gốc từ ngân hàng đề (sẽ tự tắt các ô trộn khác).\n• Trộn toàn bộ đề / Trộn trong từng Chương: Chọn 1 trong 2 kiểu này để mỗi sinh viên có thứ tự câu hỏi khác nhau.\n• Đưa Tự luận xuống cuối: Có thể tick kết hợp cùng 1 trong 2 kiểu trộn trên (hoặc chọn riêng) để dồn hết câu Tự luận về cuối bài thi.'
                          }
                        />
                      </label>
                      {(() => {
                        const rawTokens = selectedExam.shuffleQuestions === false
                          ? ['NONE']
                          : String(selectedExam.shuffleMode || 'FULL_RANDOM')
                              .split('+')
                              .map((s) => s.trim())
                              .filter(Boolean);
                        const selectedSet = new Set<ShuffleModeOption>(
                          rawTokens.length > 0 ? (rawTokens as ShuffleModeOption[]) : ['NONE'],
                        );
                        const toggleShuffleOption = (opt: ShuffleModeOption) => {
                          const next = new Set<ShuffleModeOption>(selectedSet);
                          if (opt === 'NONE') {
                            saveExamSetting({
                              ...selectedExam,
                              shuffleMode: 'NONE',
                              shuffleQuestions: false,
                            });
                            return;
                          }
                          next.delete('NONE');
                          if (next.has(opt)) {
                            next.delete(opt);
                          } else {
                            if (opt === 'FULL_RANDOM') next.delete('BY_CHAPTER');
                            if (opt === 'BY_CHAPTER') next.delete('FULL_RANDOM');
                            next.add(opt);
                          }
                          if (next.size === 0) {
                            saveExamSetting({
                              ...selectedExam,
                              shuffleMode: 'NONE',
                              shuffleQuestions: false,
                            });
                            return;
                          }
                          const orderedOpts = (['FULL_RANDOM', 'BY_CHAPTER', 'ESSAY_LAST'] as ShuffleModeOption[]).filter(
                            (k) => next.has(k),
                          );
                          saveExamSetting({
                            ...selectedExam,
                            shuffleMode: orderedOpts.join('+'),
                            shuffleQuestions: true,
                          });
                        };

                        const shuffleChoices: { value: ShuffleModeOption; label: string }[] = [
                          { value: 'NONE', label: 'Không trộn đề' },
                          { value: 'FULL_RANDOM', label: 'Trộn toàn bộ đề' },
                          { value: 'BY_CHAPTER', label: 'Trộn trong từng Chương' },
                          { value: 'ESSAY_LAST', label: 'Đưa Tự luận xuống cuối' },
                        ];

                        return (
                          <div className="flex flex-wrap gap-1.5">
                            {shuffleChoices.map((ch) => {
                              const active = selectedSet.has(ch.value);
                              return (
                                <label
                                  key={ch.value}
                                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] font-bold cursor-pointer select-none transition ${
                                    active
                                      ? 'bg-brand-50 border-brand-500 text-brand-800'
                                      : 'bg-white border-slate-300 text-ink-700 hover:border-brand-300'
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={active}
                                    onChange={() => toggleShuffleOption(ch.value)}
                                    className="w-3.5 h-3.5 accent-brand-600 rounded"
                                  />
                                  <span>{ch.label}</span>
                                </label>
                              );
                            })}
                          </div>
                        );
                      })()}
                    </div>
                    <div>
                      <label className="flex items-center gap-1.5 font-semibold mb-1">
                        <span>Chế độ gửi Email SV</span>
                        <InfoHint
                          title="Cách trả kết quả thi qua Email cho sinh viên"
                          text={
                            '• Gửi điểm ngay: Sinh viên bấm Nộp bài xong là nhận được điểm chi tiết qua Email luôn.\n• Biên nhận trước, điểm khi đóng ca: Lúc nộp chỉ gửi giấy xác nhận "Đã nộp bài" (tránh lộ đáp án/điểm cho các bạn thi sau). Khi thầy/cô bấm "Kết thúc Ca thi" ở tab Giám sát, cả lớp mới đồng loạt nhận điểm.'
                          }
                        />
                      </label>
                      <select
                        value={selectedExam.emailDeliveryMode}
                        onChange={(e) =>
                          saveExamSetting({
                            ...selectedExam,
                            emailDeliveryMode: e.target.value as EmailDeliveryMode,
                          })
                        }
                        className="w-full h-9 px-2 rounded-lg border border-slate-300 font-semibold"
                      >
                        <option value="IMMEDIATE">Gửi điểm ngay</option>
                        <option value="DELAYED_BATCH">Biên nhận trước, điểm khi đóng ca</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="flex items-center gap-1.5 font-semibold mb-1">
                        <span>PIN cứu hộ (4–6 số)</span>
                        <InfoHint
                          title="PIN cứu hộ mở khóa tại chỗ"
                          text={
                            '• Mã bí mật chỉ riêng giảng viên biết (tuyệt đối không đọc to cho cả lớp).\n• Khi sinh viên bị khóa màn hình vì rời tab, thầy/cô tới tận bàn nhập mã này lên máy sinh viên để mở khóa thi tiếp ngay lập tức.'
                          }
                        />
                      </label>
                      <input
                        type="text"
                        inputMode="numeric"
                        maxLength={6}
                        value={selectedExam.unlockPin}
                        onChange={(e) =>
                          saveExamSetting({
                            ...selectedExam,
                            unlockPin: e.target.value.replace(/\D/g, '').slice(0, 6),
                          })
                        }
                        placeholder="8888"
                        className="w-full h-9 px-2.5 rounded-lg border border-slate-300 font-mono font-bold tracking-wider"
                      />
                    </div>
                    <div>
                      <label className="flex items-center gap-1.5 font-semibold mb-1">
                        <span>Email nhận báo cáo ca thi</span>
                        <InfoHint
                          title="Email nhận Bảng điểm Tổng hợp của giảng viên"
                          text={
                            '• Nhập Email cá nhân/cơ quan của thầy/cô.\n• Khi kết thúc ca thi, hệ thống sẽ gửi thư tổng kết ca thi kèm danh sách điểm toàn lớp về địa chỉ Email này.'
                          }
                        />
                      </label>
                      <input
                        type="email"
                        value={selectedExam.instructorEmail}
                        onChange={(e) =>
                          saveExamSetting({
                            ...selectedExam,
                            instructorEmail: e.target.value,
                          })
                        }
                        placeholder="giangvien@ueh.edu.vn"
                        className="w-full h-9 px-2.5 rounded-lg border border-slate-300 font-semibold"
                      />
                    </div>
                    <div>
                      <label className="flex items-center gap-1.5 font-semibold mb-1">
                        <span>Số lần rời màn hình tối đa</span>
                        <InfoHint
                          title="Ngưỡng khóa theo Số lần chuyển tab / thoát trình duyệt"
                          text={
                            '• Ví dụ đặt = 3: Sinh viên bấm sang app khác (Zalo, Chrome, Messenger...) tới lần thứ 4 sẽ bị hệ thống khóa màn hình thi lại.\n• Bài khóa sẽ báo đỏ lên Tab Giám sát để thầy/cô duyệt cho thi tiếp hoặc thu bài.'
                          }
                        />
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={20}
                        value={selectedExam.maxLeaveCount}
                        onChange={(e) =>
                          saveExamSetting({
                            ...selectedExam,
                            maxLeaveCount: Math.max(1, Number(e.target.value) || 1),
                          })
                        }
                        className="w-full h-9 px-2.5 rounded-lg border border-slate-300 font-mono font-bold"
                      />
                    </div>
                    <div>
                      <label className="flex items-center gap-1.5 font-semibold mb-1">
                        <span>Tổng giây vắng mặt tối đa</span>
                        <InfoHint
                          title="Ngưỡng khóa theo Tổng thời gian ở ngoài màn hình thi"
                          text={
                            '• Ví dụ đặt = 45 giây: Dù sinh viên chỉ rời màn hình 1–2 lần nhưng mỗi lần thoát ra lâu cộng dồn vượt quá 45 giây, bài thi vẫn tự động khóa lại chờ thầy/cô duyệt.'
                          }
                        />
                      </label>
                      <input
                        type="number"
                        min={5}
                        max={600}
                        value={selectedExam.maxAwaySeconds}
                        onChange={(e) =>
                          saveExamSetting({
                            ...selectedExam,
                            maxAwaySeconds: Math.max(5, Number(e.target.value) || 5),
                          })
                        }
                        className="w-full h-9 px-2.5 rounded-lg border border-slate-300 font-mono font-bold"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <label className="flex items-center gap-2 font-semibold">
                      <input
                        type="checkbox"
                        checked={selectedExam.shuffleOptions}
                        onChange={(e) =>
                          saveExamSetting({
                            ...selectedExam,
                            shuffleOptions: e.target.checked,
                          })
                        }
                      />
                      <span>Trộn A/B/C/D (ghim cuối)</span>
                      <InfoHint
                        title="Trộn vị trí đáp án A, B, C, D"
                        text={
                          '• Xáo trộn ngẫu nhiên thứ tự 4 đáp án A, B, C, D cho từng sinh viên để tránh nhìn bài hoặc nhắc nhau kiểu "Câu 1 chọn C".\n• Các phương án đánh dấu "Ghim cuối" (như "Tất cả đều đúng") luôn tự động giữ nằm ở dưới cùng.'
                        }
                      />
                    </label>
                    <label className="flex items-center gap-2 font-semibold">
                      <input
                        type="checkbox"
                        checked={selectedExam.canvasAntiOcr}
                        onChange={(e) =>
                          saveExamSetting({
                            ...selectedExam,
                            canvasAntiOcr: e.target.checked,
                          })
                        }
                      />
                      <span>Canvas Chống OCR</span>
                      <InfoHint
                        title="Chống bôi đen copy & Chống phần mềm quét chữ (Anti-OCR)"
                        text={
                          '• Biến nội dung câu hỏi thành khung ảnh vẽ có vân bảo vệ.\n• Giúp sinh viên không thể bôi đen copy chữ sang Google/ChatGPT và làm nhiễu phần mềm quét chữ tự động (OCR).'
                        }
                      />
                    </label>
                    <label className="flex items-center gap-2 font-semibold">
                      <input
                        type="checkbox"
                        checked={selectedExam.oneWayMode}
                        onChange={(e) =>
                          saveExamSetting({
                            ...selectedExam,
                            oneWayMode: e.target.checked,
                          })
                        }
                      />
                      <span>Điều hướng 1 chiều</span>
                      <InfoHint
                        title="Thi 1 chiều (Không cho quay lại sửa câu cũ)"
                        text={
                          '• Khi tick bật: Sinh viên làm xong câu nào và bấm Qua câu tiếp sẽ KHÔNG thể quay ngược lại để xem hay sửa câu trước đó.\n• Mặc định nên để tắt cho các bài thi thông thường để sinh viên rà soát lại bài.'
                        }
                      />
                    </label>
                    <div className="flex items-center gap-1.5">
                      <select
                        value={selectedExam.status}
                        onChange={(e) =>
                          saveExamSetting({
                            ...selectedExam,
                            status: e.target.value as 'DRAFT' | 'OPEN' | 'CLOSED',
                          })
                        }
                        className="w-full h-8 px-2 rounded-lg border font-bold"
                      >
                        <option value="DRAFT">Trạng thái: NHÁP</option>
                        <option value="OPEN">Trạng thái: ĐANG MỞ</option>
                        <option value="CLOSED">Trạng thái: ĐÃ ĐÓNG</option>
                      </select>
                      <InfoHint
                        title="Điều khiển đóng / mở phòng thi"
                        text={
                          '• NHÁP: Đang soạn đề, sinh viên chưa thể vào phòng.\n• ĐANG MỞ: Phòng thi hoạt động, sinh viên nhập mã PIN 6 số để làm bài ngay.\n• ĐÃ ĐÓNG: Đã kết thúc ca thi, không cho thí sinh mới vào thêm.'
                        }
                      />
                    </div>
                  </div>

                  <div>
                    <label className="flex items-center gap-1.5 font-semibold mb-1">
                      <span>Whitelist MSSV (tùy chọn, phân tách dấu phẩy/dòng; để trống = cho phép tự do)</span>
                      <InfoHint
                        title="Giới hạn đúng Mã sinh viên được phép thi"
                        text={
                          '• Cách 1 (Nhanh): Dán danh sách MSSV cần cho thi vào ô này.\n• Cách 2 (Đầy đủ thông tin nhất): Sang Tab 4 "Giám sát Live" để import file Excel danh sách lớp — hệ thống sẽ kiểm tra khớp cả MSSV, Họ tên, Giới tính, Ngày sinh.\n• Nếu để trống: Bất kỳ ai biết mã PIN 6 số đều vào thi được.'
                        }
                      />
                    </label>
                    <textarea
                      rows={2}
                      value={selectedExam.rosterWhitelist.join(', ')}
                      onChange={(e) =>
                        saveExamSetting({
                          ...selectedExam,
                          rosterWhitelist: e.target.value
                            .split(/[\s,;]+/)
                            .map((s) => s.trim())
                            .filter(Boolean),
                        })
                      }
                      placeholder="VD: 3122102001, 3122102008"
                      className="w-full p-2 rounded-lg border border-slate-300 font-mono text-[11px]"
                    />
                  </div>
                </div>
              </div>
            </div>
            </div>
            )}
          </div>
        )}

        {/* TAB 2: QUESTION BANK (INDEPENDENT OF EXAM) */}
        {activeTab === 'BANK' && (
          <div className="space-y-4">
            {!selectedCourse ? (
              <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center space-y-3">
                <p className="text-sm font-bold text-ink-800">Chưa có học phần nào</p>
                <p className="text-xs text-ink-500">
                  Hãy tạo học phần trước ở tab <strong>1. Học phần</strong> để nhập ngân hàng câu hỏi.
                </p>
                <button
                  type="button"
                  onClick={() => setActiveTab('COURSES')}
                  className="h-9 px-4 rounded-xl bg-brand-600 text-white text-xs font-bold"
                >
                  Đi tới tab 1. Học phần
                </button>
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-card p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-sm font-extrabold text-ink-900 flex items-center gap-1.5">
                      <BookOpen className="w-4 h-4 text-brand-600" />
                      Ngân hàng Câu hỏi: {selectedCourse.code} — {selectedCourse.name}
                    </h2>
                    <p className="text-[11px] text-ink-500">
                      Tổng {courseQuestions.length} câu thuộc {chapterGroups.length} Chương
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => {
                        if (!requireOfficialOrPrompt()) return;
                        setNewChapterName(`Chương ${chapterGroups.length + 1}: `);
                        setNewChapterOpen((o) => !o);
                      }}
                      className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-ink-800 font-bold flex items-center gap-1 hover:border-brand-300"
                    >
                      <Plus className="w-3.5 h-3.5" /> Thêm Chương
                      <InfoHint
                        title="Thêm Chương mới"
                        text={
                          '• Tạo nhanh một Chương hoặc Chuyên đề mới để phân loại câu hỏi (ví dụ: "Chương 2: Cung - Cầu").\n• Chương mới tạo xong sẽ hiện ngay bên Tab "Tạo Đề thi" để thầy/cô chia số lượng câu cần lấy.'
                        }
                      />
                    </button>
                    <button
                      type="button"
                      onClick={() => setTemplateBoxOpen((o) => !o)}
                      className="px-3 py-1.5 rounded-xl border border-brand-200 bg-brand-50 text-brand-800 font-bold flex items-center gap-1 hover:bg-brand-100"
                    >
                      <Download className="w-3.5 h-3.5" /> Chọn &amp; Tải Mẫu Excel
                      <InfoHint
                        title="Tải file Excel mẫu chuẩn"
                        text={
                          '• Bấm vào đây để tải bảng Excel mẫu về máy soạn câu hỏi trước.\n• Nếu chỉ làm trắc nghiệm 4 đáp án A/B/C/D, thầy/cô không cần tick chọn gì thêm, bấm "Tải File Mẫu (4 ĐA)" luôn cho gọn.'
                        }
                      />
                    </button>
                    <button
                      type="button"
                      disabled={courseQuestions.length === 0}
                      onClick={() =>
                        exportCourseQuestionsToXlsx(
                          courseQuestions,
                          selectedCourse?.code ?? 'COURSE',
                          selectedCourse?.name ?? 'Học phần',
                          Array.from(
                            new Set([
                              ...chapterGroups.map(([name]) => name),
                              ...(selectedExam?.chapterMatrix.map(
                                (r) => r.chapterCategory,
                              ) ?? []),
                            ]),
                          ),
                        )
                      }
                      className="px-3 py-1.5 rounded-xl border border-support-200 bg-support-50 text-support-800 font-bold flex items-center gap-1 hover:bg-support-100 disabled:opacity-45"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5" /> Xuất Excel
                      <InfoHint
                        title="Xuất Ngân hàng câu hỏi ra Excel"
                        text={
                          '• Tải toàn bộ câu hỏi của môn học này về máy dưới dạng file Excel (.xlsx).\n• Thầy/cô có thể dùng file này để lưu trữ dự phòng, in ra kiểm tra hoặc sửa lỗi chính tả hàng loạt rồi nạp ngược lại hệ thống.'
                        }
                      />
                    </button>
                    <button
                      type="button"
                      onClick={() => setExcelModalOpen(true)}
                      className="px-3 py-1.5 rounded-xl bg-support-600 hover:bg-support-700 text-white font-bold flex items-center gap-1 shadow-xs"
                    >
                      <Upload className="w-3.5 h-3.5" /> Import Excel
                      <InfoHint
                        title="Nạp hàng loạt câu hỏi từ Excel"
                        text={
                          '• Đưa nhanh hàng chục đến hàng trăm câu hỏi từ file Excel vào ngân hàng chỉ trong vài giây.\n• Hỗ trợ cả kéo thả file .xlsx lẫn copy-paste (Ctrl+C -> Ctrl+V) trực tiếp từ Excel/Google Sheets.'
                        }
                      />
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        exportQuestionBankJson(
                          courseQuestions,
                          selectedCourse?.code ?? 'COURSE',
                        )
                      }
                      className="px-2.5 py-1.5 rounded-xl border border-slate-200 font-bold flex items-center gap-1 hover:bg-slate-50"
                      title="Sao lưu nhanh sang file .JSON"
                    >
                      <FileJson className="w-3.5 h-3.5" /> .JSON
                      <InfoHint
                        title="Sao lưu dữ liệu kỹ thuật (.JSON)"
                        text={
                          '• Xuất bản sao lưu thô dưới dạng tệp .json (dành cho mục đích lưu trữ kỹ thuật nguyên bản).\n• Nếu thầy/cô muốn mở xem hoặc sửa bằng Microsoft Excel, hãy dùng nút "Xuất Excel" màu xanh lá ở bên cạnh.'
                        }
                      />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (!requireOfficialOrPrompt()) return;
                        setEditingQuestion(undefined);
                        setQuestionModalDefaultChapter(undefined);
                        setQuestionModalOpen(true);
                      }}
                      className="px-3.5 py-1.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-bold flex items-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" /> Thêm câu lẻ
                      <InfoHint
                        title="Soạn từng câu hỏi trực tiếp trên web"
                        text={
                          '• Mở cửa sổ soạn từng câu hỏi (phù hợp khi cần thêm nhanh 1–2 câu mới hoặc cài câu hỏi Tính toán biến số động {a}, {b} và câu Tự luận ngắn Rubric).'
                        }
                      />
                    </button>
                  </div>
                </div>

                {newChapterOpen && selectedCourse && (
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex flex-wrap items-center gap-2 text-xs">
                    <input
                      type="text"
                      value={newChapterName}
                      onChange={(e) => setNewChapterName(e.target.value)}
                      placeholder="VD: Chương 2: Cung - Cầu & Cân bằng"
                      className="flex-1 min-w-[200px] h-9 px-3 rounded-lg border border-slate-300 bg-white font-semibold"
                    />
                    <button
                      type="button"
                      onClick={() => setNewChapterOpen(false)}
                      className="h-9 px-3 rounded-lg border border-slate-200 bg-white text-ink-600 font-semibold"
                    >
                      Hủy
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const clean = newChapterName.trim();
                        if (!clean) {
                          showToast('Vui lòng nhập tên Chương.');
                          return;
                        }
                        setCustomChaptersByCourse((prev) => {
                          const existing = prev[selectedCourse.id] ?? [];
                          if (existing.includes(clean)) return prev;
                          return { ...prev, [selectedCourse.id]: [...existing, clean] };
                        });
                        setNewChapterOpen(false);
                        setNewChapterName('');
                        setEditingQuestion(undefined);
                        setQuestionModalDefaultChapter(clean);
                        setQuestionModalOpen(true);
                        showToast(`Đã thêm "${clean}". Bạn có thể nhập câu hỏi ngay.`);
                      }}
                      className="h-9 px-3.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white font-bold"
                    >
                      Lưu &amp; Thêm câu hỏi
                    </button>
                  </div>
                )}

                {newCourseOpen && (
                  <div className="p-3 bg-slate-50 rounded-xl border flex flex-wrap gap-2 text-xs">
                    <input
                      value={newCourseCode}
                      onChange={(e) => setNewCourseCode(e.target.value)}
                      placeholder="Mã HP (VD: FIN101)"
                      className="w-28 min-w-0 px-2.5 py-1.5 border rounded-lg font-mono"
                    />
                    <input
                      value={newCourseName}
                      onChange={(e) => setNewCourseName(e.target.value)}
                      placeholder="Tên học phần mới..."
                      className="flex-1 min-w-0 px-2.5 py-1.5 border rounded-lg"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (!newCourseCode.trim() || !newCourseName.trim()) return;
                        addCourse({
                          code: newCourseCode.trim().toUpperCase(),
                          name: newCourseName.trim(),
                          semester: 'HK1 2026-2027',
                          credits: 3,
                        });
                        setNewCourseCode('');
                        setNewCourseName('');
                        setNewCourseOpen(false);
                        showToast('Đã tạo học phần mới.');
                      }}
                      className="px-3 py-1.5 rounded-lg bg-brand-600 text-white font-bold shrink-0 whitespace-nowrap"
                    >
                      Lưu
                    </button>
                  </div>
                )}

                {/* Collapsible Template Type Selector Box for Quick Excel Export */}
                {templateBoxOpen && (
                  <div className="p-3.5 rounded-xl border border-brand-200 bg-brand-50/60 space-y-2.5 text-xs">
                  <div className="flex items-start justify-between flex-wrap gap-2">
                    <div>
                      <p className="font-extrabold text-brand-900">
                        Tải File Mẫu Excel Để Nhập Ngân Hàng Đề — Tick chọn loại câu hỏi có trong đề:
                      </p>
                      <p className="text-[11px] text-ink-600 mt-0.5">
                        Nếu thầy/cô không tick chọn loại nào, hệ thống mặc định xuất file mẫu chỉ gồm câu hỏi{' '}
                        <strong>Trắc nghiệm 4 phương án</strong> (10 cột gọn, có sẵn ô xổ xuống A/B/C/D).
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => setBankTemplateTypes([])}
                        className={`text-[11px] font-bold px-2.5 py-1 rounded-lg border transition ${
                          bankTemplateTypes.length === 0
                            ? 'bg-white border-brand-300 text-brand-800'
                            : 'bg-white/60 border-slate-200 text-ink-600 hover:bg-white'
                        }`}
                      >
                        Bỏ tick (Mặc định 4 phương án)
                      </button>
                      <button
                        type="button"
                        onClick={() => setBankTemplateTypes([...ALL_QUESTION_TYPES])}
                        className={`text-[11px] font-bold px-2.5 py-1 rounded-lg border transition ${
                          bankTemplateTypes.length === ALL_QUESTION_TYPES.length
                            ? 'bg-white border-brand-300 text-brand-800'
                            : 'bg-white/60 border-slate-200 text-ink-600 hover:bg-white'
                        }`}
                      >
                        Tick cả 5 loại
                      </button>
                      <button
                        type="button"
                        onClick={handleDownloadTemplateXlsx}
                        className="px-3 py-1.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-bold flex items-center gap-1.5 shadow-xs"
                      >
                        <Download className="w-3.5 h-3.5" />
                        {isDefaultFourOptionTemplate
                          ? 'Tải File Mẫu (4 ĐA)'
                          : `Tải File Mẫu (${effectiveBankTemplateTypes.length} loại)`}
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 pt-1">
                    {BANK_TEMPLATE_TYPE_OPTIONS.map((opt) => {
                      const checked = bankTemplateTypes.includes(opt.type);
                      return (
                        <label
                          key={opt.type}
                          className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-[11px] font-bold cursor-pointer select-none transition ${
                            checked
                              ? 'bg-white border-brand-500 text-brand-900 shadow-xs'
                              : 'bg-white/80 border-slate-200 text-ink-700 hover:border-brand-300 hover:bg-white'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleBankTemplateType(opt.type)}
                            className="w-4 h-4 accent-brand-600 rounded cursor-pointer"
                          />
                          <span>{opt.label}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
                )}

                {/* Search + Chapter & Type Filter Bar */}
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5 text-xs">
                  <div className="flex flex-wrap gap-2">
                    <div className="relative flex-1 min-w-[200px]">
                      <Search className="w-3.5 h-3.5 text-ink-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        value={bankSearch}
                        onChange={(e) => setBankSearch(e.target.value)}
                        placeholder="Tìm theo nội dung, chương hoặc mã câu hỏi..."
                        className="w-full h-9 pl-8 pr-3 rounded-lg border border-slate-300 bg-white text-xs"
                      />
                    </div>
                    <select
                      value={bankChapterFilter}
                      onChange={(e) => setBankChapterFilter(e.target.value)}
                      className="h-9 px-2.5 rounded-lg border border-slate-300 bg-white font-semibold max-w-[240px]"
                    >
                      <option value="ALL">Tất cả Chương ({courseQuestions.length})</option>
                      {chapterGroups.map(([chName, qs]) => (
                        <option key={chName} value={chName}>
                          {chName} ({qs.length})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {(
                      [
                        ['ALL', 'Tất cả'],
                        ['SINGLE_CHOICE', '1 Đáp án'],
                        ['MULTI_CHOICE', 'Nhiều ĐA'],
                        ['TRUE_FALSE', 'Đúng / Sai'],
                        ['NUMERICAL', 'Tính toán động'],
                        ['ESSAY', 'Tự luận Rubric'],
                      ] as const
                    ).map(([typeVal, label]) => (
                      <button
                        key={typeVal}
                        type="button"
                        onClick={() => setBankTypeFilter(typeVal)}
                        className={`px-2.5 py-1 rounded-full font-bold text-[11px] border transition ${
                          bankTypeFilter === typeVal
                            ? 'bg-brand-600 text-white border-brand-600'
                            : 'bg-white text-ink-600 border-slate-200 hover:border-brand-300'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {filteredChapterGroups.length === 0 ? (
                  <div className="p-8 text-center rounded-xl border border-dashed border-slate-300 text-xs text-ink-500">
                    Không tìm thấy câu hỏi nào khớp bộ lọc hiện tại. Hãy đổi bộ lọc hoặc bấm <strong>Import Excel</strong> để nạp câu hỏi mới.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {filteredChapterGroups.map(([chName, qs]) => (
                      <div key={chName} className="space-y-2">
                        <div className="flex items-center justify-between px-3 py-1.5 bg-slate-100 rounded-lg text-xs font-extrabold text-ink-800">
                          <span>{chName}</span>
                          <span className="font-mono text-brand-700">{qs.length} câu</span>
                        </div>
                        <div className="space-y-2">
                          {qs.map((q) => (
                            <div
                              key={q.id}
                              className="p-3 rounded-xl border border-slate-200 bg-white hover:border-brand-300 transition flex items-start justify-between gap-3 text-xs"
                            >
                              <div className="space-y-1 flex-1">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span className="font-mono font-bold px-2 py-0.5 rounded bg-brand-50 text-brand-700 text-[10px]">
                                    {q.type}
                                  </span>
                                  <span className="px-2 py-0.5 rounded bg-slate-100 text-ink-600 font-semibold text-[10px]">
                                    {q.difficulty}
                                  </span>
                                  <span className="font-mono font-bold px-2 py-0.5 rounded bg-slate-100 text-ink-700 text-[10px]">
                                    {q.points}đ
                                  </span>
                                  {q.dynamicVars && (
                                    <span className="px-2 py-0.5 rounded bg-support-50 text-support-700 font-bold text-[10px]">
                                      Biến số động
                                    </span>
                                  )}
                                  {q.type === 'ESSAY' && (
                                    <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-800 font-bold text-[10px]">
                                      Rubric {q.gradingRubric?.length ?? 0} ý
                                    </span>
                                  )}
                                  <span className="font-mono text-[10px] text-ink-400">
                                    #{q.id}
                                  </span>
                                </div>
                                <p className="font-semibold text-ink-900 leading-snug">
                                  {q.content}
                                </p>
                                {q.numericalFormula && (
                                  <p className="text-[11px] font-mono text-support-700">
                                    CT: {q.numericalFormula} {q.numericalUnit ? `(${q.numericalUnit})` : ''}
                                  </p>
                                )}
                                {q.type === 'ESSAY' && q.sampleAnswer && (
                                  <p className="text-[11px] text-ink-500 line-clamp-1">
                                    Mẫu: {q.sampleAnswer}
                                  </p>
                                )}
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => handleDuplicateQuestion(q)}
                                  className="p-1.5 rounded-lg border border-slate-200 text-ink-600 hover:border-brand-400 hover:text-brand-700"
                                  title="Nhân bản câu hỏi"
                                >
                                  <Copy className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingQuestion(q);
                                    setQuestionModalOpen(true);
                                  }}
                                  className="px-2.5 py-1 rounded-lg border border-slate-200 font-bold text-ink-700 hover:border-brand-400"
                                >
                                  Sửa
                                </button>
                                <button
                                  type="button"
                                  onClick={() => deleteQuestion(q.id)}
                                  className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50"
                                  title="Xóa câu hỏi"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* TAB 5: CHAPTER MASTERY ANALYTICS & CSV EXPORT */}
        {selectedExam && activeTab === 'ANALYTICS_ESSAY' && (
          <div className="space-y-5">
            {/* Shift Switcher Bar */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs p-3.5 flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-extrabold text-ink-800">
                Chọn Ca thi cần xem thống kê &amp; xuất điểm:
              </span>
              <div className="flex flex-wrap gap-1.5">
                {exams
                  .filter((ex) => ex.courseId === selectedExam.courseId)
                  .map((ex) => (
                    <button
                      key={ex.id}
                      type="button"
                      onClick={() => setSelectedExamId(ex.id)}
                      className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition ${
                        ex.id === selectedExam.id
                          ? 'bg-brand-600 text-white border-brand-600 shadow-xs'
                          : 'bg-slate-50 text-ink-700 border-slate-200 hover:border-brand-300'
                      }`}
                    >
                      {ex.title} (PIN {ex.roomPin})
                    </button>
                  ))}
              </div>
            </div>

            <ExamAnalyticsCharts
              exam={selectedExam}
              attempts={attempts}
              itemAnalysisRows={itemAnalysisRows}
            />

            <div className="bg-white rounded-2xl border border-slate-200 shadow-card p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-extrabold text-ink-900 flex items-center gap-1.5 flex-wrap">
                    <span>Thống kê Năng lực Sinh viên theo Chương (Chapter Mastery Analytics)</span>
                    <InfoHint
                      title="Đánh giá mức độ hiểu bài theo từng Chương"
                      text={
                        '• Tính % số điểm trung bình mà cả lớp đạt được ở riêng từng Chương.\n• Màu Xanh (≥ 70%): Lớp nắm vững. Màu Vàng (50–69%): Mức trung bình. Màu Đỏ (< 50%): Phần kiến thức này lớp làm sai nhiều, thầy/cô nên ôn tập lại trên giảng đường.'
                      }
                    />
                  </h2>
                  <p className="text-xs text-ink-500">
                    Tổng hợp tỷ lệ điểm trung bình ở từng Chương của các bài đã hoàn thành để kịp thời củng cố kiến thức.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      exportExamGradebookXlsx(
                        selectedExam,
                        attempts,
                        chapterMasteryStats,
                      )
                    }
                    className="px-3.5 py-2 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold flex items-center gap-1.5"
                  >
                    <FileSpreadsheet className="w-4 h-4" />
                    <span>Xuất Excel (.xlsx)</span>
                    <InfoHint
                      title="Tải Sổ điểm Excel 3 trang (Khuyên dùng)"
                      text={
                        '• Xuất file Excel (.xlsx) đẹp chuẩn văn phòng gồm 3 sheet riêng:\n  1) Tổng hợp chung ca thi\n  2) Bảng điểm chi tiết từng sinh viên\n  3) Thống kê theo từng Chương để lưu hồ sơ khoa/bộ môn.'
                      }
                    />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const csv = buildExamCsvContent(
                        selectedExam,
                        attempts,
                        chapterMasteryStats,
                      );
                      downloadTextFile(
                        `VNE_BangDiem_${selectedExam.roomPin}.csv`,
                        csv,
                        'text/csv;charset=utf-8;',
                      );
                    }}
                    className="px-3.5 py-2 rounded-xl bg-support-600 hover:bg-support-700 text-white text-xs font-bold flex items-center gap-1.5"
                  >
                    <Download className="w-4 h-4" />
                    <span>Xuất CSV (.csv)</span>
                    <InfoHint
                      title="Tải file bảng dữ liệu nhẹ (.csv)"
                      text={
                        '• File văn bản dạng bảng (phân tách dấu phẩy, có sẵn mã UTF-8 để không lỗi font tiếng Việt).\n• Phù hợp khi thầy/cô cần nạp điểm nhanh vào cổng đào tạo hoặc hệ thống LMS của trường.'
                      }
                    />
                  </button>
                </div>
              </div>

              {chapterMasteryStats.length === 0 ? (
                <p className="text-xs text-ink-500 py-4">
                  Chưa có bài thi đã nộp trong ca này để thống kê theo chương.
                </p>
              ) : (
                <div className="space-y-3">
                  {chapterMasteryStats.map((st) => (
                    <div key={st.chapterCategory} className="space-y-1">
                      <div className="flex items-center justify-between text-xs font-bold">
                        <span className="text-ink-900">{st.chapterCategory}</span>
                        <span className="font-mono text-brand-700">
                          {st.masteryPercent}% ({st.earnedPoints}/{st.maxPoints}đ • {st.totalGradedQuestions} lượt)
                        </span>
                      </div>
                      <div className="h-3 rounded-full bg-slate-100 overflow-hidden">
                        <div
                          style={{ width: `${Math.min(100, st.masteryPercent)}%` }}
                          className={`h-full rounded-full ${
                            st.masteryPercent >= 70
                              ? 'bg-support-600'
                              : st.masteryPercent >= 50
                                ? 'bg-amber-500'
                                : 'bg-rose-500'
                          }`}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Item Analysis Card */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-card p-5 space-y-3">
              <div>
                <h3 className="text-sm font-extrabold text-ink-900 flex items-center gap-1.5 flex-wrap">
                  <span>Phân tích Chất lượng Câu hỏi (Item Analysis)</span>
                  <InfoHint
                    title="Cách đọc Độ khó (p) & Độ phân cách (D) chuẩn khảo thí"
                    text={
                      '• Tỷ lệ đúng (p): % sinh viên trả lời đúng câu đó. Nếu p < 25% ("Cần rà soát"), có thể câu hỏi bị lỗi đề, đáp án nhầm hoặc kiến thức quá khó.\n• Độ phân cách (D): Đo xem câu hỏi có tách được sinh viên giỏi (nhóm 27% điểm cao) với nhóm yếu (27% điểm thấp) hay không. D >= 0.20 là câu phân loại tốt; D < 0.20 ("Phân hóa kém") nghĩa là sinh viên giỏi và yếu làm đúng ngang nhau.'
                    }
                  />
                </h3>
                <p className="text-xs text-ink-500">
                  Sắp xếp từ câu có tỷ lệ làm đúng thấp nhất lên cao nhất để giảng viên nhanh chóng phát hiện câu hỏi cần rà soát.
                </p>
              </div>
              {itemAnalysisRows.length === 0 ? (
                <p className="text-xs text-ink-500 py-3">
                  Chưa có bài thi đã nộp để tính độ khó và độ phân cách từng câu.
                </p>
              ) : (
                <div className="overflow-x-auto border border-slate-200 rounded-xl">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-ink-600 font-bold">
                        <th className="py-2.5 px-3">Câu hỏi</th>
                        <th className="py-2.5 px-3">Chương</th>
                        <th className="py-2.5 px-3 text-center">Lượt thi</th>
                        <th className="py-2.5 px-3 text-center">Tỷ lệ đúng (p)</th>
                        <th className="py-2.5 px-3 text-center">Phân cách (D)</th>
                        <th className="py-2.5 px-3 text-right">Đánh giá</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {itemAnalysisRows.map((row) => (
                        <tr key={row.questionId} className="hover:bg-slate-50/70">
                          <td className="py-2.5 px-3 max-w-[320px]">
                            <p className="font-semibold text-ink-900 line-clamp-2">{row.content}</p>
                          </td>
                          <td className="py-2.5 px-3 text-[11px] text-ink-600 whitespace-nowrap">
                            {row.chapterCategory}
                          </td>
                          <td className="py-2.5 px-3 text-center font-mono">{row.attemptCount}</td>
                          <td className="py-2.5 px-3 text-center font-mono font-bold text-ink-900">
                            {row.correctRatePercent}%
                          </td>
                          <td className="py-2.5 px-3 text-center font-mono text-ink-700">
                            {row.discriminationIndex !== null ? row.discriminationIndex.toFixed(2) : '—'}
                          </td>
                          <td className="py-2.5 px-3 text-right whitespace-nowrap">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                row.statusTag === 'Cần rà soát'
                                  ? 'bg-rose-100 text-rose-800'
                                  : row.statusTag === 'Phân hóa kém'
                                    ? 'bg-amber-100 text-amber-800'
                                    : row.statusTag === 'Quá dễ'
                                      ? 'bg-sky-100 text-sky-800'
                                      : 'bg-support-100 text-support-800'
                              }`}
                            >
                              {row.statusTag}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-card p-5 space-y-3">
              <h3 className="text-sm font-extrabold text-ink-900">
                Danh sách Bài thi có Câu Tự luận Ngắn (Rà soát Highlight &amp; Làm giàu Rubric)
              </h3>
              <div className="divide-y divide-slate-100">
                {(() => {
                  const qTypeMap = new Map(questions.map((q) => [q.id, q.type]));
                  const essayAttempts = attempts
                    .filter((a) => a.examId === selectedExam.id)
                    .filter((a) =>
                      a.assignedQuestions.some(
                        (s) => qTypeMap.get(s.questionId) === 'ESSAY',
                      ),
                    );
                  if (essayAttempts.length === 0) {
                    return (
                      <p className="text-xs text-ink-500 py-3">
                        Ca thi này không có bài thi nào chứa câu hỏi Tự luận ngắn (ESSAY).
                      </p>
                    );
                  }
                  return essayAttempts.map((a) => (
                    <div
                      key={a.id}
                      className="py-3 flex flex-wrap items-center justify-between gap-2 text-xs"
                    >
                      <div>
                        <span className="font-bold text-ink-900">
                          {a.studentName} ({a.studentCode})
                        </span>
                        <span className="text-ink-500 ml-2">
                          Điểm tự luận Rubric: <strong className="font-mono text-brand-700">{a.essayScore}đ</strong> • Tổng hệ 10: <strong className="font-mono">{a.scale10Score.toFixed(2)}</strong>
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setEssayModalAttemptId(a.id)}
                        className="px-3 py-1.5 rounded-lg bg-brand-600 text-white font-bold"
                      >
                        Mở Highlight &amp; Chấm lại
                      </button>
                    </div>
                  ));
                })()}
              </div>
            </div>
          </div>
        )}

        {/* TAB 6: EMAIL LOGS */}
        {activeTab === 'EMAILS' && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-card p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-extrabold text-ink-900 flex items-center gap-1.5 flex-wrap">
                <span>Nhật ký Email Tự động (api/mailer.php Dual-Transport Queue)</span>
                <InfoHint
                  title="Sổ theo dõi các Email hệ thống đã gửi"
                  text={
                    '• Ghi lại lịch sử toàn bộ Email trả điểm gửi cho sinh viên và Email Bảng điểm tổng hợp gửi cho giảng viên.\n• Nếu thấy trạng thái báo lỗi hoặc sinh viên bảo chưa nhận được thư (do gõ sai địa chỉ Email), thầy/cô sang Tab 4 "Giám sát Live" bấm nút Phong bì ở dòng của em đó để sửa Email và gửi lại.'
                  }
                />
              </h2>
              <button
                type="button"
                onClick={() => {
                  const defaultEmail = isDemoMode
                    ? ''
                    : selectedExam?.instructorEmail || instructorUser?.email || '';
                  setTestMailerEmail(defaultEmail);
                  setTestMailerError('');
                  setTestMailerSuccess('');
                  setTestMailerModalOpen(true);
                  if (isDemoMode) {
                    setTestMailerQuota({ loading: true, allowed: true });
                    void checkDemoMailerQuota().then((q) => {
                      setTestMailerQuota({
                        loading: false,
                        allowed: q.allowed,
                        alreadyTestedRecipient: q.alreadyTestedRecipient,
                        message: q.message,
                      });
                    });
                  } else {
                    setTestMailerQuota({ loading: false, allowed: true });
                  }
                }}
                className="h-9 px-3 rounded-xl border border-brand-200 bg-brand-50 text-brand-800 text-xs font-bold flex items-center gap-1.5 hover:bg-brand-100"
              >
                <Mail className="w-3.5 h-3.5" />
                <span>Test Mailer</span>
                <InfoHint
                  title="Kiểm tra gửi Email thật tới hộp thư của thầy/cô"
                  text={
                    '• Bấm vào để mở cửa sổ nhập địa chỉ Email và nhận thử 1 thư mẫu từ hệ thống.\n• Ở chế độ Demo: để chống spam, mỗi trình duyệt chỉ được gửi thử tối đa 1 lần / ngày.\n• Tài khoản Giảng viên chính thức: gửi kiểm tra không giới hạn trước mỗi ca thi.'
                  }
                />
              </button>
            </div>
            <div className="divide-y divide-slate-100">
              {emailLogs.map((log) => (
                <div key={log.id} className="py-3 text-xs flex flex-wrap justify-between gap-2">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded bg-support-50 text-support-700 font-bold text-[10px]">
                        {log.kind}
                      </span>
                      <span className="font-bold text-ink-900">{log.recipient}</span>
                    </div>
                    <p className="font-semibold text-ink-800">{log.subject}</p>
                    <p className="text-ink-600">{log.summary}</p>
                    {log.csvAttachmentName && (
                      <span className="inline-block font-mono text-[10px] bg-slate-100 px-2 py-0.5 rounded">
                        Đính kèm: {log.csvAttachmentName}
                      </span>
                    )}
                  </div>
                  <div className="text-right font-mono text-[11px] text-ink-500">
                    <div
                      className={`font-bold ${
                        log.status === 'FAILED'
                          ? 'text-danger-600'
                          : log.status === 'DEMO_SKIPPED'
                            ? 'text-amber-700'
                            : 'text-support-700'
                      }`}
                    >
                      {log.status === 'DEMO_SKIPPED' ? 'DEMO (Không gửi)' : log.status}
                    </div>
                    <div>{new Date(log.sentAt).toLocaleString('vi-VN')}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {selectedCourse && (
        <QuestionEditorModal
          key={`${editingQuestion?.id ?? 'new'}_${questionModalDefaultChapter ?? ''}`}
          isOpen={questionModalOpen}
          courseId={selectedCourse.id}
          existingChapters={chapterGroups.map(([name]) => name)}
          defaultChapter={questionModalDefaultChapter}
          initialQuestion={editingQuestion}
          onClose={() => setQuestionModalOpen(false)}
          onSave={(q) => {
            upsertQuestion(q);
            showToast('Đã lưu câu hỏi vào ngân hàng.');
          }}
        />
      )}

      {selectedCourse && (
        <ExcelQuestionBankModal
          open={excelModalOpen}
          onClose={() => setExcelModalOpen(false)}
          course={selectedCourse}
          courseQuestions={courseQuestions}
          examTitle={selectedExam?.title || selectedCourse.name}
          selectedTemplateTypes={bankTemplateTypes}
          onChangeSelectedTemplateTypes={setBankTemplateTypes}
          onConfirmImport={(imported, opts) => {
            const summary = importQuestionsBulk(imported, {
              mode: opts.mode,
              courseId: selectedCourse.id,
              syncExamId: opts.syncChapters ? selectedExam?.id : undefined,
            });
            showToast(
              `Đã thêm ${summary.addedCount} câu, cập nhật ${summary.updatedCount} câu${
                summary.syncedChapters > 0
                  ? ` (+${summary.syncedChapters} Chương mới vào Ma trận đề)`
                  : ''
              }.`,
            );
          }}
        />
      )}

      {selectedExam && (
        <EssayGradingModal
          isOpen={Boolean(essayModalAttemptId)}
          examId={selectedExam.id}
          attempt={essayAttemptTarget}
          questions={questions}
          onClose={() => setEssayModalAttemptId(null)}
          onOverrideScore={overrideEssayScore}
          onEnrichRubricAndRegrade={enrichRubricAndRegradeExam}
        />
      )}

      {/* Preview Mode Simulator Modal */}
      {previewOpen && (
        <div className="fixed inset-0 z-[95] bg-ink-900/70 flex items-center justify-center p-3 sm:p-4">
          <div className="w-full max-w-sm bg-white rounded-[28px] border-4 border-ink-900 shadow-2xl overflow-hidden flex flex-col max-h-[88dvh]">
            <div className="bg-ink-900 text-white px-4 py-3 flex items-center justify-between gap-2 text-xs shrink-0">
              <span className="font-bold flex items-center gap-1.5 truncate">
                <Smartphone className="w-4 h-4 text-support-500 shrink-0" />
                Preview Đề Mobile ({previewAssigned.length} câu)
              </span>
              <button
                type="button"
                onClick={() => setPreviewOpen(false)}
                className="p-1 rounded hover:bg-white/10 shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-3 bg-slate-50 border-b flex items-center gap-2 text-xs shrink-0">
              <span className="font-bold shrink-0">Test Seed MSSV:</span>
              <input
                value={previewStudentCode}
                onChange={(e) => setPreviewStudentCode(e.target.value)}
                className="flex-1 min-w-0 px-2 py-1 border rounded font-mono"
              />
            </div>
            <div className="p-4 overflow-y-auto space-y-3 text-xs">
              {previewAssigned.map((snap, i) => (
                <div
                  key={snap.questionId}
                  className="p-3 rounded-xl border border-slate-200 bg-white space-y-1.5"
                >
                  <div className="flex justify-between font-bold text-brand-700 text-[11px]">
                    <span>Câu {i + 1} • {snap.chapterCategory}</span>
                    <span>{snap.maxPoints}đ</span>
                  </div>
                  <p className="font-semibold text-ink-900">{snap.renderedContent}</p>
                  {Object.keys(snap.seedVars).length > 0 && (
                    <p className="font-mono text-[10px] text-support-700">
                      Biến số sinh ra: {JSON.stringify(snap.seedVars)}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Modal: Create Official Exam */}
      {createExamModalOpen && (
        <div className="fixed inset-0 z-[100] bg-ink-900/60 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-2xl p-4 sm:p-5 space-y-4 max-h-[92dvh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-extrabold text-ink-900">
                Tạo Đề thi Chính thức Mới
              </h2>
              <button
                type="button"
                onClick={() => setCreateExamModalOpen(false)}
                className="p-1 rounded-lg hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!newExamTitle.trim() || !/^\d{6}$/.test(newExamPin.trim())) {
                  showToast('Vui lòng nhập tiêu đề và mã phòng 6 chữ số hợp lệ.');
                  return;
                }
                const chosenCourseId = newExamCourseId || courses[0]?.id || '';
                if (!chosenCourseId) {
                  setModalCourseOpen(true);
                  showToast('Vui lòng bấm "Thêm học phần mới" để tạo học phần trước khi tạo đề.');
                  return;
                }
                const newId = `exm_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
                const courseChapters = Array.from(
                  new Set(
                    questions
                      .filter((q) => q.courseId === chosenCourseId)
                      .map((q) => q.chapterCategory),
                  ),
                );
                const createdExam = {
                  id: newId,
                  courseId: chosenCourseId,
                  ownerId: instructorUser?.id,
                  title: newExamTitle.trim(),
                  roomPin: newExamPin.trim(),
                  unlockPin: selectedExam?.unlockPin ?? String(Math.floor(1000 + Math.random() * 9000)),
                  instructorEmail:
                    instructorUser?.email && instructorUser.email !== 'demo@vneconomics.com'
                      ? instructorUser.email
                      : selectedExam?.instructorEmail || 'giangvien@vneconomics.com',
                  durationMinutes: Math.max(5, newExamDuration),
                  chapterMatrix: courseChapters.map((ch) => ({
                    chapterCategory: ch,
                    questionCount: 1,
                    percent: 0,
                    pointsPerQuestion: 1,
                  })),
                  pinnedQuestionIds: [],
                  shuffleQuestions: selectedExam?.shuffleQuestions ?? true,
                  shuffleMode: selectedExam?.shuffleMode ?? ('ESSAY_LAST' as const),
                  shuffleOptions: selectedExam?.shuffleOptions ?? true,
                  maxLeaveCount: selectedExam?.maxLeaveCount ?? 3,
                  maxAwaySeconds: selectedExam?.maxAwaySeconds ?? 45,
                  gracePeriodMs: selectedExam?.gracePeriodMs ?? 2500,
                  oneWayMode: selectedExam?.oneWayMode ?? false,
                  perQuestionSeconds: selectedExam?.perQuestionSeconds ?? 60,
                  canvasAntiOcr: selectedExam?.canvasAntiOcr ?? false,
                  emailDeliveryMode: selectedExam?.emailDeliveryMode ?? ('IMMEDIATE' as const),
                  rosterWhitelist: [],
                  rosterEntries: [],
                  requiresRosterVerification: false,
                  status: newExamStatus,
                  reportSentStatus: 'PENDING' as const,
                  createdAt: new Date().toISOString(),
                };
                const saveRes = await upsertExam(createdExam);
                if (!saveRes.ok) {
                  showToast(saveRes.error || 'Không thể lưu đề thi lên máy chủ.');
                  return;
                }
                setSelectedExamId(newId);
                setCreateExamModalOpen(false);
                showToast(`Đã tạo đề thi chính thức [${createdExam.roomPin}]!`);
              }}
              className="space-y-3 text-xs"
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <label className="block font-bold text-ink-700">Học phần</label>
                  <button
                    type="button"
                    onClick={() => setModalCourseOpen((o) => !o)}
                    className="text-[11px] font-bold text-brand-700 hover:underline flex items-center gap-1 shrink-0 whitespace-nowrap"
                  >
                    <Plus className="w-3 h-3" />
                    {modalCourseOpen ? 'Đóng' : 'Thêm học phần mới'}
                  </button>
                </div>
                <select
                  value={newExamCourseId || courses[0]?.id || ''}
                  onChange={(e) => setNewExamCourseId(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl border border-slate-300 bg-white font-semibold"
                >
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.code} — {c.name}
                    </option>
                  ))}
                </select>
                {modalCourseOpen && (
                  <div className="mt-2 p-2.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={modalCourseCode}
                        onChange={(e) => setModalCourseCode(e.target.value)}
                        placeholder="Mã HP (VD: FIN101)"
                        className="w-28 min-w-0 h-9 px-2.5 rounded-lg border border-slate-300 bg-white font-mono uppercase"
                      />
                      <input
                        type="text"
                        value={modalCourseName}
                        onChange={(e) => setModalCourseName(e.target.value)}
                        placeholder="Tên học phần mới..."
                        className="flex-1 min-w-0 h-9 px-2.5 rounded-lg border border-slate-300 bg-white"
                      />
                    </div>
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setModalCourseOpen(false);
                          setModalCourseCode('');
                          setModalCourseName('');
                        }}
                        className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white text-ink-600 font-semibold"
                      >
                        Hủy
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (!modalCourseCode.trim() || !modalCourseName.trim()) {
                            showToast('Vui lòng nhập đủ Mã HP và Tên học phần.');
                            return;
                          }
                          const created = addCourse({
                            code: modalCourseCode.trim().toUpperCase(),
                            name: modalCourseName.trim(),
                            semester: 'HK1 2026-2027',
                            credits: 3,
                          });
                          setNewExamCourseId(created.id);
                          setModalCourseCode('');
                          setModalCourseName('');
                          setModalCourseOpen(false);
                          showToast(`Đã thêm học phần ${created.code} — ${created.name}.`);
                        }}
                        className="px-3 py-1 rounded-lg bg-brand-600 hover:bg-brand-700 text-white font-bold"
                      >
                        Lưu học phần
                      </button>
                    </div>
                  </div>
                )}
              </div>
              <div>
                <label className="block font-bold text-ink-700 mb-1">Tên kỳ thi / ca thi</label>
                <input
                  type="text"
                  required
                  value={newExamTitle}
                  onChange={(e) => setNewExamTitle(e.target.value)}
                  placeholder="VD: Kiểm tra Giữa kỳ Kinh tế Vi mô — Nhóm 02"
                  className="w-full h-10 px-3 rounded-xl border border-slate-300"
                />
              </div>
              <div className="grid grid-cols-3 gap-2.5">
                <div>
                  <label className="block font-bold text-ink-700 mb-1">Mã PIN (6 số)</label>
                  <input
                    type="text"
                    required
                    maxLength={6}
                    value={newExamPin}
                    onChange={(e) => setNewExamPin(e.target.value.replace(/\D/g, ''))}
                    className="w-full h-10 px-3 rounded-xl border border-slate-300 font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block font-bold text-ink-700 mb-1">Phút làm bài</label>
                  <input
                    type="number"
                    min={5}
                    max={240}
                    value={newExamDuration}
                    onChange={(e) => setNewExamDuration(Number(e.target.value))}
                    className="w-full h-10 px-3 rounded-xl border border-slate-300 font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block font-bold text-ink-700 mb-1">Trạng thái</label>
                  <select
                    value={newExamStatus}
                    onChange={(e) => setNewExamStatus(e.target.value as 'OPEN' | 'DRAFT')}
                    className="w-full h-10 px-2.5 rounded-xl border border-slate-300 font-bold"
                  >
                    <option value="OPEN">ĐANG MỞ</option>
                    <option value="DRAFT">NHÁP</option>
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setCreateExamModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 font-bold text-ink-700"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-bold"
                >
                  Tạo Đề Chính Thức
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Test Mailer */}
      {testMailerModalOpen && (
        <div className="fixed inset-0 z-[105] bg-ink-900/60 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-2xl p-5 sm:p-6 space-y-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <span
                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-extrabold ${
                    isDemoMode
                      ? 'bg-amber-100 text-amber-900'
                      : 'bg-support-100 text-support-800'
                  }`}
                >
                  {isDemoMode
                    ? 'CHẾ ĐỘ DEMO • GIỚI HẠN 1 LẦN / NGÀY / TRÌNH DUYỆT'
                    : 'GIẢNG VIÊN CHÍNH THỨC • TEST SMTP'}
                </span>
                <h2 className="text-base font-extrabold text-ink-900 mt-1.5">
                  Kiểm thử Gửi Email (Test Mailer)
                </h2>
                <p className="text-xs text-ink-600 mt-1">
                  {isDemoMode
                    ? 'Nhập địa chỉ Email của thầy/cô để nhận thư thử nghiệm trực tiếp từ hệ thống (mỗi trình duyệt được dùng 1 lần/ngày để chống spam).'
                    : 'Nhập địa chỉ Email cần kiểm tra kết nối gửi thư tự động trước giờ mở phòng thi.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setTestMailerModalOpen(false)}
                className="p-1 rounded-lg hover:bg-slate-100 shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {isDemoMode && testMailerQuota.loading ? (
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-ink-600">
                Đang kiểm tra lượt gửi thử hôm nay của trình duyệt...
              </div>
            ) : isDemoMode && !testMailerQuota.allowed && !testMailerSuccess ? (
              <div className="space-y-3">
                <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 space-y-1.5">
                  <p className="font-extrabold">
                    Trình duyệt này đã dùng hết 1/1 lượt gửi Email thử Demo hôm nay
                  </p>
                  {testMailerQuota.alreadyTestedRecipient && (
                    <p>
                      Đã gửi tới:{' '}
                      <strong className="font-mono">
                        {testMailerQuota.alreadyTestedRecipient}
                      </strong>
                    </p>
                  )}
                  <p className="text-amber-800">
                    {testMailerQuota.message ||
                      'Thầy/cô có thể thử lại vào ngày mai (00:00), hoặc đăng nhập tài khoản Giảng viên chính thức để gửi kiểm tra không giới hạn.'}
                  </p>
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setTestMailerModalOpen(false)}
                    className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-ink-700"
                  >
                    Đóng
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setTestMailerModalOpen(false);
                      setUpgradeModalOpen(true);
                    }}
                    className="px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold"
                  >
                    Đăng nhập tài khoản Giảng viên
                  </button>
                </div>
              </div>
            ) : (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  setTestMailerError('');
                  setTestMailerSuccess('');
                  const clean = testMailerEmail.trim();
                  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) {
                    setTestMailerError('Vui lòng nhập đúng định dạng Email (VD: ten@ueh.edu.vn).');
                    return;
                  }
                  setTestMailerSending(true);
                  const res = await sendTestMailer(clean);
                  setTestMailerSending(false);
                  if (res.ok) {
                    setTestMailerSuccess(
                      `Đã gửi Email thử nghiệm tới ${clean}. Thầy/cô vui lòng kiểm tra hộp thư đến (hoặc mục Thư rác/Spam nếu chưa thấy).`,
                    );
                    if (isDemoMode) {
                      setTestMailerQuota({
                        loading: false,
                        allowed: false,
                        alreadyTestedRecipient: clean,
                      });
                    }
                    showToast(`Đã gửi Email thử nghiệm tới ${clean}`);
                  } else {
                    setTestMailerError(res.error || 'Không thể gửi Email thử nghiệm.');
                    if (res.quotaExceeded) {
                      setTestMailerQuota({
                        loading: false,
                        allowed: false,
                        alreadyTestedRecipient: res.alreadyTestedRecipient,
                        message: res.error,
                      });
                    }
                  }
                }}
                className="space-y-3 text-xs"
              >
                <div>
                  <label className="block font-bold text-ink-700 mb-1">
                    Email nhận thư thử nghiệm *
                  </label>
                  <input
                    type="email"
                    required
                    value={testMailerEmail}
                    onChange={(e) => setTestMailerEmail(e.target.value)}
                    placeholder="VD: giangvien@ueh.edu.vn"
                    disabled={testMailerSending || Boolean(testMailerSuccess)}
                    className="w-full h-10 px-3 rounded-xl border border-slate-300 bg-white font-semibold disabled:bg-slate-50"
                  />
                </div>

                {testMailerError && (
                  <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 font-semibold">
                    {testMailerError}
                  </div>
                )}

                {testMailerSuccess && (
                  <div className="p-3 rounded-xl bg-support-50 border border-support-200 text-support-800 font-semibold">
                    {testMailerSuccess}
                  </div>
                )}

                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setTestMailerModalOpen(false)}
                    className="px-4 py-2 rounded-xl border border-slate-200 font-bold text-ink-700"
                  >
                    Đóng
                  </button>
                  {!testMailerSuccess && (
                    <button
                      type="submit"
                      disabled={testMailerSending}
                      className="px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white font-bold flex items-center gap-1.5"
                    >
                      <Mail className="w-3.5 h-3.5" />
                      {testMailerSending ? 'Đang gửi...' : 'Gửi Email Thử Nghiệm'}
                    </button>
                  )}
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Modal: Upgrade from Demo to Official Instructor Account */}
      {upgradeModalOpen && (
        <div className="fixed inset-0 z-[110] bg-ink-900/65 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-2xl p-5 sm:p-6 space-y-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 text-[10px] font-extrabold">
                  YÊU CẦU TÀI KHOẢN GIẢNG VIÊN
                </span>
                <h2 className="text-base font-extrabold text-ink-900 mt-1.5">
                  Đăng ký / Đăng nhập để tạo Đề thi Chính thức
                </h2>
                <p className="text-xs text-ink-600 mt-1">
                  Bạn đang ở chế độ <strong>Demo (vne2026)</strong>. Hãy đăng nhập bằng Google hoặc đăng ký tài khoản Giảng viên riêng để tạo học phần và phòng thi chính thức.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setUpgradeModalOpen(false)}
                className="p-1 rounded-lg hover:bg-slate-100 shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 p-1 bg-slate-100 rounded-xl text-xs font-bold">
              <button
                type="button"
                onClick={() => {
                  setAuthTab('REGISTER');
                  setAuthError('');
                }}
                className={`py-1.5 rounded-lg transition ${
                  authTab === 'REGISTER'
                    ? 'bg-white text-brand-700 shadow-2xs'
                    : 'text-ink-600'
                }`}
              >
                Đăng ký mới
              </button>
              <button
                type="button"
                onClick={() => {
                  setAuthTab('LOGIN');
                  setAuthError('');
                }}
                className={`py-1.5 rounded-lg transition ${
                  authTab === 'LOGIN'
                    ? 'bg-white text-brand-700 shadow-2xs'
                    : 'text-ink-600'
                }`}
              >
                Đã có tài khoản
              </button>
            </div>

            <GoogleSignInButton
              googleClientId={googleClientId}
              disabled={authLoading}
              onCredential={async (credential) => {
                setAuthError('');
                setAuthLoading(true);
                const res = await instructorGoogleLogin(credential);
                setAuthLoading(false);
                if (res.ok) {
                  setUpgradeModalOpen(false);
                  showToast('Đã đăng nhập bằng Google — có thể tạo đề thi chính thức!');
                } else {
                  setAuthError(res.error ?? 'Đăng nhập Google thất bại.');
                }
              }}
            />

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setAuthError('');
                setAuthLoading(true);
                const res =
                  authTab === 'REGISTER'
                    ? await instructorRegister(
                        authFullName,
                        authEmail,
                        authPassword,
                        captchaToken,
                        captchaAnswer,
                      )
                    : await instructorLogin(
                        authEmail,
                        authPassword,
                        captchaToken,
                        captchaAnswer,
                      );
                setAuthLoading(false);
                if (res.ok) {
                  setUpgradeModalOpen(false);
                  showToast('Đã kích hoạt phiên Giảng viên chính thức!');
                } else {
                  setAuthError(res.error ?? 'Không thể xác thực tài khoản.');
                  setCaptchaRefreshKey((k) => k + 1);
                }
              }}
              className="space-y-2.5 text-xs"
            >
              {authTab === 'REGISTER' && (
                <input
                  type="text"
                  required
                  value={authFullName}
                  onChange={(e) => setAuthFullName(e.target.value)}
                  placeholder="Họ và tên giảng viên"
                  className="w-full h-10 px-3 rounded-xl border border-slate-300"
                />
              )}
              <input
                type="email"
                required
                value={authEmail}
                onChange={(e) => setAuthEmail(e.target.value)}
                placeholder="Email giảng viên"
                className="w-full h-10 px-3 rounded-xl border border-slate-300"
              />
              <input
                type="password"
                required
                minLength={6}
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
                placeholder="Mật khẩu (tối thiểu 6 ký tự)"
                className="w-full h-10 px-3 rounded-xl border border-slate-300"
              />
              <CaptchaField
                answer={captchaAnswer}
                onAnswerChange={setCaptchaAnswer}
                onTokenChange={setCaptchaToken}
                refreshKey={captchaRefreshKey}
                disabled={authLoading}
              />
              {authError && (
                <p className="text-xs text-rose-600 font-semibold">{authError}</p>
              )}
              <button
                type="submit"
                disabled={authLoading}
                className="w-full h-10 rounded-xl bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white font-bold"
              >
                {authLoading
                  ? 'Đang xác thực...'
                  : authTab === 'REGISTER'
                    ? 'Đăng ký & Mở khóa tạo đề chính thức'
                    : 'Đăng nhập & Mở khóa'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
