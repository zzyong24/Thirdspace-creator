import { expect, it } from "vitest";
import {
  projectPlanningThesis,
  planningThesisOutputSchema,
} from "./planning-thesis-output";
import { UNGROUNDED_MARK } from "../prompt/grounding-facets";
it("保留中文列归一、输入顺序、正文分组和可编辑nodes契约", () => {
  const result = projectPlanningThesis(
    {
      core: { title: " 核心 ", summary: " 解释 " },
      branches: [
        { column: "反对", title: " 反方 ", summary: " 对照 " },
        { column: "支持依据", title: " 支撑 ", summary: " 依据 " },
        { column: "证据", title: "证据", summary: "出处" },
        { column: "unknown", title: "忽略", summary: "" },
        { column: "support", title: " ", summary: " " },
      ],
    },
    Array(7).fill(""),
  );
  expect(result.nodes).toEqual([
    { column: "core", title: "核心", summary: "解释" },
    { column: "counter", title: "反方", summary: "对照" },
    { column: "support", title: "支撑", summary: "依据" },
    { column: "evidence", title: "证据", summary: "出处" },
  ]);
  expect(result.contentData).toEqual({ nodes: result.nodes });
  expect(result.summary).toBe("AI 论点树草稿");
  expect(result.body).toBe(
    "# 论点树\n\n## 核心论点：核心\n解释\n\n### 支撑依据\n- **支撑**：依据\n\n### 证据\n- **证据**：出处\n\n### 反驳\n- **反方**：对照",
  );
});
it("不可溯具体数据只提示不删原文，真实grounding保留且不标标题", () => {
  const object = {
    core: { title: "增长100%", summary: "增长200.5%" },
    branches: [{ column: "evidence", title: "证据", summary: "增长300.5%" }],
  };
  const result = projectPlanningThesis(object, [
    "事实增长200.5%",
    ...Array(6).fill(""),
  ]);
  expect(result.nodes[0]).toEqual({
    column: "core",
    title: "增长100%",
    summary: "增长200.5%",
  });
  expect(result.nodes[1]!.summary).toBe("增长300.5%" + UNGROUNDED_MARK);
  expect(object.branches[0]!.summary).toBe("增长300.5%");
});
it.each([
  {},
  { branches: [{ column: "nonsense", title: "貌似非空" }] },
  { core: { title: " ", summary: " " } },
])("归一后空输出不能成为候选 %s", (object) => {
  expect(planningThesisOutputSchema.safeParse(object).success).toBe(false);
  expect(() => projectPlanningThesis(object, Array(7).fill(""))).toThrow();
});
it("只有核心summary或只有合法分支仍可用，兼容原有合法输出", () => {
  expect(
    projectPlanningThesis({ core: { summary: "有效说明" } }, Array(7).fill(""))
      .nodes,
  ).toEqual([{ column: "core", title: "", summary: "有效说明" }]);
  expect(
    projectPlanningThesis(
      { branches: [{ column: "支持", summary: "有效依据" }] },
      Array(7).fill(""),
    ).nodes,
  ).toHaveLength(1);
});
