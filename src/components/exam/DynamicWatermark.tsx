import React, { useEffect, useState } from 'react';

interface DynamicWatermarkProps {
  studentCode: string;
  studentName: string;
  deviceToken: string;
}

export const DynamicWatermark: React.FC<DynamicWatermarkProps> = ({
  studentCode,
  studentName,
  deviceToken,
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

  const stamp = `${studentCode} • ${studentName} • ${clock} • ${deviceToken.slice(-6).toUpperCase()}`;

  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 pointer-events-none select-none overflow-hidden z-20"
    >
      <div className="grid grid-cols-2 gap-y-24 gap-x-12 -rotate-[22deg] scale-125 opacity-[0.065] py-8">
        {Array.from({ length: 12 }).map((_, i) => (
          <div
            key={i}
            className="text-[11px] font-mono font-semibold text-ink-900 whitespace-nowrap tracking-wide"
          >
            {stamp}
          </div>
        ))}
      </div>
    </div>
  );
};
