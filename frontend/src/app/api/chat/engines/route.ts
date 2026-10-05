import {NextResponse} from 'next/server';
import {getChatRuntime} from '@/server/persistence-client';
import {resolveRequestContext,readRequestAccountSelection,isAuthError,isOwnershipError} from '@/lib/request-context.server';
import {readSessionCookie} from '../../v1/auth/_session';
import {isTrustedLocalRequest,loopbackForbidden} from '@/lib/loopback-guard.server';
export const dynamic='force-dynamic';
export async function GET(request:Request){
 if(!isTrustedLocalRequest(request))return loopbackForbidden();
 const account=readRequestAccountSelection(request);
 if(account.mismatch)return NextResponse.json({code:'ACCOUNT_CONTEXT_MISMATCH'},{status:409});
 try{
  const context=await resolveRequestContext(readSessionCookie(request),account.effectiveAccountId,{rejectInvalidToken:true});
  const runtime=await getChatRuntime();
  const codex=runtime.localCodexStatus?await runtime.localCodexStatus(context,request.signal):{engine:'codex',installed:false,available:false,version:null,loginStatus:'unchecked',errorCode:'CODEX_STATUS_UNAVAILABLE'};
  return NextResponse.json({engines:[{engine:'pi',available:true},codex]},{headers:{'Cache-Control':'no-store'}});
 }catch(error){
  return NextResponse.json({code:isAuthError(error)?'UNAUTHORIZED':isOwnershipError(error)?'NOT_FOUND':'CODEX_STATUS_UNAVAILABLE'},{status:isAuthError(error)?401:isOwnershipError(error)?404:503});
 }
}
