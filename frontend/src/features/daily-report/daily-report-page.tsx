"use client";
import * as React from "react";
import Link from "next/link";
import {useRouter} from "next/navigation";
import {ReportDateRange} from "./report-date-range";
import {reportPeriod,reportPeriodLabel} from "./report-period";
import {beijingTime,overviewMetrics,type DailyReport} from "./report-metrics";
import {exportDailyReport,exportDailyReportJson} from "./report-export";
import {useDailyReportAnalysis} from "./use-daily-report-analysis";
import {ReportCoverage,ReportExperiments,ReportPositioning,ReportRecentWorks,ReportRetention,ReportWorks} from "./report-details";
import {ReportShare} from "./report-share";
import styles from "./daily-report.module.css";
export function DailyReportPage({report}:{report:DailyReport}){
 const router=useRouter(),[changing,startTransition]=React.useTransition();
 const period=reportPeriod(report),single=period.startDate===period.endDate;
 const state=useDailyReportAnalysis(report);
 const [tab,setTab]=React.useState<"daily"|"share">("daily"),[selectedId,setSelectedId]=React.useState(report.works[0]?.publicationId),[busy,setBusy]=React.useState(false),[error,setError]=React.useState<string|null>(null);
 const selectedWork=report.works.find(work=>work.publicationId===selectedId)??report.works[0];
 const options={analysis:state.analysis,rawAnalysis:state.rawAnalysis,selectedPublicationId:selectedWork?.publicationId,sourceGeneratedAt:state.sourceGeneratedAt,stale:state.stale};
 async function act(action:()=>void|Promise<void>){setError(null);try{await action();}catch(e){setError(e instanceof Error?e.message:"操作未完成，请重试");}}
 async function saveImage(){setBusy(true);try{await act(()=>exportDailyReport(report,options));}finally{setBusy(false);}}
 const running=state.status==="running",hasAnalysis=Boolean(state.analysis||state.rawAnalysis);
 const actions=<div className={styles.actions}>{running?<><span role="status" className={styles.muted}>正在分析，数据仍可查看</span><button className={styles.button} onClick={()=>void act(state.cancel)}>停止分析</button><button className={styles.button} onClick={()=>void act(state.refresh)}>刷新状态</button></>:<button className={`${styles.button} ${styles.primary}`} disabled={state.status==="loading"||!report.works.length} onClick={()=>void act(state.start)}>{state.status==="loading"?"读取分析状态…":hasAnalysis?"重新分析":"生成运营分析"}</button>}{state.status==="failed"&&<button className={styles.button} onClick={()=>void act(state.refresh)}>刷新状态</button>}</div>;
 return <main data-page="daily-report" className={styles.page}>
  <header className={styles.header}><div><Link href="/" className={styles.muted}>首页 /</Link><h1>运营日报</h1><p className={styles.subtitle}>{report.accountName??"当前账号"} · {reportPeriodLabel(report)} · 北京时间 · 所选期间发布作品的累计表现</p></div><div className={styles.actions}><button className={styles.button} onClick={()=>void act(()=>exportDailyReportJson(report,options))}>导出数据</button><button disabled={busy} className={`${styles.button} ${styles.primary}`} onClick={()=>void saveImage()}>{busy?"正在生成图片…":"保存战报图片"}</button></div></header>
  <ReportDateRange value={period} disabled={changing} onChange={range=>startTransition(()=>{const query=new URLSearchParams(range.startDate===range.endDate?{date:range.startDate}:range);router.push(`/daily-report?${query}`,{scroll:false});})}/>
  {changing&&<p role="status" className={styles.muted}>正在读取所选期间…</p>}
  <div className={styles.tabs} role="tablist" aria-label="日报视图"><button id="daily-tab" role="tab" aria-controls="daily-panel" aria-selected={tab==="daily"} className={styles.tab} onClick={()=>setTab("daily")}>运营复盘</button><button id="share-tab" role="tab" aria-controls="share-panel" aria-selected={tab==="share"} className={styles.tab} onClick={()=>setTab("share")}>分享战报</button></div>
  {(error||state.error)&&<p role="alert" className={styles.error}>{error||state.error}</p>}
  {report.warnings.map(w=><p key={w} role="status" className={styles.muted}>{w}</p>)}
  {!report.accountId?<section className={styles.panel}><h2>先选择一个账号</h2><Link href="/settings?highlight=accounts" className={styles.button}>绑定或选择账号后查看运营日报</Link></section>:tab==="share"?<div id="share-panel" role="tabpanel" aria-labelledby="share-tab"><ReportShare report={report} options={options}/></div>:<div id="daily-panel" role="tabpanel" aria-labelledby="daily-tab" className={styles.content}>
   <section className={styles.hero}><div><div className={styles.eyebrow}>{single?"今日建议":"本期建议"}</div><h2>{state.analysis?.headline??(hasAnalysis?"运营分析已生成":"先看清数据，再决定下一步。")}</h2><p>{state.analysis?.summary??(state.rawAnalysis?"分析已生成，暂未拆分成卡片。完整内容见下方。":"真实作品和表现已汇总。生成运营分析，结合定位、稿件与流量来源，找到下一条值得验证的方向。")}</p>{actions}{state.sourceGeneratedAt&&<p className={styles.muted}>分析依据：{beijingTime(state.sourceGeneratedAt)} 的数据{state.stale?" · 数据已更新，可重新分析":""}</p>}</div><div className={styles.issue}><strong>{String(report.works.length).padStart(2,"0")}</strong><span>条已发布作品</span><span>累计表现</span></div></section>
   {!report.works.length?<section className={styles.panel}><h2>所选期间暂无已发布作品</h2><p className={styles.empty}>可以选择其他日期。若刚发布，等待作品自动同步后再查看。</p><Link href="/automations" className={styles.button}>查看同步任务 →</Link></section>:<>
   <section aria-label="作品概览" className={styles.metrics}>{overviewMetrics(report,selectedWork).map(m=><div className={styles.metric} key={m.label}><label>{m.label}</label><b>{m.value}</b><small title={m.note}>{m.note}</small></div>)}</section>
   <div className={styles.grid}><section className={styles.panel}><div className={styles.sectionHead}><h2>观众看到了哪里</h2><span className={styles.tag}>所选作品留存</span></div><label htmlFor="retention-work" className={styles.muted}>观察作品</label><select id="retention-work" className={`${styles.select} mt-2 w-full`} value={selectedWork?.publicationId??""} onChange={e=>setSelectedId(e.target.value)}>{report.works.map(w=><option key={w.publicationId} value={w.publicationId}>{w.title}</option>)}</select><ReportRetention work={selectedWork}/></section><ReportCoverage report={report} work={selectedWork}/></div>
   </>}
   {state.rawAnalysis&&!state.analysis&&<section className={styles.panel}><div className={styles.sectionHead}><h2>运营分析</h2><span className={styles.muted}>暂未拆分成卡片</span></div><p className={styles.raw}>{state.rawAnalysis}</p></section>}
   <ReportPositioning report={report} analysis={state.analysis} rawAnalysisAvailable={Boolean(state.rawAnalysis)}/>
   <ReportWorks report={report} analysis={state.analysis} rawAnalysisAvailable={Boolean(state.rawAnalysis)}/>
   <ReportRecentWorks report={report}/>
   <ReportExperiments analysis={state.analysis} rawAnalysisAvailable={Boolean(state.rawAnalysis)}/>
  </div>}
  <footer className={styles.footer}><span>CreatorOS</span><span>数据读取于 {beijingTime(report.generatedAt)}（北京时间） · 指标以各作品采集时刻为准</span></footer>
 </main>;
}
