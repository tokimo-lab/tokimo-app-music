import { posterThumbUrl } from "@tokimo/sdk";
import { cn } from "@tokimo/ui";
import {
  ChartNoAxesColumn,
  ChevronDown,
  ListMusic,
  Maximize,
  Minimize,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { PlayerPrefs, PlayerVisualMode } from "../lib/types";
import { useUiPreference } from "../shared/hooks/hooks";
import { useMusicPlayer } from "../shell/hooks";
import { NowPlayingPanel } from "./NowPlayingPanel";
import { FullScreenLyrics } from "./playback/FullScreenLyrics";
import { MusicQualityMenu } from "./playback/MusicQualityMenu";
import { PlaybackControls } from "./playback/PlaybackControls";
import { PlaybackDebug } from "./playback/PlaybackDebug";
import { PlaybackSeekBar } from "./playback/PlaybackSeekBar";
import { PlaybackVisual } from "./playback/PlaybackVisual";
import { PlaybackVolumeControl } from "./playback/PlaybackVolumeControl";
import {
  trapPlaybackFocus,
  usePlaybackFocus,
  usePlaybackOverlay,
} from "./playback/usePlaybackOverlay";
import { VisualizationPicker } from "./visualizer/VisualizationPicker";
import type { AlchemySceneInfo } from "./visualizer/visualizations";

type MobileView = "cover" | "lyrics" | "visualization";

export function FullScreenPlayer({
  open,
  onClose,
}: {
  open: boolean;
  onClose(): void;
}) {
  const {
    currentTrack,
    isPlaying,
    seek,
    getAnalyser,
    getCurrentTime,
    getDuration,
  } = useMusicPlayer();
  const visible = open && !!currentTrack;
  const { anchorRef, container, viewport } = usePlaybackOverlay(visible);
  const panelRef = usePlaybackFocus(visible, container);
  const playerPref = useUiPreference<PlayerPrefs>("player");
  const [visualMode, setVisualMode] = useState<PlayerVisualMode>(
    () => playerPref.data?.playerVisualMode ?? "vinyl",
  );
  const [coverBgEnabled, setCoverBgEnabled] = useState(
    () => playerPref.data?.playerCoverBg ?? true,
  );
  const [alchemyAmbient, setAlchemyAmbient] = useState(
    () => playerPref.data?.playerAlchemyAmbient ?? false,
  );
  const [pickerOpen, setPickerOpen] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);
  const [mobileView, setMobileView] = useState<MobileView>("cover");
  const [immersive, setImmersive] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [isNarrow, setIsNarrow] = useState(true);
  const [pageVisible, setPageVisible] = useState(
    document.visibilityState !== "hidden",
  );
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const alchemyInfoRef = useRef<AlchemySceneInfo | null>(null);

  const showControls = useCallback(() => {
    setControlsVisible(true);
    clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => setControlsVisible(false), 3000);
  }, []);
  const toggleImmersive = () => {
    setImmersive(!immersive);
    clearTimeout(hideTimerRef.current);
    if (!immersive) showControls();
    else setControlsVisible(true);
  };
  useEffect(() => {
    if (!visible) {
      clearTimeout(hideTimerRef.current);
      setPickerOpen(false);
      setQueueOpen(false);
      setImmersive(false);
      setControlsVisible(true);
    }
    return () => clearTimeout(hideTimerRef.current);
  }, [visible]);
  useEffect(() => {
    const handler = () => setPageVisible(document.visibilityState !== "hidden");
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, []);
  useEffect(() => {
    const panel = panelRef.current;
    if (!visible || !container || !panel) return;
    const update = () => setIsNarrow(panel.clientWidth < 640);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(panel);
    return () => observer.disconnect();
  }, [visible, container, panelRef]);

  const selectVisualMode = (mode: PlayerVisualMode) => {
    setVisualMode(mode);
    setMobileView(
      mode === "lyrics"
        ? "lyrics"
        : mode === "cover"
          ? "cover"
          : "visualization",
    );
    playerPref
      .patch({ playerVisualMode: mode })
      .catch((error: unknown) =>
        console.error("Failed to save music visualization", error),
      );
    setPickerOpen(false);
    if (immersive) showControls();
  };
  const toggleCoverBg = () => {
    const value = !coverBgEnabled;
    setCoverBgEnabled(value);
    playerPref
      .patch({ playerCoverBg: value })
      .catch((error: unknown) =>
        console.error("Failed to save music background", error),
      );
  };
  const toggleAlchemyAmbient = () => {
    const value = !alchemyAmbient;
    setAlchemyAmbient(value);
    playerPref
      .patch({ playerAlchemyAmbient: value })
      .catch((error: unknown) =>
        console.error("Failed to save music ambient effect", error),
      );
  };
  const accentHex = useMemo(
    () =>
      getComputedStyle(document.documentElement)
        .getPropertyValue("--color-accent")
        .trim() || "#10b981",
    [],
  );
  const coverPath = currentTrack?.coverPath;
  const coverUrl = coverPath
    ? coverPath.startsWith("http")
      ? coverPath
      : (posterThumbUrl(coverPath, 600) ?? null)
    : null;
  const selectedMode =
    isNarrow && !immersive && mobileView === "cover" ? "cover" : visualMode;
  const showLyrics = !immersive && (!isNarrow || mobileView === "lyrics");
  const showVisual =
    immersive || (isNarrow ? mobileView !== "lyrics" : visualMode !== "lyrics");
  const lyrics = currentTrack && (
    <FullScreenLyrics
      trackId={currentTrack.id}
      getCurrentTime={getCurrentTime}
      onSeek={seek}
    />
  );
  const visual =
    pageVisible &&
    currentTrack &&
    (selectedMode === "lyrics" ? (
      lyrics
    ) : (
      <PlaybackVisual
        visualMode={selectedMode}
        coverUrl={coverUrl}
        title={currentTrack.title}
        isPlaying={isPlaying}
        getAnalyser={getAnalyser}
        accentHex={accentHex}
        alchemyAmbient={alchemyAmbient}
        onSceneInfo={(info) => {
          alchemyInfoRef.current = info;
        }}
      />
    ));
  const trackInfo = currentTrack && (
    <div className="w-full min-w-0 text-center">
      <h2
        className={cn(
          "truncate font-bold text-white",
          isNarrow ? "text-xl" : "text-2xl",
        )}
      >
        {currentTrack.title}
      </h2>
      <p className="mt-1 truncate text-sm text-white/60">
        {currentTrack.artistName ?? "未知艺术家"}
        {currentTrack.albumTitle && (
          <span className="text-white/40"> · {currentTrack.albumTitle}</span>
        )}
      </p>
    </div>
  );

  return (
    <>
      <span ref={anchorRef} className="hidden" />
      {visible &&
        container &&
        createPortal(
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label="音乐播放器"
            tabIndex={-1}
            onKeyDown={(event) => {
              if (queueOpen || pickerOpen || event.defaultPrevented) return;
              if (event.key === "Escape") {
                event.preventDefault();
                onClose();
              } else trapPlaybackFocus(event);
            }}
            onPointerMove={(event) => {
              if (immersive && event.pointerType === "mouse") showControls();
            }}
            onFocusCapture={() => {
              if (immersive) showControls();
            }}
            className={cn(
              "app-safe-area-screen pointer-events-none inset-0 z-[100] flex flex-col overflow-hidden bg-black/95 text-white backdrop-blur-2xl animate-in slide-in-from-bottom duration-300",
              viewport ? "fixed standalone-app-safe-area" : "absolute",
            )}
          >
            {coverBgEnabled && coverUrl && (
              <>
                <div
                  className="absolute inset-0 scale-110 bg-cover bg-center"
                  style={{ backgroundImage: `url(${coverUrl})` }}
                />
                <div className="absolute inset-0 bg-black/60 backdrop-blur-[80px]" />
              </>
            )}
            <PlaybackDebug
              active={visible && pageVisible}
              visualMode={visualMode}
              alchemyInfoRef={alchemyInfoRef}
            />
            <div
              inert={immersive && !controlsVisible}
              className={cn(
                "app-safe-area-top app-safe-area-x relative z-20 flex shrink-0 items-center justify-between gap-1 pb-2 [--app-safe-area-padding-top:0.5rem] [--app-safe-area-padding-x:1rem] transition-opacity",
                immersive && !controlsVisible && "opacity-0",
              )}
            >
              <button
                type="button"
                onClick={onClose}
                aria-label="收起播放器"
                className="pointer-events-auto flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-white/70 hover:bg-white/10"
              >
                <ChevronDown className="h-6 w-6" />
              </button>
              <p className="min-w-0 flex-1 truncate text-center text-xs text-white/60">
                正在播放
              </p>
              <button
                type="button"
                onClick={() => setQueueOpen(true)}
                aria-label="播放队列"
                className="pointer-events-auto flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-white/70 hover:bg-white/10"
              >
                <ListMusic className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={toggleImmersive}
                aria-label={immersive ? "退出沉浸模式" : "进入沉浸模式"}
                aria-pressed={immersive}
                className="pointer-events-auto flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-white/70 hover:bg-white/10"
              >
                {immersive ? (
                  <Minimize className="h-5 w-5" />
                ) : (
                  <Maximize className="h-5 w-5" />
                )}
              </button>
              <button
                type="button"
                onClick={() => setPickerOpen(true)}
                aria-label="切换可视化效果"
                className="pointer-events-auto flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-white/70 hover:bg-white/10"
              >
                <ChartNoAxesColumn className="h-5 w-5" />
              </button>
            </div>

            {immersive ? (
              <div className="pointer-events-auto absolute inset-0">
                <div className="h-full w-full [&>*]:!h-full [&>*]:!w-full [&>*]:!rounded-none">
                  {visual}
                </div>
                <button
                  type="button"
                  aria-label={controlsVisible ? "隐藏播放控件" : "显示播放控件"}
                  onClick={() => {
                    if (controlsVisible) {
                      clearTimeout(hideTimerRef.current);
                      setControlsVisible(false);
                    } else showControls();
                  }}
                  className="absolute inset-0 cursor-pointer focus-visible:outline-accent"
                />
                <div
                  inert={!controlsVisible}
                  onPointerDown={showControls}
                  className={cn(
                    "app-safe-area-bottom app-safe-area-x absolute inset-x-0 bottom-0 flex max-h-full flex-col items-center gap-2 overflow-y-auto bg-gradient-to-t from-black/90 via-black/60 to-transparent pt-10 [--app-safe-area-padding-bottom:1rem] [--app-safe-area-padding-x:1rem] transition-opacity",
                    !controlsVisible && "pointer-events-none opacity-0",
                  )}
                >
                  <div className="w-full max-w-2xl">{trackInfo}</div>
                  <div className="w-full max-w-2xl">
                    <PlaybackSeekBar
                      getCurrentTime={getCurrentTime}
                      getDuration={getDuration}
                      onSeek={seek}
                      playing={isPlaying}
                    />
                  </div>
                  <PlaybackControls />
                  <MusicQualityMenu />
                  <PlaybackVolumeControl />
                </div>
              </div>
            ) : (
              <div className="pointer-events-auto relative z-10 flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
                {isNarrow && (
                  <div
                    role="tablist"
                    aria-label="播放视图"
                    className="mx-auto flex shrink-0 items-center rounded-full bg-white/10 p-1"
                  >
                    {(
                      [
                        { value: "cover", label: "封面" },
                        { value: "lyrics", label: "歌词" },
                        { value: "visualization", label: "可视化" },
                      ] as const
                    ).map((view) => (
                      <button
                        key={view.value}
                        type="button"
                        role="tab"
                        aria-selected={mobileView === view.value}
                        onClick={() => {
                          setMobileView(view.value);
                          if (
                            view.value === "visualization" &&
                            (visualMode === "cover" || visualMode === "lyrics")
                          )
                            setPickerOpen(true);
                        }}
                        className={cn(
                          "min-h-11 cursor-pointer rounded-full px-4 text-sm",
                          mobileView === view.value
                            ? "bg-white/15 text-white"
                            : "text-white/60",
                        )}
                      >
                        {view.label}
                      </button>
                    ))}
                  </div>
                )}
                <div
                  className={cn(
                    "flex flex-1 items-center",
                    isNarrow
                      ? "min-h-64 px-4 py-4"
                      : "min-h-72 gap-8 px-8 py-4 lg:px-16",
                  )}
                >
                  {showVisual && (
                    <div
                      className={cn(
                        "flex min-w-0 flex-col items-center gap-6",
                        isNarrow ? "w-full" : "w-2/5 shrink-0",
                      )}
                    >
                      <div className="flex w-full items-center justify-center">
                        {visual}
                      </div>
                      {!isNarrow && trackInfo}
                    </div>
                  )}
                  {showLyrics && (
                    <div
                      className={cn(
                        "min-w-0 flex-1",
                        isNarrow ? "h-72" : "h-full min-h-72",
                      )}
                    >
                      {lyrics}
                    </div>
                  )}
                </div>
                <div className="app-safe-area-bottom app-safe-area-x flex shrink-0 flex-col items-center gap-3 pt-2 [--app-safe-area-padding-bottom:1rem] [--app-safe-area-padding-x:1rem] lg:[--app-safe-area-padding-x:4rem]">
                  {isNarrow && trackInfo}
                  <div className="w-full max-w-2xl">
                    <PlaybackSeekBar
                      getCurrentTime={getCurrentTime}
                      getDuration={getDuration}
                      onSeek={seek}
                      playing={isPlaying}
                    />
                  </div>
                  <PlaybackControls />
                  <MusicQualityMenu />
                  <PlaybackVolumeControl />
                </div>
              </div>
            )}
            <VisualizationPicker
              open={pickerOpen}
              currentMode={visualMode}
              onSelect={selectVisualMode}
              coverBgEnabled={coverBgEnabled}
              onToggleCoverBg={toggleCoverBg}
              alchemyAmbientEnabled={alchemyAmbient}
              onToggleAlchemyAmbient={toggleAlchemyAmbient}
              onClose={() => {
                setPickerOpen(false);
                if (immersive) showControls();
              }}
              container={panelRef.current}
            />
            <NowPlayingPanel
              open={queueOpen}
              onClose={() => {
                setQueueOpen(false);
                if (immersive) showControls();
              }}
            />
          </div>,
          container,
        )}
    </>
  );
}
