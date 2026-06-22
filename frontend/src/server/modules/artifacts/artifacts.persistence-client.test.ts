import { describe, it, expect, beforeEach } from "vitest";
import type { Endpoint, RequestContext } from "@creatoros/contract";
import {
  compositeTransport,
  __resetPersistenceForTests,
} from "@/server/persistence-client";
import { canonicalDataset } from "@/fixtures/canonical";
import { ARTIFACT_OP_IDS } from "./artifacts.transport";

// Step 4/5 — the 7 artifacts ops are registered into the composite (PERSISTED_OPS)
// and a versions.create round-trips through compositeTransport against the seeded
// pglite store. Proves the module is wired into the SAME store server reads + the
// /api/v1 route share (foundation §1 registry) — this is the FE save path.

const ep = (id: string, isList = false) =>
  ({ id, isList }) as unknown as Endpoint;
const ctx = (userId: string): RequestContext => ({
  userId,
  requestId: "req-test",
  source: "user",
});

beforeEach(() => {
  __resetPersistenceForTests();
});

// The canonical project + a seeded master_script artifact owned by the user.
const PROJECT_ID = "project-ainativebrowser";
const SCRIPT_ARTIFACT_ID = "artifact-ainativebrowser-master-script";

describe("artifacts ops registered in the composite transport", () => {
  it("the 7 artifacts op ids are persistence-backed (not the mock)", async () => {
    // A persisted op called with NO ctx throws AuthenticationError; a mock op
    // would resolve. Use that to assert each id is routed to the real transport.
    for (const id of ARTIFACT_OP_IDS) {
      await expect(
        compositeTransport.request(ep(id), {} as never),
      ).rejects.toThrow();
    }
    expect(ARTIFACT_OP_IDS).toHaveLength(7);
  });

  it("artifacts.list returns the seeded artifacts for the owner (user-scoped)", async () => {
    const res = (await compositeTransport.request(
      ep("artifacts.list", true),
      {
        params: { projectId: PROJECT_ID },
        query: { page: 1, pageSize: 50 },
        body: undefined,
      } as never,
      ctx(canonicalDataset.user.id),
    )) as { data: Array<{ id: string; projectId: string }> };
    expect(res.data.length).toBeGreaterThan(0);
    for (const row of res.data) {
      expect(row.projectId).toBe(PROJECT_ID);
    }
  });

  it("artifacts.versions.create round-trips: the new version is the current one + listable", async () => {
    const owner = ctx(canonicalDataset.user.id);
    const created = (await compositeTransport.request(
      ep("artifacts.versions.create"),
      {
        params: { artifactId: SCRIPT_ARTIFACT_ID },
        query: undefined,
        body: { contentText: "保存的新版本", changeSummary: "FE 保存" },
      } as never,
      owner,
    )) as { data: { id: string; versionNumber: number } };
    expect(created.data.id).toBeTruthy();

    const got = (await compositeTransport.request(
      ep("artifacts.get"),
      { params: { artifactId: SCRIPT_ARTIFACT_ID }, query: undefined, body: undefined } as never,
      owner,
    )) as { data: { currentVersionId: string } };
    expect(got.data.currentVersionId).toBe(created.data.id);

    const list = (await compositeTransport.request(
      ep("artifacts.versions.list", true),
      {
        params: { artifactId: SCRIPT_ARTIFACT_ID },
        query: { page: 1, pageSize: 50 },
        body: undefined,
      } as never,
      owner,
    )) as { data: Array<{ id: string }> };
    expect(list.data.some((r) => r.id === created.data.id)).toBe(true);
  });

  it("artifacts.restore round-trips: restoring an old version mints a NEW current version", async () => {
    const owner = ctx(canonicalDataset.user.id);
    const before = (await compositeTransport.request(
      ep("artifacts.get"),
      { params: { artifactId: SCRIPT_ARTIFACT_ID }, query: undefined, body: undefined } as never,
      owner,
    )) as { data: { currentVersionId: string } };
    const oldVersionId = before.data.currentVersionId;

    const restored = (await compositeTransport.request(
      ep("artifacts.restore"),
      {
        params: { artifactId: SCRIPT_ARTIFACT_ID },
        query: undefined,
        body: { versionId: oldVersionId },
      } as never,
      owner,
    )) as { data: { currentVersionId: string } };
    expect(restored.data.currentVersionId).not.toBe(oldVersionId);
  });
});
