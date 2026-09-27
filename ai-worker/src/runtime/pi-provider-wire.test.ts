/** T957: request serialization only. Loopback fixture rejects every request; no real model, DB or credential access. */
import {createServer} from 'node:http';
import {it as test,beforeAll as before,afterAll as after} from 'vitest';
import type {ModelSpec} from './provider-factory';
import assert from 'node:assert/strict';
import {createPiProviderModel} from './pi-provider';
import {runChatPiLoop} from './chat/chat-pi-loop';
import {runStructuredNode} from '../nodes/structured-node';
import {getTemplate,getOfficialSkillBase} from '../prompt/registry';
import {runWithEffectiveSkillSnapshot} from '../prompt/effective-skill-runtime';
import {runChatStructuredSequence} from '../execution/chat-structured-sequence';
import {markStructuredOutputMode} from './provider-factory';
import {USER_FACING_RESPONSE_POLICY} from '../prompt/user-facing-response-policy';
const requests:Array<{path:string|undefined;body:Record<string,any>}>=[];
const server=createServer(async(req,res)=>{const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(chunk);requests.push({path:req.url,body:JSON.parse(Buffer.concat(chunks).toString())});res.writeHead(400,{'content-type':'application/json'});res.end(JSON.stringify({error:{type:'invalid_request_error',message:'fixture refuses generation'}}));});
let baseUrl='';const originalWarn=console.warn,originalError=console.error;
before(async()=>{await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));baseUrl=`http://127.0.0.1:${(server.address() as {port:number}).port}/v1`;console.warn=()=>{};console.error=()=>{};});
after(async()=>{console.warn=originalWarn;console.error=originalError;server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));});
const system='fixture-system-before\n'+USER_FACING_RESPONSE_POLICY;
const latest='fixture-latest-user:只生成一张选题卡';
const model=(apiFormat:ModelSpec["apiFormat"])=>createPiProviderModel({apiFormat,baseUrl,model:'fixture-model',token:'fixture-not-a-secret'});
async function captured(run:()=>PromiseLike<unknown>){const start=requests.length;await assert.rejects(async()=>await run());assert.equal(requests.length,start+1,'one refused request, no retries');return requests.at(-1)!;}
for(const apiFormat of ['openai_chat','openai_responses','anthropic'] as const)test(`1. HTTP serialization preserves system/latest user: ${apiFormat}`,async()=>{
 const {body,path}=await captured(()=>model(apiFormat).doGenerate({prompt:[{role:'system',content:system},{role:'user',content:[{type:'text',text:'fixture-old-user'}]},{role:'assistant',content:[{type:'text',text:'fixture-old-assistant'}]},{role:'user',content:[{type:'text',text:latest}]}],maxOutputTokens:128,abortSignal:AbortSignal.timeout(8000)}));
 const messages=body.messages??body.input;
 const sentSystem=apiFormat==='anthropic'?body.system.map((p:any)=>p.text).join('\n\n'):messages.filter((p:any)=>p.role==='system'||p.role==='developer').map((p:any)=>p.content).join('\n\n');
 assert.equal(sentSystem,system);assert.ok(JSON.stringify(messages.at(-1)).includes(latest));assert.equal(messages.at(-1).role,'user');
 assert.equal(path,apiFormat==='openai_chat'?'/v1/chat/completions':apiFormat==='openai_responses'?'/v1/responses':'/v1/messages');
});
test('2. real Pi core + SDK + HTTP keeps frozen prompt, excludes startup trigger',async()=>{
 const {body}=await captured(()=>runChatPiLoop({model:model('openai_chat'),system,messages:[{role:'user',content:latest}],definitions:[],execute:async()=>{throw Error('unexpected tool')},approve:async()=>'approved',approvalId:()=>'',signal:AbortSignal.timeout(8000),maxOutputTokens:128,messageId:'fixture',contextPolicyVersion:2}));
 assert.equal(body.messages[0].content,system);assert.ok(JSON.stringify(body.messages.at(-1)).includes(latest));assert.ok(!JSON.stringify(body.messages).includes('执行当前已绑定的用户请求'));
});
test('3. structured bindPrompt + SDK + HTTP expands userRequest',async()=>{
 const {body}=await captured(()=>runStructuredNode({model:model('openai_chat'),template:getTemplate('topic.generate'),facets:{positioning:'fixture-positioning',basisHint:'fixture-basis',userRequest:latest},maxOutputTokens:128,maxRetries:0,signal:AbortSignal.timeout(8000)}));
 assert.ok(body.messages[0].content.includes(USER_FACING_RESPONSE_POLICY));assert.ok(JSON.stringify(body.messages.at(-1)).includes(latest));assert.ok(!JSON.stringify(body.messages).includes('{{userRequest}}'));
});
for(const apiFormat of ['openai_chat','openai_responses'] as const)test(`4. reasoning system becomes developer without content loss: ${apiFormat}`,async()=>{
 const {body}=await captured(()=>model(apiFormat).doGenerate({prompt:[{role:'system',content:system},{role:'user',content:[{type:'text',text:latest}]}],reasoning:'low',maxOutputTokens:128,abortSignal:AbortSignal.timeout(8000)}));
 const messages=body.messages??body.input;assert.equal(messages[0].role,'developer');assert.equal(messages[0].content,system);assert.ok(JSON.stringify(messages.at(-1)).includes(latest));
});
for(const mode of ['native','text'])test(`5. Worker sequence + frozen effective snapshot + HTTP: ${mode}`,async()=>{
 const base=getOfficialSkillBase('topic.generate');assert.ok(base);
 const snapshot={snapshotVersion:1 as const,userId:'fixture-user',accountId:'fixture-account',resolvedAt:'2026-09-27T00:00:00Z',platformPolicyVersion:'fixture',platformPolicy:'fixture',skills:[{skillId:base.skillId,baseVersion:base.baseVersion,overlayRevision:null,overlayVersion:null,effective:{methodSystem:base.methodSystem,template:base.template,tools:base.tools,requiredFacets:base.requiredFacets,contextRequirements:base.contextRequirements,outputSchema:base.outputSchema,completionPolicy:base.completionPolicy,completionPolicyAdapter:base.completionPolicyAdapter}}]};
 const provider=model('openai_chat');if(mode==='text')markStructuredOutputMode(provider,'text');
 const {body}=await captured(()=>runWithEffectiveSkillSnapshot(snapshot,()=>runChatStructuredSequence({capability:'topic.generate',facets:{positioning:'fixture-positioning',basisHint:'fixture-basis',userRequest:latest},trendNote:null},provider,128,AbortSignal.timeout(8000))));
 assert.ok(body.messages[0].content.includes(USER_FACING_RESPONSE_POLICY));assert.ok(JSON.stringify(body.messages.at(-1)).includes(latest));assert.ok(!JSON.stringify(body.messages).includes('{{userRequest}}'));assert.equal(body.response_format?.type,mode==='native'?'json_schema':undefined);
});
