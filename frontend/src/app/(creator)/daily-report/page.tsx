import {client,createCachedPageClient} from "@/lib/contract-client.server";
import {resolveSession} from "@/lib/session.server";
import {yesterdayBeijing} from "@creatoros/backend/application/queries/daily-report";
import {DailyReportPage} from "@/features/daily-report/daily-report-page";
export default async function Page({searchParams}:{searchParams:Promise<{date?:string;startDate?:string;endDate?:string}>}){
 const requested=await searchParams;
 const query=requested.date||requested.startDate||requested.endDate?requested:{date:yesterdayBeijing(new Date().toISOString()).date};
 const session=await resolveSession();
 const pageClient=session?createCachedPageClient(session.ctx):client;
 const report=await pageClient.getDailyReport({params:undefined,query,body:undefined});
 return <DailyReportPage report={report}/>;
}
