import { describe, it, expect, beforeEach } from "vitest";
import { resetStore, getStore } from "../index";
import { client } from "@/server/mock-backend/in-process-client";

// The contract's list endpoints are typed `isList: boolean`, so the typed
// client's return type collapses to the single resource rather than an array.
// At runtime the listEnvelope yields an array; cast to assert the runtime shape
// without depending on that typing gap (same pattern as mock-transport.test.ts).
type WithProjectId = { projectId: string };

describe("projects reads via client", () => {
  beforeEach(() => resetStore());

  it("lists projects from the store", async () => {
    const projects = (await client.listProjects({
      params: undefined,
      query: { page: 1, pageSize: 50 },
      body: undefined,
    })) as unknown as unknown[];
    expect(projects.length).toBe(getStore().projects.length);
  });

  it("gets one project", async () => {
    const id = getStore().projects[0]!.id;
    const p = await client.getProject({
      params: { projectId: id },
      query: undefined,
      body: undefined,
    });
    expect(p.id).toBe(id);
  });

  it("throws for an unknown project id", async () => {
    await expect(
      client.getProject({
        params: { projectId: "project-does-not-exist" },
        query: undefined,
        body: undefined,
      }),
    ).rejects.toThrow();
  });

  it("lists a project's outputs from the store", async () => {
    const id = getStore().projects[0]!.id;
    const outputs = (await client.listOutputs({
      params: { projectId: id },
      query: undefined,
      body: undefined,
    })) as unknown as WithProjectId[];
    expect(Array.isArray(outputs)).toBe(true);
    expect(outputs.every((o) => o.projectId === id)).toBe(true);
  });

  it("lists a project's tasks from the store", async () => {
    const id = getStore().projects[0]!.id;
    const tasks = (await client.listTasks({
      params: { projectId: id },
      query: undefined,
      body: undefined,
    })) as unknown as WithProjectId[];
    expect(Array.isArray(tasks)).toBe(true);
    expect(tasks.every((t) => t.projectId === id)).toBe(true);
  });

  it("lists a project's activity from the store", async () => {
    const id = getStore().projects[0]!.id;
    const activity = (await client.listActivity({
      params: { projectId: id },
      query: undefined,
      body: undefined,
    })) as unknown as WithProjectId[];
    expect(Array.isArray(activity)).toBe(true);
    expect(activity.every((a) => a.projectId === id)).toBe(true);
  });
});

describe("projects writes via client", () => {
  beforeEach(() => resetStore());

  it("creates a project and appends it to the store", async () => {
    const before = getStore().projects.length;
    const p = await client.createProject({
      params: undefined,
      query: undefined,
      body: { title: "新选题", brief: "" },
    });
    expect(p.id).toMatch(/-mock-/);
    expect(p.title).toBe("新选题");
    expect(p.status).toBe("active");
    expect(p.currentStage).toBe("research");
    expect(getStore().projects.length).toBe(before + 1);
    expect(getStore().projects.some((x) => x.id === p.id)).toBe(true);
  });

  it("transitions a project to an adjacent stage and logs activity", async () => {
    const id = getStore().projects[0]!.id; // currentStage "script"
    const before = getStore().projectActivities.filter(
      (a) => a.projectId === id,
    ).length;
    const p = await client.transitionProjectStage({
      params: { projectId: id, stage: "planning" },
      query: undefined,
      body: {},
    });
    expect(p.currentStage).toBe("planning");
    const activity = getStore().projectActivities.filter(
      (a) => a.projectId === id,
    );
    expect(activity.length).toBe(before + 1);
    expect(activity.some((a) => a.eventType === "stage_transition")).toBe(true);
  });

  it("throws for an illegal (non-adjacent) stage transition", async () => {
    const id = getStore().projects[0]!.id; // currentStage "script"
    await expect(
      client.transitionProjectStage({
        params: { projectId: id, stage: "review" },
        query: undefined,
        body: {},
      }),
    ).rejects.toThrow(/ConflictError/i);
  });

  it("archives a project (status + archivedAt)", async () => {
    const id = getStore().projects[0]!.id;
    const p = await client.archiveProject({
      params: { projectId: id },
      query: undefined,
      body: undefined,
    });
    expect(p.status).toBe("archived");
    expect(p.archivedAt).not.toBeNull();
    expect(getStore().projects.find((x) => x.id === id)!.status).toBe(
      "archived",
    );
  });

  it("patches allowed project fields (shallow merge)", async () => {
    const id = getStore().projects[0]!.id;
    const p = await client.patchProject({
      params: { projectId: id },
      query: undefined,
      body: { starred: true, title: "改名了" },
    });
    expect(p.starred).toBe(true);
    expect(p.title).toBe("改名了");
    expect(getStore().projects.find((x) => x.id === id)!.starred).toBe(true);
  });
});
