import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
  exportZodToJsonSchema,
  applySchemaOverride,
} from "./schema-bridge";

// 配置口子单元(SPEC §4.3):证明「Zod → JSON Schema → 运行时校验器」双向往返真实可用。
// 导出用 zod v4 原生 z.toJSONSchema(SPEC 点名的 zod-to-json-schema 在 v4 下只吐空 schema,已弃);
// 回灌用 ajv(SPEC 点名,择稳:纯校验器、无 eval)。

const SCHEMA = z.object({
  reply: z.string(),
  scores: z
    .array(
      z.object({
        key: z.string(),
        score: z.number().int().min(1).max(5),
      }),
    )
    .min(1),
});

describe("exportZodToJsonSchema(导出方向)", () => {
  it("把 Zod 契约导成结构完整的 JSON Schema(properties/required/min/max 保真)", () => {
    const js = exportZodToJsonSchema(SCHEMA) as Record<string, unknown>;
    expect(js.type).toBe("object");
    expect(js.required).toEqual(expect.arrayContaining(["reply", "scores"]));
    const props = js.properties as Record<string, Record<string, unknown>>;
    expect(props.reply!.type).toBe("string");
    const scoreItems = (props.scores!.items as Record<string, unknown>)
      .properties as Record<string, Record<string, unknown>>;
    expect(scoreItems.score!.type).toBe("integer");
    expect(scoreItems.score!.minimum).toBe(1);
    expect(scoreItems.score!.maximum).toBe(5);
  });
});

describe("applySchemaOverride(回灌方向)", () => {
  it("把 JSON Schema 转回校验器:合形状通过、不符拒(往返闭环)", () => {
    const js = exportZodToJsonSchema(SCHEMA);
    const validator = applySchemaOverride(js);

    // 通过
    expect(
      validator.validate({ reply: "hi", scores: [{ key: "hook", score: 4 }] })
        .valid,
    ).toBe(true);

    // 不符:score 越界 / 非整数 / 缺 reply / 空数组 —— 与原 Zod 同义地拒。
    expect(
      validator.validate({ reply: "hi", scores: [{ key: "hook", score: 9 }] })
        .valid,
    ).toBe(false);
    expect(
      validator.validate({ reply: "hi", scores: [{ key: "hook", score: 3.5 }] })
        .valid,
    ).toBe(false);
    expect(
      validator.validate({ scores: [{ key: "hook", score: 4 }] }).valid,
    ).toBe(false);
    expect(validator.validate({ reply: "hi", scores: [] }).valid).toBe(false);

    // errors 带具体原因(供日志/重试上下文)。
    const bad = validator.validate({
      reply: "hi",
      scores: [{ key: "hook", score: 9 }],
    });
    expect(bad.errors.length).toBeGreaterThan(0);
  });

  it("往返保形:export 出的 JSON Schema 再回灌,对原 Zod 接受的样本一致接受", () => {
    const js = exportZodToJsonSchema(SCHEMA);
    const validator = applySchemaOverride(js);
    const sample = { reply: "ok", scores: [{ key: "k", score: 1 }] };
    expect(SCHEMA.safeParse(sample).success).toBe(true);
    expect(validator.validate(sample).valid).toBe(true);
  });

  it("非法 JSON Schema(ajv 编译失败)→ 显式抛错(不静默放过卡不住的契约)", () => {
    // type 取了 ajv 不认的值 → compile 抛。
    expect(() =>
      applySchemaOverride({ type: "not-a-real-type" } as Record<
        string,
        unknown
      >),
    ).toThrow(/无法编译成校验器/);
  });
});
