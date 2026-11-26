import React, { useMemo } from 'react';
import { Eye, EyeOff, Pin, Sparkles, Trophy } from 'lucide-react';
import {
  POLL_COLORS,
  type PollAggregation,
  type PollQuestion,
} from '../../types/poll';

interface PollResultChartProps {
  question: PollQuestion;
  questionIndex?: number;
  aggregation: PollAggregation;
  totalVotes: number;
  hideResults?: boolean;
  isHost?: boolean;
  compact?: boolean;
  onToggleHideItem?: (key: string) => void;
  onTogglePinItem?: (key: string) => void;
}

export const PollResultChart: React.FC<PollResultChartProps> = ({
  question,
  questionIndex = 0,
  aggregation,
  totalVotes,
  hideResults = false,
  isHost = false,
  compact = false,
  onToggleHideItem,
  onTogglePinItem,
}) => {
  const options = question.options ?? [];

  const optionStats = useMemo(() => {
    const counts = aggregation.optionCounts ?? {};
    const totalSelections = options.reduce((sum, o) => sum + (counts[o.id] ?? 0), 0);
    const maxCount = Math.max(1, ...options.map((o) => counts[o.id] ?? 0));
    return {
      totalSelections,
      maxCount,
      rows: options.map((opt, idx) => {
        const count = counts[opt.id] ?? 0;
        const pct = totalSelections > 0 ? Math.round((count / totalSelections) * 100) : 0;
        const color = opt.color || POLL_COLORS[idx % POLL_COLORS.length];
        return { opt, count, pct, color, idx };
      }),
    };
  }, [options, aggregation.optionCounts]);

  if (hideResults) {
    return (
      <div
        className={`flex flex-col items-center justify-center text-center rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/70 ${
          compact ? 'py-8 px-4' : 'py-16 px-6'
        }`}
      >
        <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mb-3">
          <EyeOff className="w-6 h-6" />
        </div>
        <p className={`${compact ? 'text-sm' : 'text-lg'} font-extrabold text-ink-900`}>
          Kết quả đang được tạm ẩn
        </p>
        <p className={`${compact ? 'text-[11px]' : 'text-sm'} text-ink-500 mt-1`}>
          Đã ghi nhận <span className="font-mono font-bold text-indigo-600">{totalVotes}</span> lượt phản hồi — bấm Hiện kết quả để công bố.
        </p>
      </div>
    );
  }

  // 1. MULTIPLE CHOICE (4 chart modes)
  if (question.type === 'MULTIPLE_CHOICE') {
    const chartType = question.chartType ?? 'BAR';

    if (chartType === 'BAR') {
      const barMaxH = compact ? 130 : 260;
      return (
        <div className="w-full">
          <div
            className={`grid gap-3 sm:gap-5 items-end pt-6 pb-2`}
            style={{
              gridTemplateColumns: `repeat(${Math.max(1, optionStats.rows.length)}, minmax(0, 1fr))`,
            }}
          >
            {optionStats.rows.map(({ opt, count, pct, color }) => {
              const heightPx =
                totalVotes === 0 || count === 0
                  ? 8
                  : Math.max(20, Math.round((count / optionStats.maxCount) * barMaxH));
              return (
                <div key={opt.id} className="flex flex-col items-center min-w-0">
                  <div className="mb-1.5 text-center">
                    <span
                      className={`font-mono font-black text-ink-900 ${
                        compact ? 'text-sm' : 'text-xl sm:text-2xl'
                      }`}
                    >
                      {count}
                    </span>
                    <span
                      className={`block font-semibold text-ink-400 ${
                        compact ? 'text-[10px]' : 'text-xs'
                      }`}
                    >
                      {pct}%
                    </span>
                  </div>
                  <div
                    className="w-full flex items-end justify-center"
                    style={{ height: `${barMaxH}px` }}
                  >
                    <div
                      className="w-full max-w-[110px] rounded-t-xl transition-all duration-500 ease-out shadow-sm"
                      style={{
                        height: `${heightPx}px`,
                        backgroundColor: color,
                        opacity: count === 0 ? 0.35 : 1,
                      }}
                    />
                  </div>
                  <div
                    className="w-full h-1 rounded-full mt-0.5 mb-2"
                    style={{ backgroundColor: color }}
                  />
                  <p
                    className={`text-center font-bold text-ink-800 leading-snug break-words w-full px-1 ${
                      compact ? 'text-[11px] line-clamp-2' : 'text-xs sm:text-sm'
                    }`}
                  >
                    {opt.text}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      );
    }

    if (chartType === 'HORIZONTAL_BAR') {
      return (
        <div className={compact ? 'space-y-2.5' : 'space-y-4'}>
          {optionStats.rows.map(({ opt, count, pct, color }) => {
            const widthPct =
              optionStats.totalSelections > 0
                ? Math.max(count > 0 ? 6 : 0, Math.round((count / optionStats.maxCount) * 100))
                : 0;
            return (
              <div key={opt.id} className="space-y-1">
                <div className="flex items-baseline justify-between gap-3">
                  <span
                    className={`font-bold text-ink-800 ${
                      compact ? 'text-xs' : 'text-sm sm:text-base'
                    }`}
                  >
                    {opt.text}
                  </span>
                  <span
                    className={`font-mono font-extrabold text-ink-900 shrink-0 ${
                      compact ? 'text-xs' : 'text-sm sm:text-base'
                    }`}
                  >
                    {count}{' '}
                    <span className="text-ink-400 font-semibold">({pct}%)</span>
                  </span>
                </div>
                <div
                  className={`w-full rounded-xl bg-slate-100 overflow-hidden ${
                    compact ? 'h-6' : 'h-10'
                  }`}
                >
                  <div
                    className="h-full rounded-xl transition-all duration-500 ease-out flex items-center justify-end pr-2.5"
                    style={{
                      width: `${widthPct}%`,
                      backgroundColor: color,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      );
    }

    if (chartType === 'DONUT') {
      const size = compact ? 150 : 240;
      const strokeWidth = compact ? 26 : 38;
      const radius = (size - strokeWidth) / 2;
      const circumference = 2 * Math.PI * radius;
      let offsetAcc = 0;

      return (
        <div className="flex flex-col sm:flex-row items-center justify-center gap-6 sm:gap-10 py-2">
          <div className="relative shrink-0" style={{ width: size, height: size }}>
            <svg width={size} height={size} className="-rotate-90">
              <circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke="#F1F5F9"
                strokeWidth={strokeWidth}
              />
              {optionStats.totalSelections > 0 &&
                optionStats.rows.map(({ opt, count, color }) => {
                  if (count === 0) return null;
                  const segLen = (count / optionStats.totalSelections) * circumference;
                  const dashArray = `${segLen} ${Math.max(0, circumference - segLen)}`;
                  const dashOffset = -offsetAcc;
                  offsetAcc += segLen;
                  return (
                    <circle
                      key={opt.id}
                      cx={size / 2}
                      cy={size / 2}
                      r={radius}
                      fill="none"
                      stroke={color}
                      strokeWidth={strokeWidth}
                      strokeDasharray={dashArray}
                      strokeDashoffset={dashOffset}
                      className="transition-all duration-500 ease-out"
                    />
                  );
                })}
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
              <span
                className={`font-mono font-black text-ink-900 ${
                  compact ? 'text-xl' : 'text-3xl sm:text-4xl'
                }`}
              >
                {totalVotes}
              </span>
              <span className="text-[11px] font-semibold text-ink-400 uppercase tracking-wider">
                Lượt chọn
              </span>
            </div>
          </div>

          <div className="flex-1 w-full max-w-md space-y-2">
            {optionStats.rows.map(({ opt, count, pct, color }) => (
              <div
                key={opt.id}
                className="flex items-center justify-between gap-3 px-3 py-2 rounded-xl bg-slate-50 border border-slate-100"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span
                    className="w-3.5 h-3.5 rounded-full shrink-0"
                    style={{ backgroundColor: color }}
                  />
                  <span
                    className={`font-bold text-ink-800 truncate ${
                      compact ? 'text-xs' : 'text-sm'
                    }`}
                  >
                    {opt.text}
                  </span>
                </div>
                <span className="font-mono font-extrabold text-ink-900 text-xs sm:text-sm shrink-0">
                  {count} ({pct}%)
                </span>
              </div>
            ))}
          </div>
        </div>
      );
    }

    // DOTS
    const maxDots = compact ? 36 : 80;
    return (
      <div
        className="grid gap-4 items-end pt-3"
        style={{
          gridTemplateColumns: `repeat(${Math.max(1, optionStats.rows.length)}, minmax(0, 1fr))`,
        }}
      >
        {optionStats.rows.map(({ opt, count, pct, color }) => {
          const shownDots = Math.min(count, maxDots);
          const overflow = count - shownDots;
          return (
            <div
              key={opt.id}
              className="flex flex-col items-center justify-end rounded-2xl bg-slate-50/80 border border-slate-200/70 p-3 min-h-[150px]"
            >
              <div className="flex flex-wrap-reverse justify-center gap-1.5 mb-3 max-w-[140px]">
                {Array.from({ length: shownDots }).map((_, i) => (
                  <span
                    key={i}
                    className={`rounded-full transition-transform duration-300 ${
                      compact ? 'w-2.5 h-2.5' : 'w-3.5 h-3.5'
                    }`}
                    style={{ backgroundColor: color }}
                  />
                ))}
                {overflow > 0 && (
                  <span className="text-[11px] font-mono font-bold px-1.5 py-0.5 rounded-full bg-white border border-slate-200 text-ink-700">
                    +{overflow}
                  </span>
                )}
                {count === 0 && (
                  <span className="text-[11px] text-ink-400 italic">0</span>
                )}
              </div>
              <div className="w-full border-t border-slate-200 pt-2 text-center">
                <div className="font-mono font-black text-ink-900 text-sm sm:text-base">
                  {count}{' '}
                  <span className="text-xs font-semibold text-ink-400">({pct}%)</span>
                </div>
                <p
                  className={`font-bold text-ink-800 mt-0.5 leading-snug ${
                    compact ? 'text-[11px]' : 'text-xs sm:text-sm'
                  }`}
                >
                  {opt.text}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // 2. WORD CLOUD
  if (question.type === 'WORD_CLOUD') {
    const words = aggregation.wordCounts ?? [];
    if (words.length === 0) {
      return (
        <div className="py-12 text-center text-ink-400 text-sm">
          <Sparkles className="w-8 h-8 mx-auto mb-2 text-indigo-300" />
          Chờ sinh viên gửi từ khóa để tạo Đám mây từ...
        </div>
      );
    }
    const maxCount = Math.max(1, ...words.map((w) => w.count));
    const minCount = Math.min(...words.map((w) => w.count));
    const minSize = compact ? 13 : 16;
    const maxSize = compact ? 30 : 54;

    return (
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2.5 py-4 px-2">
        {words.map((item, idx) => {
          const ratio =
            maxCount === minCount ? 0.6 : (item.count - minCount) / (maxCount - minCount);
          const fontSize = Math.round(minSize + ratio * (maxSize - minSize));
          const color = POLL_COLORS[idx % POLL_COLORS.length];
          const hideKey = `word:${questionIndex}:${item.norm}`;
          return (
            <span
              key={item.norm}
              className={`group relative inline-flex items-center gap-1 font-black leading-none transition-all duration-300 select-none ${
                item.hidden ? 'opacity-30 line-through' : ''
              }`}
              style={{
                fontSize: `${fontSize}px`,
                color,
              }}
              title={`${item.word}: ${item.count} lượt`}
            >
              {item.word}
              {item.count > 1 && (
                <sup className="text-[11px] font-mono font-bold text-ink-400 ml-0.5">
                  {item.count}
                </sup>
              )}
              {isHost && onToggleHideItem && (
                <button
                  type="button"
                  onClick={() => onToggleHideItem(hideKey)}
                  className="opacity-0 group-hover:opacity-100 transition ml-1 p-1 rounded-full bg-white border border-slate-200 text-ink-600 hover:text-rose-600 shadow-xs"
                  title={item.hidden ? 'Hiện lại từ này' : 'Ẩn từ này khỏi màn hình chiếu'}
                >
                  {item.hidden ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                </button>
              )}
            </span>
          );
        })}
      </div>
    );
  }

  // 3. OPEN ENDED
  if (question.type === 'OPEN_ENDED') {
    const responses = aggregation.openResponses ?? [];
    if (responses.length === 0) {
      return (
        <div className="py-12 text-center text-ink-400 text-sm">
          Chờ sinh viên gửi ý kiến phản hồi...
        </div>
      );
    }
    const isFlow = question.openEndedLayout === 'FLOW';
    return (
      <div
        className={
          isFlow
            ? 'space-y-2.5 max-h-[380px] overflow-y-auto pr-1'
            : `grid gap-3 ${compact ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'}`
        }
      >
        {responses.map((resp, idx) => {
          const accent = POLL_COLORS[idx % POLL_COLORS.length];
          return (
            <div
              key={resp.id}
              className={`rounded-2xl border p-3.5 transition-all ${
                resp.hidden
                  ? 'opacity-40 bg-slate-50 border-dashed border-slate-300'
                  : resp.pinned
                    ? 'bg-amber-50/90 border-amber-300 shadow-sm ring-1 ring-amber-200'
                    : 'bg-white border-slate-200 shadow-2xs'
              }`}
              style={{ borderLeftWidth: 4, borderLeftColor: resp.pinned ? '#F59E0B' : accent }}
            >
              <div className="flex items-start justify-between gap-2">
                <p
                  className={`font-semibold text-ink-800 leading-relaxed break-words ${
                    compact ? 'text-xs' : 'text-sm sm:text-base'
                  }`}
                >
                  {resp.text}
                </p>
                {isHost && (
                  <div className="flex items-center gap-1 shrink-0">
                    {onTogglePinItem && (
                      <button
                        type="button"
                        onClick={() => onTogglePinItem(`resp:${resp.id}`)}
                        className={`p-1.5 rounded-lg border transition ${
                          resp.pinned
                            ? 'bg-amber-500 text-white border-amber-500'
                            : 'bg-slate-50 text-ink-500 border-slate-200 hover:text-amber-600'
                        }`}
                        title={resp.pinned ? 'Bỏ ghim' : 'Ghim nổi bật'}
                      >
                        <Pin className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {onToggleHideItem && (
                      <button
                        type="button"
                        onClick={() => onToggleHideItem(`resp:${resp.id}`)}
                        className="p-1.5 rounded-lg border bg-slate-50 text-ink-500 border-slate-200 hover:text-rose-600 transition"
                        title={resp.hidden ? 'Hiện lại' : 'Ẩn khỏi màn hình chiếu'}
                      >
                        {resp.hidden ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // 4. SCALES / LIKERT
  if (question.type === 'SCALES') {
    const min = question.scaleMin ?? 1;
    const max = question.scaleMax ?? 5;
    const steps: number[] = [];
    for (let v = min; v <= max; v += 1) steps.push(v);
    const statements = question.scaleStatements ?? [];

    return (
      <div className={compact ? 'space-y-3' : 'space-y-5'}>
        <div className="flex items-center justify-between text-[11px] font-bold text-ink-500 px-1">
          <span>
            {min}: {question.scaleMinLabel || 'Thấp nhất'}
          </span>
          <span>
            {max}: {question.scaleMaxLabel || 'Cao nhất'}
          </span>
        </div>
        {statements.map((st, idx) => {
          const stat = aggregation.scaleStats?.[st.id] ?? {
            avg: 0,
            count: 0,
            distribution: {},
          };
          const color = POLL_COLORS[idx % POLL_COLORS.length];
          const avgPosPct =
            stat.count > 0 && max > min
              ? Math.max(0, Math.min(100, ((stat.avg - min) / (max - min)) * 100))
              : 0;
          const maxBin = Math.max(
            1,
            ...steps.map((v) => stat.distribution[String(v)] ?? 0),
          );

          return (
            <div
              key={st.id}
              className="rounded-2xl bg-slate-50/90 border border-slate-200 p-3.5 space-y-2.5"
            >
              <div className="flex items-center justify-between gap-3">
                <span
                  className={`font-bold text-ink-900 ${
                    compact ? 'text-xs' : 'text-sm sm:text-base'
                  }`}
                >
                  {st.text}
                </span>
                <span
                  className="font-mono font-black px-2.5 py-1 rounded-xl text-white text-xs sm:text-sm shrink-0 shadow-xs"
                  style={{ backgroundColor: color }}
                >
                  TB: {stat.count > 0 ? stat.avg.toFixed(1) : '—'} / {max}
                </span>
              </div>

              <div className="relative pt-2 pb-1">
                <div className="h-2 rounded-full bg-slate-200 w-full relative overflow-hidden">
                  {stat.count > 0 && (
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${avgPosPct}%`, backgroundColor: color }}
                    />
                  )}
                </div>
                <div
                  className="grid gap-1 mt-2"
                  style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}
                >
                  {steps.map((v) => {
                    const cnt = stat.distribution[String(v)] ?? 0;
                    const intensity = cnt > 0 ? 0.25 + (cnt / maxBin) * 0.75 : 0;
                    return (
                      <div key={v} className="flex flex-col items-center gap-0.5">
                        <div
                          className="w-7 h-7 rounded-full flex items-center justify-center font-mono text-[11px] font-bold border transition-all"
                          style={{
                            backgroundColor: cnt > 0 ? color : '#FFFFFF',
                            borderColor: cnt > 0 ? color : '#E2E8F0',
                            color: cnt > 0 ? '#FFFFFF' : '#64748B',
                            opacity: cnt > 0 ? intensity : 0.8,
                          }}
                        >
                          {cnt > 0 ? cnt : ''}
                        </div>
                        <span className="text-[10px] font-mono font-bold text-ink-500">{v}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // 5. RANKING
  const rankingRows = aggregation.rankingStats ?? [];
  const maxScore = Math.max(1, ...rankingRows.map((r) => r.score));
  return (
    <div className={compact ? 'space-y-2.5' : 'space-y-3.5'}>
      {rankingRows.map((row, idx) => {
        const color = row.color || POLL_COLORS[idx % POLL_COLORS.length];
        const widthPct = row.score > 0 ? Math.max(8, Math.round((row.score / maxScore) * 100)) : 0;
        return (
          <div
            key={row.optionId}
            className="rounded-2xl bg-slate-50 border border-slate-200 p-3 space-y-1.5"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <span
                  className="w-7 h-7 rounded-xl font-mono font-black text-xs text-white flex items-center justify-center shrink-0"
                  style={{ backgroundColor: idx === 0 && row.score > 0 ? '#F59E0B' : color }}
                >
                  {idx === 0 && row.score > 0 ? (
                    <Trophy className="w-3.5 h-3.5" />
                  ) : (
                    `#${idx + 1}`
                  )}
                </span>
                <span
                  className={`font-bold text-ink-900 truncate ${
                    compact ? 'text-xs' : 'text-sm sm:text-base'
                  }`}
                >
                  {row.text}
                </span>
              </div>
              <span className="font-mono text-xs font-bold text-ink-600 shrink-0">
                {row.score} điểm
                {row.avgRank > 0 && (
                  <span className="text-ink-400 font-normal"> • TB #{row.avgRank}</span>
                )}
              </span>
            </div>
            <div className="w-full h-3 rounded-full bg-slate-200 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500 ease-out"
                style={{ width: `${widthPct}%`, backgroundColor: color }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
};
