import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
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
  Lock,
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
import { EssayGradingModal } from '../components/admin/EssayGradingModal';
import { ExcelQuestionBankModal } from '../components/admin/ExcelQuestionBankModal';
import { LiveProctorTable } from '../components/admin/LiveProctorTable';
import { QuestionEditorModal } from '../components/admin/QuestionEditorModal';
import { useExamPlatform } from '../context/ExamContext';
import type {
  ChapterQuotaRule,
  EmailDeliveryMode,
  Question,
  QuestionType,
  ShuffleMode,
} from '../types/exam';
import {
  buildExamCsvContent,
  downloadTextFile,
  exportQuestionBankJson,
} from '../utils/csvExport';
import {
  buildAssignedQuestions,
  computeChapterMastery,
} from '../utils/dynamicQuestionEngine';
import {
  ALL_QUESTION_TYPES,
  downloadQuestionBankTemplateXlsx,
  exportCourseQuestionsToXlsx,
} from '../utils/excelQuestionBank';

type AdminTab = 'LIVE' | 'BANK_MATRIX' | 'ANALYTICS_ESSAY' | 'EMAILS';

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
    adminLogin,
    adminLogout,
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
  } = useExamPlatform();

  const [passcode, setPasscode] = useState('');
  const [authError, setAuthError] = useState('');
  const [selectedExamId, setSelectedExamId] = useState(exams[0]?.id ?? '');
  const [activeTab, setActiveTab] = useState<AdminTab>('LIVE');
  const [toast, setToast] = useState<string | null>(null);

  const [questionModalOpen, setQuestionModalOpen] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<Question | undefined>(
    undefined,
  );
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
  const [bankTemplateTypes, setBankTemplateTypes] = useState<QuestionType[]>([]);

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
    setToast(msg);
    window.setTimeout(() => setToast(null), 3500);
  };

  const selectedExam = useMemo(
    () => exams.find((e) => e.id === selectedExamId) ?? exams[0],
    [exams, selectedExamId],
  );
  const selectedCourse = useMemo(
    () => courses.find((c) => c.id === selectedExam?.courseId),
    [courses, selectedExam],
  );
  const courseQuestions = useMemo(
    () =>
      questions.filter((q) => q.courseId === selectedExam?.courseId),
    [questions, selectedExam],
  );

  const chapterGroups = useMemo(() => {
    const map = new Map<string, Question[]>();
    for (const q of courseQuestions) {
      const arr = map.get(q.chapterCategory) ?? [];
      arr.push(q);
      map.set(q.chapterCategory, arr);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b, 'vi'));
  }, [courseQuestions]);

  const handleDownloadTemplateXlsx = () => {
    downloadQuestionBankTemplateXlsx(
      selectedCourse?.code ?? 'COURSE',
      selectedCourse?.name ?? 'Học phần',
      Array.from(
        new Set([
          ...chapterGroups.map(([name]) => name),
          ...selectedExam.chapterMatrix.map((r) => r.chapterCategory),
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

  if (!isAdminAuthenticated) {
    const handleAuth = async (e: React.FormEvent) => {
      e.preventDefault();
      const ok = await adminLogin(passcode);
      if (!ok) {
        setAuthError('Mã khóa không đúng. Mặc định demo: vne2026');
      }
    };
    return (
      <div className="min-h-screen bg-surface-100 flex items-center justify-center p-4">
        <div className="w-full max-w-sm bg-white rounded-2xl border border-slate-200 shadow-card p-6 space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-brand-600 text-white flex items-center justify-center mx-auto">
            <Lock className="w-6 h-6" />
          </div>
          <div className="text-center">
            <h1 className="text-lg font-extrabold text-ink-900">
              Cổng Quản trị Giảng viên (/admin)
            </h1>
            <p className="text-xs text-ink-500 mt-1">
              Bảo vệ bằng HMAC-SHA256 Bearer Auth
            </p>
          </div>
          <form onSubmit={handleAuth} className="space-y-3">
            <input
              type="password"
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              placeholder="Nhập mã khóa Giảng viên (vne2026)"
              className="w-full h-11 px-3.5 rounded-xl border border-slate-300 text-sm font-mono"
            />
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setPasscode('vne2026');
                  setAuthError('');
                }}
                className="text-[11px] font-semibold text-brand-700 hover:underline"
              >
                Điền nhanh mã khóa Demo (vne2026)
              </button>
            </div>
            {authError && (
              <p className="text-xs text-rose-600 font-semibold">{authError}</p>
            )}
            <button
              type="submit"
              className="w-full h-11 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold"
            >
              Xác thực & Mở Dashboard
            </button>
          </form>
          <div className="text-center pt-1">
            <Link to="/" className="text-xs font-semibold text-brand-600 hover:underline">
              ← Quay lại Cổng thi Sinh viên
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!selectedExam) {
    return null;
  }

  const updateMatrixRule = (
    chapterCategory: string,
    patch: Partial<ChapterQuotaRule>,
  ) => {
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
    upsertExam({ ...selectedExam, chapterMatrix: nextMatrix });
  };

  const totalMatrixQuestions = selectedExam.chapterMatrix.reduce(
    (s, r) => s + (r.questionCount || 0),
    0,
  );
  const totalMatrixPoints = selectedExam.chapterMatrix.reduce(
    (s, r) => s + (r.questionCount || 0) * (r.pointsPerQuestion ?? 1),
    0,
  );

  const handleDuplicateQuestion = (q: Question) => {
    const cloned: Question = {
      ...q,
      id: `q_copy_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`,
      content: `${q.content} (Bản sao)`,
    };
    upsertQuestion(cloned);
    showToast('Đã nhân bản câu hỏi.');
  };

  return (
    <div className="min-h-screen bg-surface-100 pb-10">
      {/* Top Admin Navbar */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-brand-600 text-white flex items-center justify-center font-bold">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-sm font-extrabold text-ink-900">
                VNEconomics Instructor Control Center
              </h1>
              <p className="text-[11px] text-ink-500">
                Ma trận Chương • Chấm Rubric &lt; 1ms • Live Proctoring
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={selectedExam.id}
              onChange={(e) => setSelectedExamId(e.target.value)}
              className="h-9 px-3 rounded-xl border border-slate-300 bg-slate-50 text-xs font-bold text-ink-900 max-w-[260px]"
            >
              {exams.map((ex) => (
                <option key={ex.id} value={ex.id}>
                  [{ex.roomPin}] {ex.title}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => setPreviewOpen(true)}
              className="h-9 px-3 rounded-xl border border-brand-200 bg-brand-50 text-brand-700 text-xs font-bold flex items-center gap-1.5"
            >
              <Eye className="w-3.5 h-3.5" /> Preview Mobile
            </button>

            <button
              type="button"
              onClick={() => setExcelModalOpen(true)}
              className="h-9 px-3 rounded-xl border border-support-200 bg-support-50 text-support-800 hover:bg-support-100 text-xs font-bold flex items-center gap-1.5"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" /> Mẫu / Import Excel
            </button>

            <button
              type="button"
              onClick={() => {
                sendTestMailer(selectedExam.instructorEmail);
                showToast(`Đã gửi Email thử nghiệm tới ${selectedExam.instructorEmail}`);
              }}
              className="h-9 px-3 rounded-xl border border-slate-200 bg-white text-ink-700 text-xs font-bold flex items-center gap-1.5 hover:border-brand-300"
            >
              <Mail className="w-3.5 h-3.5" /> Test Mailer
            </button>

            <button
              type="button"
              onClick={() => {
                const copy = cloneExam(selectedExam.id);
                if (copy) {
                  setSelectedExamId(copy.id);
                  showToast(`Đã nhân bản ca thi với PIN mới: ${copy.roomPin}`);
                }
              }}
              className="h-9 px-3 rounded-xl border border-slate-200 bg-white text-ink-700 text-xs font-bold flex items-center gap-1.5 hover:border-brand-300"
            >
              <Copy className="w-3.5 h-3.5" /> Clone Ca
            </button>

            <button
              type="button"
              onClick={() => {
                resetDemoData();
                showToast('Đã khôi phục dữ liệu mẫu ban đầu.');
              }}
              title="Reset dữ liệu demo"
              className="h-9 w-9 rounded-xl border border-slate-200 bg-white text-ink-600 flex items-center justify-center hover:bg-slate-50"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={adminLogout}
              title="Đăng xuất"
              className="h-9 w-9 rounded-xl border border-slate-200 bg-white text-rose-600 flex items-center justify-center hover:bg-rose-50"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="max-w-7xl mx-auto px-4 flex gap-1 overflow-x-auto border-t border-slate-100">
          {[
            { id: 'LIVE' as const, label: 'Giám sát Live & Duyệt', icon: Activity },
            { id: 'BANK_MATRIX' as const, label: 'Ngân hàng Chương & Ma trận Đề', icon: Layers },
            { id: 'ANALYTICS_ESSAY' as const, label: 'Thống kê Chương & Tự luận Rubric', icon: BarChart3 },
            { id: 'EMAILS' as const, label: `Nhật ký Email (${emailLogs.length})`, icon: Mail },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2.5 text-xs font-bold border-b-2 flex items-center gap-1.5 whitespace-nowrap transition ${
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

      <main className="max-w-7xl mx-auto px-4 pt-5 space-y-5">
        {toast && (
          <div className="bg-support-600 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{toast}</span>
          </div>
        )}

        {/* TAB 1: LIVE PROCTORING */}
        {activeTab === 'LIVE' && (
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
                `Đã đóng ca thi, thu tự động ${res.sweptCount} bài còn treo & xuất Email tổng hợp cho ${selectedExam.instructorEmail}`,
              );
            }}
            onOpenEssayReview={(attId) => setEssayModalAttemptId(attId)}
            onResendEmail={(attId, newMail) => {
              resendStudentScoreEmail(attId, newMail);
              showToast('Đã cập nhật & gửi lại Email điểm cho sinh viên.');
            }}
          />
        )}

        {/* TAB 2: QUESTION BANK BY CHAPTER + ALLOCATION MATRIX + EXAM SETTINGS */}
        {activeTab === 'BANK_MATRIX' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Left: Exam Matrix & Settings */}
            <div className="lg:col-span-5 space-y-4">
              <div className="bg-white rounded-2xl border border-slate-200 shadow-card p-5 space-y-4 text-xs">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-extrabold text-ink-900 flex items-center gap-1.5">
                    <Layers className="w-4 h-4 text-brand-600" />
                    Ma trận Phân bổ Câu hỏi theo Chương
                  </h2>
                  <span className="font-mono font-bold text-support-700 bg-support-50 px-2.5 py-1 rounded-full">
                    {totalMatrixQuestions} câu • {totalMatrixPoints.toFixed(1)}đ
                  </span>
                </div>

                <div className="space-y-2.5">
                  {chapterGroups.map(([chapterName, qs]) => {
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
                          <label className="flex items-center justify-between bg-white px-2.5 py-1.5 rounded-lg border">
                            <span>Số câu bốc:</span>
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
                          <label className="flex items-center justify-between bg-white px-2.5 py-1.5 rounded-lg border">
                            <span>Điểm/câu:</span>
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
                  })}
                </div>

                {/* Shuffle & Exam Policy */}
                <div className="border-t border-slate-200 pt-3 space-y-3">
                  <h3 className="font-bold text-ink-900">
                    Chính sách Trộn Đề Đa tầng & Ca thi
                  </h3>
                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="block font-semibold mb-1">
                        Mã phòng thi (6 số)
                      </label>
                      <input
                        type="text"
                        inputMode="numeric"
                        maxLength={6}
                        value={selectedExam.roomPin}
                        onChange={(e) =>
                          upsertExam({
                            ...selectedExam,
                            roomPin: e.target.value.replace(/\D/g, '').slice(0, 6),
                          })
                        }
                        placeholder="101202"
                        className="w-full h-9 px-2.5 rounded-lg border border-slate-300 font-mono font-bold tracking-wider"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold mb-1">
                        Thời lượng làm bài (phút)
                      </label>
                      <input
                        type="number"
                        min={5}
                        max={240}
                        value={selectedExam.durationMinutes}
                        onChange={(e) =>
                          upsertExam({
                            ...selectedExam,
                            durationMinutes: Math.max(5, Number(e.target.value) || 5),
                          })
                        }
                        className="w-full h-9 px-2.5 rounded-lg border border-slate-300 font-mono font-bold"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="block font-semibold mb-1">Kiểu trộn thứ tự câu</label>
                      <select
                        value={selectedExam.shuffleMode}
                        onChange={(e) =>
                          upsertExam({
                            ...selectedExam,
                            shuffleMode: e.target.value as ShuffleMode,
                          })
                        }
                        className="w-full h-9 px-2 rounded-lg border border-slate-300 font-semibold"
                      >
                        <option value="FULL_RANDOM">Trộn toàn bộ đề</option>
                        <option value="BY_CHAPTER">Trộn trong từng Chương</option>
                        <option value="ESSAY_LAST">Đưa Tự luận xuống cuối</option>
                      </select>
                    </div>
                    <div>
                      <label className="block font-semibold mb-1">Chế độ gửi Email SV</label>
                      <select
                        value={selectedExam.emailDeliveryMode}
                        onChange={(e) =>
                          upsertExam({
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

                  <div className="grid grid-cols-2 gap-2">
                    <label className="flex items-center gap-2 font-semibold">
                      <input
                        type="checkbox"
                        checked={selectedExam.shuffleOptions}
                        onChange={(e) =>
                          upsertExam({
                            ...selectedExam,
                            shuffleOptions: e.target.checked,
                          })
                        }
                      />
                      Trộn A/B/C/D (ghim cuối)
                    </label>
                    <label className="flex items-center gap-2 font-semibold">
                      <input
                        type="checkbox"
                        checked={selectedExam.canvasAntiOcr}
                        onChange={(e) =>
                          upsertExam({
                            ...selectedExam,
                            canvasAntiOcr: e.target.checked,
                          })
                        }
                      />
                      Canvas Chống OCR
                    </label>
                    <label className="flex items-center gap-2 font-semibold">
                      <input
                        type="checkbox"
                        checked={selectedExam.oneWayMode}
                        onChange={(e) =>
                          upsertExam({
                            ...selectedExam,
                            oneWayMode: e.target.checked,
                          })
                        }
                      />
                      Điều hướng 1 chiều
                    </label>
                    <div>
                      <select
                        value={selectedExam.status}
                        onChange={(e) =>
                          upsertExam({
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
                    </div>
                  </div>

                  <div>
                    <label className="block font-semibold mb-1">
                      Whitelist MSSV (tùy chọn, phân tách dấu phẩy/dòng; để trống = cho phép tự do)
                    </label>
                    <textarea
                      rows={2}
                      value={selectedExam.rosterWhitelist.join(', ')}
                      onChange={(e) =>
                        upsertExam({
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

            {/* Right: Question Bank Grouped by Chapter */}
            <div className="lg:col-span-7 space-y-4">
              <div className="bg-white rounded-2xl border border-slate-200 shadow-card p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-sm font-extrabold text-ink-900 flex items-center gap-1.5">
                      <BookOpen className="w-4 h-4 text-brand-600" />
                      Ngân hàng Câu hỏi: {selectedCourse?.code} — {selectedCourse?.name}
                    </h2>
                    <p className="text-[11px] text-ink-500">
                      Tổng {courseQuestions.length} câu thuộc {chapterGroups.length} Chương
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => setNewCourseOpen((o) => !o)}
                      className="px-3 py-1.5 rounded-xl border border-slate-200 font-bold hover:bg-slate-50"
                    >
                      + Học phần
                    </button>
                    <button
                      type="button"
                      title="Tải file mẫu Excel theo các loại câu hỏi đã tick bên dưới (mặc định 4 phương án nếu không tick)"
                      onClick={handleDownloadTemplateXlsx}
                      className="px-3 py-1.5 rounded-xl border border-brand-200 bg-brand-50 text-brand-800 font-bold flex items-center gap-1 hover:bg-brand-100"
                    >
                      <Download className="w-3.5 h-3.5" />{' '}
                      {isDefaultFourOptionTemplate
                        ? 'Tải Mẫu Excel (4 ĐA)'
                        : `Tải Mẫu Excel (${effectiveBankTemplateTypes.length} loại)`}
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
                              ...selectedExam.chapterMatrix.map(
                                (r) => r.chapterCategory,
                              ),
                            ]),
                          ),
                        )
                      }
                      className="px-3 py-1.5 rounded-xl border border-support-200 bg-support-50 text-support-800 font-bold flex items-center gap-1 hover:bg-support-100 disabled:opacity-45"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5" /> Xuất Excel
                    </button>
                    <button
                      type="button"
                      onClick={() => setExcelModalOpen(true)}
                      className="px-3 py-1.5 rounded-xl bg-support-600 hover:bg-support-700 text-white font-bold flex items-center gap-1 shadow-xs"
                    >
                      <Upload className="w-3.5 h-3.5" /> Import Excel
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
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingQuestion(undefined);
                        setQuestionModalOpen(true);
                      }}
                      className="px-3.5 py-1.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-bold flex items-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" /> Thêm câu lẻ
                    </button>
                  </div>
                </div>

                {newCourseOpen && (
                  <div className="p-3 bg-slate-50 rounded-xl border flex flex-wrap gap-2 text-xs">
                    <input
                      value={newCourseCode}
                      onChange={(e) => setNewCourseCode(e.target.value)}
                      placeholder="Mã HP (VD: FIN101)"
                      className="w-28 px-2.5 py-1.5 border rounded-lg font-mono"
                    />
                    <input
                      value={newCourseName}
                      onChange={(e) => setNewCourseName(e.target.value)}
                      placeholder="Tên học phần mới..."
                      className="flex-1 px-2.5 py-1.5 border rounded-lg"
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
                      className="px-3 py-1.5 rounded-lg bg-brand-600 text-white font-bold"
                    >
                      Lưu
                    </button>
                  </div>
                )}

                {/* Template Type Selector Box for Quick Excel Export */}
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
            </div>
          </div>
        )}

        {/* TAB 3: CHAPTER MASTERY ANALYTICS & CSV EXPORT */}
        {activeTab === 'ANALYTICS_ESSAY' && (
          <div className="space-y-5">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-card p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-extrabold text-ink-900">
                    Thống kê Năng lực Sinh viên theo Chương (Chapter Mastery Analytics)
                  </h2>
                  <p className="text-xs text-ink-500">
                    Tổng hợp tỷ lệ điểm trung bình ở từng Chương của các bài đã hoàn thành để kịp thời củng cố kiến thức.
                  </p>
                </div>
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
                  className="px-4 py-2 rounded-xl bg-support-600 hover:bg-support-700 text-white text-xs font-bold flex items-center gap-1.5"
                >
                  <Download className="w-4 h-4" /> Xuất Bảng điểm + Chương (.CSV BOM)
                </button>
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

            <div className="bg-white rounded-2xl border border-slate-200 shadow-card p-5 space-y-3">
              <h3 className="text-sm font-extrabold text-ink-900">
                Danh sách Bài thi có Câu Tự luận Ngắn (Rà soát Highlight & Làm giàu Rubric)
              </h3>
              <div className="divide-y divide-slate-100">
                {attempts
                  .filter((a) => a.examId === selectedExam.id)
                  .map((a) => (
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
                        Mở Highlight & Chấm lại
                      </button>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: EMAIL LOGS */}
        {activeTab === 'EMAILS' && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-card p-5 space-y-3">
            <h2 className="text-sm font-extrabold text-ink-900">
              Nhật ký Email Tự động (api/mailer.php Dual-Transport Queue)
            </h2>
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
                    <div className="font-bold text-support-700">{log.status}</div>
                    <div>{new Date(log.sentAt).toLocaleString('vi-VN')}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      <QuestionEditorModal
        key={editingQuestion?.id ?? 'new'}
        isOpen={questionModalOpen}
        courseId={selectedExam.courseId}
        existingChapters={chapterGroups.map(([name]) => name)}
        initialQuestion={editingQuestion}
        onClose={() => setQuestionModalOpen(false)}
        onSave={(q) => {
          upsertQuestion(q);
          showToast('Đã lưu câu hỏi vào ngân hàng.');
        }}
      />

      {selectedCourse && (
        <ExcelQuestionBankModal
          open={excelModalOpen}
          onClose={() => setExcelModalOpen(false)}
          course={selectedCourse}
          courseQuestions={courseQuestions}
          examTitle={selectedExam.title}
          selectedTemplateTypes={bankTemplateTypes}
          onChangeSelectedTemplateTypes={setBankTemplateTypes}
          onConfirmImport={(imported, opts) => {
            const summary = importQuestionsBulk(imported, {
              mode: opts.mode,
              courseId: selectedCourse.id,
              syncExamId: opts.syncChapters ? selectedExam.id : undefined,
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

      <EssayGradingModal
        isOpen={Boolean(essayModalAttemptId)}
        examId={selectedExam.id}
        attempt={essayAttemptTarget}
        questions={questions}
        onClose={() => setEssayModalAttemptId(null)}
        onOverrideScore={overrideEssayScore}
        onEnrichRubricAndRegrade={enrichRubricAndRegradeExam}
      />

      {/* Preview Mode Simulator Modal */}
      {previewOpen && (
        <div className="fixed inset-0 z-[95] bg-ink-900/70 flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white rounded-[28px] border-4 border-ink-900 shadow-2xl overflow-hidden flex flex-col max-h-[88vh]">
            <div className="bg-ink-900 text-white px-4 py-3 flex items-center justify-between text-xs">
              <span className="font-bold flex items-center gap-1.5">
                <Smartphone className="w-4 h-4 text-support-500" />
                Preview Đề Mobile ({previewAssigned.length} câu)
              </span>
              <button
                type="button"
                onClick={() => setPreviewOpen(false)}
                className="p-1 rounded hover:bg-white/10"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-3 bg-slate-50 border-b flex items-center gap-2 text-xs">
              <span className="font-bold">Test Seed MSSV:</span>
              <input
                value={previewStudentCode}
                onChange={(e) => setPreviewStudentCode(e.target.value)}
                className="flex-1 px-2 py-1 border rounded font-mono"
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
    </div>
  );
};
