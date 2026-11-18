import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canStudentAccessTakePage,
  canStudentEnterLobby,
  formatExamStatusBadge,
  isAttemptEligibleForClockReset,
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
