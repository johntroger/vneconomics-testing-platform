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
    label: 'Nhanh (~4.5s)',
    shortLabel: '⚡ 4.5s',
    wheelMs: 4500,
    raceSpeedMult: 0.78,
    badge: 'Nhanh',
  },
  NORMAL: {
    label: 'Chuẩn (~8.5s)',
    shortLabel: '⏱️ 8.5s',
    wheelMs: 8500,
    raceSpeedMult: 0.44,
    badge: 'Chuẩn',
  },
  EPIC: {
    label: 'Kịch tính (~13s)',
    shortLabel: '🔥 13s',
    wheelMs: 13000,
    raceSpeedMult: 0.28,
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
