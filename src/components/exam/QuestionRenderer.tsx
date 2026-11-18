import React, { useRef, useState } from 'react';
import { AlertCircle, ArrowRight, Check, CheckSquare, FileText, Hash, Square } from 'lucide-react';
import type {
  AssignedQuestionSnapshot,
  KeystrokeTelemetry,
  Question,
} from '../../types/exam';
import { CanvasQuestionView } from './CanvasQuestionView';
import { splitFillInBlankSegments } from '../../utils/dynamicQuestionEngine';

interface QuestionRendererProps {
  question: Question;
  snapshot: AssignedQuestionSnapshot;
  value: string | string[] | Record<string, boolean> | undefined;
  fontSizePx: number;
  canvasAntiOcr: boolean;
  watermarkLabel: string;
  forensicCode?: string;
  onChange: (
    payload: string | string[] | Record<string, boolean>,
    telemetry?: KeystrokeTelemetry,
  ) => void;
}

export const QuestionRenderer: React.FC<QuestionRendererProps> = ({
  question,
  snapshot,
  value,
  fontSizePx,
  canvasAntiOcr,
  watermarkLabel,
  forensicCode,
  onChange,
}) => {
  const inlineWatermark = forensicCode
    ? `${watermarkLabel} • #${forensicCode}`
    : watermarkLabel;
  const [pasteNotice, setPasteNotice] = useState(false);
  const startTypingAtRef = useRef<number | null>(null);
  const prevLenRef = useRef<number>(typeof value === 'string' ? value.length : 0);
  const suddenJumpsRef = useRef<number>(0);

  const orderedOptions = React.useMemo(() => {
    if (!question.options) return [];
    if (!snapshot.optionOrderIds) return question.options;
    const map = new Map(question.options.map((o) => [o.id, o]));
    return snapshot.optionOrderIds
      .map((id) => map.get(id))
      .filter((o): o is NonNullable<typeof o> => Boolean(o));
  }, [question.options, snapshot.optionOrderIds]);

  const maxChars = question.maxChars ?? 300;
  const stringVal = typeof value === 'string' ? value : '';

  const handleEssayInput = (nextText: string) => {
    if (nextText.length > maxChars) return;
    const now = Date.now();
    if (startTypingAtRef.current === null) {
      startTypingAtRef.current = now;
    }
    const delta = nextText.length - prevLenRef.current;
    if (delta > 12) {
      suddenJumpsRef.current += 1;
    }
    prevLenRef.current = nextText.length;

    const telemetry: KeystrokeTelemetry = {
      typedChars: nextText.length,
      durationMs: Math.max(100, now - startTypingAtRef.current),
      suddenJumps: suddenJumpsRef.current,
      pasteBlockedCount: 0,
    };
    onChange(nextText, telemetry);
  };

  const handleBlockPaste = (e: React.ClipboardEvent | React.DragEvent) => {
    e.preventDefault();
    setPasteNotice(true);
    window.setTimeout(() => setPasteNotice(false), 3000);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-brand-50 text-brand-700 text-[11px] font-semibold">
          {snapshot.chapterCategory}
        </span>
        <span className="text-xs font-mono font-semibold text-support-600 bg-support-50 px-2.5 py-1 rounded-full">
          {snapshot.maxPoints} điểm
        </span>
      </div>

      {/* Question Prompt (Text or Canvas Anti-OCR) */}
      {question.type === 'FILL_IN_BLANK' ? (
        <div
          onCopy={(e) => e.preventDefault()}
          style={{ fontSize: `${fontSizePx}px` }}
          className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 font-semibold text-ink-900 leading-loose select-none"
        >
          {(() => {
            const segments = splitFillInBlankSegments(snapshot.renderedContent);
            const totalBlanks = Math.max(0, segments.length - 1);
            const blankValues = Array.isArray(value)
              ? value.map((v) => String(v ?? ''))
              : [];
            const updateBlank = (blankIdx: number, nextVal: string) => {
              const next = Array.from(
                { length: totalBlanks },
                (_, i) => blankValues[i] ?? '',
              );
              next[blankIdx] = nextVal;
              onChange(next);
            };
            return (
              <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-2">
                {segments.map((seg, idx) => (
                  <React.Fragment key={idx}>
                    {seg && <span className="whitespace-pre-wrap">{seg}</span>}
                    {idx < totalBlanks && (
                      <input
                        type="text"
                        value={blankValues[idx] ?? ''}
                        onChange={(e) => updateBlank(idx, e.target.value)}
                        onPaste={handleBlockPaste}
                        onDrop={handleBlockPaste}
                        autoComplete="off"
                        autoCorrect="off"
                        autoCapitalize="off"
                        spellCheck={false}
                        placeholder={`Ô #${idx + 1}`}
                        aria-label={`Ô trống ${idx + 1}`}
                        style={{
                          width: `${Math.min(32, Math.max(10, (blankValues[idx]?.length ?? 0) + 4))}ch`,
                          maxWidth: '100%',
                        }}
                        className="inline-block align-baseline px-2.5 py-0.5 mx-0.5 rounded-lg border-2 border-brand-300 bg-white font-mono text-sm font-bold text-brand-900 placeholder:text-slate-400 placeholder:font-sans placeholder:font-medium focus:outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100 transition-colors"
                      />
                    )}
                  </React.Fragment>
                ))}
              </div>
            );
          })()}
          {pasteNotice && (
            <div className="mt-2.5 flex items-center gap-1.5 text-xs font-semibold text-danger-600">
              <AlertCircle className="w-3.5 h-3.5" />
              Không cho phép dán (Paste) vào ô điền từ. Vui lòng tự gõ trực tiếp.
            </div>
          )}
        </div>
      ) : canvasAntiOcr ? (
        <CanvasQuestionView
          text={snapshot.renderedContent}
          watermark={inlineWatermark}
          fontSizePx={fontSizePx}
        />
      ) : (
        <div
          style={{ fontSize: `${fontSizePx}px` }}
          className="relative font-semibold text-ink-900 leading-relaxed select-none"
        >
          {snapshot.renderedContent}
        </div>
      )}

      {/* Hidden AI Honeypot Trap */}
      {question.aiHoneypotText && (
        <span className="sr-only" aria-hidden="true">
          {question.aiHoneypotText}
        </span>
      )}

      {/* SINGLE_CHOICE */}
      {question.type === 'SINGLE_CHOICE' && (
        <div className="space-y-2.5 pt-1">
          {orderedOptions.map((opt, idx) => {
            const letter = String.fromCharCode(65 + idx);
            const selected = stringVal === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => onChange(opt.id)}
                className={`relative overflow-hidden w-full min-h-[54px] text-left p-3.5 rounded-xl border-2 transition flex items-start gap-3 active:scale-[0.99] ${
                  selected
                    ? 'border-brand-600 bg-brand-50/70 text-ink-900 shadow-sm'
                    : 'border-slate-200 bg-white text-ink-800 hover:border-brand-300'
                }`}
              >
                <span
                  aria-hidden="true"
                  className="pointer-events-none select-none absolute inset-0 flex items-center justify-end pr-3 opacity-[0.045] text-[10px] font-mono font-bold text-ink-900 -rotate-2 truncate"
                >
                  {inlineWatermark}
                </span>
                <span
                  className={`relative z-10 w-7 h-7 rounded-lg font-mono text-xs font-bold flex items-center justify-center shrink-0 mt-0.5 ${
                    selected
                      ? 'bg-brand-600 text-white'
                      : 'bg-slate-100 text-ink-700'
                  }`}
                >
                  {letter}
                </span>
                <div className="relative z-10 min-w-0 flex-1">
                  {canvasAntiOcr ? (
                    <CanvasQuestionView
                      text={opt.text}
                      watermark={inlineWatermark}
                      fontSizePx={Math.max(13, fontSizePx - 1)}
                      compact
                    />
                  ) : (
                    <span className="block text-sm sm:text-[15px] leading-snug font-medium">
                      {opt.text}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* MULTI_CHOICE */}
      {question.type === 'MULTI_CHOICE' && (
        <div className="space-y-2.5 pt-1">
          <p className="text-xs text-ink-500 font-medium">
            Chọn nhiều đáp án đúng (chạm để chọn/bỏ chọn):
          </p>
          {orderedOptions.map((opt) => {
            const arr = Array.isArray(value) ? value : [];
            const checked = arr.includes(opt.id);
            const toggle = () => {
              const next = checked
                ? arr.filter((id) => id !== opt.id)
                : [...arr, opt.id];
              onChange(next);
            };
            return (
              <button
                key={opt.id}
                type="button"
                onClick={toggle}
                className={`relative overflow-hidden w-full min-h-[54px] text-left p-3.5 rounded-xl border-2 transition flex items-start gap-3 ${
                  checked
                    ? 'border-brand-600 bg-brand-50/70 text-ink-900'
                    : 'border-slate-200 bg-white text-ink-800 hover:border-brand-300'
                }`}
              >
                <span
                  aria-hidden="true"
                  className="pointer-events-none select-none absolute inset-0 flex items-center justify-end pr-3 opacity-[0.045] text-[10px] font-mono font-bold text-ink-900 -rotate-2 truncate"
                >
                  {inlineWatermark}
                </span>
                {checked ? (
                  <CheckSquare className="relative z-10 w-5 h-5 text-brand-600 shrink-0 mt-0.5" />
                ) : (
                  <Square className="relative z-10 w-5 h-5 text-slate-400 shrink-0 mt-0.5" />
                )}
                <div className="relative z-10 min-w-0 flex-1">
                  {canvasAntiOcr ? (
                    <CanvasQuestionView
                      text={opt.text}
                      watermark={inlineWatermark}
                      fontSizePx={Math.max(13, fontSizePx - 1)}
                      compact
                    />
                  ) : (
                    <span className="block text-sm sm:text-[15px] leading-snug font-medium">
                      {opt.text}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* TRUE_FALSE */}
      {question.type === 'TRUE_FALSE' && (
        <div className="space-y-3 pt-1">
          {(question.trueFalseItems ?? []).map((item, idx) => {
            const tfMap =
              value && typeof value === 'object' && !Array.isArray(value)
                ? (value as Record<string, boolean>)
                : {};
            const current = tfMap[item.id];
            const setItem = (ans: boolean) => {
              onChange({ ...tfMap, [item.id]: ans });
            };
            return (
              <div
                key={item.id}
                className="relative overflow-hidden p-3.5 rounded-xl border border-slate-200 bg-white space-y-2.5"
              >
                <span
                  aria-hidden="true"
                  className="pointer-events-none select-none absolute inset-x-0 top-2 flex justify-end pr-3 opacity-[0.045] text-[10px] font-mono font-bold text-ink-900 truncate"
                >
                  {inlineWatermark}
                </span>
                <div className="relative z-10 flex items-start gap-1.5">
                  <span className="font-mono font-bold text-brand-600 text-sm pt-0.5 shrink-0">
                    {String.fromCharCode(97 + idx)})
                  </span>
                  <div className="min-w-0 flex-1">
                    {canvasAntiOcr ? (
                      <CanvasQuestionView
                        text={item.statement}
                        watermark={inlineWatermark}
                        fontSizePx={Math.max(13, fontSizePx - 1)}
                        compact
                      />
                    ) : (
                      <p className="text-sm font-medium text-ink-900 leading-snug">
                        {item.statement}
                      </p>
                    )}
                  </div>
                </div>
                <div className="relative z-10 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setItem(true)}
                    className={`h-11 rounded-lg text-xs font-bold border-2 transition flex items-center justify-center gap-1.5 ${
                      current === true
                        ? 'border-support-600 bg-support-50 text-support-700'
                        : 'border-slate-200 bg-slate-50 text-ink-600'
                    }`}
                  >
                    <Check className="w-4 h-4" /> ĐÚNG
                  </button>
                  <button
                    type="button"
                    onClick={() => setItem(false)}
                    className={`h-11 rounded-lg text-xs font-bold border-2 transition flex items-center justify-center gap-1.5 ${
                      current === false
                        ? 'border-rose-600 bg-rose-50 text-rose-700'
                        : 'border-slate-200 bg-slate-50 text-ink-600'
                    }`}
                  >
                    SAI
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* NUMERICAL */}
      {question.type === 'NUMERICAL' && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2">
          <label className="text-xs font-semibold text-ink-700 flex items-center gap-1.5">
            <Hash className="w-3.5 h-3.5 text-brand-600" />
            Nhập giá trị số (hỗ trợ cả dấu phẩy &quot;,&quot; và dấu chấm &quot;.&quot;)
          </label>
          <div className="flex items-center gap-2">
            <input
              type="text"
              inputMode="decimal"
              value={stringVal}
              onChange={(e) => onChange(e.target.value)}
              placeholder="Ví dụ: 22 hoặc 12.5"
              className="flex-1 min-w-0 h-12 px-4 rounded-xl border-2 border-slate-300 bg-white font-mono text-lg font-bold text-ink-900 focus:outline-none focus:border-brand-600"
            />
            {question.numericalUnit && (
              <span className="text-xs font-semibold text-ink-600 bg-white px-3 py-3 rounded-xl border border-slate-200 shrink-0 whitespace-nowrap">
                {question.numericalUnit}
              </span>
            )}
          </div>
        </div>
      )}

      {/* ESSAY (Micro-Essay <= 300 chars) */}
      {question.type === 'ESSAY' && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-ink-700 flex items-center gap-1.5 min-w-0">
              <FileText className="w-3.5 h-3.5 text-brand-600 shrink-0" />
              <span>Trả lời cực ngắn (1–2 câu, chấp nhận mũi tên {'->'})</span>
            </span>
            <button
              type="button"
              onClick={() => handleEssayInput(`${stringVal} -> `.trimStart())}
              className="text-[11px] font-mono font-semibold px-2.5 py-1 rounded-lg bg-white border border-brand-200 text-brand-700 hover:bg-brand-50 flex items-center gap-1 shrink-0 whitespace-nowrap"
            >
              Chèn <ArrowRight className="w-3 h-3" />
            </button>
          </div>

          <textarea
            value={stringVal}
            onChange={(e) => handleEssayInput(e.target.value)}
            onPaste={handleBlockPaste}
            onDrop={handleBlockPaste}
            rows={4}
            maxLength={maxChars}
            placeholder="Gõ ngắn gọn 1–2 câu trọng tâm (ví dụ: cung tiền giảm -> lãi suất tăng)..."
            className="w-full rounded-xl border-2 border-slate-300 bg-white p-3.5 text-sm leading-relaxed text-ink-900 focus:outline-none focus:border-brand-600"
          />

          <div className="flex items-center justify-between text-[11px]">
            <span className="text-ink-500">
              Hệ thống tự động chặn Paste và chấm theo Rubric từ khóa – logic.
            </span>
            <span
              className={`font-mono font-bold ${
                stringVal.length > maxChars * 0.9 ? 'text-amber-700' : 'text-ink-600'
              }`}
            >
              {stringVal.length}/{maxChars} ký tự
            </span>
          </div>

          {pasteNotice && (
            <div className="flex items-center gap-2 text-xs text-rose-700 bg-rose-50 border border-rose-200 px-3 py-2 rounded-lg font-medium">
              <AlertCircle className="w-4 h-4 shrink-0" />
              Chức năng Dán (Paste) đã bị khóa trong bài thi.
            </div>
          )}
        </div>
      )}
    </div>
  );
};
