import "server-only";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

import { lessonPointsToMarkdown } from "@/features/knowledge/knowledge-lesson-content";

// win-video-tutor 22 节课程 → CreatorOS 知识库 seed。
//
// 用户给了一份 22 节完整短视频课程(`win-video-tutor` skill)的 zip,装在
// `~/.claude/skills/win-video-tutor/knowledge/{01..22}.md`。需求是:canonical user
// 首次启动时把 22 节落到自家 knowledge_items 表里(每节 1 个 reference 类型的
// knowledgeItem + 1 个 revision,content 存整篇 markdown)——
// 知识库开箱就有真内容(不是空)且可被项目弹药、复盘、对话蒸馏消费。
//
// 实现要点:
//   1. 运行时 fs.readFile 读源文件(用户本机 ~/.claude/skills/...)—— 文件缺失 → 安静
//      返回(该 skill 没装到本机是合法状态,绝不能因此炸 buildPersistence)。
//   2. 解析每个 .md 头几行 YAML-like 抽 module/lesson 标题(失败时 fallback 标题)。
//   3. 幂等:每节写入前先看 source_metadata->>'origin'='win-video-tutor' AND
//      source_metadata->>'lessonNumber'=<N> 是否已存在 → 存在则 skip(重装 / 重启安全)。
//   4. 每节 = 1 个 knowledgeItem(`reference` 类型,知识型,适合整节课程归档)+ 1 个
//      revision(content=课程 YAML 转成的**可读 markdown**(带小标题:一句话/正文/案例/
//      易错点/苏格拉底提问/实践作业),而非原始 YAML dump —— 新装机预览直接可读
//      [T-198];解析不出则诚实退回原文)。
//   5. sourceType='import' + sourceMetadata.origin='win-video-tutor' / lessonNumber /
//      module,标记来源可追溯。

const SEED_ORIGIN = "win-video-tutor";

// [T-211] 旧标题品牌前缀。用户裁决:课程保留作预设,但标题去掉「Win 短视频私教 · 」
// 品牌前缀(新 seed 用不带前缀的模板)。存量装机(seed 早于本改动)的 22 条仍带此
// 前缀 → 由 persistence-client 的启动 fixup 按此常量幂等 strip(见 fixupWinVideoTutorTitles)。
export const WIN_VIDEO_TUTOR_LEGACY_TITLE_PREFIX = "Win 短视频私教 · ";
function resolveDefaultSkillPath(): string {
  // 测试可经 env 切到 tmp 目录(避免测试耦合用户真 home);env="0" 显禁用
  // (生产不需要时也可关)。缺省走 ~/.claude/skills/win-video-tutor。
  const envPath = process.env.CREATOROS_WIN_VIDEO_TUTOR_SKILL_PATH;
  if (envPath === "0") {
    return path.join(os.tmpdir(), "win-video-tutor-DISABLED");
  }
  if (envPath && envPath.length > 0) {
    return envPath;
  }
  return path.join(os.homedir(), ".claude", "skills", "win-video-tutor");
}
function resolveDefaultKnowledgeDir(): string {
  return path.join(resolveDefaultSkillPath(), "knowledge");
}

interface ParsedLesson {
  readonly lessonNumber: number; // 1..22
  readonly title: string; // 文件解析不出时用「第 N 节」兜底
  readonly module: string; // 解析不出空串
  readonly content: string; // 整个 .md
}

interface KnowledgeItemLike {
  readonly id?: string;
  readonly knowledgeType?: string;
  readonly sourceType?: string;
  // 真实 repo 返回的 sourceMetadata 是 unknown(jsonb 任意);判 origin 时做 typeof 检查。
  readonly sourceMetadata?: unknown;
}

/** 兼容真实的 KnowledgeService 接口 — ctx 走 unknown 避坑 RequestContext 全字段耦合
 * (seed 只用 userId + accountId,接口不该管 service 不读的字段)。 */
type KnowledgeServiceCtx = unknown;

interface KnowledgeServiceLike {
  listKnowledge(ctx: KnowledgeServiceCtx): Promise<ReadonlyArray<KnowledgeItemLike>>;
  createKnowledge(
    ctx: KnowledgeServiceCtx,
    input: {
      title: string;
      knowledgeType: "note" | "reference" | "inspiration" | "snippet" | "transcript" | "claim" | "evidence" | "quote" | "qa";
      content: string;
      sourceType: "manual" | "web" | "import" | "ai";
      sourceMetadata: Record<string, unknown>;
    },
  ): Promise<{ id: string }>;
}

/**
 * [T-218] tag 写侧最小契约 —— 结构化匹配真实 TaxonomyService(create/list/assign),
 * 只声明 seed/fixup 用得到的三个方法(name→tagId get-or-create + entity_tags 挂载)。
 * 观点地图(assembleAtlas)按 tag 聚类知识,但 seed 从不建 tag → 开箱即空。这里给每节
 * 挂「module」tag(同模块聚一簇,确定性、语义正确、无需 AI)。
 */
interface TaxonomyTaggerLike {
  listTags(
    ctx: KnowledgeServiceCtx,
    query: { limit?: number; offset?: number },
  ): Promise<ReadonlyArray<{ readonly id: string; readonly name: string }>>;
  createTag(
    ctx: KnowledgeServiceCtx,
    input: { name: string; color?: string; kind?: string },
  ): Promise<{ readonly id: string; readonly name: string }>;
  assignTags(
    ctx: KnowledgeServiceCtx,
    input: { entityType: string; entityId: string; tagIds: string[] },
  ): Promise<unknown>;
}

// 观点地图读侧(knowledge-data.ts assembleAtlas)只认 entityType==="knowledge",
// 挂载必须用这个 entity 类型(与 taxonomy contract 的 tagEntityType 枚举一致)。
const KNOWLEDGE_ENTITY_TYPE = "knowledge";

/**
 * [T-218] 给一批 seed 知识条目按其 `module` 幂等挂 tag(get-or-create tag → assign)。
 * 幂等来源:①tag 名 per-user 唯一(tags_user_name_uq)→ createTag 冲突退回按名查;
 * ②entity_tags (tag,entity) 唯一(entity_tags_tag_entity_uq)+ service assignTags 的
 * onConflictDoNothing → 重复 assign 不重复挂、不虚增 usageCount。单条失败不牵连其余。
 *
 * @returns 成功挂上(或已挂)的 (item→tag) 数。
 */
async function assignModuleTags(
  taxonomyService: TaxonomyTaggerLike,
  ctx: KnowledgeServiceCtx,
  entries: ReadonlyArray<{ knowledgeId: string; module: string }>,
): Promise<number> {
  // 预热 name→tagId 缓存(一次读),省得每个 module 都 create-then-catch。
  const cache = new Map<string, string>();
  try {
    const existing = await taxonomyService.listTags(ctx, {});
    for (const t of existing) cache.set(t.name, t.id);
  } catch {
    // 读失败不致命 —— 下面按需 createTag 兜底。
  }

  let assigned = 0;
  for (const { knowledgeId, module } of entries) {
    const name = module.trim();
    if (name.length === 0 || !knowledgeId) continue; // 无 module 的节跳过(不硬造空 tag)
    let tagId = cache.get(name);
    if (!tagId) {
      try {
        const created = await taxonomyService.createTag(ctx, { name });
        tagId = created.id;
        cache.set(name, tagId);
      } catch {
        // DuplicateTagError / 并发竞态 → 按名重查一次。
        try {
          const all = await taxonomyService.listTags(ctx, {});
          const found = all.find((t) => t.name === name);
          if (found) {
            tagId = found.id;
            cache.set(name, tagId);
          }
        } catch {
          // 仍失败 → 跳过该节,不阻断其余。
        }
      }
    }
    if (!tagId) continue;
    try {
      await taxonomyService.assignTags(ctx, {
        entityType: KNOWLEDGE_ENTITY_TYPE,
        entityId: knowledgeId,
        tagIds: [tagId],
      });
      assigned += 1;
    } catch (err) {
      console.error(
        `[seed] win-video-tutor 挂 module tag 失败(${name} → ${knowledgeId}):`,
        err instanceof Error ? err.message : err,
      );
    }
  }
  return assigned;
}

/**
 * [T-218] 存量回填:对已存在的 origin=win-video-tutor 知识条目(现网那 22/23 条),
 * 若还没挂 module tag 就补挂 —— 用户不用 reset,下次启动观点地图即填充。幂等(重启不
 * 重复挂)。仿 persistence-client 的 fixupWinVideoTutorTitles 装配,由启动块调用。
 * module 从每条的 sourceMetadata.module 读回(seed 写入时落的)。
 *
 * @returns 补挂(或已挂)的 (item→tag) 数。
 */
export async function fixupWinVideoTutorModuleTags(
  knowledgeService: KnowledgeServiceLike,
  taxonomyService: TaxonomyTaggerLike,
  ctx: KnowledgeServiceCtx,
): Promise<number> {
  const items = await knowledgeService.listKnowledge(ctx);
  const entries: { knowledgeId: string; module: string }[] = [];
  for (const it of items) {
    const meta = it.sourceMetadata;
    if (
      typeof meta !== "object" ||
      meta === null ||
      (meta as { origin?: unknown }).origin !== SEED_ORIGIN
    ) {
      continue;
    }
    const moduleRaw = (meta as { module?: unknown }).module;
    const module = typeof moduleRaw === "string" ? moduleRaw : "";
    if (module.trim().length === 0 || !it.id) continue;
    entries.push({ knowledgeId: it.id, module });
  }
  if (entries.length === 0) return 0;
  return assignModuleTags(taxonomyService, ctx, entries);
}

/**
 * 解析 01.md 头几行的 YAML-like 字段,抽 module + title。
 * 例(01.md):
 *   - id: KP-01-1
 *     lesson: 1
 *     module: 认知定位
 *     title: 粉丝经济的核心公式...
 * 第一行 `- id:` → 后续行是 indented。模块是从 `- id:` 后的几行搜出来。
 */
function parseLessonFrontmatter(raw: string): { module: string; title: string } {
  const lines = raw.split("\n");
  let module = "";
  let title = "";
  for (let i = 0; i < Math.min(lines.length, 12); i++) {
    const l = lines[i] ?? "";
    const moduleMatch = /^  module:\s*(.+?)\s*$/.exec(l);
    if (moduleMatch) module = moduleMatch[1] ?? "";
    const titleMatch = /^  title:\s*(.+?)\s*$/.exec(l);
    if (titleMatch) {
      title = (titleMatch[1] ?? "").trim();
      break;
    }
  }
  return { module, title };
}

async function parseLessonFile(filePath: string): Promise<ParsedLesson | null> {
  const base = path.basename(filePath);
  // 文件名形如 01.md,02.md,...,22.md
  const m = /^(\d{2})\.md$/.exec(base);
  if (!m) return null;
  const lessonNumber = Number(m[1]);
  if (lessonNumber < 1 || lessonNumber > 22) return null;

  const content = await fs.readFile(filePath, "utf8");
  const { module, title } = parseLessonFrontmatter(content);
  return {
    lessonNumber,
    title: title || `第 ${lessonNumber} 节`,
    module,
    content,
  };
}

async function isAlreadySeeded(
  knowledgeService: KnowledgeServiceLike,
  ctx: KnowledgeServiceCtx,
): Promise<boolean> {
  // 任一已种过的课就视为已 seed(避免漏种单课)。
  const items = await knowledgeService.listKnowledge(ctx);
  return items.some((it: KnowledgeItemLike) => {
    const meta = it.sourceMetadata;
    return (
      typeof meta === "object" &&
      meta !== null &&
      (meta as { origin?: unknown }).origin === SEED_ORIGIN
    );
  });
}

/**
 * 启动时跑(seed 失败不阻塞 app:本机未装该 skill 是合法状态,console.warn + 返回 0)。
 *
 * @param knowledgeService 知识库 service
 * @param ctx canonical user ctx(userId + accountId)
 * @param opts.skillPath 默认 `~/.claude/skills/win-video-tutor`,测试可传 tmp 目录
 * @param opts.taxonomyService [T-218] tag 写侧 service;传入则每节按 module 挂 tag
 *   (观点地图开箱即在)。不传则只建知识条目(向后兼容旧调用/测试)。
 * @returns 实际种入的知识条目数(0 = 已种过 / 文件缺失 / 失败)。
 */
export async function seedWinVideoTutor(
  knowledgeService: KnowledgeServiceLike,
  ctx: KnowledgeServiceCtx,
  opts: { skillPath?: string; taxonomyService?: TaxonomyTaggerLike } = {},
): Promise<number> {
  // opts.skillPath 优先 > env 旁路 > 默认 ~/.claude/skills/win-video-tutor
  const skillPath =
    opts.skillPath ??
    process.env.CREATOROS_WIN_VIDEO_TUTOR_SKILL_PATH ??
    (process.env.CREATOROS_WIN_VIDEO_TUTOR_SKILL_PATH === "0"
      ? path.join(os.tmpdir(), "win-video-tutor-DISABLED")
      : undefined) ??
    path.join(os.homedir(), ".claude", "skills", "win-video-tutor");
  const knowledgeDir = path.join(skillPath, "knowledge");

  if (await isAlreadySeeded(knowledgeService, ctx)) {
    return 0;
  }
  // 1. 读 22 个 .md
  let files: string[];
  try {
    files = (await fs.readdir(knowledgeDir))
      .filter((f) => /^\d{2}\.md$/.test(f))
      .sort();
  } catch (err) {
    // 该 skill 没装到本机(新人 / 其他机器)→ 安静返回。
    console.warn(
      `[seed] win-video-tutor 课程源不存在于 ${knowledgeDir}:`,
      err instanceof Error ? err.message : err,
    );
    return 0;
  }
  if (files.length === 0) {
    return 0;
  }

  // 2. 逐节 → 1 个 knowledgeItem + 1 个 revision
  let count = 0;
  // [T-218] 记下每节的 (knowledgeId, module),入库完成后统一挂 module tag。
  const taggedEntries: { knowledgeId: string; module: string }[] = [];
  for (const f of files) {
    const lesson = await parseLessonFile(path.join(knowledgeDir, f));
    if (!lesson) continue;
    try {
      // [T-198] 入库存可读 markdown(YAML → 带小标题);解析不出退回原文(诚实)。
      const readableContent =
        lessonPointsToMarkdown(lesson.content) ?? lesson.content;
      const created = await knowledgeService.createKnowledge(
        ctx,
        {
          // [T-211] 标题去品牌前缀「Win 短视频私教 · 」,只留课程/章节自然名。
          title: `第 ${lesson.lessonNumber} 节 · ${lesson.title}`,
          knowledgeType: "reference",
          content: readableContent,
          sourceType: "import",
          sourceMetadata: {
            origin: SEED_ORIGIN,
            lessonNumber: lesson.lessonNumber,
            module: lesson.module,
            skillPath,
          },
        },
      );
      count += 1;
      if (created?.id && lesson.module.trim().length > 0) {
        taggedEntries.push({ knowledgeId: created.id, module: lesson.module });
      }
    } catch (err) {
      // 单节失败不阻塞其他节 —— 跳过 + 记 log(用户可在知识库手动加)。
      console.error(
        `[seed] win-video-tutor 第 ${lesson.lessonNumber} 节入库失败:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  // [T-218] 3. 挂 module tag(观点地图按 tag 聚类,不挂则默认视图开箱空)。tag 写侧
  // 失败绝不回滚已入库的知识条目(派生索引纪律:业务真值优先,tag 是可回填的派生)。
  if (opts.taxonomyService && taggedEntries.length > 0) {
    try {
      const tagged = await assignModuleTags(
        opts.taxonomyService,
        ctx,
        taggedEntries,
      );
      if (tagged > 0) {
        console.log(`[seed] win-video-tutor 已按 module 挂 ${tagged} 条 tag`);
      }
    } catch (err) {
      console.error(
        "[seed] win-video-tutor 挂 module tag 整体失败(知识条目已入库,可由启动 fixup 回填):",
        err instanceof Error ? err.message : err,
      );
    }
  }

  return count;
}
