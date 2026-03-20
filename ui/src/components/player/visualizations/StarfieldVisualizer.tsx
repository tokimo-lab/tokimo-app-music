import { useEffect, useRef } from "react";

const STAR_COUNT = 120;
const MAX_SHOOTING_STARS = 5;
const AURORA_BANDS = 3;
const BASS_SPIKE_MULTIPLIER = 1.5;
const BASS_THRESHOLD = 130;

interface Star {
  x: number;
  y: number;
  baseRadius: number;
  twinklePhase: number;
  twinkleSpeed: number;
}

interface ShootingStar {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  trail: Array<{ x: number; y: number }>;
}

interface AuroraBand {
  yBase: number;
  phase: number;
  speed: number;
  amplitude: number;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace("#", "");
  return {
    r: Number.parseInt(h.substring(0, 2), 16),
    g: Number.parseInt(h.substring(2, 4), 16),
    b: Number.parseInt(h.substring(4, 6), 16),
  };
}

function initStars(w: number, h: number): Star[] {
  const stars: Star[] = [];
  for (let i = 0; i < STAR_COUNT; i++) {
    stars.push({
      x: Math.random() * w,
      y: Math.random() * h,
      baseRadius: 0.5 + Math.random() * 2,
      twinklePhase: Math.random() * Math.PI * 2,
      twinkleSpeed: 0.5 + Math.random() * 1.5,
    });
  }
  return stars;
}

function initAuroraBands(h: number): AuroraBand[] {
  const bands: AuroraBand[] = [];
  for (let i = 0; i < AURORA_BANDS; i++) {
    bands.push({
      yBase: h * (0.1 + i * 0.12),
      phase: Math.random() * Math.PI * 2,
      speed: 0.003 + Math.random() * 0.005,
      amplitude: 15 + Math.random() * 20,
    });
  }
  return bands;
}

export function StarfieldVisualizer({
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
  const starsRef = useRef<Star[]>([]);
  const shootingRef = useRef<ShootingStar[]>([]);
  const auroraRef = useRef<AuroraBand[]>([]);
  const prevBassRef = useRef(0);
  const smoothEnergyRef = useRef(0);
  const auroraOpacityRef = useRef(0);

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

      if (starsRef.current.length === 0) {
        starsRef.current = initStars(cssW, cssH);
      }
      if (auroraRef.current.length === 0) {
        auroraRef.current = initAuroraBands(cssH);
      }
    };
    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);

    let time = 0;

    const draw = () => {
      const analyser = getAnalyser();
      let energy = 0;
      let bassEnergy = 0;
      let midEnergy = 0;

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
        let midTotal = 0;
        const bassEnd = Math.floor(len / 4);
        const midEnd = Math.floor(len / 2);

        for (let i = 0; i < len; i++) {
          total += dataRef.current[i];
          if (i < bassEnd) bassTotal += dataRef.current[i];
          else if (i < midEnd) midTotal += dataRef.current[i];
        }
        energy = total / (len * 255);
        bassEnergy = bassTotal / (bassEnd * 255);
        midEnergy = midTotal / ((midEnd - bassEnd) * 255);
      }

      const targetEnergy = isPlaying ? energy : 0;
      smoothEnergyRef.current +=
        (targetEnergy - smoothEnergyRef.current) * 0.08;

      const targetAurora = isPlaying ? 0.12 + energy * 0.1 : 0;
      auroraOpacityRef.current +=
        (targetAurora - auroraOpacityRef.current) * 0.04;

      time += 1;
      const rgb = hexToRgb(accentColor);

      ctx.clearRect(0, 0, cssW, cssH);

      // Aurora
      const auroras = auroraRef.current;
      for (let b = 0; b < auroras.length; b++) {
        const band = auroras[b];
        band.phase += band.speed;
        const waveAmp =
          band.amplitude * (1 + bassEnergy * 2) * (isPlaying ? 1 : 0.3);

        ctx.beginPath();
        ctx.moveTo(0, band.yBase + Math.sin(band.phase) * waveAmp);
        const segments = 6;
        for (let s = 1; s <= segments; s++) {
          const sx = (cssW / segments) * s;
          const prevX = (cssW / segments) * (s - 1);
          const cpx = (prevX + sx) / 2;
          const sy =
            band.yBase +
            Math.sin(band.phase + s * 0.8) * waveAmp +
            Math.cos(time * 0.01 + s) * 10;
          ctx.quadraticCurveTo(cpx, sy - 15, sx, sy);
        }
        ctx.lineTo(cssW, band.yBase + 50);
        ctx.lineTo(0, band.yBase + 50);
        ctx.closePath();

        const grad = ctx.createLinearGradient(
          0,
          band.yBase - waveAmp,
          0,
          band.yBase + 50,
        );
        const aOp = auroraOpacityRef.current * (1 - b * 0.2);
        grad.addColorStop(0, `rgba(${rgb.r},${rgb.g},${rgb.b},${aOp * 0.6})`);
        grad.addColorStop(0.5, `rgba(${rgb.r},${rgb.g},${rgb.b},${aOp})`);
        grad.addColorStop(1, `rgba(${rgb.r},${rgb.g},${rgb.b},0)`);
        ctx.fillStyle = grad;
        ctx.fill();
      }

      // Stars
      const stars = starsRef.current;
      const twinkleBoost = 1 + midEnergy * 1.5;
      for (let i = 0; i < stars.length; i++) {
        const s = stars[i];
        const twinkle =
          0.4 +
          0.6 *
            ((Math.sin(time * 0.02 * s.twinkleSpeed + s.twinklePhase) + 1) /
              2) *
            twinkleBoost;
        const opacity = Math.min(1, twinkle * (isPlaying ? 1 : 0.5));
        const radius = s.baseRadius * (0.8 + smoothEnergyRef.current * 0.5);

        // Glow
        ctx.beginPath();
        ctx.arc(s.x, s.y, radius * 2.5, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${rgb.r},${rgb.g},${rgb.b},${opacity * 0.1})`;
        ctx.fill();

        // Core
        ctx.beginPath();
        ctx.arc(s.x, s.y, radius, 0, Math.PI * 2);
        const coreR = Math.min(255, rgb.r + 100);
        const coreG = Math.min(255, rgb.g + 100);
        const coreB = Math.min(255, rgb.b + 100);
        ctx.fillStyle = `rgba(${coreR},${coreG},${coreB},${opacity})`;
        ctx.fill();
      }

      // Shooting star spawn
      const shooting = shootingRef.current;
      if (isPlaying && analyser) {
        const currentBass = bassEnergy * 255;
        const prevBass = prevBassRef.current;
        if (
          currentBass > prevBass * BASS_SPIKE_MULTIPLIER &&
          currentBass > BASS_THRESHOLD &&
          shooting.length < MAX_SHOOTING_STARS
        ) {
          const edge = Math.floor(Math.random() * 4);
          let sx: number;
          let sy: number;
          let svx: number;
          let svy: number;
          const speed = 3 + Math.random() * 4;
          switch (edge) {
            case 0: // top
              sx = Math.random() * cssW;
              sy = 0;
              svx = (Math.random() - 0.5) * speed;
              svy = speed;
              break;
            case 1: // right
              sx = cssW;
              sy = Math.random() * cssH * 0.5;
              svx = -speed;
              svy = (Math.random() * 0.5 + 0.3) * speed;
              break;
            case 2: // left
              sx = 0;
              sy = Math.random() * cssH * 0.5;
              svx = speed;
              svy = (Math.random() * 0.5 + 0.3) * speed;
              break;
            default: // top-right corner
              sx = cssW * (0.5 + Math.random() * 0.5);
              sy = 0;
              svx = -speed * 0.7;
              svy = speed * 0.7;
              break;
          }
          shooting.push({
            x: sx,
            y: sy,
            vx: svx,
            vy: svy,
            life: 1,
            trail: [{ x: sx, y: sy }],
          });
        }
        prevBassRef.current = currentBass;
      }

      // Update & draw shooting stars
      for (let i = shooting.length - 1; i >= 0; i--) {
        const ss = shooting[i];
        ss.x += ss.vx;
        ss.y += ss.vy;
        ss.life -= 0.015;
        ss.trail.push({ x: ss.x, y: ss.y });
        if (ss.trail.length > 20) ss.trail.shift();

        if (ss.life <= 0) {
          shooting.splice(i, 1);
          continue;
        }

        // Draw trail
        if (ss.trail.length > 1) {
          for (let t = 1; t < ss.trail.length; t++) {
            const frac = t / ss.trail.length;
            const alpha = frac * ss.life;
            ctx.beginPath();
            ctx.moveTo(ss.trail[t - 1].x, ss.trail[t - 1].y);
            ctx.lineTo(ss.trail[t].x, ss.trail[t].y);
            ctx.strokeStyle = `rgba(${rgb.r},${rgb.g},${rgb.b},${alpha})`;
            ctx.lineWidth = 1.5 * frac;
            ctx.stroke();
          }
          // Bright head
          ctx.beginPath();
          ctx.arc(ss.x, ss.y, 2, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(255,255,255,${ss.life})`;
          ctx.fill();
        }
      }

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
