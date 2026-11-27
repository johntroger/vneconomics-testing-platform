import * as XLSX from 'xlsx';
import { apiRequestDetailed, getTodayVnDateKey } from './apiClient';
import type { AttendanceRosterStudent } from '../types/attendance';
import type {
  AddPointsEntryInput,
  ClassPointsSummaryResponse,
  FixedClassSummary,
  PointLedgerEntry,
  SemesterCode,
  StatsPeriodMode,
  StudentPointSummary,
} from '../types/classPoints';

export interface ApiResult<T> {
  ok: boolean;
  status: number;
  data: T | null;
  error?: string;
}

export async function listFixedClasses(): Promise<ApiResult<FixedClassSummary[]>> {
  const res = await apiRequestDetailed<{ ok?: boolean; classes?: FixedClassSummary[]; error?: string }>(
    '/api/class_points.php?action=list_classes',
  );
  if (res.ok && res.data?.ok && Array.isArray(res.data.classes)) {
    return { ok: true, status: res.status, data: res.data.classes };
  }
  return {
    ok: false,
    status: res.status,
    data: null,
    error: res.error ?? res.data?.error ?? 'Không thể tải danh sách lớp cố định.',
  };
}

export async function saveFixedClass(payload: {
  id?: string;
  title: string;
  classCode?: string;
  semester?: string;
  credits?: number;
  instructorName?: string;
  rosterEntries: AttendanceRosterStudent[];
}): Promise<ApiResult<FixedClassSummary>> {
  const res = await apiRequestDetailed<{ ok?: boolean; classItem?: FixedClassSummary; error?: string }>(
    '/api/class_points.php?action=save_class',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
  );
  if (res.ok && res.data?.ok && res.data.classItem) {
    return { ok: true, status: res.status, data: res.data.classItem };
  }
  return {
    ok: false,
    status: res.status,
    data: null,
    error: res.error ?? res.data?.error ?? 'Không thể lưu lớp cố định.',
  };
}

export async function deleteFixedClass(classId: string): Promise<ApiResult<boolean>> {
  const res = await apiRequestDetailed<{ ok?: boolean; error?: string }>(
    '/api/class_points.php?action=delete_class',
    {
      method: 'POST',
      body: JSON.stringify({ classId }),
    },
  );
  if (res.ok && res.data?.ok) {
    return { ok: true, status: res.status, data: true };
  }
  return {
    ok: false,
    status: res.status,
    data: null,
    error: res.error ?? res.data?.error ?? 'Không thể xóa lớp cố định.',
  };
}

export async function fetchClassPointsSummary(
  classId: string,
  startDate = '',
  endDate = '',
): Promise<ApiResult<ClassPointsSummaryResponse>> {
  const qs = new URLSearchParams({ action: 'class_summary', classId });
  if (startDate) qs.set('startDate', startDate);
  if (endDate) qs.set('endDate', endDate);
  const res = await apiRequestDetailed<ClassPointsSummaryResponse & { error?: string }>(
    `/api/class_points.php?${qs.toString()}`,
  );
  if (res.ok && res.data?.ok) {
    return { ok: true, status: res.status, data: res.data };
  }
  return {
    ok: false,
    status: res.status,
    data: null,
    error: res.error ?? res.data?.error ?? 'Không thể tải sổ điểm tích lũy của lớp.',
  };
}

export async function recordClassPoints(
  classId: string,
  entries: AddPointsEntryInput[],
): Promise<ApiResult<{ addedCount: number; entries: PointLedgerEntry[] }>> {
  const res = await apiRequestDetailed<{
    ok?: boolean;
    addedCount?: number;
    entries?: PointLedgerEntry[];
    error?: string;
  }>('/api/class_points.php?action=add_points', {
    method: 'POST',
    body: JSON.stringify({ classId, entries }),
  });
  if (res.ok && res.data?.ok) {
    return {
      ok: true,
      status: res.status,
      data: {
        addedCount: res.data.addedCount ?? entries.length,
        entries: res.data.entries ?? [],
      },
    };
  }
  return {
    ok: false,
    status: res.status,
    data: null,
    error: res.error ?? res.data?.error ?? 'Không thể lưu điểm lên máy chủ.',
  };
}

export async function deleteClassPointEntry(entryId: string): Promise<ApiResult<boolean>> {
  const res = await apiRequestDetailed<{ ok?: boolean; error?: string }>(
    '/api/class_points.php?action=delete_entry',
    {
      method: 'POST',
      body: JSON.stringify({ entryId }),
    },
  );
  if (res.ok && res.data?.ok) {
    return { ok: true, status: res.status, data: true };
  }
  return {
    ok: false,
    status: res.status,
    data: null,
    error: res.error ?? res.data?.error ?? 'Không thể hoàn tác dòng điểm này.',
  };
}

export async function resetClassPoints(
  classId: string,
  startDate = '',
  endDate = '',
): Promise<ApiResult<boolean>> {
  const res = await apiRequestDetailed<{ ok?: boolean; error?: string }>(
    '/api/class_points.php?action=reset_class_points',
    {
      method: 'POST',
      body: JSON.stringify({ classId, startDate, endDate }),
    },
  );
  if (res.ok && res.data?.ok) {
    return { ok: true, status: res.status, data: true };
  }
  return {
    ok: false,
    status: res.status,
    data: null,
    error: res.error ?? res.data?.error ?? 'Không thể đặt lại điểm của lớp.',
  };
}

/**
 * Parse student names pasted from text or Excel into AttendanceRosterStudent[].
 * Auto-assigns stable HS01, HS02... codes for elementary rosters without MSSV.
 */
export function parseFixedRosterText(raw: string): AttendanceRosterStudent[] {
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const usedCodes = new Set<string>();
  const out: AttendanceRosterStudent[] = [];
  let seq = 1;

  for (const line of lines) {
    const cleaned = line.replace(/^\d+[.)\s-]+/, '').trim();
    if (!cleaned) continue;
    let studentCode = '';
    let fullName = cleaned;

    const sep = cleaned.match(/^([A-Za-z0-9._-]{2,24})\s*[-–|,\t]\s*(.+)$/);
    if (sep && /\d/.test(sep[1])) {
      studentCode = sep[1].trim().toUpperCase();
      fullName = sep[2].trim();
    }

    if (!studentCode) {
      do {
        studentCode = `HS${String(seq).padStart(2, '0')}`;
        seq++;
      } while (usedCodes.has(studentCode));
    } else {
      const base = studentCode;
      let dup = 2;
      while (usedCodes.has(studentCode)) {
        studentCode = `${base}_${dup++}`;
      }
    }
    usedCodes.add(studentCode);

    const parts = fullName.split(/\s+/).filter(Boolean);
    const firstName = parts.length > 1 ? parts.pop()! : fullName;
    const lastName = parts.join(' ');
    out.push({ studentCode, lastName, firstName, className: '', gender: '', dob: '' });
  }
  return out;
}

export function getDefaultAcademicStartYear(): number {
  const today = getTodayVnDateKey();
  const [yStr, mStr] = today.split('-');
  const y = Number(yStr) || new Date().getFullYear();
  const m = Number(mStr) || 1;
  return m >= 9 ? y : y - 1;
}

export function getDefaultSemesterCode(): SemesterCode {
  const today = getTodayVnDateKey();
  const m = Number(today.split('-')[1]) || 1;
  if (m >= 9 || m === 1) return 'HK1';
  if (m >= 2 && m <= 5) return 'HK2';
  return 'SUMMER';
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function lastDayOfMonth(year: number, month1Based: number): number {
  return new Date(year, month1Based, 0).getDate();
}

/** Compute startDate / endDate (YYYY-MM-DD) & human label for all 8 filter modes */
export function resolvePeriodRange(params: {
  mode: StatsPeriodMode;
  dayDate: string;
  weekAnchorDate: string;
  monthValue: string; // YYYY-MM
  yearValue: number;
  academicStartYear: number;
  semesterCode: SemesterCode;
  customStart: string;
  customEnd: string;
}): { startDate: string; endDate: string; label: string; fileSlug: string } {
  const {
    mode,
    dayDate,
    weekAnchorDate,
    monthValue,
    yearValue,
    academicStartYear,
    semesterCode,
    customStart,
    customEnd,
  } = params;

  if (mode === 'ALL') {
    return { startDate: '', endDate: '', label: 'Toàn bộ thời gian', fileSlug: 'TatCa' };
  }

  if (mode === 'DAY') {
    const d = dayDate || getTodayVnDateKey();
    return { startDate: d, endDate: d, label: `Ngày ${d.split('-').reverse().join('/')}`, fileSlug: `Ngay_${d}` };
  }

  if (mode === 'WEEK') {
    const anchor = weekAnchorDate || getTodayVnDateKey();
    const [y, m, d] = anchor.split('-').map(Number);
    const dt = new Date(y, (m || 1) - 1, d || 1);
    const dow = dt.getDay(); // 0=Sun..6=Sat
    const diffToMon = dow === 0 ? -6 : 1 - dow;
    const mon = new Date(dt);
    mon.setDate(dt.getDate() + diffToMon);
    const sun = new Date(mon);
    sun.setDate(mon.getDate() + 6);
    const s = `${mon.getFullYear()}-${pad2(mon.getMonth() + 1)}-${pad2(mon.getDate())}`;
    const e = `${sun.getFullYear()}-${pad2(sun.getMonth() + 1)}-${pad2(sun.getDate())}`;
    return {
      startDate: s,
      endDate: e,
      label: `Tuần ${pad2(mon.getDate())}/${pad2(mon.getMonth() + 1)} – ${pad2(sun.getDate())}/${pad2(sun.getMonth() + 1)}/${sun.getFullYear()}`,
      fileSlug: `Tuan_${s}_${e}`,
    };
  }

  if (mode === 'MONTH') {
    const [yStr, mStr] = (monthValue || getTodayVnDateKey().slice(0, 7)).split('-');
    const y = Number(yStr) || new Date().getFullYear();
    const m = Number(mStr) || 1;
    const last = lastDayOfMonth(y, m);
    return {
      startDate: `${y}-${pad2(m)}-01`,
      endDate: `${y}-${pad2(m)}-${pad2(last)}`,
      label: `Tháng ${pad2(m)}/${y}`,
      fileSlug: `Thang_${y}-${pad2(m)}`,
    };
  }

  if (mode === 'YEAR') {
    return {
      startDate: `${yearValue}-01-01`,
      endDate: `${yearValue}-12-31`,
      label: `Năm ${yearValue}`,
      fileSlug: `Nam_${yearValue}`,
    };
  }

  if (mode === 'ACADEMIC_YEAR') {
    const endY = academicStartYear + 1;
    return {
      startDate: `${academicStartYear}-09-01`,
      endDate: `${endY}-08-31`,
      label: `Năm học ${academicStartYear}–${endY}`,
      fileSlug: `NamHoc_${academicStartYear}-${endY}`,
    };
  }

  if (mode === 'SEMESTER') {
    const endY = academicStartYear + 1;
    if (semesterCode === 'HK1') {
      return {
        startDate: `${academicStartYear}-09-01`,
        endDate: `${endY}-01-31`,
        label: `Học kỳ 1 (${academicStartYear}–${endY})`,
        fileSlug: `HK1_${academicStartYear}-${endY}`,
      };
    }
    if (semesterCode === 'HK2') {
      return {
        startDate: `${endY}-02-01`,
        endDate: `${endY}-05-31`,
        label: `Học kỳ 2 (${academicStartYear}–${endY})`,
        fileSlug: `HK2_${academicStartYear}-${endY}`,
      };
    }
    return {
      startDate: `${endY}-06-01`,
      endDate: `${endY}-08-31`,
      label: `Học kỳ Hè (${academicStartYear}–${endY})`,
      fileSlug: `HKHe_${academicStartYear}-${endY}`,
    };
  }

  // CUSTOM
  return {
    startDate: customStart,
    endDate: customEnd,
    label:
      customStart || customEnd
        ? `Từ ${customStart || '...'} đến ${customEnd || '...'}`
        : 'Khoảng tùy chọn',
    fileSlug: `TuyChon_${customStart || 'start'}_${customEnd || 'end'}`,
  };
}

export function exportClassPointsXlsx(
  classItem: FixedClassSummary,
  students: StudentPointSummary[],
  entries: PointLedgerEntry[],
  periodLabel: string,
  fileSlug: string,
): void {
  const wb = XLSX.utils.book_new();

  const summaryRows = students.map((s, idx) => ({
    Hang: idx + 1,
    MaHS: s.studentCode,
    HoTen: s.studentName,
    DiemThuong: s.rewardPoints,
    DiemTru: s.penaltyPoints,
    TongDiem: s.netPoints,
    SoLuotThuong: s.rewardCount,
    SoLuotTru: s.penaltyCount,
    TongLuot: s.totalEvents,
    KyThongKe: periodLabel,
  }));
  const ws1 = XLSX.utils.json_to_sheet(summaryRows);
  XLSX.utils.book_append_sheet(wb, ws1, 'BangXepHang');

  const logRows = entries.map((e, idx) => ({
    STT: idx + 1,
    Ngay: e.occurredDate,
    ThoiGian: e.createdAt ? new Date(e.createdAt).toLocaleString('vi-VN') : '',
    MaHS: e.studentCode,
    HoTen: e.studentName,
    Loai: e.pointType === 'REWARD' ? 'Điểm thưởng (+)' : 'Điểm trừ (-)',
    SoDiem: e.pointType === 'REWARD' ? e.deltaPoints : -e.deltaPoints,
    LyDo: e.reason,
    TroChoi: e.sourceTitle || (e.sourceType === 'MANUAL' ? 'Cộng/Trừ trực tiếp' : 'Minigame'),
  }));
  const ws2 = XLSX.utils.json_to_sheet(logRows);
  XLSX.utils.book_append_sheet(wb, ws2, 'LichSuChiTiet');

  const safeClass = (classItem.classCode || classItem.title || 'Lop')
    .replace(/[^\p{L}\p{N}_-]+/gu, '_')
    .slice(0, 28);
  XLSX.writeFile(wb, `SoDiem_${safeClass}_${fileSlug}.xlsx`);
}
