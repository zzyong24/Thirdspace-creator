// 审核门表的单一真值在共享 infra(backend/src/schema/review-gate.ts)——
// createDb() 的迁移(0020_review_gate.sql)在初始化时建表(与 reviews 模块同一约定:
// canonical defs 落 shared infra,模块只 re-export,保证 ONE source of truth)。
export {
  reviewRules,
  scriptReviewReports,
  REVIEW_GATE_DDL,
} from "../../schema/review-gate";
