"use client";
import * as React from "react";
import type {ProductionEditorDocument} from "@creatoros/contract";
import {ProjectVideoSessionContext,type VideoLeaveControl,type VideoSessionIdentity} from "@/features/reference-editors/project-video-session-registry";
import {useCreationWorkspace,type CreationScope} from "@/lib/creation-workspace-scope";
import {useNativeWorkspace} from "@/features/reference-editors/use-native-account";
import {ProductionWorkbench,type ProductionWorkbenchProps} from "./production-workbench";
import {RoughCutWorkbench} from "./rough-cut-workbench";
import {ProductionConversionPanel} from "./production-conversion-panel";
import {VideoReferenceWorkbench} from "@/features/reference-editors/video-reference-workbench";
import {ProductionVisualEditor} from "./production-visual-editor";

/** 当前作品的工程入口；旧备料可达，首次转换明确保存并留存原件。 */
export function ProductionEditorSession(props:ProductionWorkbenchProps&{sessionIdentity?:VideoSessionIdentity;scopeOverride?:CreationScope;visible?:boolean;onLeaveControl?:(control:VideoLeaveControl|null)=>void}) {
  const currentScope=useNativeWorkspace(),scope=props.scopeOverride??currentScope,workspace=useCreationWorkspace(scope),client=workspace.client;
  React.useEffect(()=>{if(currentScope.groupId===scope.groupId&&currentScope.accountId===scope.accountId&&workspace.signal.aborted)workspace.activate();},[currentScope.groupId,currentScope.accountId,workspace]);
  const [rough,setRough]=React.useState(false);
  const [reference,setReference]=React.useState(true),[originalOpened,setOriginalOpened]=React.useState(false);
  const [document,setDocument]=React.useState<ProductionEditorDocument|null>(null),[error,setError]=React.useState<string|null>(null),[prepare,setPrepare]=React.useState(false),[epoch,setEpoch]=React.useState(0);
  React.useEffect(()=>{if(!props.outputId)return;let cancelled=false;void client.getProductionEditor({params:{outputId:props.outputId},query:undefined,body:undefined}).then(data=>{if(!cancelled){setDocument(data);setError(null);}}).catch(e=>{if(!cancelled)setError(e instanceof Error?e.message:"制作工程读取失败");});return()=>{cancelled=true;};},[props.outputId,epoch,client]);
  if(!props.outputId)return <ProductionWorkbench {...props}/>;
  if(error&&!document)return <div role="alert">{error}<button className="ml-2 rounded border px-3 py-2" onClick={()=>setEpoch(e=>e+1)}>重试读取</button></div>;
  if(!document)return <p className="p-4 text-sm text-muted-foreground">正在读取当前视频的制作工程…</p>;
  const originalContents=()=>{
  if(document.plan?.editorVersion===3)return <div className="space-y-4"><button className="rounded border px-3 py-2" onClick={()=>setReference(true)}>返回剪辑工作台</button><p className="text-sm text-muted-foreground">当前剪辑稿保留在开源工作台。原方案可从工作台的历史版本恢复；这里继续管理素材与成片。</p><ProductionWorkbench {...props} editorReadOnly/></div>;
  if(!prepare&&(rough||document.plan?.editorVersion===2))return <div className="space-y-3"><button className="rounded border px-3 py-2" onClick={()=>setReference(true)}>返回剪辑工作台</button><RoughCutWorkbench key={document.outputId+":"+epoch} initial={document} onPrepare={()=>setPrepare(true)} onSaved={setDocument}/></div>;
  if(document.state==="editable"&&!prepare)return <div className="grid gap-3"><button className="rounded border px-3 py-2" onClick={()=>setReference(true)}>返回剪辑工作台</button><ProductionConversionPanel document={document} onSaved={()=>setEpoch(e=>e+1)}/><ProductionVisualEditor key={document.outputId+":"+epoch} initial={document} onPrepare={()=>setPrepare(true)}/></div>;
  return <div className="grid gap-3"><button className="justify-self-start rounded border px-3 py-2 text-sm" onClick={()=>setReference(true)}>打开剪辑工作台</button>
    {document.state==="editable"?<div className="flex items-center gap-3 rounded border p-3"><button className="rounded border px-3 py-2 text-sm" onClick={()=>{setPrepare(false);setEpoch(e=>e+1);}}>返回可视剪辑</button><p className="text-sm text-muted-foreground">当前片段在可视剪辑中修改；这里仍可备料、查看分场参考、上传成品与导出素材包。</p></div>:null}
    {document.state==="legacy"?<ProductionConversionPanel document={document} onSaved={()=>{setPrepare(false);setEpoch(e=>e+1);}}/>:null}
    <ProductionWorkbench {...props} editorReadOnly={document.state==="editable"}/>
    <button className="justify-self-start rounded border px-3 py-2 text-sm" onClick={()=>setEpoch(e=>e+1)}>读取最新制作方案</button>
  </div>;
  };
  return <div><div data-video-native-outlet hidden={!reference} inert={!reference} aria-hidden={!reference||undefined}><VideoReferenceWorkbench initial={document} sessionIdentity={props.sessionIdentity} title={props.projectTitle} scopeOverride={scope} visible={props.visible!==false&&reference} onLeaveControl={props.onLeaveControl} onSaved={setDocument} onOriginal={()=>{setOriginalOpened(true);setReference(false);}}/></div><div data-video-original-outlet hidden={reference} inert={reference} aria-hidden={reference||undefined}>{originalOpened?originalContents():null}</div></div>;
}

export function ProductionEditorEntry(props:ProductionWorkbenchProps){
 const scope=useNativeWorkspace(),host=React.useContext(ProjectVideoSessionContext);
 React.useEffect(()=>{if(host)return host.attach(props,scope);},[host,props.projectId,props.outputId,scope.groupId,scope.accountId]);
 if(host)return <p className="p-4 text-sm text-muted-foreground">正在恢复当前剪辑工作台…</p>;
 return <ProductionEditorSession key={`${scope.groupId?`group:${scope.groupId}`:`account:${scope.accountId??'missing'}`}:${props.projectId}:${props.outputId??'empty'}`} {...props}/>;
}
