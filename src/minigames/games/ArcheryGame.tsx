import React from 'react';
import { AimTargetEngine } from '../engines/AimTargetEngine';
import type { MinigameProps } from '../types';

export const ArcheryGame: React.FC<MinigameProps> = ({ students, muted, onPickStudent }) => (
  <AimTargetEngine
    students={students}
    muted={muted}
    title="Bắn Cung Vàng — Ngắm chuẩn hồng tâm và thả dây cung!"
    projectileEmoji="🏹"
    actionLabel="BẮN CUNG!"
    palette={['#b45309', '#047857', '#1d4ed8', '#be123c', '#6d28d9']}
    onPickStudent={onPickStudent}
  />
);

export default ArcheryGame;
