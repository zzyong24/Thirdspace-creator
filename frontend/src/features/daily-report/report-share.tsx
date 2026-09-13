"use client";
import * as React from "react";
import {exportDailyReport,type ReportShareOptions} from "./report-export";
import {drawSharePoster,posterCount} from './share-poster';
import {reportPeriodLabel} from "./report-period";
import type {DailyReport} from "./report-metrics";
import styles from "./daily-report.module.css";
export function ReportShare({report}:{report:DailyReport;options?:ReportShareOptions}){
 const [src,setSrc]=React.useState<string|null>(null),[error,setError]=React.useState<string|null>(null),[busy,setBusy]=React.useState(false),[page,setPage]=React.useState(0);
 const count=posterCount(report),selectedPage=Math.min(page,count-1);
 React.useEffect(()=>{let active=true,url:string|undefined;setSrc(null);setError(null);
  void drawSharePoster(report,selectedPage).then(canvas=>new Promise<Blob>((resolve,reject)=>canvas.toBlob(blob=>{canvas.width=0;canvas.height=0;blob?resolve(blob):reject(Error("图片生成失败"));},"image/png"))).then(blob=>{if(!active)return;url=URL.createObjectURL(blob);setSrc(url);}).catch(e=>{if(active)setError(e instanceof Error?e.message:"预览生成失败");});
  return()=>{active=false;if(url)URL.revokeObjectURL(url);};
 },[report,selectedPage]);
 return <section className={styles.share} aria-label="分享战报预览">
  <div className={styles.shareActions}><div><h2>分享战报</h2><p className={styles.muted}>把这段时间的创作成绩分享给更多人。</p></div><button className={`${styles.button} ${styles.primary}`} disabled={busy||!src} onClick={async()=>{setBusy(true);setError(null);try{await exportDailyReport(report);}catch(e){setError(e instanceof Error?e.message:"导出失败，请重试");}finally{setBusy(false);}}}>{busy?"正在生成图片…":count>1?`保存全部 ${count} 张战报`:"保存战报图片"}</button></div>
  {count>1&&<div className={styles.actions} aria-label="战报分页"><button className={styles.button} disabled={selectedPage===0} onClick={()=>setPage(selectedPage-1)}>上一张</button><span>第 {selectedPage+1} / {count} 张 · 共 {report.works.length} 条作品</span><button className={styles.button} disabled={selectedPage===count-1} onClick={()=>setPage(selectedPage+1)}>下一张</button><small className={styles.muted}>保存为 ZIP，内含全部 PNG 图片</small></div>}
  {error&&<p role="alert" className={styles.error}>{error}</p>}
  {src?<img className={styles.poster} src={src} alt={`${report.accountName??'当前账号'}，${reportPeriodLabel(report)} 创作成绩；播放量柱状图与作品带来关注折线图，第${selectedPage+1}张`}/>:<div role="status" className={styles.panel}>{error??"正在生成战报预览…"}</div>}
 </section>;
}
