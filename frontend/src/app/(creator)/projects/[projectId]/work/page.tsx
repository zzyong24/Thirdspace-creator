import {workCompositionResource} from "@creatoros/contract";
import type {ProjectWorkOutput} from "@/features/projects/project-output-home";
import {notFound} from "next/navigation";
import {createServerClient} from "@/lib/contract-client.server";
import {resolveSession} from "@/lib/session.server";
import {WorkCompositionWorkbench} from "@/features/projects/work-composition-workbench";
export default async function WorkCompositionPage({params,searchParams}:{params:Promise<{projectId:string}>;searchParams:Promise<{compositionId?:string}>}){
 const session=await resolveSession();if(!session?.ctx.accountId)notFound();const{projectId}=await params,scoped=createServerClient(session.ctx);
 const project=await scoped.getProject({params:{projectId},query:undefined,body:undefined});
 const [initial,outputs]=await Promise.all([scoped.listWorkCompositions({params:undefined,query:{projectId,page:1,pageSize:100},body:undefined}),scoped.listOutputs({params:{projectId},query:undefined,body:undefined})]);
 const requested=(await searchParams).compositionId;const parsed=workCompositionResource.array().parse(initial);if(requested&&!parsed.some(item=>item.compositionId===requested)){const actual=workCompositionResource.parse(await scoped.getWorkComposition({params:{compositionId:requested},query:undefined,body:undefined}));if(actual.projectId!==projectId)notFound();parsed.push(actual);}
 return <WorkCompositionWorkbench key={`${session.ctx.accountId}:${projectId}`} projectId={project.id} projectTitle={project.title} accountId={session.ctx.accountId} initial={parsed} initialSelectedId={requested} outputs={outputs as unknown as ProjectWorkOutput[]}/>;
}
