# T-744 内容雷达改写重试与断链恢复规格

> 状态：Round 2 recheck PASS（Round 1 的 2 个 major 已销账）
>
> 用户确认：2026-08-09，用户要求内容雷达一键改写支持主动重试，并补通选题采纳后被删除/淘汰时无法再生成的断链。
>
> 上游：[内容雷达创作交接](2026-08-01-content-radar-creative-handoff.md) · [服务契约](2026-07-23-content-radar-service-contract.md)

## 1. 用户结果

用户在内容雷达拿到完整改写稿后，如果觉得文案不好，可以在原位置直接点击“重新生成改写稿”。
选题已经采纳到选题中心后，即使后来被用户淘汰，内容雷达也不能永久显示成不可操作的“已进入选题池”；
用户仍可从同一来源重新生成一份改写稿，并把这次新结果再次采纳为新选题。

## 2. 已核实的现状

- `intelligence.transforms.previewTopic` 每个新的 `idempotencyKey` 会创建新的 transform/task；同一 key 的网络重放返回同一结果。
- 后端执行前会按当前用户、账号、作品、逐字稿 hash 与定位版本读取历史 transform。现有失败续跑会复用来源拆解；只有“选题完成、改写失败”时才复用选题策略。成功改写后的再次生成目前会重新跑选题和改写，尚不满足本次“只重试文案”的要求。
- `startTopicPreview` 当前只校验来源快照属于作品，历史检查点检索也未比较 `sourceSnapshotId`；本任务必须补齐最新快照与复用 tuple 校验，不能拿旧快照的策略只跑新 draft。
- `confirmTopic` 会创建新的 Candidate，并把当前 transform 标为 `confirmed`；选题中心“删除”实际是把 Candidate 标为 `dropped`，不会删除内容雷达的不可变来源证据。
- 当前断链来自前端：成功候选和 `confirmed` transform 都没有重试入口；重试任务开始后，旧快照仍显示，但确认按钮没有同时受活动任务状态约束。

因此本任务不新增 operation、表、迁移、状态枚举或第二套生成器；只扩展既有检查点复用判定，
让选题阶段已完成且逐字稿/定位未变化时，无论上一版改写成功还是失败，都复用选题并只重跑 draft。

## 3. 行为契约

1. 完整改写稿生成成功后，无论当前 transform 是待采纳还是已采纳，都显示“重新生成改写稿”。
2. 点击即视为用户明确发起一次新的模型生成，不再弹第二次确认；每次真实点击生成新的 operation key，同一次请求的网络重发仍幂等。
3. `startTopicPreview` 在创建任务前必须读当前作品按 `capturedAt` 最新的来源快照；传入 `sourceSnapshotId` 不是最新值时返回明确冲突，要求客户端刷新，不为陈旧快照排队。检查点复用 tuple 必须同时匹配当前 transform 的 `sourceSnapshotId + transcriptHash + positioningVersionId`。在 tuple 完整匹配时，扩展 `reusableTopicCandidate` 的判定以接受 `topic=completed` 且 `draft=completed|failed`，只重新生成改写稿，不重复调用拆解/选题模型；任一项不匹配或检查点不完整时，不得复用旧选题，只能沿用既有分段生成或失败关闭语义。
4. 新尝试形成独立 transform。旧 transform、旧改写稿、已采纳/已淘汰 Candidate 和已经创建的 Project 均不覆盖、不复活、不删除。
5. 新改写稿成功后，用户仍通过既有“确认写入选题池”采纳；如果旧 Candidate 已淘汰，则创建一个新的 Candidate，不复用旧 ID。
6. 活动重试期间保留旧内容用于阅读，但重试按钮、候选字段和采纳按钮均不可用，迟到响应只更新它所属的当前作品/transform，不覆盖用户已切换到的作品。`confirmTopic` 还必须在服务端重新读取目标 transform 的持久任务：新式 transform 只有 task=`succeeded`、`generationProgress.topic=completed`、`generationProgress.draft=completed` 且现有 draft/strategy hash 校验通过时才允许创建 Candidate；queued/running/failed/blocked/cancelled 或检查点不完整一律拒绝。没有 `generationProgress` 的存量 transform 保留既有兼容确认路径，不把本次修复扩成历史数据迁移。
7. 重试失败继续保留上一版可读内容，并沿用现有局部失败与再次重试入口；不得自动循环调用模型。
8. 复用现有按钮、图标、字号、间距和卡片结构；不改页面布局、配色或其他视觉。

## 4. 数据与安全边界

- 逐字稿仍按现有生成后锁定规则处理；hash 不一致时不得复用历史检查点。
- 历史拆解与选题只能从同一 `sourceSnapshotId + transcriptHash + positioningVersionId` 读取；同作品不同快照不能互相借用检查点。
- 所有 transform/Candidate 读写继续按 `RequestContext.userId + accountId` 校验归属。
- 重试不绕过候选采纳门，不直接创建或改写 Project，不恢复已淘汰 Candidate。
- 日志只记录 transform/task/阶段与安全错误码，不记录模型 Key 或完整逐字稿。

## 5. 验收

- 成功但未采纳：点击“重新生成改写稿”创建新 transform；后端证明复用拆解和选题，只执行 draft；新稿回显后可采纳。
- 作品新增更晚来源快照后，旧页面携带旧 `sourceSnapshotId` 发起重试被服务端拒绝；刷新后新尝试不会复用旧快照的选题检查点。
- 已采纳：仍显示同一重试入口；点击后创建新 transform，不修改旧 transform 的 `targetTopicId`。
- 旧 Candidate 已标记 `dropped`：重试和再次确认成功，得到新的 Candidate ID，旧行保持 `dropped`。
- 同一 operation key 重放不新增第二个 transform/task；两次独立点击产生两个独立尝试。
- 重试任务处于 queued/running 时，旧稿可读但候选字段、确认与再次重试不可点击；绕过前端直调 `confirmTopic` 也被服务端拒绝，任务成功且 draft 检查点完整后同一确认才通过。
- 重试失败时旧稿不消失，页面提供再次重试且不产生自动模型调用。
- contract 聚焦测试、intelligence backend、frontend workbench、两端 typecheck、test-integrity、boundary、semantic boundary 与 orphan gate 通过；不跑视觉回归。

## 6. 非目标

- 不提供历史改写稿版本选择器或差异对比。
- 不允许用户在雷达内编辑改写稿；编辑仍在 Project 稿面完成。
- 不自动检测 Candidate 是否被淘汰，不因淘汰自动生成或恢复。
- 不修改模型提示词、改写质量策略、计费规则、Candidate 删除语义或发布流程。
