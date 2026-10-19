import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as http from 'node:http';

// 默认E2E只登记跳过；实际媒体/公共写入必须由专用driver显式绑定本轮隔离服务。
const configured=Boolean(process.env.T1295_SOURCE_ROOT&&process.env.T1295_EVIDENCE_ROOT&&process.env.T1295_SERVICE_BINDING);
const sourceRoot=fs.realpathSync(process.env.T1295_SOURCE_ROOT??path.resolve(process.cwd(),path.basename(process.cwd())==='frontend'?'..':'.'));
const {test,expect}=createRequire(path.join(sourceRoot,'frontend/package.json'))('@playwright/test');
if(!configured){
 test('T1295 专用隔离CSP与真实视频验收',()=>{test.skip(true,'需要显式T1295 owned绑定；普通E2E不触发媒体写入');});
}else{
// 正执行保留每个原900秒RPC预算；外层覆盖完整串行、有限任务观察与清理。
const evidenceRoot=path.resolve(process.env.T1295_EVIDENCE_ROOT!);
const bindingPath=path.resolve(process.env.T1295_SERVICE_BINDING!);
const binding=JSON.parse(fs.readFileSync(bindingPath,'utf8'));
const sha=(v:Buffer|string)=>createHash('sha256').update(v).digest('hex');
const markerPath=path.join(binding.ownedRoot,'owner.json');
assert.equal(binding.uid,process.getuid!());
assert.equal(sha(fs.readFileSync(markerPath)),binding.markerSha256);
assert.equal(JSON.parse(fs.readFileSync(markerPath,'utf8')).task,'T-1294');
assert.equal(new URL(binding.baseURL).hostname,'127.0.0.1');
assert.equal(binding.sourceRoot,sourceRoot);
assert(evidenceRoot.startsWith(path.join(sourceRoot,'docs/verification/t1295/browser/runs/')));
const save=(name:string,value:unknown)=>fs.writeFileSync(path.join(evidenceRoot,name+'.json'),JSON.stringify(value,null,2)+'\n',{mode:0o600});
const budget=120_000;
let ownedRoot:string,server:http.Server,origin:string,policy:string,clip:Buffer,previewHtml='';
const netAudit:Array<{method:string;path:string}>=[];
const publicState:{pending:unknown;done:Record<string,any>}={pending:null,done:{}};
const stopStates=['failed','cancelled','interrupted','waiting_user','blocked','unknown_result','paused'];
const checkpoint=()=>save('public-state',publicState);
function documentFor(outputId:string,mediaId:string,size:number){
 const time=new Date().toISOString();
 const element={id:'t1295-clip',name:'T1295 2秒原片',type:'video',hidden:false,mediaId,startTime:0,duration:240000,trimStart:0,trimEnd:0,sourceDuration:240000,isSourceAudioEnabled:true,
  params:{muted:false,volume:0,opacity:1,blendMode:'normal','transform.rotate':0,'transform.scaleX':1,'transform.scaleY':1,'transform.positionX':0,'transform.positionY':0},effects:[]};
 return {version:31,metadata:{id:outputId,name:'T1295 独占音画验收',duration:240000,createdAt:time,updatedAt:time},currentSceneId:'t1295-scene',settings:{fps:{numerator:24,denominator:1},background:{type:'color',color:'#000000'},canvasSize:{width:640,height:360},canvasSizeMode:'preset',lastCustomCanvasSize:null,originalCanvasSize:{width:640,height:360}},
  scenes:[{id:'t1295-scene',name:'2秒有声场景',isMain:true,bookmarks:[],createdAt:time,updatedAt:time,tracks:{main:{id:'t1295-main',name:'原片',type:'video',muted:false,hidden:false,elements:[element]},overlay:[],audio:[]}}],
  mediaMetadata:[{mediaId,name:'t1295-source.mp4',size,type:'video',width:640,height:360,duration:2,fps:24,hasAudio:true,lastModified:1792036800000}]};
}
const probeScript=()=>`
const results={wasm:null,eval:null,Function:null,violations:[],native:null};window.t1295Probe=results;
document.addEventListener('securitypolicyviolation',e=>results.violations.push({directive:e.effectiveDirective,blockedURI:e.blockedURI}));
try{const module=await WebAssembly.compile(new Uint8Array([0,97,115,109,1,0,0,0,1,5,1,96,0,1,127,3,2,1,0,7,10,1,6,97,110,115,119,101,114,0,0,10,6,1,4,0,65,42,11]));const value=await WebAssembly.instantiate(module);results.wasm={ok:value.exports.answer()===42,answer:value.exports.answer()};}catch(e){results.wasm={ok:false,name:e.name,message:e.message};}
try{results.eval={blocked:false,value:eval('1+1')};}catch(e){results.eval={blocked:true,name:e.name};}
try{results.Function={blocked:false,value:new Function('return 1+1')()};}catch(e){results.Function={blocked:true,name:e.name};}
document.querySelector('#probe-results').textContent=JSON.stringify(results,null,2);window.t1295ProbeDone=true;
if(results.wasm.ok){try{
 const module=await import('/reference-editors/opencut-classic/native/native.js');
 const controller=new AbortController();window.t1295Controller=controller;
 const errors=[];const handle=await module.mount(document.querySelector('#native'),{owner:{groupId:'owned-t1295',accountId:null,projectId:'owned-t1295-project',outputId:'owned-t1295-output',sourceVersionId:'t1295-source-v1'},theme:{mode:'light',tokens:{'--creatoros-primary':'#6d4aff','--creatoros-surface':'#ffffff','--creatoros-text':'#171a25'},fontFamily:'sans-serif',fontSize:'14px',density:'comfortable'},portalContainer:document.querySelector('#portals'),signal:controller.signal,onChanged(){},onError(message){errors.push(message)},async importMedia(){throw Error('No host upload in static native probe')}});
 window.t1295Native=handle;
 const response=await fetch('/clip.mp4');if(!response.ok)throw Error('clip HTTP '+response.status);const bytes=await response.arrayBuffer();const file=new File([bytes],'t1295-source.mp4',{type:'video/mp4',lastModified:1792036800000});
 const nativeDocument=${JSON.stringify(documentFor('owned-t1295-output','t1295-media',clip.length))};
 const loaded=await handle.request('load',{outputId:'owned-t1295-output',document:nativeDocument,media:[{...nativeDocument.mediaMetadata[0],file}]});
 const context=await handle.request('context');const seek=await handle.request('seek',{outputId:context.outputId,sceneId:context.sceneId,tick:60000});
 results.native={ok:true,loaded,context:{documentVersion:context.documentVersion,outputId:context.outputId,sceneId:context.sceneId,ticksPerSecond:context.ticksPerSecond},seek,errors};
 window.t1295NativeReady=true;
}catch(e){results.native={ok:false,name:e.name,message:e.message};window.t1295NativeReady=true;}}
document.querySelector('#probe-results').textContent=JSON.stringify(results,null,2);
`;
test.describe.configure({mode:'serial',timeout:28_800_000,retries:0});
test.beforeAll(async()=>{
 fs.mkdirSync(evidenceRoot,{recursive:true,mode:0o700});
 assert(!fs.existsSync(path.join(evidenceRoot,'owner.json')),'use a fresh evidence directory; do not overwrite prior FAIL');
 ownedRoot=fs.mkdtempSync(path.join(os.tmpdir(),'t1295-csp-'));fs.chmodSync(ownedRoot,0o700);
 const owner={task:'T-1295',uid:process.getuid!(),nonce:randomUUID(),ownedRoot,sourceRoot,at:new Date().toISOString()};
 fs.writeFileSync(path.join(ownedRoot,'owner.json'),JSON.stringify(owner),{mode:0o600});save('owner',owner);
 const baseline=process.env.T1295_POLICY_MODE==='baseline';
 const ownerPath=path.join(sourceRoot,'frontend/scripts/desktop/desktop-csp.mjs');
 const bytes=baseline?execFileSync('git',['show','HEAD:frontend/scripts/desktop/desktop-csp.mjs'],{cwd:sourceRoot}):fs.readFileSync(ownerPath);
 const module=await import(baseline?'data:text/javascript;base64,'+bytes.toString('base64'):pathToFileURL(ownerPath).href);
 policy=module.DESKTOP_RELEASE_CSP;assert.equal(module.desktopReleaseHeaders({CREATOROS_DESKTOP:'1',CREATOROS_SIDECAR_SIGNING_REQUIRED:'1'})[0].headers[0].value,policy);
 const scriptDirective=policy.split(';').map((v:string)=>v.trim()).find((v:string)=>v.startsWith('script-src '));assert(scriptDirective);
 const tokens=scriptDirective.split(/\s+/);assert(!tokens.includes("'unsafe-eval'"));
 const mediaPath=path.join(ownedRoot,'source.mp4');
 execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','testsrc2=size=640x360:rate=24:duration=2','-f','lavfi','-i','sine=frequency=880:sample_rate=48000:duration=2','-c:v','libx264','-pix_fmt','yuv420p','-preset','ultrafast','-crf','18','-c:a','aac','-t','2','-movflags','+faststart','-y',mediaPath],{timeout:budget});
 clip=fs.readFileSync(mediaPath);fs.writeFileSync(path.join(evidenceRoot,'source.mp4'),clip,{mode:0o600});
 save('binding',{...owner,policyMode:baseline?'exact-HEAD-baseline':'current-source',policy,policyOwnerSHA256:sha(bytes),publicNativeSHA256:sha(fs.readFileSync(path.join(sourceRoot,'frontend/public/reference-editors/opencut-classic/native/native.js'))),canonicalNativeSHA256:sha(fs.readFileSync(path.join(sourceRoot,'reference-editors/opencut-classic/native/native.js'))),sourceClip:{bytes:clip.length,sha256:sha(clip)},serviceBinding:bindingPath,serviceOrigin:binding.baseURL,isolatedProxy:true,officialReleaseServer:false});
 server=http.createServer((req,res)=>{
  const url=new URL(req.url!,'http://127.0.0.1');netAudit.push({method:req.method!,path:url.pathname});
  res.setHeader('Content-Security-Policy',policy);res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET'){res.writeHead(405).end();return;}
  if(url.pathname==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><head><link rel="stylesheet" href="/reference-editors/opencut-classic/native/native.css"><style>body{margin:0;background:#f8f9fc}#native{height:800px;position:relative}#probe-results{max-height:90px;overflow:auto}#portals{position:absolute;inset:0;pointer-events:none}</style></head><body><pre id="probe-results">running</pre><div id="native"></div><div id="portals"></div><script type="module" src="/probe.js"></script></body></html>');return;}
  if(url.pathname==='/probe.js'){res.setHeader('Content-Type','text/javascript');res.end(probeScript());return;}
  if(url.pathname==='/clip.mp4'){res.setHeader('Content-Type','video/mp4');res.end(clip);return;}
  if(url.pathname==='/public-preview.html'){res.setHeader('Content-Type','text/html');res.end(previewHtml.replaceAll(binding.baseURL,origin));return;}
  if(url.pathname.startsWith('/reference-editors/opencut-classic/native/')&&!url.pathname.includes('..')){
   const file=path.join(sourceRoot,'frontend/public',url.pathname);if(!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404).end();return;}
   const type=file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.jpg')?'image/jpeg':'application/octet-stream';res.setHeader('Content-Type',type);fs.createReadStream(file).pipe(res);return;
  }
  // Read-only same-origin relay for fresh owned signed media. Never proxies mutations.
  if(url.pathname.startsWith('/api/')&&previewHtml){
   const upstream=http.get(binding.baseURL+url.pathname+url.search,{headers:req.headers.range?{range:req.headers.range}:{}},response=>{res.statusCode=response.statusCode!;for(const k of ['content-type','content-length','accept-ranges','content-range'])if(response.headers[k])res.setHeader(k,response.headers[k]!);response.pipe(res);});
   upstream.on('error',()=>{res.writeHead(502).end();});return;
  }
  res.writeHead(404).end();
 });
 await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});origin='http://127.0.0.1:'+(server.address() as any).port;save('server',{pid:process.pid,origin,owner,header:policy});
});
test.afterAll(async({browser}:any)=>{
 await browser.close();
 if(server){server.closeIdleConnections();await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
 save('closed',{at:new Date().toISOString(),pid:process.pid,browserConnected:browser.isConnected(),serverListening:server?.listening??false,serverClosed:true,ownedRoot,temporaryMediaPreserved:true,appStopped:false,serviceOwnedByRoot:true,networkRequests:netAudit});
});
test('T1295 release CSP page-origin WASM42 + JS eval/Function禁用 + 真实native预览导出',async({page,browser}:any,testInfo:any)=>{
 const failures:string[]=[];page.on('pageerror',(e:Error)=>failures.push(e.message));
 page.setDefaultTimeout(budget);page.setDefaultNavigationTimeout(budget);
 await page.context().route('**/*',async(route:any)=>{const u=new URL(route.request().url());if(['data:','blob:','about:'].includes(u.protocol)||u.origin===origin)return route.continue();return route.abort('blockedbyclient');});
 const response=await page.goto(origin,{waitUntil:'domcontentloaded'});expect(response.headers()['content-security-policy']).toBe(policy);
 await page.waitForFunction(()=>Boolean((window as any).t1295ProbeDone),undefined,{timeout:budget});
 const probe=await page.evaluate(()=>(window as any).t1295Probe);save('page-probe',probe);
 expect(probe.eval).toMatchObject({blocked:true,name:'EvalError'});expect(probe.Function).toMatchObject({blocked:true,name:'EvalError'});
 await page.screenshot({path:path.join(evidenceRoot,'csp-probe.png'),fullPage:true,timeout:budget});
 expect(probe.wasm,'exact current/baseline HTTP page script result, never CDP eval').toEqual({ok:true,answer:42});
 await page.waitForFunction(()=>Boolean((window as any).t1295NativeReady),undefined,{timeout:600_000});
 const native=await page.evaluate(()=>(window as any).t1295Probe.native);save('native-load',native);expect(native?.ok).toBe(true);expect(native.loaded.documentVersion).toBe(31);
 const mediaEnvironment=await page.evaluate(async()=>{const v=document.createElement('video');v.src='/clip.mp4';v.muted=true;await new Promise<void>((ok,bad)=>{v.onloadeddata=()=>ok();v.onerror=()=>bad(Error('source video decode failed'));});v.currentTime=0.5;await new Promise<void>(ok=>{v.onseeked=()=>ok();});const c=document.createElement('canvas');c.width=640;c.height=360;const ctx=c.getContext('2d')!;ctx.drawImage(v,0,0);const data=ctx.getImageData(0,0,640,360).data;let nonDark=0;for(let i=0;i<data.length;i+=4)if(Math.max(data[i],data[i+1],data[i+2])>40)nonDark++;const decoder=await VideoDecoder.isConfigSupported({codec:'avc1.42C01E',codedWidth:640,codedHeight:360});const adapter=await (navigator as any).gpu?.requestAdapter();return {htmlVideo:{width:v.videoWidth,height:v.videoHeight,nonDarkFraction:nonDark/(640*360)},videoDecoder:{supported:decoder.supported},gpu:adapter?{available:true,info:adapter.info}:null};});save('browser-media-environment',mediaEnvironment);expect(mediaEnvironment.htmlVideo.nonDarkFraction).toBeGreaterThan(0.15);
 const cdp=await browser.newBrowserCDPSession();const gpu=await cdp.send('SystemInfo.getInfo');save('browser-gpu',{devices:gpu.gpu.devices,featureStatus:gpu.gpu.featureStatus,glRenderer:gpu.gpu.auxAttributes?.glRenderer});save('browser-processes',await cdp.send('SystemInfo.getProcessInfo'));await cdp.detach();
 await expect(page.locator('canvas').first()).toBeVisible({timeout:budget});
 await page.screenshot({path:path.join(evidenceRoot,'native-preview.png'),fullPage:true,timeout:budget});
 // The actual module handle executes its public export operation; no model or Worker task.
 const exported=await page.evaluate(async()=>{const value=await (window as any).t1295Native.request('export',{format:'mp4'});const a=document.createElement('a');a.id='native-download';a.href=URL.createObjectURL(value.blob);a.download=value.fileName;a.textContent='下载本轮原生导出';document.body.append(a);return {name:value.fileName,bytes:value.blob.size,type:value.blob.type,documentVersion:value.document?.version};});save('native-export',exported);expect(exported.bytes).toBeGreaterThan(0);
 const downloading=page.waitForEvent('download',{timeout:600_000});await page.locator('#native-download').click();const download=await downloading;const file=path.join(evidenceRoot,'native-export.mp4');await download.saveAs(file);
 inspectMedia(file,'native-export',true);save('native-errors',{pageErrors:failures});
 await page.evaluate(async()=>{await (window as any).t1295Native.dispose();(window as any).t1295Controller.abort();});
});
function inspectMedia(file:string,label:string,audio:boolean){
 const decoded=JSON.parse(execFileSync('ffprobe',['-v','error','-show_streams','-show_format','-of','json',file],{encoding:'utf8',timeout:budget}));save(label+'-ffprobe',decoded);
 const video=decoded.streams.find((s:any)=>s.codec_type==='video'),sound=decoded.streams.find((s:any)=>s.codec_type==='audio');assert(video);assert.equal(video.width,640);assert.equal(video.height,360);assert(Math.abs(Number(video.duration)-2)<0.09);assert.equal(Boolean(sound),audio);if(sound)assert(Math.abs(Number(sound.duration)-2)<0.15);
 execFileSync('ffmpeg',['-v','error','-i',file,'-f','null','-'],{timeout:budget,maxBuffer:16*1024*1024});execFileSync('ffmpeg',['-v','error','-ss','0.5','-i',file,'-frames:v','1','-y',path.join(evidenceRoot,label+'-frame.png')],{timeout:budget});
 const rgb=execFileSync('ffmpeg',['-v','error','-ss','0.5','-i',file,'-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','-'],{timeout:budget,maxBuffer:16*1024*1024});let nonDark=0;for(let i=0;i<rgb.length;i+=3)if(Math.max(rgb[i],rgb[i+1],rgb[i+2])>40)nonDark++;save(label+'-picture',{nonDarkFraction:nonDark/(rgb.length/3),rgbSHA256:sha(rgb)});assert(nonDark/(rgb.length/3)>0.15,'the known testsrc must produce actual non-black picture');
 const pcm=execFileSync('ffmpeg',['-v','error','-i',file,'-vn','-f','f32le','-ac','1','-ar','48000','-'],{timeout:budget,maxBuffer:16*1024*1024});let energy=0;for(let i=0;i+4<=pcm.length;i+=4)energy+=pcm.readFloatLE(i)**2;assert(Math.sqrt(energy/(pcm.length/4))>0.005,'real non-silent audio');save(label+'-artifact',{bytes:fs.statSync(file).size,sha256:sha(fs.readFileSync(file)),audioRms:Math.sqrt(energy/(pcm.length/4)),decoded:true});
}
test('T1295 真实owned公共上传-原片准备-保存-预览-制作-采纳-下载音画闭环',async({page}:any)=>{
 test.skip(process.env.T1295_POLICY_MODE==='baseline','baseline only demonstrates original CSP rejection; never starts public writes');
 page.setDefaultTimeout(budget);page.setDefaultNavigationTimeout(budget);
 let groupId:string|undefined;
 async function rpc(label:string,id:string,input:any,write=false):Promise<any>{
  assert.equal(publicState.pending,null,'unknown original mutation retained; never resend');
  if(write){publicState.pending={label,id,input,at:new Date().toISOString()};checkpoint();}
  const r=await page.request.post(binding.baseURL+'/api/v1/dispatch',{timeout:900_000,headers:groupId?{'x-group-id':groupId}:{},data:{id,input}});const body=await r.json();save('public-'+label,{http:r.status(),...body});assert(r.ok(),id+' HTTP '+r.status()+' '+JSON.stringify(body.error));
  if(write){publicState.done[label]=body.data;publicState.pending=null;checkpoint();}return body.data;
 }
 const group=await rpc('group','accountGroups.create',{body:{name:'T1295有声视频隔离-'+randomUUID(),idempotencyKey:randomUUID()}},true);groupId=group.id;
 const project=await rpc('project','projects.create',{body:{title:'T1295 2秒音画验收',brief:'仅自生成素材，无模型调用',contentType:'video'}},true);
 const output=await rpc('output','projects.outputs.create',{params:{projectId:project.id},body:{title:'T1295原片',contentType:'video',clientRequestId:randomUUID()}},true);const params={outputId:output.id};
 const upload=await rpc('upload','assets.uploads.create',{body:{assetType:'video',mimeType:'video/mp4',fileSize:clip.length,projectId:project.id,fileName:'t1295-source.mp4'}},true);
 publicState.pending={label:'put-bytes',uploadId:upload.uploadId};checkpoint();const put=await page.request.put(new URL(upload.uploadUrl,binding.baseURL).href,{timeout:budget,headers:{'content-type':'video/mp4'},data:clip});save('public-put',{http:put.status()});assert(put.ok());publicState.pending=null;checkpoint();
 const asset=await rpc('asset','assets.uploads.complete',{params:{uploadId:upload.uploadId},body:{name:'T1295自生成有声clip'}},true);
 await rpc('link','materialLinks.create',{body:{projectId:project.id,contentOutputId:output.id,entityType:'asset',entityId:asset.id,role:'reference',stage:'production'}},true);
 const prepared=await rpc('prepare','outputs.production.editor.sources.prepare',{params,body:{assetId:asset.id,assetFileId:asset.currentFileId,requestId:randomUUID()}},true);
 let source:any;await expect.poll(async()=>{source=await rpc('source','outputs.production.editor.sources.get',{params:{...params,requestId:prepared.requestId}});return ['succeeded','failed','cancelled'].includes(source.status);},{timeout:600_000,intervals:[1000,2000,5000]}).toBe(true);assert.equal(source.status,'succeeded');assert.equal(source.probe.hasAudio,true);assert.equal(source.probe.fileDigest,sha(clip));
 // V1 public render is an existing supported legitimate source-only family, not a fake native schema.
 const plan={editorVersion:1,renderProps:{meta:{title:'T1295有声原片'},talkingHead:{file:asset.id,durationSec:2,hasAudio:true},scenes:[{id:'t1295-original',title:'原片',label:'原片',startSec:0,endSec:2,cards:[]}],captions:[],broll:[],delivery:{width:640,height:360,fps:24}}};
 await rpc('save','outputs.production.editor.save',{params,body:{expectedRevision:0,requestId:randomUUID(),source:'manual',plan}},true);
 const before=await rpc('before','outputs.production.editor.get',{params});assert.equal(before.revision,1);
 const preview=await rpc('preview','outputs.production.editor.preview',{params,body:{expectedRevision:1,requestId:randomUUID(),plan:before.plan}});previewHtml=preview.html;fs.writeFileSync(path.join(evidenceRoot,'public-preview.html'),preview.html,{mode:0o600});
 await page.context().route('**/*',async(route:any)=>{const u=new URL(route.request().url());if(['blob:','data:','about:'].includes(u.protocol)||u.origin===origin||u.href==='https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js')return route.continue();return route.abort('blockedbyclient');});
 const response=await page.goto(origin+'/public-preview.html',{waitUntil:'load'});expect(response.headers()['content-security-policy']).toBe(policy);
 await page.waitForFunction(()=>{const v=document.querySelector('video');return v&&v.readyState>=2&&v.videoWidth>0;},undefined,{timeout:budget});
 const video=page.locator('video').first();await video.evaluate(async(v:HTMLVideoElement)=>{v.muted=true;await v.play();});await page.waitForFunction(()=>document.querySelector('video')!.currentTime>0.1,undefined,{timeout:budget});save('public-preview-geometry',await video.evaluate((v:HTMLVideoElement)=>({width:v.videoWidth,height:v.videoHeight,time:v.currentTime,duration:v.duration})));await page.screenshot({path:path.join(evidenceRoot,'public-preview.png'),fullPage:true,timeout:budget});
 const requested=await rpc('render','outputs.production.editor.render',{params,body:{revision:1,requestId:randomUUID()}},true);assert(requested.taskId);save('public-original-task',{groupId,projectId:project.id,outputId:output.id,requestId:requested.requestId,taskId:requested.taskId,attemptId:requested.attemptId});
 let task:any;await expect.poll(async()=>{task=await rpc('task','ai.tasks.get',{params:{taskId:requested.taskId}});return task.status==='awaiting_confirmation'||task.status==='succeeded'||stopStates.includes(task.runtimeStatus??task.status);},{timeout:1_800_000,intervals:[1000,2000,5000]}).toBe(true);assert.equal(task.status,'awaiting_confirmation','original task stopped or unknown; do not resubmit');
 const execution=await rpc('execution','execution.tasks.get',{params:{taskId:requested.taskId}});assert.equal(execution.status,'awaiting_confirmation');
 const confirmed=await rpc('confirm','execution.tasks.confirm',{params:{taskId:requested.taskId}},true);assert.equal(confirmed.status,'succeeded');assert.equal(confirmed.adoptedAssetIds.length,1);
 const link=await rpc('download','assets.downloadUrl',{params:{assetId:confirmed.adoptedAssetIds[0]}});const download=await page.request.get(new URL(link.url,binding.baseURL).href,{timeout:budget});assert(download.ok());const file=path.join(evidenceRoot,'public-export.mp4');fs.writeFileSync(file,await download.body(),{mode:0o600});inspectMedia(file,'public-export',true);
 assert.deepEqual(await rpc('after','outputs.production.editor.get',{params}),before);save('public-result',{status:'PASS_PUBLIC_PREVIEW_RENDER_CONFIRM_DECODE',groupId,projectId:project.id,outputId:output.id,taskId:requested.taskId,requestId:requested.requestId,attemptId:requested.attemptId,planUnchanged:true,models:0,funds:0,originalUnknownReplayed:false});
});

test('T1295 V2真实主轨来源采用-精确文件编译-公共预览制作采纳下载音画',async({page}:any)=>{
 test.skip(process.env.T1295_POLICY_MODE==='baseline','baseline only demonstrates original CSP rejection; never starts public writes');
 page.setDefaultTimeout(budget);page.setDefaultNavigationTimeout(budget);
 const v2State:{pending:unknown;done:Record<string,any>}={pending:null,done:{}};const v2Checkpoint=()=>save('v2-state',v2State);
 let groupId:string|undefined;
 async function rpc(label:string,id:string,input:any,write=false):Promise<any>{
  assert.equal(v2State.pending,null,'unknown original mutation retained; never resend');
  if(write){v2State.pending={label,id,input,at:new Date().toISOString()};v2Checkpoint();}
  const r=await page.request.post(binding.baseURL+'/api/v1/dispatch',{timeout:900_000,headers:groupId?{'x-group-id':groupId}:{},data:{id,input}});const body=await r.json();save('v2-public-'+label,{http:r.status(),...body});assert(r.ok(),id+' HTTP '+r.status()+' '+JSON.stringify(body.error));
  if(write){v2State.done[label]=body.data;v2State.pending=null;v2Checkpoint();}return body.data;
 }
 const group=await rpc('group','accountGroups.create',{body:{name:'T1295-V2有声视频隔离-'+randomUUID(),idempotencyKey:randomUUID()}},true);groupId=group.id;
 const project=await rpc('project','projects.create',{body:{title:'T1295 2秒音画验收',brief:'仅自生成素材，无模型调用',contentType:'video'}},true);
 const output=await rpc('output','projects.outputs.create',{params:{projectId:project.id},body:{title:'T1295-V2原片',contentType:'video',clientRequestId:randomUUID()}},true);const params={outputId:output.id};
 const upload=await rpc('upload','assets.uploads.create',{body:{assetType:'video',mimeType:'video/mp4',fileSize:clip.length,projectId:project.id,fileName:'t1295-source.mp4'}},true);
 v2State.pending={label:'put-bytes',uploadId:upload.uploadId};v2Checkpoint();const put=await page.request.put(new URL(upload.uploadUrl,binding.baseURL).href,{timeout:budget,headers:{'content-type':'video/mp4'},data:clip});save('v2-public-put',{http:put.status()});assert(put.ok());v2State.pending=null;v2Checkpoint();
 const asset=await rpc('asset','assets.uploads.complete',{params:{uploadId:upload.uploadId},body:{name:'T1295自生成有声clip'}},true);
 await rpc('link','materialLinks.create',{body:{projectId:project.id,contentOutputId:output.id,entityType:'asset',entityId:asset.id,role:'reference',stage:'production'}},true);
 const prepared=await rpc('prepare','outputs.production.editor.sources.prepare',{params,body:{assetId:asset.id,assetFileId:asset.currentFileId,requestId:randomUUID()}},true);
 let source:any;await expect.poll(async()=>{source=await rpc('source','outputs.production.editor.sources.get',{params:{...params,requestId:prepared.requestId}});return ['succeeded','failed','cancelled'].includes(source.status);},{timeout:600_000,intervals:[1000,2000,5000]}).toBe(true);assert.equal(source.status,'succeeded');assert.equal(source.probe.hasAudio,true);assert.equal(source.probe.fileDigest,sha(clip));
 // V2主轨必须由真实原探针采用产生，不从测试直接伪造source/probe证明。
 const adopted=await rpc('adopt-source','outputs.production.editor.sources.adopt',{params,body:{sourceRequestId:prepared.requestId,expectedRevision:0,requestId:randomUUID(),addWholeClip:true}},true);
 assert.equal(adopted.plan.editorVersion,2);assert.equal(adopted.revision,1);
 assert.equal(adopted.plan.mainTrack.sources.length,1);assert.equal(adopted.plan.mainTrack.clips.length,1);
 assert.equal(adopted.plan.mainTrack.sources[0].fileDigest,source.probe.fileDigest);assert.equal(adopted.plan.mainTrack.sources[0].assetFileId,asset.currentFileId);
 const plan=structuredClone(adopted.plan);plan.overlayDraft.delivery={width:640,height:360,fps:24};plan.overlayDraft.meta.title='T1295 V2真实原片';
 await rpc('save','outputs.production.editor.save',{params,body:{expectedRevision:adopted.revision,requestId:randomUUID(),source:'manual',plan}},true);
 const before=await rpc('before','outputs.production.editor.get',{params});assert.equal(before.revision,2);assert.equal(before.plan.editorVersion,2);
 const preview=await rpc('preview','outputs.production.editor.preview',{params,body:{expectedRevision:before.revision,requestId:randomUUID(),plan:before.plan}});previewHtml=preview.html;fs.writeFileSync(path.join(evidenceRoot,'v2-public-preview.html'),preview.html,{mode:0o600});
 await page.context().route('**/*',async(route:any)=>{const u=new URL(route.request().url());if(['blob:','data:','about:'].includes(u.protocol)||u.origin===origin||u.href==='https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js')return route.continue();return route.abort('blockedbyclient');});
 const response=await page.goto(origin+'/public-preview.html',{waitUntil:'load'});expect(response.headers()['content-security-policy']).toBe(policy);
 await page.waitForFunction(()=>{const v=document.querySelector('video');return v&&v.readyState>=2&&v.videoWidth>0;},undefined,{timeout:budget});
 const video=page.locator('video').first();await video.evaluate(async(v:HTMLVideoElement)=>{v.muted=true;await v.play();});await page.waitForFunction(()=>document.querySelector('video')!.currentTime>0.1,undefined,{timeout:budget});save('v2-public-preview-geometry',await video.evaluate((v:HTMLVideoElement)=>({width:v.videoWidth,height:v.videoHeight,time:v.currentTime,duration:v.duration})));await page.screenshot({path:path.join(evidenceRoot,'v2-public-preview.png'),fullPage:true,timeout:budget});
 const requested=await rpc('render','outputs.production.editor.render',{params,body:{revision:before.revision,requestId:randomUUID()}},true);assert(requested.taskId);assert.equal(requested.spec.taskType,'video.render');const headClips=requested.spec.params.props.talkingHead.clips;assert.equal(headClips.length,1);const exact=requested.spec.inputs.find((value:any)=>value.assetId===asset.id&&value.assetFileId===asset.currentFileId);assert(exact);assert.equal(exact.fileDigest,source.probe.fileDigest);assert.equal(headClips[0].file,exact.mountAs);assert.equal(headClips[0].startSec,0);assert.equal(headClips[0].endSec,2);assert.equal(headClips[0].sourceInSec,0);assert.equal(headClips[0].hasAudio,true);save('v2-public-original-task',{groupId,projectId:project.id,outputId:output.id,requestId:requested.requestId,taskId:requested.taskId,attemptId:requested.attemptId});
 let task:any;await expect.poll(async()=>{task=await rpc('task','ai.tasks.get',{params:{taskId:requested.taskId}});return task.status==='awaiting_confirmation'||task.status==='succeeded'||stopStates.includes(task.runtimeStatus??task.status);},{timeout:1_800_000,intervals:[1000,2000,5000]}).toBe(true);assert.equal(task.status,'awaiting_confirmation','original task stopped or unknown; do not resubmit');
 const execution=await rpc('execution','execution.tasks.get',{params:{taskId:requested.taskId}});assert.equal(execution.status,'awaiting_confirmation');
 const confirmed=await rpc('confirm','execution.tasks.confirm',{params:{taskId:requested.taskId}},true);assert.equal(confirmed.status,'succeeded');assert.equal(confirmed.adoptedAssetIds.length,1);
 const link=await rpc('download','assets.downloadUrl',{params:{assetId:confirmed.adoptedAssetIds[0]}});const download=await page.request.get(new URL(link.url,binding.baseURL).href,{timeout:budget});assert(download.ok());const file=path.join(evidenceRoot,'v2-public-export.mp4');fs.writeFileSync(file,await download.body(),{mode:0o600});inspectMedia(file,'v2-public-export',true);
 assert.deepEqual(await rpc('after','outputs.production.editor.get',{params}),before);save('v2-public-result',{status:'PASS_PUBLIC_V2_PREVIEW_RENDER_CONFIRM_DECODE',groupId,projectId:project.id,outputId:output.id,taskId:requested.taskId,requestId:requested.requestId,attemptId:requested.attemptId,planUnchanged:true,models:0,funds:0,originalUnknownReplayed:false});
});

test('T1295 V3真实工作台导出-同snapshot保存-原公开采用成片与下载',async({page}:any)=>{
 test.skip(process.env.T1295_POLICY_MODE==='baseline','baseline does not create public business objects');
 page.setDefaultTimeout(budget);page.setDefaultNavigationTimeout(300_000);
 const nativeObservationMs=1_920_000,adoptionObservationMs=10_920_000;
 const state:{pending:unknown;done:Record<string,any>;ui:unknown[]}={pending:null,done:{},ui:[]};const checkpointV3=()=>save('v3-state',state);
 let groupId:string|undefined;
 async function rpc(label:string,id:string,input:any,write=false):Promise<any>{
  assert.equal(state.pending,null,'unknown original mutation retained; never resend');
  if(write){state.pending={label,id,input,at:new Date().toISOString()};checkpointV3();}
  const r=await page.request.post(binding.baseURL+'/api/v1/dispatch',{timeout:900_000,headers:groupId?{'x-group-id':groupId}:{},data:{id,input}});const body=await r.json();save('v3-'+label,{http:r.status(),...body});assert(r.ok(),id+' HTTP '+r.status()+' '+JSON.stringify(body.error));
  if(write){state.done[label]=body.data;state.pending=null;checkpointV3();}return body.data;
 }
 const group=await rpc('group','accountGroups.create',{body:{name:'T1295-V3原生UI隔离-'+randomUUID(),idempotencyKey:randomUUID()}},true);groupId=group.id;
 const project=await rpc('project','projects.create',{body:{title:'T1295 V3原生工作台',brief:'本轮自生成clip；不调用模型或原任务',contentType:'video'}},true);
 const output=await rpc('output','projects.outputs.create',{params:{projectId:project.id},body:{title:'T1295 V3独占成片',contentType:'video',clientRequestId:randomUUID()}},true);const params={outputId:output.id};
 const upload=await rpc('upload','assets.uploads.create',{body:{assetType:'video',mimeType:'video/mp4',fileSize:clip.length,projectId:project.id,fileName:'t1295-source.mp4'}},true);
 state.pending={label:'put-original',uploadId:upload.uploadId};checkpointV3();const put=await page.request.put(new URL(upload.uploadUrl,binding.baseURL).href,{timeout:budget,headers:{'content-type':'video/mp4'},data:clip});assert(put.ok());state.pending=null;checkpointV3();
 const source=await rpc('source','assets.uploads.complete',{params:{uploadId:upload.uploadId},body:{name:'T1295 V3真实原片'}},true);
 await rpc('link','materialLinks.create',{body:{projectId:project.id,contentOutputId:output.id,entityType:'asset',entityId:source.id,role:'reference',stage:'production'}},true);
 const mediaId=randomUUID(),nativeDocument=documentFor(output.id,mediaId,clip.length);
 // Exact current contract NATIVE_SOURCE_REVISION, bound in this candidate's source manifest.
 const plan={editorVersion:3,referenceEditor:{editor:'opencut-classic',revision:'cf5e79e919144200294fb9fed22a222592a0aeea',nativeDocument,mediaRefs:[{mediaId,assetId:source.id,assetFileId:source.currentFileId}]}};
 const seeded=await rpc('seed','outputs.production.editor.save',{params,body:{expectedRevision:0,requestId:randomUUID(),source:'manual',plan}},true);assert.equal(seeded.revision,1);assert.equal(seeded.plan.editorVersion,3);
 const initialOutput=await rpc('initial-output','outputs.get',{params});assert.equal(initialOutput.primaryAssetId,null);
 await page.context().addCookies([{name:'creatoros_current_group',value:encodeURIComponent(groupId!),url:binding.baseURL}]);
 await page.addInitScript((id:string)=>{localStorage.setItem('creatoros:current-group',id);localStorage.removeItem('creatoros:current-account');localStorage.setItem('creatoros:onboarding:hidden','1');},groupId);
 const denied:string[]=[],mutations:any[]=[],responses:any[]=[],responseReads:Promise<unknown>[]=[];let exportClicks=0,adoptClicks=0;
 let rejectUiFailure!:(error:Error)=>void;const uiFailure=new Promise<never>((_resolve,reject)=>{rejectUiFailure=reject;});void uiFailure.catch(()=>undefined);const waitUi=<T,>(promise:Promise<T>):Promise<T>=>Promise.race([promise,uiFailure]);
 const operation=(r:any)=>{if(new URL(r.url()).pathname!=='/api/v1/dispatch'||r.method()!=='POST')return null;try{return r.postDataJSON();}catch{return null;}};
 await page.context().route('**/*',async(route:any)=>{const req=route.request(),u=new URL(req.url()),op=operation(req);if(['blob:','data:','about:'].includes(u.protocol))return route.continue();const forbidden=u.origin!==binding.baseURL||u.pathname.startsWith('/api/chat')&&req.method()==='POST'||u.pathname.startsWith('/api/v1/local/ai-credits/')||['settings.models.test','outputs.production.editor.transcripts.create','outputs.production.editor.rough-cut.create','outputs.production.editor.script.propose','ai.tasks.create'].includes(op?.id);if(forbidden){denied.push(req.method()+' '+u.origin+u.pathname+' '+(op?.id??''));return route.abort('blockedbyclient');}return route.continue();});
 page.on('request',(request:any)=>{const op=operation(request);if(op&&['outputs.production.editor.save','assets.uploads.create','assets.uploads.complete','materialLinks.create','outputs.production.put','productions.exports.create','exports.complete','outputs.production.editor.preview','outputs.production.editor.render','execution.tasks.confirm'].includes(op.id)){mutations.push(op);state.ui.push({kind:'request',id:op.id,input:op.input,at:new Date().toISOString()});checkpointV3();}});
 page.on('response',(response:any)=>{const op=operation(response.request());if(!op||!mutations.some(row=>row===op||JSON.stringify(row)===JSON.stringify(op)))return;const read=response.json().then((body:any)=>{responses.push({id:op.id,input:op.input,http:response.status(),body});state.ui.push({kind:'response',id:op.id,http:response.status(),data:body.data,error:body.error,at:new Date().toISOString()});checkpointV3();if(!response.ok())rejectUiFailure(Error(`原UI操作已拒绝 ${op.id} HTTP ${response.status()}`));}).catch((error:Error)=>{rejectUiFailure(error);return {responseReadFailed:true};});responseReads.push(read);});
 try{
  await page.goto(`${binding.baseURL}/projects/${project.id}/production?outputId=${output.id}`,{waitUntil:'domcontentloaded'});
  const exportButton=page.getByRole('button',{name:'导出当前场景 MP4',exact:true});await expect(exportButton).toBeEnabled({timeout:600_000});
  await expect(page.locator('[data-native-root="opencut"] canvas').first()).toBeVisible({timeout:budget});await page.screenshot({path:path.join(evidenceRoot,'v3-native-workbench.png'),fullPage:true,timeout:budget});
  const saveReceipt=page.waitForResponse((r:any)=>operation(r.request())?.id==='outputs.production.editor.save',{timeout:nativeObservationMs});
  const download=page.waitForEvent('download',{timeout:nativeObservationMs});state.pending={kind:'ui-export-save',groupId,projectId:project.id,outputId:output.id};checkpointV3();exportClicks++;await exportButton.click();
  const accepted=await waitUi<any>(saveReceipt);assert(accepted.ok());const submitted=operation(accepted.request()).input.body;save('v3-original-export-save',{body:submitted,http:accepted.status(),response:await accepted.json()});assert.equal(submitted.expectedRevision,seeded.revision);assert.equal(submitted.plan.editorVersion,3);assert.deepEqual(submitted.plan.referenceEditor.mediaRefs,plan.referenceEditor.mediaRefs);assert.equal(submitted.plan.referenceEditor.nativeDocument.metadata.id,output.id);state.pending={kind:'ui-export-download-verify',requestId:submitted.requestId,outputId:output.id};checkpointV3();
  const local=path.join(evidenceRoot,'v3-native-ui-export.mp4');await(await waitUi<any>(download)).saveAs(local);inspectMedia(local,'v3-native-ui-export',true);state.pending=null;checkpointV3();
  const saved=await rpc('saved','outputs.production.editor.get',{params});assert.equal(saved.revision,2);assert.deepEqual(saved.plan.referenceEditor.nativeDocument,submitted.plan.referenceEditor.nativeDocument);
  const completed=page.waitForResponse((r:any)=>operation(r.request())?.id==='exports.complete',{timeout:adoptionObservationMs});
  const becameReady=page.waitForResponse((r:any)=>{const op=operation(r.request());return op?.id==='outputs.production.put'&&op.input.params.outputId===output.id&&op.input.body.status==='ready';},{timeout:adoptionObservationMs});
  const adoptButton=page.getByRole('button',{name:'采用为作品成片',exact:true});await expect(adoptButton).toBeEnabled();state.pending={kind:'ui-adopt-export',groupId,projectId:project.id,outputId:output.id,originalLocalSHA256:sha(fs.readFileSync(local))};checkpointV3();adoptClicks++;await adoptButton.click();
  const completeResponse=await waitUi<any>(completed);assert(completeResponse.ok());const completeBody=await completeResponse.json();save('v3-original-complete',{input:operation(completeResponse.request()).input,http:completeResponse.status(),response:completeBody});assert((await waitUi<any>(becameReady)).ok());state.pending=null;checkpointV3();
  await Promise.all(responseReads);save('v3-ui-mutations',{exportClicks,adoptClicks,denied,mutations,responses});assert.equal(exportClicks,1);assert.equal(adoptClicks,1);assert.deepEqual(denied,[]);
  assert.equal(mutations.filter(row=>row.id==='outputs.production.editor.save').length,1);assert.equal(mutations.filter(row=>row.id==='productions.exports.create').length,1);assert.equal(mutations.filter(row=>row.id==='exports.complete').length,1);assert.equal(mutations.filter(row=>['outputs.production.editor.preview','outputs.production.editor.render','execution.tasks.confirm'].includes(row.id)).length,0);
  assert.deepEqual(mutations.filter(row=>row.id==='outputs.production.put').map(row=>row.input.body.status),['recording','editing','rendering','ready']);
  const production=await rpc('production-ready','outputs.production.get',{params});assert.equal(production.status,'ready');
  const finalOutput=await rpc('output-ready','outputs.get',{params}),finalId=finalOutput.primaryAssetId;assert(finalId);assert.equal(finalId,completeBody.data.resultAssetId);
  const link=await rpc('final-link','assets.downloadUrl',{params:{assetId:finalId}}),file=path.join(evidenceRoot,'v3-public-final.mp4'),fetched=await page.request.get(new URL(link.url,binding.baseURL).href,{timeout:budget});assert(fetched.ok());fs.writeFileSync(file,await fetched.body(),{mode:0o600});assert.equal(sha(fs.readFileSync(file)),sha(fs.readFileSync(local)));inspectMedia(file,'v3-public-final',true);
  assert.deepEqual(await rpc('editor-after-adoption','outputs.production.editor.get',{params}),saved);await page.screenshot({path:path.join(evidenceRoot,'v3-native-adopted-ready.png'),fullPage:true,timeout:budget});
  save('v3-result',{status:'PASS_V3_NATIVE_UI_EXPORT_SAVE_ADOPT_PUBLIC_FINAL',groupId,projectId:project.id,outputId:output.id,sourceAssetId:source.id,sourceAssetFileId:source.currentFileId,mediaId,saveRequestId:submitted.requestId,exportId:completeBody.data.id,finalAssetId:finalId,localAndRegisteredBytesEqual:true,exportClicks,adoptClicks,modelCallsByTest:0,funds:0,backendNativeRenderTask:'not-applicable-real-UI-does-not-create-one'});
 }finally{await Promise.allSettled(responseReads);save('v3-ui-observed-final',{exportClicks,adoptClicks,denied,mutations,responses,pending:state.pending});}
});


}
