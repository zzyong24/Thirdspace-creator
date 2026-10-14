import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "./route";
import { RESET_CONFIRM_WORD, RESET_PENDING_MARKER } from "./plan";

// [T-332 S5] reset-workspace route 级单测 —— 打真 POST handler,验三重防护 + 落标记副作用:
//   ① 非桌面 → {desktop:false}(不写任何文件);
//   ② 非 loopback Host / Host 缺失 → 403(fail closed);
//   ③ 确认词错 / body 非 JSON → 400;
//   ④ 全对 → 200 {ok,pending} + reset-pending.json 真实落到 appDataDir 顶层;
//   ⑤ 桌面态但 CREATOROS_DB_DIR 未注入 → 500(诚实报错,不猜路径)。
// env 用 vi.stubEnv 注入(route 在请求期读 process.env,可逐用例控制)。

/** 造请求:默认 loopback Host + 合法 JSON body,逐用例覆写。 */
function makeReq(init?: {
  host?: string | null;
  body?: string;
}): Request {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  // host: undefined → 默认回环;null → 显式不带 Host 头。
  if (init?.host !== null) {
    headers.host = init?.host ?? "127.0.0.1:41730";
  }
  return new Request("http://127.0.0.1:41730/api/v1/local/reset-workspace", {
    method: "POST",
    headers,
    body: init?.body ?? JSON.stringify({ confirm: RESET_CONFIRM_WORD }),
  });
}

describe("POST /api/v1/local/reset-workspace", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "reset-ws-route-"));
    vi.stubEnv("CREATOROS_DESKTOP", "1");
    vi.stubEnv("CREATOROS_DB_DIR", path.join(tmp, "db"));
    vi.stubEnv("CREATOROS_APP_DATA_DIR", "");
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await fs.rm(tmp, { recursive: true, force: true });
  });

  /** 标记文件是否已落盘(appDataDir 顶层 = CREATOROS_DB_DIR 的父级 = tmp)。 */
  async function markerExists(): Promise<boolean> {
    return fs
      .access(path.join(tmp, RESET_PENDING_MARKER))
      .then(() => true)
      .catch(() => false);
  }

  it("非桌面(web 部署)→ {ok:false, desktop:false},不写任何文件", async () => {
    vi.stubEnv("CREATOROS_DESKTOP", "");
    const res = await POST(makeReq());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: false, desktop: false });
    expect(await markerExists()).toBe(false);
  });

  it("非 loopback Host → 403,标记不落", async () => {
    const res = await POST(makeReq({ host: "evil.example.com" }));
    expect(res.status).toBe(403);
    expect(await markerExists()).toBe(false);
  });

  it("Host 缺失 → 403(fail closed)", async () => {
    const res = await POST(makeReq({ host: null }));
    expect(res.status).toBe(403);
    expect(await markerExists()).toBe(false);
  });

  it("确认词错 → 400 + 可读文案,标记不落", async () => {
    const res = await POST(
      makeReq({ body: JSON.stringify({ confirm: "确认" }) }),
    );
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toContain(RESET_CONFIRM_WORD);
    expect(await markerExists()).toBe(false);
  });

  it("body 非 JSON → 400", async () => {
    const res = await POST(makeReq({ body: "not-json{" }));
    expect(res.status).toBe(400);
    expect(await markerExists()).toBe(false);
  });

  it("全对 → 200 {ok,pending} + reset-pending.json 真实落盘(内容含请求时间)", async () => {
    const res = await POST(makeReq());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, pending: true });

    const raw = await fs.readFile(
      path.join(tmp, RESET_PENDING_MARKER),
      "utf8",
    );
    const marker = JSON.parse(raw) as {
      requestedAt: string;
      source: string;
    };
    expect(marker.source).toBe("settings/reset-workspace");
    expect(Number.isNaN(Date.parse(marker.requestedAt))).toBe(false);
  });

  it("确认词带前后空白 → 容忍通过(输入框提交常带空格)", async () => {
    const res = await POST(
      makeReq({ body: JSON.stringify({ confirm: `  ${RESET_CONFIRM_WORD} ` }) }),
    );
    expect(res.status).toBe(200);
    expect(await markerExists()).toBe(true);
  });

  it("重复请求 → 幂等覆盖写,仍 200", async () => {
    expect((await POST(makeReq())).status).toBe(200);
    expect((await POST(makeReq())).status).toBe(200);
    expect(await markerExists()).toBe(true);
  });

  it("新壳 APP_DATA_DIR 优先，标记只写本例指定根", async () => {
    const appRoot = path.join(tmp, "app");
    await fs.mkdir(appRoot);
    vi.stubEnv("CREATOROS_APP_DATA_DIR", appRoot);
    expect((await POST(makeReq())).status).toBe(200);
    expect(JSON.parse(await fs.readFile(path.join(appRoot, RESET_PENDING_MARKER), "utf8"))).toMatchObject({ source: "settings/reset-workspace" });
    expect(await markerExists()).toBe(false);
  });

  it("桌面态但 CREATOROS_DB_DIR 未注入 → 500(不猜路径)", async () => {
    vi.stubEnv("CREATOROS_DB_DIR", "");
    const res = await POST(makeReq());
    expect(res.status).toBe(500);
  });
});
