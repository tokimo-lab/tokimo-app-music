import type {
  MusicAlbumOutput,
  MusicArtistOutput,
  MusicTrackOutput,
} from "../api/client";

export type { MusicAlbumOutput, MusicArtistOutput, MusicTrackOutput };

export type PlayerVisualMode =
  | "vinyl"
  | "bars"
  | "particles"
  | "cover"
  | "lyrics"
  | "circular"
  | "wave"
  | "waveform"
  | "particle"
  | "flame"
  | "terrain"
  | "alchemy"
  | "dna"
  | "tunnel"
  | "ripple"
  | "kaleidoscope"
  | "matrix"
  | "mosaic"
  | "spectrogram"
  | "starfield";

export const PLAYER_VISUAL_MODES: {
  value: PlayerVisualMode;
  label: string;
}[] = [
  { value: "vinyl", label: "黑胶" },
  { value: "bars", label: "频谱柱" },
  { value: "particles", label: "粒子" },
  { value: "cover", label: "封面" },
  { value: "lyrics", label: "歌词" },
  { value: "circular", label: "圆形" },
  { value: "wave", label: "波浪" },
  { value: "waveform", label: "波形" },
  { value: "particle", label: "粒子场" },
  { value: "flame", label: "火焰" },
  { value: "terrain", label: "地形" },
  { value: "alchemy", label: "炼金术" },
  { value: "dna", label: "DNA" },
  { value: "tunnel", label: "隧道" },
  { value: "ripple", label: "涟漪" },
  { value: "kaleidoscope", label: "万花筒" },
  { value: "matrix", label: "矩阵" },
  { value: "mosaic", label: "马赛克" },
  { value: "spectrogram", label: "频谱图" },
  { value: "starfield", label: "星空" },
];

export interface PlayerPrefs {
  playerVisualMode?: PlayerVisualMode;
  playerCoverBg?: boolean;
  playerAlchemyAmbient?: boolean;
  visualMode?: PlayerVisualMode;
  volume?: number;
}

export type RepeatMode = "off" | "all" | "one";

export interface PersonOutput {
  id: string;
  name: string;
  profilePath?: string;
}

export interface CreditOutput {
  id: string;
  role: string;
  person: PersonOutput;
}

export interface WsJobEvent {
  type: "job_update" | string;
  job: {
    id: string;
    appId: string | null;
    status: string;
    progress: number;
    params: Record<string, unknown>;
    data?: Record<string, unknown> | null;
  };
}
