import type {
  AttemptAnswer,
  ChapterMasteryStat,
  Exam,
  ExamAttempt,
  Question,
} from '../types/exam';

const CSV_FORMULA_TRIGGER_RE = /^[=+\-@\t\r]/;
const CSV_PLAIN_NUMBER_RE = /^[+-]?\d+(?:[.,]\d+)?$/;

function escapeCsvCell(value: string | number | boolean | undefined): string {
  let str = value === undefined || value === null ? '' : String(value);
  if (str !== '' && CSV_FORMULA_TRIGGER_RE.test(str) && !CSV_PLAIN_NUMBER_RE.test(str)) {
    str = `'${str}`;
  }
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function formatStudentAnswerForReport(
  ans?: AttemptAnswer,
  question?: Question,
): string {
  if (!ans) return 'Chưa trả lời';
  const p = ans.answerPayload;
  if (p === undefined || p === null) return 'Chưa trả lời';

  if (Array.isArray(p)) {
    if (p.length === 0) return 'Chưa trả lời';
    if (question?.type === 'MULTI_CHOICE' && question.options) {
      const labels = p
        .map((oid) => String(oid).trim())
        .filter(Boolean)
        .map((oid) => question.options?.find((o) => o.id === oid)?.text ?? oid);
      return labels.length > 0 ? labels.join(' ; ') : 'Chưa trả lời';
    }
    const hasNonEmpty = p.some((x) => String(x).trim() !== '');
    return hasNonEmpty
      ? p.map((x, bi) => `Ô #${bi + 1}: ${String(x).trim() || '(trống)'}`).join(' | ')
      : 'Chưa trả lời';
  }

  if (typeof p === 'object') {
    const map = p as Record<string, boolean>;
    if (question?.type === 'TRUE_FALSE' && question.trueFalseItems && question.trueFalseItems.length > 0) {
      let hasAny = false;
      const parts = question.trueFalseItems.map((it, i) => {
        const letter = String.fromCharCode(97 + (i % 26));
        if (Object.prototype.hasOwnProperty.call(map, it.id)) {
          hasAny = true;
          return `${letter}) ${map[it.id] ? 'Đúng' : 'Sai'}`;
        }
        return `${letter}) Chưa chọn`;
      });
      return hasAny ? parts.join(' · ') : 'Chưa trả lời';
    }
    const entries = Object.entries(map);
    return entries.length > 0
      ? entries
          .map(([, val], i) => `${String.fromCharCode(97 + (i % 26))}) ${val ? 'Đúng' : 'Sai'}`)
          .join(' · ')
      : 'Chưa trả lời';
  }

  const text = String(p).trim();
  if (text === '') return 'Chưa trả lời';
  if (question?.type === 'SINGLE_CHOICE' && question.options) {
    return question.options.find((o) => o.id === text)?.text ?? text;
  }
  return text;
}

export function buildExamCsvContent(
  exam: Exam,
  attempts: ExamAttempt[],
  chapterStats: ChapterMasteryStat[],
  questions: Question[] = [],
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

  const attemptsWithQuestions = examAttempts.filter((a) => a.assignedQuestions.length > 0);
  if (attemptsWithQuestions.length > 0) {
    const qMap = new Map(questions.map((q) => [q.id, q]));
    lines.push('');
    lines.push(
      'CHI TIẾT KẾT QUẢ TỪNG CÂU HỎI CỦA TỪNG THÍ SINH,Họ tên,Câu số,Chương,Kết quả / Bài làm sinh viên,Điểm đạt,Điểm tối đa,Nhận xét chấm',
    );
    for (const a of attemptsWithQuestions) {
      a.assignedQuestions.forEach((snap, idx) => {
        const ans = a.answers[snap.questionId];
        const earned = ans?.earnedPoints ?? 0;
        const maxP = ans?.maxPoints ?? snap.maxPoints;
        const isFullCorrect = maxP > 0 && earned >= maxP - 1e-6;
        const resultLabel = isFullCorrect
          ? 'Đúng'
          : formatStudentAnswerForReport(ans, qMap.get(snap.questionId));
        lines.push(
          [
            a.studentCode,
            a.studentName,
            `Câu ${idx + 1}`,
            snap.chapterCategory,
            resultLabel,
            earned,
            maxP,
            ans?.gradingFeedback ?? '',
          ]
            .map(escapeCsvCell)
            .join(','),
        );
      });
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

export async function exportExamGradebookXlsx(
  exam: Exam,
  attempts: ExamAttempt[],
  chapterStats: ChapterMasteryStat[],
  questions: Question[] = [],
): Promise<void> {
  const XLSX = await import('xlsx');
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

  const gradedAttempts = examAttempts.filter((a) => a.assignedQuestions.length > 0);
  if (gradedAttempts.length > 0) {
    const qMap = new Map(questions.map((q) => [q.id, q]));
    const uniqueQIds: string[] = [];
    const seenQ = new Set<string>();
    for (const a of gradedAttempts) {
      for (const snap of a.assignedQuestions) {
        if (!seenQ.has(snap.questionId)) {
          seenQ.add(snap.questionId);
          uniqueQIds.push(snap.questionId);
        }
      }
    }

    const matrixRows = gradedAttempts.map((a) => {
      let rightCount = 0;
      let wrongCount = 0;
      for (const snap of a.assignedQuestions) {
        const ans = a.answers[snap.questionId];
        const earned = ans?.earnedPoints ?? 0;
        const maxP = ans?.maxPoints ?? snap.maxPoints;
        if (maxP > 0 && earned >= maxP - 1e-6) {
          rightCount += 1;
        } else {
          wrongCount += 1;
        }
      }
      const row: Record<string, string | number> = {
        MSSV: a.studentCode,
        'Họ tên': a.studentName,
        'Điểm hệ 10': Number(a.scale10Score.toFixed(2)),
        'Số câu đúng': rightCount,
        'Số câu sai / chưa đạt': wrongCount,
      };
      const snapIds = new Set(a.assignedQuestions.map((s) => s.questionId));
      uniqueQIds.forEach((qid, idx) => {
        const colKey = `Câu ${idx + 1}`;
        if (!snapIds.has(qid)) {
          row[colKey] = '—';
          return;
        }
        const ans = a.answers[qid];
        const earned = ans?.earnedPoints ?? 0;
        const maxP = ans?.maxPoints ?? 1;
        const isFullCorrect = maxP > 0 && earned >= maxP - 1e-6;
        row[colKey] = isFullCorrect
          ? 'Đúng'
          : `${formatStudentAnswerForReport(ans, qMap.get(qid))} (${earned}/${maxP})`;
      });
      return row;
    });
    const wsMatrix = XLSX.utils.json_to_sheet(matrixRows);
    XLSX.utils.book_append_sheet(wb, wsMatrix, 'MaTranDungSai');

    const detailRows: Array<Record<string, string | number>> = [];
    for (const a of gradedAttempts) {
      a.assignedQuestions.forEach((snap, idx) => {
        const ans = a.answers[snap.questionId];
        const earned = ans?.earnedPoints ?? 0;
        const maxP = ans?.maxPoints ?? snap.maxPoints;
        const qObj = qMap.get(snap.questionId);
        const isFullCorrect = maxP > 0 && earned >= maxP - 1e-6;
        const resultLabel = isFullCorrect
          ? 'Đúng'
          : formatStudentAnswerForReport(ans, qObj);
        detailRows.push({
          MSSV: a.studentCode,
          'Họ tên': a.studentName,
          Lớp: a.className,
          'Câu số': `Câu ${idx + 1}`,
          Chương: snap.chapterCategory,
          'Nội dung câu hỏi': qObj?.content || snap.renderedContent,
          'Kết quả / Bài làm sinh viên': resultLabel,
          'Điểm đạt': earned,
          'Điểm tối đa': maxP,
          'Nhận xét chấm': ans?.gradingFeedback ?? '',
        });
      });
    }
    const wsDetail = XLSX.utils.json_to_sheet(detailRows);
    XLSX.utils.book_append_sheet(wb, wsDetail, 'ChiTietTungCau');
  }

  XLSX.writeFile(wb, `VNE_BangDiem_${exam.roomPin}.xlsx`);
}
