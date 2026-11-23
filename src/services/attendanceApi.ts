import { apiRequestDetailed } from './apiClient';
import {
  computeHardwareFingerprint,
  computeSessionStats,
  haversineMeters,
  recalculateSessionDistances,
} from '../utils/attendanceGeo';
export {
  computeHardwareFingerprint,
  computeSessionStats,
  haversineMeters,
  recalculateSessionDistances,
};
import type {
  AttendanceCheckInPayload,
  AttendanceCheckInReceipt,
  AttendanceClass,
  AttendanceLookupResult,
  AttendanceMatrixData,
  AttendanceRecord,
  AttendanceSession,
  AttendanceSessionStats,
  AttendanceSessionStatus,
  AttendanceStatus,
} from '../types/attendance';

const LOCAL_ATTENDANCE_KEY = 'vne_attendance_local_v1';

interface LocalAttendanceStore {
  classes: AttendanceClass[];
  sessions: AttendanceSession[];
  records: AttendanceRecord[];
}

function buildDefaultDemoStore(): LocalAttendanceStore {
  const now = new Date().toISOString();
  const today = now.slice(0, 10);
  const roster = [
    { studentCode: '2311556492', lastName: 'Đặng Quốc', firstName: 'An', className: '23DLG1B' },
    { studentCode: '2311560477', lastName: 'Tạ Thiên', firstName: 'Ân', className: '23DLG1B' },
    { studentCode: '2311555428', lastName: 'Trần Ngọc Vân', firstName: 'Anh', className: '23DLG1B' },
    { studentCode: '2311554544', lastName: 'Huỳnh Thanh', firstName: 'Bảo', className: '23DLG1B' },
    { studentCode: '2311556445', lastName: 'Nguyễn Thiện', firstName: 'Bảo', className: '23DLG1B' },
    { studentCode: '2311557370', lastName: 'Lưu Thị Bé', firstName: 'Bi', className: '23DLG1B' },
    { studentCode: '2311557985', lastName: 'Huỳnh Xuân', firstName: 'Bình', className: '23DLG1B' },
    { studentCode: '2311555900', lastName: 'Trần Thị Kim', firstName: 'Châu', className: '23DLG1B' },
    { studentCode: '2200011153', lastName: 'Hồ Thị', firstName: 'Hoài', className: '22DMK4A.GHEP' },
    { studentCode: '2200010516', lastName: 'Nguyễn Minh', firstName: 'Toàn', className: '22DMK4A.GHEP' },
  ];
  const demoClass: AttendanceClass = {
    id: 'acls_demo_emkt',
    ownerId: 'SYSTEM_DEMO',
    classCode: '23DLG1B',
    title: '012307641802 - 23DLG1B-22DMK4A.GHEP - E-Marketing & TMĐT (Demo)',
    semester: 'HK 1 NH 2026-2027',
    credits: 3,
    instructorName: 'Trần Thanh Tùng',
    rosterEntries: roster,
    sessionCount: 1,
    createdAt: now,
  };
  const demoSession: AttendanceSession = {
    id: 'ases_demo_1',
    classId: 'acls_demo_emkt',
    ownerId: 'SYSTEM_DEMO',
    title: 'Buổi 1 - Điểm danh Demo',
    sessionDate: today,
    periodsCount: 3,
    checkinPin: '888999',
    sessionPasscode: '2026',
    rotateQrSeconds: 0,
    status: 'OPEN',
    requireRosterMatch: true,
    requireGps: true,
    blockDuplicateDevice: true,
    instructorLat: null,
    instructorLng: null,
    maxDistanceMeters: 200,
    lateAfterMinutes: 15,
    openedAt: now,
    closedAt: null,
    createdAt: now,
  };
  const preset: Record<string, { status: AttendanceStatus; src: 'QR_SCAN' | 'MANUAL_ADMIN'; dl: string | null; dm: number | null; note: string }> = {
    '2311556492': { status: 'PRESENT', src: 'QR_SCAN', dl: 'Safari / iPhone', dm: 12, note: '' },
    '2311560477': { status: 'PRESENT', src: 'QR_SCAN', dl: 'Chrome / Android', dm: 18, note: '' },
    '2311555428': { status: 'PRESENT', src: 'QR_SCAN', dl: 'Safari / iPhone', dm: 9, note: '' },
    '2311554544': { status: 'LATE', src: 'QR_SCAN', dl: 'Chrome / Android', dm: 24, note: 'Kẹt xe 15 phút' },
    '2311556445': { status: 'ABSENT_EXCUSED', src: 'MANUAL_ADMIN', dl: null, dm: null, note: 'Xin phép nghỉ ốm (có giấy xác nhận)' },
  };
  const demoRecords: AttendanceRecord[] = roster.map((stu, idx) => {
    const p = preset[stu.studentCode];
    return {
      id: `arec_demo_${idx + 1}`,
      sessionId: 'ases_demo_1',
      studentCode: stu.studentCode,
      studentName: `${stu.lastName} ${stu.firstName}`,
      lastName: stu.lastName,
      firstName: stu.firstName,
      gender: '',
      dob: '',
      className: stu.className,
      attendanceStatus: p?.status ?? 'ABSENT_UNEXCUSED',
      note: p?.note ?? '',
      checkInSource: p?.src ?? 'MANUAL_ADMIN',
      deviceToken: null,
      browserId: null,
      hardwareFingerprint: null,
      deviceLabel: p?.dl ?? null,
      ipAddress: null,
      locationLat: null,
      locationLng: null,
      locationAccuracy: null,
      distanceMeters: p?.dm ?? null,
      deviceFlag: null,
      locationFlag: null,
      checkedInAt: p?.src === 'QR_SCAN' ? now : null,
      updatedAt: now,
    };
  });
  return { classes: [demoClass], sessions: [demoSession], records: demoRecords };
}

function readLocalStore(): LocalAttendanceStore {
  try {
    const raw = localStorage.getItem(LOCAL_ATTENDANCE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as LocalAttendanceStore;
      if (parsed && Array.isArray(parsed.classes) && parsed.classes.length > 0) {
        return {
          classes: parsed.classes ?? [],
          sessions: parsed.sessions ?? [],
          records: parsed.records ?? [],
        };
      }
    }
  } catch {
    // Ignore parse errors
  }
  const seeded = buildDefaultDemoStore();
  writeLocalStore(seeded);
  return seeded;
}

function writeLocalStore(store: LocalAttendanceStore): void {
  try {
    localStorage.setItem(LOCAL_ATTENDANCE_KEY, JSON.stringify(store));
  } catch {
    // Ignore storage quota errors
  }
}

export async function fetchAttendanceClasses(): Promise<{
  ok: boolean;
  classes: AttendanceClass[];
  error?: string;
}> {
  const res = await apiRequestDetailed<{ ok: boolean; classes?: AttendanceClass[]; error?: string }>(
    '/api/attendance.php?action=list_classes',
  );
  if (res.reachedJson) {
    return {
      ok: res.ok && Boolean(res.data?.ok),
      classes: res.data?.classes ?? [],
      error: res.error,
    };
  }
  const store = readLocalStore();
  return {
    ok: true,
    classes: store.classes.map((c) => ({
      ...c,
      sessionCount: store.sessions.filter((s) => s.classId === c.id).length,
    })),
  };
}

export async function saveAttendanceClass(
  payload: Partial<AttendanceClass> & { title: string },
): Promise<{ ok: boolean; classItem?: AttendanceClass; error?: string }> {
  const res = await apiRequestDetailed<{ ok: boolean; classItem?: AttendanceClass; error?: string }>(
    '/api/attendance.php?action=save_class',
    { method: 'POST', body: JSON.stringify(payload) },
  );
  if (res.reachedJson) {
    return {
      ok: res.ok && Boolean(res.data?.ok),
      classItem: res.data?.classItem,
      error: res.error,
    };
  }
  const store = readLocalStore();
  const now = new Date().toISOString();
  let item: AttendanceClass;
  if (payload.id) {
    const idx = store.classes.findIndex((c) => c.id === payload.id);
    if (idx >= 0) {
      item = {
        ...store.classes[idx],
        ...payload,
        rosterEntries: payload.rosterEntries ?? store.classes[idx].rosterEntries,
      };
      store.classes[idx] = item;
    } else {
      item = {
        id: payload.id,
        ownerId: 'SYSTEM_DEMO',
        classCode: payload.classCode ?? '',
        title: payload.title,
        semester: payload.semester ?? '',
        credits: payload.credits ?? 3,
        instructorName: payload.instructorName ?? '',
        rosterEntries: payload.rosterEntries ?? [],
        createdAt: now,
      };
      store.classes.unshift(item);
    }
  } else {
    item = {
      id: `acls_${Date.now().toString(36)}`,
      ownerId: 'SYSTEM_DEMO',
      classCode: payload.classCode ?? '',
      title: payload.title,
      semester: payload.semester ?? '',
      credits: payload.credits ?? 3,
      instructorName: payload.instructorName ?? '',
      rosterEntries: payload.rosterEntries ?? [],
      createdAt: now,
    };
    store.classes.unshift(item);
  }
  writeLocalStore(store);
  return { ok: true, classItem: item };
}

export async function deleteAttendanceClass(classId: string): Promise<{ ok: boolean; error?: string }> {
  const res = await apiRequestDetailed<{ ok: boolean; error?: string }>(
    '/api/attendance.php?action=delete_class',
    { method: 'POST', body: JSON.stringify({ classId }) },
  );
  if (res.reachedJson) {
    return { ok: res.ok && Boolean(res.data?.ok), error: res.error };
  }
  const store = readLocalStore();
  const sIds = new Set(store.sessions.filter((s) => s.classId === classId).map((s) => s.id));
  store.records = store.records.filter((r) => !sIds.has(r.sessionId));
  store.sessions = store.sessions.filter((s) => s.classId !== classId);
  store.classes = store.classes.filter((c) => c.id !== classId);
  writeLocalStore(store);
  return { ok: true };
}

export async function fetchAttendanceSessions(classId: string): Promise<{
  ok: boolean;
  sessions: AttendanceSession[];
  error?: string;
}> {
  const res = await apiRequestDetailed<{ ok: boolean; sessions?: AttendanceSession[]; error?: string }>(
    `/api/attendance.php?action=list_sessions&classId=${encodeURIComponent(classId)}`,
  );
  if (res.reachedJson) {
    return {
      ok: res.ok && Boolean(res.data?.ok),
      sessions: res.data?.sessions ?? [],
      error: res.error,
    };
  }
  const store = readLocalStore();
  const sessions = store.sessions
    .filter((s) => s.classId === classId)
    .map((s) => ({
      ...s,
      stats: computeSessionStats(store.records.filter((r) => r.sessionId === s.id)),
    }));
  return { ok: true, sessions };
}

export async function createAttendanceSession(payload: {
  classId: string;
  title: string;
  sessionDate: string;
  periodsCount: number;
  sessionPasscode: string;
  rotateQrSeconds: number;
  requireRosterMatch: boolean;
  requireGps: boolean;
  blockDuplicateDevice: boolean;
  instructorLat: number | null;
  instructorLng: number | null;
  maxDistanceMeters: number;
  lateAfterMinutes: number;
}): Promise<{ ok: boolean; session?: AttendanceSession; error?: string }> {
  const res = await apiRequestDetailed<{ ok: boolean; session?: AttendanceSession; error?: string }>(
    '/api/attendance.php?action=create_session',
    { method: 'POST', body: JSON.stringify(payload) },
  );
  if (res.reachedJson) {
    return {
      ok: res.ok && Boolean(res.data?.ok),
      session: res.data?.session,
      error: res.error,
    };
  }
  const store = readLocalStore();
  const cls = store.classes.find((c) => c.id === payload.classId);
  if (!cls) return { ok: false, error: 'Không tìm thấy lớp điểm danh.' };
  const now = new Date().toISOString();
  const sid = `ases_${Date.now().toString(36)}`;
  const session: AttendanceSession = {
    id: sid,
    classId: cls.id,
    ownerId: 'SYSTEM_DEMO',
    title: payload.title,
    sessionDate: payload.sessionDate,
    periodsCount: payload.periodsCount,
    checkinPin: String(Math.floor(100000 + Math.random() * 900000)),
    sessionPasscode: payload.sessionPasscode,
    rotateQrSeconds: payload.rotateQrSeconds,
    status: 'OPEN',
    requireRosterMatch: payload.requireRosterMatch,
    requireGps: payload.requireGps,
    blockDuplicateDevice: payload.blockDuplicateDevice,
    instructorLat: payload.instructorLat,
    instructorLng: payload.instructorLng,
    maxDistanceMeters: payload.maxDistanceMeters,
    lateAfterMinutes: payload.lateAfterMinutes,
    openedAt: now,
    closedAt: null,
    createdAt: now,
    qrToken: payload.rotateQrSeconds > 0 ? 'demo_qr' : '',
    qrExpiresInSec: payload.rotateQrSeconds,
  };
  const newRecords: AttendanceRecord[] = cls.rosterEntries.map((stu, idx) => ({
    id: `arec_${Date.now().toString(36)}_${idx}`,
    sessionId: sid,
    studentCode: stu.studentCode.trim().toUpperCase(),
    studentName: `${stu.lastName} ${stu.firstName}`.trim(),
    lastName: stu.lastName,
    firstName: stu.firstName,
    gender: stu.gender ?? '',
    dob: stu.dob ?? '',
    className: stu.className ?? '',
    attendanceStatus: 'ABSENT_UNEXCUSED',
    note: '',
    checkInSource: 'MANUAL_ADMIN',
    deviceToken: null,
    browserId: null,
    hardwareFingerprint: null,
    deviceLabel: null,
    ipAddress: null,
    locationLat: null,
    locationLng: null,
    locationAccuracy: null,
    distanceMeters: null,
    deviceFlag: null,
    locationFlag: null,
    checkedInAt: null,
    updatedAt: now,
  }));
  store.sessions.unshift(session);
  store.records.push(...newRecords);
  writeLocalStore(store);
  return { ok: true, session: { ...session, stats: computeSessionStats(newRecords) } };
}

export async function fetchAttendanceSessionDetail(sessionId: string): Promise<{
  ok: boolean;
  session?: AttendanceSession;
  records: AttendanceRecord[];
  error?: string;
}> {
  const res = await apiRequestDetailed<{
    ok: boolean;
    session?: AttendanceSession;
    records?: AttendanceRecord[];
    error?: string;
  }>(`/api/attendance.php?action=session_detail&sessionId=${encodeURIComponent(sessionId)}`);
  if (res.reachedJson) {
    return {
      ok: res.ok && Boolean(res.data?.ok),
      session: res.data?.session,
      records: res.data?.records ?? [],
      error: res.error,
    };
  }
  const store = readLocalStore();
  const session = store.sessions.find((s) => s.id === sessionId);
  if (!session) return { ok: false, records: [], error: 'Không tìm thấy buổi điểm danh.' };
  const records = store.records.filter((r) => r.sessionId === sessionId);
  return {
    ok: true,
    session: { ...session, stats: computeSessionStats(records) },
    records,
  };
}

export async function toggleAttendanceSessionStatus(
  sessionId: string,
  status: AttendanceSessionStatus,
): Promise<{ ok: boolean; session?: AttendanceSession; error?: string }> {
  const res = await apiRequestDetailed<{ ok: boolean; session?: AttendanceSession; error?: string }>(
    '/api/attendance.php?action=toggle_session_status',
    { method: 'POST', body: JSON.stringify({ sessionId, status }) },
  );
  if (res.reachedJson) {
    return { ok: res.ok && Boolean(res.data?.ok), session: res.data?.session, error: res.error };
  }
  const store = readLocalStore();
  const idx = store.sessions.findIndex((s) => s.id === sessionId);
  if (idx >= 0) {
    store.sessions[idx] = {
      ...store.sessions[idx],
      status,
      closedAt: status === 'CLOSED' ? new Date().toISOString() : null,
    };
    writeLocalStore(store);
    return { ok: true, session: store.sessions[idx] };
  }
  return { ok: false, error: 'Không tìm thấy buổi điểm danh.' };
}

export async function deleteAttendanceSession(sessionId: string): Promise<{ ok: boolean; error?: string }> {
  const res = await apiRequestDetailed<{ ok: boolean; error?: string }>(
    '/api/attendance.php?action=delete_session',
    { method: 'POST', body: JSON.stringify({ sessionId }) },
  );
  if (res.reachedJson) {
    return { ok: res.ok && Boolean(res.data?.ok), error: res.error };
  }
  const store = readLocalStore();
  store.records = store.records.filter((r) => r.sessionId !== sessionId);
  store.sessions = store.sessions.filter((s) => s.id !== sessionId);
  writeLocalStore(store);
  return { ok: true };
}

export async function saveAttendanceRecordsBulk(
  sessionId: string,
  updates: Array<{ id: string; attendanceStatus: AttendanceStatus; note: string }>,
): Promise<{
  ok: boolean;
  records?: AttendanceRecord[];
  stats?: AttendanceSessionStats;
  error?: string;
}> {
  const res = await apiRequestDetailed<{
    ok: boolean;
    records?: AttendanceRecord[];
    stats?: AttendanceSessionStats;
    error?: string;
  }>('/api/attendance.php?action=save_records_bulk', {
    method: 'POST',
    body: JSON.stringify({ sessionId, updates }),
  });
  if (res.reachedJson) {
    return {
      ok: res.ok && Boolean(res.data?.ok),
      records: res.data?.records,
      stats: res.data?.stats,
      error: res.error,
    };
  }
  const store = readLocalStore();
  const map = new Map(updates.map((u) => [u.id, u]));
  const now = new Date().toISOString();
  store.records = store.records.map((r) => {
    if (r.sessionId !== sessionId) return r;
    const u = map.get(r.id);
    return u ? { ...r, attendanceStatus: u.attendanceStatus, note: u.note, updatedAt: now } : r;
  });
  writeLocalStore(store);
  const sessionRecs = store.records.filter((r) => r.sessionId === sessionId);
  return { ok: true, records: sessionRecs, stats: computeSessionStats(sessionRecs) };
}

export async function fetchAttendanceMatrix(classId: string): Promise<{
  ok: boolean;
  matrix?: AttendanceMatrixData;
  error?: string;
}> {
  const res = await apiRequestDetailed<{
    ok: boolean;
    matrix?: AttendanceMatrixData;
    error?: string;
  }>(`/api/attendance.php?action=class_summary_matrix&classId=${encodeURIComponent(classId)}`);
  if (res.reachedJson) {
    return { ok: res.ok && Boolean(res.data?.ok), matrix: res.data?.matrix, error: res.error };
  }
  const store = readLocalStore();
  const classInfo = store.classes.find((c) => c.id === classId);
  if (!classInfo) return { ok: false, error: 'Không tìm thấy lớp điểm danh.' };
  const sessions = store.sessions.filter((s) => s.classId === classId);
  const recordsBySession: Record<string, AttendanceRecord[]> = {};
  for (const s of sessions) {
    recordsBySession[s.id] = store.records.filter((r) => r.sessionId === s.id);
  }
  return { ok: true, matrix: { classInfo, sessions, recordsBySession } };
}

export async function lookupAttendancePin(pin: string): Promise<{
  ok: boolean;
  lookup?: AttendanceLookupResult;
  error?: string;
}> {
  const clean = pin.replace(/\D/g, '');
  const res = await apiRequestDetailed<{
    ok: boolean;
    lookup?: AttendanceLookupResult;
    error?: string;
  }>(`/api/attendance.php?action=lookup_pin&pin=${encodeURIComponent(clean)}`);
  if (res.reachedJson) {
    return { ok: res.ok && Boolean(res.data?.ok), lookup: res.data?.lookup, error: res.error };
  }
  const store = readLocalStore();
  const session = store.sessions.find((s) => s.checkinPin === clean);
  if (!session) return { ok: false, error: 'Không tìm thấy buổi điểm danh với mã PIN này.' };
  const cls = store.classes.find((c) => c.id === session.classId);
  return {
    ok: true,
    lookup: {
      sessionId: session.id,
      classTitle: cls?.title ?? 'Lớp điểm danh',
      classCode: cls?.classCode ?? '',
      semester: cls?.semester ?? '',
      instructorName: cls?.instructorName ?? '',
      sessionTitle: session.title,
      sessionDate: session.sessionDate,
      checkinPin: session.checkinPin,
      status: session.status,
      requirePasscode: Boolean(session.sessionPasscode.trim()),
      requireRosterMatch: session.requireRosterMatch,
      requireGps: session.requireGps,
      rotateQrSeconds: session.rotateQrSeconds,
      maxDistanceMeters: session.maxDistanceMeters,
      lateAfterMinutes: session.lateAfterMinutes,
    },
  };
}

export async function submitAttendanceCheckIn(
  payload: AttendanceCheckInPayload,
): Promise<AttendanceCheckInReceipt> {
  const res = await apiRequestDetailed<AttendanceCheckInReceipt>(
    '/api/attendance.php?action=checkin',
    { method: 'POST', body: JSON.stringify(payload) },
  );
  if (res.reachedJson && res.data) {
    return {
      ok: res.ok && Boolean(res.data.ok),
      error: res.data.error ?? res.error,
      record: res.data.record,
      sessionTitle: res.data.sessionTitle,
      classTitle: res.data.classTitle,
    };
  }

  // Local Demo fallback
  const store = readLocalStore();
  const cleanPin = payload.pin.replace(/\D/g, '');
  const session = store.sessions.find((s) => s.checkinPin === cleanPin);
  if (!session) return { ok: false, error: 'Không tìm thấy buổi điểm danh hợp lệ.' };
  if (session.status !== 'OPEN') return { ok: false, error: 'Buổi điểm danh này đã đóng.' };
  if (
    session.sessionPasscode.trim() &&
    session.sessionPasscode.trim().toLowerCase() !== (payload.passcode ?? '').trim().toLowerCase()
  ) {
    return { ok: false, error: 'Mật khẩu điểm danh (Passcode) chưa đúng.' };
  }
  if (session.requireGps && (payload.locationLat === null || payload.locationLng === null)) {
    return { ok: false, error: 'Vui lòng bật Định vị (GPS) để điểm danh.' };
  }
  const code = payload.studentCode.trim().toUpperCase();
  const existingIdx = store.records.findIndex(
    (r) => r.sessionId === session.id && r.studentCode === code,
  );
  if (session.requireRosterMatch && existingIdx < 0) {
    return { ok: false, error: `Không tìm thấy MSSV ${code} trong danh sách lớp.` };
  }

  const dup = store.records.find(
    (r) =>
      r.sessionId === session.id &&
      r.studentCode !== code &&
      r.checkInSource === 'QR_SCAN' &&
      ((payload.deviceToken && r.deviceToken === payload.deviceToken) ||
        (payload.browserId && r.browserId === payload.browserId)),
  );
  if (dup && session.blockDuplicateDevice) {
    return {
      ok: false,
      error: `Thiết bị này đã được dùng để điểm danh cho ${dup.studentCode} (${dup.studentName}).`,
    };
  }

  const now = new Date().toISOString();
  const isLate =
    session.lateAfterMinutes > 0 &&
    Date.now() > Date.parse(session.openedAt) + session.lateAfterMinutes * 60_000;
  const nextStatus: AttendanceStatus = isLate ? 'LATE' : 'PRESENT';

  let updatedRec: AttendanceRecord;
  if (existingIdx >= 0) {
    updatedRec = {
      ...store.records[existingIdx],
      attendanceStatus: nextStatus,
      checkInSource: 'QR_SCAN',
      deviceToken: payload.deviceToken,
      browserId: payload.browserId,
      hardwareFingerprint: payload.hardwareFingerprint,
      deviceLabel: payload.deviceLabel,
      locationLat: payload.locationLat,
      locationLng: payload.locationLng,
      locationAccuracy: payload.locationAccuracy,
      deviceFlag: dup ? `DUPLICATE_DEVICE:${dup.studentCode}` : null,
      checkedInAt: store.records[existingIdx].checkedInAt ?? now,
      updatedAt: now,
    };
    store.records[existingIdx] = updatedRec;
  } else {
    const ln = payload.lastName?.trim() ?? '';
    const fn = payload.firstName?.trim() ?? '';
    const full = ln || fn ? `${ln} ${fn}`.trim() : payload.fullName?.trim() || code;
    updatedRec = {
      id: `arec_${Date.now().toString(36)}`,
      sessionId: session.id,
      studentCode: code,
      studentName: full,
      lastName: ln,
      firstName: fn || full,
      gender: '',
      dob: '',
      className: payload.className?.trim() ?? '',
      attendanceStatus: nextStatus,
      note: '',
      checkInSource: 'QR_SCAN',
      deviceToken: payload.deviceToken,
      browserId: payload.browserId,
      hardwareFingerprint: payload.hardwareFingerprint,
      deviceLabel: payload.deviceLabel,
      ipAddress: null,
      locationLat: payload.locationLat,
      locationLng: payload.locationLng,
      locationAccuracy: payload.locationAccuracy,
      distanceMeters: null,
      deviceFlag: dup ? `DUPLICATE_DEVICE:${dup.studentCode}` : null,
      locationFlag: null,
      checkedInAt: now,
      updatedAt: now,
    };
    store.records.push(updatedRec);
  }

  const sessionRecs = recalculateSessionDistances(
    session,
    store.records.filter((r) => r.sessionId === session.id),
  );
  const recMap = new Map(sessionRecs.map((r) => [r.id, r]));
  store.records = store.records.map((r) => recMap.get(r.id) ?? r);
  writeLocalStore(store);

  const cls = store.classes.find((c) => c.id === session.classId);
  return {
    ok: true,
    record: recMap.get(updatedRec.id) ?? updatedRec,
    sessionTitle: session.title,
    classTitle: cls?.title ?? '',
  };
}
