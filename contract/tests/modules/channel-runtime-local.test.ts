import { describe, expect, it } from "vitest";

import { localChannelRuntimeResponse } from "../../src/local-platform";

const empty = {
  runtimeState: "unavailable",
  brandName: null,
  purchaseUrl: null,
  renewalUrl: null,
  channelSupportUrl: null,
  bugFeedbackUrl: null,
  downloadUrl: null,
} as const;

describe("API-TSB-001 本地 runtime 响应（TEST-TSB-007）", () => {
  it("接受 closed typed shape 与 query/fragment", () => {
    expect(
      localChannelRuntimeResponse.parse({
        ...empty,
        runtimeState: "ready",
        bugFeedbackUrl: "https://growth.example/bug?q=1#form",
      }),
    ).toEqual({
      ...empty,
      runtimeState: "ready",
      bugFeedbackUrl: "https://growth.example/bug?q=1#form",
    });
  });

  it("拒绝 userinfo、HTTP、额外身份/摘要字段", () => {
    expect(() =>
      localChannelRuntimeResponse.parse({
        ...empty,
        bugFeedbackUrl: "https://user:pass@growth.example/bug",
      }),
    ).toThrow();
    expect(() =>
      localChannelRuntimeResponse.parse({
        ...empty,
        channelSupportUrl: "http://support.example/help",
      }),
    ).toThrow();
    expect(() =>
      localChannelRuntimeResponse.parse({
        ...empty,
        projectKey: "creatoros",
      }),
    ).toThrow();
  });
});
