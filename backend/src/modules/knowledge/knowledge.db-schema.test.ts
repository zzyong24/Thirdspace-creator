import {platformAccounts as originalAccounts,type Db as OwnedFixtureDb} from "@creatoros/backend";
import {createAccountGroupService} from "../platform-account/account-group.service";
import { describe, it, expect, beforeEach } from "vitest";
import { createDb, type Db } from "@creatoros/backend";

// A1 (schema round-trip) — applying KNOWLEDGE_DDL via createDb() then a raw
// INSERT … RETURNING on each of the three tables succeeds and the snake_case
// column names match the canonical schema. Esp. jsonb `source_metadata` /
// `structured_data` round-trip an object and `strength` text round-trips "0.8".
// createDb() already runs KNOWLEDGE_DDL (db.ts), so we just assert the tables
// exist + round-trip a row with the documented columns.

describe("knowledge db-schema (KNOWLEDGE_DDL round-trip)", () => {
  let db: Db;
  let client: { query: (sql: string) => Promise<{ rows: unknown[] }> };

  beforeEach(async () => {
    const created = await createDb();
    db = created.db;
    client = created.client as unknown as typeof client;
    await seedOwnedKnowledgeAccount(db,"user-a","acct-a");
  });

  it("knowledge_items round-trips (jsonb source_metadata survives as object)", async () => {
    // [T-332 S1] account_id NOT NULL 收口后,裸 SQL 夹具必须带号。
    const res = await client.query(`
      INSERT INTO knowledge_items
        (id, user_id, account_id, current_revision_id, knowledge_type, title, source_type,
         source_url, source_metadata, status, archived_at, source_note,
         created_at, updated_at)
      VALUES
        ('k-1', 'user-a', 'acct-a', 'rev-1', 'note', '标题', 'manual',
         NULL, '{"sampleSize":120}', 'active', NULL, '来源:人工整理',
         '2026-06-21T00:00:00.000Z', '2026-06-21T00:00:00.000Z')
      RETURNING id, user_id, account_id, current_revision_id, knowledge_type, title,
                source_type, source_url, source_metadata, status, archived_at,
                source_note, created_at, updated_at;
    `);
    expect(res.rows).toHaveLength(1);
    const row = res.rows[0] as Record<string, unknown>;
    expect(row.id).toBe("k-1");
    expect(row.user_id).toBe("user-a");
    expect(row.account_id).toBe("acct-a");
    expect(row.current_revision_id).toBe("rev-1");
    expect(row.knowledge_type).toBe("note");
    expect(row.source_url).toBeNull();
    expect(row.archived_at).toBeNull();
    expect(row.source_metadata).toEqual({ sampleSize: 120 });
    // [T-079a] 迁移 0018:source_note 列存在且往返。
    expect(row.source_note).toBe("来源:人工整理");
    expect(row.created_at).toBe("2026-06-21T00:00:00.000Z");
  });

  it("knowledge_revisions round-trips (jsonb structured_data survives)", async () => {
    const res = await client.query(`
      INSERT INTO knowledge_revisions
        (id, knowledge_item_id, revision_number, content, structured_data, created_at)
      VALUES
        ('rev-1', 'k-1', 1, '正文', '{"sample":120}', '2026-06-21T00:00:00.000Z')
      RETURNING id, knowledge_item_id, revision_number, content, structured_data, created_at;
    `);
    expect(res.rows).toHaveLength(1);
    const row = res.rows[0] as Record<string, unknown>;
    expect(row.id).toBe("rev-1");
    expect(row.knowledge_item_id).toBe("k-1");
    expect(row.revision_number).toBe(1);
    expect(row.content).toBe("正文");
    expect(row.structured_data).toEqual({ sample: 120 });
  });

  it("A2: createDb() applies KNOWLEDGE_DDL — knowledge_items exists, empty", async () => {
    const res = await client.query(`SELECT count(*)::int AS n FROM knowledge_items;`);
    const row = res.rows[0] as Record<string, unknown>;
    expect(row.n).toBe(0);
  });

  it("knowledge_relations round-trips (strength text holds the decimal '0.8')", async () => {
    const res = await client.query(`
      INSERT INTO knowledge_relations
        (id, source_knowledge_id, target_knowledge_id, relation_type, strength, created_by_type)
      VALUES
        ('krel-1', 'k-1', 'k-2', 'references', '0.8', 'user')
      RETURNING id, source_knowledge_id, target_knowledge_id, relation_type, strength, created_by_type;
    `);
    expect(res.rows).toHaveLength(1);
    const row = res.rows[0] as Record<string, unknown>;
    expect(row.id).toBe("krel-1");
    expect(row.source_knowledge_id).toBe("k-1");
    expect(row.target_knowledge_id).toBe("k-2");
    expect(row.relation_type).toBe("references");
    expect(row.strength).toBe("0.8");
    expect(row.created_by_type).toBe("user");
  });
});

async function seedOwnedKnowledgeAccount(db:OwnedFixtureDb,userId:string,accountId:string){
 const stamp="2026-06-21T00:00:00.000Z";
 await db.insert(originalAccounts).values({id:accountId,userId,platform:'douyin',accountHandle:accountId,createdAt:stamp,updatedAt:stamp}).onConflictDoNothing();
 await createAccountGroupService({db,now:()=>stamp,nextId:prefix=>`${prefix}-${accountId}-fixture`}).ensureLegacyGroups({userId,requestId:'original-knowledge-fixture',source:'user'});
}
