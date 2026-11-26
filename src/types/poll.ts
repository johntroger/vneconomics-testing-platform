export type PollQuestionType =
  | 'MULTIPLE_CHOICE'
  | 'WORD_CLOUD'
  | 'OPEN_ENDED'
  | 'SCALES'
  | 'RANKING';

export type PollChartType = 'BAR' | 'HORIZONTAL_BAR' | 'DONUT' | 'DOTS';

export type OpenEndedLayout = 'GRID' | 'FLOW';

export const POLL_COLORS = [
  '#4F46E5', // Indigo
  '#F43F5E', // Rose
  '#10B981', // Emerald
  '#F59E0B', // Amber
  '#06B6D4', // Cyan
  '#8B5CF6', // Violet
  '#EC4899', // Pink
  '#3B82F6', // Blue
  '#14B8A6', // Teal
  '#EA580C', // Orange
  '#84CC16', // Lime
  '#6366F1', // Soft Indigo
];

export interface PollOption {
  id: string;
  text: string;
  color?: string | null;
}

export interface PollScaleStatement {
  id: string;
  text: string;
}

export interface PollQuestion {
  id: string;
  type: PollQuestionType;
  title: string;
  description?: string;
  chartType?: PollChartType;
  openEndedLayout?: OpenEndedLayout;
  options?: PollOption[];
  allowMultipleSelections?: boolean;
  maxWordsPerVoter?: number;
  scaleStatements?: PollScaleStatement[];
  scaleMin?: number;
  scaleMax?: number;
  scaleMinLabel?: string;
  scaleMaxLabel?: string;
}

export interface PollSessionMeta {
  id: string;
  title: string;
  pollPin: string;
  status: 'ACTIVE' | 'ENDED' | 'DELETED' | string;
  currentQIndex: number;
  totalQuestions: number;
  isLocked: boolean;
  hideResults: boolean;
  allowMultipleVotes: boolean;
  stateVersion: number;
  createdAt: string;
  updatedAt: string;
  expiresAt?: string | null;
  isAnonymous?: boolean;
}

export interface PollWordCount {
  word: string;
  norm: string;
  count: number;
  hidden?: boolean;
}

export interface PollOpenResponse {
  id: string;
  text: string;
  createdAt: string;
  pinned: boolean;
  hidden?: boolean;
}

export interface PollScaleStat {
  avg: number;
  count: number;
  distribution: Record<string, number>;
}

export interface PollRankingStat {
  optionId: string;
  text: string;
  color?: string | null;
  score: number;
  avgRank: number;
  firstPlaceCount: number;
}

export interface PollAggregation {
  optionCounts: Record<string, number>;
  wordCounts: PollWordCount[];
  openResponses: PollOpenResponse[];
  scaleStats: Record<string, PollScaleStat>;
  rankingStats: PollRankingStat[];
}

export interface PollLiveSnapshot {
  ok: boolean;
  session: PollSessionMeta;
  questions: PollQuestion[];
  currentQuestion: PollQuestion | null;
  totalVoters: number;
  totalVotesCurrent: number;
  aggregation: PollAggregation;
  hiddenItems: string[];
  pinnedItems: string[];
}

export interface PollListItem {
  id: string;
  title: string;
  pollPin: string;
  status: string;
  totalQuestions: number;
  currentQIndex: number;
  voterCount: number;
  createdAt: string;
  updatedAt: string;
  expiresAt?: string | null;
  isAnonymous?: boolean;
}

export interface CreatePollPayload {
  title: string;
  questions: PollQuestion[];
  allowMultipleVotes?: boolean;
  hideResults?: boolean;
}

export interface PollVotePayload {
  optionIds?: string[];
  words?: string[];
  text?: string;
  ratings?: Record<string, number>;
  rankedOptionIds?: string[];
}
