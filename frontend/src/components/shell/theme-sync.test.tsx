import { act, cleanup, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ThemeSync } from './theme-sync';

afterEach(()=>{cleanup();localStorage.clear();document.documentElement.classList.remove('dark');delete document.documentElement.dataset.theme;delete document.documentElement.dataset.density;vi.restoreAllMocks();});
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

function installMedia() {
 vi.spyOn(window, 'matchMedia').mockImplementation(() => ({
  matches: false,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
 }) as unknown as MediaQueryList);
}

it.each(['compact', 'comfortable'])('其他页面挂载恢复已保存的%s密度', (density) => {
 installMedia();
 localStorage.setItem('creatoros.settings.density', density);
 document.documentElement.dataset.density = density === 'compact' ? 'comfortable' : 'compact';
 render(<ThemeSync />);
 expect(document.documentElement.dataset.density).toBe(density);
 expect(localStorage.getItem('creatoros.settings.density')).toBe(density);
});

it('密度跨标签更新、删除、非法值及清空后恢复舒适，不写回存储', () => {
 installMedia();
 localStorage.setItem('creatoros.settings.density', 'compact');
 const ui = render(<ThemeSync />);
 expect(document.documentElement.dataset.density).toBe('compact');
 for (const value of ['comfortable', 'compact', 'invalid', null]) {
  act(() => {
   if (value === null) localStorage.removeItem('creatoros.settings.density');
   else localStorage.setItem('creatoros.settings.density', value);
   window.dispatchEvent(new StorageEvent('storage', { key: 'creatoros.settings.density', newValue: value }));
  });
  expect(document.documentElement.dataset.density).toBe(value === 'compact' ? 'compact' : 'comfortable');
  expect(localStorage.getItem('creatoros.settings.density')).toBe(value);
 }
 act(() => {
  localStorage.setItem('creatoros.settings.density', 'compact');
  window.dispatchEvent(new StorageEvent('storage', { key: 'creatoros.settings.density', newValue: 'compact' }));
  localStorage.clear();
  window.dispatchEvent(new StorageEvent('storage', { key: null }));
 });
 expect(document.documentElement.dataset.density).toBe('comfortable');
 expect(localStorage.length).toBe(0);
 ui.unmount();
 document.documentElement.dataset.density = 'compact';
 act(() => window.dispatchEvent(new StorageEvent('storage', { key: 'creatoros.settings.density' })));
 expect(document.documentElement.dataset.density).toBe('compact');
});

it('存储或系统主题读取异常不妨碍密度回到舒适', () => {
 vi.spyOn(window, 'matchMedia').mockImplementation(() => { throw new Error('unavailable'); });
 vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('unavailable'); });
 document.documentElement.dataset.density = 'compact';
 expect(() => render(<ThemeSync />)).not.toThrow();
 expect(document.documentElement.dataset.density).toBe('comfortable');
});
