//! T-1007 native task files and controlled process host.
//! Compiled by the desktop host, but deliberately not exposed through Tauri IPC.
//! The WebView has no authority to supply user/account/task IDs or a lease.
//! A future private sidecar transport must verify the current backend execution
//! lease and fence before constructing TaskFiles or CommandHost.
#[cfg(unix)]
pub mod command;
pub mod files;
