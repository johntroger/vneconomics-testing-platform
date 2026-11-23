import React from 'react';
import { GridPickEngine } from '../engines/GridPickEngine';
import type { MinigameProps } from '../types';

export const MysteryBoxGame: React.FC<MinigameProps> = ({ students, muted, onPickStudent }) => (
  <GridPickEngine
    students={students}
    muted={muted}
    title="Hộp quà Bí ẩn — Chọn 1 hộp quà để mở tên"
    itemEmoji="🎁"
    openedEmoji="✨"
    cardGradient="from-pink-500 to-rose-600"
    onPickStudent={onPickStudent}
  />
);

export default MysteryBoxGame;
