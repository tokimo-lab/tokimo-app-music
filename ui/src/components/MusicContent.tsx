import { Empty, PillTabBar, Spin, Tag } from "@tokimo/ui";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Clock,
  Disc3,
  ListMusic,
  Mic2,
  Pause,
  Play,
  Search,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import type {
  MusicAlbumOutput,
  MusicArtistOutput,
  MusicTrackOutput,
} from "../lib/types";
import { AlbumCard, ArtistCard, formatDuration } from "../pages/music-shared";
import { useInfiniteScroll } from "../shared/hooks/hooks";
import { useMusicPlayer, useWindowNav } from "../shell/hooks";
import type { MusicFilters } from "./MusicFilterPanel";
import MusicFilterPanel, { EMPTY_MUSIC_FILTERS } from "./MusicFilterPanel";

type TabKey = "albums" | "artists" | "tracks";

function parseSortValue(v: string) {
  if (v === "title_asc") return { sortBy: "title", sortDir: "asc" };
  if (v === "title_desc") return { sortBy: "title", sortDir: "desc" };
  if (v === "year_desc") return { sortBy: "year", sortDir: "desc" };
  if (v === "year_asc") return { sortBy: "year", sortDir: "asc" };
  if (v === "name_asc") return { sortBy: "name", sortDir: "asc" };
  if (v === "name_desc") return { sortBy: "name", sortDir: "desc" };
  return { sortBy: "addedAt", sortDir: "desc" };
}

const PAGE_SIZE = 60;

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
        isActive ? "bg-[var(--color-accent)]/10" : "hover:bg-[var(--color-fill-tertiary)]"
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
      </div>
      <span className="hidden w-[140px] flex-shrink-0 truncate text-xs text-[var(--color-fg-muted)] sm:block">
        {track.artistName || "未知"}
      </span>
      <span className="hidden w-[180px] flex-shrink-0 truncate text-xs text-[var(--color-fg-muted)] md:block">
        {track.albumTitle || ""}
      </span>
      <span className="w-[50px] flex-shrink-0 text-right text-xs text-[var(--color-fg-muted)]">
        {formatDuration(track.duration)}
      </span>
    </button>
  );
}

// ── Grid Components ───────────────────────────────────────────────────────────

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

function TracksTable({
  tracks,
  onPlayTrack,
}: {
  tracks: MusicTrackOutput[];
  onPlayTrack: (track: MusicTrackOutput, all: MusicTrackOutput[]) => void;
}) {
  if (!tracks.length) return <Empty description="暂无曲目" />;
  return (
    <div className="rounded-lg border border-border-base bg-[var(--color-surface-overlay)]">
      <div className="flex items-center gap-3 border-b border-border-base px-3 py-2 text-xs font-medium text-[var(--color-fg-muted)]">
        <span className="w-8 flex-shrink-0 text-center">#</span>
        <span className="min-w-0 flex-1">标题</span>
        <span className="hidden w-[140px] flex-shrink-0 sm:block">艺术家</span>
        <span className="hidden w-[180px] flex-shrink-0 md:block">专辑</span>
        <span className="w-[50px] flex-shrink-0 text-right">
          <Clock className="ml-auto h-3.5 w-3.5" />
        </span>
      </div>
      <div className="divide-y divide-[var(--color-border-base)]">
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

// ── Main Component ─────────────────────────────────────────────────────────────

export default function MusicContent({
  musicId,
  syncing,
}: {
  musicId: string;
  syncing?: boolean;
}) {
  const { navigate } = useWindowNav();
  const { playTrack, playTracks } = useMusicPlayer();

  const [tab, setTabRaw] = useState<TabKey>("albums");
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<MusicFilters>(EMPTY_MUSIC_FILTERS);
  const [searching, setSearching] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchValue.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchValue]);

  // Reset on library change
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset on musicId change
  useEffect(() => {
    setPage(1);
    setTabRaw("albums");
    setFilters(EMPTY_MUSIC_FILTERS);
    setSearching(false);
    setSearchValue("");
  }, [musicId]);

  const setTab = useCallback((t: TabKey) => {
    setTabRaw(t);
    setPage(1);
  }, []);

  const sortParams = parseSortValue(filters.sortBy || "addedAt");

  // Genres query
  const genresQuery = api.music.listGenres.useQuery(
    { id: musicId },
    { enabled: !!musicId },
  );
  const genres = genresQuery.data ?? [];

  const albumsQuery = api.music.listAlbums.useQuery(
    {
      id: musicId,
      page,
      pageSize: PAGE_SIZE,
      ...sortParams,
      genre: filters.genre || undefined,
      search: debouncedSearch || undefined,
      favorite: filters.favorite === "true" ? true : undefined,
    },
    { enabled: tab === "albums" },
  );

  const artistsQuery = api.music.listArtists.useQuery(
    {
      id: musicId,
      page,
      pageSize: PAGE_SIZE,
      ...sortParams,
      search: debouncedSearch || undefined,
    },
    { enabled: tab === "artists" },
  );

  const tracksQuery = api.music.listTracks.useQuery(
    {
      id: musicId,
      page,
      pageSize: PAGE_SIZE,
      ...sortParams,
      genre: filters.genre || undefined,
      search: debouncedSearch || undefined,
    },
    { enabled: tab === "tracks" },
  );

  const activeQuery =
    tab === "albums"
      ? albumsQuery
      : tab === "artists"
        ? artistsQuery
        : tracksQuery;

  type AnyMusicItem = MusicAlbumOutput | MusicArtistOutput | MusicTrackOutput;

  const { items, total, hasMore, sentinelRef, reset } =
    useInfiniteScroll<AnyMusicItem>({
      queryData: activeQuery.data as
        | { items: AnyMusicItem[]; total: number; page: number }
        | undefined,
      isFetching: activeQuery.isFetching,
      onLoadMore: () => setPage((p) => p + 1),
      enabled: !syncing,
    });

  const resetAll = useCallback(() => {
    reset();
    setPage(1);
  }, [reset]);

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

  const handleFiltersChange = useCallback(
    (next: MusicFilters) => {
      setFilters(next);
      resetAll();
    },
    [resetAll],
  );

  const openSearch = useCallback(() => {
    setSearching(true);
    // Focus the input after React renders it
    requestAnimationFrame(() => searchInputRef.current?.focus());
  }, []);

  const closeSearch = useCallback(() => {
    setSearching(false);
    setSearchValue("");
    setDebouncedSearch("");
    resetAll();
  }, [resetAll]);

  const tabs: { key: TabKey; label: string; icon: typeof Disc3 }[] = [
    { key: "albums", label: "专辑", icon: Disc3 },
    { key: "artists", label: "艺术家", icon: Mic2 },
    { key: "tracks", label: "曲目", icon: ListMusic },
  ];

  const searchPlaceholder =
    tab === "albums"
      ? "搜索专辑"
      : tab === "artists"
        ? "搜索艺术家"
        : "搜索曲目";

  return (
    <div className="flex h-full flex-col overflow-y-auto p-4">
      {/* Tab bar / Search bar — sticky */}
      <div className="sticky top-0 z-10 -mx-4 -mt-4 mb-0 bg-surface-base px-4 pt-4 pb-3">
        {searching ? (
          /* ── Search mode: replace tab bar with search input ── */
          <div className="flex justify-center">
            <div className="relative flex w-full max-w-[560px] items-center gap-2 rounded-full border border-white/10 bg-black/20 px-4 py-2 backdrop-blur-xl dark:border-white/[0.06] dark:bg-white/[0.06]">
              <button
                type="button"
                className="cursor-pointer text-fg-muted transition-colors hover:text-fg-primary"
                onClick={closeSearch}
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
              <input
                ref={searchInputRef}
                type="text"
                className="flex-1 bg-transparent text-sm font-medium outline-none placeholder:text-[var(--color-fg-secondary)]"
                placeholder={searchPlaceholder}
                value={searchValue}
                onChange={(e) => {
                  setSearchValue(e.target.value);
                  resetAll();
                }}
                onKeyDown={(e) => {
                  if (e.key === "Escape") closeSearch();
                }}
              />
              {searchValue && (
                <button
                  type="button"
                  className="cursor-pointer text-fg-muted transition-colors hover:text-fg-primary"
                  onClick={() => {
                    setSearchValue("");
                    setDebouncedSearch("");
                    resetAll();
                    searchInputRef.current?.focus();
                  }}
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        ) : (
          /* ── Normal mode: tab bar with search button ── */
          <PillTabBar
            tabs={tabs}
            activeTab={tab}
            onTabChange={(t) => {
              setTab(t);
              setFilters(EMPTY_MUSIC_FILTERS);
              resetAll();
            }}
            trailing={
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="cursor-pointer rounded-full p-1.5 text-fg-muted transition-colors hover:bg-white/10 hover:text-fg-primary"
                  onClick={openSearch}
                >
                  <Search className="h-4 w-4" />
                </button>
                {total > 0 && <Tag>{total}</Tag>}
              </div>
            }
          />
        )}
      </div>

      {/* Filter Panel */}
      <div className="rounded-lg border border-white/8 bg-black/20 px-4 py-3 backdrop-blur-md">
        <MusicFilterPanel
          filters={filters}
          onChange={handleFiltersChange}
          genreOptions={genres}
          activeTab={tab}
        />
      </div>

      <div className="mt-3 min-h-0 flex-1 space-y-3">
        {(isLoading || syncing) && items.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <Spin />
          </div>
        ) : items.length === 0 ? (
          <Empty
            description={
              debouncedSearch || filters.genre || filters.favorite
                ? "没有匹配结果"
                : undefined
            }
          />
        ) : tab === "albums" ? (
          <AlbumsGrid
            albums={items as MusicAlbumOutput[]}
            onAlbumClick={(albumId, albumTitle) =>
              navigate(
                `/library/${musicId}/albums/${albumId}`,
                `TokimoMusic · ${albumTitle}`,
              )
            }
          />
        ) : tab === "artists" ? (
          <ArtistsGrid
            artists={items as MusicArtistOutput[]}
            onArtistClick={(artistId, artistName) =>
              navigate(
                `/library/${musicId}/artists/${artistId}`,
                `TokimoMusic · ${artistName}`,
              )
            }
          />
        ) : (
          <TracksTable
            tracks={items as MusicTrackOutput[]}
            onPlayTrack={handlePlayTrack}
          />
        )}

        <div ref={sentinelRef} className="h-px" />
        <div className="flex justify-center py-3">
          {activeQuery.isFetching && <Spin />}
          {!hasMore && total > 0 && !activeQuery.isFetching && (
            <p className="text-xs text-fg-muted">已加载全部</p>
          )}
        </div>
      </div>
    </div>
  );
}
