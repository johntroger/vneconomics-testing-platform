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
    label: 'Nhanh (~9s)',
    shortLabel: '⚡ 9s',
    wheelMs: 9000,
    raceSpeedMult: 0.39,
    badge: 'Nhanh',
  },
  NORMAL: {
    label: 'Chuẩn (~17s)',
    shortLabel: '⏱️ 17s',
    wheelMs: 17000,
    raceSpeedMult: 0.22,
    badge: 'Chuẩn',
  },
  EPIC: {
    label: 'Hồi hộp (~26s)',
    shortLabel: '🔥 26s',
    wheelMs: 26000,
    raceSpeedMult: 0.14,
    badge: 'Hồi hộp',
  },
};

export const MinigameStageContext = createContext<MinigameStageSettings>({
  paceMode: 'NORMAL',
  render3D: false,
  theme: 'NEON',
});

export function useMinigameStageSettings(): MinigameStageSettings {
  return useContext(MinigameStageContext);
}
