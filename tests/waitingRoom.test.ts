import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canStudentAccessTakePage,
  canStudentEnterLobby,
  formatExamStatusBadge,
  isAttemptEligibleForClockReset,
  LOBBY_AVATAR_IDS,
  mergeLobbyPeers,
  pickDefaultAvatarId,
  resolveAttemptAvatarId,
} from '../src/utils/examWaitingRoom.ts';

test('canStudentEnterLobby and canStudentAccessTakePage enforce waiting room gate', () => {
  assert.equal(canStudentEnterLobby('DRAFT'), false);
  assert.equal(canStudentEnterLobby('WAITING'), true);
  assert.equal(canStudentEnterLobby('OPEN'), true);
  assert.equal(canStudentEnterLobby('CLOSED'), false);

  assert.equal(canStudentAccessTakePage('DRAFT'), false);
  assert.equal(canStudentAccessTakePage('WAITING'), false);
  assert.equal(canStudentAccessTakePage('OPEN'), true);
  assert.equal(canStudentAccessTakePage('CLOSED'), false);
});

test('isAttemptEligibleForClockReset allows fresh waiting-room attempts only once', () => {
  const freshAttempt = {
    status: 'IN_PROGRESS',
    answers: {},
    leaveCount: 0,
    minorBlurCount: 0,
    totalAwaySeconds: 0,
  };

  assert.equal(isAttemptEligibleForClockReset(freshAttempt, false), true);
  // Already begun inside current session -> blocks repeated reset via back navigation
  assert.equal(isAttemptEligibleForClockReset(freshAttempt, true), false);

  // Already answered at least 1 question
  assert.equal(
    isAttemptEligibleForClockReset(
      { ...freshAttempt, answers: { q1: { answerPayload: 'A' } } },
      false,
    ),
    false,
  );

  // Already left / minor blur / away seconds / locked / submitted
  assert.equal(
    isAttemptEligibleForClockReset({ ...freshAttempt, leaveCount: 1 }, false),
    false,
  );
  assert.equal(
    isAttemptEligibleForClockReset({ ...freshAttempt, minorBlurCount: 1 }, false),
    false,
  );
  assert.equal(
    isAttemptEligibleForClockReset({ ...freshAttempt, totalAwaySeconds: 3 }, false),
    false,
  );
  assert.equal(
    isAttemptEligibleForClockReset({ ...freshAttempt, status: 'LOCKED' }, false),
    false,
  );
  assert.equal(
    isAttemptEligibleForClockReset({ ...freshAttempt, status: 'SUBMITTED' }, false),
    false,
  );
});

test('formatExamStatusBadge returns distinct labels for all 4 exam states', () => {
  assert.equal(formatExamStatusBadge('DRAFT').shortLabel, 'NHÁP');
  assert.equal(formatExamStatusBadge('WAITING').shortLabel, 'PHÒNG CHỜ');
  assert.equal(formatExamStatusBadge('OPEN').shortLabel, 'ĐANG THI');
  assert.equal(formatExamStatusBadge('CLOSED').shortLabel, 'ĐÓNG');
});

test('pickDefaultAvatarId and resolveAttemptAvatarId consistently resolve valid mascot avatars', () => {
  const av1 = pickDefaultAvatarId('3122102091');
  const av1Repeat = pickDefaultAvatarId('3122102091');
  assert.equal(av1, av1Repeat);
  assert.ok((LOBBY_AVATAR_IDS as readonly string[]).includes(av1));
  assert.equal(pickDefaultAvatarId(''), LOBBY_AVATAR_IDS[0]);

  // Prefers valid direct avatarId
  assert.equal(
    resolveAttemptAvatarId({
      studentCode: '3122102091',
      avatarId: 'dragon',
      loginDevices: [{ avatarId: 'rocket' }],
    }),
    'dragon',
  );
  // Falls back to loginDevices[0].avatarId
  assert.equal(
    resolveAttemptAvatarId({
      studentCode: '3122102091',
      loginDevices: [{ avatarId: 'unicorn' }],
    }),
    'unicorn',
  );
  // Rejects unknown avatarId and falls back cleanly
  assert.equal(
    resolveAttemptAvatarId({
      studentCode: '3122102091',
      avatarId: 'invalid_mascot_xyz',
    }),
    av1,
  );
});

test('mergeLobbyPeers pins current student first, deduplicates by studentCode, and omits submitted peers', () => {
  const merged = mergeLobbyPeers(
    'att_me',
    [
      {
        id: 'att_other_local',
        studentCode: '3122102002',
        studentName: 'Tran Thi B',
        className: 'K48-KT01',
        avatarId: 'panda',
        status: 'IN_PROGRESS',
      },
      {
        id: 'att_submitted',
        studentCode: '3122102099',
        studentName: 'Submitted Student',
        className: 'K48-KT01',
        avatarId: 'bolt',
        status: 'SUBMITTED',
      },
      {
        id: 'att_me',
        studentCode: '3122102001',
        studentName: 'Nguyen Van A',
        className: 'K48-KT01',
        avatarId: 'dragon',
        status: 'IN_PROGRESS',
      },
    ],
    [
      {
        id: 'att_me',
        studentCode: '3122102001',
        studentName: 'Nguyen Van A',
        className: 'K48-KT01',
        avatarId: 'fox',
      },
      {
        id: 'att_server_peer',
        studentCode: '3122102003',
        studentName: 'Le Van C',
        className: 'K48-KT02',
        avatarId: 'rocket',
      },
    ],
  );

  assert.equal(merged.length, 3);
  // Current user pinned at index 0 with freshly chosen local avatar 'dragon'
  assert.equal(merged[0].id, 'att_me');
  assert.equal(merged[0].isMe, true);
  assert.equal(merged[0].avatarId, 'dragon');
  // Submitted local student excluded
  assert.equal(merged.some((p) => p.id === 'att_submitted'), false);
  // Both server peer and active local classmate included
  assert.equal(merged.some((p) => p.studentCode === '3122102003' && p.avatarId === 'rocket'), true);
  assert.equal(merged.some((p) => p.studentCode === '3122102002' && p.avatarId === 'panda'), true);
});
