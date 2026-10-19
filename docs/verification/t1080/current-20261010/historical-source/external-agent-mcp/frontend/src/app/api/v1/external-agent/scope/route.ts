import { NextResponse } from "next/server";
import { getExternalAgentConnectionService } from "@/server/persistence-client";
import { isPairedLocalRequest, isTrustedLocalRequest, loopbackForbidden } from "@/lib/loopback-guard.server";

export const dynamic="force-dynamic";
export async function GET(req:Request):Promise<Response>{
  if(!isTrustedLocalRequest(req) && !isPairedLocalRequest(req,"/api/v1/external-agent/scope"))return loopbackForbidden();
  const id=req.headers.get("x-creatoros-paired-id")||"";
  const revision=req.headers.get("x-creatoros-paired-revision")||"";
  const token=req.headers.get("x-creatoros-paired-token")||"";
  if(!id||!revision||!token)return NextResponse.json({code:"CREDENTIAL_UNAVAILABLE"},{status:403});
  try{
    const scope=await (await getExternalAgentConnectionService()).describe({id,revision,token});
    return NextResponse.json({connectionId:scope.clientId,accountId:scope.accountId,projectId:scope.projectId,allowedOps:scope.allowedOps,revision:scope.revision},{headers:{"Cache-Control":"private, no-store, max-age=0"}});
  }catch(error){return NextResponse.json({code:(error as {code?:string}).code||"PAIRING_DENIED"},{status:403});}
}
