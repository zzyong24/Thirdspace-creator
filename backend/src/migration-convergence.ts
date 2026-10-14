import {PGlite} from '@electric-sql/pglite';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {sql} from 'drizzle-orm';
import type {Db} from './db';
import lineages from './migration-convergence-lineages.json';
import installedLineages from './migration-convergence-installed-lineages.json';

/** SEMANTIC_BOUNDARY_ALLOW: 只识别冻结迁移身份和PostgreSQL物理catalog，不判断内容或猜测归属。 */
export const CONVERGENCE_WHEN=1791043200001;
const WORKBENCH_CONVERGENCE={tag:"0129_workbench_artifact_convergence",when:1791043200002,hash:"e4a8e08ec392d781ba6401d6f6389ec0fcaf4fb18a06aa51945864ce63951113"};
const LEGACY_SOURCE_OWNERSHIP={tag:"0130_legacy_source_ownership",when:1791043200003,hash:"cc25f17ac270d230b82f1697bd20c674931877459cc0a70f667cab3461a3fc70"};
const NATIVE_REPORTS={tag:"0131_platform_native_reports",when:1791043200004,hash:"36a411fb6ee7a77923090fa346ed768365fa548746fa62d4735f561bf0a5e84f"};
const LEGACY_SCHEDULED_MEMBERSHIP={tag:"0132_legacy_scheduled_job_membership",when:1791043200005,hash:"f45db49f8a826b15511cf27c23957fdf7d6d04322975ae13b34151d10a106eb6"};
const ASSISTANT_EXECUTION_ENGINE={tag:"0133_assistant_execution_engine",when:1791043200006,hash:"0f51f97932dd96244d1402eaebcc8e5716b0c85eff848afac3a4111884238af6"};
const MODEL_ROUTING={tag:"0135_model_routing",when:1791043200008,hash:"6fae4e865bf2fbabaf16127644e0abb6b1179bc3fc246b563a3a3c5c663233e8"};
type QueryDb=Pick<Db,'execute'>;
type Identity={hash:string;when:number};
type Catalog=Record<'columns'|'constraints'|'indexes'|'functions'|'triggers'|'sequences',Record<string,unknown>[]>;
export const catalogQueries={
 columns:"SELECT table_name,column_name,udt_name,is_nullable,column_default FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,column_name",
 constraints:"SELECT t.relname AS table_name,c.conname AS name,c.contype AS type,pg_get_constraintdef(c.oid,true) AS definition,c.convalidated AS validated FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname='public' ORDER BY t.relname,c.conname",
 indexes:"SELECT t.relname AS table_name,i.relname AS name,pg_get_indexdef(i.oid) AS definition,x.indisvalid AS valid FROM pg_index x JOIN pg_class t ON t.oid=x.indrelid JOIN pg_class i ON i.oid=x.indexrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname='public' AND NOT x.indisprimary AND NOT EXISTS(SELECT 1 FROM pg_constraint c WHERE c.conindid=i.oid AND c.conrelid=x.indrelid AND c.contype IN ('p','u','x')) ORDER BY t.relname,i.relname",
 functions:"SELECT p.proname AS name,pg_get_functiondef(p.oid) AS definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' ORDER BY p.proname",
 triggers:"SELECT t.relname AS table_name,g.tgname AS name,pg_get_triggerdef(g.oid,true) AS definition FROM pg_trigger g JOIN pg_class t ON t.oid=g.tgrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname='public' AND NOT g.tgisinternal ORDER BY t.relname,g.tgname",
 sequences:"SELECT s.sequencename AS name,s.data_type,s.start_value::text,s.min_value::text,s.max_value::text,s.increment_by::text,s.cycle,s.cache_size::text,t.relname AS owner_table,a.attname AS owner_column FROM pg_sequences s JOIN pg_class seq ON seq.relname=s.sequencename JOIN pg_namespace ns ON ns.oid=seq.relnamespace AND ns.nspname=s.schemaname LEFT JOIN pg_depend d ON d.objid=seq.oid AND d.classid='pg_class'::regclass AND d.refclassid='pg_class'::regclass AND d.deptype IN ('a','i') LEFT JOIN pg_class t ON t.oid=d.refobjid LEFT JOIN pg_attribute a ON a.attrelid=t.oid AND a.attnum=d.refobjsubid WHERE s.schemaname='public' ORDER BY s.sequencename",
};
const id=(i:Identity)=>`${i.hash}:${i.when}`;
const fail=(detail:string):never=>{throw new Error(`CREATIVE_CANVAS_MIGRATION_LINEAGE_UNKNOWN: ${detail}`);};
const incompatible=(detail:string):never=>{throw new Error(`CREATIVE_CANVAS_MIGRATION_SCHEMA_INCOMPATIBLE: ${detail}`);};
const sha=(s:string)=>createHash('sha256').update(s).digest('hex');
const allLineages={...lineages,...installedLineages};
const sourceEntries=Object.values(lineages).flatMap(l=>l.entries);
const canonicalEntries=new Map(sourceEntries.map(i=>[id(i),i]));
const installedEntries=Object.values(installedLineages).flatMap(l=>l.entries).filter(i=>!canonicalEntries.has(id(i)));
const entries=new Map([...sourceEntries,...installedEntries,WORKBENCH_CONVERGENCE,LEGACY_SOURCE_OWNERSHIP,NATIVE_REPORTS,LEGACY_SCHEDULED_MEMBERSHIP,ASSISTANT_EXECUTION_ENGINE,MODEL_ROUTING].map(i=>[id(i),i]));
const cache=new Map<string,Promise<Catalog>>();
const repairable=new Set(['reporting_consents','reporting_outbox','reporting_consent_changes','creative_canvases','canvas_generation_links','canvas_agent_proposals']);
async function rows(db:QueryDb,query:string){return(await db.execute(sql.raw(query))).rows as Record<string,unknown>[];}
export async function readCatalog(db:QueryDb):Promise<Catalog>{const result={} as Catalog;for(const [key,query] of Object.entries(catalogQueries) as Array<[keyof Catalog,string]>)result[key]=await rows(db,query);return result;}
async function readLedger(db:QueryDb):Promise<Identity[]>{
 if(!(await rows(db,"SELECT to_regclass('drizzle.__drizzle_migrations') IS NOT NULL AS present"))[0]?.present)return[];
 const cols=await rows(db,"SELECT column_name,udt_name FROM information_schema.columns WHERE table_schema='drizzle' AND table_name='__drizzle_migrations'");
 for(const [name,type] of [['id','int4'],['hash','text'],['created_at','int8']])if(!cols.some(r=>r.column_name===name&&r.udt_name===type))fail('账本结构未知');
 return(await rows(db,'SELECT hash,created_at FROM drizzle.__drizzle_migrations ORDER BY created_at,id')).map(r=>{const when=Number(r.created_at);if(typeof r.hash!=='string'||!Number.isSafeInteger(when)||when<0)fail('账本身份类型无效');return{hash:r.hash as string,when};});
}
function sourceSQL(folder:string,item:Identity){for(const known of [WORKBENCH_CONVERGENCE,LEGACY_SOURCE_OWNERSHIP,NATIVE_REPORTS,LEGACY_SCHEDULED_MEMBERSHIP,ASSISTANT_EXECUTION_ENGINE,MODEL_ROUTING])if(id(item)===id(known)){const raw=readFileSync(join(folder,known.tag+".sql"),"utf8");if(sha(raw)!==known.hash)fail(`${known.tag} SQL校验失败`);return raw;}for(const [name,lineage]of Object.entries(allLineages)){const entry=lineage.entries.find(e=>id(e)===id(item));if(entry){const raw=readFileSync(join(folder,'lineages',name,entry.tag+'.sql'),'utf8');if(sha(raw)!==item.hash)fail(`归档SQL校验失败 ${name}/${entry.tag}`);return raw;}}return fail('没有冻结SQL来源');}
const validatedFolders=new Set<string>();
function validateSources(folder:string){
 if(validatedFolders.has(folder))return;
 for(const [name,lineage]of Object.entries(allLineages)){
  const journal=readFileSync(join(folder,'lineages',name,'meta','_journal.json'),'utf8');if(sha(journal)!==lineage.journalSha256)fail(`冻结journal校验失败 ${name}`);
  for(const entry of lineage.entries){const content=readFileSync(join(folder,'lineages',name,entry.tag+'.sql'),'utf8');if(sha(content)!==entry.hash)fail(`冻结SQL校验失败 ${name}/${entry.tag}`);}
 }
 const normal=JSON.parse(readFileSync(join(folder,'meta','_journal.json'),'utf8'));const common=lineages.root.entries.slice(0,101);
 const tail=[{idx:101,tag:'0101_workbench_artifact_lineage',when:1789963200000,hash:WORKBENCH_CONVERGENCE.hash},{idx:102,tag:'0128_workspace_convergence',when:CONVERGENCE_WHEN,hash:'60cac883f02fa7fcd83051264bd6a63ec49132369c7c983b36e34e979a2f7713'},{idx:103,...WORKBENCH_CONVERGENCE},{idx:104,...LEGACY_SOURCE_OWNERSHIP},{idx:105,...NATIVE_REPORTS},{idx:106,...LEGACY_SCHEDULED_MEMBERSHIP},{idx:107,...ASSISTANT_EXECUTION_ENGINE},{idx:108,...MODEL_ROUTING}];
 if(normal.entries.length!==109||tail.some(expected=>{const actual=normal.entries[expected.idx];return !actual||actual.idx!==expected.idx||actual.tag!==expected.tag||actual.when!==expected.when||(expected.hash&&sha(readFileSync(join(folder,expected.tag+'.sql'),'utf8'))!==expected.hash);}))fail('当前主journal不符合共同前缀+真实收敛及固定工作台/来源闭包');
 for(let i=0;i<common.length;i++){const entry=normal.entries[i];if(entry.tag!==common[i]!.tag||entry.when!==common[i]!.when||sha(readFileSync(join(folder,entry.tag+'.sql'),'utf8'))!==common[i]!.hash)fail('共同旧迁移tag/SQL/时间漂移');}
 validatedFolders.add(folder);
}
function convergenceSQL(folder:string){return readFileSync(join(folder,'0128_workspace_convergence.sql'),'utf8');}
function convergenceIdentity(folder:string){return{hash:sha(convergenceSQL(folder)),when:CONVERGENCE_WHEN};}
function assertKnownPrefixes(history:Identity[],folder:string){
 const newIdentity=convergenceIdentity(folder),seen=new Set(history.map(id));
 for(const item of history)if(!entries.has(id(item))&&id(item)!==id(newIdentity))fail('未知hash/时间或未来迁移，原库保留');
 if(seen.has(id(LEGACY_SOURCE_OWNERSHIP))&&(!seen.has(id(newIdentity))||!seen.has(id(WORKBENCH_CONVERGENCE))))fail('0130来源归属修复缺真实0128/0129前置回执');
 if(seen.has(id(NATIVE_REPORTS))&&(!seen.has(id(newIdentity))||!seen.has(id(WORKBENCH_CONVERGENCE))||!seen.has(id(LEGACY_SOURCE_OWNERSHIP))))fail('0131微信报表缺真实0128/0129/0130前置回执');
 if(seen.has(id(LEGACY_SCHEDULED_MEMBERSHIP))&&!seen.has(id(NATIVE_REPORTS)))fail('0132旧计划归属版本修复缺真实0131前置回执');
 if(seen.has(id(ASSISTANT_EXECUTION_ENGINE))&&!seen.has(id(LEGACY_SCHEDULED_MEMBERSHIP)))fail('0133引擎偏好缺真实0132前置回执');
 if(seen.has(id(MODEL_ROUTING))&&!seen.has(id(ASSISTANT_EXECUTION_ENGINE)))fail('0135模型来源偏好缺真实0133前置回执');
 const common=lineages.root.entries.slice(0,101);let commonCount=0;for(const item of common){if(seen.has(id(item)))commonCount++;else break;}
 for(const item of common.slice(commonCount))if(seen.has(id(item)))fail('共同历史不是完整前缀');
 if(history.some(i=>!common.some(c=>id(c)===id(i)))&&commonCount!==101)fail('分支历史缺少共同0000–0100前缀');
 for(const lineage of Object.values(lineages)){let gap=false;for(const item of lineage.entries.slice(101)){if(seen.has(id(item))){if(gap)fail('已知分支历史不是完整前缀');}else gap=true;}}
 // 补充来源保留完整真实journal；只检查相对于原三源新增的真实顺序，不按数组位置假定共同前缀长度。
 for(const lineage of Object.values(installedLineages)){let gap=false;for(const item of lineage.entries.filter(e=>!canonicalEntries.has(id(e)))){if(seen.has(id(item))){if(gap)fail('已知补充历史不是完整前缀');}else gap=true;}}
 return seen.has(id(newIdentity));
}
function normalize(c:Catalog){const result={} as Catalog;for(const [key,values]of Object.entries(c) as Array<[keyof Catalog,Record<string,unknown>[]]>)result[key]=values.map(({ordinal_position,...r})=>r).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));return result;}
function expectedCatalog(history:Identity[],folder:string,converged:boolean){
 // 已执行的补充身份才参与该库的参考catalog；fresh不启用历史keyring等协议。缓存摘要绑定实际subset。
 const identities=converged?Array.from(new Map([...canonicalEntries.values(),...history.filter(i=>entries.has(id(i))&&!canonicalEntries.has(id(i)))].map(i=>[id(i),{hash:i.hash,when:i.when}])).values()):Array.from(new Map(history.filter(i=>entries.has(id(i))).map(i=>[id(i),i])).values());
 const key=sha(JSON.stringify(identities.map(id).sort())+String(converged)+convergenceIdentity(folder).hash+LEGACY_SOURCE_OWNERSHIP.hash);
 let expected=cache.get(key);if(!expected){expected=(async()=>{// 只在全新隔离内存参考库执行原SQL；绝不在用户原库重放旧分组INSERT。
 const c=new PGlite();try{
  for(const item of identities.filter(i=>id(i)!==id(LEGACY_SOURCE_OWNERSHIP)&&id(i)!==id(NATIVE_REPORTS)&&id(i)!==id(LEGACY_SCHEDULED_MEMBERSHIP)&&id(i)!==id(ASSISTANT_EXECUTION_ENGINE)&&id(i)!==id(MODEL_ROUTING)).sort((a,b)=>a.when-b.when))await c.exec(sourceSQL(folder,item));
  if(converged)await c.exec(`BEGIN;\n${convergenceSQL(folder)}\nCOMMIT;`);
  for(const tail of [LEGACY_SOURCE_OWNERSHIP,NATIVE_REPORTS,LEGACY_SCHEDULED_MEMBERSHIP,ASSISTANT_EXECUTION_ENGINE,MODEL_ROUTING])if(identities.some(i=>id(i)===id(tail)))await c.exec(sourceSQL(folder,tail));
  const cat={} as Catalog;for(const [key,query]of Object.entries(catalogQueries) as Array<[keyof Catalog,string]>)cat[key]=(await c.query<Record<string,unknown>>(query)).rows;return normalize(cat);
 }finally{await c.close();}})();cache.set(key,expected);}return expected;
}
function assertCatalog(actual:Catalog,expected:Catalog,allowRepair:boolean){
 const actualTables=new Set(actual.columns.map(r=>r.table_name));const expectedTables=new Set(expected.columns.map(r=>r.table_name));
 for(const t of expectedTables)if(!actualTables.has(t)&&!(allowRepair&&repairable.has(String(t))))incompatible(`缺少已记账表 ${String(t)}`);
 const missing=new Set([...expectedTables].filter(t=>!actualTables.has(t)));
 for(const [kind,wanted]of Object.entries(expected) as Array<[keyof Catalog,Record<string,unknown>[]]>){
  const checked=wanted.filter(r=>!missing.has(r.table_name));
  for(const row of checked){const matches=actual[kind].filter(r=>r.table_name===row.table_name&&r.name===row.name&&(kind!=='columns'||r.column_name===row.column_name));if(!matches.some(r=>JSON.stringify(r)===JSON.stringify(row)))incompatible(`${kind}不兼容 ${String(row.table_name??'public')}.${String(row.name??row.column_name)}`);}
  // 同一已知表的额外列/约束/索引/触发器会改变契约，拒绝；独立无关用户表保留。
  for(const row of actual[kind])if(expectedTables.has(row.table_name)&&!wanted.some(r=>JSON.stringify(r)===JSON.stringify(row)))incompatible(`未知${kind} ${String(row.table_name)}.${String(row.name??row.column_name)}`);
  // 无表归属的函数与序列：同名必须精确一致，额外独立对象不删除。
 }
}
export async function inspectMigrationConvergence(db:QueryDb,folder:string){
 validateSources(folder);
 const history=await readLedger(db),converged=assertKnownPrefixes(history,folder),actual=normalize(await readCatalog(db));
 if(!history.length){if(actual.columns.length)fail('已有物理表但没有可核验历史');return{history,converged:false,needsUpgrade:true};}
 const expected=await expectedCatalog(history,folder,converged);assertCatalog(actual,expected,true);
 const needsRepair=[...repairable].some(t=>expected.columns.some(r=>r.table_name===t)&&!actual.columns.some(r=>r.table_name===t));
 return{history,converged,needsUpgrade:!converged||needsRepair};
}
/** migrate之后只认可新迁移真实执行的回执，并核全量结构；不伪造旧125回执。 */
export async function assertMigrationConverged(db:QueryDb,folder:string){const history=await readLedger(db);assertKnownPrefixes(history,folder);if(!history.some(i=>id(i)===id(convergenceIdentity(folder))))fail('收敛迁移没有真实新版本回执');if(!history.some(i=>id(i)===id(LEGACY_SOURCE_OWNERSHIP)))fail('来源归属修复没有真实0130回执');if(!history.some(i=>id(i)===id(NATIVE_REPORTS)))fail('微信报表没有真实0131回执');if(!history.some(i=>id(i)===id(LEGACY_SCHEDULED_MEMBERSHIP)))fail('旧计划归属版本修复没有真实0132回执');if(!history.some(i=>id(i)===id(ASSISTANT_EXECUTION_ENGINE)))fail('执行引擎偏好没有真实0133回执');if(!history.some(i=>id(i)===id(MODEL_ROUTING)))fail('模型来源偏好没有真实0135回执');assertCatalog(normalize(await readCatalog(db)),await expectedCatalog(history,folder,true),false);}
/** 有新回执却缺六张可恢复表时，在事务内执行同一版本DDL并保留真实repair执行收据。 */
export async function repairConvergenceSchema(db:Db,folder:string){const status=await inspectMigrationConvergence(db,folder);if(!status.converged||!status.needsUpgrade)return;await db.transaction(async tx=>{
 for(const statement of convergenceSQL(folder).split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean))await tx.execute(sql.raw(statement));
 const receipt=convergenceIdentity(folder);await tx.execute(sql`INSERT INTO drizzle.__drizzle_migrations(hash,created_at) VALUES(${receipt.hash},${receipt.when})`);
 });}
