# T-1009 跨回合产物版本补充规格（待确认）

状态：**候选，未获用户确认，不得据此修改运行时契约**。本文件补足 [T-1003 工作台规格](t1003-agent-workbench.md) FR-AW-07、AC-AW-02 中“用户反馈后产生新版本”的跨回合语义；不改变已确认的任务租约、账号隔离、产物真实字节及原生导出要求。

## 实际缺口与用户可见结果

当前每条新用户消息都建立新的 execution task。现有 `artifactId + expectedVersion` 只能修订**同一 taskId** 内的产物，因此“把刚才报告的第二部分精简”在下一回合无法读取旧版并登记版本 2。完成本补充后，同一对话的已登记报告可由新回合读取来源、写出新任务文件并登记版本 2；旧版仍以版本 1 的真实字节可预览与导出。不同对话即使同账号，也不能通过模型工具把产物串成同一谱系。

```mermaid
flowchart LR
  A[回合 A 的任务与产物 v1] --> I[后端对话产物索引]
  I --> B[回合 B 的任务与产物 v2]
  A --> P[旧版仍可预览导出]
  B --> Q[新版仍可预览导出]
```

## 所有权与版本真相

- `artifactId` 的版本谱系归属 `(userId, accountId, conversationId)`；每个版本仍归登记时的真实 `taskId`、`operationId` 和 Blob。旧任务及已结算回执不可修改。非聊天任务继续沿原 taskId 范围修订，不被其他任务借用。
- 后端新增唯一对话产物索引，记录谱系当前版本及每版 `artifactId/version → taskId/operationId/hash/mime/size/relativePath`。版本与任务 payload 的正式回执必须在同一数据库事务提交；索引是跨任务版本解析与 CAS 的唯一真相，task payload 是该任务的执行回执。旧版预览 URL 继续使用旧版所属的 taskId。
- 首次登记产生版本 1；后续登记须传 `artifactId` 与 `expectedVersion`，后端以谱系最新版本原子比较。并发两个回合不能同时抢同一下一版本；一个成功后，另一个收到当前版本并重新读取。Blob 提交前保留按 `(artifactId, operationId)` 唯一的待登记占位；中断后同一 operationId 依据已保存的源文件版本、哈希和 Blob 回执恢复，不能换键重复登记或把变化的工作文件冒充旧操作。占位不应无限锁死：恢复或明确失败后可释放，但未知 Blob 结果先对账。
- 升级时保留旧 task payload 和 Blob。已登记的聊天产物需按可信 `消息 → aiTask → executionTask → conversation` 关系幂等补索引；冲突、缺元数据或哈希不一致应明确待人工处理，不用新版本覆盖旧版。新代码读取旧任务必须在映射有效且补索引成功后进行。

### 并发、调用账本与中断恢复

对话谱系行是同一 `artifactId` 的串行化锁。数据库强制 `(userId,accountId,conversationId,artifactId,version)` 唯一、`(taskId,operationId)` 唯一；索引行记录 `currentVersion` 与一个可空的占位 `{nextVersion,operationId,taskId,requestDigest,sourceFileVersion,sourceHash,state}`。状态仅为 `pending_blob → committed` 或 `pending_blob → failed_confirmed`，不按 TTL 抢占未知占位。

1. `reserve` 在当前任务 admission 与谱系行锁内完成。相同 operationId、相同入参摘要返回原占位或正式版本；相同键不同摘要拒绝。不同 operationId 即使传相同 `expectedVersion`，若已有占位则返回 `revision_busy`，不得开始 Blob 上传。无占位时 CAS 比较 `expectedVersion === currentVersion`，记录下一版本号、当前任务文件的版本/哈希与本任务待登记回执，才释放事务锁。首次登记也创建谱系行并遵守同一规则。
2. `store` 用占位中的同一 operationId 与任务范围对象键提交 Blob，并逐字节校验大小/哈希。重复请求先读同键 Blob；存在且一致则跳过上传。失败或超时为未知，不换操作键，不释放占位。
3. `operationId` **恒等于**原 `executionCalls.id`（已有 Workbench Host 的 `scope.callId`），不是模型自选键。原工具执行端口先领取 `toolExecutionClaimId`，冻结绑定已记录 `toolCallId`、工具名、参数摘要与效果；产物宿主只准备占位和 Blob，不单独公布正式版本。`execution-agentic-tool-ports` 为 `artifact.register/copy` 增加专用 `commitAndSettleArtifact` 分支：在原调用的 settlement 权限内锁谱系、任务与原调用，复核领取凭证、冻结入参、同一 operationId/摘要、占位和 Blob 哈希，并用 `workerToolResultReceiptSchema` 生成唯一正式回执；同一事务写入索引正式版、任务 payload 与原 `executionCalls` 的 `settled/resultText`。只有该事务成功后才返回 `AgenticToolOutcome` 与 artifactRef。外层 Worker 随后已有的 `settleAgenticTool` 是**精确相同回执的幂等确认**：比对原 callId、toolCallId、规范化结果摘要后返回原 settled 行，任何差异拒绝；不会再次写版本或费用。若 commit 已成功但 ACK 丢失，Worker 的 unknown 尝试不得覆盖 settled，重新 reserve 原 callId 回放同一回执。
4. 若 Blob 状态不明，原调用与占位保持 `unknown`，当前谱系拒绝下一版本，用户可看到待对账而旧版仍可用。原 fence 未换时可由原 settlement 路径核对；fence 已换或进程重启时仅 backend 专用 `reconcileArtifactOperation` 可按原 callId、冻结绑定、claimId、占位、Blob 与任务映射完成**同一** commit-and-settle，不开放新 admission 或生成新操作 ID。只有 Blob 服务给出权威“同键无字节”、原 writer 确认停止且再次检查没有晚到字节，后台才能结算为已确认失败并释放占位。已派发的调用不能标成“未执行拒绝”；为此需扩展 `workbenchResult` 错误契约，表达 `dispatched=true, confirmedNoCommit=true` 的后端证明，并让 `workbenchToolOutcome` 将其映射为 `status:error, sideEffect:none` 的已结算错误回执。无法取得证明就维持 unknown，不按租约过期或固定时间自动释放。确认失败后其他回合需重新读 `currentVersion`、用新 operationId 提交，不重用旧回执。

旧版兼容：迁移只影响**跨回合谱系发现与修订**。旧预览/导出 URL 始终走原 task payload + Blob 的账号归属和哈希校验，不依赖新索引，故补录失败时旧版仍可读。补录按同一对话内原任务顺序逐版核对 artifactId、版本连续性、hash、Blob、原 `operationId → executionCalls` 映射与该工具调用的正式回执；只有原调用 `settled`、回执中的 artifactRef 和元数据一致才原子补入整个谱系。旧代码可能已把正式版本写入 task payload，却尚未结算工具：这种 `started/unknown` 调用先走原操作 ID 的专用对账；缺调用、回执不符或对账无法确认时，标记该谱系 `migration_blocked` 并暂停**跨回合**发现/修订，不把 task payload 单方面事实升级为“已结算谱系”。原子写入全谱系或全部回滚，不补半截，不修改旧任务、旧链接或其它正常谱系；修复后同键幂等重试补录。

## 读取、修订与来源

- 当前任务租约仅允许进入当前任务；跨任务 `artifact.read` 只接受模型提供 `artifactId + version + 分页参数`。后端从当前冻结聊天来源和对话索引解析真实源 taskId，复核两端用户、账号、对话及旧版 Blob 哈希；不接收模型自报源 taskId，也不为旧任务重新领取执行租约。`artifact.versions` 返回本对话可见版本、真实所属 taskId 和元数据，供长历史截窗后的恢复；不返回对象存储键。
- 模型在新任务读取旧版后，使用当前任务文件工具写出修订稿并回读核查。登记修订时需声明 `baseArtifactRef`（旧 artifactId/version）；后端验证它是当前谱系的 `expectedVersion`，并记录在新版本来源字段。原 `provenance` 继续只接受**本任务**已结算调用 ID，旧回合调用 ID 不能伪装成新回合证明。`baseArtifactRef` 证明版本来源，不单独证明模型完整阅读或内容质量。
- HTML 相对 PNG 仍只解析**当前版本所属任务**登记的图片。沿用旧版 PNG 时通过可信 `artifact.copy` 端口将已验证的旧图片登记到新任务，保留源引用与字节哈希；不能直接跨任务借路径、读取旧任务任意文件或把外部 URL 当作已登记资源。复制失败时交付不依赖该图片的安全 HTML/正文。

### 工具与服务端口形状

- `artifact.read({artifactId,version,offset=0,limit≤128000})`：聊天任务从当前冻结会话解析源 task；非聊天任务继续只读当前 task。返回原 MIME、哈希、总字节数、分页字节、nextOffset 与**版本所属 taskId**，不返回存储键。执行时重查当前用户/账号/任务租约和两端冻结消息映射；旧任务无需领取新租约。
- `artifact.versions({artifactId?,cursor?,limit≤50})`：`artifactId` 省略时分页列出当前冻结对话的全部谱系与正式版本，提供无需预知 ID 的发现；提供 ID 时只列该谱系。后端由当前任务映射取得会话，按用户/账号/会话过滤，按 `(artifactId,version)` 稳定分页，返回 `artifactId/version/taskId/mime/size/hash/relativePath` 与绑定该会话的 nextCursor；pending/迁移受阻项只给明确状态，不伪装完成版本。非聊天任务只列本 task 的已有版本。UI 走同一后端只读服务，以页面已验证的 conversationId 取全会话列表；不能信任模型写入的卡片 JSON。
- `artifact.register({path,mime,artifactId?,expectedVersion?,baseArtifactRef?,provenance?})`：首次登记不得传旧版本字段；同对话修订必须三者同时传 `artifactId`、`expectedVersion`、`baseArtifactRef={artifactId,version}`，且 base 等于当前最新正式版。文件只读当前任务路径，`provenance` 仍仅允许当前任务的真实调用；返回当前 taskId 的新版本元数据。非聊天任务沿原同任务注册规则，不强制 base 字段。
- `artifact.copy({sourceArtifactId,sourceVersion,targetPath})`：仅复制当前冻结对话内正式登记的 PNG，源字节≤2 MiB，目标路径须为当前任务的合法相对 `.png` 路径。后端验证旧版哈希和两端归属后，将同字节经当前任务 Blob 端口登记成当前任务的新 PNG 产物，返回新 `artifactId/version/taskId/hash/relativePath` 及已验证源引用；同一 operationId 幂等，目标同路径冲突拒绝。这是受审查的已登记字节复制例外，不能谎称读取了当前任务工作文件；它不读取任意旧任务文件、不把源调用 ID 写成本任务 provenance。预览仍最多内联 12 张、总计 2 MiB；复制失败可省略图片交付静态正文。

## 交付、兼容与失败语义

- 同一对话的历史产物卡保留旧版；新回合只有 `artifact.register` 成功且实际回执含版本 2 才显示新版。预览和导出各自根据版本真实 taskId 重新核对用户、账号、字节哈希；预览路由仍允许用户查看其本人、当前账号的旧任务版本，**跨对话限制由模型工具及谱系索引执行**。取消导出不报保存成功。
- 页面加载或历史消息截窗时，从后端当前会话的已结算谱系列表恢复版本卡；先按 `artifactId/version/taskId` 去重，再与仍可见的已保存 `artifact.register` 工具回执合并。卡片只能用服务端正式版本元数据，不能从助手正文重建。旧版和新版分别以各自真实 taskId 请求预览/导出；服务端列表不可用时保留已有已保存卡片并显示版本列表暂不可用，不把缺卡解释为产物删除。
- 本轮没有可用源版、跨对话/跨账号、过期 `expectedVersion`、未知提交或 Blob 缺失时，不生成伪版本；旧版继续可用。缺少复制图片或可选排版能力时降级交付可用正文。已有非聊天 taskId 内版本、旧预览链接和已保存 Blob 必须继续可读。

## 实施前与验收门

本补充改变服务契约与产物数据归属。先通过独立规格评审，再由用户确认并记录 DEC；确认前只保留现有同任务版本行为。实现应按 T-1009/T-1010/T-1011 写集与各自 Packet 更新，不另建任务分级。

红测先覆盖：同对话跨回合版本 1→2 的真实字节回读；两个回合并发与过期 `expectedVersion`；同 operationId 重放及 Blob 写入后崩溃恢复；跨用户、跨账号、跨对话和伪造消息映射拒绝；旧任务不重领租约；旧 HTML 相对图片复制/降级；历史截窗后的版本发现、两版卡片、预览与导出；非聊天原同任务版本及升级前旧链接回归。测试夹具不能代替真实模型与 Mac/Windows 安装版验收。
