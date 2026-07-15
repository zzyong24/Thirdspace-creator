import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
  successEnvelope,
  listEnvelope,
  errorEnvelope,
  ErrorCode,
  ERROR_HTTP,
} from "../src/envelope";

describe("envelope", () => {
  it("wraps a single datum with a requestId", () => {
    const schema = successEnvelope(z.object({ id: z.string() }));
    const parsed = schema.parse({ data: { id: "p1" }, meta: { requestId: "r1" } });
    expect(parsed.data.id).toBe("p1");
  });

  it("wraps a list with pagination meta", () => {
    const schema = listEnvelope(z.object({ id: z.string() }));
    const parsed = schema.parse({
      data: [{ id: "p1" }],
      meta: { requestId: "r1", page: 1, pageSize: 20, total: 1 },
    });
    expect(parsed.data).toHaveLength(1);
    expect(parsed.meta.total).toBe(1);
  });

  it("models an error with a known code and maps it to HTTP", () => {
    const parsed = errorEnvelope.parse({
      error: { code: "PROJECT_NOT_FOUND", message: "nope", details: {} },
      meta: { requestId: "r1" },
    });
    expect(parsed.error.code).toBe("PROJECT_NOT_FOUND");
    expect(ERROR_HTTP[ErrorCode.OwnershipError]).toBe(404);
    expect(ERROR_HTTP[ErrorCode.ValidationError]).toBe(400);
  });

  // [T-332 S3] 账号全域隔离:未选号访问 per-account 域 → AccountRequiredError。
  // 枚举值必须与 backend AccountRequiredError.code 的字符串字面量一致(dispatch 按
  // `.code` 结构化映射,跨包不靠 instanceof);HTTP 428 Precondition Required。
  it("carries AccountRequiredError (未选号引导态) and maps it to 428", () => {
    expect(ErrorCode.AccountRequiredError).toBe("AccountRequiredError");
    expect(ERROR_HTTP[ErrorCode.AccountRequiredError]).toBe(428);
    const parsed = errorEnvelope.parse({
      error: {
        code: ErrorCode.AccountRequiredError,
        message: "当前未选择账号",
        details: {},
      },
      meta: { requestId: "r1" },
    });
    expect(parsed.error.code).toBe(ErrorCode.AccountRequiredError);
  });
});
