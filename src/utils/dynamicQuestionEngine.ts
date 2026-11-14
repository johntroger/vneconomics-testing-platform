import type {
  AssignedQuestionSnapshot,
  AttemptAnswer,
  ChapterMasteryStat,
  Exam,
  ExamAttempt,
  Question,
  QuestionOption,
  RubricSlot,
  RubricSlotResult,
} from '../types/exam';

/**
 * FNV-1a 32-bit hash for deterministic exam seeds.
 */
export function fnv1aHash(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function createSeededRng(seedStr: string): () => number {
  let state = fnv1aHash(seedStr) || 1;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seededShuffle<T>(items: T[], rng: () => number): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function shuffleOptionsSmart(
  options: QuestionOption[],
  rng: () => number,
): QuestionOption[] {
  const isPinnedLast = (opt: QuestionOption) =>
    Boolean(opt.pinLast) ||
    /tất cả.*(trên|đều đúng)|cả [abc].*đều đúng|không có phương án nào/i.test(
      opt.text,
    );

  const regular = options.filter((o) => !isPinnedLast(o));
  const pinned = options.filter(isPinnedLast);
  return [...seededShuffle(regular, rng), ...pinned];
}

/**
 * Safe arithmetic parser (supports +, -, *, /, ^, parentheses, abs, round, sqrt).
 * Avoids eval / new Function completely.
 */
export function evaluateFormula(
  expression: string,
  vars: Record<string, number>,
): number {
  const interpolated = expression.replace(/\{([a-zA-Z0-9_]+)\}/g, (_, key) => {
    const val = vars[key];
    return val !== undefined ? String(val) : '0';
  });

  const tokens = tokenizeMath(interpolated);
  let pos = 0;

  const peek = () => tokens[pos];
  const consume = () => tokens[pos++];

  const parseExpr = (): number => {
    let val = parseTerm();
    while (peek() === '+' || peek() === '-') {
      const op = consume();
      const right = parseTerm();
      val = op === '+' ? val + right : val - right;
    }
    return val;
  };

  const parseTerm = (): number => {
    let val = parsePower();
    while (peek() === '*' || peek() === '/') {
      const op = consume();
      const right = parsePower();
      val = op === '*' ? val * right : right === 0 ? 0 : val / right;
    }
    return val;
  };

  const parsePower = (): number => {
    const base = parseUnary();
    if (peek() === '^') {
      consume();
      const exp = parsePower();
      return Math.pow(base, exp);
    }
    return base;
  };

  const parseUnary = (): number => {
    if (peek() === '-') {
      consume();
      return -parseUnary();
    }
    if (peek() === '+') {
      consume();
      return parseUnary();
    }
    return parsePrimary();
  };

  const parsePrimary = (): number => {
    const tok = peek();
    if (!tok) return 0;
    if (tok === '(') {
      consume();
      const val = parseExpr();
      if (peek() === ')') consume();
      return val;
    }
    if (['abs', 'round', 'sqrt'].includes(tok)) {
      const fn = consume();
      if (peek() === '(') consume();
      const arg = parseExpr();
      if (peek() === ')') consume();
      if (fn === 'abs') return Math.abs(arg);
      if (fn === 'round') return Math.round(arg * 100) / 100;
      if (fn === 'sqrt') return arg >= 0 ? Math.sqrt(arg) : 0;
    }
    consume();
    const num = Number(tok);
    return Number.isFinite(num) ? num : 0;
  };

  const result = parseExpr();
  return Math.round(result * 10000) / 10000;
}

function tokenizeMath(expr: string): string[] {
  const regex = /\s*([0-9]+(?:\.[0-9]+)?|abs|round|sqrt|[+\-*/^()])\s*/g;
  const out: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(expr)) !== null) {
    out.push(match[1]);
  }
  return out;
}

export function interpolateText(
  template: string,
  vars: Record<string, number>,
): string {
  let text = template.replace(/\{\{([^}]+)\}\}/g, (_, expr) => {
    const val = evaluateFormula(expr, vars);
    return Number.isInteger(val) ? String(val) : String(Math.round(val * 100) / 100);
  });
  text = text.replace(/\{([a-zA-Z0-9_]+)\}/g, (_, key) => {
    const val = vars[key];
    return val !== undefined ? String(val) : `{${key}}`;
  });
  return text;
}

export function generateSeedVarsForQuestion(
  question: Question,
  studentCode: string,
  examId: string,
): Record<string, number> {
  const vars: Record<string, number> = {};
  if (!question.dynamicVars || question.dynamicVars.length === 0) return vars;

  const rng = createSeededRng(`${studentCode}::${examId}::${question.id}::vars`);
  for (const spec of question.dynamicVars) {
    const step = spec.step > 0 ? spec.step : 1;
    const stepsCount = Math.max(0, Math.floor((spec.max - spec.min) / step));
    const idx = Math.floor(rng() * (stepsCount + 1));
    const raw = spec.min + idx * step;
    vars[spec.name] = Math.round(raw * 1000) / 1000;
  }
  return vars;
}

/**
 * Stratified Chapter Pool + Multi-Layer Shuffling + Slot Point Normalization.
 */
export function buildAssignedQuestions(
  exam: Exam,
  allQuestions: Question[],
  studentCode: string,
): AssignedQuestionSnapshot[] {
  const courseQuestions = allQuestions.filter((q) => q.courseId === exam.courseId);
  const questionMap = new Map(courseQuestions.map((q) => [q.id, q]));
  const picked: Array<{ question: Question; slotPoints: number }> = [];
  const usedIds = new Set<string>();

  const slotPointLookup = new Map<string, number>();
  for (const rule of exam.chapterMatrix) {
    if (rule.pointsPerQuestion && rule.pointsPerQuestion > 0) {
      slotPointLookup.set(rule.chapterCategory, rule.pointsPerQuestion);
    }
  }

  for (const pinnedId of exam.pinnedQuestionIds) {
    const q = questionMap.get(pinnedId);
    if (q && !usedIds.has(q.id)) {
      usedIds.add(q.id);
      picked.push({
        question: q,
        slotPoints: slotPointLookup.get(q.chapterCategory) ?? q.points,
      });
    }
  }

  if (exam.chapterMatrix.length > 0) {
    for (const rule of exam.chapterMatrix) {
      const alreadyInChapter = picked.filter(
        (p) => p.question.chapterCategory === rule.chapterCategory,
      ).length;
      const remainingQuota = Math.max(0, rule.questionCount - alreadyInChapter);
      if (remainingQuota === 0) continue;

      const pool = courseQuestions.filter(
        (q) => q.chapterCategory === rule.chapterCategory && !usedIds.has(q.id),
      );
      const chapterRng = createSeededRng(
        `${studentCode}::${exam.id}::pool::${rule.chapterCategory}`,
      );
      const selected = exam.shuffleQuestions ? seededShuffle(pool, chapterRng) : pool;
      for (const q of selected.slice(0, remainingQuota)) {
        usedIds.add(q.id);
        picked.push({
          question: q,
          slotPoints:
            rule.pointsPerQuestion && rule.pointsPerQuestion > 0
              ? rule.pointsPerQuestion
              : q.points,
        });
      }
    }
  } else {
    for (const q of courseQuestions) {
      if (!usedIds.has(q.id)) {
        usedIds.add(q.id);
        picked.push({ question: q, slotPoints: q.points });
      }
    }
  }

  const orderRng = createSeededRng(`${studentCode}::${exam.id}::order`);
  let ordered = [...picked];
  if (exam.shuffleQuestions) {
    if (exam.shuffleMode === 'FULL_RANDOM') {
      ordered = seededShuffle(picked, orderRng);
    } else if (exam.shuffleMode === 'BY_CHAPTER') {
      const chapters = Array.from(
        new Set(picked.map((p) => p.question.chapterCategory)),
      );
      ordered = chapters.flatMap((ch) =>
        seededShuffle(
          picked.filter((p) => p.question.chapterCategory === ch),
          orderRng,
        ),
      );
    } else if (exam.shuffleMode === 'ESSAY_LAST') {
      const nonEssay = seededShuffle(
        picked.filter((p) => p.question.type !== 'ESSAY'),
        orderRng,
      );
      const essay = seededShuffle(
        picked.filter((p) => p.question.type === 'ESSAY'),
        orderRng,
      );
      ordered = [...nonEssay, ...essay];
    }
  }

  return ordered.map((entry, idx) => {
    const q = entry.question;
    const seedVars = generateSeedVarsForQuestion(q, studentCode, exam.id);
    const renderedContent = interpolateText(q.content, seedVars);

    let optionOrderIds: string[] | undefined;
    if (q.options && q.options.length > 0) {
      const optRng = createSeededRng(`${studentCode}::${exam.id}::${q.id}::opts`);
      const finalOpts = exam.shuffleOptions
        ? shuffleOptionsSmart(q.options, optRng)
        : q.options;
      optionOrderIds = finalOpts.map((o) => o.id);
    }

    return {
      questionId: q.id,
      chapterCategory: q.chapterCategory,
      orderIndex: idx,
      maxPoints: Math.round(entry.slotPoints * 100) / 100,
      seedVars,
      renderedContent,
      optionOrderIds,
    };
  });
}

export function normalizeDecimalInput(raw: string): number | null {
  const cleaned = raw
    .trim()
    .replace(/,/g, '.')
    .replace(/%/g, '')
    .replace(/\s+/g, '');
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Vietnamese text & logic-arrow normalizer for Micro-Essay deterministic grading (< 1ms).
 */
export function normalizeVietnameseEssay(raw: string): string {
  const toneNormalized = raw
    .normalize('NFC')
    .toLowerCase()
    .replace(/oà/g, 'òa')
    .replace(/oá/g, 'óa')
    .replace(/oả/g, 'ỏa')
    .replace(/oã/g, 'õa')
    .replace(/oạ/g, 'ọa')
    .replace(/uý/g, 'úy')
    .replace(/uỳ/g, 'ùy')
    .replace(/uỷ/g, 'ủy')
    .replace(/uỹ/g, 'ũy')
    .replace(/uỵ/g, 'ụy');

  return toneNormalized
    .replace(/(-->|==>|=>|➔|⇒|→)/g, ' -> ')
    .replace(/(\d),(\d)/g, '$1.$2')
    .replace(/[“”"'`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitIntoClauses(normalizedText: string): string[] {
  return normalizedText
    .split(/(?:->|\.|;|,|\/|\bnên\b|\bdo đó\b|\bvì vậy\b|\bsuy ra\b|\bdẫn đến\b|\blàm cho\b|\bkhiến\b)/g)
    .map((c) => c.trim())
    .filter(Boolean);
}

const NEGATION_WORDS = ['không', 'chẳng', 'chưa', 'không phải', 'ngược lại', 'phi'];

const OPPOSITE_PAIRS: Array<[string, string]> = [
  ['tăng', 'giảm'],
  ['phải', 'trái'],
  ['cao', 'thấp'],
  ['mở rộng', 'thu hẹp'],
  ['dư cung', 'dư cầu'],
  ['đồng biến', 'nghịch biến'],
  ['cùng chiều', 'ngược chiều'],
];

function phraseOccursCleanly(clause: string, phrase: string): boolean {
  const normPhrase = normalizeVietnameseEssay(phrase);
  if (!normPhrase) return false;
  return clause.includes(normPhrase);
}

function hasNegationConflict(clause: string, phrase: string): boolean {
  const normPhrase = normalizeVietnameseEssay(phrase);
  if (NEGATION_WORDS.some((w) => normPhrase.includes(w))) {
    return false;
  }
  const idx = clause.indexOf(normPhrase);
  if (idx <= 0) return false;
  const prefixWindow = clause.slice(Math.max(0, idx - 18), idx);
  return NEGATION_WORDS.some((neg) =>
    new RegExp(`(?:^|\\s)${neg}\\s*$`).test(prefixWindow) ||
    new RegExp(`(?:^|\\s)${neg}\\s+\\S+$`).test(prefixWindow),
  );
}

function hasHedgingContradiction(clause: string, slot: RubricSlot): string | null {
  if (slot.oppositeTerms) {
    for (const opp of slot.oppositeTerms) {
      const normOpp = normalizeVietnameseEssay(opp);
      if (normOpp && clause.includes(normOpp)) {
        return `Chứa từ khóa đối lập ("${opp}")`;
      }
    }
  }
  for (const [a, b] of OPPOSITE_PAIRS) {
    if (
      (clause.includes(`${a} hoặc ${b}`) ||
        clause.includes(`${a} hay ${b}`) ||
        clause.includes(`vừa ${a} vừa ${b}`) ||
        (clause.includes(a) && clause.includes(b))) &&
      slot.acceptedPhrases.some((p) => p.includes(a) || p.includes(b))
    ) {
      return `Chứa hai chiều đối lập ("${a}" & "${b}") trong cùng vế`;
    }
  }
  return null;
}

/**
 * Deterministic 4-step Micro-Essay Grader (< 1ms CPU, 0 external AI calls).
 */
export function gradeMicroEssayRubric(
  question: Question,
  rawAnswer: string,
  seedVars: Record<string, number>,
  overrideMaxPoints?: number,
): {
  earnedPoints: number;
  maxPoints: number;
  breakdown: RubricSlotResult[];
  feedback: string;
  matchedHighlights: string[];
  blockedHighlights: string[];
  honeypotTriggered: boolean;
} {
  const maxPoints = overrideMaxPoints ?? question.points;
  const rubric = question.gradingRubric ?? [];
  const normalized = normalizeVietnameseEssay(rawAnswer);

  if (!normalized) {
    return {
      earnedPoints: 0,
      maxPoints,
      breakdown: rubric.map((slot) => ({
        slotId: slot.id,
        label: slot.label,
        earnedPoints: 0,
        maxPoints: slot.points,
        matched: false,
      })),
      feedback: 'Chưa có nội dung trả lời.',
      matchedHighlights: [],
      blockedHighlights: [],
      honeypotTriggered: false,
    };
  }

  let honeypotTriggered = false;
  const blockedHighlights: string[] = [];
  if (
    question.aiHoneypotKeyword &&
    normalized.includes(normalizeVietnameseEssay(question.aiHoneypotKeyword))
  ) {
    honeypotTriggered = true;
    blockedHighlights.push(question.aiHoneypotKeyword);
  }

  const clauses = splitIntoClauses(normalized);
  const fullPlusClauses = clauses.length > 0 ? clauses : [normalized];

  const totalRubricWeight =
    rubric.reduce((sum, r) => sum + r.points, 0) || maxPoints;
  const scaleFactor = totalRubricWeight > 0 ? maxPoints / totalRubricWeight : 1;

  const breakdown: RubricSlotResult[] = [];
  const matchedHighlights: string[] = [];
  let rawEarned = 0;

  for (const slot of rubric) {
    const slotMax = Math.round(slot.points * scaleFactor * 100) / 100;
    const interpolatedPhrases = slot.acceptedPhrases.map((p) =>
      interpolateText(p, seedVars),
    );
    const interpolatedPairs = (slot.requiredPairs ?? []).map((group) =>
      group.map((term) => interpolateText(term, seedVars)),
    );
    const interpolatedOpposite = (slot.oppositeTerms ?? []).map((t) =>
      interpolateText(t, seedVars),
    );
    const activeSlot: RubricSlot = {
      ...slot,
      acceptedPhrases: interpolatedPhrases,
      requiredPairs: interpolatedPairs,
      oppositeTerms: interpolatedOpposite,
    };

    let matched = false;
    let matchedText: string | undefined;
    let blockedReason: string | undefined;

    for (const clause of fullPlusClauses) {
      let hitPhrase: string | undefined;

      for (const phrase of interpolatedPhrases) {
        if (phraseOccursCleanly(clause, phrase)) {
          hitPhrase = phrase;
          break;
        }
      }

      if (!hitPhrase && interpolatedPairs.length > 0) {
        const allGroupsSatisfied = interpolatedPairs.every((group) =>
          group.some((term) => phraseOccursCleanly(clause, term)),
        );
        if (allGroupsSatisfied) {
          hitPhrase = interpolatedPairs
            .map((g) => g.find((t) => phraseOccursCleanly(clause, t)) ?? g[0])
            .join(' + ');
        }
      }

      if (hitPhrase) {
        if (hasNegationConflict(clause, hitPhrase)) {
          blockedReason = 'Phát hiện từ phủ định đảo ngược ý';
          blockedHighlights.push(clause);
          continue;
        }
        const hedgeErr = hasHedgingContradiction(clause, activeSlot);
        if (hedgeErr) {
          blockedReason = hedgeErr;
          blockedHighlights.push(clause);
          continue;
        }
        matched = true;
        matchedText = hitPhrase;
        matchedHighlights.push(hitPhrase);
        break;
      }
    }

    if (matched) {
      rawEarned += slotMax;
      breakdown.push({
        slotId: slot.id,
        label: slot.label,
        earnedPoints: slotMax,
        maxPoints: slotMax,
        matched: true,
        matchedText,
      });
    } else {
      breakdown.push({
        slotId: slot.id,
        label: slot.label,
        earnedPoints: 0,
        maxPoints: slotMax,
        matched: false,
        blockedReason,
      });
    }
  }

  const finalEarned = Math.min(maxPoints, Math.round(rawEarned * 100) / 100);
  const feedbackParts = breakdown.map((b) =>
    b.matched
      ? `✓ Đạt ${b.label} (+${b.earnedPoints}đ)`
      : `✗ Thiếu ${b.label} (0đ${b.blockedReason ? ` — ${b.blockedReason}` : ''})`,
  );

  return {
    earnedPoints: finalEarned,
    maxPoints,
    breakdown,
    feedback: feedbackParts.join(' | '),
    matchedHighlights: Array.from(new Set(matchedHighlights)),
    blockedHighlights: Array.from(new Set(blockedHighlights)),
    honeypotTriggered,
  };
}

export function gradeAnswer(
  question: Question,
  snapshot: AssignedQuestionSnapshot,
  payload: string | string[] | Record<string, boolean>,
): AttemptAnswer {
  const maxPoints = snapshot.maxPoints;
  const seedVars = snapshot.seedVars;

  if (question.type === 'SINGLE_CHOICE') {
    const chosen = typeof payload === 'string' ? payload : '';
    const honeypotTriggered =
      Boolean(question.aiHoneypotOptionId) &&
      chosen === question.aiHoneypotOptionId;
    const correctIds = question.correctOptionIds ?? [];
    const isCorrect = Boolean(chosen) && correctIds.includes(chosen);
    return {
      questionId: question.id,
      chapterCategory: question.chapterCategory,
      renderedSeedVars: seedVars,
      answerPayload: chosen,
      isCorrect,
      maxPoints,
      earnedPoints: isCorrect ? maxPoints : 0,
      gradingStatus: 'AUTO',
      honeypotTriggered,
    };
  }

  if (question.type === 'MULTI_CHOICE') {
    const selected = Array.isArray(payload) ? payload : [];
    const correctIds = new Set(question.correctOptionIds ?? []);
    const selectedSet = new Set(selected);
    const hasWrong = selected.some((id) => !correctIds.has(id));
    const hits = selected.filter((id) => correctIds.has(id)).length;
    const isExact = !hasWrong && hits === correctIds.size && correctIds.size > 0;
    const ratio =
      correctIds.size > 0
        ? Math.max(0, (hits - (hasWrong ? 1 : 0)) / correctIds.size)
        : 0;
    const earned = isExact
      ? maxPoints
      : Math.round(maxPoints * ratio * 100) / 100;

    return {
      questionId: question.id,
      chapterCategory: question.chapterCategory,
      renderedSeedVars: seedVars,
      answerPayload: Array.from(selectedSet),
      isCorrect: isExact,
      maxPoints,
      earnedPoints: earned,
      gradingStatus: 'AUTO',
    };
  }

  if (question.type === 'TRUE_FALSE') {
    const map =
      payload && typeof payload === 'object' && !Array.isArray(payload)
        ? (payload as Record<string, boolean>)
        : {};
    const items = question.trueFalseItems ?? [];
    let correctCount = 0;
    for (const item of items) {
      if (map[item.id] === item.answer) {
        correctCount += 1;
      }
    }
    const scaleWeights: Record<number, number> = {
      0: 0,
      1: 0.1,
      2: 0.25,
      3: 0.5,
      4: 1,
    };
    const weight =
      items.length === 4
        ? (scaleWeights[correctCount] ?? 0)
        : items.length > 0
          ? correctCount / items.length
          : 0;
    const earned = Math.round(maxPoints * weight * 100) / 100;
    return {
      questionId: question.id,
      chapterCategory: question.chapterCategory,
      renderedSeedVars: seedVars,
      answerPayload: map,
      isCorrect: items.length > 0 && correctCount === items.length,
      maxPoints,
      earnedPoints: earned,
      gradingFeedback: `Đúng ${correctCount}/${items.length} mệnh đề`,
      gradingStatus: 'AUTO',
    };
  }

  if (question.type === 'NUMERICAL') {
    const raw = typeof payload === 'string' ? payload : '';
    const parsed = normalizeDecimalInput(raw);
    const expected = question.numericalFormula
      ? evaluateFormula(question.numericalFormula, seedVars)
      : 0;
    const tol = question.tolerance ?? 0.05;
    const isCorrect = parsed !== null && Math.abs(parsed - expected) <= tol;
    return {
      questionId: question.id,
      chapterCategory: question.chapterCategory,
      renderedSeedVars: seedVars,
      answerPayload: raw,
      isCorrect,
      maxPoints,
      earnedPoints: isCorrect ? maxPoints : 0,
      gradingFeedback: `Đáp án chuẩn theo biến số: ${expected}${question.numericalUnit ? ` ${question.numericalUnit}` : ''}`,
      gradingStatus: 'AUTO',
    };
  }

  const rawEssay = typeof payload === 'string' ? payload : '';
  const rubricRes = gradeMicroEssayRubric(question, rawEssay, seedVars, maxPoints);
  return {
    questionId: question.id,
    chapterCategory: question.chapterCategory,
    renderedSeedVars: seedVars,
    answerPayload: rawEssay,
    isCorrect:
      rubricRes.earnedPoints >= maxPoints * 0.5
        ? true
        : rubricRes.earnedPoints > 0
          ? null
          : false,
    maxPoints,
    earnedPoints: rubricRes.earnedPoints,
    gradingFeedback: rubricRes.feedback,
    gradingStatus: 'RUBRIC_GRADED',
    rubricBreakdown: rubricRes.breakdown,
    matchedHighlights: rubricRes.matchedHighlights,
    blockedHighlights: rubricRes.blockedHighlights,
    honeypotTriggered: rubricRes.honeypotTriggered,
  };
}

export function recalculateAttemptScores(
  attempt: ExamAttempt,
  questions: Question[],
): ExamAttempt {
  const qMap = new Map(questions.map((q) => [q.id, q]));
  let autoScore = 0;
  let essayScore = 0;
  let maxTotalScore = 0;
  let aiFlag = attempt.aiFlag;
  let aiFlagReason = attempt.aiFlagReason;

  for (const snap of attempt.assignedQuestions) {
    maxTotalScore += snap.maxPoints;
    const ans = attempt.answers[snap.questionId];
    const q = qMap.get(snap.questionId);
    if (!ans || !q) continue;

    if (q.type === 'ESSAY') {
      essayScore += ans.earnedPoints;
    } else {
      autoScore += ans.earnedPoints;
    }
    if (ans.honeypotTriggered) {
      aiFlag = true;
      aiFlagReason =
        aiFlagReason ||
        `Dính bẫy AI Honeypot ở câu (${snap.chapterCategory})`;
    }
  }

  const totalScore = Math.round((autoScore + essayScore) * 100) / 100;
  const roundedMax = Math.round(maxTotalScore * 100) / 100;
  const scale10Score =
    roundedMax > 0 ? Math.round((totalScore / roundedMax) * 10 * 100) / 100 : 0;

  return {
    ...attempt,
    autoScore: Math.round(autoScore * 100) / 100,
    essayScore: Math.round(essayScore * 100) / 100,
    totalScore,
    maxTotalScore: roundedMax,
    scale10Score,
    aiFlag,
    aiFlagReason,
  };
}

export function computeChapterMastery(
  attempts: ExamAttempt[],
  examId?: string,
): ChapterMasteryStat[] {
  const finished = attempts.filter(
    (a) =>
      (!examId || a.examId === examId) &&
      (a.status === 'SUBMITTED' || a.status === 'AUTO_SUBMITTED'),
  );
  const bucket = new Map<
    string,
    { earned: number; max: number; count: number }
  >();

  for (const att of finished) {
    for (const snap of att.assignedQuestions) {
      const current = bucket.get(snap.chapterCategory) ?? {
        earned: 0,
        max: 0,
        count: 0,
      };
      const ans = att.answers[snap.questionId];
      current.max += snap.maxPoints;
      current.earned += ans ? ans.earnedPoints : 0;
      current.count += 1;
      bucket.set(snap.chapterCategory, current);
    }
  }

  return Array.from(bucket.entries())
    .sort(([a], [b]) => a.localeCompare(b, 'vi'))
    .map(([chapterCategory, val]) => ({
      chapterCategory,
      totalGradedQuestions: val.count,
      earnedPoints: Math.round(val.earned * 100) / 100,
      maxPoints: Math.round(val.max * 100) / 100,
      masteryPercent:
        val.max > 0 ? Math.round((val.earned / val.max) * 1000) / 10 : 0,
    }));
}
