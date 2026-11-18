import React, { useEffect, useRef } from 'react';

interface CanvasQuestionViewProps {
  text: string;
  watermark: string;
  fontSizePx?: number;
  compact?: boolean;
}

export const CanvasQuestionView: React.FC<CanvasQuestionViewProps> = ({
  text,
  watermark,
  fontSizePx = 16,
  compact = false,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const draw = () => {
      const container = containerRef.current;
      const canvas = canvasRef.current;
      if (!container || !canvas) return;

      const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      const minW = compact ? 180 : 260;
      const width = Math.max(container.clientWidth, minW);
      const paddingX = compact ? 8 : 14;
      const paddingY = compact ? 5 : 14;
      const lineHeight = Math.round(fontSizePx * (compact ? 1.45 : 1.55));
      const fontWeight = compact ? 500 : 600;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.font = `${fontWeight} ${fontSizePx}px "Plus Jakarta Sans", Inter, sans-serif`;
      const maxLineWidth = Math.max(80, width - paddingX * 2);
      const paragraphs = text.split('\n');
      const lines: string[] = [];

      for (const paragraph of paragraphs) {
        const trimmed = paragraph.trim();
        if (!trimmed) {
          lines.push('');
          continue;
        }
        const words = trimmed.split(/\s+/);
        let current = '';
        for (const word of words) {
          const candidate = current ? `${current} ${word}` : word;
          if (ctx.measureText(candidate).width > maxLineWidth && current) {
            lines.push(current);
            current = word;
          } else {
            current = candidate;
          }
        }
        if (current) lines.push(current);
      }

      const height = paddingY * 2 + Math.max(lines.length, 1) * lineHeight + (compact ? 2 : 6);
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      ctx.scale(dpr, dpr);
      if (compact) {
        ctx.clearRect(0, 0, width, height);
      } else {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
      }

      // Dual crossed Moire optical mesh against phone-to-phone OCR camera capture
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(36, 86, 184, 0.065)';
      for (let x = -height; x < width + height; x += 14) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x + height * 0.45, height);
        ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(15, 23, 42, 0.045)';
      for (let x = -height; x < width + height; x += 18) {
        ctx.beginPath();
        ctx.moveTo(x + height * 0.35, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }

      // Repeated micro inline watermark across height so cropped images retain attribution
      const wmStepY = compact ? Math.max(36, height) : 44;
      for (let wy = paddingY + 12; wy < height + 10; wy += wmStepY) {
        ctx.save();
        ctx.fillStyle = 'rgba(22, 36, 58, 0.055)';
        ctx.font = '600 9.5px "JetBrains Mono", monospace';
        ctx.translate(width / 2, wy);
        ctx.rotate(-0.07);
        ctx.fillText(watermark, -width * 0.44, 0);
        ctx.restore();
      }

      ctx.fillStyle = '#16243a';
      ctx.font = `${fontWeight} ${fontSizePx}px "Plus Jakarta Sans", Inter, sans-serif`;
      ctx.textBaseline = 'top';
      lines.forEach((line, idx) => {
        const jitterY = idx % 2 === 0 ? 0.3 : -0.3;
        ctx.fillText(line, paddingX, paddingY + idx * lineHeight + jitterY);
      });
    };

    draw();
    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && containerRef.current) {
      observer = new ResizeObserver(() => draw());
      observer.observe(containerRef.current);
    }
    window.addEventListener('resize', draw);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', draw);
    };
  }, [compact, fontSizePx, text, watermark]);

  return (
    <div
      ref={containerRef}
      className={
        compact
          ? 'w-full overflow-hidden select-none'
          : 'w-full rounded-xl border border-slate-200 bg-white overflow-hidden select-none'
      }
    >
      <canvas ref={canvasRef} className="block w-full pointer-events-none" />
    </div>
  );
};
