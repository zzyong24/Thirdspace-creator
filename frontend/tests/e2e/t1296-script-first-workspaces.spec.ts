import {test,expect as baseExpect,type Page} from '@playwright/test';
import {randomUUID,createHash} from 'node:crypto';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {ENDPOINTS} from '@creatoros/contract';
import {unzipSync,strFromU8} from 'fflate';
import {resolve} from 'node:path';
// 本轮历史像素基线由系统 Chrome 生成；固定同一浏览器，避免跨编码器逐帧对比。
test.use({channel:'chrome'});
const expect=baseExpect.configure({timeout:120_000});
const evidence=resolve('../docs/verification/t1296',process.env.T1296_EVIDENCE_RUN??'browser');
async function rpc<T>(page:Page,id:string,input:unknown,groupId?:string):Promise<T>{
 const r=await page.request.post('/api/v1/dispatch',{timeout:180_000,headers:{...(groupId?{'x-group-id':groupId}:{})},data:{id,input}});
 expect(r.ok(),`${id}: ${r.status()} ${await r.text()}`).toBe(true);return (await r.json()).data;
}
test('脚本是原稿，两个平台默认承接并保持独立，稿面只保留重组主动作',async({page,context,baseURL})=>{
 test.setTimeout(1_200_000);page.setDefaultTimeout(120_000);page.setDefaultNavigationTimeout(180_000);mkdirSync(evidence,{recursive:true});
 const group=await rpc<{id:string}>(page,'accountGroups.create',{body:{name:`内容验收-${randomUUID()}`,idempotencyKey:randomUUID()}});
 await context.addCookies([{name:'creatoros_current_group',value:encodeURIComponent(group.id),url:baseURL!}]);
 await page.addInitScript(id=>{localStorage.setItem('creatoros:current-group',id);localStorage.removeItem('creatoros:current-account');},group.id);
 const project=await rpc<{id:string}>(page,'projects.create',{body:{title:'一份原稿，多种表达',brief:'把做事过程写清楚，让读者能照着完成。',contentType:'article',targetPlatforms:['wechatOfficialAccount','xiaohongshu']}},group.id);
 const script=await rpc<{id:string}>(page,'artifacts.create',{params:{projectId:project.id},body:{title:'原稿',artifactType:'output_script',stage:'script'}},group.id);
 const text='先把要解决的问题写下来。\n\n今天我用同一份原稿整理公众号和图文。公众号展开讲清楚过程，图文让每一页只说一件事。两种表达可以分别调整，但原稿始终保留。';
 await rpc(page,'artifacts.versions.create',{params:{artifactId:script.id},body:{contentText:text,changeSummary:'保存原稿'}},group.id);
 const article=await rpc<{id:string}>(page,'projects.outputs.create',{params:{projectId:project.id},body:{title:'公众号成稿',contentType:'article',clientRequestId:randomUUID()}},group.id);
 const graphic=await rpc<{id:string}>(page,'projects.outputs.create',{params:{projectId:project.id},body:{title:'图文成稿',contentType:'image',clientRequestId:randomUUID()}},group.id);
 const paths=[['article',`/projects/${project.id}/article?outputId=${article.id}`],['graphic',`/projects/${project.id}/outputs/${graphic.id}/image`]] as const;
 for(const [kind,path]of paths){
  await page.setViewportSize({width:1366,height:900});await page.goto(path);const main=page.locator(`[data-page="${kind==='article'?'article':'graphic-post'}-workbench"]`);await expect(main).toBeVisible();
  if(process.env.T1296_CAPTURE_BASELINE!=='1')await expect(main.getByRole('button',{name:kind==='article'?'复制公众号文章':'导出分页 ZIP',exact:true})).toBeEnabled();
  await page.screenshot({path:resolve(evidence,`${kind}-1366.png`),fullPage:true});
 }
 if(process.env.T1296_CAPTURE_BASELINE==='1')return;
 for(const [kind,path]of paths){
  await page.goto(path);const main=page.locator(`[data-page="${kind==='article'?'article':'graphic-post'}-workbench"]`);await expect(main.getByRole('button',{name:'重新组织内容',exact:true})).toBeEnabled();
  await expect(main.getByRole('textbox')).toHaveCount(0);
  await expect(main.getByRole('button',{name:kind==='article'?'复制公众号文章':'导出分页 ZIP',exact:true})).toBeEnabled();
  await page.setViewportSize({width:1280,height:800});await page.screenshot({path:resolve(evidence,`${kind}-1280.png`),fullPage:true});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 }
 for(const [kind,path] of paths){
  await page.goto(path);const main=page.locator(`[data-page="${kind==='article'?'article':'graphic-post'}-workbench"]`);
  await expect(main.getByRole('button',{name:kind==='article'?'复制公众号文章':'导出分页 ZIP',exact:true})).toBeEnabled();
  await main.getByText('更多导出',{exact:true}).click();
  const downloadPromise=page.waitForEvent('download',{timeout:180_000});
  await main.getByRole('button',{name:kind==='article'?'导出 HTML':'导出原图与配文',exact:true}).click();
  const download=await downloadPromise;await download.saveAs(resolve(evidence,kind==='article'?'article.html':'graphic.zip'));
  const saved=await rpc<any>(page,kind==='article'?'articles.get':'graphicPosts.get',{params:{outputId:kind==='article'?article.id:graphic.id}},group.id);
  expect(kind==='article'?saved.current.sections[0].body:saved.current.body).toBe(text);
  await page.reload();await expect(page.getByText('当前成稿已保存',{exact:true})).toBeVisible();
 }
 expect(readFileSync(resolve(evidence,'article.html'),'utf8')).toContain('先把要解决的问题写下来');
 const zipped=unzipSync(readFileSync(resolve(evidence,'graphic.zip')));expect(strFromU8(zipped['配文.txt']!)).toContain(text);
 const articleSaved=await rpc<any>(page,'articles.get',{params:{outputId:article.id}},group.id);
 const changed={...articleSaved.current,sections:articleSaved.current.sections.map((section:any,index:number)=>index===0?{...section,body:'公众号独立成稿，保留原意并展开过程。'}:section)};
 await rpc(page,'articles.versions.create',{params:{outputId:article.id},body:{expectedCurrentVersionId:articleSaved.currentVersionId,document:changed,clientRequestId:randomUUID()}},group.id);
 await rpc(page,'artifacts.versions.create',{params:{artifactId:script.id},body:{contentText:'后续更新的脚本原稿。',changeSummary:'更新原稿'}},group.id);
 await page.goto(paths[0][1]);await expect(page.getByRole('button',{name:'复制公众号文章',exact:true})).toBeEnabled();
 const after=await rpc<any>(page,'articles.get',{params:{outputId:article.id}},group.id);expect(after.current.sections[0].body).toBe(changed.sections[0].body);expect(after.scriptContext.scriptText).toBe('后续更新的脚本原稿。');
 const other=await rpc<any>(page,'graphicPosts.get',{params:{outputId:graphic.id}},group.id);expect(other.current.body).toBe(text);
 const versions=await rpc<any[]>(page,'artifacts.versions.list',{params:{artifactId:script.id},query:{page:1,pageSize:20}},group.id);expect(versions.find(version=>version.id===after.scriptContext.scriptRef.versionId)?.contentText).toBe('后续更新的脚本原稿。');expect(versions.some(version=>version.contentText===text)).toBe(true);
 const legacy={...after.current,nativeLayout:{schemaVersion:1,editor:'doocs-md',editorCommit:'a7c17fc4cda92e3c13aa7e24f06615cfa4219b31',themeId:'default',themeSettings:{},customCss:'',exportOptions:{useIndent:false,useJustify:false}}};
 await rpc(page,'articles.versions.create',{params:{outputId:article.id},body:{expectedCurrentVersionId:after.currentVersionId,document:legacy,clientRequestId:randomUUID()}},group.id);
 await page.reload();await expect(page.getByLabel('原版式成稿预览').getByText('公众号独立成稿，保留原意并展开过程。')).toBeVisible();await expect(page.getByRole('button',{name:'复制公众号文章',exact:true})).toBeEnabled();
 await page.screenshot({path:resolve(evidence,'article-legacy-doocs.png'),fullPage:true});const legacyDownload=page.waitForEvent('download',{timeout:180_000});await page.getByRole('button',{name:'导出 HTML + 图片 ZIP',exact:true}).click();await(await legacyDownload).saveAs(resolve(evidence,'article-legacy.zip'));
 const legacySaved=await rpc<any>(page,'articles.get',{params:{outputId:article.id}},group.id),legacyFiles=unzipSync(readFileSync(resolve(evidence,'article-legacy.zip')));expect(JSON.parse(strFromU8(legacyFiles['manifest.json']!)).versionId).toBe(legacySaved.currentVersionId);expect(strFromU8(legacyFiles['index.html']!)).toContain('公众号独立成稿');

});

const root=resolve('../docs/verification/t1296',process.env.T1296_NATIVE_RUN??'native-browser');
const panelName=process.env.T1296_PRECHANGE==='1'?'素材/转录':'素材与属性';
const dispatch=rpc<any>;
// 相同源、相同裁切区间的本次改动前 HEAD 生产内核实物基线。更早 T1274 像素不等的失败保留于首轮日志。
// AAC容器尾样本不代替视频/时间轴时长；严格核48帧/PTS/画面及完整PCM，不扩大容差。
function compareLegacyMedia(path:string,sourceSha:string,decoded:any){
 const baseline=resolve('../docs/verification/t1296/native-prechange/candidate-preview.mp4'),input=JSON.parse(readFileSync(resolve('../docs/verification/t1296/native-prechange/input.json'),'utf8'));
 expect(input.sourceSha256).toBe(sourceSha);expect(input.document.settings.fps).toEqual({numerator:24,denominator:1});
 const legacy=JSON.parse(execFileSync('ffprobe',['-v','error','-show_format','-show_streams','-of','json',baseline],{encoding:'utf8',timeout:120_000}));
 const video=decoded.streams.find((stream:any)=>stream.codec_type==='video');expect(Number(video.duration)).toBe(2);expect(Number(video.nb_frames)).toBe(48);expect(video.avg_frame_rate).toBe('24/1');
 const frameHashes=(file:string)=>execFileSync('ffmpeg',['-v','error','-i',file,'-map','0:v:0','-an','-fps_mode','passthrough','-f','framemd5','-'],{encoding:'utf8',timeout:120_000,maxBuffer:16*1024*1024}).split('\n').filter(line=>line.startsWith('#tb')||line.trim()&&!line.startsWith('#')).map(line=>line.trim());
 const audio=(file:string)=>execFileSync('ffmpeg',['-v','error','-i',file,'-map','0:a:0','-vn','-c:a','pcm_f32le','-f','f32le','-'],{timeout:120_000,maxBuffer:16*1024*1024});
 expect(frameHashes(path)).toEqual(frameHashes(baseline));expect(audio(path).equals(audio(baseline))).toBe(true);expect(Number(decoded.format.duration)).toBe(Number(legacy.format.duration));
 return{oldKernel:input.oldCommit,oldKernelSha256:input.oldKernelSha256,videoFramesEqual:true,audioPcmEqual:true,containerDurationEqual:true,videoDuration:2,containerDuration:Number(decoded.format.duration)};
}
test(process.env.CREATOROS_T1274_PREVIEW_DIAGNOSTIC==='1'?'仅候选完整媒体取证：不采纳、不导出工程':'T1296 全高助手布局保持真实剪辑候选、保存刷新与MP4交付',async({page,baseURL},info)=>{
 // 外层覆盖本旅程原900秒原生请求的串行阶段、480秒原片观察、120秒媒体命令及清理；内层和原任务期限不变。
 test.setTimeout(14_400_000);page.setDefaultTimeout(120_000);page.setDefaultNavigationTimeout(120_000);mkdirSync(root,{recursive:true});
 if(process.env.T1296_PRECHANGE==='1'){for(const name of ['native.js','native.css'])await page.route(`**/reference-editors/opencut-classic/native/${name}*`,route=>route.fulfill({path:resolve('/tmp/t1296-prechange-native',name),contentType:name.endsWith('.js')?'text/javascript':'text/css'}));}
 if(process.env.T1296_CAPTURE_NATIVE==='1')await page.route('**/reference-editors/opencut-classic/native/native.js*',async route=>{const response=await route.fetch(),code=await response.text();const found=code.match(/export\s*\{\s*(\w+) as mount\s*\};?\s*$/);expect(found).not.toBeNull();await route.fulfill({response,body:code.replace(found![0],`export async function mount(...args){const handle=await ${found![1]}(...args);window.__t1296Native=handle;return handle;}`)});});
 const bytes=readFileSync(resolve('../docs/verification/t1296/fixtures/source.mp4')),sourceSha=createHash('sha256').update(bytes).digest('hex');
 const resumePath=process.env.CREATOROS_T1274_RESUME;
 const resume=resumePath?JSON.parse(readFileSync(resumePath,'utf8')):null;
 let group:any,project:any,output:any,asset:any,saved:any,mediaId:string,source:any;
 const work=page.getByRole('region',{name:'视频剪辑工作台'}),native=page.locator('[data-native-root="opencut"]');
 if(resume){
  expect(process.env.CREATOROS_PLAYWRIGHT_DATA_ROOT).toBe(resume.isolatedRoot);
  group={id:resume.groupId};project={id:resume.projectId};output={id:resume.outputId};asset={id:resume.assetId,currentFileId:resume.assetFileId};
  await page.context().addCookies([{name:'creatoros_current_group',value:encodeURIComponent(group.id),url:baseURL!}]);await page.addInitScript(id=>{localStorage.setItem('creatoros:current-group',id);localStorage.removeItem('creatoros:current-account');},group.id);
  source=await dispatch(page,ENDPOINTS.getProductionEditorSource.id,{params:{outputId:output.id,requestId:resume.sourceRequestId}},group.id);
  writeFileSync(resolve(root,'original-source-readback.json'),JSON.stringify(source,null,2));
  if(source.status==='reserved'&&source.taskId===null)source=await dispatch(page,ENDPOINTS.prepareProductionEditorSource.id,{params:{outputId:output.id},body:{assetId:asset.id,assetFileId:asset.currentFileId,requestId:resume.sourceRequestId}},group.id);
  saved=await dispatch(page,ENDPOINTS.getProductionEditor.id,{params:{outputId:output.id}},group.id);mediaId=saved.plan.referenceEditor.mediaRefs[0].mediaId;
  await page.goto(`/projects/${project.id}/production?outputId=${output.id}`);await expect(work.getByRole('button',{name:'保存工程',exact:true})).toBeEnabled();
 }else{
 group=await dispatch(page,ENDPOINTS.createAccountGroup.id,{body:{name:`剪辑验收-${randomUUID()}`,idempotencyKey:randomUUID()}});
 project=await dispatch(page,ENDPOINTS.createProject.id,{body:{title:'文字剪辑真实验收',brief:'本地合成媒体用于解码和协议验收，不宣称模型或ASR效果',contentType:'video'}},group.id);
 output=await dispatch(page,ENDPOINTS.createOutput.id,{params:{projectId:project.id},body:{title:'实际剪辑',contentType:'video',clientRequestId:randomUUID()}},group.id);
 await page.context().addCookies([{name:'creatoros_current_group',value:encodeURIComponent(group.id),url:baseURL!}]);await page.addInitScript(id=>{localStorage.setItem('creatoros:current-group',id);localStorage.removeItem('creatoros:current-account');},group.id);
 const upload=await dispatch(page,'assets.uploads.create',{body:{assetType:'video',mimeType:'video/mp4',fileSize:bytes.length,projectId:project.id,fileName:'source.mp4'}},group.id);
 const put=await page.request.put(upload.uploadUrl,{timeout:120_000,headers:{'content-type':'video/mp4'},data:bytes});expect(put.ok()).toBe(true);
 asset=await dispatch(page,'assets.uploads.complete',{params:{uploadId:upload.uploadId},body:{name:'文字剪辑原片'}},group.id);
 await page.goto(`/projects/${project.id}/production?outputId=${output.id}`);
 await expect(work.getByRole('button',{name:'保存工程',exact:true})).toBeEnabled();
 const panelNav=native.getByRole('navigation',{name:'剪辑工作区面板'});if(await panelNav.isVisible())await panelNav.getByRole('button',{name:panelName,exact:true}).click();
 await work.getByRole('button',{name:'从素材库选取',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'预览 文字剪辑原片',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'加入编辑器',exact:true}).click();
 const card=native.getByRole('option').filter({hasText:'source.mp4'});await expect(card).toHaveCount(1);await card.hover();await card.getByRole('button').click();await work.getByRole('button',{name:'保存工程',exact:true}).click();await expect(work.getByText('剪辑工程已保存，刷新后可继续编辑。',{exact:true})).toBeVisible();
 saved=await dispatch(page,ENDPOINTS.getProductionEditor.id,{params:{outputId:output.id}},group.id);const plan=saved.plan,scene=plan.referenceEditor.nativeDocument.scenes[0],first=scene.tracks.main.elements[0];expect(first.duration).toBe(360000);
 mediaId=plan.referenceEditor.mediaRefs[0].mediaId;first.duration=120000;first.trimEnd=240000;const second={...structuredClone(first),id:randomUUID(),startTime:120000,duration:240000,trimStart:120000,trimEnd:0};scene.tracks.main.elements.push(second);
 await dispatch(page,ENDPOINTS.saveProductionEditor.id,{params:{outputId:output.id},body:{expectedRevision:saved.revision,requestId:randomUUID(),source:'manual',plan}},group.id);
 source=await dispatch(page,ENDPOINTS.prepareProductionEditorSource.id,{params:{outputId:output.id},body:{assetId:asset.id,assetFileId:asset.currentFileId,requestId:randomUUID()}},group.id);
 }
 let probe:any;await expect.poll(async()=>{probe=await dispatch(page,ENDPOINTS.getProductionEditorSource.id,{params:{outputId:output.id,requestId:source.requestId}},group.id);expect(['failed','cancelled']).not.toContain(probe.status);return probe.status;},{timeout:480_000,intervals:[1000,3000,5000]}).toBe('succeeded');expect(probe.probe.fileDigest).toBe(sourceSha);
 saved=await dispatch(page,ENDPOINTS.getProductionEditor.id,{params:{outputId:output.id}},group.id);const sourceAdoptBody=resume?.adoptBody??{sourceRequestId:source.requestId,expectedRevision:saved.revision,requestId:randomUUID(),addWholeClip:false,mediaId};if(resume&&resumePath&&!resume.adoptBody){resume.adoptBody=sourceAdoptBody;writeFileSync(resumePath,JSON.stringify(resume,null,2));}await dispatch(page,ENDPOINTS.adoptProductionEditorSource.id,{params:{outputId:output.id},body:sourceAdoptBody},group.id);
 await page.reload();await expect(work.getByRole('button',{name:'保存工程',exact:true})).toBeEnabled();const panelNav=native.getByRole('navigation',{name:'剪辑工作区面板'});if(await panelNav.isVisible())await panelNav.getByRole('button',{name:panelName,exact:true}).click();await native.getByRole('tab',{name:'转录',exact:true}).click();await work.getByText('高级：编辑时间轴文字',{exact:true}).click();await work.getByRole('button',{name:'读取当前时间轴',exact:true}).click();const input=work.getByRole('textbox',{name:'时间轴文字',exact:true});await expect(input).toBeVisible();
 const original=await input.inputValue();const lines=original.split('\n'),a=lines.findIndex(line=>line.startsWith('[c1]')),b=lines.findIndex(line=>line.startsWith('[c2]'));expect(a).toBeGreaterThan(0);expect(b).toBeGreaterThan(a);lines.splice(a,b-a);await input.fill(lines.join('\n'));await work.getByRole('button',{name:'生成剪辑候选',exact:true}).click();await page.setViewportSize({width:390,height:844});await panelNav.getByRole('button',{name:panelName,exact:true}).click();await work.getByRole('button',{name:'预览这次修改',exact:true}).click();const preview=work.getByLabel('文字剪辑候选预览');await expect(preview).toBeVisible();await expect.poll(()=>preview.evaluate((node:HTMLVideoElement)=>Number.isFinite(node.duration)?node.duration:0)).toBeGreaterThan(0);const previewPath=resolve(root,'candidate-preview.mp4');const previewBytes=await preview.evaluate(async(node:HTMLVideoElement)=>Array.from(new Uint8Array(await(await fetch(node.currentSrc||node.src)).arrayBuffer())));writeFileSync(previewPath,Buffer.from(previewBytes));const previewDecoded=JSON.parse(execFileSync('ffprobe',['-v','error','-show_format','-show_streams','-of','json',previewPath],{encoding:'utf8',timeout:120_000}));writeFileSync(resolve(root,'candidate-preview-decoded.json'),JSON.stringify(previewDecoded,null,2));if(process.env.CREATOROS_T1274_PREVIEW_DIAGNOSTIC==='1'){expect(previewDecoded.streams.some((stream:any)=>stream.codec_type==='video')).toBe(true);await info.attach('仅候选媒体取证',{path:previewPath,contentType:'video/mp4'});return;}const previewComparison=compareLegacyMedia(previewPath,sourceSha,previewDecoded);expect((await preview.boundingBox())!.width).toBeGreaterThan(230);await page.screenshot({path:resolve(root,'workspace-candidate-390.png'),fullPage:true});await page.setViewportSize({width:1366,height:900});await page.screenshot({path:resolve(root,'workspace-candidate-center.png'),fullPage:true});await page.setViewportSize({width:390,height:844});await preview.evaluate((node:HTMLVideoElement)=>node.play());await expect.poll(()=>preview.evaluate((node:HTMLVideoElement)=>node.currentTime)).toBeGreaterThan(0);expect(await native.locator('[data-native-core-panel]').evaluateAll(nodes=>nodes.every(node=>(node as HTMLElement).inert))).toBe(true);await native.focus();await page.keyboard.press('Space');await work.getByRole('button',{name:'返回当前画面',exact:true}).click();await expect(preview).toHaveCount(0);await expect(panelNav.getByRole('button',{name:panelName,exact:true})).toHaveAttribute('aria-pressed','true');await expect(work.getByRole('button',{name:'预览这次修改',exact:true})).toBeFocused();
 saved=await dispatch(page,ENDPOINTS.getProductionEditor.id,{params:{outputId:output.id}},group.id);const beforeRevision=saved.revision;await work.getByRole('button',{name:'采纳并保存新版本',exact:true}).click();if(process.env.T1296_CAPTURE_NATIVE==='1'){await expect.poll(async()=>{const current=await dispatch(page,ENDPOINTS.getProductionEditor.id,{params:{outputId:output.id}},group.id);return current.revision;}).toBe(beforeRevision+1);await expect.poll(()=>work.getByRole('button',{name:'采纳并保存新版本',exact:true}).isDisabled()).toBe(true);await page.waitForTimeout(1000);const live=await page.evaluate(()=>(window as any).__t1296Native.request('context'));const current=await dispatch(page,ENDPOINTS.getProductionEditor.id,{params:{outputId:output.id}},group.id);writeFileSync(resolve(root,'adopt-native-context.json'),JSON.stringify({live,current},null,2));}await expect(work.getByText('已采纳到当前时间轴。可重新读取继续修改。',{exact:true})).toBeVisible();const after=await dispatch(page,ENDPOINTS.getProductionEditor.id,{params:{outputId:output.id}},group.id);expect(after.revision).toBe(beforeRevision+1);expect(after.plan.referenceEditor.nativeDocument.scenes[0].tracks.main.elements).toHaveLength(1);expect(after.plan.nativeSources).toEqual(saved.plan.nativeSources);
 for(const size of [{width:1920,height:1080},{width:1366,height:900},{width:1280,height:800},{width:1024,height:800},{width:390,height:844}]){await page.setViewportSize(size);if(await panelNav.isVisible())await panelNav.getByRole('button',{name:'画面',exact:true}).click();await expect(work.getByRole('button',{name:'保存工程',exact:true})).toBeVisible();await work.evaluate(node=>{for(let parent=node.parentElement;parent;parent=parent.parentElement)if(parent.scrollHeight>parent.clientHeight)parent.scrollTop=0;});if(size.width>=1280){const assistant=await native.locator('.native-workspace-right').boundingBox(),editing=await native.locator('.native-workspace-editing').boundingBox();expect(assistant!.width).toBeGreaterThanOrEqual(379);expect(Math.abs((assistant!.y+assistant!.height)-(editing!.y+editing!.height))).toBeLessThan(4);}await page.screenshot({path:resolve(root,`workspace-${size.width}.png`),fullPage:true});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);if(size.width>=1024){const send=work.getByRole('button',{name:'提交提示给 Copilot',exact:true});await send.scrollIntoViewIfNeeded();const box=await send.boundingBox();expect(box!.y).toBeGreaterThanOrEqual(0);expect(box!.y+box!.height).toBeLessThanOrEqual(size.height);await work.getByRole('textbox',{name:'我能帮你做什么',exact:true}).focus();await expect(work.getByRole('textbox',{name:'我能帮你做什么',exact:true})).toBeFocused();await page.screenshot({path:resolve(root,`assistant-reachable-${size.width}.png`),fullPage:true});}}
 await page.setViewportSize({width:1280,height:800});await page.evaluate(()=>{document.documentElement.style.zoom='2';});await expect(work.getByRole('button',{name:'保存工程',exact:true})).toBeVisible();await work.getByRole('button',{name:'更多剪辑操作'}).focus();await page.keyboard.press('Enter');await expect(page.getByRole('menuitem',{name:'历史版本'})).toBeVisible();await page.keyboard.press('Escape');await expect(work.getByRole('button',{name:'更多剪辑操作'})).toBeFocused();await work.evaluate(node=>{for(let parent=node.parentElement;parent;parent=parent.parentElement)if(parent.scrollHeight>parent.clientHeight)parent.scrollTop=0;});await page.screenshot({path:resolve(root,'workspace-200-percent.png'),fullPage:true});await page.evaluate(()=>{document.documentElement.style.zoom='';});
 await page.setViewportSize({width:1366,height:900});const download=page.waitForEvent('download',{timeout:960_000});await work.getByRole('button',{name:'导出当前场景 MP4',exact:true}).click();const mp4=await download;const file=resolve(root,'edited.mp4');await mp4.saveAs(file);const decoded=JSON.parse(execFileSync('ffprobe',['-v','error','-show_format','-show_streams','-of','json',file],{encoding:'utf8',timeout:120_000}));const exportComparison=compareLegacyMedia(file,sourceSha,decoded);
 await work.getByRole('button',{name:'采用为作品成片',exact:true}).click();await expect(work.getByText(/已登记为本项目成片/)).toBeVisible();const delivered=await dispatch(page,ENDPOINTS.getOutput.id,{params:{outputId:output.id}},group.id);expect(delivered.primaryAssetId).toEqual(expect.any(String));
 const exportSaved=await dispatch(page,ENDPOINTS.getProductionEditor.id,{params:{outputId:output.id}},group.id);expect(exportSaved.revision).toBeGreaterThan(after.revision);expect(exportSaved.plan.referenceEditor.nativeDocument.scenes[0].tracks).toEqual(after.plan.referenceEditor.nativeDocument.scenes[0].tracks);expect(exportSaved.plan.nativeSources).toEqual(after.plan.nativeSources);await page.reload();await expect(work.getByRole('button',{name:'保存工程',exact:true})).toBeEnabled();expect((await dispatch(page,ENDPOINTS.getProductionEditor.id,{params:{outputId:output.id}},group.id)).plan).toEqual(exportSaved.plan);
 await work.getByRole('button',{name:'更多剪辑操作'}).click();await page.getByRole('menuitem',{name:'历史版本',exact:true}).click();const history=page.getByRole('dialog',{name:'历史版本'}).getByRole('region',{name:'历史剪辑工程'});await expect(history).toBeVisible();const targetVersion=history.locator('div').filter({hasText:new RegExp(`^版本 ${beforeRevision} ·`)});await targetVersion.getByRole('button',{name:'恢复此版',exact:true}).click();await expect.poll(async()=>{const value=await dispatch(page,ENDPOINTS.getProductionEditor.id,{params:{outputId:output.id}},group.id);return value.plan.referenceEditor.nativeDocument.scenes[0].tracks.main.elements.length;}).toBe(2);const restored=await dispatch(page,ENDPOINTS.getProductionEditor.id,{params:{outputId:output.id}},group.id);expect(restored.revision).toBeGreaterThan(exportSaved.revision);expect((await dispatch(page,ENDPOINTS.getOutput.id,{params:{outputId:output.id}},group.id)).primaryAssetId).toBe(delivered.primaryAssetId);
 writeFileSync(resolve(root,'result.json'),JSON.stringify({projectId:project.id,outputId:output.id,groupId:group.id,sourceSha,probe,revisionBefore:beforeRevision,revisionAfter:after.revision,decoded,previewComparison,exportComparison,deliveredAssetId:delivered.primaryAssetId,restoredRevision:restored.revision,modelCalled:false,asrCalled:false},null,2));await info.attach('已解码MP4',{path:file,contentType:'video/mp4'});
});
