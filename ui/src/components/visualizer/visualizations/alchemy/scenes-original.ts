import type { SceneBuffer } from "./scene-buffer";
import { hsl } from "./scene-buffer";
import type { AudioBands, Scene } from "./types";
import { ease, lerp, randomFreq } from "./utils";

// ── Ribbons ──────────────────────────────────────────────────────────────────

const POINTS = 200;

interface RibbonState {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  targetAx: number;
  targetAy: number;
  targetBx: number;
  targetBy: number;
  phase: number;
  hue: number;
  targetHue: number;
  morphT: number;
  morphDur: number;
}

function initRibbon(i: number, count: number): RibbonState {
  return {
    ax: randomFreq(),
    ay: randomFreq(),
    bx: randomFreq(),
    by: randomFreq(),
    targetAx: randomFreq(),
    targetAy: randomFreq(),
    targetBx: randomFreq(),
    targetBy: randomFreq(),
    phase: (i / count) * Math.PI * 2,
    hue: (i / count) * 360,
    targetHue: Math.random() * 360,
    morphT: 0,
    morphDur: 250 + Math.random() * 250,
  };
}

function drawRibbons(
  buf: SceneBuffer,
  w: number,
  h: number,
  time: number,
  audio: AudioBands,
  ribbons: RibbonState[],
) {
  const baseScale = Math.min(w, h) * 0.3;
  for (let ri = 0; ri < ribbons.length; ri++) {
    const rb = ribbons[ri];
    const ribbonZ = ri * 80 - 160;
    rb.morphT++;
    if (rb.morphT >= rb.morphDur) {
      rb.morphT = 0;
      rb.morphDur = 250 + Math.random() * 250;
      rb.ax = rb.targetAx;
      rb.ay = rb.targetAy;
      rb.bx = rb.targetBx;
      rb.by = rb.targetBy;
      rb.hue = rb.targetHue;
      rb.targetAx = randomFreq();
      rb.targetAy = randomFreq();
      rb.targetBx = randomFreq();
      rb.targetBy = randomFreq();
      rb.targetHue = Math.random() * 360;
    }
    const mt = ease(rb.morphT / rb.morphDur);
    const ax = lerp(rb.ax, rb.targetAx, mt);
    const ay = lerp(rb.ay, rb.targetAy, mt);
    const bx = lerp(rb.bx, rb.targetBx, mt);
    const by = lerp(rb.by, rb.targetBy, mt);
    const hue = lerp(rb.hue, rb.targetHue, mt);
    const amp = 0.5 + audio.bass * 0.5;
    const po = rb.phase + time;
    const alpha = 0.6 + audio.energy * 0.15;
    const sat = 80 + audio.energy * 15;
    const lit = 42 + audio.energy * 13;
    const [cr, cg, cb] = hsl(hue, sat, lit);
    buf.lineStart();
    // <= POINTS so the last vertex closes back to start
    for (let p = 0; p <= POINTS; p++) {
      const t = ((p % POINTS) / POINTS) * Math.PI * 2;
      const x =
        baseScale *
        amp *
        (Math.sin(ax * t + po) + 0.3 * Math.sin(bx * t * 2.1 + po * 1.3));
      const y =
        baseScale *
        amp *
        (Math.cos(ay * t + po * 0.7) + 0.3 * Math.cos(by * t * 1.7 + po * 0.9));
      const zp = ribbonZ + Math.sin(t * 2 + rb.phase) * 60;
      buf.lineTo(x, y, zp, cr, cg, cb, alpha);
    }
  }
}

// ── Spirograph ───────────────────────────────────────────────────────────────

const SPIRO_POINTS = 300;
const SPIRO_LAYERS = 2;
const SPIRO_LAYER_Z = [0, 150];

interface SpiroState {
  R: number;
  r: number;
  d: number;
  targetR: number;
  targetr: number;
  targetd: number;
  hueBase: number;
  morphT: number;
  morphDur: number;
}

function initSpiro(): SpiroState {
  return {
    R: 3 + Math.random() * 5,
    r: 1 + Math.random() * 3,
    d: 1 + Math.random() * 4,
    targetR: 3 + Math.random() * 5,
    targetr: 1 + Math.random() * 3,
    targetd: 1 + Math.random() * 4,
    hueBase: Math.random() * 360,
    morphT: 0,
    morphDur: 400,
  };
}

function drawSpirograph(
  buf: SceneBuffer,
  w: number,
  h: number,
  time: number,
  audio: AudioBands,
  spiro: SpiroState,
) {
  spiro.morphT++;
  if (spiro.morphT >= spiro.morphDur) {
    spiro.morphT = 0;
    spiro.morphDur = 300 + Math.random() * 300;
    spiro.R = spiro.targetR;
    spiro.r = spiro.targetr;
    spiro.d = spiro.targetd;
    spiro.targetR = 3 + Math.random() * 5;
    spiro.targetr = 1 + Math.random() * 3;
    spiro.targetd = 1 + Math.random() * 4;
  }
  const mt = ease(spiro.morphT / spiro.morphDur);
  const R = lerp(spiro.R, spiro.targetR, mt);
  const r = lerp(spiro.r, spiro.targetr, mt);
  const d = lerp(spiro.d, spiro.targetd, mt);
  const scale = Math.min(w, h) * 0.3 * (0.6 + audio.energy * 0.4);
  for (let layer = 0; layer < SPIRO_LAYERS; layer++) {
    const baseZ = SPIRO_LAYER_Z[layer];
    const hue = (spiro.hueBase + layer * 150 + time * 20) % 360;
    const layerPhase = time * (1 + layer * 0.3);
    const alpha = 0.6 + audio.energy * 0.2;
    const sat = 75 + audio.mid * 15;
    const lit = 40 + audio.high * 15;
    const [cr, cg, cb] = hsl(hue, sat, lit);
    buf.lineStart();
    for (let i = 0; i < SPIRO_POINTS; i++) {
      const t = (i / SPIRO_POINTS) * Math.PI * 2 * Math.ceil(r);
      const rr = r + layer * 0.3;
      const x =
        scale *
        ((R - rr) * Math.cos(t + layerPhase) +
          d * Math.cos(((R - rr) / rr) * t + layerPhase));
      const y =
        scale *
        ((R - rr) * Math.sin(t + layerPhase) +
          d * Math.sin(((R - rr) / rr) * t + layerPhase));
      const z = baseZ + Math.sin(t * 3) * 80;
      buf.lineTo(x, y, z, cr, cg, cb, alpha);
    }
  }
  spiro.hueBase = (spiro.hueBase + 0.15) % 360;
}

// ── Plasma (stateless) ───────────────────────────────────────────────────────

function drawPlasma(
  buf: SceneBuffer,
  w: number,
  h: number,
  time: number,
  audio: AudioBands,
) {
  const blobCount = 5;
  for (let i = 0; i < blobCount; i++) {
    const z = i * 100 - 200;
    const angle = (i / blobCount) * Math.PI * 2 + time * (0.3 + i * 0.1);
    const dist = Math.min(w, h) * 0.15 * (1 + audio.bass * 0.8);
    const bx = Math.cos(angle) * dist;
    const by = Math.sin(angle) * dist;
    const blobRadius =
      Math.min(w, h) *
      (0.2 + audio.energy * 0.25 + Math.sin(time * 2 + i) * 0.05);
    const hue = (time * 30 + i * 72) % 360;
    const alpha = 0.3 + audio.mid * 0.3;
    const [cr, cg, cb] = hsl(hue, 70, 50);
    buf.point(bx, by, z, cr, cg, cb, alpha, blobRadius);
  }
}

// ── Starburst (uses analyser directly) ───────────────────────────────────────

function drawStarburst(
  buf: SceneBuffer,
  w: number,
  h: number,
  time: number,
  audio: AudioBands,
  analyser: AnalyserNode | null,
  playing: boolean,
) {
  const maxR = Math.min(w, h) * 0.42;
  const rays = 128;
  let freqData: Uint8Array<ArrayBuffer> | null = null;
  if (analyser && playing) {
    freqData = new Uint8Array(
      analyser.frequencyBinCount,
    ) as Uint8Array<ArrayBuffer>;
    analyser.getByteFrequencyData(freqData);
  }
  const rotation = time * 0.15;
  for (let i = 0; i < rays; i++) {
    const angle = (i / rays) * Math.PI * 2 + rotation;
    const val = freqData ? freqData[i % freqData.length] / 255 : 0;
    const len = maxR * (0.1 + val * 0.9);
    const ex = Math.cos(angle) * len;
    const ey = Math.sin(angle) * len;
    const z = val * 300;
    const hue = ((i / rays) * 360 + time * 40) % 360;
    const sat = 80 + val * 15;
    const lit = 35 + val * 25;
    const [cr, cg, cb] = hsl(hue, sat, lit);
    buf.lineStart();
    buf.lineTo(0, 0, 0, cr, cg, cb, 0.45);
    buf.lineTo(ex, ey, z, cr, cg, cb, 0.45);
  }
  // center glow
  const coreHue = (time * 60) % 360;
  const coreAlpha = 0.3 + audio.bass * 0.3;
  const [gr, gg, gb] = hsl(coreHue, 80, 70);
  buf.point(0, 0, 0, gr, gg, gb, coreAlpha, maxR * 0.15);
}

// ── Vortex ───────────────────────────────────────────────────────────────────

const VORTEX_MAX_DEPTH = 1200;

interface VortexParticle {
  angle: number;
  radius: number;
  speed: number;
  hue: number;
  size: number;
  z: number;
}

function initVortexParticles(count: number): VortexParticle[] {
  const particles: VortexParticle[] = [];
  for (let i = 0; i < count; i++) {
    particles.push({
      angle: Math.random() * Math.PI * 2,
      radius: Math.random(),
      speed: 0.5 + Math.random() * 1.5,
      hue: Math.random() * 360,
      size: 1 + Math.random() * 2,
      z: Math.random() * VORTEX_MAX_DEPTH,
    });
  }
  return particles;
}

function resetVortexParticle(p: VortexParticle) {
  p.radius = 0;
  p.z = 0;
  p.hue = Math.random() * 360;
  p.angle = Math.random() * Math.PI * 2;
}

function drawVortex(
  buf: SceneBuffer,
  w: number,
  h: number,
  _time: number,
  audio: AudioBands,
  particles: VortexParticle[],
) {
  const maxR = Math.min(w, h) * 0.42;
  for (const p of particles) {
    p.angle += p.speed * 0.02 * (1 + audio.energy);
    p.radius += (0.003 + audio.bass * 0.005) * p.speed;
    p.z += p.speed * 2;
    if (p.radius > 1 || p.z > VORTEX_MAX_DEPTH) resetVortexParticle(p);
    p.hue = (p.hue + 0.3) % 360;
    const r = p.radius * maxR;
    const x = Math.cos(p.angle) * r;
    const y = Math.sin(p.angle) * r;
    const radialFade = Math.sin(p.radius * Math.PI);
    const dAlpha = Math.max(0, 1 - p.z / VORTEX_MAX_DEPTH);
    const alpha = radialFade * dAlpha * 0.8;
    const sz = p.size * (1 + audio.mid * 2) * radialFade;
    const lit = 55 + audio.high * 20;
    const [cr, cg, cb] = hsl(p.hue, 90, lit);
    buf.point(x, y, p.z, cr, cg, cb, alpha, Math.max(0.5, sz));
  }
}

// ── Export ────────────────────────────────────────────────────────────────────

export const originalScenes: Scene[] = [
  {
    name: "Ribbons",
    init: () => Array.from({ length: 5 }, (_, i) => initRibbon(i, 5)),
    draw: (dc, state) => {
      drawRibbons(
        dc.buf,
        dc.w,
        dc.h,
        dc.time,
        dc.audio,
        state as RibbonState[],
      );
    },
  },
  {
    name: "Spirograph",
    init: () => initSpiro(),
    draw: (dc, state) => {
      drawSpirograph(
        dc.buf,
        dc.w,
        dc.h,
        dc.time,
        dc.audio,
        state as SpiroState,
      );
    },
  },
  {
    name: "Plasma",
    init: () => null,
    draw: (dc) => {
      drawPlasma(dc.buf, dc.w, dc.h, dc.time, dc.audio);
    },
  },
  {
    name: "Starburst",
    init: () => null,
    draw: (dc) => {
      drawStarburst(
        dc.buf,
        dc.w,
        dc.h,
        dc.time,
        dc.audio,
        dc.analyser,
        dc.playing,
      );
    },
  },
  {
    name: "Vortex",
    init: () => initVortexParticles(200),
    draw: (dc, state) => {
      drawVortex(
        dc.buf,
        dc.w,
        dc.h,
        dc.time,
        dc.audio,
        state as VortexParticle[],
      );
    },
  },
];
