import { beforeAll,afterAll,describe,it,expect } from "vitest";
import { createDb,type Db } from "@creatoros/backend";
import { createPublishingService } from "./publishing.service";
const ctx={userId:"adopt",accountId:"adopt",requestId:"test",source:"user" as const};
const input={outputId:"fixture-output",adoptionKey:"candidate-1",platform:"douyin",title:"候选标题",description:"候选正文",platformTags:["测试"]};
describe("发布草稿原子采纳",()=>{
  let db:Db;let close:()=>Promise<void>;let sequence=0;
  beforeAll(async()=>{const c=await createDb();db=c.db;close=()=>c.client.close();});afterAll(async()=>close?.());
  function service(failRevision=false){
    const port=createPublishingService({
      db, now:()=>new Date().toISOString(),
      nextId(prefix){
        if(failRevision && prefix==="pub-rev")throw new Error("REVISION_INTERRUPTED");
        return `${prefix}-${++sequence}`;
      },
      publisher:{
        async publish(){throw new Error("NOT_AUTHORIZED");},
        async remove(){throw new Error("NOT_AUTHORIZED");},
      },
    });
    return {...port,adoptDraft:async(...args:Parameters<typeof port.adoptDraft>)=>{const row=await port.adoptDraft(...args);if("kind" in row)throw new Error("测试须使用真实账号目标");return row;}};
  }

  it("创建首版失败时草稿也回滚，重试只创建完整的一份",async()=>{
    await expect(service(true).adoptDraft(ctx,input)).rejects.toThrow("REVISION_INTERRUPTED");
    expect(await service().listPublications(ctx,input.outputId,{limit:20,offset:0})).toHaveLength(0);
    const publication=await service().adoptDraft(ctx,input);
    expect(await service().listRevisions(ctx,publication.id,{limit:20,offset:0})).toHaveLength(1);
  });
  it("并发同键只生成一个首版；后续编辑不被重复采纳覆盖",async()=>{
    const port=service();const request={...input,adoptionKey:"concurrent"};
    const rows=await Promise.all(Array.from({length:12},()=>port.adoptDraft(ctx,request)));
    expect(new Set(rows.map(row=>row.id)).size).toBe(1);
    expect(await port.listRevisions(ctx,rows[0]!.id,{limit:20,offset:0})).toHaveLength(1);
    const edit=await port.createRevision(ctx,rows[0]!.id,{title:"用户编辑",description:"新正文"});
    expect((await port.adoptDraft(ctx,request)).currentRevisionId).toBe(edit.id);
    expect(await port.listRevisions(ctx,rows[0]!.id,{limit:20,offset:0})).toHaveLength(2);
    await expect(port.adoptDraft(ctx,{...request,description:"偷换候选"})).rejects.toThrow("不能改换");
  });
  it("相同来源键按用户和账号隔离",async()=>{
    const port=service();const a=await port.adoptDraft(ctx,{...input,adoptionKey:"scoped"});
    const b=await port.adoptDraft({...ctx,accountId:"other"},{...input,adoptionKey:"scoped"});expect(a.id).not.toBe(b.id);
    await expect(port.getPublication({...ctx,accountId:"other"},a.id)).rejects.toThrow();
  });
});
