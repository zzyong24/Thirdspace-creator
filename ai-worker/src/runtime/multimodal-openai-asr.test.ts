import { describe, it, expect } from "vitest";
import { createOpenaiAsrAdapter } from "./multimodal-openai-asr";
import {
  MultimodalGenerationError,
  type MultimodalSpec,
} from "./multimodal-factory";

// 用注入的 fake fetch 验 OpenAI 兼容 ASR 适配器**装配**(不走网络、不需 key)。断言:请求打到
// `{baseUrl}/v1/audio/transcriptions`、带 model、带 Authorization Bearer、body(multipart)含
// file。真 endpoint 语义留给用户配 key 后验(SPEC §7,skill 已用 SiliconFlow 验过形状)。

const spec: MultimodalSpec = {
  provider: "siliconflow",
  baseUrl: "https://api.siliconflow.cn", // 裸域名(不含 /v1)
  model: "FunAudioLLM/SenseVoiceSmall",
  token: "sk-asr-test",
  kind: "audio",
};

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

describe("OpenAI 兼容 ASR 适配器 —— transcribeAudio(同步一次请求)", () => {
  it("POST {baseUrl}/v1/audio/transcriptions,multipart(file+model)+Bearer → 解 .text", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fakeFetch = (async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      return jsonResponse({ text: "这是一段逐字稿..." });
    }) as unknown as typeof fetch;

    const adapter = createOpenaiAsrAdapter({ fetch: fakeFetch });
    const out = await adapter.transcribeAudio!(spec, {
      audioBytes: new Uint8Array([1, 2, 3, 4]),
    });

    // 返回体取 .text → 工厂返 { text }。
    expect(out).toEqual({ text: "这是一段逐字稿..." });

    // 请求打到 {baseUrl}/v1/audio/transcriptions(裸域名 → 补 /v1)。
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(
      "https://api.siliconflow.cn/v1/audio/transcriptions",
    );

    const init = calls[0]!.init!;
    expect(init.method).toBe("POST");
    // 带 Authorization Bearer;Content-Type 不手动设(交给 FormData 自动生成 boundary)。
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer sk-asr-test");
    expect(headers["Content-Type"]).toBeUndefined();

    // body 是 multipart FormData,含 file(Blob) + model。
    const body = init.body as FormData;
    expect(body).toBeInstanceOf(FormData);
    expect(body.get("model")).toBe("FunAudioLLM/SenseVoiceSmall");
    const file = body.get("file");
    expect(file).toBeInstanceOf(Blob);
    expect((file as Blob).size).toBe(4); // 注入的 4 字节音频
  });

  it("baseUrl 已含 /v1 时不重复(归一到 {origin}/v1/audio/transcriptions)", async () => {
    const calls: string[] = [];
    const fakeFetch = (async (url: string) => {
      calls.push(String(url));
      return jsonResponse({ text: "x" });
    }) as unknown as typeof fetch;

    const adapter = createOpenaiAsrAdapter({ fetch: fakeFetch });
    await adapter.transcribeAudio!(
      { ...spec, baseUrl: "https://api.siliconflow.cn/v1" },
      { audioBytes: new Uint8Array([0]) },
    );
    expect(calls[0]).toBe(
      "https://api.siliconflow.cn/v1/audio/transcriptions",
    );
  });

  it("language 提供时作为 form 字段带上", async () => {
    let captured: FormData | null = null;
    const fakeFetch = (async (_url: string, init?: RequestInit) => {
      captured = init?.body as FormData;
      return jsonResponse({ text: "y", language: "zh" });
    }) as unknown as typeof fetch;

    const adapter = createOpenaiAsrAdapter({ fetch: fakeFetch });
    const out = await adapter.transcribeAudio!(spec, {
      audioBytes: new Uint8Array([1]),
      language: "zh",
    });
    expect(captured!.get("language")).toBe("zh");
    // 端点回传 language → 一并返回。
    expect(out).toEqual({ text: "y", language: "zh" });
  });

  it("HTTP 非 2xx → MultimodalGenerationError", async () => {
    const fakeFetch = (async () =>
      jsonResponse({ error: "unauthorized" }, false, 401)) as unknown as typeof fetch;
    const adapter = createOpenaiAsrAdapter({ fetch: fakeFetch });
    await expect(
      adapter.transcribeAudio!(spec, { audioBytes: new Uint8Array([1]) }),
    ).rejects.toBeInstanceOf(MultimodalGenerationError);
  });

  it("响应体缺 text 字段 → MultimodalGenerationError", async () => {
    const fakeFetch = (async () =>
      jsonResponse({ foo: "bar" })) as unknown as typeof fetch;
    const adapter = createOpenaiAsrAdapter({ fetch: fakeFetch });
    await expect(
      adapter.transcribeAudio!(spec, { audioBytes: new Uint8Array([1]) }),
    ).rejects.toBeInstanceOf(MultimodalGenerationError);
  });
});
