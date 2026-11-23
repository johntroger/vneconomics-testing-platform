import React from 'react';
import { RaceEngine } from '../engines/RaceEngine';
import type { MinigameProps } from '../types';

export const FrogJumpGame: React.FC<MinigameProps> = ({ students, muted, onPickStudent }) => (
  <RaceEngine
    students={students}
    muted={muted}
    racerEmoji="🐸"
    title="Ếch Nhảy Lá sen — Nhảy qua ao sen về đích!"
    trackBgClass="bg-gradient-to-b from-teal-900/85 to-emerald-950/90"
    trailEmoji="🪷"
    onPickStudent={onPickStudent}
  />
);

export default FrogJumpGame;
