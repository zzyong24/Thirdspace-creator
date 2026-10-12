//! Private Windows task-file transport. The pipe DACL limits local access and
//! the kernel-reported client PID must equal the child started by the shell.
//! The pipe name, WebView handshake and request body confer no authority.
#![cfg(windows)]

#[cfg(test)]
use super::command_windows::{
    CommandError, CommandHost, CommandReceipt, CommandRequest, RuntimeRegistry,
};
use super::files::{FileError, TaskFiles};
use base64::Engine as _;
use rand::RngCore as _;
use serde::Deserialize;
use serde_json::{json, Value};
use std::{
    io,
    mem::size_of,
    path::PathBuf,
    ptr,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    thread::JoinHandle,
    time::{Duration, Instant},
};
use windows_sys::Win32::{
    Foundation::{
        CloseHandle, GetLastError, LocalFree, ERROR_IO_PENDING, ERROR_PIPE_CONNECTED, HANDLE,
        INVALID_HANDLE_VALUE, WAIT_OBJECT_0, WAIT_TIMEOUT,
    },
    Security::{
        Authorization::{
            ConvertSidToStringSidW, ConvertStringSecurityDescriptorToSecurityDescriptorW,
        },
        GetTokenInformation, TokenUser, SECURITY_ATTRIBUTES, TOKEN_QUERY, TOKEN_USER,
    },
    Storage::FileSystem::{
        ReadFile, WriteFile, FILE_FLAG_FIRST_PIPE_INSTANCE, FILE_FLAG_OVERLAPPED,
        PIPE_ACCESS_DUPLEX,
    },
    System::{
        Pipes::{
            ConnectNamedPipe, CreateNamedPipeW, DisconnectNamedPipe, GetNamedPipeClientProcessId,
            PIPE_READMODE_BYTE, PIPE_REJECT_REMOTE_CLIENTS, PIPE_TYPE_BYTE, PIPE_WAIT,
        },
        Threading::{CreateEventW, GetCurrentProcess, OpenProcessToken, WaitForSingleObject},
        IO::{CancelIoEx, GetOverlappedResult, OVERLAPPED},
    },
};

const MAX_REQUEST: usize = 1_400_000;
// The pipe default is not an activity timer; every actual phase freezes below.
const IO_TIMEOUT_MS: u32 = 120_000;
const IO_PHASE: Duration = Duration::from_secs(120);

struct Handle(HANDLE);
unsafe impl Send for Handle {}
impl Drop for Handle {
    fn drop(&mut self) {
        unsafe {
            CloseHandle(self.0);
        }
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Scope {
    user_id: String,
    account_id: String,
    task_id: String,
    attempt: u32,
    fence_token: String,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Request {
    operation_id: String,
    scope: Scope,
    action: Action,
}
#[derive(Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
enum Action {
    List {
        path: Option<String>,
    },
    Read {
        path: String,
        offset: u64,
        limit: usize,
    },
    Stat {
        path: String,
    },
    Write {
        path: String,
        #[serde(rename = "contentBase64")]
        content_base64: String,
        #[serde(rename = "expectedVersion")]
        expected_version: Option<u64>,
    },
    FileReceipt {
        #[serde(rename = "targetOperationId")]
        target_operation_id: String,
        path: String,
        #[serde(rename = "expectedVersion")]
        expected_version: Option<u64>,
        #[serde(rename = "contentSha256")]
        content_sha256: String,
        #[serde(rename = "byteLength")]
        byte_length: u64,
    },
    #[cfg(test)]
    CommandRun {
        argv: Vec<String>,
        cwd: String,
        #[serde(rename = "runtimeId")]
        runtime_id: String,
        #[serde(rename = "timeoutMs")]
        timeout_ms: u64,
        #[serde(rename = "stdinRef")]
        stdin_ref: Option<String>,
    },
    #[cfg(test)]
    CommandStatus {
        #[serde(rename = "targetOperationId")]
        target_operation_id: String,
    },
    #[cfg(test)]
    CommandCancel {
        #[serde(rename = "targetOperationId")]
        target_operation_id: String,
    },
    #[cfg(test)]
    CommandRead {
        #[serde(rename = "targetOperationId")]
        target_operation_id: String,
        stream: String,
        offset: u64,
        limit: usize,
    },
}

#[derive(Clone)]
enum CommandMode {
    Disabled,
    #[cfg(test)]
    Probe(Arc<CommandHost>),
}

#[cfg(test)]
fn command_error(error: CommandError) -> Value {
    let code = match error {
        CommandError::InvalidInput => "INVALID_COMMAND",
        CommandError::VersionConflict => "VERSION_CONFLICT",
        CommandError::ResultUnknown => "NATIVE_RESULT_UNKNOWN",
        CommandError::Unavailable(_) => "COMMAND_UNAVAILABLE",
        CommandError::Io(_) => "COMMAND_IO_ERROR",
        CommandError::WrongScope => "WRONG_SCOPE",
        CommandError::AlreadyRunning => "COMMAND_ALREADY_RUNNING",
    };
    json!({"ok":false,"code":code})
}

#[cfg(test)]
fn command_receipt(receipt: CommandReceipt) -> Value {
    json!({"operationId":receipt.operation_id,"state":receipt.state,"exitCode":receipt.exit_code,
        "stdoutRef":receipt.stdout_ref,"stderrRef":receipt.stderr_ref,
        "stdoutPreview":receipt.stdout_preview,"stderrPreview":receipt.stderr_preview,"truncated":receipt.truncated})
}

fn valid_id(id: &str) -> bool {
    !id.is_empty() && id.len() <= 160 && !id.chars().any(char::is_control)
}
fn file_error(error: FileError) -> Value {
    match error {
        FileError::InvalidPath => json!({"ok":false,"code":"INVALID_PATH"}),
        FileError::Conflict { current_version } => {
            json!({"ok":false,"code":"VERSION_CONFLICT","currentVersion":current_version})
        }
        FileError::TooLarge => json!({"ok":false,"code":"TOO_LARGE"}),
        FileError::UnsupportedPlatform => json!({"ok":false,"code":"UNSUPPORTED_PLATFORM"}),
        FileError::Io(_) => json!({"ok":false,"code":"FILE_IO_ERROR"}),
        FileError::OperationConflict => json!({"ok":false,"code":"FILE_OPERATION_CONFLICT"}),
        FileError::OperationPending => json!({"ok":false,"code":"FILE_OPERATION_PENDING"}),
        FileError::InvalidRecord => json!({"ok":false,"code":"FILE_JOURNAL_INVALID"}),
    }
}
fn execute(base: &std::path::Path, request: Request, commands: &CommandMode) -> Value {
    let Scope {
        user_id,
        account_id,
        task_id,
        attempt,
        fence_token,
    } = request.scope;
    // Only the PID-bound Node sidecar can supply this scope. It must hold the
    // backend execution admission lock while this request is in flight.
    if !valid_id(&request.operation_id)
        || !valid_id(&user_id)
        || !valid_id(&account_id)
        || !valid_id(&task_id)
        || attempt == 0
        || !valid_id(&fence_token)
    {
        return json!({"ok":false,"code":"INVALID_CONTEXT"});
    }
    let files = match TaskFiles::new(base, &user_id, &account_id, &task_id) {
        Ok(files) => files,
        Err(error) => return file_error(error),
    };
    #[cfg(not(test))]
    let _ = (&attempt, &fence_token, commands);
    #[cfg(test)]
    let command_scope = format!("{}|{}|{}", files.scope_key(), attempt, fence_token);
    let result: Result<Value, Value> = match request.action {
        Action::List { path } => files.list(path.as_deref()).map(|entries| json!({"entries":entries})).map_err(file_error),
        Action::Read { path, offset, limit } => files.read_page(&path, offset, limit)
            .map(|page| match page {
                Some((content,total,version)) => json!({"contentBase64":base64::engine::general_purpose::STANDARD.encode(content),"total":total,"version":version}),
                None => Value::Null,
            }).map_err(file_error),
        Action::Stat { path } => files.stat(&path).map(|stat| match stat {
            Some((is_dir,size,version)) => json!({"isDirectory":is_dir,"size":size,"version":version}),
            None => Value::Null,
        }).map_err(file_error),
        Action::Write { path, content_base64, expected_version } =>
            match base64::engine::general_purpose::STANDARD.decode(content_base64) {
                Ok(bytes) if bytes.len() <= 1_000_000 => files.write_operation(&request.operation_id,attempt,&fence_token,&path,&bytes,expected_version).map(|version| json!({"version":version})),
                Ok(_) => Err(FileError::TooLarge), Err(_) => Err(FileError::InvalidPath),
            }.map_err(file_error),
        Action::FileReceipt {target_operation_id,path,expected_version,content_sha256,byte_length} => files
            .file_receipt(&target_operation_id,&path,expected_version,&content_sha256,byte_length)
            .map(|record|match record {Some(receipt)=>json!({"status":receipt.state,"receipt":receipt}),None=>json!({"status":"absent"})})
            .map_err(file_error),
        #[cfg(test)]
        Action::CommandRun { argv, cwd, runtime_id, timeout_ms, stdin_ref } => match commands {
            CommandMode::Probe(host) => host.run_candidate(Arc::new(files), &command_scope, &request.operation_id,
                CommandRequest {argv,cwd,runtime_id,timeout_ms,stdin_ref}).map(command_receipt).map_err(command_error),
            CommandMode::Disabled => Err(json!({"ok":false,"code":"INVALID_REQUEST"})),
        },
        #[cfg(test)]
        Action::CommandStatus { target_operation_id } => match commands {
            CommandMode::Probe(host) => host.status_candidate(&command_scope, &target_operation_id).map(command_receipt).map_err(command_error),
            CommandMode::Disabled => Err(json!({"ok":false,"code":"INVALID_REQUEST"})),
        },
        #[cfg(test)]
        Action::CommandCancel { target_operation_id } => match commands {
            CommandMode::Probe(host) => host.cancel_candidate(&command_scope, &target_operation_id).map(command_receipt).map_err(command_error),
            CommandMode::Disabled => Err(json!({"ok":false,"code":"INVALID_REQUEST"})),
        },
        #[cfg(test)]
        Action::CommandRead { target_operation_id, stream, offset, limit } => match commands {
            CommandMode::Probe(host) => host.read_candidate(&command_scope, &target_operation_id, &stream, offset, limit)
                .map(|(content,total,truncated)| json!({"contentBase64":base64::engine::general_purpose::STANDARD.encode(content),"total":total,"truncated":truncated}))
                .map_err(command_error),
            CommandMode::Disabled => Err(json!({"ok":false,"code":"INVALID_REQUEST"})),
        },
    };
    match result {
        Ok(value) => json!({"ok":true,"operationId":request.operation_id,"value":value}),
        Err(error) => error,
    }
}

fn wide(text: &str) -> Vec<u16> {
    text.encode_utf16().chain([0]).collect()
}

fn current_user_sid() -> io::Result<String> {
    let mut raw_token = ptr::null_mut();
    if unsafe { OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &mut raw_token) } == 0 {
        return Err(io::Error::last_os_error());
    }
    let token = Handle(raw_token);
    let mut required = 0u32;
    unsafe {
        GetTokenInformation(token.0, TokenUser, ptr::null_mut(), 0, &mut required);
    }
    if required < size_of::<TOKEN_USER>() as u32 {
        return Err(io::Error::last_os_error());
    }
    let mut words = vec![0usize; (required as usize + size_of::<usize>() - 1) / size_of::<usize>()];
    if unsafe {
        GetTokenInformation(
            token.0,
            TokenUser,
            words.as_mut_ptr().cast(),
            required,
            &mut required,
        )
    } == 0
    {
        return Err(io::Error::last_os_error());
    }
    let sid = unsafe { (*(words.as_ptr() as *const TOKEN_USER)).User.Sid };
    let mut sid_text = ptr::null_mut();
    if unsafe { ConvertSidToStringSidW(sid, &mut sid_text) } == 0 {
        return Err(io::Error::last_os_error());
    }
    let mut len = 0usize;
    while unsafe { *sid_text.add(len) } != 0 {
        len += 1;
    }
    let value = String::from_utf16(unsafe { std::slice::from_raw_parts(sid_text, len) })
        .map_err(|_| io::Error::new(io::ErrorKind::InvalidData, "invalid user SID"));
    unsafe {
        LocalFree(sid_text.cast());
    }
    value
}

fn create_pipe(name: &[u16], first: bool) -> io::Result<Handle> {
    let sid = current_user_sid()?;
    let sddl = wide(&format!("D:P(A;;GA;;;SY)(A;;GA;;;{sid})"));
    let mut descriptor = ptr::null_mut();
    if unsafe {
        ConvertStringSecurityDescriptorToSecurityDescriptorW(
            sddl.as_ptr(),
            1,
            &mut descriptor,
            ptr::null_mut(),
        )
    } == 0
    {
        return Err(io::Error::last_os_error());
    }
    let attributes = SECURITY_ATTRIBUTES {
        nLength: size_of::<SECURITY_ATTRIBUTES>() as u32,
        lpSecurityDescriptor: descriptor,
        bInheritHandle: 0,
    };
    let pipe = unsafe {
        CreateNamedPipeW(
            name.as_ptr(),
            PIPE_ACCESS_DUPLEX
                | FILE_FLAG_OVERLAPPED
                | if first {
                    FILE_FLAG_FIRST_PIPE_INSTANCE
                } else {
                    0
                },
            PIPE_TYPE_BYTE | PIPE_READMODE_BYTE | PIPE_WAIT | PIPE_REJECT_REMOTE_CLIENTS,
            4,
            65_536,
            65_536,
            IO_TIMEOUT_MS,
            &attributes,
        )
    };
    unsafe {
        LocalFree(descriptor);
    }
    if pipe == INVALID_HANDLE_VALUE {
        Err(io::Error::last_os_error())
    } else {
        Ok(Handle(pipe))
    }
}

fn event() -> io::Result<Handle> {
    let handle = unsafe { CreateEventW(ptr::null(), 1, 0, ptr::null()) };
    if handle.is_null() {
        Err(io::Error::last_os_error())
    } else {
        Ok(Handle(handle))
    }
}
fn phase_remaining(deadline: Instant, stop: &AtomicBool) -> io::Result<Duration> {
    if stop.load(Ordering::Acquire) {
        return Err(io::Error::new(io::ErrorKind::Interrupted, "owned pipe stopped"));
    }
    deadline.checked_duration_since(Instant::now())
        .filter(|remaining| !remaining.is_zero())
        .ok_or_else(|| io::Error::new(io::ErrorKind::TimedOut, "pipe phase deadline exhausted"))
}
fn completed_count(pipe: HANDLE, overlapped: &mut OVERLAPPED) -> io::Result<u32> {
    let mut count = 0;
    if unsafe { GetOverlappedResult(pipe, overlapped, &mut count, 0) } == 0 {
        Err(io::Error::last_os_error())
    } else { Ok(count) }
}
fn finish_io(pipe: HANDLE, overlapped: &mut OVERLAPPED, deadline: Instant, stop: &AtomicBool) -> io::Result<u32> {
    loop {
        let remaining = phase_remaining(deadline, stop);
        let failure = match remaining {
            Err(error) => Some(error),
            Ok(remaining) => {
                match unsafe { WaitForSingleObject(overlapped.hEvent, remaining.as_millis().clamp(1, 100) as u32) } {
                    WAIT_OBJECT_0 => return completed_count(pipe, overlapped),
                    WAIT_TIMEOUT => None,
                    _ => Some(io::Error::last_os_error()),
                }
            }
        };
        if let Some(error) = failure {
            // Cancellation is requested promptly, but an unconfirmed kernel
            // drain is never success. Keep the stack OVERLAPPED and buffer alive
            // until the original OS operation has really completed.
            unsafe {
                CancelIoEx(pipe, overlapped);
                while WaitForSingleObject(overlapped.hEvent, u32::MAX) != WAIT_OBJECT_0 {
                    // An unexpected wait error is not completion. Do not free
                    // an OVERLAPPED/buffer that may still be owned by the OS.
                    std::thread::sleep(Duration::from_millis(100));
                }
            }
            return Err(error);
        }
    }
}
fn read_chunk(pipe: HANDLE, buffer: &mut [u8], deadline: Instant, stop: &AtomicBool) -> io::Result<usize> {
    phase_remaining(deadline, stop)?;
    let guard = event()?;
    let mut overlapped = OVERLAPPED {
        hEvent: guard.0,
        ..Default::default()
    };
    let ok = unsafe {
        ReadFile(
            pipe,
            buffer.as_mut_ptr(),
            buffer.len() as u32,
            ptr::null_mut(),
            &mut overlapped,
        )
    };
    if ok == 0 && unsafe { GetLastError() } != ERROR_IO_PENDING {
        return Err(io::Error::last_os_error());
    }
    Ok(finish_io(pipe, &mut overlapped, deadline, stop)? as usize)
}
fn write_all(pipe: HANDLE, mut bytes: &[u8], deadline: Instant, stop: &AtomicBool) -> io::Result<()> {
    while !bytes.is_empty() {
        phase_remaining(deadline, stop)?;
        let guard = event()?;
        let mut overlapped = OVERLAPPED {
            hEvent: guard.0,
            ..Default::default()
        };
        let ok = unsafe {
            WriteFile(
                pipe,
                bytes.as_ptr(),
                bytes.len() as u32,
                ptr::null_mut(),
                &mut overlapped,
            )
        };
        if ok == 0 && unsafe { GetLastError() } != ERROR_IO_PENDING {
            return Err(io::Error::last_os_error());
        }
        let count = finish_io(pipe, &mut overlapped, deadline, stop)? as usize;
        if count == 0 {
            return Err(io::Error::new(io::ErrorKind::WriteZero, "empty pipe write"));
        }
        bytes = &bytes[count..];
    }
    Ok(())
}
fn accept(pipe: HANDLE, stop: &AtomicBool) -> io::Result<bool> {
    let guard = event()?;
    let mut overlapped = OVERLAPPED {
        hEvent: guard.0,
        ..Default::default()
    };
    let ok = unsafe { ConnectNamedPipe(pipe, &mut overlapped) };
    if ok != 0 || unsafe { GetLastError() } == ERROR_PIPE_CONNECTED {
        return Ok(true);
    }
    if unsafe { GetLastError() } != ERROR_IO_PENDING {
        return Err(io::Error::last_os_error());
    }
    while !stop.load(Ordering::Acquire) {
        match unsafe { WaitForSingleObject(guard.0, 100) } {
            WAIT_OBJECT_0 => return completed_count(pipe, &mut overlapped).map(|_| true),
            WAIT_TIMEOUT => {}
            _ => break,
        }
    }
    unsafe {
        CancelIoEx(pipe, &overlapped);
        while WaitForSingleObject(guard.0, u32::MAX) != WAIT_OBJECT_0 {
            std::thread::sleep(Duration::from_millis(100));
        }
    }
    Ok(false)
}
fn serve(
    pipe: HANDLE,
    expected_pid: u32,
    base: &std::path::Path,
    commands: &CommandMode,
    read_deadline: Instant,
    stop: &AtomicBool,
) -> io::Result<Instant> {
    let mut client_pid = 0u32;
    if unsafe { GetNamedPipeClientProcessId(pipe, &mut client_pid) } == 0
        || client_pid != expected_pid
    {
        // An ACL-matching process is still not the sidecar. Do not read its body.
        let write_deadline = Instant::now() + IO_PHASE;
        write_all(pipe, b"{\"ok\":false,\"code\":\"UNAUTHORIZED_PEER\"}\n", write_deadline, stop)?;
        return Ok(write_deadline);
    }
    let mut body = Vec::new();
    let mut chunk = [0u8; 8192];
    while body.len() <= MAX_REQUEST && !body.contains(&b'\n') {
        let count = read_chunk(pipe, &mut chunk, read_deadline, stop)?;
        if count == 0 {
            break;
        }
        body.extend_from_slice(&chunk[..count]);
    }
    phase_remaining(read_deadline, stop)?;
    let reply = if body.len() > MAX_REQUEST || !body.contains(&b'\n') {
        json!({"ok":false,"code":"INVALID_REQUEST"})
    } else {
        let end = body.iter().position(|b| *b == b'\n').unwrap();
        match serde_json::from_slice::<Request>(&body[..end]) {
            Ok(request) => execute(base, request, commands),
            Err(_) => json!({"ok":false,"code":"INVALID_REQUEST"}),
        }
    };
    let write_deadline = Instant::now() + IO_PHASE;
    let mut bytes = serde_json::to_vec(&reply)?;
    bytes.push(b'\n');
    write_all(pipe, &bytes, write_deadline, stop)?;
    Ok(write_deadline)
}

pub struct PendingBridge {
    name: String,
    first: Handle,
}
impl PendingBridge {
    pub fn bind() -> io::Result<Self> {
        let mut entropy = [0u8; 16];
        rand::rngs::OsRng.fill_bytes(&mut entropy);
        let name = format!(
            r"\\.\pipe\creatoros-workbench-{}",
            entropy
                .iter()
                .map(|b| format!("{b:02x}"))
                .collect::<String>()
        );
        let first = create_pipe(&wide(&name), true)?;
        Ok(Self { name, first })
    }
    pub fn pipe_name(&self) -> &str {
        &self.name
    }
    pub fn start(self, expected_pid: u32, base: PathBuf) -> RunningBridge {
        self.start_with_mode(expected_pid, base, CommandMode::Disabled)
    }
    #[cfg(test)]
    pub fn start_test_commands(
        self,
        expected_pid: u32,
        base: PathBuf,
        runtimes: RuntimeRegistry,
    ) -> io::Result<RunningBridge> {
        if std::env::var("CREATOROS_T1007_WINDOWS_COMMAND_PROBE")
            .ok()
            .as_deref()
            != Some("1")
        {
            return Err(io::Error::new(
                io::ErrorKind::PermissionDenied,
                "Windows command probe requires explicit opt-in",
            ));
        }
        Ok(self.start_with_mode(
            expected_pid,
            base,
            CommandMode::Probe(Arc::new(CommandHost::new(runtimes))),
        ))
    }
    fn start_with_mode(
        self,
        expected_pid: u32,
        base: PathBuf,
        commands: CommandMode,
    ) -> RunningBridge {
        let stop = Arc::new(AtomicBool::new(false));
        let mut threads = Vec::new();
        let name = wide(&self.name);
        let mut pipes = vec![self.first];
        for _ in 1..4 {
            if let Ok(pipe) = create_pipe(&name, false) {
                pipes.push(pipe);
            }
        }
        for pipe in pipes {
            let stop_thread = stop.clone();
            let base = base.clone();
            let commands = commands.clone();
            let raw = pipe.0 as usize;
            threads.push(std::thread::spawn(move || {
                let _owned_pipe = pipe;
                let raw = raw as HANDLE;
                while !stop_thread.load(Ordering::Acquire) {
                    match accept(raw, &stop_thread) {
                        Ok(true) => {
                            let read_deadline = Instant::now() + IO_PHASE;
                            if let Ok(reply_deadline) = serve(raw, expected_pid, &base, &commands, read_deadline, &stop_thread) {
                                // Node closes after consuming the newline. Wait for that
                                // close with the bounded I/O deadline before disconnecting.
                                let mut trailing = [0u8; 1];
                                let _ = read_chunk(raw, &mut trailing, reply_deadline, &stop_thread);
                            }
                            unsafe {
                                DisconnectNamedPipe(raw);
                            }
                        }
                        Ok(false) => break,
                        Err(_) => break,
                    }
                }
            }));
        }
        RunningBridge { stop, threads }
    }
}
pub struct RunningBridge {
    stop: Arc<AtomicBool>,
    threads: Vec<JoinHandle<()>>,
}
impl Drop for RunningBridge {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::Release);
        // ConnectNamedPipe checks stop at most 100 ms later. An in-flight
        // framing/reply waiting checks stop every 100 ms; original OS I/O
        // must really drain before freeing its OVERLAPPED or buffer.
        for thread in self.threads.drain(..) {
            let _ = thread.join();
        }
    }
}
#[derive(Default)]
pub struct BridgeState(pub Mutex<Option<RunningBridge>>);

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn t1250_expired_phase_and_owned_stop_do_not_open_another_io_slot() {
        let expired = Instant::now();
        assert_eq!(phase_remaining(expired, &AtomicBool::new(false)).unwrap_err().kind(), io::ErrorKind::TimedOut);
        assert_eq!(phase_remaining(Instant::now() + IO_PHASE, &AtomicBool::new(true)).unwrap_err().kind(), io::ErrorKind::Interrupted);
        assert_eq!(IO_TIMEOUT_MS, 120000);
    }

    use std::{
        fs::OpenOptions,
        io::{BufRead, BufReader, Write},
        time::Duration,
    };
    fn request(path: &str) -> String {
        json!({"operationId":"op","scope":{"userId":"u","accountId":"a","taskId":"t","attempt":1,"fenceToken":"f"},
            "action":{"kind":"write","path":path,"contentBase64":"aGVsbG8=","expectedVersion":0}}).to_string()
    }
    fn call(name: &str, body: &str) -> Value {
        let mut client = (0..100)
            .find_map(|_| {
                let open = OpenOptions::new().read(true).write(true).open(name).ok();
                if open.is_none() {
                    std::thread::sleep(Duration::from_millis(10));
                }
                open
            })
            .expect("pipe available");
        writeln!(client, "{body}").unwrap();
        let mut reply = String::new();
        BufReader::new(client).read_line(&mut reply).unwrap();
        serde_json::from_str(&reply).unwrap()
    }
    #[test]
    fn actual_client_pid_controls_file_access_and_commands_are_absent() {
        let root =
            std::env::temp_dir().join(format!("creatoros-win-ipc-{}", rand::random::<u64>()));
        let denied = PendingBridge::bind().unwrap();
        let name = denied.pipe_name().to_string();
        let running = denied.start(std::process::id().wrapping_add(1), root.clone());
        assert_eq!(
            call(&name, &request("report.html"))["code"],
            "UNAUTHORIZED_PEER"
        );
        drop(running);
        assert!(!root.exists());
        let allowed = PendingBridge::bind().unwrap();
        let name = allowed.pipe_name().to_string();
        let running = allowed.start(std::process::id(), root.clone());
        assert_eq!(
            call(&name, &request("报告 空格.html"))["value"]["version"],
            1
        );
        let command = json!({"operationId":"other","scope":{"userId":"u","accountId":"a","taskId":"t","attempt":1,"fenceToken":"f"},
            "action":{"kind":"command_run","argv":["cmd.exe"],"cwd":".","runtimeId":"bundled-node","timeoutMs":1000}}).to_string();
        assert_eq!(call(&name, &command)["code"], "INVALID_REQUEST");
        drop(running);
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    #[ignore = "requires a real Windows runner, installed Node, and CREATOROS_T1007_WINDOWS_COMMAND_PROBE=1"]
    fn real_windows_candidate_pipe_command_roundtrip() {
        assert_eq!(
            std::env::var("CREATOROS_T1007_WINDOWS_COMMAND_PROBE").as_deref(),
            Ok("1")
        );
        let runtime_root = PathBuf::from(
            std::env::var_os("CREATOROS_TEST_PACKAGED_RUNTIME_ROOT")
                .expect("set installed sidecar runtime root"),
        );
        let runtimes = RuntimeRegistry::from_sidecar(&runtime_root).unwrap();
        let root = std::env::temp_dir().join(format!(
            "creatoros-win-command-pipe-{}",
            rand::random::<u64>()
        ));
        let pending = PendingBridge::bind().unwrap();
        let name = pending.pipe_name().to_string();
        let running = pending
            .start_test_commands(std::process::id(), root.clone(), runtimes)
            .unwrap();
        let script = "const fs=require('node:fs');fs.writeFileSync('结果.txt','ok');process.stdout.write('hello');";
        let write = json!({"operationId":"write-script","scope":{"userId":"u","accountId":"a","taskId":"t","attempt":1,"fenceToken":"f"},
            "action":{"kind":"write","path":"probe.js","contentBase64":base64::engine::general_purpose::STANDARD.encode(script),"expectedVersion":0}}).to_string();
        assert_eq!(call(&name, &write)["value"]["version"], 1);
        let run = json!({"operationId":"command-op","scope":{"userId":"u","accountId":"a","taskId":"t","attempt":1,"fenceToken":"f"},
            "action":{"kind":"command_run","argv":["probe.js"],"cwd":".","runtimeId":"bundled-node","timeoutMs":10000}}).to_string();
        let first = call(&name, &run);
        assert_eq!(first["value"]["state"], "running", "{first}");
        assert_eq!(call(&name, &run)["code"], "COMMAND_ALREADY_RUNNING");
        let stale = json!({"operationId":"stale","scope":{"userId":"u","accountId":"a","taskId":"t","attempt":1,"fenceToken":"old"},
            "action":{"kind":"command_status","targetOperationId":"command-op"}}).to_string();
        assert_eq!(call(&name, &stale)["code"], "WRONG_SCOPE");
        let other = json!({"operationId":"other","scope":{"userId":"u","accountId":"a","taskId":"another","attempt":1,"fenceToken":"f"},
            "action":{"kind":"command_cancel","targetOperationId":"command-op"}}).to_string();
        assert_eq!(call(&name, &other)["code"], "WRONG_SCOPE");
        let status = json!({"operationId":"status","scope":{"userId":"u","accountId":"a","taskId":"t","attempt":1,"fenceToken":"f"},
            "action":{"kind":"command_status","targetOperationId":"command-op"}}).to_string();
        let mut reply = call(&name, &status);
        for _ in 0..100 {
            if reply["value"]["state"] != "running" {
                break;
            }
            std::thread::sleep(Duration::from_millis(50));
            reply = call(&name, &status);
        }
        assert_eq!(reply["value"]["state"], "succeeded", "{reply}");
        let read = json!({"operationId":"read-output","scope":{"userId":"u","accountId":"a","taskId":"t","attempt":1,"fenceToken":"f"},
            "action":{"kind":"command_read","targetOperationId":"command-op","stream":"stdout","offset":0,"limit":100}}).to_string();
        let output = call(&name, &read);
        assert_eq!(output["value"]["contentBase64"], "aGVsbG8=");
        let result = json!({"operationId":"read-result","scope":{"userId":"u","accountId":"a","taskId":"t","attempt":1,"fenceToken":"f"},
            "action":{"kind":"read","path":"结果.txt","offset":0,"limit":100}}).to_string();
        assert_eq!(call(&name, &result)["value"]["contentBase64"], "b2s=");
        drop(running);
        std::fs::remove_dir_all(root).unwrap();
    }
}
