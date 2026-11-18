import React, { useEffect, useRef, useState } from 'react';
import {
  AlertOctagon,
  CheckCircle2,
  Clock,
  Download,
  FileSpreadsheet,
  FileText,
  Mail,
  MapPin,
  MonitorSmartphone,
  Play,
  Plus,
  Printer,
  Radio,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldAlert,
  StopCircle,
  Trash2,
  Upload,
  Users,
  XCircle,
} from 'lucide-react';
import type { Exam, ExamAttempt, StudentRosterEntry } from '../../types/exam';
import { exportExamGradebookXlsx } from '../../utils/csvExport';
import { computeChapterMastery } from '../../utils/dynamicQuestionEngine';
import { InfoHint } from '../common/InfoHint';
import { PaginationBar, paginateSlice } from '../common/PaginationBar';
import {
  downloadStudentRosterTemplateXlsx,
  parseStudentRosterXlsx,
} from '../../utils/studentRosterXlsx';

interface LiveProctorTableProps {
  exam: Exam;
  attempts: ExamAttempt[];
  onProctorDecision: (
    attemptId: string,
    decision: 'ACCEPT_KEEP' | 'ACCEPT_COMPENSATE' | 'REJECT',
    extraSeconds?: number,
  ) => void;
  onResetDevice: (attemptId: string) => void;
  onAddBonusTime: (attemptId: string, extraSeconds: number) => void;
  onCloseExamAndSweep: (examId: string) => void;
  onOpenEssayReview: (attemptId: string) => void;
  onResendEmail: (attemptId: string, editedEmail?: string) => void;
  onUpdateRoster?: (examId: string, entries: StudentRosterEntry[]) => void;
  onChangeExamStatus?: (nextStatus: 'WAITING' | 'OPEN') => void;
}

export const LiveProctorTable: React.FC<LiveProctorTableProps> = ({
  exam,
  attempts,
  onProctorDecision,
  onResetDevice,
  onAddBonusTime,
  onCloseExamAndSweep,
  onOpenEssayReview,
  onResendEmail,
  onUpdateRoster,
  onChangeExamStatus,
}) => {
  const [tickNow, setTickNow] = useState(Date.now());
  const [editingEmailId, setEditingEmailId] = useState<string | null>(null);
  const [emailDraft, setEmailDraft] = useState('');
  const [showRosterTable, setShowRosterTable] = useState(false);
  const [rosterSearch, setRosterSearch] = useState('');
  const [rosterPage, setRosterPage] = useState(1);
  const [rosterPageSize, setRosterPageSize] = useState(15);
  const [showProctorReportModal, setShowProctorReportModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<
    'ALL' | 'IN_PROGRESS' | 'LOCKED' | 'SUBMITTED' | 'ALERTS' | 'ABSENT'
  >('ALL');
  const [classFilter, setClassFilter] = useState('ALL');
  const [sortBy, setSortBy] = useState<
    'DEFAULT' | 'CODE' | 'SCORE_DESC' | 'SCORE_ASC' | 'LEAVES_DESC'
  >('DEFAULT');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [rosterNotice, setRosterNotice] = useState<{
    type: 'ok' | 'err';
    text: string;
  } | null>(null);
  const rosterFileRef = useRef<HTMLInputElement | null>(null);

  const rosterEntries = exam.rosterEntries ?? [];

  const handleRosterFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const { entries, errors } = await parseStudentRosterXlsx(file);
    if (entries.length === 0) {
      setRosterNotice({
        type: 'err',
        text: errors[0] || 'Không đọc được danh sách sinh viên hợp lệ từ file.',
      });
      return;
    }
    onUpdateRoster?.(exam.id, entries);
    setShowRosterTable(true);
    setRosterNotice({
      type: 'ok',
      text:
        errors.length > 0
          ? `Đã import ${entries.length} sinh viên (bỏ qua ${errors.length} dòng lỗi: ${errors[0]}).`
          : `Đã import ${entries.length} sinh viên. Sinh viên vào phòng thi bắt buộc nhập đúng Mã SV, Họ đệm, Tên, Giới tính, Ngày sinh.`,
    });
  };

  useEffect(() => {
    const id = window.setInterval(() => setTickNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const examAttempts = attempts.filter((a) => a.examId === exam.id);
  const lockedQueue = examAttempts.filter((a) => a.status === 'LOCKED');

  const haversineMeters = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
    const R = 6371000;
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
  };

  const formatDist = (meters: number): string =>
    meters >= 1000 ? `${(meters / 1000).toFixed(2)} km` : `${meters} m`;

  const locatedAttempts = examAttempts.filter(
    (a) => typeof a.locationLat === 'number' && typeof a.locationLng === 'number',
  );
  const medianCoords = (() => {
    if (locatedAttempts.length < 2) return null;
    const lats = locatedAttempts.map((a) => a.locationLat as number).sort((x, y) => x - y);
    const lngs = locatedAttempts.map((a) => a.locationLng as number).sort((x, y) => x - y);
    const mid = Math.floor(lats.length / 2);
    return { lat: lats[mid], lng: lngs[mid] };
  })();

  const FAR_LOCATION_METERS = 200;
  const distanceByAttemptId = new Map<string, number>();
  if (medianCoords) {
    for (const a of locatedAttempts) {
      distanceByAttemptId.set(
        a.id,
        haversineMeters(
          medianCoords.lat,
          medianCoords.lng,
          a.locationLat as number,
          a.locationLng as number,
        ),
      );
    }
  }

  const farLocationAttempts = examAttempts.filter(
    (a) => (distanceByAttemptId.get(a.id) ?? 0) > FAR_LOCATION_METERS,
  );
  const isMultiDeviceAttempt = (a: ExamAttempt): boolean =>
    (a.loginDevices?.length ?? 0) > 1 ||
    a.violations.some(
      (v) => v.eventType === 'SECOND_DEVICE_LOGIN' || v.eventType === 'DUPLICATE_LOGIN',
    );
  const multiDeviceAttempts = examAttempts.filter(isMultiDeviceAttempt);

  const joinedCodeSet = new Set(examAttempts.map((a) => a.studentCode.trim().toUpperCase()));
  const absentRosterStudents = rosterEntries.filter(
    (entry) => !joinedCodeSet.has(entry.studentCode.trim().toUpperCase()),
  );
  const classOptions = Array.from(
    new Set(examAttempts.map((a) => a.className.trim()).filter(Boolean)),
  ).sort((a, b) => a.localeCompare(b, 'vi'));

  const normalizedSearch = searchQuery.trim().toLowerCase();
  const filteredAttemptsRaw = examAttempts.filter((a) => {
    if (filterMode === 'IN_PROGRESS' && a.status !== 'IN_PROGRESS' && a.status !== 'LOCKED') {
      return false;
    }
    if (filterMode === 'LOCKED' && a.status !== 'LOCKED') {
      return false;
    }
    if (
      filterMode === 'SUBMITTED' &&
      a.status !== 'SUBMITTED' &&
      a.status !== 'AUTO_SUBMITTED'
    ) {
      return false;
    }
    if (
      filterMode === 'ALERTS' &&
      !isMultiDeviceAttempt(a) &&
      (distanceByAttemptId.get(a.id) ?? 0) <= FAR_LOCATION_METERS &&
      !a.aiFlag
    ) {
      return false;
    }
    if (classFilter !== 'ALL' && a.className.trim() !== classFilter) {
      return false;
    }
    if (!normalizedSearch) return true;
    return (
      a.studentCode.toLowerCase().includes(normalizedSearch) ||
      a.studentName.toLowerCase().includes(normalizedSearch) ||
      a.className.toLowerCase().includes(normalizedSearch)
    );
  });

  const filteredAttempts = (() => {
    if (sortBy === 'CODE') {
      return [...filteredAttemptsRaw].sort((a, b) =>
        a.studentCode.localeCompare(b.studentCode, 'vi'),
      );
    }
    if (sortBy === 'SCORE_DESC') {
      return [...filteredAttemptsRaw].sort((a, b) => b.scale10Score - a.scale10Score);
    }
    if (sortBy === 'SCORE_ASC') {
      return [...filteredAttemptsRaw].sort((a, b) => a.scale10Score - b.scale10Score);
    }
    if (sortBy === 'LEAVES_DESC') {
      return [...filteredAttemptsRaw].sort(
        (a, b) => b.leaveCount - a.leaveCount || b.totalAwaySeconds - a.totalAwaySeconds,
      );
    }
    return filteredAttemptsRaw;
  })();

  const { pageItems: pagedAttempts, safePage } = paginateSlice(
    filteredAttempts,
    page,
    pageSize,
  );

  const filteredAbsentRoster = absentRosterStudents.filter((st) =>
    !normalizedSearch
      ? true
      : st.studentCode.toLowerCase().includes(normalizedSearch) ||
        `${st.lastName} ${st.firstName}`.toLowerCase().includes(normalizedSearch),
  );
  const { pageItems: pagedAbsentRoster, safePage: safeAbsentPage } = paginateSlice(
    filteredAbsentRoster,
    page,
    pageSize,
  );

  const normalizedRosterSearch = rosterSearch.trim().toLowerCase();
  const filteredRosterList = rosterEntries.filter((st) =>
    !normalizedRosterSearch
      ? true
      : st.studentCode.toLowerCase().includes(normalizedRosterSearch) ||
        `${st.lastName} ${st.firstName}`.toLowerCase().includes(normalizedRosterSearch),
  );
  const { pageItems: pagedRosterList, safePage: safeRosterPage } = paginateSlice(
    filteredRosterList,
    rosterPage,
    rosterPageSize,
  );

  const countInProgress = examAttempts.filter((a) => a.status === 'IN_PROGRESS').length;
  const countLocked = lockedQueue.length;
  const countAiFlagged = examAttempts.filter((a) => a.aiFlag).length;
  const countSubmitted = examAttempts.filter(
    (a) => a.status === 'SUBMITTED' || a.status === 'AUTO_SUBMITTED',
  ).length;

  const getWaitSeconds = (a: ExamAttempt) => {
    if (!a.lockedAt) return a.lockedWaitSeconds;
    return (
      a.lockedWaitSeconds +
      Math.max(0, Math.round((tickNow - new Date(a.lockedAt).getTime()) / 1000))
    );
  };

  return (
    <div className="space-y-5">
      {exam.status === 'WAITING' && onChangeExamStatus && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 shadow-soft">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2 text-sm font-extrabold text-indigo-950">
              <Radio className="w-4 h-4 text-emerald-600 animate-pulse shrink-0" />
              <span>
                Phòng chờ Điểm danh đang mở ({countInProgress} sinh viên đã có mặt, chưa phát đề)
              </span>
            </div>
            <p className="text-xs text-indigo-800">
              Sinh viên đang ở Phòng chờ để đối chiếu danh sách &amp; GPS (chưa thấy câu hỏi và chưa tính giờ). Khi cả lớp đã vào đủ, bấm nút bên phải để phát đề và bắt đầu đếm giờ đồng loạt.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onChangeExamStatus('OPEN')}
            className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold flex items-center gap-1.5 shadow-sm transition shrink-0"
          >
            <Play className="w-4 h-4" />
            <span>Phát đề &amp; Bắt đầu tính giờ đồng loạt</span>
          </button>
        </div>
      )}

      {/* Live Status Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border border-slate-200 p-3.5 shadow-soft">
          <div className="text-[11px] font-bold text-support-700 uppercase flex items-center gap-1">
            <span>{exam.status === 'WAITING' ? 'Đang ở phòng chờ' : 'Đang làm bài'}</span>
            <InfoHint
              title="Thí sinh đang làm bài bình thường"
              text="Số lượng sinh viên đã nhập mã PIN vào phòng thi và đang làm bài trên màn hình."
            />
          </div>
          <div className="text-2xl font-mono font-extrabold text-ink-900 mt-1">
            {countInProgress}
          </div>
        </div>
        <div className="bg-white rounded-xl border border-rose-200 p-3.5 shadow-soft">
          <div className="text-[11px] font-bold text-rose-700 uppercase flex items-center gap-1">
            <span>Khóa chờ duyệt (LOCKED)</span>
            <InfoHint
              title="Sinh viên bị tạm khóa do rời màn hình"
              text={
                '• Khi sinh viên thoát khỏi màn hình thi vượt quá số lần hoặc số giây cho phép, bài thi sẽ tự khóa lại.\n• Sinh viên sẽ xuất hiện ngay ở bảng đỏ bên dưới để thầy/cô xem giải trình và quyết định cho thi tiếp hay thu bài.'
              }
            />
          </div>
          <div className="text-2xl font-mono font-extrabold text-rose-700 mt-1">
            {countLocked}
          </div>
        </div>
        <div className="bg-white rounded-xl border border-amber-200 p-3.5 shadow-soft">
          <div className="text-[11px] font-bold text-amber-700 uppercase flex items-center gap-1">
            <span>Cờ nghi vấn AI / Máy 2</span>
            <InfoHint
              title="Cảnh báo dấu hiệu gian lận"
              text={
                '• Đếm số bài bị hệ thống gắn cờ nghi ngờ (dính bẫy ChatGPT/AI Honeypot hoặc có dấu hiệu đăng nhập từ máy/trình duyệt thứ hai).\n• Thầy/cô bấm vào nút "Cảnh báo" ở bảng dưới để lọc nhanh các em này.'
              }
            />
          </div>
          <div className="text-2xl font-mono font-extrabold text-amber-700 mt-1">
            {countAiFlagged}
          </div>
        </div>
        <div className="bg-white rounded-xl border border-brand-200 p-3.5 shadow-soft">
          <div className="text-[11px] font-bold text-brand-700 uppercase flex items-center gap-1">
            <span>Đã nộp / Thu bài</span>
            <InfoHint
              title="Bài thi đã hoàn tất"
              text="Bao gồm các sinh viên đã bấm Nộp bài, hết giờ tự thu hoặc bị giảng viên bấm Reject (Thu bài)."
            />
          </div>
          <div className="text-2xl font-mono font-extrabold text-brand-700 mt-1">
            {countSubmitted}
          </div>
        </div>
      </div>

      {/* Exam Control Bar */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-wrap items-center justify-between gap-3 shadow-soft">
        <div className="flex items-center gap-2 text-xs text-ink-700 flex-wrap">
          <RefreshCw className="w-4 h-4 text-support-600 animate-spin shrink-0" />
          <span className="inline-flex items-center gap-1 flex-wrap">
            <span>Live Sync đang chạy • PIN phòng thi:</span>
            <strong className="font-mono text-brand-700">{exam.roomPin}</strong>
            <InfoHint
              title="PIN phòng thi (6 số)"
              text={
                '• Mã gồm 6 chữ số để thầy/cô đọc hoặc chiếu lên bảng.\n• Sinh viên mở trang web thi, nhập mã này kèm Họ tên, MSSV, Ngày sinh để vào đúng ca thi.'
              }
            />
            <span>• PIN cứu hộ:</span>
            <strong className="font-mono">{exam.unlockPin}</strong>
            <InfoHint
              title="PIN cứu hộ (Mở khóa tại chỗ)"
              text={
                '• Mã bí mật chỉ giảng viên giữ (không công khai).\n• Nếu máy giám sát mất mạng hoặc sinh viên ngồi ngay bàn đầu bị khóa màn hình (VD: lỡ chạm nhầm thông báo), thầy/cô chỉ cần nhập mã này ngay trên điện thoại/máy của em đó để mở khóa thi tiếp tức thì.'
              }
            />
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {exam.status === 'DRAFT' && onChangeExamStatus && (
            <>
              <button
                type="button"
                onClick={() => onChangeExamStatus('WAITING')}
                className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition"
              >
                <Radio className="w-3.5 h-3.5" />
                <span>Mở Phòng chờ Điểm danh</span>
              </button>
              <button
                type="button"
                onClick={() => onChangeExamStatus('OPEN')}
                className="px-3.5 py-2 rounded-xl bg-support-600 hover:bg-support-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition"
              >
                <Play className="w-3.5 h-3.5" />
                <span>Mở đề thi ngay</span>
              </button>
            </>
          )}
          {(countInProgress + countLocked) > 0 && (
            <>
              <button
                type="button"
                onClick={() => {
                  const activeTargets = examAttempts.filter(
                    (a) => a.status === 'IN_PROGRESS' || a.status === 'LOCKED' || a.status === 'PAUSED',
                  );
                  if (!window.confirm(`Cộng thêm +2 phút (120s) cho toàn bộ ${activeTargets.length} sinh viên đang thi trong ca?`)) return;
                  for (const a of activeTargets) {
                    onAddBonusTime(a.id, 120);
                  }
                }}
                className="px-3 py-2 rounded-xl border border-brand-200 bg-brand-50 hover:bg-brand-100 text-brand-700 text-xs font-bold flex items-center gap-1 transition"
                title="Cộng thêm 2 phút cho tất cả thí sinh đang làm bài (hữu ích khi rớt mạng cả lớp)"
              >
                <Clock className="w-3.5 h-3.5" />
                <span>+2p cả ca</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  const activeTargets = examAttempts.filter(
                    (a) => a.status === 'IN_PROGRESS' || a.status === 'LOCKED' || a.status === 'PAUSED',
                  );
                  if (!window.confirm(`Cộng thêm +5 phút (300s) cho toàn bộ ${activeTargets.length} sinh viên đang thi trong ca?`)) return;
                  for (const a of activeTargets) {
                    onAddBonusTime(a.id, 300);
                  }
                }}
                className="px-3 py-2 rounded-xl border border-brand-200 bg-brand-50 hover:bg-brand-100 text-brand-700 text-xs font-bold flex items-center gap-1 transition"
                title="Cộng thêm 5 phút cho tất cả thí sinh đang làm bài"
              >
                <Clock className="w-3.5 h-3.5" />
                <span>+5p cả ca</span>
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => setShowProctorReportModal(true)}
            className="px-3.5 py-2 rounded-xl border border-slate-300 bg-white hover:border-brand-400 text-ink-800 text-xs font-bold flex items-center gap-1.5 transition"
          >
            <Printer className="w-4 h-4 text-brand-600" />
            <span>Biên bản Coi thi (A4)</span>
          </button>
          <button
            type="button"
            onClick={() =>
              exportExamGradebookXlsx(
                exam,
                attempts,
                computeChapterMastery(attempts, exam.id),
              )
            }
            className="px-3.5 py-2 rounded-xl border border-support-300 bg-support-50 hover:bg-support-100 text-support-800 text-xs font-bold flex items-center gap-1.5 transition"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Xuất Bảng điểm (.xlsx)</span>
          </button>
          <button
            type="button"
            disabled={exam.status === 'CLOSED'}
            onClick={() => {
              const activeCount = countInProgress + countLocked;
              const msg =
                activeCount > 0
                  ? `Hiện còn ${activeCount} thí sinh đang làm bài/chờ duyệt. Xác nhận KẾT THÚC ca thi, thu toàn bộ bài đang làm và gửi Email tổng hợp?`
                  : 'Xác nhận KẾT THÚC ca thi này và gửi bảng điểm tổng hợp về Email giảng viên?';
              if (!window.confirm(msg)) return;
              onCloseExamAndSweep(exam.id);
            }}
            className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:bg-slate-300 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition"
          >
            <StopCircle className="w-4 h-4" />
            <span>
              {exam.status === 'CLOSED'
                ? 'Ca thi đã đóng & Gửi Email tổng hợp'
                : 'Kết thúc Ca thi (Sweeper thu bài treo + Gửi Email Tổng hợp)'}
            </span>
            <InfoHint
              title="Kết thúc Ca thi & Thu bài hàng loạt"
              text={
                '• Đóng phòng thi không cho ai vào thêm.\n• Tự động gom toàn bộ bài sinh viên đang làm dở hoặc đang bị khóa (không mất dữ liệu đã chọn).\n• Tính điểm tổng hợp cả lớp và gửi tự động về Email giảng viên.'
              }
            />
          </button>
        </div>
      </div>

      {/* Student Roster Import & Verification Card */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3 shadow-soft">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2 text-xs font-extrabold text-ink-900 flex-wrap">
              <Users className="w-4 h-4 text-brand-600" />
              <span>Danh sách Sinh viên Ca thi (Xác thực thông tin khi vào phòng)</span>
              <InfoHint
                title="Khóa phòng theo Danh sách lớp Excel"
                text={
                  '• Bấm "Tải mẫu Excel" -> điền danh sách lớp -> bấm "Import Danh sách SV".\n• Khi đã import, sinh viên phải nhập đúng Mã SV, Họ đệm, Tên, Giới tính, Ngày sinh thì hệ thống mới cho vào thi (ngăn hoàn toàn người lạ hoặc thi hộ).\n• Có sẵn mục lọc "Chưa vào thi" để thầy/cô điểm danh vắng thi tức thì.'
                }
              />
              {rosterEntries.length > 0 ? (
                <span className="px-2 py-0.5 rounded-full bg-support-50 text-support-700 border border-support-200 text-[11px] font-bold">
                  {rosterEntries.length} SV • Bắt buộc khớp
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-full bg-slate-100 text-ink-600 text-[11px] font-semibold">
                  Chưa import (tự do theo PIN)
                </span>
              )}
            </div>
            <p className="text-[11px] text-ink-500">
              Import file Excel/CSV theo đúng các cột: <strong>STT | Mã sinh viên | Họ đệm | Tên | Giới tính | Ngày sinh</strong>.
              Khi đã import, sinh viên phải nhập chính xác các thông tin này mới được vào phòng thi.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={rosterFileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleRosterFileChange}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => downloadStudentRosterTemplateXlsx(exam.title)}
              className="h-8 px-3 rounded-lg border border-slate-200 bg-white hover:border-brand-300 text-ink-700 text-xs font-bold flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" /> Tải mẫu Excel
            </button>
            <button
              type="button"
              onClick={() => rosterFileRef.current?.click()}
              className="h-8 px-3 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold flex items-center gap-1.5"
            >
              <Upload className="w-3.5 h-3.5" /> Import Danh sách SV
            </button>
            {rosterEntries.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={() => setShowRosterTable((v) => !v)}
                  className="h-8 px-3 rounded-lg border border-brand-200 bg-brand-50 text-brand-700 text-xs font-bold"
                >
                  {showRosterTable ? 'Ẩn danh sách' : `Xem danh sách (${rosterEntries.length})`}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!window.confirm('Xóa toàn bộ danh sách sinh viên của ca thi này?')) return;
                    onUpdateRoster?.(exam.id, []);
                    setShowRosterTable(false);
                    setRosterNotice({ type: 'ok', text: 'Đã xóa danh sách sinh viên của ca thi.' });
                  }}
                  className="h-8 px-2.5 rounded-lg border border-rose-200 bg-rose-50 text-rose-700 text-xs font-bold flex items-center gap-1"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Xóa
                </button>
              </>
            )}
          </div>
        </div>

        {rosterNotice && (
          <div
            className={`px-3 py-2 rounded-lg text-xs font-semibold ${
              rosterNotice.type === 'ok'
                ? 'bg-support-50 text-support-800 border border-support-200'
                : 'bg-rose-50 text-rose-700 border border-rose-200'
            }`}
          >
            {rosterNotice.text}
          </div>
        )}

        {showRosterTable && rosterEntries.length > 0 && (
          <div className="space-y-2.5">
            <div className="relative max-w-xs">
              <Search className="w-3.5 h-3.5 text-ink-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={rosterSearch}
                onChange={(e) => {
                  setRosterSearch(e.target.value);
                  setRosterPage(1);
                }}
                placeholder="Tìm MSSV hoặc Họ tên trong danh sách..."
                className="w-full h-8 pl-8 pr-3 rounded-lg border border-slate-200 bg-white text-xs"
              />
            </div>
            <div className="overflow-auto border border-slate-200 rounded-xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-[11px] font-bold text-ink-600 sticky top-0 border-b border-slate-200">
                  <tr>
                    <th className="px-3 py-2">STT</th>
                    <th className="px-3 py-2">Mã sinh viên</th>
                    <th className="px-3 py-2">Họ đệm</th>
                    <th className="px-3 py-2">Tên</th>
                    <th className="px-3 py-2">Giới tính</th>
                    <th className="px-3 py-2">Ngày sinh</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pagedRosterList.map((st, idx) => (
                    <tr key={st.studentCode} className="hover:bg-slate-50/70">
                      <td className="px-3 py-1.5 text-ink-500">
                        {(safeRosterPage - 1) * rosterPageSize + idx + 1}
                      </td>
                      <td className="px-3 py-1.5 font-mono font-bold text-brand-700">{st.studentCode}</td>
                      <td className="px-3 py-1.5 text-ink-800">{st.lastName}</td>
                      <td className="px-3 py-1.5 font-semibold text-ink-900">{st.firstName}</td>
                      <td className="px-3 py-1.5 text-ink-700">{st.gender}</td>
                      <td className="px-3 py-1.5 font-mono text-ink-700">{st.dob}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <PaginationBar
              currentPage={safeRosterPage}
              totalItems={filteredRosterList.length}
              pageSize={rosterPageSize}
              onPageChange={setRosterPage}
              onPageSizeChange={setRosterPageSize}
              pageSizeOptions={[15, 30, 50]}
              itemLabel="sinh viên trong danh sách"
            />
          </div>
        )}
      </div>

      {/* Prominent LOCKED Instructor Approval Queue */}
      {lockedQueue.length > 0 && (
        <div className="bg-rose-50 border-2 border-rose-300 rounded-2xl p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex items-center gap-2 text-rose-900 font-bold text-sm flex-wrap">
              <AlertOctagon className="w-5 h-5 text-rose-600 shrink-0" />
              <span>Hàng đợi Phê duyệt Sinh viên Vượt ngưỡng ({lockedQueue.length} thí sinh đang chờ quyết định)</span>
              <InfoHint
                title="Hướng dẫn xử lý 3 nút Phê duyệt"
                text={
                  '• Accept (Giữ giờ): Mở khóa cho sinh viên làm bài tiếp nhưng đồng hồ vẫn trừ thời gian đã chờ.\n• Accept + Bù giờ: Mở khóa và cộng trả lại đúng số giây sinh viên vừa ngồi chờ (nên dùng nếu lỗi mạng/lỗi khách quan).\n• Reject (Thu bài): Chấm dứt bài làm ngay lập tức, thu điểm hiện có và gửi Email kết quả.'
                }
              />
            </div>
            {lockedQueue.length > 1 && (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (!window.confirm(`Mở khóa toàn bộ ${lockedQueue.length} thí sinh đang bị khóa và cộng bù thời gian chờ?`)) return;
                    for (const a of lockedQueue) {
                      onProctorDecision(a.id, 'ACCEPT_COMPENSATE', getWaitSeconds(a));
                    }
                  }}
                  className="px-3 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold flex items-center gap-1 shadow-xs"
                >
                  <Clock className="w-3.5 h-3.5" />
                  <span>Mở khóa tất cả + Bù giờ ({lockedQueue.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!window.confirm(`Mở khóa toàn bộ ${lockedQueue.length} thí sinh đang bị khóa (không bù giờ)?`)) return;
                    for (const a of lockedQueue) {
                      onProctorDecision(a.id, 'ACCEPT_KEEP');
                    }
                  }}
                  className="px-3 py-1.5 rounded-lg bg-support-600 hover:bg-support-700 text-white text-xs font-bold flex items-center gap-1 shadow-xs"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Mở khóa tất cả (Giữ giờ)</span>
                </button>
              </div>
            )}
          </div>

          <div className="space-y-3">
            {lockedQueue.map((a) => {
              const liveWait = getWaitSeconds(a);
              return (
                <div
                  key={a.id}
                  className="bg-white rounded-xl border border-rose-200 p-3.5 shadow-sm space-y-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="text-sm font-bold text-ink-900">
                        {a.studentName}{' '}
                        <span className="font-mono text-xs text-brand-700">({a.studentCode})</span>
                      </div>
                      <p className="text-xs text-ink-600">
                        Lớp {a.className} • Rời màn hình: <strong className="text-rose-700">{a.leaveCount} lần</strong> ({a.totalAwaySeconds}s vắng mặt) • Đang chờ: <strong className="font-mono text-rose-700">{liveWait}s</strong>
                      </p>
                      {a.unlockRequestNote && (
                        <p className="text-xs bg-amber-50 text-amber-900 px-2.5 py-1.5 rounded-lg border border-amber-200 mt-2">
                          <strong>Giải trình SV:</strong> "{a.unlockRequestNote}"
                        </p>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => onProctorDecision(a.id, 'ACCEPT_KEEP')}
                        className="px-3 py-2 rounded-lg bg-support-600 hover:bg-support-700 text-white text-xs font-bold flex items-center gap-1"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Accept (Giữ giờ)
                      </button>
                      <button
                        type="button"
                        onClick={() => onProctorDecision(a.id, 'ACCEPT_COMPENSATE', liveWait)}
                        className="px-3 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold flex items-center gap-1"
                      >
                        <Clock className="w-3.5 h-3.5" />
                        Accept + Bù {liveWait}s
                      </button>
                      <button
                        type="button"
                        onClick={() => onProctorDecision(a.id, 'REJECT')}
                        className="px-3 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold flex items-center gap-1"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        Reject (Thu bài)
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Location Outlier & Multi-Device / Multi-Browser Alert Panel */}
      {(farLocationAttempts.length > 0 || multiDeviceAttempts.length > 0) && (
        <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-4 space-y-2.5">
          <div className="flex flex-wrap items-center gap-2 text-amber-900 font-extrabold text-sm">
            <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0" />
            <span>Cảnh báo Bất thường Vị trí &amp; Đa thiết bị / Đa trình duyệt</span>
            <InfoHint
              title="Cách hệ thống phát hiện ngồi ngoài phòng thi & thi hộ"
              text={
                '• Bất thường Vị trí (GPS): Hệ thống lấy tọa độ trung tâm của cả lớp trong giảng đường. Sinh viên nào có vị trí xa hơn 200m so với lớp sẽ hiện thẻ đỏ (bấm vào tên để xem thẳng trên Google Maps).\n• Đa thiết bị / Đa trình duyệt: Phát hiện MSSV của 1 sinh viên được mở cùng lúc trên 2 điện thoại/máy tính hoặc 2 trình duyệt khác nhau.'
              }
            />
          </div>
          {farLocationAttempts.length > 0 && (
            <div className="bg-white rounded-xl border border-amber-200 p-3 space-y-1.5 text-xs">
              <div className="font-bold text-rose-700 flex items-center gap-1.5">
                <MapPin className="w-4 h-4 shrink-0" />
                {farLocationAttempts.length} sinh viên có vị trí xa hơn {FAR_LOCATION_METERS}m so với trung vị lớp:
              </div>
              <div className="flex flex-wrap gap-2">
                {farLocationAttempts.map((a) => {
                  const dist = distanceByAttemptId.get(a.id) ?? 0;
                  return (
                    <a
                      key={a.id}
                      href={`https://maps.google.com/?q=${a.locationLat},${a.locationLng}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 hover:bg-rose-100 font-semibold"
                    >
                      <span>{a.studentName}</span>
                      <span className="font-mono text-[11px]">({a.studentCode})</span>
                      <span className="font-mono font-bold text-rose-700">• Cách {formatDist(dist)}</span>
                    </a>
                  );
                })}
              </div>
            </div>
          )}
          {multiDeviceAttempts.length > 0 && (
            <div className="bg-white rounded-xl border border-amber-200 p-3 space-y-1.5 text-xs">
              <div className="font-bold text-amber-900 flex items-center gap-1.5">
                <MonitorSmartphone className="w-4 h-4 shrink-0 text-amber-700" />
                {multiDeviceAttempts.length} sinh viên đăng nhập / điền thông tin trên nhiều thiết bị hoặc trình duyệt khác nhau:
              </div>
              <div className="flex flex-wrap gap-2">
                {multiDeviceAttempts.map((a) => {
                  const labels = Array.from(
                    new Set(
                      (a.loginDevices ?? [])
                        .map((d) => d.deviceLabel)
                        .filter(Boolean),
                    ),
                  );
                  return (
                    <div
                      key={a.id}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 font-semibold"
                    >
                      <span>{a.studentName}</span>
                      <span className="font-mono text-[11px]">({a.studentCode})</span>
                      <span className="text-[11px] text-rose-700 font-bold">
                        • {labels.length > 0 ? labels.join(' ↔ ') : 'Nhiều thiết bị/trình duyệt'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Full Candidate Monitoring Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-card overflow-hidden">
        <div className="p-3.5 border-b border-slate-200 bg-slate-50/70 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="relative flex-1 min-w-[200px] max-w-xs">
              <Search className="w-3.5 h-3.5 text-ink-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setPage(1);
                }}
                placeholder="Tìm theo MSSV, Họ tên hoặc Lớp..."
                className="w-full h-8 pl-8 pr-3 rounded-lg border border-slate-200 bg-white text-xs text-ink-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs">
              {classOptions.length > 0 && filterMode !== 'ABSENT' && (
                <select
                  value={classFilter}
                  onChange={(e) => {
                    setClassFilter(e.target.value);
                    setPage(1);
                  }}
                  aria-label="Lọc theo lớp"
                  className="h-8 px-2.5 rounded-lg border border-slate-200 bg-white font-semibold text-ink-800"
                >
                  <option value="ALL">Tất cả lớp</option>
                  {classOptions.map((cls) => (
                    <option key={cls} value={cls}>
                      Lớp {cls}
                    </option>
                  ))}
                </select>
              )}
              {filterMode !== 'ABSENT' && (
                <select
                  value={sortBy}
                  onChange={(e) => {
                    setSortBy(e.target.value as typeof sortBy);
                    setPage(1);
                  }}
                  aria-label="Sắp xếp thí sinh"
                  className="h-8 px-2.5 rounded-lg border border-slate-200 bg-white font-semibold text-ink-800"
                >
                  <option value="DEFAULT">Sắp xếp: Mới nhất</option>
                  <option value="CODE">MSSV A → Z</option>
                  <option value="SCORE_DESC">Điểm cao → thấp</option>
                  <option value="SCORE_ASC">Điểm thấp → cao</option>
                  <option value="LEAVES_DESC">Vi phạm nhiều → ít</option>
                </select>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
            <button
              type="button"
              onClick={() => {
                setFilterMode('ALL');
                setPage(1);
              }}
              className={`px-2.5 py-1 rounded-lg font-bold border transition ${
                filterMode === 'ALL'
                  ? 'bg-brand-600 text-white border-brand-600'
                  : 'bg-white text-ink-700 border-slate-200 hover:border-brand-300'
              }`}
            >
              Tất cả ({examAttempts.length})
            </button>
            <button
              type="button"
              onClick={() => {
                setFilterMode('IN_PROGRESS');
                setPage(1);
              }}
              className={`px-2.5 py-1 rounded-lg font-bold border transition ${
                filterMode === 'IN_PROGRESS'
                  ? 'bg-emerald-600 text-white border-emerald-600'
                  : 'bg-white text-ink-700 border-slate-200 hover:border-emerald-300'
              }`}
            >
              Đang thi / Chờ ({countInProgress + countLocked})
            </button>
            <button
              type="button"
              onClick={() => {
                setFilterMode('LOCKED');
                setPage(1);
              }}
              className={`px-2.5 py-1 rounded-lg font-bold border transition ${
                filterMode === 'LOCKED'
                  ? 'bg-rose-600 text-white border-rose-600'
                  : 'bg-white text-rose-700 border-rose-200 hover:border-rose-400'
              }`}
            >
              Đang khóa ({countLocked})
            </button>
            <button
              type="button"
              onClick={() => {
                setFilterMode('SUBMITTED');
                setPage(1);
              }}
              className={`px-2.5 py-1 rounded-lg font-bold border transition ${
                filterMode === 'SUBMITTED'
                  ? 'bg-brand-700 text-white border-brand-700'
                  : 'bg-white text-ink-700 border-slate-200 hover:border-brand-300'
              }`}
            >
              Đã nộp ({countSubmitted})
            </button>
            <button
              type="button"
              onClick={() => {
                setFilterMode('ALERTS');
                setPage(1);
              }}
              className={`px-2.5 py-1 rounded-lg font-bold border transition ${
                filterMode === 'ALERTS'
                  ? 'bg-amber-600 text-white border-amber-600'
                  : 'bg-white text-ink-700 border-slate-200 hover:border-amber-300'
              }`}
            >
              Cảnh báo ({farLocationAttempts.length + multiDeviceAttempts.length})
            </button>
            {rosterEntries.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setFilterMode('ABSENT');
                  setPage(1);
                }}
                className={`px-2.5 py-1 rounded-lg font-bold border transition ${
                  filterMode === 'ABSENT'
                    ? 'bg-amber-600 text-white border-amber-600'
                    : 'bg-white text-amber-800 border-amber-200 hover:border-amber-400'
                }`}
              >
                Chưa vào thi ({absentRosterStudents.length})
              </button>
            )}
          </div>
        </div>

        {filterMode === 'ABSENT' ? (
          <div className="space-y-3">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-amber-50/70 border-b border-amber-200 text-amber-900 font-bold">
                  <th className="py-2.5 px-3.5">STT</th>
                  <th className="py-2.5 px-3.5">Mã sinh viên</th>
                  <th className="py-2.5 px-3.5">Họ đệm</th>
                  <th className="py-2.5 px-3.5">Tên</th>
                  <th className="py-2.5 px-3.5">Giới tính</th>
                  <th className="py-2.5 px-3.5">Ngày sinh</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pagedAbsentRoster.map((st, idx) => (
                    <tr key={st.studentCode} className="hover:bg-amber-50/30">
                      <td className="py-2 px-3.5 text-ink-500">
                        {(safeAbsentPage - 1) * pageSize + idx + 1}
                      </td>
                      <td className="py-2 px-3.5 font-mono font-bold text-brand-700">{st.studentCode}</td>
                      <td className="py-2 px-3.5 text-ink-800">{st.lastName}</td>
                      <td className="py-2 px-3.5 font-semibold text-ink-900">{st.firstName}</td>
                      <td className="py-2 px-3.5 text-ink-700">{st.gender}</td>
                      <td className="py-2 px-3.5 font-mono text-ink-700">{st.dob}</td>
                    </tr>
                  ))}
                {filteredAbsentRoster.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-support-700 font-bold">
                      {absentRosterStudents.length === 0
                        ? 'Tất cả sinh viên trong danh sách đã vào phòng thi!'
                        : 'Không tìm thấy sinh viên vắng thi nào khớp từ khóa.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {filteredAbsentRoster.length > 0 && (
            <div className="px-3.5 pb-3.5">
              <PaginationBar
                currentPage={safeAbsentPage}
                totalItems={filteredAbsentRoster.length}
                pageSize={pageSize}
                onPageChange={setPage}
                onPageSizeChange={setPageSize}
                pageSizeOptions={[15, 30, 50, 100]}
                itemLabel="thí sinh vắng"
              />
            </div>
          )}
          </div>
        ) : (
        <>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-ink-600 font-bold">
                <th className="py-3 px-3.5">Thí sinh</th>
                <th className="py-3 px-3.5">Trạng thái</th>
                <th className="py-3 px-3.5">
                  <span className="inline-flex items-center gap-1">
                    <span>Vị trí &amp; Thiết bị</span>
                    <InfoHint
                      title="Giám sát Vị trí (GPS) & Thiết bị"
                      text={
                        '• Tọa độ GPS: Ghi nhận lúc sinh viên vào phòng thi. Nếu xa lớp > 200m sẽ hiện màu đỏ (bấm vào để mở Google Maps).\n• Thiết bị: Hiển thị loại máy/trình duyệt đang thi và báo vàng nếu phát hiện đăng nhập trên nhiều máy.'
                      }
                    />
                  </span>
                </th>
                <th className="py-3 px-3.5">Tiến độ</th>
                <th className="py-3 px-3.5">
                  <span className="inline-flex items-center gap-1">
                    <span>Vi phạm / Tin cậy</span>
                    <InfoHint
                      title="Số lần rời màn hình & Điểm tin cậy"
                      text={
                        '• Đếm tổng số lần và tổng số giây sinh viên chuyển sang tab khác hoặc thu nhỏ trình duyệt.\n• Điểm tin cậy (%): Mức 100% là làm bài nghiêm túc liên tục; càng rời màn hình nhiều điểm tin cậy càng giảm.'
                      }
                    />
                  </span>
                </th>
                <th className="py-3 px-3.5">Điểm (Hệ 10)</th>
                <th className="py-3 px-3.5">Email</th>
                <th className="py-3 px-3.5 text-right">
                  <span className="inline-flex items-center justify-end gap-1">
                    <span>Điều khiển</span>
                    <InfoHint
                      title="Ý nghĩa 4 nút thao tác từng thí sinh"
                      text={
                        '• Nút Tờ giấy: Mở bài Tự luận của sinh viên đó để xem & sửa điểm.\n• Nút Xoay tròn: Reset Thiết bị (bấm nút này nếu máy sinh viên hết pin/sập nguồn cần sang máy khác đăng nhập thi tiếp).\n• Nút Dấu (+): Cộng thêm +60 giây làm bài cho riêng em đó.\n• Nút Phong bì: Sửa lại địa chỉ Email nếu sinh viên gõ sai và gửi lại phiếu điểm.'
                      }
                    />
                  </span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredAttempts.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-ink-500">
                    {examAttempts.length === 0
                      ? `Chưa có sinh viên nào vào ca thi này. Hãy dùng mã PIN ${exam.roomPin} ở trang chủ để thử nghiệm.`
                      : 'Không có thí sinh nào khớp bộ lọc / từ khóa tìm kiếm.'}
                  </td>
                </tr>
              ) : (
                pagedAttempts.map((a) => {
                  const answered = Object.keys(a.answers).length;
                  const statusBadge =
                    a.status === 'IN_PROGRESS'
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : a.status === 'PAUSED'
                        ? 'bg-amber-50 text-amber-800 border-amber-200'
                        : a.status === 'LOCKED'
                          ? 'bg-rose-50 text-rose-700 border-rose-200'
                          : 'bg-brand-50 text-brand-700 border-brand-200';

                  return (
                    <tr key={a.id} className="hover:bg-slate-50/70">
                      <td className="py-3 px-3.5">
                        <div className="font-bold text-ink-900">{a.studentName}</div>
                        <div className="font-mono text-[11px] text-ink-500">
                          {a.studentCode} • {a.className}
                        </div>
                        {a.aiFlag && (
                          <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded bg-rose-100 text-rose-700 text-[10px] font-bold">
                            <ShieldAlert className="w-3 h-3" /> {a.aiFlagReason ?? 'Cờ AI'}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3.5">
                        <span
                          className={`inline-block px-2.5 py-1 rounded-full border text-[11px] font-bold ${statusBadge}`}
                        >
                          {a.status}
                        </span>
                      </td>
                      <td className="py-3 px-3.5 space-y-1">
                        {typeof a.locationLat === 'number' && typeof a.locationLng === 'number' ? (
                          (() => {
                            const dist = distanceByAttemptId.get(a.id);
                            const isFar = dist !== undefined && dist > FAR_LOCATION_METERS;
                            return (
                              <a
                                href={`https://maps.google.com/?q=${a.locationLat},${a.locationLng}`}
                                target="_blank"
                                rel="noreferrer"
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold border ${
                                  isFar
                                    ? 'bg-rose-50 text-rose-700 border-rose-200'
                                    : 'bg-support-50 text-support-700 border-support-200'
                                }`}
                              >
                                <MapPin className="w-3 h-3 shrink-0" />
                                {dist !== undefined
                                  ? isFar
                                    ? `Xa lớp (${formatDist(dist)})`
                                    : `Cùng lớp (${formatDist(dist)})`
                                  : 'Có GPS'}
                              </a>
                            );
                          })()
                        ) : (
                          <span className="inline-block px-2 py-0.5 rounded bg-slate-100 text-ink-500 text-[10px] font-semibold">
                            Chưa có GPS
                          </span>
                        )}
                        <div className="text-[10px] text-ink-600 flex items-center gap-1">
                          <MonitorSmartphone className="w-3 h-3 shrink-0 text-ink-400" />
                          <span>{a.deviceLabel || 'Trình duyệt'}</span>
                        </div>
                        {isMultiDeviceAttempt(a) && (
                          <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300 text-[10px] font-bold">
                            Đa thiết bị/trình duyệt ({Math.max(2, a.loginDevices?.length ?? 0)})
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-3.5 font-mono font-semibold text-ink-800">
                        {answered}/{a.assignedQuestions.length} câu
                      </td>
                      <td className="py-3 px-3.5">
                        <div className="font-semibold text-ink-900">
                          {a.leaveCount} lần ({a.totalAwaySeconds}s)
                        </div>
                        <div className="text-[11px] text-support-700 font-mono font-bold">
                          Tin cậy: {a.integrityScore}%
                        </div>
                      </td>
                      <td className="py-3 px-3.5">
                        <div className="font-mono font-extrabold text-brand-700 text-sm">
                          {a.scale10Score.toFixed(2)}
                        </div>
                        <div className="text-[10px] text-ink-500">
                          Gốc: {a.totalScore}/{a.maxTotalScore} (TL: {a.essayScore}đ)
                        </div>
                      </td>
                      <td className="py-3 px-3.5">
                        {editingEmailId === a.id ? (
                          <div className="flex items-center gap-1">
                            <input
                              type="email"
                              value={emailDraft}
                              onChange={(e) => setEmailDraft(e.target.value)}
                              className="w-36 px-2 py-1 text-[11px] border rounded"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                onResendEmail(a.id, emailDraft);
                                setEditingEmailId(null);
                              }}
                              className="px-2 py-1 bg-brand-600 text-white rounded text-[10px] font-bold"
                            >
                              Gửi
                            </button>
                          </div>
                        ) : (
                          <div>
                            <div className="text-[11px] text-ink-700 truncate max-w-[140px]">
                              {a.studentEmail}
                            </div>
                            <span className="text-[10px] font-semibold text-support-700">
                              {a.emailSentStatus}
                            </span>
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-3.5 text-right">
                        <div className="inline-flex flex-wrap justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => onOpenEssayReview(a.id)}
                            title="Rà soát tự luận Rubric"
                            className="p-1.5 rounded-lg border border-slate-200 hover:border-brand-400 text-ink-700 hover:text-brand-700 bg-white"
                          >
                            <FileText className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onResetDevice(a.id)}
                            title="Reset Thiết bị MSSV"
                            className="p-1.5 rounded-lg border border-slate-200 hover:border-amber-400 text-ink-700 hover:text-amber-700 bg-white"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onAddBonusTime(a.id, 60)}
                            title="Cộng thêm 60 giây"
                            className="p-1.5 rounded-lg border border-slate-200 hover:border-support-400 text-ink-700 hover:text-support-700 bg-white"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingEmailId(a.id);
                              setEmailDraft(a.studentEmail);
                            }}
                            title="Sửa Email & Gửi lại điểm"
                            className="p-1.5 rounded-lg border border-slate-200 hover:border-brand-400 text-ink-700 hover:text-brand-700 bg-white"
                          >
                            <Mail className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {filteredAttempts.length > 0 && (
          <div className="p-3.5 border-t border-slate-200 bg-white">
            <PaginationBar
              currentPage={safePage}
              totalItems={filteredAttempts.length}
              pageSize={pageSize}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
              pageSizeOptions={[15, 30, 50, 100]}
              itemLabel="thí sinh"
            />
          </div>
        )}
        </>
        )}
      </div>

      {showProctorReportModal && (() => {
        const violatedAttempts = examAttempts.filter(
          (a) => a.leaveCount > 0 || a.aiFlag || a.status === 'LOCKED',
        );
        const totalRoster = rosterEntries.length > 0 ? rosterEntries.length : examAttempts.length;
        const presentCount =
          rosterEntries.length > 0
            ? rosterEntries.length - absentRosterStudents.length
            : examAttempts.length;
        return (
          <div className="fixed inset-0 z-50 bg-ink-900/60 flex items-center justify-center p-4 overflow-y-auto">
            <style>
              {`@media print { body * { visibility: hidden !important; } #proctor-report-printable, #proctor-report-printable * { visibility: visible !important; } #proctor-report-printable { position: fixed; left: 0; top: 0; width: 100%; background: #fff; box-shadow: none !important; border: none !important; } .no-print-btn { display: none !important; } }`}
            </style>
            <div
              id="proctor-report-printable"
              className="w-full max-w-3xl bg-white rounded-2xl border border-slate-200 shadow-2xl p-6 sm:p-8 space-y-5 text-ink-900"
            >
              <div className="flex items-start justify-between gap-3 border-b border-slate-200 pb-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-ink-500">
                    Biên bản Tổng kết Coi thi &amp; Điểm danh Ca thi
                  </p>
                  <h3 className="text-lg font-extrabold text-ink-900 mt-1">
                    {exam.title}
                  </h3>
                  <p className="text-xs text-ink-600 mt-0.5">
                    Mã phòng thi (PIN): <strong className="font-mono">{exam.roomPin}</strong> • Thời lượng: <strong>{exam.durationMinutes} phút</strong> • Ngày lập: <strong>{new Date().toLocaleDateString('vi-VN')}</strong>
                  </p>
                </div>
                <div className="flex items-center gap-2 no-print-btn shrink-0">
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="h-9 px-3.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold flex items-center gap-1.5"
                  >
                    <Printer className="w-3.5 h-3.5" /> In Biên bản A4
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowProctorReportModal(false)}
                    className="h-9 px-3 rounded-xl border border-slate-200 text-xs font-bold text-ink-700 hover:bg-slate-50"
                  >
                    Đóng
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center text-xs">
                <div className="p-3 rounded-xl border border-slate-200 bg-slate-50">
                  <div className="text-ink-500">Tổng danh sách</div>
                  <div className="text-xl font-mono font-extrabold text-ink-900 mt-0.5">{totalRoster}</div>
                </div>
                <div className="p-3 rounded-xl border border-slate-200 bg-slate-50">
                  <div className="text-ink-500">Có mặt dự thi</div>
                  <div className="text-xl font-mono font-extrabold text-support-700 mt-0.5">{presentCount}</div>
                </div>
                <div className="p-3 rounded-xl border border-slate-200 bg-slate-50">
                  <div className="text-ink-500">Vắng thi</div>
                  <div className="text-xl font-mono font-extrabold text-rose-700 mt-0.5">
                    {rosterEntries.length > 0 ? absentRosterStudents.length : 0}
                  </div>
                </div>
                <div className="p-3 rounded-xl border border-slate-200 bg-slate-50">
                  <div className="text-ink-500">Đã nộp bài</div>
                  <div className="text-xl font-mono font-extrabold text-brand-700 mt-0.5">{countSubmitted}</div>
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="text-xs font-extrabold uppercase tracking-wider text-ink-700">
                  1. Danh sách Thí sinh Vắng thi ({rosterEntries.length > 0 ? absentRosterStudents.length : 0})
                </h4>
                {rosterEntries.length === 0 ? (
                  <p className="text-xs text-ink-500 italic">
                    Ca thi mở tự do theo PIN (chưa import danh sách lớp để đối chiếu vắng thi).
                  </p>
                ) : absentRosterStudents.length === 0 ? (
                  <p className="text-xs text-support-700 font-semibold">
                    ✓ Đầy đủ 100% thí sinh trong danh sách đã vào thi.
                  </p>
                ) : (
                  <div className="overflow-x-auto border border-slate-200 rounded-xl">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 border-b border-slate-200 font-bold text-ink-600">
                        <tr>
                          <th className="px-3 py-1.5">STT</th>
                          <th className="px-3 py-1.5">MSSV</th>
                          <th className="px-3 py-1.5">Họ và tên</th>
                          <th className="px-3 py-1.5">Ngày sinh</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {absentRosterStudents.map((st, idx) => (
                          <tr key={st.studentCode}>
                            <td className="px-3 py-1.5">{idx + 1}</td>
                            <td className="px-3 py-1.5 font-mono font-bold">{st.studentCode}</td>
                            <td className="px-3 py-1.5">{st.lastName} {st.firstName}</td>
                            <td className="px-3 py-1.5 font-mono">{st.dob}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <h4 className="text-xs font-extrabold uppercase tracking-wider text-ink-700">
                  2. Ghi nhận Vi phạm Quy chế / Cảnh báo Giám sát ({violatedAttempts.length})
                </h4>
                {violatedAttempts.length === 0 ? (
                  <p className="text-xs text-support-700 font-semibold">
                    ✓ Ca thi diễn ra nghiêm túc, không ghi nhận thí sinh vi phạm rời màn hình hoặc nghi vấn thiết bị.
                  </p>
                ) : (
                  <div className="overflow-x-auto border border-slate-200 rounded-xl">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 border-b border-slate-200 font-bold text-ink-600">
                        <tr>
                          <th className="px-3 py-1.5">MSSV</th>
                          <th className="px-3 py-1.5">Họ tên</th>
                          <th className="px-3 py-1.5 text-center">Rời màn hình</th>
                          <th className="px-3 py-1.5 text-center">Vắng mặt</th>
                          <th className="px-3 py-1.5">Ghi chú</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {violatedAttempts.map((a) => (
                          <tr key={a.id}>
                            <td className="px-3 py-1.5 font-mono font-bold">{a.studentCode}</td>
                            <td className="px-3 py-1.5">{a.studentName}</td>
                            <td className="px-3 py-1.5 text-center font-mono">{a.leaveCount} lần</td>
                            <td className="px-3 py-1.5 text-center font-mono">{a.totalAwaySeconds}s</td>
                            <td className="px-3 py-1.5 text-[11px]">
                              {a.aiFlagReason || (a.status === 'LOCKED' ? 'Đang bị khóa' : 'Vượt ngưỡng giám sát')}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-6 pt-6 text-center text-xs">
                <div>
                  <p className="font-bold text-ink-800 uppercase">Cán bộ Coi thi 1 / Giảng viên</p>
                  <p className="text-[11px] text-ink-500 mt-1">(Ký và ghi rõ họ tên)</p>
                  <div className="h-16" />
                </div>
                <div>
                  <p className="font-bold text-ink-800 uppercase">Đại diện Khoa / Bộ môn (nếu có)</p>
                  <p className="text-[11px] text-ink-500 mt-1">(Ký và ghi rõ họ tên)</p>
                  <div className="h-16" />
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};
