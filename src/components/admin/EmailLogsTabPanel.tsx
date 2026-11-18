import React, { useMemo, useState } from 'react';
import { Mail, Search } from 'lucide-react';
import { InfoHint } from '../common/InfoHint';
import { PaginationBar, paginateSlice } from '../common/PaginationBar';
import type { EmailLogEntry } from '../../types/exam';

interface EmailLogsTabPanelProps {
  emailLogs: EmailLogEntry[];
  onOpenTestMailer: () => void;
}

export const EmailLogsTabPanel: React.FC<EmailLogsTabPanelProps> = ({
  emailLogs,
  onOpenTestMailer,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [kindFilter, setKindFilter] = useState<'ALL' | EmailLogEntry['kind']>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | EmailLogEntry['status']>('ALL');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);

  const filteredLogs = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return emailLogs.filter((log) => {
      if (kindFilter !== 'ALL' && log.kind !== kindFilter) return false;
      if (statusFilter !== 'ALL' && log.status !== statusFilter) return false;
      if (!q) return true;
      return (
        log.recipient.toLowerCase().includes(q) ||
        log.subject.toLowerCase().includes(q) ||
        log.summary.toLowerCase().includes(q)
      );
    });
  }, [emailLogs, kindFilter, searchTerm, statusFilter]);

  const { pageItems: pagedLogs, safePage } = paginateSlice(
    filteredLogs,
    page,
    pageSize,
  );

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

      {/* Search & Filter Bar */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-3.5 h-3.5 text-ink-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setPage(1);
            }}
            placeholder="Tìm theo email người nhận, tiêu đề hoặc MSSV..."
            className="w-full h-9 pl-8 pr-3 rounded-xl border border-slate-200 bg-slate-50/70 focus:bg-white focus:outline-none focus:border-brand-500"
          />
        </div>
        <select
          value={kindFilter}
          onChange={(e) => {
            setKindFilter(e.target.value as typeof kindFilter);
            setPage(1);
          }}
          aria-label="Lọc loại email"
          className="h-9 px-2.5 rounded-xl border border-slate-200 bg-white font-semibold text-ink-800"
        >
          <option value="ALL">Tất cả loại thư</option>
          <option value="STUDENT_SCORE">Bảng điểm SV</option>
          <option value="STUDENT_RECEIPT">Biên nhận SV</option>
          <option value="INSTRUCTOR_REPORT">Báo cáo Giảng viên</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value as typeof statusFilter);
            setPage(1);
          }}
          aria-label="Lọc trạng thái email"
          className="h-9 px-2.5 rounded-xl border border-slate-200 bg-white font-semibold text-ink-800"
        >
          <option value="ALL">Mọi trạng thái</option>
          <option value="SENT">SENT (Đã gửi)</option>
          <option value="FAILED">FAILED (Lỗi gửi)</option>
          <option value="DEMO_SKIPPED">DEMO (Không gửi)</option>
        </select>
      </div>

      {filteredLogs.length === 0 ? (
        <div className="p-6 text-center rounded-xl border border-dashed border-slate-200 text-xs text-ink-500">
          Không có bản ghi Email nào khớp bộ lọc hiện tại.
        </div>
      ) : (
        <>
          <div className="divide-y divide-slate-100">
            {pagedLogs.map((log) => (
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
          <PaginationBar
            currentPage={safePage}
            totalItems={filteredLogs.length}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
            pageSizeOptions={[15, 30, 50]}
            itemLabel="email"
          />
        </>
      )}
    </div>
  );
};
