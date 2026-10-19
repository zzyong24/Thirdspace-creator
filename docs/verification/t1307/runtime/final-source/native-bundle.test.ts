// @vitest-environment node
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import type {ArticleDocument} from '@creatoros/contract';
import {JSDOM} from 'jsdom';
import {it,expect} from 'vitest';
import {build,transform} from 'esbuild';
import {unzipSync} from 'fflate';
import {projectArticle} from './projection';
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

it('未配置完整身份时不注入占位署名，已有账号/frontmatter/变量资料保持真实渲染',async()=>{
 const h=await host();try{
  const cases=[{layout:{},signature:false},{layout:{authorName:'只有作者'},signature:false},{layout:{authorName:'  ',authorBio:'  '},signature:false},{layout:{authorName:'真实作者',authorBio:'真实简介'},signature:true},{layout:{},frontmatter:'---\nauthor: 真实作者\nbio: 真实简介\n---\n',signature:true},{layout:{variables:{作者名:'真实作者',简介:'真实简介'}},signature:true},{layout:{authorBio:'真实简介'},frontmatter:'---\nauthor: 真实作者\n---\n',signature:true}];
  for(const value of cases){await h.runtime.request('load',{platform:'wechat',title:'原文',markdown:(value.frontmatter??'')+'# 原文\n\n逐字保留的正文。',layout:{...defaults,themeId:'graphite-minimal',...value.layout},images:[]});expect(h.container.textContent).toContain('逐字保留的正文');expect(h.container.textContent).not.toContain('{{作者名}}');expect(h.container.textContent).not.toContain('{{简介}}');expect(Boolean(h.container.querySelector('[data-wenote-kind="signature"]'))).toBe(value.signature);const exported=await h.runtime.request('export',{action:'html'}),html=await blobText(h.w,exported.blob);expect(html).not.toContain('{{作者名}}');if(value.signature)expect(html).toContain('真实作者');}
 }finally{await h.close();}
});

// 两份原件由真实公开候选链保存；只读取，不把观察结果回写原稿。
const originalSourceRoot='../docs/verification/t1302/acceptance/runs/final-t1304-t1305/a';
function textWithBreaks(node:Node):string {
 if(node.nodeType===3)return node.textContent??'';
 if(node.nodeName==='BR')return '\n';
 return [...node.childNodes].map(textWithBreaks).join('');
}
function saveEvidence(name:string,value:Record<string,unknown>,preview:string,exported:string){
 const phase=process.env.T1307_EVIDENCE_PHASE;
 if(!phase)return;
 if(!['red','baseline','green','final'].includes(phase))throw Error('无效的T1307证据阶段');
 const run=process.env.T1307_EVIDENCE_RUN;
 if(run&&!/^[a-z0-9-]+$/.test(run))throw Error('无效的T1307证据运行名');
 const dir=path.resolve('../docs/verification/t1307/runtime',phase,run??'');mkdirSync(dir,{recursive:true});
 writeFileSync(path.join(dir,`${name}.json`),JSON.stringify(value,null,2)+'\n');
 writeFileSync(path.join(dir,`${name}-preview.html`),preview);
 writeFileSync(path.join(dir,`${name}-export.html`),exported);
}
for(const family of ['creation-article','editor-article'] as const){
 it(`T1307原${family}全文与四行下划线经真实public bundle预览/HTML逐源保真`,async()=>{
  const raw=readFileSync(`${originalSourceRoot}/${family}-actual-source.json`,'utf8'),source=JSON.parse(raw);
  const document:ArticleDocument=family==='creation-article'?source.candidate.article:source.candidate.candidate.document;
  const projection=projectArticle(document),sections=[...document.sections].sort((a,b)=>a.order-b.order);
  const expectedParagraphs=sections.flatMap(section=>section.body.split(/\n\n+/));
  const fourLines=sections.find(section=>section.sectionId==='article-note-template')!.body.split('\n').filter(line=>line.endsWith('______'));
  expect(fourLines).toHaveLength(4);
  const h=await host();try{
   await h.runtime.request('load',{platform:'wechat',...projection,images:[],layout:{...defaults,themeId:'graphite-minimal'}});
   const preview=h.container.querySelector('.noterelay-wechat-preview')!;
   const result=await h.runtime.request('export',{action:'html'}),html=await blobText(h.w,result.blob),exported=new JSDOM(html);
   try{
    const previewParagraphs=[...preview.querySelectorAll('[data-wenote-block="paragraph"]')].map(textWithBreaks);
    const exportParagraphs=[...exported.window.document.querySelectorAll('p')].filter(p=>p.style.textAlign==='justify').map(textWithBreaks);
    const previewText=textWithBreaks(preview),exportText=textWithBreaks(exported.window.document.body);
    saveEvidence(family,{sourceSha256:createHash('sha256').update(raw).digest('hex'),projection,expectedParagraphs,fourLines,previewParagraphs,exportParagraphs,previewText,exportText},preview.innerHTML,html);
    expect.soft(previewParagraphs).toEqual(expectedParagraphs);
    expect.soft(exportParagraphs).toEqual(expectedParagraphs);
    expect.soft([...preview.querySelectorAll('h3')].map(n=>n.textContent)).toEqual(sections.map(s=>s.heading));
    expect.soft([...exported.window.document.querySelectorAll('h3')].map(n=>n.textContent)).toEqual(sections.map(s=>s.heading));
    expect.soft(preview.querySelector('h1')?.textContent).toBe(document.title);
    expect.soft(exported.window.document.querySelector('h1')?.textContent).toBe(document.title);
    for(const line of fourLines){expect.soft(previewText).toContain(line);expect.soft(exportText).toContain(line);}
    expect.soft(previewText).not.toMatch(/<\/?(?:strong|span)\b/);
    expect.soft(exportText).not.toMatch(/<\/?(?:strong|span)\b/);
    expect(preview.querySelector('[data-wenote-kind="shell"]')).toBeNull();
    expect(preview.querySelector('[data-wenote-block="shell"]')?.getAttribute('data-wenote-kind')).toBe('graphite-minimal');
   }finally{exported.window.close();}
  }finally{await h.close();}
 });
}

async function checkInline(name:string,markdown:string,check:(root:ParentNode)=>void,layout:Record<string,unknown>={}){
 const h=await host();try{
  await h.runtime.request('load',{platform:'wechat',title:'格式稿',markdown:'# 格式稿\n\n'+markdown,images:[],layout:{...defaults,themeId:'graphite-minimal',...layout}});
  const preview=h.container.querySelector('.noterelay-wechat-preview')!;
  const result=await h.runtime.request('export',{action:'html'}),html=await blobText(h.w,result.blob),exported=new JSDOM(html);
  try{saveEvidence(name,{markdown,previewText:textWithBreaks(preview),exportText:textWithBreaks(exported.window.document.body)},preview.innerHTML,html);check(preview);check(exported.window.document.body);}finally{exported.window.close();}
 }finally{await h.close();}
}
it('T1307格式族：原强弱强调和删除线保留主题角色',async()=>{
 await checkInline('simple-format','**粗体**、__双下划线__、*斜体*、_单下划线_、~~删除~~',root=>{
  expect([...root.querySelectorAll('strong')].map(n=>n.textContent)).toEqual(['粗体','双下划线']);
  expect([...root.querySelectorAll('em')].map(n=>n.textContent)).toEqual(['斜体','单下划线']);
  expect(root.querySelector('del')?.textContent).toBe('删除');
  expect((root.querySelector('strong') as HTMLElement).style.color).toBe('rgb(39, 39, 42)');
 });
});
it('T1307格式族：嵌套强调只解析原输入且不新增字面标签',async()=>{
 await checkInline('nested-format','**外层 *内部* 结尾**，***三层***，__粗体与 _斜体_ 同行__。',root=>{
  expect(root.querySelector('strong em')?.textContent).toBe('内部');
  expect(root.querySelectorAll('strong')).toHaveLength(3);
  expect(root.querySelectorAll('em')).toHaveLength(3);
  expect(root.textContent).toContain('外层 内部 结尾');
  expect(root.textContent).not.toMatch(/<\/?(?:strong|span|em)\b/);
 });
});
it('T1307格式族：原加号下划线、高亮和受限u可混合嵌套',async()=>{
 await checkInline('extension-format','++下划线++、==高亮==、<u>原下划线</u>、~~删除~~、++**加粗**和==强调==++。',root=>{
  expect(root.textContent).toContain('下划线、高亮、原下划线、删除、加粗和强调。');
  expect(root.querySelector('strong')?.textContent).toBe('加粗');
  const decorated=[...root.querySelectorAll<HTMLElement>('span')].filter(n=>n.style.cssText.includes('background'));
  expect(decorated.some(n=>n.textContent==='高亮')).toBe(true);
  expect(root.textContent).not.toMatch(/<\/?(?:strong|span)\b/);
 });
});
it('T1307格式族：代码及反斜杠转义保留原文且不触发扩展或变量',async()=>{
 const code='**粗体** ++线++ ==亮== <u>下线</u> ~~删~~ {{示例}}';
 await checkInline('code-escape','`'+code+'`\n\n\\*\\*粗体\\*\\* \\+\\+线\\+\\+ \\=\\=亮\\=\\= \\<u>下线\\</u> \\~\\~删\\~\\~ \\{\\{示例}}',root=>{
  expect(root.textContent).toContain(code);expect(root.querySelector('strong,em,del,u')).toBeNull();
  expect(root.textContent).toContain('**粗体** ++线++ ==亮== <u>下线</u> ~~删~~ {{示例}}');
  expect(root.textContent).not.toContain('变量内容');
 },{variables:{示例:'变量内容'}});
});
it('T1307格式族：变量为终端原文，不解析Markdown/HTML或碰撞私用区',async()=>{
 const value='**值** ++线++ ==亮== <u>字</u> ~~删~~ [链](https://example.test/) <img src=x onerror=alert(1)> \uE0000\uE001 {{另一个}}';
 await checkInline('terminal-variable','{{示例}} 与 {{缺失}}',root=>{
  expect(root.textContent).toContain(value+' 与 {{缺失}}');expect(root.querySelector('strong,em,del,u,a,img')).toBeNull();
 },{variables:{示例:value,另一个:'不能递归替换'}});
});
it('T1307格式族：含符号链接和图片地址保真，显示标签可强调',async()=>{
 await checkInline('link-image','[**标签**](https://example.test/a_(b)?x=__&y=**)\n\n| 图 | 说明 |\n| --- | --- |\n| ![含_符号](https://example.test/a_(b).png?x=__&y=**) | 原图 |',root=>{
  const link=root.querySelector('a')!;expect(link.getAttribute('href')).toBe('https://example.test/a_(b)?x=__&y=**');expect(link.textContent).toBe('标签');expect(link.querySelector('strong')).not.toBeNull();
  const image=root.querySelector('td img')!;expect(image.getAttribute('src')).toBe('https://example.test/a_(b).png?x=__&y=**');expect(image.getAttribute('alt')).toBe('含_符号');
 });
});
it('T1307格式族：危险URL/原HTML不能取得执行节点或事件属性',async()=>{
 await checkInline('safety','[危险](javascript:alert(1)) [编码](javascript&#58;alert(1)) [数据](data:text/html;base64,PHNjcmlwdD4=)\n\n<script>window.hacked=1</script><u onclick="window.hacked=2">原HTML</u><img src=x onerror="window.hacked=3">',root=>{
  expect(root.querySelector('script,iframe,object,u,img,[onclick],[onerror]')).toBeNull();
  for(const link of root.querySelectorAll('a'))expect(link.getAttribute('href')??'').not.toMatch(/^(?:javascript|vbscript|data):/i);
  expect(root.textContent).toContain('<script>window.hacked=1</script>');
 });
});
it('T1307格式族：标点/换行/连续下划线保真且实体只解码一次',async()=>{
 await checkInline('punctuation-lines','项目______，file_name_value；\\_\\_\\_\\_。\n第二行______\n第三行______。\n\n&#60;strong&#62;原文&#60;/strong&#62; &amp; &lt;span&gt;',root=>{
  expect(textWithBreaks(root)).toContain('项目______，file_name_value；____。\n第二行______\n第三行______。');
  expect(root.textContent).toContain('<strong>原文</strong> & <span>');expect(root.querySelector('strong,em')).toBeNull();
 });
});
it('T1307格式族：单实例重载变量独立且显式主题优先，rednote不受扩展污染',async()=>{
 const h=await host();try{
  for(const value of ['甲**值**','乙<u>值</u>']){
   await h.runtime.request('load',{platform:'wechat',title:'稿',markdown:'---\ntheme: red-white\n---\n# 稿\n\n{{示例}}',images:[],layout:{...defaults,themeId:'graphite-minimal',variables:{示例:value}}});
   expect(h.container.querySelector('[data-wenote-block="paragraph"]')?.textContent).toBe(value);
   expect(h.container.querySelector('[data-wenote-block="shell"]')?.getAttribute('data-wenote-kind')).toBe('graphite-minimal');
  }
  await h.runtime.request('load',{platform:'wechat',title:'稿',markdown:'# 稿\n\n{{示例}}',images:[],layout:{...defaults,themeId:'graphite-minimal'}});
  expect(h.container.querySelector('[data-wenote-block="paragraph"]')?.textContent).toBe('{{示例}}');
  await h.runtime.request('load',{platform:'rednote',title:'图文',markdown:'# 图文\n\n++原文++ ==标记== <u>文字</u>\n\n---\n\n第二页',images:[],layout:{...defaults,themeId:'default'}});
  expect(h.container.querySelectorAll('.noterelay-rednote-card')).toHaveLength(2);expect(h.container.textContent).toContain('++原文++ ==标记==');
 }finally{await h.close();}
});
it('T1307格式族：纯正文仍保留原自动装饰；空标记和未闭合u保留原文',async()=>{
 const plain='这是一段没有显式格式的正文。后半句逐字保留。';
 await checkInline('plain-auto-decoration',plain,root=>{
  const decorated=[...root.querySelectorAll<HTMLElement>('span')].find(n=>n.style.borderBottom==='2px solid rgb(82, 82, 91)');
  expect(root.textContent).toContain(plain);expect(decorated?.textContent).toBe('这是一段没有显式格式的正文');
 });
 await checkInline('unpaired-decoration','++++\n\n====\n\n<u>未闭合\n\n\\+\\+字面加号\\+\\+',root=>{
  expect(root.textContent).toContain('++++');expect(root.textContent).toContain('====');expect(root.textContent).toContain('<u>未闭合');expect(root.textContent).toContain('++字面加号++');
 });
});
