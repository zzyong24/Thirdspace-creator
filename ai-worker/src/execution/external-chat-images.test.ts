import {afterEach,expect,it,vi} from 'vitest';
import {mkdtemp,writeFile,symlink,link,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createExternalChatImages,readTaskImage} from './external-chat-images';
const png=Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0]);
const dirs:string[]=[];
afterEach(async()=>{for(const dir of dirs.splice(0))await rm(dir,{recursive:true,force:true});});
const receipt=(toolCallId:string,imageIndex:number)=>({toolCallId,imageIndex,assetId:'asset',fileId:'file',assetType:'image',name:'图',checksum:'a'.repeat(64),byteLength:png.length,committedAt:'2026-10-04T00:00:00Z'});
const notification=(toolCallId:string,content:unknown[],savedPath?:string)=>({sessionId:'session',update:{sessionUpdate:'tool_call_update',toolCallId,status:'completed',content,rawOutput:{savedPath}}}) as never;
const inline=()=>({type:'content',content:{type:'image',data:png.toString('base64'),mimeType:'image/png'}});
it('原 fs-safe 拒绝路径图的符号链接、硬链接与目录外文件，保留普通文件读取',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'t1060-image-'));dirs.push(dir);const file=join(dir,'image.png');await writeFile(file,png);
 expect(Buffer.from(await readTaskImage(dir,file))).toEqual(png);
 const soft=join(dir,'soft.png');await symlink(file,soft);await expect(readTaskImage(dir,soft)).rejects.toThrow();
 const hard=join(dir,'hard.png');await link(file,hard);await expect(readTaskImage(dir,hard)).rejects.toThrow();
 await expect(readTaskImage(join(dir,'other'),file)).rejects.toThrow();
});
it('同步通知排队，结算等待真实保存；重复事件先查收据，不重复上传',async()=>{
 let finish!:()=>void;const pending=new Promise<void>(r=>{finish=r;});const call=vi.fn(async(port:string,data:any)=>{if(port==='recoverExternalChatImage')return {status:'missing'};await pending;return {status:'committed',receipt:receipt(data.toolCallId,data.imageIndex)};});
 const images=createExternalChatImages({cwd:tmpdir(),callId:'call',sessionId:'session',signal:new AbortController().signal,call:call as never});images.accept(notification('tool',[inline()],'/outside/bad.png'));images.accept(notification('tool',[inline()]));
 let done=false;const result=images.flush().then(value=>{done=true;return value;});await new Promise(r=>setTimeout(r,10));expect(done).toBe(false);finish();expect((await result).images).toHaveLength(1);expect(call.mock.calls.filter(([port])=>port==='saveExternalChatImage')).toHaveLength(1);
});
it('跨工具图片总数限制为16，单张失败及超限不撤销已保存图片',async()=>{
 const call=vi.fn(async(port:string,data:any)=>port==='recoverExternalChatImage'?{status:'missing'}:{status:'committed',receipt:receipt(data.toolCallId,data.imageIndex)});
 const images=createExternalChatImages({cwd:tmpdir(),callId:'call',sessionId:'session',signal:new AbortController().signal,call:call as never});for(let n=0;n<17;n++)images.accept(notification('tool-'+n,[inline()]));
 const result=await images.flush();expect(result.images).toHaveLength(16);expect(result.imageFailures.length).toBeGreaterThan(0);expect(result.imageFailures.length).toBeLessThanOrEqual(16);
});
it('重放使用后台已保存收据；坏字节只形成该图片失败项',async()=>{
 const call=vi.fn(async()=>({status:'committed',receipt:receipt('tool',0)}));const images=createExternalChatImages({cwd:tmpdir(),callId:'call',sessionId:'session',signal:new AbortController().signal,call:call as never});images.accept(notification('tool',[], '/outside/no.png'));expect((await images.flush()).images).toHaveLength(1);expect(call).toHaveBeenCalledTimes(1);
 const bad=createExternalChatImages({cwd:tmpdir(),callId:'call',sessionId:'session',signal:new AbortController().signal,call:async()=>({status:'missing'})});bad.accept(notification('bad',[{type:'content',content:{type:'image',data:'AAAA',mimeType:'image/png'}}]));expect(await bad.flush()).toMatchObject({images:[],imageFailures:[{code:'CODEX_IMAGE_INVALID'}]});
});

it('保存成功但回复丢失，重放恢复后清除旧失败项',async()=>{
 let saved=false;const call=vi.fn(async(port:string)=>{if(port==='recoverExternalChatImage')return saved?{status:'committed',receipt:receipt('tool',0)}:{status:'missing'};saved=true;throw Error('reply lost');});
 const images=createExternalChatImages({cwd:tmpdir(),callId:'call',sessionId:'session',signal:new AbortController().signal,call:call as never});images.accept(notification('tool',[inline()]));expect((await images.flush()).imageFailures).toHaveLength(1);images.accept(notification('tool',[inline()]));expect(await images.flush()).toMatchObject({images:[receipt('tool',0)],imageFailures:[]});
});
