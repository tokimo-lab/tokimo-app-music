import { useQueryClient } from "@tanstack/react-query";
import { useStandaloneDocumentScroll } from "@tokimo/sdk";
import { AppSetupGuide, Spin, useAppSidebarMobile } from "@tokimo/ui";
import { Disc3, FileMusic, ListMusic, Plus } from "lucide-react";
import { Suspense, useCallback, useEffect } from "react";
import { useAppCtx } from "../AppContext";
import { api } from "../api/client";
import { useLibraryItemProgress } from "../hooks/useLibraryItemProgress";
import { registerBridge } from "../modal-bridge";
import { useContainerWidth, useSidebarCollapsed } from "../shared/hooks/hooks";
import { useWindowActions, useWindowNav } from "../shell/hooks";
import MusicContent from "./MusicContent";
import { MusicLayout } from "./MusicLayout";
import MusicSidebar from "./MusicSidebar";

const LoadingFallback = (
  <div className="flex h-full items-center justify-center">
    <Spin />
  </div>
);

export default function MusicApp() {
  const documentScroll = useStandaloneDocumentScroll();
  const { LazyViewComponent, params, replace, updateTitle } = useWindowNav();
  const { data: libraries, isLoading } = api.music.list.useQuery();
  const [containerRef, containerWidth] = useContainerWidth();
  const mobile = useAppSidebarMobile(containerWidth);
  const { collapsed: sidebarCollapsed, onToggleCollapse } =
    useSidebarCollapsed("music");

  const { openModalWindow } = useWindowActions();
  const ctx = useAppCtx();
  const queryClient = useQueryClient();

  const activeLibraryId = params.libraryId ?? null;

  const openEditorModal = useCallback(
    (opts: { musicId?: string } = {}) => {
      const bridgeId = registerBridge({
        kind: "editor",
        shell: ctx.shell,
        musicId: opts.musicId,
        onMutated: () => api.music.list.invalidate(queryClient),
      });
      openModalWindow({
        component: () => import("./MusicLibraryEditorWindow"),
        title: opts.musicId ? "TokimoMusic · 设置" : "TokimoMusic · 新建音乐库",
        width: 720,
        height: 640,
        metadata: { bridgeId },
      });
    },
    [ctx.shell, queryClient, openModalWindow],
  );

  const isDetailPage = !!(params.albumId ?? params.personId);

  useEffect(() => {
    if (!libraries?.length || isDetailPage) return;
    if (params.libraryId) {
      const valid = libraries.some((l) => l.id === params.libraryId);
      if (!valid) replace(`/library/${libraries[0].id}`);
      return;
    }
    replace(`/library/${libraries[0].id}`);
  }, [libraries, params.libraryId, replace, isDetailPage]);

  const activeLibrary = libraries?.find((l) => l.id === activeLibraryId);

  useEffect(() => {
    if (!isDetailPage && activeLibrary) {
      updateTitle(`TokimoMusic · ${activeLibrary.name}`);
    }
  }, [activeLibrary, isDetailPage, updateTitle]);

  const handleSelectLibrary = (id: string) => {
    replace(`/library/${id}`);
  };

  const syncProgress = useLibraryItemProgress(libraries);

  return (
    <div
      ref={containerRef}
      className={`relative flex min-w-0 ${mobile ? "flex-col" : "flex-row"} ${documentScroll ? "min-h-dvh" : "h-full min-h-0"}`}
    >
      {!!libraries?.length && (
        <MusicSidebar
          libraries={libraries}
          mobile={mobile}
          activeId={activeLibraryId}
          onSelect={handleSelectLibrary}
          collapsed={sidebarCollapsed}
          onCreateClick={() => {
            openEditorModal();
          }}
          onSettingsClick={() => {
            if (activeLibraryId) {
              openEditorModal({ musicId: activeLibraryId });
            }
          }}
          syncProgress={syncProgress}
          onToggleCollapse={onToggleCollapse}
        />
      )}
      <div
        className={`relative min-h-0 min-w-0 flex-1 bg-surface-base ${documentScroll ? "overflow-visible" : "overflow-hidden"}`}
      >
        <MusicLayout>
          {isLoading ? (
            LoadingFallback
          ) : !libraries?.length ? (
            <AppSetupGuide
              imageSrc="/api/apps/music/assets/icon.png"
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
                openEditorModal();
              }}
            />
          ) : (
            <>
              {activeLibraryId && activeLibrary && (
                <div
                  className={
                    isDetailPage
                      ? "hidden"
                      : documentScroll
                        ? "app-safe-area-x"
                        : `h-full app-safe-area-x ${mobile ? "" : "app-safe-area-top"}`
                  }
                >
                  <MusicContent
                    key={activeLibraryId}
                    musicId={activeLibraryId}
                    syncing={!!syncProgress[activeLibraryId]?.isActive}
                    mobile={mobile}
                    visible={!isDetailPage}
                  />
                </div>
              )}
              {isDetailPage && LazyViewComponent && (
                <div
                  className={`app-safe-area-x ${documentScroll ? "" : `h-full overflow-y-auto ${mobile ? "" : "app-safe-area-top"}`} [--app-safe-area-padding:0.75rem] lg:[--app-safe-area-padding:1rem]`}
                >
                  <Suspense fallback={LoadingFallback}>
                    <LazyViewComponent />
                  </Suspense>
                </div>
              )}
            </>
          )}
        </MusicLayout>
      </div>
    </div>
  );
}
