import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Info } from 'lucide-react';

interface InfoHintProps {
  title?: string;
  text: string;
  className?: string;
}

export const InfoHint: React.FC<InfoHintProps> = ({ title, text, className = '' }) => {
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number; width: number; above: boolean }>({
    top: 0,
    left: 0,
    width: 315,
    above: false,
  });

  const updatePosition = useCallback(() => {
    const el = btnRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const margin = 12;
    const popupWidth = Math.min(315, window.innerWidth - margin * 2);
    const spaceBelow = window.innerHeight - rect.bottom;
    const above = spaceBelow < 180 && rect.top > 180;

    const rawLeft = rect.left + rect.width / 2 - popupWidth / 2;
    const left = Math.max(margin, Math.min(rawLeft, window.innerWidth - popupWidth - margin));
    const top = above ? rect.top - 8 : rect.bottom + 8;

    setCoords({ top, left, width: popupWidth, above });
  }, []);

  const handleOpen = () => {
    updatePosition();
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const onScrollOrResize = () => updatePosition();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onPointerDown = (e: PointerEvent) => {
      if (btnRef.current && !btnRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
    window.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
      window.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open, updatePosition]);

  return (
    <span className={`inline-flex items-center align-middle ${className}`}>
      <button
        ref={btnRef}
        type="button"
        aria-label={title ? `Giải thích: ${title}` : 'Giải thích tính năng'}
        onMouseEnter={handleOpen}
        onMouseLeave={() => setOpen(false)}
        onFocus={handleOpen}
        onBlur={() => setOpen(false)}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (open) {
            setOpen(false);
          } else {
            handleOpen();
          }
        }}
        className="w-4 h-4 rounded-full bg-slate-100 hover:bg-brand-100 text-slate-500 hover:text-brand-700 border border-slate-300/90 hover:border-brand-300 inline-flex items-center justify-center transition shrink-0 focus:outline-none focus:ring-2 focus:ring-brand-400"
      >
        <Info className="w-2.5 h-2.5" strokeWidth={2.5} />
      </button>

      {open &&
        createPortal(
          <div
            role="tooltip"
            style={{
              position: 'fixed',
              top: coords.top,
              left: coords.left,
              width: coords.width,
              transform: coords.above ? 'translateY(-100%)' : 'none',
              zIndex: 9999,
            }}
            className="pointer-events-none rounded-xl bg-slate-900 text-white shadow-xl border border-slate-700/80 p-3 text-left"
          >
            {title && (
              <div className="text-[11px] font-extrabold text-sky-300 mb-1 leading-snug">
                {title}
              </div>
            )}
            <p className="text-[11px] text-slate-100 leading-relaxed font-normal whitespace-pre-line">
              {text}
            </p>
          </div>,
          document.body,
        )}
    </span>
  );
};
