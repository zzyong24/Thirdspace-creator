//! macOS 受控 sidecar 进程组停止。根 Child 在最后一次组信号前不 reap，防止 PID/PGID 复用。
//! 只证明该进程组无执行成员；不覆盖 setsid/setpgid 逃离组的后代或宿主跨重启身份。
use std::process::Child;
use std::sync::Mutex;
use std::time::{Duration, Instant};

const POLL: Duration = Duration::from_millis(150);
// sidecar 内部落盘 120 秒，壳侧另留 10 秒结算余量。
const GRACE: Duration = Duration::from_secs(130);
const FORCE: Duration = Duration::from_secs(120);

pub(crate) struct OwnedSidecar(Mutex<State>);
struct State {
    child: Option<Child>,
    stopped: Option<Result<(), String>>,
}

impl OwnedSidecar {
    pub(crate) fn new(child: Child) -> Self {
        Self(Mutex::new(State {
            child: Some(child),
            stopped: None,
        }))
    }

    pub(crate) fn stop(&self) -> Result<(), String> {
        let mut state = self.0.lock().map_err(|_| "sidecar 停止锁异常")?;
        if let Some(result) = &state.stopped {
            return result.clone();
        }
        let pid = state.child.as_ref().ok_or("sidecar 句柄缺失")?.id() as i32;
        let mut port = ProcessGroup {
            pid,
            start: Instant::now(),
        };
        let result = stop_group(&mut port, GRACE, FORCE);
        // 先冻结结果，之后不再发组信号。即便确认失败，也可以安全回收已退出的根。
        state.stopped = Some(result.clone());
        let result = result.and(reap_exited(&mut state));
        state.stopped = Some(result.clone());
        result
    }

    // 替代 SharedChild::wait：不提前 reap，自然根退出也主动清理余下进程组。
    pub(crate) fn watch_exit(&self) -> Result<(), String> {
        loop {
            {
                let mut state = self.0.lock().map_err(|_| "sidecar 退出锁异常")?;
                let Some(child) = &state.child else {
                    return state.stopped.clone().unwrap_or(Ok(()));
                };
                if root_exited(child.id() as i32)? {
                    drop(state);
                    let result = self.stop();
                    state = self.0.lock().map_err(|_| "sidecar 回收锁异常")?;
                    reap_exited(&mut state)?;
                    return result;
                }
            }
            std::thread::sleep(POLL);
        }
    }
}

impl Drop for OwnedSidecar {
    fn drop(&mut self) {
        let _ = self.stop();
    }
}

fn reap_exited(state: &mut State) -> Result<(), String> {
    if let Some(child) = &mut state.child {
        if root_exited(child.id() as i32)? {
            if child
                .try_wait()
                .map_err(|e| format!("回收 sidecar 失败：{e}"))?
                .is_some()
            {
                state.child = None;
            }
        }
    }
    Ok(())
}

fn root_exited(pid: i32) -> Result<bool, String> {
    let mut info: libc::siginfo_t = unsafe { std::mem::zeroed() };
    let rc = unsafe {
        libc::waitid(
            libc::P_PID,
            pid as u32,
            &mut info,
            libc::WEXITED | libc::WNOHANG | libc::WNOWAIT,
        )
    };
    if rc != 0 {
        return Err(format!(
            "观察 sidecar 退出失败：{}",
            std::io::Error::last_os_error()
        ));
    }
    Ok(unsafe { info.si_pid() } == pid)
}

trait StopPort {
    fn owned(&mut self) -> Result<(), String>;
    fn signal(&mut self, signal: i32) -> Result<(), String>;
    fn active(&mut self) -> Result<bool, String>;
    fn elapsed(&self) -> Duration;
    fn pause(&mut self);
}

fn stop_group(port: &mut impl StopPort, grace: Duration, force: Duration) -> Result<(), String> {
    port.owned()?;
    let term = port.signal(libc::SIGTERM);
    let grace_end = port.elapsed() + grace;
    while port.elapsed() < grace_end {
        port.owned()?;
        match port.active() {
            Ok(false) => return Ok(()),
            _ if term.is_ok() => port.pause(), // 探测失败也保留已发送 TERM 的 flush 窗口。
            _ => break,                        // TERM 失败仍尝试已确认归属组的有界强制停止。
        }
    }
    port.owned()?;
    let kill = port.signal(libc::SIGKILL);
    let force_end = port.elapsed() + force;
    loop {
        port.owned()?;
        if !port.active()? {
            return Ok(());
        }
        if port.elapsed() >= force_end {
            return Err(format!(
                "sidecar 进程组仍有执行成员，无法确认停止{}",
                kill.err().map(|e| format!("：{e}")).unwrap_or_default()
            ));
        }
        port.pause();
    }
}

struct ProcessGroup {
    pid: i32,
    start: Instant,
}
impl StopPort for ProcessGroup {
    fn owned(&mut self) -> Result<(), String> {
        // Child 未 reap，OS 不会复用其 PID；不能仅凭一个历史数字发 killpg。
        let info = process_info(self.pid)?;
        if self.pid <= 1
            || info.pbi_pid != self.pid as u32
            || info.pbi_pgid != self.pid as u32
            || info.pbi_ppid != unsafe { libc::getpid() } as u32
        {
            return Err("sidecar 进程组归属无法确认，未向其他进程组发送信号".into());
        }
        Ok(())
    }
    fn signal(&mut self, signal: i32) -> Result<(), String> {
        self.owned()?;
        if unsafe { libc::killpg(self.pid, signal) } != 0 {
            return Err(format!(
                "停止 sidecar 进程组失败：{}",
                std::io::Error::last_os_error()
            ));
        }
        Ok(())
    }
    fn active(&mut self) -> Result<bool, String> {
        group_has_executing_members(self.pid)
    }
    fn elapsed(&self) -> Duration {
        self.start.elapsed()
    }
    fn pause(&mut self) {
        std::thread::sleep(POLL);
    }
}

fn group_pids(pgid: i32) -> Result<Vec<i32>, String> {
    let mut size = 64;
    while size <= 65536 {
        let mut pids = vec![0i32; size];
        // proc_listpgrppids 返回 PID 个数（不是 proc_listpids 的字节数）。
        let count =
            unsafe { libc::proc_listpgrppids(pgid, pids.as_mut_ptr().cast(), (size * 4) as i32) };
        if count < 0 {
            return Err(format!(
                "读取 sidecar 进程组失败：{}",
                std::io::Error::last_os_error()
            ));
        }
        if (count as usize) < size {
            pids.truncate(count as usize);
            pids.sort_unstable();
            return Ok(pids);
        }
        size *= 2;
    }
    Err("sidecar 进程组列表持续变化或过大，无法确认停止".into())
}

// arg=1 包含未回收僵尸；macOS getpgid 对僵尸返回 ESRCH，不能用于根退出后的归属判断。
fn process_info(pid: i32) -> Result<libc::proc_bsdinfo, String> {
    let mut info: libc::proc_bsdinfo = unsafe { std::mem::zeroed() };
    let size = std::mem::size_of_val(&info) as i32;
    let count = unsafe {
        libc::proc_pidinfo(
            pid,
            libc::PROC_PIDTBSDINFO,
            1,
            (&mut info as *mut libc::proc_bsdinfo).cast(),
            size,
        )
    };
    if count != size {
        return Err(format!(
            "读取 sidecar 身份失败：{}",
            std::io::Error::last_os_error()
        ));
    }
    Ok(info)
}

fn group_has_executing_members(pgid: i32) -> Result<bool, String> {
    let pids = group_pids(pgid)?;
    // 未 reap 的组长应仍存在；空列表不能冒充成功（也可能是 OS 读取失败）。
    if !pids.contains(&pgid) {
        return Err("sidecar 进程组缺少受控根，无法确认停止".into());
    }
    for pid in &pids {
        let mut info: libc::proc_bsdinfo = unsafe { std::mem::zeroed() };
        let size = std::mem::size_of_val(&info) as i32;
        let count = unsafe {
            libc::proc_pidinfo(
                *pid,
                libc::PROC_PIDTBSDINFO,
                1,
                (&mut info as *mut libc::proc_bsdinfo).cast(),
                size,
            )
        };
        if count != size {
            if std::io::Error::last_os_error().raw_os_error() == Some(libc::ESRCH) {
                return Ok(true); // 列表变化，下一轮重查，不把单 PID 消失当组停止。
            }
            return Err("读取 sidecar 组成员状态失败，无法确认停止".into());
        }
        if info.pbi_pid != *pid as u32
            || info.pbi_pgid != pgid as u32
            || info.pbi_status != libc::SZOMB
        {
            return Ok(true);
        }
    }
    // 成员可能在第一次快照后 fork 再退出；全部为僵尸且成员集合稳定才可成功。
    Ok(group_pids(pgid)? != pids)
}

#[cfg(test)]
#[path = "sidecar_process_tests.rs"]
mod tests;
