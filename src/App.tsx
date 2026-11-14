import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ExamProvider } from './context/ExamContext';
import { AdminDashboardPage } from './pages/AdminDashboardPage';
import { ExamLobbyPage } from './pages/ExamLobbyPage';
import { ExamResultPage } from './pages/ExamResultPage';
import { ExamTakePage } from './pages/ExamTakePage';
import { HomePortalPage } from './pages/HomePortalPage';

export const App: React.FC = () => {
  return (
    <ExamProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<HomePortalPage />} />
          <Route path="/exam/:examId/lobby" element={<ExamLobbyPage />} />
          <Route path="/exam/:examId/take" element={<ExamTakePage />} />
          <Route path="/exam/:examId/result" element={<ExamResultPage />} />
          <Route path="/admin" element={<AdminDashboardPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ExamProvider>
  );
};

export default App;
