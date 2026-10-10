import { cn } from "@tokimo/ui";
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
  X,
} from "lucide-react";
import { createPortal } from "react-dom";
import type { PlayerVisualMode } from "../../lib/types";
import { PLAYER_VISUAL_MODES } from "../../lib/types";
import {
  trapPlaybackFocus,
  usePlaybackFocus,
} from "../playback/usePlaybackOverlay";

const MODE_ICONS: Record<PlayerVisualMode, React.FC<{ className?: string }>> = {
  vinyl: Disc3,
  bars: ChartNoAxesColumn,
  waveform: Activity,
  circular: Radar,
  particles: Sparkles,
  particle: Sparkles,
  lyrics: AudioLines,
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
  particle: "粒子场",
  lyrics: "歌词",
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
  const panelRef = usePlaybackFocus(open, container ?? document.body);

  if (!open) return null;

  return createPortal(
    <div className="app-safe-area absolute inset-0 z-[1100] flex items-start justify-end pointer-events-auto [--app-safe-area-padding:1rem]">
      {/* Backdrop */}
      <button
        type="button"
        className="absolute inset-0 cursor-pointer bg-black/30"
        onClick={onClose}
        aria-label="关闭可视化选择"
        tabIndex={-1}
      />

      {/* Panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="选择可视化效果"
        tabIndex={-1}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            onClose();
          } else trapPlaybackFocus(event);
        }}
        className={cn(
          "relative w-full max-w-[400px] max-h-full overflow-y-auto overscroll-contain origin-top-right rounded-2xl bg-surface-overlay text-fg-primary p-4 shadow-2xl backdrop-blur-xl",
          "animate-[picker-in_200ms_ease-out_forwards]",
        )}
      >
        <div className="sticky -top-4 z-10 -mx-4 -mt-4 mb-3 flex items-center justify-between bg-surface-overlay px-4 py-2">
          <h2 className="text-sm font-semibold">可视化效果</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭可视化选择"
            className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-full text-fg-secondary hover:bg-fill-tertiary"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {PLAYER_VISUAL_MODES.map((entry) => {
            const mode = entry.value;
            const Icon = MODE_ICONS[mode];
            const isSelected = mode === currentMode;
            return (
              <button
                key={mode}
                type="button"
                onClick={() => onSelect(mode)}
                aria-pressed={isSelected}
                className={cn(
                  "flex min-h-11 cursor-pointer flex-col items-center gap-1.5 rounded-xl p-3 transition-colors",
                  "backdrop-blur-sm",
                  isSelected
                    ? "bg-accent-subtle ring-2 ring-accent"
                    : "bg-fill-secondary hover:bg-fill-tertiary",
                )}
              >
                <Icon
                  className={cn(
                    "h-6 w-6",
                    isSelected
                      ? "text-[var(--color-accent)]"
                      : "text-fg-secondary",
                  )}
                />
                <span
                  className={cn(
                    "text-xs",
                    isSelected ? "text-fg-primary" : "text-fg-secondary",
                  )}
                >
                  {MODE_LABELS[mode]}
                </span>
              </button>
            );
          })}
        </div>

        {/* Cover background toggle */}
        <div className="mt-3 border-t border-base pt-3">
          <button
            type="button"
            onClick={onToggleCoverBg}
            aria-pressed={coverBgEnabled}
            className={cn(
              "flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-xl p-3 transition-colors",
              coverBgEnabled
                ? "bg-accent-subtle ring-2 ring-accent"
                : "bg-fill-secondary hover:bg-fill-tertiary",
            )}
          >
            <ImageIcon
              className={cn(
                "h-5 w-5",
                coverBgEnabled
                  ? "text-[var(--color-accent)]"
                  : "text-fg-secondary",
              )}
            />
            <div className="flex flex-col items-start">
              <span
                className={cn(
                  "text-xs font-medium",
                  coverBgEnabled ? "text-fg-primary" : "text-fg-secondary",
                )}
              >
                封面氛围背景
              </span>
              <span className="text-[10px] text-fg-muted">
                将专辑封面虚化为毛玻璃背景
              </span>
            </div>
          </button>

          {/* Alchemy ambient background toggle — only shown when alchemy is active */}
          {currentMode === "alchemy" && (
            <button
              type="button"
              onClick={onToggleAlchemyAmbient}
              aria-pressed={alchemyAmbientEnabled}
              className={cn(
                "mt-2 flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-xl p-3 transition-colors",
                alchemyAmbientEnabled
                  ? "bg-accent-subtle ring-2 ring-accent"
                  : "bg-fill-secondary hover:bg-fill-tertiary",
              )}
            >
              <Sparkles
                className={cn(
                  "h-5 w-5",
                  alchemyAmbientEnabled
                    ? "text-[var(--color-accent)]"
                    : "text-fg-secondary",
                )}
              />
              <div className="flex flex-col items-start">
                <span
                  className={cn(
                    "text-xs font-medium",
                    alchemyAmbientEnabled
                      ? "text-fg-primary"
                      : "text-fg-secondary",
                  )}
                >
                  炼金氛围光效
                </span>
                <span className="text-[10px] text-fg-muted">
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
