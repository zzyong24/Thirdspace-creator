import {reportFileDate} from "./report-period";
import {beijingTime,displayNumber,type DailyReport,type DailyReportAnalysis} from "./report-metrics";
import {buildShareModel} from "./share-model";
import {PURCHASE_QR,PURCHASE_URL} from "./purchase-qr";
import {isDesktopRuntimeClient} from "@/lib/desktop-updater";
export type ReportShareOptions={analysis?:DailyReportAnalysis|null;rawAnalysis?:string|null;selectedPublicationId?:string;sourceGeneratedAt?:string|null;stale?:boolean};
/** 页面分享预览和 PNG 共用此绘制入口，仅使用公开作品成绩，不消费内部分析。 */
export async function renderDailyReportCanvas(report:DailyReport,_options:ReportShareOptions={}){
 await document.fonts.ready;
 const canvas=document.createElement("canvas"),context=canvas.getContext("2d");if(!context)throw new Error("当前环境无法生成图片");const c=context;
 const commands:Array<()=>void>=[],width=720,pad=42;
 function text(value:string,x:number,y:number,size=20,color="#20222e",weight=400){commands.push(()=>{c.fillStyle=color;c.font=`${weight} ${size}px sans-serif`;c.fillText(value,x,y);});}
 function box(x:number,y:number,w:number,h:number,color:string){commands.push(()=>{c.fillStyle=color;c.fillRect(x,y,w,h);});}
 function wrap(value:string,x:number,y:number,maxWidth:number,size=20,lineHeight=32,maxLines=8,color="#20222e",weight=400){
  c.font=`${weight} ${size}px sans-serif`;const lines:string[]=[];let line="";
  for(const ch of value){if(ch==="\n"||c.measureText(line+ch).width>maxWidth){lines.push(line);line=ch==="\n"?"":ch;}else line+=ch;}if(line)lines.push(line);
  const clipped=lines.length>maxLines;lines.slice(0,maxLines).forEach((l,i)=>text(l+(clipped&&i===maxLines-1?"…":""),x,y+i*lineHeight,size,color,weight));return Math.min(lines.length,maxLines)*lineHeight;
 }
 const model=buildShareModel(report);
 let y=64;text("CreatorOS / 我的创作成绩",pad,y,22,"#7953ff",600);y+=62;
 y+=wrap(model.accountName,pad,y,636,36,45,2,"#20222e",650);y+=5;
 text(model.period,pad,y,20,"#667085");y+=42;
 box(pad,y,636,224,"#7953ff");text("这些作品，收获的每一次观看",pad+24,y+43,21,"#ffffff");
 text(displayNumber(model.views.value),pad+24,y+122,64,"#ffffff",700);text("累计播放",pad+24,y+162,20,"#ffffff");
 const coverage=(value:{coverage:number;expected:number},unit="条作品")=>value.coverage<value.expected?`已取得 ${value.coverage}/${value.expected} ${unit}的数据`:"";
 if(coverage(model.views))text(coverage(model.views),pad+24,y+199,15,"#eee8ff");y+=249;
 const cards=[{label:"发布作品",value:displayNumber(model.count),note:"条"},{label:"作品带来关注",value:displayNumber(model.followers.value),note:coverage(model.followers)},{label:"累计互动",value:displayNumber(model.interactions.value),note:coverage(model.interactions,"项指标")}];
 cards.forEach((metric,i)=>{const x=pad+i*216;box(x,y,204,133,"#ffffff");text(metric.label,x+15,y+31,17,"#667085");text(metric.value,x+15,y+78,29,"#20222e",600);if(metric.note)wrap(metric.note,x+15,y+108,176,12,17,2,"#667085");});y+=162;
 text("这段时间的作品",pad,y,25,"#20222e",600);y+=31;text("按累计播放排列",pad,y,15,"#667085");y+=28;
 if(!model.highlights.length){text("这个时间段还没有发布作品",pad,y+29,21,"#667085");y+=78;}
 for(const [index,work] of model.highlights.entries()){
  box(pad,y,636,160,"#ffffff");text(String(index+1).padStart(2,"0"),pad+18,y+39,24,"#7953ff",650);
  wrap(work.title,pad+65,y+37,549,22,31,2,"#20222e",600);
  text(`播放 ${displayNumber(work.views)}  ·  带来关注 ${displayNumber(work.followers)}`,pad+65,y+127,19,"#667085");y+=178;
 }
 y+=10;wrap("互动包括点赞、评论、分享和收藏；仅汇总已有数据。",pad,y,636,14,23,2,"#667085");y+=31;
 text("关注来自作品数据，不代表账号净增粉丝。",pad,y,14,"#667085");y+=44;
 box(pad,y,636,1,"#e6e8f0");y+=49;
 text("记录创作，也记录每一步成长。",pad,y,23,"#20222e",600);y+=39;
 text("CreatorOS 创作者工作台",pad,y,18,"#667085");y+=31;text("扫码了解产品",pad,y,18);y+=28;text(PURCHASE_URL,pad,y,15,"#667085");
 const top=y-111,left=556,scale=4;box(left-16,top-16,148,148,"#ffffff");for(const [x,qy]of PURCHASE_QR)box(left+x*scale,top+qy*scale,scale,scale,"#7953ff");
 y+=58;text("所选期间发布作品的累计表现 · 北京时间",pad,y,14,"#667085");y+=24;
 text(`数据读取于 ${beijingTime(model.generatedAt)}`,pad,y,14,"#667085");y+=32;
 canvas.width=width*3;canvas.height=y*3;c.scale(3,3);c.fillStyle="#f8f9fc";c.fillRect(0,0,width,y);commands.forEach(draw=>draw());return canvas;
}
export function downloadReportBlob(blob:Blob,filename:string){const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);}
export async function exportDailyReport(report:DailyReport,options:ReportShareOptions={}){const canvas=await renderDailyReportCanvas(report,options);const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error("图片生成失败")),"image/png"));downloadReportBlob(blob,`CreatorOS-创作成绩-${reportFileDate(report)}.png`);}
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
