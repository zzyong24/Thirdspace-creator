/**
 * onboarding-data — [T-132 切片 2;T-138] 能力 state 装配层。
 *
 * `loadState` 及 6 个 loader 供常驻卡(onboarding-card)挂载后并行拉真值 →
 * deriveSteps。(T-138 弹窗已删,常驻卡是唯一消费方。)每个读 op 各自 try/catch:
 * 失败 → 该字段留 undefined(诚实降级),不让一个读失败拖垮整份 state,deriveSteps
 * 一律当未完成、绝不假打勾。
 *
 * 本模块 import 了 contract-client(client),故消费方(card)本身是 client 组件;
 * 但本文件不 import React —— 纯装配逻辑,好复用。
 */

import { client } from "@/lib/contract-client";
import { type OnboardingState } from "./onboarding-steps";

/**
 * 并行拉各能力 state。每个读 op 各自 try/catch:失败 → 该字段留 undefined
 * (诚实降级),不让一个读失败拖垮整份 state。返回可直接喂 deriveSteps 的 state。
 */
export async function loadState(): Promise<OnboardingState> {
  const [
    capabilities,
    hasProfile,
    projectCount,
    hasStorageRoot,
    hasActiveReviewRule,
    douyinLoggedIn,
  ] = await Promise.all([
    loadConfiguredCapabilities(),
    loadHasProfile(),
    loadProjectCount(),
    loadHasStorageRoot(),
    loadHasActiveReviewRule(),
    loadDouyinLoggedIn(),
  ]);
  return {
    configuredCapabilities: capabilities,
    hasPositioningProfile: hasProfile,
    projectCount,
    hasStorageRoot,
    hasActiveReviewRule,
    douyinLoggedIn,
  };
}

/** 已配的 model capability 集合(provider + modelName 非空才算已配)。读失败 → undefined。 */
export async function loadConfiguredCapabilities(): Promise<
  ReadonlySet<string> | undefined
> {
  try {
    const rows = (await client.listModels({
      params: undefined,
      query: undefined,
      body: undefined,
    })) as ReadonlyArray<{
      capability?: unknown;
      provider?: unknown;
      modelName?: unknown;
    }>;
    const set = new Set<string>();
    for (const row of rows) {
      const capability =
        typeof row.capability === "string" ? row.capability : "";
      const provider = typeof row.provider === "string" ? row.provider : "";
      const modelName = typeof row.modelName === "string" ? row.modelName : "";
      // web.search 档 model 选填(只需 provider);其余档要 provider 齐。统一以
      // provider 非空为「已配」下限 —— 未配的行 provider 为空,不误判 done。
      if (capability && provider) {
        // model 非空更稳,但 web.search 允许空 model(provider 即可用);这里以
        // provider 为准(与设置页搜索档判定一致),避免 web.search 永远判未完成。
        void modelName;
        set.add(capability);
      }
    }
    return set;
  } catch {
    return undefined;
  }
}

/** 定位母版是否存在(getProfile 成功 resolve → true;404 / 读失败 → undefined)。 */
export async function loadHasProfile(): Promise<boolean | undefined> {
  try {
    await client.getProfile({
      params: undefined,
      query: undefined,
      body: undefined,
    });
    return true;
  } catch {
    // 无 profile → 后端返 404(OwnershipError)→ reject → 诚实降级为未完成。
    return undefined;
  }
}

/** 项目数(listProjects 长度)。读失败 → undefined。 */
export async function loadProjectCount(): Promise<number | undefined> {
  try {
    const rows = (await client.listProjects({
      params: undefined,
      query: { page: 1, pageSize: 100 },
      body: undefined,
    })) as unknown as ReadonlyArray<unknown>;
    return Array.isArray(rows) ? rows.length : undefined;
  } catch {
    return undefined;
  }
}

/** 存储根可读性(getStorage 成功且 rootPath 非空)。读失败 → undefined。 */
export async function loadHasStorageRoot(): Promise<boolean | undefined> {
  try {
    const s = (await client.getStorage({
      params: undefined,
      query: undefined,
      body: undefined,
    })) as { rootPath?: unknown };
    return typeof s.rootPath === "string" && s.rootPath.trim().length > 0
      ? true
      : undefined;
  } catch {
    return undefined;
  }
}

/** [T-131d] 是否有 ≥1 条 active 审核规则(listReviewRules,status==="active")。读失败 → undefined。 */
export async function loadHasActiveReviewRule(): Promise<boolean | undefined> {
  try {
    const rows = (await client.listReviewRules({
      params: undefined,
      query: undefined,
      body: undefined,
    })) as unknown as ReadonlyArray<{ status?: unknown }>;
    return Array.isArray(rows)
      ? rows.some((r) => r.status === "active") || undefined
      : undefined;
  } catch {
    return undefined;
  }
}

/** [T-131d] 抖音扫码登录态(statusDouyin → {loggedIn})。读失败 → undefined。 */
export async function loadDouyinLoggedIn(): Promise<boolean | undefined> {
  try {
    const s = (await client.statusDouyin({
      params: undefined,
      query: undefined,
      body: undefined,
    })) as { loggedIn?: unknown };
    return s.loggedIn === true ? true : undefined;
  } catch {
    return undefined;
  }
}
