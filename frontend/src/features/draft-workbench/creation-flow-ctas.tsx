"use client";

import * as React from "react";
import { GitBranch, Search, Upload, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { useDraftChatRequest } from "./draft-chat-request";
import {useCreationClient,useCreationScope,creationScopeKey} from "@/lib/creation-workspace-scope";
import {prepareWorkCreationRequest,type WorkCreationRequestState} from "./work-creation-request";
import { uploadFileToProject } from "./upload-to-project";

// T-730：恢复可选“先梳理观点”入口；它不是写稿前置，用户仍可直接进入稿面。
//
// [T-146] 最前面加「＋上传素材」:PR/接商单场景先把自己的 PDF/Word/MD 资料上传进「当前项目」
// 弹药库(最高优先级素材)。上传链复用 AmmoDumpZone 的同款 uploadFileToProject(createUpload →
// PUT → complete → materialLink → 后端抽取/优先级/AI 注入,T-146 后端已做),不重造。

// 上传接受的文件类型:图/视频 + 常见文档(PR 资料多为 PDF/Word/MD/纯文本)。
const UPLOAD_ACCEPT = "image/*,video/*,.pdf,.doc,.docx,.md,.txt";
const CREATION_PREFILL="请使用已确认脚本与同一创作方法，一起生成完整文章和图文候选。我会分别预览采纳，再继续微调。不要生成视频、语音或插画。";

export function CreationFlowCtas({ projectId }: { projectId: string }) {
  const { openChat,prepareScriptForCreation,readWritingContext } = useDraftChatRequest();
  const client=useCreationClient(),scope=useCreationScope(),scopeKey=creationScopeKey(scope);
  const storageKey=`creatoros:t1070:creation:${scopeKey}:${projectId}`;
  const intent=React.useRef<WorkCreationRequestState|null>(null),currentScope=React.useRef(scopeKey),mounted=React.useRef(true);
  currentScope.current=scopeKey;
  const [creating,setCreating]=React.useState(false),[submitted,setSubmitted]=React.useState(false),[submission,setSubmission]=React.useState<WorkCreationRequestState['submission']>(),[creationError,setCreationError]=React.useState<string|null>(null);
  React.useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  React.useEffect(()=>{try{const previous=sessionStorage.getItem(storageKey);intent.current=previous?JSON.parse(previous):null;const state=intent.current?.submission;setSubmission(state==='preparing'?'submitted-unknown':state);setSubmitted(Boolean(intent.current?.completed&&state!=='not-submitted'));}catch{intent.current=null;}},[storageKey]);
  function settledCallback(frozen:WorkCreationRequestState,frozenScope:string){return()=>{if(currentScope.current===frozenScope&&intent.current===frozen){sessionStorage.removeItem(storageKey);intent.current=null;if(mounted.current){setSubmitted(false);setSubmission(undefined);setCreationError(null);}}};}
  function submissionCallback(frozen:WorkCreationRequestState,frozenScope:string){return(state:'not-submitted'|'submitted-unknown')=>{if(currentScope.current!==frozenScope||intent.current!==frozen)return;frozen.submission=state;sessionStorage.setItem(storageKey,JSON.stringify(frozen));if(mounted.current){setSubmission(state);setSubmitted(state==='submitted-unknown');setCreationError(state==='not-submitted'?'尚未提交生成。请核对编导设置后恢复原请求，原组合与脚本版本已保留。':null);}};}
  function sendFrozen(frozen:WorkCreationRequestState,frozenScope:string){frozen.submission='preparing';frozen.prefill??=CREATION_PREFILL;sessionStorage.setItem(storageKey,JSON.stringify(frozen));setSubmission('preparing');setSubmitted(false);setCreationError(null);openChat({prefill:frozen.prefill,autoSend:true,creationTarget:frozen.creationTarget,onCreationSettled:settledCallback(frozen,frozenScope),onCreationSubmission:submissionCallback(frozen,frozenScope)});}
  async function createPair(){if(creating||submission==='preparing')return;if(intent.current?.completed){
    // A remounted rail can still own the original live SDK request. An interrupted
    // preparing marker is UNKNOWN until that request explicitly reports no fetch.
    const latest=sessionStorage.getItem(storageKey);if(latest){const stored:WorkCreationRequestState=JSON.parse(latest);if(stored.clientRequestId===intent.current.clientRequestId&&stored.submission==='not-submitted')intent.current=stored;}
    const frozen=intent.current;if(frozen.submission==='not-submitted'){sendFrozen(frozen,scopeKey);return;}openChat({prefill:"",autoSend:false,creationTarget:frozen.creationTarget,onCreationSettled:settledCallback(frozen,scopeKey),onCreationSubmission:submissionCallback(frozen,scopeKey)});setCreationError("原生成结果尚未确认，正在编导中读取原任务结果。请保留原请求，不要重复生成。");return;}setCreating(true);setCreationError(null);const frozenScope=scopeKey;try{
    const source=await prepareScriptForCreation();
    if(currentScope.current!==frozenScope||!mounted.current)throw Error("工作区已切换，请回原项目恢复。");
    if(!intent.current){const previous=sessionStorage.getItem(storageKey);if(previous)intent.current=JSON.parse(previous);}
    if(intent.current&&JSON.stringify(intent.current.source)!==JSON.stringify(source)){
      const original=intent.current;
      await prepareWorkCreationRequest(client,original,()=>sessionStorage.setItem(storageKey,JSON.stringify(original)));
      if(currentScope.current!==frozenScope||!mounted.current)throw Error("工作区已切换，原组合已保留。");
      sessionStorage.removeItem(storageKey);intent.current=null;
      throw Error("原组合预约已恢复，原作品保留。当前脚本已有新版本，本次未生成；请再次点击确认当前脚本。");
    }
    intent.current??={clientRequestId:crypto.randomUUID(),projectId,source,writingContext:readWritingContext(scopeKey,projectId)??{schemaVersion:1,brandProfileVersionId:null,sourceAssets:[]}};
    const frozen=intent.current,persist=()=>sessionStorage.setItem(storageKey,JSON.stringify(frozen));persist();
    const creationTarget=await prepareWorkCreationRequest(client,frozen,persist);
    if(currentScope.current!==frozenScope||!mounted.current)throw Error("工作区已切换，原组合已保留。");
    frozen.completed=true;frozen.creationTarget=creationTarget;persist();sendFrozen(frozen,frozenScope);
  }catch(cause){if(mounted.current)setCreationError(cause instanceof Error?cause.message:"准备未完成，原预约已保留。");}finally{if(mounted.current)setCreating(false);}}
  const router = useRouter();
  const inputRef = React.useRef<HTMLInputElement>(null);
  // 上传态:idle → uploading(转圈)→ done(短暂✓)/ error(短暂✗),给用户反馈。
  const [phase, setPhase] = React.useState<
    "idle" | "uploading" | "done" | "error"
  >("idle");

  const handleFiles = React.useCallback(
    async (files: ReadonlyArray<File>) => {
      if (files.length === 0) return;
      setPhase("uploading");
      let ok = true;
      for (const file of files) {
        try {
          await uploadFileToProject(projectId, file);
        } catch {
          ok = false;
        }
      }
      setPhase(ok ? "done" : "error");
      // 出现在当前项目的「创作素材」(materialLinks 已挂本项目)。
      router.refresh();
      // 2s 后回 idle(反馈短促,不长期占位)。
      window.setTimeout(() => setPhase("idle"), 2000);
    },
    [projectId, router],
  );

  const uploading = phase === "uploading";

  return (
    <section
      data-slot="creation-flow-ctas"
      aria-label="创作流引导"
      className="flex flex-wrap items-center gap-2 rounded-card border border-border bg-surface-subtle px-3 py-2"
    >
      <Button type="button" disabled={creating||submission==='preparing'} onClick={()=>void createPair()} className="min-h-11 gap-2"><Sparkles className="size-4"/>{creating||submission==='preparing'?"正在保存并准备…":submitted?"查看原文章和图文生成":creationError||submission==='not-submitted'?"恢复原请求 · 一键生成文章和图文":"一键生成文章和图文"}</Button>
      {creationError?<p role="alert" className="w-full text-sm text-destructive">{creationError}</p>:null}

      {/* [T-146] ＋上传素材(最高优先级):把自己的 PDF/Word/MD 资料上传进当前项目弹药库。 */}
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={UPLOAD_ACCEPT}
        data-slot="creation-flow-upload-input"
        aria-hidden="true"
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          void handleFiles(files);
        }}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={uploading}
        data-slot="creation-flow-upload-cta"
        className="h-7 gap-1.5 text-xs"
        onClick={() => inputRef.current?.click()}
      >
        {uploading ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <Upload className="size-3.5" />
        )}
        {phase === "uploading"
          ? "上传中…"
          : phase === "done"
            ? "已上传 ✓"
            : phase === "error"
              ? "上传失败,重试"
              : "上传 / 管理素材"}
      </Button>

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7 gap-1.5 text-xs"
        onClick={() =>
          openChat({
            // [T-265] 死链修:原 functionKey="research.gather_material" 不在 ALL_CHAT_TOOL_NAMES →
            // forcedTool 恒 undefined(空点)。对话搜素材的真工具是 material.gather,对齐它,第0步强制调。
            functionKey: "material.gather",
            prefill:
              "围绕这条内容的主题,联网搜集一批可用素材(案例、数据、金句),给出来源。",
            autoSend: true,
          })
        }
      >
        <Search className="size-3.5" />
        联网找资料
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7 gap-1.5 text-xs"
        onClick={() =>
          openChat({
            functionKey: "planning.thesis",
            prefill:
              "这次内容需要先梳理复杂观点。请基于当前项目生成可选论点骨架，先给候选，等我明确采纳后再用于写稿。",
            autoSend: true,
          })
        }
      >
        <GitBranch className="size-3.5" />
        先梳理观点（可选）
      </Button>
      <span className="text-[11px] text-text-subtle">
        复杂观点可先梳理；已有完整逐字稿或简单短口播可直接写稿
      </span>
    </section>
  );
}
