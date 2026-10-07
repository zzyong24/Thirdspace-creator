import {createHash} from 'node:crypto';
import {workCreationTarget,workCreationProposalInput,workCreationReadResult,workCreationProposalResult,type RequestContext,type WorkCreationTarget,type WorkCreationProposalInput} from '@creatoros/contract';
import type {WorkCompositionsService} from '../../modules/work-compositions';
import type {ArticlesService} from '../../modules/articles';
import type {GraphicPostsService} from '../../modules/graphic-posts';
import type {createProjectScriptSource} from '../project-script-source';
import {canonicalJson} from '../../modules/ai/canonical-json';

export interface WorkCreationPorts {
 compositions:Pick<WorkCompositionsService,'get'>;
 articles:Pick<ArticlesService,'getArticle'|'getVersion'>;
 graphicPosts:Pick<GraphicPostsService,'getGraphicPost'|'getVersion'>;
 script:Pick<ReturnType<typeof createProjectScriptSource>,'readVersion'|'readImages'>;
}
const fingerprint=(value:unknown)=>createHash('sha256').update(canonicalJson(value)).digest('hex');
const conflict=(message:string):never=>{throw new Error(message);};

/** 应用层只装配原属主读端口；语义创作由当前聊天Skill完成。 */
export function createWorkCreationRoot(ports:WorkCreationPorts){
 async function read(ctx:RequestContext,raw:WorkCreationTarget){
  const target=workCreationTarget.parse(raw);
  const composition=await ports.compositions.get(ctx,target.compositionId);
  if(composition.projectId!==target.projectId||composition.compositionId!==target.compositionId||composition.currentRevision!==target.compositionRevision)conflict('作品组合已变化，请重新确认当前脚本与成员。');
  for(const selected of [target.articleMember,target.graphicMember]){
   // SEMANTIC_BOUNDARY_ALLOW: 比较明确成员身份/版本；不按名称或内容寻找作品。
   const bound=composition.current.members.find(row=>row.member.kind===selected.kind&&row.member.outputId===selected.outputId);
   const current=composition.memberCurrent.find(row=>row.member.kind===selected.kind&&row.member.outputId===selected.outputId);
   if(!bound||!current||current.availability!=='available'||current.currentVersion.kind!=='artifact'||current.currentVersion.artifactId!==selected.artifactId||current.currentVersion.versionId!==selected.baseVersionId)conflict('作品成员或已保存版本已变化。');
  }
  const [script,article,graphic]=await Promise.all([
   ports.script.readVersion(ctx,target.scriptSourceRef,target.projectId),
   ports.articles.getArticle(ctx,target.articleMember.outputId),
   ports.graphicPosts.getGraphicPost(ctx,target.graphicMember.outputId),
  ]);
  if(canonicalJson(script.ref)!==canonicalJson(target.scriptSourceRef))conflict('确认脚本版本不符。');
  if(!script.text.trim())conflict('请先写好并保存脚本。');
  for(const [owned,selected] of [[article,target.articleMember],[graphic,target.graphicMember]] as const){
   if(owned.projectId!==target.projectId||owned.outputId!==selected.outputId||owned.artifactId!==selected.artifactId||owned.currentVersionId!==selected.baseVersionId)conflict('当前稿件已变化，候选仍保留，请重新确认。');
  }
  const [articleVersion,graphicVersion,images]=await Promise.all([
   ports.articles.getVersion(ctx,target.articleMember.outputId,target.articleMember.baseVersionId),
   ports.graphicPosts.getVersion(ctx,target.graphicMember.outputId,target.graphicMember.baseVersionId),
   ports.script.readImages(ctx,target.projectId),
  ]);
  if(articleVersion.versionId!==target.articleMember.baseVersionId||graphicVersion.versionId!==target.graphicMember.baseVersionId||canonicalJson(articleVersion.document)!==canonicalJson(article.current)||canonicalJson(graphicVersion.document)!==canonicalJson(graphic.current))conflict('成员版本读回不一致。');
  return workCreationReadResult.parse({kind:'work.creation.read',schemaVersion:1,target,targetDigest:fingerprint(target),scriptText:script.text,scriptSourceRef:script.ref,article:articleVersion.document,graphic:graphicVersion.document,images:images.images,imageState:images.state,...(images.message?{imageMessage:images.message}:{}),error:null});
 }
 async function propose(ctx:RequestContext,target:WorkCreationTarget,raw:WorkCreationProposalInput){
  const proposal=workCreationProposalInput.parse(raw),current=await read(ctx,target);
  if(proposal.targetDigest!==current.targetDigest)conflict('候选对应的确认脚本或成员不符。');
  const sameSource=(refs:ReadonlyArray<unknown>|undefined)=>refs?.some(ref=>canonicalJson(ref)===canonicalJson(current.scriptSourceRef))===true;
  // SEMANTIC_BOUNDARY_ALLOW: 核同一个不可变来源及真实文件ID，不决定文章/图卡内容。
  if(!sameSource(proposal.article.titleSourceRefs)||!sameSource(proposal.article.summarySourceRefs)||proposal.article.sections.some(section=>!sameSource(section.sourceRefs))||proposal.article.factItems.some(fact=>!sameSource(fact.sourceRefs))||!sameSource(proposal.graphic.sourceRefs)||!proposal.graphic.cardBriefs?.length||proposal.graphic.cardBriefs.some(card=>!sameSource(card.sourceRefs)))conflict('两份稿件必须保留同一确认脚本的来源。');
  if(new Set(proposal.article.sections.map(section=>section.sectionId)).size!==proposal.article.sections.length)conflict('文章段落ID重复。');
  const files=[...proposal.article.imageUses,...(proposal.article.coverImageUse?[proposal.article.coverImageUse]:[]),...proposal.graphic.imageUses,...(proposal.graphic.seriesProfile?.referenceImage?[proposal.graphic.seriesProfile.referenceImage]:[])];
  for(const file of files)if(!current.images.some(image=>image.assetId===file.assetId&&image.assetFileId===file.assetFileId))conflict('候选包含未在当前素材目录核验的图片文件。');
  return workCreationProposalResult.parse({kind:'work.creation.propose',schemaVersion:1,target:current.target,targetDigest:current.targetDigest,article:proposal.article,graphic:proposal.graphic,articleDigest:fingerprint(proposal.article),graphicDigest:fingerprint(proposal.graphic),scriptSourceRef:current.scriptSourceRef,error:null});
 }
 return {read,propose};
}
