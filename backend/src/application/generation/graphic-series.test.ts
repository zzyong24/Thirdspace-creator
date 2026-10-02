import {describe,it,expect,vi} from 'vitest';
import {createGraphicCardBusinessAdapters} from './creative-post';
const ctx={userId:'user-1',accountId:'account-1',source:'user',requestId:'req-1'};
const document={schemaVersion:1,title:'一组内容',body:'正文',summary:'总结',tags:[],imageUses:[],sourceRefs:[],ruleSnapshotRef:null,
 cardBriefs:[{cardId:'one',title:'起因',body:'第一段',sourceRefs:[],visualBrief:'共享角色'},{cardId:'two',title:'结果',body:'第二段',sourceRefs:[]}],
 seriesProfile:{visualDirection:'铅笔画',aspectRatio:'3:4',referenceImage:{assetId:'ref-1',assetFileId:'ref-file-old'}}};
const context={positioningBrief:'',projectBriefHard:'',reviewScript:'一组内容\n\n正文\n\n总结',userMaterialHardBrief:'',userMaterialRefBrief:'',knowledgeBrief:'',orientationHint:'',topic:{title:'一组内容',angle:''}};
const input={outputId:'output-1',contentOutputId:'output-1',artifactId:'artifact-1',baseVersionId:'version-1',kind:'image_card',contentType:'graphic_post',targetPlatform:'xiaohongshu',targetSectionId:'two',
 cardContextSnapshot:context,scriptSnapshot:{artifactId:'artifact-1',versionId:'version-1',fullText:context.reviewScript},seriesSnapshot:{targetCardId:'two',cardBriefs:document.cardBriefs,seriesProfile:document.seriesProfile,sourceRefs:document.sourceRefs,referenceProof:{assetId:'ref-1',assetFileId:'ref-file-old',checksum:'a'.repeat(64),mimeType:'image/png'}}};
function adapter(){return createGraphicCardBusinessAdapters({graphicPostsService:{getGraphicPost:vi.fn(async()=>({projectId:'project-1',artifactId:'artifact-1',targetPlatform:'xiaohongshu'})),getVersion:vi.fn(async()=>({versionId:'version-1',document}))}} as never)['graphic.card.generate'];}
describe('冻结组图指定页业务公共入口',()=>{
 it('目标页与全组语境、精确参考和比例进入既有两次调用',async()=>{
  const facets=await adapter().prepare(ctx as never,{projectId:'project-1',inputData:input} as never);
  expect(JSON.parse(facets.graphicCardContext)).toMatchObject({targetSectionId:'two',series:input.seriesSnapshot});
  expect(JSON.parse(facets.__coverContext)).toMatchObject({referenceAssetId:'ref-1',referenceFileId:'ref-file-old',aspectRatio:'3:4'});
 });
 it.each([{...input,targetSectionId:'missing'},{...input,seriesSnapshot:{...input.seriesSnapshot,cardBriefs:[...document.cardBriefs].reverse()}},{...input,seriesSnapshot:{...input.seriesSnapshot,seriesProfile:{...document.seriesProfile,visualDirection:'伪造'}}}])('拒绝不存在页或与不可变版本不同的规划',async(raw)=>{
  await expect(adapter().prepare(ctx as never,{projectId:'project-1',inputData:raw} as never)).rejects.toThrow('GRAPHIC_CARD_GENERATION_BASE_MISMATCH');
 });
 it('指定统一参考时不能遗漏精确文件证明',async()=>{
  const {referenceProof,...seriesSnapshot}=input.seriesSnapshot;
  await expect(adapter().prepare(ctx as never,{projectId:'project-1',inputData:{...input,seriesSnapshot}} as never)).rejects.toThrow('GRAPHIC_CARD_GENERATION_BASE_MISMATCH');
 });
 it('旧整稿无页请求继续可用',async()=>{
  const {targetSectionId,seriesSnapshot,...legacy}=input;
  await expect(adapter().prepare(ctx as never,{projectId:'project-1',inputData:legacy} as never)).resolves.toBeDefined();
 });
});
