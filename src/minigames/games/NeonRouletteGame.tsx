import React from 'react';
import { WheelEngine } from '../engines/WheelEngine';
import type { MinigameProps } from '../types';

export const NeonRouletteGame: React.FC<MinigameProps> = ({ students, muted, onPickStudent }) => (
  <WheelEngine
    students={students}
    muted={muted}
    title="Bàn xoay Neon Casino — Thử vận may rực rỡ!"
    palette={['#0f172a', '#e11d48', '#1e293b', '#059669', '#312e81', '#d97706']}
    centerEmoji="🎰"
    onPickStudent={onPickStudent}
  />
);

export default NeonRouletteGame;
