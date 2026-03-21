import { neon, S, TAU } from "./helpers";
import { depthAlpha, depthSize, project, projectCenter } from "./perspective";
import type { Scene } from "./types";
import { clamp, getFrequencyData, hash } from "./utils";

const PHI = 2.39996323;
const { sin, cos, sqrt, floor, abs, PI } = Math;
const nil = () => null;

const mandala: Scene = {
  name: "Mandala",
  init: nil,
  draw(dc) {
    const { ctx, w, h, time, audio, cam } = dc;
    const r = S(w, h) * 0.4;
    const cx = w / 2,
      cy = h / 2;
    ctx.save();
    for (let layer = 0; layer < 4; layer++) {
      const dir = layer % 2 ? 1 : -1;
      const hue = (time * 25 + layer * 90) % 360;
      const rad = r * (0.3 + layer * 0.18) * (0.8 + audio.bass * 0.4);
      const rot = time * 0.3 * dir;
      const cosR = cos(rot),
        sinR = sin(rot);
      const z = layer * 100;
      neon(ctx, hue, 0.5 * depthAlpha(z, 400), 14);
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 8; i++) {
        const a = (TAU / 8) * i;
        const px = cos(a) * rad * 0.4;
        const py = sin(a) * rad * 0.4;
        const rx = px * cosR - py * sinR;
        const ry = px * sinR + py * cosR;
        const { sx, sy, scale } = projectCenter(rx, ry, z, cx, cy, cam);
        const ar = depthSize(rad * (0.3 + audio.mid * 0.15), scale, 2);
        ctx.beginPath();
        ctx.arc(sx, sy, ar, a - 0.5, a + 0.5);
        ctx.stroke();
      }
    }
    ctx.restore();
  },
};

const kaleidoscope: Scene = {
  name: "Kaleidoscope",
  init: nil,
  draw(dc) {
    const { ctx, w, h, time, audio, cam } = dc;
    const r = S(w, h) * 0.42;
    const seg = 12;
    const cx = w / 2,
      cy = h / 2;
    ctx.save();
    for (let i = 0; i < seg; i++) {
      const base = (TAU / seg) * i;
      for (let j = 0; j < 5; j++) {
        const z = j * 50;
        const hue = (time * 30 + j * 72 + i * 10) % 360;
        const d = r * (0.2 + j * 0.15);
        const wb = sin(time * 1.5 + j) * r * 0.05;
        const x = cos(base) * (d + wb) - sin(base) * wb * audio.mid;
        const y = sin(base) * (d + wb) + cos(base) * wb * audio.mid;
        const { sx, sy, scale } = projectCenter(x, y, z, cx, cy, cam);
        const sz = depthSize(r * 0.08 * (0.5 + audio.energy), scale, 1);
        neon(ctx, hue, 0.45 * depthAlpha(z, 300), 10, true);
        ctx.beginPath();
        ctx.arc(sx, sy, sz, 0, TAU);
        ctx.fill();
      }
    }
    ctx.restore();
  },
};

const radarSweep: Scene = {
  name: "Radar Sweep",
  init: () => ({
    dots: [] as { a: number; d: number; t: number; h: number; z: number }[],
  }),
  draw(dc, state) {
    const { ctx, w, h, time, audio, cam } = dc;
    type Dot = { a: number; d: number; t: number; h: number; z: number };
    const s = state as { dots: Dot[] };
    const r = S(w, h) * 0.4;
    const cx = w / 2,
      cy = h / 2;
    const sweep = (time * 0.8) % TAU;
    const hue = (time * 40) % 360;
    ctx.save();
    for (let i = 0; i <= 8; i++) {
      neon(ctx, hue, 0.6 - i * 0.035, i === 0 ? 18 : 8);
      ctx.lineWidth = i === 0 ? 2 : 1;
      const a = sweep - i * 0.08;
      const p0 = projectCenter(0, 0, 0, cx, cy, cam);
      const p1 = projectCenter(cos(a) * r, sin(a) * r, 0, cx, cy, cam);
      ctx.beginPath();
      ctx.moveTo(p0.sx, p0.sy);
      ctx.lineTo(p1.sx, p1.sy);
      ctx.stroke();
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
      const { sx, sy, scale } = projectCenter(
        cos(dot.a) * dot.d,
        sin(dot.a) * dot.d,
        dot.z,
        cx,
        cy,
        cam,
      );
      const da = clamp(0.6 - age * 0.15, 0.3, 0.6) * depthAlpha(dot.z, 400);
      neon(ctx, dot.h, da, 8, true);
      ctx.beginPath();
      ctx.arc(sx, sy, depthSize(3, scale, 1), 0, TAU);
      ctx.fill();
      return true;
    });
    neon(ctx, hue, 0.3, 6);
    ctx.lineWidth = 0.5;
    for (let i = 1; i <= 4; i++) {
      const z = i * 40;
      const p = projectCenter(0, 0, z, cx, cy, cam);
      ctx.beginPath();
      ctx.arc(p.sx, p.sy, r * i * 0.25 * p.scale, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
  },
};

const sunflower: Scene = {
  name: "Sunflower",
  init: nil,
  draw(dc) {
    const { ctx, w, h, time, audio, cam } = dc;
    const r = S(w, h) * 0.4;
    const cx = w / 2,
      cy = h / 2;
    const rot = time * 0.1;
    const cosR = cos(rot),
      sinR = sin(rot);
    ctx.save();
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
      const { sx, sy, scale } = projectCenter(rx, ry, z, cx, cy, cam);
      const sz = depthSize((2 + audio.bass * 4) * (0.5 + frac * 0.5), scale);
      neon(ctx, hue, 0.5 * depthAlpha(z, 500), 8, true);
      ctx.beginPath();
      ctx.arc(sx, sy, sz, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  },
};

const radialBars: Scene = {
  name: "Radial Bars",
  init: nil,
  draw(dc) {
    const { ctx, w, h, time, audio, cam } = dc;
    const freq = getFrequencyData(dc.analyser, dc.playing);
    const r = S(w, h) * 0.2;
    const n = 64;
    const cx = w / 2,
      cy = h / 2;
    const rot = time * 0.05;
    const cosR = cos(rot),
      sinR = sin(rot);
    ctx.save();
    for (let i = 0; i < n; i++) {
      const a = (TAU / n) * i;
      const v = freq ? freq[floor((i / n) * freq.length)] / 255 : audio.energy;
      const len = v * r * 1.5 + r * 0.05;
      const z = v * 200;
      const ix = cos(a) * r;
      const iy = sin(a) * r;
      const ox = cos(a) * (r + len);
      const oy = sin(a) * (r + len);
      const pi = projectCenter(
        ix * cosR - iy * sinR,
        ix * sinR + iy * cosR,
        z,
        cx,
        cy,
        cam,
      );
      const po = projectCenter(
        ox * cosR - oy * sinR,
        ox * sinR + oy * cosR,
        z,
        cx,
        cy,
        cam,
      );
      neon(
        ctx,
        ((i * 360) / n + time * 15) % 360,
        0.55 * depthAlpha(z, 300),
        10,
      );
      ctx.lineWidth = ((TAU * r) / n) * 0.6 * pi.scale;
      ctx.beginPath();
      ctx.moveTo(pi.sx, pi.sy);
      ctx.lineTo(po.sx, po.sy);
      ctx.stroke();
    }
    ctx.restore();
  },
};

const spiralArms: Scene = {
  name: "Spiral Arms",
  init: nil,
  draw(dc) {
    const { ctx, w, h, time, audio, cam } = dc;
    const r = S(w, h) * 0.42;
    const cx = w / 2,
      cy = h / 2;
    ctx.save();
    for (let arm = 0; arm < 5; arm++) {
      const bh = (arm * 72 + time * 15) % 360;
      const off = (TAU / 5) * arm;
      const baseZ = arm * 60;
      neon(ctx, bh, 0.4 * depthAlpha(baseZ, 400), 12);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let t = 0; t < 100; t++) {
        const f = t / 100;
        const a = f * TAU * 2 + off + time * 0.3;
        const d = f * r * (0.8 + audio.bass * 0.3);
        const z = baseZ + f * 40;
        const { sx, sy } = projectCenter(
          cos(a) * d,
          sin(a) * d,
          z,
          cx,
          cy,
          cam,
        );
        t === 0 ? ctx.moveTo(sx, sy) : ctx.lineTo(sx, sy);
      }
      ctx.stroke();
      for (let t = 0; t < 20; t++) {
        const f = t / 20;
        const a = f * TAU * 2 + off + time * 0.3;
        const d = f * r * (0.8 + audio.bass * 0.3);
        const z = baseZ + f * 40;
        const { sx, sy, scale } = projectCenter(
          cos(a) * d,
          sin(a) * d,
          z,
          cx,
          cy,
          cam,
        );
        neon(ctx, (bh + f * 40) % 360, 0.5 * depthAlpha(z, 400), 6, true);
        ctx.beginPath();
        ctx.arc(sx, sy, depthSize(2 + audio.high * 3 * f, scale, 0.5), 0, TAU);
        ctx.fill();
      }
    }
    ctx.restore();
  },
};

const flowerBloom: Scene = {
  name: "Flower Bloom",
  init: nil,
  draw(dc) {
    const { ctx, w, h, time, audio, cam } = dc;
    const r = S(w, h) * 0.35;
    const cx = w / 2,
      cy = h / 2;
    ctx.save();
    for (let layer = 0; layer < 3; layer++) {
      const petals = 5 + layer * 2;
      const hue = (time * 20 + layer * 60) % 360;
      const size = r * (0.5 + layer * 0.2) * (0.5 + audio.bass * 0.5);
      const rot = time * 0.2 * (layer % 2 ? 1 : -1);
      const cosR = cos(rot),
        sinR = sin(rot);
      const z = layer * 120;
      neon(ctx, hue, 0.45 * depthAlpha(z, 400), 14);
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i <= 360; i++) {
        const a = (i * PI) / 180;
        const rr = size * cos(petals * a + time * 0.5);
        const px = abs(rr) * cos(a);
        const py = abs(rr) * sin(a);
        const rx = px * cosR - py * sinR;
        const ry = px * sinR + py * cosR;
        const { sx, sy } = projectCenter(rx, ry, z, cx, cy, cam);
        i === 0 ? ctx.moveTo(sx, sy) : ctx.lineTo(sx, sy);
      }
      ctx.stroke();
    }
    ctx.restore();
  },
};

const aurora: Scene = {
  name: "Aurora",
  init: nil,
  draw(dc) {
    const { ctx, w, h, time, audio, cam } = dc;
    const cx = w / 2,
      cy = h / 2;
    ctx.save();
    for (let r = 0; r < 5; r++) {
      const by = h * (0.25 + r * 0.1) + sin(time * 0.5 + r) * h * 0.05;
      const hue = (120 + r * 25 + time * 10) % 360;
      const z = r * 80;
      neon(ctx, hue, 0.35 * depthAlpha(z, 500), 20);
      ctx.lineWidth = h * 0.04 * (0.6 + audio.mid * 0.6);
      ctx.beginPath();
      for (let x = 0; x <= w; x += 4) {
        const f = x / w;
        const y =
          by +
          sin(f * 4 + time * 0.8 + r * 1.5) *
            h *
            0.04 *
            (1 + audio.bass * 0.5) +
          sin(f * 7 + time * 1.2) * h * 0.02;
        const { sx, sy } = project(x, y, z, cx, cy, cam);
        x === 0 ? ctx.moveTo(sx, sy) : ctx.lineTo(sx, sy);
      }
      ctx.stroke();
    }
    ctx.restore();
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
