import { Component, Suspense, use, useState, type ReactNode } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { usePrimaryNavigation } from "./use-primary-navigation";

const router = vi.hoisted(() => ({push:vi.fn()}));
vi.mock("next/navigation",()=>({useRouter:()=>router}));
function deferred() { let resolve!:()=>void;let reject!:(error:Error)=>void;const promise=new Promise<void>((r,j)=>{resolve=r;reject=j});return {promise,resolve,reject}; }
class RouteBoundary extends Component<{children:ReactNode},{failed:boolean}> {
 state={failed:false}; static getDerivedStateFromError(){return {failed:true}};
 render(){return this.state.failed?<p>页面加载失败</p>:this.props.children}
}
function Content({pending}:{pending:Promise<void>|null}) { if(pending) use(pending);return <p>页面内容</p>; }
function Harness({gates}:{gates:Map<string,Promise<void>>}) {
  const [route,setRoute]=useState<{promise:Promise<void>|null,key:number}>({promise:null,key:0});
  router.push.mockImplementation((href:string)=>{if(href==='/fail')throw new Error('navigation failed');setRoute(r=>({promise:gates.get(href)??null,key:r.key+1}))});
  const nav=usePrimaryNavigation();
  return <><output>{nav.pendingHref??'idle'}</output>{['/','/b','/fail','/?filter=new'].map(href=><button key={href} onClick={()=>nav.navigate(href)}>{href}</button>)}<Suspense fallback={<p>加载</p>}><RouteBoundary key={route.key}><Content pending={route.promise}/></RouteBoundary></Suspense></>;
}
beforeEach(()=>router.push.mockReset());
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
