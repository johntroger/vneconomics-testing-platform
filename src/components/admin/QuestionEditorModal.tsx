import React, { useState } from 'react';
import { FlaskConical, Plus, Trash2, X } from 'lucide-react';
import { InfoHint } from '../common/InfoHint';
import type {
  DifficultyLevel,
  DynamicVarSpec,
  Question,
  QuestionType,
  RubricSlot,
} from '../../types/exam';
import {
  gradeMicroEssayRubric,
  shouldAutoPinLastOption,
} from '../../utils/dynamicQuestionEngine';

interface QuestionEditorModalProps {
  isOpen: boolean;
  courseId: string;
  existingChapters: string[];
  defaultChapter?: string;
  initialQuestion?: Question;
  onClose: () => void;
  onSave: (q: Question) => void;
}

export const QuestionEditorModal: React.FC<QuestionEditorModalProps> = ({
  isOpen,
  courseId,
  existingChapters,
  defaultChapter,
  initialQuestion,
  onClose,
  onSave,
}) => {
  const [type, setType] = useState<QuestionType>(
    initialQuestion?.type ?? 'SINGLE_CHOICE',
  );
  const [chapterCategory, setChapterCategory] = useState(
    initialQuestion?.chapterCategory ??
      defaultChapter ??
      existingChapters[0] ??
      'Chương 1: Tổng quan',
  );
  const [addingNewChapter, setAddingNewChapter] = useState(
    existingChapters.length === 0,
  );
  const [difficulty, setDifficulty] = useState<DifficultyLevel>(
    initialQuestion?.difficulty ?? 'MEDIUM',
  );
  const [content, setContent] = useState(initialQuestion?.content ?? '');
  const [points, setPoints] = useState(initialQuestion?.points ?? 1);

  const [options, setOptions] = useState(
    initialQuestion?.options ?? [
      { id: 'opt1', text: 'Phương án A', pinLast: false },
      { id: 'opt2', text: 'Phương án B', pinLast: false },
      { id: 'opt3', text: 'Phương án C', pinLast: false },
      { id: 'opt4', text: 'Phương án D', pinLast: false },
    ],
  );
  const [correctOptionIds, setCorrectOptionIds] = useState<string[]>(
    initialQuestion?.correctOptionIds ?? ['opt1'],
  );

  const [trueFalseItems, setTrueFalseItems] = useState(
    initialQuestion?.trueFalseItems ?? [
      { id: 'tf1', statement: 'Mệnh đề 1', answer: true },
      { id: 'tf2', statement: 'Mệnh đề 2', answer: false },
      { id: 'tf3', statement: 'Mệnh đề 3', answer: true },
      { id: 'tf4', statement: 'Mệnh đề 4', answer: false },
    ],
  );

  const [dynamicVars, setDynamicVars] = useState<DynamicVarSpec[]>(
    initialQuestion?.dynamicVars ?? [],
  );
  const [numericalFormula, setNumericalFormula] = useState(
    initialQuestion?.numericalFormula ?? '({a} - 10) / 2',
  );
  const [numericalUnit, setNumericalUnit] = useState(
    initialQuestion?.numericalUnit ?? '',
  );
  const [tolerance, setTolerance] = useState(initialQuestion?.tolerance ?? 0.05);

  const [sampleAnswer, setSampleAnswer] = useState(
    initialQuestion?.sampleAnswer ?? '',
  );
  const [maxChars, setMaxChars] = useState(initialQuestion?.maxChars ?? 300);
  const [gradingRubric, setGradingRubric] = useState<RubricSlot[]>(
    initialQuestion?.gradingRubric ?? [
      {
        id: 'slot_1',
        label: 'Ý 1: Trọng tâm kinh tế',
        points: 0.5,
        acceptedPhrases: ['tăng', 'dịch sang phải'],
        oppositeTerms: ['giảm', 'sang trái'],
      },
      {
        id: 'slot_2',
        label: 'Ý 2: Cơ chế giải thích',
        points: 0.5,
        acceptedPhrases: ['hàng hóa thay thế'],
        oppositeTerms: ['bổ sung'],
      },
    ],
  );

  const [aiHoneypotText, setAiHoneypotText] = useState(
    initialQuestion?.aiHoneypotText ?? '',
  );
  const [aiHoneypotOptionId, setAiHoneypotOptionId] = useState(
    initialQuestion?.aiHoneypotOptionId ?? '',
  );
  const [aiHoneypotKeyword, setAiHoneypotKeyword] = useState(
    initialQuestion?.aiHoneypotKeyword ?? '',
  );

  // Live Rubric Tester state
  const [testEssaySample, setTestEssaySample] = useState('');
  const [testResultText, setTestResultText] = useState<string | null>(null);

  if (!isOpen) return null;

  const buildCandidateQuestion = (): Question => ({
    id: initialQuestion?.id ?? `q_${Date.now().toString(36)}`,
    courseId,
    chapterCategory: chapterCategory.trim() || 'Chương 1: Tổng quan',
    difficulty,
    type,
    content: content.trim(),
    points: Number(points) || 1,
    options:
      type === 'SINGLE_CHOICE' || type === 'MULTI_CHOICE'
        ? options.map((o) => ({
            ...o,
            pinLast: o.pinLast || shouldAutoPinLastOption(o.text),
          }))
        : undefined,
    correctOptionIds:
      type === 'SINGLE_CHOICE' || type === 'MULTI_CHOICE'
        ? correctOptionIds
        : undefined,
    trueFalseItems: type === 'TRUE_FALSE' ? trueFalseItems : undefined,
    dynamicVars: dynamicVars.length > 0 ? dynamicVars : undefined,
    numericalFormula: type === 'NUMERICAL' ? numericalFormula : undefined,
    numericalUnit: type === 'NUMERICAL' ? numericalUnit : undefined,
    tolerance: type === 'NUMERICAL' ? Number(tolerance) : undefined,
    sampleAnswer: type === 'ESSAY' ? sampleAnswer : undefined,
    maxChars: type === 'ESSAY' ? maxChars : undefined,
    gradingRubric: type === 'ESSAY' ? gradingRubric : undefined,
    aiHoneypotText: aiHoneypotText.trim() || undefined,
    aiHoneypotOptionId: aiHoneypotOptionId || undefined,
    aiHoneypotKeyword: aiHoneypotKeyword.trim() || undefined,
  });

  const handleRunLiveRubricTest = () => {
    const mockVars: Record<string, number> = {};
    dynamicVars.forEach((v) => {
      mockVars[v.name] = v.min;
    });
    const res = gradeMicroEssayRubric(
      buildCandidateQuestion(),
      testEssaySample,
      mockVars,
    );
    setTestResultText(
      `Kết quả Engine (< 1ms): ${res.earnedPoints}/${res.maxPoints}đ — ${res.feedback}`,
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;
    onSave(buildCandidateQuestion());
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[90] bg-ink-900/60 flex items-center justify-center p-2.5 sm:p-4 overflow-y-auto">
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-200 max-h-[92dvh] flex flex-col overflow-hidden">
        <div className="px-4 sm:px-5 py-3.5 sm:py-4 border-b border-slate-200 flex items-center justify-between gap-2 bg-slate-50 shrink-0">
          <h2 className="text-sm sm:text-base font-extrabold text-ink-900 truncate">
            {initialQuestion ? 'Chỉnh sửa câu hỏi' : 'Thêm câu hỏi mới vào Ngân hàng'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-200 text-ink-600 shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <div className="flex-1 p-4 sm:p-5 overflow-y-auto space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="flex items-center gap-1.5 font-bold text-ink-700 mb-1">
                <span>Dạng câu hỏi</span>
                <InfoHint
                  title="Chọn loại câu hỏi phù hợp"
                  text={
                    '• Trắc nghiệm 1 đáp án: Sinh viên chọn duy nhất 1 phương án đúng (A/B/C/D).\n• Chọn nhiều đáp án: Có từ 2 đáp án đúng trở lên.\n• Đúng / Sai 4 mệnh đề: Mỗi câu gồm 4 ý nhỏ (a, b, c, d), sinh viên chọn Đúng hoặc Sai cho từng ý.\n• Điền số: Sinh viên tự gõ kết quả tính toán bằng số, máy tự chấm theo công thức và dung sai.\n• Tự luận cực ngắn: Sinh viên viết 1–2 câu, hệ thống tự chấm theo bảng từ khóa Rubric.'
                  }
                />
              </label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as QuestionType)}
                className="w-full h-10 px-2.5 rounded-xl border border-slate-300 font-semibold"
              >
                <option value="SINGLE_CHOICE">1. Trắc nghiệm 1 đáp án</option>
                <option value="MULTI_CHOICE">2a. Chọn nhiều đáp án</option>
                <option value="TRUE_FALSE">2b. Đúng / Sai 4 mệnh đề</option>
                <option value="NUMERICAL">3. Điền số (Biến số động)</option>
                <option value="ESSAY">4. Tự luận cực ngắn (Rubric)</option>
              </select>
            </div>

            <div>
              <label className="flex items-center gap-1.5 font-bold text-ink-700 mb-1">
                <span>Mức độ</span>
                <InfoHint
                  title="Phân tầng độ khó (Dễ / TB / Khó)"
                  text={
                    '• Khi sinh viên vào thi, hệ thống sẽ tự động bốc đề cân bằng tỷ lệ câu Dễ – Trung bình – Khó trong mỗi chương.\n• Nhờ đó mọi sinh viên đều làm đề có độ khó tương đương nhau dù bộ câu hỏi được tráo khác nhau.'
                  }
                />
              </label>
              <select
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value as DifficultyLevel)}
                className="w-full h-10 px-2.5 rounded-xl border border-slate-300 font-semibold"
              >
                <option value="EASY">Dễ</option>
                <option value="MEDIUM">Trung bình</option>
                <option value="HARD">Khó</option>
              </select>
            </div>

            <div>
              <label className="flex items-center gap-1.5 font-bold text-ink-700 mb-1">
                <span>Điểm gốc</span>
                <InfoHint
                  title="Điểm mặc định của câu hỏi"
                  text={
                    '• Là điểm chuẩn của riêng câu hỏi này (ví dụ: 1 điểm).\n• Lưu ý: Khi đưa vào Ma trận Đề thi, nếu thầy/cô đặt mức "Điểm/câu" riêng cho từng Chương thì mức điểm trong Ma trận sẽ được ưu tiên áp dụng (trừ câu Tự luận luôn giữ thang điểm chi tiết theo Rubric).'
                  }
                />
              </label>
              <input
                type="number"
                step="0.25"
                min="0.25"
                value={points}
                onChange={(e) => setPoints(Number(e.target.value))}
                className="w-full h-10 px-3 rounded-xl border border-slate-300 font-mono font-bold"
              />
            </div>
          </div>

          {/* Chapter Category */}
          <div>
            <div className="flex items-center justify-between gap-2 mb-1">
              <label className="block font-bold text-ink-700">
                Chương / Chuyên đề
              </label>
              {existingChapters.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    if (!addingNewChapter) {
                      setAddingNewChapter(true);
                      setChapterCategory(`Chương ${existingChapters.length + 1}: `);
                    } else {
                      setAddingNewChapter(false);
                      setChapterCategory(existingChapters[0] ?? 'Chương 1: Tổng quan');
                    }
                  }}
                  className="text-[11px] font-bold text-brand-700 hover:underline flex items-center gap-1"
                >
                  {addingNewChapter ? 'Chọn chương có sẵn' : '+ Thêm chương mới'}
                </button>
              )}
            </div>
            {addingNewChapter || existingChapters.length === 0 ? (
              <input
                type="text"
                value={chapterCategory}
                onChange={(e) => setChapterCategory(e.target.value)}
                className="w-full h-10 px-3 rounded-xl border border-slate-300 font-semibold"
                placeholder="Ví dụ: Chương 2: Cung - Cầu & Cân bằng"
              />
            ) : (
              <select
                value={existingChapters.includes(chapterCategory) ? chapterCategory : existingChapters[0]}
                onChange={(e) => setChapterCategory(e.target.value)}
                className="w-full h-10 px-3 rounded-xl border border-slate-300 bg-white font-semibold"
              >
                {existingChapters.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Prompt */}
          <div>
            <label className="block font-bold text-ink-700 mb-1">
              Nội dung câu hỏi (dùng {'{a}'}, {'{b}'} nếu gắn biến số động)
            </label>
            <textarea
              required
              rows={3}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="w-full rounded-xl border border-slate-300 p-3 text-sm"
              placeholder="Nhập nội dung câu hỏi..."
            />
          </div>

          {/* Dynamic Variables Block */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="font-bold text-ink-800 flex items-center gap-1.5 flex-wrap">
                <span>Biến số động cá nhân hóa theo MSSV ({'{a}'}, {'{b}'})</span>
                <InfoHint
                  title="Cách tạo số liệu riêng cho từng sinh viên"
                  text={
                    '• Tính năng chống nhìn bài: mỗi sinh viên nhận một bộ số liệu khác nhau tính theo Mã số sinh viên.\n• Ví dụ: Bấm "+ Thêm biến" đặt tên a từ 10 đến 50 (Bước nhảy 5). Trong đề viết: "Cho mức giá P = {a}...". Khi thi, hệ thống tự thay {a} thành số riêng cho từng em (bỏ trống nếu câu hỏi không cần biến số).'
                  }
                />
              </span>
              <button
                type="button"
                onClick={() =>
                  setDynamicVars((prev) => [
                    ...prev,
                    {
                      name: prev.length === 0 ? 'a' : prev.length === 1 ? 'b' : 'c',
                      min: 10,
                      max: 50,
                      step: 5,
                    },
                  ])
                }
                className="px-2.5 py-1 rounded-lg bg-white border border-slate-300 text-brand-700 font-bold flex items-center gap-1 shrink-0 whitespace-nowrap"
              >
                <Plus className="w-3 h-3" /> Thêm biến
              </button>
            </div>
            {dynamicVars.map((dv, idx) => (
              <div key={idx} className="grid grid-cols-5 gap-1.5 sm:gap-2 items-center">
                <input
                  value={dv.name}
                  onChange={(e) =>
                    setDynamicVars((prev) =>
                      prev.map((x, i) => (i === idx ? { ...x, name: e.target.value } : x)),
                    )
                  }
                  className="min-w-0 px-2 py-1.5 border rounded-lg font-mono font-bold"
                  placeholder="a"
                />
                <input
                  type="number"
                  step="0.1"
                  value={dv.min}
                  onChange={(e) =>
                    setDynamicVars((prev) =>
                      prev.map((x, i) =>
                        i === idx ? { ...x, min: Number(e.target.value) } : x,
                      ),
                    )
                  }
                  className="min-w-0 px-2 py-1.5 border rounded-lg font-mono"
                  placeholder="Min"
                />
                <input
                  type="number"
                  step="0.1"
                  value={dv.max}
                  onChange={(e) =>
                    setDynamicVars((prev) =>
                      prev.map((x, i) =>
                        i === idx ? { ...x, max: Number(e.target.value) } : x,
                      ),
                    )
                  }
                  className="min-w-0 px-2 py-1.5 border rounded-lg font-mono"
                  placeholder="Max"
                />
                <input
                  type="number"
                  step="0.1"
                  value={dv.step}
                  onChange={(e) =>
                    setDynamicVars((prev) =>
                      prev.map((x, i) =>
                        i === idx ? { ...x, step: Number(e.target.value) } : x,
                      ),
                    )
                  }
                  className="min-w-0 px-2 py-1.5 border rounded-lg font-mono"
                  placeholder="Bước"
                />
                <button
                  type="button"
                  onClick={() =>
                    setDynamicVars((prev) => prev.filter((_, i) => i !== idx))
                  }
                  className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg justify-self-center"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>

          {/* SINGLE / MULTI CHOICE */}
          {(type === 'SINGLE_CHOICE' || type === 'MULTI_CHOICE') && (
            <div className="space-y-2 bg-slate-50 border border-slate-200 rounded-xl p-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <p className="font-bold text-ink-800">
                  Các phương án lựa chọn (tích chọn đáp án đúng):
                </p>
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-ink-600">
                  <span>Ghim cuối</span>
                  <InfoHint
                    title="Chức năng Ghim cuối"
                    text={
                      '• Dùng cho các phương án như "Tất cả đều đúng", "Tất cả đều sai", "Cả A và B đều đúng".\n• Khi đề thi bật chế độ trộn đáp án A/B/C/D, các phương án tích "Ghim cuối" sẽ luôn được giữ cố định ở vị trí D (cuối cùng), không bị tráo lên trên.'
                    }
                  />
                </span>
              </div>
              {options.map((opt, idx) => {
                const isCorrect = correctOptionIds.includes(opt.id);
                return (
                  <div key={opt.id} className="flex items-center gap-2">
                    <input
                      type={type === 'SINGLE_CHOICE' ? 'radio' : 'checkbox'}
                      name="correct-choice"
                      checked={isCorrect}
                      onChange={() => {
                        if (type === 'SINGLE_CHOICE') {
                          setCorrectOptionIds([opt.id]);
                        } else {
                          setCorrectOptionIds((prev) =>
                            isCorrect
                              ? prev.filter((id) => id !== opt.id)
                              : [...prev, opt.id],
                          );
                        }
                      }}
                    />
                    <input
                      value={opt.text}
                      onChange={(e) =>
                        setOptions((prev) =>
                          prev.map((o, i) =>
                            i === idx ? { ...o, text: e.target.value } : o,
                          ),
                        )
                      }
                      className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white"
                    />
                    <label className="text-[11px] flex items-center gap-1 shrink-0 whitespace-nowrap">
                      <input
                        type="checkbox"
                        checked={Boolean(opt.pinLast)}
                        onChange={(e) =>
                          setOptions((prev) =>
                            prev.map((o, i) =>
                              i === idx ? { ...o, pinLast: e.target.checked } : o,
                            ),
                          )
                        }
                      />
                      Ghim cuối
                    </label>
                  </div>
                );
              })}
            </div>
          )}

          {/* TRUE_FALSE */}
          {type === 'TRUE_FALSE' && (
            <div className="space-y-2 bg-slate-50 border border-slate-200 rounded-xl p-3">
              <p className="font-bold text-ink-800">4 mệnh đề Đúng/Sai:</p>
              {trueFalseItems.map((tf, idx) => (
                <div key={tf.id} className="flex items-center gap-2">
                  <input
                    value={tf.statement}
                    onChange={(e) =>
                      setTrueFalseItems((prev) =>
                        prev.map((x, i) =>
                          i === idx ? { ...x, statement: e.target.value } : x,
                        ),
                      )
                    }
                    className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white"
                  />
                  <select
                    value={tf.answer ? 'T' : 'F'}
                    onChange={(e) =>
                      setTrueFalseItems((prev) =>
                        prev.map((x, i) =>
                          i === idx ? { ...x, answer: e.target.value === 'T' } : x,
                        ),
                      )
                    }
                    className="px-2 py-1.5 rounded-lg border border-slate-300 font-bold shrink-0"
                  >
                    <option value="T">ĐÚNG</option>
                    <option value="F">SAI</option>
                  </select>
                </div>
              ))}
            </div>
          )}

          {/* NUMERICAL */}
          {type === 'NUMERICAL' && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-50 border border-slate-200 rounded-xl p-3">
              <div>
                <label className="flex items-center gap-1.5 font-bold mb-1">
                  <span>Biểu thức đáp án</span>
                  <InfoHint
                    title="Cách nhập công thức đáp án số"
                    text={
                      '• Có thể gõ 1 con số cố định (ví dụ: 42.5) hoặc công thức toán theo biến số động đã khai báo ở trên.\n• Ví dụ: "2 * a + b / 10" hoặc "round((a - b) * 0.5, 2)". Máy sẽ tự tính đáp án đúng riêng cho từng sinh viên.'
                    }
                  />
                </label>
                <input
                  value={numericalFormula}
                  onChange={(e) => setNumericalFormula(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 font-mono"
                />
              </div>
              <div>
                <label className="flex items-center gap-1.5 font-bold mb-1">
                  <span>Đơn vị tính</span>
                  <InfoHint
                    title="Đơn vị hiển thị cạnh ô điền số"
                    text="Ví dụ: %, triệu đồng, sản phẩm. Sinh viên chỉ cần nhập con số, không phải tự gõ lại chữ đơn vị."
                  />
                </label>
                <input
                  value={numericalUnit}
                  onChange={(e) => setNumericalUnit(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300"
                />
              </div>
              <div>
                <label className="flex items-center gap-1.5 font-bold mb-1">
                  <span>Dung sai (±)</span>
                  <InfoHint
                    title="Khoảng sai số làm tròn được chấp nhận"
                    text={
                      '• Ví dụ: Nếu đáp án đúng là 10.33 và Dung sai là 0.05, thì sinh viên gõ từ 10.28 đến 10.38 đều được tính trọn điểm.\n• Rất hữu ích để tránh chấm sai oan do sinh viên làm tròn số thập phân.'
                    }
                  />
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={tolerance}
                  onChange={(e) => setTolerance(Number(e.target.value))}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 font-mono"
                />
              </div>
            </div>
          )}

          {/* ESSAY Micro-Essay + Rubric + Live Tester */}
          {type === 'ESSAY' && (
            <div className="space-y-3 bg-brand-50/50 border border-brand-200 rounded-xl p-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div className="sm:col-span-2 min-w-0">
                  <label className="block font-bold text-ink-800 mb-1">
                    Đáp án mẫu ngắn (1–2 câu chuẩn Micro-Essay)
                  </label>
                  <input
                    value={sampleAnswer}
                    onChange={(e) => setSampleAnswer(e.target.value)}
                    className="w-full min-w-0 px-3 py-1.5 rounded-lg border border-slate-300 bg-white"
                  />
                </div>
                <div className="min-w-0">
                  <label className="block font-bold text-ink-800 mb-1">
                    Giới hạn ký tự
                  </label>
                  <input
                    type="number"
                    min={100}
                    max={500}
                    value={maxChars}
                    onChange={(e) => setMaxChars(Number(e.target.value))}
                    className="w-full min-w-0 px-3 py-1.5 rounded-lg border border-slate-300 font-mono bg-white"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-ink-800 flex items-center gap-1.5 flex-wrap">
                    <span>Bảng Ý chấm Rubric Từ khóa – Từ đồng nghĩa</span>
                    <InfoHint
                      title="Cách hệ thống chấm Tự luận Tự động"
                      text={
                        '• Chia đáp án thành nhiều Ý chấm điểm nhỏ (mỗi dòng là 1 ý kèm số điểm).\n• Cụm từ chấp nhận: Liệt kê các cách diễn đạt đúng cách nhau bằng dấu phẩy (ví dụ: "cầu giảm, lượng cầu giảm"). Sinh viên viết trúng 1 cụm bất kỳ sẽ ăn điểm ý đó.\n• Từ đối lập bị chặn: Nếu sinh viên viết nhầm từ trái nghĩa (ví dụ: "cầu tăng"), máy sẽ chặn không cho điểm ý này.'
                      }
                    />
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setGradingRubric((prev) => [
                        ...prev,
                        {
                          id: `slot_${Date.now()}`,
                          label: `Ý ${prev.length + 1}`,
                          points: 0.5,
                          acceptedPhrases: [],
                          oppositeTerms: [],
                        },
                      ])
                    }
                    className="px-2 py-1 rounded bg-white border border-brand-300 text-brand-700 font-bold shrink-0 whitespace-nowrap"
                  >
                    + Thêm Ý
                  </button>
                </div>

                {gradingRubric.map((slot, idx) => (
                  <div
                    key={slot.id}
                    className="bg-white border border-slate-200 rounded-lg p-2.5 space-y-2"
                  >
                    <div className="flex gap-2">
                      <input
                        value={slot.label}
                        onChange={(e) =>
                          setGradingRubric((prev) =>
                            prev.map((s, i) =>
                              i === idx ? { ...s, label: e.target.value } : s,
                            ),
                          )
                        }
                        className="flex-1 min-w-0 px-2 py-1 border rounded font-semibold"
                        placeholder="Tên ý chấm"
                      />
                      <input
                        type="number"
                        step="0.25"
                        value={slot.points}
                        onChange={(e) =>
                          setGradingRubric((prev) =>
                            prev.map((s, i) =>
                              i === idx ? { ...s, points: Number(e.target.value) } : s,
                            ),
                          )
                        }
                        className="w-16 sm:w-20 px-2 py-1 border rounded font-mono font-bold shrink-0"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setGradingRubric((prev) => prev.filter((_, i) => i !== idx))
                        }
                        className="text-rose-600 px-1.5 shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <input
                      value={slot.acceptedPhrases.join(', ')}
                      onChange={(e) =>
                        setGradingRubric((prev) =>
                          prev.map((s, i) =>
                            i === idx
                              ? {
                                  ...s,
                                  acceptedPhrases: e.target.value
                                    .split(',')
                                    .map((x) => x.trim())
                                    .filter(Boolean),
                                }
                              : s,
                          ),
                        )
                      }
                      className="w-full px-2 py-1 border rounded text-[11px]"
                      placeholder="Cụm từ chấp nhận (ngăn cách dấu phẩy), VD: cung tiền giảm, ms giảm"
                    />
                    <input
                      value={(slot.oppositeTerms ?? []).join(', ')}
                      onChange={(e) =>
                        setGradingRubric((prev) =>
                          prev.map((s, i) =>
                            i === idx
                              ? {
                                  ...s,
                                  oppositeTerms: e.target.value
                                    .split(',')
                                    .map((x) => x.trim())
                                    .filter(Boolean),
                                }
                              : s,
                          ),
                        )
                      }
                      className="w-full px-2 py-1 border rounded text-[11px] bg-rose-50/40"
                      placeholder="Từ đối lập bị chặn (tùy chọn), VD: cung tiền tăng, sang trái"
                    />
                  </div>
                ))}
              </div>

              {/* Live Rubric Tester */}
              <div className="bg-white border border-brand-200 rounded-lg p-2.5 space-y-2">
                <div className="font-bold text-brand-800 flex items-center gap-1.5">
                  <FlaskConical className="w-3.5 h-3.5" />
                  Trình Chấm thử Rubric Tức thì (Live Rubric Tester)
                </div>
                <div className="flex gap-2">
                  <input
                    value={testEssaySample}
                    onChange={(e) => setTestEssaySample(e.target.value)}
                    placeholder="Nhập thử câu trả lời của sinh viên để test Rubric..."
                    className="flex-1 min-w-0 px-2.5 py-1.5 border rounded-lg"
                  />
                  <button
                    type="button"
                    onClick={handleRunLiveRubricTest}
                    className="px-3 py-1.5 rounded-lg bg-brand-600 text-white font-bold shrink-0 whitespace-nowrap"
                  >
                    Chấm thử
                  </button>
                </div>
                {testResultText && (
                  <p className="text-[11px] font-semibold text-support-700 bg-support-50 px-2.5 py-1.5 rounded">
                    {testResultText}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* AI Honeypot Config */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2">
            <span className="font-bold text-ink-700 flex items-center gap-1.5 flex-wrap">
              <span>Cấu hình Bẫy AI Honeypot (Tùy chọn)</span>
              <InfoHint
                title="Bẫy phát hiện dùng ChatGPT / AI giải hộ"
                text={
                  '• Không bắt buộc điền. Nếu dùng: ô bên trái cho phép chèn 1 câu chỉ dẫn ẩn (mắt thường sinh viên không thấy nhưng khi copy-paste toàn bộ đề sang ChatGPT, AI sẽ đọc nhầm và làm theo).\n• Nếu câu trả lời của sinh viên dính đúng "Từ khóa bẫy" hoặc chọn đúng "Đáp án bẫy", hệ thống sẽ gắn cờ đỏ Nghi vấn AI trên bảng Giám sát.'
                }
              />
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input
                value={aiHoneypotText}
                onChange={(e) => setAiHoneypotText(e.target.value)}
                placeholder="Chỉ dẫn ẩn sr-only trong DOM..."
                className="px-2.5 py-1.5 border rounded-lg bg-white"
              />
              {type === 'ESSAY' ? (
                <input
                  value={aiHoneypotKeyword}
                  onChange={(e) => setAiHoneypotKeyword(e.target.value)}
                  placeholder="Từ khóa bẫy tự luận..."
                  className="px-2.5 py-1.5 border rounded-lg bg-white"
                />
              ) : type === 'SINGLE_CHOICE' ? (
                <select
                  value={aiHoneypotOptionId}
                  onChange={(e) => setAiHoneypotOptionId(e.target.value)}
                  className="px-2.5 py-1.5 border rounded-lg bg-white"
                >
                  <option value="">-- Không gán đáp án bẫy AI --</option>
                  {options.map((o) => (
                    <option key={o.id} value={o.id}>
                      Bẫy AI: {o.text}
                    </option>
                  ))}
                </select>
              ) : null}
            </div>
          </div>

          </div>

          <div className="shrink-0 border-t border-slate-200 bg-slate-50 px-4 sm:px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] flex justify-end gap-2 text-xs">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-300 bg-white font-bold text-ink-700 shrink-0 whitespace-nowrap"
            >
              Hủy
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl bg-brand-600 text-white font-bold hover:bg-brand-700 shrink-0 whitespace-nowrap"
            >
              Lưu câu hỏi
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
