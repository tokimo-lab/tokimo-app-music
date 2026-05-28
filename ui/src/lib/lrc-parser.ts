/** Parsed LRC line with time (seconds) and text. */
export interface LrcLine {
  time: number;
  text: string;
}

const LINE_RE = /\[(\d{1,2}):(\d{2})(?:[.:]\d{1,3})?\]\s*(.*)/;

/** Parse an LRC string into sorted time-tagged lines. */
export function parseLrc(lrc: string): LrcLine[] {
  const lines: LrcLine[] = [];
  for (const raw of lrc.split("\n")) {
    const m = LINE_RE.exec(raw.trim());
    if (!m) continue;
    const mins = Number.parseInt(m[1], 10);
    const secs = Number.parseInt(m[2], 10);
    const text = m[3].trim();
    if (!text) continue;
    lines.push({ time: mins * 60 + secs, text });
  }
  return lines.sort((a, b) => a.time - b.time);
}

/**
 * Return the index of the line that should be highlighted at `time`.
 * Binary-searches for the last line whose `time ≤ currentTime`.
 */
export function currentLineIndex(lines: LrcLine[], time: number): number {
  if (lines.length === 0) return -1;
  let lo = 0;
  let hi = lines.length - 1;
  if (time < lines[0].time) return -1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    if (lines[mid].time <= time) lo = mid + 1;
    else hi = mid - 1;
  }
  return hi;
}

/**
 * Return a 0-1 progress ratio within the current line.
 * Useful for karaoke-style fill animation.
 */
export function lineProgress(
  lines: LrcLine[],
  idx: number,
  time: number,
): number {
  if (idx < 0 || idx >= lines.length) return 0;
  const start = lines[idx].time;
  const end = idx + 1 < lines.length ? lines[idx + 1].time : start + 5;
  const span = end - start;
  if (span <= 0) return 1;
  return Math.min(1, Math.max(0, (time - start) / span));
}
