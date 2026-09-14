// @vitest-environment jsdom
import {it,expect,vi,afterEach} from 'vitest';
import {copilotLocalTarget,handleCopilotLocalClick} from './copilot-navigation';
afterEach(()=>{vi.restoreAllMocks();document.body.replaceChildren();});
it('同页专用入口保留原页面筛选并替换旧助手参数',()=>{
 expect(copilotLocalTarget('?copilot=open&scope=global','https://app.test/projects?filter=active&fn=old&selId=old')).toBe('/projects?filter=active&copilot=open&scope=global');
 expect(copilotLocalTarget('?copilot=open&fn=review.analyze&selId=p1','https://app.test/projects')).toContain('selId=p1');
});
it.each(['https://other.test/projects?copilot=open','/topics?copilot=open','?copilot=open&filter=other','?filter=active'])('真实导航不被拦截：%s',href=>{
 expect(copilotLocalTarget(href,'https://app.test/projects?filter=active')).toBeNull();
});
it.each([{}, {ctrlKey:true},{metaKey:true},{shiftKey:true},{button:1}])('只拦截同页普通点击 %j',options=>{
 const spy=vi.spyOn(window.history,'pushState').mockImplementation(()=>{});
 const a=document.createElement('a');a.href='?copilot=open&scope=global';document.body.append(a);
 a.addEventListener('click',handleCopilotLocalClick);
 const e=new MouseEvent('click',{bubbles:true,cancelable:true,...options});a.dispatchEvent(e);
 const plain=Object.keys(options).length===0;expect(e.defaultPrevented).toBe(plain);expect(spy).toHaveBeenCalledTimes(plain?1:0);
});
