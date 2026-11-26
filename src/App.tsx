import React, { Suspense, lazy, useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AppErrorBoundary } from './components/common/AppErrorBoundary';
import { ExamProvider } from './context/ExamContext';
import { HomePortalPage } from './pages/HomePortalPage';
import { trackPageView } from './utils/analytics';

const AdminDashboardPage = lazy(() =>
  import('./pages/AdminDashboardPage').then((m) => ({ default: m.AdminDashboardPage })),
);
const ExamLobbyPage = lazy(() =>
  import('./pages/ExamLobbyPage').then((m) => ({ default: m.ExamLobbyPage })),
);
const ExamResultPage = lazy(() =>
  import('./pages/ExamResultPage').then((m) => ({ default: m.ExamResultPage })),
);
const ExamTakePage = lazy(() =>
  import('./pages/ExamTakePage').then((m) => ({ default: m.ExamTakePage })),
);
const GameHostPage = lazy(() =>
  import('./pages/GameHostPage').then((m) => ({ default: m.GameHostPage })),
);
const GameJoinPage = lazy(() =>
  import('./pages/GameJoinPage').then((m) => ({ default: m.GameJoinPage })),
);
const GamePlayPage = lazy(() =>
  import('./pages/GamePlayPage').then((m) => ({ default: m.GamePlayPage })),
);
const InstructorGuidePage = lazy(() =>
  import('./pages/InstructorGuidePage').then((m) => ({ default: m.InstructorGuidePage })),
);
const AttendanceCheckInPage = lazy(() =>
  import('./pages/AttendanceCheckInPage').then((m) => ({ default: m.AttendanceCheckInPage })),
);
const MinigameHubPage = lazy(() =>
  import('./pages/MinigameHubPage').then((m) => ({ default: m.MinigameHubPage })),
);
const MinigameStageLayout = lazy(() =>
  import('./minigames/MinigameStageLayout').then((m) => ({ default: m.MinigameStageLayout })),
);
const QuickPollHubPage = lazy(() =>
  import('./pages/QuickPollHubPage').then((m) => ({ default: m.QuickPollHubPage })),
);
const PollHostPage = lazy(() =>
  import('./pages/PollHostPage').then((m) => ({ default: m.PollHostPage })),
);
const PollVotePage = lazy(() =>
  import('./pages/PollVotePage').then((m) => ({ default: m.PollVotePage })),
);

const RouteLoadingFallback: React.FC = () => (
  <div className="min-h-screen bg-surface-100 flex items-center justify-center p-6">
    <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white border border-slate-200 shadow-sm text-xs font-semibold text-ink-700">
      <span className="w-4 h-4 rounded-full border-2 border-brand-600 border-t-transparent animate-spin" />
      <span>Đang tải giao diện...</span>
    </div>
  </div>
);

const PageViewTracker: React.FC = () => {
  const { pathname, search } = useLocation();

  useEffect(() => {
    trackPageView(`${pathname}${search}`);
  }, [pathname, search]);

  return null;
};

export const App: React.FC = () => {
  return (
    <ExamProvider>
      <BrowserRouter>
        <PageViewTracker />
        <AppErrorBoundary>
          <Suspense fallback={<RouteLoadingFallback />}>
            <Routes>
              <Route path="/" element={<HomePortalPage />} />
              <Route path="/exam/:examId/lobby" element={<ExamLobbyPage />} />
              <Route path="/exam/:examId/take" element={<ExamTakePage />} />
              <Route path="/exam/:examId/result" element={<ExamResultPage />} />
              <Route path="/play" element={<GameJoinPage />} />
              <Route path="/play/:pin" element={<GameJoinPage />} />
              <Route path="/attend" element={<AttendanceCheckInPage />} />
              <Route path="/attend/:pin" element={<AttendanceCheckInPage />} />
              <Route path="/game/host/:sessionId" element={<GameHostPage />} />
              <Route path="/game/play/:sessionId" element={<GamePlayPage />} />
              <Route path="/minigame" element={<MinigameHubPage />} />
              <Route path="/minigame/:gameId" element={<MinigameStageLayout />} />
              <Route path="/poll" element={<QuickPollHubPage />} />
              <Route path="/poll/host/:sessionId" element={<PollHostPage />} />
              <Route path="/vote" element={<PollVotePage />} />
              <Route path="/vote/:pin" element={<PollVotePage />} />
              <Route path="/admin" element={<AdminDashboardPage />} />
              <Route path="/huong-dan" element={<InstructorGuidePage />} />
              <Route path="/guide" element={<Navigate to="/huong-dan" replace />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </AppErrorBoundary>
      </BrowserRouter>
    </ExamProvider>
  );
};

export default App;
