//! Separate browser socket: never shares the file/command bridge or WebView commands.
#![cfg(target_os = "macos")]

use super::browser::{BrowserHost, BrowserLocationAction, BrowserSocketRequest};
use rand::RngCore as _;
use serde_json::{json, Value};
use std::fs::{self, DirBuilder};
use std::io::{self, BufRead, BufReader, Read, Write};
use std::os::fd::AsRawFd;
use std::os::unix::fs::{DirBuilderExt, PermissionsExt};
use std::os::unix::net::{UnixListener, UnixStream};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;
use std::time::Duration;

const MAX_REQUEST_BYTES: u64 = 1_400_000;
const MAX_RESPONSE_BYTES: usize = 4_000_000;
const MAX_CONNECTIONS: usize = 16;

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

fn bounded_response(reply: &Value) -> io::Result<Vec<u8>> {
    let encoded = serde_json::to_vec(reply)?;
    if encoded.len() <= MAX_RESPONSE_BYTES {
        return Ok(encoded);
    }
    Ok(serde_json::to_vec(&json!({
        "ok": false,
        "operationId": reply.get("operationId"),
        "code": "RESULT_TOO_LARGE",
    }))?)
}

fn serve_one(
    mut stream: UnixStream,
    expected_pid: u32,
    host: &BrowserHost,
    runtime: &tokio::runtime::Runtime,
) -> io::Result<()> {
    stream.set_read_timeout(Some(Duration::from_secs(10)))?;
    stream.set_write_timeout(Some(Duration::from_secs(120)))?;
    if !peer_is_sidecar(&stream, expected_pid)? {
        stream.write_all(b"{\"ok\":false,\"code\":\"UNAUTHORIZED_PEER\"}\n")?;
        return Ok(());
    }
    let mut body = Vec::new();
    BufReader::new((&stream).take(MAX_REQUEST_BYTES + 1)).read_until(b'\n', &mut body)?;
    let reply: Value = if body.len() as u64 > MAX_REQUEST_BYTES || body.last() != Some(&b'\n') {
        json!({"ok": false, "code": "INVALID_REQUEST"})
    } else {
        match serde_json::from_slice::<BrowserSocketRequest>(&body) {
            Ok(request) => {
                let (operation_id, outcome) = match request {
                    BrowserSocketRequest::Location(location) => {
                        let outcome = if !super::browser::valid_id(&location.operation_id) {
                            Err(super::browser::BrowserHostError {
                                code: "INVALID_ADMISSION",
                            })
                        } else {
                            match location.action {
                                BrowserLocationAction::ProfileLocation {
                                    user_id,
                                    account_id,
                                    task_id,
                                    identity_mode,
                                } => host.profile_location(
                                    &user_id,
                                    &account_id,
                                    &task_id,
                                    identity_mode,
                                ),
                            }
                        };
                        (location.operation_id, outcome)
                    }
                    BrowserSocketRequest::Dispatch(dispatch) => {
                        let operation_id = dispatch.operation_id.clone();
                        (operation_id, runtime.block_on(host.dispatch(dispatch)))
                    }
                };
                match outcome {
                    Ok(value) => json!({"ok": true, "operationId": operation_id, "value": value}),
                    Err(error) => {
                        json!({"ok": false, "operationId": operation_id, "code": error.code})
                    }
                }
            }
            Err(_) => json!({"ok": false, "code": "INVALID_REQUEST"}),
        }
    };
    let encoded = bounded_response(&reply)?;
    stream.write_all(&encoded)?;
    stream.write_all(b"\n")?;
    Ok(())
}

pub struct PendingBrowserBridge {
    directory: Option<PathBuf>,
    listener: Option<UnixListener>,
}

impl PendingBrowserBridge {
    pub fn bind() -> io::Result<Self> {
        let mut entropy = [0u8; 8];
        rand::rngs::OsRng.fill_bytes(&mut entropy);
        // macOS sun_path is short; keep this path below its socket limit.
        let directory =
            std::env::temp_dir().join(format!("cb-{:016x}", u64::from_le_bytes(entropy)));
        DirBuilder::new().mode(0o700).create(&directory)?;
        let socket = directory.join("browser.sock");
        let listener = match UnixListener::bind(&socket) {
            Ok(listener) => listener,
            Err(error) => {
                let _ = fs::remove_dir(&directory);
                return Err(error);
            }
        };
        fs::set_permissions(&socket, fs::Permissions::from_mode(0o600))?;
        listener.set_nonblocking(true)?;
        Ok(Self {
            directory: Some(directory),
            listener: Some(listener),
        })
    }

    pub fn socket_path(&self) -> PathBuf {
        self.directory.as_ref().unwrap().join("browser.sock")
    }

    pub fn start(
        mut self,
        expected_pid: u32,
        app_data_root: PathBuf,
        bundled_chrome: PathBuf,
    ) -> RunningBrowserBridge {
        let directory = self.directory.take().unwrap();
        let listener = self.listener.take().unwrap();
        let stop = Arc::new(AtomicBool::new(false));
        let host = Arc::new(BrowserHost::new(app_data_root, bundled_chrome));
        let runtime = Arc::new(
            tokio::runtime::Builder::new_multi_thread()
                .enable_all()
                .build()
                .expect("browser runtime"),
        );
        let active = Arc::new(AtomicUsize::new(0));
        let workers = Arc::new(Mutex::new(Vec::<JoinHandle<()>>::new()));
        let thread = {
            let stop = stop.clone();
            let host = host.clone();
            let runtime = runtime.clone();
            let active = active.clone();
            let workers = workers.clone();
            std::thread::spawn(move || {
                while !stop.load(Ordering::Acquire) {
                    match listener.accept() {
                        Ok((mut stream, _)) => {
                            if active.fetch_add(1, Ordering::AcqRel) >= MAX_CONNECTIONS {
                                active.fetch_sub(1, Ordering::AcqRel);
                                let _ =
                                    stream.write_all(b"{\"ok\":false,\"code\":\"BROWSER_BUSY\"}\n");
                                continue;
                            }
                            let host = host.clone();
                            let runtime = runtime.clone();
                            let active = active.clone();
                            workers.lock().unwrap().push(std::thread::spawn(move || {
                                let _ = serve_one(stream, expected_pid, &host, &runtime);
                                active.fetch_sub(1, Ordering::AcqRel);
                            }));
                            workers
                                .lock()
                                .unwrap()
                                .retain(|worker| !worker.is_finished());
                        }
                        Err(error) if error.kind() == io::ErrorKind::WouldBlock => {
                            std::thread::sleep(Duration::from_millis(20))
                        }
                        Err(_) => break,
                    }
                }
            })
        };
        RunningBrowserBridge {
            stop,
            thread: Some(thread),
            directory,
            workers,
            host,
            runtime,
        }
    }
}

impl Drop for PendingBrowserBridge {
    fn drop(&mut self) {
        if let Some(directory) = &self.directory {
            let _ = fs::remove_file(directory.join("browser.sock"));
            let _ = fs::remove_dir(directory);
        }
    }
}

pub struct RunningBrowserBridge {
    stop: Arc<AtomicBool>,
    thread: Option<JoinHandle<()>>,
    directory: PathBuf,
    workers: Arc<Mutex<Vec<JoinHandle<()>>>>,
    host: Arc<BrowserHost>,
    runtime: Arc<tokio::runtime::Runtime>,
}

impl Drop for RunningBrowserBridge {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::Release);
        if let Some(thread) = self.thread.take() {
            let _ = thread.join();
        }
        for worker in std::mem::take(&mut *self.workers.lock().unwrap()) {
            let _ = worker.join();
        }
        self.runtime.block_on(self.host.shutdown());
        let _ = fs::remove_file(self.directory.join("browser.sock"));
        let _ = fs::remove_dir(&self.directory);
    }
}

#[derive(Default)]
pub struct BrowserBridgeState(pub Mutex<Option<RunningBrowserBridge>>);

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::BufRead;

    #[test]
    fn oversized_screenshot_result_becomes_bounded_error() {
        let reply = json!({"ok": true, "operationId": "shot-1", "value": {
            "result": {"output": {"base64": "a".repeat(MAX_RESPONSE_BYTES)}}
        }});
        let encoded = bounded_response(&reply).unwrap();
        assert!(encoded.len() < 256);
        let response: Value = serde_json::from_slice(&encoded).unwrap();
        assert_eq!(response["operationId"], "shot-1");
        assert_eq!(response["code"], "RESULT_TOO_LARGE");
    }

    fn call(socket: &std::path::Path, body: Value) -> Value {
        let mut stream = UnixStream::connect(socket).unwrap();
        stream.write_all(format!("{body}\n").as_bytes()).unwrap();
        let mut line = String::new();
        BufReader::new(stream).read_line(&mut line).unwrap();
        serde_json::from_str(&line).unwrap()
    }

    #[test]
    fn browser_socket_is_separate_and_rejects_unadmitted_requests() {
        let pending = PendingBrowserBridge::bind().unwrap();
        let socket = pending.socket_path();
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
        let running = pending.start(
            std::process::id(),
            std::env::temp_dir(),
            PathBuf::from("/missing/cft"),
        );
        let reply = call(
            &socket,
            json!({"operationId":"op","action":{"kind":"open"}}),
        );
        assert_eq!(reply["code"], "INVALID_REQUEST");
        drop(running);
    }

    #[test]
    fn pid_bound_location_resolves_the_physical_directory_before_backend_lease() {
        let pending = PendingBrowserBridge::bind().unwrap();
        let socket = pending.socket_path();
        let root =
            std::env::temp_dir().join(format!("creatoros-browser-ipc-{}", std::process::id()));
        let running = pending.start(
            std::process::id(),
            root.clone(),
            PathBuf::from("/missing/cft"),
        );
        let reply = call(
            &socket,
            json!({"operationId":"loc-one", "action":{
                "kind":"profile_location", "userId":"user-one", "accountId":"account-one",
                "taskId":"task-one", "identityMode":"anonymous"
            }}),
        );
        assert_eq!(reply["ok"], true);
        let path = PathBuf::from(reply["value"]["managedProfileRoot"].as_str().unwrap());
        assert!(path.is_dir());
        assert_eq!(reply["value"]["profileKey"].as_str().unwrap().len(), 64);
        drop(running);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn unauthorized_child_probe() {
        let Ok(path) = std::env::var("CREATOROS_BROWSER_IPC_TEST_SOCKET") else {
            return;
        };
        let reply = call(std::path::Path::new(&path), json!({"operationId":"op"}));
        assert_eq!(reply["code"], "UNAUTHORIZED_PEER");
    }

    #[test]
    fn different_process_cannot_call_browser_socket() {
        let pending = PendingBrowserBridge::bind().unwrap();
        let socket = pending.socket_path();
        let running = pending.start(
            std::process::id(),
            std::env::temp_dir(),
            PathBuf::from("/missing/cft"),
        );
        let status = std::process::Command::new(std::env::current_exe().unwrap())
            .args(["--exact", "browser_ipc::tests::unauthorized_child_probe"])
            .env("CREATOROS_BROWSER_IPC_TEST_SOCKET", &socket)
            .status()
            .unwrap();
        assert!(status.success());
        drop(running);
    }

    #[test]
    #[ignore = "external Node/DB integration fixture; requires fixed CfT and explicit environment"]
    fn external_node_host_fixture() {
        let expected_pid: u32 = std::env::var("CREATOROS_BROWSER_E2E_NODE_PID")
            .expect("set CREATOROS_BROWSER_E2E_NODE_PID")
            .parse()
            .unwrap();
        let ready = PathBuf::from(
            std::env::var("CREATOROS_BROWSER_E2E_READY_FILE")
                .expect("set CREATOROS_BROWSER_E2E_READY_FILE"),
        );
        let done = PathBuf::from(
            std::env::var("CREATOROS_BROWSER_E2E_DONE_FILE")
                .expect("set CREATOROS_BROWSER_E2E_DONE_FILE"),
        );
        let profile_root = PathBuf::from(
            std::env::var("CREATOROS_BROWSER_E2E_PROFILE_ROOT")
                .expect("set CREATOROS_BROWSER_E2E_PROFILE_ROOT"),
        );
        let bundled = PathBuf::from(
            std::env::var("CREATOROS_TEST_CFT_ROOT").expect("set CREATOROS_TEST_CFT_ROOT"),
        );
        assert!(BrowserHost::packaged_chrome_available(&bundled));
        let pending = PendingBrowserBridge::bind().unwrap();
        let socket = pending.socket_path();
        let running = pending.start(expected_pid, profile_root, bundled);
        fs::write(&ready, socket.to_string_lossy().as_bytes()).unwrap();
        let deadline = std::time::Instant::now() + Duration::from_secs(180);
        while !done.exists() && std::time::Instant::now() < deadline {
            std::thread::sleep(Duration::from_millis(100));
        }
        let completed = done.exists();
        drop(running);
        assert!(completed, "Node integration did not release the fixture");
    }
}
