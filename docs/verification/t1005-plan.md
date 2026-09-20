# T-1005 计划与连续执行验证（进行中）

当前实现把计划保存在原 `execution_tasks.payload.workbenchPlan`，由现有执行租约对 taskId、attempt、fence 和停止状态守门。`planRevision` 使用预期版本 CAS；只有同一计划重投幂等返回。成功步骤引用的本任务已结算成功工具回执必须存在，已成功步骤不可改写；产物引用须由后续服务注入核验。计划只是投影，任务状态、工具调用和费用继续由原账本持有。

Pi 循环新增可信 `readPlanStatus` 端口：模型输出正文时若计划仍有待办步骤，在原循环继续；无进展重复时返回 `CHAT_PLAN_NO_PROGRESS` 与步骤名；等待用户时返回 `CHAT_PLAN_REQUIRES_USER`。旧任务未提供计划端口时沿原行为运行。

本轮先执行缺模块／缺继续行为红测，再通过：`workbench-plan.service.test.ts` 3/3、`chat-pi-loop.protocol.test.ts` 6/6、ai-worker 类型检查。backend 全量类型检查仍有既存测试源码错误，当前 T-1005 文件未报新错。

## 后续接线

已加 `readWorkbenchPlan`/`saveWorkbenchPlan` 命名端口；实际 worker 对话在每轮结束时经当前 `ExecutionRef` 读取原任务计划。生产聊天装配可选的 `plan.update`，定义在提交时冻结，宿主工具经原 `reserveAgenticTool`/`startAgenticTool`/`executeAgenticTool` 链与同一租约保存计划。其参数无身份字段，成功状态仅由后端核对已结算工具回执/产物。旧冻结任务不追加工具。测试：`worker-runtime.test.ts` 32/32、`workbench-plan.service.test.ts` 3/3、`chat-workbench-plan-tool-host.test.ts` 1/1。`chat-assembly.test.ts` 新增的可选冻结用例通过；全文件运行 89 例中 26 例历史断言失败，未将其计作本任务通过。

**尚未验收：** `plan.update` 还未经过真实模型与原聊天完整工具账本集成测试；停止恢复、重规划、产物核验及多步最终交付仍需验证，不能把上述单测写成 AC-AW-01 PASS。backend 全量类型检查仍为相同的 14 处既有错误。T-1005 保持进行中。
