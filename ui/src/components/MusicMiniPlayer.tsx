import { posterThumbUrl } from "@tokimo/sdk";
import { cn, cssVar, TOKEN, Tooltip } from "@tokimo/ui";
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
import { type RepeatMode, useMusicPlayer } from "../shell/hooks";
import { FullScreenPlayer } from "./FullScreenPlayer";
import { NowPlayingPanel } from "./NowPlayingPanel";
import { MiniPlaybackLyrics } from "./playback/MiniPlaybackLyrics";
import { PlaybackSeekBar } from "./playback/PlaybackSeekBar";

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
    const tick = () => {
      if (elapsedRef.current)
        elapsedRef.current.textContent = formatTime(getCurrentTime());
      if (totalRef.current)
        totalRef.current.textContent = formatTime(getDuration());
    };
    tick();
    const timer = window.setInterval(tick, 250);
    return () => window.clearInterval(timer);
  }, [getCurrentTime, getDuration]);

  return (
    <div className="hidden items-center gap-1 text-xs tabular-nums text-[var(--color-fg-muted)] md:flex">
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
          className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-[var(--color-fg-muted)] hover:text-[var(--color-fg-primary)]"
        >
          {volume > 0 ? (
            <Volume2 className="h-4 w-4" />
          ) : (
            <VolumeX className="h-4 w-4" />
          )}
        </button>
      </Tooltip>

      <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 rounded-lg bg-[var(--color-surface-raised)] p-2 opacity-0 shadow-lg transition-opacity group-hover/vol:pointer-events-auto group-hover/vol:opacity-100">
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          onChange={(e) => onVolumeChange(Number.parseFloat(e.target.value))}
          className="h-24 w-1 cursor-pointer accent-[var(--color-accent)] [writing-mode:vertical-lr] [direction:rtl]"
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
  useEffect(() => {
    if (!currentTrack) {
      setQueueOpen(false);
      setFullScreen(false);
    }
  }, [currentTrack]);

  const miniRef = useRef<HTMLDivElement>(null);
  const [playerWidth, setPlayerWidth] = useState(0);
  useEffect(() => {
    const mini = miniRef.current;
    if (!mini || !currentTrack) return;
    const update = () => setPlayerWidth(mini.clientWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(mini);
    return () => observer.disconnect();
  }, [currentTrack]);
  const compact = playerWidth < 640;
  const expanded = playerWidth >= 1024;

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
        ref={miniRef}
        className="app-safe-area-bottom relative flex shrink-0 flex-col border-t border-border-base bg-[var(--color-surface-overlay)] backdrop-blur-md select-none"
        style={{
          height: `calc(${MUSIC_MINI_PLAYER_HEIGHT_PX}px + ${cssVar(TOKEN.appSafeAreaBottom)})`,
        }}
      >
        {/* Top progress bar */}
        <PlaybackSeekBar
          compact
          interactive={!compact}
          playing={isPlaying}
          getCurrentTime={getCurrentTime}
          getDuration={getDuration}
          onSeek={seek}
        />

        {/* Controls row */}
        <div className="flex flex-1 items-center gap-2 px-3 pt-1 lg:px-4">
          {/* Album art (click to open full-screen) + track info */}
          <button
            type="button"
            onClick={() => setFullScreen(true)}
            aria-label={`打开播放器：${currentTrack.title}`}
            className="flex min-h-11 min-w-0 flex-1 cursor-pointer items-center gap-3 text-left lg:flex-[2]"
          >
            <span className="flex h-12 w-12 flex-shrink-0 items-center justify-center overflow-hidden rounded-md bg-fill-tertiary">
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
                    "h-6 w-6 text-[var(--color-fg-muted)]",
                    isPlaying && "animate-[spin_3s_linear_infinite]",
                  )}
                />
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-[var(--color-fg-primary)]">
                {currentTrack.title}
              </span>
              <span className="block truncate text-xs text-[var(--color-fg-muted)]">
                {currentTrack.artistName ?? "未知艺术家"}
              </span>
            </span>
          </button>

          {expanded && !fullScreen && (
            <MiniPlaybackLyrics
              trackId={currentTrack.id}
              getCurrentTime={getCurrentTime}
            />
          )}

          {/* Playback controls */}
          <div className="flex items-center gap-1">
            <Tooltip title="上一首" mouseEnterDelay={0} mouseLeaveDelay={0}>
              <button
                type="button"
                onClick={previous}
                aria-label="上一首"
                className={cn(
                  "h-8 w-8 cursor-pointer items-center justify-center rounded-full text-fg-secondary hover:text-fg-primary",
                  compact ? "hidden" : "flex",
                )}
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
                aria-label={isPlaying ? "暂停" : "播放"}
                disabled={isLoading}
                className={cn(
                  "flex cursor-pointer items-center justify-center rounded-full text-fg-on-accent",
                  compact ? "h-11 w-11" : "h-9 w-9",
                  isLoading
                    ? "bg-[var(--color-fg-muted)]"
                    : "bg-[var(--color-accent)] hover:opacity-90",
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
                aria-label="下一首"
                className={cn(
                  "h-8 w-8 cursor-pointer items-center justify-center rounded-full text-fg-secondary hover:text-fg-primary",
                  compact ? "hidden" : "flex",
                )}
              >
                <SkipForward className="h-4 w-4" />
              </button>
            </Tooltip>
          </div>

          {/* Time display (hidden on small screens) */}
          {!compact && (
            <LiveTimeDisplay
              getCurrentTime={getCurrentTime}
              getDuration={getDuration}
            />
          )}

          {/* Right side controls */}
          <div
            className={cn("items-center gap-0.5", expanded ? "flex" : "hidden")}
          >
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
                  "flex h-8 w-8 cursor-pointer items-center justify-center rounded-full",
                  shuffleEnabled
                    ? "text-[var(--color-accent)]"
                    : "text-[var(--color-fg-muted)] hover:text-[var(--color-fg-secondary)]",
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
                  "flex h-8 w-8 cursor-pointer items-center justify-center rounded-full",
                  repeatMode !== "off"
                    ? "text-[var(--color-accent)]"
                    : "text-[var(--color-fg-muted)] hover:text-[var(--color-fg-secondary)]",
                )}
              >
                <RepeatIcon className="h-4 w-4" />
              </button>
            </Tooltip>
          </div>

          <Tooltip title="播放队列" mouseEnterDelay={0} mouseLeaveDelay={0}>
            <button
              type="button"
              onClick={() => setQueueOpen((v) => !v)}
              aria-label="播放队列"
              aria-expanded={queueOpen}
              className={cn(
                "flex cursor-pointer items-center justify-center rounded-full",
                compact ? "h-11 w-11" : "h-8 w-8",
                queueOpen
                  ? "text-[var(--color-accent)]"
                  : "text-[var(--color-fg-muted)] hover:text-[var(--color-fg-secondary)]",
              )}
            >
              <ListMusic className="h-4 w-4" />
            </button>
          </Tooltip>
          {/* Close button */}
          <Tooltip title="关闭" mouseEnterDelay={0} mouseLeaveDelay={0}>
            <button
              type="button"
              onClick={clearQueue}
              aria-label="停止播放并清空队列"
              className={cn(
                "h-8 w-8 cursor-pointer items-center justify-center rounded-full text-fg-muted hover:bg-state-danger-base hover:text-state-danger-text",
                compact ? "hidden" : "flex",
              )}
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
