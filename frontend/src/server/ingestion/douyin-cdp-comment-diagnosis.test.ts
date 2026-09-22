// @vitest-environment node
import {afterAll,beforeAll,expect,it,vi} from 'vitest';
import {chromium,type Browser,type BrowserContext} from '@playwright/test';
import {createCommentDiagnosisHost} from './douyin-cdp-comment-diagnosis';
import {createCommentDiagnosisService,type CommentDiagnosisReport} from '@creatoros/backend/modules/analytics';

let browser:Browser;
beforeAll(async()=>{browser=await chromium.launch({headless:true});});
afterAll(async()=>{await browser.close();});
const identity={userId:'u',accountId:'a',publicationId:'p',externalId:'1234567890123456789'};
const ctx={...identity,requestId:'r',source:'user' as const};
async function fixture(run:(f:{host:ReturnType<typeof createCommentDiagnosisHost>;service:ReturnType<typeof createCommentDiagnosisService>;context:BrowserContext;requests:string[];acquire:ReturnType<typeof vi.fn>;throttled:ReturnType<typeof vi.fn>;changePublication:()=>void})=>Promise<void>){
 const context=await browser.newContext({serviceWorkers:'block'});const requests:string[]=[];
 const html=`<meta charset="utf-8"><title>诊断主页</title><button>发布</button><button>删除</button><button>回复</button><button>设置</button><nav><button aria-expanded="false" aria-controls="submenu" onclick="document.getElementById('submenu').hidden=false;this.setAttribute('aria-expanded','true')">互动管理</button><div id="submenu" hidden><a href="/creator-micro/interactive/comment">评论管理</a></div><div role="button">未知结构</div><form><button type="submit">不执行</button></form><a href="https://evil.invalid">外部</a></nav><main><h1>首页</h1></main><script>
 document.querySelector('a').addEventListener('click', e=>{e.preventDefault();history.pushState({},'',e.currentTarget.href);document.querySelector('main').innerHTML='<h1>评论管理</h1><button aria-haspopup="listbox" aria-controls="works">选择作品</button><div role="listbox" id="works" hidden><div role="option" data-aweme-id="${identity.externalId}">目标作品</div><div role="option" data-aweme-id="other">SECRET_OTHER_TITLE</div></div>';document.querySelector('main button').onclick=()=>{document.getElementById('works').hidden=false;};document.querySelector('[data-aweme-id="${identity.externalId}"]').onclick=()=>fetch('/aweme/v1/web/comment/list/?item_id=${identity.externalId}&cursor=0&secret=SECRET_QUERY');});
 </script>`;
 await context.route('**/*',async route=>{
  requests.push(route.request().url());
  if(route.request().resourceType()==='document')return route.fulfill({status:200,contentType:'text/html; charset=utf-8',body:html});
  const body=JSON.stringify({comments:[{cid:'SECRET_CID',aweme_id:identity.externalId,text:'SECRET_BODY',user:{nickname:'SECRET_NAME'}}],has_more:0});
  return route.fulfill({status:200,headers:{'content-type':'application/json','content-length':String(Buffer.byteLength(body))},body});
 });
 const acquire=vi.fn(async()=>{}),throttled=vi.fn();
 const host=createCommentDiagnosisHost({open:async()=>({newPage:()=>context.newPage(),close:()=>context.close()}),acquire,throttled,settleMs:40});
 let changed=false;
 const service=createCommentDiagnosisService({assertPublication:async(c,id)=>{if(c.accountId!=='a'||id!=='p'||changed)throw Error('作品不可访问');return {externalId:identity.externalId};},host});
 try{await run({host,service,context,requests,acquire,throttled,changePublication:()=>{changed=true;}});}finally{await host.dispose();}
}
const advance=(report:CommentDiagnosisReport,intent:NonNullable<CommentDiagnosisReport['ui']['nodes'][number]['intent']>)=>{
 const target=report.ui.nodes.find(node=>node.intent===intent);expect(target,`缺少真实 ${intent} 控件：${JSON.stringify(report.ui)}`).toBeDefined();
 return {action:'advance' as const,diagnosisId:report.diagnosisId,expectedRevision:report.revision,observationId:report.ui.observationId!,intent,targetRef:target!.targetRef!};
};

it('真实SPA由菜单进入并选择真实作品，前4普通button不抢导航预算，网络只自然触发且不泄露值',async()=>fixture(async f=>{
 let report=await f.service.diagnose(ctx,{action:'start',publicationId:'p'});
 expect(report.ui.nodes.some(n=>n.text==='互动管理'&&n.intent==='expand_navigation')).toBe(true);
 expect(report.ui.nodes.find(n=>n.text==='未知结构')?.targetRef).toBeNull();
 expect(report.ui.nodes.find(n=>n.text==='外部')?.targetRef).toBeNull();
 for(const intent of ['expand_navigation','enter_comments','open_work_picker','select_target'] as const)report=await f.service.diagnose(ctx,advance(report,intent));
 expect(report.phase).toBe('target');expect(report.networkEvidence.items).toEqual(expect.arrayContaining([expect.objectContaining({oldMatcher:true,requestTargetMatches:true,queryKeys:['item_id','cursor'],unknownQueryKeys:1})]));
 expect(JSON.stringify(report)).not.toContain('SECRET');
 expect(f.requests).toHaveLength(2);expect(f.acquire).toHaveBeenCalledTimes(5);expect(f.throttled).not.toHaveBeenCalled();
 // Playwright fulfill没有可核实的真实传输字节数，不能冒称已读响应结构。
 expect(report.networkEvidence.items[0]?.bodyStatus).toBe('unavailable');
}));

it('observe原子废旧ref，重渲染/移出导航不以旧handle点击，重复advance只执行一次',async()=>fixture(async f=>{
 const start=await f.service.diagnose(ctx,{action:'start',publicationId:'p'}),old=advance(start,'expand_navigation');
 const observation=await f.service.diagnose(ctx,{action:'observe',diagnosisId:start.diagnosisId,expectedRevision:start.revision});
 expect(observation.generation).toBeGreaterThan(start.generation);expect((await f.service.diagnose(ctx,old)).stopReason).toBe('observation_stale');
 const input=advance(observation,'expand_navigation');
 const results=await Promise.all([f.service.diagnose(ctx,input),f.service.diagnose(ctx,input)]);expect(results[0]).toEqual(results[1]);expect(f.acquire).toHaveBeenCalledTimes(2);
 const entering=advance(results[0]!,'enter_comments');
 await f.context.pages()[0]!.evaluate(()=>{document.body.appendChild(document.querySelector('nav a')!);});
 expect((await f.service.diagnose(ctx,entering)).stopReason).toBe('observation_stale');expect(f.acquire).toHaveBeenCalledTimes(2);
}));

it('跨账号零宿主动作；作品删改后observe不再发token但原owner仍可close',async()=>fixture(async f=>{
 await expect(f.service.diagnose({...ctx,accountId:'other'},{action:'start',publicationId:'p'})).rejects.toThrow();expect(f.acquire).not.toHaveBeenCalled();
 const start=await f.service.diagnose(ctx,{action:'start',publicationId:'p'});f.changePublication();
 await expect(f.service.diagnose(ctx,advance(start,'expand_navigation'))).rejects.toThrow();
 const observed=await f.service.diagnose(ctx,{action:'observe',diagnosisId:start.diagnosisId,expectedRevision:start.revision});expect(observed.allowedNext).toEqual([]);
 const closed=await f.service.diagnose(ctx,{action:'close',diagnosisId:start.diagnosisId});expect(closed.status).toBe('closed');
 expect(f.context.pages()).toHaveLength(0);
}));

it('同真实profile池与采集互斥，checkout取消不遗留排队；close失败不按TTL释放占用',async()=>{
 const {createSharedReadBrowserSessionPool}=await import('@creatoros/ai-worker/browser/shared-read-browser-session');
 const {createBrowserShutdownScope}=await import('@creatoros/ai-worker/browser/browser-shutdown-scope');
 const scope=createBrowserShutdownScope();
 const contexts:BrowserContext[]=[];
 const open=vi.fn(async()=>{const context=await browser.newContext();contexts.push(context);await context.route('**/*',route=>route.fulfill({body:'<nav><a href="/creator-micro/interactive/comment">评论</a></nav>',contentType:'text/html'}));return context;});
 const pool=createSharedReadBrowserSessionPool({scope,authorize:async()=>({userId:'u',authDir:'/isolated/profile',profileKey:'same-profile'}),open});
 const reader=await pool.checkoutRead('/isolated/profile');const original=await reader.newPage();
 let failClose=false;
 const host=createCommentDiagnosisHost({open:async(_identity,signal)=>{const view=await pool.checkoutExclusive('/isolated/profile',signal);return {newPage:()=>view.newPage(),close:async()=>{if(failClose)throw Error('stop unproven');await view.close();}};},acquire:async()=>{},throttled:()=>{},checkoutMs:40,settleMs:10,idleMs:1000});
 try{
  const busy=await host.start(identity);expect(busy).toMatchObject({status:'unavailable',stopReason:'busy',dispatched:false});expect(open).toHaveBeenCalledTimes(1);expect(original.isClosed()).toBe(false);
  await reader.close();const active=await host.start(identity);expect(active.status).toBe('awaiting_selection');expect(open).toHaveBeenCalledTimes(2);
  expect((await host.start(identity)).stopReason).toBe('busy');failClose=true;
  const unknown=await host.step(identity,{action:'close',diagnosisId:active.diagnosisId});expect(unknown).toMatchObject({status:'unknown',stopReason:'resource_stop_unconfirmed',dispatched:true});expect((await host.start(identity)).stopReason).toBe('busy');
  failClose=false;expect((await host.step(identity,{action:'close',diagnosisId:active.diagnosisId})).status).toBe('closed');expect(contexts.every(context=>context.pages().length===0)).toBe(true);
 }finally{failClose=false;await reader.close();await host.dispose();}
});

it('正常采集cooldown拒绝不导航',async()=>fixture(async f=>{
 f.acquire.mockRejectedValueOnce(Object.assign(Error('cooldown'),{name:'DouyinCooldownActiveError'}));
 const stopped=await f.host.start(identity);expect(stopped).toMatchObject({dispatched:false,status:'unavailable',stopReason:'cooldown'});expect(f.requests).toHaveLength(0);
 await f.host.step(identity,{action:'close',diagnosisId:stopped.diagnosisId});
 // 此夹具context已关闭；未知已派发分支由独立context验证。
}));

it('已派发后popup异常保留unknown/dispatched，原动作重复不重派',async()=>fixture(async f=>{
 const start=await f.service.diagnose(ctx,{action:'start',publicationId:'p'});
 const expanded=await f.service.diagnose(ctx,advance(start,'expand_navigation'));
 await f.context.pages()[0]!.evaluate(()=>document.querySelector('nav a')!.addEventListener('click',()=>window.open('about:blank')));
 const input=advance(expanded,'enter_comments');const result=await f.service.diagnose(ctx,input);
 expect(result).toMatchObject({status:'unknown',dispatched:true,stopReason:'unsafe_navigation',allowedNext:[]});
 expect(await f.service.diagnose(ctx,input)).toEqual(result);expect(f.acquire).toHaveBeenCalledTimes(3);
 expect((await f.service.diagnose(ctx,{action:'observe',diagnosisId:result.diagnosisId,expectedRevision:result.revision})).allowedNext).toEqual([]);
}));

async function isolatedHost(html:string,run:(host:ReturnType<typeof createCommentDiagnosisHost>,contexts:BrowserContext[],acquire:ReturnType<typeof vi.fn>)=>Promise<void>){
 const contexts:BrowserContext[]=[];const acquire=vi.fn(async()=>{});
 const host=createCommentDiagnosisHost({open:async()=>{const context=await browser.newContext();contexts.push(context);await context.route('**/*',route=>route.fulfill({body:html,contentType:'text/html; charset=utf-8'}));return {newPage:()=>context.newPage(),close:()=>context.close()};},acquire,throttled:()=>{},settleMs:10});
 try{await run(host,contexts,acquire);}finally{await host.dispose();}
}

it('独审红测：aria-controls不能替不安全anchor href发放expand token',async()=>isolatedHost('<nav><a href="/logout" aria-expanded="false" aria-controls="menu" onclick="event.preventDefault();window.badClicks=(window.badClicks||0)+1">expand</a><div id="menu" hidden><a href="/creator-micro/interactive/comment">comments</a></div></nav>',async(host,contexts,acquire)=>{
 const start=await host.start(identity);const node=start.ui.nodes.find(item=>item.text==='expand')!;
 expect(node).toMatchObject({targetRef:null,intent:null});
 expect((await host.step(identity,{action:'advance',diagnosisId:start.diagnosisId,expectedRevision:start.revision,observationId:start.ui.observationId!,intent:'expand_navigation',targetRef:node.targetRef??'unissued'})).stopReason).toBe('observation_stale');
 expect(await contexts[0]!.pages()[0]!.evaluate(()=>Reflect.get(window,'badClicks')??0)).toBe(0);expect(acquire).toHaveBeenCalledTimes(1);
}));

it('独审红测：native/role dialog的status及嵌套导航不公开正文或发动作token',async()=>isolatedHost('<main><div role="dialog"><div role="status">PRIVATE_ROLE_DIALOG_BODY</div><nav><a href="/creator-micro/interactive/comment">PRIVATE_DIALOG_ACTION</a></nav></div><dialog open><div role="status">PRIVATE_NATIVE_DIALOG_BODY</div></dialog><h1>public heading</h1></main>',async(host)=>{
 const start=await host.start(identity);expect(JSON.stringify(start.ui)).not.toContain('PRIVATE');expect(start.allowedNext).toEqual([]);expect(start.ui.nodes.some(node=>node.text==='public heading')).toBe(true);
}));

it('独审红测：重复关闭旧A不得释放新B的账号占用',async()=>isolatedHost('<nav><a href="/creator-micro/interactive/comment">comments</a></nav>',async(host,contexts)=>{
 const first=await host.start(identity);await host.step(identity,{action:'close',diagnosisId:first.diagnosisId});
 const second=await host.start(identity);expect(second.status).toBe('awaiting_selection');expect((await host.start(identity)).stopReason).toBe('busy');
 await host.step(identity,{action:'close',diagnosisId:first.diagnosisId});expect((await host.start(identity)).stopReason).toBe('busy');
 expect(contexts).toHaveLength(2);expect(contexts[1]!.pages()[0]!.isClosed()).toBe(false);
}));

it.each(['/logout','javascript:void(0)','https://outside.invalid/','/creator-micro/home?different=1','/creator-micro/home'])('anchor展开不接受不安全或会重载的href：%s',async href=>isolatedHost(`<nav><a href="${href}" aria-expanded="false" aria-controls="menu">expand</a><div id="menu" hidden>menu</div></nav>`,async host=>{
 const start=await host.start(identity);expect(start.ui.nodes.find(node=>node.text==='expand')).toMatchObject({intent:null,targetRef:null});
}));
it.each(['','#','#menu'])('合法无href/同页fragment展开仍可执行：%s',async href=>isolatedHost(`<nav><a ${href?`href="${href}"`:''} aria-expanded="false" aria-controls="menu" onclick="event.preventDefault();document.getElementById('menu').hidden=false;this.setAttribute('aria-expanded','true')">expand</a><div id="menu" hidden><a href="/creator-micro/interactive/comment">comments</a></div></nav>`,async host=>{
 const start=await host.start(identity);const next=await host.step(identity,advance(start,'expand_navigation'));expect(next.phase).toBe('navigation');expect(next.ui.nodes.some(node=>node.intent==='enter_comments')).toBe(true);
}));
