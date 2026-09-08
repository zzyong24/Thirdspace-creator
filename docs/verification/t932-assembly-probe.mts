import {prepareDurableChatTurn} from '../../backend/src/modules/ai-runtime/chat-turn-preparation.ts';
import {registerAllTemplates,getTemplate} from '../../ai-worker/src/index.ts';
import {requiredSkillIdsForTask} from '../../backend/src/modules/ai-runtime/effective-skill-snapshot.ts';
registerAllTemplates();
const ids=[...new Set([...requiredSkillIdsForTask('chat.sync',{surface:'project'}),'topic.enrich','positioning.generate','calibration.diagnose','topic.generate','review.insights','knowledge.distill'])].sort();
const snapshot={snapshotVersion:1,userId:'probe-user',accountId:'probe-account',resolvedAt:'2026-09-08T00:00:00.000Z',platformPolicyVersion:'probe-v1',platformPolicy:'探针平台规则',skills:ids.map(skillId=>{const t=getTemplate(skillId);return {skillId,baseVersion:t.version,overlayRevision:null,overlayVersion:null,effective:{methodSystem:t.system,template:t.template,tools:t.tools??[],requiredFacets:t.requiredFacets??[],contextRequirements:t.contextRequirements??[],outputSchema:null,completionPolicy:null,completionPolicyAdapter:null}};})};
const calls:string[]=[];
const deps={humanizeError:()=>null,positioning:{getPositioningCenter:async()=>{calls.push('positioning');return {profile:null,currentStatement:null};}},learnings:{getSuggestions:async()=>[]},signals:{list:async()=>[]},knowledge:{list:async()=>[]},accounts:{list:async()=>[]},contextReaders:{getProjectDetail:async()=>{calls.push('project.detail');return {id:'probe-project',title:'探针项目',stage:'planning',status:'active',publish:{published:false,platform:null,publishedAt:null},brief:{},artifacts:[]};}},searchWeb:async()=>{throw Error('PROBE_SEARCH_FORBIDDEN');}};
const options={workerScriptDraft:true,workerWebRead:true,workerResearch:true,atomicCoverGenerate:true,atomicAgenticResearch:true,atomicMaterialGenerate:true,atomicScriptReview:true,atomicPublishPackage:true,scriptHooksGeneration:{version:1,maxOutputTokens:4096},structuredGeneration:{version:1,maxOutputTokens:8192}};

for(const mode of ['official','old-frozen','override']){
 const frozen=structuredClone(snapshot);
 if(mode==='old-frozen')frozen.skills=frozen.skills.filter(s=>s.skillId!=='research.plan'&&!s.skillId.startsWith('method.')); 
 if(mode==='override'){const plan=frozen.skills.find(s=>s.skillId==='research.plan')!;plan.effective.methodSystem='PROBE_RESEARCH_METHOD_OVERRIDE';plan.effective.template='PROBE_RESEARCH_TEMPLATE_OVERRIDE';}
 const text='围绕独立开发者收款主题找可用案例和资料';
 try{
 const result=await prepareDurableChatTurn({userId:'probe-user',accountId:'probe-account',correlationId:'probe'}, {messages:[{id:'probe-message',role:'user',parts:[{type:'text',text}]}],chatContext:{surface:'project',projectId:'probe-project',functionKey:'material.gather'},trustedScriptSources:[{ref:'message:probe-message',label:'用户输入',text,truncated:false,sourceType:'message',sourceId:'probe-message'}]},deps as never,frozen as never,options as never);
 const system=result.assembly.system;
 const checks={forcedToolAbsent:result.assembly.forcedTool===undefined,readTool:!!result.assembly.tools['skill.read'],historyTool:!!result.assembly.tools['history.read'],methodBodyAbsent:!system.includes('每次读取真实搜索结果后'),catalog:system.includes('可按需读取的方法目录')};
 const pass=checks.forcedToolAbsent&&checks.methodBodyAbsent&&(mode==='old-frozen'?!checks.readTool:checks.readTool&&checks.historyTool&&checks.catalog);

 console.log(JSON.stringify({mode,pass,checks,toolCount:result.toolDefinitions.length}));if(!pass)process.exitCode=1;
 }catch(error){console.log(JSON.stringify({mode,pass:false,error:String(error)}));process.exitCode=1;}
}
