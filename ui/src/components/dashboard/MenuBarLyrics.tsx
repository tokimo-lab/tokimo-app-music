import { useEffect, useRef } from "react";
import { useMusicPlayerOptional } from "@/system";
import { useLyrics } from "../../hooks/useLyrics";

// ── Karaoke text — reads progressRef via RAF, zero re-renders ────────────────

function KaraokeText({
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
    <span className="relative inline-block max-w-full truncate text-xs">
      {/* invisible text to reserve width */}
      <span aria-hidden className="invisible">
        {text}
      </span>
      {/* base (muted) layer */}
      <span className="absolute inset-0 truncate text-[var(--text-muted)]">
        {text}
      </span>
      {/* highlighted (accent) layer — clipped by progress */}
      <span
        ref={clipRef}
        className="absolute inset-0 truncate text-[var(--accent)]"
      >
        {text}
      </span>
    </span>
  );
}

// ── MenuBar lyrics display ───────────────────────────────────────────────────

export function MenuBarLyrics() {
  const player = useMusicPlayerOptional();
  const trackId = player?.currentTrack?.id;
  const getCurrentTime = player?.getCurrentTime ?? (() => 0);

  const { lines, currentIdx, progressRef, hasSyncedLyrics } = useLyrics(
    trackId,
    getCurrentTime,
  );

  // Nothing to show if no player or no track
  if (!player?.currentTrack || !hasSyncedLyrics) return null;

  const track = player.currentTrack;
  const hasLyricLine = currentIdx >= 0 && currentIdx < lines.length;
  const lyricText = hasLyricLine ? lines[currentIdx].text : null;

  // Before the first lyric line appears, show "title · artist"
  const fallbackText = [track.title, track.artistName]
    .filter(Boolean)
    .join(" · ");

  const displayText = lyricText ?? fallbackText;

  return (
    <button
      type="button"
      className="mx-1 flex h-5 max-w-[260px] shrink items-center cursor-pointer overflow-hidden rounded px-1.5 transition-colors hover:bg-white/10"
      onClick={player.togglePlay}
      title={player.isPlaying ? "暂停" : "播放"}
    >
      {lyricText ? (
        <KaraokeText text={lyricText} progressRef={progressRef} />
      ) : (
        <span className="max-w-full truncate text-xs text-[var(--accent)]">
          {displayText}
        </span>
      )}
    </button>
  );
}
