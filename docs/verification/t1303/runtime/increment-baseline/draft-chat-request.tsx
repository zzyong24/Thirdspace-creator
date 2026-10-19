"use client";

import { executionTimeoutMs } from "@creatoros/contract/timeout-policy";

/**
 * `draft-chat-request.tsx` — 稿面「外部对话请求」协调器(T-108,方案 A · lift state)。
 *
 * 稿面右栏是**常驻嵌入式 Copilot**(DraftChatRail → AICopilotContent embed 模式),
 * 稿面没有独立全局弹层 Copilot 主体。T-103a/b 让盲预测/审核按钮走 `copilotDeepLink`
 * (`?copilot=open&fn=…&prefill=…`)+ router.push —— 但 `?copilot=open` 是给**全局弹层**
 * OverlayController 开的;在稿面开不出/和常驻 rail 打架,prefill 也进不了 rail(bug T-108)。
 *
 * 修法(方案 A):把「对话请求」state 提到稿面顶层(本 Provider),按钮点击 = setRequest
 * (functionKey + prefill + selection + 自增 nonce),**不再** router.push。DraftChatRail 消费
 * request → 透传进 AICopilotContent 的 embed.request → embed 监听 nonce 变化预填输入框
 * (不自动发,延续 T-055b)+ 置 functionKey + 应用 selection。全客户端内聚,不碰全局弹层。
 *
 * nonce SSR/水合安全(铁律):用 React state 计数器自增,**绝不** Date.now()/Math.random()
 * (它们在 server 与 client 首帧不一致会触发水合警告)。首帧 request=null(nonce 概念上为 0),
 * 用户点击后才自增到 1、2、3…,每次都是新值 → embed effect 据 nonce 变化重新预填。
 */

import * as React from "react";
import type {
  WritingContext,
  WorkEditorTarget,
  WorkEditorCandidate,
  WorkCreationTarget,
  WorkCreationProposalResult,
} from "@creatoros/contract";
export type EditorSaveCandidate =
  | WorkEditorCandidate
  | {
      kind: "work.creation.member";
      proposal: WorkCreationProposalResult;
      member: "article" | "image";
    };
export function editorCandidateOutputId(candidate: EditorSaveCandidate) {
  return candidate.kind === "work.creation.member"
    ? (candidate.member === "article"
        ? candidate.proposal.target.articleMember
        : candidate.proposal.target.graphicMember
      ).outputId
    : candidate.target.outputId;
}
export type ScriptSourceRef = {
  kind: "project_script";
  id: string;
  versionId: string;
};
export type EditorAdoption = {
  status: "adopted" | "saved-not-synced" | "saved-native-unknown";
  versionId?: string;
  revision?: number;
  message?: string;
  /** 可信编辑器已核验本次采纳的精确内容与clean状态；仅放行该generation，自身同步可推进generation。 */
  syncedGeneration?: number;
};
export class EditorCandidateConflictError extends Error {}
type EditorBoundSave = {canonical:string; save:()=>Promise<any>; pending?:Promise<any>};
const editorBoundSaves = new Map<string,EditorBoundSave>();
/** 只在本次UI调用期间绑定正式来源保存；旧两参数编辑器仍负责草稿/epoch和刷新。 */
export async function withEditorCandidateSave<T>(candidate:EditorSaveCandidate,requestId:string,save:()=>Promise<any>,adopt:()=>Promise<T>):Promise<T> {
  if (editorBoundSaves.has(requestId)) throw new EditorCandidateConflictError("该候选正在采用，请先核对原结果。");
  const binding:EditorBoundSave={canonical:editorCanonical(candidate),save};
  editorBoundSaves.set(requestId,binding);
  try {return await adopt();} finally {if(editorBoundSaves.get(requestId)===binding)editorBoundSaves.delete(requestId);}
}
export function boundEditorCandidateSave(candidate:EditorSaveCandidate,requestId:string):Promise<any>|undefined {
  const binding=editorBoundSaves.get(requestId);
  if(!binding)return undefined;
  if(binding.canonical!==editorCanonical(candidate))throw new EditorCandidateConflictError("候选身份或内容已改变，原采用请求保留。");
  return binding.pending??=binding.save();
}
/** 只在 Provider 内有意义的对象身份；不序列化目标、正文或凭据。 */
export type PreparedEditorTurn = { readonly token: symbol };
export type EditorPreparation = {
  scopeKey: string;
  projectId: string;
  outputId: string;
  owner: WorkEditorTarget["owner"];
  versionId: string;
  documentFingerprint: string;
  selection: WorkEditorTarget["selection"];
  writingContext?: WritingContext;
};
export type EditorState = {
  target: WorkEditorTarget | null;
  /** 已加载的本地作品身份；刷新恢复不依赖再次发送模型，冻结target仍由prepare产生。 */
  outputId?: string;
  generation: number;
  dirty: boolean;
  preparation?: EditorPreparation;
};
/** 只读、本次调用的内存证明；不序列化，不增加后端写权限。 */
export type EditorCandidateAdmission = { isCurrent(): boolean };
export interface DraftEditorPort {
  admitCandidate?(candidate: EditorSaveCandidate): Promise<EditorCandidateAdmission | null>;
  readState(): EditorState;
  prepareForTurn(options?: { requireScript: boolean }): Promise<WorkEditorTarget>;
  previewCandidate(
    candidate: WorkEditorCandidate,
  ): Promise<{ blob: Blob; fileName: string; warnings?: string[] } | null>;
  adoptCandidate(
    candidate: EditorSaveCandidate,
    requestId: string,
  ): Promise<EditorAdoption>;
}
export interface DraftScriptPort {
  readState(): { generation: number };
  prepareForCreation(): Promise<ScriptSourceRef>;
}
/** SEMANTIC_BOUNDARY_ALLOW: JSON 字段顺序规范化只用于同一稿件/回执核验，不判断内容。 */
export function editorCanonical(value: unknown): string {
  const wire = JSON.parse(JSON.stringify(value));
  const encode = (v: any): string =>
    Array.isArray(v)
      ? `[${v.map(encode).join(",")}]`
      : v !== null && typeof v === "object"
        ? `{${Object.keys(v)
            .sort()
            .map((k) => `${JSON.stringify(k)}:${encode(v[k])}`)
            .join(",")}}`
        : JSON.stringify(v);
  return encode(wire);
}
export async function editorDigest(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(editorCanonical(value));
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return (
    "sha256:" +
    Array.from(new Uint8Array(hash), (n) =>
      n.toString(16).padStart(2, "0"),
    ).join("")
  );
}
/** SEMANTIC_BOUNDARY_ALLOW: 只核对首次程序派生的精确谱系与冻结候选身份，不做内容判断或授权。 */
export function derivedEditorDraft(input: {
  scopeKey:string;projectId:string;outputId:string;owner:"wechat_article"|"graphic_post";
  artifactId:string;currentVersionId:string;current:unknown;draft:unknown;generation:number;
  scriptContext?:{state:string;scriptRef:unknown;scriptText:string};
}) {
  const context=input.scriptContext;
  if(context?.state!=="ready"||!context.scriptRef||!context.scriptText.trim()||editorCanonical(input.current)===editorCanonical(input.draft))return null;
  return Object.freeze({...input,baseFingerprint:editorCanonical(input.current),draftFingerprint:editorCanonical(input.draft),
    scriptFingerprint:editorCanonical(context.scriptRef),scriptText:context.scriptText});
}
export async function matchesDerivedCandidate(proof:NonNullable<ReturnType<typeof derivedEditorDraft>>,candidate:EditorSaveCandidate){
  if(candidate.kind==="work.creation.member"){
    const target=candidate.proposal.target,member=candidate.member==="article"?target.articleMember:target.graphicMember;
    return target.projectId===proof.projectId&&member.outputId===proof.outputId&&member.artifactId===proof.artifactId&&
      member.baseVersionId===proof.currentVersionId&&(candidate.member==="article"?"wechat_article":"graphic_post")===proof.owner&&
      editorCanonical(candidate.proposal.scriptSourceRef)===proof.scriptFingerprint&&editorCanonical(target.scriptSourceRef)===proof.scriptFingerprint;
  }
  const target=candidate.target;
  return target.projectId===proof.projectId&&target.outputId===proof.outputId&&target.owner===proof.owner&&
    target.savedBase.kind==="artifact"&&candidate.base.kind==="artifact"&&
    target.savedBase.artifactId===proof.artifactId&&target.savedBase.versionId===proof.currentVersionId&&
    editorCanonical(candidate.base)===editorCanonical(target.savedBase)&&candidate.baseDigest===await editorDigest(proof.current)&&
    target.documentDigest===candidate.baseDigest;
}
async function strictWait<T>(work: Promise<T>, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(Error(message)), 120000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/** 稿面 AI 按钮发起的一次对话请求(注入 rail)。 */
export interface DraftChatRequest {
  /** 可选的专用工具 id；内容判断省略，使用自由对话 loop。 */
  readonly functionKey?: string;
  /** 话术文本 —— autoSend=true 时作为自动发出的消息;否则预填进输入框(T-055b)。 */
  readonly prefill: string;
  /**
   * [T-108 v2] 是否自动发送。稿面右栏是**常驻打开**的,用户点「审核」/「先盲预测」是
   * **显式动作** → 直接把话术自动 sendMessage 进 rail(不是预填等回车)。这不违反 T-055b
   * 的「预填不自动发」——那条防的是「?fn 重进/重渲时重复入历史」,这里是用户主动点按钮明确
   * 要发,由 nonce 去重(每次点击一个新 nonce,只发一次)。稿面审核/盲预测按钮传 true。
   */
  readonly autoSend?: boolean;
  /** 注入对话的选中内容(content_output id + 项目标题)——免编导索要 id/标题。 */
  readonly selection?: {
    readonly kind: string;
    readonly id: string;
    readonly title?: string;
    readonly artifactId?: string;
    readonly versionId?: string;
    readonly sectionIndex?: number;
    readonly excerpt?: string;
  };
  /**
   * 单调自增计数器 —— embed effect 据它变化预填/自动发(URL/props 变了也响应,且天然去重)。
   * 由 Provider 内部 state 生成,SSR 安全(非 Date.now/Random)。
   */
  readonly nonce: number;
  readonly preparedEditorTurn?: PreparedEditorTurn;
  readonly creationTarget?: WorkCreationTarget;
  readonly onCreationSettled?: () => void;
  readonly onCreationSubmission?: (state: "not-submitted" | "submitted-unknown") => void;
}

/** 编辑器 flush:把在途未保存内容落库,resolve 后 DB = 最新。saved 态则 no-op 立即返回。 */
export type FlushSaveFn = () => Promise<void>;

interface DraftChatRequestContextValue {
  readonly readWritingContext:(scopeKey:string,projectId:string)=>WritingContext|undefined;
  readonly setWritingContext:(scopeKey:string,projectId:string,choice:WritingContext)=>void;
  readonly registerEditor: (port: DraftEditorPort) => () => void;
  readonly readEditorState: () => EditorState | null;
  readonly prepareEditorRequest: (scopeKey: string) => Promise<PreparedEditorTurn | undefined>;
  readonly discardPreparedEditorTurn: (ticket?: PreparedEditorTurn) => void;
  readonly prepareEditorTurn: (ticket?: PreparedEditorTurn, scopeKey?: string, nonce?: number) => Promise<WorkEditorTarget | undefined>;
  readonly previewEditorCandidate: (
    candidate: WorkEditorCandidate,
  ) => Promise<{ blob: Blob; fileName: string; warnings?: string[] } | null>;
  readonly adoptEditorCandidate: (
    candidate: EditorSaveCandidate,
    requestId: string,
  ) => Promise<EditorAdoption | null>;
  readonly registerScript: (port: DraftScriptPort) => () => void;
  readonly prepareScriptForCreation: () => Promise<ScriptSourceRef>;
  readonly notifyEditorChanged: () => void;

  /** 最近一次对话请求;null = 还没发起(首帧)。 */
  readonly request: DraftChatRequest | null;
  /** 发起一次对话请求(按钮点击调用):补上自增 nonce 后落 state。 */
  readonly openChat: (req: Omit<DraftChatRequest, "nonce">) => void;
  /**
   * [T-108 v2] 注册编辑器的 flush 函数(编辑器挂载时调,卸载时传 null 注销)。审核/盲预测
   * 按钮据此在自动发前 flush 保存最新内容(确保 review.script/diagnose 审的是最新版,非 DB 旧版)。
   */
  readonly registerFlush: (fn: FlushSaveFn | null) => void;
  /**
   * [T-108 v2] flush 已注册的编辑器保存(await 完成)。无编辑器注册(结构测试/无脚本)→
   * resolve 空(no-op)。审核/盲预测按钮点击 = `await flushSave()` 后再 autoSend。
   */
  readonly flushSave: FlushSaveFn;
  readonly flushSaveStrict: FlushSaveFn;
}

const DraftChatRequestContext =
  React.createContext<DraftChatRequestContextValue | null>(null);

/**
 * 稿面对话请求 Provider —— 包住整个稿面主体(左稿面 + 右 rail),让左稿面的 AI 按钮
 * 与右栏常驻 rail 通过 context 直连(二者在树上是 sibling,靠 context 而非 prop-drilling)。
 */
export function DraftChatRequestProvider({
  children,
}: {
  readonly children: React.ReactNode;
}) {
  const writingChoices=React.useRef(new Map<string,WritingContext>());
  const readWritingContext=React.useCallback((scopeKey:string,projectId:string)=>{const value=writingChoices.current.get(JSON.stringify([scopeKey,projectId]));return value?structuredClone(value):undefined;},[]);
  const setWritingContext=React.useCallback((scopeKey:string,projectId:string,choice:WritingContext)=>{writingChoices.current.set(JSON.stringify([scopeKey,projectId]),structuredClone(choice));},[]);
  const [request, setRequest] = React.useState<DraftChatRequest | null>(null);
  // nonce 计数器放 ref:openChat 稳定(不随每次请求重建),自增值仍单调。
  const nonceRef = React.useRef(0);

  // 编辑器 flush 注册表(ref:注册/注销不该触发 Provider 重渲 → 不重建 value)。
  const flushFnRef = React.useRef<FlushSaveFn | null>(null);
  const registerFlush = React.useCallback((fn: FlushSaveFn | null) => {
    flushFnRef.current = fn;
  }, []);
  const flushSave = React.useCallback<FlushSaveFn>(async () => {
    const fn = flushFnRef.current;
    if (!fn) return; // 无编辑器注册 → no-op(结构测试/纯文本无编辑器)。
    // [T-120] flush 是「让 AI 审最新版」的**尽力而为**,绝不能无限挂起把 AI 按钮卡死在
    // 「打开对话中…」。编辑器 performSave 若因 server 冷启动/网络慢而久挂,最多等 120s 就放行
    // 开对话(审到的版本最多差最后一次未落库的编辑);fn 报错也吞掉不阻断(开对话是主目标)。
    await Promise.race([
      (async () => {
        try {
          await fn();
        } catch {
          /* flush 失败不阻断开对话 */
        }
      })(),
      new Promise<void>((resolve) => {
        setTimeout(resolve, executionTimeoutMs(4000));
      }),
    ]);
  }, []);
  const flushSaveStrict = React.useCallback<FlushSaveFn>(async () => {
    const fn = flushFnRef.current;
    if (!fn) throw new Error("编辑器尚未准备好，请稍后重试。");
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        fn(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error("保存仍在处理中，本次未发送诊断。请稍后重试。")), executionTimeoutMs(10000));
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }, []);
  const editorRef = React.useRef<{
    token: symbol;
    port: DraftEditorPort;
  } | null>(null);
  const scriptRef = React.useRef<{
    token: symbol;
    port: DraftScriptPort;
  } | null>(null);
  // 已发生编辑或真实注销的作品不能在重新注册后恢复首次派生资格。
  const retiredDerived = React.useRef(new Set<string>());
  const derivedKey = (state: EditorState) => state.preparation && editorCanonical([
    state.preparation.scopeKey,state.preparation.projectId,state.preparation.owner,state.preparation.outputId,
  ]);
  const [editorTick, bumpEditor] = React.useReducer((n) => n + 1, 0);
  const notifyEditorChanged = React.useCallback(() => {
    const state=editorRef.current?.port.readState();
    if(state?.dirty){const key=derivedKey(state);if(key)retiredDerived.current.add(key);}
    bumpEditor();
  }, []);
  const registerEditor = React.useCallback((port: DraftEditorPort) => {
    const entry = { token: Symbol(), port };
    // 首挂 StrictMode 的同步 effect 重放不算一次真实离开；跨 tick 注销仍永久失效。
    let committed=false;
    queueMicrotask(()=>{committed=true;});
    prepared.current.clear();
    preparationEpoch.current++;
    editorRef.current = entry;
    bumpEditor();
    return () => {
      if (editorRef.current?.token === entry.token) {
        if(committed){const key=derivedKey(entry.port.readState());if(key)retiredDerived.current.add(key);}
        editorRef.current = null;
        prepared.current.clear();
        preparationEpoch.current++;
        bumpEditor();
      }
    };
  }, []);
  const registerScript = React.useCallback((port: DraftScriptPort) => {
    const entry = { token: Symbol(), port };
    scriptRef.current = entry;
    return () => {
      if (scriptRef.current?.token === entry.token) scriptRef.current = null;
    };
  }, []);
  const readEditorState = React.useCallback(
    () => editorRef.current?.port.readState() ?? null,
    [],
  );
  type PreparedBinding = { entry: NonNullable<typeof editorRef.current>; target: WorkEditorTarget; fingerprint: string };
  const prepared = React.useRef(new Map<PreparedEditorTurn, PreparedBinding>());
  const ticketTurns = React.useRef(new WeakMap<PreparedEditorTurn, { nonce?: number; scopeKey: string; owner: WorkEditorTarget["owner"]; outputId: string; projectId: string }>());
  const providerAlive = React.useRef(true);
  const preparationEpoch = React.useRef(0);
  React.useEffect(() => {
    providerAlive.current = true;
    return () => { providerAlive.current = false; preparationEpoch.current++; prepared.current.clear(); };
  }, []);
  const discardPreparedEditorTurn = React.useCallback((ticket?: PreparedEditorTurn) => {
    if (ticket) prepared.current.delete(ticket);
  }, []);
  const openChat = React.useCallback((req: Omit<DraftChatRequest, "nonce">) => {
    nonceRef.current += 1;
    // 新按钮回合使上一回合未消费的准备失效，不能从历史request借用。
    for (const ticket of prepared.current.keys()) if (ticket !== req.preparedEditorTurn) prepared.current.delete(ticket);
    const binding = req.preparedEditorTurn && ticketTurns.current.get(req.preparedEditorTurn);
    if (binding) {
      if (binding.nonce !== undefined) throw Error("原准备凭据已绑定其他回合。");
      binding.nonce = nonceRef.current;
    }
    setRequest({ ...req, nonce: nonceRef.current });
  }, []);
  // SEMANTIC_BOUNDARY_ALLOW: 规范化只核对同一准备的机械身份、选区和明确偏好，不判断创作内容。
  const stateFingerprint = (state: EditorState) => editorCanonical({
    preparation: state.preparation, generation: state.generation, dirty: state.dirty,
    target: state.target,
  });
  const prepareFresh = React.useCallback(async (requireScript = false) => {
    const entry = editorRef.current;
    if (!entry) return undefined;
    const before = entry.port.readState();
    const epoch = preparationEpoch.current;
    const context = (state: EditorState) => state.preparation && editorCanonical({
      ...state.preparation, versionId: undefined, documentFingerprint: undefined,
    });
    const beforeContext = context(before);
    const target = await strictWait(
      entry.port.prepareForTurn(requireScript ? { requireScript: true } : undefined),
      "保存仍在处理中，本次未发送。请恢复原请求后重试。",
    );
    const after = entry.port.readState();
    if (!providerAlive.current || preparationEpoch.current !== epoch || editorRef.current !== entry ||
      after.generation !== before.generation || after.dirty || context(after) !== beforeContext)
      throw Error("当前稿、选区或编辑器已改变，本次未发送，请核对后重试。");
    bumpEditor();
    return { entry, target, fingerprint: stateFingerprint(after) };
  }, []);
  const prepareEditorRequest = React.useCallback(async (scopeKey: string) => {
    // Provider只保留当前明确回合；每次按钮调用是新的turn，不缓存“当前稿”。
    prepared.current.clear();
    const epoch = ++preparationEpoch.current;
    const result = await prepareFresh(true);
    if (!result) return undefined;
    if (preparationEpoch.current !== epoch || result.entry.port.readState().preparation?.scopeKey !== scopeKey)
      throw Error("当前稿或工作区已改变，本次未发送。");
    const ticket: PreparedEditorTurn = Object.freeze({ token: Symbol("editor-turn") });
    prepared.current.set(ticket, result);
    ticketTurns.current.set(ticket, { scopeKey, owner: result.target.owner, outputId: result.target.outputId, projectId: result.target.projectId });
    return ticket;
  }, [prepareFresh]);
  const prepareEditorTurn = React.useCallback(async (ticket?: PreparedEditorTurn, scopeKey?: string, nonce?: number) => {
    if (ticket) {
      const binding = prepared.current.get(ticket);
      const turn = ticketTurns.current.get(ticket);
      if (!turn || turn.nonce === undefined || turn.nonce !== nonce || nonceRef.current !== nonce) throw Error("原准备凭据不属于本回合。");
      const context = editorRef.current?.port.readState().preparation;
      if (!context || scopeKey !== turn.scopeKey || context.scopeKey !== turn.scopeKey ||
        context.owner !== turn.owner || context.outputId !== turn.outputId || context.projectId !== turn.projectId)
        throw Error("当前工作区或作品归属已改变，请回原工作区核对；原请求未发送。");
      // 先销毁准备快照；重试仍核原turn/归属，但必须重新准备，不能再次借用快照。
      prepared.current.delete(ticket);
      if (binding && editorRef.current === binding.entry &&
        binding.entry.port.readState().preparation?.scopeKey === scopeKey &&
        stateFingerprint(binding.entry.port.readState()) === binding.fingerprint)
        return binding.target;
      const fresh = await prepareFresh(true);
      if (nonceRef.current !== nonce) throw Error("当前回合已改变，原请求未发送。");
      if (fresh?.entry.port.readState().preparation?.scopeKey !== scopeKey) throw Error("当前工作区已改变，原请求未发送。");
      return fresh?.target;
    }
    return (await prepareFresh())?.target;
  }, [prepareFresh]);
  const prepareScriptForCreation = React.useCallback(async () => {
    const entry = scriptRef.current;
    if (!entry) throw Error("脚本尚未准备好，请先打开并确认当前脚本。");
    const before = entry.port.readState();
    const source = await strictWait(
      entry.port.prepareForCreation(),
      "脚本保存仍在处理中，本次未生成。请恢复原保存后重试。",
    );
    if (
      scriptRef.current !== entry ||
      entry.port.readState().generation !== before.generation
    )
      throw Error("脚本在保存期间已改变，本次未生成。");
    return source;
  }, []);
  const previewEditorCandidate = React.useCallback(
    async (candidate: WorkEditorCandidate) => {
      const entry = editorRef.current;
      const state = entry?.port.readState();
      if (
        !entry ||
        (state?.outputId ?? state?.target?.outputId) !== candidate.target.outputId
      )
        return null;
      const result = await entry.port.previewCandidate(candidate);
      if (editorRef.current !== entry)
        throw Error("当前编辑器已改变，请重新预览。");
      return result;
    },
    [],
  );
  const adoptEditorCandidate = React.useCallback(
    async (candidate: EditorSaveCandidate, requestId: string) => {
      const entry = editorRef.current;
      const state = entry?.port.readState();
      if (
        !entry ||
        (state?.outputId ?? state?.target?.outputId) !==
          editorCandidateOutputId(candidate)
      )
        return null;
      const conflict=()=>new EditorCandidateConflictError("当前作品有未保存修改，请先保存或核对；原输入已保留。");
      if(!state)throw conflict();
      if(state.dirty){
        const key=derivedKey(state),fingerprint=stateFingerprint(state);
        if(!entry.port.admitCandidate||!key||retiredDerived.current.has(key))throw conflict();
        const proof=await strictWait(entry.port.admitCandidate(candidate),"原稿核对仍在处理中，原输入已保留。");
        if(!proof||!proof.isCurrent()||!providerAlive.current||editorRef.current!==entry||
          retiredDerived.current.has(key)||stateFingerprint(entry.port.readState())!==fingerprint)throw conflict();
      }
      const result=await entry.port.adoptCandidate(candidate, requestId);
      const after=entry.port.readState();
      const {syncedGeneration,...adoption}=result;
      const synchronized=result.status==="adopted"&&Number.isSafeInteger(syncedGeneration)&&after.generation===syncedGeneration;
      if(editorRef.current!==entry||(after.outputId??after.target?.outputId)!==editorCandidateOutputId(candidate)||(after.generation!==state.generation&&!synchronized)||after.dirty) {
        return {...adoption,status:result.status==="adopted"?"saved-not-synced":result.status,message:"已保留原保存结果，当前编辑器或输入已改变，未覆盖输入。"};
      }
      bumpEditor();
      return adoption;
    },
    [],
  );
  const value = React.useMemo<DraftChatRequestContextValue>(
    () => ({
      readWritingContext,setWritingContext,
      request,
      openChat,
      registerFlush,
      flushSave,
      flushSaveStrict,
      registerEditor,
      readEditorState,
      prepareEditorTurn,
      prepareEditorRequest,
      discardPreparedEditorTurn,
      previewEditorCandidate,
      adoptEditorCandidate,
      registerScript,
      prepareScriptForCreation,
      notifyEditorChanged,
    }),
    [
      readWritingContext,setWritingContext,
      request,
      openChat,
      registerFlush,
      flushSave,
      flushSaveStrict,
      registerEditor,
      readEditorState,
      prepareEditorTurn,
      prepareEditorRequest,
      discardPreparedEditorTurn,
      previewEditorCandidate,
      adoptEditorCandidate,
      registerScript,
      prepareScriptForCreation,
      notifyEditorChanged,
      editorTick,
    ],
  );
  return (
    <DraftChatRequestContext.Provider value={value}>
      {children}
    </DraftChatRequestContext.Provider>
  );
}

/**
 * 消费对话请求 context。Provider 外调用返回 no-op(稿面外复用这些按钮/rail/编辑器不炸;
 * 稿面内一律有 Provider)。
 */
export function useDraftChatRequest(): DraftChatRequestContextValue {
  const ctx = React.useContext(DraftChatRequestContext);
  return ctx ?? NOOP_VALUE;
}

const NOOP_VALUE: DraftChatRequestContextValue = {
  readWritingContext:()=>undefined,setWritingContext:()=>{},
  registerEditor: () => () => {},
  readEditorState: () => null,
  prepareEditorTurn: async () => undefined,
  prepareEditorRequest: async () => undefined,
  discardPreparedEditorTurn: () => {},
  previewEditorCandidate: async () => null,
  adoptEditorCandidate: async () => null,
  registerScript: () => () => {},
  prepareScriptForCreation: async () => {
    throw Error("请先打开当前脚本。");
  },
  notifyEditorChanged: () => {},
  request: null,
  openChat: () => {},
  registerFlush: () => {},
  flushSave: async () => {},
  flushSaveStrict: async () => {
    throw new Error("请在稿面中使用内容诊断。");
  },
};
