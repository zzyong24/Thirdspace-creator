import { ZeroAccountGuidance } from "@/components/shell/zero-account-guidance";
import {
  IntelligenceWorkbench,
  type RadarItemDetail,
  type RadarItemRow,
  type RadarWorkspace,
} from "@/features/intelligence/intelligence-workbench";
import {
  createServerClient,
  requestServerListWithMeta,
} from "@/lib/contract-client.server";
import { resolveSession } from "@/lib/session.server";
import { ENDPOINTS } from "@creatoros/contract";

export default async function IntelligencePage() {
  const session = await resolveSession();
  if (!session?.ctx.accountId) return <ZeroAccountGuidance />;

  const api = createServerClient(session.ctx);
  const positioningStatements = (await api.listStatements({
    params: undefined,
    query: { page: 1, pageSize: 1 },
    body: undefined,
  })) as unknown as Array<{ id: string }>;
  const workspace = (await api.getIntelligenceWorkspace({
    params: undefined,
    query: { accountId: session.ctx.accountId },
    body: undefined,
  })) as RadarWorkspace;
  const itemPage = await requestServerListWithMeta(
    session.ctx,
    ENDPOINTS.listIntelligenceItems,
    {
      params: undefined,
      query: {
        accountId: session.ctx.accountId,
        page: 1,
        pageSize: 100,
        sort: "published_desc",
      },
      body: undefined,
    },
  );
  const items = itemPage.data as RadarItemRow[];
  const initialDetail =
    items.length > 0
      ? ((await api.getIntelligenceItem({
          params: { itemId: items[0]!.item.id },
          query: undefined,
          body: undefined,
        })) as RadarItemDetail)
      : null;

  return (
    <IntelligenceWorkbench
      accountId={session.ctx.accountId}
      workspace={workspace}
      items={items}
      initialTotal={itemPage.meta.total}
      initialDetail={initialDetail}
      positioningVersionId={positioningStatements[0]?.id ?? null}
    />
  );
}
