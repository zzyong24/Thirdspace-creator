import {client} from "@/lib/contract-client.server";
import {DailyReportPage} from "@/features/daily-report/daily-report-page";
export default async function Page({searchParams}:{searchParams:Promise<{date?:string}>}){
 const {date}=await searchParams;
 const report=await client.getDailyReport({params:undefined,query:{date},body:undefined});
 return <DailyReportPage report={report}/>;
}
