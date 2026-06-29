import { describe, it, expect } from "vitest";
import {
  projectResource,
  projectStageResource,
  contentOutputResource,
} from "../../src/resources/projects";
import { projectsOperations } from "../../src/operations/projects";

describe("projects contract", () => {
  it("parses a Project resource", () => {
    const p = projectResource.parse({
      id: "project-ainativebrowser",
      userId: "user-zyongzhu",
      title: "AI Native Browser 深度解析",
      brief: "全面解析 AI Native Browser 的核心价值。",
      contentCategory: "tech",
      creationMode: "guided",
      status: "active",
      currentStage: "script",
      progressPct: 58,
      starred: true,
      startedAt: "2026-01-01T02:00:00.000Z",
      targetCompletedAt: null,
      completedAt: null,
      archivedAt: null,
      createdAt: "2026-01-01T02:00:00.000Z",
      updatedAt: "2026-06-13T02:00:00.000Z",
    });
    expect(p.currentStage).toBe("script");
    expect(p.creationMode).toBe("guided");
  });

  it("rejects an unknown status", () => {
    expect(() =>
      projectResource.parse({
        id: "p",
        userId: "u",
        title: "t",
        brief: "",
        contentCategory: "",
        creationMode: "guided",
        status: "draft", // not a ProjectStatus member
        currentStage: "script",
        progressPct: 0,
        starred: false,
        startedAt: "2026-01-01T02:00:00.000Z",
        targetCompletedAt: null,
        completedAt: null,
        archivedAt: null,
        createdAt: "2026-01-01T02:00:00.000Z",
        updatedAt: "2026-01-01T02:00:00.000Z",
      }),
    ).toThrow();
  });

  // contentRole is the monetization-weighted intent layer (§4.4). Optional on
  // both the resource and the createOutput body so existing callers keep working.
  it("parses a ContentOutput without contentRole (back-compat)", () => {
    const o = contentOutputResource.parse({
      id: "output-1",
      projectId: "project-1",
      title: "口播稿",
      contentType: "video",
      format: "mp4",
      aspectRatio: "9:16",
      targetDurationSeconds: 60,
      status: "drafting",
      primaryAssetId: null,
      createdAt: "2026-01-01T02:00:00.000Z",
      updatedAt: "2026-01-01T02:00:00.000Z",
    });
    expect(o.contentRole ?? null).toBeNull();
  });

  it.each(["traffic", "trust", "conversion"] as const)(
    "parses a ContentOutput with contentRole %s",
    (contentRole) => {
      const o = contentOutputResource.parse({
        id: "output-1",
        projectId: "project-1",
        title: "口播稿",
        contentType: "video",
        format: "mp4",
        aspectRatio: "9:16",
        targetDurationSeconds: 60,
        status: "drafting",
        contentRole,
        primaryAssetId: null,
        createdAt: "2026-01-01T02:00:00.000Z",
        updatedAt: "2026-01-01T02:00:00.000Z",
      });
      expect(o.contentRole).toBe(contentRole);
    },
  );

  it("createOutput body accepts an optional contentRole and stays back-compat", () => {
    const body = projectsOperations.createOutput.body;
    expect(body).toBeDefined();
    // base shape still validates (no contentRole)
    expect(body!.parse({ title: "x" })).toEqual({ title: "x" });
    // new optional field validates
    expect(body!.parse({ title: "x", contentRole: "conversion" })).toEqual({
      title: "x",
      contentRole: "conversion",
    });
    // unknown role rejected
    expect(() => body!.parse({ title: "x", contentRole: "viral" })).toThrow();
  });

  it("parses a ProjectStage resource", () => {
    const s = projectStageResource.parse({
      stage: "script",
      status: "in_progress",
      progressPct: 40,
      startedAt: "2026-01-01T02:00:00.000Z",
      completedAt: null,
    });
    expect(s.stage).toBe("script");
    expect(s.status).toBe("in_progress");
    expect(s.progressPct).toBe(40);
  });

  it("rejects an unknown stage status", () => {
    expect(() =>
      projectStageResource.parse({
        stage: "script",
        status: "halfway", // not a StageStatus member
        progressPct: 40,
        startedAt: null,
        completedAt: null,
      }),
    ).toThrow();
  });

  // 立项 Brief 地基(项目工作流补真 ②):brief 是第一个合法阶段;briefDetail 装结构化
  // Brief,整体 default {} 保证存量 payload(不带 briefDetail)仍能 parse(back-compat)。
  it("parses brief as a valid currentStage and defaults briefDetail to empty", () => {
    const p = projectResource.parse({
      id: "project-1",
      userId: "u",
      title: "新项目",
      brief: "",
      contentCategory: "",
      creationMode: "guided",
      status: "active",
      currentStage: "brief",
      progressPct: 0,
      starred: false,
      startedAt: "2026-01-01T02:00:00.000Z",
      targetCompletedAt: null,
      completedAt: null,
      archivedAt: null,
      createdAt: "2026-01-01T02:00:00.000Z",
      updatedAt: "2026-01-01T02:00:00.000Z",
    });
    expect(p.currentStage).toBe("brief");
    // briefDetail 缺省 → 全默认(targetPlatforms 默认 [])。
    expect(p.briefDetail.targetPlatforms).toEqual([]);
    expect(p.briefDetail.targetAudience).toBeUndefined();
  });

  it("parses a populated briefDetail", () => {
    const p = projectResource.parse({
      id: "project-2",
      userId: "u",
      title: "选题立项",
      brief: "",
      briefDetail: {
        targetAudience: "想转型做内容的职场人",
        contentGoal: "建立专业信任",
        contentFormat: "口播",
        targetPlatforms: ["douyin", "bilibili"],
        coreMessage: "用一条视频讲清楚定位",
      },
      contentCategory: "",
      creationMode: "guided",
      status: "active",
      currentStage: "brief",
      progressPct: 0,
      starred: false,
      startedAt: "2026-01-01T02:00:00.000Z",
      targetCompletedAt: null,
      completedAt: null,
      archivedAt: null,
      createdAt: "2026-01-01T02:00:00.000Z",
      updatedAt: "2026-01-01T02:00:00.000Z",
    });
    expect(p.briefDetail.targetAudience).toBe("想转型做内容的职场人");
    expect(p.briefDetail.targetPlatforms).toEqual(["douyin", "bilibili"]);
  });

  it("createProject + patchProject bodies accept an optional briefDetail (back-compat)", () => {
    const createBody = projectsOperations.createProject.body!;
    // base shape (no briefDetail) still validates.
    expect(createBody.parse({ title: "x" }).title).toBe("x");
    const withBrief = createBody.parse({
      title: "x",
      briefDetail: { targetAudience: "A", targetPlatforms: ["x"] },
    });
    expect(withBrief.briefDetail?.targetAudience).toBe("A");

    const patchBody = projectsOperations.patchProject.body!;
    expect(patchBody.parse({}).briefDetail).toBeUndefined();
    const patched = patchBody.parse({
      briefDetail: { contentGoal: "G", targetPlatforms: [] },
    });
    expect(patched.briefDetail?.contentGoal).toBe("G");
  });

  it("registers projects.stages.list as a GET list endpoint", () => {
    expect(projectsOperations.listStages.id).toBe("projects.stages.list");
    expect(projectsOperations.listStages.method).toBe("GET");
    expect(projectsOperations.listStages.path).toBe(
      "/projects/:projectId/stages",
    );
    expect(projectsOperations.listStages.isList).toBe(true);
  });

  it("registers the project list + transition endpoints with FR ids", () => {
    expect(projectsOperations.listProjects.method).toBe("GET");
    expect(projectsOperations.listProjects.path).toBe("/projects");
    expect(projectsOperations.listProjects.isList).toBe(true);
    expect(projectsOperations.transitionProjectStage.path).toBe(
      "/projects/:projectId/stages/:stage/transition",
    );
    expect(projectsOperations.listProjects.fr.length).toBeGreaterThan(0);
  });
});
