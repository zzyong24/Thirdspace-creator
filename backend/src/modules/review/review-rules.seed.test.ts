import { describe, it, expect } from "vitest";
import {
  buildReviewRuleSeedRows,
  REVIEW_RULE_SEED_COUNTS,
} from "./review-rules.seed";

// 审核规则种子移植真值(T-086 SPEC §6.1)—— 抽查降权词/营销词/doud+ 词/导流谐音各在其
// tier/category,replacement 与 note 出处正确;冲突条目按主源(无 active 品牌词规则)。

describe("review rules seed", () => {
  const rows = buildReviewRuleSeedRows("user-1", "2026-07-03T00:00:00.000Z");

  it("条数分层与导出计数一致(id 确定性、user-scoped)", () => {
    expect(rows.length).toBe(REVIEW_RULE_SEED_COUNTS.total);
    expect(rows.every((r) => r.userId === "user-1")).toBe(true);
    expect(rows.every((r) => r.id.startsWith("rrule-seed-user-1-"))).toBe(true);
    expect(rows.every((r) => r.source === "seed")).toBe(true);
    // 三层都非空(移植真值,非空壳)。
    expect(REVIEW_RULE_SEED_COUNTS.official).toBeGreaterThan(0);
    expect(REVIEW_RULE_SEED_COUNTS.empirical).toBeGreaterThan(0);
    expect(REVIEW_RULE_SEED_COUNTS.doudplus).toBeGreaterThan(0);
  });

  const find = (pattern: string) => rows.find((r) => r.pattern === pattern);

  it("§6.1 抽查:降权词「保姆级」在 empirical/降权词,带 replacement", () => {
    const r = find("保姆级");
    expect(r).toBeDefined();
    expect(r!.tier).toBe("empirical");
    expect(r!.category).toBe("降权词");
    expect(r!.replacement).toBeTruthy();
    expect(r!.status).toBe("active");
  });

  it("§6.1 抽查:营销词「割韭菜」在 empirical/营销词", () => {
    const r = find("割韭菜");
    expect(r).toBeDefined();
    expect(r!.tier).toBe("empirical");
    expect(r!.category).toBe("营销词");
  });

  it("§6.1 抽查:doud+ 词「诺奖」在 doudplus,note 带实测出处", () => {
    const r = find("诺奖");
    expect(r).toBeDefined();
    expect(r!.tier).toBe("doudplus");
    expect(r!.note).toContain("实测");
  });

  it("§6.1 抽查:导流谐音「V信」在 official_hard/导流,regex", () => {
    const r = rows.find((x) => x.note.includes("微信谐音"));
    expect(r).toBeDefined();
    expect(r!.tier).toBe("official_hard");
    expect(r!.category).toBe("导流");
    expect(r!.matchType).toBe("regex");
  });

  it("§6.1 冲突条目按主源:无 active 的品牌词规则(存档 disabled 留更正说明)", () => {
    const brand = rows.find((r) => r.pattern === "第三方品牌词");
    // 存档行存在但 disabled,note 含更正说明。
    expect(brand?.status).toBe("disabled");
    expect(brand?.note).toContain("更正");
    // 表内无 active 品牌词硬规则。
    const activeBrand = rows.filter(
      (r) => r.status === "active" && r.pattern.includes("品牌词"),
    );
    expect(activeBrand.length).toBe(0);
  });
});
