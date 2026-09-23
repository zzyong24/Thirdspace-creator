// @vitest-environment node
import {afterAll,beforeAll,expect,it,vi} from 'vitest';
import {createServer,type Server} from 'node:http';
import {createHash} from 'node:crypto';
import {chromium,type Browser} from '@playwright/test';
import {createDb,createCliInvocationService} from '@creatoros/backend';
import {createAnalyticsTransport,createTrafficService,createCommentDiagnosisService,type CommentDiagnosisReport} from '@creatoros/backend/modules/analytics';
import {createPublishingService} from '@creatoros/backend/modules/publishing';
import type {Transport} from '@creatoros/contract';
import {publications} from '../../../../backend/src/schema/publishing';
import {POST} from '../../app/api/v1/dispatch/route';
import {runCliCommand} from '../../../../mcp-server/src/cli';
import {createCommentDiagnosisHost} from './douyin-cdp-comment-diagnosis';
const shared=vi.hoisted(()=>({transport:null as Transport|null,gateway:null as ReturnType<typeof createCliInvocationService>|null}));
vi.mock('@/server/persistence-client',()=>({compositeTransport:{request:(...args:Parameters<Transport['request']>)=>shared.transport!.request(...args)},getCliInvocationService:async()=>shared.gateway}));
vi.mock('@/lib/request-context.server',()=>({resolveRequestContext:async(_token:unknown,accountId:string)=>({userId:'u',accountId,source:'user',requestId:'diagnose-public-cli'}),isAuthError:()=>false,isOwnershipError:()=>false}));
let browser:Browser,server:Server;
beforeAll(async()=>{browser=await chromium.launch({headless:true});server=createServer(async(req,res)=>{try{const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(Buffer.from(chunk));const response=await POST(new Request(`http://127.0.0.1${req.url}`,{method:'POST',headers:req.headers as Record<string,string>,body:Buffer.concat(chunks).toString()}));res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));}catch{res.writeHead(500);res.end('fixture failure');}});await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address() as {port:number};vi.stubEnv('CREATOROS_BASE_URL',`http://127.0.0.1:${address.port}`);vi.stubEnv('CREATOROS_CLI_ACCESS_TOKEN','diagnose-fixture');vi.stubEnv('CREATOROS_CLI_ACCESS_FILE','');vi.stubEnv('CREATOROS_CLI_ACTIVITY_FILE','');});
afterAll(async()=>{await browser.close();await new Promise<void>(resolve=>server.close(()=>resolve()));vi.unstubAllEnvs();});
const op='analytics.comments.diagnose';
async function call(body:unknown,key:string,account='a',impact=account){return await runCliCommand(['call',op,'--input',JSON.stringify({body}),'--account',account,'--apply','--idempotency-key',key,'--confirm-impact',impact,'--json']) as {data:CommentDiagnosisReport};}

it('真实runCliCommand→HTTP正式dispatch→SQL幂等账本→Chromium：同key只点一次、跨账号隔离、失效作品可关闭、进程后pending不重派',async()=>{
 const store=await createDb();let stamp='2026-09-22T04:00:00.000Z',sequence=0;
 const makeGateway=()=>createCliInvocationService({db:store.db,masterKey:Buffer.alloc(32,7),now:()=>stamp,nextId:prefix=>`${prefix}-${++sequence}`});
 shared.gateway=makeGateway();
 await store.db.insert(publications).values({id:'p',userId:'u',accountId:'a',externalId:'123',platform:'douyin',status:'published',contentOutputId:'out',accountReference:'account',createdAt:stamp,updatedAt:stamp});
 const publishing=createPublishingService({db:store.db,now:()=>stamp,nextId:()=>''});const traffic=createTrafficService(store.db,{now:()=>stamp,publishing});
 const pages:import('@playwright/test').Page[]=[];const open=vi.fn(async()=>{const context=await browser.newContext();await context.route('**/*',route=>route.fulfill({contentType:'text/html',body:'<title>fixture</title><nav><button>top1</button><button>top2</button><button>top3</button></nav><nav><a href="/creator-micro/interactive/comment" onclick="event.preventDefault();window.clicks=(window.clicks||0)+1;history.pushState({},\'\',this.href)">评论</a></nav><main><h1>受控页面</h1></main>'}));return {newPage:async()=>{const page=await context.newPage();pages.push(page);return page;},close:()=>context.close()};});
 const acquire=vi.fn(async()=>{});const host=createCommentDiagnosisHost({open,acquire,throttled:vi.fn(),settleMs:20});
 const service=createCommentDiagnosisService({host,assertPublication:traffic.assertPublication});shared.transport=createAnalyticsTransport(()=>({}) as never,undefined,undefined,service);
 try{
  await expect(call({action:'start',publicationId:'p'},'bad-impact','a','not-account')).rejects.toThrow();expect(open).not.toHaveBeenCalled();
  await expect(call({action:'start',publicationId:'p'},'foreign','other')).rejects.toThrow();expect(open).not.toHaveBeenCalled();
  let start=await call({action:'start',publicationId:'p'},'start');expect(start.data.ui.nodes.some(node=>node.intent==='enter_comments')).toBe(true);expect(start.data.ui.roots?.filter(root=>root.kind==='navigation')).toHaveLength(2);expect(start.data.ui.coverage?.discoveryComplete).toBe(true);
  const original=pages[0]!.evaluateHandle.bind(pages[0]!);
  const evaluation=vi.spyOn(pages[0]!,'evaluateHandle').mockImplementationOnce(()=>original(()=>{throw Error('SECRET_OBSERVATION');}));
  const observationInput={action:'observe',diagnosisId:start.data.diagnosisId,expectedRevision:start.data.revision};
  const failed=await call(observationInput,'observation-failed');expect(failed.data).toMatchObject({dispatched:true,ui:{observationFailure:'evaluation_failed'},allowedNext:[]});expect(JSON.stringify(failed)).not.toContain('SECRET');
  evaluation.mockRestore();expect(await call(observationInput,'observation-failed')).toEqual(failed);
  start=await call(observationInput,'observation-recovered');expect(start.data.ui.status).toBe('observed');expect(start.data.ui).not.toHaveProperty('observationFailure');expect(acquire).toHaveBeenCalledTimes(1);
  const node=start.data.ui.nodes.find(node=>node.intent==='enter_comments')!;
  const input={action:'advance',diagnosisId:start.data.diagnosisId,expectedRevision:start.data.revision,observationId:start.data.ui.observationId,intent:'enter_comments',targetRef:node.targetRef};
  const first=await call(input,'click');shared.gateway=makeGateway();expect(await call(input,'click')).toEqual(first);expect(await pages[0]!.evaluate(()=>Reflect.get(window,'clicks'))).toBe(1);expect(acquire).toHaveBeenCalledTimes(2);
  await expect(call({...input,targetRef:'different'},'click')).rejects.toThrow();expect(acquire).toHaveBeenCalledTimes(2);
  await store.db.delete(publications);
  expect((await call({action:'close',diagnosisId:start.data.diagnosisId},'close')).data.status).toBe('closed');expect(pages[0]!.isClosed()).toBe(true);
  // 同一个真实SQL库重建gateway，模拟已认领但无结算回执的进程中断。
  const pendingInput={body:{action:'start',publicationId:'p'}};
  const inputHash='sha256:'+createHash('sha256').update(JSON.stringify(pendingInput)).digest('hex');
  await shared.gateway!.begin({userId:'u',accountId:'a',requestId:'interrupted',source:'user'},{operation:op,effect:'external',clientId:'test-client',idempotencyKey:'interrupted',inputHash,targetRefs:['a','p']});
  stamp='2026-09-22T04:06:00.000Z';shared.gateway=makeGateway();
  await expect(call(pendingInput.body,'interrupted')).rejects.toMatchObject({status:409});const receipt=await shared.gateway!.begin({userId:'u',accountId:'a',requestId:'verify',source:'user'},{operation:op,effect:'external',clientId:'test-client',idempotencyKey:'interrupted',inputHash,targetRefs:['a','p']});expect(receipt).toMatchObject({kind:'receipt',receipt:{status:'outcome_unknown'}});expect(open).toHaveBeenCalledTimes(1);
 }finally{await host.dispose();await store.client.close();}
},30_000);
