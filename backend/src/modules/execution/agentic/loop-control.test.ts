import { describe, it, expect } from "vitest";
import { createLoopController, estimateTokens } from "./loop-control";

// [T-256b] 步数/预算硬顶 + 检查点续跑不重置预算(SPEC §4.2/§4.3)。

describe("createLoopController(步数/预算硬顶)", () => {
  it("步数到顶 → beginStep 返 false + 终止原因 max_steps(诚实截断)", () => {
    const c = createLoopController({ maxSteps: 2, maxTokens: 1000 });
    expect(c.beginStep()).toBe(true);
    expect(c.beginStep()).toBe(true);
    expect(c.beginStep()).toBe(false); // 第 3 步被硬顶挡
    expect(c.stepsUsed()).toBe(2);
    expect(c.terminationReason()).toBe("max_steps");
  });

  it("token 预算耗尽 → chargeTokens 返 false + budget_exhausted", () => {
    const c = createLoopController({ maxSteps: 10, maxTokens: 100 });
    c.beginStep();
    expect(c.chargeTokens(60)).toBe(true);
    expect(c.chargeTokens(60)).toBe(false); // 累计 120 > 100
    expect(c.terminationReason()).toBe("budget_exhausted");
  });

  it("已终止后不再开步(诚实停不复活)", () => {
    const c = createLoopController({ maxSteps: 1, maxTokens: 1000 });
    c.beginStep();
    expect(c.beginStep()).toBe(false);
    expect(c.beginStep()).toBe(false);
    c.markCompleted(); // completed 不覆盖已置的 max_steps
    expect(c.terminationReason()).toBe("max_steps");
  });

  it("markCompleted / markAborted 语义", () => {
    const done = createLoopController({ maxSteps: 5, maxTokens: 1000 });
    done.markCompleted();
    expect(done.terminationReason()).toBe("completed");
    const ab = createLoopController({ maxSteps: 5, maxTokens: 1000 });
    ab.markAborted();
    expect(ab.terminationReason()).toBe("aborted");
  });
});

describe("检查点续跑(SPEC §4.3:续跑不重置预算)", () => {
  it("从 checkpoint 起算,硬顶跨续跑生效(不给无限绕圈后门)", () => {
    // 上次已用 6 步、18000 token;续跑预算仍是 8 步/20000,只剩 2 步/2000。
    const c = createLoopController(
      { maxSteps: 8, maxTokens: 20000 },
      { stepsUsed: 6, tokensUsed: 18000 },
    );
    expect(c.stepsUsed()).toBe(6);
    expect(c.tokensUsed()).toBe(18000);
    expect(c.beginStep()).toBe(true); // 第 7
    expect(c.beginStep()).toBe(true); // 第 8
    expect(c.beginStep()).toBe(false); // 到顶,续跑没重置
    expect(c.terminationReason()).toBe("max_steps");
  });

  it("token 续跑同样不重置", () => {
    const c = createLoopController(
      { maxSteps: 100, maxTokens: 1000 },
      { stepsUsed: 0, tokensUsed: 900 },
    );
    c.beginStep();
    expect(c.chargeTokens(200)).toBe(false); // 900+200 > 1000
    expect(c.terminationReason()).toBe("budget_exhausted");
  });
});

describe("estimateTokens", () => {
  it("chars/4 启发式(端口不回 token 数时的兜底)", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("a".repeat(400))).toBe(100);
  });
});

 it("T-915 取消后迟到的用量结算不覆盖取消状态", () => {
  const c = createLoopController({maxSteps: 10, maxTokens: 100});
  c.markAborted(); c.chargeTokens(200);
  expect(c.tokensUsed()).toBe(200);
  expect(c.terminationReason()).toBe("aborted");
});
