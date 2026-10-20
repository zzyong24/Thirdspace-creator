import { PreviewSamples } from "@/features/preview/preview-samples";
import { hasPreviewSamples } from "@/features/preview/preview-mode.server";
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
  if (!session || (!session.ctx.groupId && !session.ctx.accountId)) return <ZeroAccountGuidance />;

  const scope=session.ctx.groupId?{}:{accountId:session.ctx.accountId??undefined};
  const api = createServerClient(session.ctx);
  const positioningStatements = (await api.listStatements({
    params: undefined,
    query: { page: 1, pageSize: 1 },
    body: undefined,
  })) as unknown as Array<{ id: string }>;
  const workspace = (await api.getIntelligenceWorkspace({
    params: undefined,
    query: scope,
    body: undefined,
  })) as RadarWorkspace;
  const itemPage = await requestServerListWithMeta(
    session.ctx,
    ENDPOINTS.listIntelligenceItems,
    {
      params: undefined,
      query: {
        ...scope,
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

  const workbench = (
    <IntelligenceWorkbench
      groupId={session.ctx.groupId??undefined}
      accountId={session.ctx.accountId??undefined}
      workspace={workspace}
      items={items}
      initialTotal={itemPage.meta.total}
      initialDetail={initialDetail}
      positioningVersionId={positioningStatements[0]?.id ?? null}
    />
  );
  if (hasPreviewSamples(session.ctx.groupId) && items.length === 0) return (
    <main data-page="preview-radar" className="flex h-full min-h-0 flex-col gap-5 overflow-y-auto">
      <header><h1 className="text-2xl font-semibold">内容雷达</h1></header>
      <PreviewSamples kind="radar" radarSources={<IntelligenceWorkbench
        presentation="sources"
        groupId={session.ctx.groupId??undefined}
        accountId={session.ctx.accountId??undefined}
        workspace={workspace}
        items={items}
        initialTotal={itemPage.meta.total}
        initialDetail={initialDetail}
        positioningVersionId={positioningStatements[0]?.id ?? null}
      />}/>
    </main>
  );
  return workbench;
}
