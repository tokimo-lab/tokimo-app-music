import { useEffect, useRef } from "react";

const MAX_PARTICLES = 150;
const MIN_SPAWN = 3;
const MAX_SPAWN = 8;

interface FlameParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  life: number;
  maxLife: number;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace("#", "");
  return {
    r: Number.parseInt(h.substring(0, 2), 16),
    g: Number.parseInt(h.substring(2, 4), 16),
    b: Number.parseInt(h.substring(4, 6), 16),
  };
}

function lerpColor(
  a: { r: number; g: number; b: number },
  b: { r: number; g: number; b: number },
  t: number,
): { r: number; g: number; b: number } {
  return {
    r: Math.round(a.r + (b.r - a.r) * t),
    g: Math.round(a.g + (b.g - a.g) * t),
    b: Math.round(a.b + (b.b - a.b) * t),
  };
}

const WHITE = { r: 255, g: 255, b: 255 };
const ORANGE = { r: 255, g: 140, b: 0 };
const RED = { r: 200, g: 30, b: 0 };
const DARK = { r: 40, g: 0, b: 0 };

function getFlameColor(
  life: number,
  accent: { r: number; g: number; b: number },
): { r: number; g: number; b: number; a: number } {
  if (life < 0.2) {
    const t = life / 0.2;
    const c = lerpColor(WHITE, accent, t);
    return { ...c, a: 1 };
  }
  if (life < 0.5) {
    const t = (life - 0.2) / 0.3;
    const c = lerpColor(accent, ORANGE, t);
    return { ...c, a: 1 };
  }
  if (life < 0.8) {
    const t = (life - 0.5) / 0.3;
    const c = lerpColor(ORANGE, RED, t);
    return { ...c, a: 1 - t * 0.3 };
  }
  const t = (life - 0.8) / 0.2;
  const c = lerpColor(RED, DARK, t);
  return { ...c, a: (1 - t) * 0.7 };
}

export function FlameVisualizer({
  getAnalyser,
  isPlaying,
  accentColor,
}: {
  getAnalyser: () => AnalyserNode | null;
  isPlaying: boolean;
  accentColor: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef(0);
  const dataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const particlesRef = useRef<FlameParticle[]>([]);
  const smoothEnergyRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let cssW = 0;
    let cssH = 0;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      cssW = rect.width;
      cssH = rect.height;
      canvas.width = cssW * dpr;
      canvas.height = cssH * dpr;
      ctx.scale(dpr, dpr);
    };
    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);

    const particles = particlesRef.current;
    const accentRgb = hexToRgb(accentColor);

    const draw = () => {
      const analyser = getAnalyser();
      let energy = 0;
      let bassEnergy = 0;
      const binEnergies: number[] = [];

      if (analyser) {
        if (
          !dataRef.current ||
          dataRef.current.length !== analyser.frequencyBinCount
        ) {
          dataRef.current = new Uint8Array(analyser.frequencyBinCount);
        }
        analyser.getByteFrequencyData(dataRef.current);
        const len = dataRef.current.length;

        let total = 0;
        let bassTotal = 0;
        const bassEnd = Math.floor(len / 4);

        for (let i = 0; i < len; i++) {
          total += dataRef.current[i];
          if (i < bassEnd) bassTotal += dataRef.current[i];
        }
        energy = total / (len * 255);
        bassEnergy = bassTotal / (bassEnd * 255);

        // Build 16 bin zones for horizontal mapping
        const zones = 16;
        const binSize = Math.floor(len / zones);
        for (let z = 0; z < zones; z++) {
          let sum = 0;
          for (let i = z * binSize; i < (z + 1) * binSize && i < len; i++) {
            sum += dataRef.current[i];
          }
          binEnergies.push(sum / (binSize * 255));
        }
      }

      const targetEnergy = isPlaying ? energy : 0;
      smoothEnergyRef.current += (targetEnergy - smoothEnergyRef.current) * 0.1;
      const sEnergy = smoothEnergyRef.current;

      // Spawn particles
      if (isPlaying && cssW > 0) {
        const spawnCount = Math.floor(
          MIN_SPAWN + (MAX_SPAWN - MIN_SPAWN) * sEnergy,
        );

        // Frequency-mapped spawning
        if (binEnergies.length > 0) {
          for (
            let s = 0;
            s < spawnCount && particles.length < MAX_PARTICLES;
            s++
          ) {
            const zone = Math.floor(Math.random() * binEnergies.length);
            const zoneEnergy = binEnergies[zone];
            if (zoneEnergy < 0.05) continue;

            const zoneWidth = cssW / binEnergies.length;
            const zoneCenter = zone * zoneWidth + zoneWidth / 2;
            const spread = zoneWidth * 0.4 * (1 + bassEnergy);

            particles.push({
              x: zoneCenter + (Math.random() - 0.5) * spread,
              y: cssH + Math.random() * 5,
              vx: (Math.random() - 0.5) * 1,
              vy: -(1.5 + zoneEnergy * 2.5 + sEnergy * 1),
              size: 3 + zoneEnergy * 5 + bassEnergy * 3,
              life: 0,
              maxLife: 40 + Math.random() * 40,
            });
          }
        } else {
          for (
            let s = 0;
            s < spawnCount && particles.length < MAX_PARTICLES;
            s++
          ) {
            const centerBias = cssW / 2 + (Math.random() - 0.5) * cssW * 0.6;
            particles.push({
              x: centerBias,
              y: cssH + Math.random() * 5,
              vx: (Math.random() - 0.5) * 1,
              vy: -(1.5 + sEnergy * 2.5),
              size: 3 + sEnergy * 5,
              life: 0,
              maxLife: 40 + Math.random() * 40,
            });
          }
        }
      }

      ctx.clearRect(0, 0, cssW, cssH);

      // Heat haze base glow
      if (sEnergy > 0.01) {
        const grad = ctx.createLinearGradient(0, cssH - 20, 0, cssH);
        grad.addColorStop(
          0,
          `rgba(${accentRgb.r},${accentRgb.g},${accentRgb.b},0)`,
        );
        grad.addColorStop(
          1,
          `rgba(${accentRgb.r},${accentRgb.g},${accentRgb.b},${0.15 * Math.min(1, sEnergy * 3)})`,
        );
        ctx.fillStyle = grad;
        ctx.fillRect(0, cssH - 20, cssW, 20);
      }

      // Draw particles with additive blending
      ctx.globalCompositeOperation = "lighter";

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vx *= 0.99;
        p.vy *= 0.998;
        p.life += 1;

        const lifeFrac = p.life / p.maxLife;
        if (lifeFrac >= 1) {
          particles.splice(i, 1);
          continue;
        }

        const color = getFlameColor(lifeFrac, accentRgb);
        const radius = p.size * (1 - lifeFrac * 0.5);

        if (radius < 0.5) {
          particles.splice(i, 1);
          continue;
        }

        // Radial gradient particle
        const grad = ctx.createRadialGradient(
          p.x,
          p.y - radius * 0.3,
          0,
          p.x,
          p.y,
          radius,
        );
        grad.addColorStop(
          0,
          `rgba(${color.r},${color.g},${color.b},${color.a})`,
        );
        grad.addColorStop(
          0.4,
          `rgba(${color.r},${color.g},${color.b},${color.a * 0.6})`,
        );
        grad.addColorStop(1, `rgba(${color.r},${color.g},${color.b},0)`);

        // Slight vertical oval for motion blur effect
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.scale(1, 1.3);
        ctx.beginPath();
        ctx.arc(0, 0, radius, 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.restore();
      }

      ctx.globalCompositeOperation = "source-over";

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(rafRef.current);
      resizeObserver.disconnect();
    };
  }, [getAnalyser, isPlaying, accentColor]);

  return (
    <canvas
      ref={canvasRef}
      className="h-72 w-72 xl:h-80 xl:w-80"
      style={{ imageRendering: "auto" }}
    />
  );
}
