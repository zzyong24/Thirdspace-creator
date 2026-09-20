//! T-1007 native task files and controlled process host.
//! Parent integration declares `mod workbench;` in lib.rs and supplies trusted
//! execution-lease context plus packaged runtime paths through a private IPC.
#[cfg(unix)]
pub mod command;
pub mod files;
