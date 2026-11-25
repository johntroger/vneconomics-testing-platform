import React, { useEffect, useRef, useState } from 'react';
import type { MinigameProps, RosterStudent } from '../types';
import { cryptoRandomInt } from '../rosterStorage';
import { useMinigameStageSettings, type PaceMode } from '../stageContext';
import {
  playCatchSound,
  playFolkDrumSound,
  playRevealSound,
  startDragonSnakeMusic,
  stopBackgroundMusic,
  unlockGameAudio,
} from '../../utils/gameAudio';

const LOGICAL_W = 1280;
const LOGICAL_H = 640;
const MAX_DRAGON_LENGTH = 24;
const SEGMENT_SPACING = 34;

const TOTAL_MS_BY_PACE: Record<PaceMode, number> = {
  TURBO: 3400,
  FAST: 9200,
  NORMAL: 17200,
  EPIC: 25800,
};

const ASSET_BASE = '/assets/minigames/rong-ran/';
const SPRITE_MANIFEST = {
  bg: `${ASSET_BASE}bg-courtyard.jpg`,
  doctorIdle: `${ASSET_BASE}thay-thuoc-idle.png`,
  doctorGrab: `${ASSET_BASE}thay-thuoc-grab.png`,
  head: `${ASSET_BASE}dau-rong.png`,
  boy: `${ASSET_BASE}than-rong-nam.png`,
  girl: `${ASSET_BASE}than-rong-nu.png`,
} as const;

type SpriteKey = keyof typeof SPRITE_MANIFEST;
type LoadedSprites = Record<SpriteKey, HTMLImageElement>;

interface DragonSegment {
  student: RosterStudent;
  isGirl: boolean;
  x: number;
  y: number;
  facingLeft: boolean;
  phaseOffset: number;
  isWinner: boolean;
}

interface DustFx {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
}

const FEMALE_TOKENS = new Set([
  'thị',
  'ngọc',
  'thảo',
  'hân',
  'nhi',
  'linh',
  'trang',
  'phương',
  'mai',
  'lan',
  'hương',
  'thư',
  'vy',
  'quỳnh',
  'trâm',
  'yến',
  'châu',
  'hà',
  'my',
  'tuệ',
  'ngân',
  'uyên',
  'diễm',
  'thúy',
  'thu',
  'hạnh',
  'diệu',
  'nhung',
  'trinh',
  'vân',
  'ánh',
  'xuân',
]);

const MALE_TOKENS = new Set([
  'văn',
  'đức',
  'minh',
  'hoàng',
  'tuấn',
  'hùng',
  'dũng',
  'phát',
  'khang',
  'khoa',
  'nam',
  'long',
  'đạt',
  'hải',
  'quân',
  'kiệt',
  'thịnh',
  'phúc',
  'khôi',
  'huy',
  'tài',
  'nghĩa',
  'trung',
  'thành',
  'tùng',
  'sơn',
  'cường',
  'phong',
]);

function hashCode(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function inferIsFemale(student: RosterStudent, fallbackIdx: number): boolean {
  const g = (student.gender ?? '').trim().toLowerCase();
  if (g === 'f' || g === 'female' || g === 'nữ' || g === 'nu') return true;
  if (g === 'm' || g === 'male' || g === 'nam') return false;
  const tokens = student.name.trim().toLowerCase().split(/\s+/);
  for (let i = tokens.length - 1; i >= 1; i--) {
    if (FEMALE_TOKENS.has(tokens[i])) return true;
    if (MALE_TOKENS.has(tokens[i])) return false;
  }
  return fallbackIdx % 2 === 1;
}

function shortDisplayName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length <= 2) return fullName.trim();
  return parts.slice(-2).join(' ');
}

function seedIdleTrail(count: number): Array<{ x: number; y: number }> {
  const pts: Array<{ x: number; y: number }> = [];
  const totalDist = Math.max(400, (count + 2) * SEGMENT_SPACING);
  const step = 4;
  for (let d = 0; d <= totalDist; d += step) {
    const t = d / 160;
    const x = 660 - d * 0.62 + Math.sin(t * 1.4) * 32;
    const y = 468 + Math.sin(t * 2.1) * 42;
    pts.push({ x, y });
  }
  return pts;
}

export const DragonSnakeGame: React.FC<MinigameProps> = ({
  students,
  muted,
  onPickStudent,
  onPickStudents,
}) => {
  const { paceMode, pickCount } = useMinigameStageSettings();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const finishTimerRef = useRef<number | null>(null);
  const spritesRef = useRef<LoadedSprites | null>(null);

  const [assetsReady, setAssetsReady] = useState(false);
  const [running, setRunning] = useState(false);
  const [statusText, setStatusText] = useState(
    '🐉 Đoàn Rồng Rắn đã nối đuôi trước sân đình — Bấm để bắt đầu!',
  );

  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  const onPickRef = useRef(onPickStudent);
  onPickRef.current = onPickStudent;
  const onPickManyRef = useRef(onPickStudents);
  onPickManyRef.current = onPickStudents;

  const segmentsRef = useRef<DragonSegment[]>([]);
  const trailRef = useRef<Array<{ x: number; y: number }>>([]);
  const dustRef = useRef<DustFx[]>([]);

  const simRef = useRef<{
    active: boolean;
    startTime: number;
    durationMs: number;
    winner: RosterStudent | null;
    winners: RosterStudent[];
    finished: boolean;
    tailSwapped: boolean;
    cueFlags: Record<string, boolean>;
    shakeUntil: number;
    headX: number;
    headY: number;
    docX: number;
    docY: number;
  }>({
    active: false,
    startTime: 0,
    durationMs: 17200,
    winner: null,
    winners: [],
    finished: false,
    tailSwapped: false,
    cueFlags: {},
    shakeUntil: 0,
    headX: 660,
    headY: 468,
    docX: 980,
    docY: 458,
  });

  // Preload 2D Chibi sprites & village courtyard backdrop
  useEffect(() => {
    let cancelled = false;
    const entries = Object.entries(SPRITE_MANIFEST) as Array<[SpriteKey, string]>;
    Promise.all(
      entries.map(
        ([key, src]) =>
          new Promise<[SpriteKey, HTMLImageElement]>((resolve, reject) => {
            const img = new Image();
            img.decoding = 'async';
            img.onload = () => resolve([key, img]);
            img.onerror = () => reject(new Error(`Failed to load ${src}`));
            img.src = src;
          }),
      ),
    )
      .then((pairs) => {
        if (cancelled) return;
        spritesRef.current = Object.fromEntries(pairs) as LoadedSprites;
        setAssetsReady(true);
      })
      .catch(() => {
        if (!cancelled) {
          setStatusText('⏳ Đang chờ bộ hình nền & nhân vật sân đình được nạp...');
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Build idle dragon snake whenever student roster changes
  useEffect(() => {
    if (simRef.current.active) return;
    const pool = students.slice(0, MAX_DRAGON_LENGTH);
    const trail = seedIdleTrail(pool.length);
    trailRef.current = trail;
    segmentsRef.current = pool.map((st, idx) => {
      const h = hashCode(st.id + st.name);
      const ptIdx = Math.min(trail.length - 1, Math.round((idx * SEGMENT_SPACING) / 4));
      const pt = trail[ptIdx] ?? { x: 640 - idx * 24, y: 470 };
      return {
        student: st,
        isGirl: inferIsFemale(st, idx),
        x: pt.x,
        y: pt.y,
        facingLeft: false,
        phaseOffset: (h % 100) / 14,
        isWinner: false,
      };
    });
  }, [students]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopBackgroundMusic();
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      if (finishTimerRef.current !== null) window.clearTimeout(finishTimerRef.current);
    };
  }, []);

  // Sync festival music with running & muted
  useEffect(() => {
    if (running && !muted) {
      startDragonSnakeMusic();
    } else {
      stopBackgroundMusic();
    }
  }, [running, muted]);

  // 60fps High-DPI Canvas Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, 2);
    canvas.width = LOGICAL_W * dpr;
    canvas.height = LOGICAL_H * dpr;

    let prevNow = performance.now();

    const triggerOnce = (key: string, fn: () => void) => {
      if (!simRef.current.cueFlags[key]) {
        simRef.current.cueFlags[key] = true;
        fn();
      }
    };

    const drawComicBubble = (
      x: number,
      y: number,
      text: string,
      opts: { bg?: string; fg?: string; scale?: number; burst?: boolean } = {},
    ) => {
      const { bg = '#ffffff', fg = '#1e1b4b', scale = 1, burst = false } = opts;
      const cx = Math.max(150, Math.min(LOGICAL_W - 150, x));
      const cy = Math.max(64, y);

      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(scale, scale);

      if (burst) {
        ctx.font = '900 24px system-ui, -apple-system, sans-serif';
        const tw = ctx.measureText(text).width;
        const rx = Math.max(92, tw * 0.65);
        const ry = 34;
        ctx.beginPath();
        for (let i = 0; i < 32; i++) {
          const ang = (i * Math.PI) / 16;
          const mult = i % 2 === 0 ? 1 : 0.76;
          const px = Math.cos(ang) * rx * mult;
          const py = Math.sin(ang) * ry * mult;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fillStyle = '#fde047';
        ctx.strokeStyle = '#7c2d12';
        ctx.lineWidth = 3.5;
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#dc2626';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 4;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.strokeText(text, 0, 1);
        ctx.fillText(text, 0, 1);
      } else {
        ctx.font = '800 16px system-ui, -apple-system, sans-serif';
        const bw = Math.max(110, ctx.measureText(text).width + 32);
        const bh = 38;
        const rx = -bw / 2;
        const ry = -bh;

        ctx.fillStyle = 'rgba(24, 15, 12, 0.25)';
        ctx.beginPath();
        ctx.roundRect(rx + 3, ry + 4, bw, bh, 14);
        ctx.fill();

        ctx.fillStyle = bg;
        ctx.strokeStyle = '#271713';
        ctx.lineWidth = 2.6;
        ctx.beginPath();
        ctx.roundRect(rx, ry, bw, bh, 14);
        ctx.fill();
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(-8, -1);
        ctx.lineTo(0, 11);
        ctx.lineTo(8, -1);
        ctx.closePath();
        ctx.fillStyle = bg;
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = fg;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, 0, ry + bh / 2 + 1);
      }
      ctx.restore();
    };

    const drawCharacter = (
      img: HTMLImageElement,
      x: number,
      y: number,
      targetH: number,
      facingLeft: boolean,
      baseFacesLeft: boolean,
      tSec: number,
      phaseOffset: number,
      mode: 'IDLE' | 'SLITHER' | 'SHOUT' | 'CAUGHT' | 'GRAB',
      label?: string,
      highlight?: boolean,
    ) => {
      const aspect = img.naturalWidth / img.naturalHeight;
      const drawH = targetH;
      const drawW = drawH * aspect;

      let bounceY = 0;
      let stretch = 0;
      let tilt = 0;

      if (mode === 'IDLE') {
        const ph = tSec * 4 + phaseOffset;
        bounceY = Math.abs(Math.sin(ph)) * 3;
        stretch = Math.sin(ph) * 0.02;
      } else if (mode === 'SLITHER') {
        const ph = tSec * 16 + phaseOffset;
        bounceY = Math.abs(Math.sin(ph)) * 10;
        stretch = Math.sin(ph * 2) * 0.065;
        tilt = Math.sin(ph) * 0.06;
      } else if (mode === 'SHOUT' || mode === 'GRAB') {
        bounceY = Math.abs(Math.sin(tSec * 14 + phaseOffset)) * 14;
        stretch = 0.075;
      } else if (mode === 'CAUGHT') {
        bounceY = Math.abs(Math.sin(tSec * 11)) * 14;
        stretch = Math.sin(tSec * 22) * 0.07;
      }

      const shadowScale = Math.max(0.55, 1 - bounceY * 0.013);
      ctx.save();
      ctx.fillStyle = 'rgba(24, 15, 12, 0.28)';
      ctx.beginPath();
      ctx.ellipse(x, y - 3, (drawW * 0.34) * shadowScale, 8 * shadowScale, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      ctx.save();
      ctx.translate(x, y - bounceY);
      ctx.rotate(tilt);
      const flipScale = facingLeft !== baseFacesLeft ? -1 : 1;
      ctx.scale(flipScale * (1 - stretch * 0.7), 1 + stretch);
      ctx.drawImage(img, -drawW / 2, -drawH, drawW, drawH);
      ctx.restore();

      if (label) {
        ctx.save();
        ctx.font = highlight
          ? '900 13.5px system-ui, -apple-system, sans-serif'
          : '800 11.5px system-ui, -apple-system, sans-serif';
        const tw = ctx.measureText(label).width;
        const pw = tw + 14;
        const ph = highlight ? 23 : 19;
        const bx = x - pw / 2;
        const by = y - drawH - bounceY - ph - 5;

        ctx.fillStyle = highlight ? '#fef08a' : 'rgba(255, 255, 255, 0.94)';
        ctx.strokeStyle = highlight ? '#dc2626' : '#271713';
        ctx.lineWidth = highlight ? 2.4 : 1.7;
        ctx.beginPath();
        ctx.roundRect(bx, by, pw, ph, 7);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#0f172a';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, x, by + ph / 2 + 0.5);
        ctx.restore();
      }
    };

    const render = (now: number) => {
      const dt = Math.min(0.05, Math.max(0.001, (now - prevNow) / 1000));
      prevNow = now;
      const tSec = now / 1000;
      const sim = simRef.current;
      const sprites = spritesRef.current;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.clearRect(0, 0, LOGICAL_W, LOGICAL_H);

      if (!sprites) {
        ctx.fillStyle = '#1e1b4b';
        ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
        ctx.fillStyle = '#fef08a';
        ctx.font = '800 20px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('🎨 Đang nạp sân đình & đoàn Rồng Rắn...', LOGICAL_W / 2, LOGICAL_H / 2);
        rafRef.current = requestAnimationFrame(render);
        return;
      }

      const segments = segmentsRef.current;
      let docMode: 'IDLE' | 'GRAB' = 'IDLE';
      let snakeMode: 'IDLE' | 'SLITHER' | 'SHOUT' | 'CAUGHT' = 'IDLE';
      let docBubble: { text: string; bg?: string; fg?: string; burst?: boolean } | null = null;
      let headBubble: { text: string; bg?: string; fg?: string; burst?: boolean } | null = null;
      let winnerBubble: string | null = null;
      let spotlightOn: { x: number; y: number } | null = null;

      if (sim.active && segments.length > 0) {
        const p = Math.min(1, (now - sim.startTime) / sim.durationMs);
        const fastSkip = paceMode === 'TURBO' || paceMode === 'FAST';

        if (!fastSkip && p < 0.24) {
          // ACT 1: Slither & Sing Folk Rhyme
          snakeMode = 'SLITHER';
          const sub = p / 0.24;
          sim.headX = 650 + Math.sin(sub * Math.PI * 2.5) * 90;
          sim.headY = 468 + Math.cos(sub * Math.PI * 3) * 65;
          sim.docX = 1030;
          sim.docY = 455;

          if (sub < 0.48) {
            headBubble = { text: 'Rồng rắn lên mây, có cái cây lúc lắc...', bg: '#fef08a' };
          } else if (paceMode === 'EPIC' && sub < 0.72) {
            headBubble = { text: 'Hỏi thăm Thầy Thuốc có nhà hay không?' };
            docBubble = { text: 'Thầy đi hái thuốc vắng rồi!' };
          } else {
            headBubble = { text: 'Hỏi thăm Thầy Thuốc có nhà hay không?' };
            docBubble = { text: 'Thầy có nhà đây!' };
          }
        } else if (!fastSkip && p < 0.46) {
          // ACT 2: Bargaining the 3 parts ("Khúc đầu / giữa / đuôi")
          snakeMode = 'IDLE';
          const sub = (p - 0.24) / 0.22;
          sim.headX = 760;
          sim.headY = 465;
          sim.docX = 965;
          sim.docY = 465;

          if (sub < 0.3) {
            docBubble = { text: 'Cho thầy xin khúc đầu?' };
            headBubble = { text: 'Cùng xương cùng xẩu!' };
          } else if (sub < 0.62) {
            docBubble = { text: 'Cho thầy xin khúc giữa?' };
            headBubble = { text: 'Chả có gì ngon!' };
          } else {
            snakeMode = 'SHOUT';
            docBubble = { text: 'Cho thầy xin khúc đuôi?!', bg: '#fed7aa' };
            headBubble = { text: 'THA HỒ MÀ ĐUỔI!!', burst: true };
            triggerOnce('drum_shout', () => {
              sim.shakeUntil = now + 260;
              if (!mutedRef.current) playFolkDrumSound();
              setStatusText('🥁 THA HỒ MÀ ĐUỔI!! Thầy Thuốc xuất chiêu vây bắt!');
            });
          }
        } else if (p < 0.87) {
          // ACT 3: Chase, Shielding & Tail-Whip Swaps!
          const startP = fastSkip ? 0 : 0.46;
          const sub = (p - startP) / (0.87 - startP);
          snakeMode = 'SLITHER';
          docMode = 'GRAB';

          if (paceMode === 'TURBO' && sub < 0.28) {
            headBubble = { text: 'THA HỒ MÀ ĐUỔI!!', burst: true };
            triggerOnce('drum_shout', () => {
              sim.shakeUntil = now + 200;
              if (!mutedRef.current) playFolkDrumSound();
            });
          }

          // Head moves actively to shield & whip the tail around the courtyard!
          const sweep = sub * Math.PI * (paceMode === 'TURBO' ? 2.2 : 4.5);
          sim.headX = 640 + Math.cos(sweep) * 210;
          sim.headY = 455 + Math.sin(sweep * 1.5) * 95;

          // Doctor tries to flank left/right behind the head
          const tail = segments[segments.length - 1];
          if (sub < 0.72) {
            // Weaving & 1 near-miss fake-out
            const fakeDodge = Math.sin(sub * Math.PI * 5) * 145;
            const targetDocX = Math.max(220, Math.min(1120, sim.headX + 210 + fakeDodge));
            const targetDocY = Math.max(360, Math.min(585, tail.y - 18));
            sim.docX += (targetDocX - sim.docX) * Math.min(1, dt * 4.5);
            sim.docY += (targetDocY - sim.docY) * Math.min(1, dt * 4.5);

            if (!fastSkip && sub > 0.34 && sub < 0.5) {
              headBubble = { text: 'Đố thầy qua được đầu rồng! 🛡️' };
              docBubble = { text: 'Hụt rồi! Chạy nhanh thế!' };
            }

            // Anti-predictable Tail Twist at ~55% of chase: move winner to the very end!
            if (sub >= 0.55 && !sim.tailSwapped && segments.length > 2) {
              sim.tailSwapped = true;
              const winIdx = segments.findIndex((s) => s.isWinner);
              if (winIdx > 0 && winIdx < segments.length - 1) {
                const [wSeg] = segments.splice(winIdx, 1);
                segments.push(wSeg);
              }
            }
          } else {
            // Final dash straight toward the tail!
            sim.docX += (tail.x + 56 - sim.docX) * Math.min(1, dt * 7);
            sim.docY += (tail.y - sim.docY) * Math.min(1, dt * 7);
            docBubble = { text: 'Chộp được khúc đuôi rồi nè!', bg: '#fef08a' };
          }

          // Spawn terracotta brick dust under running feet
          if (Math.random() < 0.32) {
            const rndSeg = segments[Math.floor(Math.random() * segments.length)];
            dustRef.current.push({
              x: rndSeg.x,
              y: rndSeg.y - 4,
              vx: (Math.random() - 0.5) * 80,
              vy: -25 - Math.random() * 25,
              life: 0,
              maxLife: 22,
              size: 7 + Math.random() * 5,
              color: 'rgba(254, 215, 170, 0.78)',
            });
          }
        } else {
          // ACT 4: CAUGHT! ("CHỘP!!") + Winner Spotlight!
          docMode = 'GRAB';
          snakeMode = 'CAUGHT';
          // Ensure winner is at the tail if TURBO skipped swap
          if (!sim.tailSwapped && segments.length > 2) {
            sim.tailSwapped = true;
            const winIdx = segments.findIndex((s) => s.isWinner);
            if (winIdx > 0 && winIdx < segments.length - 1) {
              const [wSeg] = segments.splice(winIdx, 1);
              segments.push(wSeg);
            }
          }

          const tail = segments[segments.length - 1];
          sim.docX += (tail.x + 76 - sim.docX) * Math.min(1, dt * 10);
          sim.docY += (tail.y - sim.docY) * Math.min(1, dt * 10);
          spotlightOn = { x: tail.x + 25, y: tail.y };

          triggerOnce('caught_sfx', () => {
            sim.shakeUntil = now + 240;
            stopBackgroundMusic();
            if (!mutedRef.current) {
              playCatchSound();
              playRevealSound();
            }
            if (sim.winner) {
              setStatusText(`🎉 Thầy Thuốc chộp gọn khúc đuôi: ${sim.winner.name}!`);
            }
          });

          docBubble = { text: 'CHỘP!! Đứt đuôi rồi nhé!', burst: true };
          winnerBubble = 'Á! Em bị bắt khúc đuôi rồi ạ! 😆';

          if (p >= 1 && !sim.finished) {
            sim.finished = true;
            sim.active = false;
            stopBackgroundMusic();
            setRunning(false);
            if (sim.winners.length > 0) {
              const pickedList = sim.winners;
              finishTimerRef.current = window.setTimeout(() => {
                if (onPickManyRef.current) {
                  onPickManyRef.current(pickedList, 'Rồng Rắn Lên Mây');
                } else {
                  onPickRef.current(pickedList[0]);
                }
              }, 350);
            }
          }
        }

        // Record head trail & position all segments smoothly along the snake curve
        if (snakeMode === 'SLITHER') {
          const trail = trailRef.current;
          const prev = trail[0];
          if (!prev || Math.hypot(sim.headX - prev.x, sim.headY - prev.y) >= 4) {
            trail.unshift({ x: sim.headX, y: sim.headY });
            const maxPts = Math.max(120, segments.length * 14);
            if (trail.length > maxPts) trail.length = maxPts;
          }

          let cursorIdx = 0;
          let accDist = 0;
          segments[0].x = sim.headX;
          segments[0].y = sim.headY;
          segments[0].facingLeft = prev ? sim.headX < prev.x : false;

          for (let i = 1; i < segments.length; i++) {
            const targetDist = i * SEGMENT_SPACING;
            while (cursorIdx < trail.length - 2) {
              const p1 = trail[cursorIdx];
              const p2 = trail[cursorIdx + 1];
              const segLen = Math.hypot(p2.x - p1.x, p2.y - p1.y);
              if (accDist + segLen >= targetDist) break;
              accDist += segLen;
              cursorIdx++;
            }
            const pt = trail[cursorIdx] ?? segments[i - 1];
            const prevSeg = segments[i - 1];
            segments[i].x += (pt.x - segments[i].x) * Math.min(1, dt * 16);
            segments[i].y += (pt.y - segments[i].y) * Math.min(1, dt * 16);
            segments[i].facingLeft = prevSeg.x < segments[i].x;
          }
        }
      } else if (sim.finished && segments.length > 0) {
        const tail = segments[segments.length - 1];
        spotlightOn = { x: tail.x + 25, y: tail.y };
        snakeMode = 'CAUGHT';
      }

      // Camera shake impulse
      let sx = 0;
      let sy = 0;
      if (now < sim.shakeUntil) {
        sx = (Math.random() - 0.5) * 11;
        sy = (Math.random() - 0.5) * 11;
      }

      ctx.save();
      ctx.translate(sx, sy);

      // 1. Draw Village Courtyard Backdrop
      ctx.drawImage(sprites.bg, 0, 0, LOGICAL_W, LOGICAL_H);

      // 2. Spotlight cone at Finale
      if (spotlightOn) {
        ctx.save();
        ctx.fillStyle = 'rgba(15, 23, 42, 0.36)';
        ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
        const cone = ctx.createLinearGradient(spotlightOn.x, 0, spotlightOn.x, LOGICAL_H);
        cone.addColorStop(0, 'rgba(254, 240, 138, 0.38)');
        cone.addColorStop(1, 'rgba(254, 240, 138, 0.08)');
        ctx.fillStyle = cone;
        ctx.beginPath();
        ctx.moveTo(spotlightOn.x - 65, 0);
        ctx.lineTo(spotlightOn.x + 65, 0);
        ctx.lineTo(spotlightOn.x + 205, LOGICAL_H);
        ctx.lineTo(spotlightOn.x - 205, LOGICAL_H);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }

      // 3. Depth-sorted Dragon Segments + Thầy Thuốc
      type Drawable =
        | { kind: 'SEG'; idx: number; seg: DragonSegment; y: number }
        | { kind: 'DOC'; y: number };

      const list: Drawable[] = [
        ...segments.map((seg, idx) => ({ kind: 'SEG' as const, idx, seg, y: seg.y })),
        { kind: 'DOC' as const, y: sim.docY },
      ].sort((a, b) => a.y - b.y);

      list.forEach((item) => {
        if (item.kind === 'DOC') {
          const docImg = docMode === 'GRAB' ? sprites.doctorGrab : sprites.doctorIdle;
          const docBaseFacesLeft = docMode !== 'GRAB';
          const docFacingLeft = sim.docX > (segments[segments.length - 1]?.x ?? 600);
          drawCharacter(
            docImg,
            sim.docX,
            sim.docY,
            158,
            docFacingLeft,
            docBaseFacesLeft,
            tSec,
            0,
            docMode === 'GRAB' ? 'GRAB' : 'IDLE',
            'Thầy Thuốc',
            false,
          );
        } else {
          const isHead = item.idx === 0;
          const isTail = item.idx === segments.length - 1;
          const img = isHead ? sprites.head : item.seg.isGirl ? sprites.girl : sprites.boy;
          const baseFacesLeft = !isHead && item.seg.isGirl;
          const depthScale = 0.86 + ((item.y - 340) / 280) * 0.22;
          const charH = (isHead ? 132 : 122) * Math.max(0.82, Math.min(1.12, depthScale));
          const mode =
            snakeMode === 'CAUGHT' && isTail
              ? 'CAUGHT'
              : snakeMode === 'SHOUT'
                ? 'SHOUT'
                : snakeMode === 'SLITHER'
                  ? 'SLITHER'
                  : 'IDLE';
          drawCharacter(
            img,
            item.seg.x,
            item.seg.y,
            charH,
            item.seg.facingLeft,
            baseFacesLeft,
            tSec,
            item.seg.phaseOffset,
            mode,
            shortDisplayName(item.seg.student.name),
            (sim.finished || snakeMode === 'CAUGHT') && item.seg.isWinner,
          );
        }
      });

      // 4. Courtyard Brick Dust Particles
      dustRef.current = dustRef.current.filter((d) => {
        d.life += 1;
        d.x += d.vx * dt;
        d.y += d.vy * dt;
        if (d.life >= d.maxLife) return false;
        ctx.save();
        ctx.globalAlpha = Math.max(0, 1 - d.life / d.maxLife);
        ctx.fillStyle = d.color;
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        return true;
      });

      // 5. Speech Bubbles
      if (headBubble && segments[0]) {
        drawComicBubble(segments[0].x, segments[0].y - 148, headBubble.text, headBubble);
      }
      if (docBubble) {
        drawComicBubble(sim.docX, sim.docY - 172, docBubble.text, docBubble);
      }
      if (winnerBubble && segments[segments.length - 1]) {
        const tail = segments[segments.length - 1];
        drawComicBubble(tail.x - 10, tail.y - 148, winnerBubble, {
          bg: '#ffffff',
          fg: '#dc2626',
          scale: 1.05,
        });
      }

      ctx.restore();
      rafRef.current = requestAnimationFrame(render);
    };

    rafRef.current = requestAnimationFrame(render);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [paceMode]);

  const handleStart = () => {
    if (running || !assetsReady || students.length === 0) return;
    void unlockGameAudio().then((ok) => {
      if (ok && !mutedRef.current && simRef.current.active) {
        startDragonSnakeMusic();
      }
    });

    const k = Math.max(1, Math.min(pickCount, students.length));
    const poolCopy = [...students];
    for (let i = poolCopy.length - 1; i > 0; i--) {
      const j = cryptoRandomInt(i + 1);
      [poolCopy[i], poolCopy[j]] = [poolCopy[j], poolCopy[i]];
    }
    const chosenWinners = poolCopy.slice(0, k);
    const chosenIds = new Set(chosenWinners.map((s) => s.id));
    const winner = chosenWinners[0];
    simRef.current.winners = chosenWinners;
    const others = students.filter((s) => !chosenIds.has(s.id));
    for (let i = others.length - 1; i > 0; i--) {
      const j = cryptoRandomInt(i + 1);
      [others[i], others[j]] = [others[j], others[i]];
    }
    const crowd = [
      ...others.slice(0, Math.max(0, MAX_DRAGON_LENGTH - chosenWinners.length)),
      ...chosenWinners,
    ];
    for (let i = crowd.length - 1; i > 0; i--) {
      const j = cryptoRandomInt(i + 1);
      [crowd[i], crowd[j]] = [crowd[j], crowd[i]];
    }

    // Place winner initially at a random mid-body spot so nobody can guess early!
    if (crowd.length > 3) {
      const wIdx = crowd.findIndex((s) => s.id === winner.id);
      const midIdx = 1 + cryptoRandomInt(crowd.length - 2);
      if (wIdx >= 0 && wIdx !== midIdx) {
        [crowd[wIdx], crowd[midIdx]] = [crowd[midIdx], crowd[wIdx]];
      }
    }

    const trail = seedIdleTrail(crowd.length);
    trailRef.current = trail;
    segmentsRef.current = crowd.map((st, idx) => {
      const h = hashCode(st.id + st.name);
      const ptIdx = Math.min(trail.length - 1, Math.round((idx * SEGMENT_SPACING) / 4));
      const pt = trail[ptIdx] ?? { x: 640 - idx * 24, y: 470 };
      return {
        student: st,
        isGirl: inferIsFemale(st, idx),
        x: pt.x,
        y: pt.y,
        facingLeft: false,
        phaseOffset: (h % 100) / 14,
        isWinner: chosenIds.has(st.id),
      };
    });

    dustRef.current = [];
    simRef.current = {
      active: true,
      startTime: performance.now(),
      durationMs: TOTAL_MS_BY_PACE[paceMode],
      winner,
      winners: chosenWinners,
      finished: false,
      tailSwapped: false,
      cueFlags: {},
      shakeUntil: 0,
      headX: 660,
      headY: 468,
      docX: 1030,
      docY: 455,
    };

    setRunning(true);
    setStatusText('🥁 Rồng rắn lên mây, có cái cây lúc lắc...');
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-3 sm:p-4 gap-3.5 select-none">
      <div className="w-full max-w-6xl rounded-3xl overflow-hidden border-2 border-amber-300/45 shadow-[0_20px_60px_rgba(0,0,0,0.45)] bg-slate-900 relative">
        <canvas
          ref={canvasRef}
          className="w-full h-auto block aspect-[2/1]"
        />
        <div className="absolute top-3 left-3 px-3.5 py-1.5 rounded-full bg-slate-950/75 border border-white/15 text-white text-xs sm:text-sm font-bold backdrop-blur-md shadow-lg">
          {statusText}
        </div>
      </div>

      <button
        type="button"
        disabled={running || !assetsReady || students.length === 0}
        onClick={handleStart}
        className="px-8 py-3.5 rounded-2xl bg-gradient-to-r from-amber-400 via-orange-500 to-rose-500 hover:brightness-110 disabled:opacity-50 text-slate-950 font-black text-base sm:text-lg shadow-xl shadow-orange-500/30 transition active:scale-95"
      >
        {!assetsReady
          ? '🎨 Đang chuẩn bị sân đình...'
          : running
            ? '🐉 Đang rượt bắt khúc đuôi...'
            : students.length === 0
              ? 'Danh sách học sinh trống'
              : '🐉 CHƠI RỒNG RẮN LÊN MÂY!'}
      </button>
    </div>
  );
};

export default DragonSnakeGame;
