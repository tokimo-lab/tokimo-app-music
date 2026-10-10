import { cn } from "@tokimo/ui";
import { ListMusic, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useMusicPlayer } from "../shell/hooks";
import {
  trapPlaybackFocus,
  usePlaybackFocus,
  usePlaybackOverlay,
} from "./playback/usePlaybackOverlay";

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
  const { anchorRef, container, viewport } = usePlaybackOverlay(open);
  const panelRef = usePlaybackFocus(open, container);
  const listRef = useRef<HTMLDivElement>(null);
  const [narrow, setNarrow] = useState(true);
  useEffect(() => {
    if (!open || !container) return;
    const update = () => setNarrow(container.clientWidth < 640);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(container);
    return () => observer.disconnect();
  }, [open, container]);
  const activeRef = useRef<HTMLDivElement>(null);
  const queueItemKeyMapRef = useRef(new WeakMap<object, string>());
  const queueItemKeyCounterRef = useRef(0);

  // Object identity plus position distinguishes repeated queue entries.
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

  useEffect(() => {
    if (!open || !container || !activeRef.current || !listRef.current) return;
    listRef.current.scrollTop = Math.max(
      0,
      activeRef.current.offsetTop - listRef.current.clientHeight / 2,
    );
  }, [open, container]);

  const occurrences = new Map<object, number>();

  return (
    <>
      <span ref={anchorRef} className="hidden" />
      {open &&
        container &&
        createPortal(
          <div
            className={cn(
              "inset-0 z-[1200] flex justify-end pointer-events-auto",
              viewport ? "fixed standalone-app-safe-area" : "absolute",
              narrow && "items-end",
            )}
          >
            {/* Backdrop */}
            <button
              type="button"
              aria-label="关闭播放队列"
              tabIndex={-1}
              className="absolute inset-0 cursor-pointer bg-black/40"
              onClick={onClose}
            />

            {/* Panel */}
            <div
              ref={panelRef}
              role="dialog"
              aria-modal="true"
              aria-label="播放队列"
              tabIndex={-1}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  event.stopPropagation();
                  onClose();
                } else trapPlaybackFocus(event);
              }}
              className={cn(
                "app-safe-area-bottom relative z-10 flex w-full flex-col text-fg-primary",
                narrow ? "h-[85%] max-h-full rounded-t-2xl" : "h-full max-w-md",
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
                  <span className="text-xs text-fg-muted">
                    ({queue.length} 首)
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  {queue.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        clearQueue();
                        onClose();
                      }}
                      className="flex min-h-11 cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-xs text-[var(--color-fg-muted)] hover:bg-[var(--color-fill-tertiary)] hover:text-red-500"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      清空
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={onClose}
                    aria-label="关闭播放队列"
                    className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-md text-[var(--color-fg-muted)] hover:bg-[var(--color-fill-tertiary)]"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Track list */}
              <div
                ref={listRef}
                className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain"
              >
                {queue.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-[var(--color-fg-muted)]">
                    <ListMusic className="mb-2 h-10 w-10" />
                    <p className="text-sm">队列为空</p>
                  </div>
                ) : (
                  <div className="py-1">
                    {queue.map((track, index) => {
                      const isCurrent = index === currentIndex;
                      const occurrence = occurrences.get(track) ?? 0;
                      occurrences.set(track, occurrence + 1);
                      return (
                        <div
                          key={`${getQueueItemKey(track)}-${occurrence}`}
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
                                className="min-h-11 cursor-pointer text-xs text-fg-muted"
                              >
                                {index + 1}
                              </button>
                            )}
                          </div>

                          {/* Track info */}
                          <button
                            type="button"
                            aria-label={`播放 ${track.title}`}
                            aria-current={isCurrent ? "true" : undefined}
                            className="min-h-11 min-w-0 flex-1 cursor-pointer text-left"
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
                            aria-label={`从队列移除 ${track.title}`}
                            className="flex h-11 w-11 flex-shrink-0 cursor-pointer items-center justify-center rounded hover:bg-fill-tertiary"
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
          </div>,
          container,
        )}
    </>
  );
}
