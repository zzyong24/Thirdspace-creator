import { z } from "zod";
import type { PromptTemplate } from "../template";
import { ANTI_FABRICATION_CLAUSE } from "../grounding-facets";

/**
 * 论点树 skill 模板(planning.thesis)—— 从 planning-runner 的内联 buildThesisPrompt 提取。
 * 策划阶段:构建一棵论点树(核心论点 + 支撑/证据/反驳 分支)。facets 由 CreativeContext 映射:
 *   positioning(必需,调用方已兜底)· learnings(过往爆款要素,选填)· topic(本期选题,选填)
 * 保持原 prompt 文字与输出 JSON 约定不变,只把上下文占位化。换方法论 = 换本模板,不动 runner。
 *
 * T-025 跨模型健壮性:加 outputSchema(runStructuredNode 绑 generateObject,落空→文本兜底),
 * 让用户默认的 MiniMax 也稳定吐可解析论点树(旧 runTemplatedNode 自由文本路径 MiniMax 下常吐不出
 * →parseThesisTree 返回空→任务 cancelled)。column 用 z.string()(不锁枚举),runner 侧 normalizeColumn
 * 再归一(support/evidence/counter 或中文),保留原容错。字段各 .default("") 让缺字段也过校验。
 */
export const thesisTreeSchema = z.object({
  core: z
    .object({
      title: z.string().default(""),
      summary: z.string().default(""),
    })
    .default({ title: "", summary: "" }),
  branches: z
    .array(
      z.object({
        column: z.string().default(""),
        title: z.string().default(""),
        summary: z.string().default(""),
      }),
    )
    .default([]),
});
export type ThesisTreeOutput = z.infer<typeof thesisTreeSchema>;

export const PLANNING_THESIS_TEMPLATE: PromptTemplate = {
  id: "planning.thesis",
  version: "v2",
  outputSchema: thesisTreeSchema,
  tools: [],
  system: "你是这位创作者的「策划 agent」,负责为一期内容搭建论点树。",
  // [T-270] {{projectBriefHard}}:立项 Brief 硬锚(核心信息=钦定主张,论点树的 core 不得与之矛盾),
  //   仅项目态注入。[T-269] {{userMaterialHard}}/{{userMaterialRef}}:用户素材(论点/证据的弹药,
  //   有据可溯而非脑补)。尾部嵌 ANTI_FABRICATION_CLAUSE(证据分支的数字/案例必须可溯)。
  template: `你是这位创作者的「策划 agent」，负责为一期内容搭建**论点树**。

【创作者定位】
{{positioning}}{{projectBriefHard}}{{learnings}}{{userMaterialHard}}{{userMaterialRef}}{{topic}}

【任务】基于定位(+立项硬约束+过往爆款要素)+选题,构建一棵**论点树**:
- 一个**核心论点**(core):整期内容要立的那个观点,一句话标题 + 一句话展开。若上方有【本条内容立项硬约束】,**core 必须与其核心信息一致、不得自创与之矛盾的主张**,内容目标里的『避免/不要…』是负向硬约束。
- 3-6 个**分支**,每个分支属于以下三类之一:
  · support(支撑依据):为核心论点提供逻辑支撑的子论点;
  · evidence(证据):可引用的事实/数据/案例(**必须能追溯到上方素材/知识库原文,不可溯就写方向性论据或标「(我的推断)」,绝不编具体数字/案例**);
  · counter(反驳):预判受众的反对意见并给出回应。
分支要覆盖至少 support / evidence / counter 三类,使论点树立得住、辩得赢。
${ANTI_FABRICATION_CLAUSE}
【输出】只输出一个 JSON 对象(不要多余文字、不要代码块包裹),形如:
{"core":{"title":"核心论点标题","summary":"一句话展开"},
 "branches":[{"column":"support","title":"...","summary":"..."},
             {"column":"evidence","title":"...","summary":"..."},
             {"column":"counter","title":"...","summary":"..."}]}`,
  requiredFacets: ["positioning"],
  // [T-270] 声明式 context 注入 —— 论点树此前连 contextRequirements 都没声明(漏接高发区,审计定位)。
  // 补上:brief(立项硬锚)+ projectMaterials(素材可溯弹药)+ learnings + artifactOrigin(F2 标注)。
  // 组合根据此 resolveContextDeps 自动装 reader(取代 dispatch 手列 positioning/learnings 两项)。
  contextRequirements: [
    "positioning",
    "learnings",
    "brief",
    "projectMaterials",
    "artifactOrigin",
  ],
};
