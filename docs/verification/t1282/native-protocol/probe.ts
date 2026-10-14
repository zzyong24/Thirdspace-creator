import {initializeGpu,renderFrame as referenceRender} from '/tmp/creatoros-t1274-preview-isolated/apps/web/node_modules/opencut-wasm/opencut_wasm.js';
import {wasmCompositor} from '/tmp/creatoros-t1274-preview-isolated/apps/web/src/services/renderer/compositor/wasm-compositor';
const results:any[]=[];
function assert(v:any,message:string){if(!v)throw new Error(message)}
function freeze(v:any):any{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v)}return v}
function pixels(){const c=new OffscreenCanvas(32,32),ctx=c.getContext('2d')!;ctx.drawImage(wasmCompositor.getCanvas(),0,0);return Array.from(ctx.getImageData(0,0,32,32).data)}
const equal=(a:any,b:any)=>JSON.stringify(a)===JSON.stringify(b);
const blur=(sigma:number,direction:number[])=>({shader:'gaussian-blur',uniforms:{u_sigma:sigma,u_step:1,u_direction:direction}});
const groupsA=[[blur(2,[1,0]),blur(1,[0,1])]],groupsB=[[blur(4,[0,1])],[blur(1,[1,0]),blur(2,[0,1])]];
const scene=(groups:any)=>({type:'sceneEffect',effectPassGroups:groups});
const layer={type:'layer',textureId:'source',transform:{centerX:16,centerY:16,width:32,height:32,rotationDegrees:0,flipX:false,flipY:false},opacity:1,blendMode:'normal',effectPassGroups:[],mask:null};
const overlay={...layer,textureId:'overlay',transform:{...layer.transform,centerX:11,centerY:19,width:18,height:20,rotationDegrees:17,flipX:true},opacity:0.63,blendMode:'multiply',effectPassGroups:groupsA,mask:{textureId:'mask',feather:0,inverted:false}};
try {
 await initializeGpu();wasmCompositor.ensureInitialized({width:32,height:32});
 const texture=(id:string,draw:(c:OffscreenCanvasRenderingContext2D)=>void)=>{const c=new OffscreenCanvas(32,32);draw(c.getContext('2d')!);return {kind:'external' as const,id,source:c,width:32,height:32}};
 wasmCompositor.syncTextures([
 texture('source',c=>{c.fillStyle='#e92337';c.fillRect(0,0,32,32);c.fillStyle='#164df1';c.fillRect(13,0,19,32);c.fillStyle='#fbb712';c.fillRect(3,7,17,9)}),
 texture('overlay',c=>{c.fillStyle='#32fa82';c.fillRect(0,0,32,32);c.fillStyle='#eaf4fa';c.fillRect(11,2,12,17)}),
 texture('mask',c=>{c.fillStyle='white';c.fillRect(3,3,22,25)})]);
 const cases:[string,any[]][]=[['no-effects',[layer]],['layer-effects',[{...layer,effectPassGroups:groupsA}]],['scene-empty',[layer,scene([])]],['scene-single-group',[layer,scene(groupsA)]],['scene-multiple-groups',[layer,scene(groupsB)]],['mixed-layers-scenes-mask-transform-opacity-blend',[layer,scene(groupsA),overlay,scene(groupsB)]],['mixed-reordered-control',[layer,overlay,scene(groupsA),scene(groupsB)]]];
 for(const [name,items]of cases){const frame=freeze({width:32,height:32,clear:{color:[0,0,0,1]},items}),snapshot=JSON.stringify(frame);try{
  wasmCompositor.render(frame);const actual=pixels(),wire=(window as any).lastWireFrame;
  assert(JSON.stringify(frame)===snapshot,'输入对象被改写');
  const hasScene=items.some(x=>x.type==='sceneEffect');assert(hasScene?wire!==frame:wire===frame,'无场景效果原对象直传/场景临时副本不符合约定');
  for(let i=0;i<items.length;i++){const input=items[i],out=wire.items[i];if(input.type==='layer')assert(out===input,'layer 对象必须原样保留');else{assert(out.type===input.type&&out.effect_pass_groups===input.effectPassGroups&&!('effectPassGroups'in out),'场景组顺序/参数引用或字段错误')}}
  const expected={...frame,items:items.map(x=>x.type==='sceneEffect'?{type:'sceneEffect',effect_pass_groups:x.effectPassGroups}:x)};
  referenceRender(expected);const reference=pixels();assert(equal(actual,reference),'真实桥输出与真实 WASM 期望像素不一致');
  results.push({name,status:'pass',inputUnchanged:true,wireIdentityPreserved:true,pixels:actual});
 }catch(error){results.push({name,status:'fail',inputUnchanged:JSON.stringify(frame)===snapshot,error:String(error)})}}
 const find=(name:string)=>results.find(x=>x.name===name)?.pixels;
 for(const [name,a,b,same]of [['empty-scene-preserves-pixels','scene-empty','no-effects',true],['single-scene-matches-layer','scene-single-group','layer-effects',true],['blur-changes-pixels','scene-single-group','no-effects',false],['multiple-groups-change-pixels','scene-multiple-groups','scene-single-group',false],['mixed-item-order-is-observable','mixed-layers-scenes-mask-transform-opacity-blend','mixed-reordered-control',false]] as const){const av=find(a),bv=find(b);results.push({name,status:av&&bv&&equal(av,bv)===same?'pass':'fail',expectedEqual:same,actualEqual:av&&bv?equal(av,bv):null})}
}catch(error){results.push({name:'initialization',status:'fail',error:String(error)})}
(window as any).protocolResult=results;
