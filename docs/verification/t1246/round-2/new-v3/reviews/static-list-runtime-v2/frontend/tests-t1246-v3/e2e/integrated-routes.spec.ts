import {test,expect,runJourney,key,widths,type Journey} from './acceptance-support';
test.describe.configure({mode:'default',timeout:72000000});
// 路由库存按真实page来源区分modal与full，不能合并两个/projects/new。
export const routeCases=[
  {
    "routeKey": "route-01",
    "pattern": "/projects/new",
    "source": "frontend/src/app/(creator)/@modal/(.)projects/new/page.tsx",
    "selector": "[role=\"dialog\"]",
    "intercepted": true
  },
  {
    "routeKey": "route-02",
    "pattern": "/accounts",
    "source": "frontend/src/app/(creator)/accounts/page.tsx",
    "selector": "[data-testid=\"account-manager\"]",
    "intercepted": false
  },
  {
    "routeKey": "route-03",
    "pattern": "/accounts/works",
    "source": "frontend/src/app/(creator)/accounts/works/page.tsx",
    "selector": "[data-testid=\"platform-work-catalog\"]",
    "intercepted": false
  },
  {
    "routeKey": "route-04",
    "pattern": "/assets",
    "source": "frontend/src/app/(creator)/assets/page.tsx",
    "selector": "[data-page=\"assets\"]",
    "intercepted": false
  },
  {
    "routeKey": "route-05",
    "pattern": "/automations",
    "source": "frontend/src/app/(creator)/automations/page.tsx",
    "selector": "[data-page=\"automations\"]",
    "intercepted": false
  },
  {
    "routeKey": "route-06",
    "pattern": "/calendar",
    "source": "frontend/src/app/(creator)/calendar/page.tsx",
    "selector": "[data-page=\"publishing-center\"]",
    "intercepted": false
  },
  {
    "routeKey": "route-07",
    "pattern": "/canvases/[canvasId]",
    "source": "frontend/src/app/(creator)/canvases/[canvasId]/page.tsx",
    "selector": "[data-testid=\"infinite-canvas\"]",
    "intercepted": false
  },
  {
    "routeKey": "route-08",
    "pattern": "/canvases",
    "source": "frontend/src/app/(creator)/canvases/page.tsx",
    "selector": "h1",
    "intercepted": false
  },
  {
    "routeKey": "route-09",
    "pattern": "/daily-report",
    "source": "frontend/src/app/(creator)/daily-report/page.tsx",
    "selector": "[data-page=\"daily-report\"]",
    "intercepted": false
  },
  {
    "routeKey": "route-10",
    "pattern": "/experience",
    "source": "frontend/src/app/(creator)/experience/page.tsx",
    "selector": "[data-page=\"knowledge-library\"]",
    "intercepted": false
  },
  {
    "routeKey": "route-11",
    "pattern": "/intelligence",
    "source": "frontend/src/app/(creator)/intelligence/page.tsx",
    "selector": "[data-testid=\"intelligence-workbench\"]",
    "intercepted": false
  },
  {
    "routeKey": "route-12",
    "pattern": "/knowledge",
    "source": "frontend/src/app/(creator)/knowledge/page.tsx",
    "selector": "[data-page=\"knowledge-library\"]",
    "intercepted": false
  },
  {
    "routeKey": "route-13",
    "pattern": "/overview",
    "source": "frontend/src/app/(creator)/overview/page.tsx",
    "selector": "[data-page=\"group-overview\"]",
    "intercepted": false
  },
  {
    "routeKey": "route-14",
    "pattern": "/",
    "source": "frontend/src/app/(creator)/page.tsx",
    "selector": "[data-page=\"dashboard\"]",
    "intercepted": false
  },
  {
    "routeKey": "route-15",
    "pattern": "/positioning",
    "source": "frontend/src/app/(creator)/positioning/page.tsx",
    "selector": "[data-testid=\"positioning-center\"]",
    "intercepted": false
  },
  {
    "routeKey": "route-16",
    "pattern": "/projects/[projectId]/article",
    "source": "frontend/src/app/(creator)/projects/[projectId]/article/page.tsx",
    "selector": "[data-page=\"article-workbench\"]",
    "intercepted": false
  },
  {
    "routeKey": "route-17",
    "pattern": "/projects/[projectId]/image",
    "source": "frontend/src/app/(creator)/projects/[projectId]/image/page.tsx",
    "selector": "[data-page=\"graphic-post-workbench\"]",
    "intercepted": false
  },
  {
    "routeKey": "route-18",
    "pattern": "/projects/[projectId]/moments/[momentsId]",
    "source": "frontend/src/app/(creator)/projects/[projectId]/moments/[momentsId]/page.tsx",
    "selector": "[data-page=\"moments-workbench\"]",
    "intercepted": false
  },
  {
    "routeKey": "route-19",
    "pattern": "/projects/[projectId]/outputs/[outputId]/image",
    "source": "frontend/src/app/(creator)/projects/[projectId]/outputs/[outputId]/image/page.tsx",
    "selector": "[data-page=\"graphic-post-workbench\"]",
    "intercepted": false
  },
  {
    "routeKey": "route-20",
    "pattern": "/projects/[projectId]/outputs/[outputId]/video",
    "source": "frontend/src/app/(creator)/projects/[projectId]/outputs/[outputId]/video/page.tsx",
    "selector": "[data-page=\"video-output-workbench\"]",
    "intercepted": false
  },
  {
    "routeKey": "route-21",
    "pattern": "/projects/[projectId]",
    "source": "frontend/src/app/(creator)/projects/[projectId]/page.tsx",
    "selector": "[data-page=\"draft-workbench\"]",
    "intercepted": false
  },
  {
    "routeKey": "route-22",
    "pattern": "/projects/[projectId]/planning",
    "source": "frontend/src/app/(creator)/projects/[projectId]/planning/page.tsx",
    "selector": "[data-page=\"draft-workbench\"]",
    "intercepted": false
  },
  {
    "routeKey": "route-23",
    "pattern": "/projects/[projectId]/production",
    "source": "frontend/src/app/(creator)/projects/[projectId]/production/page.tsx",
    "selector": "[aria-label=\"视频剪辑工作台\"]",
    "intercepted": false
  },
  {
    "routeKey": "route-24",
    "pattern": "/projects/[projectId]/publishing",
    "source": "frontend/src/app/(creator)/projects/[projectId]/publishing/page.tsx",
    "selector": "[data-page=\"draft-workbench\"]",
    "intercepted": false
  },
  {
    "routeKey": "route-25",
    "pattern": "/projects/[projectId]/research",
    "source": "frontend/src/app/(creator)/projects/[projectId]/research/page.tsx",
    "selector": "[data-page=\"draft-workbench\"]",
    "intercepted": false
  },
  {
    "routeKey": "route-26",
    "pattern": "/projects/[projectId]/review",
    "source": "frontend/src/app/(creator)/projects/[projectId]/review/page.tsx",
    "selector": "[data-page=\"analytics-review\"]",
    "intercepted": false
  },
  {
    "routeKey": "route-27",
    "pattern": "/projects/[projectId]/script",
    "source": "frontend/src/app/(creator)/projects/[projectId]/script/page.tsx",
    "selector": "[data-page=\"draft-workbench\"]",
    "intercepted": false
  },
  {
    "routeKey": "route-28",
    "pattern": "/projects/[projectId]/work",
    "source": "frontend/src/app/(creator)/projects/[projectId]/work/page.tsx",
    "selector": "[data-page=\"work-composition\"]",
    "intercepted": false
  },
  {
    "routeKey": "route-29",
    "pattern": "/projects/create",
    "source": "frontend/src/app/(creator)/projects/create/page.tsx",
    "selector": "[data-page=\"quick-create-work\"]",
    "intercepted": false
  },
  {
    "routeKey": "route-30",
    "pattern": "/projects/new",
    "source": "frontend/src/app/(creator)/projects/new/page.tsx",
    "selector": "[role=\"dialog\"]",
    "intercepted": false
  },
  {
    "routeKey": "route-31",
    "pattern": "/projects",
    "source": "frontend/src/app/(creator)/projects/page.tsx",
    "selector": "[data-page=\"projects\"]",
    "intercepted": false
  },
  {
    "routeKey": "route-32",
    "pattern": "/publishing",
    "source": "frontend/src/app/(creator)/publishing/page.tsx",
    "selector": "[data-page=\"publishing-center\"]",
    "intercepted": false
  },
  {
    "routeKey": "route-33",
    "pattern": "/search",
    "source": "frontend/src/app/(creator)/search/page.tsx",
    "selector": "[data-page=\"search\"]",
    "intercepted": false
  },
  {
    "routeKey": "route-34",
    "pattern": "/settings",
    "source": "frontend/src/app/(creator)/settings/page.tsx",
    "selector": "[data-slot=\"settings-dialog\"]",
    "intercepted": false
  },
  {
    "routeKey": "route-35",
    "pattern": "/topics",
    "source": "frontend/src/app/(creator)/topics/page.tsx",
    "selector": "[data-testid=\"topics\"]",
    "intercepted": false
  },
  {
    "routeKey": "route-36",
    "pattern": "/activate",
    "source": "frontend/src/app/activate/page.tsx",
    "selector": "[data-page=\"dashboard\"]",
    "intercepted": false
  },
  {
    "routeKey": "route-37",
    "pattern": "/login",
    "source": "frontend/src/app/login/page.tsx",
    "selector": "[data-page=\"dashboard\"]",
    "intercepted": false
  },
  {
    "routeKey": "route-38",
    "pattern": "/register",
    "source": "frontend/src/app/register/page.tsx",
    "selector": "[data-page=\"dashboard\"]",
    "intercepted": false
  }
] as const;
async function prepare(j:Journey,route:typeof routeCases[number]){
 let href:string=route.pattern,read:any={operation:'projects.get',params:{projectId:j.project.id},expectedId:j.project.id};
 if(route.pattern.includes('[canvasId]')){const c=await j.op('canvas.create',{body:{title:'原ID验收画布',projectId:j.project.id}});href=href.replace('[canvasId]',c.id);read={operation:'canvas.get',params:{canvasId:c.id},expectedId:c.id};}
 if(route.pattern.includes('/article')){const o=await j.op('projects.outputs.create',{params:{projectId:j.project.id},body:{title:'原ID验收文章',contentType:'article',clientRequestId:key()}});href+='?outputId='+o.id;read={operation:'outputs.get',params:{outputId:o.id},expectedId:o.id};}
 if(route.pattern.includes('/image')){const o=await j.op('graphicPosts.outputs.create',{params:{projectId:j.project.id},body:{title:'原ID验收图文',targetPlatform:'xiaohongshu',clientRequestId:key()}});href=href.replace('[outputId]',o.id);read={operation:'graphicPosts.get',params:{outputId:o.id},expectedId:o.id};}
 if(route.pattern.includes('[momentsId]')){const m=(await j.op('moments.create',{body:{projectId:j.project.id,clientRequestId:key(),document:{schemaVersion:1,text:'用户明确输入的测试朋友圈',imageUses:[],sourceRefs:[]}}})).moments;href=href.replace('[momentsId]',m.momentsId);read={operation:'moments.get',params:{momentsId:m.momentsId},expectedId:m.momentsId};}
 if(route.pattern.endsWith('/work')){const c=(await j.op('workCompositions.create',{body:{projectId:j.project.id,title:'原ID组合稿',clientRequestId:key()}})).composition;href+='?compositionId='+c.compositionId;read={operation:'workCompositions.get',params:{compositionId:c.compositionId},expectedId:c.compositionId};}
 if(route.pattern.endsWith('/production')){href+='?outputId='+j.output.id;read={operation:'outputs.get',params:{outputId:j.output.id},expectedId:j.output.id};}
 href=href.replace('[projectId]',j.project.id).replace('[outputId]',j.output.id);
 if(['/accounts/works','/daily-report'].includes(route.pattern)||route.pattern.endsWith('/review')){const a=await j.op('accounts.create',{body:{platform:'douyin',accountHandle:'用户明确登记的未登录验收账号-'+key(),idempotencyKey:key()}});await j.useAccount(a.id);href+=(href.includes('?')?'&':'?')+'accountId='+a.id;read={operation:'accounts.get',params:{accountId:a.id},expectedId:a.id};}
 return {href,read};
}
async function visibleRoute(j:Journey,route:typeof routeCases[number],href:string){
 if(route.intercepted){await j.page.goto('/');await j.page.locator('a[href="/projects/new"]:visible').first().click();}else{const response=await j.page.goto(href);expect(response?.status()).toBe(200);}
 await expect(j.page.getByTestId('app-shell')).toBeVisible();await expect(j.page.locator(route.selector).filter({visible:true}).first()).toBeVisible();
 if(route.pattern==='/canvases')await expect(j.page.getByRole('heading',{name:'创作空间',exact:true})).toBeVisible();
 const u=new URL(j.page.url());const redirect={calendar:'/publishing',experience:'/knowledge',activate:'/',login:'/',register:'/'} as Record<string,string>;
 const redirected=redirect[route.pattern.slice(1)];if(redirected)expect(u.pathname).toBe(redirected);
 else if(route.pattern.endsWith('/planning')||route.pattern.endsWith('/research')||route.pattern.endsWith('/script')||route.pattern.endsWith('/publishing')){expect(u.pathname).toBe('/projects/'+j.project.id);expect(u.hash).toBe(route.pattern.endsWith('/script')?'#script':route.pattern.endsWith('/publishing')?'#publish':'#topic');}
 else if(route.pattern.includes('[projectId]'))expect(u.pathname).toContain('/projects/'+j.project.id);
 else expect(u.pathname).toBe(new URL(href,j.page.url()).pathname);
 expect(await j.page.locator('body').innerText()).not.toMatch(/Application error|Internal Server Error|暂时无法读取账号/);
 expect(await j.page.evaluate(()=>document.body.scrollWidth<=innerWidth+2)).toBe(true);
}
for(const route of routeCases)test(`INT-ROUTES / ${route.routeKey} / ${route.pattern}：真实对象、宽窄、刷新`,async({page},info)=>runJourney(page,info,'INT-ROUTES',null,'真实页面公共read＋浏览器；无模型/App/平台登录',async j=>{
 const {href,read}=await prepare(j,route);
 for(const v of widths){await page.setViewportSize(v);await visibleRoute(j,route,href);await j.shot(`${route.routeKey}-${v.width}-ready`);await page.reload();await expect(page.locator(route.selector).filter({visible:true}).first()).toBeVisible();await j.shot(`${route.routeKey}-${v.width}-reload`);}
 const object=await j.op(read.operation,{params:read.params});const actual=object.id??object.outputId??object.momentsId??object.compositionId??object.composition?.compositionId;expect(actual).toBe(read.expectedId);j.receipts.push({id:'same-route-object-readback',routeKey:route.routeKey,pageSource:route.source,href,read,actualId:actual,notGeneration:true});
}));
