import { cn, Tooltip } from "@tokimo/ui";
import {
  Disc3,
  ListMusic,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLyrics } from "../hooks/useLyrics";
import { posterThumbUrl } from "../lib/utils";
import { type RepeatMode, useMusicPlayer } from "../shell/hooks";
import { FullScreenPlayer } from "./FullScreenPlayer";
import { NowPlayingPanel } from "./NowPlayingPanel";

export const MUSIC_MINI_PLAYER_HEIGHT_PX = 76;

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function getCoverUrl(coverPath: string | null | undefined): string | null {
  if (!coverPath) return null;
  if (coverPath.startsWith("http")) return coverPath;
  return posterThumbUrl(coverPath, 300) ?? null;
}

// ── Karaoke text for mini player — reads progressRef via RAF ─────────────────

function MiniKaraokeText({
  text,
  progressRef,
}: {
  text: string;
  progressRef: React.RefObject<number>;
}) {
  const clipRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let raf: number;
    const tick = () => {
      if (clipRef.current) {
        const p = progressRef.current ?? 0;
        clipRef.current.style.clipPath = `inset(0 ${(1 - p) * 100}% 0 0)`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [progressRef]);

  return (
    <span className="relative inline-block max-w-full truncate text-sm text-[var(--text-muted)]">
      <span aria-hidden className="invisible">
        {text}
      </span>
      <span className="absolute inset-0 truncate text-[var(--text-muted)]">
        {text}
      </span>
      <span
        ref={clipRef}
        className="absolute inset-0 truncate text-[var(--accent)]"
      >
        {text}
      </span>
    </span>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

function LiveProgressBar({
  getCurrentTime,
  getDuration,
  onSeek,
}: {
  getCurrentTime: () => number;
  getDuration: () => number;
  onSeek(time: number): void;
}) {
  const barRef = useRef<HTMLDivElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = barRef.current?.getBoundingClientRect();
      const d = getDuration();
      if (!rect || d <= 0) return;
      const ratio = Math.max(
        0,
        Math.min(1, (e.clientX - rect.left) / rect.width),
      );
      onSeek(ratio * d);
    },
    [getDuration, onSeek],
  );

  useEffect(() => {
    let raf: number;
    const tick = () => {
      const d = getDuration();
      const t = getCurrentTime();
      const pct = d > 0 ? (t / d) * 100 : 0;
      if (fillRef.current) fillRef.current.style.width = `${pct}%`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [getCurrentTime, getDuration]);

  return (
    <div
      ref={barRef}
      role="slider"
      tabIndex={0}
      aria-valuenow={0}
      aria-valuemin={0}
      aria-valuemax={100}
      className="group/progress relative h-1 w-full cursor-pointer bg-[var(--fill-tertiary)] transition-[height] hover:h-1.5"
      onClick={handleClick}
      onKeyDown={(e) => {
        const d = getDuration();
        if (d <= 0) return;
        const step = d * 0.02;
        const t = getCurrentTime();
        if (e.key === "ArrowRight") onSeek(Math.min(d, t + step));
        else if (e.key === "ArrowLeft") onSeek(Math.max(0, t - step));
      }}
    >
      <div
        ref={fillRef}
        className="absolute inset-y-0 left-0 bg-[var(--accent)]"
        style={{ width: "0%" }}
      />
    </div>
  );
}

function LiveTimeDisplay({
  getCurrentTime,
  getDuration,
}: {
  getCurrentTime: () => number;
  getDuration: () => number;
}) {
  const elapsedRef = useRef<HTMLSpanElement>(null);
  const totalRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let raf: number;
    const tick = () => {
      if (elapsedRef.current)
        elapsedRef.current.textContent = formatTime(getCurrentTime());
      if (totalRef.current)
        totalRef.current.textContent = formatTime(getDuration());
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [getCurrentTime, getDuration]);

  return (
    <div className="hidden items-center gap-1 text-xs tabular-nums text-[var(--text-muted)] md:flex">
      <span ref={elapsedRef}>0:00</span>
      <span>/</span>
      <span ref={totalRef}>0:00</span>
    </div>
  );
}

function VolumeControl({
  volume,
  onVolumeChange,
}: {
  volume: number;
  onVolumeChange(v: number): void;
}) {
  const prevVolume = useRef(volume);

  const toggleMute = useCallback(() => {
    if (volume > 0) {
      prevVolume.current = volume;
      onVolumeChange(0);
    } else {
      onVolumeChange(prevVolume.current > 0 ? prevVolume.current : 0.8);
    }
  }, [volume, onVolumeChange]);

  return (
    <div className="group/vol relative flex items-center">
      <Tooltip
        title={volume > 0 ? "静音" : "取消静音"}
        mouseEnterDelay={0}
        mouseLeaveDelay={0}
      >
        <button
          type="button"
          onClick={toggleMute}
          className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--text-muted)] hover:text-[var(--text-primary)]"
        >
          {volume > 0 ? (
            <Volume2 className="h-4 w-4" />
          ) : (
            <VolumeX className="h-4 w-4" />
          )}
        </button>
      </Tooltip>

      <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 rounded-lg bg-[var(--bg-elevated)] p-2 opacity-0 shadow-lg transition-opacity group-hover/vol:pointer-events-auto group-hover/vol:opacity-100">
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          onChange={(e) => onVolumeChange(Number.parseFloat(e.target.value))}
          className="h-24 w-1 cursor-pointer accent-[var(--accent)] [writing-mode:vertical-lr] [direction:rtl]"
        />
      </div>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export function MusicMiniPlayer() {
  const {
    currentTrack,
    currentIndex,
    isPlaying,
    isLoading,
    volume,
    repeatMode,
    shuffleEnabled,
    togglePlay,
    next,
    previous,
    seek,
    setVolume,
    setRepeatMode,
    toggleShuffle,
    clearQueue,
    getCurrentTime,
    getDuration,
  } = useMusicPlayer();

  const [queueOpen, setQueueOpen] = useState(false);
  const [fullScreen, setFullScreen] = useState(false);

  const { lines, currentIdx, progressRef } = useLyrics(
    currentTrack?.id,
    getCurrentTime,
  );
  const lyricText = currentIdx >= 0 ? lines[currentIdx]?.text : null;

  const cycleRepeat = useCallback(() => {
    const modes: RepeatMode[] = ["off", "all", "one"];
    const idx = modes.indexOf(repeatMode);
    setRepeatMode(modes[(idx + 1) % modes.length]);
  }, [repeatMode, setRepeatMode]);

  // Don't render if nothing in queue
  if (currentIndex < 0 || !currentTrack) return null;

  const coverUrl = getCoverUrl(currentTrack.coverPath);
  const RepeatIcon = repeatMode === "one" ? Repeat1 : Repeat;

  return (
    <>
      <div
        className="flex shrink-0 flex-col border-t border-border-base bg-[var(--bg-glass)] backdrop-blur-md select-none"
        style={{ height: `${MUSIC_MINI_PLAYER_HEIGHT_PX}px` }}
      >
        {/* Top progress bar */}
        <LiveProgressBar
          getCurrentTime={getCurrentTime}
          getDuration={getDuration}
          onSeek={seek}
        />

        {/* Controls row */}
        <div className="flex flex-1 items-center gap-2 px-3 lg:px-4">
          {/* Album art (click to open full-screen) + track info */}
          <div className="flex min-w-0 flex-1 items-center gap-3 lg:flex-[2]">
            <button
              type="button"
              onClick={() => setFullScreen(true)}
              className="flex h-12 w-12 flex-shrink-0 items-center justify-center overflow-hidden rounded-md bg-[var(--fill-tertiary)] transition-transform hover:scale-105"
              title="全屏播放器"
            >
              {coverUrl ? (
                <img
                  src={coverUrl}
                  alt={currentTrack.title}
                  className={cn(
                    "h-full w-full object-cover",
                    isPlaying && "animate-[spin_8s_linear_infinite]",
                  )}
                  style={{ borderRadius: "50%" }}
                />
              ) : (
                <Disc3
                  className={cn(
                    "h-6 w-6 text-[var(--text-muted)]",
                    isPlaying && "animate-[spin_3s_linear_infinite]",
                  )}
                />
              )}
            </button>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-[var(--text-primary)]">
                {currentTrack.title}
              </p>
              <p className="truncate text-xs text-[var(--text-muted)]">
                {currentTrack.artistName ?? "未知艺术家"}
              </p>
            </div>
          </div>

          {/* Center: single-line lyrics with karaoke progress */}
          {lyricText && (
            <div className="hidden flex-1 items-center justify-center overflow-hidden lg:flex">
              <MiniKaraokeText text={lyricText} progressRef={progressRef} />
            </div>
          )}

          {/* Playback controls */}
          <div className="flex items-center gap-1">
            <Tooltip title="上一首" mouseEnterDelay={0} mouseLeaveDelay={0}>
              <button
                type="button"
                onClick={previous}
                className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                <SkipBack className="h-4 w-4" />
              </button>
            </Tooltip>

            <Tooltip
              title={isPlaying ? "暂停" : "播放"}
              mouseEnterDelay={0}
              mouseLeaveDelay={0}
            >
              <button
                type="button"
                onClick={togglePlay}
                disabled={isLoading}
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-full text-white",
                  isLoading
                    ? "bg-[var(--text-muted)]"
                    : "bg-[var(--accent)] hover:opacity-90",
                )}
              >
                {isPlaying ? (
                  <Pause className="h-4 w-4" />
                ) : (
                  <Play className="h-4 w-4 translate-x-[1px]" />
                )}
              </button>
            </Tooltip>

            <Tooltip title="下一首" mouseEnterDelay={0} mouseLeaveDelay={0}>
              <button
                type="button"
                onClick={next}
                className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                <SkipForward className="h-4 w-4" />
              </button>
            </Tooltip>
          </div>

          {/* Time display (hidden on small screens) */}
          <LiveTimeDisplay
            getCurrentTime={getCurrentTime}
            getDuration={getDuration}
          />

          {/* Right side controls */}
          <div className="hidden items-center gap-0.5 lg:flex">
            <VolumeControl volume={volume} onVolumeChange={setVolume} />

            <Tooltip
              title={`随机播放: ${shuffleEnabled ? "开" : "关"}`}
              mouseEnterDelay={0}
              mouseLeaveDelay={0}
            >
              <button
                type="button"
                onClick={toggleShuffle}
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-full",
                  shuffleEnabled
                    ? "text-[var(--accent)]"
                    : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]",
                )}
              >
                <Shuffle className="h-4 w-4" />
              </button>
            </Tooltip>

            <Tooltip
              title={
                repeatMode === "off"
                  ? "循环: 关"
                  : repeatMode === "all"
                    ? "循环: 全部"
                    : "循环: 单曲"
              }
              mouseEnterDelay={0}
              mouseLeaveDelay={0}
            >
              <button
                type="button"
                onClick={cycleRepeat}
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-full",
                  repeatMode !== "off"
                    ? "text-[var(--accent)]"
                    : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]",
                )}
              >
                <RepeatIcon className="h-4 w-4" />
              </button>
            </Tooltip>

            <Tooltip title="播放队列" mouseEnterDelay={0} mouseLeaveDelay={0}>
              <button
                type="button"
                onClick={() => setQueueOpen((v) => !v)}
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-full",
                  queueOpen
                    ? "text-[var(--accent)]"
                    : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]",
                )}
              >
                <ListMusic className="h-4 w-4" />
              </button>
            </Tooltip>
          </div>

          {/* Close button */}
          <Tooltip title="关闭" mouseEnterDelay={0} mouseLeaveDelay={0}>
            <button
              type="button"
              onClick={clearQueue}
              className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--text-muted)] hover:bg-red-500/10 hover:text-red-500"
            >
              <X className="h-4 w-4" />
            </button>
          </Tooltip>
        </div>
      </div>

      <NowPlayingPanel open={queueOpen} onClose={() => setQueueOpen(false)} />

      <FullScreenPlayer
        open={fullScreen}
        onClose={() => setFullScreen(false)}
      />
    </>
  );
}
