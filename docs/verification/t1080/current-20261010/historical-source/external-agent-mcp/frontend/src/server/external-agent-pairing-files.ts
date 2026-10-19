import "server-only";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { homedir, platform } from "node:os";

function connectionDirectory(): string {
  const runtime = process.env.CREATOROS_CLI_ACCESS_FILE;
  if (runtime) return dirname(runtime);
  const product = (process.env.CREATOROS_PRODUCT_ID || "creatoros").replace(/[^a-zA-Z0-9._-]/g,"-");
  if (platform()==="darwin") return join(homedir(),"Library","Application Support","CreatorOS",product,"cli");
  if (platform()==="win32") {
    if (!process.env.LOCALAPPDATA) throw Error("PAIRING_STORAGE_UNAVAILABLE");
    return join(process.env.LOCALAPPDATA,"CreatorOS",product,"cli");
  }
  return join(process.env.XDG_RUNTIME_DIR || join(homedir(),".local","state"),"creatoros",product,"cli");
}

function pathFor(id:string):string {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(id)) throw Error("INVALID_CONNECTION_ID");
  return join(connectionDirectory(),"paired",`${id}.json`);
}

export async function writePairedCredential(input:{id:string;revision:string;token:string;expiresAt:string}):Promise<string> {
  const path=pathFor(input.id);
  await mkdir(dirname(path),{recursive:true,mode:0o700});
  const temporary=`${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary,JSON.stringify({schema:"creatoros-paired-credential/v1",...input}),{mode:0o600,flag:"wx"});
    await rename(temporary,path);
  } catch(error) { await rm(temporary,{force:true}).catch(()=>{});throw error; }
  return path;
}

export async function readPairedCredential(id:string):Promise<{id:string;revision:string;token:string;expiresAt:string}|null> {
  const raw=await readFile(pathFor(id),"utf8").catch(()=>null);
  if(!raw)return null;
  try {const parsed=JSON.parse(raw);return parsed.schema==="creatoros-paired-credential/v1" && parsed.id===id ? parsed:null;}catch{return null;}
}

export async function deletePairedCredential(id:string):Promise<void> {await rm(pathFor(id),{force:true});}
