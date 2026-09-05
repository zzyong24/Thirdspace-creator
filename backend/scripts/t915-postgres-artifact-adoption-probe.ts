import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { createRuntimeDb } from "../src/index";
import { createArtifactsService } from "../src/modules/artifacts/artifacts.service";
// 仅显式临时fixture，不使用应用DATABASE_URL。
const fixture=JSON.parse(readFileSync(process.argv[2]!,"utf8")) as {url:string;root:string};
const url=new URL(fixture.url);
assert.ok(fixture.root.startsWith("/tmp/t915-pg-"));
assert.equal(url.searchParams.get("host"),`${fixture.root}/socket`);
const first=await createRuntimeDb({connectionString:fixture.url});
const second=await createRuntimeDb({connectionString:fixture.url});
const ctx={userId:randomUUID(),accountId:randomUUID(),requestId:"probe",source:"user" as const};
const make=(db:typeof first.db)=>createArtifactsService({db,now:()=>new Date().toISOString(),nextId:p=>`${p}-${randomUUID()}`});
try{
  const a=make(first.db);const b=make(second.db);
  const artifact=await a.createArtifact(ctx,{projectId:randomUUID(),title:"并发结构",artifactType:"content_outline",stage:"planning"});
  const input={contentText:"并发采纳",createdByType:"ai",aiTaskId:randomUUID(),adoptionKey:randomUUID(),adoptionSourceDigest:"sha256:"+"1".repeat(64)};
  const rows=await Promise.all(Array.from({length:30},(_,index)=>(index%2 ? a : b).createVersion(ctx,artifact.id,input)));
  assert.equal(new Set(rows.map(row=>row.id)).size,1);
  assert.equal((await a.listVersions(ctx,artifact.id)).length,2);
  const edits=await Promise.all(Array.from({length:10},(_,index)=>(index%2 ? a : b).createVersion(ctx,artifact.id,{contentText:`用户编辑${index}`})));
  assert.equal(new Set(edits.map(row=>row.versionNumber)).size,10);
  const before=await b.getArtifact(ctx,artifact.id);
  assert.equal((await a.createVersion(ctx,artifact.id,input)).id,rows[0]!.id);
  assert.equal((await b.getArtifact(ctx,artifact.id)).currentVersionId,before.currentVersionId);
  console.log(JSON.stringify({status:"passed",independentPools:2,concurrentAdoptions:30,adoptedVersions:1,concurrentEdits:10,uniqueEditVersionNumbers:10,replayPreservesCurrent:true,postgresVersion:(await first.pool.query("SHOW server_version")).rows[0].server_version}));
}finally{await first.pool.end();await second.pool.end();}
