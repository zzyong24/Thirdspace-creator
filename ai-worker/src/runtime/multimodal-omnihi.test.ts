import { describe, expect, it, vi } from "vitest";

import {
  MultimodalGenerationError,
  type MultimodalSpec,
} from "./multimodal-factory";
import {
  createOmnihiVideoAdapter,
  type OmnihiVideoAdapterDeps,
} from "./multimodal-omnihi";

const spec: MultimodalSpec = {
  provider: "seeddance",
  baseUrl: "https://api.omnihi.ai/media/v1/",
  model: "seedance/seedance-2.0-fast",
  token: "test-key",
  kind: "video",
};

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
    arrayBuffer: async () => new ArrayBuffer(0),
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

function deps(fetchImpl: typeof fetch): OmnihiVideoAdapterDeps {
  return {
    fetch: fetchImpl,
    sleep: async () => {},
    pollIntervalMs: 0,
    maxPollAttempts: 10,
  };
}

describe("OmniHi / Seedance 文生视频适配器", () => {
  it("按 videos/generations → jobs/{id} → 下载编排，兼容 seeddance 历史 provider", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const sequence: Response[] = [
      jsonResponse({ jobId: "job-1" }),
      jsonResponse({ status: "processing" }),
      jsonResponse({ status: "completed", output: { url: "https://cdn.example/video.mp4" } }),
      bytesResponse(new Uint8Array([1, 2, 3])),
    ];
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      return sequence[calls.length - 1]!;
    }) as unknown as typeof fetch;

    const out = await createOmnihiVideoAdapter(deps(fetchImpl)).generateVideo!(
      spec,
      { prompt: "客厅门口，家人伸手拦住机器人", aspectRatio: "9:16" },
    );

    expect(Array.from(out.assetBytes)).toEqual([1, 2, 3]);
    expect(calls.map((call) => call.url)).toEqual([
      "https://api.omnihi.ai/media/v1/videos/generations",
      "https://api.omnihi.ai/media/v1/jobs/job-1",
      "https://api.omnihi.ai/media/v1/jobs/job-1",
      "https://cdn.example/video.mp4",
    ]);
    expect(calls[0]!.init?.headers).toMatchObject({
      Authorization: "Bearer test-key",
    });
    expect(JSON.parse(String(calls[0]!.init?.body))).toEqual({
      model: "seedance/seedance-2.0-fast",
      input: { prompt: "客厅门口，家人伸手拦住机器人" },
      parameters: {
        mode: "t2v",
        duration: 4,
        resolution: "480p",
        aspect_ratio: "9:16",
        generate_audio: false,
      },
    });
  });

  it("兼容任务结果放在 data.results 的异步响应", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ data: { job_id: "job-results" } }))
      .mockResolvedValueOnce(
        jsonResponse({
          data: {
            status: "completed",
            results: ["https://cdn.example.com/result.mp4"],
          },
        }),
      )
      .mockResolvedValueOnce(bytesResponse(new Uint8Array([7, 8, 9])));

    const out = await createOmnihiVideoAdapter(deps(fetchImpl)).generateVideo!(
      spec,
      { prompt: "客厅门口，机器人被拦下" },
    );

    expect(out.assetBytes).toEqual(new Uint8Array([7, 8, 9]));
  });

  it("兼容 data.id 与 data.outputs[0].url 的中转响应包裹", async () => {
    const sequence: Response[] = [
      jsonResponse({ data: { id: "job-nested" } }),
      jsonResponse({ data: { status: "succeeded", outputs: [{ url: "https://cdn.example/nested.mp4" }] } }),
      bytesResponse(new Uint8Array([9, 8])),
    ];
    let index = 0;
    const fetchImpl = (async () => sequence[index++]!) as unknown as typeof fetch;
    const out = await createOmnihiVideoAdapter(deps(fetchImpl)).generateVideo!(
      { ...spec, provider: "omnihi" },
      { prompt: "test" },
    );
    expect(Array.from(out.assetBytes)).toEqual([9, 8]);
  });

  it("任务失败与轮询超时都返回明确生成错误", async () => {
    const failed = [
      jsonResponse({ id: "job-failed" }),
      jsonResponse({ status: "failed", error: { message: "content rejected" } }),
    ];
    let failedIndex = 0;
    await expect(
      createOmnihiVideoAdapter(
        deps((async () => failed[failedIndex++]!) as unknown as typeof fetch),
      ).generateVideo!(spec, { prompt: "x" }),
    ).rejects.toThrow(/任务失败/);

    const timeoutDeps = deps(
      (async (url: string) =>
        String(url).endsWith("/videos/generations")
          ? jsonResponse({ id: "job-timeout" })
          : jsonResponse({ status: "processing" })) as unknown as typeof fetch,
    );
    timeoutDeps.maxPollAttempts = 2;
    await expect(
      createOmnihiVideoAdapter(timeoutDeps).generateVideo!(spec, { prompt: "x" }),
    ).rejects.toBeInstanceOf(MultimodalGenerationError);
  });
});
