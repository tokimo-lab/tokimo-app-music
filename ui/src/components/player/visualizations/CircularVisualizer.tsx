import { useEffect, useRef } from "react";

const BAR_COUNT = 64;
const SMOOTH_ALPHA = 0.25;
const MIN_BAR_LEN = 2;
const INWARD_RATIO = 0.3;

export function CircularVisualizer({
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

    if (!smoothRef.current || smoothRef.current.length !== BAR_COUNT) {
      smoothRef.current = new Float32Array(BAR_COUNT);
    }

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

      // Map frequency bins to bars
      const binsPerBar = Math.floor(freqBinCount / BAR_COUNT);
      for (let i = 0; i < BAR_COUNT; i++) {
        let sum = 0;
        const start = i * binsPerBar;
        for (let j = start; j < start + binsPerBar && j < freqBinCount; j++) {
          sum += data[j];
        }
        const target = isPlaying ? sum / binsPerBar : 0;
        const alpha = isPlaying ? SMOOTH_ALPHA : 0.08;
        smooth[i] += (target - smooth[i]) * alpha;
      }

      ctx.clearRect(0, 0, cssW, cssH);

      const cx = cssW / 2;
      const cy = cssH / 2;
      const minDim = Math.min(cssW, cssH);
      const baseRadius = minDim * 0.25;
      const maxBarLen = minDim * 0.22;
      const angleStep = (Math.PI * 2) / BAR_COUNT;
      const barWidth = 2.5;

      // Inner circle outline
      ctx.beginPath();
      ctx.arc(cx, cy, baseRadius, 0, Math.PI * 2);
      ctx.strokeStyle = `${accentColor}25`;
      ctx.lineWidth = 1;
      ctx.stroke();

      for (let i = 0; i < BAR_COUNT; i++) {
        const angle = i * angleStep - Math.PI / 2;
        const norm = Math.max(smooth[i] / 255, 0);
        const outerLen = Math.max(norm * maxBarLen, MIN_BAR_LEN);
        const innerLen = Math.max(
          norm * maxBarLen * INWARD_RATIO,
          MIN_BAR_LEN * 0.5,
        );

        const cosA = Math.cos(angle);
        const sinA = Math.sin(angle);

        // Outward bar
        const ox1 = cx + cosA * baseRadius;
        const oy1 = cy + sinA * baseRadius;
        const ox2 = cx + cosA * (baseRadius + outerLen);
        const oy2 = cy + sinA * (baseRadius + outerLen);

        const opacity = Math.min(0.3 + norm * 0.7, 1);
        const opHex = Math.round(opacity * 255)
          .toString(16)
          .padStart(2, "0");

        ctx.beginPath();
        ctx.moveTo(ox1, oy1);
        ctx.lineTo(ox2, oy2);
        ctx.strokeStyle = `${accentColor}${opHex}`;
        ctx.lineWidth = barWidth;
        ctx.lineCap = "round";
        ctx.stroke();

        // Inward bar (mirrored, shorter, fainter)
        const ix1 = cx + cosA * baseRadius;
        const iy1 = cy + sinA * baseRadius;
        const ix2 = cx + cosA * (baseRadius - innerLen);
        const iy2 = cy + sinA * (baseRadius - innerLen);

        const innerOpHex = Math.round(opacity * 0.5 * 255)
          .toString(16)
          .padStart(2, "0");

        ctx.beginPath();
        ctx.moveTo(ix1, iy1);
        ctx.lineTo(ix2, iy2);
        ctx.strokeStyle = `${accentColor}${innerOpHex}`;
        ctx.lineWidth = barWidth * 0.8;
        ctx.lineCap = "round";
        ctx.stroke();
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
