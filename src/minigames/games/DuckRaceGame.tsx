import React from 'react';
import { RaceEngine } from '../engines/RaceEngine';
import type { MinigameProps } from '../types';

export const DuckRaceGame: React.FC<MinigameProps> = ({ students, muted, onPickStudent }) => (
  <RaceEngine
    students={students}
    muted={muted}
    racerEmoji="🦆"
    title="Đường đua Vịt — Ai về đích trước (hoặc chót) sẽ lên bảng!"
    trackBgClass="bg-gradient-to-b from-sky-900/70 to-cyan-950/80"
    trailEmoji="💦"
    onPickStudent={onPickStudent}
  />
);

export default DuckRaceGame;
