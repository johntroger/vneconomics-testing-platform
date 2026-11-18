import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeForensicCode,
  detectScreenshotShortcut,
  isPreemptiveModifierKey,
  shouldLockSingleQuestionViewport,
  shouldThrottleScreenshotDeterrent,
} from '../src/utils/antiScreenshot.ts';

test('computeForensicCode produces deterministic FX-XXXX-YYYY tags and isolates distinct attempts', () => {
  const codeA = computeForensicCode('3122102099', 'att-1001', 'dev-abc123');
  const codeA2 = computeForensicCode('3122102099', 'att-1001', 'dev-abc123');
  const codeDiffAttempt = computeForensicCode('3122102099', 'att-1002', 'dev-abc123');
  const codeDiffStudent = computeForensicCode('3122102088', 'att-1001', 'dev-abc123');
  const shortStudent = computeForensicCode('42', 'att-1', 'dev-1');

  assert.match(codeA, /^FX-2099-[0-9A-F]{4}$/);
  assert.equal(codeA, codeA2);
  assert.notEqual(codeA, codeDiffAttempt);
  assert.notEqual(codeA, codeDiffStudent);
  assert.match(shortStudent, /^FX-0042-[0-9A-F]{4}$/);
});

test('detectScreenshotShortcut captures PrintScreen, F13, Windows Snipping, and macOS combos', () => {
  assert.equal(detectScreenshotShortcut({ key: 'PrintScreen' }), 'PrintScreen');
  assert.equal(detectScreenshotShortcut({ key: 'Unknown', code: 'PrintScreen' }), 'PrintScreen');
  assert.equal(detectScreenshotShortcut({ key: 'F13', code: 'F13' }), 'PrintScreen');
  assert.equal(
    detectScreenshotShortcut({ key: 'PrintScreen', altKey: true }),
    'Alt+PrintScreen',
  );
  assert.equal(
    detectScreenshotShortcut({ key: 'PrintScreen', metaKey: true }),
    'Win+PrintScreen',
  );
  assert.equal(
    detectScreenshotShortcut({ key: 's', metaKey: true, shiftKey: true }),
    'Cmd/Win+Shift+S',
  );
  assert.equal(
    detectScreenshotShortcut({ key: 'R', metaKey: true, shiftKey: true }),
    'Cmd/Win+Shift+R',
  );
  assert.equal(
    detectScreenshotShortcut({ key: 'S', ctrlKey: true, shiftKey: true }),
    'Ctrl+Shift+S',
  );
  assert.equal(
    detectScreenshotShortcut({ key: '4', metaKey: true, shiftKey: true }),
    'Cmd/Win+Shift+4',
  );
  // Shifted symbol keys on macOS keyboard layouts
  assert.equal(
    detectScreenshotShortcut({ key: '$', code: 'Digit4', metaKey: true, shiftKey: true }),
    'Cmd/Win+Shift+4',
  );
  assert.equal(
    detectScreenshotShortcut({ key: '%', code: 'Digit5', metaKey: true, shiftKey: true }),
    'Cmd/Win+Shift+5',
  );

  // Regular typing keys must not falsely trigger
  assert.equal(detectScreenshotShortcut({ key: 'a' }), null);
  assert.equal(detectScreenshotShortcut({ key: 'S', shiftKey: true }), null);
  assert.equal(detectScreenshotShortcut({ key: 'a', ctrlKey: true }), null);
});

test('isPreemptiveModifierKey triggers on Meta anytime and Ctrl+Shift/Alt+Shift outside inputs', () => {
  assert.equal(isPreemptiveModifierKey({ key: 'Meta' }, false), true);
  assert.equal(isPreemptiveModifierKey({ key: 'Meta' }, true), true);
  assert.equal(isPreemptiveModifierKey({ key: 'OS', code: 'MetaLeft' }, true), true);
  assert.equal(isPreemptiveModifierKey({ key: 's', metaKey: true }, true), true);

  // Outside input: Ctrl+Shift or Alt+Shift shields pre-emptively
  assert.equal(
    isPreemptiveModifierKey({ key: 'Shift', ctrlKey: true, shiftKey: true }, false),
    true,
  );
  assert.equal(
    isPreemptiveModifierKey({ key: 'Shift', altKey: true, shiftKey: true }, false),
    true,
  );

  // Inside input: normal typing with Shift, Ctrl+Shift, or Alt+Shift is preserved
  assert.equal(isPreemptiveModifierKey({ key: 'A', shiftKey: true }, true), false);
  assert.equal(
    isPreemptiveModifierKey({ key: 'ArrowLeft', ctrlKey: true, shiftKey: true }, true),
    false,
  );
  assert.equal(
    isPreemptiveModifierKey({ key: 'Shift', altKey: true, shiftKey: true }, true),
    false,
  );
});

test('shouldLockSingleQuestionViewport locks viewport to 1 question when canvasAntiOcr or oneWayMode is active', () => {
  assert.equal(shouldLockSingleQuestionViewport({ canvasAntiOcr: true, oneWayMode: false }), true);
  assert.equal(shouldLockSingleQuestionViewport({ canvasAntiOcr: false, oneWayMode: true }), true);
  assert.equal(shouldLockSingleQuestionViewport({ canvasAntiOcr: true, oneWayMode: true }), true);
  assert.equal(shouldLockSingleQuestionViewport({ canvasAntiOcr: false, oneWayMode: false }), false);
  assert.equal(shouldLockSingleQuestionViewport({}), false);
});

test('shouldThrottleScreenshotDeterrent blocks rapid keydown/keyup duplicate violations within cooldown', () => {
  assert.equal(shouldThrottleScreenshotDeterrent(0, 1000, 1200), false);
  assert.equal(shouldThrottleScreenshotDeterrent(1000, 1015, 1200), true);
  assert.equal(shouldThrottleScreenshotDeterrent(1000, 2199, 1200), true);
  assert.equal(shouldThrottleScreenshotDeterrent(1000, 2200, 1200), false);
});
