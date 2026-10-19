"use strict";
const {test,expect,owner,save,read,snap,action,submit,observe}=require('./support.cjs');
const textOf=a=>a.content??a.parts?.filter(p=>p.type==='text').map(p=>p.text).join('')??'';
test('U01沿原成功首轮读回，真实第二轮与刷新，不重发首轮',async({page})=>{
 test.setTimeout(28800000);await owner(page);const original=read('actions/U01-turn1/submission');
 const first=await action('U01-turn1-original-readback',async()=>{const r=await observe(page,original,'U01-turn1-original-readback');expect(textOf(r.assistant)).toContain('连接正常T1300父验收');return {ids:r.ids,metadata:r.assistant.modelMetadata,text:textOf(r.assistant),originalRunnerFailure:'modelCalls.summary limit100 rejected; corrected public max20; original model not resubmitted'};});
 await page.goto('/accounts?copilot=open');const dialog=page.locator('[data-slot="ai-copilot-dialog"]');await expect(dialog).toBeVisible();await dialog.getByRole('button',{name:'历史记录',exact:true}).click();await page.locator(`[data-slot="copilot-history-item"][data-conversation-id="${original.conversationId}"]`).click();await expect(dialog.locator('[data-slot="copilot-message"][data-role="assistant"]')).toContainText('连接正常T1300父验收');
 const second=await action('U01-turn2',async()=>{const r=await submit(page,dialog,'根据上一轮对话，只用纯文本回复“多轮连接正常T1300父验收”。不要调用工具或修改业务对象。','U01-turn2');expect(r.ids.conversationId).toBe(first.ids.conversationId);expect(textOf(r.assistant)).toContain('多轮连接正常T1300父验收');return {ids:r.ids,metadata:r.assistant.modelMetadata,text:textOf(r.assistant)};});
 await action('U01-refresh',async()=>{await page.reload();await expect(dialog).toBeVisible();await expect(dialog.locator('[data-slot="copilot-message"][data-role="assistant"]')).toHaveCount(2);await expect(dialog.locator('[data-slot="copilot-message"][data-role="assistant"]').last()).toContainText('多轮连接正常T1300父验收');await snap(page,'U01-refreshed-original-history');return {first:first.ids,second:second.ids,naturalHistoryAfterRefresh:true,firstTurnResubmitted:false};});
});
