import { describe, it, expect, beforeEach } from "vitest";
import { createDb, type Db } from "@creatoros/backend";
import {
  ENDPOINTS,
  type Endpoint,
  type RequestContext,
  type Transport,
} from "@creatoros/contract";
import { createSchedulingService } from "./scheduling.service";
import { createSchedulingTransport } from "./scheduling.transport";

// Scheduling contract test (T-007 D1) — for the 7 op ids, drive the transport with a
// seeded ctx + valid input and assert the op's contract response DTO .parse(envelope.data)
// succeeds (the output validates against the wire shape; per-item for the isList lists).
// Also: meta carries requestId; a persisted op with NO ctx throws (401 seam). Mirrors the
// candidate contract test.

const NOW = "2026-06-21T00:00:00.000Z";
// [T-332 S2] strict 门下 per-account op 必须带号(未选号 → AccountRequiredError 引导态)。
const ctx: RequestContext = {
  userId: "user-a",
  requestId: "r1",
  source: "user",
  accountId: "acct-a",
};

const ep = (id: string) => ({ id }) as unknown as Endpoint;
async function call(
  transport: Transport,
  id: string,
  input: unknown,
  rctx: RequestContext | undefined = ctx,
): Promise<{ data: unknown; meta?: { requestId?: string } }> {
  const res = await transport.request(ep(id), input as never, rctx);
  return res as { data: unknown; meta?: { requestId?: string } };
}

function makeTransport(db: Db): Transport {
  let seq = 0;
  const service = createSchedulingService({
    db,
    now: () => NOW,
    nextId: (prefix: string) => `${prefix}-${++seq}`,
  });
  return createSchedulingTransport(() => service);
}

describe("scheduling contract (transport round-trip)", () => {
  let db: Db;
  let transport: Transport;
  beforeEach(async () => {
    ({ db } = await createDb());
    transport = makeTransport(db);
  });

  it("scheduledJobs.create → scheduledJobResource", async () => {
    const res = await call(transport, "scheduledJobs.create", {
      body: {
        name: "每天抓我主页",
        sourceKind: "self.metrics",
        target: { externalSourceId: "src-1" },
        schedule: "0 9 * * *",
        toolGrants: [],
      },
    });
    const parsed = ENDPOINTS.createScheduledJob.response.parse(res.data);
    expect(parsed).toMatchObject({
      userId: "user-a",
      name: "每天抓我主页",
      sourceKind: "self.metrics",
      enabled: true,
    });
    expect(res.meta?.requestId).toBe("r1");
  });

  it("scheduledJobs.list → each row parses; meta carries paging", async () => {
    await call(transport, "scheduledJobs.create", {
      body: {
        name: "job-1",
        sourceKind: "comments",
        schedule: "0 9 * * *",
      },
    });
    const res = await call(transport, "scheduledJobs.list", { query: {} });
    const rows = res.data as unknown[];
    expect(rows.length).toBe(1);
    for (const row of rows) ENDPOINTS.listScheduledJobs.response.parse(row);
  });

  it("scheduledJobs.get / update / setEnabled → scheduledJobResource", async () => {
    const created = await call(transport, "scheduledJobs.create", {
      body: { name: "j", sourceKind: "self.metrics", schedule: "0 9 * * *" },
    });
    const jobId = (created.data as { id: string }).id;

    const got = await call(transport, "scheduledJobs.get", {
      params: { jobId },
    });
    ENDPOINTS.getScheduledJob.response.parse(got.data);

    const updated = await call(transport, "scheduledJobs.update", {
      params: { jobId },
      body: { name: "renamed", schedule: "30 9 * * *" },
    });
    const uParsed = ENDPOINTS.updateScheduledJob.response.parse(updated.data);
    expect(uParsed.name).toBe("renamed");
    expect(uParsed.schedule).toBe("30 9 * * *");

    const toggled = await call(transport, "scheduledJobs.setEnabled", {
      params: { jobId },
      body: { enabled: false },
    });
    const tParsed = ENDPOINTS.setScheduledJobEnabled.response.parse(toggled.data);
    expect(tParsed.enabled).toBe(false);
  });

  it("jobRuns.listByJob / get → jobRunResource (via service.createRun seed)", async () => {
    // No wire write for runs (D1); seed one through the service, then read it back.
    const created = await call(transport, "scheduledJobs.create", {
      body: { name: "j", sourceKind: "comments", schedule: "0 9 * * *" },
    });
    const jobId = (created.data as { id: string }).id;

    let seq = 100;
    const svc = createSchedulingService({
      db,
      now: () => NOW,
      nextId: (prefix: string) => `${prefix}-${++seq}`,
    });
    const run = await svc.createRun(ctx, { jobId, aiTaskId: "ait-1" });

    const list = await call(transport, "jobRuns.listByJob", {
      params: { jobId },
      query: {},
    });
    const rows = list.data as unknown[];
    expect(rows.length).toBe(1);
    for (const row of rows) ENDPOINTS.listJobRunsByJob.response.parse(row);

    const got = await call(transport, "jobRuns.get", {
      params: { runId: run.id },
    });
    const gParsed = ENDPOINTS.getJobRun.response.parse(got.data);
    expect(gParsed.jobId).toBe(jobId);
    expect(gParsed.status).toBe("running");
  });

  it("an unauthenticated dispatch (no ctx) throws", async () => {
    await expect(
      transport.request(ep("scheduledJobs.list"), { query: {} } as never, undefined),
    ).rejects.toBeTruthy();
  });
});
