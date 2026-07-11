import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  seedWinVideoTutor,
  fixupWinVideoTutorModuleTags,
} from "./win-video-tutor";

// 关键测:
//   1. 22 个 .md 全在 + service 接受 → seed 22 条
//   2. sourceMetadata.origin 已有 → 幂等(不重复入)
//   3. 目录不存在(没装 skill)→ 安静 0,服务不炸
//   4. lesson 文件 YAML frontmatter 抽 module/title 正确
//   5. lesson 内容完整塞 content 字段

const TEMP_ROOT = path.join(os.tmpdir(), `wvt-seed-test-${Date.now()}`);

async function writeFakeSkill(): Promise<string> {
  // 模拟 ~/.claude/skills/win-video-tutor/knowledge/01.md .. 22.md
  // 通过 os.homedir() 拦截不到,直接 mock(用 spyOn + override)。
  // 简化:把 KNOWLEDGE_DIR 重写为指向 TEMP_ROOT(测试不去读真 ~/.claude)。
  // 这里用 stub:把 skillPath 的 ~/.claude 切到 TEMP_ROOT/.claude。
  // 实现通过 process.env + chdir? 太脆。直接 vi.mock + 重写整个模块更稳。
  // 但种子函数硬编码 path.join(os.homedir(), ...)——只能通过 fs.symlink 真造 ~/.claude。
  const skillRoot = path.join(TEMP_ROOT, ".claude", "skills", "win-video-tutor");
  const knowledgeDir = path.join(skillRoot, "knowledge");
  await fs.mkdir(knowledgeDir, { recursive: true });
  for (let i = 1; i <= 22; i++) {
    const num = String(i).padStart(2, "0");
    await fs.writeFile(
      path.join(knowledgeDir, `${num}.md`),
      [
        `- id: KP-${num}-1`,
        `  lesson: ${i}`,
        `  module: 模块${Math.ceil(i / 4)}`,
        `  title: 第${i}节-假标题`,
        `  prerequisites: []`,
        `  difficulty: 中`,
        ``,
        `  one_line: 一句话总结。`,
        ``,
        `  core: |`,
        `    第${i}节正文内容(略)`,
      ].join("\n"),
      "utf8",
    );
  }
  return skillRoot;
}

interface CreatedRecord {
  id: string;
  title: string;
  content: string;
  knowledgeType: string;
  sourceType: string;
  sourceMetadata: Record<string, unknown>;
}

function makeService(alreadySeeded = false) {
  const items: CreatedRecord[] = [];
  if (alreadySeeded) {
    items.push({
      id: "kn-existing-1",
      title: "Win 短视频私教 · 第 1 节 · 假标题",
      content: "old",
      knowledgeType: "reference",
      sourceType: "import",
      // 存量条目:seed 时已落 module(供 fixup 回填 tag)。
      sourceMetadata: { origin: "win-video-tutor", lessonNumber: 1, module: "模块1" },
    });
  }
  let seq = 0;
  const svc = {
    listKnowledge: async () => items,
    createKnowledge: async (
      _ctx: unknown,
      input: {
        title: string;
        knowledgeType: string;
        content: string;
        sourceType: string;
        sourceMetadata: Record<string, unknown>;
      },
    ) => {
      const id = `kn-${++seq}`;
      items.push({
        id,
        title: input.title,
        content: input.content,
        knowledgeType: input.knowledgeType,
        sourceType: input.sourceType,
        sourceMetadata: input.sourceMetadata,
      });
      return { id };
    },
  };
  return { svc, items };
}

interface FakeTag {
  id: string;
  name: string;
}
interface FakeEntityTag {
  tagId: string;
  entityType: string;
  entityId: string;
}

/**
 * [T-218] fake taxonomy service —— 复刻真实 TaxonomyService 的幂等语义:
 *   - tag 名 per-user 唯一:createTag 撞名抛错(模拟 DuplicateTagError),调用方按名重查;
 *   - (tag,entity) 唯一:assignTags 重复挂不产生第二行(模拟 entity_tags_tag_entity_uq)。
 */
function makeTaxonomy() {
  const tags: FakeTag[] = [];
  const entityTags: FakeEntityTag[] = [];
  let seq = 0;
  const svc = {
    listTags: async () => tags.map((t) => ({ id: t.id, name: t.name })),
    createTag: async (_ctx: unknown, input: { name: string }) => {
      if (tags.some((t) => t.name === input.name)) {
        throw new Error(`DuplicateTag: ${input.name}`);
      }
      const tag = { id: `tag-${++seq}`, name: input.name };
      tags.push(tag);
      return tag;
    },
    assignTags: async (
      _ctx: unknown,
      input: { entityType: string; entityId: string; tagIds: string[] },
    ) => {
      for (const tagId of input.tagIds) {
        const dup = entityTags.some(
          (e) =>
            e.tagId === tagId &&
            e.entityType === input.entityType &&
            e.entityId === input.entityId,
        );
        if (!dup) {
          entityTags.push({
            tagId,
            entityType: input.entityType,
            entityId: input.entityId,
          });
        }
      }
      return [];
    },
  };
  return { svc, tags, entityTags };
}

describe("seedWinVideoTutor — 22 节 win-video-tutor 知识库种子", () => {
  beforeEach(async () => {
    await fs.mkdir(TEMP_ROOT, { recursive: true });
  });
  afterEach(async () => {
    await fs.rm(TEMP_ROOT, { recursive: true, force: true });
  });

  it("skill 目录存在 + 22 文件全在 → seed 22 条,每条 knowledgeType=reference,源 metadata 含 origin/lessonNumber", async () => {
    // 真造 ~/.claude/skills/win-video-tutor/knowledge/01..22.md(seedWinVideoTutor 可收
    // skillPath,直接传 tmp 目录就行,不用动 os.homedir)
    const skillRoot = await writeFakeSkill();
    const { svc, items } = makeService();
    const count = await seedWinVideoTutor(svc as never, {
      userId: "user-test",
      accountId: null,
    }, { skillPath: skillRoot });
    expect(count).toBe(22);
    expect(items).toHaveLength(22);
    for (const it of items) {
      expect(it.knowledgeType).toBe("reference");
      expect(it.sourceType).toBe("import");
      expect(it.sourceMetadata.origin).toBe("win-video-tutor");
      expect(typeof it.sourceMetadata.lessonNumber).toBe("number");
      // [T-211] 标题已去品牌前缀「Win 短视频私教 · 」,只留「第 N 节 · …」。
      expect(it.title).toMatch(/^第 \d+ 节 · /);
      expect(it.title).not.toContain("Win 短视频私教");
      expect(it.content.length).toBeGreaterThan(50);
      // [T-198] 入库存的是可读 markdown(带小标题),不是原始 YAML dump。
      expect(it.content).not.toMatch(/^- id:/);
      expect(it.content).toContain("## 一句话");
      expect(it.content).toContain("一句话总结。");
      expect(it.content).toContain("## 正文");
    }
    // lesson 1 解析正确:module=模块1(ceil(1/4)=1)
    const l1 = items.find((i) => i.sourceMetadata.lessonNumber === 1);
    expect(l1?.sourceMetadata.module).toBe("模块1");
    expect(l1?.title).toContain("第1节-假标题");
    // lesson 4 解析:module=模块1(ceil(4/4)=1)
    const l4 = items.find((i) => i.sourceMetadata.lessonNumber === 4);
    expect(l4?.sourceMetadata.module).toBe("模块1");
    // lesson 5:ceil(5/4)=2
    const l5 = items.find((i) => i.sourceMetadata.lessonNumber === 5);
    expect(l5?.sourceMetadata.module).toBe("模块2");
  });

  it("幂等:已有 origin=win-video-tutor → 跳过,不重复入", async () => {
    const skillRoot = await writeFakeSkill();
    const { svc, items } = makeService(true); // already seeded
    const count = await seedWinVideoTutor(svc as never, {
      userId: "user-test",
      accountId: null,
    }, { skillPath: skillRoot });
    expect(count).toBe(0);
    expect(items).toHaveLength(1); // 只有那 1 条预先存在的
  });

  it("skill 目录不存在(没装 skill)→ 安静返回 0,不炸", async () => {
    // 传一个明确不存在的路径(readdir ENOENT → catch → 安静返回 0)。
    const nonexistentPath = path.join(TEMP_ROOT, "does-not-exist");
    const { svc, items } = makeService();
    const count = await seedWinVideoTutor(svc as never, {
      userId: "user-test",
      accountId: null,
    }, { skillPath: nonexistentPath });
    expect(count).toBe(0);
    expect(items).toHaveLength(0);
  });

  // [T-218] 观点地图开箱即在:seed 时每节按 module 挂 tag。
  it("传 taxonomyService → seed 后每节挂上其 module tag(观点地图开箱非空)", async () => {
    const skillRoot = await writeFakeSkill();
    const { svc } = makeService();
    const { svc: tax, tags, entityTags } = makeTaxonomy();
    const count = await seedWinVideoTutor(
      svc as never,
      { userId: "user-test", accountId: null },
      { skillPath: skillRoot, taxonomyService: tax as never },
    );
    expect(count).toBe(22);
    // 22 节分布在 module1..module6(ceil(i/4)):6 个不重复 tag。
    const tagNames = tags.map((t) => t.name).sort();
    expect(tagNames).toEqual(["模块1", "模块2", "模块3", "模块4", "模块5", "模块6"]);
    // 每节挂 1 个 tag,entityType=knowledge,共 22 条挂载。
    expect(entityTags).toHaveLength(22);
    expect(entityTags.every((e) => e.entityType === "knowledge")).toBe(true);
    // 每条挂载的 tag 名 = 该 item 的 module(抽查 lesson 1 → 模块1)。
    const tagById = new Map(tags.map((t) => [t.id, t.name]));
    const l1Item = (await svc.listKnowledge()).find(
      (i) => i.sourceMetadata.lessonNumber === 1,
    )!;
    const l1Assign = entityTags.find((e) => e.entityId === l1Item.id)!;
    expect(tagById.get(l1Assign.tagId)).toBe("模块1");
  });

  it("不传 taxonomyService → 只建知识条目,不挂 tag(向后兼容)", async () => {
    const skillRoot = await writeFakeSkill();
    const { svc } = makeService();
    const { svc: tax, entityTags } = makeTaxonomy();
    const count = await seedWinVideoTutor(
      svc as never,
      { userId: "user-test", accountId: null },
      { skillPath: skillRoot },
    );
    expect(count).toBe(22);
    expect(entityTags).toHaveLength(0); // tax 未传入,无挂载
    void tax;
  });

  // [T-218] 存量回填:已 seed(无 tag)的条目,fixup 幂等补挂 module tag。
  it("fixupWinVideoTutorModuleTags:对存量 origin=win-video-tutor 条目按 module 补挂 tag,幂等", async () => {
    const { svc } = makeService(true); // 1 条存量,module=模块1,无 tag
    const { svc: tax, tags, entityTags } = makeTaxonomy();
    const ctx = { userId: "user-test", accountId: null };
    const n1 = await fixupWinVideoTutorModuleTags(svc as never, tax as never, ctx);
    expect(n1).toBe(1);
    expect(tags.map((t) => t.name)).toEqual(["模块1"]);
    expect(entityTags).toHaveLength(1);
    expect(entityTags[0]!.entityType).toBe("knowledge");
    expect(entityTags[0]!.entityId).toBe("kn-existing-1");
    // 幂等:重跑不新增 tag / 挂载。
    const n2 = await fixupWinVideoTutorModuleTags(svc as never, tax as never, ctx);
    expect(n2).toBe(1); // 仍报告 1 条已挂(assignTags 幂等)
    expect(tags).toHaveLength(1);
    expect(entityTags).toHaveLength(1);
  });

  it("fixupWinVideoTutorModuleTags:无 win-video-tutor 存量 → 返回 0,不建 tag", async () => {
    const { svc } = makeService(false); // 空知识库
    const { svc: tax, tags, entityTags } = makeTaxonomy();
    const n = await fixupWinVideoTutorModuleTags(svc as never, tax as never, {
      userId: "user-test",
      accountId: null,
    });
    expect(n).toBe(0);
    expect(tags).toHaveLength(0);
    expect(entityTags).toHaveLength(0);
  });
});
