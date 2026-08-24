# 内容雷达 CLI 操作手册

本手册覆盖抖音博主来源、作品标题、完整逐字稿、采集补跑和转写补跑。每次仍须先按 `cli.md` 验证安装版、授权和真实 `accountId`，并在调用前运行 `operations list` 与 `operations describe <operation>`；当前安装版缺少下列 operation 或 schema 不一致时停止，不猜字段、不改用私有接口。

## 真实操作面

| 目的 | 正式 operation | 完成真相 |
| --- | --- | --- |
| 解析抖音博主主页 | `intelligence.sources.previewProfile` | 返回真实 `externalAccountId`、`canonicalUrl`、`nickname` |
| 新增/读取博主 | `intelligence.sources.create` / `intelligence.sources.list` | source 归属同一账号；创建响应可同时返回初始 run/task |
| 补采博主作品 | `intelligence.runs.start` / `intelligence.runs.list` / `intelligence.runs.get` | 同一 task 终态成功，随后 source/run/items 可回读 |
| 列出博主作品 | `intelligence.items.list`，显式 `sourceId` | 遍历分页 `meta.total`，按稳定 item ID 去重 |
| 读单条完整内容 | `intelligence.items.get` | 标题来自 `item.title`；完整逐字稿为 `transcript.status=done` 且 `transcript.text` 非空 |
| 单条或多条转写 | `intelligence.transcripts.enqueue` | 返回每个 item 的真实 task；成功后 `items.get` 回读完整正文 |
| 查任务 | `tasks get` / `tasks wait` | 只续接原 task ID，不因超时或断线重提 |

转写结果会由正式转写任务写入该 item 的 transcript，不是待采纳的写稿候选；但“已排队”或任务成功仍不能替代 `items.get` 的正文回读。

## 全量分页

`sources.list` 和 `items.list` 使用当前 `describe` 返回的 `page/pageSize`，建议 `pageSize=100`。CLI 列表响应必须保留 contract 的 `meta.page`、`meta.pageSize`、`meta.total`。

1. 固定同一个 `accountId`、`sourceId`、筛选和排序；作品默认用 `published_desc`。
2. 从第 1 页开始，逐页收集稳定 `source.id` 或 `item.id`，并按 ID 去重。
3. 继续到累计唯一 ID 数达到 `meta.total`；若某页为空但仍未达到 total，停止并报告分页不一致。
4. 若遍历中 total 改变，允许从第 1 页重新读取一次；仍变化时只能报告“截至本次动态遍历”，不得声称永久全量。
5. “全部标题和完整逐字稿”还要求对每个 item 调 `items.get`；列表状态或摘要不能冒充正文。

## 新增博主并获取作品

1. 用 `previewProfile` 解析用户给出的抖音主页，固定真实 `externalAccountId` 和规范 URL。它是外部操作，按 `describe` 使用 `--apply --idempotency-key`，需要时加 `--confirm-impact`。
2. 全量读取 `sources.list(type=creator_profile)`，以同账号下的规范 URL 或当前 contract 的 `externalKey=profile:<accountId>:<externalAccountId>` 精确查重；命中一个就复用，命中多个则停止消歧。
3. 不存在时调用 `sources.create`：`type=creator_profile`，配置使用 preview 返回的 `externalAccountId/canonicalUrl`，`collectorAccountId` 与显式账号一致，`runInitial=true`。body 与 CLI header 使用同一个稳定幂等键。
4. 创建响应有 task 时等待同一 task。响应无 task 时先用 `runs.list` 排除已有 active run；确实没有才调用 `runs.start`。正常主动补采用 `trigger=manual`；只有最新 run 已终态失败/受阻、根因已解除且用户明确要求重试时才用 `trigger=retry`。
5. 回读 source、run 和以该 `sourceId` 筛选的 items。source 已创建但采集尚未完成，不能说“全部视频已获取”。

## 读取单条或某博主全部标题与逐字稿

- 单条：先在指定 `sourceId` 的全量 item 集合中按 `item.id` 或 `externalId` 精确命中，再调用 `items.get`。标题相同不能用于自动选第一条；`item.title` 为空时如实报告缺失，禁止拿摘要补成标题。
- 全部：先完成全量分页，再逐 item 调 `items.get`，输出至少 `sourceId/itemId/externalId/title/transcript.status/transcript.text`。正文为空或状态非 `done` 时按真实状态列入缺稿清单。
- 用户只给单条抖音分享链接且内容雷达尚无该 item 时，动态 describe `intelligence.items.importDouyinShare`，按用户明确导入意图提交并等待原任务，再回读新 item；不要另造抓取器。

## 缺稿分类与逐条补跑

先分别读取以下集合；不要仅用 `transcript.text == null` 判断：

| `transcriptState` | 含义 | 动作 |
| --- | --- | --- |
| `not_extracted` | `not_requested` 或 `skipped` | `not_requested` 可提交；`skipped` 先读 reason，只有技术性可恢复原因才提交 |
| `processing` | `queued` 或 `running` | 不重提；从 `items.get` 取得原 `executionTaskId` 并继续等待 |
| `extracted` | 应为 `done` | 用 `items.get` 验证 `text.trim()` 非空；空正文记为不一致，不直接重提 |
| `attention` | `failed` 或 `blocked` | 读错误后分类；配置缺失/权限/冷却时先处理根因，不能当未提交项盲重试 |

用户要求“逐个跑”时必须串行：

1. 每条开始前重新 `items.get`；已完成则跳过，活动态续接原 task。
2. 仅对当前仍可提交的一个 `itemId` 调 `transcripts.enqueue`；body 的 `idempotencyKey` 与 CLI header 使用该 item 专属稳定键，并按 policy 带 `--apply`/`--confirm-impact`。
3. 记录响应的 task ID 和 skipped reason；skipped 不算提交成功。
4. `tasks wait` 同一 ID；终态成功后再次 `items.get`，只有 `done + 非空 text` 才算完成。
5. 失败时保留错误码和 task ID。遇平台冷却/限流立即停批；配置或权限阻塞先修根因；不要换幂等键自动重提。根因解除后再次重跑属于一项新的明确用户重试意图，应使用绑定旧终态 task ID 的新稳定键，而不是复用已失败 task 的提交键。
6. 一条完成后才进入下一条。最后重新分页分类，报告完成、处理中、失败/受阻和仍未提取的真实数量。

“没有完整逐字稿”包括 `not_extracted`、`processing`、`attention` 以及 `extracted` 但正文异常为空；自动新提交只面向写前重读后仍可提交的项目，其他状态分别续接或报告。已有 `done + 非空 text` 的作品默认跳过；只有用户另行明确要求替换且动态 contract 允许时才可重新转写。

## 完成证据

报告至少包含绑定的 `accountId/sourceId`、分页 `meta.total` 与唯一 item 数、每条 `itemId/title`、逐字稿状态与正文是否非空、转写 `requestId/taskId/idempotencyKey`、失败错误码，以及补跑后的再次回读结果。这里的“全部”只指 CreatorOS 当前公开、可见的内容雷达集合，不包括抖音已删除、私密或平台不可见作品。不要输出连接凭据、Cookie 或内部路径。
