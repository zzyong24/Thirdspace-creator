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
  // [T-153] 默认 status 改「已发布」:用户列表以已发布作品为主视图(URL 无 ?status= 时
  //   落 published;显式传 ?status=all 仍可回全部)。仅改 route 默认,ProjectsPage 组件
  //   默认参数保持 "all"(测试 seam 不受影响)。
  const rawStatus = Array.isArray(params.status) ? params.status[0] : params.status;
  const status = rawStatus && /^[a-z]+$/.test(rawStatus) ? rawStatus : "published";
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
