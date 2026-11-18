export type ExamRoomStatus = 'DRAFT' | 'WAITING' | 'OPEN' | 'CLOSED';

/**
 * Returns true when students are allowed to verify identity, enter the waiting lobby,
 * and prepare for the exam (both WAITING attendance check-in and OPEN exam state).
 */
export function canStudentEnterLobby(status: ExamRoomStatus | string): boolean {
  return status === 'OPEN' || status === 'WAITING';
}

/**
 * Returns true only when the exam/shift has officially started and questions may be shown.
 */
export function canStudentAccessTakePage(status: ExamRoomStatus | string): boolean {
  return status === 'OPEN';
}

/**
 * Ensures clock reset at official release or first take-page entry only applies once
 * to untouched IN_PROGRESS attempts (0 saved answers, 0 leaves, 0 minor blurs, 0 away time).
 */
export function isAttemptEligibleForClockReset(
  attempt: {
    status: string;
    answers: Record<string, unknown>;
    leaveCount: number;
    minorBlurCount: number;
    totalAwaySeconds: number;
  },
  alreadyBegunInSession: boolean,
): boolean {
  return (
    !alreadyBegunInSession &&
    attempt.status === 'IN_PROGRESS' &&
    Object.keys(attempt.answers ?? {}).length === 0 &&
    (attempt.leaveCount ?? 0) === 0 &&
    (attempt.minorBlurCount ?? 0) === 0 &&
    (attempt.totalAwaySeconds ?? 0) === 0
  );
}

/**
 * Unified display label and badge classes for exam/shift lifecycle states.
 */
export function formatExamStatusBadge(status: ExamRoomStatus | string): {
  label: string;
  shortLabel: string;
  badgeClass: string;
} {
  switch (status) {
    case 'OPEN':
      return {
        label: 'Đang thi (Mở đề)',
        shortLabel: 'ĐANG THI',
        badgeClass: 'bg-support-100 text-support-700',
      };
    case 'WAITING':
      return {
        label: 'Phòng chờ Điểm danh',
        shortLabel: 'PHÒNG CHỜ',
        badgeClass: 'bg-indigo-100 text-indigo-700',
      };
    case 'CLOSED':
      return {
        label: 'Đã đóng (Kết thúc)',
        shortLabel: 'ĐÓNG',
        badgeClass: 'bg-slate-200 text-ink-600',
      };
    default:
      return {
        label: 'Nháp (Chưa mở)',
        shortLabel: 'NHÁP',
        badgeClass: 'bg-amber-100 text-amber-800',
      };
  }
}
