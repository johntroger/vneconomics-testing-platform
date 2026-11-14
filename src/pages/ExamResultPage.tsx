import React, { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import {
  Award,
  CheckCircle2,
  Clock,
  Home,
  Mail,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { useExamPlatform } from '../context/ExamContext';
import { generateClientReceiptId } from '../services/apiClient';

export const ExamResultPage: React.FC = () => {
  const { examId } = useParams<{ examId: string }>();
  const [searchParams] = useSearchParams();
  const attemptId = searchParams.get('attempt') ?? '';

  const { exams, courses, attempts, correctStudentEmail } = useExamPlatform();
  const exam = exams.find((e) => e.id === examId);
  const course = courses.find((c) => c.id === exam?.courseId);
  const attempt = attempts.find((a) => a.id === attemptId);

  const [editEmailOpen, setEditEmailOpen] = useState(false);
  const [emailDraft, setEmailDraft] = useState(attempt?.studentEmail ?? '');
  const [emailMsg, setEmailMsg] = useState('');

  if (!exam || !attempt) {
    return (
      <div className="min-h-screen bg-surface-100 flex flex-col items-center justify-center p-6 text-center">
        <p className="text-sm text-ink-700 mb-3">Không tìm thấy biên nhận bài thi.</p>
        <Link
          to="/"
          className="px-4 py-2.5 rounded-xl bg-brand-600 text-white text-xs font-bold"
        >
          Về cổng vào thi
        </Link>
      </div>
    );
  }

  const receiptId = generateClientReceiptId(attempt.id);
  const hideScoreUntilClose =
    exam.emailDeliveryMode === 'DELAYED_BATCH' && exam.status !== 'CLOSED';
  const submittedMs = attempt.submittedAt
    ? new Date(attempt.submittedAt).getTime()
    : Date.now();
  const canCorrectEmail =
    attempt.emailEditCount < 1 && Date.now() - submittedMs <= 5 * 60 * 1000;

  const handleCorrectEmail = (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailDraft.trim())) {
      setEmailMsg('Địa chỉ email mới chưa hợp lệ.');
      return;
    }
    const ok = correctStudentEmail(attempt.id, emailDraft);
    if (ok) {
      setEmailMsg('✓ Đã cập nhật Email và gửi lại kết quả!');
      setEditEmailOpen(false);
    } else {
      setEmailMsg('Đã hết thời hạn 5 phút tự sửa hoặc đã sử dụng hết 1 lượt.');
    }
  };

  return (
    <div className="min-h-screen bg-surface-100 py-6 px-4">
      <div className="max-w-lg mx-auto space-y-4">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-card p-5 sm:p-6 space-y-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <span className="text-[11px] font-mono font-bold px-2.5 py-1 rounded-full bg-support-50 text-support-700">
                Biên nhận: {receiptId}
              </span>
              <h1 className="text-xl font-extrabold text-ink-900 mt-2">
                {attempt.status === 'AUTO_SUBMITTED'
                  ? 'Bài thi đã được hệ thống thu tự động'
                  : 'Nộp bài thi thành công'}
              </h1>
              <p className="text-xs text-ink-600 mt-0.5">
                {course?.code} — {exam.title}
              </p>
            </div>
            <CheckCircle2 className="w-9 h-9 text-support-600 shrink-0" />
          </div>

          {hideScoreUntilClose ? (
            <div className="bg-brand-50 border border-brand-200 rounded-xl p-4 space-y-1.5">
              <p className="text-sm font-bold text-brand-900 flex items-center gap-1.5">
                <Clock className="w-4 h-4" /> Chế độ Thi tập trung (Chống lộ điểm sớm)
              </p>
              <p className="text-xs text-brand-800 leading-relaxed">
                Hệ thống đã ghi nhận bài làm của bạn và gửi <strong>Email Biên nhận</strong>. Điểm số chi tiết (bao gồm điểm Rubric tự luận ngắn) sẽ được đồng loạt gửi về <strong>{attempt.studentEmail}</strong> ngay khi Giảng viên bấm Kết thúc ca thi.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-brand-600 text-white rounded-2xl p-4">
                <div className="text-[11px] text-brand-100 font-semibold flex items-center gap-1">
                  <Award className="w-3.5 h-3.5" /> Điểm Quy đổi Hệ 10
                </div>
                <div className="text-3xl font-mono font-extrabold mt-1">
                  {attempt.scale10Score.toFixed(2)}
                </div>
                <div className="text-[11px] text-brand-100 mt-1">
                  Điểm gốc: {attempt.totalScore}/{attempt.maxTotalScore}đ
                </div>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
                <div className="text-[11px] text-ink-600 font-semibold flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-support-600" /> Chỉ số Tin cậy
                </div>
                <div className="text-3xl font-mono font-extrabold text-ink-900 mt-1">
                  {attempt.integrityScore}%
                </div>
                <div className="text-[11px] text-ink-500 mt-1">
                  Rời màn hình: {attempt.leaveCount} lần ({attempt.totalAwaySeconds}s)
                </div>
              </div>
            </div>
          )}

          {/* Email status & 5-min self-correction */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2.5">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-start gap-2 text-xs text-ink-700">
                <Mail className="w-4 h-4 text-brand-600 shrink-0 mt-0.5" />
                <div>
                  <p>
                    Email nhận kết quả: <strong>{attempt.studentEmail}</strong>
                  </p>
                  <p className="text-[11px] text-support-700 font-semibold mt-0.5">
                    Trạng thái:{' '}
                    {attempt.emailSentStatus === 'RECEIPT_SENT'
                      ? 'Đã gửi Email Biên nhận'
                      : attempt.emailSentStatus === 'SENT'
                        ? 'Đã gửi Email Điểm hoàn chỉnh'
                        : 'Đang xếp hàng gửi...'}
                  </p>
                </div>
              </div>
              {canCorrectEmail && !editEmailOpen && (
                <button
                  type="button"
                  onClick={() => {
                    setEmailDraft(attempt.studentEmail);
                    setEditEmailOpen(true);
                  }}
                  className="text-[11px] font-bold text-brand-600 hover:underline shrink-0"
                >
                  Sửa email (5p)
                </button>
              )}
            </div>

            {editEmailOpen && (
              <form onSubmit={handleCorrectEmail} className="flex gap-2 pt-1">
                <input
                  type="email"
                  value={emailDraft}
                  onChange={(e) => setEmailDraft(e.target.value)}
                  className="flex-1 text-xs px-3 py-2 rounded-lg border border-slate-300 bg-white"
                  placeholder="Nhập email chính xác..."
                />
                <button
                  type="submit"
                  className="px-3 py-2 rounded-lg bg-brand-600 text-white text-xs font-bold"
                >
                  Cập nhật & Gửi lại
                </button>
              </form>
            )}
            {emailMsg && (
              <p className="text-[11px] font-semibold text-support-700">{emailMsg}</p>
            )}
          </div>

          {/* Per-question Rubric breakdown (when immediate score visible) */}
          {!hideScoreUntilClose && (
            <div className="space-y-2.5">
              <h2 className="text-xs font-bold uppercase tracking-wider text-ink-500 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-brand-600" />
                Chi tiết kết quả & Chấm Rubric
              </h2>
              <div className="space-y-2">
                {attempt.assignedQuestions.map((snap, idx) => {
                  const ans = attempt.answers[snap.questionId];
                  const earned = ans ? ans.earnedPoints : 0;
                  return (
                    <div
                      key={snap.questionId}
                      className="p-3 rounded-xl border border-slate-200 bg-white text-xs space-y-1"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-ink-900">
                          Câu {idx + 1} • {snap.chapterCategory}
                        </span>
                        <span
                          className={`font-mono font-bold px-2 py-0.5 rounded-md ${
                            earned >= snap.maxPoints
                              ? 'bg-support-50 text-support-700'
                              : earned > 0
                                ? 'bg-amber-50 text-amber-800'
                                : 'bg-rose-50 text-rose-700'
                          }`}
                        >
                          {earned}/{snap.maxPoints}đ
                        </span>
                      </div>
                      {ans?.gradingFeedback && (
                        <p className="text-[11px] text-ink-600">{ans.gradingFeedback}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <Link
            to="/"
            className="w-full h-11 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-ink-800 text-xs font-bold flex items-center justify-center gap-2 transition"
          >
            <Home className="w-4 h-4" />
            Quay về Cổng vào thi
          </Link>
        </div>
      </div>
    </div>
  );
};
