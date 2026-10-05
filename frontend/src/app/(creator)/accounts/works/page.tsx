import Link from "next/link";
import { ZeroAccountGuidance } from "@/components/shell/zero-account-guidance";
import { PlatformWorkCatalog, type PlatformWorkCatalogModel } from "@/features/platform-account/platform-work-catalog";
import { createServerClient } from "@/lib/contract-client.server";
import { resolveSession } from "@/lib/session.server";

export default async function PlatformWorksPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ cursor?: string; workId?: string; metricCursor?: string; accountMetricCursor?: string }>;
}) {
  const session = await resolveSession();
  if (!session?.ctx.accountId) return <ZeroAccountGuidance />;

  const accountId = session.ctx.accountId;
  const client = createServerClient(session.ctx);
  const params = await searchParams;
  const cursor = params.cursor || null;
  let model: PlatformWorkCatalogModel;

  try {
    const [account, catalog] = await Promise.all([
      client.getAccount({ params: { accountId }, query: undefined, body: undefined }),
      client.listWorks({ params: { accountId }, query: { cursor, pageSize: 20 }, body: undefined }),
    ]);
    // A URL selection can only open a work in the current, server-owned page.
    const selectedWork = catalog.items.find((item) => item.id === params.workId) ?? null;
    const [accountMetricResult, workMetricResult] = await Promise.allSettled([
      client.readMetrics({
        params: { accountId }, query: { metricKey: "follower_count", cursor: params.accountMetricCursor || null, pageSize: 100 }, body: undefined,
      }),
      selectedWork ? client.readMetrics({
        params: { accountId },
        query: { platformWorkId: selectedWork.id, cursor: params.metricCursor || null, pageSize: 100 },
        body: undefined,
      }) : Promise.resolve(null),
    ]);
    model = {
      accountId,
      accountName: account.accountHandle,
      catalogCompleteness: catalog.catalogCompleteness,
      catalogCompletedAt: catalog.catalogCompletedAt,
      total: catalog.total,
      currentTotal: catalog.currentTotal,
      unavailableTotal: catalog.unavailableTotal,
      nextCursor: catalog.nextCursor,
      cursor,
      works: catalog.items,
      selectedWork,
      accountMetrics: accountMetricResult.status === "fulfilled" ? accountMetricResult.value.accountMetrics : [],
      accountMetricError: accountMetricResult.status === "rejected",
      accountMetricNextCursor: accountMetricResult.status === "fulfilled" ? accountMetricResult.value.nextCursor : null,
      accountMetricCursor: params.accountMetricCursor || null,
      workMetrics: workMetricResult.status === "fulfilled" && workMetricResult.value ? workMetricResult.value.workMetrics : [],
      workMetricNextCursor: workMetricResult.status === "fulfilled" && workMetricResult.value ? workMetricResult.value.nextCursor : null,
      workMetricCursor: params.metricCursor || null,
      workMetricError: workMetricResult.status === "rejected",
    };
  } catch {
    return <div role="alert" className="rounded-lg border border-danger/40 p-6 text-sm text-destructive">
      <p>当前账号的作品目录暂时无法读取。已有作品未受影响，请返回账号页后重试。</p>
      <Link href="/accounts" className="mt-3 inline-block text-primary hover:underline">返回账号</Link>
    </div>;
  }
  return <PlatformWorkCatalog model={model} />;
}
