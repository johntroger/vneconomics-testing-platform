import type { Exam, ExamAttempt } from '../types/exam';
import type { ItemAnalysisRow } from './dynamicQuestionEngine';

export interface ScoreBucket {
  label: string;
  count: number;
  percent: number;
  barColor: string;
}

export interface GradeTier {
  label: string;
  range: string;
  count: number;
  percent: number;
  bgClass: string;
  strokeColor: string;
}

export interface TimeOnTaskBucket {
  label: string;
  subLabel: string;
  count: number;
  avgScore: number;
}

export interface TimeScorePoint {
  studentCode: string;
  studentName: string;
  minutes: number;
  score: number;
  integrityScore: number;
}

export interface IntegrityTier {
  label: string;
  count: number;
  avgScore: number;
  barColor: string;
  badgeClass: string;
}

export interface ExamAnalyticsSummary {
  submittedCount: number;
  rosterTotal: number | null;
  mean: number;
  median: number;
  stdDev: number;
  min: number;
  max: number;
  passCount: number;
  passRate: number;
  scoreBuckets: ScoreBucket[];
  gradeTiers: GradeTier[];
  timeBuckets: TimeOnTaskBucket[];
  timeScatter: TimeScorePoint[];
  integrityTiers: IntegrityTier[];
}

export function computeExamAnalytics(
  exam: Exam,
  attempts: ExamAttempt[],
): ExamAnalyticsSummary {
  const graded = attempts.filter(
    (a) =>
      a.examId === exam.id &&
      (a.status === 'SUBMITTED' || a.status === 'AUTO_SUBMITTED'),
  );
  const rosterTotal =
    exam.rosterEntries && exam.rosterEntries.length > 0
      ? exam.rosterEntries.length
      : null;

  const scores = graded.map((a) => a.scale10Score).sort((a, b) => a - b);
  const n = scores.length;

  const mean = n > 0 ? scores.reduce((s, v) => s + v, 0) / n : 0;
  const median =
    n === 0
      ? 0
      : n % 2 === 1
        ? scores[(n - 1) / 2]
        : (scores[n / 2 - 1] + scores[n / 2]) / 2;
  const variance =
    n > 0 ? scores.reduce((s, v) => s + (v - mean) ** 2, 0) / n : 0;
  const stdDev = Math.sqrt(variance);
  const min = n > 0 ? scores[0] : 0;
  const max = n > 0 ? scores[n - 1] : 0;
  const passCount = scores.filter((s) => s >= 5).length;
  const passRate = n > 0 ? (passCount / n) * 100 : 0;

  const bucketDefs = [
    { label: '< 4.0', match: (s: number) => s < 4, barColor: '#ef4444' },
    { label: '4.0–4.9', match: (s: number) => s >= 4 && s < 5, barColor: '#f97316' },
    { label: '5.0–5.9', match: (s: number) => s >= 5 && s < 6, barColor: '#eab308' },
    { label: '6.0–6.9', match: (s: number) => s >= 6 && s < 7, barColor: '#3b82f6' },
    { label: '7.0–7.9', match: (s: number) => s >= 7 && s < 8, barColor: '#2563eb' },
    { label: '8.0–8.9', match: (s: number) => s >= 8 && s < 9, barColor: '#10b981' },
    { label: '9.0–10', match: (s: number) => s >= 9, barColor: '#059669' },
  ];

  const scoreBuckets: ScoreBucket[] = bucketDefs.map((b) => {
    const count = scores.filter(b.match).length;
    return {
      label: b.label,
      count,
      percent: n > 0 ? Math.round((count / n) * 1000) / 10 : 0,
      barColor: b.barColor,
    };
  });

  const tierDefs = [
    {
      label: 'Giỏi / Xuất sắc',
      range: '8.0 – 10',
      match: (s: number) => s >= 8,
      bgClass: 'bg-emerald-500',
      strokeColor: '#10b981',
    },
    {
      label: 'Khá',
      range: '7.0 – 7.9',
      match: (s: number) => s >= 7 && s < 8,
      bgClass: 'bg-blue-500',
      strokeColor: '#3b82f6',
    },
    {
      label: 'Trung bình',
      range: '5.0 – 6.9',
      match: (s: number) => s >= 5 && s < 7,
      bgClass: 'bg-amber-500',
      strokeColor: '#f59e0b',
    },
    {
      label: 'Chưa đạt',
      range: '< 5.0',
      match: (s: number) => s < 5,
      bgClass: 'bg-rose-500',
      strokeColor: '#ef4444',
    },
  ];

  const gradeTiers: GradeTier[] = tierDefs.map((t) => {
    const count = scores.filter(t.match).length;
    return {
      label: t.label,
      range: t.range,
      count,
      percent: n > 0 ? Math.round((count / n) * 1000) / 10 : 0,
      bgClass: t.bgClass,
      strokeColor: t.strokeColor,
    };
  });

  const durationMin = Math.max(1, exam.durationMinutes);
  const timeScatter: TimeScorePoint[] = graded.map((a) => {
    const startMs = new Date(a.startedAt).getTime();
    const endMs = a.submittedAt ? new Date(a.submittedAt).getTime() : startMs;
    const mins = Math.max(
      0.5,
      Math.min(durationMin * 1.2, Math.round(((endMs - startMs) / 60000) * 10) / 10),
    );
    return {
      studentCode: a.studentCode,
      studentName: a.studentName,
      minutes: Number.isFinite(mins) ? mins : durationMin * 0.5,
      score: a.scale10Score,
      integrityScore: a.integrityScore,
    };
  });

  const timeBucketDefs = [
    { label: 'Rất nhanh', subLabel: '< 30% giờ', match: (r: number) => r < 0.3 },
    { label: 'Nhanh', subLabel: '30–60% giờ', match: (r: number) => r >= 0.3 && r < 0.6 },
    { label: 'Tiêu chuẩn', subLabel: '60–90% giờ', match: (r: number) => r >= 0.6 && r < 0.9 },
    { label: 'Sát giờ', subLabel: '≥ 90% giờ', match: (r: number) => r >= 0.9 },
  ];

  const timeBuckets: TimeOnTaskBucket[] = timeBucketDefs.map((tb) => {
    const items = timeScatter.filter((pt) => tb.match(pt.minutes / durationMin));
    const avg =
      items.length > 0
        ? Math.round((items.reduce((s, p) => s + p.score, 0) / items.length) * 100) / 100
        : 0;
    return {
      label: tb.label,
      subLabel: tb.subLabel,
      count: items.length,
      avgScore: avg,
    };
  });

  const integrityDefs = [
    {
      label: 'An toàn (≥ 85%)',
      match: (a: ExamAttempt) => !a.aiFlag && a.integrityScore >= 85,
      barColor: '#10b981',
      badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    },
    {
      label: 'Cần lưu ý (60–84%)',
      match: (a: ExamAttempt) => !a.aiFlag && a.integrityScore >= 60 && a.integrityScore < 85,
      barColor: '#f59e0b',
      badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
    },
    {
      label: 'Nghi vấn cao (< 60% / Cờ AI)',
      match: (a: ExamAttempt) => a.aiFlag || a.integrityScore < 60,
      barColor: '#ef4444',
      badgeClass: 'bg-rose-50 text-rose-700 border-rose-200',
    },
  ];

  const integrityTiers: IntegrityTier[] = integrityDefs.map((it) => {
    const items = graded.filter(it.match);
    const avg =
      items.length > 0
        ? Math.round(
            (items.reduce((s, a) => s + a.scale10Score, 0) / items.length) * 100,
          ) / 100
        : 0;
    return {
      label: it.label,
      count: items.length,
      avgScore: avg,
      barColor: it.barColor,
      badgeClass: it.badgeClass,
    };
  });

  return {
    submittedCount: n,
    rosterTotal,
    mean: Math.round(mean * 100) / 100,
    median: Math.round(median * 100) / 100,
    stdDev: Math.round(stdDev * 100) / 100,
    min: Math.round(min * 100) / 100,
    max: Math.round(max * 100) / 100,
    passCount,
    passRate: Math.round(passRate * 10) / 10,
    scoreBuckets,
    gradeTiers,
    timeBuckets,
    timeScatter,
    integrityTiers,
  };
}

export const DEMO_SAMPLE_ANALYTICS: ExamAnalyticsSummary = {
  submittedCount: 28,
  rosterTotal: 30,
  mean: 6.96,
  median: 7.25,
  stdDev: 1.54,
  min: 3.25,
  max: 9.5,
  passCount: 24,
  passRate: 85.7,
  scoreBuckets: [
    { label: '< 4.0', count: 2, percent: 7.1, barColor: '#ef4444' },
    { label: '4.0–4.9', count: 2, percent: 7.1, barColor: '#f97316' },
    { label: '5.0–5.9', count: 4, percent: 14.3, barColor: '#eab308' },
    { label: '6.0–6.9', count: 5, percent: 17.9, barColor: '#3b82f6' },
    { label: '7.0–7.9', count: 7, percent: 25.0, barColor: '#2563eb' },
    { label: '8.0–8.9', count: 5, percent: 17.9, barColor: '#10b981' },
    { label: '9.0–10', count: 3, percent: 10.7, barColor: '#059669' },
  ],
  gradeTiers: [
    {
      label: 'Giỏi / Xuất sắc',
      range: '8.0 – 10',
      count: 8,
      percent: 28.6,
      bgClass: 'bg-emerald-500',
      strokeColor: '#10b981',
    },
    {
      label: 'Khá',
      range: '7.0 – 7.9',
      count: 7,
      percent: 25.0,
      bgClass: 'bg-blue-500',
      strokeColor: '#3b82f6',
    },
    {
      label: 'Trung bình',
      range: '5.0 – 6.9',
      count: 9,
      percent: 32.1,
      bgClass: 'bg-amber-500',
      strokeColor: '#f59e0b',
    },
    {
      label: 'Chưa đạt',
      range: '< 5.0',
      count: 4,
      percent: 14.3,
      bgClass: 'bg-rose-500',
      strokeColor: '#ef4444',
    },
  ],
  timeBuckets: [
    { label: 'Rất nhanh', subLabel: '< 30% giờ', count: 3, avgScore: 5.17 },
    { label: 'Nhanh', subLabel: '30–60% giờ', count: 8, avgScore: 7.41 },
    { label: 'Tiêu chuẩn', subLabel: '60–90% giờ', count: 13, avgScore: 7.38 },
    { label: 'Sát giờ', subLabel: '≥ 90% giờ', count: 4, avgScore: 6.06 },
  ],
  timeScatter: [
    { studentCode: '3122101', studentName: 'Nguyễn Minh Anh', minutes: 12, score: 4.0, integrityScore: 95 },
    { studentCode: '3122102', studentName: 'Trần Gia Bảo', minutes: 24, score: 7.5, integrityScore: 100 },
    { studentCode: '3122103', studentName: 'Lê Thu Hà', minutes: 31, score: 8.75, integrityScore: 98 },
    { studentCode: '3122104', studentName: 'Phạm Quốc Huy', minutes: 38, score: 6.5, integrityScore: 76 },
    { studentCode: '3122105', studentName: 'Võ Thảo Vy', minutes: 29, score: 9.25, integrityScore: 100 },
    { studentCode: '3122106', studentName: 'Đặng Tuấn Kiệt', minutes: 15, score: 8.5, integrityScore: 48 },
    { studentCode: '3122107', studentName: 'Bùi Ngọc Linh', minutes: 42, score: 5.5, integrityScore: 92 },
  ],
  integrityTiers: [
    {
      label: 'An toàn (≥ 85%)',
      count: 21,
      avgScore: 7.21,
      barColor: '#10b981',
      badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    },
    {
      label: 'Cần lưu ý (60–84%)',
      count: 5,
      avgScore: 6.1,
      barColor: '#f59e0b',
      badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
    },
    {
      label: 'Nghi vấn cao (< 60% / Cờ AI)',
      count: 2,
      avgScore: 6.5,
      barColor: '#ef4444',
      badgeClass: 'bg-rose-50 text-rose-700 border-rose-200',
    },
  ],
};

export const DEMO_SAMPLE_ITEMS: ItemAnalysisRow[] = [
  {
    questionId: 'sample_q1',
    content: 'Câu mẫu 1: Xác định điểm cân bằng thị trường khi cung dịch chuyển sang phải...',
    chapterCategory: 'Chương 1: Cung - Cầu',
    type: 'SINGLE_CHOICE',
    attemptCount: 28,
    correctRatePercent: 78.6,
    discriminationIndex: 0.42,
    statusTag: 'Tốt',
  },
  {
    questionId: 'sample_q2',
    content: 'Câu mẫu 2: Tính hệ số co giãn của cầu theo giá tại mức giá P = 20...',
    chapterCategory: 'Chương 2: Độ co giãn',
    type: 'NUMERICAL',
    attemptCount: 28,
    correctRatePercent: 53.6,
    discriminationIndex: 0.51,
    statusTag: 'Tốt',
  },
  {
    questionId: 'sample_q3',
    content: 'Câu mẫu 3: Phân biệt chi phí biên (MC) và chi phí trung bình (ATC) trong ngắn hạn...',
    chapterCategory: 'Chương 3: Sản xuất & Chi phí',
    type: 'SINGLE_CHOICE',
    attemptCount: 28,
    correctRatePercent: 21.4,
    discriminationIndex: 0.12,
    statusTag: 'Cần rà soát',
  },
  {
    questionId: 'sample_q4',
    content: 'Câu mẫu 4: Khái niệm hàng hóa thông thường và hàng hóa thứ cấp...',
    chapterCategory: 'Chương 1: Cung - Cầu',
    type: 'TRUE_FALSE',
    attemptCount: 28,
    correctRatePercent: 92.9,
    discriminationIndex: 0.18,
    statusTag: 'Quá dễ',
  },
  {
    questionId: 'sample_q5',
    content: 'Câu mẫu 5: Giải thích ngắn tác động của giá trần đến thặng dư tiêu dùng...',
    chapterCategory: 'Chương 4: Chính sách giá',
    type: 'ESSAY',
    attemptCount: 28,
    correctRatePercent: 64.3,
    discriminationIndex: 0.36,
    statusTag: 'Tốt',
  },
];
