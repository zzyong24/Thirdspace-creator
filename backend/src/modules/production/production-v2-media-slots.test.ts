import {expect,it} from 'vitest';
import {productionPlanV2} from '@creatoros/contract';
import {compileV2RenderablePlan} from './production-v2-compile';
import {applyV2EditorEdits} from './production-v2-edits';
import {itemDigest} from './production-editor-plan';
const slot={id:'slot-b',role:'broll' as const,anchor:{kind:'timeline' as const,startUs:0,endUs:1000000},label:'用户明确位置',extensions:{style:{untouched:true}}};
const input=()=>({editorVersion:2 as const,mainTrack:{sources:[{sourceId:'s',assetId:'a',assetFileId:'f',fileDigest:'a'.repeat(64),probeDigest:'b'.repeat(64),timebase:{num:1,den:1000},durationTicks:1000,hasAudio:false}],clips:[{clipId:'c',sourceId:'s',sourceInTicks:0,sourceOutTicks:1000}]},overlayDraft:{mediaSlots:[slot],meta:{},scenes:[],captions:[],broll:[],delivery:{width:1920,height:1080,fps:30}},sourceTranscripts:[]});
it('真实空素材位置保留未知样式且主轨可安全输出，删除经原明确编辑CAS',()=>{
 const p=productionPlanV2.parse(input()),before=structuredClone(p),render=compileV2RenderablePlan(p);
 expect(render.props.broll).toEqual([]);expect(render.mediaBindings).toHaveLength(1);expect(render.warnings.join(' ')).toContain('slot-b');expect(p).toEqual(before);
 const next=applyV2EditorEdits(p,[{type:'removeItem',itemId:'slot-b',expectedItemDigest:itemDigest(slot)}],()=> 'unused');expect(next.overlayDraft.mediaSlots).toEqual([]);expect(p.overlayDraft.mediaSlots?.[0]?.extensions).toEqual(slot.extensions);
});
it('slot拒绝客户端文件身份、跨场景位置和与原clip重复ID',()=>{
 for(const changes of [{file:'fake.mp4'},{assetFileId:'f'},{role:'image-card',sceneId:'missing'},{id:'c'}]){const p=input();p.overlayDraft.mediaSlots[0]={...slot,...changes} as never;expect(productionPlanV2.safeParse(p).success).toBe(false);}
});
