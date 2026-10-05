/**
 * Global Search route entrypoint (Module 02, Task 5 — server read switch).
 *
 * The (creator) layout supplies the shared AppShell (Sidebar + TopHeader) and the
 * global Header is configured for `/search` with header mode `search` and the
 * approved `assistant` contextual-card variant in `shell-router.tsx`.
 *
 * This is a Server Component. It reads the `?q=` AND `?type=` URL state from the
 * route's `searchParams`, fetches the composed `pages.search.get` op server-side
 * under the request's session ctx (threading the type facet so the backend
 * narrows the card groups — [T-051 2d] the route used to DROP `?type=`), maps
 * the `globalSearchPage` DTO into the page's `SearchViewModel`, and renders
 * `SearchPage` with that `viewModel`. The `viewModel?` seam is preserved: when
 * there is no session ctx (SSR fallback / tests), `SearchPage` falls back to
 * `buildSearchViewModel()`.
 *
 * History rows re-run a prior query by navigating `/search?q=<row.query>` (a
 * link), which re-reads `pages.search.get` and re-appends a SearchHistory row
 * server-side (the spec-gap resolution — no invented mutation endpoint).
 */

import * as React from "react";

import { resolveSession } from "@/lib/session.server";
import { createServerClient } from "@/lib/contract-client.server";
import { SearchPage } from "@/features/search/search-page";
import { globalSearchPageToViewModel } from "@/features/search/search-view-model";
import { ZeroAccountGuidance } from "@/components/shell/zero-account-guidance";

interface SearchRoutePageProps {
  readonly searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

// ?type= 分面白名单 —— 与 4 个结果 tab 一一对应;非法值按「未窄化」处理。
const RESULT_TYPE_IDS = new Set(["project", "knowledge", "asset", "video"]);

function firstParam(
  value: string | string[] | undefined,
): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function SearchRoutePage({
  searchParams,
}: SearchRoutePageProps) {
  const params = (await searchParams) ?? {};
  const q = firstParam(params.q) ?? "";
  const rawType = firstParam(params.type);
  // [T-051 2d] ?type= 不再被丢弃:白名单校验后传给 pages.search.get(契约
  // query 本就声明了可选 type 字段),后端据此窄化卡片组并保留全量 tab 计数。
  const type = rawType && RESULT_TYPE_IDS.has(rawType) ? rawType : undefined;

  const session = await resolveSession();
  if (!session) {
    // No session (the (creator) layout guard will already have redirected on a
    // real request). Render the fixture-composed fallback so SSR never crashes.
    return <SearchPage initialQuery={q} activeType={type} />;
  }

  // [T-353] 未选号(含 0 号)= 引导态(T-332 §4.2):本页 per-account 读会撞 S2 strict 门
  // (AccountRequiredError → 整页错误边界)。layout 的零账号守卫只在首次渲染判定(App Router
  // 客户端导航不重渲 layout),故页面自兜:ctx 无选中号 → 渲绑定引导,不发注定失败的读。
  if (!session.ctx.groupId && !session.ctx.accountId) {
    return <ZeroAccountGuidance />;
  }

  const page = (await createServerClient(session.ctx).getGlobalSearch({
    params: undefined,
    query: { q, type },
    body: undefined,
  })) as unknown as Parameters<typeof globalSearchPageToViewModel>[0];

  const viewModel = globalSearchPageToViewModel(page);
  return <SearchPage viewModel={viewModel} initialQuery={q} activeType={type} />;
}
