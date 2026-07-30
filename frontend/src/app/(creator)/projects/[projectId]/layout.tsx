/**
 * `projects/[projectId]` segment layout (T-039b item②) —— the ONE place in the project
 * route subtree that can read the `[projectId]` param on the server AND wraps every
 * project page (稿面 + review 复盘页;[T-076] 其余阶段子路由为 301 遗留壳)。It reads
 * the REAL project identity ({id, title}) and lifts it to a
 * client context (CurrentProjectProvider) so the shell's ShellRouter (a client island whose
 * `resolveRoute` only knows the fixture dataset) can show the REAL project title in the top
 * header + the left-bottom sidebar indicator instead of the neutral「当前项目」.
 *
 * Why here (not the (creator) layout): Next.js nested layouts do NOT receive child dynamic
 * segments, so `(creator)/layout.tsx` cannot read `projectId`. This nested layout DOES get
 * it (`params.projectId`). It reads the real title via the SAME read path the page uses
 * (projects.list, for canonical-id OR title-slug resolution) — reusing an existing read op,
 * no new repo method.
 *
 * Honesty / resilience: no session (SSR fallback / tests), an unknown project, or any read
 * failure → the provider value is `null` → the shell degrades to its fixture / neutral
 * 「当前项目」 state (never a fabricated title). This layout NEVER 404s or blocks render — the
 * page itself owns the ownership 404 (its own `projects.get` read); the layout is best-effort
 * chrome only.
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
// list (projects.list, user-scoped via the session ctx). Matches by canonical id first, then
// by title-slug. Returns null when nothing matches or the read fails (honest → neutral shell).
// [FE-M07] 也读 currentStage / progressPct:shell 的 fixture 里查不到真项目时,靠这两个真值
// 显示正确阶段与进度(否则 shell 恒退回 research/0%,把制作/复盘项目误显为脚本阶段)。
async function resolveRealProject(
  projectId: string,
): Promise<{ id: string; title: string; stage: string; progressPct: number } | null> {
  if (!projectId) return null;
  const session = await resolveSession();
  if (!session) return null;
  try {
    const projects = (await createServerClient(session.ctx).listProjects({
      params: undefined,
      query: { page: 1, pageSize: 100 },
      body: undefined,
    })) as unknown as ReadonlyArray<{
      id: string;
      title: string;
      currentStage: string;
      progressPct: number;
    }>;
    const pick = (p: {
      id: string;
      title: string;
      currentStage: string;
      progressPct: number;
    }) => ({
      id: p.id,
      title: p.title,
      stage: p.currentStage,
      progressPct: p.progressPct,
    });
    const byId = projects.find((p) => p.id === projectId);
    if (byId) return pick(byId);
    const slug = projectId.toLowerCase();
    const bySlug = projects.find((p) => slugifyTitle(p.title) === slug);
    return bySlug ? pick(bySlug) : null;
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
