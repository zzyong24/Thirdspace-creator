//! Separate browser socket: never shares the file/command bridge or WebView commands.
#![cfg(target_os = "macos")]

use super::browser::{BrowserHost, BrowserLocationAction, BrowserSocketRequest};
use rand::RngCore as _;
use serde_json::{json, Value};
use std::fs::{self, DirBuilder};
use std::io::{self, Read, Write};
#[cfg(test)]
use std::io::{BufRead, BufReader};
use std::os::fd::AsRawFd;
use std::os::unix::fs::{DirBuilderExt, PermissionsExt};
use std::os::unix::net::{UnixListener, UnixStream};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;
use std::time::{Duration, Instant};

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

// Positive framing and reply phases each freeze their deadline once. Polling
// only wakes owned cancellation; partial bytes never extend either phase.
const IO_PHASE: Duration = Duration::from_secs(120);

fn io_remaining(deadline: Instant, stop: &AtomicBool) -> io::Result<Duration> {
    if stop.load(Ordering::Acquire) {
        return Err(io::Error::new(io::ErrorKind::Interrupted, "owned IPC stopped"));
    }
    deadline.checked_duration_since(Instant::now())
        .filter(|remaining| !remaining.is_zero())
        .ok_or_else(|| io::Error::new(io::ErrorKind::TimedOut, "IPC phase deadline exhausted"))
}

fn wait_ready(stream: &UnixStream, events: i16, deadline: Instant, stop: &AtomicBool) -> io::Result<()> {
    loop {
        let remaining = io_remaining(deadline, stop)?;
        let milliseconds = remaining.as_millis().clamp(1, 100) as i32;
        let mut descriptor = libc::pollfd { fd: stream.as_raw_fd(), events, revents: 0 };
        let result = unsafe { libc::poll(&mut descriptor, 1, milliseconds) };
        if result > 0 {
            io_remaining(deadline, stop)?;
            if descriptor.revents & libc::POLLNVAL != 0 {
                return Err(io::Error::new(io::ErrorKind::InvalidInput, "invalid owned socket"));
            }
            return Ok(());
        }
        if result < 0 {
            let error = io::Error::last_os_error();
            if error.kind() != io::ErrorKind::Interrupted { return Err(error); }
        }
    }
}

fn read_frame(stream: &mut UnixStream, maximum: usize, deadline: Instant, stop: &AtomicBool) -> io::Result<Vec<u8>> {
    let mut body = Vec::new();
    let mut chunk = [0u8; 8192];
    while body.len() <= maximum {
        wait_ready(stream, libc::POLLIN, deadline, stop)?;
        let length = chunk.len().min(maximum + 1 - body.len());
        match stream.read(&mut chunk[..length]) {
            Ok(0) => break,
            Ok(count) => {
                let end = chunk[..count].iter().position(|byte| *byte == b'\n').map(|index| index + 1);
                body.extend_from_slice(&chunk[..end.unwrap_or(count)]);
                if end.is_some() { break; }
            }
            Err(error) if matches!(error.kind(), io::ErrorKind::WouldBlock | io::ErrorKind::Interrupted) => {}
            Err(error) => return Err(error),
        }
    }
    io_remaining(deadline, stop)?;
    Ok(body)
}

fn write_frame(stream: &mut UnixStream, mut bytes: &[u8], deadline: Instant, stop: &AtomicBool) -> io::Result<()> {
    while !bytes.is_empty() {
        wait_ready(stream, libc::POLLOUT, deadline, stop)?;
        match stream.write(bytes) {
            Ok(0) => return Err(io::Error::new(io::ErrorKind::WriteZero, "empty owned socket write")),
            Ok(count) => bytes = &bytes[count..],
            Err(error) if matches!(error.kind(), io::ErrorKind::WouldBlock | io::ErrorKind::Interrupted) => {}
            Err(error) => return Err(error),
        }
    }
    io_remaining(deadline, stop)?;
    Ok(())
}

fn serve_one(
    mut stream: UnixStream,
    expected_pid: u32,
    host: &BrowserHost,
    runtime: &tokio::runtime::Runtime,
    read_deadline: Instant,
    stop: &AtomicBool,
) -> io::Result<()> {
    stream.set_nonblocking(true)?;
    if !peer_is_sidecar(&stream, expected_pid)? {
        return write_frame(&mut stream, b"{\"ok\":false,\"code\":\"UNAUTHORIZED_PEER\"}\n", Instant::now() + IO_PHASE, stop);
    }
    let body = read_frame(&mut stream, MAX_REQUEST_BYTES as usize, read_deadline, stop)?;
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
    let write_deadline = Instant::now() + IO_PHASE;
    let mut encoded = bounded_response(&reply)?;
    encoded.push(b'\n');
    write_frame(&mut stream, &encoded, write_deadline, stop)
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
                            let read_deadline = Instant::now() + IO_PHASE;
                            if active.fetch_add(1, Ordering::AcqRel) >= MAX_CONNECTIONS {
                                active.fetch_sub(1, Ordering::AcqRel);
                                let _ = stream.set_nonblocking(true).and_then(|_| write_frame(&mut stream, b"{\"ok\":false,\"code\":\"BROWSER_BUSY\"}\n", read_deadline, &stop));
                                continue;
                            }
                            let host = host.clone();
                            let runtime = runtime.clone();
                            let active = active.clone();
                            let worker_stop = stop.clone();
                            workers.lock().unwrap().push(std::thread::spawn(move || {
                                let _ = serve_one(stream, expected_pid, &host, &runtime, read_deadline, &worker_stop);
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
    #[test]
    fn t1250_partial_frame_activity_does_not_renew_frozen_deadline() {
        let (mut server, mut client) = UnixStream::pair().unwrap();
        server.set_nonblocking(true).unwrap();
        let finished = Arc::new(AtomicBool::new(false));
        let sent = finished.clone();
        let writer = std::thread::spawn(move || {
            while !sent.load(Ordering::Acquire) {
                if client.write_all(b"x").is_err() { break; }
                std::thread::sleep(Duration::from_millis(10));
            }
        });
        let started = Instant::now();
        // Simulate an already almost exhausted frozen phase, not a new
        // production execution cap. Production read/write slots remain 120s.
        let result = read_frame(&mut server, 1400000, started + Duration::from_millis(120), &AtomicBool::new(false));
        finished.store(true, Ordering::Release);
        writer.join().unwrap();
        assert_eq!(result.unwrap_err().kind(), io::ErrorKind::TimedOut);
        assert!(started.elapsed() < Duration::from_secs(2));
    }

    #[test]
    fn t1250_backpressured_reply_uses_one_deadline() {
        let (mut server, _client) = UnixStream::pair().unwrap();
        server.set_nonblocking(true).unwrap();
        let started = Instant::now();
        let bytes = vec![b'x'; 4000001];
        let result = write_frame(&mut server, &bytes, started + Duration::from_millis(120), &AtomicBool::new(false));
        assert_eq!(result.unwrap_err().kind(), io::ErrorKind::TimedOut);
        assert!(started.elapsed() < Duration::from_secs(2));
    }

    #[test]
    fn t1250_cancel_wakes_owned_reply_without_claiming_write_rollback() {
        let (mut server, _client) = UnixStream::pair().unwrap();
        server.set_nonblocking(true).unwrap();
        let stop = Arc::new(AtomicBool::new(false));
        let setter = stop.clone();
        let cancel = std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(100));
            setter.store(true, Ordering::Release);
        });
        let started = Instant::now();
        let result = write_frame(&mut server, &vec![b'x'; 4000001], started + IO_PHASE, &stop);
        cancel.join().unwrap();
        assert_eq!(result.unwrap_err().kind(), io::ErrorKind::Interrupted);
        assert!(started.elapsed() < Duration::from_secs(2));
        // Some bytes may already have been written; no receipt/effect rollback
        // or new operation is inferred from this cancelled connection.
    }

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
    fn t1250_browser_authorized_frame_after_thirty_seconds_keeps_original_id() {
        let pending = PendingBrowserBridge::bind().unwrap();
        let socket = pending.socket_path();
        let root = std::env::temp_dir().join(format!("t1250-browser-slow-{}", rand::random::<u64>()));
        let running = pending.start(std::process::id(), root.clone(), PathBuf::from("/missing/cft"));
        let mut stream = UnixStream::connect(&socket).unwrap();
        stream.set_read_timeout(Some(IO_PHASE)).unwrap();
        std::thread::sleep(Duration::from_secs(31));
        let sent = stream.write_all(format!("{}\n", json!({"operationId":"same-location-31", "action":{
            "kind":"profile_location", "userId":"u", "accountId":"a", "taskId":"t", "identityMode":"anonymous"
        }})).as_bytes());
        let mut line = String::new();
        let received = BufReader::new(stream).read_line(&mut line);
        drop(running);
        let _ = fs::remove_dir_all(root);
        assert!(sent.is_ok(), "{sent:?}");
        assert!(received.is_ok(), "{received:?}");
        let reply: Value = serde_json::from_str(&line).unwrap();
        assert_eq!(reply["ok"], true);
        assert_eq!(reply["operationId"], "same-location-31");
    }

    #[test]
    fn t1250_browser_stop_wakes_incomplete_frame_without_profile_creation() {
        let pending = PendingBrowserBridge::bind().unwrap();
        let socket = pending.socket_path();
        let root = std::env::temp_dir().join(format!("t1250-browser-stop-{}", rand::random::<u64>()));
        let running = pending.start(std::process::id(), root.clone(), PathBuf::from("/missing/cft"));
        let mut client = UnixStream::connect(&socket).unwrap();
        client.write_all(b"{\"operationId\":").unwrap();
        std::thread::sleep(Duration::from_millis(100));
        let (tx, rx) = std::sync::mpsc::channel();
        let started = Instant::now();
        let join = std::thread::spawn(move || { drop(running); tx.send(()).unwrap(); });
        let stopped = rx.recv_timeout(IO_PHASE);
        let elapsed = started.elapsed();
        drop(client);
        join.join().unwrap();
        let absent = !root.exists();
        let _ = fs::remove_dir_all(root);
        assert!(stopped.is_ok());
        assert!(elapsed < Duration::from_secs(2), "{elapsed:?}");
        assert!(absent, "incomplete request created a browser profile");
    }

    #[test]
    fn browser_socket_waits_for_delayed_authorized_request_bytes() {
        let pending = PendingBrowserBridge::bind().unwrap();
        let socket = pending.socket_path();
        let root = std::env::temp_dir().join(format!(
            "creatoros-browser-delayed-{}",
            rand::random::<u64>()
        ));
        let running = pending.start(
            std::process::id(),
            root.clone(),
            PathBuf::from("/missing/cft"),
        );
        let mut stream = UnixStream::connect(&socket).unwrap();
        std::thread::sleep(Duration::from_millis(100));
        stream
            .write_all(
                format!(
                    "{}\n",
                    json!({"operationId":"delayed-location", "action":{
                        "kind":"profile_location", "userId":"user-one", "accountId":"account-one",
                        "taskId":"task-one", "identityMode":"anonymous"
                    }})
                )
                .as_bytes(),
            )
            .unwrap();
        let mut line = String::new();
        BufReader::new(stream).read_line(&mut line).unwrap();
        let reply: Value = serde_json::from_str(&line).unwrap();
        assert_eq!(reply["ok"], true, "{reply}");
        drop(running);
        fs::remove_dir_all(root).unwrap();
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
        // Test-only milliseconds, frozen once after ready; never extends a task/RPC deadline.
        let wait_ms = match std::env::var("CREATOROS_TEST_WORKBENCH_FIXTURE_WAIT_MS") {
            Ok(value) => value.parse::<u64>().expect("fixture wait must be unsigned milliseconds"),
            Err(std::env::VarError::NotPresent) => 180_000,
            Err(error) => panic!("fixture wait environment is invalid: {error}"),
        };
        assert!(wait_ms >= 120_000, "fixture wait must be at least 120000 milliseconds");
        let wait_budget = Duration::from_millis(wait_ms);
        std::time::Instant::now().checked_add(wait_budget).expect("fixture wait exceeds Instant range");
        let abrupt_exit = std::env::var("CREATOROS_BROWSER_E2E_ABRUPT_EXIT").as_deref() == Ok("1");
        if abrupt_exit {
            // Give the interrupted fixture its own owner process group so
            // later absence proof cannot overlap the invoking Node test.
            assert_eq!(unsafe { libc::setpgid(0, 0) }, 0);
        }
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
        let deadline = std::time::Instant::now().checked_add(wait_budget).expect("fixture wait exceeds Instant range");
        while !done.exists() && std::time::Instant::now() < deadline {
            std::thread::sleep(Duration::from_millis(100));
        }
        let completed = done.exists();
        if completed && abrupt_exit {
            // Test only: close the real CDP pipes without host/engine Drop,
            // leaving genuine ownership records for the next host to recover.
            std::process::exit(0);
        }
        drop(running);
        assert!(completed, "Node integration did not release the fixture");
    }
}
