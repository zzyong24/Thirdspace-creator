import { describe, expect, it, vi } from "vitest";
import { transcribeAudio, type MultimodalSpec } from "./multimodal-factory";
import { createMimoAsrAdapter, splitMp3ForMimo } from "./multimodal-mimo-asr";

const spec: MultimodalSpec = {
  provider: "xiaomi-mimo",
  baseUrl: "https://api.xiaomimimo.com/v1",
  model: "mimo-v2.5-asr",
  token: "mimo-key",
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

describe("MiMo ASR adapter", () => {
  it("走官方 chat/completions + input_audio data URL，并解析正文", async () => {
    const fetchMock = vi.fn(async (_input: Parameters<typeof fetch>[0], _init?: RequestInit) =>
      new Response(
        JSON.stringify({
          choices: [{ message: { content: "这是一段逐字稿。" } }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    const result = await transcribeAudio(
      spec,
      { audioBytes: new Uint8Array([1, 2, 3]), language: "zh" },
      { "xiaomi-mimo": createMimoAsrAdapter({ fetch: fetchMock as typeof fetch }) },
    );
    expect(result.text).toBe("这是一段逐字稿。");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.xiaomimimo.com/v1/chat/completions");
    expect(init?.headers).toEqual({
      Authorization: "Bearer mimo-key",
      "Content-Type": "application/json",
    });
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    expect(body.model).toBe("mimo-v2.5-asr");
    expect(body.asr_options).toEqual({ language: "zh" });
    expect(JSON.stringify(body)).toContain("data:audio/mpeg;base64,AQID");
  });

  it("超过单次 base64 上限时按 MP3 帧拆分并按序合并正文", async () => {
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
    const audioBytes = mp3Frames(5);
    expect(splitMp3ForMimo(audioBytes, 800).map((chunk) => chunk.byteLength)).toEqual([
      576, 576, 288,
    ]);
    const result = await transcribeAudio(
      spec,
      { audioBytes, language: "zh" },
      {
        "xiaomi-mimo": createMimoAsrAdapter({
          fetch: fetchMock as typeof fetch,
          maxEncodedBytes: 800,
        }),
      },
    );
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result.text).toBe("第一段\n第二段\n第三段");
  });

  it("超限且不是可识别 MP3 时诚实失败，不做任意字节截断", async () => {
    expect(() => splitMp3ForMimo(new Uint8Array(1_000), 100)).toThrow(
      "无法按 MP3 帧安全分段",
    );
  });
});
