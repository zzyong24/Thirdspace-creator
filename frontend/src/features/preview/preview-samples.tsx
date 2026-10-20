"use client";
import * as React from "react";
import Link from "next/link";
import {ArrowRight,FlaskConical} from "lucide-react";
import styles from "./preview-samples.module.css";
import { RadarPreviewWorkflow } from "./radar-preview-workflow";

export type PreviewKind="radar"|"analytics"|"publishing"|"platform";
const WORKS=[
 {id:"plan",title:"一周创作计划：从灵感到初稿",type:"视频",status:"待排期",views:12840,likes:426,comments:38,rate:68,summary:"从一个具体问题开始，把零散灵感整理成一份可执行的创作计划。",transcript:"你有没有保存很多灵感，却一直没有完成初稿？今天先选一个你最熟悉的问题。写下受众、一个场景和下一步动作。",idea:"保留问题切入与三步结构，换成你自己的经历和例子。",href:"/projects/project-e50804d8-1725"},
 {id:"notes",title:"让知识库真正参与一次创作",type:"文章",status:"待确认",views:4860,likes:208,comments:24,rate:74,summary:"把资料出处、自己的理解和可回答的问题分开记录。",transcript:"收藏前，先写一句为什么保存它。创作时，找到一份相关资料并核对原始出处，再补充你自己的理解。",idea:"做成一篇完整文章，或拆成三张各有重点的图卡。",href:"/projects/project-e50804d8-1749/article?outputId=output-e50804d8-1760"},
 {id:"review",title:"复盘时，给下一次留一个问题",type:"图文",status:"已发布（模拟）",views:7240,likes:312,comments:19,rate:61,summary:"把复盘从数字记录变成一个可以验证的小实验。",transcript:"记录你原本想回应的问题、实际得到的反馈，以及下一次只改变的一件事。这里的情境和数据全部为本地模拟。",idea:"把方法拆成“目标 / 反馈 / 实验”，对应三张图文。",href:"/projects/project-e50804d8-1749/outputs/output-e50804d8-1833/image"},
] as const;
const TITLES:Record<PreviewKind,string>={radar:"内容发现",analytics:"表现概览",publishing:"分发队列",platform:"作品概览"};
export function PreviewSamples({kind,radarSources}:{readonly kind:PreviewKind;readonly radarSources?:React.ReactNode}) {
 return kind === "radar" ? <RadarPreviewWorkflow works={WORKS} sources={radarSources}/> : <ContentPreviewSamples kind={kind}/>;
}
function ContentPreviewSamples({kind}:{readonly kind:PreviewKind}) {
 const [selected,setSelected]=React.useState<string>(WORKS[0].id);
 const [view,setView]=React.useState("摘要");
 const [filter,setFilter]=React.useState("全部");
 const rows=WORKS.filter(w=>filter==="全部"||w.type===filter||w.status===filter);
 const work=rows.find(w=>w.id===selected)??rows[0]??WORKS[0];
 const title=TITLES[kind];
 const filters=kind==="publishing"?["全部","待排期","待确认","已发布（模拟）"]:["全部","视频","文章","图文"];
 return <section className={styles.samples} data-preview-simulated="true" aria-label={`${title} · 模拟预览`}>
  <header className={styles.header}><div><span className={styles.label}><FlaskConical size={15} aria-hidden="true"/>模拟内容</span><h2>{title}</h2></div><Link href="/preview" className={styles.catalog}>预览导航 <ArrowRight size={15} aria-hidden="true"/></Link></header>
  <div className={styles.filters} role="group" aria-label="模拟内容筛选">{filters.map(label=><button type="button" key={label} aria-pressed={filter===label} onClick={()=>setFilter(label)}>{label}</button>)}</div>
  <div className={styles.body}>
   <div className={styles.list} role="group" aria-label="模拟作品列表">{rows.map((row,index)=><button type="button" key={row.id} aria-pressed={work.id===row.id} onClick={()=>setSelected(row.id)} className={styles.row}><span className={styles.index}>{String(index+1).padStart(2,"0")}</span><span><small>{row.type}{kind==="publishing"?` · ${row.status}`:""}</small><strong>{row.title}</strong><span>{row.summary}</span></span><ArrowRight size={16} aria-hidden="true"/></button>)}</div>
   <article className={styles.detail} aria-label="模拟作品详情"><span className={styles.eyebrow}>{work.type}</span><h3>{work.title}</h3>
    {kind==="analytics"||kind==="platform"?<><div className={styles.metrics}>{[{label:work.type==="文章"?"阅读（模拟）":"播放（模拟）",value:work.views.toLocaleString("zh-CN")},{label:"点赞（模拟）",value:work.likes},{label:"评论（模拟）",value:work.comments}].map(m=><div key={m.label}><span>{m.label}</span><strong>{m.value}</strong></div>)}</div><div className={styles.chart} aria-label="模拟表现趋势"><div className={styles.bars} role="img" aria-label={`模拟趋势指数：32、48、39、62、54、80、${work.rate}`}>{[32,48,39,62,54,80,work.rate].map((v,i)=><div key={i}><span style={{height:`${v}%`}} title={`第 ${i+1} 天：模拟指数 ${v}`}/><small>{i+1}日</small></div>)}</div><p>7 天模拟趋势</p></div></>:<><div className={styles.tabs} role="group" aria-label="模拟详情内容">{["摘要","逐字稿","改编思路"].map(tab=><button type="button" key={tab} aria-pressed={view===tab} onClick={()=>setView(tab)}>{tab}</button>)}</div><p className={styles.copy}>{view==="摘要"?work.summary:view==="逐字稿"?work.transcript:work.idea}</p></>}
    <Link className={styles.open} href={work.href}>打开模拟作品 <ArrowRight size={16} aria-hidden="true"/></Link>
    <details className={styles.disclaimer}><summary>模拟说明</summary><p>数据与情境为本地模拟，未执行采集、AI 生成或发布。</p></details>
   </article>
  </div>
 </section>;
}

export function PreviewRecentPublications(){return <section className={styles.recent} data-preview-simulated="true" aria-label="模拟发布示例"><span className={styles.label}><FlaskConical size={15} aria-hidden="true"/>模拟作品 · 未发布</span><h2>最近作品</h2><ul>{WORKS.map(work=><li key={work.id}><Link href={work.href}><span><small>{work.type}</small><strong>{work.title}</strong></span><ArrowRight size={16} aria-hidden="true"/></Link></li>)}</ul><Link href="/publishing" className={styles.catalog}>模拟分发队列 <ArrowRight size={15} aria-hidden="true"/></Link></section>;}
