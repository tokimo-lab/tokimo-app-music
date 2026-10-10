import { cn } from "@tokimo/ui";
import { memo, type RefObject, useEffect, useRef, useState } from "react";
import { useLyrics } from "../../hooks/useLyrics";

function KaraokeText({
  text,
  progressRef,
}: {
  text: string;
  progressRef: RefObject<number>;
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
    <span className="relative inline-block">
      <span className="text-white/60">{text}</span>
      <span
        ref={clipRef}
        className="absolute inset-0 text-[var(--color-accent)]"
      >
        {text}
      </span>
    </span>
  );
}

// ── Lyrics panel ─────────────────────────────────────────────────────────────

function LyricsScroller({
  lines,
  currentIdx,
  progressRef,
  onSeek,
}: {
  lines: { time: number; text: string }[];
  currentIdx: number;
  progressRef: RefObject<number>;
  onSeek: (time: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);
  const topSpacerRef = useRef<HTMLDivElement>(null);
  const bottomSpacerRef = useRef<HTMLDivElement>(null);

  // Keep spacer heights in sync with container size so the first/last line
  // can be scrolled to the visual centre regardless of window dimensions.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const update = () => {
      const half = `${Math.floor(container.clientHeight / 2)}px`;
      if (topSpacerRef.current) topSpacerRef.current.style.height = half;
      if (bottomSpacerRef.current) bottomSpacerRef.current.style.height = half;
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const [following, setFollowing] = useState(true);
  const resumeRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const pauseFollowing = () => {
    setFollowing(false);
    clearTimeout(resumeRef.current);
    resumeRef.current = setTimeout(() => setFollowing(true), 6000);
  };
  useEffect(() => () => clearTimeout(resumeRef.current), []);

  // Only follow a newly active line; manual browsing gets a pause.
  useEffect(() => {
    if (
      currentIdx < 0 ||
      !following ||
      !activeRef.current ||
      !containerRef.current
    )
      return;
    const container = containerRef.current;
    const el = activeRef.current;
    const top = el.offsetTop - container.clientHeight / 2 + el.clientHeight / 2;
    container.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
  }, [currentIdx, following]);

  if (lines.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-fg-muted">
        <p className="text-lg">暂无歌词</p>
      </div>
    );
  }

  return (
    <div className="relative h-full min-h-0">
      {!following && (
        <button
          type="button"
          onClick={() => {
            clearTimeout(resumeRef.current);
            setFollowing(true);
          }}
          className="absolute right-3 top-3 z-10 min-h-11 cursor-pointer rounded-full bg-surface-overlay px-4 text-sm text-fg-primary shadow-lg"
        >
          回到当前歌词
        </button>
      )}
      <section
        ref={containerRef}
        aria-label="歌词"
        onPointerMove={(event) => {
          if (event.pointerType === "touch" && event.buttons) pauseFollowing();
        }}
        onWheel={pauseFollowing}
        onPointerDown={pauseFollowing}
        onKeyDown={(event) => {
          if (
            [
              "ArrowDown",
              "ArrowUp",
              "PageDown",
              "PageUp",
              "Home",
              "End",
            ].includes(event.key)
          )
            pauseFollowing();
        }}
        className="hide-scrollbar relative h-full overflow-y-auto scroll-smooth px-4"
      >
        <div ref={topSpacerRef} className="shrink-0" />
        {lines.map((line, i) => {
          const isActive = i === currentIdx;
          return (
            <button
              key={`${line.time}-${line.text}`}
              ref={isActive ? activeRef : undefined}
              type="button"
              onClick={() => {
                clearTimeout(resumeRef.current);
                setFollowing(true);
                onSeek(line.time);
              }}
              className={cn(
                "w-full cursor-pointer px-2 py-2.5 text-center transition-all duration-300",
                isActive
                  ? "scale-105 text-lg font-bold"
                  : "text-base font-normal text-white/50 hover:text-white/80",
              )}
            >
              {isActive ? (
                <KaraokeText text={line.text} progressRef={progressRef} />
              ) : (
                line.text
              )}
            </button>
          );
        })}
        <div ref={bottomSpacerRef} className="shrink-0" />
      </section>
    </div>
  );
}

export const FullScreenLyrics = memo(function FullScreenLyrics({
  trackId,
  getCurrentTime,
  onSeek,
}: {
  trackId: string | null | undefined;
  getCurrentTime: () => number;
  onSeek: (time: number) => void;
}) {
  const { lines, currentIdx, progressRef, hasSyncedLyrics, plainText } =
    useLyrics(trackId, getCurrentTime);

  if (hasSyncedLyrics) {
    return (
      <LyricsScroller
        key={trackId}
        lines={lines}
        currentIdx={currentIdx}
        progressRef={progressRef}
        onSeek={onSeek}
      />
    );
  }

  if (plainText) {
    return (
      <div className="flex h-full items-start justify-center overflow-y-auto px-4 py-12">
        <p className="max-w-md whitespace-pre-wrap text-center text-base leading-relaxed text-white/60">
          {plainText}
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full items-center justify-center">
      <p className="text-lg text-white/60">暂无歌词</p>
    </div>
  );
});
