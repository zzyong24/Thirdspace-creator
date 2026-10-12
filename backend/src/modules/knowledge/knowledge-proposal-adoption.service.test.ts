import {platformAccounts as originalAccounts,type Db as OwnedFixtureDb} from "@creatoros/backend";
import {createAccountGroupService} from "../platform-account/account-group.service";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDb, eq, knowledgeItems, knowledgeRevisions, knowledgeAdoptions } from "@creatoros/backend";
import type { RequestContext } from "@creatoros/contract";
import { createKnowledgeService } from "./knowledge.service";
import { createKnowledgeRepository } from "./knowledge.repository";
import { createKnowledgeProposalAdoptionService, prepareKnowledgeProposal } from "./knowledge-proposal-adoption.service";

const ctx: RequestContext = { userId: "u", accountId: "a", requestId: "r", source: "user" };
const proposal = () => prepareKnowledgeProposal(ctx, { proposalId: "proposal-1", title: "调研结论", note: "用户需要保留的知识正文", sourceNote: "https://example.com/article",
  source: { taskId: "task", toolCallId: "call", evidenceRefs: ["https://example.com/article"] } });
describe("知识候选原子采纳", () => {
  let fixture: Awaited<ReturnType<typeof createDb>>;
  beforeEach(async () => { fixture = await createDb(); await seedOwnedKnowledgeAccount(fixture.db,ctx.userId,ctx.accountId!); });
  afterEach(async () => { await fixture.client.close(); });
  it("准备候选不写知识；并发采纳只建一条知识、一版和一张回执", async () => {
    const candidate = proposal();
    expect(await fixture.db.select().from(knowledgeItems)).toHaveLength(0);
    const adoption = createKnowledgeProposalAdoptionService(fixture.db);
    const results = await Promise.all(Array.from({ length: 20 }, () => adoption.adopt(ctx, candidate)));
    expect(new Set(results.map(r => r.knowledgeId)).size).toBe(1);
    expect(await fixture.db.select().from(knowledgeItems)).toHaveLength(1);
    expect(await fixture.db.select().from(knowledgeRevisions)).toMatchObject([{ content: candidate.content.note }]);
    expect(await fixture.db.select().from(knowledgeAdoptions)).toHaveLength(1);
    const [item] = await fixture.db.select().from(knowledgeItems);
    expect(item?.sourceMetadata).toMatchObject({ proposalId: candidate.proposalId, taskId: "task", toolCallId: "call" });
  });
  it("采纳回执重放不覆写后续人工修改或归档", async () => {
    const adoption = createKnowledgeProposalAdoptionService(fixture.db); const candidate = proposal();
    const result = await adoption.adopt(ctx, candidate);
    let serial = 0;
    const knowledge = createKnowledgeService(createKnowledgeRepository(fixture.db, { now: () => new Date().toISOString(), nextId: prefix => `${prefix}-${++serial}` }));
    const revised = await knowledge.createRevision(ctx, result.knowledgeId, { content: "人工更新" });
    await knowledge.archiveKnowledge(ctx, result.knowledgeId);
    expect(await adoption.adopt(ctx, candidate)).toEqual(result);
    const current = await knowledge.getKnowledge(ctx, result.knowledgeId);
    expect(current.status).toBe("archived");
    expect(current.currentRevisionId).toBe(revised.id);
    expect((await knowledge.listRevisions(ctx, result.knowledgeId))[0]?.content).toBe("人工更新");
  });
  it("同一候选篡改正文拒绝，跨用户与跨账号目标不能采纳", async () => {
    const adoption = createKnowledgeProposalAdoptionService(fixture.db); const candidate = proposal();
    await adoption.adopt(ctx, candidate);
    await expect(adoption.adopt(ctx, { ...candidate, content: { ...candidate.content, note: "变更" } })).rejects.toThrow("内容已变化");
    await expect(adoption.adopt({ ...ctx, accountId: "other" }, candidate)).rejects.toThrow("归属");
    await expect(adoption.adopt({ ...ctx, userId: "other" }, candidate)).rejects.toThrow("归属");
    expect(await fixture.db.select().from(knowledgeItems)).toHaveLength(1);
  });
  it("目标冲突回滚回执，不能把已有条目当作本次创建", async () => {
    const candidate = proposal(); const stamp = new Date().toISOString();
    await fixture.db.insert(knowledgeItems).values({ id: candidate.target.knowledgeId, userId: "u", accountId: "a", currentRevisionId: "old", title: "既有", createdAt: stamp, updatedAt: stamp });
    await expect(createKnowledgeProposalAdoptionService(fixture.db).adopt(ctx, candidate)).rejects.toThrow("目标已存在");
    expect(await fixture.db.select().from(knowledgeAdoptions)).toHaveLength(0);
    expect(await fixture.db.select().from(knowledgeRevisions)).toHaveLength(0);
  });
});

async function seedOwnedKnowledgeAccount(db:OwnedFixtureDb,userId:string,accountId:string){
 const stamp="2026-06-21T00:00:00.000Z";
 await db.insert(originalAccounts).values({id:accountId,userId,platform:'douyin',accountHandle:accountId,createdAt:stamp,updatedAt:stamp}).onConflictDoNothing();
 await createAccountGroupService({db,now:()=>stamp,nextId:prefix=>`${prefix}-${accountId}-fixture`}).ensureLegacyGroups({userId,requestId:'original-knowledge-fixture',source:'user'});
}
