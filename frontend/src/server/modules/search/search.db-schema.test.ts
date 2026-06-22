import { describe, it, expect, beforeEach } from "vitest";
import { createDb, type Db } from "@creatoros/backend";

// Task 1 (schema round-trip) — applying SEARCH_DDL via createDb() then a raw
// INSERT … RETURNING on each table succeeds and the snake_case column names
// match the canonical schema. createDb() already runs SEARCH_DDL (db.ts), so we
// just assert both tables exist + round-trip a row with the documented columns.

describe("search db-schema (SEARCH_DDL round-trip)", () => {
  let db: Db;
  let client: { query: (sql: string) => Promise<{ rows: unknown[] }> };

  beforeEach(async () => {
    const created = await createDb();
    db = created.db;
    client = created.client as unknown as typeof client;
    void db;
  });

  it("search_documents round-trips (INSERT … RETURNING, snake_case columns)", async () => {
    const res = await client.query(`
      INSERT INTO search_documents
        (id, user_id, entity_type, entity_id, title, body, search_text, embedding, indexed_at)
      VALUES
        ('doc-1', 'user-a', 'project', 'project-1', '标题', '正文', '标题\n正文', '[]', '2026-06-21T00:00:00.000Z')
      RETURNING id, user_id, entity_type, entity_id, title, body, search_text, embedding, indexed_at;
    `);
    expect(res.rows).toHaveLength(1);
    const row = res.rows[0] as Record<string, unknown>;
    expect(row.id).toBe("doc-1");
    expect(row.user_id).toBe("user-a");
    expect(row.entity_type).toBe("project");
    expect(row.entity_id).toBe("project-1");
    expect(row.search_text).toBe("标题\n正文");
    expect(row.indexed_at).toBe("2026-06-21T00:00:00.000Z");
  });

  it("search_documents enforces the (user_id, entity_type, entity_id) unique index", async () => {
    const insert = (id: string, user: string) =>
      client.query(`
        INSERT INTO search_documents
          (id, user_id, entity_type, entity_id, title, body, search_text, embedding, indexed_at)
        VALUES
          ('${id}', '${user}', 'project', 'project-1', 't', '', 't', '[]', '2026-06-21T00:00:00.000Z');
      `);
    await insert("d-a", "user-a");
    // Same user + entity → unique violation. A different user is allowed.
    await expect(insert("d-a2", "user-a")).rejects.toThrow();
    await expect(insert("d-b", "user-b")).resolves.toBeDefined();
  });

  it("search_history round-trips (INSERT … RETURNING, snake_case columns)", async () => {
    const res = await client.query(`
      INSERT INTO search_history
        (id, user_id, query, filters, result_count, searched_at)
      VALUES
        ('hist-1', 'user-a', 'AI', '{"type":["project"]}', 3, '2026-06-21T00:00:00.000Z')
      RETURNING id, user_id, query, filters, result_count, searched_at;
    `);
    expect(res.rows).toHaveLength(1);
    const row = res.rows[0] as Record<string, unknown>;
    expect(row.id).toBe("hist-1");
    expect(row.user_id).toBe("user-a");
    expect(row.query).toBe("AI");
    expect(row.result_count).toBe(3);
    expect(row.searched_at).toBe("2026-06-21T00:00:00.000Z");
  });
});
