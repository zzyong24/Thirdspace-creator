import "server-only";
import type { RequestContext } from "@creatoros/contract";

// 机制② CreativeContext — the "接力棒" every AI node reads. It is assembled (read-only)
// from each upstream module's PUBLIC service, never by importing module internals: this
// is the ONLY place modules coordinate to feed an agent, so adding a context source =
// adding one read here, with zero change to the downstream node.
//
// v1 (research_gather node) needs the smallest useful slice: the creator's active
// positioning (the constraint) + the topic for this project. Later nodes (script_draft,
// platform_adapt, review_analyze) extend this object with research/script/learnings.

export interface CreativeContext {
  // A human-readable positioning brief the agent reasons against (人设/领域/人群/差异化/
  // 关键词/变现锚). Empty string when the user has not set positioning yet.
  positioningBrief: string;
  // 飞轮回流 — a brief of past 复盘 爆款要素 (Learnings). Empty until the learnings reader
  // is wired (机制②扩展, plan A7); the field exists now so topic/script nodes can read it.
  learningsBrief: string;
  // 素材库 brief — a compact listing of the creator's asset library (id | name (type))
  // so a production-stage node (material.match) can propose which real assets to use.
  // Empty string until the assets reader is wired (Plan D2) or when the library is empty.
  assetsBrief: string;
  // 抖音账号画像 brief — the creator's connected platform accounts (平台 | 账号 | 粉丝量).
  // Feeds the positioning.generate node so the agent grounds a positioning *suggestion* in
  // who this person already is on-platform. Empty until the accounts reader is wired
  // (Plan Phase A) or when the creator has connected no accounts.
  accountsBrief: string;
  // 受众信号 brief — a compact listing of the creator's audience signals (评论/私信/咨询/
  // 复盘 raw text + demand tag) so the topic.generate `comments` basis can出题 from real
  // demand. Empty until the signals reader is wired or when there are no signals.
  signalsBrief: string;
  // 知识库 brief — a compact listing of the creator's KnowledgeItems (title (type)) so the
  // topic.generate `knowledge` basis can出题 from accumulated material. Empty until the
  // knowledge reader is wired or when the library is empty.
  knowledgeBrief: string;
  // 论点树 brief — a compact rendering of the project's ADOPTED thesis tree (核心论点 +
  // 支撑/证据/反驳). The 策划 stage's downstream nodes (planning.contract / planning.outline)
  // read it as the upstream 编导判断 they build on. Empty string until the thesis reader is
  // wired or when the project has no adopted thesis tree yet.
  thesisBrief: string;
  // 内容合同 brief — a compact rendering of the project's ADOPTED content contract (受众定位/
  // 价值主张/核心节奏/行动召唤). planning.outline reads it as the constraint the structure
  // must honor. Empty string until the contract reader is wired or when the project has no
  // adopted content contract yet.
  contractBrief: string;
  // 结构方案 brief — a compact rendering of the project's ADOPTED 结构方案 (结构类型/开头策略/
  // 段落安排/结尾/CTA), read back from the `content_outline` artifact's current version
  // `contentData`. The 脚本 stage's script.draft node reads it (SEAM-01) as the blueprint the
  // storyboard fleshes out, so the script follows 策划's structure rather than re-inventing it.
  // Empty string until the outline reader is wired or when the project has no adopted outline.
  outlineBrief: string;
  // 画幅取向 hint — 项目立项 Brief 选的 横屏 / 竖屏(中文 label),喂给 script.draft 让 AI 据此
  // 调钩子与时长(竖屏更短更狠、横屏可铺陈)。空串表示创作者还没选画幅。
  orientationHint: string;
  // ── 复盘专用字段(review.analyze)—— 只在有 projectId + 装配了 reviewSubject reader 时才填。
  //    复盘要「就这一条作品」提炼经验,而非账号级泛论,故把本作品的真实文案/标题/数据/评论读进来
  //    分别喂给 review prompt 的对应占位符(有则注入、空则该块在 prompt 里省略)。全部诚实空兜底:
  //    读不到就是空串,绝不塞假数据。字段拆开(而非合成一块 brief)让 prompt 能逐块条件注入。
  // 本次复盘作品的真标题(项目/publication 真值)。空 = 读不到/未装配。
  reviewTitle: string;
  // 本次复盘作品的真文案正文(output_script transcript / 逐字稿)。空 = 无脚本产物。
  reviewScript: string;
  // 本次复盘作品的真实数据摘要(最新 metric_snapshots:播放/点赞/评论/分享…,人类可读串)。空 = 无快照。
  reviewMetrics: string;
  // 本次复盘作品的观众评论(audience_signals 里 source 含 comment 的前 N 条,拼成列表)。空 = 无评论。
  reviewComments: string;
  // ── [T-146 切片 c/d] 用户上传素材主权 —— 只在有 projectId + 装配了 projectMaterials reader 时填。
  //    用户上传的第一手资料(PR 产品资料/采访/研究文档)是「创作者手里的真相」,主权盖过 AI 找的
  //    二手素材。按 material_link.priority 分流:high(用户第一手)进硬约束段(下游套「必须遵守」),
  //    normal(AI 找的)进参考段。全部诚实空兜底:读不到/未装配就空,绝不塞假。
  // 高优先(priority=high)素材的要点卡/全文,已装配含「最高优先 · 必须遵守」段头(硬约束)。空 = 无高优先素材。
  userMaterialHardBrief: string;
  // normal 优先(AI 找的二手)素材,参考级(非硬约束)。空 = 无 normal 素材。
  userMaterialRefBrief: string;
  // 从高优先素材要点卡抽的关键词/实体(供搜索 query 扩展,切片 d:标题 + 资料关键词而非纯标题)。
  userMaterialQueryTerms: string[];
  topic: { title: string; angle: string };
  projectId: string | null;
}

// The narrow read port — mirrors how the AI module reaches Artifacts/Knowledge through a
// port rather than a module import. The composition root (persistence-client) supplies a
// reader bound to the positioning service.
// The richer facets + 5 downstream rules (定位中心重建) the brief now injects so
// 选题/写稿/项目 runners read them as hard constraints. Optional on the read shape
// (a partial reader / empty profile degrades to the legacy 5-field brief).
export interface PositioningFacets {
  contentScope?: string;
  avoid?: string;
  corePain?: string;
  coreValue?: string;
  tone?: string;
  statusNote?: string;
}
export interface PositioningDownstreamRules {
  topicRule?: string;
  scriptRule?: string;
  projectRule?: string;
  forbidRule?: string;
  expressionRule?: string;
}

export interface PositioningReader {
  getPositioningCenter(ctx: RequestContext): Promise<{
    profile: {
      persona: string;
      field: string;
      audience: string;
      differentiation: string;
      capabilities: string[];
      facets?: PositioningFacets;
      downstreamRules?: PositioningDownstreamRules;
    } | null;
    currentStatement: { oneLiner: string; keywords: string[] } | null;
  }>;
}

// 飞轮回流 reader — the project's relevant past 复盘 Learnings (爆款要素). Optional: nodes
// that benefit from the flywheel (topic.generate / script.draft) pass it; others omit it.
export interface LearningsReader {
  getSuggestions(
    ctx: RequestContext,
    opts: { limit?: number },
  ): Promise<Array<{ title: string; insight: string }>>;
}

// 素材库 reader — the creator's asset library (id + name + type). Optional: only the
// production-stage material-match node passes it; other nodes omit it. The composition
// root binds it to the Assets public service's list method.
export interface AssetsReader {
  list(
    ctx: RequestContext,
  ): Promise<Array<{ id: string; name: string; type?: string }>>;
}

// [T-146 切片 c/d] 「资料要点卡」结构(与 material-extract-runner.MaterialSummary 同形,只提炼原文
// 已有,拿不准留空)。keyPoints/facts 必有(可空数组),sellingPoints 选填(带货类才有)。
export interface ProjectMaterialSummary {
  keyPoints?: string[];
  facts?: string[];
  sellingPoints?: string[];
}

// [T-146 切片 c/d] 一份挂在当前项目上的用户素材(document 类):名字 + 项目内优先级 + 抽取状态 +
// 要点卡/全文。priority 落在 material_link(per-project 语义);extractStatus/materialSummary/
// extractedText 是 asset 的文档抽取投影(切片 a 已建)。解析失败(failed/unsupported)的素材不进
// AI 上下文(不冒充可读)。
export interface ProjectMaterial {
  name: string;
  priority: "high" | "normal";
  extractStatus?: string | null;
  materialSummary?: ProjectMaterialSummary | null;
  extractedText?: string | null;
}

// [T-146 切片 c/d] 项目素材 reader —— 读**当前项目**挂载的用户上传 document 素材(带 per-project
// priority + 文档抽取投影)。project-scoped(不同项目同一素材优先级可不同,故必须带 projectId)。
// Optional:只有写文案(script.draft)/ 搜索(gatherMaterials)路径装配它;其它节点省略。composition
// root 绑到 material_links.list(projectId) ⋈ assets(文档抽取字段)。best-effort:读失败 → 空。
export interface ProjectMaterialsReader {
  listProjectMaterials(
    ctx: RequestContext,
    projectId: string,
  ): Promise<ProjectMaterial[]>;
}

// 抖音账号 reader — the creator's connected platform accounts (platform + handle +
// follower baseline). Optional: only the positioning.generate node passes it (it grounds
// a positioning suggestion in the on-platform identity); other nodes omit it. The
// composition root binds it to the platform-account public service's list method.
export interface AccountsReader {
  list(
    ctx: RequestContext,
  ): Promise<
    Array<{ platform: string; accountHandle: string; followerBaseline: number }>
  >;
}

// 受众信号 reader — the creator's audience signals (评论/私信/咨询/复盘). Optional: only
// the topic.generate node (comments basis) passes it. The composition root binds it to
// the candidate public service's listSignals method.
export interface SignalsReader {
  list(
    ctx: RequestContext,
    opts: { limit?: number },
  ): Promise<Array<{ source: string; rawText: string; demandTag: string | null }>>;
}

// 知识库 reader — the creator's KnowledgeItems. Optional: only the
// topic.generate node (knowledge basis) passes it. The composition root binds it to the
// knowledge public service's listKnowledge method.
// [T-079c] 战绩/出处透传:usedCount(被用料链引用次数)驱动 brief 的战绩排序,
// sourceNote 给证据段带出处,usedInPublished 是最硬的战绩信号(排序优先)。三个
// 字段 optional —— 旧绑定/测试 fake 只给 {title, knowledgeType} 也能跑(缺省按
// 0/false/null 兜底,brief 退化为无战绩排序)。
export interface KnowledgeReader {
  list(
    ctx: RequestContext,
    opts: { limit?: number },
  ): Promise<
    Array<{
      title: string;
      knowledgeType: string;
      usedCount?: number;
      usedInPublished?: boolean;
      sourceNote?: string | null;
    }>
  >;
}

// 论点树 reader — the project's ADOPTED thesis tree (核心论点 + 支撑/证据/反驳 分支), read
// back from the `thesis_tree` artifact's current ArtifactVersion `contentData.nodes`.
// Optional: only the 策划 downstream nodes (planning.contract / planning.outline) pass it;
// other nodes omit it. The composition root binds it to the Artifacts public service.
export interface ThesisReader {
  getThesisNodes(
    ctx: RequestContext,
    projectId: string,
  ): Promise<Array<{ column: string; title: string; summary: string }>>;
}

// 内容合同 reader — the project's ADOPTED content contract (受众定位/价值主张/核心节奏/
// 行动召唤), read back from the `content_contract` artifact's current ArtifactVersion
// `contentData.cards`. Optional: only planning.outline passes it; other nodes omit it.
export interface ContractReader {
  getContractCards(
    ctx: RequestContext,
    projectId: string,
  ): Promise<Array<{ title: string; body: string }>>;
}

// 结构方案 reader (SEAM-01) — the project's ADOPTED 结构方案, read back from the
// `content_outline` artifact's current ArtifactVersion `contentData`
// ({ structureType, opening, sections:[{label,intent}], ending, cta }). Optional: only the
// 脚本 node (script.draft) passes it so the storyboard fleshes out 策划's structure instead of
// re-inventing one. The composition root binds it to the Artifacts public service.
export interface OutlineReader {
  getOutline(
    ctx: RequestContext,
    projectId: string,
  ): Promise<{
    structureType: string;
    opening: string;
    sections: Array<{ label: string; intent: string }>;
    ending: string;
    cta: string;
  } | null>;
}

// 立项 Brief reader — reads the project's structured Brief so downstream nodes can ground
// on the creator's立项 decisions. Today only `orientation`(横/竖屏)is consumed; optional
// so nodes without a project (或未装配)just skip it. Bound to the projects public service.
export interface ProjectBriefReader {
  getBriefDetail(
    ctx: RequestContext,
    projectId: string,
  ): Promise<{ orientation?: "landscape" | "portrait" } | null>;
}

// 复盘对象 reader (T-039a) — 读「本次复盘的这一条作品」的真实材料,喂给 review.analyze,让复盘
// 就这一条内容(文案/标题/数据/评论)提炼可复用经验,而不是账号级泛论。四个只读方法各自 best-effort
// (读不到 → 空,绝不塞假);composition root 绑到已有公开读源(projects repo 取标题、artifacts
// service 取 output_script 逐字稿、analytics service 取最新 snapshot、candidate service 取评论信号),
// **复用**数据底座既有读法(如 dashboard 的 views??plays + 最新帧口径),不新造 repo 方法。Optional:
// 只有 review 路径装配它;其它节点省略,assembleCreativeContext 就跳过这几个字段(留空)。
export interface ReviewSubjectReader {
  /** 本作品真标题(项目/publication 真值)。读不到 → 空串。 */
  getTitle(ctx: RequestContext, projectId: string): Promise<string>;
  /** 本作品真文案正文(output_script transcript / 逐字稿)。无脚本 → 空串。 */
  getScript(ctx: RequestContext, projectId: string): Promise<string>;
  /** 本作品真实数据摘要(最新 metric_snapshots → 人类可读串,播放优先 views 回退 plays)。无 → 空串。 */
  getMetricsSummary(ctx: RequestContext, projectId: string): Promise<string>;
  /** 本作品观众评论(audience_signals 里 source 含 comment 的前 N 条 rawText)。无 → 空数组。 */
  getComments(
    ctx: RequestContext,
    projectId: string,
    opts: { limit: number },
  ): Promise<string[]>;
}

// F2 消费侧隔离 reader (T-030-D4, SPEC §7 边界②) — reports the `origin` of a project's
// current artifact of a given type. The thesis/contract/outline briefs above are injected
// downstream as "用户已确认的前提" (已搭好的论点树 / 已确认的内容合同 / 结构方案蓝图). When the
// backing artifact is AI-history-reconstructed (origin='reconstructed'), we MUST NOT let a
// downstream node silently treat it as confirmed — the brief is prefixed with an explicit
// "AI 历史反推、未经确认" marker (see markReconstructedBrief). Optional: bound to the Artifacts
// public service (reuses listProjectArtifacts → ArtifactRow.origin, no extra content fetch);
// nodes without it degrade to the legacy (unmarked) behavior.
export interface ArtifactOriginReader {
  getArtifactOrigin(
    ctx: RequestContext,
    projectId: string,
    artifactType: string,
  ): Promise<"user" | "reconstructed" | null>;
}

export interface ContextDeps {
  positioning: PositioningReader;
  learnings?: LearningsReader;
  assets?: AssetsReader;
  // [T-146 切片 c/d] 项目素材 reader(用户上传第一手资料,per-project priority)。只有写文案 /
  // 搜索路径装配。Optional:未装配 → 用户素材主权字段全空(降级 legacy 行为)。
  projectMaterials?: ProjectMaterialsReader;
  accounts?: AccountsReader;
  signals?: SignalsReader;
  knowledge?: KnowledgeReader;
  thesis?: ThesisReader;
  contract?: ContractReader;
  outline?: OutlineReader;
  brief?: ProjectBriefReader;
  // 复盘对象 (T-039a): 只有 review.analyze 路径装配,读本次复盘作品的真文案/标题/数据/评论。Optional。
  reviewSubject?: ReviewSubjectReader;
  // F2 (T-030-D4): reports origin of the thesis_tree / content_contract /
  // content_outline artifacts so reconstructed briefs get an explicit "未经确认"
  // marker before they ride downstream as confirmed premises. Optional.
  artifactOrigin?: ArtifactOriginReader;
}

// F2 (SPEC §7 边界②): the artifactType each 已确认前提 brief is read back from. Used to
// look up origin and mark a reconstructed brief. Kept next to the readers so the mapping
// (brief → backing artifact) is explicit and testable.
export const THESIS_ARTIFACT_TYPE = "thesis_tree";
export const CONTRACT_ARTIFACT_TYPE = "content_contract";
export const OUTLINE_ARTIFACT_TYPE = "content_outline";

// F2: prefix a non-empty brief with an explicit "AI 历史反推、未经确认" marker when its
// backing artifact is origin='reconstructed'. Empty briefs stay empty (nothing to mark).
// This is the消费侧 guard: a downstream node still SEES the reconstructed context (it is
// useful), but can never mistake it for a user-confirmed premise. Pure/deterministic.
export function markReconstructedBrief(
  brief: string,
  origin: "user" | "reconstructed" | null | undefined,
): string {
  if (!brief) return brief;
  if (origin !== "reconstructed") return brief;
  return `⚠️ 以下内容为 AI 依据这条历史作品反推、**未经你确认**，仅供参考，不要当作已敲定的前提：\n${brief}`;
}

export interface AssembleInput {
  projectId: string | null;
  topic: string;
  angle?: string;
}

export async function assembleCreativeContext(
  ctx: RequestContext,
  input: AssembleInput,
  deps: ContextDeps,
): Promise<CreativeContext> {
  let positioningBrief = "";
  try {
    const center = await deps.positioning.getPositioningCenter(ctx);
    positioningBrief = formatPositioning(center);
  } catch {
    // Positioning is optional context — a brand-new creator can still gather material;
    // the agent just loses the relevance constraint. Degrade, never block.
    positioningBrief = "";
  }

  let learningsBrief = "";
  if (deps.learnings) {
    try {
      // [T-062b] validated 经验全量当约束(SPEC §3:candidate 不进 prompt);20 上限防爆。
      const rows = await deps.learnings.getSuggestions(ctx, { limit: 20 });
      learningsBrief = rows
        .map((l) => `· ${l.title}${l.insight ? `：${l.insight}` : ""}`)
        .join("\n");
    } catch {
      learningsBrief = ""; // 飞轮 is best-effort context; never block a node on it
    }
  }

  let assetsBrief = "";
  if (deps.assets) {
    try {
      const rows = await deps.assets.list(ctx);
      assetsBrief = rows
        .map((a) => `· ${a.id} | ${a.name}${a.type ? ` (${a.type})` : ""}`)
        .join("\n");
    } catch {
      assetsBrief = ""; // 素材库 is best-effort context; never block a node on it
    }
  }

  let accountsBrief = "";
  if (deps.accounts) {
    try {
      const rows = await deps.accounts.list(ctx);
      accountsBrief = rows
        .map(
          (a) =>
            `· ${a.platform} | ${a.accountHandle} | 粉丝 ${a.followerBaseline}`,
        )
        .join("\n");
    } catch {
      accountsBrief = ""; // 抖音账号画像 is best-effort context; never block a node on it
    }
  }

  let signalsBrief = "";
  if (deps.signals) {
    try {
      const rows = await deps.signals.list(ctx, { limit: 30 });
      signalsBrief = rows
        .map(
          (s) =>
            `· [${s.source}]${s.demandTag ? ` (${s.demandTag})` : ""} ${s.rawText}`,
        )
        .join("\n");
    } catch {
      signalsBrief = ""; // 受众信号 is best-effort context; never block a node on it
    }
  }

  let knowledgeBrief = "";
  if (deps.knowledge) {
    try {
      // [T-079c] 喂料升级(SPEC §3):brief 按四原子分段(观点/证据/金句 各取战绩
      // top5),替代旧的扁平 title 列表 —— 组装逻辑在纯函数 formatKnowledgeBrief。
      const rows = await deps.knowledge.list(ctx, { limit: 40 });
      knowledgeBrief = formatKnowledgeBrief(rows);
    } catch {
      knowledgeBrief = ""; // 知识库 is best-effort context; never block a node on it
    }
  }

  // F2 (SPEC §7 边界②): resolve the origin of each 已确认前提 artifact so a reconstructed
  // brief is explicitly marked "未经确认" below. Best-effort — a missing/failed origin read
  // degrades to unmarked (legacy) rather than blocking the node. Reused across the three
  // briefs so we look up origin at most once per artifactType.
  const originOf = async (artifactType: string) => {
    if (!deps.artifactOrigin || !input.projectId) return null;
    try {
      return await deps.artifactOrigin.getArtifactOrigin(
        ctx,
        input.projectId,
        artifactType,
      );
    } catch {
      return null;
    }
  };

  let thesisBrief = "";
  if (deps.thesis && input.projectId) {
    try {
      const nodes = await deps.thesis.getThesisNodes(ctx, input.projectId);
      thesisBrief = markReconstructedBrief(
        formatThesisNodes(nodes),
        await originOf(THESIS_ARTIFACT_TYPE),
      );
    } catch {
      thesisBrief = ""; // 论点树 is best-effort context; never block a node on it
    }
  }

  let contractBrief = "";
  if (deps.contract && input.projectId) {
    try {
      const cards = await deps.contract.getContractCards(ctx, input.projectId);
      contractBrief = markReconstructedBrief(
        cards
          .map((c) => `· ${c.title.trim()}：${c.body.trim()}`)
          .filter((line) => line.length > 3)
          .join("\n"),
        await originOf(CONTRACT_ARTIFACT_TYPE),
      );
    } catch {
      contractBrief = ""; // 内容合同 is best-effort context; never block a node on it
    }
  }

  // 结构方案(SEAM-01)—— best-effort,从项目 `content_outline` artifact 当前版本读回;
  // 渲成紧凑文本供 script.draft 当蓝图(脚本据此铺分镜,不再自己重造结构)。
  let outlineBrief = "";
  if (deps.outline && input.projectId) {
    try {
      const outline = await deps.outline.getOutline(ctx, input.projectId);
      outlineBrief = outline
        ? markReconstructedBrief(
            formatOutline(outline),
            await originOf(OUTLINE_ARTIFACT_TYPE),
          )
        : "";
    } catch {
      outlineBrief = ""; // 结构方案 is best-effort context; never block a node on it
    }
  }

  // 画幅取向(横/竖屏)—— best-effort,从项目立项 Brief 读;映射中文 label 供 script.draft 用。
  let orientationHint = "";
  if (deps.brief && input.projectId) {
    try {
      const detail = await deps.brief.getBriefDetail(ctx, input.projectId);
      if (detail?.orientation === "landscape") orientationHint = "横屏";
      else if (detail?.orientation === "portrait") orientationHint = "竖屏";
    } catch {
      orientationHint = ""; // never block a node on the brief read
    }
  }

  // 复盘对象(T-039a)—— 只有 review.analyze 路径装配 reviewSubject reader + 有 projectId 时,读
  // 「这一条作品」的真文案/标题/数据/评论。每个独立 best-effort(单点读失败只让该字段空,不牵连其它、
  // 不阻断节点)。全部诚实空兜底:读不到就空串/空,绝不塞假。四字段拆开(而非合成一块)让 review
  // prompt 能逐块条件注入(有则注、空则该块在 prompt 省略)。
  let reviewTitle = "";
  let reviewScript = "";
  let reviewMetrics = "";
  let reviewComments = "";
  if (deps.reviewSubject && input.projectId) {
    const rs = deps.reviewSubject;
    const pid = input.projectId;
    try {
      reviewTitle = (await rs.getTitle(ctx, pid))?.trim() ?? "";
    } catch {
      reviewTitle = "";
    }
    try {
      reviewScript = (await rs.getScript(ctx, pid))?.trim() ?? "";
    } catch {
      reviewScript = "";
    }
    try {
      reviewMetrics = (await rs.getMetricsSummary(ctx, pid))?.trim() ?? "";
    } catch {
      reviewMetrics = "";
    }
    try {
      const comments = await rs.getComments(ctx, pid, { limit: 20 });
      reviewComments = (comments ?? [])
        .map((c) => (typeof c === "string" ? c.trim() : ""))
        .filter((c) => c.length > 0)
        .map((c) => `· ${c}`)
        .join("\n");
    } catch {
      reviewComments = "";
    }
  }

  // ── [T-146 切片 c/d] 用户上传素材主权 —— 只有 projectMaterials reader 装配 + 有 projectId 时,读
  //    当前项目挂载的用户 document 素材,按 priority 分流:high → 硬约束段(套「必须遵守」),normal →
  //    参考段。best-effort:读失败 → 三字段全空(never block)。high 素材要点抽词供搜索 query 扩展。
  let userMaterialHardBrief = "";
  let userMaterialRefBrief = "";
  let userMaterialQueryTerms: string[] = [];
  if (deps.projectMaterials && input.projectId) {
    try {
      const materials = await deps.projectMaterials.listProjectMaterials(
        ctx,
        input.projectId,
      );
      const high = materials.filter((m) => m.priority === "high");
      const normal = materials.filter((m) => m.priority !== "high");
      userMaterialHardBrief = formatUserMaterialBrief(high, "high");
      userMaterialRefBrief = formatUserMaterialBrief(normal, "normal");
      userMaterialQueryTerms = materialQueryTerms(high);
    } catch {
      // 用户素材是 best-effort context;读失败绝不阻塞写文案/搜索节点(降级为无素材主权)。
      userMaterialHardBrief = "";
      userMaterialRefBrief = "";
      userMaterialQueryTerms = [];
    }
  }

  return {
    positioningBrief,
    learningsBrief,
    assetsBrief,
    userMaterialHardBrief,
    userMaterialRefBrief,
    userMaterialQueryTerms,
    accountsBrief,
    signalsBrief,
    knowledgeBrief,
    thesisBrief,
    contractBrief,
    outlineBrief,
    orientationHint,
    reviewTitle,
    reviewScript,
    reviewMetrics,
    reviewComments,
    topic: { title: input.topic, angle: input.angle ?? "" },
    projectId: input.projectId,
  };
}

// ── [T-079c] knowledgeBrief 分段组装(SPEC 2026-07-03-knowledge-asset-redesign §3)──
// 知识库喂料从「扁平 title 列表」升级为按四原子分段的战绩排序 brief:
//   【我的观点】claim 战绩 top5 →「· title(被 N 条内容用过)」
//   【证据】evidence 战绩 top5(带 sourceNote 出处)
//   【金句】quote 战绩 top5
// 排序:usedInPublished(用于已发布,最硬战绩)优先 → usedCount desc;各段空则
// 该段落「(暂无)」。qa 不进 brief(观众问题走评论信号 signalsBrief 消费),
// reference 及旧类型(note/snippet/…)是存档/原文,不进创作喂料。每条 title 截
// 80 字防爆(总长可控:3 段 × 5 条 × ≤80 字)。库全空 → 空串(下游 facet 按
// 惯例整段省略,不注一个只有(暂无)的空壳)。
// 纯函数导出,供单测直接断言分段头与战绩排序。
const KNOWLEDGE_BRIEF_TOP_N = 5;
const KNOWLEDGE_TITLE_MAX = 80;

export function formatKnowledgeBrief(
  rows: Array<{
    title: string;
    knowledgeType: string;
    usedCount?: number;
    usedInPublished?: boolean;
    sourceNote?: string | null;
  }>,
): string {
  if (rows.length === 0) return "";

  const truncate = (text: string) =>
    text.length > KNOWLEDGE_TITLE_MAX
      ? `${text.slice(0, KNOWLEDGE_TITLE_MAX)}…`
      : text;

  // 战绩排序:用于已发布优先 → 引用次数 desc(缺省 0/false = 无战绩,排后)。
  const byRecord = (
    a: { usedCount?: number; usedInPublished?: boolean },
    b: { usedCount?: number; usedInPublished?: boolean },
  ) => {
    const aPub = a.usedInPublished ? 1 : 0;
    const bPub = b.usedInPublished ? 1 : 0;
    if (aPub !== bPub) return bPub - aPub;
    return (b.usedCount ?? 0) - (a.usedCount ?? 0);
  };

  const topOf = (type: string) =>
    rows
      .filter((k) => k.knowledgeType === type)
      .sort(byRecord)
      .slice(0, KNOWLEDGE_BRIEF_TOP_N);

  const usedSuffix = (k: { usedCount?: number }) =>
    (k.usedCount ?? 0) > 0 ? `（被 ${k.usedCount} 条内容用过）` : "";

  const section = (header: string, lines: string[]) =>
    `【${header}】\n${lines.length > 0 ? lines.join("\n") : "（暂无）"}`;

  return [
    section(
      "我的观点",
      topOf("claim").map((k) => `· ${truncate(k.title)}${usedSuffix(k)}`),
    ),
    section(
      "证据",
      topOf("evidence").map(
        (k) =>
          `· ${truncate(k.title)}${
            k.sourceNote ? `（出处：${truncate(k.sourceNote)}）` : ""
          }${usedSuffix(k)}`,
      ),
    ),
    section(
      "金句",
      topOf("quote").map((k) => `· ${truncate(k.title)}${usedSuffix(k)}`),
    ),
  ].join("\n");
}

// ── [T-146 切片 c/d] 用户上传素材主权 brief 组装(SPEC §3/§4)────────────────────────
// 用户上传的第一手资料(PR 产品资料/采访/研究文档)是最真的数据底座,主权盖过 AI 找的二手素材。
// 按 material_link.priority 分流:
//   mode='high'(用户第一手)→ 渲染成「【用户第一手资料 · 最高优先 · 必须遵守】」硬约束段:文案必须
//     紧扣其事实/数据/卖点(下游 script-node 在段后追加「事实硬约束 + 表达自由」gate 平衡说明)。
//   mode='normal'(AI 找的二手)→ 渲染成普通参考段(参考级,非硬约束)。
// 每份素材:优先用要点卡(keyPoints/facts/sellingPoints);无要点卡(未配摘要模型降级)→ 截断全文
// 兜底(SPEC §3 全文截断注入)。解析失败(extractStatus=failed/unsupported)的素材**不进 brief**
// (不冒充可读,SPEC §8.5 诚实降级)。全空 → 空串(下游整段省略,不注空壳)。纯函数,导出供单测。
const USER_MATERIAL_TEXT_MAX = 1200; // 单份素材全文兜底注入的字符上限(防把上万字灌进 prompt)
const USER_MATERIAL_MAX_DOCS = 8; // 单个 brief 最多列几份素材(防素材过多爆 context)

// 一份素材是否有可读内容(有要点卡任一非空段 或 有非空全文),且抽取未失败。
function materialIsReadable(m: ProjectMaterial): boolean {
  if (m.extractStatus === "failed" || m.extractStatus === "unsupported") {
    return false;
  }
  const s = m.materialSummary;
  const hasSummary = Boolean(
    (s?.keyPoints?.length ?? 0) > 0 ||
      (s?.facts?.length ?? 0) > 0 ||
      (s?.sellingPoints?.length ?? 0) > 0,
  );
  const hasText = Boolean(m.extractedText && m.extractedText.trim().length > 0);
  return hasSummary || hasText;
}

// 渲染单份素材的内容体(要点卡优先,无则截断全文兜底)。不含段头(段头由 mode 统一加)。
function renderMaterialBody(m: ProjectMaterial): string {
  const s = m.materialSummary;
  const lines: string[] = [];
  const seg = (label: string, items?: string[]) => {
    const nonEmpty = (items ?? []).map((x) => x.trim()).filter(Boolean);
    if (nonEmpty.length > 0) {
      lines.push(`${label}：${nonEmpty.join("；")}`);
    }
  };
  seg("要点", s?.keyPoints);
  seg("事实/数据", s?.facts);
  seg("卖点", s?.sellingPoints);
  if (lines.length === 0) {
    // 无要点卡 → 截断全文兜底(未配摘要模型的诚实降级)。
    const text = (m.extractedText ?? "").trim();
    if (text) {
      const clipped =
        text.length > USER_MATERIAL_TEXT_MAX
          ? `${text.slice(0, USER_MATERIAL_TEXT_MAX)}…（资料过长，已截断）`
          : text;
      lines.push(`全文摘录：${clipped}`);
    }
  }
  return lines.join("\n");
}

export function formatUserMaterialBrief(
  materials: ProjectMaterial[],
  mode: "high" | "normal",
): string {
  const readable = materials
    .filter(materialIsReadable)
    .slice(0, USER_MATERIAL_MAX_DOCS);
  if (readable.length === 0) return "";

  const blocks = readable
    .map((m) => {
      const body = renderMaterialBody(m);
      if (!body) return "";
      const nameLine = m.name ? `〔资料：${m.name}〕` : "";
      return [nameLine, body].filter(Boolean).join("\n");
    })
    .filter(Boolean);
  if (blocks.length === 0) return "";

  if (mode === "high") {
    // 套 positioning「【必须遵守】」硬约束范式(SPEC §3):事实地基,文案必须紧扣。
    return [
      "【用户第一手资料 · 最高优先 · 必须遵守】以下为创作者提供的核心资料。文案**必须紧扣其核心事实、数据、卖点**，不得脱离、弱化或编造与之矛盾的内容。这些是本条内容的事实地基。",
      ...blocks,
    ].join("\n");
  }
  // normal:参考级(非硬约束)。
  return ["【创作者素材（参考级）】", ...blocks].join("\n");
}

// [T-146 切片 d] 从高优先素材的要点卡抽关键词/实体,供搜索 query 扩展(标题 + 资料关键词,而非纯
// 标题)。取 keyPoints + sellingPoints(facts 常是长句数据,不宜直接拼进 query）。每条 trim 去空,
// 去重,上限 6 条(防 query 过长)。无要点卡/解析失败的素材不产词。纯函数,导出供单测。
const MATERIAL_QUERY_TERMS_MAX = 6;
export function materialQueryTerms(materials: ProjectMaterial[]): string[] {
  const terms: string[] = [];
  for (const m of materials) {
    // 只有 high 优先(用户第一手)才扩展 query;normal(AI 找的)不改 query(防用二手素材反向污染搜索)。
    if (m.priority !== "high") continue;
    if (!materialIsReadable(m)) continue;
    const s = m.materialSummary;
    for (const t of [...(s?.keyPoints ?? []), ...(s?.sellingPoints ?? [])]) {
      const clean = t.trim();
      if (clean) terms.push(clean);
    }
  }
  // 去重 + 上限。
  return Array.from(new Set(terms)).slice(0, MATERIAL_QUERY_TERMS_MAX);
}

// ── [T-081②] 真实作品画像 brief —— 全部作品标题压缩列表(每条截 40 字、上限 100 条、带发布
// 状态标记),喂 positioning.generate(对话工具 + 后台 task 两条路径共用,单一真值)。title 可能
// 是整篇文案(数百字)故必须截断;total > 已列条数时如实标注剩余。纯函数,导出供单测。
// 落在本模块:与 formatKnowledgeBrief 同类(brief 组装纯函数),且 chat-runner / positioning-runner
// 都已依赖本模块,不造循环依赖。
export const WORKS_BRIEF_MAX_ROWS = 100;
export function formatWorksBrief(
  rows: Array<{
    title: string;
    stage: string;
    status: string;
    publishedAt?: string | null;
  }>,
  total: number,
): string {
  const listed = rows.slice(0, WORKS_BRIEF_MAX_ROWS);
  const lines = listed.map((r) => {
    const t = r.title.trim();
    const short = t.length > 40 ? `${t.slice(0, 40)}…` : t;
    const published = Boolean(r.publishedAt) || r.status === "published";
    const mark = published ? "已发布" : r.stage || r.status || "进行中";
    return `· ${short}（${mark}）`;
  });
  const rest = total - listed.length;
  if (rest > 0) lines.push(`（另有 ${rest} 条未列出）`);
  return lines.join("\n");
}

// Render the adopted 结构方案 into a compact brief script.draft reasons against (SEAM-01).
// Mirrors planning-outline-runner's renderBody but flattened for prompt injection.
function formatOutline(outline: {
  structureType: string;
  opening: string;
  sections: Array<{ label: string; intent: string }>;
  ending: string;
  cta: string;
}): string {
  const lines: string[] = [];
  if (outline.structureType) lines.push(`结构类型：${outline.structureType}`);
  if (outline.opening) lines.push(`开头策略：${outline.opening}`);
  if (outline.sections.length > 0) {
    lines.push("段落安排：");
    outline.sections.forEach((s, i) => {
      const label = s.label.trim();
      const intent = s.intent.trim();
      if (!label && !intent) return;
      lines.push(`  ${i + 1}. ${label}${label && intent ? "：" : ""}${intent}`);
    });
  }
  if (outline.ending) lines.push(`结尾：${outline.ending}`);
  if (outline.cta) lines.push(`行动召唤：${outline.cta}`);
  return lines.join("\n");
}

// Render the adopted thesis nodes into a compact brief the downstream 策划 nodes reason
// against (grouped by column, in the locked 核心论点→支撑→证据→反驳 order).
const THESIS_COLUMN_LABEL: Record<string, string> = {
  core: "核心论点",
  support: "支撑依据",
  evidence: "证据",
  counter: "反驳",
};

function formatThesisNodes(
  nodes: Array<{ column: string; title: string; summary: string }>,
): string {
  if (nodes.length === 0) return "";
  const lines: string[] = [];
  for (const column of ["core", "support", "evidence", "counter"]) {
    const inColumn = nodes.filter((n) => n.column === column);
    if (inColumn.length === 0) continue;
    lines.push(`【${THESIS_COLUMN_LABEL[column] ?? column}】`);
    for (const n of inColumn) {
      const title = n.title.trim();
      const summary = n.summary.trim();
      if (!title && !summary) continue;
      lines.push(`· ${title}${title && summary ? "：" : ""}${summary}`);
    }
  }
  return lines.join("\n");
}

function formatPositioning(center: {
  profile: {
    persona: string;
    field: string;
    audience: string;
    differentiation: string;
    capabilities: string[];
    facets?: PositioningFacets;
    downstreamRules?: PositioningDownstreamRules;
  } | null;
  currentStatement: { oneLiner: string; keywords: string[] } | null;
}): string {
  const lines: string[] = [];
  if (center.currentStatement?.oneLiner) {
    lines.push(`定位一句话：${center.currentStatement.oneLiner}`);
  }
  if (center.currentStatement?.keywords?.length) {
    lines.push(`关键词：${center.currentStatement.keywords.join("、")}`);
  }
  const p = center.profile;
  if (p) {
    if (p.persona) lines.push(`人设：${p.persona}`);
    if (p.field) lines.push(`领域：${p.field}`);
    if (p.audience) lines.push(`目标人群：${p.audience}`);
    if (p.differentiation) lines.push(`差异化：${p.differentiation}`);
    if (p.capabilities?.length) lines.push(`能力清单：${p.capabilities.join("、")}`);
    // 账号定位 facet 补全 — the richer self-knowledge the downstream node grounds against.
    const f = p.facets;
    if (f) {
      if (f.contentScope) lines.push(`内容范围：${f.contentScope}`);
      if (f.avoid) lines.push(`不做什么：${f.avoid}`);
      if (f.corePain) lines.push(`核心痛点：${f.corePain}`);
      if (f.coreValue) lines.push(`核心价值：${f.coreValue}`);
      if (f.tone) lines.push(`表达风格：${f.tone}`);
      if (f.statusNote) lines.push(`当前状态：${f.statusNote}`);
    }
    // 定位规则（供下游模块使用）— injected as explicit HARD constraints so the agent
    // treats them as rules, not background. This is the "定位规则约束下游" landing point.
    const r = p.downstreamRules;
    if (r) {
      const ruleLines: string[] = [];
      if (r.topicRule) ruleLines.push(`· 选题规则：${r.topicRule}`);
      if (r.scriptRule) ruleLines.push(`· 写稿规则：${r.scriptRule}`);
      if (r.projectRule) ruleLines.push(`· 项目规则：${r.projectRule}`);
      if (r.forbidRule) ruleLines.push(`· 禁止事项：${r.forbidRule}`);
      if (r.expressionRule) ruleLines.push(`· 表达风格规则：${r.expressionRule}`);
      if (ruleLines.length > 0) {
        lines.push(`【定位规则（必须遵守）】\n${ruleLines.join("\n")}`);
      }
    }
  }
  return lines.join("\n");
}
