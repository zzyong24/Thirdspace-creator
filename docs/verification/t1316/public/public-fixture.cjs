'use strict';
const fs=require('node:fs'),path=require('node:path'),{createRequire}=require('node:module');
if(!process.env.T1300_SESSION)throw Error('EXPLICIT_T1300_PRIVATE_SESSION_REQUIRED');
const session=JSON.parse(fs.readFileSync(process.env.T1300_SESSION,'utf8')),binding=JSON.parse(fs.readFileSync(session.candidateBinding,'utf8'));
if(session.task!=='T-1300'||binding.schema!=='t1300-production-candidate/v1')throw Error('PRIVATE_SESSION_BINDING_MISMATCH');
const {test:base,expect}=createRequire(path.join(binding.sourceRoot,'frontend/package.json'))('@playwright/test');
const test=base.extend({candidateGuard:[async({context},use)=>{
 const denied=[],origin=new URL(session.baseURL).origin;
 await context.addInitScript(token=>{window.__CREATOROS_HANDSHAKE_TOKEN__=token;},session.handshake);
 await context.route('**/*',async route=>{const url=new URL(route.request().url());if(['data:','blob:','about:'].includes(url.protocol)||url.origin===origin)return route.continue();denied.push(route.request().method()+' '+url.origin+url.pathname);return route.abort('blockedbyclient');});
 await context.routeWebSocket('**/*',socket=>{if(new URL(socket.url()).origin.replace(/^ws/,'http')===origin)socket.connectToServer();else{denied.push('WS '+new URL(socket.url()).origin);void socket.close();}});
 await use({session,binding});expect(denied,'只操作本轮candidate，不访问其它本机/外部浏览器来源').toEqual([]);
 },{auto:true}]});
async function dispatch(page,id,input={},groupId){const response=await page.request.post('/api/v1/dispatch',{timeout:900_000,headers:groupId?{'x-group-id':groupId}:{},data:{id,input}});const body=await response.json();expect(response.ok(),id+' HTTP '+response.status()+' '+JSON.stringify(body)).toBe(true);expect(body.success===false,id+' business rejection '+JSON.stringify(body)).toBe(false);return body.data;}
module.exports={test,expect,session,binding,dispatch};
