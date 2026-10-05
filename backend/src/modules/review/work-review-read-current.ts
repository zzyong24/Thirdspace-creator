import {z} from 'zod';
import {OwnershipError,type Db} from '@creatoros/backend';
import {sameWorkMember,workSourceRef,type RequestContext,type WorkReviewScope,type WorkMemberRef,type WorkOwnerVersion,type WorkFieldTarget,type WorkSourceRef,type WorkAssetFile,type WorkRuleRef,type WorkDependency} from '@creatoros/contract';
import type {ArticlesService} from '@creatoros/backend/modules/articles';
import type {GraphicPostsService} from '@creatoros/backend/modules/graphic-posts';
import type {MomentsService} from '@creatoros/backend/modules/moments';
import type {ProjectsService} from '@creatoros/backend/modules/projects';
import type {OutputScriptsService} from '@creatoros/backend/modules/output-scripts';
import type {ProductionService} from '@creatoros/backend/modules/production';
import type {PublishingService} from '@creatoros/backend/modules/publishing';
import type {AssetsService} from '@creatoros/backend/modules/assets';
import type {WorkCompositionsService} from '@creatoros/backend/modules/work-compositions';
import {canonical,digest,frozenReviewContextSchema,type FrozenReviewContext} from './work-review-fingerprint';
import type {WorkFrozenSource} from '../work-compositions/work-source.service';
type Field=FrozenReviewContext['members'][number]['fields'][number];
const json=(value:unknown)=>z.json().parse(JSON.parse(JSON.stringify(value)));
const unique=<T>(values:T[]):T[]=>[...new Map(values.map(value=>[canonical(value),value])).values()].sort((a,b)=>canonical(a).localeCompare(canonical(b)));
// SEMANTIC_BOUNDARY_ALLOW: 只枚举真实协议字段、稳定ID与精确依赖，不推断来源或语义。
export interface ReviewOwners {
 projects:Pick<ProjectsService,'getOutput'>;
 articles:Pick<ArticlesService,'getArticle'>;
 graphicPosts:Pick<GraphicPostsService,'getGraphicPost'>;
 moments:Pick<MomentsService,'get'>;
 outputScripts:Pick<OutputScriptsService,'getSavedScript'>;
 production:Pick<ProductionService,'getEditor'>;
 publishing:Pick<PublishingService,'getPublication'|'listPublicationsByOutputIds'|'listRevisions'>;
 assets:Pick<AssetsService,'assertAssetFileOwned'|'listFilesByIds'>;
 compositions:Pick<WorkCompositionsService,'get'|'assertCompositionOwned'>;
}
export interface ReviewReaderPorts {
 owners(tx:Db):ReviewOwners;
 /** 原owner内实现，与其保存锁相同。先项目/组合、后成员，ID排序；禁止no-op。 */
 lockMember(ctx:RequestContext,projectId:string,member:WorkMemberRef,tx:Db):Promise<void>;
 lockPublication(ctx:RequestContext,publicationId:string,tx:Db):Promise<void>;
 dependencies(ctx:RequestContext,compositionId:string,tx:Db):Promise<WorkDependency[]>;
 readSource(ctx:RequestContext,projectId:string,ref:WorkSourceRef,tx:Db):Promise<WorkFrozenSource>;
 readRule(ctx:RequestContext,ref:WorkRuleRef,tx:Db):Promise<unknown>;
 /** 原production owner显式列出实际引用文件；覆盖v1/v2，不猜测任意JSON键。 */
 productionFiles(ctx:RequestContext,outputId:string,editor:Awaited<ReturnType<ProductionService['getEditor']>>,tx:Db):Promise<WorkAssetFile[]>;
}
export function createWorkReviewReader(ports:ReviewReaderPorts){
 return async function readCurrent(ctx:RequestContext,scope:WorkReviewScope,tx:Db,forUpdate:boolean):Promise<FrozenReviewContext>{
  const o=ports.owners(tx);await o.compositions.assertCompositionOwned(ctx,scope.compositionId,forUpdate);
  const composition=await o.compositions.get(ctx,scope.compositionId),projectId=composition.projectId;
  const selected=scope.kind==='composition'?composition.current.selection.map(kind=>{
   const bound=composition.current.members.find(x=>x.member.kind===kind);if(!bound)throw new OwnershipError('所选成员尚未绑定');return bound.member;
  }):[scope.member];
  if(selected.some(member=>!composition.current.members.some(x=>sameWorkMember(x.member,member))))throw new OwnershipError('审核成员不属于组合');
  const ordered=[...selected].sort((a,b)=>canonical(a).localeCompare(canonical(b)));
  if(forUpdate)for(const member of ordered)await ports.lockMember(ctx,projectId,member,tx);
  const dependencies=await ports.dependencies(ctx,scope.compositionId,tx),members:FrozenReviewContext['members']=[];
  for(const member of ordered){
   const fields:Field[]=[];let ownerVersion:WorkOwnerVersion;
   const add=async(target:WorkFieldTarget,value:unknown,version:WorkOwnerVersion,refs:WorkSourceRef[]=[],files:WorkAssetFile[]=[],rules:WorkRuleRef[]=[])=>{
    if(scope.kind==='field'&&canonical(target)!==canonical(scope.target))return;
    const actual=json(value);
    // 仅纳入此真实触点、此真实值已经提交的依赖；不沿用旧字段值的来源。
    const matches=dependencies.filter(d=>sameWorkMember(d.member,member)&&canonical(d.target)===canonical(target)&&d.commitReceipt!==null&&d.status==='current'&&d.targetFingerprint===digest(actual));
    const explicit=unique([...refs,...matches.flatMap(d=>d.sourceRefs)]),sources=unique(matches.flatMap(d=>d.sources));
    const sourceFiles:WorkAssetFile[]=[],sourceRules:WorkRuleRef[]=[];
    const read=async(ref:WorkSourceRef)=>{const source=await ports.readSource(ctx,projectId,ref,tx);if(source.projectId!==projectId||canonical(source.source)!==canonical(ref))throw new OwnershipError('来源身份不一致');if(ref.kind==='asset')sourceFiles.push({assetId:ref.id,assetFileId:ref.versionId});if(source.kind==='moments')sourceFiles.push(...(source.content.imageUses??[]).map(({assetId,assetFileId})=>({assetId,assetFileId})));const linkedRules=source.constraints.ruleSnapshotRef;if(linkedRules)sourceRules.push(...(Array.isArray(linkedRules)?linkedRules:[linkedRules]));return json({content:source.content,constraints:source.constraints});};
    const sourceValues=await Promise.all(sources.map(async ref=>({ref,value:await read(ref)})));
    const sourceRefValues=await Promise.all(explicit.map(async ref=>({ref,value:await read(ref)})));
    const actualFiles=unique([...files,...sourceFiles,...matches.flatMap(d=>d.files)]);
    const fileValues=await Promise.all(actualFiles.map(async ref=>{
     await o.assets.assertAssetFileOwned(ctx,ref.assetId,ref.assetFileId,false);
     const rows=await o.assets.listFilesByIds(ctx,[ref.assetFileId]);const file=rows.find(x=>x.id===ref.assetFileId&&x.assetId===ref.assetId);
     if(!file||!file.checksum)throw Object.assign(new Error('精确文件缺少已持久摘要'),{code:'REVIEW_FILE_HASH_UNAVAILABLE'});
     return{ref,contentHash:file.checksum};
    }));
    const ruleRefs=unique([...rules,...sourceRules,...matches.flatMap(d=>d.ruleRefs)]);
    const ruleValues=await Promise.all(ruleRefs.map(async ref=>({ref,value:json(await ports.readRule(ctx,ref,tx))})));
    fields.push({target,provenanceVersion:version,value:actual,sources:sourceValues,sourceRefs:sourceRefValues,files:fileValues,rules:ruleValues});
   };
   if(member.kind==='moments'){
    const item=await o.moments.get(ctx,member.momentsId);if(item.projectId!==projectId)throw new OwnershipError('朋友圈归属错误');
    ownerVersion={kind:'artifact',artifactId:item.artifactId,versionId:item.currentVersionId};
    await add({kind:'moments_field',momentsId:member.momentsId,field:'text'},item.current.text,ownerVersion,item.current.sourceRefs);
    await add({kind:'moments_field',momentsId:member.momentsId,field:'imageUses'},item.current.imageUses,ownerVersion,[],item.current.imageUses.map(({assetId,assetFileId})=>({assetId,assetFileId})));
   }else{
    const output=await o.projects.getOutput(ctx,member.outputId);if(output.projectId!==projectId||output.contentType!==member.kind)throw new OwnershipError('作品类型或项目不一致');
    const outputId=member.outputId;
    if(member.kind==='article'){
     const item=await o.articles.getArticle(ctx,outputId),d=item.current;if(item.projectId!==projectId)throw new OwnershipError('文章归属错误');
     ownerVersion={kind:'artifact',artifactId:item.artifactId,versionId:item.currentVersionId};
     await add({kind:'article_field',outputId,field:'title'},d.title,ownerVersion,d.titleSourceRefs??[]);
     await add({kind:'article_field',outputId,field:'summary'},d.summary,ownerVersion,d.summarySourceRefs??[]);
     await add({kind:'article_field',outputId,field:'sections'},d.sections,ownerVersion,d.sections.flatMap(s=>s.sourceRefs));
     await add({kind:'article_field',outputId,field:'factItems'},d.factItems,ownerVersion,d.factItems.flatMap(s=>s.sourceRefs));
     await add({kind:'article_field',outputId,field:'imageUses'},d.imageUses,ownerVersion,[],d.imageUses.map(({assetId,assetFileId})=>({assetId,assetFileId})));
     await add({kind:'article_field',outputId,field:'coverImageUse'},d.coverImageUse??null,ownerVersion,[],d.coverImageUse?[{assetId:d.coverImageUse.assetId,assetFileId:d.coverImageUse.assetFileId}]:[]);
     for(const section of d.sections){
      for(const field of ['heading','body'] as const)await add({kind:'article_section',outputId,sectionId:section.sectionId,field},section[field],ownerVersion,section.sourceRefs);
      const use=d.imageUses.find(x=>x.sectionId===section.sectionId)??null;
      await add({kind:'article_section',outputId,sectionId:section.sectionId,field:'imageUse'},use,ownerVersion,[],use?[{assetId:use.assetId,assetFileId:use.assetFileId}]:[]);
     }
    }else if(member.kind==='image'){
     const item=await o.graphicPosts.getGraphicPost(ctx,outputId),d=item.current;if(item.projectId!==projectId)throw new OwnershipError('图文归属错误');
     ownerVersion={kind:'artifact',artifactId:item.artifactId,versionId:item.currentVersionId};
     for(const field of ['title','body','summary','tags','cardBriefs','imageUses'] as const){
      const refs=field==='body'?d.sourceRefs:field==='cardBriefs'?(d.cardBriefs??[]).flatMap(c=>c.sourceRefs):[];
      await add({kind:'image_field',outputId,field},d[field]??[],ownerVersion,refs,field==='imageUses'?d.imageUses.map(({assetId,assetFileId})=>({assetId,assetFileId})):[],['title','body','summary','tags','cardBriefs'].includes(field)&&d.ruleSnapshotRef?[d.ruleSnapshotRef]:[]);
     }
     const slot=async(cardId?:string)=>{const use=d.imageUses.find(x=>cardId?x.role==='card'&&x.cardId===cardId:x.role==='cover');
      const value=use?{role:use.role,...(use.cardId?{cardId:use.cardId}:{}),assetId:use.assetId,assetFileId:use.assetFileId}:null;
      await add(cardId?{kind:'image_card',outputId,cardId,field:'imageUse'}:{kind:'image_field',outputId,field:'coverImageUse'},value,ownerVersion,[],use?[{assetId:use.assetId,assetFileId:use.assetFileId}]:[]);};
     await slot();for(const card of d.cardBriefs??[]){for(const field of ['title','body','sourceRefs'] as const)await add({kind:'image_card',outputId,cardId:card.cardId,field},card[field],ownerVersion,card.sourceRefs,[],d.ruleSnapshotRef?[d.ruleSnapshotRef]:[]);await slot(card.cardId);}
    }else{
     const script=await o.outputScripts.getSavedScript(ctx,outputId),editor=await o.production.getEditor(ctx,outputId);if(editor.projectId!==projectId||script&&script.projectId!==projectId)throw new OwnershipError('视频归属错误');
     const scriptVersion:WorkOwnerVersion=script?{kind:'artifact',artifactId:script.artifactId,versionId:script.versionId}:{kind:'not_saved',outputId};
     const productionVersion:WorkOwnerVersion=editor.state==='empty'?{kind:'not_saved',outputId}:{kind:'production',outputId,revision:editor.revision};ownerVersion=script?scriptVersion:productionVersion;
     const data=script?.contentData;const refs=data&&typeof data==='object'&&!Array.isArray(data)&&'sourceRefs' in data?z.array(workSourceRef).parse(data.sourceRefs):[];
     await add({kind:'video_field',outputId,field:'script'},script?{contentText:script.contentText,contentData:script.contentData}:null,scriptVersion,refs);
     await add({kind:'video_field',outputId,field:'production'},editor.plan,productionVersion,[],scope.kind==='field'&&(scope.target.kind!=='video_field'||scope.target.field!=='production')?[]:await ports.productionFiles(ctx,outputId,editor,tx));
    }
    const pubs=(scope.kind==='field'&&scope.target.kind!=='publication_field'?[]:await o.publishing.listPublicationsByOutputIds(ctx,[outputId])).filter(pub=>scope.kind!=='field'||scope.target.kind==='publication_field'&&scope.target.publicationId===pub.id).sort((a,b)=>a.id.localeCompare(b.id));
    if(forUpdate)for(const pub of pubs)await ports.lockPublication(ctx,pub.id,tx);
    for(const pub of pubs){if(scope.kind==='field'&&(scope.target.kind!=='publication_field'||scope.target.publicationId!==pub.id))continue;
     const current=await o.publishing.getPublication(ctx,pub.id);if(current.contentOutputId!==outputId)throw new OwnershipError('发布稿归属错误');
     let found:Awaited<ReturnType<PublishingService['listRevisions']>>[number]|undefined;
     for(let offset=0;!found;offset+=100){const batch=await o.publishing.listRevisions(ctx,pub.id,{limit:100,offset});found=batch.find(r=>r.id===current.currentRevisionId);if(batch.length<100)break;}
     if(!found)throw new OwnershipError('发布稿当前版本缺失');const version:WorkOwnerVersion={kind:'publication',publicationId:pub.id,revisionId:found.id};
     for(const field of ['title','description','platformTags'] as const)await add({kind:'publication_field',outputId,publicationId:pub.id,field},found[field]??[],version);
     if(scope.kind!=='field'||scope.target.kind==='publication_field'&&scope.target.field==='cover'){
     const cover=found.coverAssetId&&found.coverAssetFileId?{assetId:found.coverAssetId,assetFileId:found.coverAssetFileId}:null;
     if(Boolean(found.coverAssetId)!==Boolean(found.coverAssetFileId))throw Error('REVIEW_PUBLICATION_COVER_FILE_UNAVAILABLE');
     await add({kind:'publication_field',outputId,publicationId:pub.id,field:'cover'},cover,version,[],cover?[cover]:[]);
     }
    }
   }
   if(scope.kind==='field'&&fields.length!==1)throw new OwnershipError('真实字段不存在');
   members.push({member,ownerVersion,fields});
  }
  return frozenReviewContextSchema.parse({projectId,scope,basis:{artifactId:composition.current.basisArtifactId,versionId:composition.current.basisVersionId,value:json(composition.basis)},selection:composition.current.selection,members});
 };
}
