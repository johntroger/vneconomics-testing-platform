import type { ChapterMasteryStat, Exam, ExamAttempt, Question } from '../types/exam';

function escapeCsvCell(value: string | number | boolean | undefined): string {
  const str = value === undefined || value === null ? '' : String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function buildExamCsvContent(
  exam: Exam,
  attempts: ExamAttempt[],
  chapterStats: ChapterMasteryStat[],
): string {
  const examAttempts = attempts.filter((a) => a.examId === exam.id);
  if (exam.rosterEntries && exam.rosterEntries.length > 0) {
    const attemptByCode = new Map(
      examAttempts.map((a) => [a.studentCode.trim().toUpperCase(), a]),
    );
    const headers = ['STT', 'Mã sinh viên', 'Họ đệm', 'Tên', 'Giới tính', 'Ngày sinh', 'Điểm'];
    const rows = exam.rosterEntries.map((entry, idx) => {
      const matched = attemptByCode.get(entry.studentCode.trim().toUpperCase());
      const scoreCell = matched ? matched.scale10Score.toFixed(2) : 'Vắng';
      return [
        idx + 1,
        entry.studentCode,
        entry.lastName,
        entry.firstName,
        entry.gender,
        entry.dob,
        scoreCell,
      ];
    });
    const csvLines = [
      headers.map(escapeCsvCell).join(','),
      ...rows.map((r) => r.map(escapeCsvCell).join(',')),
    ];
    return '\uFEFF' + csvLines.join('\r\n');
  }

  const headers = [
    'MSSV',
    'Họ tên',
    'Email',
    'Lớp',
    'Điểm Trắc nghiệm/Số',
    'Điểm Tự luận (Rubric/GV)',
    'Tổng điểm gốc',
    'Điểm Quy đổi Hệ 10',
    'Số lần rời màn hình',
    'Tổng giây vắng mặt',
    'Điểm Tin Cậy (%)',
    'Cờ nghi vấn AI',
    'Trạng thái Bài',
    'Trạng thái Email',
  ];

  const rows = examAttempts.map((a) => [
    a.studentCode,
    a.studentName,
    a.studentEmail,
    a.className,
    a.autoScore,
    a.essayScore,
    `${a.totalScore}/${a.maxTotalScore}`,
    a.scale10Score.toFixed(2),
    a.leaveCount,
    a.totalAwaySeconds,
    `${a.integrityScore}%`,
    a.aiFlag ? `CÓ (${a.aiFlagReason ?? 'Nghi vấn'})` : 'KHÔNG',
    a.status,
    a.emailSentStatus,
  ]);

  const lines = [
    headers.map(escapeCsvCell).join(','),
    ...rows.map((r) => r.map(escapeCsvCell).join(',')),
  ];

  if (chapterStats.length > 0) {
    lines.push('');
    lines.push('THỐNG KÊ NĂNG LỰC THEO CHƯƠNG,Số lượt chấm,Điểm đạt,Điểm tối đa,Tỷ lệ đúng (%)');
    for (const st of chapterStats) {
      lines.push(
        [
          st.chapterCategory,
          st.totalGradedQuestions,
          st.earnedPoints,
          st.maxPoints,
          `${st.masteryPercent}%`,
        ]
          .map(escapeCsvCell)
          .join(','),
      );
    }
  }

  return '\uFEFF' + lines.join('\r\n');
}

export function downloadTextFile(
  filename: string,
  content: string,
  mimeType: string,
): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function exportQuestionBankJson(questions: Question[], courseCode: string): void {
  const payload = JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      courseCode,
      count: questions.length,
      questions,
    },
    null,
    2,
  );
  downloadTextFile(
    `vne_question_bank_${courseCode}_${new Date().toISOString().slice(0, 10)}.json`,
    payload,
    'application/json;charset=utf-8;',
  );
}
