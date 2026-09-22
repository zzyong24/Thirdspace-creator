import 'server-only';
import {createHash} from 'node:crypto';
import {JSDOM} from 'jsdom';

export const WORKBENCH_RENDERER_POLICY = 'static-offline-v1';
export type WorkbenchHtmlDiagnostics = {
 schemaVersion: 1;
 status: 'analyzed' | 'unavailable' | 'not_applicable';
 sourceHash: string;
 scriptCount: number;
 externalResourceCount: number;
 staticSvgCount: number;
 staticTableCount: number;
 staticImgCount: number;
 degraded: boolean;
 repairAdvice: string[];
};
const REPAIR = '保留原版和可用正文；在 agent loop 中回读原始数据并核对动态图表的静态后备。若无完整后备，生成纯 SVG/CSS/静态表格的下一版本，逐项验证图表数值与来源，重新登记并验证预览、PNG 和 PDF；不能仅回复登记成功。';
const VERIFY = '结构计数不证明图表可见或后备完整；交付前核对正文、来源和图表数据，并检查静态预览。';

/** SEMANTIC_BOUNDARY_ALLOW: 只解析资源协议和 HTML/CSS 结构，不判断报告语义、图表内容或创作质量。 */
function external(value:string):boolean {
 return /^(?:https?:|wss?:|ftp:|\/\/)/i.test(value.trim().replace(/[\t\r\n]/g,''));
}
function cssUnescape(value:string):string {
 return value.replace(/\\([0-9a-f]{1,6})(?:\r\n|[\t\n\f\r ])?|\\([^\r\n\f])/gi,(_match,hex:string|undefined,char:string)=>{
  if(!hex)return char;
  const code=Number.parseInt(hex,16);
  return code===0||code>0x10ffff||(code>=0xd800&&code<=0xdfff)?'\ufffd':String.fromCodePoint(code);
 });
}
/** CSS 词法扫描跳过注释和普通字符串；不把 content 中的 url 文本当作资源。 */
function cssExternalCount(css:string):number {
 const tokens=/\/\*[\s\S]*?(?:\*\/|$)|"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'|(?:[a-z_-]|\\(?:[0-9a-f]{1,6}\s?|[^\r\n\f]))(?:[\w-]|\\(?:[0-9a-f]{1,6}\s?|[^\r\n\f]))*|[^\s]/gi;
 const values=Array.from(css.matchAll(tokens),match=>match[0]).filter(token=>!token.startsWith('/*'));
 let count=0;
 for(let i=0;i<values.length;i++){
  if(cssUnescape(values[i]).toLowerCase()==='url'&&values[i+1]==='('){
   let value='';i+=2;
   for(;i<values.length&&values[i]!==')';i++)value+=values[i];
   if(external(cssUnescape(value.replace(/^(['"])([\s\S]*)\1$/,'$2'))))count++;
  }else if(values[i]==='@'&&values[i+1]?.toLowerCase()==='import'&&/^["']/.test(values[i+2]??'')){
   if(external(cssUnescape(values[i+2].slice(1,-1))))count++;i+=2;
  }
 }
 return count;
}
// 只统计浏览器会解释为资源的属性，不把任意标签上的同名业务属性算进去。
function resourceAttribute(tag:string,name:string,namespace:string|null):boolean {
 if(name==='src')return ['script','img','iframe','embed','audio','video','source','track','input'].includes(tag);
 if(name==='href'||name==='xlink:href')return tag==='link'||(namespace==='http://www.w3.org/2000/svg'&&tag!=='a');
 if(name==='poster')return tag==='video';
 if(name==='data')return tag==='object';
 return name==='background'&&['body','table','td','th'].includes(tag);
}
function srcsetExternalCount(value:string):number {
 let count=0,offset=0;
 while(offset<value.length){
  while(/[\s,]/.test(value[offset]??'')&&offset<value.length)offset++;
  const start=offset;
  while(offset<value.length&&!/\s/.test(value[offset]))offset++;
  const url=value.slice(start,offset);
  if(external(url.replace(/,+$/,'')))count++;
  if(url.endsWith(','))continue;
  while(offset<value.length&&value[offset]!==',')offset++;
 }
 return count;
}

export function workbenchRendererDiagnostics(mime:string,sourceHash:string,bytes?:Uint8Array) {
 const diagnostics:WorkbenchHtmlDiagnostics=mime==='text/html'&&bytes
  ? diagnoseWorkbenchHtml(bytes)
  : {schemaVersion:1,status:mime==='text/html'?'unavailable':'not_applicable',sourceHash,
    scriptCount:0,externalResourceCount:0,staticSvgCount:0,staticTableCount:0,staticImgCount:0,degraded:false,
    repairAdvice:mime==='text/html'?['本次诊断不可用，计数尚未核验；登记结果仍保留，请回读已登记版本后检查预览。',REPAIR]:[]};
 return {rendererPolicy:WORKBENCH_RENDERER_POLICY,diagnostics};
}

/** 默认 JSDOM 不执行脚本、不加载资源。仅持有本次解析树，所有出口关闭 window。 */
export function diagnoseWorkbenchHtml(bytes:Uint8Array):WorkbenchHtmlDiagnostics {
 const sourceHash=createHash('sha256').update(bytes).digest('hex');
 let dom:JSDOM|undefined;
 try{
  dom=new JSDOM(Buffer.from(bytes).toString('utf8'),{contentType:'text/html'});
  const document=dom.window.document;
  let externalResourceCount=0,removedActiveContent=false;
  for(const node of document.querySelectorAll('*')){
   const tag=node.localName.toLowerCase();
   // 普通来源链接不加载资源，不计入；每个属性/候选 URL 独立计数。
   for(const attribute of Array.from(node.attributes)){
    const name=attribute.name.toLowerCase();
    if(name.startsWith('on'))removedActiveContent=true;
    if((name==='srcset'&&['img','source'].includes(tag))||(name==='imagesrcset'&&tag==='link'))externalResourceCount+=srcsetExternalCount(attribute.value);
    else if(resourceAttribute(tag,name,node.namespaceURI)){
     if(external(attribute.value))externalResourceCount++;
    }else if(['style','fill','stroke','filter','clip-path','mask','cursor'].includes(name))externalResourceCount+=cssExternalCount(attribute.value);
   }
   if(tag==='style')externalResourceCount+=cssExternalCount(node.textContent??'');
  }
  const scriptCount=document.querySelectorAll('script').length;
  // 原文声明的静态节点数，不等于渲染后可见数，也不推断数据覆盖。
  const degraded=scriptCount>0||externalResourceCount>0||removedActiveContent||!!document.querySelector('base,link,iframe,object,embed,form,source,meta[http-equiv="refresh" i]');
  return {schemaVersion:1,status:'analyzed',sourceHash,scriptCount,externalResourceCount,
   staticSvgCount:document.querySelectorAll('svg').length,staticTableCount:document.querySelectorAll('table').length,
   staticImgCount:document.querySelectorAll('img').length,degraded,
   repairAdvice:degraded?['静态预览与导出禁用脚本和外网依赖；相关内容可能缺失，已保留可用正文。',REPAIR,VERIFY]:[VERIFY]};
 }catch{
  return workbenchRendererDiagnostics('text/html',sourceHash).diagnostics;
 }finally{dom?.window.close();}
}
