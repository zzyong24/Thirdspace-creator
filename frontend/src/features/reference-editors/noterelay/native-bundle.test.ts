// @vitest-environment node
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {it,expect} from 'vitest';
import {build,transform} from 'esbuild';
import {unzipSync} from 'fflate';
const defaults={schemaVersion:1,editor:'noterelay',editorVersion:'0.1.8',themeId:'moyu-green',authorName:'',authorBio:'',variables:{},fontSize:16,splitHeading:2,templateId:'default',imageWidths:{},imageRadii:{}};
const theme={mode:'light',tokens:{'--creatoros-surface':'#fff'},fontFamily:'sans-serif',fontSize:'14px',density:'comfortable'};
async function host(source=readFileSync('public/reference-editors/noterelay/native/native.js','utf8')){
 const dom=new JSDOM('<main id="host"></main>',{url:'http://creatoros.test/projects/output',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;
 Object.assign(w,{TextEncoder,TextDecoder,structuredClone:(v:unknown)=>JSON.parse(JSON.stringify(v)),CSS:{escape:(v:string)=>v}});
 Object.assign(w.URL,{createObjectURL:()=>`blob:registered-${Math.random()}`,revokeObjectURL:()=>{}});Object.assign(w.HTMLImageElement.prototype,{decode:async()=>{}});
 const before=(w.HTMLElement.prototype as any).createEl;
 const code=await transform(source,{format:'iife',globalName:'NoteRelayNative'});w.eval(code.code);
 const shadow=w.document.querySelector('#host')!.attachShadow({mode:'open'}),container=w.document.createElement('div');shadow.append(container);
 const signal=new w.AbortController(),changed:unknown[]=[];
 const runtime=await (w as any).NoteRelayNative.mount(container,{owner:{accountId:'account',projectId:'project',outputId:'output',sourceVersionId:'version'},theme,portalContainer:container,signal:signal.signal,onChanged:(v:unknown)=>changed.push(v),onError:()=>{}});
 return {w,shadow,container,runtime,signal,changed,before,close:async()=>{await runtime.dispose();dom.window.close();}};
}
async function blobText(w:any,blob:Blob){return new Promise<string>((resolve,reject)=>{const reader=new w.FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=reject;reader.readAsText(blob);});}
it('实际原生 ESM 挂载原公众号主题；精确图片交付且不修改应用DOM或原型',async()=>{
 const h=await host();try{
  const source='creatoros-asset:asset:file',image=new h.w.Blob([new Uint8Array([1,2,3])],{type:'image/png'}),input={platform:'wechat',title:'已编辑标题',markdown:`# 已编辑标题\n\n## 第一段\n\n实际正文。\n\n![图](${source})`,images:[{source,blob:image}]};
  await h.runtime.request('load',{...input,layout:defaults});const first=h.container.innerHTML;
  expect(h.container.textContent).toContain('实际正文');expect(h.w.document.querySelector('.noterelay-wechat')).toBeNull();expect((h.w.HTMLElement.prototype as any).createEl).toBe(h.before);
  await h.runtime.request('load',{...input,layout:{...defaults,themeId:'graphite-minimal'}});expect(h.container.innerHTML).not.toBe(first);
  const result=await h.runtime.request('export',{action:'html'}),html=await blobText(h.w,result.blob);
  expect(html).toContain('实际正文');expect(html).toContain('style=');expect(html).toContain('data:image/png;base64,AQID');expect(html).not.toContain('creatoros-asset:');expect(result.plainText).toContain('实际正文');
 }finally{await h.close();}
});
it('原分页/页序、尺寸与稳定图片 key 保留；React控件可通过原生句柄导航和改版式',async()=>{
 const h=await host();try{
  const source='creatoros-asset:asset:file',image=new h.w.Blob([new Uint8Array([1])],{type:'image/png'}),input={platform:'rednote',title:'稿件',markdown:`# 稿件\n\n第一页\n\n![图](${source})\n\n---\n\n## 卡片二\n\n第二页`,images:[{source,blob:image}]};
  const meta=await h.runtime.request('load',{...input,layout:{...defaults,themeId:'default'}});expect(meta.pageCount).toBe(2);
  const cards=[...h.container.querySelectorAll<HTMLElement>('.noterelay-rednote-card')];expect(cards.every(c=>c.dataset.exportWidth==='1242'&&c.dataset.exportHeight==='1660')).toBe(true);
  await h.runtime.request('page',{index:1});expect(h.container.querySelector('.is-active')?.textContent).toContain('第二页');
  const key=meta.images[0].key;expect(key).toBe(`0:0:${source}`);
  await h.runtime.request('load',{...input,layout:{...defaults,themeId:'default',imageWidths:{[key]:75},imageRadii:{[key]:12}}});
  const rendered=h.container.querySelector<HTMLImageElement>('[data-noterelay-image-key]')!;expect(rendered.style.getPropertyValue('--nr-image-width')).toBe('75%');expect(rendered.style.getPropertyValue('--nr-image-radius')).toBe('12px');
  expect(h.container.textContent).not.toMatch(/夜半过后|欢迎关注|创作者/);
 }finally{await h.close();}
});
it('两个原生实例交付独立；未知版式不破坏旧稿，卸载取消旧请求且不执行Markdown HTML',async()=>{
 const a=await host(),b=await host();try{
  await a.runtime.request('load',{platform:'wechat',title:'甲',markdown:'甲正文\n\n<script>window.hacked=1</script>',layout:defaults,images:[]});
  await b.runtime.request('load',{platform:'wechat',title:'乙',markdown:'乙正文',layout:defaults,images:[]});
  const before=a.container.innerHTML;await expect(a.runtime.request('load',{platform:'wechat',title:'坏',markdown:'坏',layout:{...defaults,fontSize:99},images:[]})).rejects.toThrow();expect(a.container.innerHTML).toBe(before);
  expect(a.container.querySelector('script')).toBeNull();expect((a.w as any).hacked).toBeUndefined();
  const [one,two]=await Promise.all([a.runtime.request('export',{action:'html'}),b.runtime.request('export',{action:'html'})]);expect(await blobText(a.w,one.blob)).toContain('甲正文');expect(await blobText(b.w,two.blob)).toContain('乙正文');
  await a.runtime.dispose();await expect(a.runtime.request('snapshot')).rejects.toThrow();expect(a.container.children).toHaveLength(0);expect(b.container.textContent).toContain('乙正文');
 }finally{await a.close();await b.close();}
});
it('原PNG/ZIP逐页管线保留；像素捕获明确使用夹具，未验证真实PNG像素',async()=>{
 const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ1kAAAAASUVORK5CYII=';
 const bundle=await build({entryPoints:['../reference-editors/noterelay/web/native.ts'],bundle:true,write:false,format:'esm',nodePaths:['node_modules','../contract/node_modules'],alias:{obsidian:process.cwd()+'/../reference-editors/noterelay/web/obsidian.ts'},plugins:[{name:'explicit-pixel-fixture',setup(b){b.onResolve({filter:/^html-to-image$/},()=>({path:'pixel-fixture',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:`export async function toPng(node,options){globalThis.captureCalls=(globalThis.captureCalls||[]).concat([{text:node.textContent,ratio:options.pixelRatio}]);return ${JSON.stringify(png)};}`}));}}]});
 const h=await host(bundle.outputFiles[0]!.text);try{
  await h.runtime.request('load',{platform:'rednote',title:'确定稿',markdown:'# 确定稿\n\n第一页\n\n---\n\n## 二\n\n第二页',layout:{...defaults,themeId:'default'},images:[]});
  const result=await h.runtime.request('export',{action:'zip'}),reader=new h.w.FileReader();const bytes=await new Promise<Uint8Array>((resolve,reject)=>{reader.onload=()=>resolve(new Uint8Array(reader.result as ArrayBuffer));reader.onerror=reject;reader.readAsArrayBuffer(result.blob);});
  const files=unzipSync(bytes);expect(Object.keys(files)).toEqual(['确定稿-01.png','确定稿-02.png']);expect(files['确定稿-01.png']!.slice(0,8)).toEqual(new Uint8Array([137,80,78,71,13,10,26,10]));expect(result.filename).toBe('确定稿-全部页面.zip');
  const calls=(h.w as any).captureCalls;expect(calls.map((c:any)=>c.text)).toEqual([expect.stringContaining('第一页'),expect.stringContaining('第二页')]);expect(calls.every((c:any)=>c.ratio===1242/450)).toBe(true);
 }finally{await h.close();}
});
