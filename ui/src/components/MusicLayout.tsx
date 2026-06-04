import type { ReactNode } from "react";
import { MusicMiniPlayer } from "./MusicMiniPlayer";

export function MusicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-full flex-col">
      <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
      <div className="sticky bottom-0 z-10">
        <MusicMiniPlayer />
      </div>
    </div>
  );
}
