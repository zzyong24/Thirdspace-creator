import type {Db} from '@creatoros/backend';
import {projects} from '@creatoros/backend';
import {articleAssistedVersionBody,graphicAssistedVersionBody,type RequestContext} from '@creatoros/contract';
import type {ArticlesService} from '../../modules/articles/articles.service';
import type {GraphicPostsService} from '../../modules/graphic-posts/graphic-posts.service';
import type {createWorkCandidateSourceService} from '../../modules/ai/work-candidate-source.service';
import {withWorkspaceParentWrite} from '../../workspace-write';
import {ConflictError} from '../../modules/execution/execution.errors';
import {projectWorkCandidate,workCandidateIntentDigest} from './work-candidate-projection';
export function createWorkCandidateAdoption(db:Db,ports:{source:ReturnType<typeof createWorkCandidateSourceService>;articles:(tx:Db)=>Pick<ArticlesService,'getArticle'|'getVersion'|'readPreparedCandidateReceipt'|'createPreparedCandidateVersion'>;graphic:(tx:Db)=>Pick<GraphicPostsService,'getGraphicPost'|'getVersion'|'readPreparedCandidateReceipt'|'createPreparedCandidateVersion'>;lockArtifact:(ctx:RequestContext,artifactId:string,tx:Db)=>Promise<{id:string;projectId:string|null;contentOutputId:string|null}>}){
 return {async adopt(ctx:RequestContext,owner:'article'|'graphic',outputId:string,raw:unknown){
  if(ctx.source!=='user')throw new ConflictError('候选只允许用户采纳');
  const body=owner==='article'?articleAssistedVersionBody.parse(raw):graphicAssistedVersionBody.parse(raw);
  // 先从当前scope真实来源取得父ID，事务内再次验证，不使用请求传来的target。
  const initial=await ports.source.readSource(ctx,body.assistantSource);
  const projectId=initial.candidate.target.projectId;
  return withWorkspaceParentWrite(db,ctx,{table:projects,id:projects.id,userId:projects.userId,groupId:projects.groupId,accountId:projects.accountId},[projectId],async tx=>{
   const store=tx as unknown as Db,source=await ports.source.readSource(ctx,body.assistantSource,store),candidate=source.candidate;
   const editor=candidate.kind==='work.editor.candidate';
   if(editor&&(owner!=='article'||candidate.target.owner!=='wechat_article'))throw new ConflictError('该候选不属于文章采用入口');
   const target=editor?{outputId:candidate.target.outputId,artifactId:candidate.base.kind==='artifact'?candidate.base.artifactId:'',baseVersionId:candidate.base.kind==='artifact'?candidate.base.versionId:''}:owner==='article'?candidate.target.articleMember:candidate.target.graphicMember;
   if(target.outputId!==outputId||target.baseVersionId!==body.expectedCurrentVersionId)throw new ConflictError('候选成员或原保存版本不符');
   const service=owner==='article'?ports.articles(store):ports.graphic(store);
   const artifact=await ports.lockArtifact(ctx,target.artifactId,store);
   if(artifact.projectId!==projectId||artifact.contentOutputId!==outputId)throw new ConflictError('候选与真实作品锚点不符');
   const intentDigest=workCandidateIntentDigest(owner==='article'?'articles.versions.create':'graphicPosts.versions.create',outputId,body);
   const receiptInput={clientRequestId:body.clientRequestId,intentDigest,aiTaskId:source.aiTask.id};
   const receipt=await service.readPreparedCandidateReceipt(ctx,outputId,receiptInput);
   if(receipt)return receipt;
   const base=await service.getVersion(ctx,outputId,target.baseVersionId);
   let document;
   if(owner==='article'){
    const proposed=editor?candidate.candidate?.kind==='article'?candidate.candidate.document:null:candidate.article;
    if(!proposed)throw new ConflictError('没有成功文章候选');
    document=projectWorkCandidate('article',base.document as import('@creatoros/contract').ArticleDocument,proposed,body.fieldSelection,articleAssistedVersionBody.parse(body).factSelection,editor?'editor':'joint');
    return ports.articles(store).createPreparedCandidateVersion(ctx,outputId,{...receiptInput,expectedCurrentVersionId:body.expectedCurrentVersionId,document});
   }
   if(editor)throw new ConflictError('独立图文精调继续原保存入口');
   document=projectWorkCandidate('graphic',base.document as import('@creatoros/contract').GraphicPostDocument,candidate.graphic,body.fieldSelection,undefined,'joint');
   return ports.graphic(store).createPreparedCandidateVersion(ctx,outputId,{...receiptInput,expectedCurrentVersionId:body.expectedCurrentVersionId,document});
  });
 }};
}

export {createWorkCandidateSourceService} from '../../modules/ai/work-candidate-source.service';
