import { describe, it, expect } from "vitest";
import {
  humanizeAiError,
  humanizeAiErrorMessage,
} from "./ai-error-humanize";

// [T-094] AI 错误人话化映射单测 —— 锚定实录错误串与规则表语义:
// 命中 → 人话 + suggestSwitchModel;不命中 → null(调用方回落原串,不装懂)。

describe("humanizeAiErrorMessage — 错误码 → 人话", () => {
  it("实录主案例:MiniMax 输入敏感拦截(new_sensitive / 1026)→ 人话 + 建议换模型", () => {
    const raw =
      "Failed after 3 attempts. AI_APICallError: input new_sensitive (1026)";
    const human = humanizeAiErrorMessage(raw);
    expect(human).not.toBeNull();
    expect(human!.message).toContain("内容安全审核");
    expect(human!.message).toContain("换一个模型");
    expect(human!.suggestSwitchModel).toBe(true);
  });

  it("输出敏感(1027)→ 人话 + 建议换模型", () => {
    const human = humanizeAiErrorMessage("AI_APICallError: output new_sensitive (1027)");
    expect(human).not.toBeNull();
    expect(human!.suggestSwitchModel).toBe(true);
  });

  it("限流(rate limit / 1002)→ 人话,不强推换模型", () => {
    const human = humanizeAiErrorMessage("Request failed: rate limit exceeded (1002)");
    expect(human).not.toBeNull();
    expect(human!.message).toContain("限流");
    expect(human!.suggestSwitchModel).toBe(false);
  });

  it("余额/配额不足(1008 / insufficient balance)→ 人话 + 建议换模型", () => {
    const human = humanizeAiErrorMessage("insufficient balance (1008)");
    expect(human).not.toBeNull();
    expect(human!.suggestSwitchModel).toBe(true);
  });

  it("不命中规则 → null(诚实,不把未知错误装成人话)", () => {
    expect(humanizeAiErrorMessage("ECONNREFUSED 127.0.0.1:8080")).toBeNull();
    expect(humanizeAiErrorMessage("")).toBeNull();
  });
});

describe("humanizeAiError — Error/unknown 入口", () => {
  it("Error.message 命中 → 翻译", () => {
    const human = humanizeAiError(
      new Error("AI_APICallError: input new_sensitive (1026)"),
    );
    expect(human?.suggestSwitchModel).toBe(true);
  });

  it("平台码藏在 cause 里也能命中(AI SDK 包装层)", () => {
    const err = new Error("Failed after 3 attempts.");
    (err as Error & { cause: Error }).cause = new Error(
      "input new_sensitive (1026)",
    );
    expect(humanizeAiError(err)).not.toBeNull();
  });

  it("平台码藏在 responseBody 里也能命中", () => {
    const err = new Error("API call failed");
    (err as Error & { responseBody: string }).responseBody =
      '{"base_resp":{"status_code":1026,"status_msg":"input new_sensitive (1026)"}}';
    expect(humanizeAiError(err)).not.toBeNull();
  });

  it("非 Error / 不命中 → null", () => {
    expect(humanizeAiError("random failure")).toBeNull();
    expect(humanizeAiError(undefined)).toBeNull();
  });
});
