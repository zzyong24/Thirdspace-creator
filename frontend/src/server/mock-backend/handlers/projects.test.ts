import { describe, it, expect, beforeEach } from "vitest";
import { resetStore, getStore } from "../index";
import { client } from "@/lib/contract-client";

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
