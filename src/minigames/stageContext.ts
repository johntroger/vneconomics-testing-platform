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
  {
    label: string;
    shortLabel: string;
    wheelMs: number;
    raceSpeedMult: number;
    durationScale: number;
    badge: string;
  }
> = {
  FAST: {
    label: 'Nhanh (~9s)',
    shortLabel: '⚡ 9s',
    wheelMs: 9000,
    raceSpeedMult: 0.39,
    durationScale: 0.53,
    badge: 'Nhanh',
  },
  NORMAL: {
    label: 'Chuẩn (~17s)',
    shortLabel: '⏱️ 17s',
    wheelMs: 17000,
    raceSpeedMult: 0.22,
    durationScale: 1.0,
    badge: 'Chuẩn',
  },
  EPIC: {
    label: 'Hồi hộp (~26s)',
    shortLabel: '🔥 26s',
    wheelMs: 26000,
    raceSpeedMult: 0.14,
    durationScale: 1.53,
    badge: 'Hồi hộp',
  },
};

export function scalePaceMs(normalMs: number, paceMode: PaceMode): number {
  return Math.round(normalMs * PACE_META[paceMode].durationScale);
}

export const MinigameStageContext = createContext<MinigameStageSettings>({
  paceMode: 'NORMAL',
  render3D: false,
  theme: 'NEON',
});

export function useMinigameStageSettings(): MinigameStageSettings {
  return useContext(MinigameStageContext);
}
