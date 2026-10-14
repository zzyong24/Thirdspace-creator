import * as React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { AccountMetricSnapshotResource, PlatformWorkResource, WorkMetricSnapshotResource } from "@creatoros/contract";
import { PlatformCapabilityOverview } from "./platform-capability-overview";
import { PlatformWorkCatalog, type PlatformWorkCatalogModel } from "./platform-work-catalog";

afterEach(cleanup);

const work: PlatformWorkResource = {
  id: "work-1", userId: "user-a", accountId: "acct-a", platform: "xiaohongshu",
  externalId: "note-1", title: "真实笔记标题", kind: "image", publishedAt: "2026-09-01T00:00:00.000Z",
  visibility: { visibility: "unknown", source: "management", sourcePriority: 1, observedAt: "2026-09-02T00:00:00.000Z" },
  source: "management", observedAt: "2026-09-02T00:00:00.000Z", ingestedAt: "2026-09-02T00:00:01.000Z",
  catalogGeneration: 0, publicationId: null, legacyProjectId: null, legacyPublicationId: null,
  directoryState: "current", directoryReasonCode: null,
};
const follower: AccountMetricSnapshotResource = {
  id: "metric-follower", userId: "user-a", accountId: "acct-a", platform: "xiaohongshu",
  metricKey: "follower_count", value: 0, availability: "available", unit: "count",
  window: { kind: "lifetime" }, source: "creator", sourceSnapshotKey: null,
  capturedAt: "2026-09-02T00:00:00.000Z", observedAt: "2026-09-02T00:00:00.000Z", ingestedAt: "2026-09-02T00:00:01.000Z",
};
const unavailableMetric: WorkMetricSnapshotResource = {
  ...follower, id: "metric-work", metricKey: "view_count", platformWorkId: "work-1",
  value: null, availability: "sourceMissing",
};
function model(override: Partial<PlatformWorkCatalogModel> = {}): PlatformWorkCatalogModel {
  return {
    accountId: "acct-a", accountName: "账号 A", catalogCompleteness: "legacyPartial", catalogCompletedAt: null,
    total: 1, currentTotal: 1, unavailableTotal: 0, nextCursor: null, cursor: null, works: [work], selectedWork: work,
    workMetrics: [unavailableMetric], workMetricNextCursor: null, workMetricCursor: null, workMetricError: false,
    accountMetrics: [follower], accountMetricError: false, accountMetricNextCursor: null,
    accountMetricCursor: null, ...override,
  };
}

describe("平台目录读侧", () => {
  it("历史目录明确标出非全量，并区分真实 0 与来源缺失", () => {
    render(<PlatformWorkCatalog model={model()} />);
    expect(screen.getByTestId("catalog-completeness").textContent).toContain("尚未核验是否包含全部作品");
    expect(screen.getByText("公开状态未核实")).toBeTruthy();
    expect(screen.getAllByText("真实笔记标题").length).toBeGreaterThan(0);
    expect(screen.getByText("0")).toHaveAttribute("data-availability", "available");
    expect(screen.getByText("平台未提供")).toHaveAttribute("data-availability", "sourceMissing");
    expect(screen.queryByText("已核验完整目录")).toBeNull();
  });

  it("完整目录才显示完整数量和核验时间，空目录保留下一步", () => {
    render(<PlatformWorkCatalog model={model({
      catalogCompleteness: "verifiedComplete", catalogCompletedAt: "2026-09-03T00:00:00.000Z",
      total: 0, currentTotal: 0, unavailableTotal: 0, works: [], selectedWork: null, workMetrics: [], accountMetrics: [],
    })} />);
    expect(screen.getByTestId("catalog-completeness").textContent).toContain("已核验 0 件作品，另有 0 条历史记录待核验");
    expect(screen.getByText(/当前目录没有作品/)).toBeTruthy();
    expect(screen.getByText("返回账号")).toHaveAttribute("href", "/accounts");
  });

  it("分页与项目入口只指向当前账号的真实作品", () => {
    render(<PlatformWorkCatalog model={model({
      nextCursor: "20", cursor: "10", accountMetricNextCursor: "100",
      selectedWork: { ...work, legacyProjectId: "project-a" },
      works: [{ ...work, legacyProjectId: "project-a" }],
    })} />);
    expect(screen.getByText("下一页作品")).toHaveAttribute("href", "/accounts/works?accountId=acct-a&cursor=20");
    expect(screen.getByText("下一页账号数据")).toHaveAttribute("href", "/accounts/works?accountId=acct-a&cursor=10&workId=work-1&accountMetricCursor=100");
    expect(screen.getByText("查看关联项目")).toHaveAttribute("href", "/projects/project-a");
    expect(screen.getByTestId("platform-work-catalog")).toHaveAttribute("data-account-id", "acct-a");
  });

  it("平台没有提供标题时如实显示作品 ID，不用项目名补造标题", () => {
    render(<PlatformWorkCatalog model={model({
      works: [{ ...work, title: null }], selectedWork: { ...work, title: null },
    })} />);
    expect(screen.getByText("小红书作品 note-1")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "作品 note-1" })).toBeTruthy();
  });

  it("从完整目录缺席的旧作品保留可见，但不再宣称公开", () => {
    render(<PlatformWorkCatalog model={model({
      catalogCompleteness: "verifiedComplete", catalogCompletedAt: "2026-09-03T00:00:00.000Z",
      currentTotal: 0, unavailableTotal: 1,
      works: [{ ...work, directoryState: "unavailable", directoryReasonCode: "ABSENT_UNCONFIRMED",
        visibility: { ...work.visibility, visibility: "public" } }],
      selectedWork: { ...work, directoryState: "unavailable", directoryReasonCode: "ABSENT_UNCONFIRMED",
        visibility: { ...work.visibility, visibility: "public" } },
    })} />);
    expect(screen.getByTestId("platform-work-list").textContent).toContain("本次目录未找到，状态待核验");
    expect(screen.getByTestId("platform-work-detail").textContent).toContain("本次目录未找到，状态待核验");
    expect(screen.queryByText("公开")).toBeNull();
    expect(screen.getByText(/仅供查看历史数据/)).toBeTruthy();
  });

  it("能力读取失败显示真实错误，不展示假操作", () => {
    render(<PlatformCapabilityOverview capabilities={[]} readError />);
    expect(screen.getByRole("alert").textContent).toContain("无法读取平台接入状态");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("未接入的平台按真实能力状态展示，不提供绑定按钮", () => {
    render(<PlatformCapabilityOverview capabilities={[{
      platform: "kuaishou", capability: "workCatalog", supported: false,
      authState: "notRequired", runtimeState: "unavailable", reasonCode: "SOURCE_UNMAPPED", lastVerifiedAt: null,
    }]} />);
    const kuaishou = document.querySelector('[data-platform="kuaishou"]');
    expect(kuaishou?.textContent).toContain("作品目录尚未接入");
    expect(screen.queryByRole("button")).toBeNull();
  });
});

it("T1246 作品详情、作品与两类指标分页都携带原账号，完整保留各自游标",()=>{
 render(<PlatformWorkCatalog model={model({accountId:"own account/一",cursor:"works-current",nextCursor:"works-next",workMetricCursor:"metrics-current",workMetricNextCursor:"metrics-next",accountMetricNextCursor:"account-next"})}/>);
 const urls=screen.getAllByRole("link").map(link=>link.getAttribute("href")).filter((href):href is string=>!!href&&href.startsWith("/accounts/works"));
 expect(urls).toHaveLength(4);
 for(const href of urls)expect(new URL(href,"http://localhost").searchParams.get("accountId")).toBe("own account/一");
 expect(screen.getByText("下一页数据记录")).toHaveAttribute("href","/accounts/works?accountId=own+account%2F%E4%B8%80&cursor=works-current&workId=work-1&metricCursor=metrics-next");
});
