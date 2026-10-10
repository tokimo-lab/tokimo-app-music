import { useEffect, useRef } from "react";
import { useLyrics } from "../../hooks/useLyrics";

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
    <span className="relative inline-block max-w-full truncate text-sm text-[var(--color-fg-muted)]">
      <span aria-hidden className="invisible">
        {text}
      </span>
      <span className="absolute inset-0 truncate text-[var(--color-fg-muted)]">
        {text}
      </span>
      <span
        ref={clipRef}
        className="absolute inset-0 truncate text-[var(--color-accent)]"
      >
        {text}
      </span>
    </span>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

export function MiniPlaybackLyrics({
  trackId,
  getCurrentTime,
}: {
  trackId: string;
  getCurrentTime: () => number;
}) {
  const { lines, currentIdx, progressRef, plainText } = useLyrics(
    trackId,
    getCurrentTime,
  );
  const lyricText =
    (currentIdx >= 0 ? lines[currentIdx]?.text : null) ??
    plainText?.split("\n").find((line) => line.trim());
  return lyricText ? (
    <div className="flex min-w-0 flex-1 items-center justify-center overflow-hidden">
      <MiniKaraokeText text={lyricText} progressRef={progressRef} />
    </div>
  ) : null;
}
