import React, { useEffect, useMemo, useState } from 'react';
import { Check, Pencil, Plus, RotateCcw, Trash2, Undo2, X } from 'lucide-react';
import { GameAvatarBadge } from '../components/game/GameAvatarBadge';
import { playCatchSound, playWheelTick } from '../utils/gameAudio';
import {
  DEFAULT_POINT_CRITERIA,
  readPointCriteria,
  writePointCriteria,
} from './rosterStorage';
import type { PointCriterion, RosterStudent } from './types';

interface PointAwardModalProps {
  /** The 1 or K students currently selected in the round */
  targets: RosterStudent[];
  /** Latest student objects from store so badge counts update live */
  allStudents: RosterStudent[];
  muted: boolean;
  onApplyPoints: (
    studentIds: string[],
    deltaBonus: number,
    deltaPenalty: number,
    label: string,
  ) => void;
  onClose: () => void;
}

interface UndoAction {
  studentIds: string[];
  deltaBonus: number;
  deltaPenalty: number;
  summary: string;
}

export const PointAwardModal: React.FC<PointAwardModalProps> = ({
  targets,
  allStudents,
  muted,
  onApplyPoints,
  onClose,
}) => {
  const [tab, setTab] = useState<'REWARD' | 'PENALTY'>('REWARD');
  const [criteria, setCriteria] = useState<PointCriterion[]>(() => readPointCriteria());
  const [selectedTargetId, setSelectedTargetId] = useState<string>(
    targets.length > 1 ? 'ALL' : targets[0]?.id ?? 'ALL',
  );
  const [lastUndo, setLastUndo] = useState<UndoAction | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [pulseBadge, setPulseBadge] = useState<'REWARD' | 'PENALTY' | null>(null);

  // Custom criterion & edit mode state
  const [editMode, setEditMode] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [editPoints, setEditPoints] = useState<number>(1);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newPoints, setNewPoints] = useState<number>(5);
  const [quickPoints, setQuickPoints] = useState<string>('1');

  const liveTargets = useMemo(() => {
    const map = new Map(allStudents.map((s) => [s.id, s]));
    return targets.map((t) => map.get(t.id) ?? t);
  }, [targets, allStudents]);

  const activeStudents = useMemo(() => {
    if (selectedTargetId === 'ALL') return liveTargets;
    const found = liveTargets.find((s) => s.id === selectedTargetId);
    return found ? [found] : liveTargets;
  }, [liveTargets, selectedTargetId]);

  const primaryStudent = activeStudents[0] ?? liveTargets[0];

  const visibleCriteria = useMemo(
    () => criteria.filter((c) => c.type === tab),
    [criteria, tab],
  );

  useEffect(() => {
    if (!toastMsg) return;
    const id = window.setTimeout(() => setToastMsg(null), 3200);
    return () => window.clearTimeout(id);
  }, [toastMsg]);

  const handleAward = (criterion: PointCriterion) => {
    if (activeStudents.length === 0) return;
    const ids = activeStudents.map((s) => s.id);
    const deltaBonus = criterion.type === 'REWARD' ? criterion.points : 0;
    const deltaPenalty = criterion.type === 'PENALTY' ? criterion.points : 0;

    onApplyPoints(ids, deltaBonus, deltaPenalty, criterion.label);

    if (!muted) {
      if (criterion.type === 'REWARD') playCatchSound();
      else playWheelTick();
    }

    const who =
      activeStudents.length > 1
        ? `${activeStudents.length} bạn`
        : activeStudents[0].name;
    const summary =
      criterion.type === 'REWARD'
        ? `🌸 Đã thưởng +${criterion.points} điểm cho ${who} (${criterion.label})`
        : `⚡ Đã trừ -${criterion.points} điểm với ${who} (${criterion.label})`;

    setToastMsg(summary);
    setLastUndo({ studentIds: ids, deltaBonus, deltaPenalty, summary });
    setPulseBadge(criterion.type);
    window.setTimeout(() => setPulseBadge(null), 420);
  };

  const handleUndo = () => {
    if (!lastUndo) return;
    onApplyPoints(
      lastUndo.studentIds,
      -lastUndo.deltaBonus,
      -lastUndo.deltaPenalty,
      'Hoàn tác điểm',
    );
    setToastMsg('↩️ Đã hoàn tác thao tác cộng/trừ điểm vừa rồi!');
    setLastUndo(null);
  };

  const handleAddCustomCriterion = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newLabel.trim();
    const pts = Math.max(1, Math.min(100, Math.floor(Number(newPoints) || 1)));
    if (!clean) return;
    const item: PointCriterion = {
      id: `custom_${Date.now().toString(36)}`,
      type: tab,
      points: pts,
      label: clean,
      icon: tab === 'REWARD' ? '🌸' : '⚡',
      custom: true,
    };
    const next = [...criteria, item];
    setCriteria(next);
    writePointCriteria(next);
    setNewLabel('');
    setNewPoints(tab === 'REWARD' ? 5 : 2);
    setShowAddForm(false);
  };

  const handleDeleteCriterion = (id: string) => {
    const next = criteria.filter((c) => c.id !== id);
    setCriteria(next);
    writePointCriteria(next);
    if (editingId === id) setEditingId(null);
  };

  const handleStartEdit = (c: PointCriterion) => {
    setEditingId(c.id);
    setEditLabel(c.label);
    setEditPoints(c.points);
    setShowAddForm(false);
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingId) return;
    const clean = editLabel.trim();
    const pts = Math.max(0.5, Math.min(100, Number(editPoints) || 1));
    if (!clean) return;
    const next = criteria.map((c) =>
      c.id === editingId ? { ...c, label: clean, points: pts } : c,
    );
    setCriteria(next);
    writePointCriteria(next);
    setEditingId(null);
    setToastMsg(`✏️ Đã cập nhật tiêu chí "${clean}" (${tab === 'REWARD' ? '+' : '-'}${pts} điểm)!`);
  };

  const handleQuickAward = (e: React.FormEvent) => {
    e.preventDefault();
    const pts = Number(quickPoints);
    if (!Number.isFinite(pts) || pts <= 0) return;
    handleAward({
      id: 'quick',
      type: tab,
      points: pts,
      label: tab === 'REWARD' ? 'Thưởng nhanh' : 'Trừ điểm nhanh',
      icon: tab === 'REWARD' ? '🌸' : '⚡',
    });
  };

  const handleResetDefaultCriteria = () => {
    setCriteria(DEFAULT_POINT_CRITERIA);
    writePointCriteria(DEFAULT_POINT_CRITERIA);
    setToastMsg('Đã khôi phục bộ tiêu chí mặc định!');
  };

  if (!primaryStudent) return null;

  const totalRewardDisplay =
    selectedTargetId === 'ALL' && liveTargets.length > 1
      ? liveTargets.reduce((sum, s) => sum + s.bonusPoints, 0)
      : primaryStudent.bonusPoints;

  const totalPenaltyDisplay =
    selectedTargetId === 'ALL' && liveTargets.length > 1
      ? liveTargets.reduce((sum, s) => sum + (s.penaltyPoints ?? 0), 0)
      : primaryStudent.penaltyPoints ?? 0;

  return (
    <div className="fixed inset-0 z-[60] bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5">
      <div className="relative w-full max-w-4xl max-h-[92dvh] overflow-y-auto rounded-3xl bg-white text-slate-900 shadow-2xl border-4 border-sky-200 flex flex-col">
        {/* Top Toast / Action Header */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 bg-gradient-to-r from-sky-50 via-white to-rose-50 border-b border-slate-200">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xl">🌸</span>
            <h3 className="font-black text-base sm:text-lg text-slate-800 truncate">
              Cộng / Trừ Điểm Lớp Học
            </h3>
          </div>

          <div className="flex items-center gap-2">
            {lastUndo && (
              <button
                type="button"
                onClick={handleUndo}
                className="px-3 py-1.5 rounded-xl bg-amber-100 hover:bg-amber-200 text-amber-900 font-bold text-xs flex items-center gap-1 transition"
              >
                <Undo2 className="w-3.5 h-3.5" /> Hoàn tác
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 rounded-xl bg-gradient-to-r from-rose-500 to-orange-500 hover:brightness-110 text-white font-black text-xs sm:text-sm flex items-center gap-1 shadow transition"
            >
              <Check className="w-4 h-4" /> Hoàn tất
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600"
              aria-label="Đóng"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Live Feedback Toast Banner */}
        {toastMsg && (
          <div className="mx-5 mt-3 px-4 py-2 rounded-2xl bg-emerald-50 border border-emerald-300 text-emerald-900 font-bold text-xs sm:text-sm flex items-center justify-between animate-fade-in">
            <span>{toastMsg}</span>
          </div>
        )}

        {/* Main 2-Column Layout */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-5 p-5">
          {/* LEFT COLUMN: Student Profile + Reward/Penalty Badges */}
          <div className="md:col-span-4 rounded-3xl bg-gradient-to-b from-amber-50/90 to-rose-50/70 border-2 border-amber-200/80 p-5 flex flex-col items-center justify-between gap-4">
            {/* Multi-student switcher if K > 1 */}
            {liveTargets.length > 1 && (
              <div className="w-full flex flex-wrap justify-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setSelectedTargetId('ALL')}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-black transition ${
                    selectedTargetId === 'ALL'
                      ? 'bg-sky-600 text-white shadow'
                      : 'bg-white text-slate-700 border border-slate-200 hover:bg-sky-50'
                  }`}
                >
                  Cả {liveTargets.length} bạn
                </button>
                {liveTargets.map((st) => (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => setSelectedTargetId(st.id)}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-bold transition truncate max-w-[120px] ${
                      selectedTargetId === st.id
                        ? 'bg-rose-500 text-white shadow'
                        : 'bg-white text-slate-700 border border-slate-200 hover:bg-rose-50'
                    }`}
                  >
                    {st.name.split(/\s+/).slice(-1)[0]}
                  </button>
                ))}
              </div>
            )}

            <div className="text-center">
              <div className="font-black text-lg sm:text-xl uppercase tracking-wide text-slate-900">
                {selectedTargetId === 'ALL' && liveTargets.length > 1
                  ? `NHÓM ${liveTargets.length} SINH VIÊN`
                  : primaryStudent.name}
              </div>
              {selectedTargetId !== 'ALL' && primaryStudent.studentCode && (
                <div className="text-xs font-mono font-bold text-slate-500 mt-0.5">
                  MSSV: {primaryStudent.studentCode}
                </div>
              )}
            </div>

            {/* Avatar with circular Red Reward & Purple Penalty badges */}
            <div className="relative flex items-center justify-center py-2">
              <div
                className={`absolute -left-7 top-1 w-12 h-12 rounded-full bg-gradient-to-br from-rose-500 to-red-600 text-white font-black text-base flex items-center justify-center shadow-lg border-2 border-white transition-transform duration-300 ${
                  pulseBadge === 'REWARD' ? 'scale-125' : 'scale-100'
                }`}
                title="Tổng điểm thưởng"
              >
                {totalRewardDisplay}
              </div>

              <GameAvatarBadge avatarId={primaryStudent.avatarId} streak={3} size="lg" />

              <div
                className={`absolute -right-7 top-1 w-12 h-12 rounded-full bg-gradient-to-br from-violet-600 to-purple-800 text-white font-black text-base flex items-center justify-center shadow-lg border-2 border-white transition-transform duration-300 ${
                  pulseBadge === 'PENALTY' ? 'scale-125' : 'scale-100'
                }`}
                title="Tổng điểm trừ"
              >
                {totalPenaltyDisplay}
              </div>
            </div>

            <div className="w-full grid grid-cols-2 gap-2 text-center text-xs">
              <div className="rounded-xl bg-rose-100/80 border border-rose-200 py-1.5 px-2">
                <div className="text-[10px] font-bold text-rose-700 uppercase">Điểm thưởng</div>
                <div className="font-black text-base text-rose-600">+{totalRewardDisplay}</div>
              </div>
              <div className="rounded-xl bg-violet-100/80 border border-violet-200 py-1.5 px-2">
                <div className="text-[10px] font-bold text-violet-700 uppercase">Điểm trừ</div>
                <div className="font-black text-base text-violet-700">-{totalPenaltyDisplay}</div>
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN: Reward / Penalty Tabs + Flower Criteria Grid */}
          <div className="md:col-span-8 flex flex-col gap-4">
            {/* Tabs + Edit Criteria Toggle */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex-1 flex items-center gap-2 bg-slate-100 p-1.5 rounded-2xl">
                <button
                  type="button"
                  onClick={() => {
                    setTab('REWARD');
                    setNewPoints(5);
                    setEditingId(null);
                  }}
                  className={`flex-1 py-2.5 rounded-xl font-black text-sm transition ${
                    tab === 'REWARD'
                      ? 'bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-md'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  🌸 ĐIỂM THƯỞNG
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTab('PENALTY');
                    setNewPoints(2);
                    setEditingId(null);
                  }}
                  className={`flex-1 py-2.5 rounded-xl font-black text-sm transition ${
                    tab === 'PENALTY'
                      ? 'bg-gradient-to-r from-violet-600 to-purple-700 text-white shadow-md'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  ⚡ ĐIỂM TRỪ
                </button>
              </div>

              <button
                type="button"
                onClick={() => {
                  setEditMode((v) => !v);
                  setEditingId(null);
                }}
                className={`px-3.5 py-2.5 rounded-2xl font-black text-xs flex items-center gap-1.5 border-2 transition ${
                  editMode
                    ? 'bg-amber-400 border-amber-500 text-slate-950 shadow'
                    : 'bg-white border-slate-200 text-slate-700 hover:border-amber-400 hover:bg-amber-50'
                }`}
                title="Bật để chỉnh sửa mức điểm, tên tiêu chí hoặc xóa thẻ"
              >
                <Pencil className="w-3.5 h-3.5" />
                {editMode ? 'Xong chỉnh sửa' : 'Sửa mức điểm'}
              </button>
            </div>

            {editMode && (
              <div className="px-3.5 py-2 rounded-xl bg-amber-50 border border-amber-300 text-amber-950 text-xs font-bold">
                ✏️ Đang ở chế độ chỉnh sửa: Bấm vào bất kỳ thẻ nào bên dưới để đổi tên &amp; số điểm, hoặc bấm biểu tượng thùng rác để xóa.
              </div>
            )}

            {/* Criteria Cards Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {visibleCriteria.map((c) => {
                const isReward = c.type === 'REWARD';
                const isBeingEdited = editingId === c.id;
                return (
                  <div key={c.id} className="relative group">
                    <button
                      type="button"
                      onClick={() => (editMode ? handleStartEdit(c) : handleAward(c))}
                      className={`w-full h-full rounded-2xl border-2 p-3.5 flex flex-col items-center justify-center gap-2 text-center transition active:scale-95 shadow-sm hover:shadow-md ${
                        isBeingEdited
                          ? 'ring-2 ring-amber-400 border-amber-500 bg-amber-50'
                          : isReward
                            ? 'bg-gradient-to-b from-rose-50/70 to-amber-50/70 border-rose-200 hover:border-rose-400'
                            : 'bg-gradient-to-b from-violet-50/70 to-slate-50 border-violet-200 hover:border-violet-400'
                      }`}
                    >
                      <div className="relative">
                        <span className="text-4xl block leading-none">{c.icon}</span>
                        <span
                          className={`absolute -top-2 -right-4 px-2 py-0.5 rounded-full text-[11px] font-black text-white shadow ${
                            isReward ? 'bg-rose-500' : 'bg-violet-600'
                          }`}
                        >
                          {isReward ? `+${c.points}` : `-${c.points}`}
                        </span>
                      </div>
                      <span className="text-xs font-extrabold text-slate-800 leading-snug line-clamp-2">
                        {c.label}
                      </span>
                    </button>

                    {/* Quick Edit / Delete Icons */}
                    <div
                      className={`absolute top-1.5 right-1.5 flex items-center gap-1 transition ${
                        editMode ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={(ev) => {
                          ev.stopPropagation();
                          handleStartEdit(c);
                        }}
                        className="p-1 rounded-lg bg-white/95 border border-slate-200 text-slate-600 hover:text-amber-600 shadow-sm"
                        title="Sửa tên & mức điểm thẻ này"
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={(ev) => {
                          ev.stopPropagation();
                          handleDeleteCriterion(c.id);
                        }}
                        className="p-1 rounded-lg bg-white/95 border border-slate-200 text-slate-500 hover:text-rose-600 shadow-sm"
                        title="Xóa thẻ này"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                );
              })}

              {/* Add Custom Criterion Card */}
              {!showAddForm && (
                <button
                  type="button"
                  onClick={() => {
                    setShowAddForm(true);
                    setEditingId(null);
                  }}
                  className="rounded-2xl border-2 border-dashed border-slate-300 hover:border-sky-400 hover:bg-sky-50/50 p-3.5 flex flex-col items-center justify-center gap-1.5 text-slate-500 hover:text-sky-700 transition min-h-[110px]"
                >
                  <Plus className="w-6 h-6" />
                  <span className="text-xs font-bold">Thêm tiêu chí</span>
                </button>
              )}
            </div>

            {/* Inline Edit Existing Criterion Form */}
            {editingId && (
              <form
                onSubmit={handleSaveEdit}
                className="rounded-2xl bg-amber-50 border-2 border-amber-300 p-3 flex flex-wrap items-center gap-2"
              >
                <span className="text-xs font-black text-amber-900">✏️ Sửa thẻ:</span>
                <input
                  type="text"
                  value={editLabel}
                  onChange={(e) => setEditLabel(e.target.value)}
                  className="flex-1 min-w-[170px] px-3 py-1.5 rounded-xl bg-white border border-amber-300 text-xs font-semibold focus:outline-none focus:border-amber-500"
                  required
                />
                <div className="flex items-center gap-1">
                  <span className="text-xs font-black text-slate-700">
                    {tab === 'REWARD' ? '+' : '-'}
                  </span>
                  <input
                    type="number"
                    step="0.5"
                    min={0.5}
                    max={100}
                    value={editPoints}
                    onChange={(e) => setEditPoints(Number(e.target.value))}
                    className="w-16 px-2 py-1.5 rounded-xl bg-white border border-amber-300 text-xs font-black text-center"
                  />
                  <span className="text-xs font-bold text-slate-500">điểm</span>
                </div>
                <button
                  type="submit"
                  className="px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black"
                >
                  Lưu thay đổi
                </button>
                <button
                  type="button"
                  onClick={() => setEditingId(null)}
                  className="px-2.5 py-1.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-bold"
                >
                  Hủy
                </button>
              </form>
            )}

            {/* Quick Custom Point Entry Bar (for any arbitrary number on the fly!) */}
            <form
              onSubmit={handleQuickAward}
              className="rounded-2xl bg-slate-50 border border-slate-200 px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2"
            >
              <span className="text-xs font-extrabold text-slate-700">
                {tab === 'REWARD' ? '⚡ Cộng điểm tùy ý:' : '⚡ Trừ điểm tùy ý:'}
              </span>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="0.5"
                  min={0.5}
                  max={100}
                  value={quickPoints}
                  onChange={(e) => setQuickPoints(e.target.value)}
                  className="w-20 px-2.5 py-1.5 rounded-xl bg-white border border-slate-300 text-xs font-black text-center focus:outline-none focus:border-sky-500"
                  aria-label="Nhập số điểm tùy ý"
                />
                <button
                  type="submit"
                  className={`px-4 py-1.5 rounded-xl text-white text-xs font-black shadow-sm transition active:scale-95 ${
                    tab === 'REWARD'
                      ? 'bg-rose-500 hover:bg-rose-400'
                      : 'bg-violet-600 hover:bg-violet-500'
                  }`}
                >
                  {tab === 'REWARD' ? `+ Cộng ${quickPoints || 0} điểm` : `- Trừ ${quickPoints || 0} điểm`}
                </button>
              </div>
            </form>

            {/* Inline Custom Criterion Form */}
            {showAddForm && (
              <form
                onSubmit={handleAddCustomCriterion}
                className="rounded-2xl bg-slate-50 border border-slate-200 p-3 flex flex-wrap items-center gap-2"
              >
                <input
                  type="text"
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  placeholder={
                    tab === 'REWARD'
                      ? 'Tên tiêu chí thưởng (vd: Trình bày nhóm tốt)'
                      : 'Tên tiêu chí trừ (vd: Đi học trễ)'
                  }
                  className="flex-1 min-w-[180px] px-3 py-1.5 rounded-xl bg-white border border-slate-300 text-xs font-semibold focus:outline-none focus:border-sky-500"
                  required
                />
                <div className="flex items-center gap-1">
                  <span className="text-xs font-black text-slate-600">
                    {tab === 'REWARD' ? '+' : '-'}
                  </span>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={newPoints}
                    onChange={(e) => setNewPoints(Number(e.target.value))}
                    className="w-16 px-2 py-1.5 rounded-xl bg-white border border-slate-300 text-xs font-black text-center"
                  />
                  <span className="text-xs font-bold text-slate-500">điểm</span>
                </div>
                <button
                  type="submit"
                  className="px-3.5 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-black"
                >
                  Lưu
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="px-2.5 py-1.5 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold"
                >
                  Hủy
                </button>
              </form>
            )}

            <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
              <span>Điểm được tự động lưu và xuất đầy đủ trong file Excel lớp học.</span>
              <button
                type="button"
                onClick={handleResetDefaultCriteria}
                className="flex items-center gap-1 hover:text-slate-600 font-semibold"
                title="Khôi phục bộ tiêu chí mặc định"
              >
                <RotateCcw className="w-3 h-3" /> Mặc định
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PointAwardModal;
