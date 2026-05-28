import { useEffect, useRef } from "react";

const HEX_RADIUS = 20;
const SMOOTH_ALPHA = 0.25;
const SCALE_MAX = 1.15;

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    Number.parseInt(h.slice(0, 2), 16),
    Number.parseInt(h.slice(2, 4), 16),
    Number.parseInt(h.slice(4, 6), 16),
  ];
}

interface HexCell {
  cx: number;
  cy: number;
  col: number;
  row: number;
  freqIndex: number;
  distFromCenter: number;
}

function buildHexGrid(w: number, h: number, freqBins: number): HexCell[] {
  const cells: HexCell[] = [];
  const hexW = HEX_RADIUS * 2;
  const hexH = Math.sqrt(3) * HEX_RADIUS;
  const cols = Math.ceil(w / (hexW * 0.75)) + 1;
  const rows = Math.ceil(h / hexH) + 1;
  const gridCenterCol = (cols - 1) / 2;
  const gridCenterRow = (rows - 1) / 2;
  const maxDist = Math.sqrt(
    gridCenterCol * gridCenterCol + gridCenterRow * gridCenterRow,
  );

  for (let col = 0; col < cols; col++) {
    for (let row = 0; row < rows; row++) {
      const cx = col * hexW * 0.75;
      const cy = row * hexH + (col % 2 === 1 ? hexH / 2 : 0);

      const dc = col - gridCenterCol;
      const dr = row - gridCenterRow;
      const dist = maxDist > 0 ? Math.sqrt(dc * dc + dr * dr) / maxDist : 0;

      // Map left-to-right to low-to-high freq, with center bias
      const colRatio = cols > 1 ? col / (cols - 1) : 0;
      const freqIdx = Math.min(
        freqBins - 1,
        Math.floor(colRatio * freqBins * 0.8 + dist * freqBins * 0.2),
      );

      cells.push({
        cx,
        cy,
        col,
        row,
        freqIndex: freqIdx,
        distFromCenter: dist,
      });
    }
  }

  return cells;
}

function drawHexPath(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
) {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 6;
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

export function MosaicVisualizer({
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
  const gridRef = useRef<HexCell[]>([]);
  const smoothedRef = useRef<Float32Array | null>(null);

  // Store props in refs so the RAF loop always reads current values
  const getAnalyserRef = useRef(getAnalyser);
  const isPlayingRef = useRef(isPlaying);
  const accentColorRef = useRef(accentColor);
  getAnalyserRef.current = getAnalyser;
  isPlayingRef.current = isPlaying;
  accentColorRef.current = accentColor;

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

      const analyser = getAnalyserRef.current();
      const bins = analyser ? analyser.frequencyBinCount : 128;
      gridRef.current = buildHexGrid(cssW, cssH, bins);
    };
    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);

    const draw = () => {
      const analyser = getAnalyserRef.current();
      const freqBinCount = analyser ? analyser.frequencyBinCount : 128;

      if (!dataRef.current || dataRef.current.length !== freqBinCount) {
        dataRef.current = new Uint8Array(
          freqBinCount,
        ) as Uint8Array<ArrayBuffer>;
      }
      if (!smoothedRef.current || smoothedRef.current.length !== freqBinCount) {
        smoothedRef.current = new Float32Array(freqBinCount);
      }

      const data = dataRef.current;
      const smoothed = smoothedRef.current;

      if (analyser && isPlayingRef.current) {
        analyser.getByteFrequencyData(data);
        for (let i = 0; i < freqBinCount; i++) {
          const raw = data[i] / 255;
          smoothed[i] += (raw - smoothed[i]) * SMOOTH_ALPHA;
        }
      } else {
        for (let i = 0; i < freqBinCount; i++) {
          smoothed[i] *= 0.93;
        }
      }

      // Rebuild grid if needed (first frame)
      if (gridRef.current.length === 0 && cssW > 0) {
        gridRef.current = buildHexGrid(cssW, cssH, freqBinCount);
      }

      ctx.clearRect(0, 0, cssW, cssH);

      const [r, g, bl] = hexToRgb(accentColorRef.current);
      const grid = gridRef.current;

      for (const cell of grid) {
        const amp = smoothed[Math.min(cell.freqIndex, freqBinCount - 1)];

        // Brightness based on distance from center (inner brighter)
        const brightnessMod = 1 - cell.distFromCenter * 0.3;

        // Scale: hex grows slightly at high amplitude
        const scale = 1 + ((SCALE_MAX - 1) * Math.max(0, amp - 0.3)) / 0.7;
        const drawRadius = HEX_RADIUS * scale * 0.92;

        ctx.save();

        // Glow for high-amplitude hexagons
        if (amp > 0.5) {
          const glowRadius = drawRadius * 1.3;
          drawHexPath(ctx, cell.cx, cell.cy, glowRadius);
          const glowAlpha = (amp - 0.5) * 0.3 * brightnessMod;
          ctx.fillStyle = `rgba(${r},${g},${bl},${Math.min(glowAlpha, 0.25)})`;
          ctx.fill();
        }

        // Hex fill
        drawHexPath(ctx, cell.cx, cell.cy, drawRadius);

        if (amp > 0.15) {
          // Filled hex
          let fillAlpha: number;
          if (amp < 0.4) {
            fillAlpha = amp * 0.75;
          } else if (amp < 0.7) {
            fillAlpha = 0.3 + (amp - 0.4) * 0.67;
          } else {
            fillAlpha = 0.5 + (amp - 0.7) * 1.0;
          }
          fillAlpha *= brightnessMod;
          ctx.fillStyle = `rgba(${r},${g},${bl},${Math.min(fillAlpha, 0.85)})`;
          ctx.fill();
        }

        // Border (always visible for grid structure)
        drawHexPath(ctx, cell.cx, cell.cy, HEX_RADIUS * 0.92);
        ctx.strokeStyle = `rgba(${r},${g},${bl},${0.12 + amp * 0.1})`;
        ctx.lineWidth = 0.8;
        ctx.stroke();

        ctx.restore();
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(rafRef.current);
      resizeObserver.disconnect();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="h-72 w-72 xl:h-80 xl:w-80"
      style={{ imageRendering: "auto" }}
    />
  );
}
