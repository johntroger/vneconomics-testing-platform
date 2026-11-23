import React from 'react';
import { RaceEngine } from '../engines/RaceEngine';
import type { MinigameProps } from '../types';

export const HorseRaceGame: React.FC<MinigameProps> = ({ students, muted, onPickStudent }) => (
  <RaceEngine
    students={students}
    muted={muted}
    racerEmoji="🐎"
    title="Đua Ngựa Thảo nguyên — Phi nước đại về đích!"
    trackBgClass="bg-gradient-to-b from-emerald-900/85 to-lime-950/90"
    trailEmoji="💨"
    onPickStudent={onPickStudent}
  />
);

export default HorseRaceGame;
