import React, { useEffect, useRef, useState } from 'react';
import type { MinigameProps, RosterStudent } from '../types';
import { cryptoRandomInt } from '../rosterStorage';
import { useMinigameStageSettings, type PaceMode } from '../stageContext';
import {
  playAntBiteSound,
  playKungFuWhoosh,
  playMangoKnockSound,
  playMangoThudSound,
  playRevealSound,
  playSaltShakeSound,
  startMangoFolkMusic,
  stopBackgroundMusic,
  unlockGameAudio,
} from '../../utils/gameAudio';
import {
  drawBambooPole,
  drawChibiMango,
  drawChiliSaltSheet,
  type AnhBaPose,
  type BoyPose,
  type GirlPose,
  type MangoMood,
} from './mangoStorybookArt';

const LOGICAL_W = 1280;
const LOGICAL_H = 640;
const MAX_CANOPY_MANGOES = 45;

const ASSET_BASE = '/assets/minigames/hai-xoai/';
const MANGO_SPRITE_MANIFEST = {
  bg: `${ASSET_BASE}bg-mango-yard.jpg`,
  ti: `${ASSET_BASE}ti.png`,
  na: `${ASSET_BASE}na.png`,
  anhBa: `${ASSET_BASE}anh-ba.png`,
} as const;
type MangoSpriteKey = keyof typeof MANGO_SPRITE_MANIFEST;
type MangoSprites = Record<MangoSpriteKey, HTMLImageElement>;

const TOTAL_MS_BY_PACE: Record<PaceMode, number> = {
  TURBO: 3400,
  FAST: 9200,
  NORMAL: 17200,
  EPIC: 26200,
};

interface CanopyMango {
  student: RosterStudent;
  homeX: number;
  homeY: number;
  x: number;
  y: number;
  rot: number;
  phase: number;
  teaseVariant: boolean;
  isWinner: boolean;
  isDecoy1: boolean;
  isDecoy2: boolean;
  detached: boolean;
}

interface FloatingFx {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  text?: string;
  color: string;
  size: number;
}

function hashCode(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function shortDisplayName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length <= 2) return fullName.trim();
  return parts.slice(-2).join(' ');
}

function buildCanopyPositions(pool: RosterStudent[], winnerId?: string): CanopyMango[] {
  const count = pool.length;
  const rows = count <= 10 ? 2 : count <= 24 ? 3 : 4;
  const basePerRow = Math.floor(count / rows);
  const rem = count % rows;

  const result: CanopyMango[] = [];
  let cursor = 0;

  for (let r = 0; r < rows; r++) {
    const rowCount = basePerRow + (r < rem ? 1 : 0);
    if (rowCount <= 0) continue;
    const yBase = rows === 2 ? 86 + r * 86 : rows === 3 ? 64 + r * 74 : 52 + r * 64;
    const padX = r === 0 || r === rows - 1 ? 115 : 82;
    const usableW = LOGICAL_W - padX * 2;

    for (let c = 0; c < rowCount; c++) {
      const st = pool[cursor++];
      const h = hashCode(st.id + st.name);
      const frac = rowCount === 1 ? 0.5 : c / (rowCount - 1);
      const stagger = r % 2 === 1 && rowCount > 1 ? (usableW / rowCount) * 0.18 : 0;
      const hx = Math.min(
        LOGICAL_W - 76,
        Math.max(76, padX + frac * usableW + stagger - (r % 2 === 1 ? 16 : 0)),
      );
      const hy = yBase + ((h % 11) - 5);

      result.push({
        student: st,
        homeX: hx,
        homeY: hy,
        x: hx,
        y: hy,
        rot: 0,
        phase: (h % 100) / 14,
        teaseVariant: h % 3 === 0,
        isWinner: st.id === winnerId,
        isDecoy1: false,
        isDecoy2: false,
        detached: false,
      });
    }
  }

  return result;
}

export const MangoHarvestGame: React.FC<MinigameProps> = ({
  students,
  muted,
  onPickStudent,
  onPickStudents,
}) => {
  const { paceMode, pickCount } = useMinigameStageSettings();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const finishTimerRef = useRef<number | null>(null);
  const spritesRef = useRef<MangoSprites | null>(null);

  const [assetsReady, setAssetsReady] = useState(false);
  const [running, setRunning] = useState(false);
  const [statusText, setStatusText] = useState(
    '🥭 Tán xoài trĩu quả đã sẵn sàng — Bấm hái xoài chấm muối tôm!',
  );

  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  const onPickRef = useRef(onPickStudent);
  onPickRef.current = onPickStudent;
  const onPickManyRef = useRef(onPickStudents);
  onPickManyRef.current = onPickStudents;

  const mangoesRef = useRef<CanopyMango[]>([]);
  const fxRef = useRef<FloatingFx[]>([]);
  const simRef = useRef<{
    active: boolean;
    startTime: number;
    durationMs: number;
    gagChoice: 'ANTS' | 'SHORT'; // Used in NORMAL 17s mode for variety
    winner: RosterStudent | null;
    winners: RosterStudent[];
    finished: boolean;
    cueFlags: Record<string, boolean>;
    poleTipX: number;
    poleTipY: number;
    shakeUntil: number;
  }>({
    active: false,
    startTime: 0,
    durationMs: 17200,
    gagChoice: 'ANTS',
    winner: null,
    winners: [],
    finished: false,
    cueFlags: {},
    poleTipX: 460,
    poleTipY: 220,
    shakeUntil: 0,
  });

  // Preload CHIBI_CEL illustrated mango yard & character sprites
  useEffect(() => {
    let cancelled = false;
    const entries = Object.entries(MANGO_SPRITE_MANIFEST) as Array<[MangoSpriteKey, string]>;
    Promise.all(
      entries.map(
        ([key, src]) =>
          new Promise<[MangoSpriteKey, HTMLImageElement]>((resolve, reject) => {
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
        spritesRef.current = Object.fromEntries(pairs) as MangoSprites;
        setAssetsReady(true);
      })
      .catch(() => {
        if (!cancelled) {
          setStatusText('Không tải được bộ đồ họa vườn xoài — vui lòng tải lại trang.');
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Rebuild idle mango canopy whenever student list changes while idle
  useEffect(() => {
    if (simRef.current.active) return;
    const pool = students.slice(0, MAX_CANOPY_MANGOES);
    mangoesRef.current = buildCanopyPositions(pool);
  }, [students]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopBackgroundMusic();
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      if (finishTimerRef.current !== null) window.clearTimeout(finishTimerRef.current);
    };
  }, []);

  // Sync folk music with running & muted
  useEffect(() => {
    if (running && !muted) {
      startMangoFolkMusic();
    } else {
      stopBackgroundMusic();
    }
  }, [running, muted]);

  // High-DPI 60fps Canvas Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, 2);
    canvas.width = LOGICAL_W * dpr;
    canvas.height = LOGICAL_H * dpr;

    let prevNow = performance.now();

    const drawSpeech = (
      x: number,
      y: number,
      text: string,
      opts: { bg?: string; fg?: string; scale?: number; burst?: boolean } = {},
    ) => {
      const { bg = '#fffbeb', fg = '#351e10', scale = 1, burst = false } = opts;
      const cx = Math.max(150, Math.min(LOGICAL_W - 150, x));
      const cy = Math.max(58, y);

      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(scale, scale);

      if (burst) {
        ctx.font = '900 26px system-ui, -apple-system, sans-serif';
        const tw = ctx.measureText(text).width;
        const rx = Math.max(76, tw * 0.68);
        const ry = 34;
        ctx.beginPath();
        for (let i = 0; i < 28; i++) {
          const ang = (i * Math.PI) / 14;
          const rMult = i % 2 === 0 ? 1 : 0.74;
          const px = Math.cos(ang) * rx * rMult;
          const py = Math.sin(ang) * ry * rMult;
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
        const bw = Math.max(108, ctx.measureText(text).width + 32);
        const bh = 38;
        const rx = -bw / 2;
        const ry = -bh;

        ctx.fillStyle = 'rgba(53, 30, 16, 0.24)';
        ctx.beginPath();
        ctx.roundRect(rx + 3, ry + 4, bw, bh, 14);
        ctx.fill();

        ctx.fillStyle = bg;
        ctx.strokeStyle = '#351e10';
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

    const triggerOnce = (key: string, fn: () => void) => {
      if (!simRef.current.cueFlags[key]) {
        simRef.current.cueFlags[key] = true;
        fn();
      }
    };

    const render = (now: number) => {
      const dt = Math.min(0.05, Math.max(0.001, (now - prevNow) / 1000));
      prevNow = now;
      const tSec = now / 1000;
      const sim = simRef.current;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.clearRect(0, 0, LOGICAL_W, LOGICAL_H);

      const mangoes = mangoesRef.current;
      const count = mangoes.length;
      const mangoRadius = count <= 16 ? 25 : count <= 30 ? 22 : 19.2;

      const winMango = mangoes.find((m) => m.isWinner) ?? mangoes[0];
      const decoy1 = mangoes.find((m) => m.isDecoy1) ?? winMango;
      const decoy2 = mangoes.find((m) => m.isDecoy2) ?? winMango;

      // Default character & prop states
      let saltProgress = sim.finished ? 1 : 0.85;
      let boyX = 370;
      const boyY = 588;
      let boyPose: BoyPose = 'IDLE';
      let girlX = 695;
      const girlY = 588;
      let girlPose: GirlPose = 'IDLE';

      let showAnhBa = false;
      let anhBaX = 435;
      const anhBaY = 594;
      let anhBaPose: AnhBaPose = 'AIM_POLE';

      let showPole: 'NONE' | 'BOY' | 'ANH_BA' = 'NONE';
      let targetPoleX = sim.poleTipX;
      let targetPoleY = sim.poleTipY;
      let antProgress = 0;

      let boyBubble: { text: string; bg?: string; fg?: string; burst?: boolean } | null = null;
      let girlBubble: { text: string; bg?: string; fg?: string } | null = null;
      let anhBaBubble: { text: string; bg?: string; fg?: string } | null = null;
      let skyBanner: { x: number; y: number; text: string } | null = null;
      let kungFuAfterimages = false;

      if (sim.active && winMango) {
        const p = Math.min(1, (now - sim.startTime) / sim.durationMs);

        // Normalize acts depending on paceMode
        // For TURBO (3s) & FAST (9s), skip long intro gags so action is punchy!
        const skipIntroGags = paceMode === 'TURBO' || paceMode === 'FAST';
        const fullDirectorCut = paceMode === 'EPIC';

        if (!skipIntroGags && p < 0.16) {
          // ACT 1: Pouring Tây Ninh Chili-Shrimp Salt!
          const sub = p / 0.16;
          saltProgress = Math.min(1, sub * 1.25);
          boyX = 455;
          boyPose = 'SQUAT_POUR';
          girlX = 685;
          girlPose = sub > 0.5 ? 'STARRY_CLAP' : 'IDLE';

          triggerOnce('salt_sfx', () => {
            if (!mutedRef.current) playSaltShakeSound();
            setStatusText('🌶️ Đang rắc muối tôm Tây Ninh cay nồng ra giấy...');
          });

          if (sub < 0.58) {
            boyBubble = { text: 'Muối tôm Tây Ninh chính hiệu nè!', bg: '#fef08a' };
          } else {
            girlBubble = { text: 'Giờ chỉ thiếu xoài thôi... 🤤' };
          }
        } else if (
          !skipIntroGags &&
          (fullDirectorCut ? p < 0.45 : sim.gagChoice === 'ANTS' && p < 0.52)
        ) {
          // ACT 2: Fake-out #1 — Yellow Weaver Ants Bite!
          const startP = 0.16;
          const endP = fullDirectorCut ? 0.45 : 0.52;
          const sub = (p - startP) / (endP - startP);
          saltProgress = 1;
          girlX = 695;

          if (sub < 0.58) {
            boyX = 395;
            boyPose = 'AIM_POLE';
            girlPose = 'WATCH_UP';
            showPole = 'BOY';

            if (sub < 0.32) {
              // Sweeping across canopy
              targetPoleX = 240 + Math.sin(tSec * 5.2) * 320 + 320;
              targetPoleY = 140 + Math.cos(tSec * 4) * 55;
              boyBubble = { text: 'Quả nào ngon nhất ta?' };
            } else {
              // Lock onto Decoy 1 + Ants march down!
              targetPoleX = decoy1.homeX;
              targetPoleY = decoy1.homeY + 14;
              antProgress = (sub - 0.32) / 0.26;
              boyBubble = { text: 'Quả này chắc ngọt nè!' };
            }
          } else {
            // BITTEN BY ANTS!
            boyX = 385 + Math.sin(tSec * 14) * 18;
            boyPose = 'ANT_HOP';
            girlPose = 'LAUGH';
            showPole = 'NONE';

            triggerOnce('ant_bite', () => {
              sim.shakeUntil = now + 280;
              if (!mutedRef.current) playAntBiteSound();
              setStatusText('🐜 Á! Kiến vàng trên cành bò xuống cắn trúng Tí rồi!!');
            });

            if (sub < 0.76) {
              boyBubble = { text: 'CHÍCH!! Á kiến cắn!', burst: true };
            } else {
              boyBubble = { text: 'Ui da... ngứa quá!! 😭', bg: '#fee2e2', fg: '#991b1b' };
              girlBubble = { text: 'Hi hi, đáng đời! 🤣' };
            }
          }
        } else if (
          !skipIntroGags &&
          (fullDirectorCut ? p < 0.67 : sim.gagChoice === 'SHORT' && p < 0.52)
        ) {
          // ACT 3: Fake-out #2 — Too Short to Reach!
          const startP = fullDirectorCut ? 0.45 : 0.16;
          const endP = fullDirectorCut ? 0.67 : 0.52;
          const sub = (p - startP) / (endP - startP);
          saltProgress = 1;
          boyX = 415;
          girlX = 700;
          girlPose = 'WATCH_UP';
          showPole = 'BOY';

          if (sub < 0.38) {
            boyPose = 'AIM_POLE';
            targetPoleX = 320 + Math.sin(tSec * 6) * 280 + 260;
            targetPoleY = 155;
            boyBubble = {
              text: fullDirectorCut ? 'Ủa... nãy chọc quả nào ta?' : 'Để nhắm quả cao trên ngọn!',
            };
          } else {
            boyPose = 'TIPTOE_STRAIN';
            // Pole falls 42px short of Decoy 2!
            targetPoleX = decoy2.homeX;
            targetPoleY = decoy2.homeY + 52 + Math.sin(tSec * 28) * 4;
            boyBubble =
              sub < 0.72
                ? { text: 'Ráng... ráng chút nữa...' }
                : { text: 'Không tới!! Lùn quá! 😫', bg: '#fef08a' };
            triggerOnce('short_status', () => {
              setStatusText('📏 Nhón hết cỡ vẫn hụt mất mấy phân!');
            });
          }
        } else {
          // ACT 4: Anh Ba Steps In + Shaolin Kung-Fu Mango + Final Knock & Drop!
          const startP = paceMode === 'TURBO' ? 0 : paceMode === 'FAST' ? 0 : fullDirectorCut ? 0.67 : 0.52;
          const sub = (p - startP) / (1 - startP);
          saltProgress = 1;
          showAnhBa = true;
          boyX = 285;
          girlX = 740;

          if (paceMode === 'TURBO') {
            // Super fast 3s sweep -> knock -> drop!
            if (sub < 0.55) {
              showPole = 'ANH_BA';
              anhBaPose = 'AIM_POLE';
              girlPose = 'WATCH_UP';
              targetPoleX =
                sub < 0.35
                  ? 220 + Math.sin(tSec * 14) * 340 + 380
                  : winMango.homeX;
              targetPoleY = sub < 0.35 ? 140 : winMango.homeY;
              anhBaBubble = { text: 'Anh Ba chọc siêu tốc nè!' };
            } else if (sub < 0.82) {
              showPole = 'NONE';
              anhBaPose = 'STRIKE';
              triggerOnce('knock', () => {
                winMango.detached = true;
                sim.shakeUntil = now + 220;
                if (!mutedRef.current) playMangoKnockSound();
              });
              const fallT = (sub - 0.55) / 0.27;
              winMango.x = winMango.homeX + (520 - winMango.homeX) * fallT;
              winMango.y = winMango.homeY + (578 - winMango.homeY) * (fallT * fallT);
              winMango.rot = fallT * Math.PI * 3;
              skyBanner = { x: winMango.homeX, y: winMango.homeY, text: 'CỌC!' };
            } else {
              winMango.x = 520;
              winMango.y = 578;
              winMango.rot = 0.25;
              boyPose = 'CHEER';
              girlPose = 'CHEER';
              anhBaPose = 'CHEER';
              triggerOnce('thud', () => {
                if (!mutedRef.current) {
                  playMangoThudSound();
                  playRevealSound();
                }
              });
              skyBanner = { x: 520, y: 525, text: 'BỊCH!' };
              anhBaBubble = { text: 'Chấm muối thôi!! 🥭🌶️', bg: '#fef08a' };
            }
          } else {
            // Full Shaolin Kung-Fu Mango Climax (FAST 9s, NORMAL 17s, EPIC 26s)
            if (sub < 0.16) {
              showPole = 'ANH_BA';
              anhBaPose = 'ENTER';
              girlPose = 'WATCH_UP';
              targetPoleX = 280 + Math.sin(tSec * 7) * 260 + 280;
              targetPoleY = 145;
              anhBaBubble = { text: 'Đưa cây sào đây, để Anh Ba!' };
              triggerOnce('anh_ba_in', () => {
                setStatusText('💪 Anh Ba cao kều trong xóm đã ra tay!');
              });
            } else if (sub < 0.42) {
              // Shaolin Dodge #1: LĂNG BA VI BỘ!
              showPole = 'ANH_BA';
              anhBaPose = 'STRIKE';
              girlPose = 'SHOCK';
              kungFuAfterimages = true;
              targetPoleX = winMango.homeX;
              targetPoleY = winMango.homeY;
              winMango.x = winMango.homeX - 58;
              winMango.y = winMango.homeY - 16;

              triggerOnce('kungfu_1', () => {
                if (!mutedRef.current) playKungFuWhoosh();
                setStatusText('🥋 Ơ kìa!! Quả xoài biết võ Lăng Ba Vi Bộ né đòn!!');
              });
              skyBanner = { x: winMango.homeX, y: winMango.homeY - 26, text: 'LĂNG BA VI BỘ!' };
              anhBaBubble = { text: 'Ơ kìa, xoài có võ!! 😳' };
            } else if (sub < 0.64) {
              // Shaolin Dodge #2: HÂY-A!
              showPole = 'ANH_BA';
              anhBaPose = 'STRIKE';
              girlPose = 'SHOCK';
              kungFuAfterimages = true;
              targetPoleX = winMango.homeX - 45;
              targetPoleY = winMango.homeY - 10;
              winMango.x = winMango.homeX + 56;
              winMango.y = winMango.homeY - 12;

              triggerOnce('kungfu_2', () => {
                if (!mutedRef.current) playKungFuWhoosh();
              });
              skyBanner = { x: winMango.homeX + 20, y: winMango.homeY - 26, text: 'HÂY-A!!' };
              girlBubble = { text: 'Xoài học võ Thiếu Lâm hả?! 🤯' };
            } else if (sub < 0.84) {
              // Final Decisive Strike -> CỌC! -> Falling spin!
              const fallSub = (sub - 0.64) / 0.2;
              anhBaPose = 'STRIKE';
              showPole = fallSub < 0.28 ? 'ANH_BA' : 'NONE';
              targetPoleX = winMango.homeX;
              targetPoleY = winMango.homeY;

              const allWinMangoes = mangoes.filter((m) => m.isWinner);
              triggerOnce('knock', () => {
                allWinMangoes.forEach((wm) => {
                  wm.detached = true;
                });
                sim.shakeUntil = now + 260;
                if (!mutedRef.current) playMangoKnockSound();
                setStatusText(
                  allWinMangoes.length > 1
                    ? `🎯 CỌC!! Trúng phóc ${allWinMangoes.length} quả xoài rụng xuống!!`
                    : '🎯 CỌC!! Trúng phóc cuống xoài rồi!!',
                );
              });

              const f = Math.max(0, (fallSub - 0.15) / 0.85);
              allWinMangoes.forEach((wm, idx) => {
                const landX = 480 + (allWinMangoes.length === 1 ? 38 : (idx - (allWinMangoes.length - 1) / 2) * 54);
                wm.x = wm.homeX + (landX - wm.homeX) * f;
                wm.y = wm.homeY + (578 - wm.homeY) * (f * f);
                wm.rot = f * Math.PI * 4;
              });

              anhBaBubble = { text: 'Còn né nữa hả?!' };
              if (fallSub < 0.45) {
                skyBanner = { x: winMango.homeX, y: winMango.homeY, text: 'CỌC!!' };
              }
            } else {
              // Landed BỊCH! beside chili-salt paper!
              const allWinMangoes = mangoes.filter((m) => m.isWinner);
              allWinMangoes.forEach((wm, idx) => {
                const landX = 480 + (allWinMangoes.length === 1 ? 38 : (idx - (allWinMangoes.length - 1) / 2) * 54);
                wm.x = landX;
                wm.y = 578;
                wm.rot = 0.22;
              });
              boyX = 425;
              girlX = 690;
              anhBaX = 325;
              boyPose = 'CHEER';
              girlPose = 'CHEER';
              anhBaPose = 'CHEER';
              showPole = 'NONE';

              triggerOnce('thud', () => {
                sim.shakeUntil = now + 200;
                if (!mutedRef.current) {
                  playMangoThudSound();
                  playRevealSound();
                }
                if (sim.winner) {
                  setStatusText(`🥭 Xoài rụng rồi: ${sim.winner.name} — Chấm muối thôi!!`);
                }
              });

              skyBanner = { x: 518, y: 525, text: 'BỊCH!!' };
              anhBaBubble = { text: 'Chấm muối thôi mấy đứa ơi!! 🥭🌶️', bg: '#fef08a' };
            }
          }
        }

        // Smooth pole tip interpolation
        sim.poleTipX += (targetPoleX - sim.poleTipX) * Math.min(1, dt * 12);
        sim.poleTipY += (targetPoleY - sim.poleTipY) * Math.min(1, dt * 12);

        if (p >= 1 && !sim.finished) {
          sim.finished = true;
          sim.active = false;
          stopBackgroundMusic();
          setRunning(false);
          if (sim.winners.length > 0) {
            const pickedList = sim.winners;
            finishTimerRef.current = window.setTimeout(() => {
              if (onPickManyRef.current) {
                onPickManyRef.current(pickedList, 'Hái Xoài Chấm Muối Tôm');
              } else {
                onPickRef.current(pickedList[0]);
              }
            }, 350);
          }
        }
      } else if (sim.finished && winMango) {
        winMango.x = 518;
        winMango.y = 578;
        boyPose = 'CHEER';
        girlPose = 'CHEER';
        showAnhBa = true;
        anhBaX = 300;
        anhBaPose = 'CHEER';
      }

      // Optional Camera Shake
      let sx = 0;
      let sy = 0;
      if (now < sim.shakeUntil) {
        sx = (Math.random() - 0.5) * 12;
        sy = (Math.random() - 0.5) * 12;
      }

      ctx.save();
      ctx.translate(sx, sy);

      const sprites = spritesRef.current;
      if (!sprites) {
        ctx.fillStyle = '#14532d';
        ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
        ctx.fillStyle = '#fef08a';
        ctx.font = '800 20px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('🎨 Đang tải vườn xoài Chibi...', LOGICAL_W / 2, LOGICAL_H / 2);
        ctx.restore();
        rafRef.current = requestAnimationFrame(render);
        return;
      }

      // 1. CHIBI_CEL Illustrated Rural Mango Courtyard Backdrop
      ctx.drawImage(sprites.bg, 0, 0, LOGICAL_W, LOGICAL_H);

      // 2. White Paper Sheet & Tây Ninh Chili-Shrimp Salt Mound
      drawChiliSaltSheet(ctx, 578, 582, saltProgress);

      // 3. Draw Canopy Mangoes (non-detached first)
      mangoes.forEach((m) => {
        if (m.detached) return;
        let mood: MangoMood = m.teaseVariant ? 'TEASE' : 'CHILL';

        if (sim.active) {
          if (m.isWinner && kungFuAfterimages) {
            mood = 'KUNGFU';
            // Draw golden kung-fu motion afterimages!
            ctx.save();
            ctx.globalAlpha = 0.32;
            drawChibiMango(ctx, m.homeX, m.homeY, mangoRadius, 'KUNGFU', '', tSec, m.phase, 0, false);
            ctx.globalAlpha = 0.52;
            drawChibiMango(
              ctx,
              (m.x + m.homeX) / 2,
              (m.y + m.homeY) / 2,
              mangoRadius,
              'KUNGFU',
              '',
              tSec,
              m.phase,
              0,
              false,
            );
            ctx.restore();
          } else if (showPole !== 'NONE') {
            const dist = Math.hypot(m.x - sim.poleTipX, m.y - sim.poleTipY);
            if (dist < 78) mood = 'PANIC';
            else if (dist < 210) mood = 'NERVOUS';
          }
        }

        drawChibiMango(
          ctx,
          m.x,
          m.y,
          mangoRadius,
          mood,
          shortDisplayName(m.student.name),
          tSec,
          m.phase,
          m.rot,
          true,
        );
      });

      // 4. Draw CHIBI_CEL Rural Village Characters with Squash & Stretch
      const drawChibiSprite = (
        img: HTMLImageElement,
        cx: number,
        cy: number,
        targetH: number,
        bounce: number,
        stretch: number,
        tilt: number,
        shadowW = 34,
      ) => {
        const w = targetH * (img.naturalWidth / img.naturalHeight);
        const sScale = Math.max(0.55, 1 - bounce * 0.013);
        ctx.save();
        ctx.fillStyle = 'rgba(24, 15, 12, 0.28)';
        ctx.beginPath();
        ctx.ellipse(cx, cy - 3, shadowW * sScale, 8.5 * sScale, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        ctx.save();
        ctx.translate(cx, cy - bounce);
        ctx.rotate(tilt);
        ctx.scale(1 - stretch * 0.7, 1 + stretch);
        ctx.drawImage(img, -w / 2, -targetH, w, targetH);
        ctx.restore();
      };

      const boyBounce =
        boyPose === 'ANT_HOP'
          ? Math.abs(Math.sin(tSec * 18)) * 28
          : boyPose === 'CHEER'
            ? Math.abs(Math.sin(tSec * 12)) * 18
            : boyPose === 'TIPTOE_STRAIN'
              ? 14 + Math.sin(tSec * 28) * 2
              : boyPose === 'SQUAT_POUR'
                ? -10
                : Math.sin(tSec * 3.5) * 2;
      const boyStretch =
        boyPose === 'SQUAT_POUR'
          ? -0.08
          : boyPose === 'TIPTOE_STRAIN'
            ? 0.1
            : Math.sin(tSec * 6) * 0.025;
      const boyTilt = boyPose === 'ANT_HOP' ? Math.sin(tSec * 22) * 0.12 : 0;
      drawChibiSprite(sprites.ti, boyX, boyY, 154, boyBounce, boyStretch, boyTilt, 32);

      if (boyPose === 'ANT_HOP') {
        ctx.save();
        ctx.fillStyle = 'rgba(239, 68, 68, 0.72)';
        ctx.beginPath();
        ctx.arc(boyX - 24, boyY - 46 - boyBounce, 12 + Math.sin(tSec * 28) * 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      const boyHand = { handX: boyX + 36, handY: boyY - 96 - boyBounce };

      const girlBounce =
        girlPose === 'CHEER'
          ? Math.abs(Math.sin(tSec * 12 + 0.8)) * 16
          : girlPose === 'LAUGH'
            ? Math.abs(Math.sin(tSec * 16)) * 6
            : Math.sin(tSec * 3.2 + 1) * 2;
      const girlTilt = girlPose === 'LAUGH' ? Math.sin(tSec * 16) * 0.08 : 0;
      drawChibiSprite(sprites.na, girlX, girlY, 150, girlBounce, Math.sin(tSec * 5) * 0.02, girlTilt, 30);

      let anhBaHand = { handX: anhBaX + 54, handY: anhBaY - 134 };
      if (showAnhBa) {
        const abBounce =
          anhBaPose === 'CHEER'
            ? Math.abs(Math.sin(tSec * 12 + 0.3)) * 18
            : anhBaPose === 'STRIKE'
              ? 14
              : Math.sin(tSec * 4) * 2.5;
        const abTilt = anhBaPose === 'STRIKE' ? 0.07 : 0;
        drawChibiSprite(sprites.anhBa, anhBaX, anhBaY, 198, abBounce, 0.03, abTilt, 38);
        anhBaHand = { handX: anhBaX + 54, handY: anhBaY - 134 - abBounce };
      }

      // 5. Draw Long Segmented Bamboo Pole on top of character hands
      if (showPole === 'BOY') {
        drawBambooPole(ctx, boyHand.handX, boyHand.handY, sim.poleTipX, sim.poleTipY, antProgress);
      } else if (showPole === 'ANH_BA') {
        drawBambooPole(ctx, anhBaHand.handX, anhBaHand.handY, sim.poleTipX, sim.poleTipY, 0);
      }

      // 6. Draw Detached Falling / Landed Winner Mango in front!
      mangoes.forEach((m) => {
        if (!m.detached) return;
        drawChibiMango(
          ctx,
          m.x,
          m.y,
          mangoRadius * 1.25,
          'PANIC',
          shortDisplayName(m.student.name),
          tSec,
          m.phase,
          m.rot,
          false,
        );
      });

      // 7. Update Floating FX
      fxRef.current = fxRef.current.filter((fx) => {
        fx.life += 1;
        fx.x += fx.vx * dt;
        fx.y += fx.vy * dt;
        return fx.life < fx.maxLife;
      });

      // 8. Comic Sound-Effect Banner ("LĂNG BA VI BỘ!", "HÂY-A!", "CỌC!", "BỊCH!")
      if (skyBanner) {
        drawSpeech(skyBanner.x, skyBanner.y, skyBanner.text, { burst: true, scale: 1.05 });
      }

      // 9. Character Speech Bubbles
      if (boyBubble) {
        drawSpeech(boyX, boyY - 148, boyBubble.text, boyBubble);
      }
      if (girlBubble) {
        drawSpeech(girlX, girlY - 144, girlBubble.text, girlBubble);
      }
      if (anhBaBubble && showAnhBa) {
        drawSpeech(anhBaX + 15, anhBaY - 188, anhBaBubble.text, anhBaBubble);
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
        startMangoFolkMusic();
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
    const chosenPool = [
      ...others.slice(0, Math.max(0, MAX_CANOPY_MANGOES - chosenWinners.length)),
      ...chosenWinners,
    ];
    // Shuffle canopy placement
    for (let i = chosenPool.length - 1; i > 0; i--) {
      const j = cryptoRandomInt(i + 1);
      [chosenPool[i], chosenPool[j]] = [chosenPool[j], chosenPool[i]];
    }

    const built = buildCanopyPositions(chosenPool, winner.id).map((m) => ({
      ...m,
      isWinner: chosenIds.has(m.student.id),
    }));
    const nonWinners = built.filter((m) => !m.isWinner);
    if (nonWinners.length >= 1) {
      nonWinners[cryptoRandomInt(nonWinners.length)].isDecoy1 = true;
    }
    const remDecoys = nonWinners.filter((m) => !m.isDecoy1);
    if (remDecoys.length >= 1) {
      // Prefer a high-up mango in top rows for "Too Short to Reach" gag!
      const highOnes = remDecoys.filter((m) => m.homeY < 130);
      const pickPool = highOnes.length > 0 ? highOnes : remDecoys;
      pickPool[cryptoRandomInt(pickPool.length)].isDecoy2 = true;
    }

    mangoesRef.current = built;
    simRef.current = {
      active: true,
      startTime: performance.now(),
      durationMs: TOTAL_MS_BY_PACE[paceMode],
      gagChoice: cryptoRandomInt(2) === 0 ? 'ANTS' : 'SHORT',
      winner,
      winners: chosenWinners,
      finished: false,
      cueFlags: {},
      poleTipX: 480,
      poleTipY: 220,
      shakeUntil: 0,
    };

    setRunning(true);
    setStatusText('🌶️ Bắt đầu trải giấy rắc muối tôm Tây Ninh...');
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-3 sm:p-4 gap-3.5 select-none">
      <div className="w-full max-w-6xl rounded-3xl overflow-hidden border-2 border-amber-300/45 shadow-[0_20px_60px_rgba(0,0,0,0.45)] bg-amber-950 relative">
        <canvas
          ref={canvasRef}
          className="w-full h-auto block aspect-[2/1]"
        />
        <div className="absolute top-3 left-3 px-3.5 py-1.5 rounded-full bg-amber-950/80 border border-amber-300/30 text-amber-50 text-xs sm:text-sm font-bold backdrop-blur-md shadow-lg">
          {statusText}
        </div>
      </div>

      <button
        type="button"
        disabled={running || !assetsReady || students.length === 0}
        onClick={handleStart}
        className="px-8 py-3.5 rounded-2xl bg-gradient-to-r from-lime-400 via-amber-400 to-orange-500 hover:brightness-110 disabled:opacity-50 text-slate-950 font-black text-base sm:text-lg shadow-xl shadow-amber-500/30 transition active:scale-95"
      >
        {!assetsReady
          ? '🎨 Đang tải vườn xoài Chibi...'
          : running
            ? '🥭 Đang chọc xoài trên cây...'
            : students.length === 0
              ? 'Danh sách học sinh trống'
              : '🥭 BẮT ĐẦU CHỌC XOÀI CHẤM MUỐI!'}
      </button>
    </div>
  );
};

export default MangoHarvestGame;
