import { useEffect, useMemo, useRef, useState } from "react";
import {
  currentLineIndex,
  type LrcLine,
  lineProgress,
  parseLrc,
} from "../lib/lrc-parser";
import { trpc } from "../lib/trpc";

interface UseLyricsResult {
  lines: LrcLine[];
  currentIdx: number;
  progress: number;
  plainText: string | null;
  isLoading: boolean;
  hasSyncedLyrics: boolean;
}

/**
 * Fetches lyrics for a track and keeps the active-line index in sync with
 * the player's `currentTime`.
 */
export function useLyrics(
  trackId: string | null | undefined,
  currentTime: number,
): UseLyricsResult {
  const { data, isLoading } = trpc.mediaLibrary.getTrackLyrics.useQuery(
    { trackId: trackId! },
    { enabled: !!trackId, staleTime: Number.POSITIVE_INFINITY },
  );

  const lines = useMemo(
    () => (data?.syncedLyrics ? parseLrc(data.syncedLyrics) : []),
    [data?.syncedLyrics],
  );

  const hasSyncedLyrics = lines.length > 0;

  // Avoid re-rendering on every rAF tick — only update when index changes
  const [currentIdx, setCurrentIdx] = useState(-1);
  const [progress, setProgress] = useState(0);
  const prevIdxRef = useRef(-1);

  useEffect(() => {
    const idx = currentLineIndex(lines, currentTime);
    if (idx !== prevIdxRef.current) {
      prevIdxRef.current = idx;
      setCurrentIdx(idx);
    }
    setProgress(lineProgress(lines, idx, currentTime));
  }, [lines, currentTime]);

  return {
    lines,
    currentIdx,
    progress,
    plainText: data?.plainLyrics ?? null,
    isLoading,
    hasSyncedLyrics,
  };
}
