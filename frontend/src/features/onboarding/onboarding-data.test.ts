import { beforeEach, describe, expect, it, vi } from "vitest";

const listProjects = vi.hoisted(() => vi.fn());
const statusDouyin = vi.hoisted(() => vi.fn());
const getPositioningCenter = vi.hoisted(() => vi.fn());
const getIntelligenceWorkspace = vi.hoisted(() => vi.fn());
const listIntelligenceItems = vi.hoisted(() => vi.fn());
const readCurrentAccountId = vi.hoisted(() => vi.fn());

vi.mock("@/lib/contract-client", () => ({
  client: {
    listProjects,
    statusDouyin,
    getPositioningCenter,
    getIntelligenceWorkspace,
    listIntelligenceItems,
  },
}));
vi.mock("@/lib/http-transport", () => ({ readCurrentAccountId }));

import {
  loadProjectSignals,
  loadRadarSignals,
  loadState,
  readReviewedImportedProjects,
  writeReviewedImportedProjects,
} from "./onboarding-data";

describe("[T-637] onboarding data", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    readCurrentAccountId.mockReturnValue("account-1");
    listProjects.mockResolvedValue([]);
    statusDouyin.mockResolvedValue({ loggedIn: false });
    getPositioningCenter.mockResolvedValue({ profile: null });
    getIntelligenceWorkspace.mockResolvedValue({ sources: [] });
    listIntelligenceItems.mockResolvedValue([]);
  });

  it("一次项目读取同时区分历史导入与用户创建", async () => {
    listProjects.mockResolvedValue([
      { id: "old", source: "imported" },
      { id: "new", source: "topic" },
    ]);
    await expect(loadProjectSignals()).resolves.toEqual({
      hasImportedWorks: true,
      hasCreatedProject: true,
    });
  });

  it("只有 imported 项目时，不算完成首个创作项目", async () => {
    listProjects.mockResolvedValue([{ id: "old", source: "imported" }]);
    await expect(loadProjectSignals()).resolves.toEqual({
      hasImportedWorks: true,
      hasCreatedProject: false,
    });
  });

  it("对标监控与已转选题来自内容雷达真值", async () => {
    getIntelligenceWorkspace.mockResolvedValue({
      sources: [
        { id: "source-1", type: "creator_profile", monitorEnabled: true, status: "active" },
      ],
    });
    listIntelligenceItems.mockResolvedValue([{ item: { id: "item-1" } }]);
    await expect(loadRadarSignals()).resolves.toEqual({
      hasBenchmarkMonitor: true,
      hasBenchmarkTopic: true,
    });
    expect(listIntelligenceItems).toHaveBeenCalledWith(
      expect.objectContaining({
        query: expect.objectContaining({ topicState: "converted" }),
      }),
    );
  });

  it("历史项目确认按账号隔离", () => {
    expect(readReviewedImportedProjects("account-1")).toBe(false);
    writeReviewedImportedProjects("account-1");
    expect(readReviewedImportedProjects("account-1")).toBe(true);
    expect(readReviewedImportedProjects("account-2")).toBe(false);
  });

  it("loadState 不再读取模型配置，并装配新的成果信号", async () => {
    listProjects.mockResolvedValue([
      { id: "old", source: "imported" },
      { id: "new", source: "manual" },
    ]);
    statusDouyin.mockResolvedValue({ loggedIn: true });
    getPositioningCenter.mockResolvedValue({ profile: { id: "profile-1" } });
    getIntelligenceWorkspace.mockResolvedValue({
      sources: [
        { id: "source-1", type: "creator_profile", monitorEnabled: true, status: "active" },
      ],
    });
    listIntelligenceItems.mockResolvedValue([{ item: { id: "item-1" } }]);
    writeReviewedImportedProjects("account-1");

    await expect(loadState()).resolves.toMatchObject({
      origin: "existing",
      douyinLoggedIn: true,
      hasImportedWorks: true,
      hasReviewedImportedProjects: true,
      hasPositioningProfile: true,
      hasBenchmarkMonitor: true,
      hasBenchmarkTopic: true,
      hasCreatedProject: true,
    });
  });
});
