/**
 * Skill 输出契约 ⇄ JSON Schema 配置口子(SPEC §4.3)—— 三位一体里「输出 Zod schema」那一位的
 * 序列化通道。**本期不建配置 UI,只留口子 + 用代码内 Zod**,但双向路径必须真实可用、有测试证明往返。
 *
 * 为什么要这条口子:Zod 不可序列化下发(它是代码,不是数据)。要让后台/服务端「改 schema 不改
 * 代码」,得用 **JSON Schema** 作配置载体:
 *   - 导出方向(exportSkillSchema):把 skill 的 outputSchema 导出成 JSON Schema → 给配置面/服务端
 *     当「当前契约」展示与编辑的起点。
 *   - 回灌方向(applySchemaOverride):把下发的 JSON Schema **转回运行时校验器** → registry override
 *     通道套用,运行时按它卡每轮输出形状,不改代码。
 *
 * 选型(SPEC 点名「ajv 或 json-schema-to-zod 二选一,择稳」):
 *   - **导出**用 zod v4 原生 `z.toJSONSchema()`。SPEC 原点名 `zod-to-json-schema`,但该包是 zod v3
 *     时代产物,**在本仓 zod v4 下只吐空 schema(introspect 不到 v4 内部结构)**,引它等于留个坏
 *     口子。zod v4 已把「Zod → JSON Schema」做成一等内建(无需新依赖),故择 `z.toJSONSchema`。
 *   - **回灌**用 **ajv**(SPEC 点名之一)。ajv 直接把 JSON Schema 编译成校验函数,是纯 JSON Schema
 *     校验器、业界事实标准、无中间码生成;`json-schema-to-zod` 则是「生成一段 Zod 源码字符串再
 *     eval/import」—— 运行时路径上更脆、带 eval,故「择稳」取 ajv。
 *   - zod v4 的 `z.toJSONSchema` 默认产 draft 2020-12(`$schema: .../draft/2020-12/...`),ajv v8 默认
 *     core 只认 draft-07,因此回灌侧用 `Ajv2020`(支持 2020-12),与导出侧对齐。
 *
 * 注意:这条口子只约束「输出形状」,不碰采纳逻辑(AI 产出仍走采纳门,铁律②)。
 */
import { z } from "zod";
import { Ajv2020 } from "ajv/dist/2020.js";
import type { ErrorObject, ValidateFunction } from "ajv";

/** JSON Schema 配置载体(结构化对象;序列化即 JSON,可存 DB / 下发 / 配置面编辑)。 */
export type JsonSchema = Record<string, unknown>;

/** 单个 ajv 编译器实例足够(线程内复用;每个 schema 各自 compile 出独立 validate)。 */
const ajv = new Ajv2020({ allErrors: true, strict: false });

/**
 * 把一个 skill 的 outputSchema(Zod)导出成 JSON Schema(配置口子的「导出」方向)。
 * 给配置面/服务端当「当前每轮输出契约」的展示与编辑起点。无 outputSchema(纯生成节点)→ 返回 null。
 */
export function exportZodToJsonSchema(schema: z.ZodType): JsonSchema {
  // zod v4 内建:产 draft 2020-12 的 JSON Schema(properties/required/min/max 完整保真)。
  return z.toJSONSchema(schema) as JsonSchema;
}

/** applySchemaOverride 产出的运行时校验器(把 JSON Schema 转回的「能卡形状」的句柄)。 */
export interface SchemaValidator {
  /** 校验一个值是否合该 JSON Schema。失败时 errors 带具体原因(供日志/重试上下文)。 */
  validate(data: unknown): { valid: boolean; errors: ErrorObject[] };
  /**
   * 协议级归一化：只按 `additionalProperties:false` 删除模型多吐的键。
   * 不补字段、不改类型，返回值仍必须经过上面的严格 validate。
   */
  normalize(data: unknown): unknown;
  /** 原始 JSON Schema(回带,便于二次导出/审计)。 */
  jsonSchema: JsonSchema;
}

/**
 * 把下发的 JSON Schema **转回运行时校验器**(配置口子的「回灌」方向,SPEC §4.3 核心)。
 * 后台/服务端改的是 JSON Schema(数据),运行时调本函数套用 —— 不改代码即换每轮输出契约。
 * 非法 JSON Schema(ajv 编译失败)→ 抛错(宁可显式失败,不静默放过一个卡不住的契约)。
 */
export function applySchemaOverride(jsonSchema: JsonSchema): SchemaValidator {
  let compiled: ValidateFunction;
  let normalizer: ValidateFunction;
  try {
    compiled = ajv.compile(jsonSchema);
    // SEMANTIC_BOUNDARY_ALLOW: 这里只修正 JSON 协议漂移，不参与任何内容判断或创作取舍。
    // `removeAdditional:true` 只响应 schema 明确写出的 additionalProperties:false；必填
    // 缺失、类型错误和其他约束仍由严格 compiled 判失败。
    normalizer = new Ajv2020({
      allErrors: true,
      strict: false,
      removeAdditional: true,
    }).compile(jsonSchema);
  } catch (err) {
    throw new Error(
      `applySchemaOverride: 下发的 JSON Schema 非法,无法编译成校验器: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
  return {
    jsonSchema,
    normalize(data: unknown) {
      let candidate: unknown;
      try {
        candidate = structuredClone(data);
      } catch {
        candidate = data;
      }
      normalizer(candidate);
      return candidate;
    },
    validate(data: unknown) {
      const valid = compiled(data) as boolean;
      return { valid, errors: valid ? [] : (compiled.errors ?? []) };
    },
  };
}
