import { PreviewSamples } from "@/features/preview/preview-samples";
import { hasPreviewSamples } from "@/features/preview/preview-mode.server";
import Link from "next/link";
import {resolveSession} from "@/lib/session.server";
import {createServerClient} from "@/lib/contract-client.server";
import {GroupWorkspaceFilters} from "@/features/group-workspace/group-workspace-filters";
import {GroupOverview} from "@/features/group-workspace/group-overview";
import {workspaceQueryFromSearch} from "@/features/group-workspace/workspace-query";
export default async function Page({searchParams}:{searchParams?:Promise<Record<string,string|string[]|undefined>>}={}){
 const session=await resolveSession();
 if(!session?.ctx.groupId)return <main className="flex flex-col gap-4"><h1 className="text-2xl font-semibold">创作者总览</h1><p className="text-sm text-muted-foreground">选择账号组后，查看多个平台的分发与数据。账号组可以先创建，随后再绑定平台账号。</p><Link href="/accounts" className="text-sm text-brand">创建或选择账号组 →</Link></main>;
 const data=await createServerClient(session.ctx).getGroupWorkspace({body:undefined,params:{groupId:session.ctx.groupId},query:workspaceQueryFromSearch(await searchParams??{})});
 if(hasPreviewSamples(session.ctx.groupId)&&data.workspace.totalAccounts===0)return <main data-page="preview-overview" className="flex min-w-0 flex-col gap-5"><header><h1 className="text-2xl font-semibold">创作者总览</h1></header><PreviewSamples kind="analytics"/><details data-slot="preview-real-data"><summary>查看真实工作区概况与筛选</summary><GroupOverview showPageHeading={false} workspace={data.workspace} filters={<GroupWorkspaceFilters workspace={data.workspace}/>}/></details></main>;
 return <main className="flex min-w-0 flex-col gap-section-gap"><GroupOverview workspace={data.workspace} filters={<GroupWorkspaceFilters workspace={data.workspace}/>}/></main>;
}
