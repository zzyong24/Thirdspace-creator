"use client";
import Link from "next/link";
export default function ErrorPage({reset}:{reset:()=>void}){return <main className="rounded-card border border-border bg-surface p-6"><h1 className="text-lg font-semibold">日报暂时无法读取</h1><p className="mt-2 text-sm text-muted-foreground">请检查所选日期，或稍后重试。已有作品数据不会受影响。</p><div className="mt-4 flex gap-4"><button onClick={reset} className="text-brand">重新读取</button><Link href="/daily-report" className="text-brand">查看昨天</Link><Link href="/" className="text-muted-foreground">返回首页</Link></div></main>;}
