# Decision Log — CreatorOS

Record confirmations, assumptions, tradeoffs, accepted risks, and skipped stages so future agents do not need chat history.

> 2026-10-21 上下文精简：除最近 30 条外、且不含 Status: active / needs-user-confirmation / DEC-000 / accepted-risk / Delivery-Phase 的 229 条决策已原样迁到 [archive/DECISION_LOG-archive.md](archive/DECISION_LOG-archive.md)（只进不改）。查找：`rg 'DEC-xxx' orchestrator/archive/`。

## DEC-GROUP-1022（2026-10-04）：账号组统一多平台工作区与页面设计方法

**Owner**：user。**Status**：方向与执行已Confirmed；正式验收阻塞。后续执行授权见本节2026-10-04记录，无需再次确认视觉方向或实施。

**用户已明确**：以账号组承接同一创作者在多平台的账号与内容，全局切换改成切组，组内可查看总览、作品和数据，组管理在绑定账号入口；全面重构首页、运营分析与复盘。页面设计、重构和规范统一使用用户提供的oil-ui-pro 0.10.0，项目Skill已纳入`.agents/skills/oil-ui-pro/`并写入AGENTS.md。

**历史方案及后续授权**：[T-1022 SPEC](../docs/features/t1022-account-group-workspace.md)7节：每个旧账号先独立建组，用户再显式归组并选择主定位；历史资料按完整项目依赖闭包预览选入，共享文件保持原storageKey，通过明确资源引用授权组内读取；开放升级后写入后不自动降回旧schema。用户已明确不喜欢A/B新风格，认为原版更丰富；选择保留原版丰富工作台，只补账号组总览和多平台切换。A/B退出当前方向，原问候、五指标卡、三列六卡与侧栏底部账号入口保留。该视觉选择已Confirmed，不再询问A/B；用户进一步回复“认可，可视化的图需要设计的更好看一些”，确认原版增补并要求局部图表精修；随后明确指出图表连坐标都没有，要求可准确读数的坐标、刻度与单位。历史明细缺失时用已知范围或空态，不能用轮廓加数字轴假装日数据，不改变第7节历史迁移仍待确认的边界。

**依据与边界**：当前切换器与绑定入口仍为抖音，快手/公众号契约和公众号映射存在缺口。三轮独立SPEC评审已完成，四项归属/闭包/并发/回退缺口在方案层解决；第3轮绑定原版增补约束PASS[REV:2f179f8d9380]；评审PASS不替代用户迁移确认，也不证明生产实现、五平台登录采集发布或真实数据迁移已完成。当前只修改调研设计与流程工件，未执行真实库操作。现有全局reconcile失败沿T-1015/T-1018/T-916跟踪，新任务绑定工具glob问题登记T-1023。

**2026-10-04执行授权**：用户回复“ok 开始执行”，授权按已评审方案正式实现与验证。沿用第7节非自动合并默认：旧账号一对一初始组，主定位与历史资料在管理页由用户显式预览选择；原ID、storageKey与现有历史保留。此授权允许代码与隔离测试库迁移，不视为自动合并现有真实账号/资料或不备份就升级真实库。实施时将能力来源与未提供凭据的真机链路如实区分。

**2026-10-05实施记录**：沿用上述用户授权和已评审数据归属。正式页面组合实际 `pages.groupOverview.get`、`pages.dailyReport.get` 及原发布/项目服务，不另建SPEC候选表中的四个planned页面操作；最终公开调用链与机器旅程契约写入PAGE_SPEC。调度补齐按真实平台能力和成功绑定回执准入，转组只更新后续私有采集任务，历史run保持冻结组；归档组仅保留服务内可核验的既有私有采集权，不开放通用写入或外部allowArchived参数。新绑定提交后的任务初始化失败不撤销成功身份绑定。真实页面核心旅程已执行，正式frontend receipt仍因混合工作树无法绑定HEAD未放行；真实平台/安装版/原生200%继续待验，没有新增accepted-risk或自动真实库迁移授权。


**2026-10-05收尾状态**：启动/归档执行增量已独立复核关闭；后台合并362条及真实浏览器18检查点通过。pmem同步通过，全局reconcile保留33项旧漂移，沿T-916/T-1018/T-1015；正式提交绑定与真实平台、安装版、原生200%仍待验。taskctl已登记T-1022验收阻塞，未标完成、未提交混合工作树，未变更真实库授权边界。
---

## DEC-REL-045 (2026-08-11) — Windows 渠道 closure 必须消费同一 Package Brand 输入

- **状态**：Accepted（用户明确允许修复，智溯AI本轮只构建 Windows）
- **背景**：T-776 证明旧渠道 workflow 在 Windows 上先按官方默认值构建 production closure，随后才读取渠道清单并设置 `CREATOROS_SKIP_SIDECAR_REBUILD=1`。结果原生标题、图标和安装身份是渠道品牌，WebView 内编译常量仍是 CreatorOS。
- **决策**：渠道 plan-only 必须从仓库内已提交、已校验的 PackageManifest 与 ICO 生成一份 staging 品牌编译输入。Windows production closure 的唯一一次 Next 构建通过显式文件路径消费该输入；构建完成后执行非视觉闭包证明，核对最终编译产物中同时存在预期品牌名与图标摘要。workflow 不硬编码任何渠道名，不把大图标 data URL 塞进 Windows 环境变量。
- **边界**：不改变运行时 Growth 验签品牌优先级，不修改产品 UI，不改官方 `desktop-release.yml`，不运行视觉截图校验。渠道 macOS 现有路径不因本次智溯AI Windows 重跑而触发。
- **复验**：两端 plan-only、渠道 workflow/brand 契约、Windows closure 计划测试必须通过；智溯AI Windows Actions artifact 必须完成 NSIS 真安装、主页面真启动、卸载与 `unsigned-accepted-risk` 证据。

## DEC-AI-042 (2026-08-09) — 买断产品不设置付费/持久化二次确认

**来源**：V1 本地包把 `positioning.generate` 误归为副作用并弹“预计消耗”确认；确认后又因
ai@7.0.4 丢失审批签名而报错。用户明确纠正：CreatorOS 是买断产品，模型生成、转写、归档和
持久化能力应直接使用，不得因为预计费用或落库行为再限制一次。

**决策**：

1. 用户在可信聊天输入中要求模型生成、素材/封面生成、作品转写、网页素材读取/截图或抖音归档时，
   当前指令即授权执行，不再弹付费/持久化二次确认，也不在 CreatorOS 判断套餐或金额。
2. 继续保留不可信内容隔离：一旦模型读取网页、外部素材或本机文件，后续步骤只开放本地确定性
   只读上下文，不让外部提示词驱动生成、归档、转写、联网或本机文件读取。
3. 本机文件读取权限确认继续保留；它保护磁盘访问，不是收费门。ai@7.0.4 点击确认会覆盖并丢失
   HMAC signature，前端只在续跑请求副本中按 approvalId 恢复服务端原签名，后端照常验签。
4. AI 候选采纳门继续保留；它防止模型自动覆盖项目数据，不限制用户调用已购买的能力。

**Explicit Limits**：不改视觉；不新增额度、套餐、金额判断；不移除 SSRF、提示词注入隔离、
Keychain、loopback/CSP 或本机文件权限边界。

**Status**：用户已确认；纳入 T-736 BUILD。

```text
ID: DEC-PACKAGE-729
Date: 2026-08-09
Stage: T-729 BUILD
Type: package-public-link-authority
Decision: PackageManifest 分别声明包官网、包下载页、包人工反馈页和更新 manifest；构建入口将四者
          固化为当前包的公开配置。激活后的同类业务链接仍优先使用 Growth 已验签 runtime，缺失时
          只能回退当前包对应值，渠道包不得跨回 CreatorOS 官方。更新响应只提供 version/notes；
          自动反馈 API 只认构建期固定的唯一 Growth HTTPS authority 与固定 path，不从人工页面推导。
Rationale: PAT-004 CF-001/CF-004 命中：PackageManifest→构建环境→WebView/服务端反馈是跨脚本、前端
           与 Growth 边界且必须可追溯的协议，因此先修订清单契约并用解析、DOM 与服务端安全测试
           锁定，不允许散落硬编码或运行时猜测。资产索引没有 package-link authority 的可复用模块，
           本轮复用既有 PackageManifest 与 URL 校验入口，不新增依赖。
Pattern-Ref: PAT-004
Affected Artifacts: T-729、渠道包工厂 SPEC、PackageManifest、package-flavor、package-brand、
                    desktop-updater、问题反馈服务与设置/反馈入口测试。
Explicit Limits: 不改视觉样式、布局、图标或视觉快照；不把 machineId、激活码、ticket、Key 暴露给
                 Web/日志；不部署 Growth，不发布渠道包，不创建 tag 或 GitHub Release。
Audit Note: 候选分支早期曾把“前端零错误发布门”占用为 T-729；BACKLOG 已将该任务稳定别名为
            T-732。既有 `events.ndjson` 与 `GATE-T729-BUILD.md` 作为历史收据保持只读；本次渠道任务
            使用新的 SPEC/review 和 `GATE-T729-CHANNEL-LINKS-BUILD.md`，不篡改旧回执洗绿。
Owner: user+agent
Status: active
```

```text
ID: DEC-AI-727
Date: 2026-08-08
Stage: T-727 BUILD
Type: contract-and-execution-shape
Decision: `script.draft` 保留现有异步任务与候选确认链，但增加 `verbatim` 模式。模型只从本轮
          受信用户消息/文本附件清单选择 `sourceRef` 与可选精确锚点；服务端恢复原字符、计算
          hash 并写入 task input，runner 直接产 artifact_version 候选，不装配创作上下文、
          不调用写稿模型。普通 generate 模式零行为变化。
Rationale: PAT-004 CF-001/CF-004 命中：工具→组合根→任务 runner 是跨包、需端到端可追溯的协议，
           因此先在工具 schema 和任务输入形状中明确模式/引用/hash，不能仅加提示词。PAT-003
           AF-003 命中：保真导入也需要刷新可恢复、执行审计和统一确认门，继续复用持久异步任务，
           不另造同步写稿旁路。MOD-002 已核对但不借入保真路径：它适合普通非工具 LLM 调用，
           本需求恰恰要在 `verbatim` 模式彻底绕开 LLM；既有 generate 路径继续复用现有 provider。
Pattern-Ref: PAT-003, PAT-004
Asset-Ref: MOD-002（已评估；仅保留既有 generate 使用，verbatim 明确不使用）
Affected Artifacts: T-727 SPEC、chat-runner/chat-tools、script-runner、persistence-client、原文候选卡与测试。
Explicit Limits: 代码不用关键词/相似度猜创作语义，语义分界只由配置模型完成；不直接写稿面；不覆盖历史版本；
                 来源不唯一或已截断时 fail-closed，不退回模型重写。
Owner: user+agent
Status: active
```

```text
ID: DEC-WEB-672
Date: 2026-08-03
Stage: T-672 PLAN
Type: user-confirmed-public-commercial-boundary
Decision: CreatorOS 官网撤下全部公开价格、代理利润与作者个人联系方式。官网不再提供直营购买
          入口；价格、购买、代理和联系问题统一引导访问者联系向其推荐 CreatorOS 的授权合作
          伙伴，以保护代理的客户线索与利润空间。
Rationale: 公开零售价、进货价、利润和作者联系方式会让终端客户绕开代理，削弱代理推广意愿与
           成交空间。官网应成为代理可安全转发的产品说明页，而不是官方直销页。
Source: 用户 2026-08-03 明确要求“官网的价格下掉吧，包括我的联系方式，保护代理的利润”。
Affected Artifacts: T-668/T-671 公开范围、website/index.html、官网 FAQ、二维码静态资源与部署读回。
Explicit Limits: 内部代理价盘、Growth 商品、Activity 激活和既有代理身份不因官网下架而自动
                 变更；官网仍可公开产品能力、设备支持、一机一码和更新日志。
Owner: user+agent
Status: active
```

```text
ID: DEC-AGENT-671
Date: 2026-08-02
Stage: T-671 PLAN
Type: user-confirmed-channel-pricing
Decision: 用户以 599 元首购 CreatorOS 内测版后自动成为代理，不需要提交申请，不设置人工审核、
          加盟费或其他附加门槛。成为代理后进货价为 399 元/个，对外指导价为 899 元/个，
          代理首年每单账面价差 500 元；代理合作口径不提续费、续费分成或续费抽成。成为代理
          后进入“内测代理股东群”，并取得 CreatorOS 体系后续智能体产品的合作资格；各新智能
          体的具体价盘和交付规则在产品发布时另定。
Rationale: 用户希望代理收益简单、可直接解释，只赚首次销售价差，同时以长期产品合作资格增强
           内测代理的参与感，不在当前招商中引入续费结算复杂度。
Source: 用户 2026-08-02 最终纠正确认“没有提交申请一说，不要人为制造门槛”；首购 599 元后
        自动成为代理，进货价 399、指导价 899、进入内测代理股东群、后续所有智能体都有合作
        资格，并要求不要提续费。
Affected Artifacts: T-671 代理合作 SPEC；后续官网、代理招商物料、Growth 渠道商品与协议。
Explicit Limits: 399 元只适用于完成 599 元首购、自动成为代理后的后续进货；不得另设申请、审核、
                 加盟费或其他未确认门槛。
                 “代理股东群”当前是合作社群称谓，不构成工商股权承诺；未确认代理层级、最低
                 进货量、退换、官方直营、价格约束与售后责任前，不进入实现或公开承诺。
Owner: user+agent
Status: active
```

```text
ID: DEC-PRICE-668
Date: 2026-08-02
Stage: T-668 BUILD
Type: user-confirmed-public-pricing
Decision: CreatorOS 官网公开口径改为：内测群用户在 2026-08-10 前可按 599 元一次买断参与共创；
          内测结束后正式版为 899 元/年、次年续费 199 元/年，且不再提供永久买断。
          通用设备规则置于价格之前：一机一码，每个激活码仅绑定 1 台设备；当前支持 Apple
          芯片 Mac 和 Windows；Intel Mac 只能显示“适配推进中”。页面不展示基础版、Plus、
          Pro 或其他版本分级。购买意向通过现有联系方式私聊，确认后进入单独内测共创群。
Rationale: 现官网 1499 元永久买断、永久免费更新和笼统 Mac 支持已经与用户确认的商业规则冲突，
           继续公开会造成错误购买预期；静态官网应直接表达当前唯一价格真相。
Source: 用户 2026-08-02 连续确认价格海报、微信群通知及官网同步要求。
Affected Artifacts: website/index.html、T-668 SPEC、官网静态校验与部署读回。
Explicit Limits: 不修改支付、Growth 商品、Activity 激活、续费执行或换机契约；不承诺 Intel Mac
                 日期、免费更新、退款或多设备权益。
Owner: user+agent
Status: active
```

```text
ID: DEC-RADAR-642
Date: 2026-08-01
Stage: T-642 BUILD
Type: user-confirmed-creative-handoff
Decision: 仅内容雷达转出的选题携带“左侧对标逐字稿 + 右侧本账号改写初稿”；直接新建、
          常规 AI、评论/需求等正常选题链保持单稿流程。雷达改写初稿随 Candidate 和 Project
          作为 adaptedDraftSeed 传递，Project 首开直接显示；用户首次保存才物化为正式
          output_script 版本，之后共用既有编辑器、版本链和 script.draft，不创建第二套稿件状态机。
Rationale: 用户需要从雷达、选题到作品持续看到同一份对标与改写稿，但普通创作没有真实来源稿，
           强行套双栏会伪造依据并破坏原流程。seed 方案同时避免 promotion 跨模块创建 artifact
           产生半成功，销账复审 REV-002 的数据完整性风险。
Source: 用户 2026-08-01 明确提出左右对照并追问“直接创建选题也这样做吗？不是吧”。
Affected Artifacts: T-642 SPEC、雷达 transform/candidate/project brief 契约、选题详情、Project 稿面。
Explicit Limits: 普通选题不生成改写稿；左稿只读且不复制为正式稿；未采纳/未立项不写 Project；
                 首次保存失败保留 seed 并允许幂等重试。
Owner: user+agent
Status: active
```

```text
ID: DEC-ONB-637
Date: 2026-07-31
Stage: T-637 BUILD
Type: user-confirmed-information-architecture
Decision: 新手引导不再暴露文本模型配置和自动化任务。主线统一为绑定账号→确认账号情况→
          （已有作品账号）等待并查看历史项目→确定定位→监控对标→从对标创建选题→进入项目；
          新号跳过历史项目。设置页“重新打开”必须强制展示完整引导，即使全部步骤已完成。
Rationale: 自动化是后台基础设施，不是用户目标；用户需要围绕作品、定位、对标、选题和项目
           建立第一次成功体验。旧重新打开只清 hidden、又被 complete 自动隐藏，属于假按钮。
Source: 用户 2026-07-31 明确确认的引导顺序与“自动化用户完全不需要感知”。
Affected Artifacts: onboarding SPEC/状态机/数据装配/首页卡片、设置页重新打开入口与测试。
Explicit Limits: 不新增第二套自动化或后端持久化；不把 imported 历史项目算作用户新建项目；
                 历史项目确认按当前账号本地隔离。
Owner: user+agent
Status: active
```

```text
ID: DEC-POS-623
Date: 2026-07-29
Stage: T-623 PLAN / CONTRACT
Type: user-confirmed-product-semantics
Decision: 定位中心右上角统一为“新建定位母版”。确认后清空当前账号 profile 的画像、
          facets 与 downstreamRules，并以 statement_version_floor 建立新的当前母版边界；
          positioning_statements 继续不可变保留，边界之前的历史不再成为 currentStatement。
          随后只打开既有定位 AI 对话并预填从头访谈，不自动发送、不由 AI 直接写库。
          复盘页“帮我复盘”不再打开全局 Copilot，而是预填既有项目编导右栏，用户发送后
          复用 review.analyze。定位编辑点击外部不得关闭。
Rationale: 现有重新定位只清前端表单，旧规则仍会进入 AI 上下文；物理删除定位陈述又破坏
           不可变审计。复盘页已有右栏却再弹全局面板，造成双入口和会话混淆。
Source: 用户 2026-07-29 截图与明确指令。
Affected Artifacts: positioning contract/service/repository/schema、定位中心交互、项目阶段
                    DraftChatRequestProvider、复盘入口、相关测试与追溯。
Explicit Limits: 不删除历史定位陈述；不新增第二套 Copilot 或 review 工具；不自动发送
                 预填话术；AI 候选仍须用户采纳后通过 backend service 落库。
Owner: user+agent
Status: active
```

```text
ID: DEC-POS-632
Date: 2026-07-31
Stage: T-632 BUILD remediation
Type: user-confirmed-data-semantics-correction
Decision: “定位版本”必须可恢复完整母版，不再把只有一句话/关键词/产品锚的
          positioning_statements 冒充完整历史。新增只写一次的 masterSnapshot；重置前保存当前
          画像、facets、五类规则与陈述；恢复通过 backend 事务回写 profile 并追加新陈述版本，
          不修改旧历史。旧版确实没有快照的记录只提供“复制定位陈述”并明确缺失边界。
Rationale: 当前 reset 会物理清空唯一可变 creator_profiles，而历史行没有画像/规则，导致用户
           点击旧版本后表单仍为空，属于写真读空和潜在数据丢失。用户明确要求旧版本可恢复。
Pattern-Ref: PAT-002（RF-001 跨 profile/statement 原子恢复；RF-002 用户定位需重启留存；
             RF-004 正规 migration）。
Affected Artifacts: positioning resource/operation、0065 migration、positioning repository/service/
                    transport、定位中心历史交互、T-632 SPEC/Gate/测试。
Explicit Limits: 不覆盖或删除历史陈述；不伪造旧版缺失的画像/规则；不新增第二套定位模块；
                 AI 仍不直接写库。
Owner: user+agent
Status: active
```

```text
ID: DEC-LEARNING-001
Date: 2026-07-29
Stage: T-610 BUILD
Type: user-confirmed-product-semantics
Decision: 对话/复盘里由用户点击“采纳”或“存为经验”的内容，按当前用户与账号内的
          title+insight 稳定指纹去重，并直接成为 validated Learning，由知识库现有
          validated 投影立即展示；不再进入第二次裁决队列。AI 未经用户确认产生的候选
          仍保持 candidate。内容雷达保留跨轮次来源快照用于审计，但详情只按唯一 source
          展示，并回显最近采集时间与累计次数。
Rationale: 旧实现把已经经过用户确认的采纳再次降成 candidate，造成“已沉淀”但知识库
           不可见；刷新后还可重复插入。雷达详情把一个来源的三次历史快照误画成三条来源，
           与作品卡“1 个来源”的真实口径矛盾。
Source: 用户 2026-07-29 明确要求“经验需要去重，然后直接进知识库即可”，并要求核对采集
        是否去重。
Affected Artifacts: learnings.create 既有 operation 语义、Learnings service/repository、
                    learning migration、知识库 validated 投影、内容雷达详情来源证据。
Explicit Limits: 不新建第二套知识库表；不物理删除历史重复经验或跨轮次来源快照；不同账号
                 不互相去重；不同 source 发现同一作品时仍分别展示。
Owner: user+agent
Status: active
```

```text
ID: DEC-MODEL-619
Date: 2026-07-29
Stage: T-619 REMEDIATION / CONTRACT
Type: user-confirmed-authority-correction
Decision: Activity 的 config.pull ticket/introspection 只证明 projectKey/channelRef 与授权事实，
          不再提供权威 clientId。Creator 请求 Activity 时不得把自报 clientId 当授权依据；
          旧 ticket 响应若仍带 clientId 只兼容忽略。Creator 仅向 Growth 声明接受的
          extension/protocol，由 Growth registry 解析并签入最终 clientId；Creator 验签
          bundle 时继续强校验 Growth 签入的 creatoros.desktop 和协议。
Rationale: 应用/客户端目录唯一归 Growth，Activity 不拥有客户端目录，不能反向授权 clientId。
Affected Artifacts: T-606 Creator contract、creator-client-config-consumer-v1、Creator
                    config.pull request/parser/tests、T-619 validation、CHANGE_IMPACT。
Compatibility: 在 Growth/Activity 最终字段契约落定前，Creator parser 兼容旧响应字段但不信任；
               该兼容不允许恢复 request clientId，也不允许跨 locator 比较版本或 ETag。
Status: active（整改代码已验证；正式三端联调与独立复审前 release NO-GO）
```

```text
ID: DEC-MODEL-606
Date: 2026-07-29
Stage: T-606 PLAN / CONTRACT
Type: user-confirmed-authority-correction
Decision: CreatorOS 继续使用既有 config.pull ticket 和当前激活 locator。verified configured
          渠道 JSON 是当前模型配置权威，即使 Key/URL/model/provider 错误或模型调用失败也
          不回退本地；明确未配置、不可达且本次未取得 JSON、或安全校验失败时才使用本地。
          用户本地配置始终允许编辑并作为 inactive 备用。
Rationale: Growth T-086 最终契约与 2026-07-29 用户确认明确取代旧 T-575/T-604 设计。
Supersedes: T-575 的三键 parser/长期 Key 禁止/24h 远端 LKG；T-604 的 Gateway、短 bearer、
            introspection、alias routing、managed_locked 与远端 LKG 优先。
Invariant: Activity 只证明 projectKey/channelRef 授权；Growth-signed clientId 与其二者共同
           组成配置版本 locator。渠道 JSON/Key 不进入 URL、日志、错误、审计摘要或 Web 响应。
Authority: Growth docs/contracts/T-086-creatoros-managed-model-service.md
           SHA-256 be1d4546b080e8b30144e31dd20d2e094d82b66d3c57d0f6116782fb89650182；
           T-086-review-concern-resolution.md
           SHA-256 68bd438f9893a7c4508cff396274e893cb630d7ad488109e6b91430f18cdbc0f。
Status: active（独立评审通过前不得 BUILD）
```

```text
ID: DEC-PKG565-002
Date: 2026-07-27
Stage: T-565 PLAN / RAT
Type: user-confirmed-external-execution
Decision: 授权 agent 创建、推送并操作 T-565 的原生 Windows RAT 工作流；GitHub Actions
          费用不设上限，由 agent 根据验证需要持续运行和修复，直到 Product Gate 所需的
          Burn payload/cache/代理/中断、Win32 current/journal kill recovery 与 reparse
          containment 证据形成。
Rationale: T-565 重写 SPEC 的 cross-family Round 1 唯一未闭环 blocker 是原生 Windows
           可行性证据；本机没有 Windows/Wine/VM，私有仓 GitHub-hosted Windows runner
           是当前可执行的真实 Win32/NTFS 环境。用户明确回复“授权运行windows rat
           没有费用上限 你来操作”。
Pattern-Ref: PAT-001
Pattern Tier: T1（WiX Burn 直接采用 + CreatorOS 窄事务 worker；命中 BG-003 官方方案、
              BG-005 覆盖 acquisition/trust，worker 只补产品事务缺口）
Affected Artifacts: T-565 SPEC/review、Windows RAT workflow、RAT evidence、BACKLOG。
Explicit Limits: 仅授权验证和为验证所需的 branch/workflow push；不创建或发布 GitHub
                 Release，不对用户分发安装包，不将 RAT spike 冒充生产实现。
Supersedes: DEC-PKG565-001 的“不得触发付费 Windows runner”限制；其他限制继续有效。
Owner: user+agent
Status: active
```

```text
ID: DEC-PKG565-001
Date: 2026-07-27
Stage: T-565 PLAN
Type: user-confirmed-architecture-direction
Decision: 重选 CreatorOS Windows Runtime 交付架构。默认发布小型 Web Installer，同时保留
          完整 Offline Installer；两者使用同一签名分层 Runtime Image 与安装事务。setup
          必须完成全部必需 runtime 的下载/读取、校验、物化和 smoke；正式应用首启完整
          runtime 解压次数恒为 0。必须实质减少 node_modules/JS 散文件，不能只把原 tar
          改成联网下载。Windows 正式安装树不得保留通用 node_modules/源码项目结构；纯
          JS/JSON 优先 bundle，只有 Chromium、媒体工具、WASM、native addon、migrations
          等有真实路径要求的资产可进入签名 allowlist。安装失败不得显示成功或转移给首启修复。
Rationale: Windows 0.2.0 真机在安装后白屏约 30 分钟，已确认是在处理大量小文件。现有
           NSIS POSTINSTALL 失败后保留 tar、首启 AppData 兼容解压的 fail-forward 破坏
           “安装完成即可使用”与诚实失败边界；当前 runtime 26,381 个文件中 24,756 个来自
           node_modules，在线下载本身不能消除 NTFS/Defender 小文件成本。RAT-565-01 已证明
           高置信 prune 可把普通文件减至 16,381（-37.91%）且真实能力 smoke 通过，但距离
           ≤5,000 仍必须进行 production closure bundle；`pnpm deploy`/Next standalone/压缩
           容器都不能单独成为最终解法。
Architecture Refinement: 实际 Tauri 壳与四层 runtime 组成不可变、版本化 compatibility set；
                         固定 shortcut 只启动稳定 launcher，installer 在 pending set 真 smoke
                         后以单一 `current` 指针同时切换壳与 runtime。0.2.0 首迁移不信任旧 tar
                         为新 layer，必须全量取得新签名 layers，并在提交前保留 legacy fallback。
                         默认 Web 发布阈值：首装 ≤500 MiB、core-only 更新 ≤100 MiB、每成功
                         安装 CDN 成本 ≤US$0.10；超限阻断或另开 DEC。
Source: 用户 2026-07-27 明确要求“必须得 setup 阶段完成小文件的解压缩，并且必须合理的减少
        小文件”；在收到“默认 Web Installer + 保留 Offline Installer”的推荐与确认请求后
        回复“启动”。
Affected Artifacts: T-565、Windows runtime packaging、installer、updater、release workflow、
                    desktop startup resolver；替代 T-487 的 Windows 交付条款。
Invalidates: T-487/T-493 中“NSIS hook 失败后首启兼容解压可作为发布兜底”以及 T-487 已完成的
             Windows 零解压验收结论；macOS 交付条款不受影响。
Explicit Limits: 不触发付费 Windows runner、不发布安装包、不改变领域数据存储、不把必需
                 runtime 改成应用首启/功能首次使用时按需下载。
Owner: user+agent
Revisit Trigger: Windows 原生 RAT 证明 WiX Burn/少文件方案不可行，或用户改变在线/离线分发取舍。
Status: active
```

```text
ID: DEC-MC-002
Date: 2026-07-26
Stage: T-501 4-build
Type: user-confirmed-scope-reduction
Decision: T-501 只做现有模型设置页的轻量优化：减少普通用户配置项；“保存并测试”复用正式
          modelFor + streamText 并验证非空文本；补官方预设、New API/中转站、Responses、
          Kimi 开放平台与 Kimi Code 教程。
Rationale: 用户明确指出模型配置需求没有原方案复杂。当前 Settings、T-471 Responses 和
           settings.models.put/test 已经存在，继续建设八槽总览、向导、能力平台和付费探测
           会扩大范围、增加配置负担并偏离真实问题。
Source: 用户会话“优化一下就行了……减轻用户配置负担，优化配置测试通路，补充教程文档即可”，
        2026-07-26。
Affected Artifacts: T-501 BACKLOG/任务详情、替代范围、应用内手册、模型预设、连接测试组合层。
Invalidates: 旧 T-501 PRODUCT SPEC/CONTRACT/PAGE SPEC 中的八槽总览、配置向导、能力平台、
             费用与付费 effect 均不进入 BUILD；旧文档只作为历史审计材料。
Explicit Limits: 不新增页面/公开 operation/数据模型；不依赖 T-517；不触发图片或视频付费调用；
                 轻量测试只承诺基础流式文本，不冒充复杂工具调用全兼容认证。
Owner: user+agent
Revisit Trigger: 用户明确要求新增模型管理页面、能力平台、计费或付费 provider 验证。
Status: active
```

```text
ID: DEC-001
Date: 2026-06-20
Stage: 00-intake (orchestrator initialization)
Type: default-assumption
Decision: Initialize product-to-code-orchestrator as a MID-PROJECT TAKEOVER rather than from scratch.
         Existing markdown specs and the implemented frontend are mapped onto stages in
         ARTIFACT_MANIFEST.yaml instead of being regenerated.
Rationale: The repo already contains product docs, frontend/backend specs, a fully implemented
          frontend (127 files, passing lint/typecheck/tests), and 17 imported UI screens.
          Re-running stages 00-11 from zero would discard working artifacts.
Source: Repo scan on 2026-06-20 (docs/, frontend/, backend/, ui/, branch feat/frontend-implementation).
Affected Artifacts: orchestrator/ARTIFACT_MANIFEST.yaml and all stage rows.
Invalidates: none.
Owner: agent
Revisit Trigger: If the user wants a clean-room re-derivation with full traceability.
Status: active
```

```text
ID: DEC-002
Date: 2026-06-20
Stage: 00-14 (all pre-existing stages)
Type: default-assumption
Decision: Mark all pre-existing artifacts as `draft` (not `passed`), because none were produced under
         this orchestrator and none carry stable IDs or have had their stage gate run.
Rationale: State-machine rule: a stage may move to `passed` only when its gate has been run and
          confirmations recorded. That has not happened yet for any stage.
Source: rules/orchestrator-state-machine.md, transition rule 1.
Affected Artifacts: stages 00-14 in ARTIFACT_MANIFEST.yaml.
Invalidates: none.
Owner: agent
Revisit Trigger: Ratification pass — run each stage gate to promote draft -> passed.
Status: active
```

```text
ID: DEC-003
Date: 2026-06-20
Stage: 11-frontend-implementation
Type: tradeoff
Decision: Treat frontend implementation as verified-green on static checks (eslint 0, tsc 0, vitest
         all-green) but NOT release-verified, because `next build` and the full vitest/visual suite
         could not complete inside the sandbox (45s command limit; npm registry blocked).
Rationale: Static analysis passed cleanly; build/visual confirmation must run on the host.
Source: Sandbox verification run 2026-06-20.
Affected Artifacts: stage 11 + OPEN-002.
Invalidates: none.
Owner: user
Revisit Trigger: Host run of `pnpm verify`.
Status: active
```

```text
ID: DEC-004
Date: 2026-06-20
Stage: 00-14 (ratification pass, option A)
Type: scope-change
Decision: Ran the ratification pass. Extracted and assigned stable IDs from existing docs
         (68 FR, 24 NFR, 22 FLOW, 58 ENT, 9 IA, 18 PAGE, 42 COMP) into ID_REGISTRY.md and built
         TRACEABILITY_MATRIX.md. Ran each stage gate 00-14. Documentation stages pass on completeness;
         those requiring confirmation are set to `needs-user-confirmation` pending one batch sign-off.
Rationale: User chose option A to firm up the foundation with traceability before backend work.
Source: Repo docs + subagent ID extraction, 2026-06-20.
Affected Artifacts: ID_REGISTRY.md, TRACEABILITY_MATRIX.md, ARTIFACT_MANIFEST.yaml (stages 00-14).
Invalidates: none.
Owner: agent
Revisit Trigger: User confirms the extracted IDs/specs -> promote stages to `passed`.
Status: active
```

```text
ID: DEC-005
Date: 2026-06-20
Stage: consistency-gates (cross-artifact)
Type: accepted-risk
Decision: Cross-artifact consistency gate returns FAIL on the upstream->downstream orphan scan: every
         backend-bearing FR currently lacks an API operation and a backend test, because the service
         contract (stage 15) and backend implementation (stage 16) do not exist yet.
Rationale: Expected for a frontend-first project mid-build; not a defect, but it blocks any claim of
          end-to-end completeness. Recorded so it is not mistaken for done.
Source: TRACEABILITY_MATRIX.md > Orphan Scan; consistency-gates.md.
Affected Artifacts: TRACEABILITY_MATRIX.md (GAP-002, GAP-003), manifest consistency_gate.status.
Invalidates: blocks stage 17 (integration-release) until chains close.
Owner: user+agent
Revisit Trigger: After service contract (15) + backend TDD (16) close the broken chains.
Status: active
```

```text
ID: DEC-006
Date: 2026-06-20
Stage: 11-frontend-implementation (remediation)
Type: user-confirmation
Decision: FULL ALIGNMENT — the existing specs are authoritative; the implementation will be changed to
         match them. All P0 decision points resolve in favor of the spec:
         (R0-1) migrate UI primitives from @base-ui/react back to shadcn/ui on Radix (locked baseline);
         (R0-4) add all 13 missing domain entities to types + fixtures;
         (R0-6) align field/enum types to the data model (Learning.confidenceScore int; relationType free string);
         (R2-7) create the mandated directory structure (public/fixtures/, features/<page>/{components,tests}).
         Execute the full P0+P1+P2 backlog in REMEDIATION_BACKLOG.md.
Rationale: User chose "需要全量对齐" (full spec conformance) over amending specs to accept current code.
Source: User instruction 2026-06-20.
Affected Artifacts: entire frontend; REMEDIATION_BACKLOG.md; manifest stages 06-12.
Invalidates: current frontend visual baselines (must re-baseline after fixes, R2-9).
Owner: user
Revisit Trigger: If scope/effort (≈5-8 wks) forces a phased cut.
Status: active
```

```text
ID: DEC-007
Date: 2026-06-21
Stage: 11-frontend-implementation (remediation execution, host)
Type: scope-change / gate-result
Decision: Executed the DEC-006 remediation backlog on the host and re-ran the stage-09
         frontend-implementation gate. Result: PASS (with one documented residual). Stage 11 promoted
         draft/fail -> passed/pass; implementation_gate fail -> pass.
Work done:
  - INC-3 (host-only): migrated all 18 ui/* primitives @base-ui/react -> shadcn/ui on Radix
    (radix-ui 1.6.0); removed @base-ui/react; components.json new-york. 0 @base-ui imports remain.
  - INC-5 milestones A-D: de-dup ProjectStageStepper; extract analytics layer
    (AudienceBreakdown/RetentionChart/HorizontalBarsChart/InsightCard), resource layer
    (AssetCard/MediaPreview/AssetDetailPanel), SearchField; move Pagination/ViewModeToggle/SortSelect to
    components/navigation; rename to spec (PlatformIcon/InsightCard/RetentionChart/AudienceBreakdown);
    public/fixtures/ + canonical.json generator; pin Node 24 LTS. Shared components ~10 -> 20.
  - INC-1/INC-2/INC-4 (prior sandbox work) re-verified GREEN under full host build.
Verification: `cd frontend && pnpm verify` GREEN — ESLint 0, tsc 0, 398 tests (38 files), next build OK.
Residual (non-blocking, recorded in STAGE-09-GATE-RERUN.md): RISK-007 tail — single-use content
  components (ArtifactListItem/KnowledgeListItem/EvidenceCard/FileThumbnail/VersionCard) left inline per
  SPEC §8; FilterBar + per-page search unification (R2-3); ui/* sweep (R2-6); test-dir relocation (R2-7);
  stage-12 visual re-validation (R2-9, design-locked references).
Rationale: User chose full INC-5 scope; highest-value/lowest-risk component work executed in committed,
          individually-verified milestones. Visual re-validation is stage-12 and excluded from `pnpm verify`.
Source: Host execution 2026-06-21 on branch remediation/frontend-spec-alignment.
Affected Artifacts: ARTIFACT_MANIFEST.yaml (stages 11/12, increments, implementation_gate),
          STAGE-09-GATE-RERUN.md, entire frontend ui/components layers.
Invalidates: CODE_RECONCILIATION.md FAIL verdict (superseded by STAGE-09-GATE-RERUN.md PASS).
Owner: agent (DEC-006 user-authorized)
Revisit Trigger: Stage-12 visual validation; or if the user wants the R2 tail completed.
Status: active
```

```text
ID: DEC-008
Date: 2026-06-21
Stage: 15-service-contract (15a)
Type: scope-change / build
Decision: Advanced the pipeline (user chose "build the backend") by executing stage 15a — the
         FE↔BE service contract — as the foundation that unblocks all parallel module verticals.
Approach: Zod-first shared package `@creatoros/contract` (approach C), pure TS, transport-agnostic.
Work done (TDD, on branch feat/service-contract off remediation/frontend-spec-alignment):
  - Framework: envelope (SPEC §14) + primitives + defineEndpoint registry + typed client + Transport iface.
  - 15 modules (projects exemplar + 13 fanned out via a 14-agent workflow) of resource DTOs + operations,
    translated field-by-field from types/domain.ts; 4 page composition DTOs.
  - registry.test asserts the surface == SPEC §13 exactly (76 routes, each once, unique ids) — caught +
    fixed an ai/projects key collision and a GET /search duplicate (page layer owns it).
  - traceability.test: every endpoint traced; each GAP-002 named backend-bearing FR covered.
Verification: contract gate typecheck 0, 20 files / 60 tests green; frontend untouched (398 tests pass).
Result: stage 15 -> draft/gate-pass (15a); frontier -> 16-backend-tdd. Closes the CONTRACT half of GAP-002.
Not done (separate specs/plans): 15b (FE MockTransport + read migration + mutation wiring — makes the
  buttons real), stage 16 (backend TDD against these schemas), stage 17 (MockTransport->HttpTransport swap).
Source: User instruction 2026-06-21 ("选择2" — build the backend).
Affected Artifacts: contract/ package; ARTIFACT_MANIFEST stage 15/frontier; TRACEABILITY_MATRIX GAP-002.
Owner: agent (user-directed)
Revisit Trigger: Start 15b or stage-16; or reconcile fine-grained per-operation FR ids.
Status: active
```

```text
ID: DEC-009
Date: 2026-06-21
Stage: 15b (FE mock-backend) + AI-orchestration design/foundation + contract seam fix
Type: scope-change / build / gate-result
Decision: Under the /goal "启动workflow开发前后端程序 以及联调" directive, advanced the pipeline in
         workflow mode (sequential TDD pipelines, one agent per plan task, verify+commit, halt-on-fail).
Work done (branch feat/service-contract, worktree frontend-implementation):
  - AI EXECUTION LAYER (new): designed + built. Spec 2026-06-21-ai-orchestration-agent-sdk-design.md
    (unified Claude Agent SDK substrate; AITask=query() on a worker; in-process creatoros MCP tools;
    submit_candidate is the SOLE write boundary; confirmResult is AI-free; awaiting_confirmation added
    to AITaskStatus). Plan 2026-06-21-ai-orchestration-foundation.md executed Tasks 1-10 (Wave 1):
    new @creatoros/ai-worker package (state machine, candidate schemas, ports, context tools,
    config resolver, fake runner, orchestrator, confirm) — SDK-free, 27 tests green. Task 11 (real
    SDK query() runner + script-rewrite Skill + manual smoke) deferred (needs binary + API key).
  - 15b (Wave 2): executed plan Tasks 1-8 — MockBackend store (deterministic clone + seeded ids),
    MockTransport + lib/contract-client (composition root), Dashboard read seam + loop, Projects
    read+write handlers (§12), Projects page async reads, and the Projects buttons wired
    (createProject/transitionProjectStage/patch/archive + refresh). viewModel? seam + isActiveRoute
    gate preserved; no assertions weakened.
  - CONTRACT SEAM FIX: @creatoros/contract switched NodeNext .js specifiers -> bundler resolution
    (module:esnext/moduleResolution:bundler, extensionless across 36 files). NodeNext .js barrels were
    unresolvable by Next 16/Turbopack (dropped ENDPOINTS/createClient at build); the whole consuming
    stack is bundlers (FE Turbopack, stage-16 BE = Next.js, vitest). Supersedes DEC-008's
    "exports ./src/index.ts" packaging note (still source-direct; just bundler-resolved).
  - AITaskStatus: added awaiting_confirmation in contract primitives + frontend domain.ts.
Verification: frontend `pnpm verify` GREEN (lint 0, tsc 0, 420 tests + 1 todo, Turbopack build OK,
  all 18 routes); contract typecheck 0 / 61 tests; ai-worker typecheck 0 / 27 tests.
Result: FE now consumes the contract via MockTransport with real Projects mutations; the FE↔BE seam
  builds clean. Closes the FE half of GAP-002 for the Projects vertical. Frontier -> 16-backend-tdd.
Not done: 15b Task 9 manifest promote (this entry stands in); other FE verticals (reuse 15b foundation);
  AI worker Task 11; stage 16 backend; stage 17 MockTransport->HttpTransport 联调.
Source: /goal workflow execution 2026-06-21 (Waves 1-2).
Affected Artifacts: ai-worker/ (new), frontend/ (mock-backend + projects), contract/ (seam + status),
  docs/superpowers/{specs,plans}/2026-06-21-*; ARTIFACT_MANIFEST stage 15b/AI/frontier.
Owner: agent (user-directed)
Revisit Trigger: Start stage-16 backend TDD; or wire AI worker Task 11.
Status: active
```

```text
ID: DEC-010
Date: 2026-06-21
Stage: 17-integration (FE↔BE 联调 seam, thin slice over the 15b mock store)
Type: scope-change / build / gate-result
Decision: Brought the FE↔BE integration (联调) forward over the 15b mock store, ahead of full
         persistence, because a runtime gap demanded it: 15b client islands imported the
         MockTransport-bound client, which in the browser mutates a browser-LOCAL store the server
         never sees (and bundles the mock backend into the client). So island buttons did not truly
         persist across router.refresh(). The fix IS the integration.
Work done (branch feat/service-contract):
  - HttpTransport (lib/http-transport.ts): client-safe; POSTs {id,input} to /api/v1/dispatch.
  - Composition split: lib/contract-client.ts -> HttpTransport (browser islands; no server imports
    -> mock backend stays out of the client bundle); lib/contract-client.server.ts (server-only
    guard) re-exports an in-process MockTransport client (server pages/route);
    server/mock-backend/in-process-client.ts is the guard-free variant for in-process tests.
  - Route app/api/v1/dispatch/route.ts: RPC dispatch by endpoint id -> mockTransport over the SERVER
    store -> contract envelope. STAGE-16 SWAP POINT: replace the transport behind this route with a
    persistence-backed one; HttpTransport + contract + pages are unchanged.
  - Tests: route.test proves the create->persist->list round-trip; http-transport.test the fetch
    shape; vitest stubs server-only/client-only (guards stay live in the Turbopack build).
Verification: frontend `pnpm verify` GREEN (lint 0, tsc 0, 426 tests +1 todo, Turbopack build OK, 18
  routes); client-bundle audit: getStore/handlers NOT in client chunks (only a pre-existing
  shell-router->canonicalDataset import remains, out of scope).
Result: real HTTP FE↔BE round-trip over the contract for the Projects vertical; island mutations now
  persist server-side. The "swap a line at stage 17" promise is realized as "swap the transport behind
  one route." Frontier -> 16-backend-tdd (real persistence behind the dispatch route).
Not done: stage-16 real persistence (Drizzle/Postgres; the TDD-PLAN uses Testcontainers — a
  Docker-vs-pglite test-infra decision is pending before that wave); other FE verticals (reuse this
  seam + 15b foundation); AI worker Task 11.
Source: /goal workflow execution 2026-06-21 (Wave 3, done inline for RSC-boundary safety).
Affected Artifacts: frontend/ (lib/*, app/api/v1, mock-backend, pages, vitest.config, server-only dep).
Owner: agent (user-directed)
Revisit Trigger: Stage-16 persistence behind /api/v1/dispatch; or fan out the remaining verticals.
Status: active
```

```text
ID: DEC-011
Date: 2026-06-21
Stage: 16-backend-tdd (Projects persistence slice) + 17 live cutover
Type: scope-change / build / gate-result
Decision: Executed a real-persistence slice and cut the live app over to it, so the FE↔BE 联调 round
         -trip is durable SQL, not the in-memory mock (closing the gap the Stop-hook flagged).
Infra decision: pglite (pure-WASM Postgres) instead of the TDD-PLAN's Testcontainers — runs in vitest
         AND the Next server with no Docker; Drizzle schema/queries identical to a real Postgres.
Work done (branch feat/service-contract):
  - NEW @creatoros/backend package: Drizzle schema (projects, project_activities) + pglite db factory
    (in-memory for tests / dataDir-capable) + ProjectRepository (list/get/create/patch/archive/
    stage.transition/activity, replicating the mock §12 semantics, injected clock+id for determinism)
    + createPersistenceTransport (contract Transport; UnsupportedOperationError -> caller falls back).
    typecheck 0, 8 pglite-backed tests.
  - LIVE CUTOVER: frontend compositeTransport (server/persistence-client.ts) = persistence for the 7
    project-entity ops + mock for the rest, used by BOTH server pages (contract-client.server) and the
    /api/v1/dispatch route -> server reads and island writes share ONE pglite store -> a created
    project persists in SQL and survives router.refresh(). An ownership set keeps pglite out of the
    static build; next.config serverExternalPackages externalizes the WASM. Deterministic seed
    (canonical) + clock/ids keep test/visual parity.
Verification: frontend `pnpm verify` GREEN (lint 0, tsc 0, 427 tests +1 todo, Next build OK WITH pglite,
  /api/v1/dispatch route live); backend typecheck 0 / 8 tests; route.test proves create->persist(SQL)->
  list + mock fallback.
Result: a COMPLETE vertical slice through the whole stack now exists and is proven —
  contract -> FE (HttpTransport) -> /api/v1/dispatch -> compositeTransport -> pglite SQL -> envelope ->
  render, durable. The "swap the transport behind one route" promise is realized with real persistence.
Not done (now pure fan-out of a proven path): the other 6 project ops' outputs/tasks persistence + the
  other module verticals (Knowledge/Assets/Artifacts/Publishing/Analytics/Reviews/Learnings/AI/
  Notifications) — each = a Drizzle schema + repository + add ids to PERSISTED_OPS, reusing this slice;
  dataDir for cross-restart durability; AI worker Task 11 (real SDK runner); extract /api/v1 into a REST
  surface if a standalone backend service is wanted.
Source: /goal workflow execution 2026-06-21 (Wave 4, inline for DB+RSC-boundary safety).
Affected Artifacts: backend/ (new pkg), frontend/ (persistence-client, contract-client.server, route,
  next.config), pnpm-lock; ARTIFACT_MANIFEST stage 16/17/frontier.
Owner: agent (user-directed)
Revisit Trigger: Fan out remaining verticals/ops; add dataDir durability; AI worker Task 11.
Status: active
```

```text
ID: DEC-012
Date: 2026-06-21
Stage: program scope (七步整合设计 adoption)
Type: scope-change / user-confirmation
Decision: ADOPT docs/CreatorOS-七步整合设计.md (Seven-Step Integration Design) into the program.
         It extends (does NOT refactor) the 6-stage trunk: adds a positioning gate, a monetization
         loop, a Candidate/AudienceSignal topic-intel layer, a Prediction/Rubric calibration loop, and
         cross-cutting PlatformAccount/ContentCalendar/StageTemplate/AI-relay. Its hard constraints
         C-2/C-3/C-4 ARE our proven patterns (DEC-011 persistence path / DEC-009 AI candidate-confirm /
         Ingestion idempotency), so the new modules slot into the same foundation/module-template/
         contract-op/pglite fan-out with zero architectural conflict.
User decisions (2026-06-21):
  1. Adopt, phased per spec §8.
  2. The "monetization-weighted" directional change (§2.0/§4.4/§6.2) is BAKED INTO the base-module
     plans BEFORE Wave 2/3 launch (no retrofit): ContentOutput.content_role (traffic/trust/conversion);
     MetricValue.metric_key extension (profile_visit/lead/inquiry/conversion/revenue…);
     AudienceSnapshot.dimension_type += intent/paying; Learning.learning_type += conversion types;
     Dashboard/Publishing surface conversion/lead as first-class metric columns. Touches the Projects/
     Analytics/Reviews/Learnings/Publishing/Dashboard module plans (+ a small contract v0.3 for
     content_role on contentOutputResource & any enum/key additions that cross the wire).
  3. The 6 NEW modules (positioning, monetization, candidate+audience-signal, calibration,
     platform-account, content-calendar) are appended as Waves 5-7 AFTER the base 16 (Waves 1-4),
     in spec §8 priority order (P0: monetization+candidate+calibration → P1: positioning+
     platform-account+content-calendar → P2: stage-templating+AI-relay+eng-debt). Each gets a
     modules/<n>-<module>.md plan via the same generation+fan-out; needs a contract v0.3 op/DTO pass.
  4. ID governance: PRAGMATIC continuation (append new FR/ENT/etc. as new segments) — NOT the spec's
     formal C-1 freeze ceremony, consistent with how this build has proceeded.
Execution timing: edits to base-module plans (#2) happen AFTER the running Wave 1 (Taxonomy/
  Notifications/Search/Settings) completes and BEFORE Wave 2 launch, to avoid worktree contention.
Source: user instruction 2026-06-21 (pointed at the new spec, "看能怎么落地" + 3 confirming answers).
Affected Artifacts: docs/CreatorOS-七步整合设计.md (status→adopted); upcoming contract v0.3; base-module
  plans (Projects/Analytics/Reviews/Learnings/Publishing/Dashboard); new module plans (6); program waves.
Owner: agent (user-directed)
Revisit Trigger: Wave 1 done → bake the directional change into Wave 2/3 plans; after base waves →
  generate the 6 new-module plans + contract v0.3.
Status: active
```

```text
ID: DEC-013
Date: 2026-06-22
Stage: process (orchestrator workflow hardening + manifest reconciliation)
Type: scope-change / process-improvement
Decision: (A) Reconcile ARTIFACT_MANIFEST.yaml to repo reality, and (B) add an in-repo executable process
         layer so the manifest can never silently go stale again, modeled on industry practice.
Problem found (audit 2026-06-22): the manifest's `stages:` block was a frozen 2026-06-20 snapshot that its
         own DECISION_LOG (DEC-008..012) contradicted — it claimed backend "not-started / no code" while a
         real @creatoros/backend persistence slice, @creatoros/contract v0.4.0, an ai-worker, and a live
         FE↔BE↔SQL Projects round-trip already existed on feat/service-contract (317 commits ahead of main).
         Required artifact CHANGE_IMPACT.md was missing; API/TEST/MOCK/ASM IDs referenced but never
         instantiated; consistency_gate=fail was non-blocking; failing gate verdicts were "invalidated"
         rather than retained; the workflow definition lived only in an external, unpinned skill install.
Work done:
  (A) Manifest reconciled: header + project block (work_branch, topology, honest notes); stages 13/15/16/17
      corrected to match DEC-008..012; consistency_gate reason updated + marked blocking for stage 17;
      added reconciliation + reference blocks; OPEN-003 resolved, OPEN-004 (ID governance accepted-risk) and
      OPEN-005 (untracked control artifacts on wrong branch) added.
  (B) New orchestrator/process/ layer (in-repo, version-pinned — fixes "definition lives external/unpinned"):
      - reconcile.mjs: drift detector / executable gate. Validates manifest against JSON Schema, checks
        each build-claim against git+filesystem reality on the work branch, enforces the blocking-consistency
        rule (no `passed` downstream of a failing release-critical chain unless `accepted-risk`), and flags
        manifest staleness vs the latest DEC. Exits non-zero on drift (CI-as-gate).
      - manifest.schema.json: structural + enum validation for the manifest.
      - rules/orchestrator-state-machine.md: pinned copy of the external skill rule (reproducible audits).
      - README.md: best-practice mapping (CI-as-gate, Terraform/GitOps drift, policy-as-code, DO-178C
        bidirectional traceability, ADR immutable history).
  (C) Created CHANGE_IMPACT.md back-filling CI-006/009/012 (the previously-missing required artifact).
Policy set:
  - FAIL HISTORY IS RETAINED: a failed gate verdict superseded by a later pass keeps its record + a delta;
    it is NOT marked `invalidated`. (Corrects the DEC-007 pattern; anti snapshot-laundering, ADR-style.)
  - DRIFT IS CHECKED: trust the manifest only after `node orchestrator/process/reconcile.mjs` passes.
Rationale: User /goal — "参照业界优秀实现解决 orchestrator 工程问题，并修复 manifest 等问题."
Source: Two-agent audit (artifacts + repo reality) 2026-06-22; skill rules at
        ~/.skills-manager/skills/product-to-code-orchestrator/.
Affected Artifacts: ARTIFACT_MANIFEST.yaml, DECISION_LOG.md, CHANGE_IMPACT.md (new), orchestrator/process/* (new).
Invalidates: none (corrects bookkeeping; no code/spec change). Does NOT alter any DEC-001..012 verdict.
Owner: agent (user-directed via /goal)
Revisit Trigger: Backport the executable-gate + retained-history changes into the external skill; or commit
        the control artifacts onto feat/service-contract (OPEN-005).
Status: active
```

```text
ID: DEC-014
Date: 2026-06-22
Stage: process (long-running autonomous harness)
Type: scope-change / process-improvement
Decision: Add a long-running autonomous harness so the orchestrator can run UNATTENDED for hours/days to
         implement the remaining verticals, following Anthropic's official "Effective harnesses for
         long-running agents" (three-agent initializer/coding/evaluator + progress checklist + commit-per-step).
Work done:
  - progress.json — feature-grained task queue, DERIVED from work-branch reality via process/progress.mjs
    (not hand-written). 21 verticals; honest status: only `projects` persisted, 20 scaffolded, 0 e2e_verified
    (matches the ~30% maturity note). `e2e_verified` is human/evaluator-set, never inferred.
  - process/progress.mjs — generate (from git reality) / status / next (the loop's task picker).
  - process/harness/ — README (3-agent model + run via /goal, headless loop, or GitHub Action), init.sh
    (initializer), coding-agent.md, evaluator.md, settings.autonomous.json (permission allowlist +
    Stop-hook = reconcile.mjs, for unattended runs only — NOT always-on project settings).
  - rules §"Autonomous Mode": scope-envelope pre-authorization replaces synchronous per-stage gates; an async
    decision queue lets the loop continue on unblocked verticals while a human answers asynchronously.
  - Backported to the skill (both copies) so future projects inherit the harness.
Rationale: User asked to research Anthropic's official long-running-agent practice and make the skill support
         it. Research confirmed the three-agent harness + /goal + self-verification + fresh-context-per-step.
Source: anthropic.com/engineering/effective-harnesses-for-long-running-agents; Claude Code /goal; Agent SDK.
Affected Artifacts: progress.json, process/harness/*, process/progress.mjs, rules (updated), skill copies; a
         detailed KB doc written to ThirdSpace (03-知识).
Invalidates: none (additive process layer; no code/spec change).
Owner: agent (user-directed via /goal)
Revisit Trigger: Run init.sh and drive the loop; or wire the GitHub Action on feat/service-contract.
Status: active
```

## DEC-020 (2026-07-23) — Codex/Claude 共用 product-to-code-orchestrator 入口

**来源与确认**：用户指出 CreatorOS 既有交付模式由 `product-to-code-orchestrator` 管理，
更换 Agent 宿主不应改变流程，并要求补充 `AGENTS.md`。

**决策**：

- `AGENTS.md` 对 Codex、Claude Code 和其他 Agent 一视同仁：先读 BACKLOG/SPEC，再加载技能、
  校验版本、执行 stage-router，最后才可改代码。
- BACKLOG 状态只经 `taskctl` 转换；`pmem` 仅同步项目记忆。
- SPEC + BACKLOG 是计划，不再用 writing-plans 文档替代。
- 历史证据不得伪造；缺失只能记 fail、pending 或用户确认的 accepted-risk。

**影响**：Agent 会话入口与流程治理，不改变产品行为、数据归属或物理架构。
**Status**：active。

## DEC-REL-001 (2026-07-26) — 明日发布按核心逻辑 accepted-risk 进入 BUILD

**来源**：用户明确纠偏：不要因协议形式追求完美阻塞开发；UI、功能和核心逻辑没有大问题时
先实现、先发布，评审剩余完整性问题后补。

**决策**：

1. T-517、T-519、T-537 不再等待合同字段、示例和 scope ledger 的形式完美，按当前 PLAN 与
   replacement contract 直接进入隔离 BUILD。
2. accepted-risk 只覆盖协议完整性和扩展性，不豁免三条发布底线：T-537 不串 owner/collector；
   T-517 不重复/丢失运行且终态诚实；T-519 不产生跨账号或半写入文件。
3. 实现只复用现有 scheduled job/PersistentTask、Assets/Knowledge/Search/图和内容雷达 source，
   不新造第二状态机、上传平台、搜索平台、图谱平台或全局账号选择器。
4. 真实双抖音账号 RAT、完整真机 E2E 与剩余合同补账必须在最终发布说明中诚实列为待验收，
   不得把单测 fixture 冒充真实外部数据源证据。

**Status**：accepted-risk（用户授权先 BUILD；不等同于发布验收 PASS）。

## DEC-FDB-003 (2026-07-26) — 发布前采用官方飞书表作为产品 Bug 降级入口

**来源**：用户在 test 包真机确认 Growth/AM 尚未下发反馈地址，并明确要求先写入飞书多维表格
入口，让用户手动提交和上传日志压缩包；应用内发送按钮禁用，暂不强制依赖 Growth。

**决策**：

1. `IssueFeedbackDialog` 仍优先使用签名 `bugFeedbackUrl`；字段为空或读取失败时，退到 CreatorOS
   内置的官方飞书反馈表 URL。该常量只服务产品 Bug，不得复用于购买、续费、下载或渠道售后。
2. 应用内“发送问题反馈”固定禁用，不调用产品反馈 POST；“打开反馈渠道”保持可用并通过可信
   desktop opener 打开系统浏览器。
3. UI 明确引导用户复制反馈内容、打开日志文件夹、压缩为 zip，再在飞书页面手动上传。
   CreatorOS 不自动读取、打包或上传日志，也不宣称外部页面已经提交成功。
4. 这是发布前 accepted-risk 降级；Growth/AM 的长期权威、签名 runtime 和三系统商业边界不变。

**Status**：accepted-risk（用户确认的临时发布降级；T-546）。

## DEC-RUNTIME-062：作品点击授权后台升级为项目

用户明确要求每条内容雷达作品一键排队完成 AI 转写、拆解选题和生成文案，可连续加入多条。点击“升级为项目”即对该作品授权后台创建关联项目；文案仍保留候选，不自动覆盖正式稿或发布。队列属于 backend，沿用 execution_tasks/Pi/租约/控制命令；等待子任务让出执行槽。独立评审指出旧 confirmTopic/promote 非原子窗口，改用 projects 端口按 queueTaskId 原子幂等建项目，复用 topic_preview 已有改写初稿并关联来源，避免第二次写稿。前端仅持续刷新服务端进度，不用页面生命周期、缓存 TTL 或固定轮询总时长控制后台任务。详见 T-937 SPEC。

## DEC-RUNTIME-063：恢复定位切换原版本而非复制新版本

用户T-939反馈恢复每次新增定位。经独立评审，新增内部currentStatementId；恢复指向原statement并恢复profile快照，不生成恢复副本；NULL兼容旧max/floor语义。新创作仍max+1，reset与discovery CAS统一读取；恢复使用账号锁。已有历史和项目引用不变，不清理用户旧版本；公开响应结构不变。双端更新仅对标审计及明确流水线artifact隔离修正，不据此授权公开发布或生产自动更新。

## DEC-T962 运营增量同步与独立RedFox研究能力

用户本轮明确确认：作品年龄按2/6/24小时分层，同步合并、雷达两小时且可编辑，RedFox独立设置密钥支持官方及自定义模型。保留原执行权与历史，通过各能力成功时间决定到期；原停用意图保留。RedFox网络由worker执行，经后端保管凭据，不走模型配置或宿主读工具。SPEC见t962-operations-sync-redfox.md；独立评审t962_review通过方向，水位/分页/续跑约束已纳入。

## DEC-T968 · 日报 CSV 保存与日期空值
用户要求桌面端导出由用户选择目录，且格式改为 CSV。采用 Tauri 原生保存面板和受限单一导出命令：前端不获得任意路径写入权限，命令仅在用户刚选择的 `.csv` 路径写入，取消不落盘；远程 sidecar 仅获该命令权限。网页运行时无法使用系统保存面板，安全降级为浏览器下载。项目排期的空字符串统一视为未选择日期，用北京时间当天作为日历锚点。
## DEC-T969 · 聊天凭据与 RedFox 额度的可恢复状态

用户反馈 RedFox 热点请求被显示为“结果尚待核对”。公共 CLI 证明原任务没有模型调用、工具步骤或结果，因此不得把没有外部调用事实的配置失败伪装为未知结果。Worker 在模型凭据端口遇到 `LlmCredentialError` 时统一返回 `waiting_user`，不启动供应商调用；RedFox 官方业务码 3201 映射为额度不足，模型须提示用户补充或更换 RedFox 密钥额度。未知结果仍只保留给账本已有 started/unknown 调用的场景；原任务不自动重提。

## DEC-T974：容量观察与运行验收分离

用户于本轮明确认可 Windows 打包独立优化：文件数和安装包体积超参考值只告警，不代替功能判断；保留运行依赖、无链接/无node_modules、授权完整性、真实安装、启动、渲染和卸载硬门。依据 T-974 SPEC；不购买 Windows 签名，不创建公开 Release。

## DEC-T983-20260914 — 采集错峰与运行入口

用户当前明确要求：流量详情超时继续修复；两小时任务错峰；有活跃任务查看原运行，否则启动一次并查看。接受范围落实为默认00/15/30/45分钟，保留用户自定义非默认计划和关闭状态；服务端核对活跃运行，前端详情走本地打开并遵守LED-047。授权本地验证，未授权公开发布。

T983来源状态补充：真实页面对照证明部分旧作品只有正常指标卡且无来源组件。以unavailable明确表达平台未提供，而不是伪造比例或标为采集失败；保留历史来源和原采集时间，不按年龄猜测。独立审查确认登录/加载/未知结构不得降级，用户本轮修复授权覆盖此必要契约表达。

## DEC-T1000 · 周期运营方向的可选结构化扩展

用户明确要求周/月运营分析提供更多建议和战略方向。保留原有日报协议版本及缓存键，增加可选 `directions` 字段，旧缓存无需迁移；模型根据所选周期真实作品决定条数与内容，证据不足不凑数。页面将阶段内容取舍与单条实验分开展示；仅内部复盘使用，不进入分享战报或数据导出。实现和验收见 `docs/features/t1000-operations-strategy.md`。

## DEC-AW-1003 — 多步 Agent 与 NomiFun 能力迁移规格

用户明确确认 CreatorOS 应接受目标后连续执行，不需逐步“继续”，并要求参考自己参与开发的 NomiFun 工具及 browser_use。本轮只编写规格、拆任务与评审。保留 Pi core 与 execution_tasks；新增通用工具适配和产物链路，复用版本化 NomiFun 浏览器实现，账号隔离与 profile 唯一所有者不可绕过。具体实施选择及验证触发见 docs/features/t1003-agent-workbench.md；未批准发布或修改 NomiFun 源仓。

## DEC-TRIAGE-1014 — 历史治理告警按真实适用范围销账

用户要求核对233项历史失败并关闭有证据的过期项。本轮明确DEC-015描述的是历史门控等级，当前开发仍为interactive（不改变产品Agent自主执行能力）。使用官方归档命令迁移98条已完成看板行，补78条搁置行的验收列为待验，并恢复评审回执绑定的SPEC链接。历史回执不重签、不降低receipt_policy、不修改有效教训命令、不扩大架构违规基线。当前仍失败的规格和测试分别沿T-916/T-1015追踪；完整清单见docs/verification/t1014-triage.csv。


## DEC-T1017 · 2026-09-30 · 内容雷达优先产出可用改写稿

用户明确反馈生成选题卡的步骤多、输出要求苛刻，核心价值是“按自己的定位快速改写别人的文案”，且首要关注可用性。产品主结果调整为基于真实对标文案和当前账号定位直接生成可编辑纯文本；来源拆解、改写策略和选题卡结构化字段降为可选补充，不得阻断首稿可见、编辑和复制。日志只证实 `topic_preview` 以 `output_invalid` 失败，未记录足够信息确认具体模型/供应商原因。

保持账号/来源归属、事实真实性、隐私安全、幂等冲突及现有相似性采纳规则；本决策不自动发布、不覆盖已采纳稿件，也不以低质量格式校验替代用户判断。`previewTopic.positioningVersionId` 改为可选且向后兼容：每次新任务由服务端解析并冻结当前完整定位母版；没有定位时使用通用改写并如实记录未应用定位，不伪造版本。为使简化后的首稿继续进入既有创作链，新写入允许使用 `rewrite_only` evidence：保存真实来源引用、快照/逐字稿哈希、定位是否应用/可用版本、改写稿 seed、模板版本和模型运行回执引用；拆解、策略及其 hash 仅为可选补充，不能用空壳伪造。主改写只有一个模型任务；选题卡不再自动生成第二个模型任务。Candidate、Project parser、seed reader 和 `script.draft` 必须识别该新变体，并在无策略时基于真实来源与已确认改写稿继续，显示证据缺项但不因缺少可选策略而整单失败；旧的完整 evidence 继续原样读取。新稿正文在生成时持久化，用户页面修改在显式采纳/创建 Project 时持久化。该变体不绕过现有事实、隐私或相似性采纳规则。

详细页面与服务行为以 `docs/features/t1017-content-radar-rewrite-first.md` 为准，须独立评审通过后实现。T-1017 对 T-642 / DEC-RADAR-048 的局部覆盖仅限新 `rewrite_only` 主链及其最小 evidence、当前定位解析和无策略 Project 写稿行为；旧 strategy-backed 记录、普通项目和 T-642 其余来源/采纳/Project 一致性要求继续有效。T-633 中的扫码恢复保留，雷达改写由 T-1017 承接。

T-1017 测试补充（2026-09-30）：用户明确要求测试。本轮覆盖纯文本、无定位、冻结输入、未知请求恢复、采纳响应丢失/并发、重试旧稿保留及 Project seed，上述处理落实既有可用性与幂等范围；来源标题只作为参考名称，不伪造 Project 核心信息。真实供应商和最终桌面旅程仍待验；全局旧测试/边界失败登记 T-1018，常规 script.draft 相似度缺项继续归既有 T-642；没有记录 accepted-risk。实测证据见 docs/verification/t1017-rewrite-first.md。

## DEC-T1019-DEFAULT-20261002

用户后续明确认可v02八格和方法并要求普通选题默认集成；配置editorialPolicy保留user_approved、认可来源及selection_method。原普通对话选题与持久/每日选题同读当前账号配置，模型返回当前gridVersion、两侧真实格子及gridRelationReason；缺失配对保留研究而不假称已审读推荐。策略认可不升级问题假设、作者测试、入口核验或候选接受状态。新增运营可视化需求完整登记T-1020，依赖T-1019先验收；已有四个本地heartbeat不得报告成系统UI完成。

## DEC-T1062-MIGRATION-CLOSURE-20261005：迁移候选绑定与后续验收边界

最终迁移候选 `f8ce322d63e1844e6eff8595af85813e50d7d79d` 已通过隔离候选校验并由主会话 fast-forward 整合。独立最终复核 PASS，371/371 文件哈希匹配，354 个冻结 lineage SQL 和三个 journal 无漂移；独立提交副本重新生成的新增 DDL/catalog 与提交逐字一致。最终新增 SQL bytes 的六文件 43 项回归通过，包括 PGlite/PostgreSQL 四种基线、原安装包 0101 前缀、原数据核对、备份恢复、二次启动、转组及孤立资料保持。全部结果见 `docs/verification/t1062/preflight/migration-independent-review-final.json` 与 `migration-convergence-final-candidate.json`。

保留两次 FK 索引发现失败、Research Gate 实验及恢复、中间自有 WIP 提交/soft reset、暂存内容格式检查遗漏与最终重验，不把旧失败改写成历史 PASS。迁移租约已释放，T-1062 仍进行中；新增域服务组归属、粗剪协议 3、真实模型/原生操作及安装版逐项验收未通过。当前仅创建私有备份目录，未停止/替换现装客户端，未操作真实数据库。

## DEC-T1062-BACKEND-REUSE-BUDGET-20261005：新增域适配的精确复用边界

迁移整合后，后端、合同及既有 Worker 适配写集限定为 120 条必要/新路径、23 条条件路径及一个结果工件，不新增 SQL/journal，不修改前端页面或原生归档。已存在的 CLI 组参数和 projects 的事务锁读取继续复用；服务仍需落实空组、跨组、只读/归档、原父归属和冻结回执。粗剪只实现已独立评审的协议 3，协议 2 原冻结字节和摘要保持。准确路径和迁移 DDL 对照见 `docs/verification/t1062/backend-adaptation-scope.json`。

两个装配文件的四个复杂度标记经独立逐项复核，可在既有机制内接线：Worker IPC、凭据 resolver、既有语言工具链装配及 native dispatcher。预算精确绑定当前文件 SHA，不授权新 port、凭据保管/迁移/加密、运行时安装探测、二进制下载或进程拓扑；writer 改字节后须按真实 diff 和最终 SHA 再复核。该记录不是功能、测试或安装验收 PASS。

验证入口从候选自己的根目录执行声明的类型与公共链测试，使用独立临时目录、内存测试库、mock storage及限定 55422 的随机 PG 库；local storage fixture须自行使用临时根，环境变量不冒充覆盖用户自定义存储。所有失败保留，不使用旧日志代签新字节。此前归档原始输出时六个末尾空行触发格式告警，原始字节和告警均保留；Git自动hook因lefthook不在PATH未运行，后续必须显式执行实际Gate，不声称hook通过。

## DEC-T1062-ROOT-CLOSURE-20261005：补全已确认组域的实际公开根依赖

真实模板/CLI红测试后，调用图发现组合和转换依赖的projects创建回执及文章、图文、朋友圈根仍要求account；原moments模型结算还使用eq(accountId,NULL)。同一个T-1062范围补全这些实际依赖，不新建创作域/账本/SQL或改变归属方向。先暂停writer，保存20个WIP的base/current哈希，release lease，再按独立19路径审查补18条精确写集并重编译；不在活跃lease上扩大配置。独立报告首轮1条手抄摘要遗漏已保留并经19/19 git-show重采纠正。

新output group只从锁定父project派生；新共享创建account=NULL，旧账号行/唯一键/原digest与费用freeze保持。同组平台筛选不改owner，不同组隔离，旧同key多账号不能隐式首行。归档合法历史读与不可变候选投影不等同新写授权。此次只确认必要依赖闭包，产品实现/23组测试/真实ASR/安装版仍待验。第二份独立真实ASR音频也保留正文成功但末尾时码越界的负例，不裁剪、补写或认作词句成功。


## DEC-T1062-RECONSTRUCT-SETTLEMENT-20261005：原调用结算不能被归档误拒

沿用户授权的整合、修复、提交、打包和逐功能验证范围，真实原任务完成闭包在模型账本已结算后被账号组归档门拒绝；实际AiService及structured准备还支持group任务accountNULL，而重建父锁仍要求平台账号。独立只读调用链及原源码摘要复核后，174窄增4个精确源成为178，不改变共享资料与平台事实归属，不新增API/SQL/WorkerSDK/账本/通用权限helper。

只对原ref、原冻结任务/业务/Skill身份和版本、真实model/N账本与已知usage、原group及imported父项目建立当前事务内的命名结算能力。普通用户create/append、foreign/搬组/取消/租约失效/未决调用仍拒绝；原成功回执重放不创建新产物或重计费用。当前红2是真可用性失败，但直接ledger.reserve并非完整generation协议；完整generation公共链与PG锁序须当场验，不回填历史PASS。精确独立报告及原失败见docs/verification/t1062/preflight/reconstruct-settlement-root-scope-review.json。

102条WIP已逐字节保护，原lease释放后重编译再恢复。此修订落实既有任务收口和组归属合同，不授权新的模型请求、外部发布或自动归组真实资料。当前客户端与用户数据未替换；本次scope准入不代表全27组合或安装验收通过。

## DEC-T1062-TEST-HARNESS-20261005：有限测试执行预算与原断言保留

真实原27第7次执行有六项PGlite冷迁移/服务组合达到默认5秒；独立范围评审同意统一backend Vitest case预算30秒，精确新增config为179条。技术补充见docs/features/t1062-backend-test-harness.md，原产品SPEC和三轮PASS receipt不变，不创建Owner=user的新review-cycle capability。此为已授权验收中的实现选择，不声称用户逐项批准该数值或功能已通过。原27 argv/顺序/命令20分钟、PG观察6秒、产品/模型deadline、所有断言和失败证据保留，无retry或skip新增。主控制面metadata提交和新隔离lease之后才允许config唯一修改，必须重新完整运行原27。用户最后确认当前登录用户与现装App用于验收，备份和当前数据保留仍为安装前置。


## DEC-T1062-PRODUCTION-PARENT-20261006：首载工程沿真实锁定父组创建

用户已授权本地候选整合、修复、提交、打包与逐功能验收。本次公开浏览器发现 production 首载遗漏父 groupId；增加两个精确后端路径落实既有共享组域及父归属合同，不改变产品方向、服务协议、SQL、归属规则或发布范围。独立候选审查后，先保存前端 WIP 全部字节，释放旧 lease，再提交控制面范围补充、同步隔离工作树并重新 claim；禁止在活跃 lease 上漂移 modules.config。

修复新 production 只承接已锁定真实父项目 groupId；旧 nullable 及错误行拒绝保留。候选有真实公共接口红/绿 7 项回归，完整 18 检查与安装版仍待发生。旧单账号浏览器夹具更新为公开真实组归属，不修改跨组、保存、刷新或媒体解码断言；旧孤立资料使用既有显式迁移，不隐式归组。此条记录授权范围内的实现依赖调整，不声称用户对代码另签确认。

素材预览同范围补充：追加唯一 `frontend/src/features/creative-canvas/canvas-asset-picker.tsx`，将已有真实 `currentFileId` 交给 exact 文件预览，不新增 API/owner 或媒体副本。真实组件 RED/GREEN 已保留，原图片 naturalWidth/视频 readyState 及跨组断言继续通过实际浏览器验证；当前无 active lease，补充独评后再提交该控制面增量与同步 writer，避免模块边界漂移。

## DEC-T1062-FIRST-ROOT-READY-20261006：初次根确认与合法任务可用性

用户已授权整合、修复与逐功能验收。真实trace显示组初始化归一取消正在创建的文章；本次7条精确前端路径补全既有根选择的初始化闭包，包含统一context、layout外modal与Copilot、真正可取消的公共contract请求、真实恢复和测试。初次根未确定时避免开放写入；已有合法原根遇列表错误/超时不被新门反杀，后续重试仅菜单回读不自动换根，同组dirty/native不卸载，显式跨组原确认/abort保持。原账号/组权限及旧nullable路径不变，不新增session/归属算法/业务协议或自动重发。

公众号夹具读取公开真实唯一active成员组并保两个原用例全部断言；新增首载真实延迟回归，原18命令与6native旅程保留。原native标题漏dirty同步只重建现有owned源及输出，不手补生成JS。静态独评通过后先保护全部WIP、释放租约、提交控制增量、同步writer，再干净workspace claim后逐字节恢复并应用已评审候选。先前仅Wechat一条TMP控制增量未应用、保留历史，现以本7条完整闭包替代。该记录落实授权范围内的可用性，不声称用户另签了代码或功能验收通过。


## DEC-T1062-PUBLIC-PORT-WIRING-20261006：实际组内保存与冻结传输兼容

沿用户已授权的整合、修复与逐功能验收，Attempt10 的真实 native 媒体初存公开响应揭示同事务 materialLinks 组合根遗漏项目 owner；另既有 http-transport 原17测试揭示用户级管理分支及空 frozenScope 兼容缺口。本次仅准入 `frontend/src/server/persistence-client.ts` 和 `frontend/src/lib/http-transport.ts` 两条生产读者的命名装配修复，并仅准入 `frontend/src/components/overlays/overlay-routing.test.tsx` 一条既有受保护测试的真实unit port proxy兼容。原LED-047实际162项中161通过、1失败，候选保全部原主体/断言和真实factory/signal/epoch/abort，其它LED0477文件不改，不新建产品或权限算法、不放宽组域、平台账号事实、精确文件、取消、epoch、lease或SQL。

项目 owner 只由同一 transaction 的公开 projects service 返回真实父行，素材仍由真实 assets 与 materialLinks 服务校验；HTTP 只恢复既有 user-scope/forceNewDouyin 与显式冻结空 scope，不从当前根补身份。生产各候选及 SPEC/DEC/module 由其他 Agent 独审；保全 WIP后释放租约、提交三路径控制增量、FF同步并干净 claim 后才允许应用。控制3路径使 module586/owned580+conditional1=effective581，snapshot795保持；protected214、explicitreadonly8仅对应上述三保护移出及HTTP唯一readonly移出，HTTP原测试仍只读。

保留实际两ASR首次save404、原17两红和所有原18失败。TMP公开调用集成红/绿仅证明真实service/transport及命名事务装配，不称浏览器、词级ASR、安装或听感通过。本记录落实已确认服务归属和可用性，不声称用户对这两行代码另签确认；完整原18及用户安装验收仍待发生。


## DEC-T1062-AAC-TIMING-20261006：原 AAC 可验证时间映射与完整手工降级

沿用户已经授权的ChatCut式Skill粗剪、整合修复和逐功能验收，Attempt13真实全文成功而词级失败。Research定位前置PCM-only/AAC→MP3 unverified，两个有界证据与只读校验闭合；新增独立内部v2标准零起点AAC物理receipt与显式strict union，旧v1及真实父/文件/组、请求/CAS/取消/账本保留。支持族由实际每文件packet/edit/decoder/resampler/WAV与实际工具链身份证明，参数化D/S/N，完整N输出不裁切、不pin端点；词边界精确换算且音频与视频双域拒绝，任一失败保全文，不做剪辑语义选择。无新公开API、IA、归属、SQL、模型配置或费用选择。

偏移Original22旅程按原安全降级合同仍请求word，取得真实text/无tokens/手工提示，零粗剪模型候选或自动采用；显式保存全文与真实手工修改，保存刷新核完整工程、revision/mediaRefs/source/exact摘要。普通AAC原word/真实gap/原声20采用旅程仍严格，Original18 argv与预算不变。精确6路径、module592/owned586+conditional1=587/source801等边界见SPEC；完整实现独评/TDD/公开链/安装听审待发生，不把Research恢复或静态评审称功能PASS。本条落实既有用户授权，后续一次性评审周期另需真实用户流程授权，不虚签Owner=user。


## DEC-106201 — 用户批准 T-1062 一次新规格复审（2026-10-06）

```text
ID: DEC-106201
Authorization-Kind: process-review-cycle
Task-ID: T-1062
Previous-Spec-SHA256: 00088921686a37da277f0bf04f0165ae83bcb93760d230566d68d9bc270bf05f
Previous-Constitution-SHA256: 86bc2c8add6a01ebf5b2ecf9de05d448770ca14a4e0bdbbf376fffc6387e3800
Allowed-Change-IDs: T1062-PARENT-MEDIA-PUBLIC-COMPAT, T1062-FIRST-ROOT-READY, T1062-PUBLIC-PORT-FREEZE, T1062-AAC-INTERNAL-V2, T1062-OFFSET-MANUAL-JOURNEY
Max-Cycles: 1
Nonce: 0d2280dc-a611-4158-91b4-e9c3548119ee
Owner: user
Status: active
Pattern-Ref: product-to-code-orchestrator/templates/DECISION_LOG_TEMPLATE.md
```

用户在本会话对“是否同意我开启这次复审并继续执行？”实际回复“同意”。本授权仅绑定上述五项已有产品范围内的补充与一次复审，继续修复、提交、本地打包及安装后逐项验证；不替代实际测试，不授权 Windows 分支推送或公开发布。授权原文见 `docs/verification/t1062/review-cycle-user-authorization.json`。原三轮及已销账问题保留。


## DEC-T1062-AAC-DUAL-DOMAIN-20261006：完整解码与可呈现音轨分别校验

本轮沿用户实际“同意”的 DEC-106201 复审及已授权六条实现范围继续，不新增授权用途或复审周期。安装包既有 b6.0 实测保留末帧完整1024样本而不返回 discard sideData，R5 按严格证据正常降为全文。保留该真实失败，新增严格独立 v2 证据族，记录真实缺失字段；可呈现音轨 S、完整已解码 D_dec 与实际全部输出 N 分别闭合，不把呈现域外407样本称静音或工具已报告padding。完整音频不裁切，每词按精确整数换算同时守真实 S 与视频边界；旧 v1/R5 schema 和六路径、原声20、正常word、偏移全文手工与原18不减。实际 N 尚待实现实测，不追溯签通过。

完整 SPEC 候选 0862053580d275458d434265e950d097332a894509af3c290d97fb6cdc5fed38、技术提案 8a1a8bc0657f93fc65116639ca30e19f25a672ffdade269ba897647ec6abe2ac 已由现有团队另一 Agent 独立静态复审，真实报告 a29b69619408937916896393892a2f1a0e1c4476dd882fe42c3ff2fcc5649da2，cycle2 round2 packet 保留。旧 TMP 五份权威缺失明确保留，CURRENT 四源真实复建、web lock 和 ASR 只准新当场证据及独评后重绑，不能重签历史或缩减验收。模块592不变；实现、完整浏览器、统一产品提交、安装及用户听审仍待验。


## DEC-T1062-AAC-OBSERVED-COUNT-20261006：按完整实际输出验证整数计数

沿 DEC-106201 用户实际“同意”的同一次 cycle2，round3 仅修正同六源内计数验证，不新启周期或扩用途。实际 b6 完整无补裁输出 N238933、D_dec716800、S716393，原唯一 ceil238934 的两项失败及原日志保留。完整原点、帧连续、实际flush、WAV/PCM与工具摘要闭合后，以精确 BigInt floor..ceil 最多两个相邻整数核对实际 N；不生成、不补、不裁样本。词级精确3n与整数时基仍同时守 S 和视频范围，未知或越域整份全文降级，旧v1/R5不变。

完整 SPEC cfbaf9e80e6c8b005899c9be2f06d080e66cc119a14be381b721850a4fd36a1c 已由另一 Agent 独立复核，报告8019a65cd05d18c7375dc392c561c13deb391ae55248892f8592effee006338e，合法空 finding recheck packet168c0b4a93a7ec89f9464484ff7a1fbb10ad8d9a9127bcd32d6b53b34f975a2e。592/587/801/214/8/31/414/12、Original18、22cases与原声20均不减；目前只允许实现和必须实际验证，未签真实模型、浏览器、出包、安装与听审。


## DEC-T1062-INSTALLED-HISTORY-IMPLEMENTATION-20261006：落实已有旧库兼容要求

Owner=agent 的机械实现选择，非用户typed capability，也不重置规格复审轮次。原批准SPEC cfbaf9不变：当前用户旧库保留与真实历史核验已在范围内。安装失败发现4个已执行旧身份，精确SQL和实际clone结构共同证明来源；新增archive-only，不引入历史业务代码。采用原三canonical加实际账本supplemental subset的参考catalog，原0128与fresh凭证行为不变，unknown/前缀/结构拒绝保持。完整105项单源不存在；两份非祖先来源如实标注为实际账本对应SQL。独立实现/scope评审不作为第四规格轮次，旧评审/研究事件不删除。公共工厂RED/GREEN及21回归实际发生，安装全功能仍待验。


## DEC-T1062-INSTALLED-CONTRACT-BOOTSTRAP-20261006：消除原合同初始化循环

Owner=agent 的机械实现选择，非用户typed capability或新规格复审。原已批准SPEC cfbaf9的真实安装和逐功能可用性覆盖本次修复。当前真实包账号/组成功但页面报creativeCanvasOperations初始化TDZ；独立Agent确认原源码直接操作入口亦实际exit1，不依赖混淆。原注册表与定义反向边移为叶子定义，原定义字节、公共重导出、操作schema/ID/注册顺序（含原重复展开）保留；40操作仅改定义import。43精确产品路径独立substep，不改原integration592、迁移283、原18或历史receipt，不放宽打包/安全/凭据。独评前不写产品；新回归、全合同与新包真实入口仍须现场验证。


同一DEC-T1062-INSTALLED-CONTRACT-BOOTSTRAP的测试发现校正：Node ESM新回归改为mjs后，旧Vitest仅匹配.ts，实际61/325不覆盖新42。独立复核准入既有config只追加精确mjs路径；当前44产品/45step，所有原测试/合同/范围保持，须重新实际62/367和3/49。Owner仍agent的机械测试装配，无新用户capability/规格周期。


## DEC-T1062-INTEGRATION-COMPLEXITY-REBIND-20261006：已有整合字节的机械预算重绑

Owner=agent 的机械控制记录，非用户 typed capability，不开启规格新周期。用户既有整合、修复、提交、本地打包及当前 App 逐功能验证授权、原 SPEC cfbaf9、原 integration592/801 和原18均不变。正常 claim 的11项拒绝已保留；7个当前文件全与既有67b4a27f整合提交相同，后续本地打包/历史兼容/合同 bootstrap 并未改变它们，复杂度账本旧SHA未同步。

独立只读报告 `/Users/zyongzhu/CreatorOS-local-acceptance/t1062-20261005-wm9zxxwl/integration-complexity-readonly-review-g3hiqp92/independent-review.json`，SHA256 `cab28137d8183a5c55ba2f7b8009c0a650522f29985c0480a501dc04e1364e0f`。本次只追加7文件的11既有类别当前SHA预算；原entries、历史baseline、SPEC、任务、scope、guard、markers和产品字节均原样保留。不扩大Rust/Bun工具链、凭据存储、二进制或进程权限；persistence-client仅为原PUBLIC-PORT-WIRING准入的同transaction公开父项目归属接线。

本条不把此前claim失败改签成功，不签Owner=user或新能力许可。ROOT独占控制面正常应用候选、前置校验及提交后才能正常claim原integration；仅治理记录变更无需重包，实际228安装包与后续控制HEAD身份区分。原18历史成功、missing/FAIL和当前安装验收仍按真实证据，不代签全局Gate、安装功能、模型、听审或用户验收。


## DEC-T1062-INSTALLED-CLI-RECEIPT-20261006：保留同一失败终态的公开回执

Owner=agent 的既有合同落实候选。当前为静态设计与精确准入候选，未应用、未 claim、未实现、未跑新测试；根会话复核并按正常控制提交和租约准入后才允许改产品。原批准 SPEC cfbaf9 不变，不消费 DEC-106201 或开启新规格周期。原 CLI FR-CLI-05、FR-CLI-06 与 API-CLI-002 已要求真实失败、原 requestId、失败不自动重试以及非零失败退出；T1062 的真实安装与逐功能验收覆盖本次装配修复。

真实安装记录显示：第一次业务拒绝 HTTP409，随后素材关联已完成，再查同一 key/input 的失败 invocation 却被 gateway 映为 HTTP200，CLI 丢失已有 receipt 后输出 ok:true/data:null，source 回读仍404。服务端原状态机不重执是正确的，保留全部旧失败原始证据。只准入三个生产文件和三个既有测试文件，共六条精确路径；gateway 将 failed receipt 映为非2xx，DispatchClient 与 CLI 只保留已有公开 receipt 的原 status、requestId、taskId/targetRefs 与既有布尔状态及 meta.requestId。失败不重执，running、未知结果、成功缓存和结果过期语义不改；不投影数据库 errorCode，不新增 DTO、SQL、operation、身份或权限机制。

原 integration592、installed-compatibility283、installed-contract-bootstrap45 路径与原验证命令逐项保持。六路径使用独立 installed-cli-receipt step，原 integration801 快照中两个 MCP 文件的旧记录保留为历史，不能签成新字节通过。预览/渲染问题不进入本候选。要求先取得真实公共调用链 RED，再执行最小修复与 GREEN、类型、旧安全/幂等回归和重新打包安装实测；本条不预签任何实际测试、安装或用户功能验收。


## DEC-T1062-INSTALLED-OVERLAY-CAPTURE-20261006：落实纯组剪辑叠层证明

Owner=agent 的既有行为实现选择；原SPEC cfbaf9、用户空组共享创作/本地安装验收授权与原592/283/45、801及Original18不变，不新开规格周期或用户typed capability。实际228包纯组手工save/get3成功，preview/render真实428未创建render任务；捕获仍requireAccountId是直接原因。新增独立3路径step（1生产、1既有测试、1说明），复用workspaceFilter与真实getEditor父授权，捕获/明细group取真实production并精确匹配，即便空明细亦不豁免。legacy仅保原无group+真实账号null/初始组边界，显式组没有null/账号兜底。可空版本metadata缺已验证值时保NULL，不能声称withWorkspaceWrite核验ctx epoch或据此授权。原v1摘要、exact文件、lineage、保存可选失败安全行为均保留。独立静态审查与实际RED/GREEN、公共调用、新包仍需分别记录；不改变旧数据库或平台账号操作。


## DEC-T1062-INSTALLED-RENDER-OWNER-20261006：按真实任务冻结归属执行合法渲染

用户既有整合、修复、提交、本地打包与当前App逐项验收授权继续有效。原SPEC cfbaf9字节不改。独立补充 `docs/features/t1062-installed-render-skill-owner.md` 的候选5648039c/独评262b7ccb静态GO；仅server-only sibling与确定性exec落实既有空组共享创作，没有新公开操作/DTO/角色/SQL、资料转归或新用户capability。实现与新包尚未通过。

同一次真实requireTask先授权后返回row owner/runtime；旧getTaskRuntimeData扁平值保持。Skill核真实owner/own stamp有效shape；执行、claim、物化和失败结算共用原归属，旧collection ctx/闭包成对保持。legacy缺stamp仅原服务范围兼容读取，初始组membershipVersion NULL原admission仍拒绝，普通/显式group不补版本或别名。公共跨filter回放只读原task，无重新dispatch入口保待验，不新入口/不删fingerprint，不阻断本次空组render修复。

独立step exact4、freshpacket/正常隔离writer claim、公共组合根实际RED后修复GREEN、原回归及独立实现审查后正常提交整合。root测试独立tmp workspaces/隔离DB，不触用户默认工作目录；原18/801/全局红/失败task111保留。新增ai.service现有daemon注释精确预算3d9a5e，独评f445d4e不授权未来机制；实现后仅ROOT据真实独评追加新hash。重新包安装成片按fresh真实计划/版本核验，历史7.5不作新成片预期。

## DEC-106901：切换页面保持剪辑宿主的两文件补充

用户在明确问题“是否同意新增一个评审周期，扩充 AppShell 及其回归测试两个文件”的紧邻回复为“继续”。本次记录仅落实该具体问答：一周期、两个精确路径，固定页面容器并通过真实视频切 Tab/保存/刷新验证；不授予未来通用继续权限，不改变产品方向、数据归属或原全部验收范围。

```text
ID: DEC-106901
Authorization-Kind: process-review-cycle
Task-ID: T-1069
Previous-Spec-SHA256: 75f01c51f9abb387f876b7cb7b785993e9d9f6dca6c99010443359bd766f6107
Previous-Constitution-SHA256: 86bc2c8add6a01ebf5b2ecf9de05d448770ca14a4e0bdbbf376fffc6387e3800
Allowed-Change-IDs: T1069-STABLE-SHELL-HOST
Max-Cycles: 1
Nonce: 376c98a7-c028-4c25-9488-0eeaf6abc17c
Owner: user
Status: active
```


## DEC-T1070-NATIVE-PIXEL-VERSION

用户已要求真实自然语言剪辑并逐功能验证；原warm首帧仍0，已通过一次有界原事件证明decoded1但identity-only GPU缓存仍0。采用真实decoded timestamp的内部texture版本透传，保同帧/静态缓存并覆盖blur，不改公共合同、owner、runtime、依赖或CAS。七archive精确成员独评78c934b5...准入（PIXEL_VERSION_INTEGRATION.md）。机制选择已闭合，真实修复/采纳/导出与安装不代签。原研究一次实验、两具体trace验收0；按用户AGENTS只用taskctl恢复原任务（受支持resume子命令），不让研究工具另写看板。


## DEC-106902：T-1074 精确9文件的一次补充独立复核

用户本轮明确回复：“同意这9个文件补一次独立复核”。沿用当前已审SPEC，补齐4项必要接入/保护措施；不新增用户功能、AI权限、发布授权或整个目录写集。本次授权只消费一次，原3轮及历史证据保留。精确范围见SPEC第8.1节。

```text
ID: DEC-106902
Authorization-Kind: process-review-cycle
Task-ID: T-1074
Previous-Spec-SHA256: a0ab7c395b59112819340eadf09a7b4aca142fed6733fb40621ff4bbd0f01b4b
Previous-Constitution-SHA256: 86bc2c8add6a01ebf5b2ecf9de05d448770ca14a4e0bdbbf376fffc6387e3800
Allowed-Change-IDs: T1074-CONSUMER-SCOPE,T1074-EDITOR-ADOPTION,T1074-CANDIDATE-LOCK,T1074-RADAR-PURE-READ
Max-Cycles: 1
Nonce: 0173eddf-4313-46d0-bda5-c0819d7ba8d1
Owner: user
Status: active
```

## DEC-AI-037 (2026-09-21) — 模型生成超时与不完整输出必须由原 Agent loop 恢复

**来源**：用户提供内容雷达与 AI 助手真机截图并明确确认：除当前账号没有可用模型配置时直接提示并引导配置外，模型超时、输出不完整和临时服务故障不得成为用户手动重试的阻断终态，应在 Agent loop 内解决。

**决定**：

1. 用户提交一次生成后，timeout、network、明确可重试 HTTP 拒绝和结构化输出不完整统一沿原任务、原幂等标识、调用账本与检查点恢复；页面只展示自动恢复进度。
2. 单次调用保留安全超时，但持续生成任务不设会把任务直接变成 `failed` 的总截止时间。退避必须持久化且单飞，页面关闭或应用重启后继续原任务。
3. 当前账号不存在任何可用文本模型时进入 `waiting_user`，保留输入并直达模型设置；配置恢复后继续原任务。
4. 用户取消、输入损坏、权限/归属错误及有副作用外部操作的未知结果继续遵守既有安全边界，不伪造成功、不盲目重复提交。
5. 内容雷达和 AI 助手是本轮真机验收入口；同一防复发门覆盖后续模型生成入口。

**状态**：confirmed（用户 2026-09-21 明确要求立即落实）。

```text
ID: DEC-AI-727
Date: 2026-08-08
Stage: T-727 BUILD
Type: contract-and-execution-shape
Decision: `script.draft` 保留现有异步任务与候选确认链，但增加 `verbatim` 模式。模型只从本轮
          受信用户消息/文本附件清单选择 `sourceRef` 与可选精确锚点；服务端恢复原字符、计算
          hash 并写入 task input，runner 直接产 artifact_version 候选，不装配创作上下文、
          不调用写稿模型。普通 generate 模式零行为变化。
Rationale: PAT-004 CF-001/CF-004 命中：工具→组合根→任务 runner 是跨包、需端到端可追溯的协议，
           因此先在工具 schema 和任务输入形状中明确模式/引用/hash，不能仅加提示词。PAT-003
           AF-003 命中：保真导入也需要刷新可恢复、执行审计和统一确认门，继续复用持久异步任务，
           不另造同步写稿旁路。MOD-002 已核对但不借入保真路径：它适合普通非工具 LLM 调用，
           本需求恰恰要在 `verbatim` 模式彻底绕开 LLM；既有 generate 路径继续复用现有 provider。
Pattern-Ref: PAT-003, PAT-004
Asset-Ref: MOD-002（已评估；仅保留既有 generate 使用，verbatim 明确不使用）
Affected Artifacts: T-727 SPEC、chat-runner/chat-tools、script-runner、persistence-client、原文候选卡与测试。
Explicit Limits: 代码不用关键词/相似度猜创作语义，语义分界只由配置模型完成；不直接写稿面；不覆盖历史版本；
                 来源不唯一或已截断时 fail-closed，不退回模型重写。
Owner: user+agent
Status: active
```

```text
ID: DEC-WEB-672
Date: 2026-08-03
Stage: T-672 PLAN
Type: user-confirmed-public-commercial-boundary
Decision: CreatorOS 官网撤下全部公开价格、代理利润与作者个人联系方式。官网不再提供直营购买
          入口；价格、购买、代理和联系问题统一引导访问者联系向其推荐 CreatorOS 的授权合作
          伙伴，以保护代理的客户线索与利润空间。
Rationale: 公开零售价、进货价、利润和作者联系方式会让终端客户绕开代理，削弱代理推广意愿与
           成交空间。官网应成为代理可安全转发的产品说明页，而不是官方直销页。
Source: 用户 2026-08-03 明确要求“官网的价格下掉吧，包括我的联系方式，保护代理的利润”。
Affected Artifacts: T-668/T-671 公开范围、website/index.html、官网 FAQ、二维码静态资源与部署读回。
Explicit Limits: 内部代理价盘、Growth 商品、Activity 激活和既有代理身份不因官网下架而自动
                 变更；官网仍可公开产品能力、设备支持、一机一码和更新日志。
Owner: user+agent
Status: active
```

```text
ID: DEC-AGENT-671
Date: 2026-08-02
Stage: T-671 PLAN
Type: user-confirmed-channel-pricing
Decision: 用户以 599 元首购 CreatorOS 内测版后自动成为代理，不需要提交申请，不设置人工审核、
          加盟费或其他附加门槛。成为代理后进货价为 399 元/个，对外指导价为 899 元/个，
          代理首年每单账面价差 500 元；代理合作口径不提续费、续费分成或续费抽成。成为代理
          后进入“内测代理股东群”，并取得 CreatorOS 体系后续智能体产品的合作资格；各新智能
          体的具体价盘和交付规则在产品发布时另定。
Rationale: 用户希望代理收益简单、可直接解释，只赚首次销售价差，同时以长期产品合作资格增强
           内测代理的参与感，不在当前招商中引入续费结算复杂度。
Source: 用户 2026-08-02 最终纠正确认“没有提交申请一说，不要人为制造门槛”；首购 599 元后
        自动成为代理，进货价 399、指导价 899、进入内测代理股东群、后续所有智能体都有合作
        资格，并要求不要提续费。
Affected Artifacts: T-671 代理合作 SPEC；后续官网、代理招商物料、Growth 渠道商品与协议。
Explicit Limits: 399 元只适用于完成 599 元首购、自动成为代理后的后续进货；不得另设申请、审核、
                 加盟费或其他未确认门槛。
                 “代理股东群”当前是合作社群称谓，不构成工商股权承诺；未确认代理层级、最低
                 进货量、退换、官方直营、价格约束与售后责任前，不进入实现或公开承诺。
Owner: user+agent
Status: active
```

```text
ID: DEC-PRICE-668
Date: 2026-08-02
Stage: T-668 BUILD
Type: user-confirmed-public-pricing
Decision: CreatorOS 官网公开口径改为：内测群用户在 2026-08-10 前可按 599 元一次买断参与共创；
          内测结束后正式版为 899 元/年、次年续费 199 元/年，且不再提供永久买断。
          通用设备规则置于价格之前：一机一码，每个激活码仅绑定 1 台设备；当前支持 Apple
          芯片 Mac 和 Windows；Intel Mac 只能显示“适配推进中”。页面不展示基础版、Plus、
          Pro 或其他版本分级。购买意向通过现有联系方式私聊，确认后进入单独内测共创群。
Rationale: 现官网 1499 元永久买断、永久免费更新和笼统 Mac 支持已经与用户确认的商业规则冲突，
           继续公开会造成错误购买预期；静态官网应直接表达当前唯一价格真相。
Source: 用户 2026-08-02 连续确认价格海报、微信群通知及官网同步要求。
Affected Artifacts: website/index.html、T-668 SPEC、官网静态校验与部署读回。
Explicit Limits: 不修改支付、Growth 商品、Activity 激活、续费执行或换机契约；不承诺 Intel Mac
                 日期、免费更新、退款或多设备权益。
Owner: user+agent
Status: active
```

```text
ID: DEC-RADAR-642
Date: 2026-08-01
Stage: T-642 BUILD
Type: user-confirmed-creative-handoff
Decision: 仅内容雷达转出的选题携带“左侧对标逐字稿 + 右侧本账号改写初稿”；直接新建、
          常规 AI、评论/需求等正常选题链保持单稿流程。雷达改写初稿随 Candidate 和 Project
          作为 adaptedDraftSeed 传递，Project 首开直接显示；用户首次保存才物化为正式
          output_script 版本，之后共用既有编辑器、版本链和 script.draft，不创建第二套稿件状态机。
Rationale: 用户需要从雷达、选题到作品持续看到同一份对标与改写稿，但普通创作没有真实来源稿，
           强行套双栏会伪造依据并破坏原流程。seed 方案同时避免 promotion 跨模块创建 artifact
           产生半成功，销账复审 REV-002 的数据完整性风险。
Source: 用户 2026-08-01 明确提出左右对照并追问“直接创建选题也这样做吗？不是吧”。
Affected Artifacts: T-642 SPEC、雷达 transform/candidate/project brief 契约、选题详情、Project 稿面。
Explicit Limits: 普通选题不生成改写稿；左稿只读且不复制为正式稿；未采纳/未立项不写 Project；
                 首次保存失败保留 seed 并允许幂等重试。
Owner: user+agent
Status: active
```

```text
ID: DEC-ONB-637
Date: 2026-07-31
Stage: T-637 BUILD
Type: user-confirmed-information-architecture
Decision: 新手引导不再暴露文本模型配置和自动化任务。主线统一为绑定账号→确认账号情况→
          （已有作品账号）等待并查看历史项目→确定定位→监控对标→从对标创建选题→进入项目；
          新号跳过历史项目。设置页“重新打开”必须强制展示完整引导，即使全部步骤已完成。
Rationale: 自动化是后台基础设施，不是用户目标；用户需要围绕作品、定位、对标、选题和项目
           建立第一次成功体验。旧重新打开只清 hidden、又被 complete 自动隐藏，属于假按钮。
Source: 用户 2026-07-31 明确确认的引导顺序与“自动化用户完全不需要感知”。
Affected Artifacts: onboarding SPEC/状态机/数据装配/首页卡片、设置页重新打开入口与测试。
Explicit Limits: 不新增第二套自动化或后端持久化；不把 imported 历史项目算作用户新建项目；
                 历史项目确认按当前账号本地隔离。
Owner: user+agent
Status: active
```

```text
ID: DEC-POS-623
Date: 2026-07-29
Stage: T-623 PLAN / CONTRACT
Type: user-confirmed-product-semantics
Decision: 定位中心右上角统一为“新建定位母版”。确认后清空当前账号 profile 的画像、
          facets 与 downstreamRules，并以 statement_version_floor 建立新的当前母版边界；
          positioning_statements 继续不可变保留，边界之前的历史不再成为 currentStatement。
          随后只打开既有定位 AI 对话并预填从头访谈，不自动发送、不由 AI 直接写库。
          复盘页“帮我复盘”不再打开全局 Copilot，而是预填既有项目编导右栏，用户发送后
          复用 review.analyze。定位编辑点击外部不得关闭。
Rationale: 现有重新定位只清前端表单，旧规则仍会进入 AI 上下文；物理删除定位陈述又破坏
           不可变审计。复盘页已有右栏却再弹全局面板，造成双入口和会话混淆。
Source: 用户 2026-07-29 截图与明确指令。
Affected Artifacts: positioning contract/service/repository/schema、定位中心交互、项目阶段
                    DraftChatRequestProvider、复盘入口、相关测试与追溯。
Explicit Limits: 不删除历史定位陈述；不新增第二套 Copilot 或 review 工具；不自动发送
                 预填话术；AI 候选仍须用户采纳后通过 backend service 落库。
Owner: user+agent
Status: active
```

```text
ID: DEC-POS-632
Date: 2026-07-31
Stage: T-632 BUILD remediation
Type: user-confirmed-data-semantics-correction
Decision: “定位版本”必须可恢复完整母版，不再把只有一句话/关键词/产品锚的
          positioning_statements 冒充完整历史。新增只写一次的 masterSnapshot；重置前保存当前
          画像、facets、五类规则与陈述；恢复通过 backend 事务回写 profile 并追加新陈述版本，
          不修改旧历史。旧版确实没有快照的记录只提供“复制定位陈述”并明确缺失边界。
Rationale: 当前 reset 会物理清空唯一可变 creator_profiles，而历史行没有画像/规则，导致用户
           点击旧版本后表单仍为空，属于写真读空和潜在数据丢失。用户明确要求旧版本可恢复。
Pattern-Ref: PAT-002（RF-001 跨 profile/statement 原子恢复；RF-002 用户定位需重启留存；
             RF-004 正规 migration）。
Affected Artifacts: positioning resource/operation、0065 migration、positioning repository/service/
                    transport、定位中心历史交互、T-632 SPEC/Gate/测试。
Explicit Limits: 不覆盖或删除历史陈述；不伪造旧版缺失的画像/规则；不新增第二套定位模块；
                 AI 仍不直接写库。
Owner: user+agent
Status: active
```

```text
ID: DEC-LEARNING-001
Date: 2026-07-29
Stage: T-610 BUILD
Type: user-confirmed-product-semantics
Decision: 对话/复盘里由用户点击“采纳”或“存为经验”的内容，按当前用户与账号内的
          title+insight 稳定指纹去重，并直接成为 validated Learning，由知识库现有
          validated 投影立即展示；不再进入第二次裁决队列。AI 未经用户确认产生的候选
          仍保持 candidate。内容雷达保留跨轮次来源快照用于审计，但详情只按唯一 source
          展示，并回显最近采集时间与累计次数。
Rationale: 旧实现把已经经过用户确认的采纳再次降成 candidate，造成“已沉淀”但知识库
           不可见；刷新后还可重复插入。雷达详情把一个来源的三次历史快照误画成三条来源，
           与作品卡“1 个来源”的真实口径矛盾。
Source: 用户 2026-07-29 明确要求“经验需要去重，然后直接进知识库即可”，并要求核对采集
        是否去重。
Affected Artifacts: learnings.create 既有 operation 语义、Learnings service/repository、
                    learning migration、知识库 validated 投影、内容雷达详情来源证据。
Explicit Limits: 不新建第二套知识库表；不物理删除历史重复经验或跨轮次来源快照；不同账号
                 不互相去重；不同 source 发现同一作品时仍分别展示。
Owner: user+agent
Status: active
```

```text
ID: DEC-MODEL-619
Date: 2026-07-29
Stage: T-619 REMEDIATION / CONTRACT
Type: user-confirmed-authority-correction
Decision: Activity 的 config.pull ticket/introspection 只证明 projectKey/channelRef 与授权事实，
          不再提供权威 clientId。Creator 请求 Activity 时不得把自报 clientId 当授权依据；
          旧 ticket 响应若仍带 clientId 只兼容忽略。Creator 仅向 Growth 声明接受的
          extension/protocol，由 Growth registry 解析并签入最终 clientId；Creator 验签
          bundle 时继续强校验 Growth 签入的 creatoros.desktop 和协议。
Rationale: 应用/客户端目录唯一归 Growth，Activity 不拥有客户端目录，不能反向授权 clientId。
Affected Artifacts: T-606 Creator contract、creator-client-config-consumer-v1、Creator
                    config.pull request/parser/tests、T-619 validation、CHANGE_IMPACT。
Compatibility: 在 Growth/Activity 最终字段契约落定前，Creator parser 兼容旧响应字段但不信任；
               该兼容不允许恢复 request clientId，也不允许跨 locator 比较版本或 ETag。
Status: active（整改代码已验证；正式三端联调与独立复审前 release NO-GO）
```

```text
ID: DEC-MODEL-606
Date: 2026-07-29
Stage: T-606 PLAN / CONTRACT
Type: user-confirmed-authority-correction
Decision: CreatorOS 继续使用既有 config.pull ticket 和当前激活 locator。verified configured
          渠道 JSON 是当前模型配置权威，即使 Key/URL/model/provider 错误或模型调用失败也
          不回退本地；明确未配置、不可达且本次未取得 JSON、或安全校验失败时才使用本地。
          用户本地配置始终允许编辑并作为 inactive 备用。
Rationale: Growth T-086 最终契约与 2026-07-29 用户确认明确取代旧 T-575/T-604 设计。
Supersedes: T-575 的三键 parser/长期 Key 禁止/24h 远端 LKG；T-604 的 Gateway、短 bearer、
            introspection、alias routing、managed_locked 与远端 LKG 优先。
Invariant: Activity 只证明 projectKey/channelRef 授权；Growth-signed clientId 与其二者共同
           组成配置版本 locator。渠道 JSON/Key 不进入 URL、日志、错误、审计摘要或 Web 响应。
Authority: Growth docs/contracts/T-086-creatoros-managed-model-service.md
           SHA-256 be1d4546b080e8b30144e31dd20d2e094d82b66d3c57d0f6116782fb89650182；
           T-086-review-concern-resolution.md
           SHA-256 68bd438f9893a7c4508cff396274e893cb630d7ad488109e6b91430f18cdbc0f。
Status: active（独立评审通过前不得 BUILD）
```

```text
ID: DEC-PKG565-002
Date: 2026-07-27
Stage: T-565 PLAN / RAT
Type: user-confirmed-external-execution
Decision: 授权 agent 创建、推送并操作 T-565 的原生 Windows RAT 工作流；GitHub Actions
          费用不设上限，由 agent 根据验证需要持续运行和修复，直到 Product Gate 所需的
          Burn payload/cache/代理/中断、Win32 current/journal kill recovery 与 reparse
          containment 证据形成。
Rationale: T-565 重写 SPEC 的 cross-family Round 1 唯一未闭环 blocker 是原生 Windows
           可行性证据；本机没有 Windows/Wine/VM，私有仓 GitHub-hosted Windows runner
           是当前可执行的真实 Win32/NTFS 环境。用户明确回复“授权运行windows rat
           没有费用上限 你来操作”。
Pattern-Ref: PAT-001
Pattern Tier: T1（WiX Burn 直接采用 + CreatorOS 窄事务 worker；命中 BG-003 官方方案、
              BG-005 覆盖 acquisition/trust，worker 只补产品事务缺口）
Affected Artifacts: T-565 SPEC/review、Windows RAT workflow、RAT evidence、BACKLOG。
Explicit Limits: 仅授权验证和为验证所需的 branch/workflow push；不创建或发布 GitHub
                 Release，不对用户分发安装包，不将 RAT spike 冒充生产实现。
Supersedes: DEC-PKG565-001 的“不得触发付费 Windows runner”限制；其他限制继续有效。
Owner: user+agent
Status: active
```

```text
ID: DEC-PKG565-001
Date: 2026-07-27
Stage: T-565 PLAN
Type: user-confirmed-architecture-direction
Decision: 重选 CreatorOS Windows Runtime 交付架构。默认发布小型 Web Installer，同时保留
          完整 Offline Installer；两者使用同一签名分层 Runtime Image 与安装事务。setup
          必须完成全部必需 runtime 的下载/读取、校验、物化和 smoke；正式应用首启完整
          runtime 解压次数恒为 0。必须实质减少 node_modules/JS 散文件，不能只把原 tar
          改成联网下载。Windows 正式安装树不得保留通用 node_modules/源码项目结构；纯
          JS/JSON 优先 bundle，只有 Chromium、媒体工具、WASM、native addon、migrations
          等有真实路径要求的资产可进入签名 allowlist。安装失败不得显示成功或转移给首启修复。
Rationale: Windows 0.2.0 真机在安装后白屏约 30 分钟，已确认是在处理大量小文件。现有
           NSIS POSTINSTALL 失败后保留 tar、首启 AppData 兼容解压的 fail-forward 破坏
           “安装完成即可使用”与诚实失败边界；当前 runtime 26,381 个文件中 24,756 个来自
           node_modules，在线下载本身不能消除 NTFS/Defender 小文件成本。RAT-565-01 已证明
           高置信 prune 可把普通文件减至 16,381（-37.91%）且真实能力 smoke 通过，但距离
           ≤5,000 仍必须进行 production closure bundle；`pnpm deploy`/Next standalone/压缩
           容器都不能单独成为最终解法。
Architecture Refinement: 实际 Tauri 壳与四层 runtime 组成不可变、版本化 compatibility set；
                         固定 shortcut 只启动稳定 launcher，installer 在 pending set 真 smoke
                         后以单一 `current` 指针同时切换壳与 runtime。0.2.0 首迁移不信任旧 tar
                         为新 layer，必须全量取得新签名 layers，并在提交前保留 legacy fallback。
                         默认 Web 发布阈值：首装 ≤500 MiB、core-only 更新 ≤100 MiB、每成功
                         安装 CDN 成本 ≤US$0.10；超限阻断或另开 DEC。
Source: 用户 2026-07-27 明确要求“必须得 setup 阶段完成小文件的解压缩，并且必须合理的减少
        小文件”；在收到“默认 Web Installer + 保留 Offline Installer”的推荐与确认请求后
        回复“启动”。
Affected Artifacts: T-565、Windows runtime packaging、installer、updater、release workflow、
                    desktop startup resolver；替代 T-487 的 Windows 交付条款。
Invalidates: T-487/T-493 中“NSIS hook 失败后首启兼容解压可作为发布兜底”以及 T-487 已完成的
             Windows 零解压验收结论；macOS 交付条款不受影响。
Explicit Limits: 不触发付费 Windows runner、不发布安装包、不改变领域数据存储、不把必需
                 runtime 改成应用首启/功能首次使用时按需下载。
Owner: user+agent
Revisit Trigger: Windows 原生 RAT 证明 WiX Burn/少文件方案不可行，或用户改变在线/离线分发取舍。
Status: active
```

```text
ID: DEC-MC-002
Date: 2026-07-26
Stage: T-501 4-build
Type: user-confirmed-scope-reduction
Decision: T-501 只做现有模型设置页的轻量优化：减少普通用户配置项；“保存并测试”复用正式
          modelFor + streamText 并验证非空文本；补官方预设、New API/中转站、Responses、
          Kimi 开放平台与 Kimi Code 教程。
Rationale: 用户明确指出模型配置需求没有原方案复杂。当前 Settings、T-471 Responses 和
           settings.models.put/test 已经存在，继续建设八槽总览、向导、能力平台和付费探测
           会扩大范围、增加配置负担并偏离真实问题。
Source: 用户会话“优化一下就行了……减轻用户配置负担，优化配置测试通路，补充教程文档即可”，
        2026-07-26。
Affected Artifacts: T-501 BACKLOG/任务详情、替代范围、应用内手册、模型预设、连接测试组合层。
Invalidates: 旧 T-501 PRODUCT SPEC/CONTRACT/PAGE SPEC 中的八槽总览、配置向导、能力平台、
             费用与付费 effect 均不进入 BUILD；旧文档只作为历史审计材料。
Explicit Limits: 不新增页面/公开 operation/数据模型；不依赖 T-517；不触发图片或视频付费调用；
                 轻量测试只承诺基础流式文本，不冒充复杂工具调用全兼容认证。
Owner: user+agent
Revisit Trigger: 用户明确要求新增模型管理页面、能力平台、计费或付费 provider 验证。
Status: active
```

```text
ID: DEC-001
Date: 2026-06-20
Stage: 00-intake (orchestrator initialization)
Type: default-assumption
Decision: Initialize product-to-code-orchestrator as a MID-PROJECT TAKEOVER rather than from scratch.
         Existing markdown specs and the implemented frontend are mapped onto stages in
         ARTIFACT_MANIFEST.yaml instead of being regenerated.
Rationale: The repo already contains product docs, frontend/backend specs, a fully implemented
          frontend (127 files, passing lint/typecheck/tests), and 17 imported UI screens.
          Re-running stages 00-11 from zero would discard working artifacts.
Source: Repo scan on 2026-06-20 (docs/, frontend/, backend/, ui/, branch feat/frontend-implementation).
Affected Artifacts: orchestrator/ARTIFACT_MANIFEST.yaml and all stage rows.
Invalidates: none.
Owner: agent
Revisit Trigger: If the user wants a clean-room re-derivation with full traceability.
Status: active
```

```text
ID: DEC-002
Date: 2026-06-20
Stage: 00-14 (all pre-existing stages)
Type: default-assumption
Decision: Mark all pre-existing artifacts as `draft` (not `passed`), because none were produced under
         this orchestrator and none carry stable IDs or have had their stage gate run.
Rationale: State-machine rule: a stage may move to `passed` only when its gate has been run and
          confirmations recorded. That has not happened yet for any stage.
Source: rules/orchestrator-state-machine.md, transition rule 1.
Affected Artifacts: stages 00-14 in ARTIFACT_MANIFEST.yaml.
Invalidates: none.
Owner: agent
Revisit Trigger: Ratification pass — run each stage gate to promote draft -> passed.
Status: active
```

```text
ID: DEC-003
Date: 2026-06-20
Stage: 11-frontend-implementation
Type: tradeoff
Decision: Treat frontend implementation as verified-green on static checks (eslint 0, tsc 0, vitest
         all-green) but NOT release-verified, because `next build` and the full vitest/visual suite
         could not complete inside the sandbox (45s command limit; npm registry blocked).
Rationale: Static analysis passed cleanly; build/visual confirmation must run on the host.
Source: Sandbox verification run 2026-06-20.
Affected Artifacts: stage 11 + OPEN-002.
Invalidates: none.
Owner: user
Revisit Trigger: Host run of `pnpm verify`.
Status: active
```

```text
ID: DEC-004
Date: 2026-06-20
Stage: 00-14 (ratification pass, option A)
Type: scope-change
Decision: Ran the ratification pass. Extracted and assigned stable IDs from existing docs
         (68 FR, 24 NFR, 22 FLOW, 58 ENT, 9 IA, 18 PAGE, 42 COMP) into ID_REGISTRY.md and built
         TRACEABILITY_MATRIX.md. Ran each stage gate 00-14. Documentation stages pass on completeness;
         those requiring confirmation are set to `needs-user-confirmation` pending one batch sign-off.
Rationale: User chose option A to firm up the foundation with traceability before backend work.
Source: Repo docs + subagent ID extraction, 2026-06-20.
Affected Artifacts: ID_REGISTRY.md, TRACEABILITY_MATRIX.md, ARTIFACT_MANIFEST.yaml (stages 00-14).
Invalidates: none.
Owner: agent
Revisit Trigger: User confirms the extracted IDs/specs -> promote stages to `passed`.
Status: active
```

```text
ID: DEC-005
Date: 2026-06-20
Stage: consistency-gates (cross-artifact)
Type: accepted-risk
Decision: Cross-artifact consistency gate returns FAIL on the upstream->downstream orphan scan: every
         backend-bearing FR currently lacks an API operation and a backend test, because the service
         contract (stage 15) and backend implementation (stage 16) do not exist yet.
Rationale: Expected for a frontend-first project mid-build; not a defect, but it blocks any claim of
          end-to-end completeness. Recorded so it is not mistaken for done.
Source: TRACEABILITY_MATRIX.md > Orphan Scan; consistency-gates.md.
Affected Artifacts: TRACEABILITY_MATRIX.md (GAP-002, GAP-003), manifest consistency_gate.status.
Invalidates: blocks stage 17 (integration-release) until chains close.
Owner: user+agent
Revisit Trigger: After service contract (15) + backend TDD (16) close the broken chains.
Status: active
```

```text
ID: DEC-006
Date: 2026-06-20
Stage: 11-frontend-implementation (remediation)
Type: user-confirmation
Decision: FULL ALIGNMENT — the existing specs are authoritative; the implementation will be changed to
         match them. All P0 decision points resolve in favor of the spec:
         (R0-1) migrate UI primitives from @base-ui/react back to shadcn/ui on Radix (locked baseline);
         (R0-4) add all 13 missing domain entities to types + fixtures;
         (R0-6) align field/enum types to the data model (Learning.confidenceScore int; relationType free string);
         (R2-7) create the mandated directory structure (public/fixtures/, features/<page>/{components,tests}).
         Execute the full P0+P1+P2 backlog in REMEDIATION_BACKLOG.md.
Rationale: User chose "需要全量对齐" (full spec conformance) over amending specs to accept current code.
Source: User instruction 2026-06-20.
Affected Artifacts: entire frontend; REMEDIATION_BACKLOG.md; manifest stages 06-12.
Invalidates: current frontend visual baselines (must re-baseline after fixes, R2-9).
Owner: user
Revisit Trigger: If scope/effort (≈5-8 wks) forces a phased cut.
Status: active
```

```text
ID: DEC-007
Date: 2026-06-21
Stage: 11-frontend-implementation (remediation execution, host)
Type: scope-change / gate-result
Decision: Executed the DEC-006 remediation backlog on the host and re-ran the stage-09
         frontend-implementation gate. Result: PASS (with one documented residual). Stage 11 promoted
         draft/fail -> passed/pass; implementation_gate fail -> pass.
Work done:
  - INC-3 (host-only): migrated all 18 ui/* primitives @base-ui/react -> shadcn/ui on Radix
    (radix-ui 1.6.0); removed @base-ui/react; components.json new-york. 0 @base-ui imports remain.
  - INC-5 milestones A-D: de-dup ProjectStageStepper; extract analytics layer
    (AudienceBreakdown/RetentionChart/HorizontalBarsChart/InsightCard), resource layer
    (AssetCard/MediaPreview/AssetDetailPanel), SearchField; move Pagination/ViewModeToggle/SortSelect to
    components/navigation; rename to spec (PlatformIcon/InsightCard/RetentionChart/AudienceBreakdown);
    public/fixtures/ + canonical.json generator; pin Node 24 LTS. Shared components ~10 -> 20.
  - INC-1/INC-2/INC-4 (prior sandbox work) re-verified GREEN under full host build.
Verification: `cd frontend && pnpm verify` GREEN — ESLint 0, tsc 0, 398 tests (38 files), next build OK.
Residual (non-blocking, recorded in STAGE-09-GATE-RERUN.md): RISK-007 tail — single-use content
  components (ArtifactListItem/KnowledgeListItem/EvidenceCard/FileThumbnail/VersionCard) left inline per
  SPEC §8; FilterBar + per-page search unification (R2-3); ui/* sweep (R2-6); test-dir relocation (R2-7);
  stage-12 visual re-validation (R2-9, design-locked references).
Rationale: User chose full INC-5 scope; highest-value/lowest-risk component work executed in committed,
          individually-verified milestones. Visual re-validation is stage-12 and excluded from `pnpm verify`.
Source: Host execution 2026-06-21 on branch remediation/frontend-spec-alignment.
Affected Artifacts: ARTIFACT_MANIFEST.yaml (stages 11/12, increments, implementation_gate),
          STAGE-09-GATE-RERUN.md, entire frontend ui/components layers.
Invalidates: CODE_RECONCILIATION.md FAIL verdict (superseded by STAGE-09-GATE-RERUN.md PASS).
Owner: agent (DEC-006 user-authorized)
Revisit Trigger: Stage-12 visual validation; or if the user wants the R2 tail completed.
Status: active
```

```text
ID: DEC-008
Date: 2026-06-21
Stage: 15-service-contract (15a)
Type: scope-change / build
Decision: Advanced the pipeline (user chose "build the backend") by executing stage 15a — the
         FE↔BE service contract — as the foundation that unblocks all parallel module verticals.
Approach: Zod-first shared package `@creatoros/contract` (approach C), pure TS, transport-agnostic.
Work done (TDD, on branch feat/service-contract off remediation/frontend-spec-alignment):
  - Framework: envelope (SPEC §14) + primitives + defineEndpoint registry + typed client + Transport iface.
  - 15 modules (projects exemplar + 13 fanned out via a 14-agent workflow) of resource DTOs + operations,
    translated field-by-field from types/domain.ts; 4 page composition DTOs.
  - registry.test asserts the surface == SPEC §13 exactly (76 routes, each once, unique ids) — caught +
    fixed an ai/projects key collision and a GET /search duplicate (page layer owns it).
  - traceability.test: every endpoint traced; each GAP-002 named backend-bearing FR covered.
Verification: contract gate typecheck 0, 20 files / 60 tests green; frontend untouched (398 tests pass).
Result: stage 15 -> draft/gate-pass (15a); frontier -> 16-backend-tdd. Closes the CONTRACT half of GAP-002.
Not done (separate specs/plans): 15b (FE MockTransport + read migration + mutation wiring — makes the
  buttons real), stage 16 (backend TDD against these schemas), stage 17 (MockTransport->HttpTransport swap).
Source: User instruction 2026-06-21 ("选择2" — build the backend).
Affected Artifacts: contract/ package; ARTIFACT_MANIFEST stage 15/frontier; TRACEABILITY_MATRIX GAP-002.
Owner: agent (user-directed)
Revisit Trigger: Start 15b or stage-16; or reconcile fine-grained per-operation FR ids.
Status: active
```

```text
ID: DEC-009
Date: 2026-06-21
Stage: 15b (FE mock-backend) + AI-orchestration design/foundation + contract seam fix
Type: scope-change / build / gate-result
Decision: Under the /goal "启动workflow开发前后端程序 以及联调" directive, advanced the pipeline in
         workflow mode (sequential TDD pipelines, one agent per plan task, verify+commit, halt-on-fail).
Work done (branch feat/service-contract, worktree frontend-implementation):
  - AI EXECUTION LAYER (new): designed + built. Spec 2026-06-21-ai-orchestration-agent-sdk-design.md
    (unified Claude Agent SDK substrate; AITask=query() on a worker; in-process creatoros MCP tools;
    submit_candidate is the SOLE write boundary; confirmResult is AI-free; awaiting_confirmation added
    to AITaskStatus). Plan 2026-06-21-ai-orchestration-foundation.md executed Tasks 1-10 (Wave 1):
    new @creatoros/ai-worker package (state machine, candidate schemas, ports, context tools,
    config resolver, fake runner, orchestrator, confirm) — SDK-free, 27 tests green. Task 11 (real
    SDK query() runner + script-rewrite Skill + manual smoke) deferred (needs binary + API key).
  - 15b (Wave 2): executed plan Tasks 1-8 — MockBackend store (deterministic clone + seeded ids),
    MockTransport + lib/contract-client (composition root), Dashboard read seam + loop, Projects
    read+write handlers (§12), Projects page async reads, and the Projects buttons wired
    (createProject/transitionProjectStage/patch/archive + refresh). viewModel? seam + isActiveRoute
    gate preserved; no assertions weakened.
  - CONTRACT SEAM FIX: @creatoros/contract switched NodeNext .js specifiers -> bundler resolution
    (module:esnext/moduleResolution:bundler, extensionless across 36 files). NodeNext .js barrels were
    unresolvable by Next 16/Turbopack (dropped ENDPOINTS/createClient at build); the whole consuming
    stack is bundlers (FE Turbopack, stage-16 BE = Next.js, vitest). Supersedes DEC-008's
    "exports ./src/index.ts" packaging note (still source-direct; just bundler-resolved).
  - AITaskStatus: added awaiting_confirmation in contract primitives + frontend domain.ts.
Verification: frontend `pnpm verify` GREEN (lint 0, tsc 0, 420 tests + 1 todo, Turbopack build OK,
  all 18 routes); contract typecheck 0 / 61 tests; ai-worker typecheck 0 / 27 tests.
Result: FE now consumes the contract via MockTransport with real Projects mutations; the FE↔BE seam
  builds clean. Closes the FE half of GAP-002 for the Projects vertical. Frontier -> 16-backend-tdd.
Not done: 15b Task 9 manifest promote (this entry stands in); other FE verticals (reuse 15b foundation);
  AI worker Task 11; stage 16 backend; stage 17 MockTransport->HttpTransport 联调.
Source: /goal workflow execution 2026-06-21 (Waves 1-2).
Affected Artifacts: ai-worker/ (new), frontend/ (mock-backend + projects), contract/ (seam + status),
  docs/superpowers/{specs,plans}/2026-06-21-*; ARTIFACT_MANIFEST stage 15b/AI/frontier.
Owner: agent (user-directed)
Revisit Trigger: Start stage-16 backend TDD; or wire AI worker Task 11.
Status: active
```

```text
ID: DEC-010
Date: 2026-06-21
Stage: 17-integration (FE↔BE 联调 seam, thin slice over the 15b mock store)
Type: scope-change / build / gate-result
Decision: Brought the FE↔BE integration (联调) forward over the 15b mock store, ahead of full
         persistence, because a runtime gap demanded it: 15b client islands imported the
         MockTransport-bound client, which in the browser mutates a browser-LOCAL store the server
         never sees (and bundles the mock backend into the client). So island buttons did not truly
         persist across router.refresh(). The fix IS the integration.
Work done (branch feat/service-contract):
  - HttpTransport (lib/http-transport.ts): client-safe; POSTs {id,input} to /api/v1/dispatch.
  - Composition split: lib/contract-client.ts -> HttpTransport (browser islands; no server imports
    -> mock backend stays out of the client bundle); lib/contract-client.server.ts (server-only
    guard) re-exports an in-process MockTransport client (server pages/route);
    server/mock-backend/in-process-client.ts is the guard-free variant for in-process tests.
  - Route app/api/v1/dispatch/route.ts: RPC dispatch by endpoint id -> mockTransport over the SERVER
    store -> contract envelope. STAGE-16 SWAP POINT: replace the transport behind this route with a
    persistence-backed one; HttpTransport + contract + pages are unchanged.
  - Tests: route.test proves the create->persist->list round-trip; http-transport.test the fetch
    shape; vitest stubs server-only/client-only (guards stay live in the Turbopack build).
Verification: frontend `pnpm verify` GREEN (lint 0, tsc 0, 426 tests +1 todo, Turbopack build OK, 18
  routes); client-bundle audit: getStore/handlers NOT in client chunks (only a pre-existing
  shell-router->canonicalDataset import remains, out of scope).
Result: real HTTP FE↔BE round-trip over the contract for the Projects vertical; island mutations now
  persist server-side. The "swap a line at stage 17" promise is realized as "swap the transport behind
  one route." Frontier -> 16-backend-tdd (real persistence behind the dispatch route).
Not done: stage-16 real persistence (Drizzle/Postgres; the TDD-PLAN uses Testcontainers — a
  Docker-vs-pglite test-infra decision is pending before that wave); other FE verticals (reuse this
  seam + 15b foundation); AI worker Task 11.
Source: /goal workflow execution 2026-06-21 (Wave 3, done inline for RSC-boundary safety).
Affected Artifacts: frontend/ (lib/*, app/api/v1, mock-backend, pages, vitest.config, server-only dep).
Owner: agent (user-directed)
Revisit Trigger: Stage-16 persistence behind /api/v1/dispatch; or fan out the remaining verticals.
Status: active
```

```text
ID: DEC-011
Date: 2026-06-21
Stage: 16-backend-tdd (Projects persistence slice) + 17 live cutover
Type: scope-change / build / gate-result
Decision: Executed a real-persistence slice and cut the live app over to it, so the FE↔BE 联调 round
         -trip is durable SQL, not the in-memory mock (closing the gap the Stop-hook flagged).
Infra decision: pglite (pure-WASM Postgres) instead of the TDD-PLAN's Testcontainers — runs in vitest
         AND the Next server with no Docker; Drizzle schema/queries identical to a real Postgres.
Work done (branch feat/service-contract):
  - NEW @creatoros/backend package: Drizzle schema (projects, project_activities) + pglite db factory
    (in-memory for tests / dataDir-capable) + ProjectRepository (list/get/create/patch/archive/
    stage.transition/activity, replicating the mock §12 semantics, injected clock+id for determinism)
    + createPersistenceTransport (contract Transport; UnsupportedOperationError -> caller falls back).
    typecheck 0, 8 pglite-backed tests.
  - LIVE CUTOVER: frontend compositeTransport (server/persistence-client.ts) = persistence for the 7
    project-entity ops + mock for the rest, used by BOTH server pages (contract-client.server) and the
    /api/v1/dispatch route -> server reads and island writes share ONE pglite store -> a created
    project persists in SQL and survives router.refresh(). An ownership set keeps pglite out of the
    static build; next.config serverExternalPackages externalizes the WASM. Deterministic seed
    (canonical) + clock/ids keep test/visual parity.
Verification: frontend `pnpm verify` GREEN (lint 0, tsc 0, 427 tests +1 todo, Next build OK WITH pglite,
  /api/v1/dispatch route live); backend typecheck 0 / 8 tests; route.test proves create->persist(SQL)->
  list + mock fallback.
Result: a COMPLETE vertical slice through the whole stack now exists and is proven —
  contract -> FE (HttpTransport) -> /api/v1/dispatch -> compositeTransport -> pglite SQL -> envelope ->
  render, durable. The "swap the transport behind one route" promise is realized with real persistence.
Not done (now pure fan-out of a proven path): the other 6 project ops' outputs/tasks persistence + the
  other module verticals (Knowledge/Assets/Artifacts/Publishing/Analytics/Reviews/Learnings/AI/
  Notifications) — each = a Drizzle schema + repository + add ids to PERSISTED_OPS, reusing this slice;
  dataDir for cross-restart durability; AI worker Task 11 (real SDK runner); extract /api/v1 into a REST
  surface if a standalone backend service is wanted.
Source: /goal workflow execution 2026-06-21 (Wave 4, inline for DB+RSC-boundary safety).
Affected Artifacts: backend/ (new pkg), frontend/ (persistence-client, contract-client.server, route,
  next.config), pnpm-lock; ARTIFACT_MANIFEST stage 16/17/frontier.
Owner: agent (user-directed)
Revisit Trigger: Fan out remaining verticals/ops; add dataDir durability; AI worker Task 11.
Status: active
```

```text
ID: DEC-012
Date: 2026-06-21
Stage: program scope (七步整合设计 adoption)
Type: scope-change / user-confirmation
Decision: ADOPT docs/CreatorOS-七步整合设计.md (Seven-Step Integration Design) into the program.
         It extends (does NOT refactor) the 6-stage trunk: adds a positioning gate, a monetization
         loop, a Candidate/AudienceSignal topic-intel layer, a Prediction/Rubric calibration loop, and
         cross-cutting PlatformAccount/ContentCalendar/StageTemplate/AI-relay. Its hard constraints
         C-2/C-3/C-4 ARE our proven patterns (DEC-011 persistence path / DEC-009 AI candidate-confirm /
         Ingestion idempotency), so the new modules slot into the same foundation/module-template/
         contract-op/pglite fan-out with zero architectural conflict.
User decisions (2026-06-21):
  1. Adopt, phased per spec §8.
  2. The "monetization-weighted" directional change (§2.0/§4.4/§6.2) is BAKED INTO the base-module
     plans BEFORE Wave 2/3 launch (no retrofit): ContentOutput.content_role (traffic/trust/conversion);
     MetricValue.metric_key extension (profile_visit/lead/inquiry/conversion/revenue…);
     AudienceSnapshot.dimension_type += intent/paying; Learning.learning_type += conversion types;
     Dashboard/Publishing surface conversion/lead as first-class metric columns. Touches the Projects/
     Analytics/Reviews/Learnings/Publishing/Dashboard module plans (+ a small contract v0.3 for
     content_role on contentOutputResource & any enum/key additions that cross the wire).
  3. The 6 NEW modules (positioning, monetization, candidate+audience-signal, calibration,
     platform-account, content-calendar) are appended as Waves 5-7 AFTER the base 16 (Waves 1-4),
     in spec §8 priority order (P0: monetization+candidate+calibration → P1: positioning+
     platform-account+content-calendar → P2: stage-templating+AI-relay+eng-debt). Each gets a
     modules/<n>-<module>.md plan via the same generation+fan-out; needs a contract v0.3 op/DTO pass.
  4. ID governance: PRAGMATIC continuation (append new FR/ENT/etc. as new segments) — NOT the spec's
     formal C-1 freeze ceremony, consistent with how this build has proceeded.
Execution timing: edits to base-module plans (#2) happen AFTER the running Wave 1 (Taxonomy/
  Notifications/Search/Settings) completes and BEFORE Wave 2 launch, to avoid worktree contention.
Source: user instruction 2026-06-21 (pointed at the new spec, "看能怎么落地" + 3 confirming answers).
Affected Artifacts: docs/CreatorOS-七步整合设计.md (status→adopted); upcoming contract v0.3; base-module
  plans (Projects/Analytics/Reviews/Learnings/Publishing/Dashboard); new module plans (6); program waves.
Owner: agent (user-directed)
Revisit Trigger: Wave 1 done → bake the directional change into Wave 2/3 plans; after base waves →
  generate the 6 new-module plans + contract v0.3.
Status: active
```

```text
ID: DEC-013
Date: 2026-06-22
Stage: process (orchestrator workflow hardening + manifest reconciliation)
Type: scope-change / process-improvement
Decision: (A) Reconcile ARTIFACT_MANIFEST.yaml to repo reality, and (B) add an in-repo executable process
         layer so the manifest can never silently go stale again, modeled on industry practice.
Problem found (audit 2026-06-22): the manifest's `stages:` block was a frozen 2026-06-20 snapshot that its
         own DECISION_LOG (DEC-008..012) contradicted — it claimed backend "not-started / no code" while a
         real @creatoros/backend persistence slice, @creatoros/contract v0.4.0, an ai-worker, and a live
         FE↔BE↔SQL Projects round-trip already existed on feat/service-contract (317 commits ahead of main).
         Required artifact CHANGE_IMPACT.md was missing; API/TEST/MOCK/ASM IDs referenced but never
         instantiated; consistency_gate=fail was non-blocking; failing gate verdicts were "invalidated"
         rather than retained; the workflow definition lived only in an external, unpinned skill install.
Work done:
  (A) Manifest reconciled: header + project block (work_branch, topology, honest notes); stages 13/15/16/17
      corrected to match DEC-008..012; consistency_gate reason updated + marked blocking for stage 17;
      added reconciliation + reference blocks; OPEN-003 resolved, OPEN-004 (ID governance accepted-risk) and
      OPEN-005 (untracked control artifacts on wrong branch) added.
  (B) New orchestrator/process/ layer (in-repo, version-pinned — fixes "definition lives external/unpinned"):
      - reconcile.mjs: drift detector / executable gate. Validates manifest against JSON Schema, checks
        each build-claim against git+filesystem reality on the work branch, enforces the blocking-consistency
        rule (no `passed` downstream of a failing release-critical chain unless `accepted-risk`), and flags
        manifest staleness vs the latest DEC. Exits non-zero on drift (CI-as-gate).
      - manifest.schema.json: structural + enum validation for the manifest.
      - rules/orchestrator-state-machine.md: pinned copy of the external skill rule (reproducible audits).
      - README.md: best-practice mapping (CI-as-gate, Terraform/GitOps drift, policy-as-code, DO-178C
        bidirectional traceability, ADR immutable history).
  (C) Created CHANGE_IMPACT.md back-filling CI-006/009/012 (the previously-missing required artifact).
Policy set:
  - FAIL HISTORY IS RETAINED: a failed gate verdict superseded by a later pass keeps its record + a delta;
    it is NOT marked `invalidated`. (Corrects the DEC-007 pattern; anti snapshot-laundering, ADR-style.)
  - DRIFT IS CHECKED: trust the manifest only after `node orchestrator/process/reconcile.mjs` passes.
Rationale: User /goal — "参照业界优秀实现解决 orchestrator 工程问题，并修复 manifest 等问题."
Source: Two-agent audit (artifacts + repo reality) 2026-06-22; skill rules at
        ~/.skills-manager/skills/product-to-code-orchestrator/.
Affected Artifacts: ARTIFACT_MANIFEST.yaml, DECISION_LOG.md, CHANGE_IMPACT.md (new), orchestrator/process/* (new).
Invalidates: none (corrects bookkeeping; no code/spec change). Does NOT alter any DEC-001..012 verdict.
Owner: agent (user-directed via /goal)
Revisit Trigger: Backport the executable-gate + retained-history changes into the external skill; or commit
        the control artifacts onto feat/service-contract (OPEN-005).
Status: active
```

```text
ID: DEC-014
Date: 2026-06-22
Stage: process (long-running autonomous harness)
Type: scope-change / process-improvement
Decision: Add a long-running autonomous harness so the orchestrator can run UNATTENDED for hours/days to
         implement the remaining verticals, following Anthropic's official "Effective harnesses for
         long-running agents" (three-agent initializer/coding/evaluator + progress checklist + commit-per-step).
Work done:
  - progress.json — feature-grained task queue, DERIVED from work-branch reality via process/progress.mjs
    (not hand-written). 21 verticals; honest status: only `projects` persisted, 20 scaffolded, 0 e2e_verified
    (matches the ~30% maturity note). `e2e_verified` is human/evaluator-set, never inferred.
  - process/progress.mjs — generate (from git reality) / status / next (the loop's task picker).
  - process/harness/ — README (3-agent model + run via /goal, headless loop, or GitHub Action), init.sh
    (initializer), coding-agent.md, evaluator.md, settings.autonomous.json (permission allowlist +
    Stop-hook = reconcile.mjs, for unattended runs only — NOT always-on project settings).
  - rules §"Autonomous Mode": scope-envelope pre-authorization replaces synchronous per-stage gates; an async
    decision queue lets the loop continue on unblocked verticals while a human answers asynchronously.
  - Backported to the skill (both copies) so future projects inherit the harness.
Rationale: User asked to research Anthropic's official long-running-agent practice and make the skill support
         it. Research confirmed the three-agent harness + /goal + self-verification + fresh-context-per-step.
Source: anthropic.com/engineering/effective-harnesses-for-long-running-agents; Claude Code /goal; Agent SDK.
Affected Artifacts: progress.json, process/harness/*, process/progress.mjs, rules (updated), skill copies; a
         detailed KB doc written to ThirdSpace (03-知识).
Invalidates: none (additive process layer; no code/spec change).
Owner: agent (user-directed via /goal)
Revisit Trigger: Run init.sh and drive the loop; or wire the GitHub Action on feat/service-contract.
Status: active
```


## DEC-AW-1004 — 多步 Agent 实施授权与依赖边界

用户在 T-1003 独立评审 PASS 后明确授权于同一任务会话连续实施 T-1004～T-1013。以 `docs/features/t1003-agent-workbench.md` 为完整验收范围；保留 Pi core、`execution_tasks`、账号隔离和旧采集。NomiFun 只读参考提交 `e27bd5de9a58ce444032ef4e63bb753992555c4c`，在 CreatorOS 锁定来源与依赖，不修改参考仓。实施授权不包括推送、发布或外部系统改动。Windows 原生安装与升级证据仍须由 T-1013 当场取得；本机交叉编译失败不能冒充产品缺陷或验收通过。


## DEC-AW-1009 — 同一对话跨回合产物版本谱系

用户在补充规格独立评审 `PASS[REV:825f3a6d65da]` 后明确“都确认”，批准按 `docs/features/t1009-artifact-lineage-proposal.md` 实施同一对话跨回合修订。产物谱系归属用户、账号和对话；每个版本继续绑定真实任务、原工具调用和 Blob，旧版本保留。新增后端唯一谱系索引、原调用同事务结算、未知 Blob 持久对账、旧任务保守迁移、HTML 精确图片版本清单以及新旧协议排他切换。不同对话或账号不得串联；迁移受阻时旧版只读且不伪造新版本。该确认授权实现与本地验收，不包含公开发布、生产放量或修改外部仓库。



## T-916 历史规格回执复核授权（2026-09-21）

用户要求继续修复当前 reconcile 暴露的问题。以下一次性能力仅允许对绑定任务的当前 SPEC 与当前宪法执行独立复核；不得改写历史事件、跳过审查或冒充既有 PASS。

```text
ID: DEC-015
Date: 2026-09-21
Stage: process-review
Type: review-cycle-capability
Authorization-Kind: process-review-cycle
Task-ID: T-915
Previous-Spec-SHA256: b990a38a015698105d29d2da0cada4767b3be4bd09948cc5ef147621fb98d8ce
Previous-Constitution-SHA256: ab6003112be4c5b680fba05abf8326eaf59eeafd1613b4ca44464ef3d0cff126
Allowed-Change-IDs: SPEC-DRIFT,CONSTITUTION-DRIFT
Max-Cycles: 1
Nonce: ff11bd90-4588-44ed-85e4-498b9f5f1121
Owner: user
Status: active
```

```text
ID: DEC-016
Date: 2026-09-21
Stage: process-review
Type: review-cycle-capability
Authorization-Kind: process-review-cycle
Task-ID: T-859
Previous-Spec-SHA256: e6fe3ad73fa90859a3850b09e4ffd11fd82efdc1da7e1ee27899839d045981c5
Previous-Constitution-SHA256: e84f83b7e65a415ba7a2a4639188bc2fd2d682f42d3220107a119abdc39d2a77
Allowed-Change-IDs: SPEC-DRIFT,CONSTITUTION-DRIFT
Max-Cycles: 1
Nonce: 03366bd3-4852-44ba-9e39-a33c08dfa26b
Owner: user
Status: active
```

```text
ID: DEC-017
Date: 2026-09-21
Stage: process-review
Type: review-cycle-capability
Authorization-Kind: process-review-cycle
Task-ID: T-858
Previous-Spec-SHA256: ab768b979e62ab63199ee8d1014c993dcac7f51dfa92f15e627dacb33b2ceed1
Previous-Constitution-SHA256: 871570cc600267be82e2e1fbfa79d730fc51121810b8de262c5a49c876029b66
Allowed-Change-IDs: SPEC-DRIFT,CONSTITUTION-DRIFT
Max-Cycles: 1
Nonce: e7266c6d-fe58-4215-9a56-d1c82be92e71
Owner: user
Status: active
```

```text
ID: DEC-018
Date: 2026-09-21
Stage: process-review
Type: review-cycle-capability
Authorization-Kind: process-review-cycle
Task-ID: T-824
Previous-Spec-SHA256: 58355a1e3ae9f12a57279dfb67ba05d7e950b2aec1f3284aecaf8764339950c6
Previous-Constitution-SHA256: 871570cc600267be82e2e1fbfa79d730fc51121810b8de262c5a49c876029b66
Allowed-Change-IDs: CONSTITUTION-DRIFT
Max-Cycles: 1
Nonce: c2d657d0-27b9-4fb8-97fc-6e3ee65ea71b
Owner: user
Status: active
```

```text
ID: DEC-019
Date: 2026-09-21
Stage: process-review
Type: review-cycle-capability
Authorization-Kind: process-review-cycle
Task-ID: T-819
Previous-Spec-SHA256: d89d457083d1d2d0dd132429b3f65b8a8470f3feca2f44284080833b4754eecb
Previous-Constitution-SHA256: 871570cc600267be82e2e1fbfa79d730fc51121810b8de262c5a49c876029b66
Allowed-Change-IDs: SPEC-DRIFT,CONSTITUTION-DRIFT
Max-Cycles: 1
Nonce: ca9488d5-e93a-4c60-9f58-f9812be0bb00
Owner: user
Status: active
```

```text
ID: DEC-020
Date: 2026-09-21
Stage: process-review
Type: review-cycle-capability
Authorization-Kind: process-review-cycle
Task-ID: T-816
Previous-Spec-SHA256: b9490f4fac3f5f00ff1c32d26609e48d82b94b615ab3580f0b0d2a5df955548d
Previous-Constitution-SHA256: 871570cc600267be82e2e1fbfa79d730fc51121810b8de262c5a49c876029b66
Allowed-Change-IDs: SPEC-DRIFT,CONSTITUTION-DRIFT
Max-Cycles: 1
Nonce: 10f7f1c9-b65d-4c68-bf59-cff752140c5d
Owner: user
Status: active
```

```text
ID: DEC-021
Date: 2026-09-21
Stage: process-review
Type: review-cycle-capability
Authorization-Kind: process-review-cycle
Task-ID: T-768
Previous-Spec-SHA256: f0771cc886f5f56646b8431bf2e939952ecaa7297a05c0b888e23f7ffdb4fec2
Previous-Constitution-SHA256: 871570cc600267be82e2e1fbfa79d730fc51121810b8de262c5a49c876029b66
Allowed-Change-IDs: CONSTITUTION-DRIFT
Max-Cycles: 1
Nonce: 7ae1d4fe-b06e-497d-8f2c-7e531e85087d
Owner: user
Status: active
```

```text
ID: DEC-022
Date: 2026-09-21
Stage: process-review
Type: review-cycle-capability
Authorization-Kind: process-review-cycle
Task-ID: T-726
Previous-Spec-SHA256: 7e2e8d6b672ee2cea8f84c346ac23373f2fb15069bd8f32ab560370687b3e7c1
Previous-Constitution-SHA256: 871570cc600267be82e2e1fbfa79d730fc51121810b8de262c5a49c876029b66
Allowed-Change-IDs: CONSTITUTION-DRIFT
Max-Cycles: 1
Nonce: 35a3a05d-46f1-456d-bf72-025205408349
Owner: user
Status: active
```

```text
ID: DEC-023
Date: 2026-09-21
Stage: process-review
Type: review-cycle-capability
Authorization-Kind: process-review-cycle
Task-ID: T-703
Previous-Spec-SHA256: 70e49d3ae5a3e418fad77e80fa0a61054c42de5c0634cc20881cfd7a4f005320
Previous-Constitution-SHA256: 2afb9684d1ef531f56c5def2185c6cc7086c00aa3105bff0ce87fc5c81fc5fad
Allowed-Change-IDs: SPEC-DRIFT,CONSTITUTION-DRIFT
Max-Cycles: 1
Nonce: 2adcb180-5753-4ea0-a0c7-90fe3a81e26a
Owner: user
Status: active
```

```text
ID: DEC-024
Date: 2026-09-21
Stage: process-review
Type: review-cycle-capability
Authorization-Kind: process-review-cycle
Task-ID: T-691
Previous-Spec-SHA256: a4a57d75e372b01db3c0880f6791b98971a98d0abb44a3b29c07c1723752e232
Previous-Constitution-SHA256: 6a04d0b0fa6c123f7990f02685afeed38858494cc2501ec4bfbc742050ab97fd
Allowed-Change-IDs: CONSTITUTION-DRIFT
Max-Cycles: 1
Nonce: ac8673b6-158e-4b68-9431-6ec807c855d5
Owner: user
Status: active
```

```text
ID: DEC-025
Date: 2026-09-21
Stage: process-review
Type: review-cycle-capability
Authorization-Kind: process-review-cycle
Task-ID: T-656
Previous-Spec-SHA256: ca037dafc7b21ab04ce3ffe20502e7cc8862f14dc342a1e3db2437a67887f40e
Previous-Constitution-SHA256: d01469220b22455024bd58473a6ca9f307162b1317ba0fa5fe036b148f90362a
Allowed-Change-IDs: CONSTITUTION-DRIFT
Max-Cycles: 1
Nonce: fabb442c-61e4-4776-b796-dfdc6fceac56
Owner: user
Status: active
```

```text
ID: DEC-026
Date: 2026-09-21
Stage: process-review
Type: review-cycle-capability
Authorization-Kind: process-review-cycle
Task-ID: T-645
Previous-Spec-SHA256: c693c9a4ad1175d831512f493aabd4782603a21dda58f92fdca6c76e45989c4b
Previous-Constitution-SHA256: 76e9fa0fa2408bd5f512b640d01ad5a0c550702875abeeb4ddb648a07e0e6bca
Allowed-Change-IDs: SPEC-DRIFT,CONSTITUTION-DRIFT
Max-Cycles: 1
Nonce: 2564bde3-ee0e-4e82-b317-a784d856ceb2
Owner: user
Status: active
```

```text
ID: DEC-027
Date: 2026-09-21
Stage: process-review
Type: review-cycle-capability
Authorization-Kind: process-review-cycle
Task-ID: T-642
Previous-Spec-SHA256: e8c4568adfcd8dcf82c91468cd1dfde4c46899e128d1388c00001eddcb9b1442
Previous-Constitution-SHA256: 07c9b61b58ca970feff57f1647c30a32c4af4fc92063c9a87952771403376950
Allowed-Change-IDs: REV-002,SPEC-DRIFT
Max-Cycles: 1
Nonce: e9eec361-0bb6-41fb-aee9-1e0ebdd4b713
Owner: user
Status: active
```

```text
ID: DEC-028
Date: 2026-09-21
Stage: process-review
Type: review-cycle-capability
Authorization-Kind: process-review-cycle
Task-ID: T-635
Previous-Spec-SHA256: f00d4d7c0ecf1f7821fd336ce9278a12a168e1593417b1630527d458bcc929a3
Previous-Constitution-SHA256: 89a36038833bdaed0d6de3ca353725643aff8aa53e6e0c53933b7ebdf4b1ad9b
Allowed-Change-IDs: CONSTITUTION-DRIFT
Max-Cycles: 1
Nonce: 29cc5a99-7d6d-4301-bb87-c33c1124d26b
Owner: user
Status: active
```

```text
ID: DEC-029
Date: 2026-09-21
Stage: process-review
Type: review-cycle-capability
Authorization-Kind: process-review-cycle
Task-ID: T-652
Previous-Spec-SHA256: 381393efb2d2f63029b4d6df27522836b5bcbb7205429b9df13ccbd6d96f513e
Previous-Constitution-SHA256: 86bc2c8add6a01ebf5b2ecf9de05d448770ca14a4e0bdbbf376fffc6387e3800
Allowed-Change-IDs: REV-004,REV-005,SPEC-DRIFT
Max-Cycles: 1
Nonce: 21ee04c8-f878-41cb-9555-69ebd0454f44
Owner: user
Status: active
```

```text
ID: DEC-030
Date: 2026-09-21
Stage: process-review
Type: review-cycle-capability
Authorization-Kind: process-review-cycle
Task-ID: T-694
Previous-Spec-SHA256: 6ea31e784c68e7498c99f4bfd89f8231d3d4e545c345127acd6eeee961a3192b
Previous-Constitution-SHA256: 86bc2c8add6a01ebf5b2ecf9de05d448770ca14a4e0bdbbf376fffc6387e3800
Allowed-Change-IDs: SPEC-DRIFT,THREAT-MODEL-BINDING
Max-Cycles: 1
Nonce: d4f103ce-f2e9-4f0e-9f08-e599a5dca694
Owner: user
Status: active
```

```text
ID: DEC-031
Date: 2026-09-21
Stage: process-review
Type: review-cycle-capability
Authorization-Kind: process-review-cycle
Task-ID: T-707
Previous-Spec-SHA256: 274348c049ec609de8c6fd85ff5e1c35ccd888c4d3862a744e0167f8270d3c98
Previous-Constitution-SHA256: 86bc2c8add6a01ebf5b2ecf9de05d448770ca14a4e0bdbbf376fffc6387e3800
Allowed-Change-IDs: REV-003,REV-004,SPEC-DRIFT
Max-Cycles: 1
Nonce: 653e2dc9-8565-443c-8e94-d4a39c653707
Owner: user
Status: active
```

```text
ID: DEC-032
Date: 2026-09-21
Stage: process-review
Type: review-cycle-capability
Authorization-Kind: process-review-cycle
Task-ID: T-656
Previous-Spec-SHA256: a6a56eb9bdb5c7b19e59fee6bef2c8f8fdbca2d4276f1b49d7a9c7ea049bc1ac
Previous-Constitution-SHA256: d6611dbad51dc439d17e638fc2cab9283ad6a0d5557c183f82dad0aaedb05c28
Allowed-Change-IDs: PMEM-SYNC
Max-Cycles: 1
Nonce: 9135a313-e798-4475-b983-f80300305656
Owner: user
Status: active
```

```text
ID: DEC-033
Date: 2026-09-21
Stage: process-review
Type: review-cycle-capability
Authorization-Kind: process-review-cycle
Task-ID: T-635
Previous-Spec-SHA256: 5849ba840ce1352b97eb47a8d72b77397737242621d7e32170e2cd9e2a8d9402
Previous-Constitution-SHA256: d6611dbad51dc439d17e638fc2cab9283ad6a0d5557c183f82dad0aaedb05c28
Allowed-Change-IDs: PMEM-SYNC
Max-Cycles: 1
Nonce: 439e493a-98a7-42a6-8d4c-adc7b2fa0635
Owner: user
Status: active
```

```text
ID: DEC-034
Date: 2026-09-21
Stage: process-review
Type: review-cycle-capability
Authorization-Kind: process-review-cycle
Task-ID: T-703
Previous-Spec-SHA256: 1624f50bb9f70d475bec8c633a7cc6f46d0d94f8fe4e01ecf6abfced36420460
Previous-Constitution-SHA256: d6611dbad51dc439d17e638fc2cab9283ad6a0d5557c183f82dad0aaedb05c28
Allowed-Change-IDs: PMEM-SYNC
Max-Cycles: 1
Nonce: 51b2872d-f6c4-43df-b41a-c1a6f8741703
Owner: user
Status: active
```

```text
ID: DEC-035
Date: 2026-09-21
Stage: process-review
Type: review-cycle-capability
Authorization-Kind: process-review-cycle
Task-ID: T-691
Previous-Spec-SHA256: a4a57d75e372b01db3c0880f6791b98971a98d0abb44a3b29c07c1723752e232
Previous-Constitution-SHA256: d6611dbad51dc439d17e638fc2cab9283ad6a0d5557c183f82dad0aaedb05c28
Allowed-Change-IDs: PMEM-SYNC
Max-Cycles: 1
Nonce: e7356b91-2d2f-477f-a909-bf225c156691
Owner: user
Status: active
```

```text
ID: DEC-036
Date: 2026-09-21
Stage: process-review
Type: review-cycle-capability
Authorization-Kind: process-review-cycle
Task-ID: T-645
Previous-Spec-SHA256: d2e9fbef2dcb8228b3652d5f269024eada6cafbf62c03ec61ba26ad6e4418fd1
Previous-Constitution-SHA256: d6611dbad51dc439d17e638fc2cab9283ad6a0d5557c183f82dad0aaedb05c28
Allowed-Change-IDs: PMEM-SYNC
Max-Cycles: 1
Nonce: ef51bc98-82f0-463f-b6bb-ecde96654645
Owner: user
Status: active
```


## DEC-T1072 — 本地授权与归属

用户在 Growth 会话中已采纳产品低摩擦手机号登录和双设备，并要求与重构合并实施；最新回复“认可，我授权”确认 Activity 精确本地范围。CreatorOS 本地配套属于已采纳范围，无需重问；仅隔离候选及测试，不含生产、公开包发布或真实授权写入。先完成可执行 SPEC 独立评审，保留既有账号页方向与 oil-ui-pro，功能文字至少16px。


## DEC-T983-20260914 — 采集错峰与运行入口

用户当前明确要求：流量详情超时继续修复；两小时任务错峰；有活跃任务查看原运行，否则启动一次并查看。接受范围落实为默认00/15/30/45分钟，保留用户自定义非默认计划和关闭状态；服务端核对活跃运行，前端详情走本地打开并遵守LED-047。授权本地验证，未授权公开发布。

T983来源状态补充：真实页面对照证明部分旧作品只有正常指标卡且无来源组件。以unavailable明确表达平台未提供，而不是伪造比例或标为采集失败；保留历史来源和原采集时间，不按年龄猜测。独立审查确认登录/加载/未知结构不得降级，用户本轮修复授权覆盖此必要契约表达。



## DEC-T1101-MAIN — 已授权来源并入 main 与独立再验

用户已明确全部本地代码合并到main、清理闲置worktree、无备份构建并逐功能验收。T1101来源f97a80da已独立完成，产品19/测试13路径与当前main无交集；root按T1080独立来源复核有限GO合并。来源✅/PASS只归原树，原events/review-events逐字节外部归档并保留Git祖先；不拼接或重哈希主链。main新增T1101待验记录，正式initial→start→实际组合验收，原失败另列。T1104源码诊断已验收，首次启动根因UNKNOWN与Pi漏参T1103仍保留；当前App和真实Cookie/媒体不变。

## DEC-T1105 — 当前组共享资源读取生命周期修复

用户“有问题的创建 task 及时修复”及全功能验证授权适用本项已复现缺陷。只修UI读取epoch/单在途/加载终态，原服务/权限/归属/写操作/历史保持；页面布局沿用既有oil规范。当前main实际6PASS/1FAIL诊断，前两个0test外部加载失败保留。先独评SPEC，再正式start和实际公共页面RED/GREEN；与当前T1101码面没有产品路径交集，不代签安装/真实库或全局旧债。

## DEC-T1105-EVIDENCE · 如实区分公共基线和组件红测

正式浏览器实现前实际exit0、基线PASS，未复现spinner；已发生StrictMode与延迟切组组件4FAIL作为有效前置RED。仅校准验收证据叙述，不减功能要求、权限、写集、观察预算或旅程覆盖；原browser-red命名/回执仍保留且明确非RED。独立复核后重新record，不伪造页面失败。

## DEC-T1108 · 保存成功后记录连线参考，未知旧选择保留

用户要求全功能验收发现问题及时建task修复，适用于实际中断save却提前记已处理的缺陷。仅UI生命周期/保存回执后标记及原T1101公共回归预算；新标记核对正式保存内容，旧未分类标记不猜用户意图，不删旧key。既有详情连线区加真实次要恢复操作，明确点击才用原连线参考，手选/清空、候选确认、原任务与权限保持。oil原规范与页结构不变，不扩合同/数据归属/自动生成，不接真实模型或用户库。根串行产品写，先独评SPEC，后真实RED/GREEN与独立实现/操作复核；完成源码提交后沿父任务授权main无备份统一出包。

## DEC-T1117 — 按既定素材预览与中文反馈要求修正画布两处遗漏

用户持续授权全功能验证、发现问题创建task及时修复，既定素材选择以预览为主、页面统一oil-ui-pro。当前实际截图发现保存异常英文直出及参考field展示flag遗漏；范围只复用原中文收口、传递/闭合既有showIdentity，不变业务/归属/schema/数据。精确SPEC独评先于实施；没有新视觉方向或新的付费执行。不得把当前2PASS或后续UI修复代签T1103原wire/两稿候选。

## DEC-T1119/T1120 — 修复验收派生产物与错误观察时机

用户持续授权发现问题登记并及时修复；当前真实失败已独立保留。仅处理本机两份损坏派生dev类型并原生产/开发消费者重建，及一次已有浏览器reload的DOM就绪时机。无产品方向/归属/schema变化，不需要用户重新确认素材/模型动作。先独评精确SPEC再实施，不删原失败或断言，不改TS/Gate/budget，不与dev消费者并行执行类型生成。没有新视觉方向或App/DB备份。

## DEC-T1130-01：验收适用性记录与已审局部图表范围一致

T1127登记时误标待验，实际任务只要求局部组件的合成五日Chrome回放而无journey contract。独立当前审查明确路径B可行：仅校正为—，不虚构non-fixture/refresh/back，不删任何原组件、像素、视觉、公共后端、类型、LED047、static、timeout或完整对账要求。不改任务状态、SPEC、验证器、业务契约、源码或已安装包。本记录是调用元数据修正；T1127完整对账当前43失败/两新增仍需诊断，不代签完成。详见T1130与独立review。


## DEC-T1136-01 · 当前main排期布局整合

用户既有整合/全功能验证/有问题建task及时修复授权，仅共享Dialog单列收缩和排期断点/必要select收缩；不改IA/服务/归属/发布标准，不签来源PASS。独评后原当前Chrome尺寸RED与正式保存回读；UI沿oil-ui-pro0.10.0。产品尚未修改。

## DEC-T1238-002：偏好就绪前保护与媒体凭证公开映射

Date: 2026-10-11
Status: decided within DEC-T1238-001 confirmed scope
用户依据：已确认选择Codex时文本与图片不要求独立模型配置，原ASR/视频能力保留。实施选择：未读取可信服务偏好前不展示独立文本/图片卡、引导或启用其连接测试；Pi就绪保原卡，Codex就绪免两类配置。渠道共享媒体服务按已有明确capability→serviceId关联保留，禁止服务名称猜测。原client公开services及原PUT端口已使用该opaque ID；脱敏只恢复该公开user_input集合成员的关联，未知/受管ID仍null，provider/baseUrl/名称/其它实现信息仍清空。不新增API字段、权限或数据归属，不修改原任意ID/受管Key拒绝；仅落实原已确认范围，未新增产品方向选择。

当场证据：pending/cards/services真实红4、真实sanitize投影红1→最终三文件43PASS/0SKIP；独立只读复核实际canonical ready/defaultProbe/testSession、媒体共享服务和原PUT边界无新增阻断。真实浏览器新增有限延迟偏好GET与模型探测计数验收，最终状态以ui-final.json及GATES.md为准，不把fixture写成真机。


## DEC-T1246-WORK-CANDIDATE-001（2026-10-12）：真实选择接线与原候选人采纳

**Owner**：user（集中修复授权来源为2026-10-11本会话的实际指令）；技术合同编写root、独评codex_route_inventory。**Status**：已确认范围内的缺陷修复；合同独评PASS，产品实施及完整验收待完成。不是新增用户答复或accepted-risk。

**来源与授权**：用户要求整合已完成会话，开发版打包，AI编写流程和用例，子Agent实际浏览器/App验收留图，发现问题记录后统一解决。既有T1097登记的身份/参考文档未接当前编导、字段默认保护和联合事实对照缺口属于本次确认缺陷修复；遵已确认文章图文联合创作、右侧编导微调，不恢复旧按钮。

**决定**：严格writingContext仅选择真实身份版本和资料file IDs，后台以原owner ports核归属，解析快照进入原hostContext及read/model输入；中性/无资料合法，旧task恢复原快照、原预算。新增唯一只读ai.workCandidates.source核原sourceMessage/task/call/tool、成功候选与完整摘要；外部原参数只在新reserve原事务写原task.payload.externalToolInputs，不补历史证明。原versions.create增加严格assistant分支，用户明确字段/事实选择由后台机械投影、原owner CAS/独立artifact receipt保存；不接受候选document override、不让模型直接写稿或授权采用。原同位置相同历史引用继续合法正文保存；新/改引用及归属撤销保持原门。

**边界**：独立图文精调/native视频继续manual。两个作品各自receipt，ACK重放原意图不增模型、不覆盖后续手工稿。无新表/迁移/SDK/供应商，无真实用户资料迁移或平台发布。Codex免独立文本/图片API与Pi兼容分别实测。2026-10-11用户实际回复暂不授权macOS Automation Mode，App保持未验，不用浏览器或包校验代签。

**可审证据**：[正式SPEC](../docs/features/t1097-article-director-options-diagnosis.md)SHA8221447156d8ae0194ab343cde1413a378e2fa18a552dbf869b576b5eb26b232；[初评需修订](../docs/verification/t1246/first-diagnosis/t1097-formal-spec-independent-review.md)与[真实复评](../docs/verification/t1246/first-diagnosis/t1097-formal-spec-independent-rereview.md)均保留。实际控制面receipt由reviewctl另记；本DEC不等于typed process-review-cycle capability，也不代签实现或测试。


## DEC-106903（2026-10-12）T1255用户授权一次当前快照评审周期

用户实际回复“允许重建一次评审周期”。只恢复当前PROJECT生成快照与T1255已确认需求的合法评审绑定，不新增功能范围/用途或生产、密钥许可。LED-053原明确最短两分钟并覆盖真实消费者；共同SPEC将原120秒措辞精确为网络余量加实际有界body/rate，避免合法10MiB低速上传被默认300秒截断，不改变24小时下限/10MiB/限速/退出/原deadline。旧round2与private历史都保留，不改PROJECT生成段或旧receipt。

```text
ID: DEC-106903
Authorization-Kind: process-review-cycle
Task-ID: T-1255
Previous-Spec-SHA256: 71b9889a5b699ee631bcde0602e2df111414582949592b5414032445ef6ea6d5
Previous-Constitution-SHA256: dc1df9e9e90e2c74557d9ed7486fa964b7de9f037be0822c4dbba2216bb686fc
Allowed-Change-IDs: T1255-CURRENT-SNAPSHOT
Max-Cycles: 1
Nonce: 7cf8c1d0-2e7d-4c7b-9866-ac0180c2c90b
Owner: user
Status: active
```

## DEC-106904（2026-10-13）CLS桌面日志工作区的一次当前快照完整评审授权

用户实际回复“允许，按CLS继续实现”，对应问题为“是否允许Creator T1255、Growth T229各重建一次当前范围评审周期”。本仓仅为T-1255重建一次，恢复已确认CLS桌面布局/default read及当前宪法快照的合法评审绑定；前端同域写集和原服务/0075/正式密钥/唯一owner/每日排期保持，不能扩为客户端代码或独立新周期授权。本次原旧cycle/r2、constit漂移及context-compile失败保留，不改生成PROJECT或PRODUCT_SPEC历史值。现绑定SPEC 2af28ffecf4bea7d92957c8608407b6bc1305708f0294d695f0a0caae8bcf1c4、当前constitution 09ddad223f77418a2efc2d037f386542a2c121fe782427b00d0ece6ea3ac68f6；终端旧事件 f5a03dbfb867dede127dc7ea25a1f2a21732d605805b3364e25cc47e0d3d6f93。生产切换沿原既有部署授权，不从评审授权引申其他生产写入。

```text
ID: DEC-106904
Authorization-Kind: process-review-cycle
Task-ID: T-1255
Previous-Spec-SHA256: 6bcf82dd42d1a98391d0e1e3576d06a6b97d91a2900c224bf2b0b03ebd283cf7
Previous-Constitution-SHA256: 15c177f592797eaf1873492aa7d45b55e2e2cc2cc1a4739b63fd85e3e789a56a
Allowed-Change-IDs: T1255-CLS-DESKTOP,T1255-CURRENT-SNAPSHOT
Max-Cycles: 1
Nonce: 62ecbfc8-5d3f-44d9-85f5-2107a32f9b87
Owner: user
Status: active
```


## DEC-T1274-MEDIA-ASSERTION（原确认范围内的实物断言校正）

2026-10-14。用户此前确认统一剪辑与沿用原预览/导出内核并要求继续。本次真实旧83b完整kernel同输入AAC已证明与新候选PCM逐字节相等、容器2.089796秒；画面仍48@24=2秒。此前测试把HTML/container duration视为画面2秒，原FAIL保留，不能扩大0.05容差洗绿。最终旅程将精确核视频2秒/48帧/24fps，并对旧同输入实物逐帧PTS/decoded framemd5/完整PCM及容器时长严格相等，不新增AAC裁剪标准，不改codec或模型。新候选8次重复源帧是真回归，仍必须修；该断言校正不掩盖当前差异，也不签完整媒体PASS。旧AAC有效样本欠债另登记T1277，用户accepted-risk未发生。


## DEC-127801 T1278 消费者补充的一次新独立审核（2026-10-14）

用户具体答复：“同意，按清单补齐并开启一次新审核（推荐）”。只授权原清单三个变化ID，原三轮终结PASS不重置；本capability由reviewctl绑定旧事件并一次消费。生产接线仍需实际独评与测试；Activity空写集、真实资金/App授权与发布边界均不变。

```text
ID: DEC-127801
Authorization-Kind: process-review-cycle
Task-ID: T-1278
Previous-Spec-SHA256: be170a8947a9d57bdb11cc0a55bc7bf56b59760a6ded57e32577674b7ebd76d8
Previous-Constitution-SHA256: 86bc2c8add6a01ebf5b2ecf9de05d448770ca14a4e0bdbbf376fffc6387e3800
Allowed-Change-IDs: MC-1278-CHAT MC-1278-ASR MC-1278-EMBED
Max-Cycles: 1
Nonce: af6bfeeb-436a-4223-9ee6-174ab03b7cac
Owner: user
Status: active
```


## DEC-127802 T1278 收尾两项补充与一次新独立审核（2026-10-14）

用户在本会话具体回复：“同意补齐并开启新审核（推荐）”，准确对应 FINAL_INTEGRATION_ADDENDUM_PROPOSED.md 的额度页取消/预算和双旧库迁移桥。此前102项原型的覆盖限制及独立预审三缺口均保留，新的114项与公共DB候选证据另存，不将其当正式完成。仅授权 MC-1278-OPEN 与 MC-1278-MIGRATION 两个变化，原cycle2第三轮PASS及原资金/激活期限/归属不重置。用户未授权原生App系统操作，保持未验；真实充值/生产码/付费模型/Activity/部署和公开发布边界未改变。

```text
ID: DEC-127802
Authorization-Kind: process-review-cycle
Task-ID: T-1278
Previous-Spec-SHA256: f20727182b5fb634da44fc2fe5ed4d054eb41092205c52491fef44aaa9456e14
Previous-Constitution-SHA256: 86bc2c8add6a01ebf5b2ecf9de05d448770ca14a4e0bdbbf376fffc6387e3800
Allowed-Change-IDs: MC-1278-OPEN MC-1278-MIGRATION
Max-Cycles: 1
Nonce: e597cd1c-dd96-4680-af03-27a75be1a4ee
Owner: user
Status: active
```

## DEC-129401 — 按用户安装验收调整模型交互和Codex聊天

- 任务：T-1294，用户本轮截图和文字是确认依据。
- 决定：默认官方且保已明确来源选择，图片统一入口，RedFox等密钥集中到模型，移除向量检索配置及新实际调用，右上角充值常驻；去聊天画布与重复Codex检查，设置切换核验并复用真实结果。
- 边界：不删除历史数据/冻结协议、不造永久可用或真实模型ID、不自动重发原unknown任务，不改变充值隔离/幂等/授权，不重置激活。原生自动化未授权保持；不推送/上线/放量。当前用户范围优先于T1278旧向量要求。
- 验收：按本轮SPEC测试并留真实浏览器截图，原失败待绑定组后只读诊断；当前读取/源码推断不冒原任务实际根因或功能已修复。

## DEC-129501 — 本轮视频CSP实际失败修复范围

用户明确提供正式桌面script-src阻断WebAssembly的实际报错，并要求制作视频等功能都测试验证。准入必要的专用WASM许可与完整视频链复验，禁止借此开放JavaScript eval、关闭CSP或改用户数据。与T1294共同收尾打包；原生App自动化不授权、原失败任务不重发、无推送/部署的既有约束不变。

### DEC-1294-02：仅为已证实的非付费账户读取内部拒绝保留一次同RPC读取

用户本轮已明确要求恢复Codex聊天并完整测试；这是该已确认目标内的执行可用性修复，不新增业务功能、公共服务契约、费用、数据归属或部署。正常close后独立诊断仍定位account/read/-32603；32轮只读实验的trial3/10已见同RPC同params第二次真实成功，原trial仍失败。Root据实际样例补准确SPEC并发起第三轮独立复审，尚未应用新生产。

候选只在原受控factory的精确typed内部错误后允许一次原account/read刷新false，同signal/同RPC，取消优先且不续期。其它拒绝不重复，第二失败原样返回；权限/MCP/认证/图片能力仍由真实response沿原校验，不用缓存造ready。没有业务任务重发、重开session或模型调用，也没有替原失败签通过。最终以独审、实际RED→GREEN、正常bundle公共链与完整旧证据为准。


## DEC-130101 · 独立修复图片自动分类身份消费（2026-10-16）

用户已授权恢复Codex各功能，T1300第二份候选真实上传的新自动分类原任务2.278秒进入UNKNOWN，与同exec宿主凭据端口拒绝对应。Root批准独立T1301及初轮SPEC独审，作为T1300验收依赖；不增加T1300第4轮、不重置creation方案或伪用户review-cycle。仅execution-model-identity.service.ts统一三处冻结mode消费，精确三测试与原consumer回归；不改contract/worker/dispatcher/UNKNOWN策略/恢复授权/权限期限。真实原409与缺内层payload保留，新增RED待实际发生，旧unknown不重发。Root只判断复核，执行沿原Sol高思考分工；无新用户审批问题。


### DEC-130102 · 中间实现步骤与最终Gate分别记实

Root依据`rules/orchestrator-state-machine.md`中间步骤记录真实提交、看板仍🔨的规则，批准T1301 implementation按dc85a88代码/89受控回归、本步verify与独评局部PASS真实done，以推进新candidate验证。T1301任务仍🔨待验、acceptance pending；SPEC完整素材组合前置RED缺失仍missing，后置反例不改名、无自动accepted-risk。42ae5e89e此前pending记录原样保留。本决定不是用户风险接受，不签完整TDD/整体任务完成。

### DEC-130201 · 原文章图文侧栏精简遗漏的独立窄修

来源为用户T1296精简方向与本轮T1300功能恢复/优化授权；Root只读核A及独评意见后，确认文章/图文嵌入助手的通用chips及raw引用呈现为原方向遗漏，批准T1302独立SPEC初审。仅当前注册同组同项目同output的文章/图文宿主收起通用chips；候选选择移原预览、原状态hook/body/key/default/source/CAS不变；全ref及合法空值如实呈现，无额外取名请求或新技术详情入口。沿已确认原版UI规范，不新选风格。T1300 acceptance加T1302 acceptance依赖；T1301定义/锁及T1300主SPEC/矩阵/review不改，无新数据归属/权限/服务合同，不安装发布。此处只是范围记录，尚非SPEC PASS或产品验收。


## DEC-133101 · T1331正式审核确认稿consumer额外一次评审周期（2026-10-17）

Root转交真实用户答复：问题 `call_4f1b4dd3930048f39d59ed6a9ea80b56[0]`「是否允许仅针对T1331“恢复旧版本后，正式脚本审核读错版本”开启一次额外评审周期？旧记录全部保留，完成失败复现、修复和回归后继续最终包验收。」用户答复「允许这一次额外评审」。该授权只消费下面精确一次typed capability，不以此前泛化“继续”代替流程确认，不改guard或换task重置lineage。原cycle1三轮与旧SPEC/结果/315索引均保留；新补充SPEC95d83已由独立Root技术PASS，尚无本consumer目标RED或产品W，必须先真实公共两族RED，再最小组合修复/GREEN，最终包仍待真实验收。

```text
ID: DEC-133101
Authorization-Kind: process-review-cycle
Task-ID: T-1331
Previous-Spec-SHA256: c0770b4a80d40c1ad59c373d1d2f1c50efc0d72741dce34501a151dfccb71dbd
Previous-Constitution-SHA256: eb1826d4c09054df622d9718c38ca372bd19833e72bd1a752757631a5747c1df
Allowed-Change-IDs: T1331-SCRIPT-REVIEW-CONFIRMED-CURRENT
Max-Cycles: 1
Nonce: b3c6371f281f6fc71e4822ee4f40eda17129eb7d585325d7
Owner: user
Status: active
```


## DEC-136001 — 最终公共切组消费者与旧宽收据分证（2026-10-19）
最终721完整reconcile自然44ERROR/0WARN，前41身份保留，新增T1348/T1346/T1350因本批公共Switcher与测试字节变更的宽收据失配，登记T1360，不归开工旧32项或扩充用户历史accepted-risk。当前真实Next切组与作品完整链、定向组件及即将执行的本批strict只证明当前合同，不追写旧三任务全族通过；不因全文件hash机械重演模型/渲染。工具stats新输出原件先保再还原foreign，T1073新旧本次SHA相同；foreign9与T1255整行最终全等。产品源eb19124ed/当前strict目标721/历史各run与视觉source分别记录；纯文书后续提交不改写受验来源，不将全局对账失败称绿。

## DEC-136602 — 原56不洗绿，按真实交付闭包放行exact2d本机包（2026-10-19）
Root亲读原56ERROR/0WARN分类及独立单门详情：057重验exit101/6.038秒是缺generated externalBin，未进Windows测试；061重验104.955秒exit1共378PASS/1FAIL为真实Whisper Pipeline import缺Sharp0.32 native，四旧输入SHA自然恢复且candidate clean。原full子输出被ignore，不能倒填两个fire首因。独立T7交付闭包native/SWC/PNG与四基本45PASS另已实际核验，新增导航能力controlled/独审完整，Root明确正式放行唯一delivery exact2d3826ef164241860437daa393d336d9b042f980固定产包、通过后safe安装；不修改managed依赖/补binary/重跑full或旧UI。T1366登记两新宽收据与T1294追加交叉，不扩历史accepted-risk；八旧ignored产物缺失新增身份分证。此为范围明确的工程交付裁定，不称全局通过，T1364仍进行中、真实enable/导航仍待后续Root单次放行。纯文书新HEAD不改变exact2d交付源或T1359 e676历史安装源。

## DEC-136704 — 先完整保旧菜单窗口，再以原持久剩余期限做严格恢复（2026-10-19）
Root拒绝用hover前identity切割破坏任意旧late新增合法入口，明确选最小兼容分段：原菜单流程完整按旧行为执行，只有固定REPORT_LINK_MISSING且原signal/deadline/origin有效才进入独立折叠恢复；其它错误不吞。旧窗口不重置/续期，新恢复owner观察/一次hover/关联entry观察是明确新增串行成本，source每report聚合预算加足且三report真实串行计入，原collector绝对期限仍不可延长。新阶段仅严格语义owner自身/后代或明确aria-controls关联入口，tooltip/无关同名浮层不点；未知/多owner有界等待，原旧成功族hover0次。接受折叠族先原约120秒等待代价，不签性能优化或真实恢复。R2按该精确分段独审后才实施；site-safety拒绝与T1367不提前complete边界不变。

Root进一步冻结该兼容分段的catch只包原initial wait_entry_or_centre且centreClicked=false的固定missing；不捕获已点centre后子入口或route/frame/date/download。独立恢复后不重开原全Page等待、不承诺原截止后无关联late，也不增加持续0/0门阻断合法strict面板；只沿strict关联路径和原scope/origin/signal/deadline。

## DEC-136705 — hover后面板覆盖owner的行动资格按实际动作区分（2026-10-19）
Root据独立实现审提出的具体合法输入，授权作者在原60case自然结束后做窄受控公共RED：hover展开的明确关联面板可能覆盖原owner中心，原89d6实现的后置sameOwner仍要求旧owner中心可命中会拒绝，而下一实际动作是点击可命中的关联entry。若当场复现，仅区分hover前owner行动资格与hover后owner identity/精确语义/controls关联；entry点击前自身可见enabled命中及原scope/origin/signal/deadline不放宽。此为FR3行动前与FR4关联入口落实的过严纠正，不改已冻SPEC aef632/写集、不增加真实访问。本段只记录授权解释与待查实证，不造RED或GREEN；原witness89d6三扫描/完整60case均按各自原SHA/实际终态保，不能签未来新源。作者最终新SHA冻结后只补实际受影响消费者/静态扫描，再统一唯一full；无平台/安装/taskcomplete。

## DEC-136706 — 后置owner过严缺陷实证关闭，受控产品精确整合并保真实受阻（2026-10-19）
DEC-136705候选经实际IMPL001_RED02/7.87秒与五DOM proof全true复现，再由d1局部修复GREEN01/8.67秒三报告关闭；首RED01仅hover自身TimeoutError不冒后置缺陷RED。最终独立实现审无open，精确4变更/5库存整合source-only commit665508e66ee4bf46a6ebe3267ce4887c92964e18。最终公共60PASS/1skip/182.81秒，89d6旧完整60/121374ms真实主观察仅未变消费者有限继承，source89/旧witness59/types/静态及最终三扫描实0分证，原types6FAIL/辅助夹具FAIL完整保。Root授权稳定后唯一full据实对旧56分类，新增宽receipt归本次不泛称旧债；随后仅pmem/taskctl如实block，site-safety受阻/真实恢复UNKNOWN，不complete/打包安装或绕访问。正式App仍2d；foreign9/T1255不纳产品提交。

## DEC-136707 — 本次58原输出、两新fire与收尾ENOSPC分证登记（2026-10-19）
source665唯一完整门原输出58ERROR0WARN/DRIFT，对旧2d56身份全保，新增LED053/060首因UNKNOWN（子stdout原被ignore），不能靠前版timeout174/最终静态0或收尾磁盘不足洗绿。T1354旧source宽漂移同身份追加本次witness字节，T1356未新增本次路径；登记T1368待审根因边界，不泛称旧债。wrapper在child wait返回后git status写index.lock遇ENOSPC/128并自身exit1，child rc未写必须UNKNOWN，不补造完整门exit。原log/运行起时/生成输入与新statsSHA已私有保T7；仅候选自有stats随后还原、只读status clean，main foreign不动。空间搬移/两新单门由Root另裁定，当前无重跑/清理/产品/平台/安装或taskcomplete。

## DEC-136801 — 两新fire仅做同665原门各一次的后验诊断（2026-10-19）
Root明确授权继续T1368最窄诊断：冻结SPEC经全新独立评审、正式record/start及执行放行后，在同665受管候选依次运行原LED053 `node tools/timeout-policy/verify.mjs`和LED060当前配置整条命令，各顶层命令一次，保原内部串行聚合/`&&`失败截断。执行前只读核同树无冲突活进程、合成测试隔离与环境/磁盘；不满足则保具体阻断而不启动。外层不新增任意短总timeout，原内部预算保留，PTY每次观察不超过60秒；完整stdout/stderr与真实child rc先持久化，再做git/元数据，失败不自行重试或修环境。只读分类T1354 source旧漂移与本次witness新增字节的实际消费者/hash；原full58ERROR0WARN、childUNKNOWN/wrapper1永久保，两门后验不倒填首因。允许原构建自然生成ignored ai-worker/dist和工具已有临时产物；无产品/测试/依赖/门禁/旧收据写、重复full、缓存删除迁移、真实站点/用户库/profile/安装/付费。暴露真实产品问题只保原登记并先独审，不越界修。中央只SPEC/BACKLOG本行/DEC及后续review/context/events/PROJECT与t1368安全证据，t1367 REPORT/control仅纠正陈旧状态引用；foreign9/T1255及三棵保留树不动。T1368完成权仅诊断结果和消费者分类，T1367真实恢复UNKNOWN仍须如实block；本笔仅待审文书，未record/start/test/commit。正式评审constitution采用orchestrator/SYSTEM_ARCHITECTURE.md，沿实际物理边界，不虚构路径。

Root后续审计确认LED053真实HyperFrames CLI有外网及`~/.hyperframes`配置/更新副作用，测试所传telemetry开关不足以关闭；本门须先证明无外网与无用户home修改的原生单命令隔离或既有合法开关，未经核实不得启动。不能改HOME/测试/依赖或默认联网，无法证明安全时仅保只读阻断归因，不自行构建离线wrapper框架，也不把隔离后验回填原full首因。草案等待该点裁定后冻结。

Root亲读taskctl.mjs:257-278确认`待验`无条件执行frontend旅程，`—`只对无linked journey contract合法；T1368无UI改动或journey合同，因此授权冻结前把本任务验收类别纠正为`—`，仍须全部诊断AC闭合并经Root复核，未分类新失败不得complete。这是适用类别纠正，不豁免产品门或洗失败；T1367原`待验`不变且仍须block。

冻结裁定：LED053只用现有`/usr/bin/sandbox-exec`单命令包原node命令，SBPL为version1/allow default/deny network*/deny file-write* subpath `/Users/zyongzhu/.hyperframes`；继承HOME，不改值，只给该子进程已证有效的HYPERFRAMES_NO_TELEMETRY=1和HYPERFRAMES_NO_AUTO_INSTALL=1。不放loopback以防本机代理转外网；审计未见八组需真实HTTP server，但不预签沙箱兼容。若沙箱或内部门因此失败，保原stage/退出并分类为已证环境阻断，不补跑。LED060保原整条命令、合成127.0.0.1和内存PGlite。依据仅系统SBPL示例、sandbox-exec存在和CLI代码写点/原生开关；环境差异显式记录，不称原full同环境或证明原fire首因，不创建常驻框架，不改HOME/依赖/测试/配置。本次作者与审查均Sol，正式记录homogeneous，不称cross-model。

Root授权为现有context-compile消费增补最窄机械登记：仅`orchestrator/process/modules.config.json`与`orchestrator/progress.json`中T1368一个诊断step的task binding，准确路径以工具实际MODULES_CFG/PROGRESS为准。不动其它任务，不改产品或实际验收命令，不虚构运行lease/completion，非新产品范围。此笔只补SPEC/DEC供初审，正式PASS/start后才登记并compile；无绑定时不得伪报Task Packet已生成。

## DEC-136802 — 两门后验诊断结案，产品真实恢复仍受阻（2026-10-19）
Root亲读执行方REPORT/POSTFLIGHT并接收sol_spec_review实际收尾结论后正式放行；独审记录见docs/verification/t1368/control/FINAL_REVIEW.md，homogeneous/gpt-6.1-sol，只读无新测试、无阻断。T1368两原门各一次：LED053以获批原生OS沙箱和两个有效开关执行，174PASS/静态0、37.626秒exit0；LED060保原整条&&，完整build→worker19PASS→backend52PASS、23.307秒exit0。两门均真实child wait后先flush/fsync退出JSON，再fsync原日志、生成元数据；完整输出私有保全并有字节/SHA。15项source/config及CLI SHA稳定、候选同665且clean、11个ignored dist内容SHA全等、132项用户HyperFrames目录metadata全等、两进程组残留0、T7原full三原件匹配。环境不同于原full，原665唯一full58ERROR0WARN、childUNKNOWN/wrapper1与原两fire首因UNKNOWN永久保，未第二full或重试。T1354旧source漂移与本次witness新增字节及实际消费者/hash分列，T1356 persistence本次未变，原宽receipt/PASS不刷新。Root裁定AC1..3诊断闭合，授权taskctl complete T1368；T1367受控实现通过不等于真实恢复，site-safety外部受阻/恢复UNKNOWN须taskctl block，不complete、不打包安装/真实访问。先pmem sync、按真实taskctl事件更新两任务、再pmem同步最终状态，不为纯文书重跑full或声称全绿。progress诊断binding保原pending，仅未作独立队列步骤迁移，不表示测试未执行；不调用done/verify/claim或伪造lease/e2e/completion。精确暂存仍保护foreign9/T1255与私有原件，提交须Root另放行，不改冻结SPEC或历史快照。

## DEC-136901 — 登记用户三项完整反馈并沿现有平台表整合入口（2026-10-19）
用户本轮明确要求修复首页平台Tab后侧栏持续“正在打开”，将账号组页顶部五扫码按钮及说明删除并把扫码直接放进原平台能力对应行，移除组内“查看数据”且不新建数据页、隐藏暂不支持能力，以及查清小红书已绑定但创作者总览0/缺指标的原采集→保存→查询→筛选→显示链并修确认缺陷。立即登记T1369/T1370/T1371三个完整任务和各自初始SPEC，不用分期切割已授权范围。入口重排和复用旧数据路径是用户已明确的UI/IA选择，无需再选A/B；沿项目oil-ui-pro 0.10.0、existing-project与账号组UI_RULES保现方向和品牌组件。Root已看四张截图；截图只证可见现象，不证首因或链路已通过，原件只私有路径/实际SHA引用、账号隐私图不纳Git。当前仅中央待审登记与只读定位，不start/改产品/测试/full/安装/commit；诊断回报后Root再冻结窄写集/FR/AC及正式流程，所有产品修改后续独立隔离树。保原业务数据、原任务及foreign9/T1255，不新collect/登录/模型；channels旧site-safety拒绝不绕行，不扩大为禁止本机UI只读验证。当前主树10cab133为文书源，不冒已安装产品身份或把原58/childUNKNOWN等历史结果洗绿。

## DEC-137201 — 用户撤销OilUI项目接入，沿原稳定页面修复三问题（2026-10-19）
用户最新明确要求“把OilUI删掉”“做页面参照我们之前的风格”“现在两套风格”，优先覆盖AGENTS旧强制和DEC136901中Oil流程引用；旧决定作为历史保留，不倒改。停止该skill/设计审美门，无需再问删除或A/B。Root精确授权T1372：项目目录17tracked/实际17且无foreign，先taskctl start再可逆删除，仅改AGENTS旧段、UI_RULES前两节、modules当前该前缀read/step_read/write引用，并为本任务加真实单步骤binding/packet。CLAUDE无相关引用不改，不动全局技能、其它任务/命令或历史SPEC/context/review事件。原tokens/组件/布局/状态和真实操作验收保留，以旧稳定页面为基线，不扩全站重设计；本轮三份未冻结新SPEC同步撤销Oil约束，T1369/T1370/T1371仍完整推进。该任务仅工具流程配置、无UI journey，审核/验收—适用；真实检查仅JSON parse、精确diff/check、当前入口引用与foreign保护，不产品测试/full/安装/collect/登录/模型。按真实检查pmem/taskctl完成，先不commit，Root看差异后另裁定；主树foreign9/T1255与原58/childUNKNOWN保留，不虚构lease/e2e或步骤完成。

## DEC-137101 — 已归属unknown指标仅进入已授权组的内部摘要（2026-10-19）
用户要求小红书已绑定的数据在总览真实可见；只读同scope catalog112/summary0及11条窗内入组后available/count/lifetime样本、源码public-only排除已分证。Root明确本次最窄契约不同于旧T1356 FR1非public不计：只新增真实完成current目录（generation>0/completed_at非null）、无该user/account/platform/externalId任意private/hidden/deleted tombstone且typed指标真实归属的unknown内部摘要候选。旧public+两冻结null分支原样，gen0/legacy_import/未完成目录不纳；真实service先private后更新unknown同priority仍须排除。保持unknown值、isPrivate/commitPage/tombstone/uncertainty、外发冻结与导出发布隔离、原权限/入组时间/日期/去重/0-null口径，不伪改parser public或新采集。先独审本SPEC与真实公共RED，窄改scopedWorks后公共读回/两视口UI验证；不重写旧SPEC/PASS或以内部可读代公开资格。用户已撤销Oil流程，旧tokens/组件和数据路径复用，不新页/主题，不扩写集或改用户数据；当前只冻结待审合同，未运行本任务测试/产品修复。

## DEC-136902 — 合成原失败保留，单次读取已安装运行时的实际连续导航（2026-10-19）
Root已审导航执行方提案并明确放行：原两次合成预算已经消耗，不重跑或续期。诊断1自然GREEN未复现；诊断2在auth/me readiness后首个group首页document原120秒超时、未到受控链，finally执行上下文缺失后由已核cwd runner单次SIGINT收尾，原FAIL/interrupt/trace与dev冷编译事实分别保留，不当用户安装版首因。下一次仅对已核PID和公开auth/me的已安装运行时精确`http://127.0.0.1:50617`新Chromium context做一次真实只读UI观测，原profile/凭据不读不复用；仅该origin GET与库存effect=read/method=GET的dispatch准入，其它mutation、外网和WS一律拦截并记账。只观察首页筛选→侧栏及/settings对照，不改产品、用户DB、安装或原任务，不启动新Next；新raw仅0700私有目录，安全报告限docs/verification/t1369/**。导航300秒、单动作/观察120秒、外层1800秒加清理余量，真实rc与清理分证。此是已授权诊断的真实运行时只读延续，不签用户Tauri真机、修复完成或平台采集恢复；冻结SPEC历史字节不改，不把原两次合成失败洗掉，也不扩大channels旧site-safety拒绝边界。


## DEC-136903 — 保留两原件，只补一次尚未执行的受控导航（2026-10-19）
Root亲读并接受nav冻结DELTA_PROPOSAL SHA0a9fe4ce971383788b78ad61c563dad174e652d9a6f4a469726e75486ae67059。natural01自然PASS未复现、response02首document120秒前置失败且finally阻塞/interrupt分证；安装只读浏览器read快速403finished，原pending判断撤回，不作为卡死首因。为继续解决用户问题，另授权仅normal一次response/overview+settings受控补充，不续原两次预算、不重跑自然/minimum。三真实路由每600秒完整HTTP body预热/无重试/无客户端cache，核心120秒不变；失败不evaluate，owned context/browser/observer各120秒独立清理，test9360秒/wrapper10620秒。只测试/config/本任务证据与中央SPEC追加，不改产品/旧harness/依赖；前置再失败立即保原停止，无RED不修生产、不complete。中央精确复制原提案并追加SPEC，交全新独审实际新hash后正式record/通知执行；原冻结批准/已发生实验历史保持。


## DEC-137301 — 完整对账先保真实CLI安全预检阻断（2026-10-19）
Root要求完整对账先核实际副作用，不以必须full突破无真实模型/采集/用户目录写边界。10238309c只读证明LED053原命令仍直启真实HyperFrames CLI，无T1368单门OS隔离；原telemetry开关无效，配置写/顶层更新/skills/auto-install静态可达。现仅登记T1373待审及PREFLIGHT_BLOCKER，不启动full、不改原验证器/依赖/HOME或换receipt；本轮未产生full退出和数量，665原58/childUNKNOWN不冒102新全局结果。两产品已通过定向/公共/静态及独审，与未执行全局门分证；任何后续最窄隔离或执行契约须具实际安全证据由Root裁定，不临场自造框架或豁免旧门。


## DEC-137302 — 两窄产品按实际strict完成，完整对账安全欠债另列（2026-10-19）
Root已审源码/关键图与实现独评后授权精确候选2d4f32e2f整合及前瞻控制10238309c。两任务taskctl strict真实执行原双窗链，T1370 child0/98.174秒、收据deac4c8faea8；T1371 child0/56.434秒、收据d5729ef84fe8，均verification_executed=true且工具写完成。独立终核fresh四witness与两结果expected2、skip/unexpected/flaky/errors均0，source/candidate clean和foreign9/T1255保护成立，无需重门。Root接受当前完整reconcile只读PREFLIGHT_BLOCKED为范围外T1373验证器安全欠债：未证全局OS闭包、不启动full、无新full退出/数量，665原58/childUNKNOWN只保原源。前瞻合同不倒改初轮RED/GREEN历史；源码/控制/运行源分别记录。T1369仍未复现首因且未完成，原两次及获批补充600秒前置失败保；当前App仍2d旧源，未替换/新collect/模型或外发。收尾只pmem同步与精确安全文书提交，不手改状态或progress flags，不清旧证据/缓存。


## DEC-136904 — 同源普通production差异实验保许可门与资源边界（2026-10-19）
Root明确继续T1369，不以两产品完成或dev前置失败结束用户问题；接受正式helper的新随机合成测试准入方案。冻结proposal c74d22eb0366e98fe9a0cdebfaac3292ae46c5b057438c01dcfed727b3a66729：同10cab标准完整build，build后seed&&start共用原600秒readiness绝对deadline，seed完且剩余有效才临spawn用原createBuildSmokeVerdictToken唯一签发≤5min build_smoke（端口绑定），seed只驱动内存/必要0700/0600不进server env/日志/Git，公钥只本树产物；不读用户凭据、不改verdict/helper/握手或安装。窄已知进程树原生网络隔离、本地探针、禁真实数据/后台、一次normal自然后原受控顺序及真实A取消分证，core120/test9360/build7200/outer18300不续期。df约9.7GiB，入口8/运行3GiB阈值；只获批可再生本轮.next/dev按trace原副本SHA/身份/无活进程条件回收，保全部证据/旧树/foreign。只新增production config/本任务驱动及现e2e minimal，意外tracked变化停止，无公共RED不改产品，不冒Tauri/真机恢复或T1373全局隔离已证；full继续BLOCKED未执行。中央追加SPEC/机械write_set/真实审核记录，PASS匹配后直接放行，无额外用户确认或Root排队。


## DEC-136905 — 长TMPDIR的tsx IPC前置失败保原，仅修自有夹具路径（2026-10-19）
Root接收production01实际exit1/5.155582667秒：sandbox探针0，T1355 fixture的tsx Unix socket路径119B超过103B，listen EINVAL，owner/ready未建立，未build/seed/签名/start/UI，owned三端口全空。原失败原件保留，不充产品RED。Root明确授权仅一次短/private/tmp下0700 owned TMPDIR夹具修正，原env/沙箱网络规则不放宽；先有界同env/sandbox tsx IPC探针，实际PASS后才新attempt02按原production范围/完整预算一次继续，失败停止不自动重试。冻结SPEC/proposal及R3原审结字节保，不另开整轮许可；不改guard/依赖/产品或用户目录，不把夹具调整当首因/修复或全局full闭包证明。实际阶段/清理与安全投影见docs/verification/t1369/control/PRODUCTION_BOOTSTRAP_ADJUSTMENT.md；T1369继续进行中。


## DEC-136906 — 短路径探针EPERM保原，只换自有驱动标准Node loader（2026-10-19）
production02只完成同env/原SBPL的短TMPDIR tsx IPC探针，真实exit1/422.091ms、listen EPERM、marker缺失，未build/seed/sign/start/UI，按前置PASS断言停止。与01长路径EINVAL分证，不充产品RED。Root明确选定不改sandbox或增网络规则，仅本任务自有驱动以node --import tsx加载原TS宿主/seed；执行方/独审核全体直接间接消费者，独立loader探针实际PASS后才同原完整范围/预算一次production03，不自动重试、不改产品/guard/依赖/用户目录。冻结SPEC/proposal/审结历史保，不重合同/许可；实际原件hash、路径长度按原字节校正与边界见docs/verification/t1369/control/PRODUCTION_BOOTSTRAP_ADJUSTMENT.md。T1369仍进行中、未修复/不complete；不得把窄loader可用冒全局full隔离闭包。


## DEC-136907 — 明确原合成夹具外层准备，构建与页面保原沙箱（2026-10-19）
Root已核并授权最窄拓扑差异，最终proposal f846415eb6ebdc4d96e42c15e5310adc4e3d56c13247fb82c239df875393f1de：原host/PG+原seed在外层合成fixture运行，原ps归属/nonce/UID/PID/root/监听检查不改；它们不再OS禁网，按源码未装真实collect/onBound/external adapters、最小env/私有DB及前后state无新增真实任务保护，不冒全栈sandbox。build/Next/browser仍逐字原SBPL；config webServer=[]、无借用未知host，seed/start/auth共600秒且seed后临spawn唯一签名，原build7200/test9360/core120保持。独审核原host实际ps180+pgCommand240串行420秒，清理修PW120+Next120+host480=720秒，唯一production04外18840完整覆盖18660秒串行链另180秒。旧377稿未冻结为最终预算。01–03环境FAIL及03 wrapper残PG24400、后置原pg_ctl0/142.422ms清理全保，不充产品RED；源核/实际预算独审核后直接按既有Root授权一次执行，无新用户许可层。不改原harness/seed/产品/guard/依赖或任务状态，未定位RED不修产品、不complete。中央SPEC追加仅本明确边界与失败事实，原历史段保；此DEC不是Owner=user的typed review-cycle capability，不借夹具授权伪造第4轮流程权限。


## DEC-136908 — 新夹具边界候选等待真实单次审核周期授权（2026-10-19）
Root亲读reviewctl585与665–695：T1369当前cycle1/round3终态只绑定SPEC6f8114cc…，新候选4f608dbb…不能凭一般“继续”或实施审造第4receipt。故暂停DEC136907所述新拓扑的执行，前述直接执行指令以本条后续裁定为准；仅继续静态核实际driver/预算。实际独审候选无方案阻断安全记录在control/FIXTURE_BOUNDARY_STATIC_REVIEW.json，但未正式record，不代签新PASS或回填旧receipt。精确单次changeID为T1369-PRODUCTION-FIXTURE-BOUNDARY，previous spec/constitution/event与候选边界见control/REVIEW_CYCLE_REQUEST_DRAFT.json（均位于docs/verification/t1369）；该草案不是typed capability，无用户授权/active/nonce，不能消费。Root将向用户请求该具体单次新cycle，真实答复前不build/seed/sign/start/UI，不改任务状态。旧R3历史收据、01–03原件及foreign保护保持，不以机械流程伪造已授权。


## DEC-137401 — 用户将缺数纠正为全部实际绑定媒体，逐平台恢复而非只诊断（2026-10-19）
用户最新明确“不只是小红书，其它媒体全缺数据，只有抖音正常”。Root授权立即登记独立T1374完整范围：以本次真实绑定清单为全集，抖音同scope对照，原采集终态/目录/typed指标、归属/日期、公开查询与实际显示分别核；只读先行不等产品gate，因果证据后才窄定生产写集并独审，不凭小红书单例推全平台或只诊断签全部恢复。保T1356/T1362合同与T1371完成/未安装边界，不重写旧PASS；未知、窗外、无源、采集失败与漏显示分证，不按目录补指标/Project，不改原权限/归属/tombstone/冻结及外发保护。当前仅SPEC/BACKLOG/DEC待独审，未start/产品/测试/全门；无新collect/login/模型/安装/用户库写，channels拒绝不绕行、foreign9/T1255/旧证据保。T1369新cycle仍未获用户授权，production04不执行；T1373完整对账安全预检阻断保持，主HEAD961ad来源分证。


## DEC-137402 — 已证KS/XHS旧包漏数，零生产变更补真实跨平台回归（2026-10-19）
Root基于本轮fresh公开矩阵与安装2d两hash核对，精确批准仅扩backend dashboard-collected-metrics.test.ts、frontend现t1371 e2e、docs/t1371 seed三文件；生产/契约/config与原宿主/seed0改，复用干净102共享树，不造新页/接口。backend只真实协议→service/transport；纯KS normalizer在docs seed双扫描，显式按生产字段协议映射测试装配（不声称复用内联dict/真实采集器全程），既有normalizer叶子另回归。保日期/0-null/粉丝/unknown/tombstone/源冻结及XHS/Douyin控制。PLAYWRIGHT_JSON_OUTPUT_FILE绝对新T1374结果路径+CLI --output绝对新artifacts防覆盖T1371旧证据，fresh私有root与原隔离/预算保持，重门串行。无当前产品RED不造红/不改prod，失败保原先回Root；native失败/缺报表与typed缺数分证，不签安装或全部恢复/complete。正式delta独评/record后继续已start任务，无新collect/login/模型/安装/full；1369新cycle/04仍待用户授权。


## DEC-137403 — 接受零生产跨平台回归，未交付与原视频号阻断保持任务未完成（2026-10-19）
Root亲看两窗KS321/粉丝9原图并接独立源/证据审后裁定：本轮三test/seed串联真实协议/纯normalizer→service→typed→公开transport/Next，backend52+leaf3+公共UI2实际PASS；必要frontend/backend类型0、boundary原5无新增、diff0。生产/contract/config/原harnessseed均原字节，无新增产品修复或伪RED。UI原attempt01是driver strip瓷器状态空格的启动前FAIL，Root准同scope rstrip换行修正后独立02真实两窗PASS，不消耗新审轮；旧FAIL与SHA保。旧T1371 48证据/源输入快照保，不刷新旧收据。清理仅独立证明nonce/root、owned helper/PG不运行/三端口空/postmaster无；STOPPED缺失不冒正常shutdown。
Root明确T1374不能complete：当前安装仍实际匹配2d未交付本修复；视频号原已知采集fresh get仍EXPORT_FAILED/0页、nativeReports0且真实站点观测受既有site-safety拒绝，非latest/未知项不编。已用taskctl block真实0记事件，保T1371原完成，不新collect/login/模型/安装/发布或绕站。full本轮T1373安全预检阻断未执行，不以旧58代当前；源码/受控回归与实际安装恢复分证。授权精确收三tests与本轮安全证据/中央控制、pmem同步并正常提交，foreign9/T1255/旧树/raw/trace全部保；剩余交付与真实采集问题不能靠诊断或本文书完结。


## DEC-137501 — 用户要求所有现有代码整合到私有仓库main并添加协作（2026-10-19）
用户最高优先级原话：“把当前所有的代码。没有合并的，全部合并，然后提交到主分支，然后给这个用户添加协作的权限，私有仓库用户名masx-commits”。Root指定唯一MAIN Sol整合与正常push，nav Sol在push确认后按标准write协作。原foreign9/T1255中代码本次明确允许纳入，不再永久排除；任何未快照在途工作/旧树/stash不删除覆盖，不stage密钥/用户数据/raw/运行构建产物与控制缓存。对160本地分支等逐祖先/patch等价/后继替代审计，不能机械apply旧线复活已删除OilUI或旧语义；保历史、正常merge/patch，无force/reset。按实际缺口必要类型/定向tests，既有full安全预检仍不跑，分支保护拒绝走正常PR。维护整合无新产品方向/UI journey，不铺额外新产品审轮，仍须独立来源/安全审计与真实检查。T1374等原未完成状态保，不冒安装/采集/平台恢复。


## DEC-136909 — 用户明确准许一次T1369夹具调整审核周期（2026-10-19）
Root转交用户真实答复：对“只为这次测试环境调整新增一轮，让Sol继续一次生产模式验证（合成DB准备放外层、应用隔离保持）”，用户答“允许这次调整，继续验证”；并补充首页“任意平台都会卡”。这是此前缺失的精确Owner=user单次review-cycle授权，不冒旧批准；任意平台属于原FR输入族，不修改候选测试语义。候选SPEC4f608dbb…/proposal f846415e…原字节保持，旧R3仍仅6f8114。本条保真实授权，最高优先级T1375整合期间暂不启动新重门或与MAIN争写；后续正式独审/typed capability消费按实际工具契约继续，不将用户继续理解成安装/collect/full或许可绕行。


### DEC-137502｜既有代码整合的兼容修正与撤回保护

用户T1375全代码整合授权下，Root批准只修真实合并兼容缺陷：T243新锁前模型准备门已由真实persistence的benchmark captureConfiguration和persistent transcribe根各一次RED证明，临时官方音频不可用不能阻断原existing-local-asr；只恢复协议明确availability回退，保完整来源/冻结map，取消、签名/协议、归属和身份变化仍拒绝。新model-benefit catch同步收紧，不把安全错误冒不可用。T247新增GitHub API/中转60秒请求用mock真实消费者RED后改至少120秒；blob保更长完整传输窗口，外层覆盖原串行与清理，不真实下载/上传/发布。v1候选b81旧env白名单/ASR第二账本曾由main祖先41c50538d明确撤回，不能复活；仅其未撤回且仍符合现per_request协议的一行不读长期凭据与原T763回归独立RED/GREEN纳入。原foreign产品7与T1255本轮已授权纳入，缓存/raw仍排除；跨仓旧v3向量缺失case显式skip并保真实首FAIL，不冒完整通过/真实部署验收。


## DEC-137503（2026-10-19）：全代码安全分享拓扑与历史风险分离

**Owner**：user（全代码整合及正常推送授权），Root落实安全边界。原始正常merge `59940d23df047a6bd6e675b771838e0716752f45`与全部本地历史保存在`codex/t1375-preserved-local-history-59940d23d`及原分支/工作树/stash；不reset、force或删除原件。远端main采用唯一父`1963e4ebe48f15ec084a1efe7dac2f195675b92f`的新安全快照后普通FF，仅推main，不传播本地敏感祖先。17份敏感raw整件及精确生成/同blob复制排除清单的路径/hash可追溯；有效产品/工具保持原字节，83项冻结一致，不声称所有旧tip都成main祖先。

旧远端T247已暴露敏感历史，未改该ref；安全main不消除此历史风险。masx-commits邀请继续HOLD，须用户对凭据撤销或历史风险作知情决定；T1375未完成。没有安装、真实采集、发布或production04，T1369用户已授权单次cycle但04未执行的事实保持。


## DEC-137504（2026-10-19）：知情后立即邀请标准write协作者

**Owner**：user。用户在Root说明旧远端T247敏感历史访问风险、提供暂停/已撤销继续/知情仍继续三项选择后，明确答复：“了解历史风险，仍立即邀请”。该真实答复解除本次邀请HOLD，继续向`masx-commits`发送标准write/push协作邀请，不授admin，不再重复确认。旧远端T247保持原状，不从这次知情决定推导凭据已撤销/验证有效性或远端历史已重写。

安全main产品快照c8b96与收尾4458a52已普通推送。本轮仅GitHub权限与控制metadata：taskctl start实际因⏸状态拒绝，按真实契约resume实际0恢复🔨并写事件；等待真实邀请/读回后方complete。无产品改动、不重测83源码、不跑T1373已预检阻断的full，不动其余产品任务或原12在途文件。

**实际收尾**：一次标准push邀请实际HTTP201/exit0，邀请338488946读回write/expired=false，pending_acceptance，有效permission仍none。taskctl resume0、complete0及pmem sync0均真实留事件；本任务交付完成不等待对方接受，不冒已生效成员权限。完整reconcile沿T1373安全限制未跑，其他产品任务不改。


## DEC-137601（2026-10-19）：当前main本机重装且保留全部用户数据

**Owner**：user。用户明确要求“好的，你修复之后的，你把当前的卸载掉，重新安装一下。”授权将当前main `0b823f65442701d7b4d5731cd221513a9bc7e84d` 本机产包并替换 `/Applications/CreatorOS.app`；按项目官方本地packaging技能先成功产包/校验再换App。只卸换应用文件，旧App可恢复保全，用户数据/激活/账号/媒体/Application Support/Keychain保留，不推导清库、正式双平台tag/Release/公开分发或生产改动授权。干净隔离构建保护原12在途文件，冻结期不修产品/脚本/tests来消除失败。T1369/T1374剩余问题不借安装洗完成。

**T1376实际预检**：干净0b823四门真实44PASS/1FAIL，唯一为旧整份workflow禁timeout误覆盖已批准独立relay150min；预检exit1/10.144秒原件保，按包装技能停止，taskctl block实际0。产包/退出旧App/替换安装均未开始。T1377草案仅单测试文件精确例外与有限负控制，当前待用户明确授权，未改产品或测试。


## DEC-137701（2026-10-19）：独立单测试修正后继续本机安装

**Owner**：user。Root已向用户明确只改单测试文件：精确允许独立relay已批准150分钟行，其它任务/步骤仍禁止新增超时，不动产品/脚本，完成独立修正后重新检查安装。用户明确答复“允许修正并继续安装”。因此退出包装阶段实施T1377既定单文件修正/有限负控，实际验证/独审/提交后恢复T1376，以新干净已提交源重新四基本门、固定skip-install产包并按已授权保数据安全替换，无需再询问同一许可。原0b823的44PASS/1FAIL、T1376冻结事实及旧App/任务原件保留；不改workflow、150分钟/7200秒预算、产品或发布配置。

## DEC-137602（2026-10-20）：用户知情允许现在退出并中断任务重装

**Owner**：user。用户对“退出将中断现有3项真实在途任务、自动恢复未验证”的明确问题答复：“现在退出并重装，允许中断任务”。此授权只承接T1376已验本机包dedc4b的正常退出/owned停机、旧App可恢复备份及同卷替换，不继续等待自然终态，也不对业务任务逐个cancel/retry/resume或改期限。用户数据/auth/账号/媒体/Keychain保留；自动恢复仍未验证，不冒恢复成功。原58PASS、454.197秒exit0及包签名/DMG同源结果可复用，只fresh核包/暂存与旧App归属后继续安装，无新构建/全局门/产品修订。


## DEC-138001（2026-10-20）：授权独立本地协作构建而不分享官方私钥

**Owner**：user。用户在本地构建限制说明后问“这个限制能不能解除呢？”。Root已明确对用户承接：新增独立本地构建模式，使用协作者自行生成/复用的密钥；正式发布签名与现有更新链保持。此为独立实现授权，不是包装冻结期补门；必须先SPEC及独立评审。完整本地Mac App仍真实验签，并隔离正式App身份/数据/更新；不分享生产keys、不清激活/用户数据、不替换当前正式App，不发布/外发/真实collect或模型；最终仅在独占位置真实产包及启动验证。


## DEC-138002 — 用户取消T1380并回退本次改动

2026-10-20，用户明确“把刚才的改动回退就行了，没必要改动，我跟他说了”。该新指令替换此前独立Local构建方案：停止实现、评审和包装，回退仅T1380产品/脚本修改；不取消或恢复任何真实业务任务，不动已安装dedc版本及T1378/T1255/T1379和原在途文件。原R1方案审核和当时实际RED/GREEN保留为历史，不签完成。主树四前端文件逐SHA证明归属后私有保存patch再恢复HEAD；T7自有树17个tracked修改及4个新增文件私有保全后回退至原55841基底，构建日志/ignored target原件保留。原Rust单元编译首轮缺打包资源exit101；第二轮纯单测装配自然exit0，仅1项路径测试通过，未完整产包或启动Local App；取消时无活跃本任务进程，不将未进行的构建冒FAIL或PASS。任务以真实taskctl block记录用户取消/已回退，不complete、不提交推送。


## DEC-138201（2026-10-20）：先保存项目，再由项目持有准备执行

**Owner**：user（月明）。用户于 2026-10-20 22:26（北京时间）确认 T-1382 方向及 Q-01..Q-12 默认值，明确“更新有取舍、用户很少、不必过重考虑兼容”；23:00 授权「开工：合进 6 条意见出 v2.1，登记 T-1382，实现并跑测试」。[SPEC v2.1](../docs/features/t1382-unified-project-intake.md) 已合入独立评审 PASS_WITH_CHANGES（0 阻塞）的 N-1..N-6，原评审与哈希保留，作者处置只追加。

本决定取代 DEC-RUNTIME-062 对**新入口**“转写→拆解/初稿→最后创建项目”的时序：各来源通过 backend ensureProject 先原子保存项目、真实来源引用与幂等回执，再由 project_preparation 持有准备任务。雷达与选题只选方案、升级/查看；转写、拆解、补资料、初稿候选与恢复都在项目。保留原决定的用户点击授权、候选待采纳、持久排队、等待子任务让槽与幂等恢复原则；不宣称旧实现已经替换。

来源资源为六值，公开 projects.create 使用独立的 manual/topic/imported 原三值请求白名单，普通调用者伪报 imported 拒绝；radar/assistant/quick_create 由对应可信服务入口赋值，imported 仅可信 ingestion 核真实 publication/canonical owner 后赋值。来源不授予发布事实，编导模型输入不开放 source/platformRef。纯组快速创作按合法 workspace 读取来源，账号平台信息独立读取。AI 只产候选，用户采纳后 backend service 写正式资料/稿件；准备来源工件不能被正式稿默认/精确读取或复用为写入目标。原 Codex 调用恢复核冻结身份与 thread/turn，不重发、不续期；worker 经 backend port 写库。

raw 引用独立新表；旧 confirmed、已有项目 ID/数据及历史 source 保留。在途旧 radar_project_upgrade 升级时一次性取消（现有存储只允许失败结算时置 failed），记录 SYSTEM_UPGRADED 并提示“系统已升级，请重新点击升级为项目”，不按旧逻辑跑完（SPEC §8.2）；无可运行旧任务后退役，不保旧 tick、双协议、旧 URL/sessionStorage 或兼容回滚层。父未记 projectId 不能视为项目不存在，须从旧冻结任务身份/真实来源事实只读找回已提交项目，账号/纯组均返回原 ID，禁止重复建项。无 preparation 的旧项目显示真实空态，用户在项目内明确启动；新项目统一 intake ID。LED-047/LED-053、服务端归属与用户采纳边界继续有效。

**本次运行边界**：仅修订文档、追加 BACKLOG 本行/本 DEC，并按 taskctl/reviewctl 合法流程尝试 start。产品代码、功能测试/类型检查、迁移与发布均未执行，不操作真实用户数据、模型或平台，不打包安装，不改登录/密钥/环境/依赖/构建配置，不做 Git 写操作；现有他人未提交差异原样保留。流程副本 3.29.0/技能 3.30.0 的漂移保留待处理，不在本次扩写；T-1373 全量 reconcile 副作用限制继续遵守。任务是否启动只看真实回执与事件，不手改为进行中，不把登记记为实施完成。


月明于 2026-10-21 17:25（北京时间）批准 bug 8：雷达 ensure 的 API/CLI/MCP 请求显式携带已授权 groupId；仅带 account 的一对一初始组请求在既有授权及 membership 锁内解析为同一 group scope，无法解析或无权限按现有错误拒绝，禁止退回 legacy-account 新建。同组同 item 返回原 projectId/回执且不重复准备；不同组独立，不迁移或合并已有项目。

## DEC-138401（2026-10-21）：保全独有代码后清理附属工作树

**Owner**：user。用户明确“优先清理工作树，不需要这么多工作树，如果工作树有没合并的代码，合并进去即可”。授权本轮逐一审核并移除14个附属工作树；独有有效代码整合到main，已整合、正式后继或取消内容不机械回放。主目录的T-1382等在途改动、正式App、用户数据库、账号登录以及T7构建父目录交付物保留；无push、安装或发布。

先清已核实闲置可重建缓存；原HEAD、reflog独有提交、未提交差异、不可再生证据及实际安装产物私有保全并验证后移除工作树。恢复依赖Git引用/bundle和最小差量原件，不为清理重造整树副本。将少建、按需隔离、任务结束及时回收的偏好写入AGENTS.md，避免再次长期积累依赖与构建缓存；不得以清理中断活跃目录。T-1373完整reconcile副作用限制与历史失败保留，本任务仅以自身来源核对、归档完整性、Git登记与df实测验收，不代签产品功能。


## DEC-138601（2026-10-22）：提交恢复改动并消除任务重号

**Owner**：user。用户明确授权审查 stash pop 恢复的全部改动，排除私人/临时内容后分组提交并普通推送 main，正常执行 hooks；保留 stash 与备份，禁止 force/rebase、T1332_APPROVED 或绕过 T1246。此授权扩展 T-1386 原仅质量门范围，不代表重跑或通过历史产品验收。

以 HEAD 为基础保留远端新增 8 行及本地新增/修改行，UI 的 T-1378～T-1384 与原任务重号，改记为 T-1387～T-1393；[映射及原始任务行](../docs/features/ui-fixes-2026-10-21/TASK_ID_MAPPING.md)保留完整来源。旧 SPEC 路径及评审链不改，历史事件按原时间/来源识别，不批量重写 task ID，不伪造 start/complete。

流程工具保持 3.30.0 引擎字节；移除版本标记中的本机 skill_dir，规则来源文档泛化一处本机私人目录，并据实更新项目派生规则包 hash。完整 reconcile 的 lesson_execution 预算尚未配置，既有调用默认 full 的宿主 hooks 会报 NOT RUN；本轮只按授权验 quick read-only，不冒充全量通过，不修改项目守卫配置。

## DEC-139701（2026-10-22）：修复 Verify、逐项核定已知失败并正常推送

**Owner**：user。用户明确授权T1397修复main Verify：核契约漏登记、调查backend exit143、完整运行backend/frontend并核定known-failures、串行6144MiB类型检查与全部包质量门、小粒度中文提交、HTTPS正常推送及最多两轮追加修复，并追踪CI最终结果。已知环境缺失须绑定稳定错误标记；真实断言漂移优先修复，无法修复或时序不稳分别如实记fail/flaky。不允许跳过原测试、修改Codex全局配置、设置T1332_APPROVED、绕过T1246、force push或跳过hooks。

此次调整Verify执行资源与证据收集方式不改变产品数据归属或许可安全边界。两条预测锁路由已核实原T1328业务合同及正式消费者，文档登记按授权补齐；测试文件内硬编码登记数组与“不许为了通过去改测试”的授权边界经单独说明后，用户明确答复「允许仅补两条登记，断言不变」。据此仅在`SPEC_13`数组补齐已核实的GET source、POST start，不改任何穷尽或唯一性断言。完整证据及最终结论交付`~/terminals/ci-green/REPORT.md`。
