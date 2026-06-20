import { describe, it, expect } from "vitest";
import { aiTaskStatus, id, iso8601, paginationQuery, platformId } from "../src/primitives";

describe("primitives", () => {
  it("accepts a non-empty id", () => {
    expect(id.parse("project-1")).toBe("project-1");
    expect(() => id.parse("")).toThrow();
  });
  it("accepts an ISO-8601 timestamp", () => {
    expect(iso8601.parse("2026-06-13T02:00:00.000Z")).toMatch(/Z$/);
    expect(() => iso8601.parse("not-a-date")).toThrow();
  });
  it("defaults pagination", () => {
    expect(paginationQuery.parse({})).toEqual({ page: 1, pageSize: 20 });
  });
  it("accepts a known platform id", () => {
    expect(platformId.parse("douyin")).toBe("douyin");
    expect(() => platformId.parse("myspace")).toThrow();
  });
});

describe("aiTaskStatus", () => {
  it("includes the candidate-confirm state between running and succeeded", () => {
    expect(aiTaskStatus.options).toEqual([
      "queued",
      "running",
      "awaiting_confirmation",
      "succeeded",
      "failed",
      "cancelled",
    ]);
  });
});
