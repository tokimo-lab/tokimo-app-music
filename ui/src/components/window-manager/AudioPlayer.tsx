/**
 * AudioPlayer — compact audio player for floating window preview.
 *
 * Custom UI with play/pause, seek bar, time display, and volume.
 * No native <audio> controls — fully styled to match the theme.
 */

import { Music, Pause, Play, Volume1, Volume2, VolumeX } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMediaSessionOptional, useMediaSessionRegister } from "@/system";

interface AudioPlayerProps {
  src: string;
  fileName: string;
  /** Unique ID for media session registration (e.g. window ID). */
  id?: string;
}

function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function AudioPlayer({ src, fileName, id }: AudioPlayerProps) {
  const mediaSession = useMediaSessionOptional();
  const audioRef = useRef<HTMLAudioElement>(null);
  const seekRef = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [seeking, setSeeking] = useState(false);
  const [volumeDragging, setVolumeDragging] = useState(false);
  const volumeRef = useRef<HTMLDivElement>(null);

  // Sync state from audio element
  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;

    const onTimeUpdate = () => {
      if (!seeking) setCurrentTime(el.currentTime);
    };
    const onLoaded = () => setDuration(el.duration);
    const onEnded = () => setPlaying(false);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);

    el.addEventListener("timeupdate", onTimeUpdate);
    el.addEventListener("loadedmetadata", onLoaded);
    el.addEventListener("durationchange", onLoaded);
    el.addEventListener("ended", onEnded);
    el.addEventListener("play", onPlay);
    el.addEventListener("pause", onPause);

    return () => {
      el.removeEventListener("timeupdate", onTimeUpdate);
      el.removeEventListener("loadedmetadata", onLoaded);
      el.removeEventListener("durationchange", onLoaded);
      el.removeEventListener("ended", onEnded);
      el.removeEventListener("play", onPlay);
      el.removeEventListener("pause", onPause);
    };
  }, [seeking]);

  const sourceId = id ?? `audio-${src}`;

  const togglePlay = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) {
      mediaSession?.requestPlay(sourceId);
      el.play();
    } else {
      el.pause();
      mediaSession?.notifyPause(sourceId);
    }
  }, [mediaSession, sourceId]);

  const toggleMute = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    el.muted = !el.muted;
    setMuted(el.muted);
  }, []);

  // Volume via click/drag
  const setVolumeTo = useCallback((clientX: number) => {
    const bar = volumeRef.current;
    const el = audioRef.current;
    if (!bar || !el) return;
    const rect = bar.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    el.volume = ratio;
    setVolume(ratio);
    if (ratio > 0 && el.muted) {
      el.muted = false;
      setMuted(false);
    }
  }, []);

  const handleVolPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      setVolumeDragging(true);
      setVolumeTo(e.clientX);
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [setVolumeTo],
  );

  const handleVolPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!volumeDragging) return;
      setVolumeTo(e.clientX);
    },
    [volumeDragging, setVolumeTo],
  );

  const handleVolPointerUp = useCallback(() => {
    setVolumeDragging(false);
  }, []);

  // Seek via click/drag on progress bar
  const seekTo = useCallback(
    (clientX: number) => {
      const bar = seekRef.current;
      const el = audioRef.current;
      if (!bar || !el || !duration) return;
      const rect = bar.getBoundingClientRect();
      const ratio = Math.max(
        0,
        Math.min(1, (clientX - rect.left) / rect.width),
      );
      el.currentTime = ratio * duration;
      setCurrentTime(el.currentTime);
    },
    [duration],
  );

  const handleSeekPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      setSeeking(true);
      seekTo(e.clientX);
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [seekTo],
  );

  const handleSeekPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!seeking) return;
      seekTo(e.clientX);
    },
    [seeking, seekTo],
  );

  const handleSeekPointerUp = useCallback(() => {
    setSeeking(false);
  }, []);

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  // Strip extension for cleaner display
  const displayName = fileName.replace(/\.[^.]+$/, "");

  // ── MediaSession registration ──────────────────────────────────────────────
  const currentTimeRef = useRef(currentTime);
  currentTimeRef.current = currentTime;
  const durationRefMs = useRef(duration);
  durationRefMs.current = duration;
  const getCurrentTime = useCallback(() => currentTimeRef.current, []);
  const getDuration = useCallback(() => durationRefMs.current, []);

  const audioMediaSource = useMemo(
    () => ({
      id: sourceId,
      type: "audio" as const,
      title: displayName,
      isPlaying: playing,
      getCurrentTime,
      getDuration,
      volume,
      play: () => audioRef.current?.play(),
      pause: () => audioRef.current?.pause(),
      seek: (t: number) => {
        if (audioRef.current) audioRef.current.currentTime = t;
      },
      setVolume: (v: number) => {
        if (audioRef.current) audioRef.current.volume = v;
        setVolume(v);
      },
      queue: [
        {
          id: sourceId,
          title: displayName,
          duration: duration > 0 ? duration : undefined,
        },
      ],
      currentIndex: 0,
    }),
    [
      sourceId,
      displayName,
      playing,
      getCurrentTime,
      getDuration,
      volume,
      duration,
    ],
  );

  useMediaSessionRegister(audioMediaSource);

  return (
    <div className="flex h-full flex-col bg-surface-base">
      {/* biome-ignore lint/a11y/useMediaCaption: audio file preview */}
      <audio ref={audioRef} src={src} preload="metadata" />

      {/* Center artwork / icon area */}
      <div className="flex flex-1 items-center justify-center min-h-0">
        <div className="flex size-16 items-center justify-center rounded-2xl bg-accent-subtle">
          <Music className="size-8 text-accent" />
        </div>
      </div>

      {/* Bottom controls — compact */}
      <div className="shrink-0 px-3 pb-2.5 space-y-1.5">
        {/* File name */}
        <p className="truncate text-xs font-medium text-fg-primary text-center">
          {displayName}
        </p>

        {/* Progress bar */}
        <div
          ref={seekRef}
          className="group relative h-3 flex items-center cursor-pointer"
          onPointerDown={handleSeekPointerDown}
          onPointerMove={handleSeekPointerMove}
          onPointerUp={handleSeekPointerUp}
        >
          {/* Track */}
          <div className="w-full h-1 rounded-full bg-black/[0.06] dark:bg-white/[0.08] group-hover:h-1.5 transition-all">
            {/* Filled */}
            <div
              className="h-full rounded-full bg-accent transition-[width]"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Time + controls row */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] tabular-nums text-fg-muted w-8 text-right">
            {formatTime(currentTime)}
          </span>

          {/* Play / Pause */}
          <div className="flex flex-1 justify-center">
            <button
              type="button"
              className="flex size-8 items-center justify-center rounded-full bg-accent text-white hover:bg-accent-hover transition-colors cursor-pointer"
              onClick={togglePlay}
            >
              {playing ? (
                <Pause size={14} />
              ) : (
                <Play size={14} className="ml-0.5" />
              )}
            </button>
          </div>

          {/* Volume control */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="text-fg-muted hover:text-fg-primary transition-colors cursor-pointer"
              onClick={toggleMute}
            >
              {muted || volume === 0 ? (
                <VolumeX size={12} />
              ) : volume < 0.5 ? (
                <Volume1 size={12} />
              ) : (
                <Volume2 size={12} />
              )}
            </button>
            <div
              ref={volumeRef}
              className="group relative h-3 w-12 flex items-center cursor-pointer"
              onPointerDown={handleVolPointerDown}
              onPointerMove={handleVolPointerMove}
              onPointerUp={handleVolPointerUp}
            >
              <div className="w-full h-1 rounded-full bg-black/[0.06] dark:bg-white/[0.08] group-hover:h-1.5 transition-all">
                <div
                  className="h-full rounded-full bg-accent transition-[width]"
                  style={{ width: `${(muted ? 0 : volume) * 100}%` }}
                />
              </div>
            </div>
          </div>
          <span className="text-[10px] tabular-nums text-fg-muted w-8">
            {formatTime(duration)}
          </span>
        </div>
      </div>
    </div>
  );
}
