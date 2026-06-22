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
});
