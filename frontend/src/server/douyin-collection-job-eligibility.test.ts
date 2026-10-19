import { describe, expect, it } from "vitest";
import { shouldEnsureDouyinCollectionJobs } from "./douyin-collection-job-eligibility";

describe("启动补建抖音采集任务的平台边界", () => {
  it("只补建活跃抖音账号，小红书和快手不被注入抖音任务", () => {
    expect(shouldEnsureDouyinCollectionJobs({ platform: "douyin", status: "active" })).toBe(true);
    for (const platform of ["xiaohongshu", "kuaishou", "wechatOfficialAccount"]) {
      expect(shouldEnsureDouyinCollectionJobs({ platform, status: "active" })).toBe(false);
    }
    expect(shouldEnsureDouyinCollectionJobs({ platform: "douyin", status: "archived" })).toBe(false);
  });
});
