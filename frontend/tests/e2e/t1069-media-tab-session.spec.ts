import {randomUUID,createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {expect as baseExpect,test} from '../helpers/test-environment';
const expect=baseExpect.configure({timeout:120_000});
import type {Page} from '@playwright/test';
const fresh=()=>randomUUID();
async function dispatch<T>(page:Page,id:string,input:unknown,groupId?:string):Promise<T>{
 const response=await page.request.post('/api/v1/dispatch',{headers:{'content-type':'application/json',...(groupId?{'x-group-id':groupId}:{})},data:{id,input}});
 expect(response.ok(),`${id}: ${await response.text()}`).toBe(true);return (await response.json()).data;
}
test('本地视频逐个导入、未保存切Tab返回、保存刷新保留原素材和工程',async({page,context,baseURL},info)=>{
 test.setTimeout(1_800_000);page.setDefaultTimeout(120_000);page.setDefaultNavigationTimeout(120_000);context.setDefaultTimeout(120_000);
 const bytes=readFileSync(resolve(process.cwd(),'../output/content-samples/ai-copy-eval-loop/motion-preview.mp4'));
 expect(createHash('sha256').update(bytes).digest('hex')).toBe('a116d9d135ca730df76dd4932f2cf0e5630e47b4094eff6d83af5f731aa1ac04');
 await page.goto('/');const group=await dispatch<{id:string}>(page,'accountGroups.create',{body:{name:`中性视频恢复-${fresh()}`,idempotencyKey:fresh()}});
 const project=await dispatch<{id:string}>(page,'projects.create',{body:{title:'视频切Tab验收',brief:'',contentType:'video'}},group.id);
 const output=await dispatch<{id:string}>(page,'projects.outputs.create',{params:{projectId:project.id},body:{title:'中性视频',contentType:'video',clientRequestId:fresh()}},group.id);
 await context.addCookies([{name:'creatoros_current_group',value:encodeURIComponent(group.id),url:baseURL!}]);
 await page.addInitScript(id=>{localStorage.setItem('creatoros:current-group',id);localStorage.removeItem('creatoros:current-account');},group.id);
 const editorUrl=`/projects/${project.id}/production?outputId=${output.id}`;
 await page.goto(editorUrl);const native=page.locator('[data-native-root="opencut"]'),bench=page.locator('section[aria-label="视频剪辑工作台"]');
 await expect(native.locator('.native-workbench')).toBeVisible();await expect(bench.getByRole('button',{name:'保存工程',exact:true})).toBeEnabled();
 const originalRoot=await native.elementHandle();const names=['中性视频第一段.mp4','中性视频第二段.mp4'];const timings:Array<{name:string;elapsedMs:number}>=[];const started=Date.now();
 const chooserPromise=page.waitForEvent('filechooser');await native.getByRole('button',{name:'导入素材',exact:true}).click();const chooser=await chooserPromise;await chooser.setFiles(names.map(name=>({name,mimeType:'video/mp4',buffer:bytes})));
 for(const name of names){await expect(native.getByTitle(name,{exact:true})).toBeVisible();timings.push({name,elapsedMs:Date.now()-started});}
 await info.attach('逐个素材可操作时间',{body:JSON.stringify({bytesPerFile:bytes.length,timings},null,2),contentType:'application/json'});
 await expect(bench.getByText('有未保存修改',{exact:true})).toBeVisible();
 const first=native.getByRole('option').filter({has:page.getByTitle(names[0],{exact:true})});await first.hover();await first.getByRole('button').click();
 const nameField=native.locator('header input[type="text"]');await nameField.click();await nameField.fill('切Tab前未保存的工程名');await nameField.press('Enter');
 const before=await dispatch<{revision:number}>(page,'outputs.production.editor.get',{params:{outputId:output.id}},group.id);
 await page.getByRole('link',{name:'脚本',exact:true}).click();await expect(native).toBeHidden();
 await page.goBack();await expect(native).toBeVisible();expect(await originalRoot!.evaluate(element=>element.isConnected)).toBe(true);
 await expect(native.locator('header input[type="text"]')).toHaveValue('切Tab前未保存的工程名');for(const name of names)await expect(native.getByTitle(name,{exact:true})).toBeVisible();
 const unsaved=await dispatch<{revision:number}>(page,'outputs.production.editor.get',{params:{outputId:output.id}},group.id);expect(unsaved.revision).toBe(before.revision);
 await bench.getByRole('button',{name:'保存工程',exact:true}).click();await expect(bench.getByText('剪辑工程已保存，刷新后可继续编辑。',{exact:true})).toBeVisible();
 const saved=await dispatch<{revision:number;[key:string]:unknown}>(page,'outputs.production.editor.get',{params:{outputId:output.id}},group.id);expect(saved.revision).toBeGreaterThan(before.revision);
 await info.attach('真实中性视频导入时间',{body:JSON.stringify({bytesPerFile:bytes.length,timings,saved},null,2),contentType:'application/json'});
 await page.reload();await expect(native.locator('.native-workbench')).toBeVisible();await expect(native.locator('header input[type="text"]')).toHaveValue('切Tab前未保存的工程名');for(const name of names)await expect(native.getByTitle(name,{exact:true})).toBeVisible();
 const reloaded=await dispatch<{revision:number}>(page,'outputs.production.editor.get',{params:{outputId:output.id}},group.id);expect(reloaded).toEqual(saved);
 await page.screenshot({path:info.outputPath('video-tab-restored.png'),fullPage:true});
 const downloadPromise=page.waitForEvent('download',{timeout:900_000});
 await bench.getByRole('button',{name:'导出当前场景 MP4',exact:true}).click();
 const download=await downloadPromise;const exportedPath=info.outputPath('neutral-tab-export.mp4');await download.saveAs(exportedPath);
 await expect(bench.getByText('MP4 已导出，对应剪辑工程已保存。可继续采用为当前作品成片。',{exact:true})).toBeVisible();
 await info.attach('真实浏览器导出 MP4',{path:exportedPath,contentType:'video/mp4'});
 const exportSaved=await dispatch<{revision:number}>(page,'outputs.production.editor.get',{params:{outputId:output.id}},group.id);expect(exportSaved.revision).toBeGreaterThan(saved.revision);
});
