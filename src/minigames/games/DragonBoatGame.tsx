import React from 'react';
import { RaceEngine } from '../engines/RaceEngine';
import type { MinigameProps } from '../types';

export const DragonBoatGame: React.FC<MinigameProps> = ({ students, muted, onPickStudent }) => (
  <RaceEngine
    students={students}
    muted={muted}
    racerEmoji="🐉"
    title="Đua Thuyền rồng — Rẽ sóng vượt thác!"
    trackBgClass="bg-gradient-to-b from-blue-900/85 to-rose-950/85"
    trailEmoji="🌊"
    onPickStudent={onPickStudent}
  />
);

export default DragonBoatGame;
