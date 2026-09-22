//! T-1007 task-local file authority. On Unix every path component is opened relative
//! to a directory descriptor with O_NOFOLLOW; user text is never joined onto an
//! ambient filesystem path. Windows uses the same rule with directory-relative
//! native handles and rejects every reparse point before using an opened handle.
#[cfg(windows)]
#[path = "files_windows.rs"]
mod windows;
#[cfg(unix)]
use std::{
    ffi::CString,
    fs::File,
    io::{Read, Seek, Write},
    os::fd::{AsRawFd, FromRawFd, RawFd},
};
use std::{
    io,
    path::{Path, PathBuf},
};
use unicode_normalization::UnicodeNormalization;
use serde::{Deserialize, Serialize};

const MAX_SAFE_VERSION: u64 = 9_007_199_254_740_991;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct FileWriteRecord {
    pub schema_version: u32,
    pub scope_key: String,
    pub operation_id: String,
    pub request_digest: String,
    pub path: String,
    pub expected_version: Option<u64>,
    pub observed_base_version: u64,
    pub content_sha256: String,
    pub byte_length: u64,
    pub admitted_attempt: u32,
    pub fence_token: String,
    pub state: String,
    pub result_version: Option<u64>,
}

pub fn file_request_digest(scope: &str, operation: &str, path: &str, expected: Option<u64>, hash: &str, size: u64) -> String {
    use sha2::{Digest, Sha256};
    let encoded = serde_json::to_vec(&serde_json::json!([
        "creatoros-file-write-v1", scope, operation, path, expected, hash, size
    ])).expect("file identity is JSON");
    format!("sha256:{:x}", Sha256::digest(encoded))
}

#[derive(Debug)]
pub enum FileError {
    InvalidPath,
    Io(io::Error),
    Conflict { current_version: u64 },
    TooLarge,
    UnsupportedPlatform,
    OperationConflict,
    OperationPending,
    InvalidRecord,
}
impl From<io::Error> for FileError {
    fn from(value: io::Error) -> Self {
        Self::Io(value)
    }
}

pub fn validate_relative(path: &str) -> Result<Vec<String>, FileError> {
    if path.is_empty()
        || path.len() > 2048
        || path.starts_with('/')
        || path.contains('\\')
        || path.contains('\0')
        || path.as_bytes().get(1) == Some(&b':')
    {
        return Err(FileError::InvalidPath);
    }
    let normalized: String = path.nfc().collect();
    let parts: Vec<_> = normalized.split('/').map(str::to_string).collect();
    if parts.iter().any(|p| invalid_component(p)) {
        return Err(FileError::InvalidPath);
    }
    Ok(parts)
}
fn invalid_component(part: &str) -> bool {
    // SEMANTIC_BOUNDARY_ALLOW: these are filesystem/protocol safety checks;
    // they make no choice about the meaning or destination of user content.
    if part.is_empty()
        || part == "."
        || part == ".."
        || part
            .get(..11)
            .is_some_and(|prefix| prefix.eq_ignore_ascii_case(".creatoros-"))
        || part.ends_with([' ', '.'])
        || part
            .chars()
            .any(|c| c.is_control() || "<>:\"|?*".contains(c))
    {
        return true;
    }
    // Windows treats device names as reserved even with an extension. Superscript
    // digits are also recognized by Win32 for COM/LPT aliases. Reject on every
    // host so a task moved between macOS and Windows keeps the same path meaning.
    let stem = part.split('.').next().unwrap_or("").to_ascii_uppercase();
    matches!(
        stem.as_str(),
        "CON" | "PRN" | "AUX" | "NUL" | "CONIN$" | "CONOUT$"
    ) || ["COM", "LPT"].iter().any(|prefix| {
        stem.strip_prefix(prefix).is_some_and(|suffix| {
            suffix.chars().count() == 1
                && suffix
                    .chars()
                    .next()
                    .is_some_and(|c| matches!(c, '1'..='9' | '¹' | '²' | '³'))
        })
    })
}
fn key(id: &str) -> Result<String, FileError> {
    if id.is_empty() || id.len() > 160 || id.contains('\0') {
        return Err(FileError::InvalidPath);
    }
    use sha2::{Digest, Sha256};
    Ok(format!("{:x}", Sha256::digest(id.as_bytes())))
}

pub struct TaskFiles {
    pub root: PathBuf,
    base: PathBuf,
    scope_key: String,
    #[cfg(unix)]
    task: File,
    // This sibling directory is outside the writable command sandbox.
    #[cfg(unix)]
    state: File,
    #[cfg(windows)]
    task: std::fs::File,
    #[cfg(windows)]
    state: std::fs::File,
}
impl TaskFiles {
    /// The ledger operation owns a durable receipt. Re-entry never retries a
    /// prepared write; only a matching committed receipt can be replayed.
    #[cfg(any(unix, windows))]
    pub fn write_operation(&self, operation: &str, attempt: u32, fence: &str, path: &str,
        content: &[u8], expected: Option<u64>) -> Result<u64, FileError> {
        use sha2::{Digest, Sha256};
        let path = validate_relative(path)?.join("/");
        if operation.is_empty() || operation.len() > 160 || operation.chars().any(char::is_control) ||
            attempt == 0 || fence.is_empty() || fence.len() > 160 || fence.chars().any(char::is_control) ||
            expected.is_some_and(|v| v >= MAX_SAFE_VERSION) { return Err(FileError::InvalidPath); }
        if content.len() > 1_000_000 { return Err(FileError::TooLarge); }
        let hash = format!("sha256:{:x}", Sha256::digest(content));
        let digest = file_request_digest(&self.scope_key, operation, &path, expected, &hash, content.len() as u64);
        let _lock = self.operation_lock()?;
        if let Some(record) = self.operation_record(operation)? {
            if record.request_digest != digest { return Err(FileError::OperationConflict); }
            return record.result_version.ok_or(FileError::OperationPending);
        }
        // Deterministic path/CAS rejection happens before the WAL is prepared.
        let base = self.validate_write_locked(&path, expected)?;
        let mut record = FileWriteRecord {schema_version:1, scope_key:self.scope_key.clone(), operation_id:operation.into(),
            request_digest:digest, path:path.clone(), expected_version:expected, observed_base_version:base,
            content_sha256:hash, byte_length:content.len() as u64, admitted_attempt:attempt, fence_token:fence.into(),
            state:"prepared".into(), result_version:None};
        self.save_operation_record(&record)?;
        self.file_write_fault("prepared")?;
        let version = self.write_locked(&path, content, base)?;
        self.file_write_fault("metadata")?;
        record.state = "committed".into();
        record.result_version = Some(version);
        self.save_operation_record(&record)?;
        self.file_write_fault("committed")?;
        Ok(version)
    }

    #[cfg(any(unix, windows))]
    pub fn file_receipt(&self, operation: &str, path: &str, expected: Option<u64>, hash: &str, size: u64)
        -> Result<Option<FileWriteRecord>, FileError> {
        let path = validate_relative(path)?.join("/");
        if operation.is_empty() || operation.len() > 160 || operation.chars().any(char::is_control) || size > 1_000_000 ||
            expected.is_some_and(|v| v >= MAX_SAFE_VERSION) || hash.len()!=71 || !hash.starts_with("sha256:") ||
            !hash[7..].bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b)) { return Err(FileError::InvalidPath); }
        let _lock = self.operation_lock()?;
        let record = self.operation_record(operation)?;
        if record.as_ref().is_some_and(|r| r.request_digest != file_request_digest(&self.scope_key, operation, &path, expected, hash, size)) {
            return Err(FileError::OperationConflict);
        }
        Ok(record)
    }

    #[cfg(any(unix, windows))]
    fn operation_record(&self, operation: &str) -> Result<Option<FileWriteRecord>, FileError> {
        let Some(bytes) = self.read_operation_bytes(operation)? else { return Ok(None); };
        let r: FileWriteRecord = serde_json::from_slice(&bytes).map_err(|_| FileError::InvalidRecord)?;
        let canonical = validate_relative(&r.path).map_err(|_| FileError::InvalidRecord)?.join("/");
        if r.schema_version!=1 || r.scope_key!=self.scope_key || r.operation_id!=operation || canonical!=r.path ||
            r.observed_base_version>=MAX_SAFE_VERSION || r.expected_version.is_some_and(|v| v>=MAX_SAFE_VERSION || v!=r.observed_base_version) ||
            (r.expected_version.is_none() && r.observed_base_version!=0) || r.byte_length>1_000_000 ||
            r.admitted_attempt==0 || r.fence_token.is_empty() || r.fence_token.len()>160 ||
            r.content_sha256.len()!=71 || !r.content_sha256.starts_with("sha256:") ||
            !r.content_sha256[7..].bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b)) ||
            r.request_digest!=file_request_digest(&self.scope_key,operation,&r.path,r.expected_version,&r.content_sha256,r.byte_length) ||
            !matches!((r.state.as_str(),r.result_version),("prepared",None)) &&
            !(r.state=="committed" && r.result_version==Some(r.observed_base_version+1)) { return Err(FileError::InvalidRecord); }
        Ok(Some(r))
    }

    fn file_write_fault(&self, _stage: &str) -> Result<(), FileError> {
        #[cfg(test)]
        if FILE_WRITE_FAULT.with(|point| point.borrow().as_deref()==Some(_stage)) {
            return Err(io::Error::other(format!("isolated file write fault: {_stage}")).into());
        }
        Ok(())
    }

    #[cfg(unix)]
    fn operation_lock(&self) -> Result<File, FileError> { self.lock() }

    #[cfg(unix)]
    fn read_operation_bytes(&self, operation: &str) -> Result<Option<Vec<u8>>, FileError> {
        let read = || -> Result<Vec<u8>, FileError> {
            let dir = open_dir_at(self.state.as_raw_fd(), "file-operations")?;
            let file = open_file_at(dir.as_raw_fd(), &key(operation)?, libc::O_RDONLY, 0)?;
            let mut bytes = Vec::new();
            file.take(16_385).read_to_end(&mut bytes)?;
            if bytes.len()>16_384 {return Err(FileError::InvalidRecord);}
            Ok(bytes)
        };
        match read() { Ok(value)=>Ok(Some(value)), Err(FileError::Io(e)) if e.kind()==io::ErrorKind::NotFound=>Ok(None), Err(e)=>Err(e) }
    }

    #[cfg(unix)]
    fn save_operation_record(&self, record: &FileWriteRecord) -> Result<(), FileError> {
        let dir = ensure_dir(self.state.as_raw_fd(), "file-operations")?;
        self.state.sync_all()?; // includes the first creation of the journal directory
        let temp = format!(".creatoros-tmp-{}", rand::random::<u64>());
        let mut file = open_file_at(dir.as_raw_fd(), &temp, libc::O_WRONLY|libc::O_CREAT|libc::O_EXCL, 0o600)?;
        let result = (|| -> Result<(), FileError> {
            file.write_all(&serde_json::to_vec(record).map_err(|_| FileError::InvalidRecord)?)?;
            file.sync_all()?;
            rename_at(dir.as_raw_fd(), &temp, dir.as_raw_fd(), &key(&record.operation_id)?)?;
            dir.sync_all()?;
            Ok(())
        })();
        if result.is_err() { let _=unlink_at(dir.as_raw_fd(),&temp); }
        result
    }

    #[cfg(unix)]
    fn validate_write_locked(&self, path: &str, expected: Option<u64>) -> Result<u64, FileError> {
        let (parent, name) = self.parent(path, true)?;
        let hash = Self::hash_at(parent.as_raw_fd(), &name)?;
        let version = self.current_version(path, hash.as_deref())?;
        if version>=MAX_SAFE_VERSION {return Err(FileError::InvalidPath);}
        if expected.map_or(hash.is_some() || version!=0, |v| v!=version) {
            return Err(FileError::Conflict {current_version:version});
        }
        Ok(version)
    }
    /// `base` is provisioned by the desktop host, and IDs come only from the
    /// backend execution lease. Never construct this from invocation input.
    pub fn new(
        base: &Path,
        user_id: &str,
        account_id: &str,
        task_id: &str,
    ) -> Result<Self, FileError> {
        let user = key(user_id)?;
        let account = key(account_id)?;
        let task = key(task_id)?;
        #[cfg(unix)]
        {
            std::fs::create_dir_all(base)?;
            let base = std::fs::canonicalize(base)?;
            let base_fd = open_dir_path(&base)?;
            let users = ensure_dir(base_fd.as_raw_fd(), "users")?;
            let user_fd = ensure_dir(users.as_raw_fd(), &user)?;
            let accounts = ensure_dir(user_fd.as_raw_fd(), "accounts")?;
            let account_fd = ensure_dir(accounts.as_raw_fd(), &account)?;
            let task_fd = ensure_dir(account_fd.as_raw_fd(), &task)?;
            let state = ensure_dir(account_fd.as_raw_fd(), &format!(".creatoros-state-{task}"))?;
            let root = base
                .join("users")
                .join(&user)
                .join("accounts")
                .join(&account)
                .join(&task);
            return Ok(Self {
                root,
                base,
                scope_key: format!("{user}:{account}:{task}"),
                task: task_fd,
                state,
            });
        }
        #[cfg(windows)]
        {
            Self::new_windows(base, user, account, task)
        }
        #[cfg(not(any(unix, windows)))]
        {
            let _ = (base, user, account, task);
            Err(FileError::UnsupportedPlatform)
        }
    }
    pub fn scope_key(&self) -> &str {
        &self.scope_key
    }
    pub fn base(&self) -> &Path {
        &self.base
    }
    #[cfg(unix)]
    fn parent(&self, path: &str, create: bool) -> Result<(File, String), FileError> {
        let parts = validate_relative(path)?;
        let mut dir = self.task.try_clone()?;
        for part in &parts[..parts.len() - 1] {
            dir = if create {
                ensure_dir(dir.as_raw_fd(), part)?
            } else {
                open_dir_at(dir.as_raw_fd(), part)?
            };
        }
        Ok((dir, parts.last().unwrap().to_string()))
    }
    #[cfg(unix)]
    fn lock(&self) -> Result<File, FileError> {
        let file = open_file_at(
            self.state.as_raw_fd(),
            "lock",
            libc::O_RDWR | libc::O_CREAT,
            0o600,
        )?;
        if unsafe { libc::flock(file.as_raw_fd(), libc::LOCK_EX) } != 0 {
            return Err(io::Error::last_os_error().into());
        }
        Ok(file)
    }
    #[cfg(unix)]
    fn version_dir(&self) -> Result<File, FileError> {
        ensure_dir(self.state.as_raw_fd(), "versions")
    }
    #[cfg(unix)]
    pub fn output_dir(&self) -> Result<PathBuf, FileError> {
        let _fd = ensure_dir(self.state.as_raw_fd(), "outputs")?;
        let state_name = format!(
            ".creatoros-state-{}",
            self.root
                .file_name()
                .ok_or(FileError::InvalidPath)?
                .to_string_lossy()
        );
        Ok(self
            .root
            .parent()
            .ok_or(FileError::InvalidPath)?
            .join(state_name)
            .join("outputs"))
    }
    #[cfg(unix)]
    fn record_name(path: &str) -> String {
        use sha2::{Digest, Sha256};
        format!("{:x}", Sha256::digest(path.as_bytes()))
    }
    #[cfg(unix)]
    fn current_version(&self, path: &str, current_hash: Option<&str>) -> Result<u64, FileError> {
        let versions = self.version_dir()?;
        let name = Self::record_name(path);
        let mut data = String::new();
        match open_file_at(versions.as_raw_fd(), &name, libc::O_RDONLY, 0) {
            Ok(mut f) => {
                f.read_to_string(&mut data)?;
            }
            Err(FileError::Io(e)) if e.kind() == io::ErrorKind::NotFound => {
                return Ok(if current_hash.is_some() { 1 } else { 0 })
            }
            Err(e) => return Err(e),
        }
        let mut fields = data.split(' ');
        let version = fields
            .next()
            .and_then(|s| s.parse::<u64>().ok())
            .ok_or(FileError::InvalidPath)?;
        let hash = fields.next().ok_or(FileError::InvalidPath)?;
        if hash == current_hash.unwrap_or("absent") {
            Ok(version)
        } else {
            Ok(version + 1)
        }
    }
    #[cfg(unix)]
    fn digest(content: &[u8]) -> String {
        use sha2::{Digest, Sha256};
        format!("{:x}", Sha256::digest(content))
    }
    #[cfg(unix)]
    fn hash_file(file: &mut File) -> Result<String, FileError> {
        use sha2::{Digest, Sha256};
        file.seek(io::SeekFrom::Start(0))?;
        let mut hash = Sha256::new();
        let mut buffer = [0u8; 65_536];
        loop {
            let n = file.read(&mut buffer)?;
            if n == 0 {
                break;
            }
            hash.update(&buffer[..n]);
        }
        Ok(format!("{:x}", hash.finalize()))
    }
    #[cfg(unix)]
    fn hash_at(parent: RawFd, name: &str) -> Result<Option<String>, FileError> {
        match open_file_at(parent, name, libc::O_RDONLY, 0) {
            Ok(mut f) => Ok(Some(Self::hash_file(&mut f)?)),
            Err(FileError::Io(e)) if e.kind() == io::ErrorKind::NotFound => Ok(None),
            Err(e) => Err(e),
        }
    }
    #[cfg(unix)]
    pub fn read(&self, path: &str) -> Result<Option<(Vec<u8>, u64)>, FileError> {
        let page = self.read_page(path, 0, 1_000_000)?;
        if page
            .as_ref()
            .is_some_and(|(_, total, _)| *total > 1_000_000)
        {
            return Err(FileError::TooLarge);
        }
        Ok(page.map(|(bytes, _, version)| (bytes, version)))
    }
    #[cfg(unix)]
    pub fn read_page(
        &self,
        path: &str,
        offset: u64,
        limit: usize,
    ) -> Result<Option<(Vec<u8>, u64, u64)>, FileError> {
        if limit == 0 || limit > 1_000_000 {
            return Err(FileError::InvalidPath);
        }
        let path = validate_relative(path)?.join("/");
        let _lock = self.lock()?;
        let (parent, name) = match self.parent(&path, false) {
            Ok(parent) => parent,
            Err(FileError::Io(error)) if error.kind() == io::ErrorKind::NotFound => {
                return Ok(None)
            }
            Err(error) => return Err(error),
        };
        let mut file = match open_file_at(parent.as_raw_fd(), &name, libc::O_RDONLY, 0) {
            Ok(file) => file,
            Err(FileError::Io(e)) if e.kind() == io::ErrorKind::NotFound => return Ok(None),
            Err(e) => return Err(e),
        };
        let total = file.metadata()?.len();
        let hash = Self::hash_file(&mut file)?;
        let version = self.current_version(&path, Some(&hash))?;
        file.seek(io::SeekFrom::Start(offset))?;
        let mut bytes = Vec::new();
        file.take(limit as u64).read_to_end(&mut bytes)?;
        Ok(Some((bytes, total, version)))
    }
    /// Existing-file writes require expectedVersion. New files require 0. The
    /// metadata record is repaired on the next operation if interrupted after
    /// the data rename; the caller must reconcile an uncertain commit.
    #[cfg(unix)]
    pub fn write(
        &self,
        path: &str,
        content: &[u8],
        expected_version: u64,
    ) -> Result<u64, FileError> {
        let path = validate_relative(path)?.join("/");
        let _lock = self.lock()?;
        self.write_locked(&path, content, expected_version)
    }
    #[cfg(unix)]
    fn write_locked(&self, path: &str, content: &[u8], expected_version: u64) -> Result<u64, FileError> {
        let (parent, name) = self.parent(&path, true)?;
        let current_hash = Self::hash_at(parent.as_raw_fd(), &name)?;
        let version = self.current_version(&path, current_hash.as_deref())?;
        if expected_version != version {
            return Err(FileError::Conflict {
                current_version: version,
            });
        }
        let next = version.checked_add(1).ok_or(FileError::InvalidPath)?;
        let temp = format!(
            ".creatoros-tmp-{}-{}",
            std::process::id(),
            rand::random::<u64>()
        );
        let mut tmp = open_file_at(
            parent.as_raw_fd(),
            &temp,
            libc::O_WRONLY | libc::O_CREAT | libc::O_EXCL,
            0o600,
        )?;
        let result = (|| -> Result<(), FileError> {
            tmp.write_all(content)?;
            tmp.sync_all()?;
            rename_at(parent.as_raw_fd(), &temp, parent.as_raw_fd(), &name)?;
            parent.sync_all()?;
            self.file_write_fault("data")?;
            let versions = self.version_dir()?;
            let record = Self::record_name(&path);
            let meta_temp = format!(
                ".creatoros-tmp-{}-{}",
                std::process::id(),
                rand::random::<u64>()
            );
            let mut meta = open_file_at(
                versions.as_raw_fd(),
                &meta_temp,
                libc::O_WRONLY | libc::O_CREAT | libc::O_EXCL,
                0o600,
            )?;
            meta.write_all(format!("{} {}", next, Self::digest(content)).as_bytes())?;
            meta.sync_all()?;
            rename_at(
                versions.as_raw_fd(),
                &meta_temp,
                versions.as_raw_fd(),
                &record,
            )?;
            versions.sync_all()?;
            Ok(())
        })();
        if result.is_err() {
            let _ = unlink_at(parent.as_raw_fd(), &temp);
        }
        result?;
        Ok(next)
    }
    #[cfg(unix)]
    pub fn list(&self, path: Option<&str>) -> Result<Vec<String>, FileError> {
        let mut dir = self.task.try_clone()?;
        if let Some(path) = path {
            for part in validate_relative(path)? {
                dir = open_dir_at(dir.as_raw_fd(), &part)?;
            }
        }
        let dup = unsafe { libc::dup(dir.as_raw_fd()) };
        if dup < 0 {
            return Err(io::Error::last_os_error().into());
        }
        let stream = unsafe { libc::fdopendir(dup) };
        if stream.is_null() {
            unsafe { libc::close(dup) };
            return Err(io::Error::last_os_error().into());
        }
        let mut entries = Vec::new();
        loop {
            let entry = unsafe { libc::readdir(stream) };
            if entry.is_null() {
                break;
            }
            let name = unsafe { std::ffi::CStr::from_ptr((*entry).d_name.as_ptr()) }
                .to_string_lossy()
                .into_owned();
            if name != "." && name != ".." && !name.starts_with(".creatoros-") {
                entries.push(name);
            }
        }
        unsafe { libc::closedir(stream) };
        entries.sort();
        Ok(entries)
    }
    #[cfg(unix)]
    pub fn stat(&self, path: &str) -> Result<Option<(bool, u64, u64)>, FileError> {
        let path = validate_relative(path)?.join("/");
        let _lock = self.lock()?;
        let (parent, name) = match self.parent(&path, false) {
            Ok(parent) => parent,
            Err(FileError::Io(error)) if error.kind() == io::ErrorKind::NotFound => {
                return Ok(None)
            }
            Err(error) => return Err(error),
        };
        let mut fd = match open_file_at(parent.as_raw_fd(), &name, libc::O_RDONLY, 0) {
            Ok(f) => f,
            Err(FileError::Io(e)) if e.kind() == io::ErrorKind::NotFound => return Ok(None),
            Err(e) => return Err(e),
        };
        let meta = fd.metadata()?;
        let hash = if meta.is_file() {
            Some(Self::hash_file(&mut fd)?)
        } else {
            None
        };
        Ok(Some((
            meta.is_dir(),
            meta.len(),
            self.current_version(&path, hash.as_deref())?,
        )))
    }
}
#[cfg(test)]
thread_local! { static FILE_WRITE_FAULT: std::cell::RefCell<Option<String>> = const { std::cell::RefCell::new(None) }; }
#[cfg(unix)]
fn c(s: &str) -> Result<CString, FileError> {
    CString::new(s).map_err(|_| FileError::InvalidPath)
}
#[cfg(unix)]
fn open_file_at(dir: RawFd, name: &str, flags: i32, mode: u32) -> Result<File, FileError> {
    let fd = unsafe {
        libc::openat(
            dir,
            c(name)?.as_ptr(),
            flags | libc::O_CLOEXEC | libc::O_NOFOLLOW,
            mode,
        )
    };
    if fd < 0 {
        Err(io::Error::last_os_error().into())
    } else {
        Ok(unsafe { File::from_raw_fd(fd) })
    }
}
#[cfg(unix)]
fn open_dir_at(dir: RawFd, name: &str) -> Result<File, FileError> {
    open_file_at(dir, name, libc::O_RDONLY | libc::O_DIRECTORY, 0)
}
#[cfg(unix)]
fn open_dir_path(path: &Path) -> Result<File, FileError> {
    let p =
        CString::new(path.as_os_str().as_encoded_bytes()).map_err(|_| FileError::InvalidPath)?;
    let fd = unsafe {
        libc::open(
            p.as_ptr(),
            libc::O_RDONLY | libc::O_DIRECTORY | libc::O_CLOEXEC | libc::O_NOFOLLOW,
        )
    };
    if fd < 0 {
        Err(io::Error::last_os_error().into())
    } else {
        Ok(unsafe { File::from_raw_fd(fd) })
    }
}
#[cfg(unix)]
fn ensure_dir(dir: RawFd, name: &str) -> Result<File, FileError> {
    match open_dir_at(dir, name) {
        Ok(fd) => Ok(fd),
        Err(FileError::Io(e)) if e.kind() == io::ErrorKind::NotFound => {
            if unsafe { libc::mkdirat(dir, c(name)?.as_ptr(), 0o700) } != 0 {
                let err = io::Error::last_os_error();
                if err.kind() != io::ErrorKind::AlreadyExists {
                    return Err(err.into());
                }
            }
            // Persist the containing directory entry, including a concurrent
            // creator's entry, before a descendant journal can claim commit.
            if unsafe { libc::fsync(dir) } != 0 {
                return Err(io::Error::last_os_error().into());
            }
            open_dir_at(dir, name)
        }
        Err(e) => Err(e),
    }
}
#[cfg(unix)]
fn rename_at(from: RawFd, src: &str, to: RawFd, dst: &str) -> Result<(), FileError> {
    if unsafe { libc::renameat(from, c(src)?.as_ptr(), to, c(dst)?.as_ptr()) } != 0 {
        Err(io::Error::last_os_error().into())
    } else {
        Ok(())
    }
}
#[cfg(unix)]
fn unlink_at(dir: RawFd, name: &str) -> Result<(), FileError> {
    if unsafe { libc::unlinkat(dir, c(name)?.as_ptr(), 0) } != 0 {
        Err(io::Error::last_os_error().into())
    } else {
        Ok(())
    }
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;
    #[test]
    fn file_journal_fault_windows_never_upgrade_prepared_from_matching_bytes() {
        for stage in ["prepared", "data", "metadata", "committed"] {
            let temp=std::env::temp_dir().join(format!("t1026-journal-{}",rand::random::<u64>()));
            let files=TaskFiles::new(&temp,"u","a","t").unwrap();
            FILE_WRITE_FAULT.with(|point| *point.borrow_mut()=Some(stage.into()));
            let failed=files.write_operation("op",1,"f","report",b"hello",Some(0));
            FILE_WRITE_FAULT.with(|point| *point.borrow_mut()=None);
            assert!(failed.is_err());
            drop(files);
            let files=TaskFiles::new(&temp,"u","a","t").unwrap();
            let hash=format!("sha256:{}",TaskFiles::digest(b"hello"));
            let receipt=files.file_receipt("op","report",Some(0),&hash,5).unwrap().unwrap();
            assert_eq!(receipt.state,if stage=="committed"{"committed"}else{"prepared"});
            let before=files.read("report").unwrap();
            let replay=files.write_operation("op",2,"new","report",b"hello",Some(0));
            if stage=="committed" {assert_eq!(replay.unwrap(),1);} else {assert!(matches!(replay,Err(FileError::OperationPending)));}
            assert_eq!(files.read("report").unwrap(),before);
            std::fs::remove_dir_all(temp).unwrap();
        }
    }

    #[test]
    fn file_journal_null_identity_cas_before_prepare_and_scope() {
        let temp=std::env::temp_dir().join(format!("t1026-journal-{}",rand::random::<u64>()));
        let files=TaskFiles::new(&temp,"u","a","t").unwrap();
        assert_eq!(files.write_operation("op",1,"f","e\u{301}.md",b"hello",None).unwrap(),1);
        let hash=format!("sha256:{}",TaskFiles::digest(b"hello"));
        let r=files.file_receipt("op","é.md",None,&hash,5).unwrap().unwrap();
        assert_eq!((r.expected_version,r.observed_base_version,r.result_version),(None,0,Some(1)));
        assert!(matches!(files.write_operation("op",2,"g","é.md",b"hello",Some(0)),Err(FileError::OperationConflict)));
        assert!(matches!(files.write_operation("conflict",1,"f","é.md",b"hello",None),Err(FileError::Conflict{..})));
        assert!(files.file_receipt("conflict","é.md",None,&hash,5).unwrap().is_none());
        assert!(files.write_operation("invalid",1,"f","../escape",b"hello",None).is_err());
        assert!(files.operation_record("invalid").unwrap().is_none());
        assert!(files.write_operation("unsafe",1,"f","x",b"hello",Some(MAX_SAFE_VERSION)).is_err());
        assert!(files.operation_record("unsafe").unwrap().is_none());
        let foreign=TaskFiles::new(&temp,"u","other","t").unwrap();
        assert!(foreign.file_receipt("op","é.md",None,&hash,5).unwrap().is_none());
        let journal=files.state.as_raw_fd();
        let dir=open_dir_at(journal,"file-operations").unwrap();
        let mut corrupt=open_file_at(dir.as_raw_fd(),&key("op").unwrap(),libc::O_WRONLY|libc::O_TRUNC,0).unwrap();
        corrupt.write_all(b"{broken").unwrap();
        assert!(matches!(files.file_receipt("op","é.md",None,&hash,5),Err(FileError::InvalidRecord)));
        assert!(matches!(files.write_operation("op",2,"g","é.md",b"hello",None),Err(FileError::InvalidRecord)));
        std::fs::remove_dir_all(temp).unwrap();
    }

    #[test]
    fn file_journal_utf8_digest_matches_typescript_vector() {
        assert_eq!(file_request_digest("scope","op-甲","草稿/é.md",None,
            "sha256:efd3cde8796eef45558bd5c45ab2a38800dcdc46a83842f30b1bb5bcdac66bd8",11),
            "sha256:4ec40ad0265a71c7b3cbf3bead0c31cabf32b03cad663e485a943ccb5e633af9");
    }
    #[test]
    fn unicode_space_version_and_conflict() {
        let temp = std::env::temp_dir().join(format!("creatoros-t1007-{}", rand::random::<u64>()));
        let fs = TaskFiles::new(&temp, "user 甲", "account 甲", "task 乙").unwrap();
        assert_eq!(
            fs.write("草稿/含 空格.md", "你好".as_bytes(), 0).unwrap(),
            1
        );
        assert_eq!(
            fs.read("草稿/含 空格.md").unwrap().unwrap().0,
            "你好".as_bytes()
        );
        assert!(matches!(
            fs.write("草稿/含 空格.md", b"bad", 0),
            Err(FileError::Conflict { current_version: 1 })
        ));
        fs.write("e\u{301}.md", b"accent", 0).unwrap();
        assert!(matches!(
            fs.write("é.md", b"bad", 0),
            Err(FileError::Conflict { current_version: 1 })
        ));
        let large = vec![b'x'; 1_000_100];
        fs.write("large", &large, 0).unwrap();
        assert!(matches!(fs.read("large"), Err(FileError::TooLarge)));
        let (page, total, version) = fs.read_page("large", 1_000_000, 1000).unwrap().unwrap();
        assert_eq!((page.len(), total, version), (100, 1_000_100, 1));
        assert_eq!(fs.list(Some("草稿")).unwrap(), vec!["含 空格.md"]);
        std::fs::remove_dir_all(temp).unwrap();
    }
    #[test]
    fn account_scope_and_symlink_escape() {
        let temp = std::env::temp_dir().join(format!("creatoros-t1007-{}", rand::random::<u64>()));
        let a = TaskFiles::new(&temp, "user", "a", "task").unwrap();
        let b = TaskFiles::new(&temp, "user", "b", "task").unwrap();
        let c = TaskFiles::new(&temp, "other-user", "a", "task").unwrap();
        a.write("x", b"secret", 0).unwrap();
        assert!(b.read("x").unwrap().is_none());
        assert!(c.read("x").unwrap().is_none());
        assert!(b.read("交付/报告.html").unwrap().is_none());
        assert!(b.stat("交付/报告.html").unwrap().is_none());
        #[cfg(unix)]
        {
            std::os::unix::fs::symlink("/etc/passwd", a.root.join("link")).unwrap();
            assert!(a.read("link").is_err());
            std::os::unix::fs::symlink("/tmp", a.root.join("jump")).unwrap();
            assert!(a.write("jump/escape", b"x", 0).is_err());
        }
        assert!(validate_relative("../x").is_err());
        assert!(validate_relative("C:/x").is_err());
        std::fs::remove_dir_all(temp).unwrap();
    }
    #[test]
    fn portable_paths_reject_windows_aliases_and_private_state() {
        for path in [
            "CON",
            "con.txt",
            "PRN.md",
            "AUX",
            "NUL.log",
            "COM1",
            "com9.py",
            "LPT1.txt",
            "LPT³",
            "CONIN$",
            "CONOUT$.txt",
            "name.",
            "name ",
            "bad<name",
            "bad|name",
            "bad?name",
            "bad*name",
            "bad\nname",
            ".CreatorOS-state",
            "folder/.CREATOROS-tmp",
            "C:/escape",
            "a\\b",
            "//server/share",
            "../escape",
        ] {
            assert!(validate_relative(path).is_err(), "accepted {path:?}");
        }
        assert_eq!(
            validate_relative("资料/空 格/é.txt").unwrap(),
            ["资料", "空 格", "é.txt"]
        );
        assert_eq!(validate_relative("e\u{301}.txt").unwrap(), ["é.txt"]);
    }
}
