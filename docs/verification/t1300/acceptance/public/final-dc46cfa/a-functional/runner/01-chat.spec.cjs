"use strict";
const {test,expect,owner,rpc,save,snap,action,submit}=require('./support.cjs');
const textOf=a=>a.content??a.parts?.filter(p=>p.type==='text').map(p=>p.text).join('')??'';
test('U01普通首轮多轮及自然刷新历史',async({page})=>{
 test.setTimeout(28800000);await owner(page);await page.goto('/accounts?copilot=open');const dialog=page.locator('[data-slot="ai-copilot-dialog"]');await expect(dialog).toBeVisible();await dialog.getByRole('button',{name:'新对话',exact:true}).click();
 const first=await action('U01-turn1',async()=>{const r=await submit(page,dialog,'请只用纯文本回复“连接正常T1300父验收”。不要调用工具、搜索或修改业务对象。','U01-turn1');expect(textOf(r.assistant)).toContain('连接正常T1300父验收');await expect(dialog.locator('[data-slot="copilot-message"][data-role="assistant"]')).toContainText('连接正常T1300父验收');await snap(page,'U01-first-reply');return {ids:r.ids,metadata:r.assistant.modelMetadata,text:textOf(r.assistant)};});
 const second=await action('U01-turn2',async()=>{const r=await submit(page,dialog,'根据上一轮对话，只用纯文本回复“多轮连接正常T1300父验收”。不要调用工具或修改业务对象。','U01-turn2');expect(r.ids.conversationId).toBe(first.ids.conversationId);expect(textOf(r.assistant)).toContain('多轮连接正常T1300父验收');return {ids:r.ids,metadata:r.assistant.modelMetadata,text:textOf(r.assistant)};});
 await action('U01-refresh',async()=>{await page.reload();await expect(dialog).toBeVisible();await expect(dialog.locator('[data-slot="copilot-message"][data-role="assistant"]')).toHaveCount(2);await expect(dialog.locator('[data-slot="copilot-message"][data-role="assistant"]').last()).toContainText('多轮连接正常T1300父验收');await snap(page,'U01-refreshed-original-history');return {first:first.ids,second:second.ids,naturalHistoryAfterRefresh:true};});
});
