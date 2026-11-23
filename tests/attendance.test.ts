import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeStudentCodeCell,
  parseAttendanceRosterRows,
} from '../src/utils/attendanceXlsx.ts';
import {
  computeSessionStats,
  haversineMeters,
  recalculateSessionDistances,
} from '../src/utils/attendanceGeo.ts';
import type { AttendanceRecord, AttendanceSession } from '../src/types/attendance.ts';

test('normalizeStudentCodeCell chuẩn hóa MSSV dạng số thực từ Excel', () => {
  assert.equal(normalizeStudentCodeCell(2311556492), '2311556492');
  assert.equal(normalizeStudentCodeCell('2311556492.0'), '2311556492');
  assert.equal(normalizeStudentCodeCell(' 2200002615 '), '2200002615');
  assert.equal(normalizeStudentCodeCell(''), '');
});

test('parseAttendanceRosterRows đọc chuẩn mẫu Excel điểm danh của Trường và bỏ qua chân trang', () => {
  const rows: unknown[][] = [
    ['DANH SÁCH ĐIỂM DANH LỚP HỌC PHẦN'],
    ['', '', '', '', 'Học kỳ:    HK 1 NH 2026-2027'],
    ['', '', 'Tên môn:    012307641802 - 23DLG1B-22DMK4A.GHEP - E-Marketing và Thương mại điện tử', '', '', 'Số tín chỉ:    3'],
    ['', '', 'Giảng viên: Trần Thanh Tùng      -  01011092', '', '', 'Ngày điểm danh:    25/11/2026'],
    ['STT', 'MSSV', 'Họ đệm', 'Tên', 'Lớp học', 'Có phép', 'Không phép', 'Số tiết', 'Ghi chú'],
    [1.0, 2311556492.0, 'Đặng Quốc', 'An', '23DLG1B', '', '', '', ''],
    [2.0, '2200011153.0', 'Hồ Thị', 'Hoài', '22DMK4A.GHEP', '', '', '', ''],
    ['', 'Nhận xét:', '', '', '', '', '', '', ''],
    ['', '', '', '', '', 'Thứ Hai ,ngày 23 tháng 11 năm 2026'],
    ['', '', '', '', '', 'Trần Thanh Tùng'],
  ];

  const parsed = parseAttendanceRosterRows(rows);
  assert.equal(parsed.errors.length, 0);
  assert.equal(parsed.entries.length, 2);
  assert.equal(parsed.entries[0].studentCode, '2311556492');
  assert.equal(parsed.entries[0].lastName, 'Đặng Quốc');
  assert.equal(parsed.entries[0].firstName, 'An');
  assert.equal(parsed.entries[0].className, '23DLG1B');
  assert.equal(parsed.entries[1].studentCode, '2200011153');
  assert.equal(parsed.entries[1].className, '22DMK4A.GHEP');

  assert.equal(parsed.metadata.semester, 'HK 1 NH 2026-2027');
  assert.equal(parsed.metadata.credits, 3);
  assert.equal(parsed.metadata.classCode, '012307641802');
  assert.equal(parsed.metadata.instructorName, 'Trần Thanh Tùng');
  assert.equal(parsed.metadata.sessionDate, '2026-11-25');
});

test('recalculateSessionDistances phát hiện sinh viên ở xa theo tâm Trung vị và bù sai số GPS', () => {
  const baseSession: AttendanceSession = {
    id: 'ases_1',
    classId: 'acls_1',
    ownerId: 'SYSTEM_DEMO',
    title: 'Buổi 1',
    sessionDate: '2026-11-25',
    periodsCount: 3,
    checkinPin: '123456',
    sessionPasscode: '4829',
    rotateQrSeconds: 30,
    status: 'OPEN',
    requireRosterMatch: true,
    requireGps: true,
    blockDuplicateDevice: true,
    instructorLat: null,
    instructorLng: null,
    maxDistanceMeters: 200,
    lateAfterMinutes: 15,
    openedAt: new Date().toISOString(),
    closedAt: null,
    createdAt: new Date().toISOString(),
  };

  const makeRec = (id: string, lat: number, lng: number, acc = 20): AttendanceRecord => ({
    id,
    sessionId: 'ases_1',
    studentCode: id,
    studentName: id,
    lastName: '',
    firstName: id,
    gender: '',
    dob: '',
    className: '23DLG1B',
    attendanceStatus: 'PRESENT',
    note: '',
    checkInSource: 'QR_SCAN',
    deviceToken: null,
    browserId: null,
    hardwareFingerprint: null,
    deviceLabel: null,
    ipAddress: null,
    locationLat: lat,
    locationLng: lng,
    locationAccuracy: acc,
    distanceMeters: null,
    deviceFlag: null,
    locationFlag: null,
    checkedInAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  // 3 students in class (~10.7769, 106.7009) + 1 student ~2km away
  const recs = [
    makeRec('SV1', 10.7769, 106.7009, 15),
    makeRec('SV2', 10.77695, 106.70095, 20),
    makeRec('SV3', 10.77688, 106.70088, 25),
    makeRec('SV_FAR', 10.795, 106.7009, 20),
  ];

  const updated = recalculateSessionDistances(baseSession, recs);
  assert.equal(updated[0].locationFlag, null);
  assert.equal(updated[1].locationFlag, null);
  assert.equal(updated[2].locationFlag, null);
  assert.equal(updated[3].locationFlag, 'FAR_LOCATION');
  assert.ok((updated[3].distanceMeters ?? 0) > 1500);

  const stats = computeSessionStats(updated);
  assert.equal(stats.total, 4);
  assert.equal(stats.present, 4);
  assert.equal(stats.alerts, 1);

  assert.equal(haversineMeters(10.7769, 106.7009, 10.7769, 106.7009), 0);
});
