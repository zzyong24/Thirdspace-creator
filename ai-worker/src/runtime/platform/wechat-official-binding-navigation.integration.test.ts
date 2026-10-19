import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import type {Browser,BrowserContext,Page} from '@playwright/test';
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
});
