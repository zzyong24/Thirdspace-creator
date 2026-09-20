//! macOS-only private sidecar transport. No Tauri command or HTTP route is registered.
//! The kernel's LOCAL_PEERPID is compared with the child handle created by lib.rs.
//! The Node caller must keep the backend admission transaction open until the reply.
#![cfg(target_os = "macos")]

use super::files::{FileError, TaskFiles};
use base64::Engine as _;
use rand::RngCore as _;
use serde::Deserialize;
use serde_json::{json, Value};
use std::fs::{self, DirBuilder};
use std::io::{self, BufRead, BufReader, Read, Write};
use std::os::fd::AsRawFd;
use std::os::unix::fs::{DirBuilderExt, PermissionsExt};
use std::os::unix::net::{UnixListener, UnixStream};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;
use std::time::Duration;

const MAX_REQUEST: u64 = 1_400_000;

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
    action: FileAction,
}

#[derive(Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
enum FileAction {
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
        content_base64: String,
        expected_version: u64,
    },
}

fn valid_id(id: &str) -> bool {
    !id.is_empty() && id.len() <= 160 && !id.chars().any(char::is_control)
}

fn file_error(error: FileError) -> Value {
    match error {
        FileError::InvalidPath => json!({"ok": false, "code": "INVALID_PATH"}),
        FileError::Conflict { current_version } => {
            json!({"ok": false, "code": "VERSION_CONFLICT", "currentVersion": current_version})
        }
        FileError::TooLarge => json!({"ok": false, "code": "TOO_LARGE"}),
        FileError::UnsupportedPlatform => json!({"ok": false, "code": "UNSUPPORTED_PLATFORM"}),
        FileError::Io(_) => json!({"ok": false, "code": "FILE_IO_ERROR"}),
    }
}

fn execute(base: &Path, request: Request) -> Value {
    let Scope {
        user_id,
        account_id,
        task_id,
        attempt,
        fence_token,
    } = request.scope;
    // The scope is supplied only by the authenticated sidecar. That sidecar must
    // derive it under withLease(admission), never from a model invocation or page.
    if !valid_id(&request.operation_id)
        || !valid_id(&user_id)
        || !valid_id(&account_id)
        || !valid_id(&task_id)
        || attempt == 0
        || !valid_id(&fence_token)
    {
        return json!({"ok": false, "code": "INVALID_CONTEXT"});
    }
    let files = match TaskFiles::new(base, &user_id, &account_id, &task_id) {
        Ok(files) => files,
        Err(error) => return file_error(error),
    };
    let result: Result<Value, FileError> = match request.action {
        FileAction::List { path } => files
            .list(path.as_deref())
            .map(|entries| json!({"entries": entries})),
        FileAction::Read {
            path,
            offset,
            limit,
        } => files
            .read_page(&path, offset, limit)
            .map(|page| match page {
                Some((content, total, version)) => json!({
                    "contentBase64": base64::engine::general_purpose::STANDARD.encode(content),
                    "total": total,
                    "version": version,
                }),
                None => Value::Null,
            }),
        FileAction::Stat { path } => files.stat(&path).map(|stat| match stat {
            Some((is_dir, size, version)) => {
                json!({"isDirectory": is_dir, "size": size, "version": version})
            }
            None => Value::Null,
        }),
        FileAction::Write {
            path,
            content_base64,
            expected_version,
        } => match base64::engine::general_purpose::STANDARD.decode(content_base64) {
            Ok(bytes) if bytes.len() <= 1_000_000 => files
                .write(&path, &bytes, expected_version)
                .map(|version| json!({"version": version})),
            Ok(_) => Err(FileError::TooLarge),
            Err(_) => Err(FileError::InvalidPath),
        },
    };
    match result {
        Ok(value) => json!({"ok": true, "operationId": request.operation_id, "value": value}),
        Err(error) => file_error(error),
    }
}

fn peer_is_sidecar(stream: &UnixStream, expected_pid: u32) -> io::Result<bool> {
    let fd = stream.as_raw_fd();
    let mut uid: libc::uid_t = 0;
    let mut gid: libc::gid_t = 0;
    if unsafe { libc::getpeereid(fd, &mut uid, &mut gid) } != 0 {
        return Err(io::Error::last_os_error());
    }
    let mut pid: libc::pid_t = 0;
    let mut len = std::mem::size_of_val(&pid) as libc::socklen_t;
    if unsafe {
        libc::getsockopt(
            fd,
            libc::SOL_LOCAL,
            libc::LOCAL_PEERPID,
            (&mut pid as *mut libc::pid_t).cast(),
            &mut len,
        )
    } != 0
    {
        return Err(io::Error::last_os_error());
    }
    Ok(len as usize == std::mem::size_of_val(&pid)
        && uid == unsafe { libc::geteuid() }
        && pid > 0
        && pid as u32 == expected_pid)
}

fn serve_one(mut stream: UnixStream, expected_pid: u32, base: &Path) -> io::Result<()> {
    stream.set_read_timeout(Some(Duration::from_secs(10)))?;
    stream.set_write_timeout(Some(Duration::from_secs(10)))?;
    if !peer_is_sidecar(&stream, expected_pid)? {
        stream.write_all(b"{\"ok\":false,\"code\":\"UNAUTHORIZED_PEER\"}\n")?;
        return Ok(());
    }
    let mut body = Vec::new();
    BufReader::new((&stream).take(MAX_REQUEST + 1)).read_until(b'\n', &mut body)?;
    let reply = if body.len() as u64 > MAX_REQUEST || body.last() != Some(&b'\n') {
        json!({"ok": false, "code": "INVALID_REQUEST"})
    } else {
        match serde_json::from_slice::<Request>(&body) {
            Ok(request) => execute(base, request),
            Err(_) => json!({"ok": false, "code": "INVALID_REQUEST"}),
        }
    };
    serde_json::to_writer(&mut stream, &reply)?;
    stream.write_all(b"\n")?;
    Ok(())
}

pub struct PendingBridge {
    directory: Option<PathBuf>,
    listener: Option<UnixListener>,
}

impl PendingBridge {
    pub fn bind() -> io::Result<Self> {
        let mut entropy = [0u8; 16];
        rand::rngs::OsRng.fill_bytes(&mut entropy);
        let name = format!(
            "cw-{}",
            entropy
                .iter()
                .map(|b| format!("{b:02x}"))
                .collect::<String>()
        );
        let directory = std::env::temp_dir().join(name);
        DirBuilder::new().mode(0o700).create(&directory)?;
        let socket = directory.join("workbench.sock");
        if socket.as_os_str().len() >= 104 {
            let _ = fs::remove_dir(&directory);
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "workbench socket path too long",
            ));
        }
        let listener = match UnixListener::bind(&socket) {
            Ok(listener) => listener,
            Err(error) => {
                let _ = fs::remove_dir(&directory);
                return Err(error);
            }
        };
        let pending = Self {
            directory: Some(directory),
            listener: Some(listener),
        };
        fs::set_permissions(&socket, fs::Permissions::from_mode(0o600))?;
        pending.listener.as_ref().unwrap().set_nonblocking(true)?;
        Ok(pending)
    }

    pub fn socket_path(&self) -> PathBuf {
        self.directory.as_ref().unwrap().join("workbench.sock")
    }

    pub fn start(mut self, expected_pid: u32, base: PathBuf) -> RunningBridge {
        let stop = Arc::new(AtomicBool::new(false));
        let stop_thread = stop.clone();
        let directory = self.directory.take().unwrap();
        let listener = self.listener.take().unwrap();
        let thread = std::thread::spawn(move || {
            while !stop_thread.load(Ordering::Acquire) {
                match listener.accept() {
                    Ok((stream, _)) => {
                        let _ = serve_one(stream, expected_pid, &base);
                    }
                    Err(error) if error.kind() == io::ErrorKind::WouldBlock => {
                        std::thread::sleep(Duration::from_millis(20));
                    }
                    Err(_) => break,
                }
            }
        });
        RunningBridge {
            stop,
            thread: Some(thread),
            directory,
        }
    }
}

impl Drop for PendingBridge {
    fn drop(&mut self) {
        if let Some(directory) = &self.directory {
            let _ = fs::remove_file(directory.join("workbench.sock"));
            let _ = fs::remove_dir(directory);
        }
    }
}

pub struct RunningBridge {
    stop: Arc<AtomicBool>,
    thread: Option<JoinHandle<()>>,
    directory: PathBuf,
}

impl Drop for RunningBridge {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::Release);
        if let Some(thread) = self.thread.take() {
            let _ = thread.join();
        }
        let _ = fs::remove_file(self.directory.join("workbench.sock"));
        let _ = fs::remove_dir(&self.directory);
    }
}

#[derive(Default)]
pub struct BridgeState(pub Mutex<Option<RunningBridge>>);

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn request(action: Value) -> Value {
        json!({"operationId":"op-1","scope":{"userId":"u","accountId":"a","taskId":"t","attempt":1,"fenceToken":"f"},"action":action})
    }
    fn call(path: &Path, value: Value) -> Value {
        let mut stream = UnixStream::connect(path).unwrap();
        stream.write_all(format!("{}\n", value).as_bytes()).unwrap();
        let mut line = String::new();
        BufReader::new(stream).read_line(&mut line).unwrap();
        serde_json::from_str(&line).unwrap()
    }
    fn temp_base() -> PathBuf {
        let path = std::env::temp_dir().join(format!("cw-test-{}", rand::random::<u64>()));
        fs::create_dir(&path).unwrap();
        path
    }

    #[test]
    fn authenticated_peer_can_write_read_and_cannot_escape_task() {
        let bridge = PendingBridge::bind().unwrap();
        let socket = bridge.socket_path();
        assert_eq!(
            fs::metadata(&socket).unwrap().permissions().mode() & 0o777,
            0o600
        );
        assert_eq!(
            fs::metadata(socket.parent().unwrap())
                .unwrap()
                .permissions()
                .mode()
                & 0o777,
            0o700
        );
        let base = temp_base();
        let _running = bridge.start(std::process::id(), base.clone());
        let write = call(
            &socket,
            request(
                json!({"kind":"write","path":"draft/report.html","content_base64":"aGVsbG8=","expected_version":0}),
            ),
        );
        assert_eq!(write["value"]["version"], 1);
        let read = call(
            &socket,
            request(json!({"kind":"read","path":"draft/report.html","offset":0,"limit":100})),
        );
        assert_eq!(read["value"]["contentBase64"], "aGVsbG8=");
        let conflict = call(
            &socket,
            request(
                json!({"kind":"write","path":"draft/report.html","content_base64":"Yg==","expected_version":0}),
            ),
        );
        assert_eq!(conflict["code"], "VERSION_CONFLICT");
        let escape = call(
            &socket,
            request(
                json!({"kind":"write","path":"../outside","content_base64":"Yg==","expected_version":0}),
            ),
        );
        assert_eq!(escape["code"], "INVALID_PATH");
        let command = call(&socket, request(json!({"kind":"run","argv":["/bin/sh"]})));
        assert_eq!(command["code"], "INVALID_REQUEST");
        assert!(!base.join("outside").exists());
        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn unauthorized_child_probe() {
        let Ok(path) = std::env::var("CREATOROS_IPC_TEST_SOCKET") else {
            return;
        };
        let mut stream = UnixStream::connect(path).unwrap();
        stream
            .write_all(format!("{}\n", request(json!({"kind":"list"}))).as_bytes())
            .unwrap();
        let mut line = String::new();
        BufReader::new(stream).read_line(&mut line).unwrap();
        assert_eq!(
            serde_json::from_str::<Value>(&line).unwrap()["code"],
            "UNAUTHORIZED_PEER"
        );
    }

    #[test]
    fn authorized_child_probe() {
        let Ok(path) = std::env::var("CREATOROS_IPC_TEST_AUTHORIZED_SOCKET") else {
            return;
        };
        let reply = call(Path::new(&path), request(json!({"kind":"list"})));
        assert_eq!(reply["ok"], true);
    }

    #[test]
    fn exact_spawned_child_can_connect() {
        let bridge = PendingBridge::bind().unwrap();
        let socket = bridge.socket_path();
        let base = temp_base();
        let mut child = std::process::Command::new(std::env::current_exe().unwrap())
            .args(["--exact", "ipc::tests::authorized_child_probe"])
            .env("CREATOROS_IPC_TEST_AUTHORIZED_SOCKET", &socket)
            .spawn()
            .unwrap();
        let _running = bridge.start(child.id(), base.clone());
        assert!(child.wait().unwrap().success());
        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn different_real_process_is_rejected_even_with_socket_path() {
        let bridge = PendingBridge::bind().unwrap();
        let socket = bridge.socket_path();
        let base = temp_base();
        let _running = bridge.start(std::process::id(), base.clone());
        let status = std::process::Command::new(std::env::current_exe().unwrap())
            .args(["--exact", "ipc::tests::unauthorized_child_probe"])
            .env("CREATOROS_IPC_TEST_SOCKET", &socket)
            .status()
            .unwrap();
        assert!(status.success());
        fs::remove_dir_all(base).unwrap();
    }
}
