import { useEffect, useRef } from "react";

const SEGMENTS = 8;
const SMOOTH_ALPHA = 0.2;
const BAND_COUNT = 12;
const BASE_SPIN = 0.005;
const MAX_EXTRA_SPIN = 0.02;

export function KaleidoscopeVisualizer({
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
  const smoothRef = useRef<Float32Array | null>(null);
  const rotationRef = useRef(0);

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

    if (!smoothRef.current || smoothRef.current.length !== BAND_COUNT) {
      smoothRef.current = new Float32Array(BAND_COUNT);
    }

    const hexToRgb = (hex: string) => {
      const h = hex.replace("#", "");
      return {
        r: Number.parseInt(h.substring(0, 2), 16),
        g: Number.parseInt(h.substring(2, 4), 16),
        b: Number.parseInt(h.substring(4, 6), 16),
      };
    };

    const draw = () => {
      const analyser = getAnalyser();
      const freqBinCount = analyser ? analyser.frequencyBinCount : 128;

      if (!dataRef.current || dataRef.current.length !== freqBinCount) {
        dataRef.current = new Uint8Array(
          freqBinCount,
        ) as Uint8Array<ArrayBuffer>;
      }

      const data = dataRef.current;
      const smooth = smoothRef.current!;

      if (analyser && isPlaying) {
        analyser.getByteFrequencyData(data);
      }

      // Compute banded frequency values
      const binsPerBand = Math.floor(freqBinCount / BAND_COUNT);
      let totalEnergy = 0;
      for (let i = 0; i < BAND_COUNT; i++) {
        let sum = 0;
        const start = i * binsPerBand;
        for (let j = start; j < start + binsPerBand && j < freqBinCount; j++) {
          sum += data[j];
        }
        const raw = sum / binsPerBand / 255;
        const target = isPlaying ? raw : 0;
        const alpha = isPlaying ? SMOOTH_ALPHA : 0.05;
        smooth[i] += (target - smooth[i]) * alpha;
        totalEnergy += smooth[i];
      }
      totalEnergy /= BAND_COUNT;

      // When paused, shrink
      if (!isPlaying) {
        for (let i = 0; i < BAND_COUNT; i++) {
          smooth[i] *= 0.95;
        }
      }

      // Rotation
      const spinSpeed = isPlaying
        ? BASE_SPIN + totalEnergy * MAX_EXTRA_SPIN
        : BASE_SPIN * 0.2;
      rotationRef.current += spinSpeed;

      ctx.clearRect(0, 0, cssW, cssH);

      const cx = cssW / 2;
      const cy = cssH / 2;
      const radius = Math.min(cssW, cssH) * 0.45;
      const { r, g, b } = hexToRgb(accentColor);

      // Frequency bands: bass (0-3), mid (4-7), high (8-11)
      const bassAvg = (smooth[0] + smooth[1] + smooth[2] + smooth[3]) / 4;
      const midAvg = (smooth[4] + smooth[5] + smooth[6] + smooth[7]) / 4;
      const highAvg = (smooth[8] + smooth[9] + smooth[10] + smooth[11]) / 4;

      const segAngle = (Math.PI * 2) / SEGMENTS;
      const baseRot = rotationRef.current;

      ctx.save();
      ctx.translate(cx, cy);

      for (let seg = 0; seg < SEGMENTS; seg++) {
        const angle = seg * segAngle + baseRot;

        // Draw original and mirrored
        for (let mirror = 0; mirror < 2; mirror++) {
          ctx.save();
          ctx.rotate(angle);
          if (mirror === 1) {
            ctx.scale(-1, 1);
          }

          // Inner ring: bass-driven dots
          const innerRadius = radius * 0.18;
          const innerSize = 2 + bassAvg * 8;
          const innerAlpha = 0.3 + bassAvg * 0.7;
          for (let d = 0; d < 3; d++) {
            const dotAngle = (d / 3) * segAngle * 0.8 + segAngle * 0.1;
            const dr = innerRadius + bassAvg * radius * 0.08;
            const dx = Math.cos(dotAngle) * dr;
            const dy = Math.sin(dotAngle) * dr;

            const grad = ctx.createRadialGradient(dx, dy, 0, dx, dy, innerSize);
            grad.addColorStop(0, `rgba(${r},${g},${b},${innerAlpha})`);
            grad.addColorStop(1, `rgba(${r},${g},${b},0)`);

            ctx.beginPath();
            ctx.arc(dx, dy, innerSize, 0, Math.PI * 2);
            ctx.fillStyle = grad;
            ctx.fill();
          }

          // Middle ring: mid-frequency elongated shapes
          const midRadius = radius * 0.4;
          const midLen = 8 + midAvg * 25;
          const midWidth = 2 + midAvg * 5;
          const midAlpha = 0.2 + midAvg * 0.6;
          for (let p = 0; p < 3; p++) {
            const petalAngle = (p / 3) * segAngle * 0.7 + segAngle * 0.15;
            const pr = midRadius + midAvg * radius * 0.05;
            const px = Math.cos(petalAngle) * pr;
            const py = Math.sin(petalAngle) * pr;

            ctx.save();
            ctx.translate(px, py);
            ctx.rotate(petalAngle + baseRot * 0.5);

            const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, midLen);
            grad.addColorStop(0, `rgba(${r},${g},${b},${midAlpha})`);
            grad.addColorStop(1, `rgba(${r},${g},${b},0)`);

            ctx.beginPath();
            ctx.ellipse(0, 0, midLen, midWidth, 0, 0, Math.PI * 2);
            ctx.fillStyle = grad;
            ctx.fill();

            ctx.restore();
          }

          // Outer ring: high-frequency thin lines/petals
          const outerRadius = radius * 0.7;
          const outerLen = 5 + highAvg * 30;
          const outerAlpha = 0.15 + highAvg * 0.6;
          for (let l = 0; l < 4; l++) {
            const lineAngle = (l / 4) * segAngle * 0.8 + segAngle * 0.1;
            const lr = outerRadius + highAvg * radius * 0.1;
            const lx = Math.cos(lineAngle) * lr;
            const ly = Math.sin(lineAngle) * lr;
            const ex = Math.cos(lineAngle) * (lr + outerLen);
            const ey = Math.sin(lineAngle) * (lr + outerLen);

            ctx.beginPath();
            ctx.moveTo(lx, ly);
            ctx.lineTo(ex, ey);
            ctx.strokeStyle = `rgba(${r},${g},${b},${outerAlpha})`;
            ctx.lineWidth = 1 + highAvg * 2;
            ctx.lineCap = "round";
            ctx.stroke();

            // Glow dot at tip
            const tipGrad = ctx.createRadialGradient(
              ex,
              ey,
              0,
              ex,
              ey,
              3 + highAvg * 4,
            );
            tipGrad.addColorStop(0, `rgba(${r},${g},${b},${outerAlpha * 0.8})`);
            tipGrad.addColorStop(1, `rgba(${r},${g},${b},0)`);
            ctx.beginPath();
            ctx.arc(ex, ey, 3 + highAvg * 4, 0, Math.PI * 2);
            ctx.fillStyle = tipGrad;
            ctx.fill();
          }

          ctx.restore();
        }
      }

      // Central glow
      const centerGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, radius * 0.15);
      centerGrad.addColorStop(
        0,
        `rgba(${r},${g},${b},${0.15 + totalEnergy * 0.4})`,
      );
      centerGrad.addColorStop(1, `rgba(${r},${g},${b},0)`);
      ctx.beginPath();
      ctx.arc(0, 0, radius * 0.15, 0, Math.PI * 2);
      ctx.fillStyle = centerGrad;
      ctx.fill();

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
