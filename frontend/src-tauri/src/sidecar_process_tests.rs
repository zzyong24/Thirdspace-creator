use super::*;
use std::io::{BufRead, BufReader};
use std::os::unix::process::CommandExt;
use std::process::{Command, Stdio};

// 仅新建隔离进程组；无应用数据、网络或现存用户进程。
#[test]
fn root_exit_does_not_prove_descendant_stopped() {
    let mut child = Command::new("/bin/sh")
        .args(["-c", "trap 'exit 0' TERM; /bin/sh -c 'trap \"\" TERM; echo ready; exec /bin/sleep 60' & wait"])
        .process_group(0)
        .stdout(Stdio::piped())
        .spawn().unwrap();
    let pgid = child.id() as i32;
    let mut ready = String::new();
    BufReader::new(child.stdout.take().unwrap())
        .read_line(&mut ready)
        .unwrap();
    assert_eq!(ready.trim(), "ready");
    let owned = OwnedSidecar::new(child);
    owned.stop().unwrap();
    // 旧逻辑此时只回收根，忽略 SIGTERM 的 sleep 仍在执行。
    assert!(
        group_pids(pgid).unwrap().iter().all(|pid| {
            let mut info: libc::proc_bsdinfo = unsafe { std::mem::zeroed() };
            let size = std::mem::size_of_val(&info) as i32;
            let n = unsafe {
                libc::proc_pidinfo(
                    *pid,
                    libc::PROC_PIDTBSDINFO,
                    0,
                    (&mut info as *mut libc::proc_bsdinfo).cast(),
                    size,
                )
            };
            n == 0 || (n == size && info.pbi_status == libc::SZOMB)
        }),
        "根退出后同组后代仍在执行，不能确认停止"
    );
}

#[test]
fn natural_exit_watcher_stops_group_and_reaps_root() {
    let mut child = Command::new("/bin/sh")
        .args([
            "-c",
            "/bin/sh -c 'trap \"\" TERM; echo ready; exec /bin/sleep 60' & exit 0",
        ])
        .process_group(0)
        .stdout(Stdio::piped())
        .spawn()
        .unwrap();
    let pid = child.id() as i32;
    let mut ready = String::new();
    BufReader::new(child.stdout.take().unwrap())
        .read_line(&mut ready)
        .unwrap();
    let owned = OwnedSidecar::new(child);
    owned.watch_exit().unwrap();
    assert!(owned.0.lock().unwrap().child.is_none());
    assert!(root_exited(pid).is_err()); // 已回收，不是永久僵尸。
    owned.stop().unwrap(); // 缓存已确认结果，不再次对历史 PID 发信号。
}

#[test]
fn drop_stops_and_reaps_an_owned_group() {
    let child = Command::new("/bin/sleep")
        .arg("60")
        .process_group(0)
        .spawn()
        .unwrap();
    let pid = child.id() as i32;
    drop(OwnedSidecar::new(child));
    assert!(root_exited(pid).is_err());
}

#[test]
fn wrong_group_is_not_signalled_and_failure_is_not_success_on_retry() {
    // 本用例只等待自身新建的短命子进程；它没有自己的组，所以不得发组信号。
    let child = Command::new("/bin/sleep").arg("0.1").spawn().unwrap();
    let owned = OwnedSidecar::new(child);
    let error = owned.stop().unwrap_err();
    assert!(error.contains("归属"));
    assert_eq!(owned.stop().unwrap_err(), error);
    assert!(owned.watch_exit().is_err());
    assert!(owned.0.lock().unwrap().child.is_none());
}

struct FakePort {
    ticks: u64,
    signals: Vec<i32>,
    owned: bool,
    stops_after: Option<u64>,
    unreadable: bool,
    signal_error: bool,
}
impl Default for FakePort {
    fn default() -> Self {
        Self {
            ticks: 0,
            signals: vec![],
            owned: true,
            stops_after: None,
            unreadable: false,
            signal_error: false,
        }
    }
}
impl StopPort for FakePort {
    fn owned(&mut self) -> Result<(), String> {
        if self.owned {
            Ok(())
        } else {
            Err("归属不符".into())
        }
    }
    fn signal(&mut self, signal: i32) -> Result<(), String> {
        self.signals.push(signal);
        if self.signal_error {
            Err("拒绝信号".into())
        } else {
            Ok(())
        }
    }
    fn active(&mut self) -> Result<bool, String> {
        if self.unreadable {
            return Err("无法读取成员".into());
        }
        Ok(self.stops_after.map(|t| self.ticks < t).unwrap_or(true))
    }
    fn elapsed(&self) -> Duration {
        Duration::from_millis(self.ticks)
    }
    fn pause(&mut self) {
        self.ticks += 1;
    }
}
fn short_stop(port: &mut FakePort) -> Result<(), String> {
    stop_group(port, Duration::from_millis(5), Duration::from_millis(2))
}
#[test]
fn forced_stop_is_bounded_and_does_not_report_unconfirmed_success() {
    let mut port = FakePort::default();
    assert!(short_stop(&mut port).is_err());
    assert_eq!(port.ticks, 7);
    assert_eq!(port.signals, [libc::SIGTERM, libc::SIGKILL]);
}
#[test]
fn graceful_window_is_preserved() {
    let mut port = FakePort {
        stops_after: Some(4),
        ..Default::default()
    };
    short_stop(&mut port).unwrap();
    assert_eq!(port.ticks, 4);
    assert_eq!(port.signals, [libc::SIGTERM]);
}
#[test]
fn identity_mismatch_sends_no_signal() {
    let mut port = FakePort {
        owned: false,
        ..Default::default()
    };
    assert!(short_stop(&mut port).is_err());
    assert!(port.signals.is_empty());
}
#[test]
fn unreadable_group_attempts_owned_fallback_but_cannot_prove_stop() {
    let mut port = FakePort {
        unreadable: true,
        ..Default::default()
    };
    assert!(short_stop(&mut port).is_err());
    assert_eq!(port.signals, [libc::SIGTERM, libc::SIGKILL]);
}
#[test]
fn failed_signals_do_not_imply_stop() {
    let mut port = FakePort {
        signal_error: true,
        ..Default::default()
    };
    assert!(short_stop(&mut port).is_err());
    assert!(port.ticks <= 7);
}

#[test]
fn concurrent_watch_and_stop_share_one_result() {
    let child = Command::new("/bin/sleep")
        .arg("60")
        .process_group(0)
        .spawn()
        .unwrap();
    let owned = std::sync::Arc::new(OwnedSidecar::new(child));
    let watched = owned.clone();
    let watcher = std::thread::spawn(move || watched.watch_exit());
    owned.stop().unwrap();
    watcher.join().unwrap().unwrap();
    owned.stop().unwrap();
    assert!(owned.0.lock().unwrap().child.is_none());
}
