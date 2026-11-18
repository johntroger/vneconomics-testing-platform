export type QuestionType =
  | 'SINGLE_CHOICE'
  | 'MULTI_CHOICE'
  | 'TRUE_FALSE'
  | 'NUMERICAL'
  | 'FILL_IN_BLANK'
  | 'ESSAY';

export type DifficultyLevel = 'EASY' | 'MEDIUM' | 'HARD';

export type ShuffleModeOption = 'NONE' | 'FULL_RANDOM' | 'BY_CHAPTER' | 'ESSAY_LAST';
export type ShuffleMode = ShuffleModeOption | (string & {});

export type EmailDeliveryMode = 'DELAYED_BATCH' | 'IMMEDIATE';

export type AttemptStatus =
  | 'IN_PROGRESS'
  | 'PAUSED'
  | 'LOCKED'
  | 'SUBMITTED'
  | 'AUTO_SUBMITTED';

export type InstructorRole = 'DEMO' | 'OFFICIAL';

export interface InstructorUser {
  id: string;
  email: string;
  name: string;
  role: InstructorRole;
  authProvider?: string;
  avatarUrl?: string;
}

export interface Course {
  id: string;
  code: string;
  name: string;
  semester: string;
  credits: number;
  ownerId?: string;
}

export interface QuestionOption {
  id: string;
  text: string;
  pinLast?: boolean;
}

export interface TrueFalseStatement {
  id: string;
  statement: string;
  answer: boolean;
}

export interface DynamicVarSpec {
  name: string;
  min: number;
  max: number;
  step: number;
}

export interface RubricSlot {
  id: string;
  label: string;
  points: number;
  /** Các cụm từ đồng nghĩa được chấp nhận trong cùng một vế câu */
  acceptedPhrases: string[];
  /** Các nhóm từ khóa bắt buộc cùng xuất hiện trong 1 vế (VD: [["cung tiền", "ms"], ["giảm", "thu hẹp"]]) */
  requiredPairs?: string[][];
  /** Từ khóa đối lập trong cùng vế sẽ bị loại trừ để chống đoán mò hai chiều */
  oppositeTerms?: string[];
}

export interface BlankSlot {
  id: string;
  index: number;
  acceptedAnswers: string[];
  caseSensitive?: boolean;
}

export interface Question {
  id: string;
  courseId: string;
  ownerId?: string;
  chapterCategory: string;
  difficulty: DifficultyLevel;
  type: QuestionType;
  content: string;
  options?: QuestionOption[];
  correctOptionIds?: string[];
  trueFalseItems?: TrueFalseStatement[];
  blankSlots?: BlankSlot[];
  blankAllOrNothing?: boolean;
  variantGroup?: string;
  dynamicVars?: DynamicVarSpec[];
  numericalFormula?: string;
  numericalUnit?: string;
  tolerance?: number;
  sampleAnswer?: string;
  gradingRubric?: RubricSlot[];
  maxChars?: number;
  aiHoneypotText?: string;
  aiHoneypotOptionId?: string;
  aiHoneypotKeyword?: string;
  points: number;
}

export interface ChapterQuotaRule {
  chapterCategory: string;
  questionCount: number;
  percent?: number;
  /** Phân bổ số lượng cụ thể theo độ khó (nếu bỏ trống hoặc bằng 0 hết -> tự cân bằng) */
  easyCount?: number;
  mediumCount?: number;
  hardCount?: number;
  /** Chuẩn hóa điểm cho mọi câu bốc ra từ chương này (Slot Point Normalization) */
  pointsPerQuestion?: number;
}

export interface StudentRosterEntry {
  studentCode: string;
  lastName: string;
  firstName: string;
  gender: string;
  dob: string;
}

export interface Exam {
  id: string;
  courseId: string;
  ownerId?: string;
  title: string;
  roomPin: string;
  unlockPin: string;
  instructorEmail: string;
  durationMinutes: number;
  chapterMatrix: ChapterQuotaRule[];
  pinnedQuestionIds: string[];
  shuffleQuestions: boolean;
  shuffleMode: ShuffleMode;
  shuffleOptions: boolean;
  maxLeaveCount: number;
  maxAwaySeconds: number;
  gracePeriodMs: number;
  oneWayMode: boolean;
  perQuestionSeconds: number;
  canvasAntiOcr: boolean;
  requireFullscreen?: boolean;
  allowReviewAfterSubmit?: boolean;
  emailDeliveryMode: EmailDeliveryMode;
  rosterWhitelist: string[];
  rosterEntries?: StudentRosterEntry[];
  requiresWhitelist?: boolean;
  requiresRosterVerification?: boolean;
  status: 'DRAFT' | 'OPEN' | 'CLOSED';
  lateEntryMinutes?: number;
  scheduledStartAt?: string;
  scheduledEndAt?: string;
  reportSentStatus: 'PENDING' | 'SENT' | 'FAILED';
  reportSentAt?: string;
  createdAt: string;
}

export interface ExamShift {
  id: string;
  examId: string;
  ownerId?: string;
  title: string;
  roomPin: string;
  unlockPin: string;
  status: 'DRAFT' | 'OPEN' | 'CLOSED';
  lateEntryMinutes?: number;
  scheduledStartAt?: string;
  scheduledEndAt?: string;
  rosterWhitelist: string[];
  rosterEntries?: StudentRosterEntry[];
  requiresWhitelist?: boolean;
  requiresRosterVerification?: boolean;
  reportSentStatus: 'PENDING' | 'SENT' | 'FAILED' | 'DEMO_SKIPPED';
  reportSentAt?: string;
  createdAt: string;
}

export interface AssignedQuestionSnapshot {
  questionId: string;
  chapterCategory: string;
  orderIndex: number;
  maxPoints: number;
  seedVars: Record<string, number>;
  renderedContent: string;
  optionOrderIds?: string[];
}

export interface KeystrokeTelemetry {
  typedChars: number;
  durationMs: number;
  suddenJumps: number;
  pasteBlockedCount: number;
}

export interface RubricSlotResult {
  slotId: string;
  label: string;
  earnedPoints: number;
  maxPoints: number;
  matched: boolean;
  matchedText?: string;
  blockedReason?: string;
}

export interface AttemptAnswer {
  questionId: string;
  chapterCategory: string;
  renderedSeedVars: Record<string, number>;
  answerPayload: string | string[] | Record<string, boolean>;
  keystrokeTelemetry?: KeystrokeTelemetry;
  isCorrect: boolean | null;
  maxPoints: number;
  earnedPoints: number;
  gradingFeedback?: string;
  gradingStatus: 'AUTO' | 'RUBRIC_GRADED' | 'MANUAL_OVERRIDE';
  rubricBreakdown?: RubricSlotResult[];
  matchedHighlights?: string[];
  blockedHighlights?: string[];
  honeypotTriggered?: boolean;
}

export interface ViolationEvent {
  id: string;
  severity:
    | 'MINOR_BLUR'
    | 'MAJOR_LEAVE'
    | 'SPLIT_SCREEN'
    | 'DEVTOOLS'
    | 'DUPLICATE_DEVICE'
    | 'HONEYPOT';
  eventType: string;
  durationSeconds: number;
  detail: string;
  occurredAt: string;
}

export interface LoginDeviceEntry {
  deviceToken: string;
  deviceLabel: string;
  lat?: number | null;
  lng?: number | null;
  at: string;
}

export interface ExamAttempt {
  id: string;
  examId: string;
  shiftId?: string;
  studentCode: string;
  studentName: string;
  studentEmail: string;
  className: string;
  deviceToken: string;
  deviceLabel?: string;
  locationLat?: number | null;
  locationLng?: number | null;
  locationAccuracy?: number | null;
  loginDevices?: LoginDeviceEntry[];
  assignedQuestions: AssignedQuestionSnapshot[];
  answers: Record<string, AttemptAnswer>;
  status: AttemptStatus;
  currentQuestionIndex: number;
  flaggedQuestionIds: string[];
  leaveCount: number;
  extraLeaveAllowance: number;
  minorBlurCount: number;
  totalAwaySeconds: number;
  lockedAt?: string;
  lockedWaitSeconds: number;
  bonusSeconds: number;
  unlockRequestNote?: string;
  integrityScore: number;
  aiFlag: boolean;
  aiFlagReason?: string;
  autoScore: number;
  essayScore: number;
  totalScore: number;
  maxTotalScore: number;
  scale10Score: number;
  emailSentStatus: 'PENDING' | 'RECEIPT_SENT' | 'SENT' | 'FAILED' | 'DEMO_SKIPPED';
  emailSentAt?: string;
  emailEditCount: number;
  startedAt: string;
  submittedAt?: string;
  violations: ViolationEvent[];
}

export interface ChapterMasteryStat {
  chapterCategory: string;
  totalGradedQuestions: number;
  earnedPoints: number;
  maxPoints: number;
  masteryPercent: number;
}

export interface EmailLogEntry {
  id: string;
  recipient: string;
  subject: string;
  kind: 'STUDENT_RECEIPT' | 'STUDENT_SCORE' | 'INSTRUCTOR_REPORT' | 'TEST_MAIL';
  status: 'SENT' | 'FAILED' | 'DEMO_SKIPPED';
  summary: string;
  csvAttachmentName?: string;
  sentAt: string;
}
