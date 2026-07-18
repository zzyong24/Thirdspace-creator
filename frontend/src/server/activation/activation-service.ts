import type { LicenseClient, LicenseCheckResult } from "./license-client";

// T-147 P5 桌面激活授权 —— 激活状态机(纯逻辑,注入 repo + license 客户端 + clock)。
//
// 状态(SPEC §4.1):
//   inactive  未激活(本地无激活态)。
//   active    已激活有效(本地未过期 + 在线校 valid,或宽限窗内)。
//   grace     已激活离线宽限(在线校不到,本地未过期且距上次在线校 ≤ graceDays)。
//   expired   到期或无效(本地过期 / 在线判无效 / 超宽限窗)。
//
// 门控只关心「是否放行」= active | grace。expired | inactive → 弹回激活界面。
// **不真联网**:license 客户端注入(测试传桩)。

export type ActivationStatus = "inactive" | "active" | "grace" | "expired";

// 本地激活态(repo 读回的解密后形状)。
export interface StoredActivation {
  machineId: string;
  code: string; // 明文(repo 已解密)
  licenseMode: string;
  projectKey: string;
  expiresAt: string | null; // ISO;null = 永久
  activatedAt: string;
  lastOnlineCheckAt: string;
  // ── [T-372 L2] 安全门展示副本三列(可缺;由 Rust 壳经 syncFromShell 同步)────
  lastSeenAt?: string | null;
  graceSeconds?: number | null;
  revoked?: boolean;
}

// [T-372 L2] Rust 壳放行后经 loopback RPC 同步来的完整展示副本(BR-01:表仍由
// sidecar backend 写,Rust 只经此窄入口触发)。放行权威在 Rust `.license`,本记录仅供展示。
export interface ActivationSecurityMirror {
  machineId: string;
  code: string; // 明文(repo 落库前加密)
  licenseMode: string;
  projectKey: string;
  expiresAt: string | null;
  activatedAt: string;
  lastOnlineCheckAt: string;
  lastSeenAt: string | null;
  graceSeconds: number | null;
  revoked: boolean;
}

export interface ActivationRepository {
  read(): Promise<StoredActivation | null>;
  write(state: StoredActivation): Promise<void>;
  // [T-372 L2] 展示副本 upsert(Rust 同步入口专用;整行覆写,含三列安全态)。
  writeMirror(mirror: ActivationSecurityMirror): Promise<void>;
  clear(): Promise<void>;
}

export interface ActivationCheck {
  status: ActivationStatus;
  // 放行 = active | grace。
  allowed: boolean;
  // 到期 ISO(展示用)。
  expiresAt: string | null;
  // 错误/状态可读消息(inactive/expired 时给激活界面展示)。
  message: string;
}

export interface ActivateOutcome {
  ok: boolean;
  status: ActivationStatus;
  message: string;
  expiresAt: string | null;
}

// T-167 设置页「激活状态」面板 —— 本地读态(**不打网络**,纯展示用)。
// 缺激活态 → status="inactive"、其余 null;有态则据本地过期 + 离线宽限判 status。
export interface ActivationStatusView {
  status: ActivationStatus;
  machineId: string | null;
  licenseMode: string | null;
  expiresAt: string | null; // ISO;null = 永久
  activatedAt: string | null;
  lastOnlineCheckAt: string | null;
  // ── [T-372 L3] 安全门展示副本三列透传(Rust 壳经 syncFromShell 同步来的) ────────
  /** 防回拨 last-seen(ISO;展示用)。缺省 null = Rust 侧尚未同步过。 */
  lastSeenAt: string | null;
  /** 服务端按码型下发的离线宽限秒数(内测 86400 / 买断 2592000);null = 未同步。 */
  graceSeconds: number | null;
  /** 签名撤销标记(买断:revoked=true → 设置页更新入口旁提示停更新,不锁功能)。 */
  revoked: boolean;
}

export interface ActivationServiceDeps {
  repo: ActivationRepository;
  license: LicenseClient;
  machineId: string;
  projectKey: string;
  graceDays: number;
  now: () => Date;
}

function isLocallyExpired(expiresAt: string | null, now: Date): boolean {
  if (!expiresAt) return false; // null = 永久
  const t = Date.parse(expiresAt);
  if (Number.isNaN(t)) return false; // 脏值不当过期(宽松,避免误锁)
  return t <= now.getTime();
}

function withinGrace(
  lastOnlineCheckAt: string,
  graceDays: number,
  now: Date,
): boolean {
  const t = Date.parse(lastOnlineCheckAt);
  if (Number.isNaN(t)) return false;
  const elapsedMs = now.getTime() - t;
  return elapsedMs <= graceDays * 24 * 60 * 60 * 1000;
}

// T-167 —— 纯本地态判定(**不联网**),供设置页 getStatus() 复用 check() 里的到期 + 宽限逻辑:
//   - [T-372 L3] 买断(expiresAt=null)→ 恒 active:fail-open,离线/久未在线校**绝不降级展示**
//     (SPEC §8「连不上网 ≠ 撤销」;撤销态由 revoked 列单独承载,提示挂更新入口旁,不改状态徽章)。
//   - 内测已过期(expiresAt ≤ now)→ expired。
//   - 内测未过期 + 距上次在线校 ≤ 宽限窗 → active;超窗 → grace(展示离线宽限中,等在线校收敛)。
//     宽限窗优先用 Rust 同步来的码型 graceSeconds(内测 86400s),缺省退回 graceDays 旧配置。
// 注:这是纯本地判定,不真联网;真正的放行权威在 Rust `.license`(activation-gate 读它)。
export function deriveLocalStatus(
  stored: StoredActivation,
  graceDays: number,
  now: Date,
): ActivationStatus {
  if (stored.expiresAt === null) return "active"; // 买断 fail-open(L3 码型分支)
  if (isLocallyExpired(stored.expiresAt, now)) return "expired";
  const graceDaysEffective =
    stored.graceSeconds != null && stored.graceSeconds > 0
      ? stored.graceSeconds / 86_400
      : graceDays;
  if (withinGrace(stored.lastOnlineCheckAt, graceDaysEffective, now)) {
    return "active";
  }
  return "grace";
}

export function createActivationService(deps: ActivationServiceDeps) {
  const { repo, license, machineId, projectKey, graceDays, now } = deps;

  // 首次激活:输码 → 调 activate → TIME 成功则加密存激活态。
  async function activate(code: string): Promise<ActivateOutcome> {
    const trimmed = code.trim();
    if (!trimmed) {
      return {
        ok: false,
        status: "inactive",
        message: "请输入激活码",
        expiresAt: null,
      };
    }
    const result: LicenseCheckResult = await license.activate({
      code: trimmed,
      machineId,
      projectKey,
    });
    if (!result.success || !result.valid) {
      return {
        ok: false,
        status: result.networkError ? "inactive" : "expired",
        // 网络错时给友好提示;否则透传服务端 message(过期/被他机用/码不存在)。
        message: result.networkError
          ? result.message || "无法连接授权服务,请检查网络后重试"
          : result.message || "激活失败",
        expiresAt: result.expiresAt,
      };
    }
    const nowIso = now().toISOString();
    await repo.write({
      machineId,
      code: trimmed,
      licenseMode: result.licenseMode ?? "TIME",
      projectKey,
      expiresAt: result.expiresAt,
      activatedAt: nowIso,
      lastOnlineCheckAt: nowIso,
    });
    return {
      ok: true,
      status: "active",
      message: "激活成功",
      expiresAt: result.expiresAt,
    };
  }

  // 启动/门控复校:读本地态 → 本地过期判定 → 在线 status(网络失败走宽限)。
  async function check(): Promise<ActivationCheck> {
    const stored = await repo.read();
    if (!stored) {
      return {
        status: "inactive",
        allowed: false,
        expiresAt: null,
        message: "尚未激活",
      };
    }
    const clock = now();

    // 本地已过期 → 直接 expired(不必联网)。
    if (isLocallyExpired(stored.expiresAt, clock)) {
      return {
        status: "expired",
        allowed: false,
        expiresAt: stored.expiresAt,
        message: "授权已过期,请重新激活",
      };
    }

    // 在线复校 status。
    const result = await license.status({
      code: stored.code,
      machineId: stored.machineId,
      projectKey: stored.projectKey,
    });

    if (result.networkError) {
      // 联网失败 → 离线宽限:本地未过期(上面已判)且距上次在线校 ≤ graceDays → 放行。
      if (withinGrace(stored.lastOnlineCheckAt, graceDays, clock)) {
        return {
          status: "grace",
          allowed: true,
          expiresAt: stored.expiresAt,
          message: "离线宽限期内(暂无法连接授权服务)",
        };
      }
      return {
        status: "expired",
        allowed: false,
        expiresAt: stored.expiresAt,
        message: "离线宽限期已过,请联网重新校验授权",
      };
    }

    // 在线成功:valid=true → active(刷新 expiresAt + lastOnlineCheckAt);valid=false → expired。
    if (result.success && result.valid) {
      const nowIso = clock.toISOString();
      await repo.write({
        ...stored,
        expiresAt: result.expiresAt ?? stored.expiresAt,
        lastOnlineCheckAt: nowIso,
      });
      return {
        status: "active",
        allowed: true,
        expiresAt: result.expiresAt ?? stored.expiresAt,
        message: "已激活",
      };
    }

    return {
      status: "expired",
      allowed: false,
      expiresAt: result.expiresAt ?? stored.expiresAt,
      message: result.message || "授权无效,请重新激活",
    };
  }

  // T-167 设置页展示用:本地读态(**不打网络**)。读 repo 的 StoredActivation,用注入的
  // now/graceDays 本地计算 status(复用 deriveLocalStatus,与 check() 同一到期/宽限判定)。
  // 缺激活态 → status="inactive"、其余 null。绝不触发在线校验(与 check() 的关键差异)。
  async function getStatus(): Promise<ActivationStatusView> {
    const stored = await repo.read();
    if (!stored) {
      return {
        status: "inactive",
        machineId: null,
        licenseMode: null,
        expiresAt: null,
        activatedAt: null,
        lastOnlineCheckAt: null,
        lastSeenAt: null,
        graceSeconds: null,
        revoked: false,
      };
    }
    return {
      status: deriveLocalStatus(stored, graceDays, now()),
      machineId: stored.machineId,
      licenseMode: stored.licenseMode,
      expiresAt: stored.expiresAt,
      activatedAt: stored.activatedAt,
      lastOnlineCheckAt: stored.lastOnlineCheckAt,
      // [T-372 L3] 三列展示副本(Rust syncFromShell 同步;老库/未同步 → null/false 诚实缺省)。
      lastSeenAt: stored.lastSeenAt ?? null,
      graceSeconds: stored.graceSeconds ?? null,
      revoked: stored.revoked === true,
    };
  }

  // [T-372 L2] BR-01 窄同步入口:Rust 壳放行判定后,经 /api/v1/local/license-sync 调这里,
  // 把安全态展示副本(last_seen_at/grace_seconds/revoked + 领域字段)落进 activation_state。
  // 表的写者仍是 sidecar backend(本方法);Rust 绝不跨模块直改表。放行判定不读本表。
  async function syncFromShell(mirror: ActivationSecurityMirror): Promise<void> {
    await repo.writeMirror(mirror);
  }

  return { activate, check, getStatus, syncFromShell };
}

export type ActivationService = ReturnType<typeof createActivationService>;
