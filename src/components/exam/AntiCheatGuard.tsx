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
  const baseViewportWidthRef = useRef<number>(
    typeof window !== 'undefined' ? window.innerWidth : 390,
  );
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

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
    void acquireWakeLock();
    return () => {
      void wakeLockRef.current?.release().catch(() => {});
    };
  }, [acquireWakeLock, enabled]);

  const handleLeaveSignal = useCallback(
    (reason: string) => {
      if (!enabled || isLocked) return;
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
      setMinorNotice(
        `Đã tự động ẩn đề bảo vệ (${(elapsedMs / 1000).toFixed(1)}s — nằm trong ngưỡng ân xá, không trừ lượt vi phạm).`,
      );
      window.setTimeout(() => setMinorNotice(null), 4000);
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
  }, [acquireWakeLock, enabled, gracePeriodMs, onPauseChange, onViolation]);

  useEffect(() => {
    if (!enabled) return;

    const onVisibilityChange = () => {
      if (document.hidden) {
        handleLeaveSignal('Chuyển sang ứng dụng / tab khác');
      } else {
        handleReturnSignal();
      }
    };

    const onBlur = () => {
      handleLeaveSignal('Mất tiêu điểm màn hình (Popup / Đa nhiệm)');
    };

    const onFocus = () => {
      handleReturnSignal();
    };

    const onPageHide = () => {
      handleLeaveSignal('Ẩn trình duyệt hoặc rời trang thi');
    };

    const onResizeCheckSplit = () => {
      const activeTag = document.activeElement?.tagName ?? '';
      const isTyping = activeTag === 'INPUT' || activeTag === 'TEXTAREA';
      const vw = window.visualViewport?.width ?? window.innerWidth;
      const vh = window.visualViewport?.height ?? window.innerHeight;
      const baseW = baseViewportWidthRef.current;

      const widthShrunk = vw < baseW * 0.85;
      const heightShrunkWithoutTyping =
        !isTyping && vh < window.screen.height * 0.56 && window.innerHeight < window.screen.height * 0.62;

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
      setMinorNotice('Thao tác vuốt quay lại bị khóa trong phòng thi để bảo vệ bài làm.');
      window.setTimeout(() => setMinorNotice(null), 3200);
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
  }, [enabled, handleLeaveSignal, handleReturnSignal, onViolation]);

  if (!enabled) return null;

  return (
    <>
      {blackout && (
        <div
          aria-hidden="true"
          className="fixed inset-0 z-[90] bg-ink-900 flex flex-col items-center justify-center p-6 text-center text-white select-none"
        >
          <div className="w-16 h-16 rounded-2xl bg-white/10 flex items-center justify-center mb-4">
            <EyeOff className="w-8 h-8 text-amber-300" />
          </div>
          <h2 className="text-xl font-bold mb-2">Đề thi đã được ẩn bảo vệ tức thì</h2>
          <p className="text-sm text-slate-300 max-w-xs leading-relaxed">
            Hệ thống phát hiện màn hình vừa mất focus hoặc bị chuyển đổi. Vui lòng quay lại màn hình thi ngay.
          </p>
        </div>
      )}

      {minorNotice && !blackout && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-[75] w-[92%] max-w-md bg-ink-900 text-white text-xs font-medium px-3.5 py-2.5 rounded-xl shadow-lg flex items-center gap-2.5 animate-fadeIn">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
          <span>{minorNotice}</span>
        </div>
      )}
    </>
  );
};
