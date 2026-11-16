import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, EyeOff } from 'lucide-react';
import type { ViolationEvent } from '../../types/exam';

interface AntiCheatGuardProps {
  enabled: boolean;
  gracePeriodMs: number;
  isLocked: boolean;
  onPauseChange: (paused: boolean, awaySecondsDelta: number, reason: string) => void;
  onViolation: (event: Omit<ViolationEvent, 'id' | 'occurredAt'>) => void;
}

export const AntiCheatGuard: React.FC<AntiCheatGuardProps> = ({
  enabled,
  gracePeriodMs,
  isLocked,
  onPauseChange,
  onViolation,
}) => {
  const [blackout, setBlackout] = useState(false);
  const [minorNotice, setMinorNotice] = useState<string | null>(null);
  const leftAtRef = useRef<number | null>(null);
  const mountedAtRef = useRef<number>(Date.now());
  const lastInputActivityAtRef = useRef<number>(0);
  const noticeTimerRef = useRef<number | null>(null);
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

    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === 'F12' ||
        e.key === 'PrintScreen' ||
        ((e.ctrlKey || e.metaKey) && ['p', 's', 'u', 'c'].includes(e.key.toLowerCase()))
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

    document.addEventListener('focusin', onInputFocusChange);
    document.addEventListener('focusout', onInputFocusChange);
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    window.addEventListener('pagehide', onPageHide);
    window.visualViewport?.addEventListener('resize', onResizeCheckSplit);
    window.addEventListener('popstate', onPopState);
    document.addEventListener('contextmenu', blockAction);
    document.addEventListener('copy', blockAction);
    document.addEventListener('cut', blockAction);
    document.addEventListener('dragstart', blockAction);
    window.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('focusin', onInputFocusChange);
      document.removeEventListener('focusout', onInputFocusChange);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('pagehide', onPageHide);
      window.visualViewport?.removeEventListener('resize', onResizeCheckSplit);
      window.removeEventListener('popstate', onPopState);
      document.removeEventListener('contextmenu', blockAction);
      document.removeEventListener('copy', blockAction);
      document.removeEventListener('cut', blockAction);
      document.removeEventListener('dragstart', blockAction);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [enabled, handleLeaveSignal, handleReturnSignal, onViolation, showQuickNotice]);

  if (!enabled) return null;

  return (
    <>
      {blackout && (
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
            Hệ thống phát hiện màn hình vừa mất focus hoặc bị chuyển đổi. Vui lòng quay lại màn hình thi ngay.
          </p>
          <p className="text-xs text-amber-300 font-semibold mt-4">
            Chạm vào màn hình nếu bạn đã quay lại bài thi
          </p>
        </div>
      )}

      {minorNotice && !blackout && (
        <div className="fixed top-14 left-1/2 -translate-x-1/2 z-[65] w-auto max-w-[92%] sm:max-w-sm bg-ink-900/95 text-white text-[11px] font-medium px-3 py-1.5 rounded-full shadow-lg flex items-center gap-2 pointer-events-none animate-fadeIn">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span className="truncate">{minorNotice}</span>
        </div>
      )}
    </>
  );
};
