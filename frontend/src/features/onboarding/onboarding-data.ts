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

/**
 * 已配的 model capability 集合。**「已配」= 真能跑,不是「行存在」**。
 *
 * [Bug #3] T-135 中性化保留了各 AI capability 的**空占位骨架**(行存在,但
 * provider 空 / secret 空),没配 key 也跑不通。旧判定只看 `provider` 非空,
 * 会把「有 provider 占位但没配 key」误算成已配 → 新手清单假打勾。
 *
 * 修正:以 `provider 非空 且 hasSecret` 为「真配了」下限 —— `hasSecret` 是后端
 * `toModelResource` 掩码出的布尔(有 stored key 或 env-ref 才 true,与设置页
 * 卡片「已配」判定同源)。空占位 hasSecret=false → 不入集合 → 未完成。web.search
 * 档同理(真配了搜索的行必带 key/env-ref),不误伤:未真配一律不打勾。
 *
 * 读失败 → undefined(诚实降级,deriveSteps 当未完成)。
 */
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
      hasSecret?: unknown;
    }>;
    const set = new Set<string>();
    for (const row of rows) {
      const capability =
        typeof row.capability === "string" ? row.capability : "";
      const provider = typeof row.provider === "string" ? row.provider : "";
      const hasSecret = row.hasSecret === true;
      // 「真能跑」下限:provider 非空 且 配了可用 secret(key 或 env-ref)。
      // 只有 provider 占位、没配 key 的空骨架 hasSecret=false → 不算已配。
      if (capability && provider && hasSecret) {
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
