import type {CommentUiEvidence} from '@creatoros/backend/application/collection/comment-read-diagnostics';

/** Playwright 序列化的自包含函数：仅在原 Page 上被动读取，不使用外部闭包。
 * SEMANTIC_BOUNDARY_ALLOW: DOM角色/可见性/长度与隐私边界，不判断登录或评论语义。
 * layout-visible 不代表视口内或未被遮挡；零节点不证明页面不存在某种状态。
 */
export function readCommentPageUiEvidence():{readyState:DocumentReadyState;uiEvidence:CommentUiEvidence} {
 const readyState=document.readyState;
 const ui:CommentUiEvidence={schemaVersion:1,status:'unavailable',title:null,nodes:[],truncated:false,scannedNodes:0,coverage:{mainSeen:false,dialogSeen:false,scanComplete:false}};
 try{
  if(document.location.origin!=='https://creator.douyin.com'){ui.status='not_applicable';return {readyState,uiEvidence:ui};}
  if(!document.documentElement)return {readyState,uiEvidence:ui};
  const started=performance.now();let exhausted=false;
  const cut=()=>{ui.truncated=true;ui.coverage.scanComplete=false;};
  // 主遍历和文本遍历共用计数（重复访问也计数）；祖先由根向下验证，继承排除/可见性。
  const visit=()=>{
   if(exhausted)return false;
   if(ui.scannedNodes>=2000||performance.now()-started>=50){cut();exhausted=true;return false;}
   ui.scannedNodes++;return true;
  };
  const roles=['heading','tab','button','alert','status','dialog'] as const;
  const bannedTags=new Set(['INPUT','TEXTAREA','SELECT','OPTION','SCRIPT','STYLE','TEMPLATE','NOSCRIPT','IFRAME','UL','OL','LI','TABLE','ARTICLE']);
  const bannedRoles=new Set(['list','feed','listitem','grid','row','rowgroup','cell','gridcell','table','tree','treeitem','textbox','searchbox','combobox','spinbutton','listbox','option']);
  const role=(el:Element)=>(el.getAttribute('role')??'').slice(0,128).trim().split(/\s+/)[0]??'';
  const isDialog=(el:Element)=>el.tagName==='DIALOG'||(el.getAttribute('role')??'').slice(0,128).trim().split(/\s+/).includes('dialog');
  const excluded=(el:Element)=>{
   const declared=el.getAttribute('role')??'';
   // 角色fallback中也不能夹带表单/正文容器；超长声明不截前缀后误放行。
   if(declared.length>128){cut();return true;}
   return bannedTags.has(el.tagName)||declared.trim().split(/\s+/).some(token=>bannedRoles.has(token))||(el as HTMLElement).isContentEditable;
  };
  const visible=(el:Element)=>{
   if(el.hasAttribute('hidden')||el.hasAttribute('inert')||el.getAttribute('aria-hidden')==='true')return false;
   const style=getComputedStyle(el);
   return style.display!=='none'&&style.visibility!=='hidden'&&style.visibility!=='collapse'&&style.opacity!=='0';
  };
  const short=(value:string)=>{
   // 与公开投影相同的协议脱敏；输入在 Text.substringData 处已限制为 1024 UTF-16 units。
   const safe=value.replace(/(?:[a-z][a-z0-9+.-]*:\/\/|www\.|[?&][^\s=<>]+=[^\s<>]*)[^\s<>]*/gi,'[url]').replace(/\s+/gu,' ').trim();
   const chars=Array.from(safe);return {text:chars.slice(0,120).join(''),truncated:chars.length>120};
  };
  const textOf=(root:Element,depth:number,title=false)=>{
   let value='',truncated=false;
   const read=(parent:Node,level:number)=>{
    if(level>32){cut();truncated=true;return;}
    for(let node=parent.firstChild;node;node=node.nextSibling){
     if(!visit()){truncated=true;return;}
     if(value.length>=1024){cut();truncated=true;return;}
     if(node.nodeType===Node.TEXT_NODE){
      const text=node as Text,remaining=1024-value.length;
      if(!title){
       // computedStyle 不能证明 light DOM 文本实际参与布局（shadow host 可隐藏它）。
       // Range 只覆盖有界前缀；不穿入 shadowRoot，也不修改选区或页面。
       const range=document.createRange();range.setStart(text,0);range.setEnd(text,Math.min(text.length,remaining));
       const rect=range.getBoundingClientRect();
       if(rect.width===0||rect.height===0)continue;
      }
      value+=text.substringData(0,remaining);
      if(text.length>remaining){cut();truncated=true;return;}
     }else if(node.nodeType===Node.ELEMENT_NODE){
      const element=node as Element;
      // 外层 status/alert 等也不得汇总子 dialog 正文；交由主遍历单独取标题。
      if(!excluded(element)&&!isDialog(element)&&(title||visible(element)))read(element,level+1);
     }
    }
   };
   read(root,depth+1);const result=short(value);if(result.truncated)cut();
   return {text:result.text,textTruncated:truncated||result.truncated};
  };
  const counts=new Map<string,number>();
  const add=(kind:CommentUiEvidence['nodes'][number]['kind'],region:CommentUiEvidence['nodes'][number]['region'],text:{text:string;textTruncated:boolean},el:Element)=>{
   if((counts.get(kind)??0)>=4||ui.nodes.length>=24){cut();return undefined;}
   counts.set(kind,(counts.get(kind)??0)+1);
   const selected=el.getAttribute('aria-selected');
   const node={kind,region,...text,selected:selected==='true'?true:selected==='false'?false:null};ui.nodes.push(node);return node;
  };
  type Region=CommentUiEvidence['nodes'][number]['region'];
  type UiNode=CommentUiEvidence['nodes'][number];
  // 不枚举 shadowRoot/iframe；不回退读取 main/div/p 全文。所有深度都相对已验证的 document 根。
  const walk=(node:Node,depth:number,region:Region,dialog?:UiNode)=>{
   if(!visit())return;
   if(depth>32){cut();return;}
   if(node.nodeType!==Node.ELEMENT_NODE)return;
   const el=node as Element;
   if(excluded(el))return;
   if(el.tagName==='TITLE'){
    const text=textOf(el,depth,true);ui.title=text.text;return;
   }
   if(el.tagName!=='HEAD'&&!visible(el))return;
   const explicit=role(el);
   const kind=isDialog(el)?'dialog':roles.find(kind=>kind===explicit)??(/^H[1-6]$/.test(el.tagName)?'heading':el.tagName==='BUTTON'?'button':undefined);
   if(explicit==='main'||el.tagName==='MAIN'){region='main';ui.coverage.mainSeen=true;}
   if(explicit==='navigation'||el.tagName==='NAV')region='navigation';
   if(kind==='dialog'){region='dialog';ui.coverage.dialogSeen=true;dialog=undefined;}
   if(kind&&el.getClientRects().length>0){
    // dialog 只由之后遇到的可见 heading 填充，绝不汇总对话框正文。
    if(kind==='dialog')dialog=add(kind,region,{text:'',textTruncated:false},el);
    else{
     const text=textOf(el,depth);
     add(kind,region,text,el);
     if(kind==='heading'&&dialog&&!dialog.text){dialog.text=text.text;dialog.textTruncated=text.textTruncated;}
    }
   }
   for(let child=node.firstChild;child&&!exhausted;child=child.nextSibling){
    // head 仅允许 title；其余节点只计访问，不读取其内容。
    if(el.tagName==='HEAD'&&(child.nodeType!==Node.ELEMENT_NODE||(child as Element).tagName!=='TITLE')){visit();continue;}
    walk(child,depth+1,region,dialog);
   }
  };
  ui.status='observed';ui.coverage.scanComplete=true;
  walk(document.documentElement,1,'other');
  while(new TextEncoder().encode(JSON.stringify(ui)).byteLength>12*1024){ui.nodes.pop();cut();}
  return {readyState,uiEvidence:ui};
 }catch{
  // 不传播页面异常文本，也不返回异常前的部分正文。
  return {readyState,uiEvidence:{schemaVersion:1,status:'unavailable',title:null,nodes:[],truncated:false,scannedNodes:0,coverage:{mainSeen:false,dialogSeen:false,scanComplete:false}}};
 }
}
