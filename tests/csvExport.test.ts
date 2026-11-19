import assert from 'node:assert/strict';
import test from 'node:test';
import type { AttemptAnswer, Exam, ExamAttempt, Question } from '../src/types/exam.ts';
import {
  buildExamCsvContent,
  formatStudentAnswerForReport,
} from '../src/utils/csvExport.ts';

const mockQuestions: Question[] = [
  {
    id: 'q_sc',
    courseId: 'c1',
    chapterCategory: 'Chương 1',
    difficulty: 'EASY',
    type: 'SINGLE_CHOICE',
    content: 'Khi giá tăng, lượng cầu thay đổi thế nào?',
    options: [
      { id: 'opt_a', text: 'Tăng lên' },
      { id: 'opt_b', text: 'Giảm xuống' },
    ],
    correctOptionIds: ['opt_b'],
    points: 1,
  },
  {
    id: 'q_mc',
    courseId: 'c1',
    chapterCategory: 'Chương 1',
    difficulty: 'MEDIUM',
    type: 'MULTI_CHOICE',
    content: 'Chọn các yếu tố làm dịch chuyển đường cung',
    options: [
      { id: 'o1', text: 'Giá nguyên liệu' },
      { id: 'o2', text: 'Công nghệ' },
      { id: 'o3', text: 'Thị hiếu người tiêu dùng' },
    ],
    correctOptionIds: ['o1', 'o2'],
    points: 1,
  },
  {
    id: 'q_tf',
    courseId: 'c1',
    chapterCategory: 'Chương 2',
    difficulty: 'MEDIUM',
    type: 'TRUE_FALSE',
    content: 'Xét các nhận định sau:',
    trueFalseItems: [
      { id: 'tf_1', statement: 'Mệnh đề 1', answer: true },
      { id: 'tf_2', statement: 'Mệnh đề 2', answer: false },
    ],
    points: 1,
  },
  {
    id: 'q_blank',
    courseId: 'c1',
    chapterCategory: 'Chương 2',
    difficulty: 'MEDIUM',
    type: 'FILL_IN_BLANK',
    content: 'Điền vào chỗ trống [blank1] và [blank2]',
    points: 1,
  },
  {
    id: 'q_num',
    courseId: 'c1',
    chapterCategory: 'Chương 3',
    difficulty: 'HARD',
    type: 'NUMERICAL',
    content: 'Tính sản lượng cân bằng',
    points: 1,
  },
];

const makeAnswer = (
  questionId: string,
  answerPayload: AttemptAnswer['answerPayload'],
  earnedPoints: number,
  maxPoints = 1,
): AttemptAnswer => ({
  questionId,
  chapterCategory: 'Chương 1',
  renderedSeedVars: {},
  answerPayload,
  isCorrect: earnedPoints >= maxPoints,
  maxPoints,
  earnedPoints,
  gradingStatus: 'AUTO',
});

test('formatStudentAnswerForReport resolves actual student answers across all question types', () => {
  assert.equal(formatStudentAnswerForReport(undefined, mockQuestions[0]), 'Chưa trả lời');
  assert.equal(
    formatStudentAnswerForReport(makeAnswer('q_sc', 'opt_a', 0), mockQuestions[0]),
    'Tăng lên',
  );
  assert.equal(
    formatStudentAnswerForReport(makeAnswer('q_mc', ['o1', 'o3'], 0), mockQuestions[1]),
    'Giá nguyên liệu ; Thị hiếu người tiêu dùng',
  );
  assert.equal(
    formatStudentAnswerForReport(
      makeAnswer('q_tf', { tf_1: true, tf_2: true }, 0.5),
      mockQuestions[2],
    ),
    'a) Đúng · b) Sai'.replace('b) Sai', 'b) Đúng'),
  );
  assert.equal(
    formatStudentAnswerForReport(makeAnswer('q_blank', ['cung', ''], 0), mockQuestions[3]),
    'Ô #1: cung | Ô #2: (trống)',
  );
  assert.equal(
    formatStudentAnswerForReport(makeAnswer('q_num', '42.5', 0), mockQuestions[4]),
    '42.5',
  );
});

test('buildExamCsvContent shows "Đúng" for full-credit questions and actual student answer when wrong', () => {
  const exam: Exam = {
    id: 'ex_1',
    courseId: 'c1',
    title: 'Kinh tế Vi mô 1',
    roomPin: '101202',
    unlockPin: '9999',
    instructorEmail: 'gv@vneconomics.com',
    durationMinutes: 45,
    chapterMatrix: [],
    pinnedQuestionIds: [],
    shuffleQuestions: false,
    shuffleMode: 'NONE',
    shuffleOptions: false,
    maxLeaveCount: 3,
    maxAwaySeconds: 60,
    gracePeriodMs: 3000,
    oneWayMode: false,
    perQuestionSeconds: 0,
    canvasAntiOcr: false,
    emailDeliveryMode: 'DELAYED_BATCH',
    rosterWhitelist: [],
    status: 'CLOSED',
    reportSentStatus: 'PENDING',
    createdAt: '2026-11-19T00:00:00Z',
  };

  const attempt: ExamAttempt = {
    id: 'att_1',
    examId: 'ex_1',
    studentCode: '3122102081',
    studentName: 'Le Minh Khoa',
    studentEmail: 'khoa@gmail.com',
    className: 'K48-KT01',
    status: 'SUBMITTED',
    startedAt: '2026-11-19T08:00:00Z',
    assignedQuestions: [
      {
        questionId: 'q_sc',
        chapterCategory: 'Chương 1',
        orderIndex: 0,
        maxPoints: 1,
        seedVars: {},
        renderedContent: mockQuestions[0].content,
      },
      {
        questionId: 'q_num',
        chapterCategory: 'Chương 3',
        orderIndex: 1,
        maxPoints: 1,
        seedVars: {},
        renderedContent: mockQuestions[4].content,
      },
      {
        questionId: 'q_tf',
        chapterCategory: 'Chương 2',
        orderIndex: 2,
        maxPoints: 1,
        seedVars: {},
        renderedContent: mockQuestions[2].content,
      },
    ],
    answers: {
      q_sc: makeAnswer('q_sc', 'opt_b', 1, 1),
      q_num: makeAnswer('q_num', '99', 0, 1),
      q_tf: makeAnswer('q_tf', { tf_1: true, tf_2: true }, 0.5, 1),
    },
    violations: [],
    leaveCount: 0,
    totalAwaySeconds: 0,
    integrityScore: 100,
    aiFlag: false,
    autoScore: 1.5,
    essayScore: 0,
    totalScore: 1.5,
    maxTotalScore: 3,
    scale10Score: 5,
    emailSentStatus: 'SENT',
  };

  const csv = buildExamCsvContent(exam, [attempt], [], mockQuestions);
  assert.match(csv, /3122102081,Le Minh Khoa,Câu 1,Chương 1,Đúng,1,1/);
  assert.match(csv, /3122102081,Le Minh Khoa,Câu 2,Chương 3,99,0,1/);
  assert.match(csv, /3122102081,Le Minh Khoa,Câu 3,Chương 2,a\) Đúng · b\) Đúng,0\.5,1/);
});
