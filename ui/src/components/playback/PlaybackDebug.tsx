import { type RefObject, useEffect, useRef, useState } from "react";
import type { PlayerVisualMode } from "../../lib/types";
import type { AlchemySceneInfo } from "../visualizer/visualizations";
export function PlaybackDebug({
  active,
  visualMode,
  alchemyInfoRef,
}: {
  active: boolean;
  visualMode: PlayerVisualMode;
  alchemyInfoRef: RefObject<AlchemySceneInfo | null>;
}) {
  // ── Debug FPS overlay (press D 5× quickly to toggle) ────────────────────
  const [debugVisible, setDebugVisible] = useState(false);
  const debugTapsRef = useRef<number[]>([]);
  const debugRafRef = useRef(0);
  const debugStatsRef = useRef({
    fps: 0,
    frameTime: 0,
    minFrame: 999,
    maxFrame: 0,
    spikes: 0,
    renders: 0,
    lastRenderCount: 0,
    rps: 0,
  });
  const debugDisplayRef = useRef<HTMLPreElement>(null);
  const renderCountRef = useRef(0);
  renderCountRef.current++;

  useEffect(() => {
    if (!active) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "d" && e.key !== "D") return;
      const now = Date.now();
      const taps = debugTapsRef.current;
      taps.push(now);
      // Keep only taps within last 2 seconds
      while (taps.length > 0 && now - taps[0] > 2000) taps.shift();
      if (taps.length >= 5) {
        taps.length = 0;
        setDebugVisible((v) => !v);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [active]);

  useEffect(() => {
    if (!debugVisible || !active) return;

    const stats = debugStatsRef.current;
    let lastTime = performance.now();
    let frameCount = 0;
    let frameTimeSum = 0;
    let lastSecond = performance.now();
    stats.minFrame = 999;
    stats.maxFrame = 0;
    stats.spikes = 0;

    const tick = () => {
      const now = performance.now();
      const dt = now - lastTime;
      lastTime = now;
      frameCount++;
      frameTimeSum += dt;

      if (dt < stats.minFrame) stats.minFrame = dt;
      if (dt > stats.maxFrame) stats.maxFrame = dt;
      if (dt > 50) stats.spikes++;

      if (now - lastSecond >= 1000) {
        stats.fps = frameCount;
        stats.frameTime = frameTimeSum / frameCount;
        stats.rps = renderCountRef.current - stats.lastRenderCount;
        stats.lastRenderCount = renderCountRef.current;
        frameCount = 0;
        frameTimeSum = 0;
        lastSecond = now;

        if (debugDisplayRef.current) {
          let text =
            `FPS: ${stats.fps}\n` +
            `Frame: ${stats.frameTime.toFixed(1)}ms` +
            ` (min ${stats.minFrame.toFixed(1)}` +
            ` / max ${stats.maxFrame.toFixed(1)})\n` +
            `Spikes (>50ms): ${stats.spikes}\n` +
            `React renders/s: ${stats.rps}\n` +
            `Total renders: ${renderCountRef.current}\n` +
            `Mode: ${visualMode}`;
          const ai = alchemyInfoRef.current;
          if (visualMode === "alchemy" && ai) {
            text +=
              `\nScene: ${ai.scene}` +
              ` (${Math.round((ai.sceneTimer / 900) * 100)}%)`;
            if (ai.nextScene) {
              text +=
                `\n→ ${ai.nextScene}` +
                ` (fade ${Math.round(ai.fadePct * 100)}%)`;
            }
          }
          debugDisplayRef.current.textContent = text;
        }
        stats.minFrame = 999;
        stats.maxFrame = 0;
        stats.spikes = 0;
      }

      debugRafRef.current = requestAnimationFrame(tick);
    };
    debugRafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(debugRafRef.current);
  }, [debugVisible, visualMode, active, alchemyInfoRef]);

  return debugVisible ? (
    <pre
      ref={debugDisplayRef}
      className="pointer-events-none absolute left-4 top-16 z-50 rounded-lg bg-black/80 px-3 py-2 font-mono text-xs leading-relaxed text-green-400"
    >
      Measuring...
    </pre>
  ) : null;
}
