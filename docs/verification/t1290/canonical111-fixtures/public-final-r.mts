import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {PGlite} from '@electric-sql/pglite';
import {drizzle as pgliteDb} from 'drizzle-orm/pglite';
import {drizzle as postgresDb} from 'drizzle-orm/node-postgres';
import {migrate as migratePglite} from 'drizzle-orm/pglite/migrator';
import {migrate as migratePg} from 'drizzle-orm/node-postgres/migrator';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const D=process.env.T1278_PREFLIGHT_DOC_ROOT!;assert(D.endsWith('/canonical111-fixtures'));
const binding=JSON.parse(await readFile(join(D,'RUN_BINDING.json'),'utf8'));const P=binding.sourceRoot;const F=binding.frozenFixtureRoot;assert(P===binding.requiredRSourceRoot);
for(const [relative,expected]of Object.entries(binding.sourceSha256))assert.equal(createHash('sha256').update(await readFile(join(P,relative))).digest('hex'),expected,'final R source changed:'+relative);
assert.equal(binding.status,'FROZEN_FINAL_R_SOURCE');
const {createDb,createRuntimeDb}=await import(pathToFileURL(join(P,'backend/src/db.ts')).href);
const {catalogQueries}=await import(pathToFileURL(join(P,'backend/src/migration-convergence.ts')).href);
const {OwnedPostgresPool,requiredOwnedPostgresUrl,assertOwnedPostgresUrl}=await import(pathToFileURL(join(P,'backend/src/test-fixtures/owned-postgres.ts')).href);
const engine=process.env.T1278_PREFLIGHT_DRIVER??'pglite',red=process.env.T1278_PREFLIGHT_BASELINE_RED==='1';
const output=join(D,process.env.T1278_PREFLIGHT_RESULT_NAME??`${engine}-public-result.json`);
const sql=await readFile(join(P,'backend/drizzle/0137_observability_routing_convergence.sql'),'utf8');
const src=await readFile(join(P,'backend/src/migration-convergence.ts'));const hash=(x:unknown)=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const records:any[]=[];let failed=false;
const cases=red?[{name:'old-candidate-w110-bad-column',old:'W110',fault:'column'}]:[
 {name:'fresh',old:null},{name:'main109',old:'Main109'},{name:'w110',old:'W110'},{name:'w110-compatible-partial-table',old:'W110',validPartial:true},
 {name:'w110-bad-column',old:'W110',fault:'column'},{name:'w110-missing-column',old:'W110',fault:'missing-column'},
 {name:'w110-bad-constraint',old:'W110',fault:'constraint'},{name:'w110-index-wrong-table',old:'W110',fault:'index-other-table'},
 {name:'w110-index-wrong-definition',old:'W110',fault:'index-definition'},{name:'w110-view-collision',old:'W110',fault:'view'},
 {name:'w110-type-collision',old:'W110',fault:'type'},{name:'w111-recorded-bridge-missing-table',old:'W110',fault:'recorded-table-missing'},
 {name:'w110-unknown-hash',old:'W110',fault:'unknown-hash'},{name:'w110-wrong-when',old:'W110',fault:'wrong-when'},
 {name:'w110-broken-prefix',old:'W110',fault:'broken-prefix'}];
if(engine==='postgres'&&!red)cases.push({name:'fresh-concurrent',old:null,concurrent:true} as any,{name:'main109-concurrent',old:'Main109',concurrent:true} as any,{name:'w110-concurrent',old:'W110',concurrent:true} as any);
let management:any=null;
if(engine==='postgres')management=new OwnedPostgresPool({connectionString:requiredOwnedPostgresUrl()});
async function snapshot(client:any){
 const query=async(q:string)=>(await client.query(q)).rows;
 const has=(await query("SELECT to_regclass('drizzle.__drizzle_migrations') IS NOT NULL AS present"))[0].present;
 const ledger=has?await query('SELECT id,hash,created_at::text AS created_at FROM drizzle.__drizzle_migrations ORDER BY id'):[];
 const catalog:any={};for(const [kind,q]of Object.entries(catalogQueries))catalog[kind]=await query(q as string);
 catalog.relations=await query("SELECT c.relname,c.relkind,c.relpersistence,pg_get_indexdef(c.oid) AS definition FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' ORDER BY c.relname");
 catalog.types=await query("SELECT t.typname,t.typtype,c.relname FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace LEFT JOIN pg_class c ON c.oid=t.typrelid WHERE n.nspname='public' ORDER BY t.typname");
 const witness=(await query("SELECT to_regclass('public.t1278pf_witness') IS NOT NULL AS present"))[0].present;
 const app=witness?await query('SELECT id,payload::text AS payload FROM t1278pf_witness ORDER BY id'):[];
 return {ledger,catalog,app};
}
try{
 for(let index=0;index<cases.length;index++){
  const c=cases[index] as any;const row:any={case:c.name,driver:engine,sourceSha256:createHash('sha256').update(src).digest('hex')};records.push(row);
  let client:any=null,publicStore:any=null,name:string|undefined,url:string|undefined;const dir=join(D,'owned-pglite-data',`${engine}-${red?'red':'revised'}-${process.env.T1278_PREFLIGHT_ATTEMPT??'primary'}-${index}`);
  try{
   if(engine==='postgres'){
    name=`t1278pf_${process.env.CREATOROS_OWNED_PG_NONCE!.slice(0,8)}_${red?'red':'green'}_${index}`;
    await management.query(`CREATE DATABASE "${name}"`);const u=new URL(requiredOwnedPostgresUrl());u.pathname='/'+name;url=u.toString();assertOwnedPostgresUrl(url);
    client=new OwnedPostgresPool({connectionString:url});
   }else{await mkdir(dir,{recursive:true});client=new PGlite(dir);}
   const exec=async(q:string)=>engine==='postgres'?client.query(q):client.exec(q);
   const seed=async(folder:string)=>engine==='postgres'?migratePg(postgresDb(client),{migrationsFolder:folder}):migratePglite(pgliteDb(client),{migrationsFolder:folder});
   if(c.old)await seed(join(F,'old-'+c.old));
   if(c.old){
    await exec("CREATE TABLE t1278pf_witness(id TEXT PRIMARY KEY,payload JSONB NOT NULL);INSERT INTO t1278pf_witness VALUES('original','{\"text\":\"原内容\\r\\n不改\",\"model\":null,\"amount\":0}');");
    if(c.validPartial)await exec(sql.split('--> statement-breakpoint')[0]);
    if(c.fault==='column')await exec('CREATE TABLE observability_installation(id INTEGER PRIMARY KEY,payload JSONB)');
    if(c.fault==='missing-column')await exec("CREATE TABLE observability_installation(id TEXT PRIMARY KEY CHECK(id='installation'),installation_alias TEXT NOT NULL)");
    if(c.fault==='constraint'){await exec(sql);await exec("ALTER TABLE observability_installation DROP CONSTRAINT observability_installation_id_check;ALTER TABLE observability_installation ADD CONSTRAINT observability_installation_id_check CHECK(id<>'blocked')");}
    if(c.fault==='index-other-table')await exec('CREATE INDEX observability_events_pending ON t1278pf_witness(id)');
    if(c.fault==='index-definition'){await exec(sql);await exec('DROP INDEX observability_events_pending;CREATE INDEX observability_events_pending ON observability_events(kind)');}
    if(c.fault==='view')await exec('CREATE VIEW observability_installation AS SELECT 1::integer AS id');
    if(c.fault==='type')await exec('CREATE TYPE observability_installation AS (id INTEGER)');
    if(c.fault==='recorded-table-missing'){await seed(join(P,'backend/drizzle'));await exec('DROP TABLE observability_installation');}
    if(c.fault==='unknown-hash')await exec("INSERT INTO drizzle.__drizzle_migrations(hash,created_at) VALUES(repeat('0',64),1791043200300)");
    if(c.fault==='wrong-when')await exec('UPDATE drizzle.__drizzle_migrations SET created_at=1791043200222 WHERE created_at=1791043200009');
    if(c.fault==='broken-prefix')await exec('DELETE FROM drizzle.__drizzle_migrations WHERE created_at=1791043200008');
   }
   const before=await snapshot(client);row.before={ledgerCount:before.ledger.length,ledgerSha256:hash(before.ledger),catalogSha256:hash(before.catalog),appSha256:hash(before.app)};
   if(engine==='postgres')await client.end();else await client.close();client=null;
   let error:any=null;
   try{
    if(c.concurrent){
     // 真实同URL两次公共createRuntimeDb；各自dispose，不把helper同时调用当并发证据。
     const both=await Promise.allSettled([createRuntimeDb({connectionString:url}),createRuntimeDb({connectionString:url})]);
     for(const opened of both)if(opened.status==='fulfilled')await opened.value.pool.end();
     const failed=both.find(opened=>opened.status==='rejected');
     if(failed?.status==='rejected')throw failed.reason;
     row.concurrentPublicOpeners=2;row.bothPublicOpenersSucceeded=true;
    }else publicStore=engine==='postgres'?await createRuntimeDb({connectionString:url}):await createDb({dataDir:dir});
   }catch(e){error=e;}
   if(publicStore){if(engine==='postgres')await publicStore.pool.end();else await publicStore.client.close();publicStore=null;}
   client=engine==='postgres'?new OwnedPostgresPool({connectionString:url}):new PGlite(dir);
   const after=await snapshot(client);row.after={ledgerCount:after.ledger.length,ledgerSha256:hash(after.ledger),catalogSha256:hash(after.catalog),appSha256:hash(after.app)};row.actualError=error instanceof Error?error.message:null;
   if(c.fault){
    assert(error,'public factory must reject original fault');row.ledgerUnchanged=hash(before.ledger)===hash(after.ledger);row.catalogUnchanged=hash(before.catalog)===hash(after.catalog);row.appUnchanged=hash(before.app)===hash(after.app);
    assert(row.ledgerUnchanged&&row.catalogUnchanged&&row.appUnchanged,'public rejected migration must leave ledger/catalog/appdata unchanged');
    row.status='PROTOTYPE_NEGATIVE_VERIFIED';
   }else{
    assert.equal(error,null);const count=c.old==='Main109'?112:111;assert.equal(after.ledger.length,count);assert.deepEqual(after.ledger.slice(0,before.ledger.length),before.ledger);assert.deepEqual(after.app,before.app);
    assert.equal(new Set(after.catalog.columns.filter((x:any)=>x.table_name.startsWith('observability_')).map((x:any)=>x.table_name)).size,9);row.originalPrefixUnchanged=true;row.originalAppUnchanged=true;
    if(engine==='postgres')await client.end();else await client.close();client=null;
    // 第二次实际公共打开必须幂等，不靠helper/fixture判断。
    publicStore=engine==='postgres'?await createRuntimeDb({connectionString:url}):await createDb({dataDir:dir});if(engine==='postgres')await publicStore.pool.end();else await publicStore.client.close();publicStore=null;
    client=engine==='postgres'?new OwnedPostgresPool({connectionString:url}):new PGlite(dir);assert.deepEqual(await snapshot(client),after);row.secondPublicOpenUnchanged=true;row.status='PROTOTYPE_SUCCESS_VERIFIED';
   }
  }catch(e){row.status='FAIL';row.failure=e instanceof Error?e.stack:String(e);failed=true;}
  finally{
   if(publicStore){if(engine==='postgres')await publicStore.pool.end();else await publicStore.client.close();}
   if(client){if(engine==='postgres')await client.end();else await client.close();}
   if(name)await management.query(`DROP DATABASE "${name}" WITH (FORCE)`);
  }
  await writeFile(output,JSON.stringify({driver:engine,baselineRed:red,formalScope:'FINAL_R_SOURCE_BOUND_RUN_ONLY',formalGate:'NO_MODEL_OR_FUNDS_CLAIM',records},null,2)+'\n');console.log(JSON.stringify({case:c.name,status:row.status,ledgerUnchanged:row.ledgerUnchanged,actualError:row.actualError}));
 }
}finally{if(management)await management.end();}
console.log(JSON.stringify({driver:engine,baselineRed:red,cases:records.length,failed:records.filter(x=>x.status==='FAIL').length,output}));if(failed)process.exitCode=1;
