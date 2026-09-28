"use client";
import {useCallback,useEffect,useState} from "react";
import Link from "next/link";
import {useRouter,useSearchParams} from "next/navigation";
import {client} from "@/lib/contract-client";
import type {CreativeCanvasResource} from "@creatoros/contract";

export function CanvasLibrary(){
 const router=useRouter(),params=useSearchParams();
 const [items,setItems]=useState<CreativeCanvasResource[]>([]),[projectNames,setProjectNames]=useState<Record<string,string>>({}),[loading,setLoading]=useState(true),[error,setError]=useState(""),[creating,setCreating]=useState(false);
 const refresh=useCallback(async()=>{
  setLoading(true);setError("");
  try{
   const response=await client.listCanvases({params:undefined,query:undefined,body:undefined});
   setItems(response as unknown as CreativeCanvasResource[]);
   try{const projects=await client.listProjects({params:undefined,query:{page:1,pageSize:100},body:undefined});setProjectNames(Object.fromEntries((projects as unknown as Array<{id:string;title:string}>).map(project=>[project.id,project.title])));}catch{setProjectNames({});}
  }catch(e){setError(e instanceof Error?e.message:"画布读取失败");}finally{setLoading(false);}
 },[]);
 useEffect(()=>{void refresh();},[refresh]);
 async function create(){
  if(creating)return;setCreating(true);setError("");
  try{const projectId=params.get("projectId");const response=await client.createCanvas({params:undefined,query:undefined,body:{title:"未命名画布",...(projectId?{projectId}:{})}});router.push(`/canvases/${encodeURIComponent(response.id)}`);}catch(e){setError(e instanceof Error?e.message:"创建画布失败");}finally{setCreating(false);}
 }
 return <main className="mx-auto w-full max-w-6xl space-y-6 p-6">
  <header className="flex flex-wrap items-center justify-between gap-4"><div><h1 className="text-2xl font-semibold">创作画布</h1><p className="mt-1 text-sm text-muted-foreground">每个账号独立保存。可以先整理想法，再生成图片或视频。</p></div><button type="button" onClick={()=>void create()} disabled={creating} className="rounded-xl bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50">{creating?"正在创建…":"新建画布"}</button></header>
  {error?<div role="alert" className="rounded-lg border border-destructive p-4 text-sm">{error}<button type="button" onClick={()=>void refresh()} className="ml-3 underline">重试</button></div>:null}
  {loading?<p role="status">正在读取画布…</p>:items.length===0?<div className="rounded-2xl border border-dashed p-12 text-center text-sm text-muted-foreground">当前账号还没有画布。点击“新建画布”开始。</div>:<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{items.map(item=><Link key={item.id} href={`/canvases/${encodeURIComponent(item.id)}`} className="rounded-2xl border bg-card p-5 transition hover:border-primary"><h2 className="font-medium">{item.title}</h2><p className="mt-3 text-sm text-muted-foreground">{item.document.nodes.length} 个节点 · {item.document.edges.length} 条连接</p><p className="mt-2 text-xs text-muted-foreground">{item.projectId?`关联项目：${projectNames[item.projectId]??"项目已不可用"}`:"独立画布"}</p><p className="mt-2 text-xs text-muted-foreground">更新于 {new Date(item.updatedAt).toLocaleString("zh-CN")}</p></Link>)}</div>}
 </main>;
}
