// [T-332 S5] 「重置工作区」纯逻辑(与 route 分离,好单测):确认词校验 + loopback 判定
// + appData 目录解析 + 待重置标记文件路径。
//
// 照 T-259 reveal-logs 的 route/plan 分离范式:route 只做 isDesktopRuntime 判定 + I/O
// (写标记文件),这里做无副作用的校验与路径推导,方便针对各输入组合写单测。
//
// 关键设计(SPEC 2026-07-15 账号全域隔离 §5.4):
//   - route **不直接归档改名数据目录** —— PGlite 单写者,db 目录被当前 sidecar 进程持有,
//     rename 活库有数据损坏风险。正确姿态 = 「标记待重置 + 引导重启」:这里只落一个
//     reset-pending.json 标记,真正的归档改名放在**下次启动**(Tauri Rust 侧 setup 早于
//     sidecar 起库时执行,见 src-tauri/src/workspace_reset.rs)。
//   - 归档 = fs rename(`db → db.archived-<ts>`、`.auth → .auth.archived-<ts>`),
//     不物理删除字节 —— 守 T-326 DATA-H09「失败不丢原数据」。

import * as path from "node:path";

/** 二次确认词 —— 用户必须在弹层里逐字输入它,route 才接受重置请求。 */
export const RESET_CONFIRM_WORD = "重置";

/** 待重置标记文件名(落 appDataDir 顶层,与 db/ .auth/ 同级;Rust 侧按同名检测)。 */
export const RESET_PENDING_MARKER = "reset-pending.json";

/**
 * 解析 appData 根目录(= db 目录的父级)。桌面壳注入 `CREATOROS_DB_DIR`
 * (= `<appDataDir>/db`,见 src-tauri/src/lib.rs setup ①),取其 dirname 即 appDataDir。
 * 未注入(web / dev)→ null,route 据此诚实拒绝(不猜路径)。
 */
export function resolveAppDataDir(
  env: Record<string, string | undefined>,
): string | null {
  const dbDir = env.CREATOROS_DB_DIR?.trim();
  if (!dbDir) return null;
  return path.dirname(dbDir);
}

/** 待重置标记文件的绝对路径。 */
export function resetPendingMarkerPath(appDataDir: string): string {
  return path.join(appDataDir, RESET_PENDING_MARKER);
}

/**
 * loopback 防护:重置是破坏性操作,除「sidecar 只 listen 127.0.0.1」外再加一道
 * Host 头校验 —— 仅接受本机回环形态的 Host(127.0.0.1 / localhost / [::1],可带端口)。
 * Host 缺失或非回环 → 拒(fail closed)。
 */
export function isLoopbackHost(hostHeader: string | null): boolean {
  if (!hostHeader) return false;
  const host = hostHeader.trim().toLowerCase();
  if (!host) return false;
  // IPv6 回环:[::1] 或 [::1]:port。
  if (host === "[::1]" || host.startsWith("[::1]:")) return true;
  // IPv4 / 主机名形态:剥掉端口再比对白名单。
  const bare = host.split(":")[0]!;
  return bare === "127.0.0.1" || bare === "localhost";
}

/** 确认词校验结果(可读错误 + HTTP 状态,route 直接透传)。 */
export type ConfirmCheck =
  | { ok: true }
  | { ok: false; error: string; status: number };

/**
 * 校验请求体确认词:必须是字符串且逐字等于 RESET_CONFIRM_WORD(前后空白容忍,
 * 用户从输入框提交常带空格)。不匹配 → 400 + 可读文案。
 */
export function checkConfirmWord(confirm: unknown): ConfirmCheck {
  if (typeof confirm !== "string" || confirm.trim() !== RESET_CONFIRM_WORD) {
    return {
      ok: false,
      error: `确认词不正确,请输入「${RESET_CONFIRM_WORD}」`,
      status: 400,
    };
  }
  return { ok: true };
}
