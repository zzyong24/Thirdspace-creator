import {assertFrozenWorkspaceMembership} from "../platform-account/membership-lock.service";
import {requireWorkspace,workspaceFilter,assertWritableWorkspace} from "../../workspace-scope";
import {
  and,
  eq,
  aiTasks,
  aiTaskResults,
  executionTasks,
  requireAccountId,
  type Db,
} from "@creatoros/backend";
import type { RequestContext } from "@creatoros/contract";
import type { AiCalibrationPort, AiPositioningPort } from "./ai.service";
import { ConflictError, OwnershipError } from "./ai.errors";
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export interface CalibrationPositioningAdoptionPorts {
  assertSubject(
    ctx: RequestContext,
    type: "content_output" | "publication",
    id: string,
    tx: Tx,
  ): Promise<unknown>;
  createDraftPrediction(
    ctx: RequestContext,
    input: Parameters<AiCalibrationPort["createDraftPrediction"]>[1],
    tx: Tx,
  ): Promise<unknown>;
  predictionLocks?: {confirmBound(ctx:RequestContext,id:string,apply:(tx:Tx)=>Promise<{resultId:string;predictionId:string}|undefined>):Promise<boolean>};
  lockPrediction?(ctx:RequestContext,id:string,tx:Tx):Promise<{id:string;status:string}>;
  lockPositioning(ctx: RequestContext, tx: Tx): Promise<unknown>;
  upsertProfile(
    ctx: RequestContext,
    input: Parameters<AiPositioningPort["upsertProfile"]>[1],
    tx: Tx,
  ): Promise<unknown>;
  createStatementVersion(
    ctx: RequestContext,
    input: Parameters<AiPositioningPort["createStatementVersion"]>[1],
    tx: Tx,
  ): Promise<unknown>;
}
// SEMANTIC_BOUNDARY_ALLOW: 保留旧采纳协议的字段归一、有限数和冻结维度校验，不评价创作内容。
const record = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
const str = (v: unknown) => (typeof v === "string" ? v : "");
const arr = (v: unknown) =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
const num = (v: unknown) =>
  typeof v === "number" && Number.isFinite(v) ? v : null;
export function createCalibrationPositioningAdoptionService(
  db: Db,
  ports: CalibrationPositioningAdoptionPorts,
  now = () => new Date().toISOString(),
) {
  async function confirm(ctx:RequestContext,id:string,tx:Tx,bound=false){
        let lockedReceipt:{resultId:string;predictionId:string}|undefined;
        const [task] = await tx
          .select()
          .from(aiTasks)
          .where(
            and(
              eq(aiTasks.id, id),
              eq(aiTasks.userId, ctx.userId),
              workspaceFilter(aiTasks,ctx),
            ),
          )
          .for("update");
        if (!task) throw new OwnershipError("候选任务不存在");
        await assertFrozenWorkspaceMembership(tx,{userId:task.userId,groupId:task.groupId,accountId:task.accountId,groupVersion:task.groupVersion,membershipVersion:task.membershipVersion});
        if (
          !["calibration.diagnose", "positioning.generate"].includes(
            task.taskType,
          )
        )
          throw new ConflictError("候选任务类型不支持");
        if (task.status === "succeeded") return;
        if (task.status !== "awaiting_confirmation")
          throw new ConflictError("候选当前不可采纳");
        const type =
          task.taskType === "calibration.diagnose"
            ? "calibration_diagnosis"
            : "positioning_profile";
        const rows = await tx
          .select()
          .from(aiTaskResults)
          .where(
            and(
              eq(aiTaskResults.aiTaskId, id),
              eq(aiTaskResults.resultType, type),
            ),
          ).for("update");
        if (rows.length !== 1) throw new ConflictError("候选批次不唯一");
        const data = record(rows[0]!.resultData),
          input = record(task.inputData);
        if (record(data.executionValidation).status === "partial")
          throw new ConflictError("候选尚未完整");
        if (type === "calibration_diagnosis") {
          const subjectType = data.subjectType,
            subjectId = str(data.subjectId),
            rubricVersionId = str(data.rubricVersionId);
          if (
            !["content_output", "publication"].includes(String(subjectType)) ||
            !subjectId ||
            !rubricVersionId ||
            input.subjectId !== subjectId ||
            input.subjectType !== subjectType
          )
            throw new ConflictError("诊断目标与原任务不一致");
          const d = record(data.diagnosis);
          let allowedKeys: Set<string> | undefined;
          if (task.executionTaskId) {
            const [execution] = await tx
              .select()
              .from(executionTasks)
              .where(
                and(
                  eq(executionTasks.id, task.executionTaskId),
                  eq(executionTasks.userId, ctx.userId),
                  workspaceFilter(executionTasks,ctx),
                ),
              );
            if (
              !execution ||
              execution.ownerType !== "ai_task" ||
              execution.ownerId !== task.id ||
              record(execution.payload).aiTaskId !== task.id
            )
              throw new ConflictError("冻结执行映射不属于当前任务");
            const frozenRaw = record(
              record(record(execution.payload).modelInput).facets,
            ).__calibrationDiagnosis;
            let frozen: Record<string, unknown>;
            try {
              frozen = record(JSON.parse(str(frozenRaw)));
            } catch {
              throw new ConflictError("冻结诊断来源无效");
            }
            if (
              frozen.subjectType !== subjectType ||
              frozen.subjectId !== subjectId ||
              frozen.rubricVersionId !== rubricVersionId ||
              !Array.isArray(frozen.rubricKeys)
            )
              throw new ConflictError("诊断不属于冻结执行来源");
            allowedKeys = new Set(arr(frozen.rubricKeys));
          }
          const dimensions = (Array.isArray(d.dimensions) ? d.dimensions : [])
            .map(record)
            .map((m) => ({
              key: str(m.key),
              score: num(m.score),
              reason: str(m.reason),
              suggestion: str(m.suggestion),
            }))
            .filter((m) => m.key && m.score !== null);
          if (allowedKeys && dimensions.some((m) => !allowedKeys.has(m.key)))
            throw new ConflictError("诊断维度不属于冻结规则");
          await ports.assertSubject(
            ctx,
            subjectType as "content_output" | "publication",
            subjectId,
            tx,
          );
          const perf = record(d.performance);
          // 已有task归属与冻结member锁证明同一真实legacy账号；保留旧入口叶子account scope。
          const actualLegacy =
            !ctx.groupId &&
            !!ctx.accountId &&
            task.userId === ctx.userId &&
            task.accountId === ctx.accountId &&
            (task.groupId === null || task.groupId === `grp_legacy_${ctx.accountId}`);
          const prediction=await ports.createDraftPrediction(
            actualLegacy
              ? ctx
              : {
                  ...ctx,
                  userId: task.userId,
                  groupId: task.groupId,
                  accountId: task.accountId,
                  groupVersion: task.groupVersion ?? undefined,
                  membershipVersion: task.membershipVersion ?? undefined,
                },
            {
              subjectType: subjectType as "content_output" | "publication",
              subjectId,
              rubricVersionId,
              predictedConversion: { dimensions },
              predictedMetrics: {
                performance: {
                  完播率: num(perf.完播率),
                  收藏率: num(perf.收藏率),
                  评论率: num(perf.评论率),
                  转化意向: num(perf.转化意向),
                },
                diagnosis: {
                  verdict: str(d.verdict),
                  mainIssues: arr(d.mainIssues),
                  priorityFixes: arr(d.priorityFixes),
                },
              },
              confidence: d.confidence === "high" || d.confidence === "low" ? d.confidence : "med",
            },
            tx,
          );
          if(bound){
            const predictionId=str(record(prediction).id);
            if(!predictionId||!ports.lockPrediction)throw new ConflictError("原卡预测锁定端口缺失");
            const locked=await ports.lockPrediction(ctx,predictionId,tx);
            if(locked.id!==predictionId||locked.status!=="locked")throw new ConflictError("原卡预测未锁定");
            lockedReceipt={resultId:rows[0]!.id,predictionId};
          }
        } else {
          const s = record(data.suggestion),
            rawRules = record(s.downstreamRules),
            rules: Record<string, string> = {};
          for (const key of [
            "topicRule",
            "scriptRule",
            "projectRule",
            "forbidRule",
            "expressionRule",
          ]) {
            const value = str(rawRules[key]).trim();
            if (value) rules[key] = value;
          }
          await ports.lockPositioning(ctx, tx);
          await ports.upsertProfile(
            ctx,
            {
              persona: str(s.persona),
              field: str(s.field),
              audience: str(s.audience),
              differentiation: str(s.differentiation),
              capabilities: arr(s.capabilities),
              ...(Object.keys(rules).length ? { downstreamRules: rules } : {}),
            },
            tx,
          );
          await ports.createStatementVersion(
            ctx,
            {
              oneLiner: str(s.oneLiner),
              keywords: arr(s.keywords),
              productAnchorIds: [],
              createdByType: "ai",
              aiTaskId: id,
            },
            tx,
          );
        }
        await tx
          .update(aiTasks)
          .set({ status: "succeeded", completedAt: now() })
          .where(eq(aiTasks.id, id));
        return lockedReceipt;
  }
  return {async confirmTask(ctx:RequestContext,id:string){
    await assertWritableWorkspace(db,ctx);requireWorkspace(ctx);
    if(await ports.predictionLocks?.confirmBound(ctx,id,tx=>confirm(ctx,id,tx,true)))return;
    await db.transaction(tx=>confirm(ctx,id,tx));
  }};
}
