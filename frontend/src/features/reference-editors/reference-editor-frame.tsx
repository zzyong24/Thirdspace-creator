"use client";
import * as React from 'react';
export type EditorSnapshot={document:Record<string,unknown>;mediaMetadata?:Array<Record<string,unknown>>};
export type EditorExport={blob:Blob;fileName:string;document:Record<string,unknown>;mediaMetadata?:Array<Record<string,unknown>>};
export type EditorFrameHandle={request:<T=unknown>(operation:string,payload?:unknown,options?:{requestId?:string})=>Promise<T>};
const TYPE='creatoros.reference-editor';
/** 可信同源静态编辑器的机械桥；业务保存、归属和媒体ID由父作品服务持有。 */
export const ReferenceEditorFrame=React.forwardRef<EditorFrameHandle,{
 editor:'kuaitu'|'opencut-classic';disabled?:boolean;onReady:()=>void;onChanged:()=>void;
 onImport:(file:File)=>Promise<{mediaId:string}>;onError:(message:string)=>void;
}>(function ReferenceEditorFrame(props,ref){
 const frame=React.useRef<HTMLIFrameElement>(null),callbacks=React.useRef(props);
 React.useLayoutEffect(()=>{callbacks.current=props;});
 const [session,setSession]=React.useState('');
 const pending=React.useRef(new Map<string,{resolve:(value:unknown)=>void;reject:(error:Error)=>void;timer:ReturnType<typeof setTimeout>}>());
 React.useEffect(()=>{setSession(crypto.randomUUID());},[]);
 React.useImperativeHandle(ref,()=>({request:<T,>(operation:string,payload?:unknown,options?:{requestId?:string})=>new Promise<T>((resolve,reject)=>{
  if(!session||!frame.current?.contentWindow){reject(Error('编辑器尚未准备好'));return;}
  const requestId=options?.requestId??crypto.randomUUID();
  if(pending.current.has(requestId)){reject(Error('原编辑请求仍在确认，请等待回复'));return;}
  const timer=setTimeout(()=>{pending.current.delete(requestId);reject(Error('编辑操作尚未确认，当前内容已保留，请重试'));},120000);
  pending.current.set(requestId,{resolve:v=>resolve(v as T),reject,timer});
  frame.current.contentWindow.postMessage({type:TYPE,version:1,session,requestId,operation,payload},location.origin);
 })}),[session]);
 React.useEffect(()=>{
  if(!session)return;
  let alive=true;let readyDelivered=false;const importing=new Set<string>();const requests=pending.current;
  const receive=(event:MessageEvent)=>{
   const m=event.data;
   if(event.origin!==location.origin||event.source!==frame.current?.contentWindow||!m||m.type!==TYPE||m.version!==1||m.session!==session)return;
   if(m.operation==='ready'){if(!readyDelivered){readyDelivered=true;callbacks.current.onReady();}return;}
   if(m.operation==='changed'){callbacks.current.onChanged();return;}
   if(m.operation==='import-media'&&typeof m.requestId==='string'&&m.payload?.file instanceof File){
    if(importing.has(m.requestId))return;importing.add(m.requestId);
    void callbacks.current.onImport(m.payload.file).then(value=>{
     if(alive)frame.current?.contentWindow?.postMessage({...m,operation:'result',payload:{operation:'import-media',...value}},location.origin);
    }).catch(error=>{if(alive){const message=error instanceof Error?error.message:'素材上传失败，当前输入保留';callbacks.current.onError(message);frame.current?.contentWindow?.postMessage({...m,operation:'error',payload:{message}},location.origin);}}).finally(()=>importing.delete(m.requestId));return;
   }
   if(typeof m.requestId!=='string')return;
   const request=requests.get(m.requestId);if(!request)return;
   if(m.operation!=='result'&&m.operation!=='error')return;
   requests.delete(m.requestId);clearTimeout(request.timer);
   if(m.operation==='error')request.reject(Object.assign(Error(typeof m.payload?.message==='string'?m.payload.message:'编辑操作未完成'),{code:m.payload?.code,status:m.payload?.status}));
   else request.resolve(m.payload);
  };
  window.addEventListener('message',receive);
  return()=>{alive=false;window.removeEventListener('message',receive);for(const request of requests.values()){clearTimeout(request.timer);request.reject(Error('已切换作品，原操作停止'));}requests.clear();};
 },[session]);
 return session?<iframe ref={frame} title={props.editor==='kuaitu'?'图片设计工作台':'视频剪辑工作台'} src={`/reference-editors/${props.editor}/index.html#/?session=${encodeURIComponent(session)}`} sandbox="allow-scripts allow-same-origin allow-downloads" allow="autoplay" className={`h-full w-full border-0 ${props.editor==='opencut-classic'?'min-h-[400px]':'min-h-[480px]'} ${props.disabled?'pointer-events-none opacity-80':''}`} />:<p className="p-5">正在打开编辑器…</p>;
});
