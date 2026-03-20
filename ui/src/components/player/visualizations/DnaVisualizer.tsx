import { useEffect, useRef } from "react";

const NODE_PAIRS = 20;
const HELIX_TURNS = 2;
const BASE_NODE_SIZE = 7;
const BASE_ROTATION_SPEED = 0.01;
const SMOOTH_ALPHA = 0.2;

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    Number.parseInt(h.slice(0, 2), 16),
    Number.parseInt(h.slice(2, 4), 16),
    Number.parseInt(h.slice(4, 6), 16),
  ];
}

export function DnaVisualizer({
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
  const rotationRef = useRef(0);
  const speedRef = useRef(BASE_ROTATION_SPEED);
  const smoothedRef = useRef(new Float32Array(NODE_PAIRS));

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
      const smoothed = smoothedRef.current;

      let totalEnergy = 0;

      if (analyser && isPlaying) {
        const bufLen = analyser.frequencyBinCount;
        if (!dataRef.current || dataRef.current.length !== bufLen) {
          dataRef.current = new Uint8Array(bufLen) as Uint8Array<ArrayBuffer>;
        }
        analyser.getByteFrequencyData(dataRef.current);

        const binsPer = Math.floor(bufLen / NODE_PAIRS);
        for (let i = 0; i < NODE_PAIRS; i++) {
          let sum = 0;
          const start = i * binsPer;
          const end = Math.min(start + binsPer, bufLen);
          for (let j = start; j < end; j++) {
            sum += dataRef.current[j];
          }
          const raw = sum / (end - start) / 255;
          smoothed[i] += (raw - smoothed[i]) * SMOOTH_ALPHA;
          totalEnergy += smoothed[i];
        }
        totalEnergy /= NODE_PAIRS;
      } else {
        for (let i = 0; i < NODE_PAIRS; i++) {
          smoothed[i] *= 0.93;
          totalEnergy += smoothed[i];
        }
        totalEnergy /= NODE_PAIRS;
      }

      // Update rotation speed
      const targetSpeed = isPlaying
        ? BASE_ROTATION_SPEED + totalEnergy * 0.03
        : speedRef.current * 0.95;
      speedRef.current += (targetSpeed - speedRef.current) * 0.1;
      rotationRef.current += speedRef.current;

      ctx.clearRect(0, 0, cssW, cssH);

      const centerX = cssW / 2;
      const radius = cssW * 0.25;
      const rotation = rotationRef.current;
      const twoPiTurns = HELIX_TURNS * 2 * Math.PI;
      const [r, g, bl] = hexToRgb(accentColor);
      // Lighter strand color
      const r2 = Math.min(255, r + 80);
      const g2 = Math.min(255, g + 80);
      const bl2 = Math.min(255, bl + 80);

      // Build node data for depth sorting
      interface NodeData {
        x: number;
        y: number;
        z: number;
        size: number;
        amplitude: number;
        strand: number;
        pairIndex: number;
      }

      const nodes: NodeData[] = [];
      const pairs: {
        x1: number;
        y1: number;
        x2: number;
        y2: number;
        avgZ: number;
        amp: number;
      }[] = [];

      for (let i = 0; i < NODE_PAIRS; i++) {
        const t = i / (NODE_PAIRS - 1);
        const y = t * cssH;
        const angle = t * twoPiTurns + rotation;

        const x1 = centerX + radius * Math.cos(angle);
        const z1 = Math.sin(angle);
        const x2 = centerX + radius * Math.cos(angle + Math.PI);
        const z2 = Math.sin(angle + Math.PI);

        const amp = smoothed[i];
        const sizeBase = BASE_NODE_SIZE * (1 + amp * 0.8);

        nodes.push({
          x: x1,
          y,
          z: z1,
          size: sizeBase * (0.5 + 0.5 * ((z1 + 1) / 2)),
          amplitude: amp,
          strand: 1,
          pairIndex: i,
        });
        nodes.push({
          x: x2,
          y,
          z: z2,
          size: sizeBase * (0.5 + 0.5 * ((z2 + 1) / 2)),
          amplitude: amp,
          strand: 2,
          pairIndex: i,
        });

        pairs.push({
          x1,
          y1: y,
          x2,
          y2: y,
          avgZ: (z1 + z2) / 2,
          amp,
        });
      }

      // Sort: back nodes first (low z), front nodes on top (high z)
      nodes.sort((a, b) => a.z - b.z);
      // Sort rungs by depth too
      pairs.sort((a, b) => a.avgZ - b.avgZ);

      // Draw rungs (base pairs)
      for (const pair of pairs) {
        const depthFactor = (pair.avgZ + 1) / 2;
        const rungOpacity = 0.15 + depthFactor * 0.35 + pair.amp * 0.15;
        ctx.beginPath();
        ctx.moveTo(pair.x1, pair.y1);
        ctx.lineTo(pair.x2, pair.y2);
        ctx.strokeStyle = `rgba(${r},${g},${bl},${Math.min(rungOpacity, 0.6)})`;
        ctx.lineWidth = 1 + depthFactor * 1;
        ctx.stroke();
      }

      // Draw nodes
      for (const node of nodes) {
        const depthFactor = (node.z + 1) / 2;
        const opacity = 0.3 + depthFactor * 0.7;
        const glowSize = node.size * (1.8 + node.amplitude * 1.5);

        const isStrand1 = node.strand === 1;
        const nr = isStrand1 ? r : r2;
        const ng = isStrand1 ? g : g2;
        const nbl = isStrand1 ? bl : bl2;

        // Glow
        if (node.amplitude > 0.05) {
          const glowGrad = ctx.createRadialGradient(
            node.x,
            node.y,
            0,
            node.x,
            node.y,
            glowSize,
          );
          const glowAlpha = opacity * node.amplitude * 0.4;
          glowGrad.addColorStop(
            0,
            `rgba(${nr},${ng},${nbl},${Math.min(glowAlpha, 0.5)})`,
          );
          glowGrad.addColorStop(1, `rgba(${nr},${ng},${nbl},0)`);
          ctx.beginPath();
          ctx.arc(node.x, node.y, glowSize, 0, Math.PI * 2);
          ctx.fillStyle = glowGrad;
          ctx.fill();
        }

        // Node
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${nr},${ng},${nbl},${opacity})`;
        ctx.fill();
      }

      // Draw strand lines connecting consecutive nodes on each strand
      for (const strand of [1, 2]) {
        const strandNodes = nodes
          .filter((n) => n.strand === strand)
          .sort((a, b) => a.pairIndex - b.pairIndex);

        if (strandNodes.length < 2) continue;

        const isStrand1 = strand === 1;
        const sr = isStrand1 ? r : r2;
        const sg = isStrand1 ? g : g2;
        const sbl = isStrand1 ? bl : bl2;

        ctx.beginPath();
        ctx.moveTo(strandNodes[0].x, strandNodes[0].y);
        for (let i = 1; i < strandNodes.length; i++) {
          const prev = strandNodes[i - 1];
          const curr = strandNodes[i];
          const cpX = (prev.x + curr.x) / 2;
          const cpY = (prev.y + curr.y) / 2;
          ctx.quadraticCurveTo(prev.x, prev.y, cpX, cpY);
        }
        const last = strandNodes[strandNodes.length - 1];
        ctx.lineTo(last.x, last.y);
        ctx.strokeStyle = `rgba(${sr},${sg},${sbl},0.35)`;
        ctx.lineWidth = 1.5;
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
