import { cn } from "@tokimo/ui";
import { type PointerEvent, useEffect, useRef } from "react";

export function formatPlaybackTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0")}`;
}

interface SeekGesture {
  pointerId: number;
  relative: boolean;
  startX: number;
  lastX: number;
  lastAt: number;
  time: number;
  moved: boolean;
}

export function PlaybackSeekBar({
  getCurrentTime,
  getDuration,
  onSeek,
  compact = false,
  playing,
  interactive = true,
}: {
  getCurrentTime: () => number;
  getDuration: () => number;
  onSeek(time: number): void;
  compact?: boolean;
  playing: boolean;
  interactive?: boolean;
}) {
  const barRef = useRef<HTMLDivElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const elapsedRef = useRef<HTMLSpanElement>(null);
  const totalRef = useRef<HTMLSpanElement>(null);
  const gestureRef = useRef<SeekGesture | null>(null);
  const callbacksRef = useRef({ getCurrentTime, getDuration, onSeek });
  callbacksRef.current = { getCurrentTime, getDuration, onSeek };

  const paint = (time: number, duration: number) => {
    const percentage =
      duration > 0 ? Math.max(0, Math.min(100, (time / duration) * 100)) : 0;
    if (fillRef.current) fillRef.current.style.width = `${percentage}%`;
    if (thumbRef.current) thumbRef.current.style.left = `${percentage}%`;
    if (elapsedRef.current)
      elapsedRef.current.textContent = formatPlaybackTime(time);
    if (totalRef.current)
      totalRef.current.textContent = formatPlaybackTime(duration);
    barRef.current?.setAttribute("aria-valuenow", String(Math.round(time)));
    barRef.current?.setAttribute("aria-valuemax", String(duration));
    barRef.current?.setAttribute(
      "aria-valuetext",
      `${formatPlaybackTime(time)} / ${formatPlaybackTime(duration)}`,
    );
  };
  const paintRef = useRef(paint);
  paintRef.current = paint;

  useEffect(() => {
    const tick = () => {
      const { getCurrentTime, getDuration } = callbacksRef.current;
      paintRef.current(
        gestureRef.current?.time ?? getCurrentTime(),
        getDuration(),
      );
    };
    tick();
    // Playback time does not need canvas-frequency work; paused seeks still update.
    const timer = window.setInterval(tick, playing ? 100 : 500);
    return () => window.clearInterval(timer);
  }, [playing]);

  const absoluteTime = (clientX: number) => {
    const rect = barRef.current?.getBoundingClientRect();
    return rect?.width
      ? Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)) *
          getDuration()
      : 0;
  };
  const updateGesture = (event: PointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const duration = getDuration();
    if (gesture.relative) {
      let delta = event.clientX - gesture.lastX;
      const speed =
        Math.abs(delta) / Math.max(1, event.timeStamp - gesture.lastAt);
      gesture.lastX = event.clientX;
      gesture.lastAt = event.timeStamp;
      if (!gesture.moved) {
        if (Math.abs(event.clientX - gesture.startX) < 6) return;
        gesture.moved = true;
        delta = event.clientX - gesture.startX;
      }
      const acceleration = Math.min(1, Math.max(0, (speed - 0.1) / 1.1));
      const width = Math.max(
        1,
        barRef.current?.getBoundingClientRect().width ?? 1,
      );
      const gain =
        0.25 + acceleration ** 2 * Math.max(0, duration / width - 0.25);
      gesture.time = Math.max(
        0,
        Math.min(duration, gesture.time + delta * gain),
      );
    } else {
      gesture.time = absoluteTime(event.clientX);
    }
    paint(gesture.time, duration);
  };
  const cancelGesture = (event: PointerEvent<HTMLDivElement>) => {
    if (gestureRef.current?.pointerId !== event.pointerId) return;
    gestureRef.current = null;
    event.currentTarget.removeAttribute("data-dragging");
    paint(getCurrentTime(), getDuration());
  };

  if (compact && !interactive)
    return (
      <div aria-hidden="true" className="relative h-1 w-full bg-fill-tertiary">
        <div ref={fillRef} className="absolute inset-y-0 left-0 bg-accent" />
      </div>
    );

  return (
    <div className="w-full">
      <div
        ref={barRef}
        role="slider"
        tabIndex={0}
        aria-label="播放进度"
        aria-valuemin={0}
        aria-valuemax={getDuration()}
        aria-valuenow={Math.round(getCurrentTime())}
        className={cn(
          "group/seek flex w-full touch-none cursor-pointer items-center select-none focus-visible:outline-accent",
          compact ? "h-4" : "h-11",
        )}
        onPointerDown={(event) => {
          if (
            gestureRef.current ||
            !event.isPrimary ||
            event.button !== 0 ||
            getDuration() <= 0
          )
            return;
          event.preventDefault();
          event.stopPropagation();
          const relative = event.pointerType !== "mouse";
          gestureRef.current = {
            pointerId: event.pointerId,
            relative,
            startX: event.clientX,
            lastX: event.clientX,
            lastAt: event.timeStamp,
            time: relative ? getCurrentTime() : absoluteTime(event.clientX),
            moved: false,
          };
          event.currentTarget.setPointerCapture(event.pointerId);
          event.currentTarget.setAttribute("data-dragging", "true");
          paint(gestureRef.current.time, getDuration());
        }}
        onPointerMove={updateGesture}
        onPointerUp={(event) => {
          const gesture = gestureRef.current;
          if (!gesture || gesture.pointerId !== event.pointerId) return;
          updateGesture(event);
          const time =
            gesture.relative && !gesture.moved
              ? absoluteTime(event.clientX)
              : gesture.time;
          gestureRef.current = null;
          event.currentTarget.removeAttribute("data-dragging");
          event.currentTarget.releasePointerCapture(event.pointerId);
          onSeek(time);
          paint(time, getDuration());
        }}
        onPointerCancel={cancelGesture}
        onLostPointerCapture={cancelGesture}
        onKeyDown={(event) => {
          const duration = getDuration();
          if (duration <= 0) return;
          let time: number;
          if (event.key === "ArrowRight" || event.key === "ArrowUp")
            time = Math.min(duration, getCurrentTime() + 5);
          else if (event.key === "ArrowLeft" || event.key === "ArrowDown")
            time = Math.max(0, getCurrentTime() - 5);
          else if (event.key === "Home") time = 0;
          else if (event.key === "End") time = duration;
          else return;
          event.preventDefault();
          onSeek(time);
          paint(time, duration);
        }}
      >
        <div
          className={cn(
            "relative w-full rounded-full",
            compact ? "h-1 bg-fill-tertiary" : "h-1.5 bg-white/20",
          )}
        >
          <div
            ref={fillRef}
            className="absolute inset-y-0 left-0 rounded-full bg-accent"
          />
          <div
            ref={thumbRef}
            className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent opacity-0 shadow-sm group-hover/seek:opacity-100 group-focus-visible/seek:opacity-100 group-data-[dragging]/seek:opacity-100"
          />
        </div>
      </div>
      {!compact && (
        <div className="flex justify-between text-xs tabular-nums text-white/60">
          <span ref={elapsedRef}>0:00</span>
          <span ref={totalRef}>0:00</span>
        </div>
      )}
    </div>
  );
}
