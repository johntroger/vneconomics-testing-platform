import React, { useState } from 'react';
import { CheckCircle2, Sparkles, X } from 'lucide-react';
import type { ExamAttempt, Question } from '../../types/exam';

interface EssayGradingModalProps {
  isOpen: boolean;
  examId: string;
  attempt: ExamAttempt | null;
  questions: Question[];
  onClose: () => void;
  onOverrideScore: (
    attemptId: string,
    questionId: string,
    newScore: number,
    note?: string,
  ) => void;
  onEnrichRubricAndRegrade: (
    examId: string,
    questionId: string,
    slotId: string,
    newPhrase: string,
  ) => { updatedCount: number };
}

const HighlightedAnswerText: React.FC<{
  text: string;
  matched: string[];
  blocked: string[];
}> = ({ text, matched, blocked }) => {
  if (!text) {
    return <span className="italic text-ink-400">Sinh viên chưa nhập câu trả lời.</span>;
  }

  const patterns = [
    ...blocked.map((p) => ({ phrase: p, kind: 'BLOCKED' as const })),
    ...matched.map((p) => ({ phrase: p, kind: 'MATCHED' as const })),
  ].filter((x) => x.phrase.trim().length > 0);

  if (patterns.length === 0) {
    return <span>{text}</span>;
  }

  const escaped = patterns
    .map((p) => p.phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');
  const regex = new RegExp(`(${escaped})`, 'gi');
  const parts = text.split(regex);

  return (
    <span>
      {parts.map((part, idx) => {
        const lower = part.toLowerCase();
        const isBlocked = blocked.some((b) => lower === b.toLowerCase());
        const isMatched = matched.some((m) => lower === m.toLowerCase());
        if (isBlocked) {
          return (
            <mark
              key={idx}
              className="bg-rose-100 text-rose-800 px-1 rounded font-semibold"
            >
              {part}
            </mark>
          );
        }
        if (isMatched) {
          return (
            <mark
              key={idx}
              className="bg-emerald-100 text-emerald-800 px-1 rounded font-semibold"
            >
              {part}
            </mark>
          );
        }
        return <React.Fragment key={idx}>{part}</React.Fragment>;
      })}
    </span>
  );
};

export const EssayGradingModal: React.FC<EssayGradingModalProps> = ({
  isOpen,
  examId,
  attempt,
  questions,
  onClose,
  onOverrideScore,
  onEnrichRubricAndRegrade,
}) => {
  const [scoreInputs, setScoreInputs] = useState<Record<string, string>>({});
  const [newPhraseMap, setNewPhraseMap] = useState<Record<string, string>>({});
  const [slotSelectMap, setSlotSelectMap] = useState<Record<string, string>>({});
  const [statusBanner, setStatusBanner] = useState('');

  if (!isOpen || !attempt) return null;

  const qMap = new Map(questions.map((q) => [q.id, q]));
  const essaySnaps = attempt.assignedQuestions.filter(
    (s) => qMap.get(s.questionId)?.type === 'ESSAY',
  );

  return (
    <div className="fixed inset-0 z-[90] bg-ink-900/60 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-200 max-h-[90vh] flex flex-col overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div>
            <h2 className="text-base font-extrabold text-ink-900">
              Rà soát Tự luận Rubric — {attempt.studentName} ({attempt.studentCode})
            </h2>
            <p className="text-xs text-ink-500">
              Bôi xanh từ khóa khớp Rubric • Bôi đỏ từ phủ định / đối lập hoặc bẫy AI
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-200 text-ink-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-4 text-xs">
          {statusBanner && (
            <div className="p-3 rounded-xl bg-support-50 border border-support-200 text-support-800 font-semibold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              {statusBanner}
            </div>
          )}

          {essaySnaps.length === 0 ? (
            <p className="text-center text-ink-500 py-8">
              Đề thi của sinh viên này không có câu hỏi Tự luận ngắn (ESSAY).
            </p>
          ) : (
            essaySnaps.map((snap, idx) => {
              const q = qMap.get(snap.questionId);
              if (!q) return null;
              const ans = attempt.answers[q.id];
              const rawText =
                typeof ans?.answerPayload === 'string' ? ans.answerPayload : '';
              const draftScore =
                scoreInputs[q.id] ?? String(ans?.earnedPoints ?? 0);
              const selectedSlot =
                slotSelectMap[q.id] ?? q.gradingRubric?.[0]?.id ?? '';

              return (
                <div
                  key={q.id}
                  className="border border-slate-200 rounded-xl p-4 space-y-3 bg-white shadow-soft"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-[11px] font-bold text-brand-700">
                        Câu tự luận #{idx + 1} • {snap.chapterCategory}
                      </span>
                      <p className="text-sm font-bold text-ink-900 mt-0.5">
                        {snap.renderedContent}
                      </p>
                    </div>
                    <span className="font-mono font-extrabold text-sm text-support-700 shrink-0">
                      {ans?.earnedPoints ?? 0}/{snap.maxPoints}đ
                    </span>
                  </div>

                  {/* Highlighted Student Answer */}
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm leading-relaxed text-ink-900">
                    <HighlightedAnswerText
                      text={rawText}
                      matched={ans?.matchedHighlights ?? []}
                      blocked={ans?.blockedHighlights ?? []}
                    />
                  </div>

                  {ans?.gradingFeedback && (
                    <p className="text-[11px] font-semibold text-ink-700 bg-brand-50/60 px-3 py-2 rounded-lg">
                      {ans.gradingFeedback}
                    </p>
                  )}

                  {ans?.keystrokeTelemetry && (
                    <div className="text-[11px] font-mono text-ink-500">
                      Keystroke Telemetry: {ans.keystrokeTelemetry.typedChars} ký tự trong{' '}
                      {(ans.keystrokeTelemetry.durationMs / 1000).toFixed(1)}s • Bước nhảy đột ngột:{' '}
                      {ans.keystrokeTelemetry.suddenJumps}
                    </div>
                  )}

                  {/* Quick Override Score */}
                  <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-100">
                    <span className="font-bold text-ink-700">Ghi đè điểm 1 chạm:</span>
                    <input
                      type="number"
                      step="0.25"
                      min={0}
                      max={snap.maxPoints}
                      value={draftScore}
                      onChange={(e) =>
                        setScoreInputs((prev) => ({
                          ...prev,
                          [q.id]: e.target.value,
                        }))
                      }
                      className="w-20 px-2.5 py-1.5 border rounded-lg font-mono font-bold"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        onOverrideScore(attempt.id, q.id, Number(draftScore));
                        setStatusBanner(`Đã cập nhật điểm thủ công cho câu ${idx + 1}.`);
                      }}
                      className="px-3 py-1.5 rounded-lg bg-ink-900 text-white font-bold"
                    >
                      Lưu điểm Override
                    </button>
                  </div>

                  {/* Enrich Rubric & Regrade All Attempts */}
                  {(q.gradingRubric?.length ?? 0) > 0 && (
                    <div className="bg-brand-50/70 border border-brand-200 rounded-lg p-2.5 space-y-2">
                      <span className="font-bold text-brand-900 flex items-center gap-1">
                        <Sparkles className="w-3.5 h-3.5" />
                        Bổ sung cách diễn đạt đúng mới vào Rubric &amp; Chấm lại cả lớp (&lt; 0.5s):
                      </span>
                      <div className="flex flex-wrap gap-2">
                        <select
                          value={selectedSlot}
                          onChange={(e) =>
                            setSlotSelectMap((prev) => ({
                              ...prev,
                              [q.id]: e.target.value,
                            }))
                          }
                          className="px-2 py-1.5 rounded border bg-white text-[11px] font-semibold"
                        >
                          {q.gradingRubric?.map((sl) => (
                            <option key={sl.id} value={sl.id}>
                              {sl.label}
                            </option>
                          ))}
                        </select>
                        <input
                          value={newPhraseMap[q.id] ?? ''}
                          onChange={(e) =>
                            setNewPhraseMap((prev) => ({
                              ...prev,
                              [q.id]: e.target.value,
                            }))
                          }
                          placeholder="Cụm từ mới hợp lý..."
                          className="flex-1 min-w-[140px] px-2.5 py-1.5 rounded border bg-white"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const res = onEnrichRubricAndRegrade(
                              examId,
                              q.id,
                              selectedSlot,
                              newPhraseMap[q.id] ?? '',
                            );
                            setNewPhraseMap((prev) => ({ ...prev, [q.id]: '' }));
                            setStatusBanner(
                              `✓ Đã thêm cụm từ vào Rubric & chấm lại tự động ${res.updatedCount} bài nộp trong ca!`,
                            );
                          }}
                          className="px-3 py-1.5 rounded bg-brand-600 text-white font-bold"
                        >
                          + Thêm & Chấm lại
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
