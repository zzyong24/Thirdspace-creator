"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { recommendedWorkChoice } from "./project-output-home";

import { NewProjectForm, type NewProjectFormValues } from "./new-project-form";
import {useCreationScope,creationScopeKey} from "@/lib/creation-workspace-scope";
import { createBrowserProjectCreationSession } from "./project-creation";

/** 新建多形式作品后先进入原主脚本编辑台，扩写由各工作台显式发起。 */
export function QuickCreateWork({ accountPlatform, sourceItemId, sourceTitle, sourceType, sourceNotice }: {
  accountId?: string | null;
  accountPlatform?: string | null;
  sourceItemId?: string;
  sourceTitle?: string;
  sourceType?: "video" | "article" | "trend_signal";
  sourceNotice?: string;
}) {
  const router = useRouter();
  const [createdProject, setCreatedProject] = React.useState<{ id: string; title: string } | null>(null);
  const [createdWork, setCreatedWork] = React.useState<{href: string; title: string} | null>(null);
  const creation=React.useRef<ReturnType<typeof createBrowserProjectCreationSession>|null>(null),generation=React.useRef(0),alive=React.useRef(false);
  const scope=useCreationScope(),scopeKey=creationScopeKey(scope),sourceKey=JSON.stringify([sourceItemId??null,sourceType??null]);
  const dispose=React.useCallback(()=>{generation.current++;const old=creation.current;creation.current=null;old?.dispose();},[]);
  React.useEffect(()=>{alive.current=true;return()=>{alive.current=false;dispose();};},[scopeKey,sourceKey,dispose]);
  const session=()=>creation.current??(creation.current=createBrowserProjectCreationSession({sourceItemId,sourceType}));

  async function start(values: NewProjectFormValues) {
    const captured=session(),epoch=generation.current;
    const current=()=>{if(!alive.current||epoch!==generation.current||creation.current!==captured)return false;try{captured.assertCurrent();return true;}catch{return false;}};
    try {
      const result=await captured.create(values);
      if(!current())return;
      const project=result.project,destination=`/projects/${encodeURIComponent(project.id)}`;
      setCreatedProject(project);setCreatedWork({href:destination,title:project.title});
      // 导航前完成身份核对；成功替换时先释放原session。
      if(values.enterAfterCreate){dispose();router.push(destination);router.refresh();return;}
      captured.dispose();creation.current=null;generation.current++;router.refresh();
    } catch(error){if(current())throw error;}
    finally {if(current()){const snapshot=captured.snapshot();if(snapshot.project)setCreatedProject(snapshot.project);}}
  }

  return <main data-page="quick-create-work" data-studio-layout="creation" className="mx-auto w-full max-w-3xl space-y-6 p-5 md:p-8">
    <header><Link href="/projects" className="text-sm text-muted-foreground hover:text-foreground">← 返回项目</Link>
      <h1 className="mt-3 text-2xl font-semibold">这次想创作什么？</h1>
      <p className="mt-2 text-sm text-muted-foreground">填写主题，选择作品形式。</p></header>
    <section className="space-y-5 rounded-xl border border-border bg-surface p-5" aria-label="快速创作">
      {sourceTitle && <p className="rounded-md bg-primary/5 p-3 text-sm">来自内容雷达：{sourceTitle}。系统会核对原文或逐字稿；资料不足时仍可手写。</p>}
      {sourceNotice && <p className="rounded-md bg-warning/10 p-3 text-sm text-muted-foreground">{sourceNotice}</p>}
      <NewProjectForm key={`${scopeKey}:${sourceKey}`} includeWorkType submitLabel="开始创作"
        defaultValues={{name: sourceTitle ?? "", contentType: sourceType === "article" ? "article" : sourceType === "video" ? "video" : recommendedWorkChoice(accountPlatform)}}
        onCreate={start} onCancel={()=>{dispose();router.push("/projects");}} />
      {createdWork && <p role="status" className="text-sm">已创建作品：<Link href={createdWork.href} className="text-primary hover:underline">{createdWork.title} · 打开稿面</Link></p>}
      {createdProject && <p className="text-xs text-muted-foreground">项目已建立；重试会补齐尚未完成的作品。<Link href={`/projects/${encodeURIComponent(createdProject.id)}`} className="ml-1 text-primary hover:underline">打开项目</Link></p>}
    </section>
  </main>;
}
