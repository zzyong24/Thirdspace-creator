import { Component, Suspense, use, useLayoutEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { usePrimaryNavigation } from "./use-primary-navigation";
import PageLoading from "@/app/(creator)/loading";
import { Sidebar } from "./sidebar";

const router = vi.hoisted(() => ({push:vi.fn(),refresh:vi.fn(),signal:null as {pathname:string;search:string}|null}));
const subscribeRoute=(notify:()=>void)=>{window.addEventListener("test:route-commit",notify);return()=>window.removeEventListener("test:route-commit",notify);};
vi.mock("next/navigation",()=>({
 useRouter:()=>router,
 usePathname:()=>useSyncExternalStore(subscribeRoute,()=>router.signal?.pathname??window.location.pathname),
 useSearchParams:()=>new URLSearchParams(useSyncExternalStore(subscribeRoute,()=>router.signal?.search??window.location.search)),
}));
vi.mock("./account-switcher",()=>({AccountSwitcher:()=>null}));
vi.mock("./sidebar-storage-card",()=>({SidebarStorageCard:()=>null}));
vi.mock("./issue-feedback-dialog",()=>({IssueFeedbackDialog:()=>null}));
vi.mock("next/link",()=>({default:({href,children,onNavigate,prefetch,...props}:{href:string;children:ReactNode;onNavigate?:(event:{preventDefault():void})=>void;prefetch?:boolean})=><a {...props} href={href} data-prefetch={String(prefetch)} onClick={event=>{event.preventDefault();onNavigate?.(event);}}>{children}</a>}));
function deferred() { let resolve!:()=>void;let reject!:(error:Error)=>void;const promise=new Promise<void>((r,j)=>{resolve=r;reject=j});return {promise,resolve,reject}; }
class RouteBoundary extends Component<{children:ReactNode},{failed:boolean}> {
 state={failed:false}; static getDerivedStateFromError(){return {failed:true}};
 render(){return this.state.failed?<p>页面加载失败</p>:this.props.children}
}
function Content({pending,href}:{pending:Promise<void>|null;href?:string}) {
 if(pending)use(pending);
 // 模拟Next成功内容提交时的真实URL更新；push返回void本身不提交地址。
 useLayoutEffect(()=>{if(href){window.history.replaceState(null,'',href);window.dispatchEvent(new Event("test:route-commit"));}},[href]);
 return <p>页面内容</p>;
}
function Harness({gates}:{gates:Map<string,Promise<void>>}) {
  const [route,setRoute]=useState<{promise:Promise<void>|null,key:number;href:string}>({promise:null,key:0,href:window.location.pathname+window.location.search});
  router.push.mockImplementation((href:string)=>{if(href==='/fail')throw new Error('navigation failed');setRoute(r=>({promise:gates.get(href)??null,key:r.key+1,href}))});
  const nav=usePrimaryNavigation();
  return <><output data-testid="navigation-pending">{nav.pendingHref??'idle'}</output><input aria-label="未保存稿"/>{nav.slowHref?<p role="status" aria-label="页面打开较慢">仍在读取 {nav.slowHref}</p>:null}{nav.error?<p role="alert">{nav.error}</p>:null}{nav.slowHref||nav.error?<button onClick={nav.retry}>重试打开页面</button>:null}{['/','/b','/fail','/?filter=new'].map(href=><button key={href} onClick={()=>nav.navigate(href)}>{href}</button>)}<Suspense fallback={<p>加载</p>}><RouteBoundary key={route.key}><Content pending={route.promise} href={route.href}/></RouteBoundary></Suspense></>;
}
beforeEach(()=>{router.push.mockReset();router.refresh.mockReset();router.signal=null;});
it("已提交且可见的页面骨架继续防重，隐藏残留骨架和不同筛选不阻断",async()=>{
 const view=render(<><PageLoading/><Harness gates={new Map()}/></>);
 const marker=screen.getByRole('status',{name:'正在打开页面'});
 const visible=vi.spyOn(marker,'getClientRects').mockReturnValue([{}] as unknown as DOMRectList);
 await act(async()=>fireEvent.click(screen.getByRole('button',{name:'/'})));expect(router.push).not.toHaveBeenCalled();
 await act(async()=>fireEvent.click(screen.getByRole('button',{name:'/?filter=new'})));expect(router.push).toHaveBeenCalledWith('/?filter=new');
 visible.mockReturnValue([] as unknown as DOMRectList);
 await act(async()=>fireEvent.click(screen.getByRole('button',{name:'/'})));expect(router.push).toHaveBeenCalledTimes(2);
 visible.mockRestore();view.unmount();
});
it("首次立即执行，同一目标同步5次及等待中的再次点击只发一次，完成后可重新进入",async()=>{
 const gate=deferred();render(<Harness gates={new Map([['/',gate.promise]])}/>);
 await act(async()=>{for(let i=0;i<5;i++)fireEvent.click(screen.getByRole('button',{name:'/'}))});
 expect(router.push).toHaveBeenCalledTimes(1);expect(screen.getByRole('status').textContent).toBe('/');
 fireEvent.click(screen.getByRole('button',{name:'/'}));expect(router.push).toHaveBeenCalledTimes(1);
 await act(async()=>gate.resolve());await waitFor(()=>expect(screen.getByRole('status').textContent).toBe('idle'));
 fireEvent.click(screen.getByRole('button',{name:'/'}));expect(router.push).toHaveBeenCalledTimes(2);
});
it("异步路由失败保留侧栏并解锁，同一入口可重试",async()=>{
 const gate=deferred(),gates=new Map([['/',gate.promise]]);const log=vi.spyOn(console,'error').mockImplementation(()=>{});
 try {
  render(<Harness gates={gates}/>);await act(async()=>fireEvent.click(screen.getByRole('button',{name:'/'})));
  await act(async()=>gate.reject(new Error('RSC failed')));
  expect(screen.getByText('页面加载失败')).toBeTruthy();await waitFor(()=>expect(screen.getByRole('status').textContent).toBe('idle'));
  gates.delete('/');await act(async()=>fireEvent.click(screen.getByRole('button',{name:'/'})));expect(router.push).toHaveBeenCalledTimes(2);expect(screen.getByText('页面内容')).toBeTruthy();
 } finally {log.mockRestore()}
});
it("旧导航异步失败不能解开新导航的锁",async()=>{
 const a=deferred(),b=deferred();const log=vi.spyOn(console,'error').mockImplementation(()=>{});
 try {
  render(<Harness gates={new Map([['/',a.promise],['/b',b.promise]])}/>);
  await act(async()=>fireEvent.click(screen.getByRole('button',{name:'/'})));
  await act(async()=>fireEvent.click(screen.getByRole('button',{name:'/b'})));
  await act(async()=>a.reject(new Error('old RSC failed')));
  fireEvent.click(screen.getByRole('button',{name:'/b'}));expect(router.push).toHaveBeenCalledTimes(2);
  await act(async()=>b.resolve());await waitFor(()=>expect(screen.getByRole('status').textContent).toBe('idle'));
 } finally {log.mockRestore()}
});
it("快速缓存命中和同步失败之后不会锁死；不同完整URL不被当成重复",async()=>{
 render(<Harness gates={new Map()}/>);
 for(const href of ['/','/','/fail','/fail','/?filter=new']){
  await act(async()=>{fireEvent.click(screen.getByRole('button',{name:href}))});await waitFor(()=>expect(screen.getByRole('status').textContent).toBe('idle'));
 }
 expect(router.push).toHaveBeenCalledTimes(5);
});
it("A→B→A保留最后意图，旧完成不能释放新目标；切号后可重新打开同目标",async()=>{
 const a=deferred(),b=deferred();render(<Harness gates={new Map([['/',a.promise],['/b',b.promise]])}/>);
 await act(async()=>{for(const href of ['/','/b','/'])fireEvent.click(screen.getByRole('button',{name:href}))});
 expect(router.push.mock.calls.map(x=>x[0])).toEqual(['/','/b','/']);
 await act(async()=>b.resolve());fireEvent.click(screen.getByRole('button',{name:'/'}));expect(router.push).toHaveBeenCalledTimes(3);
 act(()=>window.dispatchEvent(new CustomEvent('creatoros:accounts-changed')));
 fireEvent.click(screen.getByRole('button',{name:'/'}));expect(router.push).toHaveBeenCalledTimes(4);
 await act(async()=>a.resolve());await waitFor(()=>expect(screen.getByRole('status').textContent).toBe('idle'));
});

it("挂起3秒只转慢反馈，不自动重发；显式重试保原稿并恢复",async()=>{
 vi.useFakeTimers();
 const gate=deferred(),gates=new Map([['/b',gate.promise]]);
 render(<Harness gates={gates}/>);
 const draft=screen.getByLabelText('未保存稿');fireEvent.change(draft,{target:{value:'未保存内容'}});
 await act(async()=>fireEvent.click(screen.getByRole('button',{name:'/b'})));
 await act(async()=>vi.advanceTimersByTimeAsync(2999));
 expect(screen.queryByRole('button',{name:'重试打开页面'})).toBeNull();
 expect(screen.getByTestId('navigation-pending')).toHaveTextContent('/b');
 await act(async()=>vi.advanceTimersByTimeAsync(1));
 expect(screen.getByRole('status',{name:'页面打开较慢'})).toHaveTextContent('仍在读取 /b');
 expect(screen.getByTestId('navigation-pending')).toHaveTextContent('idle');
 expect(router.push).toHaveBeenCalledTimes(1);
 fireEvent.click(screen.getByRole('button',{name:'/b'}));expect(router.push).toHaveBeenCalledTimes(1);
 gates.delete('/b');
 await act(async()=>fireEvent.click(screen.getByRole('button',{name:'重试打开页面'})));
 expect(router.push).toHaveBeenCalledTimes(2);
 expect(screen.getByLabelText('未保存稿')).toBe(draft);expect(draft).toHaveValue('未保存内容');
 await act(async()=>gate.resolve());
 expect(screen.queryByRole('status',{name:'页面打开较慢'})).toBeNull();
 expect(screen.getByTestId('navigation-pending')).toHaveTextContent('idle');
});

it("目标真实URL提交可独立解锁，旧transition仍挂起也不延长正在打开",async()=>{
 vi.useFakeTimers();const gate=deferred(),gates=new Map([['/b',gate.promise]]);
 const view=render(<Harness gates={gates}/>);
 await act(async()=>fireEvent.click(screen.getByRole('button',{name:'/b'})));
 expect(screen.getByTestId('navigation-pending')).toHaveTextContent('/b');
 await act(async()=>{window.history.replaceState(null,'','/b');view.rerender(<Harness gates={gates}/>);});
 expect(screen.getByTestId('navigation-pending')).toHaveTextContent('idle');
 await act(async()=>vi.advanceTimersByTimeAsync(3000));
 expect(screen.queryByRole('button',{name:'重试打开页面'})).toBeNull();
 await act(async()=>gate.resolve());
});

it("路由提交必须命中完整query，旧筛选提交不能清新筛选导航",async()=>{
 const gate=deferred(),gates=new Map([['/?filter=new',gate.promise]]);
 const view=render(<Harness gates={gates}/>);
 await act(async()=>fireEvent.click(screen.getByRole('button',{name:'/?filter=new'})));
 await act(async()=>{window.history.replaceState(null,'','/?filter=old');view.rerender(<Harness gates={gates}/>);});
 expect(screen.getByTestId('navigation-pending')).toHaveTextContent('/?filter=new');
 await act(async()=>{window.history.replaceState(null,'','/?filter=new');view.rerender(<Harness gates={gates}/>);});
 expect(screen.getByTestId('navigation-pending')).toHaveTextContent('idle');
 await act(async()=>gate.resolve());
});

it("旧目标的慢提示与晚完成不能覆盖新目标，账号变化清除恢复意图",async()=>{
 vi.useFakeTimers();const a=deferred(),b=deferred();
 render(<Harness gates={new Map([['/',a.promise],['/b',b.promise]])}/>);
 await act(async()=>fireEvent.click(screen.getByRole('button',{name:'/'})));
 await act(async()=>vi.advanceTimersByTimeAsync(2000));
 await act(async()=>fireEvent.click(screen.getByRole('button',{name:'/b'})));
 await act(async()=>vi.advanceTimersByTimeAsync(1000));
 expect(screen.queryByRole('button',{name:'重试打开页面'})).toBeNull();
 expect(screen.getByTestId('navigation-pending')).toHaveTextContent('/b');
 await act(async()=>vi.advanceTimersByTimeAsync(2000));
 expect(screen.getByRole('status',{name:'页面打开较慢'})).toHaveTextContent('仍在读取 /b');
 await act(async()=>a.resolve());
 expect(screen.getByRole('status',{name:'页面打开较慢'})).toHaveTextContent('仍在读取 /b');
 await act(async()=>window.dispatchEvent(new CustomEvent('creatoros:accounts-changed')));
 expect(screen.queryByRole('button',{name:'重试打开页面'})).toBeNull();
 expect(screen.getByTestId('navigation-pending')).toHaveTextContent('idle');
 await act(async()=>{b.resolve();await vi.advanceTimersByTimeAsync(3000);});
 expect(screen.queryByRole('button',{name:'重试打开页面'})).toBeNull();
});

it("已提交的可见骨架慢读仍可明确重试，恢复调用真实refresh且保原稿",async()=>{
 vi.useFakeTimers();
 const view=render(<><PageLoading/><Harness gates={new Map()}/></>);
 const marker=screen.getByRole('status',{name:'正在打开页面'});
 const visible=vi.spyOn(marker,'getClientRects').mockReturnValue([{}] as unknown as DOMRectList);
 const draft=screen.getByLabelText('未保存稿');fireEvent.change(draft,{target:{value:'原稿保留'}});
 await act(async()=>fireEvent.click(screen.getByRole('button',{name:'/'})));
 expect(router.push).not.toHaveBeenCalled();
 await act(async()=>vi.advanceTimersByTimeAsync(3000));
 expect(screen.getByRole('status',{name:'页面打开较慢'})).toBeVisible();
 await act(async()=>fireEvent.click(screen.getByRole('button',{name:'重试打开页面'})));
 expect(router.refresh).toHaveBeenCalledTimes(1);expect(router.push).not.toHaveBeenCalled();
 expect(screen.getByLabelText('未保存稿')).toBe(draft);expect(draft).toHaveValue('原稿保留');
 visible.mockReturnValue([] as unknown as DOMRectList);
 await act(async()=>marker.setAttribute('hidden',''));
 expect(screen.queryByRole('button',{name:'重试打开页面'})).toBeNull();
 expect(screen.getByLabelText('未保存稿')).toBe(draft);expect(draft).toHaveValue('原稿保留');
 visible.mockRestore();view.unmount();
});

it("同步失败有真实重试，跨标签账号范围变化立即丢弃旧恢复入口",async()=>{
 render(<Harness gates={new Map()}/>);
 await act(async()=>fireEvent.click(screen.getByRole('button',{name:'/fail'})));
 expect(screen.getByRole('alert')).toHaveTextContent('页面暂时无法打开，请重试。');
 await act(async()=>fireEvent.click(screen.getByRole('button',{name:'重试打开页面'})));
 expect(router.push).toHaveBeenCalledTimes(2);
 await act(async()=>window.dispatchEvent(new StorageEvent('storage',{key:'creatoros:current-group',newValue:'another-group'})));
 expect(screen.queryByRole('button',{name:'重试打开页面'})).toBeNull();
 expect(screen.queryByRole('alert')).toBeNull();
});

it("真实侧栏展开与收拢都提供慢解释和可工作的恢复按钮",async()=>{
 vi.useFakeTimers();const gate=deferred(),gates=new Map([['/positioning',gate.promise]]);
 function SidebarHarness(){
  const [route,setRoute]=useState<{pending:Promise<void>|null;href:string}>({pending:null,href:'/'});
  router.push.mockImplementation((href:string)=>setRoute({pending:gates.get(href)??null,href}));
  return <><Sidebar pathname="/"/><input aria-label="保留的工作稿"/><Suspense fallback={<p>页面读取中</p>}><Content pending={route.pending} href={route.href}/></Suspense></>;
 }
 render(<SidebarHarness/>);
 const draft=screen.getByLabelText('保留的工作稿');fireEvent.change(draft,{target:{value:'仍未保存'}});
 await act(async()=>fireEvent.click(screen.getByRole('link',{name:'定位中心'})));
 await act(async()=>vi.advanceTimersByTimeAsync(3000));
 expect(screen.getByRole('status',{name:'页面打开较慢'})).toHaveTextContent('仍在读取。可以继续等待或重试');
 expect(screen.queryByText('正在打开',{exact:true})).toBeNull();
 await act(async()=>fireEvent.click(screen.getByRole('button',{name:'收起侧栏'})));
 expect(screen.getByRole('button',{name:'重试打开页面'})).toBeVisible();
 gates.delete('/positioning');
 await act(async()=>fireEvent.click(screen.getByRole('button',{name:'重试打开页面'})));
 expect(router.push.mock.calls.map(call=>call[0])).toEqual(['/positioning','/positioning']);
 expect(screen.getByLabelText('保留的工作稿')).toBe(draft);expect(draft).toHaveValue('仍未保存');
 await act(async()=>gate.resolve());
 expect(screen.queryByRole('button',{name:'重试打开页面'})).toBeNull();
});

it("过渡结束但目标URL尚未提交时给错误和重试，不能静默当作已打开",async()=>{
 function NoCommitHarness(){
  const nav=usePrimaryNavigation();
  return <><button onClick={()=>nav.navigate('/b')}>打开B</button>{nav.error?<p role="alert">{nav.error}</p>:null}{nav.error?<button onClick={nav.retry}>重试打开页面</button>:null}</>;
 }
 render(<NoCommitHarness/>);
 await act(async()=>fireEvent.click(screen.getByRole('button',{name:'打开B'})));
 expect(window.location.pathname).toBe('/');
 expect(screen.getByRole('alert')).toHaveTextContent('页面暂时无法打开，请重试。');
 expect(screen.getByRole('button',{name:'重试打开页面'})).toBeVisible();
 expect(router.push).toHaveBeenCalledTimes(1);
});

function EarlyUrlHarness({href}:{href:string}){
 const nav=usePrimaryNavigation();
 return <><button onClick={()=>nav.navigate(href)}>打开目标</button><output data-testid="early-url-pending">{nav.pendingHref??"idle"}</output>{nav.slowHref?<p role="status">目标仍在读取</p>:null}{nav.error?<p role="alert">{nav.error}</p>:null}</>;
}
it("浏览器URL先更新但React pathname仍旧时不清导航，3秒只给慢反馈，真实提交后收口",async()=>{
 vi.useFakeTimers();router.signal={pathname:"/",search:""};
 router.push.mockImplementation((href:string)=>window.history.replaceState(null,"",href));
 const view=render(<EarlyUrlHarness href="/b"/>);
 await act(async()=>fireEvent.click(screen.getByRole("button",{name:"打开目标"})));
 expect(window.location.pathname).toBe("/b");expect(router.signal.pathname).toBe("/");
 expect(screen.getByTestId("early-url-pending")).toHaveTextContent("/b");
 expect(screen.queryByRole("alert")).toBeNull();
 await act(async()=>vi.advanceTimersByTimeAsync(3000));
 expect(screen.getByText("目标仍在读取")).toBeVisible();expect(router.push).toHaveBeenCalledTimes(1);
 router.signal={pathname:"/b",search:""};await act(async()=>view.rerender(<EarlyUrlHarness href="/b"/>));
 expect(screen.getByTestId("early-url-pending")).toHaveTextContent("idle");expect(screen.queryByText("目标仍在读取")).toBeNull();
});
it("浏览器query先更新但React query仍旧时不能把地址相等当作本轮提交",async()=>{
 window.history.replaceState(null,"","/?filter=old");router.signal={pathname:"/",search:"filter=old"};
 router.push.mockImplementation((href:string)=>window.history.replaceState(null,"",href));
 const view=render(<EarlyUrlHarness href="/?filter=new"/>);
 await act(async()=>fireEvent.click(screen.getByRole("button",{name:"打开目标"})));
 expect(window.location.search).toBe("?filter=new");expect(router.signal.search).toBe("filter=old");
 expect(screen.getByTestId("early-url-pending")).toHaveTextContent("/?filter=new");
 router.signal={pathname:"/",search:"filter=new"};await act(async()=>view.rerender(<EarlyUrlHarness href="/?filter=new"/>));
 expect(screen.getByTestId("early-url-pending")).toHaveTextContent("idle");
});
