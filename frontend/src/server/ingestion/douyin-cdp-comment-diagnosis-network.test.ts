// @vitest-environment node
import {expect,it} from 'vitest';
import {createServer} from 'node:https';
import {createServer as createProxy} from 'node:http';
import {connect} from 'node:net';
import {execFileSync} from 'node:child_process';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {chromium} from '@playwright/test';
import {createCommentDiagnosisHost} from './douyin-cdp-comment-diagnosis';

it('本地TLS真实传输：菜单自然XHR结构/动态键/聚合/迟到归属，零探针；不靠fulfill伪造字节数',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'diagnose-tls-'));
 execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',join(dir,'key.pem'),'-out',join(dir,'cert.pem'),'-days','1','-subj','/CN=creator.douyin.com'],{stdio:'ignore'});
 const paths:string[]=[];let releaseLate:()=>void=()=>{};
 const body=JSON.stringify({data:{comments:[{cid:'PRIVATE_ID',aweme_id:'123',text:'PRIVATE_BODY',user:{nickname:'PRIVATE_NAME'},PRIVATE_DYNAMIC_KEY:1},{aweme_id:'456'},{text:'PRIVATE_BODY'}],has_more:0},PRIVATE_TOP_KEY:1});
 const server=createServer({key:await readFile(join(dir,'key.pem')),cert:await readFile(join(dir,'cert.pem'))},(req,res)=>{
  const path=new URL(req.url!,'https://creator.douyin.com').pathname;paths.push(path);
  if(path==='/creator-micro/home'){res.writeHead(200,{'content-type':'text/html; charset=utf-8'});res.end(`<title>本地TLS诊断</title><nav><a href="/creator-micro/interactive/comment" onclick="event.preventDefault();history.pushState({},'',this.href);fetch('/api/comments/list?item_id=123&cursor=0&PRIVATE_QUERY=PRIVATE_VALUE');fetch('/api/comments/list?item_id=123&cursor=0&PRIVATE_QUERY=PRIVATE_VALUE');fetch('/aweme/v1/web/comment/list?aweme_id=456');fetch('/api/item?item_id=123');fetch('/api/user');fetch('/api/info');fetch('/api/query');window.late=fetch('/api/search');">评论管理</a></nav><main><h1>主视图</h1><button aria-haspopup="listbox" aria-controls="works" onclick="document.getElementById('works').hidden=false;fetch('/api/release')">作品</button><div id="works" role="listbox" hidden><div role="option" data-aweme-id="123">目标</div></div></main>`);return;}
  if(path==='/api/release')releaseLate();
  if(path==='/api/search'){releaseLate=()=>{if(res.headersSent)return;res.writeHead(200,{'content-type':'application/json','content-length':Buffer.byteLength(body)});res.end(body);};return;}
  if(path==='/api/user'){res.writeHead(200,{'content-type':'text/plain'});res.end('PRIVATE_TEXT');return;}
  if(path==='/api/info'){res.writeHead(200,{'content-type':'application/json'});res.write(body);res.end();return;}
  if(path==='/api/query'){const large=JSON.stringify({text:'PRIVATE'.repeat(30_000)});res.writeHead(200,{'content-type':'application/json','content-length':Buffer.byteLength(large)});res.end(large);return;}
  res.writeHead(200,{'content-type':'application/json','content-length':Buffer.byteLength(body)});res.end(body);
 });
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const port=(server.address() as {port:number}).port;
 const destinations:string[]=[];let denied=0;
 const proxy=createProxy((_req,res)=>{res.writeHead(403);res.end();});
 proxy.on('connect',(req,socket,head)=>{if(req.url!=='creator.douyin.com:443'){denied++;socket.destroy();return;}destinations.push(`127.0.0.1:${port}`);const upstream=connect(port,'127.0.0.1',()=>{socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');if(head.length)upstream.write(head);socket.pipe(upstream);upstream.pipe(socket);});upstream.on('error',()=>socket.destroy());socket.on('error',()=>upstream.destroy());socket.on('close',()=>upstream.destroy());});
 await new Promise<void>(resolve=>proxy.listen(0,'127.0.0.1',resolve));
 await new Promise<void>((resolve,reject)=>{const socket=connect((proxy.address() as {port:number}).port,'127.0.0.1',()=>socket.write('CONNECT forbidden.invalid:443 HTTP/1.1\r\nHost: forbidden.invalid:443\r\n\r\n'));socket.on('close',()=>resolve());socket.on('error',reject);});expect(denied).toBe(1);expect(destinations).toEqual([]);
 const browser=await chromium.launch({headless:true,proxy:{server:`http://127.0.0.1:${(proxy.address() as {port:number}).port}`}});
 const context=await browser.newContext({ignoreHTTPSErrors:true,serviceWorkers:'block'});
 await context.route('**/*',route=>new URL(route.request().url()).origin==='https://creator.douyin.com'?route.continue():route.abort());
 const identity={userId:'u',accountId:'a',publicationId:'p',externalId:'123'};
 const host=createCommentDiagnosisHost({open:async()=>({newPage:()=>context.newPage(),close:()=>context.close()}),acquire:async()=>{},throttled:()=>{},settleMs:150});
 try{
 // 首先证明代理送达本机；绝不依赖DNS覆盖或公网回退。
 const proof=await context.newPage();await proof.goto('https://creator.douyin.com/creator-micro/home');expect(await proof.title()).toBe('本地TLS诊断');expect(paths).toContain('/creator-micro/home');await proof.close();paths.length=0;
  const start=await host.start(identity);const target=start.ui.nodes.find(node=>node.intent==='enter_comments');expect(target,JSON.stringify({start,paths,url:context.pages()[0]?.url()})).toBeDefined();
  const result=await host.step(identity,{action:'advance',diagnosisId:start.diagnosisId,expectedRevision:start.revision,observationId:start.ui.observationId!,intent:'enter_comments',targetRef:target!.targetRef!});
  const items=result.networkEvidence.items;const novel=items.find(item=>item.pathTemplate==='/api/comments/list')!;
  expect(novel).toMatchObject({responseCount:2,sampled:true,bodyStatus:'observed',requestTargetMatches:true,oldMatcher:false,queryKeys:['item_id','cursor'],unknownQueryKeys:1,rowTargetMatches:{matched:1,mismatched:1,unverified:1}});
  expect(novel.unknownShapeKeys).toBeGreaterThan(0);expect(novel.shape).toContainEqual({path:['data','comments'],type:'array',count:3});
  expect(items.find(item=>item.pathTemplate==='/aweme/v1/web/comment/list')).toMatchObject({oldMatcher:false,requestTargetMatches:false,bodyStatus:'observed'});
  expect(items.find(item=>item.pathTemplate==='/api/user')).toMatchObject({contentType:'other',bodyStatus:'unavailable'});
  expect(items.find(item=>item.pathTemplate==='/api/info')?.bodyStatus).toBe('unavailable');expect(items.find(item=>item.pathTemplate==='/api/query')?.bodyStatus).toBe('too_large');
  expect(result.networkEvidence.totalResponses).toBe(7);expect(JSON.stringify(result)).not.toContain('PRIVATE');
  const picker=result.ui.nodes.find(node=>node.intent==='open_work_picker')!;expect(picker).toBeDefined();
  const next=await host.step(identity,{action:'advance',diagnosisId:start.diagnosisId,expectedRevision:result.revision,observationId:result.ui.observationId!,intent:'open_work_picker',targetRef:picker.targetRef!});
  await context.pages()[0]!.evaluate(()=>Reflect.get(window,'late'));
  expect(next.networkEvidence.totalResponses).toBe(1);expect(next.networkEvidence.items.some(item=>item.pathTemplate==='/api/search')).toBe(false);
  const frozen=JSON.stringify(next.networkEvidence);
  const observed=await host.step(identity,{action:'observe',diagnosisId:start.diagnosisId,expectedRevision:next.revision});expect(JSON.stringify(observed.networkEvidence)).toBe(frozen);
  expect(paths.filter(path=>path!='/favicon.ico')).toHaveLength(10);expect(destinations.length).toBeGreaterThan(0);expect(new Set(destinations)).toEqual(new Set([`127.0.0.1:${port}`]));await writeFile(join(tmpdir(),'t1027-diagnose-isolation-proof.json'),JSON.stringify({proxyListen:'127.0.0.1',allowedConnect:'creator.douyin.com:443',unknownConnectDenied:denied,upstreamDestinations:[...new Set(destinations)],localTitleVerified:true,localPaths:paths,naturalRequests:paths.filter(path=>path!='/favicon.ico').length,bodyStatus:novel.bodyStatus,responseCount:novel.responseCount,lateResponseExcluded:!next.networkEvidence.items.some(item=>item.pathTemplate==='/api/search')},null,2));console.info('ISOLATION_PROOF: explicit loopback CONNECT proxy; unknown host rejected before any upstream; all upstream destinations=127.0.0.1:'+port+'; local title/hit verified before diagnosis; natural requests=10; no probes');
 }finally{releaseLate();await host.dispose();await browser.close();proxy.closeAllConnections();await new Promise<void>(resolve=>proxy.close(()=>resolve()));server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));await rm(dir,{recursive:true,force:true});}
},30_000);
