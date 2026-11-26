import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react';
import {
  lookupPollPin,
  pollLiveByPin,
  submitPollVote,
  subscribeLocalPollUpdates,
} from '../services/pollApi';
import type { PollLiveSnapshot, PollVotePayload } from '../types/poll';
import { PollStudentCard } from '../components/poll/PollStudentCard';
import { PollResultChart } from '../components/poll/PollResultChart';

const VOTED_STORAGE_KEY = 'vne_poll_voted_slides_v1';

function readVotedMap(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(VOTED_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

function markSlideVoted(sessionId: string, qIdx: number): void {
  try {
    const map = readVotedMap();
    map[`${sessionId}:${qIdx}`] = true;
    localStorage.setItem(VOTED_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Ignore storage errors
  }
}

export const PollVotePage: React.FC = () => {
  const { pin: paramPin = '' } = useParams();
  const navigate = useNavigate();

  const [pinInput, setPinInput] = useState(paramPin.replace(/\D/g, '').slice(0, 6));
  const [snapshot, setSnapshot] = useState<PollLiveSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [votedSlides, setVotedSlides] = useState<Record<string, boolean>>(() =>
    readVotedMap(),
  );

  const joinByPin = useCallback(async (rawPin: string) => {
    const clean = rawPin.replace(/\D/g, '').slice(0, 6);
    if (clean.length !== 6) {
      setError('Vui lòng nhập đúng mã PIN khảo sát gồm 6 chữ số.');
      return;
    }
    setLoading(true);
    setError('');
    const res = await lookupPollPin(clean);
    setLoading(false);
    if (!res.ok || !res.snapshot) {
      setError(res.error ?? 'Không tìm thấy phòng khảo sát.');
      return;
    }
    setSnapshot(res.snapshot);
    if (res.hasVotedCurrent) {
      const key = `${res.snapshot.session.id}:${res.snapshot.session.currentQIndex}`;
      markSlideVoted(res.snapshot.session.id, res.snapshot.session.currentQIndex);
      setVotedSlides((prev) => ({ ...prev, [key]: true }));
    }
  }, []);

  useEffect(() => {
    const clean = paramPin.replace(/\D/g, '').slice(0, 6);
    if (clean.length === 6) {
      setPinInput(clean);
      void joinByPin(clean);
    }
  }, [paramPin, joinByPin]);

  // Live poll updates while inside room
  const activePin = snapshot?.session.pollPin ?? '';
  const activeSessionId = snapshot?.session.id ?? '';
  useEffect(() => {
    if (!activePin) return;
    const sync = async () => {
      const live = await pollLiveByPin(activePin);
      if (live) {
        setSnapshot(live);
      }
    };
    const timer = window.setInterval(() => {
      void sync();
    }, 1500);
    const unsub = subscribeLocalPollUpdates((sid, pin) => {
      if (sid === '*' || sid === activeSessionId || pin === activePin) {
        void sync();
      }
    });
    return () => {
      window.clearInterval(timer);
      unsub();
    };
  }, [activePin, activeSessionId]);

  const handlePinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = pinInput.replace(/\D/g, '').slice(0, 6);
    if (clean.length === 6 && clean !== paramPin) {
      navigate(`/vote/${clean}`, { replace: true });
    } else {
      void joinByPin(clean);
    }
  };

  const handleVoteSubmit = async (payload: PollVotePayload) => {
    if (!snapshot) return;
    setSubmitting(true);
    setError('');
    const res = await submitPollVote({
      sessionId: snapshot.session.id,
      pollPin: snapshot.session.pollPin,
      questionIndex: snapshot.session.currentQIndex,
      payload,
    });
    setSubmitting(false);
    if (!res.ok) {
      setError(res.error ?? 'Không thể gửi bình chọn.');
      return;
    }
    if (res.snapshot) {
      setSnapshot(res.snapshot);
    }
    if (!snapshot.session.allowMultipleVotes) {
      const key = `${snapshot.session.id}:${snapshot.session.currentQIndex}`;
      markSlideVoted(snapshot.session.id, snapshot.session.currentQIndex);
      setVotedSlides((prev) => ({ ...prev, [key]: true }));
    }
  };

  if (!snapshot) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 via-surface-100 to-indigo-50/40 flex flex-col">
        <header className="px-4 py-3.5 bg-white border-b border-slate-200 flex items-center justify-between">
          <Link
            to="/"
            className="text-xs font-bold text-ink-700 hover:text-ink-900 inline-flex items-center gap-1.5"
          >
            <ArrowLeft className="w-4 h-4" /> Trang chủ
          </Link>
          <span className="text-xs font-extrabold text-cyan-700 flex items-center gap-1.5">
            <BarChart3 className="w-4 h-4" /> VNE Quick Poll
          </span>
        </header>

        <main className="flex-1 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-3xl border border-slate-200 shadow-card p-6 space-y-5">
            <div className="text-center space-y-1.5">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-cyan-600 to-indigo-600 text-white flex items-center justify-center mx-auto shadow-sm">
                <BarChart3 className="w-6 h-6" />
              </div>
              <h1 className="text-xl font-black text-ink-900">Tham gia Khảo sát Live</h1>
              <p className="text-xs text-ink-500">
                Nhập mã PIN 6 số trên màn hình chiếu của giảng viên — không cần đăng nhập.
              </p>
            </div>

            <form onSubmit={handlePinSubmit} className="space-y-3.5">
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={pinInput}
                onChange={(e) => {
                  setPinInput(e.target.value.replace(/\D/g, ''));
                  setError('');
                }}
                placeholder="123456"
                className="w-full h-14 text-center rounded-2xl border-2 border-slate-300 font-mono text-2xl font-black tracking-[0.25em] text-ink-900 placeholder:text-slate-300 focus:outline-none focus:border-indigo-600"
              />

              {error && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs font-semibold text-rose-700">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full h-12 rounded-xl bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-700 hover:to-indigo-700 disabled:opacity-60 text-white font-extrabold text-sm flex items-center justify-center gap-2 shadow-sm"
              >
                {loading ? 'Đang kết nối...' : 'Vào phòng bình chọn'}
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          </div>
        </main>
      </div>
    );
  }

  const { session, currentQuestion, aggregation, totalVotesCurrent } = snapshot;
  const slideKey = `${session.id}:${session.currentQIndex}`;
  const hasVotedThisSlide = !session.allowMultipleVotes && Boolean(votedSlides[slideKey]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-indigo-50/40 flex flex-col">
      <header className="sticky top-0 z-10 bg-white/95 backdrop-blur-md border-b border-slate-200 px-4 py-3 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[11px] font-bold text-cyan-700 truncate">
            {session.title}
          </div>
          <div className="text-xs font-mono font-bold text-ink-500">
            PIN {session.pollPin} • Câu {session.currentQIndex + 1}/{session.totalQuestions}
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            setSnapshot(null);
            navigate('/vote', { replace: true });
          }}
          className="text-xs font-bold px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-ink-700 shrink-0"
        >
          Đổi phòng
        </button>
      </header>

      <main className="flex-1 w-full max-w-lg mx-auto px-4 py-6 space-y-5">
        {session.status !== 'ACTIVE' ? (
          <div className="bg-white rounded-3xl border border-slate-200 shadow-card p-6 text-center space-y-3">
            <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto" />
            <h2 className="text-lg font-extrabold text-ink-900">Phiên khảo sát đã kết thúc</h2>
            <p className="text-xs text-ink-500">Cảm ơn bạn đã tham gia đóng góp ý kiến!</p>
          </div>
        ) : currentQuestion ? (
          <>
            <div className="bg-white rounded-3xl border border-slate-200 shadow-card p-5">
              <PollStudentCard
                key={`${currentQuestion.id}_${session.currentQIndex}`}
                question={currentQuestion}
                isLocked={session.isLocked}
                submitted={hasVotedThisSlide}
                submitting={submitting}
                error={error}
                onSubmit={handleVoteSubmit}
              />
            </div>

            {hasVotedThisSlide && !session.hideResults && (
              <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-4 space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-ink-500">
                  <span>Kết quả trực tiếp ({totalVotesCurrent} phiếu)</span>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-cyan-600" />
                </div>
                <PollResultChart
                  question={currentQuestion}
                  questionIndex={session.currentQIndex}
                  aggregation={aggregation}
                  totalVotes={totalVotesCurrent}
                  compact
                />
              </div>
            )}
          </>
        ) : null}
      </main>
    </div>
  );
};

export default PollVotePage;
