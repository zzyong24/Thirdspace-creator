import { describe, expect, it } from "vitest";

import {
  buildIssueFeedbackText,
  feedbackDescriptionLength,
  sanitizeFeedbackRoute,
} from "./issue-feedback";

describe("issue feedback diagnostics", () => {
  it("removes query/hash and dynamic identifiers from routes", () => {
    expect(
      sanitizeFeedbackRoute(
        "/projects/550e8400-e29b-41d4-a716-446655440000?token=secret#part",
      ),
    ).toBe("/projects/:id");
    expect(sanitizeFeedbackRoute("/assets/123456789/details")).toBe(
      "/assets/:id/details",
    );
    expect(sanitizeFeedbackRoute("http://[invalid")).toBe("/unknown");
  });

  it("counts Unicode code points instead of UTF-16 units", () => {
    expect(feedbackDescriptionLength("😀😀")).toBe(2);
  });

  it("builds a preview that redacts common secrets and omits absent ids", () => {
    const text = buildIssueFeedbackText({
      description:
        "同步失败 Authorization: Bearer abc.def api_key=sk-super-secret Cookie: sid=abc",
      appVersion: "0.1.0",
      os: "macOS",
      route: "/intelligence?activationCode=secret",
      occurredAt: new Date("2026-07-26T16:30:00.000Z"),
    });

    expect(text).toContain("问题描述：同步失败");
    expect(text).toContain("应用版本：0.1.0");
    expect(text).toContain("页面：/intelligence");
    expect(text).toContain("[已隐藏]");
    expect(text).not.toContain("abc.def");
    expect(text).not.toContain("sk-super-secret");
    expect(text).not.toContain("sid=abc");
    expect(text).not.toContain("关联编号");
  });
});
