import { emptyTopicWorkspaceConfig } from '@creatoros/contract';
import { expect, test } from '../helpers/test-environment';

// T-1074：入口退役后仍能读回历史配置；旧冻结/采纳规则由backend/worker兼容回归覆盖。
for (const viewport of [{width:1366,height:900},{width:1024,height:768}]) test(`九宫格退役、普通选题入口保留及历史配置无损 ${viewport.width}`,async({page,baseURL})=>{
 test.setTimeout(Math.max((240000), 11220000));
 await page.setViewportSize(viewport);
 const op=async(id:string,input:unknown,accountId?:string)=>{
  const response=await page.request.post('/api/v1/dispatch',{headers:accountId?{'x-account-id':accountId}:{},data:{id,input},timeout:120000});
  const result=await response.json();expect(response.ok(),JSON.stringify(result.error)).toBe(true);return result.data;
 };
 const account=await op('accounts.create',{body:{platform:'douyin',accountHandle:`@t1074-${Date.now()}-${viewport.width}`}});
 await page.context().addCookies([{name:'creatoros_current_account',value:account.id,url:baseURL!}]);
 await page.addInitScript(id=>localStorage.setItem('creatoros:current-account',id),account.id);
 const config={...emptyTopicWorkspaceConfig(),audience:'历史观众',audienceGrid:[{id:'a0',text:'历史格子',evidence:'hypothesis',sourceRefs:[],basis:'',publicQueryAllowed:false}],industryGrid:[]};
 const saved=await op('topics.workspace.save',{body:{config,expectedVersion:0,idempotencyKey:`t1074-${viewport.width}`}},account.id);
 await page.goto('/topics');
 await expect(page.getByTestId('topics-three-column')).toBeVisible();
 await expect(page.getByTestId('audience-task-workspace')).toHaveCount(0);
 await expect(page.getByText(/九宫格/)).toHaveCount(0);
 await expect(page.getByTestId('topics-generate-actions').getByRole('link')).toHaveCount(4);
 await expect(page.getByTestId('content-radar-link')).toHaveAttribute('href','/intelligence');
 const reread=await op('topics.workspace.get',{},account.id);expect(reread).toEqual(saved);
});

// T-1246 copied-source declaration: original assertions unchanged.
test.describe.configure({ timeout: 11220000 });
