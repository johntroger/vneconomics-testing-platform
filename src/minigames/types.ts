import type React from 'react';

export type MinigameCategory =
  | 'WHEEL_AIM'
  | 'RACE'
  | 'MYSTERY'
  | 'PHYSICS'
  | 'TEAM_ORDER';

export type StageTheme = 'NEON' | 'SUNNY' | 'GOLD';

export interface RosterStudent {
  id: string;
  name: string;
  studentCode?: string;
  gender?: string;
  avatarId: string;
  called: boolean;
  absent: boolean;
  bonusPoints: number;
}

export interface RosterPreset {
  id: string;
  name: string;
  students: RosterStudent[];
  updatedAt: string;
}

export interface PickHistoryEntry {
  id: string;
  studentId: string;
  studentName: string;
  studentCode?: string;
  gameId: string;
  gameName: string;
  bonusAwarded: number;
  status: 'PICKED' | 'ABSENT';
  at: string;
}

export interface MinigameStateStore {
  version: number;
  activePresetName: string;
  excludeCalled: boolean;
  courseId: string;
  students: RosterStudent[];
  presets: RosterPreset[];
  history: PickHistoryEntry[];
}

export interface MinigameProps {
  students: RosterStudent[];
  allStudents: RosterStudent[];
  muted: boolean;
  theme: StageTheme;
  onPickStudent: (student: RosterStudent, note?: string) => void;
}

export interface MinigamePlugin {
  id: string;
  name: string;
  category: MinigameCategory;
  description: string;
  badge?: string;
  gradient: string;
  icon: string;
  ready: boolean;
  component: React.LazyExoticComponent<React.ComponentType<MinigameProps>>;
}

export const MINIGAME_CATEGORIES: Array<{
  id: MinigameCategory | 'ALL';
  label: string;
  icon: string;
}> = [
  { id: 'ALL', label: 'Tất cả', icon: '✨' },
  { id: 'WHEEL_AIM', label: 'Vòng quay & Nhắm bắn', icon: '🎯' },
  { id: 'RACE', label: 'Đường đua Tốc độ', icon: '🏎️' },
  { id: 'MYSTERY', label: 'Bí ẩn & Đập phá', icon: '🎁' },
  { id: 'PHYSICS', label: 'Vật lý & Sinh tồn', icon: '⚡' },
  { id: 'TEAM_ORDER', label: 'Chia nhóm & Thứ tự', icon: '👥' },
];
