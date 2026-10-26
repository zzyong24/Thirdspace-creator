# T-1418 创作者总览真实筛选读取性能

2026-10-26 用户给出月明水清深创作者总览截图：选中小红书后长期显示“读取较慢”，内容仍为公众号；要求解释代码原因并修复。推送准备已按用户要求暂停。本任务只处理总览的平台、账号、日期筛选的真实读取与反馈，不重做采集或改写用户数据。

目标：筛选立即可操作，当前展示与正在请求的范围始终准确；读已保存数据不重复拉全组无关数据，不让旧请求阻塞新选择。先分别测公共 CLI 数据调用与真实页面切换，区分服务端读取、串行聚合、RSC 导航和渲染耗时；不凭截图断定根因，不通过隐藏慢提示或扩大时间阈值冒充优化。

保持原账号组权限、平台筛选和统计口径；切组/卸载取消或忽略旧回执，不跨组显示。按既有组合页读取预算与 LED-047 的路由/竞态要求验收，保留失败原值；针对确证重复读取或串行依赖做调用计数/并发与竞态回归，另跑 LED-053 与相关 boundary/typecheck。实际源码路径、红测与真实验收证据在查明后补本 SPEC 并独审，产品代码尚未开始修改。

## 定位与实现合同

已安装版公开 CLI 同组同日期查询：公众号 2177ms、小红书 4888ms、抖音 3442ms（含 CLI 启动），三次成功且作用域准确，见 docs/verification/t1418/installed-cli-before.json。源码 getGroupOverview 强制读取完整 dashboard 的首页待办/建议等，随后串行采集摘要、指标、输出和标题；总览只使用 workspace。

新增只读 pages.groupWorkspace.get（GET /groups/:groupId/workspace），沿用 groupWorkspaceQuery，响应仅 {workspace:groupWorkspaceMeta}。保持原 getGroupOverview 合同及首页能力。应用层复用相同 workspace 聚合，不调用 dashboard、项目全列表、首页标题与完播率读取；组/账号归属先校验，采集失败保持 unavailable，不伪装零。采集摘要和发布列表并发，发布对应的指标/输出引用并发；不跨请求缓存、不改变统计口径。总览 RSC 改用此端点；路由仍保留原筛选导航和防竞态逻辑。

RED/GREEN：公开 transport 新端点不依赖永不返回的 dashboard；同一 fixture workspace 与原端点完全一致；权限拒绝、账号平台不符、历史账号、采集失败保持原行为。前端 route 必须调用新端点、首页保持原端点。真实装版复测同一组/日期与页面切换，不把开发测试代替安装版证据。

写入范围：contract/src/operations/pages.ts；backend/src/application/queries/group-workspace.ts 及同目录测试；backend/src/modules/query-services/query-services.transport.ts；frontend/src/app/(creator)/overview/page.tsx；frontend/src/features/group-workspace/group-page-routing.test.tsx；必要的端点清单/覆盖测试；本 SPEC、证据及编排登记。边界无数据归属变更。用户已明确要求性能修复，新增专用只读合同记录 DEC-141801 并独审。

公开端点登记同步维护 contract/src/workspace-operation-scope.ts（显式 group）、cli-policy.ts（只读、不确认）、observability.ts（页读操作），并运行 scope、cli-policy、registry 相关回归。不增加 AI 助手的可调度语义工具范围。

观测登记同步 contract/src/observability-registry.json。补 contract/tests/group-workspace-read.test.ts 精确验证 params/query/响应、scope、只读策略与观测表，现有摘要组隔离测试复用到新端点。性能口径按产品定位 §16 的普通本地读 P95≤500ms、组合页 P95≤1s，本端点为组合页读；LED-047 不另造数值。分别记录 CLI 从启动到JSON完成（含启动开销）、服务端该操作 durationMs（现有页读日志）和页面从点击到新筛选范围提交；正常与最小视口，每个平台至少5次，真实冷次单列，不抹去慢次。总览请求若仍超过预算应继续定位；不能以单次CLI变快声明完整性能通过。

## 装版复验后的第二处根因与修复

839d7f280 已安装，公开 CLI 36 次复验仍见小红书约 3.5–3.9 秒，未达到预算，不验收通过。只读 CPU 采样定位主要开销在 PGlite。隔离内存数据库使用 301 条作品、6002 条指标复现：摘要第 1/2 条 SQL 分别约 429/1673ms；EXPLAIN ANALYZE 显示作品与指标反复嵌套扫描，各排除 1,800,600 个不匹配组合。第 2 条在每条指标下重新扫描整份作品目录 6002 次。现有复合索引包含 user/account/work，但优化器的计划未把 work ID 纳入索引条件；不能靠增加等待时间或删历史修复。原始诊断保存在 docs/verification/t1418/query-probe-before.json。

拟把两条作品指标联接改为按已筛选作品的 LATERAL 子查询：第 1 条在每个作品的归属受限指标上聚合；第 2 条在每个作品的归属受限指标上按原 family/timestamp 做 dense_rank。子查询用现有 user/account/work 索引做有界查找，避免作品×全账号指标的交叉扫描；仍三条查询，不写用户数据库、不加缓存、不改 DENSE_RANK 同刻冲突、日期时区、可见性、历史成员与不可归属口径。账号粉丝查询保持。

增加隔离数据库回归：合成 300 个新增作品×20 份历史指标，执行真实 SQL，检查摘要结果和计划的 work ID 索引约束、不再存在数千次重复目录扫描；保留红测与前后计划，不仅比较易受机器负载影响的时间。运行既有完整组隔离、历史归属、同刻冲突、不可用/未知/零、隐私可见性测试。再次打包装版后沿同组/日期测量，未过预算继续修复。写集追加 backend/src/modules/platform-collection/platform-collection.service.ts；无新公开契约、数据归属或产品方向变化。

等价性约束：第 1 条 LATERAL 的 WHERE 只按 user/account/platform/work 收窄，不能预过滤 assigned；count/hasOwned/hasUnattributed 仍在全部相关指标上聚合，以区分无指标、只有合法其它组指标、重叠/非法成员区间。第 2 条才在 assigned 过滤后执行 dense_rank。
