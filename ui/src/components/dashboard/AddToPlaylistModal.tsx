import { useQueryClient } from "@tanstack/react-query";
import { Button, Modal, Spin } from "@tokiomo/components";
import type { PlaylistOutput } from "@tokiomo/types";
import { Music, Plus } from "lucide-react";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../generated/rust-api";
import { useMessage } from "../../hooks";

interface AddToPlaylistModalProps {
  open: boolean;
  onClose: () => void;
  trackIds: string[];
}

const API_BASE =
  (typeof window !== "undefined" &&
    (import.meta.env as Record<string, string>).VITE_API_URL) ||
  "";

function getCoverUrl(coverPath: string | null | undefined): string | null {
  if (!coverPath) return null;
  if (coverPath.startsWith("http")) return coverPath;
  return `${API_BASE}${coverPath.startsWith("/") ? "" : "/"}${coverPath}`;
}

// ── Playlist Row ─────────────────────────────────────────────────────────────

function PlaylistRow({
  playlist,
  onSelect,
  isAdding,
}: {
  playlist: PlaylistOutput;
  onSelect: () => void;
  isAdding: boolean;
}) {
  const coverUrl = getCoverUrl(playlist.coverPath);

  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={isAdding}
      className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-neutral-100 disabled:opacity-50 dark:hover:bg-neutral-700"
    >
      <div className="h-10 w-10 flex-shrink-0 overflow-hidden rounded">
        {coverUrl ? (
          <img
            src={coverUrl}
            alt={playlist.name}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-indigo-500/30 to-purple-500/30 dark:from-indigo-600/40 dark:to-purple-600/40">
            <Music className="h-4 w-4 text-neutral-400" />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-neutral-900 dark:text-neutral-100">
          {playlist.name}
        </div>
        <div className="text-xs text-neutral-500 dark:text-neutral-400">
          {playlist.trackCount} tracks
        </div>
      </div>
      {isAdding && <Spin size="small" />}
    </button>
  );
}

// ── Component ────────────────────────────────────────────────────────────────

export default function AddToPlaylistModal({
  open,
  onClose,
  trackIds,
}: AddToPlaylistModalProps) {
  const { t } = useTranslation();
  const message = useMessage();
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [addingToId, setAddingToId] = useState<string | null>(null);

  const playlistsQuery = api.playlists.list.useQuery({
    enabled: open,
  });

  const addTracksMutation = api.playlists.addTracks.useMutation({
    onSuccess: () => {
      message.success({
        content: t("media.playlist.addSuccess"),
        key: "pl-add",
      });
      api.playlists.list.invalidate(qc);
      setAddingToId(null);
      onClose();
    },
    onError: (err) => {
      message.error({ content: err.message, key: "pl-add-err" });
      setAddingToId(null);
    },
  });

  const createMutation = api.playlists.create.useMutation({
    onSuccess: (created) => {
      addTracksMutation.mutate({ id: created.id, trackIds });
      setNewName("");
      setShowCreate(false);
    },
    onError: (err) =>
      message.error({ content: err.message, key: "pl-create-err" }),
  });

  const handleSelectPlaylist = useCallback(
    (playlistId: string) => {
      if (trackIds.length === 0) return;
      setAddingToId(playlistId);
      addTracksMutation.mutate({ id: playlistId, trackIds });
    },
    [trackIds, addTracksMutation],
  );

  const handleCreateAndAdd = useCallback(() => {
    const trimmed = newName.trim();
    if (!trimmed || trackIds.length === 0) return;
    createMutation.mutate({ name: trimmed });
  }, [newName, trackIds, createMutation]);

  const handleClose = useCallback(() => {
    setShowCreate(false);
    setNewName("");
    setAddingToId(null);
    onClose();
  }, [onClose]);

  const playlists = playlistsQuery.data ?? [];

  return (
    <Modal
      open={open}
      onCancel={handleClose}
      title={t("media.playlist.addToPlaylist")}
      footer={null}
    >
      <div className="flex flex-col gap-2 py-1">
        {/* Create new option */}
        {showCreate ? (
          <div className="flex items-center gap-2 px-3 py-2">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={t("media.playlist.namePlaceholder")}
              className="flex-1 rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-indigo-500 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreateAndAdd();
                if (e.key === "Escape") setShowCreate(false);
              }}
            />
            <Button
              variant="primary"
              size="small"
              onClick={handleCreateAndAdd}
              loading={createMutation.isPending}
            >
              {t("media.playlist.create")}
            </Button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-700"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded bg-indigo-500/10 dark:bg-indigo-500/20">
              <Plus className="h-5 w-5 text-indigo-500" />
            </div>
            <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
              {t("media.playlist.createNew")}
            </span>
          </button>
        )}

        {/* Divider */}
        {playlists.length > 0 && (
          <div className="border-t border-neutral-200 dark:border-neutral-700" />
        )}

        {/* Playlists list */}
        {playlistsQuery.isLoading ? (
          <div className="flex justify-center py-4">
            <Spin />
          </div>
        ) : playlists.length === 0 ? (
          <p className="px-3 py-4 text-center text-sm text-neutral-500">
            {t("media.playlist.noPlaylists")}
          </p>
        ) : (
          <div className="max-h-64 overflow-y-auto">
            {playlists.map((pl) => (
              <PlaylistRow
                key={pl.id}
                playlist={pl}
                onSelect={() => handleSelectPlaylist(pl.id)}
                isAdding={addingToId === pl.id}
              />
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
