import type { StudentRosterEntry } from '../types/exam';

export function normalizeRosterText(val: string): string {
  return val.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function normalizeRosterDob(raw: unknown): string {
  if (raw === null || raw === undefined) return '';
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0 && raw < 100000) {
    const utcMs = Date.UTC(1899, 11, 30) + Math.round(raw) * 86400000;
    const d = new Date(utcMs);
    const dd = String(d.getUTCDate()).padStart(2, '0');
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const yyyy = String(d.getUTCFullYear()).padStart(4, '0');
    return `${dd}-${mm}-${yyyy}`;
  }
  const s = String(raw).trim();
  if (!s) return '';
  const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmy) {
    return `${dmy[1].padStart(2, '0')}-${dmy[2].padStart(2, '0')}-${dmy[3]}`;
  }
  const ymd = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (ymd) {
    return `${ymd[3].padStart(2, '0')}-${ymd[2].padStart(2, '0')}-${ymd[1]}`;
  }
  return s;
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

export async function downloadStudentRosterTemplateXlsx(examTitle?: string): Promise<void> {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  const rows: (string | number)[][] = [
    ['STT', 'Mã sinh viên', 'Họ đệm', 'Tên', 'Giới tính', 'Ngày sinh'],
    [1, '2311556492', 'Đặng Quốc', 'An', 'Nam', '08-02-2005'],
    [2, '2311556493', 'Nguyễn Thị Minh', 'Châu', 'Nữ', '15-09-2005'],
  ];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [
    { wch: 6 },
    { wch: 16 },
    { wch: 24 },
    { wch: 14 },
    { wch: 12 },
    { wch: 14 },
  ];
  // Force Mã sinh viên and Ngày sinh columns as text on sample rows so Excel preserves leading zeros & DD-MM-YYYY
  ['B2', 'B3', 'F2', 'F3'].forEach((addr) => {
    if (ws[addr]) ws[addr].t = 's';
  });
  XLSX.utils.book_append_sheet(wb, ws, 'DanhSachSV');
  const safeName = (examTitle || 'CaThi')
    .replace(/[^a-zA-Z0-9\u00C0-\u024F\u1E00-\u1EFF_-]+/g, '_')
    .slice(0, 40);
  XLSX.writeFile(wb, `DanhSachSinhVien_${safeName}.xlsx`);
}

export async function parseStudentRosterXlsx(
  file: File,
): Promise<{ entries: StudentRosterEntry[]; errors: string[] }> {
  const XLSX = await import('xlsx');
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array', cellDates: false });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) {
    return { entries: [], errors: ['File không có sheet dữ liệu nào.'] };
  }
  const ws = wb.Sheets[sheetName];
  const rawRows = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    defval: '',
    raw: true,
  });

  let headerIdx = -1;
  let colMap = { code: -1, lastName: -1, firstName: -1, gender: -1, dob: -1 };

  for (let i = 0; i < Math.min(rawRows.length, 20); i += 1) {
    const row = Array.isArray(rawRows[i]) ? rawRows[i] : [];
    const mapped = { code: -1, lastName: -1, firstName: -1, gender: -1, dob: -1 };
    row.forEach((cell, idx) => {
      const h = stripAccentsLower(String(cell ?? ''));
      if (!h) return;
      if (h === 'ma sinh vien' || h === 'mssv' || h === 'ma sv' || h.includes('ma sinh vien')) {
        mapped.code = idx;
      } else if (h === 'ho dem' || h === 'ho va ten dem' || h === 'ho lot' || h === 'ho') {
        mapped.lastName = idx;
      } else if (h === 'ten' || h === 'ten sv') {
        mapped.firstName = idx;
      } else if (h === 'gioi tinh' || h === 'phai' || h === 'gender') {
        mapped.gender = idx;
      } else if (h === 'ngay sinh' || h === 'dob' || h === 'nam sinh') {
        mapped.dob = idx;
      }
    });
    if (mapped.code >= 0 && mapped.lastName >= 0 && mapped.firstName >= 0) {
      headerIdx = i;
      colMap = mapped;
      break;
    }
  }

  if (headerIdx < 0) {
    return {
      entries: [],
      errors: [
        'Không tìm thấy dòng tiêu đề đúng mẫu: STT | Mã sinh viên | Họ đệm | Tên | Giới tính | Ngày sinh.',
      ],
    };
  }

  const errors: string[] = [];
  const byCode = new Map<string, StudentRosterEntry>();

  for (let r = headerIdx + 1; r < rawRows.length; r += 1) {
    const row = Array.isArray(rawRows[r]) ? rawRows[r] : [];
    const code = String(row[colMap.code] ?? '').trim().toUpperCase();
    const lastName = String(row[colMap.lastName] ?? '').trim().replace(/\s+/g, ' ');
    const firstName = String(row[colMap.firstName] ?? '').trim().replace(/\s+/g, ' ');
    const gender = colMap.gender >= 0 ? String(row[colMap.gender] ?? '').trim().replace(/\s+/g, ' ') : '';
    const dob = colMap.dob >= 0 ? normalizeRosterDob(row[colMap.dob]) : '';

    // Skip completely empty rows
    if (!code && !lastName && !firstName && !gender && !dob) continue;

    const rowNum = r + 1;
    if (!code || !lastName || !firstName || !gender || !dob) {
      errors.push(
        `Dòng ${rowNum} (${code || 'thiếu MSSV'}): thiếu thông tin bắt buộc (Mã SV, Họ đệm, Tên, Giới tính, Ngày sinh).`,
      );
      continue;
    }

    byCode.set(code, {
      studentCode: code,
      lastName,
      firstName,
      gender,
      dob,
    });
  }

  return {
    entries: Array.from(byCode.values()),
    errors,
  };
}
