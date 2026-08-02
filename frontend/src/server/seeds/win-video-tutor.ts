import "server-only";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import * as path from "node:path";

import { lessonPointsToMarkdown } from "@/features/knowledge/knowledge-lesson-content";
import {
  getAllBuiltInCourseLessons,
} from "@/features/knowledge/built-in-ip-course.server";
import { BUILT_IN_IP_COURSE } from "@/features/knowledge/built-in-ip-course";

// win-video-tutor 22 节课程 → CreatorOS 知识库 seed。
//
// 22 节完整短视频课程随软件发布,首次启动把课程投影到自家
// knowledge_items 表里(每节 1 个 reference 类型的
// knowledgeItem + 1 个 revision,content 存整篇 markdown)——
// 知识库开箱就有真内容(不是空)且可被项目弹药、复盘、对话蒸馏消费。
//
// 实现要点:
//   1. 生产缺省只读随包资产,不猜测开发者 home 路径。skillPath 仅保留给测试/显式迁移。
//   2. 解析每个 .md 头几行 YAML-like 抽 module/lesson 标题(失败时 fallback 标题)。
//   3. 幂等:稳定身份是 courseId+lessonId(兼容旧 lessonNumber),contentHash 只判断
//      是否追加 revision。逐课 upsert,首次中断后可继续补齐。
//   4. 每节 = 1 个 knowledgeItem(`reference` 类型,知识型,适合整节课程归档)+ 1 个
//      revision(content=课程 YAML 转成的**可读 markdown**(带小标题:一句话/正文/案例/
//      易错点/苏格拉底提问/实践作业),而非原始 YAML dump —— 新装机预览直接可读
//      [T-198];解析不出则诚实退回原文)。
//   5. sourceType='import' + sourceMetadata.origin='win-video-tutor' / lessonNumber /
//      module,标记来源可追溯。

const SEED_ORIGIN = "win-video-tutor";
const COURSE_ID = BUILT_IN_IP_COURSE.courseId;
const COURSE_VERSION = BUILT_IN_IP_COURSE.version;

// [T-211] 旧标题品牌前缀。用户裁决:课程保留作预设,但标题去掉「Win 短视频私教 · 」
// 品牌前缀(新 seed 用不带前缀的模板)。存量装机(seed 早于本改动)的 22 条仍带此
// 前缀 → 由 persistence-client 的启动 fixup 按此常量幂等 strip(见 fixupWinVideoTutorTitles)。
export const WIN_VIDEO_TUTOR_LEGACY_TITLE_PREFIX = "Win 短视频私教 · ";

interface ParsedLesson {
  readonly lessonNumber: number; // 1..22
  readonly title: string; // 文件解析不出时用「第 N 节」兜底
  readonly module: string; // 解析不出空串
  readonly content: string; // 整个 .md
  readonly contentHash: string;
}

interface KnowledgeItemLike {
  readonly id?: string;
  readonly knowledgeType?: string;
  readonly sourceType?: string;
  // 真实 repo 返回的 sourceMetadata 是 unknown(jsonb 任意);判 origin 时做 typeof 检查。
  readonly sourceMetadata?: unknown;
}

interface KnowledgeRevisionLike {
  readonly content?: string;
}

/** 兼容真实的 KnowledgeService 接口 — ctx 走 unknown 避坑 RequestContext 全字段耦合
 * (seed 只用 userId + accountId,接口不该管 service 不读的字段)。 */
type KnowledgeServiceCtx = unknown;

interface KnowledgeServiceLike {
  listKnowledge(ctx: KnowledgeServiceCtx): Promise<ReadonlyArray<KnowledgeItemLike>>;
  listRevisions(
    ctx: KnowledgeServiceCtx,
    knowledgeId: string,
  ): Promise<ReadonlyArray<KnowledgeRevisionLike>>;
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
  createRevision(
    ctx: KnowledgeServiceCtx,
    knowledgeId: string,
    input: { content: string },
  ): Promise<unknown>;
  updateSourceMetadata(
    ctx: KnowledgeServiceCtx,
    knowledgeId: string,
    sourceMetadata: Record<string, unknown>,
  ): Promise<unknown>;
}

function courseSourceMetadata(lesson: ParsedLesson): Record<string, unknown> {
  return {
    origin: SEED_ORIGIN,
    courseId: COURSE_ID,
    courseVersion: COURSE_VERSION,
    lessonId: `lesson-${String(lesson.lessonNumber).padStart(2, "0")}`,
    lessonNumber: lesson.lessonNumber,
    lessonOrder: lesson.lessonNumber,
    module: lesson.module,
    moduleId:
      BUILT_IN_IP_COURSE.lessons.find(
        (item) => item.number === lesson.lessonNumber,
      )?.moduleId ?? "unknown",
    contentHash: lesson.contentHash,
    sourceName: SEED_ORIGIN,
  };
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
    const lessonModule = typeof moduleRaw === "string" ? moduleRaw : "";
    if (lessonModule.trim().length === 0 || !it.id) continue;
    entries.push({ knowledgeId: it.id, module: lessonModule });
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
  let lessonModule = "";
  let title = "";
  for (let i = 0; i < Math.min(lines.length, 12); i++) {
    const l = lines[i] ?? "";
    const moduleMatch = /^  module:\s*(.+?)\s*$/.exec(l);
    if (moduleMatch) lessonModule = moduleMatch[1] ?? "";
    const titleMatch = /^  title:\s*(.+?)\s*$/.exec(l);
    if (titleMatch) {
      title = (titleMatch[1] ?? "").trim();
      break;
    }
  }
  return { module: lessonModule, title };
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
    contentHash: createHash("sha256").update(content, "utf8").digest("hex"),
  };
}

function bundledLessons(): ParsedLesson[] {
  return getAllBuiltInCourseLessons().map(({ meta, raw }) => ({
    lessonNumber: meta.number,
    title: meta.title,
    module: meta.module,
    content: raw,
    contentHash: meta.contentHash,
  }));
}

async function explicitSkillLessons(skillPath: string): Promise<ParsedLesson[]> {
  const knowledgeDir = path.join(skillPath, "knowledge");
  const files = (await fs.readdir(knowledgeDir))
    .filter((file) => /^\d{2}\.md$/.test(file))
    .sort();
  const lessons: ParsedLesson[] = [];
  for (const file of files) {
    const lesson = await parseLessonFile(path.join(knowledgeDir, file));
    if (lesson) lessons.push(lesson);
  }
  return lessons;
}

function lessonNumberFromItem(item: KnowledgeItemLike): number | null {
  const meta = item.sourceMetadata;
  if (typeof meta !== "object" || meta === null) return null;
  const value = meta as {
    origin?: unknown;
    courseId?: unknown;
    lessonId?: unknown;
    lessonNumber?: unknown;
  };
  if (value.origin !== SEED_ORIGIN) return null;
  if (typeof value.courseId === "string" && value.courseId !== COURSE_ID) return null;
  const lessonMatch =
    typeof value.lessonId === "string"
      ? /^lesson-(\d{2})$/.exec(value.lessonId)
      : null;
  if (lessonMatch) return Number(lessonMatch[1]);
  return typeof value.lessonNumber === "number" ? value.lessonNumber : null;
}

/**
 * 启动时跑(seed 失败不阻塞 app:课程包未配置/未安装是合法状态,返回 0)。
 *
 * @param knowledgeService 知识库 service
 * @param ctx canonical user ctx(userId + accountId)
 * @param opts.skillPath 测试/迁移用显式课程包路径；未传时使用随包课程资产
 * @param opts.taxonomyService [T-218] tag 写侧 service;传入则每节按 module 挂 tag
 *   (观点地图开箱即在)。不传则只建知识条目(向后兼容旧调用/测试)。
 * @returns 实际种入的知识条目数(0 = 未配置 / 已种过 / 文件缺失 / 失败)。
 */
export async function seedWinVideoTutor(
  knowledgeService: KnowledgeServiceLike,
  ctx: KnowledgeServiceCtx,
  opts: { skillPath?: string; taxonomyService?: TaxonomyTaggerLike } = {},
): Promise<number> {
  const configuredSkillPath =
    opts.skillPath ?? process.env.CREATOROS_WIN_VIDEO_TUTOR_SKILL_PATH;
  // `0` 仅关闭旧的外部 skill 路径，不关闭随包课程。
  let lessons: ParsedLesson[];
  try {
    lessons =
      configuredSkillPath && configuredSkillPath !== "0"
        ? await explicitSkillLessons(configuredSkillPath)
        : bundledLessons();
  } catch (err) {
    // 显式迁移路径缺失不阻塞 app；生产随包资产在构建期已 fail-closed 校验。
    console.warn(
      "[seed] win-video-tutor 课程读取失败:",
      err instanceof Error ? err.message : err,
    );
    return 0;
  }
  if (lessons.length === 0) {
    return 0;
  }

  const existing = await knowledgeService.listKnowledge(ctx);
  const byLessonNumber = new Map<number, KnowledgeItemLike>();
  for (const item of existing) {
    const lessonNumber = lessonNumberFromItem(item);
    if (lessonNumber !== null && !byLessonNumber.has(lessonNumber)) {
      byLessonNumber.set(lessonNumber, item);
    }
  }

  // 逐课 upsert → 缺课创建;同课内容变化只追加 revision。
  let count = 0;
  // [T-218] 记下每节的 (knowledgeId, module),入库完成后统一挂 module tag。
  const taggedEntries: { knowledgeId: string; module: string }[] = [];
  for (const lesson of lessons) {
    try {
      // [T-198] 入库存可读 markdown(YAML → 带小标题);解析不出退回原文(诚实)。
      const readableContent =
        lessonPointsToMarkdown(lesson.content) ?? lesson.content;
      const current = byLessonNumber.get(lesson.lessonNumber);
      if (current?.id) {
        const meta =
          typeof current.sourceMetadata === "object" && current.sourceMetadata !== null
            ? (current.sourceMetadata as {
                contentHash?: unknown;
                courseVersion?: unknown;
                courseId?: unknown;
                lessonId?: unknown;
              })
            : {};
        if (meta.contentHash === lesson.contentHash) {
          const expectedLessonId = `lesson-${String(lesson.lessonNumber).padStart(2, "0")}`;
          if (
            meta.courseVersion !== COURSE_VERSION ||
            meta.courseId !== COURSE_ID ||
            meta.lessonId !== expectedLessonId
          ) {
            await knowledgeService.updateSourceMetadata(
              ctx,
              current.id,
              courseSourceMetadata(lesson),
            );
          }
          taggedEntries.push({ knowledgeId: current.id, module: lesson.module });
          continue;
        }
        const revisions = await knowledgeService.listRevisions(ctx, current.id);
        if (revisions.some((revision) => revision.content === readableContent)) {
          await knowledgeService.updateSourceMetadata(
            ctx,
            current.id,
            courseSourceMetadata(lesson),
          );
          taggedEntries.push({ knowledgeId: current.id, module: lesson.module });
          continue;
        }
        await knowledgeService.createRevision(ctx, current.id, {
          content: readableContent,
        });
        await knowledgeService.updateSourceMetadata(
          ctx,
          current.id,
          courseSourceMetadata(lesson),
        );
        count += 1;
        taggedEntries.push({ knowledgeId: current.id, module: lesson.module });
        continue;
      }

      const created = await knowledgeService.createKnowledge(ctx, {
          // [T-211] 标题去品牌前缀「Win 短视频私教 · 」,只留课程/章节自然名。
          title: `第 ${lesson.lessonNumber} 节 · ${lesson.title}`,
          knowledgeType: "reference",
          content: readableContent,
          sourceType: "import",
          sourceMetadata: courseSourceMetadata(lesson),
        });
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
