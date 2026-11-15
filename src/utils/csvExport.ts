import * as XLSX from 'xlsx';
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

export function exportExamGradebookXlsx(
  exam: Exam,
  attempts: ExamAttempt[],
  chapterStats: ChapterMasteryStat[],
): void {
  const examAttempts = attempts.filter((a) => a.examId === exam.id);
  const wb = XLSX.utils.book_new();

  if (exam.rosterEntries && exam.rosterEntries.length > 0) {
    const attemptByCode = new Map(
      examAttempts.map((a) => [a.studentCode.trim().toUpperCase(), a]),
    );
    const sheetRows = exam.rosterEntries.map((entry, idx) => {
      const m = attemptByCode.get(entry.studentCode.trim().toUpperCase());
      return {
        STT: idx + 1,
        'Mã sinh viên': entry.studentCode,
        'Họ đệm': entry.lastName,
        Tên: entry.firstName,
        'Giới tính': entry.gender,
        'Ngày sinh': entry.dob,
        'Điểm hệ 10': m ? Number(m.scale10Score.toFixed(2)) : 'Vắng',
        'Điểm Trắc nghiệm': m ? m.autoScore : '',
        'Điểm Tự luận': m ? m.essayScore : '',
        'Rời màn hình (lần)': m ? m.leaveCount : '',
        'Tin cậy (%)': m ? m.integrityScore : '',
        'Trạng thái': m ? m.status : 'Vắng thi',
      };
    });
    const ws = XLSX.utils.json_to_sheet(sheetRows);
    XLSX.utils.book_append_sheet(wb, ws, 'BangDiem');
  } else {
    const sheetRows = examAttempts.map((a, idx) => ({
      STT: idx + 1,
      MSSV: a.studentCode,
      'Họ tên': a.studentName,
      Email: a.studentEmail,
      Lớp: a.className,
      'Điểm Trắc nghiệm': a.autoScore,
      'Điểm Tự luận': a.essayScore,
      'Điểm gốc': `${a.totalScore}/${a.maxTotalScore}`,
      'Điểm hệ 10': Number(a.scale10Score.toFixed(2)),
      'Rời màn hình (lần)': a.leaveCount,
      'Vắng mặt (giây)': a.totalAwaySeconds,
      'Tin cậy (%)': a.integrityScore,
      'Nghi vấn AI': a.aiFlag ? `CÓ (${a.aiFlagReason ?? ''})` : 'KHÔNG',
      'Trạng thái': a.status,
    }));
    const ws = XLSX.utils.json_to_sheet(sheetRows);
    XLSX.utils.book_append_sheet(wb, ws, 'BangDiem');
  }

  if (chapterStats.length > 0) {
    const chRows = chapterStats.map((st) => ({
      'Chương / Chuyên đề': st.chapterCategory,
      'Số lượt chấm': st.totalGradedQuestions,
      'Điểm đạt': st.earnedPoints,
      'Điểm tối đa': st.maxPoints,
      'Tỷ lệ đúng (%)': st.masteryPercent,
    }));
    const wsCh = XLSX.utils.json_to_sheet(chRows);
    XLSX.utils.book_append_sheet(wb, wsCh, 'ThongKeChuong');
  }

  XLSX.writeFile(wb, `VNE_BangDiem_${exam.roomPin}.xlsx`);
}
