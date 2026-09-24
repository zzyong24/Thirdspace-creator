// @vitest-environment node
import {afterAll,beforeAll,expect,it,vi} from 'vitest';
import {chromium,type Browser,type Page} from '@playwright/test';
import {createCommentPageEvidence,finishCommentPageEvidence} from './douyin-cdp-page-evidence';
import {fetchDouyinCommentsForWorks,type FetchDouyinCommentsDeps} from './douyin-cdp';
import {formatCommentReadDiagnostics} from '@creatoros/backend/application/collection/comment-read-diagnostics';

let browser:Browser;
type CommentPage=Awaited<ReturnType<NonNullable<FetchDouyinCommentsDeps['openContext']>>> extends {pages():Array<infer P>}?P:never;
type ResponseListener=Parameters<CommentPage['on']>[1];
beforeAll(async()=>{browser=await chromium.launch({headless:true,executablePath:process.env.CREATOROS_TEST_CHROMIUM_EXECUTABLE??chromium.executablePath()});});
afterAll(async()=>{await browser?.close();});
async function isolated(html:string,run:(page:Page,requests:()=>number)=>Promise<void>,origin='https://creator.douyin.com'){
 const context=await browser.newContext({serviceWorkers:'block'});let requests=0;
 // 所有请求均本机拦截，绝不接触真实站点、账号或用户档案。
 await context.route('**/*',async route=>{requests++;await route.fulfill({status:200,contentType:'text/html; charset=utf-8',body:html});});
 const page=await context.newPage();
 try{await page.goto(`${origin}/isolated-fixture`);await run(page,()=>requests);}finally{await context.close();}
}
async function capture(page:Page){
 const evidence=createCommentPageEvidence();
 await finishCommentPageEvidence(page,evidence,'no_matching_response');
 return JSON.parse(formatCommentReadDiagnostics([{awemeId:'fixture',complete:false,diagnostics:{matchedResponses:0,validResponses:0,invalidResponses:0,parsedComments:0,pendingResponses:0,reason:'no_matching_response',pageEvidence:evidence}}],{receivedComments:0,writtenComments:0,skippedComments:0})).works[0].pageEvidence;
}

it('真实Chromium生产evaluator读取主区空态/横幅/对话框及选中tab，且不请求、不交互、不修改DOM',async()=>{
 await isolated('<title>评论管理 · 显示名</title><main><h1>评论管理</h1><div role="tablist"><button role="tab" aria-selected="true">作品评论</button><button role="tab" aria-selected="false">全部互动</button></div><div role="status">当前作品暂无可展示的评论</div><div role="alert">页面服务暂不可用</div></main><div role="dialog"><h2>请登录后查看</h2><button>扫码登录</button><p>SECRET_DIALOG_BODY</p></div>',async(page,requests)=>{
  const before=requests();
  await page.evaluate(()=>{
   const state={mutations:0,actions:0};Object.assign(window,{testEvidenceState:state});
   new MutationObserver(list=>{state.mutations+=list.length;}).observe(document,{subtree:true,childList:true,attributes:true,characterData:true});
   window.fetch=async()=>{state.actions++;throw Error('unexpected fetch');};
   XMLHttpRequest.prototype.open=function(){state.actions++;throw Error('unexpected XHR');};
   window.scrollTo=()=>{state.actions++;};HTMLElement.prototype.click=()=>{state.actions++;};
  });
  const result=await capture(page),ui=result.uiEvidence;
  expect(ui).toMatchObject({schemaVersion:1,status:'observed',title:'评论管理 · 显示名',truncated:false,coverage:{mainSeen:true,dialogSeen:true,scanComplete:true}});
  expect(ui.nodes).toEqual(expect.arrayContaining([
   expect.objectContaining({kind:'status',region:'main',text:'当前作品暂无可展示的评论'}),
   expect.objectContaining({kind:'alert',text:'页面服务暂不可用'}),
   expect.objectContaining({kind:'dialog',region:'dialog',text:'请登录后查看'}),
   expect.objectContaining({kind:'tab',text:'作品评论',selected:true}),
   expect.objectContaining({kind:'tab',text:'全部互动',selected:false}),
   expect.objectContaining({kind:'button',text:'扫码登录',selected:null}),
  ]));
  expect(JSON.stringify(ui)).not.toContain('SECRET');
  expect(result).toMatchObject({loginVisible:null,captchaVisible:null});
  expect(requests()).toBe(before);
  expect(await page.evaluate(()=>Reflect.get(window,'testEvidenceState'))).toEqual({mutations:0,actions:0});
 });
});

it('原生列表/继承editable/表单值/隐藏内容/对话框正文与嵌套伪角色不泄露，URL文本统一遮蔽',async()=>{
 const html='<title>管理 https://example.invalid/?token=SECRET_TITLE</title><main><input value="SECRET_VALUE"><input type="password" value="SECRET_PASSWORD"><textarea>SECRET_TEXTAREA</textarea><select><option>SECRET_OPTION</option></select><div contenteditable="true"><div><h2>SECRET_EDITABLE</h2></div></div><ul><li><h2 role="heading">SECRET_COMMENT</h2></li></ul><article><button>SECRET_ARTICLE</button></article><div role="feed"><div role="status">SECRET_FEED</div></div><h2 hidden>SECRET_HIDDEN</h2><div aria-hidden="true"><button>SECRET_ARIA</button></div><div style="opacity:0"><h2>SECRET_OPACITY</h2></div><div role="dialog"><h2>可见标题 <span hidden>SECRET_NESTED</span><input value="SECRET_DIALOG_INPUT"></h2><p>SECRET_PARAGRAPH</p></div><div role="status">查看 https://example.invalid/path?token=SECRET_QUERY 然后重试</div><button aria-pressed="true">切换</button></main>';
 await isolated(html,async page=>{
  const {uiEvidence:ui}=await capture(page);
  expect(ui).toMatchObject({status:'observed'});
  expect(JSON.stringify(ui)).not.toContain('SECRET');expect(JSON.stringify(ui)).not.toContain('example.invalid');
  expect(ui.nodes).toEqual(expect.arrayContaining([expect.objectContaining({kind:'dialog',text:'可见标题'}),expect.objectContaining({kind:'status',text:'查看 [url] 然后重试'}),expect.objectContaining({kind:'button',text:'切换',selected:null})]));
 });
});

it('evaluate内核验真实origin，不能信任之前page.url或采样外域文本',async()=>{
 await isolated('<title>SECRET_EXTERNAL</title><main><h1>SECRET_EXTERNAL_UI</h1></main>',async page=>{
  const evidence=createCommentPageEvidence();
  await finishCommentPageEvidence({url:()=> 'https://creator.douyin.com/creator-micro/interactive/comment',isClosed:()=>false,evaluate:fn=>page.evaluate(fn)},evidence,'no_matching_response');
  expect(evidence).toMatchObject({uiEvidence:{status:'not_applicable',title:null,nodes:[]}});
  expect(JSON.stringify(evidence)).not.toContain('SECRET');
 },'https://external.invalid');
});

it('不穿透iframe/shadow，也不读取shadow遮掉的light DOM文字',async()=>{
 await isolated('<main><div role="status">公开状态</div><div id="host" role="button">SECRET_UNASSIGNED_LIGHT</div><iframe srcdoc="<h1>SECRET_IFRAME</h1>"></iframe></main>',async page=>{
  await page.evaluate(()=>{const root=document.getElementById('host')!.attachShadow({mode:'open'});root.innerHTML='<h2>SECRET_SHADOW</h2>';});
  const result=await capture(page);expect(result.uiEvidence.status).toBe('observed');expect(JSON.stringify(result)).not.toContain('SECRET');
 });
});

it('页面关闭或evaluate抛错仅返回固定不可用状态，不泄露原异常',async()=>{
 const evaluate=vi.fn(async()=>{throw Error('SECRET_PAGE_ERROR');});
 const closed=createCommentPageEvidence();await finishCommentPageEvidence({url:()=> 'https://creator.douyin.com',isClosed:()=>true,evaluate},closed,'no_matching_response');
 expect(closed.uiEvidence).toMatchObject({status:'page_closed',title:null,nodes:[]});expect(evaluate).not.toHaveBeenCalled();
 const unavailable=createCommentPageEvidence();await finishCommentPageEvidence({url:()=> 'https://creator.douyin.com',isClosed:()=>false,evaluate},unavailable,'no_matching_response');
 expect(unavailable.uiEvidence).toMatchObject({status:'unavailable',title:null,nodes:[]});expect(JSON.stringify(unavailable)).not.toContain('SECRET');
});

it('ARIA自定义表单值子树同样排除，子节点伪装heading不能带出字段内容',async()=>{
 await isolated(`<main><div role="status">公开状态</div>${['textbox','searchbox','combobox','spinbutton','listbox','option'].map(role=>`<div role="${role}"><h2>SECRET_FIELD</h2></div>`).join('')}</main>`,async page=>{
  const result=await capture(page);expect(result.uiEvidence.nodes).toEqual([expect.objectContaining({kind:'status',text:'公开状态'})]);expect(JSON.stringify(result)).not.toContain('SECRET');
 });
});

it.each(['<div role="dialog">','<dialog open role="alert">','<div role="unknown dialog">'])('外层status不得汇总子dialog正文：%s',async opening=>{
 const closing=opening.startsWith('<dialog')?'</dialog>':'</div>';
 await isolated(`<main><div role="status">公开状态${opening}<h2>可见标题</h2><p>SECRET_DIALOG_BODY</p><button>确认</button>${closing}</div></main>`,async page=>{
  const {uiEvidence:ui}=await capture(page);
  expect(ui.nodes).toEqual(expect.arrayContaining([expect.objectContaining({kind:'status',text:'公开状态'}),expect.objectContaining({kind:'dialog',text:'可见标题'}),expect.objectContaining({kind:'button',text:'确认'})]));
  expect(JSON.stringify(ui)).not.toContain('SECRET');
 });
});

it('深祖先、巨型单Text与超量节点有界且明确截断，不以缺节点推断页面状态',async()=>{
 await isolated(`<title>有界</title><main>${'<div>'.repeat(40)}<h2>SECRET_DEEP</h2>${'</div>'.repeat(40)}<div role="status">${'😀'.repeat(500_000)}</div>${'<button>操作</button>'.repeat(100)}<div role="dialog"><h2>仍可见对话标题</h2></div></main>`,async page=>{
  const {uiEvidence:ui}=await capture(page);
  expect(ui).toMatchObject({status:'observed',truncated:true,coverage:{scanComplete:false}});
  expect(ui.scannedNodes).toBeLessThanOrEqual(2000);expect(ui.nodes.length).toBeLessThanOrEqual(24);
  expect(ui.nodes.filter((node:{kind:string})=>node.kind==='button').length).toBeLessThanOrEqual(4);
  expect(ui.nodes.every((node:{text:string})=>Array.from(node.text).length<=120)).toBe(true);
  expect(ui.nodes).toEqual(expect.arrayContaining([expect.objectContaining({kind:'status',textTruncated:true})]));
  expect(Buffer.byteLength(JSON.stringify(ui),'utf8')).toBeLessThanOrEqual(12*1024);
  expect(JSON.stringify(ui)).not.toContain('SECRET');
 });
});

it('真实采集流程只扩最后一次evaluate：response已off、无新导航/等待/滚动，仍no_matching_response',async()=>{
 await isolated('<title>管理</title><main><div role="status">页面暂无数据</div></main>',async page=>{
  let evaluates=0,activeListeners=0;
  const port={url:()=>page.url(),isClosed:()=>page.isClosed(),goto:vi.fn((url:string,opts?:unknown)=>page.goto(url,opts as Parameters<Page['goto']>[1])),
   on:(_event:'response',listener:ResponseListener)=>{activeListeners++;page.on('response',listener);},
   off:(_event:'response',listener:ResponseListener)=>{activeListeners--;page.off('response',listener);},
   async evaluate<R>(fn:()=>R):Promise<R>{evaluates++;if(evaluates===4)expect(activeListeners).toBe(0);return page.evaluate(fn);},
   waitForTimeout:vi.fn(async()=>{}),mouse:{wheel:vi.fn(async()=>{})}};
  const close=vi.fn(async()=>{});
  const result=await fetchDouyinCommentsForWorks(['fixture'],{authDir:'/isolated-only',maxPages:4},{openContext:async()=>({pages:()=>[port],newPage:async()=>port,cookies:async()=>[{name:'sessionid'}],close})});
  expect(result.works[0]).toMatchObject({complete:false,records:[],diagnostics:{reason:'no_matching_response',pageEvidence:{uiEvidence:{status:'observed',nodes:expect.arrayContaining([expect.objectContaining({kind:'status',text:'页面暂无数据'})])}}}});
  expect(evaluates).toBe(4);expect(port.goto).toHaveBeenCalledOnce();expect(port.waitForTimeout).toHaveBeenCalledTimes(4);expect(port.mouse.wheel).toHaveBeenCalledTimes(3);expect(close).toHaveBeenCalledOnce();
 });
});

it('超时后迟到的UI返回不回写证据，异常与有匹配路径不改变采集判据',async()=>{
 vi.useFakeTimers();try{
  let resolve!: (value:unknown)=>void;
  const evidence=createCommentPageEvidence(),evaluateSpy=vi.fn();
  function evaluate<R>():Promise<R>{evaluateSpy();return new Promise<R>(done=>{resolve=done as (value:unknown)=>void;});}
  const promise=finishCommentPageEvidence({url:()=> 'https://creator.douyin.com',isClosed:()=>false,evaluate},evidence,'no_matching_response');
  await vi.advanceTimersByTimeAsync(1000);await promise;
  expect(evidence).toMatchObject({uiEvidence:{status:'timeout',title:null,nodes:[]}});
  const before=JSON.stringify(evidence);resolve({readyState:'complete',uiEvidence:{title:'SECRET_LATE'}});await Promise.resolve();expect(JSON.stringify(evidence)).toBe(before);expect(evaluateSpy).toHaveBeenCalledOnce();
 }finally{vi.useRealTimers();}
 await isolated('<title>SECRET_NOT_APPLICABLE</title><h1>SECRET_NOT_APPLICABLE</h1>',async page=>{
  const evidence=createCommentPageEvidence();await finishCommentPageEvidence(page,evidence,'pagination_exhausted');
  expect(evidence).toMatchObject({uiEvidence:{status:'not_applicable',title:null,nodes:[]}});expect(JSON.stringify(evidence)).not.toContain('SECRET');
 });
});
