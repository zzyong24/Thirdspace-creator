# T-1020 服务合同冻结检查

> 本文记录已接入的公开合同及服务级拒绝夹具；类型在 `contract/src/resources/platform-capabilities.ts`，形状夹具在 `contract/tests/platform-capabilities.test.ts`，事务测试在 `backend/src/modules/platform-collection/`。截至 2026-09-30，九个公开操作已经接入 transport；生产环境尚未配置真实平台采集适配器，因此新绑定和自动采集明确返回不可用。端点已接入不等于平台已接通。

## 公开操作与当前运行状态

| 操作 | 当前用途 |
| --- | --- |
| `platforms.capabilities.list` | 展示每个平台的真实能力状态；未接适配器返回 `SOURCE_UNMAPPED`。 |
| `platforms.bind.begin/confirm/cancel` | 绑定尝试生命周期；confirm 只消费受信适配器预先写入的身份回执，公开请求不能自报身份。 |
| `platforms.collections.start/get/cancel` | 启动、查看和取消带持久世代与租约的采集任务；缺适配器或有效绑定时拒绝启动。 |
| `platforms.works.list` | 按当前用户和账号分页查看作品，返回目录完整度、当前作品数和待核验的历史记录数。 |
| `platforms.metrics.read` | 按当前用户和账号分页查看账号或作品指标；真实的零保留为零，缺项保留为空。 |

`platforms.works.list` 的 `catalogCompleteness=legacyPartial` 只表示存量抖音导入或后续双写中已确认的单条作品；它不证明已采到该账号的全部作品。完整扫描通过后才显示 `verifiedComplete`。历史作品若未在新世代出现，保留查看入口并标 `directoryState=unavailable`，不能据此推断删除；页面同时呈现 `currentTotal` 和 `unavailableTotal`。
作品标题仅保存来源记录明确给出的文本；未知时为 `null`，界面回退显示平台和作品 ID。旧项目名称、文件名和外部 ID 不充当平台标题。

## 信任与落库边界

- 公开 `bind.confirm` 只接受 `bindAttemptId`。受信平台适配器在 begin 的本机临时档案内写入平台身份证据；后端核对当前用户、平台、尝试、期限和来源后才建立账号。调用方不能自报 `verifiedPlatformIdentity`、`userId`、Cookie 或凭据路径。
- 存量 `accounts.create` 曾允许手工创建小红书记录，`status=active` 只代表本机账号记录有效，不等于完成平台身份核验。新 `collection.start` 必须另查该账号的受信绑定证明与 scope；未接适配器先返回 `SOURCE_UNMAPPED`，已接适配器但缺证明时返回 `SCOPE_MISSING`，页面据此显示待授权并引导重连。旧手工入口不能直接赋予新采集权限。
- Worker 只提交 `sourceWorkRecord`、`sourceMetricRecord`、真实采集页与持久租约。后端独占生成 `userId`、内部作品 ID、关联项目/发布 ID、`ingestedAt`、目录世代与可见性来源优先级；按该平台已验证的字段字典把 `sourceField/sourceUnit` 映射到规范 `metricKey/unit=count`。未知字段或单位拒收，不以字符串相似度猜测。
- 所有写入 DTO 使用严格对象，额外 JSON 键整条拒绝。所有读取先由当前登录态验证账号归属；响应的账号与目录世代也做结构校验。原始平台 ID、浏览器档案与源响应保持本机，不进入上报队列。
- `sourceSnapshotKey` 可以为 null。无稳定快照键的平台必须以独立第二次扫描核对键集合后才发布完整目录；终页声明、页摘要和租约校验属于后端事务，不靠 Zod 形状证明。
- 同一任务的两次扫描由 `scanPass=1|2` 区分页幂等键；第二扫只能核对外部键集合、不能当作新作品和指标重复累积。平台给稳定快照键时 `scanPass=1` 足够；无键时完整的 pass 2 与 pass 1 一致才切换目录。
- 每页可附平台报告总数、来源与观察时间；终页须有官方 `hasMore=false` 证据，或总数与去重集合相等并附后继探测页的请求/返回 cursor、记录键、响应摘要和观察时间。后端重算探测键与已读集合的差集、页摘要与两扫集合，不能信任“无新键”布尔值。`hasMore=true` 不得附终止证据。按 `(attemptId,generation,scanPass,pageIndex)` 判断重放，同页不同摘要只在同一遍内冲突。平台 cursor 是不透明值，重复/循环拒收；`2→4` 跳号合法。
- 可信非公开状态在单页提交时独立更新安全水位、立即冻结出站并写删除墓碑；完整目录只在全页核验后切换。较旧 public、失败页和未知状态均不能覆盖非公开水位。

## 服务级正反例（实现 Gate）

| 场景 | 预期 |
| --- | --- |
| A 对同一 `clientRequestId` 两次 start；A 对同页同摘要重放 | 同任务、同页 `replayed`，指标不叠加 |
| B 查询/提交 A 的账号或作品；Worker 页中夹带 A/B 内部 ID | `FORBIDDEN_ACCOUNT` 或严格 DTO 拒收，B 不可读 A |
| 绑定错号、伪造身份证据、已取消/到期尝试 | `WRONG_PLATFORM_IDENTITY` / `BIND_EXPIRED`；不新建账号、不覆盖另号档案 |
| 带时区偏移的已过期身份证据或授权 | 统一换算时间戳后拒绝，不能用 ISO 字符串的字典序比较期限 |
| 旧手工小红书账号为 active 但无绑定证明；用采集入口请求 publish/comments；B 查询 A 的采集任务状态 | 前者按适配器状态为 `SOURCE_UNMAPPED` 或 `SCOPE_MISSING`，中者合同拒收，后者 `FORBIDDEN_ACCOUNT` |
| 旧 generation 或租约在取消、重启后迟到；同页 cursor 摘要变化 | `GENERATION_STALE` / `LEASE_EXPIRED` / `PAGE_DIGEST_CONFLICT`；旧已发布目录不动 |
| 空首页有明确终页并二扫皆空；第二页超时；游标循环；两扫键集合不同 | 仅第一种可发布空目录；其余 `partial`，旧完整世代保持 |
| 第一页可信 hidden，第二页失败；稍后较旧 public 到达 | 立即冻结出站并保留墓碑，迟到 public 不复活 |
| 后来可信且时间更新的 public；来源冲突或未知 | 前者可用新投影版本恢复；后者保持冻结并待核验 |
| 平台粉丝总数为 0；仅返回区间涨粉；未知单位/字段 | 0 以 `follower_count/count/available` 保存；区间涨粉不得映射总数；未知拒收 |
| 两账号同 externalId 的旧抖音导入；迁移前后读项目/发布/指标 | 四维键各归各号；旧项目/发布仍能回读；不能恢复全局唯一索引 |

服务级夹具已用真实 backend service port 和 PGlite 事务验证；`contract` 单测只验证字段形状。后端镜像与存量发布/分析测试还覆盖两账号同外部 ID、真实零、来源标题、失败后新轮次补写和跨账号过期任务不可写。当前生产抖音采集未启用 `knownAwemeIds` 提前停页；将来启用时须重新验补写可靠性。平台注册、页面扫码及字段字典仍需各平台真实授权验收，未授权时能力清单给稳定不可用原因。
