import type { RequestContext } from "@creatoros/contract";
import type { Db } from "@creatoros/backend";
import {lockWorkspaceMembership} from "../platform-account/membership-lock.service";
import {
  createReviewGateRepository,
  type ReviewGateRepository,
  type RepoDeps,
  type CreateReportInput,
} from "./review-gate.repository";
import {
  toReviewRuleDto,
  toScriptReviewReportDto,
  type ReviewRuleResource,
  type ScriptReviewReportResource,
} from "./review-gate.schema";
import { ReportNotFoundError, ValidationError } from "./review-gate.errors";

// 审核门 service(T-086,SPEC §1/§2)—— 每个公共方法收 (ctx, …),据 ctx.userId 构造
// user-scoped 仓储(结构化归属)。承载:
//   - 规则库 CRUD(list/create/patch/delete),其中「AI 绝不自动写 active」的守卫在此:
//     source='retro' 的创建强制落 status='candidate'(复盘回流只入候选态,用户采纳才 active);
//   - active 规则供 lint 引擎消费(listActiveLintRules,给 frontend runner 拉 word/regex 词表);
//   - 审核报告读写(getLatest 无 → ReportNotFoundError→404,前端诚实显「未审」;write 由 runner
//     经 saveReport 落 script_review_reports)。
// 无跨模块 repo import:报告只绑 projectId + artifactVersion(项目归属门在触发路径的 AI 端口侧,
// 与既有 review.analyze 一致 —— 由 composition root 注入的 aiService 创建 ai_tasks 时已 scoped)。

/** lint 引擎消费的 active 规则(word/regex 词表最小投影)。 */
export interface LintRuleDto {
  id: string;
  tier: "official_hard" | "empirical" | "doudplus";
  category: string;
  matchType: "word" | "regex";
  pattern: string;
  replacement: string | null;
  note: string;
}

/** AI 触发端口(composition 期由 aiService 满足)—— 起一个 script.review ai_task。 */
export interface ReviewGateAiPort {
  createTask(
    ctx: RequestContext,
    body: {
      taskType: string;
      attemptId?: string;
      inputData?: Record<string, unknown>;
    },
  ): Promise<unknown>;
}

/** 当前稿件引用端口；审核任务创建时冻结版本，避免排队期间拿新稿冒充旧 attempt。 */
export interface ReviewGateScriptPort {
  getCurrentScriptRef(
    ctx: RequestContext,
    projectId: string,
  ): Promise<{ artifactId: string | null; artifactVersion: number }>;
}

export interface ServiceDeps {
  db: Db;
  now: () => string;
  nextId: (prefix: string) => string;
  ai: ReviewGateAiPort;
  script: ReviewGateScriptPort;
}

export interface ReviewGateService {
  // ── 规则库(§1/§4)──
  listRules(ctx: RequestContext): Promise<ReviewRuleResource[]>;
  createRule(
    ctx: RequestContext,
    body: {
      tier: "official_hard" | "empirical" | "doudplus";
      category: string;
      matchType: "word" | "regex";
      pattern: string;
      replacement?: string | null;
      note?: string;
      source?: "manual" | "retro";
      status?: "active" | "candidate" | "disabled";
    },
  ): Promise<ReviewRuleResource>;
  patchRule(
    ctx: RequestContext,
    ruleId: string,
    body: {
      status?: "active" | "candidate" | "disabled";
      pattern?: string;
      replacement?: string | null;
      note?: string;
      category?: string;
      confirmSharedImpact?: boolean;
    },
  ): Promise<ReviewRuleResource>;
  deleteRule(
    ctx: RequestContext,
    ruleId: string,
    options?: {confirmSharedImpact?: boolean},
  ): Promise<{ id: string; deleted: true }>;

  // ── lint 词表(供 frontend script-review-runner 拉 active 规则跑 L1)──
  listActiveLintRules(ctx: RequestContext): Promise<LintRuleDto[]>;

  // ── 审核报告(§2)──
  getLatestReport(
    ctx: RequestContext,
    projectId: string,
  ): Promise<ScriptReviewReportResource>;
  // runner 落报告(经 composition root 注入到 script-review-runner)。
  saveReport(
    ctx: RequestContext,
    input: CreateReportInput,
  ): Promise<ScriptReviewReportResource>;
  // 触发一次审核:起 script.review ai_task(dispatch 后台跑 L1+L2 → saveReport)。
  triggerReview(ctx: RequestContext, projectId: string): Promise<unknown>;
}

export function createReviewGateService(deps: ServiceDeps): ReviewGateService {
  const { db, now, nextId, ai, script } = deps;

  function repoFor(ctx: RequestContext, store:Db=db): ReviewGateRepository {
    const repoDeps: RepoDeps = { now, nextId, userId: ctx.userId, groupId:ctx.groupId };
    return createReviewGateRepository(store, repoDeps);
  }
  async function writeRule<T>(ctx:RequestContext,run:(repo:ReviewGateRepository)=>Promise<T>):Promise<T>{
    if(!ctx.groupId)throw new ValidationError("请选择真实账号组后编辑审稿规则");
    return db.transaction(async tx=>{await lockWorkspaceMembership(tx,ctx);return run(repoFor(ctx,tx as unknown as Db));});
  }
  async function assertSharedConfirmed(repo:ReviewGateRepository,id:string,confirmed?:boolean){
    const row=(await repo.listRules()).find(rule=>rule.id===id);
    if(row&&!row.groupId&&!confirmed)throw new ValidationError("这是系统/历史共享规则，修改或删除会影响所有账号组；请明确确认共享影响");
  }

  // regex 规则的 pattern 必须可编译(建/改时守卫,坏 regex → 400 而非运行时静默跳过)。
  function assertRegexCompiles(matchType: string, pattern: string): void {
    if (matchType !== "regex") return;
    try {
      // eslint-disable-next-line no-new
      new RegExp(pattern);
    } catch (err) {
      throw new ValidationError(
        `ValidationError: 非法 regex pattern: ${(err as Error).message}`,
      );
    }
  }

  return {
    async listRules(ctx) {
      const rows = await repoFor(ctx).listRules();
      return rows.map(toReviewRuleDto);
    },

    async createRule(ctx, body) {
      assertRegexCompiles(body.matchType, body.pattern);
      const source = body.source ?? "manual";
      // 铁律(SPEC §1):复盘回流(retro)只入候选态,AI 绝不自动写 active。手动建则遵用户给的
      // status(缺省 active)。
      const status =
        source === "retro" ? "candidate" : (body.status ?? "active");
      return writeRule(ctx,async repo=>{const row = await repo.createRule({
        tier: body.tier,
        category: body.category,
        matchType: body.matchType,
        pattern: body.pattern,
        replacement: body.replacement ?? null,
        note: body.note ?? "",
        source,
        status,
      });
      return toReviewRuleDto(row);
      });
    },

    async patchRule(ctx, ruleId, body) {
      return writeRule(ctx,async repo=>{
      await assertSharedConfirmed(repo,ruleId,body.confirmSharedImpact);
      if (body.pattern !== undefined) {
        // 改 pattern 时若该规则是 regex,校验可编译(取旧行判 matchType)。
        const rows = await repo.listRules();
        const target = rows.find((r) => r.id === ruleId);
        if (target) assertRegexCompiles(target.matchType, body.pattern);
      }
      const row = await repo.patchRule(ruleId, body);
      return toReviewRuleDto(row);
      });
    },

    async deleteRule(ctx, ruleId, options) {
      return writeRule(ctx,async repo=>{
      await assertSharedConfirmed(repo,ruleId,options?.confirmSharedImpact);
      await repo.deleteRule(ruleId);
      return { id: ruleId, deleted: true as const };
      });
    },

    async listActiveLintRules(ctx) {
      const rows = await repoFor(ctx).listActiveRules();
      return rows.map((r) => ({
        id: r.id,
        tier: r.tier as LintRuleDto["tier"],
        category: r.category,
        matchType: r.matchType as LintRuleDto["matchType"],
        pattern: r.pattern,
        replacement: r.replacement ?? null,
        note: r.note,
      }));
    },

    async getLatestReport(ctx, projectId) {
      const row = await repoFor(ctx).getLatestReport(projectId);
      if (!row) {
        throw new ReportNotFoundError(
          `no script review report for project: ${projectId}`,
        );
      }
      return toScriptReviewReportDto(row);
    },

    async saveReport(ctx, input) {
      const row = await repoFor(ctx).insertReport(input);
      return toScriptReviewReportDto(row);
    },

    async triggerReview(ctx, projectId) {
      if (!projectId) {
        throw new ValidationError("ValidationError: projectId 必填");
      }
      const current = await script.getCurrentScriptRef(ctx, projectId);
      // 起 script.review ai_task —— dispatch 后台跑 L1 lint + L2 语义审后 saveReport。
      // 项目归属门在 aiService.createTask 内(user-scoped),与 review.analyze 一致。
      return ai.createTask(ctx, {
        taskType: "script.review",
        // 每次明确点击/对话调用都是一个新 attempt；同版本失败后可真正重试，不再永久命中旧任务。
        // 传输层若未来开放直接调用，应由请求 body 携带动作 attempt；当前所有生产入口均为
        // 服务端一次性执行，nextId 在本次动作边界只生成一次。
        attemptId: nextId("review-attempt"),
        inputData: {
          projectId,
          artifactId: current.artifactId,
          artifactVersion: current.artifactVersion,
        },
      });
    },
  };
}
