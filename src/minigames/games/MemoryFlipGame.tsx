import React from 'react';
import { GridPickEngine } from '../engines/GridPickEngine';
import type { MinigameProps } from '../types';

export const MemoryFlipGame: React.FC<MinigameProps> = ({ students, muted, onPickStudent }) => (
  <GridPickEngine
    students={students}
    muted={muted}
    title="Lật Thẻ bài 3D — Chọn 1 lá bài bí ẩn"
    itemEmoji="🃏"
    openedEmoji="🎯"
    cardGradient="from-indigo-500 to-purple-700"
    onPickStudent={onPickStudent}
  />
);

export default MemoryFlipGame;
