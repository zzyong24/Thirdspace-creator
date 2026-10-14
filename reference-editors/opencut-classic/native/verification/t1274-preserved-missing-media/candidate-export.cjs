const {chromium,expect}=require('/Users/zyongzhu/Workbase/Thirdspace-creator/frontend/node_modules/@playwright/test');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root='/tmp/creatoros-t1274-preview-isolated/apps/web/native-dist';
const proof='/tmp/t1274-native-degrade-proof';
const html=`<!doctype html><html><head><meta charset="UTF-8"><style>html,body{margin:0;background:#f8f9fc;font-family:system-ui;}#surface{display:block;width:100%;height:640px;}</style></head><body><div id="surface"><div slot="creatoros-transcript" data-creatoros-addon="transcript"><button>预览候选</button></div><div slot="creatoros-director" data-creatoros-addon="director"><textarea>保留草稿</textarea></div><div slot="creatoros-preview" data-creatoros-addon="preview" id="candidate"><button>返回当前剪辑</button></div></div><script type="module">import{mount}from'/native.js';const surface=document.querySelector('#surface'),shadow=surface.attachShadow({mode:'open'}),link=document.createElement('link');link.rel='stylesheet';link.href='/native.css';const container=document.createElement('div'),portal=document.createElement('div');shadow.append(link,container,portal);window.native=await mount(container,{workspaceAddons:true,owner:{groupId:'geometry-group',accountId:null,projectId:'geometry-project',outputId:'geometry-output',sourceVersionId:'geometry-version'},theme:{mode:'light',tokens:{'--creatoros-brand':'#6d4aff'},fontFamily:'system-ui',fontSize:'14px',density:'comfortable'},portalContainer:portal,signal:new AbortController().signal,onChanged(){},onError:console.error,importMedia:async()=>{throw Error('不执行素材注册')}});await window.native.request('load',{document:null,outputId:'geometry-output',title:'原生实际几何验收',media:[]});window.loaded=true;</script></body></html>`;
const server=http.createServer((req,res)=>{if(req.url==='/'){res.setHeader('Content-Type','text/html');res.end(html);return;}const name=req.url.split('?')[0].slice(1);if(!['native.js','native.css'].includes(name)){res.statusCode=404;res.end();return;}res.setHeader('Content-Type',name.endsWith('.js')?'application/javascript':'text/css');fs.createReadStream(path.join(root,name)).pipe(res);});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1000,height:700}});page.setDefaultTimeout(120000);const errors=[];page.on('pageerror',e=>errors.push(e.message));const results=[];
try{await page.goto(`http://127.0.0.1:${server.address().port}`);await page.waitForFunction(()=>window.loaded);
for(const kind of ['available-image-missing-overlay','missing-main-color','missing-main-text','missing-upload-audio','missing-main-transparent','missing-main-blur']){
 const result=await page.evaluate(async kind=>{
  const base=(await window.native.request('snapshot')).document;
  base.settings.canvasSize={width:64,height:64};base.settings.fps={numerator:24,denominator:1};base.settings.background={type:'color',color:'#2244cc'};
  const tracks=base.scenes[0].tracks;tracks.main.elements=[];tracks.overlay=[];tracks.audio=[];
  const common={startTime:0,duration:60000,trimStart:0,trimEnd:0,params:{},effects:[],masks:[]};
  const missing={...common,id:'missing',name:'旧缺失图层',type:'image',mediaId:'missing-image'};
  const canvas=document.createElement('canvas');canvas.width=64;canvas.height=64;const ctx=canvas.getContext('2d');ctx.fillStyle='#cc4422';ctx.fillRect(0,0,64,64);const image=await new Promise(r=>canvas.toBlob(r,'image/png'));const file=new File([image],'sample.png',{type:'image/png',lastModified:1});
  let media=[];
  if(kind==='available-image-missing-overlay'||kind==='missing-upload-audio'){
   tracks.main.elements=[{...common,id:'available',name:'真实可用图片',type:'image',mediaId:'present'}];media=[{mediaId:'present',assetId:'present-asset',assetFileId:'present-file',file,name:'sample.png',type:'image',size:file.size,lastModified:1,width:64,height:64}];
  }else tracks.main.elements=[missing];
  if(kind==='available-image-missing-overlay')tracks.overlay=[{id:'optional',name:'可选叠加',type:'video',hidden:false,elements:[missing]}];
  if(kind==='missing-upload-audio')tracks.audio=[{id:'missing-audio-track',name:'旧音轨',type:'audio',muted:false,elements:[{...common,id:'missing-audio',name:'旧缺失音频',type:'audio',sourceType:'upload',mediaId:'missing-audio',volume:0}]}];
  if(kind==='missing-main-text'){base.settings.background={type:'color',color:'transparent'};tracks.overlay=[{id:'text-track',name:'文字',type:'text',hidden:false,elements:[{...common,id:'text',name:'真实文字',type:'text',params:{content:'OK',fontSize:36,fontFamily:'Arial',color:'#ffffff',textAlign:'center',fontWeight:'normal',fontStyle:'normal',textDecoration:'none',letterSpacing:0,lineHeight:1.2,'background.enabled':false,'transform.positionX':0,'transform.positionY':0,'transform.scaleX':1,'transform.scaleY':1,'transform.rotate':0,opacity:1}}]}];}
  if(kind==='missing-main-transparent')base.settings.background={type:'color',color:'transparent'};
  if(kind==='missing-main-blur')base.settings.background={type:'blur',blurIntensity:10};
  await window.native.request('load',{document:base,outputId:'geometry-output',title:kind,media});const before=JSON.stringify((await window.native.request('snapshot')).document.scenes[0].tracks);
  const context=await window.native.request('context'),scene=context.document.scenes[0];
  const canonical=value=>Array.isArray(value)?'['+value.map(canonical).join(',')+']':value&&typeof value==='object'?'{'+Object.keys(value).sort().filter(k=>value[k]!==undefined).map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}':JSON.stringify(value);
  const digest=async value=>'sha256:'+Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical(value)))),b=>b.toString(16).padStart(2,'0')).join('');
  let out;try{out=await window.native.request('preview-scene',{owner:{groupId:'geometry-group',accountId:null,projectId:'geometry-project',outputId:'geometry-output',sourceVersionId:'geometry-version'},targetSceneId:scene.id,baseContextEpoch:context.contextEpoch,beforeDigest:await digest(scene.tracks),candidateDigest:await digest(scene),tracks:scene.tracks,media});}catch(error){if(kind==='missing-main-transparent'||kind==='missing-main-blur'){if(!error.message.includes('没有可预览的画面'))throw error;return{kind,expectedNoVisual:true,error:error.message};}throw error;}
  if(!out.warnings?.length||out.warnings[0].code!=='preserved_missing_media')throw Error('缺少真实降级警告');
  const bytes=Array.from(new Uint8Array(await out.blob.arrayBuffer()));
  const after=JSON.stringify((await window.native.request('snapshot')).document.scenes[0].tracks);
  return {kind,bytes,tracksPreserved:before===after,mime:out.blob.type,warnings:out.warnings};
 },kind);if(result.bytes)fs.writeFileSync(path.join(proof,`candidate-${kind}.mp4`),Buffer.from(result.bytes));results.push({...result,bytes:result.bytes?.length});}
 console.log(JSON.stringify({status:'PUBLIC_PREVIEW_PRESERVED_MISSING_REAL_MP4',results,errors},null,2));
}finally{fs.writeFileSync(path.join(proof,'candidate-export.json'),JSON.stringify({results,errors},null,2));await browser.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exitCode=1;server.close()});
