import { describe, it, expect } from "vitest";
import {
  classifyLlmError,
  computeBackoffMs,
  getRetryAfterMs,
  retryDelayMs,
  resolveLlmMaxRetries,
  startWithRecovery,
  MAX_BACKOFF_MS,
  BASE_BACKOFF_MS,
} from "./retry-policy";

// [T-239b S1] 错误分类矩阵 —— 可重试(5xx/429/网络断/overloaded/cancelled)vs
// 不可重试(4xx 参数与鉴权/内容审核/abort/未知)。

describe("classifyLlmError 分类矩阵", () => {
  it.each([
    [{ statusCode: 500 }, "http_500"],
    [{ statusCode: 502 }, "http_502"],
    [{ statusCode: 503 }, "http_503"],
    [{ statusCode: 529 }, "http_529"],
    [{ statusCode: 429 }, "http_429"],
    [{ statusCode: 408 }, "http_408"],
    [{ statusCode: 409 }, "http_409"],
    // @anthropic-ai/sdk APIError 用 status 字段(非 statusCode)。
    [{ status: 503 }, "http_503"],
  ])("可重试 HTTP:%o", (err, reason) => {
    expect(classifyLlmError(err)).toEqual({ retryable: true, reason });
  });

  it.each([
    ["ECONNRESET", { code: "ECONNRESET", message: "socket error" }],
    ["ETIMEDOUT", { code: "ETIMEDOUT", message: "timed out" }],
    ["ECONNREFUSED", { code: "ECONNREFUSED", message: "conn refused" }],
    ["fetch failed 顶层", { message: "fetch failed" }],
    // undici 把网络错包在 cause 里(真实形态)。
    [
      "fetch failed + cause",
      { message: "fetch failed", cause: { code: "ECONNRESET" } },
    ],
    ["socket hang up", { message: "socket hang up" }],
    ["overloaded(Anthropic 过载)", { message: "overloaded_error" }],
    // MiniMax cancelled 曾整轮崩(SPEC §1 实锤病例)—— 归为可重试的流启动中断。
    ["cancelled(MiniMax 流中断)", { message: "request cancelled" }],
  ])("可重试网络/流启动:%s", (_name, err) => {
    expect(classifyLlmError(err).retryable).toBe(true);
  });

  it.each([
    [{ statusCode: 400 }, "http_400"],
    [{ statusCode: 401 }, "auth_401"],
    [{ statusCode: 403 }, "auth_403"],
    [{ statusCode: 404 }, "http_404"],
    [{ statusCode: 422 }, "http_422"],
  ])("不可重试 HTTP:%o", (err, reason) => {
    expect(classifyLlmError(err)).toEqual({ retryable: false, reason });
  });

  it("内容审核拒绝不可重试(即使伪装成 5xx/带敏感文案)", () => {
    expect(
      classifyLlmError({ statusCode: 500, message: "new_sensitive: 1026" }),
    ).toEqual({ retryable: false, reason: "content_moderation" });
    expect(classifyLlmError({ message: "content_filter" }).retryable).toBe(
      false,
    );
  });

  it("用户 abort 不可重试(用户意图非故障)", () => {
    expect(classifyLlmError({ name: "AbortError", message: "aborted" })).toEqual(
      { retryable: false, reason: "aborted" },
    );
  });

  it("AI SDK isRetryable=true 被尊重", () => {
    expect(classifyLlmError({ isRetryable: true }).retryable).toBe(true);
  });

  it("未知错误保守不可重试", () => {
    expect(classifyLlmError(new Error("something strange"))).toEqual({
      retryable: false,
      reason: "unknown",
    });
    expect(classifyLlmError("string error").retryable).toBe(false);
    expect(classifyLlmError(null).retryable).toBe(false);
  });
});

describe("computeBackoffMs 退避计算(封顶 + jitter 区间)", () => {
  it("500ms × 2^(n-1),jitter=0 时为精确基数", () => {
    const noJitter = () => 0;
    expect(computeBackoffMs(1, noJitter)).toBe(500);
    expect(computeBackoffMs(2, noJitter)).toBe(1000);
    expect(computeBackoffMs(3, noJitter)).toBe(2000);
    expect(computeBackoffMs(6, noJitter)).toBe(16000);
  });

  it("封顶 32s(第 7 次起不再翻倍)", () => {
    const noJitter = () => 0;
    expect(computeBackoffMs(7, noJitter)).toBe(MAX_BACKOFF_MS);
    expect(computeBackoffMs(20, noJitter)).toBe(MAX_BACKOFF_MS);
  });

  it("jitter 落在 [base, base×1.25] 区间", () => {
    const maxJitter = () => 1;
    expect(computeBackoffMs(2, maxJitter)).toBe(1000 * 1.25);
    for (let attempt = 1; attempt <= 10; attempt++) {
      const v = computeBackoffMs(attempt);
      const base = Math.min(
        BASE_BACKOFF_MS * Math.pow(2, attempt - 1),
        MAX_BACKOFF_MS,
      );
      expect(v).toBeGreaterThanOrEqual(base);
      expect(v).toBeLessThanOrEqual(base * 1.25);
    }
  });
});

describe("getRetryAfterMs(honor retry-after 头)", () => {
  it("AI SDK responseHeaders 的秒数形式", () => {
    expect(getRetryAfterMs({ responseHeaders: { "retry-after": "2" } })).toBe(
      2000,
    );
  });
  it("Headers.get 形式(@anthropic-ai/sdk)", () => {
    const headers = new Map([["retry-after", "5"]]);
    expect(
      getRetryAfterMs({ headers: { get: (k: string) => headers.get(k) ?? null } }),
    ).toBe(5000);
  });
  it("HTTP-date 形式按与 now 的差值", () => {
    const now = Date.parse("2026-07-11T00:00:00Z");
    const date = new Date(now + 3000).toUTCString();
    expect(
      getRetryAfterMs({ responseHeaders: { "retry-after": date } }, () => now),
    ).toBe(3000);
  });
  it("缺头/非正数/超 60s 上限 → null(退回指数退避)", () => {
    expect(getRetryAfterMs({})).toBeNull();
    expect(getRetryAfterMs({ responseHeaders: { "retry-after": "0" } })).toBeNull();
    expect(getRetryAfterMs({ responseHeaders: { "retry-after": "-3" } })).toBeNull();
    expect(
      getRetryAfterMs({ responseHeaders: { "retry-after": "3600" } }),
    ).toBeNull();
    expect(
      getRetryAfterMs({ responseHeaders: { "retry-after": "not-a-number" } }),
    ).toBeNull();
  });
  it("retryDelayMs:有 retry-after 用它,没有走退避", () => {
    expect(
      retryDelayMs(1, { responseHeaders: { "retry-after": "7" } }, () => 0),
    ).toBe(7000);
    expect(retryDelayMs(2, {}, () => 0)).toBe(1000);
  });
});

describe("resolveLlmMaxRetries(env 可配)", () => {
  it("缺省 3;非法值回落 3;夹在 [0,10]", () => {
    expect(resolveLlmMaxRetries({})).toBe(3);
    expect(resolveLlmMaxRetries({ CREATOROS_LLM_MAX_RETRIES: "" })).toBe(3);
    expect(resolveLlmMaxRetries({ CREATOROS_LLM_MAX_RETRIES: "abc" })).toBe(3);
    expect(resolveLlmMaxRetries({ CREATOROS_LLM_MAX_RETRIES: "5" })).toBe(5);
    expect(resolveLlmMaxRetries({ CREATOROS_LLM_MAX_RETRIES: "0" })).toBe(0);
    expect(resolveLlmMaxRetries({ CREATOROS_LLM_MAX_RETRIES: "99" })).toBe(10);
    expect(resolveLlmMaxRetries({ CREATOROS_LLM_MAX_RETRIES: "-2" })).toBe(0);
  });
});

describe("startWithRecovery(流开始前失败的分类重试 + fallback)", () => {
  const noSleep = async () => {};

  it("可重试错误 → 退避重试后成功(不动 fallback)", async () => {
    let calls = 0;
    let fallbackCalls = 0;
    const events: string[] = [];
    const out = await startWithRecovery({
      start: async () => {
        calls++;
        if (calls < 3) throw { statusCode: 503 };
        return "ok";
      },
      startFallback: async () => {
        fallbackCalls++;
        return "fb";
      },
      maxRetries: 3,
      sleep: noSleep,
      onEvent: (e) => events.push(e.type),
    });
    expect(out).toBe("ok");
    expect(calls).toBe(3);
    expect(fallbackCalls).toBe(0);
    expect(events).toEqual(["retry", "retry"]);
  });

  it("不可重试错误 → 立刻抛,不重试不 fallback", async () => {
    let calls = 0;
    let fallbackCalls = 0;
    await expect(
      startWithRecovery({
        start: async () => {
          calls++;
          throw { statusCode: 401 };
        },
        startFallback: async () => {
          fallbackCalls++;
          return "fb";
        },
        maxRetries: 3,
        sleep: noSleep,
      }),
    ).rejects.toEqual({ statusCode: 401 });
    expect(calls).toBe(1);
    expect(fallbackCalls).toBe(0);
  });

  it("可重试耗尽 + 配了 fallback → fallback 接管一次", async () => {
    let calls = 0;
    const events: string[] = [];
    const out = await startWithRecovery({
      start: async () => {
        calls++;
        throw { statusCode: 429 };
      },
      startFallback: async () => "fb",
      maxRetries: 2,
      sleep: noSleep,
      onEvent: (e) => events.push(e.type),
    });
    expect(out).toBe("fb");
    expect(calls).toBe(3); // 1 + 2 次重试
    expect(events).toEqual(["retry", "retry", "fallback"]);
  });

  it("可重试耗尽 + 未配 fallback → 抛最后一次主模型错误", async () => {
    const events: string[] = [];
    await expect(
      startWithRecovery({
        start: async () => {
          throw { statusCode: 503 };
        },
        maxRetries: 1,
        sleep: noSleep,
        onEvent: (e) => events.push(e.type),
      }),
    ).rejects.toEqual({ statusCode: 503 });
    expect(events).toEqual(["retry", "exhausted"]);
  });

  it("fallback 自身失败 → 原样抛 fallback 错误 + exhausted 事件", async () => {
    const events: string[] = [];
    await expect(
      startWithRecovery({
        start: async () => {
          throw { statusCode: 503 };
        },
        startFallback: async () => {
          throw new Error("fallback down");
        },
        maxRetries: 0,
        sleep: noSleep,
        onEvent: (e) => events.push(e.type),
      }),
    ).rejects.toThrow("fallback down");
    expect(events).toEqual(["fallback", "exhausted"]);
  });

  it("重试等待 honor retry-after(sleep 收到 7000ms)", async () => {
    const slept: number[] = [];
    let calls = 0;
    await startWithRecovery({
      start: async () => {
        calls++;
        if (calls === 1)
          throw { statusCode: 429, responseHeaders: { "retry-after": "7" } };
        return "ok";
      },
      maxRetries: 1,
      sleep: async (ms) => {
        slept.push(ms);
      },
    });
    expect(slept).toEqual([7000]);
  });
});
