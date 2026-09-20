//! Windows candidate for the controlled command host.
//!
//! A Job Object can terminate a process tree, but it does not restrict file
//! access. Until the child is launched with a tested restricted token or
//! AppContainer and task-root ACLs, execution must fail before spawning.
use super::files::{validate_relative, TaskFiles};
use std::{
    fs, io,
    path::{Path, PathBuf},
};

#[cfg(windows)]
#[path = "command_windows_sandbox.rs"]
mod sandbox;

// CommandLineToArgvW-compatible escaping. The application path is passed
// separately to CreateProcessW; this encodes argv only, never a shell line.
fn quote_windows_arg(value: &str) -> String {
    if !value.is_empty() && !value.chars().any(|c| c.is_whitespace() || c == '"') {
        return value.to_owned();
    }
    let mut encoded = String::from("\"");
    let mut slashes = 0;
    for ch in value.chars() {
        match ch {
            '\\' => slashes += 1,
            '"' => {
                encoded.extend(std::iter::repeat_n('\\', slashes * 2 + 1));
                encoded.push('"');
                slashes = 0;
            }
            _ => {
                encoded.extend(std::iter::repeat_n('\\', slashes));
                encoded.push(ch);
                slashes = 0;
            }
        }
    }
    encoded.extend(std::iter::repeat_n('\\', slashes * 2));
    encoded.push('"');
    encoded
}

#[derive(Clone)]
pub struct RuntimeRegistry {
    root: PathBuf,
}

impl RuntimeRegistry {
    /// The desktop host supplies its already verified, extracted sidecar path.
    /// Missing optional executables never fall back to PATH or system tools.
    pub fn from_sidecar(sidecar_dir: &Path) -> Result<Self, CommandError> {
        let root = fs::canonicalize(sidecar_dir)?;
        if !root.is_dir() {
            return Err(CommandError::Unavailable(
                "安装包 runtime 目录不存在".into(),
            ));
        }
        Ok(Self { root })
    }

    fn runtime(&self, id: &str) -> Result<PathBuf, CommandError> {
        let relative = match id {
            "bundled-node" => "cli/node.exe",
            "bundled-python" => "layers/local-ai/bin/python.exe",
            "approved-program" => "layers/workbench/bin/approved-program.exe",
            _ => return Err(CommandError::InvalidInput),
        };
        let candidate = self.root.join(relative);
        if !candidate.is_file() {
            return Err(CommandError::Unavailable("受管 runtime 不存在".into()));
        }
        let canonical = fs::canonicalize(candidate)?;
        if !canonical.starts_with(&self.root)
            || !canonical.is_file()
            || canonical
                .file_name()
                .and_then(|name| name.to_str())
                .is_none_or(|name| {
                    name.to_ascii_lowercase()
                        != Path::new(relative)
                            .file_name()
                            .unwrap()
                            .to_string_lossy()
                            .to_ascii_lowercase()
                })
        {
            return Err(CommandError::Unavailable(
                "runtime 不在安装包固定位置".into(),
            ));
        }
        Ok(canonical)
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
    fn from(error: io::Error) -> Self {
        Self::Io(error)
    }
}

fn confinement_unavailable() -> CommandError {
    CommandError::Unavailable(
        "Windows 受控命令未启用：尚无已验证的文件权限隔离与进程树启动边界".into(),
    )
}

pub struct CommandHost {
    runtimes: RuntimeRegistry,
}

impl CommandHost {
    pub fn new(runtimes: RuntimeRegistry) -> Self {
        Self { runtimes }
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
            || operation_id.contains('\0')
            || request.argv.is_empty()
            || request.argv.len() > 128
            || request
                .argv
                .iter()
                .any(|arg| arg.len() > 8192 || arg.contains('\0'))
            || request.timeout_ms == 0
            || request.timeout_ms > 3_600_000
        {
            return Err(CommandError::InvalidInput);
        }
        let cwd = if request.cwd == "." {
            files.root.clone()
        } else {
            let parts = validate_relative(&request.cwd).map_err(|_| CommandError::InvalidInput)?;
            if !files
                .stat(&request.cwd)
                .map_err(|_| CommandError::InvalidInput)?
                .is_some_and(|(is_dir, _, _)| is_dir)
            {
                return Err(CommandError::InvalidInput);
            }
            files.root.join(parts.join("/"))
        };
        let canonical_root = fs::canonicalize(&files.root)?;
        let canonical_cwd = fs::canonicalize(cwd)?;
        if !canonical_cwd.starts_with(&canonical_root)
            || !canonical_cwd.is_dir()
            || canonical_root.starts_with(&self.runtimes.root)
            || self.runtimes.root.starts_with(files.base())
        {
            return Err(CommandError::InvalidInput);
        }
        if let Some(path) = request.stdin_ref.as_deref() {
            validate_relative(path).map_err(|_| CommandError::InvalidInput)?;
            if !files
                .stat(path)
                .map_err(|_| CommandError::InvalidInput)?
                .is_some_and(|(is_dir, _, _)| !is_dir)
            {
                return Err(CommandError::InvalidInput);
            }
        }
        self.runtimes.runtime(&request.runtime_id)?;
        // SEMANTIC_BOUNDARY_ALLOW: this is an OS authorization check, not a
        // creative choice. The separate AppContainer launcher has no Windows
        // runtime proof or version-safe task-file import yet. A cwd check,
        // clean environment and Job Object alone do not authorize execution.
        // No operation is dispatched or reserved; retry has no side effect.
        Err(confinement_unavailable())
    }
    /// No command is admitted until execution confinement exists.
    pub fn status(
        &self,
        _scope: &str,
        _operation_id: &str,
    ) -> Result<CommandReceipt, CommandError> {
        Err(confinement_unavailable())
    }
    pub fn cancel(
        &self,
        _scope: &str,
        _operation_id: &str,
    ) -> Result<CommandReceipt, CommandError> {
        Err(confinement_unavailable())
    }
    pub fn read_output(
        &self,
        _scope: &str,
        _operation_id: &str,
        _stream: &str,
        _offset: u64,
        _limit: usize,
    ) -> Result<(Vec<u8>, bool), CommandError> {
        Err(confinement_unavailable())
    }
    /// Nothing is admitted, so there is no process or deadline to reap.
    pub fn reap(&self) {}
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn argv_is_quoted_without_a_shell_or_argument_merging() {
        assert_eq!(quote_windows_arg("plain"), "plain");
        assert_eq!(quote_windows_arg("含 空格"), "\"含 空格\"");
        assert_eq!(quote_windows_arg(""), "\"\"");
        assert_eq!(quote_windows_arg("a\"b"), "\"a\\\"b\"");
        assert_eq!(quote_windows_arg("a b\\"), "\"a b\\\\\"");
    }

    #[cfg(windows)]
    #[test]
    #[ignore = "requires a real Windows runner and CREATOROS_T1007_WINDOWS_PACKAGED_NODE"]
    fn real_appcontainer_rejects_other_files_and_loopback() {
        use std::net::TcpListener;
        let node = PathBuf::from(
            std::env::var_os("CREATOROS_T1007_WINDOWS_PACKAGED_NODE")
                .expect("set the verified installed Node runtime path"),
        );
        let outside =
            std::env::temp_dir().join(format!("creatoros-secret-{}", rand::random::<u64>()));
        fs::write(&outside, b"secret").unwrap();
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        listener.set_nonblocking(true).unwrap();
        let port = listener.local_addr().unwrap().port();
        let script = br#"
const fs = require('fs'), net = require('net');
fs.writeFileSync('inside.txt', 'inside');
let outside = 'blocked';
try { fs.readFileSync(process.argv[2]); outside = 'escaped'; } catch {}
const env = process.env.CREATOROS_T1007_WINDOWS_PACKAGED_NODE === undefined ? 'clean' : 'leaked';
const socket = net.connect(Number(process.argv[3]), '127.0.0.1');
socket.on('connect', () => { console.log(outside + ':connected:' + env); socket.destroy(); });
socket.on('error', () => console.log(outside + ':blocked:' + env));
setTimeout(() => { console.log(outside + ':timeout:' + env); socket.destroy(); }, 1000).unref();
"#;
        let process = sandbox::launch(
            &node,
            &[
                "probe.js".into(),
                outside.to_string_lossy().into_owned(),
                port.to_string(),
            ],
            &[(PathBuf::from("probe.js"), script.to_vec())],
            &[],
        )
        .unwrap();
        assert_eq!(process.wait(10_000).unwrap(), Some(0));
        assert_eq!(
            fs::read_to_string(process.work().join("inside.txt")).unwrap(),
            "inside"
        );
        assert_eq!(
            fs::read_to_string(process.work().join("stdout.bin"))
                .unwrap()
                .trim(),
            "blocked:blocked:clean"
        );
        assert!(
            listener.accept().is_err(),
            "AppContainer reached the loopback listener"
        );
        drop(process);
        fs::remove_file(outside).unwrap();
    }

    #[cfg(windows)]
    #[test]
    #[ignore = "requires a real Windows runner and CREATOROS_T1007_WINDOWS_PACKAGED_NODE"]
    fn real_job_cancel_kills_descendant_before_it_can_write() {
        use std::time::Duration;
        let node = PathBuf::from(
            std::env::var_os("CREATOROS_T1007_WINDOWS_PACKAGED_NODE")
                .expect("set the verified installed Node runtime path"),
        );
        let script = br#"
const cp = require('child_process');
cp.spawn(process.execPath, ['-e', "setTimeout(() => require('fs').writeFileSync('escaped.txt', 'bad'), 1500)"]);
setTimeout(() => {}, 3000);
"#;
        let process = sandbox::launch(
            &node,
            &["probe.js".into()],
            &[(PathBuf::from("probe.js"), script.to_vec())],
            &[],
        )
        .unwrap();
        std::thread::sleep(Duration::from_millis(300));
        process.cancel().unwrap();
        std::thread::sleep(Duration::from_millis(1600));
        assert!(!process.work().join("escaped.txt").exists());
    }

    fn fixture() -> (PathBuf, TaskFiles, CommandHost) {
        let base =
            std::env::temp_dir().join(format!("creatoros-win-command-{}", rand::random::<u64>()));
        let sidecar = base.join("sidecar");
        fs::create_dir_all(sidecar.join("cli")).unwrap();
        fs::write(sidecar.join("cli/node.exe"), b"not executable").unwrap();
        let files = TaskFiles::new(&base.join("tasks"), "user", "account", "task").unwrap();
        let host = CommandHost::new(RuntimeRegistry::from_sidecar(&sidecar).unwrap());
        (base, files, host)
    }

    fn request() -> CommandRequest {
        CommandRequest {
            argv: vec!["-V".into()],
            cwd: ".".into(),
            runtime_id: "bundled-node".into(),
            timeout_ms: 1000,
            stdin_ref: None,
        }
    }

    #[test]
    fn rejects_forged_scope_and_bad_paths_before_admission() {
        let (base, files, host) = fixture();
        assert!(matches!(
            host.run(&files, "forged", "op", request()),
            Err(CommandError::WrongScope)
        ));
        let mut bad = request();
        bad.cwd = "../outside".into();
        assert!(matches!(
            host.run(&files, files.scope_key(), "op", bad),
            Err(CommandError::InvalidInput)
        ));
        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn valid_request_never_dispatches_without_file_confinement() {
        let (base, files, host) = fixture();
        for _ in 0..2 {
            assert!(matches!(
                host.run(&files, files.scope_key(), "op", request()),
                Err(CommandError::Unavailable(_))
            ));
        }
        assert!(matches!(
            host.status(files.scope_key(), "op"),
            Err(CommandError::Unavailable(_))
        ));
        assert!(matches!(
            host.cancel(files.scope_key(), "op"),
            Err(CommandError::Unavailable(_))
        ));
        assert!(matches!(
            host.read_output(files.scope_key(), "op", "stdout", 0, 10),
            Err(CommandError::Unavailable(_))
        ));
        host.reap();
        let state = files.root.parent().unwrap().join(format!(
            ".creatoros-state-{}",
            files.root.file_name().unwrap().to_string_lossy()
        ));
        assert!(!state.join("outputs").exists());
        fs::remove_dir_all(base).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn executable_packaged_runtime_is_not_spawned() {
        use std::os::unix::fs::PermissionsExt;
        let (base, files, host) = fixture();
        let node = base.join("sidecar/cli/node.exe");
        fs::write(&node, b"#!/bin/sh\nprintf touched > \"$1\"\n").unwrap();
        fs::set_permissions(&node, fs::Permissions::from_mode(0o700)).unwrap();
        let marker = base.join("spawned-outside-task");
        let mut req = request();
        req.argv = vec![marker.to_string_lossy().into_owned()];
        assert!(matches!(
            host.run(&files, files.scope_key(), "op", req),
            Err(CommandError::Unavailable(_))
        ));
        assert!(
            !marker.exists(),
            "Windows candidate spawned an unconfined child"
        );
        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn only_fixed_packaged_runtime_is_eligible() {
        let (base, files, host) = fixture();
        let mut unknown = request();
        unknown.runtime_id = "cmd.exe".into();
        assert!(matches!(
            host.run(&files, files.scope_key(), "op", unknown),
            Err(CommandError::InvalidInput)
        ));
        let mut missing = request();
        missing.runtime_id = "bundled-python".into();
        assert!(matches!(
            host.run(&files, files.scope_key(), "op", missing),
            Err(CommandError::Unavailable(_))
        ));
        let mut zero_timeout = request();
        zero_timeout.timeout_ms = 0;
        assert!(matches!(
            host.run(&files, files.scope_key(), "op", zero_timeout),
            Err(CommandError::InvalidInput)
        ));
        fs::remove_dir_all(base).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn packaged_runtime_symlink_cannot_escape_bundle() {
        use std::os::unix::fs::symlink;
        let (base, _files, host) = fixture();
        let node = base.join("sidecar/cli/node.exe");
        fs::remove_file(&node).unwrap();
        let outside = base.join("outside-node.exe");
        fs::write(&outside, b"not executable").unwrap();
        symlink(&outside, &node).unwrap();
        assert!(matches!(
            host.runtimes.runtime("bundled-node"),
            Err(CommandError::Unavailable(_))
        ));
        fs::remove_dir_all(base).unwrap();
    }
}
