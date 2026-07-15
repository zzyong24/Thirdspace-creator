//! [T-332 S5] 「重置工作区」的启动期归档执行(SPEC 账号全域隔离 §5.4)。
//!
//! 分工:设置页 route(frontend/src/app/api/v1/local/reset-workspace)只在
//! `<appDataDir>/reset-pending.json` 落一个「待重置」标记 —— PGlite 单写者,db 目录
//! 被运行中的 sidecar 进程持有,活库 rename 有损坏风险。真正的归档改名放在这里:
//! Tauri setup 在 **spawn sidecar 之前**(库未被任何进程打开)检测标记 → 把
//! `db/` 与 `.auth/` 整目录 rename 成 `db.archived-<ts>` / `.auth.archived-<ts>`
//! → 清标记。随后 sidecar 面对全新空 db 目录跑全量迁移 + seed = 干净首启。
//!
//! 铁律(T-326 DATA-H09 / 数据地图 D-G08):**归档改名,不物理删除** —— rename 不动
//! 字节,旧数据完整保留在磁盘,用户可随时手动改回目录名恢复。磁盘占用随归档次数
//! 累积,由用户在 Finder 里自行清理(产品不代删)。
//!
//! 不归档的内容(与 SPEC §5.4「激活态保留」一致):
//!   - `.master-key` / `machine-id` —— 机器级身份,清掉会导致重激活/换机判定;
//!   - `logs/` —— 排障日志,非用户数据;
//!   - `runtime/` —— sidecar 解压缓存,与数据无关(删了也只是重解压)。
//!   注:activation_state 表在 db 里,归档后随新库丢 —— 桌面激活走「重新激活」路径
//!   (机器码不变,同码重激活不占新名额,见 T-178)。

use std::path::{Path, PathBuf};

/// 待重置标记文件名(route 侧 plan.ts 的 RESET_PENDING_MARKER 同名,两侧勿单改)。
pub const RESET_MARKER_FILE: &str = "reset-pending.json";

/// 要归档的目录名(appDataDir 顶层):PGlite 数据库 + 登录态(douyin/web 持久 profile)。
const ARCHIVE_TARGETS: [&str; 2] = ["db", ".auth"];

/// 把 unix 秒格式化成紧凑 UTC 时间戳 `YYYYMMDD-HHMMSS`(归档目录名用,Finder 可读)。
/// 无 chrono 依赖 —— 用 Howard Hinnant civil_from_days 算法手推(纯整数,可单测)。
fn format_utc_compact(unix_secs: u64) -> String {
    let secs_of_day = unix_secs % 86_400;
    let days = (unix_secs / 86_400) as i64;
    // civil_from_days(以 1970-01-01 为 day 0)。
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097); // [0, 146096]
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365; // [0, 399]
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100); // [0, 365]
    let mp = (5 * doy + 2) / 153; // [0, 11]
    let d = doy - (153 * mp + 2) / 5 + 1; // [1, 31]
    let m = if mp < 10 { mp + 3 } else { mp - 9 }; // [1, 12]
    let y = if m <= 2 { y + 1 } else { y };
    format!(
        "{:04}{:02}{:02}-{:02}{:02}{:02}",
        y,
        m,
        d,
        secs_of_day / 3_600,
        (secs_of_day % 3_600) / 60,
        secs_of_day % 60
    )
}

/// 归档目标路径:`<dir>.archived-<stamp>`;同名已存在(同秒二次重置)→ 追加 `-2`、`-3`…
/// 直到不冲突(绝不覆盖已有归档 —— 覆盖=丢数据)。
fn archive_destination(src: &Path, stamp: &str) -> PathBuf {
    let base = format!(
        "{}.archived-{stamp}",
        src.file_name().map(|n| n.to_string_lossy()).unwrap_or_default()
    );
    let parent = src.parent().unwrap_or_else(|| Path::new("."));
    let mut dest = parent.join(&base);
    let mut n = 1u32;
    while dest.exists() {
        n += 1;
        dest = parent.join(format!("{base}-{n}"));
    }
    dest
}

/// 归档结果(拼日志用;上层 eprintln + tee 到 sidecar.log)。
pub struct ResetOutcome {
    /// 人话摘要(归档了哪些目录 → 改成了什么名;或失败原因)。
    pub summary: String,
    /// 全部目标处理成功(成功才清标记;失败保留标记 → 下次启动重试)。
    pub ok: bool,
}

/// 检测并执行「待重置」归档。**必须在 spawn sidecar 之前调用**(库无进程持有时 rename 才安全)。
///
/// - 无标记 → None(绝大多数启动的快路径,只有一次 metadata 探测);
/// - 有标记 → 逐个 rename `db/`、`.auth/`(不存在的目标跳过,不算失败)→ 全部成功才
///   删标记;任一 rename 失败 → **保留标记**(下次启动重试)+ 保留已归档部分(rename
///   过的目录不回滚 —— 回滚是又一次活体改名风险,且归档态数据本就完整)。
pub fn apply_pending_workspace_reset(app_data_dir: &Path) -> Option<ResetOutcome> {
    let marker = app_data_dir.join(RESET_MARKER_FILE);
    if !marker.exists() {
        return None;
    }

    let stamp = format_utc_compact(
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0),
    );

    let mut lines: Vec<String> = Vec::new();
    let mut ok = true;
    for name in ARCHIVE_TARGETS {
        let src = app_data_dir.join(name);
        if !src.exists() {
            lines.push(format!("{name}: 不存在,跳过"));
            continue;
        }
        let dest = archive_destination(&src, &stamp);
        match std::fs::rename(&src, &dest) {
            Ok(()) => lines.push(format!("{name} → {}", dest.display())),
            Err(e) => {
                ok = false;
                lines.push(format!("{name}: 归档失败({e}),原数据未动"));
            }
        }
    }

    if ok {
        // 全部成功 → 清标记。清不掉(极端)也不致命:下次启动重跑,目标已不存在会全部
        // 「跳过」后再次尝试清标记。
        if let Err(e) = std::fs::remove_file(&marker) {
            lines.push(format!("清标记失败({e}),下次启动会再试"));
        }
    } else {
        lines.push("存在失败项,保留 reset-pending 标记,下次启动重试".to_string());
    }

    Some(ResetOutcome {
        summary: format!("[T-332] 重置工作区归档:{}", lines.join(";")),
        ok,
    })
}

// ---------------------------------------------------------------------------
// 单测(纯 std,临时目录用 env::temp_dir() + 唯一子目录,不引 tempfile 依赖)
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    /// 建一个唯一的临时 appDataDir(测试进程 id + 计数器,避免并发用例互踩)。
    fn temp_app_data_dir(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "creatoros-reset-test-{}-{tag}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).expect("建测试目录失败");
        dir
    }

    #[test]
    fn no_marker_is_noop() {
        let dir = temp_app_data_dir("noop");
        std::fs::create_dir_all(dir.join("db")).unwrap();
        assert!(apply_pending_workspace_reset(&dir).is_none());
        // db 原封不动。
        assert!(dir.join("db").exists());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn marker_archives_db_and_auth_then_clears_marker() {
        let dir = temp_app_data_dir("archive");
        // 造一个带内容的 db/ 与 .auth/,外加不该被动的 logs/ 与 .master-key。
        std::fs::create_dir_all(dir.join("db")).unwrap();
        std::fs::write(dir.join("db").join("pgdata"), b"bytes").unwrap();
        std::fs::create_dir_all(dir.join(".auth").join("douyin")).unwrap();
        std::fs::create_dir_all(dir.join("logs")).unwrap();
        std::fs::write(dir.join(".master-key"), b"k").unwrap();
        std::fs::write(dir.join(RESET_MARKER_FILE), b"{}").unwrap();

        let outcome = apply_pending_workspace_reset(&dir).expect("应执行归档");
        assert!(outcome.ok, "{}", outcome.summary);

        // 原目录消失,归档目录存在且内容完整(字节还在=没有物理删除)。
        assert!(!dir.join("db").exists());
        assert!(!dir.join(".auth").exists());
        let entries: Vec<String> = std::fs::read_dir(&dir)
            .unwrap()
            .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        let db_archive = entries
            .iter()
            .find(|n| n.starts_with("db.archived-"))
            .expect("应有 db 归档目录");
        assert!(
            dir.join(db_archive).join("pgdata").exists(),
            "归档后字节应完整保留"
        );
        assert!(entries.iter().any(|n| n.starts_with(".auth.archived-")));
        // 标记已清;机器级文件与 logs 不动。
        assert!(!dir.join(RESET_MARKER_FILE).exists());
        assert!(dir.join("logs").exists());
        assert!(dir.join(".master-key").exists());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn missing_targets_still_clear_marker() {
        // db/.auth 都不存在(重置后又被手动清过)→ 跳过 + 清标记,不报错。
        let dir = temp_app_data_dir("missing");
        std::fs::write(dir.join(RESET_MARKER_FILE), b"{}").unwrap();
        let outcome = apply_pending_workspace_reset(&dir).expect("应执行");
        assert!(outcome.ok);
        assert!(!dir.join(RESET_MARKER_FILE).exists());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn archive_destination_never_overwrites() {
        let dir = temp_app_data_dir("collision");
        let src = dir.join("db");
        std::fs::create_dir_all(&src).unwrap();
        // 预造一个同名归档目录,验证会追加 -2 而非覆盖。
        std::fs::create_dir_all(dir.join("db.archived-STAMP")).unwrap();
        let dest = archive_destination(&src, "STAMP");
        assert_eq!(
            dest.file_name().unwrap().to_string_lossy(),
            "db.archived-STAMP-2"
        );
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn format_utc_compact_known_values() {
        assert_eq!(format_utc_compact(0), "19700101-000000");
        // 2000-03-01 12:34:56 UTC = 951914096(闰年 2 月边界后一天;`date -u -r` 已核)。
        assert_eq!(format_utc_compact(951_914_096), "20000301-123456");
    }
}
