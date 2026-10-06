import {creationScopeKey,readCreationScope,type CreationScope} from '@/lib/creation-workspace-scope';
import type {CanvasDocument,CanvasNode,CanvasVisualGroup,CreativeCanvasResource,VisualTemplate} from '@creatoros/contract';
import {createTemplatePlan,type TemplatePlanInput} from './canvas-template-plan';
import type {CanvasAssetOption} from './canvas-asset-picker';
export type HomeSeed={kind:'template';template:VisualTemplate;input:TemplatePlanInput}|{kind:'asset';asset:CanvasAssetOption};
export type HomeDestination={kind:'new';title:string;projectId?:string}|{kind:'existing';canvasId:string};
export type HomeTransferPort={create:(input:{title:string;projectId?:string})=>Promise<CreativeCanvasResource>;get:(id:string)=>Promise<CreativeCanvasResource>;save:(id:string,revision:number,document:CanvasDocument)=>Promise<CreativeCanvasResource>;asset:(id:string)=>Promise<{id:string;assetType:string;currentFileId:string}>;project:(id:string)=>Promise<unknown>};
/** SEMANTIC_BOUNDARY_ALLOW: 仅落实用户明确目的地，以稳定 ID 回读保存回执，检查权限和 CAS；不判断创作风格或匹配语义。 */
export class CanvasHomeTransfer{
 canvasId:string|null=null;
 creationUnknown=false;
 private busy=false;
 private plan:{nodes:CanvasNode[];group?:CanvasVisualGroup}|null=null;
 constructor(private accountId:string|null,private seed:HomeSeed,private port:HomeTransferPort,private currentAccount:()=>string|null,private nextId:()=>string,private isActive:()=>boolean=()=>true,private workspaceScope?:CreationScope){}
 private owned(canvas?:CreativeCanvasResource){if(!this.isActive())throw new Error("已离开创作空间，请重新选择");if(this.workspaceScope?creationScopeKey(readCreationScope())!==creationScopeKey(this.workspaceScope):this.currentAccount()!==this.accountId)throw new Error('账号已切换，请重新选择模板或素材');if(canvas&&(this.workspaceScope?.groupId?canvas.groupId!==this.workspaceScope.groupId:canvas.accountId!==this.accountId))throw new Error('画布不属于当前账号');}
 async run(destination:HomeDestination):Promise<CreativeCanvasResource>{
  if(this.busy)throw new Error('正在放入画布，请稍候');
  if(this.creationUnknown)throw new Error('创建结果待核对，请查看画布库，确认后再继续');
  this.busy=true;
  try{
   this.owned();
   if(!this.canvasId&&destination.kind==='new'){
    if(!destination.title.trim())throw new Error('请填写画布名称');
    if(destination.projectId){await this.port.project(destination.projectId);this.owned();}
    let created:CreativeCanvasResource;
    try{created=await this.port.create({title:destination.title.trim(),...(destination.projectId?{projectId:destination.projectId}:{})});}catch(error){this.creationUnknown=true;throw error;}
    this.canvasId=created.id;this.owned(created);
   }
   const id=this.canvasId??(destination.kind==='existing'?destination.canvasId:null);
   if(!id)throw new Error('请选择画布');
   // Once a save is attempted, retries stay bound to this actual canvas ID.
   this.canvasId=id;
   const canvas=await this.port.get(id);this.owned(canvas);
   if(!this.plan){
    const viewport=canvas.document.viewport;
    const center={x:(400-viewport.x)/viewport.zoom,y:(280-viewport.y)/viewport.zoom};
    // Put new content to the right of existing content without moving its viewport.
    if(canvas.document.nodes.length)center.x=Math.max(center.x,...canvas.document.nodes.map(n=>n.position.x+(n.size?.width??350)+215));
    if(this.seed.kind==='template')this.plan=createTemplatePlan(this.seed.template,this.seed.input,center,this.nextId);
    else{
     const {asset}=this.seed;const current=await this.port.asset(asset.id);this.owned();
     if(current.assetType!==asset.assetType||!['image','video'].includes(current.assetType))throw new Error('素材类型不可用，请重新选择');
     this.plan={nodes:[{id:this.nextId(),type:asset.assetType as 'image'|'video',assetId:asset.id,fileId:asset.currentFileId,label:asset.name,position:{x:Math.round(center.x-175),y:Math.round(center.y-140)},size:{width:350,height:280}}]};
    }
   }
   const {nodes,group}=this.plan,existing=nodes.map(n=>canvas.document.nodes.find(old=>old.id===n.id));
   if(existing.every(Boolean)){
    const same=nodes.every((n,index)=>{const old=existing[index]!;if(n.type!==old.type)return false;if(n.type==='image'||n.type==='video')return (old.type==='image'||old.type==='video')&&n.assetId===old.assetId&&n.fileId===old.fileId;if(n.type==='image_generation'||n.type==='video_generation')return (old.type==='image_generation'||old.type==='video_generation')&&n.prompt===old.prompt&&n.templateId===old.templateId&&n.templateVersion===old.templateVersion&&n.referenceAssetId===old.referenceAssetId&&n.aspectRatio===old.aspectRatio;return false;});
    if(!same)throw new Error('已保存的节点发生变化，请在原画布核对');
    if(group&&!canvas.document.visualGroups?.some(old=>old.id===group.id&&JSON.stringify(old.pageOrder)===JSON.stringify(group.pageOrder)))throw new Error('页组已发生变化，请在原画布核对');
    return canvas;
   }
   if(existing.some(Boolean)||(group&&canvas.document.visualGroups?.some(old=>old.id===group.id)))throw new Error('画布已有部分内容，请在原画布核对');
   if(canvas.document.nodes.length+nodes.length>300)throw new Error('画布已满，请整理节点后再添加');
   const document:CanvasDocument={...canvas.document,nodes:[...canvas.document.nodes,...nodes],...(group?{visualGroups:[...(canvas.document.visualGroups??[]),group]}:{})};
   this.owned();
   const saved=await this.port.save(id,canvas.revision,document);this.owned(saved);return saved;
  }finally{this.busy=false;}
 }
}
