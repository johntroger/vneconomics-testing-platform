import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  BookOpen,
  Camera,
  Eye,
  FlipHorizontal2,
  RefreshCw,
  ScanFace,
  Sparkles,
  SwitchCamera,
  Users,
  VideoOff,
} from 'lucide-react';
import { FaceDetector, FilesetResolver } from '@mediapipe/tasks-vision';
import { ConfettiBurst } from '../../components/game/ConfettiBurst';
import { useExamPlatform } from '../../context/ExamContext';
import { ADMIN_TOKEN_KEY } from '../../services/apiClient';
import type { Question } from '../../types/exam';
import {
  evaluateFormula,
  generateSeedVarsForQuestion,
  interpolateText,
} from '../../utils/dynamicQuestionEngine';
import {
  playCatchSound,
  playWheelTick,
  playWinnerFanfare,
  unlockGameAudio,
} from '../../utils/gameAudio';
import { cryptoRandomInt } from '../rosterStorage';
import { useMinigameStageSettings, type PaceMode } from '../stageContext';
import type { MinigameProps } from '../types';

type LensMode = 'SINGLE' | 'PAIR';

interface TrackedFace {
  id: number;
  x: number; // normalized [0..1] in display coordinates (after optional mirror)
  y: number;
  w: number;
  h: number;
  lastSeen: number;
}

interface CapturedWinner {
  portraitDataUrl: string;
  label: string;
}

const DEFAULT_SEC_BY_PACE: Record<PaceMode, number> = {
  TURBO: 3,
  FAST: 9,
  NORMAL: 12,
  EPIC: 20,
};

export const LuckyLensGame: React.FC<MinigameProps> = ({ muted }) => {
  const { paceMode } = useMinigameStageSettings();
  const { courses, questions } = useExamPlatform();
  const isInstructor =
    typeof window !== 'undefined' && Boolean(localStorage.getItem(ADMIN_TOKEN_KEY));

  // Mode & Config
  const [mode, setMode] = useState<LensMode>('SINGLE');
  const [scanSeconds, setScanSeconds] = useState<number>(DEFAULT_SEC_BY_PACE[paceMode]);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [mirrored, setMirrored] = useState<boolean>(true);
  const [videoAspect, setVideoAspect] = useState<number>(16 / 9);
  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const [cameraLoading, setCameraLoading] = useState<boolean>(false);
  const [aiReady, setAiReady] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');

  // Devices
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');

  // Live scanning state
  const [faceCount, setFaceCount] = useState<number>(0);
  const [scanning, setScanning] = useState<boolean>(false);
  const [countdownSec, setCountdownSec] = useState<number>(0);
  const [warningTip, setWarningTip] = useState<string>('');

  // Result modal state
  const [capturedWinners, setCapturedWinners] = useState<CapturedWinner[] | null>(null);
  const [confetti, setConfetti] = useState<boolean>(false);
  const [selectedCourseId, setSelectedCourseId] = useState<string>('');
  const [pickedQuestion, setPickedQuestion] = useState<{
    q: Question;
    renderedContent: string;
    renderedOptions: Array<{ id: string; text: string; isCorrect: boolean }>;
    renderedExpected: string;
  } | null>(null);
  const [revealAnswer, setRevealAnswer] = useState<boolean>(false);

  // Refs for real-time video + AI loop
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const tileCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<FaceDetector | null>(null);
  const rafRef = useRef<number | null>(null);
  const confettiTimerRef = useRef<number | null>(null);
  const lastDetectMsRef = useRef<number>(0);
  const lastMediaPipeTsRef = useRef<number>(0);
  const lastVideoTimeRef = useRef<number>(-1);
  const lastAspectRef = useRef<number>(16 / 9);
  const lastFaceCountRef = useRef<number>(0);
  const lastCountdownRef = useRef<number>(-1);
  const nextFaceIdRef = useRef<number>(1);
  const trackedFacesRef = useRef<TrackedFace[]>([]);

  // Refs accessed inside animation loop
  const mirroredRef = useRef(mirrored);
  mirroredRef.current = mirrored;
  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  const modeRef = useRef(mode);
  modeRef.current = mode;

  const scanStateRef = useRef<{
    active: boolean;
    startMs: number;
    durationMs: number;
    lastHopMs: number;
    cursor1: number;
    cursor2: number;
    highlightIndices: number[];
    glide1: { x: number; y: number; w: number; h: number } | null;
    glide2: { x: number; y: number; w: number; h: number } | null;
  }>({
    active: false,
    startMs: 0,
    durationMs: 10000,
    lastHopMs: 0,
    cursor1: 0,
    cursor2: 0,
    highlightIndices: [],
    glide1: null,
    glide2: null,
  });

  // Sync scanSeconds when top-bar paceMode changes
  useEffect(() => {
    setScanSeconds(DEFAULT_SEC_BY_PACE[paceMode]);
  }, [paceMode]);

  const stopCameraTracks = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    trackedFacesRef.current = [];
    lastFaceCountRef.current = 0;
    lastVideoTimeRef.current = -1;
    setFaceCount(0);
    setCameraActive(false);
    setScanning(false);
    scanStateRef.current.active = false;
  }, []);

  // Full cleanup on unmount (turns off webcam LED & frees WASM detector)
  useEffect(() => {
    return () => {
      stopCameraTracks();
      if (confettiTimerRef.current !== null) window.clearTimeout(confettiTimerRef.current);
      if (detectorRef.current) {
        try {
          detectorRef.current.close();
        } catch {
          // Ignore close error
        }
        detectorRef.current = null;
      }
    };
  }, [stopCameraTracks]);

  const initFaceDetector = useCallback(async (): Promise<FaceDetector> => {
    if (detectorRef.current) return detectorRef.current;
    const vision = await FilesetResolver.forVisionTasks('/mediapipe/wasm');
    try {
      const gpuDetector = await FaceDetector.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: '/mediapipe/blaze_face_short_range.tflite',
          delegate: 'GPU',
        },
        runningMode: 'VIDEO',
        minDetectionConfidence: 0.3,
        minSuppressionThreshold: 0.3,
      });
      detectorRef.current = gpuDetector;
      setAiReady(true);
      return gpuDetector;
    } catch {
      const cpuDetector = await FaceDetector.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: '/mediapipe/blaze_face_short_range.tflite',
          delegate: 'CPU',
        },
        runningMode: 'VIDEO',
        minDetectionConfidence: 0.3,
        minSuppressionThreshold: 0.3,
      });
      detectorRef.current = cpuDetector;
      setAiReady(true);
      return cpuDetector;
    }
  }, []);

  const cropPortraitFromVideo = useCallback(
    (face: TrackedFace): string => {
      const video = videoRef.current;
      if (!video || !video.videoWidth || !video.videoHeight) return '';

      const vw = video.videoWidth;
      const vh = video.videoHeight;

      // Expand crop box ~42% around detected face for a flattering portrait (hair + shoulders)
      const padW = face.w * 0.45;
      const padH = face.h * 0.5;
      const dispX = Math.max(0, face.x - padW * 0.5);
      const dispY = Math.max(0, face.y - padH * 0.55);
      const dispW = Math.min(1 - dispX, face.w + padW);
      const dispH = Math.min(1 - dispY, face.h + padH);

      // Convert display normalized coords back to raw video pixels
      const rawXNorm = mirroredRef.current ? Math.max(0, 1 - (dispX + dispW)) : dispX;
      const sx = rawXNorm * vw;
      const sy = dispY * vh;
      const sw = Math.max(40, dispW * vw);
      const sh = Math.max(40, dispH * vh);

      const outSize = 340;
      const outH = Math.round(outSize * (sh / sw));
      const tmp = document.createElement('canvas');
      tmp.width = outSize;
      tmp.height = Math.max(220, Math.min(440, outH));
      const tctx = tmp.getContext('2d');
      if (!tctx) return '';

      if (mirroredRef.current) {
        tctx.translate(tmp.width, 0);
        tctx.scale(-1, 1);
      }
      tctx.drawImage(video, sx, sy, sw, sh, 0, 0, tmp.width, tmp.height);
      return tmp.toDataURL('image/jpeg', 0.9);
    },
    [],
  );

  const finalizeSelection = useCallback(
    (indices: number[]) => {
      const faces = trackedFacesRef.current;
      if (faces.length === 0) {
        setScanning(false);
        scanStateRef.current.active = false;
        setWarningTip('Không phát hiện khuôn mặt nào lúc chốt — hãy thử quét lại!');
        return;
      }

      const needed = modeRef.current === 'PAIR' ? 2 : 1;
      const validIndices = indices.filter((i) => i >= 0 && i < faces.length);
      const chosenSet = new Set<number>(validIndices);
      while (chosenSet.size < Math.min(needed, faces.length)) {
        chosenSet.add(cryptoRandomInt(faces.length));
      }

      const winners: CapturedWinner[] = Array.from(chosenSet)
        .slice(0, needed)
        .map((idx, pos) => ({
          portraitDataUrl: cropPortraitFromVideo(faces[idx]),
          label: needed === 2 ? `Bạn số ${pos + 1}` : 'Bạn được chọn',
        }));

      scanStateRef.current.active = false;
      setScanning(false);
      setCapturedWinners(winners);
      setPickedQuestion(null);
      setRevealAnswer(false);
      setConfetti(true);
      if (!mutedRef.current) {
        playCatchSound();
        playWinnerFanfare();
      }
      if (confettiTimerRef.current !== null) window.clearTimeout(confettiTimerRef.current);
      confettiTimerRef.current = window.setTimeout(() => setConfetti(false), 3800);
    },
    [cropPortraitFromVideo],
  );

  const startDetectionLoop = useCallback(() => {
    const drawCornerBox = (
      ctx: CanvasRenderingContext2D,
      x: number,
      y: number,
      w: number,
      h: number,
      color: string,
      lineWidth: number,
      glow: boolean,
      badge?: string,
    ) => {
      const corner = Math.max(12, Math.min(28, Math.min(w, h) * 0.28));
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
      ctx.lineCap = 'round';
      if (glow) {
        ctx.shadowColor = color;
        ctx.shadowBlur = 18;
      }

      // 4 sleek viewfinder corners
      ctx.beginPath();
      // Top-left
      ctx.moveTo(x, y + corner);
      ctx.lineTo(x, y);
      ctx.lineTo(x + corner, y);
      // Top-right
      ctx.moveTo(x + w - corner, y);
      ctx.lineTo(x + w, y);
      ctx.lineTo(x + w, y + corner);
      // Bottom-right
      ctx.moveTo(x + w, y + h - corner);
      ctx.lineTo(x + w, y + h);
      ctx.lineTo(x + w - corner, y + h);
      // Bottom-left
      ctx.moveTo(x + corner, y + h);
      ctx.lineTo(x, y + h);
      ctx.lineTo(x, y + h - corner);
      ctx.stroke();

      if (glow) {
        ctx.fillStyle = `${color}24`;
        ctx.fillRect(x, y, w, h);
      }

      if (badge) {
        ctx.shadowBlur = 0;
        ctx.font = '900 13px system-ui, -apple-system, sans-serif';
        const tw = ctx.measureText(badge).width;
        const pw = tw + 18;
        const ph = 24;
        const bx = x + w / 2 - pw / 2;
        const by = Math.max(8, y - ph - 8);
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.roundRect(bx, by, pw, ph, 8);
        ctx.fill();
        ctx.fillStyle = '#0f172a';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(badge, x + w / 2, by + ph / 2 + 0.5);
      }
      ctx.restore();
    };

    const tick = (now: number) => {
      const video = videoRef.current;
      const canvas = overlayCanvasRef.current;
      const detector = detectorRef.current;

      if (video && canvas && video.readyState >= 2 && video.videoWidth > 0) {
        const vw = video.videoWidth;
        const vh = video.videoHeight;
        if (canvas.width !== vw || canvas.height !== vh) {
          canvas.width = vw;
          canvas.height = vh;
        }
        const realAspect = vw / vh;
        if (Math.abs(realAspect - lastAspectRef.current) > 0.02) {
          lastAspectRef.current = realAspect;
          setVideoAspect(realAspect);
        }
        const ctx = canvas.getContext('2d');
        if (ctx) {
          // 1. Multi-Scale Tiled MediaPipe FaceDetector (~16fps): Full frame + 3 zoomed 2x classroom tiles
          //    This overcomes BlazeFace short-range 128x128 downscaling so back-row/distant faces are caught!
          if (
            detector &&
            now - lastDetectMsRef.current >= 60 &&
            video.currentTime !== lastVideoTimeRef.current
          ) {
            lastDetectMsRef.current = now;
            lastVideoTimeRef.current = video.currentTime;
            try {
              type RawDet = { x: number; y: number; w: number; h: number; score: number };
              const collected: RawDet[] = [];

              const collectFromDetections = (
                detections: ReturnType<FaceDetector['detectForVideo']>['detections'],
                srcW: number,
                srcH: number,
                roiX: number,
                roiY: number,
                roiW: number,
                roiH: number,
                minScore: number,
                maxRawW = 0.65,
              ) => {
                for (const d of detections ?? []) {
                  const score = d.categories?.[0]?.score ?? 1;
                  const b = d.boundingBox;
                  if (!b || score < minScore) continue;
                  const ratio = b.width / Math.max(1, b.height);
                  if (ratio < 0.58 || ratio > 1.75) continue;

                  // Map back to full-frame normalized coordinates
                  const rawNx = roiX + (b.originX / srcW) * roiW;
                  const rawNy = roiY + (b.originY / srcH) * roiH;
                  const rawNw = (b.width / srcW) * roiW;
                  const rawNh = (b.height / srcH) * roiH;
                  if (rawNw < 0.025 || rawNh < 0.035 || rawNw > maxRawW) continue;

                  // Expand tight BlazeFace eyes-to-chin box to frame full head (forehead + chin)
                  const padX = rawNw * 0.08;
                  const padTop = rawNh * 0.22;
                  const padBot = rawNh * 0.08;

                  const x1 = Math.max(0, rawNx - padX);
                  const y1 = Math.max(0, rawNy - padTop);
                  const x2 = Math.min(1, rawNx + rawNw + padX);
                  const y2 = Math.min(1, rawNy + rawNh + padBot);
                  const nw = Math.max(0.02, x2 - x1);
                  const nh = Math.max(0.02, y2 - y1);

                  collected.push({
                    x: mirroredRef.current ? Math.max(0, 1 - (x1 + nw)) : x1,
                    y: y1,
                    w: nw,
                    h: nh,
                    score,
                  });
                }
              };

              // Pass A: Full frame (catches close & mid-range faces)
              const tsFull = Math.max(Math.floor(now), lastMediaPipeTsRef.current + 1);
              lastMediaPipeTsRef.current = tsFull;
              const fullRes = detector.detectForVideo(video, tsFull);
              collectFromDetections(fullRes.detections, vw, vh, 0, 0, 1, 1, 0.45, 0.65);

              // Pass B: 3 overlapping ~2.5x zoomed tiles across classroom depth band (ONLY keeps small/distant faces!)
              if (!tileCanvasRef.current) {
                tileCanvasRef.current = document.createElement('canvas');
                tileCanvasRef.current.width = 320;
                tileCanvasRef.current.height = 240;
              }
              const tCanvas = tileCanvasRef.current;
              const tCtx = tCanvas.getContext('2d');
              if (tCtx) {
                const tiles = [
                  { rx: 0.02, ry: 0.16, rw: 0.4, rh: 0.6 },
                  { rx: 0.3, ry: 0.16, rw: 0.4, rh: 0.6 },
                  { rx: 0.58, ry: 0.16, rw: 0.4, rh: 0.6 },
                ];
                for (const tile of tiles) {
                  tCtx.drawImage(
                    video,
                    tile.rx * vw,
                    tile.ry * vh,
                    tile.rw * vw,
                    tile.rh * vh,
                    0,
                    0,
                    tCanvas.width,
                    tCanvas.height,
                  );
                  const tsTile = lastMediaPipeTsRef.current + 1;
                  lastMediaPipeTsRef.current = tsTile;
                  const tileRes = detector.detectForVideo(tCanvas, tsTile);
                  collectFromDetections(
                    tileRes.detections,
                    tCanvas.width,
                    tCanvas.height,
                    tile.rx,
                    tile.ry,
                    tile.rw,
                    tile.rh,
                    0.38,
                    0.15,
                  );
                }
              }

              // IoU Non-Maximum Suppression to merge overlapping full-frame + tile hits cleanly
              collected.sort((a, b) => b.score - a.score);
              const rawBoxes: Array<{ x: number; y: number; w: number; h: number }> = [];
              for (const cand of collected) {
                let duplicate = false;
                for (const kept of rawBoxes) {
                  const ix1 = Math.max(cand.x, kept.x);
                  const iy1 = Math.max(cand.y, kept.y);
                  const ix2 = Math.min(cand.x + cand.w, kept.x + kept.w);
                  const iy2 = Math.min(cand.y + cand.h, kept.y + kept.h);
                  const inter = Math.max(0, ix2 - ix1) * Math.max(0, iy2 - iy1);
                  const union = cand.w * cand.h + kept.w * kept.h - inter;
                  const iou = union > 0 ? inter / union : 0;
                  const dist = Math.hypot(
                    cand.x + cand.w / 2 - (kept.x + kept.w / 2),
                    cand.y + cand.h / 2 - (kept.y + kept.h / 2),
                  );
                  if (iou > 0.32 || dist < Math.min(cand.w, kept.w) * 0.55) {
                    duplicate = true;
                    break;
                  }
                }
                if (!duplicate) {
                  rawBoxes.push({ x: cand.x, y: cand.y, w: cand.w, h: cand.h });
                }
              }

              // Responsive proximity smoothing so boxes stay glued when panning camera
              const prev = trackedFacesRef.current;
              const usedPrev = new Set<number>();
              const updated: TrackedFace[] = [];

              for (const rb of rawBoxes) {
                const rcx = rb.x + rb.w / 2;
                const rcy = rb.y + rb.h / 2;
                let bestIdx = -1;
                let bestDist = 0.16;
                for (let i = 0; i < prev.length; i++) {
                  if (usedPrev.has(i)) continue;
                  const pcx = prev[i].x + prev[i].w / 2;
                  const pcy = prev[i].y + prev[i].h / 2;
                  const dist = Math.hypot(rcx - pcx, rcy - pcy);
                  if (dist < bestDist) {
                    bestDist = dist;
                    bestIdx = i;
                  }
                }
                if (bestIdx >= 0) {
                  usedPrev.add(bestIdx);
                  const old = prev[bestIdx];
                  const alpha = 0.72;
                  updated.push({
                    id: old.id,
                    x: old.x + (rb.x - old.x) * alpha,
                    y: old.y + (rb.y - old.y) * alpha,
                    w: old.w + (rb.w - old.w) * alpha,
                    h: old.h + (rb.h - old.h) * alpha,
                    lastSeen: now,
                  });
                } else {
                  updated.push({
                    id: nextFaceIdRef.current++,
                    x: rb.x,
                    y: rb.y,
                    w: rb.w,
                    h: rb.h,
                    lastSeen: now,
                  });
                }
              }

              // Keep briefly occluded faces for 260ms to prevent flicker
              for (let i = 0; i < prev.length; i++) {
                if (!usedPrev.has(i) && now - prev[i].lastSeen < 260) {
                  updated.push(prev[i]);
                }
              }

              // Sort left-to-right so scanning sweeps cleanly across the classroom
              updated.sort((a, b) => a.x - b.x);
              trackedFacesRef.current = updated;
              if (updated.length !== lastFaceCountRef.current) {
                lastFaceCountRef.current = updated.length;
                setFaceCount(updated.length);
              }
            } catch {
              // Ignore transient frame errors
            }
          }

          // 2. Update round-robin looping scanner logic when scanning
          const scan = scanStateRef.current;
          const faces = trackedFacesRef.current;

          if (scan.active) {
            const elapsed = now - scan.startMs;
            const remaining = Math.max(0, (scan.durationMs - elapsed) / 1000);
            const roundedSec = Math.ceil(remaining * 10) / 10;
            if (roundedSec !== lastCountdownRef.current) {
              lastCountdownRef.current = roundedSec;
              setCountdownSec(roundedSec);
            }

            if (elapsed >= scan.durationMs) {
              finalizeSelection(scan.highlightIndices);
            } else if (faces.length > 0) {
              // Progressively slow down round-robin sweep in final 35%
              const progress = elapsed / scan.durationMs;
              const hopIntervalMs = 90 + Math.pow(progress, 2.3) * 420;
              if (now - scan.lastHopMs >= hopIntervalMs) {
                scan.lastHopMs = now;
                if (modeRef.current === 'PAIR' && faces.length >= 2) {
                  scan.cursor1 = (scan.cursor1 + 1) % faces.length;
                  scan.cursor2 = (scan.cursor2 - 1 + faces.length) % faces.length;
                  if (scan.cursor2 === scan.cursor1) {
                    scan.cursor2 = (scan.cursor1 + Math.max(1, Math.floor(faces.length / 2))) % faces.length;
                  }
                  scan.highlightIndices = [scan.cursor1, scan.cursor2];
                } else {
                  scan.cursor1 = (scan.cursor1 + 1) % faces.length;
                  scan.highlightIndices = [scan.cursor1];
                }
                if (!mutedRef.current) playWheelTick();
              }
            }
          }

          // 3. Render overlay boxes at 60fps
          ctx.clearRect(0, 0, vw, vh);

          // Radar scan beam & sweeping reticle during active scan
          if (scan.active) {
            const beamY = ((now * 0.38) % (vh + 120)) - 60;
            const grad = ctx.createLinearGradient(0, beamY - 35, 0, beamY + 35);
            grad.addColorStop(0, 'rgba(34, 211, 238, 0)');
            grad.addColorStop(0.5, 'rgba(34, 211, 238, 0.24)');
            grad.addColorStop(1, 'rgba(34, 211, 238, 0)');
            ctx.fillStyle = grad;
            ctx.fillRect(0, beamY - 35, vw, 70);
          }

          // Base subtle cyan frames on all detected faces
          faces.forEach((f, idx) => {
            drawCornerBox(
              ctx,
              f.x * vw,
              f.y * vh,
              f.w * vw,
              f.h * vh,
              'rgba(56, 189, 248, 0.78)',
              2.5,
              false,
              !scan.active ? `#${idx + 1}` : undefined,
            );
          });

          // Smooth gliding active scanner box(es) looping around detected faces
          if (scan.active && faces.length > 0) {
            const f1 = faces[scan.highlightIndices[0] % faces.length];
            if (f1) {
              const tx = f1.x * vw;
              const ty = f1.y * vh;
              const tw = f1.w * vw;
              const th = f1.h * vh;
              if (!scan.glide1) {
                scan.glide1 = { x: tx, y: ty, w: tw, h: th };
              } else {
                const gAlpha = 0.32;
                scan.glide1.x += (tx - scan.glide1.x) * gAlpha;
                scan.glide1.y += (ty - scan.glide1.y) * gAlpha;
                scan.glide1.w += (tw - scan.glide1.w) * gAlpha;
                scan.glide1.h += (th - scan.glide1.h) * gAlpha;
              }
            }

            const f2 =
              modeRef.current === 'PAIR' && faces.length >= 2
                ? faces[(scan.highlightIndices[1] ?? 1) % faces.length]
                : null;
            if (f2) {
              const tx = f2.x * vw;
              const ty = f2.y * vh;
              const tw = f2.w * vw;
              const th = f2.h * vh;
              if (!scan.glide2) {
                scan.glide2 = { x: tx, y: ty, w: tw, h: th };
              } else {
                const gAlpha = 0.32;
                scan.glide2.x += (tx - scan.glide2.x) * gAlpha;
                scan.glide2.y += (ty - scan.glide2.y) * gAlpha;
                scan.glide2.w += (tw - scan.glide2.w) * gAlpha;
                scan.glide2.h += (th - scan.glide2.h) * gAlpha;
              }
            } else {
              scan.glide2 = null;
            }

            if (scan.glide1 && scan.glide2) {
              const x1 = scan.glide1.x + scan.glide1.w / 2;
              const y1 = scan.glide1.y + scan.glide1.h / 2;
              const x2 = scan.glide2.x + scan.glide2.w / 2;
              const y2 = scan.glide2.y + scan.glide2.h / 2;
              ctx.save();
              ctx.strokeStyle = '#facc15';
              ctx.lineWidth = 4;
              ctx.setLineDash([12, 8]);
              ctx.shadowColor = '#facc15';
              ctx.shadowBlur = 12;
              ctx.beginPath();
              ctx.moveTo(x1, y1);
              ctx.lineTo(x2, y2);
              ctx.stroke();
              ctx.restore();
            }

            if (scan.glide1) {
              drawCornerBox(
                ctx,
                scan.glide1.x,
                scan.glide1.y,
                scan.glide1.w,
                scan.glide1.h,
                '#4ade80',
                5,
                true,
                modeRef.current === 'PAIR' ? 'BẠN 1 ✨' : 'ĐANG QUÉT 🎯',
              );
            }
            if (scan.glide2) {
              drawCornerBox(
                ctx,
                scan.glide2.x,
                scan.glide2.y,
                scan.glide2.w,
                scan.glide2.h,
                '#fbbf24',
                5,
                true,
                'BẠN 2 🤝',
              );
            }

            // If only 1 face is currently visible, draw orbiting scan ring so it feels alive
            if (faces.length === 1 && scan.glide1) {
              const cx = scan.glide1.x + scan.glide1.w / 2;
              const cy = scan.glide1.y + scan.glide1.h / 2;
              const rad = Math.max(scan.glide1.w, scan.glide1.h) * 0.68;
              const ang = (now / 260) % (Math.PI * 2);
              ctx.save();
              ctx.strokeStyle = 'rgba(74, 222, 128, 0.8)';
              ctx.lineWidth = 3.5;
              ctx.beginPath();
              ctx.arc(cx, cy, rad, ang, ang + Math.PI * 0.7);
              ctx.stroke();
              ctx.restore();
            }
          } else {
            scan.glide1 = null;
            scan.glide2 = null;
          }
        }
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
  }, [finalizeSelection]);

  const startCamera = useCallback(
    async (opts?: { deviceId?: string; facing?: 'user' | 'environment' }) => {
      setErrorMsg('');
      setWarningTip('');
      setCameraLoading(true);
      stopCameraTracks();

      const targetDeviceId = opts?.deviceId;
      const targetFacing = opts?.facing ?? facingMode;

      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          throw new Error('Trình duyệt không hỗ trợ Camera hoặc trang chưa chạy trên HTTPS.');
        }

        const primaryConstraints: MediaStreamConstraints = {
          video: targetDeviceId
            ? {
                deviceId: { exact: targetDeviceId },
                width: { ideal: 1280 },
                height: { ideal: 720 },
              }
            : {
                facingMode: { ideal: targetFacing },
                width: { ideal: 1280 },
                height: { ideal: 720 },
              },
          audio: false,
        };

        const openStreamWithFallback = async (): Promise<MediaStream> => {
          try {
            return await navigator.mediaDevices.getUserMedia(primaryConstraints);
          } catch (firstErr) {
            // Fallback for older USB webcams or strict mobile constraints
            if (
              firstErr instanceof Error &&
              (firstErr.name === 'OverconstrainedError' || firstErr.name === 'ConstraintNotSatisfiedError')
            ) {
              return navigator.mediaDevices.getUserMedia({
                video: targetDeviceId ? { deviceId: targetDeviceId } : { facingMode: targetFacing },
                audio: false,
              });
            }
            throw firstErr;
          }
        };

        const [stream] = await Promise.all([openStreamWithFallback(), initFaceDetector()]);

        streamRef.current = stream;

        // Enumerate video input devices after permission is granted
        const allDevs = await navigator.mediaDevices.enumerateDevices();
        const videoDevs = allDevs.filter((d) => d.kind === 'videoinput');
        setDevices(videoDevs);
        const activeTrack = stream.getVideoTracks()[0];
        const settings = activeTrack?.getSettings();
        const activeDevId = settings?.deviceId ?? targetDeviceId ?? '';
        if (activeDevId) setSelectedDeviceId(activeDevId);
        if (settings?.facingMode === 'environment') {
          setFacingMode('environment');
          setMirrored(false);
        } else if (settings?.facingMode === 'user') {
          setFacingMode('user');
          setMirrored(true);
        }

        setCameraActive(true);
        setCameraLoading(false);

        // Attach stream to <video> on next frame
        window.requestAnimationFrame(() => {
          const vid = videoRef.current;
          if (vid && streamRef.current) {
            vid.srcObject = streamRef.current;
            vid.onloadedmetadata = () => {
              if (vid.videoWidth > 0 && vid.videoHeight > 0) {
                setVideoAspect(vid.videoWidth / vid.videoHeight);
              }
            };
            void vid.play().catch(() => {});
            startDetectionLoop();
          }
        });
      } catch (err) {
        setCameraLoading(false);
        setCameraActive(false);
        const msg =
          err instanceof Error
            ? err.name === 'NotAllowedError'
              ? 'Bạn chưa cấp quyền Camera. Hãy bấm biểu tượng ổ khóa trên thanh địa chỉ trình duyệt và chọn "Cho phép" Camera.'
              : err.name === 'NotFoundError'
                ? 'Không tìm thấy thiết bị Camera trên máy tính này.'
                : err.message
            : 'Không thể khởi động Camera.';
        setErrorMsg(msg);
      }
    },
    [facingMode, initFaceDetector, startDetectionLoop, stopCameraTracks],
  );

  const handleToggleFacing = () => {
    const nextFacing = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(nextFacing);
    setMirrored(nextFacing === 'user');
    void startCamera({ facing: nextFacing });
  };

  const handleBeginScan = () => {
    void unlockGameAudio();
    setWarningTip('');
    const currentCount = trackedFacesRef.current.length;
    if (currentCount === 0) {
      setWarningTip('Chưa thấy khuôn mặt nào trong khung hình — hãy hướng camera về phía lớp!');
      return;
    }
    if (mode === 'PAIR' && currentCount < 2) {
      setWarningTip('Chế độ Ghép cặp cần tối thiểu 2 khuôn mặt trong khung hình!');
      return;
    }

    const startCursor1 = cryptoRandomInt(currentCount);
    const startCursor2 =
      currentCount >= 2 ? (startCursor1 + Math.max(1, Math.floor(currentCount / 2))) % currentCount : 0;

    setCapturedWinners(null);
    lastCountdownRef.current = -1;
    scanStateRef.current = {
      active: true,
      startMs: performance.now(),
      durationMs: scanSeconds * 1000,
      lastHopMs: 0,
      cursor1: startCursor1,
      cursor2: startCursor2,
      highlightIndices: mode === 'PAIR' && currentCount >= 2 ? [startCursor1, startCursor2] : [startCursor1],
      glide1: null,
      glide2: null,
    };
    setCountdownSec(scanSeconds);
    setScanning(true);
  };

  const handleOpenBankQuestion = () => {
    if (!isInstructor || questions.length === 0) return;
    const pool = selectedCourseId
      ? questions.filter((q) => q.courseId === selectedCourseId)
      : questions;
    const activePool = pool.length > 0 ? pool : questions;
    const q = activePool[cryptoRandomInt(activePool.length)];
    const vars = generateSeedVarsForQuestion(q, 'MINIGAME_STAGE', String(Date.now()));
    const renderedContent = interpolateText(q.content, vars);
    const renderedOptions = (q.options ?? []).map((o) => ({
      id: o.id,
      text: interpolateText(o.text, vars),
      isCorrect: (q.correctOptionIds ?? []).includes(o.id),
    }));
    let renderedExpected = '';
    if (q.type === 'NUMERICAL' && q.numericalFormula) {
      const val = Math.round(evaluateFormula(q.numericalFormula, vars) * 1000) / 1000;
      renderedExpected = `${val} ${q.numericalUnit ?? ''}`.trim();
    } else if (q.type === 'TRUE_FALSE' && q.trueFalseItems) {
      renderedExpected = q.trueFalseItems
        .map((it, idx) => `${idx + 1}. ${interpolateText(it.statement, vars)} → ${it.answer ? 'ĐÚNG' : 'SAI'}`)
        .join(' | ');
    } else if (q.sampleAnswer) {
      renderedExpected = interpolateText(q.sampleAnswer, vars);
    }
    setPickedQuestion({ q, renderedContent, renderedOptions, renderedExpected });
    setRevealAnswer(false);
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-3 sm:p-5 gap-4 select-none">
      <ConfettiBurst active={confetti} />

      {!cameraActive ? (
        /* Setup & Mode Selection Screen */
        <div className="w-full max-w-3xl bg-slate-900/75 border border-white/15 backdrop-blur-xl rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6 text-white">
          <div className="text-center space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/20 border border-cyan-400/35 text-cyan-200 text-xs font-black uppercase tracking-wider">
              <ScanFace className="w-4 h-4" /> AI Camera nội bộ — Bảo mật 100%
            </div>
            <h2 className="text-2xl sm:text-3xl font-black">📷 Ống Kính May Mắn</h2>
            <p className="text-sm text-slate-300">
              Hướng camera về phía lớp học — AI tự động nhận diện khuôn mặt và chọn ngẫu nhiên mà
              không cần nhập danh sách trước.
            </p>
          </div>

          {/* 2 Modes */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <button
              type="button"
              onClick={() => setMode('SINGLE')}
              className={`p-5 rounded-2xl border-2 text-left transition space-y-2 ${
                mode === 'SINGLE'
                  ? 'bg-cyan-500/20 border-cyan-400 shadow-lg shadow-cyan-500/15'
                  : 'bg-white/5 border-white/10 hover:border-white/30'
              }`}
            >
              <div className="w-11 h-11 rounded-2xl bg-cyan-400/20 text-cyan-300 flex items-center justify-center text-2xl">
                🎯
              </div>
              <div className="font-black text-lg">Chọn 1 bạn</div>
              <p className="text-xs text-slate-300">
                AI tìm tất cả khuôn mặt trong lớp và chọn ngẫu nhiên 1 bạn may mắn để trả lời.
              </p>
            </button>

            <button
              type="button"
              onClick={() => setMode('PAIR')}
              className={`p-5 rounded-2xl border-2 text-left transition space-y-2 ${
                mode === 'PAIR'
                  ? 'bg-amber-500/20 border-amber-400 shadow-lg shadow-amber-500/15'
                  : 'bg-white/5 border-white/10 hover:border-white/30'
              }`}
            >
              <div className="w-11 h-11 rounded-2xl bg-amber-400/20 text-amber-300 flex items-center justify-center text-2xl">
                🤝
              </div>
              <div className="font-black text-lg">Ghép cặp ngẫu nhiên</div>
              <p className="text-xs text-slate-300">
                AI tự động chọn ngẫu nhiên 2 bạn khác nhau trong khung hình để ghép cặp thảo luận.
              </p>
            </button>
          </div>

          {/* Scan Duration Slider */}
          <div className="bg-black/25 border border-white/10 rounded-2xl p-4 space-y-2">
            <div className="flex items-center justify-between text-xs font-bold">
              <span className="text-slate-300">⏱️ Thời gian quét hồi hộp</span>
              <span className="text-amber-300 font-black text-sm">{scanSeconds} giây</span>
            </div>
            <input
              type="range"
              min={3}
              max={20}
              step={1}
              value={scanSeconds}
              onChange={(e) => setScanSeconds(Number(e.target.value))}
              className="w-full accent-amber-400 cursor-pointer"
            />
            <div className="flex justify-between text-[11px] text-slate-400 font-semibold">
              <span>Nhanh (3s)</span>
              <span>Vừa (10s)</span>
              <span>Hồi hộp (20s)</span>
            </div>
          </div>

          {errorMsg && (
            <div className="p-3.5 rounded-2xl bg-rose-500/20 border border-rose-400/45 text-rose-100 text-xs font-bold flex items-start gap-2">
              <VideoOff className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          <button
            type="button"
            disabled={cameraLoading}
            onClick={() => void startCamera()}
            className="w-full py-4 rounded-2xl bg-gradient-to-r from-cyan-400 via-blue-500 to-indigo-500 hover:brightness-110 disabled:opacity-60 text-slate-950 font-black text-base sm:text-lg shadow-xl shadow-cyan-500/25 flex items-center justify-center gap-2 transition active:scale-[0.99]"
          >
            <Camera className="w-5 h-5" />
            {cameraLoading
              ? 'Đang mở Camera & nạp mô hình AI...'
              : `Bật Camera & Vào chế độ ${mode === 'PAIR' ? 'Ghép cặp' : 'Chọn 1 bạn'}`}
          </button>
        </div>
      ) : (
        /* Live Camera Stage */
        <div className="w-full max-w-6xl flex flex-col items-center gap-3">
          <div
            className="relative max-w-full max-h-[72dvh] rounded-3xl overflow-hidden border-2 border-cyan-400/40 bg-slate-950 shadow-[0_20px_60px_rgba(0,0,0,0.55)]"
            style={{ aspectRatio: String(videoAspect), width: videoAspect < 1 ? 'auto' : '100%' }}
          >
            <video
              ref={videoRef}
              playsInline
              muted
              className={`w-full h-full object-contain ${mirrored ? '-scale-x-100' : ''}`}
            />
            <canvas
              ref={overlayCanvasRef}
              className="absolute inset-0 w-full h-full object-contain pointer-events-none"
            />

            {/* Top HUD Pills */}
            <div className="absolute top-3 left-3 right-3 flex flex-wrap items-center justify-between gap-2 pointer-events-none">
              <div className="flex items-center gap-2">
                <span className="px-3.5 py-1.5 rounded-full bg-slate-950/75 border border-emerald-400/40 text-emerald-300 text-xs sm:text-sm font-black backdrop-blur-md flex items-center gap-1.5">
                  <Users className="w-4 h-4" />
                  Đang thấy: {faceCount} khuôn mặt
                </span>
                {aiReady && (
                  <span className="hidden sm:inline-flex px-3 py-1.5 rounded-full bg-slate-950/70 border border-cyan-400/30 text-cyan-200 text-xs font-bold backdrop-blur-md">
                    {mode === 'PAIR' ? '🤝 Chế độ Ghép cặp (2 bạn)' : '🎯 Chế độ Chọn 1 bạn'}
                  </span>
                )}
              </div>

              {scanning && (
                <div className="px-4 py-1.5 rounded-full bg-amber-400 text-slate-950 font-black text-sm sm:text-base shadow-lg animate-pulse">
                  ⏱️ Đang quét... {countdownSec.toFixed(1)}s
                </div>
              )}
            </div>

            {warningTip && (
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded-2xl bg-rose-600/95 text-white text-xs sm:text-sm font-bold shadow-xl">
                ⚠️ {warningTip}
              </div>
            )}

            {!warningTip && scanning && faceCount === 1 && (
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded-2xl bg-slate-950/80 border border-cyan-400/40 text-cyan-200 text-xs font-bold backdrop-blur-md">
                💡 Hiện chỉ thấy 1 khuôn mặt — lia camera rộng hơn để quét vòng quanh nhiều bạn!
              </div>
            )}
          </div>

          {/* Live Control Bar */}
          <div className="w-full flex flex-wrap items-center justify-between gap-2.5 bg-slate-900/75 border border-white/15 backdrop-blur-md rounded-2xl p-3 text-white">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex rounded-xl bg-black/35 p-1 border border-white/10">
                <button
                  type="button"
                  disabled={scanning}
                  onClick={() => setMode('SINGLE')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-black transition ${
                    mode === 'SINGLE'
                      ? 'bg-cyan-400 text-slate-950'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  🎯 Chọn 1
                </button>
                <button
                  type="button"
                  disabled={scanning}
                  onClick={() => setMode('PAIR')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-black transition ${
                    mode === 'PAIR'
                      ? 'bg-amber-400 text-slate-950'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  🤝 Ghép cặp
                </button>
              </div>

              <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-black/30 border border-white/10">
                <span className="text-xs font-bold text-slate-300">{scanSeconds}s</span>
                <input
                  type="range"
                  min={3}
                  max={20}
                  step={1}
                  disabled={scanning}
                  value={scanSeconds}
                  onChange={(e) => setScanSeconds(Number(e.target.value))}
                  className="w-20 sm:w-28 accent-amber-400 cursor-pointer"
                  title="Chỉnh thời gian quét (giây)"
                />
              </div>

              <button
                type="button"
                disabled={scanning}
                onClick={handleToggleFacing}
                className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 text-xs font-bold flex items-center gap-1"
                title="Đổi nhanh giữa Camera trước và Camera sau (điện thoại)"
              >
                <SwitchCamera className="w-3.5 h-3.5" />
                {facingMode === 'user' ? 'Cam sau' : 'Cam trước'}
              </button>

              {devices.length > 1 && (
                <select
                  value={selectedDeviceId}
                  disabled={scanning}
                  onChange={(e) => void startCamera({ deviceId: e.target.value })}
                  className="px-2.5 py-1.5 rounded-xl bg-white/10 border border-white/15 text-xs font-bold text-white max-w-[170px]"
                  title="Đổi thiết bị Camera (Webcam USB / Camera ngoài)"
                >
                  {devices.map((d, idx) => (
                    <option key={d.deviceId} value={d.deviceId} className="text-slate-900">
                      {d.label || `Camera ${idx + 1}`}
                    </option>
                  ))}
                </select>
              )}

              <button
                type="button"
                onClick={() => setMirrored((m) => !m)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1 border transition ${
                  mirrored
                    ? 'bg-white/15 border-cyan-400/40 text-cyan-200'
                    : 'bg-white/5 border-white/15 text-slate-300'
                }`}
                title="Lật gương trái/phải"
              >
                <FlipHorizontal2 className="w-3.5 h-3.5" /> Lật gương
              </button>

              <button
                type="button"
                disabled={scanning}
                onClick={stopCameraTracks}
                className="px-3 py-1.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/35 border border-rose-400/30 text-rose-200 text-xs font-bold flex items-center gap-1"
              >
                <VideoOff className="w-3.5 h-3.5" /> Tắt Cam
              </button>
            </div>

            <button
              type="button"
              disabled={scanning}
              onClick={handleBeginScan}
              className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-400 via-cyan-400 to-blue-500 hover:brightness-110 disabled:opacity-50 text-slate-950 font-black text-sm sm:text-base shadow-lg shadow-cyan-500/30 flex items-center gap-2 transition active:scale-95"
            >
              <Sparkles className="w-4 h-4" />
              {scanning ? `Đang quét (${countdownSec.toFixed(1)}s)...` : `BẮT ĐẦU QUÉT (${scanSeconds}s)`}
            </button>
          </div>
        </div>
      )}

      {/* Freeze-Frame Winner Portrait Modal */}
      {capturedWinners && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 overflow-hidden">
          <div className="relative z-10 bg-gradient-to-b from-slate-900 to-indigo-950 border-2 border-amber-400/75 text-white rounded-3xl max-w-2xl w-full max-h-[90dvh] overflow-y-auto p-6 sm:p-8 text-center shadow-[0_0_60px_rgba(251,191,36,0.3)] space-y-5">
            <div className="text-xs font-black uppercase tracking-[0.2em] text-amber-300">
              {capturedWinners.length === 2
                ? '🤝 CẶP ĐÔI MAY MẮN ĐƯỢC CHỌN!'
                : '🎉 XIN CHÚC MỪNG BẠN ĐƯỢC CHỌN!'}
            </div>

            <div className="flex flex-wrap items-center justify-center gap-5">
              {capturedWinners.map((w, idx) => (
                <React.Fragment key={idx}>
                  {idx === 1 && (
                    <div className="text-4xl animate-bounce select-none" aria-hidden>
                      🤝
                    </div>
                  )}
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-48 h-48 sm:w-56 sm:h-56 rounded-3xl overflow-hidden border-4 border-amber-400 shadow-[0_0_30px_rgba(251,191,36,0.45)] bg-slate-800">
                      {w.portraitDataUrl ? (
                        <img
                          src={w.portraitDataUrl}
                          alt={w.label}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-5xl">
                          😊
                        </div>
                      )}
                    </div>
                    <span className="px-3.5 py-1 rounded-full bg-amber-400 text-slate-950 font-black text-xs uppercase">
                      {w.label}
                    </span>
                  </div>
                </React.Fragment>
              ))}
            </div>

            {/* Optional Instructor Question Bank Drawer */}
            {isInstructor && questions.length > 0 && (
              <div className="pt-1 space-y-3 text-left">
                {!pickedQuestion ? (
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    {courses.length > 1 && (
                      <select
                        value={selectedCourseId}
                        onChange={(e) => setSelectedCourseId(e.target.value)}
                        className="px-3 py-2 rounded-xl bg-white/10 border border-white/20 text-xs font-bold text-white"
                      >
                        <option value="" className="text-slate-900">
                          Tất cả học phần
                        </option>
                        {courses.map((c) => (
                          <option key={c.id} value={c.id} className="text-slate-900">
                            {c.code} — {c.name}
                          </option>
                        ))}
                      </select>
                    )}
                    <button
                      type="button"
                      onClick={handleOpenBankQuestion}
                      className="px-4 py-2 rounded-xl bg-indigo-500/30 hover:bg-indigo-500/50 border border-indigo-400/50 text-indigo-100 font-bold text-xs flex items-center gap-1.5"
                    >
                      <BookOpen className="w-4 h-4" /> Mở câu hỏi Ngân hàng đề
                    </button>
                  </div>
                ) : (
                  <div className="bg-white/10 border border-white/20 rounded-2xl p-4 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-black uppercase tracking-wider text-amber-300">
                        Câu hỏi phỏng vấn nhanh
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={handleOpenBankQuestion}
                          className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-white/15 hover:bg-white/25"
                        >
                          Đổi câu khác
                        </button>
                        <button
                          type="button"
                          onClick={() => setRevealAnswer((r) => !r)}
                          className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-amber-400 text-slate-950 flex items-center gap-1"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          {revealAnswer ? 'Ẩn đáp án' : 'Hiện đáp án'}
                        </button>
                      </div>
                    </div>

                    <p className="font-bold text-sm sm:text-base whitespace-pre-line">
                      {pickedQuestion.renderedContent}
                    </p>

                    {pickedQuestion.renderedOptions.length > 0 && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {pickedQuestion.renderedOptions.map((o, idx) => (
                          <div
                            key={o.id}
                            className={`px-3 py-2 rounded-xl text-xs font-semibold border ${
                              revealAnswer && o.isCorrect
                                ? 'bg-emerald-500/30 border-emerald-400 text-emerald-100'
                                : 'bg-black/25 border-white/10 text-slate-200'
                            }`}
                          >
                            <span className="font-black mr-1.5">
                              {String.fromCharCode(65 + idx)}.
                            </span>
                            {o.text}
                          </div>
                        ))}
                      </div>
                    )}

                    {revealAnswer && pickedQuestion.renderedExpected && (
                      <div className="p-2.5 rounded-xl bg-emerald-500/20 border border-emerald-400/40 text-emerald-200 text-xs font-bold">
                        Đáp án: {pickedQuestion.renderedExpected}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setCapturedWinners(null)}
                className="px-6 py-3 rounded-2xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-sm flex items-center gap-2 shadow-lg"
              >
                <RefreshCw className="w-4 h-4" /> Quét lượt tiếp theo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LuckyLensGame;
