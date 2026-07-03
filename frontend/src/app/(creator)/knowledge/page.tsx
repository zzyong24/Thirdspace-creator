/**
 * Knowledge & Memory route entrypoint.
 *
 * The (creator) layout supplies the shared AppShell (Sidebar + TopHeader)
 * and the global Header is configured for `/knowledge` in
 * `shell-router.tsx`. The page itself is a Server Component
 * (page-specs §11, D-002) and just provides the page slot.
 *
 * Tri-state (GAP-KM-tristate): the route resolves the request session and builds
 * the REAL VM with a session-SCOPED contract client, so a logged-in user reads
 * THEIR OWN `ctx.userId` knowledge — a fresh empty account reads empty (honest
 * 空态), NOT the canonical user-zyongzhu seed. A primary `knowledge.list` read
 * failure surfaces as an error state (no fabricated fixture VM). The no-session
 * branch keeps the fixture seam (`<KnowledgePage />` builds via the singleton)
 * for SSR/tests; the (creator) layout guard already redirects unauthenticated
 * real requests.
 */
import { KnowledgePage } from "@/features/knowledge/knowledge-page";
import type { KnowledgeDataClient } from "@/features/knowledge/knowledge-data";
import { buildKnowledgeDashboardViewModel } from "@/features/knowledge/knowledge-data";
import { resolveSession } from "@/lib/session.server";
import { createServerClient } from "@/lib/contract-client.server";

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

export default async function KnowledgeRoutePage({
  searchParams,
}: KnowledgeRoutePageProps = {}) {
  // KNOW-13:热门标签 chip 链到 /knowledge?tag=<name>;读侧真消费该参数,
  // recent 列表只保留挂该标签的条目(过滤逻辑见 knowledge-data.ts)。
  const tag = firstParam(((await searchParams) ?? {}).tag);
  const session = await resolveSession();
  if (!session) {
    // No session (the (creator) layout guard redirects on a real request). Keep
    // the fixture seam: the page builds via the singleton client for SSR/tests.
    return <KnowledgePage />;
  }

  // Bind the read to the request's session ctx so knowledge.list /
  // knowledge.relations.list / taxonomy.tags.list stay user-scoped (ctx.userId).
  // The helper returns scenario "error" on a primary read failure and an honest
  // empty VM when the account simply has no knowledge yet.
  const client = createServerClient(
    session.ctx,
  ) as unknown as KnowledgeDataClient;
  const viewModel = await buildKnowledgeDashboardViewModel(client, { tag });
  return <KnowledgePage viewModel={viewModel} />;
}
