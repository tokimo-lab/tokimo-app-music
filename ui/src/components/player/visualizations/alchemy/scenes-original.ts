import type { Camera } from "./perspective";
import { depthAlpha, depthSize, MAX_DEPTH, project } from "./perspective";
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
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  time: number,
  audio: AudioBands,
  ribbons: RibbonState[],
  cam: Camera,
) {
  const cx = w / 2;
  const cy = h / 2;
  const baseScale = Math.min(w, h) * 0.3;
  for (let ri = 0; ri < ribbons.length; ri++) {
    const r = ribbons[ri];
    const ribbonZ = ri * 80 - 160;
    r.morphT++;
    if (r.morphT >= r.morphDur) {
      r.morphT = 0;
      r.morphDur = 250 + Math.random() * 250;
      r.ax = r.targetAx;
      r.ay = r.targetAy;
      r.bx = r.targetBx;
      r.by = r.targetBy;
      r.hue = r.targetHue;
      r.targetAx = randomFreq();
      r.targetAy = randomFreq();
      r.targetBx = randomFreq();
      r.targetBy = randomFreq();
      r.targetHue = Math.random() * 360;
    }
    const mt = ease(r.morphT / r.morphDur);
    const ax = lerp(r.ax, r.targetAx, mt);
    const ay = lerp(r.ay, r.targetAy, mt);
    const bx = lerp(r.bx, r.targetBx, mt);
    const by = lerp(r.by, r.targetBy, mt);
    const hue = lerp(r.hue, r.targetHue, mt);
    const amp = 0.5 + audio.bass * 0.5;
    const lw = 1.2 + audio.mid * 2;
    const po = r.phase + time;
    const baseProj = project(cx, cy, ribbonZ, cx, cy, cam);
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.globalAlpha = 0.6 + audio.energy * 0.15;
    ctx.lineWidth = depthSize(lw, baseProj.scale, 0.3);
    ctx.lineCap = "round";
    ctx.beginPath();
    for (let p = 0; p < POINTS; p++) {
      const t = (p / POINTS) * Math.PI * 2;
      const x =
        cx +
        baseScale *
          amp *
          (Math.sin(ax * t + po) + 0.3 * Math.sin(bx * t * 2.1 + po * 1.3));
      const y =
        cy +
        baseScale *
          amp *
          (Math.cos(ay * t + po * 0.7) +
            0.3 * Math.cos(by * t * 1.7 + po * 0.9));
      const zp = ribbonZ + Math.sin(t * 2 + r.phase) * 60;
      const proj = project(x, y, zp, cx, cy, cam);
      if (p === 0) ctx.moveTo(proj.sx, proj.sy);
      else ctx.lineTo(proj.sx, proj.sy);
    }
    ctx.closePath();
    const sat = 80 + audio.energy * 15;
    const lit = 42 + audio.energy * 13;
    const color = `hsl(${hue}, ${sat}%, ${lit}%)`;
    ctx.strokeStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 8 + audio.energy * 10;
    ctx.stroke();
    ctx.restore();
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
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  time: number,
  audio: AudioBands,
  spiro: SpiroState,
  cam: Camera,
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
  const cx = w / 2;
  const cy = h / 2;
  const scale = Math.min(w, h) * 0.3 * (0.6 + audio.energy * 0.4);
  for (let layer = 0; layer < SPIRO_LAYERS; layer++) {
    const baseZ = SPIRO_LAYER_Z[layer];
    const hue = (spiro.hueBase + layer * 150 + time * 20) % 360;
    const layerPhase = time * (1 + layer * 0.3);
    const baseProj = project(cx, cy, baseZ, cx, cy, cam);
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.globalAlpha = 0.6 + audio.energy * 0.2;
    ctx.lineWidth = depthSize(0.8 + audio.bass * 1.2, baseProj.scale, 0.3);
    ctx.beginPath();
    for (let i = 0; i < SPIRO_POINTS; i++) {
      const t = (i / SPIRO_POINTS) * Math.PI * 2 * Math.ceil(r);
      const rr = r + layer * 0.3;
      const x =
        cx +
        scale *
          ((R - rr) * Math.cos(t + layerPhase) +
            d * Math.cos(((R - rr) / rr) * t + layerPhase));
      const y =
        cy +
        scale *
          ((R - rr) * Math.sin(t + layerPhase) +
            d * Math.sin(((R - rr) / rr) * t + layerPhase));
      const z = baseZ + Math.sin(t * 3) * 80;
      const proj = project(x, y, z, cx, cy, cam);
      if (i === 0) ctx.moveTo(proj.sx, proj.sy);
      else ctx.lineTo(proj.sx, proj.sy);
    }
    const sat = 75 + audio.mid * 15;
    const lit = 40 + audio.high * 15;
    const color = `hsl(${hue}, ${sat}%, ${lit}%)`;
    ctx.strokeStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 4 + audio.energy * 6;
    ctx.stroke();
    ctx.restore();
  }
  spiro.hueBase = (spiro.hueBase + 0.15) % 360;
}

// ── Plasma (stateless) ───────────────────────────────────────────────────────

function drawPlasma(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  time: number,
  audio: AudioBands,
  cam: Camera,
) {
  const cx = w / 2;
  const cy = h / 2;
  const blobCount = 5;
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  for (let i = 0; i < blobCount; i++) {
    const z = i * 100 - 200;
    const angle = (i / blobCount) * Math.PI * 2 + time * (0.3 + i * 0.1);
    const dist = Math.min(w, h) * 0.15 * (1 + audio.bass * 0.8);
    const bx = cx + Math.cos(angle) * dist;
    const by = cy + Math.sin(angle) * dist;
    const proj = project(bx, by, z, cx, cy, cam);
    const baseRadius =
      Math.min(w, h) *
      (0.2 + audio.energy * 0.25 + Math.sin(time * 2 + i) * 0.05);
    const radius = depthSize(baseRadius, proj.scale, 10);
    const hue = (time * 30 + i * 72) % 360;
    const grad = ctx.createRadialGradient(
      proj.sx,
      proj.sy,
      0,
      proj.sx,
      proj.sy,
      radius,
    );
    grad.addColorStop(0, `hsla(${hue}, 90%, 60%, ${0.3 + audio.mid * 0.3})`);
    grad.addColorStop(
      0.5,
      `hsla(${(hue + 40) % 360}, 85%, 45%, ${0.15 + audio.high * 0.15})`,
    );
    grad.addColorStop(1, "hsla(0, 0%, 0%, 0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  }
  ctx.restore();
}

// ── Starburst (uses analyser directly) ───────────────────────────────────────

function drawStarburst(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  time: number,
  audio: AudioBands,
  analyser: AnalyserNode | null,
  playing: boolean,
  cam: Camera,
) {
  const cx = w / 2;
  const cy = h / 2;
  const maxR = Math.min(w, h) * 0.42;
  const rays = 128;
  let freqData: Uint8Array<ArrayBuffer> | null = null;
  if (analyser && playing) {
    freqData = new Uint8Array(
      analyser.frequencyBinCount,
    ) as Uint8Array<ArrayBuffer>;
    analyser.getByteFrequencyData(freqData);
  }
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.globalAlpha = 0.45;
  const rotation = time * 0.15;
  for (let i = 0; i < rays; i++) {
    const angle = (i / rays) * Math.PI * 2 + rotation;
    const val = freqData ? freqData[i % freqData.length] / 255 : 0;
    const len = maxR * (0.1 + val * 0.9);
    const ex = cx + Math.cos(angle) * len;
    const ey = cy + Math.sin(angle) * len;
    const z = val * 300;
    const proj = project(ex, ey, z, cx, cy, cam);
    const hue = (i / rays) * 360 + time * 40;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(proj.sx, proj.sy);
    const color = `hsl(${hue % 360}, ${80 + val * 15}%, ${35 + val * 25}%)`;
    ctx.strokeStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 4 + val * 6;
    ctx.lineWidth = depthSize(0.8 + val * 1.8, proj.scale, 0.3);
    ctx.stroke();
  }
  const coreGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxR * 0.15);
  coreGrad.addColorStop(
    0,
    `hsla(${(time * 60) % 360}, 80%, 70%, ${0.3 + audio.bass * 0.3})`,
  );
  coreGrad.addColorStop(1, "hsla(0, 0%, 0%, 0)");
  ctx.fillStyle = coreGrad;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

// ── Vortex ───────────────────────────────────────────────────────────────────

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
      z: Math.random() * MAX_DEPTH,
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
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  _time: number,
  audio: AudioBands,
  particles: VortexParticle[],
  cam: Camera,
) {
  const cx = w / 2;
  const cy = h / 2;
  const maxR = Math.min(w, h) * 0.42;
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  for (const p of particles) {
    p.angle += p.speed * 0.02 * (1 + audio.energy);
    p.radius += (0.003 + audio.bass * 0.005) * p.speed;
    p.z += p.speed * 2;
    if (p.radius > 1 || p.z > MAX_DEPTH) resetVortexParticle(p);
    p.hue = (p.hue + 0.3) % 360;
    const r = p.radius * maxR;
    const x = cx + Math.cos(p.angle) * r;
    const y = cy + Math.sin(p.angle) * r;
    const proj = project(x, y, p.z, cx, cy, cam);
    const dAlpha = depthAlpha(p.z);
    const radialFade = Math.sin(p.radius * Math.PI);
    const alpha = radialFade * dAlpha;
    const sz =
      depthSize(p.size * (1 + audio.mid * 2), proj.scale, 0.5) * radialFade;
    ctx.beginPath();
    ctx.arc(proj.sx, proj.sy, Math.max(0.5, sz), 0, Math.PI * 2);
    const color = `hsla(${p.hue}, 90%, ${55 + audio.high * 20}%, ${alpha * 0.8})`;
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 6 + audio.energy * 8;
    ctx.fill();
  }
  ctx.restore();
}

// ── Export ────────────────────────────────────────────────────────────────────

export const originalScenes: Scene[] = [
  {
    name: "Ribbons",
    init: () => Array.from({ length: 5 }, (_, i) => initRibbon(i, 5)),
    draw: (dc, state) => {
      drawRibbons(
        dc.ctx,
        dc.w,
        dc.h,
        dc.time,
        dc.audio,
        state as RibbonState[],
        dc.cam,
      );
    },
  },
  {
    name: "Spirograph",
    init: () => initSpiro(),
    draw: (dc, state) => {
      drawSpirograph(
        dc.ctx,
        dc.w,
        dc.h,
        dc.time,
        dc.audio,
        state as SpiroState,
        dc.cam,
      );
    },
  },
  {
    name: "Plasma",
    init: () => null,
    draw: (dc) => {
      drawPlasma(dc.ctx, dc.w, dc.h, dc.time, dc.audio, dc.cam);
    },
  },
  {
    name: "Starburst",
    init: () => null,
    draw: (dc) => {
      drawStarburst(
        dc.ctx,
        dc.w,
        dc.h,
        dc.time,
        dc.audio,
        dc.analyser,
        dc.playing,
        dc.cam,
      );
    },
  },
  {
    name: "Vortex",
    init: () => initVortexParticles(200),
    draw: (dc, state) => {
      drawVortex(
        dc.ctx,
        dc.w,
        dc.h,
        dc.time,
        dc.audio,
        state as VortexParticle[],
        dc.cam,
      );
    },
  },
];
