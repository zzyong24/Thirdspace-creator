//! T-1007 native task files and controlled process host.
//! Native task capabilities never enter Tauri's WebView command registry.
//! On macOS the private socket accepts only the exact spawned Node sidecar PID;
//! that sidecar holds the backend execution row lock across each file request.
//! macOS commands use the same PID-bound socket and a packaged runtime path.
//! Windows command execution stays closed pending native isolation and IPC.
#[cfg(unix)]
pub mod command;
pub mod files;
#[cfg(target_os = "macos")]
pub mod browser;
#[cfg(target_os = "macos")]
pub mod browser_ipc;
#[cfg(target_os = "macos")]
pub mod ipc;
