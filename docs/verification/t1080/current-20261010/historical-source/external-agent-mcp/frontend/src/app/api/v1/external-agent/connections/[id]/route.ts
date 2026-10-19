import { NextResponse } from "next/server";
import { getExternalAgentConnectionService } from "@/server/persistence-client";
import { deletePairedCredential } from "@/server/external-agent-pairing-files";
import { removeCodexConnection } from "@/server/external-agent-codex-config";
import { readSessionCookie } from "../../../auth/_session";
import { resolveRequestContext } from "@/lib/request-context.server";
import { isTrustedLocalRequest, loopbackForbidden } from "@/lib/loopback-guard.server";

export const dynamic="force-dynamic";
export async function DELETE(req:Request,{params}:{params:Promise<{id:string}>}):Promise<Response>{
  if(!isTrustedLocalRequest(req))return loopbackForbidden();
  let input:unknown;try{input=await req.json();}catch{return NextResponse.json({code:"INVALID_JSON"},{status:400});}
  const revision=input&&typeof input==="object"&&!Array.isArray(input)?(input as {expectedRevision?:unknown}).expectedRevision:null;
  if(typeof revision!=="string")return NextResponse.json({code:"REVISION_REQUIRED"},{status:400});
  let ctx;try{ctx=await resolveRequestContext(readSessionCookie(req),null,{rejectInvalidToken:true});}catch{return NextResponse.json({code:"AUTH_REQUIRED"},{status:401});}
  const {id}=await params;
  try{
    const row=await (await getExternalAgentConnectionService()).revoke(ctx,id,revision);
    const secretRemoved=await deletePairedCredential(id).then(()=>true,()=>false);
    const codexRemoved=row.clientKind==="codex"?await removeCodexConnection(id).then(()=>true,()=>false):true;
    const configRemoved=secretRemoved&&codexRemoved;
    return NextResponse.json({connectionId:id,revision:row.revision,revokedAt:row.revokedAt,configRemoved},{headers:{"Cache-Control":"private, no-store, max-age=0"}});
  }catch(error){return NextResponse.json({code:(error as {code?:string}).code||"PAIRING_REVOKE_FAILED"},{status:409});}
}
