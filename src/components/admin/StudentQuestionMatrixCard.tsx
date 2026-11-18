import React, { useMemo, useState } from 'react';
import { CheckCircle2, ChevronDown, ChevronUp, Search, UserCheck, XCircle } from 'lucide-react';
import { InfoHint } from '../common/InfoHint';
import { PaginationBar, paginateSlice } from '../common/PaginationBar';
import type { Exam, ExamAttempt, Question } from '../../types/exam';

interface StudentQuestionMatrixCardProps {
  exam: Exam;
  attempts: ExamAttempt[];
  questions: Question[];
}

export const StudentQuestionMatrixCard: React.FC<StudentQuestionMatrixCardProps> = ({
  exam,
  attempts,
  questions,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [scoreBandFilter, setScoreBandFilter] = useState<'ALL' | 'GE_8' | 'FROM_5_TO_8' | 'LT_5'>('ALL');
  const [sortBy, setSortBy] = useState<'CODE' | 'SCORE_DESC' | 'SCORE_ASC'>('CODE');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [selectedAttemptId, setSelectedAttemptId] = useState<string | null>(null);

  const examAttempts = useMemo(
    () =>
      attempts
        .filter((a) => a.examId === exam.id)
        .filter((a) => a.status === 'SUBMITTED' || a.status === 'AUTO_SUBMITTED' || a.assignedQuestions.length > 0)
        .sort((a, b) => a.studentCode.localeCompare(b.studentCode, 'vi')),
    [attempts, exam.id],
  );

  const questionMap = useMemo(
    () => new Map(questions.map((q) => [q.id, q])),
    [questions],
  );

  // Ordered unique questions appearing in this exam shift
  const shiftQuestions = useMemo(() => {
    const seen = new Map<string, { id: string; content: string; chapter: string }>();
    for (const att of examAttempts) {
      for (const snap of att.assignedQuestions) {
        if (!seen.has(snap.questionId)) {
          const qObj = questionMap.get(snap.questionId);
          seen.set(snap.questionId, {
            id: snap.questionId,
            content: qObj?.content || snap.renderedContent,
            chapter: snap.chapterCategory,
          });
        }
      }
    }
    return Array.from(seen.values());
  }, [examAttempts, questionMap]);

  const filteredAttempts = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    const list = examAttempts.filter((a) => {
      if (scoreBandFilter === 'GE_8' && a.scale10Score < 8) return false;
      if (scoreBandFilter === 'FROM_5_TO_8' && (a.scale10Score < 5 || a.scale10Score >= 8)) return false;
      if (scoreBandFilter === 'LT_5' && a.scale10Score >= 5) return false;
      if (!q) return true;
      return (
        a.studentCode.toLowerCase().includes(q) ||
        a.studentName.toLowerCase().includes(q) ||
        a.className.toLowerCase().includes(q)
      );
    });
    if (sortBy === 'SCORE_DESC') {
      return [...list].sort((a, b) => b.scale10Score - a.scale10Score);
    }
    if (sortBy === 'SCORE_ASC') {
      return [...list].sort((a, b) => a.scale10Score - b.scale10Score);
    }
    return list;
  }, [examAttempts, scoreBandFilter, searchTerm, sortBy]);

  const { pageItems: pagedAttempts, safePage } = paginateSlice(
    filteredAttempts,
    page,
    pageSize,
  );

  const selectedAttempt = useMemo(
    () => examAttempts.find((a) => a.id === selectedAttemptId) ?? null,
    [examAttempts, selectedAttemptId],
  );

  const shiftSummary = useMemo(() => {
    const submitted = examAttempts.filter(
      (a) => a.status === 'SUBMITTED' || a.status === 'AUTO_SUBMITTED',
    );
    if (submitted.length === 0) {
      return { totalSubmitted: 0, avgCorrect: 0, avgScale10: 0 };
    }
    let totalCorrect = 0;
    let totalScale10 = 0;
    for (const a of submitted) {
      totalScale10 += a.scale10Score;
      for (const snap of a.assignedQuestions) {
        const ans = a.answers[snap.questionId];
        if (ans && ans.maxPoints > 0 && ans.earnedPoints >= ans.maxPoints - 1e-6) {
          totalCorrect += 1;
        }
      }
    }
    return {
      totalSubmitted: submitted.length,
      avgCorrect: Math.round((totalCorrect / submitted.length) * 10) / 10,
      avgScale10: Math.round((totalScale10 / submitted.length) * 100) / 100,
    };
  }, [examAttempts]);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-card p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-extrabold text-ink-900 flex items-center gap-1.5 flex-wrap">
            <span>Thống kê Kết quả Từng câu hỏi của Từng Thí sinh ({exam.title})</span>
            <InfoHint
              title="Ma trận Đúng / Sai theo từng thí sinh"
              text={
                '• Bảng này cho biết mỗi thí sinh trong ca thi đã làm đúng (✓), đúng một phần (◐) hay sai (✗) ở từng câu hỏi cụ thể.\n• Bấm vào dòng của một thí sinh bất kỳ để xem chi tiết nội dung từng câu bạn đó làm đúng/sai và nhận xét chấm điểm.'
              }
            />
          </h3>
          <p className="text-xs text-ink-500 mt-0.5">
            Đã nộp: <strong className="text-ink-800">{shiftSummary.totalSubmitted}</strong> thí sinh •
            Điểm TB hệ 10: <strong className="font-mono text-brand-700">{shiftSummary.avgScale10}</strong> •
            Số câu đúng TB: <strong className="font-mono text-support-700">{shiftSummary.avgCorrect}</strong> câu/bạn
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-52">
            <Search className="w-3.5 h-3.5 text-ink-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setPage(1);
              }}
              placeholder="Tìm MSSV hoặc họ tên..."
              className="w-full h-9 pl-8 pr-3 rounded-xl border border-slate-200 text-xs focus:outline-none focus:border-brand-500"
            />
          </div>
          <select
            value={scoreBandFilter}
            onChange={(e) => {
              setScoreBandFilter(e.target.value as typeof scoreBandFilter);
              setPage(1);
            }}
            aria-label="Lọc mức điểm"
            className="h-9 px-2.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-ink-800"
          >
            <option value="ALL">Mọi mức điểm</option>
            <option value="GE_8">Giỏi (≥ 8.0đ)</option>
            <option value="FROM_5_TO_8">Trung bình – Khá (5.0 – &lt; 8.0)</option>
            <option value="LT_5">Dưới chuẩn (&lt; 5.0đ)</option>
          </select>
          <select
            value={sortBy}
            onChange={(e) => {
              setSortBy(e.target.value as typeof sortBy);
              setPage(1);
            }}
            aria-label="Sắp xếp thí sinh"
            className="h-9 px-2.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-ink-800"
          >
            <option value="CODE">MSSV A → Z</option>
            <option value="SCORE_DESC">Điểm cao → thấp</option>
            <option value="SCORE_ASC">Điểm thấp → cao</option>
          </select>
        </div>
      </div>

      {filteredAttempts.length === 0 ? (
        <p className="text-xs text-ink-500 py-3">
          Chưa có dữ liệu bài làm của thí sinh trong ca thi này.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-4 text-[11px] text-ink-600">
            <span className="inline-flex items-center gap-1">
              <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-support-100 text-support-700 font-bold">✓</span>
              Đúng hoàn toàn
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-amber-100 text-amber-800 font-bold">◐</span>
              Đúng một phần
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-rose-100 text-rose-700 font-bold">✗</span>
              Sai / Chưa làm
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-slate-100 text-slate-400 font-bold">—</span>
              Không bốc câu này
            </span>
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-ink-700 font-bold">
                  <th className="py-2.5 px-3 whitespace-nowrap sticky left-0 bg-slate-50 z-10">MSSV</th>
                  <th className="py-2.5 px-3 whitespace-nowrap">Họ tên</th>
                  <th className="py-2.5 px-2.5 text-center whitespace-nowrap">Hệ 10</th>
                  <th className="py-2.5 px-2.5 text-center whitespace-nowrap">Đúng / Tổng</th>
                  {shiftQuestions.map((sq, qi) => (
                    <th
                      key={sq.id}
                      title={`${sq.chapter}: ${sq.content}`}
                      className="py-2.5 px-2 text-center font-mono whitespace-nowrap cursor-help"
                    >
                      C{qi + 1}
                    </th>
                  ))}
                  <th className="py-2.5 px-2 text-right whitespace-nowrap">Chi tiết</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pagedAttempts.map((att) => {
                  const isSelected = att.id === selectedAttemptId;
                  let rightCount = 0;
                  for (const snap of att.assignedQuestions) {
                    const ans = att.answers[snap.questionId];
                    if (ans && ans.maxPoints > 0 && ans.earnedPoints >= ans.maxPoints - 1e-6) {
                      rightCount += 1;
                    }
                  }
                  const snapSet = new Set(att.assignedQuestions.map((s) => s.questionId));
                  return (
                    <tr
                      key={att.id}
                      onClick={() => setSelectedAttemptId(isSelected ? null : att.id)}
                      className={`cursor-pointer transition ${
                        isSelected ? 'bg-brand-50/70' : 'hover:bg-slate-50/80'
                      }`}
                    >
                      <td className="py-2 px-3 font-mono font-bold text-ink-900 whitespace-nowrap sticky left-0 bg-white">
                        {att.studentCode}
                      </td>
                      <td className="py-2 px-3 font-semibold text-ink-800 whitespace-nowrap">
                        {att.studentName}
                      </td>
                      <td className="py-2 px-2.5 text-center font-mono font-extrabold text-brand-700">
                        {att.scale10Score.toFixed(2)}
                      </td>
                      <td className="py-2 px-2.5 text-center font-mono text-ink-700 whitespace-nowrap">
                        <span className="font-bold text-support-700">{rightCount}</span>/{att.assignedQuestions.length}
                      </td>
                      {shiftQuestions.map((sq) => {
                        if (!snapSet.has(sq.id)) {
                          return (
                            <td key={sq.id} className="py-2 px-1.5 text-center">
                              <span className="inline-flex items-center justify-center w-6 h-6 rounded bg-slate-100 text-slate-400 text-[11px]">
                                —
                              </span>
                            </td>
                          );
                        }
                        const ans = att.answers[sq.id];
                        const earned = ans?.earnedPoints ?? 0;
                        const maxP = ans?.maxPoints ?? 1;
                        const fullRight = maxP > 0 && earned >= maxP - 1e-6;
                        const partial = !fullRight && earned > 0;
                        return (
                          <td
                            key={sq.id}
                            title={`${earned}/${maxP}đ${ans?.gradingFeedback ? ` — ${ans.gradingFeedback}` : ''}`}
                            className="py-2 px-1.5 text-center"
                          >
                            {fullRight ? (
                              <span className="inline-flex items-center justify-center w-6 h-6 rounded bg-support-100 text-support-700 font-bold text-[11px]">
                                ✓
                              </span>
                            ) : partial ? (
                              <span className="inline-flex items-center justify-center w-6 h-6 rounded bg-amber-100 text-amber-800 font-bold text-[11px]">
                                ◐
                              </span>
                            ) : (
                              <span className="inline-flex items-center justify-center w-6 h-6 rounded bg-rose-100 text-rose-700 font-bold text-[11px]">
                                ✗
                              </span>
                            )}
                          </td>
                        );
                      })}
                      <td className="py-2 px-2 text-right">
                        <span className="inline-flex items-center gap-0.5 text-[11px] font-bold text-brand-700">
                          {isSelected ? (
                            <>
                              Thu gọn <ChevronUp className="w-3.5 h-3.5" />
                            </>
                          ) : (
                            <>
                              Xem <ChevronDown className="w-3.5 h-3.5" />
                            </>
                          )}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <PaginationBar
            currentPage={safePage}
            totalItems={filteredAttempts.length}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
            pageSizeOptions={[15, 30, 50]}
            itemLabel="thí sinh"
          />

          {/* Selected Student Per-Question Breakdown */}
          {selectedAttempt && (
            <div className="rounded-xl border border-brand-200 bg-brand-50/40 p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs font-extrabold text-brand-900">
                  <UserCheck className="w-4 h-4 text-brand-600" />
                  <span>
                    Chi tiết bài làm: {selectedAttempt.studentName} ({selectedAttempt.studentCode}) —{' '}
                    {selectedAttempt.scale10Score.toFixed(2)}/10đ
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedAttemptId(null)}
                  className="text-[11px] font-bold text-ink-600 hover:text-ink-900"
                >
                  Đóng chi tiết
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                {selectedAttempt.assignedQuestions.map((snap, idx) => {
                  const ans = selectedAttempt.answers[snap.questionId];
                  const earned = ans?.earnedPoints ?? 0;
                  const maxP = ans?.maxPoints ?? snap.maxPoints;
                  const fullRight = maxP > 0 && earned >= maxP - 1e-6;
                  const partial = !fullRight && earned > 0;
                  return (
                    <div
                      key={snap.questionId}
                      className="rounded-xl border border-slate-200 bg-white p-3 text-xs space-y-1.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-ink-900">
                          Câu {idx + 1} • {snap.chapterCategory}
                        </span>
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            fullRight
                              ? 'bg-support-100 text-support-800'
                              : partial
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {fullRight ? (
                            <CheckCircle2 className="w-3 h-3" />
                          ) : (
                            <XCircle className="w-3 h-3" />
                          )}
                          {fullRight ? 'Đúng' : partial ? 'Một phần' : 'Sai'} ({earned}/{maxP}đ)
                        </span>
                      </div>
                      <p className="text-ink-700 line-clamp-2">{snap.renderedContent}</p>
                      {ans?.gradingFeedback && (
                        <p className="text-[11px] text-ink-500">{ans.gradingFeedback}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
