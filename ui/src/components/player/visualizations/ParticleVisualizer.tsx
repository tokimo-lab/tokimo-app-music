import { useEffect, useRef } from "react";

const MAX_PARTICLES = 80;
const CONNECT_DIST = 60;
const SPAWN_RATE = 3;
const BASE_SPEED = 0.3;
const BASS_THRESHOLD = 160;

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  opacity: number;
  life: number;
  maxLife: number;
}

function createParticle(
  cx: number,
  cy: number,
  energy: number,
  bassEnergy: number,
): Particle {
  const angle = Math.random() * Math.PI * 2;
  const speed = (BASE_SPEED + energy * 1.5) * (0.5 + Math.random());
  const spread = 20 + Math.random() * 30;
  const isBassHit = bassEnergy > BASS_THRESHOLD;
  const sizeMultiplier = isBassHit ? 1.5 : 1;

  return {
    x: cx + Math.cos(angle) * spread,
    y: cy + Math.sin(angle) * spread,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    size: (2 + energy * 4 + Math.random() * 2) * sizeMultiplier,
    opacity: 0.3 + energy * 0.6,
    life: 0,
    maxLife: 60 + Math.random() * 80,
  };
}

export function ParticleVisualizer({
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
  const particlesRef = useRef<Particle[]>([]);

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

    const draw = () => {
      const analyser = getAnalyser();
      const freqBinCount = analyser ? analyser.frequencyBinCount : 128;

      if (!dataRef.current || dataRef.current.length !== freqBinCount) {
        dataRef.current = new Uint8Array(freqBinCount) as Uint8Array<ArrayBuffer>;
      }

      const data = dataRef.current;

      if (analyser && isPlaying) {
        analyser.getByteFrequencyData(data);
      } else if (!isPlaying) {
        // Decay data when paused
        for (let i = 0; i < data.length; i++) {
          data[i] = Math.max(0, data[i] - 3);
        }
      }

      // Compute bass and overall energy (normalized 0-1)
      const bassEnd = Math.floor(freqBinCount / 4);
      let bassSum = 0;
      let totalSum = 0;
      for (let i = 0; i < freqBinCount; i++) {
        totalSum += data[i];
        if (i < bassEnd) bassSum += data[i];
      }
      const bassEnergy = bassEnd > 0 ? bassSum / bassEnd : 0;
      const overallEnergy =
        freqBinCount > 0 ? totalSum / freqBinCount / 255 : 0;

      const cx = cssW / 2;
      const cy = cssH / 2;

      // Spawn particles when playing
      if (isPlaying) {
        const spawnCount =
          bassEnergy > BASS_THRESHOLD
            ? SPAWN_RATE + 3
            : Math.ceil(SPAWN_RATE * overallEnergy);

        for (let s = 0; s < spawnCount; s++) {
          if (particles.length < MAX_PARTICLES) {
            particles.push(createParticle(cx, cy, overallEnergy, bassEnergy));
          }
        }
      }

      ctx.clearRect(0, 0, cssW, cssH);

      // Additive blending for glow
      ctx.save();
      ctx.globalCompositeOperation = "lighter";

      // Update and draw particles
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        const speedMult = isPlaying ? 1 + overallEnergy * 2 : 0.5;
        p.x += p.vx * speedMult;
        p.y += p.vy * speedMult;
        p.life++;

        // Fade over lifetime
        const lifeRatio = p.life / p.maxLife;
        const fadeIn = Math.min(p.life / 10, 1);
        const fadeOut = 1 - lifeRatio;
        const alpha = p.opacity * fadeIn * fadeOut;

        if (!isPlaying) {
          p.opacity *= 0.98;
        }

        // Remove dead particles
        if (p.life >= p.maxLife || alpha < 0.01) {
          particles.splice(i, 1);
          continue;
        }

        // Draw particle with radial gradient
        const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size);
        const alphaHex = Math.round(Math.min(alpha, 1) * 255)
          .toString(16)
          .padStart(2, "0");
        grad.addColorStop(0, `${accentColor}${alphaHex}`);
        grad.addColorStop(1, `${accentColor}00`);

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.fill();
      }

      // Draw connecting lines between nearby particles
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const a = particles[i];
          const b = particles[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < CONNECT_DIST) {
            const lineAlpha = (1 - dist / CONNECT_DIST) * 0.15;
            const lineHex = Math.round(lineAlpha * 255)
              .toString(16)
              .padStart(2, "0");
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.strokeStyle = `${accentColor}${lineHex}`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
      }

      ctx.restore();

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
