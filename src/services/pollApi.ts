import {
  apiRequestDetailed,
  getOrCreateDeviceToken,
  pingPhpApi,
} from './apiClient';
import type {
  CreatePollPayload,
  OpenEndedLayout,
  PollAggregation,
  PollChartType,
  PollListItem,
  PollLiveSnapshot,
  PollQuestion,
  PollVotePayload,
} from '../types/poll';

const LOCAL_POLLS_KEY = 'vne_quick_polls_demo_v1';
const POLL_HOST_KEYS_STORAGE = 'vne_poll_host_keys_v1';
const POLL_SYNC_CHANNEL = 'vne_poll_sync_channel';

export interface LocalPollVoteRecord {
  id: string;
  questionIndex: number;
  deviceToken: string;
  voterName: string;
  payload: PollVotePayload;
  createdAt: string;
}

interface LocalPollRecord {
  id: string;
  title: string;
  pollPin: string;
  hostKey: string;
  status: 'ACTIVE' | 'ENDED' | string;
  questions: PollQuestion[];
  currentQIndex: number;
  isLocked: boolean;
  hideResults: boolean;
  allowMultipleVotes: boolean;
  hiddenItems: string[];
  pinnedItems: string[];
  stateVersion: number;
  createdAt: string;
  updatedAt: string;
  expiresAt: string | null;
  votes: LocalPollVoteRecord[];
}

let phpAvailableCache: boolean | null = null;

async function isPhpPollAvailable(): Promise<boolean> {
  if (phpAvailableCache !== null) return phpAvailableCache;
  phpAvailableCache = await pingPhpApi();
  return phpAvailableCache;
}

export function getSavedPollHostKeys(): Record<string, string> {
  try {
    const raw = localStorage.getItem(POLL_HOST_KEYS_STORAGE);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

export function getSavedPollHostKey(sessionId: string): string {
  return getSavedPollHostKeys()[sessionId] ?? '';
}

export function savePollHostKey(sessionId: string, hostKey: string): void {
  try {
    const map = getSavedPollHostKeys();
    map[sessionId] = hostKey;
    localStorage.setItem(POLL_HOST_KEYS_STORAGE, JSON.stringify(map));
  } catch {
    // Ignore storage errors
  }
}

export function removeSavedPollHostKey(sessionId: string): void {
  try {
    const map = getSavedPollHostKeys();
    delete map[sessionId];
    localStorage.setItem(POLL_HOST_KEYS_STORAGE, JSON.stringify(map));
  } catch {
    // Ignore storage errors
  }
}

function broadcastPollUpdate(sessionId: string, pollPin?: string): void {
  try {
    const ch = new BroadcastChannel(POLL_SYNC_CHANNEL);
    ch.postMessage({ type: 'POLL_UPDATED', sessionId, pollPin, at: Date.now() });
    ch.close();
  } catch {
    // Ignore if BroadcastChannel unsupported
  }
}

export function subscribeLocalPollUpdates(
  onUpdate: (sessionId: string, pollPin?: string) => void,
): () => void {
  let ch: BroadcastChannel | null = null;
  try {
    ch = new BroadcastChannel(POLL_SYNC_CHANNEL);
    ch.onmessage = (ev) => {
      if (ev.data?.type === 'POLL_UPDATED' && typeof ev.data.sessionId === 'string') {
        onUpdate(ev.data.sessionId, typeof ev.data.pollPin === 'string' ? ev.data.pollPin : undefined);
      }
    };
  } catch {
    ch = null;
  }
  const onStorage = (e: StorageEvent) => {
    if (e.key === LOCAL_POLLS_KEY) {
      onUpdate('*');
    }
  };
  window.addEventListener('storage', onStorage);
  return () => {
    ch?.close();
    window.removeEventListener('storage', onStorage);
  };
}

function readLocalPolls(): Record<string, LocalPollRecord> {
  try {
    const raw = localStorage.getItem(LOCAL_POLLS_KEY);
    return raw ? (JSON.parse(raw) as Record<string, LocalPollRecord>) : {};
  } catch {
    return {};
  }
}

function writeLocalPolls(polls: Record<string, LocalPollRecord>): void {
  localStorage.setItem(LOCAL_POLLS_KEY, JSON.stringify(polls));
}

export function aggregatePollVotes(
  question: PollQuestion | null,
  votes: Array<{ id: string; payload: PollVotePayload; createdAt: string }>,
  hiddenItems: string[] = [],
  pinnedItems: string[] = [],
  includeHidden = false,
  questionIndex = 0,
): PollAggregation {
  const hiddenSet = new Set(hiddenItems);
  const pinnedSet = new Set(pinnedItems);

  const aggregation: PollAggregation = {
    optionCounts: {},
    wordCounts: [],
    openResponses: [],
    scaleStats: {},
    rankingStats: [],
  };

  if (!question) return aggregation;

  if (question.type === 'MULTIPLE_CHOICE') {
    const counts: Record<string, number> = {};
    for (const opt of question.options ?? []) {
      counts[opt.id] = 0;
    }
    for (const v of votes) {
      for (const oid of v.payload.optionIds ?? []) {
        if (oid in counts) {
          counts[oid] += 1;
        }
      }
    }
    aggregation.optionCounts = counts;
  } else if (question.type === 'WORD_CLOUD') {
    const map = new Map<string, { word: string; norm: string; count: number; hidden: boolean }>();
    for (const v of votes) {
      for (const rawW of v.payload.words ?? []) {
        const clean = String(rawW ?? '').replace(/\s+/g, ' ').trim();
        if (!clean) continue;
        const norm = clean.toLocaleLowerCase();
        const hideKey = `word:${questionIndex}:${norm}`;
        const isHidden = hiddenSet.has(hideKey);
        if (isHidden && !includeHidden) continue;
        const existing = map.get(norm);
        if (existing) {
          existing.count += 1;
        } else {
          map.set(norm, { word: clean, norm, count: 1, hidden: isHidden });
        }
      }
    }
    aggregation.wordCounts = Array.from(map.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 80);
  } else if (question.type === 'OPEN_ENDED') {
    const list = votes
      .map((v) => {
        const text = String(v.payload.text ?? '').trim();
        if (!text) return null;
        const isHidden = hiddenSet.has(`resp:${v.id}`);
        if (isHidden && !includeHidden) return null;
        return {
          id: v.id,
          text,
          createdAt: v.createdAt,
          pinned: pinnedSet.has(`resp:${v.id}`),
          hidden: isHidden,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    list.sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return b.createdAt.localeCompare(a.createdAt);
    });
    aggregation.openResponses = list;
  } else if (question.type === 'SCALES') {
    const min = question.scaleMin ?? 1;
    const max = question.scaleMax ?? 5;
    const acc = new Map<string, { sum: number; count: number; distribution: Record<string, number> }>();
    for (const st of question.scaleStatements ?? []) {
      const dist: Record<string, number> = {};
      for (let v = min; v <= max; v += 1) dist[String(v)] = 0;
      acc.set(st.id, { sum: 0, count: 0, distribution: dist });
    }
    for (const vr of votes) {
      const ratings = vr.payload.ratings ?? {};
      for (const [stid, rawVal] of Object.entries(ratings)) {
        const entry = acc.get(stid);
        if (!entry) continue;
        const val = Number(rawVal);
        if (!Number.isFinite(val) || val < min || val > max) continue;
        entry.sum += val;
        entry.count += 1;
        entry.distribution[String(val)] = (entry.distribution[String(val)] ?? 0) + 1;
      }
    }
    const out: PollAggregation['scaleStats'] = {};
    for (const [stid, entry] of acc.entries()) {
      out[stid] = {
        avg: entry.count > 0 ? Math.round((entry.sum / entry.count) * 100) / 100 : 0,
        count: entry.count,
        distribution: entry.distribution,
      };
    }
    aggregation.scaleStats = out;
  } else if (question.type === 'RANKING') {
    const opts = question.options ?? [];
    const nOpts = opts.length;
    const board = new Map<
      string,
      {
        optionId: string;
        text: string;
        color?: string | null;
        score: number;
        rankSum: number;
        count: number;
        firstPlaceCount: number;
      }
    >();
    for (const opt of opts) {
      board.set(opt.id, {
        optionId: opt.id,
        text: opt.text,
        color: opt.color ?? null,
        score: 0,
        rankSum: 0,
        count: 0,
        firstPlaceCount: 0,
      });
    }
    for (const vr of votes) {
      const ranked = vr.payload.rankedOptionIds ?? [];
      ranked.forEach((oid, idx) => {
        const entry = board.get(oid);
        if (!entry) return;
        entry.score += Math.max(1, nOpts - idx);
        entry.rankSum += idx + 1;
        entry.count += 1;
        if (idx === 0) entry.firstPlaceCount += 1;
      });
    }
    aggregation.rankingStats = Array.from(board.values())
      .map((r) => ({
        optionId: r.optionId,
        text: r.text,
        color: r.color,
        score: r.score,
        avgRank: r.count > 0 ? Math.round((r.rankSum / r.count) * 100) / 100 : 0,
        firstPlaceCount: r.firstPlaceCount,
      }))
      .sort((a, b) => b.score - a.score);
  }

  return aggregation;
}

function buildLocalSnapshot(poll: LocalPollRecord, includeHidden = false): PollLiveSnapshot {
  const qIdx = Math.max(0, Math.min(Math.max(0, poll.questions.length - 1), poll.currentQIndex));
  const currentQ = poll.questions[qIdx] ?? null;
  const qVotes = poll.votes.filter((v) => v.questionIndex === qIdx);
  const distinctVoters = new Set(poll.votes.map((v) => v.deviceToken)).size;

  return {
    ok: true,
    session: {
      id: poll.id,
      title: poll.title,
      pollPin: poll.pollPin,
      status: poll.status,
      currentQIndex: qIdx,
      totalQuestions: poll.questions.length,
      isLocked: poll.isLocked,
      hideResults: poll.hideResults,
      allowMultipleVotes: poll.allowMultipleVotes,
      stateVersion: poll.stateVersion,
      createdAt: poll.createdAt,
      updatedAt: poll.updatedAt,
      expiresAt: poll.expiresAt,
      isAnonymous: true,
    },
    questions: poll.questions,
    currentQuestion: currentQ,
    totalVoters: distinctVoters,
    totalVotesCurrent: qVotes.length,
    aggregation: aggregatePollVotes(
      currentQ,
      qVotes,
      poll.hiddenItems,
      poll.pinnedItems,
      includeHidden,
      qIdx,
    ),
    hiddenItems: includeHidden ? poll.hiddenItems : [],
    pinnedItems: poll.pinnedItems,
  };
}

export async function createQuickPoll(payload: CreatePollPayload): Promise<{
  ok: boolean;
  sessionId?: string;
  pollPin?: string;
  hostKey?: string;
  snapshot?: PollLiveSnapshot;
  error?: string;
}> {
  if (await isPhpPollAvailable()) {
    const res = await apiRequestDetailed<{
      ok: boolean;
      sessionId: string;
      pollPin: string;
      hostKey: string;
      snapshot: PollLiveSnapshot;
      error?: string;
    }>('/api/poll.php?action=create', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (res.reachedJson) {
      if (res.ok && res.data?.ok) {
        savePollHostKey(res.data.sessionId, res.data.hostKey);
        return {
          ok: true,
          sessionId: res.data.sessionId,
          pollPin: res.data.pollPin,
          hostKey: res.data.hostKey,
          snapshot: res.data.snapshot,
        };
      }
      return { ok: false, error: res.error ?? 'Không thể tạo phòng khảo sát.' };
    }
  }

  const polls = readLocalPolls();
  const id = `poll_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const pollPin = String(Math.floor(100000 + Math.random() * 900000));
  const hostKey = `hk_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  const now = new Date().toISOString();

  const record: LocalPollRecord = {
    id,
    title: payload.title.trim() || 'Khảo sát nhanh trên lớp',
    pollPin,
    hostKey,
    status: 'ACTIVE',
    questions: payload.questions,
    currentQIndex: 0,
    isLocked: false,
    hideResults: Boolean(payload.hideResults),
    allowMultipleVotes: Boolean(payload.allowMultipleVotes),
    hiddenItems: [],
    pinnedItems: [],
    stateVersion: 1,
    createdAt: now,
    updatedAt: now,
    expiresAt: new Date(Date.now() + 7 * 86400 * 1000).toISOString(),
    votes: [],
  };
  polls[id] = record;
  writeLocalPolls(polls);
  savePollHostKey(id, hostKey);
  broadcastPollUpdate(id, pollPin);
  return {
    ok: true,
    sessionId: id,
    pollPin,
    hostKey,
    snapshot: buildLocalSnapshot(record, true),
  };
}

export async function fetchMyPolls(): Promise<PollListItem[]> {
  const hostKeys = getSavedPollHostKeys();
  if (await isPhpPollAvailable()) {
    const res = await apiRequestDetailed<{ ok: boolean; polls: PollListItem[] }>(
      '/api/poll.php?action=list',
      {
        method: 'POST',
        body: JSON.stringify({ hostKeys }),
      },
    );
    if (res.reachedJson && res.ok && res.data?.polls) {
      return res.data.polls;
    }
  }

  const polls = readLocalPolls();
  return Object.values(polls)
    .map((p) => ({
      id: p.id,
      title: p.title,
      pollPin: p.pollPin,
      status: p.status,
      totalQuestions: p.questions.length,
      currentQIndex: p.currentQIndex,
      voterCount: new Set(p.votes.map((v) => v.deviceToken)).size,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      expiresAt: p.expiresAt,
      isAnonymous: true,
    }))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function fetchPollHostView(
  sessionId: string,
): Promise<{ ok: boolean; data?: PollLiveSnapshot; error?: string }> {
  const hostKey = getSavedPollHostKey(sessionId);
  if (await isPhpPollAvailable()) {
    const res = await apiRequestDetailed<PollLiveSnapshot>(
      `/api/poll.php?action=host_view&sessionId=${encodeURIComponent(sessionId)}`,
      {
        method: 'GET',
        headers: hostKey ? { 'X-Poll-Host-Key': hostKey } : {},
      },
    );
    if (res.reachedJson) {
      return res.ok && res.data
        ? { ok: true, data: res.data }
        : { ok: false, error: res.error ?? 'Không thể tải phòng khảo sát.' };
    }
  }

  const polls = readLocalPolls();
  const poll = polls[sessionId];
  if (!poll) return { ok: false, error: 'Không tìm thấy phòng khảo sát.' };
  return { ok: true, data: buildLocalSnapshot(poll, true) };
}

export async function pollLiveByPin(pin: string): Promise<PollLiveSnapshot | null> {
  const cleanPin = pin.replace(/\D/g, '');
  if (!cleanPin) return null;
  if (await isPhpPollAvailable()) {
    const res = await apiRequestDetailed<PollLiveSnapshot>(
      `/api/poll.php?action=poll_live&pin=${encodeURIComponent(cleanPin)}`,
      { method: 'GET' },
    );
    if (res.reachedJson && res.ok && res.data) {
      return res.data;
    }
    if (res.reachedJson && !res.ok) return null;
  }

  const polls = readLocalPolls();
  const found = Object.values(polls).find(
    (p) => p.pollPin === cleanPin && p.status !== 'DELETED',
  );
  return found ? buildLocalSnapshot(found, false) : null;
}

export async function lookupPollPin(pin: string): Promise<{
  ok: boolean;
  snapshot?: PollLiveSnapshot;
  hasVotedCurrent?: boolean;
  error?: string;
}> {
  const cleanPin = pin.replace(/\D/g, '');
  const deviceToken = getOrCreateDeviceToken();
  if (cleanPin.length !== 6) {
    return { ok: false, error: 'Mã PIN khảo sát phải gồm 6 chữ số.' };
  }
  if (await isPhpPollAvailable()) {
    const res = await apiRequestDetailed<{
      ok: boolean;
      snapshot: PollLiveSnapshot;
      hasVotedCurrent: boolean;
      error?: string;
    }>(
      `/api/poll.php?action=lookup_pin&pin=${encodeURIComponent(cleanPin)}&deviceToken=${encodeURIComponent(deviceToken)}`,
      { method: 'GET' },
    );
    if (res.reachedJson) {
      return res.ok && res.data
        ? {
            ok: true,
            snapshot: res.data.snapshot,
            hasVotedCurrent: res.data.hasVotedCurrent,
          }
        : { ok: false, error: res.error ?? 'Không tìm thấy phòng khảo sát.' };
    }
  }

  const polls = readLocalPolls();
  const found = Object.values(polls).find(
    (p) => p.pollPin === cleanPin && p.status !== 'DELETED',
  );
  if (!found) return { ok: false, error: 'Mã PIN khảo sát không tồn tại hoặc đã đóng.' };
  const hasVotedCurrent =
    !found.allowMultipleVotes &&
    found.votes.some(
      (v) => v.questionIndex === found.currentQIndex && v.deviceToken === deviceToken,
    );
  return {
    ok: true,
    snapshot: buildLocalSnapshot(found, false),
    hasVotedCurrent,
  };
}

export async function submitPollVote(params: {
  sessionId?: string;
  pollPin?: string;
  questionIndex: number;
  payload: PollVotePayload;
  voterName?: string;
}): Promise<{ ok: boolean; snapshot?: PollLiveSnapshot; error?: string }> {
  const deviceToken = getOrCreateDeviceToken();
  if (await isPhpPollAvailable()) {
    const res = await apiRequestDetailed<{
      ok: boolean;
      snapshot: PollLiveSnapshot;
      error?: string;
    }>('/api/poll.php?action=vote', {
      method: 'POST',
      body: JSON.stringify({
        ...params,
        deviceToken,
      }),
    });
    if (res.reachedJson) {
      return res.ok && res.data
        ? { ok: true, snapshot: res.data.snapshot }
        : { ok: false, error: res.error ?? 'Không thể gửi bình chọn.' };
    }
  }

  const polls = readLocalPolls();
  const poll = params.sessionId
    ? polls[params.sessionId]
    : Object.values(polls).find((p) => p.pollPin === params.pollPin && p.status !== 'DELETED');
  if (!poll) return { ok: false, error: 'Phòng khảo sát không tồn tại.' };
  if (poll.status !== 'ACTIVE') return { ok: false, error: 'Phòng khảo sát đã kết thúc.' };
  if (poll.isLocked) return { ok: false, error: 'Giảng viên đã tạm khóa bình chọn.' };
  if (params.questionIndex !== poll.currentQIndex) {
    return { ok: false, error: 'Câu hỏi đã chuyển slide. Vui lòng thử lại.' };
  }
  if (
    !poll.allowMultipleVotes &&
    poll.votes.some((v) => v.questionIndex === poll.currentQIndex && v.deviceToken === deviceToken)
  ) {
    return { ok: false, error: 'Bạn đã gửi bình chọn cho câu hỏi này rồi.' };
  }

  poll.votes.push({
    id: `pv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    questionIndex: poll.currentQIndex,
    deviceToken,
    voterName: params.voterName ?? '',
    payload: params.payload,
    createdAt: new Date().toISOString(),
  });
  poll.stateVersion += 1;
  poll.updatedAt = new Date().toISOString();
  writeLocalPolls(polls);
  broadcastPollUpdate(poll.id, poll.pollPin);
  return { ok: true, snapshot: buildLocalSnapshot(poll, false) };
}

export async function updatePollState(params: {
  sessionId: string;
  currentQIndex?: number;
  chartType?: PollChartType;
  openEndedLayout?: OpenEndedLayout;
  isLocked?: boolean;
  hideResults?: boolean;
  allowMultipleVotes?: boolean;
  status?: 'ACTIVE' | 'ENDED';
  resetCurrentVotes?: boolean;
  toggleHideItem?: string;
  togglePinItem?: string;
  title?: string;
  questions?: PollQuestion[];
}): Promise<{ ok: boolean; snapshot?: PollLiveSnapshot; error?: string }> {
  const hostKey = getSavedPollHostKey(params.sessionId);
  if (await isPhpPollAvailable()) {
    const res = await apiRequestDetailed<PollLiveSnapshot>('/api/poll.php?action=update_state', {
      method: 'POST',
      headers: hostKey ? { 'X-Poll-Host-Key': hostKey } : {},
      body: JSON.stringify({ ...params, hostKey }),
    });
    if (res.reachedJson) {
      return res.ok && res.data
        ? { ok: true, snapshot: res.data }
        : { ok: false, error: res.error ?? 'Không thể cập nhật khảo sát.' };
    }
  }

  const polls = readLocalPolls();
  const poll = polls[params.sessionId];
  if (!poll) return { ok: false, error: 'Không tìm thấy phòng khảo sát.' };

  if (typeof params.title === 'string' && params.title.trim()) poll.title = params.title.trim();
  if (params.questions) poll.questions = params.questions;
  if (typeof params.currentQIndex === 'number') {
    poll.currentQIndex = Math.max(0, Math.min(poll.questions.length - 1, params.currentQIndex));
  }
  const curQ = poll.questions[poll.currentQIndex];
  if (curQ && params.chartType) curQ.chartType = params.chartType;
  if (curQ && params.openEndedLayout) curQ.openEndedLayout = params.openEndedLayout;
  if (typeof params.isLocked === 'boolean') poll.isLocked = params.isLocked;
  if (typeof params.hideResults === 'boolean') poll.hideResults = params.hideResults;
  if (typeof params.allowMultipleVotes === 'boolean') {
    poll.allowMultipleVotes = params.allowMultipleVotes;
  }
  if (params.status) poll.status = params.status;
  if (params.resetCurrentVotes) {
    poll.votes = poll.votes.filter((v) => v.questionIndex !== poll.currentQIndex);
  }
  if (params.toggleHideItem) {
    if (poll.hiddenItems.includes(params.toggleHideItem)) {
      poll.hiddenItems = poll.hiddenItems.filter((x) => x !== params.toggleHideItem);
    } else {
      poll.hiddenItems.push(params.toggleHideItem);
    }
  }
  if (params.togglePinItem) {
    if (poll.pinnedItems.includes(params.togglePinItem)) {
      poll.pinnedItems = poll.pinnedItems.filter((x) => x !== params.togglePinItem);
    } else {
      poll.pinnedItems.push(params.togglePinItem);
    }
  }
  poll.stateVersion += 1;
  poll.updatedAt = new Date().toISOString();
  writeLocalPolls(polls);
  broadcastPollUpdate(poll.id, poll.pollPin);
  return { ok: true, snapshot: buildLocalSnapshot(poll, true) };
}

export async function deleteQuickPoll(sessionId: string): Promise<boolean> {
  const hostKey = getSavedPollHostKey(sessionId);
  if (await isPhpPollAvailable()) {
    const res = await apiRequestDetailed<{ ok: boolean }>('/api/poll.php?action=delete', {
      method: 'POST',
      headers: hostKey ? { 'X-Poll-Host-Key': hostKey } : {},
      body: JSON.stringify({ sessionId, hostKey }),
    });
    if (res.reachedJson) {
      if (res.ok) removeSavedPollHostKey(sessionId);
      return res.ok;
    }
  }

  const polls = readLocalPolls();
  const target = polls[sessionId];
  if (!target) return false;
  delete polls[sessionId];
  writeLocalPolls(polls);
  removeSavedPollHostKey(sessionId);
  broadcastPollUpdate(sessionId, target.pollPin);
  return true;
}
