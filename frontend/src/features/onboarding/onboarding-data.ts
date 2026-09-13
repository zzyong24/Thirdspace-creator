/** 新手引导状态装配：真实业务信号与账号持久里程碑合并，临时失败不撤销完成状态。 */

import { client } from "@/lib/contract-client";
import { readCurrentAccountId } from "@/lib/http-transport";
import {
  resolveOrigin,
  deriveGuidedSteps,
  type OnboardingOrigin,
  type OnboardingState,
} from "./onboarding-steps";

const ORIGIN_KEY = "creatoros:onboarding:origin";
const REVIEWED_PROJECTS_PREFIX =
  "creatoros:onboarding:reviewed-imported-projects:";

export function readOrigin(): OnboardingOrigin {
  try {
    const value = window.localStorage.getItem(ORIGIN_KEY);
    return value === "fresh" || value === "existing" ? value : null;
  } catch {
    return null;
  }
}

export function writeOrigin(origin: "fresh" | "existing"): void {
  try {
    window.localStorage.setItem(ORIGIN_KEY, origin);
  } catch {
    /* 本地引导偏好写失败不阻断产品 */
  }
}

function reviewedProjectsKey(accountId: string): string {
  return `${REVIEWED_PROJECTS_PREFIX}${accountId}`;
}

export function readReviewedImportedProjects(accountId: string | null): boolean {
  if (!accountId) return false;
  try {
    return window.localStorage.getItem(reviewedProjectsKey(accountId)) === "1";
  } catch {
    return false;
  }
}

export function writeReviewedImportedProjects(accountId: string | null): void {
  if (!accountId) return;
  try {
    window.localStorage.setItem(reviewedProjectsKey(accountId), "1");
  } catch {
    /* 本地确认写失败不阻断导航 */
  }
}

export async function loadProjectSignals(accountId = readCurrentAccountId()): Promise<{
  readonly hasImportedWorks?: boolean;
  readonly hasCreatedProject?: boolean;
}> {
  try {
    assertCurrentAccount(accountId);
    // projects.list 的实际 transport 返回当前账号全量；不能按未实现的页号重复请求。
    const rows = await client.listProjects({params: undefined, query: {page: 1, pageSize: 100}, body: undefined});
    assertCurrentAccount(accountId);
    if (!Array.isArray(rows)) return {};
    return {
      hasImportedWorks: rows.some(row => row.source === "imported"),
      hasCreatedProject: rows.some(row => row.source === "manual" || row.source === "topic"),
    };
  } catch {
    return {};
  }
}

export async function loadRadarSignals(accountId = readCurrentAccountId()): Promise<{
  readonly hasBenchmarkMonitor?: boolean;
  readonly hasBenchmarkTopic?: boolean;
}> {
  if (!accountId) return {};
  try {
    const workspace = (await client.getIntelligenceWorkspace({
      params: undefined,
      query: { accountId },
      body: undefined,
    })) as {
      sources?: ReadonlyArray<{
        id?: unknown;
        type?: unknown;
        monitorEnabled?: unknown;
        status?: unknown;
      }>;
    };
    const benchmarkSources = (workspace.sources ?? []).filter(
      (source): source is typeof source & { id: string } =>
        typeof source.id === "string" && source.type === "creator_profile",
    );
    const activeSources = benchmarkSources.filter(
      (source) => source.monitorEnabled === true && source.status === "active",
    );
    assertCurrentAccount(accountId);
    const convertedBySource = await Promise.allSettled(
      benchmarkSources.map((source) =>
        client.listIntelligenceItems({
          params: undefined,
          query: {
            accountId,
            sourceId: source.id,
            page: 1,
            pageSize: 1,
            sort: "newest",
            topicState: "converted",
          },
          body: undefined,
        }),
      ),
    );
    return {
      hasBenchmarkMonitor: activeSources.length > 0,
      hasBenchmarkTopic: convertedBySource.some(
        (result) =>
          result.status === "fulfilled" &&
          Array.isArray(result.value) &&
          result.value.length > 0,
      ),
    };
  } catch {
    return {};
  }
}

export type {OnboardingStateResource as OnboardingRecord, OnboardingPatch} from "@creatoros/contract";
import type {OnboardingStateResource as OnboardingRecord, OnboardingPatch} from "@creatoros/contract";
export function assertCurrentAccount(accountId: string | null) {
  if (accountId !== readCurrentAccountId()) throw Error("ONBOARDING_ACCOUNT_CHANGED");
}
export async function saveOnboarding(accountId: string, body: OnboardingPatch): Promise<OnboardingRecord> {
  assertCurrentAccount(accountId);
  const result = await client.patchOnboarding({params: {accountId}, query: undefined, body});
  assertCurrentAccount(accountId);
  if (result.accountId !== accountId) throw Error("ONBOARDING_ACCOUNT_CHANGED");
  return result;
}

export async function loadState(): Promise<OnboardingState> {
  const accountId = readCurrentAccountId();
  if (!accountId) return {accountId: null, origin: null};
  let record = await client.getOnboarding({params: {accountId}, query: undefined, body: undefined});
  assertCurrentAccount(accountId);
  if (record.accountId !== accountId) throw Error("ONBOARDING_ACCOUNT_CHANGED");
  // 老端口的全局偏好仅归属当前账号一次；跨端口找不到时由真实成果恢复里程碑。
  try {
    const migratedKey = "creatoros:onboarding:legacy-migrated-account";
    if (!window.localStorage.getItem(migratedKey) && record.updatedAt === null) {
      const origin = readOrigin();
      const hidden = window.localStorage.getItem("creatoros:onboarding:hidden") === "1";
      if (origin || hidden) record = await saveOnboarding(accountId, {...(origin ? {origin} : {}), ...(hidden ? {hidden: true} : {})});
      window.localStorage.setItem(migratedKey, accountId);
    }
  } catch { /* 旧偏好无法迁移时，不覆盖后端已有进度。 */ }
  // 已关闭不触发昂贵的项目/雷达查询，更不触发采集或登录。
  if (record.hidden) return {accountId, origin: record.origin, completedSteps: record.completedSteps, preferences: record};
  const [projectSignals, radarSignals, accountBound, hasPositioningProfile] = await Promise.all([
    loadProjectSignals(accountId), loadRadarSignals(accountId), loadAccountBound(accountId), loadHasProfile(),
  ]);
  assertCurrentAccount(accountId);
  const state: OnboardingState = {
    accountId,
    origin: resolveOrigin(record.origin, projectSignals),
    douyinLoggedIn: accountBound,
    ...projectSignals, ...radarSignals, hasPositioningProfile,
    hasReviewedImportedProjects: record.completedSteps.includes("review-imported-projects") || readReviewedImportedProjects(accountId),
    completedSteps: record.completedSteps,
    preferences: record,
  };
  const completedSteps = deriveGuidedSteps(state).filter(step => step.done).map(step => step.key);
  if (completedSteps.some(key => !record.completedSteps.includes(key)) || state.origin !== record.origin) {
    try {
      const preferences = await saveOnboarding(accountId, {completedSteps, origin: state.origin ?? null});
      return {...state, completedSteps: preferences.completedSteps, preferences};
    } catch {
      assertCurrentAccount(accountId);
      return {...state, persistenceError: "进度暂未保存，请重试。"};
    }
  }
  return state;
}

async function loadAccountBound(accountId: string): Promise<boolean | undefined> {
  try {
    const account = await client.getAccount({params: {accountId},query: undefined,body: undefined});
    return account.id === accountId ? true : undefined;
  } catch { return undefined; }
}

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
