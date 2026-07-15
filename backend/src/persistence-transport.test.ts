import { describe, it, expect, beforeEach } from "vitest";
import { createDb, type Db } from "./db";
import { createProjectRepository } from "./repositories/project-repository";
import {
  createPersistenceTransport,
  UnsupportedOperationError,
} from "./persistence-transport";
import { AuthenticationError } from "./errors";
import type { Endpoint, RequestContext, Transport } from "@creatoros/contract";

const ep = (id: string, isList = false) => ({ id, isList }) as unknown as Endpoint;

const ctx: RequestContext = {
  userId: "user-1",
  requestId: "req-1",
  source: "user",
};

let transport: Transport;

beforeEach(async () => {
  const { db } = await createDb();
  // Task 8: the transport takes a per-ctx repo factory, not a pre-built repo.
  // userId now comes from the request ctx, not a construction-time constant.
  transport = createPersistenceTransport((requestCtx) =>
    createProjectRepository(db as Db, {
      now: () => "2026-06-13T10:00:00+08:00",
      nextId: (prefix) => `${prefix}-db-1`,
      userId: requestCtx.userId,
      // [T-332 S2] projects.account_id NOT NULL:遗留 repo create 从 ctx 透传号。
      accountId: requestCtx.accountId ?? "acct-test",
    }),
  );
});

describe("persistence transport", () => {
  it("creates then lists with the envelope shape, durably (the SQL round-trip)", async () => {
    const created = (await transport.request(
      ep("projects.create"),
      {
        params: undefined,
        query: undefined,
        body: { title: "联调持久化", brief: "" },
      } as never,
      ctx,
    )) as { data: { id: string } };
    expect(created.data.id).toBe("project-db-1");

    const list = (await transport.request(
      ep("projects.list", true),
      {
        params: undefined,
        query: { page: 1, pageSize: 20 },
        body: undefined,
      } as never,
      ctx,
    )) as { data: Array<{ id: string }>; meta: { total: number } };
    expect(list.data.some((p) => p.id === "project-db-1")).toBe(true);
    expect(list.meta.total).toBe(1);
  });

  it("throws UnsupportedOperationError for ops it does not own (route falls back to mock)", async () => {
    await expect(
      transport.request(
        ep("pages.dashboard.get"),
        { params: undefined, query: undefined, body: undefined },
        ctx,
      ),
    ).rejects.toBeInstanceOf(UnsupportedOperationError);
  });

  it("throws AuthenticationError when a persisted op is reached with no ctx", async () => {
    await expect(
      transport.request(ep("projects.list", true), {
        params: undefined,
        query: { page: 1, pageSize: 20 },
        body: undefined,
      } as never),
    ).rejects.toBeInstanceOf(AuthenticationError);
  });
});
