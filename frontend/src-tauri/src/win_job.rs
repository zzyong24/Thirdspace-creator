//! [T-372 W-core W3] Windows 进程树杀 —— Job Object(JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE)。
//!
//! 背景:T-365 在 macOS 用「进程组(spawn 时 process_group(0))+ 退出 killpg」保证壳退出
//! 带走 sidecar 全家(node + Playwright Chrome + ffmpeg)——否则孤儿进程并发写 PGlite →
//! WAL 半写库损坏(2026-07-16 数据事故根因)。Windows 没有 POSIX 进程组/killpg,内核级
//! 等价设施 = **Job Object**:
//!   · spawn 后把 sidecar 进程挂进带 `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE` 的 Job;
//!   · sidecar 之后拉起的子进程(Chrome/ffmpeg)默认继承 Job 归属 → 整棵树都在 Job 内
//!     (除非子进程显式 CREATE_BREAKAWAY_FROM_JOB —— Playwright/ffmpeg 均不这么做);
//!   · Job 的最后一个句柄一关(显式 CloseHandle,或壳进程退出/崩溃被 OS 回收句柄)→
//!     Job 内整棵进程树被内核终止,**不依赖任何清理代码执行** —— 这一点比 macOS 侧
//!     「sidecar 孤儿自检轮询」还强(壳被 SIGKILL 级强杀也兜得住)。
//!
//! 优雅窗口(与 macOS「SIGTERM → 等 5s → SIGKILL」对齐)由调用方(lib.rs kill() 的
//! Windows 分支)负责:先经 stdin 写停机哨兵(Node 在 Win 收不到真 SIGTERM)让 sidecar
//! flush PGlite 自退,`shutdown()` 等到超时才 TerminateJobObject 硬杀兜底。
//!
//! 本模块整体只在 `#[cfg(windows)]` 下编入(见 lib.rs 的 mod 声明)—— macOS/Linux 构建
//! 不编译此文件、不引 windows-sys。诚实边界:本机(macOS)无法编译/运行验证本文件,
//! 静态论证 = 交叉 `cargo check --target x86_64-pc-windows-msvc` + 单测钉住哨兵契约;
//! Windows 真机行为验证(0 孤儿断言)归 W-ci。

use windows_sys::Win32::Foundation::{CloseHandle, GetLastError, HANDLE, WAIT_OBJECT_0};
use windows_sys::Win32::System::JobObjects::{
    AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation,
    SetInformationJobObject, TerminateJobObject, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
    JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
};
use windows_sys::Win32::System::Threading::{
    OpenProcess, WaitForSingleObject, PROCESS_SET_QUOTA, PROCESS_TERMINATE,
};

/// 标准访问权限 SYNCHRONIZE(WaitForSingleObject 等句柄所需)。windows-sys 0.61 把它归在
/// `Win32::Storage::FileSystem`(FILE_ACCESS_RIGHTS)—— 为免拉整个无关 feature,这里用
/// SDK 定义值本地常量(winnt.h `SYNCHRONIZE = 0x00100000`,对所有内核对象通用)。
const SYNCHRONIZE: u32 = 0x0010_0000;

/// sidecar 的 Job Object 守护:持有 Job 句柄 + sidecar 进程句柄。
///
/// 句柄生命周期 = 壳进程生命周期(实例存进 Tauri state):正常退出走 `shutdown()`
/// (优雅窗口 + 硬杀 + 关句柄);壳崩溃/强杀时实例没机会析构 —— OS 回收进程句柄表,
/// Job 最后句柄被关 → KILL_ON_JOB_CLOSE 内核触发整树杀。防线闭环不靠代码路径。
pub struct SidecarJob {
    job: HANDLE,
    process: HANDLE,
}

// HANDLE 是裸指针(*mut c_void)默认 !Send;这两个句柄是进程全局内核对象引用,跨线程
// 传递/使用安全(Tauri state 要求 Send)。
unsafe impl Send for SidecarJob {}

impl SidecarJob {
    /// 创建 Job(KILL_ON_JOB_CLOSE)并把 `pid`(sidecar)挂进去。
    /// 任一步失败 → Err(人话 + GetLastError),调用方降级为单进程 kill(有日志,不静默)。
    pub fn assign(pid: u32) -> Result<Self, String> {
        unsafe {
            let job = CreateJobObjectW(std::ptr::null(), std::ptr::null());
            if job.is_null() {
                return Err(format!(
                    "CreateJobObjectW 失败(GetLastError={})",
                    GetLastError()
                ));
            }
            let mut info: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
            info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
            if SetInformationJobObject(
                job,
                JobObjectExtendedLimitInformation,
                &info as *const JOBOBJECT_EXTENDED_LIMIT_INFORMATION as *const core::ffi::c_void,
                std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
            ) == 0
            {
                let e = GetLastError();
                CloseHandle(job);
                return Err(format!(
                    "SetInformationJobObject(KILL_ON_JOB_CLOSE) 失败(GetLastError={e})"
                ));
            }
            // PROCESS_SET_QUOTA + PROCESS_TERMINATE 是 AssignProcessToJobObject 的最低权限
            // 要求;SYNCHRONIZE 供 shutdown() 的 WaitForSingleObject 等优雅退出。
            let process = OpenProcess(PROCESS_SET_QUOTA | PROCESS_TERMINATE | SYNCHRONIZE, 0, pid);
            if process.is_null() {
                let e = GetLastError();
                CloseHandle(job);
                return Err(format!("OpenProcess(pid={pid}) 失败(GetLastError={e})"));
            }
            if AssignProcessToJobObject(job, process) == 0 {
                let e = GetLastError();
                CloseHandle(process);
                CloseHandle(job);
                return Err(format!("AssignProcessToJobObject 失败(GetLastError={e})"));
            }
            Ok(Self { job, process })
        }
    }

    /// 停机:等 sidecar 在 `grace_timeout_ms` 内自行优雅退出(调用方已写停机哨兵)→
    /// 超时/等待异常则 TerminateJobObject 硬杀 Job 内整树 → 关句柄(关闭本身对残存进程
    /// 再触发一次 KILL_ON_JOB_CLOSE,幂等)。与 macOS killpg SIGTERM→5s→SIGKILL 同构。
    pub fn shutdown(self, grace_timeout_ms: u32) -> Result<(), String> {
        unsafe {
            let initial_wait = WaitForSingleObject(self.process, grace_timeout_ms.max(130_000));
            let result = if initial_wait == WAIT_OBJECT_0 {
                Ok(())
            } else if TerminateJobObject(self.job, 1) == 0 {
                Err(format!(
                    "TerminateJobObject 失败(GetLastError={})",
                    GetLastError()
                ))
            } else if WaitForSingleObject(self.process, 120_000) == WAIT_OBJECT_0 {
                Ok(())
            } else {
                Err("sidecar Job 已请求终止，但 5 秒内未确认进程退出".to_string())
            };
            CloseHandle(self.process);
            CloseHandle(self.job);
            result
        }
    }
}
