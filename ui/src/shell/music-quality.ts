import type { MediaAudioSource, ShellMediaCenterApi } from "@tokimo/sdk";
import { useSyncExternalStore } from "react";
import {
  type MusicPlaybackSource,
  type MusicQualityProfile,
  musicPlaybackApi,
} from "../api/client";

interface QualityState {
  requested: MusicQualityProfile;
  fileId: string | null;
  playback: MusicPlaybackSource | null;
  loading: boolean;
  error: string | null;
}

let state: QualityState = {
  requested: "original",
  fileId: null,
  playback: null,
  loading: false,
  error: null,
};
let generation = 0;
let selectionGeneration = 0;
let appliedRequested: MusicQualityProfile = "original";
let pending: {
  request: number;
  requested: MusicQualityProfile;
  fileId: string;
  playback: MusicPlaybackSource;
} | null = null;
const listeners = new Set<() => void>();

function update(patch: Partial<QualityState>) {
  state = { ...state, ...patch };
  for (const listener of listeners) listener();
}

export function useMusicQuality() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state,
  );
}

export async function resolveMusicAudio(
  fileId: string,
): Promise<MediaAudioSource> {
  const request = ++generation;
  const requested = state.requested;
  update({
    fileId,
    loading: true,
    error: null,
    ...(state.fileId === fileId ? {} : { playback: null }),
  });
  try {
    const playback = await musicPlaybackApi.create(fileId, requested);
    if (request === generation) {
      pending = { request, requested, fileId, playback };
      update({ loading: false });
    }
    const sessionId = playback.sessionId;
    return {
      url: playback.url,
      kind: playback.kind,
      ...(sessionId ? { dispose: () => musicPlaybackApi.stop(sessionId) } : {}),
    };
  } catch (error) {
    if (request === generation)
      update({
        loading: false,
        error: error instanceof Error ? error.message : "音质加载失败",
      });
    throw error;
  }
}

export async function selectMusicQuality(
  profile: MusicQualityProfile,
  media: ShellMediaCenterApi,
): Promise<void> {
  if (profile === state.requested && !state.error) return;
  const selection = ++selectionGeneration;
  update({ requested: profile, loading: true, error: null });
  try {
    await media.reloadCurrentSource();
    const snapshot = media.getSnapshot();
    if (
      selection === selectionGeneration &&
      snapshot?.providerId === "local-music"
    ) {
      commitMusicAudio(snapshot.queue[snapshot.currentIndex]?.id);
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return;
    if (selection === selectionGeneration && state.requested === profile) {
      update({
        requested: appliedRequested,
        loading: false,
        error: error instanceof Error ? error.message : "音质切换失败",
      });
    }
    console.error("[Music] Quality switch failed", error);
  }
}

/** Called after the host successfully attaches a track or completes a source reload. */
export function commitMusicAudio(fileId: string | undefined) {
  if (!pending || pending.request !== generation || pending.fileId !== fileId)
    return;
  appliedRequested = pending.requested;
  update({
    playback: pending.playback,
    requested: pending.requested,
    loading: false,
    error: null,
  });
  pending = null;
}

export function reportMusicPlaybackError(error: unknown, fileId: string) {
  if (error instanceof DOMException && error.name === "AbortError") return;
  console.error("[Music] Playback failed", error);
  if (state.fileId !== fileId) return;
  update({
    loading: false,
    error: error instanceof Error ? error.message : "播放加载失败",
  });
}
