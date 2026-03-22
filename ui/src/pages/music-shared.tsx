import { Disc3, Heart, Play, User } from "lucide-react";
import { memo } from "react";
import type { MusicAlbumOutput, MusicArtistOutput } from "@/types";
import { resolveStoragePath } from "../../lib/storage-url";

export function formatDuration(seconds: number | null | undefined): string {
  if (!seconds) return "--:--";
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function formatTotalDuration(
  seconds: number | null | undefined,
): string {
  if (!seconds) return "";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}小时${m}分钟`;
  return `${m}分钟`;
}

/** Square album card with cover art, title, and artist name */
export const AlbumCard = memo(function AlbumCard({
  album,
  onClick,
}: {
  album: MusicAlbumOutput;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="group w-full cursor-pointer overflow-hidden rounded-lg border border-[var(--glass-border)] bg-white text-left transition-shadow hover:shadow-md dark:bg-gray-800/50"
      onClick={onClick}
    >
      <div className="relative aspect-square overflow-hidden bg-[var(--bg-skeleton)]">
        {album.coverPath ? (
          <img
            src={resolveStoragePath(album.coverPath)}
            alt={album.title}
            decoding="async"
            className="h-full w-full object-cover transition-transform group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-neutral-400 dark:text-neutral-500">
            <Disc3 className="h-12 w-12" />
          </div>
        )}
        {/* Play overlay */}
        <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 transition-opacity group-hover:opacity-100">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--accent)] shadow-lg">
            <Play className="h-6 w-6 text-white" fill="white" />
          </span>
        </div>
        {album.isFavorite && (
          <span className="absolute top-1.5 left-1.5">
            <Heart className="h-4 w-4 fill-red-500 text-red-500" />
          </span>
        )}
        {album.year && (
          <span className="absolute right-0 bottom-2 inline-flex items-center rounded-l-md border border-r-0 border-white/12 bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur-md">
            {album.year}
          </span>
        )}
      </div>
      <div className="flex h-[52px] flex-col justify-center px-2.5 py-1.5">
        <p
          className="truncate text-sm font-medium text-neutral-900 dark:text-neutral-100"
          title={album.title}
        >
          {album.title}
        </p>
        <p
          className="truncate text-xs text-neutral-500 dark:text-neutral-400"
          title={album.artistName ?? undefined}
        >
          {album.artistName || "未知艺术家"}
        </p>
      </div>
    </button>
  );
});

/** Round-avatar artist card (Spotify style) */
export const ArtistCard = memo(function ArtistCard({
  artist,
  onClick,
}: {
  artist: MusicArtistOutput;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="group flex w-full cursor-pointer flex-col items-center gap-2 rounded-lg border border-[var(--glass-border)] bg-white p-4 text-center transition-shadow hover:shadow-md dark:bg-gray-800/50"
      onClick={onClick}
    >
      <div className="relative aspect-square w-full overflow-hidden rounded-full bg-[var(--bg-skeleton)]">
        {artist.profilePath ? (
          <img
            src={resolveStoragePath(artist.profilePath)}
            alt={artist.name}
            decoding="async"
            className="h-full w-full object-cover transition-transform group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-neutral-400 dark:text-neutral-500">
            <User className="h-10 w-10" />
          </div>
        )}
      </div>
      <div className="w-full">
        <p
          className="truncate text-sm font-medium text-neutral-900 dark:text-neutral-100"
          title={artist.name}
        >
          {artist.name}
        </p>
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          {artist.albumCount} 张专辑
        </p>
      </div>
    </button>
  );
});
