import { describe, it, expect, vi } from "vitest";
import {createServer} from "node:http";
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

it.each(["submit","download"])("H3 %s 保留供应商 Retry-After",async stage=>{
 const fetchImpl=vi.fn(async()=>stage==="submit" || fetchImpl.mock.calls.length>1
  ?new Response("busy",{status:429,headers:{"Retry-After":"120"}})
  :jsonResponse({task:{status:"succeeded",content:{url:"https://dl.example/video"}}}));
 await expect(createMinimaxAdapter(deps(fetchImpl as typeof fetch)).generateVideo!({...spec,kind:"video",model:"MiniMax-H3"},{prompt:"片段",...(stage==="download"?{resumeJobId:"saved-job"}:{})})).rejects.toMatchObject({stage,status:429,retryAfterMs:120000});
});
it("H3 下载连接中断保留可恢复阶段",async()=>{
 const fetchImpl=vi.fn(async()=>fetchImpl.mock.calls.length===1
  ?jsonResponse({task:{status:"succeeded",content:{url:"https://dl.example/video"}}})
  :new Response(new ReadableStream({start(controller){controller.error(new TypeError("terminated"));}})));
 await expect(createMinimaxAdapter(deps(fetchImpl as typeof fetch)).generateVideo!({...spec,kind:"video",model:"MiniMax-H3"},{prompt:"片段",resumeJobId:"saved-job"})).rejects.toMatchObject({stage:"download",reason:"network",retryable:true});
});

it("旧版视频恢复使用已存 job，不再次计费提交",async()=>{
 const calls:string[]=[],submitted=vi.fn();
 const fetchImpl=(async(url:unknown,init?:RequestInit)=>{
  calls.push(String(url));expect(init?.method).toBe("GET");
  if(String(url).includes("/query/"))return jsonResponse({status:"Success",file_id:"file"});
  if(String(url).includes("/files/"))return jsonResponse({file:{download_url:"https://dl.example/video"}});
  return bytesResponse(new Uint8Array([1]));
 }) as typeof fetch;
 await createMinimaxAdapter(deps(fetchImpl)).generateVideo!({...spec,kind:"video",model:"MiniMax-Hailuo-2.3"},{prompt:"片段",resumeJobId:"saved-job",onJobSubmitted:submitted});
 expect(calls[0]).toContain("task_id=saved-job");expect(submitted).not.toHaveBeenCalled();
});
it("旧版视频取得任务号先持久确认，确认失败不轮询",async()=>{
 const fetchImpl=vi.fn(async()=>jsonResponse({task_id:"new-job"}));
 const onJobSubmitted=vi.fn(async()=>{throw new Error("checkpoint unavailable");});
 await expect(createMinimaxAdapter(deps(fetchImpl as typeof fetch)).generateVideo!({...spec,kind:"video",model:"MiniMax-Hailuo-2.3"},{prompt:"片段",onJobSubmitted})).rejects.toThrow("checkpoint unavailable");
 expect(onJobSubmitted).toHaveBeenCalledExactlyOnceWith("new-job");expect(fetchImpl).toHaveBeenCalledTimes(1);
});
it.each(["MiniMax-Hailuo-2.3","MiniMax-H3"])("%s 预取消不发任何请求",async model=>{
 const fetchImpl=vi.fn(async()=>jsonResponse({}));
 await expect(createMinimaxAdapter(deps(fetchImpl as typeof fetch)).generateVideo!({...spec,kind:"video",model},{prompt:"片段",signal:AbortSignal.abort(new Error("已停止"))} as never)).rejects.toThrow("已停止");
 expect(fetchImpl).not.toHaveBeenCalled();
});
it.each(["MiniMax-Hailuo-2.3","MiniMax-H3"])("%s 轮询等待中取消立即结束，不继续查询",async model=>{
 const controller=new AbortController(),sleep=vi.fn(async()=>new Promise<void>(()=>{}));
 const fetchImpl=vi.fn(async(_url:unknown,init?:RequestInit)=>{
  expect(init?.signal).toBe(controller.signal);
  return jsonResponse(model==="MiniMax-H3"?{task:{status:"running"}}:{status:"Processing"});
 });
 const pending=createMinimaxAdapter({...deps(fetchImpl as typeof fetch),sleep}).generateVideo!({...spec,kind:"video",model},{prompt:"片段",resumeJobId:"saved-job",signal:controller.signal} as never);
 const failure=expect(pending).rejects.toThrow("停止轮询");
 await vi.waitFor(()=>expect(sleep).toHaveBeenCalledTimes(1));controller.abort(new Error("停止轮询"));
 await failure;expect(fetchImpl).toHaveBeenCalledTimes(1);
});
it.each(["MiniMax-Hailuo-2.3","MiniMax-H3"])("%s 任务号确认期间取消，保存已提交事实但不开始查询",async model=>{
 const controller=new AbortController(),fetchImpl=vi.fn(async()=>jsonResponse({task_id:"accepted-job"}));
 const onJobSubmitted=vi.fn(async()=>{controller.abort(new Error("停止后续动作"));});
 await expect(createMinimaxAdapter(deps(fetchImpl as typeof fetch)).generateVideo!({...spec,kind:"video",model},{prompt:"片段",signal:controller.signal,onJobSubmitted})).rejects.toThrow("停止后续动作");
 expect(onJobSubmitted).toHaveBeenCalledExactlyOnceWith("accepted-job");expect(fetchImpl).toHaveBeenCalledTimes(1);
});
it.each(["MiniMax-Hailuo-2.3","MiniMax-H3"])("%s 查询已完成但读取正文期间取消，不进入下载",async model=>{
 const controller=new AbortController(),fetchImpl=vi.fn(async()=>({ok:true,json:async()=>{
  controller.abort(new Error("停止下载"));
  return model==="MiniMax-H3"?{task:{status:"succeeded",content:{url:"https://dl.example/video"}}}:{status:"Success",file_id:"file"};
 }} as Response));
 await expect(createMinimaxAdapter(deps(fetchImpl as typeof fetch)).generateVideo!({...spec,kind:"video",model},{prompt:"片段",resumeJobId:"saved-job",signal:controller.signal})).rejects.toThrow("停止下载");
 expect(fetchImpl).toHaveBeenCalledTimes(1);
});
it("真实本地 HTTP 查询在取消后关闭连接，无新提交或后续请求",async()=>{
 const controller=new AbortController(),calls:string[]=[];
 let received!:()=>void,disconnected!:()=>void;
 const ready=new Promise<void>(resolve=>{received=resolve;}),closed=new Promise<void>(resolve=>{disconnected=resolve;});
 const server=createServer((req,res)=>{calls.push(`${req.method} ${req.url}`);res.on("close",disconnected);received();});
 await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));
 try{
  const address=server.address();if(!address || typeof address==="string")throw new Error("缺少本地监听地址");
  const pending=createMinimaxAdapter().generateVideo!({...spec,kind:"video",model:"MiniMax-Hailuo-2.3",baseUrl:`http://127.0.0.1:${address.port}`},{prompt:"片段",resumeJobId:"local-job",signal:controller.signal});
  const failure=expect(pending).rejects.toThrow("本地停止");
  await ready;controller.abort(new Error("本地停止"));await failure;await closed;
  expect(calls).toEqual(["GET /v1/query/video_generation?task_id=local-job"]);
 }finally{
  controller.abort();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));
 }
});

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
    pollIntervalMs: 5000,
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

describe("MiniMax H3 v2 —— 分镜短片", () => {
  const h3Spec: MultimodalSpec = {
    ...spec,
    model: "MiniMax-H3",
    kind: "video",
  };

  it("纯文生视频走 /v2，冻结 duration/resolution/ratio，成功从 task.content.url 下载", async () => {
    const bodies: Array<Record<string, unknown>> = [];
    const urls: string[] = [];
    const fakeFetch = (async (url: string, init?: RequestInit) => {
      urls.push(String(url));
      if (String(url).endsWith("/v2/video_generation")) {
        bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
        return jsonResponse({ task_id: "h3-task" });
      }
      if (String(url).includes("/v2/query/video_generation/h3-task")) {
        return jsonResponse({
          task: {
            status: "succeeded",
            content: { url: "https://dl.example/h3.mp4" },
          },
        });
      }
      return bytesResponse(new Uint8Array([8, 3, 6]));
    }) as unknown as typeof fetch;

    const submitted: string[] = [];
    const out = await createMinimaxAdapter(deps(fakeFetch)).generateVideo!(
      h3Spec,
      {
        prompt: "one clear visual task",
        aspectRatio: "9:16",
        durationSec: 6,
        resolution: "768P",
        onJobSubmitted: async (jobId) => {
          submitted.push(jobId);
        },
      },
    );

    expect(Array.from(out.assetBytes)).toEqual([8, 3, 6]);
    expect(submitted).toEqual(["h3-task"]);
    expect(bodies[0]).toEqual({
      model: "MiniMax-H3",
      content: [{ type: "text", text: "one clear visual task" }],
      duration: 6,
      resolution: "768P",
      ratio: "9:16",
    });
    expect(urls).toEqual([
      "https://api.minimax.io/v2/video_generation",
      "https://api.minimax.io/v2/query/video_generation/h3-task",
      "https://dl.example/h3.mp4",
    ]);
  });

  it.each([
    [
      "纯域名",
      "https://api.minimaxi.com",
      "https://api.minimaxi.com/v2/video_generation",
      "https://api.minimaxi.com/v2/query/video_generation/h3-task",
    ],
    [
      "v2 版本根地址",
      "https://api.minimaxi.com/v2/",
      "https://api.minimaxi.com/v2/video_generation",
      "https://api.minimaxi.com/v2/query/video_generation/h3-task",
    ],
    [
      "完整提交接口",
      "https://api.minimaxi.com/v2/video_generation",
      "https://api.minimaxi.com/v2/video_generation",
      "https://api.minimaxi.com/v2/query/video_generation/h3-task",
    ],
    [
      "带路径的中转前缀",
      "https://relay.example/minimax",
      "https://relay.example/minimax/v2/video_generation",
      "https://relay.example/minimax/v2/query/video_generation/h3-task",
    ],
    [
      "中转完整提交接口",
      "https://relay.example/minimax/v2/video_generation/",
      "https://relay.example/minimax/v2/video_generation",
      "https://relay.example/minimax/v2/query/video_generation/h3-task",
    ],
  ])("baseUrl=%s 时只规范化一次，并从同一 v2 根地址查询", async (
    _label,
    baseUrl,
    expectedSubmit,
    expectedQuery,
  ) => {
    const urls: string[] = [];
    const fakeFetch = (async (url: string, init?: RequestInit) => {
      urls.push(String(url));
      if (init?.method === "POST") return jsonResponse({ task_id: "h3-task" });
      if (String(url).includes("/query/video_generation/")) {
        return jsonResponse({
          task: {
            status: "succeeded",
            content: { url: "https://dl.example/h3.mp4" },
          },
        });
      }
      return bytesResponse(new Uint8Array([8, 3, 7]));
    }) as unknown as typeof fetch;

    await createMinimaxAdapter(deps(fakeFetch)).generateVideo!(
      { ...h3Spec, baseUrl },
      { prompt: "one shot" },
    );

    expect(urls).toEqual([
      expectedSubmit,
      expectedQuery,
      "https://dl.example/h3.mp4",
    ]);
    expect(urls.filter((url) => url === expectedSubmit)).toHaveLength(1);
  });

  it("时长越界在 POST 前失败", async () => {
    let called = false;
    const fakeFetch = (async () => {
      called = true;
      return jsonResponse({});
    }) as unknown as typeof fetch;
    await expect(
      createMinimaxAdapter(deps(fakeFetch)).generateVideo!(h3Spec, {
        prompt: "x",
        durationSec: 3,
        resolution: "768P",
      }),
    ).rejects.toBeInstanceOf(MultimodalGenerationError);
    expect(called).toBe(false);
  });

  it.each([
    [401, "authentication"],
    [402, "credit_exhausted"],
    [422, "response_contract"],
    [429, "rate_limited"],
    [503, "upstream"],
  ] as const)("提交 HTTP %s 保留可诊断错误分类 %s", async (status, reason) => {
    const fakeFetch = (async () =>
      jsonResponse({ error: "provider failure" }, false, status)) as unknown as typeof fetch;
    const promise = createMinimaxAdapter(deps(fakeFetch)).generateVideo!(h3Spec, {
      prompt: "one shot",
    });

    await expect(promise).rejects.toMatchObject({
      reason,
      stage: "submit",
      status,
    });
  });

  it("成功态缺少 HTTPS 成片地址时拒绝伪装成功", async () => {
    const fakeFetch = (async (url: string) => {
      if (String(url).endsWith("/v2/video_generation")) {
        return jsonResponse({ task_id: "missing-url" });
      }
      return jsonResponse({ task: { status: "succeeded", content: {} } });
    }) as unknown as typeof fetch;

    await expect(
      createMinimaxAdapter(deps(fakeFetch)).generateVideo!(h3Spec, {
        prompt: "one shot",
      }),
    ).rejects.toMatchObject({ reason: "response_contract", stage: "poll" });
  });

  it("resumeJobId 跳过计费 POST，只查询并下载", async () => {
    const urls: string[] = [];
    const fakeFetch = (async (url: string) => {
      urls.push(String(url));
      if (String(url).includes("/v2/query/")) {
        return jsonResponse({
          task: {
            status: "succeeded",
            content: { url: "https://dl.example/resumed.mp4" },
          },
        });
      }
      return bytesResponse(new Uint8Array([9]));
    }) as unknown as typeof fetch;

    await createMinimaxAdapter(deps(fakeFetch)).generateVideo!(h3Spec, {
      prompt: "same frozen prompt",
      durationSec: 4,
      resolution: "768P",
      resumeJobId: "persisted-job",
    });

    expect(urls[0]).toContain("/v2/query/video_generation/persisted-job");
    expect(urls.some((url) => url.endsWith("/v2/video_generation"))).toBe(false);
  });
});
