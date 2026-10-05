import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createDb } from "../../db";

const migration = readFileSync(new URL("../../../drizzle/0105_platform_legacy_backfill.sql", import.meta.url), "utf8");

describe("T-1020 legacy publication backfill", () => {
  it("keeps same external ID in two accounts, links only owned projects, and never claims full scan", async () => {
    const { client } = await createDb();
    try {
      await client.exec(`
        INSERT INTO platform_accounts (id,user_id,platform,account_handle,external_account_id,status,created_at,updated_at)
        VALUES ('acct-a','user-a','douyin','A','sec-a','active','2026-09-30T00:00:00.000Z','2026-09-30T00:00:00.000Z'),
               ('acct-b','user-b','douyin','B','sec-b','active','2026-09-30T00:00:00.000Z','2026-09-30T00:00:00.000Z');
        INSERT INTO projects (id,user_id,account_id,title,creation_mode,status,current_stage,started_at,created_at,updated_at)
        VALUES ('project-a','user-a','acct-a','A 作品','manual','active','ideation','2026-09-30T00:00:00.000Z','2026-09-30T00:00:00.000Z','2026-09-30T00:00:00.000Z');
        INSERT INTO content_outputs (id,project_id,title,content_type,status,created_at,updated_at)
        VALUES ('output-a','project-a','A 视频','video','completed','2026-09-30T00:00:00.000Z','2026-09-30T00:00:00.000Z');
        INSERT INTO publications (id,user_id,account_id,content_output_id,platform,account_reference,status,external_id,created_at,updated_at)
        VALUES ('pub-a','user-a','acct-a','output-a','douyin','A','published','same-id','2026-09-30T00:00:00.000Z','2026-09-30T00:00:00.000Z'),
               ('pub-b','user-b','acct-b','missing-output','douyin','B','published','same-id','2026-09-30T00:00:00.000Z','2026-09-30T00:00:00.000Z'),
               ('pub-invalid','user-a','wrong-account','output-a','douyin','A','published','invalid-id','2026-09-30T00:00:00.000Z','2026-09-30T00:00:00.000Z');
        INSERT INTO metric_snapshots (id,user_id,account_id,publication_id,captured_at,source,raw_metrics,created_at)
        VALUES ('snapshot-a','user-a','acct-a','pub-a','2026-09-30T00:00:00.000Z','ingestion','{"views":0,"likes":5}', '2026-09-30T00:00:00.000Z'),
               ('snapshot-b','user-b','acct-b','pub-b','2026-09-30T00:00:00.000Z','ingestion','{"plays":100,"shares":null}', '2026-09-30T00:00:00.000Z'),
               ('snapshot-wrong','user-b','acct-b','pub-a','2026-09-30T00:00:01.000Z','ingestion','{"views":999}', '2026-09-30T00:00:01.000Z');
      `);
      for (const statement of migration.split("--> statement-breakpoint")) {
        if (statement.trim()) await client.exec(statement);
      }
      const { rows: works } = await client.query<{
        user_id: string; account_id: string; external_id: string; visibility: string;
        legacy_project_id: string | null; outbound_frozen_at: string | null;
      }>("SELECT user_id,account_id,external_id,visibility,legacy_project_id,outbound_frozen_at FROM platform_works ORDER BY account_id");
      expect(works).toHaveLength(2);
      expect(works.map(row => [row.account_id, row.external_id, row.legacy_project_id])).toEqual([
        ["acct-a", "same-id", "project-a"], ["acct-b", "same-id", null],
      ]);
      expect(works.every(row => row.visibility === "unknown" && row.outbound_frozen_at !== null)).toBe(true);
      const { rows: catalogs } = await client.query<{ account_id: string; completed_at: string | null; work_count: number }>(
        "SELECT account_id,completed_at,work_count FROM platform_catalogs ORDER BY account_id");
      expect(catalogs).toEqual([
        { account_id: "acct-a", completed_at: null, work_count: 1 },
        { account_id: "acct-b", completed_at: null, work_count: 1 },
      ]);
      const { rows: conflicts } = await client.query<{ reason_code: string }>(
        "SELECT reason_code FROM platform_collection_migration_conflicts");
      expect(conflicts.map(row => row.reason_code)).toContain("ACCOUNT_IDENTITY_UNVERIFIED");
      const { rows: metrics } = await client.query<{ account_id: string; metric_key: string; value: number }>(
        "SELECT account_id,metric_key,value FROM platform_work_metric_snapshots ORDER BY account_id,metric_key");
      expect(metrics).toEqual([
        { account_id: "acct-a", metric_key: "like_count", value: 5 },
        { account_id: "acct-a", metric_key: "play_count", value: 0 },
        { account_id: "acct-b", metric_key: "play_count", value: 100 },
      ]);
    } finally { await client.close(); }
  });
});
