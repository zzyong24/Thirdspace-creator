# T-915：旧自主执行器消融记录

本次按用户授权删除重构；这是代码入口对比，不是业务验证。未运行测试、类型检查、构建或真实采集。

对比基线：`4dac2bf9`。检查对象：`frontend/src/server/persistence-client.ts`。

| 生产装配入口 | 删除前 | 删除后 |
| --- | ---: | ---: |
| `createAgenticExecutor(` | 3 | 0 |
| `createPiAgenticEngine(` | 1 | 0 |
| `createDeterministicAgenticEngine(` | 1 | 0 |
| `buildAgenticLlm` 引用 | 8 | 0 |
| `exec.agentic.collect` 独立 Worker 定义 | 0 | 1 |

- 删除旧 research/material/collect 注册及独占 LLM、Pi fallback、工具包装器。research/material 使用此前已接入的独立 Worker 真实工具。
- collect 决策接同一 agenticWorker；提交沿 `createCollectionToolPorts → startRun → runIntelligenceSourceTask`，真实采集仍在原 sourceRunner 消费者中，未证明浏览器物理迁移完成。
- `collect.status` 独立纯读，输入带新观察序号；回读再次核验账号、父任务幂等键、来源与 runId，不能把最初 pending 当终态。仅全部真实成功回执可投影采集成功。
- 子采集不继承一次工具调用的结束信号。执行级 abort 后回读父持久状态，仅取消状态才取消孩子；正常收尾、暂停、观察预算耗尽不取消已提交采集。
- 观察未完成保留原 child taskId/runId。执行结果为 partial；由于 AI 业务状态无 partial，业务投影 failed 并说明查看原采集任务。没有伪造待采纳建议。
- 被有意移除的能力是宿主确定性 fallback；现在不会用假定的固定步骤代替真实模型决策。模型、采集、登录、取消及恢复的运行行为仍待用户实测。

局限：父进程退出后，不新增跨进程父子取消协议；旧消费者仍负责子采集恢复。未新增采集数据库或另一套账本。
