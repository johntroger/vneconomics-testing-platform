import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Gamepad2, GraduationCap, Lock, Sparkles } from 'lucide-react';
import { MinigameHubPanel } from '../components/admin/MinigameHubPanel';
import { useExamPlatform } from '../context/ExamContext';
import { ADMIN_TOKEN_KEY } from '../services/apiClient';

export const MinigameHubPage: React.FC = () => {
  const { exams } = useExamPlatform();
  const isLoggedIn = Boolean(
    typeof window !== 'undefined' && sessionStorage.getItem(ADMIN_TOKEN_KEY),
  );

  return (
    <div className="min-h-screen bg-surface-100 text-ink-900 flex flex-col">
      <header className="sticky top-0 z-20 bg-white/95 backdrop-blur-md border-b border-slate-200 px-4 sm:px-6 py-3.5">
        <div className="w-full lg:px-2 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Link
              to="/"
              className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 text-white flex items-center justify-center shadow-sm shrink-0"
              title="Trang chủ"
            >
              <GraduationCap className="w-5 h-5" />
            </Link>
            <div className="min-w-0">
              <h1 className="text-sm sm:text-base font-black text-ink-900 truncate flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-amber-500 shrink-0" />
                VNE Minigame Hub — Gọi tên &amp; Chia nhóm
              </h1>
              <p className="text-[11px] text-ink-500 truncate">
                {isLoggedIn
                  ? 'Đã đăng nhập Giảng viên • Có thể lấy danh sách từ Đề thi/Lớp sẵn có'
                  : 'Miễn phí cho mọi giảng viên & sinh viên • Không cần đăng nhập'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Link
              to="/"
              className="text-xs font-bold px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-ink-700 flex items-center gap-1"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Trang chủ
            </Link>
            <Link
              to="/play"
              className="text-xs font-bold px-3 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white flex items-center gap-1.5 shadow-sm"
            >
              <Gamepad2 className="w-3.5 h-3.5" /> Kahoot Live
            </Link>
            <Link
              to={isLoggedIn ? '/admin?tab=LIVE_GAME&sub=MINIGAME' : '/admin'}
              className="text-xs font-bold px-3 py-2 rounded-xl bg-support-600 hover:bg-support-700 text-white flex items-center gap-1.5 shadow-sm"
            >
              <Lock className="w-3.5 h-3.5" />
              {isLoggedIn ? 'Quản trị GV' : 'Đăng nhập GV'}
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1 w-full px-4 sm:px-6 lg:px-8 py-6">
        <div className="bg-white rounded-3xl border border-slate-200 shadow-card p-5 sm:p-6">
          <MinigameHubPanel exams={isLoggedIn ? exams : []} isPublicPage={!isLoggedIn} />
        </div>
      </main>
    </div>
  );
};

export default MinigameHubPage;
