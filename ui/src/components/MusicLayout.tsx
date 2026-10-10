import { useStandaloneDocumentScroll } from "@tokimo/sdk";
import { cssVar, TOKEN } from "@tokimo/ui";
import type { ReactNode } from "react";
import { useMusicPlayer, useMusicProvider } from "../shell/hooks";
import {
  MUSIC_MINI_PLAYER_HEIGHT_PX,
  MusicMiniPlayer,
} from "./MusicMiniPlayer";

export function MusicLayout({ children }: { children: ReactNode }) {
  useMusicProvider();
  const documentScroll = useStandaloneDocumentScroll();
  const { currentIndex, currentTrack } = useMusicPlayer();
  const hasPlayer = currentIndex >= 0 && !!currentTrack;
  return (
    <div
      className={`flex flex-col ${documentScroll ? "min-h-full" : "h-full min-h-0"}`}
      style={
        documentScroll && hasPlayer
          ? {
              paddingBottom: `calc(${MUSIC_MINI_PLAYER_HEIGHT_PX}px + ${cssVar(TOKEN.appSafeAreaBottom)})`,
            }
          : undefined
      }
    >
      <div
        className={`min-h-0 flex-1 ${documentScroll ? "overflow-visible" : "overflow-hidden"}${hasPlayer ? "" : " app-safe-area-bottom"}`}
      >
        {children}
      </div>
      <div
        className={`${documentScroll ? "fixed inset-x-0" : "relative shrink-0"} bottom-0 z-10`}
      >
        <MusicMiniPlayer />
      </div>
    </div>
  );
}
