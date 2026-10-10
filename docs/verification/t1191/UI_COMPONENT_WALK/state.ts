import * as React from 'react';
export const scenario = new URLSearchParams(location.search).get('scenario') === 'creation' ? 'creation' : 'prepare';
export const originalText = scenario === 'creation' ? '生成原文章图文候选' : '这次明确修改';
export const target = {schemaVersion:1,projectId:'protocol-project',outputId:'actual-article',owner:'wechat_article',contentType:'article',savedBase:{kind:'artifact',artifactId:'actual-artifact',versionId:'saved-base'},documentDigest:'sha256:'+'a'.repeat(64),selection:{kind:'article_sections',sectionIds:['actual-section']}};
export const creationTarget = {clientRequestId:'original-pair',projectId:'protocol-project',scriptSourceRef:{kind:'project_script',id:'script',versionId:'frozen-script-v'}};
export let config = {engine:'pi',available:scenario !== 'creation',checking:false,prepareReject:true};
export const evidence = {scenario,originalText,target,creationTarget,prepareCalls:0,readCalls:[] as unknown[],postCalls:[] as unknown[],blockedNetwork:[] as unknown[],creationSubmission:[] as unknown[],navigation:[] as unknown[]};
const subscribers = new Set<()=>void>();
export function update(next:Partial<typeof config>){config={...config,...next};subscribers.forEach(fn=>fn());window.dispatchEvent(new CustomEvent('harness-evidence'));}
export function useConfig(){return React.useSyncExternalStore(fn=>{subscribers.add(fn);return ()=>subscribers.delete(fn);},()=>config);}
export function notify(){window.dispatchEvent(new CustomEvent('harness-evidence'));}
// Boundary only: no actual request reaches a server, platform or model.
window.fetch=async(input,init)=>{const url=typeof input==='string'?input:input instanceof URL?input.href:input.url;const method=init?.method??'GET';if(url==='/api/chat'&&method==='POST'){evidence.postCalls.push({at:new Date().toISOString(),url,method,body:typeof init?.body==='string'?JSON.parse(init.body):null});notify();return new Response('隔离传输边界：原流结果未知',{status:503});}evidence.blockedNetwork.push({at:new Date().toISOString(),url,method});notify();throw Error('隔离harness禁止网络请求：'+url);};
Object.defineProperty(window,'__HARNESS_EVIDENCE__',{get:()=>JSON.parse(JSON.stringify({...evidence,config}))});
