import React, { useEffect, useRef, useState } from 'react';
import {
  AlertOctagon,
  CheckCircle2,
  Clock,
  Download,
  FileText,
  Mail,
  MapPin,
  MonitorSmartphone,
  Plus,
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
import { InfoHint } from '../common/InfoHint';
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
}) => {
  const [tickNow, setTickNow] = useState(Date.now());
  const [editingEmailId, setEditingEmailId] = useState<string | null>(null);
  const [emailDraft, setEmailDraft] = useState('');
  const [showRosterTable, setShowRosterTable] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<'ALL' | 'IN_PROGRESS' | 'ALERTS' | 'ABSENT'>('ALL');
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
  const normalizedSearch = searchQuery.trim().toLowerCase();
  const filteredAttempts = examAttempts.filter((a) => {
    if (filterMode === 'IN_PROGRESS' && a.status !== 'IN_PROGRESS' && a.status !== 'LOCKED') {
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
    if (!normalizedSearch) return true;
    return (
      a.studentCode.toLowerCase().includes(normalizedSearch) ||
      a.studentName.toLowerCase().includes(normalizedSearch)
    );
  });

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
      {/* Live Status Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border border-slate-200 p-3.5 shadow-soft">
          <div className="text-[11px] font-bold text-support-700 uppercase">Đang làm bài</div>
          <div className="text-2xl font-mono font-extrabold text-ink-900 mt-1">
            {countInProgress}
          </div>
        </div>
        <div className="bg-white rounded-xl border border-rose-200 p-3.5 shadow-soft">
          <div className="text-[11px] font-bold text-rose-700 uppercase">
            Khóa chờ duyệt (LOCKED)
          </div>
          <div className="text-2xl font-mono font-extrabold text-rose-700 mt-1">
            {countLocked}
          </div>
        </div>
        <div className="bg-white rounded-xl border border-amber-200 p-3.5 shadow-soft">
          <div className="text-[11px] font-bold text-amber-700 uppercase">Cờ nghi vấn AI / Máy 2</div>
          <div className="text-2xl font-mono font-extrabold text-amber-700 mt-1">
            {countAiFlagged}
          </div>
        </div>
        <div className="bg-white rounded-xl border border-brand-200 p-3.5 shadow-soft">
          <div className="text-[11px] font-bold text-brand-700 uppercase">Đã nộp / Thu bài</div>
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
              text="Mã để phát cho sinh viên nhập khi vào phòng thi."
            />
            <span>• PIN cứu hộ:</span>
            <strong className="font-mono">{exam.unlockPin}</strong>
            <InfoHint
              title="PIN cứu hộ (Mở khóa tại chỗ)"
              text="Mã bí mật chỉ giảng viên giữ. Khi sinh viên bị khóa màn hình do rời tab quá số lần, giảng viên có thể đọc/nhập mã này ngay trên máy sinh viên để mở khóa thi tiếp."
            />
          </span>
        </div>
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
            text="Đóng phòng thi, tự động thu toàn bộ bài sinh viên đang làm dở/bị khóa và gửi bảng điểm tổng hợp về Email giảng viên."
          />
        </button>
      </div>

      {/* Student Roster Import & Verification Card */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3 shadow-soft">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2 text-xs font-extrabold text-ink-900 flex-wrap">
              <Users className="w-4 h-4 text-brand-600" />
              <span>Danh sách Sinh viên Ca thi (Xác thực thông tin khi vào phòng)</span>
              <InfoHint
                title="Danh sách sinh viên riêng của ca thi"
                text="Tải lên file Excel danh sách lớp để hệ thống kiểm tra đúng MSSV, Họ tên, Giới tính, Ngày sinh khi sinh viên đăng nhập vào phòng thi."
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
          <div className="max-h-60 overflow-auto border border-slate-200 rounded-xl">
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
                {rosterEntries.map((st, idx) => (
                  <tr key={st.studentCode} className="hover:bg-slate-50/70">
                    <td className="px-3 py-1.5 text-ink-500">{idx + 1}</td>
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
        )}
      </div>

      {/* Prominent LOCKED Instructor Approval Queue */}
      {lockedQueue.length > 0 && (
        <div className="bg-rose-50 border-2 border-rose-300 rounded-2xl p-4 space-y-3">
          <div className="flex items-center gap-2 text-rose-900 font-bold text-sm">
            <AlertOctagon className="w-5 h-5 text-rose-600 shrink-0" />
            Hàng đợi Phê duyệt Sinh viên Vượt ngưỡng ({lockedQueue.length} thí sinh đang chờ quyết định)
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
            Cảnh báo Bất thường Vị trí &amp; Đa thiết bị / Đa trình duyệt
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
        <div className="p-3.5 border-b border-slate-200 bg-slate-50/70 flex flex-wrap items-center justify-between gap-2.5">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="w-3.5 h-3.5 text-ink-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm theo MSSV hoặc Họ tên..."
              className="w-full h-8 pl-8 pr-3 rounded-lg border border-slate-200 bg-white text-xs text-ink-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
            <button
              type="button"
              onClick={() => setFilterMode('ALL')}
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
              onClick={() => setFilterMode('IN_PROGRESS')}
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
              onClick={() => setFilterMode('ALERTS')}
              className={`px-2.5 py-1 rounded-lg font-bold border transition ${
                filterMode === 'ALERTS'
                  ? 'bg-rose-600 text-white border-rose-600'
                  : 'bg-white text-ink-700 border-slate-200 hover:border-rose-300'
              }`}
            >
              Cảnh báo ({farLocationAttempts.length + multiDeviceAttempts.length})
            </button>
            {rosterEntries.length > 0 && (
              <button
                type="button"
                onClick={() => setFilterMode('ABSENT')}
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
                {absentRosterStudents
                  .filter((st) =>
                    !normalizedSearch
                      ? true
                      : st.studentCode.toLowerCase().includes(normalizedSearch) ||
                        `${st.lastName} ${st.firstName}`.toLowerCase().includes(normalizedSearch),
                  )
                  .map((st, idx) => (
                    <tr key={st.studentCode} className="hover:bg-amber-50/30">
                      <td className="py-2 px-3.5 text-ink-500">{idx + 1}</td>
                      <td className="py-2 px-3.5 font-mono font-bold text-brand-700">{st.studentCode}</td>
                      <td className="py-2 px-3.5 text-ink-800">{st.lastName}</td>
                      <td className="py-2 px-3.5 font-semibold text-ink-900">{st.firstName}</td>
                      <td className="py-2 px-3.5 text-ink-700">{st.gender}</td>
                      <td className="py-2 px-3.5 font-mono text-ink-700">{st.dob}</td>
                    </tr>
                  ))}
                {absentRosterStudents.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-support-700 font-bold">
                      Tất cả sinh viên trong danh sách đã vào phòng thi!
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        ) : (
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
                      text="Hiển thị tọa độ GPS lúc vào phòng và tên thiết bị/trình duyệt. Hệ thống tự cảnh báo màu đỏ nếu vị trí ở xa lớp học hoặc có dấu hiệu đăng nhập nhiều máy/trình duyệt."
                    />
                  </span>
                </th>
                <th className="py-3 px-3.5">Tiến độ</th>
                <th className="py-3 px-3.5">
                  <span className="inline-flex items-center gap-1">
                    <span>Vi phạm / Tin cậy</span>
                    <InfoHint
                      title="Số lần rời màn hình & Điểm tin cậy"
                      text="Đếm số lần sinh viên thoát trình duyệt/chuyển tab và tổng số giây rời khỏi bài thi. Điểm tin cậy càng cao thì bài thi càng ít bất thường."
                    />
                  </span>
                </th>
                <th className="py-3 px-3.5">Điểm (Hệ 10)</th>
                <th className="py-3 px-3.5">Email</th>
                <th className="py-3 px-3.5 text-right">
                  <span className="inline-flex items-center justify-end gap-1">
                    <span>Điều khiển</span>
                    <InfoHint
                      title="Các nút thao tác nhanh"
                      text="Từ trái sang phải: 1) Chấm/Rà soát Tự luận; 2) Reset thiết bị (cho phép SV đổi máy); 3) Cộng thêm +60 giây; 4) Sửa Email & gửi lại bảng điểm."
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
                filteredAttempts.map((a) => {
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
        )}
      </div>
    </div>
  );
};
