import {NextResponse} from "next/server";
import {readSessionCookie} from "@/app/api/v1/auth/_session";
import {isAuthError,isOwnershipError,readRequestAccountId,resolveRequestContext} from "@/lib/request-context.server";
import {isTrustedLocalRequest,loopbackForbidden} from "@/lib/loopback-guard.server";
import {getWorkbenchArtifactRecoveryRuntime,getWorkbenchPreviewRuntime} from "@/server/persistence-client";

export const dynamic="force-dynamic";
const REF=/^[A-Za-z0-9._:-]{1,160}$/;
const headers={"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"};
const fail=(status:number,error:string)=>NextResponse.json({error},{status,headers});

/** 页面只提交已验证会话 ID；用户、账号和正式版本均由后端重新核实。 */
export async function GET(req:Request):Promise<Response>{
 if(!isTrustedLocalRequest(req))return loopbackForbidden();
 const query=new URL(req.url).searchParams,conversationId=query.get("conversationId")??"",artifactId=query.get("artifactId")??undefined,
  cursor=query.get("cursor")??undefined,rawLimit=query.get("limit"),limit=rawLimit===null?50:Number(rawLimit);
 if(!REF.test(conversationId)||(artifactId&&!REF.test(artifactId))||(cursor&&!REF.test(cursor))||!Number.isSafeInteger(limit)||limit<1||limit>50)
  return fail(400,"产物列表参数无效");
 try{
  const ctx=await resolveRequestContext(readSessionCookie(req),readRequestAccountId(req),{rejectInvalidToken:true});
  if(!ctx.accountId)return fail(404,"会话不存在");
  const runtime=await getWorkbenchPreviewRuntime(),result=await runtime.listConversation(ctx,conversationId,{...(artifactId?{artifactId}:{}),...(cursor?{cursor}:{}),limit});
  return NextResponse.json(result,{headers});
 }catch(error){
  if(isAuthError(error))return fail(401,"未登录");
  if(isOwnershipError(error))return fail(404,"会话不存在");
  return fail(503,"产物版本暂时不可用");
 }
}

/** 用户重核对只唤醒持久占位的原 operationId，不重新执行模型工具。 */
export async function POST(req:Request):Promise<Response>{
 if(!isTrustedLocalRequest(req))return loopbackForbidden();
 let body:unknown;try{body=await req.json();}catch{return fail(400,"产物核对参数无效");}
 const value=body&&typeof body==="object"&&!Array.isArray(body)?body as Record<string,unknown>:{},conversationId=value.conversationId,operationId=value.operationId;
 if(typeof conversationId!=="string"||!REF.test(conversationId)||typeof operationId!=="string"||!REF.test(operationId))return fail(400,"产物核对参数无效");
 try{
  const ctx=await resolveRequestContext(readSessionCookie(req),readRequestAccountId(req),{rejectInvalidToken:true});
  if(!ctx.accountId)return fail(404,"待核对产物不存在");
  const runtime=await getWorkbenchArtifactRecoveryRuntime(),result=await runtime.reconcile(ctx,conversationId,operationId);
  return NextResponse.json(result,{headers});
 }catch(error){
  if(isAuthError(error))return fail(401,"未登录");
  if(isOwnershipError(error))return fail(404,"待核对产物不存在");
  return fail(503,"产物核对暂未完成，请稍后重试");
 }
}
