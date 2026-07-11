/**
 * [T-209] 复盘报告导出单测 —— 自包含 HTML 生成 / 文件名 / module 桥 + 触发下载。
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildReviewReportHtml,
  publishReviewExportModel,
  reviewReportFileName,
  triggerReviewReportDownload,
} from "./review-report-export";
import type { AnalyticsViewModel } from "@/types/view-models";

function makeVm(overrides: Partial<AnalyticsViewModel> = {}): AnalyticsViewModel {
  return {
    scenario: "default",
    kind: "analytics-review",
    loading: false,
    projectId: "project-42",
    tabs: [],
    metrics: [
      { id: "m1", label: "播放", value: "12,345", delta: "+8%", trend: "up", tone: "positive" },
      { id: "m2", label: "点赞", value: "678", delta: "-2%", trend: "down", tone: "negative" },
    ],
    viewsTrend: [{ label: "07-01", value: 100 }],
    conversionFunnel: [
      { label: "曝光", value: 1000 },
      { label: "转化", value: 50 },
    ],
    audienceProfile: [],
    audienceSource: [],
    retentionCurve: [],
    keyMoments: [],
    topPublished: [],
    aiAnalysis: [{ id: "a1", title: "钩子偏弱", body: "前 3 秒没有制造悬念" }],
    reviewHistory: [
      { id: "r1", title: "项目复盘 · 07-01 ~ 07-07", completedAt: "2026-07-08", tone: "positive" },
    ],
    candidateLearnings: [
      {
        id: "l1",
        title: "开场用数据钩子",
        insight: "用一个反常识数字开场留存更高",
        learningType: "hook",
        validationStatus: "candidate",
        confidenceScore: 0.7,
        reuseCount: 0,
        reviewId: null,
        createdAt: "2026-07-08",
        updatedAt: "2026-07-08",
      },
    ],
    ...overrides,
  } as AnalyticsViewModel;
}

afterEach(() => {
  publishReviewExportModel(null);
  vi.restoreAllMocks();
});

describe("buildReviewReportHtml", () => {
  it("是完整的自包含 HTML 骨架且含标题/指标/AI要点/洞察", () => {
    const html = buildReviewReportHtml(makeVm(), { projectTitle: "我的复盘项目" });
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("<title>复盘报告 · 我的复盘项目</title>");
    // 核心指标
    expect(html).toContain("播放");
    expect(html).toContain("12,345");
    // 转化漏斗
    expect(html).toContain("转化漏斗");
    // AI 要点
    expect(html).toContain("钩子偏弱");
    // 本期经验(洞察)
    expect(html).toContain("开场用数据钩子");
    // 复盘记录
    expect(html).toContain("项目复盘 · 07-01 ~ 07-07");
  });

  it("转义 HTML 特殊字符,防注入", () => {
    const html = buildReviewReportHtml(
      makeVm({ aiAnalysis: [{ id: "x", title: "<script>alert(1)</script>", body: "" }] }),
      { projectTitle: "a<b>c" },
    );
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("空数据区渲染诚实空态,不炸", () => {
    const html = buildReviewReportHtml(
      makeVm({ metrics: [], aiAnalysis: [], candidateLearnings: [], conversionFunnel: [] }),
      {},
    );
    expect(html).toContain("暂无采集到的核心指标");
    expect(html).toContain("还没有生成 AI 复盘要点");
  });
});

describe("reviewReportFileName", () => {
  it("文件名格式 复盘-<项目名>-<日期>.html 且剔除文件系统敏感字符", () => {
    const name = reviewReportFileName(makeVm(), { projectTitle: "a/b:c*d" }, new Date("2026-07-11T10:00:00"));
    expect(name).toBe("复盘-abcd-2026-07-11.html");
  });

  it("无标题时用 projectId 兜底", () => {
    const name = reviewReportFileName(makeVm(), {}, new Date("2026-07-11T10:00:00"));
    expect(name).toBe("复盘-project-42-2026-07-11.html");
  });
});

describe("triggerReviewReportDownload", () => {
  it("无已发布 vm → 返回 false,不触发下载", () => {
    publishReviewExportModel(null);
    expect(triggerReviewReportDownload({})).toBe(false);
  });

  it("有已发布 vm → 生成 Blob 并触发 <a download> 点击", () => {
    publishReviewExportModel(makeVm());
    const createObjectURL = vi.fn(() => "blob:mock");
    const revokeObjectURL = vi.fn();
    // jsdom 无 createObjectURL —— 打桩。
    (URL as unknown as { createObjectURL: unknown }).createObjectURL = createObjectURL;
    (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = revokeObjectURL;
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});

    const ok = triggerReviewReportDownload({ projectTitle: "X" });

    expect(ok).toBe(true);
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });
});
