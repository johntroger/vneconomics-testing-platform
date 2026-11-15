import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Gamepad2, Play, X } from 'lucide-react';
import { createLiveGame } from '../../services/gameApi';
import type { Question } from '../../types/exam';
import type { GameMode } from '../../types/game';
import { buildGameQuestionsSnapshot } from '../../utils/gameSnapshotBuilder';

const DEFAULT_TEAMS = ['Đội Đỏ', 'Đội Xanh', 'Đội Vàng', 'Đội Lục', 'Đội Tím', 'Đội Cam'];

interface CreateGameModalProps {
  open: boolean;
  onClose: () => void;
  defaultTitle: string;
  courseId?: string;
  sourceQuestions: Question[];
}

export const CreateGameModal: React.FC<CreateGameModalProps> = ({
  open,
  onClose,
  defaultTitle,
  courseId,
  sourceQuestions,
}) => {
  const navigate = useNavigate();
  const [title, setTitle] = useState(defaultTitle);
  const [gameMode, setGameMode] = useState<GameMode>('CLASSIC');
  const [teamCount, setTeamCount] = useState(4);
  const [showQuestionOnPlayer, setShowQuestionOnPlayer] = useState(false);
  const [requireStudentCode, setRequireStudentCode] = useState(false);
  const [doubleFinalQuestion, setDoubleFinalQuestion] = useState(true);
  const [flattenTrueFalse, setFlattenTrueFalse] = useState(true);
  const [defaultTimeSec, setDefaultTimeSec] = useState(20);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const previewSnapshot = useMemo(
    () =>
      buildGameQuestionsSnapshot(sourceQuestions, {
        flattenTrueFalse,
        defaultTimeSec,
        doubleFinalQuestion,
      }),
    [sourceQuestions, flattenTrueFalse, defaultTimeSec, doubleFinalQuestion],
  );

  if (!open) return null;

  const handleLaunch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (previewSnapshot.length === 0) {
      setError('Không có câu hỏi trắc nghiệm phù hợp (SINGLE_CHOICE, MULTI_CHOICE, TRUE_FALSE).');
      return;
    }
    setSubmitting(true);
    setError('');
    const res = await createLiveGame({
      title: title.trim() || 'Live Quiz Game',
      courseId,
      gameMode,
      teamNames: gameMode === 'TEAM' ? DEFAULT_TEAMS.slice(0, teamCount) : [],
      showQuestionOnPlayer,
      requireStudentCode,
      doubleFinalQuestion,
      defaultTimeSec,
      questionsSnapshot: previewSnapshot,
    });
    setSubmitting(false);
    if (!res.ok || !res.sessionId) {
      setError(res.error ?? 'Không thể tạo phòng game.');
      return;
    }
    onClose();
    navigate(`/game/host/${res.sessionId}`);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 bg-gradient-to-r from-indigo-600 to-violet-600 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Gamepad2 className="w-6 h-6" />
            <h3 className="font-black text-lg">Mở Phòng Live Game (Kahoot)</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-white/20 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleLaunch} className="p-6 space-y-4 text-slate-800">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
              Tên trò chơi
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-3.5 text-sm">
            Số câu hỏi hợp lệ sẽ đưa vào Game:{' '}
            <strong className="text-indigo-700">{previewSnapshot.length} câu</strong>
            <span className="block text-xs text-slate-500 mt-0.5">
              Hỗ trợ Trắc nghiệm 1/nhiều đáp án, Đúng/Sai, Tính toán số (Numerical) &amp; Tự luận ngắn có Rubric.
            </span>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
              Chế độ thi đấu
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setGameMode('CLASSIC')}
                className={`py-2 px-3 rounded-xl font-bold text-xs border transition ${
                  gameMode === 'CLASSIC'
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                Cá nhân (Classic)
              </button>
              <button
                type="button"
                onClick={() => setGameMode('TEAM')}
                className={`py-2 px-3 rounded-xl font-bold text-xs border transition ${
                  gameMode === 'TEAM'
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                Theo Nhóm (Team Mode)
              </button>
            </div>
            {gameMode === 'TEAM' && (
              <div className="mt-2 flex items-center gap-2 text-xs">
                <span className="text-slate-500 font-semibold">Số đội:</span>
                {[2, 3, 4, 6].map((cnt) => (
                  <button
                    key={cnt}
                    type="button"
                    onClick={() => setTeamCount(cnt)}
                    className={`px-2.5 py-1 rounded-lg font-bold border ${
                      teamCount === cnt
                        ? 'bg-violet-600 text-white border-violet-600'
                        : 'bg-white text-slate-700 border-slate-200'
                    }`}
                  >
                    {cnt} đội
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
              Thời gian mặc định mỗi câu
            </label>
            <div className="grid grid-cols-4 gap-2">
              {[15, 20, 30, 45].map((sec) => (
                <button
                  key={sec}
                  type="button"
                  onClick={() => setDefaultTimeSec(sec)}
                  className={`py-2 rounded-xl font-bold text-sm border transition ${
                    defaultTimeSec === sec
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {sec}s
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2.5 pt-1">
            <label className="flex items-start gap-3 p-3 rounded-xl border border-slate-200 hover:bg-slate-50 cursor-pointer">
              <input
                type="checkbox"
                checked={showQuestionOnPlayer}
                onChange={(e) => setShowQuestionOnPlayer(e.target.checked)}
                className="mt-1 h-4 w-4 accent-indigo-600"
              />
              <div>
                <div className="font-bold text-sm">
                  Hiện câu hỏi & đáp án trên điện thoại sinh viên
                </div>
                <div className="text-xs text-slate-500">
                  Bật nếu dạy Online (Zoom/Meet). Tắt nếu chiếu máy chiếu trên lớp (điện thoại chỉ hiện 4 nút màu).
                </div>
              </div>
            </label>

            <label className="flex items-start gap-3 p-3 rounded-xl border border-slate-200 hover:bg-slate-50 cursor-pointer">
              <input
                type="checkbox"
                checked={requireStudentCode}
                onChange={(e) => setRequireStudentCode(e.target.checked)}
                className="mt-1 h-4 w-4 accent-indigo-600"
              />
              <div>
                <div className="font-bold text-sm">Yêu cầu nhập MSSV khi vào phòng</div>
                <div className="text-xs text-slate-500">
                  Bật nếu cần điểm danh hoặc cộng điểm học phần; tắt nếu chỉ chơi vui với Nickname.
                </div>
              </div>
            </label>

            <label className="flex items-center gap-3 px-3 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 cursor-pointer">
              <input
                type="checkbox"
                checked={doubleFinalQuestion}
                onChange={(e) => setDoubleFinalQuestion(e.target.checked)}
                className="h-4 w-4 accent-indigo-600"
              />
              <span className="font-semibold text-sm">Nhân đôi điểm ở câu hỏi cuối cùng (x2)</span>
            </label>

            <label className="flex items-center gap-3 px-3 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 cursor-pointer">
              <input
                type="checkbox"
                checked={flattenTrueFalse}
                onChange={(e) => setFlattenTrueFalse(e.target.checked)}
                className="h-4 w-4 accent-indigo-600"
              />
              <span className="font-semibold text-sm">
                Tách cụm câu Đúng/Sai nhiều ý thành từng câu lẻ
              </span>
            </label>
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm font-semibold">
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl font-bold text-sm text-slate-600 hover:bg-slate-100"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={submitting || previewSnapshot.length === 0}
              className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-black text-sm flex items-center gap-2 shadow-lg disabled:opacity-50"
            >
              <Play className="w-4 h-4 fill-current" />
              {submitting ? 'Đang mở...' : 'Tạo phòng Game'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
