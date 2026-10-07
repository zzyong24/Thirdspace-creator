"use client";
import {useCallback,useEffect,useMemo,useRef,useState} from "react";
import {createCreationWorkspace,useCreationScope,creationScopeKey} from "@/lib/creation-workspace-scope";
import type {AssetPickerSource,MediaChoice,MediaType} from "./asset-picker.types";
export function useAssetPickerSource<T>(source:AssetPickerSource<T>,open:boolean,query:string,type:MediaType|"all",ownerKey:string){
 const scope=useCreationScope(),scopeKey=creationScopeKey(scope),typesKey=source.allowedTypes.join(",");
 const latest=useRef(source);latest.current=source;
 const workspace=useMemo(()=>createCreationWorkspace(scope),[scopeKey,source.key,typesKey,query,type,open,ownerKey]);
 const [page,setPage]=useState<{key:string;items:MediaChoice<T>[];cursor:string|null;loading:boolean;error:string}>({key:"",items:[],cursor:null,loading:false,error:""});
 const key=JSON.stringify([scopeKey,source.key,typesKey,query,type,open,ownerKey]);const flight=useRef<typeof workspace|null>(null),live=useRef(false);const cursor=useRef<string|null>(null);
 const [retry,setRetry]=useState(0);
 const load=useCallback(async(append:boolean)=>{
  if(flight.current===workspace||!live.current)return;flight.current=workspace;
  setPage(previous=>({key,items:append&&previous.key===key?previous.items:[],cursor:append?cursor.current:null,loading:true,error:""}));
  const operation=workspace.capture();
  try{
   const response=await operation.client.searchAssets({params:undefined,body:undefined,query:{query:query.trim(),limit:24,cursor:append?cursor.current:null,assetTypes:type==="all"?typesKey.split(",") as MediaType[]:[type]}});
   operation.assertCurrent();if(!live.current||latest.current.kind!=="library")return;
   const items=response.items.map(latest.current.map);cursor.current=response.nextCursor;
   setPage(previous=>{const existing=append&&previous.key===key?previous.items:[];return {key,items:[...existing,...items.filter(item=>!existing.some(old=>old.choiceKey===item.choiceKey))],cursor:response.nextCursor,loading:false,error:""};});
  }catch(error){if(live.current&&!operation.signal.aborted)setPage(previous=>({...previous,key,loading:false,error:error instanceof Error?error.message:"读取素材失败"}));}
  finally{if(flight.current===workspace)flight.current=null;}
 },[workspace,key,query,type,typesKey]);
 useEffect(()=>{
  if(!open||source.kind!=="library")return;
  live.current=true;flight.current=null;cursor.current=null;workspace.activate();
  const timer=setTimeout(()=>void load(false),200);
  return()=>{live.current=false;clearTimeout(timer);workspace.dispose();};
 },[workspace,open,source.kind,load,retry]);
 const filtered=source.kind==="bounded" ? source.items.filter(item=>{
  // SEMANTIC_BOUNDARY_ALLOW: 只执行用户给出的字面筛选，不判断内容或素材适配。
  return (type==="all"||(item.identity?.assetType??item.assetType)===type)&&(item.identity?.name??item.name??"").toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
 }):page.key===key?page.items:[];
 return {items:filtered,loading:source.kind==="bounded"?Boolean(source.loading):page.key!==key||page.loading,error:source.kind==="bounded"?source.error??"":page.key===key?page.error:"",hasMore:source.kind==="bounded"?Boolean(source.hasMore):page.key===key&&Boolean(page.cursor),loadingMore:source.kind==="bounded"?Boolean(source.loadingMore):page.key===key&&page.loading&&page.items.length>0,loadMore:source.kind==="bounded"?source.onLoadMore:()=>void load(true),retry:source.kind==="bounded"?source.onRetry:()=>setRetry(value=>value+1)};
}
