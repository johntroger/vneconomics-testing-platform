import type { LobbyPeerEntry } from '../types/exam';

export type ExamRoomStatus = 'DRAFT' | 'WAITING' | 'OPEN' | 'CLOSED';

export const LOBBY_AVATAR_IDS = [
  'fox',
  'lion',
  'owl',
  'rocket',
  'unicorn',
  'robot',
  'dragon',
  'diamond',
  'crown',
  'penguin',
  'panda',
  'bolt',
] as const;

/**
 * Picks a deterministic default mascot avatar ID from a student's code using FNV-1a hash.
 */
export function pickDefaultAvatarId(studentCode: string): string {
  const clean = studentCode.trim().toUpperCase();
  if (!clean) return LOBBY_AVATAR_IDS[0];
  let hash = 0x811c9dc5;
  for (let i = 0; i < clean.length; i += 1) {
    hash ^= clean.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  const idx = (hash >>> 0) % LOBBY_AVATAR_IDS.length;
  return LOBBY_AVATAR_IDS[idx];
}

/**
 * Resolves the active mascot avatar for an attempt from direct avatarId, loginDevices telemetry, or studentCode.
 */
export function resolveAttemptAvatarId(attempt: {
  studentCode: string;
  avatarId?: string;
  loginDevices?: Array<{ avatarId?: string }>;
}): string {
  const validSet = new Set<string>(LOBBY_AVATAR_IDS);
  const direct = attempt.avatarId?.trim();
  if (direct && validSet.has(direct)) return direct;
  const fromDevice = attempt.loginDevices?.[0]?.avatarId?.trim();
  if (fromDevice && validSet.has(fromDevice)) return fromDevice;
  return pickDefaultAvatarId(attempt.studentCode);
}

/**
 * Merges server-polled lobby peers and local active attempts for the same exam/shift,
 * deduplicates by studentCode, and pins the current student's card at index 0.
 */
export function mergeLobbyPeers(
  currentAttemptId: string,
  localAttempts: Array<{
    id: string;
    studentCode: string;
    studentName: string;
    className: string;
    avatarId?: string;
    loginDevices?: Array<{ avatarId?: string }>;
    status: string;
  }>,
  polledPeers: LobbyPeerEntry[],
): Array<LobbyPeerEntry & { isMe: boolean }> {
  const activeStatuses = new Set(['IN_PROGRESS', 'PAUSED', 'LOCKED']);
  const byCode = new Map<string, LobbyPeerEntry & { isMe: boolean }>();

  for (const peer of polledPeers) {
    const codeKey = peer.studentCode.trim().toUpperCase() || peer.id;
    const isMe = peer.id === currentAttemptId;
    byCode.set(codeKey, {
      ...peer,
      avatarId: resolveAttemptAvatarId({
        studentCode: peer.studentCode,
        avatarId: peer.avatarId,
      }),
      isMe,
    });
  }

  for (const att of localAttempts) {
    if (!activeStatuses.has(att.status)) continue;
    const codeKey = att.studentCode.trim().toUpperCase() || att.id;
    const isMe = att.id === currentAttemptId;
    const existing = byCode.get(codeKey);
    const localResolvedAvatar = resolveAttemptAvatarId(att);

    if (!existing || isMe) {
      byCode.set(codeKey, {
        id: att.id,
        studentCode: att.studentCode,
        studentName: att.studentName,
        className: att.className,
        avatarId: isMe
          ? localResolvedAvatar
          : existing?.avatarId || localResolvedAvatar,
        isReady: existing?.isReady,
        isMe,
      });
    }
  }

  const all = Array.from(byCode.values());
  const meItems = all.filter((p) => p.isMe);
  const others = all.filter((p) => !p.isMe);
  return [...meItems, ...others];
}

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
