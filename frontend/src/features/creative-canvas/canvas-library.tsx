"use client";

import {useCallback,useEffect,useMemo,useRef,useState} from "react";
import Link from "next/link";
import {useRouter,useSearchParams} from "next/navigation";
import {ArrowLeft,ArrowRight,ImagePlus,Layers3,Plus,Video} from "lucide-react";
import {client} from "@/lib/contract-client";
import {useAccountsChanged} from "@/lib/account-events";
import {readCurrentAccountId} from "@/lib/http-transport";
import type {CreativeCanvasResource} from "@creatoros/contract";

export function CanvasLibrary(){
 const router=useRouter(),params=useSearchParams(),projectId=params.get("projectId");
 const [items,setItems]=useState<CreativeCanvasResource[]>([]),[projectNames,setProjectNames]=useState<Record<string,string>>({}),[projectTitle,setProjectTitle]=useState<string|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(""),[creating,setCreating]=useState(false),[accountReady,setAccountReady]=useState(false);
 const refreshId=useRef(0),alive=useRef(true);
 const contextQuery=params.get("workContext")&&params.get("compositionId")?`?workContext=${encodeURIComponent(params.get("workContext")!)}&compositionId=${encodeURIComponent(params.get("compositionId")!)}`:"";
 const refresh=useCallback(async()=>{
  const id=++refreshId.current,accountId=readCurrentAccountId();
  setLoading(true);setError("");setItems([]);setProjectTitle(null);
  if(!readCurrentAccountId()){setAccountReady(false);setItems([]);setError("请先绑定或选择账号");setLoading(false);return;}
  setAccountReady(true);
  try{
   const [canvases,project]=await Promise.all([
    client.listCanvases({params:undefined,query:undefined,body:undefined}),
    projectId?client.getProject({params:{projectId},query:undefined,body:undefined}):Promise.resolve(null),
   ]);
   if(id!==refreshId.current||!alive.current||accountId!==readCurrentAccountId())return;
   setItems((canvases as unknown as CreativeCanvasResource[]).filter(item=>item.accountId===accountId));
   if(project)setProjectTitle(project.title);
   try{const projects=await client.listProjects({params:undefined,query:{page:1,pageSize:100},body:undefined});if(id===refreshId.current)setProjectNames(Object.fromEntries((projects as unknown as Array<{id:string;title:string}>).map(item=>[item.id,item.title])));}catch{if(id===refreshId.current)setProjectNames({});}
  }catch(e){if(id===refreshId.current)setError(projectId?"作品或画布暂时无法读取，请返回作品重试。":e instanceof Error?e.message:"画布读取失败");}
  finally{if(id===refreshId.current)setLoading(false);}
 },[projectId]);
 useEffect(()=>{alive.current=true;queueMicrotask(()=>{if(alive.current)void refresh();});return()=>{alive.current=false;refreshId.current++;};},[refresh]);
 useAccountsChanged(useCallback(()=>{setItems([]);void refresh();},[refresh]));
 const visible=useMemo(()=>projectId?items.filter(item=>item.projectId===projectId):items,[items,projectId]);
 async function create(){
  if(creating||!accountReady||(projectId&&!projectTitle))return;const accountId=readCurrentAccountId(),epoch=refreshId.current;setCreating(true);setError("");
  try{const response=await client.createCanvas({params:undefined,query:undefined,body:{title:projectTitle?`${projectTitle} · 创作画布`:"未命名画布",...(projectId?{projectId}:{})}});if(!alive.current||epoch!==refreshId.current||accountId!==readCurrentAccountId())return;router.push(`/canvases/${encodeURIComponent(response.id)}${contextQuery}`);}catch(e){if(alive.current&&accountId===readCurrentAccountId())setError(e instanceof Error?e.message:"创建画布失败");}finally{if(alive.current&&accountId===readCurrentAccountId())setCreating(false);}
 }
 return <main className="mx-auto w-full max-w-6xl space-y-7 p-5 pb-12 sm:p-8">
  {projectId&&projectTitle?<Link href={params.get("compositionId")?`/projects/${encodeURIComponent(projectId)}/work?compositionId=${encodeURIComponent(params.get("compositionId")!)}`:`/projects/${encodeURIComponent(projectId)}#materials`} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4"/>返回项目 · {projectTitle}</Link>:null}
  <header className="flex flex-wrap items-end justify-between gap-5"><div className="space-y-2"><p className="text-xs font-semibold tracking-[.18em] text-primary">CREATIVE CANVAS</p><h1 className="text-3xl font-semibold tracking-tight">{projectTitle?`${projectTitle}的创作画布`:"创作画布"}</h1><p className="max-w-2xl text-sm leading-6 text-muted-foreground">{projectTitle?"在这里尝试图片、视频和创意版本。选中的结果可保留到素材库，再回到原作品选择用途。":"在无限画布里整理想法、制作图片和视频。每个账号的画布和素材独立保存。"}</p></div><button type="button" onClick={()=>void create()} disabled={creating||loading||!accountReady||Boolean(projectId&&!projectTitle)} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-50"><Plus className="size-4"/>{creating?"正在创建…":projectTitle?"为这个项目新建画布":"新建画布"}</button></header>
  {projectId?<div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card px-5 py-4"><div className="flex items-center gap-3"><div className="rounded-xl bg-primary/10 p-2.5 text-primary"><Layers3 className="size-5"/></div><div><p className="text-sm font-semibold">这个项目的画布</p><p className="text-xs text-muted-foreground">只显示已关联这个项目的画布，不会混入其他作品。</p></div></div><Link href="/canvases" className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">查看当前账号全部画布<ArrowRight className="size-4"/></Link></div>:null}
  {error?<div role="alert" className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">{error}<button type="button" onClick={()=>void refresh()} className="ml-3 font-medium underline">重试</button></div>:null}
  {loading?<p role="status" className="rounded-2xl border bg-card p-8 text-sm text-muted-foreground">正在读取画布…</p>:error?null:visible.length===0?<div className="rounded-3xl border border-dashed bg-card px-6 py-12 text-center"><div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary"><ImagePlus className="size-7"/></div><h2 className="text-lg font-semibold">{projectTitle?"这个项目还没有画布":"从一张空白画布开始"}</h2><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">{projectTitle?"先做图片或视频方案，满意后再把结果加入作品素材。":"可以先写想法、挑现有素材，也可以直接开始生成图片或视频。"}</p><button type="button" onClick={()=>void create()} disabled={creating||!accountReady||Boolean(projectId&&!projectTitle)} className="mt-5 inline-flex min-h-10 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-50"><Plus className="size-4"/>{projectTitle?"创建作品画布":"新建画布"}</button></div>:<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{visible.map(item=><Link key={item.id} href={`/canvases/${encodeURIComponent(item.id)}${contextQuery}`} className="group flex min-h-48 flex-col justify-between rounded-2xl border bg-card p-5 transition hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md focus-visible:outline-2 focus-visible:outline-primary"><div><div className="mb-5 flex items-center justify-between"><div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><Layers3 className="size-5"/></div><ArrowRight className="size-4 text-muted-foreground transition group-hover:translate-x-1 group-hover:text-primary"/></div><h2 className="line-clamp-2 text-base font-semibold">{item.title}</h2><p className="mt-2 text-xs text-muted-foreground">{item.projectId?`关联项目：${projectNames[item.projectId]??(item.projectId===projectId?projectTitle:"项目已不可用")}`:"独立画布"}</p></div><div className="mt-5 flex items-center gap-4 border-t pt-3 text-xs text-muted-foreground"><span className="inline-flex items-center gap-1"><ImagePlus className="size-3.5"/>{item.document.nodes.filter(node=>node.type==="image"||node.type==="image_generation").length}</span><span className="inline-flex items-center gap-1"><Video className="size-3.5"/>{item.document.nodes.filter(node=>node.type==="video"||node.type==="video_generation").length}</span><span className="ml-auto">{new Date(item.updatedAt).toLocaleDateString("zh-CN")}</span></div></Link>)}</div>}
 </main>;
}
