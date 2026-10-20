import { PreviewSamples } from "@/features/preview/preview-samples";
import { hasPreviewSamples } from "@/features/preview/preview-mode.server";
import {createCachedPageClient,createServerClient} from "@/lib/contract-client.server";
import {resolveSession} from "@/lib/session.server";
import {yesterdayBeijing} from "@creatoros/backend/application/queries/daily-report";
import {DailyReportPage} from "@/features/daily-report/daily-report-page";
import {GroupWorkspaceFilters} from "@/features/group-workspace/group-workspace-filters";
import {workspaceQueryFromSearch} from "@/features/group-workspace/workspace-query";
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
 const requested=await searchParams,filters=workspaceQueryFromSearch(requested);
 const dates=filters.startDate&&filters.endDate?(requested.date?{date:filters.startDate}:{startDate:filters.startDate,endDate:filters.endDate}):{date:yesterdayBeijing(new Date().toISOString()).date};
 const query={...dates,...(filters.platform?{platform:filters.platform}:{}),...(filters.accountId?{accountId:filters.accountId}:{})};
 const session=await resolveSession();
 if(!session)return <DailyReportPage report={{date:dates.date??filters.endDate??yesterdayBeijing(new Date().toISOString()).date,startDate:filters.startDate,endDate:filters.endDate,timeZone:"Asia/Shanghai",generatedAt:new Date().toISOString(),accountId:null,accountName:null,positioning:null,warnings:[],works:[],recentWorks:[]}}/>;
 const pageClient=createCachedPageClient(session.ctx);
 const workspace=session?.ctx.groupId?(await createServerClient(session.ctx).getGroupOverview({body:undefined,params:{groupId:session.ctx.groupId},query:{...filters,...(filters.startDate?{}:{startDate:dates.date,endDate:dates.date})}})).workspace:null;
 const report=await pageClient.getDailyReport({params:undefined,query,body:undefined});
 if(hasPreviewSamples(session.ctx.groupId)&&report.works.length===0)return <main data-page="preview-analysis" className="flex min-w-0 flex-col gap-5"><header><h1 className="text-2xl font-semibold">运营分析</h1></header><PreviewSamples kind="analytics"/><details data-slot="preview-real-data"><summary>查看真实报表、日期与分析操作</summary>{workspace&&<GroupWorkspaceFilters workspace={workspace} showDate={false}/>}<DailyReportPage showPageHeading={false} report={report}/></details></main>;
 return <div className="flex min-w-0 flex-col gap-section-gap">{workspace&&<GroupWorkspaceFilters workspace={workspace} showDate={false}/>}<DailyReportPage report={report} accountNames={Object.fromEntries((workspace?.accounts??[]).map(account=>[account.id,account.name]))}/></div>;
}
