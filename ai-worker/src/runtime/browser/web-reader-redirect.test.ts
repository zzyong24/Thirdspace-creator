import { expect, it, vi } from 'vitest';
import { readUrl, type ReaderCapableContext, type ReaderCapablePage } from './web-reader';

function fixture(pages: Record<string,string>) {
 let current='';
 const goto=vi.fn(async(url:string)=>{current=url;return {status:():number=>200,url:()=>url};});
 const page={goto,url:()=>current,title:async()=> '迁移后的正文',content:async()=>pages[current]??'<html></html>',waitForTimeout:async()=>{},waitForSelector:async()=>{},evaluate:async()=>undefined} as unknown as ReaderCapablePage;
 const close=vi.fn(async()=>{});
 const context={pages:()=>[page],newPage:async()=>page,close} satisfies ReaderCapableContext;
 return {goto,close,context,page};
}
const body='<article><h1>新指南</h1><p>'+ '实际正文讲述签名必须随工具调用回传。'.repeat(50) +'</p></article>';
it('标准 meta refresh 迁移在抽取前跟随，避免只返回页脚',async()=>{
 const f=fixture({'https://example.com/old':'<html><body><article><aside>此页面已迁移。<a href="/new#signatures">新指南</a></aside><meta content="0; url=/new#signatures" http-equiv="refresh"></article><footer>许可信息</footer></body></html>','https://example.com/new#signatures':body});
 const guard=vi.fn(async()=>{});
 const result=await readUrl('https://example.com/old',{authDir:''},{openContext:async()=>f.context,guardUrl:guard});
 expect(result.finalUrl).toBe('https://example.com/new#signatures');
 expect(result.text).toContain('实际正文');expect(result.text).not.toContain('许可信息');
 expect(guard).toHaveBeenCalledWith('https://example.com/new#signatures');expect(f.close).toHaveBeenCalledTimes(1);
});
it('迁移目标须在发出请求前通过 URL 守卫',async()=>{
 const f=fixture({'https://example.com/old':'<meta http-equiv="refresh" content="0; url=http://127.0.0.1/private">'});
 await expect(readUrl('https://example.com/old',{authDir:''},{openContext:async()=>f.context,guardUrl:async(url)=>{if(url.includes('127.0.0.1'))throw new Error('blocked');}})).rejects.toThrow('blocked');
 expect(f.goto).toHaveBeenCalledTimes(1);expect(f.close).toHaveBeenCalledTimes(1);
});
it('迁移循环不能把页脚当成功或无限访问',async()=>{
 const f=fixture({'https://example.com/old':'<meta http-equiv="refresh" content="0; url=/new">','https://example.com/new':'<meta http-equiv="refresh" content="0; url=/old">'});
 await expect(readUrl('https://example.com/old',{authDir:''},{openContext:async()=>f.context,guardUrl:async()=>{}})).rejects.toThrow('循环');
 expect(f.goto).toHaveBeenCalledTimes(2);expect(f.close).toHaveBeenCalledTimes(1);
});
it('每次迁移沿用同一浏览器，最多允许三跳',async()=>{
 const pages=Object.fromEntries(Array.from({length:6},(_,i)=>[`https://example.com/${i}`,`<meta http-equiv="refresh" content="0; url=/${i+1}">`]));
 const f=fixture(pages),open=vi.fn(async()=>f.context);
 await expect(readUrl('https://example.com/0',{authDir:''},{openContext:open,guardUrl:async()=>{}})).rejects.toThrow('超过三次');
 expect(f.goto).toHaveBeenCalledTimes(4);expect(open).toHaveBeenCalledTimes(1);expect(f.close).toHaveBeenCalledTimes(1);
});
it('仅跟随短延时迁移，普通定时刷新仍读取当前正文',async()=>{
 const f=fixture({'https://example.com/old':'<meta http-equiv="refresh" content="60; url=/other">'+body});
 const result=await readUrl('https://example.com/old',{authDir:''},{openContext:async()=>f.context,guardUrl:async()=>{}});
 expect(result.text).toContain('实际正文');expect(f.goto).toHaveBeenCalledTimes(1);
});
it('迁移时取消不再访问下一页，并关闭浏览器',async()=>{
 const f=fixture({'https://example.com/old':'<meta http-equiv="refresh" content="0; url=/new">'}),controller=new AbortController();
 await expect(readUrl('https://example.com/old',{authDir:'',signal:controller.signal},{openContext:async()=>f.context,guardUrl:async(url)=>{if(url.endsWith('/new'))controller.abort();}})).rejects.toMatchObject({name:'AbortError'});
 expect(f.goto).toHaveBeenCalledTimes(1);expect(f.close).toHaveBeenCalled();
});
it('迁移目标的 HTTP 错误不伪装成原页成功',async()=>{
 const f=fixture({'https://example.com/old':'<meta http-equiv="refresh" content="0; url=/new">'});
 const navigate=f.goto.getMockImplementation()!;
 f.goto.mockImplementation(async(url:string)=>{const response=await navigate(url);return url.endsWith('/new')?{status:()=>403,url:()=>url}:response;});
 await expect(readUrl('https://example.com/old',{authDir:''},{openContext:async()=>f.context,guardUrl:async()=>{}})).rejects.toMatchObject({status:403,code:'HTTP_ERROR'});
 expect(f.close).toHaveBeenCalledTimes(1);
});

it('同页锚点迁移不误判循环，也不重复读取',async()=>{
 const f=fixture({'https://example.com/old':'<meta http-equiv="refresh" content="0; url=#part">'+body});
 const result=await readUrl('https://example.com/old',{authDir:''},{openContext:async()=>f.context,guardUrl:async()=>{}});
 expect(result.text).toContain('实际正文');expect(f.goto).toHaveBeenCalledTimes(1);
});
it('相对迁移遵守文档 base，带引号地址正常解析',async()=>{
 const f=fixture({'https://example.com/old':`<head><base href="https://example.com/docs/"><meta http-equiv="REFRESH" content="0.5; URL='new'"></head>`,'https://example.com/docs/new':body});
 expect((await readUrl('https://example.com/old',{authDir:''},{openContext:async()=>f.context,guardUrl:async()=>{}})).finalUrl).toBe('https://example.com/docs/new');
});

it('抽取期间页面跳转必须重验新页面，不能把新正文归给旧 URL',async()=>{
 const f=fixture({'https://example.com/old':'<article><p>'+"旧页面信息。".repeat(100)+'</p></article>','https://example.com/new':body});
 let changed=false;
 f.page.title=async()=>{if(!changed){changed=true;await f.goto('https://example.com/new');}return '新页面';};
 const result=await readUrl('https://example.com/old',{authDir:''},{openContext:async()=>f.context,guardUrl:async()=>{}});
 expect(result.finalUrl).toBe('https://example.com/new');expect(result.text).toContain('实际正文');expect(result.text).not.toContain('旧页面信息');
 expect(f.goto.mock.calls.map(c=>c[0])).toEqual(['https://example.com/old','https://example.com/new','https://example.com/new']);
});
