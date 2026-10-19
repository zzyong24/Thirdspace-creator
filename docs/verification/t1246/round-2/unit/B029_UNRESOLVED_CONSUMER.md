# B029 仍未解决的真实消费链

本记录来自当前源码只读核查，不是新增模型或公共整链测试。三族首轮原失败继续保留；本轮没有修改该文件、提高调用预算或增加工具。

真实链为 `runAgenticInWorker` → `PiAgenticEngine`（wrapStream）→ `wrapDurablePiStream` → `windowAgenticContext`，`agentic-worker-run.ts:86-89` 明确绑定 durable wrapper；`durable-pi-stream.ts:90` 在 intent-v1 continuousContext 中调用窗口。不是聊天 Worker 的 `tool.result.read` 目录。冻结研究工具由 `agentic-research-tools.ts` 定义，当前链没有聊天分页读取工具。`execution-research-evidence.service.ts:16,29-34` 每页正文最多 12000 字，同一正文同时进入 `evidence[].text` 与 `data.text`。序列化后文本超过 24000 字，`continuation.ts:14-18` 将其变成首 16000 字和末 8000 字，并加入首尾提示及中间省略提示；完整回执仍在原宿主账本。

原测试 `agentic-research-worker.integration.test.ts:45-49` 对每条工具模型传输文本直接 `JSON.parse`，因此提示文本会触发 SyntaxError。即使删掉提示，中间缺失的 JSON 仍不完整。不能猜读缺口、从测试私下读账本代替模型获得证据，或把聊天工具硬塞进研究目录。

三族原输入分别为 maxCalls 20 / 10 / 8，原 expectedRequests 6 / 5 / 4，repair true / true / false；页面源和首尾正文断言、快照身份、采纳/幂等断言全部保留。当前失败在模型 fixture 读回执处，未完成后续调用账本、知识候选及采纳回归，不能把现有 expectedStatus 作为真实终态证据。低预算采纳行为仍待正式补充合同；不能改为 partial 后删掉原采纳断言宣称修复。

精确源码 SHA 见 `b029-durable-consumer-source-binding.json`。后续修法须明确传输和真实证据分页的消费者合同，经独立评审后执行原完整三族；当前保持未解决。
