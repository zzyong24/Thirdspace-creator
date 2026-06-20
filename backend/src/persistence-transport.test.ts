import { describe, it, expect, beforeEach } from "vitest";
import { createDb, type Db } from "./db";
import { createProjectRepository } from "./repositories/project-repository";
import {
  createPersistenceTransport,
  UnsupportedOperationError,
} from "./persistence-transport";
import type { Endpoint, Transport } from "@creatoros/contract";

const ep = (id: string, isList = false) => ({ id, isList }) as unknown as Endpoint;

let transport: Transport;

beforeEach(async () => {
  const { db } = await createDb();
  const repo = createProjectRepository(db as Db, {
    now: () => "2026-06-13T10:00:00+08:00",
    nextId: (prefix) => `${prefix}-db-1`,
    userId: "user-1",
  });
  transport = createPersistenceTransport(repo);
});

describe("persistence transport", () => {
  it("creates then lists with the envelope shape, durably (the SQL round-trip)", async () => {
    const created = (await transport.request(ep("projects.create"), {
      params: undefined,
      query: undefined,
      body: { title: "联调持久化", brief: "" },
    } as never)) as { data: { id: string } };
    expect(created.data.id).toBe("project-db-1");

    const list = (await transport.request(ep("projects.list", true), {
      params: undefined,
      query: { page: 1, pageSize: 20 },
      body: undefined,
    } as never)) as { data: Array<{ id: string }>; meta: { total: number } };
    expect(list.data.some((p) => p.id === "project-db-1")).toBe(true);
    expect(list.meta.total).toBe(1);
  });

  it("throws UnsupportedOperationError for ops it does not own (route falls back to mock)", async () => {
    await expect(
      transport.request(ep("pages.dashboard.get"), { params: undefined, query: undefined, body: undefined }),
    ).rejects.toBeInstanceOf(UnsupportedOperationError);
  });
});
