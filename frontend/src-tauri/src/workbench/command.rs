#![cfg(unix)]

//! Controlled command host. Model inputs contain arguments and a runtime ID only.
//! Runtime executable paths are supplied by the desktop installer. A command is
//! admitted only when the OS confinement launcher is available. No shell, PATH
//! lookup, inherited environment, or ambient cwd is used.
use super::files::{validate_relative, TaskFiles};
use std::{
    collections::HashMap,
    fs::{self, File, OpenOptions},
    io::{self, Read},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::Mutex,
    time::{Duration, Instant},
};

#[derive(Clone)]
pub struct RuntimeRegistry {
    pub bundled_node: PathBuf,
    pub bundled_python: PathBuf,
    pub approved_program: PathBuf,
    pub read_roots: Vec<PathBuf>,
}
impl RuntimeRegistry {
    /// Only fixed paths beneath the verified, extracted sidecar runtime are
    /// candidates. Missing optional runtimes remain unavailable; never search
    /// PATH, Homebrew, or the host operating system.
    pub fn from_sidecar(sidecar_dir: &Path) -> Result<Self, CommandError> {
        let root = fs::canonicalize(sidecar_dir)?;
        if !root.is_dir() {
            return Err(CommandError::Unavailable(
                "安装包 runtime 目录不存在".into(),
            ));
        }
        Ok(Self {
            bundled_node: root.join("server.app/Contents/MacOS/creatoros-server"),
            bundled_python: root.join("layers/local-ai/bin/python3"),
            approved_program: root.join("layers/workbench/bin/approved-program"),
            read_roots: vec![root],
        })
    }
}
#[derive(Clone)]
pub struct CommandRequest {
    pub argv: Vec<String>,
    pub cwd: String,
    pub runtime_id: String,
    pub timeout_ms: u64,
    pub stdin_ref: Option<String>,
}
#[derive(Clone, Debug, PartialEq)]
pub struct CommandReceipt {
    pub operation_id: String,
    pub state: String,
    pub exit_code: Option<i32>,
    pub stdout_ref: String,
    pub stderr_ref: String,
    pub stdout_preview: String,
    pub stderr_preview: String,
    pub truncated: bool,
}
#[derive(Debug)]
pub enum CommandError {
    InvalidInput,
    Unavailable(String),
    Io(io::Error),
    WrongScope,
    AlreadyRunning,
}
impl From<io::Error> for CommandError {
    fn from(e: io::Error) -> Self {
        Self::Io(e)
    }
}
struct Entry {
    scope: String,
    child: Child,
    started: Instant,
    timeout: Duration,
    stdout: PathBuf,
    stderr: PathBuf,
    stdout_reader: Option<std::thread::JoinHandle<io::Result<()>>>,
    stderr_reader: Option<std::thread::JoinHandle<io::Result<()>>>,
    receipt: CommandReceipt,
}
pub struct CommandHost {
    runtimes: RuntimeRegistry,
    entries: Mutex<HashMap<(String, String), Entry>>,
}
impl CommandHost {
    pub fn new(runtimes: RuntimeRegistry) -> Self {
        Self {
            runtimes,
            entries: Mutex::new(HashMap::new()),
        }
    }
    fn runtime(&self, id: &str) -> Result<PathBuf, CommandError> {
        let path = match id {
            "bundled-node" => &self.runtimes.bundled_node,
            "bundled-python" => &self.runtimes.bundled_python,
            "approved-program" => &self.runtimes.approved_program,
            _ => return Err(CommandError::InvalidInput),
        };
        if !path.is_absolute() || !path.is_file() {
            return Err(CommandError::Unavailable("受管 runtime 不存在".into()));
        }
        let canonical = fs::canonicalize(path)?;
        let basename = canonical
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_ascii_lowercase();
        let bundled = self
            .runtimes
            .read_roots
            .iter()
            .any(|root| canonical.starts_with(root));
        // Standalone module tests exercise the sandbox with macOS fixtures.
        // Production always has a sidecar read root; it can never enter this arm.
        let test_system_fixture = cfg!(test)
            && self.runtimes.read_roots.is_empty()
            && (canonical.starts_with("/bin") || canonical.starts_with("/usr/bin"));
        if !bundled && !test_system_fixture {
            return Err(CommandError::Unavailable("runtime 不在安装包内".into()));
        }
        if id == "approved-program"
            && matches!(
                basename.as_str(),
                "sh" | "bash" | "zsh" | "fish" | "cmd.exe" | "powershell.exe" | "pwsh.exe"
            )
        {
            return Err(CommandError::InvalidInput);
        }
        Ok(canonical)
    }
    pub fn run(
        &self,
        files: &TaskFiles,
        scope: &str,
        operation_id: &str,
        request: CommandRequest,
    ) -> Result<CommandReceipt, CommandError> {
        if scope != files.scope_key() {
            return Err(CommandError::WrongScope);
        }
        if scope.is_empty()
            || operation_id.is_empty()
            || operation_id.len() > 160
            || request.argv.is_empty()
            || request.argv.len() > 128
            || request
                .argv
                .iter()
                .any(|a| a.len() > 8192 || a.contains('\0'))
            || request.timeout_ms == 0
            || request.timeout_ms > 3_600_000
        {
            return Err(CommandError::InvalidInput);
        }
        if request.cwd != "." {
            validate_relative(&request.cwd).map_err(|_| CommandError::InvalidInput)?;
        }
        if let Some(ref path) = request.stdin_ref {
            validate_relative(path).map_err(|_| CommandError::InvalidInput)?;
        }
        let runtime = self.runtime(&request.runtime_id)?;
        let mut entries = self
            .entries
            .lock()
            .map_err(|_| CommandError::Unavailable("命令表锁失败".into()))?;
        let key = (scope.to_owned(), operation_id.to_owned());
        if entries.contains_key(&key) {
            return Err(CommandError::AlreadyRunning);
        }
        let cwd = if request.cwd == "." {
            files.root.clone()
        } else {
            files.root.join(
                validate_relative(&request.cwd)
                    .map_err(|_| CommandError::InvalidInput)?
                    .join("/"),
            )
        };
        // Real directory validation is performed by TaskFiles::stat; the OS
        // sandbox below remains the actual process confinement boundary.
        if request.cwd != "."
            && !files
                .stat(&request.cwd)
                .map_err(|_| CommandError::InvalidInput)?
                .is_some_and(|(is_dir, _, _)| is_dir)
        {
            return Err(CommandError::InvalidInput);
        }
        let cwd = fs::canonicalize(&cwd)?;
        if !cwd.starts_with(&files.root) {
            return Err(CommandError::InvalidInput);
        }
        let stdin = if let Some(path) = request.stdin_ref.as_ref() {
            Some(
                files
                    .read(path)
                    .map_err(|_| CommandError::InvalidInput)?
                    .ok_or(CommandError::InvalidInput)?
                    .0,
            )
        } else {
            None
        };
        let output_key = hex_key(operation_id);
        let stdout_ref = format!("command:{output_key}:stdout");
        let stderr_ref = format!("command:{output_key}:stderr");
        let mut command = confined_command(
            &runtime,
            &files.root,
            files.base(),
            &self.runtimes.read_roots,
        )?;
        if request.runtime_id == "bundled-node" {
            // The bundled Node can otherwise load its build-machine OpenSSL
            // config from /opt/homebrew before executing any user script.
            // Keep startup within the task sandbox and use Node's built-in CA.
            command.arg("--openssl-config=/dev/null");
        }
        let outputs = files
            .output_dir()
            .map_err(|_| CommandError::Unavailable("输出目录不可用".into()))?;
        let stdout = outputs.join(format!("{output_key}.stdout"));
        let stderr = outputs.join(format!("{output_key}.stderr"));
        let stdout_file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&stdout)?;
        let stderr_file = match OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&stderr)
        {
            Ok(file) => file,
            Err(e) => {
                let _ = fs::remove_file(&stdout);
                return Err(e.into());
            }
        };
        command
            .args(&request.argv)
            .current_dir(cwd)
            .env_clear()
            .env("HOME", &files.root)
            .env("TMPDIR", &files.root)
            .env("PATH", "")
            .stdin(if stdin.is_some() {
                Stdio::piped()
            } else {
                Stdio::null()
            })
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        #[cfg(unix)]
        {
            use std::os::unix::process::CommandExt;
            command.process_group(0);
        }
        let mut child = match command.spawn() {
            Ok(child) => child,
            Err(e) => {
                let _ = fs::remove_file(&stdout);
                let _ = fs::remove_file(&stderr);
                return Err(e.into());
            }
        };
        let mut stdout_pipe = child.stdout.take().ok_or(CommandError::InvalidInput)?;
        let mut stderr_pipe = child.stderr.take().ok_or(CommandError::InvalidInput)?;
        let stdout_reader = std::thread::spawn(move || {
            let mut out = stdout_file;
            io::copy(&mut stdout_pipe, &mut out)?;
            out.sync_all()
        });
        let stderr_reader = std::thread::spawn(move || {
            let mut out = stderr_file;
            io::copy(&mut stderr_pipe, &mut out)?;
            out.sync_all()
        });
        if let Some(bytes) = stdin {
            if let Some(mut pipe) = child.stdin.take() {
                std::thread::spawn(move || {
                    use std::io::Write;
                    let _ = pipe.write_all(&bytes);
                });
            }
        }
        let receipt = CommandReceipt {
            operation_id: operation_id.into(),
            state: "running".into(),
            exit_code: None,
            stdout_ref,
            stderr_ref,
            stdout_preview: String::new(),
            stderr_preview: String::new(),
            truncated: false,
        };
        entries.insert(
            key,
            Entry {
                scope: scope.into(),
                child,
                started: Instant::now(),
                timeout: Duration::from_millis(request.timeout_ms),
                stdout,
                stderr,
                stdout_reader: Some(stdout_reader),
                stderr_reader: Some(stderr_reader),
                receipt: receipt.clone(),
            },
        );
        Ok(receipt)
    }
    pub fn status(&self, scope: &str, operation_id: &str) -> Result<CommandReceipt, CommandError> {
        let mut entries = self
            .entries
            .lock()
            .map_err(|_| CommandError::Unavailable("命令表锁失败".into()))?;
        let entry = entries
            .get_mut(&(scope.to_owned(), operation_id.to_owned()))
            .ok_or(CommandError::InvalidInput)?;
        if entry.scope != scope {
            return Err(CommandError::WrongScope);
        }
        if entry.receipt.state == "running" {
            if exit_ready(&entry.child)? {
                // A launcher that exits while descendants remain must not leave
                // those descendants writing into the task after its receipt. WNOWAIT
                // keeps the PID reserved until the process group is signalled.
                unsafe {
                    libc::killpg(entry.child.id() as i32, libc::SIGKILL);
                }
                let status = entry.child.wait()?;
                entry.receipt.state = if status.success() {
                    "succeeded"
                } else {
                    "failed"
                }
                .into();
                entry.receipt.exit_code = status.code();
            } else if entry.started.elapsed() > entry.timeout {
                terminate_tree(&mut entry.child)?;
                entry.receipt.state = "timed_out".into();
                entry.receipt.exit_code = entry.child.try_wait()?.and_then(|s| s.code());
            }
        }
        if entry.receipt.state != "running" {
            finish_output(entry)?;
        }
        let (out, ot) = preview(&entry.stdout)?;
        let (err, et) = preview(&entry.stderr)?;
        entry.receipt.stdout_preview = out;
        entry.receipt.stderr_preview = err;
        entry.receipt.truncated = ot || et;
        Ok(entry.receipt.clone())
    }
    pub fn cancel(&self, scope: &str, operation_id: &str) -> Result<CommandReceipt, CommandError> {
        let mut entries = self
            .entries
            .lock()
            .map_err(|_| CommandError::Unavailable("命令表锁失败".into()))?;
        let entry = entries
            .get_mut(&(scope.to_owned(), operation_id.to_owned()))
            .ok_or(CommandError::InvalidInput)?;
        if entry.scope != scope {
            return Err(CommandError::WrongScope);
        }
        if entry.receipt.state == "running" {
            if exit_ready(&entry.child)? {
                unsafe {
                    libc::killpg(entry.child.id() as i32, libc::SIGKILL);
                }
                let status = entry.child.wait()?;
                entry.receipt.state = if status.success() {
                    "succeeded"
                } else {
                    "failed"
                }
                .into();
                entry.receipt.exit_code = status.code();
            } else {
                terminate_tree(&mut entry.child)?;
                entry.receipt.state = "cancelled".into();
                entry.receipt.exit_code = entry.child.try_wait()?.and_then(|s| s.code());
            }
        }
        finish_output(entry)?;
        Ok(entry.receipt.clone())
    }
    /// Read a bounded page of the full stdout/stderr stored outside the task's
    /// command-writable directory. The caller still must present the same scope.
    pub fn read_output(
        &self,
        scope: &str,
        operation_id: &str,
        stream: &str,
        offset: u64,
        limit: usize,
    ) -> Result<(Vec<u8>, bool), CommandError> {
        if limit == 0 || limit > 1_000_000 {
            return Err(CommandError::InvalidInput);
        }
        let entries = self
            .entries
            .lock()
            .map_err(|_| CommandError::Unavailable("命令表锁失败".into()))?;
        let entry = entries
            .get(&(scope.to_owned(), operation_id.to_owned()))
            .ok_or(CommandError::InvalidInput)?;
        if entry.scope != scope {
            return Err(CommandError::WrongScope);
        }
        let path = match stream {
            "stdout" => &entry.stdout,
            "stderr" => &entry.stderr,
            _ => return Err(CommandError::InvalidInput),
        };
        use std::io::Seek;
        let mut file = File::open(path)?;
        file.seek(std::io::SeekFrom::Start(offset))?;
        let mut bytes = Vec::new();
        file.take((limit + 1) as u64).read_to_end(&mut bytes)?;
        let more = bytes.len() > limit;
        if more {
            bytes.truncate(limit);
        }
        Ok((bytes, more))
    }
    /// Drive deadlines even when the model never asks for status again.
    pub fn reap(&self) {
        let ids = match self.entries.lock() {
            Ok(entries) => entries
                .iter()
                .filter(|(_, entry)| entry.receipt.state == "running")
                .map(|((scope, id), _)| (id.clone(), scope.clone()))
                .collect::<Vec<_>>(),
            Err(_) => return,
        };
        for (id, scope) in ids {
            let _ = self.status(&scope, &id);
        }
    }
}
impl Drop for CommandHost {
    fn drop(&mut self) {
        if let Ok(mut entries) = self.entries.lock() {
            for entry in entries.values_mut() {
                if entry.receipt.state == "running" {
                    if terminate_tree(&mut entry.child).is_err() {
                        // A kernel-stuck process cannot be joined safely here.
                        // Leave its output collectors detached and let teardown
                        // continue; the caller's cancellation stays unknown.
                        continue;
                    }
                }
                let _ = finish_output(entry);
            }
        }
    }
}
fn finish_output(entry: &mut Entry) -> Result<(), CommandError> {
    for handle in [&mut entry.stdout_reader, &mut entry.stderr_reader] {
        if let Some(join) = handle.take() {
            let deadline = Instant::now() + Duration::from_secs(2);
            while !join.is_finished() && Instant::now() < deadline {
                std::thread::sleep(Duration::from_millis(10));
            }
            if !join.is_finished() {
                return Err(CommandError::Unavailable("命令输出采集未结束".into()));
            }
            join.join()
                .map_err(|_| CommandError::Unavailable("输出采集线程崩溃".into()))??;
        }
    }
    Ok(())
}
fn hex_key(id: &str) -> String {
    use sha2::{Digest, Sha256};
    format!("{:x}", Sha256::digest(id.as_bytes()))
}
fn preview(path: &Path) -> Result<(String, bool), CommandError> {
    let mut f = File::open(path)?;
    let mut data = Vec::new();
    f.by_ref().take(65537).read_to_end(&mut data)?;
    let truncated = data.len() > 65536;
    if truncated {
        data.truncate(65536);
    }
    Ok((String::from_utf8_lossy(&data).into_owned(), truncated))
}
#[cfg(target_os = "macos")]
fn confined_command(
    runtime: &Path,
    root: &Path,
    base: &Path,
    read_roots: &[PathBuf],
) -> Result<Command, CommandError> {
    let launcher = Path::new("/usr/bin/sandbox-exec");
    if !launcher.is_file() {
        return Err(CommandError::Unavailable(
            "macOS sandbox-exec 不可用".into(),
        ));
    }
    fn quoted(p: &Path) -> String {
        format!(
            "\"{}\"",
            p.to_string_lossy()
                .replace('\\', "\\\\")
                .replace('"', "\\\"")
        )
    }
    // The root directory itself must be readable for path traversal on macOS.
    // Other reads are limited to system binaries, this runtime bundle, and the
    // task root. In particular, home, keychain, app DB, and sibling tasks remain
    // outside the profile. `base` is checked to ensure it contains `root`.
    if !root.starts_with(base) {
        return Err(CommandError::InvalidInput);
    }
    let mut extra = String::new();
    // Node resolves a script by lstat'ing every ancestor of its absolute
    // task path. Grant those directory entries only; sibling contents stay
    // outside the sandbox's file-read and file-write roots.
    for ancestor in root.ancestors().skip(1).filter(|p| *p != Path::new("/")) {
        extra.push_str(&format!(" (literal {})", quoted(ancestor)));
    }
    let mut canonical_roots = Vec::new();
    for path in read_roots {
        let path = fs::canonicalize(path)?;
        if path.components().count() < 4 || path.starts_with(base) || root.starts_with(&path) {
            return Err(CommandError::InvalidInput);
        }
        extra.push_str(&format!(" (subpath {})", quoted(&path)));
        for ancestor in path.ancestors().skip(1).filter(|p| *p != Path::new("/")) {
            extra.push_str(&format!(" (literal {})", quoted(ancestor)));
        }
        canonical_roots.push(path);
    }
    if !runtime.starts_with("/usr")
        && !runtime.starts_with("/bin")
        && !runtime.starts_with("/System")
        && !canonical_roots.iter().any(|path| runtime.starts_with(path))
    {
        return Err(CommandError::Unavailable("runtime 不在受控读取根内".into()));
    }
    let profile=format!("(version 1)(deny default)(allow process*)(allow mach-lookup)(allow sysctl-read)(allow file-read* (literal \"/\") (subpath \"/System\") (subpath \"/usr\") (subpath \"/dev\") (subpath \"/bin\") (subpath \"/sbin\") {} (subpath {}))(allow file-write* (subpath {}))",extra,quoted(root),quoted(root));
    let mut c = Command::new(launcher);
    c.arg("-p").arg(profile).arg(runtime);
    Ok(c)
}
#[cfg(not(target_os = "macos"))]
fn confined_command(
    _runtime: &Path,
    _root: &Path,
    _base: &Path,
    _read_roots: &[PathBuf],
) -> Result<Command, CommandError> {
    Err(CommandError::Unavailable(
        "此平台尚未提供已验证的 OS 命令隔离".into(),
    ))
}
#[cfg(unix)]
fn terminate_tree(child: &mut Child) -> Result<(), CommandError> {
    let pgid = child.id() as i32;
    unsafe {
        libc::killpg(pgid, libc::SIGTERM);
    }
    let deadline = Instant::now() + Duration::from_millis(500);
    while Instant::now() < deadline {
        if unsafe { libc::killpg(pgid, 0) } != 0 {
            break;
        }
        std::thread::sleep(Duration::from_millis(10));
    }
    unsafe {
        libc::killpg(pgid, libc::SIGKILL);
    }
    let deadline = Instant::now() + Duration::from_secs(2);
    loop {
        if child.try_wait()?.is_some() {
            return Ok(());
        }
        if Instant::now() >= deadline {
            return Err(CommandError::Unavailable("进程树取消后仍未退出".into()));
        }
        std::thread::sleep(Duration::from_millis(20));
    }
}
fn exit_ready(child: &Child) -> Result<bool, CommandError> {
    let mut info: libc::siginfo_t = unsafe { std::mem::zeroed() };
    let code = unsafe {
        libc::waitid(
            libc::P_PID,
            child.id(),
            &mut info,
            libc::WEXITED | libc::WNOHANG | libc::WNOWAIT,
        )
    };
    if code != 0 {
        return Err(io::Error::last_os_error().into());
    }
    Ok(unsafe { info.si_pid() } != 0)
}
#[cfg(not(unix))]
fn terminate_tree(_child: &mut Child) -> Result<(), CommandError> {
    Err(CommandError::Unavailable("进程树取消未验证".into()))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn unavailable_runtime_and_untrusted_arguments_rejected() {
        let root =
            std::env::temp_dir().join(format!("creatoros-command-{}", rand::random::<u64>()));
        let files = TaskFiles::new(&root, "u", "a", "t").unwrap();
        let host = CommandHost::new(RuntimeRegistry {
            bundled_node: PathBuf::from("/missing/node"),
            bundled_python: PathBuf::from("/missing/python"),
            approved_program: PathBuf::from("/missing/program"),
            read_roots: vec![],
        });
        let req = CommandRequest {
            argv: vec!["x".into()],
            cwd: ".".into(),
            runtime_id: "bundled-node".into(),
            timeout_ms: 1000,
            stdin_ref: None,
        };
        assert!(matches!(
            host.run(&files, "forged-scope", "o", req.clone()),
            Err(CommandError::WrongScope)
        ));
        assert!(matches!(
            host.run(&files, files.scope_key(), "o", req.clone()),
            Err(CommandError::Unavailable(_))
        ));
        let mut bad = req;
        bad.cwd = "../outside".into();
        assert!(matches!(
            host.run(&files, files.scope_key(), "o", bad),
            Err(CommandError::InvalidInput)
        ));
        fs::remove_dir_all(root).unwrap();
    }
    #[cfg(target_os = "macos")]
    #[test]
    fn sidecar_registry_uses_only_fixed_bundle_paths_and_missing_optional_runtimes_fail() {
        let root =
            std::env::temp_dir().join(format!("creatoros-runtime-{}", rand::random::<u64>()));
        let node = root.join("server.app/Contents/MacOS/creatoros-server");
        fs::create_dir_all(node.parent().unwrap()).unwrap();
        fs::copy("/bin/echo", &node).unwrap();
        let registry = RuntimeRegistry::from_sidecar(&root).unwrap();
        assert_eq!(
            registry.bundled_node,
            fs::canonicalize(&root)
                .unwrap()
                .join("server.app/Contents/MacOS/creatoros-server")
        );
        let host = CommandHost::new(registry);
        assert!(host.runtime("bundled-node").is_ok());
        assert!(matches!(
            host.runtime("bundled-python"),
            Err(CommandError::Unavailable(_))
        ));
        assert!(matches!(
            host.runtime("approved-program"),
            Err(CommandError::Unavailable(_))
        ));
        fs::remove_file(&node).unwrap();
        std::os::unix::fs::symlink("/bin/echo", &node).unwrap();
        assert!(matches!(
            host.runtime("bundled-node"),
            Err(CommandError::Unavailable(_))
        ));
        fs::remove_dir_all(root).unwrap();
    }
    #[cfg(target_os = "macos")]
    #[test]
    fn mac_sandbox_runs_and_tree_cancel() {
        let root =
            std::env::temp_dir().join(format!("creatoros-command-{}", rand::random::<u64>()));
        let files = TaskFiles::new(&root, "u", "a", "t").unwrap();
        let host = CommandHost::new(RuntimeRegistry {
            bundled_node: PathBuf::from("/usr/bin/true"),
            bundled_python: PathBuf::from("/usr/bin/true"),
            approved_program: PathBuf::from("/bin/sleep"),
            read_roots: vec![],
        });
        let req = CommandRequest {
            argv: vec!["5".into()],
            cwd: ".".into(),
            runtime_id: "approved-program".into(),
            timeout_ms: 10000,
            stdin_ref: None,
        };
        host.run(&files, files.scope_key(), "op", req).unwrap();
        assert!(matches!(
            host.cancel("wrong", "op"),
            Err(CommandError::InvalidInput)
        ));
        assert_eq!(
            host.cancel(files.scope_key(), "op").unwrap().state,
            "cancelled"
        );
        fs::remove_dir_all(root).unwrap();
    }
    #[cfg(target_os = "macos")]
    #[test]
    fn mac_deadline_reaper_stops_unpolled_process() {
        let root =
            std::env::temp_dir().join(format!("creatoros-command-{}", rand::random::<u64>()));
        let files = TaskFiles::new(&root, "u", "a", "t").unwrap();
        let host = CommandHost::new(RuntimeRegistry {
            bundled_node: PathBuf::from("/bin/sleep"),
            bundled_python: PathBuf::from("/bin/sleep"),
            approved_program: PathBuf::from("/bin/sleep"),
            read_roots: vec![],
        });
        host.run(
            &files,
            files.scope_key(),
            "deadline",
            CommandRequest {
                argv: vec!["10".into()],
                cwd: ".".into(),
                runtime_id: "approved-program".into(),
                timeout_ms: 20,
                stdin_ref: None,
            },
        )
        .unwrap();
        std::thread::sleep(Duration::from_millis(30));
        host.reap();
        assert_eq!(
            host.status(files.scope_key(), "deadline").unwrap().state,
            "timed_out"
        );
        fs::remove_dir_all(root).unwrap();
    }
    #[cfg(target_os = "macos")]
    #[test]
    fn mac_sandbox_denies_outside_read_and_reaps_child_process() {
        let root =
            std::env::temp_dir().join(format!("creatoros-command-{}", rand::random::<u64>()));
        let files = TaskFiles::new(&root, "u", "a", "t").unwrap();
        let secret = root.join("outside-secret");
        fs::write(&secret, b"private").unwrap();
        let host = CommandHost::new(RuntimeRegistry {
            bundled_node: PathBuf::from("/usr/bin/true"),
            bundled_python: PathBuf::from("/usr/bin/true"),
            approved_program: PathBuf::from("/bin/cat"),
            read_roots: vec![],
        });
        host.run(
            &files,
            files.scope_key(),
            "deny",
            CommandRequest {
                argv: vec![secret.to_string_lossy().into_owned()],
                cwd: ".".into(),
                runtime_id: "approved-program".into(),
                timeout_ms: 10000,
                stdin_ref: None,
            },
        )
        .unwrap();
        let mut receipt = host.status(files.scope_key(), "deny").unwrap();
        for _ in 0..100 {
            if receipt.state != "running" {
                break;
            }
            std::thread::sleep(Duration::from_millis(20));
            receipt = host.status(files.scope_key(), "deny").unwrap();
        }
        assert_eq!(
            receipt.state, "failed",
            "outside read was allowed: {receipt:?}"
        );
        assert!(
            receipt.stderr_preview.contains("Operation not permitted"),
            "sandbox failed before path check: {receipt:?}"
        );
        files.write("inside", b"allowed", 0).unwrap();
        host.run(
            &files,
            files.scope_key(),
            "read",
            CommandRequest {
                argv: vec![files.root.join("inside").to_string_lossy().into_owned()],
                cwd: ".".into(),
                runtime_id: "approved-program".into(),
                timeout_ms: 10000,
                stdin_ref: None,
            },
        )
        .unwrap();
        let mut ok = host.status(files.scope_key(), "read").unwrap();
        for _ in 0..100 {
            if ok.state != "running" {
                break;
            }
            std::thread::sleep(Duration::from_millis(20));
            ok = host.status(files.scope_key(), "read").unwrap();
        }
        assert_eq!(ok.state, "succeeded", "task read failed: {ok:?}");
        assert_eq!(
            host.read_output(files.scope_key(), "read", "stdout", 0, 100)
                .unwrap()
                .0,
            b"allowed"
        );
        assert!(matches!(
            host.read_output("other", "read", "stdout", 0, 100),
            Err(CommandError::InvalidInput)
        ));
        fs::remove_dir_all(root).unwrap();
    }
    #[cfg(target_os = "macos")]
    #[test]
    #[ignore = "requires CREATOROS_TEST_PACKAGED_RUNTIME_ROOT from a locally inspected Mac runtime"]
    fn mac_packaged_node_runs_script_inside_task_sandbox() {
        let runtime_root = PathBuf::from(
            std::env::var("CREATOROS_TEST_PACKAGED_RUNTIME_ROOT")
                .expect("set CREATOROS_TEST_PACKAGED_RUNTIME_ROOT"),
        );
        let root =
            std::env::temp_dir().join(format!("creatoros-command-node-{}", rand::random::<u64>()));
        let files = TaskFiles::new(&root, "u", "a", "t").unwrap();
        files.write("probe.js", b"process.stdout.write('bundled-node-ok:' + require('node:tls').rootCertificates.length)", 0).unwrap();
        let host = CommandHost::new(RuntimeRegistry::from_sidecar(&runtime_root).unwrap());
        host.run(
            &files,
            files.scope_key(),
            "packaged-node",
            CommandRequest {
                argv: vec!["probe.js".into()],
                cwd: ".".into(),
                runtime_id: "bundled-node".into(),
                timeout_ms: 10_000,
                stdin_ref: None,
            },
        )
        .unwrap();
        let mut receipt = host.status(files.scope_key(), "packaged-node").unwrap();
        for _ in 0..100 {
            if receipt.state != "running" {
                break;
            }
            std::thread::sleep(Duration::from_millis(20));
            receipt = host.status(files.scope_key(), "packaged-node").unwrap();
        }
        assert_eq!(
            receipt.state, "succeeded",
            "packaged Node failed: {receipt:?}"
        );
        let output = host
            .read_output(files.scope_key(), "packaged-node", "stdout", 0, 100)
            .unwrap()
            .0;
        let count = String::from_utf8(output)
            .unwrap()
            .strip_prefix("bundled-node-ok:")
            .unwrap()
            .parse::<usize>()
            .unwrap();
        assert!(count > 0, "bundled Node lost its built-in CA certificates");
        fs::remove_dir_all(root).unwrap();
    }
    #[cfg(target_os = "macos")]
    #[test]
    fn mac_cancel_terminates_spawned_descendant() {
        let python = PathBuf::from("/opt/homebrew/bin/python3");
        if !python.is_file() {
            return;
        }
        let root =
            std::env::temp_dir().join(format!("creatoros-command-{}", rand::random::<u64>()));
        let files = TaskFiles::new(&root, "u", "a", "t").unwrap();
        let bundle = fs::canonicalize(&python)
            .unwrap()
            .ancestors()
            .find(|p| {
                p.parent()
                    .and_then(Path::file_name)
                    .and_then(|n| n.to_str())
                    .is_some_and(|n| n.starts_with("python@"))
            })
            .unwrap()
            .to_path_buf();
        let host = CommandHost::new(RuntimeRegistry {
            bundled_node: python.clone(),
            bundled_python: python,
            approved_program: PathBuf::from("/usr/bin/true"),
            read_roots: vec![bundle],
        });
        let code="import subprocess,time\np=subprocess.Popen(['/bin/sleep','10'])\nopen('child.pid','w').write(str(p.pid))\ntime.sleep(10)";
        host.run(
            &files,
            files.scope_key(),
            "tree",
            CommandRequest {
                argv: vec!["-c".into(), code.into()],
                cwd: ".".into(),
                runtime_id: "bundled-python".into(),
                timeout_ms: 15000,
                stdin_ref: None,
            },
        )
        .unwrap();
        let mut pid = None;
        for _ in 0..100 {
            if let Ok(Some((bytes, _))) = files.read("child.pid") {
                pid = String::from_utf8(bytes)
                    .ok()
                    .and_then(|s| s.parse::<i32>().ok());
                if pid.is_some() {
                    break;
                }
            }
            std::thread::sleep(Duration::from_millis(20));
        }
        let pid = pid.unwrap_or_else(|| {
            panic!(
                "sandboxed Python did not spawn child: {:?}",
                host.status(files.scope_key(), "tree")
            )
        });
        assert_eq!(
            host.cancel(files.scope_key(), "tree").unwrap().state,
            "cancelled"
        );
        let mut gone = false;
        for _ in 0..100 {
            if unsafe { libc::kill(pid, 0) } != 0 {
                gone = true;
                break;
            }
            std::thread::sleep(Duration::from_millis(20));
        }
        assert!(gone, "descendant survived cancellation: {pid}");
        fs::remove_dir_all(root).unwrap();
    }
}
