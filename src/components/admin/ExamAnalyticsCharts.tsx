import React, { useMemo, useState } from 'react';
import { BarChart3, Eye, Sparkles } from 'lucide-react';
import type { Exam, ExamAttempt } from '../../types/exam';
import type { ItemAnalysisRow } from '../../utils/dynamicQuestionEngine';
import {
  computeExamAnalytics,
  DEMO_SAMPLE_ANALYTICS,
  DEMO_SAMPLE_ITEMS,
} from '../../utils/examAnalytics';
import { InfoHint } from '../common/InfoHint';

interface ExamAnalyticsChartsProps {
  exam: Exam;
  attempts: ExamAttempt[];
  itemAnalysisRows: ItemAnalysisRow[];
}

export const ExamAnalyticsCharts: React.FC<ExamAnalyticsChartsProps> = ({
  exam,
  attempts,
  itemAnalysisRows,
}) => {
  const realSummary = useMemo(
    () => computeExamAnalytics(exam, attempts),
    [exam, attempts],
  );
  const hasRealData = realSummary.submittedCount > 0;
  const [forceSample, setForceSample] = useState(false);

  const showingSample = !hasRealData || forceSample;
  const data = showingSample ? DEMO_SAMPLE_ANALYTICS : realSummary;
  const itemsForChart = showingSample
    ? DEMO_SAMPLE_ITEMS
    : itemAnalysisRows.length > 0
      ? itemAnalysisRows
      : [];

  const maxBucketCount = Math.max(1, ...data.scoreBuckets.map((b) => b.count));

  // SVG Donut geometry
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const totalTierCount = Math.max(
    1,
    data.gradeTiers.reduce((s, t) => s + t.count, 0),
  );
  let cumulativeOffset = 0;

  const durationCap = Math.max(10, exam.durationMinutes || 45);

  return (
    <div className="space-y-4">
      {/* Banner + Sample Mode Switcher */}
      <div
        className={`rounded-2xl border p-3.5 flex flex-wrap items-center justify-between gap-2.5 text-xs ${
          showingSample
            ? 'bg-amber-50/80 border-amber-200 text-amber-950'
            : 'bg-white border-slate-200 text-ink-800 shadow-2xs'
        }`}
      >
        <div className="flex items-center gap-2 min-w-0">
          {showingSample ? (
            <Sparkles className="w-4 h-4 text-amber-600 shrink-0" />
          ) : (
            <BarChart3 className="w-4 h-4 text-brand-600 shrink-0" />
          )}
          <div>
            <span className="font-extrabold">
              {showingSample
                ? 'Đang xem Biểu đồ Minh họa Mẫu (28 sinh viên)'
                : `Biểu đồ Phân tích Kết quả Thực tế (${data.submittedCount} bài đã nộp)`}
            </span>
            <p className="text-[11px] opacity-80">
              {showingSample
                ? hasRealData
                  ? 'Thầy/cô đang bật chế độ xem mẫu minh họa. Bấm nút bên phải để quay về số liệu thật của ca thi.'
                  : 'Ca thi này chưa có bài nộp thật, hệ thống hiển thị sẵn biểu đồ mẫu để thầy cô dễ hình dung các chỉ số phân tích.'
                : 'Số liệu được tính trực tiếp từ các bài đã nộp của ca thi hiện tại.'}
            </p>
          </div>
        </div>
        {hasRealData && (
          <button
            type="button"
            onClick={() => setForceSample((v) => !v)}
            className="px-3 py-1.5 rounded-xl border border-slate-300 bg-white hover:border-brand-400 text-ink-800 font-bold text-xs flex items-center gap-1.5 shrink-0"
          >
            <Eye className="w-3.5 h-3.5" />
            {forceSample ? 'Xem dữ liệu thật' : 'Xem biểu đồ mẫu'}
          </button>
        )}
      </div>

      {/* 6 KPI Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
        <div className="bg-white rounded-xl border border-slate-200 p-3 shadow-2xs">
          <div className="text-[11px] font-bold text-ink-500">Bài đã nộp</div>
          <div className="text-xl font-mono font-extrabold text-ink-900 mt-0.5">
            {data.submittedCount}
            {data.rosterTotal ? (
              <span className="text-xs font-normal text-ink-400">/{data.rosterTotal}</span>
            ) : null}
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-3 shadow-2xs">
          <div className="text-[11px] font-bold text-ink-500">Điểm TB (Mean)</div>
          <div className="text-xl font-mono font-extrabold text-brand-700 mt-0.5">
            {data.mean.toFixed(2)}
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-3 shadow-2xs">
          <div className="text-[11px] font-bold text-ink-500">Trung vị (Median)</div>
          <div className="text-xl font-mono font-extrabold text-ink-900 mt-0.5">
            {data.median.toFixed(2)}
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-3 shadow-2xs">
          <div className="text-[11px] font-bold text-ink-500">Độ lệch chuẩn</div>
          <div className="text-xl font-mono font-extrabold text-ink-700 mt-0.5">
            {data.stdDev.toFixed(2)}
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-3 shadow-2xs">
          <div className="text-[11px] font-bold text-ink-500">Thấp / Cao nhất</div>
          <div className="text-lg font-mono font-extrabold text-ink-900 mt-0.5">
            {data.min.toFixed(1)} – {data.max.toFixed(1)}
          </div>
        </div>
        <div className="bg-support-50 rounded-xl border border-support-200 p-3 shadow-2xs">
          <div className="text-[11px] font-bold text-support-700">Tỷ lệ Đạt (≥ 5.0)</div>
          <div className="text-xl font-mono font-extrabold text-support-700 mt-0.5">
            {data.passRate.toFixed(1)}%
          </div>
        </div>
      </div>

      {/* Row 1: Score Histogram + Grade Tier Donut */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Chart 1: Score Distribution Histogram */}
        <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 shadow-card p-4 sm:p-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-extrabold text-ink-900 flex items-center gap-1.5">
              <span>1. Phổ điểm bài thi (Thang 10)</span>
              <InfoHint
                title="Biểu đồ Phổ điểm"
                text="Cho biết số lượng sinh viên rơi vào từng khoảng điểm. Phổ điểm đẹp thường tập trung ở khoảng 6.0–8.0 (hình chuông); nếu dồn hết về < 5.0 là đề quá khó hoặc có lỗi câu hỏi."
              />
            </h3>
            <span className="text-[11px] font-mono text-ink-500">
              {data.submittedCount} bài
            </span>
          </div>

          <div className="pt-4 pb-1">
            <div className="h-44 flex items-end justify-between gap-2 border-b border-slate-200 px-1">
              {data.scoreBuckets.map((b) => {
                const heightPct = Math.round((b.count / maxBucketCount) * 100);
                return (
                  <div
                    key={b.label}
                    className="flex-1 flex flex-col items-center justify-end h-full group"
                  >
                    <span className="text-[10px] font-mono font-bold text-ink-700 mb-1">
                      {b.count > 0 ? b.count : ''}
                    </span>
                    <div
                      style={{
                        height: `${b.count > 0 ? Math.max(8, heightPct) : 2}%`,
                        backgroundColor: b.count > 0 ? b.barColor : '#e2e8f0',
                      }}
                      title={`${b.label}: ${b.count} SV (${b.percent}%)`}
                      className="w-full max-w-[38px] rounded-t-lg transition-all duration-300"
                    />
                  </div>
                );
              })}
            </div>
            <div className="flex items-center justify-between gap-2 px-1 pt-2">
              {data.scoreBuckets.map((b) => (
                <div key={b.label} className="flex-1 text-center">
                  <div className="text-[10px] font-mono font-bold text-ink-700">
                    {b.label}
                  </div>
                  <div className="text-[9px] text-ink-400">{b.percent}%</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Chart 2: Grade Tier Donut */}
        <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 shadow-card p-4 sm:p-5 space-y-3">
          <h3 className="text-sm font-extrabold text-ink-900 flex items-center gap-1.5">
            <span>2. Phân loại Kết quả Học lực</span>
            <InfoHint
              title="Tỷ trọng xếp loại"
              text="Tóm tắt tỷ lệ Giỏi/Xuất sắc, Khá, Trung bình và Chưa đạt để giảng viên tổng hợp báo cáo kết quả học phần."
            />
          </h3>

          <div className="flex flex-col sm:flex-row items-center gap-4 pt-1">
            <div className="relative w-32 h-32 shrink-0">
              <svg viewBox="0 0 110 110" className="w-full h-full -rotate-90">
                <circle
                  cx="55"
                  cy="55"
                  r={radius}
                  fill="none"
                  stroke="#f1f5f9"
                  strokeWidth="16"
                />
                {data.gradeTiers.map((tier) => {
                  const segLen = (tier.count / totalTierCount) * circumference;
                  const dashArray = `${segLen} ${circumference - segLen}`;
                  const dashOffset = -cumulativeOffset;
                  cumulativeOffset += segLen;
                  if (tier.count === 0) return null;
                  return (
                    <circle
                      key={tier.label}
                      cx="55"
                      cy="55"
                      r={radius}
                      fill="none"
                      stroke={tier.strokeColor}
                      strokeWidth="16"
                      strokeDasharray={dashArray}
                      strokeDashoffset={dashOffset}
                    />
                  );
                })}
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="text-lg font-mono font-extrabold text-ink-900 leading-none">
                  {data.passRate.toFixed(0)}%
                </span>
                <span className="text-[10px] font-bold text-ink-500 mt-0.5">Đạt</span>
              </div>
            </div>

            <div className="flex-1 w-full space-y-2 text-xs">
              {data.gradeTiers.map((tier) => (
                <div
                  key={tier.label}
                  className="flex items-center justify-between gap-2"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${tier.bgClass}`} />
                    <span className="font-semibold text-ink-800 truncate">
                      {tier.label}
                    </span>
                    <span className="text-[10px] font-mono text-ink-400">
                      ({tier.range})
                    </span>
                  </div>
                  <span className="font-mono font-bold text-ink-900 shrink-0">
                    {tier.count} ({tier.percent}%)
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Row 2: Time-on-Task vs Score + Integrity Correlation */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Chart 3: Time-on-Task */}
        <div className="lg:col-span-6 bg-white rounded-2xl border border-slate-200 shadow-card p-4 sm:p-5 space-y-3">
          <h3 className="text-sm font-extrabold text-ink-900 flex items-center gap-1.5">
            <span>3. Thời gian làm bài vs. Điểm số</span>
            <InfoHint
              title="Phân tích Tốc độ làm bài"
              text="So sánh điểm trung bình giữa nhóm nộp rất nhanh (<30% giờ) và nhóm làm đủ giờ. Nếu nhóm nộp quá nhanh mà điểm cao vọt, cần kiểm tra độ tin cậy."
            />
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            {data.timeBuckets.map((tb) => (
              <div
                key={tb.label}
                className="rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-center space-y-0.5"
              >
                <div className="font-bold text-ink-800">{tb.label}</div>
                <div className="text-[10px] text-ink-500">{tb.subLabel}</div>
                <div className="text-sm font-mono font-extrabold text-brand-700 pt-1">
                  {tb.count > 0 ? `${tb.avgScore.toFixed(2)}đ` : '—'}
                </div>
                <div className="text-[10px] text-ink-500">{tb.count} SV</div>
              </div>
            ))}
          </div>
          {data.timeScatter.length > 0 && (
            <div className="pt-1">
              <svg
                viewBox="0 0 360 115"
                className="w-full h-28 bg-slate-50/70 rounded-xl border border-slate-200"
              >
                {/* Grid */}
                <line x1="34" y1="12" x2="34" y2="95" stroke="#cbd5e1" strokeWidth="1" />
                <line x1="34" y1="95" x2="345" y2="95" stroke="#cbd5e1" strokeWidth="1" />
                <line x1="34" y1="53" x2="345" y2="53" stroke="#e2e8f0" strokeDasharray="3 3" />
                <text x="6" y="16" fontSize="9" fill="#64748b">10đ</text>
                <text x="10" y="56" fontSize="9" fill="#64748b">5đ</text>
                <text x="14" y="96" fontSize="9" fill="#64748b">0đ</text>
                <text x="34" y="108" fontSize="9" fill="#64748b">0p</text>
                <text x="315" y="108" fontSize="9" fill="#64748b">{durationCap}p</text>

                {data.timeScatter.map((pt) => {
                  const x = 38 + Math.min(1, pt.minutes / durationCap) * 300;
                  const y = 92 - Math.min(10, Math.max(0, pt.score)) * 7.8;
                  const color =
                    pt.integrityScore >= 85
                      ? '#10b981'
                      : pt.integrityScore >= 60
                        ? '#f59e0b'
                        : '#ef4444';
                  return (
                    <circle key={`${pt.studentCode}_${pt.minutes}`} cx={x} cy={y} r="4.5" fill={color} opacity="0.85">
                      <title>
                        {pt.studentName} ({pt.studentCode}): {pt.score.toFixed(2)}đ trong {pt.minutes}p • Tin cậy {pt.integrityScore}%
                      </title>
                    </circle>
                  );
                })}
              </svg>
            </div>
          )}
        </div>

        {/* Chart 4: Integrity vs Score */}
        <div className="lg:col-span-6 bg-white rounded-2xl border border-slate-200 shadow-card p-4 sm:p-5 space-y-3">
          <h3 className="text-sm font-extrabold text-ink-900 flex items-center gap-1.5">
            <span>4. Tương quan Độ tin cậy &amp; Điểm số</span>
            <InfoHint
              title="Kiểm chứng Điểm số vs. Rời màn hình"
              text="Chia thí sinh theo mức độ tuân thủ quy chế phòng thi để giảng viên kiểm tra xem nhóm có nhiều vi phạm có đạt điểm cao bất thường hay không."
            />
          </h3>
          <div className="space-y-3 pt-1">
            {data.integrityTiers.map((it) => {
              const pct =
                data.submittedCount > 0
                  ? Math.round((it.count / data.submittedCount) * 100)
                  : 0;
              return (
                <div key={it.label} className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span
                      className={`px-2 py-0.5 rounded-full border text-[11px] font-bold ${it.badgeClass}`}
                    >
                      {it.label}
                    </span>
                    <span className="font-mono text-ink-700 font-bold">
                      {it.count} SV ({pct}%) • TB:{' '}
                      <strong className="text-ink-900">
                        {it.count > 0 ? `${it.avgScore.toFixed(2)}đ` : '—'}
                      </strong>
                    </span>
                  </div>
                  <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      style={{
                        width: `${pct}%`,
                        backgroundColor: it.barColor,
                      }}
                      className="h-full rounded-full transition-all"
                    />
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-[11px] text-ink-500 pt-1">
            Gợi ý: Nếu nhóm <strong>Nghi vấn cao</strong> có điểm TB cao hơn hẳn nhóm <strong>An toàn</strong>, thầy/cô nên mở bảng Giám sát để hậu kiểm.
          </p>
        </div>
      </div>

      {/* Chart 5: Psychometric Item Quadrant (p vs D) */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-card p-4 sm:p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-extrabold text-ink-900 flex items-center gap-1.5">
            <span>5. Biểu đồ Tọa độ Chất lượng Câu hỏi (Độ khó p vs. Độ phân cách D)</span>
            <InfoHint
              title="Bản đồ Câu hỏi Chuẩn Khảo thí"
              text="Vùng xanh lá (Tỷ lệ đúng 25%–90% và Độ phân cách D ≥ 0.2) là vùng câu hỏi phân loại thí sinh tốt. Các chấm đỏ nằm ngoài vùng này cần xem xét chỉnh sửa đề hoặc đáp án."
            />
          </h3>
          <div className="flex flex-wrap items-center gap-3 text-[11px] font-semibold text-ink-600">
            <span className="inline-flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Tốt
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-sky-500" /> Quá dễ
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> Phân hóa kém
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500" /> Cần rà soát
            </span>
          </div>
        </div>

        {itemsForChart.length === 0 ? (
          <p className="text-xs text-ink-500 py-3">
            Chưa đủ dữ liệu câu hỏi để vẽ tọa độ chất lượng.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <svg
              viewBox="0 0 600 190"
              className="w-full min-w-[460px] h-48 bg-slate-50/70 rounded-xl border border-slate-200"
            >
              {/* Ideal zone: p in [25, 90], D >= 0.2 */}
              <rect
                x={45 + 0.25 * 520}
                y={15}
                width={(0.9 - 0.25) * 520}
                height={102}
                fill="#dcfce7"
                opacity="0.55"
              />
              <text
                x={45 + 0.52 * 520}
                y={30}
                fontSize="10"
                fontWeight="bold"
                fill="#15803d"
                textAnchor="middle"
              >
                Vùng câu hỏi chuẩn mực (p: 25–90%, D ≥ 0.20)
              </text>

              {/* Axes */}
              <line x1="45" y1="15" x2="45" y2="160" stroke="#94a3b8" strokeWidth="1" />
              <line x1="45" y1="160" x2="575" y2="160" stroke="#94a3b8" strokeWidth="1" />
              {/* D = 0.2 threshold */}
              <line x1="45" y1="117" x2="575" y2="117" stroke="#64748b" strokeDasharray="4 3" />
              <text x="8" y="22" fontSize="9" fill="#64748b">D=1.0</text>
              <text x="8" y="120" fontSize="9" fill="#64748b">D=0.2</text>
              <text x="8" y="160" fontSize="9" fill="#64748b">D=-0.2</text>
              <text x="45" y="176" fontSize="9" fill="#64748b">0%</text>
              <text x="170" y="176" fontSize="9" fill="#64748b">25% (Khó)</text>
              <text x="505" y="176" fontSize="9" fill="#64748b">90% (Dễ)</text>
              <text x="558" y="176" fontSize="9" fill="#64748b">100%</text>

              {itemsForChart.map((item) => {
                const pRatio = Math.max(0, Math.min(1, item.correctRatePercent / 100));
                const dVal = item.discriminationIndex ?? 0.25;
                const clampedD = Math.max(-0.2, Math.min(1.0, dVal));
                const cx = 45 + pRatio * 520;
                const cy = 160 - ((clampedD + 0.2) / 1.2) * 145;
                const color =
                  item.statusTag === 'Cần rà soát'
                    ? '#ef4444'
                    : item.statusTag === 'Phân hóa kém'
                      ? '#f59e0b'
                      : item.statusTag === 'Quá dễ'
                        ? '#0ea5e9'
                        : '#10b981';
                return (
                  <circle key={item.questionId} cx={cx} cy={cy} r="6" fill={color} stroke="#ffffff" strokeWidth="1.5">
                    <title>
                      {item.content} | Đúng: {item.correctRatePercent}% | Phân cách D: {item.discriminationIndex !== null ? item.discriminationIndex.toFixed(2) : 'N/A'} ({item.statusTag})
                    </title>
                  </circle>
                );
              })}
            </svg>
          </div>
        )}
      </div>
    </div>
  );
};
