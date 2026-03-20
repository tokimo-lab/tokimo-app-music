import type { Scene } from "./types";
import { clamp, lerp } from "./utils";

type P = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  age: number;
  size: number;
  hue: number;
};

const TAU = Math.PI * 2;
const sin = Math.sin;
const cos = Math.cos;

function glow(
  ctx: CanvasRenderingContext2D,
  hue: number,
  s = 85,
  l = 45,
  blur = 12,
) {
  const c = `hsl(${hue},${s}%,${l}%)`;
  ctx.fillStyle = c;
  ctx.strokeStyle = c;
  ctx.shadowColor = c;
  ctx.shadowBlur = blur;
}

function sc(w: number, h: number) {
  return Math.min(w, h);
}

function mkP(
  x: number,
  y: number,
  vx: number,
  vy: number,
  hue: number,
  life = 1,
  size = 3,
): P {
  return { x, y, vx, vy, life, age: 0, size, hue };
}

// ── 8: Orbit Rings ───────────────────────────────────────────────────────────

const orbitRings: Scene = {
  name: "Orbit Rings",
  init: () => {
    const ps: (P & { ring: number; ang: number; spd: number })[] = [];
    for (let i = 0; i < 200; i++) {
      const ring = i % 5,
        ang = Math.random() * TAU;
      ps.push({
        ...mkP(0, 0, 0, 0, ring * 60, 1, 2 + Math.random()),
        ring,
        ang,
        spd: (0.5 + ring * 0.3) * (Math.random() > 0.5 ? 1 : -1),
      });
    }
    return ps;
  },
  draw(dc, _s) {
    const ps = _s as (P & { ring: number; ang: number; spd: number })[];
    const { ctx, w, h, audio } = dc;
    const s = sc(w, h);
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.globalAlpha = 0.6;
    for (const p of ps) {
      p.ang += p.spd * 0.015 * (1 + audio.energy);
      const r = (0.08 + p.ring * 0.08) * s * (1 + audio.bass * 0.2);
      const tilt = 0.3 + p.ring * 0.1;
      const px = w / 2 + cos(p.ang) * r;
      const py = h / 2 + sin(p.ang) * r * tilt;
      glow(ctx, p.hue, 80, 48, 8);
      ctx.beginPath();
      ctx.arc(px, py, p.size * (s / 600), 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  },
};

// ── 9: Expanding Rings ───────────────────────────────────────────────────────

interface Ring {
  r: number;
  maxR: number;
  hue: number;
  life: number;
}

const expandingRings: Scene = {
  name: "Expanding Rings",
  init: (): { rings: Ring[]; timer: number } => ({ rings: [], timer: 0 }),
  draw(dc, _s) {
    const st = _s as { rings: Ring[]; timer: number };
    const { ctx, w, h, audio } = dc;
    const s = sc(w, h);
    st.timer++;
    const interval = Math.max(10, 40 - audio.bass * 30);
    if (st.timer >= interval) {
      st.rings.push({
        r: 0,
        maxR: s * (0.3 + audio.bass * 0.3),
        hue: Math.random() * 360,
        life: 0,
      });
      st.timer = 0;
    }
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    for (const ring of st.rings) {
      ring.life++;
      ring.r += (ring.maxR - ring.r) * 0.04;
      const fade = clamp(1 - ring.life / 80, 0, 1);
      ctx.globalAlpha = fade * 0.6;
      glow(ctx, ring.hue, 85, 45, 12);
      ctx.lineWidth = 2 + audio.energy * 3;
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, ring.r, 0, TAU);
      ctx.stroke();
    }
    st.rings = st.rings.filter((r) => r.life < 80);
    ctx.restore();
  },
};

// ── 10: Snow ─────────────────────────────────────────────────────────────────

function resetSnow(p: P, w: number) {
  p.x = Math.random() * w;
  p.y = -5 - Math.random() * 30;
  p.vy = 0.5 + Math.random() * 1;
  p.vx = (Math.random() - 0.5) * 0.5;
  p.size = 1.5 + Math.random() * 3;
  p.hue = 200 + Math.random() * 30;
}

const snow: Scene = {
  name: "Snow",
  init: () => ({ ps: [] as P[], inited: false }),
  draw(dc, _s) {
    const st = _s as { ps: P[]; inited: boolean };
    const { ctx, w, h, time, audio } = dc;
    const s = sc(w, h);
    if (!st.inited) {
      for (let i = 0; i < 200; i++) {
        const p = mkP(0, 0, 0, 0, 210, 1, 2);
        resetSnow(p, w);
        p.y = Math.random() * h;
        st.ps.push(p);
      }
      st.inited = true;
    }
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.globalAlpha = 0.55;
    for (const p of st.ps) {
      p.y += p.vy;
      p.x += p.vx + sin(time * 0.001 + p.x * 0.01) * 0.3 * (1 + audio.mid);
      if (p.y > h + 10) resetSnow(p, w);
      glow(ctx, p.hue, 70, 55, 6);
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (s / 700), 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  },
};

// ── 11: Electric Arc ─────────────────────────────────────────────────────────

interface ArcState {
  anchors: { x: number; y: number }[];
  timer: number;
}

function drawArc(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  depth: number,
  hue: number,
  s: number,
) {
  if (depth <= 0) {
    ctx.lineTo(x2, y2);
    return;
  }
  const mx = (x1 + x2) / 2 + (Math.random() - 0.5) * s * 0.08 * depth;
  const my = (y1 + y2) / 2 + (Math.random() - 0.5) * s * 0.08 * depth;
  drawArc(ctx, x1, y1, mx, my, depth - 1, hue, s);
  drawArc(ctx, mx, my, x2, y2, depth - 1, hue, s);
}

const electricArc: Scene = {
  name: "Electric Arc",
  init: (): ArcState => {
    const anchors = [];
    for (let i = 0; i < 6; i++)
      anchors.push({ x: Math.random(), y: Math.random() });
    return { anchors, timer: 0 };
  },
  draw(dc, _s) {
    const st = _s as ArcState;
    const { ctx, w, h, frame, audio } = dc;
    const s = sc(w, h);
    st.timer++;
    if (st.timer > 30) {
      for (const a of st.anchors) {
        a.x += (Math.random() - 0.5) * 0.1;
        a.y += (Math.random() - 0.5) * 0.1;
        a.x = clamp(a.x, 0.1, 0.9);
        a.y = clamp(a.y, 0.1, 0.9);
      }
      st.timer = 0;
    }
    if (frame % 2 !== 0) {
      ctx.restore?.();
      return;
    }
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.globalAlpha = clamp(0.4 + audio.high * 0.4, 0.3, 0.8);
    const hue = 180 + audio.energy * 60;
    glow(ctx, hue, 90, 45, 15 + audio.energy * 10);
    ctx.lineWidth = 1.5 + audio.energy * 2;
    for (let i = 0; i < st.anchors.length - 1; i++) {
      const a = st.anchors[i],
        b = st.anchors[i + 1];
      ctx.beginPath();
      ctx.moveTo(a.x * w, a.y * h);
      drawArc(ctx, a.x * w, a.y * h, b.x * w, b.y * h, 4, hue, s);
      ctx.stroke();
    }
    ctx.restore();
  },
};

// ── 12: Comet Trail ──────────────────────────────────────────────────────────

interface Comet {
  ang: number;
  r: number;
  spd: number;
  hue: number;
  trail: { x: number; y: number }[];
}

const cometTrail: Scene = {
  name: "Comet Trail",
  init: () => {
    const comets: Comet[] = [];
    for (let i = 0; i < 5; i++)
      comets.push({
        ang: TAU * (i / 5),
        r: 0.15 + i * 0.06,
        spd: 0.8 + i * 0.3,
        hue: i * 60,
        trail: [],
      });
    return comets;
  },
  draw(dc, _s) {
    const comets = _s as Comet[];
    const { ctx, w, h, audio } = dc;
    const s = sc(w, h);
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    for (const c of comets) {
      c.ang += c.spd * 0.02 * (1 + audio.energy);
      const px = w / 2 + cos(c.ang) * c.r * s;
      const py = h / 2 + sin(c.ang) * c.r * s * 0.6;
      c.trail.push({ x: px, y: py });
      if (c.trail.length > 40) c.trail.shift();
      for (let i = 0; i < c.trail.length; i++) {
        const t = i / c.trail.length;
        ctx.globalAlpha = t * 0.6;
        glow(ctx, c.hue, 85, 45, lerp(2, 12, t));
        ctx.beginPath();
        ctx.arc(c.trail[i].x, c.trail[i].y, lerp(1, 4, t) * (s / 500), 0, TAU);
        ctx.fill();
      }
    }
    ctx.restore();
  },
};

// ── 13: Pulse Dots ───────────────────────────────────────────────────────────

const pulseDots: Scene = {
  name: "Pulse Dots",
  init: () => ({ phase: 0 }),
  draw(dc, _s) {
    const st = _s as { phase: number };
    const { ctx, w, h, audio } = dc;
    const s = sc(w, h);
    st.phase += 0.03 + audio.bass * 0.05;
    const cols = 20,
      rows = 14;
    const gx = w / (cols + 1),
      gy = h / (rows + 1);
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    for (let r = 1; r <= rows; r++) {
      for (let c = 1; c <= cols; c++) {
        const px = c * gx,
          py = r * gy;
        const dx = px - w / 2,
          dy = py - h / 2;
        const dist = Math.sqrt(dx * dx + dy * dy) / (s * 0.5);
        const wave = sin(dist * 6 - st.phase) * 0.5 + 0.5;
        const sz = (2 + wave * 4 + audio.energy * 3) * (s / 700);
        const hue = 260 + wave * 60;
        ctx.globalAlpha = clamp(0.3 + wave * 0.4, 0.3, 0.7);
        glow(ctx, hue, 80, 45, sz * 2);
        ctx.beginPath();
        ctx.arc(px, py, sz, 0, TAU);
        ctx.fill();
      }
    }
    ctx.restore();
  },
};

// ── 14: Helix Stream ─────────────────────────────────────────────────────────

const helixStream: Scene = {
  name: "Helix Stream",
  init: () => {
    const ps: (P & { t: number; strand: number })[] = [];
    for (let i = 0; i < 200; i++)
      ps.push({
        ...mkP(0, 0, 0, 0, i % 2 === 0 ? 330 : 200, 1, 2 + Math.random()),
        t: i / 200,
        strand: i % 2,
      });
    return ps;
  },
  draw(dc, _s) {
    const ps = _s as (P & { t: number; strand: number })[];
    const { ctx, w, h, time, audio } = dc;
    const s = sc(w, h);
    const rot = time * 0.001;
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.globalAlpha = 0.6;
    for (const p of ps) {
      p.t += 0.002 * (1 + audio.energy);
      if (p.t > 1) p.t -= 1;
      const yy = p.t * h;
      const helixR = s * 0.12 * (1 + audio.mid * 0.4);
      const phase = p.strand * Math.PI + p.t * TAU * 2 + rot;
      const px = w / 2 + cos(phase) * helixR;
      glow(ctx, p.hue, 85, 45, 10);
      ctx.beginPath();
      ctx.arc(px, yy, p.size * (s / 600), 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  },
};

// ── 15: Gravity Well ─────────────────────────────────────────────────────────

function resetGravity(p: P & { ang: number; dist: number; aspd: number }) {
  p.dist = 0.3 + Math.random() * 0.5;
  p.ang = Math.random() * TAU;
  p.aspd = (0.5 + Math.random() * 1.5) * (Math.random() > 0.5 ? 1 : -1);
  p.hue = 10 + Math.random() * 50;
  p.size = 1.5 + Math.random() * 2;
}

const gravityWell: Scene = {
  name: "Gravity Well",
  init: () => {
    const ps: (P & { ang: number; dist: number; aspd: number })[] = [];
    for (let i = 0; i < 200; i++) {
      const p = { ...mkP(0, 0, 0, 0, 20, 1, 2), ang: 0, dist: 0, aspd: 0 };
      resetGravity(p);
      ps.push(p);
    }
    return ps;
  },
  draw(dc, _s) {
    const ps = _s as (P & { ang: number; dist: number; aspd: number })[];
    const { ctx, w, h, audio } = dc;
    const s = sc(w, h);
    const pull = 0.001 + audio.bass * 0.003;
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.globalAlpha = 0.55;
    for (const p of ps) {
      p.ang += p.aspd * 0.02;
      p.dist -= pull;
      p.aspd *= 1 + pull * 0.5;
      if (p.dist < 0.01) resetGravity(p);
      const px = w / 2 + cos(p.ang) * p.dist * s * 0.5;
      const py = h / 2 + sin(p.ang) * p.dist * s * 0.5;
      glow(ctx, p.hue, 90, lerp(55, 40, 1 - p.dist), lerp(4, 14, 1 - p.dist));
      ctx.beginPath();
      ctx.arc(px, py, p.size * (s / 500), 0, TAU);
      ctx.fill();
    }
    // core glow
    ctx.globalAlpha = 0.4 + audio.bass * 0.3;
    glow(ctx, 30, 95, 50, s * 0.05);
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, s * 0.015, 0, TAU);
    ctx.fill();
    ctx.restore();
  },
};

// ── Export ────────────────────────────────────────────────────────────────────

export const particleScenes2: Scene[] = [
  orbitRings,
  expandingRings,
  snow,
  electricArc,
  cometTrail,
  pulseDots,
  helixStream,
  gravityWell,
];
