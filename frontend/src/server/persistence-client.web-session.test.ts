/**
 * [B-01] Web Session Vault 路径穿越纵深防御 —— **真实代码路径**集成测(非复制逻辑):
 * 走 getWebSessionRuntime()(完整 persistence bundle)+ 真实文件系统(临时目录),证明:
 *   · 防御①②(解析处 webAuthDirFor:白名单 + containment)——攻击 domain 在 sessionStatus/
 *     removeSession 处被拒,**不触碰文件系统**(基目录外的哨兵完好)。
 *   · 防御③(删除处 removeSession:realpath 复查)——`.auth/web/<domain>` 是指向基目录外的
 *     symlink 时拒删(防 symlink 逃逸),受害目录完好。
 *   · 合法 hostname 正常删除(不误伤正向路径)。
 *   · listSessions 跳过磁盘上的不合规目录名(读操作宽容,不炸列表)。
 *
 * 注意:CREATOROS_WEB_AUTH_DIR 必须在**首次** getWebSessionRuntime()(触发 buildPersistence)
 * 之前设好 —— bundle 是进程级单例,故本文件在 import 后、任何 runtime 调用前设置 env。
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, mkdir, writeFile, symlink, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import nodePath from "node:path";
import {
  getWebSessionRuntime,
  __resetPersistenceForTests,
} from "@/server/persistence-client";
import type { RequestContext } from "@creatoros/contract";

// [T-370a] runtime 各操作带 ctx(登录态真值迁 browser_sessions 加密表,user 级 stamp)。
// 本文件只验路径穿越防线(文件系统侧),ctx 用固定测试用户即可。
const ctx: RequestContext = {
  userId: "user-b01",
  requestId: "r-b01",
  source: "user",
  accountId: null,
};

let root: string; // 临时根:root/web = 保管库基目录;root/victim = 库外受害哨兵
let base: string;
let victim: string;
let runtime: Awaited<ReturnType<typeof getWebSessionRuntime>>;

async function exists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

beforeAll(async () => {
  root = await mkdtemp(nodePath.join(tmpdir(), "creatoros-websession-b01-"));
  base = nodePath.join(root, "web");
  victim = nodePath.join(root, "victim");
  await mkdir(base, { recursive: true });
  await mkdir(victim, { recursive: true });
  await writeFile(nodePath.join(victim, "master-key.txt"), "sentinel");
  // 基目录外的哨兵文件(模拟 <appData> 同级的 master key / db):任何攻击都不得动它。
  await writeFile(nodePath.join(root, "app-data-sentinel.txt"), "sentinel");

  process.env.CREATOROS_WEB_AUTH_DIR = base;
  __resetPersistenceForTests(); // 丢掉其它测试文件可能建过的单例,确保本 env 生效
  runtime = await getWebSessionRuntime();
});

afterAll(async () => {
  delete process.env.CREATOROS_WEB_AUTH_DIR;
  __resetPersistenceForTests();
  await rm(root, { recursive: true, force: true });
});

describe("removeSession —— 路径穿越攻击一律拒删(防御①②,解析+删除两处)", () => {
  const attacks = [
    "../..", //          经典上跳(PoC:从 .auth/web 回到 <appData>)
    "../../..",
    "..", //             单级上跳
    "..\\..\\", //       Windows 风格
    "....//", //         过滤器绕过尝试
    "%2e%2e%2f", //      编码 ../
    "/", //              根
    "/etc", //           绝对路径
    "c:", //             盘符
    "a/../../b", //      夹带上跳
  ];

  for (const a of attacks) {
    it(`拒删并不触碰文件系统: ${JSON.stringify(a)}`, async () => {
      const res = await runtime.removeSession(ctx, a);
      expect(res).toEqual({ removed: false });
      // 库外哨兵完好 = 未发生任何越界删除。
      expect(await exists(nodePath.join(victim, "master-key.txt"))).toBe(true);
      expect(await exists(nodePath.join(root, "app-data-sentinel.txt"))).toBe(true);
      expect(await exists(base)).toBe(true);
    });
  }
});

describe("removeSession —— symlink 逃逸拒删(防御③,realpath 复查)", () => {
  it(".auth/web/<domain> 是指向库外目录的软链 → 拒删,受害目录完好", async () => {
    // evil.com 通过白名单(合法 hostname)、containment 也过(base/evil.com 在库内),
    // 但真实路径指向库外 victim —— 只有 realpath 复查能挡住。
    await symlink(victim, nodePath.join(base, "evil.com"), "dir");
    const res = await runtime.removeSession(ctx, "evil.com");
    expect(res).toEqual({ removed: false });
    expect(await exists(nodePath.join(victim, "master-key.txt"))).toBe(true);
    // 软链本体也未被动(保守:整个操作拒绝,不做部分清理)。
    expect(await exists(nodePath.join(base, "evil.com"))).toBe(true);
  });
});

describe("removeSession —— 正向路径不误伤", () => {
  it("合法 hostname + 目录存在 → 真删除,removed:true", async () => {
    const dir = nodePath.join(base, "chatgpt.com");
    await mkdir(dir, { recursive: true });
    await writeFile(nodePath.join(dir, "state.json"), "{}");
    const res = await runtime.removeSession(ctx, "chatgpt.com");
    expect(res).toEqual({ removed: true });
    expect(await exists(dir)).toBe(false);
    // 只删该域,库外哨兵完好。
    expect(await exists(nodePath.join(root, "app-data-sentinel.txt"))).toBe(true);
  });

  it("合法 hostname 但从未登录过(目录不存在)→ 诚实 removed:false", async () => {
    const res = await runtime.removeSession(ctx, "never-logged-in.example.org");
    expect(res).toEqual({ removed: false });
  });

  it("www. 前缀归一后删除(www.zhihu.com → zhihu.com)", async () => {
    const dir = nodePath.join(base, "zhihu.com");
    await mkdir(dir, { recursive: true });
    const res = await runtime.removeSession(ctx, "www.zhihu.com");
    expect(res).toEqual({ removed: true });
    expect(await exists(dir)).toBe(false);
  });
});

describe("sessionStatus —— 解析处同样设防(webAuthDirFor 白名单硬拒,不起浏览器不碰 FS)", () => {
  for (const a of ["../..", "%2e%2e%2f", "/etc/passwd", "..\\..\\"]) {
    it(`拒绝: ${JSON.stringify(a)}(抛 WebDomainError)`, async () => {
      await expect(runtime.sessionStatus(ctx, a)).rejects.toMatchObject({
        code: "WebDomainError",
      });
    });
  }
});

describe("listSessions —— 磁盘遗留的不合规目录名跳过(读操作宽容)", () => {
  it("只列合法 hostname 目录,不合规名不炸列表", async () => {
    await mkdir(nodePath.join(base, "example.org"), { recursive: true });
    await mkdir(nodePath.join(base, "bad..name"), { recursive: true }); // 不合规(含 ..)
    const out = await runtime.listSessions(ctx);
    const domains = out.map((s) => s.domain);
    expect(domains).toContain("example.org");
    expect(domains).not.toContain("bad..name");
  });
});
