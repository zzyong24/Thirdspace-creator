'use strict';
const {test,expect,save,owned,rpc,capture,opId}=require('./support.cjs');
test('A1301CFG 公共设置显式选择Codex并读回六槽与readiness',async({page},info)=>{
 test.setTimeout(3600000);const owner=await owned(page);const before=await rpc(page,'settings.modelRouting.get');save('cfg-before',before);
 await page.goto('/settings?highlight=assistant-engine');await expect(page.locator('[data-slot="settings-dialog"]')).toBeVisible();
 await expect(page.getByLabel('文本创作与结构化模型来源',{exact:true})).toBeEnabled();
 await page.getByLabel('文本创作与结构化模型来源',{exact:true}).selectOption('codex');
 // 现行公共图片来源控件同时显式选择vision/image；不恢复已删除的独立图片理解控件。
 await page.getByLabel('图片模型来源',{exact:true}).selectOption('codex');
 const saved=page.waitForResponse(response=>opId(response.request())==='settings.modelRouting.put',{timeout:900000});
 await page.getByRole('button',{name:'保存模型来源',exact:true}).click();const response=await saved;expect(response.status()).toBe(200);
 await expect(page.getByRole('status').filter({hasText:'已保存并读回当前设置'})).toBeVisible();
 const after=await rpc(page,'settings.modelRouting.get');save('cfg-after',after);expect(after.choices).toMatchObject({text:'codex',vision:'codex',image:'codex',video:'official',audio:'official',embed:'official'});expect(after.revision).not.toBe(before.revision);
 save('cfg-ui-witness',{...owner,revision:after.revision,choices:after.choices,control:'text单独控件+图片联合vision/image控件',responseStatus:response.status(),capturedAt:new Date().toISOString()});
 await capture(page,info,'A00-settings-codex');
});
