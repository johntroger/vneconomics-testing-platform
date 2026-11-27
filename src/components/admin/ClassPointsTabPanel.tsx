import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Award,
  BarChart3,
  Calendar,
  Download,
  Edit3,
  Gamepad2,
  History,
  Lock,
  MinusCircle,
  Plus,
  PlusCircle,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  Trophy,
  Upload,
  Users,
  X,
} from 'lucide-react';
import { getTodayVnDateKey } from '../../services/apiClient';
import {
  deleteClassPointEntry,
  deleteFixedClass,
  exportClassPointsXlsx,
  fetchClassPointsSummary,
  getDefaultAcademicStartYear,
  getDefaultSemesterCode,
  listFixedClasses,
  parseFixedRosterText,
  recordClassPoints,
  resolvePeriodRange,
  saveFixedClass,
} from '../../services/classPointsApi';
import {
  parseRosterFromExcelFile,
  readPointCriteria,
} from '../../minigames/rosterStorage';
import type { AttendanceRosterStudent } from '../../types/attendance';
import type {
  ClassPointsSummaryResponse,
  FixedClassSummary,
  PointLedgerType,
  SemesterCode,
  StatsPeriodMode,
  StudentPointSummary,
} from '../../types/classPoints';

interface ClassPointsTabPanelProps {
  isOfficial: boolean;
  instructorName?: string;
  onRequireOfficialLogin: () => void;
  onPlayMinigameWithClass?: (classItem: FixedClassSummary) => void;
}

const PERIOD_TABS: Array<{ id: StatsPeriodMode; label: string }> = [
  { id: 'ALL', label: 'Tất cả' },
  { id: 'DAY', label: 'Ngày' },
  { id: 'WEEK', label: 'Tuần' },
  { id: 'MONTH', label: 'Tháng' },
  { id: 'SEMESTER', label: 'Học kỳ' },
  { id: 'ACADEMIC_YEAR', label: 'Năm học' },
  { id: 'YEAR', label: 'Năm' },
  { id: 'CUSTOM', label: 'Tùy chọn' },
];

function formatPts(n: number): string {
  const rounded = Math.round(n * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1).replace(/\.0$/, '');
}

function formatDateVi(isoDate: string): string {
  if (!isoDate) return '';
  const parts = isoDate.split('-');
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  if (parts.length === 2) return `T${parts[1]}/${parts[0]}`;
  return isoDate;
}

export const ClassPointsTabPanel: React.FC<ClassPointsTabPanelProps> = ({
  isOfficial,
  instructorName = '',
  onRequireOfficialLogin,
  onPlayMinigameWithClass,
}) => {
  const todayVn = useMemo(() => getTodayVnDateKey(), []);
  const currentYear = Number(todayVn.slice(0, 4)) || new Date().getFullYear();

  const [classes, setClasses] = useState<FixedClassSummary[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [loadingClasses, setLoadingClasses] = useState(false);

  // Period filter state
  const [periodMode, setPeriodMode] = useState<StatsPeriodMode>('ALL');
  const [dayDate, setDayDate] = useState<string>(todayVn);
  const [weekAnchorDate, setWeekAnchorDate] = useState<string>(todayVn);
  const [monthValue, setMonthValue] = useState<string>(todayVn.slice(0, 7));
  const [yearValue, setYearValue] = useState<number>(currentYear);
  const [academicStartYear, setAcademicStartYear] = useState<number>(() => getDefaultAcademicStartYear());
  const [semesterCode, setSemesterCode] = useState<SemesterCode>(() => getDefaultSemesterCode());
  const [customStart, setCustomStart] = useState<string>(todayVn.slice(0, 7) + '-01');
  const [customEnd, setCustomEnd] = useState<string>(todayVn);

  const [summary, setSummary] = useState<ClassPointsSummaryResponse | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [studentSearch, setStudentSearch] = useState('');
  const [selectedStudentCode, setSelectedStudentCode] = useState<string>('');
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Create / Edit Fixed Class Modal
  const [classModalOpen, setClassModalOpen] = useState(false);
  const [editingClassId, setEditingClassId] = useState<string>('');
  const [formTitle, setFormTitle] = useState('');
  const [formClassCode, setFormClassCode] = useState('');
  const [formSemester, setFormSemester] = useState(`HK1 ${getDefaultAcademicStartYear()}-${getDefaultAcademicStartYear() + 1}`);
  const [formRosterText, setFormRosterText] = useState('');
  const [savingClass, setSavingClass] = useState(false);
  const excelInputRef = useRef<HTMLInputElement | null>(null);

  // Quick Manual Point Modal
  const [quickTarget, setQuickTarget] = useState<StudentPointSummary | null>(null);
  const [quickType, setQuickType] = useState<PointLedgerType>('REWARD');
  const [quickPoints, setQuickPoints] = useState<string>('1');
  const [quickReason, setQuickReason] = useState<string>('Phát biểu tích cực');
  const [quickDate, setQuickDate] = useState<string>(todayVn);
  const [savingQuickPoint, setSavingQuickPoint] = useState(false);

  const criteriaList = useMemo(() => readPointCriteria(), []);

  const showToast = useCallback((type: 'ok' | 'err', text: string) => {
    setToast({ type, text });
    window.setTimeout(() => setToast(null), 3500);
  }, []);

  const periodRange = useMemo(
    () =>
      resolvePeriodRange({
        mode: periodMode,
        dayDate,
        weekAnchorDate,
        monthValue,
        yearValue,
        academicStartYear,
        semesterCode,
        customStart,
        customEnd,
      }),
    [
      periodMode,
      dayDate,
      weekAnchorDate,
      monthValue,
      yearValue,
      academicStartYear,
      semesterCode,
      customStart,
      customEnd,
    ],
  );

  const loadClasses = useCallback(
    async (preferClassId?: string) => {
      if (!isOfficial) return;
      setLoadingClasses(true);
      const res = await listFixedClasses();
      setLoadingClasses(false);
      if (!res.ok || !res.data) {
        showToast('err', res.error ?? 'Không thể tải danh sách lớp.');
        return;
      }
      setClasses(res.data);
      const nextId =
        preferClassId ||
        (res.data.some((c) => c.id === selectedClassId) ? selectedClassId : res.data[0]?.id ?? '');
      setSelectedClassId(nextId);
    },
    [isOfficial, selectedClassId, showToast],
  );

  const loadSummary = useCallback(async () => {
    if (!isOfficial || !selectedClassId) {
      setSummary(null);
      return;
    }
    setLoadingSummary(true);
    const res = await fetchClassPointsSummary(
      selectedClassId,
      periodRange.startDate,
      periodRange.endDate,
    );
    setLoadingSummary(false);
    if (!res.ok || !res.data) {
      showToast('err', res.error ?? 'Không thể tải sổ điểm của lớp.');
      return;
    }
    setSummary(res.data);
  }, [isOfficial, selectedClassId, periodRange.startDate, periodRange.endDate, showToast]);

  useEffect(() => {
    if (isOfficial) {
      void loadClasses();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOfficial]);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  const activeClass = useMemo(
    () => classes.find((c) => c.id === selectedClassId) ?? summary?.classItem ?? null,
    [classes, selectedClassId, summary],
  );

  const openCreateClassModal = () => {
    setEditingClassId('');
    setFormTitle('');
    setFormClassCode('');
    setFormSemester(`HK1 ${getDefaultAcademicStartYear()}-${getDefaultAcademicStartYear() + 1}`);
    setFormRosterText('');
    setClassModalOpen(true);
  };

  const openEditClassModal = (cls: FixedClassSummary) => {
    setEditingClassId(cls.id);
    setFormTitle(cls.title);
    setFormClassCode(cls.classCode);
    setFormSemester(cls.semester || '');
    const lines = cls.rosterEntries.map((s) => {
      const fullName = `${s.lastName} ${s.firstName}`.trim();
      return s.studentCode ? `${s.studentCode} - ${fullName}` : fullName;
    });
    setFormRosterText(lines.join('\n'));
    setClassModalOpen(true);
  };

  const handleImportExcelToForm = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const parsed = await parseRosterFromExcelFile(file);
      if (parsed.length === 0) {
        showToast('err', 'Không đọc được danh sách học sinh từ file Excel này.');
        return;
      }
      const lines = parsed.map((s, idx) => {
        const code = s.studentCode || `HS${String(idx + 1).padStart(2, '0')}`;
        return `${code} - ${s.name}`;
      });
      setFormRosterText(lines.join('\n'));
      if (!formTitle.trim()) {
        setFormTitle(file.name.replace(/\.[^.]+$/, ''));
      }
      showToast('ok', `Đã đọc ${parsed.length} học sinh từ file Excel.`);
    } catch {
      showToast('err', 'Lỗi đọc file Excel/CSV.');
    } finally {
      e.target.value = '';
    }
  };

  const parsedFormRoster: AttendanceRosterStudent[] = useMemo(
    () => parseFixedRosterText(formRosterText),
    [formRosterText],
  );

  const handleSaveClass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim()) {
      showToast('err', 'Vui lòng nhập tên lớp cố định.');
      return;
    }
    if (parsedFormRoster.length === 0) {
      showToast('err', 'Vui lòng nhập ít nhất 1 học sinh vào danh sách lớp.');
      return;
    }
    setSavingClass(true);
    const res = await saveFixedClass({
      id: editingClassId || undefined,
      title: formTitle.trim(),
      classCode: formClassCode.trim() || formTitle.trim().slice(0, 16),
      semester: formSemester.trim(),
      instructorName,
      rosterEntries: parsedFormRoster,
    });
    setSavingClass(false);
    if (!res.ok || !res.data) {
      showToast('err', res.error ?? 'Không thể lưu lớp cố định.');
      return;
    }
    setClassModalOpen(false);
    showToast(
      'ok',
      editingClassId
        ? `Đã cập nhật lớp "${res.data.title}" (${res.data.studentCount} học sinh).`
        : `Đã tạo lớp cố định "${res.data.title}" (${res.data.studentCount} học sinh).`,
    );
    await loadClasses(res.data.id);
    if (res.data.id === selectedClassId) {
      await loadSummary();
    }
  };

  const handleDeleteClass = async () => {
    if (!activeClass) return;
    if (
      !window.confirm(
        `Bạn có chắc muốn xóa lớp "${activeClass.title}" cùng toàn bộ lịch sử điểm tích lũy của lớp này?`,
      )
    ) {
      return;
    }
    const res = await deleteFixedClass(activeClass.id);
    if (!res.ok) {
      showToast('err', res.error ?? 'Không thể xóa lớp.');
      return;
    }
    showToast('ok', `Đã xóa lớp "${activeClass.title}".`);
    setSelectedStudentCode('');
    await loadClasses();
  };

  const openQuickAward = (stu: StudentPointSummary, type: PointLedgerType) => {
    setQuickTarget(stu);
    setQuickType(type);
    const defaultCrit = criteriaList.find((c) => c.type === type);
    setQuickPoints(String(defaultCrit?.points ?? 1));
    setQuickReason(
      defaultCrit?.label ?? (type === 'REWARD' ? 'Phát biểu tích cực' : 'Cần tập trung hơn'),
    );
    setQuickDate(todayVn);
  };

  const handleSubmitQuickPoint = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickTarget || !selectedClassId) return;
    const pts = Math.round((Number(quickPoints) || 0) * 100) / 100;
    if (pts <= 0 || pts > 1000) {
      showToast('err', 'Số điểm phải lớn hơn 0.');
      return;
    }
    setSavingQuickPoint(true);
    const res = await recordClassPoints(selectedClassId, [
      {
        studentCode: quickTarget.studentCode,
        studentName: quickTarget.studentName,
        pointType: quickType,
        points: pts,
        reason: quickReason.trim() || (quickType === 'REWARD' ? 'Cộng điểm trực tiếp' : 'Trừ điểm trực tiếp'),
        sourceType: 'MANUAL',
        sourceTitle: 'Sổ Điểm Lớp',
        occurredDate: quickDate || todayVn,
      },
    ]);
    setSavingQuickPoint(false);
    if (!res.ok) {
      showToast('err', res.error ?? 'Không thể lưu điểm.');
      return;
    }
    setQuickTarget(null);
    showToast(
      'ok',
      `Đã ${quickType === 'REWARD' ? 'cộng +' : 'trừ -'}${formatPts(pts)} điểm cho ${quickTarget.studentName}.`,
    );
    await loadSummary();
    await loadClasses(selectedClassId);
  };

  const handleDeleteLedgerEntry = async (entryId: string) => {
    if (!window.confirm('Hoàn tác (xóa) dòng cộng/trừ điểm này khỏi sổ lớp?')) return;
    const res = await deleteClassPointEntry(entryId);
    if (!res.ok) {
      showToast('err', res.error ?? 'Không thể hoàn tác.');
      return;
    }
    showToast('ok', 'Đã hoàn tác dòng điểm.');
    await loadSummary();
    await loadClasses(selectedClassId);
  };

  const filteredStudents = useMemo(() => {
    const list = summary?.students ?? [];
    const q = studentSearch.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (s) =>
        s.studentName.toLowerCase().includes(q) || s.studentCode.toLowerCase().includes(q),
    );
  }, [summary, studentSearch]);

  const filteredEntries = useMemo(() => {
    const list = summary?.entries ?? [];
    if (!selectedStudentCode) return list;
    return list.filter((e) => e.studentCode === selectedStudentCode);
  }, [summary, selectedStudentCode]);

  const topStudent = useMemo(() => {
    const list = summary?.students ?? [];
    if (list.length === 0) return null;
    return list[0].totalEvents > 0 ? list[0] : null;
  }, [summary]);

  const maxTrendVal = useMemo(() => {
    const buckets = summary?.trend ?? [];
    return Math.max(1, ...buckets.map((b) => Math.max(b.reward, b.penalty)));
  }, [summary]);

  // Locked state for non-OFFICIAL / Demo accounts
  if (!isOfficial) {
    return (
      <div className="bg-gradient-to-br from-slate-50 via-indigo-50/50 to-amber-50/40 border border-indigo-200/80 rounded-3xl p-8 text-center max-w-2xl mx-auto space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-indigo-100 text-indigo-700 mx-auto flex items-center justify-center shadow-sm">
          <Lock className="w-8 h-8" />
        </div>
        <h3 className="text-xl font-black text-ink-900">
          Sổ Điểm Lớp Cố Định — Dành riêng cho Tài khoản Giáo viên chính thức
        </h3>
        <p className="text-sm text-ink-600 leading-relaxed">
          Tạo danh sách lớp cố định lưu trên máy chủ (liên thông cùng tab Điểm danh &amp; 40+ Minigame),
          tự động tích lũy điểm cộng/trừ của học sinh xuyên suốt năm học và thống kê theo{' '}
          <strong>Ngày · Tuần · Tháng · Học kỳ · Năm học</strong>.
        </p>
        <div className="pt-2">
          <button
            type="button"
            onClick={onRequireOfficialLogin}
            className="px-6 py-3 rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white text-sm font-extrabold shadow-md inline-flex items-center gap-2"
          >
            <Sparkles className="w-4 h-4" /> Đăng nhập Tài khoản Chính để mở khóa
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {toast && (
        <div
          className={`px-4 py-2.5 rounded-xl text-xs font-bold border flex items-center justify-between ${
            toast.type === 'ok'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          <span>{toast.text}</span>
          <button type="button" onClick={() => setToast(null)} className="opacity-60 hover:opacity-100">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Top Row: Fixed Class Selector & Actions */}
      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-extrabold text-ink-900 flex items-center gap-2">
              <Trophy className="w-4 h-4 text-amber-500" />
              Kho Lớp Cố Định &amp; Sổ Điểm Tích Lũy
            </h3>
            <p className="text-xs text-ink-500 mt-0.5">
              Dùng chung danh sách lớp với Điểm danh QR và 40+ Minigame. Điểm được lưu vĩnh viễn trên máy chủ.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={openCreateClassModal}
              className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-extrabold flex items-center gap-1.5 shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" /> Tạo lớp cố định mới
            </button>
            {activeClass && (
              <>
                <button
                  type="button"
                  onClick={() => openEditClassModal(activeClass)}
                  className="px-3 py-2 rounded-xl bg-white border border-slate-200 hover:border-indigo-300 text-ink-700 text-xs font-bold flex items-center gap-1.5"
                >
                  <Edit3 className="w-3.5 h-3.5" /> Sửa danh sách
                </button>
                {onPlayMinigameWithClass && (
                  <button
                    type="button"
                    onClick={() => onPlayMinigameWithClass(activeClass)}
                    className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white text-xs font-extrabold flex items-center gap-1.5 shadow-sm"
                  >
                    <Gamepad2 className="w-3.5 h-3.5" /> Chơi Minigame tích điểm lớp này
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void handleDeleteClass()}
                  className="p-2 rounded-xl bg-white border border-rose-200 hover:bg-rose-50 text-rose-600 text-xs font-bold"
                  title="Xóa lớp cố định này"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </>
            )}
          </div>
        </div>

        {/* Class Pill List */}
        {loadingClasses ? (
          <div className="text-xs text-ink-500 py-2">Đang tải danh sách lớp cố định...</div>
        ) : classes.length === 0 ? (
          <div className="bg-white border border-dashed border-indigo-300 rounded-xl p-6 text-center space-y-2">
            <Users className="w-8 h-8 text-indigo-400 mx-auto" />
            <div className="text-sm font-bold text-ink-800">Chưa có lớp cố định nào</div>
            <p className="text-xs text-ink-500">
              Bấm <strong>"Tạo lớp cố định mới"</strong> để dán tên học sinh (hoặc tải file Excel) — dùng xuyên suốt cả năm học.
            </p>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {classes.map((c) => {
              const active = c.id === selectedClassId;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    setSelectedClassId(c.id);
                    setSelectedStudentCode('');
                  }}
                  className={`px-3.5 py-2 rounded-xl border text-left transition flex items-center gap-2.5 ${
                    active
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                      : 'bg-white text-ink-800 border-slate-200 hover:border-indigo-300'
                  }`}
                >
                  <div>
                    <div className="text-xs font-extrabold leading-tight">{c.title}</div>
                    <div
                      className={`text-[10px] font-semibold mt-0.5 ${
                        active ? 'text-indigo-100' : 'text-ink-500'
                      }`}
                    >
                      {c.studentCount} học sinh · {c.entryCount} lượt điểm
                    </div>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded-lg text-[11px] font-black ${
                      active
                        ? 'bg-white/20 text-white'
                        : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    }`}
                  >
                    {c.netPoints >= 0 ? '+' : ''}
                    {formatPts(c.netPoints)}đ
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Time Filter + Analytics Body */}
      {activeClass && (
        <>
          {/* Period Filter Bar */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs font-extrabold text-ink-700 flex items-center gap-1 mr-1">
                  <Calendar className="w-3.5 h-3.5 text-indigo-600" /> Thống kê theo:
                </span>
                {PERIOD_TABS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setPeriodMode(t.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                      periodMode === t.id
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'bg-slate-100 text-ink-700 hover:bg-slate-200'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void loadSummary()}
                  disabled={loadingSummary}
                  className="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-ink-700 text-xs font-bold flex items-center gap-1"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingSummary ? 'animate-spin' : ''}`} />
                  Làm mới
                </button>
                <button
                  type="button"
                  disabled={!summary}
                  onClick={() =>
                    summary &&
                    exportClassPointsXlsx(
                      summary.classItem,
                      summary.students,
                      summary.entries,
                      periodRange.label,
                      periodRange.fileSlug,
                    )
                  }
                  className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white text-xs font-extrabold flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" /> Xuất Excel ({periodRange.label})
                </button>
              </div>
            </div>

            {/* Contextual Period Picker */}
            <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-100 text-xs">
              {periodMode === 'DAY' && (
                <label className="flex items-center gap-2 font-bold text-ink-700">
                  <span>Chọn ngày:</span>
                  <input
                    type="date"
                    value={dayDate}
                    onChange={(e) => setDayDate(e.target.value)}
                    className="px-2.5 py-1.5 rounded-lg border border-slate-200 font-semibold"
                  />
                </label>
              )}

              {periodMode === 'WEEK' && (
                <label className="flex items-center gap-2 font-bold text-ink-700">
                  <span>Chọn 1 ngày trong tuần (T2–CN):</span>
                  <input
                    type="date"
                    value={weekAnchorDate}
                    onChange={(e) => setWeekAnchorDate(e.target.value)}
                    className="px-2.5 py-1.5 rounded-lg border border-slate-200 font-semibold"
                  />
                </label>
              )}

              {periodMode === 'MONTH' && (
                <label className="flex items-center gap-2 font-bold text-ink-700">
                  <span>Chọn tháng:</span>
                  <input
                    type="month"
                    value={monthValue}
                    onChange={(e) => setMonthValue(e.target.value)}
                    className="px-2.5 py-1.5 rounded-lg border border-slate-200 font-semibold"
                  />
                </label>
              )}

              {periodMode === 'YEAR' && (
                <label className="flex items-center gap-2 font-bold text-ink-700">
                  <span>Năm dương lịch:</span>
                  <select
                    value={yearValue}
                    onChange={(e) => setYearValue(Number(e.target.value))}
                    className="px-2.5 py-1.5 rounded-lg border border-slate-200 font-semibold bg-white"
                  >
                    {[currentYear - 2, currentYear - 1, currentYear, currentYear + 1].map((y) => (
                      <option key={y} value={y}>
                        Năm {y}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              {(periodMode === 'SEMESTER' || periodMode === 'ACADEMIC_YEAR') && (
                <>
                  <label className="flex items-center gap-2 font-bold text-ink-700">
                    <span>Năm học:</span>
                    <select
                      value={academicStartYear}
                      onChange={(e) => setAcademicStartYear(Number(e.target.value))}
                      className="px-2.5 py-1.5 rounded-lg border border-slate-200 font-semibold bg-white"
                    >
                      {[currentYear - 2, currentYear - 1, currentYear, currentYear + 1].map((y) => (
                        <option key={y} value={y}>
                          {y} – {y + 1}
                        </option>
                      ))}
                    </select>
                  </label>
                  {periodMode === 'SEMESTER' && (
                    <div className="flex items-center gap-1.5">
                      {(
                        [
                          { id: 'HK1', label: 'HK1 (T9–T1)' },
                          { id: 'HK2', label: 'HK2 (T2–T5)' },
                          { id: 'SUMMER', label: 'Hè (T6–T8)' },
                        ] as const
                      ).map((sem) => (
                        <button
                          key={sem.id}
                          type="button"
                          onClick={() => setSemesterCode(sem.id)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-bold border ${
                            semesterCode === sem.id
                              ? 'bg-amber-500 text-white border-amber-500'
                              : 'bg-white text-ink-700 border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          {sem.label}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}

              {periodMode === 'CUSTOM' && (
                <div className="flex flex-wrap items-center gap-2 font-bold text-ink-700">
                  <span>Từ ngày:</span>
                  <input
                    type="date"
                    value={customStart}
                    onChange={(e) => setCustomStart(e.target.value)}
                    className="px-2.5 py-1 rounded-lg border border-slate-200 font-semibold"
                  />
                  <span>đến:</span>
                  <input
                    type="date"
                    value={customEnd}
                    onChange={(e) => setCustomEnd(e.target.value)}
                    className="px-2.5 py-1 rounded-lg border border-slate-200 font-semibold"
                  />
                </div>
              )}

              <span className="ml-auto text-[11px] font-bold text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-lg">
                Kỳ đang xem: {periodRange.label}
                {periodRange.startDate && periodRange.endDate
                  ? ` (${formatDateVi(periodRange.startDate)} → ${formatDateVi(periodRange.endDate)})`
                  : ''}
              </span>
            </div>
          </div>

          {/* 4 KPI Summary Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-emerald-50/70 border border-emerald-200 rounded-2xl p-4">
              <div className="text-[11px] font-bold uppercase text-emerald-700">Tổng điểm thưởng</div>
              <div className="text-2xl font-black text-emerald-700 mt-1">
                +{formatPts(summary?.totals.totalReward ?? 0)}
              </div>
              <div className="text-[11px] text-emerald-600 mt-0.5">
                {summary?.totals.activeStudents ?? 0}/{summary?.totals.rosterCount ?? activeClass.studentCount} em đã có điểm
              </div>
            </div>
            <div className="bg-rose-50/70 border border-rose-200 rounded-2xl p-4">
              <div className="text-[11px] font-bold uppercase text-rose-700">Tổng điểm trừ</div>
              <div className="text-2xl font-black text-rose-700 mt-1">
                -{formatPts(summary?.totals.totalPenalty ?? 0)}
              </div>
              <div className="text-[11px] text-rose-600 mt-0.5">
                {summary?.totals.totalEvents ?? 0} lượt chấm điểm trong kỳ
              </div>
            </div>
            <div className="bg-indigo-50/70 border border-indigo-200 rounded-2xl p-4">
              <div className="text-[11px] font-bold uppercase text-indigo-700">Tổng điểm ròng lớp</div>
              <div className="text-2xl font-black text-indigo-700 mt-1">
                {(summary?.totals.netTotal ?? 0) >= 0 ? '+' : ''}
                {formatPts(summary?.totals.netTotal ?? 0)}
              </div>
              <div className="text-[11px] text-indigo-600 mt-0.5">
                Điểm thưởng − Điểm trừ
              </div>
            </div>
            <div className="bg-amber-50/70 border border-amber-200 rounded-2xl p-4">
              <div className="text-[11px] font-bold uppercase text-amber-700 flex items-center gap-1">
                <Award className="w-3.5 h-3.5" /> Dẫn đầu kỳ này
              </div>
              <div className="text-base font-black text-amber-900 mt-1 truncate">
                {topStudent ? topStudent.studentName : 'Chưa có dữ liệu'}
              </div>
              <div className="text-[11px] text-amber-700 font-bold mt-0.5">
                {topStudent
                  ? `${topStudent.netPoints >= 0 ? '+' : ''}${formatPts(topStudent.netPoints)} điểm (${topStudent.totalEvents} lượt)`
                  : 'Chơi Minigame hoặc cộng điểm để bắt đầu'}
              </div>
            </div>
          </div>

          {/* Trend Bar Chart */}
          {summary && summary.trend.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-extrabold text-ink-900 flex items-center gap-1.5">
                  <BarChart3 className="w-4 h-4 text-indigo-600" />
                  Biểu đồ xu hướng tích điểm ({summary.granularity === 'MONTH' ? 'theo Tháng' : 'theo Ngày'})
                </h4>
                <div className="flex items-center gap-3 text-[11px] font-bold">
                  <span className="flex items-center gap-1 text-emerald-700">
                    <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 inline-block" /> Điểm thưởng
                  </span>
                  <span className="flex items-center gap-1 text-rose-700">
                    <span className="w-2.5 h-2.5 rounded-sm bg-rose-400 inline-block" /> Điểm trừ
                  </span>
                </div>
              </div>
              <div className="flex items-end gap-2 h-36 overflow-x-auto pb-1 pt-4">
                {summary.trend.map((b) => {
                  const rH = Math.max(b.reward > 0 ? 8 : 0, Math.round((b.reward / maxTrendVal) * 100));
                  const pH = Math.max(b.penalty > 0 ? 8 : 0, Math.round((b.penalty / maxTrendVal) * 100));
                  return (
                    <div
                      key={b.bucket}
                      className="flex flex-col items-center min-w-[44px] flex-1 max-w-[72px] h-full justify-end group"
                      title={`${formatDateVi(b.bucket)}: +${formatPts(b.reward)} / -${formatPts(b.penalty)} (${b.count} lượt)`}
                    >
                      <div className="w-full flex items-end justify-center gap-1 h-24">
                        <div
                          className="w-3.5 rounded-t-md bg-emerald-500 transition-all"
                          style={{ height: `${rH}%` }}
                        />
                        {b.penalty > 0 && (
                          <div
                            className="w-3.5 rounded-t-md bg-rose-400 transition-all"
                            style={{ height: `${pH}%` }}
                          />
                        )}
                      </div>
                      <div className="text-[10px] font-bold text-ink-500 mt-1.5 truncate max-w-full">
                        {b.bucket.length === 10 ? b.bucket.slice(5).split('-').reverse().join('/') : formatDateVi(b.bucket)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Main 2-Column Content: Leaderboard + History Ledger */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
            {/* Leaderboard Table */}
            <div className="xl:col-span-7 bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-sm font-extrabold text-ink-900 flex items-center gap-1.5">
                  <Trophy className="w-4 h-4 text-amber-500" />
                  Bảng xếp hạng tích lũy ({filteredStudents.length} học sinh)
                </h4>
                <div className="relative w-full sm:w-56">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={studentSearch}
                    onChange={(e) => setStudentSearch(e.target.value)}
                    placeholder="Tìm tên hoặc mã HS..."
                    className="w-full pl-8 pr-3 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="overflow-x-auto max-h-[460px] overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 text-ink-600 sticky top-0 z-10">
                    <tr>
                      <th className="py-2 px-2 text-center font-extrabold w-12">Hạng</th>
                      <th className="py-2 px-2 text-left font-extrabold">Học sinh</th>
                      <th className="py-2 px-2 text-right font-extrabold text-emerald-700">Thưởng</th>
                      <th className="py-2 px-2 text-right font-extrabold text-rose-700">Trừ</th>
                      <th className="py-2 px-2 text-right font-extrabold text-indigo-700">Tổng</th>
                      <th className="py-2 px-2 text-right font-extrabold">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredStudents.map((s, idx) => {
                      const isSel = selectedStudentCode === s.studentCode;
                      const medal =
                        idx === 0 && s.netPoints > 0
                          ? '🥇'
                          : idx === 1 && s.netPoints > 0
                            ? '🥈'
                            : idx === 2 && s.netPoints > 0
                              ? '🥉'
                              : `#${idx + 1}`;
                      return (
                        <tr
                          key={s.studentCode}
                          onClick={() =>
                            setSelectedStudentCode(isSel ? '' : s.studentCode)
                          }
                          className={`cursor-pointer transition ${
                            isSel ? 'bg-indigo-50/80' : 'hover:bg-slate-50'
                          }`}
                        >
                          <td className="py-2 px-2 text-center font-black">{medal}</td>
                          <td className="py-2 px-2">
                            <div className="font-bold text-ink-900">{s.studentName}</div>
                            <div className="text-[10px] text-ink-500">
                              {s.studentCode} · {s.totalEvents} lượt
                            </div>
                          </td>
                          <td className="py-2 px-2 text-right font-bold text-emerald-700">
                            +{formatPts(s.rewardPoints)}
                          </td>
                          <td className="py-2 px-2 text-right font-bold text-rose-600">
                            {s.penaltyPoints > 0 ? `-${formatPts(s.penaltyPoints)}` : '0'}
                          </td>
                          <td className="py-2 px-2 text-right font-black text-indigo-700">
                            {s.netPoints >= 0 ? '+' : ''}
                            {formatPts(s.netPoints)}
                          </td>
                          <td
                            className="py-2 px-2 text-right"
                            onClick={(ev) => ev.stopPropagation()}
                          >
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => openQuickAward(s, 'REWARD')}
                                className="p-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700"
                                title="Cộng điểm trực tiếp"
                              >
                                <PlusCircle className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => openQuickAward(s, 'PENALTY')}
                                className="p-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600"
                                title="Trừ điểm trực tiếp"
                              >
                                <MinusCircle className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Detailed History Ledger */}
            <div className="xl:col-span-5 bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-sm font-extrabold text-ink-900 flex items-center gap-1.5">
                  <History className="w-4 h-4 text-indigo-600" />
                  Lịch sử cộng/trừ ({filteredEntries.length})
                </h4>
                {selectedStudentCode && (
                  <button
                    type="button"
                    onClick={() => setSelectedStudentCode('')}
                    className="text-[11px] font-bold px-2 py-1 rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
                  >
                    Đang lọc: {selectedStudentCode} ×
                  </button>
                )}
              </div>

              {filteredEntries.length === 0 ? (
                <div className="py-12 text-center text-xs text-ink-500">
                  Chưa có lượt cộng/trừ điểm nào trong kỳ <strong>{periodRange.label}</strong>.
                </div>
              ) : (
                <div className="space-y-2 max-h-[460px] overflow-y-auto pr-1">
                  {filteredEntries.map((entry) => (
                    <div
                      key={entry.id}
                      className="p-2.5 rounded-xl border border-slate-200 bg-slate-50/60 flex items-start justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span
                            className={`px-2 py-0.5 rounded-md text-[11px] font-black ${
                              entry.pointType === 'REWARD'
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-rose-100 text-rose-800'
                            }`}
                          >
                            {entry.pointType === 'REWARD' ? '+' : '-'}
                            {formatPts(entry.deltaPoints)}đ
                          </span>
                          <span className="text-xs font-extrabold text-ink-900 truncate">
                            {entry.studentName}
                          </span>
                          <span className="text-[10px] text-ink-500 font-semibold">
                            ({entry.studentCode})
                          </span>
                        </div>
                        <div className="text-[11px] text-ink-700 font-medium mt-1">
                          {entry.reason || 'Chấm điểm'}
                        </div>
                        <div className="text-[10px] text-ink-500 mt-0.5">
                          📅 {formatDateVi(entry.occurredDate)} ·{' '}
                          {entry.sourceTitle || (entry.sourceType === 'MANUAL' ? 'Sổ Điểm Lớp' : 'Minigame')}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleDeleteLedgerEntry(entry.id)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 shrink-0"
                        title="Hoàn tác / Xóa dòng điểm này"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Modal: Create / Edit Fixed Class */}
      {classModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveClass}
            className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-xl p-6 space-y-4 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-black text-ink-900">
                {editingClassId ? '✏️ Chỉnh sửa Lớp cố định' : '➕ Tạo Lớp cố định mới'}
              </h3>
              <button
                type="button"
                onClick={() => setClassModalOpen(false)}
                className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-ink-700 mb-1">
                  Tên lớp cố định *
                </label>
                <input
                  type="text"
                  required
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="VD: Lớp 3A1 - Cô Lan hoặc Kinh tế Vi mô - Nhóm 02"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-ink-700 mb-1">Mã lớp (ngắn)</label>
                <input
                  type="text"
                  value={formClassCode}
                  onChange={(e) => setFormClassCode(e.target.value)}
                  placeholder="VD: 3A1"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-ink-700 mb-1">Học kỳ / Năm học</label>
                <input
                  type="text"
                  value={formSemester}
                  onChange={(e) => setFormSemester(e.target.value)}
                  placeholder="VD: Năm học 2026-2027"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <label className="text-xs font-bold text-ink-700">
                  Danh sách học sinh ({parsedFormRoster.length} em) *
                </label>
                <div>
                  <input
                    ref={excelInputRef}
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    onChange={handleImportExcelToForm}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => excelInputRef.current?.click()}
                    className="px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[11px] font-bold inline-flex items-center gap-1"
                  >
                    <Upload className="w-3 h-3" /> Tải từ Excel / CSV
                  </button>
                </div>
              </div>
              <textarea
                rows={8}
                value={formRosterText}
                onChange={(e) => setFormRosterText(e.target.value)}
                placeholder={
                  'Dán mỗi dòng 1 học sinh (không cần MSSV cũng được — hệ thống tự cấp mã HS01, HS02... để phân biệt em trùng tên):\nNguyễn Minh Anh\nTrần Hoàng Bảo\nLê Thảo Chi'
                }
                className="w-full p-3 rounded-xl border border-slate-200 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <p className="text-[11px] text-ink-500">
                Mẹo: Khi sửa danh sách giữa năm học, giữ nguyên mã (VD <code>HS01 - ...</code>) để bảo toàn toàn bộ điểm đã tích lũy.
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setClassModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-ink-700 text-xs font-bold"
              >
                Hủy
              </button>
              <button
                type="submit"
                disabled={savingClass}
                className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-extrabold"
              >
                {savingClass ? 'Đang lưu...' : editingClassId ? 'Lưu thay đổi' : 'Tạo lớp cố định'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal: Quick Manual Point Award / Deduct */}
      {quickTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleSubmitQuickPoint}
            className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-md p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-black text-ink-900">
                  {quickType === 'REWARD' ? '🌸 Cộng điểm trực tiếp' : '⚡ Trừ điểm trực tiếp'}
                </h3>
                <p className="text-xs text-ink-500 font-semibold mt-0.5">
                  {quickTarget.studentName} ({quickTarget.studentCode})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setQuickTarget(null)}
                className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1 rounded-xl text-xs font-extrabold">
              <button
                type="button"
                onClick={() => setQuickType('REWARD')}
                className={`py-1.5 rounded-lg ${
                  quickType === 'REWARD' ? 'bg-emerald-600 text-white' : 'text-ink-600'
                }`}
              >
                🌸 Điểm thưởng (+)
              </button>
              <button
                type="button"
                onClick={() => setQuickType('PENALTY')}
                className={`py-1.5 rounded-lg ${
                  quickType === 'PENALTY' ? 'bg-rose-600 text-white' : 'text-ink-600'
                }`}
              >
                ⚡ Điểm trừ (-)
              </button>
            </div>

            {/* Quick criterion presets */}
            <div className="flex flex-wrap gap-1.5">
              {criteriaList
                .filter((c) => c.type === quickType)
                .slice(0, 6)
                .map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      setQuickPoints(String(c.points));
                      setQuickReason(c.label);
                    }}
                    className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-indigo-50 text-[11px] font-bold text-ink-700"
                  >
                    {c.icon} {quickType === 'REWARD' ? '+' : '-'}
                    {c.points} · {c.label}
                  </button>
                ))}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-ink-700 mb-1">Số điểm *</label>
                <input
                  type="number"
                  step="0.5"
                  min="0.5"
                  max="100"
                  required
                  value={quickPoints}
                  onChange={(e) => setQuickPoints(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm font-black"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-ink-700 mb-1">Ngày ghi nhận</label>
                <input
                  type="date"
                  value={quickDate}
                  onChange={(e) => setQuickDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-ink-700 mb-1">Lý do / Ghi chú</label>
              <input
                type="text"
                value={quickReason}
                onChange={(e) => setQuickReason(e.target.value)}
                placeholder="VD: Phát biểu xây dựng bài..."
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold"
              />
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setQuickTarget(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 text-ink-700 text-xs font-bold"
              >
                Hủy
              </button>
              <button
                type="submit"
                disabled={savingQuickPoint}
                className={`px-5 py-2 rounded-xl text-white text-xs font-extrabold disabled:opacity-50 ${
                  quickType === 'REWARD'
                    ? 'bg-emerald-600 hover:bg-emerald-700'
                    : 'bg-rose-600 hover:bg-rose-700'
                }`}
              >
                {savingQuickPoint ? 'Đang lưu...' : 'Xác nhận lưu'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
