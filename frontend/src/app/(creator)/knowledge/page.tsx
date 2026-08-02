/**
 * Knowledge & Memory route entrypoint.
 *
 * The (creator) layout supplies the shared AppShell (Sidebar + TopHeader)
 * and the global Header is configured for `/knowledge` in
 * `shell-router.tsx`. The page itself is a Server Component
 * (page-specs §11, D-002) and just provides the page slot.
 *
 * T-118b(经验归位 SPEC §B):`/knowledge` 从双 Tab(知识库 | 经验沉淀)
 * **收敛为单一知识库视图**。已验证经验(validationStatus="validated")作为
 * **只读一等类型**并入知识库读层(见 `buildKnowledgeDashboardViewModel`):左栏
 * CategoryPanel 加「经验」分类,中栏「最近更新」混排知识卡 + 经验条目。本 route
 * 只装配 knowledge VM 并直渲 `<KnowledgePage />`(不再并行装 experience VM /
 * 不再包 KnowledgeWorkspaceTabs)。经验裁决(采纳/翻案)已在 T-118a 迁进复盘页。
 *
 * Tri-state(GAP-KM-tristate):route 解析请求 session 并用 session-scoped 契约
 * client 构造 REAL VM,登录用户读自己的 `ctx.userId` 数据;无 session 走
 * fixture seam(`<KnowledgePage />` 无 VM 走 singleton),(creator) layout guard
 * 已对未登录真请求重定向。
 *
 * URL 承载:`?tag=`(KNOW-13 标签筛选)+ `?page=`(T-119 最近更新混排分页,
 * 10 条/页,最新在前)。
 */
import { KnowledgePage } from "@/features/knowledge/knowledge-page";
import type { KnowledgeDataClient } from "@/features/knowledge/knowledge-data";
import { buildKnowledgeDashboardViewModel } from "@/features/knowledge/knowledge-data";
import { resolveSession } from "@/lib/session.server";
import { createServerClient } from "@/lib/contract-client.server";
import { ZeroAccountGuidance } from "@/components/shell/zero-account-guidance";

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

// [T-119] 解析 `?page=` 为 1-based 正整数;非法/缺省 → 1(读层再夹取上界)。
function parsePageParam(value: string | string[] | undefined): number {
  const raw = firstParam(value);
  if (raw === null) return 1;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

export default async function KnowledgeRoutePage({
  searchParams,
}: KnowledgeRoutePageProps = {}) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const view = firstParam(resolvedSearchParams.view) === "knowledge" ? "knowledge" : "course";
  const lesson = firstParam(resolvedSearchParams.lesson);

  // 内置课程随安装包发布,不依赖登录态/选中账号。默认先进入课程目录；
  // 用户自己的知识仍保持严格 account-scoped。
  if (view === "course") {
    return <KnowledgePage activeView="course" activeLessonId={lesson} />;
  }
  // KNOW-13:热门标签 chip 链到 /knowledge?tag=<name>;读侧真消费该参数,
  // recent 列表只保留挂该标签的条目(过滤逻辑见 knowledge-data.ts)。
  const tag = firstParam(resolvedSearchParams.tag);
  // [T-119] ?page= 承载「最近更新」混排分页(知识卡 + validated 经验共用)。
  const page = parsePageParam(resolvedSearchParams.page);

  const session = await resolveSession();

  if (!session) {
    // No session (the (creator) layout guard redirects on a real request). Keep
    // the fixture seam: `<KnowledgePage />` 无 VM 走 singleton(canonical ctx),
    // SSR/测试不崩。
    return <KnowledgePage activeView="knowledge" />;
  }

  // [T-353] 未选号(含 0 号)= 引导态(T-332 §4.2):本页 per-account 读会撞 S2 strict 门
  // (AccountRequiredError → 整页错误边界)。layout 的零账号守卫只在首次渲染判定(App Router
  // 客户端导航不重渲 layout),故页面自兜:ctx 无选中号 → 渲绑定引导,不发注定失败的读。
  if (!session.ctx.accountId) {
    return <ZeroAccountGuidance />;
  }

  // Bind reads to the request's session ctx so knowledge.* / learnings.* stay
  // user-scoped (ctx.userId).
  const kclient = createServerClient(
    session.ctx,
  ) as unknown as KnowledgeDataClient;

  const knowledgeVM = await buildKnowledgeDashboardViewModel(kclient, {
    tag,
    page,
  });

  return <KnowledgePage activeView="knowledge" viewModel={knowledgeVM} />;
}
