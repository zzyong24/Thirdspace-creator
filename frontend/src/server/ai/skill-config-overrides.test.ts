import { describe, it, expect, beforeEach } from "vitest";
import {
  _resetRegistry,
  getTemplate,
  hasTemplate,
  resolveOutputSchema,
  clearSchemaOverride,
} from "@creatoros/ai-worker";
import { createDb, type Db } from "@creatoros/backend";
import { skillConfigOverrides } from "@creatoros/backend";
import {
  applySkillConfigOverridesFromDb,
  createPgliteSkillConfigOverrideReadPort,
  type SkillConfigOverrideReadPort,
  type SkillConfigOverrideRow,
} from "./skill-config-overrides";

// T-040a 装配「读表 → 归一 → 套用」确定性单测(注 fake store,不碰真库)+ pglite 持久化集成测。
// 覆盖 SPEC §5:①全字段覆盖 ②库空回退 ③[gate-F1] 空 REGISTRY 也先注册再套 ④空串归一回退 ⑤坏 id 不阻塞。
//
// 被测 skill 用内置 chatbox.topic(有内置 system/template + 内置 Zod outputSchema),便于断言
// 「覆盖 vs 回退内置」。每个用例前 _resetRegistry() 清空 REGISTRY + SCHEMA_OVERRIDES,互不污染。

const SKILL_ID = "chatbox.topic";

// fake 读端口:返回给定行,不碰库(依赖倒置的可测面)。
function fakeReadPort(
  rows: readonly SkillConfigOverrideRow[],
): SkillConfigOverrideReadPort {
  return { loadAll: async () => rows };
}

// 造一行 DB row(未给的列取 null,模拟「未配」;updatedAt 必填)。
function row(
  partial: Partial<SkillConfigOverrideRow> & { id: string },
): SkillConfigOverrideRow {
  return {
    version: null,
    system: null,
    template: null,
    tools: null,
    requiredFacets: null,
    outputSchema: null,
    updatedBy: null,
    updatedAt: "2026-07-02T00:00:00.000Z",
    ...partial,
  };
}

describe("applySkillConfigOverridesFromDb(确定性,fake store)", () => {
  beforeEach(() => {
    _resetRegistry();
  });

  it("① 库有全字段 → getTemplate 返覆盖值(system/template/tools) + resolveOutputSchema 返 JSON Schema 覆盖", async () => {
    const overrideSchema = {
      type: "object",
      properties: { verdict: { type: "string" } },
      required: ["verdict"],
      additionalProperties: false,
    };
    const res = await applySkillConfigOverridesFromDb({
      readPort: fakeReadPort([
        row({
          id: SKILL_ID,
          version: "cfg-1",
          system: "COVERED SYSTEM",
          template: "COVERED TEMPLATE {{positioning}}",
          tools: ["tool.a", "tool.b"],
          requiredFacets: ["positioning", "audience"],
          outputSchema: overrideSchema,
        }),
      ]),
    });
    expect(res.applied).toBe(1);
    expect(res.skipped).toEqual([]);

    const tpl = getTemplate(SKILL_ID);
    expect(tpl.system).toBe("COVERED SYSTEM");
    expect(tpl.template).toBe("COVERED TEMPLATE {{positioning}}");
    expect(tpl.tools).toEqual(["tool.a", "tool.b"]);
    expect(tpl.requiredFacets).toEqual(["positioning", "audience"]);
    expect(tpl.version).toBe("cfg-1");

    // outputSchema 覆盖:resolveOutputSchema 优先用 SCHEMA_OVERRIDES(SDK jsonSchema 包原始 JSON Schema)。
    const resolved = resolveOutputSchema(SKILL_ID) as {
      jsonSchema?: unknown;
    };
    expect(resolved.jsonSchema).toEqual(overrideSchema);

    clearSchemaOverride(SKILL_ID);
  });

  it("② 库空 → getTemplate 返内置(不被套用改动)", async () => {
    // 先记内置基线(apply 前先 registerAllTemplates 才有;直接 getTemplate 会惰性 bootstrap)。
    const builtin = getTemplate(SKILL_ID);
    const builtinSystem = builtin.system;
    _resetRegistry();

    const res = await applySkillConfigOverridesFromDb({
      readPort: fakeReadPort([]),
    });
    expect(res.applied).toBe(0);
    expect(res.skipped).toEqual([]);

    // 内置仍在(apply 首行 registerAllTemplates),且未被改。
    expect(getTemplate(SKILL_ID).system).toBe(builtinSystem);
  });

  it("③ [gate-F1] 空 REGISTRY + 有配置 → apply 先 registerAllTemplates 再套用,覆盖真生效(不因未注册被吞丢失)", async () => {
    // 关键场景:装配早于任何 getTemplate → REGISTRY 为空。若 apply 不先自注册,
    // overrideTemplatesFromConfig 会撞「id 未注册」抛错 → 被 catch 吞 → 覆盖静默丢失退回内置。
    _resetRegistry();
    expect(hasTemplate(SKILL_ID)).toBe(false); // 坐实此刻 REGISTRY 真空

    const res = await applySkillConfigOverridesFromDb({
      readPort: fakeReadPort([
        row({ id: SKILL_ID, system: "SYSTEM FROM EMPTY REGISTRY" }),
      ]),
    });
    // 没被吞:applied=1、skipped 空,且覆盖真的落到 REGISTRY。
    expect(res.applied).toBe(1);
    expect(res.skipped).toEqual([]);
    expect(getTemplate(SKILL_ID).system).toBe("SYSTEM FROM EMPTY REGISTRY");
  });

  it("④ 空串 → 归一 undefined → 回退内置(gate 点名必测:'' 不当显式空值覆盖)", async () => {
    const builtin = getTemplate(SKILL_ID);
    const builtinSystem = builtin.system;
    const builtinTemplate = builtin.template;
    _resetRegistry();

    const res = await applySkillConfigOverridesFromDb({
      readPort: fakeReadPort([
        // system 空串、template 纯空白、tools 空数组 → 全部归一 undefined → 回退内置。
        row({ id: SKILL_ID, system: "", template: "   ", tools: [] }),
      ]),
    });
    expect(res.applied).toBe(1);

    const tpl = getTemplate(SKILL_ID);
    // 空串没有把内置覆盖成空 —— system/template 仍是内置真值。
    expect(tpl.system).toBe(builtinSystem);
    expect(tpl.template).toBe(builtinTemplate);
    // tools 空数组归一 undefined → 保持内置 tools(非被清空)。
    expect(tpl.tools).toEqual(builtin.tools);
  });

  it("⑤ 坏 id(未注册)→ catch 记日志跳过,不阻塞同批其余", async () => {
    _resetRegistry();
    const logs: string[] = [];
    const res = await applySkillConfigOverridesFromDb({
      readPort: fakeReadPort([
        row({ id: "nope.not-a-real-skill", system: "x" }),
        row({ id: SKILL_ID, system: "GOOD ONE STILL APPLIED" }),
      ]),
      logger: (m) => logs.push(m),
    });
    // 坏 id 进 skipped、好的仍 applied。
    expect(res.skipped).toEqual(["nope.not-a-real-skill"]);
    expect(res.applied).toBe(1);
    expect(logs.some((l) => l.includes("nope.not-a-real-skill"))).toBe(true);
    // 关键:坏 id 没阻塞后一条 —— 好的覆盖真生效。
    expect(getTemplate(SKILL_ID).system).toBe("GOOD ONE STILL APPLIED");
  });

  it("空串归一:normText 对 version 同样生效(空 version 不覆盖内置 version)", async () => {
    const builtinVersion = getTemplate(SKILL_ID).version;
    _resetRegistry();
    await applySkillConfigOverridesFromDb({
      readPort: fakeReadPort([row({ id: SKILL_ID, version: "  " })]),
    });
    expect(getTemplate(SKILL_ID).version).toBe(builtinVersion);
  });
});

describe("PGlite 持久化集成测(real pglite + 迁移 0013_skill_config_overrides)", () => {
  let db: Db;
  beforeEach(async () => {
    _resetRegistry();
    ({ db } = await createDb()); // 内存 PGlite,跑 backend/drizzle/*(含 0013)
  });

  it("写表 → apply(经 pglite 读端口)→ getTemplate 读到覆盖值", async () => {
    // 迁移 0013 已把表建好:空表 → 读端口 loadAll 返 []。
    const readPort = createPgliteSkillConfigOverrideReadPort(db);
    expect(await readPort.loadAll()).toEqual([]);

    // 写一行覆盖(drizzle insert,jsonb tools 真落库)。
    await db.insert(skillConfigOverrides).values({
      id: SKILL_ID,
      version: "persisted-1",
      system: "SYSTEM FROM PGLITE",
      template: null, // 未配 → 回退内置
      tools: ["persisted.tool"],
      requiredFacets: null,
      outputSchema: null,
      updatedBy: "system",
      updatedAt: "2026-07-02T00:00:00.000Z",
    });

    const res = await applySkillConfigOverridesFromDb({ readPort });
    expect(res.applied).toBe(1);
    expect(res.skipped).toEqual([]);

    const tpl = getTemplate(SKILL_ID);
    expect(tpl.system).toBe("SYSTEM FROM PGLITE");
    expect(tpl.tools).toEqual(["persisted.tool"]);
    expect(tpl.version).toBe("persisted-1");
    // template 未配(null)→ 回退内置(非被清空)。
    expect(tpl.template.length).toBeGreaterThan(0);
  });

  it("空表 → apply 无覆盖 → getTemplate 全返内置(迁移建表但无行时零风险回退)", async () => {
    const readPort = createPgliteSkillConfigOverrideReadPort(db);
    const builtinSystemBefore = (() => {
      const t = getTemplate(SKILL_ID); // 惰性 bootstrap
      return t.system;
    })();
    _resetRegistry();

    const res = await applySkillConfigOverridesFromDb({ readPort });
    expect(res.applied).toBe(0);
    expect(getTemplate(SKILL_ID).system).toBe(builtinSystemBefore);
  });
});
