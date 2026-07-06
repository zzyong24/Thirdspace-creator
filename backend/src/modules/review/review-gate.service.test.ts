import { describe, it, expect, beforeEach, vi } from "vitest";
import { createDb, type Db } from "@creatoros/backend";
import type { RequestContext } from "@creatoros/contract";
import {
  createReviewGateService,
  type ReviewGateService,
  type ReviewGateAiPort,
} from "./review-gate.service";
import { ReportNotFoundError, ValidationError } from "./review-gate.errors";
import { OwnershipError } from "@creatoros/backend";

// 审核门 service 测(T-145 F47)—— 真实 pglite db(createDb 跑迁移建 review_rules /
// script_review_reports)+ 确定性 now/nextId + stub ai port。覆盖审核门真实行为:
//   §1 规则库:retro 强制 candidate(AI 绝不自动写 active 铁律)、manual 默认 active、
//              显式 status、坏 regex → 400、patch 改 regex 校验编译、跨用户/未知 id → 404;
//   §2 报告:无报告 → 404 语义、多份取最新、save 落库+DTO;
//   触发:空 projectId → 400、正常起 script.review ai_task。
// user-scoped 隔离用双 ctx 交叉验证(A 建的规则/报告 B 读不到)。

const NOW = "2026-07-05T00:00:00.000Z";
const ctxA: RequestContext = { userId: "user-a", requestId: "r1", source: "user" };
const ctxB: RequestContext = { userId: "user-b", requestId: "r2", source: "user" };

function fakeAi(): ReviewGateAiPort & { createTask: ReturnType<typeof vi.fn> } {
  return {
    createTask: vi.fn(async () => ({ id: "ai-task-1", taskType: "script.review" })),
  };
}

function makeService(
  db: Db,
  ai?: ReturnType<typeof fakeAi>,
): { service: ReviewGateService; ai: ReturnType<typeof fakeAi> } {
  const aiPort = ai ?? fakeAi();
  let seq = 0;
  const service = createReviewGateService({
    db,
    now: () => NOW,
    nextId: (prefix: string) => `${prefix}-${++seq}`,
    ai: aiPort,
  });
  return { service, ai: aiPort };
}

describe("review-gate service", () => {
  let db: Db;
  beforeEach(async () => {
    ({ db } = await createDb());
  });

  // ── §1 规则库:采纳门铁律(AI 绝不自动写 active)──────────────────────────
  describe("createRule 采纳门(§1 铁律)", () => {
    it("source='retro' 强制落 candidate —— 即便显式传 status:'active' 也被覆盖", async () => {
      const { service } = makeService(db);
      const rule = await service.createRule(ctxA, {
        tier: "empirical",
        category: "降权词",
        matchType: "word",
        pattern: "保姆级",
        source: "retro",
        status: "active", // 显式请求 active —— 铁律必须无视它
      });
      expect(rule.source).toBe("retro");
      expect(rule.status).toBe("candidate");
    });

    it("source 缺省 → 'manual';status 缺省 → 'active'", async () => {
      const { service } = makeService(db);
      const rule = await service.createRule(ctxA, {
        tier: "empirical",
        category: "营销词",
        matchType: "word",
        pattern: "割韭菜",
      });
      expect(rule.source).toBe("manual");
      expect(rule.status).toBe("active");
    });

    it("source='manual' 时尊重用户显式 status", async () => {
      const { service } = makeService(db);
      const rule = await service.createRule(ctxA, {
        tier: "empirical",
        category: "营销词",
        matchType: "word",
        pattern: "限时",
        source: "manual",
        status: "disabled",
      });
      expect(rule.status).toBe("disabled");
    });

    it("replacement/note 缺省 → null / 空串(mapper 不裸传)", async () => {
      const { service } = makeService(db);
      const rule = await service.createRule(ctxA, {
        tier: "empirical",
        category: "降权词",
        matchType: "word",
        pattern: "全网最全",
      });
      expect(rule.replacement).toBeNull();
      expect(rule.note).toBe("");
    });
  });

  // ── §1 regex 守卫:坏 pattern 建/改时 → 400,不落库、不运行时静默跳 ─────────
  describe("regex 编译守卫", () => {
    it("createRule matchType='regex' 且 pattern 非法 → ValidationError,不落库", async () => {
      const { service } = makeService(db);
      await expect(
        service.createRule(ctxA, {
          tier: "official_hard",
          category: "导流",
          matchType: "regex",
          pattern: "([unclosed", // 非法 regex
        }),
      ).rejects.toBeInstanceOf(ValidationError);
      // 未落库
      const rules = await service.listRules(ctxA);
      expect(rules).toHaveLength(0);
    });

    it("createRule matchType='word' 即便 pattern 含正则元字符也不校验(当字面子串)", async () => {
      const { service } = makeService(db);
      const rule = await service.createRule(ctxA, {
        tier: "empirical",
        category: "其他",
        matchType: "word",
        pattern: "([unclosed", // word 不编译,合法
      });
      expect(rule.pattern).toBe("([unclosed");
    });

    it("patchRule 改 regex 规则的 pattern 为非法值 → ValidationError", async () => {
      const { service } = makeService(db);
      const rule = await service.createRule(ctxA, {
        tier: "official_hard",
        category: "导流",
        matchType: "regex",
        pattern: "V\\s*信",
      });
      await expect(
        service.patchRule(ctxA, rule.id, { pattern: "([bad" }),
      ).rejects.toBeInstanceOf(ValidationError);
    });

    it("patchRule 改 word 规则的 pattern 为正则元字符 → 放行(word 不校验)", async () => {
      const { service } = makeService(db);
      const rule = await service.createRule(ctxA, {
        tier: "empirical",
        category: "其他",
        matchType: "word",
        pattern: "foo",
      });
      const patched = await service.patchRule(ctxA, rule.id, { pattern: "([bad" });
      expect(patched.pattern).toBe("([bad");
    });
  });

  // ── §1 归属门:跨用户/未知 id → 404(OwnershipError),绝不泄露存在性 ───────
  describe("归属门(user-scoped,→404)", () => {
    it("patchRule 未知 ruleId → OwnershipError", async () => {
      const { service } = makeService(db);
      await expect(
        service.patchRule(ctxA, "rrule-nonexistent", { status: "disabled" }),
      ).rejects.toBeInstanceOf(OwnershipError);
    });

    it("patchRule 跨用户 ruleId → OwnershipError(B 不能改 A 的规则)", async () => {
      const { service } = makeService(db);
      const aRule = await service.createRule(ctxA, {
        tier: "empirical",
        category: "营销词",
        matchType: "word",
        pattern: "割韭菜",
      });
      await expect(
        service.patchRule(ctxB, aRule.id, { status: "disabled" }),
      ).rejects.toBeInstanceOf(OwnershipError);
      // A 的规则未被改动
      const stillRules = await service.listRules(ctxA);
      expect(stillRules[0]!.status).toBe("active");
    });

    it("deleteRule 跨用户 ruleId → OwnershipError,原规则仍在", async () => {
      const { service } = makeService(db);
      const aRule = await service.createRule(ctxA, {
        tier: "empirical",
        category: "营销词",
        matchType: "word",
        pattern: "割韭菜",
      });
      await expect(
        service.deleteRule(ctxB, aRule.id),
      ).rejects.toBeInstanceOf(OwnershipError);
      expect(await service.listRules(ctxA)).toHaveLength(1);
    });

    it("deleteRule 自己的规则 → 返回 {id, deleted:true} 且真的删除", async () => {
      const { service } = makeService(db);
      const rule = await service.createRule(ctxA, {
        tier: "empirical",
        category: "营销词",
        matchType: "word",
        pattern: "割韭菜",
      });
      const res = await service.deleteRule(ctxA, rule.id);
      expect(res).toEqual({ id: rule.id, deleted: true });
      expect(await service.listRules(ctxA)).toHaveLength(0);
    });

    it("patchRule 未知 id 在 regex 校验前就走归属门(不因 pattern 未校验而漏过)", async () => {
      const { service } = makeService(db);
      // 未知 id + 合法 pattern:仍应 404(归属门优先于落库)
      await expect(
        service.patchRule(ctxA, "rrule-nonexistent", { pattern: "合法子串" }),
      ).rejects.toBeInstanceOf(OwnershipError);
    });
  });

  // ── listRules / listActiveLintRules:分层 + user-scoped 隔离 ─────────────
  describe("规则列表(user-scoped 隔离)", () => {
    it("listActiveLintRules 只吐 active 规则的 lint 最小投影", async () => {
      const { service } = makeService(db);
      await service.createRule(ctxA, {
        tier: "empirical",
        category: "营销词",
        matchType: "word",
        pattern: "active-word",
        status: "active",
      });
      await service.createRule(ctxA, {
        tier: "empirical",
        category: "营销词",
        matchType: "word",
        pattern: "candidate-word",
        source: "retro", // → candidate
      });
      await service.createRule(ctxA, {
        tier: "empirical",
        category: "营销词",
        matchType: "word",
        pattern: "disabled-word",
        status: "disabled",
      });
      const lint = await service.listActiveLintRules(ctxA);
      expect(lint.map((r) => r.pattern)).toEqual(["active-word"]);
      // 最小投影字段齐
      expect(lint[0]).toMatchObject({
        tier: "empirical",
        category: "营销词",
        matchType: "word",
        pattern: "active-word",
      });
    });

    it("A 的规则 B 完全读不到(listRules / listActiveLintRules 都 scoped)", async () => {
      const { service } = makeService(db);
      await service.createRule(ctxA, {
        tier: "empirical",
        category: "营销词",
        matchType: "word",
        pattern: "a-only",
      });
      expect(await service.listRules(ctxB)).toHaveLength(0);
      expect(await service.listActiveLintRules(ctxB)).toHaveLength(0);
      expect(await service.listRules(ctxA)).toHaveLength(1);
    });
  });

  // ── §2 审核报告:无报告 → 404 语义、多份取最新、save 落库+DTO ──────────────
  describe("审核报告(§2)", () => {
    it("getLatestReport 无报告 → ReportNotFoundError(→404,前端诚实显未审)", async () => {
      const { service } = makeService(db);
      await expect(
        service.getLatestReport(ctxA, "project-1"),
      ).rejects.toBeInstanceOf(ReportNotFoundError);
    });

    it("saveReport 落库并回 DTO(user_id 不上 wire)", async () => {
      const { service } = makeService(db);
      const report = await service.saveReport(ctxA, {
        projectId: "project-1",
        artifactId: "art-1",
        artifactVersion: 3,
        verdict: "risk",
        summary: "命中 2 条降权词",
        lintFindings: [{ pattern: "保姆级" }],
        llmFindings: [],
        modelLabel: "非专用审核模型",
      });
      expect(report.verdict).toBe("risk");
      expect(report.artifactVersion).toBe(3);
      expect(report.reviewedAt).toBe(NOW);
      expect(report).not.toHaveProperty("userId");
      // 落库后能取回
      const latest = await service.getLatestReport(ctxA, "project-1");
      expect(latest.id).toBe(report.id);
    });

    it("getLatestReport 多份报告按 reviewedAt 取最新一份", async () => {
      // 用递增时钟区分先后:两份报告 reviewedAt 不同,取较晚者。
      let seq = 0;
      const times = ["2026-07-05T01:00:00.000Z", "2026-07-05T02:00:00.000Z"];
      let clockIdx = 0;
      const service = createReviewGateService({
        db,
        now: () => times[Math.min(clockIdx, times.length - 1)]!,
        nextId: (p: string) => `${p}-${++seq}`,
        ai: fakeAi(),
      });
      clockIdx = 0;
      const first = await service.saveReport(ctxA, {
        projectId: "project-1",
        artifactId: "art-1",
        artifactVersion: 1,
        verdict: "block",
        summary: "旧报告",
        lintFindings: [],
        llmFindings: [],
        modelLabel: "m",
      });
      clockIdx = 1;
      const second = await service.saveReport(ctxA, {
        projectId: "project-1",
        artifactId: "art-1",
        artifactVersion: 2,
        verdict: "pass",
        summary: "新报告",
        lintFindings: [],
        llmFindings: [],
        modelLabel: "m",
      });
      const latest = await service.getLatestReport(ctxA, "project-1");
      expect(latest.id).toBe(second.id);
      expect(latest.summary).toBe("新报告");
      expect(latest.id).not.toBe(first.id);
    });

    it("A 的报告 B 读不到(报告也 user-scoped)", async () => {
      const { service } = makeService(db);
      await service.saveReport(ctxA, {
        projectId: "project-shared-id",
        artifactId: null,
        artifactVersion: 1,
        verdict: "pass",
        summary: "a",
        lintFindings: [],
        llmFindings: [],
        modelLabel: "m",
      });
      // B 用同一 projectId 查 —— 仍 404(归属隔离,不泄露 A 的报告存在)
      await expect(
        service.getLatestReport(ctxB, "project-shared-id"),
      ).rejects.toBeInstanceOf(ReportNotFoundError);
    });
  });

  // ── triggerReview:空 projectId → 400、正常起 script.review ai_task ────────
  describe("triggerReview", () => {
    it("空 projectId → ValidationError,不触发 ai", async () => {
      const { service, ai } = makeService(db);
      await expect(service.triggerReview(ctxA, "")).rejects.toBeInstanceOf(
        ValidationError,
      );
      expect(ai.createTask).not.toHaveBeenCalled();
    });

    it("正常 → 起 script.review ai_task,projectId 进 inputData,透传 ctx", async () => {
      const { service, ai } = makeService(db);
      await service.triggerReview(ctxA, "project-1");
      expect(ai.createTask).toHaveBeenCalledWith(ctxA, {
        taskType: "script.review",
        inputData: { projectId: "project-1" },
      });
    });
  });
});
