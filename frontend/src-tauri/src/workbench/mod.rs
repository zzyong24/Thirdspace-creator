//! T-1007 native task files and controlled process host.
//! Native task capabilities never enter Tauri's WebView command registry.
//! On macOS the private socket accepts only the exact spawned Node sidecar PID;
//! that sidecar holds the backend execution row lock across each file request.
//! Windows and command execution remain closed until separately verified.
#[cfg(unix)]
pub mod command;
pub mod files;
#[cfg(target_os = "macos")]
pub mod ipc;
