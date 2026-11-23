import React from 'react';

interface RacerSvgIconProps {
  emoji: string;
  accentColor?: string;
  boosting?: boolean;
  className?: string;
}

const LANE_HEX = [
  '#f43f5e',
  '#3b82f6',
  '#10b981',
  '#f59e0b',
  '#8b5cf6',
  '#06b6d4',
  '#ec4899',
  '#84cc16',
];

export function getLaneHexColor(index: number): string {
  return LANE_HEX[index % LANE_HEX.length];
}

export const RacerSvgIcon: React.FC<RacerSvgIconProps> = ({
  emoji,
  accentColor = '#f43f5e',
  boosting = false,
  className = 'w-11 h-7',
}) => {
  // All SVGs face RIGHT (->) toward the finish line
  if (emoji === '🏎️') {
    return (
      <svg viewBox="0 0 80 42" className={`${className} drop-shadow-[0_3px_6px_rgba(0,0,0,0.45)]`} fill="none">
        {boosting && (
          <path d="M2 21 L14 15 L11 21 L14 27 Z" fill="#fde047" className="animate-pulse" />
        )}
        {/* Rear wing */}
        <rect x="8" y="8" width="7" height="22" rx="2" fill="#0f172a" />
        {/* Main F1 body */}
        <path
          d="M14 24 L20 14 L52 14 L74 22 L74 27 L14 27 Z"
          fill={accentColor}
          stroke="#ffffff"
          strokeWidth="1.5"
        />
        {/* Cockpit & Helmet */}
        <ellipse cx="42" cy="15" rx="7" ry="4" fill="#1e293b" />
        <circle cx="43" cy="13" r="4" fill="#f8fafc" stroke="#0f172a" strokeWidth="1.2" />
        {/* Front wing */}
        <path d="M68 25 L78 24 L78 28 L66 28 Z" fill="#0f172a" />
        {/* Wheels */}
        <circle cx="24" cy="29" r="7.5" fill="#0f172a" stroke="#475569" strokeWidth="2" />
        <circle cx="24" cy="29" r="3" fill="#cbd5e1" />
        <circle cx="60" cy="29" r="7" fill="#0f172a" stroke="#475569" strokeWidth="2" />
        <circle cx="60" cy="29" r="2.8" fill="#cbd5e1" />
      </svg>
    );
  }

  if (emoji === '🚀') {
    return (
      <svg viewBox="0 0 80 42" className={`${className} drop-shadow-[0_3px_6px_rgba(0,0,0,0.45)]`} fill="none">
        {/* Exhaust Flame */}
        <path
          d={boosting ? 'M1 21 L18 12 L14 21 L18 30 Z' : 'M7 21 L17 16 L15 21 L17 26 Z'}
          fill={boosting ? '#fde047' : '#fb923c'}
          className={boosting ? 'animate-pulse' : ''}
        />
        {/* Fins */}
        <path d="M16 14 L28 14 L22 5 L14 8 Z" fill={accentColor} />
        <path d="M16 28 L28 28 L22 37 L14 34 Z" fill={accentColor} />
        {/* Fuselage */}
        <path
          d="M16 14 L54 14 C65 14 75 21 75 21 C75 21 65 28 54 28 L16 28 Z"
          fill="#f8fafc"
          stroke="#cbd5e1"
          strokeWidth="1.5"
        />
        {/* Nose Cone */}
        <path d="M56 14.3 C66 15.2 75 21 75 21 C75 21 66 26.8 56 27.7 Z" fill={accentColor} />
        {/* Porthole */}
        <circle cx="44" cy="21" r="4.8" fill="#38bdf8" stroke="#0f172a" strokeWidth="1.8" />
        <circle cx="45.5" cy="19.5" r="1.4" fill="#ffffff" />
      </svg>
    );
  }

  if (emoji === '🦆') {
    return (
      <svg viewBox="0 0 72 44" className={`${className} drop-shadow-[0_3px_6px_rgba(0,0,0,0.4)]`} fill="none">
        {/* Water Wake */}
        <path d="M4 34 Q14 30 22 34 T40 34 T58 34" stroke="#7dd3fc" strokeWidth="2.5" strokeLinecap="round" />
        {/* Duck Body */}
        <ellipse cx="32" cy="27" rx="18" ry="11" fill="#facc15" stroke="#ca8a04" strokeWidth="1.5" />
        {/* Wing */}
        <path d="M22 25 Q32 20 40 27 Q31 32 22 25 Z" fill={accentColor} />
        {/* Head */}
        <circle cx="48" cy="15" r="9" fill="#fde047" stroke="#ca8a04" strokeWidth="1.5" />
        {/* Racing Goggles / Band */}
        <rect x="41" y="10" width="14" height="4" rx="2" fill={accentColor} />
        {/* Eye */}
        <circle cx="51" cy="14" r="1.8" fill="#0f172a" />
        {/* Beak */}
        <path d="M56 14 L67 17 L56 20 Z" fill="#f97316" stroke="#c2410c" strokeWidth="1" />
      </svg>
    );
  }

  if (emoji === '🐉') {
    return (
      <svg viewBox="0 0 84 44" className={`${className} drop-shadow-[0_3px_6px_rgba(0,0,0,0.45)]`} fill="none">
        {/* Water Ripple */}
        <path d="M4 36 Q18 32 32 36 T60 36" stroke="#38bdf8" strokeWidth="2" strokeLinecap="round" />
        {/* Boat Hull */}
        <path d="M10 26 L64 26 L56 35 L16 35 Z" fill={accentColor} stroke="#fef08a" strokeWidth="1.6" />
        {/* Dragon Tail */}
        <path d="M10 27 L4 14 L14 22 Z" fill="#fbbf24" />
        {/* Dragon Head Prow */}
        <path d="M60 27 L72 13 L78 19 L68 29 Z" fill="#ef4444" stroke="#fde047" strokeWidth="1.4" />
        <circle cx="71" cy="18" r="1.6" fill="#fef08a" />
        {/* Paddlers */}
        {[24, 34, 44, 54].map((px) => (
          <circle key={px} cx={px} cy="22" r="3.2" fill="#f8fafc" />
        ))}
      </svg>
    );
  }

  if (emoji === '🐎') {
    return (
      <svg viewBox="0 0 76 46" className={`${className} drop-shadow-[0_3px_6px_rgba(0,0,0,0.45)]`} fill="none">
        {/* Galloping Legs */}
        <path d="M22 28 L12 40" stroke="#78350f" strokeWidth="4" strokeLinecap="round" />
        <path d="M28 28 L24 41" stroke="#92400e" strokeWidth="4" strokeLinecap="round" />
        <path d="M48 28 L56 40" stroke="#78350f" strokeWidth="4" strokeLinecap="round" />
        <path d="M52 26 L64 34" stroke="#92400e" strokeWidth="4" strokeLinecap="round" />
        {/* Tail */}
        <path d="M16 20 Q6 18 4 27" stroke="#451a03" strokeWidth="4" strokeLinecap="round" />
        {/* Horse Body */}
        <ellipse cx="36" cy="23" rx="18" ry="8.5" fill="#b45309" />
        {/* Saddle */}
        <path d="M28 16 Q36 22 44 16 L44 21 L28 21 Z" fill={accentColor} />
        {/* Neck & Head */}
        <path d="M46 21 L57 8 L69 14 L65 19 L55 17 L50 26 Z" fill="#b45309" />
        {/* Jockey Helmet */}
        <circle cx="36" cy="12" r="4.2" fill={accentColor} stroke="#ffffff" strokeWidth="1.2" />
      </svg>
    );
  }

  if (emoji === '🐸') {
    return (
      <svg viewBox="0 0 70 44" className={`${className} drop-shadow-[0_3px_6px_rgba(0,0,0,0.4)]`} fill="none">
        {/* Hind Leg */}
        <path d="M20 30 Q10 32 14 39 L28 39" stroke="#15803d" strokeWidth="4.5" strokeLinecap="round" />
        {/* Body */}
        <ellipse cx="36" cy="27" rx="17" ry="11" fill="#22c55e" stroke="#15803d" strokeWidth="1.5" />
        <ellipse cx="39" cy="31" rx="11" ry="6" fill="#bbf7d0" />
        {/* Racing Stripe */}
        <circle cx="32" cy="24" r="3" fill={accentColor} />
        {/* Big Eyes */}
        <circle cx="44" cy="15" r="5" fill="#ffffff" stroke="#15803d" strokeWidth="1.5" />
        <circle cx="52" cy="16" r="5" fill="#ffffff" stroke="#15803d" strokeWidth="1.5" />
        <circle cx="45.5" cy="15" r="2" fill="#0f172a" />
        <circle cx="53.5" cy="16" r="2" fill="#0f172a" />
      </svg>
    );
  }

  if (emoji === '🏊') {
    return (
      <svg viewBox="0 0 76 42" className={`${className} drop-shadow-[0_3px_6px_rgba(0,0,0,0.4)]`} fill="none">
        <path d="M4 30 Q16 25 28 30 T52 30 T70 30" stroke="#7dd3fc" strokeWidth="2.5" strokeLinecap="round" />
        {/* Torpedo Board / Swimmer */}
        <path d="M14 23 L52 21 L66 25 L50 29 L14 27 Z" fill={accentColor} />
        <circle cx="54" cy="18" r="5.5" fill="#fde68a" />
        {/* Swim Cap & Goggles */}
        <path d="M49 16 C51 11 58 11 59 16 Z" fill="#ffffff" />
        <rect x="54" y="16" width="5" height="2.6" rx="1" fill="#0f172a" />
        {/* Stroke Arm */}
        <path d="M42 22 L62 14" stroke="#fde68a" strokeWidth="3.5" strokeLinecap="round" />
      </svg>
    );
  }

  // Climber / Default sleek badge
  return (
    <svg viewBox="0 0 72 44" className={`${className} drop-shadow-[0_3px_6px_rgba(0,0,0,0.4)]`} fill="none">
      <path d="M14 34 L34 10 L58 34 Z" fill={accentColor} stroke="#ffffff" strokeWidth="1.8" />
      <circle cx="36" cy="24" r="5" fill="#f8fafc" />
      <path d="M36 6 L36 14 L46 10 Z" fill="#fde047" />
    </svg>
  );
};
