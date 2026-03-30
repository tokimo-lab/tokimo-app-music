import type { ReactNode } from "react";
import { MusicMiniPlayer } from "@/shell/player/MusicMiniPlayer";

export function MusicLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <div className="sticky bottom-0 z-10 -mx-3 -mb-3 lg:-mx-4 lg:-mb-4">
        <MusicMiniPlayer />
      </div>
    </>
  );
}
