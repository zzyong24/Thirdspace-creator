// @vitest-environment node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, posix, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import * as ts from "typescript";
import { NextResponse } from "next/server";
import { expect, it, vi } from "vitest";

const FROZEN = "a9d06c01a8f3bff6f4323c438b6d569753675f2c";
const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../../..");
const frozen = (path: string) => execFileSync("git", ["show", `${FROZEN}:${path}`], { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const digest = (source: string) => createHash("sha256").update(source).digest("hex");
const anchors: Record<string, string> = {
  "frontend/src/app/api/v1/dispatch/route.ts": "74df203e8f088089ef589663a0111cb59280bcf65fd92cc53fb4c84e3e214884",
  "contract/src/endpoints.ts": "00576695621cbb3d172b00dbeca8cd49f3bcb4dab1580c2fa1c1a9f1581e0626",
  "contract/src/operations/execution.ts": "7385ff330e0b39b12e92e54151fe84403bf3ba933cc7a4766ef3459763adac5c",
  "contract/src/cli-policy.ts": "2f480b37490db988bb2a809061010dd10cd90b422adf4c4eb6b078843aa634d4",
};
function fixture() {
  // 新source/registry不能伪造旧peer；锁文件必须仍匹配旧freeze，依赖变化另准。
  expect(digest(readFileSync(join(repo, "pnpm-lock.yaml"), "utf8"))).toBe(digest(frozen("pnpm-lock.yaml")));
  for (const [path, hash] of Object.entries(anchors)) expect(digest(frozen(path))).toBe(hash);
  const tree = new Set(execFileSync("git", ["ls-tree", "-r", "--name-only", FROZEN, "contract/src", "frontend/src/app/api/v1/dispatch/route.ts", "frontend/src/lib/loopback-core.ts"], { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim().split("\n"));
  const contractRequire = createRequire(join(repo, "contract/package.json"));
  const modules = new Map<string, { exports: Record<string, unknown> }>();
  const env = { CREATOROS_HANDSHAKE_REQUIRED: "1", CREATOROS_SIDECAR_HANDSHAKE_TOKEN: "t217-synthetic-handshake" };
  const forbidden = () => { throw new Error("不得进入真实身份、宿主、DB或CLI路径"); };
  const command = vi.fn(forbidden), composite = vi.fn(() => command()), identity = vi.fn(forbidden), cli = vi.fn(forbidden);
  class AuthenticationError extends Error {} class OwnershipError extends Error {}
  function load(path: string): Record<string, unknown> {
    const cached = modules.get(path); if (cached) return cached.exports;
    if (!tree.has(path)) throw new Error(`未批准的冻结模块路径：${path}`);
    const module = { exports: {} as Record<string, unknown> }; modules.set(path, module);
    const source = frozen(path);
    const localRequire = (specifier: string): unknown => {
      if (specifier === "zod") return contractRequire("zod");
      if (specifier === "next/server") return { NextResponse };
      if (specifier === "node:crypto") return createRequire(import.meta.url)(specifier);
      if (specifier === "node:path") return createRequire(import.meta.url)(specifier);
      if (specifier === "node:fs") return Object.fromEntries(["chmodSync", "readFileSync", "renameSync", "rmSync", "writeFileSync"].map(key => [key, forbidden]));
      if (specifier === "@creatoros/contract") return { ...load("contract/src/endpoints.ts"), ...load("contract/src/envelope.ts"), ...load("contract/src/cli-policy.ts") };
      if (specifier === "@/server/persistence-client") return { compositeTransport: { request: composite }, getCliInvocationService: cli };
      if (specifier === "@creatoros/backend/modules/identity") return { AuthenticationError, OwnershipError };
      if (specifier === "../auth/_session") return { readSessionCookie: vi.fn(() => null) };
      if (specifier === "@/lib/request-context.server") return { resolveRequestContext: identity, isAuthError: () => false, isOwnershipError: () => false };
      if (specifier === "@/lib/loopback-guard.server") return { ...load("frontend/src/lib/loopback-core.ts"), loopbackForbidden: () => NextResponse.json({ error: "forbidden" }, { status: 403 }) };
      if (specifier.startsWith(".") && path.startsWith("contract/src/")) {
        const base = posix.normalize(posix.join(posix.dirname(path), specifier));
        const child = [base + ".ts", base + "/index.ts"].find(candidate => tree.has(candidate));
        if (child) return load(child);
      }
      throw new Error(`未批准的冻结依赖：${specifier}`);
    };
    const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, verbatimModuleSyntax: false } }).outputText;
    const run = runInNewContext(`(function(require,module,exports){${compiled}\n})`, { Buffer, URL, Request, Response, Headers, console, process: { env } }, { filename: `${FROZEN}/${path}` });
    run(localRequire, module, module.exports); return module.exports;
  }
  const contract = load("contract/src/endpoints.ts");
  const endpoints = contract.ENDPOINTS as Record<string, { id: string }>;
  expect(Object.values(endpoints).some(row => row.id === "execution.tasks.transcribeCommand.v1")).toBe(false);
  expect(Object.values(endpoints).some(row => row.id === "execution.tasks.command")).toBe(true);
  const route = load("frontend/src/app/api/v1/dispatch/route.ts");
  return { post: route.POST as (request: Request) => Promise<Response>, command, composite, identity, cli };
}
function request(id: string) {
  return new Request("http://127.0.0.1:8123/api/v1/dispatch", { method: "POST", headers: { "content-type": "application/json", origin: "http://127.0.0.1:8123", "x-creatoros-handshake": "t217-synthetic-handshake" }, body: JSON.stringify({ id, input: { body: { taskIds: ["t217-synthetic-original"], command: "retry", idempotencyKey: "t217-synthetic-intent" } } }) });
}
it("真实冻结旧route/registry对新ID返回404，身份/CLI/composite/command零调用", async () => {
  const f = fixture(); const response = await f.post(request("execution.tasks.transcribeCommand.v1"));
  expect(response.status).toBe(404); expect(await response.json()).toEqual({ error: "unknown operation: execution.tasks.transcribeCommand.v1" });
  expect(f.identity).not.toHaveBeenCalled(); expect(f.cli).not.toHaveBeenCalled(); expect(f.composite).not.toHaveBeenCalled(); expect(f.command).not.toHaveBeenCalled();
});
it("负控制：同冻结旧registry的legacyID确实进入身份端口，不是全请求假404", async () => {
  const f = fixture(); await expect(f.post(request("execution.tasks.command"))).rejects.toThrow("不得进入真实身份、宿主、DB或CLI路径");
  expect(f.identity).toHaveBeenCalledTimes(1); expect(f.cli).not.toHaveBeenCalled(); expect(f.composite).not.toHaveBeenCalled(); expect(f.command).not.toHaveBeenCalled();
});
