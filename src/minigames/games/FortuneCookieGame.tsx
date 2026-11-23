import React from 'react';
import { GridPickEngine } from '../engines/GridPickEngine';
import type { MinigameProps } from '../types';

export const FortuneCookieGame: React.FC<MinigameProps> = ({ students, muted, onPickStudent }) => (
  <GridPickEngine
    students={students}
    muted={muted}
    title="Bẻ Bánh quy May mắn — Rút mảnh giấy bí mật"
    itemEmoji="🥠"
    openedEmoji="📜"
    cardGradient="from-orange-400 to-amber-600"
    smashEffect={true}
    onPickStudent={onPickStudent}
  />
);

export default FortuneCookieGame;
