# T-1199 已绑定多媒体账号的定时任务可见性

用户在本轮新版安装验收中指出：其他已绑定媒体的定时任务没有看到。当前先调查，不把“未显示”提前定性为任务丢失、未创建或账号绑定失败。

目标是在选定账号组内看见真实平台账号的定时任务、下一次执行、开关与最近结果；切换平台/账号筛选有清楚范围，组总览不会隐式退化为一个账号。错误、未创建、停用、登录过期和能力限制分别表达，不能用空表假称没有任务。

先通过安装版公开 CLI 动态发现能力，只读核真实账号组、绑定和任务。工程调用图另从当前 main 的真实服务/页面/调度入口核对；不直读用户数据库、凭据或私有状态。诊断不会立即运行或重建任何真实采集/发布任务，原微信/上传暂停与实验上限继续有效。

确认根因后补精确写集、服务契约和真实回归命令，独立评审后实现。保原账号/组归属守卫、原任务 ID、cron/时区、开关、执行历史及幂等；缺省任务若确需补齐，必须证明确属现有绑定流程合同且不会重复提交。跨组不能读写，组 ID 不能代替平台 accountId。源码修复不等于已安装修复，完成须经实际入口和公开回读验证。

```mermaid
flowchart LR
  A[已绑定平台账号] --> B[公开任务真值]
  B --> C[账号组内总览与平台筛选]
  C --> D[真实排期和最近结果]
```

阶段：当前项目4-build；本任务先补现状与合同证据，未独评前不动产品。验收要覆盖一个组多个平台、同平台多账号、纯组、空绑定、停用/过期、跨组拒绝、切换及旧请求迟到；缺少真机证据如实保留。

## 实际诊断与服务合同

公开CLI逐组读取：两个抖音组各有6个任务，小红书组仅有内容雷达和每日选题两条共享任务，没有 self.metrics。账号能力显示小红书采集装配可用，但这不证明当前已登录。全部任务的 nextRunAt/lastRunAt 是null；不能伪造执行记录。旧前端只解析抖音当前号、声称“仅当前号”；后端列表实际按组读。运行详情和操作用动态全局账号，另一账号可能被隔离守卫拒绝；查模板又只按sourceKind，误把另一个账号的任务当成已建。

新增公开只读 `accounts.collectionPlanReadiness`，GET `/accounts/:accountId/collection-plan-readiness`。DTO只含accountId/platform/status、collectAvailable（boolean|null）、planEvidence（verified/missing/unknown），不暴露凭据引用、cookie、目录、秘密或当前登录断言。后端先验user ownership、明确ctx.groupId且成员groupId一致；归档返回status，仍不读外部凭据。纯组选中同组账号可读取，跨组与无组选中拒绝。证据复用当前启动合同：已成功验证绑定 OR 快手/小红书已持久化凭据证明 OR 抖音旧授权目录证明；该证据只用于默认计划资格，绝非当前登录/未过期证明。真实读取失败返回错误，不能变成missing。根组合通过既有service port提供证据函数，启动与新公开读复用同一函数，不新增数据库/worker越界。无证据port时unknown，能力未知时null。

页面用当前组成员，默认显示全组真实任务；平台与具体账号筛选不改全局工作区。组共享任务单独标注，平台账号行用实际平台和名称，归档账号历史仍可读。无任务成员展示“尚未建立采集计划”及真实资格证据，缺证据引导现有账号绑定页；读失败明确错误，不宣称未绑定、过期或手动登记。已有任务不被资格缺失隐藏。

按实际账号冻结请求上下文。每个作业详情/最近执行/开关/编辑/立即运行使用该作业accountId与本页groupId；既有共享作业也严格沿原job.accountId冻结，不修改历史归属；新共享创建accountId=null。创建弹窗打开时冻结明确目标，切组卸载或scope变化令旧请求不回写；筛选切换也不让打开中的表单改变目标。最近记录读取错误与没有运行记录分别显示。保单在途轮询、取消、真实原task/run ID及历史。

模板按目标accountId+sourceKind查重；总览只能新建共享任务，选择具体账号后可新建该平台支持的任务。抖音保既有四类自有作品管理，普通新建只沿原self.metrics/comments模板，self.traffic/self.detail系统托管仅已有可编辑；其他已支持媒体普通新建只提供 self.metrics；共享语义kind为topic.daily/intelligence.sync，按group+kind去重，含旧accountId非空行，不因账号筛选重复创建；仅topic.daily可手工新建，intelligence.sync为系统托管只能管理已有行。创建前先展示具体归属；私有新增必须planEvidence===verified且collectAvailable===true；missing/unknown/null或读取失败时不新增私有任务，保已有编辑/保存/运行入口及真实错误。沿原backend协议按明确用户点击创建，不自动启用/运行/补齐真实任务。未选择目标的新建仅topic.daily可用。nextRunAt缺失显示真实未计算，cron仍展示原计划；最近结果取真实run，不能使用null时间假装“从未执行”。

## 精确写集与验收

- contract/src/resources/platform-accounts.ts
- contract/src/operations/platform-accounts.ts
- contract/src/index.ts
- backend/src/modules/platform-account/platform-account.service.ts
- backend/src/modules/platform-account/platform-account.transport.ts
- backend/src/modules/platform-account/collection-plan-readiness.test.ts
- frontend/src/server/persistence-client.ts（仅同一证据port组合与启动复用）
- frontend/src/app/(creator)/automations/page.tsx
- frontend/src/features/automations/automations-page.tsx
- frontend/src/features/automations/automations-island.tsx
- frontend/src/features/automations/automations-page.test.tsx
- frontend/src/features/automations/automations-group-scope.test.tsx
- frontend/src/features/automations/automations-island.test.tsx（仅原字面范围合同校准，原操作断言保留）

须先独立SPEC评审。验证包含真实隔离公开dispatch/readiness schema与跨组拒绝，组内多个媒体/同平台多号，纯组和空组，原任务ID排期不变，模板实际目标/去重，详情与操作冻结目标、切组迟到丢弃、最近记录错误；前端既有自动化全部测试、backend启动与bootstrap、LED047、类型/边界门。公开CLI只读旧安装版已完成；当前源码修复需隔离真实UI，最终新安装包才算安装修复。此次禁止在真实用户组创建、启用或运行采集计划。

用户确认与裁决：本轮明确要求修复其他已绑定媒体任务不可见；可逆UI与只读资格合同属任务必要实现。未授权改变绑定与任务归属、强制补齐或自动执行，明确不做。T1083已有控制配置漂移导致progress无法生成；root串行实现，独立只读审计/评审没有产品写权，不放宽控制门。

页面任务列表及账号成员读取覆盖全量分页，不用200条截断冒充完整组；模板共享去重包含legacy nonnull账号行。没有ctx.groupId时保旧测试入口，但实际route必须传冻结scope；不得让生产退回动态全局账号。

实现首轮实发现新增operation需contract/src/cli-policy.ts显式只读分类；遗漏导致注册失败，不是产品读取或凭据缺失。补该文件精确写集与contract/tests/cli-policy.test.ts既有全operation恰一次分类回归。仅新增为只读accounts资格查询，保账号组scope、能力过滤和原写权限不变；需独评此增补后修，不绕注册门。原失败 readiness-green.log 保留，该文件名不代表成功。

同轮类型门另实发现 contract/src/workspace-operation-scope.ts 的全operation矩阵亦须新增精确项：该只读资格operation为group范围，参数accountId由backend再验同组属主，纯组可读同组账号；不授当前账号身份或写权限。补此精确写集和 contract/tests/workspace-operation-scope.test.ts 既有完备性与组门回归，保任何跨组拒绝。注册/类型失败都保原日志，只有真实通过才记PASS。

## 实现独立复核的公开链闭合增补

当前独立代码复核 FAIL，保留原报告，修四处实际缺口：

1. 资格读取在原 user/group/member 校验之后，把证据 port 的 accountId 冻结为已核验的目标成员，并采用该成员真实 membershipVersion；不在归属校验前改上下文，不改变当前工作区或写权限。同组选中 A 查询 B 的旧凭据证明也必须可读，跨组/跨用户仍零证据调用。
2. 归档账号 header 在真实 HTTP 上被 active 身份门拒绝。只对该归档成员的历史读取使用已经支持的纯组上下文（accountId=null），真实 job/run 参数保持原 ID，后端原 user+group+parent 历史守卫保持；详情步骤沿同一只读纯组 client。活跃成员的读取以及所有开关/编辑/运行仍冻结原 job.accountId，不能把纯组历史客户端用于写操作。不全局放宽 archived 身份门。新增公开隔离 dispatch 证明归档历史可读、跨组仍拒绝、归档写 header 仍拒绝；前端真实 HttpTransport 断言只读 header 与写 header 的差异。
3. 开关失败按原 job.id 显示行内真实错误，可重试；失败不 refresh，不伪造已切换，原 controlled 开关状态保持。切组/卸载旧错误不回写。
4. 表单新开与每次明确提交先清旧错误，当前失败保留输入与当前错误；不把旧错误带到另一个目标或编辑表单。

精确写集未扩大产品文件；测试增加 frontend/src/lib/request-context.server.test.ts（仅保原 archived 拒绝回归的执行，不改测试）、backend/src/modules/scheduling/scheduling.service.test.ts（增加纯组历史含归档成员及跨组实际 service 断言，不改原账号守卫断言）。归档方案修订原“每job读取必传账号header”文字：仅归档只读使用已授权组范围，任何写入不变。页面 groupPromise 与 jobsPromise 独立启动时立即收纳拒绝结果，最终原错误照抛，避免 await 延后产生未处理 rejection；不将读失败当空数据。该增补须独立确认后实施。

实际表单消费者本就禁止提交中通过顶部关闭/Escape/取消关闭，原“顶部可关闭”评审推断已撤销，不当作公共产品缺陷。另补外部props关闭重开与卸载的代次保护：明确新表单重开清pending，旧成功/失败不关新表单、不回写错误或清新pending。两项deferred真实RED已取得，按上述已审生命周期范围修复，不删原提交保护。

实际 HTTP 归档写拒绝包含公开 details.reason=account_archived。开关/表单错误呈现复用已有 describeUserError，归档明确写“可查看历史；恢复账号后再管理计划”，保真实拒绝，不向用户展示 HttpTransport/内部ID或误称历史被删除；普通404与500沿已有统一错误文案。新增断言核完整文案、原开关及零成功刷新。
