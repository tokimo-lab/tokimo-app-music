export function posterThumbUrl(
  posterId: string | null | undefined,
  size: number = 200,
): string | null {
  if (!posterId) return null;
  return `/api/assets/poster/${posterId}?w=${size}&h=${size}&fit=cover`;
}

export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}
