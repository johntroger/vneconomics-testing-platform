import React from 'react';
import { RaceEngine } from '../engines/RaceEngine';
import type { MinigameProps } from '../types';

export const MountainClimbGame: React.FC<MinigameProps> = ({ students, muted, onPickStudent }) => (
  <RaceEngine
    students={students}
    muted={muted}
    racerEmoji="🧗"
    title="Leo núi Chinh phục — Ai chạm đỉnh cờ đầu tiên?"
    trackBgClass="bg-gradient-to-b from-slate-700/90 to-stone-900/95"
    trailEmoji="🚩"
    onPickStudent={onPickStudent}
  />
);

export default MountainClimbGame;
