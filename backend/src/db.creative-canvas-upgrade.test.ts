import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { createDb } from "./db";

const directories: string[] = [];

afterEach(async () => {
  for (const directory of directories.splice(0)) {
    await rm(directory, { recursive: true, force: true });
  }
});

describe("旧装机画布表升级兜底", () => {
  it("journal 已记录迁移而画布表缺失时恢复三张表，保留旧数据且重启幂等", async () => {
    const root = await mkdtemp(join(tmpdir(), "creatoros-canvas-upgrade-"));
    directories.push(root);
    const dataDir = join(root, "db");
    const first = await createDb({ dataDir });
    try {
      await first.db.execute(sql.raw("CREATE TABLE canvas_upgrade_probe (value text NOT NULL)"));
      await first.db.execute(sql.raw("INSERT INTO canvas_upgrade_probe (value) VALUES ('preserved')"));
      await first.db.execute(sql.raw("DROP TABLE canvas_agent_proposals"));
      await first.db.execute(sql.raw("DROP TABLE canvas_generation_links"));
      await first.db.execute(sql.raw("DROP TABLE creative_canvases"));
    } finally {
      await first.client.close();
    }

    for (let attempt = 0; attempt < 2; attempt++) {
      const reopened = await createDb({ dataDir });
      try {
        const tables = await reopened.db.execute(sql.raw(
          "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('creative_canvases', 'canvas_generation_links', 'canvas_agent_proposals') ORDER BY table_name",
        ));
        expect(tables.rows.map((row) => row.table_name)).toEqual([
          "canvas_agent_proposals",
          "canvas_generation_links",
          "creative_canvases",
        ]);
        const marker = await reopened.db.execute(sql.raw("SELECT value FROM canvas_upgrade_probe"));
        expect(marker.rows[0]?.value).toBe("preserved");
      } finally {
        await reopened.client.close();
      }
    }
  }, 120_000);
});
