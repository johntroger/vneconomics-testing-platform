// Storybook Watercolor Art & Character Renderer for "Hái Xoài Chấm Muối Tôm"
// Warm dark-sepia ink (#351e10) + multi-stop sunlit watercolor gradients

export type MangoMood = 'CHILL' | 'TEASE' | 'NERVOUS' | 'PANIC' | 'RELIEVED' | 'KUNGFU';
export type BoyPose = 'IDLE' | 'SQUAT_POUR' | 'AIM_POLE' | 'TIPTOE_STRAIN' | 'ANT_HOP' | 'CHEER';
export type GirlPose = 'IDLE' | 'STARRY_CLAP' | 'WATCH_UP' | 'LAUGH' | 'SHOCK' | 'CHEER';
export type AnhBaPose = 'ENTER' | 'AIM_POLE' | 'STRIKE' | 'CHEER';

const INK = '#351e10';

export function drawStorybookCourtyard(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  tSec: number,
  washImg: HTMLImageElement | null,
): void {
  // 1. Sky & Horizon Base (blending Canva watercolor wash if loaded)
  const skyGrad = ctx.createLinearGradient(0, 0, 0, h * 0.68);
  skyGrad.addColorStop(0, '#7dd3fc');
  skyGrad.addColorStop(0.55, '#bae6fd');
  skyGrad.addColorStop(1, '#fef3c7');
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, w, h);

  if (washImg) {
    ctx.save();
    ctx.globalAlpha = 0.42;
    ctx.filter = 'blur(10px)';
    ctx.drawImage(washImg, -20, -20, w + 40, h + 40);
    ctx.restore();
  }

  // Distant misty hills & sunlit treelines
  ctx.save();
  ctx.fillStyle = 'rgba(134, 239, 172, 0.45)';
  ctx.beginPath();
  ctx.moveTo(0, 410);
  ctx.bezierCurveTo(260, 355, 520, 395, 820, 365);
  ctx.bezierCurveTo(1020, 345, 1160, 380, w, 368);
  ctx.lineTo(w, 450);
  ctx.lineTo(0, 450);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // 2. Swaying Golden-Green Bamboo Grove on Left Background
  const sway = Math.sin(tSec * 1.4) * 5;
  ctx.save();
  const bambooClusters = [
    [220, 345, 68, '#86efac'],
    [285, 325, 82, '#4ade80'],
    [355, 340, 74, '#a3e635'],
    [420, 360, 62, '#bef264'],
    [160, 355, 64, '#4ade80'],
  ] as const;
  bambooClusters.forEach(([bx, by, br, col], i) => {
    ctx.fillStyle = col;
    ctx.globalAlpha = 0.78;
    ctx.beginPath();
    ctx.arc(bx + sway * (0.4 + i * 0.12), by, br, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;
  // Thin bamboo stalks
  ctx.strokeStyle = '#3f6212';
  ctx.lineWidth = 3;
  for (let s = 0; s < 6; s++) {
    const sx = 235 + s * 28;
    ctx.beginPath();
    ctx.moveTo(sx, 435);
    ctx.quadraticCurveTo(sx + 8 + sway, 360, sx + 16 + sway * 1.3, 295);
    ctx.stroke();
  }
  ctx.restore();

  // 3. Rustic Vietnamese Tile-Roof Cottage (Nhà ngói ba gian bên trái)
  ctx.save();
  const hx = 18;
  const hy = 338;
  // Warm plaster walls
  const wallGrad = ctx.createLinearGradient(hx, hy, hx, hy + 112);
  wallGrad.addColorStop(0, '#fde68a');
  wallGrad.addColorStop(1, '#d97706');
  ctx.fillStyle = wallGrad;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.roundRect(hx, hy + 28, 226, 86, 4);
  ctx.fill();
  ctx.stroke();

  // Veranda wooden pillars & shadow
  ctx.fillStyle = 'rgba(69, 26, 3, 0.25)';
  ctx.fillRect(hx + 4, hy + 30, 218, 14);
  ctx.fillStyle = '#78350f';
  [hx + 22, hx + 112, hx + 202].forEach((px) => {
    ctx.fillRect(px, hy + 30, 8, 84);
  });

  // Wooden windows & open doorway
  ctx.fillStyle = '#451a03';
  ctx.fillRect(hx + 95, hy + 52, 38, 62);
  ctx.fillStyle = '#92400e';
  ctx.strokeRect(hx + 44, hy + 54, 32, 32);
  ctx.fillRect(hx + 44, hy + 54, 32, 32);
  ctx.strokeRect(hx + 152, hy + 54, 32, 32);
  ctx.fillRect(hx + 152, hy + 54, 32, 32);

  // Terracotta clay tile roof
  const roofGrad = ctx.createLinearGradient(hx, hy - 18, hx, hy + 36);
  roofGrad.addColorStop(0, '#ea580c');
  roofGrad.addColorStop(0.6, '#c2410c');
  roofGrad.addColorStop(1, '#9a3412');
  ctx.fillStyle = roofGrad;
  ctx.beginPath();
  ctx.moveTo(hx - 18, hy + 34);
  ctx.lineTo(hx + 34, hy - 14);
  ctx.lineTo(hx + 196, hy - 14);
  ctx.lineTo(hx + 252, hy + 34);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Earthenware water jar (Lu nước mưa)
  ctx.fillStyle = '#b45309';
  ctx.beginPath();
  ctx.ellipse(hx + 236, hy + 98, 16, 18, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  // 4. Sunlit Packed-Earth Courtyard Ground (Sân đất nắng vàng)
  const groundGrad = ctx.createLinearGradient(0, 442, 0, h);
  groundGrad.addColorStop(0, '#fDE68A');
  groundGrad.addColorStop(0.28, '#f59e0b');
  groundGrad.addColorStop(1, '#b45309');
  ctx.fillStyle = groundGrad;
  ctx.beginPath();
  ctx.moveTo(0, 448);
  ctx.quadraticCurveTo(640, 434, w, 450);
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.closePath();
  ctx.fill();

  // Dappled tree-canopy shadow on courtyard
  ctx.save();
  ctx.fillStyle = 'rgba(120, 53, 15, 0.22)';
  ctx.beginPath();
  ctx.ellipse(860 + sway * 1.2, 512, 360, 58, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(254, 243, 199, 0.32)';
  for (let d = 0; d < 9; d++) {
    ctx.beginPath();
    ctx.ellipse(580 + d * 68 + sway, 495 + (d % 3) * 18, 22, 7, 0.15, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // 5. Giant Ancient Mango Tree Trunk & Spreading Branches (Cây xoài cổ thụ)
  ctx.save();
  const trunkGrad = ctx.createLinearGradient(760, 220, 990, 500);
  trunkGrad.addColorStop(0, '#78350f');
  trunkGrad.addColorStop(0.55, '#5c280c');
  trunkGrad.addColorStop(1, '#3b1806');
  ctx.fillStyle = trunkGrad;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 3.2;

  ctx.beginPath();
  ctx.moveTo(735, 498); // Wide gnarled left root
  ctx.quadraticCurveTo(805, 465, 818, 370);
  ctx.quadraticCurveTo(790, 295, 640, 235); // Big left bough
  ctx.lineTo(665, 210);
  ctx.quadraticCurveTo(820, 265, 855, 290);
  ctx.quadraticCurveTo(875, 230, 860, 175); // Center bough
  ctx.lineTo(920, 175);
  ctx.quadraticCurveTo(925, 245, 945, 285);
  ctx.quadraticCurveTo(1035, 240, 1145, 205); // Right bough
  ctx.lineTo(1165, 235);
  ctx.quadraticCurveTo(1020, 290, 965, 368);
  ctx.quadraticCurveTo(980, 460, 1055, 496); // Wide gnarled right root
  ctx.quadraticCurveTo(955, 488, 915, 498);
  ctx.quadraticCurveTo(885, 482, 845, 500);
  ctx.quadraticCurveTo(795, 490, 735, 498);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Bark texture lines
  ctx.strokeStyle = 'rgba(254, 215, 170, 0.22)';
  ctx.lineWidth = 2.2;
  [
    [850, 315, 838, 465],
    [888, 295, 892, 472],
    [930, 320, 955, 468],
  ].forEach(([x1, y1, x2, y2]) => {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.quadraticCurveTo((x1 + x2) / 2 + 8, (y1 + y2) / 2, x2, y2);
    ctx.stroke();
  });
  ctx.restore();

  // 6. Lush Multi-Layered Watercolor Mango Canopy (spanning whole upper half!)
  const drawFoliageLayer = (
    blobs: ReadonlyArray< readonly [number, number, number, number] >,
    topColor: string,
    botColor: string,
    swayMult: number,
  ) => {
    const grad = ctx.createLinearGradient(0, 0, 0, 345);
    grad.addColorStop(0, topColor);
    grad.addColorStop(1, botColor);
    ctx.save();
    ctx.fillStyle = grad;
    ctx.strokeStyle = 'rgba(30, 58, 15, 0.45)';
    ctx.lineWidth = 2;
    blobs.forEach(([cx, cy, rx, ry], idx) => {
      const dx = sway * swayMult * (idx % 2 === 0 ? 1 : 0.7);
      ctx.beginPath();
      ctx.ellipse(cx + dx, cy, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    });
    ctx.restore();
  };

  // Deep shadow leaves
  drawFoliageLayer(
    [
      [140, 155, 165, 130],
      [360, 145, 195, 145],
      [620, 140, 225, 155],
      [890, 145, 220, 155],
      [1135, 155, 185, 140],
      [490, 235, 180, 95],
      [780, 240, 190, 95],
      [1040, 235, 175, 90],
      [230, 230, 165, 90],
    ],
    '#15803d',
    '#14532d',
    0.4,
  );

  // Mid emerald leaves
  drawFoliageLayer(
    [
      [110, 115, 145, 108],
      [310, 105, 175, 118],
      [545, 98, 195, 124],
      [795, 102, 195, 124],
      [1035, 108, 180, 116],
      [1210, 128, 140, 105],
      [390, 198, 155, 82],
      [675, 202, 168, 84],
      [945, 198, 160, 82],
    ],
    '#22c55e',
    '#15803d',
    0.75,
  );

  // Sunlit golden-lime crown highlights
  drawFoliageLayer(
    [
      [175, 65, 125, 72],
      [425, 58, 150, 78],
      [685, 55, 165, 82],
      [945, 60, 155, 78],
      [1160, 72, 125, 70],
    ],
    '#bef264',
    '#4ade80',
    1.0,
  );

  // Golden afternoon sunbeams filtering diagonally
  ctx.save();
  const beam = ctx.createLinearGradient(980, 0, 480, h);
  beam.addColorStop(0, 'rgba(254, 249, 195, 0.18)');
  beam.addColorStop(1, 'rgba(254, 249, 195, 0)');
  ctx.fillStyle = beam;
  ctx.beginPath();
  ctx.moveTo(920, 0);
  ctx.lineTo(1140, 0);
  ctx.lineTo(680, h);
  ctx.lineTo(430, h);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

export function drawChiliSaltSheet(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  saltProgress: number, // 0..1
): void {
  ctx.save();
  ctx.translate(x, y);

  // Perspective white paper sheet on ground
  ctx.fillStyle = 'rgba(69, 26, 3, 0.25)';
  ctx.beginPath();
  ctx.moveTo(-66, 18);
  ctx.lineTo(74, 18);
  ctx.lineTo(54, -14);
  ctx.lineTo(-48, -14);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#fffbeb';
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(-68, 14);
  ctx.lineTo(70, 14);
  ctx.lineTo(50, -16);
  ctx.lineTo(-50, -16);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  if (saltProgress > 0.02) {
    const s = Math.min(1, saltProgress);
    const moundW = 36 * s;
    const moundH = 18 * s;

    // Coarse orange-red Tây Ninh chili-shrimp salt mound
    const saltGrad = ctx.createLinearGradient(0, -moundH, 0, 8);
    saltGrad.addColorStop(0, '#f97316');
    saltGrad.addColorStop(0.55, '#ea580c');
    saltGrad.addColorStop(1, '#b91c1c');
    ctx.fillStyle = saltGrad;
    ctx.strokeStyle = '#7c2d12';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(-moundW, 6);
    ctx.quadraticCurveTo(0, -moundH * 1.45, moundW, 6);
    ctx.quadraticCurveTo(0, 11, -moundW, 6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Crystalline white salt & red chili flecks
    const specks = Math.floor(14 * s);
    for (let i = 0; i < specks; i++) {
      const ang = i * 2.399;
      const rad = ((i % 5) / 5) * moundW * 0.72;
      const sx = Math.cos(ang) * rad;
      const sy = 3 - Math.abs(Math.sin(ang)) * moundH * 0.65;
      ctx.fillStyle = i % 3 === 0 ? '#fef3c7' : '#dc2626';
      ctx.fillRect(sx - 1.2, sy - 1.2, 2.4, 2.4);
    }
  }
  ctx.restore();
}

export function drawChibiMango(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  mood: MangoMood,
  label: string,
  tSec: number,
  phase: number,
  rotation = 0,
  showStem = true,
): void {
  const swayAngle =
    mood === 'PANIC'
      ? Math.sin(tSec * 34 + phase) * 0.16
      : mood === 'NERVOUS'
        ? Math.sin(tSec * 20 + phase) * 0.08
        : Math.sin(tSec * 2.4 + phase) * 0.045;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation + swayAngle);

  // Stem & Green Mango Leaf
  if (showStem) {
    ctx.strokeStyle = '#3f2305';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(0, -radius * 1.02);
    ctx.lineTo(0, -radius * 1.32);
    ctx.stroke();

    ctx.fillStyle = '#16a34a';
    ctx.strokeStyle = '#14532d';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, -radius * 1.12);
    ctx.quadraticCurveTo(radius * 0.65, -radius * 1.42, radius * 0.85, -radius * 0.98);
    ctx.quadraticCurveTo(radius * 0.35, -radius * 0.85, 0, -radius * 1.12);
    ctx.fill();
    ctx.stroke();
  }

  // Ripe Kidney-Shaped Mango Silhouette
  const mGrad = ctx.createRadialGradient(
    -radius * 0.25,
    -radius * 0.3,
    radius * 0.15,
    0,
    0,
    radius * 1.25,
  );
  mGrad.addColorStop(0, '#fef08a');
  mGrad.addColorStop(0.55, '#facc15');
  mGrad.addColorStop(0.88, '#eab308');
  mGrad.addColorStop(1, '#84cc16');

  ctx.fillStyle = mGrad;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(0, -radius * 1.05);
  ctx.bezierCurveTo(radius * 0.98, -radius * 1.02, radius * 1.06, radius * 0.25, radius * 0.42, radius * 0.98);
  ctx.bezierCurveTo(radius * 0.08, radius * 1.22, -radius * 0.72, radius * 1.02, -radius * 0.86, radius * 0.28);
  ctx.bezierCurveTo(-radius * 0.98, -radius * 0.48, -radius * 0.68, -radius * 1.05, 0, -radius * 1.05);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Glossy cheek shine
  ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
  ctx.beginPath();
  ctx.ellipse(-radius * 0.38, -radius * 0.42, radius * 0.16, radius * 0.3, -0.35, 0, Math.PI * 2);
  ctx.fill();

  // Optional Shaolin Red Kung-Fu Headband ("Xoài võ Thiếu Lâm")
  if (mood === 'KUNGFU') {
    ctx.fillStyle = '#dc2626';
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.8;
    // Flying ribbon tails
    const flap = Math.sin(tSec * 24) * 5;
    ctx.beginPath();
    ctx.moveTo(radius * 0.65, -radius * 0.52);
    ctx.lineTo(radius * 1.45, -radius * 0.75 + flap);
    ctx.lineTo(radius * 1.32, -radius * 0.42 + flap);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Forehead band
    ctx.beginPath();
    ctx.roundRect(-radius * 0.78, -radius * 0.62, radius * 1.58, radius * 0.28, 4);
    ctx.fill();
    ctx.stroke();
  }

  // Rosy cheeks
  ctx.fillStyle = 'rgba(244, 63, 94, 0.38)';
  ctx.beginPath();
  ctx.ellipse(-radius * 0.44, radius * 0.16, radius * 0.16, radius * 0.1, 0, 0, Math.PI * 2);
  ctx.ellipse(radius * 0.44, radius * 0.16, radius * 0.16, radius * 0.1, 0, 0, Math.PI * 2);
  ctx.fill();

  // Expressive Chibi Eyes & Mouth
  ctx.fillStyle = INK;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';

  const eyeY = -radius * 0.08;
  const eyeX = radius * 0.3;

  if (mood === 'PANIC' || mood === 'NERVOUS') {
    // Wide whites + tiny trembling pupils
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(-eyeX, eyeY, radius * 0.22, 0, Math.PI * 2);
    ctx.arc(eyeX, eyeY, radius * 0.22, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.arc(-eyeX, eyeY, radius * 0.09, 0, Math.PI * 2);
    ctx.arc(eyeX, eyeY, radius * 0.09, 0, Math.PI * 2);
    ctx.fill();

    if (mood === 'PANIC') {
      // Screaming mouth + tear streams
      ctx.fillStyle = '#991b1b';
      ctx.beginPath();
      ctx.ellipse(0, radius * 0.36, radius * 0.24, radius * 0.28, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#38bdf8';
      ctx.beginPath();
      ctx.ellipse(-eyeX - 4, eyeY + radius * 0.22, 3.5, 6, 0.2, 0, Math.PI * 2);
      ctx.ellipse(eyeX + 4, eyeY + radius * 0.22, 3.5, 6, -0.2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Wavy nervous mouth + sweat drop
      ctx.beginPath();
      ctx.moveTo(-radius * 0.24, radius * 0.36);
      ctx.quadraticCurveTo(-radius * 0.1, radius * 0.26, 0, radius * 0.36);
      ctx.quadraticCurveTo(radius * 0.1, radius * 0.46, radius * 0.24, radius * 0.36);
      ctx.stroke();

      ctx.fillStyle = '#38bdf8';
      ctx.beginPath();
      ctx.ellipse(radius * 0.56, -radius * 0.32, 3.2, 5.5, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (mood === 'KUNGFU') {
    // Fierce kung-fu eyebrows & confident smirk
    ctx.beginPath();
    ctx.moveTo(-eyeX - 6, eyeY - 7);
    ctx.lineTo(-eyeX + 5, eyeY - 2);
    ctx.moveTo(eyeX + 6, eyeY - 7);
    ctx.lineTo(eyeX - 5, eyeY - 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(-eyeX, eyeY + 2, radius * 0.12, 0, Math.PI * 2);
    ctx.arc(eyeX, eyeY + 2, radius * 0.12, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(-radius * 0.2, radius * 0.34);
    ctx.quadraticCurveTo(radius * 0.08, radius * 0.46, radius * 0.28, radius * 0.24);
    ctx.stroke();
  } else if (mood === 'TEASE') {
    // Wink + cheeky pink tongue out
    ctx.beginPath();
    ctx.moveTo(-eyeX - 5, eyeY - 2);
    ctx.lineTo(-eyeX + 4, eyeY + 1);
    ctx.lineTo(-eyeX - 5, eyeY + 4);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(eyeX, eyeY, radius * 0.13, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(eyeX - 1.5, eyeY - 2, radius * 0.045, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = INK;
    ctx.beginPath();
    ctx.arc(0, radius * 0.26, radius * 0.2, 0, Math.PI);
    ctx.stroke();
    ctx.fillStyle = '#fb7185';
    ctx.beginPath();
    ctx.ellipse(2, radius * 0.42, radius * 0.13, radius * 0.15, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else if (mood === 'RELIEVED') {
    // Happy curved sigh eyes
    ctx.beginPath();
    ctx.arc(-eyeX, eyeY + 3, radius * 0.13, Math.PI, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(eyeX, eyeY + 3, radius * 0.13, Math.PI, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, radius * 0.3, radius * 0.15, 0, Math.PI);
    ctx.stroke();
  } else {
    // CHILL: Big sparkly chibi eyes + happy grin
    ctx.beginPath();
    ctx.arc(-eyeX, eyeY, radius * 0.14, 0, Math.PI * 2);
    ctx.arc(eyeX, eyeY, radius * 0.14, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(-eyeX - 1.8, eyeY - 2.2, radius * 0.05, 0, Math.PI * 2);
    ctx.arc(eyeX - 1.8, eyeY - 2.2, radius * 0.05, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(0, radius * 0.25, radius * 0.22, 0, Math.PI);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  ctx.restore();

  // Crisp Student Name Tag right below mango
  if (label) {
    ctx.save();
    const fontPx = radius < 21 ? 10.5 : 11.8;
    ctx.font = `800 ${fontPx}px system-ui, -apple-system, sans-serif`;
    const tw = ctx.measureText(label).width;
    const pw = tw + 12;
    const ph = radius < 21 ? 17 : 19;
    const bx = x - pw / 2;
    const by = y + radius * 1.05;

    ctx.fillStyle =
      mood === 'KUNGFU' || mood === 'PANIC'
        ? '#fef08a'
        : 'rgba(255, 255, 255, 0.94)';
    ctx.strokeStyle = mood === 'KUNGFU' || mood === 'PANIC' ? '#dc2626' : INK;
    ctx.lineWidth = mood === 'KUNGFU' || mood === 'PANIC' ? 2 : 1.5;
    ctx.beginPath();
    ctx.roundRect(bx, by, pw, ph, 6);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#1c1917';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x, by + ph / 2 + 0.5);
    ctx.restore();
  }
}

// Detailed Storybook Chibi Village Boy ("Tí" — red shirt, rolled navy shorts)
export function drawStorybookBoy(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  pose: BoyPose,
  tSec: number,
): { handX: number; handY: number } {
  const hop =
    pose === 'ANT_HOP'
      ? Math.abs(Math.sin(tSec * 18)) * 28
      : pose === 'CHEER'
        ? Math.abs(Math.sin(tSec * 12)) * 18
        : pose === 'TIPTOE_STRAIN'
          ? 12 + Math.sin(tSec * 28) * 1.8
          : Math.sin(tSec * 3.5) * 1.5;

  const squatDrop = pose === 'SQUAT_POUR' ? 24 : 0;

  ctx.save();
  ctx.translate(x, y);

  // Ground shadow
  ctx.fillStyle = 'rgba(69, 26, 3, 0.28)';
  ctx.beginPath();
  ctx.ellipse(0, 0, 28, 7, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.translate(0, -hop + squatDrop);

  // Tapered Legs & Barefoot Toes
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.4;
  ctx.fillStyle = '#fed7aa';
  if (pose === 'SQUAT_POUR') {
    ctx.beginPath();
    ctx.roundRect(-18, -32, 16, 14, 6);
    ctx.roundRect(2, -32, 16, 14, 6);
    ctx.fill();
    ctx.stroke();
  } else {
    const legSpread = pose === 'ANT_HOP' ? Math.sin(tSec * 18) * 10 : 0;
    ctx.beginPath();
    ctx.roundRect(-13 - legSpread * 0.4, -34, 10, 32, 5);
    ctx.roundRect(3 + legSpread * 0.4, -34, 10, 32, 5);
    ctx.fill();
    ctx.stroke();
  }

  // Navy Shorts
  ctx.fillStyle = '#1e3a8a';
  ctx.beginPath();
  ctx.roundRect(-17, -50, 34, 20, 6);
  ctx.fill();
  ctx.stroke();

  // Red Bite Flash on Bum when Ant Bites!
  if (pose === 'ANT_HOP') {
    ctx.fillStyle = '#ef4444';
    const pulse = 8 + Math.sin(tSec * 30) * 3;
    ctx.beginPath();
    ctx.arc(-18, -40, pulse, 0, Math.PI * 2);
    ctx.fill();
  }

  // Red T-Shirt Torso
  const shirtGrad = ctx.createLinearGradient(0, -88, 0, -46);
  shirtGrad.addColorStop(0, '#ef4444');
  shirtGrad.addColorStop(1, '#b91c1c');
  ctx.fillStyle = shirtGrad;
  ctx.beginPath();
  ctx.roundRect(-18, -86, 36, 40, 10);
  ctx.fill();
  ctx.stroke();

  // Chibi Head (tilted up when looking at mangoes)
  ctx.save();
  const headTilt =
    pose === 'AIM_POLE' || pose === 'TIPTOE_STRAIN'
      ? -0.26
      : pose === 'SQUAT_POUR'
        ? 0.22
        : 0;
  ctx.translate(0, -108);
  ctx.rotate(headTilt);

  // Face
  ctx.fillStyle = '#fed7aa';
  ctx.beginPath();
  ctx.arc(0, 0, 24, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Tousled Village Boy Hair
  ctx.fillStyle = '#1c1917';
  ctx.beginPath();
  ctx.arc(0, -5, 25, Math.PI * 0.92, Math.PI * 2.08);
  // Spiky playful bangs
  ctx.lineTo(18, -8);
  ctx.lineTo(10, -2);
  ctx.lineTo(4, -10);
  ctx.lineTo(-4, -2);
  ctx.lineTo(-14, -9);
  ctx.lineTo(-24, -2);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Eyes & Expression
  if (pose === 'ANT_HOP' || pose === 'TIPTOE_STRAIN') {
    // Tightly squeezed "> <" comic eyes
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(-10, -3);
    ctx.lineTo(-3, 1);
    ctx.lineTo(-10, 5);
    ctx.moveTo(12, -3);
    ctx.lineTo(5, 1);
    ctx.lineTo(12, 5);
    ctx.stroke();

    ctx.fillStyle = '#991b1b';
    ctx.beginPath();
    ctx.ellipse(2, 12, 6, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else {
    // Big bright storybook eyes
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.arc(-6, 1, 3.8, 0, Math.PI * 2);
    ctx.arc(8, 1, 3.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(-7, -0.5, 1.5, 0, Math.PI * 2);
    ctx.arc(7, -0.5, 1.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(2, 9, 6.5, 0, Math.PI);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();

  // Arms + Salt Jar if pouring
  ctx.strokeStyle = INK;
  ctx.lineWidth = 7;
  ctx.lineCap = 'round';
  let localHandX = 18;
  let localHandY = -74;

  if (pose === 'SQUAT_POUR') {
    const shake = Math.sin(tSec * 28) * 5;
    localHandX = 32;
    localHandY = -58 + shake;
    ctx.strokeStyle = '#fed7aa';
    ctx.beginPath();
    ctx.moveTo(8, -74);
    ctx.lineTo(localHandX, localHandY);
    ctx.stroke();

    // Chili-salt shaker jar tilted downward
    ctx.save();
    ctx.translate(localHandX + 6, localHandY + 4);
    ctx.rotate(0.85);
    ctx.fillStyle = '#fef3c7';
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(-8, -11, 16, 22, 4);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ea580c';
    ctx.fillRect(-6, -2, 12, 11);
    ctx.fillStyle = '#dc2626';
    ctx.fillRect(-7, -14, 14, 5);
    ctx.restore();
  } else if (pose === 'AIM_POLE' || pose === 'TIPTOE_STRAIN') {
    localHandX = 24;
    localHandY = -88;
    ctx.strokeStyle = '#fed7aa';
    ctx.beginPath();
    ctx.moveTo(-6, -74);
    ctx.lineTo(localHandX - 6, localHandY + 6);
    ctx.moveTo(10, -76);
    ctx.lineTo(localHandX, localHandY);
    ctx.stroke();
  } else if (pose === 'ANT_HOP') {
    // Hands clutching bum
    ctx.strokeStyle = '#fed7aa';
    ctx.beginPath();
    ctx.moveTo(-10, -76);
    ctx.lineTo(-18, -42);
    ctx.moveTo(12, -76);
    ctx.lineTo(24, -92);
    ctx.stroke();
  } else if (pose === 'CHEER') {
    ctx.strokeStyle = '#fed7aa';
    ctx.beginPath();
    ctx.moveTo(-12, -78);
    ctx.lineTo(-26, -106);
    ctx.moveTo(12, -78);
    ctx.lineTo(26, -106);
    ctx.stroke();
  } else {
    ctx.strokeStyle = '#fed7aa';
    ctx.beginPath();
    ctx.moveTo(-14, -76);
    ctx.lineTo(-20, -54);
    ctx.moveTo(14, -76);
    ctx.lineTo(20, -54);
    ctx.stroke();
  }

  ctx.restore();
  return { handX: x + localHandX, handY: y - hop + squatDrop + localHandY };
}

// Detailed Storybook Chibi Village Girl ("Na" — twin pigtails, pastel green Áo bà ba)
export function drawStorybookGirl(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  pose: GirlPose,
  tSec: number,
): void {
  const bounce =
    pose === 'CHEER'
      ? Math.abs(Math.sin(tSec * 12 + 0.8)) * 16
      : pose === 'LAUGH'
        ? Math.abs(Math.sin(tSec * 16)) * 5
        : Math.sin(tSec * 3.2 + 1) * 1.5;

  ctx.save();
  ctx.translate(x, y);

  ctx.fillStyle = 'rgba(69, 26, 3, 0.26)';
  ctx.beginPath();
  ctx.ellipse(0, 0, 26, 6.5, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.translate(0, -bounce);

  // Dark rural silk trousers (Quần đen áo bà ba)
  ctx.fillStyle = '#292524';
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.roundRect(-14, -42, 12, 38, 4);
  ctx.roundRect(2, -42, 12, 38, 4);
  ctx.fill();
  ctx.stroke();

  // Pastel Leaf-Green Áo Bà Ba Tunic
  const tunicGrad = ctx.createLinearGradient(0, -84, 0, -36);
  tunicGrad.addColorStop(0, '#bef264');
  tunicGrad.addColorStop(1, '#65a30d');
  ctx.fillStyle = tunicGrad;
  ctx.beginPath();
  ctx.roundRect(-17, -82, 34, 44, 9);
  ctx.fill();
  ctx.stroke();

  // Cute button line down front of Áo bà ba
  ctx.fillStyle = '#fef9c3';
  [-70, -60, -50].forEach((by) => {
    ctx.beginPath();
    ctx.arc(-3, by, 2, 0, Math.PI * 2);
    ctx.fill();
  });

  // Head (facing slightly left toward boy & tree center)
  ctx.save();
  const tilt = pose === 'WATCH_UP' ? 0.22 : pose === 'LAUGH' ? -0.14 : 0;
  ctx.translate(0, -104);
  ctx.rotate(tilt);

  // Twin pigtails with red ribbons
  ctx.fillStyle = '#1c1917';
  ctx.beginPath();
  ctx.ellipse(-25, 2, 10, 7, -0.4, 0, Math.PI * 2);
  ctx.ellipse(25, 2, 10, 7, 0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#ef4444';
  ctx.beginPath();
  ctx.arc(-19, -1, 3.8, 0, Math.PI * 2);
  ctx.arc(19, -1, 3.8, 0, Math.PI * 2);
  ctx.fill();

  // Face
  ctx.fillStyle = '#fed7aa';
  ctx.beginPath();
  ctx.arc(0, 0, 23, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Neat bangs
  ctx.fillStyle = '#1c1917';
  ctx.beginPath();
  ctx.arc(0, -5, 24, Math.PI * 0.94, Math.PI * 2.06);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Rosy cheeks
  ctx.fillStyle = 'rgba(244, 63, 94, 0.4)';
  ctx.beginPath();
  ctx.ellipse(-12, 6, 4.5, 2.8, 0, 0, Math.PI * 2);
  ctx.ellipse(10, 6, 4.5, 2.8, 0, 0, Math.PI * 2);
  ctx.fill();

  // Eyes
  if (pose === 'LAUGH') {
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(-7, 1, 4.5, Math.PI, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(7, 1, 4.5, Math.PI, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = '#fb7185';
    ctx.beginPath();
    ctx.arc(-1, 8, 6.5, 0, Math.PI);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else {
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.arc(-7, 1, 3.8, 0, Math.PI * 2);
    ctx.arc(7, 1, 3.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(-8, -0.5, 1.6, 0, Math.PI * 2);
    ctx.arc(6, -0.5, 1.6, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(-1, 8, 4.5, 0, Math.PI);
    ctx.stroke();
  }
  ctx.restore();

  // Clasped / Cheering Arms
  ctx.strokeStyle = '#fed7aa';
  ctx.lineWidth = 6.5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  if (pose === 'STARRY_CLAP') {
    ctx.moveTo(-12, -72);
    ctx.lineTo(-4, -84);
    ctx.moveTo(12, -72);
    ctx.lineTo(-2, -84);
  } else if (pose === 'CHEER') {
    ctx.moveTo(-12, -74);
    ctx.lineTo(-24, -102);
    ctx.moveTo(12, -74);
    ctx.lineTo(24, -102);
  } else {
    ctx.moveTo(-13, -72);
    ctx.lineTo(-18, -52);
    ctx.moveTo(13, -72);
    ctx.lineTo(18, -52);
  }
  ctx.stroke();

  ctx.restore();
}

// Tall Lanky Older Country Brother ("Anh Ba" — white tank top, khaki rolled trousers)
export function drawAnhBa(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  pose: AnhBaPose,
  tSec: number,
): { handX: number; handY: number } {
  const bounce =
    pose === 'CHEER'
      ? Math.abs(Math.sin(tSec * 12 + 0.3)) * 18
      : pose === 'STRIKE'
        ? 14
        : Math.sin(tSec * 4) * 2;

  ctx.save();
  ctx.translate(x, y);

  ctx.fillStyle = 'rgba(69, 26, 3, 0.28)';
  ctx.beginPath();
  ctx.ellipse(0, 0, 32, 8, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.translate(0, -bounce);

  // Long lanky legs + rolled brown trousers
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.4;
  ctx.fillStyle = '#fdba74';
  ctx.beginPath();
  ctx.roundRect(-15, -52, 11, 50, 5);
  ctx.roundRect(5, -52, 11, 50, 5);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#92400e';
  ctx.beginPath();
  ctx.roundRect(-18, -76, 36, 34, 6);
  ctx.fill();
  ctx.stroke();

  // Classic White Tank-Top (Áo ba lỗ trắng của Anh Ba)
  ctx.fillStyle = '#f8fafc';
  ctx.beginPath();
  ctx.roundRect(-19, -126, 38, 54, 9);
  ctx.fill();
  ctx.stroke();

  // Head
  ctx.save();
  ctx.translate(2, -150);
  ctx.rotate(pose === 'AIM_POLE' || pose === 'STRIKE' ? -0.24 : 0);

  ctx.fillStyle = '#fdba74';
  ctx.beginPath();
  ctx.arc(0, 0, 23, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Tousled older-brother hair
  ctx.fillStyle = '#1c1917';
  ctx.beginPath();
  ctx.arc(-1, -6, 24, Math.PI * 0.88, Math.PI * 2.1);
  ctx.lineTo(22, -16);
  ctx.lineTo(12, -8);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Heroic confident grin
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.arc(-5, 0, 3.4, 0, Math.PI * 2);
  ctx.arc(9, 0, 3.4, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(3, 9, 7, 0, Math.PI);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  // Long reaching arms holding the bamboo pole high!
  let handX = 30;
  let handY = -132;
  ctx.strokeStyle = '#fdba74';
  ctx.lineWidth = 7.5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  if (pose === 'CHEER') {
    ctx.moveTo(-15, -118);
    ctx.lineTo(-30, -154);
    ctx.moveTo(15, -118);
    ctx.lineTo(30, -154);
  } else {
    handX = 32;
    handY = pose === 'STRIKE' ? -144 : -132;
    ctx.moveTo(-10, -116);
    ctx.lineTo(handX - 8, handY + 10);
    ctx.moveTo(14, -118);
    ctx.lineTo(handX, handY);
  }
  ctx.stroke();

  ctx.restore();
  return { handX: x + handX, handY: y - bounce + handY };
}

// Long Segmented Bamboo Harvesting Pole + Iron Catcher Net + Optional Weaver Ants
export function drawBambooPole(
  ctx: CanvasRenderingContext2D,
  fromX: number,
  fromY: number,
  tipX: number,
  tipY: number,
  antProgress: number, // 0 = none, 0..1 = ants marching from tip down toward hands!
): void {
  ctx.save();
  const dx = tipX - fromX;
  const dy = tipY - fromY;
  // Slight natural bamboo flex
  const midX = fromX + dx * 0.5 - 12;
  const midY = fromY + dy * 0.5 + 8;

  // Pole outline & golden bamboo fill
  ctx.strokeStyle = INK;
  ctx.lineWidth = 8.5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(fromX - dx * 0.08, fromY - dy * 0.08);
  ctx.quadraticCurveTo(midX, midY, tipX, tipY);
  ctx.stroke();

  ctx.strokeStyle = '#eab308';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(fromX - dx * 0.08, fromY - dy * 0.08);
  ctx.quadraticCurveTo(midX, midY, tipX, tipY);
  ctx.stroke();

  // Bamboo node rings
  ctx.strokeStyle = '#713f12';
  ctx.lineWidth = 2.2;
  for (let i = 1; i <= 5; i++) {
    const t = i / 6;
    const inv = 1 - t;
    const nx = inv * inv * fromX + 2 * inv * t * midX + t * t * tipX;
    const ny = inv * inv * fromY + 2 * inv * t * midY + t * t * tipY;
    ctx.beginPath();
    ctx.arc(nx, ny, 3.5, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Iron Wire Ring + Small Cloth Catcher Basket at Pole Tip
  ctx.fillStyle = 'rgba(254, 243, 199, 0.72)';
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.ellipse(tipX + 6, tipY + 4, 15, 9, -0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Optional Marching Weaver Ants ("Kiến vàng bò xuống sào!")
  if (antProgress > 0) {
    for (let a = 0; a < 5; a++) {
      const t = Math.max(0.02, Math.min(0.98, 1 - antProgress * 0.92 + a * 0.09));
      const inv = 1 - t;
      const ax = inv * inv * fromX + 2 * inv * t * midX + t * t * tipX;
      const ay = inv * inv * fromY + 2 * inv * t * midY + t * t * tipY;
      ctx.fillStyle = '#ea580c';
      ctx.strokeStyle = '#7c2d12';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(ax, ay, 3.2, 0, Math.PI * 2);
      ctx.arc(ax - 4, ay + 3, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }

  ctx.restore();
}
