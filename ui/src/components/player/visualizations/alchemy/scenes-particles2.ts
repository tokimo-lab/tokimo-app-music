import type { P3 } from "./helpers";
import { glow, mkP3, S, TAU } from "./helpers";
import { depthAlpha, depthSize, MAX_DEPTH, project } from "./perspective";
import type { Scene } from "./types";
import { clamp, lerp } from "./utils";

const sin = Math.sin;
const cos = Math.cos;

// ── 8: Orbit Rings ── each ring at a different z-depth ──────────────────────

const orbitRings: Scene = {
  name: "Orbit Rings",
  init: () => {
    const ps: (P3 & { ring: number; ang: number; spd: number })[] = [];
    for (let i = 0; i < 200; i++) {
      const ring = i % 5;
      const z = ring * 80;
      ps.push({
        ...mkP3(0, 0, z, 0, 0, 0, ring * 60, 1, 2 + Math.random()),
        ring,
        ang: Math.random() * TAU,
        spd: (0.5 + ring * 0.3) * (Math.random() > 0.5 ? 1 : -1),
      });
    }
    return ps;
  },
  draw(dc, _s) {
    const ps = _s as (P3 & { ring: number; ang: number; spd: number })[];
    const { ctx, w, h, audio, cam } = dc;
    const s = S(w, h);
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    for (const p of ps) {
      p.ang += p.spd * 0.015 * (1 + audio.energy);
      const r = (0.08 + p.ring * 0.08) * s * (1 + audio.bass * 0.2);
      const tilt = 0.3 + p.ring * 0.1;
      const wx = w / 2 + cos(p.ang) * r;
      const wy = h / 2 + sin(p.ang) * r * tilt;
      const { sx, sy, scale } = project(wx, wy, p.z, w / 2, h / 2, cam);
      const ds = depthSize(p.size, scale) * (s / 600);
      ctx.globalAlpha = depthAlpha(p.z, MAX_DEPTH) * 0.6;
      glow(ctx, p.hue, 80, 48, 8);
      ctx.beginPath();
      ctx.arc(sx, sy, ds, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  },
};

// ── 9: Expanding Rings ── rings recede in z as they grow ─────────────────────

interface Ring3D {
  r: number;
  maxR: number;
  hue: number;
  life: number;
  z: number;
}

const expandingRings: Scene = {
  name: "Expanding Rings",
  init: (): { rings: Ring3D[]; timer: number } => ({ rings: [], timer: 0 }),
  draw(dc, _s) {
    const st = _s as { rings: Ring3D[]; timer: number };
    const { ctx, w, h, audio, cam } = dc;
    const s = S(w, h);
    st.timer++;
    const interval = Math.max(10, 40 - audio.bass * 30);
    if (st.timer >= interval) {
      st.rings.push({
        r: 0,
        maxR: s * (0.3 + audio.bass * 0.3),
        hue: Math.random() * 360,
        life: 0,
        z: 0,
      });
      st.timer = 0;
    }
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    for (const ring of st.rings) {
      ring.life++;
      ring.r += (ring.maxR - ring.r) * 0.04;
      ring.z = ring.life * 5;
      const fade = clamp(1 - ring.life / 80, 0, 1);
      const { sx, sy, scale } = project(
        w / 2,
        h / 2,
        ring.z,
        w / 2,
        h / 2,
        cam,
      );
      ctx.globalAlpha = fade * depthAlpha(ring.z, 500) * 0.6;
      glow(ctx, ring.hue, 85, 45, 12);
      ctx.lineWidth = depthSize(2 + audio.energy * 3, scale, 1);
      ctx.beginPath();
      ctx.arc(sx, sy, ring.r * scale, 0, TAU);
      ctx.stroke();
    }
    st.rings = st.rings.filter((r) => r.life < 80);
    ctx.restore();
  },
};

// ── 10: Snow ── depth parallax with near/far flakes ──────────────────────────

function resetSnow3D(p: P3, w: number) {
  p.z = Math.random() * 500;
  const zFactor = 1 - p.z / 500;
  p.x = Math.random() * w;
  p.y = -5 - Math.random() * 30;
  p.vy = (0.5 + Math.random()) * (0.4 + zFactor * 0.6);
  p.vx = (Math.random() - 0.5) * 0.5;
  p.size = (1.5 + Math.random() * 3) * (0.5 + zFactor * 0.5);
  p.hue = 200 + Math.random() * 30;
}

const snow: Scene = {
  name: "Snow",
  init: () => ({ ps: [] as P3[], inited: false }),
  draw(dc, _s) {
    const st = _s as { ps: P3[]; inited: boolean };
    const { ctx, w, h, time, audio, cam } = dc;
    const s = S(w, h);
    if (!st.inited) {
      for (let i = 0; i < 200; i++) {
        const p = mkP3(0, 0, 0, 0, 0, 0, 210, 1, 2);
        resetSnow3D(p, w);
        p.y = Math.random() * h;
        st.ps.push(p);
      }
      st.inited = true;
    }
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    for (const p of st.ps) {
      p.y += p.vy;
      p.x += p.vx + sin(time * 0.001 + p.x * 0.01) * 0.3 * (1 + audio.mid);
      if (p.y > h + 10) resetSnow3D(p, w);
      const { sx, sy, scale } = project(p.x, p.y, p.z, w / 2, h / 2, cam);
      const ds = depthSize(p.size, scale) * (s / 700);
      ctx.globalAlpha = depthAlpha(p.z, 500) * 0.55;
      glow(ctx, p.hue, 70, 55, 6);
      ctx.beginPath();
      ctx.arc(sx, sy, ds, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  },
};

// ── 11: Electric Arc ── arcs at different z-planes ───────────────────────────

interface ArcAnchor3D {
  x: number;
  y: number;
  z: number;
}

function drawArc3D(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  depth: number,
  s: number,
) {
  if (depth <= 0) {
    ctx.lineTo(x2, y2);
    return;
  }
  const mx = (x1 + x2) / 2 + (Math.random() - 0.5) * s * 0.08 * depth;
  const my = (y1 + y2) / 2 + (Math.random() - 0.5) * s * 0.08 * depth;
  drawArc3D(ctx, x1, y1, mx, my, depth - 1, s);
  drawArc3D(ctx, mx, my, x2, y2, depth - 1, s);
}

const electricArc: Scene = {
  name: "Electric Arc",
  init: (): { anchors: ArcAnchor3D[]; timer: number } => {
    const anchors: ArcAnchor3D[] = [];
    for (let i = 0; i < 6; i++)
      anchors.push({ x: Math.random(), y: Math.random(), z: i * 60 });
    return { anchors, timer: 0 };
  },
  draw(dc, _s) {
    const st = _s as { anchors: ArcAnchor3D[]; timer: number };
    const { ctx, w, h, frame, audio, cam } = dc;
    const s = S(w, h);
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
    const hue = 180 + audio.energy * 60;
    for (let i = 0; i < st.anchors.length - 1; i++) {
      const a = st.anchors[i];
      const b = st.anchors[i + 1];
      const avgZ = (a.z + b.z) / 2;
      const pa = project(a.x * w, a.y * h, a.z, w / 2, h / 2, cam);
      const pb = project(b.x * w, b.y * h, b.z, w / 2, h / 2, cam);
      ctx.globalAlpha =
        clamp(0.4 + audio.high * 0.4, 0.3, 0.8) * depthAlpha(avgZ, 400);
      glow(ctx, hue, 90, 45, 15 + audio.energy * 10);
      ctx.lineWidth = depthSize(1.5 + audio.energy * 2, pa.scale, 0.5);
      ctx.beginPath();
      ctx.moveTo(pa.sx, pa.sy);
      drawArc3D(ctx, pa.sx, pa.sy, pb.sx, pb.sy, 4, s);
      ctx.stroke();
    }
    ctx.restore();
  },
};

// ── 12: Comet Trail ── comets orbit at different z-depths ────────────────────

interface Comet3D {
  ang: number;
  r: number;
  spd: number;
  hue: number;
  z: number;
  trail: { x: number; y: number; z: number }[];
}

const cometTrail: Scene = {
  name: "Comet Trail",
  init: () => {
    const comets: Comet3D[] = [];
    for (let i = 0; i < 5; i++)
      comets.push({
        ang: TAU * (i / 5),
        r: 0.15 + i * 0.06,
        spd: 0.8 + i * 0.3,
        hue: i * 60,
        z: i * 80,
        trail: [],
      });
    return comets;
  },
  draw(dc, _s) {
    const comets = _s as Comet3D[];
    const { ctx, w, h, audio, cam } = dc;
    const s = S(w, h);
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    for (const c of comets) {
      c.ang += c.spd * 0.02 * (1 + audio.energy);
      const wx = w / 2 + cos(c.ang) * c.r * s;
      const wy = h / 2 + sin(c.ang) * c.r * s * 0.6;
      c.trail.push({ x: wx, y: wy, z: c.z });
      if (c.trail.length > 40) c.trail.shift();
      for (let i = 0; i < c.trail.length; i++) {
        const t = i / c.trail.length;
        const tp = c.trail[i];
        const { sx, sy, scale } = project(tp.x, tp.y, tp.z, w / 2, h / 2, cam);
        const ds = depthSize(lerp(1, 4, t), scale) * (s / 500);
        ctx.globalAlpha = t * depthAlpha(tp.z) * 0.6;
        glow(ctx, c.hue, 85, 45, lerp(2, 12, t));
        ctx.beginPath();
        ctx.arc(sx, sy, ds, 0, TAU);
        ctx.fill();
      }
    }
    ctx.restore();
  },
};

// ── 13: Pulse Dots ── 3D grid curving toward viewer ──────────────────────────

const pulseDots: Scene = {
  name: "Pulse Dots",
  init: () => ({ phase: 0 }),
  draw(dc, _s) {
    const st = _s as { phase: number };
    const { ctx, w, h, audio, cam } = dc;
    const s = S(w, h);
    st.phase += 0.03 + audio.bass * 0.05;
    const cols = 20;
    const rows = 14;
    const gx = w / (cols + 1);
    const gy = h / (rows + 1);
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    for (let r = 1; r <= rows; r++) {
      for (let c = 1; c <= cols; c++) {
        const px = c * gx;
        const py = r * gy;
        const dx = px - w / 2;
        const dy = py - h / 2;
        const dist = Math.sqrt(dx * dx + dy * dy) / (s * 0.5);
        const pz = dist * 300;
        const wave = sin(dist * 6 - st.phase) * 0.5 + 0.5;
        const { sx, sy, scale } = project(px, py, pz, w / 2, h / 2, cam);
        const sz =
          depthSize(2 + wave * 4 + audio.energy * 3, scale) * (s / 700);
        const hue = 260 + wave * 60;
        ctx.globalAlpha =
          clamp(0.3 + wave * 0.4, 0.3, 0.7) * depthAlpha(pz, 400);
        glow(ctx, hue, 80, 45, sz * 2);
        ctx.beginPath();
        ctx.arc(sx, sy, sz, 0, TAU);
        ctx.fill();
      }
    }
    ctx.restore();
  },
};

// ── 14: Helix Stream ── true 3D helix with z = cos(phase) ───────────────────

const helixStream: Scene = {
  name: "Helix Stream",
  init: () => {
    const ps: (P3 & { t: number; strand: number })[] = [];
    for (let i = 0; i < 200; i++)
      ps.push({
        ...mkP3(
          0,
          0,
          0,
          0,
          0,
          0,
          i % 2 === 0 ? 330 : 200,
          1,
          2 + Math.random(),
        ),
        t: i / 200,
        strand: i % 2,
      });
    return ps;
  },
  draw(dc, _s) {
    const ps = _s as (P3 & { t: number; strand: number })[];
    const { ctx, w, h, time, audio, cam } = dc;
    const s = S(w, h);
    const rot = time * 0.001;
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    for (const p of ps) {
      p.t += 0.002 * (1 + audio.energy);
      if (p.t > 1) p.t -= 1;
      const yy = p.t * h;
      const helixR = s * 0.12 * (1 + audio.mid * 0.4);
      const phase = p.strand * Math.PI + p.t * TAU * 2 + rot;
      const wx = w / 2 + cos(phase) * helixR;
      const pz = (cos(phase) * 0.5 + 0.5) * 150;
      const { sx, sy, scale } = project(wx, yy, pz, w / 2, h / 2, cam);
      const ds = depthSize(p.size, scale) * (s / 600);
      ctx.globalAlpha = depthAlpha(pz, 200) * 0.6;
      glow(ctx, p.hue, 85, 45, 10);
      ctx.beginPath();
      ctx.arc(sx, sy, ds, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  },
};

// ── 15: Gravity Well ── 3D funnel spiraling inward ───────────────────────────

type GravP = P3 & { ang: number; dist: number; aspd: number; z0: number };

function resetGravity3D(p: GravP) {
  p.dist = 0.3 + Math.random() * 0.5;
  p.ang = Math.random() * TAU;
  p.aspd = (0.5 + Math.random() * 1.5) * (Math.random() > 0.5 ? 1 : -1);
  p.hue = 10 + Math.random() * 50;
  p.size = 1.5 + Math.random() * 2;
  p.z0 = Math.random() * 400;
  p.z = p.z0;
}

const gravityWell: Scene = {
  name: "Gravity Well",
  init: () => {
    const ps: GravP[] = [];
    for (let i = 0; i < 200; i++) {
      const p: GravP = {
        ...mkP3(0, 0, 0, 0, 0, 0, 20, 1, 2),
        ang: 0,
        dist: 0,
        aspd: 0,
        z0: 0,
      };
      resetGravity3D(p);
      ps.push(p);
    }
    return ps;
  },
  draw(dc, _s) {
    const ps = _s as GravP[];
    const { ctx, w, h, audio, cam } = dc;
    const s = S(w, h);
    const pull = 0.001 + audio.bass * 0.003;
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    for (const p of ps) {
      p.ang += p.aspd * 0.02;
      p.dist -= pull;
      p.aspd *= 1 + pull * 0.5;
      p.z = p.z0 * clamp(p.dist / 0.8, 0, 1);
      if (p.dist < 0.01) resetGravity3D(p);
      const wx = w / 2 + cos(p.ang) * p.dist * s * 0.5;
      const wy = h / 2 + sin(p.ang) * p.dist * s * 0.5;
      const { sx, sy, scale } = project(wx, wy, p.z, w / 2, h / 2, cam);
      const ds = depthSize(p.size, scale) * (s / 500);
      ctx.globalAlpha = depthAlpha(p.z, 400) * 0.55;
      glow(ctx, p.hue, 90, lerp(55, 40, 1 - p.dist), lerp(4, 14, 1 - p.dist));
      ctx.beginPath();
      ctx.arc(sx, sy, ds, 0, TAU);
      ctx.fill();
    }
    const { sx: csx, sy: csy } = project(w / 2, h / 2, 0, w / 2, h / 2, cam);
    ctx.globalAlpha = 0.4 + audio.bass * 0.3;
    glow(ctx, 30, 95, 50, s * 0.05);
    ctx.beginPath();
    ctx.arc(csx, csy, s * 0.015, 0, TAU);
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
