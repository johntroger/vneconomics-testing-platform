import React from 'react';
import { Mail } from 'lucide-react';
import { InfoHint } from '../common/InfoHint';
import type { EmailLogEntry } from '../../types/exam';

interface EmailLogsTabPanelProps {
  emailLogs: EmailLogEntry[];
  onOpenTestMailer: () => void;
}

export const EmailLogsTabPanel: React.FC<EmailLogsTabPanelProps> = ({
  emailLogs,
  onOpenTestMailer,
}) => {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-card p-5 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-extrabold text-ink-900 flex items-center gap-1.5 flex-wrap">
          <span>Nhật ký Email Tự động (api/mailer.php Dual-Transport Queue)</span>
          <InfoHint
            title="Sổ theo dõi các Email hệ thống đã gửi"
            text={
              '• Ghi lại lịch sử toàn bộ Email trả điểm gửi cho sinh viên và Email Bảng điểm tổng hợp gửi cho giảng viên.\n• Nếu thấy trạng thái báo lỗi hoặc sinh viên bảo chưa nhận được thư (do gõ sai địa chỉ Email), thầy/cô sang Tab 4 "Giám sát Live" bấm nút Phong bì ở dòng của em đó để sửa Email và gửi lại.'
            }
          />
        </h2>
        <button
          type="button"
          onClick={onOpenTestMailer}
          className="h-9 px-3 rounded-xl border border-brand-200 bg-brand-50 text-brand-800 text-xs font-bold flex items-center gap-1.5 hover:bg-brand-100"
        >
          <Mail className="w-3.5 h-3.5" />
          <span>Test Mailer</span>
          <InfoHint
            title="Kiểm tra gửi Email thật tới hộp thư của thầy/cô"
            text={
              '• Bấm vào để mở cửa sổ nhập địa chỉ Email và nhận thử 1 thư mẫu từ hệ thống.\n• Ở chế độ Demo: để chống spam, mỗi trình duyệt chỉ được gửi thử tối đa 1 lần / ngày.\n• Tài khoản Giảng viên chính thức: gửi kiểm tra không giới hạn trước mỗi ca thi.'
            }
          />
        </button>
      </div>
      <div className="divide-y divide-slate-100">
        {emailLogs.map((log) => (
          <div key={log.id} className="py-3 text-xs flex flex-wrap justify-between gap-2">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded bg-support-50 text-support-700 font-bold text-[10px]">
                  {log.kind}
                </span>
                <span className="font-bold text-ink-900">{log.recipient}</span>
              </div>
              <p className="font-semibold text-ink-800">{log.subject}</p>
              <p className="text-ink-600">{log.summary}</p>
              {log.csvAttachmentName && (
                <span className="inline-block font-mono text-[10px] bg-slate-100 px-2 py-0.5 rounded">
                  Đính kèm: {log.csvAttachmentName}
                </span>
              )}
            </div>
            <div className="text-right font-mono text-[11px] text-ink-500">
              <div
                className={`font-bold ${
                  log.status === 'FAILED'
                    ? 'text-danger-600'
                    : log.status === 'DEMO_SKIPPED'
                      ? 'text-amber-700'
                      : 'text-support-700'
                }`}
              >
                {log.status === 'DEMO_SKIPPED' ? 'DEMO (Không gửi)' : log.status}
              </div>
              <div>{new Date(log.sentAt).toLocaleString('vi-VN')}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
