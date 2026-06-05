import { cn } from "@tokimo/ui";
import { ListMusic, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useRef } from "react";
import { useMusicPlayer } from "../shell/hooks";

function formatDuration(seconds: number | null | undefined): string {
  if (!seconds || !Number.isFinite(seconds)) return "--:--";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

interface NowPlayingPanelProps {
  open: boolean;
  onClose(): void;
}

export function NowPlayingPanel({ open, onClose }: NowPlayingPanelProps) {
  const { queue, currentIndex, skipToIndex, removeFromQueue, clearQueue } =
    useMusicPlayer();
  const panelRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLDivElement>(null);
  const queueItemKeyMapRef = useRef(new WeakMap<object, string>());
  const queueItemKeyCounterRef = useRef(0);

  // Preserve unique keys even when the same track appears multiple times.
  const getQueueItemKey = useCallback((track: object) => {
    const keyMap = queueItemKeyMapRef.current;
    const existingKey = keyMap.get(track);
    if (existingKey) {
      return existingKey;
    }

    const nextKey = `queue-${queueItemKeyCounterRef.current++}`;
    keyMap.set(track, nextKey);
    return nextKey;
  }, []);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    // Delay to avoid catching the opening click
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handler);
    }, 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handler);
    };
  }, [open, onClose]);

  // Scroll to active track when panel opens
  useEffect(() => {
    if (open && activeRef.current) {
      activeRef.current.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="absolute inset-0 z-10 flex justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30" />

      {/* Panel */}
      <div
        ref={panelRef}
        className={cn(
          "relative z-10 flex h-full w-full max-w-md flex-col",
          "bg-[var(--color-surface-overlay)] shadow-2xl backdrop-blur-xl",
          "animate-in slide-in-from-right duration-200",
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border-base px-4 py-3 select-none">
          <div className="flex items-center gap-2">
            <ListMusic className="h-5 w-5 text-[var(--color-fg-muted)]" />
            <span className="text-sm font-semibold text-[var(--color-fg-primary)]">
              播放队列
            </span>
            <span className="text-xs text-[var(--color-fg-muted)]">
              ({queue.length} 首)
            </span>
          </div>
          <div className="flex items-center gap-1">
            {queue.length > 0 && (
              <button
                type="button"
                onClick={clearQueue}
                className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-[var(--color-fg-muted)] hover:bg-[var(--color-fill-tertiary)] hover:text-red-500"
              >
                <Trash2 className="h-3.5 w-3.5" />
                清空
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--color-fg-muted)] hover:bg-[var(--color-fill-tertiary)]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Track list */}
        <div className="flex-1 overflow-y-auto">
          {queue.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-[var(--color-fg-muted)]">
              <ListMusic className="mb-2 h-10 w-10" />
              <p className="text-sm">队列为空</p>
            </div>
          ) : (
            <div className="py-1">
              {queue.map((track, index) => {
                const isCurrent = index === currentIndex;
                return (
                  <div
                    key={getQueueItemKey(track)}
                    ref={isCurrent ? activeRef : undefined}
                    className={cn(
                      "group flex items-center gap-3 px-4 py-2 transition-colors",
                      isCurrent
                        ? "bg-[var(--color-accent)]/8"
                        : "hover:bg-[var(--color-fill-tertiary)]",
                    )}
                  >
                    {/* Track number / playing indicator */}
                    <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center">
                      {isCurrent ? (
                        <div className="flex items-end gap-[2px]">
                          <span className="inline-block h-3 w-[3px] animate-bounce rounded-sm bg-[var(--color-accent)] [animation-delay:0ms]" />
                          <span className="inline-block h-4 w-[3px] animate-bounce rounded-sm bg-[var(--color-accent)] [animation-delay:150ms]" />
                          <span className="inline-block h-2 w-[3px] animate-bounce rounded-sm bg-[var(--color-accent)] [animation-delay:300ms]" />
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => skipToIndex(index)}
                          className="text-xs text-[var(--color-fg-muted)]"
                        >
                          {index + 1}
                        </button>
                      )}
                    </div>

                    {/* Track info */}
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-left"
                      onClick={() => skipToIndex(index)}
                    >
                      <p
                        className={cn(
                          "truncate text-sm",
                          isCurrent
                            ? "font-semibold text-[var(--color-accent)]"
                            : "text-[var(--color-fg-primary)]",
                        )}
                      >
                        {track.title}
                      </p>
                      <p className="truncate text-xs text-[var(--color-fg-muted)]">
                        {track.artistName ?? "未知艺术家"}
                      </p>
                    </button>

                    {/* Duration */}
                    <span className="flex-shrink-0 text-xs tabular-nums text-[var(--color-fg-muted)]">
                      {formatDuration(track.duration)}
                    </span>

                    {/* Remove button */}
                    <button
                      type="button"
                      onClick={() => removeFromQueue(index)}
                      className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded opacity-0 transition-opacity hover:bg-[var(--color-fill-tertiary)] group-hover:opacity-100"
                    >
                      <X className="h-3.5 w-3.5 text-[var(--color-fg-muted)]" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
