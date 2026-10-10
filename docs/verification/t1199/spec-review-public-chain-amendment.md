# T1199 公开链闭合增补独立只读评审

结论：PASS（仅该合同增补；不代表实现、测试、Gate 或安装验收通过）。

SPEC SHA256：f72d00d833efbf9394f9d65a89ad1d6989e761de4b2ae61b74d5a15906ad0b72。
评审时间：2026-10-10T21:05:30.567259+08:00.

原 code-review.md FAIL 保留，不能覆盖成通过。本次未改仓库、控制文件、任务或 Git，没有读取真实数据库/凭据或执行用户任务。

## 归属与证明上下文

增补规定先对原 user/group/实际 membership 验证，之后仅证据 port 使用已经核实的目标 accountId 和实际 membershipVersion。这能关闭选 A 读 B 合法旧证明时 platformCollection.ownedAccount 的误拒绝，不扩大跨组、跨用户读取，不伪称当前登录。应保 caller ctx 不突变；跨组/用户/无组零证据调用以及归档不调用证明仍应成立。根同一函数继续用于 startup，不创造账号/任务/凭据。

## 纯组历史的真实消费者

已只读核代码，纯组历史方案当前真实支持，无须放宽原权限：

- frontend/src/lib/http-transport.ts creatorApiHeaders 对显式 scope {groupId,accountId:null} 删除账号 header，仍携带冻结 group header，不读取动态账号/同步改变全局选择。
- frontend/src/lib/request-context.server.ts resolveRequestContext 先验 user，空账号不触发 archived 当前身份门，verifyGroupSelection 经 accountGroupService.get 验该 user 的真实组。原 archived 账号 header 拒绝保持。
- backend/src/modules/scheduling/scheduling.repository.ts listRunsByJob 先校验实际父 job user，纯组仍要求父 job 当前 group 或该组旧历史；返回行再次限 user+job+group。getRun 限 user+真实 run.group，再核父 job user，纯组不放弃组门。
- backend/src/modules/ai/ai.service.ts listSteps 经 repoFor(requireWorkspace) 和 requireTask；ai.repository.ts getTask 实际 WHERE 同时 user+workspaceFilter+task ID，workspaceFilter 在组范围为 ai_tasks.group_id。随后 listSteps 再经 getTask。故同组 archived 账号的真实 task 步骤可读，异组/异用户不可读；无对应组父任务的旧步骤应按原合同拒绝，不可自动搬历史或删守卫。
- contract/src/workspace-operation-scope.ts jobRuns.listByJob/jobRuns.get/ai.tasks.steps.list 已为 group，属既有授权，不需要新增写能力。

仅归档成员的历史读取使用纯组；活跃读取与所有开关/编辑/立即运行仍原 job.accountId，避免把只读组客户端扩散为写客户端。SPEC 明确修订原必须携账号 header 文字，消除前后相互矛盾，未偷偷更改原 active 身份门。实际前端必须根据成员真实 status 选择，未知成员不得擅自冒充归档。

## 错误与异步

按 job.id 显示 toggle 真实错误、不 refresh、不伪造 controlled 成功，保迟到/卸载保护；form 新开与明确新提交清旧错误、当前失败保留输入；独立 Promise 立即收纳 reject 并最终按原故障抛出，这些均关闭代码审计缺口，不将错误归零或假称无任务。

## 实施后必须留的证据

新增测试写集范围充分，原测试/公开守卫不可放宽。纯组方案须实际隔离公开 dispatch 不仅 service/Mock fetch：至少 jobRuns.listByJob、jobRuns.get、ai.tasks.steps.list 三条真实父链含 archived，同用户异组和异用户拒绝，archived 写 header 仍拒绝；历史确无 aiTaskId 时应另造中性隔离真实 parent+step 样例，而不是声称步骤测试过了。

还需目标 proof ctx 传参和原 ctx 不突变、打开A→筛选B→提交仍A、同组纯组历史 header vs mutation 原 header、切组迟到错误不回写、toggle 500/404错误反馈与 pending 清理、失败关闭重开无旧 formError、组读 fast reject + jobs deferred 最终拒绝且无未处理 rejection。它们是既有 SPEC 验收落实，不修改真实用户任务。

本次只确认合同与当前纯组消费者支持。原实现 FAIL 需收到实际后续 diff 和对应真实验证后另复核；不把此 PASS 当产品通过。
