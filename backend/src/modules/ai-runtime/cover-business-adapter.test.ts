import {it,expect} from 'vitest';
import {generationRequestDigest} from '@creatoros/ai-worker/chat';
import {createCoverBusinessAdapter} from './cover-business-adapter';
const ctx={userId:'u',accountId:'a',requestId:'test',source:'user' as const};
const context={positioningBrief:'定位',projectBriefHard:'立项',reviewScript:'原稿',userMaterialHardBrief:'',userMaterialRefBrief:'',knowledgeBrief:'',orientationHint:'',topic:{title:'原主题',angle:''}};
it.each([true,false])('T1413真实封面prepare冻结内部参考约束、原输入摘要与原稿，strict=%s',async strict=>{
 const inputData={coverContextSnapshot:context,scriptSnapshot:{fullText:'当前已确认稿'},referenceAssetId:'asset',visualRequirements:'视觉要求',...(strict?{__coverReferenceRequired:true}:{})};
 const facets=await createCoverBusinessAdapter({} as never).prepare(ctx,{projectId:'project',inputData} as never);
 const frozen=JSON.parse(facets.__coverContext!);
 expect(frozen).toMatchObject({context:{reviewScript:'当前已确认稿'},referenceAssetId:'asset'});
 expect(frozen.referenceRequired===true).toBe(strict);
 expect(facets.__coverTaskInputDigest).toBe(generationRequestDigest({inputData,projectId:'project'}));
 expect(inputData.coverContextSnapshot.reviewScript).toBe('原稿');
});
it('T1413字符串真值不冒充宿主必需标记',async()=>{
 const facets=await createCoverBusinessAdapter({} as never).prepare(ctx,{projectId:'project',inputData:{coverContextSnapshot:context,__coverReferenceRequired:'true'}} as never);
 expect(JSON.parse(facets.__coverContext!).referenceRequired===true).toBe(false);
});
