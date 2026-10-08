import type { ReactNode } from "react";
import { useMusicPlayer } from "../shell/hooks";
import { MusicMiniPlayer } from "./MusicMiniPlayer";

export function MusicLayout({ children }: { children: ReactNode }) {
  const { currentIndex, currentTrack } = useMusicPlayer();
  const hasPlayer = currentIndex >= 0 && !!currentTrack;
  return (
    <div className="flex min-h-full flex-col">
      <div className={`min-h-0 flex-1 overflow-hidden${hasPlayer ? "" : " app-safe-area-bottom"}`}>{children}</div>
      <div className="sticky bottom-0 z-10">
        <MusicMiniPlayer />
      </div>
    </div>
  );
}
