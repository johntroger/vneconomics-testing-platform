import React from 'react';
import { GridPickEngine } from '../engines/GridPickEngine';
import type { MinigameProps } from '../types';

export const GoldenEggGame: React.FC<MinigameProps> = ({ students, muted, onPickStudent }) => (
  <GridPickEngine
    students={students}
    muted={muted}
    title="Đập Trứng Vàng — Chạm vỡ vỏ trứng lộ tên"
    itemEmoji="🥚"
    openedEmoji="🐣"
    cardGradient="from-amber-400 to-yellow-600"
    smashEffect={true}
    onPickStudent={onPickStudent}
  />
);

export default GoldenEggGame;
