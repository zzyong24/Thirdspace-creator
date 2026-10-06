import {notFound} from "next/navigation";
import {createServerClient} from "@/lib/contract-client.server";
import {resolveSession} from "@/lib/session.server";
import {MomentsWorkbench} from "@/features/projects/moments-workbench";
export default async function MomentsPage({params}:{params:Promise<{projectId:string;momentsId:string}>}){const session=await resolveSession();if(!session||(!session.ctx.groupId&&!session.ctx.accountId))notFound();const{projectId,momentsId}=await params,scoped=createServerClient({...session.ctx,accountId:session.ctx.groupId?null:(session.ctx.accountId??null)});const initial=await scoped.getMoments({params:{momentsId},query:undefined,body:undefined});if(initial.projectId!==projectId)notFound();return <MomentsWorkbench key={`${session.ctx.groupId??session.ctx.accountId}:${projectId}:${momentsId}`} initial={initial} accountId={session.ctx.groupId?null:(session.ctx.accountId??null)}/>;}
