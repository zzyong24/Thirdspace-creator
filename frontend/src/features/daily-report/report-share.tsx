"use client";
import * as React from "react";
import {renderDailyReportCanvas,exportDailyReport,type ReportShareOptions} from "./report-export";
import type {DailyReport} from "./report-metrics";
import styles from "./daily-report.module.css";
export function ReportShare({report,options}:{report:DailyReport;options:ReportShareOptions}){
 const [src,setSrc]=React.useState<string|null>(null),[error,setError]=React.useState<string|null>(null),[busy,setBusy]=React.useState(false);
 const {analysis,rawAnalysis,selectedPublicationId,sourceGeneratedAt,stale}=options;
 React.useEffect(()=>{let active=true,url:string|undefined;setSrc(null);setError(null);
  void renderDailyReportCanvas(report,{analysis,rawAnalysis,selectedPublicationId,sourceGeneratedAt,stale}).then(canvas=>new Promise<Blob>((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error("图片生成失败")),"image/png"))).then(blob=>{if(!active)return;url=URL.createObjectURL(blob);setSrc(url);}).catch(e=>{if(active)setError(e instanceof Error?e.message:"预览生成失败");});
  return()=>{active=false;if(url)URL.revokeObjectURL(url);};
 },[report,analysis,rawAnalysis,selectedPublicationId,sourceGeneratedAt,stale]);
 return <div className={styles.share}><div>{src?<img className={styles.poster} src={src} alt={`${report.date} 运营战报：真实指标、留存、运营建议和产品二维码`}/>:<div role="status" className={styles.panel}>{error??"正在生成战报预览…"}</div>}</div><div className={styles.shareActions}><div><h2>分享战报</h2><p className={styles.muted}>保存为图片，直接分享。</p></div><button className={`${styles.button} ${styles.primary}`} disabled={busy} onClick={async()=>{setBusy(true);setError(null);try{await exportDailyReport(report,options);}catch(e){setError(e instanceof Error?e.message:"导出失败，请重试");}finally{setBusy(false);}}}>{busy?"正在生成图片…":"保存战报图片"}</button>{error&&<p role="alert" className={styles.error}>{error}</p>}</div></div>;
}
