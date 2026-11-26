import React, { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, CheckCircle2, Lock, Send } from 'lucide-react';
import { POLL_COLORS, type PollQuestion, type PollVotePayload } from '../../types/poll';

interface PollStudentCardProps {
  question: PollQuestion;
  disabled?: boolean;
  isLocked?: boolean;
  submitted?: boolean;
  submitting?: boolean;
  compact?: boolean;
  error?: string;
  onSubmit: (payload: PollVotePayload) => void | Promise<void>;
}

export const PollStudentCard: React.FC<PollStudentCardProps> = ({
  question,
  disabled = false,
  isLocked = false,
  submitted = false,
  submitting = false,
  compact = false,
  error = '',
  onSubmit,
}) => {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [words, setWords] = useState<string[]>(['', '', '']);
  const [openText, setOpenText] = useState('');
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [rankedIds, setRankedIds] = useState<string[]>([]);
  const [localError, setLocalError] = useState('');

  useEffect(() => {
    setSelectedIds([]);
    const wordSlots = Math.max(1, Math.min(5, question.maxWordsPerVoter ?? 3));
    setWords(Array.from({ length: wordSlots }, () => ''));
    setOpenText('');
    setRatings({});
    setRankedIds((question.options ?? []).map((o) => o.id));
    setLocalError('');
  }, [question.id, question.type, question.maxWordsPerVoter, question.options]);

  const toggleOption = (id: string) => {
    if (disabled || isLocked || submitted) return;
    setLocalError('');
    if (question.allowMultipleSelections) {
      setSelectedIds((prev) =>
        prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
      );
    } else {
      setSelectedIds([id]);
    }
  };

  const moveRankItem = (index: number, delta: -1 | 1) => {
    if (disabled || isLocked || submitted) return;
    const nextIdx = index + delta;
    if (nextIdx < 0 || nextIdx >= rankedIds.length) return;
    setRankedIds((prev) => {
      const copy = [...prev];
      const [item] = copy.splice(index, 1);
      copy.splice(nextIdx, 0, item);
      return copy;
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (disabled || isLocked || submitted || submitting) return;
    setLocalError('');

    if (question.type === 'MULTIPLE_CHOICE') {
      if (selectedIds.length === 0) {
        setLocalError('Vui lòng chọn ít nhất 1 phương án.');
        return;
      }
      void onSubmit({ optionIds: selectedIds });
      return;
    }

    if (question.type === 'WORD_CLOUD') {
      const cleaned = words.map((w) => w.trim()).filter(Boolean);
      if (cleaned.length === 0) {
        setLocalError('Hãy nhập ít nhất 1 từ khóa.');
        return;
      }
      void onSubmit({ words: cleaned });
      return;
    }

    if (question.type === 'OPEN_ENDED') {
      const text = openText.trim();
      if (!text) {
        setLocalError('Hãy nhập ý kiến của bạn.');
        return;
      }
      void onSubmit({ text });
      return;
    }

    if (question.type === 'SCALES') {
      const stmts = question.scaleStatements ?? [];
      const missing = stmts.some((s) => ratings[s.id] === undefined);
      if (missing) {
        setLocalError('Vui lòng chọn mức đánh giá cho tất cả phát biểu.');
        return;
      }
      void onSubmit({ ratings });
      return;
    }

    if (question.type === 'RANKING') {
      if (rankedIds.length === 0) return;
      void onSubmit({ rankedOptionIds: rankedIds });
    }
  };

  if (submitted) {
    return (
      <div className="py-8 px-4 text-center space-y-2.5">
        <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto">
          <CheckCircle2 className="w-7 h-7" />
        </div>
        <h3 className={`${compact ? 'text-sm' : 'text-base'} font-extrabold text-ink-900`}>
          Đã ghi nhận phản hồi!
        </h3>
        <p className={`${compact ? 'text-[11px]' : 'text-xs'} text-ink-500`}>
          Hãy nhìn lên màn hình chiếu hoặc chờ giảng viên chuyển sang câu hỏi tiếp theo.
        </p>
      </div>
    );
  }

  const displayError = error || localError;
  const minScale = question.scaleMin ?? 1;
  const maxScale = question.scaleMax ?? 5;
  const scaleSteps: number[] = [];
  for (let v = minScale; v <= maxScale; v += 1) scaleSteps.push(v);

  return (
    <form onSubmit={handleSubmit} className={compact ? 'space-y-2.5' : 'space-y-4'}>
      <div>
        <h3
          className={`font-extrabold text-ink-900 leading-snug ${
            compact ? 'text-xs' : 'text-base sm:text-lg'
          }`}
        >
          {question.title}
        </h3>
        {question.description && (
          <p className={`text-ink-500 mt-1 ${compact ? 'text-[10px]' : 'text-xs'}`}>
            {question.description}
          </p>
        )}
      </div>

      {isLocked && (
        <div className="px-3 py-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-bold flex items-center gap-2">
          <Lock className="w-4 h-4 shrink-0" />
          Giảng viên đang tạm khóa bình chọn cho câu này.
        </div>
      )}

      {question.type === 'MULTIPLE_CHOICE' && (
        <div className="space-y-2">
          {question.allowMultipleSelections && (
            <p className="text-[11px] font-semibold text-indigo-600">
              Có thể chọn nhiều đáp án
            </p>
          )}
          {(question.options ?? []).map((opt, idx) => {
            const active = selectedIds.includes(opt.id);
            const color = opt.color || POLL_COLORS[idx % POLL_COLORS.length];
            return (
              <button
                key={opt.id}
                type="button"
                disabled={disabled || isLocked}
                onClick={() => toggleOption(opt.id)}
                className={`w-full text-left rounded-xl border-2 transition flex items-center gap-2.5 ${
                  compact ? 'px-2.5 py-2 text-xs' : 'px-3.5 py-3 text-sm'
                } ${
                  active
                    ? 'border-indigo-600 bg-indigo-50/80 text-indigo-950 font-bold shadow-xs'
                    : 'border-slate-200 bg-white hover:border-slate-300 text-ink-800 font-semibold'
                }`}
              >
                <span
                  className={`w-4 h-4 shrink-0 flex items-center justify-center border-2 ${
                    question.allowMultipleSelections ? 'rounded' : 'rounded-full'
                  }`}
                  style={{
                    borderColor: active ? color : '#CBD5E1',
                    backgroundColor: active ? color : 'transparent',
                  }}
                >
                  {active && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                </span>
                <span className="flex-1 break-words">{opt.text}</span>
              </button>
            );
          })}
        </div>
      )}

      {question.type === 'WORD_CLOUD' && (
        <div className="space-y-2">
          {words.map((val, idx) => (
            <input
              key={idx}
              type="text"
              maxLength={40}
              disabled={disabled || isLocked}
              value={val}
              onChange={(e) => {
                setLocalError('');
                setWords((prev) => prev.map((w, i) => (i === idx ? e.target.value : w)));
              }}
              placeholder={`Từ khóa #${idx + 1}${idx === 0 ? ' (bắt buộc)' : ' (tùy chọn)'}`}
              className={`w-full rounded-xl border border-slate-300 bg-white text-ink-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                compact ? 'h-8 px-2.5 text-xs' : 'h-11 px-3.5 text-sm'
              }`}
            />
          ))}
        </div>
      )}

      {question.type === 'OPEN_ENDED' && (
        <div className="space-y-1">
          <textarea
            rows={compact ? 3 : 4}
            maxLength={280}
            disabled={disabled || isLocked}
            value={openText}
            onChange={(e) => {
              setLocalError('');
              setOpenText(e.target.value);
            }}
            placeholder="Nhập suy nghĩ hoặc câu hỏi của bạn..."
            className={`w-full rounded-xl border border-slate-300 bg-white text-ink-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none ${
              compact ? 'p-2.5 text-xs' : 'p-3.5 text-sm'
            }`}
          />
          <div className="text-right text-[10px] font-mono text-ink-400">
            {openText.length}/280
          </div>
        </div>
      )}

      {question.type === 'SCALES' && (
        <div className="space-y-3">
          {(question.scaleStatements ?? []).map((st) => {
            const val = ratings[st.id];
            return (
              <div
                key={st.id}
                className="rounded-xl border border-slate-200 bg-slate-50/70 p-2.5 space-y-2"
              >
                <p className={`font-bold text-ink-800 ${compact ? 'text-[11px]' : 'text-xs sm:text-sm'}`}>
                  {st.text}
                </p>
                <div
                  className="grid gap-1"
                  style={{ gridTemplateColumns: `repeat(${scaleSteps.length}, minmax(0, 1fr))` }}
                >
                  {scaleSteps.map((num) => {
                    const selected = val === num;
                    return (
                      <button
                        key={num}
                        type="button"
                        disabled={disabled || isLocked}
                        onClick={() => {
                          setLocalError('');
                          setRatings((prev) => ({ ...prev, [st.id]: num }));
                        }}
                        className={`rounded-lg font-mono font-bold border transition ${
                          compact ? 'h-7 text-[11px]' : 'h-10 text-sm'
                        } ${
                          selected
                            ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                            : 'bg-white text-ink-700 border-slate-200 hover:border-indigo-300'
                        }`}
                      >
                        {num}
                      </button>
                    );
                  })}
                </div>
                <div className="flex justify-between text-[10px] text-ink-400">
                  <span>{question.scaleMinLabel || minScale}</span>
                  <span>{question.scaleMaxLabel || maxScale}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {question.type === 'RANKING' && (
        <div className="space-y-2">
          <p className="text-[11px] font-semibold text-ink-500">
            Bấm mũi tên để sắp xếp thứ tự ưu tiên từ #1 (cao nhất) xuống dưới:
          </p>
          {rankedIds.map((oid, idx) => {
            const opt = (question.options ?? []).find((o) => o.id === oid);
            if (!opt) return null;
            return (
              <div
                key={oid}
                className={`flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white ${
                  compact ? 'px-2.5 py-1.5 text-xs' : 'px-3 py-2.5 text-sm'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-6 h-6 rounded-lg bg-indigo-50 text-indigo-700 font-mono font-black text-xs flex items-center justify-center shrink-0">
                    #{idx + 1}
                  </span>
                  <span className="font-semibold text-ink-800 truncate">{opt.text}</span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    disabled={disabled || isLocked || idx === 0}
                    onClick={() => moveRankItem(idx, -1)}
                    className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-30"
                    title="Đưa lên"
                  >
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    disabled={disabled || isLocked || idx === rankedIds.length - 1}
                    onClick={() => moveRankItem(idx, 1)}
                    className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-30"
                    title="Đưa xuống"
                  >
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {displayError && (
        <p className="text-xs font-semibold text-rose-600">{displayError}</p>
      )}

      <button
        type="submit"
        disabled={disabled || isLocked || submitting}
        className={`w-full rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold flex items-center justify-center gap-2 shadow-sm transition ${
          compact ? 'h-9 text-xs' : 'h-12 text-sm'
        }`}
      >
        <Send className={compact ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
        {submitting ? 'Đang gửi...' : 'Gửi bình chọn'}
      </button>
    </form>
  );
};
