/**
 * [T-096 矩阵#8] 存量会话归 scope 的迁移(drizzle/0019_ai_conversation_scope.sql)集成测:
 *   - projectId 非空的旧行 → backfill 到 project:<id> 桶(稿面右栏的历史回家);
 *   - projectId 为空的旧行 → 保持 global(增列 DEFAULT 兜底;来源无从考据,诚实归全局);
 *   - DDL + backfill 重复执行幂等(ADD COLUMN IF NOT EXISTS / WHERE scope='global' 使
 *     二次执行为 no-op,已显式改桶的行不被打回)。
 *
 * createDb() 已跑过全部迁移(含 0019),这里直接对真实迁移文件做「再执行」验证 —— 模拟
 * 部署重放/手工重跑,并用 UPDATE 把行伪造回迁移前状态(scope='global' + project_id 非空)
 * 复现 backfill 输入。
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createDb } from "@creatoros/backend";

const MIGRATION_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../drizzle/0019_ai_conversation_scope.sql",
);

describe("[T-096] 0019_ai_conversation_scope 迁移(pglite)", () => {
  it("backfill:projectId 非空 → project:<id>;为空 → global;重复执行幂等", async () => {
    const { client } = await createDb();
    const sql = readFileSync(MIGRATION_PATH, "utf8");

    // 伪造迁移前存量:两类旧行(有项目归属 / 无项目归属),scope 均为增列后的 DEFAULT 'global'。
    await client.exec(`
      -- [T-332 S1] account_id NOT NULL:迁移测试行补号维。
      INSERT INTO ai_conversations (id, user_id, account_id, project_id, scope, title, created_at, updated_at) VALUES
        ('conv-old-proj', 'user-a', 'acct-a', 'proj-9', 'global', '稿面对话', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
        ('conv-old-null', 'user-a', 'acct-a', NULL,     'global', '浮层对话', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
        ('conv-new-surface', 'user-a', 'acct-a', NULL,  'surface:topics', '新契约会话', '2026-01-02T00:00:00.000Z', '2026-01-02T00:00:00.000Z');
    `);

    // 第一次(重)执行:ADD COLUMN IF NOT EXISTS 无害,backfill 只动 scope='global' 且有项目的行。
    await client.exec(sql);
    const after1 = await client.query<{ id: string; scope: string }>(
      `SELECT id, scope FROM ai_conversations ORDER BY id`,
    );
    const scopes1 = Object.fromEntries(after1.rows.map((r) => [r.id, r.scope]));
    expect(scopes1["conv-old-proj"]).toBe("project:proj-9");
    expect(scopes1["conv-old-null"]).toBe("global");
    // 已显式归桶的新行不被迁移打扰。
    expect(scopes1["conv-new-surface"]).toBe("surface:topics");

    // 第二次执行:幂等 —— 结果与第一次完全一致(不重复改写、不报错)。
    await client.exec(sql);
    const after2 = await client.query<{ id: string; scope: string }>(
      `SELECT id, scope FROM ai_conversations ORDER BY id`,
    );
    expect(after2.rows).toEqual(after1.rows);

    // 索引存在(背 listConversations?scope= 的服务端兜底恢复)。
    const idx = await client.query<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes WHERE tablename = 'ai_conversations'`,
    );
    expect(idx.rows.map((r) => r.indexname)).toContain(
      "idx_ai_conversations_user_scope",
    );

    await client.close();
  });
});
