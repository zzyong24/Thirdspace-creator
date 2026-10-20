"use client";
import {useCreationWorkspace,useCreationScope,creationScopeKey,type CreationOperation} from "@/lib/creation-workspace-scope";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { NewProjectForm, type NewProjectFormValues } from "./new-project-form";
import { client as legacyClient } from "@/lib/contract-client";
import { describeUserError } from "@/lib/ai-error-humanize";

export interface ProjectWorkOutput {
  id: string;
  title: string;
  contentType: string;
  targetPlatform?: string | null;
}

export { WORK_CHOICES } from "./work-type-fields";
import { WORK_CHOICES, type WorkType } from "./work-type-fields";

/** 形式由用户选择；平台只影响可选设置。 */
export function recommendedWorkChoice(_platform: string | null | undefined): WorkType {
  return "video";
}

export async function submitInitialGraphicBody(accountId: string | null | undefined, outputId: string, sourceItemId?: string,operation?:CreationOperation): Promise<"submitted" | "unavailable" | "source-unavailable" | "unknown"> {
  const client=operation?.client??legacyClient;
  if (!operation?.scope.groupId&&!accountId) return "unavailable";
  operation?.assertCurrent();
  try {
    const capabilities = await client.listCreativeCapabilities({ params: undefined, query: { ...(!operation?.scope.groupId&&accountId?{accountId}:{}), outputId }, body: undefined });
    const body = capabilities.items.find((item) => item.outputType === "image" && item.kind === "body" && item.platform === "xiaohongshu")
      ?? capabilities.items.find((item) => item.outputType === "image" && item.kind === "body" && item.platform === null);
    if (body?.state !== "supported") return "unavailable";
    const result = await client.generateResult({ params: { outputId }, query: undefined,
      body: { kind: "body", clientRequestId: `t1029-first-body-${outputId}`, ...(sourceItemId ? { sourceItemId } : {}) } });
    if (result.status === "failed" && result.errorCode === "SOURCE_UNAVAILABLE") return "source-unavailable";
    if (result.status === "failed") return "unavailable";
    return "submitted";
  } catch (error) {
    if (sourceItemId && (error as { code?: unknown })?.code === "SOURCE_UNAVAILABLE") return "source-unavailable";
    operation?.assertCurrent();
    // Network acknowledgement can be lost after a task is persisted. The result list
    // on the workbench remains authoritative after navigation.
    operation?.assertCurrent();return "unknown";
  }
}

export async function submitInitialVideoScript(accountId: string | null | undefined, output: ProjectWorkOutput, sourceItemId?: string,operation?:CreationOperation): Promise<"submitted" | "unavailable" | "source-unavailable" | "unknown"> {
  const client=operation?.client??legacyClient;
  if (!operation?.scope.groupId&&!accountId) return "unavailable";
  operation?.assertCurrent();
  try {
    const capabilities = await client.listCreativeCapabilities({ params: undefined, query: { ...(!operation?.scope.groupId&&accountId?{accountId}:{}), outputId: output.id }, body: undefined });
    const script = capabilities.items.find((item) => item.outputType === "video" && item.kind === "script" && item.platform === output.targetPlatform)
      ?? capabilities.items.find((item) => item.outputType === "video" && item.kind === "script" && item.platform === null);
    if (script?.state !== "supported") return "unavailable";
    const result = await client.generateResult({ params: { outputId: output.id }, query: undefined,
      body: { kind: "script", clientRequestId: `t1029-first-script-${output.id}`, ...(sourceItemId ? { sourceItemId } : {}) } });
    if (result.status === "failed" && result.errorCode === "SOURCE_UNAVAILABLE") return "source-unavailable";
    if (result.status === "failed") return "unavailable";
    return "submitted";
  } catch (error) {
    if (sourceItemId && (error as { code?: unknown })?.code === "SOURCE_UNAVAILABLE") return "source-unavailable";
    operation?.assertCurrent();return "unknown";
  }
}

export function workDestination(projectId: string, output: ProjectWorkOutput): string {
  const base = `/projects/${encodeURIComponent(projectId)}`;
  if (output.contentType === "image") return `${base}/outputs/${encodeURIComponent(output.id)}/image`;
  if (output.contentType === "article") return `${base}/article?outputId=${encodeURIComponent(output.id)}`;
  if (output.contentType === "video") return `${base}/outputs/${encodeURIComponent(output.id)}/video`;
  return base;
}

function outputLabel(output: ProjectWorkOutput): string {
  const kind = output.contentType === "image" ? "图文" : output.contentType === "article" ? "长文" : "视频";
  const platform = ({xiaohongshu: "小红书", douyin: "抖音", kuaishou: "快手", wechatOfficialAccount: "公众号"} as Record<string,string>)[output.targetPlatform ?? ""];
  return platform ? `${platform} · ${kind}` : kind;
}

function ProjectOutputHomeSession({ projectId, projectTitle, initialOutputs, accountId, accountPlatform, initialType }: {
  projectId: string;
  projectTitle: string;
  initialOutputs: readonly ProjectWorkOutput[];
  accountId?: string | null;
  accountPlatform?: string | null;
  initialType?: WorkType;
}) {
 const workspace=useCreationWorkspace(useCreationScope());
 const alive=React.useRef(false);React.useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[workspace,projectId]);

  const router = useRouter();
  const [outputs, setOutputs] = React.useState<readonly ProjectWorkOutput[]>(initialOutputs);
  const request = React.useRef({ id: crypto.randomUUID(), digest: "" });

  // 旧的 #script/#topic/#publish 深链仍进入原视频稿面。
  React.useEffect(() => {
    if (["#script", "#topic", "#publish"].includes(window.location.hash)) {
      router.replace(`/projects/${encodeURIComponent(projectId)}?view=video${window.location.hash}`);
    }
  }, [projectId, router]);

  async function createWork(values: NewProjectFormValues) {
    const operation=workspace.capture(),client=operation.client;const check=()=>{operation.assertCurrent();if(!alive.current)throw new DOMException("页面已离开","AbortError");};check();
    const choice = WORK_CHOICES.find(item => item.id === (values.contentType ?? "video"))!;
    const targetPlatform = values.targetPlatform;
    const trimmedTitle = values.name.trim();
    if (!trimmedTitle) return;
    const digest = JSON.stringify({ projectId, contentType: choice.contentType, targetPlatform, title: trimmedTitle });
    if (request.current.digest !== digest) request.current = { id: crypto.randomUUID(), digest };
    try {
      const created = await client.createOutput({
        params: { projectId }, query: undefined,
        body: { title: trimmedTitle, contentType: choice.contentType, ...(targetPlatform ? {targetPlatform} : {}), clientRequestId: request.current.id },
      }) as ProjectWorkOutput;
      check();setOutputs((current) => current.some(item => item.id === created.id) ? current : [...current, created]);
      request.current = { id: crypto.randomUUID(), digest: "" };
      const initialStatus = created.contentType === "image" ? await submitInitialGraphicBody(accountId, created.id,undefined,operation)
        : created.contentType === "video" ? await submitInitialVideoScript(accountId, created,undefined,operation) : "submitted";
      check();const href = workDestination(projectId, created);
      if (values.enterAfterCreate) {
        router.push(initialStatus !== "submitted" ? `${href}?start=${initialStatus}` : href);
        router.refresh();
      }
    } catch (reason) {
      check();throw new Error(describeUserError(reason, "创建作品未完成，请重试。"));
    }
  }

  return <main data-page="project-output-home" data-studio-layout="creation" className="mx-auto w-full max-w-5xl space-y-6 p-5 md:p-8">
    <header className="space-y-2">
      <Link href="/projects" className="text-sm text-muted-foreground hover:text-foreground">← 返回项目</Link>
      <Link href={`/projects/${encodeURIComponent(projectId)}`} className="inline-flex rounded-md border px-3 py-2 text-sm hover:bg-surface-subtle">返回脚本编辑台</Link>
      <h1 className="text-2xl font-semibold text-foreground">{projectTitle}</h1>
      <p className="text-sm text-muted-foreground">一个项目可包含多种作品。</p>
    </header>
    <section className="rounded-xl border border-border bg-surface p-5" aria-label="创作作品">
      <div className="mb-4"><h2 className="text-lg font-semibold">创作作品</h2><p className="mt-1 text-sm text-muted-foreground">仅设置本次作品的平台与形式。</p></div>
      <NewProjectForm includeWorkType multipleWorkTypes={false} submitLabel="开始创作"
        defaultValues={{name: projectTitle, contentType: initialType ?? recommendedWorkChoice(accountPlatform)}}
        onCreate={createWork} onCancel={() => router.push(`/projects/${encodeURIComponent(projectId)}`)} />
    </section>
    <section className="space-y-3" aria-label="已有作品">
      <h2 className="text-lg font-semibold">已有作品 <span className="text-sm font-normal text-muted-foreground">{outputs.length}</span></h2>
      {outputs.length ? <ul className="grid gap-3 sm:grid-cols-2">{outputs.map((output) => <li key={output.id} className="rounded-xl border border-border bg-surface p-4">
        <div className="text-xs text-muted-foreground">{outputLabel(output)}</div>
        <h3 className="mt-1 font-medium">{output.title}</h3>
        <Link href={workDestination(projectId, output)} className="mt-3 inline-block text-sm font-medium text-primary hover:underline">打开作品 →</Link>
      </li>)}</ul> : <p className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">还没有作品。上方选一种形式即可开始。</p>}
    </section>
  </main>;
}

export function ProjectOutputHome(props:Parameters<typeof ProjectOutputHomeSession>[0]){const selection=useCreationScope();return <ProjectOutputHomeSession key={creationScopeKey(selection)+":"+(props.projectId)} {...props}/>;}
