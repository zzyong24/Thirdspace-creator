import { describe, it, expect, beforeEach } from "vitest";
import { POST } from "./route";
import { resetStore, getStore } from "@/server/mock-backend/index";

function dispatch(id: string, input: unknown) {
  return POST(
    new Request("http://localhost/api/v1/dispatch", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, input }),
    }),
  );
}

describe("POST /api/v1/dispatch (FE<->BE seam over HTTP)", () => {
  beforeEach(() => resetStore());

  it("serves a read against the server store", async () => {
    const res = await dispatch("projects.list", {
      params: undefined,
      query: { page: 1, pageSize: 20 },
      body: undefined,
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: unknown[] };
    expect(Array.isArray(json.data)).toBe(true);
    expect(json.data.length).toBeGreaterThan(0);
  });

  it("persists a mutation server-side so the next read reflects it (the 联调 round-trip)", async () => {
    const before = getStore().projects.length;

    const created = await dispatch("projects.create", {
      params: undefined,
      query: undefined,
      body: { title: "联调测试项目", brief: "" },
    });
    expect(created.status).toBe(200);
    const createdJson = (await created.json()) as { data: { id: string; title: string } };
    expect(createdJson.data.title).toBe("联调测试项目");

    // The server store grew — a fresh dispatch (as a browser island would issue
    // after router.refresh()) sees the new row.
    expect(getStore().projects.length).toBe(before + 1);
    const list = await dispatch("projects.list", {
      params: undefined,
      query: { page: 1, pageSize: 50 },
      body: undefined,
    });
    const listJson = (await list.json()) as { data: Array<{ id: string }> };
    expect(listJson.data.some((p) => p.id === createdJson.data.id)).toBe(true);
  });

  it("returns 404 for an unknown operation", async () => {
    const res = await dispatch("does.not.exist", {});
    expect(res.status).toBe(404);
  });

  it("returns 501 for a not-yet-implemented operation", async () => {
    const res = await dispatch("learnings.list", {
      params: undefined,
      query: undefined,
      body: undefined,
    });
    expect(res.status).toBe(501);
  });
});
