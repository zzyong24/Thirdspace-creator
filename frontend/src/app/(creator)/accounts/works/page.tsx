import { PreviewSamples } from "@/features/preview/preview-samples";
import { hasPreviewSamples } from "@/features/preview/preview-mode.server";
import Link from "next/link";
import type {ReactNode} from "react";
import {PlatformWorkAccountNavigation} from "@/features/platform-account/platform-work-account-navigation";
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
  let selectedGroup:AccountGroupResource|null=null;
  if(session.ctx.groupId){
    try{selectedGroup=await createServerClient({...session.ctx,accountId:null,membershipVersion:undefined}).getAccountGroup({params:{groupId:session.ctx.groupId},query:undefined,body:undefined});}
    catch{return <p role="alert" className="text-sm text-destructive">当前账号组暂时无法读取，请返回账号页重试。</p>;}
    if(selectedGroup.status!=='active')return <div role="alert" className="text-sm text-destructive">当前账号组已归档，请<Link href="/accounts" className="ml-1 text-brand">选择有效账号组</Link>。</div>;
  }
  // 组模式没有默认平台账号；不借旧account cookie悄悄进入上一个组的数据。
  const accountId=params.accountId||(selectedGroup?null:session.ctx.accountId);
  const member=selectedGroup?.members.find(member=>member.accountId===accountId&&member.status==='active'&&member.leftAt===null);
  const navigation=selectedGroup?<PlatformWorkAccountNavigation group={selectedGroup} selectedId={accountId} showManagement={!member}/>:null;
  const withNavigation=(content:ReactNode)=>navigation?<div className="flex min-w-0 flex-col gap-5">{navigation}{content}</div>:content;
  if(!accountId)return selectedGroup?<main data-testid="platform-work-account-selection" className="flex min-w-0 flex-col gap-5"><h1 className="text-xl font-semibold">已采集的平台作品</h1>{navigation}{hasPreviewSamples(selectedGroup.id)&&<PreviewSamples kind="platform"/>}{selectedGroup.members.some(member=>member.status==='active'&&member.leftAt===null)&&<p className="text-sm text-muted-foreground">选择一个平台账号，查看它的作品目录和数据。</p>}</main>:<ZeroAccountGuidance/>;
  if(params.accountId&&!selectedGroup)return <ZeroAccountGuidance/>;
  if(selectedGroup&&!member)return withNavigation(<p role="alert" className="text-sm text-destructive">这个账号不属于当前账号组，请选择当前组的平台账号。</p>);
  const client=createServerClient({...session.ctx,accountId,...(selectedGroup&&member?{groupVersion:selectedGroup.version,membershipVersion:member.version}:{})});
  let accountForCatalog:Awaited<ReturnType<typeof client.getAccount>>|null=null;
  try {
    accountForCatalog=await client.getAccount({params:{accountId},query:undefined,body:undefined});
  } catch {
    return withNavigation(<div role="alert" className="rounded-card border border-danger/40 p-6 text-sm text-destructive"><p>当前账号的数据暂时无法读取，请返回账号页后重试。</p><Link href="/accounts" className="mt-3 inline-block text-brand">返回账号</Link></div>);
  }
  const account=accountForCatalog;
  if(account.platform==='wechatOfficial'||account.platform==='wechatVideo'){
    if(!selectedGroup)return <ZeroAccountGuidance/>;
    const result=await client.listNativeReports({params:{accountId},query:{pageSize:20,cursor:null},body:undefined}).then(value=>({value,error:false})).catch(()=>({value:{items:[],nextCursor:null,total:0},error:true}));
    const capabilities=await client.listCapabilities({params:undefined,query:undefined,body:undefined}).catch(()=>({items:[]}));
    const canCollect=capabilities.items.some(item=>item.platform===account.platform&&item.capability==='nativeReports'&&item.supported&&item.runtimeState==='ready');
    return withNavigation(<NativeReportPanel key={`${selectedGroup.id}:${accountId}`} userId={session.ctx.userId} group={selectedGroup} accountId={accountId} accountName={account.accountHandle} platform={account.platform} canCollect={canCollect} initialReports={result.value.items} initialNextCursor={result.value.nextCursor} initialReadError={result.error}/>);
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
    return withNavigation(<div role="alert" className="rounded-lg border border-danger/40 p-6 text-sm text-destructive">
      <p>当前账号的作品目录暂时无法读取。已有作品未受影响，请返回账号页后重试。</p>
      <Link href="/accounts" className="mt-3 inline-block text-primary hover:underline">返回账号</Link>
    </div>);
  }
  return withNavigation(<PlatformWorkCatalog model={model} />);
}
