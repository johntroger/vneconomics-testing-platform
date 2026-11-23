import { createContext, useContext } from 'react';
import type { StageTheme } from './types';

export type PaceMode = 'FAST' | 'NORMAL' | 'EPIC';

export interface MinigameStageSettings {
  paceMode: PaceMode;
  render3D: boolean;
  theme: StageTheme;
}

export const PACE_META: Record<
  PaceMode,
  { label: string; shortLabel: string; wheelMs: number; raceSpeedMult: number; badge: string }
> = {
  FAST: {
    label: 'Siêu nhanh (~2.2s)',
    shortLabel: '⚡ 2.2s',
    wheelMs: 2200,
    raceSpeedMult: 1.56,
    badge: 'Siêu nhanh',
  },
  NORMAL: {
    label: 'Chuẩn (~4.2s)',
    shortLabel: '⏱️ 4.2s',
    wheelMs: 4200,
    raceSpeedMult: 0.88,
    badge: 'Chuẩn',
  },
  EPIC: {
    label: 'Hồi hộp (~6.5s)',
    shortLabel: '🔥 6.5s',
    wheelMs: 6500,
    raceSpeedMult: 0.56,
    badge: 'Hồi hộp',
  },
};

export const MinigameStageContext = createContext<MinigameStageSettings>({
  paceMode: 'NORMAL',
  render3D: true,
  theme: 'NEON',
});

export function useMinigameStageSettings(): MinigameStageSettings {
  return useContext(MinigameStageContext);
}
