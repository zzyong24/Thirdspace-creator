# T-1020 平台能力合同、账号级指标与采集宿主

> 待 T-1018 用户审核、独立 SPEC/服务合同评审。依赖 T-1018，供 T-1021/T-1022/T-1023/T-1024 复用；不单独宣称任何新平台已接通。

## 统一合同

`PlatformId` 增加 `kuaishou`、`wechatOfficialAccount`，保持存量 `wechatVideo` 语义不变。平台能力是显式注册数据：账号授权方式、作品形态、账号概况、作品目录、作品指标、草稿/发布、评论及每项运行状态；不能仅凭枚举存在就显示按钮。平台任务协议含 `accountId, capability, attemptId, cursor?, expectedPlatformIdentity, startedAt`，可取消、可恢复；Worker 经后端 service port 读归属与写结果，不共享账号档案或直连数据库。

### 编码前冻结的本机服务合同

合同 owner 是 CreatorOS `contract`；`backend` 实现账号归属、事务和持久化，`worker` 只通过 backend service port 提交采集结果，`frontend` 只读可用能力并发起用户操作。T-1020 编码前把下表形成可导入的类型、正常/拒绝 fixture 与服务合同评审回执；字段名为设计候选，评审确认后冻结，不能直接以本段文字充当已上线 API。

| 操作 | 请求与权限 | 成功响应与状态 | 拒绝/重试语义、幂等键 |
| --- | --- | --- | --- |
| `platform.capabilities.list` | 本机登录用户，`platform?`；不得带任意 userId 覆盖当前身份 | 各能力 `supported/authState/runtimeState/lastVerifiedAt`；未接线能力明确 unavailable | 未登录拒绝；清单读取无副作用 |
| `platform.account.bind.begin/confirm` | 当前用户、平台、一次性 `bindAttemptId`；confirm 附平台身份核验回执 | `pending → identityVerified → bound`，返回本机 `accountId` 和已核验平台身份摘要 | 身份错号、超时、账号已属他人拒绝；同一尝试重复 confirm 返回相同账号，不重复创建 |
| `platform.collection.start/status/cancel` | 当前用户所属 `accountId`、该账号已授权的 capability、`clientRequestId`；Worker 任务带 `expectedPlatformIdentity` | `queued → running → complete/partial/needsAuth/failed/cancelled`；status 返回完成页数、快照时间与缺项 | 跨账号、scope 缺失、失效登录拒绝；`userId+accountId+capability+clientRequestId` 去重；取消后迟到页拒写 |
| `platform.collection.commitPage` | 仅 Worker service port，绑定原任务租约、平台身份、稳定 cursor、源记录及每字段来源 | 页提交回执 `accepted/replayed`、下一 cursor；最后一页原子发布完整目录版本 | 身份或租约错、来源不明、单位不明、跨账号 ID 拒绝；`attemptId+cursor+sourceRecordId` 去重，重放不叠加指标 |
| `platform.works.list/metrics.read` | 当前用户所属 `accountId`；分页 cursor，允许按平台/项目真实关联过滤 | 目录及指标逐项返回 value 或 unavailable、来源与观察时间；保留旧快照标识 | 跨账号拒绝；旧请求在前端账号切换后丢弃，读无副作用 |

示例 fixture：账号 A 的 `collection.start({accountId:A,capability:"workCatalog",clientRequestId:"r1"})` 两次只产生一个任务；账号 B 用同一 ID 查询返回 `FORBIDDEN_ACCOUNT`。第二页超时只返回 `partial`，旧目录保持上次 `observedAt`，不把已收到的一页称为“全部作品”。`commitPage` 带 `visibility:"unknown"` 时允许本机目录显示，但出站投影不得使用；后续经可核验平台来源变 `hidden` 时将同一作品的云端别名送入删除墓碑流程。合同 fixture 必含 public→hidden、hidden→public、删除和迟到 public 四种顺序。

## 指标合同

`PlatformWork(id,userId,accountId,platform,externalId,kind,publishedAt,visibility,visibilitySource,visibilityObservedAt,source,observedAt)` 保存账号目录，可选 `publicationId` 关联 CreatorOS 自己制作/发布的作品。`visibility` 为 `public/private/hidden/removed/unknown`；无可核验来源时为 `unknown`，不得参与出站共享。既有 `Publication` 强制 `contentOutputId`，不得为平台导入的旧作编造内部稿件。`AccountMetricSnapshot` 记录 `userId/accountId/platform/metricKey/value|unavailable/unit/window/source/capturedAt/observedAt`，首个必需指标是 `follower_count`；作品指标按 `PlatformWork` 归属，需要时通过真实关联复用既有作品分析读取。原始平台 ID 与 Cookie 本机保管；平台数字不映射成跨平台统一“播放”前需字段字典确认。真正的 0 是 0；没有授权、接口缺字段、分页未完和失败均是明确的不可用状态。作品目录分页总数来自同一次服务端查询，恢复用稳定游标/去重键，失败保留旧快照和旧采集时间。

## 产品交互与边界

账号页展示每项平台能力“可用/待授权/当前失效/平台未提供”，显示最近真实登录探测与最近采集；“刷新”查看现有任务或提交新幂等任务，不因页面重载盲目重抓。作品页按账号独立筛选，账号切换取消旧读请求回写。现有抖音/B站/视频号/YouTube/X 的能力和发布路径维持可用，迁移不得把所有平台强制经过一个空适配器。

## 验收

合同对未知平台能力、平台身份错号、跨用户/账号 ID、分页不完整、字段单位不明均拒收或显式标不可用；一个账号失败不回滚其他账号；同快照重放幂等；已发布作品与本机采集目录能按真实平台 ID 安全匹配。来源无法确认可见性时本机照常展示、云端出站拒绝；变为非公开/删除时生成 T-1017 墓碑并确认云端删除，迟到快照不能复活。旧数据迁移保持原 platform ID、账号归属和作品关联。T-1021/T-1022 用真实平台证明各自已声明能力，T-1025 验证旧平台回归和双端安装。
