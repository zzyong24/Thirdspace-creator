#!/bin/zsh
set -eu
observation_file=$(mktemp /tmp/t1110-scope-observation.XXXXXX)
trap 'rm -f "$observation_file"' EXIT
ego-browser nodejs > "$observation_file" 2>&1 <<'BROWSER'

const task=await taskSpace(20);
if(task.ownership!=='agent')throw new Error('原空间未交还');
const page=task.page('p6');
const result=await page.cdp('Runtime.evaluate',{
 expression:  `(() => {
  const count=(root,text,native=false)=>Array.from(native?Document.prototype.querySelectorAll.call(root,'span,a,button,label'):root.querySelectorAll('span,a,button,label')).filter(n=>n.textContent.trim()===text).length;
  const visible=n=>{const s=getComputedStyle(n),r=n.getBoundingClientRect();return s.display!=='none'&&s.visibility!=='hidden'&&r.width>0&&r.height>0;};
  const labels=['全部视频','单篇视频','下载表格'];
  const hosts=Array.from(document.querySelectorAll('wujie-app')).filter(visible);
  const shadow=hosts.length===1&&hosts[0].shadowRoot;
  const frames=Array.from(document.querySelectorAll('iframe')).flatMap(n=>{try{const u=new URL(n.contentWindow.location.href);if(u.origin===location.origin&&u.pathname==='/micro/statistic/post'){const d=n.contentDocument;return [{path:u.pathname,visible:visible(n),display:getComputedStyle(n).display,nativeCounts:labels.map(t=>count(d,t,true)),proxyCounts:labels.map(t=>count(d,t)),nativeBodyLength:(Document.prototype.querySelector.call(d,'body')?.innerText||'').length,proxyBodyLength:(d.body?.innerText||'').length,proxyLabelsBelongToVisibleShadow:!!shadow&&labels.every(t=>Array.from(d.querySelectorAll('span,a,button,label')).filter(n=>n.textContent.trim()===t).every(n=>shadow.contains(n))),nativeLabelRootMatchesVisibleShadow:!!shadow&&labels.every(t=>Array.from(d.querySelectorAll('span,a,button,label')).filter(n=>n.textContent.trim()===t).every(n=>Node.prototype.getRootNode.call(n)===shadow))}];}return [];}catch{return [];}});
  return {officialOrigin:location.origin==='https://channels.weixin.qq.com',path:location.pathname==='/platform/statistic/post'?'/platform/statistic/post':'other',readyState:document.readyState,visibleWujieHosts:hosts.length,shadowMode:shadow?.mode||null,shadowCounts:shadow?labels.map(t=>count(shadow,t)):[],shadowVisibleCounts:shadow?labels.map(t=>Array.from(shadow.querySelectorAll('span,a,button,label')).filter(n=>n.textContent.trim()===t&&visible(n)).length):[],frames};
 })()`,returnByValue:true,timeout:120000
},{timeout:150000});
if(result.exceptionDetails)throw new Error('只读DOM查询异常');
console.log(JSON.stringify({observedAt:new Date().toISOString(),space:20,page:'p6',ownership:task.ownership,method:'CDP Runtime.evaluate in parent main realm; native Document prototype versus Wujie-proxied iframe document',runtimeTimeoutMs:120000,requestTimeoutMs:150000,value:result.result.value}));

BROWSER
node tools/verification/t1110-scope-check.mjs "$observation_file"
