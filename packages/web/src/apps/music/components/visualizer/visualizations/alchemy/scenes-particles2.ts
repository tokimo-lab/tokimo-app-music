import type { P3 } from "./helpers";
import { mkP3, S, TAU } from "./helpers";
import { hsl, type SceneBuffer } from "./scene-buffer";
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
    const { buf, w, h, audio } = dc;
    const s = S(w, h);
    for (const p of ps) {
      p.ang += p.spd * 0.015 * (1 + audio.energy);
      const radius = (0.08 + p.ring * 0.08) * s * (1 + audio.bass * 0.2);
      const tilt = 0.3 + p.ring * 0.1;
      const px = cos(p.ang) * radius;
      const py = sin(p.ang) * radius * tilt;
      const alpha = Math.max(0, 1 - p.z / 1200) * 0.6;
      const ds = p.size * (s / 600);
      const [cr, cg, cb] = hsl(p.hue, 80, 48);
      buf.point(px, py, p.z, cr, cg, cb, alpha, ds);
    }
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
    const { buf, w, h, audio } = dc;
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
    for (const ring of st.rings) {
      ring.life++;
      ring.r += (ring.maxR - ring.r) * 0.04;
      ring.z = ring.life * 5;
      const fade = clamp(1 - ring.life / 80, 0, 1);
      const alpha = fade * Math.max(0, 1 - ring.z / 500) * 0.6;
      const [cr, cg, cb] = hsl(ring.hue, 85, 45);
      buf.circle(0, 0, ring.z, ring.r, cr, cg, cb, alpha);
    }
    st.rings = st.rings.filter((r) => r.life < 80);
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
    const { buf, w, h, time, audio } = dc;
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
    for (const p of st.ps) {
      p.y += p.vy;
      p.x += p.vx + sin(time * 0.001 + p.x * 0.01) * 0.3 * (1 + audio.mid);
      if (p.y > h + 10) resetSnow3D(p, w);
      const px = p.x - w / 2;
      const py = p.y - h / 2;
      const ds = p.size * (s / 700);
      const alpha = Math.max(0, 1 - p.z / 500) * 0.55;
      const [cr, cg, cb] = hsl(p.hue, 70, 55);
      buf.point(px, py, p.z, cr, cg, cb, alpha, ds);
    }
  },
};

// ── 11: Electric Arc ── arcs at different z-planes ───────────────────────────

interface ArcAnchor3D {
  x: number;
  y: number;
  z: number;
}

function drawArc3D(
  buf: SceneBuffer,
  x1: number,
  y1: number,
  z1: number,
  x2: number,
  y2: number,
  z2: number,
  depth: number,
  s: number,
  r: number,
  g: number,
  b: number,
  a: number,
) {
  if (depth <= 0) {
    buf.lineTo(x2, y2, z2, r, g, b, a);
    return;
  }
  const mx = (x1 + x2) / 2 + (Math.random() - 0.5) * s * 0.08 * depth;
  const my = (y1 + y2) / 2 + (Math.random() - 0.5) * s * 0.08 * depth;
  const mz = (z1 + z2) / 2;
  drawArc3D(buf, x1, y1, z1, mx, my, mz, depth - 1, s, r, g, b, a);
  drawArc3D(buf, mx, my, mz, x2, y2, z2, depth - 1, s, r, g, b, a);
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
    const { buf, w, h, frame, audio } = dc;
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
    if (frame % 2 !== 0) return;
    const hue = 180 + audio.energy * 60;
    const [cr, cg, cb] = hsl(hue, 90, 45);
    for (let i = 0; i < st.anchors.length - 1; i++) {
      const a = st.anchors[i];
      const b = st.anchors[i + 1];
      const avgZ = (a.z + b.z) / 2;
      const alpha =
        clamp(0.4 + audio.high * 0.4, 0.3, 0.8) * Math.max(0, 1 - avgZ / 400);
      const ax = a.x * w - w / 2;
      const ay = a.y * h - h / 2;
      const bx = b.x * w - w / 2;
      const by = b.y * h - h / 2;
      buf.lineStart();
      buf.lineTo(ax, ay, a.z, cr, cg, cb, alpha);
      drawArc3D(buf, ax, ay, a.z, bx, by, b.z, 4, s, cr, cg, cb, alpha);
    }
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
    const { buf, w, h, audio } = dc;
    const s = S(w, h);
    for (const c of comets) {
      c.ang += c.spd * 0.02 * (1 + audio.energy);
      const wx = w / 2 + cos(c.ang) * c.r * s;
      const wy = h / 2 + sin(c.ang) * c.r * s * 0.6;
      c.trail.push({ x: wx, y: wy, z: c.z });
      if (c.trail.length > 40) c.trail.shift();
      const [cr, cg, cb] = hsl(c.hue, 85, 45);
      for (let i = 0; i < c.trail.length; i++) {
        const t = i / c.trail.length;
        const tp = c.trail[i];
        const px = tp.x - w / 2;
        const py = tp.y - h / 2;
        const ds = lerp(1, 4, t) * (s / 500);
        const alpha = t * Math.max(0, 1 - tp.z / 1200) * 0.6;
        buf.point(px, py, tp.z, cr, cg, cb, alpha, ds);
      }
    }
  },
};

// ── 13: Pulse Dots ── 3D grid curving toward viewer ──────────────────────────

const pulseDots: Scene = {
  name: "Pulse Dots",
  init: () => ({ phase: 0 }),
  draw(dc, _s) {
    const st = _s as { phase: number };
    const { buf, w, h, audio } = dc;
    const s = S(w, h);
    st.phase += 0.03 + audio.bass * 0.05;
    const cols = 20;
    const rows = 14;
    const gx = w / (cols + 1);
    const gy = h / (rows + 1);
    for (let r = 1; r <= rows; r++) {
      for (let c = 1; c <= cols; c++) {
        const px = c * gx;
        const py = r * gy;
        const dx = px - w / 2;
        const dy = py - h / 2;
        const dist = Math.sqrt(dx * dx + dy * dy) / (s * 0.5);
        const pz = dist * 300;
        const wave = sin(dist * 6 - st.phase) * 0.5 + 0.5;
        const sz = (2 + wave * 4 + audio.energy * 3) * (s / 700);
        const hue = 260 + wave * 60;
        const alpha =
          clamp(0.3 + wave * 0.4, 0.3, 0.7) * Math.max(0, 1 - pz / 400);
        const [cr, cg, cb] = hsl(hue, 80, 45);
        buf.point(dx, dy, pz, cr, cg, cb, alpha, sz);
      }
    }
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
    const { buf, w, h, time, audio } = dc;
    const s = S(w, h);
    const rot = time * 0.001;
    for (const p of ps) {
      p.t += 0.002 * (1 + audio.energy);
      if (p.t > 1) p.t -= 1;
      const yy = p.t * h;
      const helixR = s * 0.12 * (1 + audio.mid * 0.4);
      const phase = p.strand * Math.PI + p.t * TAU * 2 + rot;
      const px = cos(phase) * helixR;
      const py = yy - h / 2;
      const pz = (cos(phase) * 0.5 + 0.5) * 150;
      const ds = p.size * (s / 600);
      const alpha = Math.max(0, 1 - pz / 200) * 0.6;
      const [cr, cg, cb] = hsl(p.hue, 85, 45);
      buf.point(px, py, pz, cr, cg, cb, alpha, ds);
    }
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
    const { buf, w, h, audio } = dc;
    const s = S(w, h);
    const pull = 0.001 + audio.bass * 0.003;
    for (const p of ps) {
      p.ang += p.aspd * 0.02;
      p.dist -= pull;
      p.aspd *= 1 + pull * 0.5;
      p.z = p.z0 * clamp(p.dist / 0.8, 0, 1);
      if (p.dist < 0.01) resetGravity3D(p);
      const px = cos(p.ang) * p.dist * s * 0.5;
      const py = sin(p.ang) * p.dist * s * 0.5;
      const ds = p.size * (s / 500);
      const alpha = Math.max(0, 1 - p.z / 400) * 0.55;
      const [cr, cg, cb] = hsl(p.hue, 90, lerp(55, 40, 1 - p.dist));
      buf.point(px, py, p.z, cr, cg, cb, alpha, ds);
    }
    const centerAlpha = 0.4 + audio.bass * 0.3;
    const [gr, gg, gb] = hsl(30, 95, 50);
    buf.point(0, 0, 0, gr, gg, gb, centerAlpha, s * 0.015);
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
