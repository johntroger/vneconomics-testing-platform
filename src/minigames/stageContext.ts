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
    label: 'Nhanh (~6s)',
    shortLabel: '⚡ 6s',
    wheelMs: 6000,
    raceSpeedMult: 0.55,
    badge: 'Nhanh',
  },
  NORMAL: {
    label: 'Chuẩn (~12s)',
    shortLabel: '⏱️ 12s',
    wheelMs: 12000,
    raceSpeedMult: 0.28,
    badge: 'Chuẩn',
  },
  EPIC: {
    label: 'Siêu hồi hộp (22s+)',
    shortLabel: '🔥 22s+',
    wheelMs: 22500,
    raceSpeedMult: 0.145,
    badge: 'Siêu hồi hộp',
  },
};

export const MinigameStageContext = createContext<MinigameStageSettings>({
  paceMode: 'EPIC',
  render3D: true,
  theme: 'NEON',
});

export function useMinigameStageSettings(): MinigameStageSettings {
  return useContext(MinigameStageContext);
}
