import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Eye,
  EyeOff,
  ImagePlus,
  Music,
  Play,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { ConfettiBurst } from '../../components/game/ConfettiBurst';
import { playWinnerFanfare, unlockGameAudio } from '../../utils/gameAudio';
import { cryptoRandomInt } from '../rosterStorage';
import type { MinigameProps } from '../types';

interface EphemeralPhoto {
  id: string;
  url: string; // RAM-only ObjectURL — lost on reload
  label: string;
  revealed: boolean;
}

type ShowAct = 'SETUP' | 'INTRO_TITLE' | 'READY' | 'SILHOUETTE' | 'REVEALED';

const DEFAULT_THEME_AUDIO = '/assets/minigames/nguoi-ay-la-ai/theme.mp3';

function cleanLabelFromFilename(filename: string): string {
  const withoutExt = filename.replace(/\.[^/.]+$/, '');
  return withoutExt.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Nhân vật bí ẩn';
}

// Generate 28 bulb coordinates around a sleek marquee frame (percentage positions)
const MARQUEE_BULBS: Array<{ left: string; top: string }> = (() => {
  const pts: Array<{ left: string; top: string }> = [];
  const topCount = 10;
  const sideCount = 5;
  for (let i = 0; i < topCount; i++) {
    pts.push({ left: `${(i / (topCount - 1)) * 100}%`, top: '0%' });
  }
  for (let i = 1; i < sideCount; i++) {
    pts.push({ left: '100%', top: `${(i / sideCount) * 100}%` });
  }
  for (let i = topCount - 1; i >= 0; i--) {
    pts.push({ left: `${(i / (topCount - 1)) * 100}%`, top: '100%' });
  }
  for (let i = sideCount - 1; i >= 1; i--) {
    pts.push({ left: '0%', top: `${(i / sideCount) * 100}%` });
  }
  return pts;
})();

export const WhoIsThatGame: React.FC<MinigameProps> = ({ muted }) => {
  // Ephemeral RAM-only photo list (never persisted to storage or server)
  const [photos, setPhotos] = useState<EphemeralPhoto[]>([]);
  const [customAudioUrl, setCustomAudioUrl] = useState<string | null>(null);
  const [customAudioName, setCustomAudioName] = useState<string>('');
  const [showNameOnReveal, setShowNameOnReveal] = useState<boolean>(true);
  const [excludeRevealed, setExcludeRevealed] = useState<boolean>(true);
  const [isDragging, setIsDragging] = useState<boolean>(false);

  // Live show state
  const [act, setAct] = useState<ShowAct>('SETUP');
  const [winner, setWinner] = useState<EphemeralPhoto | null>(null);
  const [flashPhotoIdx, setFlashPhotoIdx] = useState<number>(0);
  const [bulbTick, setBulbTick] = useState<number>(0);
  const [flashBurst, setFlashBurst] = useState<boolean>(false);
  const [confetti, setConfetti] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const audioInputRef = useRef<HTMLInputElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const confettiTimerRef = useRef<number | null>(null);
  const flashTimerRef = useRef<number | null>(null);

  const photosRef = useRef<EphemeralPhoto[]>(photos);
  photosRef.current = photos;
  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  const customAudioRef = useRef<string | null>(customAudioUrl);
  customAudioRef.current = customAudioUrl;

  // Revoke all temporary ObjectURLs on unmount so RAM is completely freed
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      if (confettiTimerRef.current !== null) window.clearTimeout(confettiTimerRef.current);
      if (flashTimerRef.current !== null) window.clearTimeout(flashTimerRef.current);
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      photosRef.current.forEach((p) => URL.revokeObjectURL(p.url));
      if (customAudioRef.current) URL.revokeObjectURL(customAudioRef.current);
    };
  }, []);

  // Sync mute button on top stage bar with playing MP3 audio
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.muted = muted;
    }
  }, [muted]);

  // Chasing marquee bulbs animation when on stage
  useEffect(() => {
    if (act === 'SETUP') return;
    const id = window.setInterval(() => {
      setBulbTick((t) => (t + 1) % 4);
    }, act === 'SILHOUETTE' ? 110 : 240);
    return () => window.clearInterval(id);
  }, [act]);

  // Rapid silhouette teaser shuffle during Act 3
  useEffect(() => {
    if (act !== 'SILHOUETTE' || photos.length === 0) return;
    const id = window.setInterval(() => {
      setFlashPhotoIdx((prev) => (prev + 1) % photos.length);
    }, 150);
    return () => window.clearInterval(id);
  }, [act, photos.length]);

  const addPhotoFiles = useCallback((fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const added: EphemeralPhoto[] = [];
    for (let i = 0; i < fileList.length; i++) {
      const f = fileList[i];
      if (!f.type.startsWith('image/')) continue;
      added.push({
        id: `photo_${Date.now().toString(36)}_${i}_${Math.random().toString(36).slice(2, 6)}`,
        url: URL.createObjectURL(f),
        label: cleanLabelFromFilename(f.name),
        revealed: false,
      });
    }
    if (added.length > 0) {
      setPhotos((prev) => [...prev, ...added]);
    }
  }, []);

  const handleRemovePhoto = (id: string) => {
    setPhotos((prev) => {
      const target = prev.find((p) => p.id === id);
      if (target) URL.revokeObjectURL(target.url);
      return prev.filter((p) => p.id !== id);
    });
  };

  const handleClearAllPhotos = () => {
    photos.forEach((p) => URL.revokeObjectURL(p.url));
    setPhotos([]);
    setWinner(null);
    setAct('SETUP');
  };

  const handleResetRevealed = () => {
    setPhotos((prev) => prev.map((p) => ({ ...p, revealed: false })));
  };

  const handleSelectCustomAudio = (fileList: FileList | null) => {
    const f = fileList?.[0];
    if (!f) return;
    if (customAudioUrl) URL.revokeObjectURL(customAudioUrl);
    setCustomAudioUrl(URL.createObjectURL(f));
    setCustomAudioName(f.name);
  };

  const stopShowAudio = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  }, []);

  const availablePhotos = excludeRevealed ? photos.filter((p) => !p.revealed) : photos;

  const startShow = () => {
    const pool = availablePhotos.length > 0 ? availablePhotos : photos;
    if (pool.length === 0) return;

    void unlockGameAudio();
    stopShowAudio();

    const chosen = pool[cryptoRandomInt(pool.length)];
    setWinner(chosen);
    setAct('INTRO_TITLE');
    setConfetti(false);
    setFlashBurst(false);

    // Prepare audio track synchronized to the 11.4s gameshow beat
    const src = customAudioUrl || DEFAULT_THEME_AUDIO;
    if (!audioRef.current || audioRef.current.dataset.src !== src) {
      const audio = new Audio(src);
      audio.dataset.src = src;
      audio.preload = 'auto';
      audioRef.current = audio;
    }
    const audio = audioRef.current;
    audio.muted = mutedRef.current;
    audio.currentTime = 0;
    void audio.play().catch(() => {});

    const startWallMs = performance.now();
    let revealedFired = false;

    const step = (now: number) => {
      // Sync to audio.currentTime when playing; smoothly fallback to wall clock if muted/blocked
      const elapsedSec =
        audio && !audio.paused && audio.currentTime > 0
          ? audio.currentTime
          : (now - startWallMs) / 1000;

      if (elapsedSec < 3.15) {
        setAct('INTRO_TITLE');
      } else if (elapsedSec < 6.15) {
        setAct('READY');
      } else if (elapsedSec < 8.75) {
        setAct('SILHOUETTE');
      } else if (!revealedFired) {
        revealedFired = true;
        setAct('REVEALED');
        setFlashBurst(true);
        setConfetti(true);
        setPhotos((prev) =>
          prev.map((p) => (p.id === chosen.id ? { ...p, revealed: true } : p)),
        );
        if (flashTimerRef.current !== null) window.clearTimeout(flashTimerRef.current);
        flashTimerRef.current = window.setTimeout(() => setFlashBurst(false), 380);
        if (confettiTimerRef.current !== null) window.clearTimeout(confettiTimerRef.current);
        confettiTimerRef.current = window.setTimeout(() => setConfetti(false), 4200);
        if (!mutedRef.current && audio.paused) {
          playWinnerFanfare();
        }
        return; // Stop RAF loop once revealed
      }

      rafRef.current = requestAnimationFrame(step);
    };

    rafRef.current = requestAnimationFrame(step);
  };

  const handleBackToSetup = () => {
    stopShowAudio();
    setAct('SETUP');
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-3 sm:p-5 gap-4 select-none">
      <ConfettiBurst active={confetti} />

      {act === 'SETUP' ? (
        /* Ephemeral Photo Upload & Setup Stage */
        <div className="w-full max-w-4xl bg-gradient-to-b from-rose-950/90 via-red-950/90 to-slate-950/95 border-2 border-amber-400/45 rounded-3xl p-5 sm:p-7 shadow-[0_20px_60px_rgba(0,0,0,0.6)] text-white space-y-5">
          <div className="text-center space-y-2">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/40 text-emerald-200 text-xs font-black">
              <ShieldCheck className="w-4 h-4" /> Ảnh chỉ lưu tạm trên RAM — Tải lại trang (F5) là tự xóa sạch 100%
            </div>
            <h2 className="text-2xl sm:text-4xl font-black tracking-wide bg-gradient-to-b from-yellow-200 via-amber-400 to-orange-500 bg-clip-text text-transparent">
              🎭 NGƯỜI ẤY LÀ AI?
            </h2>
            <p className="text-xs sm:text-sm text-rose-100/85">
              Tải lên 1 ảnh bí ẩn hoặc cả bộ ảnh học sinh trong lớp. Nhạc cao trào sẽ chạy và bật tung ảnh nhân vật đúng nhịp beat drop!
            </p>
          </div>

          {/* Drag & Drop Upload Box */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              addPhotoFiles(e.dataTransfer.files);
            }}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition ${
              isDragging
                ? 'border-amber-300 bg-amber-400/15 scale-[1.01]'
                : 'border-amber-400/40 bg-black/25 hover:bg-black/35 hover:border-amber-300/70'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                addPhotoFiles(e.target.files);
                e.target.value = '';
              }}
            />
            <div className="flex flex-col items-center gap-2">
              <div className="w-12 h-12 rounded-2xl bg-amber-400/20 text-amber-300 flex items-center justify-center">
                <ImagePlus className="w-6 h-6" />
              </div>
              <div className="font-black text-sm sm:text-base text-amber-200">
                Bấm chọn hoặc kéo-thả ảnh học sinh vào đây
              </div>
              <div className="text-xs text-rose-200/75">
                Hỗ trợ chọn nhiều ảnh cùng lúc (JPG, PNG, WebP) — Không tải lên máy chủ
              </div>
            </div>
          </div>

          {/* Uploaded Photo Preview Strip */}
          {photos.length > 0 && (
            <div className="space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-bold">
                <span className="text-amber-200">
                  📸 Đã nạp tạm: <strong>{photos.length}</strong> ảnh (còn{' '}
                  <strong>{availablePhotos.length}</strong> ảnh chưa mở)
                </span>
                <div className="flex items-center gap-2">
                  {photos.some((p) => p.revealed) && (
                    <button
                      type="button"
                      onClick={handleResetRevealed}
                      className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-amber-200 flex items-center gap-1"
                    >
                      <RotateCcw className="w-3.5 h-3.5" /> Mở lại tất cả
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleClearAllPhotos}
                    className="px-2.5 py-1 rounded-lg bg-rose-500/25 hover:bg-rose-500/40 text-rose-100 flex items-center gap-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Xóa sạch ảnh
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-6 gap-2.5 max-h-48 overflow-y-auto pr-1">
                {photos.map((p) => (
                  <div
                    key={p.id}
                    className={`relative group rounded-xl overflow-hidden border ${
                      p.revealed
                        ? 'border-white/15 opacity-45'
                        : 'border-amber-400/45 bg-black/40'
                    }`}
                  >
                    <img
                      src={p.url}
                      alt={p.label}
                      className="w-full h-20 object-cover"
                    />
                    <div className="px-1.5 py-1 text-[10px] font-bold truncate text-center bg-black/70 text-amber-100">
                      {p.label}
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemovePhoto(p.id);
                      }}
                      className="absolute top-1 right-1 w-5 h-5 rounded-full bg-rose-600/90 text-white text-[10px] font-black opacity-0 group-hover:opacity-100 transition flex items-center justify-center"
                      title="Xóa ảnh này"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Options Row */}
          <div className="flex flex-wrap items-center justify-between gap-2.5 bg-black/25 border border-white/10 rounded-2xl p-3.5 text-xs font-bold">
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => setShowNameOnReveal((v) => !v)}
                className={`px-3 py-1.5 rounded-xl border flex items-center gap-1.5 transition ${
                  showNameOnReveal
                    ? 'bg-amber-400/20 border-amber-400/50 text-amber-200'
                    : 'bg-white/5 border-white/15 text-slate-300'
                }`}
              >
                {showNameOnReveal ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                {showNameOnReveal ? 'Hiện tên ảnh khi bật tung' : 'Ẩn tên (chỉ hiện ảnh)'}
              </button>

              <label className="inline-flex items-center gap-1.5 cursor-pointer text-rose-100">
                <input
                  type="checkbox"
                  checked={excludeRevealed}
                  onChange={(e) => setExcludeRevealed(e.target.checked)}
                  className="accent-amber-400 w-4 h-4"
                />
                Không lặp lại ảnh đã mở
              </label>
            </div>

            <div className="flex items-center gap-2">
              <input
                ref={audioInputRef}
                type="file"
                accept="audio/*"
                className="hidden"
                onChange={(e) => handleSelectCustomAudio(e.target.files)}
              />
              <button
                type="button"
                onClick={() => audioInputRef.current?.click()}
                className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-amber-200 flex items-center gap-1.5"
                title="Mặc định đã có sẵn nhạc Người Ấy Là Ai"
              >
                <Music className="w-3.5 h-3.5" />
                {customAudioName ? `Nhạc: ${customAudioName.slice(0, 16)}` : 'Nhạc: Người ấy là ai (Sẵn)'}
              </button>
            </div>
          </div>

          <button
            type="button"
            disabled={photos.length === 0}
            onClick={startShow}
            className="w-full py-4 rounded-2xl bg-gradient-to-r from-yellow-300 via-amber-400 to-orange-500 hover:brightness-110 disabled:opacity-40 text-slate-950 font-black text-base sm:text-xl shadow-xl shadow-amber-500/30 flex items-center justify-center gap-2 transition active:scale-[0.99]"
          >
            <Play className="w-5 h-5 fill-current" />
            {photos.length === 0
              ? 'Hãy tải lên ít nhất 1 ảnh để bắt đầu'
              : `BẮT ĐẦU SÂN KHẤU NGƯỜI ẤY LÀ AI! (${availablePhotos.length > 0 ? availablePhotos.length : photos.length} ảnh)`}
          </button>
        </div>
      ) : (
        /* Live Red-Curtain Gameshow Stage */
        <div className="w-full max-w-6xl flex flex-col items-center gap-4">
          <div
            className="relative w-full aspect-[16/9] rounded-3xl overflow-hidden border-2 border-amber-400/60 shadow-[0_24px_70px_rgba(0,0,0,0.75)] flex items-center justify-center"
            style={{
              background:
                'repeating-linear-gradient(90deg, #5c060c 0px, #8b0a14 26px, #470408 52px)',
            }}
          >
            {/* Top Diagonal Stage Spotlights */}
            <div
              className="pointer-events-none absolute -top-10 left-[12%] w-64 h-[130%] opacity-30 rotate-[18deg] blur-xl"
              style={{
                background: 'linear-gradient(180deg, rgba(254,240,138,0.95) 0%, rgba(254,240,138,0) 80%)',
              }}
            />
            <div
              className="pointer-events-none absolute -top-10 right-[12%] w-64 h-[130%] opacity-30 -rotate-[18deg] blur-xl"
              style={{
                background: 'linear-gradient(180deg, rgba(254,240,138,0.95) 0%, rgba(254,240,138,0) 80%)',
              }}
            />

            {/* Side Theatre Velvet Curtains */}
            <div className="pointer-events-none absolute inset-y-0 left-0 w-16 sm:w-28 bg-gradient-to-r from-red-950 via-red-900/90 to-transparent shadow-2xl" />
            <div className="pointer-events-none absolute inset-y-0 right-0 w-16 sm:w-28 bg-gradient-to-l from-red-950 via-red-900/90 to-transparent shadow-2xl" />

            {/* White Flash Explosion right at Beat Drop */}
            {flashBurst && (
              <div className="pointer-events-none absolute inset-0 z-40 bg-yellow-100/90 animate-ping" />
            )}

            {/* ACT 1: NGƯỜI ẤY LÀ AI? Marquee Board */}
            {act === 'INTRO_TITLE' && (
              <div className="relative z-20 w-[78%] max-w-2xl aspect-[16/9] rounded-3xl border-[6px] border-amber-500 bg-gradient-to-b from-red-900/80 to-red-950/90 shadow-[0_0_50px_rgba(251,191,36,0.45)] flex flex-col items-center justify-center p-6 transform -rotate-1 animate-pulse">
                {MARQUEE_BULBS.map((b, i) => (
                  <span
                    key={i}
                    style={{ left: b.left, top: b.top }}
                    className={`absolute -translate-x-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full transition-opacity ${
                      i % 2 === bulbTick % 2
                        ? 'bg-yellow-200 shadow-[0_0_12px_#fde047] opacity-100'
                        : 'bg-amber-700 opacity-50'
                    }`}
                  />
                ))}
                <div className="text-3xl sm:text-6xl font-black tracking-wider text-center leading-tight bg-gradient-to-b from-yellow-100 via-amber-400 to-orange-500 bg-clip-text text-transparent drop-shadow-[0_6px_18px_rgba(0,0,0,0.9)]">
                  NGƯỜI ẤY
                  <br />
                  LÀ AI?
                </div>
              </div>
            )}

            {/* ACT 2: ARE YOU READY?! + Spinning Film Reel */}
            {act === 'READY' && (
              <div className="relative z-20 flex items-center justify-center gap-6 sm:gap-10 px-6">
                <div className="w-28 h-28 sm:w-44 sm:h-44 rounded-full border-8 border-amber-400 bg-amber-950/80 shadow-[0_0_40px_rgba(251,191,36,0.5)] flex items-center justify-center animate-spin">
                  <div className="grid grid-cols-2 gap-3 sm:gap-5">
                    <span className="w-6 h-6 sm:w-9 sm:h-9 rounded-full bg-red-950 border-2 border-amber-300" />
                    <span className="w-6 h-6 sm:w-9 sm:h-9 rounded-full bg-red-950 border-2 border-amber-300" />
                    <span className="w-6 h-6 sm:w-9 sm:h-9 rounded-full bg-red-950 border-2 border-amber-300" />
                    <span className="w-6 h-6 sm:w-9 sm:h-9 rounded-full bg-red-950 border-2 border-amber-300" />
                  </div>
                </div>
                <div className="text-4xl sm:text-7xl font-black italic tracking-wide bg-gradient-to-b from-yellow-200 via-amber-400 to-orange-500 bg-clip-text text-transparent drop-shadow-[0_6px_20px_rgba(0,0,0,0.9)] animate-bounce">
                  Are you
                  <br />
                  ready?!
                </div>
              </div>
            )}

            {/* ACT 3: MYSTERY SILHOUETTE FLASHING INSIDE MARQUEE */}
            {act === 'SILHOUETTE' && (
              <div className="relative z-20 w-[76%] max-w-2xl aspect-[16/10] rounded-3xl border-[6px] border-amber-400 bg-gradient-to-b from-amber-950/75 to-black/90 shadow-[0_0_60px_rgba(251,191,36,0.65)] flex items-center justify-center overflow-hidden p-4">
                {MARQUEE_BULBS.map((b, i) => (
                  <span
                    key={i}
                    style={{ left: b.left, top: b.top }}
                    className={`absolute -translate-x-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full ${
                      i % 2 === bulbTick % 2
                        ? 'bg-yellow-200 shadow-[0_0_14px_#fde047]'
                        : 'bg-amber-600/60'
                    }`}
                  />
                ))}
                {photos[flashPhotoIdx] && (
                  <img
                    src={photos[flashPhotoIdx].url}
                    alt="Bí ẩn"
                    className="h-[82%] w-auto max-w-[75%] object-contain rounded-2xl brightness-0 contrast-200 opacity-85 scale-105 transition-transform duration-100"
                  />
                )}
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-7xl sm:text-9xl font-black text-amber-300/90 drop-shadow-[0_0_24px_rgba(250,204,21,0.9)] animate-ping">
                    ?
                  </span>
                </div>
              </div>
            )}

            {/* ACT 4: BEAT DROP REVEAL — POP OUT STUDENT PHOTO! */}
            {act === 'REVEALED' && winner && (
              <div className="relative z-20 w-[82%] max-w-3xl h-[84%] rounded-3xl border-[6px] border-amber-300 bg-gradient-to-b from-amber-900/50 via-red-950/75 to-black/90 shadow-[0_0_80px_rgba(251,191,36,0.75)] flex flex-col items-center justify-center p-4 sm:p-6 gap-3">
                {MARQUEE_BULBS.map((b, i) => (
                  <span
                    key={i}
                    style={{ left: b.left, top: b.top }}
                    className={`absolute -translate-x-1/2 -translate-y-1/2 w-4 h-4 rounded-full ${
                      i % 2 === bulbTick % 2
                        ? 'bg-yellow-100 shadow-[0_0_16px_#fde047]'
                        : 'bg-amber-400'
                    }`}
                  />
                ))}

                <div className="text-xs sm:text-sm font-black uppercase tracking-[0.25em] text-amber-300 drop-shadow">
                  ✨ CHÍNH LÀ BẠN NÀY ĐÂY!! ✨
                </div>

                <div className="flex-1 min-h-0 flex items-center justify-center w-full">
                  <img
                    src={winner.url}
                    alt={winner.label}
                    className="max-h-full max-w-full object-contain rounded-2xl border-4 border-yellow-300 shadow-[0_0_40px_rgba(250,204,21,0.65)]"
                  />
                </div>

                {showNameOnReveal && (
                  <div className="px-6 py-2 rounded-full bg-gradient-to-r from-yellow-300 via-amber-400 to-orange-400 text-slate-950 font-black text-lg sm:text-2xl uppercase tracking-wide shadow-xl">
                    {winner.label}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Stage Controls */}
          <div className="flex flex-wrap items-center justify-center gap-3">
            {act === 'REVEALED' && (
              <button
                type="button"
                onClick={startShow}
                className="px-7 py-3 rounded-2xl bg-gradient-to-r from-yellow-300 via-amber-400 to-orange-500 hover:brightness-110 text-slate-950 font-black text-sm sm:text-base shadow-xl shadow-amber-500/30 flex items-center gap-2 transition active:scale-95"
              >
                <Sparkles className="w-4 h-4" />
                {availablePhotos.length > 0
                  ? `Bật lượt tiếp theo (còn ${availablePhotos.length} ảnh)`
                  : 'Quay lại từ đầu'}
              </button>
            )}

            <button
              type="button"
              onClick={handleBackToSetup}
              className="px-5 py-3 rounded-2xl bg-white/15 hover:bg-white/25 text-white border border-white/20 font-bold text-sm"
            >
              ⚙️ Đổi danh sách ảnh / Quay về cài đặt
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default WhoIsThatGame;
