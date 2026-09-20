"use client";

import type {WorkbenchArtifact} from "@creatoros/contract/agent-workbench";
import {isDesktopRuntimeClient} from "@/lib/desktop-updater";
import {handshakeHeaders} from "@/lib/handshake-client";

const MAX_BYTES=20*1024*1024;
let nativeSaveInFlight=false;

async function readBoundedBody(response:Response,maxBytes:number,signal?:AbortSignal):Promise<Uint8Array>{
 const reader=response.body?.getReader();
 if(!reader)throw new Error("产物响应没有文件字节");
 const chunks:Uint8Array[]=[];let size=0;
 try{
  for(;;){
   signal?.throwIfAborted();
   const {done,value}=await reader.read();
   if(done)break;
   size+=value.byteLength;
   if(size>maxBytes)throw new Error("产物响应超过声明大小");
   chunks.push(value);
  }
 }catch(error){await reader.cancel().catch(()=>{});throw error;}
 finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;
 for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
 return bytes;
}

/** 用户点击导出时再下载后端已登记版本，并在本机复核字节，才交给原生保存面板。 */
export async function exportWorkbenchArtifact(rawUrl:string,artifact:WorkbenchArtifact,accountId:string,signal?:AbortSignal):Promise<"saved"|"cancelled">{
 if(!isDesktopRuntimeClient())throw new Error("请在桌面版中导出产物");
 const url=new URL(rawUrl,window.location.href);
 const expectedPath=`/api/v1/workbench-preview/${encodeURIComponent(artifact.taskId)}/${encodeURIComponent(artifact.artifactId)}/${artifact.version}`;
 const formats=url.searchParams.getAll("format");
 const format=formats.length===1?formats[0]:"";
 if(url.origin!==window.location.origin||url.pathname!==expectedPath||url.hash||
    [...url.searchParams.keys()].some(key=>key!=="format")||!["raw","png","pdf"].includes(format))
  throw new Error("产物下载地址无效");
 if(format!=="raw"&&artifact.mime!=="text/html")throw new Error("仅 HTML 产物支持 PNG/PDF 导出");
 if(!accountId||accountId.length>160)throw new Error("当前账号无效");
 if(artifact.size<1||artifact.size>MAX_BYTES||!/^[a-f0-9]{64}$/.test(artifact.hash))throw new Error("产物元数据无效");
 const expectedMime=format==="png"?"image/png":format==="pdf"?"application/pdf":artifact.mime;
 const response=await fetch(url,{credentials:"same-origin",cache:"no-store",signal,
  headers:{...handshakeHeaders(),"x-account-id":accountId}});
 if(!response.ok)throw new Error("产物读取失败，请重试");
 const mime=response.headers.get("content-type")?.split(";",1)[0]?.trim().toLowerCase();
 if(mime!==expectedMime)throw new Error("产物类型与导出格式不一致");
 const derived=format!=="raw";
 const expectedHash=derived?response.headers.get("x-workbench-hash"):artifact.hash;
 const expectedSize=derived?Number(response.headers.get("x-workbench-size")):artifact.size;
 if(derived&&response.headers.get("x-workbench-source-hash")!==artifact.hash)
  throw new Error("导出来源与登记版本不一致");
 if(!expectedHash||!/^[a-f0-9]{64}$/.test(expectedHash)||!Number.isSafeInteger(expectedSize)||expectedSize<1||expectedSize>MAX_BYTES||
    response.headers.get("x-workbench-hash")!==expectedHash||response.headers.get("x-workbench-size")!==String(expectedSize))
  throw new Error("产物版本与登记记录不一致");
 const bytes=await readBoundedBody(response,expectedSize,signal);
 if(bytes.byteLength!==expectedSize)throw new Error("产物大小与登记记录不一致");
 const actual=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",Uint8Array.from(bytes))),b=>b.toString(16).padStart(2,"0")).join("");
 if(actual!==expectedHash)throw new Error("产物内容校验失败，请重试");
 if(format==="png"&&!bytes.subarray(0,8).every((byte,index)=>byte===[137,80,78,71,13,10,26,10][index]))
  throw new Error("PNG 导出字节无效");
 if(format==="pdf"&&new TextDecoder().decode(bytes.subarray(0,5))!=="%PDF-")
  throw new Error("PDF 导出字节无效");
 signal?.throwIfAborted();
 const pieces:string[]=[];
 for(let offset=0;offset<bytes.byteLength;offset+=0x8000)
  pieces.push(String.fromCharCode(...bytes.subarray(offset,offset+0x8000)));
 const bytesBase64=btoa(pieces.join(""));
 const encodedName=response.headers.get("x-workbench-filename");
 if(!encodedName)throw new Error("产物文件名缺失");
 const suggestedName=decodeURIComponent(encodedName);
 const extension=format==="raw"?undefined:`.${format}`;
 if(!suggestedName||suggestedName.includes("/")||suggestedName.includes("\\")||
    (extension&&!suggestedName.toLowerCase().endsWith(extension)))throw new Error("产物文件名无效");
 const {invoke}=await import("@tauri-apps/api/core");
 signal?.throwIfAborted();
 if(nativeSaveInFlight)throw new Error("已有保存面板打开，请先完成或取消");
 nativeSaveInFlight=true;
 let result:"saved"|"cancelled";
 try{result=await invoke<"saved"|"cancelled">("export_workbench_artifact",{bytesBase64,mime:expectedMime,suggestedName});}
 finally{nativeSaveInFlight=false;}
 if(result!=="saved"&&result!=="cancelled")throw new Error("导出回执无效，请核对目标文件");
 return result;
}
