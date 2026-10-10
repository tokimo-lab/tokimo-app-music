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
import { lazy, useCallback, useEffect, useMemo } from "react";
import { useAppCtx } from "../AppContext";
import type { MusicTrackOutput, RepeatMode } from "../lib/types";
import {
  commitMusicAudio,
  reportMusicPlaybackError,
  resolveMusicAudio,
} from "./music-quality";

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
  const parts = route.split(/[?#]/, 1)[0].split("/").filter(Boolean);
  if (parts[0] === "library" && parts[1]) {
    // /library/{id} or /library/{id}/albums/{albumId} or /library/{id}/artists/{artistId}
    if (parts[2] === "albums" && parts[3])
      return { libraryId: parts[1], albumId: parts[3] };
    if (parts[2] === "artists" && parts[3])
      return { libraryId: parts[1], personId: parts[3] };
    return { libraryId: parts[1] };
  }
  if (parts[0] === "albums" && parts[1]) return { albumId: parts[1] };
  if (parts[0] === "artists" && parts[1]) return { personId: parts[1] };
  return {};
}

// Lazy-loaded detail pages — only imported when the route matches.
const LazyAlbumDetail = lazy(() => import("../pages/MusicAlbumDetailPage"));
const LazyArtistDetail = lazy(() => import("../pages/MusicArtistPage"));

export function useWindowNav(): WindowNavResult {
  const ctx = useAppCtx();
  const shellNav = useShellWindowNav(ctx);
  const params = useMemo(
    () => parseRouteParams(shellNav.route),
    [shellNav.route],
  );
  const metadata = useMemo<Record<string, unknown>>(
    () => ({ appId: params.libraryId, ...params }),
    [params],
  );

  // Resolve the lazy view component based on route params.
  const LazyViewComponent = params.albumId
    ? LazyAlbumDetail
    : params.personId
      ? LazyArtistDetail
      : null;

  return {
    ...shellNav,
    LazyViewComponent,
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
    durationMs:
      track.duration > 0 ? Math.round(track.duration * 1000) : undefined,
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

// All windows in this document share the host's single MediaCenter store.
let musicProvider: { owners: number; dispose: () => void } | null = null;

/** The stable app layout owns registration; player consumers only subscribe. */
export function useMusicProvider() {
  const ctx = useAppCtx();
  const { api: media } = useMediaCenter(ctx);

  useEffect(() => {
    if (!media) return;
    let registration = musicProvider;
    if (!registration) {
      const handle: MediaProviderHandle = {
        displayName: "Tokimo Music",
        resolveAudioUrl: (track) => resolveMusicAudio(track.id),
        onTrackChanged: (track) => commitMusicAudio(track.id),
      };
      registration = {
        owners: 0,
        dispose: media.registerProvider(PROVIDER_ID, handle),
      };
      musicProvider = registration;
    }
    registration.owners += 1;
    return () => {
      registration.owners -= 1;
      if (registration.owners === 0) {
        registration.dispose();
        musicProvider = null;
      }
    };
  }, [media]);
}

export function useMusicPlayer() {
  const ctx = useAppCtx();
  const { snapshot, api: media } = useMediaCenter(ctx);

  const isActive = snapshot?.providerId === PROVIDER_ID;
  const queue = useMemo<MusicTrackOutput[]>(() => {
    if (!isActive || !snapshot) return [];
    return snapshot.queue
      .map(originalOf)
      .filter((track): track is MusicTrackOutput => track !== null);
  }, [isActive, snapshot]);
  const currentTrack = isActive
    ? originalOf(snapshot?.queue[snapshot.currentIndex])
    : null;
  const currentIndex = isActive && snapshot ? snapshot.currentIndex : -1;

  const playTracks = useCallback(
    (tracks: MusicTrackOutput[], startIndex = 0) => {
      if (!media || tracks.length === 0) return;
      void media
        .play({
          providerId: PROVIDER_ID,
          queue: tracks.map(toMediaTrack),
          startIndex,
        })
        .catch((error: unknown) =>
          reportMusicPlaybackError(
            error,
            tracks[startIndex]?.fileId ?? tracks[startIndex]?.id ?? "",
          ),
        );
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
      const next = [
        ...(snap?.providerId === PROVIDER_ID ? snap.queue : []),
        ...tracks.map(toMediaTrack),
      ];
      if (!snap || snap.providerId !== PROVIDER_ID) {
        void media
          .play({
            providerId: PROVIDER_ID,
            queue: next,
            startIndex: 0,
          })
          .catch((error: unknown) =>
            reportMusicPlaybackError(error, next[0]?.id ?? ""),
          );
      } else {
        media.setQueue(next, snap.currentIndex);
        media.updateProviderSnapshot(PROVIDER_ID, {
          currentIndex: snap.currentIndex,
        });
      }
    },
    [media],
  );

  const removeFromQueue = useCallback(
    (index: number) => {
      if (!media) return;
      const snap = media.getSnapshot();
      if (!snap || snap.providerId !== PROVIDER_ID) return;
      if (index < 0 || index >= snap.queue.length) return;
      const next = snap.queue.filter((_, i) => i !== index);
      if (next.length === 0) {
        media.clearQueue();
        return;
      }
      if (index === snap.currentIndex) {
        const nextIndex = Math.min(index, next.length - 1);
        void media
          .play({
            providerId: PROVIDER_ID,
            queue: next,
            startIndex: nextIndex,
          })
          .then(() => {
            const current = media.getSnapshot();
            if (
              !snap.isPlaying &&
              current?.providerId === PROVIDER_ID &&
              current.currentIndex === nextIndex &&
              current.queue.length === next.length &&
              current.queue.every((track, i) => track === next[i])
            ) {
              media.pause();
            }
          })
          .catch((error: unknown) =>
            console.error("[Music] Failed to replace current track", error),
          );
        return;
      }
      const nextIndex =
        index < snap.currentIndex ? snap.currentIndex - 1 : snap.currentIndex;
      media.setQueue(next, nextIndex);
      media.updateProviderSnapshot(PROVIDER_ID, { currentIndex: nextIndex });
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
    repeatMode: (isActive && snapshot
      ? snapshot.repeatMode
      : "off") as RepeatMode,
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
    clearQueue: () => {
      if (media?.getSnapshot()?.providerId === PROVIDER_ID) media.clearQueue();
    },
    skipToIndex: (index: number) => media?.skipToIndex(index),
    next: () => media?.next(),
    previous: () => media?.previous(),
    nextTrack: () => media?.next(),
    prevTrack: () => media?.previous(),
    seek: (time: number) => media?.seek(Math.max(0, time) * 1000),
    setVolume: (volume: number) => media?.setVolume(volume),
    setRepeatMode: (mode: RepeatMode) => media?.setRepeat(mode),
    toggleShuffle: () =>
      media?.setShuffle(!(media.getSnapshot()?.shuffle ?? false)),
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
