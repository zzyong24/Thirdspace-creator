"use client";

import type {WorkbenchArtifact} from "@creatoros/contract/agent-workbench";
import {isDesktopRuntimeClient} from "@/lib/desktop-updater";

const MAX_BYTES=20*1024*1024;

/** 用户点击导出时再下载后端已登记版本，并在本机复核字节，才交给原生保存面板。 */
export async function exportWorkbenchArtifact(rawUrl:string,artifact:WorkbenchArtifact):Promise<"saved"|"cancelled">{
 if(!isDesktopRuntimeClient())throw new Error("请在桌面版中导出产物");
 const url=new URL(rawUrl,window.location.href);
 if(url.origin!==window.location.origin)throw new Error("产物下载地址无效");
 if(artifact.size<1||artifact.size>MAX_BYTES||!/^[a-f0-9]{64}$/.test(artifact.hash))throw new Error("产物元数据无效");
 const response=await fetch(url,{credentials:"same-origin",cache:"no-store"});
 if(!response.ok)throw new Error("产物读取失败，请重试");
 const mime=response.headers.get("content-type")?.split(";",1)[0]?.trim().toLowerCase();
 if(mime!==artifact.mime)throw new Error("产物类型与登记记录不一致");
 const body=await response.arrayBuffer();
 if(body.byteLength!==artifact.size)throw new Error("产物大小与登记记录不一致");
 const actual=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",body)),b=>b.toString(16).padStart(2,"0")).join("");
 if(actual!==artifact.hash)throw new Error("产物内容校验失败，请重试");
 const bytes=new Uint8Array(body);
 const pieces:string[]=[];
 for(let offset=0;offset<bytes.byteLength;offset+=0x8000)
  pieces.push(String.fromCharCode(...bytes.subarray(offset,offset+0x8000)));
 const bytesBase64=btoa(pieces.join(""));
 const suggestedName=artifact.relativePath.split("/").at(-1);
 if(!suggestedName)throw new Error("产物文件名无效");
 const {invoke}=await import("@tauri-apps/api/core");
 const result=await invoke<"saved"|"cancelled">("export_workbench_artifact",{bytesBase64,mime:artifact.mime,suggestedName});
 if(result!=="saved"&&result!=="cancelled")throw new Error("导出回执无效，请核对目标文件");
 return result;
}
