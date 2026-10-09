const { chromium, expect } = require('../../../frontend/node_modules/@playwright/test');
const fs = require('node:fs');
(async () => {
 const browser = await chromium.launch({ headless:true });
 const context = await browser.newContext({viewport:{width:1366,height:900}});
 const page = await context.newPage();
 await page.goto('http://127.0.0.1:3195/knowledge',{timeout:180000});
 async function op(id,input,accountId){const r=await page.request.post('http://127.0.0.1:3195/api/v1/dispatch',{headers:accountId?{'x-account-id':accountId}:{},data:{id,input},timeout:180000});const b=await r.json();if(!r.ok()||b.error)throw Error(JSON.stringify(b));return b.data;}
 const account=await op('accounts.create',{body:{platform:'douyin',accountHandle:'@t1075-isolated-'+Date.now(),displayName:'知识库设计核查'}});
 await context.addCookies([{name:'creatoros_current_account',value:account.id,url:'http://127.0.0.1:3195'}]);
 await page.addInitScript(id=>localStorage.setItem('creatoros:current-account',id),account.id);
 const items=[['录屏教程：先讲结果再演示操作','claim','先告诉观众最后能得到什么，再演示可重复的步骤。\n\n这是一条用于核查资料阅读和长正文排版的隔离笔记。'],['采访记录：新手为什么找不到素材','reference','采访记录用于研究用户如何保存与寻找创作资料。\n\n原文需要保留，摘录和总结应可以回到原文。'],['视频开头的三种写法','quote','从问题、结果或反常识的事实开头，具体采用哪种需结合真实内容判断。'],['观众问：字幕怎么校对','qa','观众问题应保留原文、来源和日期，不能把一条问题当作普遍需求。']];
 for (const [title,knowledgeType,content] of items)await op('knowledge.create',{body:{title,knowledgeType,content}},account.id);
 await page.goto('http://127.0.0.1:3195/knowledge',{timeout:180000});
 await expect(page.getByRole('navigation',{name:'知识库视图'})).toBeVisible({timeout:180000});
 await expect(page.getByRole('region',{name:'知识倾倒场'})).toBeVisible({timeout:180000});
 await page.screenshot({path:'docs/verification/t1075/baseline.png',fullPage:true});
 await page.goto('http://127.0.0.1:3195/topics',{timeout:180000});
 await expect(page.getByTestId('audience-task-workspace')).toBeVisible({timeout:180000});
 await page.screenshot({path:'docs/verification/t1074/before.png',fullPage:true});
 fs.writeFileSync('/tmp/creatoros-t1075-browser-state.json',JSON.stringify(await context.storageState()));
 console.log('baseline captured; isolated account='+account.id);
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
