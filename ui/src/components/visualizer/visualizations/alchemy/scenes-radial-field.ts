import { S, TAU } from "./helpers";
import { hsl } from "./scene-buffer";
import type { Scene } from "./types";
import { clamp, getFrequencyData, hash } from "./utils";

const PHI = 2.39996323;
const { sin, cos, sqrt, floor, abs, PI } = Math;
const nil = () => null;

const mandala: Scene = {
  name: "Mandala",
  init: nil,
  draw(dc) {
    const { buf, w, h, time, audio } = dc;
    const r = S(w, h) * 0.4;
    for (let layer = 0; layer < 4; layer++) {
      const dir = layer % 2 ? 1 : -1;
      const hue = (time * 25 + layer * 90) % 360;
      const rad = r * (0.3 + layer * 0.18) * (0.8 + audio.bass * 0.4);
      const rot = time * 0.3 * dir;
      const cosR = cos(rot),
        sinR = sin(rot);
      const z = layer * 100;
      const alpha = 0.5 * Math.max(0, 1 - z / 400);
      const [cr, cg, cb] = hsl(hue, 85, 45);
      for (let i = 0; i < 8; i++) {
        const a = (TAU / 8) * i;
        const px = cos(a) * rad * 0.4;
        const py = sin(a) * rad * 0.4;
        const rx = px * cosR - py * sinR;
        const ry = px * sinR + py * cosR;
        const ar = rad * (0.3 + audio.mid * 0.15);
        buf.arc(rx, ry, z, ar, a - 0.5, a + 0.5, cr, cg, cb, alpha);
      }
    }
  },
};

const kaleidoscope: Scene = {
  name: "Kaleidoscope",
  init: nil,
  draw(dc) {
    const { buf, w, h, time, audio } = dc;
    const r = S(w, h) * 0.42;
    const seg = 12;
    for (let i = 0; i < seg; i++) {
      const base = (TAU / seg) * i;
      for (let j = 0; j < 5; j++) {
        const z = j * 50;
        const hue = (time * 30 + j * 72 + i * 10) % 360;
        const d = r * (0.2 + j * 0.15);
        const wb = sin(time * 1.5 + j) * r * 0.05;
        const x = cos(base) * (d + wb) - sin(base) * wb * audio.mid;
        const y = sin(base) * (d + wb) + cos(base) * wb * audio.mid;
        const sz = r * 0.08 * (0.5 + audio.energy);
        const alpha = 0.45 * Math.max(0, 1 - z / 300);
        const [cr, cg, cb] = hsl(hue, 85, 45);
        buf.point(x, y, z, cr, cg, cb, alpha, sz);
      }
    }
  },
};

const radarSweep: Scene = {
  name: "Radar Sweep",
  init: () => ({
    dots: [] as { a: number; d: number; t: number; h: number; z: number }[],
  }),
  draw(dc, state) {
    const { buf, w, h, time, audio } = dc;
    type Dot = { a: number; d: number; t: number; h: number; z: number };
    const s = state as { dots: Dot[] };
    const r = S(w, h) * 0.4;
    const sweep = (time * 0.8) % TAU;
    const hue = (time * 40) % 360;
    const [cr, cg, cb] = hsl(hue, 85, 45);
    for (let i = 0; i <= 8; i++) {
      const alpha = 0.6 - i * 0.035;
      const a = sweep - i * 0.08;
      buf.lineStart();
      buf.lineTo(0, 0, 0, cr, cg, cb, alpha);
      buf.lineTo(cos(a) * r, sin(a) * r, 0, cr, cg, cb, alpha);
    }
    if (audio.energy > 0.1 && dc.frame % 3 === 0) {
      const h2 = hash(dc.frame);
      s.dots.push({
        a: sweep + (h2 - 0.5) * 0.3,
        d: hash(dc.frame * 7) * r,
        t: time,
        h: (hue + h2 * 120) % 360,
        z: 50 + hash(dc.frame * 13) * 250,
      });
    }
    s.dots = s.dots.filter((dot) => {
      const age = time - dot.t;
      if (age > 4) return false;
      const dx = cos(dot.a) * dot.d;
      const dy = sin(dot.a) * dot.d;
      const da =
        clamp(0.6 - age * 0.15, 0.3, 0.6) * Math.max(0, 1 - dot.z / 400);
      const [dr, dg, db] = hsl(dot.h, 85, 45);
      buf.point(dx, dy, dot.z, dr, dg, db, da, 3);
      return true;
    });
    for (let i = 1; i <= 4; i++) {
      const z = i * 40;
      buf.circle(0, 0, z, r * i * 0.25, cr, cg, cb, 0.3);
    }
  },
};

const sunflower: Scene = {
  name: "Sunflower",
  init: nil,
  draw(dc) {
    const { buf, w, h, time, audio } = dc;
    const r = S(w, h) * 0.4;
    const rot = time * 0.1;
    const cosR = cos(rot),
      sinR = sin(rot);
    for (let i = 0; i < 200; i++) {
      const frac = i / 200;
      const a = i * PHI + time * 0.2;
      const d = sqrt(frac) * r;
      const px = cos(a) * d;
      const py = sin(a) * d;
      const rx = px * cosR - py * sinR;
      const ry = px * sinR + py * cosR;
      const z = sqrt(frac) * 400;
      const hue = (i * 1.8 + time * 20) % 360;
      const sz = (2 + audio.bass * 4) * (0.5 + frac * 0.5);
      const alpha = 0.5 * Math.max(0, 1 - z / 500);
      const [cr, cg, cb] = hsl(hue, 85, 45);
      buf.point(rx, ry, z, cr, cg, cb, alpha, sz);
    }
  },
};

const radialBars: Scene = {
  name: "Radial Bars",
  init: nil,
  draw(dc) {
    const { buf, w, h, time, audio } = dc;
    const freq = getFrequencyData(dc.analyser, dc.playing);
    const r = S(w, h) * 0.2;
    const n = 64;
    const rot = time * 0.05;
    const cosR = cos(rot),
      sinR = sin(rot);
    for (let i = 0; i < n; i++) {
      const a = (TAU / n) * i;
      const v = freq ? freq[floor((i / n) * freq.length)] / 255 : audio.energy;
      const len = v * r * 1.5 + r * 0.05;
      const z = v * 200;
      const ix = cos(a) * r;
      const iy = sin(a) * r;
      const ox = cos(a) * (r + len);
      const oy = sin(a) * (r + len);
      const x1 = ix * cosR - iy * sinR;
      const y1 = ix * sinR + iy * cosR;
      const x2 = ox * cosR - oy * sinR;
      const y2 = ox * sinR + oy * cosR;
      const alpha = 0.55 * Math.max(0, 1 - z / 300);
      const [cr, cg, cb] = hsl(((i * 360) / n + time * 15) % 360, 85, 45);
      buf.lineStart();
      buf.lineTo(x1, y1, z, cr, cg, cb, alpha);
      buf.lineTo(x2, y2, z, cr, cg, cb, alpha);
    }
  },
};

const spiralArms: Scene = {
  name: "Spiral Arms",
  init: nil,
  draw(dc) {
    const { buf, w, h, time, audio } = dc;
    const r = S(w, h) * 0.42;
    for (let arm = 0; arm < 5; arm++) {
      const bh = (arm * 72 + time * 15) % 360;
      const off = (TAU / 5) * arm;
      const baseZ = arm * 60;
      const alpha = 0.4 * Math.max(0, 1 - baseZ / 400);
      const [cr, cg, cb] = hsl(bh, 85, 45);
      buf.lineStart();
      for (let t = 0; t < 100; t++) {
        const f = t / 100;
        const a = f * TAU * 2 + off + time * 0.3;
        const d = f * r * (0.8 + audio.bass * 0.3);
        const z = baseZ + f * 40;
        buf.lineTo(cos(a) * d, sin(a) * d, z, cr, cg, cb, alpha);
      }
      for (let t = 0; t < 20; t++) {
        const f = t / 20;
        const a = f * TAU * 2 + off + time * 0.3;
        const d = f * r * (0.8 + audio.bass * 0.3);
        const z = baseZ + f * 40;
        const ptAlpha = 0.5 * Math.max(0, 1 - z / 400);
        const [pr, pg, pb] = hsl((bh + f * 40) % 360, 85, 45);
        buf.point(
          cos(a) * d,
          sin(a) * d,
          z,
          pr,
          pg,
          pb,
          ptAlpha,
          2 + audio.high * 3 * f,
        );
      }
    }
  },
};

const flowerBloom: Scene = {
  name: "Flower Bloom",
  init: nil,
  draw(dc) {
    const { buf, w, h, time, audio } = dc;
    const r = S(w, h) * 0.35;
    for (let layer = 0; layer < 3; layer++) {
      const petals = 5 + layer * 2;
      const hue = (time * 20 + layer * 60) % 360;
      const size = r * (0.5 + layer * 0.2) * (0.5 + audio.bass * 0.5);
      const rot = time * 0.2 * (layer % 2 ? 1 : -1);
      const cosR = cos(rot),
        sinR = sin(rot);
      const z = layer * 120;
      const alpha = 0.45 * Math.max(0, 1 - z / 400);
      const [cr, cg, cb] = hsl(hue, 85, 45);
      buf.lineStart();
      for (let i = 0; i <= 360; i++) {
        const a = (i * PI) / 180;
        const rr = size * cos(petals * a + time * 0.5);
        const px = abs(rr) * cos(a);
        const py = abs(rr) * sin(a);
        const rx = px * cosR - py * sinR;
        const ry = px * sinR + py * cosR;
        buf.lineTo(rx, ry, z, cr, cg, cb, alpha);
      }
    }
  },
};

const aurora: Scene = {
  name: "Aurora",
  init: nil,
  draw(dc) {
    const { buf, w, h, time, audio } = dc;
    for (let ri = 0; ri < 5; ri++) {
      const by = h * (0.25 + ri * 0.1) + sin(time * 0.5 + ri) * h * 0.05;
      const hue = (120 + ri * 25 + time * 10) % 360;
      const z = ri * 80;
      const alpha = 0.35 * Math.max(0, 1 - z / 500);
      const [cr, cg, cb] = hsl(hue, 85, 45);
      buf.lineStart();
      for (let x = 0; x <= w; x += 4) {
        const f = x / w;
        const y =
          by +
          sin(f * 4 + time * 0.8 + ri * 1.5) *
            h *
            0.04 *
            (1 + audio.bass * 0.5) +
          sin(f * 7 + time * 1.2) * h * 0.02;
        buf.lineTo(x - w / 2, y - h / 2, z, cr, cg, cb, alpha);
      }
    }
  },
};

export const radialFieldScenes: Scene[] = [
  mandala,
  kaleidoscope,
  radarSweep,
  sunflower,
  radialBars,
  spiralArms,
  flowerBloom,
  aurora,
];
