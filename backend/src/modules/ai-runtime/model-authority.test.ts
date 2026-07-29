import { describe, expect, it, vi } from "vitest";
import type { RequestContext } from "@creatoros/contract";
import {
  createEffectiveModelConfigPort,
  createManagedModelConfigPort,
  createModelAuthorityGuard,
  createUnavailableManagedModelConfigPort,
  ModelConfigurationManagedError,
  ManagedModelUnavailableError,
} from "./model-authority";

const ctx = {
  userId: "user-1",
  accountId: "account-1",
  requestId: "request-1",
} as RequestContext;

describe("Growth 托管模型权威", () => {
  it("托管态禁止本地配置且不读取本地模型", async () => {
    const getLocal = vi.fn();
    const guard = createModelAuthorityGuard(async () => ({
      authority: "managed_locked",
      state: "ready",
      action: "配置已更新",
      profileKey: "balanced",
      capabilityRoutes: { "script.rewrite": "creator.text.primary" },
    }));
    await expect(guard.assertLocalConfigurationAllowed()).rejects.toBeInstanceOf(
      ModelConfigurationManagedError,
    );

    const effective = createEffectiveModelConfigPort({
      readSnapshot: guard.snapshot,
      getLocalModelConfig: getLocal,
      managed: createUnavailableManagedModelConfigPort(),
    });
    await expect(effective.get(ctx, "script.rewrite")).rejects.toMatchObject({
      code: "MANAGED_GATEWAY_UNAVAILABLE",
    });
    expect(getLocal).not.toHaveBeenCalled();
  });

  it("缺少 capability route 时 fail-closed 且不调用 gateway", async () => {
    const resolve = vi.fn();
    const effective = createEffectiveModelConfigPort({
      readSnapshot: async () => ({
        authority: "managed_locked",
        state: "offline",
        action: "正在使用最近一次已验证配置",
        profileKey: "quality",
        capabilityRoutes: {},
      }),
      getLocalModelConfig: vi.fn(),
      managed: { resolve },
    });
    await expect(effective.get(ctx, "image.generate")).rejects.toMatchObject({
      code: "MANAGED_MODEL_CAPABILITY_UNAVAILABLE",
    });
    expect(resolve).not.toHaveBeenCalled();
  });

  it("拒绝过期或绑定不一致的短期网关会话", async () => {
    const managed = createManagedModelConfigPort(
      {
        open: async () => ({
          gatewayOrigin: "https://gateway.example.com",
          credential: {
            kind: "bearer",
            value: "short-token",
            expiresAt: "2026-07-29T12:05:00.000Z",
          },
          binding: {
            capability: "image.generate",
            alias: "wrong-alias",
            entitlementBindingDigest: "sha256:binding",
          },
        }),
      },
      { now: () => new Date("2026-07-29T12:00:00.000Z") },
    );
    await expect(
      managed.resolve(ctx, {
        capability: "image.generate",
        alias: "creator.image.primary",
        profileKey: "balanced",
      }),
    ).rejects.toBeInstanceOf(ManagedModelUnavailableError);
  });

  it("local 构建保持现有本地读取", async () => {
    const getLocal = vi.fn().mockResolvedValue(null);
    const effective = createEffectiveModelConfigPort({
      readSnapshot: async () => ({
        authority: "local",
        state: "ready",
        action: "本地模型配置",
      }),
      getLocalModelConfig: getLocal,
      managed: createUnavailableManagedModelConfigPort(),
    });
    await expect(effective.get(ctx, "default")).resolves.toEqual({
      source: "local",
      config: null,
    });
    expect(getLocal).toHaveBeenCalledWith(ctx, "default");
  });
});
