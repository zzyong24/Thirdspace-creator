import { describe, it, expect, beforeEach } from "vitest";
import { createDb, type Db } from "@creatoros/backend";
import {
  ENDPOINTS,
  type Endpoint,
  type RequestContext,
  type Transport,
} from "@creatoros/contract";
import { createContentCalendarService } from "./content-calendar.service";
import { createContentCalendarTransport } from "./content-calendar.transport";
import { UnsupportedOperationError } from "./content-calendar.errors";

// ContentCalendar contract test (Step 4) — for EACH of the 8 op ids, drive the
// transport with a seeded ctx + valid input and assert the op's contract response DTO
// .parse(envelope.data) succeeds (per-item for accounts.calendar.list). Also: meta
// carries requestId; an attainment happy path parses with attainmentRatio in [0,1]; an
// unknown op id throws UnsupportedOperationError; a persisted op with no ctx throws.

const NOW = "2026-07-20T00:00:00.000Z";
const ACC = "acct-1";
const ctx: RequestContext = { userId: "user-a", requestId: "r1", source: "user" };

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
  const service = createContentCalendarService({
    db,
    now: () => NOW,
    nextId: (prefix: string) => `${prefix}-${++seq}`,
    clock: { now: () => NOW },
    platformAccounts: { getAccount: async () => ({}) },
    publishing: { isOutputPublished: async () => false },
    candidates: { exists: async () => true },
    notifications: { notify: async () => {} },
  });
  return createContentCalendarTransport(() => service);
}

const WINDOW = { from: "2026-07-01T00:00:00.000Z", to: "2026-07-31T00:00:00.000Z" };

async function seedEntry(transport: Transport): Promise<string> {
  const res = await call(transport, "accounts.calendar.entries.create", {
    params: { accountId: ACC },
    body: { plannedAt: "2026-07-21T09:00:00.000Z" },
  });
  return (res.data as { id: string }).id;
}

describe("content-calendar contract", () => {
  let db: Db;
  let transport: Transport;
  beforeEach(async () => {
    ({ db } = await createDb());
    transport = makeTransport(db);
  });

  it("accounts.calendar.entries.create → contentCalendarEntryResource", async () => {
    const res = await call(transport, "accounts.calendar.entries.create", {
      params: { accountId: ACC },
      body: { plannedAt: "2026-07-21T09:00:00.000Z", note: "draft" },
    });
    const parsed = ENDPOINTS.createEntry.response.parse(res.data);
    expect(parsed).toMatchObject({
      accountId: ACC,
      status: "planned",
      note: "draft",
    });
    expect(res.meta?.requestId).toBe("r1");
  });

  it("accounts.calendar.list → contentCalendarEntryResource[] (per item)", async () => {
    await seedEntry(transport);
    const res = await call(transport, "accounts.calendar.list", {
      params: { accountId: ACC },
      query: { ...WINDOW, page: 1, pageSize: 20 },
    });
    const rows = res.data as unknown[];
    for (const row of rows) ENDPOINTS.listCalendar.response.parse(row);
    expect(rows.length).toBeGreaterThan(0);
  });

  it("calendar.entries.update → contentCalendarEntryResource", async () => {
    const id = await seedEntry(transport);
    const res = await call(transport, "calendar.entries.update", {
      params: { entryId: id },
      body: { note: "revised" },
    });
    const parsed = ENDPOINTS.updateEntry.response.parse(res.data);
    expect(parsed.note).toBe("revised");
  });

  it("calendar.entries.transition → contentCalendarEntryResource (published)", async () => {
    const id = await seedEntry(transport);
    const res = await call(transport, "calendar.entries.transition", {
      params: { entryId: id },
      body: { status: "published" },
    });
    const parsed = ENDPOINTS.transitionEntry.response.parse(res.data);
    expect(parsed.status).toBe("published");
    expect(parsed.publishedAt).toBe(NOW);
  });

  it("calendar.entries.delete → { id, deleted: true }", async () => {
    const id = await seedEntry(transport);
    const res = await call(transport, "calendar.entries.delete", {
      params: { entryId: id },
    });
    const parsed = ENDPOINTS.deleteEntry.response.parse(res.data);
    expect(parsed).toEqual({ id, deleted: true });
  });

  it("accounts.cadence.upsert → publishingCadenceResource", async () => {
    const res = await call(transport, "accounts.cadence.upsert", {
      params: { accountId: ACC },
      body: { frequency: "weekly", preferredSlots: [{ weekday: 1, time: "09:00" }] },
    });
    const parsed = ENDPOINTS.upsertCadence.response.parse(res.data);
    expect(parsed.frequency).toBe("weekly");
    expect(parsed.preferredSlots).toEqual([{ weekday: 1, time: "09:00" }]);
  });

  it("accounts.cadence.get → publishingCadenceResource (nullable; null when none)", async () => {
    const none = await call(transport, "accounts.cadence.get", {
      params: { accountId: "acct-none" },
    });
    expect(ENDPOINTS.getCadence.response.parse(none.data)).toBeNull();

    await call(transport, "accounts.cadence.upsert", {
      params: { accountId: ACC },
      body: { frequency: "daily", preferredSlots: [] },
    });
    const got = await call(transport, "accounts.cadence.get", {
      params: { accountId: ACC },
    });
    const parsed = ENDPOINTS.getCadence.response.parse(got.data);
    expect(parsed?.frequency).toBe("daily");
  });

  it("accounts.cadence.attainment → cadenceAttainmentResource (ratio in [0,1])", async () => {
    await call(transport, "accounts.cadence.upsert", {
      params: { accountId: ACC },
      body: { frequency: "weekly", preferredSlots: [] },
    });
    const id = await seedEntry(transport);
    await call(transport, "calendar.entries.transition", {
      params: { entryId: id },
      body: { status: "published" },
    });
    const res = await call(transport, "accounts.cadence.attainment", {
      params: { accountId: ACC },
      query: WINDOW,
    });
    const parsed = ENDPOINTS.getCadenceAttainment.response.parse(res.data);
    expect(parsed.accountId).toBe(ACC);
    expect(parsed.attainmentRatio).toBeGreaterThanOrEqual(0);
    expect(parsed.attainmentRatio).toBeLessThanOrEqual(1);
    expect(parsed.publishedCount).toBe(1);
  });

  it("unknown op id throws UnsupportedOperationError", async () => {
    await expect(call(transport, "calendar.bogus", {})).rejects.toBeInstanceOf(
      UnsupportedOperationError,
    );
  });

  it("a persisted op with no ctx throws (unauthenticated)", async () => {
    await expect(
      transport.request(
        ep("accounts.calendar.list"),
        { params: { accountId: ACC }, query: WINDOW } as never,
        undefined,
      ),
    ).rejects.toBeTruthy();
  });
});
