import { Button, Empty, PillTabBar, Spin, Tag } from "@tokimo/ui";
import {
  ArrowDownUp,
  Clock,
  Disc3,
  ListMusic,
  Mic2,
  Pause,
  Play,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { api } from "../api/client";
import { MusicLayout } from "../components/MusicLayout";
import type {
  MusicAlbumOutput,
  MusicArtistOutput,
  MusicTrackOutput,
} from "../lib/types";
import { useMusicPlayer, useWindowNav } from "../shell/hooks";
import { AlbumCard, ArtistCard, formatDuration } from "./music-shared";

type TabKey = "albums" | "artists" | "tracks";

const SORT_OPTIONS_ALBUM = [
  { label: "最近添加", value: "addedAt" },
  { label: "标题 A-Z", value: "title_asc" },
  { label: "年份 最新", value: "year_desc" },
] as const;

type AlbumSortValue = (typeof SORT_OPTIONS_ALBUM)[number]["value"];

function parseAlbumSort(v: AlbumSortValue) {
  if (v === "title_asc")
    return { sortBy: "title" as const, sortDir: "asc" as const };
  if (v === "year_desc")
    return { sortBy: "year" as const, sortDir: "desc" as const };
  return { sortBy: "addedAt" as const, sortDir: "desc" as const };
}

const PAGE_SIZE = 60;

// ── Tracks Table ──────────────────────────────────────────────────────────────
function TrackRow({
  track,
  index,
  onPlay,
}: {
  track: MusicTrackOutput;
  index: number;
  onPlay: () => void;
}) {
  const { currentTrack, isPlaying, togglePlay } = useMusicPlayer();
  const isActive = currentTrack?.id === track.id;

  return (
    <button
      type="button"
      className={`group flex w-full cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-left transition-colors ${
        isActive ? "bg-[var(--accent)]/10" : "hover:bg-[var(--fill-tertiary)]"
      }`}
      onClick={isActive ? togglePlay : onPlay}
    >
      <span className="w-8 flex-shrink-0 text-center text-sm text-[var(--text-muted)]">
        {isActive ? (
          isPlaying ? (
            <Pause className="mx-auto h-4 w-4 text-[var(--accent)]" />
          ) : (
            <Play
              className="mx-auto h-4 w-4 text-[var(--accent)]"
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
          className={`truncate text-sm font-medium ${isActive ? "text-[var(--accent)]" : "text-[var(--text-primary)]"}`}
        >
          {track.title}
        </p>
      </div>
      <span className="hidden w-[140px] flex-shrink-0 truncate text-xs text-[var(--text-muted)] sm:block">
        {track.artistName || "未知"}
      </span>
      <span className="hidden w-[180px] flex-shrink-0 truncate text-xs text-[var(--text-muted)] md:block">
        {track.albumTitle || ""}
      </span>
      <span className="w-[50px] flex-shrink-0 text-right text-xs text-[var(--text-muted)]">
        {formatDuration(track.duration)}
      </span>
    </button>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function MusicAppPage() {
  const { metadata, navigate, updateMetadata } = useWindowNav();
  const id = metadata.appId as string | undefined;
  const { playTrack, playTracks } = useMusicPlayer();

  const [tab, setTabRaw] = useState<TabKey>(
    (metadata.tab as TabKey) || "albums",
  );
  const setTab = useCallback(
    (t: TabKey) => {
      setTabRaw(t);
      setPage(1);
      updateMetadata({ tab: t });
    },
    [updateMetadata],
  );

  const [page, setPage] = useState(1);
  const [albumSort, setAlbumSort] = useState<AlbumSortValue>("addedAt");

  // Reset on library change
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset on id change
  useEffect(() => {
    setPage(1);
  }, [id]);

  const albumSortParams = parseAlbumSort(albumSort);

  const albumsQuery = api.music.listAlbums.useQuery(
    {
      id: id!,
      page,
      pageSize: PAGE_SIZE,
      ...albumSortParams,
    },
    { enabled: !!id && tab === "albums" },
  );

  const artistsQuery = api.music.listArtists.useQuery(
    {
      id: id!,
      page,
      pageSize: PAGE_SIZE,
    },
    { enabled: !!id && tab === "artists" },
  );

  const tracksQuery = api.music.listTracks.useQuery(
    {
      id: id!,
      page,
      pageSize: PAGE_SIZE,
    },
    { enabled: !!id && tab === "tracks" },
  );

  const activeQuery =
    tab === "albums"
      ? albumsQuery
      : tab === "artists"
        ? artistsQuery
        : tracksQuery;
  const total = activeQuery.data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const isLoading = activeQuery.isLoading;

  const handlePlayTrack = useCallback(
    (track: MusicTrackOutput, allTracks: MusicTrackOutput[]) => {
      const idx = allTracks.findIndex((t) => t.id === track.id);
      if (idx >= 0) {
        playTracks(allTracks, idx);
      } else {
        playTrack(track);
      }
    },
    [playTrack, playTracks],
  );

  const tabs: { key: TabKey; label: string; icon: typeof Disc3 }[] = [
    { key: "albums", label: "专辑", icon: Disc3 },
    { key: "artists", label: "艺术家", icon: Mic2 },
    { key: "tracks", label: "曲目", icon: ListMusic },
  ];

  return (
    <MusicLayout>
      <div>
        <PillTabBar
          tabs={tabs}
          activeTab={tab}
          onTabChange={setTab}
          sort={
            tab === "albums"
              ? {
                  options: SORT_OPTIONS_ALBUM,
                  value: albumSort,
                  onChange: (v) => {
                    setAlbumSort(v as AlbumSortValue);
                    setPage(1);
                  },
                  activeIcon: <ArrowDownUp className="h-3.5 w-3.5" />,
                }
              : undefined
          }
          trailing={total > 0 ? <Tag>{total}</Tag> : undefined}
        />

        <div className="mt-3 space-y-3">
          {/* Content */}
          {isLoading ? (
            <div className="flex h-64 items-center justify-center">
              <Spin />
            </div>
          ) : tab === "albums" ? (
            <AlbumsGrid
              albums={(albumsQuery.data?.items as MusicAlbumOutput[]) ?? []}
              onAlbumClick={(albumId, albumTitle) =>
                navigate(`/albums/${albumId}`, `TokimoMusic · ${albumTitle}`)
              }
            />
          ) : tab === "artists" ? (
            <ArtistsGrid
              artists={(artistsQuery.data?.items as MusicArtistOutput[]) ?? []}
              onArtistClick={(artistId, artistName) =>
                navigate(`/artists/${artistId}`, `TokimoMusic · ${artistName}`)
              }
            />
          ) : (
            <TracksTable
              tracks={(tracksQuery.data?.items as MusicTrackOutput[]) ?? []}
              onPlayTrack={handlePlayTrack}
            />
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pb-4">
              <Button
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                上一页
              </Button>
              <span className="text-sm text-[var(--text-muted)]">
                {page} / {totalPages}
              </span>
              <Button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                下一页
              </Button>
            </div>
          )}
        </div>
      </div>
    </MusicLayout>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function AlbumsGrid({
  albums,
  onAlbumClick,
}: {
  albums: MusicAlbumOutput[];
  onAlbumClick: (albumId: string, albumTitle: string) => void;
}) {
  if (!albums.length) return <Empty description="暂无专辑" />;
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-4">
      {albums.map((album) => (
        <AlbumCard
          key={album.id}
          album={album}
          onClick={() => onAlbumClick(album.id, album.title ?? "Album")}
        />
      ))}
    </div>
  );
}

function ArtistsGrid({
  artists,
  onArtistClick,
}: {
  artists: MusicArtistOutput[];
  onArtistClick: (artistId: string, artistName: string) => void;
}) {
  if (!artists.length) return <Empty description="暂无艺术家" />;
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-4">
      {artists.map((artist) => (
        <ArtistCard
          key={artist.id}
          artist={artist}
          onClick={() => onArtistClick(artist.id, artist.name ?? "Artist")}
        />
      ))}
    </div>
  );
}

function TracksTable({
  tracks,
  onPlayTrack,
}: {
  tracks: MusicTrackOutput[];
  onPlayTrack: (track: MusicTrackOutput, all: MusicTrackOutput[]) => void;
}) {
  if (!tracks.length) return <Empty description="暂无曲目" />;
  return (
    <div className="rounded-lg border border-border-base bg-[var(--bg-glass)]">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-border-base px-3 py-2 text-xs font-medium text-[var(--text-muted)]">
        <span className="w-8 flex-shrink-0 text-center">#</span>
        <span className="min-w-0 flex-1">标题</span>
        <span className="hidden w-[140px] flex-shrink-0 sm:block">艺术家</span>
        <span className="hidden w-[180px] flex-shrink-0 md:block">专辑</span>
        <span className="w-[50px] flex-shrink-0 text-right">
          <Clock className="ml-auto h-3.5 w-3.5" />
        </span>
      </div>
      {/* Rows */}
      <div className="divide-y divide-[var(--border-base)]">
        {tracks.map((track, i) => (
          <TrackRow
            key={track.id}
            track={track}
            index={i}
            onPlay={() => onPlayTrack(track, tracks)}
          />
        ))}
      </div>
    </div>
  );
}
