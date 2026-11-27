import React from 'react';
import { GridPickEngine } from '../engines/GridPickEngine';
import type { MinigameProps } from '../types';

export const BalloonPopGame: React.FC<MinigameProps> = ({ students, muted, onPickStudent }) => (
  <GridPickEngine
    students={students}
    muted={muted}
    title="Đập Bóng bay — Chạm nổ BÙM để gọi tên!"
    itemEmoji="🎈"
    openedEmoji="💥"
    cardGradient="from-sky-500 to-indigo-600"
    smashEffect={true}
    floating={true}
    onPickStudent={onPickStudent}
  />
);

export default BalloonPopGame;
