import { useEffect, useRef } from "react";

const SMOOTHING = 0.15;

export function WaveformVisualizer({
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

    const draw = () => {
      const analyser = getAnalyser();
      const bufLen = analyser ? analyser.fftSize : 256;

      if (!dataRef.current || dataRef.current.length !== bufLen) {
        dataRef.current = new Uint8Array(bufLen) as Uint8Array<ArrayBuffer>;
        smoothRef.current = new Float32Array(bufLen).fill(128);
      }

      const data = dataRef.current;
      const smooth = smoothRef.current!;

      if (analyser && isPlaying) {
        analyser.getByteTimeDomainData(data);
      }

      const alpha = isPlaying ? SMOOTHING : 0.06;
      for (let i = 0; i < bufLen; i++) {
        const target = isPlaying ? data[i] : 128;
        smooth[i] += (target - smooth[i]) * alpha;
      }

      ctx.clearRect(0, 0, cssW, cssH);

      const centerY = cssH / 2;

      // Subtle center reference line
      ctx.beginPath();
      ctx.moveTo(0, centerY);
      ctx.lineTo(cssW, centerY);
      ctx.strokeStyle = `${accentColor}18`;
      ctx.lineWidth = 1;
      ctx.stroke();

      const step = cssW / (bufLen - 1);

      // Build the smooth path using quadratic curves
      const buildPath = () => {
        ctx.beginPath();
        const firstVal = ((smooth[0] - 128) / 128) * centerY;
        ctx.moveTo(0, centerY + firstVal);
        for (let i = 1; i < bufLen; i++) {
          const prev = ((smooth[i - 1] - 128) / 128) * centerY;
          const curr = ((smooth[i] - 128) / 128) * centerY;
          const prevX = (i - 1) * step;
          const currX = i * step;
          const midX = (prevX + currX) / 2;
          const midY = centerY + (prev + curr) / 2;
          ctx.quadraticCurveTo(prevX, centerY + prev, midX, midY);
        }
        const lastVal = ((smooth[bufLen - 1] - 128) / 128) * centerY;
        ctx.lineTo(cssW, centerY + lastVal);
      };

      // Glow layer
      ctx.save();
      ctx.shadowColor = accentColor;
      ctx.shadowBlur = 12;
      buildPath();
      ctx.strokeStyle = `${accentColor}40`;
      ctx.lineWidth = 6;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.stroke();
      ctx.restore();

      // Main line
      buildPath();
      ctx.strokeStyle = accentColor;
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.stroke();

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
