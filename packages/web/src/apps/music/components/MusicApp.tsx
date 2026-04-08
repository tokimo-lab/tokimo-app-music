import { Empty, Spin } from "@tokiomo/components";
import { Suspense, useEffect, useRef, useState } from "react";
import { api } from "@/generated/rust-api";
import { useContainerWidth } from "@/shared/hooks/use-container-width";
import { useWindowNav } from "@/system";
import MusicContent from "./MusicContent";
import MusicSidebar from "./MusicSidebar";

const STORAGE_KEY = "music-active-library";

const LoadingFallback = (
  <div className="flex h-full items-center justify-center">
    <Spin />
  </div>
);

export default function MusicApp() {
  const { LazyViewComponent, route, navigate, updateTitle } = useWindowNav();
  const { data: libraries, isLoading } = api.music.list.useQuery();
  const [containerRef, containerWidth] = useContainerWidth();
  const sidebarCollapsed = containerWidth > 0 && containerWidth < 720;
  const [activeLibraryId, setActiveLibraryId] = useState<string | null>(null);
  const initialized = useRef(false);

  useEffect(() => {
    if (!libraries?.length || initialized.current) return;
    initialized.current = true;
    const saved = localStorage.getItem(STORAGE_KEY);
    const id =
      saved && libraries.some((l) => l.id === saved) ? saved : libraries[0].id;
    setActiveLibraryId(id);
    localStorage.setItem(STORAGE_KEY, id);
  }, [libraries]);

  const activeLibrary = libraries?.find((l) => l.id === activeLibraryId);

  useEffect(() => {
    if (route === "/" && activeLibrary) {
      updateTitle(`TokimoMusic · ${activeLibrary.name}`);
    }
  }, [route, activeLibrary, updateTitle]);

  const handleSelectLibrary = (id: string) => {
    setActiveLibraryId(id);
    localStorage.setItem(STORAGE_KEY, id);
    if (route !== "/") {
      navigate("/");
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spin />
      </div>
    );
  }

  if (!libraries?.length) {
    return (
      <div className="flex h-full items-center justify-center">
        <Empty description="还没有音乐库，请在系统设置中添加" />
      </div>
    );
  }

  const isDetailPage = route !== "/" && LazyViewComponent;

  return (
    <div
      ref={containerRef}
      className="grid h-full"
      style={{ gridTemplateColumns: `${sidebarCollapsed ? 48 : 200}px 1fr` }}
    >
      <MusicSidebar
        libraries={libraries}
        activeId={activeLibraryId}
        onSelect={handleSelectLibrary}
        collapsed={sidebarCollapsed}
      />
      <div
        className={`min-w-0 flex-1 overflow-auto${isDetailPage ? " px-3 py-3 lg:px-4 lg:py-4" : ""}`}
      >
        {isDetailPage ? (
          <Suspense fallback={LoadingFallback}>
            <LazyViewComponent />
          </Suspense>
        ) : (
          activeLibraryId &&
          activeLibrary && <MusicContent musicId={activeLibraryId} />
        )}
      </div>
    </div>
  );
}
