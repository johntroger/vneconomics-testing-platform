import React from 'react';

interface AppErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

const CHUNK_RELOAD_TS_KEY = 'vne_chunk_reload_ts';

function isChunkLoadError(err: Error): boolean {
  const msg = `${err.name} ${err.message}`.toLowerCase();
  return (
    msg.includes('chunkloaderror') ||
    msg.includes('failed to fetch dynamically imported module') ||
    msg.includes('importing a module script failed') ||
    msg.includes('loading chunk')
  );
}

/**
 * Top-level error boundary that gracefully handles stale Vite chunk reloads
 * and unexpected runtime errors without leaving a blank screen.
 */
export class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = { hasError: false, errorMessage: '' };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error.message || 'Đã xảy ra lỗi hiển thị không mong muốn.',
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('[AppErrorBoundary]', error, info.componentStack);
    if (isChunkLoadError(error)) {
      try {
        const lastReload = Number(sessionStorage.getItem(CHUNK_RELOAD_TS_KEY) || '0');
        const now = Date.now();
        if (!Number.isFinite(lastReload) || now - lastReload > 15000) {
          sessionStorage.setItem(CHUNK_RELOAD_TS_KEY, String(now));
          window.location.reload();
        }
      } catch {
        // Ignore sessionStorage restrictions
      }
    }
  }

  render(): React.ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="min-h-screen bg-surface-100 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white rounded-2xl border border-rose-200 shadow-lg p-6 text-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 mx-auto flex items-center justify-center text-xl font-black">
            !
          </div>
          <div className="space-y-1.5">
            <h1 className="text-base font-extrabold text-ink-900">
              Giao diện vừa gặp sự cố tạm thời
            </h1>
            <p className="text-xs text-ink-600 leading-relaxed">
              Có thể phiên bản mới vừa được cập nhật trong lúc bạn đang mở trang. Vui lòng tải lại trang để tiếp tục.
            </p>
            {this.state.errorMessage && (
              <p className="text-[11px] font-mono text-rose-700 bg-rose-50 rounded-lg px-3 py-2 break-words">
                {this.state.errorMessage}
              </p>
            )}
          </div>
          <div className="flex items-center justify-center gap-2.5 pt-1">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold shadow-sm transition"
            >
              Tải lại trang
            </button>
            <a
              href="/"
              className="px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-ink-700 text-xs font-bold transition"
            >
              Về trang chủ
            </a>
          </div>
        </div>
      </div>
    );
  }
}
