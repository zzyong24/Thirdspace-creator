import { afterEach, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createDb } from "./db";

vi.setConfig({ testTimeout: 180000, hookTimeout: 180000 });
const folder = fileURLToPath(new URL("../drizzle", import.meta.url));
const migrationTag = "0139_unified_project_intake";
const migrationWhen = 1791043200012;
const time = "2026-10-20T15:00:00.000Z";
const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });

async function rootDir() {
  const root = await mkdtemp(join(tmpdir(), "t1382-intake-migration-"));
  roots.push(root);
  return root;
}
async function ledger(client: PGlite) {
  return (await client.query<{ hash: string; created_at: number | string }>("SELECT hash,created_at FROM drizzle.__drizzle_migrations ORDER BY created_at,id")).rows;
}
async function present(client: PGlite, table: string) {
  return (await client.query<{ present: boolean }>("SELECT to_regclass($1) IS NOT NULL AS present", [`public.${table}`])).rows[0]!.present;
}
async function seedLegacy(client: PGlite) {
  await client.query("INSERT INTO platform_accounts(id,user_id,platform,account_handle,created_at,updated_at) VALUES('account-a','user-a','douyin','迁移测试账号',$1,$1)", [time]);
  await client.query("INSERT INTO account_groups(id,user_id,name,status,version,created_at,updated_at) VALUES('group-account','user-a','有账号测试组','active',1,$1,$1),('group-pure','user-a','纯测试组','active',1,$1,$1)", [time]);
  await client.query("INSERT INTO account_group_memberships(id,user_id,group_id,platform_account_id,version,joined_at) VALUES('member-a','user-a','group-account','account-a',1,$1)", [time]);
  for (const [suffix, accountId, groupId] of [["account", "account-a", "group-account"], ["pure", null, "group-pure"]] as const) {
    const projectId = `original-project-${suffix}`;
    const detail = { contentRadarEvidence: { sourceReferences: [{ intelligenceItemId: `item-${suffix}` }], adaptedDraftSeed: { contentText: "原候选，未采纳" } } };
    await client.query("INSERT INTO projects(id,user_id,account_id,group_id,title,brief,brief_detail,source,status,current_stage,creation_mode,started_at,created_at,updated_at) VALUES($1,'user-a',$2,$3,'原项目','原资料',$4::jsonb,'manual','active','script','guided',$5,$5,$5)", [projectId, accountId, groupId, JSON.stringify(detail), time]);
    await client.query("INSERT INTO content_outputs(id,project_id,group_id,title,content_type,status,created_at,updated_at) VALUES($1,$2,$3,'原作品','video','draft',$4,$4)", [`output-${suffix}`, projectId, groupId, time]);
    await client.query("INSERT INTO artifacts(id,user_id,account_id,group_id,project_id,artifact_type,title,stage,created_at,updated_at) VALUES($1,'user-a',$2,$3,$4,'output_script','原正式稿','script',$5,$5)", [`artifact-${suffix}`, accountId, groupId, projectId, time]);
    await client.query("INSERT INTO artifact_versions(id,artifact_id,version_number,content_text,created_at) VALUES($1,$2,1,'原正式稿正文',$3)", [`version-${suffix}`, `artifact-${suffix}`, time]);
    await client.query("UPDATE artifacts SET current_version_id=$1 WHERE id=$2", [`version-${suffix}`, `artifact-${suffix}`]);
    await client.query("INSERT INTO execution_tasks(id,user_id,account_id,group_id,kind,owner_type,owner_id,status,idempotency_key,payload,checkpoint,lease_owner,fence_token,attempt,created_at,updated_at) VALUES($1,'user-a',$2,$3,'radar_project_upgrade','item',$4,'running',$5,$6::jsonb,$7::jsonb,'original-worker','original-fence',2,$8,$8)", [`parent-${suffix}`, accountId, groupId, `item-${suffix}`, `original-key-${suffix}`, JSON.stringify({ itemId: `item-${suffix}`, positioningVersionId: "original-positioning" }), JSON.stringify({ stage: "creating_project", topicTaskId: `topic-${suffix}`, transformId: `transform-${suffix}` }), time]);
  }
}
async function legacySnapshot(client: PGlite) {
  const result: Record<string, unknown[]> = {};
  for (const table of ["projects", "content_outputs", "artifacts", "artifact_versions", "execution_tasks"]) {
    result[table] = (await client.query(`SELECT * FROM ${table} ORDER BY id`)).rows;
  }
  return result;
}
function expectRetiredSnapshot(actual:Awaited<ReturnType<typeof legacySnapshot>>,before:Awaited<ReturnType<typeof legacySnapshot>>){
 for(const table of ["projects","content_outputs","artifacts","artifact_versions"])expect(actual[table]).toEqual(before[table]);
 expect(actual.execution_tasks).toEqual(before.execution_tasks!.map(value=>({...value as Record<string,unknown>,status:"cancelled",lease_owner:null,lease_expires_at:null,heartbeat_at:null,fence_token:null,last_error_code:"SYSTEM_UPGRADED",last_error_message:"系统已升级，请重新点击升级为项目",updated_at:expect.any(String)})));
}
async function old112() {
  const root = await rootDir();
  const staged = join(root, "old112");
  await cp(folder, staged, { recursive: true });
  const journal = JSON.parse(await readFile(join(staged, "meta/_journal.json"), "utf8"));
  journal.entries = journal.entries.slice(0, 112);
  await writeFile(join(staged, "meta/_journal.json"), JSON.stringify(journal));
  const dataDir = join(root, "db");
  const client = new PGlite(dataDir);
  try {
    await migrate(drizzle(client), { migrationsFolder: staged });
    await seedLegacy(client);
    return { root, dataDir, client };
  } catch (error) { await client.close(); throw error; }
}

type RawReference = {
  id: string; projectId: string; sourceKey: string; sourceKind: string;
  itemId: string | null; snapshotId: string | null; accountId: string | null;
  platform: string | null; externalId: string | null;
};
async function insertRaw(client: PGlite, patch: Partial<RawReference> = {}) {
  const row: RawReference = { id: "raw-a", projectId: "original-project-pure", sourceKey: "source-a", sourceKind: "intelligence_item", itemId: "item-pure", snapshotId: "snapshot-pure", accountId: null, platform: null, externalId: null, ...patch };
  return client.query("INSERT INTO project_source_references(id,project_id,source_key,source_kind,item_id,snapshot_id,account_id,platform,external_id,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10)", [row.id, row.projectId, row.sourceKey, row.sourceKind, row.itemId, row.snapshotId, row.accountId, row.platform, row.externalId, time]);
}
async function insertIntake(client: PGlite, patch: Partial<{ id: string; userId: string; scopeKind: string; scopeId: string | null; source: string; intakeKey: string; projectId: string | null }> = {}) {
  const row = { id: "intake-a", userId: "user-a", scopeKind: "group", scopeId: "group-pure", source: "manual", intakeKey: "stable-action-key", projectId: "original-project-pure", ...patch };
  return client.query("INSERT INTO project_intakes(id,user_id,scope_kind,scope_id,source,intake_key,request_digest,project_id,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,'request-digest',$7,$8,$8)", [row.id, row.userId, row.scopeKind, row.scopeId, row.source, row.intakeKey, row.projectId, time]);
}

it("全新内存库执行新迁移并注册两表，未产生的准备与正文事实为空", async () => {
  const store = await createDb();
  try {
    expect(await present(store.client, "project_source_references")).toBe(true);
    expect(await present(store.client, "project_intakes")).toBe(true);
    expect((await ledger(store.client)).filter(row => Number(row.created_at) === migrationWhen)).toHaveLength(1);
    await seedLegacy(store.client);
    await insertRaw(store.client);
    await insertIntake(store.client);
    expect((await store.client.query("SELECT url,body_available,source_digest,transcript_hash FROM project_source_references")).rows).toEqual([{ url: null, body_available: false, source_digest: null, transcript_hash: null }]);
    expect((await store.client.query("SELECT preparation_task_id FROM project_intakes")).rows).toEqual([{ preparation_task_id: null }]);
    await store.client.query("INSERT INTO execution_tasks(id,user_id,group_id,kind,owner_type,owner_id,idempotency_key,created_at,updated_at) VALUES('new-preparation','user-a','group-pure','project_preparation','project','original-project-pure','new-preparation-key',$1,$1)", [time]);
    expect((await store.client.query("SELECT kind FROM execution_tasks WHERE id='new-preparation'")).rows).toEqual([{ kind: "project_preparation" }]);
  } finally { await store.client.close(); }
});

it("旧112项库真实启动升级与重复启动保留账号和纯组项目、原稿及未记项目ID的旧父", async () => {
  const old = await old112();
  let before: Awaited<ReturnType<typeof legacySnapshot>>;
  let beforeLedger: Awaited<ReturnType<typeof ledger>>;
  try { before = await legacySnapshot(old.client); beforeLedger = await ledger(old.client); } finally { await old.client.close(); }
  const first = await createDb({ dataDir: old.dataDir });
  let afterLedger: Awaited<ReturnType<typeof ledger>>;
  try {
    const upgraded=await legacySnapshot(first.client);
    for(const table of ["projects","content_outputs","artifacts","artifact_versions"])expect(upgraded[table]).toEqual(before![table]);
    expect(upgraded.execution_tasks).toEqual(before!.execution_tasks!.map(value=>({...value as Record<string,unknown>,status:"cancelled",lease_owner:null,lease_expires_at:null,heartbeat_at:null,fence_token:null,last_error_code:"SYSTEM_UPGRADED",last_error_message:"系统已升级，请重新点击升级为项目",updated_at:expect.any(String)})));
    before=upgraded;
    afterLedger = await ledger(first.client);
    expect(afterLedger.slice(0, beforeLedger!.length)).toEqual(beforeLedger!);
    expect(afterLedger).toHaveLength(beforeLedger!.length + 2);
    expect(Number(afterLedger.at(-2)!.created_at)).toBe(migrationWhen);
    expect(Number(afterLedger.at(-1)!.created_at)).toBe(1791043200013);
    expect((await first.client.query("SELECT * FROM project_source_references")).rows).toEqual([]);
    expect((await first.client.query("SELECT * FROM project_intakes")).rows).toEqual([]);
  } finally { await first.client.close(); }
  const second = await createDb({ dataDir: old.dataDir });
  try {
    expect(await legacySnapshot(second.client)).toEqual(before!);
    expect(await ledger(second.client)).toEqual(afterLedger!);
    expect((await second.client.query("SELECT * FROM project_intakes")).rows).toEqual([]);
  } finally { await second.client.close(); }
});

it("原始引用按两族校验必要真实标识，拒绝缺字段、空标识及不存在的项目", async () => {
  const store = await createDb();
  try {
    await seedLegacy(store.client);
    for (const patch of [
      { itemId: null }, { itemId: " " }, { snapshotId: null }, { snapshotId: "" },
      { sourceKind: "invented" }, { sourceKey: " " },
      { sourceKind: "platform_work", itemId: null, snapshotId: null },
      { sourceKind: "platform_work", accountId: "account-a", platform: "douyin", externalId: null },
      { sourceKind: "platform_work", accountId: "account-a", platform: " ", externalId: "external-a" },
      { sourceKind: "platform_work", accountId: " ", platform: "douyin", externalId: "external-a" },
    ]) await expect(insertRaw(store.client, patch)).rejects.toMatchObject({ code: "23514" });
    await expect(insertRaw(store.client, { projectId: "missing-project" })).rejects.toMatchObject({ code: "23503" });
    await insertRaw(store.client);
    await insertRaw(store.client, { id: "raw-platform", sourceKey: "platform-a", sourceKind: "platform_work", itemId: null, snapshotId: null, accountId: "account-a", platform: "douyin", externalId: "external-a" });
    expect((await store.client.query("SELECT id FROM project_source_references ORDER BY id")).rows).toEqual([{ id: "raw-a" }, { id: "raw-platform" }]);
  } finally { await store.client.close(); }
});

it("纯组intake稳定唯一键不依赖NULL账号，身份字段拒绝空值并区分scope", async () => {
  const store = await createDb();
  try {
    await seedLegacy(store.client);
    await insertIntake(store.client);
    await expect(insertIntake(store.client, { id: "second-same-key" })).rejects.toMatchObject({ code: "23505" });
    await expect(insertIntake(store.client, { id: "no-scope", scopeId: null })).rejects.toMatchObject({ code: "23502" });
    await expect(insertIntake(store.client, { id: "no-project", projectId: null })).rejects.toMatchObject({ code: "23502" });
    for (const patch of [{ scopeKind: "account" }, { scopeId: " " }, { intakeKey: "" }, { source: "invented" }]) {
      await expect(insertIntake(store.client, { id: "invalid", ...patch })).rejects.toMatchObject({ code: "23514" });
    }
    await insertIntake(store.client, { id: "legacy-scope", scopeKind: "legacy-account", scopeId: "account-a", projectId: "original-project-account" });
    await insertIntake(store.client, { id: "different-action", intakeKey: "another-action-key" });
    expect((await store.client.query("SELECT count(*)::int AS count FROM project_intakes")).rows).toEqual([{ count: 3 }]);
  } finally { await store.client.close(); }
});

it("原始引用项目键唯一、项目删除级联引用并保留intake原身份回执", async () => {
  const store = await createDb();
  try {
    await seedLegacy(store.client);
    await insertRaw(store.client);
    await insertIntake(store.client);
    await expect(insertRaw(store.client, { id: "duplicate-reference" })).rejects.toMatchObject({ code: "23505" });
    await store.client.query("DELETE FROM projects WHERE id='original-project-pure'");
    expect((await store.client.query("SELECT * FROM project_source_references")).rows).toEqual([]);
    expect((await store.client.query("SELECT project_id FROM project_intakes")).rows).toEqual([{ project_id: "original-project-pure" }]);
  } finally { await store.client.close(); }
});

it("新迁移中途失败整笔回滚，原库与账本保全后可正常继续升级", async () => {
  const originalSql = await readFile(join(folder, `${migrationTag}.sql`), "utf8");
  const old = await old112();
  const failedFolder = join(old.root, "failed-new-migration");
  await cp(folder, failedFolder, { recursive: true });
  await writeFile(join(failedFolder, `${migrationTag}.sql`), `${originalSql}\n--> statement-breakpoint\nSELECT 1 / 0;\n`);
  let before: Awaited<ReturnType<typeof legacySnapshot>>;
  let beforeLedger: Awaited<ReturnType<typeof ledger>>;
  try {
    before = await legacySnapshot(old.client); beforeLedger = await ledger(old.client);
    await expect(migrate(drizzle(old.client), { migrationsFolder: failedFolder })).rejects.toThrow();
    expect(await present(old.client, "project_source_references")).toBe(false);
    expect(await present(old.client, "project_intakes")).toBe(false);
    expect(await legacySnapshot(old.client)).toEqual(before);
    expect(await ledger(old.client)).toEqual(beforeLedger);
  } finally { await old.client.close(); }
  const recovered = await createDb({ dataDir: old.dataDir });
  try {
    expectRetiredSnapshot(await legacySnapshot(recovered.client),before!);
    expect(await present(recovered.client, "project_source_references")).toBe(true);
    expect(await present(recovered.client, "project_intakes")).toBe(true);
    const afterLedger = await ledger(recovered.client);
    expect(afterLedger.slice(0, beforeLedger!.length)).toEqual(beforeLedger!);
    expect(afterLedger.filter(row => Number(row.created_at) === migrationWhen)).toHaveLength(1);
  } finally { await recovered.client.close(); }
});

it.each([false, true])('N-6 从真实旧112库升级后，account=%s 的并发公开ensure找回原ID且保全稿件/outputs', async account => {
  const {createHash} = await import('node:crypto');
  const {ENDPOINTS} = await import('@creatoros/contract');
  const {createProjectIntakeApplication} = await import('./application/projects/project-intake');
  const {createProjectsTransport,createProjectsService,createProjectRepository} = await import('./modules/projects');
  const old = await old112(), suffix = account ? 'account' : 'pure';
  const groupId = `group-${suffix}`, accountId = account ? 'account-a' : null;
  const identity = account ? ['user-a', accountId, `parent-${suffix}`] : ['user-a', 'group', groupId, `parent-${suffix}`];
  const projectId = `project-radar-${createHash('sha256').update(JSON.stringify(identity)).digest('hex').slice(0,32)}`;
  let before: Awaited<ReturnType<typeof legacySnapshot>>;
  try {
    await old.client.query('UPDATE projects SET id=$1 WHERE id=$2', [projectId, `original-project-${suffix}`]);
    await old.client.query('UPDATE content_outputs SET project_id=$1 WHERE project_id=$2', [projectId, `original-project-${suffix}`]);
    await old.client.query('UPDATE artifacts SET project_id=$1 WHERE project_id=$2', [projectId, `original-project-${suffix}`]);
    await old.client.query("INSERT INTO intelligence_sources(id,user_id,group_id,account_id,type,platform,display_name,external_key,created_at,updated_at) VALUES('migration-source','user-a',$1,$2,'rss','web','隔离迁移信源','migration-source',$3,$3)",[groupId,accountId,time]);
    await old.client.query("INSERT INTO intelligence_sync_runs(id,user_id,group_id,account_id,source_id,execution_task_id,trigger,status,created_at,updated_at) VALUES('migration-run','user-a',$1,$2,'migration-source','migration-source-task','manual','succeeded_with_items',$3,$3)",[groupId,accountId,time]);
    await old.client.query("INSERT INTO intelligence_items(id,user_id,group_id,account_id,type,platform,canonical_url,canonical_url_hash,title,captured_at,created_at,updated_at) VALUES($1,'user-a',$2,$3,'article','web','https://example.test/migration','migration-hash','迁移来源',$4,$4,$4)",[`item-${suffix}`,groupId,accountId,time]);
    await old.client.query("INSERT INTO intelligence_source_snapshots(id,user_id,group_id,account_id,source_id,run_id,item_id,captured_at,final_url,content_hash,safe_extract) VALUES('migration-snapshot','user-a',$1,$2,'migration-source','migration-run',$3,$4,'https://example.test/migration','migration-body','原始来源正文')",[groupId,accountId,`item-${suffix}`,time]);
    before = await legacySnapshot(old.client);
  } finally { await old.client.close(); }
  const current = await createDb({dataDir:old.dataDir});
  try {
    let sequence=0;
    const deps={now:()=>time,nextId:(prefix:string)=>`${prefix}-migration-${++sequence}`};
    const repo=createProjectRepository(current.db),intake=createProjectIntakeApplication(current.db,deps);
    const transport=createProjectsTransport(()=>({repo,service:createProjectsService(repo,deps),intake}));
    const context={userId:'user-a',groupId,accountId,requestId:'migration-ensure',source:'user' as const,...(account?{membershipVersion:1}:{})};
    const invoke=()=>transport.request(ENDPOINTS.ensureProject,{params:undefined,query:undefined,body:{source:'radar',itemId:`item-${suffix}`,idempotencyKey:'migration-click'}},context);
    const replies=await Promise.all([invoke(),invoke()]);
    for(const reply of replies){const value=ENDPOINTS.ensureProject.response.parse((reply as {data:unknown}).data);expect(value.project.id).toBe(projectId);expect(value.reused).toBe(true);expect(value.preparationTaskId).toBeNull();}
    expectRetiredSnapshot(await legacySnapshot(current.client),before!);
    expect((await current.client.query('SELECT project_id FROM project_intakes')).rows).toEqual([{project_id:projectId}]);
  } finally { await current.client.close(); }
});

it('fb 已执行0139的库补ISO退役时间与已有尝试结束时间，保全无关行并幂等',async()=>{
 const old=await old112(),staged=join(old.root,'old113');
 await cp(folder,staged,{recursive:true});
 const journal=JSON.parse(await readFile(join(staged,'meta/_journal.json'),'utf8'));journal.entries=journal.entries.slice(0,113);
 await writeFile(join(staged,'meta/_journal.json'),JSON.stringify(journal));
 await migrate(drizzle(old.client),{migrationsFolder:staged});
 const stamp='2026-10-21 13:15:59.947123+08',expected='2026-10-21T05:15:59.947123Z';
 await old.client.query("UPDATE execution_tasks SET updated_at=$1 WHERE id='parent-account'",[stamp]);
 await old.client.query("UPDATE execution_tasks SET updated_at=$1 WHERE id='parent-pure'",[time]);
 const task=(id:string,kind:string,status:string,key:string,user='user-a',owner='item-account')=>old.client.query("INSERT INTO execution_tasks(id,user_id,account_id,group_id,kind,owner_type,owner_id,status,idempotency_key,attempt,last_error_code,last_error_message,created_at,updated_at) VALUES($1,$2,'account-a','group-account',$3,'transform',$4,$5,$6,2,'SYSTEM_UPGRADED','系统已升级，请重新点击升级为项目',$7,$8)",[id,user,kind,owner,status,key,time,stamp]);
 await task('exclusive-cancelled','topic_preview','cancelled','parent-account:preview');
 await task('exclusive-unknown','topic_preview','unknown_result','parent-account:preview-unknown');
 // unknown子有独占键，但另一合法父；不冒成已结束。
 await task('unknown-parent','radar_project_upgrade','cancelled','unknown-parent-key');
 await old.client.query("UPDATE execution_tasks SET idempotency_key='unknown-parent:preview' WHERE id='exclusive-unknown'");
 await task('unrelated','transcribe','cancelled','unrelated');
 await task('wrong-user','topic_preview','cancelled','parent-account:preview','foreign-user');
 for(const [id,column,value] of [['wrong-owner','owner_id','foreign-item'],['wrong-account','account_id','foreign-account'],['wrong-group','group_id','foreign-group']] as const){
  await task(`${id}-parent`,'radar_project_upgrade','cancelled',`${id}-parent-key`);
  await old.client.query('UPDATE execution_tasks SET updated_at=$1 WHERE id=$2',[time,`${id}-parent`]);
  await task(id,'topic_preview','cancelled',`${id}-parent:preview`);
  await old.client.query(`UPDATE execution_tasks SET ${column}=$1 WHERE id=$2`,[value,id]);
 }
 await task('wrong-reason','radar_project_upgrade','cancelled','wrong-reason');
 await old.client.query("UPDATE execution_tasks SET last_error_code='USER_CANCELLED' WHERE id='wrong-reason'");
 await task('already-finished','radar_project_upgrade','cancelled','already-finished');
 for(const id of ['parent-account','parent-pure','exclusive-cancelled','exclusive-unknown','unrelated','wrong-user','wrong-owner','wrong-account','wrong-group','wrong-reason','already-finished']){
  await old.client.query("INSERT INTO observability_attempt_clocks(task_id,attempt,user_id,created_at,started_at,finished_at,result,reported) VALUES($1,2,$2,$3,$3,$4,$5,TRUE)",[id,id==='wrong-user'?'foreign-user':'user-a',time,id==='already-finished'?time:null,id==='already-finished'?'cancelled':null]);
 }
 await old.client.query("INSERT INTO observability_attempt_clocks(task_id,attempt,user_id,created_at,started_at) VALUES('parent-account',1,'user-a',$1,$1)",[time]);
 const before=await legacySnapshot(old.client),beforeLedger=await ledger(old.client);
 const clocks=async(client:PGlite)=>(await client.query('SELECT * FROM observability_attempt_clocks ORDER BY task_id,attempt')).rows;
 const beforeClocks=await clocks(old.client);await old.client.close();
 const current=await createDb({dataDir:old.dataDir});
 let after:Awaited<ReturnType<typeof legacySnapshot>>,afterClocks:Awaited<ReturnType<typeof clocks>>,afterLedger:Awaited<ReturnType<typeof ledger>>;
 try{
  const tasks=(await current.client.query<{id:string;updated_at:string}>('SELECT id,updated_at FROM execution_tasks')).rows;
  for(const id of ['parent-account','exclusive-cancelled','exclusive-unknown','unknown-parent','already-finished'])expect(tasks.find(row=>row.id===id)?.updated_at).toBe(expected);
  expect(tasks.find(row=>row.id==='parent-pure')?.updated_at).toBe(time);
  after=await legacySnapshot(current.client);afterClocks=await clocks(current.client);afterLedger=await ledger(current.client);
  for(const table of ['projects','content_outputs','artifacts','artifact_versions'])expect(after[table]).toEqual(before[table]);
  const targets=new Set(['parent-account','parent-pure','exclusive-cancelled','unknown-parent','already-finished','exclusive-unknown']);
  expect(after.execution_tasks).toEqual(before.execution_tasks!.map(value=>{const row=value as Record<string,unknown>;return targets.has(row.id as string)&&row.id!=='parent-pure'?{...row,updated_at:expected}:row;}));
  expect(afterClocks).toEqual(beforeClocks.map(value=>{const row=value as Record<string,unknown>;return row.attempt===2&&['parent-account','parent-pure','exclusive-cancelled'].includes(row.task_id as string)?{...row,finished_at:row.task_id==='parent-pure'?time:expected,result:'cancelled',kind:row.task_id==='exclusive-cancelled'?'topic_preview':'radar_project_upgrade',reported:false}:row;}));
  expect(afterLedger.slice(0,beforeLedger.length)).toEqual(beforeLedger);expect(afterLedger).toHaveLength(beforeLedger.length+1);expect(Number(afterLedger.at(-1)!.created_at)).toBe(1791043200013);
  await current.client.exec(await readFile(join(folder,'0140_unified_project_intake_retirement_timestamps.sql'),'utf8'));
  expect(await legacySnapshot(current.client)).toEqual(after);expect(await clocks(current.client)).toEqual(afterClocks);expect(await ledger(current.client)).toEqual(afterLedger);
 }finally{await current.client.close();}
 const restarted=await createDb({dataDir:old.dataDir});try{expect(await legacySnapshot(restarted.client)).toEqual(after!);expect(await clocks(restarted.client)).toEqual(afterClocks!);expect(await ledger(restarted.client)).toEqual(afterLedger!);}finally{await restarted.client.close();}
});
