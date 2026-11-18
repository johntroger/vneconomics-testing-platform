import React, { useMemo, useState } from 'react';
import { BookOpen, Edit3, Layers, Plus, Search, Trash2, ArrowRight, Check, X } from 'lucide-react';
import { Course, Exam, Question } from '../../types/exam';
import { InfoHint } from '../common/InfoHint';
import { PaginationBar, paginateSlice } from '../common/PaginationBar';

interface CoursesTabPanelProps {
  courses: Course[];
  questions: Question[];
  exams: Exam[];
  selectedCourseId: string;
  onSelectCourse: (courseId: string) => void;
  onGoToBank: (courseId: string) => void;
  onGoToExams: (courseId: string) => void;
  onAddCourse: (course: Omit<Course, 'id'>) => Course;
  onUpdateCourse: (course: Course) => Promise<{ ok: boolean; error?: string }>;
  onDeleteCourse: (courseId: string) => Promise<{ ok: boolean; error?: string }>;
  requireOfficialOrPrompt: () => boolean;
  showToast: (msg: string) => void;
}

export const CoursesTabPanel: React.FC<CoursesTabPanelProps> = ({
  courses,
  questions,
  exams,
  selectedCourseId,
  onSelectCourse,
  onGoToBank,
  onGoToExams,
  onAddCourse,
  onUpdateCourse,
  onDeleteCourse,
  requireOfficialOrPrompt,
  showToast,
}) => {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [semester, setSemester] = useState('HK1 2026-2027');
  const [credits, setCredits] = useState(3);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editCode, setEditCode] = useState('');
  const [editName, setEditName] = useState('');
  const [editSemester, setEditSemester] = useState('');
  const [editCredits, setEditCredits] = useState(3);
  const [searchQuery, setSearchQuery] = useState('');
  const [semesterFilter, setSemesterFilter] = useState('ALL');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(8);

  const semesterOptions = useMemo(
    () => Array.from(new Set(courses.map((c) => c.semester || 'HK1 2026-2027'))),
    [courses],
  );

  const filteredCourses = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return courses.filter((c) => {
      const sem = c.semester || 'HK1 2026-2027';
      if (semesterFilter !== 'ALL' && sem !== semesterFilter) return false;
      if (!q) return true;
      return (
        c.code.toLowerCase().includes(q) ||
        c.name.toLowerCase().includes(q) ||
        sem.toLowerCase().includes(q)
      );
    });
  }, [courses, searchQuery, semesterFilter]);

  const { pageItems: pagedCourses, safePage } = paginateSlice(
    filteredCourses,
    page,
    pageSize,
  );

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!requireOfficialOrPrompt()) return;
    if (!code.trim() || !name.trim()) {
      showToast('Vui lòng nhập đầy đủ Mã học phần và Tên học phần.');
      return;
    }
    const created = onAddCourse({
      code: code.trim().toUpperCase(),
      name: name.trim(),
      semester: semester.trim() || 'HK1 2026-2027',
      credits: Math.max(1, credits),
    });
    onSelectCourse(created.id);
    setCode('');
    setName('');
    showToast(`Đã tạo học phần ${created.code} — ${created.name}`);
  };

  const startEdit = (c: Course) => {
    if (!requireOfficialOrPrompt()) return;
    setEditingId(c.id);
    setEditCode(c.code);
    setEditName(c.name);
    setEditSemester(c.semester || 'HK1 2026-2027');
    setEditCredits(c.credits || 3);
  };

  const saveEdit = async (course: Course) => {
    if (!editCode.trim() || !editName.trim()) {
      showToast('Mã HP và Tên học phần không được để trống.');
      return;
    }
    const res = await onUpdateCourse({
      ...course,
      code: editCode.trim().toUpperCase(),
      name: editName.trim(),
      semester: editSemester.trim() || 'HK1 2026-2027',
      credits: Math.max(1, editCredits),
    });
    if (!res.ok) {
      showToast(res.error || 'Không thể cập nhật học phần.');
      return;
    }
    setEditingId(null);
    showToast('Đã cập nhật thông tin học phần.');
  };

  const handleDelete = async (course: Course) => {
    if (!requireOfficialOrPrompt()) return;
    const examCount = exams.filter((e) => e.courseId === course.id).length;
    if (examCount > 0) {
      showToast(`Học phần đang có ${examCount} đề thi. Hãy xóa đề thi trước.`);
      return;
    }
    if (!window.confirm(`Xóa học phần ${course.code} — ${course.name} cùng toàn bộ câu hỏi của học phần này?`)) {
      return;
    }
    const res = await onDeleteCourse(course.id);
    if (!res.ok) {
      showToast(res.error || 'Không thể xóa học phần.');
      return;
    }
    showToast(`Đã xóa học phần ${course.code}.`);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
      {/* Left: Create Course Form */}
      <div className="lg:col-span-4 bg-white rounded-2xl border border-slate-200 shadow-2xs p-4 sm:p-5 h-fit space-y-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-brand-50 text-brand-700 flex items-center justify-center shrink-0">
            <Plus className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-extrabold text-ink-900 flex items-center gap-1.5">
              <span>Thêm Học phần mới</span>
              <InfoHint
                title="Học phần dùng để làm gì?"
                text={
                  '• "Học phần" giống như một thư mục gốc cho cả môn học của thầy/cô.\n• Bên trong mỗi Học phần sẽ chứa Ngân hàng câu hỏi riêng và danh sách các Đề thi / Ca thi của môn đó.'
                }
              />
            </h2>
            <p className="text-[11px] text-ink-500">Bước 1 để xây dựng ngân hàng câu hỏi &amp; đề thi</p>
          </div>
        </div>

        <form onSubmit={handleCreate} className="space-y-3 text-xs">
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="flex items-center gap-1.5 font-bold text-ink-700 mb-1">
                <span>Mã học phần *</span>
                <InfoHint
                  title="Cách đặt Mã học phần"
                  text={
                    '• Đặt viết tắt ngắn gọn bằng chữ hoa và số, không dấu (ví dụ: ECO101, FIN202).\n• Mã này giúp thầy/cô phân biệt nhanh các môn và được dùng để đặt tên tự động cho file Excel câu hỏi khi tải về.'
                  }
                />
              </label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="VD: ECO101"
                className="w-full h-10 px-3 rounded-xl border border-slate-300 font-mono uppercase"
              />
            </div>
            <div>
              <label className="block font-bold text-ink-700 mb-1">Số tín chỉ</label>
              <input
                type="number"
                min={1}
                max={10}
                value={credits}
                onChange={(e) => setCredits(Number(e.target.value) || 3)}
                className="w-full h-10 px-3 rounded-xl border border-slate-300 font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block font-bold text-ink-700 mb-1">Tên học phần *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="VD: Kinh tế Vi mô 1"
              className="w-full h-10 px-3 rounded-xl border border-slate-300"
            />
          </div>

          <div>
            <label className="block font-bold text-ink-700 mb-1">Học kỳ</label>
            <input
              type="text"
              value={semester}
              onChange={(e) => setSemester(e.target.value)}
              placeholder="HK1 2026-2027"
              className="w-full h-10 px-3 rounded-xl border border-slate-300"
            />
          </div>

          <button
            type="submit"
            className="w-full h-10 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-bold flex items-center justify-center gap-1.5 shadow-2xs"
          >
            <Plus className="w-4 h-4" /> Tạo Học phần
          </button>
        </form>
      </div>

      {/* Right: Course List */}
      <div className="lg:col-span-8 bg-white rounded-2xl border border-slate-200 shadow-2xs p-4 sm:p-5 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-extrabold text-ink-900 flex items-center gap-1.5 flex-wrap">
              <BookOpen className="w-4 h-4 text-brand-600 shrink-0" />
              <span>Danh sách Học phần của bạn ({courses.length})</span>
              <InfoHint
                title="Quy trình làm việc từng bước"
                text={
                  '• Bước 1: Bấm nút "Ngân hàng câu hỏi" màu xanh nhạt ở bên phải học phần để nhập câu hỏi (gõ tay hoặc nhập từ Excel).\n• Bước 2: Sau khi đã có câu hỏi, bấm nút "Đề thi" màu đen để tạo phòng thi, chọn số câu mỗi chương và lấy mã PIN 6 số phát cho sinh viên.'
                }
              />
            </h2>
            <p className="text-[11px] text-ink-500 mt-0.5">
              Chọn học phần để chuyển sang nhập Ngân hàng câu hỏi hoặc Tạo đề thi.
            </p>
          </div>
        </div>

        {courses.length === 0 ? (
          <div className="py-10 text-center rounded-xl border border-dashed border-slate-200 bg-slate-50/70 space-y-2">
            <BookOpen className="w-7 h-7 text-slate-400 mx-auto" />
            <p className="text-xs font-bold text-ink-700">Bạn chưa có học phần nào</p>
            <p className="text-[11px] text-ink-500">
              Nhập Mã HP và Tên học phần ở khung bên trái để bắt đầu.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Search & Semester Filter */}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="w-3.5 h-3.5 text-ink-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setPage(1);
                  }}
                  placeholder="Tìm theo mã HP, tên môn hoặc học kỳ..."
                  className="w-full h-9 pl-8 pr-3 rounded-xl border border-slate-200 bg-slate-50/60 focus:bg-white focus:outline-none focus:border-brand-500"
                />
              </div>
              <select
                value={semesterFilter}
                onChange={(e) => {
                  setSemesterFilter(e.target.value);
                  setPage(1);
                }}
                aria-label="Lọc theo học kỳ"
                className="h-9 px-2.5 rounded-xl border border-slate-200 bg-white font-semibold text-ink-800"
              >
                <option value="ALL">Tất cả học kỳ ({courses.length})</option>
                {semesterOptions.map((sem) => (
                  <option key={sem} value={sem}>
                    {sem}
                  </option>
                ))}
              </select>
            </div>

            {filteredCourses.length === 0 ? (
              <div className="p-6 text-center rounded-xl border border-dashed border-slate-200 text-xs text-ink-500">
                Không tìm thấy học phần nào khớp từ khóa "{searchQuery}".
              </div>
            ) : (
              <>
                <div className="space-y-2.5">
                  {pagedCourses.map((c) => {
              const qCount = questions.filter((q) => q.courseId === c.id).length;
              const eCount = exams.filter((e) => e.courseId === c.id).length;
              const isSelected = c.id === selectedCourseId;
              const isEditing = editingId === c.id;

              return (
                <div
                  key={c.id}
                  className={`p-3.5 rounded-xl border transition ${
                    isSelected
                      ? 'border-brand-400 bg-brand-50/40'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  {isEditing ? (
                    <div className="space-y-2 text-xs">
                      <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                        <input
                          type="text"
                          value={editCode}
                          onChange={(e) => setEditCode(e.target.value)}
                          className="h-9 px-2.5 rounded-lg border border-slate-300 font-mono uppercase"
                          placeholder="Mã HP"
                        />
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="sm:col-span-2 h-9 px-2.5 rounded-lg border border-slate-300"
                          placeholder="Tên học phần"
                        />
                        <input
                          type="number"
                          min={1}
                          value={editCredits}
                          onChange={(e) => setEditCredits(Number(e.target.value) || 3)}
                          className="h-9 px-2.5 rounded-lg border border-slate-300 font-mono"
                        />
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <input
                          type="text"
                          value={editSemester}
                          onChange={(e) => setEditSemester(e.target.value)}
                          className="h-9 px-2.5 rounded-lg border border-slate-300 text-xs w-48"
                          placeholder="Học kỳ"
                        />
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setEditingId(null)}
                            className="h-8 px-2.5 rounded-lg border border-slate-200 text-ink-600 font-semibold flex items-center gap-1"
                          >
                            <X className="w-3.5 h-3.5" /> Hủy
                          </button>
                          <button
                            type="button"
                            onClick={() => void saveEdit(c)}
                            className="h-8 px-3 rounded-lg bg-brand-600 text-white font-bold flex items-center gap-1"
                          >
                            <Check className="w-3.5 h-3.5" /> Lưu
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <div
                        className="min-w-0 cursor-pointer"
                        onClick={() => onSelectCourse(c.id)}
                      >
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="px-2 py-0.5 rounded-md bg-brand-100 text-brand-800 font-mono text-[11px] font-extrabold">
                            {c.code}
                          </span>
                          <span className="text-sm font-extrabold text-ink-900 truncate">
                            {c.name}
                          </span>
                        </div>
                        <div className="text-[11px] text-ink-500 mt-1 flex items-center gap-3 flex-wrap">
                          <span>{c.semester || 'HK1 2026-2027'}</span>
                          <span>• {c.credits} tín chỉ</span>
                          <span className="font-semibold text-ink-700">• {qCount} câu hỏi</span>
                          <span className="font-semibold text-ink-700">• {eCount} đề thi</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 flex-wrap shrink-0">
                        <button
                          type="button"
                          onClick={() => onGoToBank(c.id)}
                          className="h-8 px-2.5 rounded-lg border border-brand-200 bg-brand-50 text-brand-700 text-[11px] font-bold flex items-center gap-1 hover:bg-brand-100"
                        >
                          <Layers className="w-3.5 h-3.5" /> Ngân hàng câu hỏi
                        </button>
                        <button
                          type="button"
                          onClick={() => onGoToExams(c.id)}
                          className="h-8 px-2.5 rounded-lg bg-ink-900 hover:bg-ink-800 text-white text-[11px] font-bold flex items-center gap-1"
                        >
                          Đề thi <ArrowRight className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => startEdit(c)}
                          title="Sửa học phần"
                          className="h-8 w-8 rounded-lg border border-slate-200 text-ink-600 hover:bg-slate-50 flex items-center justify-center"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDelete(c)}
                          title="Xóa học phần"
                          className="h-8 w-8 rounded-lg border border-slate-200 text-rose-600 hover:bg-rose-50 flex items-center justify-center"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
                </div>
                <PaginationBar
                  currentPage={safePage}
                  totalItems={filteredCourses.length}
                  pageSize={pageSize}
                  onPageChange={setPage}
                  onPageSizeChange={setPageSize}
                  pageSizeOptions={[8, 16, 32]}
                  itemLabel="học phần"
                />
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
