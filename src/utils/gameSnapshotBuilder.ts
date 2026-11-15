import type { Question } from '../types/exam';
import type { GameQuestionSnapshot } from '../types/game';
import { generateSeedVarsForQuestion, interpolateText } from './dynamicQuestionEngine';

export interface BuildGameSnapshotOptions {
  flattenTrueFalse: boolean;
  defaultTimeSec: number;
  doubleFinalQuestion: boolean;
  seedKey?: string;
}

export function getRecommendedTimeSec(type: Question['type'], tfCount = 1, fallback = 20): number {
  if (type === 'TRUE_FALSE') {
    return tfCount <= 1 ? 12 : Math.min(45, tfCount * 10);
  }
  if (type === 'MULTI_CHOICE') return Math.max(fallback, 25);
  if (type === 'NUMERICAL') return Math.max(fallback, 35);
  return fallback;
}

export function buildGameQuestionsSnapshot(
  questions: Question[],
  opts: BuildGameSnapshotOptions,
): GameQuestionSnapshot[] {
  const seedKey = opts.seedKey ?? `game_${Date.now()}`;
  const result: GameQuestionSnapshot[] = [];

  for (const q of questions) {
    if (q.type !== 'SINGLE_CHOICE' && q.type !== 'MULTI_CHOICE' && q.type !== 'TRUE_FALSE') {
      continue;
    }

    const vars = generateSeedVarsForQuestion(q, 'LIVE_GAME_ROOM', seedKey);
    const renderedContent = interpolateText(q.content, vars);

    if (q.type === 'TRUE_FALSE') {
      const items = q.trueFalseItems ?? [];
      if (items.length === 0) continue;

      if (opts.flattenTrueFalse && items.length > 1) {
        items.forEach((item, idx) => {
          const stmt = interpolateText(item.statement, vars);
          result.push({
            id: `${q.id}_tf_${idx + 1}`,
            sourceQuestionId: q.id,
            type: 'TRUE_FALSE',
            content: `${renderedContent ? `${renderedContent}\n\n` : ''}Nhận định: ${stmt}`,
            timeLimitSec: getRecommendedTimeSec('TRUE_FALSE', 1, opts.defaultTimeSec),
            trueFalseItems: [{ id: item.id, statement: stmt, answer: item.answer }],
          });
        });
      } else {
        result.push({
          id: q.id,
          sourceQuestionId: q.id,
          type: 'TRUE_FALSE',
          content: renderedContent,
          timeLimitSec: getRecommendedTimeSec('TRUE_FALSE', items.length, opts.defaultTimeSec),
          trueFalseItems: items.map((it) => ({
            id: it.id,
            statement: interpolateText(it.statement, vars),
            answer: it.answer,
          })),
        });
      }
      continue;
    }

    const options = (q.options ?? []).slice(0, 6).map((o) => ({
      id: o.id,
      text: interpolateText(o.text, vars),
    }));
    if (options.length < 2) continue;

    result.push({
      id: q.id,
      sourceQuestionId: q.id,
      type: q.type,
      content: renderedContent,
      timeLimitSec: getRecommendedTimeSec(q.type, 1, opts.defaultTimeSec),
      options,
      correctOptionIds: [...(q.correctOptionIds ?? [])],
    });
  }

  if (result.length > 0 && opts.doubleFinalQuestion) {
    result[result.length - 1].isDoublePoints = true;
  }

  return result;
}
