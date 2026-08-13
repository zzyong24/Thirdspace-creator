# CreatorOS 任务看板(BACKLOG)

> **单一执行真相。每个会话必读(SessionStart hook 自动注入)。** 规则见 `CLAUDE.md` 的「任务流程铁律」。
> 状态:📋 待办 · 🔨 进行中 · ✅ 完成 · ⏸️ 搁置 · ⛔ SPEC 审核 FAIL(没过审不准开工)。
> 读取顺序:**本看板 → 任务引用的 SPEC → 代码**。
> 铁律:需求即任务(提了就建);开工从看板顶取;做完改状态+提交;**禁止 P0/P1 分级、禁止多阶段执行**,任务清楚即起 Workflow/并行 subagent 一次做完。

## 🔨 进行中 / 📋 待办(按执行顺序,从上往下取)

| ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话 |
| --- | --- | --- | --- | --- | --- | --- |
| T-810 | 安全恢复本机被隔离的 CreatorOS 数据库【用户授权·2026-08-13】 | 🔨 待办 | — | 待验 | [T-809 诊断](docs/research/2026-08-13-local-creatoros-data-quarantine-diagnosis.md) · [恢复报告](docs/research/2026-08-13-local-creatoros-data-recovery-report.md) | 用户明确授权开始恢复：正常退出 CreatorOS 并确认所有句柄释放；分别备份当前新库和 111 MB 隔离旧库、记录 SHA-256，原件不修；只在旧库副本上离线检查和修复，核对关键业务表与关联完整性；验证通过才把当前库保留为回滚副本并切换到恢复库，启动 CreatorOS 做真实读取复核。任何校验失败立即停止且不替换当前库；不修改产品代码、不删除任何数据库副本。 |
| T-809 | 只读排查本机 CreatorOS 数据“都掉了”【本机数据保全·用户 2026-08-13】 | ✅ 待办 | — | — | [脱敏诊断报告](docs/research/2026-08-13-local-creatoros-data-quarantine-diagnosis.md) | 不启动应用、不迁移、不修库、不复制/移动/删除用户数据；只读盘点 macOS 各 CreatorOS/渠道 bundle 的 appDataDir、PGlite 数据库、工作区重置归档、损坏隔离目录、资产目录与安全日志，核对当前安装包实际读取的数据根和关键业务表行数，区分真删除、读错目录、身份/账号过滤、归档待恢复或数据库打开失败；确认根因后再单独征得恢复写入授权。 |
| T-808 | 给整稿分镜脚本 150 秒长调用上限并让不支持结构化响应的模型直走兼容模式【用户确认·2026-08-13】 | ✅ 待办 | — | — | [T-807 日志诊断](docs/research/2026-08-13-startup-60s-and-script-draft-timeout-log-diagnosis.md) · [验证报告](orchestrator/T808-VALIDATION.md) | 基于 8 月 13 日真实日志，把 `script.draft` 的单次模型调用上限独立设为 150 秒，保留其他结构化节点默认 90 秒和视频长节点 120 秒；模型工厂对明确不支持结构化输出的模型标记能力，`runStructuredNode` 在第一次请求前直接选择文本 JSON + 同一 schema 校验的兼容协议，不再先发必然不兼容的结构化请求；支持显式 opt-in，补红→绿、协议路径、调用次数、超时边界和现有回退回归，不改提示词、模型选择、扣费、UI 或发布包。 |
| T-807 | 诊断 8 月 13 日旧包 60 秒启动与“分镜决策失败”日志【用户日志·2026-08-13】 | ✅ 待办 | — | — | [诊断报告](docs/research/2026-08-13-startup-60s-and-script-draft-timeout-log-diagnosis.md) | 只读解密用户提供的独立启动日志与日志压缩包，对照当前源码和历史提交，确认 60 秒启动门是否仍存在、所谓“分镜决策失败”对应的真实任务、调用耗时与终止原因；保全脱敏证据，不修改产品代码、模型配置、用户数据或发布包，修复另按确认执行。 |
| T-806 | 向用户提供脱敏原始错误，并禁止编导无证据归因“系统有问题”【用户纠偏·2026-08-13】 | ✅ 待办 | — | PASS:c416db3e3d51 | [验收契约](orchestrator/T806-FRONTEND-JOURNEY.md) · [验收报告](orchestrator/T806-FRONTEND-VALIDATION.md) · [沿用 T-805 恢复体验](orchestrator/T805-FRONTEND-JOURNEY.md) | 修正 T-805 过度人话化：视频分场等失败卡先说明影响和续跑动作，再直接展示可复制的原始错误（只脱敏密钥、Token、私有 URL 等秘密，不吞 HTTP 状态、模型返回或节点原因）；任务终态保存同一脱敏原因供对话真值使用。编导只有在任务错误、工具结果或状态真值明确证明时才能归因系统/平台/配置故障；没有证据必须说原因未确认，不得用“系统有问题”搪塞。补刷新、紧凑窗口与注入防泄漏验证；不改扣费、模型、IA 或数据归属。 |
| T-805 | 把 AI 分场失败恢复做成用户看得懂、刷新不丢的体验闭环【用户体验复核·2026-08-13】 | ✅ 待办 | — | PASS:edfebbace985 | [验收契约](orchestrator/T805-FRONTEND-JOURNEY.md) · [沿用 T-804 可靠性范围](orchestrator/T804-FRONTEND-JOURNEY.md) | 在 T-804 已完成断点复用与终态收口的基础上补齐用户体验：失败原因不得暴露 provider/HTTP/端点等机器错误；按钮明确显示“继续上次分场”，说明已完成步骤会保留且输入变化会自动重算；刷新或重新进入制作页后仍恢复最新失败任务与续跑入口；封面遇到明确可重试 503 时在步骤流说明正在恢复且封面方案已保留。补组件、runner 与真实 Chrome 的常规/紧凑视口验证；不改扣费、模型、数据归属或产品 IA。 |
| T-804 | 根治 8 月 13 日审核空转、视频决策重复执行与封面 503 无恢复【飞书用户日志·用户确认】 | ✅ 待办 | — | PASS:3b17e7b58cbf | [验收契约](orchestrator/T804-FRONTEND-JOURNEY.md) · [T-784 诊断](docs/research/2026-08-12-creator-experience-self-configured-model-log-diagnosis.md) · [T-766/T-767 审核契约](docs/superpowers/specs/2026-08-11-unified-text-model-script-review.md) · [T-735 受管多模态稳定性范围](BACKLOG-details.md#t-735) | 只修最新日志仍未覆盖的可靠性缺口：文本模型不支持结构化响应且返回审核字段残缺时，做有界协议修复并以真实失败终态停止报告轮询；视频决策任一后续节点失败后必须保存并复用已完成的分场/信息卡结果，显式重试不得从头重复执行；封面方案成功但图片提交遇到可重试 503 时，必须在不重复提交未知已受理请求的前提下安全恢复，最终失败仍保留可解释终态。补 RED→GREEN、幂等/恢复和终态回归；不改积分、扣费、退款、产品视觉、数据归属或外部发布。 |
| T-803 | 放大 Scene Graph 视觉主体并重做横竖画幅比例【用户验收失败·2026-08-13】 | ✅ 待办 | — | PASS:1564c823b8f7 | [验收契约](orchestrator/T803-FRONTEND-JOURNEY.md) · [沿用 T-802 SPEC](docs/superpowers/specs/2026-08-12-composable-scene-graph-motion.md) | 用户实看指出主体图形过小、画面占比不合理。保持可组合 Scene Graph、内容选择和虚线网格不变，重算横竖无人物舞台：可见主体联合宽度不低于主安全舞台 55%、高度不低于 46%、最大单体面积不低于 8.5%，核心 glyph 不得缩成小图标；横屏采用宽构图，竖屏按上下层级重排，主体之间不得因放大而无意义遮挡。标题/原文提示与字幕继续独立安全，不靠整体缩放或固定模板。用现有 6 个主题重新输出 12 条 MP4，并按真实 24fps 验证全程无重叠、越界和降级。 |
| T-802 | 落地可组合 Scene Graph 动效并验证跨内容丰富度【用户确认·2026-08-12】 | ✅ 待办 | PASS[REV:8ef2f283ad36] | PASS:72e6ce98c380 | [SPEC](docs/superpowers/specs/2026-08-12-composable-scene-graph-motion.md) | 用户认可 T-801 的 `Scene Graph + 可组合视觉原语 + 案例检索` 方向，要求重点测试效果并避免所有内容千篇一律。升级现有 `video.cards → visualPlan → HyperFrames/GSAP` 链而不引入第二套引擎：由 Skill/模型按内容选择可见对象、状态变化、构图与节奏，代码只校验原文溯源、原语白名单、横竖屏安全、碰撞和降级；同步设置内 Skill。冻结多主题同关系测试集，每题生成多个不同机制候选，按内容相关性、认知增量、静音可读、跨题视觉重复度、文字安全、双画幅稳定评分，并交付横竖真实样片。 |
| T-801 | 拆解 Remotions 模板项目并设计非固定模板的内容动效生成架构【用户纠偏·2026-08-12】 | ✅ 待办 | — | — | [诊断与建议](docs/research/2026-08-12-remotions-non-template-motion-architecture.md) | 用户明确不要把 `cause_effect / sequence / replacement` 固定成少数纸张、机器、回路配方；只读拆解 `/Users/zyongzhu/Workbase/remotions/templates` 的模板、组件、数据驱动、代码生成与预览渲染机制，对照 CreatorOS 当前 `video.cards → visualPlan → renderer` 链路，判断应采用可组合视觉原语、主题化 scene graph、受限代码生成还是多套模板库，并给出跨主题、横竖屏、文字安全、可预览、可回退的落地边界。未形成 SPEC 与用户确认前不改产品契约、不引入第二套视频引擎。 |
| T-800 | 用跨主题真实链路验证场景化动效能否在系统中稳定泛化【用户复核·2026-08-12】 | ✅ 待办 | — | — | [沿用 SPEC](docs/superpowers/specs/2026-08-12-content-driven-motion-card-iteration.md) · [当前样片](output/content-samples/ai-copy-eval-loop/README.md) | 用户要求换主题测试，并确认放进 CreatorOS 后能否跑出同等效果。冻结内容创作、个人成长、产品认知三种主题，通过真实 `video.cards` 决策入口获得 visualPlan，再进入正式渲染器输出横竖样片；分别判断模型关系选择、原文溯源、渲染稳定性与固定纸张/机器隐喻的跨主题适配，不用手写计划冒充系统能力，不先改系统。 |
| T-799 | 消除场景化动效中文字与装饰/物件的运动碰撞【用户反馈·2026-08-12】 | ✅ 待办 | — | — | [沿用 SPEC](docs/superpowers/specs/2026-08-12-content-driven-motion-card-iteration.md) · [横竖样片](output/content-samples/ai-copy-eval-loop/README.md) | 用户在横竖 v4 实看中发现文字有重叠。修正纸卷文字侵入机器、过程文字压住机芯、替换扫描线穿过旧判断、Loop 运动物件侵入步骤标签等碰撞；文字使用独立安全层，装饰与运动轨迹不得穿字；补运动中间态检查并重出横竖实际成片，不改配图与内容。 |
| T-798 | 修正动效样片的网格可见度、横竖版验收与无人物布局【用户反馈·2026-08-12】 | ✅ 待办 | — | — | [沿用 SPEC](docs/superpowers/specs/2026-08-12-content-driven-motion-card-iteration.md) · [v3 样片](output/content-samples/ai-copy-eval-loop/README.md) | 用户指出 v3 实看仍有三处未验收：虚线网格几乎不可见、只展示竖屏没有横屏实际成片、无人物样片仍沿用人物避让坐标导致上方大面积空置。保持已验收配图不变，提升静态网格可见度，为正式渲染器增加仅供无人物验看的视觉专场布局，输出同题横竖双版实际成片并做布局检查。 |
| T-797 | 把内容动效从“动态 PPT”升级为场景化运动叙事【用户反馈·2026-08-12】 | ✅ 待办 | — | — | [沿用 SPEC](docs/superpowers/specs/2026-08-12-content-driven-motion-card-iteration.md) · [上一版样片](output/content-samples/ai-copy-eval-loop/README.md) | 用户确认图片素材方向无误，但实际动效仍差：现有 `cause_effect / sequence / replacement` 虽有关系，视觉仍是多个圆角框、编号和连线，像动态 PPT。沿用现有 `video.cards` 契约与渲染链，迭代 Skill、评尺和 GSAP 配方，使因果表现为“输入膨胀但输出不变”、Loop 表现为候选经过校准后赢家回流、替换表现为旧说明书被折叠退出且新假设接管；输出同题 v3 实际预览，不改已验收配图。 |
| T-796 | 用最新内容 Skill 生成脚本、配图与动效小样【用户验看·2026-08-12】 | ✅ 待办 | — | — | [样片说明](output/content-samples/ai-copy-eval-loop/README.md) | 以“AI 文案差往往不是提示词不够长，而是没有判断标准”为冻结主题，使用当前 `script.draft v9`、内容职责型配图提示词和 `video.cards v2` 产一套可直接验看的口播稿、实际配图与内容关系动效预览；只做样片，不改产品功能。 |
| T-795 | 封面生成支持用户画面要求作为独立硬约束【用户确认·2026-08-12】 | ✅ 待办 | — | — | [SPEC](docs/superpowers/specs/2026-08-12-cover-user-visual-requirements.md) | 在现有封面生成入口增加可选的用户画面要求，例如“图里要有某个人物、物体、场景或动作”；该要求作为独立参数贯穿工具契约、生成 Skill 与任务执行链，优先于系统自动构图但不得绕过事实、版权与安全边界，留空时保持现有生成行为。 |
| T-794 | 让动效卡片从“文字冒出来”升级为内容驱动的视觉句子【用户确认·2026-08-12】 | ✅ 待办 | — | PASS:4359e7c23fcb | [SPEC](docs/superpowers/specs/2026-08-12-content-driven-motion-card-iteration.md) · [浏览器旅程](orchestrator/T794-FRONTEND-JOURNEY.md) | 迭代现有 `video.cards` Skill、内部卡片决策契约和 HyperFrames/GSAP 渲染配方：让数字、对比、步骤、因果与“建立→推翻”按内容关系逐步发生，减少整块淡入、通用绿线和重复圆角卡；沿用现有制作确认、预览与渲染链，不新建页面或第二套视频引擎，并用同题前后样本与聚焦回归完成一轮评分 Loop。 |
| T-792 | 让文生图提示词承担内容论证而非装饰【用户确认·2026-08-12】 | ✅ 待办 | — | — | [既有口播联想画面 SPEC](docs/superpowers/specs/2026-08-04-voiceover-associative-visual-skill.md) · [公开调研与评尺](docs/research/2026-08-12-content-supporting-image-prompt-research.md) | 只迭代现有 `video.broll`、通用 `material.generate` 与封面方案中的生图提示词：先判断画面在当前内容里承担事实证据、机制解释、类比、对比、后果或情绪中的哪一种职责，再把它落实为单一可见关系、具体主体/动作/环境/构图与必要约束；默认不复述口播、不烧大段文字、不产万能 AI 海报，不用 AI 图冒充事实。沿用现有模型配置、生成任务、候选采纳和成片链，不新建页面、接口、数据表或第二套生图功能。 |
| T-791 | 补齐 `script.draft` 资料驱动生成工具链【用户拆分·2026-08-12】 | ✅ 待办 | PASS[REV:ec0630fb6c65] | — | [SPEC](docs/superpowers/specs/2026-08-12-material-driven-script-draft-tool.md) · [真实对话根因](docs/research/2026-08-12-material-driven-script-draft-gap-diagnosis.md) | 让聊天长文、杂乱资料、已抽取文本文件和既有文案成为 `script.draft generate` 的受信一等输入，并把本轮调整方向、来源快照和完整正文可靠送到写稿 Skill；“基于这篇润色”直接生成候选，“一字不改”继续走 `verbatim`。只补现有工具/任务/runner 输入链，不新建页面、数据库或第二文档库。 |
| T-790 | 以人工 A/B loop 迭代 `script.draft` Skill【用户纠偏·2026-08-12】 | ✅ 待办 | — | — | [当前 SPEC](docs/superpowers/specs/2026-08-12-script-draft-skill-iteration.md) · [Skill-only 只读评审](docs/superpowers/specs/2026-08-12-script-draft-skill-iteration.review.md) · [首轮质量诊断](docs/research/2026-08-12-copywriting-quality-benchmark-diagnosis.md) · [深度调研](docs/research/2026-08-12-copywriting-prompt-positioning-eval-loop-research.md) · [腾讯文档对标样稿](https://docs.qq.com/doc/DQmxZSlRMb0F3Y2NV) | 只迭代现有 `script.draft` Skill 的写作指令、上下文职责和方法顺序；用冻结事实、现版基线、单变量挑战、用户盲评与跨主题回归改善单一主张、因果推进和连续口播感。A/B loop 是 Skill 开发方法，不做产品功能，不改工具输入契约、runner、页面或数据。 |
| T-793 | 打包包含最新文案 Skill、T-791 资料输入链与内容配图提示词的 CreatorOS 本地安装包【用户确认·2026-08-12】 | ✅ 待办 | — | PASS:ce879f907747 | [SHIP Gate](orchestrator/GATE-T793-SHIP.md) | 仅在 T-790、T-791、T-792 全部形成已提交且验收通过的干净候选后，使用官方本地打包入口生成 CreatorOS 1.0.0 macOS 本地测试包；校验源码与安装物一致、SHA-256、DMG 可挂载、真实安装与启动，不上传 GitHub、不发布渠道包。 |
| T-789 | 优化自配模型结构化长任务与浏览器搜索稳定性【用户确认·2026-08-12】 | ✅ 待办 | — | — | [BUILD Gate](orchestrator/GATE-T789-BUILD.md) | 在不改用户模型配置、不伪造搜索结果的前提下，针对分场/信息卡等结构化长任务补节点级合理时限与兼容接口的受控 JSON 修复路径，避免统一 90 秒误杀；浏览器搜索改用不受长连接拖累的页面就绪条件，并对同轮已确认的登录墙做有界跳过，保留 Bing/其他引擎真实回退与清晰失败。先取 RED，再做聚焦回归；不新增模型、不绕过 schema、不用模型记忆冒充联网证据。 |
| T-788 | 根治 Windows 素材中心打开文件误执行 macOS 命令【用户确认·2026-08-12】 | ✅ 待办 | — | — | [BUILD Gate](orchestrator/GATE-T788-BUILD.md) · [T-786 诊断](docs/research/2026-08-12-windows-assets-reveal-open-command-diagnosis.md) · [LED-022](orchestrator/LESSON_LEDGER.md) | 将素材文件与项目目录的系统打开行为收敛为可测试的跨平台执行计划，逐平台明确 command/API、独立 argv、完成语义和用户文案；Windows 使用 Explorer、macOS 使用 open、Linux 使用 xdg-open，不支持平台诚实报错；复用既有 launcher 形态，补路径含空格/中文、spawn/exit 错误与平台中性文案回归，不修改素材数据、不打包发布。 |
| T-787 | 将 CreatorOS 跨平台命令等复发坑沉淀进通用产品脚手架【工程经验·用户确认 2026-08-12】 | ✅ 待办 | — | — | [T-786 诊断](docs/research/2026-08-12-windows-assets-reveal-open-command-diagnosis.md) · [升格审计](docs/research/2026-08-12-creatoros-lessons-promoted-to-scaffold.md) · [项目 LED-022](orchestrator/LESSON_LEDGER.md) · `product-to-code-orchestrator 3.12.0` | 以 Windows 素材中心误执行 macOS `open -R` 的真实生产失败为 RED 证据，把系统命令、路径/参数、进程完成语义和平台文案的组合检查沉淀进通用产品脚手架，并同步 CreatorOS 项目教训与可执行守卫；同时审计本项目既有教训，筛选可跨项目复用且有证据的规则进入脚手架，保留项目专属细节在项目账本，运行技能自检、初始化夹具与项目门卫验证，不修改业务功能代码。 |
| T-786 | 排查 Windows 素材中心打开本地文件报错【用户加密日志·2026-08-12】 | ✅ 待办 | — | — | [诊断报告](docs/research/2026-08-12-windows-assets-reveal-open-command-diagnosis.md) · 用户提供两份加密 sidecar 日志 | 只读解密并对齐两份 Windows sidecar 日志中素材中心打开文件的操作、资源记录、原始路径、桌面壳调用与系统错误，区分文件已移动/缺失、路径规范化、权限/占用、关联程序或 CreatorOS 实现缺陷；输出可核验的根因、影响范围、用户可操作建议和如需产品修复的最小建议，不修改用户数据、不删除文件、不预设为渠道或模型问题。 |
| T-785 | 根治标准版空素材 B-roll、改稿重审复用旧任务与 Copilot 重复回复【用户确认·2026-08-12】 | ✅ 待办 | — | — | [BUILD Gate](orchestrator/GATE-T785-BUILD.md) · [T-784 诊断](docs/research/2026-08-12-creator-experience-self-configured-model-log-diagnosis.md) · [T-766 审核失败诚实性](docs/superpowers/specs/2026-08-11-unified-text-model-script-review.md) · [T-767 审核新鲜度](docs/superpowers/specs/2026-08-11-script-review-prediction-freshness.md) | 标准版项目素材清单为空时仍生成可搜索/可制作的 B-roll 画面需求并诚实返回空素材绑定；文案审核以当前稿件版本形成新 attempt，改稿后必须真正重审且同版本显式重试也不复用失败旧任务；Copilot 工具循环对连续重复进度文本和同参数重复调用做有界拦截，保留一次真实说明并减少额外模型消耗。只修现有交互与运行时，不改视觉、不新增模型或渠道逻辑、不删除历史数据。 |
| T-784 | 排查 Windows 自配模型下分场、B-roll、重审、搜索与重复回复异常【飞书体验记录·2026-08-12】 | ✅ 待办 | — | — | [诊断报告](docs/research/2026-08-12-creator-experience-self-configured-model-log-diagnosis.md) · [飞书体验记录](https://n1kahgetd2.feishu.cn/wiki/RRN7wOEUCifZJJkUevoctrZCn0d) | 只读核对用户提供的六份加密 Windows 日志、飞书截图与当前调用链，分别定位自配文本模型的结构化任务兼容/超时、空素材 B-roll 绑定失败、改稿后二次审核复用旧任务、浏览器搜索脆弱和工具循环重复回复；明确排除智溯AI渠道配置作为本次因果，不修改模型配置、用户数据或产品代码。 |
| T-783 | 排查 Windows 渠道激活后获取不到渠道配置【飞书最新反馈·2026-08-12】 | ✅ 待办 | — | — | [诊断报告](docs/research/2026-08-12-windows-channel-config-sync-failure.md) · [飞书反馈记录](https://my.feishu.cn/base/S1BRb4i6kaD0bnsViJSco0jxnRg?table=tblIPu0er91yGTwL&view=vewb4HsOUz) | 只读核对飞书最新反馈、加密 Windows 日志、智溯AI正式包渠道身份与构建参数，以及 Activity→Growth→本机受管凭据落盘链，定位“激活成功但渠道配置同步持续失败”的真实断点并给出最小根治建议；不修改生产数据、不重发安装包、不把未绑定抖音账号误判为渠道配置根因。 |
| T-782 | 根治编导任务工作区大素材重复复制【存储优化·用户确认 2026-08-11】 | ✅ 待办 | — | — | [T-780 磁盘审计](docs/research/2026-08-11-creatoros-local-disk-usage-audit.md) · 既有 execution sandbox 契约 | 编导任务把项目大素材物化进隔离工作区时优先使用文件系统写时复制，让任务副本保持独立可写但未修改的数据块不重复占盘；不支持写时复制的平台必须自动回退普通复制，禁止硬链接或软链接污染项目原素材。补失败测试、跨平台回退与真实 APFS 占用证据；现有任务数据不静默删除，另提供仅针对已确认冗余副本的安全迁移/清理边界。 |
| T-781 | 根治 Windows 渠道包原生壳与 WebView 品牌分裂【智溯AI回归·用户确认 2026-08-11】 | ✅ 待办 | — | — | [T-776 诊断](docs/research/2026-08-11-zhisu-ai-github-channel-brand-regression.md) · [DEC-REL-045](orchestrator/DECISION_LOG.md#dec-rel-045-2026-08-11--windows-渠道-closure-必须消费同一-package-brand-输入) | 渠道 plan-only 从已提交 PackageManifest 与已校验 ICO 生成受信品牌编译输入；Windows production closure 的唯一一次 Next 构建必须消费同一输入，并用非视觉最终闭包契约证明品牌名与图标均已烘焙，禁止先编译 CreatorOS WebView 后只换渠道原生壳。只修可复用渠道构建链，不改产品视觉、不动官方流水线；智溯AI本轮只触发 Windows artifact。 |
| T-780 | 审计本机编导智能体磁盘占用并定位异常增长【存储诊断·用户 2026-08-11】 | ✅ 待办 | — | — | [磁盘审计报告](docs/research/2026-08-11-creatoros-local-disk-usage-audit.md) | 只读统计整机剩余空间和 CreatorOS 相关目录的真实占用，区分项目/素材/数据库等用户数据、随包运行时、重复安装或孤儿 runtime、日志、临时渲染、构建 target 与依赖缓存，识别异常大文件和可回收空间并说明数据安全边界；不删除、不移动、不修改任何用户数据或构建文件。 |
| T-779 | 根治参考历史作品生成封面时误探本机工具并中断生图【v1.0 回归·用户确认 2026-08-11】 | 🔨 待办 | — | 待验 | 既有 `cover.generate`、`context.publications` 与 Copilot 媒体路由契约 | 当用户要求参考历史作品生成封面时，只从当前账号真实已发布且有封面的近期作品中，由编导模型结合当前内容语义选择“最新且最关联”的一条，相关性优先、发布时间用于同等相关候选裁决；随后必须直接把真实 `coverAssetId` 交给 `cover.generate`，不得用 `local.tools` 探测应用内生图模型、不得把 draft 当已发布作品、不得让用户替系统做 A/B 选择。缺配置、参考图读取或生成失败仍由真实封面任务诚实返回，不改视觉。 |
| T-778 | 根治视频渲染重启孤儿态与旧错误反复恢复【v1.0 回归·用户确认 2026-08-11】 | ✅ 待办 | — | — | [T-765 SPEC](docs/superpowers/specs/2026-08-10-video-render-delivery-quality.md) | 将应用重启前仍在运行的 `exec.video.render` 任务诚实收口为“已中断、可重试”，制作页恢复时以项目最新执行任务为真值而不是被已保存方案里的旧 `sourceRenderTaskId` 抢占；只有明确的浏览器缺失/不可执行错误才显示 Chromium 安装提示。以同一真实 54.9 秒工程随包组件完整渲染成功为基线，补聚焦回归后重打 macOS 1.0.0 本地官方测试包，不改视觉、不改渲染质量、不上传。 |
| T-777 | 移除视频渲染重复 Chromium 首帧预检并恢复本地成片【v1.0 回归·用户确认 2026-08-11】 | ✅ 待办 | — | — | [T-765 SPEC](docs/superpowers/specs/2026-08-10-video-render-delivery-quality.md) | 移除 2026-08-10 新增、会因 Chromium 启动与密钥库初始化误阻断渲染的独立首帧预检；继续保留 FFmpeg 解码、非兼容输入高质量标准化、HyperFrames 真实渲染和最终成片 codec/尺寸/帧率/像素格式/最低码率质检，启动异常不得再伪装成素材不支持；补聚焦回归后构建 macOS 1.0.0 本地官方测试包，不改视觉、不公证、不上传。 |
| T-776 | 排查智溯AI GitHub 正式渠道包左上角标题仍错位【渠道品牌回归·用户 2026-08-11】 | ✅ 待办 | — | — | [诊断报告](docs/research/2026-08-11-zhisu-ai-github-channel-brand-regression.md) · [PackageManifest](frontend/branding/packages/zhisu-ai/package.json) · `channel-package.yml` | 对照本地渠道包与 2026-08-10 GitHub Actions 正式渠道包的候选提交、参数、staging 配置和 Windows 安装产物，定位原生窗口左上角标题与应用内品牌来源未完整覆盖的具体环节；核清官方 `desktop-release.yml` 与渠道 `channel-package.yml` 的物理边界并给出证据与最小修复建议，本任务只诊断，不修改产品代码、不重跑、不发布。 |
| T-775 | 收口 Windows 浏览器回落并软化首启性能观测门槛【V1 正式包重跑·用户确认 2026-08-09】 | ✅ 待办 | — | — | [T-675 SPEC](docs/superpowers/specs/2026-08-03-windows-production-closure-default-release.md) · [DEC-REL-044](orchestrator/DECISION_LOG.md#dec-rel-044-2026-08-09--windows-45-秒首启改为性能观测真实可用性仍失败关闭) | 正式桌面端先尝试系统 Chrome，失败后仅回落到经安装闭包验证的内置 Chromium，不再被 Playwright CLI 与联网下载前置阻断；45 秒首启只输出性能警告，120 秒内未真实加载主页、进程提前退出、缺资源或白屏仍为硬失败；本次只纠正并行任务 ID 冲突，不改变已落地逻辑。 |
| T-774 | 调研 CreatorOS 接入微信视频号的官方能力与开源方案【多平台发布·用户 2026-08-11】 | ✅ 待办 | — | — | [调研报告](docs/research/2026-08-11-wechat-video-channels-integration-and-open-source-research.md) | 核对微信视频号面向普通创作者、企业与服务商的官方发布、账号授权、数据读取和内容管理能力；调研可复用的开源上传、浏览器自动化与登录态托管项目，区分官方 API、非公开接口和 UI 自动化，评估风控、验证码、账号封禁、跨平台维护、许可证及与 CreatorOS 发布排期边界的适配性，只输出证据与建议，不修改产品代码、不登录或操作真实视频号。 |
| T-773 | 更新 CreatorOS 1.0 最新使用教程、匿名化截图并新建成交型测试版教程【教程交付·用户 2026-08-11】 | 🔨 待办 | — | 待验 | [完整教程](docs/CreatorOS-新用户0到1标杆路线.md) · [测试版飞书教程](https://my.feishu.cn/wiki/GaHrwmGHHiU8MQkovQZcNjxMnpe) · [发布稿](outputs/T-773/creatoros-v1-test-conversion-guide.md) | 以当前 1.0 产品事实重新核对教程中的入口、流程、模型、视频制作、激活与反馈等变化；逐张检查教程引用的实机截图，将左下角博主头像、昵称、账号名称等身份信息统一遮挡并保留原图可恢复副本；同时面向新引入客资新建“一天跑出真实成果”的测试版飞书教程，写入真实一天体验码，以产品理解、机制信任、快速成果和授权伙伴购买引导完成转化，不公开价格或绕过推荐人的直营入口；验证全部图片链接与文档事实，不修改产品代码。 |
| T-772 | 仅重排渠道模型展示顺序并交付完整配置【模型商业化·用户确认 2026-08-11】 | ✅ 待办 | — | — | [完整配置](outputs/T-772/creatoros-product-config-model-order.json) · 用户提供的最新 `productConfig` | 保留全部模型、字段、默认标记、参数、服务、连接、渠道信息和契约版本，只重排 `productConfig.payload.models.default`：优先展示 GLM 5.2、GPT 5.6 Luna/Terra/Sol 与 DeepSeek V4 Flash，其余模型后置，MiniMax M3 与 DeepSeek V4 Pro 放末尾；交付完整 JSON，并以规范化对比证明除数组顺序外零差异，不修改生产环境。 |
| T-771 | 测算已接入模型的返佣收益并制定推荐与额度定价策略【模型商业化·用户澄清 2026-08-11】 | ✅ 待办 | — | — | [返佣收益与推荐策略](docs/research/2026-08-11-model-profit-and-recommendation-analysis.md) · 用户提供的当前 `productConfig` 与 Omnihi 模型报价清单 | 以提高 CreatorOS 的可持续收益为目标，对齐当前 1 元=50,000 平台额度、上游目录消耗和月末返佣，计算各模型返佣毛利率、每千次贡献、额度消耗速度和充值频率；在真实质量门槛内给出默认推荐、专业/旗舰升级、省额度档、低返佣模型降权、额度非平价定价与上游议价顺序。本任务只做经营审计与产品建议，不修改生产模型、额度 SKU 或业务代码。 |
| T-770 | 新增低误触发的 CreatorOS 元 Skill，统一解释系统并辅助产品内容创作【系统自认知·用户确认 2026-08-11】 | ✅ 待办 | PASS[REV:74f673ffb555] | — | [SPEC](docs/superpowers/specs/2026-08-11-creatoros-meta-skill.md) · [业界调研](docs/research/2026-08-11-agent-tool-routing-and-meta-skill-industry-research.md) | 在现有 official Skill 注册与 effective snapshot 内新增代码随版的 `creatoros.guide`：仅当用户明确询问 CreatorOS 的产品、功能、工作流、设计理念，或明确要围绕 CreatorOS 创作介绍/教程/复盘内容时按需加载权威产品知识；普通选题、改稿、素材搜索、其他产品与仅泛称 AI/智能体/创作系统不得触发。Skill 只提供真实产品解释与创作依据，不替代页面技能、不直接写库、不暴露内部端点/密钥/控制 ID；初版不接入尚未统一 snapshot 真相的远程更新链，以正反触发评测和真实创作样例证明低误触发。 |
| T-769 | 全面审计 AI 对话工具的意图理解、数据语义与结果展示一致性【正式版工具可靠性·用户 2026-08-11】 | ✅ 待办 | — | — | 既有 Copilot context/tool 契约与真实工具实现 | 只读扫描全部 AI 对话工具从说明、可用范围、模型选路、确定性参数默认值，到查询过滤/排序/分页、工具结果与前端卡片展示的端到端语义，重点查找“用户意图正确但选错工具”“排序字段与展示字段不一致”“过滤与分页顺序错误”“状态标签误导”和工具能力重叠；输出带代码证据的分级清单与最小修复建议，本任务不修改业务代码或视觉，实施另经用户确认。 |
| T-768 | 任何云端 ASR 故障都必须自动回退本地 Whisper【逐字稿可靠性·用户确认 2026-08-11】 | 🔨 待办 | PASS[REV:3eb18966ea59] | 待验 | [SPEC](docs/superpowers/specs/2026-08-11-asr-universal-local-fallback.md) | 所有云端与渠道语音转文字路径在未配置、未绑定、额度不足、临时授权失败、鉴权、限流、网络、超时、供应商异常或响应不合法时，都必须停止使用当前云端凭据并对同一音频只尝试一次本地 Whisper；不得再用额度或模型配置问题阻断逐字稿。官方包必须包含本地转写所需运行时并验证首用准备链；只有本地 Whisper 自身失败时才显示本地转写失败，不改现有视觉布局。 |
| T-767 | 根治改稿后审核与盲预测停留在旧锁定态【正式版稿面回归·用户反馈 2026-08-11】 | ✅ 待办 | — | — | [SPEC](docs/superpowers/specs/2026-08-11-script-review-prediction-freshness.md) | 当前稿件保存为新版本后，旧审核和旧盲预测必须保留为历史事实但立即退出当前稿门禁：审核完成后所有消费区同步同一份最新报告，同版本重新审核也可替换旧结论；旧锁定预测按真实创建时间识别过期并提供重新盲预测入口，禁止让用户反复审核仍无法继续，不改现有视觉布局。 |
| T-766 | 退役独立审核模型并统一使用通用文本模型完成文案审核【正式版审核回归·用户确认 2026-08-11】 | ✅ 待办 | PASS[REV:8271a533558c] | — | [SPEC](docs/superpowers/specs/2026-08-11-unified-text-model-script-review.md) · [独立复审](docs/superpowers/specs/2026-08-11-unified-text-model-script-review.review.md) | 编导文案审核不再提供或读取独立 `script.review` 模型配置，L2 语义审核始终复用当前通用文本模型；删除“专用/非专用审核模型”与仅因独立审核模型缺失而产生的降级门禁和提示，保留 L1 规则检查、稿件改动后重审与真实文本模型调用失败的可见重试，不改现有视觉布局。 |
| T-765 | 根治正式视频交付的代理入链、重复编码与清晰度失控【正式版成片·用户确认 2026-08-10】 | ✅ 待办 | PASS[REV:289663738ae5] | — | [SPEC](docs/superpowers/specs/2026-08-10-video-render-delivery-quality.md) · [行业方案调研](docs/research/2026-08-10-video-delivery-industry-solutions.md) | 正式渲染不得再把普通 CRF18 proxy 当交付源：兼容 H.264 素材只做容器整理，不兼容素材只生成一次高质量中间文件；HyperFrames 以 high、PNG 抽帧和明确目标码率完成唯一一次正式编码，最终文件只无损 remux，并用 ffprobe 对 codec、尺寸、帧率、像素格式和最低交付码率失败关闭。保持用户已选横竖屏与 30fps 契约，不改视觉、不自动上传或发布。 |
| T-762 | 根因复盘并设计渠道 ASR 密钥的短时租约闭环【正式版受管能力·用户 2026-08-10】 | 🔨 待办 | — | — | [受管模型契约](docs/superpowers/specs/2026-08-02-capability-scoped-channel-model-authority.md) · 既有 T-679/T-735/T-731 证据 | 基于昨天真实渠道 ASR 故障、当前 Activity ticket v3、Growth 受管凭据与本地密钥库实现，区分长期渠道密钥、短时 ASR lease、机器绑定和失败恢复的责任边界，形成不暴露长期密钥、不依赖用户手工配置、可自动续租且 fail-closed 的根治方案；本任务不修改产品代码或生产配置。 |
| T-761 | 调研成熟视频项目的画幅、转码与平台清晰度交付方案【T-760 根治前置·用户 2026-08-10】 | ✅ 待办 | — | — | 既有视频渲染与发布成片契约 | 对照官方平台规范及成熟渲染/剪辑项目，核对横竖屏选择、帧率继承、中间格式、CRF/码率控制、二次转码和成片质检做法，找出 CreatorOS 当前链路与行业实践的差距，形成可落地但未实施的根治方案；不修改产品代码。 |
| T-760 | 排查抖音已发布成片模糊与横竖屏/码率链路【正式版真实作品·用户 2026-08-10】 | ✅ 待办 | — | — | 既有视频渲染、项目画幅与发布成片契约 | 只读核对用户指定抖音作品、CreatorOS 最终成片及原始口播素材的真实分辨率、画幅、帧率、码率与平台播放档位，区分项目画幅选择、CreatorOS 编码压缩和抖音二次转码各自影响；报告证据与根治建议，不修改产品代码、不重发或改动已发布作品。 |
| T-759 | 根治已绑定 B-roll 因 inventory 失配显示空白【正式版制作回归·用户 2026-08-10】 | 🔨 待办 | — | 待验 | 既有 video.decisions、production.videoEditingPlan 与项目素材归属契约 | 分镜里的每条 B-roll 绑定必须与同源项目素材快照一起原子保存和恢复；当前素材仍可用时展示真实名称并可换选，素材已删除、归属变化或旧方案缺元数据时明确显示“素材已不可用”并允许移除或从当前项目重新选择，禁止渲染空白下拉、禁止静默改绑、禁止重新调用模型或读取全局/其他项目素材。 |
| T-758 | 根治分镜补充素材触发整链反复重跑【正式版制作回归·待用户确认】 | ✅ 待办 | — | — | 既有 video.decisions、总导演闭环与项目素材边界契约 | 项目素材始终是可选清单，不要求全部匹配；已有完整分镜必须可直接确认进入渲染，补充选材只在当前稳定分镜内一次性调整素材与时间线，不重新跑语义分场/字幕等无关节点；同项目同一时刻至多一条有效优化任务，按钮防重复提交，取消后不得继续产生新模型调用，界面明确区分“可选补充”与“必须处理”。 |
| T-757 | 排查素材较多时分镜反复自动优化与素材匹配【正式版运行诊断·用户 2026-08-10】 | ✅ 待办 | — | — | 既有 video.decisions、总导演复审与 material.match 契约 | 只读核对本机正式版最新任务日志与步骤流，区分单任务内部复审循环、前端重复建任务、结构化输出失败重试或素材容量/约束冲突；报告真实 taskId、循环次数、触发条件与停止条件，不修改产品代码、不再次消费模型、不清理用户数据，修复另经用户确认。 |
| T-756 | 修复视频渲染完成态实时刷新与 B-roll 清单恢复【正式版制作回归·待用户确认】 | ✅ 待办 | — | — | 既有视频制作、Execution 确认门与 production.videoEditingPlan 契约 | 渲染任务从 running 进入 awaiting_confirmation 后当前制作页必须实时展示预览与采纳动作，无需切换 Tab；刷新或切换 Tab 恢复已保存分镜时必须同时恢复当次 B-roll inventory，使已有 assetId、名称和换选项完整可见，禁止重跑付费任务、禁止丢失已渲染成片或扩大素材范围。 |
| T-755 | 排查分场决策与视频渲染长期无结果【正式版运行诊断·用户 2026-08-10】 | ✅ 待办 | — | — | 既有视频制作与执行引擎契约 | 只读取本机正式版安全日志与任务状态，分别定位分场决策和视频渲染卡在请求、AI 任务、审批、素材、渲染进程还是结果回写；报告真实错误、受影响 taskId/projectId 与可复现路径，不改产品代码、不清理用户数据，修复另经用户确认。 |
| T-754 | 根治 CreatorOS v1.0 官方包启动无限转圈【正式版启动阻断·用户 2026-08-10】 | 🔨 待办 | — | — | [桌面首次启动 SPEC](docs/superpowers/specs/2026-07-23-desktop-packaging-first-launch-design.md) · 既有 T-747 进展感知软看门狗契约 | 基于当前官方安装包启动状态机与安全日志锁定“持续转圈但既不进入主页面也不进入诊断页”的真实原因；真实进展只允许续期空闲看门狗，整个启动必须受最终收敛上限约束，sidecar 退出、重复无效进展、主页加载失败均及时进入可操作诊断且保全数据；补 macOS/Windows 契约与本地真启动回归，不改视觉、不顺带增加功能，正式重打包另按用户确认执行。 |
| T-753 | 建立可复用 N 渠道 GitHub 双平台正式构建与配套 Skill【渠道规模化·用户确认 2026-08-10】 | ✅ 待办 | — | — | [渠道包工厂 SPEC](docs/superpowers/specs/2026-08-04-channel-package-factory-and-incremental-update.md) · [渠道打包 Skill](.agents/skills/packaging-creatoros-channel/SKILL.md) | 新增与官方 `desktop-release` 物理分离的手动 GitHub workflow，只接受仓库内已提交且通过 identity lock 的 `packageRef`，复用同一渠道出包入口构建 macOS/Windows；macOS 强制 Developer ID、公证、staple、Gatekeeper，Windows 本轮允许未签名但必须显式标注；只上传 Actions artifact，不创建 Release、不改 CDN/Growth、不放量。同步把本地预检、本地包、GitHub 正式包和发布停止点固化进项目级 Skill，并以智溯AI `zhisu-ai` 双平台实跑验收。 |
| T-752 | 重打智溯AI v1.0 macOS 本地渠道包【复用既有身份锁·用户确认 2026-08-10】 | ✅ 待办 | — | — | [智溯科技渠道档案](channel-partners/智溯科技/README.md) · [PackageManifest](frontend/branding/packages/zhisu-ai/package.json) | 严格复用 `zhisu-ai` 已锁定身份、`partner-p501444c` 渠道、现有品牌图标与五个业务链接，从当前 CreatorOS 1.0.0 `main` 先做渠道预检，再构建 Apple 芯片 macOS `local-test` 包并完成 DMG、安装身份、原生窗口、应用内品牌与真实启动验证；不改代码、不上传、不公证、不修改线上 Growth。 |
| T-751 | 根治 Windows v1.0 缺 runtime current 指针时启动硬失败【正式版回归·用户确认 2026-08-10】 | ✅ 待办 | — | — | 既有 Windows runtime migration 与 startup safety 契约 | 旧安装目录 `runtime-images` 存在但 `runtime-current.txt` 缺失时，只从唯一且通过现有完整性校验的 runtime 恢复安全指针；无法唯一恢复则保留旧目录并进入既有安装资源兜底，禁止删除 AppData 用户数据；补健康迁移、缺指针恢复、歧义兜底测试后先做本地与 Windows 契约验证。 |
| T-750 | 排查 Windows v1.0 启动校验报“迁移副本缺 current 指针”【正式版真机·用户 2026-08-10】 | ✅ 待办 | — | — | 既有 Windows runtime migration 与 startup safety 契约 | 基于用户提供的两份加密 sidecar 日志、正式包 SHA 和当前启动校验代码，锁定 `current` 指针为何在迁移副本中缺失，区分安装包缺文件、旧 runtime 残留、迁移时序或 Windows 路径语义；本任务只诊断和保全证据，不修改产品代码。 |
| T-749 | 根治 macOS 正式流水线缓存命中时跳过 Playwright 浏览器安装【官方包回归·用户确认 2026-08-10】 | ✅ 待办 | — | — | 既有 `desktop-release.yml` 与运行时冒烟契约 | exact runtime cache 命中时，macOS runner 仍必须在运行混淆后冒烟前准备 host Playwright Chromium；只修安装条件并补缓存命中回归，不改产品代码、视觉或发布范围；通过四项打包测试后重新跑同一 SHA 的 Windows 与 macOS 官方包。 |
| T-748 | 补齐“重新输入激活码”原生命令 ACL 并重打官方包【正式版回归·用户真机 2026-08-09】 | 🔨 待办 | — | — | [T-746 SPEC](docs/superpowers/specs/2026-08-09-in-product-activation-reset-design.md) | 正式包点击“重新输入激活码”不得再出现 `Command license_reset_local not allowed by ACL`；只为无参数命令 `license_reset_local` 增加最小 remote-sidecar 放行权限，并补齐“前端 invoke ↔ handler ↔ build command ↔ capability”一致性回归，不改 UI、清理边界或发布流程；验证后重跑官方 macOS/Windows 打包。 |
| T-746 | 在 CreatorOS 设置中提供“重新输入激活码”【正式版产品功能·用户变更确认 2026-08-09】 | ✅ 待办 | PASS[REV:ebc8dce5c4c3] | — | [SPEC](docs/superpowers/specs/2026-08-09-in-product-activation-reset-design.md) · [使用说明](docs/testing/creatoros-activation-only-reset.md) | 放弃独立 EXE，改为官方桌面版设置内的本地激活重置入口：用户确认后只清本机激活快照、防回拨点和旧渠道缓存，完整保留项目、素材、数据库、账号、模型密钥、机器身份和工作区；不联网、不含服务端地址、不做解绑，整体重启后进入既有激活页输入新码。 |
| T-747 | 把 CreatorOS 60 秒启动硬超时改为进展感知软看门狗【正式版启动可靠性·用户确认 2026-08-09】 | ✅ 待办 | — | — | 既有桌面启动安全契约 | 首次解压、迁移或低性能电脑启动时，不再到 60 秒直接判失败；sidecar 只要持续输出真实启动进展就续期等待，无任何进展的等待窗口放宽到 5 分钟，并保留 30 分钟最终安全上限；退出与真实失败仍立即展示诊断页，文案不得再写死“60 秒”。 |
| T-744 | 为 CreatorOS 内测群生成 v1.0 正式版感谢与能力升级通知【发布传播·用户 2026-08-09】 | ✅ 待办 | — | — | [v1.0 发布图文案](docs/marketing/CreatorOS-v1.0-产品功能与版本迭代图.md#内测群正式版通知) | 面向约 330 位内测群成员撰写不催购的正式版通知，感谢所有成员通过测试与反馈帮助产品持续变好；突出模型配置已统一集成、支持国内外主流模型，并接入语音转文字、图片生成与视频生成能力；不公开约 30 位购买者的内部统计。 |
| T-743 | 补充 CreatorOS v1.0 股东激活码模型权益说明与通知文案【正式发布·用户 2026-08-09】 | ✅ 待办 | — | — | [正式版下载文档](https://my.feishu.cn/wiki/QY1owmFUjit7VgkpmQ1chGPCnTR) | 在股东正式版下载文档中明确：默认发放自配模型版激活码，股东需自行配置模型服务；如需内置模型版，应私下联系交付方更换对应激活码；同时生成一段可直接转发的简短通知，不暗示需要更换安装包。 |
| T-742 | 参照现有飞书说明创建 CreatorOS v1.0 股东正式版下载文档【正式发布·用户 2026-08-09】 | ✅ 待办 | — | — | [正式版下载文档](https://my.feishu.cn/wiki/QY1owmFUjit7VgkpmQ1chGPCnTR) | 读取现有知识库文档并在同一知识库创建一份面向已购买股东的精简正式版下载说明，只保留版本、macOS/Windows 下载占位、安装激活步骤、关键注意事项与反馈入口；截图控制在 0–2 张，正式安装包由用户稍后上传，不编造下载链接。 |
| T-741 | 下移知识库“记一条经验”入口到录入操作行【正式版细节·用户 2026-08-09】 | 🔨 待办 | — | 待验 | 既有知识录入与经验捕获契约 | 保留“记一条经验”现有 Copilot 深链与行为，只把入口从知识库页头右侧移动到倾倒场的录入按钮行、紧邻“手动补录”；页面只能保留一个入口，不改按钮风格、录入流程或知识库整体视觉。 |
| T-740 | 为 CreatorOS v1.0 正式版生成朋友圈发布文案【发布传播·用户 2026-08-09】 | ✅ 待办 | — | — | [v1.0 发布图文案](docs/marketing/CreatorOS-v1.0-产品功能与版本迭代图.md#朋友圈发布文案) | 围绕 8 月 10 日正式发布、21 天三次大版本升级、一站式 AI 编导和数据飞轮写一段可直接发布的朋友圈文案，避免技术堆砌和未确认能力，保留自然体验入口。 |
| T-739 | 根治制作视频跨项目灌入 B-roll、无证据改稿偏好与超长复盘卡【正式版回归·用户 2026-08-09】 | 🔨 待办 | — | 待验 | 既有项目素材挂载、视频制作与发布复盘契约 | 视频制作的 B-roll 候选只能读取当前项目明确挂载/上传的素材；当前项目没有素材时诚实为空，不得混入全局或其他项目素材。改稿偏好只能由当前项目自身已发布后的评论、指标与用户明确采纳行为派生；项目未制作、未发布或无数据时不得展示跨作品偏好。复盘卡只展示简短、可核验摘要，详细依据按需展开，不得把内部信号、整稿或超长原始文本直接铺满页面；不改全局视觉体系。 |
| T-738 | 根治发布物料生成成功后无处查看并恢复卡内查看闭环【正式版回归·用户 2026-08-09】 | 🔨 待办 | — | 待验 | 既有发布物料生成与项目稿面契约 | “生成发布物料”成功后，原项目卡片必须显示真实可用的“查看发布物料”，在当前查看界面直接读取并展示已生成的各平台标题、正文等发布内容，支持刷新后回读；不得跳转发布中心，发布中心继续只负责排期管理，不新增发布管理入口、不改导航或视觉结构。 |
| T-737 | 生成 CreatorOS v1.0 正式版产品功能图与四版本迭代图【8 月 10 日发布·用户 2026-08-09】 | ✅ 待办 | — | — | [发布图文案](docs/marketing/CreatorOS-v1.0-产品功能与版本迭代图.md) | 结合产品功能地图、v0.2/v0.3 更新图与历史发布证据，生成一张突出“一站式 AI 编导、数据飞轮、功能强大、连续三次升级、迭代迅速”的 v1.0 正式版发布长图；时间轴覆盖 v0.1、v0.2、v0.3、v1.0，8 月 10 日为用户确认的正式发布日期，不编造未完成能力。 |
| T-736 | 盘点 8 月 3 日以来已完成更新并生成 CreatorOS 软件更新长图【发布说明·用户 2026-08-09】 | ✅ 待办 | — | — | [更新说明](docs/marketing/CreatorOS-2026-08-03至2026-08-09更新说明.md) | 只统计 `taskctl` 已完成且有提交、Gate 或验收证据的更新，区分功能交付、调研诊断与仍在进行中事项；生成一张延续既有深色霓虹风格、中文可读、可直接分享的更新长图，不把本地测试包或未验收能力写成正式发布。 |
| T-735 | 根治渠道受管模型成功产物被误判失败并建立 C 端稳定性闭环【智溯AI真机 2026-08-09】 | 🔨 待办 | — | 待验 | [受管模型契约](docs/superpowers/specs/2026-08-02-capability-scoped-channel-model-authority.md) · [Growth 持久凭据契约](/Users/zyongzhu/Workbase/Thirdspace-growth/docs/contracts/T-133-activation-managed-model-subkey.md) | [详情](BACKLOG-details.md#t-735) |
| T-734 | 根治 Windows 扫码绑定在启动前误依赖缺失 Playwright CLI【抖音账号绑定·用户真机 2026-08-09】 | 🔨 待办 | — | 待验 | [Windows 生产闭环](docs/superpowers/specs/2026-08-03-windows-production-closure-default-release.md) | [详情](BACKLOG-details.md#t-734) |
| T-733 | 本地模型可用时收起渠道配置误报警并纠正票据不适用状态【模型设置·用户真机 2026-08-09】 | 🔨 待办 | — | 待验 | [渠道模型逐能力契约](docs/superpowers/specs/2026-08-02-capability-scoped-channel-model-authority.md#12-t-733-票据不适用与本地模型提示收口2026-08-09) | 当已保存的本地文本模型可正常使用时，设置页不再显示“渠道配置安全校验未通过”等与当前使用路径无关的红色提示；Activity 明确返回 `CONFIG_TICKET_REQUEST_INVALID` 时按当前激活不适用渠道托管配置处理，不得写成 `authorization_changed` 或 `security_error`，真正的签名、安全或授权变化失败仍保持可见并失败关闭。 |
| T-732 | 根治局部改稿锚点失效后阻断全部 Copilot 对话【AI 对话可用性·用户真机 2026-08-09】 | 🔨 待办 | — | 待验 | [T-716 局部改稿规格](docs/superpowers/specs/2026-08-06-copilot-script-editing-and-attachments.md) | AI 整稿写入必须持久化稳定段落 ID；存量无 ID 版本由稿面、执行重绑和补丁采纳使用同一兼容锚点并在新版本自愈。“AI 改写本段”只在用户明确发起及围绕该段连续修订时携带段落锚点；当前版本已无法重绑目标段时，必须结束这次局部改稿、清除失效锚点并恢复项目普通对话，不能让后续任意消息继续被 `SCRIPT_SELECTION_STALE` 拦截，也不能提供必然重复失败的“重试”。覆盖整稿换版→点击第 2 段成功→采纳只改该段，以及失败→普通消息成功→重新点段落成功的连续回归。 |
| T-730 | 恢复可选“立论点”UI并增加适用场景引导，不重新变成写稿门槛【创作弹性·用户确认 2026-08-09】 | 🔨 待办 | PASS[REV:aeda30778cf2] | 待验 | [SPEC](docs/superpowers/specs/2026-08-09-optional-thesis-guidance.md) · [退役影响调研](docs/research/2026-08-08-thesis-skeleton-removal-impact.md) | 本次只恢复现有“核心论点/支撑依据/证据/反驳”论点骨架的可见 UI 与真实生成、编辑、保存能力，并明确标为可选辅助：知识讲解、观点评论、测评对比、长内容或需要证据/反驳时可先使用；已有完整逐字稿、简单通知、短口播、纯记录或只需快速成稿时可直接跳过。页面同时提供“先梳理观点”和“跳过，直接写稿”，未生成或未明确采用不得影响脚本；采用后的写稿消费必须在界面可见，不得恢复强制前置、后台隐藏消费、词面相似度选材或对完整逐字稿导入的阻断。本次不做分场景模板、字段改名或任意结构自定义。 |
| T-731 | 支持按电商等创作场景生成并自定义创作框架【场景化框架·用户后续 2026-08-09】 | 📋 待办 | — | 待验 | T-730 后续 | 在 T-730 可选论点 UI 稳定后，再把固定四栏升级为场景化创作框架：由 AI 根据本次目标提出结构，支持电商、知识讲解、观点评论、测评等起点，并允许用户新增、删除、改名和排序框架项；不得用固定业务词表替代 AI 语义判断。 |
| T-729 | 根治渠道专属包仍跳官方入口并拆分官网、下载、人工反馈与反馈 API【白标完整性·智溯AI真机 2026-08-08】 | 📋 待办 | — | 待验 | [详情](BACKLOG-details.md#t-729) | 智溯AI模型配置已生效，但更新官网和问题反馈仍串到 CreatorOS 官方；统一包级入口、渠道运行时和反馈 API 契约，并做官方包与渠道包真机全链路回归。 |
| T-728 | 让本机激活重置安全支持渠道包并清空智溯AI激活态【渠道换码·用户 2026-08-08】 | ✅ 待办 | — | — | [渠道包工厂 SPEC](docs/superpowers/specs/2026-08-04-channel-package-factory-and-incremental-update.md) | 扩展本机激活重置工具，使其只接受仓库内已锁定的渠道包清单并据此精确定位应用数据、激活偏好、渠道 Keychain 与运行进程；先以防误删测试证明不会命中官方 CreatorOS 或其他渠道，再清空本机智溯AI激活态并重新打开激活页。全过程保留项目、账号、知识库、素材、数据库、日志、机器身份、主密钥与服务端绑定记录。 |
| T-727 | 根治项目编导无视“原文不改”并拿创作建议硬拦写稿【稿面忠实导入·用户实录 2026-08-08】 | ✅ 待办 | PASS[REV:6e5e96f8c2ec] | PASS:985b6e0ee246 | [SPEC](docs/superpowers/specs/2026-08-08-verbatim-script-import-and-instruction-precedence.md) | 用户明确要求把已提供口播稿原样写入时，当前指令必须覆盖选题卡、定位和归因中的创作建议；系统应直接产出逐字保真的稿面候选，不得要求先解除立项规则、不得反复劝改，也不得把原文压缩成 `extraBrief` 摘要后再交给生成模型重写。新增可审计的原文输入与保真模式，逐字稿只允许用户明确要求的追加/校正，仍保留“候选→用户采纳→落稿”数据确认门；覆盖长稿、空稿面、已有稿面、重复请求、当前项目冲突和模型不可用时原文不丢。 |
| T-724 | 排查并根治发布后补登记导致自动化导入项目残留为僵尸项目【项目生命周期·用户实测 2026-08-08】 | ✅ 待办 | PASS[REV:15546b832da7] | PASS:ee541782fc52 | [SPEC](docs/superpowers/specs/2026-08-08-project-publication-identity-convergence.md) | 自动化已按抖音新作品创建 imported 历史项目后，用户再把既有创作项目登记为同一作品时，必须收敛到唯一可解释的项目归属；publication 继续作为唯一外部作品事实，手工作品项目可接管 imported 投影，被替代投影只做可逆归档；并发、重复登记、手工冲突、孤儿锚、补偿失败和后续自动化均须确定收敛，不删除用户项目或媒体数据。 |
| T-725 | 调研移除项目稿面“论点骨架”的产品与技术影响【创作链瘦身·用户 2026-08-08】 | ✅ 待办 | — | — | [影响调研](docs/research/2026-08-08-thesis-skeleton-removal-impact.md) | 盘点论点骨架在项目稿面、Copilot `planning.thesis`、`thesis_tree` 产物、写稿上下文、审核与历史数据中的真实消费链，判断可直接去界面、降级为内部上下文或完整移除的影响与迁移边界；本任务只调研，不先删功能。 |
| T-726 | 退役项目“论点骨架”并让写稿直接消费 Brief 与素材【创作链瘦身·用户确认 2026-08-08】 | 🔨 待办 | PASS[REV:2809820bf64a] | 待验 | [SPEC](docs/superpowers/specs/2026-08-08-thesis-skeleton-retirement.md) | 删除稿面论点骨架面板、“立论点”入口及 Copilot `planning.thesis` 新建链，新的写稿、策划、重建与制作不再读取或生成 `thesis_tree`；既有 artifact/version 只读保留且不再暗中影响新结果，项目素材继续通过用料链进入写稿和 B-roll，旧脚本版本与历史数据不删除。 |
| T-721 | 根治素材包导出回流造成递归嵌套并恢复大素材库完整可见性【素材数据安全·用户 2026-08-08】 | 🔨 待办 | — | 待验 | [SPEC](docs/superpowers/specs/2026-08-08-material-export-isolation-and-asset-pagination.md) | 导出素材包必须作为一次性下载产物写入对象存储，不得创建普通素材记录；既有素材包 ZIP 保留但以后导出时自动隔离，防止 ZIP 自嵌套。素材中心和项目素材查询必须完整分页加载，不能因固定 200/100 条上限让旧素材消失。 |
| T-722 | 排查并根治渠道包技能注册表不可读且正常包无异常【渠道运行态·用户截图 2026-08-08】 | ✅ 待办 | — | PASS:a2a17556ed64 | [渠道包工厂 SPEC](docs/superpowers/specs/2026-08-04-channel-package-factory-and-incremental-update.md) | [详情](BACKLOG-details.md#t-722) |
| T-720 | 根治特定 Windows 设备抖音内置浏览器页面崩溃导致内容雷达主页验证失败【飞书用户日志·2026-08-08】 | 📋 待办 | — | 待验 | [飞书反馈记录](https://my.feishu.cn/base/S1BRb4i6kaD0bnsViJSco0jxnRg?table=tblIPu0er91yGTwL&view=vewb4HsOUz) | [详情](BACKLOG-details.md#t-720) |
| T-719 | 根治桌面端启动后二次白屏闪烁与首页排期提醒不可用【启动稳定性·用户录屏 2026-08-07】 | 🔨 待办 | — | 待验 | [Windows 生产闭环](docs/superpowers/specs/2026-08-03-windows-production-closure-default-release.md) | [详情](BACKLOG-details.md#t-719) |
| T-718 | 补齐智溯AI包内品牌并交付完整 Growth 配置后重打本地包【渠道验收失败·用户 2026-08-07】 | 🔨 待办 | — | 待验 | [渠道包工厂 SPEC](docs/superpowers/specs/2026-08-04-channel-package-factory-and-incremental-update.md) | [详情](BACKLOG-details.md#t-718) |
| T-716 | 完善 Copilot 局部改稿、脚本版本回退、附件上下文与素材中心稳定排序【创作编辑闭环·用户 2026-08-06】 | 🔨 待办 | — | 待验 | [实现规格](docs/superpowers/specs/2026-08-06-copilot-script-editing-and-attachments.md) | [详情](BACKLOG-details.md#t-716) |
| T-715 | 在 CreatorOS 增加 Growth AI 额度账户连接、查看与充值入口【额度闭环·用户 2026-08-06】 | 🔨 待办 | — | 待验 | [真实联调 Gate](orchestrator/GATE-T715-BUILD.md) | [详情](BACKLOG-details.md#t-715) |
| T-714 | 接入工程教训闭环并迁移旧账本，确保真实踩坑可被后续任务自动复用【工程进化·用户 2026-08-06】 | 📋 待办 | — | 待验 | [`product-to-code-orchestrator`](orchestrator/process/.skill-version) | [详情](BACKLOG-details.md#t-714) |
| T-713 | 构建包含通用智能体语义边界与当前制作修复的 macOS 0.3.0 本地测试包【本地验收·用户 2026-08-06】 | 🔨 待办 | — | 待验 | [发布流程](docs/RELEASING.md) | [详情](BACKLOG-details.md#t-713) |
| T-712 | 优先采用用户上传素材进入 B-roll 时间线、恢复成片预览并收回渠道同步常驻提示【制作体验·本机实测 2026-08-05】 | 🔨 待办 | — | 待验 | [T-687 口播联想画面 Skill](docs/superpowers/specs/2026-08-04-voiceover-associative-visual-skill.md) | [详情](BACKLOG-details.md#t-712) |
| T-709 | 将 macOS Developer ID 签名与 Apple 公证凭据接入 GitHub 正式发布流水线【发布安全·用户 2026-08-05】 | 🔨 待办 | — | 待验 | [发布流程](docs/RELEASING.md) | [详情](BACKLOG-details.md#t-709) |
| T-708 | 全局审计并软化 AI 工具中不合理的创作完整度门禁【工具灵活性·用户 2026-08-05】 | 🔨 待办 | — | 待验 | [门禁全局审计](docs/research/2026-08-05-ai-tool-hard-gate-audit.md) | [详情](BACKLOG-details.md#t-708) |
| T-707 | 将定位前采收敛为 Copilot 主导的自适应编导访谈并直接闭环定位中心【定位精准度·飞书反馈 2026-08-05】 | 🔨 待办 | PASS[REV:06867c4bf60c] | 待验 | [T-652 前采工作流](docs/superpowers/specs/2026-08-01-positioning-pre-interview-workflow.md) | [详情](BACKLOG-details.md#t-707) |
| T-705 | 根治 macOS 本地包启动后落入 Page Not Found【发布阻断·本机实测 2026-08-05】 | 🔨 待办 | — | 待验 | [发布流程](docs/RELEASING.md) | [详情](BACKLOG-details.md#t-705) |
| T-703 | 根治视频制作从分镜到预览、对话调剪、采纳与再制作的多处断裂并重打本地包【制作闭环·用户 2026-08-05】 | 🔨 待办 | PASS[REV:c1a3920aea71] | 待验 | [SPEC](docs/superpowers/specs/2026-08-05-video-production-editing-loop.md) | [详情](BACKLOG-details.md#t-703) |
| T-702 | 根治审核“应用改写”后分镜稿格式坍缩为 Markdown 表格源码【稿面编辑·用户 2026-08-05】 | 📋 待办 | — | 待验 | 既有稿面审核门与脚本 artifact 版本契约 | [详情](BACKLOG-details.md#t-702) |
| T-695 | 清理应用内硬编码品牌并让白标用户表面保持中性【白标体验·用户 2026-08-04】 | 🔨 待办 | — | 待验 | [白标边界](docs/research/2026-08-04-white-label-runtime-vs-package-boundary.md) | [详情](BACKLOG-details.md#t-695) |
| T-691 | 补齐 Copilot 单项目全生命周期、跨项目历史与审核改稿工具闭环【Context 契约·用户 2026-08-04】 | 🔨 待办 | PASS[REV:9444ca5b32a9] | 待验 | [SPEC](docs/superpowers/specs/2026-08-04-copilot-project-lifecycle-tool-closure.md) | [详情](BACKLOG-details.md#t-691) |
| T-694 | 建立多渠道专属包工厂、项目级出包 Skill 与安全增量更新闭环【渠道规模化·用户 2026-08-04】 | 🔨 待办 | PASS[REV:2c7be136aea0] | 待验 | [SPEC](docs/superpowers/specs/2026-08-04-channel-package-factory-and-incremental-update.md) | [详情](BACKLOG-details.md#t-694) |
| T-686 | 根治定位前采联网补充直接报错并恢复国内中文公开检索【定位前采·本机实测 2026-08-04】 | 🔨 待办 | — | 待验 | [T-652 前采工作流](docs/superpowers/specs/2026-08-01-positioning-pre-interview-workflow.md) | [详情](BACKLOG-details.md#t-686) |
| T-687 | 建立口播联想画面 Skill 并打通图序号引用、项目 B-roll 与成片渲染【视觉创作主链·本机日志 2026-08-04】 | 🔨 待办 | — | 待验 | [口播联想画面 Skill SPEC](docs/superpowers/specs/2026-08-04-voiceover-associative-visual-skill.md) | [详情](BACKLOG-details.md#t-687) |
| T-685 | 排查并根治全流程写稿长度失控及审核不识别已采纳文案卡【创作主链·本机日志 2026-08-04】 | 🔨 待办 | — | 待验 | [T-642 编导证据链 SPEC](docs/superpowers/specs/2026-08-01-content-radar-creative-handoff.md) | [详情](BACKLOG-details.md#t-685) |
| T-684 | 根治 Copilot 联网搜素材失败后回退模型记忆并误导配置搜索模型【浏览器检索·用户截图 2026-08-04】 | 🔨 待办 | — | 待验 | 既有 `material.gather`、`web.search` 浏览器适配器与 T-645 隐藏模型配置契约 | [详情](BACKLOG-details.md#t-684) |
| T-683 | 修复 Copilot 在 Windows 无法读取盘符绝对路径与目录授权失效【本地文件读取·用户截图 2026-08-04】 | 🔨 待办 | — | 待验 | 既有 `local.read` 安全归一、HITL 授权和本地工作区契约 | [详情](BACKLOG-details.md#t-683) |
| T-679 | 接入 Growth 按激活权益签发的受管模型凭据、真实模型白名单与用户选择【模型服务最小闭环·用户 2026-08-04】 | 🔨 待办 | — | 待验 | [Growth 持久凭据契约](/Users/zyongzhu/Workbase/Thirdspace-growth/docs/contracts/T-133-activation-managed-model-subkey.md) | [详情](BACKLOG-details.md#t-679) |
| T-678 | 根治内容雷达生成选题继续读取旧定位【定位消费一致性·飞书用户 2026-08-04】 | 📋 待办 | — | 待验 | [T-652 定位前采 SPEC](docs/superpowers/specs/2026-08-01-positioning-pre-interview-workflow.md) | [详情](BACKLOG-details.md#t-678) |
| T-677 | 优化首页与定位中心切换时整页骨架卡顿 1–2 秒【桌面交互性能·飞书用户 2026-08-03】 | 📋 待办 | — | 待验 | 既有 DashboardQueryService、定位中心页面读取与 App Router loading 契约 | 保留主内容稳定框架，把非首屏数据改为可分区返回/延后加载，对高频路由做可验证预热，并记录 dashboard 与定位各读源耗时；页面切换不得因共享 `(creator)/loading.tsx` 把整个主区替换成骨架，需在 macOS 用户同等数据量下验证体感和实测耗时。 |
| T-676 | 根治云端 ASR 测试假阳性并接通 StepFun，同时修复 Windows 本地 Whisper 回退【逐字稿阻断·飞书用户 2026-08-03】 | 📋 待办 | — | 待验 | 既有 `transcribe.audio` 多模态适配器与设置连接测试契约 | [详情](BACKLOG-details.md#t-676) |
| T-671 | 确定 CreatorOS 代理商业模式与官网价格边界【渠道商业化·用户 2026-08-02/03】 | 🔨 待办 | — | 待验 | [代理合作口径](docs/superpowers/specs/2026-08-02-creatoros-agent-channel-policy.md) | [详情](BACKLOG-details.md#t-671) |
| T-670 | 恢复 CreatorOS 部署前真实官网并收口公开商业信息【官网回滚纠偏·用户 2026-08-02/03】 | 🔨 待办 | — | 待验 | [T-668 历史定价口径](docs/superpowers/specs/2026-08-02-creatoros-website-pricing.md) | [详情](BACKLOG-details.md#t-670) |
| T-666 | 根治定位前采误清空既有定位并改为非破坏草稿切换【定位数据安全·用户 2026-08-02】 | 🔨 待办 | — | 待验 | [定位非破坏草稿 SPEC](docs/superpowers/specs/2026-08-02-positioning-non-destructive-draft.md) | [详情](BACKLOG-details.md#t-666) |
| T-665 | 支持彻底删除内容雷达信源及其全部归属数据【信源生命周期·用户 2026-08-02】 | 🔨 待办 | — | 待验 | [信源彻底删除 SPEC](docs/superpowers/specs/2026-08-02-intelligence-source-hard-delete.md) | [详情](BACKLOG-details.md#t-665) |
| T-662 | 根治成片把内部结构标签当正文并优化卡片文字重合【视频内容质量·用户 2026-08-02】 | 🔨 待办 | — | 待验 | [视频制作 overhaul SPEC](docs/superpowers/specs/2026-07-13-video-production-overhaul-design.md) | 视频场景标题和卡片正文必须来自观众可读的真实口播主张，`hook/value/新闻钩子` 等内部编导标签只能做控制元数据，不能直接出现在画面；同时按真实画布安全区、文本长度和人物画面占位约束卡片排版，避免文字重合与空黑屏。 |
| T-661 | 根治项目素材未进入制作、采纳后仍转圈及素材包图片无扩展名【制作闭环·用户 2026-08-02】 | 🔨 待办 | — | 待验 | [结构/脚本/分镜一致性 SPEC](docs/superpowers/specs/2026-07-17-structure-script-storyboard-consistency-design.md) | [详情](BACKLOG-details.md#t-661) |
| T-660 | 根治雷达预填逐字稿未解锁下一步及已采纳封面仍被判缺失【项目状态回显·用户 2026-08-02】 | 🔨 待办 | — | 待验 | [T-642 编导证据链 SPEC](docs/superpowers/specs/2026-08-01-content-radar-creative-handoff.md) | 项目阶段状态必须从真实已保存逐字稿和项目已采纳封面素材派生，不能依赖用户再敲一次键触发本地脏状态，也不能只认某一种封面生成回写字段；修复首次进入、采纳后即时回显与刷新后回显，并补真实链路回归。 |
| T-656 | 收紧桌面授权本地信任链，移除生产冒烟旁路并消除 verdict 私钥明文靶点【安全加固·用户 2026-08-02】 | 🔨 待办 | PASS[REV:5f6970ac76f2] | 待验 | [SPEC](docs/superpowers/specs/2026-08-02-desktop-verdict-basic-hardening.md) | [详情](BACKLOG-details.md#t-656) |
| T-655 | 接通 Seedance 文生视频适配器并修复 `seeddance` 配置报未知 provider【文生视频阻断·用户 2026-08-02】 | 🔨 待办 | — | — | 既有 `video.generate` 与异步多模态 provider 契约 | 核实当前 Seedance 配置实际使用的官方或中转协议，在现有多模态 registry 中新增真实 submit→poll→download 适配器，并兼容已经保存的 `seeddance` provider 拼写；生成失败必须给出可行动原因，禁止把已配置能力误报成不支持。 |
| T-654 | 新增 Qwen 方言 ASR 适配器并接入设置预设【逐字稿质量·用户 2026-08-02】 | 🔨 待办 | — | 待验 | 既有 `transcribe.audio` 与多模态 provider 适配器契约 | 新增 `qwen-asr` 真实适配器，调用百炼 Qwen3-ASR 的 `chat/completions + input_audio`，复用安全音频分段并在设置页提供 Qwen 预设；用户只需填写模型名和 Key，未配置时仍回退本地 Whisper，普通话及方言走同一条逐字稿落库链。 |
| T-653 | 支持本地自配与渠道子 Key 托管双模式模型供给【模型商业化·跨仓·用户 2026-08-02】 | 📋 待办 | 待审 | 待验 | [已确认方向与后置条件](docs/research/2026-08-02-activation-managed-relay-subkey-design.md) | [详情](BACKLOG-details.md#t-653) |
| T-652 | 重构定位前采为必经的编导式访谈与证据辅助工作流【定位业务流·用户 2026-08-01】 | 🔨 待办 | 待审 | 待验 | [SPEC 方向已修订·待复审](docs/superpowers/specs/2026-08-01-positioning-pre-interview-workflow.md) | [详情](BACKLOG-details.md#t-652) |
| T-650 | 知识倾倒输入框支持拖拽文件直接导入【知识录入体验·用户 2026-08-01】 | 🔨 待办 | — | 待验 | 既有知识蒸馏与文件导入契约 | 用户可把当前支持的 PDF、DOCX、Markdown、TXT 文件直接拖进大输入框，获得明确拖入态、上传进度、成功结果与错误提示；拖拽必须复用现有文件导入真链路，不新增第二套解析或假上传。 |
| T-651 | 内容雷达默认按作品真实发布时间倒序【排序语义·用户 2026-08-01】 | 🔨 待办 | — | 待验 | 内容雷达既有列表排序契约 | 排序项改名为「最新发布」，主排序键必须是来源作品真实 `publishedAt`、且倒序；不得以采集入库、指标快照或最后更新时间冒充发布时间。发布时间相同时再以收录时间和稳定 ID 倒序；缺失发布时间的条目置后并如实显示。 |
| T-649 | 调研并设计激活后渠道白标：品牌名、应用内 Logo 与系统级图标边界【商业渠道·跨仓·用户 2026-08-01】 | 📋 待办 | — | 待验 | [调研结论](docs/research/2026-08-01-channel-white-label-runtime-branding-audit.md) | [详情](BACKLOG-details.md#t-649) |
| T-646 | 统一优化结构化 AI 工具为结果优先、分段生成与局部修复【性能与可靠性·用户 2026-08-01】 | 🔨 待办 | — | 待验 | [审计待补](docs/research/2026-08-01-structured-ai-tool-reliability-audit.md) | [详情](BACKLOG-details.md#t-646) |
| T-645 | 收敛模型配置项并同步精简 Growth 渠道模板【设置体验·跨仓配置·用户 2026-08-01/02】 | 🔨 待办 | PASS[REV:5dfe24b42eb7] | 待验 | [逐能力管控 SPEC](docs/superpowers/specs/2026-08-02-capability-scoped-channel-model-authority.md) | [详情](BACKLOG-details.md#t-645) |
| T-644 | 根治 CreatorOS macOS 客户端持续闪屏【运行态阻断·用户 2026-08-01】 | 🔨 待办 | — | 待验 | 既有桌面启动、sidecar 与 WebView 日志契约 | 基于当前安装包和本机实时日志区分 WebView 重载、前端异常重渲染、窗口重复创建或进程崩溃重启；锁定可复现触发源后修复，并验证页面稳定、数据不丢且不引入启动回归。 |
| T-643 | 收口 CreatorOS 为输入 Activity 激活码后直接授权，隐藏当前权益领取入口【商业激活主线·用户 2026-08-01】 | 📋 待办 | — | 待验 | [跨仓唯一链路](/Users/zyongzhu/Workbase/Thirdspace-growth/docs/contracts/T-129-activation-code-single-flow.md) | [详情](BACKLOG-details.md#t-643) |
| T-642 | 打通内容雷达对标文案→改写策略→选题卡→项目写稿的编导证据链【产品链路·用户 2026-08-01/02】 | 🔨 待办 | CONCERNS[REV:7728c9ed44bd] | 待验 | [SPEC](docs/superpowers/specs/2026-08-01-content-radar-creative-handoff.md) | [详情](BACKLOG-details.md#t-642) |
| T-641 | 根治发布中心“登录多日仍只有一个采集日、发布趋势不出曲线”【线上数据回流·用户 2026-07-31】 | 🔨 待办 | — | 待验 | 既有发布中心与抖音自动采集契约 | 以真实账号日志和 `metric_snapshots` 为证据，核实定时作品指标采集是否逐日执行、按账号落库并被发布中心查询；多个采集日必须形成真实折线，单日继续诚实显示单点，禁止按登录天数伪造趋势。 |
| T-640 | 配置 Apple Developer ID 签名与公证，并在前序修复全部闭环后统一产出本地安装包【发布·用户 2026-07-31】 | 🔨 待办 | — | 待验 | [本次打包证据](orchestrator/GATE-T640-BUILD.md) | [详情](BACKLOG-details.md#t-640) |
| T-635 | 把 CreatorOS 正式构建绑定到 Growth 商品的统一 `projectKey`，禁止运行时覆盖产品身份或关闭严格验签 | 🔨 本地实现待验 | PASS[REV:b8add273a494] | 待验 | [SPEC](docs/superpowers/specs/2026-07-30-growth-product-identity-binding.md) | 可分发包 exact `creatoros`、身份/验签不可运行时覆盖、三仓本地 identity 联调已通过；claim 保持关闭，等待统一提交与生产 J-047 receipt |
| T-633 | 根治内容雷达生成选题卡失败并恢复创作者中心自动扫码【线上阻断·用户 2026-07-30】 | 🔨 待办 | — | 待验 | 既有内容雷达与抖音登录契约 | 按最新日志修复 `topic_preview` 真实失败链；首次扫码直接打开创作者中心二维码页并复用同一按账号登录态，不再把普通抖音首页当默认入口。 |
| T-632 | 根治“新建定位母版”无效、历史母版无法恢复与逐字稿提取长时间无结果【线上阻断·用户 2026-07-30/31】 | 🔨 待办 | — | 待验 | [GATE](orchestrator/GATE-T632-BUILD.md) | [详情](BACKLOG-details.md#t-632) |
| T-631 | 根治大视频上传被 10MB 截断并误报 ffmpeg 缺失【线上阻断·用户 2026-07-30】 | 🔨 待办 | — | 待验 | [既有视频执行 SPEC](docs/superpowers/specs/2026-07-11-execution-layer-video-pipeline-design.md) | 修复桌面本地 blob 大文件上传截断，complete 前校验声明大小与实际大小，并把 `moov atom not found` 等素材损坏错误与二进制缺失严格分流；聚焦回归后产出本地安装包。 |
| T-621 | 补齐渠道模型 authority snapshot 生产链路回归【非阻断测试增强·T-606 复核】 | 📋 待办 | — | — | [绑定契约](docs/superpowers/specs/2026-07-29-creatoros-channel-model-authority.contract.md) | 补 `createTask → persistence → authority change → cancel/no provider call` 完整链路证据，不改变已确认契约。 |
| T-576 | 统一跟进尚未关闭的飞书线上用户反馈【线上支持】 | 🔨 免审 | — | — | [反馈表](https://my.feishu.cn/base/S1BRb4i6kaD0bnsViJSco0jxnRg?table=tblIPu0er91yGTwL&view=vewb4HsOUz) | 只负责新反馈分诊、进度同步和邮件闭环；故障实现由各自任务承接，未真机解决不得提前结案。 |
| T-575 | 接通 CreatorOS 权益领取、渠道配置与问题反馈【跨系统上线闭环】 | 🔨 本地PASS·待生产E2E | — | 待验 | [SPEC](docs/superpowers/specs/2026-07-27-t076-creator-three-system-launch.md) · [Gate](orchestrator/GATE-T575-BUILD.md) | 本地链路已通过；待真实发布材料、live HTTPS 三仓 E2E、双平台凭据后端与正式发布许可。 |
| T-562 | 根治 CreatorOS 0.2.0 Windows 安装后持续白屏【发布阻断】 | 🔨 免审 | — | 待验 | [SPEC](docs/superpowers/specs/2026-07-23-desktop-packaging-first-launch-design.md) · [复盘](docs/research/2026-07-24-windows-first-launch-white-screen.md) | 待真实启动链取证并修复 sidecar/WebView 导航；新包须通过安装后启动、health ready 与非白屏交互 Gate。 |
| T-548 | 根治视频渲染重试后成片脱离项目且制作页实时预览消失【发布阻断·用户 2026-07-26】 | 🔨 待安装版真机 | — | 待验 | [既有 T-292/T-254 规格](docs/superpowers/specs/2026-07-13-video-production-overhaul-design.md) | 重试 taskId 回传、项目/output/usage 幂等关联、export、内联预览恢复和图片 B-roll MIME 分流均已实现并通过聚焦测试；仅保留安装版真实渲染、成片回放与素材使用记录验收。 |
| T-538 | 接通渠道签名上下文的产品问题反馈【跨仓契约·上线闭环】 | 🔨 本地PASS·待生产E2E | — | 待验 | [契约](/Users/zyongzhu/Workbase/Thirdspace-growth/docs/contracts/channel-bound-product-feedback-v1.md) · [Gate](orchestrator/GATE-T538-BUILD.md) | 本地可信提交、失败保留和幂等重试已通过；待正式接口部署、发布 origin、真实激活码三系统 E2E 与独立复核。 |
| T-536 | 根治“我的收藏”同步错误分类与浏览器档案锁恢复【bug·多账号采集·用户 2026-07-26】 | 🔨 待真实账号只读验收 | — | 待验 | 无 SPEC（既有收藏读取链故障） | 代码已提交 `85312bd2`：跨 chunk 错误按稳定 code 恢复、无活 context 才精准清锁且只重试一次、诊断脱敏、UI 给恢复动作；定向 130 tests、typecheck、build、boundary 通过，待有效登录态做真实收藏只读验收。 |
## ⏸️ 暂停池（不自动派发）

> 只保留任务索引；暂停原因与恢复条件见 `orchestrator/events.ndjson` 和详情文档。恢复必须使用 `taskctl start`。

| ID | 搁置 | 文档 |
|---|---|---|
| T-626 | ⏸️ | [详情](BACKLOG-details.md#t-626) |
| T-577 | ⏸️ | [详情](BACKLOG-details.md#t-577) |
| T-565 | ⏸️ | [详情](BACKLOG-details.md#t-565) |
| T-524 | ⏸️ | [详情](BACKLOG-details.md#t-524) |
| T-519 | ⏸️ | [详情](BACKLOG-details.md#t-519) |
| T-525 | ⏸️ | [详情](BACKLOG-details.md#t-525) |
| T-517 | ⏸️ | [详情](BACKLOG-details.md#t-517) |
| T-516 | ⏸️ | [详情](BACKLOG-details.md#t-516) |
| T-510 | ⏸️ | [详情](BACKLOG-details.md#t-510) |
| T-506 | ⏸️ | [详情](BACKLOG-details.md#t-506) |
| T-502 | ⏸️ | [详情](BACKLOG-details.md#t-502) |
| T-497 | ⏸️ | [详情](BACKLOG-details.md#t-497) |
| T-451 | ⏸️ | [详情](BACKLOG-details.md#t-451) |
| T-449 | ⏸️ | [详情](BACKLOG-details.md#t-449) |
| T-448 | ⏸️ | [详情](BACKLOG-details.md#t-448) |
| T-433 S2 | ⏸️ | [详情](BACKLOG-details.md#t-433-s2) |
| T-433 S4 | ⏸️ | [详情](BACKLOG-details.md#t-433-s4) |
| T-433 S5 | ⏸️ | [详情](BACKLOG-details.md#t-433-s5) |
| T-426 | ⏸️ | [详情](BACKLOG-details.md#t-426) |
| T-425W | ⏸️ | [详情](BACKLOG-details.md#t-425w) |
| T-413 | ⏸️ | [详情](BACKLOG-details.md#t-413) |
| T-417 | ⏸️ | [详情](BACKLOG-details.md#t-417) |
| T-418 | ⏸️ | [详情](BACKLOG-details.md#t-418) |
| T-420 | ⏸️ | [详情](BACKLOG-details.md#t-420) |
| T-399 | ⏸️ | [详情](BACKLOG-details.md#t-399) |
| T-399c | ⏸️ | [详情](BACKLOG-details.md#t-399c) |
| T-409 | ⏸️ | [详情](BACKLOG-details.md#t-409) |
| T-372 W-spike | ⏸️ | [详情](BACKLOG-details.md#t-372-w-spike) |
| T-372 W-ci | ⏸️ | [详情](BACKLOG-details.md#t-372-w-ci) |
| T-391 H-econ | ⏸️ | [详情](BACKLOG-details.md#t-391-h-econ) |
| T-393 | ⏸️ | [详情](BACKLOG-details.md#t-393) |
| T-401 | ⏸️ | [详情](BACKLOG-details.md#t-401) |
| T-406 | ⏸️ | [详情](BACKLOG-details.md#t-406) |
| T-407 | ⏸️ | [详情](BACKLOG-details.md#t-407) |
| T-396 | ⏸️ | [详情](BACKLOG-details.md#t-396) |
| T-398 | ⏸️ | [详情](BACKLOG-details.md#t-398) |
| T-366c | ⏸️ | [详情](BACKLOG-details.md#t-366c) |
| T-361 | ⏸️ | [详情](BACKLOG-details.md#t-361) |
| T-352 | ⏸️ | [详情](BACKLOG-details.md#t-352) |
| T-320c | ⏸️ | [详情](BACKLOG-details.md#t-320c) |
| T-350c | ⏸️ | [详情](BACKLOG-details.md#t-350c) |
| T-351 | ⏸️ | [详情](BACKLOG-details.md#t-351) |
| T-349d | ⏸️ | [详情](BACKLOG-details.md#t-349d) |
| T-339 | ⏸️ | [详情](BACKLOG-details.md#t-339) |
| T-328 | ⏸️ | [详情](BACKLOG-details.md#t-328) |
| T-332R | ⏸️ | [详情](BACKLOG-details.md#t-332r) |
| T-336 | ⏸️ | [详情](BACKLOG-details.md#t-336) |
| T-335 | ⏸️ | [详情](BACKLOG-details.md#t-335) |
| T-337 | ⏸️ | [详情](BACKLOG-details.md#t-337) |
| T-337a | ⏸️ | [详情](BACKLOG-details.md#t-337a) |
| T-337b | ⏸️ | [详情](BACKLOG-details.md#t-337b) |
| T-337c | ⏸️ | [详情](BACKLOG-details.md#t-337c) |
| T-337d | ⏸️ | [详情](BACKLOG-details.md#t-337d) |
| T-337e | ⏸️ | [详情](BACKLOG-details.md#t-337e) |
| T-337f | ⏸️ | [详情](BACKLOG-details.md#t-337f) |
| T-337g | ⏸️ | [详情](BACKLOG-details.md#t-337g) |
| T-334 | ⏸️ | [详情](BACKLOG-details.md#t-334) |
| T-324 | ⏸️ | [详情](BACKLOG-details.md#t-324) |
| T-340 | ⏸️ | [详情](BACKLOG-details.md#t-340) |
| T-315 | ⏸️ | [详情](BACKLOG-details.md#t-315) |
| T-316 | ⏸️ | [详情](BACKLOG-details.md#t-316) |
| T-317 | ⏸️ | [详情](BACKLOG-details.md#t-317) |
| T-318 | ⏸️ | [详情](BACKLOG-details.md#t-318) |
| T-319 | ⏸️ | [详情](BACKLOG-details.md#t-319) |
| T-312 | ⏸️ | [详情](BACKLOG-details.md#t-312) |
| T-307 | ⏸️ | [详情](BACKLOG-details.md#t-307) |
| T-306 | ⏸️ | [详情](BACKLOG-details.md#t-306) |
| T-301 | ⏸️ | [详情](BACKLOG-details.md#t-301) |
| T-302 | ⏸️ | [详情](BACKLOG-details.md#t-302) |
| T-261 | ⏸️ | [详情](BACKLOG-details.md#t-261) |
| T-249 | ⏸️ | [详情](BACKLOG-details.md#t-249) |
| T-250 | ⏸️ | [详情](BACKLOG-details.md#t-250) |
| T-255b | ⏸️ | [详情](BACKLOG-details.md#t-255b) |
| T-185R | ⏸️ | [详情](BACKLOG-details.md#t-185r) |
| T-136R | ⏸️ | [详情](BACKLOG-details.md#t-136r) |
| T-100 | ⏸️ | [详情](BACKLOG-details.md#t-100) |
| T-087 | ⏸️ | [详情](BACKLOG-details.md#t-087) |
| T-045 | ⏸️ | [详情](BACKLOG-details.md#t-045) |

## ✅ 已完成

> ✅ 已完成任务全文已归档到 [BACKLOG-archive.md](BACKLOG-archive.md)(减小本看板体积;单一执行真相仍是本文件)。
