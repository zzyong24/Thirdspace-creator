import { describe, expect, it } from "vitest";

import {
  buildIssueFeedbackText,
  buildProductFeedbackPreview,
  feedbackDescriptionLength,
  formatFeedbackOccurredAt,
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

  it("[T-568] 时间使用带 UTC 偏移的本机可读格式，不直接展示 ISO UTC", () => {
    const formatted = formatFeedbackOccurredAt(
      new Date("2026-07-27T13:19:05.530Z"),
    );
    expect(formatted).toMatch(
      /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}（UTC[+-]\d{2}:\d{2}，本机时间）$/,
    );
    expect(formatted).not.toContain("T13:19:05.530Z");
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
    expect(text).toContain("本机时间");
    expect(text).toContain("页面：/intelligence");
    expect(text).toContain("[已隐藏]");
    expect(text).not.toContain("abc.def");
    expect(text).not.toContain("sk-super-secret");
    expect(text).not.toContain("sid=abc");
    expect(text).not.toContain("关联编号");
  });

  it("[T-575] 应用内发送预览只含契约允许的文字和基本版本信息", () => {
    const text = buildProductFeedbackPreview({
      summary: "导出按钮没有反应",
      description: "点击后没有文件 Authorization: Bearer secret",
      appVersion: "0.2.1",
      os: "macOS · Apple 芯片",
      locale: "zh-CN",
    });

    expect(text).toContain("问题摘要：导出按钮没有反应");
    expect(text).toContain("问题描述：点击后没有文件 Authorization: Bearer [已隐藏]");
    expect(text).toContain("应用版本：0.2.1");
    expect(text).toContain("系统：macOS · Apple 芯片");
    expect(text).toContain("语言：zh-CN");
    expect(text).not.toMatch(/页面：|时间：|日志|激活码|关联编号|secret/);
  });
});
