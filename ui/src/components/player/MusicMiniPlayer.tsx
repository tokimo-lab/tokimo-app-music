import { cn, Tooltip } from "@acme/components";
import {
  ListMusic,
  Music,
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
import { useCallback, useRef, useState } from "react";
import {
  type RepeatMode,
  useMusicPlayer,
} from "../../contexts/MusicPlayerContext";
import { NowPlayingPanel } from "./NowPlayingPanel";

export const MUSIC_MINI_PLAYER_HEIGHT_PX = 76;

const API_BASE =
  (typeof window !== "undefined" &&
    (import.meta.env as Record<string, string>).VITE_API_URL) ||
  "";

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function getCoverUrl(coverPath: string | null | undefined): string | null {
  if (!coverPath) return null;
  if (coverPath.startsWith("http")) return coverPath;
  return `${API_BASE}${coverPath.startsWith("/") ? "" : "/"}${coverPath}`;
}

// ── Sub-components ───────────────────────────────────────────────────────────

function ProgressBar({
  currentTime,
  duration,
  onSeek,
}: {
  currentTime: number;
  duration: number;
  onSeek(time: number): void;
}) {
  const barRef = useRef<HTMLDivElement>(null);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = barRef.current?.getBoundingClientRect();
      if (!rect || duration <= 0) return;
      const ratio = Math.max(
        0,
        Math.min(1, (e.clientX - rect.left) / rect.width),
      );
      onSeek(ratio * duration);
    },
    [duration, onSeek],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (duration <= 0) return;
      const step = duration * 0.02;
      if (e.key === "ArrowRight")
        onSeek(Math.min(duration, currentTime + step));
      else if (e.key === "ArrowLeft") onSeek(Math.max(0, currentTime - step));
    },
    [duration, currentTime, onSeek],
  );

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div
      ref={barRef}
      role="slider"
      tabIndex={0}
      aria-valuenow={Math.round(currentTime)}
      aria-valuemin={0}
      aria-valuemax={Math.round(duration)}
      className="group/progress relative h-1 w-full cursor-pointer bg-neutral-200 transition-[height] hover:h-1.5 dark:bg-neutral-700"
      onClick={handleClick}
      onKeyDown={handleKeyDown}
    >
      <div
        className="absolute inset-y-0 left-0 bg-[var(--accent)] transition-[width]"
        style={{ width: `${progress}%` }}
      />
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
          className="flex h-8 w-8 items-center justify-center rounded-full text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200"
        >
          {volume > 0 ? (
            <Volume2 className="h-4 w-4" />
          ) : (
            <VolumeX className="h-4 w-4" />
          )}
        </button>
      </Tooltip>

      <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 rounded-lg bg-white p-2 opacity-0 shadow-lg transition-opacity group-hover/vol:pointer-events-auto group-hover/vol:opacity-100 dark:bg-neutral-800">
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
    currentTime,
    duration,
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
  } = useMusicPlayer();

  const [queueOpen, setQueueOpen] = useState(false);

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
        className="fixed inset-x-0 bottom-0 z-[880] flex flex-col border-t border-neutral-200 bg-white/95 backdrop-blur-md dark:border-neutral-700 dark:bg-neutral-900/95"
        style={{ height: `${MUSIC_MINI_PLAYER_HEIGHT_PX}px` }}
      >
        {/* Top progress bar */}
        <ProgressBar
          currentTime={currentTime}
          duration={duration}
          onSeek={seek}
        />

        {/* Controls row */}
        <div className="flex flex-1 items-center gap-2 px-3 lg:px-4">
          {/* Album art + track info */}
          <div className="flex min-w-0 flex-1 items-center gap-3 lg:flex-[2]">
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center overflow-hidden rounded-md bg-neutral-100 dark:bg-neutral-800">
              {coverUrl ? (
                <img
                  src={coverUrl}
                  alt={currentTrack.title}
                  className="h-full w-full object-cover"
                />
              ) : (
                <Music className="h-5 w-5 text-neutral-400 dark:text-neutral-500" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-neutral-900 dark:text-neutral-100">
                {currentTrack.title}
              </p>
              <p className="truncate text-xs text-neutral-500 dark:text-neutral-400">
                {currentTrack.artistName ?? "未知艺术家"}
              </p>
            </div>
          </div>

          {/* Playback controls */}
          <div className="flex items-center gap-1">
            <Tooltip title="上一首" mouseEnterDelay={0} mouseLeaveDelay={0}>
              <button
                type="button"
                onClick={previous}
                className="flex h-8 w-8 items-center justify-center rounded-full text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
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
                    ? "bg-neutral-400 dark:bg-neutral-600"
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
                className="flex h-8 w-8 items-center justify-center rounded-full text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
              >
                <SkipForward className="h-4 w-4" />
              </button>
            </Tooltip>
          </div>

          {/* Time display (hidden on small screens) */}
          <div className="hidden items-center gap-1 text-xs tabular-nums text-neutral-500 dark:text-neutral-400 md:flex">
            <span>{formatTime(currentTime)}</span>
            <span>/</span>
            <span>{formatTime(duration)}</span>
          </div>

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
                    : "text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200",
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
                    : "text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200",
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
                    : "text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200",
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
              className="flex h-8 w-8 items-center justify-center rounded-full text-neutral-500 hover:bg-red-500/10 hover:text-red-500 dark:text-neutral-400 dark:hover:text-red-400"
            >
              <X className="h-4 w-4" />
            </button>
          </Tooltip>
        </div>
      </div>

      <NowPlayingPanel open={queueOpen} onClose={() => setQueueOpen(false)} />
    </>
  );
}
