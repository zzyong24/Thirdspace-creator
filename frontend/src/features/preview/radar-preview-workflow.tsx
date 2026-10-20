"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, BookOpen, FlaskConical } from "lucide-react";
import styles from "./radar-preview-workflow.module.css";

type SampleWork = {
  readonly id: string;
  readonly title: string;
  readonly type: string;
  readonly summary: string;
  readonly transcript: string;
  readonly idea: string;
  readonly href: string;
};

const STEPS = ["来源与采集", "挑选内容", "阅读核对", "改写创作"] as const;

function StepHeading({ step }: { readonly step: number }) {
  return <h2 className={styles.stepHeading}><span>{String(step).padStart(2, "0")}</span>{STEPS[step - 1]}</h2>;
}

export function RadarPreviewWorkflow({ works, sources }: {
  readonly works: readonly SampleWork[];
  readonly sources?: React.ReactNode;
}) {
  const id = React.useId();
  const [selected, setSelected] = React.useState(works[0]?.id);
  const [filter, setFilter] = React.useState("全部");
  const [view, setView] = React.useState("摘要");
  const [sourcesMounted, setSourcesMounted] = React.useState(false);
  const rows = works.filter(work => filter === "全部" || work.type === filter);
  const work = rows.find(row => row.id === selected) ?? rows[0];

  return <section className={styles.workflow} aria-label="内容发现 · 模拟预览" data-preview-simulated="true">
    <header className={styles.header}>
      <span className={styles.simulated}><FlaskConical size={15} aria-hidden="true"/>模拟内容</span>
      <nav aria-label="内容雷达操作步骤"><ol>{STEPS.map((step, index) => <li key={step}><a href={`#${id}-${index + 1}`}><span>{String(index + 1).padStart(2, "0")}</span>{step}</a></li>)}</ol></nav>
    </header>

    <section id={`${id}-1`} className={styles.sources} aria-label="来源与采集">
      <div className={styles.sourceSummary}><StepHeading step={1}/><p>{works.length} 条本地样例 <span>· 未执行采集</span></p></div>
      {sources ? <details className={styles.sourceConfig} onToggle={event => { if (event.currentTarget.open) setSourcesMounted(true); }}>
        <summary>管理真实来源</summary>
        {sourcesMounted ? <div className={styles.realSources} data-slot="preview-real-data">{sources}</div> : null}
      </details> : null}
    </section>

    <div className={styles.columns}>
      <section id={`${id}-2`} className={styles.pick} aria-label="挑选内容">
        <div className={styles.panelHeading}><StepHeading step={2}/><span>{rows.length} 条</span></div>
        <div className={styles.filters} role="group" aria-label="模拟内容筛选">{["全部", "视频", "文章", "图文"].map(label => <button type="button" key={label} aria-pressed={filter === label} onClick={() => setFilter(label)}>{label}</button>)}</div>
        <div className={styles.list} role="group" aria-label="模拟作品列表">{rows.map(row => <button type="button" key={row.id} aria-pressed={work?.id === row.id} onClick={() => setSelected(row.id)} className={styles.row}>
          <span className={styles.rowType}>{row.type}<ArrowRight size={15} aria-hidden="true"/></span><strong>{row.title}</strong><span>{row.summary}</span>
        </button>)}</div>
      </section>

      <section id={`${id}-3`} className={styles.read} aria-label="阅读核对">
        <div className={styles.panelHeading}><StepHeading step={3}/><BookOpen size={17} aria-hidden="true"/></div>
        {work ? <article aria-label="模拟作品详情" className={styles.article}>
          <span className={styles.eyebrow}>{work.type} · 本地样例</span><h3>{work.title}</h3>
          <div className={styles.tabs} role="group" aria-label="模拟详情内容">{["摘要", "逐字稿"].map(tab => <button type="button" key={tab} aria-pressed={view === tab} onClick={() => setView(tab)}>{tab}</button>)}</div>
          <p className={styles.copy}>{view === "摘要" ? work.summary : work.transcript}</p>
          <div className={styles.evidence}><strong>来源说明</strong><p>本地模拟正文，无外部来源快照。</p></div>
        </article> : <p className={styles.empty}>当前类型没有内容</p>}
      </section>

      <section id={`${id}-4`} className={styles.create} aria-label="改写创作">
        <div className={styles.panelHeading}><StepHeading step={4}/></div>
        {work ? <div className={styles.createBody}>
          <span className={styles.eyebrow}>改编思路 · 模拟</span><p>{work.idea}</p>
          <div className={styles.destination}><span>当前作品</span><strong>{work.title}</strong><small>{work.type}</small></div>
          <Link className={styles.open} href={work.href}>打开模拟作品 <ArrowRight size={16} aria-hidden="true"/></Link>
          <p className={styles.note}>查看已有样例，不触发 AI 生成。</p>
        </div> : null}
      </section>
    </div>
    <footer className={styles.footer}><details><summary>模拟说明</summary><p>数据与情境为本地模拟，未执行采集、AI 生成或发布。</p></details><Link href="/preview">预览导航 <ArrowRight size={15} aria-hidden="true"/></Link></footer>
  </section>;
}
