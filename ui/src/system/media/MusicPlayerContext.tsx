import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { MusicAudioEngine } from "@/components/player/MusicAudioEngine";
import { WasmAudioEngine } from "@/components/player/WasmAudioEngine";
import { api } from "@/generated/rust-api";
import { rustUrl } from "@/lib/rust-api-runtime";
import { resolveStoragePath } from "@/lib/storage-url";
import type { MusicTrackOutput } from "@/types";
import {
  type MediaSessionQueueItem,
  useMediaSessionOptional,
  useMediaSessionRegister,
} from "./MediaSessionContext";

// ── Types ────────────────────────────────────────────────────────────────────

export type RepeatMode = "off" | "all" | "one";

export interface MusicPlayerState {
  queue: MusicTrackOutput[];
  currentIndex: number;
  isPlaying: boolean;
  volume: number;
  repeatMode: RepeatMode;
  shuffleEnabled: boolean;
  isLoading: boolean;
}

export interface MusicPlayerContextValue extends MusicPlayerState {
  playTrack(track: MusicTrackOutput): void;
  playTracks(tracks: MusicTrackOutput[], startIndex?: number): void;
  addToQueue(tracks: MusicTrackOutput[]): void;
  playNext(tracks: MusicTrackOutput[]): void;
  removeFromQueue(index: number): void;
  clearQueue(): void;
  skipToIndex(index: number): void;
  next(): void;
  previous(): void;
  togglePlay(): void;
  seek(time: number): void;
  setVolume(volume: number): void;
  setRepeatMode(mode: RepeatMode): void;
  toggleShuffle(): void;
  currentTrack: MusicTrackOutput | null;
  getAnalyser(): AnalyserNode | null;
  /** Real-time current time (ref-based, no re-render). */
  getCurrentTime(): number;
  /** Real-time duration (ref-based, no re-render). */
  getDuration(): number;
}

const MusicPlayerContext = createContext<MusicPlayerContextValue | null>(null);

export function useMusicPlayer(): MusicPlayerContextValue {
  const ctx = useContext(MusicPlayerContext);
  if (!ctx)
    throw new Error("useMusicPlayer must be used within MusicPlayerProvider");
  return ctx;
}

/** Try to read the music player context — returns null when outside provider. */
export function useMusicPlayerOptional(): MusicPlayerContextValue | null {
  return useContext(MusicPlayerContext);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const VOLUME_KEY = "music-player-volume";

function loadVolume(): number {
  try {
    const v = localStorage.getItem(VOLUME_KEY);
    if (v != null) {
      const n = Number.parseFloat(v);
      if (Number.isFinite(n)) return Math.max(0, Math.min(1, n));
    }
  } catch {
    /* ignore */
  }
  return 0.8;
}

function saveVolume(v: number): void {
  try {
    localStorage.setItem(VOLUME_KEY, String(v));
  } catch {
    /* ignore */
  }
}

const MEDIAFS_BASE =
  (typeof window !== "undefined" &&
    (import.meta.env as Record<string, string>).RUST_SERVER) ||
  "";

// ── Browser native codec detection ───────────────────────────────────────────

type AudioEngine = MusicAudioEngine | WasmAudioEngine;

let _testAudio: HTMLAudioElement | null = null;

const CODEC_MIME_MAP: Record<string, string> = {
  mp3: "audio/mpeg",
  mpeg: "audio/mpeg",
  aac: "audio/aac",
  alac: 'audio/mp4; codecs="alac"',
  wav: "audio/wav",
  pcm_s16le: "audio/wav",
  pcm_s24le: "audio/wav",
  pcm_s32le: "audio/wav",
  pcm_f32le: "audio/wav",
  pcm_f64le: "audio/wav",
  flac: "audio/flac",
  vorbis: 'audio/ogg; codecs="vorbis"',
  opus: 'audio/ogg; codecs="opus"',
  m4a: "audio/mp4",
};

const _canPlayCache = new Map<string, boolean>();

/**
 * Test if the current browser can natively play the given codec
 * via the HTML5 <audio> element (enabling streaming + Range-based seek).
 */
function canPlayNatively(codec?: string | null): boolean {
  if (!codec) return false;
  const key = codec.toLowerCase();
  const cached = _canPlayCache.get(key);
  if (cached !== undefined) return cached;
  const mime = CODEC_MIME_MAP[key];
  if (!mime) {
    _canPlayCache.set(key, false);
    return false;
  }
  if (!_testAudio) _testAudio = document.createElement("audio");
  const result = _testAudio.canPlayType(mime);
  const canPlay = result === "probably" || result === "maybe";
  _canPlayCache.set(key, canPlay);
  return canPlay;
}

/**
 * Normalise a stream URL returned by the backend so that `/api/media-files/*`
 * paths are routed to the Rust media-fs server (same logic as the video player).
 */
function normalizeStreamUrl(raw: string): string {
  if (typeof window === "undefined") return raw;
  try {
    const resolved = new URL(raw, window.location.origin);
    const isMediafsPath =
      resolved.pathname.startsWith("/api/media-files/") ||
      resolved.pathname.startsWith("/api/file-systems/") ||
      resolved.pathname.startsWith("/api/hls/") ||
      resolved.pathname.startsWith("/api/playback/");

    if (!isMediafsPath) return resolved.toString();

    if (MEDIAFS_BASE) {
      const rustBase = new URL(MEDIAFS_BASE, window.location.origin)
        .toString()
        .replace(/\/$/, "");
      return `${rustBase}${resolved.pathname}${resolved.search}`;
    }
    return resolved.toString();
  } catch {
    return raw;
  }
}

async function resolveStreamUrl(fileId: string): Promise<string> {
  const data = await api.playback.streamUrl.fetch({
    fileId,
    vc: "",
    vr: "",
  });
  return normalizeStreamUrl(data.url);
}

/** Build a shuffled index order using Fisher-Yates, keeping `currentIdx` first. */
function buildShuffleOrder(length: number, currentIdx: number): number[] {
  const indices = Array.from({ length }, (_, i) => i);
  // Remove current index, shuffle the rest, then prepend current
  const rest = indices.filter((i) => i !== currentIdx);
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  return currentIdx >= 0 && currentIdx < length ? [currentIdx, ...rest] : rest;
}

// ── Server-side state persistence ────────────────────────────────────────────

const SAVE_DEBOUNCE_MS = 3000;

interface PersistedMusicState {
  queue: MusicTrackOutput[];
  currentIndex: number;
  currentTime: number;
  repeatMode: RepeatMode;
  shuffleEnabled: boolean;
}

function buildStatePayload(
  queue: MusicTrackOutput[],
  currentIndex: number,
  currentTime: number,
  repeatMode: RepeatMode,
  shuffleEnabled: boolean,
): PersistedMusicState {
  return { queue, currentIndex, currentTime, repeatMode, shuffleEnabled };
}

function sendStateBeacon(state: PersistedMusicState): void {
  const blob = new Blob(
    [JSON.stringify({ stateData: { music: state } })],
    { type: "application/json" },
  );
  navigator.sendBeacon(rustUrl("/api/playback/state"), blob);
}

// ── Provider ─────────────────────────────────────────────────────────────────

export function MusicPlayerProvider({ children }: { children: ReactNode }) {
  const mediaSession = useMediaSessionOptional();

  // Core state
  const [queue, setQueue] = useState<MusicTrackOutput[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolumeState] = useState(loadVolume);
  const volumeRef = useRef(volume);
  volumeRef.current = volume;

  // Real-time refs for currentTime / duration — always up-to-date, no re-render
  const currentTimeRef = useRef(0);
  const durationRef = useRef(0);
  const getCurrentTime = useCallback(
    () => engineRef.current?.currentTime ?? currentTimeRef.current,
    [],
  );
  const getDuration = useCallback(
    () => engineRef.current?.audioDuration ?? durationRef.current,
    [],
  );
  const [repeatMode, setRepeatMode] = useState<RepeatMode>("off");
  const [shuffleEnabled, setShuffleEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Shuffle order — maps "playback position" → actual queue index
  const shuffleOrderRef = useRef<number[]>([]);
  // Current position within the shuffle order
  const shufflePosRef = useRef(0);

  const engineRef = useRef<AudioEngine | null>(null);
  const engineTypeRef = useRef<"native" | "wasm" | null>(null);
  const handleEndedRef = useRef<(() => void) | undefined>(undefined);

  /** Wire event listeners to the given engine instance. */
  const wireListeners = useCallback((engine: AudioEngine) => {
    engine.onTimeUpdate((t) => {
      currentTimeRef.current = t;
      const d = engine.audioDuration;
      if (d > 0) durationRef.current = d;
    });
    engine.onCanPlay(() => {
      setIsLoading(false);
      durationRef.current = engine.audioDuration;
    });
    engine.onLoadStart(() => {
      setIsLoading(true);
    });
    engine.onError((err) => {
      console.error("[MusicPlayer] audio error:", err);
      setIsLoading(false);
      setIsPlaying(false);
    });
    engine.onEnded(() => {
      handleEndedRef.current?.();
    });
  }, []);

  /**
   * Return the current engine, switching between native (<audio>) and
   * WASM (AudioContext + decode) based on browser codec support.
   */
  const ensureEngine = useCallback(
    (codec?: string | null): AudioEngine => {
      const useNative = canPlayNatively(codec);
      const targetType = useNative ? "native" : "wasm";

      if (engineRef.current && engineTypeRef.current === targetType) {
        return engineRef.current;
      }

      // Destroy old engine when switching types
      engineRef.current?.destroy();

      const engine: AudioEngine = useNative
        ? new MusicAudioEngine()
        : new WasmAudioEngine();
      engine.setVolume(volumeRef.current);
      engineRef.current = engine;
      engineTypeRef.current = targetType;
      wireListeners(engine);

      return engine;
    },
    [wireListeners],
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      engineRef.current?.destroy();
      engineRef.current = null;
    };
  }, []);

  // ── Server-side state restore on mount ──────────────────────────────────
  const didRestoreRef = useRef(false);
  useEffect(() => {
    if (didRestoreRef.current) return;
    didRestoreRef.current = true;

    api.playbackState.get
      .fetch()
      .then((data) => {
        const music = data?.music;
        if (
          !music ||
          !Array.isArray(music.queue) ||
          music.queue.length === 0
        )
          return;
        const restoredQueue = music.queue as MusicTrackOutput[];
        const idx = Math.max(
          0,
          Math.min(music.currentIndex, restoredQueue.length - 1),
        );
        setQueue(restoredQueue);
        setCurrentIndex(idx);
        currentTimeRef.current = music.currentTime ?? 0;
        // Restore duration from track metadata so progress bar shows correctly
        // before the audio engine loads
        const trackDuration = restoredQueue[idx]?.duration;
        if (trackDuration && trackDuration > 0) {
          durationRef.current = trackDuration;
        }
        setRepeatMode(
          (music.repeatMode as RepeatMode) ?? "off",
        );
        setShuffleEnabled(music.shuffleEnabled ?? false);
        if (music.shuffleEnabled) {
          shuffleOrderRef.current = buildShuffleOrder(
            restoredQueue.length,
            idx,
          );
          shufflePosRef.current = 0;
        }
        // Restored in paused state — user must explicitly press play
      })
      .catch(() => {
        /* ignore — first-time users have no state */
      });
  }, []);

  // ── Server-side state save (debounced) ──────────────────────────────────
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep refs up-to-date for save logic
  const saveQueueRef = useRef(queue);
  saveQueueRef.current = queue;
  const saveCurrentIndexRef = useRef(currentIndex);
  saveCurrentIndexRef.current = currentIndex;
  const saveRepeatModeRef = useRef(repeatMode);
  saveRepeatModeRef.current = repeatMode;
  const saveShuffleEnabledRef = useRef(shuffleEnabled);
  saveShuffleEnabledRef.current = shuffleEnabled;

  const scheduleSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const state = buildStatePayload(
        saveQueueRef.current,
        saveCurrentIndexRef.current,
        currentTimeRef.current,
        saveRepeatModeRef.current,
        saveShuffleEnabledRef.current,
      );
      api.playbackState.save.mutate({ stateData: { music: state } }).catch(() => {
        /* ignore save failures */
      });
    }, SAVE_DEBOUNCE_MS);
  }, []);

  // Trigger debounced save when queue or current track changes
  useEffect(() => {
    if (!didRestoreRef.current) return;
    scheduleSave();
  }, [queue, currentIndex, repeatMode, shuffleEnabled, scheduleSave]);

  // Save via sendBeacon on page unload / visibility hidden
  useEffect(() => {
    const flushState = () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      if (saveQueueRef.current.length === 0) return;
      sendStateBeacon(
        buildStatePayload(
          saveQueueRef.current,
          saveCurrentIndexRef.current,
          currentTimeRef.current,
          saveRepeatModeRef.current,
          saveShuffleEnabledRef.current,
        ),
      );
    };
    const handleBeforeUnload = () => flushState();
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") flushState();
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener(
        "visibilitychange",
        handleVisibilityChange,
      );
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  // ── Internal playback ────────────────────────────────────────────────────

  const startPlayback = useCallback(
    async (track: MusicTrackOutput) => {
      const fid = track.fileId ?? track.file?.id;
      if (!fid) return;
      setIsLoading(true);

      // Stop old playback and reset position immediately so the progress
      // bar shows 0 during the async URL resolution below.
      // getCurrentTime() reads engine.currentTime first, so we must also
      // seek the engine to 0 — just resetting currentTimeRef is not enough.
      const oldEngine = engineRef.current;
      if (oldEngine) {
        oldEngine.pause();
        oldEngine.seek(0);
      }
      currentTimeRef.current = 0;
      durationRef.current = track.duration ?? 0;

      try {
        // Notify media session — pauses all other sources (video, audio, etc.)
        mediaSession?.requestPlay("music");

        const url = await resolveStreamUrl(fid);
        const engine = ensureEngine(track.codec);
        await engine.loadAndPlay(url, track.codec);
        setIsPlaying(true);
        durationRef.current = engine.audioDuration;
      } catch (err) {
        console.error("[MusicPlayer] playback error:", err);
        setIsPlaying(false);
      } finally {
        setIsLoading(false);
      }
    },
    [mediaSession, ensureEngine],
  );

  // ── Audio engine event listeners ─────────────────────────────────────────

  // Keep refs up-to-date for the ended handler
  const queueRef = useRef(queue);
  const currentIndexRef = useRef(currentIndex);
  const repeatModeRef = useRef(repeatMode);
  const shuffleEnabledRef = useRef(shuffleEnabled);
  queueRef.current = queue;
  currentIndexRef.current = currentIndex;
  repeatModeRef.current = repeatMode;
  shuffleEnabledRef.current = shuffleEnabled;

  // handleEndedRef is used by wireListeners above — no separate
  // listener-setup effect needed; listeners are wired in ensureEngine().

  // Update the ended handler whenever relevant state changes
  useEffect(() => {
    handleEndedRef.current = () => {
      const q = queueRef.current;
      const idx = currentIndexRef.current;
      const rm = repeatModeRef.current;
      const shuffle = shuffleEnabledRef.current;

      if (rm === "one") {
        // Repeat single track
        const track = q[idx];
        if (track) startPlayback(track);
        return;
      }

      // Determine next index
      let nextIdx: number;
      if (shuffle) {
        const pos = shufflePosRef.current + 1;
        if (pos < shuffleOrderRef.current.length) {
          shufflePosRef.current = pos;
          nextIdx = shuffleOrderRef.current[pos];
        } else if (rm === "all") {
          // Re-shuffle and restart
          shuffleOrderRef.current = buildShuffleOrder(q.length, -1);
          shufflePosRef.current = 0;
          nextIdx = shuffleOrderRef.current[0];
        } else {
          // Shuffle exhausted, no repeat
          setIsPlaying(false);
          return;
        }
      } else {
        nextIdx = idx + 1;
        if (nextIdx >= q.length) {
          if (rm === "all") {
            nextIdx = 0;
          } else {
            setIsPlaying(false);
            return;
          }
        }
      }

      const nextTrack = q[nextIdx];
      if (nextTrack) {
        setCurrentIndex(nextIdx);
        currentTimeRef.current = 0;
        startPlayback(nextTrack);
      } else {
        setIsPlaying(false);
      }
    };
  }, [startPlayback]);

  // Sync volume changes to engine
  useEffect(() => {
    engineRef.current?.setVolume(volume);
  }, [volume]);

  // ── Public actions ───────────────────────────────────────────────────────

  const playTrack = useCallback(
    (track: MusicTrackOutput) => {
      setQueue([track]);
      setCurrentIndex(0);
      currentTimeRef.current = 0;
      shuffleOrderRef.current = [0];
      shufflePosRef.current = 0;
      startPlayback(track);
    },
    [startPlayback],
  );

  const playTracks = useCallback(
    (tracks: MusicTrackOutput[], startIndex = 0) => {
      if (tracks.length === 0) return;
      const idx = Math.max(0, Math.min(startIndex, tracks.length - 1));
      setQueue(tracks);
      setCurrentIndex(idx);
      currentTimeRef.current = 0;
      shuffleOrderRef.current = buildShuffleOrder(tracks.length, idx);
      shufflePosRef.current = 0;
      const track = tracks[idx];
      if (track) startPlayback(track);
    },
    [startPlayback],
  );

  const addToQueue = useCallback((tracks: MusicTrackOutput[]) => {
    setQueue((prev) => {
      const next = [...prev, ...tracks];
      if (shuffleOrderRef.current.length > 0) {
        const newIndices = tracks.map((_, i) => prev.length + i);
        shuffleOrderRef.current = [...shuffleOrderRef.current, ...newIndices];
      }
      return next;
    });
  }, []);

  const playNextAction = useCallback((tracks: MusicTrackOutput[]) => {
    setQueue((prev) => {
      const insertAt = currentIndexRef.current + 1;
      const next = [
        ...prev.slice(0, insertAt),
        ...tracks,
        ...prev.slice(insertAt),
      ];
      // Rebuild shuffle order since indices shifted
      if (shuffleEnabledRef.current) {
        shuffleOrderRef.current = buildShuffleOrder(
          next.length,
          currentIndexRef.current,
        );
        shufflePosRef.current = 0;
      }
      return next;
    });
  }, []);

  const removeFromQueue = useCallback(
    (index: number) => {
      setQueue((prev) => {
        if (index < 0 || index >= prev.length) return prev;
        const next = prev.filter((_, i) => i !== index);

        // Adjust currentIndex
        const cur = currentIndexRef.current;
        if (index < cur) {
          setCurrentIndex(cur - 1);
        } else if (index === cur) {
          // Removing currently playing track — play next or stop
          if (next.length === 0) {
            setCurrentIndex(-1);
            setIsPlaying(false);
            engineRef.current?.pause();
          } else {
            const newIdx = Math.min(cur, next.length - 1);
            setCurrentIndex(newIdx);
            const nextTrack = next[newIdx];
            if (nextTrack) startPlayback(nextTrack);
          }
        }

        // Rebuild shuffle if needed
        if (shuffleEnabledRef.current && next.length > 0) {
          shuffleOrderRef.current = buildShuffleOrder(
            next.length,
            currentIndexRef.current,
          );
          shufflePosRef.current = 0;
        }

        return next;
      });
    },
    [startPlayback],
  );

  const clearQueue = useCallback(() => {
    engineRef.current?.pause();
    setQueue([]);
    setCurrentIndex(-1);
    setIsPlaying(false);
    currentTimeRef.current = 0;
    durationRef.current = 0;
    shuffleOrderRef.current = [];
    shufflePosRef.current = 0;
    // Clear persisted state on server
    api.playbackState.save
      .mutate({ stateData: {} })
      .catch(() => {});
  }, []);

  const skipToIndex = useCallback(
    (index: number) => {
      if (index < 0 || index >= queueRef.current.length) return;
      setCurrentIndex(index);
      currentTimeRef.current = 0;
      const track = queueRef.current[index];
      if (track) startPlayback(track);
    },
    [startPlayback],
  );

  const next = useCallback(() => {
    const q = queueRef.current;
    const idx = currentIndexRef.current;
    if (q.length === 0) return;

    let nextIdx: number;
    if (shuffleEnabledRef.current) {
      const pos = shufflePosRef.current + 1;
      if (pos < shuffleOrderRef.current.length) {
        shufflePosRef.current = pos;
        nextIdx = shuffleOrderRef.current[pos];
      } else {
        shuffleOrderRef.current = buildShuffleOrder(q.length, -1);
        shufflePosRef.current = 0;
        nextIdx = shuffleOrderRef.current[0];
      }
    } else {
      nextIdx = (idx + 1) % q.length;
    }

    setCurrentIndex(nextIdx);
    currentTimeRef.current = 0;
    const track = q[nextIdx];
    if (track) startPlayback(track);
  }, [startPlayback]);

  const previous = useCallback(() => {
    const q = queueRef.current;
    const idx = currentIndexRef.current;
    if (q.length === 0) return;

    // If more than 3s in, restart current track
    if (engineRef.current && engineRef.current.currentTime > 3) {
      engineRef.current.seek(0);
      currentTimeRef.current = 0;
      return;
    }

    let prevIdx: number;
    if (shuffleEnabledRef.current) {
      const pos = shufflePosRef.current - 1;
      if (pos >= 0) {
        shufflePosRef.current = pos;
        prevIdx = shuffleOrderRef.current[pos];
      } else {
        prevIdx = idx;
      }
    } else {
      prevIdx = (idx - 1 + q.length) % q.length;
    }

    setCurrentIndex(prevIdx);
    currentTimeRef.current = 0;
    const track = q[prevIdx];
    if (track) startPlayback(track);
  }, [startPlayback]);

  const togglePlay = useCallback(() => {
    const engine = engineRef.current;
    if (!engine || (engine.paused && engine.audioDuration === 0)) {
      // Engine not yet initialized or has no loaded audio
      // (e.g. restored from server state). Load and play the current track.
      const track = queueRef.current[currentIndexRef.current];
      if (track) {
        const savedPos = currentTimeRef.current;
        startPlayback(track).then(() => {
          if (savedPos > 0) engineRef.current?.seek(savedPos);
        });
      }
      return;
    }

    if (engine.paused) {
      // Notify media session — pauses all other sources
      mediaSession?.requestPlay("music");
      engine.resume();
      setIsPlaying(true);
    } else {
      engine.pause();
      setIsPlaying(false);
      mediaSession?.notifyPause("music");
    }
  }, [mediaSession, startPlayback]);

  const seek = useCallback((time: number) => {
    engineRef.current?.seek(time);
    currentTimeRef.current = time;
  }, []);

  const setVolume = useCallback((v: number) => {
    const clamped = Math.max(0, Math.min(1, v));
    setVolumeState(clamped);
    saveVolume(clamped);
  }, []);

  const setRepeatModeAction = useCallback((mode: RepeatMode) => {
    setRepeatMode(mode);
  }, []);

  const toggleShuffle = useCallback(() => {
    setShuffleEnabled((prev) => {
      const next = !prev;
      if (next) {
        shuffleOrderRef.current = buildShuffleOrder(
          queueRef.current.length,
          currentIndexRef.current,
        );
        shufflePosRef.current = 0;
      }
      return next;
    });
  }, []);

  const getAnalyser = useCallback((): AnalyserNode | null => {
    return engineRef.current?.getAnalyser() ?? null;
  }, []);

  const currentTrack = useMemo(() => {
    if (currentIndex < 0 || currentIndex >= queue.length) return null;
    return queue[currentIndex] ?? null;
  }, [queue, currentIndex]);

  // ── MediaSession registration ──────────────────────────────────────────────

  const queueItems = useMemo<MediaSessionQueueItem[]>(
    () =>
      queue.map((t) => {
        const cover = t.coverPath;
        return {
          id: t.id,
          title: t.title,
          artist: t.artistName ?? undefined,
          artwork: cover
            ? cover.startsWith("http")
              ? cover
              : resolveStoragePath(cover)
            : undefined,
          duration: t.duration ?? undefined,
        };
      }),
    [queue],
  );

  const musicMediaSource = useMemo(() => {
    if (!currentTrack) return null;
    const coverPath = currentTrack.coverPath;
    const artwork = coverPath
      ? coverPath.startsWith("http")
        ? coverPath
        : resolveStoragePath(coverPath)
      : undefined;
    return {
      id: "music" as const,
      type: "music" as const,
      title: currentTrack.title,
      artist: currentTrack.artistName ?? undefined,
      album: currentTrack.albumTitle ?? undefined,
      artwork,
      isPlaying,
      getCurrentTime,
      getDuration,
      volume,
      play: () => {
        const engine = engineRef.current;
        if (!engine || (engine.paused && engine.audioDuration === 0)) {
          // No engine or no loaded audio — load the track from saved position
          const track = queueRef.current[currentIndexRef.current];
          if (track) {
            const savedPos = currentTimeRef.current;
            startPlayback(track).then(() => {
              if (savedPos > 0) engineRef.current?.seek(savedPos);
            });
          }
        } else if (engine.paused) {
          engine.resume();
          setIsPlaying(true);
        }
      },
      pause: () => {
        engineRef.current?.pause();
        setIsPlaying(false);
      },
      seek,
      setVolume,
      next,
      previous,
      getAnalyser,
      queue: queueItems,
      currentIndex,
      skipToIndex,
      removeFromQueue,
    };
  }, [
    currentTrack,
    isPlaying,
    getCurrentTime,
    getDuration,
    volume,
    seek,
    setVolume,
    next,
    previous,
    getAnalyser,
    queueItems,
    currentIndex,
    skipToIndex,
    removeFromQueue,
  ]);

  useMediaSessionRegister(musicMediaSource);

  const value = useMemo<MusicPlayerContextValue>(
    () => ({
      queue,
      currentIndex,
      isPlaying,
      volume,
      repeatMode,
      shuffleEnabled,
      isLoading,
      currentTrack,
      playTrack,
      playTracks,
      addToQueue,
      playNext: playNextAction,
      removeFromQueue,
      clearQueue,
      skipToIndex,
      next,
      previous,
      togglePlay,
      seek,
      setVolume,
      setRepeatMode: setRepeatModeAction,
      toggleShuffle,
      getAnalyser,
      getCurrentTime,
      getDuration,
    }),
    [
      queue,
      currentIndex,
      isPlaying,
      volume,
      repeatMode,
      shuffleEnabled,
      isLoading,
      currentTrack,
      playTrack,
      playTracks,
      addToQueue,
      playNextAction,
      removeFromQueue,
      clearQueue,
      skipToIndex,
      next,
      previous,
      togglePlay,
      seek,
      setVolume,
      setRepeatModeAction,
      toggleShuffle,
      getAnalyser,
      getCurrentTime,
      getDuration,
    ],
  );

  return (
    <MusicPlayerContext.Provider value={value}>
      {children}
    </MusicPlayerContext.Provider>
  );
}
