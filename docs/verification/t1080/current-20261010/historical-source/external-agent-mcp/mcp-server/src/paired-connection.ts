import { readFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { platform } from "node:os";
import { defaultConnectionFile } from "./connection";

export interface PairedConnection {id:string;revision:string;token:string;baseUrl:string;expiresAt:string}

export async function discoverPairedConnection(id:string):Promise<PairedConnection>{
  if(!/^pair-[a-z0-9-]{36}$/.test(id))throw Error("INVALID_CONNECTION_ID");
  // 与 CreatorOS 安装目录一致；--paired 不接受任意 credential 路径。
  const root=dirname(defaultConnectionFile());
  const path=join(root,"paired",`${id}.json`);
  const info=await stat(path).catch(()=>null);
  if(!info?.isFile() || (platform()!=="win32" && (info.mode & 0o077)!==0))throw Error("CREDENTIAL_UNAVAILABLE");
  let pair:unknown,descriptor:unknown;
  try{pair=JSON.parse(await readFile(path,"utf8"));descriptor=JSON.parse(await readFile(join(root,"connection.json"),"utf8"));}
  catch{throw Error("CREDENTIAL_UNAVAILABLE");}
  const p=pair as Record<string,unknown>,d=descriptor as Record<string,unknown>;
  if(p.schema!=="creatoros-paired-credential/v1" || p.id!==id || typeof p.revision!=="string" || typeof p.token!=="string" || typeof p.expiresAt!=="string")throw Error("CREDENTIAL_UNAVAILABLE");
  if(Date.parse(p.expiresAt)<=Date.now())throw Error("CREDENTIAL_EXPIRED");
  if(d.schema!=="creatoros-cli-connection/v1" || !Number.isInteger(d.port) || Number(d.port)<1 || Number(d.port)>65535 || !Number.isInteger(d.pid))throw Error("CREDENTIAL_UNAVAILABLE");
  try{process.kill(Number(d.pid),0);}catch{throw Error("CONNECTION_STALE");}
  return {id,revision:p.revision,token:p.token,expiresAt:p.expiresAt,baseUrl:`http://127.0.0.1:${d.port}`};
}
