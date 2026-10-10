import { NextResponse } from "next/server";
import { installCodexConnection } from "@/server/external-agent-codex-config";
import { getExternalAgentConnectionService } from "@/server/persistence-client";
import { readSessionCookie } from "../../../../auth/_session";
import { resolveRequestContext } from "@/lib/request-context.server";
import { isTrustedLocalRequest, loopbackForbidden } from "@/lib/loopback-guard.server";

export async function POST(req:Request,{params}:{params:Promise<{id:string}>}):Promise<Response>{
  if(!isTrustedLocalRequest(req))return loopbackForbidden();
  let ctx;try{ctx=await resolveRequestContext(readSessionCookie(req),null,{rejectInvalidToken:true});}catch{return NextResponse.json({code:"AUTH_REQUIRED"},{status:401});}
  const {id}=await params;
  const row=(await (await getExternalAgentConnectionService()).list(ctx)).find(item=>item.id===id);
  if(!row||row.revokedAt||row.clientKind!=="codex")return NextResponse.json({code:"PAIRING_NOT_FOUND"},{status:404});
  try{await installCodexConnection(id);return NextResponse.json({connectionId:id,installed:true});}
  catch(error){return NextResponse.json({code:"CODEX_CONFIG_FAILED",message:error instanceof Error?error.message:"无法配置 Codex"},{status:409});}
}
