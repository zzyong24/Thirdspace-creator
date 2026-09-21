# T-1022 模型生成非阻断恢复验证

## 实现结论

- 内容雷达的模型超时、网络故障和结构不完整进入持久化 `retry_wait`，保留拆解、选题和草稿检查点。
- AI 助手的普通生成错误和模型断流显示“正在恢复本轮生成”，沿原 `sourceMessageId` 与原执行任务重连，不显示手动重试按钮。
- 模型断流调用记为 `superseded`。只有模型候选可使用该状态；预算继续按预留量占用，同键重试必须引用原调用。
- 没有可用文本模型时进入 `waiting_user`，内容雷达和 AI 助手都提供 `/settings?highlight=text-model` 入口。
- 用户取消仍停止；真正未知的工具或外部副作用调用仍要求对账，不会自动重放。

## 自动化证据

- AI Worker：4 个文件、35 项通过。覆盖非流式网络断开、流缺少 finish、流内 error、部分正文后断网、429、Pi 流、主动取消和内容雷达生成。
- Backend：T-1022 核心 5 个文件、87 项通过；检查点与最终聊天提交补充 2 个文件、56 项通过。覆盖账本预算、`superseded` 同键重试、持久任务重领、结构化子节点恢复、最终消息提交和内容雷达状态。
- Frontend：3 个文件、112 项通过。覆盖内容雷达自动恢复、模型设置入口、AI 助手断流自动恢复、真正未知外部结果不重发。
- 类型检查：`contract`、`ai-worker`、`frontend` 通过。
- `backend` 全包类型检查仍失败，输出只包含开始本任务前已存在的测试类型债（素材执行 mock、旧聊天依赖、缺失 topic adapter、旧转写导出、旧 script patch 输入等）；本任务文件没有新增 TypeScript 错误，未将全库状态写成全绿。

## 安装版验证

- 验证日期：2026-09-21；候选提交：`cb2422cf134eb705960ed432f7527a8f8202fe7d`。
- `pnpm -C frontend desktop:package-local` 成功：前端静态页 27/27、sidecar 内置课程与依赖闭包自检、混淆后真起 sidecar、`GET / = 200`、浏览器 hydration 均通过；Tauri `release-fast` 构建成功。
- 唯一验收包：`/Users/zyongzhu/Downloads/CreatorOS-1.2.0.dmg`；SHA-256 为 `32124eae561e7a87be1aef220513110a2d0ea4405cc04afcc2ab4448abfdcce8`；`hdiutil verify` 返回 `VALID`。
- 已覆盖安装并真实启动 `/Applications/CreatorOS.app`；`CFBundleShortVersionString` 与 `CFBundleVersion` 均为 `1.2.0`，`codesign --verify --deep --strict` 通过。打包脚本首次启动 PID 为 `85385`；最终复查发现桌面进程已退出后再次正常启动为 PID `93353`。
- CLI 自动开启并连接安装版：首次及最终重启后 `creatoros status` 均返回 `mode=installed`、`connected=true`、`access=full`；最终重启约 4 秒后自动恢复完整访问，10 秒复查仍在线，无需重新开启权限；公开契约暴露 258 个操作。
- 使用唯一账号 `acct-ae1a8346-9` 做只读冒烟：`settings.models.list` 成功回读默认文本模型 `minimax / MiniMax-M3` 且 `hasSecret=true`；`execution.tasks.list` 成功回读最近 10 个 `topic_preview` 任务，最新任务为 `succeeded`。本轮没有修改账号、模型或业务数据。
- LED-052 最终回归重新执行并通过：AI Worker 35/35、Backend 87/87、Frontend 112/112。
- `pmem sync` 成功；全局 `reconcile` 中 LED-052、物理边界、孤儿扫描、资产、文档和其余 lesson 门卫均通过。全局命令最终返回失败，仅因为 T-703、T-691、T-656、T-645、T-635 五个旧任务的 review receipt 在 constitution hash 变化后过期；该既有治理债务不属于 T-1022 验收范围。
- 当前电脑控制接口未暴露 CreatorOS 原生窗口，因此没有补拍人工页面点击证据；安装版真实进程、内嵌 sidecar 启动与 hydration、公开 CLI 业务读取，以及可控故障注入回归共同作为本次安装版验收证据。
- 本地包为 ad-hoc 签名且未公证，release manifest 如实记录 `signed:false`、`notarized:false`；仅用于本机安装验证，不作为对外正式发布包。

## 真实页面旅程

- 验收提交：`bc6064f8c351a992d672b975f8d74b2860b82da6`；严格回执：[T1022-FRONTEND-VALIDATION.md](../../orchestrator/T1022-FRONTEND-VALIDATION.md)。
- 新增真实 Next.js + Chrome 旅程 2/2：1280×720 下验证未配置模型时保留输入并直达设置；900×600 下先注入 503，验证自动恢复状态与无手动重试按钮，再返回完整 UI message stream，确认原对话收到完整候选。
- 两次恢复请求的最后一条用户消息 ID 完全相同，请求总数为 2；证明页面沿同一轮续跑，没有新建重复用户轮次。
- 旧 `ai-recovery-guidance` 旅程从“未知故障手动重试”同步为自动恢复后重新执行，4/4 通过。
- `taskctl complete T-1022` 依据该旅程重新执行 allowlist 命令并通过，记录 4 项 acceptance check、3 份可见文案捕获，任务状态已更新为 ✅。
