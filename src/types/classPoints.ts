import type { AttendanceRosterStudent } from './attendance';

export type PointLedgerSourceType = 'MINIGAME' | 'MANUAL' | 'LIVE_GAME';
export type PointLedgerType = 'REWARD' | 'PENALTY';

export type StatsPeriodMode =
  | 'ALL'
  | 'DAY'
  | 'WEEK'
  | 'MONTH'
  | 'SEMESTER'
  | 'ACADEMIC_YEAR'
  | 'YEAR'
  | 'CUSTOM';

export type SemesterCode = 'HK1' | 'HK2' | 'SUMMER';

export interface FixedClassSummary {
  id: string;
  ownerId: string;
  courseId?: string | null;
  classCode: string;
  title: string;
  semester: string;
  credits: number;
  instructorName: string;
  rosterEntries: AttendanceRosterStudent[];
  studentCount: number;
  totalReward: number;
  totalPenalty: number;
  netPoints: number;
  entryCount: number;
  lastActivityAt: string | null;
  createdAt: string;
}

export interface StudentPointSummary {
  studentCode: string;
  studentName: string;
  gender: string;
  inRoster: boolean;
  rewardPoints: number;
  penaltyPoints: number;
  netPoints: number;
  rewardCount: number;
  penaltyCount: number;
  totalEvents: number;
  lastActivityAt: string | null;
}

export interface PointTrendBucket {
  bucket: string;
  reward: number;
  penalty: number;
  net: number;
  count: number;
}

export interface PointLedgerEntry {
  id: string;
  classId: string;
  studentCode: string;
  studentName: string;
  sourceType: PointLedgerSourceType;
  sourceId: string;
  sourceTitle: string;
  pointType: PointLedgerType;
  deltaPoints: number;
  reason: string;
  occurredDate: string;
  createdAt: string;
}

export interface ClassPointsSummaryResponse {
  ok: boolean;
  classItem: FixedClassSummary;
  startDate: string;
  endDate: string;
  granularity: 'DAY' | 'MONTH';
  totals: {
    totalReward: number;
    totalPenalty: number;
    netTotal: number;
    totalEvents: number;
    activeStudents: number;
    rosterCount: number;
  };
  students: StudentPointSummary[];
  trend: PointTrendBucket[];
  entries: PointLedgerEntry[];
}

export interface AddPointsEntryInput {
  studentCode: string;
  studentName: string;
  pointType: PointLedgerType;
  points: number;
  reason: string;
  sourceType?: PointLedgerSourceType;
  sourceId?: string;
  sourceTitle?: string;
  occurredDate?: string;
}
