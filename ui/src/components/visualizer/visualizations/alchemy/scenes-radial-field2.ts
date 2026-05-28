import { S, snoise, TAU } from "./helpers";
import { hsl } from "./scene-buffer";
import type { Scene } from "./types";
import { clamp } from "./utils";

const { sin, cos, hypot, max } = Math;
const nil = () => null;

const interference: Scene = {
  name: "Interference",
  init: nil,
  draw(dc) {
    const { buf, w, h, time, audio } = dc;
    const r = S(w, h);
    const sources = [
      { x: -w * 0.15, y: -h * 0.05, z: 0 },
      { x: w * 0.15, y: -h * 0.05, z: 150 },
      { x: 0, y: h * 0.12, z: 300 },
    ];
    const sp = r * 0.08 * (0.8 + audio.bass * 0.4);
    for (const src of sources) {
      for (let ring = 0; ring < 12; ring++) {
        const rad = (ring * sp + time * 60) % (r * 0.8);
        const hue = (ring * 30 + time * 20 + (src.x + w / 2) * 0.5) % 360;
        const alpha =
          clamp(0.5 - ring * 0.015, 0.3, 0.5) * max(0, 1 - src.z / 400);
        const [cr, cg, cb] = hsl(hue, 85, 45);
        buf.circle(src.x, src.y, src.z, rad, cr, cg, cb, alpha);
      }
    }
  },
};

const flowField: Scene = {
  name: "Flow Field",
  init: nil,
  draw(dc) {
    const { buf, w, h, time, audio } = dc;
    const step = S(w, h) * 0.04;
    const len = step * 0.7 * (0.6 + audio.energy * 0.6);
    const hw = w / 2,
      hh = h / 2;
    for (let x = step; x < w - step; x += step) {
      for (let y = step; y < h - step; y += step) {
        const nx = (x / w) * 4 + time * 0.3;
        const ny = (y / h) * 4 + time * 0.2;
        const a = snoise(nx, ny) * TAU;
        const z = (snoise(nx * 0.7, ny * 0.7) * 0.5 + 0.5) * 200;
        const hue = (snoise(nx * 0.5, ny * 0.5) * 180 + 200 + time * 10) % 360;
        const alpha = 0.45 * max(0, 1 - z / 300);
        const [cr, cg, cb] = hsl(hue, 85, 45);
        buf.lineStart();
        buf.lineTo(
          x - cos(a) * len * 0.5 - hw,
          y - sin(a) * len * 0.5 - hh,
          z,
          cr,
          cg,
          cb,
          alpha,
        );
        buf.lineTo(
          x + cos(a) * len * 0.5 - hw,
          y + sin(a) * len * 0.5 - hh,
          z,
          cr,
          cg,
          cb,
          alpha,
        );
      }
    }
  },
};

const terrain: Scene = {
  name: "Terrain",
  init: nil,
  draw(dc) {
    const { buf, w, h, time, audio } = dc;
    const hw = w / 2,
      hh = h / 2;
    for (let l = 0; l < 8; l++) {
      const by = h * (0.3 + l * 0.08);
      const hue = (200 + l * 20 + time * 8) % 360;
      const z = l * 60;
      const alpha = clamp(0.55 - l * 0.03, 0.3, 0.55) * max(0, 1 - z / 600);
      const [cr, cg, cb] = hsl(hue, 85, 45);
      buf.lineStart();
      for (let x = 0; x <= w; x += 3) {
        const f = x / w;
        const y =
          by +
          sin(f * 3 + time * 0.4 + l * 0.8) * h * 0.05 +
          sin(f * 7 + l * 2.3) * h * 0.03 +
          sin(f * 13 + time * 0.2 + l) * h * 0.015 * (1 + audio.bass);
        buf.lineTo(x - hw, y - hh, z, cr, cg, cb, alpha);
      }
    }
  },
};

const gridPulse: Scene = {
  name: "Grid Pulse",
  init: nil,
  draw(dc) {
    const { buf, w, h, time, audio } = dc;
    const step = S(w, h) / 20;
    const hw = w / 2,
      hh = h / 2;
    const md = hypot(hw, hh);
    for (let gx = step / 2; gx < w; gx += step) {
      for (let gy = step / 2; gy < h; gy += step) {
        const d = hypot(gx - hw, gy - hh);
        const wave = sin(d * 0.04 - time * 3) * 0.5 + 0.5;
        const z = (d / md) * 300;
        const dotR = step * 0.15 * (wave + audio.energy * 0.8);
        const hue = ((d / md) * 180 + time * 25) % 360;
        const alpha = 0.5 * max(0, 1 - z / 400);
        const [cr, cg, cb] = hsl(hue, 85, 45);
        buf.point(gx - hw, gy - hh, z, cr, cg, cb, alpha, max(dotR, 1));
      }
    }
  },
};

const sineLayers: Scene = {
  name: "Sine Layers",
  init: nil,
  draw(dc) {
    const { buf, w, h, time, audio } = dc;
    const hw = w / 2,
      hh = h / 2;
    for (let i = 0; i < 7; i++) {
      const fr = 1.5 + i * 0.7;
      const amp = h * 0.06 * (1 + audio.bass * 0.5);
      const by = h * (0.3 + i * 0.06);
      const z = i * 50;
      const hue = (i * 50 + time * 15) % 360;
      const alpha = 0.4 * max(0, 1 - z / 400);
      const [cr, cg, cb] = hsl(hue, 85, 45);
      buf.lineStart();
      for (let x = 0; x <= w; x += 3) {
        const f = x / w;
        const y =
          by +
          sin(f * TAU * fr + time * (0.8 + i * 0.2)) * amp +
          sin(f * TAU * fr * 2.3 + time * 1.1) * amp * 0.3;
        buf.lineTo(x - hw, y - hh, z, cr, cg, cb, alpha);
      }
    }
  },
};

const liquidBlobs: Scene = {
  name: "Liquid Blobs",
  init: nil,
  draw(dc) {
    const { buf, w, h, time, audio } = dc;
    const r = S(w, h);
    for (let i = 0; i < 5; i++) {
      const a = (TAU / 5) * i + time * 0.3;
      const dist =
        r * 0.15 * (1 + sin(time * 0.7 + i * 1.3) * 0.5 + audio.bass * 0.3);
      const bx = cos(a) * dist;
      const by = sin(a) * dist;
      const z = i * 80;
      const br = r * 0.12 * (0.7 + audio.energy * 0.5 + sin(time + i) * 0.2);
      const hue = (i * 72 + time * 12) % 360;
      const alpha = 0.6 * max(0, 1 - z / 500);
      const [cr, cg, cb] = hsl(hue, 85, 50);
      buf.point(bx, by, z, cr, cg, cb, alpha, br);
    }
  },
};

const tunnelZoom: Scene = {
  name: "Tunnel Zoom",
  init: nil,
  draw(dc) {
    const { buf, w, h, time } = dc;
    const r = S(w, h) * 0.45;
    for (let i = 0; i < 15; i++) {
      const frac = (i / 15 + time * 0.15) % 1;
      const sz = r * frac;
      const z = frac * 800;
      const hue = (i * 25 + time * 30) % 360;
      const alpha = clamp(0.6 - frac * 0.3, 0.3, 0.6) * max(0, 1 - z / 900);
      const [cr, cg, cb] = hsl(hue, 85, 45);
      buf.circle(0, 0, z, sz, cr, cg, cb, alpha);
    }
  },
};

export const radialFieldScenes2: Scene[] = [
  interference,
  flowField,
  terrain,
  gridPulse,
  sineLayers,
  liquidBlobs,
  tunnelZoom,
];
