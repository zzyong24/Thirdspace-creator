import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import { deriveChannelModelScopeId } from "./client-config.server";

describe("T-645 渠道模型 scopeId", () => {
  it("按版本化 JSON 身份材料生成稳定的小写 SHA-256", () => {
    const identity = {
      projectKey: "creatoros",
      channelRef: "Partner/A",
      clientId: "creatoros.desktop",
    } as const;
    const expected = createHash("sha256")
      .update(
        JSON.stringify([
          "creatoros-channel-model-scope-v1",
          identity.projectKey,
          identity.channelRef,
          identity.clientId,
        ]),
        "utf8",
      )
      .digest("hex");
    expect(deriveChannelModelScopeId(identity)).toBe(expected);
    expect(deriveChannelModelScopeId(identity)).toMatch(/^[a-f0-9]{64}$/);
  });

  it("大小写、字段内容和带分隔符的身份不会串 scope", () => {
    const base = {
      projectKey: "creatoros",
      channelRef: "a|b",
      clientId: "creatoros.desktop",
    } as const;
    expect(deriveChannelModelScopeId(base)).not.toBe(
      deriveChannelModelScopeId({ ...base, channelRef: "A|B" }),
    );
    expect(deriveChannelModelScopeId(base)).not.toBe(
      deriveChannelModelScopeId({ ...base, projectKey: "creatoros|a" }),
    );
  });

  it("空值或 C0 控制字符被拒绝", () => {
    expect(() =>
      deriveChannelModelScopeId({
        projectKey: "",
        channelRef: "a",
        clientId: "creatoros.desktop",
      }),
    ).toThrow(/identity/);
    expect(() =>
      deriveChannelModelScopeId({
        projectKey: "creatoros",
        channelRef: "a\u0000b",
        clientId: "creatoros.desktop",
      }),
    ).toThrow(/identity/);
  });
});
