import {describe,it,expect,vi} from 'vitest';
import {createGraphicPostMediaAdapter,type GraphicPostMediaPorts} from './graphic-post-media.adapter';
const ctx={userId:'user-1',accountId:'account-1',requestId:'req-1',source:'user'} as never;
const base={schemaVersion:1,title:'主题',body:'正文',summary:'',tags:[],imageUses:[],sourceRefs:[],ruleSnapshotRef:null,cardBriefs:[{cardId:'one',title:'起因',body:'第一段',sourceRefs:[]},{cardId:'two',title:'结果',body:'第二段',sourceRefs:[]}],seriesProfile:{visualDirection:'铅笔',aspectRatio:'3:4'}};
const snapshot={positioningBrief:'',projectBriefHard:'',reviewScript:'主题\n\n正文',userMaterialHardBrief:'',userMaterialRefBrief:'',knowledgeBrief:'',orientationHint:'',topic:{title:'主题',angle:''}};
function fixture(){
 let current:any={...base,imageUses:[{assetId:'legacy',assetFileId:'legacy-file',order:0,role:'card'},{assetId:'old-one',assetFileId:'old-file',order:1,role:'card',cardId:'one'}]},version='v2';
 const task:any={id:'task-1',taskType:'graphic.card.generate',status:'awaiting_confirmation',projectId:'project-1',contentOutputId:'output-1',inputData:{projectId:'project-1',contentOutputId:'output-1',outputId:'output-1',artifactId:'artifact-1',baseVersionId:'v1',kind:'image_card',targetSectionId:'one',cardContextSnapshot:snapshot,seriesSnapshot:{targetCardId:'one',cardBriefs:base.cardBriefs,seriesProfile:base.seriesProfile,sourceRefs:[]}}};
 const row={id:'row-1',kind:'image_card',taskId:'task-1',outputId:'output-1',projectId:'project-1',assetId:'new-one',assetFileId:'generated-original'};
 const createVersion=vi.fn(async(_c,_id,input)=>{if(input.expectedCurrentVersionId!==version)throw new Error('CAS');current=input.document;version='v3';return {versionId:version,document:current};});
 const confirmTask=vi.fn(async()=>{task.status='succeeded';});
 const asset=vi.fn(async()=>({assetType:'image',status:'pending',currentFileId:'changed-after-read'}));
 const ports={db:{select:()=>({from:()=>({where:async()=>[row]})})},graphicPosts:{getGraphicPost:async()=>({projectId:'project-1',outputId:'output-1',artifactId:'artifact-1',currentVersionId:version,current,targetPlatform:'xiaohongshu'}),getVersion:async(_c:any,_id:string,id:string)=>({versionId:id,document:id==='v1'?base:current}),createVersion},assets:{getAsset:asset,assertAssetFileOwned:vi.fn(),getAssetFileDownloadUrl:vi.fn()},readTask:async()=>task,listResults:async()=>[{resultType:'generated_asset',assetId:'new-one',resultData:{assetId:'new-one',assetType:'image'}}],confirmTask} as unknown as GraphicPostMediaPorts;
 return {adapter:createGraphicPostMediaAdapter(ports),task,ports,createVersion,confirmTask,get current(){return current},edit:(doc:any)=>current=doc};
}
const value=[{assetId:'new-one',assetFileId:'generated-original',order:0,role:'card',cardId:'one'}] as never;
describe('组图单页候选与顺序采用',()=>{
 it('候选file第一次冻结后不追随AssetcurrentFile',async()=>{
  const f=fixture();expect((await f.adapter.read(ctx,'task-1')).value).toEqual(value);
 });
 it('本页替换保留旧照片与其他页，其他页采用不使旧基准作废',async()=>{
  const f=fixture();f.edit({...f.current,imageUses:[...f.current.imageUses,{assetId:'two-image',assetFileId:'two-file',order:2,role:'card',cardId:'two'}]});
  await f.adapter.adopt(ctx,{candidateId:'task-1',kind:'image_card',expected:{owner:'graphic_post',versionId:'v2'},editedValue:value,clientRequestId:'adopt-one'});
  expect(f.current.imageUses.map((i:any)=>[i.assetId,i.cardId])).toEqual([['legacy',undefined],['new-one','one'],['two-image','two']]);
  expect(f.current.cardBriefs).toEqual(base.cardBriefs);expect(f.confirmTask).toHaveBeenCalledOnce();
 });
 it.each(['deleted','reordered','visual','sources'])('规划依据%s变化拒绝采用并保留候选',async(kind)=>{
  const f=fixture();f.edit({...f.current,...(kind==='deleted'?{cardBriefs:[base.cardBriefs[1]]}:kind==='reordered'?{cardBriefs:[...base.cardBriefs].reverse()}:kind==='visual'?{seriesProfile:{...base.seriesProfile,visualDirection:'新风格'}}:{sourceRefs:[{kind:'project',id:'other',versionId:'new'}]})});
  await expect(f.adapter.adopt(ctx,{candidateId:'task-1',kind:'image_card',expected:{owner:'graphic_post',versionId:'v2'},editedValue:value,clientRequestId:'adopt-one'})).rejects.toMatchObject({code:'VERSION_CONFLICT'});
  expect(f.confirmTask).not.toHaveBeenCalled();expect(f.createVersion).not.toHaveBeenCalled();
 });
});
it('旧历史带孤立cardId的图片保留原位置，不冒充当前规划页',async()=>{
 const f=fixture();f.edit({...f.current,imageUses:[{assetId:'orphan-legacy',assetFileId:'orphan-file',cardId:'old-page-deleted-before-plan',role:'card',order:0},...f.current.imageUses.map((use:any)=>({...use,order:use.order+1}))]});
 await f.adapter.adopt(ctx,{candidateId:'task-1',kind:'image_card',expected:{owner:'graphic_post',versionId:'v2'},editedValue:value,clientRequestId:'adopt-with-historical-orphan'});
 expect(f.current.imageUses.map((use:any)=>use.assetId)).toEqual(['orphan-legacy','legacy','new-one']);
 expect(f.current.imageUses[0]).toMatchObject({cardId:'old-page-deleted-before-plan',assetFileId:'orphan-file',order:0});
});
