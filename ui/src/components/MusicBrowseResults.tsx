import { Empty } from "@tokimo/ui";
import { motion } from "framer-motion";
import { Clock, Pause, Play } from "lucide-react";
import type {
  MusicAlbumOutput,
  MusicArtistOutput,
  MusicTrackOutput,
} from "../lib/types";
import { AlbumCard, ArtistCard, formatDuration } from "../pages/music-shared";
import { useMusicPlayer } from "../shell/hooks";

const LAYOUT_SPRING = {
  type: "spring" as const,
  stiffness: 400,
  damping: 30,
  mass: 0.8,
};

// ── Track Row ─────────────────────────────────────────────────────────────────

function TrackRow({
  track,
  index,
  onPlay,
  compact,
}: {
  track: MusicTrackOutput;
  index: number;
  onPlay: () => void;
  compact: boolean;
}) {
  const { currentTrack, isPlaying, togglePlay } = useMusicPlayer();
  const isActive = currentTrack?.id === track.id;

  return (
    <button
      type="button"
      className={`group flex w-full cursor-pointer items-center gap-3 min-h-14 rounded-md px-3 py-2 text-left transition-colors ${
        isActive
          ? "bg-[var(--color-accent)]/10"
          : "hover:bg-[var(--color-fill-tertiary)]"
      }`}
      onClick={isActive ? togglePlay : onPlay}
    >
      <span className="w-8 flex-shrink-0 text-center text-sm text-[var(--color-fg-muted)]">
        {isActive ? (
          isPlaying ? (
            <Pause className="mx-auto h-4 w-4 text-[var(--color-accent)]" />
          ) : (
            <Play
              className="mx-auto h-4 w-4 text-[var(--color-accent)]"
              fill="currentColor"
            />
          )
        ) : (
          <span className="group-hover:hidden">{index + 1}</span>
        )}
        {!isActive && (
          <Play
            className="mx-auto hidden h-4 w-4 group-hover:block"
            fill="currentColor"
          />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <p
          className={`truncate text-sm font-medium ${isActive ? "text-[var(--color-accent)]" : "text-[var(--color-fg-primary)]"}`}
        >
          {track.title}
        </p>
        {compact && (
          <p className="mt-1 truncate text-xs text-fg-muted">
            {[track.artistName || "未知艺术家", track.albumTitle]
              .filter(Boolean)
              .join(" · ")}
          </p>
        )}
      </div>
      <span
        className={`${compact ? "hidden" : "block"} w-[140px] flex-shrink-0 truncate text-xs text-fg-muted`}
      >
        {track.artistName || "未知"}
      </span>
      <span
        className={`${compact ? "hidden" : "block"} w-[180px] flex-shrink-0 truncate text-xs text-fg-muted`}
      >
        {track.albumTitle || ""}
      </span>
      <span className="w-[50px] flex-shrink-0 text-right text-xs text-[var(--color-fg-muted)]">
        {formatDuration(track.duration)}
      </span>
    </button>
  );
}

// ── Grid Components ───────────────────────────────────────────────────────────

export function AlbumsGrid({
  albums,
  onAlbumClick,
  compact,
}: {
  albums: MusicAlbumOutput[];
  onAlbumClick: (albumId: string, albumTitle: string) => void;
  compact: boolean;
}) {
  if (!albums.length) return <Empty description="暂无专辑" />;
  return (
    <div
      className={`grid ${compact ? "grid-cols-2 gap-3" : "grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-4"}`}
    >
      {albums.map((album) => (
        <motion.div key={album.id} layout transition={LAYOUT_SPRING}>
          <AlbumCard
            album={album}
            onClick={() => onAlbumClick(album.id, album.title ?? "Album")}
          />
        </motion.div>
      ))}
    </div>
  );
}

export function ArtistsGrid({
  artists,
  onArtistClick,
  compact,
}: {
  artists: MusicArtistOutput[];
  onArtistClick: (artistId: string, artistName: string) => void;
  compact: boolean;
}) {
  if (!artists.length) return <Empty description="暂无艺术家" />;
  return (
    <div
      className={`grid ${compact ? "grid-cols-2 gap-3" : "grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-4"}`}
    >
      {artists.map((artist) => (
        <motion.div key={artist.id} layout transition={LAYOUT_SPRING}>
          <ArtistCard
            artist={artist}
            onClick={() => onArtistClick(artist.id, artist.name ?? "Artist")}
          />
        </motion.div>
      ))}
    </div>
  );
}

export function TracksTable({
  tracks,
  onPlayTrack,
  compact,
}: {
  tracks: MusicTrackOutput[];
  onPlayTrack: (track: MusicTrackOutput, all: MusicTrackOutput[]) => void;
  compact: boolean;
}) {
  if (!tracks.length) return <Empty description="暂无曲目" />;
  return (
    <div className="rounded-lg border border-border-base bg-[var(--color-surface-overlay)]">
      <div className="flex items-center gap-3 border-b border-border-base px-3 py-2 text-xs font-medium text-[var(--color-fg-muted)]">
        <span className="w-8 flex-shrink-0 text-center">#</span>
        <span className="min-w-0 flex-1">标题</span>
        <span
          className={`${compact ? "hidden" : "block"} w-[140px] flex-shrink-0`}
        >
          艺术家
        </span>
        <span
          className={`${compact ? "hidden" : "block"} w-[180px] flex-shrink-0`}
        >
          专辑
        </span>
        <span className="w-[50px] flex-shrink-0 text-right">
          <Clock className="ml-auto h-3.5 w-3.5" />
        </span>
      </div>
      <div className="divide-y divide-[var(--color-border-base)]">
        {tracks.map((track, i) => (
          <TrackRow
            key={track.id}
            track={track}
            compact={compact}
            index={i}
            onPlay={() => onPlayTrack(track, tracks)}
          />
        ))}
      </div>
    </div>
  );
}
