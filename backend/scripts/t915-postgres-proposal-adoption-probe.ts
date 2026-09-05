import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { createRuntimeDb, assets, knowledgeItems, knowledgeRevisions, entityTags, eq, and } from "../src/index";
import { createKnowledgeProposalAdoptionService, prepareKnowledgeProposal } from "../src/modules/knowledge";
import { createAssetTagProposalService } from "../src/modules/taxonomy";

// 只接受显式临时fixture；不读取应用DATABASE_URL，不连接用户数据库。
const fixture = JSON.parse(readFileSync(process.argv[2]!, "utf8")) as {url:string;root:string};
const url = new URL(fixture.url);
assert.ok(fixture.root.startsWith("/tmp/t915-pg-"));
assert.equal(url.searchParams.get("host"), `${fixture.root}/socket`);
const first = await createRuntimeDb({connectionString:fixture.url});
const second = await createRuntimeDb({connectionString:fixture.url});
const ctx = {userId:randomUUID(),accountId:randomUUID(),requestId:"probe",source:"user" as const};
const deps = {now:()=>new Date().toISOString(),nextId:(prefix:string)=>`${prefix}-${randomUUID()}`};
try {
  const knowledge = [first,second].map(f=>createKnowledgeProposalAdoptionService(f.db));
  const tags = [first,second].map(f=>createAssetTagProposalService(f.db,deps));
  const candidate = prepareKnowledgeProposal(ctx,{proposalId:randomUUID(),title:"并发知识",note:"同一候选",sourceNote:"https://example.com",source:{taskId:"task",toolCallId:"call",evidenceRefs:["https://example.com"]}});
  const results = await Promise.all(Array.from({length:30},(_,i)=>knowledge[i%2]!.adopt(ctx,candidate)));
  assert.equal(new Set(results.map(r=>r.knowledgeId)).size,1);
  assert.equal((await first.db.select().from(knowledgeItems).where(eq(knowledgeItems.userId,ctx.userId))).length,1);
  assert.equal((await first.db.select().from(knowledgeRevisions).where(eq(knowledgeRevisions.knowledgeItemId,candidate.target.knowledgeId))).length,1);
  const assetId = randomUUID(); const stamp=deps.now();
  await first.db.insert(assets).values({id:assetId,userId:ctx.userId,accountId:ctx.accountId,name:"真实素材",assetType:"image",createdAt:stamp,updatedAt:stamp});
  const targets=await tags[0]!.prepare(ctx,[assetId]);
  const batch=[{proposalId:randomUUID(),targets,tag:"标签甲"},{proposalId:randomUUID(),targets,tag:"标签乙"}];
  const adopted=await Promise.all(Array.from({length:30},(_,i)=>tags[i%2]!.adoptBatch(ctx,batch)));
  for (const result of adopted) assert.deepEqual(result, adopted[0]);
  assert.equal((await first.db.select().from(entityTags).where(and(eq(entityTags.userId,ctx.userId),eq(entityTags.entityId,assetId)))).length,2);
  const changed=await tags[0]!.prepare(ctx,[assetId]);
  assert.notEqual(changed[0]!.expectedVersion,targets[0]!.expectedVersion);
  await assert.rejects(tags[1]!.adopt(ctx,{proposalId:randomUUID(),targets,tag:"旧快照"}));
  console.log(JSON.stringify({status:"passed",independentPools:2,concurrentKnowledgeAdoptions:30,knowledgeItems:1,knowledgeRevisions:1,concurrentBatchAdoptions:30,proposalsPerBatch:2,tagRelations:2,staleVersionRejected:true,postgresVersion:(await first.pool.query("SHOW server_version")).rows[0].server_version}));
} finally {await first.pool.end();await second.pool.end();}
