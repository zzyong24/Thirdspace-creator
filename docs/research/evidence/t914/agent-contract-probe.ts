import { toPiCustomTool } from '../../../../backend/src/modules/execution/agentic/pi-engine.ts';
import { createResearchTools } from '../../../../backend/src/modules/execution/agentic/adapters/research-adapter.ts';
import { createAgenticExecutor } from '../../../../backend/src/modules/execution/agentic/agentic-executor.ts';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
async function main() {
 const signal=new AbortController().signal;
 const tools=createResearchTools({webSearch:async()=>({grounding:'web',results:[{title:'审计受控证据',url:'https://example.com/evidence-t914',snippet:'proof-text-t914'}]}),webRead:async()=>({needLogin:false,title:'受控网页',sourceUrl:'https://example.com/evidence-t914',fullText:'proof-body-t914'}),knowledgeWrite:async()=>({pendingId:'fixture-pending'})});
 const bridge=toPiCustomTool(tools[0],{decideDryRun:()=>false,signal,onStep:async()=>{},toolLog:[],outputs:{}}) as any;
 const result=await bridge.execute('audit',{query:'审计'});
 console.log(JSON.stringify({probe:'工具内容桥接（注入静态端口，未访问网页）',modelContent:result.content,detailsHasUrl:JSON.stringify(result.details).includes('evidence-t914'),modelContentHasUrl:JSON.stringify(result.content).includes('evidence-t914')}));
 const outDir=await mkdtemp(join(tmpdir(),'creatoros-t914-'));
 try {
 const ex=createAgenticExecutor({taskType:'agentic.research',engine:{name:'pi',run:async()=>({summary:'模拟模型失败',output:{},steps:0,stopReason:'llm_error'})},resolveLlm:()=>async()=>({text:'',tokensUsed:0}),resolveTools:()=>tools,defaultBudget:{maxSteps:8,maxTokens:20000}});
 const r=await ex.run({outDir,inputs:[]} as any,{goal:'受控审计'},{signal,reportStep:async()=>{},ctx:{userId:'fixture-user',accountId:'fixture-account',source:'user',requestId:'t914'}} as any);
 console.log(JSON.stringify({probe:'失败终态（注入假引擎，不调模型）',returnedNormally:true,meta:r.meta,artifact:JSON.parse(await readFile(join(outDir,'agentic-result.json'),'utf8'))}));
 } finally {await rm(outDir,{recursive:true,force:true})}
}
main();
