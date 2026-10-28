import type { Endpoint, RequestContext, Transport } from "@creatoros/contract";
import {
  AuthenticationError,
  UnsupportedOperationError,
} from "./review-gate.errors";
import type { ReviewGateService } from "./review-gate.service";

// 审核门 transport(T-086,foundation §5.4)—— 本模块 6 个契约 op 走真 SQL,挂同一
// /api/v1/dispatch。照 reviews transport:switch endpoint.id、thread ctx 进 service、
// 返回单资源信封。持久化 op 无 ctx = 未认证 dispatch → AuthenticationError(→401)。
// 非本模块 op 抛 UnsupportedOperationError,让 composite 不掩真错。
//
// REVIEW_GATE_OP_IDS 是本模块所有权登记表;persistence-client 据它建 PERSISTED_OPS
// (加模块 = 注册它)。

export const REVIEW_GATE_OP_IDS = [
  "reviewRules.list",
  "reviewRules.create",
  "reviewRules.patch",
  "reviewRules.delete",
  "scriptReviews.getLatest",
  "scriptReviews.trigger",
] as const;

type Input = { params?: unknown; body?: unknown };

export function createReviewGateTransport(
  serviceFactory: () => ReviewGateService,
): Transport {
  return {
    async request(endpoint: Endpoint, input, ctx) {
      if (!ctx) throw new AuthenticationError();
      const service = serviceFactory();
      const requestId = (ctx as RequestContext).requestId;
      const meta = { requestId };
      const { params, body } = (input ?? {}) as Input;
      const p = (params ?? {}) as { ruleId?: string; projectId?: string };

      switch (endpoint.id) {
        case "reviewRules.list": {
          const rules = await service.listRules(ctx);
          // 此入口没有分页query，返回的是完整规则集；空列表仍需合法的列表信封。
          return { data: rules, meta: { ...meta, page: 1, pageSize: Math.max(1, rules.length), total: rules.length } };
        }
        case "reviewRules.create": {
          const b = (body ?? {}) as Parameters<
            ReviewGateService["createRule"]
          >[1];
          const rule = await service.createRule(ctx, b);
          return { data: rule, meta };
        }
        case "reviewRules.patch": {
          const b = (body ?? {}) as Parameters<
            ReviewGateService["patchRule"]
          >[2];
          const rule = await service.patchRule(ctx, p.ruleId ?? "", b);
          return { data: rule, meta };
        }
        case "reviewRules.delete": {
          const res = await service.deleteRule(ctx, p.ruleId ?? "", (body??{}) as {confirmSharedImpact?:boolean});
          return { data: res, meta };
        }
        case "scriptReviews.getLatest": {
          const report = await service.getLatestReport(ctx, p.projectId ?? "");
          return { data: report, meta };
        }
        case "scriptReviews.trigger": {
          const task = await service.triggerReview(ctx, p.projectId ?? "");
          return { data: task, meta };
        }
        default:
          throw new UnsupportedOperationError(endpoint.id);
      }
    },
  };
}
