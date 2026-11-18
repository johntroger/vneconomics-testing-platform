import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, EyeOff, ShieldAlert } from 'lucide-react';
import type { ViolationEvent } from '../../types/exam';
import {
  detectScreenshotShortcut,
  isPreemptiveModifierKey,
} from '../../utils/antiScreenshot';

interface AntiCheatGuardProps {
  enabled: boolean;
  gracePeriodMs: number;
  isLocked: boolean;
  requireFullscreen?: boolean;
  antiCameraIdleShield?: boolean;
  onPauseChange: (paused: boolean, awaySecondsDelta: number, reason: string) => void;
  onViolation: (event: Omit<ViolationEvent, 'id' | 'occurredAt'>) => void;
}

export const AntiCheatGuard: React.FC<AntiCheatGuardProps> = ({
  enabled,
  gracePeriodMs,
  isLocked,
  requireFullscreen = false,
  antiCameraIdleShield = false,
  onPauseChange,
  onViolation,
}) => {
  const [blackout, setBlackout] = useState(false);
  const [modifierShield, setModifierShield] = useState(false);
  const [idleCurtain, setIdleCurtain] = useState(false);
  const [fullscreenMissing, setFullscreenMissing] = useState(false);
  const [minorNotice, setMinorNotice] = useState<string | null>(null);
  const leftAtRef = useRef<number | null>(null);
  const mountedAtRef = useRef<number>(Date.now());
  const lastInputActivityAtRef = useRef<number>(0);
  const noticeTimerRef = useRef<number | null>(null);
  const screenshotBlackoutTimerRef = useRef<number | null>(null);
  const modifierTimerRef = useRef<number | null>(null);
  const lastExtendedWarnAtRef = useRef<number>(0);
  const hadFullscreenRef = useRef<boolean>(false);
  const baseViewportWidthRef = useRef<number>(
    typeof window !== 'undefined' ? window.innerWidth : 390,
  );
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  const showQuickNotice = useCallback((msg: string, durationMs = 1400) => {
    if (noticeTimerRef.current !== null) {
      window.clearTimeout(noticeTimerRef.current);
    }
    setMinorNotice(msg);
    noticeTimerRef.current = window.setTimeout(() => {
      setMinorNotice(null);
      noticeTimerRef.current = null;
    }, durationMs);
  }, []);

  const acquireWakeLock = useCallback(async () => {
    try {
      if ('wakeLock' in navigator && document.visibilityState === 'visible') {
        wakeLockRef.current = await navigator.wakeLock.request('screen');
      }
    } catch {
      // Ignore on unsupported browsers / low battery mode
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    mountedAtRef.current = Date.now();
    baseViewportWidthRef.current = window.visualViewport?.width ?? window.innerWidth;
    void acquireWakeLock();
    return () => {
      if (noticeTimerRef.current !== null) {
        window.clearTimeout(noticeTimerRef.current);
        noticeTimerRef.current = null;
      }
      void wakeLockRef.current?.release().catch(() => {});
    };
  }, [acquireWakeLock, enabled]);

  const handleLeaveSignal = useCallback(
    (reason: string) => {
      if (!enabled || isLocked) return;
      // Bỏ qua tín hiệu blur thoáng qua trong 1.5s đầu khi mới chuyển từ phòng chờ vào phòng thi
      if (Date.now() - mountedAtRef.current < 1500 && document.visibilityState === 'visible') {
        return;
      }
      // Same-frame DOM blackout (< 16ms) before warning dialog
      setBlackout(true);
      if (leftAtRef.current === null) {
        leftAtRef.current = Date.now();
      }
      onPauseChange(true, 0, reason);
    },
    [enabled, isLocked, onPauseChange],
  );

  const handleReturnSignal = useCallback(() => {
    if (!enabled) return;
    setBlackout(false);
    setModifierShield(false);
    setIdleCurtain(false);
    void acquireWakeLock();

    if (leftAtRef.current === null) return;
    const elapsedMs = Date.now() - leftAtRef.current;
    leftAtRef.current = null;

    if (elapsedMs < gracePeriodMs) {
      const secs = Math.max(1, Math.round(elapsedMs / 1000));
      onViolation({
        severity: 'MINOR_BLUR',
        eventType: 'BLUR_AMNESTY',
        durationSeconds: secs,
        detail: `Mất focus ${elapsedMs}ms (< ${(gracePeriodMs / 1000).toFixed(1)}s ân xá thông minh)`,
      });
      onPauseChange(false, 0, '');
      // Chỉ hiện thông báo ngắn gọn nếu mất focus >= 350ms và ngoài 1.5s đầu lúc vào thi
      if (elapsedMs >= 350 && Date.now() - mountedAtRef.current >= 1500) {
        showQuickNotice(
          `Đã ẩn đề bảo vệ (${(elapsedMs / 1000).toFixed(1)}s — không tính vi phạm)`,
          1400,
        );
      }
      return;
    }

    const awaySecs = Math.max(3, Math.round(elapsedMs / 1000));
    onViolation({
      severity: 'MAJOR_LEAVE',
      eventType: 'SCREEN_LEAVE',
      durationSeconds: awaySecs,
      detail: `Rời màn hình thi ${awaySecs} giây`,
    });
    onPauseChange(true, awaySecs, `Bạn vừa rời màn hình ${awaySecs} giây.`);
  }, [acquireWakeLock, enabled, gracePeriodMs, onPauseChange, onViolation, showQuickNotice]);

  useEffect(() => {
    if (!enabled) return;

    const isTouchDevice =
      typeof window !== 'undefined' &&
      ('ontouchstart' in window || navigator.maxTouchPoints > 0);

    const onInputFocusChange = (e: FocusEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        lastInputActivityAtRef.current = Date.now();
      }
    };

    const onVisibilityChange = () => {
      if (document.hidden) {
        handleLeaveSignal('Chuyển sang ứng dụng / tab khác');
      } else {
        handleReturnSignal();
      }
    };

    const onBlur = () => {
      // Trên điện thoại/tablet (iOS Safari, Android), bấm nút hạ bàn phím hoặc thanh công cụ bàn phím
      // có thể kích hoạt window.blur dù thí sinh vẫn đang ở trong trang thi (document.hidden === false).
      if (isTouchDevice && !document.hidden) {
        return;
      }
      handleLeaveSignal('Mất tiêu điểm màn hình (Popup / Đa nhiệm)');
    };

    const onFocus = () => {
      handleReturnSignal();
    };

    const onPageHide = () => {
      handleLeaveSignal('Ẩn trình duyệt hoặc rời trang thi');
    };

    const onResizeCheckSplit = () => {
      if (Date.now() - mountedAtRef.current < 1500) return;

      const activeTag = document.activeElement?.tagName ?? '';
      const isTyping = activeTag === 'INPUT' || activeTag === 'TEXTAREA';
      const recentKeyboardToggle = Date.now() - lastInputActivityAtRef.current < 1500;
      const vw = window.visualViewport?.width ?? window.innerWidth;
      const vh = window.visualViewport?.height ?? window.innerHeight;

      if (vw > baseViewportWidthRef.current) {
        baseViewportWidthRef.current = vw;
      }
      const baseW = baseViewportWidthRef.current;

      const widthShrunk = vw < baseW * 0.8;
      const heightShrunkWithoutTyping =
        !isTyping &&
        !recentKeyboardToggle &&
        vh < window.screen.height * 0.56 &&
        window.innerHeight < window.screen.height * 0.62;

      if (widthShrunk || heightShrunkWithoutTyping) {
        setBlackout(true);
        onViolation({
          severity: 'SPLIT_SCREEN',
          eventType: 'SPLIT_SCREEN_DETECTED',
          durationSeconds: 3,
          detail: `Phát hiện chia đôi màn hình / cửa sổ nổi (${Math.round(vw)}x${Math.round(vh)})`,
        });
      }
    };

    // Guard against swipe-back gesture on mobile Safari/Chrome
    window.history.pushState({ examGuard: true }, '', window.location.href);
    const onPopState = () => {
      window.history.pushState({ examGuard: true }, '', window.location.href);
      showQuickNotice('Thao tác vuốt quay lại bị khóa trong phòng thi.', 1400);
    };

    const blockAction = (e: Event) => {
      const target = e.target as HTMLElement | null;
      const allowInsideInput =
        target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA');
      if (allowInsideInput && e.type === 'contextmenu') {
        e.preventDefault();
        return;
      }
      if (!allowInsideInput || e.type === 'copy' || e.type === 'cut') {
        e.preventDefault();
      }
    };

    const triggerScreenshotDeterrent = (shortcutLabel: string) => {
      setBlackout(true);
      setModifierShield(false);
      if (modifierTimerRef.current !== null) {
        window.clearTimeout(modifierTimerRef.current);
        modifierTimerRef.current = null;
      }
      if (screenshotBlackoutTimerRef.current !== null) {
        window.clearTimeout(screenshotBlackoutTimerRef.current);
      }
      screenshotBlackoutTimerRef.current = window.setTimeout(() => {
        if (!document.hidden && leftAtRef.current === null) {
          setBlackout(false);
        }
        screenshotBlackoutTimerRef.current = null;
      }, 1800);
      try {
        if (navigator.clipboard?.writeText) {
          void navigator.clipboard.writeText('').catch(() => {});
        }
      } catch {
        // Clipboard API may not be permitted
      }
      showQuickNotice('Phát hiện thao tác chụp/quay màn hình — Đã ghi nhận vi phạm!', 2400);
      onViolation({
        severity: 'DEVTOOLS',
        eventType: 'SCREENSHOT_ATTEMPT',
        durationSeconds: 2,
        detail: `Phát hiện thao tác chụp/quay màn hình (${shortcutLabel})`,
      });
    };

    const checkExtendedScreen = () => {
      const screenAny = window.screen as Screen & { isExtended?: boolean };
      if (screenAny?.isExtended === true) {
        const now = Date.now();
        if (now - lastExtendedWarnAtRef.current >= 45000) {
          lastExtendedWarnAtRef.current = now;
          showQuickNotice(
            'Cảnh báo: Phát hiện máy tính đang kết nối 2 màn hình mở rộng!',
            2800,
          );
          onViolation({
            severity: 'DEVTOOLS',
            eventType: 'EXTENDED_DISPLAY_DETECTED',
            durationSeconds: 3,
            detail: 'Phát hiện kết nối màn hình phụ thứ 2 (Dual/Extended Display) khi đang làm bài',
          });
        }
      }
    };

    const onEnterPip = () => {
      void document.exitPictureInPicture?.().catch(() => {});
      showQuickNotice('Chế độ Picture-in-Picture bị khóa trong giờ thi.', 1800);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const shotCombo = detectScreenshotShortcut(e);
      if (shotCombo) {
        e.preventDefault();
        triggerScreenshotDeterrent(shotCombo);
        return;
      }

      const activeTag = document.activeElement?.tagName ?? '';
      const isTextInputFocused =
        activeTag === 'INPUT' ||
        activeTag === 'TEXTAREA' ||
        Boolean((document.activeElement as HTMLElement | null)?.isContentEditable);

      if (isPreemptiveModifierKey(e, isTextInputFocused)) {
        if (modifierTimerRef.current !== null) {
          window.clearTimeout(modifierTimerRef.current);
          modifierTimerRef.current = null;
        }
        setModifierShield(true);
      }

      const k = e.key.toLowerCase();
      if (
        e.key === 'F12' ||
        ((e.ctrlKey || e.metaKey) && e.shiftKey && ['i', 'j', 'c'].includes(k)) ||
        ((e.ctrlKey || e.metaKey) && ['p', 's', 'u', 'c'].includes(k))
      ) {
        e.preventDefault();
        onViolation({
          severity: 'DEVTOOLS',
          eventType: 'RESTRICTED_SHORTCUT',
          durationSeconds: 1,
          detail: `Tổ hợp phím bị hạn chế: ${e.key}`,
        });
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      const shotUp = detectScreenshotShortcut(e);
      if (shotUp) {
        triggerScreenshotDeterrent(shotUp);
        return;
      }
      if (!e.metaKey && !e.ctrlKey && !e.altKey) {
        if (modifierTimerRef.current !== null) {
          window.clearTimeout(modifierTimerRef.current);
        }
        modifierTimerRef.current = window.setTimeout(() => {
          setModifierShield(false);
          modifierTimerRef.current = null;
        }, 250);
      }
    };

    // Lock Web Screen Capture / Recording API (getDisplayMedia) during active exam
    type MediaDevicesWithDisplay = MediaDevices & {
      getDisplayMedia?: (constraints?: unknown) => Promise<MediaStream>;
    };
    const mediaDevices = navigator.mediaDevices as MediaDevicesWithDisplay | undefined;
    let origGetDisplayMedia: ((constraints?: unknown) => Promise<MediaStream>) | undefined;
    let patchedGetDisplayMedia = false;

    if (mediaDevices && typeof mediaDevices.getDisplayMedia === 'function') {
      origGetDisplayMedia = mediaDevices.getDisplayMedia;
      const blockedGetDisplayMedia = () => {
        triggerScreenshotDeterrent('ScreenCapture/getDisplayMedia');
        return Promise.reject(
          new DOMException(
            'Screen capture is disabled during the exam.',
            'NotAllowedError',
          ),
        );
      };
      try {
        Object.defineProperty(mediaDevices, 'getDisplayMedia', {
          configurable: true,
          writable: true,
          value: blockedGetDisplayMedia,
        });
        patchedGetDisplayMedia = true;
      } catch {
        try {
          mediaDevices.getDisplayMedia = blockedGetDisplayMedia;
          patchedGetDisplayMedia = true;
        } catch {
          // Non-writable property in strict browser environments
        }
      }
    }

    const canFullscreen =
      requireFullscreen &&
      !isTouchDevice &&
      typeof document.documentElement?.requestFullscreen === 'function';

    const syncFullscreenState = () => {
      if (!canFullscreen) {
        setFullscreenMissing(false);
        return;
      }
      const inFs = Boolean(document.fullscreenElement);
      if (inFs) {
        hadFullscreenRef.current = true;
        setFullscreenMissing(false);
      } else {
        setFullscreenMissing(true);
        if (hadFullscreenRef.current && Date.now() - mountedAtRef.current >= 1500) {
          onViolation({
            severity: 'MAJOR_LEAVE',
            eventType: 'FULLSCREEN_EXIT',
            durationSeconds: 3,
            detail: 'Thoát chế độ Toàn màn hình trong khi làm bài',
          });
        }
      }
    };

    if (canFullscreen) {
      syncFullscreenState();
    } else {
      setFullscreenMissing(false);
    }

    checkExtendedScreen();
    const screenTarget = window.screen as unknown as EventTarget | undefined;
    screenTarget?.addEventListener?.('change', checkExtendedScreen);

    const onWindowResize = () => {
      onResizeCheckSplit();
      checkExtendedScreen();
    };

    document.addEventListener('focusin', onInputFocusChange);
    document.addEventListener('focusout', onInputFocusChange);
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    window.addEventListener('pagehide', onPageHide);
    window.visualViewport?.addEventListener('resize', onWindowResize);
    window.addEventListener('resize', checkExtendedScreen);
    window.addEventListener('popstate', onPopState);
    document.addEventListener('contextmenu', blockAction);
    document.addEventListener('copy', blockAction);
    document.addEventListener('cut', blockAction);
    document.addEventListener('dragstart', blockAction);
    document.addEventListener('fullscreenchange', syncFullscreenState);
    document.addEventListener('enterpictureinpicture', onEnterPip);
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', onKeyUp, true);

    return () => {
      if (screenshotBlackoutTimerRef.current !== null) {
        window.clearTimeout(screenshotBlackoutTimerRef.current);
        screenshotBlackoutTimerRef.current = null;
      }
      if (modifierTimerRef.current !== null) {
        window.clearTimeout(modifierTimerRef.current);
        modifierTimerRef.current = null;
      }
      if (patchedGetDisplayMedia && mediaDevices && origGetDisplayMedia) {
        try {
          Object.defineProperty(mediaDevices, 'getDisplayMedia', {
            configurable: true,
            writable: true,
            value: origGetDisplayMedia,
          });
        } catch {
          try {
            mediaDevices.getDisplayMedia = origGetDisplayMedia;
          } catch {
            // Ignore restore errors on teardown
          }
        }
      }
      screenTarget?.removeEventListener?.('change', checkExtendedScreen);
      document.removeEventListener('focusin', onInputFocusChange);
      document.removeEventListener('focusout', onInputFocusChange);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('pagehide', onPageHide);
      window.visualViewport?.removeEventListener('resize', onWindowResize);
      window.removeEventListener('resize', checkExtendedScreen);
      window.removeEventListener('popstate', onPopState);
      document.removeEventListener('contextmenu', blockAction);
      document.removeEventListener('copy', blockAction);
      document.removeEventListener('cut', blockAction);
      document.removeEventListener('dragstart', blockAction);
      document.removeEventListener('fullscreenchange', syncFullscreenState);
      document.removeEventListener('enterpictureinpicture', onEnterPip);
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('keyup', onKeyUp, true);
    };
  }, [enabled, handleLeaveSignal, handleReturnSignal, onViolation, requireFullscreen, showQuickNotice]);

  // Auto-blur question surface after 12s of no pointer/touch/keyboard interaction when antiCameraIdleShield is active
  useEffect(() => {
    if (!enabled || isLocked || !antiCameraIdleShield) {
      setIdleCurtain(false);
      return;
    }

    const IDLE_SHIELD_MS = 12000;
    let timerId: number | null = null;

    const scheduleIdle = () => {
      if (timerId !== null) {
        window.clearTimeout(timerId);
      }
      timerId = window.setTimeout(() => {
        const activeTag = document.activeElement?.tagName ?? '';
        if (activeTag === 'INPUT' || activeTag === 'TEXTAREA') {
          scheduleIdle();
          return;
        }
        if (!document.hidden) {
          setIdleCurtain(true);
        }
      }, IDLE_SHIELD_MS);
    };

    const onActivity = () => {
      setIdleCurtain(false);
      scheduleIdle();
    };

    scheduleIdle();
    window.addEventListener('pointerdown', onActivity, true);
    window.addEventListener('pointermove', onActivity, true);
    window.addEventListener('touchstart', onActivity, true);
    window.addEventListener('touchmove', onActivity, true);
    window.addEventListener('wheel', onActivity, true);
    window.addEventListener('keydown', onActivity, true);
    window.addEventListener('input', onActivity, true);

    return () => {
      if (timerId !== null) {
        window.clearTimeout(timerId);
      }
      window.removeEventListener('pointerdown', onActivity, true);
      window.removeEventListener('pointermove', onActivity, true);
      window.removeEventListener('touchstart', onActivity, true);
      window.removeEventListener('touchmove', onActivity, true);
      window.removeEventListener('wheel', onActivity, true);
      window.removeEventListener('keydown', onActivity, true);
      window.removeEventListener('input', onActivity, true);
    };
  }, [antiCameraIdleShield, enabled, isLocked]);

  if (!enabled) return null;

  const isBlackoutActive = blackout || modifierShield;

  return (
    <>
      {fullscreenMissing && !isBlackoutActive && (
        <div className="fixed inset-0 z-[85] bg-ink-900/90 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center text-white select-none">
          <div className="w-16 h-16 rounded-2xl bg-white/10 flex items-center justify-center mb-4">
            <AlertTriangle className="w-8 h-8 text-amber-300" />
          </div>
          <h2 className="text-xl font-bold mb-2">Ca thi yêu cầu Toàn màn hình</h2>
          <p className="text-sm text-slate-300 max-w-sm leading-relaxed mb-5">
            Để hạn chế chụp màn hình và mở ứng dụng khác, vui lòng bật chế độ Toàn màn hình trước khi tiếp tục làm bài.
          </p>
          <button
            type="button"
            onClick={() => {
              void document.documentElement.requestFullscreen?.().catch(() => {});
            }}
            className="px-5 py-3 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-bold shadow-lg"
          >
            Bật Toàn màn hình để làm bài
          </button>
        </div>
      )}

      {idleCurtain && !isBlackoutActive && !fullscreenMissing && (
        <div
          onClick={() => setIdleCurtain(false)}
          onTouchStart={() => setIdleCurtain(false)}
          className="fixed inset-0 z-[80] bg-ink-900/80 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center text-white select-none cursor-pointer"
        >
          <div className="w-14 h-14 rounded-2xl bg-white/10 flex items-center justify-center mb-3">
            <ShieldAlert className="w-7 h-7 text-amber-300" />
          </div>
          <h2 className="text-lg font-bold mb-1.5">Tạm che đề do không có tương tác</h2>
          <p className="text-xs sm:text-sm text-slate-200 max-w-sm leading-relaxed">
            Chế độ bảo vệ chống chụp ảnh đề thi: Chạm vào màn hình hoặc di chuột để tiếp tục xem câu hỏi.
          </p>
          <span className="mt-4 inline-flex px-4 py-2 rounded-xl bg-brand-600 text-xs font-bold">
            Chạm để hiện lại câu hỏi (Không tính vi phạm)
          </span>
        </div>
      )}

      {isBlackoutActive && (
        <div
          aria-hidden="true"
          onClick={handleReturnSignal}
          onTouchEnd={handleReturnSignal}
          className="fixed inset-0 z-[90] bg-ink-900 flex flex-col items-center justify-center p-6 text-center text-white select-none cursor-pointer"
        >
          <div className="w-16 h-16 rounded-2xl bg-white/10 flex items-center justify-center mb-4">
            <EyeOff className="w-8 h-8 text-amber-300" />
          </div>
          <h2 className="text-xl font-bold mb-2">Đề thi đã được ẩn bảo vệ tức thì</h2>
          <p className="text-sm text-slate-300 max-w-xs leading-relaxed">
            {modifierShield && !blackout
              ? 'Hệ thống đang chặn tổ hợp phím điều khiển/chụp màn hình. Vui lòng thả phím để làm bài tiếp.'
              : 'Hệ thống phát hiện màn hình vừa mất focus hoặc có thao tác chụp/quay màn hình. Vui lòng quay lại bài thi.'}
          </p>
          <p className="text-xs text-amber-300 font-semibold mt-4">
            Chạm vào màn hình nếu bạn đã quay lại bài thi
          </p>
        </div>
      )}

      {minorNotice && !isBlackoutActive && (
        <div className="fixed top-14 left-1/2 -translate-x-1/2 z-[65] w-auto max-w-[92%] sm:max-w-sm bg-ink-900/95 text-white text-[11px] font-medium px-3 py-1.5 rounded-full shadow-lg flex items-center gap-2 pointer-events-none animate-fadeIn">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span className="truncate">{minorNotice}</span>
        </div>
      )}
    </>
  );
};
