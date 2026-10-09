# 本轮测试工程恢复证据

所有失败日志保留；不删除场景、跳过、增 timeout 或放宽生产 guard。

- account-isolation：原 RED 1 failed/18 passed 是旧技术英文断言；现按当前服务合同严格断言跨号 404 / OwnershipError / 工作区人话，19/19 GREEN。
- script-worker-entry：原完整 5 场景保留。T-921 已批准全节点共享两次格式修复，repairAttempts=0 的畸形分镜准确 3 次调用、两次修复含原 `{}`；保真不一致仍拒绝且已完成正文保留。等待用户的恢复走真实 execution.tasks.command resume 原任务，禁止复制已绑定任务，校验原 execution/预算/截止/已调用账本及一次 compose。5/5 GREEN，frontend-script-worker-recovery-green.log。早前并发构建的 script-startup log 被中止 exit130，不视为通过。
- startup-safety：当前浏览器公开共享池→真实 Worker profile context 两端静态合同，仍保桌面无 CLI/下载与 packaged 缺浏览器明确拒绝。11/11 GREEN，frontend-startup-contract-vitest-green.log。误用 node --test 的入口错误日志仍保，不算产品 RED。
- publication 搜索：正式手工登记真实链路原 owner 命中；其他正常创建工作区与其他操作者，经真实 pages.search.get 全部/video 窄化两次查询均空、count0。原 5 输入场景内补反例，5/5 GREEN，frontend-search-scope-green.log。

真实 Worker 工厂 14 场景的测试供应商修复按父工具声明区分父/子流式结构化响应，使用正常账号组/成员/项目来源；完整原场景仍保，fixture provider 为合成 loopback，不冒称真实外部模型。精确 RED 为 4失败/10通过；两个生产组遗漏修复后 12通过/2失败，剩余素材采纳装配仍是未通过，见 GROUP_GENERATION_REPAIR_PROPOSAL.md。不能称整个全量或正式安装版已验收。
