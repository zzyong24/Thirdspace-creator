import { describe, it, expect, vi } from "vitest";
import { streamText, simulateReadableStream, consumeStream } from "ai";
import { MockLanguageModelV3 } from "ai/test";

// [T-163 Batch 3 / gate 关切③] chat 流式管线本地验证 —— 用 mock 模型(ai/test 的
// MockLanguageModelV3,不发网络、**无需真 model key**)跑通 streamText → 逐 token 流式组装 →
// toUIMessageStreamResponse(SSE)→ onFinish。这正是 T-163 SPEC §3.2 标为「backend 无 SSE、
// 全链最脆一环」、原 chat-runner.test 注明「真正的 streamText 需 dev server+key、本环境不跑」
// 的那部分 —— 用 mock 模型把它从「产品方真机」收窄成本地可验证(真 key 只再需于真内容,
// 不再需于验证管线本身)。

// doStream 的返回类型(从 MockLanguageModelV3 构造器提取,避免直引 @ai-sdk/provider 内部类型
// ——它不在 backend 可直接解析的 dep 面上)。用于给 simulateReadableStream 的 stream 精确 cast。
type DoStreamReturn = Awaited<ReturnType<MockLanguageModelV3["doStream"]>>;

/** 一个吐两段 text-delta 后 finish 的 mock 模型(ai v7 V3 流式 part 序列)。 */
function twoChunkModel() {
  return new MockLanguageModelV3({
    doStream: async (): Promise<DoStreamReturn> => ({
      stream: simulateReadableStream({
        chunks: [
          { type: "text-start", id: "0" },
          { type: "text-delta", id: "0", delta: "你好" },
          { type: "text-delta", id: "0", delta: ",世界" },
          { type: "text-end", id: "0" },
          {
            type: "finish",
            finishReason: "stop",
            usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
          },
        ],
      }) as DoStreamReturn["stream"],
    }),
  });
}

describe("[T-163] chat 流式管线(mock 模型,无真 key)", () => {
  it("streamText 逐 token 流式组装成完整文本", async () => {
    const result = streamText({ model: twoChunkModel(), prompt: "hi" });
    // 消费 textStream(逐段)证明是真流式(非一次性)。
    const parts: string[] = [];
    for await (const delta of result.textStream) parts.push(delta);
    expect(parts.length).toBeGreaterThanOrEqual(2); // 至少两段 delta
    expect(parts.join("")).toBe("你好,世界");
    expect(await result.text).toBe("你好,世界");
  });

  it("toUIMessageStreamResponse → 真 SSE Response(可流式消费 + onFinish 拿到完整 assistant 消息)", async () => {
    let finishedText = "";
    let finishedParts: unknown[] = [];
    const result = streamText({ model: twoChunkModel(), prompt: "hi" });
    const response = result.toUIMessageStreamResponse({
      // 与 route.ts onFinish 同形:拿组装好的 assistant UIMessage(text + parts)。
      onFinish: ({ responseMessage }) => {
        const parts = (responseMessage as { parts?: Array<{ type: string; text?: string }> })
          .parts;
        finishedParts = Array.isArray(parts) ? parts : [];
        finishedText = (Array.isArray(parts) ? parts : [])
          .filter((p) => p.type === "text" && typeof p.text === "string")
          .map((p) => p.text as string)
          .join("");
      },
    });

    // 真 Response + SSE 头 + 可读 body(证明 backend 确能出流式端点 —— gate③「backend 无 SSE」的正面证据)。
    expect(response).toBeInstanceOf(Response);
    expect(response.headers.get("content-type") ?? "").toContain(
      "text/event-stream",
    );
    expect(response.body).toBeTruthy();

    // 消费整条 SSE 流(逐字节透传的正是路由薄代理会转发给 useChat 的东西)。
    const body = await response.text();
    expect(body).toContain("你好");
    expect(body).toContain(",世界");

    // onFinish 落库钩子拿到完整 assistant 文本(route.ts 据此 appendAssistantMessage)。
    expect(finishedText).toBe("你好,世界");
    expect(finishedParts.length).toBeGreaterThan(0);
  });

  it("流中途/取消不崩:消费到一半 abort,不抛未处理异常", async () => {
    const result = streamText({ model: twoChunkModel(), prompt: "hi" });
    const reader = result.textStream.getReader();
    const first = await reader.read();
    expect(first.done).toBe(false);
    await reader.cancel(); // 中途取消
    // 没有未捕获异常即通过(cancel 后不再读)。
    expect(true).toBe(true);
  });

  // [T-239c S2] 中断真一致:abortSignal 触发后,已产出的部分文本仍能经
  // toUIMessageStreamResponse 的 onFinish 拿到(isAborted=true)—— 这正是 route.ts 的
  // 「中断轮部分产出落库」路径(consumeSseStream 兜底消费:客户端断开也能触发 onFinish)。
  it("[T-239c] abort 后 onFinish 仍触发:isAborted=true + 已产出部分文本(部分落库路径)", async () => {
    // 吐出第一段后挂起、收到 abortSignal 时以 AbortError reject 的模型 —— 与真 provider
    // (fetch 流)同形:SDK 的 abort part 只在 reader.read() 结算时发得出去(index.js pull
    // 循环核实),故 mock 必须像真流一样在 abort 时 error,否则挂死。
    const model = new MockLanguageModelV3({
      doStream: async ({ abortSignal }): Promise<DoStreamReturn> => ({
        stream: new ReadableStream({
          start(c) {
            c.enqueue({ type: "text-start", id: "0" });
            c.enqueue({ type: "text-delta", id: "0", delta: "部分产出" });
            // 故意不 close —— 等 abortSignal 掐断(真 provider 的 fetch 流被 abort 时 reject)。
            abortSignal?.addEventListener("abort", () => {
              const err = new Error("aborted");
              err.name = "AbortError";
              try {
                c.error(err);
              } catch {
                /* 已关闭 */
              }
            });
          },
        }) as DoStreamReturn["stream"],
      }),
    });
    const ac = new AbortController();
    const result = streamText({
      model,
      prompt: "hi",
      abortSignal: ac.signal,
    });
    let finished: {
      isAborted: boolean;
      text: string;
    } | null = null;
    // 与 route.ts 同形:consumeSseStream 服务端自消费(模拟客户端 abort 后没人读响应体),
    // onFinish 拿 isAborted + 组装好的部分 responseMessage。
    result.toUIMessageStreamResponse({
      consumeSseStream: consumeStream,
      onFinish: ({ isAborted, responseMessage }) => {
        const parts = (
          responseMessage as { parts?: Array<{ type: string; text?: string }> }
        ).parts;
        finished = {
          isAborted,
          text: (Array.isArray(parts) ? parts : [])
            .filter((p) => p.type === "text" && typeof p.text === "string")
            .map((p) => p.text as string)
            .join(""),
        };
      },
    });
    // 等首段进 UI 流后中断(macrotask 让消费泵先跑起来)。
    await new Promise((r) => setTimeout(r, 30));
    ac.abort();
    await vi.waitFor(() => {
      expect(finished).not.toBeNull();
    });
    expect(finished!.isAborted).toBe(true);
    // 已产出的部分文本仍在(刷新后该轮不丢的服务端前提)。
    expect(finished!.text).toBe("部分产出");
  });
});
