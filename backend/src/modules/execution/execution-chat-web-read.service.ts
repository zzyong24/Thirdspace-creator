import type {BrowserSessionsService} from "../browser-sessions";
import {findBrowserSessionState,validateBrowserStorageState} from "./execution-browser-session.service";
import {assertSafeWebDomain,webDomainFromUrl} from "@creatoros/ai-worker/browser/web-domain";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { and, asc, eq, executionCalls, type Db } from "@creatoros/backend";
import { chatWebReadSessionSaveSchema, chatWebReadCallSchema, chatWebReadRecordSchema, agenticToolOutcomeSchema, workerToolResultReceiptSchema, type ExecutionRef } from "@creatoros/contract/execution-worker";
import { executionEvidence } from "../../schema/intelligence";
import { createPendingDocumentService, type AssetsService, type ObjectStorageForCtx } from "../assets";
import { createChatHostContextReader } from "../ai/chat-host-context.service";
import { chatWebReadDigest as digest, readChatWebReadEvidence } from "./chat-web-read-evidence";
import { normalizeWebReadUrl } from "../ai-runtime/chat-context";
import { buildChatTools, type ChatToolDeps } from "../ai-runtime/chat-tools";
import { getChatToolNativeExecutor } from "../ai-runtime/chat-tool-gate";
import { createAgenticToolBinding } from "./agentic-tool-binding";
import type { ChatBackendTool } from "./execution-chat-tool-ports.service";
import { createExecutionLeaseService } from "./execution-lease.service";
import { createExecutionCallLedgerService } from "./execution-call-ledger.service";
import { ConflictError } from "./execution.errors";

type Call = typeof executionCalls.$inferSelect;
const receipt = (parent: Call) => agenticToolOutcomeSchema.parse(workerToolResultReceiptSchema.parse(JSON.parse(parent.resultText!)).output);

/** 网页事实、素材提交与父工具回执分开恢复。仅接受真实父调用，不接受 Worker 提交素材 ID。 */
export function createExecutionChatWebReadService(db: Db, deps: {
  now?: () => string;
  budget: { maxCalls: number; maxTokens: number; deadlineMs: number };
  tools: Record<string, ChatBackendTool>;
  objectStorageForCtx: ObjectStorageForCtx;
  sessions?: Pick<BrowserSessionsService,"getStateVersioned"|"saveStateVersioned">;
  assets: Pick<AssetsService, "getAsset" | "getDownloadUrl" | "listFilesByIds">;
}) {
  const now = deps.now ?? (() => new Date().toISOString());
  const binding = createAgenticToolBinding(deps.tools);
  type Lease = Parameters<Parameters<ReturnType<typeof createExecutionLeaseService>["withLease"]>[2]>[0];
  type State = Lease & { parent: Call; calls: Call[]; bound: ReturnType<typeof binding.forCall>; url: string | null };
  async function access<T>(ref: ExecutionRef, callId: string, mode: "admission" | "settlement", action: (state: State) => Promise<T>, store = db): Promise<T> {
    const restored = mode === "admission" ? await createChatHostContextReader(store, { now }).read(ref) : null;
    return createExecutionLeaseService(store, { now }).withLease(ref, mode, async (lease) => {
      const calls = await lease.tx.select().from(executionCalls).where(eq(executionCalls.executionTaskId, lease.task.id)).orderBy(asc(executionCalls.sequence));
      const parent = calls.find((call) => call.id === callId);
      if (!parent || parent.parentCallId || parent.toolExecutionClaimId) throw new ConflictError("网页观察父调用无效");
      const bound = binding.forCall(lease.task, calls, parent);
      if (bound.validationOutcome || bound.executionToolName !== "web.read" || bound.execution !== "worker.web-read" || bound.effect !== "committed") throw new ConflictError("网页观察不属于当前冻结工具");
      let url: string | null = null;
      if (restored) {
        if (calls.filter((call) => call.kind === "model" && !call.parentCallId).at(-1)?.id !== bound.modelCallId) throw new ConflictError("旧模型回合不能上传新网页观察");
        const modelUrl = z.object({ url: z.string() }).parse(bound.input).url;
        url = normalizeWebReadUrl(restored.hostContext.chatContext.webReadUrl ?? modelUrl);
        if (!url || new URL(url).username || new URL(url).password) throw new ConflictError("冻结网页 URL 无效");
      }
      return action({ ...lease, parent, calls, bound, url });
    });
  }
  function started(state: State, ref: ExecutionRef) {
    if (state.parent.status !== "started" || state.parent.startedAttempt !== ref.attempt) throw new ConflictError("网页调用未取得当前执行权");
  }
  async function stored(state: State) {
    const [row] = await state.tx.select().from(executionEvidence).where(and(eq(executionEvidence.executionTaskId, state.task.id), eq(executionEvidence.originCallId, state.parent.id)));
    if (!row) return null;
    const observation = readChatWebReadEvidence(row, { taskId: state.task.id, callId: state.parent.id, inputDigest: state.bound.inputDigest, ...(state.url === null ? {} : { url: state.url }) });
    return { row, observation };
  }
  return {
    async readSession(ref: ExecutionRef, raw: unknown, signal?: AbortSignal) {
      const {callId}=chatWebReadCallSchema.parse(raw);
      return access(ref,callId,"admission",async(state)=>{
        signal?.throwIfAborted();started(state,ref);if(!deps.sessions)throw new ConflictError("网页会话端口尚未装配");
        const domain=assertSafeWebDomain(webDomainFromUrl(state.url!)),record=await findBrowserSessionState(deps.sessions,state.context,domain,state.tx);
        signal?.throwIfAborted();
        if(record.stateJson!==null)validateBrowserStorageState(record.stateJson,new URL(state.url!),domain);
        return {domain,stateJson:record.stateJson,revision:record.revision};
      });
    },
    async saveSession(ref: ExecutionRef, raw: unknown, signal?: AbortSignal) {
      const request=chatWebReadSessionSaveSchema.parse(raw);
      return access(ref,request.callId,"admission",async(state)=>{
        signal?.throwIfAborted();started(state,ref);if(!deps.sessions)throw new ConflictError("网页会话端口尚未装配");
        const domain=assertSafeWebDomain(webDomainFromUrl(state.url!));
        validateBrowserStorageState(request.stateJson,new URL(state.url!),domain);
        const record=await findBrowserSessionState(deps.sessions,state.context,domain,state.tx);
        signal?.throwIfAborted();
        if(record.revision!==request.revision || (record.revision!==null && record.stateJson===null))return {saved:false,revision:record.revision};
        return deps.sessions.saveStateVersioned(state.context,record.key,request.stateJson,request.revision,state.tx,signal);
      });
    },
    async restore(ref: ExecutionRef, raw: unknown, signal?: AbortSignal) {
      const { callId } = chatWebReadCallSchema.parse(raw);
      return access(ref, callId, "admission", async (state) => {
        signal?.throwIfAborted();
        if (state.parent.status !== "started" || state.parent.resultText || state.calls.some(call => call.parentCallId === callId)) throw new ConflictError("网页父调用不是可恢复读取");
        if (!await stored(state)) throw new ConflictError("网页没有已持久观察，不能恢复提交");
        signal?.throwIfAborted();
        await state.tx.update(executionCalls).set({ startedAttempt: ref.attempt, updatedAt: now() }).where(eq(executionCalls.id, callId));
        return { callId, status: "started" as const };
      });
    },
    async prepare(ref: ExecutionRef, raw: unknown, signal?: AbortSignal) {
      const { callId } = chatWebReadCallSchema.parse(raw);
      return access(ref, callId, "admission", async (state) => {
        signal?.throwIfAborted();
        if (!["started", "settled"].includes(state.parent.status)) throw new ConflictError("网页父调用不可读取");
        const saved = await stored(state);
        if (state.parent.status !== "settled" && state.parent.startedAttempt !== ref.attempt && !saved) throw new ConflictError("旧执行没有可恢复网页事实");
        return { url: state.url!, observation: saved?.observation ?? null, evidenceRef: saved?.row.id ?? null };
      });
    },
    async observe(ref: ExecutionRef, raw: unknown, signal?: AbortSignal) {
      const { callId, observation } = chatWebReadRecordSchema.parse(raw);
      return access(ref, callId, "admission", async (state) => {
        signal?.throwIfAborted();started(state, ref);
        const existing = await stored(state), contentHash = digest(state.url!, observation);
        if (existing) {
          if (existing.row.contentHash !== contentHash) throw new ConflictError("同一网页调用已有不同观察");
          return { evidenceRef: existing.row.id, observation: existing.observation };
        }
        const rows = await state.tx.select({ bytes: executionEvidence.byteLength }).from(executionEvidence).where(eq(executionEvidence.executionTaskId, state.task.id));
        const byteLength = Buffer.byteLength(observation.text, "utf8");
        if (rows.reduce((total, row) => total + row.bytes, 0) + byteLength > 8 * 1024 * 1024) throw new ConflictError("任务网页正文超过 8 MiB 限制");
        const id = `evidence-${randomUUID()}`;
        signal?.throwIfAborted();
        await state.tx.insert(executionEvidence).values({ id, executionTaskId: state.task.id, originCallId: callId, requestedUrl: state.url!, sourceUrl: observation.finalUrl, title: observation.title, fullText: observation.text, contentHash, byteLength, createdAt: now(), metadata: { kind: "chat.web.read", inputDigest: state.bound.inputDigest, extractor: observation.extractor, extractPath: observation.extractPath, turnCount: observation.turnCount } });
        return { evidenceRef: id, observation };
      });
    },
    async complete(ref: ExecutionRef, raw: unknown, signal?: AbortSignal) {
      const { callId } = chatWebReadCallSchema.parse(raw);
      const completed = await access(ref, callId, "settlement", async (state) => state.parent.status === "settled" ? receipt(state.parent) : null);
      if (completed) return completed;
      signal?.throwIfAborted();
      try {
      const state = await access(ref, callId, "admission", async (state) => {
        signal?.throwIfAborted();started(state, ref); const saved = await stored(state);
        if (!saved) throw new ConflictError("网页尚未保存可恢复观察");
        return { context: state.context, bound: state.bound, ...saved };
      });
      const operationKey = `chat.web.read:${callId}:${state.row.contentHash}`;
      const documents = createPendingDocumentService({ db, objectStorageForCtx: deps.objectStorageForCtx, now,
        authorize: async (context, key, tx) => {
          signal?.throwIfAborted();
          if (key !== operationKey || context.userId !== state.context.userId || context.accountId !== state.context.accountId) throw new ConflictError("正文提交归属不符");
          await access(ref, callId, "admission", async (latest) => {
            signal?.throwIfAborted();started(latest, ref); const saved = await stored(latest);
            if (saved?.row.contentHash !== state.row.contentHash || latest.bound.inputDigest !== state.bound.inputDigest) throw new ConflictError("正文提交期间网页身份改变");
            signal?.throwIfAborted();
          }, tx as unknown as Db);
        },
      });
      signal?.throwIfAborted();
      const saved = await documents.submit(state.context, { operationKey, name: `正文·${(state.observation.title || state.observation.finalUrl).slice(0, 40)}`, sourceUrl: state.row.requestedUrl, fullText: state.observation.text }, signal);
      const current = await deps.assets.getAsset(state.context, saved.assetId);
      const files = await deps.assets.listFilesByIds(state.context, [saved.fileId]);
      const file = files.find((file) => file.id === current.currentFileId && file.assetId === current.id);
      let output;
      if (!["pending", "active"].includes(current.status) || !file || file.extractedText !== state.observation.text || (file.mediaMetadata as Record<string, unknown>)?.sourceUrl !== state.row.requestedUrl) {
        output = agenticToolOutcomeSchema.parse({ status: "error", summary: "原正文素材已改变，请重新确认素材状态", evidence: [], data: { kind: "web.read", asset: null, needLogin: null, error: "原正文素材已改变，请重新确认素材状态", text: null, window: null, hasMore: false }, error: { code: "no_evidence", retryable: false, recovery: "检查原素材当前状态" }, continuation: null, sideEffect: "committed" });
      } else {
        const previewUrl = await deps.assets.getDownloadUrl(state.context, saved.assetId).then((result) => result.url).catch(() => null);
        const read = state.observation;
        const prototype = buildChatTools(["web.read"], { readWeb: async () => ({ needLogin: false, assetId: saved.assetId, name: current.name, previewUrl, sourceUrl: state.row.requestedUrl, title: read.title, excerpt: read.text.slice(0, 280), extractor: read.extractor, turnCount: read.turnCount, extraction: read.turnCount === null ? null : read.extractPath === "ssr" ? `抽到 ${read.turnCount} 轮对话(SSR 全量,长对话不截断)` : `抽到 ${read.turnCount} 轮对话(DOM 渲染抽取,超长对话可能不全)`, fullText: read.text, fromCache: false }) } as unknown as ChatToolDeps)["web.read"]!;
        const data = z.json().parse(JSON.parse(JSON.stringify(await getChatToolNativeExecutor(prototype)!({ ...(state.bound.input as Record<string, unknown>), url: state.row.requestedUrl }, {}))));
        const projected = z.object({ text: z.string(), window: z.object({ offset: z.number(), length: z.number(), total: z.number() }), hasMore: z.boolean() }).parse(data);
        output = agenticToolOutcomeSchema.parse({ status: "ok", summary: "已读取网页正文，素材待用户确认", evidence: [{ entityId: state.row.id, version: state.row.contentHash, sourceUrl: state.row.requestedUrl, title: state.row.title, text: projected.text }], data, error: null, continuation: projected.hasMore ? { evidenceRef: state.row.id, nextOffset: projected.window.offset + projected.window.length, totalChars: projected.window.total } : null, sideEffect: "committed" });
      }
      const resultText = JSON.stringify(workerToolResultReceiptSchema.parse({ schemaVersion: 1, kind: "tool", toolCallId: state.bound.toolCallId, toolName: state.bound.toolName, output }));
      return await access(ref, callId, "settlement", async (latest) => {
        if (latest.parent.status === "settled") return receipt(latest.parent);
        started(latest, ref);
        if (latest.bound.inputDigest !== state.bound.inputDigest) throw new ConflictError("网页结算执行权改变");
        const settled = await createExecutionCallLedgerService(latest.tx as unknown as Db, deps).settle(ref, callId, { status: "settled", usage: { totalTokens: 0 }, resultText });
        return receipt(settled);
      });
      } catch (error) {
        // 并发提交可能在授权或结算处失去执行权；只重放同任务的已持久回执。
        const replay = await access(ref, callId, "settlement", async (latest) => latest.parent.status === "settled" ? receipt(latest.parent) : null);
        if (replay) return replay;
        throw error;
      }
    },
  };
}
