//! T-1007 native task files and controlled process host.
//! Native task capabilities never enter Tauri's WebView command registry.
//! On macOS the private socket accepts only the exact spawned Node sidecar PID;
//! that sidecar holds the backend execution row lock across each file request.
//! macOS commands use the same PID-bound socket and a packaged runtime path.
//! Windows command execution stays closed pending native process isolation.
#[cfg(unix)]
pub mod command;
// Compile the fail-closed Windows host on its target, and exercise its
// admission tests on the development host even without a Windows runner.
#[cfg(any(windows, test))]
pub mod command_windows;
#[cfg(windows)]
pub use command_windows as command;
#[cfg(all(target_os = "macos", feature = "workbench-browser"))]
pub mod browser;
#[cfg(all(target_os = "macos", feature = "workbench-browser"))]
pub mod browser_ipc;
pub mod files;
#[cfg(target_os = "macos")]
pub mod ipc;
#[cfg(windows)]
pub mod ipc_windows;
