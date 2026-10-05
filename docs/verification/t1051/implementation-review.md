# T-1051 独立实现复核

日期：2026-10-03。reviewer：`review_t1051`，独立只读会话；未修改代码、运行测试或操作浏览器。以下记录其当场消息结论。

首轮复核发现：文章 failed candidate 的 retryFrozenCandidate 没有在恢复执行前验证 `project_script` 来源。实现随后增加冻结来源校验，红测先证实旧行为仍提交任务，再修复并通过相关 49 项后端回归。

再次复核确认阻塞已关闭：`articles.service.ts:349-355` 在 durable resume（356 起）和普通 retry submit（371 起）之前遍历 `old.sourceRefs`，遇 `project_script` 强制要求并调用 `deps.assertProjectScriptSource(ctx, ref, String(frozen.projectId))`。readCandidateState 先校验 frozen project/output 归属并解析 refs，没有用未核验 projectId 绕过。

`project-script-source.test.ts:80-82` 将原文章任务置 failed，令来源端口不可读，断言 retry 拒绝且 calls 保持 3，证明未再次 submit。实现校验位置同时覆盖 durable resume。

复核未发现该修复引入或暴露其他 T-1051 范围内的新阻塞。此复核不代替真实模型、扫码或用户视觉验收。
