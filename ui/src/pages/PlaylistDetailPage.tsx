import { useQueryClient } from "@tanstack/react-query";
import { Button, Empty, Popconfirm, Spin } from "@tokiomo/components";
import {
  ArrowDown,
  ArrowUp,
  Clock,
  ListMusic,
  Music,
  Pencil,
  Play,
  Shuffle,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import type { MusicTrackOutput, PlaylistDetailOutput } from "@/types";
import { useWindowNav } from "../../components/window-manager/WindowNavContext";
import { useMusicPlayer } from "../../contexts/MusicPlayerContext";
import { api } from "../../generated/rust-api";
import { useMessage } from "../../hooks";
import { resolveStoragePath } from "../../lib/storage-url";

function getCoverUrl(coverPath: string | null | undefined): string | null {
  if (!coverPath) return null;
  if (coverPath.startsWith("http")) return coverPath;
  return resolveStoragePath(coverPath);
}

function formatDuration(seconds: number | null | undefined): string {
  if (!seconds) return "--:--";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatTotalDuration(seconds: number | null | undefined): string {
  if (!seconds) return "";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}min` : `${m}min`;
}

// ── Inline Edit Header ───────────────────────────────────────────────────────

function PlaylistHeader({
  playlist,
  onUpdate,
  onDelete,
  onPlayAll,
  onShuffle,
  isUpdating,
}: {
  playlist: PlaylistDetailOutput;
  onUpdate: (name: string, description: string | null) => void;
  onDelete: () => void;
  onPlayAll: () => void;
  onShuffle: () => void;
  isUpdating: boolean;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(playlist.name);
  const [editDesc, setEditDesc] = useState(playlist.description ?? "");
  const coverUrl = getCoverUrl(playlist.coverPath);

  const handleSave = () => {
    const trimmed = editName.trim();
    if (!trimmed) return;
    onUpdate(trimmed, editDesc.trim() || null);
    setEditing(false);
  };

  const handleCancel = () => {
    setEditName(playlist.name);
    setEditDesc(playlist.description ?? "");
    setEditing(false);
  };

  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end">
      {/* Cover */}
      <div className="h-40 w-40 flex-shrink-0 overflow-hidden rounded-xl shadow-lg">
        {coverUrl ? (
          <img
            src={coverUrl}
            alt={playlist.name}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-indigo-500/30 to-purple-500/30 dark:from-indigo-600/40 dark:to-purple-600/40">
            <Music className="h-16 w-16 text-neutral-400 dark:text-neutral-500" />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex flex-1 flex-col gap-2">
        {editing ? (
          <div className="flex flex-col gap-2">
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-lg font-bold outline-none focus:border-indigo-500 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSave();
                if (e.key === "Escape") handleCancel();
              }}
            />
            <textarea
              value={editDesc}
              onChange={(e) => setEditDesc(e.target.value)}
              rows={2}
              placeholder={t("media.playlist.descriptionPlaceholder")}
              className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-indigo-500 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100"
            />
            <div className="flex gap-2">
              <Button
                variant="primary"
                size="small"
                onClick={handleSave}
                loading={isUpdating}
              >
                {t("media.playlist.save")}
              </Button>
              <Button size="small" onClick={handleCancel}>
                {t("media.playlist.cancel")}
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100">
                {playlist.name}
              </h1>
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="rounded p-1 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200"
              >
                <Pencil className="h-4 w-4" />
              </button>
            </div>
            {playlist.description && (
              <p className="text-sm text-neutral-500 dark:text-neutral-400">
                {playlist.description}
              </p>
            )}
            <div className="flex items-center gap-3 text-sm text-neutral-500 dark:text-neutral-400">
              <span className="flex items-center gap-1">
                <ListMusic className="h-4 w-4" />
                {playlist.trackCount} tracks
              </span>
              {playlist.totalDuration ? (
                <span className="flex items-center gap-1">
                  <Clock className="h-4 w-4" />
                  {formatTotalDuration(playlist.totalDuration)}
                </span>
              ) : null}
            </div>
          </>
        )}

        {/* Actions */}
        {!editing && (
          <div className="mt-1 flex items-center gap-2">
            <Button
              variant="primary"
              onClick={onPlayAll}
              disabled={playlist.items.length === 0}
            >
              <Play className="mr-1 h-4 w-4" />
              {t("media.playlist.playAll")}
            </Button>
            <Button onClick={onShuffle} disabled={playlist.items.length === 0}>
              <Shuffle className="mr-1 h-4 w-4" />
              {t("media.playlist.shuffle")}
            </Button>
            <Popconfirm
              title={t("media.playlist.deleteConfirm")}
              onConfirm={onDelete}
              placement="bottom"
            >
              <Button danger>
                <Trash2 className="mr-1 h-4 w-4" />
                {t("media.playlist.delete")}
              </Button>
            </Popconfirm>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Track Row ────────────────────────────────────────────────────────────────

function TrackRow({
  index,
  itemId,
  track,
  isFirst,
  isLast,
  onPlay,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  index: number;
  itemId: string;
  track: MusicTrackOutput;
  isFirst: boolean;
  isLast: boolean;
  onPlay: () => void;
  onRemove: (itemId: string) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const coverUrl = getCoverUrl(track.coverPath);

  return (
    <div
      className={`group flex items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-800 ${
        index % 2 === 1
          ? "bg-neutral-50 dark:bg-neutral-800/50"
          : "bg-transparent"
      }`}
    >
      {/* # */}
      <span className="w-8 text-center text-sm text-neutral-400">
        {index + 1}
      </span>

      {/* Cover mini */}
      <button
        type="button"
        onClick={onPlay}
        className="relative h-10 w-10 flex-shrink-0 overflow-hidden rounded"
      >
        {coverUrl ? (
          <img
            src={coverUrl}
            alt={track.title}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-neutral-200 dark:bg-neutral-700">
            <Music className="h-4 w-4 text-neutral-400" />
          </div>
        )}
        <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 transition-opacity group-hover:opacity-100">
          <Play className="h-4 w-4 text-white" fill="white" />
        </div>
      </button>

      {/* Title & Artist */}
      <div className="min-w-0 flex-1">
        <button
          type="button"
          onClick={onPlay}
          className="block w-full truncate text-left text-sm font-medium text-neutral-900 dark:text-neutral-100"
        >
          {track.title}
        </button>
        <span className="truncate text-xs text-neutral-500 dark:text-neutral-400">
          {track.artistName ?? "—"}
        </span>
      </div>

      {/* Album */}
      <span className="hidden w-40 truncate text-xs text-neutral-500 dark:text-neutral-400 md:block">
        {track.albumTitle ?? "—"}
      </span>

      {/* Duration */}
      <span className="w-14 text-right text-xs text-neutral-500 dark:text-neutral-400">
        {formatDuration(track.duration)}
      </span>

      {/* Sort controls */}
      <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          type="button"
          onClick={onMoveUp}
          disabled={isFirst}
          className="rounded p-1 text-neutral-400 hover:text-neutral-600 disabled:invisible dark:hover:text-neutral-200"
        >
          <ArrowUp className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={onMoveDown}
          disabled={isLast}
          className="rounded p-1 text-neutral-400 hover:text-neutral-600 disabled:invisible dark:hover:text-neutral-200"
        >
          <ArrowDown className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Remove */}
      <button
        type="button"
        onClick={() => onRemove(itemId)}
        className="rounded p-1 text-neutral-400 opacity-0 transition-opacity hover:text-red-500 group-hover:opacity-100"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function PlaylistDetailPage() {
  const { params, goBack } = useWindowNav();
  const playlistId = params.playlistId as string | undefined;
  const { t } = useTranslation();
  const message = useMessage();
  const qc = useQueryClient();
  const { playTracks } = useMusicPlayer();

  const detailQuery = api.playlists.getById.useQuery(
    { id: playlistId! },
    { enabled: !!playlistId },
  );

  const updateMutation = api.playlists.update.useMutation({
    onSuccess: () => {
      message.success({
        content: t("media.playlist.updateSuccess"),
        key: "pl-update",
      });
      api.playlists.getById.invalidate(qc, { id: playlistId! });
      api.playlists.list.invalidate(qc);
    },
    onError: (err) =>
      message.error({ content: err.message, key: "pl-update-err" }),
  });

  const deleteMutation = api.playlists.delete.useMutation({
    onSuccess: () => {
      message.success({
        content: t("media.playlist.deleteSuccess"),
        key: "pl-delete",
      });
      api.playlists.list.invalidate(qc);
      goBack();
    },
    onError: (err) =>
      message.error({ content: err.message, key: "pl-delete-err" }),
  });

  const removeMutation = api.playlists.removeItems.useMutation({
    onSuccess: () => {
      api.playlists.getById.invalidate(qc, { id: playlistId! });
      api.playlists.list.invalidate(qc);
    },
    onError: (err) =>
      message.error({ content: err.message, key: "pl-remove-err" }),
  });

  const reorderMutation = api.playlists.reorder.useMutation({
    onSuccess: () => {
      api.playlists.getById.invalidate(qc, { id: playlistId! });
    },
  });

  const handleUpdate = useCallback(
    (name: string, description: string | null) => {
      if (!playlistId) return;
      updateMutation.mutate({
        id: playlistId,
        name,
        description: description ?? undefined,
      });
    },
    [playlistId, updateMutation],
  );

  const handleDelete = useCallback(() => {
    if (!playlistId) return;
    deleteMutation.mutate(playlistId);
  }, [playlistId, deleteMutation]);

  const handleRemove = useCallback(
    (itemId: string) => {
      if (!playlistId) return;
      removeMutation.mutate({ id: playlistId!, itemIds: [itemId] });
    },
    [playlistId, removeMutation],
  );

  const handlePlayTrack = useCallback(
    (idx: number) => {
      const playlist = detailQuery.data;
      if (!playlist) return;
      const tracks = playlist.items
        .filter((it) => it.track)
        .map((it) => it.track!);
      if (tracks.length === 0) return;
      playTracks(tracks, idx);
    },
    [detailQuery.data, playTracks],
  );

  const handlePlayAll = useCallback(() => {
    handlePlayTrack(0);
  }, [handlePlayTrack]);

  const handleShuffle = useCallback(() => {
    const playlist = detailQuery.data;
    if (!playlist) return;
    const tracks = playlist.items
      .filter((it) => it.track)
      .map((it) => it.track!);
    if (tracks.length === 0) return;
    const randomIdx = Math.floor(Math.random() * tracks.length);
    playTracks(tracks, randomIdx);
  }, [detailQuery.data, playTracks]);

  const handleMove = useCallback(
    (currentIndex: number, direction: "up" | "down") => {
      const playlist = detailQuery.data;
      if (!playlist || !playlistId) return;
      const items = [...playlist.items];
      const swapIdx = direction === "up" ? currentIndex - 1 : currentIndex + 1;
      if (swapIdx < 0 || swapIdx >= items.length) return;
      [items[currentIndex], items[swapIdx]] = [
        items[swapIdx],
        items[currentIndex],
      ];
      const newOrder = items.map((it) => it.id);
      reorderMutation.mutate({ id: playlistId!, itemIds: newOrder });
    },
    [detailQuery.data, playlistId, reorderMutation],
  );

  if (detailQuery.isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spin />
      </div>
    );
  }

  if (!detailQuery.data) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-neutral-500">{t("media.playlist.notFound")}</p>
      </div>
    );
  }

  const playlist = detailQuery.data;

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <PlaylistHeader
        playlist={playlist}
        onUpdate={handleUpdate}
        onDelete={handleDelete}
        onPlayAll={handlePlayAll}
        onShuffle={handleShuffle}
        isUpdating={updateMutation.isPending}
      />

      {/* Track list header */}
      {playlist.items.length > 0 && (
        <div className="mb-1 flex items-center gap-3 border-b border-neutral-200 px-3 pb-2 text-xs font-medium uppercase text-neutral-400 dark:border-neutral-700">
          <span className="w-8 text-center">#</span>
          <span className="w-10" />
          <span className="flex-1">{t("media.playlist.trackTitle")}</span>
          <span className="hidden w-40 md:block">
            {t("media.playlist.album")}
          </span>
          <span className="w-14 text-right">
            <Clock className="ml-auto h-3.5 w-3.5" />
          </span>
          <span className="w-[52px]" />
          <span className="w-6" />
        </div>
      )}

      {/* Tracks */}
      {playlist.items.length === 0 ? (
        <Empty description={t("media.playlist.emptyPlaylist")} />
      ) : (
        <div className="flex flex-col">
          {playlist.items.map((item, idx) =>
            item.track ? (
              <TrackRow
                key={item.id}
                index={idx}
                itemId={item.id}
                track={item.track}
                isFirst={idx === 0}
                isLast={idx === playlist.items.length - 1}
                onPlay={() => handlePlayTrack(idx)}
                onRemove={handleRemove}
                onMoveUp={() => handleMove(idx, "up")}
                onMoveDown={() => handleMove(idx, "down")}
              />
            ) : null,
          )}
        </div>
      )}
    </div>
  );
}
