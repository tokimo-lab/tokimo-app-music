import { useStandaloneDocumentScroll } from "@tokimo/sdk";
import { Empty, PillTabBar, Spin } from "@tokimo/ui";
import { ArrowLeft, Disc3, ListMusic, Mic2, Search, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import type {
  MusicAlbumOutput,
  MusicArtistOutput,
  MusicTrackOutput,
} from "../lib/types";
import { useContainerWidth, useInfiniteScroll } from "../shared/hooks/hooks";
import { useMusicPlayer, useWindowNav } from "../shell/hooks";
import { AlbumsGrid, ArtistsGrid, TracksTable } from "./MusicBrowseResults";
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

// ── Main Component ─────────────────────────────────────────────────────────────

export default function MusicContent({
  musicId,
  syncing,
  mobile,
  visible,
}: {
  musicId: string;
  syncing?: boolean;
  mobile: boolean;
  visible: boolean;
}) {
  const { navigate } = useWindowNav();
  const documentScroll = useStandaloneDocumentScroll();
  const { playTrack, playTracks } = useMusicPlayer();

  const [tab, setTabRaw] = useState<TabKey>("albums");
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<MusicFilters>(EMPTY_MUSIC_FILTERS);
  const [searching, setSearching] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [containerRef, contentWidth] = useContainerWidth();
  const scrollElement = useRef<HTMLDivElement | null>(null);
  const scrollPosition = useRef(0);
  const compact = mobile || (contentWidth > 0 && contentWidth < 720);
  const compactGrid = mobile || (contentWidth > 0 && contentWidth < 540);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const attachContainer = useCallback(
    (element: HTMLDivElement | null) => {
      containerRef(element);
      scrollElement.current = element;
    },
    [containerRef],
  );

  useEffect(() => {
    if (!visible) return;
    const frame = requestAnimationFrame(() => {
      if (documentScroll) window.scrollTo({ top: scrollPosition.current });
      else if (scrollElement.current)
        scrollElement.current.scrollTop = scrollPosition.current;
    });
    return () => cancelAnimationFrame(frame);
  }, [visible, documentScroll]);

  useEffect(() => {
    if (!visible || !documentScroll) return;
    const recordScroll = () => {
      scrollPosition.current = window.scrollY;
    };
    window.addEventListener("scroll", recordScroll, { passive: true });
    return () => window.removeEventListener("scroll", recordScroll);
  }, [visible, documentScroll]);

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
      enabled: !syncing && visible,
    });

  const resetAll = useCallback(() => {
    reset();
    setPage(1);
  }, [reset]);

  useEffect(() => {
    const next = searchValue.trim();
    if (next === debouncedSearch) return;
    const timer = setTimeout(() => {
      resetAll();
      setDebouncedSearch(next);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchValue, debouncedSearch, resetAll]);

  const openDetail = (route: string, title: string) => {
    scrollPosition.current = documentScroll
      ? window.scrollY
      : (scrollElement.current?.scrollTop ?? 0);
    navigate(route, title);
    if (documentScroll) window.scrollTo({ top: 0 });
  };

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
      if (
        next.sortBy === filters.sortBy &&
        next.genre === filters.genre &&
        next.favorite === filters.favorite
      )
        return;
      setFilters(next);
      resetAll();
    },
    [filters, resetAll],
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
    if (debouncedSearch) resetAll();
  }, [debouncedSearch, resetAll]);

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
    <div
      ref={attachContainer}
      onScroll={(event) => {
        if (visible && !documentScroll)
          scrollPosition.current = event.currentTarget.scrollTop;
      }}
      className={`flex flex-col p-3 sm:p-4 ${documentScroll ? "overflow-visible" : "h-full overflow-y-auto"}`}
    >
      {/* Tab bar / Search bar — sticky */}
      <div
        className={`z-10 -mx-3 -mt-3 sm:-mx-4 sm:-mt-4 mb-0 bg-surface-base px-3 pt-3 pb-3 sm:px-4 sm:pt-4 ${documentScroll ? "relative" : "sticky top-0"}`}
      >
        {searching ? (
          /* ── Search mode: replace tab bar with search input ── */
          <div className="flex justify-center">
            <div className="relative flex w-full max-w-[560px] items-center gap-2 rounded-full border border-white/10 bg-black/20 px-4 py-2 backdrop-blur-xl dark:border-white/[0.06] dark:bg-white/[0.06]">
              <button
                type="button"
                className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-fg-muted transition-colors hover:bg-fill-tertiary hover:text-fg-primary"
                aria-label="关闭搜索"
                onClick={closeSearch}
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
              <input
                ref={searchInputRef}
                type="text"
                className="min-w-0 flex-1 bg-transparent text-sm font-medium outline-none placeholder:text-[var(--color-fg-secondary)]"
                aria-label={searchPlaceholder}
                placeholder={searchPlaceholder}
                value={searchValue}
                onChange={(e) => {
                  setSearchValue(e.target.value);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Escape") closeSearch();
                }}
              />
              {searchValue && (
                <button
                  type="button"
                  className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-fg-muted transition-colors hover:bg-fill-tertiary hover:text-fg-primary"
                  aria-label="清空搜索"
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
          <div className="flex min-w-0 items-center gap-2">
            <div className="min-w-0 flex-1">
              {compact ? (
                <div
                  role="tablist"
                  aria-label="音乐浏览方式"
                  className="flex min-w-0 gap-1 rounded-full bg-fill-tertiary p-1"
                >
                  {tabs.map(({ key, label, icon: Icon }) => (
                    <button
                      key={key}
                      type="button"
                      role="tab"
                      aria-selected={tab === key}
                      onClick={() => {
                        if (key === tab) return;
                        setTab(key);
                        setFilters(EMPTY_MUSIC_FILTERS);
                        resetAll();
                      }}
                      className={`flex min-h-11 min-w-0 flex-1 cursor-pointer items-center justify-center gap-1 rounded-full px-1 text-xs font-medium ${tab === key ? "bg-surface-overlay text-fg-primary shadow-sm" : "text-fg-secondary"}`}
                    >
                      <Icon className="size-3.5 shrink-0" />
                      {label}
                    </button>
                  ))}
                </div>
              ) : (
                <PillTabBar
                  sticky={false}
                  tabs={tabs}
                  activeTab={tab}
                  onTabChange={(next) => {
                    if (next === tab) return;
                    setTab(next);
                    setFilters(EMPTY_MUSIC_FILTERS);
                    resetAll();
                  }}
                />
              )}
            </div>
            <button
              type="button"
              aria-label={searchPlaceholder}
              onClick={openSearch}
              className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-fg-muted hover:bg-fill-tertiary hover:text-fg-primary"
            >
              <Search className="size-5" />
            </button>
          </div>
        )}
      </div>

      {/* Filter Panel */}
      <div
        className={
          compact
            ? ""
            : "rounded-lg border border-base bg-surface-raised px-4 py-3"
        }
      >
        <MusicFilterPanel
          filters={filters}
          onChange={handleFiltersChange}
          genreOptions={genres}
          activeTab={tab}
          mobile={compact}
        />
      </div>

      <div className="mt-3 flex items-center justify-between text-xs text-fg-muted">
        <span>
          {total > 0
            ? `${total} ${tab === "albums" ? "张专辑" : tab === "artists" ? "位艺术家" : "首曲目"}`
            : ""}
        </span>
        {syncing && <span>正在扫描音乐库…</span>}
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
            compact={compactGrid}
            onAlbumClick={(albumId, albumTitle) =>
              openDetail(
                `/library/${musicId}/albums/${albumId}`,
                `TokimoMusic · ${albumTitle}`,
              )
            }
          />
        ) : tab === "artists" ? (
          <ArtistsGrid
            artists={items as MusicArtistOutput[]}
            compact={compactGrid}
            onArtistClick={(artistId, artistName) =>
              openDetail(
                `/library/${musicId}/artists/${artistId}`,
                `TokimoMusic · ${artistName}`,
              )
            }
          />
        ) : (
          <TracksTable
            tracks={items as MusicTrackOutput[]}
            compact={compact}
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
