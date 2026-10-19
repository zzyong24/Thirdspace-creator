import { beforeEach, afterEach, describe, expect, it } from "vitest";
import type {RequestContext} from "@creatoros/contract";
import {createDb,type Db} from "../../db";
import {createExternalAgentConnectionService,externalAgentCredentialHash,grantableExternalAgentOperation,type ExternalAgentConnectionService} from "./external-agent-connections.service";

describe("T-1018 外部 MCP 配对授权",()=>{
  let db:Db,close:()=>Promise<void>,service:ExternalAgentConnectionService;
  const ctx:RequestContext={userId:"owner",accountId:"account-a",requestId:"test",source:"user"};
  const token="secret-a";
  beforeEach(async()=>{
    const created=await createDb();db=created.db;close=()=>created.client.close();
    service=createExternalAgentConnectionService({db,now:()=>"2026-09-28T00:00:00.000Z",
      assertAccount:async(c,id)=>{if(c.userId!=="owner"||id!=="account-a")throw Error("owner");},
      assertProject:async(_c,id)=>{if(id!=="project-a")throw Error("project");}});
  });
  afterEach(async()=>close());
  const create=()=>service.create(ctx,{id:"pair-test",idempotencyKey:"create-1",clientKind:"codex",accountId:"account-a",projectId:"project-a",allowedOps:["projects.get","projects.scripts.generateCandidate"],credentialHash:externalAgentCredentialHash(token),credentialExpiresAt:"2026-09-28T12:00:00.000Z"});

  it("只授予只读和生成候选，人工采纳/发布/直接创建候选均不可授予",()=>{
    expect(grantableExternalAgentOperation("projects.scripts.generateCandidate",true)).toBe(true);
    for(const op of ["projects.scripts.acceptCandidate","candidates.create","ai.tasks.confirm","publications.transition","projects.delete"])
      expect(grantableExternalAgentOperation(op,false)).toBe(false);
  });
  it("创建授权时对采纳操作 fail closed，不能靠隐藏 tools/list 代替",async()=>{
    await expect(service.create(ctx,{id:"pair-denied",idempotencyKey:"denied",clientKind:"codex",accountId:"account-a",allowedOps:["projects.scripts.acceptCandidate"],credentialHash:externalAgentCredentialHash(token),credentialExpiresAt:"2026-09-28T12:00:00.000Z"})).rejects.toMatchObject({code:"OP_NOT_GRANTABLE"});
    expect(await service.list(ctx)).toHaveLength(0);
  });
  it("按凭据、版本、账号和项目逐次校验；伪造另一项目被拒绝",async()=>{
    await create();
    await expect(service.authenticate({id:"pair-test",revision:"1",token,operation:"projects.get",payload:{params:{projectId:"project-a"}}})).resolves.toMatchObject({accountId:"account-a",projectId:"project-a"});
    await expect(service.authenticate({id:"pair-test",revision:"1",token,operation:"projects.get",payload:{params:{projectId:"project-b"}}})).rejects.toMatchObject({code:"PROJECT_SCOPE_CHANGED"});
    await expect(service.authenticate({id:"pair-test",revision:"1",token:"bad",operation:"projects.get",payload:{params:{projectId:"project-a"}}})).rejects.toMatchObject({code:"CREDENTIAL_EXPIRED"});
    await expect(service.authenticate({id:"pair-test",revision:"1",token,operation:"projects.scripts.acceptCandidate",payload:{params:{projectId:"project-a"}}})).rejects.toMatchObject({code:"OP_NOT_GRANTED"});
  });
  it("撤销先使旧凭据失效，重复撤销可读回原结果",async()=>{
    await create();const revoked=await service.revoke(ctx,"pair-test","1");
    expect(revoked.revision).toBe("2");
    expect((await service.revoke(ctx,"pair-test","1")).revokedAt).toBe(revoked.revokedAt);
    await expect(service.authenticate({id:"pair-test",revision:"1",token,operation:"projects.get",payload:{params:{projectId:"project-a"}}})).rejects.toMatchObject({code:"PAIRING_REVOKED"});
  });
  it("同一创建幂等键只产生一条配对授权",async()=>{
    expect((await create()).created).toBe(true);
    expect((await create()).created).toBe(false);
    expect((await service.list(ctx)).length).toBe(1);
  });
});
