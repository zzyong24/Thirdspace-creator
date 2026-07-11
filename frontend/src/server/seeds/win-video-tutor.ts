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
 * @returns 实际种入的知识条目数(0 = 已种过 / 文件缺失 / 失败)。
 */
export async function seedWinVideoTutor(
  knowledgeService: KnowledgeServiceLike,
  ctx: KnowledgeServiceCtx,
  opts: { skillPath?: string } = {},
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
  for (const f of files) {
    const lesson = await parseLessonFile(path.join(knowledgeDir, f));
    if (!lesson) continue;
    try {
      // [T-198] 入库存可读 markdown(YAML → 带小标题);解析不出退回原文(诚实)。
      const readableContent =
        lessonPointsToMarkdown(lesson.content) ?? lesson.content;
      await knowledgeService.createKnowledge(
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
    } catch (err) {
      // 单节失败不阻塞其他节 —— 跳过 + 记 log(用户可在知识库手动加)。
      console.error(
        `[seed] win-video-tutor 第 ${lesson.lessonNumber} 节入库失败:`,
        err instanceof Error ? err.message : err,
      );
    }
  }
  return count;
}
