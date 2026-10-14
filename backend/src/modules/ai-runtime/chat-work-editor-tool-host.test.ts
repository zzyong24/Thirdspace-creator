import { it, expect } from 'vitest';
import { buildChatTools } from './chat-tools';
import { prepareChatToolDefinitions } from './chat-tool-definitions';
import { createChatWorkEditorToolHost } from './chat-work-editor-tool-host';
import { workEditorContentDigest } from './work-editor-candidate';
import type { WorkEditorTarget } from '@creatoros/contract';
const ctx = { userId: 'u', accountId: 'a', groupId: 'g', source: 'user' as const, requestId: 'r' }, ref = { executionTaskId: 'task', attempt: 1, fenceToken: 'fence' };
it('T1097 模型实际read逐文件返回原文后结构化截断通知，短文不伪截断',async()=>{
 const {createWorkWritingContext}=await import('../../application/generation/work-writing-context');
 const long='原始😀资料'.repeat(15000),short='完整短资料';
 const writingContext={schemaVersion:1 as const,brandProfileVersionId:null,sourceAssets:[{assetId:'long',assetFileId:'long-f'},{assetId:'short',assetFileId:'short-f'},{assetId:'second',assetFileId:'second-f'}]};
 const resolved=await createWorkWritingContext({assertProject:async()=>{},readCenter:async()=>{throw Error('中性不读品牌');},readStatement:async()=>{throw Error('中性不读品牌');},readDocument:async(_ctx,_project,id)=>({label:id,text:id==='short'?short:long})}).resolve(ctx,'p',writingContext);
 const document={schemaVersion:1 as const,title:'原文',summary:'',sections:[],factItems:[],visualBriefs:[],imageUses:[]};
 const target:WorkEditorTarget={schemaVersion:1,projectId:'p',outputId:'o',owner:'wechat_article',contentType:'article',savedBase:{kind:'artifact',artifactId:'artifact',versionId:'v'},documentDigest:workEditorContentDigest(document),selection:{kind:'article',sectionIds:[]},writingContext};
 const definitions=(await prepareChatToolDefinitions(buildChatTools(['work.editor.read','work.editor.propose'],{humanizeError:()=>null} as any),{workWritingContext:true})).definitions;
 const host=createChatWorkEditorToolHost({read:async()=>({context:ctx,hostContext:{chatContext:{surface:'project',projectId:'p',editorTarget:target},resolvedWritingContext:resolved},modelInput:{tools:definitions}})} as any,{readArticle:async()=>({projectId:'p',outputId:'o',artifactId:'artifact',currentVersionId:'v',current:document,versions:[]}),readGraphicPost:async()=>{throw Error('不读');},readProduction:async()=>{throw Error('不读');},readMedia:async()=>{throw Error('不读');}});
 const signal=new AbortController().signal,tools=await host(ctx,{} as any,ref,signal);
 const outcome=await tools['work.editor.read']!.execute!(ctx,{view:'document'},{execution:ref,aiTaskId:'ai',callId:'call',toolCallId:'tool',signal});
 const actual=(outcome.data as {resolvedWritingContext:typeof resolved}).resolvedWritingContext;
 expect(actual).toEqual(resolved);
 expect(actual.sourceMaterials.map(item=>item.text)).toEqual([long.slice(0,60000),short,long.slice(0,60000)]);
 expect(actual.sourceMaterials.map(item=>({originalLength:item.originalLength,providedLength:item.providedLength,truncated:item.truncated}))).toEqual([{originalLength:long.length,providedLength:60000,truncated:true},{originalLength:short.length,providedLength:short.length,truncated:false},{originalLength:long.length,providedLength:60000,truncated:true}]);
 for(const item of actual.sourceMaterials){const keys=Object.keys(item);for(const notification of ['originalLength','providedLength','truncated'])expect(keys.indexOf(notification)).toBeGreaterThan(keys.indexOf('text'));}
});
it('原短host严格核三维owner/冻结effect版本并只产原owner候选', async () => {
    const document = { schemaVersion: 1 as const, title: '真实文章', summary: '摘要', sections: [{ sectionId: 's', order: 0, heading: '原标题', headingLevel: 2, body: '原正文', sourceRefs: [] }], factItems: [], visualBriefs: [], imageUses: [] };
    const target: WorkEditorTarget = { schemaVersion: 1, projectId: 'p', outputId: 'o', owner: 'wechat_article', contentType: 'article', savedBase: { kind: 'artifact', artifactId: 'a', versionId: 'v' }, documentDigest: workEditorContentDigest(document), selection: { kind: 'article_sections', sectionIds: ['s'] } };
    const defs = (await prepareChatToolDefinitions(buildChatTools(['work.editor.read', 'work.editor.propose'], { humanizeError: () => null } as any))).definitions;
    let version = 'v';
    let frozen: any = { context: ctx, hostContext: { chatContext: { surface: 'project', projectId: 'p', editorTarget: target } }, modelInput: { tools: defs } };
    const host = createChatWorkEditorToolHost({ read: async () => frozen } as any, { readArticle: async () => ({ projectId: 'p', outputId: 'o', artifactId: 'a', currentVersionId: version, current: document, versions: [] }), readGraphicPost: async () => { throw Error('不应读'); }, readProduction: async () => { throw Error('不应读'); }, readMedia: async () => { throw Error('不应读'); } });
    const signal = new AbortController().signal, tools = await host(ctx, {} as any, ref, signal);
    expect(Object.keys(tools)).toEqual(['work.editor.read', 'work.editor.propose']);
    const out = await tools['work.editor.read']!.execute!(ctx, { view: 'selection' }, { execution: ref, aiTaskId: 'ai', callId: 'call', toolCallId: 'tool', signal });
    expect(out).toMatchObject({ status: 'ok', sideEffect: 'none', data: { kind: 'work.editor.context', selected: [{ sectionId: 's', body: '原正文' }] } });
    version = 'changed';
    const conflict = await tools['work.editor.read']!.execute!(ctx, { view: 'selection' }, { execution: ref, aiTaskId: 'ai', callId: 'conflict', toolCallId: 'conflict', signal });
    expect(conflict).toMatchObject({ status: 'error', sideEffect: 'none', data: { kind: 'work.editor.context', target, failureCode: 'conflict', error: expect.stringContaining('版本') } });
    version = 'v';
    await expect(host({ ...ctx, accountId: 'foreign-same-group' }, {} as any, ref, signal)).rejects.toThrow('账号组');
    frozen = { ...frozen, modelInput: { tools: [{ ...defs[0], effect: 'proposal' }] } };
    await expect(host(ctx, {} as any, ref, signal)).rejects.toThrow('定义');
    frozen = { ...frozen, modelInput: { tools: [{ ...defs[0], version: 'forged' }] } };
    await expect(host(ctx, {} as any, ref, signal)).rejects.toThrow('定义');
});

it.each([false,true])('T1274旧冻结协议按原版本恢复，现有writing context=%s不改schema/effect/hash',async hasWriting=>{
 const document={schemaVersion:1 as const,title:'旧任务',summary:'',sections:[],factItems:[],visualBriefs:[],imageUses:[]};
 const target:WorkEditorTarget={schemaVersion:1,projectId:'p',outputId:'o',owner:'wechat_article',contentType:'article',savedBase:{kind:'artifact',artifactId:'artifact',versionId:'v'},documentDigest:workEditorContentDigest(document),selection:{kind:'article',sectionIds:[]}};
 for(const version of [1,2]){
  const tools=buildChatTools(['work.editor.read','work.editor.propose'],{humanizeError:()=>null,legacyWorkEditorProtocol:true} as any);
  const definitions=(await prepareChatToolDefinitions(tools,{legacyWorkEditorProtocol:true,workWritingContext:version===2})).definitions;
  const frozen:any={context:ctx,hostContext:{chatContext:{surface:'project',projectId:'p',editorTarget:target},...(hasWriting?{resolvedWritingContext:{frozen:'原任务来源'}}:{})},modelInput:{tools:definitions}};
  const host=createChatWorkEditorToolHost({read:async()=>frozen} as any,{readArticle:async()=>({projectId:'p',outputId:'o',artifactId:'artifact',currentVersionId:'v',current:document,versions:[]}),readProduction:async()=>{throw Error('不读');},readMedia:async()=>{throw Error('不读');}});
  const actual=await host(ctx,{} as any,ref,new AbortController().signal);expect(Object.keys(actual)).toEqual(['work.editor.read','work.editor.propose']);for(const definition of definitions)expect(actual[definition.name]?.version).toBe(definition.version);
  const readTool=actual['work.editor.read'];if(!readTool?.execute)throw Error('旧read执行器缺失');const read=await readTool.execute(ctx,{view:'document'},{execution:ref,aiTaskId:'ai',callId:'legacy',toolCallId:'legacy',signal:new AbortController().signal});expect(read.status).toBe('ok');
  frozen.modelInput.tools=[definitions[0],{...definitions[1],version:definitions[1]!.version.replace(`director-v${version}`,`director-v${version===1?2:1}`)}];
  await expect(host(ctx,{} as any,ref,new AbortController().signal)).rejects.toThrow(/定义/);
 }
});
