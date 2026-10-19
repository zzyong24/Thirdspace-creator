import {expect,it} from 'vitest';
import {ENDPOINTS,workEditorTarget,workCreationTarget} from '../src/index';

const schema=ENDPOINTS.createMessage.body!;
const digest='sha256:'+'a'.repeat(64);
const editorTargets=[
 {schemaVersion:1,projectId:'project',outputId:'article-output',owner:'wechat_article',contentType:'article',savedBase:{kind:'artifact',artifactId:'article-artifact',versionId:'article-version'},documentDigest:digest,selection:{kind:'article_sections',sectionIds:['section'],field:'body',textRange:{startUtf16:0,endUtf16:2,expectedFieldDigest:digest}}},
 {schemaVersion:1,projectId:'project',outputId:'graphic-output',owner:'graphic_post',contentType:'image',savedBase:{kind:'artifact',artifactId:'graphic-artifact',versionId:'graphic-version'},documentDigest:digest,selection:{kind:'graphic_cards',cardIds:['card'],field:'body'}},
 {schemaVersion:1,projectId:'project',outputId:'video-output',owner:'production',contentType:'video',savedBase:{kind:'production',productionId:'production',revision:7},documentDigest:digest,selection:{kind:'native_scene',sceneId:'scene',elementRefs:[{trackId:'track',elementId:'element'}],playheadTick:120000,timeRange:{startTick:0,endTick:240000,ticksPerSecond:120000},contextEpoch:1,editorGeneration:'generation'}},
].map(value=>workEditorTarget.parse(value));
const creation={schemaVersion:1,clientRequestId:'public-creation-request',projectId:'project',compositionId:'composition',compositionRevision:3,scriptSourceRef:{kind:'project_script',id:'script',versionId:'script-version'},articleMember:{kind:'article',outputId:'article-output',artifactId:'article-artifact',baseVersionId:'article-version'},graphicMember:{kind:'image',outputId:'graphic-output',artifactId:'graphic-artifact',baseVersionId:'graphic-version'}};
const valid={content:'根据已保存稿件提出候选',attachments:['attachment']};

it('原公开operation身份、返回DTO和无选项消息原样保持',{timeout:180000,retry:0},()=>{
 expect(ENDPOINTS.createMessage.id).toBe('ai.conversations.messages.create');
 expect(ENDPOINTS.createMessage.method).toBe('POST');
 expect(ENDPOINTS.createMessage.path).toBe('/ai/conversations/:conversationId/messages');
 expect(schema.parse(valid)).toEqual(valid);
 expect(schema.parse({content:'原默认消息'})).toEqual({content:'原默认消息'});
});
it.each(['pi','codex'] as const)('公开引擎 %s 保真，不能丢弃后静默回Pi',{timeout:180000,retry:0},executionEngine=>{
 const input={...valid,executionEngine};expect(schema.parse(input)).toEqual(input);
});
it.each(editorTargets)('公开 $owner 目标完整复用原savedBase/digest/selection',{timeout:180000,retry:0},editorTarget=>{
 const input={...valid,executionEngine:'codex',chatContext:{editorTarget}};
 expect(schema.parse(input)).toEqual(input);
});
it('公开联合创作仅传真实目标，不接内部scriptConfirmation',{timeout:180000,retry:0},()=>{
 const input={...valid,executionEngine:'codex',chatContext:{creationTarget:creation}};
 expect(schema.parse(input)).toEqual(input);
});
it.each([
 {executionEngine:'other'},{executionEngine:null},{executionEngine:1},
 {chatContext:{}},{chatContext:null},
 {content:''},{content:123},{attachments:'attachment'},{attachments:[123]},
 {functionKey:'admin'},{projectId:'foreign'},{surface:'project'},{tools:[]},{deadlineMs:120000},
 {chatContext:{surface:'project',editorTarget:editorTargets[0]}},
 {chatContext:{projectId:'foreign',editorTarget:editorTargets[0]}},
 {chatContext:{editorTarget:editorTargets[0],creationTarget:creation}},
 {chatContext:{editorTarget:{...editorTargets[0],ownerProof:'forged'}}},
 {chatContext:{editorTarget:{...editorTargets[0],savedBase:{kind:'production',productionId:'forged',revision:7}}}},
 {chatContext:{editorTarget:{...editorTargets[2],selection:{...editorTargets[2]!.selection,timeRange:{startTick:0,endTick:240000,ticksPerSecond:1000}}}}},
 {chatContext:{creationTarget:{...creation,scriptConfirmation:{confirmedBy:'user',source:'current-click'}}}},
 {chatContext:{creationTarget:{...creation,scriptConfirmation:{confirmedBy:'user',source:'public-request'}}}},
 {chatContext:{creationTarget:{...creation,compositionRevision:0}}},
 {chatContext:{creationTarget:{...creation,scriptSourceRef:{kind:'project_script',id:'script'}}}},
 {chatContext:{creationTarget:{...creation,articleMember:{...creation.articleMember,kind:'image'}}}},
])('严格拒绝非法字段/类型/内部声明 %#',{timeout:180000,retry:0},extra=>{
 expect(schema.safeParse({...valid,...extra}).success).toBe(false);
});
it('原current-click完整目标原样保持，新public-request只允许内部目标合同',{timeout:180000,retry:0},()=>{
 const old={...creation,scriptConfirmation:{confirmedBy:'user',source:'current-click'}};
 expect(workCreationTarget.parse(old)).toEqual(old);
 const internal={...creation,scriptConfirmation:{confirmedBy:'user',source:'public-request'}};
 expect(workCreationTarget.parse(internal)).toEqual(internal);
 expect(schema.safeParse({...valid,chatContext:{creationTarget:internal}}).success).toBe(false);
});
