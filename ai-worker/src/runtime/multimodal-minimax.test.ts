import { describe, it, expect } from "vitest";
import { createMinimaxAdapter, type MinimaxAdapterDeps } from "./multimodal-minimax";
import {
  MultimodalGenerationError,
  type MultimodalSpec,
} from "./multimodal-factory";

// 用注入的 fake fetch/sleep 验 MiniMax 适配器**装配**(不走网络、不需 key)。这覆盖
// 真产物没法零成本验的那部分逻辑:image 同步解 base64、video「提交→轮询→下载」的编排 +
// 状态机(Processing→Success)+ 超时/失败态。真 endpoint 语义留给用户配 key 后验(SPEC §7)。

const spec: MultimodalSpec = {
  provider: "minimax",
  baseUrl: null,
  model: "image-01",
  token: "sk-test",
  kind: "image",
};

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
    arrayBuffer: async () => new Uint8Array().buffer,
  } as unknown as Response;
}
function bytesResponse(bytes: Uint8Array): Response {
  return {
    ok: true,
    status: 200,
    arrayBuffer: async () =>
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  } as unknown as Response;
}

function deps(fetchImpl: typeof fetch): MinimaxAdapterDeps {
  return {
    fetch: fetchImpl,
    sleep: async () => {}, // 即时,零成本
    pollIntervalMs: 0,
    maxPollAttempts: 10,
  };
}

describe("MiniMax 适配器 —— image(同步)", () => {
  it("POST /v1/image_generation,解 data.image_base64[0] → assetBytes", async () => {
    const helloB64 = Buffer.from("hello").toString("base64");
    const calls: string[] = [];
    const fakeFetch = (async (url: string, init?: RequestInit) => {
      calls.push(String(url));
      expect(String(url)).toContain("/v1/image_generation");
      expect((init?.headers as Record<string, string>).Authorization).toBe(
        "Bearer sk-test",
      );
      return jsonResponse({
        data: { image_base64: [helloB64] },
        metadata: { success_count: 1, failed_count: 0 },
      });
    }) as unknown as typeof fetch;

    const adapter = createMinimaxAdapter(deps(fakeFetch));
    const out = await adapter.generateImage!(spec, {
      prompt: "iceberg",
      aspectRatio: "9:16",
    });
    expect(Buffer.from(out.assetBytes).toString()).toBe("hello");
    expect(calls).toHaveLength(1);
  });

  // [T-380] 以图生图:带 referenceImage → body 加 subject_reference(data URL base64);
  // 无参考图 → 不发该字段(零回归)。字段名按官方文档惯例写,真 key 实测待用户验(文件头诚实边界)。
  it("referenceImage → body 带 subject_reference[{type:'character',image_file:<data URL>}];无参考不发", async () => {
    const helloB64 = Buffer.from("hello").toString("base64");
    const bodies: Array<Record<string, unknown>> = [];
    const fakeFetch = (async (_url: string, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return jsonResponse({
        data: { image_base64: [helloB64] },
        metadata: { success_count: 1, failed_count: 0 },
      });
    }) as unknown as typeof fetch;

    const adapter = createMinimaxAdapter(deps(fakeFetch));
    await adapter.generateImage!(spec, {
      prompt: "延续参考封面风格",
      referenceImage: { bytes: new Uint8Array([9, 9]), mimeType: "image/png" },
    });
    await adapter.generateImage!(spec, { prompt: "纯文生图" });

    const ref = bodies[0]!.subject_reference as Array<Record<string, unknown>>;
    expect(Array.isArray(ref)).toBe(true);
    expect(ref[0]!.type).toBe("character");
    expect(ref[0]!.image_file).toBe(
      `data:image/png;base64,${Buffer.from([9, 9]).toString("base64")}`,
    );
    expect(bodies[1]!.subject_reference).toBeUndefined();
  });

  it("success_count=0 / 无 image_base64 → MultimodalGenerationError(内容审核态)", async () => {
    const fakeFetch = (async () =>
      jsonResponse({
        data: { image_base64: [] },
        metadata: { success_count: 0, failed_count: 1 },
      })) as unknown as typeof fetch;
    const adapter = createMinimaxAdapter(deps(fakeFetch));
    await expect(
      adapter.generateImage!(spec, { prompt: "x" }),
    ).rejects.toBeInstanceOf(MultimodalGenerationError);
  });

  it("HTTP 非 2xx → MultimodalGenerationError", async () => {
    const fakeFetch = (async () =>
      jsonResponse({ error: "bad" }, false, 401)) as unknown as typeof fetch;
    const adapter = createMinimaxAdapter(deps(fakeFetch));
    await expect(
      adapter.generateImage!(spec, { prompt: "x" }),
    ).rejects.toBeInstanceOf(MultimodalGenerationError);
  });
});

describe("MiniMax 适配器 —— video(异步:提交→轮询→下载,全在适配器内)", () => {
  const videoSpec: MultimodalSpec = { ...spec, model: "T2V-01", kind: "video" };

  it("Processing×2 → Success(file_id) → files/retrieve → 下载字节;上层只见 assetBytes", async () => {
    const videoBytes = new Uint8Array([1, 2, 3, 4]);
    const seq: Response[] = [
      // 1) 提交
      jsonResponse({ task_id: "task-abc" }),
      // 2) 轮询:Processing, Processing, Success
      jsonResponse({ status: "Processing" }),
      jsonResponse({ status: "Processing" }),
      jsonResponse({ status: "Success", file_id: "file-xyz" }),
      // 3) files/retrieve → download_url
      jsonResponse({ file: { download_url: "https://dl.example/v.mp4" } }),
      // 4) 下载字节
      bytesResponse(videoBytes),
    ];
    const urls: string[] = [];
    let i = 0;
    const fakeFetch = (async (url: string) => {
      urls.push(String(url));
      return seq[i++];
    }) as unknown as typeof fetch;

    const adapter = createMinimaxAdapter(deps(fakeFetch));
    const out = await adapter.generateVideo!(videoSpec, { prompt: "spinning cube" });

    expect(Array.from(out.assetBytes)).toEqual([1, 2, 3, 4]);
    // 上层契约:只有 assetBytes,无 taskId/file_id([gate-F1])。
    expect(Object.keys(out)).toEqual(["assetBytes"]);
    // 编排顺序对:submit → 3×poll → retrieve → download。
    expect(urls[0]).toContain("/v1/video_generation");
    expect(urls[1]).toContain("/v1/query/video_generation?task_id=task-abc");
    expect(urls[4]).toContain("/v1/files/retrieve?file_id=file-xyz");
    expect(urls[5]).toBe("https://dl.example/v.mp4");
    expect(urls).toHaveLength(6);
  });

  it("task 返 Fail → MultimodalGenerationError", async () => {
    const seq: Response[] = [
      jsonResponse({ task_id: "t" }),
      jsonResponse({ status: "Fail" }),
    ];
    let i = 0;
    const fakeFetch = (async () => seq[i++]) as unknown as typeof fetch;
    const adapter = createMinimaxAdapter(deps(fakeFetch));
    await expect(
      adapter.generateVideo!(videoSpec, { prompt: "x" }),
    ).rejects.toBeInstanceOf(MultimodalGenerationError);
  });

  it("轮询超过 maxPollAttempts 仍 Processing → 超时 MultimodalGenerationError", async () => {
    const fakeFetch = (async (url: string) => {
      if (String(url).includes("/v1/video_generation"))
        return jsonResponse({ task_id: "t" });
      return jsonResponse({ status: "Processing" }); // 永不 ready
    }) as unknown as typeof fetch;
    const d = deps(fakeFetch);
    d.maxPollAttempts = 3;
    const adapter = createMinimaxAdapter(d);
    await expect(
      adapter.generateVideo!(videoSpec, { prompt: "x" }),
    ).rejects.toThrow(/轮询超时/);
  });
});
