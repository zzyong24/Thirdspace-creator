'use strict';
// 人工中性前置；只在实际绑定后由主driver调用。导入/collection无副作用。
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{repo,validate}=require('./contract.cjs');
const imagePath=path.join(repo,'docs/verification/t1314/runs/resumed-7790/image/neutral-input.png'),imageSha256='2a748e75ed4513a49fdf9072a549add1dcda06099286cb76be44975bc127b1df';
const profile={persona:'本轮隔离人工测试资料',field:'资料记录与来源核对',audience:'希望把观察和猜测分开的人',differentiation:'只使用本轮公开来源和中性图样，不编效果数字',capabilities:['按顺序说明已保存材料'],facets:{contentScope:'本轮公开资料与中性图形',avoid:'未经来源支持的数字与案例'},downstreamRules:{forbidRule:'不得把人工RSS摘要称为ASR全文或新近新闻'}};
const statement={oneLiner:'用公开资料说明如何保留来源并区分观察与猜测',keywords:['资料','来源','记录'],productAnchorIds:[],changeReason:'本轮隔离人工定位，非AI生成候选'};
function sourceBody(url,key){return{collectionId:null,type:'rss',config:{type:'rss',url},displayName:'本轮公开RSS独立采集来源',monitorEnabled:false,runInitial:false,idempotencyKey:key};}
function planned(){return[
 ['positioning.profile.upsert',{body:profile}],['positioning.statements.create',{body:statement}],
 ['intelligence.sources.create',{body:sourceBody('https://www.rssboard.org/files/sample-rss-2.xml','collection-only-source')}],
 ['assets.uploads.create',{body:{assetType:'image',mimeType:'image/png',fileSize:123,fileName:'本轮中性图形关系图.png'}}],
 ['assets.uploads.complete',{params:{uploadId:'collection-upload'},body:{name:'本轮中性图形关系图'}}],
 ['intelligence.transcripts.uploadManual',{body:{itemId:'collection-item',inputMode:'paste',text:'人工来源摘要，非ASR全文或新近新闻。此处仅供离线合同核对，不创建实体。'}}]
];}
function collect(){for(const[id,input]of planned())validate(id,input);return{state:'OFFLINE_CONTRACTS_ONLY',sessionRead:false,databaseOpened:false,networkRequests:0,modelSubmissions:0,operations:planned().map(x=>x[0]),imagePath,imageSha256};}
async function prepare(h,deadline){
 const before=await h.inventory(deadline);h.save('fixture/before-task-inventory',before);
 const image=fs.readFileSync(imagePath);assert.equal(h.sha(image),imageSha256);assert.equal(image.readUInt32BE(16),960);assert.equal(image.readUInt32BE(20),540);
 const p=await h.once('fixture-profile','positioning.profile.upsert',{body:profile},deadline),s=await h.once('fixture-statement','positioning.statements.create',{body:statement},deadline);
 const source=await h.once('fixture-source','intelligence.sources.create',{body:sourceBody(h.b.publicSources.rssUrl,h.b.intents.collect+'-source')},deadline);
 const asset=await h.upload(image,'本轮中性图形关系图',deadline);assert.equal(asset.status,'active');assert.equal(asset.assetType,'image');assert(asset.currentFileId);
 const after=await h.inventory(deadline),beforeAi=new Set(before.ai.map(t=>t.id)),beforeExec=new Set(before.execution.map(t=>t.id));
 const observedEffects={ai:after.ai.filter(t=>!beforeAi.has(t.id)),execution:after.execution.filter(t=>!beforeExec.has(t.id))};
 h.save('fixture/public-readback',{profile:p,statement:s,source,asset,imageSha256,observedEffects,automaticTasksAreRecordedNotAssumedZero:true,createdThrough:'PUBLIC_USER_MANUAL_INPUT_NO_AI_CANDIDATE_SEED',at:new Date().toISOString()});
 return{profile:p,statement:s,source,asset,imageSha256,observedEffects,sourceDidNotAutoStart:source.run===null&&source.task===null};
}
module.exports={prepare,collect,planned,imagePath,imageSha256,profile,statement,sourceBody};
