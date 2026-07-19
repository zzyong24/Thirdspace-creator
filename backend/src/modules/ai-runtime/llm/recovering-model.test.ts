import { describe, it, expect } from "vitest";
import { streamText, simulateReadableStream, jsonSchema } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { createRecoveringModel } from "./recovering-model";
import type { RecoveryEvent } from "./retry-policy";

// [T-239b S1] 恢复模型包装器 —— 与 chat-streaming.test 同款 mock 模型(ai/test,不发网络、
// 无需真 key)验证:①流开始前失败分类重试 ②重试耗尽 fallback 接管(真 streamText 调用路径)
// ③流中途断不重发(SPEC 边界:交前端 regenerate)④不可重试错误不 fallback。

type DoStreamReturn = Awaited<ReturnType<MockLanguageModelV4["doStream"]>>;

const noSleep = async () => {};

/** 吐一段文本后正常 finish 的 doStream 结果(ai v7 V4 流式 part 序列)。 */
function okStream(text: string): DoStreamReturn {
  return {
    stream: simulateReadableStream({
      chunks: [
        { type: "text-start", id: "0" },
        { type: "text-delta", id: "0", delta: text },
        { type: "text-end", id: "0" },
        {
          type: "finish",
          finishReason: "stop",
          usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
        },
      ],
    }) as DoStreamReturn["stream"],
  };
}

describe("[T-239b] createRecoveringModel", () => {
  it("流开始前可重试失败 → 重试后主模型成功(fallback 不被调)", async () => {
    let mainCalls = 0;
    let fallbackCalls = 0;
    const main = new MockLanguageModelV4({
      doStream: async () => {
        mainCalls++;
        if (mainCalls < 2) throw Object.assign(new Error("503"), { statusCode: 503 });
        return okStream("主模型回复");
      },
    });
    const fallback = new MockLanguageModelV4({
      doStream: async () => {
        fallbackCalls++;
        return okStream("备用回复");
      },
    });
    const events: RecoveryEvent[] = [];
    const model = createRecoveringModel({
      model: main,
      fallbackModel: fallback,
      maxRetries: 3,
      sleep: noSleep,
      onEvent: (e) => events.push(e),
    });
    const result = streamText({ model, maxRetries: 0, prompt: "hi" });
    expect(await result.text).toBe("主模型回复");
    expect(mainCalls).toBe(2);
    expect(fallbackCalls).toBe(0);
    expect(events.map((e) => e.type)).toEqual(["retry"]);
  });

  it("主模型可重试错误耗尽 → fallback 接管,文本来自备用模型", async () => {
    let mainCalls = 0;
    let fallbackCalls = 0;
    const main = new MockLanguageModelV4({
      doStream: async () => {
        mainCalls++;
        throw Object.assign(new Error("rate limited"), { statusCode: 429 });
      },
    });
    const fallback = new MockLanguageModelV4({
      doStream: async () => {
        fallbackCalls++;
        return okStream("备用模型接管");
      },
    });
    const events: RecoveryEvent[] = [];
    const model = createRecoveringModel({
      model: main,
      fallbackModel: fallback,
      maxRetries: 2,
      sleep: noSleep,
      onEvent: (e) => events.push(e),
    });
    const result = streamText({ model, maxRetries: 0, prompt: "hi" });
    expect(await result.text).toBe("备用模型接管");
    expect(mainCalls).toBe(3); // 1 + 2 次重试
    expect(fallbackCalls).toBe(1); // fallback 只接管一次
    expect(events.map((e) => e.type)).toEqual(["retry", "retry", "fallback"]);
  });

  it("不可重试错误(401)→ 不重试、不 fallback,错误原样暴露", async () => {
    let mainCalls = 0;
    let fallbackCalls = 0;
    const main = new MockLanguageModelV4({
      doStream: async () => {
        mainCalls++;
        throw Object.assign(new Error("invalid api key"), { statusCode: 401 });
      },
    });
    const fallback = new MockLanguageModelV4({
      doStream: async () => {
        fallbackCalls++;
        return okStream("不该被调");
      },
    });
    const model = createRecoveringModel({
      model: main,
      fallbackModel: fallback,
      maxRetries: 3,
      sleep: noSleep,
    });
    // streamText 把流启动错误送进 error part(onError 回调),不裸抛 —— 消费 fullStream 断言。
    const result = streamText({
      model,
      maxRetries: 0,
      prompt: "hi",
      onError: () => {}, // 静音默认 console 打印
    });
    const errorParts: unknown[] = [];
    for await (const part of result.fullStream) {
      if (part.type === "error") errorParts.push(part.error);
    }
    expect(errorParts.length).toBeGreaterThan(0);
    expect(mainCalls).toBe(1);
    expect(fallbackCalls).toBe(0);
  });

  it("流中途断 → 不重发、不 fallback(错误透传,交前端 regenerate)", async () => {
    let mainCalls = 0;
    let fallbackCalls = 0;
    const main = new MockLanguageModelV4({
      doStream: async () => {
        mainCalls++;
        // 流已开始(吐了 text-start/delta)后中途崩 —— 恢复层不得重发。
        return {
          stream: new ReadableStream({
            start(controller) {
              controller.enqueue({ type: "text-start", id: "0" });
              controller.enqueue({ type: "text-delta", id: "0", delta: "前半" });
              controller.error(
                Object.assign(new Error("connection reset mid-stream"), {
                  code: "ECONNRESET",
                }),
              );
            },
          }) as DoStreamReturn["stream"],
        };
      },
    });
    const fallback = new MockLanguageModelV4({
      doStream: async () => {
        fallbackCalls++;
        return okStream("不该被调");
      },
    });
    const model = createRecoveringModel({
      model: main,
      fallbackModel: fallback,
      maxRetries: 3,
      sleep: noSleep,
    });
    const result = streamText({
      model,
      maxRetries: 0,
      prompt: "hi",
      onError: () => {},
    });
    // 中途错误可能以 error part 或 迭代抛错两种形态暴露(取决于 SDK 版本)—— 两种都算
    // 「透传给消费方」;本测的硬断言是**绝不重发**。
    const seen: string[] = [];
    let threw = false;
    try {
      for await (const part of result.fullStream) {
        seen.push(part.type);
      }
    } catch {
      threw = true;
    }
    expect(threw || seen.includes("error")).toBe(true); // 错误透传给消费方
    expect(mainCalls).toBe(1); // 绝不重发
    expect(fallbackCalls).toBe(0); // 绝不换模型重发
  });

  it("未配 fallback + 耗尽 → 主模型错误暴露(现状报错)", async () => {
    let mainCalls = 0;
    const main = new MockLanguageModelV4({
      doStream: async () => {
        mainCalls++;
        throw Object.assign(new Error("overloaded"), { statusCode: 529 });
      },
    });
    const events: RecoveryEvent[] = [];
    const model = createRecoveringModel({
      model: main,
      fallbackModel: null,
      maxRetries: 1,
      sleep: noSleep,
      onEvent: (e) => events.push(e),
    });
    const result = streamText({
      model,
      maxRetries: 0,
      prompt: "hi",
      onError: () => {},
    });
    const errorParts: unknown[] = [];
    for await (const part of result.fullStream) {
      if (part.type === "error") errorParts.push(part.error);
    }
    expect(errorParts.length).toBeGreaterThan(0);
    expect(mainCalls).toBe(2);
    expect(events.map((e) => e.type)).toEqual(["retry", "exhausted"]);
  });

  it("字符串模型 id 诚实抛错(装配层永远传实例)", () => {
    expect(() =>
      createRecoveringModel({ model: "some-global-id", maxRetries: 3 }),
    ).toThrow(/LanguageModel 实例/);
  });
});

// ── [T-443] 强制工具被拒 → 自动降级成 auto 重试(而非让所有模型都放弃强制)────────────
describe("[T-443] toolChoice 强制被拒时降级重试", () => {
  it("模型报 tool_choice 不支持 → 去掉强制(auto)重试一次并成功;打点 reason 可观测", async () => {
    const seen: Array<{ type?: string }> = [];
    const events: RecoveryEvent[] = [];
    const model = createRecoveringModel({
      model: new MockLanguageModelV4({
        doStream: async (opts: { toolChoice?: { type?: string } }) => {
          seen.push({ type: opts.toolChoice?.type });
          if (opts.toolChoice?.type === "tool") {
            throw new Error("Thinking mode does not support this tool_choice");
          }
          return okStream("降级后跑通");
        },
      }),
      maxRetries: 2,
      sleep: noSleep,
      onEvent: (e) => events.push(e),
    });
    const r = streamText({
      model,
      prompt: "hi",
      maxRetries: 0,
      tools: { t: { description: "d", inputSchema: jsonSchema({ type: "object", properties: {} }) } as never },
      toolChoice: { type: "tool", toolName: "t" },
    });
    let text = "";
    for await (const d of r.textStream) text += d;
    expect(text).toBe("降级后跑通");
    // 第一次带强制被拒、第二次降级成 auto。
    expect(seen.map((s) => s.type)).toEqual(["tool", "auto"]);
    expect(events.some((e) => e.reason === "tool_choice_unsupported_downgrade")).toBe(true);
  });

  it("非 tool_choice 类错误 → 不降级(原样走既有重试/抛出,不掩盖真问题)", async () => {
    const seen: Array<{ type?: string }> = [];
    const model = createRecoveringModel({
      model: new MockLanguageModelV4({
        doStream: async (opts: { toolChoice?: { type?: string } }) => {
          seen.push({ type: opts.toolChoice?.type });
          throw new Error("some unrelated 400 bad request");
        },
      }),
      maxRetries: 0,
      sleep: noSleep,
    });
    const r = streamText({
      model,
      prompt: "hi",
      maxRetries: 0,
      tools: { t: { description: "d", inputSchema: jsonSchema({ type: "object", properties: {} }) } as never },
      toolChoice: { type: "tool", toolName: "t" },
    });
    // 错误未必经 textStream 抛(streamText 另有 onError 路径),本用例只关心**有没有降级重试**。
    try {
      for await (const _ of r.textStream) {
        /* drain */
      }
    } catch {
      /* 预期失败,忽略 */
    }
    // 只试过带强制那一次,没有降级重试。
    expect(seen.map((s) => s.type)).toEqual(["tool"]);
  });
});
