//! Windows task-file host. All untrusted components are opened relative to a
//! retained directory HANDLE. A path check followed by `root.join(path)` would
//! permit junction/symlink swaps, so no task operation uses that pattern.
use super::{validate_relative, FileError, TaskFiles};
use std::{
    ffi::{c_void, OsString},
    fs::File,
    io::{self, Read, Seek, Write},
    mem::{offset_of, size_of},
    os::windows::{
        ffi::{OsStrExt, OsStringExt},
        io::{AsRawHandle, FromRawHandle},
    },
    path::Path,
    ptr,
};
use windows_sys::{
    Wdk::{
        Foundation::OBJECT_ATTRIBUTES,
        Storage::FileSystem::{
            FileDispositionInformation, FileNamesInformation, FileRenameInformation, NtCreateFile,
            NtQueryDirectoryFile, NtSetInformationFile, FILE_CREATE, FILE_DIRECTORY_FILE,
            FILE_DISPOSITION_INFORMATION, FILE_NON_DIRECTORY_FILE, FILE_OPEN, FILE_OPEN_IF,
            FILE_OPEN_REPARSE_POINT, FILE_RENAME_INFORMATION, FILE_RENAME_REPLACE_IF_EXISTS,
            FILE_SYNCHRONOUS_IO_NONALERT,
        },
    },
    Win32::{
        Foundation::{
            RtlNtStatusToDosError, HANDLE, INVALID_HANDLE_VALUE, OBJ_CASE_INSENSITIVE,
            OBJ_DONT_REPARSE, STATUS_BUFFER_OVERFLOW, STATUS_IO_REPARSE_TAG_NOT_HANDLED,
            STATUS_NO_MORE_FILES, STATUS_REPARSE_POINT_ENCOUNTERED, STATUS_STOPPED_ON_SYMLINK,
            UNICODE_STRING,
        },
        Storage::FileSystem::{
            CreateFileW, FileAttributeTagInfo, GetFileInformationByHandle,
            GetFileInformationByHandleEx, GetFinalPathNameByHandleW, ReOpenFile,
            BY_HANDLE_FILE_INFORMATION, DELETE, FILE_ADD_FILE, FILE_ADD_SUBDIRECTORY,
            FILE_ATTRIBUTE_DIRECTORY, FILE_ATTRIBUTE_NORMAL, FILE_ATTRIBUTE_REPARSE_POINT,
            FILE_ATTRIBUTE_TAG_INFO, FILE_FLAG_BACKUP_SEMANTICS, FILE_FLAG_OPEN_REPARSE_POINT,
            FILE_LIST_DIRECTORY, FILE_READ_ATTRIBUTES, FILE_READ_DATA, FILE_SHARE_DELETE,
            FILE_SHARE_READ, FILE_SHARE_WRITE, FILE_TRAVERSE, FILE_WRITE_DATA, OPEN_EXISTING,
            SYNCHRONIZE,
        },
        System::IO::IO_STATUS_BLOCK,
    },
};

const SHARE_ALL: u32 = FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE;
const DIR_ACCESS: u32 = FILE_LIST_DIRECTORY
    | FILE_ADD_FILE
    | FILE_ADD_SUBDIRECTORY
    | FILE_TRAVERSE
    | FILE_READ_ATTRIBUTES
    | SYNCHRONIZE;
const READ_ACCESS: u32 = FILE_READ_DATA | FILE_READ_ATTRIBUTES | SYNCHRONIZE;
const TEMP_ACCESS: u32 = FILE_WRITE_DATA | FILE_READ_ATTRIBUTES | DELETE | SYNCHRONIZE;

#[derive(Clone, Copy)]
enum Kind {
    Directory,
    File,
    Either,
}

fn raw(file: &File) -> HANDLE {
    file.as_raw_handle() as HANDLE
}

fn nt_error(status: i32) -> FileError {
    if matches!(
        status,
        STATUS_REPARSE_POINT_ENCOUNTERED
            | STATUS_IO_REPARSE_TAG_NOT_HANDLED
            | STATUS_STOPPED_ON_SYMLINK
    ) {
        return FileError::InvalidPath;
    }
    FileError::Io(io::Error::from_raw_os_error(
        unsafe { RtlNtStatusToDosError(status) } as i32,
    ))
}

/// Opens exactly one leaf below an already-open directory. The native object
/// manager receives no separator, drive prefix or device path from a caller.
fn child(
    parent: &File,
    name: &str,
    kind: Kind,
    disposition: u32,
    access: u32,
    share: u32,
) -> Result<File, FileError> {
    debug_assert!(!name.contains(['/', '\\']));
    let mut wide: Vec<u16> = name.encode_utf16().collect();
    let bytes = wide
        .len()
        .checked_mul(2)
        .and_then(|n| u16::try_from(n).ok())
        .ok_or(FileError::InvalidPath)?;
    let unicode = UNICODE_STRING {
        Length: bytes,
        MaximumLength: bytes,
        Buffer: wide.as_mut_ptr(),
    };
    let attrs = OBJECT_ATTRIBUTES {
        Length: size_of::<OBJECT_ATTRIBUTES>() as u32,
        RootDirectory: raw(parent),
        ObjectName: &unicode,
        Attributes: OBJ_CASE_INSENSITIVE | OBJ_DONT_REPARSE,
        SecurityDescriptor: ptr::null(),
        SecurityQualityOfService: ptr::null(),
    };
    let options = FILE_SYNCHRONOUS_IO_NONALERT
        | FILE_OPEN_REPARSE_POINT
        | match kind {
            Kind::Directory => FILE_DIRECTORY_FILE,
            Kind::File => FILE_NON_DIRECTORY_FILE,
            Kind::Either => 0,
        };
    let mut handle: HANDLE = ptr::null_mut();
    let mut iosb = IO_STATUS_BLOCK::default();
    let status = unsafe {
        NtCreateFile(
            &mut handle,
            access,
            &attrs,
            &mut iosb,
            ptr::null(),
            if matches!(kind, Kind::Directory) {
                FILE_ATTRIBUTE_DIRECTORY
            } else {
                FILE_ATTRIBUTE_NORMAL
            },
            share,
            disposition,
            options,
            ptr::null(),
            0,
        )
    };
    if status < 0 {
        return Err(nt_error(status));
    }
    // SAFETY: NtCreateFile succeeded and transferred one owned HANDLE.
    let file = unsafe { File::from_raw_handle(handle as _) };
    checked(&file, kind)?;
    // A DOS 8.3 alias can name the same file with a different version-record
    // key. Accept case aliases, but require the normalized handle leaf to match
    // the requested leaf so short-name aliases fail closed.
    let opened_name = path_of_handle(&file)?;
    let opened_name = opened_name
        .file_name()
        .and_then(|s| s.to_str())
        .ok_or(FileError::InvalidPath)?;
    if opened_name.to_uppercase() != name.to_uppercase() {
        return Err(FileError::InvalidPath);
    }
    Ok(file)
}

fn checked(file: &File, kind: Kind) -> Result<(), FileError> {
    let mut tag = FILE_ATTRIBUTE_TAG_INFO::default();
    let ok = unsafe {
        GetFileInformationByHandleEx(
            raw(file),
            FileAttributeTagInfo,
            &mut tag as *mut _ as *mut c_void,
            size_of::<FILE_ATTRIBUTE_TAG_INFO>() as u32,
        )
    };
    if ok == 0 {
        return Err(io::Error::last_os_error().into());
    }
    let dir = tag.FileAttributes & FILE_ATTRIBUTE_DIRECTORY != 0;
    if tag.FileAttributes & FILE_ATTRIBUTE_REPARSE_POINT != 0
        || matches!(kind, Kind::Directory) && !dir
        || matches!(kind, Kind::File) && dir
    {
        return Err(FileError::InvalidPath);
    }
    if !dir {
        // Hard links can expose a file from outside the task root without a
        // reparse point. Refuse them even when the current link was opened safely.
        let mut info = BY_HANDLE_FILE_INFORMATION::default();
        if unsafe { GetFileInformationByHandle(raw(file), &mut info) } == 0 {
            return Err(io::Error::last_os_error().into());
        }
        if info.nNumberOfLinks != 1 {
            return Err(FileError::InvalidPath);
        }
    }
    Ok(())
}

/// The provisioned base is trusted host configuration. Reject a reparse point
/// at its leaf before deriving account/task directories from its HANDLE.
fn base_directory(path: &Path) -> Result<File, FileError> {
    std::fs::create_dir_all(path)?;
    let wide: Vec<u16> = path.as_os_str().encode_wide().chain(Some(0)).collect();
    let handle = unsafe {
        CreateFileW(
            wide.as_ptr(),
            DIR_ACCESS,
            SHARE_ALL,
            ptr::null(),
            OPEN_EXISTING,
            FILE_FLAG_BACKUP_SEMANTICS | FILE_FLAG_OPEN_REPARSE_POINT,
            ptr::null_mut(),
        )
    };
    if handle == INVALID_HANDLE_VALUE {
        return Err(io::Error::last_os_error().into());
    }
    let file = unsafe { File::from_raw_handle(handle as _) };
    checked(&file, Kind::Directory)?;
    Ok(file)
}

fn path_of_handle(file: &File) -> Result<std::path::PathBuf, FileError> {
    let required = unsafe { GetFinalPathNameByHandleW(raw(file), ptr::null_mut(), 0, 0) };
    if required == 0 {
        return Err(io::Error::last_os_error().into());
    }
    let mut wide = vec![0u16; required as usize + 1];
    let written =
        unsafe { GetFinalPathNameByHandleW(raw(file), wide.as_mut_ptr(), wide.len() as u32, 0) };
    if written == 0 {
        return Err(io::Error::last_os_error().into());
    }
    if written as usize >= wide.len() {
        return Err(FileError::InvalidPath);
    }
    Ok(OsString::from_wide(&wide[..written as usize]).into())
}

fn directory(parent: &File, name: &str) -> Result<File, FileError> {
    child(
        parent,
        name,
        Kind::Directory,
        FILE_OPEN,
        DIR_ACCESS,
        SHARE_ALL,
    )
}
fn ensure_directory(parent: &File, name: &str) -> Result<File, FileError> {
    match directory(parent, name) {
        Ok(dir) => Ok(dir),
        Err(FileError::Io(e)) if e.kind() == io::ErrorKind::NotFound => {
            match child(
                parent,
                name,
                Kind::Directory,
                FILE_CREATE,
                DIR_ACCESS,
                SHARE_ALL,
            ) {
                Ok(dir) => Ok(dir),
                Err(FileError::Io(e)) if e.kind() == io::ErrorKind::AlreadyExists => {
                    directory(parent, name)
                }
                Err(e) => Err(e),
            }
        }
        Err(e) => Err(e),
    }
}
fn reopened_directory(dir: &File) -> Result<File, FileError> {
    let handle = unsafe {
        ReOpenFile(
            raw(dir),
            DIR_ACCESS,
            SHARE_ALL,
            FILE_FLAG_BACKUP_SEMANTICS | FILE_FLAG_OPEN_REPARSE_POINT,
        )
    };
    if handle == INVALID_HANDLE_VALUE {
        return Err(io::Error::last_os_error().into());
    }
    let file = unsafe { File::from_raw_handle(handle as _) };
    checked(&file, Kind::Directory)?;
    Ok(file)
}
fn sha(content: &[u8]) -> String {
    use sha2::{Digest, Sha256};
    format!("{:x}", Sha256::digest(content))
}
fn hash_file(file: &mut File) -> Result<String, FileError> {
    use sha2::{Digest, Sha256};
    file.rewind()?;
    let mut digest = Sha256::new();
    let mut buf = [0u8; 65_536];
    loop {
        let read = file.read(&mut buf)?;
        if read == 0 {
            break;
        }
        digest.update(&buf[..read]);
    }
    Ok(format!("{:x}", digest.finalize()))
}
fn hash_at(parent: &File, name: &str) -> Result<Option<String>, FileError> {
    match child(
        parent,
        name,
        Kind::File,
        FILE_OPEN,
        READ_ACCESS,
        FILE_SHARE_READ,
    ) {
        Ok(mut file) => Ok(Some(hash_file(&mut file)?)),
        Err(FileError::Io(e)) if e.kind() == io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e),
    }
}
fn record_name(path: &str) -> String {
    // Windows ordinarily aliases case variants. Sharing one version record is
    // conservative for case-sensitive directories (false conflicts are safe).
    sha(path.to_uppercase().as_bytes())
}

/// NtSetInformationFile renames the opened temp object into a name relative to
/// the destination directory HANDLE, replacing one directory entry atomically.
fn rename_from_handle(source: &File, destination: &File, name: &str) -> Result<(), FileError> {
    let wide: Vec<u16> = name.encode_utf16().collect();
    let offset = offset_of!(FILE_RENAME_INFORMATION, FileName);
    // Windows documents the buffer as at least sizeof(header) plus the name.
    let size = size_of::<FILE_RENAME_INFORMATION>() + wide.len() * 2;
    debug_assert!(size >= offset + wide.len() * 2);
    let mut words = vec![0usize; size.div_ceil(size_of::<usize>())];
    let ptr = words.as_mut_ptr() as *mut FILE_RENAME_INFORMATION;
    unsafe {
        (*ptr).Anonymous.Flags = FILE_RENAME_REPLACE_IF_EXISTS;
        (*ptr).RootDirectory = raw(destination);
        (*ptr).FileNameLength = (wide.len() * 2) as u32;
        ptr::copy_nonoverlapping(
            wide.as_ptr(),
            ptr::addr_of_mut!((*ptr).FileName) as *mut u16,
            wide.len(),
        );
    }
    let mut iosb = IO_STATUS_BLOCK::default();
    let status = unsafe {
        NtSetInformationFile(
            raw(source),
            &mut iosb,
            ptr as *const c_void,
            size as u32,
            FileRenameInformation,
        )
    };
    if status < 0 {
        Err(nt_error(status))
    } else {
        Ok(())
    }
}
fn delete_handle(file: &File) -> Result<(), FileError> {
    let info = FILE_DISPOSITION_INFORMATION { DeleteFile: true };
    let mut iosb = IO_STATUS_BLOCK::default();
    let status = unsafe {
        NtSetInformationFile(
            raw(file),
            &mut iosb,
            &info as *const _ as *const c_void,
            size_of::<FILE_DISPOSITION_INFORMATION>() as u32,
            FileDispositionInformation,
        )
    };
    if status < 0 {
        Err(nt_error(status))
    } else {
        Ok(())
    }
}

impl TaskFiles {
    pub(super) fn new_windows(
        base: &Path,
        user: String,
        account: String,
        task: String,
    ) -> Result<Self, FileError> {
        let base_handle = base_directory(base)?;
        let users = ensure_directory(&base_handle, "users")?;
        let user_handle = ensure_directory(&users, &user)?;
        let accounts = ensure_directory(&user_handle, "accounts")?;
        let account_handle = ensure_directory(&accounts, &account)?;
        let task_handle = ensure_directory(&account_handle, &task)?;
        let state = ensure_directory(&account_handle, &format!(".creatoros-state-{task}"))?;
        let base = path_of_handle(&base_handle)?;
        let root = base
            .join("users")
            .join(&user)
            .join("accounts")
            .join(&account)
            .join(&task);
        Ok(Self {
            root,
            base,
            scope_key: format!("{user}:{account}:{task}"),
            task: task_handle,
            state,
        })
    }
    fn parent_windows(&self, path: &str, create: bool) -> Result<(File, String), FileError> {
        let parts = validate_relative(path)?;
        let mut dir = reopened_directory(&self.task)?;
        for part in &parts[..parts.len() - 1] {
            dir = if create {
                ensure_directory(&dir, part)?
            } else {
                directory(&dir, part)?
            };
        }
        Ok((dir, parts.last().unwrap().clone()))
    }
    fn lock_windows(&self) -> Result<File, FileError> {
        let file = child(
            &self.state,
            "lock",
            Kind::File,
            FILE_OPEN_IF,
            FILE_READ_DATA | FILE_WRITE_DATA | FILE_READ_ATTRIBUTES | SYNCHRONIZE,
            SHARE_ALL,
        )?;
        file.lock()?;
        Ok(file)
    }
    fn version_directory(&self) -> Result<File, FileError> {
        ensure_directory(&self.state, "versions")
    }
    fn current_version_windows(
        &self,
        path: &str,
        current_hash: Option<&str>,
    ) -> Result<u64, FileError> {
        let versions = self.version_directory()?;
        let record = record_name(path);
        let mut text = String::new();
        match child(
            &versions,
            &record,
            Kind::File,
            FILE_OPEN,
            READ_ACCESS,
            FILE_SHARE_READ,
        ) {
            Ok(mut file) => {
                file.read_to_string(&mut text)?;
            }
            Err(FileError::Io(e)) if e.kind() == io::ErrorKind::NotFound => {
                return Ok(u64::from(current_hash.is_some()));
            }
            Err(e) => return Err(e),
        }
        let mut fields = text.split(' ');
        let version = fields
            .next()
            .and_then(|s| s.parse::<u64>().ok())
            .ok_or(FileError::InvalidPath)?;
        let hash = fields.next().ok_or(FileError::InvalidPath)?;
        if hash == current_hash.unwrap_or("absent") {
            Ok(version)
        } else {
            version.checked_add(1).ok_or(FileError::InvalidPath)
        }
    }
    pub fn output_dir(&self) -> Result<std::path::PathBuf, FileError> {
        let _dir = ensure_directory(&self.state, "outputs")?;
        Ok(self
            .root
            .parent()
            .ok_or(FileError::InvalidPath)?
            .join(format!(
                ".creatoros-state-{}",
                self.root
                    .file_name()
                    .ok_or(FileError::InvalidPath)?
                    .to_string_lossy()
            ))
            .join("outputs"))
    }
    pub fn read(&self, path: &str) -> Result<Option<(Vec<u8>, u64)>, FileError> {
        let page = self.read_page(path, 0, 1_000_000)?;
        if page
            .as_ref()
            .is_some_and(|(_, total, _)| *total > 1_000_000)
        {
            return Err(FileError::TooLarge);
        }
        Ok(page.map(|(content, _, version)| (content, version)))
    }
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
        let _lock = self.lock_windows()?;
        let (parent, name) = self.parent_windows(&path, false)?;
        let mut file = match child(
            &parent,
            &name,
            Kind::File,
            FILE_OPEN,
            READ_ACCESS,
            FILE_SHARE_READ,
        ) {
            Ok(file) => file,
            Err(FileError::Io(e)) if e.kind() == io::ErrorKind::NotFound => return Ok(None),
            Err(e) => return Err(e),
        };
        let total = file.metadata()?.len();
        let hash = hash_file(&mut file)?;
        let version = self.current_version_windows(&path, Some(&hash))?;
        file.seek(io::SeekFrom::Start(offset))?;
        let mut bytes = Vec::new();
        file.take(limit as u64).read_to_end(&mut bytes)?;
        Ok(Some((bytes, total, version)))
    }
    pub fn write(
        &self,
        path: &str,
        content: &[u8],
        expected_version: u64,
    ) -> Result<u64, FileError> {
        let path = validate_relative(path)?.join("/");
        let _lock = self.lock_windows()?;
        let (parent, name) = self.parent_windows(&path, true)?;
        let current = hash_at(&parent, &name)?;
        let version = self.current_version_windows(&path, current.as_deref())?;
        if version != expected_version {
            return Err(FileError::Conflict {
                current_version: version,
            });
        }
        let next = version.checked_add(1).ok_or(FileError::InvalidPath)?;
        let temp_name = format!(
            ".creatoros-tmp-{}-{}",
            std::process::id(),
            rand::random::<u64>()
        );
        let mut temp = child(
            &parent,
            &temp_name,
            Kind::File,
            FILE_CREATE,
            TEMP_ACCESS,
            SHARE_ALL,
        )?;
        let committed = (|| -> Result<(), FileError> {
            temp.write_all(content)?;
            temp.sync_all()?;
            rename_from_handle(&temp, &parent, &name)?;
            Ok(())
        })();
        if let Err(error) = committed {
            // The source HANDLE targets the temp file itself; no path is reopened.
            let _ = delete_handle(&temp);
            return Err(error);
        }
        // Data rename has committed. If the record step fails, the next read
        // detects the changed hash and projects `version + 1` for reconciliation.
        let versions = self.version_directory()?;
        let record = record_name(&path);
        let meta_name = format!(
            ".creatoros-tmp-{}-{}",
            std::process::id(),
            rand::random::<u64>()
        );
        let mut meta = child(
            &versions,
            &meta_name,
            Kind::File,
            FILE_CREATE,
            TEMP_ACCESS,
            SHARE_ALL,
        )?;
        let meta_write = (|| -> Result<(), FileError> {
            meta.write_all(format!("{next} {}", sha(content)).as_bytes())?;
            meta.sync_all()?;
            rename_from_handle(&meta, &versions, &record)?;
            Ok(())
        })();
        if let Err(error) = meta_write {
            let _ = delete_handle(&meta);
            return Err(error);
        }
        Ok(next)
    }
    pub fn edit(
        &self,
        path: &str,
        content: &[u8],
        expected_version: u64,
    ) -> Result<u64, FileError> {
        self.write(path, content, expected_version)
    }
    pub fn stat(&self, path: &str) -> Result<Option<(bool, u64, u64)>, FileError> {
        let path = validate_relative(path)?.join("/");
        let _lock = self.lock_windows()?;
        let (parent, name) = self.parent_windows(&path, false)?;
        let mut file = match child(
            &parent,
            &name,
            Kind::Either,
            FILE_OPEN,
            READ_ACCESS,
            FILE_SHARE_READ,
        ) {
            Ok(file) => file,
            Err(FileError::Io(e)) if e.kind() == io::ErrorKind::NotFound => return Ok(None),
            Err(e) => return Err(e),
        };
        let meta = file.metadata()?;
        let hash = if meta.is_file() {
            Some(hash_file(&mut file)?)
        } else {
            None
        };
        let version = self.current_version_windows(&path, hash.as_deref())?;
        Ok(Some((meta.is_dir(), meta.len(), version)))
    }
    pub fn list(&self, path: Option<&str>) -> Result<Vec<String>, FileError> {
        let mut dir = reopened_directory(&self.task)?;
        if let Some(path) = path {
            for part in validate_relative(path)? {
                dir = directory(&dir, &part)?;
            }
        }
        let mut entries = Vec::new();
        let mut words = vec![0u64; 65_536 / size_of::<u64>()];
        loop {
            let mut iosb = IO_STATUS_BLOCK::default();
            let status = unsafe {
                NtQueryDirectoryFile(
                    raw(&dir),
                    ptr::null_mut(),
                    None,
                    ptr::null(),
                    &mut iosb,
                    words.as_mut_ptr() as *mut c_void,
                    65_536,
                    FileNamesInformation,
                    false,
                    ptr::null(),
                    false,
                )
            };
            if status == STATUS_NO_MORE_FILES {
                break;
            }
            if status == STATUS_BUFFER_OVERFLOW || status < 0 {
                return Err(nt_error(status));
            }
            let used = iosb.Information.min(65_536);
            if used == 0 {
                return Err(FileError::InvalidPath);
            }
            let data = unsafe { std::slice::from_raw_parts(words.as_ptr() as *const u8, used) };
            let mut offset = 0usize;
            loop {
                if used - offset < 12 {
                    return Err(FileError::InvalidPath);
                }
                let next =
                    u32::from_ne_bytes(data[offset..offset + 4].try_into().unwrap()) as usize;
                let length =
                    u32::from_ne_bytes(data[offset + 8..offset + 12].try_into().unwrap()) as usize;
                if length & 1 != 0 || length > used - offset - 12 {
                    return Err(FileError::InvalidPath);
                }
                let wide: Vec<u16> = data[offset + 12..offset + 12 + length]
                    .as_chunks::<2>()
                    .0
                    .iter()
                    .map(|b| u16::from_ne_bytes(*b))
                    .collect();
                if let Ok(name) = String::from_utf16(&wide) {
                    if !name.starts_with(".creatoros-")
                        && validate_relative(&name)
                            .ok()
                            .is_some_and(|p| p.len() == 1 && p[0] == name)
                    {
                        match child(
                            &dir,
                            &name,
                            Kind::Either,
                            FILE_OPEN,
                            FILE_READ_ATTRIBUTES | SYNCHRONIZE,
                            SHARE_ALL,
                        ) {
                            Ok(_) => entries.push(name),
                            Err(FileError::InvalidPath) => {}
                            Err(FileError::Io(e)) if e.kind() == io::ErrorKind::NotFound => {}
                            Err(e) => return Err(e),
                        }
                    }
                }
                if next == 0 {
                    break;
                }
                if next < 12 || next > used - offset {
                    return Err(FileError::InvalidPath);
                }
                offset += next;
            }
        }
        entries.sort();
        Ok(entries)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn unicode_spaces_versions_and_account_scope() {
        let root =
            std::env::temp_dir().join(format!("creatoros-t1007-windows-{}", rand::random::<u64>()));
        let a = TaskFiles::new(&root, "用户 甲", "账号 甲", "任务 乙").unwrap();
        let b = TaskFiles::new(&root, "用户 甲", "账号 乙", "任务 乙").unwrap();
        assert_eq!(a.write("草稿/含 空格.md", "你好".as_bytes(), 0).unwrap(), 1);
        assert_eq!(
            a.read("草稿/含 空格.md").unwrap().unwrap().0,
            "你好".as_bytes()
        );
        assert!(b.read("草稿/含 空格.md").is_err() || b.read("草稿/含 空格.md").unwrap().is_none());
        assert!(matches!(
            a.edit("草稿/含 空格.md", b"bad", 0),
            Err(FileError::Conflict { current_version: 1 })
        ));
        assert_eq!(a.edit("草稿/含 空格.md", b"good", 1).unwrap(), 2);
        assert_eq!(a.stat("草稿/含 空格.md").unwrap(), Some((false, 4, 2)));
        assert_eq!(a.list(Some("草稿")).unwrap(), vec!["含 空格.md"]);
        a.write("e\u{301}.md", b"accent", 0).unwrap();
        assert!(matches!(
            a.write("é.md", b"bad", 0),
            Err(FileError::Conflict { current_version: 1 })
        ));
        a.write("CASE.txt", b"first", 0).unwrap();
        assert!(matches!(
            a.write("case.txt", b"stale", 0),
            Err(FileError::Conflict { .. })
        ));
        let large = vec![b'x'; 1_000_100];
        a.write("large", &large, 0).unwrap();
        assert!(matches!(a.read("large"), Err(FileError::TooLarge)));
        assert_eq!(
            a.read_page("large", 1_000_000, 1000)
                .unwrap()
                .unwrap()
                .0
                .len(),
            100
        );
        drop(a);
        drop(b);
        std::fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn rejects_junctions_symlinks_and_hardlinks() {
        let root =
            std::env::temp_dir().join(format!("creatoros-t1007-windows-{}", rand::random::<u64>()));
        let files = TaskFiles::new(&root, "u", "a", "t").unwrap();
        let outside = root.join("outside.txt");
        std::fs::write(&outside, b"secret").unwrap();
        std::fs::hard_link(&outside, files.root.join("hard.txt")).unwrap();
        assert!(files.read("hard.txt").is_err());
        // Creating symlinks may require Developer Mode or elevated privileges.
        if std::os::windows::fs::symlink_file(&outside, files.root.join("link.txt")).is_ok() {
            assert!(files.read("link.txt").is_err());
            assert!(files.write("link.txt", b"bad", 0).is_err());
        }
        if std::os::windows::fs::symlink_dir(&root, files.root.join("jump")).is_ok() {
            assert!(files.write("jump/escape", b"bad", 0).is_err());
        }
        drop(files);
        std::fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn concurrent_writers_share_one_version_lock() {
        let root =
            std::env::temp_dir().join(format!("creatoros-t1007-windows-{}", rand::random::<u64>()));
        let files = std::sync::Arc::new(TaskFiles::new(&root, "u", "a", "t").unwrap());
        files.write("report.html", b"initial", 0).unwrap();
        let threads: Vec<_> = (0..2)
            .map(|n| {
                let files = files.clone();
                std::thread::spawn(move || {
                    files.write("report.html", format!("writer {n}").as_bytes(), 1)
                })
            })
            .collect();
        let results: Vec<_> = threads.into_iter().map(|t| t.join().unwrap()).collect();
        assert_eq!(results.iter().filter(|r| r.is_ok()).count(), 1);
        assert_eq!(
            results
                .iter()
                .filter(|r| matches!(r, Err(FileError::Conflict { current_version: 2 })))
                .count(),
            1
        );
        drop(files);
        std::fs::remove_dir_all(root).unwrap();
    }
}
