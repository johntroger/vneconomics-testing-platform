import React, { useEffect, useState } from 'react';
import { CheckCircle2, KeyRound, Lock, RefreshCw, ShieldAlert } from 'lucide-react';

interface PauseWarningModalProps {
  isOpen: boolean;
  isLocked: boolean;
  reason: string;
  leaveCount: number;
  maxLeaveCount: number;
  totalAwaySeconds: number;
  lockedWaitSeconds: number;
  onResumeWarning: () => void;
  onSendUnlockNote: (note: string) => void;
  onVerifyRescuePin: (pin: string) => boolean;
}

const QUICK_REASON_CHIPS = [
  'Có cuộc gọi đến',
  'Lỡ chạm thanh thông báo',
  'Mất kết nối mạng 4G/Wi-Fi',
];

export const PauseWarningModal: React.FC<PauseWarningModalProps> = ({
  isOpen,
  isLocked,
  reason,
  leaveCount,
  maxLeaveCount,
  totalAwaySeconds,
  lockedWaitSeconds,
  onResumeWarning,
  onSendUnlockNote,
  onVerifyRescuePin,
}) => {
  const [noteInput, setNoteInput] = useState('');
  const [noteSent, setNoteSent] = useState(false);
  const [showPinForm, setShowPinForm] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');
  const [liveWait, setLiveWait] = useState(lockedWaitSeconds);

  useEffect(() => {
    setLiveWait(lockedWaitSeconds);
  }, [lockedWaitSeconds]);

  useEffect(() => {
    if (!isOpen || !isLocked) return;
    const id = window.setInterval(() => {
      setLiveWait((s) => s + 1);
    }, 1000);
    return () => window.clearInterval(id);
  }, [isLocked, isOpen]);

  if (!isOpen) return null;

  const handleChipClick = (chip: string) => {
    setNoteInput(chip);
    onSendUnlockNote(chip);
    setNoteSent(true);
  };

  const handleNoteSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteInput.trim()) return;
    onSendUnlockNote(noteInput.trim());
    setNoteSent(true);
  };

  const handlePinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const ok = onVerifyRescuePin(pinInput);
    if (!ok) {
      setPinError('Mã PIN cứu hộ 4 số không đúng. Vui lòng nhờ Giảng viên kiểm tra.');
      return;
    }
    setPinError('');
    setPinInput('');
    setShowPinForm(false);
  };

  return (
    <div className="fixed inset-0 z-[85] bg-ink-900/95 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 p-5 sm:p-6 text-ink-900">
        {!isLocked ? (
          <>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-amber-700">
                  Cảnh báo Rời màn hình
                </span>
                <h3 className="text-lg font-bold text-ink-900">
                  Bài thi tạm dừng bảo vệ đề
                </h3>
              </div>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 text-sm text-amber-900 mb-4">
              <p className="font-semibold mb-1">{reason || 'Phát hiện bạn vừa rời khỏi màn hình làm bài.'}</p>
              <p className="text-xs text-amber-800">
                Số lần vi phạm: <strong>{leaveCount}/{maxLeaveCount}</strong> • Tổng thời gian vắng mặt: <strong>{totalAwaySeconds}s</strong>. Nếu chạm ngưỡng {maxLeaveCount} lần, bài thi sẽ khóa chờ Giảng viên phê duyệt.
              </p>
            </div>

            <button
              type="button"
              onClick={onResumeWarning}
              className="w-full py-3.5 px-4 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-semibold text-sm transition flex items-center justify-center gap-2 shadow-sm"
            >
              <CheckCircle2 className="w-4 h-4" />
              Tôi đã quay lại — Tiếp tục làm bài
            </button>
          </>
        ) : (
          <>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center shrink-0">
                <Lock className="w-6 h-6" />
              </div>
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-brand-600">
                  Trạng thái chờ duyệt trực tuyến
                </span>
                <h3 className="text-lg font-bold text-ink-900 leading-tight">
                  Bài thi đã tạm dừng an toàn
                </h3>
              </div>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 mb-4 space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-support-600">
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Đang chờ Giảng viên phê duyệt (Tự cập nhật mỗi 3s — KHÔNG tải lại trang)</span>
              </div>
              <p className="text-xs text-ink-600 leading-relaxed">
                Hệ thống đã lưu toàn bộ câu trả lời của bạn. Thời gian chờ duyệt hiện tại:{' '}
                <strong className="font-mono text-ink-900">{liveWait}s</strong> (Giảng viên có thể bấm <em>Accept + Bù giờ</em> để bạn thi tiếp hoặc dùng PIN cứu hộ).
              </p>
            </div>

            <div className="mb-4">
              <p className="text-xs font-semibold text-ink-700 mb-2">
                Chọn nhanh lý do gửi lên bàn Giảng viên (1 chạm):
              </p>
              <div className="flex flex-wrap gap-2 mb-2.5">
                {QUICK_REASON_CHIPS.map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => handleChipClick(chip)}
                    className={`text-xs px-3 py-1.5 rounded-full border font-medium transition ${
                      noteInput === chip
                        ? 'bg-brand-600 text-white border-brand-600'
                        : 'bg-white text-ink-700 border-slate-300 hover:border-brand-400'
                    }`}
                  >
                    {chip}
                  </button>
                ))}
              </div>

              <form onSubmit={handleNoteSubmit} className="flex gap-2">
                <input
                  type="text"
                  value={noteInput}
                  onChange={(e) => {
                    setNoteInput(e.target.value);
                    setNoteSent(false);
                  }}
                  placeholder="Hoặc nhập giải trình ngắn khác..."
                  maxLength={120}
                  className="flex-1 text-xs px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
                <button
                  type="submit"
                  className="px-3 py-2 rounded-lg bg-ink-900 text-white text-xs font-semibold hover:bg-ink-800"
                >
                  Gửi
                </button>
              </form>
              {noteSent && (
                <p className="text-[11px] text-support-600 font-medium mt-1.5">
                  ✓ Đã gửi lý do lên Live Proctoring Dashboard của Giảng viên.
                </p>
              )}
            </div>

            <div className="border-t border-slate-200 pt-3">
              {!showPinForm ? (
                <button
                  type="button"
                  onClick={() => setShowPinForm(true)}
                  className="w-full py-2.5 px-3 rounded-xl border border-slate-300 text-ink-700 text-xs font-semibold hover:bg-slate-50 flex items-center justify-center gap-1.5"
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  Giảng viên đứng cạnh? Nhập PIN cứu hộ 4 số để mở khóa ngay
                </button>
              ) : (
                <form onSubmit={handlePinSubmit} className="space-y-2">
                  <div className="flex gap-2">
                    <input
                      type="password"
                      inputMode="numeric"
                      maxLength={4}
                      value={pinInput}
                      onChange={(e) => setPinInput(e.target.value)}
                      placeholder="PIN 4 số (VD: 8888)"
                      className="flex-1 text-sm font-mono tracking-widest px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                    <button
                      type="submit"
                      className="px-4 py-2 rounded-lg bg-support-600 text-white text-xs font-semibold hover:bg-support-700"
                    >
                      Mở khóa
                    </button>
                  </div>
                  {pinError && <p className="text-xs text-rose-600 font-medium">{pinError}</p>}
                </form>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
