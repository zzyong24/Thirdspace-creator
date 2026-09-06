import {it,expect,vi} from "vitest";
import {mkdtemp,writeFile,realpath,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {getChatRuntime,__resetPersistenceForTests} from "./persistence-client";
import {grantOnce,checkGrant,resetLocalReadGrantsForTest} from "./local-read-grants";

it("正式本地读取取消后不消费一次授权，随后正常读取仍可成功",async()=>{
 const directory=await realpath(await mkdtemp(join(tmpdir(),"local-read-")));
 vi.stubEnv("DATABASE_URL","");vi.stubEnv("PGLITE_DATA_DIR","");
 vi.stubEnv("CREATOROS_LOCAL_READ_GRANTS_FILE",join(directory,"grants.json"));
 __resetPersistenceForTests();resetLocalReadGrantsForTest();
 try{
  const path=join(directory,"note.txt");await writeFile(path,"真实本地正文");
  const runtime=await getChatRuntime();
  const context={userId:"local-reader",accountId:"local-account",requestId:"local-request",source:"user" as const};
  grantOnce(context.userId,path);
  const controller=new AbortController();controller.abort();
  await expect(runtime.readLocalFile(context,{path,signal:controller.signal})).rejects.toMatchObject({name:"AbortError"});
  expect(checkGrant(context.userId,path)).toBe("once");
  await expect(runtime.readLocalFile(context,{path})).resolves.toMatchObject({status:"file",fullText:"真实本地正文"});
  expect(checkGrant(context.userId,path)).toBeNull();
 }finally{
  await (globalThis as {__creatorosDisposePersistence?:()=>Promise<void>}).__creatorosDisposePersistence?.();
  __resetPersistenceForTests();resetLocalReadGrantsForTest();vi.unstubAllEnvs();await rm(directory,{recursive:true,force:true});
 }
},30000);
