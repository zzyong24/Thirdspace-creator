import { describe, expect, it } from "vitest";

import {
  readChannelRuntime,
  type ChannelRuntimeSnapshot,
} from "./channel-runtime.server";

const runtime: ChannelRuntimeSnapshot = {
  schemaVersion: "channel-runtime-v2",
  contractVersion: "growth-channel-runtime-v1",
  projectKey: "creatoros",
  channelRef: "agent-42",
  snapshotVersion: 17,
  sourceDigest:
    "sha256:338c1c657efd10e78ccfff88833ed60cd1d80ae85c080bb7854fbfb307827883",
  source: "thirdspace-growth",
  sourceUpdatedAt: "2026-07-26T14:00:00.000Z",
  syncedAt: "2026-07-26T14:00:02.000Z",
  stale: false,
  brandName: "星河工作室",
  purchaseUrl: "https://growth.example.com/buy?channel=agent-42#plans",
  renewalUrl: null,
  channelSupportUrl:
    "https://agent.example.com/support?product=creatoros#help",
  bugFeedbackUrl:
    "https://growth.example.com/creatoros/feedback?source=desktop#form",
  downloadUrl: "https://downloads.example.com/creatoros?platform=auto#latest",
  supportUrl: "https://agent.example.com/support?product=creatoros#help",
};

describe("channel-runtime 只读投影（TEST-TSB-007）", () => {
  it("只从已解密的 .license 快照读取已验证 runtime，不读取旧 .channel-links", async () => {
    const result = await readChannelRuntime({
      readVerdict: async () => ({
        v: 1,
        allowed: true,
        status: "active",
        channelRuntime: runtime,
      }),
    });

    expect(result).toEqual({
      runtimeState: "ready",
      brandName: "星河工作室",
      purchaseUrl: "https://growth.example.com/buy?channel=agent-42#plans",
      renewalUrl: null,
      channelSupportUrl:
        "https://agent.example.com/support?product=creatoros#help",
      bugFeedbackUrl:
        "https://growth.example.com/creatoros/feedback?source=desktop#form",
      downloadUrl:
        "https://downloads.example.com/creatoros?platform=auto#latest",
    });
    expect(result).not.toHaveProperty("projectKey");
    expect(result).not.toHaveProperty("channelRef");
    expect(result).not.toHaveProperty("sourceDigest");
  });

  it("缺快照/未激活/旧 AM 都诚实返回 unavailable，不猜默认入口", async () => {
    for (const verdict of [
      null,
      { v: 1, allowed: false, status: "inactive" },
      { v: 1, allowed: true, status: "active" },
    ]) {
      await expect(
        readChannelRuntime({ readVerdict: async () => verdict }),
      ).resolves.toEqual({
        runtimeState: "unavailable",
        brandName: null,
        purchaseUrl: null,
        renewalUrl: null,
        channelSupportUrl: null,
        bugFeedbackUrl: null,
        downloadUrl: null,
      });
    }
  });

  it("读取损坏与未配置可区分，但不泄漏错误详情", async () => {
    await expect(
      readChannelRuntime({
        readVerdict: async () => {
          throw new Error("secret path and ciphertext");
        },
      }),
    ).resolves.toEqual({
      runtimeState: "read_error",
      brandName: null,
      purchaseUrl: null,
      renewalUrl: null,
      channelSupportUrl: null,
      bugFeedbackUrl: null,
      downloadUrl: null,
    });
  });

  it("sales_disabled 的 null 购买/续费保持不可用，售后/下载/Bug 仍可用", async () => {
    const result = await readChannelRuntime({
      readVerdict: async () => ({
        v: 1,
        allowed: true,
        status: "active",
        channelRuntime: {
          ...runtime,
          snapshotVersion: 18,
          purchaseUrl: null,
          renewalUrl: null,
        },
      }),
    });
    expect(result.purchaseUrl).toBeNull();
    expect(result.renewalUrl).toBeNull();
    expect(result.channelSupportUrl).toBe(runtime.channelSupportUrl);
    expect(result.downloadUrl).toBe(runtime.downloadUrl);
    expect(result.bugFeedbackUrl).toBe(runtime.bugFeedbackUrl);
  });
});
