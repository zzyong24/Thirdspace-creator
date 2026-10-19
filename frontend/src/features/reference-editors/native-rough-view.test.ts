import {describe,it,expect} from 'vitest';
import {summarizeNativeImpact,isKnownNativeConflict} from './native-rough-view';
describe('所选建议的完整原生影响',()=>{
 const e=(id:string,startTime:number,duration:number)=>({id,type:'video',startTime,duration,trimStart:0,trimEnd:0});
 const scene:any={id:'scene',tracks:{main:{id:'main',elements:[e('first',0,600000),e('later',720000,360000)]},overlay:[{id:'text',elements:[{...e('title',400000,100000),type:'text',content:'说明标题'},{...e('far',1500000,120000),type:'text'}]}],audio:[{id:'bgm',elements:[{...e('music',0,1080000),type:'audio',name:'背景音乐'}]}]}};
 const impact:any={sceneId:'scene',trackId:'main',sceneDigest:'sha256:x',ticksPerSecond:120000,suggestions:[{suggestionId:'one',removedRanges:[{startTick:120000,endTick:360000}]},{suggestionId:'two',removedRanges:[{startTick:240000,endTick:480000}]}]};
 it('重叠窗口只删除一次，以真实主轨计算位移，并列出保持绝对位置的文字音乐',()=>{const r=summarizeNativeImpact(scene,impact,['one','two']);expect(r.ranges).toEqual([{startTick:120000,endTick:480000}]);expect(r.removedTicks).toBe(360000);expect(r.shifted.map(e=>e.id)).toEqual(['later']);expect(r.independent.map(e=>e.elementId)).toEqual(['title','music']);expect(r.independent[0].startTick).toBe(400000);});
 it('选择变化只核当前集合，空集合不标记独立项目',()=>{expect(summarizeNativeImpact(scene,impact,['one']).removedTicks).toBe(240000);expect(summarizeNativeImpact(scene,impact,[]).independent).toEqual([]);});
 it('场景改变拒绝影响确认，typed CAS 与 unknown/bridge冲突分别处理',()=>{expect(()=>summarizeNativeImpact({...scene,id:'other'},impact,['one'])).toThrow('场景已改变');expect(isKnownNativeConflict({code:'ConflictError',status:409})).toBe(true);expect(isKnownNativeConflict({status:409})).toBe(false);expect(isKnownNativeConflict({code:'NativeApplyConflictError',status:409})).toBe(false);});
});
