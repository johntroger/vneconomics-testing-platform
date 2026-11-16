import React from 'react';

export interface GameAvatarSpec {
  id: string;
  label: string;
  gradient: string;
}

export const GAME_AVATARS: GameAvatarSpec[] = [
  { id: 'fox', label: 'Cáo Thông Thái', gradient: 'from-orange-400 to-rose-500' },
  { id: 'lion', label: 'Sư Tử Bản Lĩnh', gradient: 'from-amber-400 to-orange-600' },
  { id: 'owl', label: 'Cú Đêm Ôn Thi', gradient: 'from-indigo-400 to-purple-600' },
  { id: 'rocket', label: 'Tên Lửa Tăng Trưởng', gradient: 'from-sky-400 to-blue-600' },
  { id: 'unicorn', label: 'Kỳ Lân Startup', gradient: 'from-pink-400 to-fuchsia-600' },
  { id: 'robot', label: 'Robot AI', gradient: 'from-cyan-400 to-teal-600' },
  { id: 'dragon', label: 'Rồng Vàng', gradient: 'from-emerald-400 to-green-600' },
  { id: 'diamond', label: 'Kim Cương', gradient: 'from-blue-400 to-indigo-600' },
  { id: 'crown', label: 'Vương Miện', gradient: 'from-yellow-400 to-amber-500' },
  { id: 'penguin', label: 'Cánh Cụt', gradient: 'from-slate-500 to-slate-700' },
  { id: 'panda', label: 'Gấu Trúc', gradient: 'from-teal-400 to-emerald-600' },
  { id: 'bolt', label: 'Tia Chớp', gradient: 'from-violet-500 to-rose-500' },
];

function renderMascotSvg(id: string): React.ReactNode {
  switch (id) {
    case 'fox':
      return (
        <svg viewBox="0 0 40 40" className="w-3/4 h-3/4">
          <polygon points="8,8 16,14 10,20" fill="#fff" opacity="0.95" />
          <polygon points="32,8 24,14 30,20" fill="#fff" opacity="0.95" />
          <circle cx="20" cy="22" r="11" fill="#fff" />
          <circle cx="16" cy="21" r="1.7" fill="#1e293b" />
          <circle cx="24" cy="21" r="1.7" fill="#1e293b" />
          <polygon points="18,25 22,25 20,28" fill="#ea580c" />
        </svg>
      );
    case 'lion':
      return (
        <svg viewBox="0 0 40 40" className="w-3/4 h-3/4">
          <circle cx="20" cy="20" r="14" fill="#fef3c7" opacity="0.45" />
          <circle cx="20" cy="20" r="10" fill="#fff" />
          <circle cx="16.5" cy="19" r="1.7" fill="#1e293b" />
          <circle cx="23.5" cy="19" r="1.7" fill="#1e293b" />
          <polygon points="18,22 22,22 20,24.5" fill="#d97706" />
        </svg>
      );
    case 'owl':
      return (
        <svg viewBox="0 0 40 40" className="w-3/4 h-3/4">
          <circle cx="20" cy="21" r="11.5" fill="#fff" />
          <circle cx="15.5" cy="19" r="3.8" fill="#e0e7ff" stroke="#4f46e5" strokeWidth="1.5" />
          <circle cx="24.5" cy="19" r="3.8" fill="#e0e7ff" stroke="#4f46e5" strokeWidth="1.5" />
          <circle cx="15.5" cy="19" r="1.4" fill="#1e293b" />
          <circle cx="24.5" cy="19" r="1.4" fill="#1e293b" />
          <polygon points="18.5,22 21.5,22 20,25.5" fill="#f59e0b" />
        </svg>
      );
    case 'rocket':
      return (
        <svg viewBox="0 0 40 40" className="w-3/4 h-3/4">
          <path d="M20 6 C26 12, 27 22, 24 29 L16 29 C13 22, 14 12, 20 6 Z" fill="#fff" />
          <circle cx="20" cy="17" r="3.2" fill="#2563eb" />
          <polygon points="14,23 9,30 15,28" fill="#fde047" />
          <polygon points="26,23 31,30 25,28" fill="#fde047" />
          <polygon points="18,29 22,29 20,35" fill="#fb923c" />
        </svg>
      );
    case 'unicorn':
      return (
        <svg viewBox="0 0 40 40" className="w-3/4 h-3/4">
          <polygon points="20,5 17,14 23,14" fill="#fde047" />
          <circle cx="20" cy="23" r="10.5" fill="#fff" />
          <circle cx="16.5" cy="22" r="1.6" fill="#1e293b" />
          <circle cx="23.5" cy="22" r="1.6" fill="#1e293b" />
          <path d="M17 26 Q20 28.5 23 26" stroke="#ec4899" strokeWidth="1.8" fill="none" strokeLinecap="round" />
        </svg>
      );
    case 'robot':
      return (
        <svg viewBox="0 0 40 40" className="w-3/4 h-3/4">
          <line x1="20" y1="6" x2="20" y2="11" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
          <circle cx="20" cy="6" r="2" fill="#fde047" />
          <rect x="9" y="11" width="22" height="19" rx="6" fill="#fff" />
          <rect x="13" y="16" width="5" height="4" rx="1.5" fill="#0891b2" />
          <rect x="22" y="16" width="5" height="4" rx="1.5" fill="#0891b2" />
          <rect x="15" y="24" width="10" height="2.2" rx="1" fill="#0f172a" />
        </svg>
      );
    case 'dragon':
      return (
        <svg viewBox="0 0 40 40" className="w-3/4 h-3/4">
          <polygon points="11,10 15,16 9,18" fill="#fde047" />
          <polygon points="29,10 25,16 31,18" fill="#fde047" />
          <circle cx="20" cy="22" r="10.5" fill="#fff" />
          <circle cx="16" cy="21" r="1.8" fill="#15803d" />
          <circle cx="24" cy="21" r="1.8" fill="#15803d" />
          <path d="M15 26 Q20 29 25 26" stroke="#15803d" strokeWidth="1.8" fill="none" strokeLinecap="round" />
        </svg>
      );
    case 'diamond':
      return (
        <svg viewBox="0 0 40 40" className="w-3/4 h-3/4">
          <polygon points="12,11 28,11 33,19 20,33 7,19" fill="#fff" opacity="0.95" />
          <polygon points="12,11 20,19 7,19" fill="#bfdbfe" opacity="0.7" />
          <polygon points="28,11 33,19 20,19" fill="#93c5fd" opacity="0.7" />
        </svg>
      );
    case 'crown':
      return (
        <svg viewBox="0 0 40 40" className="w-3/4 h-3/4">
          <polygon points="7,28 9,14 15,21 20,11 25,21 31,14 33,28" fill="#fff" />
          <rect x="7" y="28" width="26" height="4" rx="2" fill="#fef08a" />
        </svg>
      );
    case 'penguin':
      return (
        <svg viewBox="0 0 40 40" className="w-3/4 h-3/4">
          <circle cx="20" cy="21" r="11.5" fill="#0f172a" />
          <ellipse cx="20" cy="23" rx="7.5" ry="8" fill="#fff" />
          <circle cx="16.5" cy="19" r="1.5" fill="#0f172a" />
          <circle cx="23.5" cy="19" r="1.5" fill="#0f172a" />
          <polygon points="18,22 22,22 20,25" fill="#f59e0b" />
        </svg>
      );
    case 'panda':
      return (
        <svg viewBox="0 0 40 40" className="w-3/4 h-3/4">
          <circle cx="11" cy="12" r="4" fill="#0f172a" />
          <circle cx="29" cy="12" r="4" fill="#0f172a" />
          <circle cx="20" cy="22" r="11" fill="#fff" />
          <ellipse cx="16" cy="20" rx="2.8" ry="2.2" fill="#0f172a" />
          <ellipse cx="24" cy="20" rx="2.8" ry="2.2" fill="#0f172a" />
          <circle cx="16" cy="20" r="0.9" fill="#fff" />
          <circle cx="24" cy="20" r="0.9" fill="#fff" />
          <polygon points="18.5,24 21.5,24 20,26" fill="#0f172a" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 40 40" className="w-3/4 h-3/4">
          <polygon points="22,6 11,22 19,22 17,34 29,18 21,18" fill="#fff" />
        </svg>
      );
  }
}

export const GameAvatarBadge: React.FC<{
  avatarId?: string;
  streak?: number;
  size?: 'sm' | 'md' | 'lg';
}> = ({ avatarId = 'fox', streak = 0, size = 'md' }) => {
  const spec = GAME_AVATARS.find((a) => a.id === avatarId) ?? GAME_AVATARS[0];
  const dims =
    size === 'sm' ? 'w-8 h-8' : size === 'lg' ? 'w-14 h-14' : 'w-10 h-10';
  const onFire = streak >= 2;

  return (
    <div
      className={`relative inline-flex items-center justify-center rounded-2xl bg-gradient-to-br ${spec.gradient} ${dims} shrink-0 shadow-md ${
        onFire ? 'ring-2 ring-amber-300 shadow-amber-500/40 animate-pulse' : ''
      }`}
      title={spec.label}
    >
      {renderMascotSvg(spec.id)}
      {onFire && (
        <span className="absolute -top-1.5 -right-1.5 text-xs leading-none drop-shadow">
          🔥
        </span>
      )}
    </div>
  );
};
