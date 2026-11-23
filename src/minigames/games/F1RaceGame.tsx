import React from 'react';
import { RaceEngine } from '../engines/RaceEngine';
import type { MinigameProps } from '../types';

export const F1RaceGame: React.FC<MinigameProps> = ({ students, muted, onPickStudent }) => (
  <RaceEngine
    students={students}
    muted={muted}
    racerEmoji="🏎️"
    title="Đua Xe Công thức 1 — Bật Nitro bứt tốc về đích!"
    trackBgClass="bg-gradient-to-b from-slate-800/95 to-zinc-950/95"
    trailEmoji="⚡"
    onPickStudent={onPickStudent}
  />
);

export default F1RaceGame;
