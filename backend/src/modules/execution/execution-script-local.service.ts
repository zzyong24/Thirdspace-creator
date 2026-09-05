import { createHash } from "node:crypto";
import { z } from "zod";
import {and,eq,aiTasks,type Db} from "@creatoros/backend";
import {
  structuredGenerationInputSchema,
  workerStructuredResultSchema,
  workerPortInputSchemas,
  type ExecutionRef,
} from "@creatoros/contract/execution-worker";
import { scriptDraftSchema } from "@creatoros/ai-worker";
import { createExecutionLeaseService } from "./execution-lease.service";
import { createExecutionCallLedgerService } from "./execution-call-ledger.service";
import { ConflictError } from "./execution.errors";
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const verbatimSchema = z
  .object({
    artifactId: z.string().min(1),
    mode: z.literal("verbatim"),
    sourceText: z.string().min(1).max(200000),
    sourceRef: z.string().min(1),
    sourceLength: z.number().int().positive(),
    sourceSha256: z.string(),
  })
  .strict();
/** 只处理冻结原文/既有口播的确定性产物，无外部动作、模型或领域写入。 */
export function createExecutionScriptLocalService(
  db: Db,
  deps: Parameters<typeof createExecutionCallLedgerService>[1],
) {
  const leases = createExecutionLeaseService(db, deps),
    ledger = createExecutionCallLedgerService(db, deps);
  const read = async (ref: ExecutionRef) =>
    leases.withLease(ref, "admission", async ({ task, context }) => {
      const input = structuredGenerationInputSchema.parse(
        (task.payload as { modelInput?: unknown }).modelInput,
      );
      if (
        task.kind !== "ai_task" ||
        input.skillId !== "script.draft" ||
        input.skillSnapshot.userId !== context.userId ||
        input.skillSnapshot.accountId !== context.accountId
      )
        throw new ConflictError("当前任务不是所属文稿执行");
      return input;
    });
  async function persist(ref: ExecutionRef, key: string, text: string, preparedInput?:z.infer<typeof structuredGenerationInputSchema>, scopedLedger=ledger) {
    const input = preparedInput ?? await read(ref);
    const call = await scopedLedger.reserve(ref, {
      kind: "tool",
      operationKey: `${input.operationKey}/${key}`,
      inputDigest: `sha256:${hash(text)}`,
      reservedTokens: 0,
    });
    if (call.status === "reserved") await scopedLedger.start(ref, call.id);
    // started也可重做这段纯计算；没有供应商提交或领域副作用需要猜测。
    if (!["reserved", "started", "settled"].includes(call.status))
      throw new ConflictError("本地产物账本状态不符");
    await scopedLedger.settle(ref, call.id, {
      status: "settled",
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      resultText: text,
    });
    return { callId: call.id, text };
  }
  return {
    async prepareImport(ref: ExecutionRef, raw: unknown) {
      workerPortInputSchemas.prepareScriptImport.parse(raw);
      const input = await read(ref),
        source = verbatimSchema.parse(
          JSON.parse(input.facets.__scriptVerbatim ?? "null"),
        );
      if (
        source.sourceLength !== source.sourceText.length ||
        source.sourceSha256 !== hash(source.sourceText) ||
        !source.sourceText.trim()
      )
        throw new ConflictError("原文快照校验失败");
      const text = JSON.stringify(
        workerStructuredResultSchema.parse({
          object: { verbatim: true },
          generation: {
            finishReason: "deterministic_import",
            usage: {
              inputTokens: 0,
              outputTokens: 0,
              cachedTokens: 0,
              totalTokens: 0,
            },
            attempts: [],
          },
        }),
      );
      return persist(ref, "verbatim", text);
    },
    async saveFallback(ref: ExecutionRef, raw: unknown) {
      const {text}=workerPortInputSchemas.saveScriptFallback.parse(raw);
      return leases.withLease(ref,"admission",async({tx,task,context})=>{
        const input=structuredGenerationInputSchema.parse((task.payload as {modelInput?:unknown}).modelInput);
        const [business]=await tx.select().from(aiTasks).where(and(eq(aiTasks.id,task.ownerId),eq(aiTasks.executionTaskId,task.id),eq(aiTasks.userId,context.userId),eq(aiTasks.accountId,context.accountId!))).for("update");
        if(task.kind!=="ai_task" || task.ownerType!=="ai_task" || input.skillId!=="script.draft" || input.skillSnapshot.userId!==context.userId || input.skillSnapshot.accountId!==context.accountId || business?.taskType!=="script.draft")throw new ConflictError("当前任务不是所属文稿执行");
        const initial=(JSON.parse(input.facets.__scriptDraft ?? "null") as {initialVoiceover?:{voiceover?:string;sha256?:string;charCount?:number;storyboardAttemptCount?:number}}|null)?.initialVoiceover;
        const validate=(candidateText:string)=>{
          const result=workerStructuredResultSchema.parse(JSON.parse(candidateText));
          const {shots}=scriptDraftSchema.parse(result.object);
          const joined=shots.map(shot=>shot.口播).join("");
          if(!initial?.voiceover || !initial.storyboardAttemptCount || initial.voiceover!==joined || initial.charCount!==joined.length || initial.sha256!==hash(joined) || result.generation.finishReason!=="deterministic_fallback" || result.validation?.status!=="partial")throw new ConflictError("本地分镜必须复用已冻结的完整口播");
        };
        validate(text);
        const scopedLedger=createExecutionCallLedgerService(tx as unknown as Db,deps);
        const calls=(await scopedLedger.inspect(ref)).calls;
        if(calls.some(call=>call.kind==="model"))throw new ConflictError("已有模型调用必须沿其真实回执提交");
        const previous=calls.find(call=>call.operationKey===`${input.operationKey}/frozen-fallback`);
        if(previous?.status==="settled"){
          if(previous.kind!=="tool" || !previous.resultText || previous.inputDigest!==`sha256:${hash(previous.resultText)}`)throw new ConflictError("本地历史回执不完整");
          validate(previous.resultText);
          return {callId:previous.id,text:previous.resultText};
        }
        return persist(ref,"frozen-fallback",text,input,scopedLedger);
      });
    },
  };
}
