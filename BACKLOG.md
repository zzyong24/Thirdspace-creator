# CreatorOS 任务看板(BACKLOG)

> **单一执行真相。每个会话必读(SessionStart hook 自动注入)。** 规则见 `CLAUDE.md` 的「任务流程铁律」。
> 状态:📋 待办 · 🔨 进行中 · ✅ 完成 · ⏸️ 搁置 · ⛔ SPEC 审核 FAIL(没过审不准开工)。
> 读取顺序:**本看板 → 任务引用的 SPEC → 代码**。
> 铁律:需求即任务(提了就建);开工从看板顶取;做完改状态+提交;**禁止 P0/P1 分级、禁止多阶段执行**,任务清楚即起 Workflow/并行 subagent 一次做完。

## 🔨 进行中 / 📋 待办(按执行顺序,从上往下取)

|ID|任务|状态|审核|验收|文档|一句话|
|---|---|---|---|---|---|---|
|T-1173|复核历史看板撞号与畸形字段|✅ 待办|—|—|[实际诊断](docs/features/t1173-historical-backlog-identity-collisions.md)|原健康命令已证实T1018重复及执行/归档复用；保原行和事件，独立核来源再修表示，不删待办或伪迁PASS。|
|T-1172|校正本轮完整校验缺少隔离PG上下文|✅ 待办|—|—|[实际诊断](docs/features/t1172-current-canonical-isolated-pg-context.md)|本轮原canonical40错误，新增LED052来自遗漏两项显式隔离配置；保原exit1，用原隔离公共runner复验，不改门/产品或拼接全绿。|
|T-1171|无损压缩当前超限任务看板|🔨 待办|—|—|[实际失败](docs/features/t1171-current-backlog-compaction.md)|当前健康门RUNAWAY；只用原受支持归档/详情外置，任务状态、原文和失败责任保留，原健康复验，不凭归档销审核债。|
|T-1170|无损归档原浏览器失败上下文并恢复提交检查|✅ 待办|—|—|[实际失败](docs/features/t1170-raw-browser-evidence-storage.md)|新增原PW上下文摘录含三行尾空格使staged diff真实exit2；原字节/SHA私有加gzip无损保留，不改原manifest/失败或Git检查；产品写集为空。|
|T-1169|修复账号转组弹窗关闭后焦点丢失|✅ 待办|PASS[REV:6b4388bed640]|—|[实际走查与SPEC](docs/features/t1169-account-transfer-focus-return.md)|独立Cua确认丢焦并正式审/start；真实6RED含三转组，最终51组件PASS、原Chrome六次Esc回焦、切组/脱离DOM守卫和174LED通过；独立局部PASS，最终Gate/安装待验。|
|T-1168|统一原生报表身份恢复态的提示与主操作|✅ 待办|PASS[REV:5d38b98b8f17]|—|[实际视觉与SPEC](docs/features/t1168-native-report-recovery-actions.md)|原冲突提示/红次级恢复与32px保留证据，正式审/start后恢复态和cap优先RED；最终51组件、Chrome24px/一致主动作与0副作用、174LED及独立局部PASS；最终Gate/真人待验。|
|T-1167|修复采集终态等待在途续租无法返回|✅ 待办|PASS[REV:40609910e1a7]|—|[独立反例与SPEC](docs/features/t1167-collector-pending-renewal-finalization.md)|原finally等pending心跳已按独评6RED/原63GREEN修复，当前原execute终态不等失控续租且晚结果守卫保留；全timeout仅旧27静态失败/运行时166PASS，当前窄复核PASS，不代签其它端口或真人。|
|T-1166|校正新报告旅程有限串行外层预算|✅ 待办|PASS[REV:04e1fdc238d0]|—|[独立预算检查与SPEC](docs/features/t1166-report-journey-outer-budget.md)|新case25,200,000ms/runner26,400,000ms覆盖有限串行加清理，内层120秒/0retry不变；61路径冻结当前Chrome79秒exit0，独立预算复核PASS；旧27静态欠债仍exit1。|
|T-1165|修复平台身份拒绝在正式HTTP链路丢失错误码与扫码恢复|✅ 待办|PASS[REV:e2674ba1ac3b]|—|[实际缺陷与SPEC](docs/features/t1165-platform-scope-error-envelope.md)|保原Chrome52秒400string失败和trace，固定已有SCOPE_MISSING原400进入合同；正式独评/真实RED→69GREEN，当前Chrome原链恢复可见/0副作用，窄复核PASS；最终Gate与真人待验。|
|T-1164|校正独立审核输入绑定与证据字段|✅ 待办|—|—|[实际诊断](docs/features/t1164-review-input-binding-and-evidence-kind.md)|保原非法packet拒绝/不同SPEC读集；独立现字节重读正规record0，原verifyReviewReceipt核当前六份PASS，完整audit原23历史错误保留；未改门/产品，最终canonical待验。|
|T-1161|核对微信账号转组与隐藏管理入口|✅ 待办|PASS[REV:22a46ffc1285]|—|[SPEC](docs/features/t1161-preserve-wechat-account-management.md)|原截断diff误读已澄清，无凭误读改产品；独立Cua实际展开及Chrome六窗口转组入口确认，另发现真实丢焦交T1169修；原CONCERNS保留，真人转组/扫码未执行。|
|T-1159|在当前main整合微信原生报表、绑定归属与调度闭包|🔨 待办|PASS[REV:914cad514a19]|待验|[SPEC](docs/features/t1159-current-wechat-native-report-integration.md) · [验收合同](docs/verification/t1159/PAGE_SPEC.md)|T1124剩余56路径，来源293d统计页导航UNKNOWN/0报告/两实验用尽；独评后冻结语义移植、当前隔离公共链验收，保纯组/保存/调度与原研究暂停，不代签真人微信或安装。|
|T-1155|核对浏览器导航时本地服务连接中断日志|⏸️ 待办|—|—|[实际诊断](docs/features/t1155-browser-navigation-connection-abort.md)|当前三轮原日志aborted/ECONNRESET及uncaughtException，主要断言失败另有原因；保原日志，核请求/进程与后续公开操作，不猜根因或屏蔽错误。|
|T-1149|在当前main整合封面用途与图片页组统一画幅|🔨 待办|PASS[REV:0a91f954eb8f]|待验|[SPEC](docs/features/t1149-current-cover-group-aspect.md)|T1124独评确认来源四路径仍缺；保T1141旧任务/有效比例及T1117引用保存，逐段移植用途、用户统一选择和能力交集；单页不支持不阻断其它合法生成，当前独评后RED/GREEN与公开回读。|
|T-1148|核对本轮共享页面修改后的旧验收记录失效|✅ 待办|—|—|[实际诊断](docs/features/t1148-current-frontend-receipt-drift.md)|当前efe9全canonical1093秒exit1/42ERROR，原39保留，新T1136/1117/1108源码绑定失效；保原报告/事件，当前素材先正式补验，旧范围最终源码复验，不改验证器或伪换head。|
|T-1144|核对素材旅程完成后测试进程未退出|🔨 待办|—|—|[实际诊断](docs/features/t1144-picker-worker-cleanup.md)|T1140两例PASS但worker停后300秒不退出，整轮371.938秒exit1；保原失败和归属快照，定位实际清理等待，不缩超时/force退出/忽略全局错误。|
|T-1140|优化低高度窗口的素材浏览与预览空间|✅ 待办|PASS[REV:2a0be12aac16]|PASS:a6f428841135|[当前观察](docs/features/t1140-picker-low-height-preview.md) · [验收合同](docs/verification/t1140/PAGE_SPEC.md)|当前683×450主体预览空间被原上下双滚动区挤压；按钮和取消回读通过，AssetPicker源未改。保截图后精确SPEC独评优化，不称选择失败或已修。|
|T-1136|在当前main修复长项目与平台账号撑宽排期弹窗|✅ 待办|PASS[REV:db7fe4526b24]|PASS:bb71e533cae7|[SPEC](docs/features/t1136-calendar-dialog-current-integration.md)|T1124来源两条布局缺失；仅共享Dialog单列收缩与排期断点及必要select收缩，先独评/当前Chrome真实尺寸RED，再原公共选择保存回读和相邻消费者验证；不签旧来源或全功能。|
|T-1135|核对安装版粗剪成片解码画面比原素材偏暗|⏸️ 待办|—|—|[实际诊断](docs/features/t1135-installed-render-color-fidelity.md)|已批准r7中性成片正式exact-file下载/245帧解码通过，但源+6.76秒三处背景RGB17/36/57变为0/19/44；先核原工程与编码色彩/公共渲染路径，根因未知，不重提渲染或改原稿/媒体；修产品前精确SPEC独评。|
|T-1124|核对本轮新增来源分支未合入main的源码并闭合整合|✅ 待办|—|—|[实际诊断](docs/features/t1124-current-worktree-source-gap.md)|T1080删除前只读再盘点：canvas来源17条源码/测试路径main缺失，chart来源1条缺失，其它58条不同不能直接算遗漏；保留来源与活跃树，逐项核main替代及新增SPEC/独评，禁止ours丢源码或代签全合并。先交付当前已复核包继续验收，本轮新增功能不冒称已入包。|
|T-1117|修复画布保存英文反馈与参考选择器名称展示遗漏|✅ 待办|PASS[REV:161a32c6331a]|PASS:32177b98fc54|[SPEC](docs/features/t1117-canvas-error-reference-preview.md)|当前main两条Chrome流程通过，但实际截图保存错误裸英文，参考已选卡仍长文件名；复用原中文反馈并闭合showIdentity=false全选择流程，精确file/保存/owner不变。独評、实际RED/GREEN及浏览器证据后修复；不代签模型或旧失败。|
|T-1118|核对本机验收原始日志目录消失|📋 待办|—|—|[实际诊断](docs/features/t1118-verification-directory-disappearance.md)|T1117实际RED/GREEN后，原验收父目录突然不存在；七次包装命令exit2未执行内层验证。保工具实际结果与已提交工件，原因UNKNOWN；新隔离目录继续验证，不重造旧日志或触用户数据。|
|T-1116|核对稿件并发保存回归在本轮完整对账中的再次失败|🔨 待办|—|—|[实际诊断](docs/features/t1116-artifact-cas-global-regression.md)|T1114新增相对失败LED027，原41失败保留；实际全局没有保存内层断言，先原两段命令逐段取得真实失败，核CAS/事务/初始化预算。未确认产品根因，不删除竞争或版本断言，不能称已修或全功能PASS。|
|T-1101|修复画布素材选择、生成防重复与连线透传，整合三平台扫码绑定及错峰采集|🔨|PASS[REV:146ff2046c2c]|待验|[SPEC](docs/features/t1101-canvas-binding-collection.md)|用户2026-10-09截图明确要求：素材只显示预览；生成中禁止重复提交、已有结果再生成需确认；图片连线传递默认参考；扫码入口放平台能力表，删除刷新和下方重复框；三平台独立采集错峰执行。来源f97a80da已完成；main重新初审和组合验收，原PASS不代签当前树。不发布、不改真实Cookie。|
|T-1101-global-gates|核对独立main工作树全局对账失败及历史收据漂移|📋 待办|—|—|[根因记录](docs/verification/t1101/global-gates.md)|前置对账76项失败含未装依赖阶段环境、历史审核收据和教训检查；本轮安装依赖后重跑真实Gate。范围外旧类型/契约/短预算仍关联T-1018/T-1081；不得补拍历史PASS。|
|T-1108|核对画布连线引用保存回读及浏览器短观察窗口|✅|PASS[REV:7725159d945d]|PASS:54ebbd993813|[实际缺陷](docs/features/t1108-canvas-public-observation.md) [详情](BACKLOG-details.md#t-1108)|见详情。|
|T-1109|修复超时验证入口默认10秒初始化导致原测试未执行|🔨|PASS[REV:a85dda74b249]|待验|[SPEC](docs/features/t1109-timeout-verification-default-budget.md)|实际timeout-policy额外backend beforeAll10秒超时，25例skip；原静态27保留。仅明确真实Vitest test/hook至少120秒，保原断言/退出码/更长局部预算，不删除Gate或改构建。先独评再修公共入口。|
|T-1110|核对浏览器验收开发资源ChunkLoadError与测试状态准备竞态|📋 待办|—|—|[实际缺陷](docs/features/t1110-browser-development-resource-diagnosis.md)|用户要求有问题建task；fa09真实两条旅程0PASS/2FAIL，绑定页ChunkLoadError无法加载，第一例旧状态被仍运行页面自动保存覆盖。原trace/log保留；后者在T1108原范围先离开再准备，前者根因未知，核真实静态响应/开发缓存和并发，不删断言或用旧PASS代签。|
|T-1107|核对平台公共接口新增操作与发布归属回归失败|🔨|PASS[REV:9c9181db2c1c]|待验|[实际缺陷](docs/features/t1107-platform-public-regression.md)|全功能验收额外公共真链24例实际22PASS/2FAIL：账号操作数5变6，发布锚冲突首轮200而旧断言期待拒绝；重试又409。先核main合并前基线与真实组/项目归属，再独评修复产品或过期夹具；保原断言/失败/权限，不删除历史洗绿。|
|T-1105|修复共享资源面板失效读取后持续加载|🔨|PASS[REV:675552d2d02f]|待验|[SPEC](docs/features/t1105-shared-resource-loading.md) · [实际缺陷](docs/features/t1105-shared-resource-loading-diagnosis.md)|T1101额外Chrome走查展开共享资源停在加载，console出现组上下文拒绝；原失败保留。先在main复现epoch/单在途/重开，再独评修，不放宽跨组权限或把扫码PASS代签该面板。|
|T-1103|排查Pi联合提案反复遗漏完整图文参数|🔨|—|—|[实际缺陷](docs/features/t1103-pi-joint-argument-diagnosis.md) [详情](BACKLOG-details.md#t-1103)|见详情。|
|T-1102|排查并恢复本地安装首次运行时展开失败|🔨|—|—|[诊断与边界](docs/features/t1102-installed-runtime-extraction.md) [详情](BACKLOG-details.md#t-1102)|见详情。|
|T-1094|修复部分完成AI任务公开查询状态合同缺口|🔨|PASS[REV:5d2c91b81b45]|—|[SPEC](docs/features/t1094-public-partial-task-status.md) · [当场诊断](docs/verification/t1093/FOLLOWUP_DIAGNOSIS.md) [详情](BACKLOG-details.md#t-1094)|见详情。|
|T-1096|核对文章工作流与任务父归属旧回归断言的实际漂移|📋|—|—|[当场基线](docs/verification/t1094/RELATED_BASELINE_DIAGNOSIS.md)|T1094正式回归文章9FAIL/任务6FAIL；原main770037原测试同名同因复现。先核用户确认的联合创作入口、保存回读与组父归属，再独评是否修fixture或真实代码；原断言/owner不洗绿，不恢复已删快转入口。|
|T-1099|修复工具明确业务拒绝回执缺失与末次失败被算成功|⏸️|PASS[REV:b5aa667d8485]|—|[SPEC](docs/features/t1099-tool-domain-recovery.md) · [实际缺陷](docs/features/t1099-tool-domain-recovery-diagnosis.md) [详情](BACKLOG-details.md#t-1099)|见详情。|
|T-1098|核对安装重启后的定期同步失败与采集未启动|📋|—|—|[缺陷登记](docs/features/t1098-installed-scheduled-failure-diagnosis.md)|用户要求发现问题及时建task；T1095真启动日志两scheduled.intelligence.sync为failed，另账号定期采集Error。保原ID与真实失败，先核公开归属/原回执/启动前事实后独评修复，不猜关联、清历史或重发。|
|T-1097|修复文章编导参考资料与候选审读保护缺口|📋|—|—|[缺陷诊断](docs/features/t1097-article-director-options-diagnosis.md)|用户要求有问题及时建task修复；T1096确认身份/文档只接不可触达旧generate，当前联合未接；事实替换对照及未请求元数据保护也需当前链实证。核真实来源与审读后独评闭合，不恢复旧快转，不把旧恢复/checkbox测试当新链通过。|
|T-1095|验证Pi联合创作必填nullable字段遵循与原任务恢复方法|⏸️|PASS[REV:b3b9dda4753e]|—|[SPEC](docs/features/t1095-tool-parameter-recovery.md) · [当场诊断](docs/verification/t1093/FOLLOWUP_DIAGNOSIS.md) [详情](BACKLOG-details.md#t-1095)|见详情。|
|T-1093|校准编导数字参数、联合首次读取与真实候选失败恢复|🔨|PASS[REV:267bf399a6b1]|—|[SPEC](docs/features/t1093-director-method-recovery.md)|T1091真实安装6候选通过/2失败；Pi整数发字符串被拒后仍称就绪、联合首读猜错可省略digest。只改功能方法提示，不放宽schema/回执/owner/旧任务或重发未知；正式独评后RED/GREEN及新包真实Pi复验，旧失败保留。|
|T-1091|补齐公开编导消息的Codex选择与文章图文视频目标定位并安装验收|🔨|PASS[REV:dcd0b932fca7]|—|[SPEC](docs/features/t1091-public-director-context.md) [详情](BACKLOG-details.md#t-1091)|见详情。|
|T-1092|核对联合创作旧集成测试未解包可信回执的契约漂移|📋|—|—|[当场基线证据](docs/verification/t1091/CREATION_BASELINE_DIAGNOSIS.md)|T1091扩大回归154PASS/2FAIL，旧main隔离同2FAIL；原第104行严格parse含__creatorosOutcome的展示投影，页面先经原解包器。先独评实际旧断言/回执协议再校准，保可信元数据与两稿内容断言，不改生产schema或洗掉失败。本轮不实施。|
|T-1072-owned-devices|配合 Growth 轻量手机号账号与正式双设备，补齐新电脑连接与已激活账号入口|🔨 待办|PASS[REV:eb8de221287b]|待验|[SPEC](docs/features/t1072-owned-devices.md)|原范围和历史证据见[完整记录](BACKLOG-details.md#t1080-retained-row-aed1560bebc24ab1)。|
|T-1066-timeout-policy|全系统统一两分钟超时下限、嵌套预算与Skill防复发|⏸️ 待办|PASS[REV:13310516269c]|待验|[SPEC](docs/features/t1066-timeout-policy.md) [详情](BACKLOG-details.md#t-1066-timeout-policy)|见详情。|
|T-1067-skill-verification|清理通用产品流程Skill既有公开分发校验债务|📋 待办|—|待验|[根因证据](docs/verification/t1066/SKILL_VERIFICATION.md) [详情](BACKLOG-details.md#t-1067-skill-verification)|见详情。|
|T-1018|清理本轮测试暴露的全局类型与边界欠债|📋 待办|—|待验|[实测证据](docs/verification/t1017-rewrite-first.md) [详情](BACKLOG-details.md#t-1018) [完整历史](BACKLOG-details.md#t1173-t1018-global-debt-history)|见详情。|
|T-1080|汇总全部本地worktree代码到main并清理闲置目录后构建|⏸️ 待办|—|—|[SPEC](docs/features/t1080-local-main-worktree-consolidation.md)|用户2026-10-08明确授权全部代码本地合并至主分支、清理不用的worktree再构建，构建无需备份。先逐树核HEAD/未提交/使用情况并保留Git来源，解决冲突和验证后只删除已保留代码且未占用的目录；保留活跃会话、真实数据与既有备份，不push/tag/发布。|
|T-1083|复核流程升级后的旧任务写集通配符兼容缺口|📋 待办|—|—|[根因证据](docs/verification/t1080/post-package-progress-block-failure.json)|progress原block命令实际exit2：T1026的docs/verification/t1026*被3.29路径校验拒绝，未写进度；taskctl已真实记T1080阻断。先盘点旧glob实际允许写集、独立复核等价迁移，不放宽guard或手改状态，本轮未实施。|
|T-1082|复核合并来源任务的当前评审与UI验收记录归属|📋 待办|—|—|[SPEC](docs/features/t1082-source-receipt-revalidation.md)|本地main真实出包后对账新增7项：5个source/alias缺当前review链event、2个agent-recovery alias缺completion；原来源链/报告保留不代签当前验收，按真实独立审核和UI旅程闭环，不重哈希旧链、不复制PASS。|
|T-1081|核对整合后原主线的14处短执行预算与超时扫描误报|📋 待办|—|待验|[根因证据](docs/verification/t1080/timeout-static-dispositions-corrected.json)|完整超时门实际exit1：14条既有短执行/有限观察来自原main/client，另13条为冻结编辑器调度/动画、已取消清理、TTL或已归一消费者；先按真实消费者复核，不改vendor洗绿、不延长取消。来源与原失败留存；本轮优先合并和出包，此任务尚未实施。|
|T-1026|补齐新增 Agent 功能的公开 CLI 并逐项验收安装版|🔨|—|—|[SPEC](docs/features/t1026-agent-cli-acceptance.md)|原范围和历史证据见[完整记录](BACKLOG-details.md#t1080-retained-row-67204c9b2c9efc87)。|
|T-1027|修复评论采集完成统计与失败诊断|🔨|—|—|[SPEC](docs/features/t1027-comment-collection-evidence.md)|T1026真实评论回归failed却提示全量完成；统一完成统计并补公开未完成原因，不把零新增冒充成功。|
|T-1025|重新核验 constitution 变更后的历史评审与前端验收回执|📋|—|—|[SPEC](docs/features/t1025-receipt-drift-revalidation.md)|原范围和历史证据见[完整记录](BACKLOG-details.md#t1080-retained-row-fbe6a3f4e58bcafa)。|
|T-1077|修复采纳与作品素材读取的项目返回值|🔨 待办|PASS[REV:a36209c19783]|待验|[SPEC](docs/features/t1077-material-parent-port.md) [详情](BACKLOG-details.md#t-1077)|见详情。|
|T-1075|修复安装验收发现的素材标签观察与纯组生图证明|🔨 待办|PASS[REV:73a6052db08f]|—|[SPEC](docs/features/t1075-installed-ai-observation-gaps.md) [详情](BACKLOG-details.md#t-1075)|见详情。|
|T-1074|全面验收与补齐AI助手系统操作、工具开放性和功能提示词|🔨 待办|PASS[REV:b19144c34cab]|待验|[SPEC](docs/features/t1074-ai-system-operations.md) [详情](BACKLOG-details.md#t-1074)|见详情。|
|T-1071|修复账号绑定和页面Tab切换卡顿|🔨 待办|PASS[REV:a53e25bf48df]|待验|[SPEC](docs/features/t1071-navigation-latency.md) [详情](BACKLOG-details.md#t-1071)|见详情。|
|T-1070|打通Codex执行与编导精调，脚本一键生成文章和图文|🔨 待办|PASS[REV:b195ac203ec0]|待验|[SPEC](docs/features/t1070-director-script-workflow.md) [详情](BACKLOG-details.md#t-1070)|见详情。|
|T-1069|修复安装版素材导入慢与跨Tab丢失，重设计素材选择并补多平台绑定入口|🔨 待办|PASS[REV:19bad8ef6f93]|待验|[SPEC](docs/features/t1069-installed-media-and-binding.md)|原范围和历史证据见[完整记录](BACKLOG-details.md#t1080-retained-row-e350e6053e05749b)。|
|T-1066|落实本地客户端优先出包并移除人为构建超时|⏸️ 待办|PASS[REV:0d40d8466937]|—|[SPEC](docs/features/t1066-local-package-build-only.md)|原范围和历史证据见[完整记录](BACKLOG-details.md#t1080-retained-row-d6ce9166621c4243)。|
|T-1062|汇总各会话改动统一提交并打包本地客户端，逐项验收含Skill粗剪|🔨 待办|PASS[REV:5912ba60da16]|待验|[SPEC](docs/features/t1062-consolidated-local-client-acceptance.md) · [测试预算补充](docs/features/t1062-backend-test-harness.md) · [安装渲染修复补充](docs/features/t1062-installed-render-skill-owner.md) [详情](BACKLOG-details.md#t-1062) [详情](BACKLOG-details.md#t-1062) [详情](BACKLOG-details.md#t-1062)|见详情。|
|T-1063|修正流程工具误拒合法字面方括号文件路径|🔨 待办|PASS[REV:4d99824da112]|待验|[SPEC](docs/features/t1063-orchestrator-literal-path-boundary.md)|原范围和历史证据见[完整记录](BACKLOG-details.md#t1080-retained-row-ef8386b2a0a060cc)。|
|T-1024|紧急排查充值50元后Growth受管Omni模型仍报余额不足|🔨 待办|—|待验|[排查范围](docs/verification/t1024-managed-credit-diagnosis.md)|原范围和历史证据见[完整记录](BACKLOG-details.md#t1080-retained-row-c9ebcc41ffd59f36)。|
|T-1022|按账号组统一多平台工作区、绑定管理、首页与复盘|⏸️ 待办|PASS[REV:2f179f8d9380]|待验|[SPEC](docs/features/t1022-account-group-workspace.md) [详情](BACKLOG-details.md#t-1022)|见详情。|
|T-1023|修正既有任务绑定glob导致的progress生成阻断|📋 待办|—|—|[证据](docs/features/t1022-account-group-workspace/VERIFICATION.md)|原范围和历史证据见[完整记录](BACKLOG-details.md#t1080-retained-row-3eba29be37ce0174)。|
|T-1021|CreatorOS封面与小红书图文双模板库、行业分类及私人收藏|🔨 待办|PASS[REV:f0f3fa0ff91b]|待验|[SPEC](docs/features/t1021-cover-template-library.md)|原范围和历史证据见[完整记录](BACKLOG-details.md#t1080-retained-row-d0c6d059440fcd70)。|
|T-1019|按观众具体任务与双九宫格持续生成可实测选题|⏸️ 待办|PASS[REV:3a0362412b23]|待验|[SPEC](docs/features/audience-task-topics/README.md)|用户委派；复用定位/雷达/候选/反馈，观众入口与作者实测分流，保留 T-1017 首稿；不发布或 push。|
|T-1020|统一可视化推荐、作品承接与科学运营观测|📋 待办|待审|待验|[SPEC](docs/features/creator-operations/README.md)|原范围和历史证据见[完整记录](BACKLOG-details.md#t1080-retained-row-e6765fb61ec296f6)。|
|T-1017|简化内容雷达：按账号定位一键生成可编辑改写稿|🔨 待办|PASS[REV:d2fb4541c82d]|待验|[SPEC](docs/features/t1017-content-radar-rewrite-first.md)|原范围和历史证据见[完整记录](BACKLOG-details.md#t1080-retained-row-00c1555a12c0e894)。|

|T-1015|核实剩余教训失败并校准过期回归断言|📋 待办|—|—|[实测清单](docs/verification/t1014-reconcile-triage.md) [详情](BACKLOG-details.md#t-1015) [状态与原审核历史](BACKLOG-details.md#t1173-t-1015-same-identity-history)|见详情。|
|T-1004|冻结共享能力协议与 NomiFun 迁移依赖|📋 待办|—|—|[SPEC](docs/features/t1003-agent-workbench.md) [状态与原审核历史](BACKLOG-details.md#t1173-t-1004-same-identity-history)|T-1003 评审；固定依赖闭包、宿主端口、协议与架构门卫。|
|T-1005|实现多步计划、连续执行与原任务续跑|📋 待办|—|—|[SPEC](docs/features/t1003-agent-workbench.md)|依赖 T-1004；模型规划与重规划，保留回执和成本，停止恢复可核验。|
|T-1006|接入统一工具网关与长结果回读|📋 待办|—|—|[SPEC](docs/features/t1003-agent-workbench.md) [状态与原审核历史](BACKLOG-details.md#t1173-t-1006-same-identity-history)|依赖 T-1004；工具发现、进度、取消、错误和费用共用原执行链。|
|T-1007|补齐任务文件空间与受控命令执行|📋 待办|—|—|[SPEC](docs/features/t1003-agent-workbench.md)|依赖 T-1004；文件读写编辑、版本冲突、跨平台运行和进程树取消。|
|T-1008|迁移 NomiFun 浏览器能力并协调既有采集|📋 待办|—|—|[SPEC](docs/features/t1003-agent-workbench.md)|依赖 T-1004/1006；唯一profile所有者、多任务并发、跨账号隔离和原采集回归。|
|T-1009|实现产物版本、隔离预览与原生导出|📋 待办|—|—|[SPEC](docs/features/t1003-agent-workbench.md) [状态与原审核历史](BACKLOG-details.md#t1173-t-1009-same-identity-history)|依赖 T-1006/1007；真实文件交付、HTML/图表预览、图片/PDF及选址导出。|
|T-1010|装配研究创作报告 Skill 与兼容扩展|📋 待办|—|—|[SPEC](docs/features/t1003-agent-workbench.md)|依赖 T-1005/1006/1007/1008/1009；按需方法包、锁定版本，自主选工具完成目标。|
|T-1011|实现对话内计划进度与文件交付交互|📋 待办|—|—|[SPEC](docs/features/t1003-agent-workbench.md)|依赖 T-1005/1006/1009；同对话查看修改导出，停止/恢复与性能防复发。|
|T-1012|验收完整多步 Agent 与旧功能兼容|📋 待办|—|—|[SPEC](docs/features/t1003-agent-workbench.md)|依赖 T-1008/1010/1011；真实模型工具文件全链路、故障恢复、采集及性能。|
|T-1013|验证双端安装包多步 Agent 与升级兼容|📋 待办|—|—|[SPEC](docs/features/t1003-agent-workbench.md)|依赖 T-1012；Mac/Windows安装实测，无NomiFun前置，数据升级保留。|
|T-998|收敛业务代码硬编码模型名|📋 待办|—|—|[T-914 审计](docs/research/2026-09-04-architecture-agent-audit.md)|原范围和历史证据见[完整记录](BACKLOG-details.md#t1080-retained-row-b9b5a6896b2aaf0b)。|
|T-997|修复 ai→ai-runtime 反向依赖边界违反|📋 待办|—|—|[T-914 审计](docs/research/2026-09-04-architecture-agent-audit.md)|原范围和历史证据见[完整记录](BACKLOG-details.md#t1080-retained-row-2eb38b106511cdb8)。|
|T-996|消除 review/reviews 双模块命名混淆|📋 待办|—|—|[T-914 审计](docs/research/2026-09-04-architecture-agent-audit.md)|review/(review-gate 审核门)与 reviews/(复盘评论领域)职责不同但命名极易混；重命名对齐并更新跨模块引用。|
|T-993|同步 main 分支到最新(落后 origin/main 573 提交)|📋 待办|—|—|—|原范围和历史证据见[完整记录](BACKLOG-details.md#t1080-retained-row-6f28905ece9e4a7b)。|
|T-992|修复 Windows 升级启动运行环境切换拒绝访问|🔨 待办|—|—|[SPEC](docs/features/t992-windows-runtime-upgrade.md)|用户启动日志os error5；检查旧运行目录、安装指针与升级迁移，保留数据，补既有安装升级验证。|
|T-989|校正知识图谱错误提示的既有回归断言|📋 待办|—|—|[SPEC](docs/features/t989-knowledge-error-test.md)|T988扩展验证发现原af62ddda及当前均1/9失败；核对错误提示契约后修正，未改该行为。|
|T-984|本地打包并实测拆分采集修复|⏸️ 待办|—|—|[SPEC](docs/verification/t984-local-collection.md)|用户明确冻结改动范围；以66264111本地打包、安装、真实采集验证，不扩展恢复架构、不公开发布。|
|T-986|修复新绑定账号默认采集任务系统标记透传|📋 待办|—|—|[SPEC](docs/features/t986-bind-collection-flag.md)|原范围和历史证据见[完整记录](BACKLOG-details.md#t1080-retained-row-5172365e85a2cee2)。|
|T-980|纳入助手修复重新运行 V1.2 双端流水线|🔨 待办|—|—|[SPEC](docs/features/t980-release-rerun.md)|冻结已提交 T-976至T-978 修复，合并发布分支，预检后运行 Mac/Windows 正式构建并核验产物。|
|T-979|自动化页面慢轮询与切换对象回写防护|⬜ 待办|—|—|[SPEC](docs/features/t979-automation-polling.md)|原范围和历史证据见[完整记录](BACKLOG-details.md#t1080-retained-row-9f66fc6ba1d2a7e1)。|
|T-976|修复安装版 AI 助手 RedFox 再次失败与脱离对话的任务交互|🔨 待办|—|—|[SPEC](docs/features/t976-chat-inline-redfox.md)|定位本次原始错误；当前对话持续执行返回结果，不让用户刷新核对；真实链路验收。|
|T-957|排查 AI 失败、全场景验收并优化 Agent 提示词|🔨 待办|—|—|[SPEC](docs/features/t957-ai-real-acceptance.md)|原范围和历史证据见[完整记录](BACKLOG-details.md#t1080-retained-row-d8c8c522ea52c213)。|
|T-956|修复安装版点击采集一直抓取中|🔨 待办|—|—|[SPEC](docs/features/t956-installed-collection-stuck.md)|对照真实任务、日志与调度恢复定位阻断，修复后沿实际入口验证终态和结果，保护旧数据。|
|T-954|接入抖音流量来源并以专家方法改进编导交互|🔨 待办|—|—|[SPEC](docs/features/t954-director-content-loop.md)|原范围和历史证据见[完整记录](BACKLOG-details.md#t1080-retained-row-6ad5b71dceb239e1)。|
|T-951|修复自动化采集缺 jobRunId 与千条作品采集失败|⏸️ 待办|—|—|[SPEC](docs/features/t951-collection-reliability.md)|查明原调度绑定、分页和超时恢复，验证公共链路与千条规模，不以吞错冒充成功。|
|T-950|排查并恢复当前产品缺失历史数据|⏸️ 待办|—|—|[记录](docs/verification/t950-data-recovery.md)|先核对账号、数据路径和备份；保留现状后恢复可验证的数据，不覆盖新内容。|
|T-945|排查并修复当前视频渲染再次失败|⏸️ 待办|—|—|[诊断](docs/verification/t945-render-failure.md)|对齐最新原任务与安装版日志，定位真实失败点并验证修复，不凭历史错误猜测。|
|T-943|拉取并跑通 JY_IPAgent，调研数字人 API 与 CreatorOS 接入|⏸️ 待办|—|—|[SPEC](docs/features/t943-jy-ipagent-research.md)|原范围和历史证据见[完整记录](BACKLOG-details.md#t1080-retained-row-6da40b9d211687ae)。|
|T-940|补齐应用内签名远程更新闭环|📋 待办|—|—|[缺口与范围](docs/features/t939-positioning-release.md)|原范围和历史证据见[完整记录](BACKLOG-details.md#t1080-retained-row-0e3dd393b702a707)。|
|T-935|修复整稿子任务长时间排队无执行|🔨 待办|—|—|[排查记录](docs/verification/t935-script-queue.md)|查真实任务排队与唤醒，恢复原任务，不用新任务掩盖卡住；并完成 T-934 聊天复验。|
|T-934|统一 CLI 与页面的持久聊天工具入口|🔨 待办|—|—|[实现与验收](docs/verification/t934-cli-chat-unification.md)|原范围和历史证据见[完整记录](BACKLOG-details.md#t1080-retained-row-9b2048cb81450808)。|
|T-933|安装并验收本轮Agent Runtime桌面版|🔨 待办|—|—|[T-932交付](docs/verification/t932-runtime-alignment.md)|原范围和历史证据见[完整记录](BACKLOG-details.md#t1080-retained-row-e3d09dce7e422bbe)。|
|T-919|定位并修复本地包主导航卡顿、助手通知刷屏与搜索停滞|🔨 待办|—|—|复用 T-912/T-909 导航契约与 [T-915 SPEC](docs/superpowers/specs/2026-09-04-agent-runtime-refactor.md)|原范围和历史证据见[完整记录](BACKLOG-details.md#t1080-retained-row-125af640cc5d45f9)。|
|T-915|根治 AI 卡慢、失败不重试与搜索/浏览器缺少自主循环，收敛架构与执行能力|🔨 待办|PASS[REV:692283b8bace]|—|[SPEC](docs/superpowers/specs/2026-09-04-agent-runtime-refactor.md)|原范围和历史证据见[完整记录](BACKLOG-details.md#t1080-retained-row-e93a45cb55075893)。|
|T-916|修复工程对账与历史任务证据漂移，恢复可信重构基线|🔨 待办|—|—|[审计 A-13](docs/research/2026-09-04-architecture-agent-audit.md) [详情](BACKLOG-details.md#t-916) [状态与原审核历史](BACKLOG-details.md#t1173-t-916-same-identity-history)|见详情。|
|T-917|记录 T-915 媒体测试事故并防止测试再次访问真实媒体根|📋 待办|—|—|[事故记录](docs/research/evidence/t915/2026-09-06-media-test-incident.md)|原范围和历史证据见[完整记录](BACKLOG-details.md#t1080-retained-row-20ca3c0dceb6f8f4)。|
|T-908|真实复测 douyin-transcribe Skill，并对照 CreatorOS 当前抖音抓取链路判断是否需要兼容修复|📋 待办|—|—|—|原范围和历史证据见[完整记录](BACKLOG-details.md#t1080-retained-row-0d6e5afae67dc6b3)。|
|T-906|放大 AI 助手默认窗口并支持拖拽缩放与跨启动尺寸记忆|⏸️ 待办|—|待验|—|原范围和历史证据见[完整记录](BACKLOG-details.md#t1080-retained-row-43eab6d6e3e39443)。|
|T-905|调研独立的极简手机口播创作产品，以人设选稿、灵感写稿、实拍与“123321”真人换口型为核心|📋 待办|—|—|—|原范围和历史证据见[完整记录](BACKLOG-details.md#t1080-retained-row-916d71382f9f6b24)。|
|T-884|只读诊断用户加密日志中的 ASR 转写失败|⏸️ 待办|—|—|复用 T-768 ASR 通用回退、T-639 MiMo ASR 与 T-676 逐字稿队列契约|原范围和历史证据见[完整记录](BACKLOG-details.md#t1080-retained-row-15d0c7dabac4150e)。|
|T-883|提交并推送 T-881/T-882 候选，触发 GitHub macOS 与 Windows 官方安装包流水线|⏸️ 待办|—|—|复用 [T-881 验收](orchestrator/T881-FRONTEND-VALIDATION.md)、[T-882 本地包验收](orchestrator/T882-BUILD-VALIDATION.md) [详情](BACKLOG-details.md#t-883)|见详情。|
|T-878|让生图模型连接测试正确识别并提示 401/403 鉴权失败|📋 待办|—|—|[T-877 脱敏诊断](docs/research/2026-08-17-dudu-image-auth-failure-diagnosis.md)|原范围和历史证据见[完整记录](BACKLOG-details.md#t1080-retained-row-ab507299fb3fcd91)。|
|T-867|恢复 AI 对项目素材与分镜场景的自动语义匹配|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-867)|详情见外置记录。|
|T-860|修复竖屏素材底边与左下人物框边界重合|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-860)|详情见外置记录。|
|T-859|竖屏素材段人物收进左下角，并消除切换白闪|🔨 待办|PASS[REV:9895a91a63a8]|待验|[详情](BACKLOG-details.md#t-859)  [SPEC](docs/superpowers/specs/2026-08-16-portrait-material-pip-smooth-transition.md)|详情见外置记录。|
|T-858|把剪辑方法真正落到 CreatorOS，根治竖屏统一舞台、字幕重点词与动态 PPT|🔨 待办|PASS[REV:2521be715a0a]|待验|[详情](BACKLOG-details.md#t-858)  [SPEC](docs/superpowers/specs/2026-08-16-video-direction-stage-and-caption-emphasis.md)|详情见外置记录。|
|T-857|构建当前已提交候选的 CreatorOS 1.1.0 Windows 安装包|⏸️ 待办|—|待验|[详情](BACKLOG-details.md#t-857)|详情见外置记录。|
|T-856|重做竖屏成片的统一舞台、字幕可读性与重点词强调|⏸️ 待办|—|待验|[详情](BACKLOG-details.md#t-856)|详情见外置记录。|
|T-855|构建包含 T-854 与当前已提交修复的 CreatorOS macOS 本地安装包|⏸️ 待办|—|—|[详情](BACKLOG-details.md#t-855)|详情见外置记录。|
|T-851|支持录制“123”短视频生成本人授权的 AI 数字人口播|📋 待办|待审|待验|[详情](BACKLOG-details.md#t-851)|详情见外置记录。|
|T-850|支持只上传未粗剪口播录像，由 AI 理解实拍语义并生成可确认粗剪|📋 待办|待审|待验|[详情](BACKLOG-details.md#t-850)|详情见外置记录。|
|T-847|补齐 Windows 正式包的 CreatorOS CLI runtime 并重跑 1.1.0 双端流水线|⏸️ 待办|—|—|[详情](BACKLOG-details.md#t-847)|详情见外置记录。|
|T-846|提交当前批准候选并运行 CreatorOS 1.1.0 macOS/Windows 官方双端构建|⏸️ 待办|—|—|[详情](BACKLOG-details.md#t-846)|详情见外置记录。|
|T-845|根治 Windows 用户机成片在 HyperFrames 启动阶段缺失分层模块解析器|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-845)|详情见外置记录。|
|T-843|为 CreatorOS 建立可由 Codex 完整操作的官方 CLI，并复用现有全部业务能力|🔨 待办|PASS[REV:ea17774db868]|—|[详情](BACKLOG-details.md#t-843)  [SPEC](docs/superpowers/specs/2026-08-15-creatoros-codex-cli.md)|详情见外置记录。|
|T-835|取消制作分镜逐字保真失败对整稿候选的阻断，并给出可诊断恢复|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-835)|详情见外置记录。|
|T-833|根治结构化节点 schema 兼容报错与多张局部改稿卡无法连续采纳|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-833)|详情见外置记录。|
|T-831|重排官方渠道模型配置并复核上游图生图能力|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-831)|详情见外置记录。|
|T-829|建立并执行上游模型全能力真实兼容矩阵，覆盖渠道托管与用户中转站|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-829)|详情见外置记录。|
|T-828|诊断行业热点出题不可用、Windows 滚动条异常与 DeepMind/Max 模型报错|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-828)|详情见外置记录。|
|T-827|根治选题中心来源筛选失效与候选操作按钮无法点击|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-827)|详情见外置记录。|
|T-826|根治 CreatorOS v1.1 Windows 新安装包安装后无法启动|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-826)|详情见外置记录。|
|T-824|根治昨日文稿 Skill 与内容动效卡片迭代在标准版成品中无明显效果|🔨 待办|PASS[REV:18361dc8c3c3]|待验|[详情](BACKLOG-details.md#t-824)  [SPEC](docs/superpowers/specs/2026-08-13-continuous-voiceover-storyboard-pipeline.md)|详情见外置记录。|
|T-823|根治架构图等主视觉被信息卡遮挡并修正跨段画面切换滞后|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-823)|详情见外置记录。|
|T-821|网站内容因未登录或权限不足读取失败时引导用户前往登录保管库|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-821)|详情见外置记录。|
|T-819|让编导在普通对话中按自然语言定位并改写当前稿单段|🔨 待办|PASS[REV:0425ab7b87b8]|待验|[详情](BACKLOG-details.md#t-819)  [SPEC](docs/superpowers/specs/2026-08-13-natural-language-current-script-section-editing.md)|详情见外置记录。|
|T-820|修复选题补卡到项目与文案的数据丢失并保存生成消费血缘|📋 待办|—|—|[详情](BACKLOG-details.md#t-820)|详情见外置记录。|
|T-816|让当前确认稿成为配图与封面生成的第一内容真相|🔨 待办|PASS[REV:fb03de3a57d7]|待验|[详情](BACKLOG-details.md#t-816)  [SPEC](docs/superpowers/specs/2026-08-13-current-script-truth-and-natural-language-section-editing.md)|详情见外置记录。|
|T-814|统一 CreatorOS 多页面 AI 对话体验并保留场景上下文与自由讨论能力|📋 待办|—|—|[详情](BACKLOG-details.md#t-814)|详情见外置记录。|
|T-779|根治参考历史作品生成封面时误探本机工具并中断生图|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-779)|详情见外置记录。|
|T-773|更新 CreatorOS 1.0 最新使用教程、匿名化截图并新建成交型测试版教程|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-773)|详情见外置记录。|
|T-768|任何云端 ASR 故障都必须自动回退本地 Whisper|🔨 待办|PASS[REV:3eb18966ea59]|待验|[详情](BACKLOG-details.md#t-768)  [SPEC](docs/superpowers/specs/2026-08-11-asr-universal-local-fallback.md)|详情见外置记录。|
|T-762|根因复盘并设计渠道 ASR 密钥的短时租约闭环|🔨 待办|—|—|[详情](BACKLOG-details.md#t-762)|详情见外置记录。|
|T-759|根治已绑定 B-roll 因 inventory 失配显示空白|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-759)|详情见外置记录。|
|T-754|根治 CreatorOS v1.0 官方包启动无限转圈|🔨 待办|—|—|[详情](BACKLOG-details.md#t-754)|详情见外置记录。|
|T-748|补齐“重新输入激活码”原生命令 ACL 并重打官方包|🔨 待办|—|—|[详情](BACKLOG-details.md#t-748)|详情见外置记录。|
|T-741|下移知识库“记一条经验”入口到录入操作行|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-741)|详情见外置记录。|
|T-739|根治制作视频跨项目灌入 B-roll、无证据改稿偏好与超长复盘卡|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-739)|详情见外置记录。|
|T-738|根治发布物料生成成功后无处查看并恢复卡内查看闭环|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-738)|详情见外置记录。|
|T-735|根治渠道受管模型成功产物被误判失败并建立 C 端稳定性闭环|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-735)|详情见外置记录。|
|T-734|根治 Windows 扫码绑定在启动前误依赖缺失 Playwright CLI|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-734)|详情见外置记录。|
|T-733|本地模型可用时收起渠道配置误报警并纠正票据不适用状态|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-733)|详情见外置记录。|
|T-732|根治局部改稿锚点失效后阻断全部 Copilot 对话|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-732)|详情见外置记录。|
|T-730|恢复可选“立论点”UI并增加适用场景引导，不重新变成写稿门槛|🔨 待办|PASS[REV:aeda30778cf2]|待验|[详情](BACKLOG-details.md#t-730)  [SPEC](docs/superpowers/specs/2026-08-09-optional-thesis-guidance.md)|详情见外置记录。|
|T-731|支持按电商等创作场景生成并自定义创作框架|📋 待办|—|待验|[详情](BACKLOG-details.md#t-731)|详情见外置记录。|
|T-729|根治渠道专属包仍跳官方入口并拆分官网、下载、人工反馈与反馈 API|📋 待办|—|待验|[详情](BACKLOG-details.md#t-729)|详情见外置记录。|
|T-726|退役项目“论点骨架”并让写稿直接消费 Brief 与素材|🔨 待办|PASS[REV:2809820bf64a]|待验|[详情](BACKLOG-details.md#t-726)  [SPEC](docs/superpowers/specs/2026-08-08-thesis-skeleton-retirement.md)|详情见外置记录。|
|T-721|根治素材包导出回流造成递归嵌套并恢复大素材库完整可见性|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-721)|详情见外置记录。|
|T-720|根治特定 Windows 设备抖音内置浏览器页面崩溃导致内容雷达主页验证失败|📋 待办|—|待验|[详情](BACKLOG-details.md#t-720)|详情见外置记录。|
|T-719|根治桌面端启动后二次白屏闪烁与首页排期提醒不可用|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-719)|详情见外置记录。|
|T-718|补齐智溯AI包内品牌并交付完整 Growth 配置后重打本地包|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-718)|详情见外置记录。|
|T-716|完善 Copilot 局部改稿、脚本版本回退、附件上下文与素材中心稳定排序|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-716)|详情见外置记录。|
|T-715|在 CreatorOS 增加 Growth AI 额度账户连接、查看与充值入口|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-715)|详情见外置记录。|
|T-714|接入工程教训闭环并迁移旧账本，确保真实踩坑可被后续任务自动复用|📋 待办|—|待验|[详情](BACKLOG-details.md#t-714)|详情见外置记录。|
|T-713|构建包含通用智能体语义边界与当前制作修复的 macOS 0.3.0 本地测试包|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-713)|详情见外置记录。|
|T-712|优先采用用户上传素材进入 B-roll 时间线、恢复成片预览并收回渠道同步常驻提示|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-712)|详情见外置记录。|
|T-709|将 macOS Developer ID 签名与 Apple 公证凭据接入 GitHub 正式发布流水线|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-709)|详情见外置记录。|
|T-708|全局审计并软化 AI 工具中不合理的创作完整度门禁|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-708)|详情见外置记录。|
|T-707|将定位前采收敛为 Copilot 主导的自适应编导访谈并直接闭环定位中心|🔨 待办|PASS[REV:06867c4bf60c]|待验|[详情](BACKLOG-details.md#t-707)  [SPEC](docs/superpowers/specs/2026-08-01-positioning-pre-interview-workflow.md)|详情见外置记录。|
|T-705|根治 macOS 本地包启动后落入 Page Not Found|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-705)|详情见外置记录。|
|T-703|根治视频制作从分镜到预览、对话调剪、采纳与再制作的多处断裂并重打本地包|🔨 待办|PASS[REV:c1a3920aea71]|待验|[详情](BACKLOG-details.md#t-703)  [SPEC](docs/superpowers/specs/2026-08-05-video-production-editing-loop.md)|详情见外置记录。|
|T-702|根治审核“应用改写”后分镜稿格式坍缩为 Markdown 表格源码|📋 待办|—|待验|[详情](BACKLOG-details.md#t-702)|详情见外置记录。|
|T-695|清理应用内硬编码品牌并让白标用户表面保持中性|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-695)|详情见外置记录。|
|T-691|补齐 Copilot 单项目全生命周期、跨项目历史与审核改稿工具闭环|🔨 待办|PASS[REV:9444ca5b32a9]|待验|[详情](BACKLOG-details.md#t-691)  [SPEC](docs/superpowers/specs/2026-08-04-copilot-project-lifecycle-tool-closure.md)|详情见外置记录。|
|T-694|建立多渠道专属包工厂、项目级出包 Skill 与安全增量更新闭环|🔨 待办|PASS[REV:2c7be136aea0]|待验|[详情](BACKLOG-details.md#t-694)  [SPEC](docs/superpowers/specs/2026-08-04-channel-package-factory-and-incremental-update.md)|详情见外置记录。|
|T-686|根治定位前采联网补充直接报错并恢复国内中文公开检索|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-686)|详情见外置记录。|
|T-687|建立口播联想画面 Skill 并打通图序号引用、项目 B-roll 与成片渲染|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-687)|详情见外置记录。|
|T-685|排查并根治全流程写稿长度失控及审核不识别已采纳文案卡|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-685)|详情见外置记录。|
|T-684|根治 Copilot 联网搜素材失败后回退模型记忆并误导配置搜索模型|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-684)|详情见外置记录。|
|T-683|修复 Copilot 在 Windows 无法读取盘符绝对路径与目录授权失效|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-683)|详情见外置记录。|
|T-679|接入 Growth 按激活权益签发的受管模型凭据、真实模型白名单与用户选择|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-679)|详情见外置记录。|
|T-678|根治内容雷达生成选题继续读取旧定位|📋 待办|—|待验|[详情](BACKLOG-details.md#t-678)|详情见外置记录。|
|T-677|优化首页与定位中心切换时整页骨架卡顿 1–2 秒|📋 待办|—|待验|[详情](BACKLOG-details.md#t-677)|详情见外置记录。|
|T-676|根治云端 ASR 测试假阳性并接通 StepFun，同时修复 Windows 本地 Whisper 回退|📋 待办|—|待验|[详情](BACKLOG-details.md#t-676)|详情见外置记录。|
|T-671|确定 CreatorOS 代理商业模式与官网价格边界|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-671)|详情见外置记录。|
|T-670|恢复 CreatorOS 部署前真实官网并收口公开商业信息|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-670)|详情见外置记录。|
|T-666|根治定位前采误清空既有定位并改为非破坏草稿切换|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-666)|详情见外置记录。|
|T-665|支持彻底删除内容雷达信源及其全部归属数据|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-665)|详情见外置记录。|
|T-662|根治成片把内部结构标签当正文并优化卡片文字重合|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-662)|详情见外置记录。|
|T-661|根治项目素材未进入制作、采纳后仍转圈及素材包图片无扩展名|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-661)|详情见外置记录。|
|T-660|根治雷达预填逐字稿未解锁下一步及已采纳封面仍被判缺失|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-660)|详情见外置记录。|
|T-656|收紧桌面授权本地信任链，移除生产冒烟旁路并消除 verdict 私钥明文靶点|🔨 待办|PASS[REV:5f6970ac76f2]|待验|[详情](BACKLOG-details.md#t-656)  [SPEC](docs/superpowers/specs/2026-08-02-desktop-verdict-basic-hardening.md)|详情见外置记录。|
|T-655|接通 Seedance 文生视频适配器并修复 `seeddance` 配置报未知 provider|🔨 待办|—|—|[详情](BACKLOG-details.md#t-655)|详情见外置记录。|
|T-654|新增 Qwen 方言 ASR 适配器并接入设置预设|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-654)|详情见外置记录。|
|T-653|支持本地自配与渠道子 Key 托管双模式模型供给|📋 待办|待审|待验|[详情](BACKLOG-details.md#t-653)|详情见外置记录。|
|T-652|重构定位前采为必经的编导式访谈与证据辅助工作流|🔨 待办|待审|待验|[详情](BACKLOG-details.md#t-652)|详情见外置记录。|
|T-650|知识倾倒输入框支持拖拽文件直接导入|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-650)|详情见外置记录。|
|T-651|内容雷达默认按作品真实发布时间倒序|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-651)|详情见外置记录。|
|T-649|调研并设计激活后渠道白标：品牌名、应用内 Logo 与系统级图标边界|📋 待办|—|待验|[详情](BACKLOG-details.md#t-649)|详情见外置记录。|
|T-646|统一优化结构化 AI 工具为结果优先、分段生成与局部修复|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-646)|详情见外置记录。|
|T-645|收敛模型配置项并同步精简 Growth 渠道模板|🔨 待办|PASS[REV:5dfe24b42eb7]|待验|[详情](BACKLOG-details.md#t-645)  [SPEC](docs/superpowers/specs/2026-08-02-capability-scoped-channel-model-authority.md)|详情见外置记录。|
|T-644|根治 CreatorOS macOS 客户端持续闪屏|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-644)|详情见外置记录。|
|T-643|收口 CreatorOS 为输入 Activity 激活码后直接授权，隐藏当前权益领取入口|📋 待办|—|待验|[详情](BACKLOG-details.md#t-643)|详情见外置记录。|
|T-642|打通内容雷达对标文案→改写策略→选题卡→项目写稿的编导证据链|🔨 待办|CONCERNS[REV:7728c9ed44bd]|待验|[详情](BACKLOG-details.md#t-642)|详情见外置记录。|
|T-641|根治发布中心“登录多日仍只有一个采集日、发布趋势不出曲线”|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-641)|详情见外置记录。|
|T-640|配置 Apple Developer ID 签名与公证，并在前序修复全部闭环后统一产出本地安装包|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-640)|详情见外置记录。|
|T-635|把 CreatorOS 正式构建绑定到 Growth 商品的统一 `projectKey`，禁止运行时覆盖产品身份或关闭严格验签|🔨 本地实现待验|PASS[REV:b8add273a494]|待验|[详情](BACKLOG-details.md#t-635)  [SPEC](docs/superpowers/specs/2026-07-30-growth-product-identity-binding.md)|详情见外置记录。|
|T-633|恢复创作者中心自动扫码登录|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-633)|原范围和历史证据见[完整记录](BACKLOG-details.md#t1080-retained-row-f9f6ea5f8246191a)。|
|T-632|根治“新建定位母版”无效、历史母版无法恢复与逐字稿提取长时间无结果|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-632)|详情见外置记录。|
|T-631|根治大视频上传被 10MB 截断并误报 ffmpeg 缺失|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-631)|详情见外置记录。|
|T-621|补齐渠道模型 authority snapshot 生产链路回归|📋 待办|—|—|[详情](BACKLOG-details.md#t-621)|详情见外置记录。|
|T-576|统一跟进尚未关闭的飞书线上用户反馈|🔨 免审|—|—|[详情](BACKLOG-details.md#t-576)|详情见外置记录。|
|T-575|接通 CreatorOS 权益领取、渠道配置与问题反馈|🔨 本地PASS·待生产E2E|—|待验|[详情](BACKLOG-details.md#t-575)|详情见外置记录。|
|T-562|根治 CreatorOS 0.2.0 Windows 安装后持续白屏|🔨 免审|—|待验|[详情](BACKLOG-details.md#t-562)|详情见外置记录。|
|T-548|根治视频渲染重试后成片脱离项目且制作页实时预览消失|🔨 待安装版真机|—|待验|[详情](BACKLOG-details.md#t-548)|详情见外置记录。|
|T-538|接通渠道签名上下文的产品问题反馈|🔨 本地PASS·待生产E2E|—|待验|[详情](BACKLOG-details.md#t-538)|详情见外置记录。|
|T-536|根治“我的收藏”同步错误分类与浏览器档案锁恢复|🔨 待真实账号只读验收|—|待验|[详情](BACKLOG-details.md#t-536)|详情见外置记录。|
## ⏸️ 暂停池（不自动派发）

> 只保留任务索引；暂停原因与恢复条件见 `orchestrator/events.ndjson` 和详情文档。恢复必须使用 `taskctl start`。

|ID|状态|审核|验收|文档|
|---|---|---|---|---|
|T-626|⏸️|—|待验|[详情](BACKLOG-details.md#t-626)|
|T-577|⏸️|—|待验|[详情](BACKLOG-details.md#t-577)|
|T-565|⏸️|—|待验|[详情](BACKLOG-details.md#t-565)|
|T-524|⏸️|—|待验|[详情](BACKLOG-details.md#t-524)|
|T-519|⏸️|—|待验|[详情](BACKLOG-details.md#t-519)|
|T-525|⏸️|—|待验|[详情](BACKLOG-details.md#t-525)|
|T-517|⏸️|—|待验|[详情](BACKLOG-details.md#t-517)|
|T-516|⏸️|—|待验|[详情](BACKLOG-details.md#t-516)|
|T-510|⏸️|—|待验|[详情](BACKLOG-details.md#t-510)|
|T-506|⏸️|—|待验|[详情](BACKLOG-details.md#t-506)|
|T-502|⏸️|—|待验|[详情](BACKLOG-details.md#t-502)|
|T-497|⏸️|—|待验|[详情](BACKLOG-details.md#t-497)|
|T-451|⏸️|—|待验|[详情](BACKLOG-details.md#t-451)|
|T-449|⏸️|—|待验|[详情](BACKLOG-details.md#t-449)|
|T-448|⏸️|—|待验|[详情](BACKLOG-details.md#t-448)|
|T-433 S2|⏸️|—|待验|[详情](BACKLOG-details.md#t-433-s2)|
|T-433 S4|⏸️|—|待验|[详情](BACKLOG-details.md#t-433-s4)|
|T-433 S5|⏸️|—|待验|[详情](BACKLOG-details.md#t-433-s5)|
|T-426|⏸️|—|待验|[详情](BACKLOG-details.md#t-426)|
|T-425W|⏸️|—|待验|[详情](BACKLOG-details.md#t-425w)|
|T-413|⏸️|—|待验|[详情](BACKLOG-details.md#t-413)|
|T-417|⏸️|—|待验|[详情](BACKLOG-details.md#t-417)|
|T-418|⏸️|—|待验|[详情](BACKLOG-details.md#t-418)|
|T-420|⏸️|—|待验|[详情](BACKLOG-details.md#t-420)|
|T-399|⏸️|—|待验|[详情](BACKLOG-details.md#t-399)|
|T-399c|⏸️|—|待验|[详情](BACKLOG-details.md#t-399c)|
|T-409|⏸️|—|待验|[详情](BACKLOG-details.md#t-409)|
|T-372 W-spike|⏸️|—|待验|[详情](BACKLOG-details.md#t-372-w-spike)|
|T-372 W-ci|⏸️|—|待验|[详情](BACKLOG-details.md#t-372-w-ci)|
|T-391 H-econ|⏸️|—|待验|[详情](BACKLOG-details.md#t-391-h-econ)|
|T-393|⏸️|—|待验|[详情](BACKLOG-details.md#t-393)|
|T-401|⏸️|—|待验|[详情](BACKLOG-details.md#t-401)|
|T-406|⏸️|—|待验|[详情](BACKLOG-details.md#t-406)|
|T-407|⏸️|—|待验|[详情](BACKLOG-details.md#t-407)|
|T-396|⏸️|—|待验|[详情](BACKLOG-details.md#t-396)|
|T-398|⏸️|—|待验|[详情](BACKLOG-details.md#t-398)|
|T-366c|⏸️|—|待验|[详情](BACKLOG-details.md#t-366c)|
|T-361|⏸️|—|待验|[详情](BACKLOG-details.md#t-361)|
|T-352|⏸️|—|待验|[详情](BACKLOG-details.md#t-352)|
|T-320c|⏸️|—|待验|[详情](BACKLOG-details.md#t-320c)|
|T-350c|⏸️|—|待验|[详情](BACKLOG-details.md#t-350c)|
|T-351|⏸️|—|待验|[详情](BACKLOG-details.md#t-351)|
|T-349d|⏸️|—|待验|[详情](BACKLOG-details.md#t-349d)|
|T-339|⏸️|—|待验|[详情](BACKLOG-details.md#t-339)|
|T-328|⏸️|—|待验|[详情](BACKLOG-details.md#t-328)|
|T-332R|⏸️|—|待验|[详情](BACKLOG-details.md#t-332r)|
|T-336|⏸️|—|待验|[详情](BACKLOG-details.md#t-336)|
|T-335|⏸️|—|待验|[详情](BACKLOG-details.md#t-335)|
|T-337|⏸️|—|待验|[详情](BACKLOG-details.md#t-337)|
|T-337a|⏸️|—|待验|[详情](BACKLOG-details.md#t-337a)|
|T-337b|⏸️|—|待验|[详情](BACKLOG-details.md#t-337b)|
|T-337c|⏸️|—|待验|[详情](BACKLOG-details.md#t-337c)|
|T-337d|⏸️|—|待验|[详情](BACKLOG-details.md#t-337d)|
|T-337e|⏸️|—|待验|[详情](BACKLOG-details.md#t-337e)|
|T-337f|⏸️|—|待验|[详情](BACKLOG-details.md#t-337f)|
|T-337g|⏸️|—|待验|[详情](BACKLOG-details.md#t-337g)|
|T-334|⏸️|—|待验|[详情](BACKLOG-details.md#t-334)|
|T-324|⏸️|—|待验|[详情](BACKLOG-details.md#t-324)|
|T-340|⏸️|—|待验|[详情](BACKLOG-details.md#t-340)|
|T-315|⏸️|—|待验|[详情](BACKLOG-details.md#t-315)|
|T-316|⏸️|—|待验|[详情](BACKLOG-details.md#t-316)|
|T-317|⏸️|—|待验|[详情](BACKLOG-details.md#t-317)|
|T-318|⏸️|—|待验|[详情](BACKLOG-details.md#t-318)|
|T-319|⏸️|—|待验|[详情](BACKLOG-details.md#t-319)|
|T-312|⏸️|—|待验|[详情](BACKLOG-details.md#t-312)|
|T-307|⏸️|—|待验|[详情](BACKLOG-details.md#t-307)|
|T-306|⏸️|—|待验|[详情](BACKLOG-details.md#t-306)|
|T-301|⏸️|—|待验|[详情](BACKLOG-details.md#t-301)|
|T-302|⏸️|—|待验|[详情](BACKLOG-details.md#t-302)|
|T-261|⏸️|—|待验|[详情](BACKLOG-details.md#t-261)|
|T-249|⏸️|—|待验|[详情](BACKLOG-details.md#t-249)|
|T-250|⏸️|—|待验|[详情](BACKLOG-details.md#t-250)|
|T-255b|⏸️|—|待验|[详情](BACKLOG-details.md#t-255b)|
|T-185R|⏸️|—|待验|[详情](BACKLOG-details.md#t-185r)|
|T-136R|⏸️|—|待验|[详情](BACKLOG-details.md#t-136r)|
|T-100|⏸️|—|待验|[详情](BACKLOG-details.md#t-100)|
|T-087|⏸️|—|待验|[详情](BACKLOG-details.md#t-087)|
|T-045|⏸️|—|待验|[详情](BACKLOG-details.md#t-045)|

## ✅ 已完成

> ✅ 已完成任务全文已归档到 [BACKLOG-archive.md](BACKLOG-archive.md)(减小本看板体积;单一执行真相仍是本文件)。
