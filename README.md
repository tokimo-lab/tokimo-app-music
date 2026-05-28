# tokimo-app-music

Tokimo 音乐库管理器 sidecar — 独立多进程架构，通过 tokimo-bus 注册数据面 socket。

## 状态

数据面已接通（sidecar 注册成功，不报 "not registered"）。所有业务 handler 目前返回 501 Not Implemented，待 DB repos 从主 rust-server 提取为独立 crate 后替换。

## 需要迁移的功能

- [ ] Library CRUD (musics / music_albums / music_tracks / music_artists)
- [ ] File scanning & sync (`AppSyncService::execute_music_sync`)
- [ ] File streaming (`stream_music_file` — depends on VFS driver)
- [ ] Metadata scrape (`MusicScrapeQueue`)
- [ ] Lyrics fetching (depends on storage abstraction)
