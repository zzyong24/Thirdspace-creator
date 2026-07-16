/**
 * onboarding-data — [T-161] 有序引导流的 state 装配层(重构自 T-132 扁平三档装配)。
 *
 * `loadState` 供常驻卡(onboarding-card)挂载后并行拉真值 → deriveGuidedSteps。每个读 op
 * 各自 try/catch:失败 → 该字段留 undefined(诚实降级),不让一个读失败拖垮整份 state,
 * deriveGuidedSteps 一律当未完成、绝不假打勾。
 *
 * 引导流只依赖 5 个信号(SPEC §3.1 六步的 done 判据):
 *   - configuredCapabilities(步1 文本模型)
 *   - origin(步2 起点,localStorage 落盘,非后端 —— additive、不碰 user_preferences schema)
 *   - douyinLoggedIn(步3 扫码导入)
 *   - hasImportedWorks(步4 后台初始化,由 imported 作品推断)
 *   - hasPositioningProfile(步5 定位)/ projectCount(步6 项目)
 *
 * 本模块 import contract-client(client),故消费方(card)是 client 组件;但本文件不 import
 * React —— 纯装配逻辑,好复用。origin 的 localStorage 读/写也放这里(浏览器 API,非 React)。
 */

import { client } from "@/lib/contract-client";
import {
  resolveOrigin,
  type OnboardingState,
  type OnboardingOrigin,
} from "./onboarding-steps";

/** 起点选择的 localStorage key(引导流专属存储;与 hidden flag 同源,不碰后端 schema)。 */
const ORIGIN_KEY = "creatoros:onboarding:origin";

/**
 * 读起点选择(try/catch 降级,不抛)。脏值 / 未写 / localStorage 不可用 → null(未选)。
 * 只认 "fresh" / "existing" 两个合法值,其余一律降级 null(诚实,防脏值污染分支判定)。
 */
export function readOrigin(): OnboardingOrigin {
  try {
    const v = window.localStorage.getItem(ORIGIN_KEY);
    return v === "fresh" || v === "existing" ? v : null;
  } catch {
    return null;
  }
}

/** 写起点选择(try/catch 降级,不抛)。 */
export function writeOrigin(origin: "fresh" | "existing"): void {
  try {
    window.localStorage.setItem(ORIGIN_KEY, origin);
  } catch {
    /* noop —— 写失败不抛,origin 只是本地引导偏好 */
  }
}

/**
 * 并行拉各能力 state + 读 origin。每个读 op 各自 try/catch:失败 → 该字段留 undefined
 * (诚实降级)。返回可直接喂 deriveGuidedSteps 的 state。
 */
export async function loadState(): Promise<OnboardingState> {
  const [
    configuredCapabilities,
    douyinLoggedIn,
    hasImportedWorks,
    hasPositioningProfile,
    projectCount,
  ] = await Promise.all([
    loadConfiguredCapabilities(),
    loadDouyinLoggedIn(),
    loadHasImportedWorks(),
    loadHasProfile(),
    loadProjectCount(),
  ]);
  return {
    configuredCapabilities,
    // [T-189b / T-348] origin:localStorage 显式选择**优先**;无显式选择但**已有导入作品** → 回灌
    // existing(真有存量的人不再被问新 / 老)。**绑号(douyinLoggedIn)不再触发回灌**——全隔离后
    // 绑号是全员前提,新号也绑,绑号≠有存量;绑号后仍问新 / 老才准(见 resolveOrigin §T-348)。
    origin: resolveOrigin(readOrigin(), { douyinLoggedIn, hasImportedWorks }),
    douyinLoggedIn,
    hasImportedWorks,
    hasPositioningProfile,
    projectCount,
  };
}

/**
 * 已配的 model capability 集合。**「已配」= 真能跑,不是「行存在」**。
 *
 * [Bug #3] 以 `provider 非空 且 hasSecret` 为「真配了」下限 —— 空占位骨架
 * (provider="" / hasSecret=false)不入集合 → 防新手清单假打勾。读失败 → undefined。
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
      if (capability && provider && hasSecret) {
        set.add(capability);
      }
    }
    return set;
  } catch {
    return undefined;
  }
}

/** [T-194] 定位母版是否**真存在**:读成功但 profile=null → false(原来 getProfile 一 resolve
 *  就返 true 是假阳,母版为空也算完成);读失败 → undefined。改用 getPositioningCenter 判 profile 非空。 */
export async function loadHasProfile(): Promise<boolean | undefined> {
  try {
    const center = (await client.getPositioningCenter({
      params: undefined,
      query: undefined,
      body: undefined,
    })) as { profile?: unknown };
    return center.profile !== null && center.profile !== undefined;
  } catch {
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

/**
 * [T-161] 步4「后台数据初始化」done 推断 —— 是否已有 ≥1 个 source==="imported" 的项目。
 *
 * 导入采集会给已发布作品建 source:imported 的历史项目(contract projectSource 枚举,
 * persistence-client 采集链)。存在即视为「后台初始化跑过一轮」(SPEC §3.1 importInitialized)。
 * 读失败 → undefined(诚实降级)。
 */
export async function loadHasImportedWorks(): Promise<boolean | undefined> {
  try {
    const rows = (await client.listProjects({
      params: undefined,
      query: { page: 1, pageSize: 100 },
      body: undefined,
    })) as unknown as ReadonlyArray<{ source?: unknown }>;
    if (!Array.isArray(rows)) return undefined;
    return rows.some((r) => r.source === "imported");
  } catch {
    return undefined;
  }
}

/** [T-131d] 抖音扫码登录态(statusDouyin → {loggedIn})。读失败 → undefined。 */
export async function loadDouyinLoggedIn(): Promise<boolean | undefined> {
  try {
    const s = (await client.statusDouyin({
      params: undefined,
      // [T-136] 被动探针不显式指号 → 走 header 注入的 ctx.accountId(当前号)。
      query: {},
      body: undefined,
    })) as { loggedIn?: unknown };
    return s.loggedIn === true ? true : undefined;
  } catch {
    return undefined;
  }
}
