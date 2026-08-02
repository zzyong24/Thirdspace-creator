import { ZeroAccountGuidance } from "@/components/shell/zero-account-guidance";
import {
  IntelligenceWorkbench,
  type RadarItemDetail,
  type RadarItemRow,
  type RadarWorkspace,
} from "@/features/intelligence/intelligence-workbench";
import { createServerClient } from "@/lib/contract-client.server";
import { resolveSession } from "@/lib/session.server";

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
  const items = (await api.listIntelligenceItems({
    params: undefined,
    query: {
      accountId: session.ctx.accountId,
      page: 1,
      pageSize: 100,
      sort: "published_desc",
    },
    body: undefined,
  })) as unknown as RadarItemRow[];
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
      initialDetail={initialDetail}
      positioningVersionId={positioningStatements[0]?.id ?? null}
    />
  );
}
