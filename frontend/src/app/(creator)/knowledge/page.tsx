/**
 * Knowledge & Memory route entrypoint.
 *
 * The (creator) layout supplies the shared AppShell (Sidebar + TopHeader)
 * and the global Header is configured for `/knowledge` in
 * `shell-router.tsx`. The page itself is a Server Component
 * (page-specs §11, D-002) and just provides the page slot.
 *
 * T-113(IA 收敛 SPEC §B):`/knowledge` 收敛为单一入口,顶部加两页签
 * 「知识库」/「经验沉淀」。本 route 在 server 端并行装配 knowledge + experience
 * 两套 VM,把两个既有 Page 组件(`<KnowledgePage />` / `<ExperiencePage />`)
 * 预渲染成 slot,交给 client 外壳 `KnowledgeWorkspaceTabs` 承载页签切换。
 * 两侧 op、岛内部逻辑、交互全部不动;此处只多装配一个 experience VM。
 *
 * Tri-state(GAP-KM-tristate):route 解析请求 session 并用 session-scoped 契约
 * client 构造 REAL VM,登录用户读自己的 `ctx.userId` 数据;无 session 走
 * fixture seam(知识库 Tab `<KnowledgePage />` 走 singleton,经验 Tab 走
 * `defaultClient`),(creator) layout guard 已对未登录真请求重定向。
 *
 * [gate-F3] Tab 状态用 `?tab=knowledge|experience` 承载:此处读 `searchParams.tab`
 * 解出 `defaultTab`(缺省 knowledge),深链/刷新即选中对应页签。
 */
import { KnowledgePage } from "@/features/knowledge/knowledge-page";
import type { KnowledgeDataClient } from "@/features/knowledge/knowledge-data";
import { buildKnowledgeDashboardViewModel } from "@/features/knowledge/knowledge-data";
import {
  KnowledgeWorkspaceTabs,
  type KnowledgeWorkspaceTab,
} from "@/features/knowledge/knowledge-workspace-tabs";
import { ExperiencePage } from "@/features/experience/experience-page";
import type { ApplyTarget } from "@/features/experience/experience-page";
import {
  buildExperienceWorkspaceViewModel,
  type ExperienceDataClient,
} from "@/features/experience/experience-data";
import { resolveSession } from "@/lib/session.server";
import {
  client as defaultClient,
  createServerClient,
} from "@/lib/contract-client.server";

interface KnowledgeRoutePageProps {
  readonly searchParams?: Promise<
    Record<string, string | string[] | undefined>
  >;
}

// 取 searchParams 单值(重复参数取第一个),空白视为未提供。
function firstParam(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  const trimmed = (raw ?? "").trim();
  return trimmed.length === 0 ? null : trimmed;
}

// ---------------------------------------------------------------------------
// 经验 Tab:「应用到项目」目标候选(照 experience/page.tsx 原 resolveApplyTargets)
// ---------------------------------------------------------------------------

interface ProjectListItemDto {
  readonly id: string;
  readonly title: string;
}

type ProjectsReadClient = Pick<typeof defaultClient, "listProjects">;

async function resolveApplyTargets(
  client: ProjectsReadClient,
): Promise<ReadonlyArray<ApplyTarget>> {
  try {
    const projects = (await client.listProjects({
      params: undefined,
      query: { page: 1, pageSize: 50 },
      body: undefined,
    })) as unknown as ReadonlyArray<ProjectListItemDto>;
    return projects.map((p) => ({ id: p.id, title: p.title }));
  } catch {
    return [];
  }
}

export default async function KnowledgeRoutePage({
  searchParams,
}: KnowledgeRoutePageProps = {}) {
  const resolvedSearchParams = (await searchParams) ?? {};
  // KNOW-13:热门标签 chip 链到 /knowledge?tag=<name>;读侧真消费该参数,
  // recent 列表只保留挂该标签的条目(过滤逻辑见 knowledge-data.ts)。
  const tag = firstParam(resolvedSearchParams.tag);
  // [gate-F3] ?tab= 承载页签(缺省 knowledge)。
  const defaultTab: KnowledgeWorkspaceTab =
    firstParam(resolvedSearchParams.tab) === "experience"
      ? "experience"
      : "knowledge";

  const session = await resolveSession();

  if (!session) {
    // No session (the (creator) layout guard redirects on a real request). Keep
    // the fixture seam: 知识库 Tab 走 singleton(`<KnowledgePage />` 无 VM),
    // 经验 Tab 走 defaultClient singleton(canonical ctx),SSR/测试不崩。
    const [experienceVM, applyTargets] = await Promise.all([
      buildExperienceWorkspaceViewModel(
        defaultClient as unknown as ExperienceDataClient,
      ),
      resolveApplyTargets(defaultClient),
    ]);
    return (
      <KnowledgeWorkspaceTabs
        knowledgeSlot={<KnowledgePage />}
        experienceSlot={
          <ExperiencePage viewModel={experienceVM} applyTargets={applyTargets} />
        }
        defaultTab={defaultTab}
      />
    );
  }

  // Bind reads to the request's session ctx so knowledge.* / learnings.* /
  // calibration.suggestions.* / projects.list stay user-scoped (ctx.userId).
  const kclient = createServerClient(
    session.ctx,
  ) as unknown as KnowledgeDataClient;
  const eclient = createServerClient(session.ctx);

  const [knowledgeVM, experienceVM, applyTargets] = await Promise.all([
    buildKnowledgeDashboardViewModel(kclient, { tag }),
    buildExperienceWorkspaceViewModel(
      eclient as unknown as ExperienceDataClient,
    ),
    resolveApplyTargets(eclient),
  ]);

  return (
    <KnowledgeWorkspaceTabs
      knowledgeSlot={<KnowledgePage viewModel={knowledgeVM} />}
      experienceSlot={
        <ExperiencePage viewModel={experienceVM} applyTargets={applyTargets} />
      }
      defaultTab={defaultTab}
    />
  );
}
