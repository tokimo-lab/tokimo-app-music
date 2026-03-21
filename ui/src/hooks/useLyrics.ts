import { type RefObject, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../generated/rust-api";
import {
  currentLineIndex,
  type LrcLine,
  lineProgress,
  parseLrc,
} from "../lib/lrc-parser";

interface UseLyricsResult {
  lines: LrcLine[];
  currentIdx: number;
  /** Ref-based progress (0–1) for karaoke fill — updated every frame, no re-render. */
  progressRef: RefObject<number>;
  plainText: string | null;
  isLoading: boolean;
  hasSyncedLyrics: boolean;
}

/**
 * Fetches lyrics for a track and keeps the active-line index in sync with
 * the player's current time via an internal RAF loop.
 *
 * `getCurrentTime` should be a stable callback (e.g. from context ref getter)
 * to avoid restarting the RAF loop.
 */
export function useLyrics(
  trackId: string | null | undefined,
  getCurrentTime: () => number,
): UseLyricsResult {
  const { data, isLoading } = api.mediaLibrary.getTrackLyrics.useQuery(
    { trackId: trackId! },
    { enabled: !!trackId, staleTime: Number.POSITIVE_INFINITY },
  );

  const lines = useMemo(
    () => (data?.syncedLyrics ? parseLrc(data.syncedLyrics) : []),
    [data?.syncedLyrics],
  );

  const hasSyncedLyrics = lines.length > 0;

  const [currentIdx, setCurrentIdx] = useState(-1);
  const progressRef = useRef(0);
  const prevIdxRef = useRef(-1);

  // Store getCurrentTime in a ref so the RAF loop always reads from the latest
  const getTimeRef = useRef(getCurrentTime);
  getTimeRef.current = getCurrentTime;

  // Internal RAF loop — only causes React re-render when the active line changes
  useEffect(() => {
    if (lines.length === 0) {
      prevIdxRef.current = -1;
      setCurrentIdx(-1);
      progressRef.current = 0;
      return;
    }

    let raf: number;
    const tick = () => {
      const t = getTimeRef.current();
      const idx = currentLineIndex(lines, t);
      if (idx !== prevIdxRef.current) {
        prevIdxRef.current = idx;
        setCurrentIdx(idx);
      }
      progressRef.current = lineProgress(lines, idx, t);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [lines]);

  return {
    lines,
    currentIdx,
    progressRef,
    plainText: data?.plainLyrics ?? null,
    isLoading,
    hasSyncedLyrics,
  };
}
