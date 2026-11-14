import React, { useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  Layers,
  Lock,
  Mail,
  ShieldAlert,
  Smartphone,
} from 'lucide-react';
import { useExamPlatform } from '../context/ExamContext';

export const ExamLobbyPage: React.FC = () => {
  const { examId } = useParams<{ examId: string }>();
  const [searchParams] = useSearchParams();
  const attemptId = searchParams.get('attempt') ?? '';
  const navigate = useNavigate();

  const { exams, courses, attempts } = useExamPlatform();
  const [agreed, setAgreed] = useState(false);

  const exam = exams.find((e) => e.id === examId);
  const course = courses.find((c) => c.id === exam?.courseId);
  const attempt = attempts.find((a) => a.id === attemptId);

  if (!exam || !attempt) {
    return (
      <div className="min-h-screen bg-surface-100 flex flex-col items-center justify-center p-6 text-center">
        <p className="text-sm font-semibold text-ink-700 mb-3">
          Không tìm thấy phiên phòng chờ hợp lệ.
        </p>
        <button
          type="button"
          onClick={() => navigate('/')}
          className="px-4 py-2.5 rounded-xl bg-brand-600 text-white text-xs font-bold"
        >
          Quay lại cổng vào thi
        </button>
      </div>
    );
  }

  if (attempt.status === 'SUBMITTED' || attempt.status === 'AUTO_SUBMITTED') {
    return (
      <div className="min-h-screen bg-surface-100 flex flex-col items-center justify-center p-6 text-center">
        <div className="max-w-sm w-full bg-white rounded-2xl border border-slate-200 shadow-card p-6 space-y-3">
          <CheckCircle2 className="w-10 h-10 text-support-600 mx-auto" />
          <h2 className="text-base font-extrabold text-ink-900">
            Bài thi của bạn đã được nộp
          </h2>
          <p className="text-xs text-ink-600 leading-relaxed">
            Thí sinh <strong>{attempt.studentName}</strong> ({attempt.studentCode}) đã hoàn thành ca thi này. Bấm nút bên dưới để xem biên nhận & kết quả.
          </p>
          <div className="flex flex-col gap-2 pt-1">
            <button
              type="button"
              onClick={() => navigate(`/exam/${exam.id}/result?attempt=${attempt.id}`)}
              className="w-full py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold"
            >
              Xem Biên nhận & Điểm số
            </button>
            <button
              type="button"
              onClick={() => navigate('/')}
              className="w-full py-2 rounded-xl border border-slate-200 text-ink-700 text-xs font-semibold hover:bg-slate-50"
            >
              Quay lại cổng vào thi
            </button>
          </div>
        </div>
      </div>
    );
  }

  const handleStartExam = async () => {
    if (!agreed) return;
    try {
      await document.documentElement.requestFullscreen?.();
    } catch {
      // iOS Safari may block fullscreen programmatically; AntiCheatGuard handles gracefully
    }
    navigate(`/exam/${exam.id}/take?attempt=${attempt.id}`);
  };

  return (
    <div className="min-h-screen bg-surface-100 py-5 px-4">
      <div className="max-w-md mx-auto space-y-4">
        <button
          type="button"
          onClick={() => navigate('/')}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-600 hover:text-brand-600"
        >
          <ArrowLeft className="w-4 h-4" /> Đổi phòng thi khác
        </button>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-card p-5 space-y-4">
          <div>
            <span className="text-[11px] font-mono font-bold px-2.5 py-1 rounded-full bg-brand-50 text-brand-700">
              {course?.code} • PIN {exam.roomPin}
            </span>
            <h1 className="text-lg font-extrabold text-ink-900 mt-2 leading-snug">
              {exam.title}
            </h1>
            <p className="text-xs text-ink-600 mt-1">
              Thí sinh: <strong>{attempt.studentName}</strong> ({attempt.studentCode}) • {attempt.className}
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="bg-slate-50 rounded-xl p-2.5 border border-slate-200">
              <Clock className="w-4 h-4 text-brand-600 mx-auto mb-1" />
              <div className="text-sm font-mono font-bold text-ink-900">
                {exam.durationMinutes}p
              </div>
              <div className="text-[10px] text-ink-500">Thời lượng</div>
            </div>
            <div className="bg-slate-50 rounded-xl p-2.5 border border-slate-200">
              <Layers className="w-4 h-4 text-support-600 mx-auto mb-1" />
              <div className="text-sm font-mono font-bold text-ink-900">
                {attempt.assignedQuestions.length} câu
              </div>
              <div className="text-[10px] text-ink-500">Đề trộn riêng</div>
            </div>
            <div className="bg-slate-50 rounded-xl p-2.5 border border-slate-200">
              <ShieldAlert className="w-4 h-4 text-amber-600 mx-auto mb-1" />
              <div className="text-sm font-mono font-bold text-ink-900">
                Tối đa {exam.maxLeaveCount} lần
              </div>
              <div className="text-[10px] text-ink-500">Rời màn hình</div>
            </div>
          </div>

          {/* Stratified Chapter Distribution Summary */}
          {exam.chapterMatrix.length > 0 && (
            <div className="bg-slate-50 rounded-xl border border-slate-200 p-3.5 space-y-2">
              <p className="text-xs font-bold text-ink-800">
                Cấu trúc phân bổ câu hỏi theo Chương:
              </p>
              <div className="space-y-1.5">
                {exam.chapterMatrix.map((rule) => (
                  <div
                    key={rule.chapterCategory}
                    className="flex items-center justify-between text-xs"
                  >
                    <span className="text-ink-700 truncate pr-2">
                      {rule.chapterCategory}
                    </span>
                    <span className="font-mono font-semibold text-brand-700 shrink-0">
                      {rule.questionCount} câu ({rule.pointsPerQuestion ?? 1}đ/câu)
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Anti-AI Rules */}
          <div className="bg-amber-50/80 border border-amber-200 rounded-xl p-3.5 space-y-2 text-xs text-amber-950">
            <p className="font-bold flex items-center gap-1.5 text-amber-900">
              <Lock className="w-3.5 h-3.5" /> Quy chế giám sát 8 lớp trong phòng thi:
            </p>
            <ul className="list-disc pl-4 space-y-1 text-[11px] leading-relaxed">
              <li>
                Rời khỏi màn hình trên <strong>{(exam.gracePeriodMs / 1000).toFixed(1)} giây</strong> sẽ bị ẩn đề tức thì, tạm dừng làm bài và tính 1 lần vi phạm (vẫn đếm giờ tổng).
              </li>
              <li>
                Nếu rời màn hình quá <strong>{exam.maxLeaveCount} lần</strong> hoặc vắng mặt quá <strong>{exam.maxAwaySeconds}s</strong>, bài thi sẽ khóa chờ Giảng viên bấm <strong>Accept / Reject</strong>.
              </li>
              <li>
                Cấm chia đôi màn hình, cấm sao chép/dán (Paste), tích hợp sẵn <strong>Máy tính & Bảng nháp</strong> ngay trong trang thi để bạn không cần thoát app.
              </li>
              {exam.oneWayMode && (
                <li>
                  <strong>Chế độ 1 chiều đang bật:</strong> Mỗi câu có đồng hồ riêng ({exam.perQuestionSeconds}s), không quay lại câu trước.
                </li>
              )}
            </ul>
          </div>

          <div className="flex items-center gap-2 text-[11px] text-ink-600 bg-brand-50/60 border border-brand-200 rounded-xl p-3">
            <Mail className="w-4 h-4 text-brand-600 shrink-0" />
            <span>
              Email nhận kết quả: <strong>{attempt.studentEmail}</strong> (
              {exam.emailDeliveryMode === 'DELAYED_BATCH'
                ? 'Nhận biên nhận ngay, nhận điểm sau khi đóng ca'
                : 'Nhận điểm ngay sau khi nộp bài'}
              ).
            </span>
          </div>

          <label className="flex items-start gap-2.5 cursor-pointer select-none pt-1">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
            />
            <span className="text-xs text-ink-800 font-medium leading-snug">
              Tôi đã tắt thông báo nổi/đa nhiệm và cam kết tự làm bài trung thực theo quy chế phòng thi.
            </span>
          </label>

          <button
            type="button"
            disabled={!agreed}
            onClick={handleStartExam}
            className="w-full h-12 rounded-xl bg-brand-600 hover:bg-brand-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-bold text-sm flex items-center justify-center gap-2 shadow-sm transition"
          >
            <CheckCircle2 className="w-4 h-4" />
            {Object.keys(attempt.answers).length > 0
              ? 'Khôi phục phiên thi & Làm bài tiếp'
              : 'Bắt đầu làm bài ngay'}
          </button>
        </div>

        <p className="text-center text-[11px] text-ink-500 flex items-center justify-center gap-1.5">
          <Smartphone className="w-3.5 h-3.5" /> Khuyên dùng thao tác một tay theo chiều dọc trên điện thoại
        </p>
      </div>
    </div>
  );
};
