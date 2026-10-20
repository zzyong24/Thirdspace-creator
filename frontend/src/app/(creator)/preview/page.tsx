import Link from "next/link";
import {ArrowUpRight} from "lucide-react";
import {notFound} from "next/navigation";
import {isIsolatedUiPreview} from "@/features/preview/preview-mode.server";
const GROUPS=[
 {name:"创作与资料",pages:[["首页","/"],["创作者总览","/overview"],["定位中心","/positioning"],["内容雷达","/intelligence"],["选题中心","/topics"],["项目列表","/projects"],["知识库","/knowledge"],["经验与关联","/knowledge?view=advanced"],["IP 实战课","/knowledge?view=course"],["素材中心","/assets"],["创作画布","/canvases"],["全局搜索","/search?q=模拟"]]},
 {name:"作品与编辑",pages:[["模拟脚本工作台","/projects/project-e50804d8-1725"],["视频正式稿","/projects/project-e50804d8-1725/outputs/output-e50804d8-1736/video"],["项目作品","/projects/project-e50804d8-1749?view=works"],["作品组合","/projects/project-e50804d8-1749/work"],["文章编辑器","/projects/project-e50804d8-1749/article?outputId=output-e50804d8-1760"],["图文编辑器","/projects/project-e50804d8-1749/outputs/output-e50804d8-1833/image"],["朋友圈编辑器","/projects/project-e50804d8-1749/moments/moments-6d85b94a-58"],["视频编辑器","/projects/project-e50804d8-1725/production?outputId=output-e50804d8-1736"],["项目复盘","/projects/project-e50804d8-1725/review"],["画布编辑器","/canvases/7824be17-0d17-4b0e-a203-729313ab2155"]]},
 {name:"运营与工作区",pages:[["发布中心","/publishing"],["运营分析","/daily-report"],["自动化","/automations"],["账号组","/accounts"],["平台作品","/accounts/works"],["设置","/settings"],["新建项目","/projects/new"],["快速创作","/projects/create"]]},
];
export default function PreviewCatalog(){
 if(!isIsolatedUiPreview())notFound();
 return <main data-page="preview-catalog" className="flex min-w-0 flex-col gap-6"><header><h1 className="text-3xl font-semibold">页面导航</h1></header>{GROUPS.map(group=><section key={group.name} className="rounded-card border border-border bg-surface p-5"><h2 className="mb-4 text-base font-semibold">{group.name}</h2><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{group.pages.map(([name,href])=><Link key={href} href={href!} className="flex min-h-14 items-center justify-between gap-4 rounded-control border border-border px-4 py-3 text-sm transition-colors hover:border-brand hover:bg-brand-soft"><span>{name}</span><ArrowUpRight size={16} aria-hidden="true" className="shrink-0 text-brand"/></Link>)}</div></section>)}</main>;
}
