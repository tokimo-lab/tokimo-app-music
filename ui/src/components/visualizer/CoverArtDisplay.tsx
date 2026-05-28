import { cn } from "@tokimo/ui";
import { Disc3 } from "lucide-react";

/**
 * Large album cover display with a subtle pulsing glow effect.
 */
export function CoverArtDisplay({
  coverUrl,
  isPlaying,
  title,
}: {
  coverUrl: string | null;
  isPlaying: boolean;
  title: string;
}) {
  return (
    <div className="relative flex items-center justify-center">
      {/* Glow behind cover */}
      {coverUrl && (
        <div
          className={cn(
            "absolute h-64 w-64 rounded-2xl opacity-40 blur-3xl transition-opacity duration-1000 xl:h-72 xl:w-72",
            isPlaying ? "animate-pulse" : "opacity-20",
          )}
          style={{
            backgroundImage: `url(${coverUrl})`,
            backgroundSize: "cover",
          }}
        />
      )}

      {/* Cover art */}
      <div
        className={cn(
          "relative h-72 w-72 overflow-hidden rounded-2xl shadow-2xl transition-transform duration-700 xl:h-80 xl:w-80",
          isPlaying ? "scale-100" : "scale-95",
        )}
      >
        {coverUrl ? (
          <img
            src={coverUrl}
            alt={title}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-neutral-800">
            <Disc3 className="h-24 w-24 text-fg-muted" />
          </div>
        )}
      </div>
    </div>
  );
}
