# T-890 逐字稿小批恢复运行记录

## 执行边界

- 正式 CLI：`/Users/zyongzhu/.local/bin/creatoros`
- CLI / contract：`0.1.0` / `0.4.0`
- 账号：`acct-ae1a8346-9`（月明水清深），每次调用显式携带账号；未使用默认账号。
- 只调用公开 operation；未直连数据库、连接文件、Cookie 或内部 route。
- 用户明确授权继续逐字稿；未触碰封面、视频制作、发布或其他账号。

## 执行前真值

### 作品

- 总作品：1,094，全部 `availability=available`。
- `transcriptState`：`not_extracted=383`、`extracted=295`、`attention=416`、`processing=0`。
- `progressState`：`pending_transcript=383`、`pending_topic=289`、`awaiting_confirmation=2`、
  `converted=4`、`attention=416`。
- `transcriptStatus`：`not_requested=381`、`queued=0`、`running=0`、`done=295`、`skipped=2`、
  `failed=415`、`blocked=1`。

### 转写执行任务

- 历史任务 714 条 / 712 个 owner；全部状态：`succeeded=290`、`failed=422`、`blocked=2`。
- 按每个作品最新任务计：`succeeded=290`、`failed=421`、`blocked=1`、`queued=0`、`running=0`。
- 没有任何可继续领取的旧 queued/running 任务。
- 382 个作品没有任何转写任务，其中 381 个为 `not_extracted + not_requested`。

### 运行健康

- `ingestion.douyin.status`：`loggedIn=true`、`sourceReady=true`。
- workspace 有 34 个来源；最近来源健康大多为 `succeeded_with_items / succeeded_no_change`。
- ASR 并非未配置：本轮成功项回读为 `provider=configured-cloud`、`model=configured-cloud`。

## 有界补排

使用同一批幂等键 `codex-t890-transcripts-20260818-batch1`，仅选择 5 个
`not_extracted + not_requested + available + 无任何 transcribe task` 的作品：

| itemId | executionTaskId | 结果 | 读回 |
| --- | --- | --- | --- |
| `intelligence-item-2566ac81-426` | `execution-task-d91e5b16-261` | succeeded | `done`、正文非空、约 9 秒 |
| `intelligence-item-2566ac81-430` | `execution-task-d91e5b16-262` | succeeded | `done`、正文非空、约 52 秒 |
| `intelligence-item-2566ac81-434` | `execution-task-d91e5b16-263` | succeeded | `done`、正文非空、约 34 秒 |
| `intelligence-item-2566ac81-442` | `execution-task-d91e5b16-264` | succeeded | `done`、正文非空、约 59 秒 |
| `intelligence-item-2566ac81-446` | `execution-task-d91e5b16-265` | failed | `TRANSCRIBE_FAILED / DouyinCooldownActiveError`、约 30 秒 |

写后读回证明任务真实经历 `queued → running`，运行时有非空 `leaseOwner`、5 分钟 lease 和 heartbeat；
成功后 lease 清空并写入非空逐字稿。没有把“提交成功”当成完成。

## 暂停原因

失败原因已经构成稳定公共错误：按每个作品最新任务统计，422 个失败/阻塞中：

- 412 个：`TRANSCRIBE_FAILED / DouyinCooldownActiveError`
- 10 个：`TRANSCRIBE_FAILED / DouyinAudioFetchError`
- 1 个 blocked：`MODEL_NOT_CONFIGURED / DouyinAudioFetchError`

本轮实时 `ingestion.douyin.throttleStatus` 进一步确认：`iesdouyin.cooldownActive=true`、连续限流 5 次，
剩余冷却约 30 分钟；`creator-center` 未冷却。因此没有继续第二批，也没有立即重试失败项，避免把余下
作品批量变成同类失败。消费者不是阻断点；首个公共根因是抖音音频获取通道处于冷却/限流。

## 执行后真值

- `transcriptState`：`not_extracted=378`、`extracted=299`、`attention=417`、`processing=0`。
- `transcriptStatus`：`not_requested=376`、`queued=0`、`running=0`、`done=299`、`skipped=2`、
  `failed=416`、`blocked=1`。
- 转写任务总数 719；全部状态：`succeeded=294`、`failed=423`、`blocked=2`。
- 本轮实际补排 5、完成 4、失败 1、阻塞 0、重复排队 0、旧任务续跑 0。

## 契约观察

新任务通过 `execution.tasks.list(ownerId=...)` 与 `intelligence.items.get` 可以稳定读回；但同一批 ID 调
`execution.tasks.get` 返回 `OwnershipError: task not found`。本轮没有绕过契约，使用仍可工作的正式 list
与 item read model 完成证据闭环；该详情操作的不一致不影响本轮任务执行，但后续 CLI 契约修复应单独处理。

## 下一步

等 `iesdouyin` 冷却解除后，重新读取 throttle 状态；只有 `cooldownActive=false` 时才按相同规则继续下一批
最多 5 条。失败旧任务不做全量盲重试；应先用一条有界 retry 验证音频获取恢复，再决定是否继续滚动。
