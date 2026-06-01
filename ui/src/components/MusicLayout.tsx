import type { ReactNode } from "react";
import { MusicMiniPlayer } from "./MusicMiniPlayer";

export function MusicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-full flex-col overflow-x-hidden">
      <div className="min-h-0 flex-1">{children}</div>
      <div className="sticky bottom-[-0.75rem] z-10 lg:bottom-[-1rem]">
        <MusicMiniPlayer />
      </div>
    </div>
  );
}
