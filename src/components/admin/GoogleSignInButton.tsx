import React, { useEffect, useRef, useState } from 'react';

interface GoogleCredentialResponse {
  credential?: string;
}

declare global {
  interface Window {
    google?: {
      accounts?: {
        id?: {
          initialize: (cfg: {
            client_id: string;
            callback: (resp: GoogleCredentialResponse) => void;
          }) => void;
          renderButton: (
            el: HTMLElement,
            options: Record<string, unknown>,
          ) => void;
        };
      };
    };
  }
}

interface GoogleSignInButtonProps {
  googleClientId: string;
  disabled?: boolean;
  onCredential: (credential: string) => Promise<void> | void;
}

export const GoogleSignInButton: React.FC<GoogleSignInButtonProps> = ({
  googleClientId,
  disabled = false,
  onCredential,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const onCredentialRef = useRef(onCredential);
  onCredentialRef.current = onCredential;
  const [showSetupHint, setShowSetupHint] = useState(false);

  useEffect(() => {
    const clientId = googleClientId.trim();
    if (!clientId || !containerRef.current) return;

    let cancelled = false;

    const renderGsi = () => {
      if (cancelled || !containerRef.current || !window.google?.accounts?.id) {
        return;
      }
      containerRef.current.innerHTML = '';
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: (resp) => {
          if (resp.credential) {
            void onCredentialRef.current(resp.credential);
          }
        },
      });
      window.google.accounts.id.renderButton(containerRef.current, {
        theme: 'outline',
        size: 'large',
        type: 'standard',
        shape: 'rectangular',
        text: 'continue_with',
        logo_alignment: 'left',
        width: Math.min(360, containerRef.current.offsetWidth || 340),
        locale: 'vi',
      });
    };

    if (window.google?.accounts?.id) {
      renderGsi();
      return () => {
        cancelled = true;
      };
    }

    const existingScript = document.querySelector<HTMLScriptElement>(
      'script[data-vne-gsi="1"]',
    );
    if (existingScript) {
      existingScript.addEventListener('load', renderGsi);
      return () => {
        cancelled = true;
        existingScript.removeEventListener('load', renderGsi);
      };
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.dataset.vneGsi = '1';
    script.addEventListener('load', renderGsi);
    document.head.appendChild(script);

    return () => {
      cancelled = true;
      script.removeEventListener('load', renderGsi);
    };
  }, [googleClientId]);

  if (googleClientId.trim()) {
    return (
      <div
        className={`flex justify-center ${
          disabled ? 'opacity-60 pointer-events-none' : ''
        }`}
      >
        <div ref={containerRef} className="w-full flex justify-center min-h-[40px]" />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setShowSetupHint((prev) => !prev)}
        className="w-full h-11 px-4 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-ink-800 text-xs font-bold flex items-center justify-center gap-2.5 shadow-2xs transition"
      >
        <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="#4285F4"
            d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
          />
          <path
            fill="#34A853"
            d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
          />
          <path
            fill="#FBBC05"
            d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
          />
          <path
            fill="#EA4335"
            d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
          />
        </svg>
        <span>Tiếp tục với Google (Cần gắn Client ID)</span>
      </button>

      {showSetupHint && (
        <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-[11px] text-amber-900 space-y-1 leading-relaxed">
          <p className="font-bold">Chưa cấu hình Google OAuth Client ID trên máy chủ:</p>
          <p>
            1. Tạo OAuth 2.0 Client ID (Web application) tại Google Cloud Console với Authorized JavaScript Origin là{' '}
            <code className="font-mono bg-white px-1 rounded">{window.location.origin}</code>.
          </p>
          <p>
            2. Thêm dòng{' '}
            <code className="font-mono bg-white px-1 rounded">
              &apos;google_client_id&apos; =&gt; &apos;...apps.googleusercontent.com&apos;,
            </code>{' '}
            vào file <code className="font-mono bg-white px-1 rounded">.exam_config.php</code> trên Plesk.
          </p>
        </div>
      )}
    </div>
  );
};
