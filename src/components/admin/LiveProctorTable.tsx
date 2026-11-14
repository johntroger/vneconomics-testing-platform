import React, { useEffect, useState } from 'react';
import {
  AlertOctagon,
  CheckCircle2,
  Clock,
  FileText,
  Mail,
  Plus,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  StopCircle,
  XCircle,
} from 'lucide-react';
import type { Exam, ExamAttempt } from '../../types/exam';

interface LiveProctorTableProps {
  exam: Exam;
  attempts: ExamAttempt[];
  onProctorDecision: (
    attemptId: string,
    decision: 'ACCEPT_KEEP' | 'ACCEPT_COMPENSATE' | 'REJECT',
    extraSeconds?: number,
  ) => void;
  onResetDevice: (attemptId: string) => void;
  onAddBonusTime: (attemptId: string, extraSeconds: number) => void;
  onCloseExamAndSweep: (examId: string) => void;
  onOpenEssayReview: (attemptId: string) => void;
  onResendEmail: (attemptId: string, editedEmail?: string) => void;
}

export const LiveProctorTable: React.FC<LiveProctorTableProps> = ({
  exam,
  attempts,
  onProctorDecision,
  onResetDevice,
  onAddBonusTime,
  onCloseExamAndSweep,
  onOpenEssayReview,
  onResendEmail,
}) => {
  const [tickNow, setTickNow] = useState(Date.now());
  const [editingEmailId, setEditingEmailId] = useState<string | null>(null);
  const [emailDraft, setEmailDraft] = useState('');

  useEffect(() => {
    const id = window.setInterval(() => setTickNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const examAttempts = attempts.filter((a) => a.examId === exam.id);
  const lockedQueue = examAttempts.filter((a) => a.status === 'LOCKED');

  const countInProgress = examAttempts.filter((a) => a.status === 'IN_PROGRESS').length;
  const countLocked = lockedQueue.length;
  const countAiFlagged = examAttempts.filter((a) => a.aiFlag).length;
  const countSubmitted = examAttempts.filter(
    (a) => a.status === 'SUBMITTED' || a.status === 'AUTO_SUBMITTED',
  ).length;

  const getWaitSeconds = (a: ExamAttempt) => {
    if (!a.lockedAt) return a.lockedWaitSeconds;
    return (
      a.lockedWaitSeconds +
      Math.max(0, Math.round((tickNow - new Date(a.lockedAt).getTime()) / 1000))
    );
  };

  return (
    <div className="space-y-5">
      {/* Live Status Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border border-slate-200 p-3.5 shadow-soft">
          <div className="text-[11px] font-bold text-support-700 uppercase">Đang làm bài</div>
          <div className="text-2xl font-mono font-extrabold text-ink-900 mt-1">
            {countInProgress}
          </div>
        </div>
        <div className="bg-white rounded-xl border border-rose-200 p-3.5 shadow-soft">
          <div className="text-[11px] font-bold text-rose-700 uppercase">
            Khóa chờ duyệt (LOCKED)
          </div>
          <div className="text-2xl font-mono font-extrabold text-rose-700 mt-1">
            {countLocked}
          </div>
        </div>
        <div className="bg-white rounded-xl border border-amber-200 p-3.5 shadow-soft">
          <div className="text-[11px] font-bold text-amber-700 uppercase">Cờ nghi vấn AI / Máy 2</div>
          <div className="text-2xl font-mono font-extrabold text-amber-700 mt-1">
            {countAiFlagged}
          </div>
        </div>
        <div className="bg-white rounded-xl border border-brand-200 p-3.5 shadow-soft">
          <div className="text-[11px] font-bold text-brand-700 uppercase">Đã nộp / Thu bài</div>
          <div className="text-2xl font-mono font-extrabold text-brand-700 mt-1">
            {countSubmitted}
          </div>
        </div>
      </div>

      {/* Exam Control Bar */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-wrap items-center justify-between gap-3 shadow-soft">
        <div className="flex items-center gap-2 text-xs text-ink-700">
          <RefreshCw className="w-4 h-4 text-support-600 animate-spin" />
          <span>
            Live Sync đang chạy • PIN phòng thi: <strong className="font-mono text-brand-700">{exam.roomPin}</strong> • PIN cứu hộ: <strong className="font-mono">{exam.unlockPin}</strong>
          </span>
        </div>
        <button
          type="button"
          disabled={exam.status === 'CLOSED'}
          onClick={() => onCloseExamAndSweep(exam.id)}
          className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:bg-slate-300 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition"
        >
          <StopCircle className="w-4 h-4" />
          {exam.status === 'CLOSED'
            ? 'Ca thi đã đóng & Gửi Email tổng hợp'
            : 'Kết thúc Ca thi (Sweeper thu bài treo + Gửi Email Tổng hợp)'}
        </button>
      </div>

      {/* Prominent LOCKED Instructor Approval Queue */}
      {lockedQueue.length > 0 && (
        <div className="bg-rose-50 border-2 border-rose-300 rounded-2xl p-4 space-y-3">
          <div className="flex items-center gap-2 text-rose-900 font-bold text-sm">
            <AlertOctagon className="w-5 h-5 text-rose-600 shrink-0" />
            Hàng đợi Phê duyệt Sinh viên Vượt ngưỡng ({lockedQueue.length} thí sinh đang chờ quyết định)
          </div>

          <div className="space-y-3">
            {lockedQueue.map((a) => {
              const liveWait = getWaitSeconds(a);
              return (
                <div
                  key={a.id}
                  className="bg-white rounded-xl border border-rose-200 p-3.5 shadow-sm space-y-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="text-sm font-bold text-ink-900">
                        {a.studentName}{' '}
                        <span className="font-mono text-xs text-brand-700">({a.studentCode})</span>
                      </div>
                      <p className="text-xs text-ink-600">
                        Lớp {a.className} • Rời màn hình: <strong className="text-rose-700">{a.leaveCount} lần</strong> ({a.totalAwaySeconds}s vắng mặt) • Đang chờ: <strong className="font-mono text-rose-700">{liveWait}s</strong>
                      </p>
                      {a.unlockRequestNote && (
                        <p className="text-xs bg-amber-50 text-amber-900 px-2.5 py-1.5 rounded-lg border border-amber-200 mt-2">
                          <strong>Giải trình SV:</strong> "{a.unlockRequestNote}"
                        </p>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => onProctorDecision(a.id, 'ACCEPT_KEEP')}
                        className="px-3 py-2 rounded-lg bg-support-600 hover:bg-support-700 text-white text-xs font-bold flex items-center gap-1"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Accept (Giữ giờ)
                      </button>
                      <button
                        type="button"
                        onClick={() => onProctorDecision(a.id, 'ACCEPT_COMPENSATE', liveWait)}
                        className="px-3 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold flex items-center gap-1"
                      >
                        <Clock className="w-3.5 h-3.5" />
                        Accept + Bù {liveWait}s
                      </button>
                      <button
                        type="button"
                        onClick={() => onProctorDecision(a.id, 'REJECT')}
                        className="px-3 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold flex items-center gap-1"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        Reject (Thu bài)
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Full Candidate Monitoring Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-ink-600 font-bold">
                <th className="py-3 px-3.5">Thí sinh</th>
                <th className="py-3 px-3.5">Trạng thái</th>
                <th className="py-3 px-3.5">Tiến độ</th>
                <th className="py-3 px-3.5">Vi phạm / Tin cậy</th>
                <th className="py-3 px-3.5">Điểm (Hệ 10)</th>
                <th className="py-3 px-3.5">Email</th>
                <th className="py-3 px-3.5 text-right">Điều khiển</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {examAttempts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-ink-500">
                    Chưa có sinh viên nào vào ca thi này. Hãy dùng mã PIN <strong className="font-mono">{exam.roomPin}</strong> ở trang chủ để thử nghiệm.
                  </td>
                </tr>
              ) : (
                examAttempts.map((a) => {
                  const answered = Object.keys(a.answers).length;
                  const statusBadge =
                    a.status === 'IN_PROGRESS'
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : a.status === 'PAUSED'
                        ? 'bg-amber-50 text-amber-800 border-amber-200'
                        : a.status === 'LOCKED'
                          ? 'bg-rose-50 text-rose-700 border-rose-200'
                          : 'bg-brand-50 text-brand-700 border-brand-200';

                  return (
                    <tr key={a.id} className="hover:bg-slate-50/70">
                      <td className="py-3 px-3.5">
                        <div className="font-bold text-ink-900">{a.studentName}</div>
                        <div className="font-mono text-[11px] text-ink-500">
                          {a.studentCode} • {a.className}
                        </div>
                        {a.aiFlag && (
                          <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded bg-rose-100 text-rose-700 text-[10px] font-bold">
                            <ShieldAlert className="w-3 h-3" /> {a.aiFlagReason ?? 'Cờ AI'}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3.5">
                        <span
                          className={`inline-block px-2.5 py-1 rounded-full border text-[11px] font-bold ${statusBadge}`}
                        >
                          {a.status}
                        </span>
                      </td>
                      <td className="py-3 px-3.5 font-mono font-semibold text-ink-800">
                        {answered}/{a.assignedQuestions.length} câu
                      </td>
                      <td className="py-3 px-3.5">
                        <div className="font-semibold text-ink-900">
                          {a.leaveCount} lần ({a.totalAwaySeconds}s)
                        </div>
                        <div className="text-[11px] text-support-700 font-mono font-bold">
                          Tin cậy: {a.integrityScore}%
                        </div>
                      </td>
                      <td className="py-3 px-3.5">
                        <div className="font-mono font-extrabold text-brand-700 text-sm">
                          {a.scale10Score.toFixed(2)}
                        </div>
                        <div className="text-[10px] text-ink-500">
                          Gốc: {a.totalScore}/{a.maxTotalScore} (TL: {a.essayScore}đ)
                        </div>
                      </td>
                      <td className="py-3 px-3.5">
                        {editingEmailId === a.id ? (
                          <div className="flex items-center gap-1">
                            <input
                              type="email"
                              value={emailDraft}
                              onChange={(e) => setEmailDraft(e.target.value)}
                              className="w-36 px-2 py-1 text-[11px] border rounded"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                onResendEmail(a.id, emailDraft);
                                setEditingEmailId(null);
                              }}
                              className="px-2 py-1 bg-brand-600 text-white rounded text-[10px] font-bold"
                            >
                              Gửi
                            </button>
                          </div>
                        ) : (
                          <div>
                            <div className="text-[11px] text-ink-700 truncate max-w-[140px]">
                              {a.studentEmail}
                            </div>
                            <span className="text-[10px] font-semibold text-support-700">
                              {a.emailSentStatus}
                            </span>
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-3.5 text-right">
                        <div className="inline-flex flex-wrap justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => onOpenEssayReview(a.id)}
                            title="Rà soát tự luận Rubric"
                            className="p-1.5 rounded-lg border border-slate-200 hover:border-brand-400 text-ink-700 hover:text-brand-700 bg-white"
                          >
                            <FileText className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onResetDevice(a.id)}
                            title="Reset Thiết bị MSSV"
                            className="p-1.5 rounded-lg border border-slate-200 hover:border-amber-400 text-ink-700 hover:text-amber-700 bg-white"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onAddBonusTime(a.id, 60)}
                            title="Cộng thêm 60 giây"
                            className="p-1.5 rounded-lg border border-slate-200 hover:border-support-400 text-ink-700 hover:text-support-700 bg-white"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingEmailId(a.id);
                              setEmailDraft(a.studentEmail);
                            }}
                            title="Sửa Email & Gửi lại điểm"
                            className="p-1.5 rounded-lg border border-slate-200 hover:border-brand-400 text-ink-700 hover:text-brand-700 bg-white"
                          >
                            <Mail className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
