// Old modules (kept for compatibility)
pub mod albums;
pub mod artists;
pub mod genres;
pub mod libraries;
pub mod library_sync_status;
pub mod lyrics;
pub mod tracks;

// New modules from presplit migration
pub mod album_genres;
pub mod music_album_artists;
pub mod music_albums;
pub mod music_artists;
pub mod music_files;
pub mod music_tracks;
pub mod musics;
pub mod vfs;

const _: () = {
    use core::mem::size_of;
    let _ = size_of::<album_genres::Model>();
    let _ = size_of::<album_genres::Relation>();
    let _ = size_of::<music_album_artists::Model>();
    let _ = size_of::<music_album_artists::Relation>();
    let _ = size_of::<music_albums::Model>();
    let _ = size_of::<music_albums::Relation>();
    let _ = size_of::<music_artists::Model>();
    let _ = size_of::<music_artists::Relation>();
    let _ = size_of::<music_files::Model>();
    let _ = size_of::<music_files::Relation>();
    let _ = size_of::<music_tracks::Model>();
    let _ = size_of::<music_tracks::Relation>();
    let _ = size_of::<musics::Model>();
    let _ = size_of::<musics::Relation>();
    let _ = size_of::<vfs::Model>();
    let _ = size_of::<vfs::Relation>();
};
