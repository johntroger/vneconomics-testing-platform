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
    raceSpeedMult: 0.56,
    badge: 'Nhanh',
  },
  NORMAL: {
    label: 'Chuẩn (~12s)',
    shortLabel: '⏱️ 12s',
    wheelMs: 12000,
    raceSpeedMult: 0.3,
    badge: 'Chuẩn',
  },
  EPIC: {
    label: 'Kịch tính (~16s)',
    shortLabel: '🔥 16s',
    wheelMs: 16500,
    raceSpeedMult: 0.21,
    badge: 'Kịch tính',
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
