import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw, ShieldCheck } from 'lucide-react';
import { apiRequestDetailed } from '../../services/apiClient';
import { InfoHint } from './InfoHint';

interface CaptchaFieldProps {
  answer: string;
  onAnswerChange: (value: string) => void;
  onTokenChange: (token: string) => void;
  refreshKey?: number;
  disabled?: boolean;
}

export const CaptchaField: React.FC<CaptchaFieldProps> = ({
  answer,
  onAnswerChange,
  onTokenChange,
  refreshKey = 0,
  disabled = false,
}) => {
  const [imageUri, setImageUri] = useState('');
  const [loading, setLoading] = useState(false);

  const loadChallenge = useCallback(async () => {
    setLoading(true);
    onAnswerChange('');
    const res = await apiRequestDetailed<{
      ok: boolean;
      captchaToken?: string;
      imageDataUri?: string;
    }>('/api/admin_auth.php?action=captcha', { method: 'GET' });

    if (res.ok && res.data?.ok && res.data.captchaToken && res.data.imageDataUri) {
      setImageUri(res.data.imageDataUri);
      onTokenChange(res.data.captchaToken);
    } else {
      setImageUri('');
      onTokenChange('');
    }
    setLoading(false);
  }, [onAnswerChange, onTokenChange]);

  useEffect(() => {
    void loadChallenge();
  }, [loadChallenge, refreshKey]);

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-bold text-ink-700 inline-flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-brand-600 shrink-0" />
          <span>Mã xác nhận chống spam (CAPTCHA) *</span>
          <InfoHint
            title="Xác minh người thật chống đăng nhập/đăng ký tự động"
            text={
              '• Thầy/cô tính nhẩm phép tính hiển thị trong ảnh bên dưới và nhập kết quả vào ô trống.\n• Nếu thấy khó nhìn hoặc hết hạn, bấm nút mũi tên xoay để lấy mã mới.'
            }
          />
        </span>
        <button
          type="button"
          disabled={loading || disabled}
          onClick={() => void loadChallenge()}
          title="Đổi mã CAPTCHA mới"
          className="inline-flex items-center gap-1 text-[11px] font-bold text-brand-700 hover:text-brand-800 disabled:opacity-50"
        >
          <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
          <span>Làm mới</span>
        </button>
      </div>

      <div className="flex items-center gap-2.5">
        <div className="h-[42px] w-[150px] shrink-0 rounded-lg border border-slate-200 bg-white flex items-center justify-center overflow-hidden">
          {imageUri ? (
            <img
              src={imageUri}
              alt="Mã xác nhận phép tính"
              className="w-[150px] h-[42px] object-contain select-none"
              draggable={false}
            />
          ) : (
            <span className="text-[11px] text-ink-400 font-semibold">
              {loading ? 'Đang tải...' : 'Không tải được mã'}
            </span>
          )}
        </div>

        <input
          type="text"
          inputMode="numeric"
          required
          disabled={disabled}
          value={answer}
          onChange={(e) => onAnswerChange(e.target.value)}
          placeholder="Nhập kết quả..."
          aria-label="Kết quả CAPTCHA"
          className="flex-1 min-w-0 h-[42px] px-3 rounded-xl border border-slate-300 bg-white text-sm font-mono font-bold text-ink-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      </div>
    </div>
  );
};
