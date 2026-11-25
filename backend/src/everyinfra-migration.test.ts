import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";
import { createDb } from "./db";

const migration = new URL("../drizzle/0142_everyinfra.sql", import.meta.url);

describe("EveryInfra migration", () => {
  it("aborts on a legacy account and group duplicate before changing any schema or rows", async () => {
    const client = new PGlite();
    try {
      await client.exec(`
        CREATE TABLE intelligence_items (
          id text PRIMARY KEY, user_id text, account_id text, group_id text, platform text, type text, external_id text
        );
        CREATE TABLE integration_credentials (provider text, encrypted_secret text);
        INSERT INTO integration_credentials VALUES ('redfox', 'encrypted-fixture');
        INSERT INTO intelligence_items VALUES
          ('original', 'u', 'a', NULL, 'douyin', 'video', '123'),
          ('duplicate', 'u', 'a', 'grp_legacy_a', 'douyin', 'article', '123');
      `);
      const sql = await readFile(migration, "utf8");
      await expect(client.transaction(tx => tx.exec(sql))).rejects.toThrow("EVERYINFRA_DUPLICATE_PLATFORM_EXTERNAL_ID");
      expect((await client.query("SELECT id FROM intelligence_items ORDER BY id")).rows)
        .toEqual([{ id: "duplicate" }, { id: "original" }]);
      expect((await client.query("SELECT * FROM integration_credentials")).rows)
        .toEqual([{ provider: "redfox", encrypted_secret: "encrypted-fixture" }]);
    } finally {
      await client.close();
    }
  });

  it("applies the canonical tail on a fresh database and keeps native entries writable", async () => {
    const { client } = await createDb();
    try {
      const insert = `
        INSERT INTO intelligence_items
          (id, user_id, account_id, type, platform, external_id, canonical_url, canonical_url_hash, captured_at, created_at, updated_at)
        VALUES ($1, 'fixture-user', 'fixture-account', $2, $3, $4, 'https://example.test/article', $1, 'now', 'now', 'now')
        RETURNING capture_channel
      `;
      expect((await client.query(insert, ["url-item", "article", "web", null])).rows)
        .toEqual([{ capture_channel: "legacy-douyin-cdp" }]);
      await client.query(insert, ["old-douyin", "video", "douyin", "42"]);
      await expect(client.query(insert, ["duplicate", "article", "douyin", "42"]))
        .rejects.toThrow("intelligence_items_platform_external_ux");
      expect((await client.query("SELECT created_at FROM drizzle.__drizzle_migrations WHERE created_at=1791043200015")).rows)
        .toHaveLength(1);
    } finally {
      await client.close();
    }
  });
});
