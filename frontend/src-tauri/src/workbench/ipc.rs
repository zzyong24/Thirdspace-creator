//! macOS-only private sidecar transport. No Tauri command or HTTP route is registered.
//! The kernel's LOCAL_PEERPID is compared with the child handle created by lib.rs.
//! The Node caller must keep the backend admission transaction open until the reply.
#![cfg(target_os = "macos")]

use super::command::{CommandError, CommandHost, CommandRequest, RuntimeRegistry};
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
        expected_version: u64,
    },
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
    CommandStatus {
        #[serde(rename = "targetOperationId")]
        target_operation_id: String,
    },
    CommandCancel {
        #[serde(rename = "targetOperationId")]
        target_operation_id: String,
    },
    CommandRead {
        #[serde(rename = "targetOperationId")]
        target_operation_id: String,
        stream: String,
        offset: u64,
        limit: usize,
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

fn command_error(error: CommandError) -> Value {
    let code = match error {
        CommandError::InvalidInput => "INVALID_COMMAND",
        CommandError::Unavailable(_) => "COMMAND_UNAVAILABLE",
        CommandError::Io(_) => "COMMAND_IO_ERROR",
        CommandError::WrongScope => "WRONG_SCOPE",
        CommandError::AlreadyRunning => "ALREADY_RUNNING",
    };
    json!({"ok": false, "code": code})
}

fn execute(base: &Path, commands: &CommandHost, request: Request) -> Value {
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
    let scope = files.scope_key();
    let result: Result<Value, Value> = match request.action {
        Action::List { path } => files
            .list(path.as_deref())
            .map(|entries| json!({"entries": entries}))
            .map_err(file_error),
        Action::Read {
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
            })
            .map_err(file_error),
        Action::Stat { path } => files
            .stat(&path)
            .map(|stat| match stat {
                Some((is_dir, size, version)) => {
                    json!({"isDirectory": is_dir, "size": size, "version": version})
                }
                None => Value::Null,
            })
            .map_err(file_error),
        Action::Write {
            path,
            content_base64,
            expected_version,
        } => match base64::engine::general_purpose::STANDARD.decode(content_base64) {
            Ok(bytes) if bytes.len() <= 1_000_000 => files
                .write(&path, &bytes, expected_version)
                .map(|version| json!({"version": version})),
            Ok(_) => Err(FileError::TooLarge),
            Err(_) => Err(FileError::InvalidPath),
        }
        .map_err(file_error),
        Action::CommandRun {
            argv,
            cwd,
            runtime_id,
            timeout_ms,
            stdin_ref,
        } => commands
            .run(
                &files,
                &scope,
                &request.operation_id,
                CommandRequest {
                    argv,
                    cwd,
                    runtime_id,
                    timeout_ms,
                    stdin_ref,
                },
            )
            .map(|receipt| receipt_value(receipt))
            .map_err(command_error),
        Action::CommandStatus {
            target_operation_id,
        } => {
            if !valid_id(&target_operation_id) {
                Err(command_error(CommandError::InvalidInput))
            } else {
                commands
                    .status(&scope, &target_operation_id)
                    .map(receipt_value)
                    .map_err(command_error)
            }
        }
        Action::CommandCancel {
            target_operation_id,
        } => {
            if !valid_id(&target_operation_id) {
                Err(command_error(CommandError::InvalidInput))
            } else {
                commands
                    .cancel(&scope, &target_operation_id)
                    .map(receipt_value)
                    .map_err(command_error)
            }
        }
        Action::CommandRead {
            target_operation_id,
            stream,
            offset,
            limit,
        } => {
            if !valid_id(&target_operation_id) || limit > 512_000 {
                Err(command_error(CommandError::InvalidInput))
            } else {
                commands.read_output(&scope, &target_operation_id, &stream, offset, limit)
                .map(|(bytes, more)| json!({"contentBase64": base64::engine::general_purpose::STANDARD.encode(&bytes), "more": more, "nextOffset": offset + bytes.len() as u64}))
                .map_err(command_error)
            }
        }
    };
    match result {
        Ok(value) => json!({"ok": true, "operationId": request.operation_id, "value": value}),
        Err(error) => error,
    }
}

fn receipt_value(receipt: super::command::CommandReceipt) -> Value {
    json!({"operationId":receipt.operation_id,"state":receipt.state,"exitCode":receipt.exit_code,
        "stdoutRef":receipt.stdout_ref,"stderrRef":receipt.stderr_ref,
        "stdoutPreview":receipt.stdout_preview,"stderrPreview":receipt.stderr_preview,"truncated":receipt.truncated})
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

fn serve_one(
    mut stream: UnixStream,
    expected_pid: u32,
    base: &Path,
    commands: &CommandHost,
) -> io::Result<()> {
    // macOS may inherit O_NONBLOCK from the listener. Each accepted request
    // uses read/write deadlines instead, so a client still writing cannot
    // turn an early EAGAIN into an empty or broken IPC reply.
    stream.set_nonblocking(false)?;
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
            Ok(request) => execute(base, commands, request),
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

    pub fn start(
        mut self,
        expected_pid: u32,
        base: PathBuf,
        runtimes: RuntimeRegistry,
    ) -> RunningBridge {
        let stop = Arc::new(AtomicBool::new(false));
        let stop_thread = stop.clone();
        let directory = self.directory.take().unwrap();
        let listener = self.listener.take().unwrap();
        let commands = Arc::new(CommandHost::new(runtimes));
        let thread_commands = commands.clone();
        let thread = std::thread::spawn(move || {
            let mut idle_polls = 0u8;
            while !stop_thread.load(Ordering::Acquire) {
                match listener.accept() {
                    Ok((stream, _)) => {
                        idle_polls = 0;
                        let _ = serve_one(stream, expected_pid, &base, &thread_commands);
                    }
                    Err(error) if error.kind() == io::ErrorKind::WouldBlock => {
                        std::thread::sleep(Duration::from_millis(20));
                        idle_polls = idle_polls.wrapping_add(1);
                        if idle_polls >= 10 {
                            thread_commands.reap();
                            idle_polls = 0;
                        }
                    }
                    Err(_) => break,
                }
            }
        });
        RunningBridge {
            stop,
            thread: Some(thread),
            directory,
            _commands: commands,
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
    _commands: Arc<CommandHost>,
}

impl Drop for RunningBridge {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::Release);
        if let Some(thread) = self.thread.take() {
            let _ = thread.join();
        }
        // Dropping _commands after this method terminates any remaining groups.
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
    #[test]
    fn accepted_socket_waits_for_the_authorized_child_to_finish_writing() {
        let bridge = PendingBridge::bind().unwrap();
        let socket = bridge.socket_path();
        let base = temp_base();
        let running = bridge.start(std::process::id(), base.clone(), test_runtimes(&base));
        let mut stream = UnixStream::connect(&socket).unwrap();
        // Let the nonblocking listener accept before the client sends bytes.
        std::thread::sleep(Duration::from_millis(100));
        stream
            .write_all(format!("{}\n", request(json!({"kind":"list"}))).as_bytes())
            .unwrap();
        let mut line = String::new();
        BufReader::new(stream).read_line(&mut line).unwrap();
        let reply: Value = serde_json::from_str(&line).unwrap();
        assert_eq!(reply["ok"], true, "{reply}");
        drop(running);
        fs::remove_dir_all(base).unwrap();
    }
    fn temp_base() -> PathBuf {
        let path = std::env::temp_dir().join(format!("cw-test-{}", rand::random::<u64>()));
        fs::create_dir(&path).unwrap();
        path
    }
    fn test_runtimes(base: &Path) -> RuntimeRegistry {
        RuntimeRegistry::from_sidecar(base).unwrap()
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
        let _running = bridge.start(std::process::id(), base.clone(), test_runtimes(&base));
        let write = call(
            &socket,
            request(
                json!({"kind":"write","path":"draft/report.html","contentBase64":"aGVsbG8=","expectedVersion":0}),
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
                json!({"kind":"write","path":"draft/report.html","contentBase64":"Yg==","expectedVersion":0}),
            ),
        );
        assert_eq!(conflict["code"], "VERSION_CONFLICT");
        let escape = call(
            &socket,
            request(
                json!({"kind":"write","path":"../outside","contentBase64":"Yg==","expectedVersion":0}),
            ),
        );
        assert_eq!(escape["code"], "INVALID_PATH");
        let command = call(&socket, request(json!({"kind":"run","argv":["/bin/sh"]})));
        assert_eq!(command["code"], "INVALID_REQUEST");
        let missing_python = call(
            &socket,
            request(
                json!({"kind":"command_run","argv":["-V"],"cwd":".","runtimeId":"bundled-python","timeoutMs":1000}),
            ),
        );
        assert_eq!(missing_python["code"], "COMMAND_UNAVAILABLE");
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
        let _running = bridge.start(child.id(), base.clone(), test_runtimes(&base));
        assert!(child.wait().unwrap().success());
        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn different_real_process_is_rejected_even_with_socket_path() {
        let bridge = PendingBridge::bind().unwrap();
        let socket = bridge.socket_path();
        let base = temp_base();
        let _running = bridge.start(std::process::id(), base.clone(), test_runtimes(&base));
        let status = std::process::Command::new(std::env::current_exe().unwrap())
            .args(["--exact", "ipc::tests::unauthorized_child_probe"])
            .env("CREATOROS_IPC_TEST_SOCKET", &socket)
            .status()
            .unwrap();
        assert!(status.success());
        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn private_socket_runs_reads_and_cancels_mac_process_for_same_task_only() {
        let bridge = PendingBridge::bind().unwrap();
        let socket = bridge.socket_path();
        let base = temp_base();
        // Unit fixture uses system binaries to test IPC/sandbox mechanics;
        // production RuntimeRegistry::from_sidecar never selects these paths.
        let running = bridge.start(
            std::process::id(),
            base.clone(),
            RuntimeRegistry {
                bundled_node: PathBuf::from("/usr/bin/true"),
                bundled_python: PathBuf::from("/bin/echo"),
                approved_program: PathBuf::from("/bin/sleep"),
                read_roots: vec![],
            },
        );
        let run = call(
            &socket,
            request(
                json!({"kind":"command_run","argv":["hello"],"cwd":".","runtimeId":"bundled-python","timeoutMs":10000}),
            ),
        );
        assert_eq!(run["ok"], true, "{run}");
        assert_eq!(run["value"]["operationId"], "op-1");
        let mut status = Value::Null;
        for _ in 0..100 {
            status = call(
                &socket,
                json!({"operationId":"status-1","scope":{"userId":"u","accountId":"a","taskId":"t","attempt":1,"fenceToken":"f"},
                "action":{"kind":"command_status","targetOperationId":"op-1"}}),
            );
            if status["value"]["state"] != "running" {
                break;
            }
            std::thread::sleep(Duration::from_millis(20));
        }
        assert_eq!(status["value"]["state"], "succeeded", "{status}");
        let output = call(
            &socket,
            request(
                json!({"kind":"command_read","targetOperationId":"op-1","stream":"stdout","offset":0,"limit":100}),
            ),
        );
        assert_eq!(output["value"]["contentBase64"], "aGVsbG8K");
        let wrong = call(
            &socket,
            json!({"operationId":"foreign","scope":{"userId":"u","accountId":"a2","taskId":"t","attempt":1,"fenceToken":"f"},
            "action":{"kind":"command_cancel","targetOperationId":"op-1"}}),
        );
        assert_eq!(wrong["code"], "INVALID_COMMAND");
        let other_account = call(
            &socket,
            json!({"operationId":"op-1","scope":{"userId":"u","accountId":"a2","taskId":"t","attempt":1,"fenceToken":"f"},
            "action":{"kind":"command_run","argv":["other"],"cwd":".","runtimeId":"bundled-python","timeoutMs":10000}}),
        );
        assert_eq!(
            other_account["ok"], true,
            "same operation ID must not collide across accounts: {other_account}"
        );
        let run_sleep = call(
            &socket,
            json!({"operationId":"sleep-op","scope":{"userId":"u","accountId":"a","taskId":"t","attempt":1,"fenceToken":"f"},
            "action":{"kind":"command_run","argv":["10"],"cwd":".","runtimeId":"approved-program","timeoutMs":20000}}),
        );
        assert_eq!(run_sleep["ok"], true, "{run_sleep}");
        let cancel = call(
            &socket,
            request(json!({"kind":"command_cancel","targetOperationId":"sleep-op"})),
        );
        assert_eq!(cancel["value"]["state"], "cancelled", "{cancel}");
        drop(running);
        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    #[ignore = "requires CREATOROS_TEST_PACKAGED_RUNTIME_ROOT from a locally inspected Mac runtime"]
    fn private_socket_runs_a_real_packaged_node_task_script() {
        let runtime_root = PathBuf::from(
            std::env::var("CREATOROS_TEST_PACKAGED_RUNTIME_ROOT")
                .expect("set CREATOROS_TEST_PACKAGED_RUNTIME_ROOT"),
        );
        let bridge = PendingBridge::bind().unwrap();
        let socket = bridge.socket_path();
        let base = temp_base();
        let _running = bridge.start(
            std::process::id(),
            base.clone(),
            RuntimeRegistry::from_sidecar(&runtime_root).unwrap(),
        );
        let script =
            "process.stdout.write('private-node:' + require('node:tls').rootCertificates.length)";
        let write = call(
            &socket,
            request(json!({"kind":"write","path":"probe.js",
            "contentBase64":base64::engine::general_purpose::STANDARD.encode(script),"expectedVersion":0})),
        );
        assert_eq!(write["ok"], true, "{write}");
        let run = call(
            &socket,
            request(json!({"kind":"command_run","argv":["probe.js"],
            "cwd":".","runtimeId":"bundled-node","timeoutMs":10000})),
        );
        assert_eq!(run["ok"], true, "{run}");
        let mut status = Value::Null;
        for _ in 0..100 {
            status = call(
                &socket,
                json!({"operationId":"status-node","scope":{"userId":"u",
                "accountId":"a","taskId":"t","attempt":1,"fenceToken":"f"},
                "action":{"kind":"command_status","targetOperationId":"op-1"}}),
            );
            if status["value"]["state"] != "running" {
                break;
            }
            std::thread::sleep(Duration::from_millis(20));
        }
        assert_eq!(status["value"]["state"], "succeeded", "{status}");
        let output = call(
            &socket,
            request(json!({"kind":"command_read","targetOperationId":"op-1",
            "stream":"stdout","offset":0,"limit":100})),
        );
        assert_eq!(output["ok"], true, "{output}");
        let bytes = base64::engine::general_purpose::STANDARD
            .decode(output["value"]["contentBase64"].as_str().unwrap())
            .unwrap();
        let text = String::from_utf8(bytes).unwrap();
        let count = text
            .strip_prefix("private-node:")
            .unwrap()
            .parse::<usize>()
            .unwrap();
        assert!(count > 0, "bundled Node lost its built-in CA certificates");
        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    #[ignore = "external Node/database file host fixture; requires the installed Mac runtime"]
    fn external_node_files_host_fixture() {
        let expected_pid: u32 = std::env::var("CREATOROS_FILES_E2E_NODE_PID")
            .expect("set CREATOROS_FILES_E2E_NODE_PID")
            .parse()
            .unwrap();
        let ready = PathBuf::from(
            std::env::var("CREATOROS_FILES_E2E_READY_FILE")
                .expect("set CREATOROS_FILES_E2E_READY_FILE"),
        );
        let done = PathBuf::from(
            std::env::var("CREATOROS_FILES_E2E_DONE_FILE")
                .expect("set CREATOROS_FILES_E2E_DONE_FILE"),
        );
        let base = PathBuf::from(
            std::env::var("CREATOROS_FILES_E2E_TASK_ROOT")
                .expect("set CREATOROS_FILES_E2E_TASK_ROOT"),
        );
        let runtime_root = PathBuf::from(
            std::env::var("CREATOROS_TEST_PACKAGED_RUNTIME_ROOT")
                .expect("set CREATOROS_TEST_PACKAGED_RUNTIME_ROOT"),
        );
        let bridge = PendingBridge::bind().unwrap();
        let socket = bridge.socket_path();
        let running = bridge.start(
            expected_pid,
            base.clone(),
            RuntimeRegistry::from_sidecar(&runtime_root).unwrap(),
        );
        fs::write(&ready, socket.to_string_lossy().as_bytes()).unwrap();
        let deadline = std::time::Instant::now() + Duration::from_secs(120);
        while !done.exists() && std::time::Instant::now() < deadline {
            std::thread::sleep(Duration::from_millis(100));
        }
        assert!(
            done.exists(),
            "Node file host integration did not release the fixture"
        );
        let evidence: Value = serde_json::from_slice(&fs::read(&done).unwrap()).unwrap();
        assert_ne!(
            evidence["abort"], true,
            "Node file host integration aborted"
        );
        let files = TaskFiles::new(
            &base,
            evidence["userId"].as_str().unwrap(),
            evidence["accountId"].as_str().unwrap(),
            evidence["taskId"].as_str().unwrap(),
        )
        .unwrap();
        let (actual, version) = files.read("交付/报告.html").unwrap().unwrap();
        assert_eq!(version, 1);
        assert_eq!(
            String::from_utf8(actual).unwrap(),
            evidence["html"].as_str().unwrap()
        );
        drop(running);
        fs::remove_dir_all(base).unwrap();
    }
}
