import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart3,
  Check,
  Cloud,
  Copy,
  ExternalLink,
  ListOrdered,
  MessageSquareText,
  Monitor,
  Plus,
  Presentation,
  RefreshCw,
  SlidersHorizontal,
  Smartphone,
  Sparkles,
  Trash2,
} from 'lucide-react';
import {
  POLL_COLORS,
  type PollChartType,
  type PollListItem,
  type PollQuestion,
  type PollQuestionType,
  type PollVotePayload,
} from '../../types/poll';
import {
  aggregatePollVotes,
  createQuickPoll,
  deleteQuickPoll,
  fetchMyPolls,
  type LocalPollVoteRecord,
} from '../../services/pollApi';
import { PollResultChart } from './PollResultChart';
import { PollStudentCard } from './PollStudentCard';

interface QuickPollHubPanelProps {
  isAdminEmbedded?: boolean;
}

const QUESTION_TEMPLATES: Array<{
  type: PollQuestionType;
  label: string;
  badge: string;
  desc: string;
  icon: React.FC<{ className?: string }>;
  accent: string;
  factory: () => PollQuestion;
}> = [
  {
    type: 'MULTIPLE_CHOICE',
    label: 'Bình chọn (4 biểu đồ)',
    badge: 'Bar • Ngang • Donut • Dots',
    desc: 'Thu thập ý kiến nhanh, đổi 4 kiểu biểu đồ trực tiếp khi đang chiếu',
    icon: BarChart3,
    accent: 'from-indigo-500 to-violet-600',
    factory: () => ({
      id: `pq_${Date.now().toString(36)}`,
      type: 'MULTIPLE_CHOICE',
      title: 'Bạn đã sẵn sàng cho bài kiểm tra giữa kỳ chưa?',
      description: 'Chọn một đáp án phản ánh đúng nhất trạng thái của bạn',
      chartType: 'BAR',
      allowMultipleSelections: false,
      options: [
        { id: 'opt_1', text: 'Rất tự tin, đã ôn kỹ!', color: POLL_COLORS[1] },
        { id: 'opt_2', text: 'Tàm tạm, cần ôn thêm chút', color: POLL_COLORS[0] },
        { id: 'opt_3', text: 'Ủa hôm nay kiểm tra hả?!', color: POLL_COLORS[5] },
      ],
    }),
  },
  {
    type: 'WORD_CLOUD',
    label: 'Đám mây từ (Word Cloud)',
    badge: 'Từ khóa nổi bật',
    desc: 'Sinh viên gửi 1–3 từ khóa; từ lặp nhiều tự động phóng lớn ở trung tâm',
    icon: Cloud,
    accent: 'from-cyan-500 to-teal-600',
    factory: () => ({
      id: `pq_${Date.now().toString(36)}`,
      type: 'WORD_CLOUD',
      title: 'Một từ khóa bạn nhớ nhất từ buổi học hôm nay là gì?',
      description: 'Nhập tối đa 3 từ khóa ngắn gọn',
      maxWordsPerVoter: 3,
    }),
  },
  {
    type: 'OPEN_ENDED',
    label: 'Ý kiến mở (Speech Wall)',
    badge: 'Thẻ ý kiến & Ghim',
    desc: 'Hiển thị các thẻ suy nghĩ tự do; giảng viên có thể ghim hoặc ẩn thẻ',
    icon: MessageSquareText,
    accent: 'from-emerald-500 to-green-600',
    factory: () => ({
      id: `pq_${Date.now().toString(36)}`,
      type: 'OPEN_ENDED',
      title: 'Phần nào trong chương vừa rồi bạn thấy khó hiểu nhất?',
      description: 'Viết ngắn gọn ý kiến hoặc câu hỏi của bạn',
      openEndedLayout: 'GRID',
    }),
  },
  {
    type: 'SCALES',
    label: 'Thang đo (Scales / Likert)',
    badge: 'Phân bố & Trung bình',
    desc: 'Đo mức độ đồng ý / tự tin theo thang 1–5 hoặc 1–10 cho nhiều phát biểu',
    icon: SlidersHorizontal,
    accent: 'from-amber-500 to-orange-600',
    factory: () => ({
      id: `pq_${Date.now().toString(36)}`,
      type: 'SCALES',
      title: 'Đánh giá mức độ nắm vững kiến thức của bạn',
      scaleMin: 1,
      scaleMax: 5,
      scaleMinLabel: 'Chưa hiểu rõ',
      scaleMaxLabel: 'Nắm rất chắc',
      scaleStatements: [
        { id: 'st_1', text: 'Phân biệt trượt dọc và dịch chuyển đường cầu' },
        { id: 'st_2', text: 'Tính toán độ co giãn của cầu theo giá' },
      ],
    }),
  },
  {
    type: 'RANKING',
    label: 'Xếp hạng (Ranking)',
    badge: 'Borda Score',
    desc: 'Sinh viên sắp thứ tự ưu tiên trên điện thoại, màn hình tự tính điểm xếp hạng',
    icon: ListOrdered,
    accent: 'from-rose-500 to-pink-600',
    factory: () => ({
      id: `pq_${Date.now().toString(36)}`,
      type: 'RANKING',
      title: 'Sắp xếp các hình thức học tập hiệu quả nhất với bạn',
      options: [
        { id: 'opt_1', text: 'Thảo luận tình huống thực tế (Case study)', color: POLL_COLORS[0] },
        { id: 'opt_2', text: 'Chơi Kahoot / Quiz ôn tập nhanh', color: POLL_COLORS[1] },
        { id: 'opt_3', text: 'Giải bài tập định lượng trên lớp', color: POLL_COLORS[2] },
        { id: 'opt_4', text: 'Làm việc nhóm & thuyết trình', color: POLL_COLORS[3] },
      ],
    }),
  },
];

function buildSampleVotesForQuestion(q: PollQuestion): LocalPollVoteRecord[] {
  const now = new Date().toISOString();
  if (q.type === 'MULTIPLE_CHOICE') {
    const opts = q.options ?? [];
    if (opts.length === 0) return [];
    const weights = [5, 11, 8, 4, 6];
    const votes: LocalPollVoteRecord[] = [];
    opts.forEach((opt, idx) => {
      const n = weights[idx % weights.length];
      for (let i = 0; i < n; i += 1) {
        votes.push({
          id: `sample_${idx}_${i}`,
          questionIndex: 0,
          deviceToken: `sample_${idx}_${i}`,
          voterName: '',
          payload: { optionIds: [opt.id] },
          createdAt: now,
        });
      }
    });
    return votes;
  }
  if (q.type === 'WORD_CLOUD') {
    const sampleWords = [
      ['Cung cầu', 'Cân bằng', 'Giá cả'],
      ['Cung cầu', 'Co giãn'],
      ['Lạm phát', 'Cân bằng', 'Thị trường'],
      ['Co giãn', 'Cung cầu', 'Chi phí biên'],
      ['Thị trường', 'Cân bằng'],
      ['Độc quyền', 'Co giãn'],
    ];
    return sampleWords.map((words, i) => ({
      id: `sample_wc_${i}`,
      questionIndex: 0,
      deviceToken: `sample_wc_${i}`,
      voterName: '',
      payload: { words },
      createdAt: now,
    }));
  }
  if (q.type === 'OPEN_ENDED') {
    const texts = [
      'Cách phân biệt độ co giãn điểm và độ co giãn khoảng khi làm trắc nghiệm nhanh.',
      'Phần thặng dư tiêu dùng và phần mất không (DWL) khi đánh thuế.',
      'Ví dụ về doanh thu biên và chi phí biên của doanh nghiệp cạnh tranh hoàn hảo rất dễ hiểu ạ!',
    ];
    return texts.map((text, i) => ({
      id: `sample_oe_${i}`,
      questionIndex: 0,
      deviceToken: `sample_oe_${i}`,
      voterName: '',
      payload: { text },
      createdAt: now,
    }));
  }
  if (q.type === 'SCALES') {
    const stmts = q.scaleStatements ?? [];
    const min = q.scaleMin ?? 1;
    const max = q.scaleMax ?? 5;
    const sampleScores = [max, Math.max(min, max - 1), Math.max(min, max - 1), Math.max(min, Math.round((min + max) / 2)), max];
    return sampleScores.map((s, i) => {
      const ratings: Record<string, number> = {};
      stmts.forEach((st, si) => {
        ratings[st.id] = Math.max(min, Math.min(max, s - (si % 2)));
      });
      return {
        id: `sample_sc_${i}`,
        questionIndex: 0,
        deviceToken: `sample_sc_${i}`,
        voterName: '',
        payload: { ratings },
        createdAt: now,
      };
    });
  }
  if (q.type === 'RANKING') {
    const ids = (q.options ?? []).map((o) => o.id);
    if (ids.length < 2) return [];
    const perms = [
      [...ids],
      [ids[1], ids[0], ...ids.slice(2)],
      [...ids],
      [ids[0], ids[ids.length - 1], ...ids.slice(1, -1)],
    ];
    return perms.map((rankedOptionIds, i) => ({
      id: `sample_rk_${i}`,
      questionIndex: 0,
      deviceToken: `sample_rk_${i}`,
      voterName: '',
      payload: { rankedOptionIds },
      createdAt: now,
    }));
  }
  return [];
}

export const QuickPollHubPanel: React.FC<QuickPollHubPanelProps> = ({
  isAdminEmbedded = false,
}) => {
  const navigate = useNavigate();

  const [sessionTitle, setSessionTitle] = useState('Khảo sát nhanh trên lớp');
  const [questions, setQuestions] = useState<PollQuestion[]>(() => [
    QUESTION_TEMPLATES[0].factory(),
  ]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [allowMultipleVotes, setAllowMultipleVotes] = useState(false);
  const [hideResults, setHideResults] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  // Live split preview sandbox state
  const [useSamplePreview, setUseSamplePreview] = useState(true);
  const [previewVotes, setPreviewVotes] = useState<Record<string, LocalPollVoteRecord[]>>({});
  const [previewResetKey, setPreviewResetKey] = useState(0);

  // Saved rooms list
  const [myPolls, setMyPolls] = useState<PollListItem[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [copiedPin, setCopiedPin] = useState<string | null>(null);

  const loadPolls = useCallback(async () => {
    setLoadingList(true);
    try {
      const list = await fetchMyPolls();
      setMyPolls(list);
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    void loadPolls();
  }, [loadPolls]);

  const currentQ = questions[activeIdx] ?? questions[0];

  const updateCurrentQuestion = (patch: Partial<PollQuestion>) => {
    setQuestions((prev) =>
      prev.map((q, idx) => (idx === activeIdx ? { ...q, ...patch } : q)),
    );
  };

  const applyTemplateToCurrent = (type: PollQuestionType) => {
    const tpl = QUESTION_TEMPLATES.find((t) => t.type === type) ?? QUESTION_TEMPLATES[0];
    const nextQ = tpl.factory();
    setQuestions((prev) =>
      prev.map((q, idx) => (idx === activeIdx ? { ...nextQ, id: q.id } : q)),
    );
  };

  const addSlideWithTemplate = (type: PollQuestionType) => {
    const tpl = QUESTION_TEMPLATES.find((t) => t.type === type) ?? QUESTION_TEMPLATES[0];
    const nextQ = tpl.factory();
    setQuestions((prev) => {
      const next = [...prev, nextQ];
      setActiveIdx(next.length - 1);
      return next;
    });
  };

  const removeSlide = (idx: number) => {
    if (questions.length <= 1) return;
    setQuestions((prev) => prev.filter((_, i) => i !== idx));
    setActiveIdx((prev) => Math.max(0, prev >= idx ? prev - 1 : prev));
  };

  const previewVoteList = useMemo(() => {
    const userVotes = previewVotes[currentQ.id] ?? [];
    if (!useSamplePreview) return userVotes;
    return [...buildSampleVotesForQuestion(currentQ), ...userVotes];
  }, [currentQ, previewVotes, useSamplePreview]);

  const previewAggregation = useMemo(
    () => aggregatePollVotes(currentQ, previewVoteList, [], [], false, activeIdx),
    [currentQ, previewVoteList, activeIdx],
  );

  const handlePreviewVoteSubmit = (payload: PollVotePayload) => {
    const rec: LocalPollVoteRecord = {
      id: `pv_prev_${Date.now().toString(36)}`,
      questionIndex: activeIdx,
      deviceToken: 'preview_user',
      voterName: '',
      payload,
      createdAt: new Date().toISOString(),
    };
    setPreviewVotes((prev) => ({
      ...prev,
      [currentQ.id]: [...(prev[currentQ.id] ?? []), rec],
    }));
    setPreviewResetKey((k) => k + 1);
  };

  const handleCreateAndLaunch = async () => {
    setError('');
    for (let i = 0; i < questions.length; i += 1) {
      const q = questions[i];
      if (!q.title.trim()) {
        setError(`Câu hỏi #${i + 1} chưa có nội dung.`);
        setActiveIdx(i);
        return;
      }
      if (q.type === 'MULTIPLE_CHOICE' || q.type === 'RANKING') {
        const validOpts = (q.options ?? []).filter((o) => o.text.trim());
        if (validOpts.length < 2) {
          setError(`Câu hỏi #${i + 1} cần ít nhất 2 lựa chọn không rỗng.`);
          setActiveIdx(i);
          return;
        }
      }
      if (q.type === 'SCALES') {
        const validStmts = (q.scaleStatements ?? []).filter((s) => s.text.trim());
        if (validStmts.length < 1) {
          setError(`Câu hỏi thang đo #${i + 1} cần ít nhất 1 phát biểu.`);
          setActiveIdx(i);
          return;
        }
      }
    }

    setCreating(true);
    const res = await createQuickPoll({
      title: sessionTitle.trim() || questions[0]?.title || 'Khảo sát nhanh trên lớp',
      questions,
      allowMultipleVotes,
      hideResults,
    });
    setCreating(false);

    if (!res.ok || !res.sessionId) {
      setError(res.error ?? 'Không thể tạo phòng khảo sát.');
      return;
    }

    navigate(`/poll/host/${res.sessionId}`);
  };

  const handleCopyVoteLink = (pin: string) => {
    const url = `${window.location.origin}/vote/${pin}`;
    navigator.clipboard?.writeText(url).catch(() => {});
    setCopiedPin(pin);
    window.setTimeout(() => setCopiedPin((cur) => (cur === pin ? null : cur)), 2000);
  };

  const handleDeletePoll = async (sessionId: string) => {
    const ok = await deleteQuickPoll(sessionId);
    if (ok) {
      setMyPolls((prev) => prev.filter((p) => p.id !== sessionId));
    }
  };

  return (
    <div className="space-y-6">
      {/* Header strip */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-black text-ink-900 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-cyan-600" />
            Quick Poll Tools (Khảo sát Tương tác kiểu Mentimeter)
          </h2>
          <p className="text-xs text-ink-500 mt-0.5">
            Tạo nhanh câu hỏi khảo sát, trình chiếu biểu đồ nhảy số trực tiếp khi sinh viên quét QR hoặc nhập PIN tại{' '}
            <code className="px-1.5 py-0.5 rounded bg-slate-100 text-cyan-800 font-mono">/vote</code>.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="/vote"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-bold px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-ink-700 inline-flex items-center gap-1.5"
          >
            Mở trang bình chọn SV (/vote) <ExternalLink className="w-3.5 h-3.5" />
          </a>
          {isAdminEmbedded && (
            <a
              href="/poll"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-bold px-3.5 py-2 rounded-xl border border-cyan-200 bg-cyan-50 hover:bg-cyan-100 text-cyan-800 inline-flex items-center gap-1.5"
            >
              Mở trang Quick Poll độc lập (/poll) <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
        </div>
      </div>

      {/* 5 Quick-Start Template Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {QUESTION_TEMPLATES.map((tpl) => {
          const Icon = tpl.icon;
          const isActive = currentQ.type === tpl.type;
          return (
            <button
              key={tpl.type}
              type="button"
              onClick={() => applyTemplateToCurrent(tpl.type)}
              className={`text-left rounded-2xl border p-3.5 transition-all flex flex-col justify-between gap-2 ${
                isActive
                  ? 'border-cyan-500 bg-cyan-50/60 ring-2 ring-cyan-200 shadow-sm'
                  : 'border-slate-200 bg-white hover:border-cyan-300 hover:bg-slate-50/70'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span
                  className={`w-8 h-8 rounded-xl bg-gradient-to-br ${tpl.accent} text-white flex items-center justify-center shadow-xs shrink-0`}
                >
                  <Icon className="w-4 h-4" />
                </span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-ink-600 truncate">
                  {tpl.badge}
                </span>
              </div>
              <div>
                <div className="text-xs font-extrabold text-ink-900">{tpl.label}</div>
                <p className="text-[11px] text-ink-500 mt-0.5 leading-snug">{tpl.desc}</p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Split Builder & Live Mentimeter-style Preview */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
        {/* Left: Poll Builder */}
        <div className="xl:col-span-5 rounded-2xl border border-slate-200 bg-slate-50/60 p-4 sm:p-5 space-y-4">
          <div>
            <label className="block text-xs font-bold text-ink-700 mb-1">
              Tên phiên khảo sát (hiển thị cho phòng)
            </label>
            <input
              type="text"
              value={sessionTitle}
              onChange={(e) => setSessionTitle(e.target.value)}
              placeholder="Ví dụ: Khảo sát nhanh Kinh tế Vi mô - Buổi 4"
              className="w-full h-10 px-3 rounded-xl border border-slate-300 bg-white text-sm font-semibold text-ink-900 focus:outline-none focus:ring-2 focus:ring-cyan-500"
            />
          </div>

          {/* Slide tabs */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-ink-700">
                Danh sách câu hỏi ({questions.length} slide)
              </span>
              <button
                type="button"
                onClick={() => addSlideWithTemplate(currentQ.type)}
                className="text-xs font-bold text-cyan-700 hover:text-cyan-800 inline-flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" /> Thêm câu hỏi
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {questions.map((q, idx) => (
                <div
                  key={q.id}
                  className={`inline-flex items-center rounded-xl border text-xs font-bold transition ${
                    idx === activeIdx
                      ? 'bg-cyan-600 text-white border-cyan-600 shadow-xs'
                      : 'bg-white text-ink-700 border-slate-200 hover:border-cyan-300'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setActiveIdx(idx)}
                    className="px-2.5 py-1.5"
                  >
                    Câu {idx + 1}
                  </button>
                  {questions.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeSlide(idx)}
                      className={`pr-2 py-1.5 opacity-70 hover:opacity-100 ${
                        idx === activeIdx ? 'text-white' : 'text-rose-500'
                      }`}
                      title="Xóa câu này"
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Question content */}
          <div className="space-y-3 bg-white rounded-2xl border border-slate-200 p-4">
            <div>
              <label className="block text-xs font-bold text-ink-700 mb-1">
                Nội dung câu hỏi #{activeIdx + 1}
              </label>
              <input
                type="text"
                value={currentQ.title}
                onChange={(e) => updateCurrentQuestion({ title: e.target.value })}
                placeholder="Nhập câu hỏi hiển thị lên màn chiếu & điện thoại..."
                className="w-full h-10 px-3 rounded-xl border border-slate-300 text-sm font-bold text-ink-900 focus:outline-none focus:ring-2 focus:ring-cyan-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-ink-600 mb-1">
                Ghi chú phụ (tùy chọn)
              </label>
              <input
                type="text"
                value={currentQ.description ?? ''}
                onChange={(e) => updateCurrentQuestion({ description: e.target.value })}
                placeholder="Hướng dẫn ngắn cho sinh viên..."
                className="w-full h-9 px-3 rounded-xl border border-slate-200 text-xs text-ink-800 focus:outline-none focus:ring-2 focus:ring-cyan-500"
              />
            </div>

            {/* Type-specific editor */}
            {(currentQ.type === 'MULTIPLE_CHOICE' || currentQ.type === 'RANKING') && (
              <div className="space-y-2 pt-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-ink-700">
                    Các lựa chọn ({(currentQ.options ?? []).length}/12)
                  </span>
                  {(currentQ.options ?? []).length < 12 && (
                    <button
                      type="button"
                      onClick={() => {
                        const opts = currentQ.options ?? [];
                        const nextIdx = opts.length;
                        updateCurrentQuestion({
                          options: [
                            ...opts,
                            {
                              id: `opt_${Date.now().toString(36)}_${nextIdx}`,
                              text: `Phương án ${nextIdx + 1}`,
                              color: POLL_COLORS[nextIdx % POLL_COLORS.length],
                            },
                          ],
                        });
                      }}
                      className="text-xs font-bold text-cyan-700 hover:underline inline-flex items-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" /> Thêm lựa chọn
                    </button>
                  )}
                </div>
                <div className="space-y-2">
                  {(currentQ.options ?? []).map((opt, oi) => (
                    <div key={opt.id} className="flex items-center gap-2">
                      <span
                        className="w-4 h-4 rounded-full shrink-0"
                        style={{ backgroundColor: opt.color || POLL_COLORS[oi % POLL_COLORS.length] }}
                      />
                      <input
                        type="text"
                        value={opt.text}
                        onChange={(e) => {
                          const next = (currentQ.options ?? []).map((o, i) =>
                            i === oi ? { ...o, text: e.target.value } : o,
                          );
                          updateCurrentQuestion({ options: next });
                        }}
                        className="flex-1 h-9 px-2.5 rounded-lg border border-slate-300 text-xs font-semibold text-ink-900"
                      />
                      {(currentQ.options ?? []).length > 2 && (
                        <button
                          type="button"
                          onClick={() => {
                            const next = (currentQ.options ?? []).filter((_, i) => i !== oi);
                            updateCurrentQuestion({ options: next });
                          }}
                          className="p-1.5 rounded-lg text-ink-400 hover:text-rose-600"
                          title="Xóa phương án"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                {currentQ.type === 'MULTIPLE_CHOICE' && (
                  <div className="pt-2 space-y-2 border-t border-slate-100">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-bold text-ink-700">Kiểu biểu đồ:</span>
                      <div className="flex flex-wrap gap-1">
                        {(
                          [
                            ['BAR', 'Cột đứng'],
                            ['HORIZONTAL_BAR', 'Thanh ngang'],
                            ['DONUT', 'Donut %'],
                            ['DOTS', 'Chấm tròn'],
                          ] as Array<[PollChartType, string]>
                        ).map(([ct, lbl]) => (
                          <button
                            key={ct}
                            type="button"
                            onClick={() => updateCurrentQuestion({ chartType: ct })}
                            className={`px-2 py-1 rounded-lg text-[11px] font-bold border transition ${
                              (currentQ.chartType ?? 'BAR') === ct
                                ? 'bg-indigo-600 text-white border-indigo-600'
                                : 'bg-slate-50 text-ink-700 border-slate-200 hover:border-indigo-300'
                            }`}
                          >
                            {lbl}
                          </button>
                        ))}
                      </div>
                    </div>
                    <label className="flex items-center gap-2 text-xs font-semibold text-ink-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={Boolean(currentQ.allowMultipleSelections)}
                        onChange={(e) =>
                          updateCurrentQuestion({ allowMultipleSelections: e.target.checked })
                        }
                        className="rounded border-slate-300 text-indigo-600"
                      />
                      Cho phép sinh viên chọn nhiều đáp án cùng lúc
                    </label>
                  </div>
                )}
              </div>
            )}

            {currentQ.type === 'WORD_CLOUD' && (
              <div className="pt-1">
                <label className="block text-xs font-bold text-ink-700 mb-1">
                  Số từ khóa tối đa mỗi sinh viên được gửi
                </label>
                <select
                  value={currentQ.maxWordsPerVoter ?? 3}
                  onChange={(e) =>
                    updateCurrentQuestion({ maxWordsPerVoter: Number(e.target.value) })
                  }
                  className="h-9 px-3 rounded-xl border border-slate-300 text-xs font-bold text-ink-800 bg-white"
                >
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>
                      {n} từ khóa / người
                    </option>
                  ))}
                </select>
              </div>
            )}

            {currentQ.type === 'OPEN_ENDED' && (
              <div className="pt-1 flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-ink-700">Bố cục hiển thị:</span>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => updateCurrentQuestion({ openEndedLayout: 'GRID' })}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold border ${
                      (currentQ.openEndedLayout ?? 'GRID') === 'GRID'
                        ? 'bg-emerald-600 text-white border-emerald-600'
                        : 'bg-slate-50 text-ink-700 border-slate-200'
                    }`}
                  >
                    Lưới thẻ (Grid)
                  </button>
                  <button
                    type="button"
                    onClick={() => updateCurrentQuestion({ openEndedLayout: 'FLOW' })}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold border ${
                      currentQ.openEndedLayout === 'FLOW'
                        ? 'bg-emerald-600 text-white border-emerald-600'
                        : 'bg-slate-50 text-ink-700 border-slate-200'
                    }`}
                  >
                    Dòng chảy (Flow)
                  </button>
                </div>
              </div>
            )}

            {currentQ.type === 'SCALES' && (
              <div className="space-y-2.5 pt-1">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-bold text-ink-600 mb-1">
                      Thang điểm
                    </label>
                    <select
                      value={currentQ.scaleMax ?? 5}
                      onChange={(e) =>
                        updateCurrentQuestion({
                          scaleMin: 1,
                          scaleMax: Number(e.target.value),
                        })
                      }
                      className="w-full h-9 px-2.5 rounded-lg border border-slate-300 text-xs font-bold bg-white"
                    >
                      <option value={5}>Thang 1 → 5 (Likert)</option>
                      <option value={7}>Thang 1 → 7</option>
                      <option value={10}>Thang 1 → 10</option>
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <div>
                      <label className="block text-[11px] font-bold text-ink-600 mb-1">
                        Nhãn thấp
                      </label>
                      <input
                        type="text"
                        value={currentQ.scaleMinLabel ?? ''}
                        onChange={(e) =>
                          updateCurrentQuestion({ scaleMinLabel: e.target.value })
                        }
                        className="w-full h-9 px-2 rounded-lg border border-slate-300 text-[11px]"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-ink-600 mb-1">
                        Nhãn cao
                      </label>
                      <input
                        type="text"
                        value={currentQ.scaleMaxLabel ?? ''}
                        onChange={(e) =>
                          updateCurrentQuestion({ scaleMaxLabel: e.target.value })
                        }
                        className="w-full h-9 px-2 rounded-lg border border-slate-300 text-[11px]"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-ink-700">Các phát biểu đánh giá</span>
                  {(currentQ.scaleStatements ?? []).length < 8 && (
                    <button
                      type="button"
                      onClick={() => {
                        const list = currentQ.scaleStatements ?? [];
                        updateCurrentQuestion({
                          scaleStatements: [
                            ...list,
                            {
                              id: `st_${Date.now().toString(36)}_${list.length}`,
                              text: `Phát biểu #${list.length + 1}`,
                            },
                          ],
                        });
                      }}
                      className="text-xs font-bold text-cyan-700 hover:underline inline-flex items-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" /> Thêm phát biểu
                    </button>
                  )}
                </div>
                <div className="space-y-1.5">
                  {(currentQ.scaleStatements ?? []).map((st, si) => (
                    <div key={st.id} className="flex items-center gap-2">
                      <input
                        type="text"
                        value={st.text}
                        onChange={(e) => {
                          const next = (currentQ.scaleStatements ?? []).map((s, i) =>
                            i === si ? { ...s, text: e.target.value } : s,
                          );
                          updateCurrentQuestion({ scaleStatements: next });
                        }}
                        className="flex-1 h-9 px-2.5 rounded-lg border border-slate-300 text-xs font-semibold"
                      />
                      {(currentQ.scaleStatements ?? []).length > 1 && (
                        <button
                          type="button"
                          onClick={() => {
                            const next = (currentQ.scaleStatements ?? []).filter(
                              (_, i) => i !== si,
                            );
                            updateCurrentQuestion({ scaleStatements: next });
                          }}
                          className="p-1.5 rounded-lg text-ink-400 hover:text-rose-600"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Session Settings */}
          <div className="rounded-xl bg-white border border-slate-200 p-3 space-y-2 text-xs">
            <label className="flex items-center gap-2 font-semibold text-ink-700 cursor-pointer">
              <input
                type="checkbox"
                checked={allowMultipleVotes}
                onChange={(e) => setAllowMultipleVotes(e.target.checked)}
                className="rounded border-slate-300 text-cyan-600"
              />
              Cho phép 1 thiết bị gửi nhiều lần (thích hợp cho Word Cloud / Ý kiến mở)
            </label>
            <label className="flex items-center gap-2 font-semibold text-ink-700 cursor-pointer">
              <input
                type="checkbox"
                checked={hideResults}
                onChange={(e) => setHideResults(e.target.checked)}
                className="rounded border-slate-300 text-cyan-600"
              />
              Tạm ẩn kết quả trên màn chiếu cho tới khi bấm Công bố
            </label>
          </div>

          {error && (
            <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-xs font-semibold text-rose-700">
              {error}
            </div>
          )}

          <button
            type="button"
            disabled={creating}
            onClick={() => void handleCreateAndLaunch()}
            className="w-full h-12 rounded-xl bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-700 hover:to-indigo-700 disabled:opacity-60 text-white font-extrabold text-sm shadow-sm flex items-center justify-center gap-2 transition"
          >
            <Presentation className="w-4 h-4" />
            {creating ? 'Đang tạo phòng khảo sát...' : 'Tạo phòng & Chiếu Live ngay'}
          </button>
        </div>

        {/* Right: Mentimeter-style Live Split Preview */}
        <div className="xl:col-span-7 rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-100/90 via-white to-indigo-50/40 p-4 sm:p-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-indigo-600" />
              <span className="text-xs font-extrabold text-ink-900">
                Xem trước trực tiếp (Bấm thử ở điện thoại để thấy biểu đồ nhảy)
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setUseSamplePreview((v) => !v)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition ${
                  useSamplePreview
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-white text-ink-700 border-slate-200'
                }`}
              >
                {useSamplePreview ? 'Đang hiện số liệu mẫu' : 'Chỉ hiện vote bạn thử'}
              </button>
              <button
                type="button"
                onClick={() => setPreviewVotes({})}
                className="px-2.5 py-1 rounded-lg text-[11px] font-bold border border-slate-200 bg-white text-ink-600 hover:bg-slate-50"
              >
                Reset thử
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-stretch">
            {/* Student's phone mockup */}
            <div className="md:col-span-5 flex flex-col">
              <div className="text-[11px] font-bold text-ink-500 mb-1.5 flex items-center gap-1 justify-center">
                <Smartphone className="w-3.5 h-3.5" /> Màn hình Sinh viên
              </div>
              <div className="flex-1 rounded-[28px] border-[5px] border-slate-900 bg-white p-3.5 shadow-md flex flex-col justify-between">
                <div className="w-12 h-1 rounded-full bg-slate-200 mx-auto mb-2.5" />
                <div className="flex-1">
                  <PollStudentCard
                    key={`${currentQ.id}_${previewResetKey}`}
                    question={currentQ}
                    compact
                    onSubmit={handlePreviewVoteSubmit}
                  />
                </div>
              </div>
            </div>

            {/* Presenter's screen mockup */}
            <div className="md:col-span-7 flex flex-col">
              <div className="text-[11px] font-bold text-ink-500 mb-1.5 flex items-center gap-1 justify-center">
                <Monitor className="w-3.5 h-3.5" /> Màn hình Chiếu của bạn
              </div>
              <div className="flex-1 rounded-2xl border-2 border-slate-300 bg-white p-4 shadow-md flex flex-col justify-between">
                <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-2.5 mb-3">
                  <div className="min-w-0">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-cyan-600">
                      VNE Quick Poll • PIN 888888
                    </div>
                    <h4 className="text-sm font-black text-ink-900 leading-snug mt-0.5">
                      {currentQ.title || 'Tiêu đề câu hỏi'}
                    </h4>
                  </div>
                  <span className="px-2 py-0.5 rounded-full bg-slate-100 text-[10px] font-mono font-bold text-ink-700 shrink-0">
                    {previewVoteList.length} votes
                  </span>
                </div>
                <div className="flex-1 flex flex-col justify-center">
                  <PollResultChart
                    question={currentQ}
                    questionIndex={activeIdx}
                    aggregation={previewAggregation}
                    totalVotes={previewVoteList.length}
                    hideResults={hideResults}
                    compact
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Created Poll Rooms List */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-extrabold text-ink-900">
            Danh sách phòng Quick Poll của bạn ({myPolls.length})
          </h3>
          <button
            type="button"
            onClick={() => void loadPolls()}
            disabled={loadingList}
            className="text-xs font-bold px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-ink-700 inline-flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingList ? 'animate-spin' : ''}`} />
            Làm mới
          </button>
        </div>

        {myPolls.length === 0 ? (
          <p className="text-xs text-ink-500 py-4 text-center">
            Chưa có phòng khảo sát nào trên thiết bị/tài khoản này. Hãy bấm &ldquo;Tạo phòng &amp; Chiếu Live ngay&rdquo; ở trên!
          </p>
        ) : (
          <div className="divide-y divide-slate-100">
            {myPolls.map((p) => (
              <div
                key={p.id}
                className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-sm text-ink-900 truncate">{p.title}</span>
                    <span className="px-2 py-0.5 rounded-md bg-amber-50 border border-amber-200 font-mono text-xs font-extrabold text-amber-800">
                      PIN: {p.pollPin}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                        p.status === 'ACTIVE'
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {p.status === 'ACTIVE' ? 'Đang mở' : 'Đã kết thúc'}
                    </span>
                  </div>
                  <p className="text-[11px] text-ink-500">
                    {p.totalQuestions} câu hỏi • {p.voterCount} người đã tham gia
                    {p.isAnonymous && ' • Phòng công khai (tự dọn sau 7 ngày)'}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleCopyVoteLink(p.pollPin)}
                    className="text-xs font-bold px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-ink-700 inline-flex items-center gap-1"
                  >
                    {copiedPin === p.pollPin ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-600" /> Đã chép link SV
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" /> Link SV
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate(`/poll/host/${p.id}`)}
                    className="text-xs font-bold px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white inline-flex items-center gap-1.5 shadow-2xs"
                  >
                    <Presentation className="w-3.5 h-3.5" /> Mở màn hình Chiếu
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDeletePoll(p.id)}
                    className="p-1.5 rounded-xl border border-slate-200 text-ink-400 hover:text-rose-600 hover:border-rose-200"
                    title="Xóa phòng"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
