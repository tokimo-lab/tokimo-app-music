# 音乐刮削流程文档

> 代码位置：`packages/rust-server/src/services/media/music_scrape.rs`  
> 元数据提供者：`packages/rust-client-api/src/metadata_providers/`

---

## 整体架构

```
用户触发刮削（单张专辑 / 批量）
        │
        ▼
  ① 标题清洗（extract_clean_title）
        │
        ▼
  ② MusicBrainz 搜索匹配（search_release / search_release_by_keyword）
        │
        ▼
  ③ MusicBrainz 获取专辑详情（get_release）
        │
        ├── ④ 封面下载（download_cover）
        │         Spotify → iTunes → MusicBrainz CAA
        │
        ├── ⑤ 曲目更新（update_tracks）
        │         时长 / 流派 ← MusicBrainz
        │         歌词 ← LrcLib（逐字同步 synced → 纯文本 plain）
        │
        └── ⑥ 艺术家刮削（save_album_artists）
                  生日 / 出生地（中文） ← MusicBrainz
                  传记 ← 中文 Wikipedia
                  头像 ← Spotify → Deezer
```

---

## ① 标题清洗

文件导入时专辑标题可能带有日期前缀，需要提取真实标题再搜索。

| 原始标题 | 清洗后 |
|---------|--------|
| `2001年09月14日 - 范特西` | `范特西` |
| `2013年《寻找周杰伦EP》` | `寻找周杰伦EP` |
| `2005年《Initial J》 (日本版)` | `Initial J (日本版)` |

支持两种格式：
- `日期 - 专辑名`（` - ` 分隔）
- `日期《专辑名》[后缀]`（书名号）

---

## ② MusicBrainz 搜索（专辑匹配）

**接口：** `https://musicbrainz.org/ws/2/release`  
**限速：** 1200ms / 请求（MusicBrainz 官方限制）  
**重试：** 最多 3 次，503 时指数退避

搜索变体（依次尝试，第一个有结果即停止）：

| 优先级 | 搜索方式 | 说明 |
|--------|---------|------|
| 1 | `artist + title` | `search_release(artist, title)` |
| 2 | `title` only | 适用于未知艺术家或 MB 用不同艺术家名 |
| 3 | `artist + stripped_title` | 去掉 EP / OST / 电影原声带等后缀 |
| 4 | `stripped_title` only | 最宽松搜索 |

**最佳候选评分（pick_best_candidate）：**  
标题相似度（`strsim::jaro_winkler`）× 权重 + 曲目数匹配 × 权重，取分最高者。

---

## ③ MusicBrainz 专辑详情

**接口：** `GET /release/{mb_release_id}?inc=recordings+artists+release-groups+genres`

获取字段：
- 专辑年份、发行日期、专辑类型（album / single / ep / …）
- 曲目列表（编号、时长）
- 风格 / 流派
- 封面 URL（MusicBrainz CAA）
- 艺术家列表（含 MB 艺术家 ID）

---

## ④ 封面下载优先级

| 优先级 | 来源 | 条件 |
|--------|------|------|
| 1 | **Spotify** | 已在设置中配置 `client_id` + `client_secret` |
| 2 | **iTunes** Search API | 免费，无需 Key，质量高（3000×3000） |
| 3 | **MusicBrainz** Cover Art Archive | MB 数据库自带，质量参差不齐 |

> Spotify 未配置时直接跳过，不会报错。

存储路径：`/storage/library-images/music/{album_id}/cover.jpg`

---

## ⑤ 曲目更新

每首曲目从以下来源补全数据：

| 字段 | 来源 |
|------|------|
| `duration`（时长） | MusicBrainz 曲目列表（按曲目编号匹配） |
| `genre`（风格） | 专辑主流派（第一个） |
| `lyrics_path`（歌词） | **LrcLib**（见下文） |

### 歌词抓取（LrcLib）

**接口：** `https://lrclib.net/api/search?track_name=...&artist_name=...&album_name=...`  
**免费，无需 Key。**

查询逻辑：
1. 若曲目标题含 `－` 或 `-` 分隔，解析出 `曲名` 和 `逐曲艺术家`，用更精确的信息搜索
2. 优先返回 **synced lyrics**（带时间戳的 `.lrc` 格式，播放时逐行高亮）
3. synced 不存在时，使用 **plain lyrics**（纯文本）
4. 歌词以文件形式存储：`/storage/lyrics/{track_id}.lrc`

---

## ⑥ 艺术家刮削

每位艺术家按以下顺序处理：

### 查找 / 创建 Person 记录

1. 先按 `mb_artist_id` 查找
2. 找不到则按 `name` 查找
3. 都没有则创建新记录

### 生日 / 出生地（中文化）

**来源：** MusicBrainz 艺术家端点  
`GET /artist/{mb_artist_id}?inc=url-rels`

- `birthday` ← `life-span.begin`（格式 `YYYY-MM-DD`）
- `birthplace` ← 先取 `begin-area.id`，然后调用 Area Aliases API：

```
GET /area/{area_id}?inc=aliases
→ 找 locale = zh_Hans / zh_Hant / zh_* 的别名
→ 找不到时退回英文名
```

> 例：New Taipei City → **新北市**

### 艺术家传记

**来源：** 中文 Wikipedia（`zh.wikipedia.org`）

流程：
1. 从 MusicBrainz url-rels 中提取 Wikipedia 链接（任意语言）
2. 若链接不是 zh 版，调用 MediaWiki API 查询该文章的中文跨语言链接（`langlinks?lllang=zh`）
3. 调用 `zh.wikipedia.org/api/rest_v1/page/summary/{title}` 取摘要文本

> 结果始终为**中文**传记。

### 艺术家头像

| 优先级 | 来源 | 条件 |
|--------|------|------|
| 1 | **Spotify** `artist.images[0]` | 已配置 Spotify Key；优先用 MB url-rels 中的 Spotify ID |
| 2 | **Deezer** Search API | 免费，无需 Key |

存储路径：`/storage/persons/{uuid}.jpg`

### TMDB 补充刮削（后台任务）

艺术家记录保存后，自动派发一个 TMDB 人物刮削后台任务（`force_dispatch_person_tmdb_scrape`），若该艺术家在 TMDB 有条目，可进一步补充更高质量的传记和头像。

---

## 触发方式

### 单张专辑手动刮削

```
POST /api/apps/album/{album_id}/scrape
Body: { "mbReleaseId": "50cf1798-..." }   ← 指定 MB Release ID
Body: {}                                    ← 自动搜索
```

### 批量刮削整个音乐库

```
POST /api/apps/{app_id}/scrape-music
```

批量时跳过已有 `mb_album_id` 的专辑（可通过参数强制重刮）。

---

## 数据存储字段

| 表 | 刮削字段 |
|----|---------|
| `music_albums` | `mb_album_id`, `year`, `release_date`, `album_type`, `cover_path`, `total_tracks`, `total_discs`, `scraped_at`, `metadata.genres` |
| `music_tracks` | `duration`, `genre`, `lyrics_path` |
| `persons` | `name`, `mb_artist_id`, `birthday`, `birthplace`, `biography`, `profile_path` |
| `media_credits` | `person_id`, `album_id`, `role='artist'` |

---

## 配置项（系统设置）

| 配置 | 用途 | 是否必须 |
|------|------|---------|
| Spotify `client_id` + `client_secret` | 专辑封面（最高质量）、艺术家头像 | 可选 |
| TMDB API Key | 艺术家传记 / 头像补充 | 可选 |

所有其余数据源（MusicBrainz / iTunes / Deezer / LrcLib / Wikipedia）均**免费、无需 Key**。
