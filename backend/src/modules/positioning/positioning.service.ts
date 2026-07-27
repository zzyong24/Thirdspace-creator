import { createHash } from "node:crypto";
import { requireAccountId, type Db } from "@creatoros/backend";
import type { RequestContext } from "@creatoros/contract";
import {
  createPositioningRepository,
  type PositioningRepository,
  type RepoDeps,
} from "./positioning.repository";
import {
  toCreatorProfileDto,
  toPositioningStatementDto,
  type CreatorProfileResource,
  type PositioningStatementResource,
  type PositioningGateResultResource,
  type PositioningCenterResource,
} from "./positioning.schema";
import {
  ProfileRequiredError,
  GateSubjectError,
  StatementValidationError,
} from "./positioning.errors";

// Positioning service (foundation §5.3) — every public method takes
// `(ctx: RequestContext, …)` and builds a repository bound to `ctx.userId`
// (createPositioningRepository(db, { now, nextId, userId: ctx.userId })) so scoping
// is structural. The service owns the immutability invariant (append-only version
// chain) + the deterministic PositioningGate. It is the only entry other modules
// import (via index.ts), and exposes `createStatementVersion` for the AI confirm
// formalize (C-3) and `evaluateGate` for cross-module Badge consumers.
//
// The Projects peer is reached ONLY through an injected narrow PORT (mirrors
// learnings' LearningsProjectsPort) — no cross-module repository import (SPEC §22).
// The port is satisfied at composition time by the Projects public surface; it
// resolves a project subject (title/brief) gated by the project's ownership check
// (a cross-user / unknown projectId throws OwnershipError → 404).

export interface PositioningProjectSubject {
  title: string;
  brief: string;
}

export interface PositioningProjectsPort {
  // Ownership-gated read of a project subject for the gate (cross-user / unknown →
  // OwnershipError → 404). Returns the fields the deterministic scorer reads.
  getProjectSubject(
    ctx: RequestContext,
    projectId: string,
  ): Promise<PositioningProjectSubject>;
}

export interface ServiceDeps {
  db: Db;
  now: () => string;
  nextId: (prefix: string) => string;
  projects: PositioningProjectsPort;
  auditLegacyStatusNoteCleanup?: (
    event: LegacyStatusNoteCleanupAudit,
  ) => Promise<void> | void;
}

export interface LegacyStatusNoteCleanupAudit {
  operation: "positioning.legacy_status_note.cleaned";
  userId: string;
  accountId: string;
  profileId: string;
  previousValueHash: string;
  occurredAt: string;
}

export interface LegacyStatusNoteCleanupResult {
  outcome: "cleared" | "already_clean" | "not_dynamic" | "changed_concurrently";
  previousValueHash: string | null;
}

// Partial facets / rules accepted from callers (the transport passes the contract
// body, the AI confirm may pass a subset). The service normalizes to the full key
// set so the repo always writes a complete jsonb object.
export interface UpsertProfileFacets {
  contentScope?: string;
  avoid?: string;
  corePain?: string;
  coreValue?: string;
  tone?: string;
  statusNote?: string;
}

export interface UpsertProfileDownstreamRules {
  topicRule?: string;
  scriptRule?: string;
  projectRule?: string;
  forbidRule?: string;
  expressionRule?: string;
}

export interface UpsertProfileInput {
  persona: string;
  field: string;
  audience: string;
  differentiation: string;
  capabilities: string[];
  facets?: UpsertProfileFacets;
  downstreamRules?: UpsertProfileDownstreamRules;
}

export interface CreateStatementInput {
  oneLiner: string;
  keywords: string[];
  productAnchorIds: string[];
  createdByType?: "human" | "ai";
  aiTaskId?: string | null;
  // [T-231⑥] 修改原因(可选,团队留痕)—— 缺省 = ""(存量调用方/AI confirm 不传也合法)。
  changeReason?: string;
}

// The gate command. `subjectType:"candidate"` accepts an inline payload until the
// candidate module lands (OQ5) — the gate scores from the same overlap signals.
export interface EvaluateGateInput {
  subjectType: "candidate" | "project";
  subjectId: string;
  statementId?: string;
  // Inline candidate payload (OQ5) — used when subjectType === "candidate".
  candidate?: {
    title?: string;
    angle?: string;
    contentRole?: string;
    productAnchorId?: string;
  };
}

export interface PositioningService {
  upsertProfile(
    ctx: RequestContext,
    input: UpsertProfileInput,
  ): Promise<CreatorProfileResource>;
  // Append-only version chain. Requires a profile (ProfileRequiredError). The AI
  // confirm formalize (C-3) calls this with createdByType:"ai" + aiTaskId.
  createStatementVersion(
    ctx: RequestContext,
    input: CreateStatementInput,
  ): Promise<PositioningStatementResource>;
  listStatements(
    ctx: RequestContext,
    page: { limit: number; offset: number },
  ): Promise<{ rows: PositioningStatementResource[]; total: number }>;
  getStatement(
    ctx: RequestContext,
    statementId: string,
  ): Promise<PositioningStatementResource>;
  getProfile(
    ctx: RequestContext,
  ): Promise<CreatorProfileResource | null>;
  cleanupLegacyDynamicStatusNote(
    ctx: RequestContext,
  ): Promise<LegacyStatusNoteCleanupResult>;
  // PositioningGate (value object) — advisory 0–100 fit, deterministic (C-5).
  evaluateGate(
    ctx: RequestContext,
    input: EvaluateGateInput,
  ): Promise<PositioningGateResultResource>;
  // 定位中心 page-composition DTO (pages.positioning.get). Empty-state safe.
  getPositioningCenter(
    ctx: RequestContext,
  ): Promise<PositioningCenterResource>;
}

export function createPositioningService(
  deps: ServiceDeps,
): PositioningService {
  const { db, now, nextId, projects } = deps;

  function isLegacyDynamicStatusNote(value: string): boolean {
    const normalized = value.trim();
    if (!normalized) return false;
    const hasCount =
      /(?:\d+|[零〇一二三四五六七八九十百千万两]+)\s*(?:条|篇|个|则|份)/u.test(
        normalized,
      ) ||
      /(?:\d+|[零〇一二三四五六七八九十百千万两]+)\s*(?:review|稿(?:子|件)?|作品|视频)/iu.test(
        normalized,
      );
    // 这是一次会清空用户字段的存量修复，判据必须极窄：只有明确包含“待审核 /
    // review / 未发布”等旧故障措辞才允许改写。不能仅凭“4 条视频 + 发布”清掉
    // “每月发布 4 条视频”这类用户主动写下的规划。
    const hasDynamicWorkState =
      /(?:review|待审核|审核中|待发布|未发布|未发|没(?:有)?发|压在)/iu.test(
        normalized,
      );
    return hasCount && hasDynamicWorkState;
  }

  async function cleanupLegacyDynamicStatusNote(
    ctx: RequestContext,
  ): Promise<LegacyStatusNoteCleanupResult> {
    const accountId = requireAccountId(
      ctx.accountId,
      "positioning.cleanupLegacyDynamicStatusNote",
    );
    const repo = repoFor(ctx, "positioning.cleanupLegacyDynamicStatusNote");
    const profile = await repo.getProfile();
    if (!profile) {
      return { outcome: "already_clean", previousValueHash: null };
    }
    const facets = profile.facets as Record<string, unknown> | undefined;
    const statusNote =
      typeof facets?.statusNote === "string"
        ? facets.statusNote.trim()
        : "";
    if (!statusNote) {
      return { outcome: "already_clean", previousValueHash: null };
    }
    if (!isLegacyDynamicStatusNote(statusNote)) {
      return { outcome: "not_dynamic", previousValueHash: null };
    }

    const previousValueHash = createHash("sha256")
      .update(statusNote)
      .digest("hex");
    const cleared = await repo.clearStatusNoteIfMatches(profile.id, statusNote);
    if (!cleared) {
      return { outcome: "changed_concurrently", previousValueHash };
    }
    await deps.auditLegacyStatusNoteCleanup?.({
      operation: "positioning.legacy_status_note.cleaned",
      userId: ctx.userId,
      accountId,
      profileId: profile.id,
      previousValueHash,
      occurredAt: now(),
    });
    return { outcome: "cleared", previousValueHash };
  }

  // [T-332 S2 · SPEC §4.2] 每个经 ctx 的入口都经此建 repo:未选号 → AccountRequiredError
  // (引导态禁读写),有号则 strict 收窄到该号(每号一套定位母版)。getPositioningCenter /
  // upsertProfile / createStatementVersion / evaluateGate 全经此,故定位全消费面(positioning
  // 页 / creative-context positioning facet / script-review-runner / positioning-runner)
  // 随 ctx.accountId 自动按号。op 标注抛点便于前端归因。
  function repoFor(ctx: RequestContext, op: string): PositioningRepository {
    const repoDeps: RepoDeps = {
      now,
      nextId,
      userId: ctx.userId,
      accountId: requireAccountId(ctx.accountId, op),
    };
    return createPositioningRepository(db, repoDeps);
  }

  // Deterministic PositioningGate scorer (C-5: NO Date.now / Math.random / fetch).
  // Pure function of the statement keywords/anchors + the subject text/role/anchor.
  // Score 0–100 from three overlap signals (七步 §3.3):
  //   - keyword hits in subject text (up to 60, 20 per keyword of 3),
  //   - product-anchor match (+25 if the subject's anchor is in the statement's
  //     productAnchorIds, or both empty → neutral 0),
  //   - content-role alignment (+15 if a conversion/trust role is present —
  //     a deterministic, advisory nudge; absence → 0).
  // reasons[] explains every component. Same input → same score.
  function scoreGate(
    statement: PositioningStatementResource,
    subject: { text: string; contentRole?: string; productAnchorId?: string },
  ): { positioningFit: number; reasons: string[] } {
    const reasons: string[] = [];
    const haystack = subject.text.toLowerCase();
    const keywords = statement.keywords;
    let hits = 0;
    for (const kw of keywords) {
      if (kw.length > 0 && haystack.includes(kw.toLowerCase())) hits += 1;
    }
    const keywordScore = keywords.length > 0 ? Math.round((hits / keywords.length) * 60) : 0;
    reasons.push(`命中关键词 ${hits}/${keywords.length}`);

    let anchorScore = 0;
    if (subject.productAnchorId) {
      if (statement.productAnchorIds.includes(subject.productAnchorId)) {
        anchorScore = 25;
        reasons.push("锚定产品一致");
      } else {
        reasons.push("锚定产品不一致");
      }
    } else if (statement.productAnchorIds.length > 0) {
      reasons.push("未强化产品主线");
    }

    let roleScore = 0;
    if (subject.contentRole === "conversion" || subject.contentRole === "trust") {
      roleScore = 15;
      reasons.push(`内容角色对齐 (${subject.contentRole})`);
    } else if (subject.contentRole) {
      reasons.push(`内容角色 ${subject.contentRole}`);
    }

    const positioningFit = Math.min(100, keywordScore + anchorScore + roleScore);
    return { positioningFit, reasons };
  }

  async function requireProfileId(
    repo: PositioningRepository,
  ): Promise<{ profileId: string }> {
    const profile = await repo.getProfile();
    if (!profile) {
      throw new ProfileRequiredError(
        "ProfileRequiredError: a CreatorProfile is required before a positioning statement",
      );
    }
    return { profileId: profile.id };
  }

  return {
    async upsertProfile(ctx, input) {
      const repo = repoFor(ctx, "positioning.upsertProfile");
      const existing = await repo.getProfile();
      // [T-049 B3] 缺省 = **保留现值**(partial merge),不再清空。旧语义「缺省=空串」
      // 是真事故根因:采纳 AI 定位建议(ai.service confirm / Copilot 聊天卡都只传 5 个
      // 基础字段)把用户全部 6 facets + 5 条下游规则整体抹空,17 个 AI 节点随即失去
      // 规则约束(真库已发生过)。字段级回退:调用方显式传值(含显式空串)则写入,
      // 缺省(undefined)则保留库中现值;无现值兜 ""。
      const prevFacets = (existing?.facets ?? {}) as Record<string, string>;
      const prevRules = (existing?.downstreamRules ?? {}) as Record<
        string,
        string
      >;
      const normalized = {
        persona: input.persona,
        field: input.field,
        audience: input.audience,
        differentiation: input.differentiation,
        capabilities: input.capabilities,
        facets: {
          contentScope:
            input.facets?.contentScope ?? prevFacets.contentScope ?? "",
          avoid: input.facets?.avoid ?? prevFacets.avoid ?? "",
          corePain: input.facets?.corePain ?? prevFacets.corePain ?? "",
          coreValue: input.facets?.coreValue ?? prevFacets.coreValue ?? "",
          tone: input.facets?.tone ?? prevFacets.tone ?? "",
          statusNote: input.facets?.statusNote ?? prevFacets.statusNote ?? "",
        },
        downstreamRules: {
          topicRule:
            input.downstreamRules?.topicRule ?? prevRules.topicRule ?? "",
          scriptRule:
            input.downstreamRules?.scriptRule ?? prevRules.scriptRule ?? "",
          projectRule:
            input.downstreamRules?.projectRule ?? prevRules.projectRule ?? "",
          forbidRule:
            input.downstreamRules?.forbidRule ?? prevRules.forbidRule ?? "",
          expressionRule:
            input.downstreamRules?.expressionRule ??
            prevRules.expressionRule ??
            "",
        },
      };
      const row = existing
        ? await repo.updateProfileRow(normalized)
        : await repo.insertProfile(normalized);
      return toCreatorProfileDto(row);
    },

    async createStatementVersion(ctx, input) {
      const repo = repoFor(ctx, "positioning.createStatementVersion");
      const { profileId } = await requireProfileId(repo);

      if (input.keywords.length !== 3) {
        throw new StatementValidationError(
          `StatementValidationError: keywords must be exactly 3 (got ${input.keywords.length})`,
        );
      }

      const versionNumber = (await repo.maxVersionNumber(profileId)) + 1;
      const row = await repo.insertStatement({
        profileId,
        oneLiner: input.oneLiner,
        keywords: input.keywords,
        // product_anchor_ids accepted as id[] and stored; cross-module existence
        // check against monetization is SOFT at this wave (OQ3/OQ6).
        productAnchorIds: input.productAnchorIds,
        versionNumber,
        createdByType: input.createdByType ?? "human",
        aiTaskId: input.aiTaskId ?? null,
        // [T-231⑥] 修改原因留痕(trim 后落库;未填 = "" 诚实表示"没写原因")。
        changeReason: (input.changeReason ?? "").trim(),
      });
      return toPositioningStatementDto(row);
    },

    async listStatements(ctx, page) {
      const { rows, total } = await repoFor(ctx, "positioning.listStatements").listStatements(page);
      return { rows: rows.map(toPositioningStatementDto), total };
    },

    async getStatement(ctx, statementId) {
      const row = await repoFor(ctx, "positioning.getStatement").getStatement(statementId);
      return toPositioningStatementDto(row);
    },

    async getProfile(ctx) {
      const row = await repoFor(ctx, "positioning.getProfile").getProfile();
      return row ? toCreatorProfileDto(row) : null;
    },

    cleanupLegacyDynamicStatusNote,

    async evaluateGate(ctx, input) {
      const repo = repoFor(ctx, "positioning.evaluateGate");

      // Resolve the statement: explicit statementId (ownership-checked) else the
      // user's current (max-version) statement; none → GateSubjectError.
      let statement: PositioningStatementResource;
      if (input.statementId) {
        statement = toPositioningStatementDto(
          await repo.getStatement(input.statementId),
        );
      } else {
        const profile = await repo.getProfile();
        const current = profile
          ? await repo.getCurrentStatement(profile.id)
          : undefined;
        if (!current) {
          throw new GateSubjectError(
            "GateSubjectError: no positioning statement to evaluate against",
          );
        }
        statement = toPositioningStatementDto(current);
      }

      // Resolve the subject text/role/anchor.
      let subject: {
        text: string;
        contentRole?: string;
        productAnchorId?: string;
      };
      if (input.subjectType === "project") {
        const p = await projects.getProjectSubject(ctx, input.subjectId);
        subject = { text: `${p.title} ${p.brief}` };
      } else {
        // candidate — inline payload (OQ5) until the candidate module lands.
        const c = input.candidate ?? {};
        subject = {
          text: `${c.title ?? ""} ${c.angle ?? ""}`,
          contentRole: c.contentRole,
          productAnchorId: c.productAnchorId,
        };
      }

      const { positioningFit, reasons } = scoreGate(statement, subject);
      return {
        subjectType: input.subjectType,
        subjectId: input.subjectId,
        statementId: statement.id,
        positioningFit,
        reasons,
      };
    },

    async getPositioningCenter(ctx) {
      // T-521：任何会进入 AI 上下文的定位中心读取前，先经账号隔离服务清理已证伪的
      // 动态计数。清理是 CAS + 幂等；非动态说明不改写，也不会用新静态计数覆盖旧值。
      await cleanupLegacyDynamicStatusNote(ctx);
      const repo = repoFor(ctx, "positioning.getPositioningCenter");
      const profileRow = await repo.getProfile();
      if (!profileRow) {
        // Empty-state (brand-new user) — render the page, never an error.
        return {
          profile: null,
          currentStatement: null,
          keywords: [],
          productAnchors: [],
          history: [],
        };
      }
      const profile = toCreatorProfileDto(profileRow);
      const { rows } = await repo.listStatements({ limit: 200, offset: 0 });
      const history = rows.map(toPositioningStatementDto);
      const currentStatement = history[0] ?? null; // version-desc → max first
      return {
        profile,
        currentStatement,
        keywords: currentStatement?.keywords ?? [],
        productAnchors: currentStatement?.productAnchorIds ?? [],
        history,
      };
    },
  };
}
