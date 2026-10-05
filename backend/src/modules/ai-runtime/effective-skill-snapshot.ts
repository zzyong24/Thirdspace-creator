import type { RequestContext } from "@creatoros/contract";
import type {
  CompletionPolicyV1,
  EffectiveSkillSnapshotV1,
  OfficialSkillBase,
} from "@creatoros/ai-worker";

export type EffectiveSkillSnapshotErrorCode =
  | "SKILL_TASK_MAPPING_MISSING"
  | "SKILL_SNAPSHOT_INCOMPLETE"
  | "SKILL_OVERLAY_INCOMPATIBLE"
  | "SKILL_SNAPSHOT_TOO_LARGE"
  | "SKILL_SNAPSHOT_ACCOUNT_MISMATCH";

const ERROR_STATUS: Record<EffectiveSkillSnapshotErrorCode, number> = {
  SKILL_TASK_MAPPING_MISSING: 422,
  SKILL_SNAPSHOT_INCOMPLETE: 422,
  SKILL_OVERLAY_INCOMPATIBLE: 422,
  SKILL_SNAPSHOT_TOO_LARGE: 413,
  SKILL_SNAPSHOT_ACCOUNT_MISMATCH: 403,
};

export class EffectiveSkillSnapshotError extends Error {
  readonly status: number;

  constructor(
    readonly code: EffectiveSkillSnapshotErrorCode,
    message: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(`[${code}] ${message}`);
    this.name = "EffectiveSkillSnapshotError";
    this.status = ERROR_STATUS[code];
  }
}

export const EFFECTIVE_SKILL_SNAPSHOT_MAX_BYTES = 256 * 1024;

/**
 * ai-worker official registry 的内置 Skill task 集合。
 * 新增 official Skill 时必须同步更新这份确定性注册表；未知 taskType 一律 fail closed。
 */
export const REGISTERED_SKILL_TASK_TYPES = [
  "agentic.research", "agentic.material", "agentic.collect",
  "asset.classify",
  "material.extract",
  "benchmark.teardown",
  "calibration.diagnose",
  "calibration.score",
  "chatbox.canvas",
  "chatbox.calibration",
  "chatbox.canvas",
  "chatbox.distill",
  "chatbox.positioning",
  "chatbox.review",
  "chatbox.topic",
  "comment.qa-sift",
  "copilot.assist",
  "cover.brief",
  "creatoros.guide",
  "favorites.triage",
  "intelligence.topic-adapted-draft",
  "intelligence.topic-decompose",
  "intelligence.topic-from-decomposition",
  "knowledge.classify",
  "knowledge.distill",
  "knowledge.relate",
  "material.match",
  "planning.contract",
  "planning.outline",
  "planning.thesis",
  "platform.adapt",
  "positioning.generate",
  "reconstruct.project",
  "research.gather",
  "review.insights",
  "script.draft",
  "script.source_similarity",
  "script.storyboard.segment",
  "script.voiceover.compose",
  "script.review",
  "topic.attribution",
  "topic.enrich",
  "topic.generate",
  "topic.preference",
  "trend.extract",
  "video.broll",
  "video.cards",
  "video.director",
  "video.scenes",
  "video.subtitles",
  "wechat.article-draft",
  "wechat.article-text",
  "graphic.post-text",
  "graphic.card-brief",
  "publication.text",
  "work.review",
  "production.rough-cut",
] as const;

const REGISTERED_SKILLS = new Set<string>(REGISTERED_SKILL_TASK_TYPES);
const TASK_ALIASES: Readonly<Record<string, readonly string[]>> = {
  "production.rough-cut.propose": ["production.rough-cut"],
  "moments.draft": ["moments.compose"],
  "review.analyze": ["review.insights"],
  "cover.generate": ["cover.brief"],
  "graphic.card.generate": ["graphic.card-brief"],
  "publish.platform_adapt": ["platform.adapt"],
  "research.gather_material": ["research.gather"],
  "script.generate": [
    "script.draft",
  "script.source_similarity",
    "script.storyboard.segment",
    "script.voiceover.compose",
  ],
  "script.rewrite": [
    "script.draft",
  "script.source_similarity",
    "script.storyboard.segment",
    "script.voiceover.compose",
  ],
  script_polish: [
    "script.draft",
  "script.source_similarity",
    "script.storyboard.segment",
    "script.voiceover.compose",
  ],
  // 定时采集任务的 taskType 是 `scheduled.${sourceKind}`。其中四类采集器会在同一
  // task/lease 内继续调用 Skill；这里必须把完整闭包固化进创建时 snapshot，不能等
  // runner 启动后再读当前账号配置（否则重试与并发账号会漂移）。
  "scheduled.benchmark": ["benchmark.teardown"],
  "scheduled.favorites": ["favorites.triage", "knowledge.distill"],
  "scheduled.self.detail": ["topic.attribution"],
  // T-600 后 self.metrics 委托 canonical self.detail collector，必须冻结同一归因 Skill；
  // 否则采集主体成功、尾部 topic attribution 全部报 snapshot incomplete。
  "scheduled.self.metrics": ["topic.attribution"],
  "scheduled.topic.daily": ["topic.generate", "topic.query-plan", "trend.extract"],
};
const NON_SKILL_TASK_TYPES = new Set([
  // 原资产音频识别透传事实，不执行创作选择；配置、预算与供应商证明仍由原ASR执行核验。
  "asset.asr",
  "scheduled.self.traffic",
  "agentic.research",
  "asset.classify",
  "asset.generate",
  "benchmark.collect",
  "echo.manifest",
  "exec.agentic.collect",
  "exec.agentic.material",
  "exec.agentic.research",
  "exec.echo.manifest",
  "exec.video.render",
  // 真实媒体探针只读文件元数据，不调用模型或进行创作判断。
  "exec.media.probe",
  "media.probe",
  "material.extract",
  "scheduled.comments",
  // 内容雷达聚合作业只扫描到期来源并排 source_sync 持久子任务，本身不调用 Skill。
  "scheduled.intelligence.sync",
  "transcribe.douyin",
  "video.render",
]);
const VIDEO_SKILLS = [
  "video.broll",
  "video.cards",
  "video.director",
  "video.scenes",
  "video.subtitles",
] as const;
const VIDEO_DECISION_SKILLS = ["material.match", ...VIDEO_SKILLS] as const;
const VIDEO_KIND_TO_SKILL: Readonly<Record<string, string>> = {
  broll: "video.broll",
  cards: "video.cards",
  scenes: "video.scenes",
  subtitles: "video.subtitles",
};
export const CHAT_METHOD_SKILL_IDS = ["method.research", "method.positioning", "method.topic", "method.planning", "method.writing", "method.visual", "method.publishing", "method.review", "method.knowledge", "method.guide", "method.redfox.topic-research", "method.redfox.benchmark", "method.operations.review"] as const;
const CHAT_SURFACE_TO_SKILL: Readonly<Record<string, string>> = {
  canvas:"chatbox.canvas",
  calibration: "chatbox.calibration",
  distill: "chatbox.distill",
  "knowledge-distill": "chatbox.distill",
  positioning: "chatbox.positioning",
  project: "chatbox.topic",
  review: "chatbox.review",
  topic: "chatbox.topic",
  topics: "chatbox.topic",
};

function mappingMissing(taskType: string, reason?: string): never {
  throw new EffectiveSkillSnapshotError(
    "SKILL_TASK_MAPPING_MISSING",
    `taskType "${taskType}" 未登记有效 Skill 映射${reason ? `：${reason}` : ""}`,
    { taskType },
  );
}

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

/**
 * taskType → required Skill 的单一确定性注册表。
 * `inputData.skillId` 永远不参与决策，video/chat 只接受受控枚举。
 */
export function requiredSkillIdsForTask(
  taskType: string,
  inputData: Readonly<Record<string, unknown>>,
): readonly string[] {
  if (taskType === "topic.generate" && inputData.basis === "trend") return ["topic.generate", "topic.query-plan", "trend.extract"];
  if (taskType === "script.draft") {
    return [
      "script.draft",
  "script.source_similarity",
      "script.storyboard.segment",
      "script.voiceover.compose",
    ];
  }
  if (REGISTERED_SKILLS.has(taskType)) return [taskType];
  const aliases = TASK_ALIASES[taskType];
  if (aliases) return [...aliases];
  if (NON_SKILL_TASK_TYPES.has(taskType)) return [];

  if (taskType === "video.decisions") {
    if (inputData.kind === undefined && inputData.kinds === undefined) {
      // video.broll 只负责产画面需求，真实项目素材统一由 material.match 选取。
      // 两者必须冻结在同一 task snapshot；否则 runner 会在调用 material.match 前
      // 因能力快照缺失而静默降级，表现为用户上传了素材却永远进不了时间线。
      return [...VIDEO_DECISION_SKILLS];
    }
    const kinds = Array.isArray(inputData.kinds)
      ? inputData.kinds
      : [inputData.kind];
    if (
      kinds.length === 0 ||
      kinds.some(
        (kind) =>
          typeof kind !== "string" || VIDEO_KIND_TO_SKILL[kind] === undefined,
      )
    ) {
      return mappingMissing(taskType, "video kind 不在受控枚举内");
    }
    const required = kinds.map(
      (kind) => VIDEO_KIND_TO_SKILL[kind as string]!,
    );
    if (kinds.includes("broll")) required.push("material.match");
    return sortedUnique(required);
  }

  if (taskType === "chat.sync") {
    const surface = inputData.surface;
    if (typeof surface !== "string" || !CHAT_SURFACE_TO_SKILL[surface]) {
      return mappingMissing(taskType, "chat surface 不在受控枚举内");
    }
    return surface === "topics" || surface === "project"
      ? [CHAT_SURFACE_TO_SKILL[surface]!, "creatoros.guide", "research.plan", ...CHAT_METHOD_SKILL_IDS]
      : [CHAT_SURFACE_TO_SKILL[surface]!, "research.plan", ...CHAT_METHOD_SKILL_IDS];
  }

  return mappingMissing(taskType);
}

export interface OfficialSkillProvider {
  get(skillId: string): OfficialSkillBase | null;
  list(): OfficialSkillBase[];
  platformPolicy(): { version: string; text: string };
}

export interface AccountSkillOverlayRuntimeRow {
  userId: string;
  accountId: string | null;
  groupId?: string | null;
  skillId: string;
  rowRevision: number;
  observedBaseVersion: string;
  overlayVersion: string | null;
  overlay: unknown;
}

export interface AccountSkillOverlayReader {
  listBySkillIds(
    ctx: RequestContext,
    skillIds: readonly string[],
  ): Promise<AccountSkillOverlayRuntimeRow[]>;
}

export interface EffectiveSkillSnapshotResolverDeps {
  officialSkills: OfficialSkillProvider;
  accountOverlays: AccountSkillOverlayReader;
  groupOverlays?: AccountSkillOverlayReader;
  now?: () => string;
}

export type EffectiveSkillSnapshotResolver = (
  ctx: RequestContext,
  requiredSkillIds: readonly string[],
) => Promise<EffectiveSkillSnapshotV1>;

type OverlayField =
  | "system"
  | "template"
  | "tools"
  | "requiredFacets"
  | "outputSchema"
  | "completionPolicy";

const OVERLAY_FIELDS = new Set<OverlayField>([
  "system",
  "template",
  "tools",
  "requiredFacets",
  "outputSchema",
  "completionPolicy",
]);
const PLACEHOLDER = /\{\{\s*([A-Za-z][A-Za-z0-9_]*)\s*\}\}/g;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.every((entry) => typeof entry === "string" && entry.trim().length > 0)
  );
}

function isPolicy(value: unknown): value is CompletionPolicyV1 {
  if (!isRecord(value)) return false;
  return (
    value.schemaVersion === 1 &&
    Number.isInteger(value.minSegments) &&
    (value.minSegments as number) >= 1 &&
    (value.minSegments as number) <= 100 &&
    (value.maxSegments === null ||
      (Number.isInteger(value.maxSegments) &&
        (value.maxSegments as number) >= (value.minSegments as number) &&
        (value.maxSegments as number) <= 100)) &&
    isStringArray(value.requiredSequence) &&
    value.requiredSequence.length <= 20 &&
    Number.isInteger(value.repairAttempts) &&
    (value.repairAttempts as number) >= 0 &&
    (value.repairAttempts as number) <= 3
  );
}

function isAdapter(
  value: unknown,
): value is { id: string; version: string } {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    value.id.trim().length > 0 &&
    typeof value.version === "string" &&
    value.version.trim().length > 0
  );
}

function placeholders(template: string): string[] {
  return [...template.matchAll(PLACEHOLDER)].map((match) => match[1]!);
}

function cloneJson<T>(value: T): T {
  return structuredClone(value);
}

function assertOfficialBase(
  requestedId: string,
  base: OfficialSkillBase | null,
): asserts base is OfficialSkillBase {
  if (
    !base ||
    base.skillId !== requestedId ||
    !base.baseVersion?.trim() ||
    typeof base.methodSystem !== "string" ||
    typeof base.template !== "string" ||
    !isStringArray(base.tools) ||
    !isStringArray(base.requiredFacets) ||
    !isStringArray(base.contextRequirements) ||
    !isStringArray(base.availableFacets) ||
    !Array.isArray(base.editableFields) ||
    (base.outputSchema !== null && !isRecord(base.outputSchema)) ||
    (base.completionPolicy !== null && !isPolicy(base.completionPolicy)) ||
    (base.completionPolicyAdapter !== null &&
      !isAdapter(base.completionPolicyAdapter))
  ) {
    throw new EffectiveSkillSnapshotError(
      "SKILL_SNAPSHOT_INCOMPLETE",
      `official Skill "${requestedId}" 缺失或字段不完整`,
      { skillId: requestedId },
    );
  }
}

function overlayIncompatible(
  row: AccountSkillOverlayRuntimeRow,
  reasons: string[],
): never {
  throw new EffectiveSkillSnapshotError(
    "SKILL_OVERLAY_INCOMPATIBLE",
    `账号 Skill 覆盖与当前 official base 不兼容: ${row.skillId}`,
    { skillId: row.skillId, reasons },
  );
}

function normalizedOverlay(
  base: OfficialSkillBase,
  row: AccountSkillOverlayRuntimeRow,
): Partial<Record<OverlayField, unknown>> {
  if (!isRecord(row.overlay)) {
    return overlayIncompatible(row, ["overlay 不是对象"]);
  }
  const reasons: string[] = [];
  // observedBaseVersion 只是写入时的审计锚。base 升级后必须针对当前 official
  // 重新跑下方字段/tools/facets/schema/policy 兼容性检查，版本号变化本身不判失败。
  if (!Number.isInteger(row.rowRevision) || row.rowRevision < 1) {
    reasons.push("rowRevision 必须为正整数");
  }

  const editable = new Set<string>(base.editableFields);
  const overlay: Partial<Record<OverlayField, unknown>> = {};
  for (const [key, value] of Object.entries(row.overlay)) {
    if (!OVERLAY_FIELDS.has(key as OverlayField) || !editable.has(key)) {
      reasons.push(`字段 ${key} 不可覆盖`);
      continue;
    }
    if (value !== null && value !== undefined) {
      overlay[key as OverlayField] = value;
    }
  }

  if (overlay.system !== undefined && typeof overlay.system !== "string") {
    reasons.push("system 必须为字符串");
  }
  if (overlay.template !== undefined && typeof overlay.template !== "string") {
    reasons.push("template 必须为字符串");
  }
  if (overlay.tools !== undefined && !isStringArray(overlay.tools)) {
    reasons.push("tools 必须为非空字符串数组");
  }
  if (
    overlay.requiredFacets !== undefined &&
    !isStringArray(overlay.requiredFacets)
  ) {
    reasons.push("requiredFacets 必须为非空字符串数组");
  }
  if (
    overlay.outputSchema !== undefined &&
    !isRecord(overlay.outputSchema)
  ) {
    reasons.push("outputSchema 必须为 JSON object");
  }
  if (
    overlay.completionPolicy !== undefined &&
    !isPolicy(overlay.completionPolicy)
  ) {
    reasons.push("completionPolicy 不是合法 CompletionPolicyV1");
  }

  if (isStringArray(overlay.tools)) {
    const officialTools = new Set(base.tools);
    for (const tool of overlay.tools) {
      if (!officialTools.has(tool)) reasons.push(`工具 ${tool} 不在官方白名单`);
    }
  }
  const effectiveTemplate =
    typeof overlay.template === "string" ? overlay.template : base.template;
  const effectiveRequired = isStringArray(overlay.requiredFacets)
    ? overlay.requiredFacets
    : base.requiredFacets;
  const availableFacets = new Set(base.availableFacets);
  for (const facet of new Set([
    ...effectiveRequired,
    ...placeholders(effectiveTemplate),
  ])) {
    if (!availableFacets.has(facet)) {
      reasons.push(`上下文字段 ${facet} 没有官方 reader`);
    }
  }

  const effectivePolicy =
    overlay.completionPolicy === undefined
      ? base.completionPolicy
      : (overlay.completionPolicy as CompletionPolicyV1);
  const effectiveSchema =
    overlay.outputSchema === undefined
      ? base.outputSchema
      : (overlay.outputSchema as Record<string, unknown>);
  if (
    effectivePolicy &&
    (!base.completionPolicyAdapter || !effectiveSchema)
  ) {
    reasons.push("completionPolicy 缺少 official adapter 或 outputSchema");
  }

  if (reasons.length > 0) overlayIncompatible(row, reasons);
  return overlay;
}

function accountMismatch(
  message: string,
  details: Record<string, unknown>,
): never {
  throw new EffectiveSkillSnapshotError(
    "SKILL_SNAPSHOT_ACCOUNT_MISMATCH",
    message,
    details,
  );
}

function mergeSkill(
  base: OfficialSkillBase,
  row: AccountSkillOverlayRuntimeRow | undefined,
): EffectiveSkillSnapshotV1["skills"][number] {
  const overlay = row ? normalizedOverlay(base, row) : {};
  return {
    skillId: base.skillId,
    baseVersion: base.baseVersion,
    overlayRevision: row?.rowRevision ?? null,
    overlayVersion: row?.overlayVersion ?? null,
    effective: {
      methodSystem:
        typeof overlay.system === "string"
          ? overlay.system
          : base.methodSystem,
      template:
        typeof overlay.template === "string"
          ? overlay.template
          : base.template,
      tools: cloneJson(
        isStringArray(overlay.tools) ? overlay.tools : base.tools,
      ),
      requiredFacets: cloneJson(
        isStringArray(overlay.requiredFacets)
          ? overlay.requiredFacets
          : base.requiredFacets,
      ),
      contextRequirements: cloneJson(base.contextRequirements),
      outputSchema: cloneJson(
        isRecord(overlay.outputSchema)
          ? overlay.outputSchema
          : base.outputSchema,
      ),
      completionPolicy: cloneJson(
        isPolicy(overlay.completionPolicy)
          ? overlay.completionPolicy
          : base.completionPolicy,
      ),
      completionPolicyAdapter: cloneJson(base.completionPolicyAdapter),
    },
  };
}

/**
 * 组合根 factory：把 official provider、account reader 与时钟注入后，得到 CONTRACT
 * `resolveEffectiveSkillSnapshot(ctx, ids)` 的二参端口。
 */
export function createEffectiveSkillSnapshotResolver(
  deps: EffectiveSkillSnapshotResolverDeps,
): EffectiveSkillSnapshotResolver {
  return async (ctx, requiredSkillIds) => {
    const accountId = ctx.accountId?.trim() ?? null;
    const groupId = ctx.groupId?.trim() ?? null;
    if (!ctx.userId.trim() || (!accountId && !groupId)) {
      return accountMismatch("解析 Skill snapshot 缺少有效 user/account owner", {
        userId: ctx.userId,
        accountId: ctx.accountId ?? null,
      });
    }
    if (
      requiredSkillIds.some(
        (skillId) => typeof skillId !== "string" || !skillId.trim(),
      )
    ) {
      throw new EffectiveSkillSnapshotError(
        "SKILL_SNAPSHOT_INCOMPLETE",
        "requiredSkillIds 含空值",
      );
    }
    const skillIds = sortedUnique(requiredSkillIds);
    const rows =
      skillIds.length === 0
        ? []
        : groupId ? await deps.groupOverlays?.listBySkillIds(ctx, skillIds) ?? [] : await deps.accountOverlays.listBySkillIds(ctx, skillIds);
    const requested = new Set(skillIds);
    const rowBySkill = new Map<string, AccountSkillOverlayRuntimeRow>();
    for (const row of rows) {
      if (
        row.userId !== ctx.userId ||
        (groupId ? row.groupId !== groupId : row.accountId !== accountId) ||
        !requested.has(row.skillId)
      ) {
        return accountMismatch("overlay reader 返回了跨属主或非请求 Skill 行", {
          expectedUserId: ctx.userId,
          expectedAccountId: accountId,
          actualUserId: row.userId,
          actualAccountId: row.accountId,
          skillId: row.skillId,
        });
      }
      if (rowBySkill.has(row.skillId)) {
        throw new EffectiveSkillSnapshotError(
          "SKILL_OVERLAY_INCOMPATIBLE",
          `overlay reader 返回重复 Skill 行: ${row.skillId}`,
          { skillId: row.skillId },
        );
      }
      rowBySkill.set(row.skillId, row);
    }

    const policy = deps.officialSkills.platformPolicy();
    if (!policy.version?.trim() || !policy.text?.trim()) {
      throw new EffectiveSkillSnapshotError(
        "SKILL_SNAPSHOT_INCOMPLETE",
        "server official provider 未提供完整 platform policy",
      );
    }

    const skills = skillIds.map((skillId) => {
      const base = deps.officialSkills.get(skillId);
      assertOfficialBase(skillId, base);
      return mergeSkill(base, rowBySkill.get(skillId));
    });
    const snapshot: EffectiveSkillSnapshotV1 = {
      snapshotVersion: 1,
      userId: ctx.userId,
      accountId,groupId,groupVersion:ctx.groupVersion??null,membershipVersion:ctx.membershipVersion??null,
      resolvedAt: (deps.now ?? (() => new Date().toISOString()))(),
      platformPolicyVersion: policy.version,
      platformPolicy: policy.text,
      skills,
    };
    // 同一条 helper 同时承担完整 shape 与 UTF-8 256 KiB gate。
    serializeEffectiveSkillSnapshot(snapshot);
    return snapshot;
  };
}

/**
 * 便于低层组合/测试直接调用的显式端口实现。生产组合根推荐先用 factory 固定 deps，
 * 对外只暴露 CONTRACT 的 `(ctx, requiredSkillIds)` 二参函数。
 */
export async function resolveEffectiveSkillSnapshot(
  ctx: RequestContext,
  requiredSkillIds: readonly string[],
  deps: EffectiveSkillSnapshotResolverDeps,
): Promise<EffectiveSkillSnapshotV1> {
  return createEffectiveSkillSnapshotResolver(deps)(ctx, requiredSkillIds);
}

function assertSnapshot(
  value: unknown,
): asserts value is EffectiveSkillSnapshotV1 {
  if (!isRecord(value)) {
    throw new EffectiveSkillSnapshotError(
      "SKILL_SNAPSHOT_INCOMPLETE",
      "snapshot 不是对象",
    );
  }
  if (
    value.snapshotVersion !== 1 ||
    typeof value.userId !== "string" ||
    !value.userId.trim() ||
    (value.accountId !== null && (typeof value.accountId !== "string" || !value.accountId.trim())) ||
    (!(typeof value.groupId === "string" && value.groupId.trim()) && !value.accountId) ||
    typeof value.resolvedAt !== "string" ||
    Number.isNaN(Date.parse(value.resolvedAt)) ||
    typeof value.platformPolicyVersion !== "string" ||
    !value.platformPolicyVersion.trim() ||
    typeof value.platformPolicy !== "string" ||
    !value.platformPolicy.trim() ||
    !Array.isArray(value.skills)
  ) {
    throw new EffectiveSkillSnapshotError(
      "SKILL_SNAPSHOT_INCOMPLETE",
      "snapshot owner、版本、时间或 platform policy 不完整",
    );
  }

  let previous = "";
  for (const rawSkill of value.skills) {
    if (!isRecord(rawSkill) || !isRecord(rawSkill.effective)) {
      throw new EffectiveSkillSnapshotError(
        "SKILL_SNAPSHOT_INCOMPLETE",
        "snapshot skills 含非法条目",
      );
    }
    const skill = rawSkill;
    const effective = rawSkill.effective;
    if (
      typeof skill.skillId !== "string" ||
      !skill.skillId.trim() ||
      (previous !== "" && previous >= skill.skillId) ||
      typeof skill.baseVersion !== "string" ||
      !skill.baseVersion.trim() ||
      (skill.overlayRevision !== null &&
        (!Number.isInteger(skill.overlayRevision) ||
          (skill.overlayRevision as number) < 1)) ||
      (skill.overlayVersion !== null &&
        (typeof skill.overlayVersion !== "string" ||
          !skill.overlayVersion.trim())) ||
      typeof effective.methodSystem !== "string" ||
      typeof effective.template !== "string" ||
      !isStringArray(effective.tools) ||
      !isStringArray(effective.requiredFacets) ||
      !isStringArray(effective.contextRequirements) ||
      (effective.outputSchema !== null &&
        !isRecord(effective.outputSchema)) ||
      (effective.completionPolicy !== null &&
        !isPolicy(effective.completionPolicy)) ||
      (effective.completionPolicyAdapter !== null &&
        !isAdapter(effective.completionPolicyAdapter))
    ) {
      throw new EffectiveSkillSnapshotError(
        "SKILL_SNAPSHOT_INCOMPLETE",
        `snapshot Skill 条目不完整或未严格升序: ${String(skill.skillId ?? "")}`,
      );
    }
    previous = skill.skillId;
  }
}

export function serializeEffectiveSkillSnapshot(
  snapshot: EffectiveSkillSnapshotV1,
): string {
  assertSnapshot(snapshot);
  let serialized: string;
  try {
    serialized = JSON.stringify(snapshot);
  } catch (error) {
    throw new EffectiveSkillSnapshotError(
      "SKILL_SNAPSHOT_INCOMPLETE",
      `snapshot 无法 JSON 序列化: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  const bytes = Buffer.byteLength(serialized, "utf8");
  if (bytes > EFFECTIVE_SKILL_SNAPSHOT_MAX_BYTES) {
    throw new EffectiveSkillSnapshotError(
      "SKILL_SNAPSHOT_TOO_LARGE",
      `Skill snapshot 为 ${bytes} bytes，超过 ${EFFECTIVE_SKILL_SNAPSHOT_MAX_BYTES} bytes`,
      { bytes, maxBytes: EFFECTIVE_SKILL_SNAPSHOT_MAX_BYTES },
    );
  }
  return serialized;
}

export function parseEffectiveSkillSnapshot(
  serialized: string,
): EffectiveSkillSnapshotV1 {
  const bytes = Buffer.byteLength(serialized, "utf8");
  if (bytes > EFFECTIVE_SKILL_SNAPSHOT_MAX_BYTES) {
    throw new EffectiveSkillSnapshotError(
      "SKILL_SNAPSHOT_TOO_LARGE",
      `Skill snapshot 为 ${bytes} bytes，超过 ${EFFECTIVE_SKILL_SNAPSHOT_MAX_BYTES} bytes`,
      { bytes, maxBytes: EFFECTIVE_SKILL_SNAPSHOT_MAX_BYTES },
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch (error) {
    throw new EffectiveSkillSnapshotError(
      "SKILL_SNAPSHOT_INCOMPLETE",
      `Skill snapshot JSON 无法解析: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  assertSnapshot(parsed);
  return parsed;
}
