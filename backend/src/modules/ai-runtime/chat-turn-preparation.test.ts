import {it,expect} from 'vitest';
import {runWithEffectiveSkillSnapshot} from '@creatoros/ai-worker';
import {workEditorTarget,type WorkEditorTarget} from '@creatoros/contract';
import {prepareChatTurn} from './chat-turn-preparation';
import {prepareChatToolDefinitions} from './chat-tool-definitions';
import {resolveSkillForSurface} from './chat-context';
const ctx={userId:'owner-prepare-user',accountId:null,groupId:'owner-group',requestId:'prepare',source:'user' as const};
const snapshot={snapshotVersion:1,userId:ctx.userId,accountId:null,groupId:ctx.groupId,resolvedAt:'2026-10-15T00:00:00.000Z',platformPolicyVersion:'test',platformPolicy:'只产候选',skills:[{skillId:resolveSkillForSurface('project'),baseVersion:'owner-prepare-1',overlayRevision:null,overlayVersion:null,effective:{methodSystem:'先读取原稿再产生候选',template:'',tools:['work.editor.read','work.editor.propose'],requiredFacets:[],contextRequirements:[],outputSchema:null,completionPolicy:null,completionPolicyAdapter:null}}]};
it.each(['wechat_article','graphic_post','production'] as const)('T1300 %s内层原型与外层最终冻结均使用同一明确owner协议',async owner=>{
 const target=workEditorTarget.parse({schemaVersion:1,projectId:'p',outputId:'o',owner,contentType:owner==='wechat_article'?'article':owner==='graphic_post'?'image':'video',savedBase:owner==='production'?{kind:'production',productionId:'production',revision:1}:{kind:'artifact',artifactId:'artifact',versionId:'version'},documentDigest:`sha256:${'a'.repeat(64)}`,selection:owner==='production'?{kind:'native_scene',sceneId:'scene',elementRefs:[],playheadTick:0,contextEpoch:1,editorGeneration:'gen'}:owner==='wechat_article'?{kind:'article',sectionIds:[]}:{kind:'graphic_post',cardIds:[]}});
 let reads=0;
 const prepared=await runWithEffectiveSkillSnapshot(snapshot as never,()=>prepareChatTurn(ctx,{executionEngine:'codex',messages:[{id:'source',role:'user',parts:[{type:'text',text:'修改当前已保存作品'}]}],chatContext:{surface:'project',projectId:'p',editorTarget:target}},{humanizeError:()=>null,readEditorTarget:async(_c:unknown,t:WorkEditorTarget)=>{reads++;return structuredClone(t);},contextReaders:{}} as never));
 expect(reads).toBe(1);
 const defs=prepared.toolDefinitions.filter(tool=>tool.name.startsWith('work.editor.'));
 expect(defs).toHaveLength(2);
 for(const def of defs)expect(def.version).toMatch(new RegExp(`^chat-tools-work-editor-owner-v1-${owner}:`));
 const rebuilt=await prepareChatToolDefinitions(prepared.assembly.tools,{workEditorOwner:owner});
 expect(rebuilt.definitions).toEqual(prepared.toolDefinitions);
});
