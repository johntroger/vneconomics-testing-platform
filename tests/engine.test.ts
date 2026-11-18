import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAssignedQuestions,
  gradeAnswer,
  normalizeBlankAnswerText,
  splitFillInBlankSegments,
} from '../src/utils/dynamicQuestionEngine.ts';
import type { AssignedQuestionSnapshot, Exam, Question } from '../src/types/exam.ts';

function makeSnapshot(question: Question, seedVars: Record<string, number> = {}): AssignedQuestionSnapshot {
  return {
    questionId: question.id,
    chapterCategory: question.chapterCategory,
    orderIndex: 0,
    maxPoints: question.points,
    seedVars,
    renderedContent: question.content,
  };
}

test('splitFillInBlankSegments detects >=3 underscores', () => {
  const segs = splitFillInBlankSegments(
    'Some suppliers struggle with _____, and others face ________ on their ends.',
  );
  assert.equal(segs.length, 3);
});

test('normalizeBlankAnswerText trims, collapses spaces, and respects caseSensitive', () => {
  assert.equal(normalizeBlankAnswerText('  Supply   Chain  ', false), 'supply chain');
  assert.equal(normalizeBlankAnswerText('  Supply   Chain  ', true), 'Supply Chain');
});

test('FILL_IN_BLANK grades partial credit, synonyms, and all-or-nothing', () => {
  const q: Question = {
    id: 'q_fill_1',
    courseId: 'c1',
    chapterCategory: 'Ch1',
    difficulty: 'MEDIUM',
    type: 'FILL_IN_BLANK',
    content: 'Effective _____ maintains _____.',
    blankSlots: [
      { id: 'b1', index: 1, acceptedAnswers: ['management', 'coordination'], caseSensitive: false },
      { id: 'b2', index: 2, acceptedAnswers: ['quality'], caseSensitive: true },
    ],
    blankAllOrNothing: false,
    points: 2,
  };

  // Both right (using synonym + extra whitespace)
  const resFull = gradeAnswer(q, makeSnapshot(q), ['  COORDINATION  ', 'quality']);
  assert.equal(resFull.earnedPoints, 2);
  assert.equal(resFull.isCorrect, true);

  // Case-sensitive blank #2 fails when capitalized
  const resPartial = gradeAnswer(q, makeSnapshot(q), ['management', 'Quality']);
  assert.equal(resPartial.earnedPoints, 1);
  assert.equal(resPartial.isCorrect, false);

  // All-or-nothing returns 0 on partial
  const qStrict: Question = { ...q, blankAllOrNothing: true };
  const resStrict = gradeAnswer(qStrict, makeSnapshot(qStrict), ['management', 'Quality']);
  assert.equal(resStrict.earnedPoints, 0);
  assert.equal(resStrict.isCorrect, false);
});

test('NUMERICAL evaluates dynamic formula and comma decimal', () => {
  const q: Question = {
    id: 'q_num_1',
    courseId: 'c1',
    chapterCategory: 'Ch1',
    difficulty: 'MEDIUM',
    type: 'NUMERICAL',
    content: 'P = ({a} - 10) / 4',
    dynamicVars: [{ name: 'a', min: 20, max: 20, step: 1 }],
    numericalFormula: '({a} - 10) / 4',
    tolerance: 0.05,
    points: 1,
  };
  const res = gradeAnswer(q, makeSnapshot(q, { a: 20 }), '2,5');
  assert.equal(res.isCorrect, true);
  assert.equal(res.earnedPoints, 1);
});

test('buildAssignedQuestions prioritizes distinct variantGroup', () => {
  const exam: Exam = {
    id: 'ex_1',
    courseId: 'c1',
    title: 'Test',
    roomPin: '999999',
    unlockPin: '8888',
    instructorEmail: 'gv@test.com',
    durationMinutes: 30,
    chapterMatrix: [{ chapterCategory: 'Ch1', questionCount: 2 }],
    pinnedQuestionIds: [],
    shuffleQuestions: true,
    shuffleMode: 'FULL_RANDOM',
    shuffleOptions: false,
    maxLeaveCount: 3,
    maxAwaySeconds: 20,
    gracePeriodMs: 1000,
    oneWayMode: false,
    perQuestionSeconds: 0,
    canvasAntiOcr: false,
    emailDeliveryMode: 'IMMEDIATE',
    rosterWhitelist: [],
    status: 'OPEN',
    reportSentStatus: 'PENDING',
    createdAt: '2026-11-16T00:00:00Z',
  };

  const questions: Question[] = [
    {
      id: 'q1a',
      courseId: 'c1',
      chapterCategory: 'Ch1',
      difficulty: 'EASY',
      type: 'SINGLE_CHOICE',
      variantGroup: 'vg_demand',
      content: 'Variant A',
      options: [{ id: 'o1', text: 'A' }],
      correctOptionIds: ['o1'],
      points: 1,
    },
    {
      id: 'q1b',
      courseId: 'c1',
      chapterCategory: 'Ch1',
      difficulty: 'EASY',
      type: 'SINGLE_CHOICE',
      variantGroup: 'vg_demand',
      content: 'Variant B',
      options: [{ id: 'o1', text: 'A' }],
      correctOptionIds: ['o1'],
      points: 1,
    },
    {
      id: 'q2',
      courseId: 'c1',
      chapterCategory: 'Ch1',
      difficulty: 'EASY',
      type: 'SINGLE_CHOICE',
      variantGroup: 'vg_supply',
      content: 'Supply Question',
      options: [{ id: 'o1', text: 'A' }],
      correctOptionIds: ['o1'],
      points: 1,
    },
  ];

  const picked = buildAssignedQuestions(exam, questions, 'SV001');
  assert.equal(picked.length, 2);
  const pickedIds = new Set(picked.map((p) => p.questionId));
  assert.equal(pickedIds.has('q2'), true);
});

test('ESSAY Rubric falls back to slot.label, matches sampleAnswer, and is case-insensitive', () => {
  const q: Question = {
    id: 'q_essay_1',
    courseId: 'c1',
    chapterCategory: 'Ch1',
    difficulty: 'MEDIUM',
    type: 'ESSAY',
    content: 'What are the two steps?',
    sampleAnswer: 'unloading and pallet check',
    gradingRubric: [
      { id: 's1', label: 'unloading', points: 1, acceptedPhrases: [] },
      { id: 's2', label: 'check', points: 1, acceptedPhrases: [] },
    ],
    points: 1,
  };

  // Exact sampleAnswer with different casing
  const resExact = gradeAnswer(q, makeSnapshot(q), 'UNLOADING and Pallet CHECK');
  assert.equal(resExact.earnedPoints, 1);
  assert.equal(resExact.isCorrect, true);

  // Paraphrased answer containing both slot labels (even when acceptedPhrases is empty)
  const resParaphrase = gradeAnswer(
    q,
    makeSnapshot(q),
    'First do UNLOADING then perform a quick CHECK',
  );
  assert.equal(resParaphrase.earnedPoints, 1);
  assert.equal(resParaphrase.isCorrect, true);
});

test('buildAssignedQuestions honors easyCount/mediumCount/hardCount quotas', () => {
  const mkQ = (id: string, diff: Question['difficulty']): Question => ({
    id,
    courseId: 'c1',
    chapterCategory: 'Ch1',
    difficulty: diff,
    type: 'SINGLE_CHOICE',
    content: `Q ${id}`,
    options: [{ id: 'o1', text: 'A' }],
    correctOptionIds: ['o1'],
    points: 1,
  });

  const questions: Question[] = [
    mkQ('e1', 'EASY'),
    mkQ('e2', 'EASY'),
    mkQ('m1', 'MEDIUM'),
    mkQ('m2', 'MEDIUM'),
    mkQ('h1', 'HARD'),
    mkQ('h2', 'HARD'),
  ];

  const exam: Exam = {
    id: 'e1',
    courseId: 'c1',
    title: 'Matrix Diff Test',
    roomPin: '123456',
    unlockPin: '8888',
    instructorEmail: 'gv@test.edu',
    durationMinutes: 15,
    chapterMatrix: [
      {
        chapterCategory: 'Ch1',
        questionCount: 4,
        easyCount: 2,
        mediumCount: 1,
        hardCount: 1,
      },
    ],
    pinnedQuestionIds: [],
    shuffleQuestions: true,
    shuffleMode: 'FULL_RANDOM',
    shuffleOptions: true,
    maxLeaveCount: 3,
    maxAwaySeconds: 30,
    gracePeriodMs: 2000,
    oneWayMode: false,
    perQuestionSeconds: 0,
    canvasAntiOcr: false,
    emailDeliveryMode: 'IMMEDIATE',
    rosterWhitelist: [],
    status: 'OPEN',
    reportSentStatus: 'PENDING',
    createdAt: new Date().toISOString(),
  };

  const assigned = buildAssignedQuestions(exam, questions, 'SV999');
  assert.equal(assigned.length, 4);
  const qById = new Map(questions.map((q) => [q.id, q]));
  const counts = { EASY: 0, MEDIUM: 0, HARD: 0 };
  for (const s of assigned) {
    const d = qById.get(s.questionId)!.difficulty;
    counts[d] += 1;
  }
  assert.deepEqual(counts, { EASY: 2, MEDIUM: 1, HARD: 1 });
});
