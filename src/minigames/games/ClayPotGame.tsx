import React from 'react';
import { GridPickEngine } from '../engines/GridPickEngine';
import type { MinigameProps } from '../types';

export const ClayPotGame: React.FC<MinigameProps> = ({ students, muted, onPickStudent }) => (
  <GridPickEngine
    students={students}
    muted={muted}
    title="Đập Niêu đất — Trò chơi dân gian"
    itemEmoji="🏺"
    openedEmoji="💥"
    cardGradient="from-amber-600 to-orange-800"
    smashEffect={true}
    onPickStudent={onPickStudent}
  />
);

export default ClayPotGame;
