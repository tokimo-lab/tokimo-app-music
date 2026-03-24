import type { MusicTrackOutput } from "./music-app";

export interface PlaylistOutput {
  id: string;
  name: string;
  description?: string | null;
  coverPath?: string | null;
  isPublic: boolean;
  trackCount: number;
  totalDuration?: number | null;
  createdAt: string;
  updatedAt: string;
}

interface PlaylistItemOutput {
  id: string;
  sortOrder: number;
  addedAt: string;
  track?: MusicTrackOutput | null;
}

export interface PlaylistDetailOutput extends PlaylistOutput {
  items: PlaylistItemOutput[];
}
