// 审核门模块(T-086)—— 唯一公共入口(foundation §1 / MODULE-ARCH §2)。composite
// transport 只经本文件 import(不碰内部):service + repository 工厂(在 shared db 上构造,
// 注入 AI 触发端口)、transport 工厂 + op-id 列表、REVIEW_GATE_DDL、契约 DTO、错误类。
//
// 本模块拥有 6 个契约 op:reviewRules.list/create/patch/delete + scriptReviews.getLatest/trigger。
// 触发 op 经注入的 ReviewGateAiPort 起 ai_task(taskType=script.review),零跨模块 repo import。

export {
  createReviewGateService,
  type ReviewGateService,
  type ServiceDeps,
  type ReviewGateAiPort,
  type LintRuleDto,
} from "./review-gate.service";

export {
  createReviewGateRepository,
  type ReviewGateRepository,
  type RepoDeps,
  type ReviewRuleRow,
  type ScriptReviewReportRow,
  type CreateReportInput,
} from "./review-gate.repository";

export {
  createReviewGateTransport,
  REVIEW_GATE_OP_IDS,
} from "./review-gate.transport";

export { REVIEW_GATE_DDL } from "./review-gate.db-schema";

export {
  OwnershipError,
  ValidationError,
  ReportNotFoundError,
  UnsupportedOperationError,
  AuthenticationError,
} from "./review-gate.errors";

export {
  reviewRuleResource,
  scriptReviewReportResource,
  toReviewRuleDto,
  toScriptReviewReportDto,
  type ReviewRuleResource,
  type ScriptReviewReportResource,
} from "./review-gate.schema";

export {
  buildReviewRuleSeedRows,
  REVIEW_RULE_SEED_COUNTS,
} from "./review-rules.seed";

export {createWorkReviewsService,type WorkReviewsService,type WorkReviewPorts} from "./work-reviews.service";
export {createWorkReviewsTransport,WORK_REVIEW_OP_IDS} from "./work-reviews.transport";
export {createExecutionWorkReviewService} from "./execution-work-review.service";
export {createWorkReviewTaskPorts,createWorkReviewBusinessAdapter} from "./work-review-task-adapter";
export {freezeReview,type FrozenReviewContext} from "./work-review-fingerprint";

export {createWorkReviewReader,type ReviewOwners,type ReviewReaderPorts} from "./work-review-read-current";
