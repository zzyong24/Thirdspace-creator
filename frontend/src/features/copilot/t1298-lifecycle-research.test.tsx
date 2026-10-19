import * as React from 'react';
import {render,act,cleanup} from '@testing-library/react';
import {it,expect,afterEach,vi} from 'vitest';
afterEach(cleanup);
// 最小区分实验：真实React StrictMode调度；不代替生产Composer或浏览器验收。
function Probe({aligned,pending,send}:{aligned:boolean;pending:Promise<void>;send:()=>void}){
 const mounted=React.useRef(true),attempt=React.useRef<object|null>(null),handled=React.useRef(false);
 const lifecycle=aligned?React.useLayoutEffect:React.useEffect;
 lifecycle(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 React.useLayoutEffect(()=>{if(attempt.current&&!mounted.current)attempt.current=null;},[]);
 React.useEffect(()=>{if(handled.current)return;handled.current=true;const token={};attempt.current=token;void pending.then(()=>{if(mounted.current&&attempt.current===token)send();});},[pending,send]);return null;
}
it.each([false,true])('T1298研究：StrictMode初挂 aligned=%s',async aligned=>{let release!:()=>void;const pending=new Promise<void>(r=>{release=r;}),send=vi.fn();render(<React.StrictMode><Probe aligned={aligned} pending={pending} send={send}/></React.StrictMode>);await act(async()=>release());expect(send).toHaveBeenCalledTimes(aligned?1:0);});
it.each([false,true])('T1298研究：真实卸载不发送 aligned=%s',async aligned=>{let release!:()=>void;const pending=new Promise<void>(r=>{release=r;}),send=vi.fn();const view=render(<React.StrictMode><Probe aligned={aligned} pending={pending} send={send}/></React.StrictMode>);view.unmount();await act(async()=>release());expect(send).not.toHaveBeenCalled();});
