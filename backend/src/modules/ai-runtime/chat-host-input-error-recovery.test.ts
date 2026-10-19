import {expect,it,vi} from 'vitest';
import {buildChatTools,type ChatToolDeps} from './chat-tools';
import {prepareChatToolDefinitions} from './chat-tool-definitions';
import {createChatWorkCreationToolHost} from './chat-work-creation-tool-host';
import {ChatToolUserError} from './chat-tool-errors';

const ctx={userId:'host-error-user',accountId:null,groupId:'host-error-group',requestId:'test',source:'user' as const};
const ref={executionTaskId:'host-error-execution',attempt:1,fenceToken:'host-error-fence'},signal=new AbortController().signal;
const sourceRef={kind:'project_script' as const,id:'script',versionId:'script-version'};
const target={schemaVersion:1,clientRequestId:'source-recovery',projectId:'project',compositionId:'composition',compositionRevision:1,scriptSourceRef:sourceRef,scriptConfirmation:{confirmedBy:'user',source:'public-request'},articleMember:{kind:'article',outputId:'article',artifactId:'article-artifact',baseVersionId:'article-version'},graphicMember:{kind:'image',outputId:'graphic',artifactId:'graphic-artifact',baseVersionId:'graphic-version'}};
const input={targetDigest:'a'.repeat(64),article:{schemaVersion:1,title:'标题',summary:'摘要',sections:[],factItems:[],visualBriefs:[],imageUses:[]},graphic:{schemaVersion:1,title:'标题',body:'正文',summary:'摘要',tags:[],imageUses:[],cardBriefs:[],sourceRefs:[],ruleSnapshotRef:null}};
async function fixture(error:Error,version?:1){
 const ports={read:vi.fn(),propose:vi.fn(async()=>{throw error;})};
 const prototypes=buildChatTools(['work.creation.read','work.creation.propose'],{humanizeError:()=>null,creationTarget:target,readWorkCreation:ports.read,proposeWorkCreation:ports.propose} as unknown as ChatToolDeps);
 const definitions=(await prepareChatToolDefinitions(prototypes)).definitions;
 const frozen={context:ctx,hostContext:{chatContext:{surface:'project',projectId:target.projectId,creationTarget:target}},modelInput:{tools:definitions},...(version===1?{toolFailureReceiptVersion:1}:{})};
 const reader={read:vi.fn(async()=>structuredClone(frozen))};
 const tools=await createChatWorkCreationToolHost(reader as never,ports)(ctx,{} as never,ref,signal);
 const result=await tools['work.creation.propose']!.execute!(ctx,input,{execution:ref,aiTaskId:'host-error-task',callId:'host-error-call',toolCallId:'host-error-tool',signal});
 return {result,tools,definitions,ports,reader};
}
it('新冻结版本将真实安全类输入拒绝交给模型，旧完整outcome仍保持通用格式',async()=>{
 const message='article.titleSourceRefs 缺少同一 scriptSourceRef，请复制本次真实读取。';
 const modern=await fixture(new ChatToolUserError(message),1);
 expect(modern.result).toMatchObject({status:'error',summary:message,error:{code:'invalid_input',retryable:false,recovery:message},sideEffect:'none',data:{kind:'work.creation.propose',error:message}});
 const old=await fixture(new ChatToolUserError(message));
 expect(old.result).toEqual({status:'error',summary:'读取未完成，可检查权限与目标状态后继续',evidence:[],error:{code:'no_evidence',retryable:false,recovery:'读取未完成，可检查权限与目标状态后继续'},continuation:null,sideEffect:'none',data:{article:null,graphic:null,articleDigest:null,graphicDigest:null,kind:'work.creation.propose',error:'读取未完成，可检查权限与目标状态后继续'}});
 expect(modern.definitions).toEqual(old.definitions);
 expect(modern.tools['work.creation.propose']!.version).toBe(old.tools['work.creation.propose']!.version);
 expect(modern.ports.propose).toHaveBeenCalledWith(ctx,expect.any(Object),expect.objectContaining({targetDigest:input.targetDigest}));
});
it.each([new Error('secret-token 私有原始正文'),Object.assign(new Error('private 原因'),{name:'ChatToolUserError'})])('新格式不将未知错误或同名伪类透给模型',async error=>{
 const f=await fixture(error,1);expect(f.result).toMatchObject({status:'error',error:{code:'no_evidence'},sideEffect:'none'});expect(JSON.stringify(f.result)).not.toContain('secret-token');expect(JSON.stringify(f.result)).not.toContain('private');
});
it.each([{statusCode:401,status:'blocked',code:'permission',retryable:false},{statusCode:403,status:'blocked',code:'permission',retryable:false},{statusCode:503,status:'error',code:'transient',retryable:true}])('原 $statusCode 权限/暂时失败不被变成可改参的业务错误',async expected=>{
 const error=Object.assign(new Error('private-provider-token'),{statusCode:expected.statusCode}),old=await fixture(error),modern=await fixture(error,1);
 expect(modern.result).toEqual(old.result);
 expect(modern.result).toMatchObject({status:expected.status,error:{code:expected.code,retryable:expected.retryable},sideEffect:'none'});
 expect(JSON.stringify(modern.result)).not.toContain('private-provider-token');
});
