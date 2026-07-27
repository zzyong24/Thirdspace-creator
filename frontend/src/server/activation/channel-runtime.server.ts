import "server-only";

import {
  localChannelRuntimeResponse,
  type LocalChannelRuntimeResponse,
} from "@creatoros/contract";

import {
  readLicenseVerdictDetailed,
  type LicenseVerdict,
} from "./license-file.server";

/** AM→Creator 已签名 `channelConfig` schemaVersion=channel-runtime-v2 的 closed shape。 */
export interface ChannelRuntimeSnapshot {
  readonly schemaVersion: "channel-runtime-v2";
  readonly contractVersion: "growth-channel-runtime-v1";
  readonly projectKey: string;
  readonly channelRef: string;
  readonly snapshotVersion: number;
  readonly sourceDigest: string;
  readonly source: "thirdspace-growth";
  readonly sourceUpdatedAt: string;
  readonly syncedAt: string;
  readonly stale: boolean;
  readonly brandName: string | null;
  readonly purchaseUrl: string | null;
  readonly renewalUrl: string | null;
  readonly channelSupportUrl: string | null;
  readonly bugFeedbackUrl: string | null;
  readonly downloadUrl: string | null;
  /** 旧客户端别名；Rust 写缓存前已强制与 channelSupportUrl 相等。 */
  readonly supportUrl: string | null;
}

const unavailable = (
  runtimeState: "unavailable" | "read_error",
): LocalChannelRuntimeResponse => ({
  runtimeState,
  brandName: null,
  purchaseUrl: null,
  renewalUrl: null,
  channelSupportUrl: null,
  bugFeedbackUrl: null,
  downloadUrl: null,
});

export interface ReadChannelRuntimeOptions {
  /** 测试注入口；生产只读同一加密 `.license`。 */
  readonly readVerdict?: () => Promise<LicenseVerdict | null>;
}

/**
 * 读取 Creator UI 可消费的最小投影。
 *
 * 此处只做 closed response 防线；上游签名、identity、sourceDigest 与防降级均在 Rust
 * 决策链完成。缺失表示未激活/未配置/旧 AM，读取异常单独标成 read_error。
 */
export async function readChannelRuntime(
  options: ReadChannelRuntimeOptions = {},
): Promise<LocalChannelRuntimeResponse> {
  let verdict: LicenseVerdict | null;
  try {
    if (options.readVerdict) {
      verdict = await options.readVerdict();
    } else {
      const result = await readLicenseVerdictDetailed();
      if (result.state === "read_error") return unavailable("read_error");
      verdict = result.verdict;
    }
  } catch {
    return unavailable("read_error");
  }
  if (!verdict?.allowed || !verdict.channelRuntime) {
    return unavailable("unavailable");
  }
  const runtime = verdict.channelRuntime;
  const parsed = localChannelRuntimeResponse.safeParse({
    runtimeState: "ready",
    brandName: runtime.brandName,
    purchaseUrl: runtime.purchaseUrl,
    renewalUrl: runtime.renewalUrl,
    channelSupportUrl: runtime.channelSupportUrl,
    bugFeedbackUrl: runtime.bugFeedbackUrl,
    downloadUrl: runtime.downloadUrl,
  });
  return parsed.success ? parsed.data : unavailable("read_error");
}
