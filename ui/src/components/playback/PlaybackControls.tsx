import { cn } from "@tokimo/ui";
import {
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
} from "lucide-react";
import { type RepeatMode, useMusicPlayer } from "../../shell/hooks";

export function PlaybackControls() {
  const {
    isPlaying,
    isLoading,
    repeatMode,
    shuffleEnabled,
    togglePlay,
    previous,
    next,
    toggleShuffle,
    setRepeatMode,
  } = useMusicPlayer();
  const cycleRepeat = () => {
    const modes: RepeatMode[] = ["off", "all", "one"];
    setRepeatMode(modes[(modes.indexOf(repeatMode) + 1) % modes.length]);
  };
  const RepeatIcon = repeatMode === "one" ? Repeat1 : Repeat;
  const repeatLabel =
    repeatMode === "off" ? "关闭" : repeatMode === "all" ? "全部" : "单曲";
  return (
    <div className="flex w-full max-w-sm items-center justify-between gap-1">
      <button
        type="button"
        onClick={toggleShuffle}
        aria-label={`随机播放：${shuffleEnabled ? "开启" : "关闭"}`}
        aria-pressed={shuffleEnabled}
        className={cn(
          "flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full",
          shuffleEnabled ? "text-accent" : "text-white/60 hover:text-white",
        )}
      >
        <Shuffle className="h-5 w-5" />
      </button>
      <button
        type="button"
        onClick={previous}
        aria-label="上一首"
        className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center text-white/80 hover:text-white"
      >
        <SkipBack className="h-6 w-6" />
      </button>
      <button
        type="button"
        onClick={togglePlay}
        disabled={isLoading}
        aria-label={isPlaying ? "暂停" : "播放"}
        className="flex h-14 w-14 shrink-0 cursor-pointer items-center justify-center rounded-full bg-accent text-fg-on-accent hover:opacity-90 disabled:opacity-50"
      >
        {isPlaying ? (
          <Pause className="h-6 w-6" />
        ) : (
          <Play className="h-6 w-6 translate-x-0.5" />
        )}
      </button>
      <button
        type="button"
        onClick={next}
        aria-label="下一首"
        className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center text-white/80 hover:text-white"
      >
        <SkipForward className="h-6 w-6" />
      </button>
      <button
        type="button"
        onClick={cycleRepeat}
        aria-label={`循环播放：${repeatLabel}`}
        aria-pressed={repeatMode !== "off"}
        className={cn(
          "flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full",
          repeatMode !== "off"
            ? "text-accent"
            : "text-white/60 hover:text-white",
        )}
      >
        <RepeatIcon className="h-5 w-5" />
      </button>
    </div>
  );
}
