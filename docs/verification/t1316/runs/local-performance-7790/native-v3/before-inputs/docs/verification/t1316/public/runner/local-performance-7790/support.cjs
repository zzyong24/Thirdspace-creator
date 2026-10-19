'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{createRequire}=require('node:module');
const repo=path.resolve(__dirname,'../../../../../..'),baseOut=path.join(repo,'docs/verification/t1316/runs/local-performance-7790'),out=process.env.T1316_PERF_RUN?path.join(baseOut,process.env.T1316_PERF_RUN):baseOut;fs.mkdirSync(out,{recursive:true});
const session=JSON.parse(fs.readFileSync('/private/tmp/t1300-candidate-v5ohn8/session.json'));
const binding=JSON.parse(fs.readFileSync(session.candidateBinding));
if(binding.sourceHead!=='7790be04ca16b65a8161c06c5943ba607e8ecd4d'||session.baseURL!=='http://127.0.0.1:64455')throw Error('NEW_CANDIDATE_REQUIRED');
const data=JSON.parse(fs.readFileSync(path.join(baseOut,'manual-fixture.json'))),req=createRequire(path.join(repo,'frontend/package.json')),pw=req('@playwright/test');
const save=(name,v)=>{const p=path.join(out,name.endsWith('.json')?name:name+'.json');fs.mkdirSync(path.dirname(p),{recursive:true});const s=JSON.stringify(v,null,2)+'\n';if(s.includes(session.handshake))throw Error('PRIVATE_VALUE');fs.writeFileSync(p,s);};
async function rpc(id,input={}){const r=await fetch(session.baseURL+'/api/v1/dispatch',{method:'POST',headers:{'content-type':'application/json','x-creatoros-handshake':session.handshake,'x-group-id':data.group.id},body:JSON.stringify({id,input}),signal:AbortSignal.timeout(900000)});const b=await r.json();if(!r.ok||b.success===false)throw Error('PUBLIC_REJECTED '+id+' '+r.status+' '+JSON.stringify(b));return b.data;}
async function open(stage='script'){
 const context=await pw.chromium.launchPersistentContext('',{headless:true,channel:'chromium',timeout:180000,baseURL:session.baseURL,viewport:{width:1440,height:1000},extraHTTPHeaders:{'x-creatoros-handshake':session.handshake}});context.setDefaultTimeout(120000);context.setDefaultNavigationTimeout(300000);
 await context.addCookies([{name:'creatoros_current_group',value:encodeURIComponent(data.group.id),url:session.baseURL}]);
 await context.addInitScript(({g,t})=>{window.__CREATOROS_HANDSHAKE_TOKEN__=t;localStorage.setItem('creatoros:current-group',g);localStorage.removeItem('creatoros:current-account');localStorage.setItem('creatoros:onboarding:hidden','1');},{g:data.group.id,t:session.handshake});
 const contextTag=Date.now()+'-'+crypto.randomBytes(3).toString('hex'),denied=[],ops=[];await context.route('**/*',async route=>{const q=route.request(),url=new URL(q.url());if(['data:','blob:','about:'].includes(url.protocol))return route.continue();let operation=null;try{operation=q.postDataJSON()?.id;}catch{}
 if(url.origin!==session.baseURL||url.pathname==='/api/chat'||(operation&&(/\.generate$|\.retry$|^ai\.tasks\.create$|^execution\.tasks\.create$|^creativeResults\.(generate|retry)$|^assets\.uploads\./.test(operation)))){denied.push({method:q.method(),path:url.pathname,operation});save('denied-model-requests',denied);return route.abort('blockedbyclient');}
 if(operation)ops.push({operation,method:q.method(),at:new Date().toISOString()});return route.continue();});
 const page=context.pages()[0]??await context.newPage();
 const url=stage==='production'?`/projects/${data.project.id}/production?outputId=${data.outputs.video.id}`:stage==='script'?`/projects/${data.project.id}`:stage==='article'?`/projects/${data.project.id}/article?outputId=${data.outputs.article.id}`:stage==='image'?`/projects/${data.project.id}/image?outputId=${data.outputs.image.id}`:`/projects/${data.project.id}/review`;
 await page.goto(url);
 return {page,context,denied,ops,close:async()=>{save('network/'+contextTag,{denied,ops,sourceHead:binding.sourceHead,baseURL:session.baseURL,groupId:data.group.id});save('last-safe-network',{denied,ops});await context.close();if(denied.length)throw Error('UNEXPECTED_MODEL_OR_FOREIGN_REQUEST_BLOCKED');}};
}
module.exports={repo,out,session,binding,data,pw,rpc,save,open};
