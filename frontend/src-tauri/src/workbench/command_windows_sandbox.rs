//! Windows command confinement candidate. It is exercised only by the
//! Windows opt-in probes until a Windows installation proves every boundary.
//! Each invocation gets a fresh AppContainer identity and its own OS-owned
//! profile directory. No network capability or ambient handle is granted.
use super::quote_windows_arg;
use std::{
    ffi::{c_void, OsStr},
    fs::{self, File, OpenOptions},
    io,
    mem::size_of,
    os::windows::{ffi::OsStrExt, io::AsRawHandle},
    path::{Path, PathBuf},
    ptr,
};
use windows_sys::Win32::{
    Foundation::{
        CloseHandle, LocalFree, SetHandleInformation, HANDLE, HANDLE_FLAG_INHERIT, WAIT_OBJECT_0,
        WAIT_TIMEOUT,
    },
    Security::{
        Authorization::{
            ConvertSidToStringSidW, GetNamedSecurityInfoW, SetEntriesInAclW, SetNamedSecurityInfoW,
            EXPLICIT_ACCESS_W, GRANT_ACCESS, SE_FILE_OBJECT, TRUSTEE_IS_SID, TRUSTEE_IS_UNKNOWN,
        },
        FreeSid,
        Isolation::{
            CreateAppContainerProfile, DeleteAppContainerProfile, GetAppContainerFolderPath,
        },
        ACL, DACL_SECURITY_INFORMATION, PSID, SECURITY_CAPABILITIES,
        SUB_CONTAINERS_AND_OBJECTS_INHERIT,
    },
    Storage::FileSystem::{FILE_GENERIC_EXECUTE, FILE_GENERIC_READ, FILE_GENERIC_WRITE},
    System::{
        Com::CoTaskMemFree,
        JobObjects::{
            AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation,
            SetInformationJobObject, TerminateJobObject, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
            JOB_OBJECT_LIMIT_ACTIVE_PROCESS, JOB_OBJECT_LIMIT_DIE_ON_UNHANDLED_EXCEPTION,
            JOB_OBJECT_LIMIT_JOB_MEMORY, JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
        },
        SystemInformation::GetSystemWindowsDirectoryW,
        Threading::{
            CreateProcessW, DeleteProcThreadAttributeList, GetExitCodeProcess,
            InitializeProcThreadAttributeList, ResumeThread, UpdateProcThreadAttribute,
            WaitForSingleObject, CREATE_NO_WINDOW, CREATE_SUSPENDED, CREATE_UNICODE_ENVIRONMENT,
            EXTENDED_STARTUPINFO_PRESENT, PROCESS_INFORMATION, PROC_THREAD_ATTRIBUTE_HANDLE_LIST,
            PROC_THREAD_ATTRIBUTE_SECURITY_CAPABILITIES, STARTF_USESTDHANDLES, STARTUPINFOEXW,
        },
    },
};

fn system_windows_directory() -> io::Result<String> {
    let mut buffer = vec![0u16; 32_768];
    let length = unsafe { GetSystemWindowsDirectoryW(buffer.as_mut_ptr(), buffer.len() as u32) };
    if length == 0 || length as usize >= buffer.len() {
        return Err(io::Error::last_os_error());
    }
    String::from_utf16(&buffer[..length as usize])
        .map_err(|_| io::Error::new(io::ErrorKind::InvalidData, "invalid Windows directory"))
}

fn wide(value: &OsStr) -> Vec<u16> {
    value.encode_wide().chain([0]).collect()
}

fn win_error(code: u32) -> io::Error {
    io::Error::from_raw_os_error(code as i32)
}

struct OwnedHandle(HANDLE);
impl OwnedHandle {
    fn new(handle: HANDLE) -> io::Result<Self> {
        if handle.is_null() {
            Err(io::Error::last_os_error())
        } else {
            Ok(Self(handle))
        }
    }
}
impl Drop for OwnedHandle {
    fn drop(&mut self) {
        unsafe { CloseHandle(self.0) };
    }
}

struct Profile {
    name: Vec<u16>,
    sid: PSID,
    work: PathBuf,
}
impl Profile {
    fn new() -> io::Result<Self> {
        let name = wide(OsStr::new(&format!(
            "CreatorOS.Command.{:016x}{:016x}",
            rand::random::<u64>(),
            rand::random::<u64>()
        )));
        let display = wide(OsStr::new("CreatorOS task command"));
        let mut sid = ptr::null_mut();
        let hr = unsafe {
            CreateAppContainerProfile(
                name.as_ptr(),
                display.as_ptr(),
                display.as_ptr(),
                ptr::null(),
                0,
                &mut sid,
            )
        };
        // A fresh random profile must not be reused: an old profile could
        // contain attacker-controlled files or have broader capabilities.
        if hr < 0 || sid.is_null() {
            return Err(io::Error::new(
                io::ErrorKind::PermissionDenied,
                format!("AppContainer profile creation failed: {hr:#x}"),
            ));
        }
        let mut profile = Self {
            name,
            sid,
            work: PathBuf::new(),
        };
        let mut sid_text = ptr::null_mut();
        if unsafe { ConvertSidToStringSidW(profile.sid, &mut sid_text) } == 0 {
            return Err(io::Error::last_os_error());
        }
        let mut folder = ptr::null_mut();
        let hr = unsafe { GetAppContainerFolderPath(sid_text, &mut folder) };
        unsafe { LocalFree(sid_text.cast()) };
        if hr < 0 || folder.is_null() {
            return Err(io::Error::new(
                io::ErrorKind::PermissionDenied,
                format!("AppContainer folder lookup failed: {hr:#x}"),
            ));
        }
        let mut len = 0;
        while unsafe { *folder.add(len) } != 0 {
            len += 1;
        }
        let path = String::from_utf16(unsafe { std::slice::from_raw_parts(folder, len) })
            .map_err(|_| io::Error::new(io::ErrorKind::InvalidData, "invalid profile path"))?;
        unsafe { CoTaskMemFree(folder.cast()) };
        profile.work = PathBuf::from(path).join("CreatorOS-work");
        fs::create_dir(&profile.work)?;
        // Only this fresh profile directory receives its package SID ACE.
        // The original task tree and neighboring task ACLs are never changed.
        grant_work_acl(&profile.work, profile.sid)?;
        Ok(profile)
    }
}
impl Drop for Profile {
    fn drop(&mut self) {
        if !self.work.as_os_str().is_empty() {
            let _ = fs::remove_dir_all(&self.work);
        }
        unsafe {
            DeleteAppContainerProfile(self.name.as_ptr());
            FreeSid(self.sid);
        }
    }
}

fn grant_work_acl(work: &Path, sid: PSID) -> io::Result<()> {
    let mut path = wide(work.as_os_str());
    let mut old_acl: *mut ACL = ptr::null_mut();
    let mut descriptor = ptr::null_mut();
    let code = unsafe {
        GetNamedSecurityInfoW(
            path.as_ptr(),
            SE_FILE_OBJECT,
            DACL_SECURITY_INFORMATION,
            ptr::null_mut(),
            ptr::null_mut(),
            &mut old_acl,
            ptr::null_mut(),
            &mut descriptor,
        )
    };
    if code != 0 {
        return Err(win_error(code));
    }
    if old_acl.is_null() {
        unsafe { LocalFree(descriptor) };
        return Err(io::Error::new(
            io::ErrorKind::PermissionDenied,
            "AppContainer workspace has a null DACL",
        ));
    }
    let mut entry = EXPLICIT_ACCESS_W::default();
    entry.grfAccessPermissions = FILE_GENERIC_READ | FILE_GENERIC_WRITE | FILE_GENERIC_EXECUTE;
    entry.grfAccessMode = GRANT_ACCESS;
    entry.grfInheritance = SUB_CONTAINERS_AND_OBJECTS_INHERIT;
    entry.Trustee.TrusteeForm = TRUSTEE_IS_SID;
    entry.Trustee.TrusteeType = TRUSTEE_IS_UNKNOWN;
    entry.Trustee.ptstrName = sid.cast();
    let mut updated: *mut ACL = ptr::null_mut();
    let code = unsafe { SetEntriesInAclW(1, &entry, old_acl, &mut updated) };
    if code != 0 {
        unsafe { LocalFree(descriptor) };
        return Err(win_error(code));
    }
    let code = unsafe {
        SetNamedSecurityInfoW(
            path.as_mut_ptr(),
            SE_FILE_OBJECT,
            DACL_SECURITY_INFORMATION,
            ptr::null_mut(),
            ptr::null_mut(),
            updated,
            ptr::null_mut(),
        )
    };
    unsafe {
        LocalFree(updated.cast());
        LocalFree(descriptor);
    }
    if code != 0 {
        Err(win_error(code))
    } else {
        Ok(())
    }
}

struct AttributeList {
    words: Vec<usize>,
}
impl AttributeList {
    fn new() -> io::Result<Self> {
        let mut bytes = 0usize;
        unsafe { InitializeProcThreadAttributeList(ptr::null_mut(), 2, 0, &mut bytes) };
        if bytes == 0 {
            return Err(io::Error::last_os_error());
        }
        let mut words = vec![0usize; bytes.div_ceil(size_of::<usize>())];
        if unsafe { InitializeProcThreadAttributeList(words.as_mut_ptr().cast(), 2, 0, &mut bytes) }
            == 0
        {
            return Err(io::Error::last_os_error());
        }
        Ok(Self { words })
    }
    fn ptr(&mut self) -> *mut c_void {
        self.words.as_mut_ptr().cast()
    }
}
impl Drop for AttributeList {
    fn drop(&mut self) {
        unsafe { DeleteProcThreadAttributeList(self.ptr()) };
    }
}

fn inheritable(file: &File) -> io::Result<HANDLE> {
    let handle = file.as_raw_handle() as HANDLE;
    if unsafe { SetHandleInformation(handle, HANDLE_FLAG_INHERIT, HANDLE_FLAG_INHERIT) } == 0 {
        Err(io::Error::last_os_error())
    } else {
        Ok(handle)
    }
}

fn limited_job() -> io::Result<OwnedHandle> {
    let job = OwnedHandle::new(unsafe { CreateJobObjectW(ptr::null(), ptr::null()) })?;
    let mut limits = JOBOBJECT_EXTENDED_LIMIT_INFORMATION::default();
    limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
        | JOB_OBJECT_LIMIT_ACTIVE_PROCESS
        | JOB_OBJECT_LIMIT_JOB_MEMORY
        | JOB_OBJECT_LIMIT_DIE_ON_UNHANDLED_EXCEPTION;
    limits.BasicLimitInformation.ActiveProcessLimit = 16;
    limits.JobMemoryLimit = 512 * 1024 * 1024;
    if unsafe {
        SetInformationJobObject(
            job.0,
            JobObjectExtendedLimitInformation,
            (&limits as *const JOBOBJECT_EXTENDED_LIMIT_INFORMATION).cast(),
            size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
        )
    } == 0
    {
        return Err(io::Error::last_os_error());
    }
    Ok(job)
}

pub(super) struct SandboxedProcess {
    process: OwnedHandle,
    job: OwnedHandle,
    profile: Profile,
}
impl SandboxedProcess {
    pub(super) fn work(&self) -> &Path {
        &self.profile.work
    }
    pub(super) fn wait(&self, timeout_ms: u32) -> io::Result<Option<i32>> {
        match unsafe { WaitForSingleObject(self.process.0, timeout_ms) } {
            WAIT_TIMEOUT => Ok(None),
            WAIT_OBJECT_0 => {
                let mut code = 0;
                if unsafe { GetExitCodeProcess(self.process.0, &mut code) } == 0 {
                    Err(io::Error::last_os_error())
                } else {
                    Ok(Some(code as i32))
                }
            }
            _ => Err(io::Error::last_os_error()),
        }
    }
    pub(super) fn cancel(&self) -> io::Result<()> {
        if unsafe { TerminateJobObject(self.job.0, 1) } == 0 {
            Err(io::Error::last_os_error())
        } else {
            let _ = self.wait(10_000)?;
            Ok(())
        }
    }
}
impl Drop for SandboxedProcess {
    fn drop(&mut self) {
        // This handle owns the process tree. No child can outlive a dropped
        // command host even if the desktop shell crashes.
        let _ = self.cancel();
    }
}

/// Starts one copied, verified runtime inside a fresh AppContainer. Callers
/// stage task files into the returned private work folder and import only
/// validated outputs after the process exits. This function is not admitted
/// from the Windows IPC until the Windows containment probes pass.
pub(super) fn launch(
    runtime: &Path,
    argv: &[String],
    staged: &[(PathBuf, Vec<u8>)],
    stdin: &[u8],
) -> io::Result<SandboxedProcess> {
    if !runtime.is_file() || argv.len() > 128 || staged.len() > 128 || stdin.len() > 1_000_000 {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "invalid command input",
        ));
    }
    if staged.iter().map(|(_, bytes)| bytes.len()).sum::<usize>() > 16_000_000 {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "task snapshot too large",
        ));
    }
    let profile = Profile::new()?;
    for (relative, content) in staged {
        if relative.is_absolute()
            || relative
                .components()
                .any(|component| !matches!(component, std::path::Component::Normal(_)))
        {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "invalid staged path",
            ));
        }
        let target = profile.work.join(relative);
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::write(target, content)?;
    }
    let exe = profile.work.join("runtime.exe");
    fs::copy(runtime, &exe)?;
    let stdin_path = profile.work.join("stdin.bin");
    fs::write(&stdin_path, stdin)?;
    let stdin_file = File::open(&stdin_path)?;
    let stdout_file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(profile.work.join("stdout.bin"))?;
    let stderr_file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(profile.work.join("stderr.bin"))?;
    let handles = [
        inheritable(&stdin_file)?,
        inheritable(&stdout_file)?,
        inheritable(&stderr_file)?,
    ];
    let mut attrs = AttributeList::new()?;
    let mut capabilities = SECURITY_CAPABILITIES {
        AppContainerSid: profile.sid,
        Capabilities: ptr::null_mut(),
        CapabilityCount: 0,
        Reserved: 0,
    };
    if unsafe {
        UpdateProcThreadAttribute(
            attrs.ptr(),
            0,
            PROC_THREAD_ATTRIBUTE_SECURITY_CAPABILITIES as usize,
            (&mut capabilities as *mut SECURITY_CAPABILITIES).cast(),
            size_of::<SECURITY_CAPABILITIES>(),
            ptr::null_mut(),
            ptr::null(),
        )
    } == 0
    {
        return Err(io::Error::last_os_error());
    }
    if unsafe {
        UpdateProcThreadAttribute(
            attrs.ptr(),
            0,
            PROC_THREAD_ATTRIBUTE_HANDLE_LIST as usize,
            handles.as_ptr().cast(),
            size_of::<[HANDLE; 3]>(),
            ptr::null_mut(),
            ptr::null(),
        )
    } == 0
    {
        return Err(io::Error::last_os_error());
    }
    let mut startup = STARTUPINFOEXW::default();
    startup.StartupInfo.cb = size_of::<STARTUPINFOEXW>() as u32;
    startup.StartupInfo.dwFlags = STARTF_USESTDHANDLES;
    startup.StartupInfo.hStdInput = handles[0];
    startup.StartupInfo.hStdOutput = handles[1];
    startup.StartupInfo.hStdError = handles[2];
    startup.lpAttributeList = attrs.ptr();
    let mut command = quote_windows_arg(&exe.to_string_lossy());
    for arg in argv {
        if arg.contains('\0') || arg.len() > 8192 {
            return Err(io::Error::new(io::ErrorKind::InvalidInput, "invalid argv"));
        }
        command.push(' ');
        command.push_str(&quote_windows_arg(arg));
    }
    if command.encode_utf16().count() >= 32_767 {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "Windows command line too long",
        ));
    }
    let mut command = wide(OsStr::new(&command));
    let exe_wide = wide(exe.as_os_str());
    let cwd_wide = wide(profile.work.as_os_str());
    // No inherited app/model environment: in particular no credentials,
    // proxy, PATH, Node options or Python module path.
    let system_root = system_windows_directory()?;
    let env = format!(
        "SystemRoot={}\0TEMP={}\0TMP={}\0USERPROFILE={}\0PATH=\0\0",
        system_root,
        profile.work.display(),
        profile.work.display(),
        profile.work.display()
    );
    let env_wide: Vec<u16> = env.encode_utf16().collect();
    let job = limited_job()?;
    let mut info = PROCESS_INFORMATION::default();
    if unsafe {
        CreateProcessW(
            exe_wide.as_ptr(),
            command.as_mut_ptr(),
            ptr::null(),
            ptr::null(),
            1,
            CREATE_SUSPENDED
                | CREATE_NO_WINDOW
                | CREATE_UNICODE_ENVIRONMENT
                | EXTENDED_STARTUPINFO_PRESENT,
            env_wide.as_ptr().cast(),
            cwd_wide.as_ptr(),
            &startup.StartupInfo,
            &mut info,
        )
    } == 0
    {
        return Err(io::Error::last_os_error());
    }
    let process = OwnedHandle::new(info.hProcess)?;
    let thread = OwnedHandle::new(info.hThread)?;
    if unsafe { AssignProcessToJobObject(job.0, process.0) } == 0 {
        unsafe { windows_sys::Win32::System::Threading::TerminateProcess(process.0, 1) };
        return Err(io::Error::last_os_error());
    }
    if unsafe { ResumeThread(thread.0) } == u32::MAX {
        unsafe { TerminateJobObject(job.0, 1) };
        return Err(io::Error::last_os_error());
    }
    Ok(SandboxedProcess {
        process,
        job,
        profile,
    })
}
