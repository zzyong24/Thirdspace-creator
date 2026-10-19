'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const repo=path.resolve(__dirname,'../../../../../..');
const out=path.join(repo,'docs/verification/t1316/runs/local-performance-7790');fs.mkdirSync(out,{recursive:true});
const session=JSON.parse(fs.readFileSync('/private/tmp/t1300-candidate-v5ohn8/session.json'));
const binding=JSON.parse(fs.readFileSync(session.candidateBinding));
if(binding.sourceHead!=='7790be04ca16b65a8161c06c5943ba607e8ecd4d'||session.baseURL!=='http://127.0.0.1:64455')throw Error('BINDING_MISMATCH');
const save=(name,v)=>{const s=JSON.stringify(v,null,2)+'\n';if(s.includes(session.handshake))throw Error('PRIVATE_VALUE');fs.writeFileSync(path.join(out,name+'.json'),s);};
async function rpc(id,input={},groupId){const r=await fetch(session.baseURL+'/api/v1/dispatch',{method:'POST',headers:{'content-type':'application/json','x-creatoros-handshake':session.handshake,...(groupId?{'x-group-id':groupId}:{})},body:JSON.stringify({id,input}),signal:AbortSignal.timeout(900000)});const b=await r.json();if(!r.ok||b.success===false)throw Error('PUBLIC_REJECTED '+id+' '+r.status+' '+JSON.stringify(b));return b.data;}
async function once(name,operation,input,groupId){const file=path.join(out,name+'.json');if(fs.existsSync(file)){const v=JSON.parse(fs.readFileSync(file));if(v.status!=='DONE')throw Error('UNKNOWN_MANUAL_ACTION_NO_REPEAT '+name);return v.data;}save(name,{status:'STARTED',operation,input,startedAt:new Date().toISOString()});const data=await rpc(operation,input,groupId);save(name,{status:'DONE',operation,input,data,endedAt:new Date().toISOString()});return data;}
async function main(){
 if(process.argv.includes('--recover-group-readonly')){save('manual-group-readback',await rpc('accountGroups.list',{query:{page:1,pageSize:100}}));return;}
 const group=await once('manual-group','accountGroups.create',{body:{name:'本地性能手工样本',idempotencyKey:'t1316-local-performance-7790-group'}});const g=group.id;
 const project=await once('manual-project','projects.create',{body:{title:'本地性能中性样本',brief:'公开手工保存的测试稿件和黑底文字工程；不调用模型、不上传媒体。'}},g);const p=project.id;
 const outputs={};for(const type of ['video','article','image'])outputs[type]=await once('manual-output-'+type,'projects.outputs.create',{params:{projectId:p},body:{title:'手工'+type,contentType:type,clientRequestId:'local-perf-7790-'+type}},g);
 const artifact=await once('manual-script-artifact','artifacts.create',{params:{projectId:p},body:{title:'手工中性主稿',artifactType:'output_script',stage:'script',contentOutputId:outputs.video.id}},g);
 const contentText='这是一份手工保存的中性测试稿。\n用于观察工作面切换与编辑操作，不包含真实业务数据。\n正文修改后撤回，并读取实际保存版本。';
 await once('manual-script-version','artifacts.versions.create',{params:{artifactId:artifact.id},body:{contentText,contentData:{html:'<p>'+contentText.replace(/\n/g,'</p><p>')+'</p>',sections:[{id:'manual-section',heading:'手工稿',body:contentText}]},changeSummary:'公开手工性能样本'}},g);
 const a=await rpc('articles.get',{params:{outputId:outputs.article.id}},g);await once('manual-article-version','articles.versions.create',{params:{outputId:outputs.article.id},body:{expectedCurrentVersionId:a.currentVersionId,clientRequestId:'local-perf-7790-article-manual',document:{schemaVersion:1,title:'手工文章',summary:'中性测试摘要',sections:Array.from({length:12},(_,i)=>({sectionId:'manual-article-'+i,order:i,heading:'手工段落'+(i+1),headingLevel:2,body:'这段正文由测试者手工保存，用于预览、展开与滚动。'.repeat(8),sourceRefs:[]})),factItems:[],visualBriefs:[],imageUses:[]}}},g);
 const v=await rpc('graphicPosts.get',{params:{outputId:outputs.image.id}},g);await once('manual-graphic-version','graphicPosts.versions.create',{params:{outputId:outputs.image.id},body:{expectedCurrentVersionId:v.currentVersionId,clientRequestId:'local-perf-7790-graphic-manual',document:{schemaVersion:1,title:'手工图文',body:'中性图文正文，由测试者手工保存。'.repeat(40),summary:'手工图文摘要',tags:[],imageUses:[],sourceRefs:[],ruleSnapshotRef:null,cardBriefs:[{cardId:'manual-card-1',title:'本地文字卡',body:'未生成图片，只保留真实手工文字。',sourceRefs:[]}]}}},g);
 const settings=await rpc('settings.modelRouting.get',{},g),preferences=await rpc('settings.preferences.get',{},g);
 save('manual-fixture',{sourceHead:binding.sourceHead,candidateBinding:session.candidateBinding,baseURL:session.baseURL,group,project,outputs,artifactId:artifact.id,contentText,settings,preferences,provenance:'所有对象经原公开手工操作创建；无上传/模型/AI候选来源',createdAt:new Date().toISOString()});
 console.log(JSON.stringify({groupId:g,projectId:p,outputs:Object.fromEntries(Object.entries(outputs).map(([k,v])=>[k,v.id])),artifactId:artifact.id,settingsRevision:settings.revision,modelCalls:0}));
}
main().catch(e=>{save('setup-failure',{message:e.message,at:new Date().toISOString()});console.error(e.message);process.exitCode=1;});
