# T-915 本地读取接入持久工具执行

本批将 `local.read` 接入 `createChatTaskToolHost` 的可选 `localRead` 端口。宿主从任务恢复真实账号与冻结定义，复用原参数、授权判定和卡片。读取使用上一批提取的宿主；原有工具执行账本负责独占执行、保存结果和回放。

```mermaid
flowchart LR
  W[独立 Worker 请求读取] --> L[后端账本核对调用和租约]
  L -->|已有回执| OLD[直接返回原正文窗口]
  L -->|首次执行| A[当前授权与真实路径检查]
  A --> F[宿主读取]
  F --> S[账本保存结果]
  S --> M[正文进入下一轮模型]
  F -->|未取得确定回执| U[结果未知：禁止盲目重读]
```

一次授权的消费仍属于 `committed`，没有降为纯读来绕开账本。宿主异常不会被旧工具的 catch 转成可安全重试的无副作用结果。已保存回执直接回放；读取成功但回执未保存时保持 unknown_result，不补授权、不换调用键重读。

目标尚需授权或选择时，原 `needApproval`、`foundByName`、`candidates` 卡片附带既有 `chat_authorization_required` 标记。用户显式恢复后，原阻断可以回放，新调用重新检查权限。二进制等硬拒绝继续返回原因，不能通过授权恢复标记绕过。

## 实际证据

- `chat-local-read-durable-red.log`：统一宿主缺少 local.read，10 项测试失败。
- `chat-local-read-durable-worker-red.log`：第一次真实入口测试因测试代码引用未导出的函数失败，只是测试装配错误，不计为功能红测。
- `chat-local-read-durable-entry-red.log`：修正测试导入后，真实 Worker 未能发出预期模型请求（0／2），功能红测失败。
- `chat-local-read-durable-resume-red.log`：缺恢复标记时，用户恢复后仍仅有 1 次模型请求（预期 3），复现恢复循环。
- `chat-local-read-durable-backend-final.log`：23 项通过，涵盖专属宿主、原本机工具与同参账本复用；账号、版本、取消、授权与硬拒绝均验证。
- `chat-local-read-durable-worker-final.log`：4 项通过。真实构建并 fork Worker，通过本地 HTTP 模型 fixture、后端数据库、临时文件和现有授权表验证正常读取、显式授权恢复、结果回放、未知结果禁止恢复重跑，另包含上一批正式入口取消回归。正常读取使用正式 runtime 端口；按名查找的恢复场景注入临时搜索根，未访问用户文件。
- 回放验证在任务仍运行时新建后端服务实例读取原账本：文件已改变、一次授权已消费，仍返回原正文，读取次数不增加。这证明持久回执不依赖原服务闭包缓存，不冒充整个桌面进程重启验收。
- 只读独立复审发现恢复标记缺口，修复后确认其与硬拒绝的区分；审查者未运行测试，不计独立测试证据。
- `chat-local-read-durable-types.log`：前后端类型检查通过。`pmem sync` 已运行；`chat-local-read-durable-reconcile.log` 仍为既有 211 errors／1 warning。范围与复杂度检查通过；boundary 无新增、剩余 5 条；orphan 为 0 errors／100 warnings。全局对账不标绿，T-915 不完成。

## 整体缺口仍真实保留

`chat-local-read-durable-fullscene.log` 仍为 1 FAIL／4 skipped，模型请求 0，`CHAT_WORKER_INPUT_UNAVAILABLE`。已给完整场景装配新增本地读取端口，未裁剪原工具范围。缺口从 10 项降至 9 项：`topic.generate`、`script.draft`、`publish.package`、`cover.generate`、`knowledge.distill`、`calibration.diagnose`、`material.screenshot`、`web.read`、`material.generate`。

该完整场景尚未启用已有的可选网页 Worker 装配。其他聊天场景也仍有待迁移工具。正式 `/api/chat` 默认入口尚未切换，UI 授权恢复的完整旅程、真实供应商、性能样本与双平台安装包仍未全部验收。原宿主文件句柄竞态及可确定无副作用文件系统错误的更细分类仍需继续处理，不宣称本地读取的所有故障已经根治。
