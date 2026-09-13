import {reportPeriodLabel,reportFileDate} from "./report-period";
import {beijingTime,overviewMetrics,retention,displayRate,type DailyReport,type DailyReportAnalysis} from "./report-metrics";
import {PURCHASE_QR,PURCHASE_URL} from "./purchase-qr";
export type ReportShareOptions={analysis?:DailyReportAnalysis|null;rawAnalysis?:string|null;selectedPublicationId?:string;sourceGeneratedAt?:string|null;stale?:boolean};
/** 页面分享预览和 PNG 共用此绘制入口，内容都来自当前报告及真实分析。 */
export async function renderDailyReportCanvas(report:DailyReport,options:ReportShareOptions={}){
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
 const work=report.works.find(w=>w.publicationId===options.selectedPublicationId)??report.works[0],analysis=options.analysis;
 let y=62;text("CreatorOS · 运营战报",pad,y,23,"#7953ff",600);y+=59;y+=wrap(reportPeriodLabel(report),pad,y,636,32,43,2,"#20222e",650);y+=6;
 y+=wrap(`${report.accountName??"当前账号"} · 发布 ${report.works.length} 条作品`,pad,y,636,21,30,2);y+=12;text("作品累计表现 · 北京时间",pad,y,16,"#667085");y+=48;
 const headline=analysis?.headline??(options.rawAnalysis?"运营分析已生成":"运营分析待生成");
 y+=wrap(headline,pad,y,636,31,46,4,"#20222e",650);y+=12;
 const summary=analysis?.summary??options.rawAnalysis??"已汇总真实作品与表现数据。生成分析后，建议会出现在这里。";
 y+=wrap(summary,pad,y,636,19,31,6,"#667085");y+=12;
 if(options.rawAnalysis&&!analysis){text("分析全文节选 · 完整内容请查看日报",pad,y,14,"#667085");y+=27;}
 if(options.sourceGeneratedAt){text(`分析依据：${beijingTime(options.sourceGeneratedAt)} 的数据${options.stale?" · 数据已有更新":""}`,pad,y,14,"#667085");y+=30;}
 const metrics=overviewMetrics(report,work);
 metrics.forEach((m,i)=>{const x=pad+(i%2)*328,top=y+Math.floor(i/2)*119;box(x,top,308,102,"#ffffff");text(m.label,x+16,top+29,17,"#667085");text(m.value,x+16,top+70,29,"#20222e",600);});y+=260;
 text("观众看到了哪里",pad,y,25,"#20222e",600);y+=39;
 y+=wrap(work?.title??"暂无可观察作品",pad,y,636,17,26,2,"#667085");y+=17;
 for(const row of retention(work)){text(row.label,pad,y,18);box(168,y-14,385,10,"#ebe5ff");if(row.value!==null)box(168,y-14,385*row.value/100,10,"#7953ff");text(displayRate(row.value),575,y,20,"#20222e",600);y+=47;}
 y+=21;
 const experiment=analysis?.experiments[0];
 if(experiment){y+=40;y+=wrap(experiment.title,pad+21,y,594,24,35,3,"#20222e",600);y+=10;y+=wrap(experiment.action,pad+21,y,594,20,32,6);y+=12;y+=wrap(`只改：${experiment.variable}\n观察：${experiment.metric}\n前置：${experiment.prerequisite}`,pad+21,y,594,16,26,6,"#667085");y+=20;}
 else {text("下一步行动",pad,y,25,"#20222e",600);y+=38;y+=wrap(options.rawAnalysis?"请在日报中查看完整分析。":"生成运营分析后，查看针对性的下一步建议。",pad,y,636,20,32,3,"#667085");y+=20;}
 y+=33;box(pad,y,636,1,"#e6e8f0");y+=52;
 text("让每一条内容，都有下一步。",pad,y,25,"#20222e",600);y+=43;text("CreatorOS 编导 / 运营智能体",pad,y,19,"#667085");y+=35;text("扫码了解产品",pad,y,18);y+=30;text(PURCHASE_URL,pad,y,16,"#667085");
 const top=y-111,left=556,scale=4;box(left-16,top-16,148,148,"#ffffff");for(const [x,qy]of PURCHASE_QR)box(left+x*scale,top+qy*scale,scale,scale,"#7953ff");
 y+=69;text(`数据读取于 ${beijingTime(report.generatedAt)}（北京时间）`,pad,y,14,"#667085");y+=32;
 canvas.width=width*3;canvas.height=y*3;c.scale(3,3);c.fillStyle="#f8f9fc";c.fillRect(0,0,width,y);commands.forEach(draw=>draw());return canvas;
}
export function downloadReportBlob(blob:Blob,filename:string){const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);}
export async function exportDailyReport(report:DailyReport,options:ReportShareOptions={}){const canvas=await renderDailyReportCanvas(report,options);const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error("图片生成失败")),"image/png"));downloadReportBlob(blob,`CreatorOS-运营日报-${reportFileDate(report)}.png`);}
export function exportDailyReportJson(report:DailyReport,options:ReportShareOptions={}){downloadReportBlob(new Blob([JSON.stringify({report,...options},null,2)],{type:"application/json;charset=utf-8"}),`CreatorOS-运营日报-${reportFileDate(report)}.json`);}
