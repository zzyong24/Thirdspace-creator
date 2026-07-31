/** 新手引导状态装配：所有完成态都来自真实产品数据，失败时保持未完成。 */

import { client } from "@/lib/contract-client";
import { readCurrentAccountId } from "@/lib/http-transport";
import {
  resolveOrigin,
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

export async function loadProjectSignals(): Promise<{
  readonly hasImportedWorks?: boolean;
  readonly hasCreatedProject?: boolean;
}> {
  try {
    const rows = (await client.listProjects({
      params: undefined,
      query: { page: 1, pageSize: 100 },
      body: undefined,
    })) as unknown as ReadonlyArray<{ source?: unknown }>;
    if (!Array.isArray(rows)) return {};
    return {
      hasImportedWorks: rows.some((row) => row.source === "imported"),
      // 历史作品由采集生成，不能冒充用户完成了新建项目。
      hasCreatedProject: rows.some(
        (row) => row.source === "manual" || row.source === "topic",
      ),
    };
  } catch {
    return {};
  }
}

export async function loadRadarSignals(): Promise<{
  readonly hasBenchmarkMonitor?: boolean;
  readonly hasBenchmarkTopic?: boolean;
}> {
  const accountId = readCurrentAccountId();
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

export async function loadState(): Promise<OnboardingState> {
  const accountId = readCurrentAccountId();
  const [projectSignals, radarSignals, douyinLoggedIn, hasPositioningProfile] =
    await Promise.all([
      loadProjectSignals(),
      loadRadarSignals(),
      loadDouyinLoggedIn(),
      loadHasProfile(),
    ]);
  const hasImportedWorks = projectSignals.hasImportedWorks;
  return {
    origin: resolveOrigin(readOrigin(), {
      douyinLoggedIn,
      hasImportedWorks,
    }),
    douyinLoggedIn,
    hasImportedWorks,
    hasReviewedImportedProjects:
      hasImportedWorks === true
        ? readReviewedImportedProjects(accountId)
        : false,
    hasPositioningProfile,
    hasCreatedProject: projectSignals.hasCreatedProject,
    hasBenchmarkMonitor: radarSignals.hasBenchmarkMonitor,
    hasBenchmarkTopic: radarSignals.hasBenchmarkTopic,
  };
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

export async function loadDouyinLoggedIn(): Promise<boolean | undefined> {
  try {
    const status = (await client.statusDouyin({
      params: undefined,
      query: {},
      body: undefined,
    })) as { loggedIn?: unknown };
    return status.loggedIn === true ? true : undefined;
  } catch {
    return undefined;
  }
}
