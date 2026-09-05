import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {expect,it,vi} from "vitest";
import {getIdentityService,__resetPersistenceForTests} from "./persistence-client";
it("生产组合根首次启动取得真实本机用户，重建后保留同一身份",async()=>{
 const directory=mkdtempSync(join(tmpdir(),"t915-local-owner-"));
 vi.stubEnv("DATABASE_URL","");vi.stubEnv("PGLITE_DATA_DIR",join(directory,"db"));__resetPersistenceForTests();
 try{
  const identity=await getIdentityService();const ctx=await identity.resolveLocalContext();const user=await identity.getCurrentUser(ctx);
  expect(user.id).not.toBe("user-zyongzhu");expect(user.id).not.toBe("");expect(user.displayName).toBe("");expect(user.email).toBe("");
  await identity.updateProfile(ctx,{displayName:"真实本机用户"});
  __resetPersistenceForTests();const next=await getIdentityService();const restored=await next.resolveLocalContext();
  expect(restored.userId).toBe(ctx.userId);expect((await next.getCurrentUser(restored)).displayName).toBe("真实本机用户");
 }finally{__resetPersistenceForTests();vi.unstubAllEnvs();rmSync(directory,{recursive:true,force:true});}
},30000);
