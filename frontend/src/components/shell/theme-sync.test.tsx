import { act, cleanup, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ThemeSync } from './theme-sync';

afterEach(()=>{cleanup();localStorage.clear();document.documentElement.classList.remove('dark');vi.restoreAllMocks();});
it('系统外观变化在任意页面即时生效，手动浅色不会被系统覆盖',()=>{
 let dark=false;const listeners=new Set<()=>void>();
 vi.spyOn(window,'matchMedia').mockImplementation(()=>({get matches(){return dark;},addEventListener:(_e:string,fn:()=>void)=>listeners.add(fn),removeEventListener:(_e:string,fn:()=>void)=>listeners.delete(fn)}) as unknown as MediaQueryList);
 const ui=render(<ThemeSync/>);
 expect(document.documentElement.classList.contains('dark')).toBe(false);
 act(()=>{dark=true;listeners.forEach(fn=>fn());});
 expect(document.documentElement.classList.contains('dark')).toBe(true);
 act(()=>{localStorage.setItem('creatoros.settings.theme','light');window.dispatchEvent(new Event('creatoros:theme-change'));});
 expect(document.documentElement.classList.contains('dark')).toBe(false);
 act(()=>listeners.forEach(fn=>fn()));
 expect(document.documentElement.classList.contains('dark')).toBe(false);
 ui.unmount();expect(listeners.size).toBe(0);
});
