export type AttendanceStatus =
  | 'PRESENT'
  | 'LATE'
  | 'ABSENT_EXCUSED'
  | 'ABSENT_UNEXCUSED';

export type AttendanceSessionStatus = 'OPEN' | 'CLOSED';

export interface AttendanceRosterStudent {
  studentCode: string;
  lastName: string;
  firstName: string;
  className?: string;
  gender?: string;
  dob?: string;
}

export interface AttendanceClass {
  id: string;
  ownerId: string;
  courseId?: string;
  classCode: string;
  title: string;
  semester: string;
  credits: number;
  instructorName: string;
  rosterEntries: AttendanceRosterStudent[];
  sessionCount?: number;
  createdAt: string;
}

export interface AttendanceSessionStats {
  total: number;
  present: number;
  late: number;
  excused: number;
  unexcused: number;
  alerts: number;
}

export interface AttendanceSession {
  id: string;
  classId: string;
  ownerId: string;
  title: string;
  sessionDate: string;
  periodsCount: number;
  checkinPin: string;
  sessionPasscode: string;
  rotateQrSeconds: number;
  status: AttendanceSessionStatus;
  requireRosterMatch: boolean;
  requireGps: boolean;
  blockDuplicateDevice: boolean;
  instructorLat: number | null;
  instructorLng: number | null;
  maxDistanceMeters: number;
  lateAfterMinutes: number;
  openedAt: string;
  closedAt: string | null;
  createdAt: string;
  qrToken?: string;
  qrExpiresInSec?: number;
  stats?: AttendanceSessionStats;
}

export interface AttendanceRecord {
  id: string;
  sessionId: string;
  studentCode: string;
  studentName: string;
  lastName: string;
  firstName: string;
  gender: string;
  dob: string;
  className: string;
  attendanceStatus: AttendanceStatus;
  note: string;
  checkInSource: 'QR_SCAN' | 'MANUAL_ADMIN';
  deviceToken: string | null;
  browserId: string | null;
  hardwareFingerprint: string | null;
  deviceLabel: string | null;
  ipAddress: string | null;
  locationLat: number | null;
  locationLng: number | null;
  locationAccuracy: number | null;
  distanceMeters: number | null;
  deviceFlag: string | null;
  locationFlag: string | null;
  checkedInAt: string | null;
  updatedAt: string;
}

export interface AttendanceLookupResult {
  sessionId: string;
  classTitle: string;
  classCode: string;
  semester: string;
  instructorName: string;
  sessionTitle: string;
  sessionDate: string;
  checkinPin: string;
  status: AttendanceSessionStatus;
  requirePasscode: boolean;
  requireRosterMatch: boolean;
  requireGps: boolean;
  rotateQrSeconds: number;
  maxDistanceMeters: number;
  lateAfterMinutes: number;
}

export interface AttendanceCheckInPayload {
  pin: string;
  passcode?: string;
  qrToken?: string;
  studentCode: string;
  lastName?: string;
  firstName?: string;
  className?: string;
  fullName?: string;
  deviceToken: string;
  browserId: string;
  hardwareFingerprint: string;
  deviceLabel: string;
  locationLat: number | null;
  locationLng: number | null;
  locationAccuracy: number | null;
}

export interface AttendanceCheckInReceipt {
  ok: boolean;
  error?: string;
  record?: AttendanceRecord;
  sessionTitle?: string;
  classTitle?: string;
}

export interface AttendanceMatrixData {
  classInfo: AttendanceClass;
  sessions: AttendanceSession[];
  recordsBySession: Record<string, AttendanceRecord[]>;
}
