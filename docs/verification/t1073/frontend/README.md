# T-1073 前端资源生命周期修复证据

本分区实现已审 SPEC 的 FR-004～007。基线 `e56cd2735774762908d59022aad265554849972a`，隔离分支 `codex/t1073-frontend`。源码、测试与证据限于 Packet 的 write_set；未写主控制面，未 push。

所有 `.log` 原始字节另存于 `raw-logs/*.raw.gz`，`raw-logs/SHA256.json` 记录原字节、gzip 与可读副本的 SHA-256。`normalize-evidence-logs.py` 先保存并验证原字节，再仅移除每行末尾 ASCII 空格/Tab 与文件末尾空行；非空文件保留一个终止换行，ANSI 控制码与红/绿内容不改。执行 `gzip -dc raw-logs/<日志名>.raw.gz` 可复原原始输出。本次全路径 `git diff --check` 不使用 whitespace 豁免。

大白话：正在回复、正在查看、等人确认的会话继续保留；无人查看且已完成的会话才回收。审核同项目只读一次；雷达保留完整历史，用较少的读取更新活跃任务；已成功的历史卡恢复后不再反复查。

```mermaid
flowchart LR
  A[实际页面取得会话] --> B[挂载或执行中：保护]
  B --> C[离开页面：原回复继续]
  C --> D[完成且无观察者]
  D --> E[按数量与消息容量淘汰]
  E --> F[回访读取服务端历史]
```

## 实现与实际消费者

- `AICopilotContent` 实际取得/释放观察者；`Chat` 的消息和状态回调触发闲置淘汰。保护已挂载、submitted/streaming、等待审批和协议中的待处理任务。闲置上限 16 个、序列化消息字符串长度乘 2 的估算上限 4 MiB；保护中的会话可超过该上限，不截断合法回复。淘汰解除 SDK 回调、transport、续流函数及取消控制引用，保留服务端历史和持久指针。
- 实际 Copilot 回访测试读取历史，切账号组不展示旧组回复；实际 SDK `Chat` 在 100 个其他 scope 压力下仍完成原回复。挂载中的单份 5 Mi 字符回复、审批中的会话受保护。
- 等待状态不一定有审批 part。实际 SDK 接收既有 `message-metadata` 通道中的 `{execution:{executionTaskId,status}}`；仅 assistant 的 metadata 原 ID 与本轮真实响应头 `x-execution-task-id` 回执相同、且状态属于待处理集合时保护。waiting_user/unknown_result/paused 的纯文本错误会话也能保护；succeeded/failed/cancelled 解除保护，不从错误文案分类，也不保护全部 error。没有新增公共读取或后台轮询。
- 用户明确停止且公开 cancel 命令获 HTTP 成功后，只释放对应原回合的本地观察归属；服务端 `cancel_requested` 不改写成 cancelled。组件捕获原会话的 SDK stop，只有该回合仍对应当前控制、未出现新回合时才中断原流；旧取消迟到不清除新回合关联、不停止新流，也不禁用新回合或新 scope 的停止按钮。403/500 不释放关联或停止 SDK。
- 预览缓存保存签名 URL 字符串，最多 256 项，过期自动释放元数据和清理 timer；没有缓存 Blob 或媒体字节。实际 `AssetThumbnail` 双消费者共用读取，过期重挂换取新 URL；失效和切 scope 后，迟到旧签名返回 null，不覆写缓存或组件。
- 实际 `ScriptReviewGate` / `ReviewSoftGateHint` 共用按账号组、账号、项目键分隔的读取；慢请求与 timer/focus/visibility 不叠加，隐藏停止安排。卸载移除监听者，旧 scope/project 结果不生效；保留 null 与 `newerReport` 比较。公共 transport 没有 AbortSignal，本次没有取消已发送请求。
- 雷达首次与 focus/重新可见/入队恢复按真实分页读取全部历史，返回真实 total 和原任务 ID。活跃作品每 3 秒按既有公开列表能力观察；可见空闲时每 60 秒发起完整发现，隐藏不扫，在途唤醒只记录一次补读。网络响应时间不算作调度保证。
- 持久任务读取使用实际 `listExecutionTasks` 的 `kind=radar_project_upgrade` + `ownerId` 筛选，完整分页寻找原 ID，按真实 V2 schema 校验并验证 scope。公开 `execution.tasks.get` 属于旧 `ai_tasks` 执行层，不能用于持久 V2 队列。本次公开契约不变。
- 实际 script/thesis/publish 卡的 `succeeded` 恢复一次读取后成为已完成并停止观察。原等待确认、采纳、失败、取消、暂停和持久任务剩余期限路径保留原回归。

## 当场 TDD 与回归

命令在本 worktree 的 `frontend/` 执行。有限测试均显式 `--testTimeout 120000 --hookTimeout 120000 --retry 0`，不安装或下载依赖，不续期持久任务。

| 原始证据 | 结果与限度 |
| --- | --- |
| `red.log` | 改生产代码前：9 失败、36 通过。最初审核与 Radar 两例含不合格夹具，不能把全部 9 例都算纯行为红测 |
| `red-consumers.log` | 先修正夹具、仍未改生产代码：真实双审核消费者在途叠加、隐藏继续扫、250 完成历史 33 次读、唤醒无补读等 4 例正确行为失败 |
| `green-stop-final.log` | 最终 10 文件、121 用例通过，含真实组件/Hook、SDK Chat、公共 HTTP Radar adapter、预览消费者与明确停止释放；`green-metadata-final.log` 的 116 例、旧 `green.log` 的 106 例保留为追加修复之前的结果 |
| `waiting-user-red.log` | 真实 Copilot 收到旧纯 text+error、公开 feed 提供等待原任务但未用于缓存归属：卸载后压力淘汰原会话，1 失败/1 通过；原始证据未覆盖 |
| `metadata-consumer-red.log` | 按主生产者串行确定的 metadata fixture，先改测试未改缓存：4 失败/7 通过，三种等待状态和卸载后迟到状态仍被淘汰 |
| `metadata-consumer-green.log` | 同一规范 fixture、只修前端保护与控制只读回执后：2 文件、14 用例通过 |
| `explicit-stop-red.log` | 初次停止测试 4 失败/12 通过；两例拒绝/失败取消误断言流式期间可见错误文案，不能算正确行为 RED；其中原会话缓存保留、新回合被旧 stop 中断是实际行为失败 |
| `explicit-stop-red-corrected.log` | 修正负例为公开请求已完成、按钮恢复与原控制保留，并增加新回合/新 scope 按钮条件，仍未改生产代码：3 失败/13 通过，accepted 后缓存仍保护、旧 pending 禁用新回合和新 scope 按钮 |
| `explicit-stop-green.log` | 同一正确行为用例加既有 Copilot 回归：3 文件、70 用例通过；真实停止按钮、SDK byte stream、HTTP cancel ack 和缓存压力，不仅测试 helper |
| `resource-counts-direct.log` | 100 scope：保留原消息 scope 15，估算消息字节 1,968,180，解除回调 85；另有一个新空会话。3 用例通过 |
| `led047-metadata.log` | LED-047 既有真实公共消费者与路由交互：8 文件、157 用例通过 |
| `typecheck-metadata-final.log` | `pnpm exec tsc --noEmit --incremental false`，exit 0；此前新增测试用了不支持的 getByRole exact 选项，失败保留在 `typecheck-metadata.log`，最终改为完整 name 正则匹配 |
| `typecheck-stop-final.log` | 明确停止修复后的同一 tsc 命令，exit 0 |
| `lint-stop-final.log` / `lint-metadata.log` / `lint-baseline.log` | touched source/test eslint exit 0；Copilot 的 5 条已有 hooks warning 与基线相同，未写成零告警 |

完整聚焦命令：

```bash
pnpm exec vitest run src/features/copilot/live-chat-session.test.ts src/features/copilot/live-chat-session.consumer.test.tsx src/features/copilot/chat-script-draft-card.test.tsx src/features/copilot/chat-thesis-card.test.tsx src/features/copilot/chat-publish-package-card.test.tsx src/features/copilot/ai-copilot-interactions.test.tsx src/features/draft-workbench/use-latest-script-review.test.tsx src/features/intelligence/use-project-upgrade-queue.test.tsx src/features/intelligence/intelligence-workbench-api.test.ts src/components/resources/asset-preview-url.test.ts --testTimeout 120000 --hookTimeout 120000 --retry 0
```

LED-047 命令：

```bash
pnpm exec vitest run src/features/copilot/ai-copilot-interactions.test.tsx src/features/knowledge/knowledge-dump-zone.test.tsx src/features/topics/topics-interactions.test.tsx src/components/overlays/overlay-routing.test.tsx src/lib/copilot-navigation.test.ts src/features/copilot/chat-tool-trace.test.tsx src/features/automations/run-controls.test.tsx src/features/automations/cadence.test.ts --testTimeout 120000 --hookTimeout 120000 --retry 0
```

已覆盖计数：250 条首次分页 3 次；30 秒仍为 3 次；60 秒发现外部原任务，合并 251 条；两个活跃原作品使用 ownerId 单项读取，不扫描 250 条历史。另验证同作品 101 条分页 2 页才能取得原 ID，切组 header 冻结，错组同 ID 不采纳，单项失败不饿死其他任务，enqueue 唤醒合并一次、scope/unmount 丢弃旧响应。

最初新增活跃 HTTP 测试暴露了旧 get/schema 与持久 V2 路由不匹配。曾尝试将 get 的 raw 回执解析成 V2；核对真实 backend 后撤回该推断，最终使用公开 ownerId 筛选列表。`green-final.log` 的该失败及中间修正日志保留，不能将中间实现当作最终验收。

等待状态补充消费者证明：实际 DefaultChatTransport + SDK Chat + AICopilotContent 的 waiting_user/unknown_result/paused 同原响应头 ID 会话在卸载、100 scope 压力后保留；succeeded/failed/cancelled 会被淘汰；无响应头或 metadata 原 ID 不匹配均不会被当成可靠关联。旧 scope 已卸载后迟到的 waiting metadata 只保留原 scope，新 scope 仍空。明确点击重试使用同一原消息和原执行 ID，waiting→succeeded 后解除保护，未自动提交第二次请求。

明确停止补充消费者证明：真实 SDK 流接收到 running metadata 后点击停止，规范 V2 cancel 回执为 cancel_requested，SDK 随后 ready，但消息 metadata 仍为 running，未伪写终态。原任务 ID 的公开 cancel 请求仅一次；卸载后 100 scope 压力可淘汰原会话，transport 回调解除，持久 conversation 指针仍存在。403 和 500 回执均不停止流、不释放原 header ID；卸载后压力仍保护原流。旧 cancel 慢回执遇到同会话新回合、或实际切账号组后新回合时，原请求冻结旧组 header，新的停止按钮可用，新流不被中断，新执行 ID 不被清除。本分区不增加后台真值轮询；接受停止仅表达 client relinquish，不判断服务端已取消。

没有 header 控制回执的历史恢复/直接 SDK 夹具不能仅凭任意 metadata 认定持久等待状态；既有 parts 审批/任务状态仍按原机制保护，历史与任务可从服务端恢复。正式 producer 已由主会话串行加入上述标准 SDK metadata 帧（`!hasMore` 后，原 error/abort 分支之前），本分区没有编辑 SSE 或公开服务契约。主会话须在整合后验证实际 `chatExecutionResponse → SDK → 缓存压力` 全链；本分区 fixture GREEN 不单独销账该生产者兼容性要求。

## 浏览器 witness 的边界

`harness/` 是明确标注合成回执的隔离浏览器入口，导入本树实际 Copilot、三张任务卡、审核组件、雷达 Hook 与公共 HTTP adapter，保留实际契约解析，复用产品 tokens。Next 路由上下文由薄 shim 提供；HTTP DTO 是合成数据，未连接真实账号、模型或数据库。

```bash
pnpm exec vite --config ../docs/verification/t1073/frontend/harness/vite.config.mts --port 4187
```

首次入口缺 timeout-policy alias；修正后，合成任务 DTO 不符合真实 schema，成功卡未完成；修正 DTO 后，Vite 热重启还残留旧 Connect middleware，真正停止服务再启动才取得正确响应。`harness-server*.log` 保留这些失败，不能冒充首次成功。middleware 对任务 DTO 先使用真实 `aiTaskResource.parse`，客户端继续保留实际校验。

主会话复用 taskSpace 4 / page p1，真实窗口 1366×900，已保存以下实际 DOM 与操作记录到相邻 `../browser/`，由父任务串行提交：

- `success-cards.json`：三张成功卡显示已完成；雷达完整 250/250。
- `switched-scope.json`：实际切到 group-b，新组历史可见，group-a 旧回复消失；雷达 0/0。
- `review-held.json`：实际两处审核消费者慢读取期间触发 20 次 focus，`maxReviews=activeReviews=1`。
- `review-and-radar.json`：释放原回执后新 v2 审核可见；切回 group-a 恢复原历史；外部新增后 focus 找到原 ID `external-original`、queued，完整 251/251。
- `failure-and-completed-original.json`：同一 `external-original` 从 queued 恢复到 succeeded，历史仍 251/251；三张失败卡停止运行态并展示实际错误及后续操作。
- `minimum-1024.json`：真实浏览器调整到 1024×768，DOM 测量无横向溢出，原任务终态保持。
- `initial-load-error.txt`：保留初次加载 alias/旧 DTO 的失败。

以上证明合成 HTTP 下的实际浏览器组件状态与操作。两次截图均真实超时，第二次显式使用 120000ms，未取得像素证据，不能写成视觉已验；隐藏与空闲 60 秒窗口在真实 Hook/HTTP 虚拟时钟测试验证，浏览器没有实等该窗口。安装版、真实账号完整旅程、真实数据库写后读、整机堆内存/RSS 曲线未在此分区验证；jsdom 与合成 HTTP 浏览器 witness 均不能替代它们。待父任务串行完成 timeout-policy、LED-049、boundary/orphan、reconcile 与任务状态结算；本分区不宣称这些全局 Gate 已通过。
