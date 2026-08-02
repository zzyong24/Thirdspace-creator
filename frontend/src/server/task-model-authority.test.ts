import { describe, expect, it } from "vitest";

import {
  matchesPinnedModelAuthority,
  pinModelAuthority,
  TaskModelAuthorityScope,
} from "./task-model-authority";

describe("T-617 异步任务模型 authority 快照", () => {
  it("同一渠道 payload 不受对象键顺序影响，不同 payload 产生不同 digest", () => {
    const first = pinModelAuthority({
      authority: "channel",
      outcome: "configured",
      scopeId: "scope-a",
      payload: {
        model: "private-model",
        settings: { temperature: 0.2, topP: 0.9 },
        apiKey: "SECRET_CHANNEL_KEY",
      },
    });
    const reordered = pinModelAuthority({
      authority: "channel",
      outcome: "configured",
      scopeId: "scope-a",
      payload: {
        apiKey: "SECRET_CHANNEL_KEY",
        settings: { topP: 0.9, temperature: 0.2 },
        model: "private-model",
      },
    });
    const changed = pinModelAuthority({
      authority: "channel",
      outcome: "configured",
      scopeId: "scope-a",
      payload: {
        model: "other-private-model",
        settings: { temperature: 0.2, topP: 0.9 },
        apiKey: "SECRET_CHANNEL_KEY",
      },
    });

    expect(reordered.digest).toBe(first.digest);
    expect(changed.digest).not.toBe(first.digest);
    const otherScope = pinModelAuthority({
      authority: "channel",
      outcome: "configured",
      scopeId: "scope-b",
      payload: {
        model: "private-model",
        settings: { temperature: 0.2, topP: 0.9 },
        apiKey: "SECRET_CHANNEL_KEY",
      },
    });
    expect(otherScope.digest).not.toBe(first.digest);
  });

  it("创建时快照与执行时 authority 不同则 fail-closed", () => {
    const local = pinModelAuthority({
      authority: "local",
      outcome: "unreachable",
      payload: null,
    });
    const channel = pinModelAuthority({
      authority: "channel",
      outcome: "configured",
      scopeId: "scope-a",
      payload: { model: "private-model" },
    });

    expect(
      matchesPinnedModelAuthority(
        {
          modelAuthority: local.authority,
          modelAuthorityDigest: local.digest,
        },
        channel,
      ),
    ).toBe(false);
  });

  it("执行作用域固定使用通过 digest 校验的 payload，不随外部当前值切换", async () => {
    const scope = new TaskModelAuthorityScope();
    const pinned = pinModelAuthority({
      authority: "channel",
      outcome: "configured",
      scopeId: "scope-a",
      payload: { model: "private-model" },
    });
    let current = { model: "private-model" };

    await scope.run(pinned, async () => {
      current = { model: "changed-after-queue" };
      await Promise.resolve();
      expect(scope.currentPayload()).toEqual({ model: "private-model" });
      expect(scope.currentScopeId()).toBe("scope-a");
      expect(scope.currentPayload()).not.toEqual(current);
    });
    expect(scope.currentPayload()).toBeUndefined();
    expect(scope.currentScopeId()).toBeUndefined();
  });
});
