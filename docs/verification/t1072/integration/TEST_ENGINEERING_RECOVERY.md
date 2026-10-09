# 本轮测试工程恢复证据

所有失败日志保留；不删除场景、跳过、增 timeout 或放宽生产 guard。

- account-isolation：原 RED 1 failed/18 passed 是旧技术英文断言；现按当前服务合同严格断言跨号 404 / OwnershipError / 工作区人话，19/19 GREEN。
- script-worker-entry：原完整 5 场景保留。T-921 已批准全节点共享两次格式修复，repairAttempts=0 的畸形分镜准确 3 次调用、两次修复含原 `{}`；保真不一致仍拒绝且已完成正文保留。等待用户的恢复走真实 execution.tasks.command resume 原任务，禁止复制已绑定任务，校验原 execution/预算/截止/已调用账本及一次 compose。5/5 GREEN，frontend-script-worker-recovery-green.log。早前并发构建的 script-startup log 被中止 exit130，不视为通过。
- startup-safety：当前浏览器公开共享池→真实 Worker profile context 两端静态合同，仍保桌面无 CLI/下载与 packaged 缺浏览器明确拒绝。11/11 GREEN，frontend-startup-contract-vitest-green.log。误用 node --test 的入口错误日志仍保，不算产品 RED。
- publication 搜索：正式手工登记真实链路原 owner 命中；其他正常创建工作区与其他操作者，经真实 pages.search.get 全部/video 窄化两次查询均空、count0。原 5 输入场景内补反例，5/5 GREEN，frontend-search-scope-green.log。

真实 Worker 工厂 14 场景的测试供应商修复按父工具声明区分父/子流式结构化响应，使用正常账号组/成员/项目来源；完整原场景仍保，fixture provider 为合成 loopback，不冒称真实外部模型。精确 RED 为 4失败/10通过；两个生产组遗漏修复后 12通过/2失败，剩余素材采纳装配仍是未通过，见 GROUP_GENERATION_REPAIR_PROPOSAL.md。不能称整个全量或正式安装版已验收。

## 最后全量两项失败的真实修复

`frontend-engineering-final-full.log` 完整运行 exit1：414文件2失败/411通过/1跳过；3612项2失败/3608通过/1跳过/1todo，474.16秒。使用仓库原20000ms及各测试原显式预算、maxWorkers2、retry0；没有超时覆盖。此失败绑定源码3a551fb58c369f310dd13fde97cc246efbb90a8e，运行开始HEAD4491de43但已有该提交全部源码，运行中未改源码。

聊天读取原5场景中完整装配失败，真实报“原任务缺少生成节点 Skill”。测试漏了现prepare-chat-reply的已批准Skill集合、worker/atomic冻结选项及composeChatProduction完整工具端口。仅test修复：复用requiredSkillIdsForTask并保所有生成Skill/完整白名单；注入真实runtime宿主端口，factory捕获实际composition的webRead服务并原样调用原factory（不空stub）；供应商按工具定义区分父/子SSE，不再把stream当父身份。保4实际HTTP请求=3父1子、账号隔离、完整工具、2消息/候选、6实际settled调用。逐步失败日志frontend-final-two-fixtures-green.log、frontend-chat-read-host-complete-green.log、frontend-chat-read-host-production-options-green.log仍准确FAIL；最终frontend-chat-read-host-real-ports-green.log 5/5 exit0。

桌面原4场景中复制入口测试失败并非缺依赖，而是构建后用共享ai-worker/dist与staged bytes做deepEqual；另一并行真实构建的cwd不同改变bundle路径注释，1134164与1134830字节不等。test-only以临时source-repo复制真实src/scripts/package.json，依赖指向现真实node_modules，执行原生产builder仅写隔离dist，再保完整bytes deepEqual；从隔离资源解析声明依赖、原返回路径、包外cwd、真实fork及model.generate/model.structured ready能力均保持，原10000/15000ms预算不动。frontend-final-two-fixtures-green.log桌面4/4通过，聊天当次仍1失败，不能把联合日志整体称GREEN。未改生产stage helper、guards或原四场景。

三生产组修复3a551fb5独立实现复核已完成，报告位于Growth completion/creator-group-generation-implementation-review.md，精确三文件未发现新增具体guard blocker。其14/82/15/1证据不替代整套或正式安装版。最终全套仍须重跑，母提案未批准未实现。

最终重跑frontend-final-repaired-full.log exit0：414files413通过/1跳过，3612tests3610通过/1跳过/1todo，581.41秒。源码6dd9db7a冻结、maxWorkers2/retry0、无timeoutoverride。skip/todo不算通过；真实安装/双机/母新增行为仍未验。

## 已授权的后台四文件测试工程写集

原 backend-control-lessons-real.log exit1：26文件4失败/22通过，747项7失败/740通过，91.99秒；源码6dd9db7a，maxWorkers2/retry0，无timeout覆盖。保留全部原场景和失败日志。

1. backend/src/application/collection/cover-file-repair.test.ts：原1失败/1通过；T1022 §60/63/70 的父项目、产物与工作区锁要求下，旧fixture引用不存在的output。通过正常组/账号/Projects公开创建真实父对象，原文件删除、补采、版本和好封面回读均保。
2. backend/src/application/queries/dashboard-read-performance.test.ts：原3失败/1通过；当前AnalyticsRollupDTO的finishAvg是number|null，mock漏字段产生undefined。补真实null，保共享读取、跨号隔离、慢摘要、失败恢复与计量断言。
3. backend/src/modules/ai-runtime/chat-tools.test.ts：原2失败/221通过；当前已批准Redfox严格action union不允许混入其它动作字段。保全部工具/两种改稿变体，补六合法动作及混字段、非法值拒绝；不改production parser/guard。
4. backend/src/modules/intelligence/transcript-runner.test.ts：原1失败/2通过；T632持续恢复与当前bounded RecoveryWakeCoordinator装配一致。真实coordinator按maxTasks4/concurrency2多波处理25原任务，校验单lane不重叠、原IDs全部完成、stop后零新调用；保原其它两场景与原时间预算。

父已精确授权仅上述test文件及证据，不改production maxTasks/concurrency/strict guard，不删测试、不增timeout。

首轮4files为2失败/230通过：仪表盘4/4、工具223/223通过，封面与队列原5s超时。随后单worker诊断的所有4个DB场景仍5s超时，backend-four-fixture-budget-diagnostic.log保。按仓库既有beforeEach/afterEach fixture模式，每例真实createDb全部迁移初始化与关闭独立执行，原业务测试5s预算、hook默认预算均不改；不把迁移失败排除，hook失败仍算整例未通过。修正测试driver把maxTasks4/concurrency2/control传入drain真实第二options参数，保原第一轮失败不冒GREEN。

最终 backend-four-fixture-real-ports.log exit0：4files/232tests全部通过，16.48秒，maxWorkers2/retry0，无timeoutoverride。封面补入production同源resolveOutputOwner、真实membership锁、assertTargetAccount、assertCoverOwned后正常恢复；中间缺端口两份FAIL完整保。队列25原IDs全部succeeded、queued0、每波maxTasks4/concurrency2、单lane最大1、真实ASR最大2及stop后wake/run零新增均通过。实际4文件SHA256绑定backend-four-fixture-result.json。后台全tsc当前仍FAIL：初轮17项含本轮5项已修；其它测试旧接口须独立同基线核查，未声称后台类型全部通过。
