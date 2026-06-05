import { posterThumbUrl } from "@tokimo/sdk";
import { cn } from "@tokimo/ui";
import {
  ChartNoAxesColumn,
  ChevronDown,
  Disc3,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
} from "lucide-react";
import {
  memo,
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useLyrics } from "../hooks/useLyrics";
import type { PlayerPrefs, PlayerVisualMode } from "../lib/types";
import { useUiPreference } from "../shared/hooks/hooks";
import { type RepeatMode, useMusicPlayer } from "../shell/hooks";
import { AudioVisualizer } from "./visualizer/AudioVisualizer";
import { CoverArtDisplay } from "./visualizer/CoverArtDisplay";
import { VisualizationPicker } from "./visualizer/VisualizationPicker";
import {
  type AlchemySceneInfo,
  AlchemyVisualizer,
  CircularVisualizer,
  DnaVisualizer,
  FlameVisualizer,
  KaleidoscopeVisualizer,
  MatrixVisualizer,
  MosaicVisualizer,
  ParticleVisualizer,
  RippleVisualizer,
  SpectrogramVisualizer,
  StarfieldVisualizer,
  TerrainVisualizer,
  TunnelVisualizer,
  WaveformVisualizer,
  WaveVisualizer,
} from "./visualizer/visualizations";

function getCoverUrl(coverPath: string | null | undefined): string | null {
  if (!coverPath) return null;
  if (coverPath.startsWith("http")) return coverPath;
  return posterThumbUrl(coverPath, 300) ?? null;
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// ── Karaoke text — reads progressRef via RAF, zero React re-renders ──────────

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
      <span className="text-neutral-300 dark:text-neutral-500">{text}</span>
      <span ref={clipRef} className="absolute inset-0 text-[var(--color-accent)]">
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

  // Auto-scroll to keep the active line centred
  useEffect(() => {
    if (!activeRef.current || !containerRef.current) return;
    const container = containerRef.current;
    const el = activeRef.current;
    const top = el.offsetTop - container.clientHeight / 2 + el.clientHeight / 2;
    container.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
  });

  if (lines.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-fg-muted">
        <p className="text-lg">暂无歌词</p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="hide-scrollbar h-full overflow-y-auto scroll-smooth px-4"
    >
      <div ref={topSpacerRef} className="shrink-0" />
      {lines.map((line, i) => {
        const isActive = i === currentIdx;
        return (
          <button
            key={`${line.time}-${line.text}`}
            ref={isActive ? activeRef : undefined}
            type="button"
            onClick={() => onSeek(line.time)}
            className={cn(
              "w-full cursor-pointer px-2 py-2.5 text-center transition-all duration-300",
              isActive
                ? "scale-105 text-lg font-bold"
                : "text-base font-normal text-fg-muted hover:text-neutral-200 dark:text-neutral-500 dark:hover:text-neutral-300",
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
    </div>
  );
}

// ── Vinyl disc ───────────────────────────────────────────────────────────────

function VinylDisc({
  coverUrl,
  isPlaying,
  title,
}: {
  coverUrl: string | null;
  isPlaying: boolean;
  title: string;
}) {
  return (
    <div className="relative flex items-center justify-center">
      {/* Outer disc */}
      <div
        className={cn(
          "relative h-72 w-72 rounded-full bg-gradient-to-br from-neutral-800 via-neutral-900 to-black shadow-2xl xl:h-80 xl:w-80",
          isPlaying ? "animate-[spin_8s_linear_infinite]" : "",
        )}
        style={{ animationPlayState: isPlaying ? "running" : "paused" }}
      >
        {/* Vinyl grooves */}
        <div className="absolute inset-3 rounded-full border border-neutral-700/30" />
        <div className="absolute inset-8 rounded-full border border-neutral-700/20" />
        <div className="absolute inset-14 rounded-full border border-neutral-700/30" />
        <div className="absolute inset-20 rounded-full border border-neutral-700/20" />

        {/* Centre label / album art */}
        <div className="absolute inset-0 m-auto flex h-36 w-36 items-center justify-center overflow-hidden rounded-full border-4 border-neutral-700 bg-neutral-800 xl:h-40 xl:w-40">
          {coverUrl ? (
            <img
              src={coverUrl}
              alt={title}
              className="h-full w-full object-cover"
            />
          ) : (
            <Disc3 className="h-16 w-16 text-fg-muted" />
          )}
        </div>

        {/* Centre hole */}
        <div className="absolute inset-0 m-auto h-4 w-4 rounded-full bg-neutral-950" />
      </div>
    </div>
  );
}

// ── Live seek bar — RAF + DOM manipulation, zero React re-renders ─────────────

function LiveSeekBar({
  getCurrentTime,
  getDuration,
  onSeek,
}: {
  getCurrentTime: () => number;
  getDuration: () => number;
  onSeek: (time: number) => void;
}) {
  const barRef = useRef<HTMLDivElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const elapsedRef = useRef<HTMLSpanElement>(null);
  const totalRef = useRef<HTMLSpanElement>(null);

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

  // RAF loop: update bar/thumb/text via DOM refs
  useEffect(() => {
    let raf: number;
    const tick = () => {
      const t = getCurrentTime();
      const d = getDuration();
      const pct = d > 0 ? (t / d) * 100 : 0;
      if (fillRef.current) fillRef.current.style.width = `${pct}%`;
      if (thumbRef.current) thumbRef.current.style.left = `${pct}%`;
      if (elapsedRef.current) elapsedRef.current.textContent = formatTime(t);
      if (totalRef.current) totalRef.current.textContent = formatTime(d);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [getCurrentTime, getDuration]);

  return (
    <div className="w-full px-1">
      <div
        ref={barRef}
        role="slider"
        tabIndex={0}
        aria-valuenow={0}
        aria-valuemin={0}
        aria-valuemax={100}
        className="group relative h-1.5 w-full cursor-pointer rounded-full bg-white/20"
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
          className="absolute inset-y-0 left-0 rounded-full bg-[var(--color-accent)]"
          style={{ width: "0%" }}
        />
        <div
          ref={thumbRef}
          className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white opacity-0 shadow-md transition-opacity group-hover:opacity-100"
          style={{ left: "0%" }}
        />
      </div>
      <div className="mt-1 flex justify-between text-xs text-white/50">
        <span ref={elapsedRef}>0:00</span>
        <span ref={totalRef}>0:00</span>
      </div>
    </div>
  );
}

// ── Isolated lyrics panel — its own RAF + useLyrics, won't re-render parent ──

const FullScreenLyrics = memo(function FullScreenLyrics({
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
        lines={lines}
        currentIdx={currentIdx}
        progressRef={progressRef}
        onSeek={onSeek}
      />
    );
  }

  if (plainText) {
    return (
      <div className="flex h-full items-start justify-center overflow-y-auto py-[20vh]">
        <p className="max-w-md whitespace-pre-wrap text-center text-base leading-relaxed text-fg-muted">
          {plainText}
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full items-center justify-center">
      <p className="text-lg text-fg-muted">暂无歌词</p>
    </div>
  );
});

// ── Main ─────────────────────────────────────────────────────────────────────

export function FullScreenPlayer({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const {
    currentTrack,
    isPlaying,
    isLoading,
    repeatMode,
    shuffleEnabled,
    togglePlay,
    next,
    previous,
    seek,
    setRepeatMode,
    toggleShuffle,
    getAnalyser,
    getCurrentTime,
    getDuration,
  } = useMusicPlayer();

  const playerPref = useUiPreference<PlayerPrefs>("player");
  const [visualMode, setVisualMode] = useState<PlayerVisualMode>(
    () => playerPref.data?.playerVisualMode ?? "vinyl",
  );

  const [coverBgEnabled, setCoverBgEnabled] = useState(
    () => playerPref.data?.playerCoverBg ?? true,
  );
  const [alchemyAmbient, setAlchemyAmbient] = useState(
    () => playerPref.data?.playerAlchemyAmbient ?? false,
  );

  const [pickerOpen, setPickerOpen] = useState(false);
  const [immersive, setImmersive] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [isNarrow, setIsNarrow] = useState(false);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Auto-hide controls in immersive mode
  const showControls = useCallback(() => {
    setControlsVisible(true);
    clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => {
      setControlsVisible(false);
    }, 3000);
  }, []);

  const handleDoubleClickVisual = useCallback(() => {
    setImmersive((prev) => {
      if (!prev) {
        // Entering immersive — start auto-hide timer
        setControlsVisible(true);
        clearTimeout(hideTimerRef.current);
        hideTimerRef.current = setTimeout(
          () => setControlsVisible(false),
          3000,
        );
      } else {
        // Leaving immersive — always show controls
        clearTimeout(hideTimerRef.current);
        setControlsVisible(true);
      }
      return !prev;
    });
  }, []);

  const handleSelectVisualMode = useCallback(
    (mode: PlayerVisualMode) => {
      setVisualMode(mode);
      playerPref.patch({ playerVisualMode: mode }).catch(() => {});
      setPickerOpen(false);
    },
    [playerPref],
  );

  const handleToggleCoverBg = useCallback(() => {
    setCoverBgEnabled((prev) => {
      const next = !prev;
      playerPref.patch({ playerCoverBg: next }).catch(() => {});
      return next;
    });
  }, [playerPref]);

  const handleToggleAlchemyAmbient = useCallback(() => {
    setAlchemyAmbient((prev) => {
      const next = !prev;
      playerPref.patch({ playerAlchemyAmbient: next }).catch(() => {});
      return next;
    });
  }, [playerPref]);

  // Read CSS --color-accent hex for canvas drawing
  const accentHex = useMemo(() => {
    if (typeof document === "undefined") return "#10b981";
    return (
      getComputedStyle(document.documentElement)
        .getPropertyValue("--color-accent")
        .trim() || "#10b981"
    );
  }, []);

  const cycleRepeat = useCallback(() => {
    const modes: RepeatMode[] = ["off", "all", "one"];
    const idx = modes.indexOf(repeatMode);
    setRepeatMode(modes[(idx + 1) % modes.length]);
  }, [repeatMode, setRepeatMode]);

  // ── Slide animation state machine ────────────────────────────────────────
  // closed → entering → open → leaving → closed
  type Phase = "closed" | "entering" | "open" | "leaving";
  const [phase, setPhase] = useState<Phase>("closed");
  const panelRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef(0);
  const safetyRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  useEffect(() => {
    const shouldBeOpen = open && !!currentTrack;
    if (shouldBeOpen) {
      clearTimeout(safetyRef.current);
      if (phase === "closed") {
        setPhase("entering");
      } else if (phase === "leaving") {
        // Reverse mid-leave — slide back up smoothly
        setPhase("open");
      }
    } else {
      if (phase === "open") {
        setPhase("leaving");
        // Safety: unmount even if transitionend never fires
        safetyRef.current = setTimeout(() => {
          setPhase((p) => (p === "leaving" ? "closed" : p));
        }, 500);
      } else if (phase === "entering") {
        // Never actually showed — skip straight to closed
        cancelAnimationFrame(rafRef.current);
        setPhase("closed");
      }
    }
  }, [open, currentTrack, phase]);

  // entering → open after browser has painted the initial translate-y-full
  useEffect(() => {
    if (phase === "entering") {
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = requestAnimationFrame(() => {
          setPhase("open");
        });
      });
    }
    return () => cancelAnimationFrame(rafRef.current);
  }, [phase]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      clearTimeout(safetyRef.current);
      clearTimeout(hideTimerRef.current);
    };
  }, []);

  const handleTransitionEnd = useCallback(() => {
    clearTimeout(safetyRef.current);
    setPhase((p) => (p === "leaving" ? "closed" : p));
  }, []);

  // Close on Escape
  useEffect(() => {
    if (phase === "closed") return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [phase, onClose]);

  // ── Debug FPS overlay (press D 5× quickly to toggle) ────────────────────
  const [debugVisible, setDebugVisible] = useState(false);
  const debugTapsRef = useRef<number[]>([]);
  const debugRafRef = useRef(0);
  const debugStatsRef = useRef({
    fps: 0,
    frameTime: 0,
    minFrame: 999,
    maxFrame: 0,
    spikes: 0,
    renders: 0,
    lastRenderCount: 0,
    rps: 0,
  });
  const debugDisplayRef = useRef<HTMLPreElement>(null);
  const renderCountRef = useRef(0);
  const alchemyInfoRef = useRef<AlchemySceneInfo | null>(null);
  renderCountRef.current++;

  useEffect(() => {
    if (phase === "closed") return;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "d" && e.key !== "D") return;
      const now = Date.now();
      const taps = debugTapsRef.current;
      taps.push(now);
      // Keep only taps within last 2 seconds
      while (taps.length > 0 && now - taps[0] > 2000) taps.shift();
      if (taps.length >= 5) {
        taps.length = 0;
        setDebugVisible((v) => !v);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [phase]);

  useEffect(() => {
    if (!debugVisible) return;

    const stats = debugStatsRef.current;
    let lastTime = performance.now();
    let frameCount = 0;
    let frameTimeSum = 0;
    let lastSecond = performance.now();
    stats.minFrame = 999;
    stats.maxFrame = 0;
    stats.spikes = 0;

    const tick = () => {
      const now = performance.now();
      const dt = now - lastTime;
      lastTime = now;
      frameCount++;
      frameTimeSum += dt;

      if (dt < stats.minFrame) stats.minFrame = dt;
      if (dt > stats.maxFrame) stats.maxFrame = dt;
      if (dt > 50) stats.spikes++;

      if (now - lastSecond >= 1000) {
        stats.fps = frameCount;
        stats.frameTime = frameTimeSum / frameCount;
        stats.rps = renderCountRef.current - stats.lastRenderCount;
        stats.lastRenderCount = renderCountRef.current;
        frameCount = 0;
        frameTimeSum = 0;
        lastSecond = now;

        if (debugDisplayRef.current) {
          let text =
            `FPS: ${stats.fps}\n` +
            `Frame: ${stats.frameTime.toFixed(1)}ms` +
            ` (min ${stats.minFrame.toFixed(1)}` +
            ` / max ${stats.maxFrame.toFixed(1)})\n` +
            `Spikes (>50ms): ${stats.spikes}\n` +
            `React renders/s: ${stats.rps}\n` +
            `Total renders: ${renderCountRef.current}\n` +
            `Mode: ${visualMode}`;
          const ai = alchemyInfoRef.current;
          if (visualMode === "alchemy" && ai) {
            text +=
              `\nScene: ${ai.scene}` +
              ` (${Math.round((ai.sceneTimer / 900) * 100)}%)`;
            if (ai.nextScene) {
              text +=
                `\n→ ${ai.nextScene}` +
                ` (fade ${Math.round(ai.fadePct * 100)}%)`;
            }
          }
          debugDisplayRef.current.textContent = text;
        }
        stats.minFrame = 999;
        stats.maxFrame = 0;
        stats.spikes = 0;
      }

      debugRafRef.current = requestAnimationFrame(tick);
    };
    debugRafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(debugRafRef.current);
  }, [debugVisible, visualMode]);

  // Find the FloatingWindow container so we can portal to it
  // and cover the entire window including its title bar
  const [windowContainer, setWindowContainer] = useState<HTMLElement | null>(
    null,
  );
  const anchorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (phase === "closed") {
      setWindowContainer(null);
      return;
    }
    // Use anchorRef (always rendered inline) to find the window container
    const el = anchorRef.current?.closest<HTMLElement>("[data-window-id]");
    if (el && el !== windowContainer) setWindowContainer(el);
  }, [phase, windowContainer]);

  // Track panel width for responsive layout (hide visual in narrow windows)
  useEffect(() => {
    const el = panelRef.current;
    if (!el || phase === "closed") return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      setIsNarrow(w < 640);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [phase]);

  if (phase === "closed" || !currentTrack) return null;

  const coverUrl = getCoverUrl(currentTrack.coverPath);
  const RepeatIcon = repeatMode === "one" ? Repeat1 : Repeat;

  // Shared visualizer element
  const visualizerElement = (
    <>
      {visualMode === "vinyl" && (
        <VinylDisc
          coverUrl={coverUrl}
          isPlaying={isPlaying}
          title={currentTrack.title}
        />
      )}
      {visualMode === "bars" && (
        <AudioVisualizer
          getAnalyser={getAnalyser}
          isPlaying={isPlaying}
          accentColor={accentHex}
        />
      )}
      {visualMode === "waveform" && (
        <WaveformVisualizer
          getAnalyser={getAnalyser}
          isPlaying={isPlaying}
          accentColor={accentHex}
        />
      )}
      {visualMode === "circular" && (
        <CircularVisualizer
          getAnalyser={getAnalyser}
          isPlaying={isPlaying}
          accentColor={accentHex}
        />
      )}
      {visualMode === "particles" && (
        <ParticleVisualizer
          getAnalyser={getAnalyser}
          isPlaying={isPlaying}
          accentColor={accentHex}
        />
      )}
      {visualMode === "wave" && (
        <WaveVisualizer
          getAnalyser={getAnalyser}
          isPlaying={isPlaying}
          accentColor={accentHex}
        />
      )}
      {visualMode === "spectrogram" && (
        <SpectrogramVisualizer
          getAnalyser={getAnalyser}
          isPlaying={isPlaying}
          accentColor={accentHex}
        />
      )}
      {visualMode === "terrain" && (
        <TerrainVisualizer
          getAnalyser={getAnalyser}
          isPlaying={isPlaying}
          accentColor={accentHex}
        />
      )}
      {visualMode === "matrix" && (
        <MatrixVisualizer
          getAnalyser={getAnalyser}
          isPlaying={isPlaying}
          accentColor={accentHex}
        />
      )}
      {visualMode === "kaleidoscope" && (
        <KaleidoscopeVisualizer
          getAnalyser={getAnalyser}
          isPlaying={isPlaying}
          accentColor={accentHex}
        />
      )}
      {visualMode === "starfield" && (
        <StarfieldVisualizer
          getAnalyser={getAnalyser}
          isPlaying={isPlaying}
          accentColor={accentHex}
        />
      )}
      {visualMode === "ripple" && (
        <RippleVisualizer
          getAnalyser={getAnalyser}
          isPlaying={isPlaying}
          accentColor={accentHex}
        />
      )}
      {visualMode === "flame" && (
        <FlameVisualizer
          getAnalyser={getAnalyser}
          isPlaying={isPlaying}
          accentColor={accentHex}
        />
      )}
      {visualMode === "dna" && (
        <DnaVisualizer
          getAnalyser={getAnalyser}
          isPlaying={isPlaying}
          accentColor={accentHex}
        />
      )}
      {visualMode === "mosaic" && (
        <MosaicVisualizer
          getAnalyser={getAnalyser}
          isPlaying={isPlaying}
          accentColor={accentHex}
        />
      )}
      {visualMode === "tunnel" && (
        <TunnelVisualizer
          getAnalyser={getAnalyser}
          isPlaying={isPlaying}
          accentColor={accentHex}
        />
      )}
      {visualMode === "alchemy" && (
        <AlchemyVisualizer
          getAnalyser={getAnalyser}
          isPlaying={isPlaying}
          accentColor={accentHex}
          ambientBgEnabled={alchemyAmbient}
          onSceneInfo={(info) => {
            alchemyInfoRef.current = info;
          }}
        />
      )}
      {visualMode === "cover" && (
        <CoverArtDisplay
          coverUrl={coverUrl}
          isPlaying={isPlaying}
          title={currentTrack.title}
        />
      )}
    </>
  );

  const player = (
    <div
      ref={panelRef}
      onTransitionEnd={handleTransitionEnd}
      className={cn(
        "pointer-events-none absolute inset-0 z-[100] flex flex-col overflow-hidden bg-black/95 text-white backdrop-blur-2xl transition-transform duration-400 ease-out",
        phase === "open" ? "translate-y-0" : "translate-y-full",
      )}
    >
      {/* Cover atmosphere background — frosted glass effect */}
      {coverBgEnabled && coverUrl && (
        <>
          <div
            className="absolute inset-0 scale-110 bg-cover bg-center"
            style={{ backgroundImage: `url(${coverUrl})` }}
          />
          <div className="absolute inset-0 bg-black/60 backdrop-blur-[80px]" />
        </>
      )}

      {/* Debug FPS overlay — press D 5× to toggle */}
      {debugVisible && (
        <pre
          ref={debugDisplayRef}
          className="absolute left-4 top-16 z-50 rounded-lg bg-black/80 px-3 py-2 font-mono text-xs leading-relaxed text-green-400 backdrop-blur-sm"
        >
          Measuring...
        </pre>
      )}

      {/* Header: pointer-events-none lets drag pass through to FloatingWindow title bar */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: click blocker below title bar */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: decorative click blocker */}
      <div
        className="pointer-events-auto absolute inset-x-0 top-9 bottom-0 z-[1]"
        onClick={(e) => e.stopPropagation()}
      />
      <div
        className={cn(
          "relative z-20 flex items-center justify-between px-6 py-4 transition-opacity duration-500",
          immersive && !controlsVisible && "pointer-events-none opacity-0",
        )}
      >
        <button
          type="button"
          onClick={onClose}
          className="pointer-events-auto flex h-10 w-10 items-center justify-center rounded-full text-white/60 transition-colors hover:bg-white/10 hover:text-white"
        >
          <ChevronDown className="h-6 w-6" />
        </button>
        <div className="text-center">
          <p className="text-xs text-white/50 uppercase tracking-wider">
            正在播放
          </p>
        </div>
        {/* Visual mode toggle */}
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          title="切换可视化效果"
          className="pointer-events-auto flex h-10 w-10 items-center justify-center rounded-full text-white/60 transition-colors hover:bg-white/10 hover:text-white"
        >
          <ChartNoAxesColumn className="h-5 w-5" />
        </button>
        <VisualizationPicker
          open={pickerOpen}
          currentMode={visualMode}
          onSelect={handleSelectVisualMode}
          coverBgEnabled={coverBgEnabled}
          onToggleCoverBg={handleToggleCoverBg}
          alchemyAmbientEnabled={alchemyAmbient}
          onToggleAlchemyAmbient={handleToggleAlchemyAmbient}
          onClose={() => setPickerOpen(false)}
          container={panelRef.current}
        />
      </div>

      {/* Body */}
      {immersive ? (
        // biome-ignore lint/a11y/noStaticElementInteractions: double-click for immersive toggle + mouse move for auto-hide
        <div
          className="pointer-events-auto absolute inset-0 z-0"
          onDoubleClick={handleDoubleClickVisual}
          onMouseMove={showControls}
        >
          {/* Full-viewport visualizer */}
          <div className="[&>*]:!h-full [&>*]:!w-full [&>*]:!rounded-none [&>canvas]:!h-full [&>canvas]:!w-full [&>canvas]:!rounded-none h-full w-full">
            {visualizerElement}
          </div>

          {/* Overlay: track info + controls — fade on idle */}
          <div
            className={cn(
              "absolute inset-x-0 bottom-0 z-20 flex flex-col items-center gap-3 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-8 pb-6 pt-24 transition-opacity duration-500",
              controlsVisible ? "opacity-100" : "opacity-0 pointer-events-none",
            )}
          >
            {/* Track info */}
            <div className="w-full max-w-2xl text-center">
              <h2 className="truncate text-xl font-bold text-white drop-shadow-lg">
                {currentTrack.title}
              </h2>
              <p className="mt-0.5 truncate text-sm text-white/60">
                {currentTrack.artistName ?? "未知艺术家"}
                {currentTrack.albumTitle && (
                  <span className="text-white/40">
                    {" "}
                    · {currentTrack.albumTitle}
                  </span>
                )}
              </p>
            </div>
            {/* Seek bar */}
            <div className="w-full max-w-2xl">
              <LiveSeekBar
                getCurrentTime={getCurrentTime}
                getDuration={getDuration}
                onSeek={seek}
              />
            </div>
            {/* Playback controls */}
            <div className="flex items-center gap-6">
              <button
                type="button"
                onClick={toggleShuffle}
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-full",
                  shuffleEnabled
                    ? "text-[var(--color-accent)]"
                    : "text-white/40 hover:text-white/70",
                )}
              >
                <Shuffle className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={previous}
                className="flex h-10 w-10 items-center justify-center text-white/80 hover:text-white"
              >
                <SkipBack className="h-6 w-6" />
              </button>
              <button
                type="button"
                onClick={togglePlay}
                disabled={isLoading}
                className={cn(
                  "flex h-14 w-14 items-center justify-center rounded-full",
                  isLoading
                    ? "bg-white/20"
                    : "bg-[var(--color-accent)] hover:opacity-90",
                )}
              >
                {isPlaying ? (
                  <Pause className="h-6 w-6" />
                ) : (
                  <Play className="h-6 w-6 translate-x-[2px]" />
                )}
              </button>
              <button
                type="button"
                onClick={next}
                className="flex h-10 w-10 items-center justify-center text-white/80 hover:text-white"
              >
                <SkipForward className="h-6 w-6" />
              </button>
              <button
                type="button"
                onClick={cycleRepeat}
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-full",
                  repeatMode !== "off"
                    ? "text-[var(--color-accent)]"
                    : "text-white/40 hover:text-white/70",
                )}
              >
                <RepeatIcon className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* ── Normal mode: left visual + right lyrics ──────────────── */
        <>
          <div className="pointer-events-auto relative z-10 flex flex-1 items-center gap-8 overflow-hidden px-8 lg:px-16">
            {/* Left: visual display + track info (hidden when narrow) */}
            {!isNarrow && (
              <div
                className="flex flex-col items-center gap-8 flex-shrink-0"
                style={{ width: "40%" }}
              >
                {/* Double-click to enter immersive */}
                {/* biome-ignore lint/a11y/noStaticElementInteractions: double-click to enter immersive */}
                <div onDoubleClick={handleDoubleClickVisual} className="w-full">
                  {visualizerElement}
                </div>
                <div className="w-full text-center">
                  <h2 className="truncate text-2xl font-bold text-white">
                    {currentTrack.title}
                  </h2>
                  <p className="mt-1 truncate text-base text-white/60">
                    {currentTrack.artistName ?? "未知艺术家"}
                    {currentTrack.albumTitle && (
                      <span className="text-white/40">
                        {" "}
                        · {currentTrack.albumTitle}
                      </span>
                    )}
                  </p>
                </div>
              </div>
            )}

            {/* Right: lyrics */}
            <div className="h-full flex-1 min-w-0">
              <FullScreenLyrics
                trackId={currentTrack?.id}
                getCurrentTime={getCurrentTime}
                onSeek={seek}
              />
            </div>
          </div>

          {/* Footer: seek bar + controls */}
          <div className="pointer-events-auto relative z-10 flex flex-col items-center gap-4 px-8 pb-8 lg:px-16">
            {/* Track info shown in footer when narrow */}
            {isNarrow && (
              <div className="w-full max-w-2xl text-center">
                <h2 className="truncate text-xl font-bold text-white">
                  {currentTrack.title}
                </h2>
                <p className="mt-0.5 truncate text-sm text-white/60">
                  {currentTrack.artistName ?? "未知艺术家"}
                  {currentTrack.albumTitle && (
                    <span className="text-white/40">
                      {" "}
                      · {currentTrack.albumTitle}
                    </span>
                  )}
                </p>
              </div>
            )}
            <div className="w-full max-w-2xl">
              <LiveSeekBar
                getCurrentTime={getCurrentTime}
                getDuration={getDuration}
                onSeek={seek}
              />
            </div>

            <div className="flex items-center gap-6">
              <button
                type="button"
                onClick={toggleShuffle}
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-full",
                  shuffleEnabled
                    ? "text-[var(--color-accent)]"
                    : "text-white/40 hover:text-white/70",
                )}
              >
                <Shuffle className="h-5 w-5" />
              </button>

              <button
                type="button"
                onClick={previous}
                className="flex h-10 w-10 items-center justify-center text-white/80 hover:text-white"
              >
                <SkipBack className="h-6 w-6" />
              </button>

              <button
                type="button"
                onClick={togglePlay}
                disabled={isLoading}
                className={cn(
                  "flex h-14 w-14 items-center justify-center rounded-full",
                  isLoading
                    ? "bg-white/20"
                    : "bg-[var(--color-accent)] hover:opacity-90",
                )}
              >
                {isPlaying ? (
                  <Pause className="h-6 w-6" />
                ) : (
                  <Play className="h-6 w-6 translate-x-[2px]" />
                )}
              </button>

              <button
                type="button"
                onClick={next}
                className="flex h-10 w-10 items-center justify-center text-white/80 hover:text-white"
              >
                <SkipForward className="h-6 w-6" />
              </button>

              <button
                type="button"
                onClick={cycleRepeat}
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-full",
                  repeatMode !== "off"
                    ? "text-[var(--color-accent)]"
                    : "text-white/40 hover:text-white/70",
                )}
              >
                <RepeatIcon className="h-5 w-5" />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );

  // Portal to the FloatingWindow container to cover the title bar;
  // the hidden anchor stays inline so `.closest()` can find the container
  return (
    <>
      <div ref={anchorRef} className="hidden" />
      {windowContainer ? createPortal(player, windowContainer) : player}
    </>
  );
}
