import { describe, expect, it, vi } from "vitest";
import { transcribeAudio, type MultimodalSpec } from "./multimodal-factory";
import { createQwenAsrAdapter } from "./multimodal-qwen-asr";

const spec: MultimodalSpec = {
  provider: "qwen-asr",
  baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
  model: "qwen3-asr-flash",
  token: "dashscope-key",
  kind: "audio",
};

function mp3Frames(count: number): Uint8Array {
  const frameLength = 288; // MPEG-2 Layer III, 64kbps, 16kHz
  const bytes = new Uint8Array(frameLength * count);
  for (let i = 0; i < count; i += 1) {
    const start = i * frameLength;
    bytes.set([0xff, 0xf3, 0x88, 0x00], start);
    bytes.fill(i + 1, start + 4, start + frameLength);
  }
  return bytes;
}

describe("Qwen ASR adapter", () => {
  it("走百炼兼容 chat/completions + input_audio，并解析逐字稿正文", async () => {
    let capturedUrl: Parameters<typeof fetch>[0] | undefined;
    let capturedInit: RequestInit | undefined;
    const fetchMock = vi.fn(
      async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
        capturedUrl = input;
        capturedInit = init;
        return new Response(
        JSON.stringify({
          choices: [{ message: { content: "这是一段四川话逐字稿。" } }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
        );
      },
    );

    const result = await transcribeAudio(
      spec,
      { audioBytes: new Uint8Array([1, 2, 3]), language: "zh" },
      { "qwen-asr": createQwenAsrAdapter({ fetch: fetchMock as typeof fetch }) },
    );

    expect(result).toEqual({ text: "这是一段四川话逐字稿。", language: "zh" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(capturedUrl).toBe(
      "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
    );
    expect(capturedInit?.headers).toEqual({
      Authorization: "Bearer dashscope-key",
      "Content-Type": "application/json",
    });
    const body = JSON.parse(String(capturedInit?.body)) as Record<string, unknown>;
    expect(body.model).toBe("qwen3-asr-flash");
    // CreatorOS 的默认 `zh` 提示不下发，让 Qwen 自动区分普通话与各地方言（含粤语）。
    expect(body.asr_options).toEqual({ enable_itn: true });
    expect(JSON.stringify(body)).toContain("data:audio/mpeg;base64,AQID");
  });

  it("调用方明确指定非默认语种时才锁定 language", async () => {
    let capturedBody = "";
    const fetchMock = vi.fn(
      async (_input: Parameters<typeof fetch>[0], init?: RequestInit) => {
        capturedBody = String(init?.body ?? "");
        return new Response(
          JSON.stringify({ choices: [{ message: { content: "粤语逐字稿" } }] }),
          { status: 200 },
        );
      },
    );

    await transcribeAudio(
      spec,
      { audioBytes: new Uint8Array([1, 2, 3]), language: "yue" },
      { "qwen-asr": createQwenAsrAdapter({ fetch: fetchMock as typeof fetch }) },
    );

    const body = JSON.parse(capturedBody) as {
      asr_options?: { language?: string };
    };
    expect(body.asr_options?.language).toBe("yue");
  });

  it("按安全 MP3 帧边界切段，逐段调用并按顺序合并", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ choices: [{ message: { content: "第一段" } }] }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ choices: [{ message: { content: "第二段" } }] }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ choices: [{ message: { content: "第三段" } }] }), {
          status: 200,
        }),
      );

    const result = await transcribeAudio(
      spec,
      { audioBytes: mp3Frames(5) },
      {
        "qwen-asr": createQwenAsrAdapter({
          fetch: fetchMock as typeof fetch,
          maxEncodedBytes: 800,
        }),
      },
    );

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result.text).toBe("第一段\n第二段\n第三段");
  });

  it("非 2xx 时保留厂商错误信息但不泄漏完整响应", async () => {
    const fetchMock = vi.fn(async () =>
      new Response("invalid api key: " + "x".repeat(500), { status: 401 }),
    );

    await expect(
      transcribeAudio(
        spec,
        { audioBytes: new Uint8Array([1, 2, 3]) },
        { "qwen-asr": createQwenAsrAdapter({ fetch: fetchMock as typeof fetch }) },
      ),
    ).rejects.toThrow(/Qwen ASR HTTP 401: invalid api key/);
  });
});
