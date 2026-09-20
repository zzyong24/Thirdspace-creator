# T-1005 计划与连续执行验证（进行中）

当前实现把计划保存在原 `execution_tasks.payload.workbenchPlan`，由现有执行租约对 taskId、attempt、fence 和停止状态守门。`planRevision` 使用预期版本 CAS；只有同一计划重投幂等返回。成功步骤引用的本任务已结算成功工具回执必须存在，已成功步骤不可改写；产物引用须由后续服务注入核验。计划只是投影，任务状态、工具调用和费用继续由原账本持有。

Pi 循环新增可信 `readPlanStatus` 端口：模型输出正文时若计划仍有待办步骤，在原循环继续；无进展重复时返回 `CHAT_PLAN_NO_PROGRESS` 与步骤名；等待用户时返回 `CHAT_PLAN_REQUIRES_USER`。旧任务未提供计划端口时沿原行为运行。

本轮先执行缺模块／缺继续行为红测，再通过：`workbench-plan.service.test.ts` 3/3、`chat-pi-loop.protocol.test.ts` 6/6、ai-worker 类型检查。backend 全量类型检查仍有既存测试源码错误，当前 T-1005 文件未报新错。

**尚未验收：**后端计划服务尚未通过真实聊天 Worker port 装配，模型也尚无可调用的计划工具；因此当前代码不构成 AC-AW-01 的产品闭环。T-1006 网关合并后接线、做真实模型/停止恢复回归，再按 taskctl 关闭本任务。
