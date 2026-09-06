import { it, expect, vi } from "vitest";
import { streamText, tool, jsonSchema } from "ai";
import type {
  LanguageModelV4,
  LanguageModelV4StreamPart,
} from "@ai-sdk/provider";
import { createDurableStreamModel } from "./durable-stream-model";
const usage = {
    inputTokens: { total: 2, noCache: 2, cacheRead: 0, cacheWrite: 0 },
    outputTokens: { total: 3, text: 3, reasoning: 0 },
  },
  finish = {
    type: "finish",
    usage,
    finishReason: { unified: "stop", raw: "stop" },
  } as const;
function fixture(parts: LanguageModelV4StreamPart[], failSettle = false) {
  let saved: unknown;
  const states: string[] = [];
  const provider: LanguageModelV4 = {
    specificationVersion: "v4",
    provider: "fixture",
    modelId: "fixture",
    supportedUrls: {},
    doGenerate: async () => {
      throw Error("no nonstream");
    },
    doStream: vi.fn(async () => ({
      stream: new ReadableStream({
        start(c) {
          for (const part of parts) c.enqueue(part);
          c.close();
        },
      }),
    })),
  };
  const ports = {
    reserve: vi.fn(async () => ({
      callId: "call",
      status: saved ? "settled" : "reserved",
      ...(saved ? { providerResult: saved } : {}),
    })),
    start: vi.fn(async () => {
      states.push("start");
    }),
    settle: vi.fn(async (_id: string, value: any) => {
      states.push(value.status);
      if (failSettle && value.status === "settled") throw Error("lost ack");
      if (value.status === "settled") saved = value.providerResult;
    }),
  };
  const model = (streamEvents?:Parameters<typeof createDurableStreamModel>[0]["streamEvents"]) =>
    createDurableStreamModel({ model: provider, operationKey: "chat", ports,streamEvents });
  return { provider, ports, model, states };
}
const textParts: LanguageModelV4StreamPart[] = [
  { type: "stream-start", warnings: [] },
  { type: "text-start", id: "t" },
  { type: "text-delta", id: "t", delta: "真实正文" },
  { type: "text-end", id: "t" },
  finish,
];
it("完整流回执可重建模型直接回放，不再次访问供应商，保留真实用量", async () => {
  const f = fixture(textParts),
    first = streamText({ model: f.model(), prompt: "问题", maxRetries: 0 });
  expect(await first.text).toBe("真实正文");
  expect(f.states).toEqual(["start", "settled"]);
  const again = streamText({ model: f.model(), prompt: "问题", maxRetries: 0 });
  expect(await again.text).toBe("真实正文");
  expect((await again.totalUsage).inputTokens).toBe(2);
  expect(f.provider.doStream).toHaveBeenCalledTimes(1);
});
it("工具调用只在模型回执保存后交给SDK执行", async () => {
  const parts: LanguageModelV4StreamPart[] = [
    { type: "stream-start", warnings: [] },
    { type: "tool-input-start", id: "tool", toolName: "read" },
    { type: "tool-input-delta", id: "tool", delta: "{}" },
    { type: "tool-input-end", id: "tool" },
    { type: "tool-call", toolCallId: "tool", toolName: "read", input: "{}" },
    { ...finish, finishReason: { unified: "tool-calls", raw: "tool_calls" } },
  ];
  const f = fixture(parts),
    execute = vi.fn(async () => {
      expect(f.states).toEqual(["start", "settled"]);
      return { text: "真实工具结果" };
    });
  const result = streamText({
    model: f.model(),
    prompt: "读资料",
    maxRetries: 0,
    tools: {
      read: tool({ inputSchema: jsonSchema({ type: "object" }), execute }),
    },
  });
  await result.consumeStream();
  expect(execute).toHaveBeenCalledTimes(1);
});
it("模型回执保存失败不能放出工具调用，也不能标为可重试拒绝", async () => {
  const f = fixture(
      [
        { type: "stream-start", warnings: [] },
        {
          type: "tool-call",
          toolCallId: "tool",
          toolName: "read",
          input: "{}",
        },
        {
          ...finish,
          finishReason: { unified: "tool-calls", raw: "tool_calls" },
        },
      ],
      true,
    ),
    execute = vi.fn(async () => ({}));
  const errors: unknown[] = [];
  await streamText({
    model: f.model(),
    prompt: "读资料",
    maxRetries: 0,
    tools: {
      read: tool({ inputSchema: jsonSchema({ type: "object" }), execute }),
    },
    onError: (e) => {
      errors.push(e.error);
    },
  }).consumeStream();
  expect(execute).not.toHaveBeenCalled();
  expect(errors.length).toBeGreaterThan(0);
  expect(f.states).not.toContain("rejected");
});
it.each(["missing-finish", "error"])(
  "流中%s记结果未知，不把半段正文当完成回执",
  async (mode) => {
    const f = fixture([
        ...textParts.slice(0, -1),
        ...(mode === "error"
          ? [{ type: "error", error: Error("stream failed") } as const]
          : []),
      ]),
      errors: unknown[] = [];
    await streamText({
      model: f.model(),
      prompt: "问题",
      maxRetries: 0,
      onError: (e) => {
        errors.push(e.error);
      },
    }).consumeStream();
    expect(f.states).toEqual(["start", "unknown"]);
    expect(errors.length).toBeGreaterThan(0);
  },
);
it("供应商明确429拒绝进入重试等待，网络提交未知禁止重提", async () => {
  for (const error of [
    Object.assign(Error("rate limit"), {
      statusCode: 429,
      responseHeaders: { "retry-after": "1" },
    }),
    Error("connection closed"),
  ]) {
    const f = fixture([]);
    vi.mocked(f.provider.doStream).mockRejectedValueOnce(error);
    const errors: any[] = [];
    await streamText({
      model: f.model(),
      prompt: "问题",
      maxRetries: 0,
      onError: (e) => {
        errors.push(e.error);
      },
    }).consumeStream();
    expect(f.states).toEqual([
      "start",
      "statusCode" in error ? "rejected" : "unknown",
    ]);
    expect(errors[0]?.outcome).toBe(
      "statusCode" in error ? "retry_wait" : "unknown_result",
    );
    expect(f.provider.doStream).toHaveBeenCalledTimes(1);
  }
});
it("直接取消流只把已开始调用记未知，不发布工具调用或完成", async () => {
  const f = fixture(textParts),
    result = await f
      .model()
      .doStream({
        prompt: [{ role: "user", content: [{ type: "text", text: "问题" }] }],
      }),
    reader = result.stream.getReader();
  expect((await reader.read()).value?.type).toBe("stream-start");
  await reader.cancel();
  expect(f.states).toEqual(["start", "unknown"]);
});
it("文件字节、文件URL和响应时间可以经过JSON持久化回放", async () => {
  const timestamp = new Date("2026-09-05T00:00:00.000Z"),
    f = fixture([
      { type: "stream-start", warnings: [] },
      { type: "response-metadata", timestamp },
      {
        type: "file",
        mediaType: "image/png",
        data: { type: "data", data: new Uint8Array([1, 2, 3]) },
      },
      {
        type: "file",
        mediaType: "image/png",
        data: { type: "url", url: new URL("https://example.com/image.png") },
      },
      finish,
    ]);
  const first = await f.model().doStream({ prompt: [] });
  const firstReader = first.stream.getReader();
  while (!(await firstReader.read()).done) {}
  const replay = await f.model().doStream({ prompt: [] }),
    parts: LanguageModelV4StreamPart[] = [];
  const replayReader = replay.stream.getReader();
  while (true) {
    const next = await replayReader.read();
    if (next.done) break;
    parts.push(next.value);
  }
  expect(parts.find((p) => p.type === "response-metadata")).toMatchObject({
    timestamp,
  });
  expect(parts.filter((p) => p.type === "file")).toMatchObject([
    { data: { type: "data", data: "AQID" } },
    { data: { type: "url", url: new URL("https://example.com/image.png") } },
  ]);
  expect(f.provider.doStream).toHaveBeenCalledTimes(1);
});
it("真实SDK和本地SSE产生工具调用，JSON回执重放不再请求供应商", async () => {
  const { createServer } = await import("node:http"),
    { modelFor } = await import("../runtime/provider-factory");
  let requests = 0;
  const server = createServer((req, res) => {
    req.resume();
    requests++;
    res.writeHead(200, { "content-type": "text/event-stream" });
    res.end(
      'data: {"id":"fixture","object":"chat.completion.chunk","created":1,"model":"fixture","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"id":"call-read","type":"function","function":{"name":"read","arguments":"{\\"query\\":\\"真实查询\\"}"}}]},"finish_reason":null}]}\n\ndata: {"id":"fixture","object":"chat.completion.chunk","created":1,"model":"fixture","choices":[{"index":0,"delta":{},"finish_reason":"tool_calls"}],"usage":{"prompt_tokens":2,"completion_tokens":3,"total_tokens":5}}\n\ndata: [DONE]\n\n',
    );
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const f = fixture([]),
    provider = modelFor({
      apiFormat: "openai_chat",
      baseUrl: `http://127.0.0.1:${(server.address() as { port: number }).port}/v1`,
      model: "fixture",
      token: "fixture",
    });
  try {
    for (let i = 0; i < 2; i++) {
      const result = streamText({
        model: createDurableStreamModel({
          model: provider,
          operationKey: "chat",
          ports: f.ports,
        }),
        prompt: "查询资料",
        maxRetries: 0,
        tools: {
          read: tool({
            inputSchema: jsonSchema<{ query: string }>({
              type: "object",
              properties: { query: { type: "string" } },
              required: ["query"],
            }),
          }),
        },
      });
      expect(await result.toolCalls).toMatchObject([
        {
          toolCallId: "call-read",
          toolName: "read",
          input: { query: "真实查询" },
        },
      ]);
    }
    expect(requests).toBe(1);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
  }
});

it('等待模型保存回执时取消，不向SDK发布后续工具调用', async () => {
  const f = fixture([
    {type:'stream-start',warnings:[]},
    {type:'tool-call',toolCallId:'tool',toolName:'read',input:'{}'},
    {...finish,finishReason:{unified:'tool-calls',raw:'tool_calls'}},
  ]);
  let release!:()=>void,entered!:()=>void;
  const held=new Promise<void>(r=>release=r),seen=new Promise<void>(r=>entered=r);
  const original=f.ports.settle.getMockImplementation()!;
  f.ports.settle.mockImplementation(async(id,value)=>{if(value.status==='settled'){entered();await held;}return original(id,value);});
  const result=await f.model().doStream({prompt:[]}),reader=result.stream.getReader();
  expect((await reader.read()).value?.type).toBe('stream-start');
  const pending=reader.read();await seen;const cancelled=reader.cancel();release();await cancelled;
  expect((await pending).done).toBe(true);expect(f.states).toEqual(['start','settled']);
});

it("展示流结算前保存，历史模型回放不再发布增量",async()=>{
 const f=fixture(textParts);
 const push=vi.fn(async()=>{f.states.push("display");});
 const close=vi.fn(async()=>{f.states.push("flush");});
 const events=vi.fn((callId:string)=>{expect(callId).toBe("call");return {push,close};});
 expect(await streamText({model:f.model(events),prompt:"问题",maxRetries:0}).text).toBe("真实正文");
 expect(f.states.indexOf("flush")).toBeLessThan(f.states.indexOf("settled"));
 expect(await streamText({model:f.model(events),prompt:"问题",maxRetries:0}).text).toBe("真实正文");
 expect(events).toHaveBeenCalledTimes(1);expect(close).toHaveBeenCalledTimes(1);expect(f.provider.doStream).toHaveBeenCalledTimes(1);
});
it("展示流保存回执丢失不能先结算模型再重放供应商",async()=>{
 const f=fixture(textParts), errors:unknown[]=[];
 const result=await f.model(()=>({push:async()=>{},close:async()=>{throw Error("save ack lost");}})).doStream({prompt:[]});
 const reader=result.stream.getReader();
 while(true){const next=await reader.read();if(next.done)break;if(next.value.type==="error")errors.push(next.value.error);}
 expect(errors).toHaveLength(1);expect(f.states).toEqual(["start","unknown"]);
 expect(f.provider.doStream).toHaveBeenCalledTimes(1);
});
