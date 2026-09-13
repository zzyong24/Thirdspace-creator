import {reportFileDate} from "./report-period";
import {type DailyReport,type DailyReportAnalysis} from "./report-metrics";
import {isDesktopRuntimeClient} from "@/lib/desktop-updater";
export type ReportShareOptions={analysis?:DailyReportAnalysis|null;rawAnalysis?:string|null;selectedPublicationId?:string;sourceGeneratedAt?:string|null;stale?:boolean};
/** 页面分享预览和 PNG 共用此绘制入口，仅使用公开作品成绩，不消费内部分析。 */
export async function renderDailyReportCanvas(report:DailyReport,_options:ReportShareOptions={}){return drawSharePoster(report);}
import {drawSharePoster,posterCount} from './share-poster';
export function downloadReportBlob(blob:Blob,filename:string){const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);}
export async function exportDailyReport(report:DailyReport,_options:ReportShareOptions={}){
 const count=posterCount(report),files:Record<string,Uint8Array>={};
 for(let page=0;page<count;page++){
  const canvas=await drawSharePoster(report,page);
  const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error("图片生成失败")),"image/png"));
  const filename=`CreatorOS-创作成绩-${reportFileDate(report)}${count>1?`-${page+1}`:''}.png`;
  if(count===1){downloadReportBlob(blob,filename);return;}
  files[filename]=new Uint8Array(await blob.arrayBuffer());canvas.width=0;canvas.height=0;
 }
 const {zipSync}=await import('fflate');
 downloadReportBlob(new Blob([zipSync(files,{level:0}) as BlobPart],{type:'application/zip'}),`CreatorOS-创作成绩-${reportFileDate(report)}.zip`);
}
function csvCell(value:string|number|null|undefined){return `"${String(value??"").replaceAll('"','""')}"`;}
export function dailyReportCsv(report:DailyReport){
 const period=reportFileDate(report),headers=["账号","统计周期","作品标题","发布时间","累计播放","点赞","评论","分享","收藏","作品带来关注","2秒跳出率","5秒留存率","完播率","平均观看秒数","数据采集时间"];
 const rows=report.works.map(work=>[report.accountName??"当前账号",period,work.title,work.publishedAt,work.metrics.views,work.metrics.likes,work.metrics.comments,work.metrics.shares,work.metrics.favorites,work.metrics.follower_gain,work.metrics.bounce_2s_rate,work.metrics.finish_5s_rate,work.metrics.finish_rate,work.metrics.avg_duration_sec,work.capturedAt]);
 return `\uFEFF${[headers,...rows].map(row=>row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}
export async function exportDailyReportCsv(report:DailyReport){
 const filename=`CreatorOS-运营数据-${reportFileDate(report)}.csv`,content=dailyReportCsv(report);
 if(isDesktopRuntimeClient()){
  const {invoke}=await import("@tauri-apps/api/core");
  const saved=await invoke<boolean>("export_daily_report_csv",{content,suggestedName:filename});
  return saved;
 }
 downloadReportBlob(new Blob([content],{type:"text/csv;charset=utf-8"}),filename);
 return true;
}
