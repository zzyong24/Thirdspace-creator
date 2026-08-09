import { describe, expect, it } from "vitest";
import {
  formatErrorDiagnostic,
  observableModelKey,
  safeModelFailureMessage,
} from "./error-diagnostics";

describe("T-617 渠道模型可观测信息脱敏", () => {
  const secretError = new Error(
    "request to https://channel-model.internal/v1 failed model=private-model apiKey=SECRET_CHANNEL_KEY",
  );

  it("渠道模型只投影稳定标签，不暴露真实 model", () => {
    expect(
      observableModelKey({
        model: "private-model",
        displayModelKey: "channel-managed",
      }),
    ).toBe("channel-managed");
  });

  it("渠道失败原因与诊断日志不含 key、model 或 base URL", () => {
    const publicMessage = safeModelFailureMessage(secretError, {
      displayModelKey: "channel-managed",
    });
    const diagnostic = formatErrorDiagnostic(secretError, {
      omitMessage: true,
    });
    const output = `${publicMessage}\n${diagnostic}`;

    expect(output).toContain("渠道模型调用失败");
    expect(output).not.toContain("SECRET_CHANNEL_KEY");
    expect(output).not.toContain("private-model");
    expect(output).not.toContain("channel-model.internal");
  });

  it("渠道额度耗尽保留为充值指引，不伪装成模型故障", () => {
    const quotaError = Object.assign(new Error("upstream failed"), {
      statusCode: 402,
      responseBody: "insufficient quota SECRET_CHANNEL_KEY private-model",
    });
    const publicMessage = safeModelFailureMessage(quotaError, {
      displayModelKey: "channel-managed",
    });

    expect(publicMessage).toBe("AI 额度不足，请充值后再试。");
    expect(publicMessage).not.toContain("SECRET_CHANNEL_KEY");
    expect(publicMessage).not.toContain("private-model");
  });
});
