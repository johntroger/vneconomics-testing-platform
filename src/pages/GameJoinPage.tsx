import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowRight, Gamepad2, Hash, IdCard, Lock, Shuffle, Sparkles, User } from 'lucide-react';
import { GAME_AVATARS, GameAvatarBadge } from '../components/game/GameAvatarBadge';
import { joinLiveGame, lookupGamePin } from '../services/gameApi';
import type { GameMode } from '../types/game';

export const GameJoinPage: React.FC = () => {
  const { pin: paramPin } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const initialPin = paramPin ?? searchParams.get('pin') ?? '';
  const [pin, setPin] = useState(initialPin);
  const [roomInfo, setRoomInfo] = useState<{
    sessionId: string;
    title: string;
    gameMode: GameMode;
    teamNames: string[];
    requireStudentCode: boolean;
    isLocked: boolean;
  } | null>(null);

  const [nickname, setNickname] = useState('');
  const [studentCode, setStudentCode] = useState('');
  const [teamName, setTeamName] = useState('');
  const [avatarId, setAvatarId] = useState(
    () => GAME_AVATARS[Math.floor(Math.random() * GAME_AVATARS.length)].id,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLookup = async (targetPin?: string) => {
    const clean = (targetPin ?? pin).trim();
    if (!clean) {
      setError('Vui lòng nhập mã PIN phòng game (6 chữ số).');
      return;
    }
    setLoading(true);
    setError('');
    const res = await lookupGamePin(clean);
    setLoading(false);
    if (!res.ok || !res.sessionId) {
      setError(res.error ?? 'Không tìm thấy phòng game.');
      setRoomInfo(null);
      return;
    }
    if (res.isLocked) {
      setError('Phòng chơi đã được giảng viên khóa.');
      return;
    }
    setRoomInfo({
      sessionId: res.sessionId,
      title: res.title ?? 'Live Quiz Game',
      gameMode: res.gameMode ?? 'CLASSIC',
      teamNames: res.teamNames ?? [],
      requireStudentCode: Boolean(res.requireStudentCode),
      isLocked: Boolean(res.isLocked),
    });
  };

  useEffect(() => {
    if (initialPin.trim().length >= 6) {
      void handleLookup(initialPin);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPin]);

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roomInfo) {
      await handleLookup();
      return;
    }
    if (!nickname.trim()) {
      setError('Vui lòng nhập tên hiển thị (Nickname).');
      return;
    }
    if (roomInfo.requireStudentCode && !studentCode.trim()) {
      setError('Phòng này yêu cầu nhập Mã số sinh viên (MSSV).');
      return;
    }

    setLoading(true);
    setError('');
    const res = await joinLiveGame({
      gamePin: pin.trim(),
      nickname: nickname.trim(),
      studentCode: studentCode.trim(),
      teamName: roomInfo.gameMode === 'TEAM' ? teamName : undefined,
      avatarId,
    });
    setLoading(false);

    if (!res.ok || !res.sessionId || !res.playerId) {
      setError(res.error ?? 'Không thể vào phòng chơi.');
      return;
    }

    sessionStorage.setItem(`vne_game_player_${res.sessionId}`, res.playerId);
    navigate(`/game/play/${res.sessionId}`);
  };

  return (
    <div className="min-h-[100dvh] bg-gradient-to-br from-indigo-950 via-violet-900 to-slate-950 text-white flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-tr from-amber-400 to-rose-500 shadow-xl shadow-rose-500/25 mb-3">
            <Gamepad2 className="w-9 h-9 text-white" />
          </div>
          <h1 className="text-3xl font-black tracking-tight">VNE Live Arena</h1>
          <p className="text-indigo-200 text-sm mt-1">
            Trò chơi trắc nghiệm tương tác trực tiếp
          </p>
        </div>

        <form
          onSubmit={handleJoin}
          className="bg-white/10 backdrop-blur-xl border border-white/15 rounded-3xl p-6 shadow-2xl space-y-4"
        >
          {!roomInfo ? (
            <>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-indigo-200 mb-2">
                  Mã PIN phòng chơi
                </label>
                <div className="relative">
                  <Hash className="w-5 h-5 text-indigo-300 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={8}
                    value={pin}
                    onChange={(e) => setPin(e.target.value.replace(/\s+/g, ''))}
                    placeholder="VD: 482910"
                    className="w-full pl-11 pr-4 py-3.5 rounded-2xl bg-white text-slate-900 text-center text-2xl font-black tracking-[0.2em] placeholder:text-slate-400 placeholder:tracking-normal placeholder:text-base focus:outline-none focus:ring-4 focus:ring-amber-400/50"
                    autoFocus
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-300 hover:to-orange-400 text-slate-950 font-black text-lg shadow-lg shadow-amber-500/25 flex items-center justify-center gap-2 transition active:scale-[0.98] disabled:opacity-60"
              >
                {loading ? 'Đang kiểm tra...' : 'Tìm phòng chơi'}
                <ArrowRight className="w-5 h-5" />
              </button>
            </>
          ) : (
            <>
              <div className="bg-white/10 rounded-2xl p-3.5 border border-white/10 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-amber-300 flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5" /> PIN: {pin}
                  </div>
                  <div className="font-bold text-base truncate">{roomInfo.title}</div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setRoomInfo(null);
                    setError('');
                  }}
                  className="text-xs text-indigo-200 hover:text-white underline shrink-0"
                >
                  Đổi PIN
                </button>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-indigo-200">
                    Chọn Nhân vật (Avatar)
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      const others = GAME_AVATARS.filter((a) => a.id !== avatarId);
                      setAvatarId(others[Math.floor(Math.random() * others.length)].id);
                    }}
                    className="text-xs font-bold text-amber-300 hover:text-amber-200 flex items-center gap-1"
                  >
                    <Shuffle className="w-3.5 h-3.5" /> Đổi ngẫu nhiên
                  </button>
                </div>
                <div className="grid grid-cols-6 gap-2 bg-white/10 p-2.5 rounded-2xl border border-white/10">
                  {GAME_AVATARS.map((av) => (
                    <button
                      key={av.id}
                      type="button"
                      onClick={() => setAvatarId(av.id)}
                      className={`p-1 rounded-xl flex items-center justify-center transition ${
                        avatarId === av.id
                          ? 'ring-2 ring-amber-300 bg-white/20 scale-105'
                          : 'opacity-70 hover:opacity-100'
                      }`}
                      title={av.label}
                    >
                      <GameAvatarBadge avatarId={av.id} size="sm" />
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-indigo-200 mb-1.5">
                  Tên hiển thị (Nickname) *
                </label>
                <div className="relative">
                  <User className="w-5 h-5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    maxLength={40}
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    placeholder="VD: Minh Anh"
                    className="w-full pl-11 pr-4 py-3 rounded-2xl bg-white text-slate-900 font-bold focus:outline-none focus:ring-4 focus:ring-amber-400/50"
                    autoFocus
                  />
                </div>
              </div>

              {roomInfo.requireStudentCode && (
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-amber-300 mb-1.5 flex items-center gap-1">
                    <Lock className="w-3.5 h-3.5" /> Mã số sinh viên (Bắt buộc) *
                  </label>
                  <div className="relative">
                    <IdCard className="w-5 h-5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      maxLength={32}
                      value={studentCode}
                      onChange={(e) => setStudentCode(e.target.value.toUpperCase())}
                      placeholder="VD: 22110045"
                      className="w-full pl-11 pr-4 py-3 rounded-2xl bg-white text-slate-900 font-bold uppercase focus:outline-none focus:ring-4 focus:ring-amber-400/50"
                    />
                  </div>
                </div>
              )}

              {roomInfo.gameMode === 'TEAM' && roomInfo.teamNames.length > 0 && (
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-indigo-200 mb-1.5">
                    Chọn Đội thi đấu (Để trống = Tự động chia đều)
                  </label>
                  <select
                    value={teamName}
                    onChange={(e) => setTeamName(e.target.value)}
                    className="w-full px-4 py-3 rounded-2xl bg-white text-slate-900 font-bold focus:outline-none focus:ring-4 focus:ring-amber-400/50"
                  >
                    <option value="">Tự động chia đội cân bằng</option>
                    {roomInfo.teamNames.map((tn) => (
                      <option key={tn} value={tn}>
                        {tn}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-emerald-400 to-teal-500 hover:from-emerald-300 hover:to-teal-400 text-slate-950 font-black text-lg shadow-lg shadow-emerald-500/25 flex items-center justify-center gap-2 transition active:scale-[0.98] disabled:opacity-60"
              >
                {loading ? 'Đang vào phòng...' : 'Vào chơi ngay!'}
                <ArrowRight className="w-5 h-5" />
              </button>
            </>
          )}

          {error && (
            <div className="p-3 rounded-xl bg-rose-500/20 border border-rose-400/40 text-rose-100 text-sm font-medium text-center">
              {error}
            </div>
          )}
        </form>

        <div className="text-center mt-6">
          <Link
            to="/"
            className="text-xs text-indigo-300 hover:text-white transition underline"
          >
            ← Quay lại Cổng thi trắc nghiệm
          </Link>
        </div>
      </div>
    </div>
  );
};
