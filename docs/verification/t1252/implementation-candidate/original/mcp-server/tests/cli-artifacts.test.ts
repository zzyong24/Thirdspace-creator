import { createHash } from "node:crypto";
import * as fs from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runCliCommand } from "../src/cli";

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof fs>();
  return { ...actual, open: vi.fn(actual.open) };
});

describe("T-1026 产物导出 CLI", () => {
  let directory: string;
  let output: string;
  const bytes = Buffer.from([0, 255, 128, 13, 10, 65, 66]);
  const hash = createHash("sha256").update(bytes).digest("hex");
  const response = (format = "raw") => ({
    metadata: { taskId: "task-1", artifactId: "artifact-1", version: 2 },
    format,
    mime: "application/octet-stream",
    filename: "../服务端建议.bin",
    size: bytes.length,
    hash,
    sourceHash: "a".repeat(64),
    encoding: "base64",
    data: bytes.toString("base64"),
  });
  const args = (format = "raw") => [
    "artifacts", "export", "task-1", "--artifact", "artifact-1",
    "--artifact-version", "2", "--format", format,
    "--output", output, "--account", "acct-a",
  ];
  const serve = (data: unknown = response(), status = 200) => {
    const fetchMock = vi.fn(async (_url: unknown, _init?: RequestInit) => new Response(
      JSON.stringify({ data, meta: { requestId: "request-render" } }),
      { status, headers: { "content-type": "application/json" } },
    ));
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  };

  beforeEach(async () => {
    directory = await fs.mkdtemp(join(import.meta.dirname, "../.cli-artifacts-"));
    output = join(directory, "用户指定 输出.bin");
    vi.stubEnv("CREATOROS_BASE_URL", "http://127.0.0.1:43127");
    vi.stubEnv("CREATOROS_CLI_ACCESS_TOKEN", "cli-test-grant");
    vi.stubEnv("CREATOROS_EMAIL", "");
    vi.stubEnv("CREATOROS_PASSWORD", "");
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    await fs.rm(directory, { recursive: true, force: true });
  });

  it.each(["raw", "preview", "png", "pdf"])("%s 经正式 read dispatch 下载并校验二进制，不需要 apply 或执行租约", async (format) => {
    const fetchMock = serve(response(format));
    const result = await runCliCommand(args(format));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("http://127.0.0.1:43127/api/v1/dispatch");
    expect(JSON.parse(String(init?.body))).toEqual({
      id: "workbench.artifacts.render",
      input: { params: { taskId: "task-1", artifactId: "artifact-1", version: 2 }, query: { format } },
    });
    expect(init?.headers).toMatchObject({ "x-account-id": "acct-a" });
    expect(init?.headers).not.toHaveProperty("x-creatoros-cli-apply");
    expect(init?.headers).not.toHaveProperty("x-idempotency-key");
    expect(await fs.readFile(output)).toEqual(bytes);
    expect(await fs.readdir(directory)).toEqual(["用户指定 输出.bin"]);
    expect(result).toMatchObject({
      ok: true, operation: "workbench.artifacts.render", accountId: "acct-a",
      requestId: "request-render", data: { output, filename: "../服务端建议.bin", size: bytes.length, hash, format },
    });
    expect((result as { data: object }).data).not.toHaveProperty("data");
  });

  it("导出摘要完整保留渲染策略及图表清理诊断", async () => {
    const rendererPolicy = "static-only";
    const diagnostics = {
      schemaVersion: 1,
      status: "analyzed",
      sourceHash: "a".repeat(64),
      scriptCount: 2,
      externalResourceCount: 1,
      staticSvgCount: 3,
      staticTableCount: 4,
      staticImgCount: 5,
      degraded: true,
      repairAdvice: ["脚本图表已清理，请提供静态 SVG。"],
    };
    serve({ ...response("pdf"), rendererPolicy, diagnostics });
    const result = await runCliCommand(args("pdf")) as { data: Record<string, unknown> };
    const summary = JSON.parse(JSON.stringify(result.data));
    expect(summary.rendererPolicy).toBe(rendererPolicy);
    expect(summary.diagnostics).toEqual(diagnostics);
    expect(summary).not.toHaveProperty("data");
    expect(await fs.readFile(output)).toEqual(bytes);
  });

  it("帮助列出完整导出语法和正式 operation", async () => {
    expect(JSON.stringify(await runCliCommand(["--help"]))).toContain(
      "artifacts export <taskId> --artifact <artifactId> --artifact-version <positiveInt> --format raw|preview|png|pdf --output <localPath> --account <id>",
    );
    expect(JSON.stringify(await runCliCommand(["--help"]))).toContain("workbench.artifacts.render");
  });

  it("动态 describe 直接呈现主会话契约的 read policy 和导出格式", async () => {
    const fetchMock = serve();
    const described = await runCliCommand(["operations", "describe", "workbench.artifacts.render"]);
    expect(described).toMatchObject({
      operation: "workbench.artifacts.render", effect: "read", confirmation: "none", asyncTask: false,
      inputSchema: { properties: {
        params: { properties: { taskId: expect.any(Object), artifactId: expect.any(Object), version: { type: "integer" } } },
        query: { properties: { format: { enum: ["raw", "preview", "png", "pdf"] } } },
      } },
      outputSchema: { properties: { encoding: { const: "base64" }, hash: expect.any(Object), sourceHash: expect.any(Object) } },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(["0", "-1", "1.5", "1e2", "NaN", "Infinity", "9007199254740992", " 2 "])("版本 %s 在请求前被拒绝", async (version) => {
    const fetchMock = serve();
    const input = args();
    input[input.indexOf("--artifact-version") + 1] = version;
    await expect(runCliCommand(input)).rejects.toThrow("--artifact-version");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await fs.readdir(directory)).toEqual([]);
  });

  it.each(["--artifact", "--artifact-version", "--format", "--output", "--account"])("缺少 %s 时不得下载或使用默认输出", async (flag) => {
    const fetchMock = serve();
    const input = args();
    input.splice(input.indexOf(flag), 2);
    await expect(runCliCommand(input)).rejects.toThrow(flag);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await fs.readdir(directory)).toEqual([]);
  });

  it("缺少 taskId 或格式不支持时不发请求", async () => {
    const fetchMock = serve();
    const input = args();
    input.splice(2, 1);
    await expect(runCliCommand(input)).rejects.toThrow("taskId");
    await expect(runCliCommand(args("jpeg"))).rejects.toThrow("--format");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ["编码不符", { encoding: "utf8" }, "base64"],
    ["非字符串", { data: 123 }, "base64"],
    ["非法字符", { data: "!" + bytes.toString("base64") }, "base64"],
    ["缺少填充", { data: bytes.toString("base64").replace(/=+$/, "") }, "base64"],
    ["填充位非零", { data: "AB==", size: 1, hash: createHash("sha256").update(Buffer.from([0])).digest("hex") }, "base64"],
    ["字节数不符", { size: bytes.length + 1 }, "size"],
    ["字节数为字符串", { size: String(bytes.length) }, "size"],
    ["hash 不符", { hash: "0".repeat(64) }, "hash"],
    ["缺少 hash", { hash: undefined }, "hash"],
    ["格式不符", { format: "pdf" }, "format"],
  ])("%s 的响应不得留下文件", async (_name, override, message) => {
    serve({ ...response(), ...override as object });
    await expect(runCliCommand(args())).rejects.toThrow(String(message));
    expect(await fs.readdir(directory)).toEqual([]);
  });

  it("真实空文件仍可导出", async () => {
    serve({ ...response(), data: "", size: 0, hash: createHash("sha256").digest("hex") });
    await runCliCommand(args());
    expect((await fs.stat(output)).size).toBe(0);
  });

  it("已存在的文件保持原字节且拒绝覆盖", async () => {
    serve();
    await fs.writeFile(output, "用户已有文件");
    await expect(runCliCommand(args())).rejects.toThrow(/EEXIST/);
    expect(await fs.readFile(output, "utf8")).toBe("用户已有文件");
  });

  it("已存在的符号链接保持链接及目标不变", async () => {
    serve();
    const target = join(directory, "已有目标");
    await fs.writeFile(target, "保留");
    await fs.symlink(target, output);
    await expect(runCliCommand(args())).rejects.toThrow(/EEXIST/);
    expect((await fs.lstat(output)).isSymbolicLink()).toBe(true);
    expect(await fs.readFile(target, "utf8")).toBe("保留");
  });

  it("写入一部分后失败会关闭并删除半文件", async () => {
    serve();
    const realFs = await vi.importActual<typeof fs>("node:fs/promises");
    vi.mocked(fs.open).mockImplementationOnce(async (...parameters) => {
      const handle = await realFs.open(...parameters);
      const write = handle.writeFile.bind(handle);
      vi.spyOn(handle, "writeFile").mockImplementationOnce(async () => {
        await write(bytes.subarray(0, 2));
        throw new Error("ENOSPC 模拟写入中途失败");
      });
      return handle;
    });
    await expect(runCliCommand(args())).rejects.toThrow("ENOSPC");
    expect(await fs.readdir(directory)).toEqual([]);
  });

  it("关闭文件失败也会清理本次输出", async () => {
    serve();
    const realFs = await vi.importActual<typeof fs>("node:fs/promises");
    vi.mocked(fs.open).mockImplementationOnce(async (...parameters) => {
      const handle = await realFs.open(...parameters);
      vi.spyOn(handle, "close").mockRejectedValueOnce(new Error("EIO 模拟关闭失败"));
      return handle;
    });
    await expect(runCliCommand(args())).rejects.toThrow("EIO");
    expect(await fs.readdir(directory)).toEqual([]);
  });

  it("并发导出同一路径只有一次成功", async () => {
    serve();
    const results = await Promise.allSettled([runCliCommand(args()), runCliCommand(args())]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(await fs.readFile(output)).toEqual(bytes);
  });

  it("后端拒绝请求时不创建输出文件", async () => {
    serve(null, 403);
    await expect(runCliCommand(args())).rejects.toThrow("403");
    expect(await fs.readdir(directory)).toEqual([]);
  });
});
