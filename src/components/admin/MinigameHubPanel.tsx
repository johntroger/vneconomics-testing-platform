import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BookmarkPlus,
  Download,
  ExternalLink,
  FileSpreadsheet,
  FolderOpen,
  RotateCcw,
  Search,
  Sparkles,
  Trash2,
  Upload,
  Users,
} from 'lucide-react';
import { MINIGAME_REGISTRY } from '../../minigames/registry';
import {
  exportMinigameHistoryXlsx,
  parseRosterFromExam,
  parseRosterFromExcelFile,
  parseRosterFromText,
  readMinigameStore,
  savePresetToStore,
  subscribeMinigameSync,
  writeMinigameStore,
} from '../../minigames/rosterStorage';
import {
  MINIGAME_CATEGORIES,
  type MinigameCategory,
  type MinigameStateStore,
} from '../../minigames/types';
import type { Exam } from '../../types/exam';

interface MinigameHubPanelProps {
  exams: Exam[];
  isPublicPage?: boolean;
  returnSource?: 'admin' | 'public';
}

export const MinigameHubPanel: React.FC<MinigameHubPanelProps> = ({
  exams,
  isPublicPage = false,
  returnSource = 'public',
}) => {
  const [store, setStore] = useState<MinigameStateStore>(() => readMinigameStore());
  const [inputMode, setInputMode] = useState<'PASTE' | 'EXAM' | 'EXCEL'>('PASTE');
  const [pasteText, setPasteText] = useState('');
  const [selectedExamId, setSelectedExamId] = useState(exams[0]?.id ?? '');
  const [presetNameInput, setPresetNameInput] = useState(store.activePresetName);
  const [statusMsg, setStatusMsg] = useState('');
  const [catFilter, setCatFilter] = useState<'ALL' | MinigameCategory>('ALL');
  const [gameSearch, setGameSearch] = useState('');
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const unsub = subscribeMinigameSync(() => {
      setStore(readMinigameStore());
    });
    return unsub;
  }, []);

  const updateStore = (next: MinigameStateStore) => {
    setStore(next);
    writeMinigameStore(next);
  };

  const notify = (msg: string) => {
    setStatusMsg(msg);
    window.setTimeout(() => setStatusMsg(''), 3200);
  };

  const handleApplyPaste = () => {
    const parsed = parseRosterFromText(pasteText);
    if (parsed.length === 0) {
      notify('Không tìm thấy tên sinh viên nào hợp lệ.');
      return;
    }
    updateStore({
      ...store,
      activePresetName: presetNameInput.trim() || 'Danh sách dán nhanh',
      students: parsed,
    });
    setPasteText('');
    notify(`Đã nạp ${parsed.length} sinh viên từ văn bản.`);
  };

  const handleApplyExam = () => {
    const exam = exams.find((e) => e.id === selectedExamId);
    if (!exam) return;
    const parsed = parseRosterFromExam(exam);
    if (parsed.length === 0) {
      notify('Đề thi này chưa có danh sách sinh viên (Roster).');
      return;
    }
    setPresetNameInput(exam.title);
    updateStore({
      ...store,
      activePresetName: exam.title,
      students: parsed,
    });
    notify(`Đã nạp ${parsed.length} sinh viên từ "${exam.title}".`);
  };

  const handleExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const parsed = await parseRosterFromExcelFile(file);
      if (parsed.length === 0) {
        notify('Không đọc được danh sách sinh viên từ file Excel này.');
        return;
      }
      const cleanName = file.name.replace(/\.[^.]+$/, '');
      setPresetNameInput(cleanName);
      updateStore({
        ...store,
        activePresetName: cleanName,
        students: parsed,
      });
      notify(`Đã nhập ${parsed.length} sinh viên từ Excel.`);
    } catch {
      notify('Lỗi đọc file Excel/CSV.');
    } finally {
      e.target.value = '';
    }
  };

  const filteredGames = useMemo(() => {
    const q = gameSearch.trim().toLowerCase();
    return MINIGAME_REGISTRY.filter((g) => {
      if (catFilter !== 'ALL' && g.category !== catFilter) return false;
      if (q && !g.name.toLowerCase().includes(q) && !g.description.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [catFilter, gameSearch]);

  const remainingCount = store.students.filter(
    (s) => !s.absent && (!store.excludeCalled || !s.called),
  ).length;

  return (
    <div className="space-y-6">
      {/* Section A: Unified Roster Manager */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-5 bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-extrabold text-ink-900 flex items-center gap-1.5">
              <Users className="w-4 h-4 text-indigo-600" />
              Nguồn Danh sách Sinh viên
            </h3>
            <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700">
              {remainingCount}/{store.students.length} sẵn sàng
            </span>
          </div>

          <div className="grid grid-cols-3 gap-1.5 bg-white p-1 rounded-xl border border-slate-200 text-xs font-bold">
            <button
              type="button"
              onClick={() => setInputMode('PASTE')}
              className={`py-1.5 rounded-lg transition ${
                inputMode === 'PASTE' ? 'bg-indigo-600 text-white' : 'text-ink-600 hover:bg-slate-50'
              }`}
            >
              Dán Text
            </button>
            <button
              type="button"
              onClick={() => setInputMode('EXCEL')}
              className={`py-1.5 rounded-lg transition ${
                inputMode === 'EXCEL' ? 'bg-indigo-600 text-white' : 'text-ink-600 hover:bg-slate-50'
              }`}
            >
              Tải Excel
            </button>
            <button
              type="button"
              onClick={() => setInputMode('EXAM')}
              className={`py-1.5 rounded-lg transition ${
                inputMode === 'EXAM' ? 'bg-indigo-600 text-white' : 'text-ink-600 hover:bg-slate-50'
              }`}
            >
              Từ Đề thi
            </button>
          </div>

          {inputMode === 'PASTE' && (
            <div className="space-y-2">
              <textarea
                rows={4}
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder={'Dán danh sách mỗi dòng 1 sinh viên...\nVD:\n22110001 - Nguyễn Minh Anh\n22110002 - Trần Hoàng Bảo'}
                className="w-full p-2.5 rounded-xl border border-slate-200 bg-white text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <button
                type="button"
                onClick={handleApplyPaste}
                className="w-full py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold"
              >
                Nạp danh sách từ Text
              </button>
            </div>
          )}

          {inputMode === 'EXCEL' && (
            <div className="space-y-2">
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleExcelUpload}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="w-full py-6 rounded-xl border-2 border-dashed border-indigo-300 bg-white hover:bg-indigo-50/40 text-indigo-700 text-xs font-bold flex flex-col items-center gap-1.5 transition"
              >
                <Upload className="w-5 h-5" />
                <span>Chọn file Excel (.xlsx, .xls, .csv)</span>
                <span className="text-[11px] font-normal text-ink-500">
                  Hỗ trợ cột Họ tên, Họ + Tên, MSSV, Giới tính
                </span>
              </button>
            </div>
          )}

          {inputMode === 'EXAM' && (
            <div className="space-y-2">
              {isPublicPage ? (
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 space-y-2">
                  <p className="font-semibold">
                    Đăng nhập tài khoản Giảng viên để nạp danh sách trực tiếp từ các Đề thi / Lớp học của bạn.
                  </p>
                  <Link
                    to="/admin"
                    className="inline-block px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-bold"
                  >
                    Đăng nhập Giảng viên →
                  </Link>
                </div>
              ) : (
                <>
                  <select
                    value={selectedExamId}
                    onChange={(e) => setSelectedExamId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold"
                  >
                    {exams.length === 0 ? (
                      <option value="">Chưa có đề thi nào</option>
                    ) : (
                      exams.map((ex) => (
                        <option key={ex.id} value={ex.id}>
                          {ex.title} (PIN {ex.roomPin})
                        </option>
                      ))
                    )}
                  </select>
                  <button
                    type="button"
                    disabled={!selectedExamId}
                    onClick={handleApplyExam}
                    className="w-full py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-40"
                  >
                    <FileSpreadsheet className="w-4 h-4" /> Nạp danh sách từ Đề thi này
                  </button>
                </>
              )}
            </div>
          )}

          {/* Save Preset */}
          <div className="pt-2 border-t border-slate-200 flex items-center gap-2">
            <input
              type="text"
              value={presetNameInput}
              onChange={(e) => setPresetNameInput(e.target.value)}
              placeholder="Tên lớp / preset..."
              className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold"
            />
            <button
              type="button"
              onClick={() => {
                const next = savePresetToStore(store, presetNameInput);
                setStore(next);
                notify(`Đã lưu preset "${next.activePresetName}".`);
              }}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold flex items-center gap-1 shrink-0"
            >
              <BookmarkPlus className="w-3.5 h-3.5" /> Lưu lớp
            </button>
          </div>

          {store.presets.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {store.presets.map((p) => (
                <div
                  key={p.id}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-[11px] font-bold"
                >
                  <button
                    type="button"
                    onClick={() => {
                      setPresetNameInput(p.name);
                      updateStore({ ...store, activePresetName: p.name, students: p.students });
                      notify(`Đã mở lớp "${p.name}".`);
                    }}
                    className="text-indigo-700 hover:underline flex items-center gap-1"
                  >
                    <FolderOpen className="w-3 h-3" /> {p.name} ({p.students.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const next = {
                        ...store,
                        presets: store.presets.filter((x) => x.id !== p.id),
                      };
                      updateStore(next);
                    }}
                    className="text-rose-500 hover:text-rose-700"
                    title="Xóa preset"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {statusMsg && (
            <div className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
              {statusMsg}
            </div>
          )}
        </div>

        {/* Right: Active Roster Preview & Controls */}
        <div className="lg:col-span-7 bg-slate-50 border border-slate-200 rounded-2xl p-4 flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-extrabold text-ink-900">
              Danh sách đang dùng: <span className="text-indigo-700">{store.activePresetName}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-xs font-bold flex items-center gap-1.5 bg-white px-2.5 py-1.5 rounded-lg border border-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={store.excludeCalled}
                  onChange={(e) => updateStore({ ...store, excludeCalled: e.target.checked })}
                  className="accent-indigo-600"
                />
                Không gọi trùng
              </label>
              <button
                type="button"
                onClick={() =>
                  updateStore({
                    ...store,
                    students: store.students.map((s) => ({ ...s, called: false, absent: false })),
                  })
                }
                className="px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 text-xs font-bold hover:bg-slate-100 flex items-center gap-1"
              >
                <RotateCcw className="w-3.5 h-3.5" /> Reset lượt
              </button>
              <button
                type="button"
                onClick={() =>
                  exportMinigameHistoryXlsx(store.students, store.history, store.activePresetName)
                }
                className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1"
              >
                <Download className="w-3.5 h-3.5" /> Xuất Excel
              </button>
            </div>
          </div>

          <div className="flex-1 max-h-52 overflow-y-auto bg-white border border-slate-200 rounded-xl p-2 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {store.students.map((s, idx) => (
              <div
                key={s.id}
                className={`px-2.5 py-1.5 rounded-lg border text-xs flex items-center justify-between gap-2 ${
                  s.absent
                    ? 'bg-rose-50 border-rose-200 text-rose-700 line-through'
                    : s.called
                      ? 'bg-slate-100 border-slate-200 text-slate-500'
                      : 'bg-white border-slate-200 text-ink-900'
                }`}
              >
                <span className="truncate font-semibold">
                  {idx + 1}. {s.name} {s.studentCode ? `(${s.studentCode})` : ''}
                </span>
                <div className="flex items-center gap-1 shrink-0">
                  {s.bonusPoints > 0 && (
                    <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-black text-[10px]">
                      +{s.bonusPoints}⭐
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() =>
                      updateStore({
                        ...store,
                        students: store.students.map((x) =>
                          x.id === s.id ? { ...x, called: !x.called, absent: false } : x,
                        ),
                      })
                    }
                    className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 hover:bg-slate-200 font-bold"
                  >
                    {s.called ? 'Khôi phục' : 'Đã gọi'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Section B: 36-Game Library with 5-Category Filter */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1.5">
            {MINIGAME_CATEGORIES.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCatFilter(c.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition flex items-center gap-1.5 ${
                  catFilter === c.id
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                    : 'bg-white text-ink-700 border-slate-200 hover:border-indigo-300'
                }`}
              >
                <span>{c.icon}</span>
                <span>{c.label}</span>
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={gameSearch}
              onChange={(e) => setGameSearch(e.target.value)}
              placeholder="Tìm tên trò chơi..."
              className="w-full pl-9 pr-3 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5">
          {filteredGames.map((g) => (
            <div
              key={g.id}
              className={`rounded-2xl border p-4 flex flex-col justify-between gap-3 transition ${
                g.ready
                  ? 'bg-white border-slate-200 hover:border-indigo-300 hover:shadow-md'
                  : 'bg-slate-50/70 border-slate-200/80 opacity-75'
              }`}
            >
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div
                    className={`w-11 h-11 rounded-2xl bg-gradient-to-br ${g.gradient} text-white text-2xl flex items-center justify-center shadow-sm`}
                  >
                    {g.icon}
                  </div>
                  <span
                    className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${
                      g.ready
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-slate-200 text-slate-600'
                    }`}
                  >
                    {g.ready ? g.badge || 'Sẵn sàng' : `Sắp ra mắt (${g.badge})`}
                  </span>
                </div>
                <div className="font-extrabold text-sm text-ink-900">{g.name}</div>
                <p className="text-xs text-ink-500 leading-relaxed">{g.description}</p>
              </div>

              {g.ready ? (
                <Link
                  to={
                    returnSource === 'admin'
                      ? `/minigame/${g.id}?from=admin`
                      : `/minigame/${g.id}`
                  }
                  className="w-full py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm"
                >
                  <Sparkles className="w-3.5 h-3.5" /> Mở Sân khấu Game
                  <ExternalLink className="w-3 h-3 opacity-80" />
                </Link>
              ) : (
                <button
                  type="button"
                  disabled
                  className="w-full py-2 rounded-xl bg-slate-200 text-slate-500 text-xs font-bold cursor-not-allowed"
                >
                  Đang phát triển ({g.badge})
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
