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
