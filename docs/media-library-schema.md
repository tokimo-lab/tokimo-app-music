# 媒体库数据库设计

## 核心设计原则

```
MediaSource（来源配置，独立）
  NFS-nas1    ← 连接信息（host / 认证 / 挂载点）
  SMB-nas2
  Local-disk1
  Plex-server1

MediaLibrary（媒体库，一个库 = 一个类型）
  "我的电影"   type=movie  ─┬─ NFS-nas1  (rootPath: /media/movies)
  "我的TV"     type=tv     ─┼─ NFS-nas1  (rootPath: /media/tv)
                            └─ SMB-nas2  (rootPath: /share/tv)
  "我的动漫"   type=anime  ── NFS-nas1   (rootPath: /media/anime)
  "我的音乐"   type=music  ── Local-disk1
```

**一个 Library 只能有一个 `type`，这是整个系统能自动刮削的前提。**
刮削规则始终由 `Library.type` 决定，与来源（Source）无关。

---

## 概念对比（类比 Plex）

| 本系统概念            | 类比 Plex                          |
| --------------------- | ---------------------------------- |
| `MediaSource`         | 连接配置（服务器 / 挂载点）        |
| `MediaLibrary`        | Library（Movies / TV Shows / Music）|
| `MediaLibrarySource`  | Library 内的 Folder（根路径）      |
| `Library.type`        | Library 类型，唯一决定刮削逻辑     |

---

## Prisma Schema

### MediaSource — 来源配置（独立，可被多个库复用）

```prisma
model MediaSource {
  id          String    @id @default(uuid()) @db.Uuid
  name        String                          // 用户自定义名称，如 "家里 NAS"
  // local | nfs | smb | webdav | plex | emby | jellyfin | ftp
  type        String
  // NFS:    { host, exportPath, options }
  // SMB:    { host, share, domain, username, password }
  // WebDAV: { url, username, password }
  // Plex:   { url, token, libraryKey }
  // Local:  {} (rootPath 即为绝对路径)
  config      Json?
  isEnabled   Boolean   @default(true) @map("is_enabled")
  lastScanAt  DateTime? @map("last_scan_at") @db.Timestamptz
  createdAt   DateTime? @default(now()) @map("created_at") @db.Timestamptz
  updatedAt   DateTime? @default(now()) @map("updated_at") @db.Timestamptz

  libraryLinks  MediaLibrarySource[]
  files         MediaFile[]

  @@map("media_sources")
}
```

**`config` JSON 结构示例：**

```jsonc
// NFS
{ "host": "nas.local", "exportPath": "/data/media", "options": "ro,soft" }

// SMB
{ "host": "192.168.1.100", "share": "media", "domain": "WORKGROUP", "username": "guest", "password": "" }

// Plex（直接同步元数据，不重复刮削）
{ "url": "http://plex.local:32400", "token": "xxxx", "libraryKey": "1" }
```

---

### MediaLibrary — 媒体库（一个库 = 一个类型）

```prisma
model MediaLibrary {
  id            String    @id @default(uuid()) @db.Uuid
  name          String                          // 用户自定义名称
  // movie | tv | anime | music | adult | custom
  type          String
  icon          String?
  description   String?
  posterPath    String?   @map("poster_path")
  scrapeEnabled Boolean   @default(true) @map("scrape_enabled")
  // 刮削优先级（由 type 自动推荐，用户可调整顺序）
  // movie  → ["tmdb","douban"]
  // tv     → ["tmdb","tvdb","bangumi"]
  // anime  → ["bangumi","tmdb"]
  // adult  → ["javbus","javdb","tpdb"]
  // music  → ["musicbrainz","spotify"]
  scrapeAgents  String[]  @default([]) @map("scrape_agents")
  sortOrder     Int       @default(0)  @map("sort_order")
  isEnabled     Boolean   @default(true) @map("is_enabled")
  settings      Json?     // 语言偏好、文件名规则等
  createdAt     DateTime? @default(now()) @map("created_at") @db.Timestamptz
  updatedAt     DateTime? @default(now()) @map("updated_at") @db.Timestamptz

  sources  MediaLibrarySource[]
  movies   Movie[]
  tvShows  TvShow[]
  albums   MusicAlbum[]

  @@map("media_libraries")
}
```

---

### MediaLibrarySource — Junction 表（库 ↔ 来源，多对多）

```prisma
model MediaLibrarySource {
  id        String  @id @default(uuid()) @db.Uuid
  libraryId String  @map("library_id") @db.Uuid
  sourceId  String  @map("source_id")  @db.Uuid
  // 在来源内的子路径，如 "/media/movies" 或 "/share/tv/国产剧"
  rootPath  String  @map("root_path")
  sortOrder Int     @default(0) @map("sort_order")

  library MediaLibrary @relation(fields: [libraryId], references: [id], onDelete: Cascade)
  source  MediaSource  @relation(fields: [sourceId],  references: [id], onDelete: Cascade)

  @@unique([libraryId, sourceId, rootPath]) // 同一库不能重复挂同一路径
  @@index([libraryId])
  @@index([sourceId])
  @@map("media_library_sources")
}
```

---

### MediaFile — 物理文件

```prisma
model MediaFile {
  id           String    @id @default(uuid()) @db.Uuid
  sourceId     String    @map("source_id") @db.Uuid
  path         String    // 相对于 source rootPath 的路径
  filename     String
  size         BigInt?             // bytes
  mimeType     String?   @map("mime_type")
  duration     Int?                // seconds（视频 / 音频）
  checksum     String?             // xxHash3 校验（性能 > SHA256），用于变化检测

  // ── 视频流（专用列，可排序 / 筛选）──
  videoCodec   String?   @map("video_codec")   // h264 | h265 | av1 …
  videoWidth   Int?      @map("video_width")
  videoHeight  Int?      @map("video_height")
  frameRate    Float?    @map("frame_rate")
  videoBitrate Int?      @map("video_bitrate") // kbps
  hdrType      String?   @map("hdr_type")      // sdr | hdr10 | dolby_vision | hlg

  // ── 音频流 ──
  audioCodec     String?   @map("audio_codec")
  audioChannels  Int?      @map("audio_channels")
  audioBitrate   Int?      @map("audio_bitrate")
  audioLanguages String[]  @default([]) @map("audio_languages") // ["zh","en","ja"]

  isAvailable  Boolean   @default(true) @map("is_available")
  scannedAt    DateTime? @map("scanned_at") @db.Timestamptz
  createdAt    DateTime? @default(now()) @map("created_at") @db.Timestamptz
  updatedAt    DateTime? @default(now()) @map("updated_at") @db.Timestamptz

  source    MediaSource  @relation(fields: [sourceId], references: [id], onDelete: Cascade)
  movieId   String?      @map("movie_id")   @db.Uuid
  episodeId String?      @map("episode_id") @db.Uuid
  trackId   String?      @map("track_id")   @db.Uuid
  editionId String?      @map("edition_id") @db.Uuid  // 所属版本（4K / 1080p / 导演剪辑）
  movie     Movie?        @relation(fields: [movieId],   references: [id])
  episode   Episode?      @relation(fields: [episodeId], references: [id])
  track     MusicTrack?   @relation(fields: [trackId],   references: [id])
  edition   MediaEdition? @relation(fields: [editionId], references: [id])
  subtitles Subtitle[]
  chapters  Chapter[]

  @@index([sourceId])
  @@index([path])
  @@index([movieId])
  @@index([episodeId])
  @@index([editionId])
  @@map("media_files")
}
```

---

### Person — 人物（演员 / 导演 / 歌手，支持演员反查作品）

```prisma
model Person {
  id           String    @id @default(uuid()) @db.Uuid
  name         String
  originalName String?   @map("original_name")
  aliases      String[]  @default([])          // 别名数组，GIN 索引
  gender       String?   // male | female | unknown
  birthday     DateTime? @db.Date
  birthplace   String?
  profilePath  String?   @map("profile_path")
  biography    String?

  // ── 外部 ID（唯一索引，供刮削对比）──
  tmdbId     String? @unique @map("tmdb_id")
  imdbId     String? @unique @map("imdb_id")
  javbusId   String? @unique @map("javbus_id")
  javdbId    String? @unique @map("javdb_id")
  tpdbId     String? @unique @map("tpdb_id")
  mbArtistId String? @unique @map("mb_artist_id") // MusicBrainz

  metadata  Json?   // awards、social links、nationality …

  createdAt DateTime? @default(now()) @map("created_at") @db.Timestamptz
  updatedAt DateTime? @default(now()) @map("updated_at") @db.Timestamptz

  credits MediaCredit[]

  @@index([name])
  @@map("persons")
}
```

---

### MediaCredit — 演职员关联（多态）

```prisma
model MediaCredit {
  id        String  @id @default(uuid()) @db.Uuid
  personId  String  @map("person_id") @db.Uuid
  // actor | director | writer | producer | composer | cinematographer
  role      String
  character String? // 演员扮演的角色名
  sortOrder Int     @default(0) @map("sort_order")

  movieId   String? @map("movie_id")   @db.Uuid
  tvShowId  String? @map("tv_show_id") @db.Uuid
  episodeId String? @map("episode_id") @db.Uuid  // 剧集客串（episode-specific cast）
  albumId   String? @map("album_id")   @db.Uuid

  personRef  Person      @relation(fields: [personId],  references: [id], onDelete: Cascade)
  movieRef   Movie?      @relation("MovieCredits",   fields: [movieId],   references: [id], onDelete: Cascade)
  tvShowRef  TvShow?     @relation("TvShowCredits",  fields: [tvShowId],  references: [id], onDelete: Cascade)
  episodeRef Episode?    @relation("EpisodeCredits", fields: [episodeId], references: [id], onDelete: Cascade)
  albumRef   MusicAlbum? @relation("AlbumCredits",   fields: [albumId],   references: [id], onDelete: Cascade)

  @@index([personId])   // 演员反查：WHERE person_id = ? 即可
  @@index([movieId])
  @@index([tvShowId])
  @@index([episodeId])
  @@index([albumId])
  @@map("media_credits")
}
```

---

### Movie — 电影

```prisma
model Movie {
  id             String    @id @default(uuid()) @db.Uuid
  libraryId      String    @map("library_id") @db.Uuid

  // ── 搜索 / 排序专用列 ──
  title          String
  originalTitle  String?   @map("original_title")
  sortTitle      String?   @map("sort_title")    // "The Matrix" → "Matrix, The"
  year           Int?
  releaseDate    DateTime? @map("release_date") @db.Date
  runtime        Int?                             // 分钟

  // ── 评分（排序热字段）──
  tmdbRating     Float?    @map("tmdb_rating")
  imdbRating     Float?    @map("imdb_rating")
  doubanRating   Float?    @map("douban_rating")

  // ── 外部 ID（唯一索引）──
  tmdbId         String?   @unique @map("tmdb_id")
  imdbId         String?   @unique @map("imdb_id")
  doubanId       String?   @unique @map("douban_id")
  javNumber      String?   @unique @map("jav_number")  // 成人影片番号，如 "PRED-123"
  javbusId       String?   @unique @map("javbus_id")
  javdbId        String?   @unique @map("javdb_id")

  // ── 图片 ──
  posterPath     String?   @map("poster_path")
  backdropPath   String?   @map("backdrop_path")
  overview       String?
  tagline        String?

  // ── 可筛选标记（独立列）──
  isAdult          Boolean  @default(false) @map("is_adult")
  isFavorite       Boolean  @default(false) @map("is_favorite")
  originalLanguage String?  @map("original_language")
  countries         String[] @default([])
  spokenLanguages   String[] @default([]) @map("spoken_languages")
  contentRating     String?  @map("content_rating")                   // G | PG | PG-13 | R | NC-17 | TV-MA …
  contentAdvisories String[] @default([]) @map("content_advisories")  // ["violence","language","nudity"]
  lockedFields      String[] @default([]) @map("locked_fields")        // 锁定不被刮削覆盖的字段名

  // ── 灵活元数据 JSON ──
  // { budget, revenue, videos, keywords, externalLinks }
  metadata       Json?

  scrapedAt  DateTime? @map("scraped_at") @db.Timestamptz
  createdAt  DateTime? @default(now()) @map("created_at") @db.Timestamptz
  updatedAt  DateTime? @default(now()) @map("updated_at") @db.Timestamptz

  library      MediaLibrary      @relation(fields: [libraryId], references: [id])
  editions     MediaEdition[]
  files        MediaFile[]
  credits      MediaCredit[]     @relation("MovieCredits")
  genres       Genre[]           @relation("MovieGenres")
  tags         MediaTag[]        @relation("MovieTags")
  collections  Collection[]      @relation("MovieCollections")
  extras       MediaExtra[]
  timestamps   MediaTimestamps?
  art          MediaArt[]
  userRatings  UserMediaRating[]
  watchHistory WatchHistory[]

  @@index([libraryId])
  @@index([title])
  @@index([year])
  @@index([tmdbRating])
  @@index([imdbRating])
  @@index([isAdult])
  @@index([javNumber])
  @@index([contentRating])
  @@map("movies")
}
```

---

### TvShow / Season / Episode — 剧集

```prisma
model TvShow {
  id              String    @id @default(uuid()) @db.Uuid
  libraryId       String    @map("library_id") @db.Uuid
  title           String
  originalTitle   String?   @map("original_title")
  sortTitle       String?   @map("sort_title")
  year            Int?
  firstAirDate    DateTime? @map("first_air_date") @db.Date
  lastAirDate     DateTime? @map("last_air_date")  @db.Date
  // returning | ended | canceled | in_production | pilot
  status          String?
  tmdbRating      Float?    @map("tmdb_rating")
  imdbRating      Float?    @map("imdb_rating")
  doubanRating    Float?    @map("douban_rating")

  tmdbId     String? @unique @map("tmdb_id")
  imdbId     String? @unique @map("imdb_id")
  tvdbId     String? @unique @map("tvdb_id")
  doubanId   String? @unique @map("douban_id")
  bangumiId  String? @unique @map("bangumi_id")

  posterPath       String?  @map("poster_path")
  backdropPath     String?  @map("backdrop_path")
  overview         String?
  isAdult           Boolean  @default(false) @map("is_adult")
  isFavorite        Boolean  @default(false) @map("is_favorite")
  originalLanguage  String?  @map("original_language")
  countries         String[] @default([])
  contentRating     String?  @map("content_rating")                   // G | PG | PG-13 | TV-MA …
  contentAdvisories String[] @default([]) @map("content_advisories")  // ["violence","language"]
  lockedFields      String[] @default([]) @map("locked_fields")        // 锁定不被刮削覆盖的字段名

  // { networks, keywords, episode_run_time, next_air_date }
  metadata   Json?

  scrapedAt  DateTime? @map("scraped_at") @db.Timestamptz
  createdAt  DateTime? @default(now()) @map("created_at") @db.Timestamptz
  updatedAt  DateTime? @default(now()) @map("updated_at") @db.Timestamptz

  library      MediaLibrary      @relation(fields: [libraryId], references: [id])
  seasons      Season[]
  credits      MediaCredit[]     @relation("TvShowCredits")
  genres       Genre[]           @relation("TvShowGenres")
  tags         MediaTag[]        @relation("TvShowTags")
  collections  Collection[]      @relation("TvShowCollections")
  extras       MediaExtra[]
  editions     MediaEdition[]
  art          MediaArt[]
  userRatings  UserMediaRating[]
  userStates   UserMediaState[]

  @@index([libraryId])
  @@index([title])
  @@index([year])
  @@index([tmdbRating])
  @@index([contentRating])
  @@map("tv_shows")
}

model Season {
  id           String    @id @default(uuid()) @db.Uuid
  tvShowId     String    @map("tv_show_id") @db.Uuid
  seasonNumber Int       @map("season_number")
  title        String?
  overview     String?
  airDate      DateTime? @map("air_date") @db.Date
  posterPath   String?   @map("poster_path")
  episodeCount Int?      @map("episode_count")

  tvShow   TvShow     @relation(fields: [tvShowId], references: [id], onDelete: Cascade)
  episodes Episode[]
  art      MediaArt[]

  @@unique([tvShowId, seasonNumber])
  @@index([tvShowId])
  @@map("seasons")
}

model Episode {
  id            String    @id @default(uuid()) @db.Uuid
  tvShowId      String    @map("tv_show_id") @db.Uuid
  seasonId      String    @map("season_id")  @db.Uuid
  episodeNumber Int       @map("episode_number")
  title         String?
  overview      String?
  airDate       DateTime? @map("air_date") @db.Date
  runtime       Int?      // 分钟
  stillPath     String?   @map("still_path")
  tmdbRating    Float?    @map("tmdb_rating")
  tmdbId        String?   @unique @map("tmdb_id")
  // isWatched 已移除 — 改用 UserMediaState.isWatched（per-user 维度）

  tvShow       TvShow          @relation(fields: [tvShowId], references: [id], onDelete: Cascade)
  season       Season          @relation(fields: [seasonId], references: [id], onDelete: Cascade)
  files        MediaFile[]
  credits      MediaCredit[]   @relation("EpisodeCredits")
  timestamps   MediaTimestamps?
  watchHistory WatchHistory[]

  @@unique([seasonId, episodeNumber])
  @@index([tvShowId])
  @@map("episodes")
}
```

---

### MusicAlbum / MusicTrack — 音乐

```prisma
model MusicAlbum {
  id          String    @id @default(uuid()) @db.Uuid
  libraryId   String    @map("library_id") @db.Uuid
  title       String
  sortTitle   String?   @map("sort_title")
  year        Int?
  releaseDate DateTime? @map("release_date") @db.Date
  // album | single | ep | compilation | live | soundtrack
  albumType   String?   @map("album_type")
  mbAlbumId   String?   @unique @map("mb_album_id") // MusicBrainz
  spotifyId   String?   @unique @map("spotify_id")
  coverPath   String?   @map("cover_path")
  overview    String?
  totalTracks Int?      @map("total_tracks")
  totalDiscs  Int?      @map("total_discs")
  isFavorite  Boolean   @default(false) @map("is_favorite")
  // { label, upc, isrc, links }
  metadata  Json?

  scrapedAt DateTime? @map("scraped_at") @db.Timestamptz
  createdAt DateTime? @default(now()) @map("created_at") @db.Timestamptz
  updatedAt DateTime? @default(now()) @map("updated_at") @db.Timestamptz

  library MediaLibrary   @relation(fields: [libraryId], references: [id])
  tracks  MusicTrack[]
  credits MediaCredit[]  @relation("AlbumCredits")
  genres  Genre[]        @relation("AlbumGenres")
  tags    MediaTag[]     @relation("AlbumTags")

  @@index([libraryId])
  @@index([title])
  @@index([year])
  @@map("music_albums")
}

model MusicTrack {
  id          String  @id @default(uuid()) @db.Uuid
  albumId     String  @map("album_id") @db.Uuid
  title       String
  trackNumber Int?    @map("track_number")
  discNumber  Int?    @map("disc_number")
  duration    Int?    // seconds
  mbTrackId   String? @unique @map("mb_track_id")
  lyricsPath  String? @map("lyrics_path")  // LRC 歌词文件路径（相对于 source rootPath）

  album MusicAlbum  @relation(fields: [albumId], references: [id], onDelete: Cascade)
  files MediaFile[]

  @@index([albumId])
  @@map("music_tracks")
}
```

---

### Genre / MediaTag — 类型 & 标签

```prisma
model Genre {
  id   String @id @default(uuid()) @db.Uuid
  name String @unique
  slug String @unique // URL 友好，如 "sci-fi"

  movies  Movie[]      @relation("MovieGenres")
  tvShows TvShow[]     @relation("TvShowGenres")
  albums  MusicAlbum[] @relation("AlbumGenres")

  @@map("genres")
}

model MediaTag {
  id    String  @id @default(uuid()) @db.Uuid
  name  String  @unique
  color String?

  movies  Movie[]      @relation("MovieTags")
  tvShows TvShow[]     @relation("TvShowTags")
  albums  MusicAlbum[] @relation("AlbumTags")

  @@map("media_tags")
}
```

---

### WatchHistory — 每次播放记录（可重复）& UserMediaState — 当前状态

> **设计说明：** 拆成两张表。`WatchHistory` 是只追加的流水账（看了几遍、每次进度）；`UserMediaState` 是每个用户每个媒体的唯一最新状态（断点续播从这里读）。

```prisma
// 每次播放一条，永不覆盖（追加写）
model WatchHistory {
  id          String    @id @default(uuid()) @db.Uuid
  userId      String    @map("user_id")    @db.Uuid
  movieId     String?   @map("movie_id")   @db.Uuid
  episodeId   String?   @map("episode_id") @db.Uuid
  fileId      String?   @map("file_id")    @db.Uuid  // 实际播放的物理文件
  sessionId   String?   @map("session_id") @db.Uuid  // 播放时所用设备（关联 Session，可得 deviceType/browser/os）
  startedAt   DateTime  @default(now()) @map("started_at")  @db.Timestamptz
  stoppedAt   DateTime? @map("stopped_at") @db.Timestamptz
  position    Int       @default(0)  // 本次停止时的秒数
  duration    Int?                   // 总时长秒数
  completed   Boolean   @default(false)

  user    User     @relation(fields: [userId],    references: [id], onDelete: Cascade)
  movie   Movie?   @relation(fields: [movieId],   references: [id], onDelete: Cascade)
  episode Episode? @relation(fields: [episodeId], references: [id], onDelete: Cascade)
  session Session? @relation(fields: [sessionId], references: [id], onDelete: SetNull)

  @@index([userId, startedAt])
  @@index([movieId])
  @@index([episodeId])
  @@index([sessionId])
  @@map("watch_histories")
}

// 每用户每媒体唯一，upsert 更新（断点续播从这里读）
model UserMediaState {
  id             String    @id @default(uuid()) @db.Uuid
  userId         String    @map("user_id")    @db.Uuid
  movieId        String?   @map("movie_id")   @db.Uuid
  tvShowId       String?   @map("tv_show_id") @db.Uuid
  episodeId      String?   @map("episode_id") @db.Uuid
  resumePosition Int       @default(0)  @map("resume_position")  // 续播秒数
  playCount      Int       @default(0)  @map("play_count")        // 累计播放次数
  isWatched      Boolean   @default(false) @map("is_watched")     // 手动/自动标记已看完
  lastWatchAt    DateTime? @map("last_watch_at") @db.Timestamptz
  updatedAt      DateTime  @default(now()) @map("updated_at") @db.Timestamptz

  user    User     @relation(fields: [userId],    references: [id], onDelete: Cascade)
  movie   Movie?   @relation(fields: [movieId],   references: [id], onDelete: Cascade)
  tvShow  TvShow?  @relation(fields: [tvShowId],  references: [id], onDelete: Cascade)
  episode Episode? @relation(fields: [episodeId], references: [id], onDelete: Cascade)

  @@unique([userId, movieId])
  @@unique([userId, tvShowId])
  @@unique([userId, episodeId])
  @@index([userId, lastWatchAt])
  @@map("user_media_states")
}
```

---

### UserMediaRating — 用户评分

```prisma
model UserMediaRating {
  id       String   @id @default(uuid()) @db.Uuid
  userId   String   @map("user_id")    @db.Uuid
  movieId  String?  @map("movie_id")   @db.Uuid
  tvShowId String?  @map("tv_show_id") @db.Uuid
  rating   Float    // 0..10
  review   String?
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz

  user   User    @relation(fields: [userId],   references: [id])
  movie  Movie?  @relation(fields: [movieId],  references: [id])
  tvShow TvShow? @relation(fields: [tvShowId], references: [id])

  @@unique([userId, movieId])
  @@unique([userId, tvShowId])
  @@map("user_media_ratings")
}
```

---

### ScrapeTask — 刮削任务队列

```prisma
model ScrapeTask {
  id          String    @id @default(uuid()) @db.Uuid
  targetType  String    @map("target_type") // movie | tv | album
  targetId    String    @map("target_id")   @db.Uuid
  // tmdb | douban | javbus | javdb | tpdb | musicbrainz | bangumi
  agent       String
  // pending | running | done | failed
  status      String    @default("pending")
  errorMsg    String?   @map("error_msg")
  retries     Int       @default(0)
  scheduledAt DateTime? @map("scheduled_at") @db.Timestamptz
  startedAt   DateTime? @map("started_at")   @db.Timestamptz
  finishedAt  DateTime? @map("finished_at")  @db.Timestamptz
  createdAt   DateTime  @default(now()) @map("created_at") @db.Timestamptz

  @@index([status, scheduledAt])
  @@index([targetType, targetId])
  @@map("scrape_tasks")
}
```

---

### Subtitle — 字幕文件管理

从 JSON 字段升级为独占表，支持外挂字幕下载状态追踪、用户默认语言偏好，并可按语言索引。

```prisma
model Subtitle {
  id       String  @id @default(uuid()) @db.Uuid
  fileId   String  @map("file_id") @db.Uuid   // 所属视频文件
  language String  // ISO 639-1，如 "zh"、"en"、"ja"
  title    String? // 显示名称，如 "简体中文"
  // embedded | external | downloaded
  sourceType  String  @map("source_type")
  // 外挂字幕路径（relative to source rootPath），embedded 时为 null
  path        String?
  // opensubtitles | shooter | assrt | local | plex | manual（与 MediaArt.source 命名统一）
  source      String?
  sourceId    String? @map("source_id")    // 来源站 ID，用于避免重复下载
  encoding    String? // UTF-8 | GBK …
  isDefault   Boolean @default(false) @map("is_default")  // 用户选定默认字幕
  isForced    Boolean @default(false) @map("is_forced")    // 强制显示（外语对白）
  createdAt   DateTime @default(now()) @map("created_at") @db.Timestamptz

  file MediaFile @relation(fields: [fileId], references: [id], onDelete: Cascade)

  @@index([fileId, language])
  @@map("subtitles")
}
```

---

### Chapter — 章节 / 场景标记

支持章节列表跳转和缩略图预览（Plex "Chapter Images" 功能）。

```prisma
model Chapter {
  id        String  @id @default(uuid()) @db.Uuid
  fileId    String  @map("file_id") @db.Uuid
  index     Int                      // 章节序号（0-based）
  title     String?                  // 章节标题，如 "Act 1"
  startTime Int     @map("start_time") // 开始秒数
  thumbPath String? @map("thumb_path") // 章节缩略图路径

  file MediaFile @relation(fields: [fileId], references: [id], onDelete: Cascade)

  @@unique([fileId, index])
  @@index([fileId])
  @@map("chapters")
}
```

---

### LibraryShare — 库共享权限

把某个库共享给指定用户（家庭成员账号），支持只读访问，可设置过期时间。

```prisma
model LibraryShare {
  id        String    @id @default(uuid()) @db.Uuid
  libraryId String    @map("library_id") @db.Uuid
  ownerId   String    @map("owner_id")   @db.Uuid  // 库拥有者
  userId    String    @map("user_id")    @db.Uuid  // 被共享用户
  // readonly（只能查看，不能管理库）
  permission String   @default("readonly")
  expiresAt DateTime? @map("expires_at") @db.Timestamptz  // null = 永久
  createdAt DateTime  @default(now()) @map("created_at") @db.Timestamptz

  library MediaLibrary @relation(fields: [libraryId], references: [id], onDelete: Cascade)
  owner   User         @relation("LibraryShareOwner", fields: [ownerId], references: [id])
  user    User         @relation("LibraryShareUser",  fields: [userId],  references: [id])

  @@unique([libraryId, userId])
  @@index([libraryId])
  @@index([userId])
  @@map("library_shares")
}
```

---

### MatchHistory — 刮削修正记录（Fix Match）

用户手动修正刮削错误后记录"指定用哪条外部数据"，防止下次刮削任务再度覆盖错误信息。

```prisma
model MatchHistory {
  id         String   @id @default(uuid()) @db.Uuid
  targetType String   @map("target_type")  // movie | tv | album
  targetId   String   @map("target_id")    @db.Uuid
  // 用户选定的外部数据源和 ID
  agent      String   // tmdb | douban | javbus …
  externalId String   @map("external_id")
  // auto（系统自动）| manual（用户手动修正）
  matchType  String   @default("auto") @map("match_type")
  userId     String?  @map("user_id") @db.Uuid  // 手动修正时记录操作人
  createdAt  DateTime @default(now()) @map("created_at") @db.Timestamptz

  user User? @relation(fields: [userId], references: [id])

  // 每个 target 每个 agent 只保留最新一条（覆盖式 upsert）
  @@unique([targetType, targetId, agent])
  @@index([targetType, targetId])
  @@map("match_histories")
}
```

---

### MediaEdition — 多版本文件（导演剪辑 / 4K / 院线版 / 剧集特别版）

同一部电影或剧集可以有多个版本（4K UHD、导演剪辑版、院线版；剧集如《权游》导演剪辑版），前端合并展示成一张卡片，播放时弹出版本选择器。

```prisma
model MediaEdition {
  id          String    @id @default(uuid()) @db.Uuid
  movieId     String?   @map("movie_id")   @db.Uuid
  tvShowId    String?   @map("tv_show_id") @db.Uuid  // 剧集特别版（导演剪辑 / 扩展版）
  // theatrical | directors_cut | extended | unrated | 4k_remaster | dubbed
  editionType String    @default("theatrical") @map("edition_type")
  title       String?   // 版本名称，如 "4K UHD 导演剪辑版"
  year        Int?      // 再版年份
  runtime     Int?      // 该版本时长（分钟）
  sortOrder   Int       @default(0) @map("sort_order")

  movie  Movie?  @relation(fields: [movieId],  references: [id], onDelete: Cascade)
  tvShow TvShow? @relation(fields: [tvShowId], references: [id], onDelete: Cascade)
  files  MediaFile[]

  @@index([movieId])
  @@index([tvShowId])
  @@map("media_editions")
}
```

---

### Collection — 合集 / 系列（如"漫威宇宙"、"007 系列"）

跨库的有序系列集合，可由 TMDB `collection_id` 自动创建，也支持用户手动创建。与 Genre 区别：Genre 是描述标签，Collection 是叙事上有顺序关系的系列，有完整度概念（"已收录 2/3 部"）。

```prisma
model Collection {
  id               String    @id @default(uuid()) @db.Uuid
  name             String
  sortTitle        String?   @map("sort_title")
  overview         String?
  posterPath       String?   @map("poster_path")
  backdropPath     String?   @map("backdrop_path")
  tmdbCollectionId String?   @unique @map("tmdb_collection_id")
  createdAt        DateTime? @default(now()) @map("created_at") @db.Timestamptz
  updatedAt        DateTime? @default(now()) @map("updated_at") @db.Timestamptz

  movies  Movie[]  @relation("MovieCollections")
  tvShows TvShow[] @relation("TvShowCollections")

  @@index([name])
  @@map("collections")
}
```

---

### Playlist — 用户播放列表

用户手动创建的有序列表，可混合电影 + 剧集单集 + 音轨，支持公开分享。

```prisma
model Playlist {
  id          String   @id @default(uuid()) @db.Uuid
  userId      String   @map("user_id") @db.Uuid
  name        String
  description String?
  coverPath   String?  @map("cover_path")
  isPublic    Boolean  @default(false) @map("is_public")
  createdAt   DateTime @default(now()) @map("created_at") @db.Timestamptz
  updatedAt   DateTime @default(now()) @map("updated_at") @db.Timestamptz

  user  User           @relation(fields: [userId], references: [id], onDelete: Cascade)
  items PlaylistItem[]

  @@index([userId])
  @@map("playlists")
}

model PlaylistItem {
  id         String   @id @default(uuid()) @db.Uuid
  playlistId String   @map("playlist_id") @db.Uuid
  movieId    String?  @map("movie_id")    @db.Uuid
  episodeId  String?  @map("episode_id")  @db.Uuid
  trackId    String?  @map("track_id")    @db.Uuid
  sortOrder  Int      @default(0) @map("sort_order")
  addedAt    DateTime @default(now()) @map("added_at") @db.Timestamptz

  playlist Playlist @relation(fields: [playlistId], references: [id], onDelete: Cascade)

  @@index([playlistId])
  @@map("playlist_items")
}
```

---

### ParentalControl — 家长控制

按用户配置最高允许内容评级，超出时要求输入 PIN 解锁，也可整体隐藏指定库。

```prisma
model ParentalControl {
  id               String   @id @default(uuid()) @db.Uuid
  userId           String   @unique @map("user_id") @db.Uuid
  // 最高允许评级：G | PG | PG-13 | R | TV-MA | UNRATED
  maxContentRating String   @default("R") @map("max_content_rating")
  pinHash          String?  @map("pin_hash")          // 解锁 PIN（bcrypt）
  hiddenLibraries  String[] @default([]) @map("hidden_libraries") // 完全隐藏的 libraryId 列表
  updatedAt        DateTime @default(now()) @map("updated_at") @db.Timestamptz

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@map("parental_controls")
}
```

---

### MediaTimestamps — 片头 / 片尾 / 彩蛋时间戳

支持"跳过片头"、"跳过片尾"、"跳到彩蛋"功能（Netflix / Plex 风格）。时间戳可由服务端音频指纹自动检测、用户手动标记或从社区数据库拉取。

```prisma
model MediaTimestamps {
  id        String  @id @default(uuid()) @db.Uuid
  movieId   String? @unique @map("movie_id")   @db.Uuid
  episodeId String? @unique @map("episode_id") @db.Uuid

  introStart   Int? @map("intro_start")    // 片头开始（秒）
  introEnd     Int? @map("intro_end")      // 片头结束（秒）
  outroStart   Int? @map("outro_start")    // 片尾开始（秒）
  creditsStart Int? @map("credits_start")  // 字幕滚动开始（秒）
  postCreditAt Int? @map("post_credit_at") // 彩蛋时间点（秒）
  // auto | manual | community
  detectedBy   String? @map("detected_by")
  confidence   Float?  // auto 检测置信度 0..1

  movie   Movie?   @relation(fields: [movieId],   references: [id], onDelete: Cascade)
  episode Episode? @relation(fields: [episodeId], references: [id], onDelete: Cascade)

  @@map("media_timestamps")
}
```

---

### MediaExtra — 花絮 / 预告片 / 幕后特辑

预告片、拍摄花絮、采访、删减片段等附加视频，支持 YouTube 外链或本地文件。

```prisma
model MediaExtra {
  id       String  @id @default(uuid()) @db.Uuid
  movieId  String? @map("movie_id")   @db.Uuid
  tvShowId String? @map("tv_show_id") @db.Uuid
  // trailer | behind_the_scenes | featurette | interview | scene | short | other
  type       String
  title      String
  overview   String?
  youtubeKey String? @map("youtube_key") // YouTube 视频 Key（二选一，application 层需校验二者不可同时为 null）
  fileId     String? @map("file_id") @db.Uuid // 本地 MediaFile ID（二选一）
  runtime    Int?    // seconds
  thumbPath  String? @map("thumb_path")
  sortOrder  Int     @default(0) @map("sort_order")
  createdAt  DateTime @default(now()) @map("created_at") @db.Timestamptz

  movie  Movie?  @relation(fields: [movieId],  references: [id], onDelete: Cascade)
  tvShow TvShow? @relation(fields: [tvShowId], references: [id], onDelete: Cascade)

  @@index([movieId])
  @@index([tvShowId])
  @@map("media_extras")
}
```

---

### MediaArt — 多封面 / 背景图候选

刮削后缓存多张备选图片（海报 / 背景 / Logo），用户在前端图片选择器中手动挑选，`isSelected` 标记当前生效项。

```prisma
model MediaArt {
  id       String  @id @default(uuid()) @db.Uuid
  movieId  String? @map("movie_id")   @db.Uuid
  tvShowId String? @map("tv_show_id") @db.Uuid
  seasonId String? @map("season_id")  @db.Uuid  // 分季封面（每一季有独立封面候选）
  albumId  String? @map("album_id")   @db.Uuid
  // poster | backdrop | banner | thumb | logo | clearlogo | discart
  artType    String  @map("art_type")
  url        String  // 远端 URL 或本地缓存路径
  width      Int?
  height     Int?
  language   String? // 图片语言（如 zh、en）
  source     String? // 来源：tmdb | fanart.tv | local
  isSelected Boolean @default(false) @map("is_selected") // 当前选中
  createdAt  DateTime @default(now()) @map("created_at") @db.Timestamptz

  @@index([movieId, artType])
  @@index([tvShowId, artType])
  @@index([seasonId, artType])
  @@map("media_arts")
}
```

---

### PlaybackSession — 活跃播放会话

多用户场景下，管理员可实时看到谁在播放什么、所用设备、是否在转码及码率，支持远程停止播放。

> **与 `Session` 的关系：** `Session` 即设备记录。`PlaybackSession.sessionId` 指向 `Session.id`，从而得到设备的 browser/os/deviceType 信息，无需重复存储。
> **`Session` 建议补充字段**（在现有 `browser/browserVersion/os/userAgent` 基础上）：
> ```prisma
> deviceId    String?  @map("device_id")   // 客户端生成的稳定 UUID（跨登录识别同一设备）
> deviceName  String?  @map("device_name") // 用户自定义名称，如 "客厅 Apple TV"
> deviceType  String?  @map("device_type") // web | tv | mobile | desktop | cast
> clientVersion String? @map("client_version") // 客户端 App 版本号
> isRevoked   Boolean  @default(false) @map("is_revoked") // 远程撤销授权
> ```

```prisma
model PlaybackSession {
  id         String   @id @default(uuid()) @db.Uuid
  userId     String   @map("user_id")   @db.Uuid
  sessionId  String   @map("session_id") @db.Uuid  // 关联 Session（即设备）
  movieId    String?  @map("movie_id")   @db.Uuid
  episodeId  String?  @map("episode_id") @db.Uuid
  fileId     String   @map("file_id")    @db.Uuid   // 实际播放的物理文件
  position   Int      @default(0)  // 实时播放秒数（客户端每 10s 上报）
  // direct_play | transcode_video | transcode_audio | transcode_both
  playMethod    String @map("play_method")
  // { targetResolution, targetBitrate, container, videoProfile }
  transcodeMeta Json?  @map("transcode_meta")

  startedAt  DateTime  @default(now()) @map("started_at")  @db.Timestamptz
  lastSeenAt DateTime  @default(now()) @map("last_seen_at") @db.Timestamptz
  stoppedAt  DateTime? @map("stopped_at") @db.Timestamptz

  user    User    @relation(fields: [userId],    references: [id], onDelete: Cascade)
  session Session @relation(fields: [sessionId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([sessionId])
  @@index([startedAt])
  @@map("playback_sessions")
}
```

---

## 搜索与索引策略

| 查询场景               | 字段                          | 索引类型          |
| ---------------------- | ----------------------------- | ----------------- |
| 按标题搜索             | `title`, `originalTitle`      | B-Tree + GIN trgm |
| 演员反查作品           | `MediaCredit.personId`        | B-Tree            |
| 按年份排序             | `year`                        | B-Tree            |
| 按评分排序             | `tmdbRating`, `imdbRating`    | B-Tree            |
| 番号搜索（成人）       | `javNumber`                   | B-Tree + UNIQUE   |
| 别名搜索               | `Person.aliases` (string[])   | GIN               |
| 最近播放               | `UserMediaState.lastWatchAt`  | B-Tree (复合)     |

**建议在 migration 中补加的原始 SQL 索引：**

```sql
-- 模糊标题搜索（需先开启扩展）
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX idx_movies_title_trgm   ON movies   USING GIN (title gin_trgm_ops);
CREATE INDEX idx_tv_shows_title_trgm ON tv_shows  USING GIN (title gin_trgm_ops);
CREATE INDEX idx_persons_name_trgm   ON persons   USING GIN (name  gin_trgm_ops);

-- 演员别名数组
CREATE INDEX idx_persons_aliases_gin ON persons   USING GIN (aliases);
```

---

## JSON vs 专用列 决策规则

| 用独立列                          | 用 JSON                              |
| --------------------------------- | ------------------------------------ |
| 需要 WHERE / ORDER BY             | 几乎不用来过滤                       |
| 需要外键关联                      | 灵活嵌套结构（多种 source 连接配置） |
| 枚举 / 布尔标记（如 `isAdult`）   | 较少查询的附加属性                   |
| 评分、年份、番号等热点排序字段    | keywords、videos、awards 等          |

---

## 常见问题解答

### Q：一个来源（如 NFS）里既有电影又有 TV，怎么办？

> 把路径拆成两条 `MediaLibrarySource` 记录：
>
> - "我的电影" → NFS + `rootPath: /nas/movies`
> - "我的TV"   → NFS + `rootPath: /nas/tv`
>
> `MediaSource` 只存**连接配置**（复用），`rootPath` 由 junction 表 `MediaLibrarySource` 管理，互不干扰。

### Q：刮削时怎么知道该用哪个 agent？

> 扫描文件 → 归属哪个 Library（通过 `LibrarySource.libraryId`）→ 读 `library.type` → 查默认 agent 映射表 → 执行刮削。
>
> ```
> movie  → tmdb, douban
> tv     → tmdb, tvdb, bangumi
> anime  → bangumi, tmdb
> adult  → javbus, javdb, tpdb
> music  → musicbrainz, spotify
> ```

### Q：可以让一个库有多个类型吗（比如电影 + 动漫）？

> **不可以。** 一个库严格只有一个 `type`，这是自动刮削能正确工作的前提。如果想把电影和动漫放一起看，应该在前端创建「合并视图」，而不是让单个库跨类型。

### Q：Plex 来源怎么处理，还需要刮削吗？

> Plex 本身已经有完整元数据，直接通过 Plex API 同步到本地数据库即可，不需要重复刮削。`MediaSource.config` 存 `{ url, token, libraryKey }`，扫描时调 Plex API 拉取，而非扫文件系统。

### Q：演员反查作品如何查询？

```sql
-- 查某演员参与的所有电影，按年份降序
SELECT m.id, m.title, m.year, mc.role, mc.character
FROM movies m
  JOIN media_credits mc ON mc.movie_id = m.id
  JOIN persons p        ON p.id = mc.person_id
WHERE p.name ILIKE '%苍井空%'
ORDER BY m.year DESC;

-- 或通过 tmdbId 精确查
SELECT m.* FROM movies m
  JOIN media_credits mc ON mc.movie_id = m.id
WHERE mc.person_id = '<person-uuid>';
```

### Q：断点续播的进度怎么存？

> 播放进度从 `UserMediaState.resumePosition` 读取（每个用户每个媒体唯一，upsert 更新）。
> 每次播放完整记录写入 `WatchHistory`（只追加，不覆盖），用于"看了几遍"统计和历史时间线。
> 两张表分工：**State** 负责当前状态，**History** 负责历史流水。

### Q：一部电影有 4K 和 1080p 两个文件，如何展示成一张卡片？

> 创建两条 `MediaEdition` 记录（`editionType: "4k_remaster"` 和 `"theatrical"`），都关联同一个 `Movie`，每条 Edition 下各挂自己的 `MediaFile`。前端列表页合并成一张卡片，播放时弹出版本选择器。

### Q：Collection（合集）和 Genre（类型）有什么区别？

> **Genre** 是描述性标签（"科幻"、"动作"），多个不相关影片可共享，无顺序。
> **Collection** 是叙事上属于同一系列的有序集合（"漫威宇宙第一阶段"、"指环王三部曲"），有完整度概念，可展示"已收录 2/3 部"。

### Q：片头跳过的时间戳怎么来的？

> 三种来源，由 `MediaTimestamps.detectedBy` 标记：
> 1. `auto`：服务端用音频指纹（Chromaprint）或黑帧检测自动识别，附 `confidence` 置信度
> 2. `manual`：用户在播放器里手动标记并保存
> 3. `community`：从第三方社区数据库拉取

### Q：家长控制如何拦截内容？

> 两层防御：
> 1. **列表过滤**：API 查询时对比 `Movie.contentRating` 与 `ParentalControl.maxContentRating`，超出评级的内容不返回
> 2. **播放 PIN**：前端播放时检测，需输入 `pinHash`（bcrypt）验证的 PIN 码解锁
>
> `hiddenLibraries` 可以彻底对该用户隐藏整个库（如成人库）。

### Q：多用户播放监控怎么实现？

> 播放开始时创建 `PlaybackSession`，客户端每 10s 上报一次 `position` + `lastSeenAt`（heartbeat）。
> 管理员查询 `stoppedAt IS NULL AND lastSeenAt > NOW() - INTERVAL '30s'` 即可看到所有活跃流。
> 设备信息通过 `sessionId → Session` 获取（browser / os / deviceType），无需在 PlaybackSession 里冗余存储。

### Q：Session 里存的 Device 还缺什么？

> 现有 `Session` 已有 `userAgent / browser / browserVersion / os`，建议再补充：
> - `deviceId`：客户端本地生成的稳定 UUID，即使重新登录也不变，用于识别"同一设备"
> - `deviceName`：用户可编辑的友好名称（"客厅 Apple TV"）
> - `deviceType`：`web | tv | mobile | desktop | cast`
> - `clientVersion`：App 版本号，方便排查兼容性问题
> - `isRevoked`：远程一键踢出该设备，无需等 Token 过期

### Q：歌词文件如何关联？

> `MusicTrack.lyricsPath` 存 LRC 文件路径（相对于 `MediaSource.rootPath`），播放器读取后解析为逐行时间戳并高亮显示当前歌词行。

### Q：多封面候选如何使用？

> 刮削时将所有候选图片（来自 TMDB、fanart.tv 等）写入 `MediaArt`，默认评分最高的一张 `isSelected = true`。前端设置页展示图片选择器，用户切换时更新 `isSelected`，其余置为 `false`。

---

## 开发路线图

| 阶段 | 功能模块 | 涉及主要表 |
|------|---------|----------|
| **MVP** | 媒体库 + 来源管理 | `MediaLibrary`, `MediaSource`, `MediaLibrarySource` |
| **MVP** | 文件扫描入库 | `MediaFile` |
| **MVP** | 自动刮削 + 修正记录 | `Movie`, `TvShow`, `MusicAlbum`, `ScrapeTask`, `MatchHistory` |
| **MVP** | 人物 & 演员反查 | `Person`, `MediaCredit` |
| **MVP** | 播放 + 断点续播 | `WatchHistory`, `UserMediaState` |
| **MVP** | 字幕管理 | `Subtitle` |
| **v2** | 合集 / 系列 | `Collection` |
| **v2** | 多版本文件 | `MediaEdition` |
| **v2** | 内容分级 & 家长控制 | `contentRating` 字段, `ParentalControl` |
| **v2** | 播放列表 | `Playlist`, `PlaylistItem` |
| **v2** | 库共享 | `LibraryShare` |
| **v2** | 用户评分 & 点评 | `UserMediaRating` |
| **v3** | 章节 / 场景跳转 | `Chapter` |
| **v3** | 片头 / 彩蛋跳过 | `MediaTimestamps` |
| **v3** | 花絮 / 预告片 | `MediaExtra` |
| **v3** | 多封面候选选择器 | `MediaArt` |
| **v3** | 活跃会话监控 | `PlaybackSession` |
| **v3** | 歌词同步显示 | `MusicTrack.lyricsPath` |
