import { neon, S, TAU } from "./helpers";
import { depthAlpha, depthSize, projectCenter } from "./perspective";
import type { Scene } from "./types";
import { lerp } from "./utils";

const lissajous3D: Scene = {
  name: "Lissajous 3D",
  init: () => null,
  draw(dc) {
    const { ctx, w, h, time, audio, cam } = dc;
    const amp = S(w, h) * 0.3 * (0.7 + audio.energy * 0.4);
    const hue = (time * 9) % 360;
    const cosRy = Math.cos(time * 0.15);
    const sinRy = Math.sin(time * 0.15);
    const cosRx = Math.cos(time * 0.1);
    const sinRx = Math.sin(time * 0.1);
    const cx = w / 2;
    const cy = h / 2;
    ctx.save();
    neon(ctx, hue, 0.5, 12 + audio.energy * 8);
    ctx.beginPath();
    const fa = 3 + audio.bass;
    const fb = 2 + audio.mid;
    const fc = 5 + audio.high;
    for (let i = 0; i <= 300; i++) {
      const t = (i / 300) * TAU * 2;
      const px = Math.sin(fa * t + time * 0.3);
      const py = Math.sin(fb * t + time * 0.2);
      const pz = Math.sin(fc * t);
      const x1 = px * cosRy + pz * sinRy;
      const z1 = -px * sinRy + pz * cosRy;
      const y1 = py * cosRx - z1 * sinRx;
      const z2 = py * sinRx + z1 * cosRx;
      const { sx, sy } = projectCenter(
        x1 * amp,
        y1 * amp,
        z2 * 200,
        cx,
        cy,
        cam,
      );
      i === 0 ? ctx.moveTo(sx, sy) : ctx.lineTo(sx, sy);
    }
    ctx.stroke();
    ctx.restore();
  },
};

interface SfState {
  m: number;
  n1: number;
  n2: number;
  n3: number;
  tm: number;
  tn1: number;
  tn2: number;
  tn3: number;
}

const superformula: Scene = {
  name: "Superformula",
  init: (): SfState => ({
    m: 5,
    n1: 1,
    n2: 1,
    n3: 1,
    tm: 7,
    tn1: 0.3,
    tn2: 1.7,
    tn3: 1.7,
  }),
  draw(dc, raw) {
    const { ctx, w, h, time, audio, cam } = dc;
    const s = raw as SfState;
    s.m = lerp(s.m, s.tm, 0.005);
    s.n1 = lerp(s.n1, s.tn1, 0.005);
    s.n2 = lerp(s.n2, s.tn2, 0.005);
    s.n3 = lerp(s.n3, s.tn3, 0.005);
    if (Math.abs(s.m - s.tm) < 0.1) {
      s.tm = 3 + Math.floor(Math.random() * 8);
      s.tn1 = 0.2 + Math.random() * 2;
      s.tn2 = 0.5 + Math.random() * 2;
      s.tn3 = 0.5 + Math.random() * 2;
    }
    const r0 = S(w, h) * 0.3 * (0.8 + audio.energy * 0.4);
    const hue = (time * 10) % 360;
    const cx = w / 2;
    const cy = h / 2;
    ctx.save();
    neon(ctx, hue, 0.5, 14 + audio.energy * 10);
    ctx.beginPath();
    let started = false;
    for (let i = 0; i <= 300; i++) {
      const th = (i / 300) * TAU;
      const t1 = Math.abs(Math.cos((s.m * th) / 4)) ** s.n2;
      const t2 = Math.abs(Math.sin((s.m * th) / 4)) ** s.n3;
      const r = r0 * (t1 + t2) ** (-1 / s.n1);
      const x = r * Math.cos(th);
      const y = r * Math.sin(th);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      const z = Math.sin(th * 2 + time) * 100;
      const { sx, sy } = projectCenter(x, y, z, cx, cy, cam);
      started ? ctx.lineTo(sx, sy) : ctx.moveTo(sx, sy);
      started = true;
    }
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  },
};

const epitrochoidWeb: Scene = {
  name: "Epitrochoid Web",
  init: () => null,
  draw(dc) {
    const { ctx, w, h, time, audio, cam } = dc;
    const r0 = S(w, h) * 0.3;
    const cx = w / 2;
    const cy = h / 2;
    ctx.save();
    for (let l = 0; l < 4; l++) {
      const hue = (time * 8 + l * 30) % 360;
      neon(ctx, hue, 0.35 + audio.energy * 0.1, 10 + audio.energy * 6);
      const R = 3 + l * 0.3;
      const r = 1 + audio.mid + l * 0.2;
      const d = 2 + audio.bass * 1.5 + l * 0.1;
      const norm = r0 / (R + r + Math.abs(d));
      const phase = time * 0.1 + l * 0.5;
      const baseZ = l * 100;
      ctx.beginPath();
      for (let i = 0; i <= 250; i++) {
        const t = (i / 250) * TAU * 8 + phase;
        const x =
          norm * ((R + r) * Math.cos(t) - d * Math.cos(((R + r) / r) * t));
        const y =
          norm * ((R + r) * Math.sin(t) - d * Math.sin(((R + r) / r) * t));
        const z = baseZ + Math.sin(t * 0.5) * 50;
        const { sx, sy } = projectCenter(x, y, z, cx, cy, cam);
        i === 0 ? ctx.moveTo(sx, sy) : ctx.lineTo(sx, sy);
      }
      ctx.stroke();
    }
    ctx.restore();
  },
};

const sineFlower: Scene = {
  name: "Sine Flower",
  init: () => null,
  draw(dc) {
    const { ctx, w, h, time, audio, cam } = dc;
    const r0 = S(w, h) * 0.35 * (0.8 + audio.mid * 0.4);
    const k = 2.5 + Math.sin(time * 0.07) * 1.5 + audio.high * 2;
    const hue = (time * 14) % 360;
    const cx = w / 2;
    const cy = h / 2;
    const rot = time * 0.03;
    const cosR = Math.cos(rot);
    const sinR = Math.sin(rot);
    ctx.save();
    neon(ctx, hue, 0.5, 14 + audio.energy * 8);
    ctx.beginPath();
    for (let i = 0; i <= 360; i++) {
      const th = (i / 360) * TAU * 8;
      const r = r0 * Math.sin(k * th);
      const bx = r * Math.cos(th);
      const by = r * Math.sin(th);
      const rx = bx * cosR - by * sinR;
      const ry = bx * sinR + by * cosR;
      const z = Math.sin(k * th * 0.5) * 100;
      const { sx, sy } = projectCenter(rx, ry, z, cx, cy, cam);
      i === 0 ? ctx.moveTo(sx, sy) : ctx.lineTo(sx, sy);
    }
    ctx.stroke();
    ctx.restore();
  },
};

const fermatSpiral: Scene = {
  name: "Fermat Spiral",
  init: () => null,
  draw(dc) {
    const { ctx, w, h, time, audio, cam } = dc;
    const maxR = S(w, h) * 0.38;
    const N = 200;
    const golden = Math.PI * (3 - Math.sqrt(5));
    const cx = w / 2;
    const cy = h / 2;
    const baseHue = (time * 8) % 360;
    ctx.save();
    for (let i = 0; i < N; i++) {
      const frac = i / N;
      const r = maxR * Math.sqrt(frac);
      const th = i * golden + time * 0.3;
      const x = r * Math.cos(th);
      const y = r * Math.sin(th);
      const z = frac * 300;
      const { sx, sy, scale } = projectCenter(x, y, z, cx, cy, cam);
      const dotR = depthSize(
        1.5 + audio.energy * 2 + (i % 8 === 0 ? audio.bass * 2 : 0),
        scale,
      );
      const hue = (baseHue + i * 0.8) % 360;
      neon(ctx, hue, 0.45 * depthAlpha(z), 8 + audio.energy * 6, true);
      ctx.beginPath();
      ctx.arc(sx, sy, dotR, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  },
};

const pendulumWave: Scene = {
  name: "Pendulum Wave",
  init: () => null,
  draw(dc) {
    const { ctx, w, h, time, audio, cam } = dc;
    const count = 15;
    const swing = S(w, h) * 0.35 * 0.4 * (0.7 + audio.bass * 0.5);
    const spacing = (S(w, h) * 0.6) / count;
    const cx = w / 2;
    const cy = h / 2;
    const anchor = -S(w, h) * 0.16;
    ctx.save();
    for (let i = 0; i < count; i++) {
      const freq = 10 + i * 0.5 + audio.energy * 3;
      const py = Math.sin(freq * time * 0.15) * swing;
      const px = (i - count / 2 + 0.5) * spacing;
      const z = i * 20 - (count / 2) * 20;
      const hue = (time * 12 + i * 20) % 360;
      const pa = projectCenter(px, anchor, z, cx, cy, cam);
      const pb = projectCenter(px, py, z, cx, cy, cam);
      neon(ctx, hue, 0.3, 4);
      ctx.beginPath();
      ctx.moveTo(pa.sx, pa.sy);
      ctx.lineTo(pb.sx, pb.sy);
      ctx.stroke();
      neon(ctx, hue, 0.5, 12 + audio.energy * 6, true);
      const ballR = depthSize(3 + audio.energy * 3, pb.scale);
      ctx.beginPath();
      ctx.arc(pb.sx, pb.sy, ballR, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  },
};

const waveformRing: Scene = {
  name: "Waveform Ring",
  init: () => null,
  draw(dc) {
    const { ctx, w, h, time, audio, analyser, playing, cam } = dc;
    const baseR = S(w, h) * 0.25;
    const hue = (time * 10) % 360;
    const cx = w / 2;
    const cy = h / 2;
    const rot = time * 0.02;
    const cosR = Math.cos(rot);
    const sinR = Math.sin(rot);
    let data: Uint8Array<ArrayBuffer> | null = null;
    if (analyser && playing) {
      data = new Uint8Array(
        analyser.frequencyBinCount,
      ) as Uint8Array<ArrayBuffer>;
      analyser.getByteFrequencyData(data);
    }
    const N = 180;
    const rings: [number, number, number, number][] = [
      [0, 0.55, 14 + audio.energy * 10, 0.12],
      [60, 0.35, 8, 0.08],
    ];
    ctx.save();
    for (const [hOff, alpha, blur, scale] of rings) {
      const rBase = hOff === 0 ? baseR : baseR * 0.6;
      neon(ctx, (hue + hOff) % 360, alpha, blur);
      ctx.beginPath();
      for (let i = 0; i <= N; i++) {
        const th = (i / N) * TAU;
        const idx = hOff === 0 ? i : N - i;
        const a = data
          ? (data[Math.floor((idx / N) * data.length)] / 255) * S(w, h) * scale
          : 0;
        const r = rBase + a;
        const bx = r * Math.cos(th);
        const by = r * Math.sin(th);
        const rx = bx * cosR - by * sinR;
        const ry = bx * sinR + by * cosR;
        const z = Math.sin(th * 2) * 80;
        const { sx, sy } = projectCenter(rx, ry, z, cx, cy, cam);
        i === 0 ? ctx.moveTo(sx, sy) : ctx.lineTo(sx, sy);
      }
      ctx.closePath();
      ctx.stroke();
    }
    ctx.restore();
  },
};

export const extCurveScenes: Scene[] = [
  lissajous3D,
  superformula,
  epitrochoidWeb,
  sineFlower,
  fermatSpiral,
  pendulumWave,
  waveformRing,
];
