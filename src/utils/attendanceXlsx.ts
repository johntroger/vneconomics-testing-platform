import * as XLSX from 'xlsx';
import type {
  AttendanceClass,
  AttendanceMatrixData,
  AttendanceRecord,
  AttendanceRosterStudent,
  AttendanceSession,
} from '../types/attendance';

export interface ParsedAttendanceRosterResult {
  entries: AttendanceRosterStudent[];
  errors: string[];
  metadata: {
    title?: string;
    classCode?: string;
    semester?: string;
    credits?: number;
    instructorName?: string;
    sessionDate?: string;
  };
}

function stripAccentsLower(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

export function normalizeStudentCodeCell(raw: unknown): string {
  if (raw === null || raw === undefined) return '';
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return String(Math.trunc(raw));
  }
  const str = String(raw).trim();
  if (!str) return '';
  // Handle Excel float string like "2311556492.0"
  if (/^\d+\.0+$/.test(str)) {
    return str.replace(/\.0+$/, '');
  }
  return str.replace(/\s+/g, '').toUpperCase();
}

function splitFullName(fullName: string): { lastName: string; firstName: string } {
  const parts = fullName.trim().replace(/\s+/g, ' ').split(' ');
  if (parts.length <= 1) return { lastName: '', firstName: parts[0] ?? '' };
  const firstName = parts.pop() ?? '';
  return { lastName: parts.join(' '), firstName };
}

function extractMetadataFromTopRows(rows: unknown[][]): ParsedAttendanceRosterResult['metadata'] {
  const meta: ParsedAttendanceRosterResult['metadata'] = {};
  for (let i = 0; i < Math.min(rows.length, 20); i += 1) {
    const row = Array.isArray(rows[i]) ? rows[i] : [];
    for (let c = 0; c < row.length; c += 1) {
      const cell = String(row[c] ?? '').trim();
      if (!cell) continue;
      const lower = stripAccentsLower(cell);
      if (lower.startsWith('hoc ky:')) {
        const val = cell.split(':').slice(1).join(':').trim();
        if (val) meta.semester = val;
      } else if (lower.startsWith('ten mon:')) {
        const val = cell.split(':').slice(1).join(':').trim();
        if (val) {
          meta.title = val;
          const firstSeg = val.split('-')[0]?.trim();
          if (firstSeg && /^[a-zA-Z0-9._-]+$/.test(firstSeg)) {
            meta.classCode = firstSeg;
          }
        }
      } else if (lower.startsWith('so tin chi:')) {
        const num = Number(cell.split(':').slice(1).join(':').trim());
        if (Number.isFinite(num) && num > 0) meta.credits = Math.trunc(num);
      } else if (lower.startsWith('giang vien:')) {
        const rawInst = cell.split(':').slice(1).join(':').trim();
        const cleanInst = rawInst.split('-')[0]?.trim() || rawInst;
        if (cleanInst) meta.instructorName = cleanInst;
      } else if (lower.startsWith('ngay diem danh:')) {
        const val = cell.split(':').slice(1).join(':').trim();
        const dmy = val.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
        if (dmy) {
          meta.sessionDate = `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
        }
      }
    }
  }
  return meta;
}

export function parseAttendanceRosterRows(rawRows: unknown[][]): ParsedAttendanceRosterResult {
  const metadata = extractMetadataFromTopRows(rawRows);
  let headerIdx = -1;
  let colMap = {
    code: -1,
    lastName: -1,
    firstName: -1,
    fullName: -1,
    className: -1,
    gender: -1,
    dob: -1,
  };

  for (let i = 0; i < Math.min(rawRows.length, 30); i += 1) {
    const row = Array.isArray(rawRows[i]) ? rawRows[i] : [];
    const mapped = {
      code: -1,
      lastName: -1,
      firstName: -1,
      fullName: -1,
      className: -1,
      gender: -1,
      dob: -1,
    };
    row.forEach((cell, idx) => {
      const h = stripAccentsLower(String(cell ?? ''));
      if (!h) return;
      if (h === 'mssv' || h === 'ma sv' || h === 'ma sinh vien' || h.includes('ma sinh vien')) {
        mapped.code = idx;
      } else if (h === 'ho dem' || h === 'ho va ten dem' || h === 'ho lot' || h === 'ho') {
        mapped.lastName = idx;
      } else if (h === 'ten' || h === 'ten sv') {
        mapped.firstName = idx;
      } else if (h === 'ho va ten' || h === 'ho ten') {
        mapped.fullName = idx;
      } else if (h === 'lop hoc' || h === 'lop' || h === 'lop sinh hoat') {
        mapped.className = idx;
      } else if (h === 'gioi tinh' || h === 'phai' || h === 'gender') {
        mapped.gender = idx;
      } else if (h === 'ngay sinh' || h === 'dob') {
        mapped.dob = idx;
      }
    });
    const hasName = (mapped.lastName >= 0 && mapped.firstName >= 0) || mapped.fullName >= 0;
    if (mapped.code >= 0 && hasName) {
      headerIdx = i;
      colMap = mapped;
      break;
    }
  }

  if (headerIdx < 0) {
    return {
      entries: [],
      errors: [
        'Không tìm thấy dòng tiêu đề hợp lệ (cần có cột MSSV / Mã sinh viên và Họ đệm + Tên hoặc Họ và tên).',
      ],
      metadata,
    };
  }

  const errors: string[] = [];
  const byCode = new Map<string, AttendanceRosterStudent>();

  for (let r = headerIdx + 1; r < rawRows.length; r += 1) {
    const row = Array.isArray(rawRows[r]) ? rawRows[r] : [];
    const code = normalizeStudentCodeCell(row[colMap.code]);
    if (!code) {
      // Footer rows (Nhận xét, ngày ký, chữ ký) or empty rows have no MSSV -> skip cleanly
      continue;
    }
    // Skip footer rows (e.g. "Nhận xét:", signatures) or invalid non-code text
    if (code.length < 3 || code.includes(':') || (!/\d/.test(code) && !row[colMap.lastName] && !row[colMap.firstName])) {
      continue;
    }

    let lastName = colMap.lastName >= 0 ? String(row[colMap.lastName] ?? '').trim().replace(/\s+/g, ' ') : '';
    let firstName = colMap.firstName >= 0 ? String(row[colMap.firstName] ?? '').trim().replace(/\s+/g, ' ') : '';
    if ((!lastName && !firstName) && colMap.fullName >= 0) {
      const split = splitFullName(String(row[colMap.fullName] ?? ''));
      lastName = split.lastName;
      firstName = split.firstName;
    }

    if (!lastName && !firstName) {
      errors.push(`Dòng ${r + 1} (${code}): thiếu Họ và tên sinh viên.`);
      continue;
    }

    const className = colMap.className >= 0 ? String(row[colMap.className] ?? '').trim().replace(/\s+/g, ' ') : '';
    const gender = colMap.gender >= 0 ? String(row[colMap.gender] ?? '').trim() : '';
    const dob = colMap.dob >= 0 ? String(row[colMap.dob] ?? '').trim() : '';

    byCode.set(code, {
      studentCode: code,
      lastName,
      firstName,
      className,
      gender,
      dob,
    });
  }

  return {
    entries: Array.from(byCode.values()),
    errors,
    metadata,
  };
}

export async function parseAttendanceRosterFile(file: File): Promise<ParsedAttendanceRosterResult> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array', cellDates: false });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) {
    return {
      entries: [],
      errors: ['File Excel không có sheet dữ liệu nào.'],
      metadata: {},
    };
  }
  const ws = wb.Sheets[sheetName];
  const rawRows = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    defval: '',
    raw: true,
  });
  return parseAttendanceRosterRows(rawRows);
}

export function downloadAttendanceTemplateXlsx(): void {
  const wb = XLSX.utils.book_new();
  const rows: (string | number)[][] = [
    ['DANH SÁCH ĐIỂM DANH LỚP HỌC PHẦN'],
    ['Học kỳ: HK 1 NH 2026-2027'],
    ['Tên môn: ECO101 - DEMO101 - Kinh tế Vi mô 1', '', '', '', 'Số tín chỉ: 3'],
    ['Giảng viên: Giảng viên Demo', '', '', '', 'Ngày điểm danh: 25/11/2026'],
    [],
    ['STT', 'MSSV', 'Họ đệm', 'Tên', 'Lớp học', 'Có phép', 'Không phép', 'Số tiết', 'Ghi chú'],
    [1, '2026000001', 'Nguyễn Văn', 'An', 'DEMO101', '', '', '', ''],
    [2, '2026000002', 'Trần Thị', 'Bình', 'DEMO101', '', '', '', ''],
  ];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [
    { wch: 6 },
    { wch: 15 },
    { wch: 24 },
    { wch: 12 },
    { wch: 16 },
    { wch: 10 },
    { wch: 12 },
    { wch: 10 },
    { wch: 26 },
  ];
  ['B7', 'B8'].forEach((addr) => {
    if (ws[addr]) ws[addr].t = 's';
  });
  XLSX.utils.book_append_sheet(wb, ws, 'DanhSachDiemDanh');
  XLSX.writeFile(wb, 'Mau_DanhSach_DiemDanh.xlsx');
}

function statusLabelVi(status: AttendanceRecord['attendanceStatus']): string {
  switch (status) {
    case 'PRESENT':
      return 'Có mặt';
    case 'LATE':
      return 'Đi muộn';
    case 'ABSENT_EXCUSED':
      return 'Vắng có phép';
    case 'ABSENT_UNEXCUSED':
      return 'Vắng không phép';
  }
}

export function exportAttendanceSessionXlsx(
  classInfo: AttendanceClass,
  session: AttendanceSession,
  records: AttendanceRecord[],
): void {
  const wb = XLSX.utils.book_new();
  const displayDate = session.sessionDate
    ? session.sessionDate.split('-').reverse().join('/')
    : new Date().toLocaleDateString('vi-VN');

  const sheet1Rows: (string | number)[][] = [
    ['DANH SÁCH ĐIỂM DANH LỚP HỌC PHẦN'],
    [`Học kỳ: ${classInfo.semester || '—'}`],
    [`Tên môn: ${classInfo.title}`, '', '', '', `Số tín chỉ: ${classInfo.credits || 3}`],
    [`Giảng viên: ${classInfo.instructorName || '—'}`, '', '', '', `Ngày điểm danh: ${displayDate}`],
    [`Buổi điểm danh: ${session.title} (PIN: ${session.checkinPin})`],
    [],
    ['STT', 'MSSV', 'Họ đệm', 'Tên', 'Lớp học', 'Có phép', 'Không phép', 'Số tiết', 'Ghi chú'],
  ];

  records.forEach((r, idx) => {
    const excusedMark = r.attendanceStatus === 'ABSENT_EXCUSED' ? 'x' : '';
    const unexcusedMark = r.attendanceStatus === 'ABSENT_UNEXCUSED' ? 'x' : '';
    const periodsAbsent =
      r.attendanceStatus === 'ABSENT_EXCUSED' || r.attendanceStatus === 'ABSENT_UNEXCUSED'
        ? session.periodsCount
        : '';
    const autoNote =
      r.attendanceStatus === 'LATE' && r.checkedInAt
        ? `Đi muộn (${new Date(r.checkedInAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })})${r.note ? ` - ${r.note}` : ''}`
        : r.note;

    sheet1Rows.push([
      idx + 1,
      r.studentCode,
      r.lastName,
      r.firstName,
      r.className,
      excusedMark,
      unexcusedMark,
      periodsAbsent,
      autoNote,
    ]);
  });

  sheet1Rows.push([]);
  sheet1Rows.push(['', 'Nhận xét:']);
  sheet1Rows.push([]);
  sheet1Rows.push(['', '', '', '', '', `Ngày ${displayDate}`]);
  sheet1Rows.push(['', '', '', '', '', classInfo.instructorName || 'Giảng viên']);

  const ws1 = XLSX.utils.aoa_to_sheet(sheet1Rows);
  ws1['!cols'] = [
    { wch: 6 },
    { wch: 15 },
    { wch: 24 },
    { wch: 12 },
    { wch: 16 },
    { wch: 10 },
    { wch: 12 },
    { wch: 10 },
    { wch: 30 },
  ];
  for (let i = 0; i < records.length; i += 1) {
    const addr = XLSX.utils.encode_cell({ r: 7 + i, c: 1 });
    if (ws1[addr]) ws1[addr].t = 's';
  }
  XLSX.utils.book_append_sheet(wb, ws1, 'BangDiemDanh');

  // Sheet 2: Technical audit (device + GPS)
  const sheet2Rows: (string | number)[][] = [
    [
      'STT',
      'MSSV',
      'Họ và tên',
      'Lớp học',
      'Trạng thái',
      'Nguồn',
      'Thời gian quét',
      'Thiết bị',
      'IP',
      'Khoảng cách GPS (m)',
      'Cảnh báo',
    ],
  ];
  records.forEach((r, idx) => {
    const alerts = [r.deviceFlag, r.locationFlag].filter(Boolean).join(' | ');
    sheet2Rows.push([
      idx + 1,
      r.studentCode,
      r.studentName,
      r.className,
      statusLabelVi(r.attendanceStatus),
      r.checkInSource === 'QR_SCAN' ? 'Quét QR' : 'Admin chỉnh',
      r.checkedInAt ? new Date(r.checkedInAt).toLocaleString('vi-VN') : '',
      r.deviceLabel ?? '',
      r.ipAddress ?? '',
      r.distanceMeters !== null ? r.distanceMeters : '',
      alerts,
    ]);
  });
  const ws2 = XLSX.utils.aoa_to_sheet(sheet2Rows);
  ws2['!cols'] = [
    { wch: 6 },
    { wch: 15 },
    { wch: 26 },
    { wch: 15 },
    { wch: 18 },
    { wch: 13 },
    { wch: 20 },
    { wch: 18 },
    { wch: 16 },
    { wch: 18 },
    { wch: 28 },
  ];
  XLSX.utils.book_append_sheet(wb, ws2, 'ChiTietThietBi_GPS');

  const safeClass = (classInfo.classCode || classInfo.title || 'Lop')
    .replace(/[^a-zA-Z0-9\u00C0-\u024F\u1E00-\u1EFF_-]+/g, '_')
    .slice(0, 32);
  const safeSession = (session.title || 'Buoi')
    .replace(/[^a-zA-Z0-9\u00C0-\u024F\u1E00-\u1EFF_-]+/g, '_')
    .slice(0, 24);
  XLSX.writeFile(wb, `DiemDanh_${safeClass}_${safeSession}.xlsx`);
}

function matrixSymbol(status: AttendanceRecord['attendanceStatus'] | undefined): string {
  switch (status) {
    case 'PRESENT':
      return '✓';
    case 'LATE':
      return 'M';
    case 'ABSENT_EXCUSED':
      return 'P';
    case 'ABSENT_UNEXCUSED':
      return 'K';
    default:
      return '';
  }
}

export function exportAttendanceMatrixXlsx(matrix: AttendanceMatrixData): void {
  const wb = XLSX.utils.book_new();
  const { classInfo, sessions, recordsBySession } = matrix;

  const sessionHeaders = sessions.map((s, idx) => {
    const d = s.sessionDate ? s.sessionDate.split('-').reverse().slice(0, 2).join('/') : '';
    return d ? `B${idx + 1} (${d})` : `Buổi ${idx + 1}`;
  });

  const rows: (string | number)[][] = [
    [`BẢNG TỔNG HỢP CHUYÊN CẦN LỚP: ${classInfo.title}`],
    [`Học kỳ: ${classInfo.semester || '—'} | Giảng viên: ${classInfo.instructorName || '—'} | Quy ước: ✓ Có mặt, M Đi muộn, P Vắng có phép, K Vắng không phép`],
    [],
    [
      'STT',
      'MSSV',
      'Họ đệm',
      'Tên',
      'Lớp học',
      ...sessionHeaders,
      'Tổng buổi',
      'Có mặt',
      'Đi muộn',
      'Vắng CP',
      'Vắng KP',
      'Chuyên cần (%)',
    ],
  ];

  // Collect all unique students from roster + any extra check-ins
  const studentMap = new Map<string, AttendanceRosterStudent>();
  for (const stu of classInfo.rosterEntries) {
    studentMap.set(stu.studentCode.trim().toUpperCase(), stu);
  }
  for (const s of sessions) {
    for (const r of recordsBySession[s.id] ?? []) {
      if (!studentMap.has(r.studentCode)) {
        studentMap.set(r.studentCode, {
          studentCode: r.studentCode,
          lastName: r.lastName,
          firstName: r.firstName,
          className: r.className,
        });
      }
    }
  }

  const students = Array.from(studentMap.values());
  students.forEach((stu, idx) => {
    const code = stu.studentCode.trim().toUpperCase();
    let present = 0;
    let late = 0;
    let excused = 0;
    let unexcused = 0;

    const marks = sessions.map((s) => {
      const rec = (recordsBySession[s.id] ?? []).find((r) => r.studentCode === code);
      const st = rec?.attendanceStatus;
      if (st === 'PRESENT') present += 1;
      else if (st === 'LATE') late += 1;
      else if (st === 'ABSENT_EXCUSED') excused += 1;
      else if (st === 'ABSENT_UNEXCUSED') unexcused += 1;
      return matrixSymbol(st);
    });

    const total = sessions.length;
    const rate = total > 0 ? Math.round(((present + late * 0.5) / total) * 1000) / 10 : 100;

    rows.push([
      idx + 1,
      code,
      stu.lastName,
      stu.firstName,
      stu.className ?? '',
      ...marks,
      total,
      present,
      late,
      excused,
      unexcused,
      rate,
    ]);
  });

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [
    { wch: 6 },
    { wch: 15 },
    { wch: 24 },
    { wch: 12 },
    { wch: 15 },
    ...sessions.map(() => ({ wch: 11 })),
    { wch: 10 },
    { wch: 9 },
    { wch: 9 },
    { wch: 9 },
    { wch: 9 },
    { wch: 14 },
  ];
  XLSX.utils.book_append_sheet(wb, ws, 'MaTranChuyenCan');

  const safeClass = (classInfo.classCode || classInfo.title || 'Lop')
    .replace(/[^a-zA-Z0-9\u00C0-\u024F\u1E00-\u1EFF_-]+/g, '_')
    .slice(0, 32);
  XLSX.writeFile(wb, `TongHopChuyenCan_${safeClass}.xlsx`);
}
