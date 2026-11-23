import React from 'react';
import { RaceEngine } from '../engines/RaceEngine';
import type { MinigameProps } from '../types';

export const RocketRaceGame: React.FC<MinigameProps> = ({ students, muted, onPickStudent }) => (
  <RaceEngine
    students={students}
    muted={muted}
    racerEmoji="🚀"
    title="Đua Tên lửa Không gian — Phóng ra vũ trụ!"
    trackBgClass="bg-gradient-to-b from-indigo-950/90 to-slate-950/95"
    trailEmoji="🔥"
    onPickStudent={onPickStudent}
  />
);

export default RocketRaceGame;
