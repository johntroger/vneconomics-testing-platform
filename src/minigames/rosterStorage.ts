import * as XLSX from 'xlsx';
import { GAME_AVATARS } from '../components/game/GameAvatarBadge';
import type { Exam } from '../types/exam';
import type {
  MinigameStateStore,
  PickHistoryEntry,
  PointCriterion,
  RosterPreset,
  RosterStudent,
} from './types';

const STORAGE_KEY = 'vne_minigame_hub_v1';
const SYNC_CHANNEL = 'vne_minigame_sync_v1';
const CRITERIA_STORAGE_KEY = 'vne_minigame_point_criteria_v1';

export const DEFAULT_POINT_CRITERIA: PointCriterion[] = [
  // Điểm Thưởng (Thang BeeClass: +1 / +2 / +5 / +10)
  { id: 'r_active', type: 'REWARD', points: 1, label: 'Phát biểu tích cực / Giơ tay', icon: '🌸' },
  { id: 'r_correct', type: 'REWARD', points: 2, label: 'Trả lời đúng câu hỏi', icon: '🌺' },
  { id: 'r_good', type: 'REWARD', points: 2, label: 'Tác phong tốt / Hỗ trợ bạn', icon: '🌼' },
  { id: 'r_homework', type: 'REWARD', points: 5, label: 'Hoàn thành tốt bài tập', icon: '🌻' },
  { id: 'r_excellent', type: 'REWARD', points: 5, label: 'Trả lời xuất sắc / Giải bài hay', icon: '🌟' },
  { id: 'r_mvp', type: 'REWARD', points: 10, label: 'Xuất sắc nhất tiết học', icon: '🏆' },
  // Điểm Trừ (-1 / -2 / -5)
  { id: 'p_focus', type: 'PENALTY', points: 1, label: 'Chưa tập trung / Nói chuyện riêng', icon: '⚡' },
  { id: 'p_prep', type: 'PENALTY', points: 2, label: 'Chưa chuẩn bị bài / Quên tài liệu', icon: '📝' },
  { id: 'p_rule', type: 'PENALTY', points: 5, label: 'Vi phạm nội quy lớp học', icon: '🚫' },
];

export function readPointCriteria(): PointCriterion[] {
  try {
    const raw = localStorage.getItem(CRITERIA_STORAGE_KEY);
    if (!raw) return DEFAULT_POINT_CRITERIA;
    const parsed = JSON.parse(raw) as PointCriterion[];
    if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_POINT_CRITERIA;
    return parsed;
  } catch {
    return DEFAULT_POINT_CRITERIA;
  }
}

export function writePointCriteria(criteria: PointCriterion[]): void {
  try {
    localStorage.setItem(CRITERIA_STORAGE_KEY, JSON.stringify(criteria));
  } catch {
    // Ignore storage error
  }
}

export function cryptoRandomInt(maxExclusive: number): number {
  if (maxExclusive <= 1) return 0;
  const buf = new Uint32Array(1);
  const limit = Math.floor(0xffffffff / maxExclusive) * maxExclusive;
  let r = 0;
  do {
    crypto.getRandomValues(buf);
    r = buf[0];
  } while (r >= limit);
  return r % maxExclusive;
}

export function cryptoShuffle<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = cryptoRandomInt(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function makeStudent(
  name: string,
  studentCode = '',
  gender = '',
  idx = 0,
): RosterStudent {
  return {
    id: `stu_${Date.now().toString(36)}_${idx}_${Math.random().toString(36).slice(2, 6)}`,
    name: name.trim(),
    studentCode: studentCode.trim().toUpperCase(),
    gender: gender.trim(),
    avatarId: GAME_AVATARS[(idx + cryptoRandomInt(GAME_AVATARS.length)) % GAME_AVATARS.length].id,
    called: false,
    absent: false,
    bonusPoints: 0,
    penaltyPoints: 0,
  };
}

const DEFAULT_STORE: MinigameStateStore = {
  version: 1,
  activePresetName: 'Danh sách mẫu',
  excludeCalled: true,
  courseId: '',
  students: [
    'Nguyễn Minh Anh',
    'Trần Hoàng Bảo',
    'Lê Thảo Chi',
    'Phạm Đức Duy',
    'Hoàng Gia Hân',
    'Vũ Quang Huy',
    'Đặng Khánh Linh',
    'Bùi Tuấn Kiệt',
  ].map((n, i) => makeStudent(n, `2211000${i + 1}`, i % 2 === 0 ? 'Nữ' : 'Nam', i)),
  presets: [],
  history: [],
};

export function readMinigameStore(): MinigameStateStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_STORE;
    const parsed = JSON.parse(raw) as Partial<MinigameStateStore>;
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.students)) {
      return DEFAULT_STORE;
    }
    return {
      version: 1,
      activePresetName: parsed.activePresetName || 'Danh sách lớp',
      excludeCalled: parsed.excludeCalled ?? true,
      courseId: parsed.courseId || '',
      students: parsed.students,
      presets: Array.isArray(parsed.presets) ? parsed.presets : [],
      history: Array.isArray(parsed.history) ? parsed.history : [],
    };
  } catch {
    return DEFAULT_STORE;
  }
}

export function writeMinigameStore(store: MinigameStateStore): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    const ch = new BroadcastChannel(SYNC_CHANNEL);
    ch.postMessage({ type: 'ROSTER_UPDATED', at: Date.now() });
    ch.close();
  } catch {
    // Ignore storage/channel errors
  }
}

export function subscribeMinigameSync(onSync: () => void): () => void {
  let ch: BroadcastChannel | null = null;
  try {
    ch = new BroadcastChannel(SYNC_CHANNEL);
    ch.onmessage = () => onSync();
  } catch {
    ch = null;
  }
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) onSync();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    ch?.close();
    window.removeEventListener('storage', onStorage);
  };
}

export function parseRosterFromText(raw: string): RosterStudent[] {
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const seen = new Set<string>();
  const out: RosterStudent[] = [];

  lines.forEach((line, idx) => {
    let code = '';
    let name = line;
    const tabParts = line.split(/\t|,|;/).map((p) => p.trim()).filter(Boolean);
    if (tabParts.length >= 2 && /^[a-zA-Z0-9._-]{4,20}$/.test(tabParts[0])) {
      code = tabParts[0];
      name = tabParts.slice(1).join(' ');
    } else {
      const dashMatch = line.match(/^([a-zA-Z0-9._-]{4,20})\s*[-–|:]\s*(.+)$/);
      if (dashMatch) {
        code = dashMatch[1].trim();
        name = dashMatch[2].trim();
      }
    }
    const key = `${code.toLowerCase()}::${name.toLowerCase()}`;
    if (name && !seen.has(key)) {
      seen.add(key);
      out.push(makeStudent(name, code, '', idx));
    }
  });
  return out;
}

export async function parseRosterFromExcelFile(file: File): Promise<RosterStudent[]> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) return [];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' });
  if (rows.length === 0) return [];

  const headerRow = rows[0].map((c) => String(c).trim().toLowerCase());
  const hasHeader = headerRow.some(
    (h) =>
      h.includes('tên') ||
      h.includes('ten') ||
      h.includes('name') ||
      h.includes('mssv') ||
      h.includes('mã'),
  );

  const codeCol = headerRow.findIndex((h) => h.includes('mssv') || h.includes('mã') || h.includes('code'));
  const lastCol = headerRow.findIndex((h) => h === 'họ' || h.includes('họ đệm') || h.includes('họ lót'));
  const firstCol = headerRow.findIndex((h) => h === 'tên' || h === 'ten');
  const fullNameCol = headerRow.findIndex(
    (h) => h.includes('họ tên') || h.includes('họ và tên') || h.includes('fullname') || h === 'name',
  );
  const genderCol = headerRow.findIndex((h) => h.includes('giới') || h.includes('gender') || h.includes('phái'));

  const startIdx = hasHeader ? 1 : 0;
  const out: RosterStudent[] = [];

  for (let i = startIdx; i < rows.length; i++) {
    const r = rows[i];
    if (!Array.isArray(r) || r.every((c) => String(c).trim() === '')) continue;
    const code = codeCol >= 0 ? String(r[codeCol] ?? '').trim() : '';
    const gender = genderCol >= 0 ? String(r[genderCol] ?? '').trim() : '';
    let name = '';
    if (fullNameCol >= 0) {
      name = String(r[fullNameCol] ?? '').trim();
    } else if (lastCol >= 0 && firstCol >= 0) {
      name = `${String(r[lastCol] ?? '').trim()} ${String(r[firstCol] ?? '').trim()}`.trim();
    } else {
      const textCells = r.map((c) => String(c).trim()).filter(Boolean);
      if (textCells.length >= 2 && /^[a-zA-Z0-9._-]{4,20}$/.test(textCells[0])) {
        name = textCells[1];
      } else {
        name = textCells[0] ?? '';
      }
    }
    if (name) {
      out.push(makeStudent(name, code, gender, i));
    }
  }
  return out;
}

export function parseRosterFromExam(exam: Exam): RosterStudent[] {
  if (exam.rosterEntries && exam.rosterEntries.length > 0) {
    return exam.rosterEntries.map((entry, idx) =>
      makeStudent(
        `${entry.lastName} ${entry.firstName}`.trim() || entry.studentCode,
        entry.studentCode,
        entry.gender,
        idx,
      ),
    );
  }
  if (exam.rosterWhitelist && exam.rosterWhitelist.length > 0) {
    return exam.rosterWhitelist.map((code, idx) => makeStudent(code, code, '', idx));
  }
  return [];
}

export function savePresetToStore(
  store: MinigameStateStore,
  presetName: string,
): MinigameStateStore {
  const cleanName = presetName.trim() || 'Danh sách lớp';
  const existingIdx = store.presets.findIndex(
    (p) => p.name.toLowerCase() === cleanName.toLowerCase(),
  );
  const preset: RosterPreset = {
    id: existingIdx >= 0 ? store.presets[existingIdx].id : `pre_${Date.now().toString(36)}`,
    name: cleanName,
    students: store.students,
    updatedAt: new Date().toISOString(),
  };
  const nextPresets = [...store.presets];
  if (existingIdx >= 0) nextPresets[existingIdx] = preset;
  else nextPresets.unshift(preset);
  const next = { ...store, activePresetName: cleanName, presets: nextPresets.slice(0, 20) };
  writeMinigameStore(next);
  return next;
}

export function exportMinigameHistoryXlsx(
  students: RosterStudent[],
  history: PickHistoryEntry[],
  presetName: string,
): void {
  const wb = XLSX.utils.book_new();
  const summaryRows = students.map((s, i) => ({
    STT: i + 1,
    MSSV: s.studentCode || '',
    HoTen: s.name,
    GioiTinh: s.gender || '',
    TrangThai: s.absent ? 'Vắng' : s.called ? 'Đã gọi' : 'Chưa gọi',
    DiemThuong: s.bonusPoints,
    DiemTru: s.penaltyPoints ?? 0,
    TongDiem: s.bonusPoints - (s.penaltyPoints ?? 0),
  }));
  const wsSummary = XLSX.utils.json_to_sheet(summaryRows);
  XLSX.utils.book_append_sheet(wb, wsSummary, 'TongHopLop');

  if (history.length > 0) {
    const histRows = history.map((h, i) => ({
      STT: i + 1,
      ThoiGian: new Date(h.at).toLocaleString('vi-VN'),
      MSSV: h.studentCode || '',
      HoTen: h.studentName,
      TroChoi: h.gameName,
      TrangThai: h.status === 'ABSENT' ? 'Vắng' : 'Đã gọi',
      DiemCong: h.bonusAwarded,
    }));
    const wsHist = XLSX.utils.json_to_sheet(histRows);
    XLSX.utils.book_append_sheet(wb, wsHist, 'LichSuGoiTen');
  }

  XLSX.writeFile(wb, `Minigame_${presetName.replace(/\s+/g, '_')}.xlsx`);
}
