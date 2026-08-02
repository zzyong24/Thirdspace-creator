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
  toPositioningDiscoverySessionDto,
  toPositioningStatementDto,
  type CreatorProfileResource,
  type PositioningMasterSnapshotResource,
  type PositioningMasterRestoreResultResource,
  type PositioningStatementResource,
  type PositioningGateResultResource,
  type PositioningCenterResource,
  type PositioningDiscoverySessionResource,
  type PositioningDiscoveryConfirmResultResource,
} from "./positioning.schema";
import {
  ProfileRequiredError,
  GateSubjectError,
  StatementValidationError,
  MasterSnapshotUnavailableError,
  DiscoveryConflictError,
  DiscoveryValidationError,
} from "./positioning.errors";
import {
  buildDiscoveryResearchQuery,
  selectDiscoveryResearchResults,
  type DiscoveryResearchLanguage,
  type DiscoveryResearchMarket,
} from "./positioning-research";

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
  listWorkIds?(ctx: RequestContext): Promise<string[]>;
}

export interface PositioningResearchPort {
  search(
    ctx: RequestContext,
    query: string,
    opts?: { count?: number },
  ): Promise<
    Array<{
      title: string;
      url: string;
      snippet: string;
      publishedAt?: string;
      siteName?: string;
    }>
  >;
}

export interface ServiceDeps {
  db: Db;
  now: () => string;
  nextId: (prefix: string) => string;
  projects: PositioningProjectsPort;
  research?: PositioningResearchPort;
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
  startDiscovery(
    ctx: RequestContext,
    sourceMode: "optimize" | "pivot" | "scratch",
  ): Promise<PositioningDiscoverySessionResource>;
  getDiscoverySession(
    ctx: RequestContext,
    sessionId: string,
  ): Promise<PositioningDiscoverySessionResource>;
  updateDiscoveryAnswer(
    ctx: RequestContext,
    input: {
      sessionId: string;
      themeId: "goal" | "strength" | "audience" | "need" | "proof" | "expression";
      selectedOptionIds: string[];
      customText: string;
      skipped: boolean;
      expectedRevision: number;
    },
  ): Promise<PositioningDiscoverySessionResource>;
  researchDiscovery(
    ctx: RequestContext,
    input: {
      sessionId: string;
      query: string;
      purpose: string;
      targetThemeId: "goal" | "strength" | "audience" | "need" | "proof" | "expression";
      market?: DiscoveryResearchMarket;
      language?: DiscoveryResearchLanguage;
      expectedRevision: number;
    },
  ): Promise<PositioningDiscoverySessionResource>;
  setDiscoveryEvidence(
    ctx: RequestContext,
    input: {
      sessionId: string;
      evidenceId: string;
      adopted: boolean;
      expectedRevision: number;
    },
  ): Promise<PositioningDiscoverySessionResource>;
  confirmDiscovery(
    ctx: RequestContext,
    input: {
      sessionId: string;
      candidateId: string;
      candidateRevision: number;
      expectedCurrentStatementId: string | null;
      idempotencyKey: string;
      proposal: {
        persona: string;
        field: string;
        audience: string;
        differentiation: string;
        capabilities: string[];
        facets: {
          contentScope: string;
          avoid: string;
          corePain: string;
          coreValue: string;
          tone: string;
          statusNote: string;
        };
        downstreamRules: {
          topicRule: string;
          scriptRule: string;
          projectRule: string;
          forbidRule: string;
          expressionRule: string;
        };
        oneLiner: string;
        keywords: string[];
        productAnchorIds: string[];
      };
    },
  ): Promise<PositioningDiscoveryConfirmResultResource>;
  upsertProfile(
    ctx: RequestContext,
    input: UpsertProfileInput,
  ): Promise<CreatorProfileResource>;
  resetMaster(ctx: RequestContext): Promise<CreatorProfileResource>;
  restoreMaster(
    ctx: RequestContext,
    statementId: string,
  ): Promise<PositioningMasterRestoreResultResource>;
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

  function requireDiscoveryUpdate<T>(row: T | undefined): T {
    if (!row) throw new DiscoveryConflictError();
    return row;
  }

  function validateResearchQuery(query: string): string {
    const normalized = query.trim().replace(/\s+/gu, " ");
    // 这是第二道服务端边界：只有短关键词能离开本地。整段访谈、链接、文件路径和
    // 明显的逐字稿指令直接拒绝；服务端也绝不把 answers/profile/works 拼进 query。
    if (
      normalized.length < 2 ||
      normalized.length > 80 ||
      /[\r\n@。！？；：，,]|https?:\/\/|file:\/\/|(?:逐字稿|完整访谈|全部回答|聊天记录|本地文件)/iu.test(
        normalized,
      )
    ) {
      throw new DiscoveryValidationError(
        "联网补充只接受简短的行业/IP 关键词，请不要粘贴访谈、逐字稿、链接或文件内容。",
      );
    }
    return normalized;
  }

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

  function snapshotFromProfile(
    profile: CreatorProfileResource,
  ): PositioningMasterSnapshotResource {
    return {
      persona: profile.persona,
      field: profile.field,
      audience: profile.audience,
      differentiation: profile.differentiation,
      capabilities: [...profile.capabilities],
      facets: { ...profile.facets },
      downstreamRules: { ...profile.downstreamRules },
    };
  }

  return {
    async startDiscovery(ctx, sourceMode) {
      const repo = repoFor(ctx, "positioning.discovery.start");
      // scratch 在分支入口即截断，不读取旧 profile / statement / work；不仅结果清单为空，
      // 连旧数据读端口都不会触发，防止后续重构时“读了再丢”悄悄变成提示词输入。
      if (sourceMode === "scratch") {
        return toPositioningDiscoverySessionDto(
          await repo.startDiscoverySession({
            sourceMode,
            inputManifest: {
              legacyProfileId: null,
              legacyStatementIds: [],
              legacyWorkIds: [],
            },
          }),
        );
      }
      const profile = await repo.getProfile();
      const statements = profile
        ? (await repo.listStatements({ limit: 200, offset: 0 })).rows
        : [];
      // 只保留项目读端口给出的前 12 条代表作品锚点；前采不因几十/上百条作品
      // 批量转写而阻塞。实际方向比较需要旧数据时，再由 Copilot 只读工具按需展开。
      const workIds = ((await projects.listWorkIds?.(ctx)) ?? []).slice(0, 12);
      const inputManifest = {
        legacyProfileId: profile?.id ?? null,
        legacyStatementIds: statements.map((item) => item.id),
        legacyWorkIds: workIds,
      };
      return toPositioningDiscoverySessionDto(
        await repo.startDiscoverySession({ sourceMode, inputManifest }),
      );
    },

    async getDiscoverySession(ctx, sessionId) {
      const repo = repoFor(ctx, "positioning.discovery.get");
      return toPositioningDiscoverySessionDto(
        await repo.getDiscoverySession(sessionId),
      );
    },

    async updateDiscoveryAnswer(ctx, input) {
      if (
        input.selectedOptionIds.length === 0 &&
        input.customText.trim().length === 0 &&
        !input.skipped
      ) {
        throw new DiscoveryValidationError(
          "请选择至少一个选项、补充自己的答案，或选择暂不确定。",
        );
      }
      const repo = repoFor(ctx, "positioning.discovery.answer.update");
      const row = requireDiscoveryUpdate(
        await repo.updateDiscoveryAnswer({
          sessionId: input.sessionId,
          expectedRevision: input.expectedRevision,
          answer: {
            themeId: input.themeId,
            selectedOptionIds: [...new Set(input.selectedOptionIds)],
            customText: input.customText.trim(),
            skipped: input.skipped,
            updatedAt: now(),
          },
        }),
      );
      return toPositioningDiscoverySessionDto(row);
    },

    async researchDiscovery(ctx, input) {
      const query = validateResearchQuery(input.query);
      const purpose = input.purpose.trim();
      const repo = repoFor(ctx, "positioning.discovery.research");
      const current = await repo.getDiscoverySession(input.sessionId);
      if (
        current.revision !== input.expectedRevision ||
        !["draft", "ready"].includes(current.status)
      ) {
        throw new DiscoveryConflictError();
      }
      if (!deps.research) {
        throw new DiscoveryValidationError("当前环境尚未接入联网检索。");
      }
      const market = input.market ?? "cn";
      const language = input.language ?? "zh-CN";
      const effectiveQuery = buildDiscoveryResearchQuery(query, {
        market,
        language,
      });
      const results = await deps.research.search(ctx, effectiveQuery, {
        count: 12,
      });
      const references = selectDiscoveryResearchResults(
        query,
        results,
        { market, language },
        5,
      )
        .filter((result) => {
          try {
            const url = new URL(result.url);
            return url.protocol === "http:" || url.protocol === "https:";
          } catch {
            return false;
          }
        })
        .slice(0, 5)
        .map((result) => ({
          id: nextId("posevd"),
          title: result.title.trim() || result.url,
          url: result.url,
          snippet: result.snippet.trim(),
          query,
          purpose,
          targetThemeId: input.targetThemeId,
          market,
          language,
          adopted: false,
        }));
      const row = requireDiscoveryUpdate(
        await repo.replaceDiscoveryWebReferences({
          sessionId: input.sessionId,
          expectedRevision: input.expectedRevision,
          references,
        }),
      );
      return toPositioningDiscoverySessionDto(row);
    },

    async setDiscoveryEvidence(ctx, input) {
      const repo = repoFor(ctx, "positioning.discovery.evidence.set");
      const row = requireDiscoveryUpdate(
        await repo.setDiscoveryEvidence(input),
      );
      return toPositioningDiscoverySessionDto(row);
    },

    async confirmDiscovery(ctx, input) {
      if (input.proposal.keywords.length !== 3) {
        throw new StatementValidationError(
          `StatementValidationError: keywords must be exactly 3 (got ${input.proposal.keywords.length})`,
        );
      }
      const repo = repoFor(ctx, "positioning.discovery.confirm");
      const result = await repo.confirmDiscoveryCandidate(input);
      if (!result) {
        throw new DiscoveryConflictError(
          "定位方向或当前母版已经变化，请刷新后重新确认；现有定位未被覆盖。",
        );
      }
      return {
        profile: toCreatorProfileDto(result.profile),
        statement: toPositioningStatementDto(result.statement),
        session: toPositioningDiscoverySessionDto(result.session),
      };
    },

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

    async resetMaster(ctx) {
      const repo = repoFor(ctx, "positioning.resetMaster");
      const existing = await repo.getProfile();
      if (!existing) {
        // 防御性幂等：空账号直接建立一张空母版；生产 UI 只在已有母版时显示重建按钮。
        const row = await repo.insertProfile({
          persona: "",
          field: "",
          audience: "",
          differentiation: "",
          capabilities: [],
          facets: {
            contentScope: "",
            avoid: "",
            corePain: "",
            coreValue: "",
            tone: "",
            statusNote: "",
          },
          downstreamRules: {
            topicRule: "",
            scriptRule: "",
            projectRule: "",
            forbidRule: "",
            expressionRule: "",
          },
        });
        return toCreatorProfileDto(row);
      }
      const snapshot = snapshotFromProfile(toCreatorProfileDto(existing));
      return toCreatorProfileDto(
        await repo.archiveAndResetProfileRow(existing.id, snapshot),
      );
    },

    async restoreMaster(ctx, statementId) {
      const repo = repoFor(ctx, "positioning.restoreMaster");
      const source = toPositioningStatementDto(
        await repo.getStatement(statementId),
      );
      if (!source.masterSnapshot) {
        throw new MasterSnapshotUnavailableError(
          "这个历史版本来自旧版，只保存了定位陈述，无法恢复已经缺失的画像和规则。",
        );
      }
      const restored = await repo.restoreMasterFromStatement(
        statementId,
        source.masterSnapshot,
      );
      return {
        profile: toCreatorProfileDto(restored.profile),
        statement: toPositioningStatementDto(restored.statement),
        restoredFromVersion: restored.restoredFromVersion,
      };
    },

    async createStatementVersion(ctx, input) {
      const repo = repoFor(ctx, "positioning.createStatementVersion");
      const { profileId } = await requireProfileId(repo);
      const profileRow = await repo.getProfile();
      if (!profileRow) {
        throw new ProfileRequiredError(
          "ProfileRequiredError: a CreatorProfile is required before a positioning statement",
        );
      }

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
        masterSnapshot: snapshotFromProfile(toCreatorProfileDto(profileRow)),
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
          ? await repo.getCurrentStatement(
              profile.id,
              profile.statementVersionFloor,
            )
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
      const activeDiscoveryRow = await repo.getActiveDiscoverySession();
      if (!profileRow) {
        // Empty-state (brand-new user) — render the page, never an error.
        return {
          profile: null,
          currentStatement: null,
          keywords: [],
          productAnchors: [],
          history: [],
          activeDiscovery: activeDiscoveryRow
            ? toPositioningDiscoverySessionDto(activeDiscoveryRow)
            : null,
        };
      }
      const profile = toCreatorProfileDto(profileRow);
      const { rows } = await repo.listStatements({ limit: 200, offset: 0 });
      const history = rows.map(toPositioningStatementDto);
      const currentRow = await repo.getCurrentStatement(
        profileRow.id,
        profileRow.statementVersionFloor,
      );
      const currentStatement = currentRow
        ? toPositioningStatementDto(currentRow)
        : null;
      return {
        profile,
        currentStatement,
        keywords: currentStatement?.keywords ?? [],
        productAnchors: currentStatement?.productAnchorIds ?? [],
        history,
        activeDiscovery: activeDiscoveryRow
          ? toPositioningDiscoverySessionDto(activeDiscoveryRow)
          : null,
      };
    },
  };
}
