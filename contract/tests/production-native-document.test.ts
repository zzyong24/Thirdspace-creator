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

it('changed-only registry：新增未知动画拒绝，合法graphic/blur参数可改，旧未知扩展原样保留',async()=>{
 const {validateNativeSceneTracksCandidate}=await import('../src/resources/production-native-document');
 const before:any={main:{id:'main',name:'主轨',type:'video',muted:false,hidden:false,elements:[]},overlay:[{id:'graphics',name:'图形',type:'graphic',hidden:false,elements:[{id:'rectangle',name:'矩形',type:'graphic',definitionId:'rectangle',startTime:0,duration:120000,trimStart:0,trimEnd:0,params:{fill:'#fff',legacy:{nested:'保真'}}}]}],audio:[]};
 const legal=structuredClone(before);legal.overlay[0].elements[0].params.fill='#000';expect(()=>validateNativeSceneTracksCandidate(before,legal,[])).not.toThrow();
 const unknown=structuredClone(before);unknown.overlay[0].elements[0].animations={invented:{keys:[{id:'k',time:0,value:1,segmentToNext:'linear',tangentMode:'auto'}]}};expect(()=>validateNativeSceneTracksCandidate(before,unknown,[])).toThrow('动画');
 const effect=structuredClone(before);effect.overlay.push({id:'fx-track',name:'效果',type:'effect',hidden:false,elements:[{id:'fx',name:'blur',type:'effect',effectType:'blur',startTime:0,duration:120000,trimStart:0,trimEnd:0,params:{intensity:30}}]});expect(()=>validateNativeSceneTracksCandidate(before,effect,[])).not.toThrow();
 effect.overlay[1].elements[0].effectType='invented';effect.overlay[1].elements[0].params={};expect(()=>validateNativeSceneTracksCandidate(before,effect,[])).toThrow('catalog');
});
