import {test as base, expect as baseExpect, type Page} from '@playwright/test';
import {createHash, randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';

// 仅验收候选。由独审后的 owned runner 提供真实新delivery封存；不自行启动服务器/安装App。
const expect=baseExpect.configure({timeout:120000});
const test=base.extend({context:async({context,baseURL},use)=>{
  const origin=new URL(baseURL!).origin,denied:string[]=[];
  await context.route('**/*',async route=>{const u=new URL(route.request().url());
    if(['about:','blob:','data:'].includes(u.protocol)||u.origin===origin)await route.continue();
    else {denied.push(u.origin+u.pathname);await route.abort('blockedbyclient');}
  });
  await context.routeWebSocket('**/*',async socket=>{const u=new URL(socket.url());
    if(u.hostname===new URL(origin).hostname&&u.port===new URL(origin).port)socket.connectToServer();
    else {denied.push(u.origin+u.pathname);await socket.close({code:1008,reason:'本轮禁止外网'});}
  });
  await use(context);expect(denied,'不得默默忽略非本地网络').toEqual([]);
}});
test.afterEach(async({page},info)=>{
  if(!page.isClosed())await info.attach('真实最终画面',{body:await page.screenshot({timeout:120000,animations:'disabled'}),contentType:'image/png'});
});
const digest=(v:Buffer)=>createHash('sha256').update(v).digest('hex');
const sourcePath='/reference-editors/sources/doocs-md/native-source.tar.gz';
async function op(page:Page,id:string,input:unknown,groupId?:string){
  const response=await page.request.post('/api/v1/dispatch',{timeout:120000,headers:groupId?{'x-group-id':groupId}:{},data:{id,input}});
  expect(response.ok(),`${id}: ${response.status()} ${await response.text()}`).toBe(true);
  return (await response.json()).data;
}
for(const viewport of [{width:1366,height:900},{width:390,height:844}]){
  test(`T1254 Doocs真实公开加载编辑宿主上传保存刷新和对应源码 ${viewport.width}`,async({page,context,baseURL},info)=>{
    test.setTimeout(72000000);
    const expectedSource=process.env.CREATOROS_T1254_SERVED_NATIVE_SOURCE_SHA256;
    expect(expectedSource,'新delivery对应源码必须由封存runner提供').toMatch(/^[a-f0-9]{64}$/);
    expect(process.env.CREATOROS_T1246_FROZEN_CANDIDATE).toMatch(/^[a-f0-9]{40}$/);
    expect(process.env.CREATOROS_T1246_PACKAGE_SHA256).toMatch(/^[a-f0-9]{64}$/);
    const manifestPath=process.env.CREATOROS_T1254_NATIVE_MANIFEST_PATH;
    expect(manifestPath,'owned runner必须绑定完整新manifest').toBeTruthy();
    const manifest=JSON.parse(await readFile(manifestPath!,'utf8'));
    expect(manifest['doocs-md'].native.sourceArchiveSha256).toBe(expectedSource);
    const bundleFiles:Record<string,string>=manifest['doocs-md'].native.bundleFiles;
    const delivered:Array<{path:string;status:number;sha256:string}>=[],pending:Array<Promise<void>>=[];
    page.on('response',response=>{const u=new URL(response.url()),prefix='/reference-editors/doocs-md/native/';
      if(u.pathname.startsWith(prefix)){
        const action=(async()=>{const path=decodeURIComponent(u.pathname.slice(prefix.length));
          expect(Object.hasOwn(bundleFiles,path),`请求必须属于新原生整包 ${path}`).toBe(true);
          expect(response.status(),path).toBe(200);const sha256=digest(await response.body());
          expect(sha256,path).toBe(bundleFiles[path]);delivered.push({path,status:response.status(),sha256});
        })();void action.catch(()=>{});pending.push(action);
      }
    });
    await page.setViewportSize(viewport);
    const source=await page.request.get(sourcePath,{timeout:120000});
    expect(source.status()).toBe(200);expect(new URL(source.url()).origin).toBe(new URL(baseURL!).origin);
    const sourceBytes=await source.body();expect(digest(sourceBytes)).toBe(expectedSource);
    const nonce=randomUUID(),group=await op(page,'accountGroups.create',{body:{name:`Doocs实际验收-${nonce}`,idempotencyKey:nonce}});
    await context.addCookies([{name:'creatoros_current_group',value:group.id,url:baseURL!}]);
    await page.addInitScript(id=>{localStorage.setItem('creatoros:current-group',id);localStorage.removeItem('creatoros:current-account');localStorage.setItem('creatoros:onboarding:hidden','1');},group.id);
    const project=await op(page,'projects.create',{body:{title:`Doocs新构建-${nonce}`,brief:'用户明确输入的编辑和上传验收',contentType:'article',targetPlatforms:['wechatOfficialAccount']}},group.id);
    await page.goto(`/projects/${project.id}/article`,{timeout:120000});
    const workbench=page.locator('[data-page="article-workbench"]');await expect(workbench).toBeVisible();
    await workbench.getByRole('button',{name:'新建文章',exact:true}).click();
    await workbench.getByLabel('标题',{exact:true}).fill(`原生加载 ${nonce}`);
    await workbench.getByRole('button',{name:'添加段落',exact:true}).click();
    await workbench.getByLabel('段落标题').fill('原始段落');await workbench.getByLabel('段落正文').fill('本段明确来自用户输入。');
    await workbench.getByRole('button',{name:'保存修改',exact:true}).click();
    await expect(workbench.getByText('稿件已保存为新版本并完成指定版本读回。')).toBeVisible();
    await workbench.getByText('使用 Doocs 编辑器（保留原版式）',{exact:true}).click();
    const editor=workbench.locator('section').filter({has:page.getByRole('heading',{name:'公众号排版编辑器',exact:true})});
    await expect(editor.locator('.cm-editor')).toHaveCount(1);
    await expect(editor.getByRole('button',{name:'保存正文与排版',exact:true})).toBeEnabled();
    await info.attach('实际原生载入',{body:await page.screenshot({timeout:120000}),contentType:'image/png'});
    const body=editor.locator('.cm-editor .cm-content[contenteditable="true"]');
    await body.fill('# 实际原生编辑\n\n本段由浏览器真实CodeMirror输入。');
    await editor.getByRole('button',{name:'插入图片',exact:true}).click();
    const upload=editor.locator('input[type="file"][accept="image/*"]');await expect(upload).toHaveCount(1);
    // 与原文章测试相同的真实1px PNG；经宿主完整create/PUT/complete/link，不伪造importMedia回执。
    const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/nxoAAAAASUVORK5CYII=','base64');
    await upload.setInputFiles({name:`doocs-${nonce}.png`,mimeType:'image/png',buffer:png});
    await expect(editor.locator('.cm-content')).toContainText('creatoros-asset:');
    await expect(editor.getByRole('button',{name:'保存正文与排版',exact:true})).toBeEnabled();
    await editor.getByRole('button',{name:'保存正文与排版',exact:true}).click();
    const outputId=new URL(page.url()).searchParams.get('outputId');expect(outputId).toBeTruthy();
    await expect.poll(async()=>await op(page,'articles.get',{params:{outputId}},group.id),{timeout:300000}).toMatchObject({current:{sections:expect.arrayContaining([expect.objectContaining({body:expect.stringContaining('浏览器真实CodeMirror')})]),imageUses:expect.arrayContaining([expect.objectContaining({assetId:expect.any(String),assetFileId:expect.any(String)})]),nativeLayout:{editor:'doocs-md'}}});
    const saved=await op(page,'articles.get',{params:{outputId}},group.id),image=saved.current.imageUses[0];
    const download=await op(page,'assets.fileDownloadUrl',{params:{assetId:image.assetId,assetFileId:image.assetFileId}},group.id);
    expect(new URL(download.url,baseURL).origin).toBe(new URL(baseURL!).origin);
    const imageResponse=await page.request.get(download.url,{timeout:120000});expect(imageResponse.status()).toBe(200);
    expect(digest(await imageResponse.body())).toBe(digest(png));
    await info.attach('实际宿主上传与保存',{body:await page.screenshot({timeout:120000}),contentType:'image/png'});
    await page.reload({timeout:120000});await expect(workbench.getByLabel('段落正文')).toHaveValue(/浏览器真实CodeMirror/);
    await workbench.getByText('使用 Doocs 编辑器（保留原版式）',{exact:true}).click();
    await expect(editor.locator('.cm-editor')).toHaveCount(1);await expect(editor.locator('.cm-content')).toContainText(`creatoros-asset:${image.assetId}:${image.assetFileId}`);
    await editor.getByText('开源来源与许可',{exact:true}).click();
    await expect(editor.getByRole('link',{name:'Doocs 对应源码与许可',exact:true})).toHaveAttribute('href',sourcePath);
    await Promise.all(pending);expect(delivered.some(row=>row.path==='native.js')).toBe(true);expect(delivered.some(row=>row.path==='native.css')).toBe(true);
    await info.attach('公开回执',{body:Buffer.from(JSON.stringify({candidateCommit:process.env.CREATOROS_T1246_FROZEN_CANDIDATE,packageSha256:process.env.CREATOROS_T1246_PACKAGE_SHA256,groupId:group.id,projectId:project.id,outputId,source:{path:sourcePath,sha256:digest(sourceBytes),size:sourceBytes.length},delivered,image:{assetId:image.assetId,assetFileId:image.assetFileId,sha256:digest(png)},officialModel:false,App:false})),contentType:'application/json'});
  });
}
