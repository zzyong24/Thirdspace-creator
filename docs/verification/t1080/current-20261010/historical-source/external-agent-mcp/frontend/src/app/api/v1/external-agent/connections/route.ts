import { randomBytes, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { externalAgentCredentialHash, grantableExternalAgentOperation, EXTERNAL_AGENT_ACCOUNT_READ, EXTERNAL_AGENT_PROJECT_READ, EXTERNAL_AGENT_CANDIDATE_OPERATIONS } from "@creatoros/backend";
import { getExternalAgentConnectionService } from "@/server/persistence-client";
import { writePairedCredential } from "@/server/external-agent-pairing-files";
import { readSessionCookie } from "../../auth/_session";
import { resolveRequestContext } from "@/lib/request-context.server";
import { isTrustedLocalRequest, loopbackForbidden } from "@/lib/loopback-guard.server";

export const dynamic="force-dynamic";
const headers={"Cache-Control":"private, no-store, max-age=0"};
const reply=(body:unknown,status=200)=>NextResponse.json(body,{status,headers});
const publicRow=(row:{id:string;clientKind:string;accountId:string;projectId:string|null;allowedOps:string[];revision:string;revokedAt:string|null;credentialExpiresAt:string;lastInvocationAt:string|null})=>({connectionId:row.id,clientKind:row.clientKind,accountId:row.accountId,projectId:row.projectId,allowedOps:row.allowedOps,revision:row.revision,status:row.revokedAt?"revoked":Date.parse(row.credentialExpiresAt)<=Date.now()?"credential_expired":"active",lastInvocationAt:row.lastInvocationAt});

export async function GET(req:Request):Promise<Response>{
  if(!isTrustedLocalRequest(req))return loopbackForbidden();
  try{
    const ctx=await resolveRequestContext(readSessionCookie(req),null,{rejectInvalidToken:true});
    const rows=await (await getExternalAgentConnectionService()).list(ctx);
    return reply({connections:rows.map(publicRow),grantableOperations:{accountRead:EXTERNAL_AGENT_ACCOUNT_READ,projectRead:EXTERNAL_AGENT_PROJECT_READ,candidate:EXTERNAL_AGENT_CANDIDATE_OPERATIONS}});
  }catch{return reply({code:"AUTH_REQUIRED"},401);}
}

export async function POST(req:Request):Promise<Response>{
  if(!isTrustedLocalRequest(req))return loopbackForbidden();
  let body:unknown;try{body=await req.json();}catch{return reply({code:"INVALID_JSON"},400);}
  if(!body||typeof body!=="object"||Array.isArray(body))return reply({code:"INVALID_INPUT"},400);
  const input=body as Record<string,unknown>;
  const accountId=typeof input.accountId==="string"?input.accountId:"";
  const projectId=typeof input.projectId==="string"&&input.projectId?input.projectId:null;
  const kind=typeof input.clientKind==="string"?input.clientKind:"";
  const ops=Array.isArray(input.allowedOps)&&input.allowedOps.every(x=>typeof x==="string")?input.allowedOps as string[]:[];
  const idempotencyKey=typeof input.idempotencyKey==="string"?input.idempotencyKey:"";
  if(!accountId||!idempotencyKey||!ops.length||!ops.every(op=>grantableExternalAgentOperation(op,Boolean(projectId))))return reply({code:"OP_NOT_GRANTABLE"},422);
  let ctx;try{ctx=await resolveRequestContext(readSessionCookie(req),accountId,{rejectInvalidToken:true});}catch{return reply({code:"ACCOUNT_NOT_OWNED"},404);}
  const id=`pair-${randomUUID()}`;
  const token=randomBytes(32).toString("base64url");
  const expiresAt=new Date(Date.now()+12*60*60*1000).toISOString();
  const service=await getExternalAgentConnectionService();
  let row,created;
  try{({row,created}=await service.create(ctx,{id,idempotencyKey,clientKind:kind,accountId,projectId,allowedOps:ops,credentialHash:externalAgentCredentialHash(token),credentialExpiresAt:expiresAt}));}
  catch(error){return reply({code:(error as {code?:string}).code||"PAIRING_CREATE_FAILED"},409);}
  if(created){
    try{await writePairedCredential({id,revision:row.revision,token,expiresAt});}
    catch{await service.revoke(ctx,id,row.revision).catch(()=>{});return reply({code:"CONFIG_WRITE_FAILED"},500);}
  }
  return reply({connection:publicRow(row),command:"creatoros",args:["mcp","serve","--paired",row.id],credentialStored:true},created?201:200);
}
