import type { ReactNode } from "react";
import { MusicMiniPlayer } from "./MusicMiniPlayer";

export function MusicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-full flex-col">
      <div className="min-h-0 flex-1">{children}</div>
      <div className="sticky bottom-[-0.75rem] z-10 -mx-3 -mb-3 lg:bottom-[-1rem] lg:-mx-4 lg:-mb-4">
        <MusicMiniPlayer />
      </div>
    </div>
  );
}
