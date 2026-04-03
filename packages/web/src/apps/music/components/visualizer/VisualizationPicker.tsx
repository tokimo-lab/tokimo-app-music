import { cn } from "@tokiomo/components";
import {
  Activity,
  AudioLines,
  Binary,
  ChartNoAxesColumn,
  Disc3,
  Dna,
  Droplets,
  Flame,
  Flower2,
  Hexagon,
  Image,
  ImageIcon,
  Mountain,
  Orbit,
  Radar,
  Sparkles,
  Star,
  Wand2,
  Waves,
} from "lucide-react";
import { useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import type { PlayerVisualMode } from "@/lib/types";
import { PLAYER_VISUAL_MODES } from "@/lib/types";

const MODE_ICONS: Record<PlayerVisualMode, React.FC<{ className?: string }>> = {
  vinyl: Disc3,
  bars: ChartNoAxesColumn,
  waveform: Activity,
  circular: Radar,
  particles: Sparkles,
  wave: AudioLines,
  spectrogram: Waves,
  terrain: Mountain,
  matrix: Binary,
  kaleidoscope: Flower2,
  starfield: Star,
  ripple: Droplets,
  flame: Flame,
  dna: Dna,
  mosaic: Hexagon,
  tunnel: Orbit,
  alchemy: Wand2,
  cover: Image,
};

const MODE_LABELS: Record<PlayerVisualMode, string> = {
  vinyl: "黑胶唱片",
  bars: "频谱柱状",
  waveform: "示波器",
  circular: "环形频谱",
  particles: "粒子",
  wave: "流动波形",
  spectrogram: "频谱图",
  terrain: "山脉地形",
  matrix: "矩阵雨",
  kaleidoscope: "万花筒",
  starfield: "星空",
  ripple: "水波纹",
  flame: "火焰",
  dna: "DNA螺旋",
  mosaic: "蜂巢",
  tunnel: "空间隧道",
  alchemy: "炼金术",
  cover: "封面",
};

interface VisualizationPickerProps {
  currentMode: PlayerVisualMode;
  onSelect: (mode: PlayerVisualMode) => void;
  coverBgEnabled: boolean;
  onToggleCoverBg: () => void;
  alchemyAmbientEnabled: boolean;
  onToggleAlchemyAmbient: () => void;
  open: boolean;
  onClose: () => void;
  container?: HTMLElement | null;
}

export function VisualizationPicker({
  currentMode,
  onSelect,
  coverBgEnabled,
  onToggleCoverBg,
  alchemyAmbientEnabled,
  onToggleAlchemyAmbient,
  open,
  onClose,
  container,
}: VisualizationPickerProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose],
  );

  useEffect(() => {
    if (!open) return;
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, handleKeyDown]);

  if (!open) return null;

  return createPortal(
    <div className="absolute inset-0 z-[1100] pointer-events-auto">
      {/* Backdrop */}
      <button
        type="button"
        className="absolute inset-0 bg-black/30"
        onClick={onClose}
        aria-label="关闭可视化选择"
        tabIndex={-1}
      />

      {/* Panel */}
      <div
        className={cn(
          "absolute right-4 top-4 w-[320px] origin-top-right rounded-2xl bg-black/80 p-4 shadow-2xl backdrop-blur-xl sm:w-[400px]",
          "animate-[picker-in_200ms_ease-out_forwards]",
        )}
      >
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {PLAYER_VISUAL_MODES.map((mode) => {
            const Icon = MODE_ICONS[mode];
            const isSelected = mode === currentMode;
            return (
              <button
                key={mode}
                type="button"
                onClick={() => onSelect(mode)}
                className={cn(
                  "flex flex-col items-center gap-1.5 rounded-xl p-3 transition-colors",
                  "backdrop-blur-sm",
                  isSelected
                    ? "bg-white/20 ring-2 ring-[var(--accent)]"
                    : "bg-white/10 hover:bg-white/15",
                )}
              >
                <Icon
                  className={cn(
                    "h-6 w-6",
                    isSelected ? "text-[var(--accent)]" : "text-white/60",
                  )}
                />
                <span
                  className={cn(
                    "text-xs",
                    isSelected ? "text-white" : "text-white/70",
                  )}
                >
                  {MODE_LABELS[mode]}
                </span>
              </button>
            );
          })}
        </div>

        {/* Cover background toggle */}
        <div className="mt-3 border-t border-white/10 pt-3">
          <button
            type="button"
            onClick={onToggleCoverBg}
            className={cn(
              "flex w-full items-center gap-3 rounded-xl p-3 transition-colors",
              coverBgEnabled
                ? "bg-white/20 ring-2 ring-[var(--accent)]"
                : "bg-white/10 hover:bg-white/15",
            )}
          >
            <ImageIcon
              className={cn(
                "h-5 w-5",
                coverBgEnabled ? "text-[var(--accent)]" : "text-white/60",
              )}
            />
            <div className="flex flex-col items-start">
              <span
                className={cn(
                  "text-xs font-medium",
                  coverBgEnabled ? "text-white" : "text-white/70",
                )}
              >
                封面氛围背景
              </span>
              <span className="text-[10px] text-white/40">
                将专辑封面虚化为毛玻璃背景
              </span>
            </div>
          </button>

          {/* Alchemy ambient background toggle — only shown when alchemy is active */}
          {currentMode === "alchemy" && (
            <button
              type="button"
              onClick={onToggleAlchemyAmbient}
              className={cn(
                "mt-2 flex w-full items-center gap-3 rounded-xl p-3 transition-colors",
                alchemyAmbientEnabled
                  ? "bg-white/20 ring-2 ring-[var(--accent)]"
                  : "bg-white/10 hover:bg-white/15",
              )}
            >
              <Sparkles
                className={cn(
                  "h-5 w-5",
                  alchemyAmbientEnabled
                    ? "text-[var(--accent)]"
                    : "text-white/60",
                )}
              />
              <div className="flex flex-col items-start">
                <span
                  className={cn(
                    "text-xs font-medium",
                    alchemyAmbientEnabled ? "text-white" : "text-white/70",
                  )}
                >
                  炼金氛围光效
                </span>
                <span className="text-[10px] text-white/40">
                  在特效背景添加呼吸感氛围光球
                </span>
              </div>
            </button>
          )}
        </div>
      </div>

      <style>
        {`@keyframes picker-in {
          from { opacity: 0; transform: scale(0.95) translateY(-4px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }`}
      </style>
    </div>,
    container ?? document.body,
  );
}
