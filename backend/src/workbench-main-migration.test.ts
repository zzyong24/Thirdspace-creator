import { afterEach, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { mkdtemp, mkdir, readFile, writeFile, copyFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createDb } from "./db";
import { readCatalog } from "./migration-convergence";

vi.setConfig({ testTimeout: 180000, hookTimeout: 180000 });
const folder = fileURLToPath(new URL("../drizzle", import.meta.url));
const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
const tables = ["workbench_artifact_lineages", "workbench_artifact_lineage_versions"];
async function newRoot() { const root = await mkdtemp(join(tmpdir(), "t1080-workbench-migration-")); roots.push(root); return root; }
async function ledger(client: PGlite) { return (await client.query<{hash:string;created_at:string|number}>("SELECT hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at,id")).rows; }
async function history(client: PGlite) {
  return Promise.all(tables.map(async table => (await client.query(`SELECT * FROM ${table} ORDER BY id`)).rows));
}
function artifactCatalog(catalog: Awaited<ReturnType<typeof readCatalog>>) {
  return Object.fromEntries(Object.entries(catalog).map(([kind, rows]) => [kind, rows.filter(row => tables.includes(String(row.table_name)))]));
}
async function seedOld(client: PGlite, hasArtifacts: boolean) {
  const time = "2026-10-01T00:00:00Z";
  await client.query("INSERT INTO ai_conversations(id,user_id,account_id,title,created_at,updated_at) VALUES('c','u','a','原对话',$1,$1)", [time]);
  await client.query("INSERT INTO execution_tasks(id,user_id,account_id,kind,owner_type,owner_id,idempotency_key,created_at,updated_at) VALUES('t','u','a','chat.run','ai_conversation','c','original-task-key',$1,$1)", [time]);
  await client.query("INSERT INTO execution_calls(id,execution_task_id,sequence,operation_key,kind,input_digest,status,reserved_tokens,created_at,updated_at) VALUES('op','t',1,'original-operation','tool','original-input','succeeded',0,$1,$1)", [time]);
  if (!hasArtifacts) return;
  await client.query("INSERT INTO workbench_artifact_lineages(id,user_id,account_id,conversation_id,artifact_id,current_version,last_operation_id,created_at,updated_at) VALUES('l','u','a','c','artifact-original',1,'op',$1,$1)", [time]);
  await client.query("INSERT INTO workbench_artifact_lineage_versions(id,lineage_id,artifact_id,version,task_id,operation_id,request_digest,metadata,source,html_resources,created_at) VALUES('v','l','artifact-original',1,'t','op','original-request',$1::jsonb,$2::jsonb,$3::jsonb,$4)", [JSON.stringify({ title: "原产物" }), JSON.stringify({ text: "原文\n保留空值", optional: null }), JSON.stringify([]), time]);
}
async function oldDb(root: string, kind: "client128" | "main101") {
  const staging = join(root, "old-migrations"); await mkdir(join(staging, "meta"), { recursive: true });
  const journal = JSON.parse(await readFile(join(folder, "meta/_journal.json"), "utf8"));
  journal.entries = journal.entries.slice(0, 101);
  journal.entries.push({ idx: 101, version: "7", when: kind === "client128" ? 1791043200001 : 1789963200000, tag: kind === "client128" ? "0128_workspace_convergence" : "0101_workbench_artifact_lineage", breakpoints: true });
  await writeFile(join(staging, "meta/_journal.json"), JSON.stringify(journal));
  for (const entry of journal.entries) await copyFile(join(folder, entry.tag + ".sql"), join(staging, entry.tag + ".sql"));
  const client = new PGlite(join(root, "db"));
  try { await migrate(drizzle(client), { migrationsFolder: kind === "main101" ? join(folder, "lineages/installed-workbench") : staging }); await seedOld(client, kind === "main101"); return { ledger: await ledger(client), artifacts: kind === "main101" ? await history(client) : undefined }; }
  finally { await client.close(); }
}

let expectedArtifactCatalog: ReturnType<typeof artifactCatalog> | undefined;
it.each(["fresh", "client128", "main101"] as const)("公开 createDb %s 双启保留历史并收敛两表四索引", async kind => {
  const root = await newRoot();
  const before = kind === "fresh" ? undefined : await oldDb(root, kind);
  const first = await createDb({ dataDir: join(root, "db") });
  let after: Awaited<ReturnType<typeof history>>;
  let afterLedger: Awaited<ReturnType<typeof ledger>>;
  try {
    const catalog = artifactCatalog(await readCatalog(first.db));
    expect(catalog.columns).toHaveLength(31);
    expect(catalog.indexes).toHaveLength(4);
    if (!expectedArtifactCatalog) expectedArtifactCatalog = catalog; else expect(catalog).toEqual(expectedArtifactCatalog);
    expect(catalog.columns).toContainEqual(expect.objectContaining({ table_name: tables[0], column_name: "account_id", is_nullable: "NO" }));
    after = await history(first.client); afterLedger = await ledger(first.client);
    if (before) for (const row of before.ledger) expect(afterLedger).toContainEqual(row);
    if (before?.artifacts) expect(after).toEqual(before.artifacts);
    else expect(after).toEqual([[], []]);
    expect(afterLedger.filter(row => Number(row.created_at) === 1791043200002)).toHaveLength(1);
    if (kind === "client128") expect(afterLedger.some(row => Number(row.created_at) === 1789963200000)).toBe(false);
  } finally { await first.client.close(); }
  const second = await createDb({ dataDir: join(root, "db") });
  try { expect(await history(second.client)).toEqual(after!); expect(await ledger(second.client)).toEqual(afterLedger!); expect(artifactCatalog(await readCatalog(second.db))).toEqual(expectedArtifactCatalog); }
  finally { await second.client.close(); }
});

it("未知未来回执仍拒绝且不重建原库", async () => {
  const root = await newRoot(), dataDir = join(root, "db");
  const first = await createDb({ dataDir });
  try { await first.client.query("INSERT INTO drizzle.__drizzle_migrations(hash,created_at) VALUES('untrusted-future',1791043209999)"); }
  finally { await first.client.close(); }
  await expect(createDb({ dataDir })).rejects.toThrow("CREATIVE_CANVAS_MIGRATION_LINEAGE_UNKNOWN");
  const original = new PGlite(dataDir);
  try { expect((await ledger(original)).some(row => row.hash === "untrusted-future")).toBe(true); }
  finally { await original.close(); }
});
