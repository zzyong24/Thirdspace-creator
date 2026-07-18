import { describe, it, expect, vi } from "vitest";
import {
  createActivationService,
  type ActivationRepository,
  type StoredActivation,
} from "./activation-service";
import type { LicenseClient, LicenseCheckResult } from "./license-client";

// T-147 P5 —— 激活状态机单测。license 客户端 + repo 全注 fake,**零网络零 db**。
// 覆盖:inactive/active/grace/expired 全转移 + 离线宽限窗内放行/超窗拒 + 本地过期直接 expired +
//   在线 valid=false→expired + 激活成功写库 + 激活失败(网络/过期/被他机用)+ 空码。

function makeRepo(initial: StoredActivation | null = null): {
  repo: ActivationRepository;
  state: { value: StoredActivation | null };
} {
  const state = { value: initial };
  const repo: ActivationRepository = {
    read: async () => state.value,
    write: async (s) => {
      state.value = s;
    },
    // [T-372 L2] 展示副本 upsert(Rust 同步入口;fake 直接整行覆写)。
    writeMirror: async (m) => {
      state.value = { ...m };
    },
    clear: async () => {
      state.value = null;
    },
  };
  return { repo, state };
}

function okResult(over: Partial<LicenseCheckResult> = {}): LicenseCheckResult {
  return {
    success: true,
    valid: true,
    expiresAt: "2027-07-06T00:00:00.000Z",
    licenseMode: "TIME",
    isActivated: true,
    message: "ok",
    httpStatus: 200,
    networkError: false,
    ...over,
  };
}

function makeLicense(over: Partial<LicenseClient> = {}): LicenseClient {
  return {
    activate: vi.fn(async () => okResult()),
    status: vi.fn(async () => okResult()),
    ...over,
  };
}

const BASE = {
  machineId: "M-fixture",
  projectKey: "test",
  graceDays: 7,
};

function storedFixture(over: Partial<StoredActivation> = {}): StoredActivation {
  return {
    machineId: "M-fixture",
    code: "SECRET-CODE",
    licenseMode: "TIME",
    projectKey: "test",
    expiresAt: "2027-07-06T00:00:00.000Z",
    activatedAt: "2026-07-06T00:00:00.000Z",
    lastOnlineCheckAt: "2026-07-06T00:00:00.000Z",
    ...over,
  };
}

describe("activation state machine — activate", () => {
  it("空码 → 不调服务,提示输码", async () => {
    const { repo } = makeRepo();
    const license = makeLicense();
    const svc = createActivationService({
      repo,
      license,
      ...BASE,
      now: () => new Date("2026-07-06T00:00:00Z"),
    });
    const out = await svc.activate("   ");
    expect(out.ok).toBe(false);
    expect(license.activate).not.toHaveBeenCalled();
  });

  it("激活成功 → 写加密激活态 + status=active", async () => {
    const { repo, state } = makeRepo();
    const license = makeLicense({
      activate: vi.fn(async () =>
        okResult({ expiresAt: "2027-12-31T00:00:00.000Z" }),
      ),
    });
    const svc = createActivationService({
      repo,
      license,
      ...BASE,
      now: () => new Date("2026-07-06T10:00:00Z"),
    });
    const out = await svc.activate("MY-CODE");
    expect(out.ok).toBe(true);
    expect(out.status).toBe("active");
    // 状态机把明文 code 交给 repo(加密由 repo 实现层做,见 repository 测试)。
    expect(state.value).toMatchObject({
      code: "MY-CODE",
      machineId: "M-fixture",
      projectKey: "test",
      expiresAt: "2027-12-31T00:00:00.000Z",
      activatedAt: "2026-07-06T10:00:00.000Z",
      lastOnlineCheckAt: "2026-07-06T10:00:00.000Z",
    });
    // activate 带正确 machineId + projectKey。
    expect(license.activate).toHaveBeenCalledWith({
      code: "MY-CODE",
      machineId: "M-fixture",
      projectKey: "test",
    });
  });

  it("激活失败(已过期,非网络)→ status=expired + 透传服务端 message,不写库", async () => {
    const { repo, state } = makeRepo();
    const license = makeLicense({
      activate: vi.fn(async () =>
        okResult({ success: false, valid: false, message: "激活码已过期" }),
      ),
    });
    const svc = createActivationService({
      repo,
      license,
      ...BASE,
      now: () => new Date("2026-07-06T00:00:00Z"),
    });
    const out = await svc.activate("BAD");
    expect(out.ok).toBe(false);
    expect(out.status).toBe("expired");
    expect(out.message).toBe("激活码已过期");
    expect(state.value).toBeNull();
  });

  it("激活时网络不可达 → status=inactive(可重试),不写库", async () => {
    const { repo, state } = makeRepo();
    const license = makeLicense({
      activate: vi.fn(async () =>
        okResult({
          success: false,
          valid: false,
          networkError: true,
          message: "无法连接授权服务",
        }),
      ),
    });
    const svc = createActivationService({
      repo,
      license,
      ...BASE,
      now: () => new Date("2026-07-06T00:00:00Z"),
    });
    const out = await svc.activate("CODE");
    expect(out.status).toBe("inactive");
    expect(state.value).toBeNull();
  });
});

describe("activation state machine — check", () => {
  it("无本地态 → inactive(不放行)", async () => {
    const { repo } = makeRepo(null);
    const svc = createActivationService({
      repo,
      license: makeLicense(),
      ...BASE,
      now: () => new Date("2026-07-06T00:00:00Z"),
    });
    const r = await svc.check();
    expect(r.status).toBe("inactive");
    expect(r.allowed).toBe(false);
  });

  it("本地已过期 → expired(不必联网)", async () => {
    const { repo } = makeRepo(
      storedFixture({ expiresAt: "2026-01-01T00:00:00.000Z" }),
    );
    const license = makeLicense();
    const svc = createActivationService({
      repo,
      license,
      ...BASE,
      now: () => new Date("2026-07-06T00:00:00Z"),
    });
    const r = await svc.check();
    expect(r.status).toBe("expired");
    expect(r.allowed).toBe(false);
    // 本地已过期就短路,不打在线接口。
    expect(license.status).not.toHaveBeenCalled();
  });

  it("在线校 valid → active + 刷新 expiresAt/lastOnlineCheckAt", async () => {
    const { repo, state } = makeRepo(storedFixture());
    const license = makeLicense({
      status: vi.fn(async () =>
        okResult({ expiresAt: "2028-01-01T00:00:00.000Z" }),
      ),
    });
    const svc = createActivationService({
      repo,
      license,
      ...BASE,
      now: () => new Date("2026-08-01T00:00:00Z"),
    });
    const r = await svc.check();
    expect(r.status).toBe("active");
    expect(r.allowed).toBe(true);
    expect(state.value?.expiresAt).toBe("2028-01-01T00:00:00.000Z");
    expect(state.value?.lastOnlineCheckAt).toBe("2026-08-01T00:00:00.000Z");
  });

  it("在线校 valid=false(吊销/服务端判过期)→ expired", async () => {
    const { repo } = makeRepo(storedFixture());
    const license = makeLicense({
      status: vi.fn(async () =>
        okResult({ success: true, valid: false, message: "授权无效" }),
      ),
    });
    const svc = createActivationService({
      repo,
      license,
      ...BASE,
      now: () => new Date("2026-08-01T00:00:00Z"),
    });
    const r = await svc.check();
    expect(r.status).toBe("expired");
    expect(r.allowed).toBe(false);
  });

  it("离线宽限窗内(距上次在线校 ≤ graceDays)→ grace 放行", async () => {
    const { repo } = makeRepo(
      storedFixture({ lastOnlineCheckAt: "2026-08-01T00:00:00.000Z" }),
    );
    const license = makeLicense({
      status: vi.fn(async () =>
        okResult({ success: false, valid: false, networkError: true }),
      ),
    });
    const svc = createActivationService({
      repo,
      license,
      ...BASE,
      graceDays: 7,
      // 距上次在线校 3 天(窗内)。
      now: () => new Date("2026-08-04T00:00:00Z"),
    });
    const r = await svc.check();
    expect(r.status).toBe("grace");
    expect(r.allowed).toBe(true);
  });

  it("离线宽限窗已过(距上次在线校 > graceDays)→ expired 拒", async () => {
    const { repo } = makeRepo(
      storedFixture({ lastOnlineCheckAt: "2026-08-01T00:00:00.000Z" }),
    );
    const license = makeLicense({
      status: vi.fn(async () =>
        okResult({ success: false, valid: false, networkError: true }),
      ),
    });
    const svc = createActivationService({
      repo,
      license,
      ...BASE,
      graceDays: 7,
      // 距上次在线校 10 天(超窗)。
      now: () => new Date("2026-08-11T00:00:00Z"),
    });
    const r = await svc.check();
    expect(r.status).toBe("expired");
    expect(r.allowed).toBe(false);
  });

  it("永久卡(expiresAt=null)在线校 valid → active", async () => {
    const { repo } = makeRepo(storedFixture({ expiresAt: null }));
    const license = makeLicense({
      status: vi.fn(async () => okResult({ expiresAt: null })),
    });
    const svc = createActivationService({
      repo,
      license,
      ...BASE,
      now: () => new Date("2030-01-01T00:00:00Z"),
    });
    const r = await svc.check();
    expect(r.status).toBe("active");
    expect(r.allowed).toBe(true);
  });
});

// T-167 设置页「激活状态」面板 —— getStatus() 本地读态(**零网络**:license.status 绝不被调)。
// 覆盖:未激活→inactive(其余 null);永久卡(expiresAt=null)未过期→active;已过期→expired;
//   宽限窗内→active;超宽限窗→grace;并断言透传 machineId/licenseMode/activatedAt/lastOnlineCheckAt。
describe("activation state machine — getStatus (local, no network)", () => {
  it("未激活 → inactive,其余字段 null", async () => {
    const { repo } = makeRepo(null);
    const license = makeLicense();
    const svc = createActivationService({
      repo,
      license,
      ...BASE,
      now: () => new Date("2026-07-06T00:00:00Z"),
    });
    const v = await svc.getStatus();
    expect(v).toEqual({
      status: "inactive",
      machineId: null,
      licenseMode: null,
      expiresAt: null,
      activatedAt: null,
      lastOnlineCheckAt: null,
      // [T-372 L3] 展示副本三列:未激活一并诚实缺省。
      lastSeenAt: null,
      graceSeconds: null,
      revoked: false,
    });
    // 纯本地读:绝不打在线接口。
    expect(license.status).not.toHaveBeenCalled();
  });

  it("永久卡(expiresAt=null,近期在线校过)→ active + 透传机器码/授权类型/时间戳", async () => {
    const { repo } = makeRepo(
      storedFixture({
        expiresAt: null,
        licenseMode: "PERMANENT",
        // 近期在线校过(窗内)→ active。永久卡到期永不触发,新鲜度看 lastOnlineCheckAt。
        lastOnlineCheckAt: "2029-12-30T00:00:00.000Z",
      }),
    );
    const license = makeLicense();
    const svc = createActivationService({
      repo,
      license,
      ...BASE,
      graceDays: 7,
      now: () => new Date("2030-01-01T00:00:00Z"),
    });
    const v = await svc.getStatus();
    expect(v.status).toBe("active");
    expect(v.machineId).toBe("M-fixture");
    expect(v.licenseMode).toBe("PERMANENT");
    expect(v.expiresAt).toBeNull();
    expect(v.activatedAt).toBe("2026-07-06T00:00:00.000Z");
    expect(v.lastOnlineCheckAt).toBe("2029-12-30T00:00:00.000Z");
    expect(license.status).not.toHaveBeenCalled();
  });

  it("本地已过期 → expired", async () => {
    const { repo } = makeRepo(
      storedFixture({ expiresAt: "2026-01-01T00:00:00.000Z" }),
    );
    const license = makeLicense();
    const svc = createActivationService({
      repo,
      license,
      ...BASE,
      now: () => new Date("2026-07-06T00:00:00Z"),
    });
    const v = await svc.getStatus();
    expect(v.status).toBe("expired");
    expect(v.expiresAt).toBe("2026-01-01T00:00:00.000Z");
    expect(license.status).not.toHaveBeenCalled();
  });

  it("未过期 + 宽限窗内(距上次在线校 ≤ graceDays)→ active", async () => {
    const { repo } = makeRepo(
      storedFixture({
        expiresAt: "2027-07-06T00:00:00.000Z",
        lastOnlineCheckAt: "2026-08-01T00:00:00.000Z",
      }),
    );
    const license = makeLicense();
    const svc = createActivationService({
      repo,
      license,
      ...BASE,
      graceDays: 7,
      // 距上次在线校 3 天(窗内)。
      now: () => new Date("2026-08-04T00:00:00Z"),
    });
    const v = await svc.getStatus();
    expect(v.status).toBe("active");
    expect(license.status).not.toHaveBeenCalled();
  });

  it("未过期 + 超宽限窗(距上次在线校 > graceDays)→ grace(待一次在线校收敛)", async () => {
    const { repo } = makeRepo(
      storedFixture({
        expiresAt: "2027-07-06T00:00:00.000Z",
        lastOnlineCheckAt: "2026-08-01T00:00:00.000Z",
      }),
    );
    const license = makeLicense();
    const svc = createActivationService({
      repo,
      license,
      ...BASE,
      graceDays: 7,
      // 距上次在线校 10 天(超窗)——本地未过期,展示为离线宽限中。
      now: () => new Date("2026-08-11T00:00:00Z"),
    });
    const v = await svc.getStatus();
    expect(v.status).toBe("grace");
    expect(license.status).not.toHaveBeenCalled();
  });

  // ── [T-372 L3] 码型分支(SPEC §8 对照表)────────────────────────────────────
  it("[L3] 买断(expiresAt=null)超宽限窗仍 active:fail-open 绝不因离线降级展示", async () => {
    const { repo } = makeRepo(
      storedFixture({
        expiresAt: null,
        licenseMode: "TIME",
        // 100 天没在线校过 —— 内测早该 grace/expired,买断照常 active。
        lastOnlineCheckAt: "2026-04-01T00:00:00.000Z",
        graceSeconds: 2_592_000,
      }),
    );
    const license = makeLicense();
    const svc = createActivationService({
      repo,
      license,
      ...BASE,
      graceDays: 7,
      now: () => new Date("2026-07-10T00:00:00Z"),
    });
    const v = await svc.getStatus();
    expect(v.status).toBe("active");
    expect(v.graceSeconds).toBe(2_592_000);
    expect(license.status).not.toHaveBeenCalled();
  });

  it("[L3] 内测宽限窗优先用码型 graceSeconds(86400s),而非旧 graceDays 配置", async () => {
    const { repo } = makeRepo(
      storedFixture({
        expiresAt: "2027-07-06T00:00:00.000Z",
        lastOnlineCheckAt: "2026-08-01T00:00:00.000Z",
        graceSeconds: 86_400, // 内测 24h 窗
      }),
    );
    const license = makeLicense();
    const svc = createActivationService({
      repo,
      license,
      ...BASE,
      graceDays: 7, // 旧配置 7 天 —— 若被误用,2 天前的在线校仍算窗内
      now: () => new Date("2026-08-03T00:00:00Z"), // 距上次在线校 2 天 > 24h
    });
    const v = await svc.getStatus();
    expect(v.status).toBe("grace");
  });

  it("[L3] 展示副本三列(lastSeenAt/graceSeconds/revoked)经 getStatus 透传", async () => {
    const { repo } = makeRepo(
      storedFixture({
        expiresAt: null,
        lastSeenAt: "2026-07-16T00:00:00.000Z",
        graceSeconds: 2_592_000,
        revoked: true, // 买断撤销:状态仍 active(不锁功能),revoked 供更新入口旁提示
      }),
    );
    const license = makeLicense();
    const svc = createActivationService({
      repo,
      license,
      ...BASE,
      now: () => new Date("2026-07-17T00:00:00Z"),
    });
    const v = await svc.getStatus();
    expect(v.status).toBe("active");
    expect(v.lastSeenAt).toBe("2026-07-16T00:00:00.000Z");
    expect(v.graceSeconds).toBe(2_592_000);
    expect(v.revoked).toBe(true);
  });
});

// ── [T-372 L2] Rust 壳同步入口(BR-01 窄通道)────────────────────────────────
describe("activation service — syncFromShell", () => {
  it("把 Rust 展示副本经 repo.writeMirror 落库(不触发任何在线校验)", async () => {
    const { repo, state } = makeRepo();
    const license = makeLicense();
    const svc = createActivationService({
      repo,
      license,
      ...BASE,
      now: () => new Date("2026-07-17T12:00:00Z"),
    });
    await svc.syncFromShell({
      machineId: "M-fixture",
      code: "SHELL-CODE",
      licenseMode: "TIME",
      projectKey: "test",
      expiresAt: "2026-07-20T12:00:00Z",
      activatedAt: "2026-07-17T12:00:00Z",
      lastOnlineCheckAt: "2026-07-17T12:00:00Z",
      lastSeenAt: "2026-07-17T12:00:00Z",
      graceSeconds: 86400,
      revoked: false,
    });
    expect(state.value?.code).toBe("SHELL-CODE");
    expect(state.value?.lastSeenAt).toBe("2026-07-17T12:00:00Z");
    expect(state.value?.graceSeconds).toBe(86400);
    // 纯落库通道:绝不打网络(activate/status 都不该被触发)。
    expect(license.activate).not.toHaveBeenCalled();
    expect(license.status).not.toHaveBeenCalled();
  });
});
