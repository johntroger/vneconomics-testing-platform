import React from 'react';
import { GridPickEngine } from '../engines/GridPickEngine';
import type { MinigameProps } from '../types';

export const TreasureChestGame: React.FC<MinigameProps> = ({ students, muted, onPickStudent }) => (
  <GridPickEngine
    students={students}
    muted={muted}
    title="Mở Rương Kho báu — Rương nào chứa tên bạn?"
    itemEmoji="🧰"
    openedEmoji="💎"
    cardGradient="from-yellow-500 to-amber-700"
    onPickStudent={onPickStudent}
  />
);

export default TreasureChestGame;
