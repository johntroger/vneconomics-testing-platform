import React from 'react';
import { AimTargetEngine } from '../engines/AimTargetEngine';
import type { MinigameProps } from '../types';

export const DartboardGame: React.FC<MinigameProps> = ({ students, muted, onPickStudent }) => (
  <AimTargetEngine
    students={students}
    muted={muted}
    title="Phóng Phi tiêu — Bia đang xoay, bấm PHÓNG đúng thời điểm bạn muốn!"
    projectileEmoji="🎯"
    actionLabel="PHÓNG PHI TIÊU!"
    onPickStudent={onPickStudent}
  />
);

export default DartboardGame;
