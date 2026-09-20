import {it,expect} from 'vitest';
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
  durable:{workbenchHost:{platform:'windows',capabilities:['task.files'],dispatch:async()=>null,catalog:[
   workbenchCapabilitySchema.parse({name:'files.read',schemaVersion:1,description:'读取当前任务文件',inputSchema:{type:'object'},resultSchema:{type:'object'},effects:['read'],requiredCapabilities:['task.files'],platforms:['macos','windows']}),
   workbenchCapabilitySchema.parse({name:'unexpected.read',schemaVersion:1,description:'未审查工具',inputSchema:{type:'object'},resultSchema:{type:'object'},effects:['read'],requiredCapabilities:['task.files'],platforms:['windows']}),
  ]}},
 };
 const result=await prepareChatReply(runtime as never,ctx as never,{conversation:{id:'c',projectId,scope:projectId?`project:${projectId}`:'global'},messages:[source],sourceMessage:source} as never);
 expect(result.hostContext.chatContext.surface).toBe(projectId?'project':'topics');
 expect(result.tools.map(t=>t.name)).toEqual(expect.arrayContaining(['skill.read','history.read','web.read','material.gather']));
 expect(result.hostContext.skillSnapshot.skills.map(s=>s.skillId)).toContain('method.research');
 expect(result.hostContext.skillSnapshot.skills.map(s=>s.skillId)).toContain('method.report');
 expect(result.system).toContain('method.report');
 expect(result.workbenchCapabilities.map(item=>item.name)).toEqual(['files.read']);
});
