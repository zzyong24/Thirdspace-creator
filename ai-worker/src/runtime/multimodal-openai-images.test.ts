import { describe, it, expect } from "vitest";
import { createOpenaiImagesAdapter } from "./multimodal-openai-images";
import {
  generateImage,
  MultimodalConfigError,
  MultimodalGenerationError,
  type MultimodalProviderRegistry,
  type MultimodalSpec,
} from "./multimodal-factory";

// 用注入的 fake fetch 验 OpenAI 兼容生图适配器**装配**(不走网络、不需 key)。断言:请求打到
// `{baseUrl}/v1/images/generations`、JSON body(model/prompt/n/size)、Authorization Bearer、
// 不发 response_format;响应 b64_json / url 两型都归一成 { assetBytes };错误分类人话。
// 真端点语义留给用户配 key 后验(用户样例:dudu.mom 中转 + gpt-image-2-4K)。

const spec: MultimodalSpec = {
  provider: "openai",
  baseUrl: "https://dudu.mom", // 裸域名(不含 /v1)—— 用户真实中转站样例
  model: "gpt-image-2-4K",
  token: "sk-img-test",
  kind: "image",
};

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

function bytesResponse(bytes: Uint8Array, ok = true, status = 200): Response {
  return {
    ok,
    status,
    arrayBuffer: async () =>
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  } as unknown as Response;
}

const PNG_B64 = Buffer.from([1, 2, 3, 4, 5]).toString("base64");

describe("OpenAI 兼容生图适配器 —— generateImage(同步一次请求)", () => {
  it("POST {baseUrl}/v1/images/generations,JSON(model/prompt/n/size)+Bearer → 解 b64_json 成字节", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fakeFetch = (async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      return jsonResponse({ data: [{ b64_json: PNG_B64 }] });
    }) as unknown as typeof fetch;

    const adapter = createOpenaiImagesAdapter({ fetch: fakeFetch });
    const out = await adapter.generateImage!(spec, {
      prompt: "一个纯色小圆点",
      aspectRatio: "1:1",
    });

    // b64_json → 解码成字节,与 minimax 同一出参契约 { assetBytes }。
    expect(out.assetBytes).toEqual(new Uint8Array([1, 2, 3, 4, 5]));

    // 请求打到 {baseUrl}/v1/images/generations(裸域名 → 补 /v1)。
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("https://dudu.mom/v1/images/generations");

    const init = calls[0]!.init!;
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer sk-img-test");
    expect(headers["Content-Type"]).toBe("application/json");

    // body:model/prompt/n/size;**不发 response_format**(gpt-image 系拒收)。
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body).toEqual({
      model: "gpt-image-2-4K",
      prompt: "一个纯色小圆点",
      n: 1,
      size: "1024x1024",
    });
    expect(body.response_format).toBeUndefined();
  });

  it("baseUrl 已含 /v1 或已是完整端点 → 归一不重复拼", async () => {
    const calls: string[] = [];
    const fakeFetch = (async (url: string) => {
      calls.push(String(url));
      return jsonResponse({ data: [{ b64_json: PNG_B64 }] });
    }) as unknown as typeof fetch;
    const adapter = createOpenaiImagesAdapter({ fetch: fakeFetch });

    await adapter.generateImage!(
      { ...spec, baseUrl: "https://dudu.mom/v1" },
      { prompt: "p" },
    );
    await adapter.generateImage!(
      { ...spec, baseUrl: "https://dudu.mom/v1/images/generations" },
      { prompt: "p" },
    );
    await adapter.generateImage!({ ...spec, baseUrl: null }, { prompt: "p" });

    expect(calls).toEqual([
      "https://dudu.mom/v1/images/generations",
      "https://dudu.mom/v1/images/generations",
      "https://api.openai.com/v1/images/generations", // null → OpenAI 官方默认
    ]);
  });

  it("aspectRatio 映射:9:16 → 1024x1536(竖),16:9 → 1536x1024(横),未知比例省略 size", async () => {
    const bodies: Array<Record<string, unknown>> = [];
    const fakeFetch = (async (_url: string, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return jsonResponse({ data: [{ b64_json: PNG_B64 }] });
    }) as unknown as typeof fetch;
    const adapter = createOpenaiImagesAdapter({ fetch: fakeFetch });

    await adapter.generateImage!(spec, { prompt: "p", aspectRatio: "9:16" });
    await adapter.generateImage!(spec, { prompt: "p", aspectRatio: "16:9" });
    await adapter.generateImage!(spec, { prompt: "p", aspectRatio: "21:9" });
    await adapter.generateImage!(spec, { prompt: "p" });

    expect(bodies[0]!.size).toBe("1024x1536");
    expect(bodies[1]!.size).toBe("1536x1024");
    expect(bodies[2]!.size).toBeUndefined(); // 映射不到 → 不硬猜
    expect(bodies[3]!.size).toBeUndefined(); // 未给比例 → 省略
  });

  it("未指定画幅时采用 Growth 下发的生图尺寸，未知字段不透传", async () => {
    let body: Record<string, unknown> = {};
    const fakeFetch = (async (_url: string, init?: RequestInit) => {
      body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return jsonResponse({ data: [{ b64_json: PNG_B64 }] });
    }) as unknown as typeof fetch;
    await createOpenaiImagesAdapter({ fetch: fakeFetch }).generateImage!(
      {
        ...spec,
        settings: { size: "1024x1024", n: 9, unsafe_unknown: "must-not-pass-through" },
      },
      { prompt: "p" },
    );
    expect(body).toEqual({
      model: "gpt-image-2-4K",
      prompt: "p",
      n: 1,
      size: "1024x1024",
    });
  });

  // [T-380] 以图生图:带 referenceImage → 走 /v1/images/edits multipart(image+prompt+
  // model+size),与 generations 的 JSON 是两种编码;无参考图路径完全不变(上面各测已覆盖)。
  it("referenceImage → POST /v1/images/edits,multipart form(image/prompt/model/size),不发 JSON", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fakeFetch = (async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      return jsonResponse({ data: [{ b64_json: PNG_B64 }] });
    }) as unknown as typeof fetch;

    const adapter = createOpenaiImagesAdapter({ fetch: fakeFetch });
    const out = await adapter.generateImage!(spec, {
      prompt: "延续参考封面风格",
      aspectRatio: "9:16",
      referenceImage: { bytes: new Uint8Array([7, 7, 7]), mimeType: "image/png" },
    });

    expect(out.assetBytes).toEqual(new Uint8Array([1, 2, 3, 4, 5]));
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("https://dudu.mom/v1/images/edits");

    const init = calls[0]!.init!;
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer sk-img-test");
    // multipart:不得手写 Content-Type(boundary 由 fetch 按 FormData 生成)。
    expect(headers["Content-Type"]).toBeUndefined();
    expect(init.body).toBeInstanceOf(FormData);
    const form = init.body as FormData;
    expect(form.get("prompt")).toBe("延续参考封面风格");
    expect(form.get("model")).toBe("gpt-image-2-4K");
    expect(form.get("n")).toBe("1");
    expect(form.get("size")).toBe("1024x1536");
    const image = form.get("image") as Blob;
    expect(image).toBeInstanceOf(Blob);
    expect(image.type).toBe("image/png");
    expect(new Uint8Array(await image.arrayBuffer())).toEqual(
      new Uint8Array([7, 7, 7]),
    );
  });

  it("baseUrl 配成完整 generations 端点 + referenceImage → 换末段成 /images/edits", async () => {
    const calls: string[] = [];
    const fakeFetch = (async (url: string) => {
      calls.push(String(url));
      return jsonResponse({ data: [{ b64_json: PNG_B64 }] });
    }) as unknown as typeof fetch;
    const adapter = createOpenaiImagesAdapter({ fetch: fakeFetch });
    await adapter.generateImage!(
      { ...spec, baseUrl: "https://dudu.mom/v1/images/generations" },
      {
        prompt: "p",
        referenceImage: { bytes: new Uint8Array([1]), mimeType: "image/jpeg" },
      },
    );
    expect(calls).toEqual(["https://dudu.mom/v1/images/edits"]);
  });

  it("url 型响应 → 再 GET 下载字节,归一成 { assetBytes }", async () => {
    const calls: string[] = [];
    const fakeFetch = (async (url: string, init?: RequestInit) => {
      calls.push(String(url));
      if (init?.method === "GET" || calls.length === 2) {
        return bytesResponse(new Uint8Array([9, 8, 7]));
      }
      return jsonResponse({
        data: [{ url: "https://cdn.example.com/out.png" }],
      });
    }) as unknown as typeof fetch;

    const adapter = createOpenaiImagesAdapter({ fetch: fakeFetch });
    const out = await adapter.generateImage!(spec, { prompt: "p" });

    expect(out.assetBytes).toEqual(new Uint8Array([9, 8, 7]));
    expect(calls).toEqual([
      "https://dudu.mom/v1/images/generations",
      "https://cdn.example.com/out.png",
    ]);
  });

  it("url 下载失败(非 2xx)→ MultimodalGenerationError", async () => {
    const fakeFetch = (async (url: string) => {
      if (String(url).includes("cdn")) {
        return bytesResponse(new Uint8Array(), false, 404);
      }
      return jsonResponse({ data: [{ url: "https://cdn.example.com/x.png" }] });
    }) as unknown as typeof fetch;
    const adapter = createOpenaiImagesAdapter({ fetch: fakeFetch });
    await expect(
      adapter.generateImage!(spec, { prompt: "p" }),
    ).rejects.toBeInstanceOf(MultimodalGenerationError);
  });

  it("HTTP 401 → 鉴权失败人话;4xx → 参数/模型名人话;5xx → 服务端人话", async () => {
    const mk = (status: number) =>
      createOpenaiImagesAdapter({
        fetch: (async () =>
          jsonResponse({ error: "x" }, false, status)) as unknown as typeof fetch,
      });

    await expect(mk(401).generateImage!(spec, { prompt: "p" })).rejects.toThrow(
      /鉴权失败\(HTTP 401\)/,
    );
    await expect(mk(400).generateImage!(spec, { prompt: "p" })).rejects.toThrow(
      /请求被拒\(HTTP 400\).*模型名不对或参数/,
    );
    await expect(mk(502).generateImage!(spec, { prompt: "p" })).rejects.toThrow(
      /服务端错误\(HTTP 502\)/,
    );
  });

  it("响应 data[0] 既无 b64_json 也无 url → MultimodalGenerationError(不假成功)", async () => {
    const fakeFetch = (async () =>
      jsonResponse({ data: [{}] })) as unknown as typeof fetch;
    const adapter = createOpenaiImagesAdapter({ fetch: fakeFetch });
    await expect(
      adapter.generateImage!(spec, { prompt: "p" }),
    ).rejects.toBeInstanceOf(MultimodalGenerationError);
  });

  it("工厂路由:registry 按 provider 'openai' 分派到本适配器;不支持视频诚实报错", async () => {
    const fakeFetch = (async () =>
      jsonResponse({ data: [{ b64_json: PNG_B64 }] })) as unknown as typeof fetch;
    const adapter = createOpenaiImagesAdapter({ fetch: fakeFetch });
    const registry: MultimodalProviderRegistry = { openai: adapter };

    // image.generate → 路由到本适配器,统一 { assetBytes } 出参。
    const out = await generateImage(spec, { prompt: "p" }, registry);
    expect(out.assetBytes).toEqual(new Uint8Array([1, 2, 3, 4, 5]));

    // 本适配器不实现 generateVideo → 工厂报 MultimodalConfigError(诚实禁用,非假成功)。
    const { generateVideo } = await import("./multimodal-factory");
    await expect(
      generateVideo({ ...spec, kind: "video" }, { prompt: "p" }, registry),
    ).rejects.toBeInstanceOf(MultimodalConfigError);
  });
});
