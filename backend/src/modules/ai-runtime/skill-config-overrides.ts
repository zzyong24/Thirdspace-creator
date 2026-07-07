// 提示词/skill 服务端可配 —— 装配期「读表 → 归一 → 套用」接线(T-040a / SPEC 2026-07-02 §4.2)。
//
// 复用既有通道,不造轮子:ai-worker 的 `overrideTemplatesFromConfig(SkillConfigOverride[])`
// (registry.ts:208)已能把「配置面下发」的覆盖套进常驻 REGISTRY(system/template/tools/
// requiredFacets 就地覆盖 + outputSchema 经 JSON Schema 转回校验器)。本模块只做三件缺失的事:
//   1. [gate-F1] 装配前无条件先 `registerAllTemplates()`(幂等,仅 size===0 真跑)——frontend
//      全仓无显式注册,全靠 getTemplate/runStructuredNode 的惰性 bootstrap。若 apply 早于任何
//      getTemplate,REGISTRY 为空 → overrideTemplatesFromConfig 逐条撞「id 未注册」抛错 → 被
//      catch 吞 → 覆盖静默丢失、退回内置(不 crash 但功能失效)。故此处先自己注册,保证 18 个 id 就位。
//   2. 读 skill_config_overrides 全表(经注入的读端口,依赖倒置可测),归一空串/空 jsonb → undefined
//      (TEXT 列存空串 '' 会被 `'' ?? base` 当显式空值覆盖,而非回退 —— SPEC §4.2 [gate 修]点名的坑)。
//   3. 逐条套用 + try/catch:坏 id(不在已注册 18 个内)抛错 → 记日志跳过,不阻塞其余(诚实不静默)。
//
// 时机:进程装配一次(persistence-client buildPersistence 里,db 句柄可用后调)。T-040c 的
// prompts.put 后可再调一次做热更(本片不做 op)。

import {
  registerAllTemplates,
  clearAllSchemaOverrides,
  overrideTemplatesFromConfig,
  type SkillConfigOverride,
} from "@creatoros/ai-worker";
import {
  skillConfigOverrides,
  type Db,
  type SkillConfigOverrideRow,
} from "@creatoros/backend";

// re-export 行类型,供消费方(装配/测试)不必再直连 backend schema。
export type { SkillConfigOverrideRow };

/**
 * 读端口(依赖倒置):装配只依赖「读全表」这一个能力,不直连 Db —— 单测可注 fake store,
 * 集成测/runtime 注 pglite 实现。返回原始行(归一在 apply 内做,读端口只负责取数)。
 */
export interface SkillConfigOverrideReadPort {
  loadAll(): Promise<readonly SkillConfigOverrideRow[]>;
}

/** PGlite 读端口实现(照 douyin-throttle-state-port.pglite 范本:注入 Db,select 全表)。 */
export function createPgliteSkillConfigOverrideReadPort(
  db: Db,
): SkillConfigOverrideReadPort {
  return {
    async loadAll(): Promise<readonly SkillConfigOverrideRow[]> {
      return db.select().from(skillConfigOverrides);
    },
  };
}

/** 文本字段归一:空串/纯空白 → undefined(未配 → 回退内置);否则原值。 */
function normText(value: string | null | undefined): string | undefined {
  return value?.trim() ? value : undefined;
}

/**
 * jsonb string[] 字段归一:null/非数组/空数组 → undefined(未配 → 回退内置);否则原 string[]。
 * 库里 jsonb 反序列化成 unknown,收窄成 string[](非字符串项过滤掉,诚实不塞脏值)。
 */
function normStringArray(
  value: unknown,
): readonly string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value.filter((v): v is string => typeof v === "string");
  return items.length > 0 ? items : undefined;
}

/**
 * outputSchema(jsonb JSON Schema)归一:null/空 → undefined(未配 → 回退内置 Zod);否则原对象。
 * 非法 schema 的显式失败留给 overrideTemplatesFromConfig(applySchemaOverride 会抛),此处只判「是否配了」。
 */
function normJsonSchema(
  value: unknown,
): SkillConfigOverride["outputSchema"] | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value !== "object") return undefined;
  if (Array.isArray(value)) return undefined;
  if (Object.keys(value as object).length === 0) return undefined;
  return value as SkillConfigOverride["outputSchema"];
}

/** 一行 DB row → 归一后的 SkillConfigOverride(每字段空串/空 jsonb 归一成 undefined = 未配)。 */
function rowToOverride(row: SkillConfigOverrideRow): SkillConfigOverride {
  return {
    id: row.id,
    version: normText(row.version),
    system: normText(row.system),
    template: normText(row.template),
    tools: normStringArray(row.tools),
    requiredFacets: normStringArray(row.requiredFacets),
    outputSchema: normJsonSchema(row.outputSchema),
  };
}

export interface ApplySkillConfigOverridesDeps {
  /** 读端口(读 skill_config_overrides 全表)。 */
  readPort: SkillConfigOverrideReadPort;
  /** 日志端口(坏 id 跳过时记一条;默认 console.warn)。注入便于测试断言。 */
  logger?: (message: string) => void;
  /**
   * [T-166 / P3] 可选远程 prompt override 层(已验签的 bundle overrides)。**skill 粒度锁守 D1**:
   * 只套在**本地表未出现**的 skillId 上——用户手改过的 skill,远程一个字段都不碰(见函数体)。
   * 缺省 undefined = 纯本地(向后兼容,现有调用方不变)。远程层**不写本地表**,只运行时套 REGISTRY。
   */
  remoteOverrides?: readonly SkillConfigOverride[];
}

export interface ApplySkillConfigOverridesResult {
  /** 成功套用的本地条数。 */
  applied: number;
  /** 跳过(坏 id / 套用抛错)的 skill id 列表(本地 + 远程)。 */
  skipped: string[];
  /** [T-166] 成功套用的远程条数(经 skill 锁过滤后)。 */
  remoteApplied: number;
}

/**
 * 装配期:读 skill_config_overrides 全表 → 归一 → 逐条套进常驻 REGISTRY。
 *
 * [gate-F1] 函数体首行**无条件**先 registerAllTemplates()(幂等,仅 size===0 真跑),保证 18 个
 * 内置 id 已在 REGISTRY —— 否则 overrideTemplatesFromConfig 逐条撞「id 未注册」抛错被吞、覆盖静默丢失。
 *
 * 逐条套用(每条单独调 overrideTemplatesFromConfig([one]) + try/catch):某条坏 id 抛错只跳过该条、
 * 记日志,不阻塞其余(诚实失败,不静默丢整批)。
 */
export async function applySkillConfigOverridesFromDb(
  deps: ApplySkillConfigOverridesDeps,
): Promise<ApplySkillConfigOverridesResult> {
  // [gate-F1] 无条件先注册内置(幂等)。不依赖某处已注册。
  registerAllTemplates();
  // T-040c 热更正确性:本函数读全表 = schema 覆盖的单一真值。registerAllTemplates 只重置 REGISTRY
  // 的文本/模板字段,**不碰** SCHEMA_OVERRIDES;若不先清,已撤掉 outputSchema 的行会让旧 schema 粘住、
  // 无法热更撤销。故重套前先清空全部 config 通路 schema 覆盖,再按当前表逐行重建(幂等真值)。
  clearAllSchemaOverrides();

  const log = deps.logger ?? ((m: string) => console.warn(m));
  const rows = await deps.readPort.loadAll();
  const skipped: string[] = [];

  // [T-166 / P3] 远程层先套(在 registerAllTemplates 之后、本地循环之前——gate② 纠偏:本函数是
  // 全量重建,远程层若在函数外先套会被上面的 registerAllTemplates() 清掉,故必须织进这里)。
  // **skill 粒度锁守 D1**(gate①):本地表出现过的 skillId 整条远程丢弃 —— 用户手改过的 skill,
  // 远程一个字段都不碰(不做字段级合并,否则远程能悄改用户已定制 skill 的其它字段)。
  const localIds = new Set(rows.map((r) => r.id));
  let remoteApplied = 0;
  for (const ov of deps.remoteOverrides ?? []) {
    if (localIds.has(ov.id)) continue; // D1 skill 锁:本地已定制 → 远程整条丢弃。
    try {
      overrideTemplatesFromConfig([ov]);
      remoteApplied += 1;
    } catch (err) {
      skipped.push(ov.id);
      log(
        `[skill-config-overrides] 跳过远程 skill "${ov.id}"(套用失败,回退内置): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  // 本地层后套(本地赢;skill 锁已保证本地/远程不重叠,顺序在此是双保险)。
  let applied = 0;
  for (const row of rows) {
    const override = rowToOverride(row);
    try {
      // 逐条套用:一条坏 id / 非法 schema 抛错只影响该条(批量传数组会中断整批)。
      overrideTemplatesFromConfig([override]);
      applied += 1;
    } catch (err) {
      skipped.push(override.id);
      log(
        `[skill-config-overrides] 跳过 skill "${override.id}"(套用失败,回退内置): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
  return { applied, skipped, remoteApplied };
}
