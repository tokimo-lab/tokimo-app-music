import { Button, Checkbox, Empty, Modal, Spin, Tag } from "@tokiomo/components";
import {
  Clock,
  Disc3,
  FolderSync,
  ListMusic,
  Mic2,
  Pause,
  Play,
  RefreshCw,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { MenuBarConfig } from "@/system";
import { useMenuBar, useMessage, useMusicPlayer, useWindowNav } from "@/system";
import type {
  MusicAlbumOutput,
  MusicArtistOutput,
  MusicTrackOutput,
} from "@/types";
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
export default function MusicAppPage() {
  const { params, navigate: navInWindow } = useWindowNav();
  const id = params.appId as string | undefined;
  const { playTrack, playTracks } = useMusicPlayer();
  const message = useMessage();

  const [tab, setTabRaw] = useState<TabKey>((params.tab as TabKey) || "albums");
  const setTab = useCallback((t: TabKey) => {
    setTabRaw(t);
    setPage(1);
  }, []);

  const [page, setPage] = useState(1);
  const [albumSort, setAlbumSort] = useState<AlbumSortValue>("addedAt");
  const [syncModalOpen, setSyncModalOpen] = useState(false);
  const [syncClearData, setSyncClearData] = useState(false);

  // Reset on library change
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset on id change
  useEffect(() => {
    setPage(1);
  }, [id]);

  const albumSortParams = parseAlbumSort(albumSort);

  const albumsQuery = api.app.listAlbums.useQuery(
    {
      appId: id!,
      page,
      pageSize: PAGE_SIZE,
      ...albumSortParams,
    },
    { enabled: !!id && tab === "albums" },
  );

  const artistsQuery = api.app.listArtists.useQuery(
    {
      appId: id!,
      page,
      pageSize: PAGE_SIZE,
    },
    { enabled: !!id && tab === "artists" },
  );

  const tracksQuery = api.app.listTracks.useQuery(
    {
      appId: id!,
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

  // ── Sync ──────────────────────────────────────────────────────────────────
  const syncMutation = api.app.sync.useMutation({
    onSuccess: () => {
      message.success("同步已开始");
      setPage(1);
      void activeQuery.refetch();
    },
    onError: (e) => message.error(e.message || "同步失败"),
  });

  // ── MenuBar (macOS-style) ─────────────────────────────────────────────────
  const menuBarConfig: MenuBarConfig | null = useMemo(() => {
    if (!id) return null;
    return {
      menus: [
        {
          key: "actions",
          label: "操作",
          items: [
            {
              key: "refresh",
              label: "刷新",
              icon: <RefreshCw size={14} />,
              onClick: () => void activeQuery.refetch(),
            },
            { type: "divider" as const },
            {
              key: "sync",
              label: "同步资料库",
              icon: <FolderSync size={14} />,
              disabled: syncMutation.isPending,
              onClick: () => {
                setSyncClearData(false);
                setSyncModalOpen(true);
              },
            },
          ],
        },
      ],
    };
  }, [id, activeQuery.refetch, syncMutation.isPending]);

  useMenuBar(menuBarConfig);

  return (
    <div className="space-y-3">
      <Modal
        open={syncModalOpen}
        title="同步资料库"
        okText="开始同步"
        cancelText="取消"
        confirmLoading={syncMutation.isPending}
        onCancel={() => setSyncModalOpen(false)}
        onOk={async () => {
          if (!id) return;
          try {
            await syncMutation.mutateAsync({
              id,
              clearData: syncClearData,
            });
          } finally {
            setSyncModalOpen(false);
          }
        }}
      >
        <Checkbox
          checked={syncClearData}
          onChange={(e) => setSyncClearData(e.target.checked)}
        >
          清空数据重新同步
        </Checkbox>
        <p className="mt-2 text-xs text-[var(--text-muted)]">
          勾选后将删除所有音乐数据并重新完整同步，适合修复数据异常。
        </p>
      </Modal>

      {/* Tab bar — iOS 26 style pill, centered */}
      <div className="relative flex items-center justify-center">
        <div className="inline-flex items-center gap-0.5 rounded-full border border-white/10 bg-black/20 p-1 backdrop-blur-xl dark:border-white/[0.06] dark:bg-white/[0.06]">
          {tabs.map((t) => {
            const Icon = t.icon;
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                className={`flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1 text-[13px] font-medium transition-all duration-200 ${
                  active
                    ? "bg-white/90 text-neutral-900 shadow-sm dark:bg-white/15 dark:text-white"
                    : "text-neutral-600 hover:bg-black/5 hover:text-neutral-800 dark:text-neutral-400 dark:hover:bg-white/[0.06] dark:hover:text-neutral-200"
                }`}
                onClick={() => setTab(t.key)}
              >
                <Icon className="h-3.5 w-3.5" />
                {t.label}
              </button>
            );
          })}
        </div>
        {/* Count — right-aligned */}
        <div className="absolute right-4 text-right">
          {total > 0 && <Tag>{total}</Tag>}
        </div>
      </div>

      {/* Sort bar for albums */}
      {tab === "albums" && (
        <div className="flex flex-wrap items-center justify-center gap-1.5">
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
          onAlbumClick={(albumId) => navInWindow("Album", { albumId })}
        />
      ) : tab === "artists" ? (
        <ArtistsGrid
          artists={(artistsQuery.data?.items as MusicArtistOutput[]) ?? []}
          onArtistClick={(artistId) =>
            navInWindow("Artist", { artistPersonId: artistId })
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
  onAlbumClick,
}: {
  albums: MusicAlbumOutput[];
  onAlbumClick: (albumId: string) => void;
}) {
  if (!albums.length) return <Empty description="暂无专辑" />;
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-4">
      {albums.map((album) => (
        <AlbumCard
          key={album.id}
          album={album}
          onClick={() => onAlbumClick(album.id)}
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
  onArtistClick: (artistId: string) => void;
}) {
  if (!artists.length) return <Empty description="暂无艺术家" />;
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-4">
      {artists.map((artist) => (
        <ArtistCard
          key={artist.id}
          artist={artist}
          onClick={() => onArtistClick(artist.id)}
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
