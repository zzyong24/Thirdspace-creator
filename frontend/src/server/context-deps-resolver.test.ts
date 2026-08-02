import { describe, it, expect } from "vitest";
import { resolveContextDeps } from "@/server/persistence-client";
import {
  SCRIPT_DRAFT_TEMPLATE,
  PLANNING_THESIS_TEMPLATE,
} from "@creatoros/ai-worker";

// [T-184] 声明式 context 注入的**回归证明**。核心断言:script.draft 经 resolveContextDeps 解析出的
// facet-reader key 集合 == 旧组合根手列的那批 key(逐字冻结在下方 EXPECTED)。只要这条通过,重构就
// 「零行为变化」——同样的 reader、同样的 key 组进 deps → assembleCreativeContext 产同样的 facet。
//
// EXPECTED 是重构前 persistence-client 的 script.draft dispatch 手列的 facet-reader(去掉 ai /
// resolveModelSpec 两个非 facet 基础设施),来源见 git 历史里那段手列 deps:
//   positioning · learnings · knowledge · thesis · contract · outline · artifactOrigin ·
//   projectMaterials · brief
// [T-387b] 冻结清单有意扩一项 assets:script.draft 模板 v5 加 assetsLibrary facet(画面列
// assetRefs 只准引用真实素材 id,须喂素材库清单)—— 这是声明式注入下的**有意变更**,非漂移。
const EXPECTED_SCRIPT_DRAFT_KEYS = [
  "positioning",
  "learnings",
  "knowledge",
  "thesis",
  "contract",
  "outline",
  "artifactOrigin",
  "projectMaterials",
  "brief",
  "assets",
  "projectIntelligence",
] as const;

// 一个「全源齐备」的假 registry:每个 key 挂一个可辨识的哨兵对象(不需要真 reader 逻辑,只验挑选)。
type Registry = Parameters<typeof resolveContextDeps>[1];
const sentinel = (k: string) => ({ __reader: k });
const fullRegistry = {
  positioning: sentinel("positioning"),
  learnings: sentinel("learnings"),
  assets: sentinel("assets"),
  accounts: sentinel("accounts"),
  signals: sentinel("signals"),
  knowledge: sentinel("knowledge"),
  thesis: sentinel("thesis"),
  contract: sentinel("contract"),
  outline: sentinel("outline"),
  artifactOrigin: sentinel("artifactOrigin"),
  projectMaterials: sentinel("projectMaterials"),
  brief: sentinel("brief"),
  projectIntelligence: sentinel("projectIntelligence"),
} as unknown as Registry;

describe("[T-184] resolveContextDeps — 声明式 context 注入", () => {
  it("script.draft 模板声明的 contextRequirements == 旧手列 facet-reader 清单(冻结)", () => {
    // 声明是唯一真值:模板 contextRequirements 必须逐项等于旧手列(集合 + 顺序无关地比集合)。
    expect(SCRIPT_DRAFT_TEMPLATE.contextRequirements).toBeDefined();
    expect([...(SCRIPT_DRAFT_TEMPLATE.contextRequirements ?? [])].sort()).toEqual(
      [...EXPECTED_SCRIPT_DRAFT_KEYS].sort(),
    );
  });

  it("按 script.draft 声明解析出的 reader key 集合 == 期望清单(零行为变化的硬回归断言)", () => {
    const deps = resolveContextDeps(
      SCRIPT_DRAFT_TEMPLATE.contextRequirements,
      fullRegistry,
    );
    expect(Object.keys(deps).sort()).toEqual([...EXPECTED_SCRIPT_DRAFT_KEYS].sort());
    // 且注入的是 registry 里那一个 reader 实例(同一引用),不是空壳 / 复制品。
    for (const key of EXPECTED_SCRIPT_DRAFT_KEYS) {
      expect((deps as Record<string, unknown>)[key]).toBe(
        (fullRegistry as Record<string, unknown>)[key],
      );
    }
    // 声明里没有的源(如 accounts/signals)绝不被注入(不 over-inject)。
    // [T-387b] assets 已进声明(assetsLibrary facet),从「绝不注入」名单移除。
    expect(deps).not.toHaveProperty("accounts");
    expect(deps).not.toHaveProperty("signals");
  });

  // [T-269/T-270] planning.thesis 从「零声明(手列 positioning/learnings 悬空)」升成声明式注入 ——
  // 关键是补上 brief(立项硬锚)+ projectMaterials(素材可溯弹药),不再漏接。
  it("planning.thesis 声明 brief + projectMaterials + positioning/learnings/artifactOrigin", () => {
    expect(PLANNING_THESIS_TEMPLATE.contextRequirements).toBeDefined();
    const keys = [...(PLANNING_THESIS_TEMPLATE.contextRequirements ?? [])];
    expect(keys).toEqual(
      expect.arrayContaining([
        "positioning",
        "learnings",
        "brief",
        "projectMaterials",
        "artifactOrigin",
      ]),
    );
    // 经 resolver 从全源 registry 解析 → brief / projectMaterials 真被注入(此前手列漏接)。
    const deps = resolveContextDeps(
      PLANNING_THESIS_TEMPLATE.contextRequirements,
      fullRegistry,
    );
    expect((deps as Record<string, unknown>).brief).toBe(
      (fullRegistry as Record<string, unknown>).brief,
    );
    expect((deps as Record<string, unknown>).projectMaterials).toBe(
      (fullRegistry as Record<string, unknown>).projectMaterials,
    );
  });

  it("requirements=undefined → 空 deps(未声明的模板保持组合根既有手列,互不影响)", () => {
    expect(resolveContextDeps(undefined, fullRegistry)).toEqual({});
  });

  it("声明了但 registry 未登记 / 值 undefined 的 key → 跳过(诚实不塞空壳)", () => {
    const partial = {
      positioning: sentinel("positioning"),
      knowledge: undefined,
    } as unknown as Registry;
    const deps = resolveContextDeps(
      ["positioning", "knowledge", "thesis"],
      partial,
    );
    expect(Object.keys(deps)).toEqual(["positioning"]);
  });
});
