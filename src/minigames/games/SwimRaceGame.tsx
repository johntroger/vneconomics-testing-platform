import React from 'react';
import { RaceEngine } from '../engines/RaceEngine';
import type { MinigameProps } from '../types';

export const SwimRaceGame: React.FC<MinigameProps> = ({ students, muted, onPickStudent }) => (
  <RaceEngine
    students={students}
    muted={muted}
    racerEmoji="🏊"
    title="Bơi lội Olympic — Đường đua xanh mát!"
    trackBgClass="bg-gradient-to-b from-cyan-800/85 to-blue-950/90"
    trailEmoji="🫧"
    onPickStudent={onPickStudent}
  />
);

export default SwimRaceGame;
