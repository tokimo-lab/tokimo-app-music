import { useQueryClient } from "@tanstack/react-query";
import { Button, Empty, Modal, Spin } from "@tokiomo/components";
import { ListMusic, Music, Plus } from "lucide-react";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import type { PlaylistOutput } from "@/types";
import { api } from "../../generated/rust-api";
import { useMessage } from "../../hooks";
import { resolveStoragePath } from "../../lib/storage-url";

function getCoverUrl(coverPath: string | null | undefined): string | null {
  if (!coverPath) return null;
  if (coverPath.startsWith("http")) return coverPath;
  return resolveStoragePath(coverPath);
}

function formatTotalDuration(seconds: number | null | undefined): string {
  if (!seconds) return "";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}min` : `${m}min`;
}

// ── Playlist Card ────────────────────────────────────────────────────────────

function PlaylistCard({
  playlist,
  onClick,
}: {
  playlist: PlaylistOutput;
  onClick: () => void;
}) {
  const coverUrl = getCoverUrl(playlist.coverPath);

  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex flex-col overflow-hidden rounded-xl bg-neutral-100 transition-all hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700"
    >
      <div className="relative aspect-square w-full overflow-hidden">
        {coverUrl ? (
          <img
            src={coverUrl}
            alt={playlist.name}
            className="h-full w-full object-cover transition-transform group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-indigo-500/30 to-purple-500/30 dark:from-indigo-600/40 dark:to-purple-600/40">
            <Music className="h-12 w-12 text-neutral-400 dark:text-neutral-500" />
          </div>
        )}
      </div>
      <div className="flex flex-col gap-0.5 p-3 text-left">
        <span className="truncate font-medium text-neutral-900 dark:text-neutral-100">
          {playlist.name}
        </span>
        <span className="text-xs text-neutral-500 dark:text-neutral-400">
          {playlist.trackCount} tracks
          {playlist.totalDuration
            ? ` · ${formatTotalDuration(playlist.totalDuration)}`
            : ""}
        </span>
      </div>
    </button>
  );
}

// ── Create Playlist Dialog ───────────────────────────────────────────────────

function CreatePlaylistDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { t } = useTranslation();
  const message = useMessage();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const createMutation = api.playlists.create.useMutation({
    onSuccess: () => {
      message.success({
        content: t("media.playlist.createSuccess"),
        key: "playlist-create",
      });
      setName("");
      setDescription("");
      onCreated();
      onClose();
    },
    onError: (err) =>
      message.error({ content: err.message, key: "playlist-create-err" }),
  });

  const handleSubmit = useCallback(() => {
    const trimmed = name.trim();
    if (!trimmed) return undefined;
    createMutation.mutate({
      name: trimmed,
      description: description.trim() || undefined,
    });
    return undefined;
  }, [name, description, createMutation]);

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title={t("media.playlist.createPlaylist")}
      onOk={handleSubmit}
      confirmLoading={createMutation.isPending}
    >
      <div className="flex flex-col gap-4 py-2">
        <div>
          <label
            htmlFor="playlist-name"
            className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300"
          >
            {t("media.playlist.name")}
          </label>
          <input
            id="playlist-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("media.playlist.namePlaceholder")}
            className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100"
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSubmit();
            }}
          />
        </div>
        <div>
          <label
            htmlFor="playlist-description"
            className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300"
          >
            {t("media.playlist.description")}
          </label>
          <textarea
            id="playlist-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t("media.playlist.descriptionPlaceholder")}
            rows={3}
            className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100"
          />
        </div>
      </div>
    </Modal>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function PlaylistsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [createOpen, setCreateOpen] = useState(false);
  const qc = useQueryClient();

  const playlistsQuery = api.playlists.list.useQuery();

  const handleCreated = () => {
    api.playlists.list.invalidate(qc);
  };

  if (playlistsQuery.isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spin />
      </div>
    );
  }

  const playlists = playlistsQuery.data ?? [];

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ListMusic className="h-6 w-6 text-neutral-600 dark:text-neutral-300" />
          <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100">
            {t("media.playlist.title")}
          </h1>
        </div>
        <Button variant="primary" onClick={() => setCreateOpen(true)}>
          <Plus className="mr-1 h-4 w-4" />
          {t("media.playlist.createPlaylist")}
        </Button>
      </div>

      {/* Content */}
      {playlists.length === 0 ? (
        <Empty description={t("media.playlist.emptyState")}>
          <Button variant="primary" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-1 h-4 w-4" />
            {t("media.playlist.createPlaylist")}
          </Button>
        </Empty>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {playlists.map((pl) => (
            <PlaylistCard
              key={pl.id}
              playlist={pl}
              onClick={() => navigate(`playlists/${pl.id}`)}
            />
          ))}
        </div>
      )}

      <CreatePlaylistDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={handleCreated}
      />
    </div>
  );
}
