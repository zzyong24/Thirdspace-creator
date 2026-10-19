import {it,expect} from 'vitest';
import {validateNativeSceneTracksCandidate,workEditorCompleteCandidate} from '../src';
const old:any={main:{id:'main',type:'video',name:'主轨',hidden:false,muted:false,elements:[]},overlay:[{id:'future-track',type:'graphic',name:'旧扩展',hidden:false,elements:[{id:'future',type:'future-shape',name:'旧形状',startTime:0,duration:120000,trimStart:0,trimEnd:0,params:{old:{x:1}},privatePayload:{data:[1,2]}}]}],audio:[]};
it('未知旧元素仍在原轨且完全原样可穿过候选/返回合同；修改、搬轨与新增仍拒绝',()=>{
 expect(()=>validateNativeSceneTracksCandidate(old,structuredClone(old),[])).not.toThrow();
 const scene={id:'scene',name:'场景',isMain:true,createdAt:'date',updatedAt:'date',bookmarks:[],tracks:old};
 expect(workEditorCompleteCandidate.parse({kind:'native_scene',document:scene}).document).toEqual(scene);
 const changed=structuredClone(old);changed.overlay[0].elements[0].duration=1;expect(()=>validateNativeSceneTracksCandidate(old,changed,[])).toThrow();
 const moved=structuredClone(old);moved.main.elements=moved.overlay[0].elements;moved.overlay[0].elements=[];expect(()=>validateNativeSceneTracksCandidate(old,moved,[])).toThrow();
 const fresh=structuredClone(old);fresh.overlay[0].elements[0].id='new';expect(()=>validateNativeSceneTracksCandidate(old,fresh,[])).toThrow();
});
