import {
  apiRequestDetailed,
  getOrCreateDeviceToken,
  pingPhpApi,
} from './apiClient';
import {
  gradeMicroEssayRubric,
  normalizeDecimalInput,
} from '../utils/dynamicQuestionEngine';
import type { Question } from '../types/exam';
import type {
  CreateGamePayload,
  GameHostView,
  GameMode,
  GamePlayer,
  GamePlayerView,
  GamePollResponse,
  GameQuestionSnapshot,
  GameReaction,
  GameState,
  PowerupType,
  TeamStanding,
} from '../types/game';

const LOCAL_GAMES_KEY = 'vne_live_games_demo_v1';
const GAME_SYNC_CHANNEL = 'vne_game_sync_channel';

interface LocalAnswerRecord {
  playerId: string;
  questionIndex: number;
  answerPayload: string | string[] | Record<string, boolean>;
  isCorrect: boolean;
  earnedRatio: number;
  pointsEarned: number;
}

interface LocalGameRecord {
  id: string;
  title: string;
  gamePin: string;
  gameMode: GameMode;
  teamNames: string[];
  showQuestionOnPlayer: boolean;
  requireStudentCode: boolean;
  isLocked: boolean;
  doubleFinalQuestion: boolean;
  defaultTimeSec: number;
  questionsSnapshot: GameQuestionSnapshot[];
  state: GameState;
  currentQIndex: number;
  questionStartedAtMs: number;
  questionEndsAtMs: number;
  stateVersion: number;
  players: Array<
    GamePlayer & {
      deviceToken: string;
      isKicked: boolean;
      powerupType?: PowerupType;
    }
  >;
  reactions?: GameReaction[];
  answers: LocalAnswerRecord[];
}

let phpAvailableCache: boolean | null = null;

async function isPhpGameAvailable(): Promise<boolean> {
  if (phpAvailableCache !== null) return phpAvailableCache;
  phpAvailableCache = await pingPhpApi();
  return phpAvailableCache;
}

function broadcastGameUpdate(sessionId: string): void {
  try {
    const ch = new BroadcastChannel(GAME_SYNC_CHANNEL);
    ch.postMessage({ type: 'GAME_UPDATED', sessionId, at: Date.now() });
    ch.close();
  } catch {
    // Ignore if BroadcastChannel unsupported
  }
}

export function subscribeLocalGameUpdates(
  onUpdate: (sessionId: string) => void,
): () => void {
  let ch: BroadcastChannel | null = null;
  try {
    ch = new BroadcastChannel(GAME_SYNC_CHANNEL);
    ch.onmessage = (ev) => {
      if (ev.data?.type === 'GAME_UPDATED' && typeof ev.data.sessionId === 'string') {
        onUpdate(ev.data.sessionId);
      }
    };
  } catch {
    ch = null;
  }
  const onStorage = (e: StorageEvent) => {
    if (e.key === LOCAL_GAMES_KEY) {
      onUpdate('*');
    }
  };
  window.addEventListener('storage', onStorage);
  return () => {
    ch?.close();
    window.removeEventListener('storage', onStorage);
  };
}

function readLocalGames(): Record<string, LocalGameRecord> {
  try {
    const raw = localStorage.getItem(LOCAL_GAMES_KEY);
    return raw ? (JSON.parse(raw) as Record<string, LocalGameRecord>) : {};
  } catch {
    return {};
  }
}

function writeLocalGames(games: Record<string, LocalGameRecord>): void {
  localStorage.setItem(LOCAL_GAMES_KEY, JSON.stringify(games));
}

function rankLocalPlayers(game: LocalGameRecord): GamePlayer[] {
  const active = game.players.filter((p) => !p.isKicked);
  active.sort((a, b) => b.score - a.score || b.correctCount - a.correctCount);
  return active.map((p, idx) => ({
    id: p.id,
    nickname: p.nickname,
    studentCode: p.studentCode,
    teamName: p.teamName ?? '',
    avatarId: p.avatarId ?? 'fox',
    score: p.score,
    prevRank: p.prevRank,
    rank: idx + 1,
    streak: p.streak,
    correctCount: p.correctCount,
  }));
}

function rankLocalTeams(players: GamePlayer[], teamNames: string[]): TeamStanding[] {
  const map = new Map<string, { memberCount: number; totalScore: number }>();
  for (const tn of teamNames) {
    if (tn.trim()) map.set(tn.trim(), { memberCount: 0, totalScore: 0 });
  }
  for (const p of players) {
    const tn = (p.teamName ?? '').trim();
    if (!tn) continue;
    const entry = map.get(tn) ?? { memberCount: 0, totalScore: 0 };
    entry.memberCount += 1;
    entry.totalScore += p.score;
    map.set(tn, entry);
  }
  const list = Array.from(map.entries()).map(([teamName, val]) => ({
    teamName,
    memberCount: val.memberCount,
    totalScore: val.totalScore,
    avgScore: val.memberCount > 0 ? Math.round(val.totalScore / val.memberCount) : 0,
    rank: 0,
  }));
  list.sort((a, b) => b.avgScore - a.avgScore || b.totalScore - a.totalScore);
  return list.map((t, i) => ({ ...t, rank: i + 1 }));
}

function gradeLocalAnswer(
  q: GameQuestionSnapshot,
  payload: string | string[] | Record<string, boolean>,
): { isCorrect: boolean; earnedRatio: number } {
  if (q.type === 'SINGLE_CHOICE') {
    const chosen = typeof payload === 'string' ? payload : '';
    const ok = Boolean(chosen) && (q.correctOptionIds ?? []).includes(chosen);
    return { isCorrect: ok, earnedRatio: ok ? 1 : 0 };
  }
  if (q.type === 'MULTI_CHOICE') {
    const selected = Array.isArray(payload) ? Array.from(new Set(payload)) : [];
    const correctIds = q.correctOptionIds ?? [];
    if (correctIds.length === 0) return { isCorrect: false, earnedRatio: 0 };
    const hasWrong = selected.some((id) => !correctIds.includes(id));
    const hits = selected.filter((id) => correctIds.includes(id)).length;
    const isExact = !hasWrong && hits === correctIds.length;
    const ratio = isExact
      ? 1
      : Math.max(0, (hits - (hasWrong ? 1 : 0)) / correctIds.length);
    return { isCorrect: isExact, earnedRatio: Math.round(ratio * 10000) / 10000 };
  }
  if (q.type === 'TRUE_FALSE') {
    const map =
      payload && typeof payload === 'object' && !Array.isArray(payload)
        ? (payload as Record<string, boolean>)
        : {};
    const items = q.trueFalseItems ?? [];
    if (items.length === 0) return { isCorrect: false, earnedRatio: 0 };
    let correctCount = 0;
    for (const item of items) {
      if (map[item.id] === item.answer) correctCount += 1;
    }
    const isExact = correctCount === items.length;
    if (items.length === 4) {
      const weights: Record<number, number> = { 0: 0, 1: 0.1, 2: 0.25, 3: 0.5, 4: 1 };
      return { isCorrect: isExact, earnedRatio: weights[correctCount] ?? 0 };
    }
    return { isCorrect: isExact, earnedRatio: Math.round((correctCount / items.length) * 10000) / 10000 };
  }
  if (q.type === 'NUMERICAL') {
    const raw = typeof payload === 'string' ? payload : String(payload ?? '');
    const parsed = normalizeDecimalInput(raw);
    if (parsed === null) return { isCorrect: false, earnedRatio: 0 };
    const expected = q.expectedValue ?? 0;
    const tol = q.tolerance ?? 0.01;
    const ok = Math.abs(parsed - expected) <= tol;
    return { isCorrect: ok, earnedRatio: ok ? 1 : 0 };
  }
  if (q.type === 'ESSAY') {
    const raw = typeof payload === 'string' ? payload.trim() : '';
    if (!raw) return { isCorrect: false, earnedRatio: 0 };
    const fakeQ: Question = {
      id: q.id,
      courseId: '',
      chapterCategory: '',
      difficulty: 'MEDIUM',
      type: 'ESSAY',
      content: q.content,
      gradingRubric: q.gradingRubric ?? [],
      points: 1,
    };
    const res = gradeMicroEssayRubric(fakeQ, raw, {}, 1);
    const ratio = res.maxPoints > 0 ? Math.min(1, Math.max(0, res.earnedPoints / res.maxPoints)) : 0;
    return { isCorrect: ratio >= 0.999, earnedRatio: Math.round(ratio * 10000) / 10000 };
  }
  return { isCorrect: false, earnedRatio: 0 };
}

function sanitizeLocalQuestion(
  q: GameQuestionSnapshot,
  showQuestionOnPlayer: boolean,
  reveal: boolean,
): GameQuestionSnapshot {
  return {
    id: q.id,
    sourceQuestionId: q.sourceQuestionId,
    type: q.type,
    timeLimitSec: q.timeLimitSec,
    isDoublePoints: q.isDoublePoints,
    content: showQuestionOnPlayer || q.type === 'TRUE_FALSE' ? q.content : '',
    options: q.options?.map((o) => ({
      id: o.id,
      text: showQuestionOnPlayer ? o.text : '',
    })),
    correctOptionIds: reveal ? q.correctOptionIds : undefined,
    trueFalseItems: q.trueFalseItems?.map((it) => ({
      id: it.id,
      statement:
        showQuestionOnPlayer || (q.trueFalseItems?.length ?? 0) > 1
          ? it.statement
          : '',
      answer: reveal ? it.answer : false,
    })),
    numericalUnit: q.numericalUnit,
    expectedValue: reveal ? q.expectedValue : undefined,
    tolerance: reveal ? q.tolerance : undefined,
    sampleAnswer: reveal ? q.sampleAnswer : undefined,
  };
}

export interface GameListItem {
  id: string;
  title: string;
  gamePin: string;
  gameMode: GameMode;
  state: GameState;
  totalQuestions: number;
  playerCount: number;
  createdAt: string;
}

export async function fetchInstructorGames(): Promise<GameListItem[]> {
  if (await isPhpGameAvailable()) {
    const res = await apiRequestDetailed<{ ok: boolean; games: GameListItem[] }>(
      '/api/game.php?action=list',
      { method: 'GET' },
    );
    if (res.reachedJson && res.ok && res.data?.games) {
      return res.data.games;
    }
  }

  const games = readLocalGames();
  return Object.values(games)
    .map((g) => ({
      id: g.id,
      title: g.title,
      gamePin: g.gamePin,
      gameMode: g.gameMode ?? ('CLASSIC' as GameMode),
      state: g.state,
      totalQuestions: g.questionsSnapshot.length,
      playerCount: g.players.filter((p) => !p.isKicked).length,
      createdAt: new Date().toISOString(),
    }))
    .reverse();
}

export async function createLiveGame(
  payload: CreateGamePayload,
): Promise<{ ok: boolean; sessionId?: string; gamePin?: string; error?: string }> {
  if (await isPhpGameAvailable()) {
    const res = await apiRequestDetailed<{
      ok: boolean;
      sessionId: string;
      gamePin: string;
      error?: string;
    }>('/api/game.php?action=create', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (res.reachedJson) {
      return res.ok && res.data
        ? { ok: true, sessionId: res.data.sessionId, gamePin: res.data.gamePin }
        : { ok: false, error: res.error ?? 'Không thể tạo phòng game.' };
    }
  }

  const games = readLocalGames();
  const id = `game_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const gamePin = String(Math.floor(100000 + Math.random() * 900000));
  const gameMode: GameMode = payload.gameMode === 'TEAM' ? 'TEAM' : 'CLASSIC';
  const teamNames =
    gameMode === 'TEAM'
      ? (payload.teamNames?.filter((t) => t.trim()) ?? ['Đội Đỏ', 'Đội Xanh', 'Đội Vàng', 'Đội Lục'])
      : [];
  games[id] = {
    id,
    title: payload.title,
    gamePin,
    gameMode,
    teamNames,
    showQuestionOnPlayer: payload.showQuestionOnPlayer,
    requireStudentCode: payload.requireStudentCode,
    isLocked: false,
    doubleFinalQuestion: payload.doubleFinalQuestion,
    defaultTimeSec: payload.defaultTimeSec,
    questionsSnapshot: payload.questionsSnapshot,
    state: 'LOBBY',
    currentQIndex: 0,
    questionStartedAtMs: 0,
    questionEndsAtMs: 0,
    stateVersion: 1,
    players: [],
    answers: [],
  };
  writeLocalGames(games);
  broadcastGameUpdate(id);
  return { ok: true, sessionId: id, gamePin };
}

export async function lookupGamePin(pin: string): Promise<{
  ok: boolean;
  sessionId?: string;
  title?: string;
  gameMode?: GameMode;
  teamNames?: string[];
  requireStudentCode?: boolean;
  isLocked?: boolean;
  error?: string;
}> {
  if (await isPhpGameAvailable()) {
    const res = await apiRequestDetailed<{
      ok: boolean;
      sessionId: string;
      title: string;
      gameMode?: GameMode;
      teamNames?: string[];
      requireStudentCode: boolean;
      isLocked: boolean;
    }>(`/api/game.php?action=lookup_pin&pin=${encodeURIComponent(pin.trim())}`, {
      method: 'GET',
    });
    if (res.reachedJson) {
      return res.ok && res.data
        ? res.data
        : { ok: false, error: res.error ?? 'Mã PIN không hợp lệ.' };
    }
  }

  const games = readLocalGames();
  const found = Object.values(games).find(
    (g) => g.gamePin === pin.trim() && g.state !== 'ENDED',
  );
  if (!found) {
    return { ok: false, error: 'Mã PIN không tồn tại hoặc trò chơi đã kết thúc.' };
  }
  return {
    ok: true,
    sessionId: found.id,
    title: found.title,
    gameMode: found.gameMode ?? 'CLASSIC',
    teamNames: found.teamNames ?? [],
    requireStudentCode: found.requireStudentCode,
    isLocked: found.isLocked,
  };
}

export async function joinLiveGame(params: {
  gamePin: string;
  nickname: string;
  studentCode?: string;
  teamName?: string;
  avatarId?: string;
}): Promise<{
  ok: boolean;
  sessionId?: string;
  playerId?: string;
  nickname?: string;
  teamName?: string;
  avatarId?: string;
  error?: string;
}> {
  const deviceToken = getOrCreateDeviceToken();
  if (await isPhpGameAvailable()) {
    const res = await apiRequestDetailed<{
      ok: boolean;
      sessionId: string;
      playerId: string;
      nickname: string;
    }>('/api/game.php?action=join', {
      method: 'POST',
      body: JSON.stringify({ ...params, deviceToken }),
    });
    if (res.reachedJson) {
      return res.ok && res.data
        ? res.data
        : { ok: false, error: res.error ?? 'Không thể tham gia phòng.' };
    }
  }

  const games = readLocalGames();
  const game = Object.values(games).find(
    (g) => g.gamePin === params.gamePin.trim() && g.state !== 'ENDED',
  );
  if (!game) {
    return { ok: false, error: 'Phòng game không tồn tại hoặc đã kết thúc.' };
  }
  const existing = game.players.find((p) => p.deviceToken === deviceToken);
  if (existing) {
    if (existing.isKicked) {
      return { ok: false, error: 'Bạn đã bị giảng viên mời khỏi phòng chơi này.' };
    }
    return {
      ok: true,
      sessionId: game.id,
      playerId: existing.id,
      nickname: existing.nickname,
    };
  }
  if (game.isLocked) {
    return { ok: false, error: 'Phòng chơi đã khóa.' };
  }
  if (game.requireStudentCode && !params.studentCode?.trim()) {
    return { ok: false, error: 'Phòng này yêu cầu nhập MSSV.' };
  }
  const playerId = `gpl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  let assignedTeam = '';
  if (game.gameMode === 'TEAM') {
    const tNames = game.teamNames?.length ? game.teamNames : ['Đội Đỏ', 'Đội Xanh'];
    if (params.teamName && tNames.includes(params.teamName)) {
      assignedTeam = params.teamName;
    } else {
      const counts = new Map<string, number>(tNames.map((t) => [t, 0]));
      for (const p of game.players) {
        if (!p.isKicked && p.teamName && counts.has(p.teamName)) {
          counts.set(p.teamName, (counts.get(p.teamName) ?? 0) + 1);
        }
      }
      assignedTeam = Array.from(counts.entries()).sort((a, b) => a[1] - b[1])[0][0];
    }
  }
  game.players.push({
    id: playerId,
    nickname: params.nickname.trim().slice(0, 40),
    studentCode: (params.studentCode ?? '').trim().toUpperCase(),
    teamName: assignedTeam,
    avatarId: params.avatarId || 'fox',
    powerupType: '',
    deviceToken,
    score: 0,
    prevRank: 0,
    rank: game.players.length + 1,
    streak: 0,
    correctCount: 0,
    isKicked: false,
  });
  game.stateVersion += 1;
  writeLocalGames(games);
  broadcastGameUpdate(game.id);
  return {
    ok: true,
    sessionId: game.id,
    playerId,
    nickname: params.nickname.trim(),
    teamName: assignedTeam,
    avatarId: params.avatarId || 'fox',
  };
}

export async function sendGameReaction(gamePin: string, emoji: string): Promise<void> {
  if (await isPhpGameAvailable()) {
    await apiRequestDetailed('/api/game.php?action=react', {
      method: 'POST',
      body: JSON.stringify({ gamePin, emoji }),
    });
    return;
  }
  const games = readLocalGames();
  const game = Object.values(games).find((g) => g.gamePin === gamePin);
  if (!game) return;
  const cutoff = Date.now() - 5000;
  const next = (game.reactions ?? []).filter((r) => (r.t ?? 0) >= cutoff);
  next.push({
    id: `rx_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    e: emoji,
    t: Date.now(),
  });
  game.reactions = next.slice(-25);
  writeLocalGames(games);
  broadcastGameUpdate(game.id);
}

export async function pollGameStatus(pin: string): Promise<GamePollResponse | null> {
  if (await isPhpGameAvailable()) {
    const res = await apiRequestDetailed<GamePollResponse>(
      `/api/game.php?action=poll&pin=${encodeURIComponent(pin)}`,
      { method: 'GET' },
    );
    if (res.reachedJson && res.ok && res.data) {
      return res.data;
    }
  }

  const games = readLocalGames();
  const game = Object.values(games).find((g) => g.gamePin === pin);
  if (!game) return null;
  const activePlayers = game.players.filter((p) => !p.isKicked).length;
  const answered = game.answers.filter((a) => a.questionIndex === game.currentQIndex).length;
  const cutoff = Date.now() - 5000;
  const rx = (game.reactions ?? []).filter((r) => (r.t ?? 0) >= cutoff);
  return {
    ok: true,
    id: game.id,
    s: game.state,
    q: game.currentQIndex,
    v: game.stateVersion,
    start: game.questionStartedAtMs,
    end: game.questionEndsAtMs,
    now: Date.now(),
    pc: activePlayers,
    ac: answered,
    lk: game.isLocked ? 1 : 0,
    rx,
  };
}

export async function fetchGameHostView(sessionId: string): Promise<GameHostView | null> {
  if (await isPhpGameAvailable()) {
    const res = await apiRequestDetailed<GameHostView>(
      `/api/game.php?action=host_view&sessionId=${encodeURIComponent(sessionId)}`,
      { method: 'GET' },
    );
    if (res.reachedJson && res.ok && res.data) {
      return res.data;
    }
  }

  const games = readLocalGames();
  const game = games[sessionId];
  if (!game) return null;
  const ranked = rankLocalPlayers(game);
  const ansRows = game.answers.filter((a) => a.questionIndex === game.currentQIndex);
  const optionCounts: Record<string, number> = {};
  const textBuckets = new Map<string, { label: string; count: number; isCorrect: boolean }>();
  let correctAnsweredCount = 0;
  for (const ar of ansRows) {
    if (ar.isCorrect) correctAnsweredCount += 1;
    if (typeof ar.answerPayload === 'string') {
      optionCounts[ar.answerPayload] = (optionCounts[ar.answerPayload] ?? 0) + 1;
      const label = ar.answerPayload.trim().slice(0, 60);
      if (label) {
        const key = label.toLowerCase();
        const existing = textBuckets.get(key) ?? { label, count: 0, isCorrect: ar.isCorrect };
        existing.count += 1;
        if (ar.isCorrect) existing.isCorrect = true;
        textBuckets.set(key, existing);
      }
    } else if (Array.isArray(ar.answerPayload)) {
      for (const id of ar.answerPayload) {
        optionCounts[id] = (optionCounts[id] ?? 0) + 1;
      }
    } else if (ar.answerPayload && typeof ar.answerPayload === 'object') {
      for (const [k, v] of Object.entries(ar.answerPayload)) {
        const key = `${k}:${v ? 'T' : 'F'}`;
        optionCounts[key] = (optionCounts[key] ?? 0) + 1;
      }
    }
  }
  const topAnswers = Array.from(textBuckets.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const teamLeaderboard =
    game.gameMode === 'TEAM' ? rankLocalTeams(ranked, game.teamNames ?? []) : [];

  return {
    ok: true,
    session: {
      id: game.id,
      title: game.title,
      gamePin: game.gamePin,
      gameMode: game.gameMode ?? 'CLASSIC',
      teamNames: game.teamNames ?? [],
      showQuestionOnPlayer: game.showQuestionOnPlayer,
      requireStudentCode: game.requireStudentCode,
      isLocked: game.isLocked,
      doubleFinalQuestion: game.doubleFinalQuestion,
      state: game.state,
      currentQIndex: game.currentQIndex,
      totalQuestions: game.questionsSnapshot.length,
      questionStartedAtMs: game.questionStartedAtMs,
      questionEndsAtMs: game.questionEndsAtMs,
      stateVersion: game.stateVersion,
      serverNowMs: Date.now(),
    },
    currentQuestion: game.questionsSnapshot[game.currentQIndex] ?? null,
    players: ranked,
    teamLeaderboard,
    answeredCount: ansRows.length,
    correctAnsweredCount,
    optionCounts,
    topAnswers,
  };
}

export async function advanceGameState(
  sessionId: string,
  targetState?: GameState,
): Promise<boolean> {
  if (await isPhpGameAvailable()) {
    const res = await apiRequestDetailed<{ ok: boolean }>('/api/game.php?action=next_state', {
      method: 'POST',
      body: JSON.stringify({ sessionId, targetState }),
    });
    if (res.reachedJson) return res.ok;
  }

  const games = readLocalGames();
  const game = games[sessionId];
  if (!game) return false;
  const totalQ = game.questionsSnapshot.length;
  const now = Date.now();

  if (targetState) {
    game.state = targetState;
  } else if (game.state === 'LOBBY') {
    game.currentQIndex = 0;
    game.state = 'QUESTION_INTRO';
    game.questionStartedAtMs = now;
    game.questionEndsAtMs = now + 3000;
  } else if (game.state === 'QUESTION_INTRO') {
    game.state = 'QUESTION_ACTIVE';
    const qTime = game.questionsSnapshot[game.currentQIndex]?.timeLimitSec ?? game.defaultTimeSec;
    game.questionStartedAtMs = now;
    game.questionEndsAtMs = now + qTime * 1000;
    const ranked = rankLocalPlayers(game);
    for (const p of game.players) {
      const r = ranked.find((rp) => rp.id === p.id);
      if (r) p.prevRank = r.rank;
    }
  } else if (game.state === 'QUESTION_ACTIVE') {
    game.state = 'QUESTION_RESULT';
    game.questionEndsAtMs = now;
  } else if (game.state === 'QUESTION_RESULT') {
    game.state = game.currentQIndex + 1 >= totalQ ? 'ENDED' : 'LEADERBOARD';
  } else if (game.state === 'LEADERBOARD') {
    if (game.currentQIndex + 1 >= totalQ) {
      game.state = 'ENDED';
    } else {
      game.currentQIndex += 1;
      game.state = 'QUESTION_INTRO';
      game.questionStartedAtMs = now;
      game.questionEndsAtMs = now + 3000;
    }
  }
  game.stateVersion += 1;
  writeLocalGames(games);
  broadcastGameUpdate(sessionId);
  return true;
}

export async function toggleGameLock(sessionId: string): Promise<boolean | null> {
  if (await isPhpGameAvailable()) {
    const res = await apiRequestDetailed<{ ok: boolean; isLocked: boolean }>(
      '/api/game.php?action=toggle_lock',
      { method: 'POST', body: JSON.stringify({ sessionId }) },
    );
    if (res.reachedJson && res.ok && res.data) return res.data.isLocked;
  }
  const games = readLocalGames();
  const game = games[sessionId];
  if (!game) return null;
  game.isLocked = !game.isLocked;
  game.stateVersion += 1;
  writeLocalGames(games);
  broadcastGameUpdate(sessionId);
  return game.isLocked;
}

export async function kickGamePlayer(sessionId: string, playerId: string): Promise<boolean> {
  if (await isPhpGameAvailable()) {
    const res = await apiRequestDetailed<{ ok: boolean }>('/api/game.php?action=kick_player', {
      method: 'POST',
      body: JSON.stringify({ sessionId, playerId }),
    });
    if (res.reachedJson) return res.ok;
  }
  const games = readLocalGames();
  const game = games[sessionId];
  if (!game) return false;
  const p = game.players.find((x) => x.id === playerId);
  if (p) p.isKicked = true;
  game.stateVersion += 1;
  writeLocalGames(games);
  broadcastGameUpdate(sessionId);
  return true;
}

export async function fetchGamePlayerView(
  sessionId: string,
  playerId: string,
): Promise<{ ok: boolean; data?: GamePlayerView; error?: string }> {
  if (await isPhpGameAvailable()) {
    const res = await apiRequestDetailed<GamePlayerView>(
      `/api/game.php?action=player_state&sessionId=${encodeURIComponent(sessionId)}&playerId=${encodeURIComponent(playerId)}`,
      { method: 'GET' },
    );
    if (res.reachedJson) {
      return res.ok && res.data
        ? { ok: true, data: res.data }
        : { ok: false, error: res.error ?? 'Không thể tải trạng thái.' };
    }
  }

  const games = readLocalGames();
  const game = games[sessionId];
  if (!game) return { ok: false, error: 'Không tìm thấy phòng game.' };
  const player = game.players.find((p) => p.id === playerId && !p.isKicked);
  if (!player) return { ok: false, error: 'Bạn đã bị mời khỏi phòng hoặc phiên không tồn tại.' };

  const ranked = rankLocalPlayers(game);
  const idx = ranked.findIndex((r) => r.id === playerId);
  const myRank = idx >= 0 ? ranked[idx].rank : 0;
  const gapToAbove = idx > 0 ? Math.max(0, ranked[idx - 1].score - ranked[idx].score) : 0;
  const curQ = game.questionsSnapshot[game.currentQIndex] ?? null;
  const reveal =
    game.state === 'QUESTION_RESULT' ||
    game.state === 'LEADERBOARD' ||
    game.state === 'ENDED';
  const myAns = game.answers.find(
    (a) => a.playerId === playerId && a.questionIndex === game.currentQIndex,
  );

  const teamLeaderboard =
    game.gameMode === 'TEAM' ? rankLocalTeams(ranked, game.teamNames ?? []) : [];
  const myTeamRank =
    teamLeaderboard.find((t) => t.teamName === (player.teamName ?? ''))?.rank ?? 0;

  return {
    ok: true,
    data: {
      ok: true,
      session: {
        id: game.id,
        title: game.title,
        gamePin: game.gamePin,
        gameMode: game.gameMode ?? 'CLASSIC',
        teamNames: game.teamNames ?? [],
        showQuestionOnPlayer: game.showQuestionOnPlayer,
        requireStudentCode: game.requireStudentCode,
        isLocked: game.isLocked,
        doubleFinalQuestion: game.doubleFinalQuestion,
        state: game.state,
        currentQIndex: game.currentQIndex,
        totalQuestions: game.questionsSnapshot.length,
        questionStartedAtMs: game.questionStartedAtMs,
        questionEndsAtMs: game.questionEndsAtMs,
        stateVersion: game.stateVersion,
        serverNowMs: Date.now(),
      },
      player: {
        id: player.id,
        nickname: player.nickname,
        studentCode: player.studentCode,
        teamName: player.teamName ?? '',
        teamRank: myTeamRank,
        avatarId: player.avatarId ?? 'fox',
        powerupType: player.powerupType ?? '',
        score: player.score,
        prevRank: player.prevRank,
        rank: myRank,
        gapToAbove,
        streak: player.streak,
        correctCount: player.correctCount,
        totalPlayers: ranked.length,
      },
      question: curQ ? sanitizeLocalQuestion(curQ, game.showQuestionOnPlayer, reveal) : null,
      myAnswer: myAns
        ? {
            answerPayload: myAns.answerPayload,
            isCorrect: myAns.isCorrect,
            earnedRatio: myAns.earnedRatio,
            pointsEarned: myAns.pointsEarned,
          }
        : null,
    },
  };
}

export async function submitGameAnswer(params: {
  sessionId: string;
  playerId: string;
  questionIndex: number;
  answerPayload: string | string[] | Record<string, boolean>;
  usePowerup?: PowerupType;
}): Promise<{ ok: boolean; error?: string }> {
  if (await isPhpGameAvailable()) {
    const res = await apiRequestDetailed<{ ok: boolean }>('/api/game.php?action=answer', {
      method: 'POST',
      body: JSON.stringify(params),
    });
    if (res.reachedJson) {
      return res.ok ? { ok: true } : { ok: false, error: res.error };
    }
  }

  const games = readLocalGames();
  const game = games[params.sessionId];
  if (!game) return { ok: false, error: 'Không tìm thấy phòng.' };
  const now = Date.now();
  if (params.questionIndex !== game.currentQIndex) {
    return { ok: false, error: 'Câu hỏi đã chuyển.' };
  }
  if (
    game.state !== 'QUESTION_ACTIVE' &&
    !(game.state === 'QUESTION_RESULT' && now <= game.questionEndsAtMs + 1500)
  ) {
    return { ok: false, error: 'Đã hết thời gian trả lời.' };
  }
  const dup = game.answers.find(
    (a) => a.playerId === params.playerId && a.questionIndex === params.questionIndex,
  );
  if (dup) return { ok: true };

  const player = game.players.find((p) => p.id === params.playerId && !p.isKicked);
  const curQ = game.questionsSnapshot[params.questionIndex];
  if (!player || !curQ) return { ok: false, error: 'Dữ liệu không hợp lệ.' };

  const timeLimitMs = Math.max(1000, curQ.timeLimitSec * 1000);
  const responseTimeMs = Math.max(0, Math.min(timeLimitMs, now - game.questionStartedAtMs));
  const { isCorrect, earnedRatio } = gradeLocalAnswer(curQ, params.answerPayload);

  const isFinal = params.questionIndex === game.questionsSnapshot.length - 1;
  const multiplier = isFinal && game.doubleFinalQuestion ? 2 : 1;
  const basePoints = 1000 * multiplier;
  const ownedPowerup: PowerupType = player.powerupType ?? '';
  const usedPowerup: PowerupType =
    params.usePowerup && params.usePowerup === ownedPowerup ? params.usePowerup : '';
  let nextPowerup: PowerupType = usedPowerup ? '' : ownedPowerup;

  let pointsEarned = 0;
  let newStreak = 0;
  if (earnedRatio > 0) {
    const timeRatio = Math.min(1, Math.max(0, responseTimeMs / timeLimitMs));
    const speedScore = Math.round(basePoints * earnedRatio * (1 - timeRatio / 2));
    let streakBonus = 0;
    if (earnedRatio >= 0.999) {
      newStreak = player.streak + 1;
      streakBonus = Math.min((newStreak - 1) * 100, 300);
    } else if (earnedRatio >= 0.5) {
      newStreak = player.streak;
    } else if (usedPowerup === 'SHIELD') {
      newStreak = player.streak;
    }
    pointsEarned = speedScore + streakBonus;
    if (usedPowerup === 'DOUBLE_PTS') {
      pointsEarned *= 2;
    }
  } else if (usedPowerup === 'SHIELD') {
    newStreak = player.streak;
  }

  if (newStreak >= 2 && newStreak % 2 === 0 && !nextPowerup) {
    nextPowerup = Math.random() < 0.5 ? 'DOUBLE_PTS' : 'SHIELD';
  }

  player.score += pointsEarned;
  player.streak = newStreak;
  player.powerupType = nextPowerup;
  if (isCorrect) player.correctCount += 1;

  game.answers.push({
    playerId: params.playerId,
    questionIndex: params.questionIndex,
    answerPayload: params.answerPayload,
    isCorrect,
    earnedRatio,
    pointsEarned,
  });
  game.stateVersion += 1;
  writeLocalGames(games);
  broadcastGameUpdate(game.id);
  return { ok: true };
}
