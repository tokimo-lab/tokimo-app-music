import type { CreditOutput, MediaFileOutput } from "./app";

export interface MusicAlbumOutput {
  id: string;
  appId: string;
  title: string;
  sortTitle?: string | null;
  artistName?: string | null;
  year?: number | null;
  albumType?: string | null;
  coverPath?: string | null;
  trackCount: number;
  totalDuration?: number | null;
  genres?: string[];
  isFavorite: boolean;
  mbAlbumId?: string | null;
  spotifyId?: string | null;
  scrapedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MusicTrackOutput {
  id: string;
  albumId: string;
  albumTitle?: string | null;
  title: string;
  artistName?: string | null;
  trackNumber?: number | null;
  discNumber?: number | null;
  duration?: number | null;
  bitrate?: number | null;
  sampleRate?: number | null;
  codec?: string | null;
  genre?: string | null;
  lyricsPath?: string | null;
  coverPath?: string | null;
  fileId?: string | null;
  file?: MediaFileOutput | null;
}

export interface MusicAlbumDetailOutput extends MusicAlbumOutput {
  overview?: string | null;
  releaseDate?: string | null;
  totalDiscs?: number | null;
  tracks?: MusicTrackOutput[];
  credits?: CreditOutput[];
}

export interface MusicArtistOutput {
  id: string;
  name: string;
  profilePath?: string | null;
  albumCount: number;
  trackCount: number;
}

export interface MusicArtistDetailOutput extends MusicArtistOutput {
  biography?: string | null;
  birthday?: string | null;
  birthplace?: string | null;
  originalName?: string | null;
  mbArtistId?: string | null;
  aliases?: string[];
  albums?: MusicAlbumOutput[];
}

export interface TrackLyricsOutput {
  syncedLyrics: string | null;
  plainLyrics: string | null;
}
