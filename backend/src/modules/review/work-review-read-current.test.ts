import {it,expect} from 'vitest';
import {createDb,assets,assetFiles,type Db} from '@creatoros/backend';
import {type RequestContext,type WorkMemberRef,type WorkReviewScope} from '@creatoros/contract';
import {createProjectsService,createProjectRepository} from '@creatoros/backend/modules/projects';
import {createArtifactsService} from '@creatoros/backend/modules/artifacts';
import {createAssetsService,createAssetRepository} from '@creatoros/backend/modules/assets';
import {createArticlesService} from '@creatoros/backend/modules/articles';
import {createGraphicPostsService} from '@creatoros/backend/modules/graphic-posts';
import {createPublishingService} from '@creatoros/backend/modules/publishing';
import {createMomentsService} from '@creatoros/backend/modules/moments';
import {createWorkCompositionsService} from '../work-compositions/work-compositions.service';
import {createWorkReviewReader,type ReviewOwners} from './work-review-read-current';
import {freezeReview} from './work-review-fingerprint';
const ctx:RequestContext={userId:'reader-user',accountId:'reader-account',source:'user',requestId:'reader-http'};
const unavailable=async():Promise<never>=>{throw Error('本fixture不调用供应商模型或无关owner');};
async function fixture(kind:'article'|'image'|'moments'){
 const opened=await createDb(),db=opened.db;let seq=0;const deps={now:()=> '2026-10-02T10:00:00.000Z',nextId:(prefix:string)=>`${prefix}-${++seq}`};
 const projects=(tx:Db=db)=>createProjectsService(createProjectRepository(tx),deps),artifacts=(tx:Db)=>createArtifactsService({db:tx,...deps});
 const asset=(tx:Db=db)=>createAssetsService(createAssetRepository(tx,deps),unavailable,deps);
 const article=(tx:Db=db)=>createArticlesService(tx,{...deps,projects,artifacts,assertAssetFile:(c,id,file,active)=>asset(tx).assertAssetFileOwned(c,id,file,active),resolveDocumentSource:async()=>null,resolveSelectedBrand:async()=>null,submitGeneration:unavailable,readGeneration:unavailable});
 const image=(tx:Db=db)=>createGraphicPostsService(tx,{...deps,projects,artifacts,assertAssetFile:(c,id,file,active)=>asset(tx).assertAssetFileOwned(c,id,file,active),submitTextGeneration:unavailable,readTextGeneration:unavailable});
 const moments=(tx:Db=db)=>createMomentsService({db:tx,...deps,ports:{artifacts,assertProjectOwned:async(c,p,t,lock)=>{await projects(t).getProject(c,p,lock);},assertFile:unavailable,assertSource:unavailable}});
 const project=await projects().createProject(ctx,{title:'真实审核字段',brief:'DB回归'});let member:WorkMemberRef;
 if(kind==='moments'){const row=await moments().create(ctx,{projectId:project.id,clientRequestId:'reader-moments-create',document:{schemaVersion:1,text:'朋友圈真实正文',imageUses:[],sourceRefs:[]}});member={kind,momentsId:row.momentsId};}
 else{const row=kind==='article'?await article().createOutput(ctx,project.id,{title:'真实文章',clientRequestId:'reader-article-create'}):await image().createOutput(ctx,project.id,{title:'真实图文',clientRequestId:'reader-image-create'});member={kind,outputId:row.id};if(kind==='article'){const original=await article().getArticle(ctx,row.id);await article().createVersion(ctx,row.id,{clientRequestId:'reader-initial-title',expectedCurrentVersionId:original.currentVersionId,document:{...original.current,title:'真实文章'}});}if(kind==='image'){const original=await image().getGraphicPost(ctx,row.id);await image().createVersion(ctx,row.id,{clientRequestId:'reader-initial-cards',expectedCurrentVersionId:original.currentVersionId,document:{...original.current,cardBriefs:[{cardId:'a',title:'第一卡',body:'保留卡正文',sourceRefs:[]},{cardId:'b',title:'第二卡',body:'别卡正文',sourceRefs:[]}]}});}}
 const comp=(tx:Db=db)=>createWorkCompositionsService({db:tx,...deps,ports:{artifacts,assertProjectOwned:async(c,p,t,lock)=>{await projects(t).getProject(c,p,lock);},readMember:async(c,_p,m,t=tx)=>{const item=m.kind==='moments'?await moments(t).get(c,m.momentsId):m.kind==='article'?await article(t).getArticle(c,m.outputId):await image(t).getGraphicPost(c,m.outputId);return{kind:'artifact',artifactId:item.artifactId,versionId:item.currentVersionId};},createMember:unavailable,findCreatedMember:async()=>null,assertSource:unavailable,assertRule:unavailable}});
 const composition=await comp().create(ctx,{projectId:project.id,title:'组合',clientRequestId:'reader-comp-create'});await comp().bindMember(ctx,composition.compositionId,{expectedRevision:0,clientRequestId:'reader-comp-bind',member});
 const publicationReads:string[]=[],publicationLocks:string[]=[];
 const publishing=(tx:Db=db)=>createPublishingService({db:tx,...deps,resolveOutputOwner:(c,id)=>projects(tx).getOutputOwnerSummary(c,id),assertCoverOwned:(c,id)=>asset(tx).getAsset(c,id)});
 const read=createWorkReviewReader({owners:t=>({projects:projects(t),articles:article(t),graphicPosts:image(t),moments:moments(t),compositions:comp(t),publishing:{listPublicationsByOutputIds:(c,ids)=>publishing(t).listPublicationsByOutputIds(c,ids),getPublication:(c,id)=>{publicationReads.push(id);return publishing(t).getPublication(c,id);},listRevisions:(c,id,page)=>{publicationReads.push(id);return publishing(t).listRevisions(c,id,page);}},assets:asset(t),production:{getEditor:unavailable},outputScripts:{getSavedScript:unavailable}} satisfies ReviewOwners),
  lockMember:async(c,_p,m,t)=>{const item=m.kind==='moments'?await moments(t).get(c,m.momentsId):m.kind==='article'?await article(t).getArticle(c,m.outputId):m.kind==='image'?await image(t).getGraphicPost(c,m.outputId):await unavailable();await artifacts(t).getArtifact(c,item.artifactId,true);},lockPublication:async(c,id,t)=>{publicationLocks.push(id);await publishing(t).getPublication(c,id,true);},dependencies:async()=>[],readSource:unavailable,readRule:unavailable,productionFiles:unavailable});
 const scope=(target:any):WorkReviewScope=>({kind:'field',compositionId:composition.compositionId,member,target});
 const frozen=async(s:WorkReviewScope,c=ctx)=>db.transaction(async t=>freezeReview(s,await read(c,s,t as unknown as Db,true),deps.now()));
 return{opened,db,member,composition,article,image,moments,comp,scope,frozen,deps,publishing,publicationReads,publicationLocks};
}
it.each(['article','image','moments'] as const)('%s 从真实原owner读取精确值，隔离账号',async kind=>{const f=await fixture(kind);try{
 const target=kind==='moments'?{kind:'moments_field',momentsId:(f.member as any).momentsId,field:'text'}:kind==='article'?{kind:'article_field',outputId:(f.member as any).outputId,field:'title'}:{kind:'image_card',outputId:(f.member as any).outputId,cardId:'a',field:'body'};
 const result=await f.frozen(f.scope(target));expect(result.context.members[0]!.fields[0]!.value).toBe(kind==='moments'?'朋友圈真实正文':kind==='article'?'真实文章':'保留卡正文');
 await expect(f.frozen(f.scope(target),{...ctx,accountId:'another-account'})).rejects.toThrow();
 }finally{await f.opened.client.close();}});
it('真实图文另卡编辑及重排不改变单卡正文指纹；明确字段改变失效',async()=>{const f=await fixture('image');try{
 const outputId=(f.member as any).outputId,s=f.scope({kind:'image_card',outputId,cardId:'a',field:'body'}),before=await f.frozen(s),item=await f.image().getGraphicPost(ctx,outputId);
 await f.image().createVersion(ctx,outputId,{clientRequestId:'reader-card-b-change',expectedCurrentVersionId:item.currentVersionId,document:{...item.current,cardBriefs:[{...item.current.cardBriefs![1]!,body:'修改别卡'},item.current.cardBriefs![0]!]}});
 const after=await f.frozen(s);expect(after.snapshot.fingerprint).toBe(before.snapshot.fingerprint);expect(after.snapshot.members[0]!.ownerVersion).not.toEqual(before.snapshot.members[0]!.ownerVersion);
 const next=await f.image().getGraphicPost(ctx,outputId);await f.image().createVersion(ctx,outputId,{clientRequestId:'reader-card-a-change',expectedCurrentVersionId:next.currentVersionId,document:{...next.current,cardBriefs:next.current.cardBriefs!.map(c=>c.cardId==='a'?{...c,body:'修改本卡'}:c)}});expect((await f.frozen(s)).snapshot.fingerprint).not.toBe(before.snapshot.fingerprint);
 await expect(f.frozen(f.scope({kind:'image_card',outputId,cardId:'missing',field:'body'}))).rejects.toThrow();
 }finally{await f.opened.client.close();}});

it('真实文件行摘要及cardId槽位：别卡顺序不失效，精确文件变化失效',async()=>{const f=await fixture('image');try{
 for(const id of ['file-a','file-b']){await f.db.insert(assets).values({id,userId:ctx.userId,accountId:ctx.accountId!,assetType:'image',name:id,status:'active',currentFileId:id+'-1',createdAt:f.deps.now(),updatedAt:f.deps.now()});await f.db.insert(assetFiles).values({id:id+'-1',assetId:id,versionNumber:1,storageKey:id+'.png',mimeType:'image/png',fileSize:68,checksum:id+'-checksum',createdAt:f.deps.now()});}
 const outputId=(f.member as any).outputId,item=await f.image().getGraphicPost(ctx,outputId);await f.image().createVersion(ctx,outputId,{clientRequestId:'reader-real-image',expectedCurrentVersionId:item.currentVersionId,document:{...item.current,imageUses:[{assetId:'file-a',assetFileId:'file-a-1',role:'card',cardId:'a',order:0}]}});
 const scope=f.scope({kind:'image_card',outputId,cardId:'a',field:'imageUse'}),before=await f.frozen(scope);expect(before.context.members[0]!.fields[0]!.files[0]!.contentHash).toBe('file-a-checksum');expect(before.context.members[0]!.fields[0]!.value).not.toHaveProperty('order');
 const current=await f.image().getGraphicPost(ctx,outputId);await f.image().createVersion(ctx,outputId,{clientRequestId:'reader-other-card-image',expectedCurrentVersionId:current.currentVersionId,document:{...current.current,imageUses:[{assetId:'file-b',assetFileId:'file-b-1',role:'card',cardId:'b',order:0},...current.current.imageUses.map(x=>({...x,order:1}))]}});expect((await f.frozen(scope)).snapshot.fingerprint).toBe(before.snapshot.fingerprint);
 const edited=await f.image().getGraphicPost(ctx,outputId);await f.image().createVersion(ctx,outputId,{clientRequestId:'reader-card-file-change',expectedCurrentVersionId:edited.currentVersionId,document:{...edited.current,imageUses:edited.current.imageUses.map(x=>x.cardId==='a'?{...x,assetId:'file-b',assetFileId:'file-b-1'}:x)}});expect((await f.frozen(scope)).snapshot.fingerprint).not.toBe(before.snapshot.fingerprint);
 }finally{await f.opened.client.close();}});
it('真实组合selection改变只使组合指纹失效，不影响明确文章字段',async()=>{const f=await fixture('article');try{
 const outputId=(f.member as any).outputId,s=f.scope({kind:'article_field',outputId,field:'title'}),before=await f.frozen(s),compositionScope:WorkReviewScope={kind:'composition',compositionId:f.composition.compositionId};
 const empty=await f.frozen(compositionScope),current=await f.comp().get(ctx,f.composition.compositionId);await f.comp().saveSelection(ctx,current.compositionId,{clientRequestId:'reader-select-article',expectedRevision:current.currentRevision,selection:['article']});
 const selected=await f.frozen(compositionScope);expect(empty.context.members).toEqual([]);expect(selected.context.members).toHaveLength(1);expect(selected.snapshot.fingerprint).not.toBe(empty.snapshot.fingerprint);expect((await f.frozen(s)).snapshot.fingerprint).toBe(before.snapshot.fingerprint);
 }finally{await f.opened.client.close();}});

it.each(['title','description','platformTags'] as const)('真实发布稿%s不被历史封面缺file阻断，精确pub先筛后锁读',async field=>{const f=await fixture('image');try{
 const outputId=(f.member as any).outputId,pub=await f.publishing().createPublication(ctx,outputId,{platform:'xiaohongshu',accountReference:'reader-account'}),other=await f.publishing().createPublication(ctx,outputId,{platform:'douyin',accountReference:'reader-account'});
 for(const id of ['legacy-cover','other-legacy-cover'])await f.db.insert(assets).values({id,userId:ctx.userId,accountId:ctx.accountId!,assetType:'image',name:id,status:'active',createdAt:f.deps.now(),updatedAt:f.deps.now()});
 await f.publishing().createRevision(ctx,pub.id,{title:'真实发布标题',description:'真实发布简介',platformTags:['真实标签'],coverAssetId:'legacy-cover'});
 await f.publishing().createRevision(ctx,other.id,{title:'不应读取另稿',description:'另稿',coverAssetId:'other-legacy-cover'});
 f.publicationReads.length=0;f.publicationLocks.length=0;const scope=f.scope({kind:'publication_field',outputId,publicationId:pub.id,field}),result=await f.frozen(scope);
 expect(result.context.members[0]!.fields[0]!.value).toEqual(field==='title'?'真实发布标题':field==='description'?'真实发布简介':['真实标签']);expect(f.publicationReads.length).toBeGreaterThan(0);expect(f.publicationReads.every(id=>id===pub.id)).toBe(true);expect(f.publicationLocks).toEqual([pub.id]);
 await expect(f.frozen(f.scope({kind:'publication_field',outputId,publicationId:pub.id,field:'cover'}))).rejects.toThrow('REVIEW_PUBLICATION_COVER_FILE_UNAVAILABLE');
 if(field==='title'){await expect(f.frozen({kind:'member',compositionId:f.composition.compositionId,member:f.member})).rejects.toThrow('REVIEW_PUBLICATION_COVER_FILE_UNAVAILABLE');const current=await f.comp().get(ctx,f.composition.compositionId);await f.comp().saveSelection(ctx,current.compositionId,{clientRequestId:'reader-pub-select-image',expectedRevision:current.currentRevision,selection:['image']});await expect(f.frozen({kind:'composition',compositionId:current.compositionId})).rejects.toThrow('REVIEW_PUBLICATION_COVER_FILE_UNAVAILABLE');}
 }finally{await f.opened.client.close();}});
it('指定发布稿不锁不读同作品其他发布稿',async()=>{const f=await fixture('image');try{
 const outputId=(f.member as any).outputId,pub=await f.publishing().createPublication(ctx,outputId,{platform:'xiaohongshu',accountReference:'reader-account'}),other=await f.publishing().createPublication(ctx,outputId,{platform:'douyin',accountReference:'reader-account'});
 f.publicationReads.length=0;f.publicationLocks.length=0;await f.frozen(f.scope({kind:'publication_field',outputId,publicationId:pub.id,field:'title'}));expect(f.publicationLocks).toEqual([pub.id]);expect(f.publicationReads).not.toContain(other.id);
 }finally{await f.opened.client.close();}});
