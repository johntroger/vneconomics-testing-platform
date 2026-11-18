import React, { useEffect, useMemo, useState } from 'react';
import { computeForensicCode } from '../../utils/antiScreenshot';

interface DynamicWatermarkProps {
  studentCode: string;
  studentName: string;
  deviceToken: string;
  attemptId?: string;
}

export const DynamicWatermark: React.FC<DynamicWatermarkProps> = ({
  studentCode,
  studentName,
  deviceToken,
  attemptId = '',
}) => {
  const [clock, setClock] = useState(() =>
    new Date().toLocaleTimeString('vi-VN', { hour12: false }),
  );

  useEffect(() => {
    const id = window.setInterval(() => {
      setClock(new Date().toLocaleTimeString('vi-VN', { hour12: false }));
    }, 3000);
    return () => window.clearInterval(id);
  }, []);

  const forensicCode = useMemo(
    () => computeForensicCode(studentCode, attemptId, deviceToken),
    [attemptId, deviceToken, studentCode],
  );

  const primaryStamp = `${studentCode} • ${studentName} • ${clock} • #${forensicCode}`;
  const secondaryStamp = `#${forensicCode} • ${studentCode} • BẢO MẬT ĐỀ THI • ${clock}`;

  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 pointer-events-none select-none overflow-hidden z-40"
    >
      {/* Layer 1: Primary dense multi-tone diagonal grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-y-12 gap-x-8 -rotate-[21deg] scale-125 opacity-[0.095] py-4">
        {Array.from({ length: 24 }).map((_, i) => (
          <div
            key={`wm1-${i}`}
            className={`text-[11px] font-mono font-semibold whitespace-nowrap tracking-wide ${
              i % 2 === 0 ? 'text-ink-900' : 'text-brand-800'
            }`}
          >
            {primaryStamp}
          </div>
        ))}
      </div>

      {/* Layer 2: Counter-rotated forensic hash grid so contrast filters cannot scrub both layers */}
      <div className="absolute inset-0 grid grid-cols-2 sm:grid-cols-3 gap-y-16 gap-x-10 rotate-[14deg] scale-125 opacity-[0.055] py-8">
        {Array.from({ length: 18 }).map((_, i) => (
          <div
            key={`wm2-${i}`}
            className={`text-[10px] font-mono font-bold whitespace-nowrap tracking-wider ${
              i % 2 === 0 ? 'text-brand-700' : 'text-ink-800'
            }`}
          >
            {secondaryStamp}
          </div>
        ))}
      </div>
    </div>
  );
};
