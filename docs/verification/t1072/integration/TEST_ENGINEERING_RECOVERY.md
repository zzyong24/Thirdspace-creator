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
