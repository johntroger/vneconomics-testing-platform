import React, { useEffect, useRef } from 'react';

interface CanvasQuestionViewProps {
  text: string;
  watermark: string;
  fontSizePx?: number;
}

export const CanvasQuestionView: React.FC<CanvasQuestionViewProps> = ({
  text,
  watermark,
  fontSizePx = 16,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const draw = () => {
      const container = containerRef.current;
      const canvas = canvasRef.current;
      if (!container || !canvas) return;

      const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      const width = Math.max(container.clientWidth, 260);
      const paddingX = 14;
      const paddingY = 14;
      const lineHeight = Math.round(fontSizePx * 1.55);

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.font = `600 ${fontSizePx}px "Plus Jakarta Sans", Inter, sans-serif`;
      const maxLineWidth = width - paddingX * 2;
      const words = text.split(' ');
      const lines: string[] = [];
      let current = '';

      for (const word of words) {
        const test = current ? `${current} ${word}` : word;
        if (ctx.measureText(test).width > maxLineWidth && current) {
          lines.push(current);
          current = word;
        } else {
          current = test;
        }
      }
      if (current) lines.push(current);

      const height = paddingY * 2 + Math.max(lines.length, 1) * lineHeight + 6;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      ctx.scale(dpr, dpr);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);

      // Subtle Moire optical mesh against phone-to-phone OCR camera capture
      ctx.strokeStyle = 'rgba(36, 86, 184, 0.055)';
      ctx.lineWidth = 1;
      for (let x = -height; x < width + height; x += 14) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x + height * 0.45, height);
        ctx.stroke();
      }

      // Micro inline watermark behind question strokes
      ctx.save();
      ctx.fillStyle = 'rgba(22, 36, 58, 0.045)';
      ctx.font = '600 10px "JetBrains Mono", monospace';
      ctx.translate(width / 2, height / 2);
      ctx.rotate(-0.08);
      ctx.fillText(watermark, -width * 0.38, 4);
      ctx.restore();

      ctx.fillStyle = '#16243a';
      ctx.font = `600 ${fontSizePx}px "Plus Jakarta Sans", Inter, sans-serif`;
      ctx.textBaseline = 'top';
      lines.forEach((line, idx) => {
        const jitterY = idx % 2 === 0 ? 0.3 : -0.3;
        ctx.fillText(line, paddingX, paddingY + idx * lineHeight + jitterY);
      });
    };

    draw();
    window.addEventListener('resize', draw);
    return () => window.removeEventListener('resize', draw);
  }, [fontSizePx, text, watermark]);

  return (
    <div
      ref={containerRef}
      className="w-full rounded-xl border border-slate-200 bg-white overflow-hidden select-none"
    >
      <canvas ref={canvasRef} className="block w-full pointer-events-none" />
    </div>
  );
};
