import {it,expect,vi} from 'vitest';
import {prepareChatReply} from './prepare-chat-reply';
import {workbenchCapabilitySchema} from '@creatoros/contract/agent-workbench';
import {registerAllTemplates,getTemplate} from '@creatoros/ai-worker';
registerAllTemplates();
it.each([null,'probe-project'])('公开聊天实际装配接受默认场景并包含方法与搜索工具 %s',async projectId=>{
 const ctx={userId:'probe-user',accountId:'probe-account',requestId:'probe'};
 const source={id:'m',role:'user',content:'找三篇官方工程实践文章，读正文后整理阅读建议',parts:[],attachments:[],createdAt:'2026-09-08T00:00:00.000Z'};
 const runtime={
  resolveEffectiveSkillSnapshot:async(_ctx:unknown,ids:string[])=>({snapshotVersion:1,userId:ctx.userId,accountId:ctx.accountId,resolvedAt:source.createdAt,platformPolicyVersion:'1',platformPolicy:'平台规则',skills:[...new Set(ids)].sort().map(skillId=>{const t=getTemplate(skillId);return {skillId,baseVersion:t.version,overlayRevision:null,overlayVersion:null,effective:{methodSystem:t.system,template:t.template,tools:t.tools??[],requiredFacets:t.requiredFacets??[],contextRequirements:t.contextRequirements??[],outputSchema:null,completionPolicy:null,completionPolicyAdapter:null}};})}),
  context:{positioning:{getPositioningCenter:async()=>({profile:null,currentStatement:null})},learnings:{getSuggestions:async()=>[]},signals:{list:async()=>[]},knowledge:{list:async()=>[]},accounts:{list:async()=>[]}},
  contextReaders:{getProjectDetail:async()=>({id:projectId,title:'项目',stage:'planning',status:'active',publish:{published:false,platform:null,publishedAt:null},brief:{},artifacts:[]})},
  searchWeb:async()=>{throw Error('不得在装配时调用网络');},
  durable:{workbenchHost:{platform:'macos',capabilities:['task.files','task.browser'],dispatch:async()=>null,catalog:[
   workbenchCapabilitySchema.parse({name:'files.read',schemaVersion:1,description:'读取当前任务文件',inputSchema:{type:'object'},resultSchema:{type:'object'},effects:['read'],requiredCapabilities:['task.files'],platforms:['macos','windows']}),
   workbenchCapabilitySchema.parse({name:'browser.navigate',schemaVersion:1,description:'在已授权站点域内导航当前 Lane',inputSchema:{type:'object',properties:{laneId:{type:'string',minLength:1,maxLength:128},browserEpoch:{type:'integer',minimum:1},url:{type:'string',format:'uri',maxLength:4096}},required:['laneId','browserEpoch','url'],additionalProperties:false},resultSchema:{type:'object'},effects:['read'],requiredCapabilities:['task.browser'],platforms:['macos']}),
   workbenchCapabilitySchema.parse({name:'unexpected.read',schemaVersion:1,description:'未审查工具',inputSchema:{type:'object'},resultSchema:{type:'object'},effects:['read'],requiredCapabilities:['task.files'],platforms:['windows']}),
  ]}},
 };
 const result=await prepareChatReply(runtime as never,ctx as never,{conversation:{id:'c',projectId,scope:projectId?`project:${projectId}`:'global'},messages:[source],sourceMessage:source} as never);
 expect(result.hostContext.chatContext.surface).toBe(projectId?'project':'topics');
 expect(result.tools.map(t=>t.name)).toEqual(expect.arrayContaining(['skill.read','history.read','web.read','material.gather']));
 expect(result.hostContext.skillSnapshot.skills.map(s=>s.skillId)).toContain('method.research');
 expect(result.hostContext.skillSnapshot.skills.map(s=>s.skillId)).toContain('method.report');
 expect(result.system).toContain('method.report');
 expect(result.workbenchCapabilities.map(item=>item.name)).toEqual(['files.read','browser.navigate']);
});

const creationTarget={schemaVersion:1,clientRequestId:'creation-neutral-request',projectId:'probe-project',compositionId:'composition-1',compositionRevision:3,scriptSourceRef:{kind:'project_script',id:'script-1',versionId:'script-version-1'},scriptConfirmation:{confirmedBy:'user',source:'current-click'},articleMember:{kind:'article',outputId:'article-1',artifactId:'article-artifact',baseVersionId:'article-version'},graphicMember:{kind:'image',outputId:'graphic-1',artifactId:'graphic-artifact',baseVersionId:'graphic-version'}};
function creationRuntime(){
 const owner={userId:'probe-user',accountId:null,groupId:'probe-group',requestId:'probe'};
 const source={id:'m',role:'user',content:'根据当前已确认脚本一起生成文章和图文候选',parts:[],attachments:[],createdAt:'2026-10-07T00:00:00.000Z'};
 const runtime={
  resolveEffectiveSkillSnapshot:async(_ctx:unknown,ids:string[])=>({snapshotVersion:1,userId:owner.userId,accountId:null,groupId:owner.groupId,resolvedAt:source.createdAt,platformPolicyVersion:'1',platformPolicy:'平台规则',skills:[...new Set(ids)].sort().map(skillId=>{const t=getTemplate(skillId);return {skillId,baseVersion:t.version,overlayRevision:null,overlayVersion:null,effective:{methodSystem:t.system,template:t.template,tools:t.tools??[],requiredFacets:t.requiredFacets??[],contextRequirements:t.contextRequirements??[],outputSchema:null,completionPolicy:null,completionPolicyAdapter:null}};})}),
  context:{positioning:{getPositioningCenter:async()=>({profile:null,currentStatement:null})},learnings:{getSuggestions:async()=>[]},signals:{list:async()=>[]},knowledge:{list:async()=>[]},accounts:{list:async()=>[]}},
  contextReaders:{getProjectDetail:async()=>({id:'probe-project',title:'中性脚本项目',stage:'planning',status:'active',publish:{published:false,platform:null,publishedAt:null},brief:{},artifacts:[]})},
  readCreationTarget:vi.fn(async()=>structuredClone(creationTarget)),
  searchWeb:async()=>{throw Error('准备阶段不得调用网络或生成');},
 };
 const snapshot={conversation:{id:'c',projectId:'probe-project',scope:'project:probe-project'},messages:[source],sourceMessage:source};
 return {owner,runtime,snapshot};
}
it('正式准备把显式确认脚本交原只读owner核验后冻结，联合创作保留完整工具和输出预算',async()=>{
 const f=creationRuntime();
 const result=await prepareChatReply(f.runtime as never,f.owner as never,f.snapshot as never,{chatContext:{surface:'project',projectId:'probe-project',creationTarget} as never});
 expect(f.runtime.readCreationTarget).toHaveBeenCalledWith(f.owner,creationTarget);
 expect(result.hostContext.chatContext.creationTarget).toEqual(creationTarget);
 expect(result.tools.map(t=>t.name)).toEqual(expect.arrayContaining(['work.creation.read','work.creation.propose']));
 expect(result.maxOutputTokens).toBe(32768);
});
it('显式creation基点漂移在共同公开准备端口停止，不修改用户保存的target',async()=>{
 const f=creationRuntime();f.runtime.readCreationTarget.mockRejectedValueOnce(Error('作品成员或已保存版本已变化。'));
 await expect(prepareChatReply(f.runtime as never,f.owner as never,f.snapshot as never,{chatContext:{surface:'project',projectId:'probe-project',creationTarget} as never})).rejects.toThrow('已变化');
 expect(creationTarget.compositionRevision).toBe(3);
});
