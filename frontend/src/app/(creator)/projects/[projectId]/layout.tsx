/**
 * 项目嵌套 layout 按真实 ID 读取项目及作品列表，将最小导航切片发布给外层 shell。
 * 旧标题 slug 使用分页兼容；任何读失败仅降级导航，页面仍负责内容与归属错误。
 */

import * as React from "react";

import { CurrentProjectProvider } from "../../current-project-context";
import { StageChatWrapper } from "./stage-chat-wrapper";
import { DraftChatRequestProvider } from "@/features/draft-workbench/draft-chat-request";
import { resolveSession } from "@/lib/session.server";
import { createServerClient } from "@/lib/contract-client.server";

interface ProjectIdLayoutProps {
  readonly children: React.ReactNode;
  readonly params: Promise<{ readonly projectId: string }>;
}

// Keep only ASCII letters/digits so a title like "AI Native Browser 深度解析" collapses to
// "ai-native-browser" (mirrors the page's slugifyTitle — the URL segment may be a slug).
function slugifyTitle(title: string): string {
  const asciiOnly = title.replace(/[^\x20-\x7E]/g, " ");
  return asciiOnly
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Resolve the URL [projectId] segment to the REAL {id, title} against the persisted project
// record (projects.get; title slug compatibility uses projects.list, scoped via the session ctx). Matches by canonical id first, then
// by title-slug. Returns null when nothing matches or the read fails (honest → neutral shell).
// [FE-M07] 也读 currentStage / progressPct:shell 的 fixture 里查不到真项目时,靠这两个真值
// 显示正确阶段与进度(否则 shell 恒退回 research/0%,把制作/复盘项目误显为脚本阶段)。
async function resolveRealProject(
  projectId: string,
): Promise<{ id: string; title: string; stage: string; progressPct: number; workOutputs: readonly import("@/features/projects/project-workspaces").WorkspaceOutput[] | null } | null> {
  if (!projectId) return null;
  const session = await resolveSession();
  if (!session) return null;
  try {
    const scoped = createServerClient(session.ctx);
    type ProjectIdentity = {id: string; title: string; currentStage: string; progressPct: number};
    const pick = async (p: {
      id: string;
      title: string;
      currentStage: string;
      progressPct: number;
    }) => {
      let workOutputs: readonly import("@/features/projects/project-workspaces").WorkspaceOutput[] | null = null;
      try {
        workOutputs = await scoped.listOutputs({params: {projectId: p.id}, query: undefined, body: undefined}) as unknown as readonly import("@/features/projects/project-workspaces").WorkspaceOutput[];
      } catch { /* 只降级导航，不冒充已有作品，也不阻断当前页面。 */ }
      return {id: p.id, title: p.title, stage: p.currentStage, progressPct: p.progressPct, workOutputs};
    };
    // canonical ID 不依赖项目列表页，避免第 101 条以后的项目丢失真实导航。
    try {
      const project = await scoped.getProject({params: {projectId}, query: undefined, body: undefined}) as unknown as ProjectIdentity;
      return await pick(project);
    } catch { /* 旧标题 slug 只在真实 ID 未解析时使用完整分页兼容路径。 */ }
    const slug = projectId.toLowerCase();
    for (let page = 1; ; page += 1) {
      const projects = await scoped.listProjects({params: undefined, query: {page, pageSize: 100}, body: undefined}) as unknown as readonly ProjectIdentity[];
      const project = projects.find(item => item.id === projectId || slugifyTitle(item.title) === slug);
      if (project) return await pick(project);
      if (projects.length < 100) return null;
    }

  } catch {
    return null;
  }
}

export default async function ProjectIdLayout({
  children,
  params,
}: ProjectIdLayoutProps) {
  const { projectId } = await params;
  const real = await resolveRealProject(projectId);

  return (
    <CurrentProjectProvider
      value={
        real
          ? {
              routeParam: projectId,
              projectId: real.id,
              title: real.title,
              // [FE-M07] 灌真实阶段/进度,shell header 的阶段条与进度不再恒退回 research/0%。
              stage: real.stage,
              progressPct: real.progressPct,
              workOutputs: real.workOutputs,
            }
          : null
      }
    >
      {/* [T-068] 阶段子页常驻编导对话右栏(稿面自带,wrapper 按路径跳过)。 */}
      <DraftChatRequestProvider>
        <StageChatWrapper
          projectId={real?.id ?? null}
          projectTitle={real?.title ?? null}
        >
          {children}
        </StageChatWrapper>
      </DraftChatRequestProvider>
    </CurrentProjectProvider>
  );
}
