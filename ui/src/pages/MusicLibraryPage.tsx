import { Button, Empty, Spin, Tag } from "@tokiomo/components";
import {
  Clock,
  Disc3,
  ListMusic,
  Mic2,
  Pause,
  Play,
  Search,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import type {
  MusicAlbumOutput,
  MusicArtistOutput,
  MusicTrackOutput,
} from "@/types";
import { useMusicPlayer } from "../../contexts/MusicPlayerContext";
import { api } from "../../generated/rust-api";
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
        isActive
          ? "bg-[var(--accent)]/10 dark:bg-[var(--accent)]/20"
          : "hover:bg-neutral-100 dark:hover:bg-neutral-800"
      }`}
      onClick={isActive ? togglePlay : onPlay}
    >
      <span className="w-8 flex-shrink-0 text-center text-sm text-neutral-500 dark:text-neutral-400">
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
          className={`truncate text-sm font-medium ${isActive ? "text-[var(--accent)]" : "text-neutral-900 dark:text-neutral-100"}`}
        >
          {track.title}
        </p>
      </div>
      <span className="hidden w-[140px] flex-shrink-0 truncate text-xs text-neutral-500 dark:text-neutral-400 sm:block">
        {track.artistName || "未知"}
      </span>
      <span className="hidden w-[180px] flex-shrink-0 truncate text-xs text-neutral-500 dark:text-neutral-400 md:block">
        {track.albumTitle || ""}
      </span>
      <span className="w-[50px] flex-shrink-0 text-right text-xs text-neutral-500 dark:text-neutral-400">
        {formatDuration(track.duration)}
      </span>
    </button>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function MusicLibraryPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { playTrack, playTracks } = useMusicPlayer();

  const tab = (searchParams.get("tab") as TabKey) || "albums";
  const setTab = useCallback(
    (t: TabKey) => {
      setSearchParams({ tab: t }, { replace: true });
      setPage(1);
      setSearch("");
    },
    [setSearchParams],
  );

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [albumSort, setAlbumSort] = useState<AlbumSortValue>("addedAt");
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    searchTimerRef.current = setTimeout(() => setDebouncedSearch(search), 300);
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [search]);

  // Reset on library change
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset on id change
  useEffect(() => {
    setPage(1);
    setSearch("");
    setDebouncedSearch("");
  }, [id]);

  const libraryQuery = api.mediaLibrary.getById.useQuery(
    { id: id! },
    { enabled: !!id },
  );

  const albumSortParams = parseAlbumSort(albumSort);

  const albumsQuery = api.mediaLibrary.listAlbums.useQuery(
    {
      libraryId: id!,
      page,
      pageSize: PAGE_SIZE,
      ...albumSortParams,
      search: debouncedSearch || undefined,
    },
    { enabled: !!id && tab === "albums" },
  );

  const artistsQuery = api.mediaLibrary.listArtists.useQuery(
    {
      libraryId: id!,
      page,
      pageSize: PAGE_SIZE,
      search: debouncedSearch || undefined,
    },
    { enabled: !!id && tab === "artists" },
  );

  const tracksQuery = api.mediaLibrary.listTracks.useQuery(
    {
      libraryId: id!,
      page,
      pageSize: PAGE_SIZE,
      search: debouncedSearch || undefined,
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
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <h2 className="text-xl font-bold text-neutral-900 dark:text-neutral-100">
          {libraryQuery.data?.name ?? "音乐库"}
        </h2>
        {total > 0 && <Tag>{total}</Tag>}
      </div>

      {/* Tabs + Search */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-1 rounded-lg border border-[var(--glass-border)] bg-neutral-100 p-1 dark:bg-neutral-800">
          {tabs.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.key}
                type="button"
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  tab === t.key
                    ? "bg-white text-neutral-900 shadow-sm dark:bg-neutral-700 dark:text-neutral-100"
                    : "text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200"
                }`}
                onClick={() => setTab(t.key)}
              >
                <Icon className="h-4 w-4" />
                {t.label}
              </button>
            );
          })}
        </div>

        <div className="relative">
          <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="搜索..."
            className="h-9 w-full rounded-lg border border-[var(--glass-border)] bg-white pr-3 pl-9 text-sm text-neutral-900 outline-none focus:border-[var(--accent)] dark:bg-neutral-800 dark:text-neutral-100 sm:w-64"
          />
        </div>
      </div>

      {/* Sort bar for albums */}
      {tab === "albums" && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-0.5 text-xs text-neutral-400 dark:text-neutral-500">
            排序
          </span>
          {SORT_OPTIONS_ALBUM.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                setAlbumSort(opt.value);
                setPage(1);
              }}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                albumSort === opt.value
                  ? "bg-[var(--accent)] text-white"
                  : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-700"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}

      {/* Content */}
      {isLoading ? (
        <div className="flex h-64 items-center justify-center">
          <Spin />
        </div>
      ) : tab === "albums" ? (
        <AlbumsGrid
          albums={(albumsQuery.data?.items as MusicAlbumOutput[]) ?? []}
          libraryId={id!}
          navigate={navigate}
        />
      ) : tab === "artists" ? (
        <ArtistsGrid
          artists={(artistsQuery.data?.items as MusicArtistOutput[]) ?? []}
          libraryId={id!}
          navigate={navigate}
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
          <span className="text-sm text-neutral-500 dark:text-neutral-400">
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
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function AlbumsGrid({
  albums,
  libraryId,
  navigate,
}: {
  albums: MusicAlbumOutput[];
  libraryId: string;
  navigate: ReturnType<typeof useNavigate>;
}) {
  if (!albums.length) return <Empty description="暂无专辑" />;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8">
      {albums.map((album) => (
        <AlbumCard
          key={album.id}
          album={album}
          onClick={() =>
            navigate(`/dashboard/library/${libraryId}/music/album/${album.id}`)
          }
        />
      ))}
    </div>
  );
}

function ArtistsGrid({
  artists,
  libraryId,
  navigate,
}: {
  artists: MusicArtistOutput[];
  libraryId: string;
  navigate: ReturnType<typeof useNavigate>;
}) {
  if (!artists.length) return <Empty description="暂无艺术家" />;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8">
      {artists.map((artist) => (
        <ArtistCard
          key={artist.id}
          artist={artist}
          onClick={() =>
            navigate(
              `/dashboard/library/${libraryId}/music/artist/${artist.id}`,
            )
          }
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
    <div className="rounded-lg border border-[var(--glass-border)] bg-white dark:bg-gray-800/50">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-[var(--glass-border)] px-3 py-2 text-xs font-medium text-neutral-500 dark:text-neutral-400">
        <span className="w-8 flex-shrink-0 text-center">#</span>
        <span className="min-w-0 flex-1">标题</span>
        <span className="hidden w-[140px] flex-shrink-0 sm:block">艺术家</span>
        <span className="hidden w-[180px] flex-shrink-0 md:block">专辑</span>
        <span className="w-[50px] flex-shrink-0 text-right">
          <Clock className="ml-auto h-3.5 w-3.5" />
        </span>
      </div>
      {/* Rows */}
      <div className="divide-y divide-[var(--glass-border)]">
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
