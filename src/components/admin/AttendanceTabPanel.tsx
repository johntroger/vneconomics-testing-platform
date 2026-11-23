import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Clock,
  Copy,
  Download,
  Eye,
  EyeOff,
  FileSpreadsheet,
  KeyRound,
  Lock,
  MapPin,
  Plus,
  QrCode,
  RefreshCw,
  Save,
  Search,
  Smartphone,
  Trash2,
  Unlock,
  Upload,
  Users,
  X,
} from 'lucide-react';
import {
  createAttendanceSession,
  deleteAttendanceClass,
  deleteAttendanceSession,
  fetchAttendanceClasses,
  fetchAttendanceMatrix,
  fetchAttendanceSessionDetail,
  fetchAttendanceSessions,
  saveAttendanceClass,
  saveAttendanceRecordsBulk,
  toggleAttendanceSessionStatus,
} from '../../services/attendanceApi';
import type {
  AttendanceClass,
  AttendanceRecord,
  AttendanceRosterStudent,
  AttendanceSession,
  AttendanceStatus,
} from '../../types/attendance';
import {
  downloadAttendanceTemplateXlsx,
  exportAttendanceMatrixXlsx,
  exportAttendanceSessionXlsx,
  parseAttendanceRosterFile,
} from '../../utils/attendanceXlsx';
import { PaginationBar, paginateSlice } from '../common/PaginationBar';

interface AttendanceTabPanelProps {
  defaultInstructorName?: string;
  onToast: (msg: string) => void;
}

const STATUS_BADGE: Record<AttendanceStatus, { label: string; cls: string }> = {
  PRESENT: { label: 'Có mặt', cls: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  LATE: { label: 'Đi muộn', cls: 'bg-amber-100 text-amber-800 border-amber-200' },
  ABSENT_EXCUSED: { label: 'Vắng có phép', cls: 'bg-sky-100 text-sky-800 border-sky-200' },
  ABSENT_UNEXCUSED: { label: 'Vắng không phép', cls: 'bg-rose-100 text-rose-800 border-rose-200' },
};

function randomPasscode4(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

export const AttendanceTabPanel: React.FC<AttendanceTabPanelProps> = ({
  defaultInstructorName = '',
  onToast,
}) => {
  const [classes, setClasses] = useState<AttendanceClass[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [sessions, setSessions] = useState<AttendanceSession[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string>('');
  const [activeSession, setActiveSession] = useState<AttendanceSession | null>(null);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(false);

  // Class modal state
  const [classModalOpen, setClassModalOpen] = useState(false);
  const [editingClassId, setEditingClassId] = useState<string>('');
  const [clsTitle, setClsTitle] = useState('');
  const [clsCode, setClsCode] = useState('');
  const [clsSemester, setClsSemester] = useState('HK 1 NH 2026-2027');
  const [clsCredits, setClsCredits] = useState(3);
  const [clsInstructor, setClsInstructor] = useState(defaultInstructorName);
  const [clsRoster, setClsRoster] = useState<AttendanceRosterStudent[]>([]);
  const [clsParseNotice, setClsParseNotice] = useState('');
  const rosterInputRef = useRef<HTMLInputElement | null>(null);

  // Session modal state
  const [sessionModalOpen, setSessionModalOpen] = useState(false);
  const [sesTitle, setSesTitle] = useState('');
  const [sesDate, setSesDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [sesPeriods, setSesPeriods] = useState(3);
  const [sesPasscode, setSesPasscode] = useState(() => randomPasscode4());
  const [sesRotateSec, setSesRotateSec] = useState(30);
  const [sesRequireRoster, setSesRequireRoster] = useState(true);
  const [sesRequireGps, setSesRequireGps] = useState(true);
  const [sesBlockDup, setSesBlockDup] = useState(true);
  const [sesMaxDist, setSesMaxDist] = useState(200);
  const [sesLateMin, setSesLateMin] = useState(15);
  const [sesInstLat, setSesInstLat] = useState<number | null>(null);
  const [sesInstLng, setSesInstLng] = useState<number | null>(null);

  // Projector QR modal state
  const [projectorOpen, setProjectorOpen] = useState(false);
  const [showPassOnProjector, setShowPassOnProjector] = useState(true);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);

  // Table filter & edits
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<
    'ALL' | AttendanceStatus | 'ALERTS'
  >('ALL');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [draftEdits, setDraftEdits] = useState<
    Record<string, { attendanceStatus: AttendanceStatus; note: string }>
  >({});
  const [savingBulk, setSavingBulk] = useState(false);

  const selectedClass = useMemo(
    () => classes.find((c) => c.id === selectedClassId) ?? null,
    [classes, selectedClassId],
  );

  const loadClasses = useCallback(async () => {
    setLoading(true);
    const res = await fetchAttendanceClasses();
    setLoading(false);
    if (res.ok) {
      setClasses(res.classes);
      if (res.classes.length > 0 && !res.classes.some((c) => c.id === selectedClassId)) {
        setSelectedClassId(res.classes[0].id);
      }
    }
  }, [selectedClassId]);

  const loadSessions = useCallback(async (classId: string) => {
    if (!classId) {
      setSessions([]);
      return;
    }
    const res = await fetchAttendanceSessions(classId);
    if (res.ok) {
      setSessions(res.sessions);
      if (res.sessions.length > 0) {
        setSelectedSessionId((prev) =>
          res.sessions.some((s) => s.id === prev) ? prev : res.sessions[0].id,
        );
      } else {
        setSelectedSessionId('');
        setActiveSession(null);
        setRecords([]);
      }
    }
  }, []);

  const loadSessionDetail = useCallback(async (sessionId: string) => {
    if (!sessionId) return;
    const res = await fetchAttendanceSessionDetail(sessionId);
    if (res.ok && res.session) {
      setActiveSession(res.session);
      setRecords(res.records);
    }
  }, []);

  useEffect(() => {
    void loadClasses();
  }, [loadClasses]);

  useEffect(() => {
    if (selectedClassId) {
      void loadSessions(selectedClassId);
    }
  }, [selectedClassId, loadSessions]);

  useEffect(() => {
    if (selectedSessionId) {
      setDraftEdits({});
      void loadSessionDetail(selectedSessionId);
    }
  }, [selectedSessionId, loadSessionDetail]);

  // Poll session detail while projector is open or session is OPEN
  useEffect(() => {
    if (!selectedSessionId || (!projectorOpen && activeSession?.status !== 'OPEN')) {
      return;
    }
    const id = window.setInterval(() => {
      void loadSessionDetail(selectedSessionId);
    }, projectorOpen ? 2500 : 6000);
    return () => window.clearInterval(id);
  }, [selectedSessionId, projectorOpen, activeSession?.status, loadSessionDetail]);

  const checkInUrl = useMemo(() => {
    if (!activeSession) return '';
    const base = `${window.location.origin}/attend/${activeSession.checkinPin}`;
    return activeSession.qrToken ? `${base}?t=${encodeURIComponent(activeSession.qrToken)}` : base;
  }, [activeSession]);

  useEffect(() => {
    if (!projectorOpen || !checkInUrl) return;
    let cancelled = false;
    QRCode.toDataURL(checkInUrl, {
      width: 320,
      margin: 2,
      color: { dark: '#0f172a', light: '#ffffff' },
    })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [projectorOpen, checkInUrl]);

  const openCreateClassModal = () => {
    setEditingClassId('');
    setClsTitle('');
    setClsCode('');
    setClsSemester('HK 1 NH 2026-2027');
    setClsCredits(3);
    setClsInstructor(defaultInstructorName);
    setClsRoster([]);
    setClsParseNotice('');
    setClassModalOpen(true);
  };

  const openEditClassModal = (cls: AttendanceClass) => {
    setEditingClassId(cls.id);
    setClsTitle(cls.title);
    setClsCode(cls.classCode);
    setClsSemester(cls.semester);
    setClsCredits(cls.credits);
    setClsInstructor(cls.instructorName);
    setClsRoster(cls.rosterEntries);
    setClsParseNotice(`Đang có ${cls.rosterEntries.length} sinh viên trong lớp.`);
    setClassModalOpen(true);
  };

  const handleUploadClassExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const res = await parseAttendanceRosterFile(file);
    if (res.entries.length === 0) {
      setClsParseNotice(res.errors[0] || 'Không đọc được danh sách sinh viên từ file.');
      return;
    }
    setClsRoster(res.entries);
    if (res.metadata.title && !clsTitle.trim()) setClsTitle(res.metadata.title);
    if (res.metadata.classCode && !clsCode.trim()) setClsCode(res.metadata.classCode);
    if (res.metadata.semester) setClsSemester(res.metadata.semester);
    if (res.metadata.credits) setClsCredits(res.metadata.credits);
    if (res.metadata.instructorName && !clsInstructor.trim()) {
      setClsInstructor(res.metadata.instructorName);
    }
    setClsParseNotice(
      res.errors.length > 0
        ? `Đã đọc ${res.entries.length} sinh viên (bỏ qua ${res.errors.length} dòng lỗi).`
        : `Đã đọc thành công ${res.entries.length} sinh viên từ file Excel.`,
    );
  };

  const handleSaveClass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clsTitle.trim()) {
      onToast('Vui lòng nhập Tên lớp học phần.');
      return;
    }
    const res = await saveAttendanceClass({
      id: editingClassId || undefined,
      title: clsTitle.trim(),
      classCode: clsCode.trim(),
      semester: clsSemester.trim(),
      credits: clsCredits,
      instructorName: clsInstructor.trim(),
      rosterEntries: clsRoster,
    });
    if (!res.ok || !res.classItem) {
      onToast(res.error ?? 'Không thể lưu lớp điểm danh.');
      return;
    }
    setClassModalOpen(false);
    await loadClasses();
    setSelectedClassId(res.classItem.id);
    onToast(`Đã lưu lớp "${res.classItem.title}" (${res.classItem.rosterEntries.length} SV).`);
  };

  const handleDeleteClass = async () => {
    if (!selectedClass) return;
    if (!window.confirm(`Xóa lớp "${selectedClass.title}" và toàn bộ các buổi điểm danh?`)) return;
    const res = await deleteAttendanceClass(selectedClass.id);
    if (res.ok) {
      onToast('Đã xóa lớp điểm danh.');
      setSelectedClassId('');
      setSessions([]);
      setActiveSession(null);
      setRecords([]);
      await loadClasses();
    }
  };

  const openCreateSessionModal = () => {
    if (!selectedClass) return;
    const nextNum = sessions.length + 1;
    const todayStr = new Date().toLocaleDateString('vi-VN');
    setSesTitle(`Buổi ${nextNum} - ${todayStr}`);
    setSesDate(new Date().toISOString().slice(0, 10));
    setSesPeriods(3);
    setSesPasscode(randomPasscode4());
    setSesRotateSec(30);
    setSesRequireRoster(selectedClass.rosterEntries.length > 0);
    setSesRequireGps(true);
    setSesBlockDup(true);
    setSesMaxDist(200);
    setSesLateMin(15);
    setSesInstLat(null);
    setSesInstLng(null);
    setSessionModalOpen(true);
  };

  const handlePinInstructorGps = () => {
    if (!navigator.geolocation) {
      onToast('Trình duyệt không hỗ trợ GPS.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setSesInstLat(pos.coords.latitude);
        setSesInstLng(pos.coords.longitude);
        onToast('Đã khóa tọa độ GPS phòng học hiện tại.');
      },
      () => onToast('Không lấy được GPS máy tính — hệ thống sẽ dùng tâm Trung vị lớp tự động.'),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  };

  const handleCreateSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClass) return;
    const res = await createAttendanceSession({
      classId: selectedClass.id,
      title: sesTitle.trim() || `Buổi ${sessions.length + 1}`,
      sessionDate: sesDate,
      periodsCount: sesPeriods,
      sessionPasscode: sesPasscode.trim(),
      rotateQrSeconds: sesRotateSec,
      requireRosterMatch: sesRequireRoster,
      requireGps: sesRequireGps,
      blockDuplicateDevice: sesBlockDup,
      instructorLat: sesInstLat,
      instructorLng: sesInstLng,
      maxDistanceMeters: sesMaxDist,
      lateAfterMinutes: sesLateMin,
    });
    if (!res.ok || !res.session) {
      onToast(res.error ?? 'Không thể tạo buổi điểm danh.');
      return;
    }
    setSessionModalOpen(false);
    await loadSessions(selectedClass.id);
    setSelectedSessionId(res.session.id);
    setProjectorOpen(true);
    onToast(`Đã mở buổi điểm danh (PIN: ${res.session.checkinPin}).`);
  };

  const getEffectiveStatus = (r: AttendanceRecord): AttendanceStatus =>
    draftEdits[r.id]?.attendanceStatus ?? r.attendanceStatus;
  const getEffectiveNote = (r: AttendanceRecord): string =>
    draftEdits[r.id]?.note ?? r.note;

  const updateRowDraft = (
    rec: AttendanceRecord,
    patch: Partial<{ attendanceStatus: AttendanceStatus; note: string }>,
  ) => {
    setDraftEdits((prev) => ({
      ...prev,
      [rec.id]: {
        attendanceStatus: patch.attendanceStatus ?? prev[rec.id]?.attendanceStatus ?? rec.attendanceStatus,
        note: patch.note ?? prev[rec.id]?.note ?? rec.note,
      },
    }));
  };

  const dirtyCount = Object.keys(draftEdits).length;

  const handleSaveBulk = async () => {
    if (!activeSession || dirtyCount === 0) return;
    setSavingBulk(true);
    const updates = Object.entries(draftEdits).map(([id, v]) => ({
      id,
      attendanceStatus: v.attendanceStatus,
      note: v.note,
    }));
    const res = await saveAttendanceRecordsBulk(activeSession.id, updates);
    setSavingBulk(false);
    if (!res.ok) {
      onToast(res.error ?? 'Lưu bảng điểm danh thất bại.');
      return;
    }
    if (res.records) setRecords(res.records);
    if (res.stats) {
      setActiveSession((prev) => (prev ? { ...prev, stats: res.stats } : prev));
    }
    setDraftEdits({});
    onToast(`Đã lưu ${updates.length} thay đổi điểm danh.`);
  };

  const handleMarkUnscannedUnexcused = () => {
    const next: Record<string, { attendanceStatus: AttendanceStatus; note: string }> = { ...draftEdits };
    let count = 0;
    for (const r of records) {
      if (r.checkInSource !== 'QR_SCAN' && getEffectiveStatus(r) !== 'ABSENT_EXCUSED') {
        next[r.id] = { attendanceStatus: 'ABSENT_UNEXCUSED', note: getEffectiveNote(r) };
        count += 1;
      }
    }
    setDraftEdits(next);
    onToast(`Đã chuyển ${count} sinh viên chưa quét sang Vắng không phép (bấm Lưu để ghi nhận).`);
  };

  const handleExportMatrix = async () => {
    if (!selectedClass) return;
    const res = await fetchAttendanceMatrix(selectedClass.id);
    if (!res.ok || !res.matrix) {
      onToast(res.error ?? 'Không lấy được dữ liệu tổng hợp.');
      return;
    }
    exportAttendanceMatrixXlsx(res.matrix);
    onToast('Đã xuất file Excel tổng hợp chuyên cần toàn khóa.');
  };

  const filteredRecords = useMemo(() => {
    const q = search.trim().toLowerCase();
    return records.filter((r) => {
      const st = getEffectiveStatus(r);
      if (filterStatus === 'ALERTS') {
        if (!r.deviceFlag && !r.locationFlag) return false;
      } else if (filterStatus !== 'ALL' && st !== filterStatus) {
        return false;
      }
      if (!q) return true;
      return (
        r.studentCode.toLowerCase().includes(q) ||
        r.studentName.toLowerCase().includes(q) ||
        r.className.toLowerCase().includes(q)
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [records, filterStatus, search, draftEdits]);

  const pagedRecords = useMemo(
    () => paginateSlice(filteredRecords, page, pageSize),
    [filteredRecords, page, pageSize],
  );

  const liveStats = useMemo(() => {
    let present = 0;
    let late = 0;
    let excused = 0;
    let unexcused = 0;
    let alerts = 0;
    for (const r of records) {
      const st = getEffectiveStatus(r);
      if (st === 'PRESENT') present += 1;
      else if (st === 'LATE') late += 1;
      else if (st === 'ABSENT_EXCUSED') excused += 1;
      else unexcused += 1;
      if (r.deviceFlag || r.locationFlag) alerts += 1;
    }
    return { total: records.length, present, late, excused, unexcused, alerts };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [records, draftEdits]);

  return (
    <div className="space-y-5">
      {/* Top Card: Class selector & Create Class */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-card p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-extrabold text-ink-900 flex items-center gap-2">
              <QrCode className="w-5 h-5 text-emerald-600" />
              Điểm danh Lớp học bằng QR Code (Thiết bị + GPS + Excel)
            </h2>
            <p className="text-xs text-ink-500 mt-0.5">
              Nhập danh sách sinh viên 1 lần từ Excel, tạo buổi điểm danh chiếu QR, hậu kiểm vắng có phép / không phép và xuất Excel chuẩn mẫu.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={openCreateClassModal}
              className="px-3.5 py-2 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              Tạo Lớp / Nhập Excel SV
            </button>
          </div>
        </div>

        {loading && classes.length === 0 ? (
          <p className="text-xs text-ink-500">Đang tải danh sách lớp điểm danh...</p>
        ) : classes.length === 0 ? (
          <div className="p-6 rounded-2xl bg-slate-50 border border-dashed border-slate-200 text-center space-y-2">
            <p className="text-sm font-bold text-ink-700">Chưa có lớp điểm danh nào</p>
            <p className="text-xs text-ink-500">
              Bấm "Tạo Lớp / Nhập Excel SV" và tải lên file danh sách điểm danh của lớp để bắt đầu.
            </p>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2.5 pt-1">
            <select
              value={selectedClassId}
              onChange={(e) => setSelectedClassId(e.target.value)}
              className="flex-1 min-w-[260px] h-10 px-3 rounded-xl border border-slate-300 bg-white text-xs font-bold text-ink-900"
            >
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title} ({c.rosterEntries.length} SV • {c.semester || 'HK'})
                </option>
              ))}
            </select>
            {selectedClass && (
              <>
                <button
                  type="button"
                  onClick={() => openEditClassModal(selectedClass)}
                  className="h-10 px-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-bold text-ink-700 flex items-center gap-1.5"
                >
                  <Users className="w-3.5 h-3.5" />
                  Sửa lớp / DS ({selectedClass.rosterEntries.length})
                </button>
                <button
                  type="button"
                  onClick={openCreateSessionModal}
                  className="h-10 px-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5"
                >
                  <QrCode className="w-3.5 h-3.5" />
                  + Tạo Buổi Điểm Danh
                </button>
                {sessions.length > 0 && (
                  <button
                    type="button"
                    onClick={() => void handleExportMatrix()}
                    className="h-10 px-3 rounded-xl border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-bold flex items-center gap-1.5"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                    Xuất Tổng hợp ({sessions.length} buổi)
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void handleDeleteClass()}
                  className="h-10 px-2.5 rounded-xl border border-rose-200 text-rose-600 hover:bg-rose-50"
                  title="Xóa lớp điểm danh"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Sessions & Active Session Post-Check Table */}
      {selectedClass && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Left: Sessions List */}
          <div className="lg:col-span-4 bg-white rounded-2xl border border-slate-200 shadow-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-extrabold text-ink-900">
                Các buổi điểm danh ({sessions.length})
              </h3>
              <button
                type="button"
                onClick={() => void loadSessions(selectedClass.id)}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-ink-500"
                title="Làm mới"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>
            {sessions.length === 0 ? (
              <p className="text-xs text-ink-500 py-4 text-center">
                Chưa có buổi điểm danh nào. Bấm "+ Tạo Buổi Điểm Danh" để mở QR.
              </p>
            ) : (
              <div className="space-y-2 max-h-[540px] overflow-y-auto pr-1">
                {sessions.map((s) => {
                  const active = s.id === selectedSessionId;
                  return (
                    <div
                      key={s.id}
                      onClick={() => setSelectedSessionId(s.id)}
                      className={`p-3 rounded-xl border cursor-pointer transition space-y-1.5 ${
                        active
                          ? 'border-brand-500 bg-brand-50/60'
                          : 'border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xs font-extrabold text-ink-900 truncate">{s.title}</p>
                          <p className="text-[11px] text-ink-500 flex items-center gap-1.5 mt-0.5">
                            <Calendar className="w-3 h-3" />
                            <span>{s.sessionDate}</span>
                            <span>•</span>
                            <span className="font-mono font-bold text-brand-700">PIN {s.checkinPin}</span>
                            {s.sessionPasscode && (
                              <span className="font-mono text-amber-700">• Pass: {s.sessionPasscode}</span>
                            )}
                          </p>
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold shrink-0 ${
                            s.status === 'OPEN'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-slate-200 text-slate-700'
                          }`}
                        >
                          {s.status === 'OPEN' ? 'ĐANG MỞ' : 'ĐÃ ĐÓNG'}
                        </span>
                      </div>
                      {s.stats && (
                        <div className="flex flex-wrap gap-1.5 text-[10px] font-bold">
                          <span className="text-emerald-700">Có mặt: {s.stats.present}</span>
                          <span className="text-amber-700">Muộn: {s.stats.late}</span>
                          <span className="text-sky-700">CP: {s.stats.excused}</span>
                          <span className="text-rose-700">KP: {s.stats.unexcused}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right: Session Detail + Post-check Table */}
          <div className="lg:col-span-8 bg-white rounded-2xl border border-slate-200 shadow-card p-4 sm:p-5 space-y-4">
            {!activeSession ? (
              <div className="py-12 text-center text-xs text-ink-500">
                Chọn một buổi điểm danh bên trái để xem chi tiết, chiếu QR và hậu kiểm vắng.
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-start justify-between gap-3 pb-3 border-b border-slate-100">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-extrabold text-ink-900">
                        {activeSession.title}
                      </h3>
                      <span className="px-2 py-0.5 rounded-lg bg-slate-100 font-mono text-xs font-bold text-ink-800">
                        PIN: {activeSession.checkinPin}
                      </span>
                      {activeSession.sessionPasscode && (
                        <span className="px-2 py-0.5 rounded-lg bg-amber-100 font-mono text-xs font-bold text-amber-900">
                          Pass: {activeSession.sessionPasscode}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-ink-500 mt-1">
                      {activeSession.requireGps
                        ? `GPS bật (bán kính ${activeSession.maxDistanceMeters}m)`
                        : 'Không bắt buộc GPS'}{' '}
                      •{' '}
                      {activeSession.blockDuplicateDevice
                        ? 'Chặn 1 máy quét nhiều SV'
                        : 'Cảnh báo trùng máy'}
                      {activeSession.rotateQrSeconds > 0
                        ? ` • QR đổi mỗi ${activeSession.rotateQrSeconds}s`
                        : ''}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setProjectorOpen(true)}
                      className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-1.5"
                    >
                      <QrCode className="w-3.5 h-3.5" />
                      Chiếu QR
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        const next = activeSession.status === 'OPEN' ? 'CLOSED' : 'OPEN';
                        const res = await toggleAttendanceSessionStatus(activeSession.id, next);
                        if (res.ok && res.session) {
                          setActiveSession(res.session);
                          await loadSessions(selectedClass.id);
                          onToast(next === 'CLOSED' ? 'Đã đóng quét QR.' : 'Đã mở lại quét QR.');
                        }
                      }}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 border ${
                        activeSession.status === 'OPEN'
                          ? 'border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100'
                          : 'border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                      }`}
                    >
                      {activeSession.status === 'OPEN' ? (
                        <>
                          <Lock className="w-3.5 h-3.5" /> Đóng quét QR
                        </>
                      ) : (
                        <>
                          <Unlock className="w-3.5 h-3.5" /> Mở lại QR
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        exportAttendanceSessionXlsx(selectedClass, activeSession, records)
                      }
                      className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Xuất Excel
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        if (!window.confirm(`Xóa buổi "${activeSession.title}"?`)) return;
                        const res = await deleteAttendanceSession(activeSession.id);
                        if (res.ok) {
                          setSelectedSessionId('');
                          await loadSessions(selectedClass.id);
                          onToast('Đã xóa buổi điểm danh.');
                        }
                      }}
                      className="p-1.5 rounded-xl border border-rose-200 text-rose-600 hover:bg-rose-50"
                      title="Xóa buổi"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Filter Chips */}
                <div className="flex flex-wrap gap-1.5 text-xs">
                  {(
                    [
                      ['ALL', `Tất cả (${liveStats.total})`],
                      ['PRESENT', `Có mặt (${liveStats.present})`],
                      ['LATE', `Đi muộn (${liveStats.late})`],
                      ['ABSENT_EXCUSED', `Vắng có phép (${liveStats.excused})`],
                      ['ABSENT_UNEXCUSED', `Vắng không phép (${liveStats.unexcused})`],
                      ['ALERTS', `⚠️ Cảnh báo (${liveStats.alerts})`],
                    ] as const
                  ).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => {
                        setFilterStatus(key);
                        setPage(1);
                      }}
                      className={`px-2.5 py-1 rounded-full font-bold border transition ${
                        filterStatus === key
                          ? 'bg-brand-600 text-white border-brand-600'
                          : 'bg-slate-50 text-ink-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {/* Search & Bulk Save Bar */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="relative flex-1 min-w-[200px]">
                    <Search className="w-3.5 h-3.5 text-ink-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      value={search}
                      onChange={(e) => {
                        setSearch(e.target.value);
                        setPage(1);
                      }}
                      placeholder="Tìm MSSV, Họ tên, Lớp..."
                      className="w-full h-9 pl-8 pr-3 rounded-xl border border-slate-200 text-xs"
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={handleMarkUnscannedUnexcused}
                      className="h-9 px-3 rounded-xl border border-slate-200 hover:bg-slate-50 text-xs font-bold text-ink-700"
                    >
                      Chưa quét → Vắng KP
                    </button>
                    <button
                      type="button"
                      disabled={dirtyCount === 0 || savingBulk}
                      onClick={() => void handleSaveBulk()}
                      className="h-9 px-3.5 rounded-xl bg-brand-600 hover:bg-brand-700 disabled:opacity-40 text-white text-xs font-bold flex items-center gap-1.5"
                    >
                      <Save className="w-3.5 h-3.5" />
                      {savingBulk ? 'Đang lưu...' : `Lưu thay đổi (${dirtyCount})`}
                    </button>
                  </div>
                </div>

                {/* Table */}
                <div className="overflow-x-auto border border-slate-200 rounded-xl">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 text-ink-600 border-b border-slate-200">
                        <th className="py-2.5 px-3 font-bold">Sinh viên</th>
                        <th className="py-2.5 px-2 font-bold">Thiết bị & GPS</th>
                        <th className="py-2.5 px-2 font-bold">Trạng thái (1 chạm)</th>
                        <th className="py-2.5 px-3 font-bold">Ghi chú / Lý do phép</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {pagedRecords.pageItems.map((r) => {
                        const effStatus = getEffectiveStatus(r);
                        const effNote = getEffectiveNote(r);
                        const isDirty = Boolean(draftEdits[r.id]);
                        return (
                          <tr key={r.id} className={isDirty ? 'bg-amber-50/40' : 'hover:bg-slate-50/70'}>
                            <td className="py-2 px-3 align-top">
                              <div className="font-bold text-ink-900">{r.studentName}</div>
                              <div className="text-[11px] font-mono text-ink-500">
                                {r.studentCode}
                                {r.className ? ` • ${r.className}` : ''}
                              </div>
                            </td>
                            <td className="py-2 px-2 align-top text-[11px]">
                              {r.checkInSource === 'QR_SCAN' ? (
                                <div className="space-y-0.5">
                                  <div className="flex items-center gap-1 text-ink-700 font-semibold">
                                    <Smartphone className="w-3 h-3 text-brand-600" />
                                    <span>{r.deviceLabel || 'Mobile'}</span>
                                  </div>
                                  <div className="text-ink-500 flex items-center gap-1">
                                    <Clock className="w-3 h-3" />
                                    <span>
                                      {r.checkedInAt
                                        ? new Date(r.checkedInAt).toLocaleTimeString('vi-VN', {
                                            hour: '2-digit',
                                            minute: '2-digit',
                                          })
                                        : '—'}
                                    </span>
                                    {r.distanceMeters !== null && (
                                      <span className="inline-flex items-center gap-0.5 ml-1">
                                        <MapPin className="w-3 h-3" /> {r.distanceMeters}m
                                      </span>
                                    )}
                                  </div>
                                  {(r.deviceFlag || r.locationFlag) && (
                                    <div className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 font-bold text-[10px]">
                                      <AlertTriangle className="w-3 h-3" />
                                      {[r.deviceFlag, r.locationFlag].filter(Boolean).join(' • ')}
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <span className="text-ink-400 italic">Chưa quét QR</span>
                              )}
                            </td>
                            <td className="py-2 px-2 align-top">
                              <div className="flex flex-wrap gap-1">
                                {(
                                  [
                                    ['PRESENT', 'Có mặt'],
                                    ['LATE', 'Muộn'],
                                    ['ABSENT_EXCUSED', 'Vắng CP'],
                                    ['ABSENT_UNEXCUSED', 'Vắng KP'],
                                  ] as const
                                ).map(([stKey, stShort]) => {
                                  const active = effStatus === stKey;
                                  return (
                                    <button
                                      key={stKey}
                                      type="button"
                                      onClick={() =>
                                        updateRowDraft(r, { attendanceStatus: stKey })
                                      }
                                      className={`px-2 py-1 rounded-lg text-[10px] font-bold border transition ${
                                        active
                                          ? STATUS_BADGE[stKey].cls
                                          : 'bg-white text-ink-500 border-slate-200 hover:bg-slate-50'
                                      }`}
                                    >
                                      {stShort}
                                    </button>
                                  );
                                })}
                              </div>
                            </td>
                            <td className="py-2 px-3 align-top">
                              <input
                                type="text"
                                value={effNote}
                                onChange={(e) => updateRowDraft(r, { note: e.target.value })}
                                placeholder="VD: Xin nghỉ ốm..."
                                className="w-full min-w-[140px] h-8 px-2.5 rounded-lg border border-slate-200 text-xs"
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <PaginationBar
                  currentPage={pagedRecords.safePage}
                  totalItems={filteredRecords.length}
                  pageSize={pageSize}
                  onPageChange={setPage}
                  onPageSizeChange={(sz) => {
                    setPageSize(sz);
                    setPage(1);
                  }}
                  itemLabel="sinh viên"
                />
              </>
            )}
          </div>
        </div>
      )}

      {/* Modal: Create / Edit Class + Import Excel */}
      {classModalOpen && (
        <div className="fixed inset-0 z-[105] bg-ink-900/60 flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-white rounded-2xl border border-slate-200 shadow-2xl p-5 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-extrabold text-ink-900">
                {editingClassId ? 'Cập nhật Lớp điểm danh' : 'Tạo Lớp điểm danh mới'}
              </h3>
              <button
                type="button"
                onClick={() => setClassModalOpen(false)}
                className="p-1 rounded-lg hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 space-y-2 text-xs">
              <p className="font-bold text-emerald-900">
                Bước 1: Nhập danh sách sinh viên từ Excel (tự động điền tên môn, học kỳ)
              </p>
              <div className="flex flex-wrap gap-2">
                <input
                  ref={rosterInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={handleUploadClassExcel}
                />
                <button
                  type="button"
                  onClick={() => rosterInputRef.current?.click()}
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold flex items-center gap-1.5"
                >
                  <Upload className="w-3.5 h-3.5" />
                  Chọn file Excel lớp (.xlsx)
                </button>
                <button
                  type="button"
                  onClick={downloadAttendanceTemplateXlsx}
                  className="px-3 py-1.5 rounded-lg border border-emerald-300 bg-white text-emerald-800 font-bold flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  Tải file mẫu
                </button>
              </div>
              {clsParseNotice && (
                <p className="text-emerald-800 font-semibold">{clsParseNotice}</p>
              )}
            </div>

            <form onSubmit={handleSaveClass} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-ink-700 mb-1">Tên lớp học phần *</label>
                <input
                  type="text"
                  required
                  value={clsTitle}
                  onChange={(e) => setClsTitle(e.target.value)}
                  placeholder="VD: 012307641802 - 23DLG1B - E-Marketing và TMĐT"
                  className="w-full h-10 px-3 rounded-xl border border-slate-300"
                />
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block font-bold text-ink-700 mb-1">Mã lớp / HP</label>
                  <input
                    type="text"
                    value={clsCode}
                    onChange={(e) => setClsCode(e.target.value)}
                    placeholder="VD: 23DLG1B"
                    className="w-full h-10 px-3 rounded-xl border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block font-bold text-ink-700 mb-1">Học kỳ</label>
                  <input
                    type="text"
                    value={clsSemester}
                    onChange={(e) => setClsSemester(e.target.value)}
                    className="w-full h-10 px-3 rounded-xl border border-slate-300"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block font-bold text-ink-700 mb-1">Giảng viên</label>
                  <input
                    type="text"
                    value={clsInstructor}
                    onChange={(e) => setClsInstructor(e.target.value)}
                    className="w-full h-10 px-3 rounded-xl border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block font-bold text-ink-700 mb-1">Số tín chỉ</label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={clsCredits}
                    onChange={(e) => setClsCredits(Number(e.target.value) || 3)}
                    className="w-full h-10 px-3 rounded-xl border border-slate-300"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setClassModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 font-bold text-ink-700"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-bold"
                >
                  Lưu Lớp ({clsRoster.length} SV)
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Create Session */}
      {sessionModalOpen && selectedClass && (
        <div className="fixed inset-0 z-[105] bg-ink-900/60 flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-white rounded-2xl border border-slate-200 shadow-2xl p-5 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-extrabold text-ink-900">
                Tạo Buổi Điểm Danh QR Mới
              </h3>
              <button
                type="button"
                onClick={() => setSessionModalOpen(false)}
                className="p-1 rounded-lg hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleCreateSession} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-ink-700 mb-1">Tên buổi điểm danh *</label>
                <input
                  type="text"
                  required
                  value={sesTitle}
                  onChange={(e) => setSesTitle(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl border border-slate-300"
                />
              </div>
              <div className="grid grid-cols-3 gap-2.5">
                <div>
                  <label className="block font-bold text-ink-700 mb-1">Ngày học</label>
                  <input
                    type="date"
                    value={sesDate}
                    onChange={(e) => setSesDate(e.target.value)}
                    className="w-full h-10 px-2.5 rounded-xl border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block font-bold text-ink-700 mb-1">Số tiết</label>
                  <input
                    type="number"
                    min={1}
                    max={15}
                    value={sesPeriods}
                    onChange={(e) => setSesPeriods(Number(e.target.value) || 3)}
                    className="w-full h-10 px-3 rounded-xl border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block font-bold text-ink-700 mb-1">Đi muộn sau (phút)</label>
                  <input
                    type="number"
                    min={0}
                    max={120}
                    value={sesLateMin}
                    onChange={(e) => setSesLateMin(Number(e.target.value) || 0)}
                    className="w-full h-10 px-3 rounded-xl border border-slate-300"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block font-bold text-ink-700 mb-1 flex items-center gap-1">
                    <KeyRound className="w-3.5 h-3.5 text-brand-600" />
                    Mật khẩu buổi học (Passcode)
                  </label>
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      value={sesPasscode}
                      onChange={(e) => setSesPasscode(e.target.value)}
                      placeholder="Bỏ trống nếu tắt"
                      className="flex-1 h-10 px-3 rounded-xl border border-slate-300 font-mono font-bold"
                    />
                    <button
                      type="button"
                      onClick={() => setSesPasscode(randomPasscode4())}
                      className="px-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 font-bold"
                      title="Đổi mã khác"
                    >
                      ↻
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block font-bold text-ink-700 mb-1">QR Động (chống gửi ảnh)</label>
                  <select
                    value={sesRotateSec}
                    onChange={(e) => setSesRotateSec(Number(e.target.value))}
                    className="w-full h-10 px-2.5 rounded-xl border border-slate-300 font-bold"
                  >
                    <option value={0}>QR Tĩnh (không đổi mã)</option>
                    <option value={20}>Đổi mã mỗi 20 giây</option>
                    <option value={30}>Đổi mã mỗi 30 giây (Khuyên dùng)</option>
                  </select>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <label className="flex items-center gap-2 font-semibold text-ink-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={sesBlockDup}
                    onChange={(e) => setSesBlockDup(e.target.checked)}
                  />
                  Chặn cứng 1 điện thoại điểm danh giùm nhiều MSSV
                </label>
                <label className="flex items-center gap-2 font-semibold text-ink-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={sesRequireGps}
                    onChange={(e) => setSesRequireGps(e.target.checked)}
                  />
                  Bắt buộc bật Vị trí GPS (bán kính {sesMaxDist}m)
                </label>
                {sesRequireGps && (
                  <div className="flex flex-wrap items-center gap-2 pl-5">
                    <span>Bán kính (m):</span>
                    <input
                      type="number"
                      min={30}
                      max={2000}
                      value={sesMaxDist}
                      onChange={(e) => setSesMaxDist(Number(e.target.value) || 200)}
                      className="w-20 h-8 px-2 rounded-lg border border-slate-300 font-mono font-bold"
                    />
                    <button
                      type="button"
                      onClick={handlePinInstructorGps}
                      className="px-2.5 py-1 rounded-lg border border-emerald-300 bg-emerald-50 text-emerald-800 font-bold flex items-center gap-1"
                    >
                      <MapPin className="w-3 h-3" />
                      {sesInstLat ? 'Đã khóa GPS phòng học ✓' : 'Lấy GPS phòng học hiện tại'}
                    </button>
                  </div>
                )}
                <div className="space-y-1.5 pb-2 border-b border-slate-200">
                  <p className="font-extrabold text-ink-800">Chế độ danh sách sinh viên:</p>
                  <label
                    className={`flex items-start gap-2 p-2 rounded-lg border cursor-pointer ${
                      sesRequireRoster
                        ? 'bg-white border-brand-400'
                        : 'border-transparent hover:bg-white/60'
                    } ${selectedClass.rosterEntries.length === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <input
                      type="radio"
                      name="rosterMode"
                      disabled={selectedClass.rosterEntries.length === 0}
                      checked={sesRequireRoster}
                      onChange={() => setSesRequireRoster(true)}
                      className="mt-0.5"
                    />
                    <div>
                      <span className="font-bold text-ink-900">
                        Đối chiếu danh sách lớp đã nhập ({selectedClass.rosterEntries.length} SV)
                      </span>
                      <p className="text-[11px] text-ink-500">
                        Chỉ SV có trong file Excel lớp mới quét được; người chưa quét tự thành Vắng.
                      </p>
                    </div>
                  </label>
                  <label
                    className={`flex items-start gap-2 p-2 rounded-lg border cursor-pointer ${
                      !sesRequireRoster
                        ? 'bg-white border-emerald-500'
                        : 'border-transparent hover:bg-white/60'
                    }`}
                  >
                    <input
                      type="radio"
                      name="rosterMode"
                      checked={!sesRequireRoster}
                      onChange={() => setSesRequireRoster(false)}
                      className="mt-0.5"
                    />
                    <div>
                      <span className="font-bold text-emerald-900">
                        Không cần danh sách lớp — Sinh viên tự nhập thông tin
                      </span>
                      <p className="text-[11px] text-ink-500">
                        SV quét QR tự nhập MSSV, Họ đệm, Tên, Lớp học theo mẫu Excel để GV tải về sau buổi học.
                      </p>
                    </div>
                  </label>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSessionModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 font-bold text-ink-700"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                >
                  Mở Buổi & Chiếu QR Ngay
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Projector QR Modal */}
      {projectorOpen && activeSession && selectedClass && (
        <div className="fixed inset-0 z-50 bg-slate-950/95 text-white overflow-y-auto p-4 sm:p-8 flex flex-col items-center justify-center gap-5">
          <button
            type="button"
            onClick={() => setProjectorOpen(false)}
            className="fixed top-4 right-4 z-10 h-10 px-4 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold flex items-center gap-1.5"
          >
            <X className="w-4 h-4" /> Đóng màn hình chiếu
          </button>

          <div className="max-w-4xl w-full bg-slate-900/90 border border-white/15 rounded-3xl p-6 sm:p-8 shadow-2xl flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex-1 space-y-4 text-center md:text-left">
              <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/30 text-emerald-200 text-xs font-bold">
                {selectedClass.title}
              </span>
              <h2 className="text-xl sm:text-2xl font-extrabold text-white">
                {activeSession.title}
              </h2>
              <div className="flex flex-wrap items-center justify-center md:justify-start gap-6">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
                    Mã PIN Điểm danh
                  </p>
                  <div className="text-5xl sm:text-6xl font-mono font-black tracking-[0.15em] text-amber-300 mt-1">
                    {activeSession.checkinPin}
                  </div>
                </div>
                {activeSession.sessionPasscode && (
                  <div>
                    <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-slate-400">
                      <span>Mật khẩu (Passcode)</span>
                      <button
                        type="button"
                        onClick={() => setShowPassOnProjector((v) => !v)}
                        className="p-1 rounded bg-white/10 hover:bg-white/20 text-white"
                        title={showPassOnProjector ? 'Ẩn để đọc miệng' : 'Hiện lên màn chiếu'}
                      >
                        {showPassOnProjector ? (
                          <EyeOff className="w-3.5 h-3.5" />
                        ) : (
                          <Eye className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                    <div className="text-3xl sm:text-4xl font-mono font-black text-emerald-300 mt-1">
                      {showPassOnProjector ? activeSession.sessionPasscode : '••••'}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-center md:justify-start gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard?.writeText(checkInUrl).then(() => {
                      setCopiedLink(true);
                      window.setTimeout(() => setCopiedLink(false), 2000);
                    }).catch(() => {});
                  }}
                  className="h-10 px-4 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-xs font-bold flex items-center gap-2"
                >
                  <Copy className="w-4 h-4" />
                  {copiedLink ? 'Đã sao chép link!' : 'Sao chép link điểm danh'}
                </button>
                <span className="px-3 py-2 rounded-xl bg-emerald-500/20 text-emerald-200 border border-emerald-400/30 text-xs font-bold flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" />
                  Đã điểm danh: {liveStats.present + liveStats.late} / {liveStats.total} SV
                </span>
              </div>
              {activeSession.rotateQrSeconds > 0 && (
                <p className="text-xs text-amber-200">
                  ● QR bảo mật động: tự động đổi mã mỗi {activeSession.rotateQrSeconds} giây (không gửi ảnh chụp ra ngoài).
                </p>
              )}
            </div>

            <div className="bg-white p-4 rounded-3xl shadow-xl shrink-0 text-center">
              {qrDataUrl ? (
                <img
                  src={qrDataUrl}
                  alt={`QR Điểm danh ${activeSession.checkinPin}`}
                  className="w-56 h-56 sm:w-64 sm:h-64 rounded-xl"
                />
              ) : (
                <div className="w-56 h-56 flex items-center justify-center text-xs text-ink-500">
                  Đang tạo mã QR...
                </div>
              )}
              <p className="text-[11px] font-bold text-ink-700 mt-2">
                Quét Camera điện thoại để điểm danh
              </p>
            </div>
          </div>

          <div className="max-w-4xl w-full bg-slate-900/90 border border-white/15 rounded-3xl p-5 shadow-xl space-y-3">
            <h3 className="text-sm font-extrabold text-white">
              Sinh viên vừa điểm danh thành công ({liveStats.present + liveStats.late})
            </h3>
            <div className="flex flex-wrap gap-2 max-h-44 overflow-y-auto">
              {records
                .filter((r) => r.checkInSource === 'QR_SCAN')
                .map((r) => (
                  <div
                    key={r.id}
                    className="px-3 py-1.5 rounded-xl bg-slate-800 border border-white/15 text-xs flex items-center gap-2"
                  >
                    <span className="font-bold text-white">{r.studentName}</span>
                    <span className="font-mono text-emerald-300">{r.studentCode}</span>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
