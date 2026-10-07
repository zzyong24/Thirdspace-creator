import {describe,it,expect} from 'vitest';
import {productionNativeScene,nativeTick,productionNativeElement} from '../src/resources/production-native-document';
describe('T1070 v31 纯原生合同',()=>{
 it('保留真实text params、动画和未改扩展',()=>{
 const element={id:'caption-1',name:'字幕',type:'text',startTime:0,duration:120000,trimStart:0,trimEnd:0,params:{content:'真实字幕','transform.scaleX':1},animations:{opacity:{keys:[{id:'k',time:0,value:1,segmentToNext:'linear',tangentMode:'auto'}]}},vendorExtension:{rich:'保留'}};
 expect(productionNativeElement.parse(element)).toEqual(element);
 const scene={id:'scene-a',name:'场景',isMain:true,tracks:{main:{id:'main',name:'主轨',type:'video',muted:false,hidden:false,elements:[]},overlay:[{id:'text',name:'字幕',type:'text',hidden:false,elements:[element]}],audio:[]},bookmarks:[],createdAt:'2026-10-07T00:00:00.000Z',updatedAt:'2026-10-07T00:00:00.000Z'};
 expect(productionNativeScene.parse(scene)).toEqual(scene);
 });
 it('拒绝秒数、超安全整数和非正速率',()=>{
 expect(nativeTick.safeParse(1.5).success).toBe(false);
 expect(nativeTick.safeParse(Number.MAX_SAFE_INTEGER+1).success).toBe(false);
 expect(productionNativeElement.safeParse({id:'v',name:'视频',type:'video',mediaId:'m',startTime:0,duration:120000,trimStart:0,trimEnd:0,params:{},retime:{rate:0}}).success).toBe(false);
 });
});
