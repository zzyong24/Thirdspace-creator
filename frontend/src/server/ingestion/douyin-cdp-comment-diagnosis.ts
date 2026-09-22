import {createHash,randomUUID} from 'node:crypto';
import type {ElementHandle,Page,Response} from '@playwright/test';
import type {CommentDiagnosisHost,CommentDiagnosisIdentity,CommentDiagnosisInput,CommentDiagnosisReport} from '@creatoros/backend/modules/analytics';

type Report=CommentDiagnosisReport;
type Candidate=Report['ui']['nodes'][number];
type Intent=NonNullable<Candidate['intent']>;
type SessionContext={newPage():Promise<Page>;close():Promise<void>};
type Ports={open(identity:CommentDiagnosisIdentity,signal:AbortSignal):Promise<SessionContext>;acquire():Promise<void>;throttled():void|Promise<void>;now?:()=>number;settleMs?:number;idleMs?:number;lifeMs?:number;checkoutMs?:number};
const HOME='https://creator.douyin.com/creator-micro/home';
const ORIGIN='https://creator.douyin.com';
const clone=<T>(value:T):T=>structuredClone(value);
const emptyUi=():Report['ui']=>({observationId:null,status:'unavailable',title:null,nodes:[],scannedNodes:0,truncated:false,groups:[],roots:[],coverage:{discoveryScope:'document_structure',scanScope:'selected_roots',discoveredRootsLowerBound:0,omittedRootsLowerBound:0,discoveryVisited:0,excludedSubtrees:0,discoveryComplete:false,scanComplete:false,limits:[]}});
const emptyNetwork=(revision:number):Report['networkEvidence']=>({stageRevision:revision,totalResponses:0,omittedResponses:0,truncated:false,items:[]});
const blank=(id:string,now:number):Report=>({schemaVersion:1,diagnosisId:id,publicationId:null,revision:0,generation:0,phase:'closed',status:'expired',dispatched:false,expiresAt:new Date(now).toISOString(),ui:emptyUi(),networkEvidence:emptyNetwork(0),allowedNext:[],stopReason:'session_expired'});
const sha=(value:string)=>createHash('sha256').update(value).digest('hex');

/** SEMANTIC_BOUNDARY_ALLOW: 仅采结构/固定协议事实；由调用者选真实菜单，不以文案猜动作。 */
function inspectUi(args:{phase:Report['phase'];externalId:string;focus:Element|null}){
 type Internal={element:Element;rootElement:Element;candidate:Omit<Candidate,'targetRef'>;fingerprint:string};
 const ui:Report['ui']= {observationId:null,status:'unavailable',title:null,nodes:[],scannedNodes:0,truncated:false,groups:[],roots:[],coverage:{discoveryScope:'document_structure',scanScope:'selected_roots',discoveredRootsLowerBound:0,omittedRootsLowerBound:0,discoveryVisited:0,excludedSubtrees:0,discoveryComplete:false,scanComplete:false,limits:[]}};
 const entries:Internal[]=[];
 if(document.location.origin!=='https://creator.douyin.com'){ui.status='not_applicable';return {ui,entries};}
 const coverage=ui.coverage!;
 type RootRecord=NonNullable<Report['ui']['roots']>[number];
 type Root={element:Element;record:RootRecord;group:Candidate['group']|null};
 const roots:Root[]=[];
 const limit=(reason:typeof coverage.limits[number])=>{ui.truncated=true;if(!coverage.limits.includes(reason))coverage.limits.push(reason);};
 const started=performance.now();let exhausted=false;
 const seen=new Set<Element>();
 const visit=()=>{if(ui.scannedNodes>=2000||performance.now()-started>=50){limit(ui.scannedNodes>=2000?'node_limit':'time_limit');exhausted=true;return false;}ui.scannedNodes++;return true;};
 const roles=(el:Element)=>(el.getAttribute('role')??'').slice(0,128).trim().split(/\s+/);
 const role=(el:Element)=>roles(el)[0]??'';
 const short=(value:string)=>Array.from(value.slice(0,1024).replace(/(?:[a-z][a-z0-9+.-]*:\/\/|www\.|[?&][^\s=<>]+=[^\s<>]*)[^\s<>]*/gi,'[url]').replace(/\s+/gu,' ').trim()).slice(0,120).join('');
 const banned=new Set(['INPUT','TEXTAREA','SELECT','OPTION','SCRIPT','STYLE','TEMPLATE','NOSCRIPT','IFRAME','TABLE','ARTICLE','DIALOG']);
 const bannedRoles=new Set(['dialog','textbox','searchbox','combobox','spinbutton','feed','grid','row','rowgroup','cell','gridcell','tree','treeitem']);
 const hidden=(el:Element)=>{const s=getComputedStyle(el);return el.hasAttribute('hidden')||el.hasAttribute('inert')||el.getAttribute('aria-hidden')==='true'||s.display==='none'||s.visibility!=='visible'||s.opacity==='0';};
 const safe=(el:Element,nav:boolean)=>{
  let current:Element|null=el;
  for(let n=0;current&&n<32;n++,current=current.parentElement){
   if(!visit())return false;
   if(banned.has(current.tagName)||(current as HTMLElement).isContentEditable||hidden(current)||(current.getAttribute('role')??'').length>128||roles(current).some(value=>bannedRoles.has(value)))return false;
   if(!nav&&( ['UL','OL','LI'].includes(current.tagName)||roles(current).some(value=>['list','feed','listitem'].includes(value))))return false;
   if(current===document.documentElement)return true;
  }
  limit('depth_limit');return false;
 };
 // 只读取控件短标签；不汇总dialog/列表/表单正文，Range排除未参与布局的light DOM。
 const label=(el:Element,nav:boolean)=>{
  let text='';
  const walk=(root:Node,depth:number)=>{
   if(depth>8){limit('depth_limit');return;}
   for(let n=root.firstChild;n&&!exhausted;n=n.nextSibling){
    if(!visit())return;if(text.length>=1024){ui.truncated=true;return;}
    if(n.nodeType===Node.TEXT_NODE){const t=n as Text;const range=document.createRange();range.setStart(t,0);range.setEnd(t,Math.min(t.length,1024-text.length));const b=range.getBoundingClientRect();if(b.width&&b.height)text+=t.substringData(0,1024-text.length);}
    if(n.nodeType===Node.ELEMENT_NODE){const e=n as Element;if(banned.has(e.tagName)||['UL','OL','LI','DIALOG'].includes(e.tagName)||roles(e).some(v=>['dialog','list','listitem','listbox','option',...bannedRoles].includes(v))||!safe(e,nav))continue;walk(e,depth+1);}
   }
  };walk(el,0);return short(text);
 };
 const verifiedControls=(el:Element)=>{
  const control=el.getAttribute('aria-controls');if(!control||control.length>128||/\s/.test(control))return null;
  const target=document.getElementById(control);return target&&target!==el?target:null;
 };
 const navRoot=(el:Element)=>el.closest('nav,[role="navigation"]');
 const fingerprint=(el:Element)=>JSON.stringify([el.tagName,el.getAttribute('role'),el.getAttribute('href'),el.getAttribute('target'),el.getAttribute('aria-expanded'),el.getAttribute('aria-controls'),el.getAttribute('data-aweme-id'),el.getAttribute('data-item-id')]);
 const add=(el:Element,root:Root,quota:number)=>{
  const group=root.group!;const stats=ui.groups.find(item=>item.group===group)!;stats.scanned++;root.record.scanned++;
  if(seen.has(el))return;seen.add(el);
  if(!safe(el,group==='navigation'||group==='expanded'))return;
  const rect=el.getBoundingClientRect();if(!rect.width||!rect.height)return;
  let intent:Intent|null=null;
  const native=el.tagName.toLowerCase(),r=role(el),disabled=el.hasAttribute('disabled')||el.getAttribute('aria-disabled')==='true';
  const inForm=!!el.closest('form')||el.hasAttribute('form');
  const target=verifiedControls(el),nav=navRoot(el);
  const expanded=el.getAttribute('aria-expanded');
  let targetMatches:boolean|null=null;
  const rowId=el.getAttribute('data-aweme-id')??el.getAttribute('data-item-id');
  if(rowId!==null)targetMatches=rowId===args.externalId;
  const isLink=native==='a'&&el.hasAttribute('href');
  let allowedLink=false;
  if(isLink){try{const u=new URL(el.getAttribute('href')!,document.location.href);allowedLink=u.origin===document.location.origin&&u.pathname==='/creator-micro/interactive/comment'&&[...u.searchParams].every(([k,v])=>(k==='item_id'||k==='aweme_id')&&v===args.externalId)&&!u.hash;}catch{}}
  // SEMANTIC_BOUNDARY_ALLOW: anchor展开只允许无href或同页受控fragment；aria-controls不授权任意导航。
  const href=el.getAttribute('href');let expansionAnchor=href===null;
  if(href!==null){try{const u=new URL(href,document.location.href);expansionAnchor=u.origin===document.location.origin&&u.pathname===document.location.pathname&&u.search===document.location.search&&!u.username&&!u.password&&(href.trim()==='#'||(!!target&&u.hash==='#'+target.id));}catch{expansionAnchor=false;}}
  const dangerous=disabled||inForm||el.hasAttribute('download')||((el.getAttribute('target')??'_self')!=='_self')||el.getAttribute('type')==='submit';
  const controlsVerified=!!target&&!!nav&&navRoot(target)===nav;
  if(!dangerous){
   if((group==='navigation'||group==='expanded')&&allowedLink&&(args.phase==='home'||args.phase==='navigation'))intent='enter_comments';
   else if((group==='navigation'||group==='expanded')&&nav&&controlsVerified&&expanded==='false'&&(native==='button'||(native==='a'&&expansionAnchor)))intent='expand_navigation';
   else if(args.phase==='comments'&&native==='button'&&el.getAttribute('aria-haspopup')==='listbox'&&target&&role(target)==='listbox')intent='open_work_picker';
   else if(args.phase==='picker'&&group==='picker'&&r==='option'&&targetMatches===true&&el.closest('[role="listbox"]'))intent='select_target';
  }
  if(root.record.returned>=quota||entries.length>=24){stats.omitted++;root.record.omitted++;limit('candidate_limit');return;}
  const text=group==='picker'&&targetMatches!==true?'':label(el,group==='navigation'||group==='expanded');
  const ancestors:Candidate['ancestors']=[];for(let p=el.parentElement;p&&ancestors.length<8;p=p.parentElement){const pr=role(p);ancestors.push(p.tagName==='NAV'?'nav':pr==='navigation'?'navigation':pr==='listbox'?'listbox':pr==='dialog'?'dialog':p.tagName==='MAIN'||pr==='main'?'main':'other');}
  const tag=(['a','button','div','span','li','summary','h1','h2','h3'].includes(native)?native:'other') as Candidate['tag'];
  const publicRole=(['link','button','menuitem','tab','heading','status','alert','option'].includes(r)?r:native==='a'?'link':native==='button'?'button':/^h[1-6]$/.test(native)?'heading':'other') as Candidate['role'];
  const candidate:Internal['candidate']={rootRef:root.record.rootRef,group,tag,role:publicRole,text,buttonType:native==='button'?(['button','submit','reset'].includes(el.getAttribute('type')??'')?el.getAttribute('type') as 'button'|'submit'|'reset':'implicit'):'not_applicable',disabled,inForm,expanded:expanded==='true'?true:expanded==='false'?false:null,controlsVerified,
   targetMatches,rect:{x:rect.x,y:rect.y,width:rect.width,height:rect.height},ancestors,intent,unavailable:intent?null:dangerous?'unsafe_control':group==='picker'?'target_identity_unverified':'unsupported_control'};
  entries.push({element:el,rootElement:root.element,candidate,fingerprint:JSON.stringify([fingerprint(el),text,ancestors,group,controlsVerified,targetMatches])});stats.returned++;root.record.returned++;if(!intent){stats.unsupported++;root.record.unsupported++;}
 };
 // 全document只发现结构，不读取任意正文。发现和各root轮转共用visit/time总预算。
 const excluded=(el:Element,inNav:boolean)=>banned.has(el.tagName)||(el as HTMLElement).isContentEditable||hidden(el)||roles(el).some(value=>bannedRoles.has(value))||(!inNav&&(['UL','OL','LI'].includes(el.tagName)||roles(el).some(value=>['list','listitem'].includes(value))));
 function* walk(root:Element,depth=0,inNav=false,skipRoots=false,stopAtOption=false):Generator<Element>{
  if(exhausted||(!skipRoots&&coverage.discoveryVisited>=1000))return;
  // 裁剪转换也消耗预算；深层宽兄弟不能在一次next()里不受限遍历。
  if(depth>32){if(!skipRoots)coverage.discoveryVisited++;visit();limit('depth_limit');return;}
  const source=skipRoots?sourceOf(root):null;
  const focusBoundary=skipRoots&&roots.some(candidate=>candidate.element===root&&(candidate.record.kind==='expanded'||candidate.record.kind==='picker'));
  const originalNavSupplement=inNav&&!focusBoundary&&source!==null&&['native_aside','role_complementary','role_menu','role_menubar'].includes(source);
  // 包含省略/未选中的语义根，不能由父根冒领它的控件；保留原nav内补充区域的既有控件归属。
  if(skipRoots&&(knownRoots.has(root)||source)&&!originalNavSupplement){visit();return;}
  yield root;
  const withinNav=inNav||root.tagName==='NAV'||role(root)==='navigation';
  if(excluded(root,withinNav)){coverage.excludedSubtrees++;return;}
  if(stopAtOption&&role(root)==='option')return;
  for(let child=root.firstElementChild;child&&!exhausted&&(skipRoots||coverage.discoveryVisited<1000);child=child.nextElementSibling)yield* walk(child,depth+1,withinNav,skipRoots,stopAtOption);
 }

 const sourceOf=(el:Element):RootRecord['source']|null=>el.tagName==='NAV'?'native_nav':role(el)==='navigation'?'role_navigation':el.tagName==='MAIN'?'native_main':role(el)==='main'?'role_main':el.tagName==='ASIDE'?'native_aside':role(el)==='complementary'?'role_complementary':role(el)==='menu'?'role_menu':role(el)==='menubar'?'role_menubar':null;
 const knownRoots=new Set<Element>();
 const addRoot=(el:Element,source:RootRecord['source'],kind:RootRecord['kind'],group:Root['group'])=>{
  if(knownRoots.has(el))return;knownRoots.add(el);coverage.discoveredRootsLowerBound++;
  const maximum=kind==='navigation'?4:kind==='view'||kind==='supplementary'?2:1;
  if(roots.length>=8||roots.filter(root=>root.record.kind===kind).length>=maximum){coverage.omittedRootsLowerBound++;limit('root_limit');return;}
  const b=el.getBoundingClientRect();const native=el.tagName.toLowerCase(),r=role(el);
  const record:RootRecord={rootRef:'root-'+roots.length,scanStatus:'not_selected',source,kind,tag:(['nav','main','aside','div','ul','ol'].includes(native)?native:'other') as RootRecord['tag'],role:(['navigation','main','complementary','menu','menubar','listbox'].includes(r)?r:r?'other':'none') as RootRecord['role'],rect:{x:b.x,y:b.y,width:b.width,height:b.height},visited:0,scanned:0,returned:0,omitted:0,unsupported:0,controlCounts:{link:0,button:0,menuitem:0,tab:0,other:0}};
  roots.push({element:el,record,group});ui.roots!.push(record);
 };
 const focus=args.focus?.isConnected?args.focus:null;
 if(focus&&(args.phase==='navigation'||args.phase==='picker')&&safe(focus,args.phase==='navigation'))addRoot(focus,args.phase==='picker'?'work_picker':'aria_controls',args.phase==='picker'?'picker':'expanded',args.phase==='picker'?'picker':'expanded');
 const discovery=walk(document.documentElement);let discoveryDone=false;
 while(!exhausted&&coverage.discoveryVisited<1000){
  const next=discovery.next();if(next.done){discoveryDone=true;break;}if(!visit())break;coverage.discoveryVisited++;
  const el=next.value,source=sourceOf(el);if(!source)continue;
  const kind:RootRecord['kind']=source==='native_nav'||source==='role_navigation'?'navigation':source==='native_main'||source==='role_main'?'view':'supplementary';
  if(safe(el,kind==='navigation'))addRoot(el,source,kind,kind==='supplementary'?null:kind==='view'?'view':'navigation');
 }
 if(coverage.discoveryVisited>=1000)limit('discovery_limit');
 coverage.discoveryComplete=discoveryDone&&!exhausted&&coverage.discoveryVisited<1000&&!coverage.omittedRootsLowerBound&&!coverage.limits.includes('depth_limit');
 const hasNav=roots.some(root=>root.group==='navigation'),hasView=roots.some(root=>root.group==='view');
 ui.groups=[{group:'navigation',source:hasNav?'nav':'none',scanned:0,returned:0,omitted:0,unsupported:0},{group:'expanded',source:focus&&args.phase==='navigation'?'aria_controls':'none',scanned:0,returned:0,omitted:0,unsupported:0},{group:'view',source:hasView?'comment_view':'none',scanned:0,returned:0,omitted:0,unsupported:0},{group:'picker',source:focus&&args.phase==='picker'?'work_picker':'none',scanned:0,returned:0,omitted:0,unsupported:0}];
 const budgets:Record<Candidate['group'],number>={navigation:args.phase==='picker'?0:args.phase==='navigation'?4:16,expanded:args.phase==='navigation'?20:4,view:args.phase==='navigation'?0:4,picker:args.phase==='picker'?20:0};
 const category=(el:Element):keyof RootRecord['controlCounts']|null=>el.tagName==='A'?'link':el.tagName==='BUTTON'||role(el)==='button'?'button':role(el)==='menuitem'?'menuitem':role(el)==='tab'?'tab':el.tagName==='SUMMARY'?'other':null;
 const candidateOf=(el:Element)=>el.matches('a,button,summary,[role="button"],[role="menuitem"],[role="tab"],[role="heading"],[role="alert"],[role="status"],h1,h2,h3');
 const scans=roots.filter(root=>root.group===null||budgets[root.group]>0).map(root=>{
  const siblings=root.group===null?[]:roots.filter(other=>other.group===root.group);
  const index=siblings.indexOf(root),total=root.group===null?0:budgets[root.group];
  const quota=siblings.length?Math.floor(total/siblings.length)+(index<total%siblings.length?1:0):0;
  function* nodes():Generator<Element>{
   yield root.element;
   if(excluded(root.element,root.group==='navigation'||root.group==='expanded'))return;
   for(let child=root.element.firstElementChild;child&&!exhausted;child=child.nextElementSibling)yield* walk(child,1,root.group==='navigation'||root.group==='expanded',true,root.group==='picker');
  }
  return {root,quota,iterator:nodes(),done:false};
 });
 while(scans.some(scan=>!scan.done)&&!exhausted){for(const scan of scans){
  if(scan.done||exhausted)continue;const next=scan.iterator.next();if(next.done){scan.done=true;continue;}if(!visit())break;
  const el=next.value,root=scan.root;root.record.visited++;
  const inNav=root.group==='navigation'||root.group==='expanded';
  if(excluded(el,inNav))continue;
  const categoryName=category(el);
  if(root.group===null){if(categoryName&&safe(el,false)){const b=el.getBoundingClientRect();if(b.width&&b.height){root.record.controlCounts[categoryName]++;root.record.scanned++;root.record.unsupported++;}}continue;}
  if(categoryName)root.record.controlCounts[categoryName]++;
  if(root.group==='picker'&&role(el)==='option'){add(el,root,scan.quota);continue;}
  const unknown=inNav&&['DIV','SPAN'].includes(el.tagName)&&el.childElementCount===0;
  if(candidateOf(el)||unknown)add(el,root,scan.quota);
 }}
 for(const scan of scans)scan.root.record.scanStatus=scan.done&&!exhausted?'complete':'limited';
 coverage.scanComplete=!exhausted&&scans.every(scan=>scan.done)&&!coverage.limits.includes('depth_limit');
 ui.status='observed';
 const title=document.querySelector('title')?.firstChild;
 if(title?.nodeType===Node.TEXT_NODE)ui.title=short((title as Text).substringData(0,1024));
 return {ui,entries};
}

export function createCommentDiagnosisHost(ports:Ports):CommentDiagnosisHost {
 const now=ports.now??Date.now;
 type Token={handle:ElementHandle<Element>;root:ElementHandle<Element>;fingerprint:string;intent:Intent};
 type Session={identity:CommentDiagnosisIdentity;report:Report;context?:SessionContext;page?:Page;focus:ElementHandle<Element>|null;tokens:Map<string,Token>;abort:AbortController;idle?:ReturnType<typeof setTimeout>;life?:ReturnType<typeof setTimeout>;tail:Promise<unknown>;history:Map<string,Report>;counts:Map<Intent,number>;bodyReads:number;bodyBytes:number};
 const sessions=new Map<string,Session>();const occupied=new Map<string,string>();
 const ownerKey=(identity:CommentDiagnosisIdentity)=>JSON.stringify([identity.userId,identity.accountId]);
 const serial=<T>(s:Session,run:()=>Promise<T>):Promise<T>=>{const work=s.tail.then(run,run);s.tail=work.catch(()=>{});return work;};
 const invalidate=async(s:Session)=>{const tokens=[...s.tokens.values()];s.tokens.clear();await Promise.allSettled(tokens.flatMap(token=>[token.handle.dispose(),token.root.dispose()]));};
 const snapshot=(s:Session)=>clone(s.report);
 const close=async(s:Session,expired=false)=>{
  if(s.idle)clearTimeout(s.idle);if(s.life)clearTimeout(s.life);
  await invalidate(s);await s.focus?.dispose();s.focus=null;
  try{await s.context?.close();s.abort.abort();s.report.status=expired?'expired':'closed';s.report.phase='closed';s.report.stopReason=expired?'session_expired':'none';s.report.allowedNext=[];s.report.ui=emptyUi();if(occupied.get(ownerKey(s.identity))===s.report.diagnosisId)occupied.delete(ownerKey(s.identity));}
  catch{s.report.status='unknown';s.report.stopReason='resource_stop_unconfirmed';s.report.allowedNext=[];throw Error('诊断浏览器尚未确认关闭');}
 };
 const touch=(s:Session)=>{if(s.idle)clearTimeout(s.idle);s.idle=setTimeout(()=>{s.abort.abort();void serial(s,()=>close(s,true)).catch(()=>{});},ports.idleMs??90_000);s.idle.unref?.();};
 const acquire=async(s:Session)=>{
  await new Promise<void>((resolve,reject)=>{const abort=()=>reject(Error('诊断等待已取消'));s.abort.signal.addEventListener('abort',abort,{once:true});Promise.resolve().then(()=>{s.abort.signal.throwIfAborted();return ports.acquire();}).then(resolve,reject).finally(()=>s.abort.signal.removeEventListener('abort',abort));});
  s.abort.signal.throwIfAborted();
 };
 const inspect=async(s:Session)=>{
  let timedOut=false,timer:ReturnType<typeof setTimeout>|undefined;
  const work=s.page!.evaluateHandle(inspectUi,{phase:s.report.phase,externalId:s.identity.externalId,focus:s.focus});
  void work.then(handle=>{if(timedOut)void handle.dispose().catch(()=>{});},()=>{});
  try{return await Promise.race([work,new Promise<never>((_,reject)=>{timer=setTimeout(()=>{timedOut=true;reject(Error('observation deadline'));},1000);})]);}finally{if(timer)clearTimeout(timer);}
 };
 const observe=async(s:Session,allowActions=true)=>{
  await invalidate(s);s.report.generation++;s.report.ui=emptyUi();s.report.allowedNext=[];
  if(!s.page||s.page.isClosed())return;
  const tokens=new Map<string,Token>();let active=true,timer:ReturnType<typeof setTimeout>|undefined;
  const work=async()=>{
   const result=await inspect(s);
   try{
    const data=await result.evaluate(value=>({ui:value.ui,entries:value.entries.map(entry=>({candidate:entry.candidate,fingerprint:entry.fingerprint}))}));
    const refs=new Map((data.ui.roots??[]).map(root=>[root.rootRef,randomUUID()]));
    for(const root of data.ui.roots??[])root.rootRef=refs.get(root.rootRef)!;
    const entriesHandle=await result.getProperty('entries');
    try{
     for(const [index,entry] of data.entries.entries()){
      if(!active)throw Error('observation deadline');
      const entryHandle=await entriesHandle.getProperty(String(index));const property=await entryHandle.getProperty('element');const element=property.asElement() as ElementHandle<Element>|null;const rootProperty=await entryHandle.getProperty('rootElement');const rootElement=rootProperty.asElement() as ElementHandle<Element>|null;await entryHandle.dispose();
      let targetRef:string|null=null;
      if(element&&rootElement&&entry.candidate.intent&&allowActions&&active&&s.report.status!=='unknown'){targetRef=randomUUID();tokens.set(targetRef,{handle:element,root:rootElement,intent:entry.candidate.intent,fingerprint:entry.fingerprint});}
      else{await property.dispose();await rootProperty.dispose();}
      data.ui.nodes.push({...entry.candidate,rootRef:refs.get(entry.candidate.rootRef!),targetRef,intent:targetRef?entry.candidate.intent:null});
     }
    }finally{await entriesHandle.dispose();}
    while(Buffer.byteLength(JSON.stringify(data.ui))>12*1024&&data.ui.nodes.length){
     const node=data.ui.nodes.pop()!;if(node.targetRef){await tokens.get(node.targetRef)?.handle.dispose();await tokens.get(node.targetRef)?.root.dispose();tokens.delete(node.targetRef);}
     for(const stats of [data.ui.roots?.find(root=>root.rootRef===node.rootRef),data.ui.groups.find(group=>group.group===node.group)])if(stats){stats.returned=Math.max(0,stats.returned-1);stats.omitted++;if(node.unavailable)stats.unsupported=Math.max(0,stats.unsupported-1);}
     data.ui.truncated=true;if(data.ui.coverage&&!data.ui.coverage.limits.includes('output_limit'))data.ui.coverage.limits.push('output_limit');
    }
    if(!active)throw Error('observation deadline');
    data.ui.observationId=randomUUID();s.report.ui=data.ui;s.tokens=tokens;
    s.report.allowedNext=[...new Set(data.ui.nodes.flatMap(node=>node.intent?[node.intent]:[]))];
    if(s.report.status!=='unknown'){s.report.status=s.report.allowedNext.length?'awaiting_selection':data.ui.status==='observed'?'observed':'unavailable';s.report.stopReason=!allowActions?'publication_changed':s.report.allowedNext.length?'none':'navigation_unavailable';}
   }finally{await result.dispose();}
  };
  try{await Promise.race([work(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>{active=false;reject(Error('observation deadline'));},1000);})]);}
  catch{active=false;await Promise.allSettled([...tokens.values()].flatMap(token=>[token.handle.dispose(),token.root.dispose()]));tokens.clear();s.report.ui=emptyUi();s.report.allowedNext=[];if(s.report.status!=='unknown'){s.report.status='unavailable';s.report.stopReason='navigation_unavailable';}}
  finally{if(timer)clearTimeout(timer);}
 };
 // 每阶段监听自然响应，返回前冻结；下一阶段不会接收上一窗口迟到的JSON。
 const windowFor=(s:Session)=>{
  const network=emptyNetwork(s.report.revision);let active=true,inspections=0;
  const requests=new WeakSet<ReturnType<Response['request']>>();
  const onRequest=(request:ReturnType<Response['request']>)=>{if(active)requests.add(request);};const pending:Promise<void>[]=[];
  const queryAllowed=new Set(['item_id','aweme_id','cursor','offset','page','page_index','count','limit','sort']);
  const routeAllowed=new Set(['aweme','v1','v2','web','creator','pc','api','comment','comments','list','reply','interaction','user','info','item','work_list','search','query']);
  const onResponse=(response:Response)=>{
   if(!active)return;const request=response.request();if(!requests.has(request)||!['xhr','fetch'].includes(request.resourceType()))return;network.totalResponses++;
   let url:URL;try{url=new URL(response.url());}catch{network.omittedResponses++;return;}
   if(url.origin!==ORIGIN){network.omittedResponses++;network.truncated=true;return;}
   const ids=[...url.searchParams.getAll('aweme_id'),...url.searchParams.getAll('item_id')].filter(Boolean);
   const keys=[...new Set(url.searchParams.keys())];const status=response.status();
   const item:Report['networkEvidence']['items'][number]={responseCount:1,unknownShapeKeys:0,endpointRef:randomUUID(),pathHash:sha(url.origin+url.pathname),host:'creator',method:request.method()==='GET'?'GET':request.method()==='POST'?'POST':'OTHER',pathTemplate:'/'+url.pathname.split('/').filter(Boolean).slice(0,8).map(segment=>routeAllowed.has(segment)?segment:':opaque').join('/'),queryKeys:keys.filter(key=>queryAllowed.has(key)).slice(0,16) as Report['networkEvidence']['items'][number]['queryKeys'],unknownQueryKeys:keys.filter(key=>!queryAllowed.has(key)).length,status:status>=500?'5xx':status>=400?'4xx':status>=300?'3xx':status>=200?'2xx':'other',contentType:'unknown',oldMatcher:url.href.includes('/aweme/v1/web/comment/list/'),requestTargetPresent:ids.length>0,requestTargetMatches:ids.length?ids.every(id=>id===s.identity.externalId):null,bodyStatus:'unavailable',sampled:false,shape:[],rowTargetMatches:{matched:0,mismatched:0,unverified:0}};
   const previous=network.items.find(existing=>existing.pathHash===item.pathHash&&existing.method===item.method&&existing.status===item.status&&existing.requestTargetMatches===item.requestTargetMatches&&JSON.stringify(existing.queryKeys)===JSON.stringify(item.queryKeys)&&existing.unknownQueryKeys===item.unknownQueryKeys);
   if(previous){previous.responseCount++;previous.sampled=true;return;}
   if(network.items.length>=16){network.omittedResponses++;network.truncated=true;return;}
   network.items.push(item);
   if(status===429)void Promise.resolve(ports.throttled()).catch(()=>{});
   if(inspections>=8||s.bodyReads>=24){item.bodyStatus='budget';return;}inspections++;s.bodyReads++;
   const inspect=async()=>{
    const headers=await response.allHeaders();if(!active)return;
    item.contentType=/^application\/(?:[a-z.+-]*\+)?json(?:;|$)/i.test(headers['content-type']??'')?'json':'other';
    if(item.contentType!=='json')return;
    if(headers['content-encoding']&&headers['content-encoding']!=='identity'){item.bodyStatus='encoded';return;}
    const declared=Number(headers['content-length']);if(!headers['content-length']||!Number.isSafeInteger(declared)||declared<0)return;
    if(declared>128*1024){item.bodyStatus='too_large';return;}
    await response.finished();const sizes=await request.sizes();if(!active)return;
    // 实际已收字节+无编码共同证明读限，不能仅相信Content-Length或读完才截断。
    if(!Number.isSafeInteger(sizes.responseBodySize)||sizes.responseBodySize<0||sizes.responseBodySize>128*1024){item.bodyStatus='too_large';return;}
    if(sizes.responseBodySize!==declared)return;
    if(s.bodyBytes+sizes.responseBodySize>1024*1024){item.bodyStatus='budget';return;}s.bodyBytes+=sizes.responseBodySize;
    const bytes=await response.body();if(!active)return;if(bytes.length>128*1024){item.bodyStatus='too_large';return;}
    let json:unknown;try{json=JSON.parse(bytes.toString('utf8'));}catch{item.bodyStatus='invalid_json';return;}
    const allowed=['data','comments','comment_list','list','items','cid','comment_id','aweme_id','item_id','status_code','has_more','cursor','next_cursor','total'] as const;
    const walk=(value:unknown,path:typeof item.shape[number]['path'],depth:number)=>{
     if(depth>4||item.shape.length>=32){item.sampled=true;return;}
     const type=value===null?'null':Array.isArray(value)?'array':typeof value;
     if(!['null','array','object','string','number','boolean'].includes(type))return;
     if(path.length)item.shape.push({path,type:type as typeof item.shape[number]['type'],...(Array.isArray(value)?{count:value.length}:{})});
     if(Array.isArray(value)){
      item.sampled ||= value.length>3;
      for(const row of value.slice(0,3)){
       if(row&&typeof row==='object'&&!Array.isArray(row)){const obj=row as Record<string,unknown>;const rowIds=[obj.aweme_id,obj.item_id].filter(v=>typeof v==='string'||typeof v==='number').map(String);if(rowIds.length)item.rowTargetMatches[rowIds.every(v=>v===s.identity.externalId)?'matched':'mismatched']++;else item.rowTargetMatches.unverified++;}
       walk(row,path,depth+1);
      }
     }else if(value&&typeof value==='object'){item.unknownShapeKeys+=Object.keys(value).filter(key=>!allowed.includes(key as typeof allowed[number])).length;for(const key of allowed)if(Object.hasOwn(value,key))walk((value as Record<string,unknown>)[key],[...path,key],depth+1);}
    };walk(json,[],0);item.bodyStatus='observed';
   };
   pending.push(inspect().catch(()=>{if(active)item.bodyStatus='unavailable';}));
  };
  s.page!.on('request',onRequest);s.page!.on('response',onResponse);
  return async()=>{
   let timer:ReturnType<typeof setTimeout>|undefined;
   await Promise.race([Promise.allSettled(pending),new Promise<void>(resolve=>{timer=setTimeout(resolve,500);})]);if(timer)clearTimeout(timer);
   active=false;s.page!.off('request',onRequest);s.page!.off('response',onResponse);s.report.networkEvidence=clone(network);
  };
 };
 const runStage=async(s:Session,run:()=>Promise<void>,validate?:()=>Promise<boolean>)=>{
  const finish=windowFor(s);
  try{await acquire(s);if(validate&&!await validate()){s.report.stopReason='observation_stale';return;}s.report.dispatched=true;await run();await s.page!.waitForTimeout(ports.settleMs??1000);s.abort.signal.throwIfAborted();if(new URL(s.page!.url()).origin!==ORIGIN)throw Error('unsafe origin');}
  catch(error){s.report.status=s.report.dispatched?'unknown':'unavailable';s.report.stopReason=s.abort.signal.aborted?'deadline':(error as {name?:string})?.name==='DouyinCooldownActiveError'?'cooldown':'navigation_failed';}
  finally{await finish();}
 };
 return {
  identity:id=>sessions.get(id)?.identity,
  expired:id=>blank(id,now()),
  async start(identity){
   const existing=occupied.get(ownerKey(identity));if(existing){const result=blank(existing,now());result.publicationId=identity.publicationId;result.status='unavailable';result.stopReason='busy';return result;}
   for(const [oldId,old] of sessions){if(sessions.size<32)break;if(old.report.phase==='closed')sessions.delete(oldId);}
   const id=randomUUID(),report=blank(id,now());report.publicationId=identity.publicationId;report.phase='home';report.status='unavailable';report.stopReason='none';report.expiresAt=new Date(now()+(ports.lifeMs??300_000)).toISOString();
   const s:Session={identity,report,focus:null,tokens:new Map(),abort:new AbortController(),tail:Promise.resolve(),history:new Map(),counts:new Map(),bodyReads:0,bodyBytes:0};sessions.set(id,s);occupied.set(ownerKey(identity),id);
   s.life=setTimeout(()=>{s.abort.abort();void serial(s,()=>close(s,true)).catch(()=>{});},ports.lifeMs??300_000);s.life.unref?.();
   return serial(s,async()=>{
    const checkout=setTimeout(()=>s.abort.abort(),ports.checkoutMs??5000);
    try{s.context=await ports.open(identity,s.abort.signal);clearTimeout(checkout);s.page=await s.context.newPage();s.page.on('popup',popup=>{s.report.status='unknown';s.report.stopReason='unsafe_navigation';void popup.close().catch(()=>{});});s.page.on('download',download=>{s.report.status='unknown';s.report.stopReason='unsafe_navigation';void download.cancel().catch(()=>{});});
     s.report.revision=1;await runStage(s,async()=>{await s.page!.goto(HOME,{waitUntil:'domcontentloaded',timeout:15_000});});
     if(!s.report.dispatched){const reason=s.report.stopReason;await close(s);s.report.status='unavailable';s.report.stopReason=reason;}else{await observe(s);touch(s);}
    }catch{clearTimeout(checkout);s.report.status='unavailable';s.report.stopReason=s.abort.signal.aborted?'busy':'navigation_failed';const reason=s.report.stopReason;try{await close(s);s.report.status='unavailable';s.report.stopReason=reason;}catch{/* 已保留资源占用。 */}}
    return snapshot(s);
   });
  },
  async step(identity,input,options){
   const s=sessions.get(input.diagnosisId);if(!s)return blank(input.diagnosisId,now());
   if(s.identity.userId!==identity.userId||s.identity.accountId!==identity.accountId)throw Error('诊断会话不可访问');
   return serial(s,async()=>{
    if(input.action==='close'){try{await close(s);}catch{/* 返回unknown，不伪称已关闭。 */}return snapshot(s);}
    if(s.report.phase==='closed')return snapshot(s);
    touch(s);const key=sha(JSON.stringify(input));const previous=s.history.get(key);if(input.action==='advance'&&previous)return clone(previous);
    if(input.expectedRevision!==s.report.revision){const result=snapshot(s);result.stopReason='observation_stale';return result;}
    if(input.action==='observe'){await observe(s,options?.allowActions!==false);return snapshot(s);}
    const token=s.tokens.get(input.targetRef);
    if(s.report.status==='unknown'||input.observationId!==s.report.ui.observationId||!token||token.intent!==input.intent){const result=snapshot(s);result.stopReason='observation_stale';return result;}
    const limit=input.intent==='expand_navigation'?2:1;
    if((s.counts.get(input.intent)??0)>=limit){const result=snapshot(s);result.stopReason='limit_reached';return result;}
    // 重跑同一生产结构校验，并以DOM对象身份核对；旧handle仍连接不代表仍是获准控件。
    const revalidate=async()=>{
     try{const inspection=await inspect(s);
      try{return await inspection.evaluate((value,args)=>value.entries.some(entry=>entry.element===args.element&&entry.rootElement===args.root&&entry.candidate.intent===args.intent&&entry.fingerprint===args.fingerprint),{element:token.handle,root:token.root,intent:token.intent,fingerprint:token.fingerprint});}finally{await inspection.dispose();}
     }catch{return false;}
    };
    const valid=await revalidate();
    if(!valid){await invalidate(s);const result=snapshot(s);result.stopReason='observation_stale';return result;}
    s.report.revision++;s.counts.set(input.intent,(s.counts.get(input.intent)??0)+1);s.report.dispatched=false;
    let focus:ElementHandle<Element>|null=null;
    if(input.intent==='expand_navigation'||input.intent==='open_work_picker'){const h=await token.handle.evaluateHandle(el=>document.getElementById(el.getAttribute('aria-controls')??''));focus=h.asElement() as ElementHandle<Element>|null;if(!focus)await h.dispose();}
    await runStage(s,()=>token.handle.click({timeout:5000,noWaitAfter:true}),revalidate);
    await s.focus?.dispose();s.focus=focus;
    if(s.report.dispatched&&(s.report as Report).status!=='unknown')s.report.phase=input.intent==='expand_navigation'?'navigation':input.intent==='enter_comments'?'comments':input.intent==='open_work_picker'?'picker':'target';
    await observe(s);const result=snapshot(s);s.history.set(key,result);return result;
   });
  },
  async dispose(){const results=await Promise.allSettled([...sessions.values()].map(s=>{s.abort.abort();return serial(s,()=>close(s));}));if(results.some(result=>result.status==='rejected'))throw Error('诊断浏览器尚未确认关闭');},
 };
}
