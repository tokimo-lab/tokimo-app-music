import { S, TAU } from "./helpers";
import { hsl } from "./scene-buffer";
import type { Scene } from "./types";
import { clamp, lerp } from "./utils";

// ── 1. Möbius Strip ─────────────────────────────────────────────────────────

const mobiusStrip: Scene = {
  name: "Möbius Strip",
  init: () => null,
  draw(dc) {
    const { buf, w, h, time, audio } = dc;
    const scale = S(w, h) * 0.32 * (0.8 + audio.bass * 0.4);
    const twist = 1 + audio.mid * 0.5;
    const ry = time * 0.25;
    const rx = time * 0.15;
    const cosRy = Math.cos(ry),
      sinRy = Math.sin(ry);
    const cosRx = Math.cos(rx),
      sinRx = Math.sin(rx);
    const uSteps = 80;
    const vSteps = 6;
    const vWidth = 0.6;
    const hue = (time * 12) % 360;

    // u-lines (along the strip)
    for (let vi = 0; vi <= vSteps; vi++) {
      const v = ((vi / vSteps) * 2 - 1) * vWidth;
      const [r, g, b] = hsl((hue + vi * 25) % 360, 82, 48);
      const a = clamp(0.5 + audio.energy * 0.15, 0.35, 0.7);
      buf.lineStart();
      for (let ui = 0; ui <= uSteps; ui++) {
        const u = (ui / uSteps) * TAU;
        const halfU = u * twist * 0.5;
        const rad = 1 + (v / 2) * Math.cos(halfU);
        const px = rad * Math.cos(u) * scale;
        const py = rad * Math.sin(u) * scale;
        const pz = (v / 2) * Math.sin(halfU) * scale;
        // rotate Y then X
        const x1 = px * cosRy + pz * sinRy;
        const z1 = -px * sinRy + pz * cosRy;
        const y1 = py * cosRx - z1 * sinRx;
        const z2 = py * sinRx + z1 * cosRx;
        buf.lineTo(x1, y1, z2 + 200, r, g, b, a);
      }
    }

    // v-lines (cross-sections)
    for (let ui = 0; ui < uSteps; ui += 4) {
      const u = (ui / uSteps) * TAU;
      const halfU = u * twist * 0.5;
      const [r, g, b] = hsl((hue + 60 + ui * 2) % 360, 78, 50);
      buf.lineStart();
      for (let vi = 0; vi <= vSteps; vi++) {
        const v = ((vi / vSteps) * 2 - 1) * vWidth;
        const rad = 1 + (v / 2) * Math.cos(halfU);
        const px = rad * Math.cos(u) * scale;
        const py = rad * Math.sin(u) * scale;
        const pz = (v / 2) * Math.sin(halfU) * scale;
        const x1 = px * cosRy + pz * sinRy;
        const z1 = -px * sinRy + pz * cosRy;
        const y1 = py * cosRx - z1 * sinRx;
        const z2 = py * sinRx + z1 * cosRx;
        buf.lineTo(x1, y1, z2 + 200, r, g, b, 0.4);
      }
    }
  },
};

// ── 2. Torus Knot ────────────────────────────────────────────────────────────

interface KnotState {
  p: number;
  q: number;
  tp: number;
  tq: number;
}

const torusKnot: Scene = {
  name: "Torus Knot",
  init: (): KnotState => ({ p: 2, q: 3, tp: 3, tq: 5 }),
  draw(dc, raw) {
    const { buf, w, h, time, audio } = dc;
    const s = raw as KnotState;
    s.p = lerp(s.p, s.tp, 0.004);
    s.q = lerp(s.q, s.tq, 0.004);
    if (Math.abs(s.p - s.tp) < 0.05 && Math.abs(s.q - s.tq) < 0.05) {
      const pairs = [
        [2, 3],
        [3, 5],
        [2, 5],
        [3, 7],
        [5, 7],
        [3, 4],
        [2, 7],
      ];
      const pick = pairs[Math.floor(Math.random() * pairs.length)];
      s.tp = pick[0];
      s.tq = pick[1];
    }
    const scale = S(w, h) * 0.28 * (0.8 + audio.bass * 0.4);
    const R = 1.0;
    const rr = 0.4 + audio.mid * 0.15;
    const ry = time * 0.2;
    const rx = time * 0.12;
    const cosRy = Math.cos(ry),
      sinRy = Math.sin(ry);
    const cosRx = Math.cos(rx),
      sinRx = Math.sin(rx);
    const N = 400;
    const hue = (time * 10) % 360;

    buf.lineStart();
    for (let i = 0; i <= N; i++) {
      const t = (i / N) * TAU * 2;
      const rad = R + rr * Math.cos(s.q * t);
      const px = rad * Math.cos(s.p * t) * scale;
      const py = rad * Math.sin(s.p * t) * scale;
      const pz = rr * Math.sin(s.q * t) * scale;
      const x1 = px * cosRy + pz * sinRy;
      const z1 = -px * sinRy + pz * cosRy;
      const y1 = py * cosRx - z1 * sinRx;
      const z2 = py * sinRx + z1 * cosRx;
      const frac = i / N;
      const [r, g, b] = hsl((hue + frac * 180) % 360, 85, 47);
      const a = clamp(0.55 + audio.energy * 0.1, 0.4, 0.7);
      buf.lineTo(x1, y1, z2 + 200, r, g, b, a);
    }
  },
};

// ── 3. Lorenz Attractor ──────────────────────────────────────────────────────

interface LorenzState {
  trail: { x: number; y: number; z: number }[];
}

const lorenzAttractor: Scene = {
  name: "Lorenz Attractor",
  init: (): LorenzState => ({
    trail: [{ x: 0.1, y: 0, z: 0 }],
  }),
  draw(dc, raw) {
    const { buf, w, h, time, audio } = dc;
    const s = raw as LorenzState;
    const sigma = 10;
    const rho = 28 + audio.bass * 8;
    const beta = 8 / 3;
    const dt = 0.005;
    const stepsPerFrame = 60;

    // integrate
    let { x, y, z } = s.trail[s.trail.length - 1];
    for (let i = 0; i < stepsPerFrame; i++) {
      const dx = sigma * (y - x);
      const dy = x * (rho - z) - y;
      const dz = x * y - beta * z;
      x += dx * dt;
      y += dy * dt;
      z += dz * dt;
      s.trail.push({ x, y, z });
    }
    const maxLen = 2000;
    if (s.trail.length > maxLen) s.trail.splice(0, s.trail.length - maxLen);

    const scale = S(w, h) * 0.007 * (0.8 + audio.energy * 0.3);
    const ry = time * 0.08;
    const cosR = Math.cos(ry),
      sinR = Math.sin(ry);
    const baseHue = (time * 6) % 360;

    buf.lineStart();
    for (let i = 0; i < s.trail.length; i++) {
      const p = s.trail[i];
      const px = (p.x - 0) * scale;
      const py = (p.z - 25) * scale;
      const pz = p.y * scale;
      const rx = px * cosR + pz * sinR;
      const rz = -px * sinR + pz * cosR;
      const frac = i / s.trail.length;
      const speed =
        i > 0
          ? Math.sqrt(
              (p.x - s.trail[i - 1].x) ** 2 +
                (p.y - s.trail[i - 1].y) ** 2 +
                (p.z - s.trail[i - 1].z) ** 2,
            )
          : 0;
      const hue = (baseHue + speed * 40 + frac * 60) % 360;
      const [r, g, b] = hsl(hue, 85, 48);
      const a = clamp(frac * 0.6, 0.05, 0.65);
      buf.lineTo(rx, py, rz + 200, r, g, b, a);
    }
  },
};

// ── 4. Wireframe Cube ────────────────────────────────────────────────────────

const wireframeCube: Scene = {
  name: "Wireframe Cube",
  init: () => null,
  draw(dc) {
    const { buf, w, h, time, audio } = dc;
    const scale = S(w, h) * 0.22 * (0.8 + audio.bass * 0.5);
    const ax = time * 0.4;
    const ay = time * 0.55;
    const az = time * 0.3;
    // rotation matrices combined
    const cx = Math.cos(ax),
      sx = Math.sin(ax);
    const cy = Math.cos(ay),
      sy = Math.sin(ay);
    const cz = Math.cos(az),
      sz = Math.sin(az);

    const rot = (
      vx: number,
      vy: number,
      vz: number,
    ): [number, number, number] => {
      // Rz
      let x = vx * cz - vy * sz;
      const y = vx * sz + vy * cz;
      let z = vz;
      // Ry
      const x2 = x * cy + z * sy;
      const z2 = -x * sy + z * cy;
      x = x2;
      z = z2;
      // Rx
      const y2 = y * cx - z * sx;
      const z3 = y * sx + z * cx;
      return [x * scale, y2 * scale, z3 * scale];
    };

    // 8 vertices of unit cube centered at origin
    const verts: [number, number, number][] = [];
    for (let i = 0; i < 8; i++) {
      const vx = (i & 1) * 2 - 1;
      const vy = ((i >> 1) & 1) * 2 - 1;
      const vz = ((i >> 2) & 1) * 2 - 1;
      verts.push(rot(vx, vy, vz));
    }

    // 12 edges
    const edges = [
      [0, 1],
      [2, 3],
      [4, 5],
      [6, 7], // x-axis edges
      [0, 2],
      [1, 3],
      [4, 6],
      [5, 7], // y-axis edges
      [0, 4],
      [1, 5],
      [2, 6],
      [3, 7], // z-axis edges
    ];

    const baseHue = (time * 15) % 360;
    for (let ei = 0; ei < edges.length; ei++) {
      const [a, b] = edges[ei];
      const [x1, y1, z1] = verts[a];
      const [x2, y2, z2] = verts[b];
      const hue = (baseHue + ei * 30) % 360;
      const [r, g, b2] = hsl(hue, 80, 50);
      const al = clamp(0.55 + audio.energy * 0.1, 0.4, 0.7);
      buf.lineStart();
      // draw with intermediate points for smoother glow
      const segs = 8;
      for (let si = 0; si <= segs; si++) {
        const t = si / segs;
        buf.lineTo(
          lerp(x1, x2, t),
          lerp(y1, y2, t),
          lerp(z1, z2, t) + 200,
          r,
          g,
          b2,
          al,
        );
      }
    }

    // vertex points
    for (let i = 0; i < 8; i++) {
      const [px, py, pz] = verts[i];
      const [r, g, b2] = hsl((baseHue + 180) % 360, 85, 55);
      buf.point(px, py, pz + 200, r, g, b2, 0.6, 3 + audio.bass * 3);
    }
  },
};

// ── 5. Hypercube (Tesseract) ─────────────────────────────────────────────────

const tesseract: Scene = {
  name: "Tesseract",
  init: () => null,
  draw(dc) {
    const { buf, w, h, time, audio } = dc;
    const scale = S(w, h) * 0.2 * (0.8 + audio.bass * 0.4);

    // 16 vertices of 4D hypercube
    const verts4: [number, number, number, number][] = [];
    for (let i = 0; i < 16; i++) {
      verts4.push([
        (i & 1) * 2 - 1,
        ((i >> 1) & 1) * 2 - 1,
        ((i >> 2) & 1) * 2 - 1,
        ((i >> 3) & 1) * 2 - 1,
      ]);
    }

    // 32 edges: connect vertices that differ by exactly one coordinate
    const edges: [number, number][] = [];
    for (let i = 0; i < 16; i++) {
      for (let j = i + 1; j < 16; j++) {
        let diff = 0;
        for (let d = 0; d < 4; d++) {
          if (verts4[i][d] !== verts4[j][d]) diff++;
        }
        if (diff === 1) edges.push([i, j]);
      }
    }

    // 4D rotations: XW and YZ planes
    const aXW = time * 0.35 + audio.mid * 0.5;
    const aYZ = time * 0.25 + audio.high * 0.3;
    const cXW = Math.cos(aXW),
      sXW = Math.sin(aXW);
    const cYZ = Math.cos(aYZ),
      sYZ = Math.sin(aYZ);

    // 3D rotation
    const ay = time * 0.15;
    const cY = Math.cos(ay),
      sY = Math.sin(ay);

    const project = (
      v: [number, number, number, number],
    ): [number, number, number] => {
      // rotate in XW plane
      const x1 = v[0] * cXW - v[3] * sXW;
      const w1 = v[0] * sXW + v[3] * cXW;
      // rotate in YZ plane
      const y1 = v[1] * cYZ - v[2] * sYZ;
      const z1 = v[1] * sYZ + v[2] * cYZ;
      // perspective projection from 4D to 3D
      const dist4 = 3;
      const pf = dist4 / (dist4 - w1);
      const x3 = x1 * pf;
      const y3 = y1 * pf;
      const z3 = z1 * pf;
      // rotate in 3D (Y axis)
      const rx = x3 * cY + z3 * sY;
      const rz = -x3 * sY + z3 * cY;
      return [rx * scale, y3 * scale, rz * scale];
    };

    const projected = verts4.map(project);
    const baseHue = (time * 8) % 360;

    for (let ei = 0; ei < edges.length; ei++) {
      const [a, b] = edges[ei];
      const [x1, y1, z1] = projected[a];
      const [x2, y2, z2] = projected[b];
      const hue = (baseHue + ei * 11) % 360;
      const [r, g, b2] = hsl(hue, 82, 48);
      const al = clamp(0.45 + audio.energy * 0.1, 0.35, 0.65);
      buf.lineStart();
      const segs = 6;
      for (let si = 0; si <= segs; si++) {
        const t = si / segs;
        buf.lineTo(
          lerp(x1, x2, t),
          lerp(y1, y2, t),
          lerp(z1, z2, t) + 200,
          r,
          g,
          b2,
          al,
        );
      }
    }
  },
};

// ── 6. Klein Surface ─────────────────────────────────────────────────────────

const kleinSurface: Scene = {
  name: "Klein Surface",
  init: () => null,
  draw(dc) {
    const { buf, w, h, time, audio } = dc;
    const scale = S(w, h) * 0.05 * (0.8 + audio.bass * 0.3);
    const wobble = audio.mid * 0.3;
    const ry = time * 0.2;
    const rx = time * 0.12;
    const cosRy = Math.cos(ry),
      sinRy = Math.sin(ry);
    const cosRx = Math.cos(rx),
      sinRx = Math.sin(rx);
    const baseHue = (time * 10) % 360;
    const uSteps = 50;
    const vSteps = 20;

    const klein = (u: number, v: number): [number, number, number] => {
      const cosU = Math.cos(u),
        sinU = Math.sin(u);
      const cosV = Math.cos(v),
        sinV = Math.sin(v);
      const halfU = u / 2;
      const cosHU = Math.cos(halfU),
        sinHU = Math.sin(halfU);
      const r = 4 * (1 - cosU / 2) + wobble * Math.sin(u * 3 + time);
      const x = (6 * cosU * (1 + sinU) + r * cosV * cosHU) * scale;
      const y = (16 * sinU + r * cosV * sinHU) * scale;
      const z = r * sinV * scale;
      return [x, y, z];
    };

    const rotPoint = (
      px: number,
      py: number,
      pz: number,
    ): [number, number, number] => {
      const x1 = px * cosRy + pz * sinRy;
      const z1 = -px * sinRy + pz * cosRy;
      const y1 = py * cosRx - z1 * sinRx;
      const z2 = py * sinRx + z1 * cosRx;
      return [x1, y1, z2];
    };

    // u-lines
    for (let vi = 0; vi <= vSteps; vi += 4) {
      const v = (vi / vSteps) * TAU;
      const [r, g, b] = hsl((baseHue + vi * 8) % 360, 80, 48);
      const a = clamp(0.45 + audio.energy * 0.1, 0.3, 0.65);
      buf.lineStart();
      for (let ui = 0; ui <= uSteps; ui++) {
        const u = (ui / uSteps) * TAU;
        const [kx, ky, kz] = klein(u, v);
        const [rx, ry2, rz] = rotPoint(kx, ky, kz);
        buf.lineTo(rx, ry2, rz + 200, r, g, b, a);
      }
    }

    // v-lines
    for (let ui = 0; ui <= uSteps; ui += 5) {
      const u = (ui / uSteps) * TAU;
      const [r, g, b] = hsl((baseHue + 90 + ui * 5) % 360, 78, 50);
      buf.lineStart();
      for (let vi = 0; vi <= vSteps; vi++) {
        const v = (vi / vSteps) * TAU;
        const [kx, ky, kz] = klein(u, v);
        const [rx, ry2, rz] = rotPoint(kx, ky, kz);
        buf.lineTo(rx, ry2, rz + 200, r, g, b, 0.4);
      }
    }
  },
};

// ── 7. Geodesic Sphere ───────────────────────────────────────────────────────

interface GeoState {
  verts: [number, number, number][];
  edges: [number, number][];
}

function buildIcosahedron(): GeoState {
  const phi = (1 + Math.sqrt(5)) / 2;
  const raw: [number, number, number][] = [
    [-1, phi, 0],
    [1, phi, 0],
    [-1, -phi, 0],
    [1, -phi, 0],
    [0, -1, phi],
    [0, 1, phi],
    [0, -1, -phi],
    [0, 1, -phi],
    [phi, 0, -1],
    [phi, 0, 1],
    [-phi, 0, -1],
    [-phi, 0, 1],
  ];
  // normalize to unit sphere
  const verts = raw.map((v) => {
    const len = Math.sqrt(v[0] ** 2 + v[1] ** 2 + v[2] ** 2);
    return [v[0] / len, v[1] / len, v[2] / len] as [number, number, number];
  });

  const faces: [number, number, number][] = [
    [0, 11, 5],
    [0, 5, 1],
    [0, 1, 7],
    [0, 7, 10],
    [0, 10, 11],
    [1, 5, 9],
    [5, 11, 4],
    [11, 10, 2],
    [10, 7, 6],
    [7, 1, 8],
    [3, 9, 4],
    [3, 4, 2],
    [3, 2, 6],
    [3, 6, 8],
    [3, 8, 9],
    [4, 9, 5],
    [2, 4, 11],
    [6, 2, 10],
    [8, 6, 7],
    [9, 8, 1],
  ];

  // subdivide once
  const midCache = new Map<string, number>();
  const getMid = (a: number, b: number): number => {
    const key = a < b ? `${a}-${b}` : `${b}-${a}`;
    if (midCache.has(key)) return midCache.get(key)!;
    const va = verts[a],
      vb = verts[b];
    const mx = (va[0] + vb[0]) / 2;
    const my = (va[1] + vb[1]) / 2;
    const mz = (va[2] + vb[2]) / 2;
    const len = Math.sqrt(mx ** 2 + my ** 2 + mz ** 2);
    verts.push([mx / len, my / len, mz / len]);
    const idx = verts.length - 1;
    midCache.set(key, idx);
    return idx;
  };

  const newFaces: [number, number, number][] = [];
  for (const [a, b, c] of faces) {
    const ab = getMid(a, b);
    const bc = getMid(b, c);
    const ca = getMid(c, a);
    newFaces.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
  }

  // collect unique edges from subdivided faces
  const edgeSet = new Set<string>();
  const edges: [number, number][] = [];
  for (const [a, b, c] of newFaces) {
    for (const [ea, eb] of [
      [a, b],
      [b, c],
      [c, a],
    ] as [number, number][]) {
      const key = ea < eb ? `${ea}-${eb}` : `${eb}-${ea}`;
      if (!edgeSet.has(key)) {
        edgeSet.add(key);
        edges.push([ea, eb]);
      }
    }
  }

  return { verts, edges };
}

const geodesicSphere: Scene = {
  name: "Geodesic Sphere",
  init: (): GeoState => buildIcosahedron(),
  draw(dc, raw) {
    const { buf, w, h, time, audio } = dc;
    const s = raw as GeoState;
    const baseR = S(w, h) * 0.32 * (0.8 + audio.bass * 0.5);
    const ry = time * 0.2;
    const rx = time * 0.13;
    const cosRy = Math.cos(ry),
      sinRy = Math.sin(ry);
    const cosRx = Math.cos(rx),
      sinRx = Math.sin(rx);
    const breathe = 1 + Math.sin(time * 1.5) * 0.08 + audio.energy * 0.15;
    const baseHue = (time * 9) % 360;
    const r0 = baseR * breathe;

    for (let ei = 0; ei < s.edges.length; ei++) {
      const [a, b] = s.edges[ei];
      const va = s.verts[a],
        vb = s.verts[b];
      const hue = (baseHue + ei * 2) % 360;
      const [r, g, b2] = hsl(hue, 82, 47);
      const al = clamp(0.45 + audio.energy * 0.1, 0.35, 0.65);
      buf.lineStart();
      for (let si = 0; si <= 3; si++) {
        const t = si / 3;
        const mx = lerp(va[0], vb[0], t);
        const my = lerp(va[1], vb[1], t);
        const mz = lerp(va[2], vb[2], t);
        // re-normalize to sphere surface
        const len = Math.sqrt(mx ** 2 + my ** 2 + mz ** 2);
        const px = (mx / len) * r0;
        const py = (my / len) * r0;
        const pz = (mz / len) * r0;
        // rotate
        const x1 = px * cosRy + pz * sinRy;
        const z1 = -px * sinRy + pz * cosRy;
        const y1 = py * cosRx - z1 * sinRx;
        const z2 = py * sinRx + z1 * cosRx;
        buf.lineTo(x1, y1, z2 + 200, r, g, b2, al);
      }
    }
  },
};

// ── 8. Helix Cage ────────────────────────────────────────────────────────────

const helixCage: Scene = {
  name: "Helix Cage",
  init: () => null,
  draw(dc) {
    const { buf, w, h, time, audio } = dc;
    const R = S(w, h) * 0.22 * (0.8 + audio.bass * 0.4);
    const halfH = S(w, h) * 0.35;
    const helixCount = 6;
    const turns = 4 + audio.mid * 2;
    const N = 120;
    const baseHue = (time * 11) % 360;
    const ry = time * 0.15;
    const cosR = Math.cos(ry),
      sinR = Math.sin(ry);

    // store helix points for cross-links
    const helixPts: [number, number, number][][] = [];

    for (let hi = 0; hi < helixCount; hi++) {
      const phase = (hi / helixCount) * TAU;
      const hue = (baseHue + hi * 60) % 360;
      const [r, g, b] = hsl(hue, 85, 48);
      const a = clamp(0.5 + audio.energy * 0.1, 0.4, 0.7);
      const pts: [number, number, number][] = [];
      buf.lineStart();
      for (let i = 0; i <= N; i++) {
        const t = (i / N) * TAU * turns;
        const frac = i / N;
        const yy = (frac * 2 - 1) * halfH;
        const px = R * Math.cos(t + phase + time * 0.3);
        const pz = R * Math.sin(t + phase + time * 0.3);
        // rotate around Y for 3D feel
        const rx = px * cosR + pz * sinR;
        const rz = -px * sinR + pz * cosR;
        pts.push([rx, yy, rz]);
        buf.lineTo(rx, yy, rz + 200, r, g, b, a);
      }
      helixPts.push(pts);
    }

    // cross-links between adjacent helices
    const linkEvery = 12;
    const [lr, lg, lb] = hsl((baseHue + 180) % 360, 75, 52);
    for (let hi = 0; hi < helixCount; hi++) {
      const next = (hi + 1) % helixCount;
      for (let i = 0; i <= N; i += linkEvery) {
        const pa = helixPts[hi][i];
        const pb = helixPts[next][i];
        buf.lineStart();
        buf.lineTo(pa[0], pa[1], pa[2] + 200, lr, lg, lb, 0.3);
        buf.lineTo(pb[0], pb[1], pb[2] + 200, lr, lg, lb, 0.3);
      }
    }
  },
};

// ── 9. Prism Refraction ──────────────────────────────────────────────────────

const prismRefraction: Scene = {
  name: "Prism Refraction",
  init: () => null,
  draw(dc) {
    const { buf, w, h, time, audio } = dc;
    const sz = S(w, h);
    const prismH = sz * 0.28 * (0.9 + audio.bass * 0.2);
    const prismRot = time * 0.2;
    const cosP = Math.cos(prismRot),
      sinP = Math.sin(prismRot);

    // triangular prism vertices (6 vertices: 2 triangles)
    const triR = prismH * 0.35;
    const depth = prismH * 0.3;
    const triVerts: [number, number, number][] = [];
    for (let f = 0; f < 2; f++) {
      const zz = (f * 2 - 1) * depth;
      for (let i = 0; i < 3; i++) {
        const angle = (i / 3) * TAU - Math.PI / 2;
        const vx = triR * Math.cos(angle);
        const vy = triR * Math.sin(angle);
        const rx = vx * cosP - zz * sinP;
        const rz = vx * sinP + zz * cosP;
        triVerts.push([rx, vy, rz]);
      }
    }

    // draw prism edges (3 front + 3 back + 3 connecting)
    const prismEdges = [
      [0, 1],
      [1, 2],
      [2, 0],
      [3, 4],
      [4, 5],
      [5, 3],
      [0, 3],
      [1, 4],
      [2, 5],
    ];
    const [pr, pg, pb] = hsl(200, 70, 55);
    for (const [a, b] of prismEdges) {
      const va = triVerts[a],
        vb = triVerts[b];
      buf.lineStart();
      for (let si = 0; si <= 6; si++) {
        const t = si / 6;
        buf.lineTo(
          lerp(va[0], vb[0], t),
          lerp(va[1], vb[1], t),
          lerp(va[2], vb[2], t) + 200,
          pr,
          pg,
          pb,
          0.5,
        );
      }
    }

    // incoming white light rays from left
    const rayCount = 5;
    const rayStartX = -sz * 0.42;
    const spread = audio.high * 0.3 + 0.15;
    const rainbowHues = [0, 30, 60, 120, 200, 270, 310];

    for (let ri = 0; ri < rayCount; ri++) {
      const ry = ((ri / (rayCount - 1)) * 2 - 1) * prismH * 0.15;
      // incoming ray (white-ish)
      const [wr, wg, wb] = hsl(50, 20, 70);
      buf.lineStart();
      buf.lineTo(rayStartX, ry, 200, wr, wg, wb, 0.45);
      buf.lineTo(0, ry * 0.3, 200, wr, wg, wb, 0.45);

      // refracted rainbow rays exiting right
      for (let ci = 0; ci < rainbowHues.length; ci++) {
        const hue = rainbowHues[ci];
        const [cr, cg, cb] = hsl(hue, 90, 50);
        const exitAngle = ((ci / (rainbowHues.length - 1)) * 2 - 1) * spread;
        const exitY = ry * 0.3 + Math.sin(exitAngle * Math.PI) * prismH * 0.6;
        const exitX = sz * 0.42;
        const al = clamp(0.4 + audio.energy * 0.15, 0.3, 0.65);
        const waveOff = Math.sin(time * 2 + ci + ri) * sz * 0.02;
        buf.lineStart();
        buf.lineTo(0, ry * 0.3, 200, cr, cg, cb, al);
        buf.lineTo(
          exitX * 0.5,
          (ry * 0.3 + exitY) * 0.5 + waveOff,
          200,
          cr,
          cg,
          cb,
          al,
        );
        buf.lineTo(exitX, exitY + waveOff, 200, cr, cg, cb, al * 0.7);
      }
    }
  },
};

// ── 10. Wormhole ─────────────────────────────────────────────────────────────

const wormhole: Scene = {
  name: "Wormhole",
  init: () => null,
  draw(dc) {
    const { buf, w, h, time, audio } = dc;
    const sz = S(w, h);
    const throatA = sz * 0.06 * (0.5 + audio.bass * 1.0);
    const maxZ = sz * 0.4;
    const ringCount = 30;
    const ringSegs = 48;
    const baseHue = (time * 7) % 360;
    const rotSpeed = time * 0.3;

    for (let ri = 0; ri < ringCount; ri++) {
      const frac = ri / (ringCount - 1);
      // z ranges from -maxZ to +maxZ
      const zPos = (frac * 2 - 1) * maxZ;
      // wormhole profile: r = sqrt(z² + a²)
      const radius = Math.sqrt(zPos * zPos + throatA * throatA);
      const scaledR = radius * (sz * 0.004);
      const hue = (baseHue + ri * 8 + Math.abs(zPos) * 0.3) % 360;
      const [r, g, b] = hsl(hue, 85, 47);
      // fade rings further from center
      const distFromCenter = Math.abs(frac - 0.5) * 2;
      const al = clamp(
        0.55 - distFromCenter * 0.2 + audio.energy * 0.1,
        0.2,
        0.65,
      );
      const ringRot = rotSpeed + ri * 0.05;

      buf.lineStart();
      for (let si = 0; si <= ringSegs; si++) {
        const angle = (si / ringSegs) * TAU + ringRot;
        const px = scaledR * Math.cos(angle);
        const py = scaledR * Math.sin(angle);
        // tilt rings to show 3D depth
        const tilt = 0.4;
        const y1 = py * Math.cos(tilt) - zPos * 0.5 * Math.sin(tilt);
        const z1 = py * Math.sin(tilt) + zPos * 0.5 * Math.cos(tilt);
        buf.lineTo(px, y1, z1 + 200, r, g, b, al);
      }
    }

    // longitudinal lines connecting rings
    const lonLines = 12;
    for (let li = 0; li < lonLines; li++) {
      const angle0 = (li / lonLines) * TAU;
      const hue = (baseHue + 90 + li * 30) % 360;
      const [r, g, b] = hsl(hue, 78, 52);
      buf.lineStart();
      for (let ri = 0; ri < ringCount; ri++) {
        const frac = ri / (ringCount - 1);
        const zPos = (frac * 2 - 1) * maxZ;
        const radius = Math.sqrt(zPos * zPos + throatA * throatA);
        const scaledR = radius * (sz * 0.004);
        const angle = angle0 + rotSpeed + ri * 0.05;
        const px = scaledR * Math.cos(angle);
        const py = scaledR * Math.sin(angle);
        const tilt = 0.4;
        const y1 = py * Math.cos(tilt) - zPos * 0.5 * Math.sin(tilt);
        const z1 = py * Math.sin(tilt) + zPos * 0.5 * Math.cos(tilt);
        const distFromCenter = Math.abs(frac - 0.5) * 2;
        const al = clamp(0.4 - distFromCenter * 0.15, 0.15, 0.55);
        buf.lineTo(px, y1, z1 + 200, r, g, b, al);
      }
    }
  },
};

// ── Export ────────────────────────────────────────────────────────────────────

export const geometricScenes: Scene[] = [
  mobiusStrip,
  torusKnot,
  lorenzAttractor,
  wireframeCube,
  tesseract,
  kleinSurface,
  geodesicSphere,
  helixCage,
  prismRefraction,
  wormhole,
];
