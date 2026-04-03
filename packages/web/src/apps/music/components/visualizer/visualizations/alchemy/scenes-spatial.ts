/**
 * 10 spatial 3D visualization scenes for the Alchemy visualizer.
 */

import { S, snoise, TAU } from "./helpers";
import { hsl } from "./scene-buffer";
import type { Scene } from "./types";
import { clamp, hash } from "./utils";

const nil = () => null;

// ── 1. Star Warp ─────────────────────────────────────────────────────────────

interface StarWarpStar {
  x: number;
  y: number;
  z: number;
  speed: number;
  hue: number;
}

interface StarWarpState {
  stars: StarWarpStar[];
  prevTime: number;
}

const starWarp: Scene = {
  name: "Star Warp",
  init: (): StarWarpState => {
    const stars: StarWarpStar[] = [];
    for (let i = 0; i < 200; i++) {
      stars.push({
        x: (hash(i * 3) - 0.5) * 2,
        y: (hash(i * 3 + 1) - 0.5) * 2,
        z: hash(i * 3 + 2) * 400,
        speed: 0.3 + hash(i * 7) * 0.7,
        hue: hash(i * 11) * 360,
      });
    }
    return { stars, prevTime: 0 };
  },
  draw(dc, raw) {
    const { buf, w, h, time, audio } = dc;
    const st = raw as StarWarpState;
    const dt = st.prevTime > 0 ? clamp(time - st.prevTime, 0, 0.05) : 0.016;
    st.prevTime = time;
    const scale = S(w, h) * 0.45;
    const speed = (80 + audio.energy * 200) * dt;

    for (const star of st.stars) {
      const oz = star.z;
      star.z -= speed * star.speed;
      if (star.z < 1) {
        star.z = 370 + hash(Math.floor(time * 100 + star.hue) & 0xfff) * 30;
        star.x =
          (hash(Math.floor(time * 997 + star.hue * 2) & 0xfff) - 0.5) * 2;
        star.y =
          (hash(Math.floor(time * 991 + star.hue * 3) & 0xfff) - 0.5) * 2;
        continue;
      }
      const depth = star.z * 0.01 + 1;
      const px = (star.x * scale) / depth;
      const py = (star.y * scale) / depth;
      const opx = (star.x * scale) / (oz * 0.01 + 1);
      const opy = (star.y * scale) / (oz * 0.01 + 1);
      const bright = clamp(1 - star.z / 400, 0, 1);
      const [r, g, b] = hsl(star.hue, 80, 45 + bright * 20);
      buf.lineStart();
      buf.lineTo(opx, opy, oz, r, g, b, bright * 0.3);
      buf.lineTo(px, py, star.z, r, g, b, bright * 0.7);
    }
  },
};

// ── 2. Particle Tunnel ───────────────────────────────────────────────────────

const particleTunnel: Scene = {
  name: "Particle Tunnel",
  init: nil,
  draw(dc) {
    const { buf, w, h, time, audio } = dc;
    const scale = S(w, h) * 0.35;
    const ringCount = 30;
    const baseRadius = 0.6 + audio.bass * 0.3;

    for (let i = 0; i < ringCount; i++) {
      const zOff = (time * 60 + i * 14) % 420;
      const depthFade = 1 - zOff / 420;
      const pulse = 1 + Math.sin(time * 3 + i * 0.5) * 0.1 * (1 + audio.mid);
      const radius = baseRadius * pulse * scale * depthFade;
      const rotation = time * 0.3 + i * 0.2;
      const hueShift = (i / ringCount) * 360 + time * 30;
      const [r, g, b] = hsl(hueShift, 85, 45);
      const segs = 24;
      buf.lineStart();
      for (let j = 0; j <= segs; j++) {
        const angle = (j / segs) * TAU + rotation;
        const rx = Math.cos(angle) * radius;
        const ry = Math.sin(angle) * radius;
        buf.lineTo(rx, ry, zOff, r, g, b, depthFade * 0.6);
      }
    }
  },
};

// ── 3. Orbital System ────────────────────────────────────────────────────────

interface OrbitalPlanet {
  dist: number;
  speed: number;
  hue: number;
  size: number;
  moons: { dist: number; speed: number; size: number }[];
}

const orbitalSystem: Scene = {
  name: "Orbital System",
  init: (): OrbitalPlanet[] => {
    const planets: OrbitalPlanet[] = [];
    for (let i = 0; i < 5; i++) {
      const moonCount = i < 2 ? 1 : i < 4 ? 2 : 3;
      const moons: OrbitalPlanet["moons"] = [];
      for (let m = 0; m < moonCount; m++) {
        moons.push({
          dist: 12 + m * 8,
          speed: 3 + hash(i * 10 + m) * 4,
          size: 2 + hash(i * 10 + m + 50) * 2,
        });
      }
      planets.push({
        dist: 0.12 + i * 0.07,
        speed: 0.3 + (4 - i) * 0.15,
        hue: i * 72,
        size: 4 + hash(i) * 4,
        moons,
      });
    }
    return planets;
  },
  draw(dc, raw) {
    const { buf, w, h, time, audio } = dc;
    const planets = raw as OrbitalPlanet[];
    const scale = S(w, h) * 0.4;
    const speedMul = 1 + audio.energy * 0.8;

    // Central star
    const [sr, sg, sb] = hsl(40, 90, 55);
    buf.point(0, 0, 100, sr, sg, sb, 0.9, 8 + audio.bass * 4);

    for (const p of planets) {
      const orbitR = p.dist * scale;
      const angle = time * p.speed * speedMul;
      const px = Math.cos(angle) * orbitR;
      const py = Math.sin(angle) * orbitR;
      const z = 100 + Math.sin(angle) * 50;

      // Faint orbital path
      const [or, og, ob] = hsl(p.hue, 70, 40);
      buf.circle(0, 0, 120, orbitR, or, og, ob, 0.15, 48);

      // Bright recent trail arc
      const trailLen = 0.8 + audio.high * 0.6;
      buf.arc(0, 0, z, orbitR, angle - trailLen, angle, or, og, ob, 0.5, 20);

      // Planet point
      const [pr, pg, pb] = hsl(p.hue, 85, 50);
      buf.point(px, py, z, pr, pg, pb, 0.8, p.size);

      // Moons
      for (const moon of p.moons) {
        const ma = time * moon.speed * speedMul;
        const mx = px + Math.cos(ma) * moon.dist;
        const my = py + Math.sin(ma) * moon.dist;
        buf.point(mx, my, z - 5, pr, pg, pb, 0.6, moon.size);
      }
    }
  },
};

// ── 4. Helix Tower ───────────────────────────────────────────────────────────

const helixTower: Scene = {
  name: "Helix Tower",
  init: nil,
  draw(dc) {
    const { buf, w, h, time, audio } = dc;
    const scale = S(w, h) * 0.3;
    const baseR = 0.6 + audio.bass * 0.3;
    const rotSpeed = time * 0.8 * (1 + audio.energy * 0.5);
    const steps = 80;
    const height = scale * 1.6;

    // Two intertwined helices
    for (let helix = 0; helix < 2; helix++) {
      const offset = helix * Math.PI;
      const [cr, cg, cb] = hsl(helix === 0 ? 200 : 340, 85, 50);
      buf.lineStart();
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const angle = t * TAU * 4 + rotSpeed + offset;
        const r = baseR * scale * (0.8 + Math.sin(t * TAU * 2) * 0.15);
        const x = Math.cos(angle) * r;
        const y = -height / 2 + t * height;
        const z = 100 + Math.sin(angle) * 80;
        buf.lineTo(x, y, z, cr, cg, cb, 0.6);
      }
    }

    // Cross-links between helices
    const linkCount = 16;
    const [lr, lg, lb] = hsl(60, 80, 50);
    for (let i = 0; i < linkCount; i++) {
      const t = (i + 0.5) / linkCount;
      const angle = t * TAU * 4 + rotSpeed;
      const r = baseR * scale * (0.8 + Math.sin(t * TAU * 2) * 0.15);
      const x1 = Math.cos(angle) * r;
      const x2 = Math.cos(angle + Math.PI) * r;
      const y = -height / 2 + t * height;
      const z1 = 100 + Math.sin(angle) * 80;
      const z2 = 100 + Math.sin(angle + Math.PI) * 80;
      buf.lineStart();
      buf.lineTo(x1, y, z1, lr, lg, lb, 0.35);
      buf.lineTo(x2, y, z2, lr, lg, lb, 0.35);
    }
  },
};

// ── 5. Gyroscope Rings ───────────────────────────────────────────────────────

const gyroscopeRings: Scene = {
  name: "Gyroscope Rings",
  init: nil,
  draw(dc) {
    const { buf, w, h, time, audio } = dc;
    const scale = S(w, h) * 0.35;
    const segs = 48;

    const axes: [number, number, number, number][] = [
      [0, 1.0, 0.0, 0.0],
      [120, 0.0, 0.7, 0.0],
      [240, 0.0, 0.0, 0.5],
    ];

    for (const [hue, spdX, spdY, spdZ] of axes) {
      const r = scale * (0.8 + audio.energy * 0.2);
      const [cr, cg, cb] = hsl(hue + time * 20, 85, 48);
      const ax = time * spdX * (1 + audio.bass * 0.5);
      const ay = time * spdY * (1 + audio.mid * 0.5);
      const az = time * spdZ * (1 + audio.high * 0.5);
      const cosAx = Math.cos(ax);
      const sinAx = Math.sin(ax);
      const cosAy = Math.cos(ay);
      const sinAy = Math.sin(ay);
      const cosAz = Math.cos(az);
      const sinAz = Math.sin(az);

      buf.lineStart();
      for (let i = 0; i <= segs; i++) {
        const angle = (i / segs) * TAU;
        let x = Math.cos(angle) * r;
        let y = Math.sin(angle) * r;
        let z = 0;

        // Rotate around X
        const y1 = y * cosAx - z * sinAx;
        const z1 = y * sinAx + z * cosAx;
        y = y1;
        z = z1;

        // Rotate around Y
        const x2 = x * cosAy + z * sinAy;
        const z2 = -x * sinAy + z * cosAy;
        x = x2;
        z = z2;

        // Rotate around Z
        const x3 = x * cosAz - y * sinAz;
        const y3 = x * sinAz + y * cosAz;
        x = x3;
        y = y3;

        buf.lineTo(x, y, 150 + z, cr, cg, cb, 0.6);
      }
    }
  },
};

// ── 6. Grid Warp ─────────────────────────────────────────────────────────────

const gridWarp: Scene = {
  name: "Grid Warp",
  init: nil,
  draw(dc) {
    const { buf, w, h, time, audio } = dc;
    const scale = S(w, h) * 0.4;
    const gridN = 20;
    const step = (scale * 2) / gridN;
    const strength = 40 + audio.bass * 80;
    const [cr, cg, cb] = hsl(180 + time * 10, 80, 45);

    const warp = (gx: number, gy: number): [number, number, number] => {
      const dist = Math.sqrt(gx * gx + gy * gy) + 1;
      const pull = strength / dist;
      const dx = (-gx * pull) / dist;
      const dy = (-gy * pull) / dist;
      return [gx + dx, gy + dy, 100 + pull * 2];
    };

    // Horizontal lines
    for (let row = 0; row <= gridN; row++) {
      const gy = -scale + row * step;
      buf.lineStart();
      for (let col = 0; col <= gridN; col++) {
        const gx = -scale + col * step;
        const [wx, wy, wz] = warp(gx, gy);
        const dist = Math.sqrt(gx * gx + gy * gy);
        const fade = clamp(1 - dist / (scale * 1.5), 0.2, 0.7);
        buf.lineTo(wx, wy, wz, cr, cg, cb, fade);
      }
    }

    // Vertical lines
    for (let col = 0; col <= gridN; col++) {
      const gx = -scale + col * step;
      buf.lineStart();
      for (let row = 0; row <= gridN; row++) {
        const gy = -scale + row * step;
        const [wx, wy, wz] = warp(gx, gy);
        const dist = Math.sqrt(gx * gx + gy * gy);
        const fade = clamp(1 - dist / (scale * 1.5), 0.2, 0.7);
        buf.lineTo(wx, wy, wz, cr, cg, cb, fade);
      }
    }
  },
};

// ── 7. Gravity Lens ──────────────────────────────────────────────────────────

const gravityLens: Scene = {
  name: "Gravity Lens",
  init: nil,
  draw(dc) {
    const { buf, w, h, time, audio } = dc;
    const scale = S(w, h) * 0.4;
    const gridN = 24;
    const step = (scale * 2) / gridN;
    const lensStrength = 3000 + audio.bass * 4000;
    const lx = Math.cos(time * 0.3) * scale * 0.2;
    const ly = Math.sin(time * 0.4) * scale * 0.2;

    const bend = (gx: number, gy: number): [number, number, number] => {
      const dx = gx - lx;
      const dy = gy - ly;
      const dist2 = dx * dx + dy * dy + 100;
      const dist = Math.sqrt(dist2);
      const force = lensStrength / dist2;
      return [
        gx - (dx / dist) * force,
        gy - (dy / dist) * force,
        100 + force * 0.5,
      ];
    };

    const subSteps = gridN * 2;
    // Horizontal grid lines
    for (let row = 0; row <= gridN; row++) {
      const gy = -scale + row * step;
      const hueH = (row / gridN) * 180 + 200 + time * 15;
      const [cr, cg, cb] = hsl(hueH, 75, 45);
      buf.lineStart();
      for (let col = 0; col <= subSteps; col++) {
        const gx = -scale + (col / subSteps) * scale * 2;
        const [bx, by, bz] = bend(gx, gy);
        buf.lineTo(bx, by, bz, cr, cg, cb, 0.5);
      }
    }

    // Vertical grid lines
    for (let col = 0; col <= gridN; col++) {
      const gx = -scale + col * step;
      const hueV = (col / gridN) * 180 + 20 + time * 15;
      const [cr, cg, cb] = hsl(hueV, 75, 45);
      buf.lineStart();
      for (let row = 0; row <= subSteps; row++) {
        const gy = -scale + (row / subSteps) * scale * 2;
        const [bx, by, bz] = bend(gx, gy);
        buf.lineTo(bx, by, bz, cr, cg, cb, 0.5);
      }
    }

    // Lens center glow
    const [pr, pg, pb] = hsl(40, 90, 60);
    buf.point(lx, ly, 50, pr, pg, pb, 0.7 + audio.energy * 0.3, 6);
  },
};

// ── 8. Light Trails ──────────────────────────────────────────────────────────

interface LightSource {
  freqX: number;
  freqY: number;
  phaseX: number;
  phaseY: number;
  hue: number;
  trail: { x: number; y: number }[];
}

interface LightTrailState {
  sources: LightSource[];
}

const lightTrails: Scene = {
  name: "Light Trails",
  init: (): LightTrailState => {
    const sources: LightSource[] = [];
    for (let i = 0; i < 8; i++) {
      sources.push({
        freqX: 1 + hash(i * 5) * 3,
        freqY: 1 + hash(i * 5 + 1) * 3,
        phaseX: hash(i * 5 + 2) * TAU,
        phaseY: hash(i * 5 + 3) * TAU,
        hue: i * 45,
        trail: [],
      });
    }
    return { sources };
  },
  draw(dc, raw) {
    const { buf, w, h, time, audio } = dc;
    const st = raw as LightTrailState;
    const scale = S(w, h) * 0.35;
    const ampMul = 1 + audio.energy * 0.5;
    const speedMul = 1 + audio.mid * 0.4;
    const maxTrail = 60;

    for (const src of st.sources) {
      const x =
        Math.sin(time * src.freqX * speedMul + src.phaseX) *
        scale *
        ampMul *
        0.8;
      const y =
        Math.cos(time * src.freqY * speedMul + src.phaseY) *
        scale *
        ampMul *
        0.8;

      src.trail.push({ x, y });
      if (src.trail.length > maxTrail) src.trail.shift();

      const [cr, cg, cb] = hsl(src.hue + time * 20, 85, 50);

      buf.lineStart();
      for (let i = 0; i < src.trail.length; i++) {
        const t = i / src.trail.length;
        const pt = src.trail[i];
        const z = 200 - t * 180;
        buf.lineTo(pt.x, pt.y, z, cr, cg, cb, t * 0.6);
      }

      // Head glow
      buf.point(x, y, 20, cr, cg, cb, 0.8, 4 + audio.bass * 3);
    }
  },
};

// ── 9. Nebula Cloud ──────────────────────────────────────────────────────────

interface NebParticle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  hue: number;
}

interface NebulaState {
  particles: NebParticle[];
  prevTime: number;
}

const nebulaCloud: Scene = {
  name: "Nebula Cloud",
  init: (): NebulaState => {
    const particles: NebParticle[] = [];
    for (let i = 0; i < 300; i++) {
      const angle = hash(i * 3) * TAU;
      const dist = hash(i * 3 + 1) * 0.8 + 0.1;
      particles.push({
        x: Math.cos(angle) * dist,
        y: Math.sin(angle) * dist * 0.6,
        z: hash(i * 3 + 2) * 300,
        vx: (hash(i * 7) - 0.5) * 0.02,
        vy: (hash(i * 7 + 1) - 0.5) * 0.02,
        hue: hash(i * 11) * 60 + 240,
      });
    }
    return { particles, prevTime: 0 };
  },
  draw(dc, raw) {
    const { buf, w, h, time, audio } = dc;
    const st = raw as NebulaState;
    const dt = st.prevTime > 0 ? clamp(time - st.prevTime, 0, 0.05) : 0.016;
    st.prevTime = time;
    const scale = S(w, h) * 0.42;
    const driftSpeed = 1 + audio.energy * 2;
    const connDist = (40 + audio.mid * 30) / scale;

    for (const p of st.particles) {
      p.x += p.vx * driftSpeed * dt * 10;
      p.y += p.vy * driftSpeed * dt * 10;
      p.x -= p.x * 0.002 * dt * 10;
      p.y -= p.y * 0.002 * dt * 10;
      if (Math.abs(p.x) > 1.2) p.x *= -0.8;
      if (Math.abs(p.y) > 0.8) p.y *= -0.8;
    }

    const ps = st.particles;
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      const px = p.x * scale;
      const py = p.y * scale;
      const [cr, cg, cb] = hsl(p.hue + time * 10, 75, 48);
      buf.point(px, py, p.z, cr, cg, cb, 0.5, 2.5);

      // Connect nearby particles (limited neighbor check for performance)
      for (let j = i + 1; j < Math.min(i + 20, ps.length); j++) {
        const q = ps[j];
        const dx = p.x - q.x;
        const dy = p.y - q.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < connDist * connDist) {
          const alpha = (1 - Math.sqrt(d2) / connDist) * 0.3;
          buf.lineStart();
          buf.lineTo(px, py, p.z, cr, cg, cb, alpha);
          buf.lineTo(q.x * scale, q.y * scale, q.z, cr, cg, cb, alpha);
        }
      }
    }
  },
};

// ── 10. Horizon Scanner ──────────────────────────────────────────────────────

const horizonScanner: Scene = {
  name: "Horizon Scanner",
  init: nil,
  draw(dc) {
    const { buf, w, h, time, audio } = dc;
    const scale = S(w, h) * 0.4;
    const lineCount = 30;
    const sweepSpeed = 1 + audio.energy * 0.8;
    const waveAmp = 20 + audio.bass * 40;
    const span = scale * 2;

    for (let i = 0; i < lineCount; i++) {
      const yOff =
        ((time * sweepSpeed * 40 + i * (span / lineCount)) % span) - scale;
      const zNorm = (yOff + scale) / span;
      const z = 50 + zNorm * 300;
      const depthFade = 1 - z / 400;
      const hueVal = (i / lineCount) * 180 + time * 30 + 160;
      const [cr, cg, cb] = hsl(hueVal, 80, 48);
      const freq = 2 + i * 0.3 + snoise(i * 0.5, time * 0.2) * 2;
      const segs = 40;

      buf.lineStart();
      for (let j = 0; j <= segs; j++) {
        const t = j / segs;
        const x = -scale + t * span;
        const wave =
          Math.sin(t * freq * TAU + time * 2 + i) * waveAmp * depthFade;
        buf.lineTo(x, yOff + wave, z, cr, cg, cb, depthFade * 0.55);
      }
    }
  },
};

// ── Export ────────────────────────────────────────────────────────────────────

export const spatialScenes: Scene[] = [
  starWarp,
  particleTunnel,
  orbitalSystem,
  helixTower,
  gyroscopeRings,
  gridWarp,
  gravityLens,
  lightTrails,
  nebulaCloud,
  horizonScanner,
];
