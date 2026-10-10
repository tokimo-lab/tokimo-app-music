import { Volume2, VolumeX } from "lucide-react";
import { useRef } from "react";
import { useMusicPlayer } from "../../shell/hooks";

export function PlaybackVolumeControl() {
  const { volume, setVolume } = useMusicPlayer();
  const previousVolume = useRef(0.8);
  const toggleMute = () => {
    if (volume > 0) {
      previousVolume.current = volume;
      setVolume(0);
    } else setVolume(previousVolume.current);
  };
  return (
    <div className="flex w-full max-w-sm items-center gap-3">
      <button
        type="button"
        onClick={toggleMute}
        aria-label={volume > 0 ? "静音" : "取消静音"}
        aria-pressed={volume === 0}
        className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-white/70 hover:bg-white/10"
      >
        {volume > 0 ? (
          <Volume2 className="h-5 w-5" />
        ) : (
          <VolumeX className="h-5 w-5" />
        )}
      </button>
      <input
        type="range"
        aria-label="音量"
        aria-valuetext={`${Math.round(volume * 100)}%`}
        min={0}
        max={1}
        step={0.01}
        value={volume}
        onChange={(event) => setVolume(Number(event.target.value))}
        className="h-11 min-w-0 flex-1 cursor-pointer accent-accent"
      />
    </div>
  );
}
