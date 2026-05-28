import type {
  MediaProviderHandle,
  MediaTrack,
  MenuBarConfig,
  ShellModalWindowParams,
} from "@tokimo/sdk";
import {
  useMediaCenter,
  useShellAppearance,
  useShellMenuBar,
  useShellToast,
  useShellWindowNav,
} from "@tokimo/sdk/react";
import { useCallback, useEffect, useMemo } from "react";
import { useAppCtx } from "../AppContext";
import type { MusicTrackOutput, RepeatMode } from "../lib/types";

export type { MenuBarConfig, RepeatMode };

const PROVIDER_ID = "local-music";

export interface AppEntityEventData {
  scope?: string | null;
  kind?: string | null;
  entityId?: string | null;
}

interface WindowRouteParams {
  libraryId?: string;
  albumId?: string;
  personId?: string;
}

interface WindowNavResult {
  route: string;
  canGoBack: boolean;
  navigate: (route: string, title?: string) => void;
  replace: (route: string, title?: string) => void;
  goBack: () => void;
  LazyViewComponent: React.ComponentType | null;
  params: WindowRouteParams;
  metadata: Record<string, unknown>;
  updateTitle: (title: string) => void;
  updateMetadata: (metadata: Record<string, unknown>) => void;
}

export function useMessage() {
  const ctx = useAppCtx();
  return useShellToast(ctx);
}

function parseRouteParams(route: string): WindowRouteParams {
  const parts = route.split("/").filter(Boolean);
  if (parts[0] === "library" && parts[1]) return { libraryId: parts[1] };
  if (parts[0] === "albums" && parts[1]) return { albumId: parts[1] };
  if (parts[0] === "artists" && parts[1]) return { personId: parts[1] };
  return {};
}

export function useWindowNav(): WindowNavResult {
  const ctx = useAppCtx();
  const shellNav = useShellWindowNav(ctx);
  const params = useMemo(() => parseRouteParams(shellNav.route), [shellNav.route]);
  const metadata = useMemo<Record<string, unknown>>(
    () => ({ appId: params.libraryId, ...params }),
    [params],
  );
  return {
    ...shellNav,
    LazyViewComponent: null,
    params,
    metadata,
    updateTitle: (_title: string) => {},
    updateMetadata: (_metadata: Record<string, unknown>) => {},
  };
}

export function useMenuBar(config: MenuBarConfig | null) {
  const ctx = useAppCtx();
  useShellMenuBar(ctx, config);
}

export function useThemeCore() {
  const ctx = useAppCtx();
  const appearance = useShellAppearance(ctx);
  return {
    isMacStyle: appearance.isMacStyle,
    theme: appearance.theme,
    titleBarStyle: appearance.titleBarStyle,
  };
}

export function useWindowId(): string {
  const ctx = useAppCtx();
  return ctx.windowId;
}

export function useWindowActions() {
  const ctx = useAppCtx();
  return {
    openModalWindow: ctx.shell.openModalWindow,
    closeWindow: (_id: string) => {},
  };
}

function toMediaTrack(track: MusicTrackOutput): MediaTrack {
  return {
    id: track.fileId ?? track.id,
    title: track.title,
    artist: track.artistName,
    album: track.albumTitle,
    artworkUrl: track.coverPath ?? undefined,
    durationMs: track.duration > 0 ? Math.round(track.duration * 1000) : undefined,
    meta: { original: track },
  };
}

function originalOf(track: MediaTrack | undefined): MusicTrackOutput | null {
  const meta = track?.meta;
  const original = meta && "original" in meta ? meta.original : null;
  return isMusicTrackOutput(original) ? original : null;
}

function isMusicTrackOutput(value: unknown): value is MusicTrackOutput {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    "title" in value &&
    typeof (value as { id?: unknown }).id === "string" &&
    typeof (value as { title?: unknown }).title === "string"
  );
}

export function useMusicPlayer() {
  const ctx = useAppCtx();
  const { snapshot, api: media } = useMediaCenter(ctx);

  useEffect(() => {
    if (!media) return;
    const handle: MediaProviderHandle = {
      displayName: "Tokimo Music",
      resolveAudioUrl: (track) => `/api/apps/music/files/${track.id}/stream`,
    };
    return media.registerProvider(PROVIDER_ID, handle);
  }, [media]);

  const isActive = snapshot?.providerId === PROVIDER_ID;
  const queue = useMemo<MusicTrackOutput[]>(() => {
    if (!isActive || !snapshot) return [];
    return snapshot.queue
      .map(originalOf)
      .filter((track): track is MusicTrackOutput => track !== null);
  }, [isActive, snapshot]);
  const currentTrack = isActive ? originalOf(snapshot?.queue[snapshot.currentIndex]) : null;
  const currentIndex = isActive && snapshot ? snapshot.currentIndex : -1;

  const playTracks = useCallback(
    (tracks: MusicTrackOutput[], startIndex = 0) => {
      if (!media || tracks.length === 0) return;
      void media.play({
        providerId: PROVIDER_ID,
        queue: tracks.map(toMediaTrack),
        startIndex,
      });
    },
    [media],
  );

  const playTrack = useCallback(
    (track: MusicTrackOutput) => playTracks([track], 0),
    [playTracks],
  );

  const addToQueue = useCallback(
    (tracks: MusicTrackOutput[]) => {
      if (!media || tracks.length === 0) return;
      const snap = media.getSnapshot();
      const next = [...(snap?.providerId === PROVIDER_ID ? snap.queue : []), ...tracks.map(toMediaTrack)];
      if (!snap || snap.providerId !== PROVIDER_ID) {
        void media.play({ providerId: PROVIDER_ID, queue: next, startIndex: 0 });
      } else {
        media.setQueue(next, snap.currentIndex);
      }
    },
    [media],
  );

  const removeFromQueue = useCallback(
    (index: number) => {
      if (!media) return;
      const snap = media.getSnapshot();
      if (!snap || snap.providerId !== PROVIDER_ID) return;
      const next = snap.queue.filter((_, i) => i !== index);
      if (next.length === 0) {
        media.pause();
        return;
      }
      media.setQueue(next, Math.min(snap.currentIndex, next.length - 1));
    },
    [media],
  );

  return {
    queue,
    currentIndex,
    currentTrack,
    isPlaying: isActive && snapshot ? snapshot.isPlaying : false,
    isLoading: false,
    volume: snapshot?.volume ?? 1,
    repeatMode: (isActive && snapshot ? snapshot.repeatMode : "off") as RepeatMode,
    shuffleEnabled: isActive && snapshot ? snapshot.shuffle : false,
    togglePlay: () => {
      const snap = media?.getSnapshot();
      if (!media || !snap || snap.providerId !== PROVIDER_ID) return;
      if (snap.isPlaying) media.pause();
      else media.resume();
    },
    playTrack,
    playTracks,
    addToQueue,
    playNext: addToQueue,
    removeFromQueue,
    clearQueue: () => media?.pause(),
    skipToIndex: (index: number) => media?.skipToIndex(index),
    next: () => media?.next(),
    previous: () => media?.previous(),
    nextTrack: () => media?.next(),
    prevTrack: () => media?.previous(),
    seek: (time: number) => media?.seek(Math.max(0, time) * 1000),
    setVolume: (volume: number) => media?.setVolume(volume),
    setRepeatMode: (mode: RepeatMode) => media?.setRepeat(mode),
    toggleShuffle: () => media?.setShuffle(!(media.getSnapshot()?.shuffle ?? false)),
    getAnalyser: () => media?.getAnalyser() ?? null,
    getCurrentTime: () => {
      const snap = media?.getSnapshot();
      return snap?.providerId === PROVIDER_ID ? snap.currentTimeMs / 1000 : 0;
    },
    getDuration: () => {
      const snap = media?.getSnapshot();
      return snap?.providerId === PROVIDER_ID ? snap.durationMs / 1000 : 0;
    },
  };
}

export class PickCancelled extends Error {
  constructor() {
    super("Pick cancelled");
    this.name = "PickCancelled";
  }
}

export async function pickWithBridge<T>(
  _openFn: (params: ShellModalWindowParams) => string,
  _options: ShellModalWindowParams,
): Promise<T> {
  throw new PickCancelled();
}

export function useAppEntityEvents(_options?: {
  appId?: string;
  kind?: string;
  onEvent?: (event: AppEntityEventData) => void;
}) {}

export function useJobEvents(_options?: {
  jobTypes?: readonly string[];
  enabled?: boolean;
  onEvent?: (event: import("../lib/types").WsJobEvent) => void;
}) {}

export function useBackgroundArt() {
  return { setBackgroundArt: (_url: string | null) => {} };
}
