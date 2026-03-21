/**
 * WebGL utilities for the Alchemy 3D visualizer.
 * Shaders, geometry builders, glow texture, and buffer upload.
 */
import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  LinearFilter,
} from "three";
import type { SceneBuffer } from "./scene-buffer";
import type { MorphModifier } from "./transitions";

// ── Constants ────────────────────────────────────────────────────────────────

export const CAM_FOV = 60;
export const BASE_Z = 10;
const MAX_DEPTH = 1200;
const DEPTH_RANGE = 8;
const MAX_PTS = 100000;
const MAX_SEGS = 8000;
const LINE_GLOW_SIZE = 26;
/** Spacing between glow sprites along a line (fraction of glow radius) */
const GLOW_SPACING = 0.14;

// ── Glow texture ─────────────────────────────────────────────────────────────

export function makeGlowTexture(size = 64): CanvasTexture {
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const g = c.getContext("2d")!;
  const center = size / 2;
  const grad = g.createRadialGradient(
    center,
    center,
    0,
    center,
    center,
    center,
  );
  // Wide flat-top core (no brightness modulation between sprites)
  // then rapid drop → subtle outer halo, no defocus
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.4, "rgba(255,255,255,1)");
  grad.addColorStop(0.5, "rgba(255,255,255,0.35)");
  grad.addColorStop(0.65, "rgba(255,255,255,0.08)");
  grad.addColorStop(0.8, "rgba(255,255,255,0.02)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  const tex = new CanvasTexture(c);
  tex.minFilter = LinearFilter;
  tex.magFilter = LinearFilter;
  return tex;
}

// ── Shaders ──────────────────────────────────────────────────────────────────

export const POINT_VS = `
attribute float aSize;
attribute vec4 aColor;
varying vec4 vColor;
uniform float uScale;
uniform float uOpacity;
void main() {
  vColor = aColor * vec4(1.0, 1.0, 1.0, uOpacity);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = max(1.0, aSize * (uScale / -mv.z));
  gl_Position = projectionMatrix * mv;
}`;

export const POINT_FS = `
uniform sampler2D glowMap;
varying vec4 vColor;
void main() {
  vec4 t = texture2D(glowMap, gl_PointCoord);
  gl_FragColor = vColor * t;
  if (gl_FragColor.a < 0.005) discard;
}`;

export const LINE_VS = `
attribute vec4 aColor;
varying vec4 vColor;
uniform float uOpacity;
void main() {
  vColor = aColor * vec4(1.0, 1.0, 1.0, uOpacity);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

export const LINE_FS = `
varying vec4 vColor;
void main() {
  gl_FragColor = vColor;
  if (gl_FragColor.a < 0.005) discard;
}`;

// ── Geometry builders ────────────────────────────────────────────────────────

export function makePointGeo(): BufferGeometry {
  const geo = new BufferGeometry();
  geo.setAttribute(
    "position",
    new BufferAttribute(new Float32Array(MAX_PTS * 3), 3),
  );
  geo.setAttribute(
    "aColor",
    new BufferAttribute(new Float32Array(MAX_PTS * 4), 4),
  );
  geo.setAttribute("aSize", new BufferAttribute(new Float32Array(MAX_PTS), 1));
  geo.setDrawRange(0, 0);
  return geo;
}

export function makeLineGeo(): BufferGeometry {
  const geo = new BufferGeometry();
  const v = MAX_SEGS * 2;
  geo.setAttribute("position", new BufferAttribute(new Float32Array(v * 3), 3));
  geo.setAttribute("aColor", new BufferAttribute(new Float32Array(v * 4), 4));
  geo.setDrawRange(0, 0);
  return geo;
}

// ── Upload SceneBuffer → GPU ─────────────────────────────────────────────────

export function uploadBuffer(
  buf: SceneBuffer,
  ptGeo: BufferGeometry,
  lineGeo: BufferGeometry,
  h: number,
) {
  const ps = (2 * BASE_Z * Math.tan((CAM_FOV * Math.PI) / 360)) / h;
  const ds = DEPTH_RANGE / MAX_DEPTH;
  const ss = (2 * BASE_Z) / h;
  const glowSz = LINE_GLOW_SIZE * ss;
  const pp = ptGeo.attributes.position as BufferAttribute;
  const pc = ptGeo.attributes.aColor as BufferAttribute;
  const pz = ptGeo.attributes.aSize as BufferAttribute;

  // Upload explicit scene points: bright core + glow halo behind each
  let n = 0;
  for (let i = 0; i < buf.ptN && n + 1 < MAX_PTS; i++) {
    const si = i * 8;
    const wx = buf.pts[si] * ps;
    const wy = -buf.pts[si + 1] * ps;
    const wz = -buf.pts[si + 2] * ds;
    const r = buf.pts[si + 3];
    const g = buf.pts[si + 4];
    const b = buf.pts[si + 5];
    const a = buf.pts[si + 6];
    const sz = buf.pts[si + 7] * ss;

    // Glow halo (larger, dimmer) — emitted first so core draws on top
    pp.array[n * 3] = wx;
    pp.array[n * 3 + 1] = wy;
    pp.array[n * 3 + 2] = wz;
    pc.array[n * 4] = r;
    pc.array[n * 4 + 1] = g;
    pc.array[n * 4 + 2] = b;
    pc.array[n * 4 + 3] = a * 0.3;
    pz.array[n] = Math.max(glowSz, sz * 2.5);
    n++;

    // Bright core
    pp.array[n * 3] = wx;
    pp.array[n * 3 + 1] = wy;
    pp.array[n * 3 + 2] = wz;
    pc.array[n * 4] = r;
    pc.array[n * 4 + 1] = g;
    pc.array[n * 4 + 2] = b;
    pc.array[n * 4 + 3] = a;
    pz.array[n] = sz * 2;
    n++;
  }

  // Add glow point sprites along line segments → neon halo effect
  for (let i = 0; i < buf.segN && n + 2 < MAX_PTS; i++) {
    const si = i * 14;
    // Start vertex
    const x0 = buf.segs[si] * ps;
    const y0 = -buf.segs[si + 1] * ps;
    const z0 = -buf.segs[si + 2] * ds;
    const r0 = buf.segs[si + 3];
    const g0 = buf.segs[si + 4];
    const b0 = buf.segs[si + 5];
    const a0 = buf.segs[si + 6];
    // End vertex
    const x1 = buf.segs[si + 7] * ps;
    const y1 = -buf.segs[si + 8] * ps;
    const z1 = -buf.segs[si + 9] * ds;
    const r1 = buf.segs[si + 10];
    const g1 = buf.segs[si + 11];
    const b1 = buf.segs[si + 12];
    const a1 = buf.segs[si + 13];

    // Compute distance in world coords and number of glow sprites needed
    const dx = x1 - x0;
    const dy = y1 - y0;
    const dz = z1 - z0;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const spacing = glowSz * GLOW_SPACING;
    const steps = Math.max(1, Math.ceil(dist / spacing));
    const clampedSteps = Math.min(steps, 128);

    for (let s = 0; s <= clampedSteps && n < MAX_PTS; s++) {
      const t = clampedSteps > 0 ? s / clampedSteps : 0;
      pp.array[n * 3] = x0 + dx * t;
      pp.array[n * 3 + 1] = y0 + dy * t;
      pp.array[n * 3 + 2] = z0 + dz * t;
      pc.array[n * 4] = r0 + (r1 - r0) * t;
      pc.array[n * 4 + 1] = g0 + (g1 - g0) * t;
      pc.array[n * 4 + 2] = b0 + (b1 - b0) * t;
      pc.array[n * 4 + 3] = (a0 + (a1 - a0) * t) * 0.65;
      pz.array[n] = glowSz;
      n++;
    }
  }
  ptGeo.setDrawRange(0, n);
  pp.needsUpdate = pc.needsUpdate = pz.needsUpdate = true;

  // Upload line segments
  const lp = lineGeo.attributes.position as BufferAttribute;
  const lc = lineGeo.attributes.aColor as BufferAttribute;
  for (let i = 0; i < buf.segN; i++) {
    const si = i * 14;
    for (let v = 0; v < 2; v++) {
      const vi = i * 2 + v;
      const so = si + v * 7;
      lp.array[vi * 3] = buf.segs[so] * ps;
      lp.array[vi * 3 + 1] = -buf.segs[so + 1] * ps;
      lp.array[vi * 3 + 2] = -buf.segs[so + 2] * ds;
      lc.array[vi * 4] = buf.segs[so + 3];
      lc.array[vi * 4 + 1] = buf.segs[so + 4];
      lc.array[vi * 4 + 2] = buf.segs[so + 5];
      lc.array[vi * 4 + 3] = buf.segs[so + 6];
    }
  }
  lineGeo.setDrawRange(0, buf.segN * 2);
  lp.needsUpdate = lc.needsUpdate = true;
}

// ── Point-cloud morph transition ─────────────────────────────────────────────

export interface PointSnapshot {
  positions: Float32Array;
  colors: Float32Array;
  sizes: Float32Array;
  count: number;
}

/** Deterministic pseudo-random in [-1, 1], stable across frames. */
function prand(i: number, ch: number): number {
  const x = Math.sin(i * 12.9898 + ch * 78.233) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
}

/** Capture the current point cloud for later morphing. */
export function snapshotPoints(geo: BufferGeometry): PointSnapshot {
  const n = geo.drawRange.count;
  const p = (geo.attributes.position as BufferAttribute).array as Float32Array;
  const c = (geo.attributes.aColor as BufferAttribute).array as Float32Array;
  const s = (geo.attributes.aSize as BufferAttribute).array as Float32Array;
  return {
    positions: Float32Array.from(p.subarray(0, n * 3)),
    colors: Float32Array.from(c.subarray(0, n * 4)),
    sizes: Float32Array.from(s.subarray(0, n)),
    count: n,
  };
}

/**
 * Morph point cloud from `src` snapshot → current `geo` data (destination).
 * `t` goes 0→1. The `morph` modifier adds per-point displacement.
 */
export function applyMorph(
  geo: BufferGeometry,
  src: PointSnapshot,
  t: number,
  morph: MorphModifier,
) {
  const pp = geo.attributes.position as BufferAttribute;
  const pc = geo.attributes.aColor as BufferAttribute;
  const pz = geo.attributes.aSize as BufferAttribute;
  const dstN = geo.drawRange.count;
  const srcN = src.count;
  const maxN = Math.min(Math.max(srcN, dstN), MAX_PTS);
  const st = t * t * (3 - 2 * t); // smoothstep

  for (let i = 0; i < maxN; i++) {
    const inS = i < srcN;
    const inD = i < dstN;

    const sx = inS ? src.positions[i * 3] : prand(i, 0) * 5;
    const sy = inS ? src.positions[i * 3 + 1] : prand(i, 1) * 5;
    const spz = inS ? src.positions[i * 3 + 2] : prand(i, 2) * 3 - BASE_Z;
    const dx = inD ? pp.array[i * 3] : prand(i, 3) * 5;
    const dy = inD ? pp.array[i * 3 + 1] : prand(i, 4) * 5;
    const dpz = inD ? pp.array[i * 3 + 2] : prand(i, 5) * 3 - BASE_Z;

    const [ox, oy, oz] = morph(i, sx, sy, spz, dx, dy, dpz, t, st);
    pp.array[i * 3] = sx + (dx - sx) * st + ox;
    pp.array[i * 3 + 1] = sy + (dy - sy) * st + oy;
    pp.array[i * 3 + 2] = spz + (dpz - spz) * st + oz;

    const sr = inS ? src.colors[i * 4] : 0;
    const sg = inS ? src.colors[i * 4 + 1] : 0;
    const sb = inS ? src.colors[i * 4 + 2] : 0;
    const sa = inS ? src.colors[i * 4 + 3] : 0;
    const dr = inD ? pc.array[i * 4] : 0;
    const dg = inD ? pc.array[i * 4 + 1] : 0;
    const db = inD ? pc.array[i * 4 + 2] : 0;
    const da = inD ? pc.array[i * 4 + 3] : 0;

    const fade = inS && inD ? 1 : inD ? t : 1 - t;
    pc.array[i * 4] = sr + (dr - sr) * st;
    pc.array[i * 4 + 1] = sg + (dg - sg) * st;
    pc.array[i * 4 + 2] = sb + (db - sb) * st;
    pc.array[i * 4 + 3] = (sa + (da - sa) * st) * fade;

    const sSz = inS ? src.sizes[i] : 0;
    const dSz = inD ? pz.array[i] : 0;
    pz.array[i] = sSz + (dSz - sSz) * st;
  }

  geo.setDrawRange(0, maxN);
  pp.needsUpdate = pc.needsUpdate = pz.needsUpdate = true;
}
