import { describe, it, expect, beforeEach } from "vitest";
import { createDb, type Db } from "@creatoros/backend";
import {
  ENDPOINTS,
  type Endpoint,
  type RequestContext,
  type Transport,
} from "@creatoros/contract";
import { createPlatformAccountService } from "./platform-account.service";
import { createPlatformAccountTransport } from "./platform-account.transport";
import { UnsupportedOperationError } from "./platform-account.errors";

// PlatformAccount contract test (Step 4) — for EACH of the 5 op ids, drive the
// transport with a seeded ctx + valid input and assert the op's contract response DTO
// .parse(envelope.data) succeeds (the output validates against the wire shape;
// per-item for accounts.list). Also: meta carries requestId; archive returns
// status:'archived'; an unknown op id throws UnsupportedOperationError; a persisted op
// with no ctx throws (unauthenticated). Mirrors the candidate contract test.

const NOW = "2026-06-21T00:00:00.000Z";
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
  const service = createPlatformAccountService({
    db,
    now: () => NOW,
    nextId: (prefix: string) => `${prefix}-${++seq}`,
  });
  return createPlatformAccountTransport(() => service);
}

describe("platform-account contract", () => {
  let db: Db;
  let transport: Transport;
  beforeEach(async () => {
    ({ db } = await createDb());
    transport = makeTransport(db);
  });

  it("accounts.create → platformAccountResource", async () => {
    const res = await call(transport, "accounts.create", {
      body: { platform: "douyin", accountHandle: "@main", followerBaseline: 100 },
    });
    const parsed = ENDPOINTS.createAccount.response.parse(res.data);
    expect(parsed).toMatchObject({
      platform: "douyin",
      accountHandle: "@main",
      status: "active",
    });
    expect(res.meta?.requestId).toBe("r1");
  });

  it("accounts.list → platformAccountResource[] (per item)", async () => {
    await call(transport, "accounts.create", {
      body: { platform: "bilibili", accountHandle: "@b" },
    });
    const res = await call(transport, "accounts.list", {
      query: { page: 1, pageSize: 20 },
    });
    const rows = res.data as unknown[];
    for (const row of rows) ENDPOINTS.listAccounts.response.parse(row);
    expect(rows.length).toBeGreaterThan(0);
  });

  it("accounts.get → platformAccountResource", async () => {
    const created = (
      await call(transport, "accounts.create", {
        body: { platform: "douyin", accountHandle: "@g" },
      })
    ).data as { id: string };
    const res = await call(transport, "accounts.get", {
      params: { accountId: created.id },
    });
    ENDPOINTS.getAccount.response.parse(res.data);
  });

  it("accounts.update → platformAccountResource", async () => {
    const created = (
      await call(transport, "accounts.create", {
        body: { platform: "douyin", accountHandle: "@u" },
      })
    ).data as { id: string };
    const res = await call(transport, "accounts.update", {
      params: { accountId: created.id },
      body: { followerBaseline: 555 },
    });
    const parsed = ENDPOINTS.updateAccount.response.parse(res.data);
    expect(parsed.followerBaseline).toBe(555);
  });

  it("accounts.archive → platformAccountResource (status archived)", async () => {
    const created = (
      await call(transport, "accounts.create", {
        body: { platform: "douyin", accountHandle: "@a" },
      })
    ).data as { id: string };
    const res = await call(transport, "accounts.archive", {
      params: { accountId: created.id },
      body: {},
    });
    const parsed = ENDPOINTS.archiveAccount.response.parse(res.data);
    expect(parsed.status).toBe("archived");
  });

  it("secret hygiene: secretReference reference is stored as-is, never a raw token leak", async () => {
    const res = await call(transport, "accounts.create", {
      body: {
        platform: "douyin",
        accountHandle: "@sec",
        secretReference: "env:DOUYIN_TOKEN_REF",
      },
    });
    const parsed = ENDPOINTS.createAccount.response.parse(res.data);
    // The stored value is the opaque REFERENCE label (not a raw token); the wire shape
    // carries exactly the reference the caller supplied.
    expect(parsed.secretReference).toBe("env:DOUYIN_TOKEN_REF");
  });

  it("unknown op id throws UnsupportedOperationError", async () => {
    await expect(call(transport, "accounts.bogus", {})).rejects.toBeInstanceOf(
      UnsupportedOperationError,
    );
  });

  it("a persisted op with no ctx throws (unauthenticated)", async () => {
    await expect(
      transport.request(ep("accounts.list"), { query: {} } as never, undefined),
    ).rejects.toBeTruthy();
  });
});
