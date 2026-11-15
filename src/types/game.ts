import type {
  QuestionOption,
  QuestionType,
  RubricSlot,
  TrueFalseStatement,
} from './exam';

export type GameMode = 'CLASSIC' | 'TEAM';

export type GameState =
  | 'LOBBY'
  | 'QUESTION_INTRO'
  | 'QUESTION_ACTIVE'
  | 'QUESTION_RESULT'
  | 'LEADERBOARD'
  | 'ENDED';

export interface GameQuestionSnapshot {
  id: string;
  sourceQuestionId: string;
  type: QuestionType;
  content: string;
  timeLimitSec: number;
  isDoublePoints?: boolean;
  options?: QuestionOption[];
  correctOptionIds?: string[];
  trueFalseItems?: TrueFalseStatement[];
  numericalUnit?: string;
  expectedValue?: number;
  tolerance?: number;
  gradingRubric?: RubricSlot[];
  sampleAnswer?: string;
}

export interface GameSessionSummary {
  id: string;
  title: string;
  gamePin: string;
  gameMode?: GameMode;
  teamNames?: string[];
  showQuestionOnPlayer: boolean;
  requireStudentCode: boolean;
  isLocked: boolean;
  doubleFinalQuestion: boolean;
  state: GameState;
  currentQIndex: number;
  totalQuestions: number;
  questionStartedAtMs: number;
  questionEndsAtMs: number;
  stateVersion: number;
  serverNowMs: number;
}

export interface GamePollResponse {
  ok: boolean;
  id: string;
  s: GameState;
  q: number;
  v: number;
  start: number;
  end: number;
  now: number;
  pc: number;
  ac: number;
  lk: number;
}

export interface GamePlayer {
  id: string;
  nickname: string;
  studentCode: string;
  teamName?: string;
  score: number;
  prevRank: number;
  rank: number;
  streak: number;
  correctCount: number;
}

export interface TeamStanding {
  teamName: string;
  memberCount: number;
  totalScore: number;
  avgScore: number;
  rank: number;
}

export interface GameHostView {
  ok: boolean;
  session: GameSessionSummary;
  currentQuestion: GameQuestionSnapshot | null;
  players: GamePlayer[];
  teamLeaderboard?: TeamStanding[];
  answeredCount: number;
  correctAnsweredCount: number;
  optionCounts: Record<string, number>;
  topAnswers?: Array<{ label: string; count: number; isCorrect: boolean }>;
}

export interface GamePlayerView {
  ok: boolean;
  session: GameSessionSummary;
  player: GamePlayer & {
    teamRank?: number;
    gapToAbove: number;
    totalPlayers: number;
  };
  question: GameQuestionSnapshot | null;
  myAnswer: {
    answerPayload: string | string[] | Record<string, boolean>;
    isCorrect: boolean;
    earnedRatio: number;
    pointsEarned: number;
  } | null;
}

export interface CreateGamePayload {
  title: string;
  courseId?: string;
  gameMode?: GameMode;
  teamNames?: string[];
  showQuestionOnPlayer: boolean;
  requireStudentCode: boolean;
  doubleFinalQuestion: boolean;
  defaultTimeSec: number;
  questionsSnapshot: GameQuestionSnapshot[];
}

export interface GameOptionStyle {
  letter: string;
  shape: '▲' | '◆' | '●' | '■' | '★' | '✚';
  bg: string;
  hover: string;
  ring: string;
  barBg: string;
}

export const GAME_OPTION_STYLES: GameOptionStyle[] = [
  {
    letter: 'A',
    shape: '▲',
    bg: 'bg-rose-600',
    hover: 'hover:bg-rose-500 active:bg-rose-700',
    ring: 'ring-rose-300',
    barBg: 'bg-rose-500',
  },
  {
    letter: 'B',
    shape: '◆',
    bg: 'bg-blue-600',
    hover: 'hover:bg-blue-500 active:bg-blue-700',
    ring: 'ring-blue-300',
    barBg: 'bg-blue-500',
  },
  {
    letter: 'C',
    shape: '●',
    bg: 'bg-amber-500',
    hover: 'hover:bg-amber-400 active:bg-amber-600',
    ring: 'ring-amber-200',
    barBg: 'bg-amber-500',
  },
  {
    letter: 'D',
    shape: '■',
    bg: 'bg-emerald-600',
    hover: 'hover:bg-emerald-500 active:bg-emerald-700',
    ring: 'ring-emerald-300',
    barBg: 'bg-emerald-500',
  },
  {
    letter: 'E',
    shape: '★',
    bg: 'bg-violet-600',
    hover: 'hover:bg-violet-500 active:bg-violet-700',
    ring: 'ring-violet-300',
    barBg: 'bg-violet-500',
  },
  {
    letter: 'F',
    shape: '✚',
    bg: 'bg-cyan-600',
    hover: 'hover:bg-cyan-500 active:bg-cyan-700',
    ring: 'ring-cyan-300',
    barBg: 'bg-cyan-500',
  },
];
