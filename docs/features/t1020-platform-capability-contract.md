# T-1020 平台能力合同、账号级指标与采集宿主

> T-1018 已完成审核。本 SPEC 经 2026-09-30 独立评审提出 CONCERNS，以下为待复审修订稿；服务合同评审通过前不改实现。供 T-1021/T-1022/T-1023/T-1024 复用；不单独宣称任何新平台已接通。

## 统一合同

`PlatformId` 增加 `kuaishou`、`wechatOfficialAccount`，保持存量 `wechatVideo` 语义不变。平台能力是显式注册数据：账号授权方式、作品形态、账号概况、作品目录、作品指标、草稿/发布、评论及每项运行状态；不能仅凭枚举存在就显示按钮。`authState=notRequired/pending/authorized/expired/revoked`，`runtimeState=ready/unavailable/rateLimited/needsAuth/degraded`，不可用时带稳定 `reasonCode` 和最近核验时间。平台任务协议含 `accountId, capability, attemptId, generation, leaseToken, sourceSnapshotKey?, cursor?, expectedPlatformIdentity, startedAt`，可取消、可恢复；Worker 经后端 service port 读归属与写结果，不共享账号档案或直连数据库。

### 编码前冻结的本机服务合同

合同 owner 是 CreatorOS `contract`；`backend` 实现账号归属、事务和持久化，`worker` 只通过 backend service port 提交采集结果，`frontend` 只读可用能力并发起用户操作。T-1020 编码前把下表形成可导入的类型、正常/拒绝 fixture 与服务合同评审回执；字段名为设计候选，评审确认后冻结，不能直接以本段文字充当已上线 API。

| 操作 | 请求与权限 | 成功响应与状态 | 拒绝/重试语义、幂等键 |
| --- | --- | --- | --- |
| `platform.capabilities.list` | 本机登录用户，`platform?`；不得带任意 userId 覆盖当前身份 | 各能力 `supported/authState/runtimeState/lastVerifiedAt`；未接线能力明确 unavailable | 未登录拒绝；清单读取无副作用 |
| `platform.account.bind.begin/confirm` | 当前用户、平台、一次性 `bindAttemptId`；confirm 附平台身份核验回执 | `pending → identityVerified → bound`，返回本机 `accountId` 和已核验平台身份摘要 | 身份错号、超时拒绝；同一用户已有相同平台身份时仅能幂等返回原账号或显式重连，不另建第二行；不同 CreatorOS 用户可分别绑定自己的授权档案，互不可见。尝试到期/取消后撤销临时档案与租约，同一尝试重复 confirm 返回同一结果 |
| `platform.collection.start/status/cancel` | 当前用户所属 `accountId`、该账号已授权的 capability、`clientRequestId`；Worker 任务带 `expectedPlatformIdentity` | `queued → running → complete/partial/needsAuth/failed/cancelled`；status 返回已确认页数、目录世代与缺项。`partial` 可用新 attempt 从可验证断点恢复；否则重新扫描 | 跨账号、scope 缺失、失效登录拒绝；`userId+accountId+capability+clientRequestId` 去重；取消/超时/重启递增持久 `generation` 并吊销旧租约，迟到页拒写 |
| `platform.collection.commitPage` | 仅 Worker service port，绑定持久 `attemptId+generation+leaseToken`、平台身份、可选 `sourceSnapshotKey`、`scanPass/pageIndex`、请求/返回不透明 cursor、源记录及每字段来源；同时提交可选的平台报告总数、来源/观察时间与终止证据 | 页提交回执 `accepted/replayed`、下一 cursor；后端重算页摘要并把页事实原子落 staging。仅凭已提交且可验的终页/目录证据，事务中切换已发布目录世代 | 身份或租约错、来源不明、单位不明、跨账号 ID 拒绝；`attemptId+generation+scanPass+pageIndex` 同摘要重放幂等、同键不同摘要冲突；两扫同页可不同摘要，最后比较键集合；旧世代和取消任务一律拒写 |
| `platform.works.list/metrics.read` | 当前用户所属 `accountId`；分页 cursor，允许按平台/项目真实关联过滤 | 目录及指标逐项返回 value 或 unavailable、来源与观察时间；保留旧快照标识 | 跨账号拒绝；旧请求在前端账号切换后丢弃，读无副作用 |

完整目录协议：每个账号和能力同时只有一个有效写租约；任务及 `generation` 持久化，重启后重新领租并增加世代。每页保存 `scanPass/pageIndex/requestCursor/nextCursor/sourceSnapshotKey?/pageDigest/recordIds/platformReportedTotal?/totalSource?/totalObservedAt?/terminalEvidence?`；空页也必须保存。终止证据只能是平台明确的 `hasMore=false` 及其来源，或平台报告总数等于本扫去重键数且后继 cursor 探测没有新键。后一证据须提交完整探测页事实：请求/返回 cursor、记录键集合、响应摘要、观察时间；后端由已落 staging 的页键集合重算差集、校验 cursor 链与摘要，不接受 Worker 自述的“无新键”布尔值。`hasMore=true` 不能同时带终止证据。无稳定快照标识时做独立第二次扫描，页序、平台报告总数和键集合一致才允许切换；两扫同页可不同摘要，目录集合不一致标 `partial`。动态变化导致两次不一致时保留上一完整世代，展示本次已读数而不冒充总数。空首页只有在明确终页且二次核对为零时才发布空目录。超时、取消、重复 cursor/环、本地 `pageIndex` 跳跃、同页摘要冲突、超过保护上限均不发布完整目录；平台 cursor 一律视作不透明 token，仅适配器声明有序时才检查回退，允许 `2→4` 跳号。恢复只复用平台确认稳定的 `sourceSnapshotKey` 与断点；否则新世代重扫。被取消的旧 Worker 即使持有旧页也无法提交。可信的 `hidden/private/removed` 可见性是独立安全水位：页提交事务中先按来源与时间校验并立刻冻结该作品出站、记录删除墓碑，不等待完整目录切换；若后续页失败，该安全水位仍生效。来源暂未知或采集失败时该作品的新出站暂停至核验；不能沿用旧 public 值继续上报。目录内容与指标仍须完整世代才切换。

示例 fixture：账号 A 的 `collection.start({accountId:A,capability:"workCatalog",clientRequestId:"r1"})` 两次只产生一个任务；账号 B 用同一 ID 查询返回 `FORBIDDEN_ACCOUNT`。第二页超时只返回 `partial`，旧目录保持上次 `observedAt`，不把已收到的一页称为“全部作品”。fixture 还必须覆盖空目录、变化游标、同 cursor 不同摘要、终页缺标记、取消后迟到页、重启换租约、两次扫描不一致、完整世代原子切换及跨账号并发。`commitPage` 带 `visibility:"unknown"` 时允许本机目录显示，但出站投影不得使用；第一页确认 hidden、第二页失败时仍须冻结该作品出站并保留删除墓碑；迟到 public 不得复活。

## 指标合同

`PlatformWork(id,userId,accountId,platform,externalId,kind,publishedAt,visibility,visibilitySource,visibilityObservedAt,source,observedAt,ingestedAt,catalogGeneration,publicationId?)` 保存账号目录；唯一键为 `(userId,accountId,platform,externalId)`。`publicationId` 只在真实账号、平台和外部 ID 一致时关联已有发布事实。`visibility` 为 `public/private/hidden/removed/unknown`；无可核验来源时为 `unknown`，不得参与出站共享。平台明确的详情/管理页状态高于目录推断；状态按可信度与观察时间合并，冲突时保留更保守的非公开状态并请求复核，未知不能覆盖已确认状态。public→hidden/private/removed 立刻冻结出站并产生删除墓碑；任何 public 重新开放均要求 `observedAt` 严格晚于最近一次非公开水位，且来源可信度不低于该非公开证据。较旧但高可信的 public 也不得复活。完成删除回执后如需再共享使用新投影版本，不撤销旧墓碑。目录缺席仅在平台保证枚举完整、完整世代通过且再次核验仍缺席时可判 removed；否则标 `unavailable`，不误删。

`AccountMetricSnapshot` 记录 `id,userId,accountId,platform,metricKey,value|null,availability,unit,window,source,capturedAt,observedAt,ingestedAt`；`WorkMetricSnapshot` 增加 `platformWorkId`，其余字段同构。`availability=available/permissionDenied/sourceMissing/partial/rateLimited/parseFailed/stale`，可用时 `value` 为真实非负数（包括 0），不可用时 `value=null`。`window` 为 `lifetime` 或带时区的闭开区间 `[start,end)`，不得把区间净增当总量；首个必需账号指标为 `follower_count`。快照幂等键为 `(userId,accountId,metricKey,window,source,observedAt,sourceSnapshotKey?)`，作品指标额外包含 `platformWorkId`；同键不同值拒绝并记解析冲突，不覆盖。原始平台 ID 与 Cookie 本机保管；平台数字不映射成跨平台统一“播放”前需字段字典确认。作品目录分页总数来自同一次已发布世代查询，失败保留旧完整快照及其采集时间。

### 存量抖音导入与双读切换

现行导入已建立 imported Project、`Publication` 和分析快照，旧页面依赖这些资源；不能直接删掉或复制成第二个项目。先以 `(userId,accountId,platform,externalId)` 回填 `PlatformWork` 并保存 `legacyProjectId/legacyPublicationId` 显式关联；缺 accountId、平台 ID 或多行冲突的记录进入可见的迁移冲突清单，不猜归属。发布表原 `(platform,externalId)` 全局唯一约束先审计冲突、补齐账号归属；在同一受控迁移中把 `findByExternalKey`、导入端口和所有调用者改为显式 `(userId,accountId,platform,externalId)`，再替换成该四维非空外部 ID 唯一键。双账号恰有相同 externalId 的 fixture 必须证明读、重复导入和指标均归各自账号；任何旧调用未迁完就禁止放宽索引。迁移事务失败保持原约束和代码版本；成功后不能再假设全局唯一，也不能回建原索引。新采集先双写目录关联与现行项目/分析链，项目页、发布中心继续读原资源；作品目录读新表，未迁入行按旧读取兜底且标来源。按真实数据对照数量、外部 ID、指标和账号隔离后再切目录主读；回退只切回仍使用四维键的旧 UI/旧数据路径，不删除旧行、不回建全局索引。新平台导入只落 `PlatformWork` 与快照，不造 `contentOutputId` 或假项目；用户明确把作品纳入项目时才建立真实关联。

## 产品交互与边界

账号页展示每项平台能力“可用/待授权/当前失效/平台未提供”，显示最近真实登录探测与最近采集；“刷新”查看现有任务或提交新幂等任务，不因页面重载盲目重抓。作品页按账号独立筛选，账号切换取消旧读请求回写。现有抖音/B站/视频号/YouTube/X 的能力和发布路径维持可用，迁移不得把所有平台强制经过一个空适配器。

## 验收

合同对未知平台能力、平台身份错号、跨用户/账号 ID、分页不完整、字段单位不明均拒收或显式标不可用；一个账号失败不回滚其他账号；同快照重放幂等；已发布作品与本机采集目录能按真实平台 ID 安全匹配。来源无法确认可见性时本机照常展示、云端出站拒绝；变为非公开/删除时生成 T-1017 墓碑并确认云端删除，迟到快照不能复活。旧数据迁移保持原 platform ID、账号归属和作品关联。T-1021/T-1022 用真实平台证明各自已声明能力，T-1025 验证旧平台回归和双端安装。
