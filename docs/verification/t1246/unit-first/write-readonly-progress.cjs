const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const evidence='/Users/zyongzhu/.codex/worktrees/integrated-dev-acceptance/Thirdspace-creator/docs/verification/t1246/unit-first';
const roots={backend:'/Users/zyongzhu/.codex/worktrees/integrated-unit-acceptance/Thirdspace-creator',frontend:'/Users/zyongzhu/.codex/worktrees/integrated-frontend-unit/Thirdspace-creator'};
const at=new Date().toISOString();const observed=Object.entries(roots).map(([pkg,root])=>{const text=fs.readFileSync(path.join(evidence,pkg+'.log'),'utf8');const lines=text.split('\n');const files=lines.filter(s=>/^\s*[✓❯]\s+\S+\.(test|spec)\.[cm]?[jt]sx?/.test(s));const receipt=JSON.parse(fs.readFileSync(path.join(evidence,pkg+'-exit.json')));if(receipt.status!=='running'){const j=JSON.parse(fs.readFileSync(path.join(evidence,pkg+'.json')));const failed=j.testResults.filter(f=>f.status==='failed').map(f=>({file:f.name,sha256:fs.existsSync(f.name)?crypto.createHash('sha256').update(fs.readFileSync(f.name)).digest('hex'):null,classification:'pending_full_failure_causal_review'}));return {package:pkg,observedAt:at,partialOnly:false,countSource:'final_json',status:receipt.status,completedLogFileRows:j.testResults.length,failedLogFileRows:failed.length,failed};}const failed=files.filter(s=>/^\s*❯/.test(s)).map(s=>{const relative=s.trim().slice(2).split(' (')[0];const file=path.join(root,pkg,relative);return {observedLogLine:s,file,sha256:fs.existsSync(file)?crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'):null,classification:'pending_full_failure_stack'};});return {package:pkg,observedAt:at,partialOnly:true,status:JSON.parse(fs.readFileSync(path.join(evidence,pkg+'-exit.json'))).status,completedLogFileRows:files.length,failedLogFileRows:failed.length,failed};});
fs.writeFileSync(path.join(evidence,'readonly-failure-source-binding-in-progress.json'),JSON.stringify(observed,null,2)+'\n');
fs.appendFileSync(path.join(evidence,'progress.jsonl'),JSON.stringify({observedAt:at,partialOnly:true,packages:observed.map(x=>({package:x.package,status:x.status,completedLogFileRows:x.completedLogFileRows,failedLogFileRows:x.failedLogFileRows}))})+'\n');
const bindings=['backend/src/application/chat/assistant-system-root.integration.test.ts','backend/src/modules/ai/assistant-action-adoption.service.ts','backend/src/modules/intelligence/intelligence-workspace-scope.ts','backend/src/modules/platform-account/membership-lock.service.ts','backend/src/modules/intelligence/intelligence.service.ts','backend/src/application/chat/assistant-system-root.ts'].map(p=>({file:path.join(roots.backend,p),sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(roots.backend,p))).digest('hex')}));
fs.writeFileSync(path.join(evidence,'t1074-lock-source-binding.json'),JSON.stringify({candidate:'533224f334c43cdb81a344424e420cad93784dd1',observedAt:at,bindings},null,2)+'\n');
const md=`# T1246 首轮失败只读分诊（进行中）

冻结候选 533224f334c43cdb81a344424e420cad93784dd1。更新时刻 ${at}。不改产品/测试/断言，不筛选或重跑。backend状态由进度回执记录；frontend原全559已结束exit1。运行中的部分日志不是整包最终数量；已结束包用真实JSON。缺完整stack的用例不猜归因。各个已出现失败文件精确绝对路径及SHA见 readonly-failure-source-binding-in-progress.json。

## 分类边界

| 类别 | 当场已能确认的事实 | 首轮结束后最小处置 |
|---|---|---|
| 已批准合同/清单漂移 | contract原43FAIL：T1199只读资格接口合法注册，穷尽清单及42entry旧404门未同步。已有独评 contract-first-diagnosis.md。 | 原registry/bootstrap两测试精确纳入一个已批准operation，保穷尽、唯一、42entry及sentinel。 |
| fixture/合同漂移 | worker原25FAIL：22项已核协议ACK、搜索URL、Pi superseded/格式修复、confirmedContext/退出ACK；3bundle已另实际startup-only证实旧fixture漏external @openclaw/fs-safe。 | 依worker-first-diagnosis.md的原八测试最小写集；下游尚未运行断言必须实际复验。原结果不覆盖。 |
| UI前置fixture漂移 | settings-interactive-region首轮80中52FAIL；真实偏好ready门新增，旧fixture未提供GET及等待Pi服务真值。52项不能全部机械归此因。 | 一测试文件补真实偏好GET/act等待，不mock掉ready门；完整80再验暴露下游。 |
| 真正产品需求违背 | 独评BC003已核封面chip与material/cover可达预填仍要求独立生图配置，违背Codex免配置合同。尚无本分诊独立UI点击回执。 | 按copilot-first-diagnosis两产品文件+原预填测试；保Pi、归属、参考资格与采纳门，并实际UI复验。 |
| 新增runtime字段/严格业务解析产品回归 | 主线程独评及本Agent只读核：persistent-task.service.ts:353/366统一payload追加executionRoute；account-binding.service.ts:61/103直接用严格startAccountBinding四字段schema解析整个payload，新绑定在staging/login前失败。原frontend12例中10FAIL，完整frontend首轮stack已归档；逐例真实到达阶段仍待复核。 | 最小生产叶子account-binding.service.ts投影已知runtime字段，未知业务字段仍严格拒绝；保scheduled父路由冻结，不给非AI绑定加模型前置。下游与每个negative分支须真实原例复验。 |
| 隔离PG/旧硬端口 | 本轮只持有50028，旧55422另任务不可连接。旧消费者真实抛guard/URL护栏时才单列ENV；不把有PG失败一概归旧端口。 | 原ENV失败保留，集中评审合法隔离实例marker/URL合同，禁止借用另任务55422或删除安全检查。 |
| 尚未确定 | backend完整stack尚待EOF；frontend其余族已有完整stack但调用因果/批准合同仍未核，例如文章、转录、成片精确ASR、作品保存等不能仅按名字归产品或fixture。 | 等完整JSON逐项核调用与原合同，再列最小写集。 |
| 真实覆盖缺口 | contract原config外2src测试另轮30PASS；Rust原101/0正文保留，补真实资源后267PASS/13ignored，但子--exact前缀/条件Python仍需证据；原生App用户不授权。 | 不相加独立/重叠回执，不把ignored/条件返回或包ready代签App、模型或全系统。 |

## T1074 父分类删除锁失败（单独核查）

实际原file日志75 tests / 1 failed，失败为父分类删除先持锁的公共采用竞态，约120344ms。该file beforeAll:50读取CREATOROS_T1074_ISOLATED_PG_URL，本轮runner实际50028，fixture(ctx.groupId)有真实账号组，另两PG候选编辑竞态当场PASS。它不是55422环境前置。

真实锁顺序：test:631的删除owner调用 intelligence.service.ts:2702 withIntelligenceWrite；intelligence-workspace-scope.ts:123先lockWorkspaceMembership；membership-lock.service.ts:41先account_groups FOR UPDATE，之后才分类父行DELETE。公共adoption assistant-action-adoption.service.ts:43也先同一group锁，之后assistant-system-root.ts:169才readCollection forUpdate。删除事务通过ready后保持hold，不提交。因此公共采用合法等待的是account_groups SQL，尚未到分类读SQL。

旧waitPgLock helper test:589–590只接受wait_event_type=Lock且query字符串含intelligence_collections，本例:635传此表名。合法的共同group锁不匹配，helper等待120000ms后抛“原SQL没有完成或进入行锁等待”，finally:640才release删除hold。源码因果强支持观察点漂移，不支持直接称产品PG死锁；完整首次failure stack仍待整包结束确认，尚未实际修/复测。事后本轮PG只读观察无残留测试连接/锁，不能反推失败瞬间具体PG状态。

集中后最小建议写集仅原assistant-system-root.integration.test.ts：以实际共同group锁/真实阻塞归属为观察点，同时保先阻塞、删除提交后拒绝、无孤儿分类、无采纳回执全部断言，并保其他真正父行竞争覆盖。不能删锁、不把所有FOR UPDATE捕成成功、不仅增大timeout。精确相关源码SHA见t1074-lock-source-binding.json。

~~~mermaid
flowchart LR
 D[删除owner先锁原账号组] --> H[等待测试释放hold]
 A[公共采用也先锁原账号组] --> W[合法等待account_groups]
 W --> T[旧测试只认分类SQL]
 T --> E[120秒观察耗尽后finally释放]
~~~
`;
fs.writeFileSync(path.join(evidence,'ROOT_CAUSE_REVIEW_IN_PROGRESS.md'),md);console.log(JSON.stringify(observed.map(x=>({package:x.package,status:x.status,completedLogFileRows:x.completedLogFileRows,failedLogFileRows:x.failedLogFileRows}))));
