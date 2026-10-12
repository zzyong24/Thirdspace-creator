//! Windows candidate for the controlled command host.
//!
//! Production remains fail-closed until the AppContainer, private Pipe and
//! versioned import path pass on a real Windows installation. Tests can opt
//! into the candidate without exposing it to the shipping desktop binary.
#[cfg(test)]
use super::files::FileError;
use super::files::{validate_relative, TaskFiles};
#[cfg(all(windows, test))]
use sha2::{Digest, Sha256};
#[cfg(test)]
use std::collections::HashMap;
use std::{
    fs, io,
    path::{Path, PathBuf},
};
#[cfg(all(windows, test))]
use std::{
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};

#[cfg(all(windows, test))]
#[path = "command_windows_sandbox.rs"]
mod sandbox;

// CommandLineToArgvW-compatible escaping. The application path is passed
// separately to CreateProcessW; this encodes argv only, never a shell line.
#[cfg(test)]
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
    VersionConflict,
    ResultUnknown,
    Unavailable(String),
    Io(io::Error),
    WrongScope,
    AlreadyRunning,
}

#[cfg(test)]
const MAX_SNAPSHOT_FILES: usize = 128;
#[cfg(test)]
const MAX_SNAPSHOT_BYTES: usize = 16_000_000;
#[cfg(test)]
const MAX_SINGLE_FILE_BYTES: u64 = 1_000_000;

#[cfg(test)]
#[derive(Clone)]
struct SnapshotFile {
    path: String,
    bytes: Vec<u8>,
    version: u64,
}
#[cfg(test)]
struct ImportFile {
    path: String,
    bytes: Vec<u8>,
    expected_version: u64,
}

#[cfg(test)]
fn file_state(files: &TaskFiles, path: &str) -> Result<Option<(bool, u64, u64)>, CommandError> {
    match files.stat(path) {
        Ok(state) => Ok(state),
        Err(FileError::Io(error)) if error.kind() == io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(CommandError::Unavailable(format!(
            "任务文件状态不可用: {error:?}"
        ))),
    }
}

#[cfg(test)]
fn collect_snapshot(files: &TaskFiles) -> Result<Vec<SnapshotFile>, CommandError> {
    fn visit(
        files: &TaskFiles,
        dir: Option<&str>,
        out: &mut Vec<SnapshotFile>,
        total: &mut usize,
        seen: &mut usize,
    ) -> Result<(), CommandError> {
        let names = files.list(dir).map_err(|_| CommandError::InvalidInput)?;
        for name in names {
            *seen += 1;
            if *seen > MAX_SNAPSHOT_FILES * 2 {
                return Err(CommandError::Unavailable("任务快照条目超出上限".into()));
            }
            let path = match dir {
                Some(parent) => format!("{parent}/{name}"),
                None => name,
            };
            validate_relative(&path).map_err(|_| CommandError::InvalidInput)?;
            let (is_dir, size, version) =
                file_state(files, &path)?.ok_or(CommandError::VersionConflict)?;
            if is_dir {
                visit(files, Some(&path), out, total, seen)?;
                continue;
            }
            if out.len() >= MAX_SNAPSHOT_FILES
                || size > MAX_SINGLE_FILE_BYTES
                || size as usize > MAX_SNAPSHOT_BYTES.saturating_sub(*total)
            {
                return Err(CommandError::Unavailable("任务快照超出受限命令上限".into()));
            }
            let (bytes, read_version) = files
                .read(&path)
                .map_err(|_| CommandError::VersionConflict)?
                .ok_or(CommandError::VersionConflict)?;
            if read_version != version || bytes.len() as u64 != size {
                return Err(CommandError::VersionConflict);
            }
            *total += bytes.len();
            out.push(SnapshotFile {
                path,
                bytes,
                version,
            });
        }
        Ok(())
    }
    let mut out = Vec::new();
    visit(files, None, &mut out, &mut 0, &mut 0)?;
    Ok(out)
}

#[cfg(test)]
fn scan_output(root: &Path) -> Result<HashMap<String, Vec<u8>>, CommandError> {
    fn visit(
        dir: &Path,
        relative: &str,
        out: &mut HashMap<String, Vec<u8>>,
        total: &mut usize,
        seen: &mut usize,
    ) -> Result<(), CommandError> {
        for entry in fs::read_dir(dir)? {
            *seen += 1;
            if *seen > MAX_SNAPSHOT_FILES * 2 {
                return Err(CommandError::Unavailable("命令输出条目超出上限".into()));
            }
            let entry = entry?;
            let name = entry
                .file_name()
                .into_string()
                .map_err(|_| CommandError::InvalidInput)?;
            let path = if relative.is_empty() {
                name
            } else {
                format!("{relative}/{name}")
            };
            validate_relative(&path).map_err(|_| CommandError::InvalidInput)?;
            let meta = fs::symlink_metadata(entry.path())?;
            #[cfg(windows)]
            let reparse = {
                use std::os::windows::fs::MetadataExt;
                meta.file_attributes()
                    & windows_sys::Win32::Storage::FileSystem::FILE_ATTRIBUTE_REPARSE_POINT
                    != 0
            };
            #[cfg(not(windows))]
            let reparse = meta.file_type().is_symlink();
            if reparse {
                return Err(CommandError::InvalidInput);
            }
            if meta.is_dir() {
                visit(&entry.path(), &path, out, total, seen)?;
            } else if meta.is_file() {
                if out.len() >= MAX_SNAPSHOT_FILES
                    || meta.len() > MAX_SINGLE_FILE_BYTES
                    || meta.len() as usize > MAX_SNAPSHOT_BYTES.saturating_sub(*total)
                {
                    return Err(CommandError::Unavailable("命令输出超出回写上限".into()));
                }
                let bytes = fs::read(entry.path())?;
                if bytes.len() as u64 != meta.len() {
                    return Err(CommandError::ResultUnknown);
                }
                *total += bytes.len();
                out.insert(path, bytes);
            } else {
                return Err(CommandError::InvalidInput);
            }
        }
        Ok(())
    }
    let mut out = HashMap::new();
    visit(root, "", &mut out, &mut 0, &mut 0)?;
    Ok(out)
}

#[cfg(test)]
fn plan_import(
    files: &TaskFiles,
    snapshot: &[SnapshotFile],
    root: &Path,
) -> Result<Vec<ImportFile>, CommandError> {
    let output = scan_output(root)?;
    let originals: HashMap<&str, &SnapshotFile> = snapshot
        .iter()
        .map(|item| (item.path.as_str(), item))
        .collect();
    for item in snapshot {
        let current = file_state(files, &item.path)?.ok_or(CommandError::VersionConflict)?;
        if current.0 || current.2 != item.version || current.1 != item.bytes.len() as u64 {
            return Err(CommandError::VersionConflict);
        }
        if !output.contains_key(&item.path) {
            return Err(CommandError::InvalidInput);
        }
    }
    let mut planned = Vec::new();
    for (path, bytes) in output {
        let original = originals.get(path.as_str());
        if original.is_some_and(|item| item.bytes == bytes) {
            continue;
        }
        let current = file_state(files, &path)?;
        let expected_version = original.map_or(0, |item| item.version);
        if current.is_some_and(|(is_dir, _, version)| is_dir || version != expected_version)
            || (current.is_none() && original.is_some())
        {
            return Err(CommandError::VersionConflict);
        }
        planned.push(ImportFile {
            path,
            bytes,
            expected_version,
        });
    }
    planned.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(planned)
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
    #[cfg(all(windows, test))]
    entries: Mutex<HashMap<(String, String), CandidateEntry>>,
}

#[cfg(all(windows, test))]
struct CandidateEntry {
    files: Arc<TaskFiles>,
    process: sandbox::SandboxedProcess,
    snapshot: Vec<SnapshotFile>,
    started: Instant,
    timeout: Duration,
    receipt: CommandReceipt,
    stdout: Vec<u8>,
    stderr: Vec<u8>,
}

impl CommandHost {
    pub fn new(runtimes: RuntimeRegistry) -> Self {
        Self {
            runtimes,
            #[cfg(all(windows, test))]
            entries: Mutex::new(HashMap::new()),
        }
    }
    fn validate_request(
        &self,
        files: &TaskFiles,
        operation_id: &str,
        request: &CommandRequest,
    ) -> Result<(PathBuf, Vec<u8>, PathBuf), CommandError> {
        if operation_id.is_empty()
            || operation_id.len() > 160
            || operation_id.chars().any(char::is_control)
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
        let stdin = if let Some(path) = request.stdin_ref.as_deref() {
            validate_relative(path).map_err(|_| CommandError::InvalidInput)?;
            files
                .read(path)
                .map_err(|_| CommandError::InvalidInput)?
                .ok_or(CommandError::InvalidInput)?
                .0
        } else {
            Vec::new()
        };
        let runtime = self.runtimes.runtime(&request.runtime_id)?;
        let relative_cwd = if request.cwd == "." {
            PathBuf::from(".")
        } else {
            PathBuf::from(&request.cwd)
        };
        Ok((runtime, stdin, relative_cwd))
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
        self.validate_request(files, operation_id, &request)?;
        // SEMANTIC_BOUNDARY_ALLOW: this is an OS authorization check, not a
        // creative choice. The test-only AppContainer/import candidate still
        // lacks Windows installation proof; no production operation is admitted.
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

#[cfg(all(windows, test))]
impl CommandHost {
    /// This entry point is absent from production binaries. Windows test runners
    /// must also set CREATOROS_T1007_WINDOWS_COMMAND_PROBE=1 explicitly.
    pub(crate) fn run_candidate(
        &self,
        files: Arc<TaskFiles>,
        scope: &str,
        operation_id: &str,
        request: CommandRequest,
    ) -> Result<CommandReceipt, CommandError> {
        if std::env::var("CREATOROS_T1007_WINDOWS_COMMAND_PROBE")
            .ok()
            .as_deref()
            != Some("1")
        {
            return Err(confinement_unavailable());
        }
        if !scope.starts_with(&format!("{}|", files.scope_key()))
            || scope.chars().any(char::is_control)
        {
            return Err(CommandError::WrongScope);
        }
        let (runtime, _, cwd) = self.validate_request(&files, operation_id, &request)?;
        let snapshot = collect_snapshot(&files)?;
        let stdin = if let Some(path) = request.stdin_ref.as_deref() {
            let canonical = validate_relative(path)
                .map_err(|_| CommandError::InvalidInput)?
                .join("/");
            snapshot
                .iter()
                .find(|item| item.path == canonical)
                .ok_or(CommandError::VersionConflict)?
                .bytes
                .clone()
        } else {
            Vec::new()
        };
        let staged: Vec<_> = snapshot
            .iter()
            .map(|item| (PathBuf::from(&item.path), item.bytes.clone()))
            .collect();
        let mut entries = self
            .entries
            .lock()
            .map_err(|_| CommandError::ResultUnknown)?;
        let key = (scope.to_owned(), operation_id.to_owned());
        if entries.contains_key(&key) {
            return Err(CommandError::AlreadyRunning);
        }
        if entries.len() >= 128 {
            return Err(CommandError::Unavailable("命令并发上限".into()));
        }
        let process = sandbox::launch(&runtime, &request.argv, &staged, &stdin, &cwd)?;
        let output_key = format!("{:x}", Sha256::digest(operation_id.as_bytes()));
        let receipt = CommandReceipt {
            operation_id: operation_id.to_owned(),
            state: "running".into(),
            exit_code: None,
            stdout_ref: format!("command:{output_key}:stdout"),
            stderr_ref: format!("command:{output_key}:stderr"),
            stdout_preview: String::new(),
            stderr_preview: String::new(),
            truncated: false,
        };
        entries.insert(
            key,
            CandidateEntry {
                files,
                process,
                snapshot,
                started: Instant::now(),
                timeout: Duration::from_millis(request.timeout_ms),
                receipt: receipt.clone(),
                stdout: Vec::new(),
                stderr: Vec::new(),
            },
        );
        Ok(receipt)
    }

    fn settle(entry: &mut CandidateEntry) -> Result<(), CommandError> {
        if entry.receipt.state != "running" {
            return Ok(());
        }
        let exit = match entry.process.wait(0) {
            Ok(exit) => exit,
            Err(error) => {
                entry.receipt.state = "unknown".into();
                entry.receipt.stderr_preview = format!("进程状态待核对: {error}");
                return Ok(());
            }
        };
        if exit.is_none() && entry.started.elapsed() < entry.timeout {
            return Ok(());
        }
        if let Err(error) = entry.process.cancel() {
            entry.receipt.state = "unknown".into();
            entry.receipt.stderr_preview = format!("进程树状态待核对: {error}");
            return Ok(());
        }
        if exit.is_none() {
            entry.receipt.state = "timed_out".into();
        } else {
            // Parent exit is not enough: a descendant could still mutate the
            // snapshot. Terminate the whole Job before inspecting any output.
            entry.receipt.exit_code = exit;
            entry.receipt.state = if exit == Some(0) {
                "succeeded"
            } else {
                "failed"
            }
            .into();
        }
        let (stdout, stdout_more) = match read_bounded(&entry.process.work().join("stdout.bin")) {
            Ok(output) => output,
            Err(error) => {
                entry.receipt.state = "unknown".into();
                entry.receipt.stderr_preview = format!("stdout 回读待核对: {error:?}");
                return Ok(());
            }
        };
        let (stderr, stderr_more) = match read_bounded(&entry.process.work().join("stderr.bin")) {
            Ok(output) => output,
            Err(error) => {
                entry.receipt.state = "unknown".into();
                entry.receipt.stderr_preview = format!("stderr 回读待核对: {error:?}");
                return Ok(());
            }
        };
        entry.receipt.stdout_preview =
            String::from_utf8_lossy(&stdout[..stdout.len().min(4096)]).into_owned();
        entry.receipt.stderr_preview =
            String::from_utf8_lossy(&stderr[..stderr.len().min(4096)]).into_owned();
        entry.receipt.truncated = stdout_more || stderr_more;
        entry.stdout = stdout;
        entry.stderr = stderr;
        if entry.receipt.state == "succeeded" {
            match plan_import(&entry.files, &entry.snapshot, &entry.process.task_work()) {
                Ok(planned) => {
                    for item in planned {
                        if let Err(error) =
                            entry
                                .files
                                .write(&item.path, &item.bytes, item.expected_version)
                        {
                            // A failed atomic write may already have committed bytes.
                            // Never retry automatically or claim all outputs landed.
                            entry.receipt.state = "unknown".into();
                            entry.receipt.stderr_preview =
                                format!("版本安全回写结果待核对: {error:?}");
                            break;
                        }
                    }
                }
                Err(CommandError::VersionConflict) => {
                    entry.receipt.state = "failed".into();
                    entry.receipt.stderr_preview = "任务文件版本冲突，隔离输出未回写".into();
                }
                Err(error) => {
                    entry.receipt.state = if matches!(error, CommandError::ResultUnknown) {
                        "unknown"
                    } else {
                        "failed"
                    }
                    .into();
                    entry.receipt.stderr_preview = format!("隔离输出未回写: {error:?}");
                }
            }
        }
        Ok(())
    }

    fn entry<'a>(
        entries: &'a mut HashMap<(String, String), CandidateEntry>,
        scope: &str,
        operation_id: &str,
    ) -> Result<&'a mut CandidateEntry, CommandError> {
        entries
            .get_mut(&(scope.to_owned(), operation_id.to_owned()))
            .ok_or(CommandError::WrongScope)
    }
    pub(crate) fn status_candidate(
        &self,
        scope: &str,
        operation_id: &str,
    ) -> Result<CommandReceipt, CommandError> {
        let mut entries = self
            .entries
            .lock()
            .map_err(|_| CommandError::ResultUnknown)?;
        let entry = Self::entry(&mut entries, scope, operation_id)?;
        Self::settle(entry)?;
        Ok(entry.receipt.clone())
    }
    pub(crate) fn cancel_candidate(
        &self,
        scope: &str,
        operation_id: &str,
    ) -> Result<CommandReceipt, CommandError> {
        let mut entries = self
            .entries
            .lock()
            .map_err(|_| CommandError::ResultUnknown)?;
        let entry = Self::entry(&mut entries, scope, operation_id)?;
        if entry.receipt.state == "running" {
            entry.process.cancel()?;
            entry.receipt.state = "cancelled".into();
        }
        Ok(entry.receipt.clone())
    }
    pub(crate) fn read_candidate(
        &self,
        scope: &str,
        operation_id: &str,
        stream: &str,
        offset: u64,
        limit: usize,
    ) -> Result<(Vec<u8>, u64, bool), CommandError> {
        if !matches!(stream, "stdout" | "stderr") || limit == 0 || limit > 512_000 {
            return Err(CommandError::InvalidInput);
        }
        let mut entries = self
            .entries
            .lock()
            .map_err(|_| CommandError::ResultUnknown)?;
        let entry = Self::entry(&mut entries, scope, operation_id)?;
        Self::settle(entry)?;
        let bytes = if stream == "stdout" {
            &entry.stdout
        } else {
            &entry.stderr
        };
        let start = usize::try_from(offset)
            .unwrap_or(usize::MAX)
            .min(bytes.len());
        let end = start.saturating_add(limit).min(bytes.len());
        Ok((
            bytes[start..end].to_vec(),
            bytes.len() as u64,
            entry.receipt.truncated,
        ))
    }
}

#[cfg(all(windows, test))]
fn read_bounded(path: &Path) -> Result<(Vec<u8>, bool), CommandError> {
    use std::io::Read;
    let file = fs::File::open(path)?;
    let mut bytes = Vec::new();
    file.take(1_000_001).read_to_end(&mut bytes)?;
    let more = bytes.len() > 1_000_000;
    bytes.truncate(1_000_000);
    Ok((bytes, more))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn snapshot_import_preserves_versions_and_rejects_changed_source() {
        let (base, files, _host) = fixture();
        files.write("数据/原稿.txt", b"one", 0).unwrap();
        let snapshot = collect_snapshot(&files).unwrap();
        assert_eq!(snapshot.len(), 1);
        assert_eq!(snapshot[0].path, "数据/原稿.txt");
        assert_eq!(snapshot[0].version, 1);
        let work = base.join("isolated-output");
        fs::create_dir_all(work.join("数据")).unwrap();
        fs::write(work.join("数据/原稿.txt"), b"two").unwrap();
        fs::write(work.join("数据/新稿.txt"), b"new").unwrap();
        let planned = plan_import(&files, &snapshot, &work).unwrap();
        assert_eq!(planned.len(), 2);
        for item in planned {
            files
                .write(&item.path, &item.bytes, item.expected_version)
                .unwrap();
        }
        assert_eq!(
            files.read("数据/原稿.txt").unwrap().unwrap(),
            (b"two".to_vec(), 2)
        );
        assert_eq!(
            files.read("数据/新稿.txt").unwrap().unwrap(),
            (b"new".to_vec(), 1)
        );
        assert!(matches!(
            plan_import(&files, &snapshot, &work),
            Err(CommandError::VersionConflict)
        ));
        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn snapshot_import_rejects_output_links() {
        let (base, files, _host) = fixture();
        #[cfg(not(unix))]
        let _ = &files;
        let work = base.join("isolated-output");
        fs::create_dir_all(&work).unwrap();
        #[cfg(unix)]
        std::os::unix::fs::symlink(&files.root, work.join("escape")).unwrap();
        #[cfg(unix)]
        assert!(matches!(
            plan_import(&files, &[], &work),
            Err(CommandError::InvalidInput)
        ));
        fs::remove_dir_all(base).unwrap();
    }

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
            Path::new("."),
        )
        .unwrap();
        assert_eq!(process.wait(10_000).unwrap(), Some(0));
        assert_eq!(
            fs::read_to_string(process.task_work().join("inside.txt")).unwrap(),
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
            Path::new("."),
        )
        .unwrap();
        std::thread::sleep(Duration::from_millis(300));
        process.cancel().unwrap();
        std::thread::sleep(Duration::from_millis(1600));
        assert!(!process.task_work().join("escaped.txt").exists());
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
