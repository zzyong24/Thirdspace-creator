# Decision Log — CreatorOS

Record confirmations, assumptions, tradeoffs, accepted risks, and skipped stages so future agents do not need chat history.

---

## DEC-RADAR-046 (2026-08-09) — 内容雷达成功改写与选题淘汰后均可主动重试

**来源**：用户在正式发布候选收口时明确提出：内容雷达一键改写生成的文案不满意时需要支持重试；
选题采纳后如果在选题中心删除，原雷达条目不能断链，也应允许再次生成。

**决策**：

1. 复用现有 `previewTopic` 分段生成内核；同一逐字稿 hash 和定位版本下复用来源拆解与选题策略，
   每次用户主动点击只重新生成改写稿。
2. 新尝试使用新的 transform 与 operation key，不覆盖旧稿、旧 Candidate 或既有 Project；同一请求重放仍幂等。
3. 已确认 transform 继续提供重试入口；旧 Candidate 即使已淘汰，新结果也走既有采纳门创建新的 Candidate，
   不复活旧 ID。
4. 生成中旧稿只读保留，但禁止确认旧稿或再次触发重试；失败后允许用户再次点击，不做后台自动循环。
5. 本次复用现有操作样式，不修改视觉，不新增接口、数据表或模型提示词。

**Status**：用户已确认；登记 T-744，独立评审通过后实现，并纳入 V1.0 正式候选后再打包。

---

## DEC-REL-044 (2026-08-09) — Windows 45 秒首启改为性能观测，真实可用性仍失败关闭

**来源**：正式双平台 run `31318986792` 的 Windows 包在托管 runner 上用
51.752 秒成功加载主页，却被旧的 45 秒固定阈值判为失败。用户明确要求不对
偶发冷启超时作强硬限制，并要求提交后重跑正式 Windows + macOS 流水线。

**决策**：

1. 45 秒继续作为首启性能目标，超出时输出 `Write-Warning` 并保留
   `firstLaunchMilliseconds`，不单独阻断工件。
2. 120 秒内未出现 `MAIN_PAGE_LOAD_FINISHED`、进程提前退出、白屏、运行资源缺失、
   安装或卸载失败继续作为硬失败，不得上传为通过工件。
3. 本决策只改发布性能观测的阻断性，不放宽结构、安全、签名、公证、安装、
   真启动或非白屏门，不修改视觉。

**Status**：用户已确认；纳入 T-742 与 T-675 正式流水线口径。

---

## DEC-SEC-045 (2026-08-09) — 整包撤回未经逐项确认的 V1 安全行为变更

**来源**：发布候选收口期间，`888e1b1a` 一次性修改 141 个文件，把钥匙串、
AI 二次确认、blob 信任根、WebView/loopback、URL 读取、子进程环境、ASR 追踪与诊断
同时改为新路径，却没有在正式发布前向用户逐项说明并取得确认。已实际引发素材/封面
不可预览、买断产品出现付费/持久化确认、Windows 启动密钥争抢，以及用户保存
模型 Key 时仍因系统 master key 不可用而报 400。

**用户决策**：

1. 以 `888e1b1a` 之前的产品行为为基准，整包撤回该安全方案与只为补救它而新增的链路，
   不再用局部补丁继续叠加。
2. 用户自填模型 Key 恢复已验证的本机保存路径，保存和调用不访问 macOS Keychain /
   Windows Credential Manager，不弹系统密码框。
3. AI 模型生成、转写、归档和持久化不再设付费/持久化二次确认；继续保留用户
   对 AI 候选内容的采纳确认。
4. 保留用户已确认的产品功能、T-729/T-740/T-741、官方打包 Skill、macOS Developer ID /
   公证、Windows production closure、Windows 浏览器修复，以及 45 秒软警告/120 秒真启动硬门。
5. 本轮不改视觉、不提交、不推送、不打包；先向用户提交完整文件差异和本地验证证据，
   获得再次确认后才进入正式发布。

**Status**：用户于 2026-08-09 明确表示认可上述整包撤回边界；T-743 执行。

---

## DEC-SEC-043 (2026-08-09) — 用户自填模型 Key 不直接使用系统钥匙串

**来源**：V1 正式候选把用户在设置页填写的模型 API Key 迁入 macOS Keychain，导致捆绑的
`next-server` sidecar 在保存或使用时弹系统登录钥匙串密码框。用户明确要求暂时撤回该方案，
恢复无需系统授权弹窗的本地加密保存；该问题使当前安装包无法正常使用。

**决策**：

1. 用户自填模型 API Key 使用 CreatorOS 已有的本机 master key 做 AES-GCM 加密，并只把密文保存
   在本地数据库；浏览器、RSC、日志与普通导出不得获得明文。
2. Next sidecar 不再为用户自填模型 Key 读写 `com.creatoros.user-model-credentials.v1`，启动迁移也
   不访问该 service，避免保存、启动或模型调用触发系统钥匙串密码框。
3. 已经迁入 Keychain 的旧用户模型 Key 不自动读取、不删除。界面沿用既有“需重新填写”状态；用户
   下次保存新 Key 后，以本地加密密文替换数据库中的旧引用。
4. Growth/Activity 下发的渠道受管长期 Key 不在本次回退范围内，继续只进入系统 Keychain /
   Windows Credential Manager；数据库仍只保存不可逆引用与状态。
5. 不改视觉、不新增功能；当前已构建的 V1 安装包不得继续作为正式发布候选，修复验证后另行打包。

**取舍**：用户自填 Key 的防护强度回到“本机数据库密文 + 本机 master key”，弱于直接由系统
Keychain 隔离，但恢复买断桌面产品的无额外系统密码交互。受管渠道长期 Key 的更高安全边界不降级。

**用户确认**：2026-08-09，用户明确表示该系统钥匙串方案“暂时不要”“太折腾了，都没法用”。

**影响范围**：T-739（作为 T-731 FR-731-05 第 5 条的后续用户口径修订）、settings repository、
长期凭据迁移与聚焦测试。T-731 的历史评审工件不回写或伪造。

---

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

## DEC-012 (2026-06-23) — page-spec 交互契约缺口补全

**背景**:用户撞见首页"最近发布"显示 publication id + 0 播放、"本周播放趋势"恒空、多 tab 未实现。
根因:`frontend/specs/page-specs.md` 只定义了组件树+视觉还原,从未定义每个按钮/tab 的动作+数据来源+状态。

**决策**(用户选「全量 17+ surface 交互契约」):产出 `frontend/specs/INTERACTION_SPEC.md` —— 对 22 个
surface 全量只读审计(6 并行 agent),逐元素定死 动作→数据来源(契约op)→状态。共 344 元素行、
158 处 ❌/⚠️ 缺口。已分 P0/P1/P2 backlog,按 3 波实现,每波跑 gate。

**影响**:08-page-spec 增补交互契约维度(此前 gate 仅覆盖视觉);11-frontend-implementation 据此分波做真。
**风险接受**:成熟的 Positioning/Monetization/Accounts/Calendar/Topics 本轮不动。

## DEC-013 (2026-06-23) — 全量做真:建缺的 AI producer + 新增后端 op

用户对两个范围决策均选最完整:① 无 producer 的 AI 产物区 → **本轮新建缺的 AI producer 节点**(趋势/竞品/证据地图等),不留 fixture、不止于空态。② 需新增的后端契约 op → **全部做真含重活**(独立观众读 op、calibration predictions.list、knowledge 归档/解关联、跨项目对比、文件字节上传/下载等)。

**含义**:CreatorOS 走向完整目标产品,23 个 GAP 全部做真。按 INTERACTION_SPEC「目标设计与实现方案」分波实现(Wave1 P0 首页+复盘 → Wave2 P1 工作台/中心 → Wave3 producer 缺口+P2),每波 typecheck+test+渲染 gate 后合并。多会话推进。

## DEC-015 (2026-06-24) — P1 持久化底座:内存 pglite → 真 Postgres + 版本化迁移

**背景**:用户指出整套被当成"假的"——根因之一是 DB 是内存 pglite(`new PGlite()`),重启即回 seed,无真持久化。产品化第一阶段(P1)。
**决策**(用户批准 L2 门控自治产物):运行时切到真 Postgres(`drizzle-orm/node-postgres` + `pg.Pool`,读 `DATABASE_URL`),本地用 docker-compose 起库;引入 drizzle migrator 应用版本化迁移。**Pattern-Ref: PAT-002**(REAL-FORCE 命中:用户数据留存 + 唯一约束 + 将来部署)。
**验收实证**:杀进程重启哨兵行幸存(数据持久);db:migrate 建 72 表 + `__drizzle_migrations` 追踪 + 幂等;backend 9/3skip + 真PG集成 3/3 + frontend 1335 零回归;reconcile exit 0。
**Owner**:agent(用户 /goal + 批准)。**Status**:active。**Invalidates**:none(运行时底座替换,契约/服务/UI 不变)。

## DEC-016 (2026-06-24) — 迁移基线用现有 DDL 拼 0000_init(非 drizzle-kit generate)

**决策**(B 级实现取舍,自治时定):初始迁移 `backend/drizzle/0000_init.sql` 由现有 23 个 `*_DDL` 按依赖序拼出(脚本 `gen-baseline-migration.ts`),而非 `drizzle-kit generate` 从 pgTable 定义重生成。**理由(Pattern-Ref: PAT-001 borrow)**:DDL 已验证可用、零 schema 漂移,避免"一次性补完 23 张 pgTable 定义"的高风险;pgTable-as-单一真源留作后续增量。**已知代价**:future schema 变更要么补 pgTable 再 generate,要么手写增量迁移。**Status**:active。

## DEC-017 (2026-06-24) — hybrid 驱动 + pglite 保留 external

**决策**(B 级):`buildPersistence` 按 `DATABASE_URL` 选驱动——有→真 Postgres(运行时),无→pglite(vitest/无DB 环境);两者应用同一套迁移。pglite 保留在 `serverExternalPackages`(运行时加载但不用),以避免为"运行时不 import pglite"做高风险文件拆分。**理由**:保住 1335 测试在 pglite 上的 100s 快反馈(混合测试策略),且 12 个导入 persistence-client 的测试无需真 DB。**Status**:active。

## DEC-018 (2026-06-24) — 真PG集成测试覆盖表选择

**决策**(B 级,微调 spec):真 PG 集成抽样覆盖 `users`(identity)+`ai_tasks`+`ai_task_results`,做跨表 ownership join,而非 spec 原写的 `projects`。**理由**:projects 表 NOT-NULL 列多、构造脆;ai_tasks→ai_task_results 父子关系的 ownership 链更干净地验证"跨表所有权 + node-postgres 驱动 + 连接池"。`TEST_DATABASE_URL` gate,未设则 skip。**Status**:active。

## DEC-019 (2026-07-23) — 正式支持 Responses，并保留 T-471 历史 Gate 缺口

**来源与确认**：用户明确要求 CreatorOS 支持 OpenAI Responses，并以仓库同级的本地
`Thirdspace-api`（New API fork）协议兼容为目标；2026-07-23 再次确认应按
`product-to-code-orchestrator` 补全流程。

**决策**：

1. `apiFormat` 正式包含 `openai_responses`；`openai_chat` 与 Responses 显式分流，任何一侧
   失败都不得自动降级成另一协议。
2. 使用 Vercel AI SDK 与 Pi 已有 Responses 实现，不自研第二套工具循环。
3. T-471 的代码提交 `94cc40bc` 保留；追溯性 SPEC 只恢复“需求→契约→实现→测试”关系，
   不声称它在代码之前存在。
4. 没有留下当场输出的 TDD 红测判定为 **历史 Gate FAIL（保留）**，不得补拍成 PASS。
5. 真实 New API token + 实际模型调用会产生费用，未经用户单独授权不执行；发布前真端到端
   保持 `RISK-011`。

**影响**：FR-069、FLOW-023、API-008/009、TEST-001..008；见 CI-013 与
`GATE-T471-RETROSPECTIVE.md`。
**Status**：active；历史 TDD fail retained，外部付费 E2E pending。

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

## DEC-CR-001..010、014..015 (2026-07-23) — 内容雷达产品边界与用户确认

**来源与确认**：用户提出把旧“信号源”整体重构为位于定位与选题之间的对标监控/内容情报工作区，并在 2026-07-23 明确确认评论、逐字稿、首批平台、登录和稿件阶段边界；同日明确认可采用抖音热点宝作为关键词黑马上游的最终方案。完整定义见
`docs/superpowers/specs/2026-07-23-content-radar-restructure-design.md`。

**决策**：

1. `DEC-CR-001/003`：一级导航为「内容雷达」；对标博主、我的收藏、网页/RSS、黑马关键词统一归入该域。
2. `DEC-CR-002`：雷达只把外部情报转成自己的选题候选；用户确认后写选题池，不在雷达中创建 Project 或稿件。
3. `DEC-CR-004/005`：运行以真实 run 为准，失败、受阻与真 0 条分开；“全部作品”只指平台当前公开且当前会话可访问的内容。
4. `DEC-CR-006`：用户从已确认选题创建 Project 后，才可在 Project 脚本工作区生成/改写稿件；高相似候选不得采纳为正式稿件版本，必须修改或重新生成。
5. `DEC-CR-007`：逐字稿只能由用户单条或批量手动发起，全部异步排队；来源同步不自动转写。
6. `DEC-CR-008`：评论只取公开数量，不抓正文；数量获取困难时诚实降级为 `null/未知`，不填 0，不阻断作品基础元数据。
7. `DEC-CR-009`：首批支持抖音、通用网页与 RSS；网页/RSS 需要登录时引导用户打开受控登录会话，登录后重新测试，不保存明文凭据。
8. `DEC-CR-010`：关键词黑马采用抖音热点宝 `low_follower_breakout`“低粉爆款”官方策展榜单，弃用已证伪的抖音原始搜索路径。热点宝复用 canonical appData 下按账号隔离、可由用户清除的抖音 profile；情报/任务域只保存 `browserSessionRef`，不读取、复制或记录原始 Cookie/短时签名。通用网页登录态继续由既有 `browser-sessions` 专用服务加密管理，不与抖音 profile 混为一套。热点宝只提供候选，仓内 `detectDarkhorse` 的固定 48 小时三档规则负责最终命中；粉丝数缺失即排除，明确零粉只走绝对阈值分支且赞粉比为 `null`，官方 rank/score 只作证据；产品不把策展榜单宣称为全站穷举。
9. `DEC-CR-014`：任何来自他人的对标、收藏、黑马/爆款等外部视频必须保留可点击原视频链接；仅有标题/摘要不得转为选题。用户必须先手动完成异步转写，系统锁定一个不可变逐字稿版本与哈希，先做结构拆解，再结合定位生成选题候选。选题与后续 Project 均引用同一 transform/逐字稿证据；具体稿件生成或改写只在 Project 创建后发生，原逐字稿不得直接变成 Project 稿件，高相似候选仍须编辑或重新生成。
10. `DEC-CR-015`：增加“复制抖音分享链接单条建档”。用户粘贴分享链接并选择分类后，系统必须解析真实作品 ID、作者稳定身份和 canonical 视频 URL；已有作者复用同一博主节点并补齐所选分类 membership，未有则创建默认不监控的新节点。同一作品的短链/长链幂等去重。本操作只建档，明确不得自动发起逐字稿，用户仍需手动异步转写。

**Gate 状态**：产品口径及热点宝方案均已获用户确认，`RAT-CR-003` 已通过；`DEC-CR-010` 独立 delta review 经两轮 CONCERNS 修订后于 2026-07-23 PASS。用户同日授权开启落地实现，并在 BUILD 中补充确认 `DEC-CR-014` 的链接、逐字稿拆解和跨阶段证据口径，以及 `DEC-CR-015` 的分享链接单条建档；两项均沿用既有抖音只读权限与手动转写边界。
**Status**：resolved（PLAN gate PASS，进入 Contract）。

## DEC-CR-011..013 (2026-07-23) — 内容雷达 Contract 技术边界（已确认）

1. `DEC-CR-011`：内容雷达跨 frontend/backend/worker 且有多消费者，命中 `PAT-004 CF-001/002/003/004`，新增交换点全部先进入共享 Zod contract 与 operation registry；模块内私有纯函数才允许直写。
2. `DEC-CR-012`：情报、来源、快照和任务为跨重启用户数据，命中 `PAT-002 RF-001/002/004`，使用现有真实数据库与 Drizzle 迁移。统一长任务在 `execution` 模块增加 DB-backed claim/lease/heartbeat/checkpoint；`MOD-006` 因不支持计划、重试、优先级和真实 backpressure 不采用，也不提前引入 Redis/BullMQ。
3. `DEC-CR-013`：五类 adapter 只返回统一候选信封；`intelligence` service 负责幂等、合并、来源观察、快照和 run 聚合。热点宝 adapter 不拥有“三档黑马”业务规则，领域层复用修订后的 `detectDarkhorse`。

**Status**：resolved。用户已于 2026-07-23 认可整体方案并明确要求开启落地实现；该 Contract
形成 scope envelope，在不改变产品方向、数据归属、安全、服务契约和发布标准的前提下持续
进入 Build。用户同日再次确认分享链接按“分类 → 博主 → 视频”建档，已有博主复用、没有则
自动创建。

## DEC-PKG-01..05 (2026-07-23) — 桌面打包候选方向（待用户确认）

**来源边界**：用户要求把 CreatorOS 打包欠债合并调研，并补查 Tauri 官网的 Windows
最佳实践。用户尚未授权 RAT、正式实现、付费构建或 Windows 正式发布；以下均为
`needs-user-confirmation`，不是已生效决策。

1. `DEC-PKG-01`：继续把 Windows x64 作为证据补齐目标；所有退出条件达成前不得宣称正式支持。
2. `DEC-PKG-02`：优先验证 runtime 跟随 Tauri 标准 NSIS `$INSTDIR`；只有 RAT 证伪才采用独立 runtimeRoot 与第二套选盘 UI。
3. `DEC-PKG-03`：比较消费版 `currentUser` 与现有 `both`；是否取消默认 UAC 待 fixture 证据和用户确认。
4. `DEC-PKG-04`：明确 WebView2 缺失口径；在联网小包与约增加 127 MiB 的完全离线安装器之间待用户选择，不采用官方不推荐的 `skip`。
5. `DEC-PKG-05`：Windows 对外发布前接入 Authenticode + timestamp；未接入时只允许明确标注的内部未签名包，updater minisign 不冒充 OS 签名。

**证据**：`docs/research/2026-07-23-tauri-windows-packaging-official-practices.md`；
`docs/superpowers/specs/2026-07-23-desktop-packaging-first-launch-design.md`。

**影响**：Windows 安装路径、权限提示、离线口径、更新/回滚与发布标准；未确认前
T-487 保持 PLAN，不能进入 BUILD。
**Status**：needs-user-confirmation。

```text
ID: DEC-AUTO-001
Date: 2026-07-24
Stage: 1-plan / T-517
Type: user-confirmed-architecture-direction
Decision: CreatorOS 自动化必须成为内置系统底座，而不是继续扩展采集专用 sourceKind。采用
          “轻量 Automation Kernel + typed handler 积木”方向：数据库持久 job/run、唯一 ticker、
          timezone/misfire/overlap/retry、持久 claim/recovery、(userId,accountId) 归属；旧六类
          采集、内容雷达与持久后台任务迁为 handler；上下文健康先保留 typed conformance seam，
          待 T-516 领域契约通过后再注册生产 handler/job/UI。仓内已有 execution_tasks 的 lease/heartbeat/
          recovery 能力上收并演进为唯一 automation_run，不永久保留第二个通用执行状态机。
          AutomationGrant 只授权已声明副作用，不替代 P-01 人工确认门：无人值守只可写运行账、
          用户已委托来源返回且可验证的采集 evidence，以及 pending/imported 预设投影；它们不是
          active 业务闭环。用户创建或启用来源/采集计划即构成该已声明范围的持续确认，不要求每条
          指标/评论逐次授权。`source=imported` 历史作品壳属于 evidence projection，可幂等创建，
          但转 manual/active、形成正式稿件/经验或驱动后续闭环仍须用户确认。AI/规则形成的创作、
          语义归纳、偏好和修复一律只产 candidate/decision/manifest。handler 以
          domainWriteClass + operation allowlist 获得最小 service port；旧 enabled job 只有能证明
          用户曾创建/启用相同范围的来源/计划时才可迁移该采集授权，其他高风险 effect 不伪造 grant。
          参考 pg-boss、Graphile Worker、BullMQ、
          Temporal/DBOS 的成熟语义，但不直接引入 Redis、Mongo、外部 orchestration service、
          通用 DAG 或任意用户脚本。
Rationale: 仓内事实证明旧 scheduling 的 schema/wire/trigger/run 全部绑定采集与 ai_task，
           继续增加枚举会把兼容成本扩散给每个新业务。用户明确要求“属于系统底座，其他能力
           往底座上堆积木”；轻量自研可复用现有 PGlite/Drizzle 和本地运行语义，同时保留
           pg-boss/Graphile 的 durable queue、handler registry、稳定幂等键等正确模式。
Pattern-Ref: PAT-002, PAT-003, PAT-004
Source: 用户会话确认（含 2026-07-24 对 P-01/R-INGEST 的产品裁决：自动化数据是预设/证据，
        真正进入系统闭环才需要人确认）+
        docs/research/2026-07-24-creatoros-automation-kernel-oss-research.md，2026-07-24。
Affected Artifacts: T-517 replacement PRODUCT SPEC；SYSTEM_ARCHITECTURE；scheduling/automation
                    contract、backend Kernel、自动化页；T-514/T-516 的定时执行依赖。
Invalidates: 直接给旧 scheduled_job/sourceKind 增 `intelligence.sync` 或 `context.health`；
             每个业务自建 setInterval/cron/run history；automation_run 与 execution_tasks
             永久双写；T-516 DEC-CTX-005 中“原表直接泛化 jobKind”的未确认方案。
Owner: user
Revisit Trigger: replacement SPEC 独立评审证明 PGlite 上的原子 claim/恢复不可行，或真实产品
                 出现必须跨机器持续运行的已确认需求。
Status: superseded-in-part by DEC-ODR-001（“生产预设积木、唯一 ticker、人工确认业务闭环”的
        用户方向继续有效；`automation_run/AutomationGrant/effect` 物理路线不再是当前输入）
```

```text
ID: DEC-AUTO-002
Date: 2026-07-24
Stage: 2-contract / T-517
Type: architecture-data-contract
Decision: Automation Kernel 物理上采用八张归属表：automation_jobs、automation_runs、
          automation_run_events、automation_grants、automation_compatibility_mappings、
          automation_effects、automation_command_receipts、automation_cutover_state。
          automation_run 同时是 durable queue 与用户历史；attempt 用 run 计数 +
          严格 typed append-only event 表达，不另造第二执行状态表。command receipt 为 job/grant/
          migration mutation 提供跨重启幂等重放；effect ledger 逐网络/模型/领域副作用保存
          reservation/receipt；cutover control row 是 writer/ticker generation 的崩溃恢复真相。
          所有状态 CAS、lease/attempt 更新和 event/receipt 同事务。用户 RPC、runtime port、handler
          capability port 共用一套 typed contract；
          handler 只获得 manifest + grant + domainWriteClass 三重交集后的 operation allowlist。
          旧 scheduledJobs/jobRuns 只走单写 compatibility adapter。用户创建/启用同范围只读采集
          可以迁窄 grant；高风险/扩范围任务待重新授权。
Rationale: 单一 run 消除 execution_tasks/job_runs 的双真相；append-only event 保留取消、重试和
           reconciliation 证据；最小 capability port 同时满足账号 ownership、P-01 确认门和
           SYSTEM_ARCHITECTURE 模块边界。PGlite RAT 已证明最小 transaction/CAS/lease 原语可行。
Pattern-Ref: PAT-002, PAT-003, PAT-004
Source: T-517 confirmed PRODUCT SPEC；用户确认①（2026-07-24）；
        docs/research/2026-07-24-automation-kernel-pglite-rat.md。
Affected Artifacts: API-AUTO-001..027；automation contract/resources/schema/runtime；
                    scheduling compatibility；intelligence execution task migration。
Invalidates: automation_run + execution_tasks 永久双写；frontend 业务 ticker；
             handler 直拿 repository/通用写库；每条采集 evidence 逐次弹窗确认。
Owner: user+agent
Revisit Trigger: Contract review 证明 PGlite 无法支持同事务 event/CAS，或产品新增跨机器 worker。
Status: superseded by DEC-ODR-001（历史 Round 3 FAIL 保留；本决定从未激活，不再进入确认队列）
```

```text
ID: DEC-CTX-005
Date: 2026-07-24
Stage: 2-contract / T-516
Type: architecture-data-contract
Decision: T-516 拟采用四项物理裁决，待确认②统一签核：
          ① ContextFact 每轮重建，不复制业务真值；report/issue/candidate/event/manifest 写入
          canonical Drizzle DB。② 复用 scheduled_job/job_run 与唯一 tick 历史，但把现有采集
          专用 dispatch 泛化为 jobKind，context.health 是零 LLM 的独立 executor，不伪装成
          收藏/采集源，也不新增 timer。③ Publishing 暴露 canonical publication 窄读 port，
          Context 不跨 repository 拼表。④ creator_profiles 增加 revision；repair confirm/undo
          用 SQL CAS，AI/worker 只产候选，确认后由 backend positioning/context service 原子落库。
Rationale: 结果需要隔天确认和撤销，命中 PAT-002 RF-001/002/004；扫描需导航后继续且有终态，
           命中 PAT-003 AF-002/003；设置、backend、Publishing、Positioning、AI runtime 是
           多边界多消费者，命中 PAT-004 CF-001/002/003/004。复用真调度历史同时泛化执行器，
           比新增 timer 或把治理任务塞进采集语义更一致。
Pattern-Ref: PAT-002, PAT-003, PAT-004
Source: T-516 SERVICE CONTRACT 仓内可行性核查，2026-07-24。
Affected Artifacts: T-516 SERVICE CONTRACT；contract/context operations；backend context、
                    scheduling、publishing、positioning；settings/Copilot consumers。
Invalidates: 第二套调度/run 表；前端/localStorage 持有结果真值；Context 直读他模块 repository；
             无 revision 的先读后写伪 CAS。
Owner: user（确认②后 active）
Revisit Trigger: 独立契约评审发现 blocker，或用户不接受任一物理裁决。
Status: superseded by DEC-ODR-001（未获确认、从未激活；旧 report/issue/candidate/event 与独立
        confirm/undo 物理方案不再进入决策队列）
```

## DEC-FDB-001 (2026-07-26) — 问题反馈是用户确认的窄化出网，不建设客服平台

**来源**：用户要求“有个能反馈 bug 的渠道，且直接反馈给我”，并指出此前把它扩成客服工单、
多角色、复杂保留与删除编排已经跑偏。

**决策**：

1. 入口放在 CreatorOS 设置中；用户先预览描述、最多 3 张截图和是否附加加密日志，再明确点击
   “发送问题反馈”。未点击发送时反馈网络请求必须为 0。
2. Web 只调用 Tauri typed RPC；Tauri 固定本地附件快照、取得新鲜签名授权并上传，Web 不获得
   绝对路径、激活码或日志明文。
3. Thirdspace Growth 只提供一个私有开发者收件箱，复用现有管理员认证、私有对象存储、事务
   outbox 和 worker runtime；不建设客服角色、状态流转、用户在线回查或 legal hold。
4. 接收内容固定 90 天后删除；日志始终是开发者公钥加密的 `.enc`，只有开发者离线工具可解密。
5. 该窄化出网同步写入产品宪法 P-04 与 NFR-PRIVACY；以后如要客服协作必须另立需求并重新确认。

**用户确认（2026-07-26）**：用户明确要求直接反馈给开发者，并认可先纠正过度设计、后续再讨论
流程框架优化。

**Status**：superseded by DEC-FDB-002（历史产品裁决保留；Growth 上传/收件箱不再是 BUILD 输入）。

## DEC-FDB-002 (2026-07-26) — 撤销应用内上传，问题反馈复用已配置 supportUrl

**来源**：对 DEC-FDB-001 的最终可实现性审计发现，仓库没有可直接用于生产的 Growth 私有反馈
对象存储、通知 adapter 和所需 license proof；继续补齐会再次把“直接反馈给开发者”扩成新平台。
同时 CreatorOS 已经通过签名 channel config 下发、缓存并净化 `supportUrl`。

**决策**：

1. DEC-FDB-001 中关于 Tauri 上传、Growth 私有收件箱、截图/日志服务端保存和 90 天清理的决定，
   在进入 BUILD 前全部撤销；该决定保留为历史，不再作为实现输入。
2. CreatorOS 提供本地反馈弹窗：整理并复制描述与最小诊断摘要，打开已配置的 `supportUrl`，
   并可打开本机加密日志目录。
3. 真正提交发生在开发者已经配置的外部反馈渠道。应用不自动上传截图或日志，也不能把“外部页面
   已打开”显示成“反馈已发送”。
4. 未配置 `supportUrl` 时必须诚实提示，同时保留复制内容和打开日志目录的能力；禁止假按钮。
5. 后续若确实需要应用内上传、回执或工单协作，必须作为新需求证明现有渠道不足后重新确认。

**Status**：resolved（取代 DEC-FDB-001 的 BUILD 方向；T-518 回到 S 级直达入口）。

## DEC-ODR-001 (2026-07-26) — 四个过度设计任务统一退回最小现有能力路线

**来源**：用户明确表示近期方案“完全跑偏”，要求先统一解决具体问题，编排框架优化后议。独立审计
进一步证明旧方案重复建设执行器、反馈上传基础设施和文件平台；第一次瘦身又遗漏了部分已确认结果。

**决策**：

1. T-517 保留“生产预设积木”的用户方向，但撤销新 `automation_job/run`、八表 effect 平台和第二
   执行状态机。`scheduled_job/job_run` 继续管调度/展示；现有 `PersistentTaskService` 提供 durable
   task 原语，并补一套 typed handler registry 与单一轻量 driver。DEC-AUTO-001 中“必须新建
   automation_run/迁移为 Kernel”及 DEC-AUTO-002 的物理设计均被本决定取代。
2. T-516 保留设置入口、默认每周、可调/关闭/立即检查，以及“AI 起草修改、用户确认或调整后保存”。
   自动扫描只做确定性规则；AI 起草由用户主动触发，复用现有定位编辑、保存和版本历史，不新建
   candidate/event/confirmation/undo Saga。DEC-CTX-001/002 的用户结果继续有效，DEC-CTX-003/005
   中要求独立候选/撤销基础设施的实现解释由本决定收窄。
3. T-518 以 DEC-FDB-002 为准：复用 `supportUrl`，不建设 Growth 上传/工单。
4. T-519 保留默认文件夹、多级真实文件夹、“全部/最近/未归档”虚拟节点、多文件及既有 URL/文本
   导入、关系图/观点地图/全部、本地原文件与用户采纳门。实现先修 Assets upload ownership 和
   complete 幂等，不建设第二套上传/搜索/图谱。
5. 四份 2026-07-26 Replacement 是新的 PLAN 真相；旧 CONTRACT 全部保留为审计历史并关闭 BUILD。
   后续实现仍需新 CONTRACT、独立评审和确认②。

**Status**：resolved（用户范围重置；不授权修改 orchestrator engine，也不把四项功能伪报为完成）。

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

## DEC-COL-001 (2026-07-26) — 内容雷达采用 owner/collector 双身份且不扩散到其他模块

**来源**：用户明确要求只有内容雷达需要指定采集账号，并要求主页、收藏夹、黑马三类登录型
来源均可选择；经营数据、评论、其他数据源与其他自动化任务不需要。

**决策**：

1. 当前工作区账号是所有 source/run/task/item/observation 的唯一 owner；采集账号只决定抖音
   adapter 使用哪份已绑定、active、同用户的本机登录态。
2. selector 只出现在 `creator_profile`、`favorites_folder`、`darkhorse_query` 的现有新增来源
   对话框；不得做成全局账号选择器，也不得改变 `self.metrics`、`self.detail`、comments、
   `web/rss`、分享链接或其他自动化任务。
3. 客户端只提交 `collectorAccountId`；服务端验属主、平台和状态后派生 opaque session。
   Cookie、profile 路径、签名及 `browserSessionRef` 不进入这三类公开契约、领域数据和普通日志。
4. 手动、首次、定时同步都消费 source 固化的 collector；任何异常都不得回退 owner 或伪装成
   成功 0 条。
5. T-496 的“仅收藏夹”失败工件由 T-537 替代。T-537 文档已三轮内部评审通过，但在两个真实
   active 抖音登录态完成 `RAT-537-01` 前，正式 PLAN/CONTRACT Gate 与全部 BUILD 保持 blocked。

**Status**：blocked（产品边界已确认；外部数据源可行性硬门未满足）。

## DEC-TSB-001 (2026-07-26) — 三系统权威边界、双入口与渠道生命周期

**来源**：用户要求根治 Thirdspace-growth、activation-manager、CreatorOS 三仓分工，并在
Growth DEC-050 新独立评审 PASS 后确认最终 lifecycle 与 AM exact contract。

**决策**：

1. Growth 是商业、渠道配置与官方产品 Bug 收件箱权威；AM 是 license/entitlement 与签名权威；
   CreatorOS 只负责产品、本地内容/日志、脱敏诊断、反馈交互和签名 runtime 的只读消费。
2. 产品 Bug 只读 `bugFeedbackUrl`；购买、续费、激活码交付售后只读
   `channelSupportUrl`。legacy `supportUrl` 严格只是 `channelSupportUrl` alias。
3. AM→Creator 唯一 runtime 是 signed `channelConfig` schema
   `channel-runtime-v2` closed 17 keys。Creator 按 raw digest/Ed25519/date/nonce →
   closed schema → `(projectKey,channelRef)` → RFC 8785 `sourceDigest` → version/digest 顺序验证。
4. Growth lifecycle 固定 `active→sales_disabled→terminated`。sales_disabled 的更高 snapshot
   令 purchase/renewal 为 null，保留 brand/support/download/official Bug；terminated 前必须由
   AM 把全部 active/non-revoked 授权原子改绑到明确 ordinary active target，报告满足
   `completed=affected,unresolved=0`。
5. Creator 不接收 tombstone、不自动 fallback、不猜 target。只在 AM 签名响应中出现新
   identity 后采纳。
6. 本地可信 runtime 并入现有加密 `.license` 快照原子保存；旧明文 `.channel-links`
   不自动信任或迁移。Creator 不自动上传日志、截图、用户内容或反馈正文。

**Invalidates**：DEC-FDB-002/DEC-ODR-001 中“Bug 复用 `supportUrl`”的字段语义；
T-396 的三键明文 cache 与单一 `supportUrl`；T-518 的 Bug 入口字段。T-531/T-532 与上传/
附件相关范围继续冻结。

**Evidence**：Growth canonical §5.1/§6/§7.3.1/§7.8..7.11 新周期 PASS；
AM API-AM-007/011/012；projection digest `sha256:b9512d…76d6d`；
reassignment fixture file SHA-256 `40a7bc44…2cc7`。

**Status**：implemented；Creator CONTRACT 三轮独立评审已收口，TDD/BUILD 与 consumer contract
tests 已完成。全局 `next build` 仍受当前 HEAD 中 T-535 已提交的 `instrumentation.ts`
code-frame panic 阻断，不影响本决策落地结论，但发布前必须由 T-535 清零。

## DEC-PLAT-001 (2026-07-26) — macOS 与 Windows 均为已完整验收桌面目标

**来源**：用户明确纠偏：Windows 版本已经完整验收，先前“不能完成验收”“仍待 Windows
实机验证”的当前口径均为错误信息。

**决策**：

1. CreatorOS 当前正式桌面目标为 macOS 与 Windows；两端均按已完成完整验收处理。
2. 当前生效的教程、产品定位、桌面 README、任务队列和规格索引不得再把 Windows 写成
   “未支持”“未实机验证”“不能验收”或发布范围外。
3. 旧 SPEC、旧评审与 README 中 P1 当时的验证范围可作为历史审计记录保留，但必须标明已被
   本决策和 2026-07-26 用户验收结论取代，不得继续作为当前状态引用。
4. 本决策记录的是当前发布验收结论，不反向补造未在当时发生的历史命令、测试日志或签名证据。
5. “CreatorOS 不自动发布到抖音”等真实产品边界继续保留；它与 Windows 桌面版是否完成验收
   是两件独立的事。

**Status**：resolved（事实纠偏；不新增产品范围）。

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

## DEC-TSL-001 (2026-07-27) — T-076-CREATOR 允许用户确认后的纯文字反馈，claim 未闭环不得完成

**来源**：用户明确要求让已发布 CreatorOS 成为三系统闭环终端，并固定 CreatorOS 只负责终端
交互、身份会话、权益领取入口、用户确认后的问题提交和本地脱敏诊断；Growth/AM 权威边界不变。
T-575 Round 1 独立评审指出该要求与旧 P-04“应用内发送固定禁用”冲突，并指出 disabled claim
adapter 不能冒充真实权益领取。

**决策**：

1. 更新产品宪法 P-04/NFR-PRIVACY：只有用户明确点击后，CreatorOS 才可把用户已预览并脱敏的
   问题纯文字提交到 Growth 官方收件服务，并只以 Growth 真实 `publicRef` 回显成功。
2. 渠道身份只能来自 AM 已验签授权上下文；Growth 决定渠道优先级。Creator 不上传日志、附件、
   截图、激活码、token、手机号、机器标识或其他用户内容。
3. `bugFeedbackUrl` 缺失、服务 health 未过或任一安全门关闭时，继续使用 DEC-FDB-003 的复制+
   官方飞书手动降级；打开网页不等于提交。
4. AM claim canonical 尚未落盘时允许先完成零出网 adapter、fixture 和 feature flag，但它们只是
   T-575 内部步骤。AM canonical、真实 provider、领取 UI、三仓正负 fixture 和真实联调未全部
   完成时，T-575 必须保持 blocked/未完成。
5. CreatorOS 不成为渠道、价格、订单、佣金、反馈优先级或 entitlement 真相源；不扩张
   `channelConfig` closed schema。
6. 当前已发布主功能优先：两项新能力默认关闭，任何异常先关远端签名门/capability；本任务不
   commit、push、deploy 或重新发布。
7. 后续主调度确认 AM final exact 已 Round 2 独立评审 PASS；并指出浏览器 owner API
   无法在禁止 deep-link/query/fragment/clipboard 的前提下把 claimToken 安全交给 Creator。
   Creator consumer 因此只预留 Growth API-210..212 device authorization + S256 PKCE：
   Creator 生成 session 并展示 user code，用户在 Growth 登录态完成 ownership+reauth 批准，
   Creator 持 device secret+verifier 轮询 API-212。approved no-store launch 到达后，在首次 AM
   consume 前，必须把 token/path/requestId/nonce/绑定语义摘要写入独立 OS 原生凭据
   pending-consume journal；这是 claimToken 唯一允许的短期持久化例外，禁止普通文件、数据库、
   URL、剪贴板、日志和遥测。AM 已锁同 requestId+同 consume digest exact replay；重启必须复用
   原请求，只有 `.license` 原子落盘并读后验真才删 journal。成功后只长期保存 AM Ed25519 验签
   通过的正式授权事实与既有 activation code。AM final descriptor/fixture SHA-256 分别为
   `52ce9b41…2d3`、`e4992497…384`，Creator 已逐字复制并 cmp；Growth API-210..212 PASS、最终
   device-flow fixture 一致和 Creator consumer 复审前，T-575 不进入 BUILD。
8. Creator Round 3 独立评审为 `CONCERNS`（0 blocker/2 major）。pending journal 删除条件收敛
   为 closed 状态表：`attempted` 后的取消、TTL、网络未知、坏签名和旧 `.license` 均不能删除，
   必须先 exact replay；本地成功但删除失败也先重放并把签名响应与本地快照逐字段核对。反馈直提
   由两门改为三门，新增不可伪造且未过期的服务 readiness；当前上游没有 Creator 可消费的 exact
   source/shape/TTL，登记 HARD-575-003。缺该门时 direct submit 固定 disabled，不由 URL、历史
   成功、telemetry 或 UI 猜 ready，也不新增通用健康平台。

**User confirmation**：用户 2026-07-27 的 T-076-CREATOR 明确授权。

**Pattern-Ref**：沿用 T-534/DEC-TSB-001 的现有可信边界，不新增第三方 flag 平台。

**Status**：resolved（方向变更已确认；仍须 T-575 独立评审与 contract gates）。

## DEC-TSL-002 (2026-07-27) — T-575 三轮后收敛裁决：不新增反馈 readiness 平台

**来源**：用户更新 `product-to-code-orchestrator` 至 3.7.0，并明确要求收敛审核、重新委派
Growth / Activation Manager / CreatorOS 继续推进。T-575 已完成三轮独立评审；按新规则不得
开启 Round 4，遗留问题由用户裁决。

**决策**：

1. Round 3 的 pending-consume journal 删除条件已按 closed 状态表修订，作为 BUILD 的
   fault-injection 验收条件，不再重复评审。
2. 不采纳“新增 Creator 可消费的独立 feedback readiness API/平台”这一实现扩张。
   “服务能力可用”由既有真实事务内联证明：CreatorOS 先取得 AM 签名反馈上下文，再调用
   Growth `API-170`；只有 Growth 返回并通过 closed-schema 校验的真实 `202 publicRef`
   才显示提交成功。
3. 任一步骤超时、断网、坏签名、上下文过期、Growth 非 `202`、回执不合法或服务降级，都必须
   保留用户草稿、显示未提交，并进入既有复制文字 + 官方反馈页的手动降级。历史成功、URL、
   telemetry、UI 本地状态不得冒充 ready。
4. 本裁决不新增 API、表、角色、健康平台或渠道字段，也不降低“失败不得冒充成功、用户明确
   确认后才出网、禁止附件/日志/激活码自动上传”的已确认验收标准。
5. T-575 可在 Growth API-210..212 契约 PASS 后进入完整 BUILD；任务仍须一次完成权益领取、
   签名渠道配置、纯文字反馈、真实回读、故障恢复和跨仓 E2E，不能把未完成部分静默延期。

**Risk disposition**：`avoid`（避免 reviewer 建议诱发的新 readiness 产品面），以现有
AM assertion + Growth authoritative POST receipt 的 fail-closed 事务作为最小结果约束。

**Status**：resolved（用户三轮后裁决；禁止 Round 4）。

## DEC-TSL-003 (2026-07-29) — T-575 只消费 Growth 签名产品配置，不扩展授权或 runtime 权威

**来源**：用户明确要求 CreatorOS 在 T-575 内从 Growth 拉取 product-specific opaque JSON，
由 CreatorOS 按产品协议解析；同时重申 Growth/Activity/CreatorOS 三方权威边界、24 小时离线
容错和 revoked/expired/replay fail-closed。

**决策**：

1. 采用 Growth 已独立评审 PASS[REV:d2895a3b6dac] 的
   `config-access-ticket-v1 + growth-client-config-bundle-v1`：Activity 只签短票并证明当前授权，
   Growth 保存/签名配置正文，Creator 只验签和解析。
2. `channelConfig` 继续只认 T-534 的 Activity signed `channel-runtime-v2`；Growth bundle 内六键
   不建立第二套 UI runtime。
3. Creator 首个产品协议固定为
   `creatoros.model-config@creatoros-model-config-v1`，只输出安全 modelPolicy；长期模型 key、
   支付/服务端 secret、激活码、原始设备标识和长期 bearer 禁止进入 bundle/LKG/UI/日志。
4. 仅 network/authority unavailable 可在 24 小时内使用 AES-GCM LKG；撤权、到期、重放、
   改绑、terminated、坏签名和版本倒退均 fail-closed，禁止 silent mock fallback。
5. 应用启动和授权事实成功落盘后异步 refresh；feature/config 默认关闭。真实联调前不得把代码或
   fixture 写成已上线。
6. 本决定是用户对 T-575 的新增明确裁决，复用 Growth 已审 exact contract；不重开
   DEC-TSL-002 已禁止的 T-575 Round 4。
7. Growth 已提交的单运行时重构 `a74b92e` 将 API-216 实际 transport 从 `/api/v2` 收敛到
   `/api`。Creator 同步改为 `/api/client-config/bundles/current`；本次只适配已提交的上游
   路径，不改变 ticket、验签、身份、缓存或 fail-closed 语义。用户 2026-07-29 已要求核实后
   收敛到 `main`。

**Status**：resolved（用户确认；进入 TDD/BUILD 与 live HTTPS 验收）。

## DEC-MODEL-001 (2026-07-28) — 内容雷达不新增专用模型配置面

**来源**：用户在 T-589 性能优化完成后明确指出“模型配置已经够多”，否决新增的
“内容雷达拆解模型”设置卡。

**决策**：

1. 内容雷达逐字稿拆解与选题转换统一复用既有 `topic.generate` / 默认文本模型配置。
2. 删除 `intelligence.topic-decompose` 专用模型 capability 的解析、设置卡和连接测试，
   不让性能优化转化为新的用户配置负担。
3. 保留与模型配置数量无关的性能改进：逐字稿 hash 复用拆解、输出预算、重试收紧、
   安全耗时日志和慢任务终态回显。
4. `intelligence.topic-decompose` 继续作为内部 Skill/Prompt ID 使用；它不再表示用户需要
   单独配置模型。

**User confirmation**：用户 2026-07-28 明确要求撤掉该配置项。

**Status**：resolved（配置面收敛；不改服务契约、数据归属或发布标准）。

## DEC-VIS-001 (2026-07-28) — 平台作品采用“仅确认公开才入库”的单一数据边界

**来源**：T-591 审计确认隐藏作品在项目/发布、指标、搜索和 AI 下游存在多套过滤口径及双写
漂移；用户随后明确要求“从数据源只采集未隐藏的作品，这样全局一致，下游不需要过滤”。

**决策**：

1. 抖音源适配器仍须在一次采集中临时观察公开、隐藏和未知状态，用于判断与发现恢复公开；
   但只有本轮明确公开的作品可以进入 CreatorOS 项目、发布、指标及派生数据域。
2. 明确隐藏的存量作品退出平台派生数据域；自动导入项目可整体清理，用户手工项目不得因平台
   状态变化被删除，只清理其平台发布及派生数据。
3. 未知状态 fail-closed：不新增、不误删。恢复公开依赖不受本地可见集合截断的源侧全量扫描
   重新采入。
4. 完成存量对账后，列表、统计、搜索、定位、复盘和 AI 不再各自维护 hidden 业务过滤；
   “显示已隐藏”产品入口退役。旧隐藏字段暂留作升级/回滚兼容，不再是下游真相。
5. 隐藏清理会删除本地平台指标历史，恢复公开后重新开始本地历史；账号汇总随当前公开集合
   下降属于已确认产品口径。
6. 该数据归属变更由 T-595 的窄 SPEC 独立评审通过后开工，T-592/593/594 并入同一任务收口，
   避免分别实现新的下游过滤。

**User confirmation**：用户 2026-07-28 明确确认全局统一到数据源边界。

**Pattern-Ref**：PAT-003（后台采集继续异步任务化）；PAT-004（collector → ingestion /
projects / publishing 跨边界走明确内部服务契约）。

**Status**：confirmed，待 T-595 独立 SPEC 评审。

## DEC-AUTO-001 (2026-07-29) — 内容雷达与全局自动化必须共用唯一调度基础架构

**来源**：用户再次明确指出“定时任务这里要统一一套基础架构，绝对不能两套”，并确认采用
T-517 / T-598 推荐的方案 A。代码核查确认当前生产组合根同时启动
`automation-driver` 与内容雷达独立 `intelligenceTimer`，与既有 `DEC-CR-016` 冲突。

**决策**：

1. 生产环境只允许 execution 模块的统一自动化 driver 判断账号级自动化作业是否到期；
   内容雷达不得保留独立 `setInterval`、cron、启动 due-source 扫描器或第二套运行记录。
2. 每个 `(userId, accountId)` 只保留一个系统托管的 `intelligence.sync` 聚合作业。自动化中心
   管账号级总开关、立即检查和聚合历史；内容雷达管来源级启停、频率、采集账号、手动同步及
   来源运行详情。
3. 旧 `benchmark`、`favorites` 作业与内容雷达来源重叠，切换时必须停用并完成生产者对账；
   `self.metrics`、`comments`、`self.detail` 与 `topic.daily` 仍作为不重叠的系统预设保留。
4. 到期发现、持久任务 claim/lease/recovery 与运行投影统一走
   `scheduled_job → job_run → PersistentTaskService → typed handler`。来源同步可以继续使用
   `source_sync` 子任务，但只能由 `intelligence.sync` handler 或用户手动操作创建。
5. 采用 forward-only 方案 A：enforce 后不允许旧二进制直接打开新数据库；故障通过同版本
   hotfix 或更高版本 roll-forward 修复。升级前快照仅作人工灾备，不得自动或静默覆盖当前库；
   恢复前必须停止写入、另存当前数据库并明确提示恢复点之后的业务写入会从恢复库中消失。
6. 本决策不授权云端常驻调度、不新增第三套执行状态机，也不允许为了兼容而保留第二个业务
   timer。

**User confirmation**：用户 2026-07-29 明确确认单一调度架构，并对推荐方案 A 回复“对的”。

**Risk disposition**：`avoid`（删除重复调度）；灾备恢复的数据损失风险通过默认 roll-forward、
禁止自动恢复、恢复前保全当前库和显式确认控制。

**Status**：resolved；解除 T-517 Delta SPEC `R2-01` 的用户裁决阻断，T-598 可进入 CONTRACT /
BUILD Gate。

## DEC-SCHED-001 (2026-07-29) — 项目是唯一排期入口，发布中心以日历承接节奏

**来源**：用户提出“选题 → 项目 → 发布排期”节奏规划，并在查看项目列表与发布中心截图后，
确认采用“项目行排期、发布中心删除重复列表并外移日历、首页待办提醒”的推荐方案。

**决策**：

1. 选题只负责形成内容候选，不直接排期；未发布、未归档项目是唯一排期入口，支持选今天或
   未来日期、改期和取消。
2. 排期真相归 `content-calendar`，必须建立真实 `projectId` 关系；项目不新增第二份发布日期，
   `targetCompletedAt` 不得冒充发布日期，项目名也不得再写进 `note` 冒充关联。
3. 发布中心移除与项目“已发布”重复的历史长表、搜索和筛选，以“过去真实 publication +
   未来项目排期”的月历作为左侧主区域，右侧保留真实表现摘要；旧 `/calendar` 兼容跳转。
4. 首页按排期、项目状态和真实发布事实派生逾期/今日/临近提醒；提醒不可手工完成，不重复写入
   task 或 notification，第一版不进入铃铛。
5. 第一版只选日期，不选时间；用户选定日期不得因时区漂移。排期只作规划与提醒，不自动向
   平台发布。

**User confirmation**：用户 2026-07-29 对完整推荐方向回复“认可”。

**Risk disposition**：`avoid`（避免选题、项目、日历、首页各存一份日期，以及发布中心/项目
双库存）；存量自由 entry 采取兼容展示和可审计补链，不猜测、不破坏性删除。

**Status**：confirmed；T-599 进入独立 SPEC 评审，CONTRACT / BUILD 尚未授权。

## DEC-AUTO-002 (2026-07-29) — 自动化中心只保留四个不重复的产品任务

**来源**：在 T-598 完成单一调度架构后，用户确认自动化任务语义继续收口，不向用户暴露
仅用于历史兼容、且与主采集任务调用同一 collector 的 `self.detail`。

**决策**：

1. 用户可见任务固定为“我的作品数据同步、我的作品评论同步、内容雷达自动同步、每日自动生成
   选题”四个。
2. `self.detail` 不再进入新账号 bootstrap、创建模板或自动化列表；存量 job 统一停用，
   `job_run` 历史保留用于排障和审计。
3. 作品后台明细能力不删除：`self.metrics` 继续复用既有 visible-only canonical collector，
   只删除重复的调度语义和入口。
4. `benchmark/favorites` 延续 DEC-AUTO-001：只保留历史兼容，不恢复为自动化任务。

**User confirmation**：用户 2026-07-29 对四任务口径明确回复“认可”。

**Status**：resolved；T-600 可直接按 T-598 既有 CONTRACT 做兼容任务退役。

## DEC-SCHED-002 (2026-07-29) — 排期复用共享契约与真实数据库，不建立 UI 日期副本

**来源**：T-599 从已确认 PLAN 进入 CONTRACT；项目、发布中心与首页需要共同读写项目排期。

**决策**：

1. 命中 `PAT-004` 的 CF-001/002/004：扩展现有 content-calendar Zod resource 与公开 operation，
   不在三个前端表面各写日期类型，也不新增 project schedule endpoint。
2. 命中 `PAT-002` 的 RF-001/002/004：排期是用户持久数据，依赖 active unique、ownership 与
   正规 migration，继续使用现有 Postgres/PGlite 同构 Drizzle 路径，不用内存状态。
3. 持久增量严格限制为 `project_id + planned_date`；旧 `planned_at` 只作兼容锚，产品显示与
   提醒只认 date-only `plannedDate`。
4. 真实发布仍归 publishing；公共 calendar transition 禁止手工写 `published`。

**Pattern-Ref**：PAT-004、PAT-002。

**User confirmation②**：用户于 2026-07-29 回复“确认”，授权按已评审 CONTRACT 进入 BUILD。

**BUILD 编号协调**：共享工作树中的 T-600 已占用 migration `0060`，T-599 顺延使用
`0061_project_schedule_calendar.sql`；只调整迁移文件序号，不改变 schema、数据归属或确认范围。

**Status**：confirmed；CONTRACT 独立 Round 2 评审 PASS，BUILD 已授权。

## DEC-CR-017 (2026-07-29) — 人工上传逐字稿复用当前作品的唯一逐字稿真相

**来源**：用户在内容雷达作品详情截图中明确要求“这里的逐字稿支持人工上传”。

**决策**：

1. “上传逐字稿”与“手动转写”并列，首批支持 UTF-8 `.txt/.md/.srt/.vtt`；浏览器只读本地
   文件并规范化正文，原文件不离开本机、不进入对象存储或第二套文件资产。
2. backend `intelligence` service 继续是逐字稿唯一写者；上传正文写入当前作品既有
   `ItemTranscript`，成功即为 `done/source=manual`，可直接进入现有拆解与选题生成。
3. 禁止覆盖 `done` 或 `queued/running` 的逐字稿；相同已完成正文的重试只返回既有资源，
   不同正文明确拒绝。由此避免改写已被选题或 Project 固定引用的来源证据。
4. 客户端按真实 `File.size` 拒绝超过 2 MiB 的文件；backend 不接收原文件，按收到的规范化
   正文重新计算 UTF-8 字节数并执行 2 MiB 上限，同时限制 500,000 字符。输入为空、乱码、
   任一上限超限、格式不支持或跨账号时零写入并给出可行动错误。取消文件选择零写入。

**Pattern-Ref**：PAT-004（跨 frontend/backend 的 typed contract）；持久化继续复用现有
Postgres/PGlite transcript 行，不命中新增存储方案。`MOD-001` 不采用，因为原文件不需要远端
保存。

**User confirmation**：用户 2026-07-29 明确提出人工上传入口，授权该产品增量。

**Status**：confirmed；T-603 须完成独立增量评审后才能 BUILD。

## DEC-CR-018 (2026-07-29) — 逐字稿在首个成功选题候选后永久锁定

**来源**：用户补充要求逐字稿支持粘贴、二次上传覆盖和重新转写，随后明确收敛为“一旦生成
选题了，这个逐字稿就捆绑了，就死了。这不能变了”。

**决策**：

1. 本决策只替代 `DEC-CR-017` 第 3 点的“已完成逐字稿一律禁止覆盖”规则；文件格式、正文
   上限、唯一写者和不保存原文件等边界继续有效。
2. 首个成功选题候选产生前，当前作品的唯一 `ItemTranscript` 可以通过粘贴、文件导入或重新
   转写被替换；产品不增加逐字稿版本表、历史记录或恢复旧稿能力。
3. “成功生成选题”以任一选题 transform 已产生可用 `outputSnapshot` 为准，不以用户确认进入
   选题池为准。候选一旦产生，即使后来取消或不采纳，逐字稿仍永久锁定。
4. 选题生成处于 `queued/running` 时只作临时写栅栏；任务失败、受阻或取消且没有候选产出时，
   逐字稿恢复可修改。
5. backend 必须在人工替换、重新转写和候选落地三处统一校验锁定条件；选题任务固定生成时的
   `transcriptHash`，防止并发替换造成候选与逐字稿错绑。

**User confirmation**：用户 2026-07-29 明确纠正为“一旦生成选题了，这个逐字稿就捆绑了，
就死了。这不能变了”。

**Build confirmation**：用户随后明确回复“你两个一起来实现吧，两个需求”，同时授权筛选排序
与逐字稿纠错/锁定按已记录方案进入实现。

**Status**：confirmed for BUILD；T-622 同一切片完成契约、backend、frontend 与测试。

## DEC-MAUTH-001 (2026-07-29) — 正式 CreatorOS 的模型配置由 Growth 渠道端完全托管

**来源**：用户明确要求 CreatorOS 模型配置从远程拉取、不支持用户自行配置，并进一步授权
CreatorOS 端实施。代码审计确认 T-575 仅完成签名配置拉取，现有设置与 AI runtime 仍读本地
`model_configurations`。

**决策**：

1. 正式渠道构建固定 `managed_locked` 权威；Growth 只控制 profile 与 capability alias，
   不能把正式客户端切回 BYOK。
2. 托管态设置页只读，服务端同步拒绝保存、测试、导入和导出；存量本地配置保留但忽略。
3. 全部模型能力通过 `EffectiveModelConfigPort` 求值，托管态禁止 DB、环境变量和内置云模型回退。
4. 长期 provider Key 永不下发客户端；Creator 只接短期 gateway session 的 typed port。
   上游 exact contract 缺失时默认 adapter 零出网并诚实不可用。
5. 开发/自托管构建默认保持 local，作为明确的构建级回滚；Web、数据库、header 或 Growth
   payload 无权切换正式客户端的权威。

**Pattern-Ref**：PAT-004（CF-001/002/004，跨 Settings/AI runtime/组合根使用 typed port）；
**Asset-Ref**：MOD-002（复用 provider-neutral resolver/adapter，不重写模型 SDK）。

**User confirmation**：用户 2026-07-29 回复“creatoros端的你来实现吧”。

**Status**：confirmed scope；T-604 SPEC/CONTRACT 独立评审通过后进入 BUILD。

## DEC-BOUNDARY-002 (2026-07-29) — Activity 最小运行快照不等于业务权威

**来源**：用户在评估 pure activationRef 全量迁移成本后，确认采用兼容折中方案，并要求把
产品边界写入项目，避免后续再次跑偏。

**决策**：

1. Activity 保留现有 project/channel 授权字段并继续负责激活码、设备、期限、撤权、签名和
   防重放；这些字段只是 Growth 下发的 opaque 运行快照，不要求现有用户重激活。
2. Growth 唯一解释范围标签对应的渠道、代理、客户、产品、应用目录、协议和模型配置。
3. CreatorOS 先取得 Activity 当前签名授权，再把凭证交给 Growth 获取配置；不得自报
   `projectKey/channelRef/clientId`，不得让本地缓存覆盖服务端撤权。
4. Activity 的 ticket/内省不得携带 `clientId`、应用目录或模型/商业字段；CreatorOS 只接受
   current v2 closed wire，并只信任 Growth-signed bundle 中的应用身份和配置。
5. pure activationRef 作为未来独立 breaking migration 保留，不在 T-606/T-620 删除字段、
   重发激活码或引入双协议。

**Status**：resolved；进入 T-620 增量复核和 BUILD。

## DEC-RCN-020 (2026-07-31) — 历史作品重建必须以真实逐字稿为执行前置

**来源**：飞书反馈 `rec27TB16PMMin` 的真实日志。40 条公开历史作品导入后，系统同时排
`transcribe.douyin` 与 `reconstruct.project`，后者先执行并统一因“D3 尚未绑定”失败；对话区
又逐任务显示失败，形成通知风暴。

**决策**：

1. 初始化重活仍只维护一套采集编排，但重建排队增加真实逐字稿门禁；图集占位锚不满足门禁。
2. `transcribe-runner` 在真逐字稿成功绑定后，通过组合根注入的后续端口立即、幂等地排对应项目
   重建；后续排队失败只告警并由下一轮补偿，不反向污染转写终态。
3. `reconstruct.project` 同一原因的批量失败按语义跨轮聚合为一张通知并显示真实数量；用户主动
   创作任务仍逐条展示。
4. 侧栏在短高度窗口把导航变为内部滚动区，账号与用户身份作为不可收缩底部区保留；AI 助手/
   存储提示卡属于次要信息，短高度时隐藏。

**数据与架构边界**：不新增表、不改 artifact 归属、不引入第二套任务系统；AI 仍只经既有
`ai.tasks.create` 排队，artifact 仍由 backend service 写入。

**User confirmation**：用户要求查看飞书最新日志并修复截图中的重复错误与低分辨率布局问题。

**Status**：confirmed for BUILD；由 T-638 承接。

## DEC-ASR-021 (2026-07-31) — 历史作品全量保留，逐字稿小批补齐，云端 ASR 必配

**来源**：用户明确确认“全部采集没问题，就慢慢采集”，同时要求 ASR 模型改成必配，并调研、
接入飞书反馈中的小米 MiMo 性价比方案。

**决策**：

1. 作品、指标与公开状态继续走唯一统一采集链全量入库；逐字稿不新建第二套自动化，只在该链
   尾部每轮最多补 5 条，成功后下轮幂等跳过，失败可后续补偿。
2. 用户手动单条提取保持高优先、不中断；重建仍以真实逐字稿为前置。
3. `transcribe.audio` 改为必配。未配置时后台排队前停止，手动任务返回设置指引，不再把普通用户
   无感知地切到本地 Whisper。显式旧配置仍保留兼容。
4. 小米 MiMo 作为独立 `xiaomi-mimo` provider，固定官方预设 model=`mimo-v2.5-asr`、
   baseUrl=`https://api.xiaomimimo.com/v1`；因协议是 `chat/completions + input_audio`，不得映射
   到既有 `/audio/transcriptions` multipart adapter。
5. MiMo 单次 base64 音频上限由内部 MP3 帧切分处理，不通过限制用户视频大小规避。
6. 设置页普通路径只要求选择 ASR 供应商、确认模型名和填写 Key；provider/baseUrl 进入高级设置。

**数据与架构边界**：不新增表、不改数据归属、不新增公开契约或调度器；AI 结果仍经 backend
service port 落库。

**Status**：confirmed for BUILD；由 T-639 承接。

## DEC-ASR-022 (2026-07-31) — ASR 是建议配置，未配置时回退本地 Whisper

**来源**：用户纠正 DEC-ASR-021 的“必配”表述：ASR 应放在设置页重点模型配置区并解释配置收益，
但不能成为使用门槛；用户未配置时仍应允许本地 Whisper 完成转录。

**决策**：

1. 本决定替代 DEC-ASR-021 第 3、6 条中的“云端 ASR 必配/未配停止排队”语义；其余渐进回填、
   MiMo 独立协议和长音频分段规则继续有效。
2. `transcribe.audio` 的解析顺序为“有效用户云端配置优先；完全未配置则 `whisper-local`”。显式
   云端配置存在但无效时仍诚实报错，不允许用本地回退掩盖配置错误。
3. 后台渐进回填与手动单条转写都可在未配置云端 ASR 时继续执行，不再把缺少云端配置当排队闸。
4. 设置页继续把 ASR 放在重点模型配置区，统一使用自然语言提示：“建议配置 ASR 转录模型，
   避免本地转录时间过长。未配置时仍可使用本地 Whisper，但处理较慢。”

**数据与架构边界**：不新增表、公开契约或调度器；只纠正解析默认值、排队条件和用户可见语义。

**Status**：用户已确认，T-641 进入 BUILD。

## DEC-COPILOT-023 (2026-07-31) — 项目引用绑定 ID 后只走单项目读取链

**来源**：用户指出 Copilot 的 `@` 引用展示冗长，且已选中具体作品后仍读取 49 条项目库并翻页查找，
质疑为何不直接透传作品 ID 调单条查询。

**决策**：

1. `@` 仅承担项目选择；可见正文不再复制完整 `@标题`，上下文标签改为“项目 · 短标题”。
2. 可信 `chatContext.projectId` 是当前引用对象的唯一权威。绑定后单项目工具缺省使用它，模型入参
   不能改绑到其他项目。
3. 绑定项目的回合不暴露 `context.projects`；直接复用现有 `context.project.detail`、
   `context.artifacts`、`context.artifact.text`，不新增平行 repo、operation 或数据库读路径。
4. 单项目档案保持有界，长正文继续窗口读取；这不是把“所有数据”无上限塞给模型。

**Status**：用户已确认，T-642 进入 BUILD。

## DEC-LICENSE-001 (2026-08-01) — 当前客户端只保留 Activity 激活码直接授权

**Decision**：CreatorOS 当前商业激活主线只有“用户输入激活码→Tauri `license_activate` 直连
Activity→Activity 校验、设备绑定并签发授权→本机保存→按可信 `channelRef` 拉取 Growth 渠道
配置”。不得要求用户登录 Growth、兑换商品、批准 entitlement claim 或再次生成授权。

既有 entitlement claim 实现暂不物理删除，作为未来订单权益场景的候选能力保留，但必须退出当前
导航、激活页面和发布验收；T-575 的渠道配置与问题反馈范围继续有效，用户权益领取 UI 由 T-643
接管并按本决定收口。

**Rationale**：当前核心商品就是激活码。把未来订单权益抽象提前暴露给用户，产生了没有经营价值的
第二次领取动作，也让同一个码被误解成兑换码、权益码和授权码三种东西。

**Status**：用户已确认，已创建 T-643；跨仓权威见 Growth `DEC-116/T-129`。

## DEC-PID-001 (2026-07-30) — CreatorOS 正式包只认 Growth 商品的构建期产品身份

**来源**：用户要求 Growth 创建产品、Activity 和产品客户端绑定同一个产品标识，并把日常操作
统一收口到 Growth Admin。

**决策**：

1. CreatorOS 正式包的 `projectKey` 固定由受控构建变量写入，当前唯一值为 `creatoros`。
2. `projectKey` 是公开产品身份，不是 secret；Growth→Activity 服务密钥永不进入 CreatorOS。
3. 正式运行时不得通过环境变量切换 `projectKey` 或关闭 Activity 严格签名校验。
4. release workflow 删除历史 `test` 项目标识；缺少合法产品身份时 fail closed。
5. entitlement claim 在跨仓真实 program gate 通过前保持默认关闭，不能用 workflow hardcode
   绕过发布准备度。
6. 既有 license-hardening `[gate-F2]` 的 runtime 弱验签只保留给 debug/`tauri dev`；
   `release`、`release-fast` 及所有可分发安装包中的 downgrade 权威被本决定废止。
7. 本地 identity receipt 只证明 T-635 BUILD，不授权开启 claim；生产启用必须绑定三仓实际
   release commit、HTTPS 部署、正式密钥和 live entitlement journey 的 T-575 program-gate GO。

**影响**：新增 T-635；收紧 T-575 正式发布身份，不改变现有一次性 claim、配置 pull 或产品反馈
契约。

**Status**：confirmed scope；SPEC 独立评审通过后进入 BUILD。

## DEC-MODEL-024 (2026-08-01) — 普通设置只暴露四类用户可理解的模型能力

**来源**：用户确认模型配置过多会增加理解和使用成本，并要求采用最低风险方案：只隐藏不需要的
配置入口，不删除底层代码、配置或兼容逻辑。

**决策**：

1. 普通设置页只展示文本模型、ASR 转录、文生图和文生视频。
2. 隐藏 `web.search`、`knowledge.search.embed`、`asset.classify`、`script.review`、
   `chat.fallback` 五张技术能力配置卡。
3. 不删除 capability、数据库行、历史密钥、模型解析或回退链；已有配置与渠道托管配置继续生效。
4. 清除指向隐藏配置卡的用户引导；发生能力降级时只说明真实结果，不要求普通用户理解内部路由。

**Status**：用户已确认，T-645 已按纯展示层收敛实施。

## DEC-AI-025 (2026-08-01) — 创作型 AI 工具结果优先、分段生成、局部修复

**来源**：内容雷达“逐字稿拆解→选题卡→改写稿”实测中，单次复杂结构化调用耗时
68–77 秒后因 `output_invalid` 整体失败。用户明确要求：这类内容不需要达到 100% 准确才允许
输出，应先给出可用结果，再由用户或后续步骤优化；同类工具统一排查。

**决策**：

1. 长文本创作、策划和改写类工具采用“结果优先”：拆成能独立展示的阶段，每阶段完成即通过
   backend service port 保存检查点；后段失败不删除前段结果。
2. 内容完整性与内容可见性解耦。非关键字段缺失、长度偏差或表达质量不足可以展示并允许编辑；
   只有采纳、发布、正式落库等副作用动作继续执行确定性完整性门槛。
3. 长稿正文优先使用流式/纯文本生成与最小非空校验，不再把长稿和多个复杂对象塞入同一个
   JSON schema。结构化阶段只保留真正需要机器消费的最小字段。
4. 禁止 SDK 自动重试、文本 fallback、阶段重试和整链重试叠加。创作型阶段默认一次主调用，
   可有一次解析降级；用户重试只从失败阶段继续。
5. 判断、评分、安全、归属和执行参数等控制型工具不适用“缺字段也当有效”。它们继续严格校验，
   但必须减少重复调用、记录字段级失败原因，并按单项跳过或明确失败，不能伪造结论。
6. T-642 作为首个落地链路；T-646 负责全项目审计、分级清单和后续治理顺序。不得在未审计
   消费端语义前全局放松 `runStructuredNode`。

**数据与架构边界**：不让 AI 直接写库，不新建第二套任务系统；阶段检查点仍由现有 backend
service 写入现有 JSON 快照。公开契约变化另行按实际需要评审。

**Status**：用户已确认；T-642/T-646 进入 BUILD 与审计。

## DEC-POS-652 (2026-08-01) — 定位前采对所有账号必经，选择优先，正式母版延迟切换

**来源**：用户要求重新设计定位前采：无论账号有无作品或历史内容是否混乱，都应通过调查
问卷帮助用户找定位；作品只作辅助，并允许从零开始。用户随后确认采用 SPEC 方案，并强调尽量
让用户通过多个选项完成回答。

**决策**：

1. 所有账号创建或重做定位时都先完成同一套六主题核心前采；历史作品数量只影响证据与追问，
   不再决定是否跳过访谈。
2. 用户先选择“沿用并优化 / 明确转型 / 从零开始”。从零开始时，旧定位和旧作品不进入候选
   生成上下文；系统不得按历史数据偷偷改变用户选择。
3. 访谈采用可见选项卡/chips 优先：互斥问题单选，目标、资源、形式和边界支持多选；每题保留
   “其他”“暂不确定”和非关键题“跳过”，自由输入只用于补充现成选项表达不了的事实。
4. 历史作品按代表样本读取，不等待全量逐字稿；联网资料与作品分析都作为带来源证据，用户可
   采纳、仅参考或移除。
5. 前采先生成 2～3 个可比较的定位方向。AI 只产候选，用户采纳后才经 positioning backend
   service 追加版本并切换正式母版。
6. 重新定位期间保留当前母版继续服务下游；“从零开始”表示不继承旧证据，不表示点击即破坏性
   清空。确需立即清空时使用独立的“停用当前定位”。
7. 联网调研只发送用户可见、可编辑的一条关键词检索或公开问题，用于补充行业、受众或 IP 参考；
   不得发送完整访谈、作品逐字稿、评论指标、旧定位、上传文件或本机路径，结果由用户采纳后才
   进入定位证据板。

**失效语义**：T-623“点击新建即清空再访谈”以及当前提示词“有作品老号不走完整访谈”由本决策
替代；历史快照/恢复、账号隔离和正式母版唯一真相不变。

**Status**：用户已确认产品方向；SPEC 独立评审 PASS（`REV:b990448fbe2d`）；BUILD 已完成，待用户验收。

## DEC-MODEL-026 (2026-08-02) — 当前版本采用渠道公开配置 + 用户本地 Key，托管子 Key后置

**来源**：用户确认中转站母 Key、子 Key创建、充值、额度与用量协议尚未最终落地；当前版本优先
验证激活后白标、渠道链接和公开模型配置，并继续由用户在 CreatorOS 输入自己的 Key。

**决策**：

1. 白标运行时与模型扩展保持独立。渠道只配置品牌/业务链接而不发布模型扩展时，CreatorOS
   继续显示并使用本地模型配置；不得因为存在白标就误判为渠道托管模型。
2. 渠道发布 `credential.source=user_input` 的模型扩展时，Growth 负责签名下发服务、连接、
   模型、协议与默认参数；CreatorOS 设置页把这些公开字段作为只读权威，只允许用户按
   `serviceId` 填写、替换和测试 Key。
3. 一份服务只收一次 Key；同一服务下多个 capability/connection 复用它。若样例配置声明四个
   独立服务，用户就分别输入文本、ASR、生图、生视频四把 Key。
4. 有效渠道公开模型扩展存在但某服务缺 Key时，界面明确提示补 Key；不得静默改用另一套本地
   provider/model。渠道完全没有模型扩展时，才进入完整本地自配模式。
5. 托管子 Key、Growth 充值履约和中转站额度/用量对账继续由 T-653 承接，但等中转站正式协议
   固定后再进入 SPEC/BUILD；本轮不创建回调、不下发子 Key，也不把母 Key带进客户端。
6. `growth-product-config-v1` 组合包当前仍要求 `channelService + productConfig` 同时存在；若只测
   白标，应使用现有渠道 runtime control，不得直接删除组合包中的 `productConfig` 假装兼容。

**Status**：用户已确认当前版本范围；T-645 承接公开配置 + 本地 Key运行时，T-649 承接白标与
链接，T-653 后置到中转站协议确定。

## DEC-MODEL-027 (2026-08-02) — 渠道模型按 capability 独立管控，完整才锁定

**来源**：用户进一步明确：即使产品有四类模型，渠道可能只管其中一部分。例如渠道没有返回
ASR，用户必须仍能自行配置 ASR；其他能力同理。只有渠道完整返回的能力才强制只读，白标缺失
则继续显示官方默认品牌。

**决策**：

1. `default`、`transcribe.audio`、`image.generate`、`video.generate` 分别裁决，不存在整份
   extension 一刀切的“全部渠道/全部本地”。
2. 渠道对某能力给出完整、引用闭合且当前客户端有 adapter 的公开配置时，该能力的公开模型参数
   只读，用户仅填写 service Key；缺 Key不得改走本地模型。
3. 渠道未给、给残、协议未知或 provider 未受当前客户端支持时，仅该能力恢复既有本地配置；
   本地配置不得因其他能力被渠道接管而隐藏或失效。
4. 同一 service 的 Key跨 capability 复用，按用户与可信渠道 scope 加密隔离；切换渠道不得串 Key。
5. 设置页、测试连接、同步/异步实际调用共用同一逐能力判定器，禁止 UI 与运行时口径分裂。

**取代**：本决定取代 DEC-MODEL-026 中可能被理解为“有效渠道扩展存在即整体权威”的表述，并
精确取代 T-606 契约 §2/§4/§5/§8 的整包 authority 语义；bundle 安全边界不变。

**Status**：用户已确认；增量 SPEC 已通过 `PASS[REV:5dfe24b42eb7]`，CreatorOS 本地实现与聚焦
Gate 已通过，正式签名渠道配置安装包 E2E 随下一次统一验收包执行。

## DEC-RADAR-028 (2026-08-02) — 雷达改写稿直接填入项目现有稿面

**来源**：用户验收内容雷达→选题→项目链路时发现，项目制作页仍可能显示空白稿面。用户确认
不为该链路新增一套复杂项目 UI；已经在雷达完成并采纳的内容应直接进入项目，让用户打开项目
就能看到并继续编辑。

**决策**：

1. 雷达 Project 尚无正式 `output_script` 时，现有脚本编辑器直接使用已确认的
   `adaptedDraftSeed`，不要求用户再次点击生成。
2. 右稿可见性与来源逐字稿读取解耦；来源读取失败只降级对照展示，不能把右稿降级为空白。
3. 已有正式脚本版本后，正式 artifact 是唯一正文真相，不再回灌 seed。
4. 选题核心字段继续复用现有 Project 选题卡；拆解、改写策略和事实风险保留在 evidence/reference
   并进入 AI 上下文，本轮不新增占据首屏的大型详情面板。
5. 普通手工选题和普通 Project 保持既有单稿链路，不自动填充雷达内容。

**Status**：用户已确认；纳入 T-642 当前 BUILD 与验收。

## DEC-RADAR-030 (2026-08-02) — Project 取消对标原稿双栏，统一透传一份口播稿

**来源**：用户在本地包验收时发现，Project 脚本页虽然右侧已有改写稿，但左侧对标原稿占据大量
空间且经常因来源读取失败显示空态；切到“制作视频”和调用项目文案审核时又被判断为“没有脚本”。
用户明确要求去掉左侧对比原稿，按既有协议只把已经生成的文案透传到项目各阶段。

**决策**：

1. Project 稿面统一回到单稿编辑器，不再渲染“对标原稿”左栏或移动端双稿页签。
2. 来源逐字稿、拆解、改写策略与哈希仍完整保留在 `contentRadarEvidence` 和不可变 reference，供
   溯源、后续生成和相似性检查消费；本决定只改变 Project IA，不删除证据。
3. 项目当前口播稿采用一个读取协议：已有正式 `output_script` 版本时读取正式稿；尚无正式版本
   时读取 `adaptedDraftSeed`；普通项目两者都没有才显示真实空态。
4. 脚本页、制作视频提词稿、项目文案审核、Project/Copilot 正文读取必须共用该协议，禁止再出现
   同一项目一处有稿、另一处说“产物清单为空”的分裂状态。
5. 用户首次保存后仍只创建一个正式 `output_script` 并进入既有版本链；不新增第二套稿件实体或
   让 AI 在未确认时直接写库。

**取代**：本决定取代 DEC-RADAR-642 / T-642 SPEC 中“Project 展示左原稿 + 右改写稿双栏”的
界面结论；雷达和选题阶段是否展示来源证据不受影响。

**Status**：用户已确认；纳入 T-642 当前 BUILD 与验收。

## DEC-SEC-029 (2026-08-02) — 桌面 verdict 先做可验证的基础加固，不用随机密钥伪造信任根

**来源**：用户询问 CreatorOS 与 VMProtect/WinLicense 的差距，并在明确客户端内置 verdict
签名私钥可被专业逆向提取后确认“先把基本的防护加上”。

**决策**：

1. 立即删除正式 Sidecar 中由环境变量触发的 smoke bypass；打包冒烟必须生成真实短时
   Ed25519 verdict token，和用户安装版走同一验签链。
2. 保留现有本地 verdict token 架构，但不再把 base64 私钥和 `[T451-BOUND]` sentinel 作为
   可定位字符串编进 Rust；改由 `build.rs` 严格解码、随机 mask 封装为 blob，Rust 运行时重组后
   立即清零临时 seed。
3. 增加最终安装产物泄漏 Gate：原始私钥、sentinel 或生产 bypass 任一出现即拒绝出包，且错误
   不回显密钥。
4. 不采用“每次启动随机密钥 + Sidecar 同时接收随机公钥”的伪加固，因为攻击者也能自签一套。
5. 本任务不宣称客户端私钥不可提取；真正移除客户端签名私钥，必须由 Activation Manager/Growth
   签发 purpose-bound 短期票据，并由未来模型中转站在服务端执行授权、额度与撤销终判。

**安全与范围确认**：这是既有安全契约的收紧，不改变用户激活体验、离线政策、数据库归属或公开
API；完整范围与诚实边界见 T-656 SPEC。

**Status**：用户已确认基础加固方向；待独立 SPEC 评审 PASS 后进入 BUILD。

## DEC-POS-031 (2026-08-02) — 定位前采联网默认使用国内中文语境，二次搜索替换未采纳候选

**来源**：用户以“国内智能体”作为可见关键词发起定位前采联网补充，却收到 Cafe Flora、Seattle
餐厅等英文境外结果；同时确认二次搜索不应继续混用上一轮未采纳候选。用户的主要目标客户位于
国内，因此默认检索范围需要与用户语境一致。

**决策**：

1. 定位前采联网补充默认使用“中国大陆 + 简体中文”；用户仍可显式切换为全球或语言不限。
2. 只把用户当前输入的短关键词连同公开地区/语言限定发送到搜索端，不拼接访谈答案、作品正文或
   其他本地资料。
3. 搜索 provider 负责召回，定位领域服务再按关键词相关性、中文内容和国内来源优先级筛选；明显
   无关的英文境外结果宁可不展示，不作为定位证据。
4. 每次搜索替换上一轮未采纳候选；用户已经点击“采用”的证据跨搜索保留，避免二次检索误删用户
   已确认事实。
5. UI 明示当前地区、语言和覆盖语义；空结果诚实提示用户细化关键词或放宽范围。

**Status**：用户已确认国内用户语境；作为 T-652 SPEC §6 的实现纠偏纳入 T-657 BUILD。

## DEC-REL-032 (2026-08-03) — Windows 正式发布恢复 production closure 并设置防退化硬门

**来源**：用户确认 Windows 2026-07-26 的少文件安装包明显快于当前约 1.08 GB 正式包，并要求
恢复当时的打包逻辑、以后统一沿用并重新生成安装包。对比证据证明差异来自正式流水线重新打入完整
依赖树，而不是业务能力增加。

**决策**：

1. Windows 正式发布与候选 RAT 共用仓内唯一的 `build-production-closure.mjs`；正式 job 不再运行
   Windows full `build-sidecar.mjs`。
2. 闭包必须保留 Chromium、ffmpeg/ffprobe、PGlite、ASR、Pi/Hyperframes 与 Next 动态路由等随包
   能力，不允许靠删除用户功能换体积。
3. 正式 NSIS、产品身份、授权验签、混淆/诱饵/版权盖章、Rust 壳 hardening、更新器与 release
   attestation 继续执行。旧 V8 bytecode 步骤因会重新制造 `node_modules`，只在 Windows production
   closure 下暂停；待其改成显式 vendor resolver 后再恢复，不能因此恢复完整依赖树。
4. 正式包设置失败关闭硬门：setup 不大于 600,000,000 字节、运行时不大于 3,500 文件、零
   `node_modules`、零链接/重解析点、安装不超过 300 秒、首次可用不超过 45 秒。
5. Windows 标准安装包只能在安装、首启非白屏和主动卸载全部通过后上传；失败轮只上传诊断证据，
   不能成为可分发工件。

**Status**：用户已确认；纳入 T-675 BUILD 与后续 Windows 默认发布标准。

## DEC-MODEL-032 (2026-08-04) — CreatorOS 展示真实模型并支持白名单内选择

**来源**：用户确认 CreatorOS 终端必须让用户看到实际使用的模型，并在渠道提供多个模型时支持
自主选择，不能只展示营销档位或隐藏真实调用对象。

**决策**：

1. Growth 已验签配置中的 `models[capability]` 是该能力唯一可选白名单；一项只读展示，多项使用
   普通下拉选择。
2. UI 同时显示模型展示名和真实 `model` 标识，不以“快速/高质量”等档位冒充实际模型。
3. 选择按账号、渠道 scope 与 capability 本机持久化；设置页、测试连接和真实调用共用同一结果。
4. 白名单移除既有选择时回退到唯一默认模型并明确提示；前端篡改不能调用白名单外模型。
5. 本决定并入 T-679，与受限子 Key和 Growth 配置消费一起验收，不创建第二套模型设置入口。

**T-679 最新补充（2026-08-04）**：Growth 唯一目标已收敛为一个
`credential.source=activation_managed` 的 `omnihi-main` service；文本、图片、视频三个
connection 共用同一 Activity 权益子 Key。CreatorOS 从 API-265 安全取得子 Key，不显示用户填
四套 Key 的交互；文本模型清单完全按 Growth 已验签数组动态展示和选择，当前为 13 项且
`minimax-m3` 是唯一默认。图片/视频各一项，首期无 ASR。

**Status**：用户已确认；契约已按 T-679 最新目标重派生，CreatorOS BUILD 进行中，真实跨仓 live
HTTPS 联调仍待验收。

## DEC-CONTEXT-033 (2026-08-04) — Copilot 工具层统一补齐项目全生命周期、历史检索与审核改稿闭环

**来源**：用户发现稿面已经采纳并显示 `output_script v6`，Copilot 调用 `context.artifacts` 却得到
`items: []`，继而错误判断“未采纳/没有稿子”；同时确认 Copilot 无法基于单项目读取稿面、分镜、
素材、封面、发布、指标留存与审核报告，也无法在当前项目对话中检索前几期作品。

**决策**：

1. 不另建第二套 Context，也不以接入 Pi 或更换模型掩盖数据缺口；在 T-099 既有 Context 读层内
   补齐一个项目全生命周期的索引、完整度与窗口读取协议。
2. 页面和 Copilot 必须使用同一个经属主校验的账号/项目上下文；权限、账号、数据库或契约错误不得
   再被吞成空列表。`error`、`partial`、`empty` 必须可区分并带 traceId。
3. 当前项目默认直读，不再拉全库重新寻找；用户明确要求“前几期/历史/之前发布”时，允许受限的
   历史项目搜索，并按真实发布时间检索项目及其稿面、封面、发布与指标。
4. 审核报告成为 Context 可读事实。用户明确要求应用审核建议后，由确定性 backend service 校验
   基准版本并追加一个可回滚的新稿版本；AI 仍不直接写库，并发稿面变化必须拒绝覆盖。
5. 系统提示词、工具注册与 JSON schema 建立自动一致性测试；工具不得宣称不存在的“全档”能力，
   模型不得从 taskId 或空列表推断用户是否采纳。

**Status**：用户已确认问题合并范围并要求登记统一任务；T-691 SPEC 已建立，因涉及服务契约与受控
写入命令，须独立评审非 FAIL 后才能进入 BUILD。

## DEC-SEC-034 (2026-08-05) — Growth 配置签名私钥仓库外保存

**来源**：用户授权生成 CreatorOS 渠道配置验签的 key 与 `keyId`，并要求把可复用信息保存到项目文档。

**决策**：

1. 生成独立 Ed25519 32-byte seed，`keyId` 为 `growth-client-config-20260805-01`。
2. 私钥只保存在仓库外、权限 `0600` 的本机文件；项目文档只记录其路径引用，不记录内容。
3. Growth 使用私钥签名；CreatorOS 和 CI 只持有 Base64 公钥与同一 `keyId`。
4. 公开材料写入 Growth 运维文档和 CreatorOS 发布手册；轮换必须先发布信任新公钥的客户端，再切换
   Growth 私钥，避免旧客户端突然无法拉取渠道配置。
5. 真实上线完成权仍属于 J-133 Program Gate，不能用本机签名成功替代真实部署与激活权益回执。

**Pattern-Ref**：none（沿用既有 T-133 Ed25519 服务契约，不引入新架构取舍）。

**Asset-Ref**：none（复用项目内 `ClientConfigBundleSigner` 与公开材料导出脚本）。

**Status**：用户已确认；T-697 已生成并验证材料，等待生产环境注入和真实 J-133 回执。

## DEC-MODEL-035 (2026-08-05) — 授权放行与渠道模型作用域完整性分开判定

**来源**：真实渠道激活成功后，Activity 的已签名响应缺少 `channelRef`。CreatorOS 因而无法构造
渠道作用域，却把下游错误吞掉并在设置页继续提示本地配置，造成“激活成功但受管模型无声失效”。

**决策**：

1. 授权放行不等于渠道身份完整；缺签名 `channelRef` 映射为稳定、脱敏的
   `activation_scope_missing`，不得伪造默认渠道，也不得因此否定已通过的产品授权。
2. 缺作用域时在任何 ticket/bundle/credential 请求前失败关闭，保留既有数据不改写；Rust、
   sidecar 与本地 route 只记录有限枚举的阶段、原因、触发源和状态。
3. 设置页显示明确阻塞原因与真实恢复动作：先调用 Rust `license_check` 重新校验 Activity 已签名
   权益，再重试本地配置同步；成功后刷新服务端渲染 authority。
4. 本地手工模型仍作为独立能力存在，但不再被文案描述为缺渠道身份时的正常解决方案。

**Pattern-Ref**：none（细化既有 T-679 fail-closed 与签名 identity 契约）。

**Asset-Ref**：none（复用现有 Rust 授权链、本地可信 route 与设置页 authority 卡）。

**Status**：用户已确认；纳入 T-701 独立 BUILD 与提交，不包含打包或发布。

## DEC-REL-036 (2026-08-05) — 多渠道独立品牌壳、集中签名与共享 Runtime 增量更新

**来源**：用户确认未来会有 N 个渠道需要专属应用名、图标与链接，希望只提供渠道资料即可自动
出包，并要求把增量更新正式落地；2026-08-05 对 T-694 的五项发行与安全决策逐项确认。

**决策**：

1. CreatorOS 统一集中签名，渠道方不持有更新私钥。产品级 Ed25519 release root 已在本机仓库外
   生成；私钥路径为
   `/Users/zyongzhu/.config/creatoros-release/keys/creatoros-update-root-20260805.pem`（权限 `0600`），
   公钥路径为同目录 `creatoros-update-root-20260805.pub.pem`，`keyId` 为
   `creatoros-update-root-20260805-01`，DER 公钥 SHA-256 为
   `54f51d62d88b4bf429acef9a21d869a9a0957e1695d79938c00bff7e869f8a4c`。仓库、构建日志和发布证明
   只允许出现公钥、指纹与路径引用，禁止出现私钥内容；该 root 只签 release keyset/package
   envelope，不与 Tauri updater minisign key 共用。
2. 每个渠道使用独立品牌壳和独立 OS 身份/数据/Keychain/更新命名空间，CreatorOS 公共 Runtime
   在所有渠道间共享；渠道授权仍由 Activity 已签名 `channelRef` 与包内 `expectedChannelRef` 校验。
3. 第一版更新源采用静态 CDN/对象存储，不建设更新后台。托管服务必须通过 HTTPS、Range、ETag、
   Content-Length、固定 origin 与重定向拒绝探针；阿里云 OSS/COS/Edge CDN 只在真实 endpoint 通过
   探针后启用，产品名称本身不视为兼容证据。
4. Windows Runtime 从安装目录安全迁入包级 `appDataDir`；迁移、健康检查或切换失败时保留旧版
   可启动，绝不清理数据库、授权、模型 Key、浏览器登录态、项目、知识或素材。
5. `packageRef/appIdentifier/keychainService/Windows UpgradeCode` 首次正式确认后写入
   `identity.lock.json` 并保持不可变；品牌文案、图标和业务链接可按新清单重新出包。

**Pattern-Ref**：none（采用 T-694 已通过独立评审的发行契约）。

**Asset-Ref**：none（复用 Tauri v2 updater、现有 release.mjs 与 runtime 打包链，新增确定性分块层）。

**Status**：用户已确认；T-694 获准进入 BUILD。静态托管的真实域名、桶路径和凭据尚未提供，只阻塞
真实上传/发布验证，不阻塞本地实现、dry-run、签名链和 hosting probe。

## DEC-VIDEO-037 (2026-08-05) — 视频制作画幅由本次制作选择，成片采纳后仍可版本化再制作

**来源**：用户确认制作视频时需要选择横屏或竖屏，并要求已经生成、预览或采纳进素材库的成片
不能锁死后续制作，仍须支持重新分镜与重新生成。

**决策**：

1. 制作页提供竖屏 `9:16` 与横屏 `16:9` 二选一，初值复用项目画幅；选择作为本次制作 revision
   的输入，不反向篡改历史分镜或历史成片。
2. 同一 orientation 必须进入 `video.decisions` 构图 facet、`VideoRenderProps.delivery`、预览比例和
   export resolution/aspectRatio；竖屏使用现有上半屏主体/下半屏信息区与字幕安全区，横屏复用现有
   左右分区，用户录屏/截图继续 `contain` 完整展示。
3. Production `ready` 与 execution/asset 已采纳均不是终态锁。制作页始终允许“重新分镜”和“按当前
   分镜重新生成”，每次新建 task 与 editing plan revision，旧任务和旧 asset 保留。
4. 新候选在用户采纳前不得替换项目当前成片；重新制作期间当前可用成片继续可见，符合既有
   preview → confirm → asset gate。

**Pattern-Ref**：none（复用既有 T-290 横竖屏布局和 T-703 版本化确认门）。

**Asset-Ref**：`video-editing` skill（口播主时钟、用户素材 contain、横竖屏安全区、预览门）。

**Status**：用户已确认；并入 T-703 BUILD 与本地包验收。

## DEC-REL-038 (2026-08-05) — macOS 正式流水线强制 Developer ID 签名与 Apple 公证

**来源**：用户明确要求把本机已具备的 macOS 证书与公证凭据接入 GitHub 流水线，同时要求本轮
只修改流水线，不触发远端运行。

**决策**：

1. `desktop-release` 的 macOS 正式 job 从 GitHub Actions Secrets 读取 Developer ID P12、P12
   密码、Apple ID 与 app-specific password；Team ID 和完整 signing identity 使用 Variables。
   缺任一配置立即失败，不再允许未签名/未公证的 macOS 正式工件进入 artifact。
2. CI 只在 `$RUNNER_TEMP` 创建一次性钥匙串和 `notarytool` profile。P12、密码和私钥不得进入
   仓库、缓存、artifact、release manifest 或普通日志；job 结束时无论成功失败都删除临时材料。
3. sidecar Runtime、Tauri App 与 DMG 使用同一 Developer ID 身份；Runtime cache key 纳入公开证书
   SHA-256 指纹，证书轮换后必须重建，禁止复用旧签名缓存。
4. 上传前必须同时通过 release manifest `signed/notarized` 证明、strict codesign、DMG 完整性、
   staple、Gatekeeper、挂载后内层 App 签名以及既有真实启动门。Windows Authenticode 保持独立任务，
   不因本决策被冒充为已完成。
5. 本轮只落代码、测试和运维说明，不执行 `workflow_dispatch`、tag push 或任何远端发布。

**Pattern-Ref**：`docs/superpowers/specs/2026-08-04-channel-package-factory-and-incremental-update.md`。

**Asset-Ref**：本机证书/公证凭据只作为 GitHub Secrets 的运维输入，文档不记录其值。

**Status**：用户已确认；纳入 T-709 BUILD，本轮远端流水线保持未运行。

## DEC-AI-039 (2026-08-06) — 通用智能体的语义选择统一归 Skill，确定性代码只守边界

**来源**：T-712 修复“用户上传素材未进入成片”时，一度用文件名 token、coverage 与 Jaccard 在
代码中给素材匹配场景。用户明确指出 CreatorOS 是通用智能体，匹配应复用现有素材匹配 Skill，
不能针对当前案例写死。

**决策**：

1. 意图理解、内容归类、素材/场景匹配、创作角度与画面取舍统一由可配置 Skill/模型负责；业务
   runner 不得用词表、关键词分数、字符串相似度或业务名称分支替代 AI。
2. 确定性代码只负责上下文归属、真实 ID、类型、范围、时间边界、幂等、安全和用户明确选择的
   落实；AI 仍只产候选，不直接写领域实体。
3. 视频链路中 `video.broll` 只规划画面需求，`material.match` 读取口播、场景、画面需求与真实
   项目素材，由 AI 返回 `assetId / sceneIdx / at / durationSec / reason / presentation`；其中
   `presentation` 决定 `full_frame / large_stage / overlay`，匹配失败保留人工指定，
   不阻断成片。
4. 确定性相似度若用于去重、协议纠错、输入恢复或安全校验，必须标记
   `SEMANTIC_BOUNDARY_ALLOW:` 并用测试证明没有参与创作选择。
5. 新增语义边界门卫并纳入 reconcile；当前门卫既扫描高风险启发式，也验证视频主链真实调用
   `material.match`，避免未来再次旁路 Skill。

**Status**：用户已确认；项目规则、架构图纸、教训账本与 T-712 实现同步生效。

## DEC-CREATION-040 (2026-08-08) — 退役独立“论点骨架”，历史数据只读保留

**来源**：用户认为项目稿面的“论点骨架”不是必须能力且造成冗余；T-725 完成跨 UI、Copilot、
AI task、写稿上下文、制作素材和历史 artifact 的影响调研后，用户明确回复“这个交给你来操作吧”。

**决策**：

1. 项目主链收敛为“准备素材 → 直接写稿”，退役论点骨架面板、“立论点”入口和
   `planning.thesis` 用户能力。
2. 新任务、新候选、新 artifact version、项目重建、写稿上下文和制作素材均不得再生成或消费
   `thesis_tree`；不能只隐藏 UI 后让旧树暗中影响新结果。
3. 历史 `thesis_tree` artifact/version、旧脚本、旧成片和任务不删除、不迁移、不改写；保留
   generic artifact 只读解析兼容，第一轮不物理删除枚举。
4. 写稿继续直接消费定位、选题、项目 Brief、用户资料、项目素材和内容雷达证据；制作继续消费
   脚本点名与项目 `materialLinks`，不得因退役 thesis 来源丢失项目素材。
5. 原论点树词面相似度预挂素材路径随能力退役而不可达；后续素材语义选择继续归
   `material.match` Skill/模型。

**Pattern-Ref**：none（删减已确认流程，不引入新机制）。

**Asset-Ref**：现有项目 Brief、project materials、`material.match` 与通用 artifact 历史读取。

**Status**：用户已确认；T-726 需通过独立 SPEC 评审后进入 BUILD。

## DEC-CREATION-041 (2026-08-09) — 恢复可选论点骨架，但只有显式采用才进入写稿

**来源**：T-726 上线方向确认后，有用户反馈“立论点”对复杂观点仍有帮助；用户进一步确认本次先
恢复固定四栏 UI 和适用场景引导，分场景框架以后再做。

**决策**：

1. 稿面恢复“论点骨架（可选）”以及真实的 AI 生成、编辑和保存能力；同时提供“跳过，直接写稿”，
   任何写稿、逐字稿导入、审核和制作都不以论点存在为前提。
2. 只有用户明确点击“采纳并用于写稿”后，当前 `thesis_tree` version 才写入
   `scriptBasis.status=adopted`；生成式写稿只读取带该标记的当前版本。历史无标记树默认零消费，
   用户可以查看后重新采用，也可以随时停止使用。
3. T-727 完整逐字稿的 `verbatim` 路径继续逐字保真，不读取论点、定位、Brief 或创作建议；显式
   采用的论点只影响后续 `script.draft(generate)`。
4. 恢复 `planning.thesis` 时删除旧 runner 的 token/Dice 素材预挂逻辑；制作/B-roll 继续不读取
   `thesis_tree`，项目重建不替用户生成或采用论点。
5. 本次固定“核心论点/支撑依据/证据/反驳”四栏，不做行业模板、字段改名或任意结构。分场景与
   自定义框架另记 T-731。

**Pattern-Ref**：DEC-AI-039（语义归 AI，代码只守边界）。

**Asset-Ref**：现有 `planning.thesis` 结构化模板、AI candidate 确认门、generic artifact version
追加链和受管文本模型解析。

**Status**：用户已确认；T-730 需通过独立 SPEC 评审后进入 BUILD。

## DEC-SUPPORT-042 (2026-08-09) — 激活清理工具保持纯本地且只服务内部开箱

**来源**：用户要求为已经绑定永久激活码的官方 CreatorOS v1.0 设备提供二次输入新码的清理工具，
并进一步明确不希望工具暴露激活服务器地址或引入复杂远端能力，最好只做本地激活清理。

**决策**：

1. 工具仅供内部开箱、客服换码和重复验收使用，不进入 CreatorOS 设置页，不提供普通用户自助入口。
2. 工具不包含激活服务器地址、不导入网络模块、不调用任何激活、解绑或换绑 API；输入新码仍由
   CreatorOS 主程序在重新启动后按既有授权流程完成。
3. 只允许精确处理本机激活快照、防回拨冗余点、过期渠道配置缓存和未完成的本地权益领取记录；
   数据库、项目、素材、账号、模型密钥、`machine-id`、`.master-key` 和工作区全部保留。
4. macOS 与 Windows 共用同一白名单脚本和 dry-run / 二次确认 / 运行中拒绝 / 清后验真机制；
   Windows 本轮只支持官方 CreatorOS，不猜测渠道包目录或共享状态。
5. 本工具不改变产品、服务契约、数据归属或发布流程，不作废任何既有阶段；测试必须静态断言源码
   不含 URL 或网络调用，并覆盖双平台防误删和幂等行为。

**Pattern-Ref**：none（复用 T-728 已验证的激活白名单，不引入新的远端或产品机制）。

**Asset-Ref**：`.agents/skills/reset-creatoros-activation/`、`tools/reset-creatoros-activation.mjs`。

**Status**：用户已确认；纳入 T-746 BUILD。
