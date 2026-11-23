import React from 'react';
import { WheelEngine } from '../engines/WheelEngine';
import type { MinigameProps } from '../types';

export const PirateCompassGame: React.FC<MinigameProps> = ({ students, muted, onPickStudent }) => (
  <WheelEngine
    students={students}
    muted={muted}
    title="La bàn Hải tặc — Xoay la bàn tìm kho báu nhân tài!"
    palette={['#78350f', '#b45309', '#451a03', '#d97706', '#92400e', '#ca8a04']}
    centerEmoji="🧭"
    onPickStudent={onPickStudent}
  />
);

export default PirateCompassGame;
