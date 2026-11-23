import React from 'react';
import { WheelEngine } from '../engines/WheelEngine';
import type { MinigameProps } from '../types';

export const DjTurntableGame: React.FC<MinigameProps> = ({ students, muted, onPickStudent }) => (
  <WheelEngine
    students={students}
    muted={muted}
    title="Đĩa than DJ — Xoay đĩa nhạc sôi động chọn tên!"
    palette={['#18181b', '#7c3aed', '#27272a', '#db2777', '#3f3f46', '#0284c7']}
    centerEmoji="🎧"
    onPickStudent={onPickStudent}
  />
);

export default DjTurntableGame;
