'use client';
import {useCreationClient,useCreationScope,creationScopeKey,readCreationScope,CreationScopeChangedError,type CreationScope} from '@/lib/creation-workspace-scope';
import * as React from 'react';
import Link from 'next/link';
import {useSearchParams} from 'next/navigation';
import {workCanvasContext,type CanvasMaterialSelection} from '@creatoros/contract';
import {GraphicPageCanvasContext} from './graphic-page-context';
import {client} from '@/lib/contract-client';
import {readCurrentAccountId} from '@/lib/http-transport';
type WorkCanvasContext=ReturnType<typeof workCanvasContext.parse>;
const key=(accountId:string,compositionId:string,handle:string)=>`creatoros-work-canvas:${accountId}:${compositionId}:${handle}`;
export function storeWorkCanvasContext(accountId:string|null,projectId:string,context:WorkCanvasContext,workspaceScope:CreationScope=readCreationScope()){
 const owner=workspaceScope.groupId?creationScopeKey(workspaceScope):accountId;
 if(!owner||creationScopeKey(readCreationScope())!==creationScopeKey(workspaceScope)||(!workspaceScope.groupId&&readCurrentAccountId()!==accountId))throw Error('当前工作区已变化，请重新选择作品与来源');
 const actual=workCanvasContext.parse(context);if(actual.availability!=='available')throw Error('画布尚不可用，请保留当前稿件和来源选择');
 const handle=crypto.randomUUID();sessionStorage.setItem(key(owner,actual.compositionId,handle),JSON.stringify({projectId,groupId:workspaceScope.groupId,context:actual}));
 return `/canvases?projectId=${encodeURIComponent(projectId)}&compositionId=${encodeURIComponent(actual.compositionId)}&workContext=${encodeURIComponent(handle)}`;
}
export function CanvasWorkContext({accountId,projectId,canvasId,confirmedSelections,onLeave}:{accountId:string|null;projectId:string|null;canvasId?:string;confirmedSelections?:CanvasMaterialSelection[];onLeave?:(href:string)=>Promise<void>}){
 const workspaceSelection=useCreationScope();
 const params=useSearchParams(),handle=params.get('workContext'),compositionId=params.get('compositionId');
 const graphicHandle=params.get('graphicPageContext');
 if(graphicHandle&&canvasId)return <GraphicPageCanvasContext key={JSON.stringify([creationScopeKey(workspaceSelection),projectId,canvasId,graphicHandle])} {...{accountId,projectId,canvasId,handle:graphicHandle,confirmedSelections,onLeave}}/>;
 const scope=JSON.stringify([creationScopeKey(workspaceSelection),projectId,handle,compositionId]);
 return <CanvasWorkContextContents key={scope} {...{accountId,projectId,handle,compositionId,scope}}/>;
}
function CanvasWorkContextContents({accountId,projectId,handle,compositionId,scope}:{accountId:string|null;projectId:string|null;handle:string|null;compositionId:string|null;scope:string}){
 const client=useCreationClient(),workspaceSelection=useCreationScope(),owner=workspaceSelection.groupId?creationScopeKey(workspaceSelection):accountId,accountMatchesScope=Boolean(workspaceSelection.groupId)||accountId===workspaceSelection.accountId;

 const [state,setState]=React.useState<{scope:string;context:WorkCanvasContext|null;error:string}>({scope:'',context:null,error:''});
 const context=state.scope===scope?state.context:null,error=state.scope===scope?state.error:'';
 React.useEffect(()=>{let live=true;void (async()=>{if(!handle||!compositionId)return;try{
  // 旧账号props必须匹配真实root；组内平台筛选保留组共享上下文。
  if(!accountMatchesScope)throw new CreationScopeChangedError();
  if(!owner||creationScopeKey(readCreationScope())!==creationScopeKey(workspaceSelection))throw Error('当前账号已变化，作品上下文未带入；画布可继续独立编辑');
  const raw=JSON.parse(sessionStorage.getItem(key(owner!,compositionId,handle))??'null');if(!raw||!projectId||raw.projectId!==projectId||(raw.groupId??null)!==workspaceSelection.groupId)throw Error('作品上下文不属于此项目，画布可继续独立编辑');
  const saved=workCanvasContext.parse(raw.context);if(saved.compositionId!==compositionId)throw Error('作品上下文身份不一致');
  const body={member:saved.member,ownerVersion:saved.ownerVersion,source:saved.source,target:saved.target};
  const actual=workCanvasContext.parse(await client.getWorkCompositionCanvasContext({params:{compositionId},query:undefined,body}));
  if(!live)return;if(!owner||creationScopeKey(readCreationScope())!==creationScopeKey(workspaceSelection))throw Error('当前账号已变化，作品上下文未带入');if(actual.availability!=='available')throw Error('作品上下文暂不可用，画布可继续独立编辑');
  // SEMANTIC_BOUNDARY_ALLOW: 核验原返回的明确身份与冻结版本，不做创作选择。
  if(actual.compositionId!==compositionId||JSON.stringify({member:actual.member,ownerVersion:actual.ownerVersion,source:actual.source,target:actual.target})!==JSON.stringify(body))throw Error('原作品身份不一致，画布可继续独立编辑');
  setState({scope,context:actual,error:''});
 }catch(reason){if(live)setState({scope,context:null,error:`${reason instanceof Error?reason.message:'作品上下文未通过核对'}。原稿与来源选择保留。`});}})();return()=>{live=false;};},[accountMatchesScope,projectId,handle,compositionId,scope,client,workspaceSelection,owner]);
 if(!handle||!compositionId)return null;
 return <div className="flex flex-wrap items-center gap-3 border-b bg-primary/5 px-4 py-3 text-sm" aria-label="作品画布上下文">{context?<><span>已核对原稿、保存版本、来源与用途。图片确认保留后，回到作品明确采用。</span><Link className="rounded-md border px-3 py-2" href={`/projects/${encodeURIComponent(projectId!)}/work?compositionId=${encodeURIComponent(context.compositionId)}`}>返回原作品组合</Link></>:error?<p role="status">{error}</p>:<p role="status">正在核对原作品上下文；画布可继续独立编辑。</p>}</div>;
}
