import * as React from "react";
import {cleanup,fireEvent,render,screen} from "@testing-library/react";
import {afterEach,describe,expect,it,vi} from "vitest";
vi.mock("next/navigation",()=>({usePathname:()=>window.location.pathname,useSearchParams:()=>new URLSearchParams(window.location.search)}));
vi.mock("./sidebar",()=>({Sidebar:({onMobileOpenChange}:{onMobileOpenChange:(open:boolean)=>void})=><><button onClick={()=>onMobileOpenChange(true)}>展开手机菜单</button><button onClick={()=>onMobileOpenChange(false)}>收起手机菜单</button></>}));
vi.mock("./top-header",()=>({TopHeader:()=>null}));
import {AppShell} from "./app-shell";
afterEach(cleanup);
describe("页面填满与外层滚动切换",()=>{
 it("跳过导航后焦点落到内容，手机菜单关闭后恢复原有未保存编辑内容",()=>{
  render(<AppShell pathname="/projects/example"><input aria-label="草稿" defaultValue="未保存的内容"/></AppShell>);
  fireEvent.click(screen.getByRole("link",{name:"跳到页面内容"}));
  expect(document.activeElement).toHaveAttribute("id","creatoros-main-content");
  const input=screen.getByRole("textbox",{name:"草稿"});
  const frame=input.closest('[data-slot="app-main-frame"]');
  fireEvent.click(screen.getByRole("button",{name:"展开手机菜单"}));
  expect(frame).toHaveAttribute("inert");
  fireEvent.click(screen.getByRole("button",{name:"收起手机菜单"}));
  expect(frame).not.toHaveAttribute("inert");
  expect(screen.getByRole("textbox",{name:"草稿"})).toBe(input);
  expect(input).toHaveValue("未保存的内容");
 });
 it.each([false,true])("初始 contentFill=%s，双向切换保留真实滚动容器和未保存子状态",initial=>{
  const mounted=vi.fn(),unmounted=vi.fn();
  function Draft(){
   const [name,setName]=React.useState("原稿");
   React.useEffect(()=>{mounted();return unmounted;},[]);
   return <input aria-label="未保存工程名" value={name} onChange={e=>setName(e.target.value)}/>;
  }
  const view=(fill:boolean)=><AppShell pathname="/projects/example" contentFill={fill}><Draft/></AppShell>;
  const tree=render(view(initial));const original=screen.getByRole("textbox");
  fireEvent.change(original,{target:{value:"未保存剪辑"}});
  tree.rerender(view(!initial));
  expect(screen.getByRole("textbox")).toBe(original);
  expect(original).toHaveValue("未保存剪辑");expect(mounted).toHaveBeenCalledTimes(1);expect(unmounted).not.toHaveBeenCalled();
  const viewport=tree.container.querySelector('[data-slot="scroll-area-viewport"]');expect(viewport).not.toBeNull();
  tree.rerender(view(initial));expect(screen.getByRole("textbox")).toBe(original);expect(tree.container.querySelector('[data-slot="scroll-area-viewport"]')).toBe(viewport);
  expect(mounted).toHaveBeenCalledTimes(1);expect(unmounted).not.toHaveBeenCalled();
 });
});
