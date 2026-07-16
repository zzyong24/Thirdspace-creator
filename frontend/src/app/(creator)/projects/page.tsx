/**
 * Projects index route. Renders the Projects page inside the shared
 * (creator) layout, which already provides the AppShell (one Sidebar +
 * one TopHeader). The page itself is a Server Component.
 *
 * Reads the `?page=` search param (1-based) and threads it into ProjectsPage,
 * which drops the canonical demo projects, sorts newest-first, and pages 10
 * works per screen.
 *
 * Session-scoped read (lane center-pages): the route resolves the request's
 * session and constructs `createServerClient(session.ctx)` so the projects list is
 * scoped to the logged-in user — a brand-new empty account reads its own (empty)
 * works, not the user-zyongzhu seed. With no session the fixture-composed fallback
 * (the feature's singleton seam) renders so SSR/tests never crash.
 */

import { ProjectsPage } from "@/features/projects/projects-page";
import { createServerClient } from "@/lib/contract-client.server";
import { resolveSession } from "@/lib/session.server";
import { ZeroAccountGuidance } from "@/components/shell/zero-account-guidance";

export default async function Page({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = (await searchParams) ?? {};
  const raw = Array.isArray(params.page) ? params.page[0] : params.page;
  const parsed = Number(raw);
  const page = Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 1;
  // [T-051 2b] 状态筛选 + 排序从 URL 读(三件套接真;非法值回默认)。
  // [T-288] 默认 status 回「全部」:用户实测点「项目」默认落到已发布不合适(在制作/草稿里的
  //   作品被藏)。改回默认 all —— 进来看全部,published 只作可选过滤(点 tab 才筛)。
  //   (原 T-153 默认 published 撤回。)
  const rawStatus = Array.isArray(params.status) ? params.status[0] : params.status;
  const status = rawStatus && /^[a-z]+$/.test(rawStatus) ? rawStatus : "all";
  const rawSort = Array.isArray(params.sort) ? params.sort[0] : params.sort;
  const sort =
    rawSort &&
    ["updated", "progress", "stage", "title", "plays", "likes", "comments"].includes(
      rawSort,
    )
      ? rawSort
      : "updated";
  // [T-073] 显示已隐藏(抖音端「仅自己可见/已隐藏」的作品):?hidden=1 才显,默认过滤。
  const rawHidden = Array.isArray(params.hidden) ? params.hidden[0] : params.hidden;
  const showHidden = rawHidden === "1";

  const session = await resolveSession();
  if (!session) {
    return (
      <ProjectsPage
        page={page}
        status={status}
        sort={sort}
        showHidden={showHidden}
      />
    );
  }

  // [T-353] 未选号(含 0 号)= 引导态(T-332 §4.2):本页 per-account 读会撞 S2 strict 门
  // (AccountRequiredError → 整页错误边界)。layout 的零账号守卫只在首次渲染判定(App Router
  // 客户端导航不重渲 layout),故页面自兜:ctx 无选中号 → 渲绑定引导,不发注定失败的读。
  if (!session.ctx.accountId) {
    return <ZeroAccountGuidance />;
  }
  return (
    <ProjectsPage
      page={page}
      status={status}
      sort={sort}
      showHidden={showHidden}
      client={createServerClient(session.ctx)}
    />
  );
}
