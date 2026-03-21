import { neon, S, TAU } from "./helpers";
import { projectCenter } from "./perspective";
import type { Scene } from "./types";
import { lerp } from "./utils";

const rose: Scene = {
  name: "Rose",
  init: () => ({ k: 3, tgt: 5 }),
  draw(dc, raw) {
    const { ctx, w, h, time, audio, cam } = dc;
    const s = raw as { k: number; tgt: number };
    s.k = lerp(s.k, s.tgt, 0.003);
    if (Math.abs(s.k - s.tgt) < 0.05) s.tgt = 2 + Math.floor(Math.random() * 6);
    const r0 = S(w, h) * 0.35 * (0.8 + audio.bass * 0.4);
    const cx = w / 2,
      cy = h / 2;
    ctx.save();
    for (let l = 0; l < 2; l++) {
      const hue = (time * 15 + l * 60) % 360;
      neon(ctx, hue, 0.5 + audio.energy * 0.15, 12 + audio.energy * 8);
      const k = s.k + l * 0.3;
      const baseZ = l === 0 ? 50 : -50;
      ctx.beginPath();
      for (let i = 0; i <= 360; i++) {
        const th = (i / 360) * TAU * 6;
        const r = r0 * Math.cos(k * th);
        const x = r * Math.cos(th);
        const y = r * Math.sin(th);
        const z = baseZ + Math.sin(k * th * 0.3 + time) * 120;
        const { sx, sy } = projectCenter(x, y, z, cx, cy, cam);
        i === 0 ? ctx.moveTo(sx, sy) : ctx.lineTo(sx, sy);
      }
      ctx.stroke();
    }
    ctx.restore();
  },
};

const butterfly: Scene = {
  name: "Butterfly",
  init: () => null,
  draw(dc) {
    const { ctx, w, h, time, audio, cam } = dc;
    const sc = S(w, h) * 0.08 * (0.8 + audio.mid * 0.5);
    const hue = (time * 12) % 360;
    const cx = w / 2,
      cy = h / 2;
    const rot = time * 0.05;
    const cosR = Math.cos(rot),
      sinR = Math.sin(rot);
    ctx.save();
    neon(ctx, hue, 0.5, 14 + audio.energy * 10);
    ctx.beginPath();
    for (let i = 0; i <= 300; i++) {
      const th = (i / 300) * TAU * 6;
      const r =
        sc *
        (Math.exp(Math.sin(th)) -
          2 * Math.cos(4 * th) +
          Math.sin((2 * th - Math.PI) / 24) ** 5);
      const bx = r * Math.sin(th);
      const by = -r * Math.cos(th);
      const rx = bx * cosR - by * sinR;
      const ry = bx * sinR + by * cosR;
      const z = Math.sin(th * 0.5) * 100;
      const { sx, sy } = projectCenter(rx, ry, z, cx, cy, cam);
      i === 0 ? ctx.moveTo(sx, sy) : ctx.lineTo(sx, sy);
    }
    ctx.stroke();
    ctx.restore();
  },
};

const harmonograph: Scene = {
  name: "Harmonograph",
  init: () => null,
  draw(dc) {
    const { ctx, w, h, time, audio, cam } = dc;
    const amp = S(w, h) * 0.3 * (0.7 + audio.energy * 0.5);
    const cx = w / 2,
      cy = h / 2;
    ctx.save();
    for (let l = 0; l < 3; l++) {
      const hue = (time * 10 + l * 40) % 360;
      neon(ctx, hue, 0.4 + audio.bass * 0.1, 10 + audio.energy * 6);
      const f1 = 2 + l * 0.01 + audio.mid * 0.5;
      const f2 = 3 + l * 0.02 + audio.high * 0.3;
      const fc = 5 + l * 0.03;
      const d = 0.003 + audio.energy * 0.002;
      const baseZ = (l - 1) * 100;
      ctx.beginPath();
      for (let i = 0; i <= 250; i++) {
        const t = (i / 250) * 40;
        const decay = Math.exp(-d * t);
        const x = amp * Math.sin(f1 * t + l + time * 0.2) * decay;
        const y = amp * Math.sin(f2 * t + time * 0.15) * decay;
        const z = baseZ + Math.sin(fc * t) * 100 * decay;
        const { sx, sy } = projectCenter(x, y, z, cx, cy, cam);
        i === 0 ? ctx.moveTo(sx, sy) : ctx.lineTo(sx, sy);
      }
      ctx.stroke();
    }
    ctx.restore();
  },
};

const maurerRose: Scene = {
  name: "Maurer Rose",
  init: () => null,
  draw(dc) {
    const { ctx, w, h, time, audio, cam } = dc;
    const n = 2 + Math.floor((time * 0.08) % 6);
    const dd = 71 + Math.sin(time * 0.06) * 30;
    const r0 = S(w, h) * 0.35 * (0.8 + audio.bass * 0.3);
    const cx = w / 2,
      cy = h / 2;
    ctx.save();
    const hue = (time * 14) % 360;
    neon(ctx, hue, 0.45, 12 + audio.energy * 10);
    ctx.beginPath();
    for (let i = 0; i <= 360; i++) {
      const th = (i * dd * Math.PI) / 180;
      const r = r0 * Math.sin(n * th);
      const x = r * Math.cos(th);
      const y = r * Math.sin(th);
      const z = Math.sin(n * th * 0.5 + time) * 100;
      const { sx, sy } = projectCenter(x, y, z, cx, cy, cam);
      i === 0 ? ctx.moveTo(sx, sy) : ctx.lineTo(sx, sy);
    }
    ctx.stroke();
    neon(ctx, (hue + 90) % 360, 0.35, 8);
    ctx.beginPath();
    for (let i = 0; i <= 200; i++) {
      const th = (i / 200) * TAU * n;
      const r = r0 * Math.sin(n * th);
      const x = r * Math.cos(th);
      const y = r * Math.sin(th);
      const z = Math.sin(n * th * 0.5 + time) * 100;
      const { sx, sy } = projectCenter(x, y, z, cx, cy, cam);
      i === 0 ? ctx.moveTo(sx, sy) : ctx.lineTo(sx, sy);
    }
    ctx.stroke();
    ctx.restore();
  },
};

const lemniscate: Scene = {
  name: "Lemniscate",
  init: () => null,
  draw(dc) {
    const { ctx, w, h, time, audio, cam } = dc;
    const a = S(w, h) * 0.3 * (0.8 + audio.bass * 0.5);
    const hue = (time * 18) % 360;
    const cx = w / 2,
      cy = h / 2;
    const rot = time * 0.08;
    const cosR = Math.cos(rot),
      sinR = Math.sin(rot);
    ctx.save();
    neon(ctx, hue, 0.55, 16 + audio.energy * 10);
    ctx.beginPath();
    for (let i = 0; i <= 200; i++) {
      const t = (i / 200) * TAU;
      const dn = 1 + Math.sin(t) ** 2;
      const bx = (a * Math.cos(t)) / dn;
      const by = (a * Math.sin(t) * Math.cos(t)) / dn;
      const rx = bx * cosR - by * sinR;
      const ry = bx * sinR + by * cosR;
      const z = Math.sin(t * 2 + time) * 80;
      const { sx, sy } = projectCenter(rx, ry, z, cx, cy, cam);
      i === 0 ? ctx.moveTo(sx, sy) : ctx.lineTo(sx, sy);
    }
    ctx.stroke();
    ctx.restore();
  },
};

const hypotrochoid: Scene = {
  name: "Hypotrochoid",
  init: () => null,
  draw(dc) {
    const { ctx, w, h, time, audio, cam } = dc;
    const r0 = S(w, h) * 0.35 * (0.8 + audio.energy * 0.3);
    const R = 5;
    const r = 3 + Math.sin(time * 0.1) * 0.5 + audio.mid;
    const d = 3.5 + audio.bass * 2;
    const norm = r0 / (Math.abs(R - r) + Math.abs(d));
    const hue = (time * 11) % 360;
    const cx = w / 2,
      cy = h / 2;
    const dr = R - r;
    ctx.save();
    neon(ctx, hue, 0.5, 14 + audio.energy * 8);
    ctx.beginPath();
    for (let i = 0; i <= 300; i++) {
      const t = (i / 300) * TAU * 10;
      const x = norm * (dr * Math.cos(t) + d * Math.cos((dr / r) * t));
      const y = norm * (dr * Math.sin(t) - d * Math.sin((dr / r) * t));
      const z = Math.sin((dr / r) * t * 0.5) * 100;
      const { sx, sy } = projectCenter(x, y, z, cx, cy, cam);
      i === 0 ? ctx.moveTo(sx, sy) : ctx.lineTo(sx, sy);
    }
    ctx.stroke();
    ctx.restore();
  },
};

const cardioid: Scene = {
  name: "Cardioid",
  init: () => null,
  draw(dc) {
    const { ctx, w, h, time, audio, cam } = dc;
    const a = S(w, h) * 0.15 * (0.8 + audio.bass * 0.5);
    const cx = w / 2,
      cy = h / 2;
    ctx.save();
    for (let m = 0; m < 2; m++) {
      const hue = (time * 16 + m * 120) % 360;
      neon(ctx, hue, 0.45, 12 + audio.energy * 8);
      const baseZ = m === 0 ? 40 : -40;
      ctx.beginPath();
      for (let i = 0; i <= 200; i++) {
        const th = (i / 200) * TAU;
        const r = a * (1 + Math.cos(th));
        let x = r * Math.cos(th);
        const y = r * Math.sin(th);
        if (m === 1) x = -x;
        const z = baseZ + Math.sin(th * 2 + time) * 80;
        const { sx, sy } = projectCenter(x, y, z, cx, cy, cam);
        i === 0 ? ctx.moveTo(sx, sy) : ctx.lineTo(sx, sy);
      }
      ctx.stroke();
    }
    ctx.restore();
  },
};

const astroid: Scene = {
  name: "Astroid",
  init: () => null,
  draw(dc) {
    const { ctx, w, h, time, audio, cam } = dc;
    const a = S(w, h) * 0.3 * (0.8 + audio.energy * 0.4);
    const hue = (time * 13) % 360;
    const cx = w / 2,
      cy = h / 2;
    const rot = time * 0.1;
    const cosR = Math.cos(rot),
      sinR = Math.sin(rot);
    ctx.save();
    neon(ctx, hue, 0.5, 14 + audio.energy * 8);
    ctx.beginPath();
    for (let i = 0; i <= 200; i++) {
      const t = (i / 200) * TAU;
      const bx = a * Math.cos(t) ** 3;
      const by = a * Math.sin(t) ** 3;
      const rx = bx * cosR - by * sinR;
      const ry = bx * sinR + by * cosR;
      const z = Math.sin(t * 3 + time * 0.5) * 100;
      const { sx, sy } = projectCenter(rx, ry, z, cx, cy, cam);
      i === 0 ? ctx.moveTo(sx, sy) : ctx.lineTo(sx, sy);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  },
};

export const curveScenes: Scene[] = [
  rose,
  butterfly,
  harmonograph,
  maurerRose,
  lemniscate,
  hypotrochoid,
  cardioid,
  astroid,
];
