export interface KeyboardShortcutLike {
  key: string;
  code?: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
}

/**
 * Generates a compact, deterministic forensic identifier from attempt metadata
 * so any cropped screenshot can still be traced back to the exact candidate & session.
 */
export function computeForensicCode(
  studentCode: string,
  attemptId: string,
  deviceToken: string,
): string {
  const cleanCode = studentCode
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  const tail4 = (cleanCode.slice(-4) || '0000').padStart(4, '0');

  const seed = `${studentCode.trim()}|${attemptId.trim()}|${deviceToken.trim()}`;
  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  const folded16 = ((hash ^ (hash >>> 16)) >>> 0) & 0xffff;
  const hex4 = folded16.toString(16).toUpperCase().padStart(4, '0');
  return `FX-${tail4}-${hex4}`;
}

/**
 * Detects OS/browser screenshot and screen-recording hotkeys across Windows, macOS, and Linux.
 */
export function detectScreenshotShortcut(e: KeyboardShortcutLike): string | null {
  const key = e.key ?? '';
  const code = e.code ?? '';
  const lowerKey = key.toLowerCase();

  if (
    key === 'PrintScreen' ||
    code === 'PrintScreen' ||
    key === 'F13' ||
    code === 'F13'
  ) {
    if (e.metaKey) return 'Win+PrintScreen';
    if (e.altKey) return 'Alt+PrintScreen';
    return 'PrintScreen';
  }

  if ((e.metaKey || e.ctrlKey) && e.shiftKey) {
    const codeMap: Record<string, string> = {
      Digit3: '3',
      Digit4: '4',
      Digit5: '5',
      Digit6: '6',
      KeyS: 'S',
      KeyR: 'R',
    };
    const keyMap: Record<string, string> = {
      '3': '3',
      '#': '3',
      '4': '4',
      '$': '4',
      '5': '5',
      '%': '5',
      '6': '6',
      '^': '6',
      s: 'S',
      r: 'R',
    };

    const matchedKey = keyMap[lowerKey] ?? codeMap[code];
    if (matchedKey) {
      const prefix = e.metaKey ? 'Cmd/Win' : 'Ctrl';
      return `${prefix}+Shift+${matchedKey}`;
    }
  }

  return null;
}

/**
 * Pre-emptively identifies screenshot modifier chords (Meta / Win / Cmd or Ctrl+Shift / Alt+Shift)
 * so the exam UI can black out before the OS captures the framebuffer.
 */
export function isPreemptiveModifierKey(
  e: KeyboardShortcutLike,
  isTextInputFocused: boolean,
): boolean {
  const key = e.key ?? '';
  const code = e.code ?? '';

  if (
    key === 'Meta' ||
    key === 'OS' ||
    code === 'MetaLeft' ||
    code === 'MetaRight' ||
    Boolean(e.metaKey)
  ) {
    return true;
  }

  if (isTextInputFocused) {
    return false;
  }

  return Boolean((e.ctrlKey && e.shiftKey) || (e.altKey && e.shiftKey));
}

/**
 * Locks exam viewport to a single question at a time when strict anti-capture or one-way mode is enabled
 * to defeat scrolling full-page screenshots.
 */
export function shouldLockSingleQuestionViewport(exam: {
  oneWayMode?: boolean;
  canvasAntiOcr?: boolean;
}): boolean {
  return Boolean(exam.oneWayMode || exam.canvasAntiOcr);
}
