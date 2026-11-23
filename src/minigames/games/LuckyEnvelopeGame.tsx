import React from 'react';
import { GridPickEngine } from '../engines/GridPickEngine';
import type { MinigameProps } from '../types';

export const LuckyEnvelopeGame: React.FC<MinigameProps> = ({ students, muted, onPickStudent }) => (
  <GridPickEngine
    students={students}
    muted={muted}
    title="Hái Lộc Lì xì — Chọn bao lì xì may mắn"
    itemEmoji="🧧"
    openedEmoji="🌟"
    cardGradient="from-red-500 to-rose-700"
    floating={true}
    onPickStudent={onPickStudent}
  />
);

export default LuckyEnvelopeGame;
