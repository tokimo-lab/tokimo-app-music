import { useEffect, useRef } from "react";

const ROW_COUNT = 16;
const POINTS_PER_ROW = 48;
const DECAY = 0.93;

export function TerrainVisualizer({
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
  const historyRef = useRef<Float32Array[]>([]);

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

    if (historyRef.current.length !== ROW_COUNT) {
      historyRef.current = Array.from(
        { length: ROW_COUNT },
        () => new Float32Array(POINTS_PER_ROW),
      );
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
      const history = historyRef.current;

      if (analyser && isPlaying) {
        analyser.getByteFrequencyData(data);
      }

      // Downsample frequency bins to POINTS_PER_ROW
      const newRow = new Float32Array(POINTS_PER_ROW);
      const binsPerPoint = Math.floor(freqBinCount / POINTS_PER_ROW);
      for (let i = 0; i < POINTS_PER_ROW; i++) {
        let sum = 0;
        const start = i * binsPerPoint;
        for (let j = start; j < start + binsPerPoint && j < freqBinCount; j++) {
          sum += data[j];
        }
        newRow[i] = isPlaying ? sum / binsPerPoint : 0;
      }

      // Shift history: move rows forward (index 0 = front/closest)
      for (let r = 0; r < ROW_COUNT - 1; r++) {
        history[r] = history[r + 1];
      }
      history[ROW_COUNT - 1] = newRow;

      // When paused, decay all rows
      if (!isPlaying) {
        for (let r = 0; r < ROW_COUNT; r++) {
          for (let i = 0; i < POINTS_PER_ROW; i++) {
            history[r][i] *= DECAY;
          }
        }
      }

      ctx.clearRect(0, 0, cssW, cssH);

      const topPadding = cssH * 0.08;
      const bottomPadding = cssH * 0.05;
      const drawHeight = cssH - topPadding - bottomPadding;
      const maxAmplitude = drawHeight * 0.18;

      // Draw rows back-to-front (ROW_COUNT-1 = back/top, 0 = front/bottom)
      for (let r = ROW_COUNT - 1; r >= 0; r--) {
        const t = r / (ROW_COUNT - 1); // 0 = back, 1 = front
        const scale = 0.3 + 0.7 * t;
        const rowY = topPadding + drawHeight * (1 - t) * 0.85;

        const centerX = cssW / 2;
        const halfWidth = cssW * 0.45 * scale;

        const opacity = Math.round((0.2 + 0.7 * t) * 255)
          .toString(16)
          .padStart(2, "0");

        const row = history[r];

        // Build bezier path for mountain shapes
        ctx.beginPath();
        const startX = centerX - halfWidth;
        const stepX = (halfWidth * 2) / (POINTS_PER_ROW - 1);

        const getY = (idx: number) => {
          const amp = (row[idx] / 255) * maxAmplitude * scale;
          return rowY - amp;
        };

        ctx.moveTo(startX, rowY);
        ctx.lineTo(startX, getY(0));

        for (let i = 0; i < POINTS_PER_ROW - 1; i++) {
          const x0 = startX + i * stepX;
          const x1 = startX + (i + 1) * stepX;
          const y0 = getY(i);
          const y1 = getY(i + 1);
          const cpx1 = x0 + stepX * 0.4;
          const cpx2 = x1 - stepX * 0.4;
          ctx.bezierCurveTo(cpx1, y0, cpx2, y1, x1, y1);
        }

        const endX = startX + (POINTS_PER_ROW - 1) * stepX;
        ctx.lineTo(endX, rowY);
        ctx.closePath();

        // Fill with semi-transparent accent
        const fillOpacity = Math.round((0.05 + 0.12 * t) * 255)
          .toString(16)
          .padStart(2, "0");
        ctx.fillStyle = `${accentColor}${fillOpacity}`;
        ctx.fill();

        // Stroke the mountain line
        ctx.beginPath();
        ctx.moveTo(startX, getY(0));
        for (let i = 0; i < POINTS_PER_ROW - 1; i++) {
          const x0 = startX + i * stepX;
          const x1 = startX + (i + 1) * stepX;
          const y0 = getY(i);
          const y1 = getY(i + 1);
          const cpx1 = x0 + stepX * 0.4;
          const cpx2 = x1 - stepX * 0.4;
          ctx.bezierCurveTo(cpx1, y0, cpx2, y1, x1, y1);
        }

        ctx.strokeStyle = `${accentColor}${opacity}`;
        ctx.lineWidth = 1.5 * scale;
        ctx.lineJoin = "round";
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
