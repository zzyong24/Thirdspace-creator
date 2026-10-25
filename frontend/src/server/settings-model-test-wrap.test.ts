// @vitest-environment node
/**
 * [T-377] settings.models.test「测试连接」通道回归，T-1409 增加仅本地 HTTP 的正式 Worker/IPC：
 *   - 文本(default):最小流式探测,正文或思考流 → ✓;401 → ✗ 密钥提示(不泄 HTTP 码/响应体);
 *     正文与思考均为空 → ✗;未配 → 「未配置」。
 *   - chat.fallback:专配行 null → 「未配置」(不回退主模型)。
 *   - image.generate:真实最小生图 fake 成功 → ✓(额度提示语);调用抛错 → ✗ 人话提示(不泄原始报错)。
 *   - video.generate:鉴权探测 —— 401/403/1004明确失败；参数级400和未知响应只警告，不推断已连通。
 *   - transcribe.audio:未配置 → 明确失败；云端 ASR → 三态鉴权探测。
 *   - web.search:browser 免 key → ✓;付费 provider 最小检索成功 → ✓。
 *   - wrap 透传:非 test op 原样进 settings transport。
 */

import { afterAll, beforeAll, describe, it, expect, vi } from "vitest";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { build } from "esbuild";
import { ENDPOINTS, type RequestContext } from "@creatoros/contract";
import { createModelProbeIoService } from "@creatoros/backend/modules/ai-runtime";

import {
  consumeTextProbeStream,
  createSettingsWithModelTest,
  runModelConnectionTest,
  type SettingsModelTestDeps,
} from "./settings-model-test-wrap";

const ctx: RequestContext = { userId: "u1", requestId: "r1", source: "user" };
const paymentRequiredMessage = "官方模型服务返回支付或权益核验拒绝（HTTP 402）。请在设置查看 AI 额度与消耗，核对后继续原任务。";
const creditExhaustedMessage = "AI 额度不足，请充值后再试。";

async function* probeParts(
  parts: Array<{ type: string; text?: string; error?: unknown }>,
) {
  yield* parts;
}

const llmSpec = {
  apiFormat: "openai_chat" as const,
  baseUrl: "https://api.example.com/v1",
  model: "test-model",
  authStyle: "bearer" as const,
  token: "k",
};

const mmSpec = {
  provider: "minimax",
  baseUrl: null,
  model: "image-x",
  token: "k",
};

function jsonResponse(status: number, body: unknown = {}): Response {
  return new Response(JSON.stringify(body), { status });
}

function makeDeps(
  overrides: Partial<Omit<SettingsModelTestDeps, "settings">> = {},
): Omit<SettingsModelTestDeps, "settings"> {
  return {
    resolveLlm: vi.fn(async () => llmSpec),
    resolveDedicatedLlm: vi.fn(async () => llmSpec),
    resolveMultimodal: vi.fn(async () => mmSpec),
    resolveTranscribe: vi.fn(async () => ({
      provider: "xiaomi-mimo",
      baseUrl: "https://api.xiaomimimo.com/v1",
      model: "mimo-v2.5-asr",
      token: "k",
    })),
    resolveEmbed: vi.fn(async () => llmSpec),
    resolveSearch: vi.fn(async () => ({
      provider: "bocha",
      baseUrl: null,
      model: null,
      token: "k",
    })),
    generateImageMinimal: vi.fn(async () => ({ byteLength: 12 })),
    searchMinimal: vi.fn(async () => 1),
    probeTextModel: vi.fn(async () => ({ text: "OK" })),
    fetchImpl: vi.fn(async () => jsonResponse(200, {})) as unknown as typeof fetch,
    ...overrides,
  };
}

describe("consumeTextProbeStream", () => {
  it("读取首个 reasoning delta 作为真实连通证据", async () => {
    await expect(
      consumeTextProbeStream(
        probeParts([
          { type: "reasoning-start" },
          { type: "reasoning-delta", text: "正在检查" },
        ]),
      ),
    ).resolves.toEqual({ text: "", reasoningText: "正在检查" });
  });

  it("显式抛出 fullStream 的 error part，不得静默变成空流", async () => {
    const error = new Error("401 Authentication Fails");
    await expect(
      consumeTextProbeStream(probeParts([{ type: "error", error }])),
    ).rejects.toBe(error);
  });
});

describe("runModelConnectionTest — 文本模型(default)", () => {
  it("复用正式模型工厂的流式探针并收到非空文本 → ✓ 连通", async () => {
    const deps = makeDeps();
    const r = await runModelConnectionTest(ctx, "default", deps);
    expect(r.ok).toBe(true);
    expect(r.model).toBe("test-model");
    expect(r.detail).toBe("已收到最小测试请求的流式回复，连通。");
    expect(deps.probeTextModel).toHaveBeenCalledWith(llmSpec, ctx);
    expect(deps.fetchImpl).not.toHaveBeenCalled();
  });

  it("openai_responses 同样交给正式模型工厂，不在测试层手拼 /responses", async () => {
    const deps = makeDeps({
      resolveLlm: vi.fn(async () => ({
        ...llmSpec,
        apiFormat: "openai_responses" as const,
      })),
    });
    const r = await runModelConnectionTest(ctx, "default", deps);
    expect(r.ok).toBe(true);
    expect(r.provider).toBe("openai_responses");
    expect(deps.probeTextModel).toHaveBeenCalledWith(
      expect.objectContaining({ apiFormat: "openai_responses" }),
      ctx,
    );
    expect(deps.fetchImpl).not.toHaveBeenCalled();
  });

  it("正式流式调用发生非鉴权异常 → ✗ 通用人话提示(不泄原始错误,也不说「未配置」)", async () => {
    const consoleSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const opaque = {
      ...llmSpec,
      baseUrl: "https://opaque-channel.example/v1",
      model: "opaque-channel-model",
      token: "opaque-channel-secret",
      displayModelKey: "channel-managed" as const,
    };
    const deps = makeDeps({
      resolveLlm: vi.fn(async () => opaque),
      probeTextModel: vi.fn(async () => {
        throw new Error(
          "raw-error opaque-channel-secret opaque-channel-model opaque-channel.example response-body",
        );
      }),
    });
    const r = await runModelConnectionTest(ctx, "default", deps);
    expect(r.ok).toBe(false);
    expect(r.provider).toBe("channel-managed");
    expect(r.model).toBe("channel-managed");
    expect(r.detail).toContain("连接失败");
    expect(r.detail).not.toContain("raw-error");
    expect(r.detail).not.toContain("opaque-channel");
    expect(r.detail).not.toContain("未配置");
    const logSnapshot = JSON.stringify(consoleSpy.mock.calls);
    expect(logSnapshot).toContain("provider_error");
    expect(logSnapshot).not.toMatch(
      /opaque-channel|response-body|raw-error/,
    );
    consoleSpy.mockRestore();
  });

  it("正式流式调用返回 2xx 空流 → ✗，不能把空内容误判成连通", async () => {
    const deps = makeDeps({
      probeTextModel: vi.fn(async () => ({ text: "   " })),
    });
    const r = await runModelConnectionTest(ctx, "default", deps);
    expect(r.ok).toBe(false);
    expect(r.detail).toContain("没有返回有效文本");
  });

  it("DeepSeek V4 只返回思考流 → ✓，不能因最终正文为空误报连接失败", async () => {
    const deps = makeDeps({
      probeTextModel: vi.fn(async () => ({
        text: "",
        reasoningText: "正在验证连接",
      })),
    });
    const r = await runModelConnectionTest(ctx, "default", deps);
    expect(r.ok).toBe(true);
    expect(r.detail).toBe("已收到最小测试请求的流式回复，连通。");
  });

  it("正式流式调用在流内返回 401 → ✗ 密钥错误，不得误报为空响应", async () => {
    const deps = makeDeps({
      probeTextModel: vi.fn(async () => {
        throw new Error("AI_APICallError: 401 Authentication Fails, api key is invalid");
      }),
    });
    const r = await runModelConnectionTest(ctx, "default", deps);
    expect(r.ok).toBe(false);
    expect(r.detail).toContain("密钥无效或无权限");
    expect(r.detail).not.toContain("401");
    expect(r.detail).not.toContain("api key");
  });

  it("解析抛 LlmCredentialError → 「未配置」", async () => {
    const err = new Error("无可用 LLM 凭据");
    err.name = "LlmCredentialError";
    const deps = makeDeps({
      resolveLlm: vi.fn(async () => {
        throw err;
      }),
    });
    const r = await runModelConnectionTest(ctx, "default", deps);
    expect(r.ok).toBe(false);
    expect(r.detail).toContain("未配置");
  });
});

describe("受管文本探针的固定支付诊断", () => {
  it.each([
    [paymentRequiredMessage, paymentRequiredMessage],
    [`402 ${paymentRequiredMessage}`, paymentRequiredMessage],
    [` ${paymentRequiredMessage}`, paymentRequiredMessage],
    [creditExhaustedMessage, creditExhaustedMessage],
    [` ${creditExhaustedMessage}`, creditExhaustedMessage],
    [`402 ${creditExhaustedMessage}`, creditExhaustedMessage],
    [`429 ${creditExhaustedMessage}`, creditExhaustedMessage],
  ])("普通 Error 的完整白名单消息 %s 保留固定诊断", async (message, expected) => {
    const deps = makeDeps({
      resolveLlm: vi.fn(async () => ({ ...llmSpec, displayModelKey: "channel-managed" as const })),
      probeTextModel: vi.fn(async () => { throw new Error(message); }),
    });
    const result = await runModelConnectionTest(ctx, "default", deps);
    expect(result).toEqual({ ok: false, provider: "channel-managed", model: "channel-managed", detail: expected });
    expect(deps.probeTextModel).toHaveBeenCalledTimes(1);
  });

  it.each([
    `402 ${paymentRequiredMessage} private-provider private-model token=private-secret`,
    `private-provider ${creditExhaustedMessage}`,
    `402 402 ${paymentRequiredMessage}`,
    `500 ${paymentRequiredMessage}`,
    `999 ${creditExhaustedMessage}`,
    "AI_CREDIT_EXHAUSTED private-provider private-model token=private-secret",
  ])("未知或夹带正文不匹配固定诊断：%s", async message => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const deps = makeDeps({
        resolveLlm: vi.fn(async () => ({ ...llmSpec, displayModelKey: "channel-managed" as const })),
        probeTextModel: vi.fn(async () => { throw new Error(message); }),
      });
      const result = await runModelConnectionTest(ctx, "default", deps);
      expect(result.detail).toContain("连接失败");
      expect(JSON.stringify([result, log.mock.calls])).not.toMatch(/private-|AI_CREDIT_EXHAUSTED|官方模型服务|AI 额度不足/);
      expect(deps.probeTextModel).toHaveBeenCalledTimes(1);
    } finally { log.mockRestore(); }
  });

  it("自配模型即使返回相同固定文本也不宣称官方支付诊断", async () => {
    const deps = makeDeps({ probeTextModel: vi.fn(async () => { throw new Error(`402 ${paymentRequiredMessage}`); }) });
    const result = await runModelConnectionTest(ctx, "default", deps);
    expect(result.detail).toContain("连接失败");
    expect(result.detail).not.toContain("官方");
    expect(deps.probeTextModel).toHaveBeenCalledTimes(1);
  });
});

describe("正式模型探针 Worker → IPC → settings.models.test 的鉴权与支付诊断", () => {
  let directory: string;
  let entry: string;
  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), "creatoros-payment-probe-"));
    entry = join(directory, "probe.cjs");
    const { piRuntimeInitializationPlugin } = await import(resolve("../ai-worker/scripts/pi-runtime-bundle.mjs"));
    await build({
      entryPoints: [resolve("../ai-worker/src/io/model-probe-worker-entry.ts")],
      outfile: entry, bundle: true, platform: "node", target: "node24", format: "cjs", logLevel: "silent",
      plugins: [piRuntimeInitializationPlugin()],
    });
  });
  afterAll(async () => { if (directory) await rm(directory, { recursive: true, force: true }); });

  it.each(["bearer", "x-api-key", undefined] as const)("T1411 Anthropic authStyle=%s 经真实 IPC 保持鉴权、128 上限与单次请求", async authStyle => {
    const captured: Array<{ url: string | undefined; authorization: string | undefined; apiKey: string | string[] | undefined; body: Record<string, unknown> }> = [];
    const server = createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on("data", chunk => chunks.push(Buffer.from(chunk)));
      request.on("end", () => {
        captured.push({ url: request.url, authorization: request.headers.authorization, apiKey: request.headers["x-api-key"], body: JSON.parse(Buffer.concat(chunks).toString()) });
        const events = [
          { type: "message_start", message: { id: "probe-message", type: "message", role: "assistant", model: "probe-model", content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 0 } } },
          { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
          { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "OK" } },
          { type: "content_block_stop", index: 0 },
          { type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 1 } },
          { type: "message_stop" },
        ];
        response.writeHead(200, { "content-type": "text/event-stream" });
        response.end(events.map(event => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join(""));
      });
    });
    const io = createModelProbeIoService({ entryPath: () => entry });
    try {
      await new Promise<void>(done => server.listen(0, "127.0.0.1", done));
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("测试 HTTP 地址不可用");
      const spec = { apiFormat: "anthropic" as const, baseUrl: `http://127.0.0.1:${address.port}/v1`, model: "probe-model", token: "synthetic-probe-token" };
      // 旧调用允许缺省方式；正常设置解析器始终返回显式方式。
      const result = authStyle === undefined ? await io.probeText(ctx, spec) : await runModelConnectionTest(ctx, "default", makeDeps({
        resolveLlm: vi.fn(async () => ({ ...spec, authStyle })),
        probeTextModel: (value, context) => io.probeText(context, value),
      }));
      expect(captured).toHaveLength(1);
      expect(captured[0]).toMatchObject({ url: "/v1/messages", body: { model: spec.model, max_tokens: 128, stream: true } });
      expect(captured[0]!.body).not.toHaveProperty("tools");
      expect(captured[0]!.authorization).toBe(authStyle === "bearer" ? `Bearer ${spec.token}` : undefined);
      expect(captured[0]!.apiKey).toBe(authStyle === "bearer" ? undefined : spec.token);
      if (authStyle === undefined) expect(result).toEqual({ text: "OK", reasoningText: "" });
      else expect(result).toEqual({ ok: true, provider: "anthropic", model: spec.model, detail: "已收到最小测试请求的流式回复，连通。" });
    } finally {
      await io.stop();
      server.closeAllConnections();
      await new Promise<void>((done, reject) => server.close(error => error ? reject(error) : done()));
    }
  });

  it.each([401, 500])("T1411 Bearer 上游 HTTP %s 只发一次，错误 IPC 不带 token", async status => {
    let requests = 0;
    let authorization: string | undefined;
    let apiKey: string | string[] | undefined;
    let body: Record<string, unknown> | undefined;
    const token = "synthetic-error-probe-token";
    const server = createServer((request, response) => {
      requests++; authorization = request.headers.authorization; apiKey = request.headers["x-api-key"];
      const chunks: Buffer[] = [];
      request.on("data", chunk => chunks.push(Buffer.from(chunk)));
      request.on("end", () => {
        body = JSON.parse(Buffer.concat(chunks).toString());
        response.writeHead(status, { "content-type": "application/json" });
        response.end(JSON.stringify({ type: "error", error: { type: status === 401 ? "authentication_error" : "api_error", message: `upstream rejected Bearer ${token}` } }));
      });
    });
    const io = createModelProbeIoService({ entryPath: () => entry });
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    let receivedError: unknown;
    try {
      await new Promise<void>(done => server.listen(0, "127.0.0.1", done));
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("测试 HTTP 地址不可用");
      const result = await runModelConnectionTest(ctx, "default", makeDeps({
        resolveLlm: vi.fn(async () => ({ apiFormat: "anthropic" as const, baseUrl: `http://127.0.0.1:${address.port}/v1`, model: "probe-model", authStyle: "bearer" as const, token })),
        probeTextModel: async (value, context) => {
          try { return await io.probeText(context, value); }
          catch (error) { receivedError = error; throw error; }
        },
      }));
      expect(receivedError).toBeInstanceOf(Error);
      expect(result.ok).toBe(false);
      expect(JSON.stringify([result, (receivedError as Error).message, log.mock.calls])).not.toContain(token);
      expect(requests).toBe(1);
      expect(body).toMatchObject({ max_tokens: 128, stream: true });
      expect(authorization).toBe(`Bearer ${token}`);
      expect(apiKey).toBeUndefined();
    } finally {
      await io.stop();
      server.closeAllConnections();
      await new Promise<void>((done, reject) => server.close(error => error ? reject(error) : done()));
      log.mockRestore();
    }
  });

  it.each([
    { name: "未知 402", body: { error: { code: "billing_check", message: "payment verification required" } }, expected: paymentRequiredMessage },
    { name: "字符串余额信号", body: { error: "insufficient balance" }, expected: creditExhaustedMessage },
    { name: "error.type 额度信号", body: { error: { type: "insufficient_quota", message: "余额不足" } }, expected: creditExhaustedMessage },
    { name: "402 私密正文", body: { error: { code: "private-provider-code", message: "private-provider private-model https://private.example token=private-secret" }, headers: { authorization: "Bearer private-secret" } }, expected: paymentRequiredMessage },
    { name: "自配 402", body: { error: { message: "payment required private-provider private-model token=private-secret" } }, expected: "连接失败：请核对密钥、Base URL、接口格式和模型 ID 后重试。", self: true },
  ])("$name 经真实普通 Error 重建仍安全且只调用一次", async ({ body, expected, self }) => {
    let requests = 0;
    const server = createServer((request, response) => {
      requests++;
      request.resume();
      response.writeHead(402, { "content-type": "application/json" });
      response.end(JSON.stringify(body));
    });
    const io = createModelProbeIoService({ entryPath: () => entry });
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    let receivedError: unknown;
    try {
      await new Promise<void>(done => server.listen(0, "127.0.0.1", done));
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("测试 HTTP 地址不可用");
      const spec = { ...llmSpec, baseUrl: `http://127.0.0.1:${address.port}/v1`, model: "private-model", token: "private-secret",
        ...(!self ? { displayModelKey: "channel-managed" as const } : {}) };
      const deps = makeDeps({
        resolveLlm: vi.fn(async () => spec),
        probeTextModel: vi.fn(async (value, context) => {
          try { return await io.probeText(context, value); }
          catch (error) { receivedError = error; throw error; }
        }),
      });
      const result = await runModelConnectionTest(ctx, "default", deps);
      expect(receivedError).toBeInstanceOf(Error);
      expect((receivedError as Error).constructor).toBe(Error);
      expect(receivedError).not.toHaveProperty("code");
      if (!self) expect((receivedError as Error).message.trim().replace(/^402 /, "")).toBe(expected);
      expect(result).toEqual({ ok: false, provider: self ? "openai_chat" : "channel-managed", model: self ? "private-model" : "channel-managed", detail: expected });
      const publicDiagnostics = JSON.stringify([result.detail, log.mock.calls]);
      expect(publicDiagnostics).not.toMatch(/private-|private\.example|Bearer|billing_check|insufficient_quota/);
      if (!self) expect(JSON.stringify([result, (receivedError as Error).message])).not.toMatch(/private-|private\.example|Bearer/);
      expect(requests).toBe(1);
      expect(deps.probeTextModel).toHaveBeenCalledTimes(1);
      expect(deps.fetchImpl).not.toHaveBeenCalled();
    } finally {
      await io.stop();
      server.closeAllConnections();
      await new Promise<void>((done, reject) => server.close(error => error ? reject(error) : done()));
      log.mockRestore();
    }
  });
});

describe("runModelConnectionTest — chat.fallback(只认专配行)", () => {
  it("专配行 null → 「未配置」,不回退主模型", async () => {
    const deps = makeDeps({ resolveDedicatedLlm: vi.fn(async () => null) });
    const r = await runModelConnectionTest(ctx, "chat.fallback", deps);
    expect(r.ok).toBe(false);
    expect(r.detail).toContain("未配置");
    expect(r.detail).toContain("专配");
  });
});

describe("runModelConnectionTest — image.generate(真实最小生图)", () => {
  it("fake 生图返回字节 → ✓ + 额度消耗提示", async () => {
    const deps = makeDeps();
    const r = await runModelConnectionTest(ctx, "image.generate", deps);
    expect(r.ok).toBe(true);
    expect(r.provider).toBe("minimax");
    expect(r.detail).toContain("额度");
    expect(deps.generateImageMinimal).toHaveBeenCalledTimes(1);
  });

  // [T-379] openai 兼容 provider(gpt-image 系/中转站)与 minimax 同一分支:走真实最小生图,
  // spec(provider/baseUrl/model/token)原样进 generateImageMinimal(host 侧 registry 按
  // provider="openai" 路由到 createOpenaiImagesAdapter)。
  it("openai 兼容 provider → 同走真实最小生图,spec 原样透传", async () => {
    const openaiSpec = {
      provider: "openai",
      baseUrl: "https://dudu.mom",
      model: "gpt-image-2-4K",
      token: "k",
    };
    const deps = makeDeps({
      resolveMultimodal: vi.fn(async () => openaiSpec),
    });
    const r = await runModelConnectionTest(ctx, "image.generate", deps);
    expect(r.ok).toBe(true);
    expect(r.provider).toBe("openai");
    expect(r.model).toBe("gpt-image-2-4K");
    expect(r.detail).toContain("额度");
    expect(deps.generateImageMinimal).toHaveBeenCalledWith(openaiSpec, ctx);
  });

  it("生图调用抛错 → ✗ 人话提示(不泄原始报错)", async () => {
    const deps = makeDeps({
      generateImageMinimal: vi.fn(async () => {
        throw new Error("minimax 401 invalid key");
      }),
    });
    const r = await runModelConnectionTest(ctx, "image.generate", deps);
    expect(r.ok).toBe(false);
    expect(r.detail).toContain("连接失败");
    expect(r.detail).not.toContain("invalid key");
  });

  it("未配(resolve 抛 MultimodalConfigError)→ 「未配置」", async () => {
    const err = new Error('capability "image.generate" 未配置生图模型');
    err.name = "MultimodalConfigError";
    const deps = makeDeps({
      resolveMultimodal: vi.fn(async () => {
        throw err;
      }),
    });
    const r = await runModelConnectionTest(ctx, "image.generate", deps);
    expect(r.ok).toBe(false);
    expect(r.detail).toContain("未配置");
  });
});

describe("runModelConnectionTest — video.generate(鉴权探测,不真生成)", () => {
  it("HTTP 401 → ✗ 密钥无效或无权限(不泄 HTTP 码)", async () => {
    const deps = makeDeps({
      fetchImpl: vi.fn(async () => jsonResponse(401)) as unknown as typeof fetch,
    });
    const r = await runModelConnectionTest(ctx, "video.generate", deps);
    expect(r.ok).toBe(false);
    expect(r.detail).toContain("密钥无效或无权限");
    expect(r.detail).not.toContain("401");
  });

  it("T1403 参数级 400(缺 prompt)只说明尚未确认，不推断鉴权已通过", async () => {
    const deps = makeDeps({
      fetchImpl: vi.fn(async () =>
        jsonResponse(400, { error: "prompt required" }),
      ) as unknown as typeof fetch,
    });
    const r = await runModelConnectionTest(ctx, "video.generate", deps);
    expect(r.ok).toBe(true);
    expect(r.status).toBe("warn");
    expect(r.detail).toContain("尚未确认");
    expect(r.detail).toContain("未实际生成");
    expect(r.detail).not.toContain("鉴权与端点可达");
  });

  it.each([
    { label: "404", response: () => jsonResponse(404) },
    { label: "405", response: () => jsonResponse(405) },
    { label: "429", response: () => jsonResponse(429) },
    { label: "HTML 200", response: () => new Response("<html>login</html>", { status: 200, headers: { "content-type": "text/html" } }) },
    { label: "空 204", response: () => new Response(null, { status: 204 }) },
    { label: "未知 JSON 200", response: () => jsonResponse(200, { unknown: true }) },
    { label: "参数错误 422", response: () => jsonResponse(422, { error: "content required" }) },
    { label: "未知业务状态", response: () => jsonResponse(200, { base_resp: { status_code: 2013 } }) },
    { label: "JSON null", response: () => jsonResponse(200, null) },
    { label: "成功外形", response: () => jsonResponse(200, { task_id: "unverified-fixture-task" }) },
  ])("T1403 $label 不伪报视频已连通，也不生成或再次请求", async ({ response }) => {
    const fetchImpl = vi.fn<typeof fetch>(async () => response());
    const deps = makeDeps({ fetchImpl: fetchImpl as unknown as typeof fetch });
    const result = await runModelConnectionTest(ctx, "video.generate", deps);
    expect(result).toMatchObject({ ok: true, status: "warn" });
    expect(result.detail).toContain("尚未确认");
    expect(result.detail).toContain("未实际生成视频");
    expect(result.detail).not.toContain("鉴权与端点可达");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchImpl.mock.calls[0]![1]!.body as string)).toEqual({ model: mmSpec.model });
    expect(deps.generateImageMinimal).not.toHaveBeenCalled();
    expect(deps.probeTextModel).not.toHaveBeenCalled();
  });

  it.each([403, 500, 503])("T1403 HTTP %s 仍明确失败，不能被未知响应警告吞掉", async status => {
    const deps = makeDeps({ fetchImpl: vi.fn(async () => jsonResponse(status)) as unknown as typeof fetch });
    const result = await runModelConnectionTest(ctx, "video.generate", deps);
    expect(result.ok).toBe(false);
    expect(result.status).not.toBe("warn");
    expect(result.detail).toContain(status === 403 ? "密钥无效或无权限" : "对方服务开小差");
  });

  it("MiniMax 惯例 HTTP 200 + base_resp 1004 → ✗ 密钥无效或无权限(不泄原始 status_msg)", async () => {
    const deps = makeDeps({
      fetchImpl: vi.fn(async () =>
        jsonResponse(200, {
          base_resp: { status_code: 1004, status_msg: "invalid api key" },
        }),
      ) as unknown as typeof fetch,
    });
    const r = await runModelConnectionTest(ctx, "video.generate", deps);
    expect(r.ok).toBe(false);
    expect(r.detail).toContain("密钥无效或无权限");
    expect(r.detail).not.toContain("invalid api key");
  });

  it("OmniHi / Seedance 保原 media/v1/videos/generations 缺内容请求，但不冒称鉴权成功", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(400, { error: "prompt required" }),
    ) as unknown as typeof fetch;
    const deps = makeDeps({
      resolveMultimodal: vi.fn(async () => ({
        provider: "seeddance",
        baseUrl: "https://api.omnihi.ai/media/v1",
        model: "seedance/seedance-2.0-fast",
        token: "key",
      })),
      fetchImpl,
    });

    const r = await runModelConnectionTest(ctx, "video.generate", deps);

    expect(r.ok).toBe(true);
    expect(r.status).toBe("warn");
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.omnihi.ai/media/v1/videos/generations",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("MiniMax-H3 保原 v2 端点缺内容请求，但不冒称鉴权成功", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(400, { error: "content required" }),
    ) as unknown as typeof fetch;
    const deps = makeDeps({
      resolveMultimodal: vi.fn(async () => ({
        provider: "minimax",
        baseUrl: null,
        model: "MiniMax-H3",
        token: "key",
      })),
      fetchImpl,
    });

    const r = await runModelConnectionTest(ctx, "video.generate", deps);

    expect(r.ok).toBe(true);
    expect(r.status).toBe("warn");
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.minimax.io/v2/video_generation",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ model: "MiniMax-H3" }),
      }),
    );
  });

  it("MiniMax-H3 已保存完整提交接口时不重复拼接 v2 路径", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(400, { error: "content required" }),
    ) as unknown as typeof fetch;
    const deps = makeDeps({
      resolveMultimodal: vi.fn(async () => ({
        provider: "minimax",
        baseUrl: "https://api.minimaxi.com/v2/video_generation",
        model: "MiniMax-H3",
        token: "key",
      })),
      fetchImpl,
    });

    const r = await runModelConnectionTest(ctx, "video.generate", deps);

    expect(r.ok).toBe(true);
    expect(r.status).toBe("warn");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.minimaxi.com/v2/video_generation",
      expect.objectContaining({ method: "POST" }),
    );
  });
});

describe("T1403 图片编辑暂无内置探针", () => {
  it("只说明未测试，不把不支持探针误报成密钥错误，也不调用任何模型或网络", async () => {
    const deps = makeDeps();
    const result = await runModelConnectionTest(ctx, "image.edit", deps);
    expect(result).toMatchObject({ ok: true, status: "warn" });
    expect(result.detail).toContain("暂无内置连接测试");
    expect(result.detail).toContain("不代表密钥失效");
    expect(result.detail).toContain("未执行图片编辑");
    for (const dependency of Object.values(deps)) expect(dependency).not.toHaveBeenCalled();
  });
});

describe("runModelConnectionTest — transcribe.audio / web.search", () => {
  it("ASR 未配置 → 中性说明当前使用本地 Whisper，不伪装云端已连通", async () => {
    const r = await runModelConnectionTest(
      ctx,
      "transcribe.audio",
      makeDeps({
        resolveTranscribe: vi.fn(async () => ({
          provider: "whisper-local",
          baseUrl: null,
          model: "small",
          token: "",
        })),
      }),
    );
    expect(r.ok).toBe(true);
    expect(r.status).toBe("warn");
    expect(r.detail).toContain("未配置云端 ASR");
    expect(r.detail).toContain("本地 Whisper");
  });

  // [T-384] 云端 ASR 三态探测:200 → ✓;404/405(厂商无 /v1/models 端点)→ ⚠ 诚实中间态
  // (不误报失败 —— SiliconFlow 等无此端点,配置本可能正常);401 → ✗ 真失败。
  const cloudAsrDeps = (fetchImpl: typeof fetch) =>
    makeDeps({
      resolveTranscribe: vi.fn(async () => ({
        provider: "openai-asr",
        baseUrl: "https://api.siliconflow.cn",
        model: "FunAudioLLM/SenseVoiceSmall",
        token: "k",
      })),
      fetchImpl,
    });

  it("云端 ASR GET /v1/models 200 → ✓ status ok", async () => {
    const deps = cloudAsrDeps(vi.fn(async () => jsonResponse(200, {})) as unknown as typeof fetch);
    const r = await runModelConnectionTest(ctx, "transcribe.audio", deps);
    expect(r.ok).toBe(true);
    expect(r.status).toBe("ok");
    const url = (deps.fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string;
    expect(url).toBe("https://api.siliconflow.cn/v1/models");
  });

  it("baseUrl 已含 /v1 时不重复拼接", async () => {
    const deps = makeDeps({
      resolveTranscribe: vi.fn(async () => ({
        provider: "xiaomi-mimo",
        baseUrl: "https://api.xiaomimimo.com/v1",
        model: "mimo-v2.5-asr",
        token: "k",
      })),
      fetchImpl: vi.fn(async () => jsonResponse(200, {})) as unknown as typeof fetch,
    });
    await runModelConnectionTest(ctx, "transcribe.audio", deps);
    expect((deps.fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0]![0]).toBe(
      "https://api.xiaomimimo.com/v1/models",
    );
  });

  it("云端 ASR /v1/models 404 → ⚠ warn(无法探测≠失败,不误报)", async () => {
    const deps = cloudAsrDeps(
      vi.fn(async () => new Response("not found", { status: 404 })) as unknown as typeof fetch,
    );
    const r = await runModelConnectionTest(ctx, "transcribe.audio", deps);
    expect(r.ok).toBe(true);
    expect(r.status).toBe("warn");
    expect(r.detail).toContain("无法探测");
    expect(r.detail).toContain("真实转写");
    expect(r.detail).not.toContain("失败");
  });

  it("云端 ASR /v1/models 405 → ⚠ warn(同 404,端点不存在类)", async () => {
    const deps = cloudAsrDeps(
      vi.fn(async () => new Response("", { status: 405 })) as unknown as typeof fetch,
    );
    const r = await runModelConnectionTest(ctx, "transcribe.audio", deps);
    expect(r.status).toBe("warn");
  });

  it("云端 ASR /v1/models 401 → ✗ fail(人话提示,不泄 HTTP 码)", async () => {
    const deps = cloudAsrDeps(
      vi.fn(async () => new Response("invalid key", { status: 401 })) as unknown as typeof fetch,
    );
    const r = await runModelConnectionTest(ctx, "transcribe.audio", deps);
    expect(r.ok).toBe(false);
    expect(r.status).toBe("fail");
    expect(r.detail).toContain("连接失败");
    expect(r.detail).not.toContain("401");
  });

  it("web.search browser → ✓ 免 key;bocha 最小检索成功 → ✓ 带额度提示", async () => {
    const browserDeps = makeDeps({
      resolveSearch: vi.fn(async () => ({
        provider: "browser",
        baseUrl: null,
        model: null,
        token: "",
      })),
    });
    const r1 = await runModelConnectionTest(ctx, "web.search", browserDeps);
    expect(r1.ok).toBe(true);
    expect(r1.detail).toContain("免 key");

    const bochaDeps = makeDeps();
    const r2 = await runModelConnectionTest(ctx, "web.search", bochaDeps);
    expect(r2.ok).toBe(true);
    expect(bochaDeps.searchMinimal).toHaveBeenCalledTimes(1);
  });
});

describe("createSettingsWithModelTest — wrap 拦截与透传", () => {
  it("settings.models.test → 拦截返回探测结果 envelope;其余 op 透传", async () => {
    const passthrough = vi.fn(async () => ({ data: [], meta: { requestId: "r1" } }));
    const wrapped = createSettingsWithModelTest({
      settings: { request: passthrough },
      ...makeDeps({
        resolveLlm: vi.fn(async () => ({
          ...llmSpec,
          baseUrl: "https://opaque.example/v1",
          model: "opaque-model",
          token: "opaque-secret",
          displayModelKey: "channel-managed" as const,
        })),
      }),
    });
    const res = (await wrapped.request(
      ENDPOINTS.testModelConnection,
      { params: { capability: "default" }, query: undefined, body: undefined },
      ctx,
    )) as {
      data: {
        ok: boolean;
        detail: string;
        provider: string;
        model: string;
      };
    };
    expect(res.data.ok).toBe(true);
    expect(res.data.provider).toBe("channel-managed");
    expect(res.data.model).toBe("channel-managed");
    expect(JSON.stringify(res)).not.toMatch(
      /opaque\.example|opaque-model|opaque-secret/,
    );
    expect(passthrough).not.toHaveBeenCalled();

    await wrapped.request(
      ENDPOINTS.listModels,
      { params: undefined, query: undefined, body: undefined },
      ctx,
    );
    expect(passthrough).toHaveBeenCalledTimes(1);
  });
});


describe('T1294 已停用向量连接测试',()=>{
  const disabled={ok:false,status:'fail',provider:'',model:'',detail:'向量检索已停用，知识搜索使用关键词，无需配置或测试向量模型。'};
  function noProbe(deps:ReturnType<typeof makeDeps>){
    for(const name of ['resolveEmbed','resolveLlm','resolveDedicatedLlm','resolveMultimodal','resolveTranscribe','resolveSearch','probeTextModel','generateImageMinimal','searchMinimal','fetchImpl'] as const)expect(deps[name]).not.toHaveBeenCalled();
  }
  it.each(['configured','missing','broken'] as const)('旧%s配置均在resolver与网络之前明确停用',async kind=>{
    const resolver=vi.fn(async()=>{if(kind==='broken')throw new Error('private-secret');return kind==='missing'?null:llmSpec;});
    const deps=makeDeps({resolveEmbed:resolver});
    await expect(runModelConnectionTest(ctx,'knowledge.search.embed',deps)).resolves.toEqual(disabled);noProbe(deps);
  });
  it('原公开transport返回停用envelope，既不透传旧model test也不调用任何探针',async()=>{
    const deps=makeDeps(),passthrough=vi.fn(async()=>({data:[],meta:{requestId:'r1'}}));
    const wrapped=createSettingsWithModelTest({settings:{request:passthrough},...deps});
    await expect(wrapped.request(ENDPOINTS.testModelConnection,{params:{capability:'knowledge.search.embed'},query:undefined,body:undefined},ctx)).resolves.toEqual({data:disabled,meta:{requestId:'r1'}});
    expect(passthrough).not.toHaveBeenCalled();noProbe(deps);
  });
  it('旧embedding test仍需真实ctx，不能借停用旁路认证',async()=>{
    const deps=makeDeps(),passthrough=vi.fn(async()=>({data:[]}));const wrapped=createSettingsWithModelTest({settings:{request:passthrough},...deps});
    await expect(wrapped.request(ENDPOINTS.testModelConnection,{params:{capability:'knowledge.search.embed'},query:undefined,body:undefined})).rejects.toThrow('AuthenticationError');
    expect(passthrough).not.toHaveBeenCalled();noProbe(deps);
  });
});
