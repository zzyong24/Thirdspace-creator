import { describe, it, expect } from "vitest";
import {
  projectResource,
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
