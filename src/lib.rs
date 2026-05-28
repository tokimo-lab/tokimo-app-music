//! Library facade.

/// Compile-time embedded app manifest, used by the db module to read the schema name.
pub(crate) const MANIFEST: &str = include_str!("../tokimo-app.toml");

pub mod bus_clients;
pub mod ctx;
pub mod db;
pub mod error;
pub mod services;

pub mod queue;
