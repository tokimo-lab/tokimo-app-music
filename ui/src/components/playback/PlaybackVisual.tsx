import { cn } from "@tokimo/ui";
import { Disc3 } from "lucide-react";
import type { PlayerVisualMode } from "../../lib/types";
import { AudioVisualizer } from "../visualizer/AudioVisualizer";
import { CoverArtDisplay } from "../visualizer/CoverArtDisplay";
import type { AlchemySceneInfo } from "../visualizer/visualizations";
import {
  AlchemyVisualizer,
  CircularVisualizer,
  DnaVisualizer,
  FlameVisualizer,
  KaleidoscopeVisualizer,
  MatrixVisualizer,
  MosaicVisualizer,
  ParticleVisualizer,
  RippleVisualizer,
  SpectrogramVisualizer,
  StarfieldVisualizer,
  TerrainVisualizer,
  TunnelVisualizer,
  WaveformVisualizer,
  WaveVisualizer,
} from "../visualizer/visualizations";

function VinylDisc({
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
      {/* Outer disc */}
      <div
        className={cn(
          "relative h-64 w-64 sm:h-72 sm:w-72 rounded-full bg-gradient-to-br from-neutral-800 via-neutral-900 to-black shadow-2xl xl:h-80 xl:w-80",
          isPlaying ? "animate-[spin_8s_linear_infinite]" : "",
        )}
        style={{ animationPlayState: isPlaying ? "running" : "paused" }}
      >
        {/* Vinyl grooves */}
        <div className="absolute inset-3 rounded-full border border-neutral-700/30" />
        <div className="absolute inset-8 rounded-full border border-neutral-700/20" />
        <div className="absolute inset-14 rounded-full border border-neutral-700/30" />
        <div className="absolute inset-20 rounded-full border border-neutral-700/20" />

        {/* Centre label / album art */}
        <div className="absolute inset-0 m-auto flex h-36 w-36 items-center justify-center overflow-hidden rounded-full border-4 border-neutral-700 bg-neutral-800 xl:h-40 xl:w-40">
          {coverUrl ? (
            <img
              src={coverUrl}
              alt={title}
              className="h-full w-full object-cover"
            />
          ) : (
            <Disc3 className="h-16 w-16 text-fg-muted" />
          )}
        </div>

        {/* Centre hole */}
        <div className="absolute inset-0 m-auto h-4 w-4 rounded-full bg-neutral-950" />
      </div>
    </div>
  );
}

export function PlaybackVisual({
  visualMode,
  coverUrl,
  title,
  isPlaying,
  getAnalyser,
  accentHex,
  alchemyAmbient,
  onSceneInfo,
}: {
  visualMode: PlayerVisualMode;
  coverUrl: string | null;
  title: string;
  isPlaying: boolean;
  getAnalyser: () => AnalyserNode | null;
  accentHex: string;
  alchemyAmbient: boolean;
  onSceneInfo(info: AlchemySceneInfo): void;
}) {
  return (
    <>
      {visualMode === "vinyl" && (
        <VinylDisc coverUrl={coverUrl} isPlaying={isPlaying} title={title} />
      )}
      {visualMode === "bars" && (
        <AudioVisualizer
          getAnalyser={getAnalyser}
          isPlaying={isPlaying}
          accentColor={accentHex}
        />
      )}
      {visualMode === "waveform" && (
        <WaveformVisualizer
          getAnalyser={getAnalyser}
          isPlaying={isPlaying}
          accentColor={accentHex}
        />
      )}
      {visualMode === "circular" && (
        <CircularVisualizer
          getAnalyser={getAnalyser}
          isPlaying={isPlaying}
          accentColor={accentHex}
        />
      )}
      {(visualMode === "particles" || visualMode === "particle") && (
        <ParticleVisualizer
          getAnalyser={getAnalyser}
          isPlaying={isPlaying}
          accentColor={accentHex}
        />
      )}
      {visualMode === "wave" && (
        <WaveVisualizer
          getAnalyser={getAnalyser}
          isPlaying={isPlaying}
          accentColor={accentHex}
        />
      )}
      {visualMode === "spectrogram" && (
        <SpectrogramVisualizer
          getAnalyser={getAnalyser}
          isPlaying={isPlaying}
          accentColor={accentHex}
        />
      )}
      {visualMode === "terrain" && (
        <TerrainVisualizer
          getAnalyser={getAnalyser}
          isPlaying={isPlaying}
          accentColor={accentHex}
        />
      )}
      {visualMode === "matrix" && (
        <MatrixVisualizer
          getAnalyser={getAnalyser}
          isPlaying={isPlaying}
          accentColor={accentHex}
        />
      )}
      {visualMode === "kaleidoscope" && (
        <KaleidoscopeVisualizer
          getAnalyser={getAnalyser}
          isPlaying={isPlaying}
          accentColor={accentHex}
        />
      )}
      {visualMode === "starfield" && (
        <StarfieldVisualizer
          getAnalyser={getAnalyser}
          isPlaying={isPlaying}
          accentColor={accentHex}
        />
      )}
      {visualMode === "ripple" && (
        <RippleVisualizer
          getAnalyser={getAnalyser}
          isPlaying={isPlaying}
          accentColor={accentHex}
        />
      )}
      {visualMode === "flame" && (
        <FlameVisualizer
          getAnalyser={getAnalyser}
          isPlaying={isPlaying}
          accentColor={accentHex}
        />
      )}
      {visualMode === "dna" && (
        <DnaVisualizer
          getAnalyser={getAnalyser}
          isPlaying={isPlaying}
          accentColor={accentHex}
        />
      )}
      {visualMode === "mosaic" && (
        <MosaicVisualizer
          getAnalyser={getAnalyser}
          isPlaying={isPlaying}
          accentColor={accentHex}
        />
      )}
      {visualMode === "tunnel" && (
        <TunnelVisualizer
          getAnalyser={getAnalyser}
          isPlaying={isPlaying}
          accentColor={accentHex}
        />
      )}
      {visualMode === "alchemy" && (
        <AlchemyVisualizer
          getAnalyser={getAnalyser}
          isPlaying={isPlaying}
          accentColor={accentHex}
          ambientBgEnabled={alchemyAmbient}
          onSceneInfo={onSceneInfo}
        />
      )}
      {visualMode === "cover" && (
        <CoverArtDisplay
          coverUrl={coverUrl}
          isPlaying={isPlaying}
          title={title}
        />
      )}
    </>
  );
}
