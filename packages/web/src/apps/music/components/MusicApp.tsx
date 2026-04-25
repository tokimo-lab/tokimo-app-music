import { useQueryClient } from "@tanstack/react-query";
import { Spin } from "@tokimo/ui";
import { Music, Plus } from "lucide-react";
import { Suspense, useEffect, useState } from "react";
import { api } from "@/generated/rust-api";
import { useContainerWidth } from "@/shared/hooks/use-container-width";
import { useSidebarCollapsed } from "@/shared/hooks/use-sidebar-collapsed";
import { useSyncProgress } from "@/shared/hooks/use-sync-progress";
import { useWindowNav } from "@/system";
import MusicContent from "./MusicContent";
import MusicSettingsModal from "./MusicSettingsModal";
import MusicSidebar from "./MusicSidebar";

/** See PHOTO_SCAN_JOB_TYPES. Backend: apps/music/handlers/sync.rs */
const MUSIC_SCAN_JOB_TYPES = ["music_scrape"] as const;

const LoadingFallback = (
  <div className="flex h-full items-center justify-center">
    <Spin />
  </div>
);

export default function MusicApp() {
  const { LazyViewComponent, params, replace, updateTitle } = useWindowNav();
  const { data: libraries, isLoading } = api.music.list.useQuery();
  const [containerRef, containerWidth] = useContainerWidth();
  const { collapsed: sidebarCollapsed, onToggleCollapse } = useSidebarCollapsed(
    "music",
    containerWidth > 0 && containerWidth < 720,
  );
  const [settingsOpen, setSettingsOpen] = useState(false);

  const activeLibraryId = params.libraryId ?? null;

  useEffect(() => {
    if (!libraries?.length) return;
    if (params.libraryId) {
      const valid = libraries.some((l) => l.id === params.libraryId);
      if (!valid) replace(`/library/${libraries[0].id}`);
      return;
    }
    replace(`/library/${libraries[0].id}`);
  }, [libraries, params.libraryId, replace]);

  const activeLibrary = libraries?.find((l) => l.id === activeLibraryId);

  useEffect(() => {
    if (activeLibrary) {
      updateTitle(`TokimoMusic · ${activeLibrary.name}`);
    }
  }, [activeLibrary, updateTitle]);

  const handleSelectLibrary = (id: string) => {
    replace(`/library/${id}`);
  };

  // ── Sync progress tracking (WS-driven + fallback polling) ──
  const queryClient = useQueryClient();

  const syncProgress = useSyncProgress({
    libraries,
    progressQueryKey: (id) => api.music.getSyncProgress.queryKey({ id }),
    fetchProgress: (id) => api.music.getSyncProgress.fetch({ id }),
    scanJobTypes: MUSIC_SCAN_JOB_TYPES,
    onContentRefresh: () => {
      api.music.listAlbums.invalidate(queryClient);
      api.music.listArtists.invalidate(queryClient);
      api.music.listTracks.invalidate(queryClient);
    },
    onLibraryRefresh: () => {
      api.music.list.invalidate(queryClient);
    },
  });

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spin />
      </div>
    );
  }

  if (!libraries?.length) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 px-8 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400">
          <Music className="h-8 w-8" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-fg-primary">
            开始使用 TokimoMusic
          </h2>
          <p className="mt-1 text-sm text-fg-muted">
            创建一个音乐库来管理你的音乐收藏
          </p>
        </div>
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-rose-700"
        >
          <Plus className="h-4 w-4" />
          新建音乐库
        </button>
        <MusicSettingsModal
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
        />
      </div>
    );
  }

  const isDetailPage = !!(params.albumId ?? params.personId);

  return (
    <div ref={containerRef} className="relative flex h-full">
      <MusicSidebar
        libraries={libraries}
        activeId={activeLibraryId}
        onSelect={handleSelectLibrary}
        collapsed={sidebarCollapsed}
        onCreateClick={() => setSettingsOpen(true)}
        onSettingsClick={() => setSettingsOpen(true)}
        syncProgress={syncProgress}
        onToggleCollapse={onToggleCollapse}
      />
      <div
        className={`min-w-0 flex-1 overflow-auto${isDetailPage ? " px-3 py-3 lg:px-4 lg:py-4" : ""}`}
      >
        {isDetailPage && LazyViewComponent ? (
          <Suspense fallback={LoadingFallback}>
            <LazyViewComponent />
          </Suspense>
        ) : (
          activeLibraryId &&
          activeLibrary && (
            <MusicContent
              key={activeLibraryId}
              musicId={activeLibraryId}
              syncing={!!syncProgress[activeLibraryId]?.isActive}
            />
          )
        )}
      </div>
      <MusicSettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
    </div>
  );
}
