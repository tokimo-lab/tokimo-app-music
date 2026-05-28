import { AppSetupGuide, Spin } from "@tokimo/ui";
import { Disc3, FileMusic, ListMusic, Plus } from "lucide-react";
import { Suspense, useCallback, useEffect } from "react";
import { api } from "../api/client";
import { useContainerWidth } from "../shared/hooks/hooks";
import { useSidebarCollapsed } from "../shared/hooks/hooks";
import { useWindowActions, useWindowId, useWindowNav } from "../shell/hooks";
import { PickCancelled, pickWithBridge } from "../shell/hooks";
import { useLibraryItemProgress } from "../hooks/useLibraryItemProgress";
import MusicContent from "./MusicContent";
import MusicSidebar from "./MusicSidebar";

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

  // TODO: Editor modal is in main repo settings app, not available in sidecar yet
  // const openEditorModal = useCallback(
  //   async (opts: { musicId?: string } = {}) => {
  //     const isEdit = !!opts.musicId;
  //     try {
  //       const created = await pickWithBridge<{ id: string }>(openModalWindow, {
  //         component: () =>
  //           import("@/apps/settings/admin/MusicLibraryEditorWindow"),
  //         parentWindowId: windowId,
  //         title: isEdit ? "TokimoMusic · 设置" : "TokimoMusic · 新建音乐库",
  //         width: 720,
  //         height: 640,
  //         noResize: true,
  //         noMinimize: true,
  //         metadata: isEdit
  //           ? ({ musicId: opts.musicId } as Record<string, unknown>)
  //           : undefined,
  //       });
  //       if (!isEdit) {
  //         replace(`/library/${created.id}`);
  //       }
  //     } catch (err) {
  //       if (err instanceof PickCancelled) return;
  //       throw err;
  //     }
  //   },
  //   [openModalWindow, windowId, replace],
  // );

  useEffect(() => {
    if (!isDetailPage && activeLibrary) {
      updateTitle(`TokimoMusic · ${activeLibrary.name}`);
    }
  }, [activeLibrary, isDetailPage, updateTitle]);

  const handleSelectLibrary = (id: string) => {
    replace(`/library/${id}`);
  };

  const syncProgress = useLibraryItemProgress(libraries);

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
        title="添加音乐库"
        description="连接一个音乐目录后即可浏览专辑、艺术家和曲目。"
        features={[
          { icon: FileMusic, label: "扫描本地音乐文件" },
          { icon: Disc3, label: "按专辑和艺术家整理" },
          { icon: ListMusic, label: "播放队列与歌词" },
        ]}
        actionLabel="添加音乐库"
        actionIcon={Plus}
        onAction={() => {
          // TODO: openEditorModal not available in sidecar yet
          // void openEditorModal();
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
          // TODO: openEditorModal not available in sidecar yet
          // void openEditorModal();
        }}
        onSettingsClick={() => {
          if (activeLibraryId) {
            // TODO: openEditorModal not available in sidecar yet
            // void openEditorModal({ musicId: activeLibraryId });
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
