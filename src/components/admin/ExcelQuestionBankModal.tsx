import React, { useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardPaste,
  Download,
  FileSpreadsheet,
  Upload,
  X,
} from 'lucide-react';
import type { Course, Question, QuestionType } from '../../types/exam';
import {
  ALL_QUESTION_TYPES,
  downloadQuestionBankTemplateXlsx,
  exportCourseQuestionsToXlsx,
  parseExcelFileToQuestions,
  parsePastedTableToQuestions,
  type ParsedQuestionRow,
} from '../../utils/excelQuestionBank';

type ImportSourceTab = 'FILE' | 'PASTE';
type ImportMode = 'UPSERT' | 'APPEND' | 'REPLACE_COURSE';

const TEMPLATE_TYPE_OPTIONS: { type: QuestionType; label: string; hint: string }[] = [
  { type: 'SINGLE_CHOICE', label: 'Trắc nghiệm 4 PA', hint: '1 đáp án đúng A/B/C/D' },
  { type: 'MULTI_CHOICE', label: 'Nhiều đáp án', hint: 'Chọn nhiều ý đúng' },
  { type: 'TRUE_FALSE', label: 'Đúng / Sai', hint: 'Các mệnh đề Đúng / Sai (D, S)' },
  { type: 'NUMERICAL', label: 'Tính toán số', hint: 'Hỗ trợ biến động {a}' },
  { type: 'ESSAY', label: 'Tự luận ngắn', hint: 'Kèm rubric từ khóa' },
];

interface ExcelQuestionBankModalProps {
  open: boolean;
  onClose: () => void;
  course: Course;
  courseQuestions: Question[];
  examTitle?: string;
  selectedTemplateTypes?: QuestionType[];
  onChangeSelectedTemplateTypes?: (types: QuestionType[]) => void;
  onConfirmImport: (
    questions: Question[],
    options: { mode: ImportMode; syncChapters: boolean },
  ) => void;
}

export const ExcelQuestionBankModal: React.FC<ExcelQuestionBankModalProps> = ({
  open,
  onClose,
  course,
  courseQuestions,
  examTitle,
  selectedTemplateTypes: controlledTemplateTypes,
  onChangeSelectedTemplateTypes,
  onConfirmImport,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [sourceTab, setSourceTab] = useState<ImportSourceTab>('FILE');
  const [importMode, setImportMode] = useState<ImportMode>('UPSERT');
  const [syncChapters, setSyncChapters] = useState(true);
  const [pasteText, setPasteText] = useState('');
  const [fileName, setFileName] = useState('');
  const [dragging, setDragging] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState('');
  const [rows, setRows] = useState<ParsedQuestionRow[]>([]);
  const [onlyShowErrors, setOnlyShowErrors] = useState(false);
  const [internalTemplateTypes, setInternalTemplateTypes] = useState<QuestionType[]>([]);

  const selectedTemplateTypes =
    controlledTemplateTypes !== undefined
      ? controlledTemplateTypes
      : internalTemplateTypes;

  const updateSelectedTemplateTypes = (next: QuestionType[]) => {
    if (onChangeSelectedTemplateTypes) {
      onChangeSelectedTemplateTypes(next);
    }
    if (controlledTemplateTypes === undefined) {
      setInternalTemplateTypes(next);
    }
  };

  const effectiveTemplateTypes = useMemo<QuestionType[]>(
    () =>
      selectedTemplateTypes.length > 0
        ? selectedTemplateTypes
        : ['SINGLE_CHOICE'],
    [selectedTemplateTypes],
  );

  const isDefaultFourOptionOnly =
    effectiveTemplateTypes.length === 1 &&
    effectiveTemplateTypes[0] === 'SINGLE_CHOICE';

  const toggleTemplateType = (type: QuestionType) => {
    const next = selectedTemplateTypes.includes(type)
      ? selectedTemplateTypes.filter((item) => item !== type)
      : [...selectedTemplateTypes, type];
    updateSelectedTemplateTypes(next);
  };

  const existingChapters = useMemo(
    () => Array.from(new Set(courseQuestions.map((q) => q.chapterCategory))),
    [courseQuestions],
  );

  const validQuestions = useMemo(
    () =>
      rows
        .filter((r): r is ParsedQuestionRow & { question: Question } => r.status === 'VALID' && Boolean(r.question))
        .map((r) => r.question),
    [rows],
  );
  const errorCount = useMemo(
    () => rows.filter((r) => r.status === 'ERROR').length,
    [rows],
  );
  const displayedRows = useMemo(
    () => (onlyShowErrors ? rows.filter((r) => r.status === 'ERROR') : rows),
    [onlyShowErrors, rows],
  );

  if (!open) return null;

  const handleFilePicked = async (file: File) => {
    setParseError('');
    setParsing(true);
    setFileName(file.name);
    try {
      const parsed = await parseExcelFileToQuestions(file, course.id);
      if (parsed.length === 0) {
        setParseError('Không tìm thấy dòng dữ liệu câu hỏi nào trong file Excel này.');
      }
      setRows(parsed);
    } catch (err) {
      setParseError(
        err instanceof Error
          ? `Không đọc được tệp: ${err.message}`
          : 'Không thể đọc tệp Excel. Hãy kiểm tra đúng định dạng .xlsx/.xls/.csv.',
      );
      setRows([]);
    } finally {
      setParsing(false);
    }
  };

  const handleParsePaste = () => {
    setParseError('');
    setFileName('Dữ liệu dán từ bảng tính');
    const parsed = parsePastedTableToQuestions(pasteText, course.id);
    if (parsed.length === 0) {
      setParseError('Chưa phát hiện dòng hợp lệ. Hãy copy cả hàng từ Excel (Ctrl+C) rồi dán vào ô trên.');
    }
    setRows(parsed);
  };

  const handleConfirm = () => {
    if (validQuestions.length === 0) return;
    onConfirmImport(validQuestions, {
      mode: importMode,
      syncChapters,
    });
    setRows([]);
    setPasteText('');
    setFileName('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5">
      <div className="bg-white w-full max-w-5xl max-h-[92vh] rounded-2xl border border-slate-200 shadow-2xl flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-support-600 text-white flex items-center justify-center shadow-xs">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-ink-900">
                Nhập / Xuất Ngân hàng Đề thi bằng Excel (.xlsx)
              </h2>
              <p className="text-xs text-ink-500">
                Học phần: <strong className="text-ink-800">{course.code} — {course.name}</strong> (đang có {courseQuestions.length} câu)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-slate-200 text-ink-600"
            aria-label="Đóng cửa sổ Excel"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Step 1: Download Template or Export Current Bank */}
          <div className="grid grid-cols-1 lg:grid-cols-[1.55fr_1fr] gap-3 items-stretch">
            <div className="p-4 rounded-xl border border-brand-200 bg-brand-50/50 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-extrabold text-brand-900">
                    Bước 1A: Chọn Loại Câu Hỏi & Tải File Mẫu Excel
                  </p>
                  <p className="text-[11px] text-ink-600 mt-0.5 leading-relaxed">
                    {isDefaultFourOptionOnly ? (
                      <>
                        Đang ở chế độ{' '}
                        <strong className="text-brand-800">
                          mặc định 4 phương án (10 cột gọn)
                        </strong>{' '}
                        — có sẵn ô xổ xuống Chương, Độ khó, Điểm và Đáp án{' '}
                        <code className="px-1 py-0.5 rounded bg-white border border-brand-200 text-[10px] font-bold">
                          A/B/C/D
                        </code>
                        .
                      </>
                    ) : (
                      <>
                        Đã chọn{' '}
                        <strong className="text-brand-800">
                          {effectiveTemplateTypes.length} dạng câu hỏi
                        </strong>{' '}
                        — file mẫu tự động hiển thị đúng các cột và ô xổ xuống
                        tương ứng.
                      </>
                    )}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    downloadQuestionBankTemplateXlsx(
                      course.code,
                      course.name,
                      existingChapters,
                      effectiveTemplateTypes,
                    )
                  }
                  className="shrink-0 px-3.5 py-2 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs"
                >
                  <Download className="w-4 h-4" />
                  {isDefaultFourOptionOnly ? 'Tải Mẫu 4 Đáp Án' : 'Tải File Mẫu'}
                </button>
              </div>

              <div className="pt-2 border-t border-brand-200/70 space-y-2">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <span className="text-[11px] font-bold text-ink-700">
                    Loại câu hỏi có trong ngân hàng đề{' '}
                    <span className="font-normal text-ink-500">
                      (bỏ trống = mặc định chỉ Trắc nghiệm 4 phương án)
                    </span>
                  </span>
                  <div className="flex items-center gap-2 text-[11px]">
                    <button
                      type="button"
                      onClick={() => updateSelectedTemplateTypes([])}
                      className={`font-bold transition ${
                        selectedTemplateTypes.length === 0
                          ? 'text-brand-700 underline'
                          : 'text-ink-500 hover:text-ink-800'
                      }`}
                    >
                      Mặc định (4 PA)
                    </button>
                    <span className="text-slate-300">|</span>
                    <button
                      type="button"
                      onClick={() =>
                        updateSelectedTemplateTypes([...ALL_QUESTION_TYPES])
                      }
                      className={`font-bold transition ${
                        selectedTemplateTypes.length === ALL_QUESTION_TYPES.length
                          ? 'text-brand-700 underline'
                          : 'text-ink-500 hover:text-ink-800'
                      }`}
                    >
                      Chọn cả 5 loại
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {TEMPLATE_TYPE_OPTIONS.map((option) => {
                    const active = selectedTemplateTypes.includes(option.type);
                    return (
                      <label
                        key={option.type}
                        title={option.hint}
                        className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-[11px] font-bold cursor-pointer select-none transition ${
                          active
                            ? 'bg-white border-brand-500 text-brand-900 shadow-xs'
                            : 'bg-white text-ink-700 border-slate-200 hover:border-brand-300 hover:bg-brand-50/40'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={active}
                          onChange={() => toggleTemplateType(option.type)}
                          className="w-4 h-4 accent-brand-600 rounded cursor-pointer"
                        />
                        <span>{option.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="p-4 rounded-xl border border-support-200 bg-support-50/50 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-extrabold text-support-900">
                  Bước 1B: Xuất Kho Câu Hỏi Hiện Tại Để Sửa Hàng Loạt
                </p>
                <p className="text-[11px] text-ink-600 mt-0.5 leading-relaxed">
                  Xuất toàn bộ {courseQuestions.length} câu kèm sẵn ô xổ xuống & Mã câu để sửa trên Excel rồi import cập nhật đè (Upsert).
                </p>
              </div>
              <button
                type="button"
                disabled={courseQuestions.length === 0}
                onClick={() =>
                  exportCourseQuestionsToXlsx(
                    courseQuestions,
                    course.code,
                    course.name,
                    existingChapters,
                  )
                }
                className="shrink-0 px-3.5 py-2 rounded-xl bg-support-600 hover:bg-support-700 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs"
              >
                <FileSpreadsheet className="w-4 h-4" />
                Xuất Kho .xlsx
              </button>
            </div>
          </div>

          {/* Step 2: Upload Excel or Paste Rows */}
          <div className="space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <p className="text-xs font-extrabold text-ink-800 uppercase tracking-wider">
                Bước 2: Nạp File Excel Đã Điền Hoặc Dán Trực Tiếp
              </p>
              <div className="flex gap-1.5 bg-slate-100 p-1 rounded-xl text-xs">
                <button
                  type="button"
                  onClick={() => setSourceTab('FILE')}
                  className={`px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 transition ${
                    sourceTab === 'FILE'
                      ? 'bg-white text-brand-700 shadow-xs'
                      : 'text-ink-600 hover:text-ink-900'
                  }`}
                >
                  <Upload className="w-3.5 h-3.5" /> Chọn Tệp .xlsx / .csv
                </button>
                <button
                  type="button"
                  onClick={() => setSourceTab('PASTE')}
                  className={`px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 transition ${
                    sourceTab === 'PASTE'
                      ? 'bg-white text-brand-700 shadow-xs'
                      : 'text-ink-600 hover:text-ink-900'
                  }`}
                >
                  <ClipboardPaste className="w-3.5 h-3.5" /> Dán Từ Excel (Ctrl+V)
                </button>
              </div>
            </div>

            {sourceTab === 'FILE' ? (
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  const file = e.dataTransfer.files?.[0];
                  if (file) void handleFilePicked(file);
                }}
                onClick={() => fileInputRef.current?.click()}
                className={`cursor-pointer rounded-2xl border-2 border-dashed p-6 text-center transition ${
                  dragging
                    ? 'border-brand-500 bg-brand-50'
                    : 'border-slate-300 bg-slate-50/70 hover:border-brand-400 hover:bg-brand-50/30'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      void handleFilePicked(file);
                    }
                    e.target.value = '';
                  }}
                />
                <Upload className="w-8 h-8 mx-auto text-brand-600 mb-2" />
                <p className="text-sm font-bold text-ink-900">
                  {parsing
                    ? 'Đang phân tích bảng Excel...'
                    : fileName
                      ? `Đã chọn tệp: ${fileName} (Bấm để chọn tệp khác)`
                      : 'Kéo thả file Excel (.xlsx, .xls, .csv) vào đây hoặc bấm để chọn tệp'}
                </p>
                <p className="text-xs text-ink-500 mt-1">
                  Hệ thống tự động đọc sheet <code className="font-mono font-bold">CAU_HOI_NHAP</code> và kiểm tra lỗi từng dòng trước khi lưu.
                </p>
              </div>
            ) : (
              <div className="space-y-2 p-4 rounded-xl border border-slate-200 bg-slate-50">
                <p className="text-xs text-ink-600">
                  Bôi đen các dòng dữ liệu trong Excel (theo mẫu 10 cột mặc định hoặc mẫu tùy chọn, có thể copy kèm dòng tiêu đề), bấm <kbd className="px-1.5 py-0.5 rounded bg-white border font-mono text-[10px]">Ctrl+C</kbd> rồi dán vào khung dưới:
                </p>
                <textarea
                  rows={5}
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  placeholder="	Chương 1: Cung - Cầu	DE	1	Khi giá tăng lượng cầu giảm gọi là gì?	Luật cầu	Luật cung	Độ co giãn	Cân bằng	A"
                  className="w-full p-3 rounded-xl border border-slate-300 bg-white font-mono text-[11px]"
                />
                <div className="flex justify-end">
                  <button
                    type="button"
                    disabled={!pasteText.trim()}
                    onClick={handleParsePaste}
                    className="px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-xs font-bold"
                  >
                    Phân tích & Kiểm tra Dữ liệu
                  </button>
                </div>
              </div>
            )}

            {parseError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs font-semibold text-rose-700 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{parseError}</span>
              </div>
            )}
          </div>

          {/* Step 3: Import Behavior Options */}
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-3 text-xs">
            <p className="font-extrabold text-ink-800 uppercase tracking-wider">
              Bước 3: Chế độ Nạp vào Kho & Đồng bộ Ma trận
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <label
                className={`p-2.5 rounded-xl border cursor-pointer flex items-start gap-2 ${
                  importMode === 'UPSERT'
                    ? 'bg-white border-brand-500 ring-1 ring-brand-400'
                    : 'bg-white/70 border-slate-200'
                }`}
              >
                <input
                  type="radio"
                  name="importMode"
                  checked={importMode === 'UPSERT'}
                  onChange={() => setImportMode('UPSERT')}
                  className="mt-0.5 accent-brand-600"
                />
                <div>
                  <span className="font-bold text-ink-900 block">Cập nhật & Thêm mới (Upsert)</span>
                  <span className="text-[11px] text-ink-500">Giữ kho cũ, đè câu trùng Mã, thêm câu mới.</span>
                </div>
              </label>

              <label
                className={`p-2.5 rounded-xl border cursor-pointer flex items-start gap-2 ${
                  importMode === 'APPEND'
                    ? 'bg-white border-brand-500 ring-1 ring-brand-400'
                    : 'bg-white/70 border-slate-200'
                }`}
              >
                <input
                  type="radio"
                  name="importMode"
                  checked={importMode === 'APPEND'}
                  onChange={() => setImportMode('APPEND')}
                  className="mt-0.5 accent-brand-600"
                />
                <div>
                  <span className="font-bold text-ink-900 block">Chỉ Thêm Mới (Append)</span>
                  <span className="text-[11px] text-ink-500">Cấp mã mới toàn bộ, không bao giờ đè câu cũ.</span>
                </div>
              </label>

              <label
                className={`p-2.5 rounded-xl border cursor-pointer flex items-start gap-2 ${
                  importMode === 'REPLACE_COURSE'
                    ? 'bg-rose-50 border-rose-500 ring-1 ring-rose-400'
                    : 'bg-white/70 border-slate-200'
                }`}
              >
                <input
                  type="radio"
                  name="importMode"
                  checked={importMode === 'REPLACE_COURSE'}
                  onChange={() => setImportMode('REPLACE_COURSE')}
                  className="mt-0.5 accent-rose-600"
                />
                <div>
                  <span className="font-bold text-rose-900 block">Thay Thế Toàn Bộ Kho HP</span>
                  <span className="text-[11px] text-rose-700">Xóa sạch câu hỏi cũ của {course.code} trước khi nạp.</span>
                </div>
              </label>
            </div>

            {examTitle && (
              <label className="flex items-center gap-2 font-semibold text-ink-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={syncChapters}
                  onChange={(e) => setSyncChapters(e.target.checked)}
                  className="accent-brand-600"
                />
                <span>
                  Tự động thêm tên các Chương mới phát hiện từ file vào Ma trận đề thi <strong>"{examTitle}"</strong>
                </span>
              </label>
            )}
          </div>

          {/* Step 4: Live Validation & Preview Table */}
          {rows.length > 0 && (
            <div className="space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="px-2.5 py-1 rounded-full bg-slate-100 font-bold text-ink-800">
                    Tổng: {rows.length} dòng
                  </span>
                  <span className="px-2.5 py-1 rounded-full bg-support-100 font-bold text-support-800 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Hợp lệ: {validQuestions.length}
                  </span>
                  {errorCount > 0 && (
                    <span className="px-2.5 py-1 rounded-full bg-rose-100 font-bold text-rose-800 flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5" /> Lỗi định dạng: {errorCount}
                    </span>
                  )}
                </div>

                {errorCount > 0 && (
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-rose-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={onlyShowErrors}
                      onChange={(e) => setOnlyShowErrors(e.target.checked)}
                    />
                    Chỉ hiển thị các dòng bị lỗi
                  </label>
                )}
              </div>

              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="max-h-72 overflow-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="bg-slate-100 text-ink-700 sticky top-0">
                      <tr>
                        <th className="p-2.5 border-b w-14">Dòng</th>
                        <th className="p-2.5 border-b w-28">Trạng thái</th>
                        <th className="p-2.5 border-b w-36">Loại</th>
                        <th className="p-2.5 border-b w-44">Chương</th>
                        <th className="p-2.5 border-b">Nội dung & Đáp án</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {displayedRows.map((r) => (
                        <tr
                          key={`${r.rowNumber}_${r.rawContent ?? ''}`}
                          className={r.status === 'ERROR' ? 'bg-rose-50/70' : 'bg-white'}
                        >
                          <td className="p-2.5 font-mono font-bold text-ink-500">
                            #{r.rowNumber}
                          </td>
                          <td className="p-2.5">
                            {r.status === 'VALID' ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-support-100 text-support-800 font-bold text-[10px]">
                                <CheckCircle2 className="w-3 h-3" /> HỢP LỆ
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 font-bold text-[10px]">
                                <AlertTriangle className="w-3 h-3" /> LỖI
                              </span>
                            )}
                          </td>
                          <td className="p-2.5 font-mono text-[11px] font-semibold text-brand-700">
                            {r.rawType || '—'}
                          </td>
                          <td className="p-2.5 text-[11px] font-semibold text-ink-700">
                            {r.rawChapter || '—'}
                          </td>
                          <td className="p-2.5 space-y-1">
                            <p className="font-semibold text-ink-900 line-clamp-2">
                              {r.rawContent || '(Trống nội dung)'}
                            </p>
                            {r.answerSummary && (
                              <p className="text-[11px] text-support-700 font-mono">
                                {r.answerSummary}
                              </p>
                            )}
                            {r.errors.map((err, i) => (
                              <p key={i} className="text-[11px] text-rose-700 font-bold">
                                • {err}
                              </p>
                            ))}
                            {r.warnings.map((w, i) => (
                              <p key={i} className="text-[11px] text-amber-700">
                                ! {w}
                              </p>
                            ))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3.5 border-t border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-ink-500">
            {errorCount > 0 && validQuestions.length > 0
              ? `Các dòng lỗi (${errorCount}) sẽ tự động bỏ qua; chỉ nạp ${validQuestions.length} câu hợp lệ.`
              : 'Khuyến nghị kiểm tra nhanh bảng xem trước trước khi xác nhận.'}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-300 text-xs font-bold text-ink-700 hover:bg-slate-100"
            >
              Đóng
            </button>
            <button
              type="button"
              disabled={validQuestions.length === 0}
              onClick={handleConfirm}
              className={`px-5 py-2 rounded-xl text-white text-xs font-bold shadow-xs disabled:opacity-45 ${
                importMode === 'REPLACE_COURSE'
                  ? 'bg-rose-600 hover:bg-rose-700'
                  : 'bg-brand-600 hover:bg-brand-700'
              }`}
            >
              Nạp {validQuestions.length} câu hỏi hợp lệ vào Kho
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
