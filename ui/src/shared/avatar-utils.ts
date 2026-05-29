import { Music as MusicIcon } from "lucide-react";

const AVATAR_COLORS = [
  "#ef4444",
  "#f59e0b",
  "#10b981",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
];

export function getAvatarColor(
  id: string | null | undefined = "music",
): string {
  const seed = id || "music";
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash = hash & hash;
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export function getAvatarIcon(_id?: string | null) {
  return MusicIcon;
}
