import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import type {Browser,BrowserContext,Page,Locator} from '@playwright/test';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {createWechatBrowserSource} from './wechat-browser-source';
import {createVerifiedWechatDomWitnesses} from './wechat-dom-witness';
const {chromium}=createRequire(resolve(process.cwd(),'../frontend/package.json'))('@playwright/test') as typeof import('@playwright/test');
const origin='https://mp.weixin.qq.com';
const fields='<li class="weui-desktop-setting__item"><span class="weui-desktop-setting__item__label">AppID</span><span class="weui-desktop-setting__item__info">wxSynthetic1354</span></li><li class="weui-desktop-setting__item"><span class="weui-desktop-setting__item__label">名称</span><span class="weui-desktop-setting__item__info">受控合成公众号</span></li>';
// 真实Chromium + public source/内置witness。所有页面由本地route合成；无外网、会话或业务库。
describe('T1354 真实同页导航的公众号身份观察',()=>{
 let browser:Browser;
 beforeAll(async()=>{browser=await chromium.launch({headless:true,timeout:120000,args:['--disable-background-networking','--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost']});});
 afterAll(async()=>{await browser?.close();});
 it.each([false,true])('导航竞争=%s仍只用原Page/profile读回稳定身份',async race=>{
  const context=await browser.newContext({serviceWorkers:'block'}),page=await context.newPage();let ready=!race,openCount=0,closeCount=0,contextLosses=0,attemptedRace=false,navigations=0;
  await context.route('**/*',async route=>{const u=new URL(route.request().url());if(u.origin!==origin){await route.abort();return;}await route.fulfill({contentType:'text/html; charset=utf-8',body:'<!doctype html><meta charset="utf-8"><body>'+(u.pathname==='/cgi-bin/settingpage'?(ready?fields:'<p>字段尚未就绪</p>'):'<a href="/cgi-bin/settingpage">账号设置</a>')+'</body>'});});
  page.on('framenavigated',frame=>{if(frame===page.mainFrame())navigations++;});
  const rawEvaluate=page.evaluate.bind(page),rawGoto=page.goto.bind(page);
  const protectedPage=new Proxy(page,{get(target,key){
   if(key==='evaluate')return async(fn:Parameters<Page['evaluate']>[0],arg:unknown)=>{
    if(race&&!attemptedRace){attemptedRace=true;ready=true;const navigation=rawGoto(origin+'/cgi-bin/settingpage?synthetic-navigation=1',{waitUntil:'domcontentloaded',timeout:120000});
     try{return await rawEvaluate(fn,arg);}catch(error){if(error instanceof Error&&error.message.includes('Execution context was destroyed'))contextLosses++;throw error;}finally{await navigation;}
    }return rawEvaluate(fn,arg);
   };const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;
  }});
  const protectedContext=new Proxy(context,{get(target,key){if(key==='pages')return()=>[protectedPage];if(key==='close')return async()=>{closeCount++;await target.close();};const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;}}) as BrowserContext;
  const source=createWechatBrowserSource({...createVerifiedWechatDomWitnesses(),openProfile:async()=>{openCount++;return protectedContext;}});
  try{
   const result=await source.login('wechatOfficial','/synthetic-only-profile',{deadlineAt:new Date(Date.now()+2450000).toISOString()});
   expect(result).toMatchObject({platformIdentity:'wxSynthetic1354',displayName:'受控合成公众号'});expect(openCount).toBe(1);expect(closeCount).toBe(1);
   expect(contextLosses).toBe(race?1:0);expect(navigations).toBe(race?3:2);
  }finally{await context.close();}
 });
 // T1406：在真实evaluateAll在途时由合成页面自动跳转；不抛自造协议错误。
 it.each(['settings','home'] as const)('T1406真实入口在途导航到%s后沿原Page读身份且不重发设置goto',{timeout:30000,retry:0},async destination=>{
  const context=await browser.newContext({serviceWorkers:'block'}),page=await context.newPage();
  let openCount=0,closeCount=0,entryCalls=0,contextLosses=0;const explicitGotos:string[]=[];
  let entered!:()=>void;const evaluationEntered=new Promise<void>(resolve=>{entered=resolve;});
  await page.exposeFunction('fixtureEntryEvaluationEntered',()=>entered());
  await context.route('**/*',async route=>{
   const u=new URL(route.request().url());if(u.origin!==origin){await route.abort();return;}
   const body=u.pathname==='/cgi-bin/settingpage'?fields:'<a href="/cgi-bin/settingpage?fixture=old-href">账号设置</a>';
   await route.fulfill({contentType:'text/html; charset=utf-8',body:'<!doctype html><meta charset="utf-8"><body>'+body+'<script>window.addEventListener("message",event=>{if(event.data?.type==="fixture-entry-navigation")location.replace(event.data.target);});</script></body>'});
  });
  const protectedPage=new Proxy(page,{get(target,key){
   if(key==='goto')return async(url:string,options:Parameters<Page['goto']>[1])=>{explicitGotos.push(new URL(url).pathname);return target.goto(url,options);};
   if(key==='locator')return(selector:string)=>{
    const locator=target.locator(selector);if(selector!=='a[href]')return locator;
    return new Proxy(locator,{get(node,property){
     if(property==='evaluateAll')return async(fn:Parameters<Locator['evaluateAll']>[0])=>{
      if(++entryCalls!==1)return node.evaluateAll(fn);
      // pending仅协调真实在途上下文，原首阶段确实执行固定href映射；异常由Chromium产生。
      const reading=node.evaluateAll(async nodes=>{const hrefs=nodes.map(node=>node.getAttribute('href')).filter(Boolean);await (window as unknown as {fixtureEntryEvaluationEntered:()=>Promise<void>}).fixtureEntryEvaluationEntered();return new Promise<string[]>(()=>{void hrefs;});});
      const observed=reading.then(value=>({value}),error=>{if(error instanceof Error&&/^locator\.evaluateAll: Execution context was destroyed, most likely because of a navigation\.?(?:\r?\n|$)/.test(error.message))contextLosses++;return {error};});
      await evaluationEntered;
      const next=origin+(destination==='settings'?'/cgi-bin/settingpage':'/cgi-bin/home');
      const navigation=page.waitForURL(next,{waitUntil:'domcontentloaded'});
      await page.evaluate(next=>window.postMessage({type:'fixture-entry-navigation',target:next},location.origin),next);await navigation;
      const result=await observed;if('error' in result)throw result.error;return result.value;
     };
     const value=Reflect.get(node,property,node);return typeof value==='function'?value.bind(node):value;
    }});
   };
   const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;
  }});
  const protectedContext=new Proxy(context,{get(target,key){if(key==='pages')return()=>[protectedPage];if(key==='close')return async()=>{closeCount++;await target.close();};const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;}}) as BrowserContext;
  const source=createWechatBrowserSource({...createVerifiedWechatDomWitnesses(),openProfile:async()=>{openCount++;return protectedContext;}});
  try{
   const result=await source.login('wechatOfficial','/synthetic-only-profile',{deadlineAt:new Date(Date.now()+30000).toISOString()});
   expect(result).toEqual({platformIdentity:'wxSynthetic1354',displayName:'受控合成公众号',source:'wechatOfficial:/cgi-bin/settingpage'});
   expect(contextLosses).toBe(1);expect(openCount).toBe(1);expect(closeCount).toBe(1);
   expect(explicitGotos).toEqual(destination==='settings'?['/']:['/','/cgi-bin/settingpage']);
   expect(page.isClosed()).toBe(true);
  }finally{console.log('[t1406-entry-safe]',JSON.stringify({destination,contextLosses,entryCalls,openCount,closeCount,explicitGotoCount:explicitGotos.length,closed:page.isClosed()}));await context.close();}
 });

});
