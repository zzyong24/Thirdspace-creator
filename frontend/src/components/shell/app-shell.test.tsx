import * as React from "react";
import {cleanup,fireEvent,render,screen} from "@testing-library/react";
import {afterEach,describe,expect,it,vi} from "vitest";
vi.mock("./sidebar",()=>({Sidebar:()=>null}));
vi.mock("./top-header",()=>({TopHeader:()=>null}));
import {AppShell} from "./app-shell";
afterEach(cleanup);
describe("页面填满与外层滚动切换",()=>{
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
