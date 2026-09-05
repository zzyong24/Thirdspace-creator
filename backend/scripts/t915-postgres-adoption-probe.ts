import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { createRuntimeDb } from "../src/index";
import { createPublishingService } from "../src/modules/publishing/publishing.service";
// 仅显式临时fixture，不使用应用DATABASE_URL。
const fixture=JSON.parse(readFileSync(process.argv[2]!,"utf8")) as {url:string;root:string};
const url=new URL(fixture.url);
assert.ok(fixture.root.startsWith("/tmp/t915-pg-"));
assert.equal(url.searchParams.get("host"),`${fixture.root}/socket`);
const first=await createRuntimeDb({connectionString:fixture.url});
const second=await createRuntimeDb({connectionString:fixture.url});
const ctx={userId:randomUUID(),accountId:randomUUID(),requestId:"probe",source:"user" as const};
const make=(db:typeof first.db)=>createPublishingService({db,now:()=>new Date().toISOString(),nextId:p=>`${p}-${randomUUID()}`,publisher:{async publish(){throw new Error("NOT_AUTHORIZED");},async remove(){throw new Error("NOT_AUTHORIZED");}}});
try{
  const a=make(first.db);const b=make(second.db);
  const input={outputId:randomUUID(),adoptionKey:randomUUID(),platform:"douyin",title:"并发候选",description:"真实数据库并发验证",platformTags:[]};
  const rows=await Promise.all(Array.from({length:30},(_,index)=>(index%2 ? a : b).adoptDraft(ctx,input)));
  assert.equal(new Set(rows.map(row=>row.id)).size,1);
  const revisions=await a.listRevisions(ctx,rows[0]!.id,{limit:100,offset:0});assert.equal(revisions.length,1);
  const publications=await b.listPublications(ctx,input.outputId,{limit:100,offset:0});assert.equal(publications.length,1);
  console.log(JSON.stringify({status:"passed",independentPools:2,concurrentAdoptions:30,publications:publications.length,revisions:revisions.length,postgresVersion:(await first.pool.query("SHOW server_version")).rows[0].server_version}));
}finally{await first.pool.end();await second.pool.end();}
