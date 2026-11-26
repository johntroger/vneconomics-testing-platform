import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import QRCode from 'qrcode';
import * as XLSX from 'xlsx';
import {
  ArrowLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  Eye,
  EyeOff,
  Lock,
  Maximize2,
  Minimize2,
  QrCode,
  RotateCcw,
  Unlock,
  Users,
  X,
} from 'lucide-react';
import {
  fetchPollHostView,
  subscribeLocalPollUpdates,
  updatePollState,
} from '../services/pollApi';
import type {
  OpenEndedLayout,
  PollChartType,
  PollLiveSnapshot,
} from '../types/poll';
import { PollResultChart } from '../components/poll/PollResultChart';
import { ADMIN_TOKEN_KEY } from '../services/apiClient';

export const PollHostPage: React.FC = () => {
  const { sessionId = '' } = useParams();
  const [snapshot, setSnapshot] = useState<PollLiveSnapshot | null>(null);
  const [error, setError] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [showQrModal, setShowQrModal] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  const isLoggedIn = Boolean(
    typeof window !== 'undefined' && sessionStorage.getItem(ADMIN_TOKEN_KEY),
  );

  const refresh = useCallback(async () => {
    if (!sessionId) return;
    const res = await fetchPollHostView(sessionId);
    if (res.ok && res.data) {
      setSnapshot(res.data);
      setError('');
    } else if (res.error) {
      setError(res.error);
    }
  }, [sessionId]);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => {
      void refresh();
    }, 1500);
    const unsub = subscribeLocalPollUpdates((sid) => {
      if (sid === '*' || sid === sessionId) {
        void refresh();
      }
    });
    return () => {
      window.clearInterval(timer);
      unsub();
    };
  }, [refresh, sessionId]);

  const pollPin = snapshot?.session.pollPin ?? '';
  const voteUrl = useMemo(() => {
    if (!pollPin || typeof window === 'undefined') return '';
    return `${window.location.origin}/vote/${pollPin}`;
  }, [pollPin]);

  useEffect(() => {
    if (!voteUrl) return;
    QRCode.toDataURL(voteUrl, { width: 380, margin: 2 })
      .then((url) => setQrDataUrl(url))
      .catch(() => {});
  }, [voteUrl]);

  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  };

  const applyUpdate = async (
    patch: Omit<Parameters<typeof updatePollState>[0], 'sessionId'>,
  ) => {
    if (!sessionId || busy) return;
    setBusy(true);
    const res = await updatePollState({ sessionId, ...patch });
    setBusy(false);
    if (res.ok && res.snapshot) {
      setSnapshot(res.snapshot);
    }
  };

  const handleExportExcel = () => {
    if (!snapshot || !snapshot.currentQuestion) return;
    const q = snapshot.currentQuestion;
    const agg = snapshot.aggregation;
    const rows: Array<Record<string, string | number>> = [];

    if (q.type === 'MULTIPLE_CHOICE') {
      (q.options ?? []).forEach((o) => {
        rows.push({
          'Phương án': o.text,
          'Số lượt chọn': agg.optionCounts[o.id] ?? 0,
        });
      });
    } else if (q.type === 'WORD_CLOUD') {
      agg.wordCounts.forEach((w) => {
        rows.push({ 'Từ khóa': w.word, 'Số lần xuất hiện': w.count });
      });
    } else if (q.type === 'OPEN_ENDED') {
      agg.openResponses.forEach((r, idx) => {
        rows.push({
          STT: idx + 1,
          'Nội dung phản hồi': r.text,
          Ghim: r.pinned ? 'Có' : 'Không',
          'Thời gian': r.createdAt,
        });
      });
    } else if (q.type === 'SCALES') {
      (q.scaleStatements ?? []).forEach((st) => {
        const stat = agg.scaleStats[st.id];
        rows.push({
          'Phát biểu': st.text,
          'Điểm trung bình': stat?.avg ?? 0,
          'Số lượt đánh giá': stat?.count ?? 0,
        });
      });
    } else if (q.type === 'RANKING') {
      agg.rankingStats.forEach((r, idx) => {
        rows.push({
          'Hạng': idx + 1,
          'Phương án': r.text,
          'Điểm Borda': r.score,
          'Hạng trung bình': r.avgRank,
          'Số lần chọn #1': r.firstPlaceCount,
        });
      });
    }

    const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ GhiChu: 'Chưa có lượt bầu chọn' }]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'QuickPoll');
    XLSX.writeFile(wb, `QuickPoll_${snapshot.session.pollPin}_Cau${snapshot.session.currentQIndex + 1}.xlsx`);
  };

  if (error && !snapshot) {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center p-6">
        <div className="max-w-md w-full rounded-2xl bg-slate-800 border border-slate-700 p-6 text-center space-y-4">
          <h1 className="text-lg font-extrabold">Không thể mở màn hình trình chiếu</h1>
          <p className="text-sm text-slate-300">{error}</p>
          <Link
            to={isLoggedIn ? '/admin?tab=LIVE_GAME&sub=POLL' : '/poll'}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-700 text-sm font-bold"
          >
            <ArrowLeft className="w-4 h-4" /> Quay lại Quick Poll
          </Link>
        </div>
      </div>
    );
  }

  if (!snapshot || !snapshot.currentQuestion) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="px-4 py-3 rounded-xl bg-white border border-slate-200 shadow-sm text-xs font-bold text-ink-700">
          Đang tải phòng khảo sát...
        </div>
      </div>
    );
  }

  const { session, currentQuestion, totalVoters, totalVotesCurrent, aggregation } = snapshot;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-indigo-50/40 text-ink-900 flex flex-col">
      {/* Top Projector Join Bar */}
      <header className="bg-white border-b border-slate-200 px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3 shadow-2xs">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            to={isLoggedIn ? '/admin?tab=LIVE_GAME&sub=POLL' : '/poll'}
            className="p-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-ink-700 shrink-0"
            title="Quay lại"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="min-w-0">
            <div className="text-[11px] font-bold uppercase tracking-wider text-cyan-700 truncate">
              {session.title} • Câu {session.currentQIndex + 1}/{session.totalQuestions}
            </div>
            <div className="text-xs sm:text-sm font-bold text-ink-700 flex flex-wrap items-center gap-1.5">
              <span>Tham gia tại:</span>
              <code className="px-2 py-0.5 rounded-lg bg-indigo-50 text-indigo-800 font-mono font-bold">
                {typeof window !== 'undefined' ? `${window.location.host}/vote` : '/vote'}
              </code>
              <span>• Mã PIN:</span>
              <span className="px-2.5 py-0.5 rounded-lg bg-amber-100 text-amber-900 font-mono font-black text-sm sm:text-base tracking-widest">
                {session.pollPin}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => {
              navigator.clipboard?.writeText(voteUrl).catch(() => {});
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1800);
            }}
            className="px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-bold flex items-center gap-1.5"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'Đã chép link' : 'Copy link SV'}
          </button>

          {qrDataUrl && (
            <button
              type="button"
              onClick={() => setShowQrModal(true)}
              className="px-3 py-1.5 rounded-xl border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 text-xs font-bold flex items-center gap-2"
            >
              <img src={qrDataUrl} alt="QR" className="w-6 h-6 rounded" />
              <span className="hidden sm:inline">Phóng to QR</span>
              <QrCode className="w-3.5 h-3.5 sm:hidden" />
            </button>
          )}

          <div className="px-3 py-2 rounded-xl bg-slate-900 text-white font-mono text-xs font-extrabold flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 text-cyan-400" />
            {totalVotesCurrent} phiếu
            <span className="text-slate-400 font-normal">({totalVoters} SV)</span>
          </div>

          <button
            type="button"
            onClick={toggleFullscreen}
            className="p-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-ink-700"
            title={isFullscreen ? 'Thoát toàn màn hình' : 'Toàn màn hình'}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </header>

      {/* Main Projector Stage */}
      <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-8 py-6 sm:py-10 flex flex-col justify-between gap-6">
        <div className="space-y-2 text-center sm:text-left">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black text-ink-900 leading-tight">
              {currentQuestion.title}
            </h1>
            {session.isLocked && (
              <span className="px-3 py-1 rounded-full bg-amber-100 text-amber-900 text-xs font-extrabold inline-flex items-center gap-1">
                <Lock className="w-3.5 h-3.5" /> Đang khóa vote
              </span>
            )}
          </div>
          {currentQuestion.description && (
            <p className="text-sm sm:text-base text-ink-500">{currentQuestion.description}</p>
          )}
        </div>

        <div className="flex-1 bg-white rounded-3xl border border-slate-200 shadow-card p-5 sm:p-8 flex flex-col justify-center">
          <PollResultChart
            question={currentQuestion}
            questionIndex={session.currentQIndex}
            aggregation={aggregation}
            totalVotes={totalVotesCurrent}
            hideResults={session.hideResults}
            isHost
            onToggleHideItem={(key) => void applyUpdate({ toggleHideItem: key })}
            onTogglePinItem={(key) => void applyUpdate({ togglePinItem: key })}
          />
        </div>
      </main>

      {/* Floating Bottom Control Dock */}
      <footer className="sticky bottom-0 z-20 bg-white/95 backdrop-blur-md border-t border-slate-200 px-4 py-3">
        <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-2.5">
          {/* Slide Navigation */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={session.currentQIndex <= 0 || busy}
              onClick={() => void applyUpdate({ currentQIndex: session.currentQIndex - 1 })}
              className="px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 text-xs font-bold flex items-center gap-1"
            >
              <ChevronLeft className="w-4 h-4" /> Trước
            </button>
            <span className="px-2.5 font-mono text-xs font-bold text-ink-700">
              {session.currentQIndex + 1} / {session.totalQuestions}
            </span>
            <button
              type="button"
              disabled={session.currentQIndex >= session.totalQuestions - 1 || busy}
              onClick={() => void applyUpdate({ currentQIndex: session.currentQIndex + 1 })}
              className="px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 text-xs font-bold flex items-center gap-1"
            >
              Tiếp <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Live Chart / Layout Switcher */}
          {currentQuestion.type === 'MULTIPLE_CHOICE' && (
            <div className="flex flex-wrap items-center gap-1 bg-slate-100 p-1 rounded-xl">
              {(
                [
                  ['BAR', 'Cột đứng'],
                  ['HORIZONTAL_BAR', 'Thanh ngang'],
                  ['DONUT', 'Donut %'],
                  ['DOTS', 'Chấm tròn'],
                ] as Array<[PollChartType, string]>
              ).map(([ct, lbl]) => (
                <button
                  key={ct}
                  type="button"
                  onClick={() => void applyUpdate({ chartType: ct })}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition ${
                    (currentQuestion.chartType ?? 'BAR') === ct
                      ? 'bg-indigo-600 text-white shadow-2xs'
                      : 'text-ink-700 hover:bg-white/70'
                  }`}
                >
                  {lbl}
                </button>
              ))}
            </div>
          )}

          {currentQuestion.type === 'OPEN_ENDED' && (
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
              {(
                [
                  ['GRID', 'Lưới thẻ'],
                  ['FLOW', 'Dòng chảy'],
                ] as Array<[OpenEndedLayout, string]>
              ).map(([lo, lbl]) => (
                <button
                  key={lo}
                  type="button"
                  onClick={() => void applyUpdate({ openEndedLayout: lo })}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition ${
                    (currentQuestion.openEndedLayout ?? 'GRID') === lo
                      ? 'bg-emerald-600 text-white shadow-2xs'
                      : 'text-ink-700 hover:bg-white/70'
                  }`}
                >
                  {lbl}
                </button>
              ))}
            </div>
          )}

          {/* Presenter Controls */}
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => void applyUpdate({ hideResults: !session.hideResults })}
              className={`px-3 py-2 rounded-xl text-xs font-bold border flex items-center gap-1.5 ${
                session.hideResults
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white text-ink-700 border-slate-200 hover:bg-slate-50'
              }`}
            >
              {session.hideResults ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
              {session.hideResults ? 'Hiện kết quả' : 'Ẩn kết quả'}
            </button>

            <button
              type="button"
              onClick={() => void applyUpdate({ isLocked: !session.isLocked })}
              className={`px-3 py-2 rounded-xl text-xs font-bold border flex items-center gap-1.5 ${
                session.isLocked
                  ? 'bg-amber-500 text-white border-amber-500'
                  : 'bg-white text-ink-700 border-slate-200 hover:bg-slate-50'
              }`}
            >
              {session.isLocked ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
              {session.isLocked ? 'Mở khóa vote' : 'Khóa vote'}
            </button>

            <button
              type="button"
              onClick={() => {
                if (window.confirm('Xóa toàn bộ phiếu bầu của câu hỏi hiện tại để vote lại?')) {
                  void applyUpdate({ resetCurrentVotes: true });
                }
              }}
              className="px-3 py-2 rounded-xl text-xs font-bold border border-slate-200 bg-white hover:bg-rose-50 hover:text-rose-700 text-ink-700 flex items-center gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Reset câu này
            </button>

            <button
              type="button"
              onClick={handleExportExcel}
              className="px-3 py-2 rounded-xl text-xs font-bold border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" /> Xuất Excel
            </button>
          </div>
        </div>
      </footer>

      {/* Big QR Modal */}
      {showQrModal && qrDataUrl && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/75 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setShowQrModal(false)}
        >
          <div
            className="bg-white rounded-3xl p-6 sm:p-8 max-w-md w-full text-center space-y-4 shadow-2xl relative"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setShowQrModal(false)}
              className="absolute top-4 right-4 p-2 rounded-xl hover:bg-slate-100 text-ink-500"
            >
              <X className="w-5 h-5" />
            </button>
            <h2 className="text-lg font-black text-ink-900">Quét mã QR để bình chọn ngay</h2>
            <img
              src={qrDataUrl}
              alt="QR Code tham gia khảo sát"
              className="w-64 h-64 mx-auto rounded-2xl border border-slate-200 p-2 bg-white"
            />
            <div className="space-y-1">
              <div className="text-xs font-semibold text-ink-500">Hoặc vào trang /vote và nhập PIN</div>
              <div className="text-3xl font-mono font-black tracking-[0.2em] text-indigo-700">
                {session.pollPin}
              </div>
              <p className="text-xs font-mono text-ink-500 break-all">{voteUrl}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PollHostPage;
