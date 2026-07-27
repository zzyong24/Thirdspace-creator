import { describe, expect, it } from "vitest";

import {
  localProductFeedbackRequest,
  localProductFeedbackResponse,
} from "../../src/local-platform";

describe("API-CREATOR-001 本地产品反馈契约（TC-CBF-11）", () => {
  it("只接受用户可见文字与非敏感运行摘要", () => {
    expect(
      localProductFeedbackRequest.parse({
        summary: "导出按钮没有反应",
        description: "点击导出后没有文件，也没有错误提示。",
        reproductionSteps: "打开项目\r\n进入发布\r点击导出",
        appVersion: "1.8.0",
        osName: "macOS 15",
        locale: "zh-CN",
      }),
    ).toEqual({
      summary: "导出按钮没有反应",
      description: "点击导出后没有文件，也没有错误提示。",
      reproductionSteps: "打开项目\n进入发布\n点击导出",
      appVersion: "1.8.0",
      osName: "macOS 15",
      locale: "zh-CN",
    });
  });

  it("closed shape 拒绝渠道、优先级、激活码、机器和 token", () => {
    for (const extra of [
      { channelRef: "agent-42" },
      { priority: "high" },
      { code: "SECRET" },
      { machineId: "machine-1" },
      { feedbackContextToken: "secret.token" },
    ]) {
      expect(() =>
        localProductFeedbackRequest.parse({
          summary: "导出按钮没有反应",
          description: "点击导出后没有文件，也没有错误提示。",
          reproductionSteps: "",
          appVersion: "1.8.0",
          osName: "macOS 15",
          locale: "zh-CN",
          ...extra,
        }),
      ).toThrow();
    }
  });

  it("响应只回显真实 publicRef 或稳定错误，不回显秘密", () => {
    expect(
      localProductFeedbackResponse.parse({
        ok: true,
        publicRef: "FDB-01J7K0T2AB",
        status: "new",
        channelBinding: "verified",
      }),
    ).toMatchObject({ ok: true, publicRef: "FDB-01J7K0T2AB" });
    expect(
      localProductFeedbackResponse.parse({
        ok: false,
        code: "FEEDBACK_AUTHORITY_UNAVAILABLE",
        message: "反馈服务暂时不可用，请稍后重试",
        retryable: true,
      }),
    ).toMatchObject({ ok: false, retryable: true });
  });
});
