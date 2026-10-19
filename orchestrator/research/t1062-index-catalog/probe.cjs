const {createRequire}=require('node:module');
const {randomUUID,createHash}=require('node:crypto');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const localRequire=createRequire(process.cwd()+'/backend/package.json');
const {PGlite}=localRequire('@electric-sql/pglite');
const {Client}=localRequire('pg');
const ddl=`CREATE TABLE parent(id text NOT NULL,user_id text NOT NULL);
CREATE UNIQUE INDEX parent_owner_idx ON parent(id,user_id);
CREATE TABLE child(id text PRIMARY KEY,parent_id text,user_id text,CONSTRAINT child_parent_fk FOREIGN KEY(parent_id,user_id) REFERENCES parent(id,user_id));
CREATE TABLE owned_unique(id text PRIMARY KEY,user_id text UNIQUE);
CREATE INDEX parent_user_partial ON parent(user_id) WHERE user_id IS NOT NULL;
INSERT INTO parent VALUES('p1','u1');INSERT INTO child VALUES('c1','p1','u1');`;
const prefix=`SELECT t.relname AS table_name,i.relname AS name,pg_get_indexdef(i.oid) AS definition FROM pg_index x JOIN pg_class t ON t.oid=x.indrelid JOIN pg_class i ON i.oid=x.indexrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname='public' AND NOT x.indisprimary AND `;
const old=prefix+`NOT EXISTS(SELECT 1 FROM pg_constraint c WHERE c.conindid=i.oid) ORDER BY t.relname,i.relname`;
const fixed=prefix+`NOT EXISTS(SELECT 1 FROM pg_constraint c WHERE c.conindid=i.oid AND c.conrelid=x.indrelid AND c.contype IN ('p','u','x')) ORDER BY t.relname,i.relname`;
async function check(db,exec,engine){await exec(ddl);const before=(await db.query(old)).rows,after=(await db.query(fixed)).rows;assert(!before.some(r=>r.name==='parent_owner_idx'));assert(after.some(r=>r.name==='parent_owner_idx'));assert(after.some(r=>r.name==='parent_user_partial'));assert(!after.some(r=>r.name==='owned_unique_user_id_key'));await db.query(`INSERT INTO child VALUES('c2','p1','u1')`);let uniqueDenied=false;try{await db.query(`INSERT INTO parent VALUES('p1','u1')`)}catch(e){uniqueDenied=e.code==='23505'}assert(uniqueDenied);return {engine,oldMissedReferencedUnique:true,fixedKeptReferencedUnique:true,fixedKeptPredicateIndex:true,ownedUniqueConstraintIndexExcluded:true,foreignKeyInsert:true,duplicateStillDenied:true,old:before,fixed:after};}
(async()=>{const results=[];const mem=new PGlite();try{results.push(await check(mem,s=>mem.exec(s),'pglite'))}finally{await mem.close()}
const admin=new Client({connectionString:'postgresql://zyongzhu@127.0.0.1:55422/postgres'});await admin.connect();const name='t1062_index_'+randomUUID().replaceAll('-','');let db;
try{await admin.query('CREATE DATABASE "'+name+'"');db=new Client({connectionString:'postgresql://zyongzhu@127.0.0.1:55422/'+name});await db.connect();results.push(await check(db,s=>db.query(s),'postgres'))}finally{if(db)await db.end();await admin.query('DROP DATABASE IF EXISTS "'+name+'"');await admin.end()}
const output={question:'conindid排除条件是否遗漏外键引用的独立唯一索引，而不是缺唯一约束或FK排序问题',sourceProbeSHA256:createHash('sha256').update(fs.readFileSync(__filename)).digest('hex'),results};const target=process.cwd()+'/orchestrator/research/t1062-index-catalog/probe-result.json';fs.writeFileSync(target,JSON.stringify(output,null,2)+'\n');console.log(JSON.stringify({engines:results.map(x=>x.engine),passed:results.every(r=>r.fixedKeptReferencedUnique&&r.ownedUniqueConstraintIndexExcluded&&r.foreignKeyInsert&&r.duplicateStillDenied)}));})().catch(e=>{console.error(e);process.exitCode=1});
