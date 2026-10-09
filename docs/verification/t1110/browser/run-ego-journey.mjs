// 候选，当前未执行。仅root检查并经ego-browser nodejs运行；不import Playwright，不launch/claim新浏览器。
// 真实Next路由/SSR/UI/公开账号组服务；report-read及同步执行状态是明确隔离fixture，不能证明微信认证。
const fs=await import('node:fs/promises'),path=await import('node:path'),crypto=await import('node:crypto'),cp=await import('node:child_process');
const {default:assert}=await import('node:assert/strict');
const serverFile=process.env.T1110_EGO_SERVER_STATE,label=process.env.T1110_EGO_PAGE_LABEL;
if(!serverFile||!label)throw Error('须root显式提供隔离server state和已分配的同空间测试Page label；不自动占用真人平台p1');
const server=JSON.parse(await fs.readFile(serverFile,'utf8'));
assert.equal(server.schema,'t1110-ego-server/v1');assert.equal(new URL(server.origin).hostname,'[::1]');
assert.ok(path.basename(server.root).startsWith('creatoros-t1110-shadow-'));assert.equal(server.execution,'fixture-only-no-platform-proof');
server.output=path.join(server.output,`run-${Date.now()}-${crypto.randomUUID().slice(0,8)}`);await fs.mkdir(path.join(server.output,'screenshots'),{recursive:true});
const task=await taskSpace(20);assert.equal(task.spaceId,20);const page=task.page(label);
const previousUrl=await page.url();if(previousUrl!=='about:blank'&&new URL(previousUrl).origin!==server.origin)throw Error('指定Page不是空白/本次影子产品页；停止，不能覆盖真人后台或其它页面');
const version=await task.cdp('Browser.getVersion',{}, {timeout:120000});
const witness=JSON.parse(await fs.readFile(server.normalizedWitness,'utf8'));
const startedAt=new Date().toISOString(),captures=[],steps=[],browserErrors=[],external=[],requestLog=[];
let outcome='not-run',groups,controls={defaultMode:'running',accounts:{}};
const sourceSha=async relative=>crypto.createHash('sha256').update(await fs.readFile(path.join(server.repo,relative))).digest('hex');
const command=(args)=>cp.execFileSync('git',args,{cwd:server.repo,encoding:'utf8',timeout:120000}).trim();
const calls=async()=>((await fs.readFile(server.fixtureLog,'utf8')).split('\n').filter(Boolean).map(line=>JSON.parse(line)));
const starts=async accountId=>(await calls()).filter(call=>call.action==='collections.start'&&call.input.accountId===accountId);
const setControl=async(accountId,change)=>{controls.accounts[accountId]={...controls.accounts[accountId],...change};await fs.writeFile(server.control,JSON.stringify(controls));};
const record=async(action,detail={})=>{steps.push({at:new Date().toISOString(),action,...detail,fixtureCallCount:(await calls()).length});console.log(`T1110候选实际步骤：${action}`);};
async function poll(check,description){const end=Date.now()+120000;while(Date.now()<end){if(await check())return;await new Promise(done=>setTimeout(done,100));}throw Error(description+'未在120秒预算内满足');}
async function dispatch(id,input,scope={},allowRejected=false){
  // Node公开HTTP不读取Ego Cookie；只打本次::1临时根，不打root 31410或真实平台。
  const response=await fetch(`${server.origin}/api/v1/dispatch`,{method:'POST',headers:{'content-type':'application/json',...(scope.groupId?{'x-group-id':scope.groupId}:{}),...(scope.accountId?{'x-account-id':scope.accountId}:{})},body:JSON.stringify({id,input}),signal:AbortSignal.timeout(120000)});
  const envelope=await response.json();requestLog.push({at:new Date().toISOString(),id,input,scope,httpStatus:response.status});
  if(allowRejected)return {status:response.status,envelope};assert.ok(response.ok,`${id}公开服务HTTP ${response.status}`);return envelope.data;
}
const selector=name=>`loc=role:button[name=${JSON.stringify(name)}]`;
async function clickButton(name){await page.click(selector(name),{timeout:120000,label:'执行当前页面操作'});}
async function textVisible(text){await page.waitForFunction(text=>[...document.querySelectorAll('body *')].some(e=>e.textContent?.trim()===text&&e.getBoundingClientRect().width>0&&getComputedStyle(e).display!=='none'),text,{timeout:120000});}
async function buttonState(name,disabled){await page.waitForFunction(({name,disabled})=>[...document.querySelectorAll('button')].some(b=>b.textContent?.trim()===name&&b.disabled===disabled),{name,disabled},{timeout:120000});}
async function noDialog(){await page.waitForFunction(()=>!document.querySelector('[role="dialog"]'),undefined,{timeout:120000});}
async function drainEvents(){
  for(const event of await page.events()){
    const method=event.method??event.type,params=event.params??event;
    if(method==='Runtime.exceptionThrown')browserErrors.push(params.exceptionDetails?.text??'浏览器Runtime exception');
    const request=params.request;
    if(method==='Network.requestWillBeSent'&&request?.url){const url=new URL(request.url);if(['data:','blob:','about:'].includes(url.protocol))continue;
      const comparable=url.protocol==='ws:'?url.origin.replace(/^ws:/,'http:'):url.origin;
      if(comparable!==server.origin)external.push({origin:url.origin,method:request.method});
      if(url.origin===server.origin&&url.pathname==='/api/v1/dispatch'&&request.postData){let body;try{body=JSON.parse(request.postData);}catch{}if(body)requestLog.push({at:new Date().toISOString(),surface:'Ego page request',id:body.id,input:body.input});}
    }
  }
}
async function capture(checkpoint,check_ids){
  await page.waitForFunction(()=>document.fonts.status==='loaded'&&document.getAnimations().every(a=>a.playState!=='running'||!Number.isFinite(a.effect?.getComputedTiming().endTime)),undefined,{timeout:120000});
  const actual=await page.evaluate(()=>{const nodes=[],walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);for(let node=walker.nextNode();node;node=walker.nextNode()){
    const text=node.textContent?.trim(),parent=node.parentElement;if(!text||!parent||parent.closest('script,style'))continue;let hidden=false,clip={left:0,top:0,right:innerWidth,bottom:innerHeight};
    for(let a=parent;a;a=a.parentElement){const s=getComputedStyle(a),r=a.getBoundingClientRect();if(s.display==='none'||s.visibility==='hidden'||Number(s.opacity)===0||a.getAttribute('aria-hidden')==='true'){hidden=true;break;}if(['auto','scroll','hidden','clip'].includes(s.overflowX)){clip.left=Math.max(clip.left,r.left);clip.right=Math.min(clip.right,r.right);}if(['auto','scroll','hidden','clip'].includes(s.overflowY)){clip.top=Math.max(clip.top,r.top);clip.bottom=Math.min(clip.bottom,r.bottom);}}
    if(hidden)continue;const range=document.createRange();range.selectNodeContents(node);const rects=[...range.getClientRects()].filter(r=>r.width>0&&r.height>0&&r.right>clip.left&&r.left<clip.right&&r.bottom>clip.top&&r.top<clip.bottom).map(r=>({x:r.x,y:r.y,width:r.width,height:r.height}));if(rects.length)nodes.push({text,rects});
  }const geometry=[...document.querySelectorAll('[data-testid="native-report-panel"],header,button,[role="dialog"],section[aria-label="后台原生报表"],table')].map(e=>{const r=e.getBoundingClientRect();return {tag:e.tagName,role:e.getAttribute('role'),testId:e.getAttribute('data-testid'),width:r.width,height:r.height,x:r.x,y:r.y};});return {viewport:{width:innerWidth,height:innerHeight},text:nodes.map(n=>n.text).join('\n'),nodes,geometry,documentWidth:{viewport:innerWidth,scrollWidth:document.documentElement.scrollWidth}};});
  assert.ok(actual.documentWidth.scrollWidth<=actual.documentWidth.viewport,'页面有整体水平溢出');
  const screenshot=path.join(server.output,'screenshots',`${checkpoint}.png`);await page.screenshot({path:screenshot,fullPage:false,scale:'css'});
  captures.push({checkpoint,check_ids,...actual,screenshot:`screenshots/${checkpoint}.png`});await drainEvents();
}
async function makeGroup(suffix,staging){
  const group=await dispatch('accountGroups.create',{body:{name:`微信页面验收${suffix}`,idempotencyKey:crypto.randomUUID()}}),accounts=[];
  for(const platform of ['wechatOfficial','wechatVideo']){
    const account=await dispatch('accounts.create',{body:{platform,accountHandle:`隔离页面${platform==='wechatOfficial'?'公众号':'视频号'}${suffix}`,idempotencyKey:crypto.randomUUID()}},{groupId:staging.id});
    const preview=await dispatch('accountGroups.members.previewTransfer',{body:{accountId:account.id,toGroupId:group.id}});
    await dispatch('accountGroups.members.transfer',{body:{...preview,idempotencyKey:crypto.randomUUID()}});accounts.push(account);
  }return {...await dispatch('accountGroups.get',{params:{groupId:group.id}},{groupId:group.id}),accounts};
}
async function openMember(account){
  await page.goto(`${server.origin}/accounts`,{waitUntil:'domcontentloaded',timeout:120000});await page.waitForSelector(`loc=role:link[name=${JSON.stringify(`查看${account.accountHandle}的数据`)}]`,{state:'visible',timeout:120000});
  console.log(await page.snapshot());await page.click(`loc=role:link[name=${JSON.stringify(`查看${account.accountHandle}的数据`)}]`,{timeout:120000,label:'打开成员原生报表'});
  await page.waitForFunction(({id,title})=>document.querySelector('[data-testid="native-report-panel"]')?.getAttribute('data-account-id')===id&&document.querySelector('h1')?.textContent?.trim()===title,{id:account.id,title:`${account.accountHandle}的作品与数据`},{timeout:120000});
}
async function switchGroup(group){
  console.log(await page.snapshot());await page.click('loc=css:[data-testid="account-switcher-trigger"]',{timeout:120000,label:'切换当前账号组'});
  await page.click(`loc=css:[data-testid="account-switcher-menu"] [data-group-id="${group.id}"]`,{timeout:120000,label:'选择指定测试账号组'});
  if(await page.evaluate(()=>Boolean(document.querySelector('[data-testid="account-switch-confirm-action"]'))))await page.click('loc=css:[data-testid="account-switch-confirm-action"]',{timeout:120000,label:'确认切换测试账号组'});
  await page.waitForFunction(id=>localStorage.getItem('creatoros:current-group')===id,group.id,{timeout:120000});
}
async function checkReports(account,width){
  const reports=witness.payloads.filter(report=>report.platform===account.platform);
  assert.equal(await page.evaluate(()=>document.querySelectorAll('[data-testid="native-report-panel"] table').length),0,'完整大表必须按需展开');
  assert.equal(await page.evaluate(()=>document.querySelectorAll('section[aria-label="后台原生报表"] details').length),reports.length);
  await capture(`report-summary-${account.platform}-${width}`,['AC-WECHAT-REPORT']);
  for(let i=0;i<reports.length;i++){
    const summary=`loc=css:section[aria-label="后台原生报表"] > article:nth-child(${i+1}) summary`;
    await page.click(summary,{timeout:120000,label:'展开原始完整报表'});
    await page.waitForFunction(({index,count})=>document.querySelectorAll('section[aria-label="后台原生报表"] > article')[index]?.querySelectorAll('table').length===count,{index:i,count:reports[i].tables.length},{timeout:120000});
    const checks=await page.evaluate(({index,report})=>{const card=document.querySelectorAll('section[aria-label="后台原生报表"] > article')[index];
      const errors=[],headers=[...card.querySelectorAll('th')].map(e=>e.textContent.trim()),cells=[...card.querySelectorAll('td')],source=report.tables.flatMap(t=>t.rows.flat());
      if(!card.textContent.includes(`${report.selection.startDate} 至 ${report.selection.endDate}`))errors.push('报表日期范围不同');
      if(card.querySelectorAll('table').length!==report.tables.length)errors.push('表数量不同');
      const scopeCopy=report.scope==='workSelection'?'按发布时间选择的作品':'每日统计';if(!card.textContent.includes(scopeCopy))errors.push('报表统计范围不同');if(report.accumulation==='sourceUnspecified'&&!card.textContent.includes('平台未说明每项指标的累计范围'))errors.push('未知累计口径被猜测');
      const units={people:'人',count:'次',signedCount:'人',ratio:'%',seconds:'秒',date:'日期',opaqueId:'平台ID',text:''};
      const expectedHeaders=report.tables.flatMap(t=>t.columns.map(c=>c.label+(units[c.unit]&&c.unit!=='date'&&c.unit!=='opaqueId'?`（${units[c.unit]}）`:'')));
      if(JSON.stringify(headers)!==JSON.stringify(expectedHeaders))errors.push('原表头或单位不同');
      if(cells.length!==source.length)errors.push('数据单元格数量不同');
      for(let c=0;c<Math.min(cells.length,source.length);c++)if(cells[c].title!==source[c].raw)errors.push(`原始值不同：第${c+1}格`);
      let offset=0,zeros=0,nulls=0;
      for(const table of report.tables)for(const row of table.rows)for(let c=0;c<row.length;c++){
        const cell=row[c],unit=table.columns[c].unit,actual=cells[offset++]?.textContent?.trim();
        if(typeof cell.value==='string'&&actual!==cell.value.trim())errors.push('文本或平台ID被改写');if(typeof cell.value==='number'&&unit!=='ratio'&&unit!=='seconds'&&actual!==cell.value.toLocaleString('zh-CN'))errors.push('数值或负净增被改写');
        if(cell.value===null){nulls++;if(actual!=='—')errors.push('空数据伪称数字');}
        if(cell.value===0){zeros++;if(!['0','0%','0 秒'].includes(actual))errors.push('真实0被隐藏或变空');}
        if(typeof cell.value==='number'&&unit==='ratio'&&actual!==`${Number((cell.value*100).toFixed(4)).toLocaleString('zh-CN')}%`)errors.push('比例单位错误');
        if(typeof cell.value==='number'&&unit==='seconds'&&actual!==`${cell.value.toLocaleString('zh-CN')} 秒`)errors.push('时长单位错误');
      }return {errors,zeros,nulls,rows:report.tables.reduce((n,t)=>n+t.rows.length,0)};
    },{index:i,report:reports[i]});assert.deepEqual(checks.errors,[]);
    const scrolls=await page.evaluate(index=>[...document.querySelectorAll('section[aria-label="后台原生报表"] > article')[index].querySelectorAll('[tabindex="0"]')].map(e=>e.getAttribute('aria-label')),i);
    for(const name of scrolls){const scroll=`loc=css:[aria-label=${JSON.stringify(name)}]`;await page.focus(scroll,{timeout:120000});await page.press(scroll,'ArrowRight',{timeout:120000});assert.equal(await page.evaluate(name=>document.activeElement?.getAttribute('aria-label')===name,name),true);}
    if(i===0)await capture(`report-expanded-${account.platform}-${width}`,['AC-WECHAT-REPORT']);
    await page.click(summary,{timeout:120000,label:'收起原始完整报表'});await record('脱敏实报表投影：原表头/单位/日期/raw/真实0和null/局部键盘滚动',{width,accountId:account.id,kind:reports[i].kind,sourceSha256:reports[i].sha256,...checks});
  }
  await page.click('loc=role:link[name="返回账号"]',{timeout:120000,label:'返回账号管理页面'});await page.waitForFunction(()=>location.pathname==='/accounts',undefined,{timeout:120000});
  // Ego无goBack wrapper，以文档允许的Page JS补齐实际浏览器历史返回。
  await page.evaluate(()=>history.back());await page.waitForFunction(id=>document.querySelector('[data-testid="native-report-panel"]')?.getAttribute('data-account-id')===id,account.id,{timeout:120000});
  await page.reload({waitUntil:'domcontentloaded',timeout:120000});await page.waitForFunction(id=>document.querySelector('[data-testid="native-report-panel"]')?.getAttribute('data-account-id')===id,account.id,{timeout:120000});
}
try {
  assert.equal(command(['rev-parse','HEAD']),server.head);for(const source of server.sourceWitness)assert.equal(await sourceSha(source.path),source.sha256);
  await page.cdp('Runtime.enable',{}, {timeout:120000});await page.cdp('Network.enable',{}, {timeout:120000});
  // 只作用本测试Page；不清Cookie/cache/profile，不改其它Page。外网尝试仍逐事件记为失败。
  await page.cdp('Network.setBlockedURLs',{urls:['https://*','wss://*']},{timeout:120000});
  await page.goto(server.origin,{waitUntil:'domcontentloaded',timeout:120000});await page.events();
  const staging=await dispatch('accountGroups.create',{body:{name:'微信页面验收临时登记组',idempotencyKey:crypto.randomUUID()}});
  const A=await makeGroup('A',staging),B=await makeGroup('B',staging);groups={staging,A,B};await fs.writeFile(path.join(server.output,'public-fixture.json'),JSON.stringify({groups,identityProof:false,scope:'真实公开服务临时登记/转组/回读；不是微信身份proof'},null,2)+'\n');
  await page.evaluate(id=>{localStorage.setItem('creatoros:current-group',id);localStorage.removeItem('creatoros:current-account');document.cookie='creatoros_current_account=; Path=/; Max-Age=0; SameSite=Lax';document.cookie=`creatoros_current_group=${encodeURIComponent(id)}; Path=/; SameSite=Lax`;},A.id);
  const account=A.accounts.find(a=>a.platform==='wechatVideo');
  for(const viewport of [{width:1366,height:900},{width:1024,height:800}]){
    const width=viewport.width;await page.cdp('Emulation.setDeviceMetricsOverride',{...viewport,deviceScaleFactor:1,mobile:false},{timeout:120000});await page.goto(`${server.origin}/accounts`,{waitUntil:'domcontentloaded',timeout:120000});
    await page.waitForSelector('loc=role:table[name="各平台能力"]',{state:'visible',timeout:120000});console.log(await page.snapshot());await capture(`accounts-${width}`,['AC-WECHAT-ENTRY']);
    const caps=await dispatch('accounts.bindingCapabilities',{});
    for(const platform of ['wechatOfficial','wechatVideo']){
      const state=caps.find(row=>row.platform===platform),name=`扫码绑定${platform==='wechatOfficial'?'公众号':'视频号'}账号`;
      if(state?.bind?.available&&state.bind.method==='qr'){
        await clickButton(name);await page.waitForSelector(`loc=role:dialog[name=${JSON.stringify(name)}]`,{state:'visible',timeout:120000});await capture(`entry-dialog-${platform}-${width}`,['AC-WECHAT-ENTRY']);await page.keyboard.press('Escape');await noDialog();
        assert.equal(await page.evaluate(name=>document.activeElement?.textContent?.trim()===name,name),true,'平台表扫码弹窗Esc未返回原入口焦点');await record('真实表格入口打开原扫码弹窗/Esc返回原入口；没有开始扫码或创建proof',{width,platform});
      }else await record('正式账号扫码能力不可用，保留事实；不制造可用按钮',{width,platform});
    }
    for(const item of A.accounts){await openMember(item);await checkReports(item,width);}
    // 清理上一视口保存的needsAuth，只在本执行fixture原attempt上核对/取消，不重发新意图。
    await setControl(account.id,{mode:'running',startResponseLossToken:null,getGate:null});await openMember(account);
    const previous=(await starts(account.id)).at(-1);if(previous){await page.waitForFunction(()=>document.querySelector('[role="status"]')?.textContent?.trim()==='正在同步数据',undefined,{timeout:120000});await clickButton('取消本次同步');await textVisible('本次同步已取消');}
    const before=(await starts(account.id)).length,startGate=crypto.randomUUID();await setControl(account.id,{startGate});await clickButton('同步数据');await poll(async()=>(await calls()).some(c=>c.action==='collections.start.waiting'&&c.input.gate===startGate),'原start请求进入在途');await buttonState('正在核对…',true);await capture(`loading-${width}`,['AC-WECHAT-STATE']);await page.evaluate(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent?.trim()==='正在核对…');b.click();b.click();});assert.equal((await calls()).filter(c=>c.action==='collections.start.waiting'&&c.input.gate===startGate).length,1);await setControl(account.id,{startGate:null});await buttonState('正在同步…',true);const first=(await starts(account.id)).at(-1);assert.equal((await starts(account.id)).length,before+1);
    await page.evaluate(()=>{const button=[...document.querySelectorAll('button')].find(b=>b.textContent?.trim()==='正在同步…');button.click();button.click();});assert.equal((await starts(account.id)).length,before+1);await capture(`running-${width}`,['AC-WECHAT-STATE']);
    await page.reload({waitUntil:'domcontentloaded',timeout:120000});await textVisible('正在同步数据');assert.equal((await starts(account.id)).length,before+1);assert.ok((await calls()).some(c=>c.action==='collections.get'&&c.input.attemptId===first.value.attemptId));
    await clickButton('取消本次同步');await textVisible('本次同步已取消');const cancelled=(await calls()).filter(c=>c.action==='collections.cancel').at(-1);assert.equal(cancelled.input.attemptId,first.value.attemptId);await capture(`cancelled-${width}`,['AC-WECHAT-STATE']);await record('执行fixture：只开始一次、在途重复禁重、刷新原ID、取消原ID',{width,attemptId:first.value.attemptId});
    await setControl(account.id,{mode:'complete'});await clickButton('同步数据');await textVisible('数据同步完成');const done=(await calls()).length;const observationUntil=Date.now()+2500;await poll(()=>Date.now()>=observationUntil,'跨原2秒轮询间隔观察');assert.equal((await calls()).slice(done).filter(c=>c.action==='collections.get').length,0);await capture(`complete-${width}`,['AC-WECHAT-STATE']);await record('执行fixture：终态停止同步状态轮询',{width});
    await setControl(account.id,{mode:'running',startResponseLossToken:crypto.randomUUID()});await clickButton('同步数据');await textVisible('同步请求结果尚未确认，请核对上次请求。');const unknown=(await starts(account.id)).at(-1);await capture(`unknown-${width}`,['AC-WECHAT-STATE']);await clickButton('核对上次同步请求');await textVisible('正在同步数据');const recovered=(await starts(account.id)).at(-1);assert.equal(recovered.input.clientRequestId,unknown.input.clientRequestId);assert.equal(recovered.value.attemptId,unknown.value.attemptId);await setControl(account.id,{startResponseLossToken:null});await clickButton('取消本次同步');await textVisible('本次同步已取消');await record('执行fixture：HTTP 502响应丢失，用户沿原key核对同attempt',{width,attemptId:unknown.value.attemptId});
    await setControl(account.id,{mode:'partial'});await clickButton('同步数据');await textVisible('数据同步未完成，可继续原任务');const partial=(await starts(account.id)).at(-1);await capture(`partial-${width}`,['AC-WECHAT-STATE']);await setControl(account.id,{mode:'running'});await clickButton('继续同步');await textVisible('正在同步数据');const continued=(await starts(account.id)).at(-1);assert.equal(continued.input.clientRequestId,partial.input.clientRequestId);assert.equal(continued.value.attemptId,partial.value.attemptId);await clickButton('取消本次同步');await textVisible('本次同步已取消');await record('执行fixture：普通partial用户继续同key和同attempt，不自动新任务',{width});
    await setControl(account.id,{mode:'timeout'});await clickButton('同步数据');await textVisible('本次同步等待结束，已取得数据保留');const expired=(await starts(account.id)).at(-1),timeoutCount=(await starts(account.id)).length;await capture(`timeout-${width}`,['AC-WECHAT-STATE']);await page.reload({waitUntil:'domcontentloaded',timeout:120000});await buttonState('重新同步',false);assert.equal((await starts(account.id)).length,timeoutCount);await setControl(account.id,{mode:'running'});await clickButton('重新同步');await textVisible('正在同步数据');assert.notEqual((await starts(account.id)).at(-1).input.clientRequestId,expired.input.clientRequestId);await clickButton('取消本次同步');await textVisible('本次同步已取消');await record('执行fixture：原期限结束仅用户重新同步建立新intent，刷新不重发',{width});
    await setControl(account.id,{mode:'needsAuth'});await clickButton('同步数据');await textVisible('登录已过期，请重新扫码');await clickButton('重新扫码登录');await page.waitForSelector('loc=role:dialog[name="重新登录视频号账号"]',{state:'visible',timeout:120000});await capture(`needs-auth-dialog-${width}`,['AC-WECHAT-STATE']);await page.keyboard.press('Escape');await noDialog();assert.equal(await page.evaluate(()=>document.activeElement?.textContent?.trim()==='重新扫码登录'),true);await record('执行fixture：needsAuth显示原扫码弹窗，Esc返回触发入口；未认证、未验证扫码恢复',{width});
    // 原A任务get人为挂起，实际UI切组卸载后才返回；不伪造B服务归属。
    await setControl(account.id,{mode:'running'});await clickButton('核对同步状态');await textVisible('正在同步数据');const gate=crypto.randomUUID();await setControl(account.id,{getGate:gate});await clickButton('核对同步状态');await poll(async()=>(await calls()).some(c=>c.action==='collections.get.waiting'&&c.input.gate===gate),'原组状态读取进入在途');
    await switchGroup(B);const other=B.accounts.find(a=>a.platform==='wechatVideo');await openMember(other);await capture(`group-switched-${width}`,['AC-WECHAT-SCOPE']);await setControl(account.id,{getGate:null});await poll(async()=>{const log=await calls(),waiting=log.find(c=>c.action==='collections.get.waiting'&&c.input.gate===gate);return log.some(c=>c.action==='collections.get'&&c.input.accountId===account.id&&c.at>=waiting.at);},'原组迟到get归还');
    assert.equal(await page.evaluate(id=>document.querySelector('[data-testid="native-report-panel"]')?.getAttribute('data-account-id')===id,other.id),true);assert.equal(await page.evaluate(name=>document.body.textContent.includes(`${name}的作品与数据`),account.accountHandle),false);
    const blocked=await dispatch('platforms.reports.list',{params:{accountId:account.id},query:{pageSize:20,cursor:null}},{groupId:B.id,accountId:account.id},true);assert.equal(blocked.status,404);await record('真实public组/成员与归属guard：切B后A迟到回执未覆盖B，跨组A报表被404拒绝',{width,fromGroup:A.id,toGroup:B.id});
    await setControl(other.id,{canCollect:false});await page.reload({waitUntil:'domcontentloaded',timeout:120000});await textVisible('当前平台的数据同步暂不可用，已有报表仍可查看。');await buttonState('同步数据',true);const disabledCount=(await starts(other.id)).length;await page.evaluate(()=>[...document.querySelectorAll('button')].find(b=>b.textContent?.trim()==='同步数据').click());assert.equal((await starts(other.id)).length,disabledCount);await capture(`capability-disabled-${width}`,['AC-WECHAT-STATE']);await record('能力read fixture：canCollect=false保已取得报表，禁提交，不制造身份proof',{width});await setControl(other.id,{canCollect:true});
    const emptyAccount=B.accounts.find(a=>a.platform==='wechatOfficial');await setControl(emptyAccount.id,{mode:'empty'});await openMember(emptyAccount);await textVisible('尚无后台报表，可点击“同步数据”读取当前账号数据。');await capture(`empty-${width}`,['AC-WECHAT-REPORT']);await record('read fixture：真实空报表提示，没有把空数据补成指标',{width});await switchGroup(A);
  }
  await drainEvents();assert.deepEqual(browserErrors,[]);assert.deepEqual(external,[]);assert.equal(command(['rev-parse','HEAD']),server.head);for(const source of server.sourceWitness)assert.equal(await sourceSha(source.path),source.sha256);outcome='passed';
}catch(error){outcome='failed';steps.push({at:new Date().toISOString(),action:'当场失败',error:String(error.stack??error)});await capture('failure',['AC-WECHAT-STATE']).catch(()=>{});process.exitCode=1;throw error;
}finally{
  for(const accountId of Object.keys(controls.accounts)){controls.accounts[accountId].getGate=null;controls.accounts[accountId].startGate=null;}await fs.writeFile(server.control,JSON.stringify(controls));
  const scope='同一Ego空间20/指定隔离Page、完整影子Next正式路由SSR/原组件与真实公开账号组服务；报表为私人实下载脱敏代表投影，原始值/日期/单位保留，text/opaqueId脱敏；服务read及执行状态为fixture，未绑定微信/认证/实时采集；真实平台下载证据由root另记';
  await fs.writeFile(path.join(server.output,'actual-visible-copy.json'),JSON.stringify({schema:'frontend-visible-copy/v1',task_id:'T-1110',commit_sha:server.head,evidence_scope:scope,source_witness:server.sourceWitness,captures},null,2)+'\n');
  await fs.writeFile(path.join(server.output,'journey-results.json'),JSON.stringify({task_id:'T-1110',outcome,startedAt,completedAt:new Date().toISOString(),browser:version,ego:{spaceId:task.spaceId,pageLabel:page.label},evidence_scope:scope,serverState:serverFile,data_witness:{mode:witness.mode,sourcePackSha256:witness.sourcePackSha256,observationRole:witness.observationRole,witnesses:witness.witnesses},steps,requests:requestLog,calls:await calls(),browserErrors,external,source_witness:server.sourceWitness,receiptWritten:false},null,2)+'\n');
  await page.cdp('Network.setBlockedURLs',{urls:[]},{timeout:120000}).catch(()=>{});
  // root仍在同一个用户目标工作，不能由此子旅程finish整个空间或关闭真人Page；root统一收尾。
  console.log({task_id:'T-1110',outcome,evidence:server.output,frontendReceipt:'未写PASS；root须检查当场截图/后置条件/控制面'});console.log(await page.snapshot());
}
