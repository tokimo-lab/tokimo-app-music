import { useQueryClient } from "@tanstack/react-query";
import { AppSetupGuide, Spin } from "@tokimo/ui";
import { Disc3, FileMusic, ListMusic, Plus } from "lucide-react";
import { Suspense, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { api } from "@/generated/rust-api";
import { useContainerWidth } from "@/shared/hooks/use-container-width";
import { useSidebarCollapsed } from "@/shared/hooks/use-sidebar-collapsed";
import { useJobProgress } from "@/shared/hooks/use-sync-progress";
import { useWindowActions, useWindowId, useWindowNav } from "@/system";
import { PickCancelled, pickWithBridge } from "@/system/window-bridge";
import MusicContent from "./MusicContent";
import MusicSidebar from "./MusicSidebar";

/** See PHOTO_SCAN_JOB_TYPES. Backend: apps/music/handlers/sync.rs */
const MUSIC_SCAN_JOB_TYPES = ["music_scrape"] as const;

const LoadingFallback = (
  <div className="flex h-full items-center justify-center">
    <Spin />
  </div>
);

export default function MusicApp() {
  const { t } = useTranslation();
  const { LazyViewComponent, params, replace, updateTitle } = useWindowNav();
  const { data: libraries, isLoading } = api.music.list.useQuery();
  const [containerRef, containerWidth] = useContainerWidth();
  const { collapsed: sidebarCollapsed, onToggleCollapse } = useSidebarCollapsed(
    "music",
    containerWidth > 0 && containerWidth < 720,
  );

  const windowId = useWindowId();
  const { openModalWindow } = useWindowActions();

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
  const isDetailPage = !!(params.albumId ?? params.personId);

  const openEditorModal = useCallback(
    async (opts: { musicId?: string } = {}) => {
      const isEdit = !!opts.musicId;
      try {
        const created = await pickWithBridge<{ id: string }>(openModalWindow, {
          component: () =>
            import("@/apps/settings/admin/MusicLibraryEditorWindow"),
          parentWindowId: windowId,
          title: isEdit ? "TokimoMusic · 设置" : "TokimoMusic · 新建音乐库",
          width: 720,
          height: 640,
          noResize: true,
          noMinimize: true,
          metadata: isEdit
            ? ({ musicId: opts.musicId } as Record<string, unknown>)
            : undefined,
        });
        if (!isEdit) {
          replace(`/library/${created.id}`);
        }
      } catch (err) {
        if (err instanceof PickCancelled) return;
        throw err;
      }
    },
    [openModalWindow, windowId, replace],
  );

  useEffect(() => {
    if (!isDetailPage && activeLibrary) {
      updateTitle(`TokimoMusic · ${activeLibrary.name}`);
    }
  }, [activeLibrary, isDetailPage, updateTitle]);

  const handleSelectLibrary = (id: string) => {
    replace(`/library/${id}`);
  };

  // ── Job progress tracking (WS-driven + fallback polling) ──
  const queryClient = useQueryClient();

  const syncProgress = useJobProgress({
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
      <AppSetupGuide
        imageSrc="/page-icons/music.png"
        accentColor="rose"
        title={t("common.setupGuide.getStarted", { name: "TokimoMusic" })}
        description={t("common.setupGuide.musicTagline")}
        features={(
          t("common.setupGuide.musicFeatures", {
            returnObjects: true,
          }) as string[]
        ).map((label, i) => ({
          icon: [FileMusic, Disc3, ListMusic][i],
          label,
        }))}
        actionLabel={t("common.setupGuide.musicAction")}
        actionIcon={Plus}
        onAction={() => {
          void openEditorModal();
        }}
      />
    );
  }

  return (
    <div ref={containerRef} className="relative flex h-full">
      <MusicSidebar
        libraries={libraries}
        activeId={activeLibraryId}
        onSelect={handleSelectLibrary}
        collapsed={sidebarCollapsed}
        onCreateClick={() => {
          void openEditorModal();
        }}
        onSettingsClick={() => {
          if (activeLibraryId) {
            void openEditorModal({ musicId: activeLibraryId });
          }
        }}
        syncProgress={syncProgress}
        onToggleCollapse={onToggleCollapse}
      />
      <div
        className={`relative min-w-0 flex-1 overflow-auto${isDetailPage ? " px-3 py-3 lg:px-4 lg:py-4" : ""}`}
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
    </div>
  );
}
