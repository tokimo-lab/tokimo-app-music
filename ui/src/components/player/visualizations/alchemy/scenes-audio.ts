import { S, TAU } from "./helpers";
import { hsl } from "./scene-buffer";
import type { Scene } from "./types";
import { clamp, lerp } from "./utils";

const nil = () => null;

// ── 1. Frequency Waterfall ──────────────────────────────────────────────────

interface WaterfallState {
  history: Float32Array<ArrayBuffer>[];
  bins: number;
}

function drawWaterfall(dc: Parameters<Scene["draw"]>[0], st: WaterfallState) {
  const { buf, w, h, analyser, playing } = dc;
  const maxRows = 24;
  const bins = 64;

  if (analyser && playing) {
    const freq = new Uint8Array(
      analyser.frequencyBinCount,
    ) as Uint8Array<ArrayBuffer>;
    analyser.getByteFrequencyData(freq);
    const row = new Float32Array(bins) as Float32Array<ArrayBuffer>;
    const step = Math.floor(freq.length / bins);
    for (let i = 0; i < bins; i++) row[i] = freq[i * step] / 255;
    st.history.unshift(row);
    if (st.history.length > maxRows) st.history.length = maxRows;
    st.bins = bins;
  }

  const r = S(w, h) * 0.4;
  for (let row = 0; row < st.history.length; row++) {
    const data = st.history[row];
    const z = row * 16;
    const fade = 1 - row / maxRows;
    const [cr, cg, cb] = hsl(200 + row * 6, 80, 50);
    buf.lineStart();
    for (let i = 0; i < data.length; i++) {
      const xp = (i / (data.length - 1) - 0.5) * 2 * r;
      const yp = -data[i] * r * 0.5;
      buf.lineTo(xp, yp, z, cr, cg, cb, fade * 0.6);
    }
  }
}

// ── 2. Oscilloscope XY ──────────────────────────────────────────────────────

function drawOscilloscopeXY(dc: Parameters<Scene["draw"]>[0]) {
  const { buf, w, h, analyser, playing, audio, time } = dc;
  if (!analyser || !playing) return;

  const wave = new Uint8Array(analyser.fftSize) as Uint8Array<ArrayBuffer>;
  analyser.getByteTimeDomainData(wave);
  const len = wave.length;
  const r = S(w, h) * 0.35 * (0.8 + audio.energy * 0.5);
  const hue = (time * 30) % 360;

  for (let layer = 0; layer < 3; layer++) {
    const offset = layer * 2;
    const z = layer * 40;
    const [cr, cg, cb] = hsl(hue + layer * 40, 85, 48);
    buf.lineStart();
    const step = Math.max(1, Math.floor(len / 512));
    for (let i = 0; i < len - offset - 1; i += step) {
      const x = ((wave[i] - 128) / 128) * r;
      const y = ((wave[i + offset] - 128) / 128) * r;
      buf.lineTo(x, y, z, cr, cg, cb, 0.55 - layer * 0.1);
    }
  }
}

// ── 3. Beat Rings ───────────────────────────────────────────────────────────

interface BeatRing {
  birth: number;
  hue: number;
}

interface BeatRingsState {
  rings: BeatRing[];
  prevBass: number;
}

function drawBeatRings(dc: Parameters<Scene["draw"]>[0], st: BeatRingsState) {
  const { buf, w, h, time, audio } = dc;
  const maxR = S(w, h) * 0.45;
  const lifespan = 2.5;

  // detect rising edge of bass
  if (audio.bass > 0.35 && audio.bass - st.prevBass > 0.08) {
    st.rings.push({ birth: time, hue: (time * 60) % 360 });
  }
  st.prevBass = audio.bass;

  // remove expired
  st.rings = st.rings.filter((ring) => time - ring.birth < lifespan);

  for (const ring of st.rings) {
    const age = time - ring.birth;
    const t = age / lifespan;
    const radius = lerp(maxR * 0.05, maxR, t);
    const alpha = clamp((1 - t) * 0.7, 0, 0.7);
    const [cr, cg, cb] = hsl(ring.hue, 80, 50);
    const z = t * 200;
    buf.circle(0, 0, z, radius, cr, cg, cb, alpha, 48);
  }

  // center dot pulsing with bass
  const [pr, pg, pb] = hsl(0, 0, 80);
  buf.point(0, 0, 0, pr, pg, pb, audio.bass * 0.8, 4 + audio.bass * 6);
}

// ── 4. Harmonic Overtones ───────────────────────────────────────────────────

function drawHarmonics(dc: Parameters<Scene["draw"]>[0]) {
  const { buf, w, h, time, analyser, playing } = dc;
  const baseR = S(w, h) * 0.38;
  const harmonics = 5;

  const amps = new Float64Array(harmonics);
  if (analyser && playing) {
    const freq = new Uint8Array(
      analyser.frequencyBinCount,
    ) as Uint8Array<ArrayBuffer>;
    analyser.getByteFrequencyData(freq);
    const binsPer = Math.floor(freq.length / (harmonics + 1));
    for (let h = 0; h < harmonics; h++) {
      let sum = 0;
      const start = (h + 1) * binsPer;
      for (let j = start; j < start + binsPer && j < freq.length; j++)
        sum += freq[j];
      amps[h] = sum / (binsPer * 255);
    }
  } else {
    for (let h = 0; h < harmonics; h++) amps[h] = 0.2;
  }

  for (let h = 0; h < harmonics; h++) {
    const n = h + 1;
    const radius = (baseR / n) * (0.6 + amps[h] * 0.8);
    const rot = time * n * 0.3;
    const hue = (h * 65 + time * 15) % 360;
    const [cr, cg, cb] = hsl(hue, 82, 48);
    const z = h * 30;
    const segs = 36 + h * 8;

    buf.lineStart();
    for (let i = 0; i <= segs; i++) {
      const angle = (i / segs) * TAU + rot;
      const wobble = 1 + Math.sin(angle * n + time * 2) * amps[h] * 0.15;
      const r2 = radius * wobble;
      buf.lineTo(
        Math.cos(angle) * r2,
        Math.sin(angle) * r2,
        z,
        cr,
        cg,
        cb,
        0.45 + amps[h] * 0.25,
      );
    }
  }
}

// ── 5. Phase Space ──────────────────────────────────────────────────────────

function drawPhaseSpace(dc: Parameters<Scene["draw"]>[0]) {
  const { buf, w, h, analyser, playing, audio, time } = dc;
  if (!analyser || !playing) return;

  const wave = new Uint8Array(analyser.fftSize) as Uint8Array<ArrayBuffer>;
  analyser.getByteTimeDomainData(wave);
  const r = S(w, h) * 0.38;
  const delays = [4, 12, 24];

  for (let layer = 0; layer < delays.length; layer++) {
    const delay = delays[layer];
    const z = layer * 60;
    const hue = (time * 20 + layer * 100) % 360;
    const [cr, cg, cb] = hsl(hue, 78, 50);
    const scale = r * (0.7 + audio.energy * 0.5);

    buf.lineStart();
    const step = Math.max(1, Math.floor(wave.length / 400));
    for (let i = 0; i < wave.length - delay; i += step) {
      const x = ((wave[i] - 128) / 128) * scale;
      const y = ((wave[i + delay] - 128) / 128) * scale;
      buf.lineTo(x, y, z, cr, cg, cb, 0.5 - layer * 0.1);
    }
  }
}

// ── 6. Spectral Flame ───────────────────────────────────────────────────────

function drawSpectralFlame(dc: Parameters<Scene["draw"]>[0]) {
  const { buf, w, h, analyser, playing, audio, time } = dc;
  const columns = 32;
  const maxH = S(w, h) * 0.42;
  const spread = S(w, h) * 0.4;
  const bassBoost = 1 + audio.bass * 0.6;

  const amps = new Float64Array(columns);
  if (analyser && playing) {
    const freq = new Uint8Array(
      analyser.frequencyBinCount,
    ) as Uint8Array<ArrayBuffer>;
    analyser.getByteFrequencyData(freq);
    const step = Math.floor(freq.length / columns);
    for (let i = 0; i < columns; i++) {
      let sum = 0;
      for (let j = 0; j < step; j++) sum += freq[i * step + j];
      amps[i] = sum / (step * 255);
    }
  }

  for (let i = 0; i < columns; i++) {
    const xp = (i / (columns - 1) - 0.5) * 2 * spread;
    const amp = amps[i] * bassBoost;
    const height = amp * maxH;
    const segments = 12;

    buf.lineStart();
    for (let s = 0; s <= segments; s++) {
      const t = s / segments;
      const yp = maxH * 0.3 - t * height;
      const taper = 1 - t * t;
      const flicker = Math.sin(time * 8 + i * 0.7 + t * 3) * taper * 6;
      const lum = clamp(35 + amp * 40, 35, 75);
      const hue = lerp(0, 50, t) + amp * 10;
      const [cr, cg, cb] = hsl(hue, 90, lum);
      const z = 20 + Math.abs(xp) * 0.2;
      buf.lineTo(
        xp + flicker,
        yp,
        z,
        cr,
        cg,
        cb,
        (0.6 - t * 0.3) * clamp(amp + 0.15, 0, 1),
      );
    }
  }
}

// ── 7. Bass Reactor ─────────────────────────────────────────────────────────

function drawBassReactor(dc: Parameters<Scene["draw"]>[0]) {
  const { buf, w, h, time, audio } = dc;
  const base = S(w, h) * 0.15;
  const sides = 8;
  const layers = 4;

  // inner rotating octagon pulsing with bass
  for (let layer = 0; layer < layers; layer++) {
    const expand = 1 + audio.bass * 0.6 + layer * 0.4;
    const radius = base * expand;
    const rot =
      time * (layer % 2 === 0 ? 0.5 : -0.5) * (1 + audio.energy * 0.5);
    const hue = (layer * 70 + time * 25) % 360;
    const [cr, cg, cb] = hsl(hue, 80, 50);
    const z = layer * 40;

    buf.lineStart();
    for (let i = 0; i <= sides; i++) {
      const angle = (i / sides) * TAU + rot;
      buf.lineTo(
        Math.cos(angle) * radius,
        Math.sin(angle) * radius,
        z,
        cr,
        cg,
        cb,
        0.55,
      );
    }
  }

  // radiating lines on beat
  const rayCount = 16;
  const rayLen = S(w, h) * 0.35 * (0.3 + audio.bass * 0.7);
  const innerR = base * (1 + audio.bass * 0.6);
  for (let i = 0; i < rayCount; i++) {
    const angle = (i / rayCount) * TAU + time * 0.2;
    const bandIdx = i % 3;
    const band =
      bandIdx === 0 ? audio.bass : bandIdx === 1 ? audio.mid : audio.high;
    const len = innerR + rayLen * band;
    const hue = (i * 22 + time * 40) % 360;
    const [cr, cg, cb] = hsl(hue, 75, 52);

    buf.lineStart();
    buf.lineTo(
      Math.cos(angle) * innerR,
      Math.sin(angle) * innerR,
      10,
      cr,
      cg,
      cb,
      0.5,
    );
    buf.lineTo(
      Math.cos(angle) * len,
      Math.sin(angle) * len,
      10,
      cr,
      cg,
      cb,
      0.15,
    );
  }

  // center glow
  const [pr, pg, pb] = hsl(0, 0, 90);
  buf.point(0, 0, 0, pr, pg, pb, 0.4 + audio.bass * 0.5, 5 + audio.bass * 8);
}

// ── 8. Frequency Spiral ─────────────────────────────────────────────────────

function drawFreqSpiral(dc: Parameters<Scene["draw"]>[0]) {
  const { buf, w, h, analyser, playing, audio, time } = dc;
  const maxR = S(w, h) * 0.42;
  const bins = 128;
  const turns = 3 + audio.energy * 2;

  const amps = new Float64Array(bins);
  if (analyser && playing) {
    const freq = new Uint8Array(
      analyser.frequencyBinCount,
    ) as Uint8Array<ArrayBuffer>;
    analyser.getByteFrequencyData(freq);
    const step = Math.max(1, Math.floor(freq.length / bins));
    for (let i = 0; i < bins; i++) amps[i] = freq[i * step] / 255;
  }

  buf.lineStart();
  for (let i = 0; i < bins; i++) {
    const t = i / bins;
    const angle = t * turns * TAU + time * 0.4;
    const spiralR = t * maxR * (0.3 + amps[i] * 0.7);
    const x = Math.cos(angle) * spiralR;
    const y = Math.sin(angle) * spiralR;
    const z = t * 150;
    const hue = (t * 300 + time * 20) % 360;
    const [cr, cg, cb] = hsl(hue, 82, 48);
    buf.lineTo(x, y, z, cr, cg, cb, 0.5 + amps[i] * 0.2);
  }

  // glow points at amplitude peaks
  for (let i = 1; i < bins - 1; i++) {
    if (amps[i] > amps[i - 1] && amps[i] > amps[i + 1] && amps[i] > 0.5) {
      const t = i / bins;
      const angle = t * turns * TAU + time * 0.4;
      const spiralR = t * maxR * (0.3 + amps[i] * 0.7);
      const hue = (t * 300 + time * 20) % 360;
      const [cr, cg, cb] = hsl(hue, 90, 55);
      buf.point(
        Math.cos(angle) * spiralR,
        Math.sin(angle) * spiralR,
        t * 150,
        cr,
        cg,
        cb,
        amps[i] * 0.7,
        3 + amps[i] * 4,
      );
    }
  }
}

// ── 9. Vocal Waveform ───────────────────────────────────────────────────────

function drawVocalWaveform(dc: Parameters<Scene["draw"]>[0]) {
  const { buf, w, h, analyser, playing, audio, time } = dc;
  if (!analyser || !playing) return;

  const wave = new Uint8Array(analyser.fftSize) as Uint8Array<ArrayBuffer>;
  analyser.getByteTimeDomainData(wave);
  const halfW = S(w, h) * 0.42;
  const ampScale = S(w, h) * 0.22 * (0.6 + audio.energy * 0.8);
  const layers = 4;
  const step = Math.max(1, Math.floor(wave.length / 256));

  for (let layer = 0; layer < layers; layer++) {
    const z = layer * 50;
    const delay = layer * 3;
    const fade = 1 - layer * 0.2;
    const hue = (time * 25 + layer * 50) % 360;
    const [cr, cg, cb] = hsl(hue, 78, 50);

    // top half
    buf.lineStart();
    for (let i = delay; i < wave.length - delay; i += step) {
      const t = (i - delay) / (wave.length - delay * 2 - 1);
      const xp = (t - 0.5) * 2 * halfW;
      const sample = (wave[i] - 128) / 128;
      const yp = -Math.abs(sample) * ampScale;
      buf.lineTo(xp, yp, z, cr, cg, cb, fade * 0.5);
    }

    // bottom mirror
    buf.lineStart();
    for (let i = delay; i < wave.length - delay; i += step) {
      const t = (i - delay) / (wave.length - delay * 2 - 1);
      const xp = (t - 0.5) * 2 * halfW;
      const sample = (wave[i] - 128) / 128;
      const yp = Math.abs(sample) * ampScale;
      buf.lineTo(xp, yp, z, cr, cg, cb, fade * 0.5);
    }
  }

  // center line baseline
  const [lr, lg, lb] = hsl((time * 25) % 360, 40, 60);
  buf.lineStart();
  buf.lineTo(-halfW, 0, 0, lr, lg, lb, 0.2);
  buf.lineTo(halfW, 0, 0, lr, lg, lb, 0.2);
}

// ── 10. Equalizer Pillars ───────────────────────────────────────────────────

function drawEqPillars(dc: Parameters<Scene["draw"]>[0]) {
  const { buf, w, h, analyser, playing, time } = dc;
  const bands = 16;
  const arcR = S(w, h) * 0.38;
  const pillarH = S(w, h) * 0.35;

  const amps = new Float64Array(bands);
  if (analyser && playing) {
    const freq = new Uint8Array(
      analyser.frequencyBinCount,
    ) as Uint8Array<ArrayBuffer>;
    analyser.getByteFrequencyData(freq);
    const step = Math.floor(freq.length / bands);
    for (let i = 0; i < bands; i++) {
      let sum = 0;
      for (let j = 0; j < step; j++) sum += freq[i * step + j];
      amps[i] = sum / (step * 255);
    }
  }

  // base arc connecting column bases
  const startAngle = Math.PI + Math.PI * 0.15;
  const endAngle = TAU - Math.PI * 0.15;
  const [ar, ag, ab] = hsl((time * 15) % 360, 60, 45);
  buf.arc(0, 0, 100, arcR, startAngle, endAngle, ar, ag, ab, 0.35, 48);

  // columns
  for (let i = 0; i < bands; i++) {
    const t = i / (bands - 1);
    const angle = lerp(startAngle, endAngle, t);
    const baseX = Math.cos(angle) * arcR;
    const baseY = Math.sin(angle) * arcR;
    const height = amps[i] * pillarH;
    const dirX = Math.cos(angle);
    const dirY = Math.sin(angle);
    const hue = (t * 280 + time * 20) % 360;
    const [cr, cg, cb] = hsl(hue, 82, 48);

    // vertical pillar along radial direction
    const segments = 6;
    buf.lineStart();
    for (let s = 0; s <= segments; s++) {
      const st2 = s / segments;
      const px = baseX + dirX * st2 * height;
      const py = baseY + dirY * st2 * height;
      const z = 50 - st2 * 30;
      buf.lineTo(px, py, z, cr, cg, cb, 0.55 - st2 * 0.15);
    }

    // glow point at top
    if (amps[i] > 0.15) {
      const topX = baseX + dirX * height;
      const topY = baseY + dirY * height;
      const [gr, gg, gb] = hsl(hue, 90, 60);
      buf.point(topX, topY, 20, gr, gg, gb, amps[i] * 0.7, 3 + amps[i] * 5);
    }
  }
}

// ── Export ───────────────────────────────────────────────────────────────────

export const audioScenes: Scene[] = [
  {
    name: "Frequency Waterfall",
    init: (): WaterfallState => ({ history: [], bins: 64 }),
    draw: (dc, state) => drawWaterfall(dc, state as WaterfallState),
  },
  {
    name: "Oscilloscope XY",
    init: nil,
    draw: (dc) => drawOscilloscopeXY(dc),
  },
  {
    name: "Beat Rings",
    init: (): BeatRingsState => ({ rings: [], prevBass: 0 }),
    draw: (dc, state) => drawBeatRings(dc, state as BeatRingsState),
  },
  {
    name: "Harmonic Overtones",
    init: nil,
    draw: (dc) => drawHarmonics(dc),
  },
  {
    name: "Phase Space",
    init: nil,
    draw: (dc) => drawPhaseSpace(dc),
  },
  {
    name: "Spectral Flame",
    init: nil,
    draw: (dc) => drawSpectralFlame(dc),
  },
  {
    name: "Bass Reactor",
    init: nil,
    draw: (dc) => drawBassReactor(dc),
  },
  {
    name: "Frequency Spiral",
    init: nil,
    draw: (dc) => drawFreqSpiral(dc),
  },
  {
    name: "Vocal Waveform",
    init: nil,
    draw: (dc) => drawVocalWaveform(dc),
  },
  {
    name: "Equalizer Pillars",
    init: nil,
    draw: (dc) => drawEqPillars(dc),
  },
];
