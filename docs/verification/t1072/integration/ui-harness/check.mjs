import { chromium, expect } from '../../../../../frontend/node_modules/@playwright/test/index.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
const browser=await chromium.launch({headless:true});
const evidence={kind:'浏览器组件诊断，原生适配为fixture，不能代替真实双机UAT',source:'59acab77 + 当前16px修复',viewports:[]};
try {
 for (const viewport of [{width:1366,height:900},{width:390,height:844}]) {
  const context=await browser.newContext({viewport,locale:'zh-CN'});const page=await context.newPage();
  page.setDefaultTimeout(120000);
  await page.goto('http://127.0.0.1:5179/');
  await expect(page.getByRole('button',{name:'连接本人已有产品'})).toBeEnabled();
  const dimensions=await page.locator('input,button').evaluateAll(nodes=>nodes.map(n=>({role:n.tagName,text:n.textContent,font:getComputedStyle(n).fontSize,height:n.getBoundingClientRect().height})));
  for (const value of dimensions) { if(parseFloat(value.font)<16 || value.height<44) throw new Error('新增控件不满足16px/44px'); }
  await page.screenshot({path:path.join(here,`${viewport.width}-idle.png`),fullPage:true});
  await expect(page.getByRole('textbox',{name:'电脑名称'})).toHaveAttribute('maxlength','64');
  await page.getByRole('button',{name:'已有原激活码？'}).click();
  const passwordMetrics=await page.locator('input[type=password]').evaluate(n=>({font:getComputedStyle(n).fontSize,height:n.getBoundingClientRect().height}));
  if(parseFloat(passwordMetrics.font)<16 || passwordMetrics.height<44) throw new Error('原码输入不满足16px/44px');
  await page.getByRole('button',{name:'已有原激活码？'}).click();
  await page.getByRole('textbox',{name:'电脑名称'}).fill('我的新电脑');
  await page.getByRole('button',{name:'连接本人已有产品'}).click();
  await expect(page.getByText('ABCD-EFGH')).toBeVisible();
  await page.getByRole('button',{name:'打开官方确认页'}).click();
  await expect.poll(()=>page.evaluate(()=>window.__opened)).toBe('https://growth.aitongban.cloud/products/connect#code=ABCD-EFGH');
  await page.evaluate(()=>window.__fail=true);await page.getByRole('button',{name:'我已确认，核对结果'}).click();
  await expect(page.getByRole('alert')).toContainText('保留这次连接');
  await page.screenshot({path:path.join(here,`${viewport.width}-failure.png`),fullPage:true});
  await page.reload();await expect(page.getByText('ABCD-EFGH')).toBeVisible();
  await page.evaluate(()=>window.__confirmed=true);await page.getByRole('button',{name:'我已确认，核对结果'}).click();
  await expect(page.getByRole('button',{name:'已启用，重新进入软件'})).toBeVisible();
  await page.getByRole('button',{name:'已启用，重新进入软件'}).click();
  await expect(page.getByRole('alert')).toContainText('手动关闭并重新打开');
  await page.screenshot({path:path.join(here,`${viewport.width}-activated.png`),fullPage:true});
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
  evidence.viewports.push({viewport,dimensions,passwordMetrics,overflow,journey:'意图→短码反馈→外页打开调用→失败保留→刷新恢复→核对成功→重启失败恢复，fixture原生'});
  await context.close();
 }
 await fs.writeFile(path.join(here,'browser-component-evidence.json'),JSON.stringify(evidence,null,2));
 console.log(JSON.stringify(evidence,null,2));
}finally{await browser.close();}
