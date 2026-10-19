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
const FROZEN_LOCK_SHA = "28f107b75e781e21eed8206d441127b372ea3cc3057c382986f029b301322fc0";
const peerImports = [
  { workspace: "contract", field: "dependencies", name: "zod" },
  { workspace: "frontend", field: "dependencies", name: "next" },
  { workspace: "frontend", field: "devDependencies", name: "typescript" },
] as const;
const scalar = (raw: string) => raw.startsWith("'") && raw.endsWith("'")
  ? raw.slice(1, -1).replaceAll("''", "'") : raw.startsWith('"') ? JSON.parse(raw) as string : raw;

// 只解析 pnpm v9 的映射边界和已解析依赖边；节点正文逐字比较，未知格式不能静默漏边。
function mapRecords(lines: string[], indent: number): Map<string, string> {
  const records = new Map<string, string>();
  let key: string | undefined, body: string[] = [];
  const save = () => {
    if (key === undefined) return;
    if (records.has(key)) throw Error(`重复锁节点：${key}`);
    records.set(key, body.join("\n").replace(/\n+$/, "") + "\n");
  };
  for (const line of lines) {
    if (!line.trim()) { if (key !== undefined) body.push(line); continue; }
    const spaces = line.length - line.trimStart().length;
    if (spaces < indent) continue;
    if (spaces === indent) {
      const header = line.slice(indent).match(/^(.+):(?: \{\})?$/);
      if (!header) throw Error(`未识别锁节点：${line}`);
      save(); key = scalar(header[1]!); body = [line];
    } else {
      if (key === undefined) throw Error(`锁节点正文没有父级：${line}`);
      body.push(line);
    }
  }
  save(); return records;
}
function lockSection(lock: string, name: string) {
  if (!lock.startsWith("lockfileVersion: '9.0'\n")) throw Error("冻结peer只支持已审的pnpm v9格式");
  const lines = lock.split("\n"), start = lines.indexOf(`${name}:`);
  if (start < 0 || lines.lastIndexOf(`${name}:`) !== start) throw Error(`锁section缺失或重复：${name}`);
  const end = lines.findIndex((line, index) => index > start && /^\S/.test(line));
  return mapRecords(lines.slice(start + 1, end < 0 ? undefined : end), 2);
}
function importerVersion(lock: string, entry: (typeof peerImports)[number]) {
  const workspace = lockSection(lock, "importers").get(entry.workspace);
  if (!workspace) throw Error(`缺少冻结importer：${entry.workspace}`);
  const field = mapRecords(workspace.split("\n"), 4).get(entry.field);
  const dependency = field && mapRecords(field.split("\n"), 6).get(entry.name);
  const versions = dependency?.split("\n").filter(line => /^        version: /.test(line)) ?? [];
  if (versions.length !== 1) throw Error(`缺少精确冻结version：${entry.workspace}/${entry.name}`);
  return scalar(versions[0]!.slice("        version: ".length));
}
function dependencyEdges(snapshot: string) {
  const edges: string[] = [];
  let dependencies = false;
  for (const line of snapshot.split("\n").slice(1)) {
    if (!line.trim()) continue;
    const spaces = line.length - line.trimStart().length;
    if (spaces === 4) {
      dependencies = /^    (dependencies|optionalDependencies):$/.test(line);
      if (/^    (dependencies|optionalDependencies):/.test(line) && !dependencies && !line.endsWith(": {}")) throw Error(`未识别依赖映射：${line}`);
      continue;
    }
    if (!dependencies) continue;
    const pair = spaces === 6 && line.slice(6).match(/^(.+?): (.+)$/);
    if (!pair) throw Error(`未识别依赖边：${line}`);
    const name = scalar(pair[1]!), version = scalar(pair[2]!);
    if (/^(link:|file:|https?:)/.test(version)) throw Error(`冻结执行闭包不能隐藏外部引用：${line}`);
    edges.push(version.startsWith("npm:") ? version.slice(4) : `${name}@${version}`);
  }
  return edges;
}
function verifyFrozenPeerLock(current: string, original: string) {
  if (digest(original) !== FROZEN_LOCK_SHA) throw Error("冻结锁原始blob SHA不匹配");
  const oldPackages = lockSection(original, "packages"), currentPackages = lockSection(current, "packages");
  const oldSnapshots = lockSection(original, "snapshots"), currentSnapshots = lockSection(current, "snapshots");
  const pending = peerImports.map(entry => {
    const version = importerVersion(original, entry);
    if (importerVersion(current, entry) !== version) throw Error(`冻结importer漂移：${entry.name}`);
    return `${entry.name}@${version}`;
  });
  const visited = new Set<string>();
  while (pending.length) {
    const key = pending.pop()!;
    if (visited.has(key)) continue;
    visited.add(key);
    const source = oldSnapshots.get(key);
    if (!source || currentSnapshots.get(key) !== source) throw Error(`冻结snapshot漂移或缺失：${key}`);
    // 保留完整peer后缀；registry packages节点则没有解析后的peer后缀。
    const packageKey = key.split("(", 1)[0]!;
    const metadata = oldPackages.get(packageKey);
    if (!metadata || currentPackages.get(packageKey) !== metadata) throw Error(`冻结package漂移或缺失：${packageKey}`);
    pending.push(...dependencyEdges(source));
  }
  return visited;
}
function fixture() {
  // 旧源码和原始锁仍锚定不变；整合可新增无关依赖，但旧peer的完整执行闭包不能漂移。
  const originalLock = frozen("pnpm-lock.yaml");
  verifyFrozenPeerLock(readFileSync(join(repo, "pnpm-lock.yaml"), "utf8"), originalLock);
  for (const [path, hash] of Object.entries(anchors)) expect(digest(frozen(path))).toBe(hash);
  const tree = new Set(execFileSync("git", ["ls-tree", "-r", "--name-only", FROZEN, "contract/src", "frontend/src/app/api/v1/dispatch/route.ts", "frontend/src/lib/loopback-core.ts"], { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim().split("\n"));
  const contractRequire = createRequire(join(repo, "contract/package.json"));
  const frontendRequire = createRequire(join(repo, "frontend/package.json"));
  for (const entry of peerImports) {
    const installed = (entry.workspace === "contract" ? contractRequire : frontendRequire)(`${entry.name}/package.json`) as { name: string; version: string };
    expect(installed.name).toBe(entry.name);
    expect(installed.version).toBe(importerVersion(originalLock, entry).split("(", 1)[0]);
  }
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
it("冻结blob、传递snapshot、可选依赖和package integrity篡改均拒绝，无关新增不替代旧peer", () => {
  const original = frozen("pnpm-lock.yaml"), current = readFileSync(join(repo, "pnpm-lock.yaml"), "utf8");
  const closure = verifyFrozenPeerLock(current, original);
  expect(closure.has("zod@4.4.3")).toBe(true);
  expect(closure.has("@swc/helpers@0.5.15")).toBe(true);
  expect([...closure].some(key => key.startsWith("@next/swc-"))).toBe(true);
  expect([...closure].some(key => key.startsWith("react-dom@") && key.includes("(react@"))).toBe(true);
  expect(() => verifyFrozenPeerLock(current, original + "\n")).toThrow("冻结锁原始blob SHA不匹配");
  const snapshots = lockSection(current, "snapshots"), packages = lockSection(current, "packages");
  const transitive = snapshots.get("@swc/helpers@0.5.15")!;
  expect(transitive).toBeTruthy();
  expect(() => verifyFrozenPeerLock(current.replace(transitive, transitive.replace("tslib: ", "tslib: 0.")), original)).toThrow("冻结snapshot漂移");
  const optionalKey = [...closure].find(key => key.startsWith("@next/swc-"))!, optional = snapshots.get(optionalKey)!;
  expect(() => verifyFrozenPeerLock(current.replace(optional, optional.replace(":", "-tampered:")), original)).toThrow("冻结snapshot漂移或缺失");
  const metadata = packages.get("zod@4.4.3")!;
  expect(() => verifyFrozenPeerLock(current.replace(metadata, metadata.replace("sha512-", "sha512-tampered")), original)).toThrow("冻结package漂移");
  const unrelated = current.replace("snapshots:\n", "snapshots:\n\n  t1080-unrelated-synthetic@1.0.0: {}\n");
  expect([...verifyFrozenPeerLock(unrelated, original)].sort()).toEqual([...closure].sort());
});
