/**
 * MusicBrainz API v2 客户端
 * https://musicbrainz.org/doc/MusicBrainz_API
 *
 * 限制：1 request/second，User-Agent 必须包含应用名和联系方式
 */

import type { MusicMatchCandidate, MusicMatchDetail } from "@acme/types";

const MB_BASE_URL = "https://musicbrainz.org/ws/2";
const CAA_BASE_URL = "https://coverartarchive.org";
const USER_AGENT = "nex-media/1.0 (https://github.com/nex-media)";

/** 简单的速率限制：每次请求间隔至少 1100ms */
let lastRequestTime = 0;

const throttle = async () => {
  const now = Date.now();
  const wait = Math.max(0, lastRequestTime + 1100 - now);
  if (wait > 0) {
    await new Promise((r) => setTimeout(r, wait));
  }
  lastRequestTime = Date.now();
};

const mbFetch = async (path: string, params: Record<string, string> = {}) => {
  await throttle();
  const url = new URL(`${MB_BASE_URL}${path}`);
  url.searchParams.set("fmt", "json");
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  const res = await fetch(url.toString(), {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`MusicBrainz API error: ${res.status} ${res.statusText}`);
  }
  return res.json();
};

/** 从 artist-credit 中提取主艺术家名 */
const extractArtistName = (
  credits: Array<{ name?: string; artist?: { name?: string; id?: string } }>,
): { name: string; mbId?: string } => {
  if (!credits?.length) return { name: "Unknown Artist" };
  const parts = credits.map((c) => c.name || c.artist?.name || "");
  return {
    name: parts.join(""),
    mbId: credits[0]?.artist?.id,
  };
};

export class MusicBrainzClient {
  /**
   * 搜索 release（专辑）
   * @param artist 艺术家名
   * @param album 专辑名
   * @param limit 结果数限制
   */
  async searchRelease(
    artist: string,
    album: string,
    limit = 10,
  ): Promise<MusicMatchCandidate[]> {
    const query = `release:"${album}" AND artist:"${artist}"`;
    const data = await mbFetch("/release", {
      query,
      limit: String(limit),
    });

    const releases: Record<string, unknown>[] = data.releases ?? [];
    return releases.map((r) => {
      const artistInfo = extractArtistName(
        r["artist-credit"] as Array<{
          name?: string;
          artist?: { name?: string; id?: string };
        }>,
      );
      const date = r.date as string | undefined;
      const year = date ? Number.parseInt(date.substring(0, 4), 10) : undefined;

      return {
        mbReleaseId: r.id as string,
        title: r.title as string,
        artist: artistInfo.name,
        year: year && !Number.isNaN(year) ? year : null,
        trackCount: (r["track-count"] as number) ?? null,
        country: (r.country as string) ?? null,
        format: null, // media format not in search results
        score: (r.score as number) ?? null,
      };
    });
  }

  /**
   * 仅按关键字搜索 release（手动搜索用）
   */
  async searchReleaseByKeyword(
    keyword: string,
    limit = 10,
  ): Promise<MusicMatchCandidate[]> {
    const data = await mbFetch("/release", {
      query: keyword,
      limit: String(limit),
    });

    const releases: Record<string, unknown>[] = data.releases ?? [];
    return releases.map((r) => {
      const artistInfo = extractArtistName(
        r["artist-credit"] as Array<{
          name?: string;
          artist?: { name?: string; id?: string };
        }>,
      );
      const date = r.date as string | undefined;
      const year = date ? Number.parseInt(date.substring(0, 4), 10) : undefined;

      return {
        mbReleaseId: r.id as string,
        title: r.title as string,
        artist: artistInfo.name,
        year: year && !Number.isNaN(year) ? year : null,
        trackCount: (r["track-count"] as number) ?? null,
        country: (r.country as string) ?? null,
        format: null,
        score: (r.score as number) ?? null,
      };
    });
  }

  /**
   * 获取 release 详情（含曲目、艺术家信用、流派）
   */
  async getRelease(mbReleaseId: string): Promise<MusicMatchDetail> {
    const data = await mbFetch(`/release/${mbReleaseId}`, {
      inc: "recordings+artist-credits+release-groups+genres+labels",
    });

    const artistInfo = extractArtistName(data["artist-credit"] ?? []);
    const rg = data["release-group"] ?? {};
    const date = data.date as string | undefined;
    const year = date ? Number.parseInt(date.substring(0, 4), 10) : undefined;

    // 提取流派
    const genres: string[] = [
      ...((rg.genres ?? []) as Array<{ name: string }>).map((g) => g.name),
      ...((data.genres ?? []) as Array<{ name: string }>).map((g) => g.name),
    ];
    const uniqueGenres = [...new Set(genres)];

    // 提取曲目
    const media: Array<{
      "track-count"?: number;
      tracks?: Array<Record<string, unknown>>;
    }> = data.media ?? [];
    let totalTracks = 0;
    const tracks: Array<{
      number: number;
      title: string;
      duration?: number | null;
    }> = [];
    for (const disc of media) {
      totalTracks += disc["track-count"] ?? 0;
      for (const t of disc.tracks ?? []) {
        tracks.push({
          number: t.position as number,
          title: t.title as string,
          duration: (t.length as number)
            ? Math.round((t.length as number) / 1000)
            : null,
        });
      }
    }

    // 封面 URL
    const rgId = rg.id as string | undefined;
    const coverUrl = rgId
      ? `${CAA_BASE_URL}/release-group/${rgId}/front-500`
      : null;

    return {
      mbReleaseId: data.id as string,
      mbReleaseGroupId: rgId ?? null,
      title: data.title as string,
      artist: artistInfo.name,
      artistMbId: artistInfo.mbId ?? null,
      year: year && !Number.isNaN(year) ? year : null,
      releaseDate: date ?? null,
      albumType: (rg["primary-type"] as string)?.toLowerCase() ?? null,
      genres: uniqueGenres.length > 0 ? uniqueGenres : null,
      totalTracks: totalTracks || null,
      totalDiscs: media.length || null,
      coverUrl,
      overview: null, // MB doesn't have album descriptions
      spotifyId: null,
      tracks: tracks.length > 0 ? tracks : null,
    };
  }

  /**
   * 搜索艺术家
   */
  async searchArtist(
    name: string,
    limit = 5,
  ): Promise<Array<{ mbId: string; name: string; type?: string }>> {
    const data = await mbFetch("/artist", {
      query: `artist:"${name}"`,
      limit: String(limit),
    });
    const artists: Record<string, unknown>[] = data.artists ?? [];
    return artists.map((a) => ({
      mbId: a.id as string,
      name: a.name as string,
      type: (a.type as string) ?? undefined,
    }));
  }

  /**
   * 获取 Cover Art Archive 封面链接
   */
  getReleaseGroupCoverUrl(mbReleaseGroupId: string): string {
    return `${CAA_BASE_URL}/release-group/${mbReleaseGroupId}/front-500`;
  }

  /**
   * 测试连接（简单搜索）
   */
  async testConnection(): Promise<{ success: boolean; errorMessage?: string }> {
    try {
      await mbFetch("/release", { query: "test", limit: "1" });
      return { success: true };
    } catch (e) {
      return {
        success: false,
        errorMessage: e instanceof Error ? e.message : String(e),
      };
    }
  }
}
