"use client";
import * as React from "react";
import Image from "next/image";
import {beginForegroundActivity} from "@/lib/foreground-activity";
import {exportDailyReport,type ReportShareOptions} from "./report-export";
import {drawSharePoster,posterCount} from './share-poster';
import {reportScope} from "./analysis-protocol";
import {reportPeriodLabel} from "./report-period";
import type {DailyReport} from "./report-metrics";
import styles from "./daily-report.module.css";
type Preview={report:DailyReport;page:number;url:string|null;width:number;height:number;error:string|null};
export function ReportShare({report}:{report:DailyReport;options?:ReportShareOptions}){
 const [preview,setPreview]=React.useState<Preview|null>(null),[actionError,setActionError]=React.useState<{report:DailyReport;message:string}|null>(null),[busy,setBusy]=React.useState(false),[pagination,setPagination]=React.useState({scope:reportScope(report),page:0});
 const alive=React.useRef(false),inFlight=React.useRef(false);
 const scope=reportScope(report),count=posterCount(report),selectedPage=Math.min(pagination.scope===scope?pagination.page:0,count-1),current=preview?.report===report&&preview.page===selectedPage?preview:null,src=current?.url??null,error=actionError?.report===report?actionError.message:current?.error;
 React.useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 React.useEffect(()=>{let active=true,url:string|undefined;
  void drawSharePoster(report,selectedPage).then(canvas=>new Promise<{blob:Blob;width:number;height:number}>((resolve,reject)=>{const width=canvas.width,height=canvas.height;canvas.toBlob(blob=>{canvas.width=0;canvas.height=0;if(blob)resolve({blob,width,height});else reject(Error("图片生成失败"));},"image/png");})).then(result=>{if(!active)return;url=URL.createObjectURL(result.blob);setPreview({report,page:selectedPage,url,width:result.width,height:result.height,error:null});}).catch(e=>{if(active)setPreview({report,page:selectedPage,url:null,width:0,height:0,error:e instanceof Error?e.message:"预览生成失败"});});
  return()=>{active=false;if(url)URL.revokeObjectURL(url);};
 },[report,selectedPage]);
 async function save(){if(inFlight.current)return;inFlight.current=true;setBusy(true);setActionError(null);const finish=beginForegroundActivity("正在导出创作战报");try{await exportDailyReport(report);}catch(e){if(alive.current)setActionError({report,message:e instanceof Error?e.message:"导出失败，请重试"});}finally{finish();inFlight.current=false;if(alive.current)setBusy(false);}}
 return <section className={styles.share} aria-label="分享战报预览">
  <div className={styles.shareActions}><div><h2>分享战报</h2><p className={styles.muted}>把这段时间的创作成绩分享给更多人。</p></div><button className={`${styles.button} ${styles.primary}`} disabled={busy||!src} onClick={()=>void save()}>{busy?"正在生成图片…":count>1?`保存全部 ${count} 张战报`:"保存战报图片"}</button></div>
  {count>1&&<div className={styles.actions} aria-label="战报分页"><button className={styles.button} disabled={selectedPage===0} onClick={()=>setPagination({scope,page:selectedPage-1})}>上一张</button><span>第 {selectedPage+1} / {count} 张 · 共 {report.works.length} 条作品</span><small className={styles.muted}>保存为 ZIP，内含全部 PNG 图片</small><button className={styles.button} disabled={selectedPage===count-1} onClick={()=>setPagination({scope,page:selectedPage+1})}>下一张</button></div>}
  {error&&<p role="alert" className={styles.error}>{error}</p>}
  {src&&current?<Image unoptimized width={current.width} height={current.height} className={styles.poster} src={src} alt={`${report.accountName??'当前账号'}，${reportPeriodLabel(report)} 创作成绩；视频播放与文章阅读分开比较，第${selectedPage+1}张`}/>:<div role="status" className={styles.panel}>{error??"正在生成战报预览…"}</div>}
 </section>;
}
