import type { AudioBands } from "./types";

// ── Math ─────────────────────────────────────────────────────────────────────

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function ease(t: number): number {
  return t * t * (3 - 2 * t);
}

export function randomFreq(): number {
  return 1 + Math.floor(Math.random() * 7);
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Simple seeded-ish hash for deterministic per-scene variety */
export function hash(n: number): number {
  let x = ((n + 1) * 2654435761) >>> 0;
  x = ((x ^ (x >> 16)) * 0x45d9f3b) >>> 0;
  return (x & 0x7fffffff) / 0x7fffffff;
}

// ── Audio ────────────────────────────────────────────────────────────────────

export function getAudioBands(
  analyser: AnalyserNode | null,
  playing: boolean,
): AudioBands {
  if (!analyser || !playing) return { bass: 0, mid: 0, high: 0, energy: 0 };
  const data = new Uint8Array(
    analyser.frequencyBinCount,
  ) as Uint8Array<ArrayBuffer>;
  analyser.getByteFrequencyData(data);
  const len = data.length;
  const third = Math.floor(len / 3);
  let bassSum = 0;
  let midSum = 0;
  let highSum = 0;
  for (let i = 0; i < third; i++) bassSum += data[i];
  for (let i = third; i < third * 2; i++) midSum += data[i];
  for (let i = third * 2; i < len; i++) highSum += data[i];
  const bass = bassSum / (third * 255);
  const mid = midSum / (third * 255);
  const high = highSum / ((len - third * 2) * 255);
  return { bass, mid, high, energy: (bass + mid + high) / 3 };
}

export function getFrequencyData(
  analyser: AnalyserNode | null,
  playing: boolean,
): Uint8Array<ArrayBuffer> | null {
  if (!analyser || !playing) return null;
  const data = new Uint8Array(
    analyser.frequencyBinCount,
  ) as Uint8Array<ArrayBuffer>;
  analyser.getByteFrequencyData(data);
  return data;
}
