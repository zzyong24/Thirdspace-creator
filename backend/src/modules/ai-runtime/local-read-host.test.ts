import {afterEach,it,expect,vi} from "vitest";
import * as fs from "node:fs/promises";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {createLocalReadHost} from "./local-read-host";
import {searchLocalByBasename} from "./local-name-search";

const cleanup:string[]=[];
afterEach(async()=>{await Promise.all(cleanup.splice(0).map(path=>fs.rm(path,{recursive:true,force:true})));});
async function fixture(){
 const home=await fs.realpath(await fs.mkdtemp(join(tmpdir(),"local-host-")));cleanup.push(home);
 const path=join(home,"note.txt");await fs.writeFile(path,"本地正文");let once=true;
 const grants={checkGrant:vi.fn((user:string)=>user==="reader"&&once?"once" as const:null),consumeOnce:vi.fn(()=>{once=false;}),listAlwaysDirs:()=>[home]};
 const context={userId:"reader",accountId:"account",requestId:"r",source:"user" as const};
 return {home,path,grants,context};
}
it("同一用户并发读取只能消费一次授权",async()=>{
 const f=await fixture(),host=createLocalReadHost(f.grants,{homedir:()=>f.home});
 const results=await Promise.all([host.readLocalFile(f.context,{path:f.path}),host.readLocalFile(f.context,{path:f.path})]);
 expect(results.map(r=>r.status).sort()).toEqual(["file","needApproval"]);
 expect(f.grants.consumeOnce).toHaveBeenCalledTimes(1);
});
it("排队取消立即结束，但后续读取不能越过未结束的前驱",async()=>{
 const f=await fixture();let release!:()=>void,entered!:()=>void;
 const hold=new Promise<void>(r=>{release=r;}),started=new Promise<void>(r=>{entered=r;});
 const read=vi.fn(async()=>{entered();await hold;return Buffer.from("本地正文");});
 const host=createLocalReadHost(f.grants,{homedir:()=>f.home,fs:{...fs,readFile:read as unknown as typeof fs.readFile}});
 const first=host.readLocalFile(f.context,{path:f.path});await started;
 const controller=new AbortController();let secondStatus="waiting";
 const second=host.readLocalFile(f.context,{path:f.path,signal:controller.signal}).then(()=>{secondStatus="resolved";},e=>{secondStatus=e.name;});
 let thirdDone=false;
 const third=host.readLocalFile(f.context,{path:f.path}).finally(()=>{thirdDone=true;});
 // 让第二、三次请求走到真实路径解析后的队列等待。
 await new Promise(r=>setTimeout(r,20));controller.abort();
 try{
  await vi.waitFor(()=>expect(secondStatus).toBe("AbortError"),{timeout:100});
  expect(thirdDone).toBe(false);expect(read).toHaveBeenCalledTimes(1);
 }finally{release();await Promise.all([first,second,third]);}
 expect(await third).toMatchObject({status:"needApproval"});
 expect(f.grants.consumeOnce).toHaveBeenCalledTimes(1);
});
it("输入在等待文件系统时变更不能改换用户或读取路径",async()=>{
 const f=await fixture(),context={...f.context},input={path:f.path};
 let resume!:()=>void;const pause=new Promise<void>(r=>{resume=r;});
 const host=createLocalReadHost(f.grants,{homedir:()=>f.home,fs:{...fs,realpath:(async (path:Parameters<typeof fs.realpath>[0])=>{await pause;return fs.realpath(path);}) as typeof fs.realpath}});
 const result=host.readLocalFile(context,input);context.userId="foreign";input.path="/different.txt";resume();
 expect(await result).toMatchObject({status:"file",path:f.path});
 expect(f.grants.checkGrant).toHaveBeenCalledWith("reader",f.path);
});
it("读文件在途取消不返回正文、不消耗授权",async()=>{
 const f=await fixture(),controller=new AbortController();
 const read=vi.fn(async()=>{controller.abort();return Buffer.from("晚到正文");});
 const host=createLocalReadHost(f.grants,{homedir:()=>f.home,fs:{...fs,readFile:read as unknown as typeof fs.readFile}});
 await expect(host.readLocalFile(f.context,{path:f.path,signal:controller.signal})).rejects.toMatchObject({name:"AbortError"});
 expect(f.grants.consumeOnce).not.toHaveBeenCalled();
 expect(read.mock.calls).toHaveLength(1);
});
it("文件名搜索取消不被不可读目录的降级吞掉",async()=>{
 const controller=new AbortController();const readdir=vi.fn(async()=>{controller.abort();throw new Error("不可读");});
 await expect(searchLocalByBasename({roots:["/a","/b"],targetName:"note.txt",isSensitive:()=>false,signal:controller.signal,fs:{readdir,fileSize:async()=>0}})).rejects.toMatchObject({name:"AbortError"});
 expect(readdir).toHaveBeenCalledTimes(1);
});
it("审批只查询，成功读取消费后需要重新授权；用户间授权不互通",async()=>{
 const f=await fixture(),host=createLocalReadHost(f.grants,{homedir:()=>f.home});
 expect(await host.decideLocalReadAccess(f.context,{path:f.path})).toEqual({status:"granted"});
 expect(f.grants.consumeOnce).not.toHaveBeenCalled();
 expect(await host.readLocalFile({...f.context,userId:"other"},{path:f.path})).toMatchObject({status:"needApproval"});
 expect(await host.readLocalFile(f.context,{path:f.path})).toMatchObject({status:"file",fullText:"本地正文"});
 expect(await host.readLocalFile(f.context,{path:f.path})).toMatchObject({status:"needApproval"});
});
it("名称搜索保留唯一匹配和候选状态，不消费授权",async()=>{
 const f=await fixture(),host=createLocalReadHost(f.grants,{homedir:()=>f.home});
 expect(await host.readLocalFile(f.context,{path:"note.txt"})).toMatchObject({status:"nameMatch",path:f.path});
 await fs.mkdir(join(f.home,"sub"));await fs.writeFile(join(f.home,"sub","note.txt"),"另一个");
 expect(await host.readLocalFile(f.context,{path:"note.txt"})).toMatchObject({status:"nameCandidates",items:expect.any(Array)});
 expect(f.grants.consumeOnce).not.toHaveBeenCalled();
});
it("敏感路径与符号链接、二进制和过大文件继续拒绝",async()=>{
 const f=await fixture(),host=createLocalReadHost(f.grants,{homedir:()=>f.home});
 const hidden=join(f.home,".env");await fs.writeFile(hidden,"private");await fs.symlink(hidden,join(f.home,"alias.txt"));
 for(const path of [hidden,join(f.home,"alias.txt")])expect(await host.readLocalFile(f.context,{path})).toMatchObject({status:"denied"});
 await fs.writeFile(f.path,Buffer.from([0,1,2]));expect(await host.readLocalFile(f.context,{path:f.path})).toMatchObject({status:"denied"});
 await fs.writeFile(f.path,Buffer.alloc(1024*1024+1,65));expect(await host.readLocalFile(f.context,{path:f.path})).toMatchObject({status:"denied"});
 expect(f.grants.consumeOnce).not.toHaveBeenCalled();
});
it("目录清单保留总数与内容",async()=>{
 const f=await fixture(),host=createLocalReadHost(f.grants,{homedir:()=>f.home});
 expect(await host.readLocalFile(f.context,{path:f.home})).toMatchObject({status:"dir",total:1,entries:[{name:"note.txt",kind:"file",size:Buffer.byteLength("本地正文")}]});
});
