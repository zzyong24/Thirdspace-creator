"use client";
import * as React from "react";
import Link from "next/link";
import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from "@/components/ui/select";
import {useRouter} from "next/navigation";
import {ReportDateRange} from "./report-date-range";
import {reportPeriod,reportPeriodLabel} from "./report-period";
import {beijingTime,overviewMetrics,type DailyReport} from "./report-metrics";
import {exportDailyReportCsv} from "./report-export";
import {useDailyReportAnalysis} from "./use-daily-report-analysis";
import {ReportCoverage,ReportDirections,ReportExperiments,ReportPositioning,ReportPeriodWorks,ReportRetention,ReportWorks} from "./report-details";
import {ReportShare} from "./report-share";
import {reportUserText,userFacingAnalysis} from "./report-language";
import {ReportNativeComparisons} from "./report-native-comparisons";
import styles from "./daily-report.module.css";
export function DailyReportPage({report}:{report:DailyReport}){
 const router=useRouter(),[changing,startTransition]=React.useTransition();
 const period=reportPeriod(report),single=period.startDate===period.endDate;
 const originalState=useDailyReportAnalysis(report);
 const state={...originalState,analysis:userFacingAnalysis(originalState.analysis,report),rawAnalysis:originalState.rawAnalysis?reportUserText(originalState.rawAnalysis,report):null};
 const [tab,setTab]=React.useState<"daily"|"share">("daily"),[selectedId,setSelectedId]=React.useState(report.works[0]?.publicationId),[error,setError]=React.useState<string|null>(null);
 const selectedWork=report.works.find(work=>work.publicationId===selectedId)??report.works[0];
 async function act(action:()=>void|Promise<void>){setError(null);try{await action();}catch(e){setError(e instanceof Error?e.message:"操作未完成，请重试");}}
 const running=state.status==="running",hasAnalysis=Boolean(state.analysis||state.rawAnalysis);
 // SEMANTIC_BOUNDARY_ALLOW: 仅按文本长度折叠旧版长内容，完整保留原文，不作语义改写。
 const longHeadline=Boolean(state.analysis&&Array.from(state.analysis.headline).length>55);
 const actions=<div className={styles.actions}>{running?<><span role="status" className={styles.muted}>正在分析，数据仍可查看</span><button className={styles.button} onClick={()=>void act(state.cancel)}>停止分析</button><button className={styles.button} onClick={()=>void act(state.refresh)}>刷新状态</button></>:<button className={`${styles.button} ${styles.primary}`} disabled={state.status==="loading"||!report.works.length} onClick={()=>void act(state.start)}>{state.status==="loading"?"读取分析状态…":hasAnalysis?"重新分析":"生成运营分析"}</button>}{state.status==="failed"&&<button className={styles.button} onClick={()=>void act(state.refresh)}>刷新状态</button>}</div>;
 return <main data-page="daily-report" className={styles.page}>
  <header className={styles.header}><div><h1>运营分析</h1><p className={styles.subtitle}>{report.accountName??"当前账号"} · {reportPeriodLabel(report)} · 北京时间 · 所选期间发布作品的累计表现</p></div><div className={styles.actions}><button className={styles.button} onClick={()=>void act(async()=>{await exportDailyReportCsv(report);})}>导出数据</button></div></header>
  <ReportDateRange value={period} disabled={changing} onChange={range=>startTransition(()=>{const query=new URLSearchParams(window.location.search);query.delete("date");query.delete("startDate");query.delete("endDate");if(range.startDate===range.endDate)query.set("date",range.startDate);else{query.set("startDate",range.startDate);query.set("endDate",range.endDate);}router.push(`/daily-report?${query}`,{scroll:false});})}/>
  {changing&&<p role="status" className={styles.muted}>正在读取所选期间…</p>}
  <div className={styles.tabs} role="tablist" aria-label="运营分析视图"><button id="daily-tab" role="tab" aria-controls="daily-panel" aria-selected={tab==="daily"} className={styles.tab} onClick={()=>setTab("daily")}>运营复盘</button><button id="share-tab" role="tab" aria-controls="share-panel" aria-selected={tab==="share"} className={styles.tab} onClick={()=>setTab("share")}>分享战报</button></div>
  {(error||state.error)&&<p role="alert" className={styles.error}>{error||state.error}</p>}
  {report.warnings.map(w=><p key={w} role="status" className={styles.muted}>{w}</p>)}
  {!report.accountId&&!report.groupId?<section className={styles.panel}><h2>先选择一个账号</h2><Link href="/settings?highlight=accounts" className={styles.button}>绑定或选择账号后查看运营分析</Link></section>:tab==="share"?<div id="share-panel" role="tabpanel" aria-labelledby="share-tab"><ReportShare report={report}/></div>:<div id="daily-panel" role="tabpanel" aria-labelledby="daily-tab" className={styles.content}>
   <section className={styles.hero}><div><div className={styles.eyebrow}>{single?"今日建议":"本期建议"}</div><h2 className={styles.headline}>{longHeadline?"本期运营建议":state.analysis?.headline??(hasAnalysis?"运营分析已生成":"先看清数据，再决定下一步。")}</h2>{longHeadline&&state.analysis?<details className={styles.explanation}><summary>查看此前分析，或重新生成简明建议</summary><p>{state.analysis.headline}</p>{state.analysis.summary&&<p>{state.analysis.summary}</p>}</details>:state.analysis?.summary?(state.analysis.summary.length>160?<details className={styles.explanation}><summary>查看分析说明</summary><p>{state.analysis.summary}</p></details>:<p className={styles.summary}>{state.analysis.summary}</p>):<p className={styles.summary}>{state.rawAnalysis?"分析已生成，可展开查看完整建议。":"真实作品和表现已汇总。生成运营分析，结合定位、稿件与流量来源，找到下一条值得验证的方向。"}</p>}{actions}{state.sourceGeneratedAt&&<p className={styles.muted}>分析依据：{beijingTime(state.sourceGeneratedAt)} 的数据{state.stale?" · 数据已更新，可重新分析":""}</p>}</div><div className={styles.issue}><strong>{String(report.works.length).padStart(2,"0")}</strong><span>条已发布作品</span><span>累计表现</span></div></section>
   {!report.works.length?<section className={styles.panel}><h2>所选期间暂无已发布作品</h2><p className={styles.empty}>可以选择其他日期。若刚发布，等待作品自动同步后再查看。</p><Link href="/automations" className={styles.button}>查看同步任务 →</Link></section>:<>
   <ReportNativeComparisons report={report}/>
   <section aria-label="作品概览" className={styles.metrics}>{overviewMetrics(report,selectedWork).map(m=><div className={styles.metric} key={m.label}><label>{m.label}</label><b>{m.value}</b><small title={m.note}>{m.note}</small></div>)}</section>
   <div className={styles.grid}><section className={styles.panel}><div className={styles.sectionHead}><h2>观众看到了哪里</h2><span className={styles.tag}>所选作品留存</span></div><label htmlFor="retention-work" className={styles.muted}>观察作品</label><Select value={selectedWork?.publicationId??""} onValueChange={setSelectedId}><SelectTrigger id="retention-work" className="mt-2 w-full min-w-0" aria-label="观察作品"><SelectValue placeholder="选择周期内作品"/></SelectTrigger><SelectContent position="popper" className="max-w-[min(36rem,calc(100vw-3rem))]">{report.works.map(w=><SelectItem key={w.publicationId} value={w.publicationId}><span className="line-clamp-2 break-words whitespace-normal" title={w.title}>{w.title}</span></SelectItem>)}</SelectContent></Select><ReportRetention work={selectedWork}/></section><ReportCoverage report={report} work={selectedWork}/></div>
   </>}
   {state.rawAnalysis&&!state.analysis&&<section className={styles.panel}><div className={styles.sectionHead}><h2>运营分析</h2></div><details className={styles.explanation}><summary>查看完整建议</summary><p className={styles.raw}>{state.rawAnalysis}</p></details></section>}
   {!single&&<ReportDirections analysis={state.analysis} rawAnalysisAvailable={Boolean(state.rawAnalysis)}/>}
   <ReportPositioning report={report} analysis={state.analysis} rawAnalysisAvailable={Boolean(state.rawAnalysis)}/>
   <ReportWorks report={report} analysis={state.analysis} rawAnalysisAvailable={Boolean(state.rawAnalysis)}/>
   <ReportPeriodWorks report={report}/>
   <ReportExperiments analysis={state.analysis} rawAnalysisAvailable={Boolean(state.rawAnalysis)}/>
  </div>}
  <footer className={styles.footer}><span>CreatorOS</span><span>数据读取于 {beijingTime(report.generatedAt)}（北京时间） · 指标以各作品采集时刻为准</span></footer>
 </main>;
}
