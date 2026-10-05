import {it,expect} from "vitest";
import {createDb,intelligenceItems,sourceSnapshots,itemTranscripts} from "@creatoros/backend";
import type {RequestContext} from "@creatoros/contract";
import {createIntelligenceSnapshotReader} from "./intelligence-snapshots";
it("纯读取确切原快照，不写转写状态，不以新版正文替换历史；身份交叉与null正文拒绝",async()=>{
 const opened=await createDb(),db=opened.db,now="2026-10-02T07:00:00.000Z",ctx:RequestContext={userId:"snap-user",accountId:"snap-account",source:"user",requestId:"read"};try{
 for(const id of["item-a","item-b"])await db.insert(intelligenceItems).values({id,userId:ctx.userId,accountId:ctx.accountId!,type:"article",platform:"web",canonicalUrl:`https://example.test/${id}`,canonicalUrlHash:id,capturedAt:now,createdAt:now,updatedAt:now});
 for(const [id,text]of [["snapshot-old","原历史正文"],["snapshot-new","新正文"],["snapshot-null",null]] as const)await db.insert(sourceSnapshots).values({id,userId:ctx.userId,accountId:ctx.accountId!,sourceId:"source",runId:"run",itemId:"item-a",capturedAt:now,finalUrl:"https://example.test/item-a",contentHash:id,safeExtract:text});
 const before=await db.select().from(itemTranscripts),reader=createIntelligenceSnapshotReader(db);
 expect(await reader.readImmutableSnapshot(ctx,"item-a","snapshot-old")).toEqual({itemId:"item-a",versionId:"snapshot-old",text:"原历史正文"});expect(await db.select().from(itemTranscripts)).toEqual(before);
 await expect(reader.readImmutableSnapshot(ctx,"item-b","snapshot-old")).rejects.toThrow();await expect(reader.readImmutableSnapshot(ctx,"item-a","missing")).rejects.toThrow();await expect(reader.readImmutableSnapshot(ctx,"item-a","snapshot-null")).rejects.toThrow();
 await expect(reader.readImmutableSnapshot({...ctx,userId:"foreign-user"},"item-a","snapshot-old")).rejects.toThrow();await expect(reader.readImmutableSnapshot({...ctx,accountId:"foreign-account"},"item-a","snapshot-old")).rejects.toThrow();expect(await db.select().from(sourceSnapshots)).toHaveLength(3);expect(await db.select().from(itemTranscripts)).toEqual(before);
 }finally{await opened.client.close();}
});
