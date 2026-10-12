# T1229 核对内容雷达选题生成持续 output_invalid

用户要求继续全功能验证并及时修复明确缺陷。T1224于2026-10-11在3914单worker、0retry执行原公共旅程，自然exit1。原采集run已公开回读succeeded_with_items（25扫描、25新增、0失败），逐字稿已保存；原transform `intelligence-transform-7a95d888-115` 的选题生成持续 `TOPIC_PREVIEW_OUTPUT_INVALID`，120秒有限观察结束，未到项目升级。原preview只提交一次，未自动重发。证据在 `docs/verification/t1224/browser-3914/`，保留原任务、截图、trace及11源/HEAD前后相同证明。

当前为BUILD只读根因诊断，不授权修改执行服务、模型fixture、断言或重跑原任务。先核实际生成协议、账本与检查点恢复消费者、现有测试及旧本机模型替身的响应路由。旧提示字符串有部分仍存在，不能仅凭字符串变化认定fixture错误；settled/resultText可能包含checkpoint，需确认实际返回值和消费者，不能从源码可能性签根因。

2026-10-11只读复核已纠正上述checkpoint猜测：checkpoint分支仅保存业务进度，最终结果才写resultText。原trace真实请求为rewrite_only，官方正文Skill的outputSchema=null与当前structured入口要求非null存在明确矛盾，但原停点需实证。独立诊断范围评审见 `docs/verification/t1229/independent-diagnosis-review.md`。root据原已退出服务证明，准入精确原3914临时pglite子目录的副本最低取证：仅 `/var/folders/0f/yn6rgq1j2lj2n8_868n28jzc0000gn/T/creatoros-playwright-NIeDlV/pglite`，验证路径/全树无symlink与原前后hash后复制至新专用诊断目录。只打开副本；不复制同级auth/media，不导业务factory/迁移/seed/调度/Worker。不读取payload、prompt、resultText或providerResult内容。显式READ ONLY事务，参数化原task116/transform115白名单SQL，先恰一行/kind/物理绑定true，再查frozen存在布尔、call数量/枚举状态/结果存在聚合。初始化/查询至少120秒、外层覆盖及close余量；未知或绑定不符停止，不换ID扫描。此准入不授权产品修复或模型调用。

写集仅本SPEC、BACKLOG新任务行、taskctl事件及 `docs/verification/t1229/**`；产品改动须有精确候选和独立评审后再纳入。只读辅助代理可交付候选，不领取或签完成。若需要原本轮隔离库诊断，必须先明确其独立临时路径、原task/call ID及最少白名单字段，不读用户库、凭据、模型配置或完整提示。诊断不解除原研究暂停，不启动第二个Next或并发重型数据库测试。

验收：说明实际根因或仍缺的具体证据；分清产品恢复问题、供应商无效输出、旧fixture与测试预算。不删除结构/归属/账本保护，不伪造候选或放宽成功状态。后续修复需保原deadline/任务ID/幂等与费用账本，原失败证据始终保留；完整采集→逐字稿→选题→项目同ID读回尚未通过即如实保留。

```mermaid
flowchart LR
 A[原采集成功25条] --> B[逐字稿保存]
 B --> C[选题持续无效输出]
 C --> D[核原调用与检查点恢复]
 D --> E[确认根因后精确修复和独立复验]
```

## 2026-10-11 原任务实证与修复范围准入候选

已实际完成一次原3914隔离pglite副本取证，exit0、READ ONLY事务ROLLBACK及close完成。原task116/transform115物理绑定true，retry_wait/attempt61/TOPIC_PREVIEW_OUTPUT_INVALID，冻结intelligenceGeneration键与对象均不存在，execution_calls=0。原2179文件全树无symlink、前后hash相同，未读取同级auth/media或真实用户库。证据：docs/verification/t1229/original-copy-read-observation.json 与 original-copy-run-observation.json。这证明停止发生在模型调用前；单独不能唯一排除resolver或模型身份准备失败，因此必须用真实官方及effective resolver的完整链RED定位，不先改fixture或宣布已修。

用户已授权及时修复确认缺陷。BUILD改动候选：在现有私有IPC kind=model.structured内增加严格 intelligenceText='rewrite_only' 分支，由专用 intelligence.rewrite-text capability及generateIntelligenceText dependency执行；不创建持久任务kind、不改公开接口、不放松原structuredGenerationInputSchema缺schema拒绝。capability固定topic.generate、skillId固定intelligence.topic-adapted-draft，facets.mode固定topic_preview、target合法JSON对象且generationMode=rewrite_only、snapshot唯一对应Skill。保真实null输出schema，不伪造{}；错误标签/模式/Skill/能力/快照拒绝，泛型Worker不可回退generateStructured。正文还是现有Skill/模型决定，程序只做机械协议校验。

精确产品写集四处：contract/src/internal/execution-worker.ts（新增私有schema和additive union），ai-worker/src/execution/worker-runtime.ts（专用dependency/capability和标签路由），ai-worker/src/execution/intelligence-generation-worker-entry.ts（专用装配），backend/src/modules/intelligence/intelligence-generation-bridge.ts（新正文freeze和新旧saved union）。不编辑执行权、费用账本、恢复调度、提示词、现有生成函数或原E2E替身。若编译/实际消费者证明必须扩集，先说明具体新增写点并独评。旧合法冻结structured输入原样接受；新格式仅用于未冻结的正文任务，原task/transform/sourceDigest/identity/operationKey/callID/绝对deadline/fence/continuous/未知结果保护不变，不迁移或恢复真实用户任务。

精确测试写集：新增 backend/src/modules/intelligence/intelligence-rewrite-official.integration.test.ts；补 contract/src/internal/execution-worker.test.ts、ai-worker/src/execution/worker-runtime.test.ts、ai-worker/src/execution/intelligence-generation-worker.test.ts。新集成使用新专用隔离DB、真实getOfficialSkillBase与createEffectiveSkillSnapshotResolver、真实组/member/source/item/snapshot/逐字稿及服务，startTopicPreview→runner→bridge→现有构建entry→本地HTTP中性文本响应（只按协议，不按提示字符串）。旧产品先实际RED，定位真实null-schema拒绝及0calls，再修GREEN：同原taskID正文/ledger/公开读回、同ID重复调用不多付费、旧冻结有效schema兼容；空白、unknown、wrong fence/owner、停控与错误标签负族不洗成成功。保原所有断言和失败，单worker、0retry，单次正执行/观察≥120秒，外层覆盖串行+初始化/关闭；重型DB和Next串行。

先独立审查该正式范围与全部实际消费者，再实施；目前只扩准候选，尚未编辑产品或测试。新公共旅程端口尚未选择：只有产品稳定且已有3916素材浏览器自然退出，才串行复跑原采集→逐字稿→选题→项目E2E；原3914失败始终保留，局部GREEN不代签全功能/安装版/真实供应商。实际端口由root释放资源时明确，不猜其它服务可关闭。


独评消费者补充：effective resolver允许用户合法overlay输出schema为JSON对象；专用正文schema应保实际null或合法object原值，不能硬限制null使已合法overlay新任务失败。ready能力检查必须将该标签映射intelligence.rewrite-text后再验证，而非只按运输kind=model.structured放行；普通structured仅声明旧cap不能消费正文。
