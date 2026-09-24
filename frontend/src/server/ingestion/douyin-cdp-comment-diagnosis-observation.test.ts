// @vitest-environment node
import {afterAll,beforeAll,expect,it,vi} from 'vitest';
import {chromium,type Browser} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
import {createCommentDiagnosisHost} from './douyin-cdp-comment-diagnosis';

let browser:Browser;
beforeAll(async()=>{browser=await chromium.launch({headless:true,proxy:{server:'http://127.0.0.1:9'},args:['--disable-background-networking']});});
afterAll(async()=>{await browser.close();});
const identity={userId:'u',accountId:'a',publicationId:'p',externalId:'123'};
async function fixture(run:(host:ReturnType<typeof createCommentDiagnosisHost>,page:import('@playwright/test').Page,report:Awaited<ReturnType<ReturnType<typeof createCommentDiagnosisHost>['start']>>,requests:string[])=>Promise<void>,factory=createCommentDiagnosisHost){
 const context=await browser.newContext({serviceWorkers:'block'}),requests:string[]=[];
 await context.route('**/*',route=>{requests.push(route.request().url());return route.fulfill({contentType:'text/html',body:'<title>isolated</title><nav><button>home</button></nav><nav><a href="/creator-micro/interactive/comment">comments</a></nav>'});});
 const host=factory({open:async()=>({newPage:()=>context.newPage(),close:()=>context.close()}),acquire:async()=>{},throttled:()=>{},settleMs:1});
 try{const report=await host.start(identity);expect(report.ui.status).toBe('observed');await run(host,context.pages()[0]!,report,requests);}finally{vi.restoreAllMocks();await host.dispose();}
}
const observe=(host:ReturnType<typeof createCommentDiagnosisHost>,report:Awaited<ReturnType<typeof host.start>>)=>host.step(identity,{action:'observe',diagnosisId:report.diagnosisId,expectedRevision:report.revision});

it('真实evaluate拒绝只公开阶段枚举；重读成功清旧failure且零新请求',async()=>fixture(async(host,page,start,requests)=>{
 const original=page.evaluateHandle.bind(page);
 const spy=vi.spyOn(page,'evaluateHandle').mockImplementationOnce(()=>original(()=>{throw Error('observation deadline SECRET_EVALUATION');}));
 const result=await observe(host,start);
 expect(result).toMatchObject({status:'unavailable',dispatched:true,revision:1,ui:{observationFailure:'evaluation_failed',nodes:[]},allowedNext:[]});
 expect(JSON.stringify(result)).not.toContain('SECRET');spy.mockRestore();
 const recovered=await observe(host,start);expect(recovered.ui.status).toBe('observed');expect(recovered.ui).not.toHaveProperty('observationFailure');expect(recovered.generation).toBe(result.generation+1);expect(requests).toHaveLength(1);
}));

it('真实handle投影失败与evaluate阶段区分，不泄露raw错误',async()=>fixture(async(host,page,start)=>{
 const original=page.evaluateHandle.bind(page);
 vi.spyOn(page,'evaluateHandle').mockImplementationOnce(async(...args)=>{
  const handle=await original(...args);const evaluate=handle.evaluate.bind(handle);
  vi.spyOn(handle,'evaluate').mockImplementationOnce(()=>evaluate(()=>{throw Error('SECRET_PROJECTION');}));return handle;
 });
 const result=await observe(host,start);expect(result.ui).toMatchObject({observationFailure:'projection_failed',nodes:[]});expect(JSON.stringify(result)).not.toContain('SECRET');
}));

it.each(['evaluation','projection'] as const)('%s阶段自有1s deadline只记deadline，迟到handle不回写',async stage=>fixture(async(host,page,start,requests)=>{
 const original=page.evaluateHandle.bind(page);let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});let finished!:()=>void;const completion=new Promise<void>(resolve=>{finished=resolve;});
 vi.spyOn(page,'evaluateHandle').mockImplementationOnce(async(...args)=>{
  const handle=await original(...args);
  if(stage==='evaluation'){await gate;finished();return handle;}
  const evaluate=handle.evaluate.bind(handle);
  vi.spyOn(handle,'evaluate').mockImplementationOnce(async(...values)=>{await gate;try{return await evaluate(...values);}finally{finished();}});
  return handle;
 });
 try{
  const result=await observe(host,start);expect(result.ui).toMatchObject({observationFailure:'observation_deadline',nodes:[]});expect(result.dispatched).toBe(true);
  release();await completion;vi.restoreAllMocks();const recovered=await observe(host,start);expect(recovered.ui.status).toBe('observed');expect(recovered.ui).not.toHaveProperty('observationFailure');expect(recovered.generation).toBe(result.generation+1);expect(requests).toHaveLength(1);
 }finally{release();await completion;}
}));

it('实际page关闭可辨认，原unknown/dispatched不被观察失败覆盖',async()=>fixture(async(host,page,start)=>{
 await page.evaluate(()=>document.querySelector('a')!.addEventListener('click',event=>{event.preventDefault();window.open('about:blank');}));
 const node=start.ui.nodes.find(node=>node.intent==='enter_comments')!;
 const unknown=await host.step(identity,{action:'advance',diagnosisId:start.diagnosisId,expectedRevision:start.revision,observationId:start.ui.observationId!,intent:'enter_comments',targetRef:node.targetRef!});expect(unknown.status).toBe('unknown');
 await page.close();const result=await observe(host,unknown);expect(result).toMatchObject({status:'unknown',dispatched:true,stopReason:'unsafe_navigation',ui:{observationFailure:'page_closed',nodes:[]},allowedNext:[]});
}));

it('Next SWC压缩与实际rename-only混淆后的函数可序列化；双nav及错误分类走真实Chromium',async()=>{
 const require=createRequire(import.meta.url);
 const swc=require('next/dist/build/swc');await swc.loadBindings();
 const source=readFileSync(new URL('./douyin-cdp-comment-diagnosis.ts',import.meta.url),'utf8');
 const transformed=await swc.transform(source,{filename:'douyin-cdp-comment-diagnosis.ts',jsc:{parser:{syntax:'typescript'},target:'es2022',minify:{compress:true,mangle:true}},module:{type:'commonjs'},minify:true});
 const {pickPreset,obfuscateCode}=await import(/* @vite-ignore */ new URL('../../../scripts/desktop/obfuscate.mjs',import.meta.url).href);
 const preset=pickPreset(transformed.code,'chunks/diagnosis.js','server');expect(preset).toBe('rename-only');
 const module={exports:{} as {createCommentDiagnosisHost:typeof createCommentDiagnosisHost}};
 runInNewContext(obfuscateCode(transformed.code,preset),{module,exports:module.exports,require,Buffer,URL,AbortController,structuredClone,setTimeout,clearTimeout});
 await fixture(async(host,page,start,requests)=>{
  expect(start.ui.roots?.filter(root=>root.kind==='navigation')).toHaveLength(2);expect(start.allowedNext).toContain('enter_comments');
  const evaluate=page.evaluateHandle.bind(page);
  vi.spyOn(page,'evaluateHandle').mockImplementationOnce(()=>evaluate(()=>{throw Error('SECRET_TRANSFORM');}));
  const result=await observe(host,start);expect(result.ui.observationFailure).toBe('evaluation_failed');expect(JSON.stringify(result)).not.toContain('SECRET');expect(requests).toHaveLength(1);
 },module.exports.createCommentDiagnosisHost);
});
