import { describe, it, expect, beforeEach } from "vitest";
import { POST } from "./route";
import { POST as loginPOST } from "../auth/login/route";
import { resetStore } from "@/server/mock-backend/index";
import { __resetPersistenceForTests } from "@/server/persistence-client";
import { DEV_PASSWORD } from "@/server/modules/identity";

const CANONICAL_EMAIL = "zyongzhu@creatoros.local";

// Task 9 — dispatch now derives ctx from the `creatoros_session` cookie. The
// existing round-trip tests below authenticate first (mint a real session via
// the login route) and pass that cookie on every dispatch, so the working
// Projects FE↔BE SQL path stays green under the new auth gate.
let SESSION_COOKIE = "";

async function authenticate(): Promise<void> {
  const res = await loginPOST(
    new Request("http://localhost/api/v1/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: CANONICAL_EMAIL, password: DEV_PASSWORD }),
    }),
  );
  const setCookie = res.headers.get("set-cookie") ?? "";
  const match = /creatoros_session=([^;]*)/.exec(setCookie);
  SESSION_COOKIE = match ? `creatoros_session=${match[1]}` : "";
}

function dispatch(id: string, input: unknown, cookie = SESSION_COOKIE) {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (cookie) headers.cookie = cookie;
  return POST(
    new Request("http://localhost/api/v1/dispatch", {
      method: "POST",
      headers,
      body: JSON.stringify({ id, input }),
    }),
  );
}

async function listProjectIds(): Promise<string[]> {
  const res = await dispatch("projects.list", {
    params: undefined,
    query: { page: 1, pageSize: 50 },
    body: undefined,
  });
  const json = (await res.json()) as { data: Array<{ id: string }> };
  return json.data.map((p) => p.id);
}

describe("POST /api/v1/dispatch (FE<->BE seam over HTTP; project ops on real SQL)", () => {
  beforeEach(async () => {
    resetStore(); // mock-backed ops (outputs/tasks/pages)
    __resetPersistenceForTests(); // fresh pglite seed (project ops)
    await authenticate(); // mint a real session; dispatch carries its cookie
  });

  it("serves a project read from the persistence (seeded) store", async () => {
    const ids = await listProjectIds();
    expect(ids.length).toBeGreaterThan(0); // canonical seed
  });

  it("persists a create in SQL so the next read reflects it (the 联调 round-trip)", async () => {
    const before = (await listProjectIds()).length;

    const created = await dispatch("projects.create", {
      params: undefined,
      query: undefined,
      body: { title: "联调测试项目", brief: "" },
    });
    expect(created.status).toBe(200);
    const createdJson = (await created.json()) as { data: { id: string; title: string } };
    expect(createdJson.data.title).toBe("联调测试项目");

    // A fresh dispatch (as a browser island issues after router.refresh()) sees
    // the new row — read back out of pglite, not an in-memory clone.
    const after = await listProjectIds();
    expect(after.length).toBe(before + 1);
    expect(after).toContain(createdJson.data.id);
  });

  it("serves the composed dashboard page DTO (module Q) with 200", async () => {
    // pages.dashboard.get is now persisted (Wave-4 query-services takeover) — it
    // composes public services and returns the dashboardPage envelope (200).
    const res = await dispatch("pages.dashboard.get", {
      params: undefined,
      query: undefined,
      body: undefined,
    });
    expect(res.status).toBe(200);
  });

  it("returns 404 for an unknown operation", async () => {
    const res = await dispatch("does.not.exist", {});
    expect(res.status).toBe(404);
  });

  it("returns 501 for a not-yet-implemented operation", async () => {
    // `calibration.rubrics.create` is now wired (module 20 Calibration, Wave 5–7),
    // so use a content-calendar op (`accounts.cadence.attainment` — owned by the
    // not-yet-built content-calendar/platform-accounts modules: not persisted, no
    // mock handler → the mock transport raises "operation not implemented" → 501).
    const res = await dispatch("accounts.cadence.attainment", {
      params: undefined,
      query: undefined,
      body: undefined,
    });
    expect(res.status).toBe(501);
  });

  it("returns 401 for a persisted op WITHOUT a session cookie (ctx required)", async () => {
    const res = await dispatch(
      "projects.list",
      { params: undefined, query: { page: 1, pageSize: 50 }, body: undefined },
      "", // no cookie
    );
    expect(res.status).toBe(401);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe("AuthenticationError");
  });

  it("returns 401 for a persisted op WITH an invalid session cookie", async () => {
    const res = await dispatch(
      "projects.list",
      { params: undefined, query: { page: 1, pageSize: 50 }, body: undefined },
      "creatoros_session=garbage",
    );
    expect(res.status).toBe(401);
  });

  it("serves a persisted op WITH a valid session cookie (ctx threaded → 200)", async () => {
    const res = await dispatch("projects.list", {
      params: undefined,
      query: { page: 1, pageSize: 50 },
      body: undefined,
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: Array<{ id: string }> };
    expect(json.data.length).toBeGreaterThan(0);
  });
});
