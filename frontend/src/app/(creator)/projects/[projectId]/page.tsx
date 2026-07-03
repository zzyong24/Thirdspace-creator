/**
 * 项目主路由 → 稿面工作台(T-055a,SPEC §3.3)。
 *
 * `/projects/[projectId]` 从「七阶段总览页」重做为「稿面工作台」——一个项目 =
 * 一张不断成熟的稿子(选题卡 → 口播脚本 → 发布包 + 弹药抽屉),阶段降级为顶条
 * 成熟度标记。原 research/planning/script/publishing 四阶段路由 301 到本页锚点。
 *
 * Server Component:session ctx 下读(跨用户/未知项目 → 404);无 session
 * (SSR 兜底/测试)渲染空态壳,绝不 fixture。
 */

import { notFound } from "next/navigation";

import { DraftWorkbenchPage } from "@/features/draft-workbench/draft-workbench-page";
import {
  buildDraftWorkbenchVm,
  type DraftWorkbenchClient,
} from "@/features/draft-workbench/draft-workbench-data";
import { isOwnershipError } from "@/features/project-overview/project-overview-workspace-data";
import { resolveSession } from "@/lib/session.server";
import { createServerClient, client } from "@/lib/contract-client.server";

interface DraftWorkbenchRouteProps {
  readonly params: Promise<{ readonly projectId: string }>;
}

export default async function DraftWorkbenchRoute({
  params,
}: DraftWorkbenchRouteProps) {
  const { projectId } = await params;
  const resolvedId = await resolveProjectIdParam(projectId);

  const session = await resolveSession();
  if (!session) {
    // T-046 后 session 恒有;异常态(库中无用户)诚实 404,不渲染 fixture。
    notFound();
  }

  const scoped = createServerClient(session.ctx) as unknown as DraftWorkbenchClient;
  try {
    const vm = await buildDraftWorkbenchVm(resolvedId, scoped);
    return <DraftWorkbenchPage vm={vm} />;
  } catch (err) {
    if (isOwnershipError(err)) notFound();
    // 项目读失败(未知 id 等)→ 404,与旧总览语义一致。
    notFound();
  }
}

/**
 * URL `[projectId]` 段 → canonical 项目 id(沿用旧总览页的解析:完整 id 直通,
 * kebab 化标题兜底;都不中回原参 → 上层 404)。
 */
async function resolveProjectIdParam(param: string): Promise<string> {
  if (!param) return param;
  try {
    const projects = (await client.listProjects({
      params: undefined,
      query: { page: 1, pageSize: 100 },
      body: undefined,
    })) as unknown as ReadonlyArray<{ id: string; title: string }>;
    if (projects.some((project) => project.id === param)) {
      return param;
    }
    const slug = param.toLowerCase();
    const match = projects.find(
      (project) => slugifyTitle(project.title) === slug,
    );
    return match?.id ?? param;
  } catch {
    return param;
  }
}

function slugifyTitle(title: string): string {
  const asciiOnly = title.replace(/[^\x20-\x7E]/g, " ");
  return asciiOnly
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
