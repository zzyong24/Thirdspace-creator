import { describe, it, expect } from "vitest";

import {
  parseLessonPoints,
  lessonPointsToMarkdown,
} from "./knowledge-lesson-content";

const LESSON_YAML = [
  "- id: KP-01-1",
  "  lesson: 1",
  "  module: 认知定位",
  "  title: 粉丝经济的核心公式",
  "  prerequisites: []",
  "  difficulty: 中",
  "",
  "  one_line: 产品满足需求,人物制造偏好。",
  "",
  "  core: |",
  "    这是地基。",
  "    第二行继续。",
  "",
  "  examples: |",
  "    管大叔卖樱桃案例。",
  "",
  "  misconceptions: |",
  "    1. 以为东西好就该卖出去。",
  "",
  "  socratic:",
  "    - q: 产品和人物各自负责什么?",
  "      key_points:",
  "        - 产品满足需求",
  "        - 人物制造偏好",
  "      hint: 想想管大叔。",
  "    - q: 蒙牛为什么请代言人?",
  "      key_points:",
  "        - 制造偏好",
  "",
  "  practice_task: |",
  "    去找 3 个账号拆解。",
  "- id: KP-01-2",
  "  lesson: 1",
  "  module: 认知定位",
  "  title: 感性脑做决策",
  "",
  "  one_line: 人在感性脑做决策。",
].join("\n");

describe("parseLessonPoints", () => {
  it("YAML 课程 → 解析出结构化知识点(小标题字段齐)", () => {
    const points = parseLessonPoints(LESSON_YAML);
    expect(points).not.toBeNull();
    expect(points).toHaveLength(2);
    const p1 = points![0]!;
    expect(p1.title).toBe("粉丝经济的核心公式");
    expect(p1.module).toBe("认知定位");
    expect(p1.difficulty).toBe("中");
    expect(p1.oneLine).toBe("产品满足需求,人物制造偏好。");
    expect(p1.core).toContain("这是地基。");
    expect(p1.core).toContain("第二行继续。");
    expect(p1.examples).toContain("管大叔");
    expect(p1.misconceptions).toContain("以为东西好");
    expect(p1.socratic).toHaveLength(2);
    expect(p1.socratic[0]!.q).toContain("产品和人物");
    expect(p1.socratic[0]!.keyPoints).toEqual([
      "产品满足需求",
      "人物制造偏好",
    ]);
    expect(p1.socratic[0]!.hint).toContain("管大叔");
    expect(p1.practiceTask).toContain("去找 3 个账号");
    const p2 = points![1]!;
    expect(p2.title).toBe("感性脑做决策");
    expect(p2.oneLine).toBe("人在感性脑做决策。");
  });

  it("普通 markdown / 纯文本 → 返回 null(退回原渲染,不误判)", () => {
    expect(parseLessonPoints("# 标题\n\n正文**加粗**内容")).toBeNull();
    expect(parseLessonPoints("这是一段随手写的纯文本,没有任何结构。")).toBeNull();
    expect(parseLessonPoints("")).toBeNull();
  });

  it("残缺 / 畸形内容 → 不抛异常,诚实返回 null", () => {
    // 像课程 YAML 起手但结构残缺 —— 不应崩。
    expect(() =>
      parseLessonPoints("- id: X\n  garbage:::\n    ??? \n  one_line"),
    ).not.toThrow();
    // 有 one_line 键但无值 → 无可读内容 → null。
    const r = parseLessonPoints("- id: X\n  one_line:");
    expect(r).toBeNull();
  });
});

describe("lessonPointsToMarkdown", () => {
  it("课程 YAML → 带小标题的可读 markdown(入库侧)", () => {
    const md = lessonPointsToMarkdown(LESSON_YAML);
    expect(md).not.toBeNull();
    expect(md).toContain("# 粉丝经济的核心公式");
    expect(md).toContain("## 一句话");
    expect(md).toContain("## 正文");
    expect(md).toContain("## 案例");
    expect(md).toContain("## 易错点");
    expect(md).toContain("## 苏格拉底提问");
    expect(md).toContain("### Q1.");
    expect(md).toContain("- 产品满足需求");
    // 不是原始 YAML dump。
    expect(md).not.toMatch(/^- id:/);
  });

  it("非课程内容 → null(seed 诚实退回原文)", () => {
    expect(lessonPointsToMarkdown("# 普通\n\n正文")).toBeNull();
  });
});
