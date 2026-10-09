import {expect,it,vi} from 'vitest';
import {createWorkCreationRoot} from './work-creation-root';
import {ChatToolUserError} from '../../modules/ai-runtime/chat-tool-errors';

const ctx={userId:'neutral-user',accountId:null,groupId:'neutral-group',requestId:'neutral-request',source:'user' as const};
const ref={kind:'project_script' as const,id:'script-1',versionId:'script-version-1'};
const article={schemaVersion:1 as const,title:'主题',titleSourceRefs:[ref],summary:'说明',summarySourceRefs:[ref],sections:[{sectionId:'s1',order:0,heading:'主题',headingLevel:2,body:'已确认事实',sourceRefs:[ref]}],factItems:[],visualBriefs:[],imageUses:[]};
const graphic={schemaVersion:1 as const,title:'主题',body:'正文',summary:'说明',tags:[],imageUses:[],cardBriefs:[{cardId:'c1',title:'第一张',body:'已确认事实',sourceRefs:[ref]}],sourceRefs:[ref],ruleSnapshotRef:null};
const target={schemaVersion:1 as const,clientRequestId:'neutral-creation-request',projectId:'project-1',compositionId:'composition-1',compositionRevision:3,scriptSourceRef:ref,scriptConfirmation:{confirmedBy:'user' as const,source:'current-click' as const},articleMember:{kind:'article' as const,outputId:'article-1',artifactId:'article-artifact',baseVersionId:'article-version'},graphicMember:{kind:'image' as const,outputId:'graphic-1',artifactId:'graphic-artifact',baseVersionId:'graphic-version'}};
function fixture(){
 const composition={compositionId:target.compositionId,projectId:target.projectId,currentRevision:3,current:{members:[{member:{kind:'article',outputId:'article-1'}},{member:{kind:'image',outputId:'graphic-1'}}]},memberCurrent:[{availability:'available',member:{kind:'article',outputId:'article-1'},currentVersion:{kind:'artifact',artifactId:'article-artifact',versionId:'article-version'}},{availability:'available',member:{kind:'image',outputId:'graphic-1'},currentVersion:{kind:'artifact',artifactId:'graphic-artifact',versionId:'graphic-version'}}]};
 const ports={compositions:{get:vi.fn(async()=>composition)},articles:{getArticle:vi.fn(async()=>({projectId:'project-1',outputId:'article-1',artifactId:'article-artifact',currentVersionId:'article-version',current:article})),getVersion:vi.fn(async()=>({versionId:'article-version',document:article}))},graphicPosts:{getGraphicPost:vi.fn(async()=>({projectId:'project-1',outputId:'graphic-1',artifactId:'graphic-artifact',currentVersionId:'graphic-version',current:graphic})),getVersion:vi.fn(async()=>({versionId:'graphic-version',document:graphic}))},script:{readVersion:vi.fn(async(_ctx,source)=>{if(source.id!==ref.id||source.versionId!==ref.versionId)throw Error('原脚本版本不存在');return {ref,label:'已保存主脚本',text:'这一份确认脚本'};}),readImages:vi.fn(async()=>({state:'empty' as const,images:[]}))}};
 return {ports,composition,service:createWorkCreationRoot(ports as never)};
}
it('只读取显式共同脚本与两个真实成员，经各属主核当前版本，proposal不写正式稿',async()=>{
 const f=fixture(),read=await f.service.read(ctx,target);expect(read.scriptText).toBe('这一份确认脚本');expect(read.target).toEqual(target);
 expect(f.ports.script.readVersion).toHaveBeenCalledWith(ctx,ref,target.projectId);
 const result=await f.service.propose(ctx,target,{targetDigest:read.targetDigest,article,graphic});expect(result).toMatchObject({kind:'work.creation.propose',article,graphic,error:null});
 expect(Object.keys(f.ports)).toEqual(['compositions','articles','graphicPosts','script']);
});
it('组合修订或实际成员变更时不猜另一个作品',async()=>{
 const f=fixture();f.composition.currentRevision=4;await expect(f.service.read(ctx,target)).rejects.toThrow();
 f.composition.currentRevision=3;f.composition.current.members[1]!.member.outputId='other-output';await expect(f.service.read(ctx,target)).rejects.toThrow();
});
it('显式源不存在、owner版本漂移与非本组读取均不生成可采用候选',async()=>{
 const f=fixture();await expect(f.service.read(ctx,{...target,scriptSourceRef:{...ref,versionId:'other-version'}})).rejects.toThrow();
 f.ports.articles.getArticle.mockResolvedValue({...await f.ports.articles.getArticle(),currentVersionId:'new-version'});await expect(f.service.read(ctx,target)).rejects.toThrow();
 f.ports.compositions.get.mockRejectedValue(Error('跨组拒绝'));await expect(f.service.read({...ctx,groupId:'other-group'},target)).rejects.toThrow('跨组拒绝');
});
it('超过60k的两份完整候选保持全文与来源，未知exact图片被拒',async()=>{
 const f=fixture(),read=await f.service.read(ctx,target);const large={...article,sections:[{...article.sections[0]!,body:'长正文。'.repeat(22000)}]};
 const result=await f.service.propose(ctx,target,{targetDigest:read.targetDigest,article:large,graphic});expect(result.article).toEqual(large);expect(result.graphic).toEqual(graphic);
 await expect(f.service.propose(ctx,target,{targetDigest:read.targetDigest,article,graphic:{...graphic,imageUses:[{assetId:'fake',assetFileId:'fake-file',order:0,role:'cover'}]}})).rejects.toThrow();
});
it('目标摘要或共同脚本引用篡改不被修补成另一份稿',async()=>{
 const f=fixture(),read=await f.service.read(ctx,target);
 await expect(f.service.propose(ctx,target,{targetDigest:'0'.repeat(64),article,graphic})).rejects.toThrow();
 await expect(f.service.propose(ctx,target,{targetDigest:read.targetDigest,article:{...article,sections:[{...article.sections[0]!,sourceRefs:[]}]},graphic})).rejects.toThrow();
});

it.each(['title','summary','section','fact','graphic','card'])('T1099 %s 来源缺失或错误仍拒绝，但给明确安全字段说明',async field=>{
 for(const refs of [[],[{...ref,versionId:'other-version'}]]){
  const f=fixture(),read=await f.service.read(ctx,target);
  const a={...structuredClone(article),factItems:[{id:'fact-1',text:'真实事实',reviewState:'confirmed' as const,sourceRefs:[ref]}]},g=structuredClone(graphic);
  if(field==='title')a.titleSourceRefs=refs;
  if(field==='summary')a.summarySourceRefs=refs;
  if(field==='section')a.sections[0]!.sourceRefs=refs;
  if(field==='fact')a.factItems[0]!.sourceRefs=refs;
  if(field==='graphic')g.sourceRefs=refs;
  if(field==='card')g.cardBriefs[0]!.sourceRefs=refs;
  const caught=await f.service.propose(ctx,target,{targetDigest:read.targetDigest,article:a,graphic:g}).catch(error=>error);
  expect(caught).toBeInstanceOf(ChatToolUserError);
  for(const path of ['article.titleSourceRefs','article.summarySourceRefs','sections[*].sourceRefs','factItems[*].sourceRefs','graphic.sourceRefs','cardBriefs[*].sourceRefs','scriptSourceRef'])expect(caught.message).toContain(path);
  expect(caught.message).not.toContain(ref.id);expect(caught.message).not.toContain('真实事实');
 }
});
it('T1099 原目标和图片冲突不被错误归类为可纠正来源',async()=>{
 const f=fixture(),read=await f.service.read(ctx,target);
 for(const proposal of [{targetDigest:'0'.repeat(64),article,graphic},{targetDigest:read.targetDigest,article,graphic:{...graphic,imageUses:[{assetId:'fake',assetFileId:'fake-file',order:0,role:'cover' as const}]}}]){
  const caught=await f.service.propose(ctx,target,proposal).catch(error=>error);expect(caught).toBeInstanceOf(Error);expect(caught).not.toBeInstanceOf(ChatToolUserError);
 }
});
