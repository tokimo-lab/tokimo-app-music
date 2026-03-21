/**
 * WebGL utilities for the Alchemy 3D visualizer.
 * Shaders, geometry builders, glow texture, and buffer upload.
 */
import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  LinearFilter,
} from "three";
import type { SceneBuffer } from "./scene-buffer";
import type { MorphModifier } from "./transitions";

// ── Constants ────────────────────────────────────────────────────────────────

export const CAM_FOV = 60;
export const BASE_Z = 10;
const MAX_DEPTH = 1200;
const DEPTH_RANGE = 8;
const MAX_PTS = 10000;
const MAX_SEGS = 8000;
const POINT_GLOW_SIZE = 20;

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
  // Smooth radial glow for explicit point halos
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.15, "rgba(255,255,255,0.7)");
  grad.addColorStop(0.35, "rgba(255,255,255,0.25)");
  grad.addColorStop(0.55, "rgba(255,255,255,0.06)");
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

/** Fat line vertex shader — instanced quads extruded in screen space. */
export const FAT_LINE_VS = `
attribute vec3 instanceStart;
attribute vec3 instanceEnd;
attribute vec4 instanceColorStart;
attribute vec4 instanceColorEnd;
uniform float lineWidth;
uniform vec2 resolution;
uniform float uOpacity;
varying vec4 vColor;
varying float vEdge;
void main() {
  float side = position.x;
  float t = position.y;
  vColor = mix(instanceColorStart, instanceColorEnd, t);
  vColor.a *= uOpacity;
  vEdge = side * 0.5;
  vec4 cs = projectionMatrix * modelViewMatrix * vec4(instanceStart, 1.0);
  vec4 ce = projectionMatrix * modelViewMatrix * vec4(instanceEnd, 1.0);
  vec4 cp = mix(cs, ce, t);
  vec2 d = ce.xy / ce.w - cs.xy / cs.w;
  vec2 px = d * resolution * 0.5;
  float pxLen = length(px);
  if (pxLen < 0.001) { gl_Position = cp; return; }
  vec2 norm = vec2(-px.y, px.x) / pxLen;
  cp.xy += norm * lineWidth * side * 2.0 / resolution * cp.w;
  gl_Position = cp;
}`;

/** Fat line fragment shader — soft edge falloff for natural neon bloom. */
export const FAT_LINE_FS = `
varying vec4 vColor;
varying float vEdge;
void main() {
  float edge = 1.0 - smoothstep(0.3, 0.5, abs(vEdge));
  vec3 rgb = vColor.rgb * 2.5;
  gl_FragColor = vec4(rgb, vColor.a * edge);
  if (gl_FragColor.a < 0.005) discard;
}`;

// ── Bloom shaders ────────────────────────────────────────────────────────────

export const BLOOM_VS = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

/** 9-tap Gaussian blur — direction vector encodes step scale. */
export const BLUR_FS = `
uniform sampler2D tInput;
uniform vec2 direction;
uniform vec2 resolution;
varying vec2 vUv;
void main() {
  vec2 off = direction / resolution;
  vec4 c = vec4(0.0);
  c += texture2D(tInput, vUv - 4.0 * off) * 0.0162;
  c += texture2D(tInput, vUv - 3.0 * off) * 0.0540;
  c += texture2D(tInput, vUv - 2.0 * off) * 0.1218;
  c += texture2D(tInput, vUv - 1.0 * off) * 0.1944;
  c += texture2D(tInput, vUv)              * 0.2270;
  c += texture2D(tInput, vUv + 1.0 * off) * 0.1944;
  c += texture2D(tInput, vUv + 2.0 * off) * 0.1218;
  c += texture2D(tInput, vUv + 3.0 * off) * 0.0540;
  c += texture2D(tInput, vUv + 4.0 * off) * 0.0162;
  gl_FragColor = c;
}`;

/** Extract and amplify scene for bloom input (gives 1px lines enough energy). */
export const EXTRACT_FS = `
uniform sampler2D tInput;
uniform float amplify;
varying vec2 vUv;
void main() {
  vec4 c = texture2D(tInput, vUv);
  float lum = dot(c.rgb, vec3(0.299, 0.587, 0.114));
  // Very low threshold — exclude only pure black; let all visible pixels bloom
  gl_FragColor = c * amplify * smoothstep(0.003, 0.06, lum);
}`;

/** Display: main frame + bloom composite with soft tone mapping. */
export const DISPLAY_FS = `
uniform sampler2D tMain;
uniform sampler2D tBloom;
uniform float bloomStrength;
varying vec2 vUv;
void main() {
  vec4 main = texture2D(tMain, vUv);
  vec4 bloom = texture2D(tBloom, vUv);
  vec3 c = main.rgb + bloom.rgb * bloomStrength;
  // Mild Reinhard tone map — keeps colors vivid while preventing blow-out
  c = c / (1.0 + c * 0.12);
  gl_FragColor = vec4(c, 1.0);
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

export function makeFatLineGeo(): InstancedBufferGeometry {
  const geo = new InstancedBufferGeometry();
  // Template quad: position.x = side (-1/+1), position.y = t (0/1)
  geo.setAttribute(
    "position",
    new BufferAttribute(
      new Float32Array([-1, 0, 0, 1, 0, 0, -1, 1, 0, 1, 1, 0]),
      3,
    ),
  );
  geo.setIndex([0, 1, 2, 2, 1, 3]);
  // Pre-allocated per-instance attributes
  geo.setAttribute(
    "instanceStart",
    new InstancedBufferAttribute(new Float32Array(MAX_SEGS * 3), 3),
  );
  geo.setAttribute(
    "instanceEnd",
    new InstancedBufferAttribute(new Float32Array(MAX_SEGS * 3), 3),
  );
  geo.setAttribute(
    "instanceColorStart",
    new InstancedBufferAttribute(new Float32Array(MAX_SEGS * 4), 4),
  );
  geo.setAttribute(
    "instanceColorEnd",
    new InstancedBufferAttribute(new Float32Array(MAX_SEGS * 4), 4),
  );
  geo.instanceCount = 0;
  return geo;
}

// ── Upload SceneBuffer → GPU ─────────────────────────────────────────────────

export function uploadBuffer(
  buf: SceneBuffer,
  ptGeo: BufferGeometry,
  lineGeo: InstancedBufferGeometry,
  h: number,
) {
  const ps = (2 * BASE_Z * Math.tan((CAM_FOV * Math.PI) / 360)) / h;
  const ds = DEPTH_RANGE / MAX_DEPTH;
  const ss = (2 * BASE_Z) / h;
  const glowSz = POINT_GLOW_SIZE * ss;
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

  // Sample line-segment midpoints as tiny morph particles.
  // These are nearly invisible in normal rendering but provide
  // point-cloud density for morph transitions in line-heavy scenes.
  for (let i = 0; i < buf.segN && n < MAX_PTS; i += 3) {
    const si = i * 14;
    pp.array[n * 3] = ((buf.segs[si] + buf.segs[si + 7]) / 2) * ps;
    pp.array[n * 3 + 1] = (-(buf.segs[si + 1] + buf.segs[si + 8]) / 2) * ps;
    pp.array[n * 3 + 2] = (-(buf.segs[si + 2] + buf.segs[si + 9]) / 2) * ds;
    pc.array[n * 4] = (buf.segs[si + 3] + buf.segs[si + 10]) / 2;
    pc.array[n * 4 + 1] = (buf.segs[si + 4] + buf.segs[si + 11]) / 2;
    pc.array[n * 4 + 2] = (buf.segs[si + 5] + buf.segs[si + 12]) / 2;
    pc.array[n * 4 + 3] = 0.001;
    pz.array[n] = 0.001;
    n++;
  }

  ptGeo.setDrawRange(0, n);
  pp.needsUpdate = pc.needsUpdate = pz.needsUpdate = true;

  // Upload fat line instances
  const iS = lineGeo.attributes.instanceStart as InstancedBufferAttribute;
  const iE = lineGeo.attributes.instanceEnd as InstancedBufferAttribute;
  const iCS = lineGeo.attributes.instanceColorStart as InstancedBufferAttribute;
  const iCE = lineGeo.attributes.instanceColorEnd as InstancedBufferAttribute;
  const segCount = Math.min(buf.segN, MAX_SEGS);
  for (let i = 0; i < segCount; i++) {
    const si = i * 14;
    iS.array[i * 3] = buf.segs[si] * ps;
    iS.array[i * 3 + 1] = -buf.segs[si + 1] * ps;
    iS.array[i * 3 + 2] = -buf.segs[si + 2] * ds;
    iE.array[i * 3] = buf.segs[si + 7] * ps;
    iE.array[i * 3 + 1] = -buf.segs[si + 8] * ps;
    iE.array[i * 3 + 2] = -buf.segs[si + 9] * ds;
    iCS.array[i * 4] = buf.segs[si + 3];
    iCS.array[i * 4 + 1] = buf.segs[si + 4];
    iCS.array[i * 4 + 2] = buf.segs[si + 5];
    iCS.array[i * 4 + 3] = buf.segs[si + 6];
    iCE.array[i * 4] = buf.segs[si + 10];
    iCE.array[i * 4 + 1] = buf.segs[si + 11];
    iCE.array[i * 4 + 2] = buf.segs[si + 12];
    iCE.array[i * 4 + 3] = buf.segs[si + 13];
  }
  lineGeo.instanceCount = segCount;
  iS.needsUpdate = iE.needsUpdate = iCS.needsUpdate = iCE.needsUpdate = true;
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
