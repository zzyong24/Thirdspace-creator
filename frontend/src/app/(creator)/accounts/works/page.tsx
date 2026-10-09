import Link from "next/link";
import type {AccountGroupResource} from "@creatoros/contract";
import { ZeroAccountGuidance } from "@/components/shell/zero-account-guidance";
import { NativeReportPanel } from "@/features/platform-account/native-report-panel";
import { PlatformWorkCatalog, type PlatformWorkCatalogModel } from "@/features/platform-account/platform-work-catalog";
import { createServerClient } from "@/lib/contract-client.server";
import { resolveSession } from "@/lib/session.server";

export default async function PlatformWorksPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ accountId?: string; cursor?: string; workId?: string; metricCursor?: string; accountMetricCursor?: string }>;
}) {
  const session = await resolveSession();
  if (!session) return <ZeroAccountGuidance />;
  const params = await searchParams;
  const accountId = params.accountId || session.ctx.accountId;
  if (!accountId) return <ZeroAccountGuidance />;
  let client = createServerClient({...session.ctx,accountId});
  let selectedGroup:AccountGroupResource|null=null;
  let accountForCatalog:Awaited<ReturnType<typeof client.getAccount>>|null=null;
  try {
    if (params.accountId) {
      if (!session.ctx.groupId) return <ZeroAccountGuidance />;
      const group = selectedGroup = await createServerClient({...session.ctx,accountId:null,membershipVersion:undefined}).getAccountGroup({params:{groupId:session.ctx.groupId},query:undefined,body:undefined});
      const member=group.members.find(member=>member.accountId===accountId&&member.status==='active'&&member.leftAt===null);
      if (!member) return <p role="alert" className="text-sm text-destructive">这个账号不属于当前账号组，请返回账号页重新选择。</p>;
      client=createServerClient({...session.ctx,accountId,groupVersion:group.version,membershipVersion:member.version});
    }
    const account=accountForCatalog=await client.getAccount({params:{accountId},query:undefined,body:undefined});
    if (account.platform==='wechatOfficial'||account.platform==='wechatVideo') {
      if (!session.ctx.groupId) return <ZeroAccountGuidance />;
      const group=selectedGroup??await createServerClient({...session.ctx,accountId:null,membershipVersion:undefined}).getAccountGroup({params:{groupId:session.ctx.groupId},query:undefined,body:undefined});
      const member=group.members.find(member=>member.accountId===accountId&&member.status==='active'&&member.leftAt===null);
      if (!member) return <p role="alert" className="text-sm text-destructive">请在当前账号组选择真实成员。</p>;
      client=createServerClient({...session.ctx,accountId,groupVersion:group.version,membershipVersion:member.version});
      const result=await client.listNativeReports({params:{accountId},query:{pageSize:20,cursor:null},body:undefined}).then(value=>({value,error:false})).catch(()=>({value:{items:[],nextCursor:null,total:0},error:true}));
      const capabilities=await client.listCapabilities({params:undefined,query:undefined,body:undefined}).catch(()=>({items:[]}));
      const canCollect=capabilities.items.some(item=>item.platform===account.platform&&item.capability==='nativeReports'&&item.supported&&item.runtimeState==='ready');
      return <NativeReportPanel key={`${group.id}:${accountId}`} userId={session.ctx.userId} group={group} accountId={accountId} accountName={account.accountHandle} platform={account.platform} canCollect={canCollect} initialReports={result.value.items} initialNextCursor={result.value.nextCursor} initialReadError={result.error}/>;
    }
  } catch {
    return <div role="alert" className="rounded-card border border-danger/40 p-6 text-sm text-destructive"><p>当前账号的数据暂时无法读取，请返回账号页后重试。</p><Link href="/accounts" className="mt-3 inline-block text-brand">返回账号</Link></div>;
  }
  const cursor = params.cursor || null;
  let model: PlatformWorkCatalogModel;

  try {
    const [account, catalog] = await Promise.all([
      Promise.resolve(accountForCatalog!),
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
