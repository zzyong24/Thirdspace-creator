# BACKLOG 任务详情（机械外置）

> 由 `backlog-compact.mjs --squeeze` 维护。任务状态仍只认 `BACKLOG.md`；本文件保存外置前原始行，避免会话注入膨胀。

<a id="t-735"></a>
## T-735
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-735 | 根治渠道受管模型成功产物被误判失败并建立 C 端稳定性闭环【智溯AI真机 2026-08-09】 | 📋 待办 | — | 待验 | [受管模型契约](docs/superpowers/specs/2026-08-02-capability-scoped-channel-model-authority.md) · [Growth 持久凭据契约](/Users/zyongzhu/Workbase/Thirdspace-growth/docs/contracts/T-133-activation-managed-model-subkey.md) · T-679/T-655 既有实现 | 以智溯AI真实 C 端日志和 OmniHi 任务事实为验收基线：2026-08-10 01:07:55 提交的 `seedance/seedance-2.0-fast` 视频在上游 01:09:56 已 `succeeded` 并产出可下载 MP4，CreatorOS 却于 01:09:57 将本地任务取消；同日生图也在上游成功并产生可下载 PNG，但客户端报错。根治图片与视频对真实 `result.data[0].url`、OpenAI 兼容顶层 `data[0]` 及已签约历史形状的解析差异，成功产物必须落为可预览候选，禁止把已生成且已计费的结果丢掉。对提交、轮询、下载和本地落库分别建立稳定状态与脱敏关联号；网络抖动只允许有界重试，未证明提交未被受理时不得重复发起计费生成；上游已成功而本地失败时必须按 provider job id 幂等恢复产物，过期或确实不可恢复时给出明确状态与人工处理入口。渠道错误包装必须保留可行动分类、HTTP/任务阶段和脱敏 reference，不得再把鉴权、额度、限流、上游失败、响应契约漂移、下载失败全部压成 `ChannelManagedProviderError reason=unknown`，同时不得向 C 端暴露中转站、子 Key、Base URL 或内部 provider。补真实响应合同 fixture、单元/集成测试、故障注入、重复提交与恢复测试，以及 Growth→CreatorOS→中转端的并发/背压、限流、超时和熔断验收；明确 Growth 控制面与直连数据面的并发责任，保证单用户并发不会重复计费、吞掉成功产物或拖垮客户端。以智溯AI渠道包完成文本、ASR、生图、生视频连续与并发真机回归，记录成功率、P95、错误分类和账单一致性；不得用测试连接或上游成功记录冒充 CreatorOS 端到端成功。本任务不授权部署或发布。 |

### 外置更新 2026-08-17
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-735 | 根治渠道受管模型成功产物被误判失败并建立 C 端稳定性闭环【智溯AI真机 2026-08-09】 | 🔨 待办 | — | 待验 | [详情](BACKLOG-details.md#t-735) | 完整任务范围、约束与验收证据见详情。 |

<a id="t-734"></a>
## T-734
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-734 | 根治 Windows 扫码绑定在启动前误依赖缺失 Playwright CLI【抖音账号绑定·用户真机 2026-08-09】 | 📋 待办 | — | 待验 | [Windows 生产闭环](docs/superpowers/specs/2026-08-03-windows-production-closure-default-release.md) · 既有 T-284 随包 Chromium、T-307 浏览器回落与 T-469 CLI 定位契约 | `v0.2.1-beta.3` Windows 真机点击“扫码绑定新抖音号”时，在任何浏览器启动前报“Playwright CLI 未找到”；根因边界与 T-720 的浏览器页面崩溃不同。当前抖音 `openContext` 无条件先跑旧的 `ensureChromiumInstalled`，使已经承诺的本机 Chrome 优先和随包 Chromium 回落都被 CLI 下载前置条件截断；打包器又允许静默跳过 Chromium，并未验证 Windows 最终 runtime 中浏览器可执行文件或离线回落能力。修复后账号绑定必须先按统一浏览器选择器尝试本机 Chrome，失败才使用壳层注入且经文件验证的随包 Chromium；正式 Windows runtime 不得把 Playwright CLI、全局 Node/npm 或联网下载当成启动前提。正式构建缺随包 Chromium 必须 fail-closed，只有显式开发/诊断构建可允许下载兜底；CLI 定位须支持实际 `runtime-images/<id>/sidecar` 与分层布局。用户可见错误须说明“本机 Chrome/内置浏览器均不可用”、影响与重装/导出日志动作，原始路径只留诊断日志。补单元测试、打包合同测试和 Windows 最终 runtime 布局检查，覆盖本机 Chrome 成功、Chrome 失败→随包 Chromium 成功、两者均缺失、路径含空格/非 ASCII、离线环境和旧 runtime 兼容；本任务不发布、不删除登录态。 |

### 外置更新 2026-08-17
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-734 | 根治 Windows 扫码绑定在启动前误依赖缺失 Playwright CLI【抖音账号绑定·用户真机 2026-08-09】 | 🔨 待办 | — | 待验 | [Windows 生产闭环](docs/superpowers/specs/2026-08-03-windows-production-closure-default-release.md) | [详情](BACKLOG-details.md#t-734) |

<a id="t-729"></a>
## T-729
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-729 | 根治渠道专属包仍跳官方入口并拆分官网、下载、人工反馈与反馈 API【白标完整性·智溯AI真机 2026-08-08】 | 📋 待办 | — | 待验 | [渠道包工厂 SPEC](docs/superpowers/specs/2026-08-04-channel-package-factory-and-incremental-update.md) · [T-718 真机构建证据](orchestrator/GATE-T718-BUILD.md) · [白标边界调研](docs/research/2026-08-04-white-label-runtime-vs-package-boundary.md) | 以智溯AI `v0.3.0` 真机为失败事实：渠道模型 bundle `v5` 与受管凭据已经 `configured`，但软件更新仍固定打开 `creatoros.aitongban.cloud`；问题反馈在 `channelRuntime` 缺值或异常时回退 CreatorOS 官方飞书；自动反馈提交又把面向人的 `bugFeedbackUrl` origin 当成 Growth API authority。一次性收口 CreatorOS 多渠道外部入口：在受签名 `PackageManifest` 中明确区分包官网、下载页、人工反馈页与更新 manifest locator，并与激活后的购买、续费、支持、问题反馈运行时投影以及固定的 Growth feedback API authority 分离；用户可见链接只读取当前包或当前渠道的受信值，渠道包不得跨跳 CreatorOS 官方或其他渠道，远端 manifest 不得形成开放重定向，未激活、离线或快照延迟时必须按字段契约诚实降级，不能偷回官方默认值。修复更新卡、检查更新、购买、续费、支持、下载、问题反馈打开及自动提交完整链路，清除官方 URL 常量和飞书 fallback 对渠道包的渗漏；如涉及 manifest schema、Activity runtime 或反馈服务契约，开工前同步修订并审核上游 SPEC/合同。补源码扫描、合同测试、单元测试和 macOS 安装包真机点击回归，至少覆盖 CreatorOS 官方包与智溯AI包、激活与未激活、在线与离线、运行时新鲜与陈旧、反馈 API 成功与拒绝，并继续保证只接受 allowlist/签名 URL、日志不泄露激活码或密钥。完成后重打本地智溯AI安装包供用户验证；本任务不授权部署、发布或改动线上 Growth。 |

### 外置更新 2026-08-17
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-729 | 根治渠道专属包仍跳官方入口并拆分官网、下载、人工反馈与反馈 API【白标完整性·智溯AI真机 2026-08-08】 | 📋 待办 | — | 待验 | [详情](BACKLOG-details.md#t-729) | 智溯AI模型配置已生效，但更新官网和问题反馈仍串到 CreatorOS 官方；统一包级入口、渠道运行时和反馈 API 契约，并做官方包与渠道包真机全链路回归。 |

<a id="t-722"></a>
## T-722
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-722 | 排查并根治渠道包技能注册表不可读且正常包无异常【渠道运行态·用户截图 2026-08-08】 | 🔨 待办 | — | 待验 | [渠道包工厂 SPEC](docs/superpowers/specs/2026-08-04-channel-package-factory-and-incremental-update.md) · [智溯AI构建证据](orchestrator/GATE-T718-BUILD.md) | 以智溯AI安装包设置页“技能清单不可用（未能读取技能注册表）”为真机事实，对比正常 CreatorOS 包与渠道包的 `appIdentifier`、Tauri `dataDir/appDataDir`、sidecar 工作目录、Skill 注册表落点和前端 API origin；明确区分桌面身份隔离造成的新空目录、打包遗漏、跨域/可信 origin 拒绝与 sidecar 读取失败，禁止把业务链接域名直接当成根因。修复后渠道包必须从自身受控数据目录稳定读取同一套内置 Skill，并在变更五个 Growth 业务域名后仍可读取；不同渠道包的用户数据、密钥与配置继续物理隔离，不得为兼容而退回 CreatorOS 共用目录。补正常包/渠道包、首次启动/已有数据、不同业务域名的打包后真机回归与可行动错误日志；本任务不发布、不改线上 Growth。 |

<a id="t-720"></a>
## T-720
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-720 | 根治特定 Windows 设备抖音内置浏览器页面崩溃导致内容雷达主页验证失败【飞书用户日志·2026-08-08】 | 📋 待办 | — | 待验 | [飞书反馈记录](https://my.feishu.cn/base/S1BRb4i6kaD0bnsViJSco0jxnRg?table=tblIPu0er91yGTwL&view=vewb4HsOUz) · 既有 Chromium guard 与抖音采集契约 | 该问题目前只在飞书记录 `rec27WFKVrkvAY` 对应的一台 Windows 设备出现，不得扩大表述为 Windows 普遍故障。用户链接本身是完整 `douyin.com/user/...`；该机 `v0.2.1-beta.3` 日志显示从作品同步、单条导入到对标主页预览连续多日全部失败于 `page.goto: Page crashed`，更符合随包 Chromium 与该机运行环境、显卡/沙箱、安全软件、资源或运行时完整性的兼容异常。当前 main 仍只在同一崩溃 page 上退避重试，并把未知错误误译成“请确认登录/完整链接”，因此缺少单机异常恢复与诊断。须统一识别 page/context/browser crash，先新建 page、仍失败再关闭失效 context 并基于同一账号 profile 做一次有界重建与浏览器回落；作品采集和主页预览复用同一恢复能力。仍失败时返回“本机内置浏览器异常”的可行动提示，记录脱敏的浏览器版本、可执行路径、OS/arch、启动参数、page/context crash 与资源线索，禁止误报链接或登录。补 Windows 打包后真导航回归和兼容性样本，且不得清空 Cookie 或伪造验证成功。 |

### 外置更新 2026-08-17
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-720 | 根治特定 Windows 设备抖音内置浏览器页面崩溃导致内容雷达主页验证失败【飞书用户日志·2026-08-08】 | 📋 待办 | — | 待验 | [飞书反馈记录](https://my.feishu.cn/base/S1BRb4i6kaD0bnsViJSco0jxnRg?table=tblIPu0er91yGTwL&view=vewb4HsOUz) | [详情](BACKLOG-details.md#t-720) |

<a id="t-719"></a>
## T-719
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-719 | 根治桌面端启动后二次白屏闪烁与首页排期提醒不可用【启动稳定性·用户录屏 2026-08-07】 | 🔨 待办 | — | 待验 | [Windows 生产闭环](docs/superpowers/specs/2026-08-03-windows-production-closure-default-release.md) · [T-599 排期提醒契约](docs/superpowers/specs/2026-07-29-project-publishing-schedule.contract.md) | 基于用户 7.36 秒录屏排查“页面已完整渲染后又被整页白屏覆盖/重复刷新”的启动时序，统一检查桌面壳、sidecar 就绪、导航、onboarding 与前端 hydration，禁止用循环刷新掩盖启动失败；首页排期提醒必须读取当前账号真实排期，未绑定账号或无排期时显示真实 0/空态，只有真实服务异常才显示可重试错误，并留下完整脱敏诊断日志。补跨层回归后交付，不把 macOS 录屏或 fixture 冒充 Windows 真机回执。 |

### 外置更新 2026-08-17
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-719 | 根治桌面端启动后二次白屏闪烁与首页排期提醒不可用【启动稳定性·用户录屏 2026-08-07】 | 🔨 待办 | — | 待验 | [Windows 生产闭环](docs/superpowers/specs/2026-08-03-windows-production-closure-default-release.md) | [详情](BACKLOG-details.md#t-719) |

<a id="t-718"></a>
## T-718
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-718 | 补齐智溯AI包内品牌并交付完整 Growth 配置后重打本地包【渠道验收失败·用户 2026-08-07】 | 🔨 待办 | — | 待验 | [渠道包工厂 SPEC](docs/superpowers/specs/2026-08-04-channel-package-factory-and-incremental-update.md) · [智溯AI文件矩阵](docs/research/2026-08-04-zhisu-ai-package-file-change-matrix.md) · [本机构建证据](orchestrator/GATE-T718-BUILD.md) | 修复 T-717 仅替换系统应用名与图标、应用内部窗口标题和侧边栏仍显示 CreatorOS 的白标缺口：包级身份必须在激活前提供智溯AI品牌，激活后由受信任 Growth 配置继续作为运行时品牌与业务链接权威；侧边栏品牌名和品牌图标、页面标题等用户可见壳层不得残留 CreatorOS。把包含 channelService 与 productConfig 的完整 Growth JSON 固化进智溯科技交付目录，完成测试、重构建、唯一安装、真实启动和界面截图验收；同步升级项目级 `packaging-creatoros-channel` Skill，把窗口标题、侧边栏名称/图标、完整 Growth 配置与真机截图列为后续白标包强制 Gate，不上传、不发布、不修改线上 Growth。 |

### 外置更新 2026-08-17
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-718 | 补齐智溯AI包内品牌并交付完整 Growth 配置后重打本地包【渠道验收失败·用户 2026-08-07】 | 🔨 待办 | — | 待验 | [渠道包工厂 SPEC](docs/superpowers/specs/2026-08-04-channel-package-factory-and-incremental-update.md) | [详情](BACKLOG-details.md#t-718) |

<a id="t-716"></a>
## T-716
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-716 | 完善 Copilot 局部改稿、脚本版本回退、附件上下文与素材中心稳定排序【创作编辑闭环·用户 2026-08-06】 | 🔨 待办 | — | 部分通过；整项未验收 | [实现规格](docs/superpowers/specs/2026-08-06-copilot-script-editing-and-attachments.md) · [验收审计](docs/research/2026-08-13-t716-t732-acceptance-audit.md) · [T-691 Copilot 生命周期](docs/superpowers/specs/2026-08-04-copilot-project-lifecycle-tool-closure.md) | 素材中心统一按真实 `createdAt DESC` 稳定排序，最新素材始终在前；稿面段落支持把明确选区/段落锚点交给 Copilot 定点改写，AI 只产局部补丁候选，用户确认后合并为新的完整脚本版本，不再默认整稿重生成；口播脚本提供版本下拉、预览与恢复，恢复只切换到既有不可变版本、不制造重复版本；所有工具在执行前重读服务端当下真值，不使用对话或客户端旧快照；分镜“点名素材”展示真实文件名/标题而非裸 `assetId`；Copilot 输入框支持拖拽或选择文件与图片，复用项目素材上传和安全读取链形成显式上下文，支持视觉的模型可读图片，不支持时给出清晰能力提示且不得假装已识别。全部闭环后按 T-713 统一生成 CreatorOS 0.3.0 macOS 本地测试包。 |

### 外置更新 2026-08-17
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-716 | 完善 Copilot 局部改稿、脚本版本回退、附件上下文与素材中心稳定排序【创作编辑闭环·用户 2026-08-06】 | 🔨 待办 | — | 待验 | [实现规格](docs/superpowers/specs/2026-08-06-copilot-script-editing-and-attachments.md) · [验收审计](docs/research/2026-08-13-t716-t732-acceptance-audit.md) | [详情](BACKLOG-details.md#t-716) |

<a id="t-715"></a>
## T-715
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-715 | 在 CreatorOS 增加 Growth AI 额度账户连接、查看与充值入口【额度闭环·用户 2026-08-06】 | 🔨 待办 | — | 待验 | [真实联调 Gate](orchestrator/GATE-T715-BUILD.md) · [Growth T-137 充值契约](../Thirdspace-growth/docs/contracts/T-137-ai-credit-recharge.md) · [T-679 受管模型契约](docs/superpowers/specs/2026-08-02-capability-scoped-channel-model-authority.md) | 复用当前激活权益申请全新 config access ticket，调用 Growth 创建一次性额度会话；CreatorOS 只提供“查看 AI 额度与消耗”入口，首次固定打开 Growth 用户端 `/credits/connect#<one-time-code>` 完成登录/注册与绑定，已绑定时固定打开用户端 `/credits/launch#<one-time-code>`，不得出现端选择，也不得因 partner/channel/admin 角色转去管理端或渠道端。票据、一次性码、激活码、充值码和受管子 Key 不得进入 URL query、日志或普通缓存。受管 AI 额度耗尽时，Copilot 与异步任务必须显示“AI 额度不足”并提供同一安全用户端充值入口，不得冒充模型故障或暴露模型、服务商和中转实现；用户自配模型的余额错误仍按本地模型配置处理。CreatorOS 只负责安全入口和本地激活状态，额度汇总、刷新、充值和账本归 Growth；本任务不修改 Activity。2026-08-06 真机已到达 Growth 用户端且 fragment 被移除，但生产兑换失败（脱敏参考号见 Gate），因此保持待验，不能把打开页面冒充额度闭环。 |

### 外置更新 2026-08-17
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-715 | 在 CreatorOS 增加 Growth AI 额度账户连接、查看与充值入口【额度闭环·用户 2026-08-06】 | 🔨 待办 | — | 待验 | [真实联调 Gate](orchestrator/GATE-T715-BUILD.md) | [详情](BACKLOG-details.md#t-715) |

<a id="t-714"></a>
## T-714
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-714 | 接入工程教训闭环并迁移旧账本，确保真实踩坑可被后续任务自动复用【工程进化·用户 2026-08-06】 | 📋 待办 | — | 待验 | [`product-to-code-orchestrator`](orchestrator/process/.skill-version) · [教训账本](orchestrator/LESSON_LEDGER.md) · [注入门](orchestrator/gates/lessons-injection-gate.md) | 升级并接入 `product-to-code-orchestrator` 最新教训闭环：`eval_red` 必须幂等进入 observation 收件箱，完整事件流不得因过滤后错位归档而丢失；把旧 `active/promoted` 账本显式审计和迁移，只有同 ID 可执行守卫或通过注入门的 `candidate/rule` 才能进入阶段上下文；为 BUILD/SHIP 提供可重复的 `lessonctl audit/context` 验证，持续完善通用 Skill 与项目守卫。该任务只管工程流程，不替代产品运行时 Skill 迭代任务 T-087。 |

### 外置更新 2026-08-17
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-714 | 接入工程教训闭环并迁移旧账本，确保真实踩坑可被后续任务自动复用【工程进化·用户 2026-08-06】 | 📋 待办 | — | 待验 | [`product-to-code-orchestrator`](orchestrator/process/.skill-version) | [详情](BACKLOG-details.md#t-714) |

<a id="t-713"></a>
## T-713
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-713 | 构建包含通用智能体语义边界与当前制作修复的 macOS 0.3.0 本地测试包【本地验收·用户 2026-08-06】 | 🔨 待办 | — | 待验 | [发布流程](docs/RELEASING.md) · [T-712 制作体验](docs/superpowers/specs/2026-08-05-video-production-editing-loop.md) | 基于当前 main 脏工作区完整构建 CreatorOS 0.3.0 macOS 本地测试包，复用统一 Node 25 + `release-fast` 流水线，包含 `material.match` 语义匹配、成片预览与项目级语义边界门卫；不清理或覆盖并行改动，不走 Developer ID、公证、上传或远端发布。构建成功后必须自动替换唯一 `/Applications/CreatorOS.app`、启动应用并确认真实进程，禁止只交付包路径；最终回报 DMG 绝对路径、大小、SHA-256、签名状态与真实启动自检证据。 |

### 外置更新 2026-08-17
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-713 | 构建包含通用智能体语义边界与当前制作修复的 macOS 0.3.0 本地测试包【本地验收·用户 2026-08-06】 | 🔨 待办 | — | 待验 | [发布流程](docs/RELEASING.md) | [详情](BACKLOG-details.md#t-713) |

<a id="t-712"></a>
## T-712
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-712 | 优先采用用户上传素材进入 B-roll 时间线、恢复成片预览并收回渠道同步常驻提示【制作体验·本机实测 2026-08-05】 | 🔨 待办 | — | 待验 | [T-687 口播联想画面 Skill](docs/superpowers/specs/2026-08-04-voiceover-associative-visual-skill.md) · [T-703 视频制作闭环](docs/superpowers/specs/2026-08-05-video-production-editing-loop.md) | 项目上传/挂载的视频和图片进入候选后，`video.broll` 只产画面需求，统一由现有 `material.match` Skill 结合口播、场景、画面需求、原始文件名、尺寸/时长与真实素材清单做 AI 语义匹配；代码只校验真实 assetId、场景和时间边界，禁止写死词表或用字符串相似度替 AI 选素材。首轮进入时间线的素材即视为已绑定；人工只改一处时也必须把全部既有绑定作为硬约束继承，并在当前方案上重算插点和展示时长，禁止新一轮洗掉旧绑定。AI 必须显式判断素材为录屏、静态图片、普通实拍或封面，并同时决定主视觉、镜头运动与有效展示时长；只有需要阅读或观察操作的录屏才能真正 `full_frame`，全屏录屏期间人物保留为左下角画中画；静态图片和普通实拍保持原始比例进入独立安全舞台，永不强行全屏，封面永不进入时间线。任意时刻只允许一个非 overlay 主素材，下一主素材进场必须结束上一主素材并清空旧信息卡，禁止横图、竖图和标题多层叠放。竖图/竖视频保持原始比例和竖版舞台，主视觉不得遮脸。本轮不更换 CreatorOS 既有视觉风格，只修复横竖屏素材呈现与时间线回归。竖版无主视觉时人物铺满手机画布；普通信息卡不得把人物降成角落小窗；横图/横录屏在保留完整原图的同时用同源氛围层或上下分区填充竖屏，禁止中央窄条加巨幅黑边；新生成素材必须按本次交付画幅构图。场景名、`SCENE/分镜序号` 与整段口播摘要只属于编辑层，不得烧进成片；上屏文字只保留经 AI 编导筛选的短标题、数字、对比、清单和金句，并用渐进式动画表达，禁止做成干巴巴的 PPT 复述。成片抽帧先跑确定性遮挡/可读性门；配置视觉模型时再做非阻断视觉审核。分场、信息卡、真人主画面、用户素材/B-roll 与字幕必须先各自通过结构契约审核，再由唯一 `video.director` 读入完整候选时间线统筹审片。总导演内部只有“修到可渲染”：发现视觉空档、素材时长/语义承接或字幕时间问题时，必须保留已绑定素材，在原方案内自动收口时长、做素材接力并用口播原文信息卡补位，再执行有界复审；不得把“缺素材/阻断/重新配分镜”退给用户。审片模型不可用时由确定性修片层补齐并交用户最终过目，禁止无限重试或编造事实。以本机真实成片和完整项目素材包建立可重复回归 loop，必须由 CreatorOS 当前配置模型真实跑素材语义和分镜，每轮落模型决策、render props、确定性 Gate、成片和抽帧证据，直到静态图不全屏、全屏录屏保留左下画中画、封面不入时间线、主视觉无重叠。已生成的 `final.mp4` 必须通过受控临时预览 URL 在桌面 WebView 可播放并支持 Range。右下角渠道同步提示只在设置页展示。 |

### 外置更新 2026-08-17
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-712 | 优先采用用户上传素材进入 B-roll 时间线、恢复成片预览并收回渠道同步常驻提示【制作体验·本机实测 2026-08-05】 | 🔨 待办 | — | 待验 | [T-687 口播联想画面 Skill](docs/superpowers/specs/2026-08-04-voiceover-associative-visual-skill.md) | [详情](BACKLOG-details.md#t-712) |

<a id="t-709"></a>
## T-709
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-709 | 将 macOS Developer ID 签名与 Apple 公证凭据接入 GitHub 正式发布流水线【发布安全·用户 2026-08-05】 | 🔨 待办 | — | 待验 | [发布流程](docs/RELEASING.md) · [T-640 Gate](orchestrator/GATE-T640-BUILD.md) | `desktop-release` 的 macOS job 必须从 GitHub Secrets 导入 Developer ID P12 到一次性钥匙串，使用同一身份签入 sidecar、Tauri App 与 DMG，再通过临时 `notarytool` profile 完成 submit、staple、Gatekeeper 和真启动验收；缺任一凭据必须 fail-closed，证书、密码、私钥不得写入仓库、artifact 或日志。本轮只改代码与文档，不触发远端流水线。 |

### 外置更新 2026-08-17
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-709 | 将 macOS Developer ID 签名与 Apple 公证凭据接入 GitHub 正式发布流水线【发布安全·用户 2026-08-05】 | 🔨 待办 | — | 待验 | [发布流程](docs/RELEASING.md) | [详情](BACKLOG-details.md#t-709) |

<a id="t-708"></a>
## T-708
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-708 | 全局审计并软化 AI 工具中不合理的创作完整度门禁【工具灵活性·用户 2026-08-05】 | 🔨 待办 | — | 待验 | [门禁全局审计](docs/research/2026-08-05-ai-tool-hard-gate-audit.md) · [T-707 定位 Copilot SPEC](docs/superpowers/specs/2026-08-01-positioning-pre-interview-workflow.md#101-工具门禁统一规则) · [T-646 结构化工具可靠性](docs/research/2026-08-01-structured-ai-tool-reliability-audit.md) | 全局检查工具描述、系统提示、UI 禁用态和执行层校验：只保留鉴权/归属/隐私安全/破坏性操作/幂等冲突/真实事实不可伪造等硬门；六问完成、先选多个方向、先联网、素材齐全、格式或长度完整等质量条件改为软提示，用户明确要求时先返回可编辑候选并标注假设、缺口和风险，禁止因增强步骤失败清空已有结果。 |

### 外置更新 2026-08-17
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-708 | 全局审计并软化 AI 工具中不合理的创作完整度门禁【工具灵活性·用户 2026-08-05】 | 🔨 待办 | — | 待验 | [门禁全局审计](docs/research/2026-08-05-ai-tool-hard-gate-audit.md) | [详情](BACKLOG-details.md#t-708) |

<a id="t-707"></a>
## T-707
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-707 | 将定位前采收敛为 Copilot 主导的自适应编导访谈并直接闭环定位中心【定位精准度·飞书反馈 2026-08-05】 | 🔨 待办 | PASS[REV:06867c4bf60c] | 待验 | [T-652 前采工作流](docs/superpowers/specs/2026-08-01-positioning-pre-interview-workflow.md) · [T-666 非破坏草稿](docs/superpowers/specs/2026-08-02-positioning-non-destructive-draft.md) | 按用户 2026-08-05 最新确认更新 T-652：所有定位采集与修改统一放进定位 Copilot，第一轮先选“基于当前账号继续深入 / 调整定位 / 重新定位”并决定旧母版、作品和逐字稿能否进入证据；确定性场景路由只追问一个缺口或冲突，取消六页问卷、联网搜索退出主链。有产品/服务或获客成交目标时，Copilot 必须进一步沉淀独立“产品与人群”结构化模块：主推产品、核心/高潜/暂不服务人群、真实场景、痛点链、现有替代、顾虑、证明与内容承接，并随正式定位版本真实进入选题、写稿、审核和项目 Copilot；纯聊天建议或空洞人口标签不算完成。国内语境以小红书人群反漏斗和巨量云图人群关系/内容洞察为主要参考。 |

### 外置更新 2026-08-17
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-707 | 将定位前采收敛为 Copilot 主导的自适应编导访谈并直接闭环定位中心【定位精准度·飞书反馈 2026-08-05】 | 🔨 待办 | PASS[REV:06867c4bf60c] | 待验 | [T-652 前采工作流](docs/superpowers/specs/2026-08-01-positioning-pre-interview-workflow.md) | [详情](BACKLOG-details.md#t-707) |

<a id="t-705"></a>
## T-705
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-705 | 根治 macOS 本地包启动后落入 Page Not Found【发布阻断·本机实测 2026-08-05】 | 🔨 待办 | — | 待验 | [发布流程](docs/RELEASING.md) · [T-703 SPEC](docs/superpowers/specs/2026-08-05-video-production-editing-loop.md) | 新构建的 CreatorOS 0.3.0 DMG 安装后，sidecar 已 Ready 但 WebView 显示 Page Not Found；须从壳层启动 URL、授权重定向、Next standalone 路由与首次导航链定位根因并修复，补真实打包产物启动回归，确保首页或激活页返回真实 200 且不可再用“sidecar 进程存活”冒充页面可用。 |

### 外置更新 2026-08-17
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-705 | 根治 macOS 本地包启动后落入 Page Not Found【发布阻断·本机实测 2026-08-05】 | 🔨 待办 | — | 待验 | [发布流程](docs/RELEASING.md) | [详情](BACKLOG-details.md#t-705) |

<a id="t-703"></a>
## T-703
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-703 | 根治视频制作从分镜到预览、对话调剪、采纳与再制作的多处断裂并重打本地包【制作闭环·用户 2026-08-05】 | 🔨 待办 | PASS[REV:c1a3920aea71] | 待验 | [SPEC](docs/superpowers/specs/2026-08-05-video-production-editing-loop.md) | 统一修复：分镜指定的 B-roll/录屏素材必须按节点进入真实渲染时间线并回显未采用原因；配图辅助文字禁止把文件名/内部标签烧进成片；项目编导对话可读当前分镜/素材/渲染状态并产可确认的局部调整；制作页拖拽不劫持页面；确认后的分镜可持续回顾；生成视频先预览后采纳；字幕时间轴只认 SRT/ASR，口播稿只校正有依据的错字/专名。成片已生成或已采纳后仍可重新分镜、按当前分镜重新生成，旧版保留；制作视频时可选竖屏 9:16 或横屏 16:9，选择须贯穿 AI 分镜 skill、render props、预览和 export，禁止后台写死横屏。完成聚焦测试、项目真实链路回读与本地测试包构建，给出产物路径和哈希，不走公证。 |

### 外置更新 2026-08-17
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-703 | 根治视频制作从分镜到预览、对话调剪、采纳与再制作的多处断裂并重打本地包【制作闭环·用户 2026-08-05】 | 🔨 待办 | PASS[REV:c1a3920aea71] | 待验 | [SPEC](docs/superpowers/specs/2026-08-05-video-production-editing-loop.md) | [详情](BACKLOG-details.md#t-703) |

<a id="t-702"></a>
## T-702
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-702 | 根治审核“应用改写”后分镜稿格式坍缩为 Markdown 表格源码【稿面编辑·用户 2026-08-05】 | 📋 待办 | — | 待验 | 既有稿面审核门与脚本 artifact 版本契约 | “应用改写”只能替换用户确认的命中片段，必须完整保留当前脚本的 `contentData`、富文本 HTML、分镜 sections、画面/字幕/时长等结构与当前视图；禁止把 sections 临时拼成 `heading + body` 的纯文本后覆盖 canonical `contentText`，也禁止在命中只存在于全文时创建一个丢失 `contentData` 的新版本。统一稿面审核卡与 Copilot 审核卡的单一替换函数，覆盖 Markdown 表格、纯文本稿、结构化分镜稿、连续应用多条建议、刷新及撤销回滚测试；写后页面仍按原格式显示，只改变目标文案。 |

### 外置更新 2026-08-17
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-702 | 根治审核“应用改写”后分镜稿格式坍缩为 Markdown 表格源码【稿面编辑·用户 2026-08-05】 | 📋 待办 | — | 待验 | 既有稿面审核门与脚本 artifact 版本契约 | [详情](BACKLOG-details.md#t-702) |

<a id="t-695"></a>
## T-695
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-695 | 清理应用内硬编码品牌并让白标用户表面保持中性【白标体验·用户 2026-08-04】 | 🔨 待办 | — | 待验 | [白标边界](docs/research/2026-08-04-white-label-runtime-vs-package-boundary.md) · [课程架构](docs/superpowers/specs/2026-08-03-built-in-ip-course-architecture.md) | 全局审计用户可见文案中的 `CreatorOS` 等固定品牌：产品身份确实需要展示时统一读取渠道运行时品牌并保留官方默认值，课程标题、课程角标、课程说明、引导语和示例等不需要品牌背书的位置统一改成中性文案；本轮至少将“CreatorOS IP 创作实战课”收敛为“创作实战课”，不得改动包标识、协议名、环境变量、数据目录、内部 schema 或日志诊断标识。补课程清单与关键用户表面回归测试及可见文案扫描。 |

### 外置更新 2026-08-17
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-695 | 清理应用内硬编码品牌并让白标用户表面保持中性【白标体验·用户 2026-08-04】 | 🔨 待办 | — | 待验 | [白标边界](docs/research/2026-08-04-white-label-runtime-vs-package-boundary.md) | [详情](BACKLOG-details.md#t-695) |

<a id="t-691"></a>
## T-691
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-691 | 补齐 Copilot 单项目全生命周期、跨项目历史与审核改稿工具闭环【Context 契约·用户 2026-08-04】 | 🔨 待办 | PASS[REV:9444ca5b32a9] | 待验 | [SPEC](docs/superpowers/specs/2026-08-04-copilot-project-lifecycle-tool-closure.md) · [断点审计](docs/research/2026-08-04-copilot-tool-layer-break-audit.md) | 在既有 Context 单一架构内一次补齐：修复稿面已存在却被工具读成空的账号/项目同源一致性与错误语义；提供单项目脚本/逐字稿、分镜、项目素材、封面、发布、指标留存、审核报告的全生命周期读取；允许用户明确要求时检索历史项目；支持读取并由用户明确确认后批量应用审核建议生成可回滚新版本；修正提示词与工具 schema 矛盾并用真实跨层 E2E 防回归。 |

### 外置更新 2026-08-17
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-691 | 补齐 Copilot 单项目全生命周期、跨项目历史与审核改稿工具闭环【Context 契约·用户 2026-08-04】 | 🔨 待办 | PASS[REV:9444ca5b32a9] | 待验 | [SPEC](docs/superpowers/specs/2026-08-04-copilot-project-lifecycle-tool-closure.md) | [详情](BACKLOG-details.md#t-691) |

<a id="t-694"></a>
## T-694
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-694 | 建立多渠道专属包工厂、项目级出包 Skill 与安全增量更新闭环【渠道规模化·用户 2026-08-04】 | 🔨 待办 | PASS[REV:2c7be136aea0] | 待验 | [SPEC](docs/superpowers/specs/2026-08-04-channel-package-factory-and-incremental-update.md) · [T-693 文件矩阵](docs/research/2026-08-04-zhisu-ai-package-file-change-matrix.md) · [T-690 增量更新调研](docs/research/2026-08-03-desktop-incremental-updater-research.md) | 将未来 N 个渠道统一收敛为闭集 PackageManifest 输入和一条可复现出包命令，参数化应用名、图标、identifier、expectedChannelRef、数据/密钥隔离、产物名、签名证明与更新命名空间；建立项目级 Skill，通过用户给出的品牌、业务链接、渠道标识和图标自动校验、导入、构建、真安装验证并停在发布确认前；同时按既有调研落地共享公共 runtime 的版本化分层/内容寻址更新，官方包与每个渠道包只读取各自签名 manifest，支持断点续传、原子切换、失败回滚及整包兜底，禁止二进制差分首发、串渠道更新和未验签代码执行。 |

### 外置更新 2026-08-17
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-694 | 建立多渠道专属包工厂、项目级出包 Skill 与安全增量更新闭环【渠道规模化·用户 2026-08-04】 | 🔨 待办 | PASS[REV:2c7be136aea0] | 待验 | [SPEC](docs/superpowers/specs/2026-08-04-channel-package-factory-and-incremental-update.md) | [详情](BACKLOG-details.md#t-694) |

<a id="t-686"></a>
## T-686
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-686 | 根治定位前采联网补充直接报错并恢复国内中文公开检索【定位前采·本机实测 2026-08-04】 | 🔨 待办 | — | 待验 | [T-652 前采工作流](docs/superpowers/specs/2026-08-01-positioning-pre-interview-workflow.md) · [真实浏览器旅程](orchestrator/T686-FRONTEND-JOURNEY.md) · T-684 浏览器检索 | **范围已被用户 2026-08-05 决策覆盖：联网搜索退出定位前采主链，T-707 不调用本能力。** 若该任务继续，只能作为通用浏览器检索可靠性修复或方向生成后的用户主动可选参考，失败不得影响前采、生成方向或采纳定位，也不得把模型记忆冒充搜索结果；开始实现前须先按新范围收口任务状态，禁止继续把 `positioning.discovery.research` 接回前采页面。 |

### 外置更新 2026-08-17
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-686 | 根治定位前采联网补充直接报错并恢复国内中文公开检索【定位前采·本机实测 2026-08-04】 | 🔨 待办 | — | 待验 | [T-652 前采工作流](docs/superpowers/specs/2026-08-01-positioning-pre-interview-workflow.md) | [详情](BACKLOG-details.md#t-686) |

<a id="t-687"></a>
## T-687
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-687 | 建立口播联想画面 Skill 并打通图序号引用、项目 B-roll 与成片渲染【视觉创作主链·本机日志 2026-08-04】 | 🔨 待办 | — | 待验 | [口播联想画面 Skill SPEC](docs/superpowers/specs/2026-08-04-voiceover-associative-visual-skill.md) · [T-642 编导证据链 SPEC](docs/superpowers/specs/2026-08-01-content-radar-creative-handoff.md) · T-661 项目素材制作闭环 | 从口播语义节拍生成“观众能联想到什么”的画面计划，区分事实证据、类比联想、过程示意、情绪氛围与信息卡，禁止只复述口播或批量生成通用图库图；支持 `image2`、`图2`、`第二张`、`刚才那组第二张`等会话别名确定性解析到真实候选或素材，不能再靠标题模糊搜索；用户采纳后必须原子绑定当前项目 `broll` 并刷新制作候选，视频决策只引用真实已采纳素材，成片前验证所选素材已成功解析和进入画面，缺失时明确报错而不是静默出无素材成片。Skill 只承载编导判断，别名、项目绑定、刷新和渲染校验必须由确定性代码与契约保证；按 Skill 规则先补失败基线测试再实现。 |

### 外置更新 2026-08-17
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-687 | 建立口播联想画面 Skill 并打通图序号引用、项目 B-roll 与成片渲染【视觉创作主链·本机日志 2026-08-04】 | 🔨 待办 | — | 待验 | [口播联想画面 Skill SPEC](docs/superpowers/specs/2026-08-04-voiceover-associative-visual-skill.md) | [详情](BACKLOG-details.md#t-687) |

<a id="t-685"></a>
## T-685
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-685 | 排查并根治全流程写稿长度失控及审核不识别已采纳文案卡【创作主链·本机日志 2026-08-04】 | 🔨 待办 | — | 待验 | [T-642 编导证据链 SPEC](docs/superpowers/specs/2026-08-01-content-radar-creative-handoff.md) · T-680 写稿可靠性 | 以本机最新完整日志和真实项目状态串起 `script.draft` 请求、异步任务、脚本候选卡、用户采纳、正式 `output_script` 产物与 `review.script` 读取；定位文案反复过短/过长的长度约束、重试与部分结果处理问题，以及审核为何持续误判“没有采纳文案卡”。修复后目标时长只做合理区间约束，不因轻微偏差整稿失败或无效重试；采纳成功必须原子落成审核唯一读取的正式脚本并刷新回显，审核不得读取旧项目快照、聊天卡或空产物清单。 |

### 外置更新 2026-08-17
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-685 | 排查并根治全流程写稿长度失控及审核不识别已采纳文案卡【创作主链·本机日志 2026-08-04】 | 🔨 待办 | — | 待验 | [T-642 编导证据链 SPEC](docs/superpowers/specs/2026-08-01-content-radar-creative-handoff.md) | [详情](BACKLOG-details.md#t-685) |

<a id="t-684"></a>
## T-684
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-684 | 根治 Copilot 联网搜素材失败后回退模型记忆并误导配置搜索模型【浏览器检索·用户截图 2026-08-04】 | 🔨 待办 | — | 待验 | 既有 `material.gather`、`web.search` 浏览器适配器与 T-645 隐藏模型配置契约 | 普通用户发起联网搜素材时须直接走随包浏览器检索，不依赖或暴露已隐藏的搜索模型配置；默认引擎导航、反爬或 SERP 解析失败/返回 0 条时，按国内中文来源优先切换备用搜索引擎并记录可诊断失败原因，全部真实检索失败则返回明确空态和可重试动作，禁止继续调用模型生成并用 `grounding=model_memory` 凑出无 URL 的“搜索结果”；清理 system prompt、工具说明和错误文案里“设置→模型→联网搜索”的旧指引。 |

### 外置更新 2026-08-17
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-684 | 根治 Copilot 联网搜素材失败后回退模型记忆并误导配置搜索模型【浏览器检索·用户截图 2026-08-04】 | 🔨 待办 | — | 待验 | 既有 `material.gather`、`web.search` 浏览器适配器与 T-645 隐藏模型配置契约 | [详情](BACKLOG-details.md#t-684) |

<a id="t-683"></a>
## T-683
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-683 | 修复 Copilot 在 Windows 无法读取盘符绝对路径与目录授权失效【本地文件读取·用户截图 2026-08-04】 | 🔨 待办 | — | 待验 | 既有 `local.read` 安全归一、HITL 授权和本地工作区契约 | `local.read` 必须按当前运行平台接受 Windows 盘符路径、UNC 路径和 `~` 家目录，同时继续接受 macOS/POSIX 路径；读取、授权判定、授权写入和目录长期授权必须共用同一规范化与包含关系，不能把 `E:\\...` 判为相对路径，也不能因分隔符不同导致子文件反复弹授权；工具说明须展示当前平台正确示例，模型不得再声称 Windows 文件不可读。 |

### 外置更新 2026-08-17
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-683 | 修复 Copilot 在 Windows 无法读取盘符绝对路径与目录授权失效【本地文件读取·用户截图 2026-08-04】 | 🔨 待办 | — | 待验 | 既有 `local.read` 安全归一、HITL 授权和本地工作区契约 | [详情](BACKLOG-details.md#t-683) |

<a id="t-679"></a>
## T-679
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-679 | 接入 Growth 按激活权益签发的受管模型凭据、真实模型白名单与用户选择【模型服务最小闭环·用户 2026-08-04】 | 🔨 待办 | — | 待验 | [Growth 持久凭据契约](/Users/zyongzhu/Workbase/Thirdspace-growth/docs/contracts/T-133-activation-managed-model-subkey.md) · [Growth ASR 临时授权契约](/Users/zyongzhu/Workbase/Thirdspace-growth/docs/contracts/T-135-qwen-asr-direct-client.md) | CreatorOS 在 Activity 激活并取得 `config-access-ticket-v2` 后，为文本/图片/视频同步同一权益的 persistent 受管子 Key并安全写入系统密钥库；从已签名配置动态渲染真实模型并持久化白名单内选择。语音转文字作为同一任务的 per_request 增量：兼容旧 bundle 缺 lifecycle，新 bundle 只接受精确双 service；客户端已按稳定的 API-282 合同完成文件先验、稳定幂等、单次内存临时授权、精确直连与 Whisper 单次回退，provider_unknown/expired 不换 key、不重复申请。T-768 已覆盖旧的 ASR 阻断语义：未绑定、额度不足及任何云端异常均只尝试一次本地 Whisper；T-715 额度入口可保留为提示，但不得阻断转写。用户侧不得出现中转站、provider、Base URL、serviceId、长期 Key、临时 token 或 ticket。聚焦测试已通过；非 fixture 的 Activity ticket → Growth bundle → lease → 直连转写 → 总额度减少 25,000 回执仍待真机验证，因此不得宣称 E2E 完成；Activity 不修改。 |

### 外置更新 2026-08-17
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-679 | 接入 Growth 按激活权益签发的受管模型凭据、真实模型白名单与用户选择【模型服务最小闭环·用户 2026-08-04】 | 🔨 待办 | — | 待验 | [Growth 持久凭据契约](/Users/zyongzhu/Workbase/Thirdspace-growth/docs/contracts/T-133-activation-managed-model-subkey.md) | [详情](BACKLOG-details.md#t-679) |

<a id="t-678"></a>
## T-678
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-678 | 根治内容雷达生成选题继续读取旧定位【定位消费一致性·飞书用户 2026-08-04】 | 📋 待办 | — | 待验 | [T-652 定位前采 SPEC](docs/superpowers/specs/2026-08-01-positioning-pre-interview-workflow.md) · [T-642 编导证据链 SPEC](docs/superpowers/specs/2026-08-01-content-radar-creative-handoff.md) | 用户保存新定位后，内容雷达新建选题必须读取当前正式定位，并在任务创建时冻结完整定位母版快照（陈述、关键词、画像、规则与版本），结果明确显示所用版本；禁止只透传旧 `positioningVersionId` 的陈述/关键词，或因路由缓存继续携带修改前内容。 |

### 外置更新 2026-08-17
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-678 | 根治内容雷达生成选题继续读取旧定位【定位消费一致性·飞书用户 2026-08-04】 | 📋 待办 | — | 待验 | [T-652 定位前采 SPEC](docs/superpowers/specs/2026-08-01-positioning-pre-interview-workflow.md) | [详情](BACKLOG-details.md#t-678) |

<a id="t-676"></a>
## T-676
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-676 | 根治云端 ASR 测试假阳性并接通 StepFun，同时修复 Windows 本地 Whisper 回退【逐字稿阻断·飞书用户 2026-08-03】 | 📋 待办 | — | 待验 | 既有 `transcribe.audio` 多模态适配器与设置连接测试契约 | `transcribe.audio` 只能保存客户端真实支持的供应商，或提供与其协议一致的专用适配器；为 `stepaudio-2.5-asr` 接入 StepFun JSON/base64/SSE 转写链，连接测试必须走同一适配器能力而非只测 `/v1/models`。同时以用户 Windows 日志复现并根治本地 Whisper 的独立 worker/GLib 失败，确保云端配置不可用时回退不再二次失败。 |

### 外置更新 2026-08-17
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-676 | 根治云端 ASR 测试假阳性并接通 StepFun，同时修复 Windows 本地 Whisper 回退【逐字稿阻断·飞书用户 2026-08-03】 | 📋 待办 | — | 待验 | 既有 `transcribe.audio` 多模态适配器与设置连接测试契约 | [详情](BACKLOG-details.md#t-676) |

<a id="t-671"></a>
## T-671
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-671 | 确定 CreatorOS 代理商业模式与官网价格边界【渠道商业化·用户 2026-08-02/03】 | 🔨 待办 | — | 待验 | [代理合作口径](docs/superpowers/specs/2026-08-02-creatoros-agent-channel-policy.md) · [公开信息收口](docs/superpowers/specs/2026-08-03-creatoros-public-price-contact-withdrawal.md) · [渠道白标调研](docs/research/2026-08-01-channel-white-label-runtime-branding-audit.md) | 代理价盘与资格仍是内部经营规则，不再作为官网公开内容；官网不展示任何价格、利润、个人联系方式或直营购买入口，只引导访问者联系向其推荐 CreatorOS 的授权合作伙伴，保护代理线索和成交空间。 |

### 外置更新 2026-08-17
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-671 | 确定 CreatorOS 代理商业模式与官网价格边界【渠道商业化·用户 2026-08-02/03】 | 🔨 待办 | — | 待验 | [代理合作口径](docs/superpowers/specs/2026-08-02-creatoros-agent-channel-policy.md) | [详情](BACKLOG-details.md#t-671) |

<a id="t-670"></a>
## T-670
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-670 | 恢复 CreatorOS 部署前真实官网并收口公开商业信息【官网回滚纠偏·用户 2026-08-02/03】 | 🔨 待办 | — | 待验 | [T-668 历史定价口径](docs/superpowers/specs/2026-08-02-creatoros-website-pricing.md) · [T-672 当前公开边界](docs/superpowers/specs/2026-08-03-creatoros-public-price-contact-withdrawal.md) | 在恢复部署前真实官网视觉和产品结构的基础上，按 T-672 删除全部公开价格、利润、个人联系方式、个人二维码与直营购买入口；保留产品能力、飞轮、设备支持和更新日志。2026-08-02 已补齐真实产品图片并修正静态资源 404 语义。 |

### 外置更新 2026-08-17
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-670 | 恢复 CreatorOS 部署前真实官网并收口公开商业信息【官网回滚纠偏·用户 2026-08-02/03】 | 🔨 待办 | — | 待验 | [T-668 历史定价口径](docs/superpowers/specs/2026-08-02-creatoros-website-pricing.md) | [详情](BACKLOG-details.md#t-670) |

<a id="t-666"></a>
## T-666
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-666 | 根治定位前采误清空既有定位并改为非破坏草稿切换【定位数据安全·用户 2026-08-02】 | 🔨 待办 | — | 待验 | [定位非破坏草稿 SPEC](docs/superpowers/specs/2026-08-02-positioning-non-destructive-draft.md) · [真实浏览器旅程](orchestrator/T666-FRONTEND-JOURNEY.md) · [T-652 前采主流程](docs/superpowers/specs/2026-08-01-positioning-pre-interview-workflow.md) | 只要账号存在正式定位，进入“完全从零开始”、中途退出、刷新或访谈未完成都不得清空、替换或隐藏当前母版与历史版本；前采只写可恢复草稿，只有新定位完整生成且用户明确采纳后才新增正式版本并切换，旧版本始终可见可恢复。 |

### 外置更新 2026-08-17
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-666 | 根治定位前采误清空既有定位并改为非破坏草稿切换【定位数据安全·用户 2026-08-02】 | 🔨 待办 | — | 待验 | [定位非破坏草稿 SPEC](docs/superpowers/specs/2026-08-02-positioning-non-destructive-draft.md) | [详情](BACKLOG-details.md#t-666) |

<a id="t-665"></a>
## T-665
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-665 | 支持彻底删除内容雷达信源及其全部归属数据【信源生命周期·用户 2026-08-02】 | 🔨 待办 | — | 待验 | [信源彻底删除 SPEC](docs/superpowers/specs/2026-08-02-intelligence-source-hard-delete.md) · [真实浏览器旅程](orchestrator/T665-FRONTEND-JOURNEY.md) · [内容雷达服务契约](docs/superpowers/specs/2026-07-23-content-radar-service-contract.md) | 信源卡提供明确的“删除信源与内容”动作，二次确认后由 intelligence backend service 在所有权校验和事务内删除该信源、仅归属于它的内容/逐字稿/快照/运行与任务状态；被其他信源或正式项目引用的数据按契约保留或解除关联，UI 不再继续显示已删除信源。 |

### 外置更新 2026-08-17
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-665 | 支持彻底删除内容雷达信源及其全部归属数据【信源生命周期·用户 2026-08-02】 | 🔨 待办 | — | 待验 | [信源彻底删除 SPEC](docs/superpowers/specs/2026-08-02-intelligence-source-hard-delete.md) | [详情](BACKLOG-details.md#t-665) |

<a id="t-661"></a>
## T-661
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-661 | 根治项目素材未进入制作、采纳后仍转圈及素材包图片无扩展名【制作闭环·用户 2026-08-02】 | 🔨 待办 | — | 待验 | [结构/脚本/分镜一致性 SPEC](docs/superpowers/specs/2026-07-17-structure-script-storyboard-consistency-design.md) · [素材包 SPEC](docs/superpowers/specs/2026-07-17-video-stage-three-paths-and-material-export-design.md) | 项目中已采纳或上传的截图、录屏和生成图必须从统一用料链自动进入制作候选；任务卡刷新后按持久终态停止转圈；素材包必须按真实 MIME/素材类型补安全扩展名，禁止把图片导成 Finder 识别为文稿的无后缀文件。 |

### 外置更新 2026-08-17
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-661 | 根治项目素材未进入制作、采纳后仍转圈及素材包图片无扩展名【制作闭环·用户 2026-08-02】 | 🔨 待办 | — | 待验 | [结构/脚本/分镜一致性 SPEC](docs/superpowers/specs/2026-07-17-structure-script-storyboard-consistency-design.md) | [详情](BACKLOG-details.md#t-661) |

<a id="t-656"></a>
## T-656
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-656 | 收紧桌面授权本地信任链，移除生产冒烟旁路并消除 verdict 私钥明文靶点【安全加固·用户 2026-08-02】 | 🔨 待办 | PASS[REV:5f6970ac76f2] | 待验 | [SPEC](docs/superpowers/specs/2026-08-02-desktop-verdict-basic-hardening.md) · [本地 BUILD 证据](orchestrator/GATE-T656-BUILD.md) | 正式 Sidecar 只能接受真实 Ed25519 verdict token，打包冒烟改用同一验签链生成短时测试 token；Rust 不再通过 `option_env!` 把 base64 私钥与定位 sentinel 原样编入二进制，改由构建期解码、随机掩码封装并增加最终产物泄漏扫描。明确本地攻击者仍可逆向提取运行时密钥，本任务只消除低成本通用旁路和静态靶点，不冒充服务端终判。 |

### 外置更新 2026-08-17
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-656 | 收紧桌面授权本地信任链，移除生产冒烟旁路并消除 verdict 私钥明文靶点【安全加固·用户 2026-08-02】 | 🔨 待办 | PASS[REV:5f6970ac76f2] | 待验 | [SPEC](docs/superpowers/specs/2026-08-02-desktop-verdict-basic-hardening.md) | [详情](BACKLOG-details.md#t-656) |

<a id="t-653"></a>
## T-653
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-653 | 支持本地自配与渠道子 Key 托管双模式模型供给【模型商业化·跨仓·用户 2026-08-02】 | 📋 待办 | 待中转站协议确定后补跨仓 SPEC 评审 | 待验 | [已确认方向与后置条件](docs/research/2026-08-02-activation-managed-relay-subkey-design.md) | 当前版本不实现托管子 Key：先支持“渠道下发公开模型/连接配置，用户在 CreatorOS 本机按服务填写 Key”；等中转站的建子 Key、充值、额度、用量、停用与对账协议确定后，再恢复 entitlement→受限子 Key→Growth 充值履约方案，母 Key始终不得进入客户端。 |

### 外置更新 2026-08-17
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-653 | 支持本地自配与渠道子 Key 托管双模式模型供给【模型商业化·跨仓·用户 2026-08-02】 | 📋 待办 | 待审 | 待验 | [已确认方向与后置条件](docs/research/2026-08-02-activation-managed-relay-subkey-design.md) | [详情](BACKLOG-details.md#t-653) |

<a id="t-652"></a>
## T-652
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-652 | 重构定位前采为必经的编导式访谈与证据辅助工作流【定位业务流·用户 2026-08-01】 | 🔨 待办 | 待按 2026-08-05 修订重新评审 | 待验 | [SPEC 方向已修订·待复审](docs/superpowers/specs/2026-08-01-positioning-pre-interview-workflow.md) | 不论账号是否已有作品，都在定位中心内嵌 Copilot 完成前采；宿主场景路由依据少量代表作品逐字稿，先核对事实和冲突，再只追问必要缺口。取消六页固定问卷，联网搜索退出主链；支持沿用、转型和物理隔离的从零开始，最终形成有依据、可追溯、可恢复并可直接采纳进定位中心的定位母版。 |

### 外置更新 2026-08-17
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-652 | 重构定位前采为必经的编导式访谈与证据辅助工作流【定位业务流·用户 2026-08-01】 | 🔨 待办 | 待审 | 待验 | [SPEC 方向已修订·待复审](docs/superpowers/specs/2026-08-01-positioning-pre-interview-workflow.md) | [详情](BACKLOG-details.md#t-652) |

<a id="t-649"></a>
## T-649
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-649 | 调研并设计激活后渠道白标：品牌名、应用内 Logo 与系统级图标边界【商业渠道·跨仓·用户 2026-08-01】 | 📋 待办 | — | 待验 | [调研结论](docs/research/2026-08-01-channel-white-label-runtime-branding-audit.md) | 核对 Growth 已发布渠道配置与 CreatorOS 激活消费链，区分可在激活后运行时替换的应用内品牌、窗口标题与帮助入口，以及受 macOS/Windows 包签名、安装元数据、Dock/任务栏缓存约束而必须构建期固定的系统级应用名/图标；给出单一安装包可实现范围、需要独立渠道包的范围及最小可信扩展契约。 |

### 外置更新 2026-08-17
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-649 | 调研并设计激活后渠道白标：品牌名、应用内 Logo 与系统级图标边界【商业渠道·跨仓·用户 2026-08-01】 | 📋 待办 | — | 待验 | [调研结论](docs/research/2026-08-01-channel-white-label-runtime-branding-audit.md) | [详情](BACKLOG-details.md#t-649) |

<a id="t-646"></a>
## T-646
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-646 | 统一优化结构化 AI 工具为结果优先、分段生成与局部修复【性能与可靠性·用户 2026-08-01】 | 🔨 待办 | — | 待验 | [审计待补](docs/research/2026-08-01-structured-ai-tool-reliability-audit.md) | 逐个审计结构化 AI 工具的 schema 复杂度、单次模型职责、重试放大与失败语义；创作内容应先产出可用结果，再补全、校验和优化，非关键字段或增强步骤失败不得清空已有结果或触发整轮疯狂重试。内容雷达部分阶段失败时必须保留检查点并提供「重试生成选题卡」入口，复用已完成阶段，只重跑失败及后续步骤，成功后自动回显。 |

### 外置更新 2026-08-17
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-646 | 统一优化结构化 AI 工具为结果优先、分段生成与局部修复【性能与可靠性·用户 2026-08-01】 | 🔨 待办 | — | 待验 | [审计待补](docs/research/2026-08-01-structured-ai-tool-reliability-audit.md) | [详情](BACKLOG-details.md#t-646) |

<a id="t-645"></a>
## T-645
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-645 | 收敛模型配置项并同步精简 Growth 渠道模板【设置体验·跨仓配置·用户 2026-08-01/02】 | 🔨 待办 | PASS[REV:5dfe24b42eb7] | 待验 | [逐能力管控 SPEC](docs/superpowers/specs/2026-08-02-capability-scoped-channel-model-authority.md) · [配置收敛审计](docs/research/2026-08-01-model-configuration-simplification-audit.md) | 普通设置与 Growth 默认模板统一只暴露文本、ASR、生图、生视频；模型 authority 必须按 capability 独立裁决：渠道只锁定完整且当前客户端支持的能力，缺失/残缺/不支持的能力继续允许用户本地配置；同时补齐 `connectionId → connection → service → 本地加密 Key` 真实消费链与服务级 Key复用。 |

### 外置更新 2026-08-17
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-645 | 收敛模型配置项并同步精简 Growth 渠道模板【设置体验·跨仓配置·用户 2026-08-01/02】 | 🔨 待办 | PASS[REV:5dfe24b42eb7] | 待验 | [逐能力管控 SPEC](docs/superpowers/specs/2026-08-02-capability-scoped-channel-model-authority.md) | [详情](BACKLOG-details.md#t-645) |

<a id="t-643"></a>
## T-643
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-643 | 收口 CreatorOS 为输入 Activity 激活码后直接授权，隐藏当前权益领取入口【商业激活主线·用户 2026-08-01】 | 📋 待办 | — | 待验 | [跨仓唯一链路](/Users/zyongzhu/Workbase/Thirdspace-growth/docs/contracts/T-129-activation-code-single-flow.md) | 当前只保留“输入激活码→Activity 校验/绑定/签名授权→本机保存→按 channelRef 拉配置”；不得要求用户登录 Growth、兑换商品或手动领取权益，既有 entitlement claim 代码暂不删除但退出导航、页面和当前发布验收。 |

### 外置更新 2026-08-17
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-643 | 收口 CreatorOS 为输入 Activity 激活码后直接授权，隐藏当前权益领取入口【商业激活主线·用户 2026-08-01】 | 📋 待办 | — | 待验 | [跨仓唯一链路](/Users/zyongzhu/Workbase/Thirdspace-growth/docs/contracts/T-129-activation-code-single-flow.md) | [详情](BACKLOG-details.md#t-643) |

<a id="t-642"></a>
## T-642
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-642 | 打通内容雷达对标文案→改写策略→选题卡→项目写稿的编导证据链【产品链路·用户 2026-08-01/02】 | 🔨 待办 | CONCERNS[REV:7728c9ed44bd] | 待验 | [SPEC](docs/superpowers/specs/2026-08-01-content-radar-creative-handoff.md) · [链路审计](docs/research/2026-08-01-content-radar-topic-project-script-chain-audit.md) | 对标原文、拆解和策略继续按不可变证据绑定项目并供 AI 消费，但项目 UI 不再展示左侧对标原稿；内容雷达改写稿作为同一份项目口播稿透传，脚本页、制作视频与项目编导工具统一读取，正式 `output_script` 保存后接管唯一正文真相；生成选题卡的后台任务由当前作品状态自动续接和回读，完成后当前选题卡及创建项目入口立即更新，禁止再依赖切换选题或 Tab 触发刷新；普通项目保持原链路。 |

### 外置更新 2026-08-17
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-642 | 打通内容雷达对标文案→改写策略→选题卡→项目写稿的编导证据链【产品链路·用户 2026-08-01/02】 | 🔨 待办 | CONCERNS[REV:7728c9ed44bd] | 待验 | [SPEC](docs/superpowers/specs/2026-08-01-content-radar-creative-handoff.md) | [详情](BACKLOG-details.md#t-642) |

<a id="t-640"></a>
## T-640
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-640 | 配置 Apple Developer ID 签名与公证，并在前序修复全部闭环后统一产出本地安装包【发布·用户 2026-07-31】 | 🔨 待办 | — | 待验 | [本次打包证据](orchestrator/GATE-T640-BUILD.md) · [T-575 测试发行与回滚](docs/handoffs/T-575-CreatorOS测试发行与回滚.md) | Developer ID Application 私钥只存本机登录钥匙串，公证凭据只存 notarytool 钥匙串 profile；先完成 T-637/T-638/T-639 与既有安装包 Gate，再产出签名、公证、staple 且可通过 Gatekeeper 验证的 DMG，不把证书私钥、密码或 API Key 写进仓库和日志。 |

### 外置更新 2026-08-17
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-640 | 配置 Apple Developer ID 签名与公证，并在前序修复全部闭环后统一产出本地安装包【发布·用户 2026-07-31】 | 🔨 待办 | — | 待验 | [本次打包证据](orchestrator/GATE-T640-BUILD.md) | [详情](BACKLOG-details.md#t-640) |

<a id="t-632"></a>
## T-632
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-632 | 根治“新建定位母版”无效、历史母版无法恢复与逐字稿提取长时间无结果【线上阻断·用户 2026-07-30/31】 | 🔨 待办 | — | 待验 | [GATE](orchestrator/GATE-T632-BUILD.md) | 新建定位母版须确认后直接清空当前定位并进入空白母版；重置前完整母版（画像、facets、五类规则、定位陈述）须形成不可变快照，历史恢复以追加新版本方式真实回写并刷新可读，绝不修改旧历史；旧版只留陈述、确实缺少画像快照的记录须诚实降级为“复制定位陈述”，不得假装完整恢复。按真实日志拆解逐字稿任务排队、媒体处理与模型调用耗时，修复阻塞且呈现诚实反馈。 |

### 外置更新 2026-08-17
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-632 | 根治“新建定位母版”无效、历史母版无法恢复与逐字稿提取长时间无结果【线上阻断·用户 2026-07-30/31】 | 🔨 待办 | — | 待验 | [GATE](orchestrator/GATE-T632-BUILD.md) | [详情](BACKLOG-details.md#t-632) |

<a id="t-626"></a>
## T-626
原始表头：ID | 任务 | 搁置 | 文档 | 恢复条件

| T-626 | CreatorOS 多模型数组与 9 类能力选择【用户明确延期】 | ⏸️ | [绑定契约](docs/superpowers/specs/2026-07-29-creatoros-channel-model-authority.contract.md) | 用户明确重启后再进入客户端消费与真调用 E2E。 |

<a id="t-577"></a>
## T-577
原始表头：ID | 任务 | 搁置 | 文档 | 恢复条件

| T-577 | 安装包缺 `sidecar.tar.gz`【用户明确忽略】 | ⏸️ | [反馈表](https://my.feishu.cn/base/S1BRb4i6kaD0bnsViJSco0jxnRg?table=tblIPu0er91yGTwL&view=vewb4HsOUz) | 取得系统、版本与下载来源后重启。 |

<a id="t-565"></a>
## T-565
原始表头：ID | 任务 | 搁置 | 文档 | 恢复条件

| T-565 | Windows Runtime 原生 Burn/事务交付 | ⏸️ | [SPEC](docs/superpowers/specs/2026-07-27-windows-runtime-delivery-burn-transaction.md) · [RAT](docs/research/2026-07-27-windows-native-burn-transaction-rat-evidence.md) | 原生 RAT 已通过；待 Round 2 复审、BUILD 与安装版 E2E。 |

<a id="t-524"></a>
## T-524
原始表头：ID | 任务 | 搁置 | 文档 | 恢复条件

| T-524 | 自媒体方法随包内置知识库 | ⏸️ | [详情](docs/tasks/T484.md#t-524) | 确认第三方内容商业改编和分发权。 |

<a id="t-519"></a>
## T-519
原始表头：ID | 任务 | 搁置 | 文档 | 恢复条件

| T-519 | 知识库文件工作区与用户知识底座 | ⏸️ | [PLAN](docs/superpowers/specs/2026-07-26-knowledge-workspace-lean.md) | Round 3 major 清零并通过正式 Gate。 |

<a id="t-525"></a>
## T-525
原始表头：ID | 任务 | 搁置 | 文档 | 恢复条件

| T-525 | 旧 `.doc` 与扫描 PDF OCR | ⏸️ | [详情](docs/tasks/T484.md#t-525) | 补足 20 份 `.doc`、OCR 语料和独立评审。 |

<a id="t-517"></a>
## T-517
原始表头：ID | 任务 | 搁置 | 文档 | 恢复条件

| T-517 | CreatorOS 生产预设自动化底座 | ⏸️ | [PLAN](docs/superpowers/specs/2026-07-26-creatoros-automation-kernel-minimal.md) | 用户恢复范围并通过契约 Gate。 |

<a id="t-516"></a>
## T-516
原始表头：ID | 任务 | 搁置 | 文档 | 恢复条件

| T-516 | 设置内“AI 对我的理解”与账号健康检查【产品+架构·用户 2026-07-25/26】 | ⏸️ | [纠偏 PLAN](docs/superpowers/specs/2026-07-26-copilot-context-health-minimal.md) · [最终审计](docs/superpowers/specs/2026-07-26-overdesign-scope-reset.review.md) | 自动扫描只做可证明的确定性问题；保留 AI 起草、用户确认/调整后经现有定位链保存，依赖 T-517 新 CONTRACT。 |

<a id="t-510"></a>
## T-510
原始表头：ID | 任务 | 搁置 | 文档 | 恢复条件

| T-510 | 优化 Copilot 媒体工具编排 | ⏸️ | [PLAN](docs/superpowers/specs/2026-07-25-copilot-media-orchestration-replacement.md) | 通过现有契约评审并恢复 BUILD。 |

<a id="t-506"></a>
## T-506
原始表头：ID | 任务 | 搁置 | 文档 | 恢复条件

| T-506 | 接入 growth 年卡购买与次年续费【商业化·用户 2026-0… | ⏸️ | [SPEC](docs/superpowers/specs/2026-07-24-annual-renewal-growth-integration.md) · [契约](docs/superpowers/specs/2026-07-24-annual-renewal-growth-integration.contract.md) |

<a id="t-502"></a>
## T-502
原始表头：ID | 任务 | 搁置 | 文档 | 恢复条件

| T-502 | T-496 退回 PLAN 重做：收藏来源自由选择任一已绑定账号 … | ⏸️ | [D](docs/tasks/T484.md#t-502) |

<a id="t-497"></a>
## T-497
原始表头：ID | 任务 | 搁置 | 文档 | 恢复条件

| T-497 | 用户知识库受控检索与脚本引用设计：大语料、质量差异、权威资料支配风… | ⏸️ | [D](docs/tasks/T484.md#t-497) |

<a id="t-451"></a>
## T-451
原始表头：ID | 任务 | 搁置 | 文档 | 恢复条件

| T-451 | 【防逆向优化 D-④·战略层·合并 T-447】把 license… | ⏸️ | [D](docs/tasks/T484.md#t-451) |

<a id="t-449"></a>
## T-449
原始表头：ID | 任务 | 搁置 | 文档 | 恢复条件

| T-449 | ~~【防逆向优化 D-②】Windows 直装 sidecar 目… | ⏸️ | [D](docs/tasks/T484.md#t-449) |

<a id="t-448"></a>
## T-448
原始表头：ID | 任务 | 搁置 | 文档 | 恢复条件

| T-448 | 【防逆向优化 D-①-b】sidecar 内父进程/magic 自检 | ⏸️ | [D](docs/tasks/T484.md#t-448) |

<a id="t-433-s2"></a>
## T-433 S2
原始表头：ID | 任务 | 搁置 | 文档 | 恢复条件

| T-433 S2 | gate-F5 升两级优先串行闸(并发仍=1):明细类(self.… | ⏸️ | [D](docs/tasks/T484.md#t-433-s2) |

<a id="t-433-s4"></a>
## T-433 S4
原始表头：ID | 任务 | 搁置 | 文档 | 恢复条件

| T-433 S4 | 排队进度可见:job_run 加真 `queued` 态(crea… | ⏸️ | [D](docs/tasks/T484.md#t-433-s4) |

<a id="t-433-s5"></a>
## T-433 S5
原始表头：ID | 任务 | 搁置 | 文档 | 恢复条件

| T-433 S5 | (可选)benchmark/darkhorse 加已知 aweme… | ⏸️ | [D](docs/tasks/T484.md#t-433-s5) |

<a id="t-426"></a>
## T-426
原始表头：ID | 任务 | 搁置 | 文档 | 恢复条件

| T-426 | Windows 真机装完打开白屏「127.0.0.1 拒绝连接 /… | ⏸️ | [D](docs/tasks/T484.md#t-426) |

<a id="t-425w"></a>
## T-425W
原始表头：ID | 任务 | 搁置 | 文档 | 恢复条件

| T-425W | Windows 安装器 WebView2 离线化:`tauri.w… | ⏸️ | [D](docs/tasks/T484.md#t-425w) |

<a id="t-413"></a>
## T-413
原始表头：ID | 任务 | 搁置 | 文档 | 恢复条件

| T-413 | 上线前防逆向/防盗版落地(两新方案文档落地 + 现有 T-391/… | ⏸️ | [D](docs/tasks/T484.md#t-413) |

<a id="t-417"></a>
## T-417
原始表头：ID | 任务 | 搁置 | 文档 | 恢复条件

| T-417 | L1 字符串加密补齐:chunks/ 的 prompt/端点 rc… | ⏸️ | [D](docs/tasks/T484.md#t-417) |

<a id="t-418"></a>
## T-418
原始表头：ID | 任务 | 搁置 | 文档 | 恢复条件

| T-418 | L2 sidecar 加密落盘:tar AES-256-GCM(b… | ⏸️ | [D](docs/tasks/T484.md#t-418) |

<a id="t-420"></a>
## T-420
原始表头：ID | 任务 | 搁置 | 文档 | 恢复条件

| T-420 | L4 皇冠函数 napi-rs 原生化(2-3 个;**授权终判已… | ⏸️ | [D](docs/tasks/T484.md#t-420) |

<a id="t-399"></a>
## T-399
原始表头：ID | 任务 | 搁置 | 文档 | 恢复条件

| T-399 | 反 AI 破解欺骗层调研+方案【调研·防逆向下一层·用户 2026… | ⏸️ | [D](docs/tasks/T484.md#t-399) |

<a id="t-399c"></a>
## T-399c
原始表头：ID | 任务 | 搁置 | 文档 | 恢复条件

| T-399c | 反破解欺骗片3:D3 严格不可达迷宫 + D4 量化污染(诱饵占比… | ⏸️ | [D](docs/tasks/T484.md#t-399c) |

<a id="t-409"></a>
## T-409
原始表头：ID | 任务 | 搁置 | 文档 | 恢复条件

| T-409 | 创作包只读导出端点(供 ArticleOS 拉取)【跨仓需求·Ar… | ⏸️ | [D](docs/tasks/T484.md#t-409) |

<a id="t-372-w-spike"></a>
## T-372 W-spike
原始表头：ID | 任务 | 搁置 | 文档 | 恢复条件

| T-372 W-spike | 双端地基 spike(先行):Win 系统 tar.exe(bsd… | ⏸️ | [D](docs/tasks/T484.md#t-372-w-spike) |

<a id="t-372-w-ci"></a>
## T-372 W-ci
原始表头：ID | 任务 | 搁置 | 文档 | 恢复条件

| T-372 W-ci | GitHub Actions matrix(macos-lates… | ⏸️ | [D](docs/tasks/T484.md#t-372-w-ci) |

<a id="t-391-h-econ"></a>
## T-391 H-econ
原始表头：ID | 任务 | 搁置 | 文档 | 恢复条件

| T-391 H-econ | 破解经济学(短板兜底·**后续波次·依赖 L1s 服务端·非本仓·… | ⏸️ | [D](docs/tasks/T484.md#t-391-h-econ) |

<a id="t-393"></a>
## T-393
原始表头：ID | 任务 | 搁置 | 文档 | 恢复条件

| T-393 | 稿面审核状态不刷新:脚本改后重新审核完成,横幅仍说「脚本已改动,当… | ⏸️ | [D](docs/tasks/T484.md#t-393) |

<a id="t-401"></a>
## T-401
原始表头：ID | 任务 | 搁置 | 文档 | 恢复条件

| T-401 | 配置备份导出/导入报 `forbidden: request mu… | ⏸️ | [D](docs/tasks/T484.md#t-401) |

<a id="t-406"></a>
## T-406
原始表头：ID | 任务 | 搁置 | 文档 | 恢复条件

| T-406 | 腾讯云 CDN 藏源站 IP + 挡 DDoS + WAF/限流(… | ⏸️ | [D](docs/tasks/T484.md#t-406) |

<a id="t-407"></a>
## T-407
原始表头：ID | 任务 | 搁置 | 文档 | 恢复条件

| T-407 | 盲预测深结合历史战绩:建「历史战绩画像」(完播/CTR/播放中位数… | ⏸️ | [D](docs/tasks/T484.md#t-407) |

<a id="t-396"></a>
## T-396
原始表头：ID | 任务 | 搁置 | 文档 | 恢复条件

| T-396 | 渠道化(代理白标)链接 + 更新分发改造【需求·商业模型·用户 2… | ⏸️ | [D](docs/tasks/T484.md#t-396) |

<a id="t-398"></a>
## T-398
原始表头：ID | 任务 | 搁置 | 文档 | 恢复条件

| T-398 | scheduler 启动清僵尸 ai_task 报 Account… | ⏸️ | [D](docs/tasks/T484.md#t-398) |

<a id="t-366c"></a>
## T-366c
原始表头：ID | 任务 | 搁置 | 文档 | 恢复条件

| T-366c | G3 · 真机验收:上传成品→发布走通;导出 zip 解开含全素材… | ⏸️ | [D](docs/tasks/T484.md#t-366c) |

<a id="t-361"></a>
## T-361
原始表头：ID | 任务 | 搁置 | 文档 | 恢复条件

| T-361 | 素材视觉模型自动打标签:接 model-config 视觉 cap… | ⏸️ | [D](docs/tasks/T484.md#t-361) |

<a id="t-352"></a>
## T-352
原始表头：ID | 任务 | 搁置 | 文档 | 恢复条件

| T-352 | Windows 双端打包(独立工程)【发布·用户 2026-07-… | ⏸️ | [D](docs/tasks/T484.md#t-352) |

<a id="t-320c"></a>
## T-320c
原始表头：ID | 任务 | 搁置 | 文档 | 恢复条件

| T-320c | 剪辑质量:视频信息卡避让底部字幕带(place() 纵向溢出策略)… | ⏸️ | [D](docs/tasks/T484.md#t-320c) |

<a id="t-350c"></a>
## T-350c
原始表头：ID | 任务 | 搁置 | 文档 | 恢复条件

| T-350c | S3 · 真机验收:重打包/dev 真跑 AC-1~5(MiniM… | ⏸️ | [D](docs/tasks/T484.md#t-350c) |

<a id="t-351"></a>
## T-351
原始表头：ID | 任务 | 搁置 | 文档 | 恢复条件

| T-351 | 审核能力单一真值化:审核 SOP 从各生成模板抽出→收进**产品级… | ⏸️ | [D](docs/tasks/T484.md#t-351) |

<a id="t-349d"></a>
## T-349d
原始表头：ID | 任务 | 搁置 | 文档 | 恢复条件

| T-349d | S4 · 真机验收:AC-1~5(对标抓稿+幂等复用/图集 ski… | ⏸️ | [D](docs/tasks/T484.md#t-349d) |

<a id="t-339"></a>
## T-339
原始表头：ID | 任务 | 搁置 | 文档 | 恢复条件

| T-339 | frontend lint 债务清零:全仓 eslint 2461… | ⏸️ | [D](docs/tasks/T484.md#t-339) |

<a id="t-328"></a>
## T-328
原始表头：ID | 任务 | 搁置 | 文档 | 恢复条件

| T-328 | 修 T-326 上线审计 bug(4 Blocker/26 Hig… | ⏸️ | [D](docs/tasks/T484.md#t-328) |

<a id="t-332r"></a>
## T-332R
原始表头：ID | 任务 | 搁置 | 文档 | 恢复条件

| T-332R | 追溯登记补账:API-*/TEST-* 回登 ID_REGISTR… | ⏸️ | [D](docs/tasks/T484.md#t-332r) |

<a id="t-336"></a>
## T-336
原始表头：ID | 任务 | 搁置 | 文档 | 恢复条件

| T-336 | 技能配置页诚实化 + 「我的叮嘱」可视化:①下架/弃用僵尸 ski… | ⏸️ | [D](docs/tasks/T484.md#t-336) |

<a id="t-335"></a>
## T-335
原始表头：ID | 任务 | 搁置 | 文档 | 恢复条件

| T-335 | 用户自定义 skill 体系(L2):三层 skill(L0 出厂… | ⏸️ | [D](docs/tasks/T484.md#t-335) |

<a id="t-337"></a>
## T-337
原始表头：ID | 任务 | 搁置 | 文档 | 恢复条件

| T-337 | 日志与 AI 可观测性层:①轻量 logger 封装(级别/命名空… | ⏸️ | [D](docs/tasks/T484.md#t-337) |

<a id="t-337a"></a>
## T-337a
原始表头：ID | 任务 | 搁置 | 文档 | 恢复条件

| T-337a | contract 零依赖 logger(级别/ns/traceId… | ⏸️ | [D](docs/tasks/T484.md#t-337a) |

<a id="t-337b"></a>
## T-337b
原始表头：ID | 任务 | 搁置 | 文档 | 恢复条件

| T-337b | traceId 贯穿:requestId 真 uuid(chat … | ⏸️ | [D](docs/tasks/T484.md#t-337b) |

<a id="t-337c"></a>
## T-337c
原始表头：ID | 任务 | 搁置 | 文档 | 恢复条件

| T-337c | AI 黑匣子 `ai_call_log` 表(trace/task… | ⏸️ | [D](docs/tasks/T484.md#t-337c) |

<a id="t-337d"></a>
## T-337d
原始表头：ID | 任务 | 搁置 | 文档 | 恢复条件

| T-337d | webview 错误落盘:root `global-error.t… | ⏸️ | [D](docs/tasks/T484.md#t-337d) |

<a id="t-337e"></a>
## T-337e
原始表头：ID | 任务 | 搁置 | 文档 | 恢复条件

| T-337e | logging.rs 轮转改大小制(10MB×5 份+现役,启动不… | ⏸️ | [D](docs/tasks/T484.md#t-337e) |

<a id="t-337f"></a>
## T-337f
原始表头：ID | 任务 | 搁置 | 文档 | 恢复条件

| T-337f | 成本可观测:provider 预设附 pricing(自定义可填,… | ⏸️ | [D](docs/tasks/T484.md#t-337f) |

<a id="t-337g"></a>
## T-337g
原始表头：ID | 任务 | 搁置 | 文档 | 恢复条件

| T-337g | Pi 会话转录落盘:SessionManager.inMemory… | ⏸️ | [D](docs/tasks/T484.md#t-337g) |

<a id="t-334"></a>
## T-334
原始表头：ID | 任务 | 搁置 | 文档 | 恢复条件

| T-334 | ai_tasks 任务可靠性层:错误分类(配置错误→引导去设置不重… | ⏸️ | [D](docs/tasks/T484.md#t-334) |

<a id="t-324"></a>
## T-324
原始表头：ID | 任务 | 搁置 | 文档 | 恢复条件

| T-324 | Pi 全面接管:抓取网页/截图/自动化任务/剪辑切到 Pi 引擎;… | ⏸️ | [D](docs/tasks/T484.md#t-324) |

<a id="t-340"></a>
## T-340
原始表头：ID | 任务 | 搁置 | 文档 | 恢复条件

| T-340 | agentic.research 三端口真接线(gate-M2 硬… | ⏸️ | [D](docs/tasks/T484.md#t-340) |

<a id="t-315"></a>
## T-315
原始表头：ID | 任务 | 搁置 | 文档 | 恢复条件

| T-315 | Pi 记忆层·memory-tool(读):现有 14 表经 Co… | ⏸️ | [D](docs/tasks/T484.md#t-315) |

<a id="t-316"></a>
## T-316
原始表头：ID | 任务 | 搁置 | 文档 | 恢复条件

| T-316 | Pi 会话续(受控):pi-coding-agent JSONL … | ⏸️ | [D](docs/tasks/T484.md#t-316) |

<a id="t-317"></a>
## T-317
原始表头：ID | 任务 | 搁置 | 文档 | 恢复条件

| T-317 | 跨会话偏好捕捉:对话里偏好/纠正经采纳门 → creator_pr… | ⏸️ | [D](docs/tasks/T484.md#t-317) |

<a id="t-318"></a>
## T-318
原始表头：ID | 任务 | 搁置 | 文档 | 恢复条件

| T-318 | 对话式 skill/记忆进化(飞轮,复活 T-087 skill.… | ⏸️ | [D](docs/tasks/T484.md#t-318) |

<a id="t-319"></a>
## T-319
原始表头：ID | 任务 | 搁置 | 文档 | 恢复条件

| T-319 | Pi 接 MCP client(装 pi-mcp-adapter,… | ⏸️ | [D](docs/tasks/T484.md#t-319) |

<a id="t-312"></a>
## T-312
原始表头：ID | 任务 | 搁置 | 文档 | 恢复条件

| T-312 | 编导式/对话式剪辑 + ChatCut(SPEC track·母任… | ⏸️ | [D](docs/tasks/T484.md#t-312) |

<a id="t-307"></a>
## T-307
原始表头：ID | 任务 | 搁置 | 文档 | 恢复条件

| T-307 | playwright 启动点统一浏览器选择(截图崩 chrome-… | ⏸️ | [D](docs/tasks/T484.md#t-307) |

<a id="t-306"></a>
## T-306
原始表头：ID | 任务 | 搁置 | 文档 | 恢复条件

| T-306 | 首页「页面加载失败,请稍后重试」【bug·待复现·疑似瞬时】 | ⏸️ | [D](docs/tasks/T484.md#t-306) |

<a id="t-301"></a>
## T-301
原始表头：ID | 任务 | 搁置 | 文档 | 恢复条件

| T-301 | 首页 4 个空 widget 规划:待办事项/热门选题热度/数据概… | ⏸️ | [D](docs/tasks/T484.md#t-301) |

<a id="t-302"></a>
## T-302
原始表头：ID | 任务 | 搁置 | 文档 | 恢复条件

| T-302 | 首页待办事项接生产者——派生 actionable 待办(待确认渲… | ⏸️ | [D](docs/tasks/T484.md#t-302) |

<a id="t-261"></a>
## T-261
原始表头：ID | 任务 | 搁置 | 文档 | 恢复条件

| T-261 | AI 关联飞轮(自动建网) | ⏸️ | [D](docs/tasks/T484.md#t-261) |

<a id="t-249"></a>
## T-249
原始表头：ID | 任务 | 搁置 | 文档 | 恢复条件

| T-249 | 统一真机验证清单(考古跨任务残留承接) | ⏸️ | [D](docs/tasks/T484.md#t-249) |

<a id="t-250"></a>
## T-250
原始表头：ID | 任务 | 搁置 | 文档 | 恢复条件

| T-250 | 工程健康批(T-145 残留收编,低优) | ⏸️ | [D](docs/tasks/T484.md#t-250) |

<a id="t-255b"></a>
## T-255b
原始表头：ID | 任务 | 搁置 | 文档 | 恢复条件

| T-255b | ~~agent 引擎 executor 集成~~ **已并入 T-… | ⏸️ | [D](docs/tasks/T484.md#t-255b) |

<a id="t-185r"></a>
## T-185R
原始表头：ID | 任务 | 搁置 | 文档 | 恢复条件

| T-185R | 访谈后替用户起草 custom skill(考古收敛自 T-185… | ⏸️ | [D](docs/tasks/T484.md#t-185r) |

<a id="t-136r"></a>
## T-136R
原始表头：ID | 任务 | 搁置 | 文档 | 恢复条件

| T-136R | 多账号残留两点(考古收敛自 T-136):①多号并存时定时 job… | ⏸️ | [D](docs/tasks/T484.md#t-136r) |

<a id="t-100"></a>
## T-100
原始表头：ID | 任务 | 搁置 | 文档 | 恢复条件

| T-100 | 单视频分析页(观众/来源/留存维度) | ⏸️ | [D](docs/tasks/T484.md#t-100) |

<a id="t-087"></a>
## T-087
原始表头：ID | 任务 | 搁置 | 文档 | 恢复条件

| T-087 | Skill 迭代循环机制(经验回流进化,防污染设计) | ⏸️ | [D](docs/tasks/T484.md#t-087) |

<a id="t-045"></a>
## T-045
原始表头：ID | 任务 | 搁置 | 文档 | 恢复条件

| T-045 | 激活码授权 + 本机单用户模式(完整方案) | ⏸️ | [D](docs/tasks/T484.md#t-045) |

<a id="t-867"></a>
## T-867
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-867 | 恢复 AI 对项目素材与分镜场景的自动语义匹配【用户真机截图·2026-08-17】 | 🔨 待办 | — | 待验 | 用户截图 + 复用既有 `video.decisions` 候选确认契约 | 用户在最新本地包的“AI 分场决策”中看到 8 个项目素材全部落成“可选补充素材”，每个都要求人工选择场景；用户明确纠偏：这些素材本应由 AI 根据确认稿、素材内容和场景语义自动匹配，人工只检查和少量改绑。必须先锁定素材从项目库存进入 `video.decisions` 输入、模型输出绑定、候选归一与前端回显的首个丢失点；正式方案默认自动编排可用素材到合理场景并显示匹配结果/理由，只有确实不适合或语义证据不足的素材才留在可选区，禁止代码用文件名词表或字符串相似度冒充匹配。用户无需逐条选择即可确认成片，手工场景选择只保留为纠正入口；已有人工绑定必须完整回显、可改可清。补真实失败形状红测、模型输入/输出与前端正常及最小窗口回归；不自动采纳、不修改用户当前项目或已确认方案。 |

### 外置更新 2026-08-17
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-867 | 恢复 AI 对项目素材与分镜场景的自动语义匹配【用户真机截图·2026-08-17】 | 🔨 待办 | — | 待验 | 用户截图 + 复用既有 `video.decisions` 候选确认契约 | [详情](BACKLOG-details.md#t-867) |

<a id="t-860"></a>
## T-860
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-860 | 修复竖屏素材底边与左下人物框边界重合【用户截图·2026-08-16】 | 🔨 待办 | — | 待验 | 复用 [T-859 SPEC](docs/superpowers/specs/2026-08-16-portrait-material-pip-smooth-transition.md) AC-859-1 与用户截图 | 用户在 v6 预览中指出横版录屏的下边界与左下角人物 PiP 上边界发生视觉重合。必须以真实 1080×1920 几何补红测：人物框下移并适度缩小，在素材完整 `contain` 的可见底边下方保留明确空隙，同时仍停在双语字幕安全区上方；渲染器安全门须同时拒绝人物压素材、人物压字幕两类布局。重做 v7 短样片、对应稳定帧与转场密集接触表，用户确认前不重渲整片。 |

### 外置更新 2026-08-17
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-860 | 修复竖屏素材底边与左下人物框边界重合【用户截图·2026-08-16】 | 🔨 待办 | — | 待验 | 复用 [T-859 SPEC](docs/superpowers/specs/2026-08-16-portrait-material-pip-smooth-transition.md) AC-859-1 与用户截图 | [详情](BACKLOG-details.md#t-860) |

<a id="t-859"></a>
## T-859
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-859 | 竖屏素材段人物收进左下角，并消除切换白闪【用户预览纠偏·2026-08-16】 | 🔨 待办 | PASS[REV:9895a91a63a8] | 待验 | [SPEC](docs/superpowers/specs/2026-08-16-portrait-material-pip-smooth-transition.md) | 用户在 T-858 v5 短样片上明确要求：竖屏素材出现时人物可以平滑收进左下角，减少切换时的白屏感并让交接更丝滑。本任务只修正式 CreatorOS 决策、组装和 HyperFrames 渲染链：竖屏 B-roll 素材仍是主视觉，人物作为左下角辅助 PiP；连续素材窗人物不反复弹跳；动态内容卡仍可独占；人物、素材和动态内容之间使用短交叠淡化与媒体预加载，禁止空白占位帧。须先红后绿并重做真实 14 秒短样片、边界密集关键帧和接触表；用户确认前不重渲整片、不出安装包。 |

### 外置更新 2026-08-17
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-859 | 竖屏素材段人物收进左下角，并消除切换白闪【用户预览纠偏·2026-08-16】 | 🔨 待办 | PASS[REV:9895a91a63a8] | 待验 | [SPEC](docs/superpowers/specs/2026-08-16-portrait-material-pip-smooth-transition.md) | [详情](BACKLOG-details.md#t-859) |

<a id="t-858"></a>
## T-858
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-858 | 把剪辑方法真正落到 CreatorOS，根治竖屏统一舞台、字幕重点词与动态 PPT【用户明确要求·2026-08-16】 | 🔨 待办 | PASS[REV:2521be715a0a] | 待验 | [SPEC](docs/superpowers/specs/2026-08-16-video-direction-stage-and-caption-emphasis.md) · [外部视频 Skill 学习与吸收结论](docs/research/2026-08-16-video-production-skills-method-study.md) | 用户明确指出不能只更新全局 Skill，必须修复 CreatorOS 真实剪辑链；随后明确否定“素材/PPT 出现时人物自动居中缩小、结束后精确回位”的镜头策略。T-858 必须改为逐拍单一视觉主体：人物口播全画布；横版素材或动态内容画面接管时人物完全退出，素材保持 `contain` 并由静态舞台承接比例差；结束后在明确帧边界直接切回未变形的人物基底，正式新候选不再产出自动 PiP。AI 编导仍在 `video.decisions` 中输出 motion thesis、唯一主语、状态、运动、交接和真实字幕重点词；代码只守 ID、溯源、时间、范围和安全边界。须以红测锁住“接管窗人物不可见、模板无人物缩放 tween、切回几何一致”，重做真实人物→横版主视觉→动态内容→人物短样片、关键帧和接触表，重新独立评审后再交用户预览；用户确认前不重渲整片、不出安装包。 |

### 外置更新 2026-08-17
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-858 | 把剪辑方法真正落到 CreatorOS，根治竖屏统一舞台、字幕重点词与动态 PPT【用户明确要求·2026-08-16】 | 🔨 待办 | PASS[REV:2521be715a0a] | 待验 | [详情](BACKLOG-details.md#t-858) | 完整任务范围、约束与验收证据见详情。 |

<a id="t-857"></a>
## T-857
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-857 | 构建当前已提交候选的 CreatorOS 1.1.0 Windows 安装包【用户明确要求·2026-08-16】 | ⏸️ 待办 | — | 待验 | 复用官方 `desktop-release.yml` Windows 候选包入口与 T-848 Windows 真安装验收 | 暂停 T-856 且不带入任何竖屏剪辑代码改动；先提交本次任务状态记录并冻结当前候选，证明产品代码、版本号、工作树、候选提交范围与四项打包预检干净，再通过现有 Windows 云端候选包入口构建真实 NSIS `setup.exe`，验证生产闭包、真安装、主页面、CLI 与卸载并下载计算 SHA-256。只交付 Windows 安装包，不安装到当前 Mac，不创建 tag、GitHub Release，不公开分发，不改 Activity/Growth 或真实用户配置；如候选分支推送与云端构建尚未获明确授权，则在该外部动作前停下确认。 |

### 外置更新 2026-08-17
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-857 | 构建当前已提交候选的 CreatorOS 1.1.0 Windows 安装包【用户明确要求·2026-08-16】 | ⏸️ 待办 | — | 待验 | 复用官方 `desktop-release.yml` Windows 候选包入口与 T-848 Windows 真安装验收 | [详情](BACKLOG-details.md#t-857) |

<a id="t-856"></a>
## T-856
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-856 | 重做竖屏成片的统一舞台、字幕可读性与重点词强调【用户成片截图·2026-08-16】 | ⏸️ 待办 | — | 待验 | [外部视频 Skill 学习与吸收结论](docs/research/2026-08-16-video-production-skills-method-study.md) · 复用 T-823/T-824/T-839 竖屏制作、主视觉与内容动效契约 · 待补构建验证 | 用户真实竖屏成片出现纯黑底、横版主视觉堆在上方而竖版人物孤立在右下、大片空区和硬分割，整体像两张互不相关的卡片；中英文字幕过小、英文辨识困难且没有重点词强调。必须把竖屏口播改为一套连续舞台：先由 AI 编导输出 motion thesis 与 beat graph，逐拍声明视觉主语、起止状态、运动动词、舞台形态、转场和回位；竖版人物默认作为完整基底，主视觉按语义使用全屏切走或不遮脸的统一叠层/PiP，横版素材用可见的静态氛围承接而非纯黑或巨大留空，回到人物时布局自然复位；字幕扩大并提高描边/阴影、行距和中英文断行可读性，重点词由 AI 编导在真实字幕语义中显式给出，渲染器只落实有效时间段与强调范围，禁止代码用关键词词表猜重点。先以用户截图对应的竖屏几何补红测，再输出含人物、横版主视觉、中英文字幕和重点词的实际关键帧/接触表与真实生产时间线短样片验收；接触表必须看出状态推进而非海报墙，不得拉伸、裁掉用户素材或用动态全片背景增加渲染成本，未经用户预览确认不重渲整片。 |

### 外置更新 2026-08-17
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-856 | 重做竖屏成片的统一舞台、字幕可读性与重点词强调【用户成片截图·2026-08-16】 | ⏸️ 待办 | — | 待验 | [外部视频 Skill 学习与吸收结论](docs/research/2026-08-16-video-production-skills-method-study.md) · 复用 T-823/T-824/T-839 竖屏制作、主视觉与内容动效契约 · 待补构建验证 | [详情](BACKLOG-details.md#t-856) |

<a id="t-855"></a>
## T-855
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-855 | 构建包含 T-854 与当前已提交修复的 CreatorOS macOS 本地安装包【用户明确授权·2026-08-16】 | ⏸️ 待办 | — | — | 复用 T-854 构建证据与官方本地打包入口 | 待 T-854 完成并提交后冻结工作树，核对四处版本、候选提交范围、敏感信息与官方四项打包测试，只运行仓库固定 `desktop:package-local` 入口生成本地 macOS DMG；报告候选 SHA、产物路径、SHA-256 与 `hdiutil verify`。按用户要求只打包，不安装、不启动、不覆盖当前已安装应用；不创建 tag、GitHub Release，不推送、不公开分发、不改 Activity/Growth 或真实用户配置。 |

### 外置更新 2026-08-17
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-855 | 构建包含 T-854 与当前已提交修复的 CreatorOS macOS 本地安装包【用户明确授权·2026-08-16】 | ⏸️ 待办 | — | — | 复用 T-854 构建证据与官方本地打包入口 | [详情](BACKLOG-details.md#t-855) |

<a id="t-851"></a>
## T-851
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-851 | 支持录制“123”短视频生成本人授权的 AI 数字人口播【数字人制作·用户 2026-08-16】 | 📋 待办 | 待审 | 待验 | 待补独立 SPEC（与 T-850 真人原声粗剪并列，共用受控成片链） | 用户录制一段正对镜头说“1231234567”等中性占位内容的短视频，系统把它作为本人数字人形象素材；用户选择目标口播稿和本人已授权音色后，由可配置的声音克隆/TTS 与口型驱动模型生成新的口播候选，用户无需完整背稿。形象样本与声音样本必须分开说明真实最低时长和质量要求，禁止承诺只说六个数字即可同时完成可靠声音复刻；仅允许本人或有可验证授权的肖像与声音，首次生成前必须明确同意用途，支持撤销和删除，生成结果保留 AI 来源标识，不自动对外发布。AI 只产候选，用户确认后才能进入现有制作时间线；原始样本永久保留且不得被生成结果覆盖，覆盖录制引导、授权、目标稿/音色选择、异步生成、失败恢复、预览确认、刷新回读、删除与 macOS/Windows 有效成片验收。 |

### 外置更新 2026-08-17
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-851 | 支持录制“123”短视频生成本人授权的 AI 数字人口播【数字人制作·用户 2026-08-16】 | 📋 待办 | 待审 | 待验 | 待补独立 SPEC（与 T-850 真人原声粗剪并列，共用受控成片链） | [详情](BACKLOG-details.md#t-851) |

<a id="t-850"></a>
## T-850
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-850 | 支持只上传未粗剪口播录像，由 AI 理解实拍语义并生成可确认粗剪【制作输入简化·用户 2026-08-16】 | 📋 待办 | 待审 | 待验 | 待补独立 SPEC（复用现有口播稿、ASR/SRT、制作决策与受控渲染链） | 用户只上传保留口误、停顿和重复录制的原始口播视频；系统自动提取带时间码逐字稿/SRT，由可配置 AI/Skill 对照权威口播稿和真实上下文理解哪些是正常临场微调、刻意强调、说错后重讲或废弃试讲，再产出不改原片的粗剪候选及逐段删留理由、前后预览和可恢复时间线。严禁用字符串相似度、关键词、固定词表或“与原稿不同即删除”冒充语义判断；确定性代码只负责音视频时间边界、真实 ID/权限/安全校验，以及用户确认后的裁切和 SRT、B-roll、信息卡时间码重排。无法确认时默认保留，原始视频永久保留；覆盖上传、转写、AI 语义对齐、候选确认、裁切、刷新恢复、小窗口与有效成片回读。 |

### 外置更新 2026-08-17
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-850 | 支持只上传未粗剪口播录像，由 AI 理解实拍语义并生成可确认粗剪【制作输入简化·用户 2026-08-16】 | 📋 待办 | 待审 | 待验 | 待补独立 SPEC（复用现有口播稿、ASR/SRT、制作决策与受控渲染链） | [详情](BACKLOG-details.md#t-850) |

<a id="t-847"></a>
## T-847
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-847 | 补齐 Windows 正式包的 CreatorOS CLI runtime 并重跑 1.1.0 双端流水线【T-846 阻断承接·用户认可 2026-08-16】 | ⏸️ 待办 | — | — | [构建验证](orchestrator/T847-BUILD-VALIDATION.md) | 修复 run `31942889066` 暴露的 Windows production closure 缺 `frontend/cli/creatoros.cjs` 与 `cli/node.exe`：让 CLI runtime 在 production closure 构建和 Tauri `beforeBuildCommand` 二次执行之间保持完整、目标平台 Node 正确且无开发机路径依赖；补先红后绿的打包顺序、随包文件与幂等重入测试，验证现有 macOS 路径不回归。提交修复并重新冻结后运行官方 macOS/Windows 双端流水线，必须同时通过 macOS 签名/公证/真启动和 Windows NSIS 真安装/主页面/卸载，下载两个安装包并计算 SHA-256；仍不创建 tag、Release，不改 Activity/Growth 或公开分发。 |

### 外置更新 2026-08-17
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-847 | 补齐 Windows 正式包的 CreatorOS CLI runtime 并重跑 1.1.0 双端流水线【T-846 阻断承接·用户认可 2026-08-16】 | ⏸️ 待办 | — | — | [构建验证](orchestrator/T847-BUILD-VALIDATION.md) | [详情](BACKLOG-details.md#t-847) |

<a id="t-846"></a>
## T-846
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-846 | 提交当前批准候选并运行 CreatorOS 1.1.0 macOS/Windows 官方双端构建【用户明确授权·2026-08-16】 | ⏸️ 待办 | — | — | 待形成发布验证 | 冻结并提交当前工作树中已批准的 CLI/项目回显、视频开场、渲染超时与视觉修复、发布物料解析、Windows HyperFrames 模块解析、诊断和编排引擎同步；运行官方四项打包预检、版本/密钥扫描与候选差异审计，以非强推方式同步到 `main` 并触发 `desktop-release.yml only=all`，持续跟踪同一 run，成功后下载 macOS DMG 与 Windows setup、核验 Developer ID/公证/staple/Gatekeeper、Windows 真安装启动卸载及 SHA-256。授权不包含 tag、GitHub Release、下载地址/Activity/Growth 更新、公开分发或真实用户放量。 |

### 外置更新 2026-08-17
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-846 | 提交当前批准候选并运行 CreatorOS 1.1.0 macOS/Windows 官方双端构建【用户明确授权·2026-08-16】 | ⏸️ 待办 | — | — | 待形成发布验证 | [详情](BACKLOG-details.md#t-846) |

<a id="t-845"></a>
## T-845
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-845 | 根治 Windows 用户机成片在 HyperFrames 启动阶段缺失分层模块解析器【T-844 根因修复·用户 2026-08-16】 | 🔨 待办 | — | 待验 | [构建验证](orchestrator/T845-BUILD-VALIDATION.md) · [根因诊断](docs/research/2026-08-16-windows-video-render-module-resolution-diagnosis.md) | 已修复正式 `exec.video.render` 与 Windows 少文件 runtime 的消费契约：分层 HyperFrames 子进程显式按绝对路径 `--require` 同一解析器，缺失时前置报重装，开发/传统路径不变；仍禁止 `NODE_OPTIONS` 并保持密钥环境收窄。错误现保留脱敏首尾、具体包名和错误码。先红后绿后 backend 26/26、Windows closure 14/14、双包 typecheck、boundary、semantic 与 diff-check 通过；当前 macOS 不能伪造 Windows 安装包真渲染，需下一份 Windows 包安装后完成短视频捕帧、编码与有效 MP4 验收，旧包重复重试无效。 |

### 外置更新 2026-08-17
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-845 | 根治 Windows 用户机成片在 HyperFrames 启动阶段缺失分层模块解析器【T-844 根因修复·用户 2026-08-16】 | 🔨 待办 | — | 待验 | [构建验证](orchestrator/T845-BUILD-VALIDATION.md) · [根因诊断](docs/research/2026-08-16-windows-video-render-module-resolution-diagnosis.md) | [详情](BACKLOG-details.md#t-845) |

<a id="t-843"></a>
## T-843
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-843 | 为 CreatorOS 建立可由 Codex 完整操作的官方 CLI，并复用现有全部业务能力【产品方向·用户 2026-08-15】 | 🔨 待办 | PASS[REV:ea17774db868] | — | [SPEC](docs/superpowers/specs/2026-08-15-creatoros-codex-cli.md) | 在保持桌面 UI、现有功能和同一份数据不变的前提下，把正式 contract 的全部业务读写 operation 1:1 暴露为 `creatoros` CLI/MCP，让 Codex 能操作定位、选题、项目、稿件、素材、作品数据、任务、候选及采纳/删除；支持账号列表/切换、扫码绑定、抖音本人作品与指标刷新、分享链接导入，并允许每条命令显式绑定真实 accountId，从而并行操控 3 个账号而不串号。当前用户开启本次启动的完整读写授权后，不再逐动作回 CreatorOS 点确认卡；所有调用仍走同一 backend service、真实 ID、账号属主、schema、幂等与审计，禁止直连数据库、复制业务逻辑、绕过激活/ownership、暴露密钥/内部 route 或破坏现有 UI，macOS/Windows 安装版与三账号 Codex 真闭环必须一起验收。 |

### 外置更新 2026-08-17
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-843 | 为 CreatorOS 建立可由 Codex 完整操作的官方 CLI，并复用现有全部业务能力【产品方向·用户 2026-08-15】 | 🔨 待办 | PASS[REV:ea17774db868] | — | [SPEC](docs/superpowers/specs/2026-08-15-creatoros-codex-cli.md) | [详情](BACKLOG-details.md#t-843) |

<a id="t-833"></a>
## T-833
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-833 | 根治结构化节点 schema 兼容报错与多张局部改稿卡无法连续采纳【用户高频真机反馈·2026-08-14】 | 🔨 待办 | — | 待验 | 复用既有结构化节点可靠性契约、`script.patch` 候选确认链与 T-819 当前稿定位契约 | 高频出现 `generateObject` 返回对象含 effective outputSchema 明确禁止的额外字段，文本兜底仍被同一严格校验拒绝；同一回复产生多张局部改稿候选时，采纳第一张会生成新稿版本，第二张仍绑定旧 base version/hash 而无法继续采纳。必须先以真实调用链和红测锁定根因，再只清理 schema 明确禁止的协议外字段且保持必填/类型约束 fail-closed，并让未采纳卡基于权威当前稿安全重放或明确检测同段冲突，支持按顺序全部采纳且不覆盖并发编辑、不伪造成功。 |

### 外置更新 2026-08-17
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-833 | 根治结构化节点 schema 兼容报错与多张局部改稿卡无法连续采纳【用户高频真机反馈·2026-08-14】 | 🔨 待办 | — | 待验 | 复用既有结构化节点可靠性契约、`script.patch` 候选确认链与 T-819 当前稿定位契约 | [详情](BACKLOG-details.md#t-833) |

<a id="t-831"></a>
## T-831
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-831 | 重排官方渠道模型配置并复核上游图生图能力【官方渠道配置·用户 2026-08-14】 | 🔨 待办 | — | 待验 | [官方配置确认稿](orchestrator/T831-OFFICIAL-MODEL-CONFIG-PROPOSAL.md) · [构建验证](orchestrator/T831-BUILD-VALIDATION.md) · [全模型返佣收益测算](docs/research/2026-08-14-omnihi-all-model-profit-analysis.md) · [全模型兼容矩阵](orchestrator/T829-MODEL-COMPATIBILITY-VALIDATION.md) · [逐能力模型契约](docs/superpowers/specs/2026-08-02-capability-scoped-channel-model-authority.md) | 用户确认官方 OmniHi 与本地中转站采用兼容双路径：官方托管参考图只认独立 `image.edit`，本地 Dudu/OpenAI-compatible 未单配 `image.edit` 时继续复用既有 `image.generate`；禁止按供应商名猜路由。CreatorOS 聚焦测试及三端类型检查通过。生产仍为 v2；后续保存 v3 并权威回读，不影响本地包继续使用本地自配图生图。 |

### 外置更新 2026-08-17
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-831 | 重排官方渠道模型配置并复核上游图生图能力【官方渠道配置·用户 2026-08-14】 | 🔨 待办 | — | 待验 | [详情](BACKLOG-details.md#t-831) | 完整任务范围、约束与验收证据见详情。 |

<a id="t-829"></a>
## T-829
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-829 | 建立并执行上游模型全能力真实兼容矩阵，覆盖渠道托管与用户中转站【用户 Windows 生图/文本回归·2026-08-14】 | 🔨 待办 | — | 待验 | [真实兼容矩阵](orchestrator/T829-MODEL-COMPATIBILITY-VALIDATION.md) · [逐能力模型契约](docs/superpowers/specs/2026-08-02-capability-scoped-channel-model-authority.md) · [模型配置体验契约](docs/superpowers/specs/2026-07-24-model-configuration-experience-redesign.contract.md) | 三份 Windows 日志确认模型请求前即被渠道配置 `security_error` 拦截；当前配置 13 模型已完成双接入验证。扩展轮又对中转站 `/models` 实时返回的 79 个模型逐个真跑流式/工具/结构化：首轮 153/237 请求通过，36 个首轮全过、3 个 60s 复测全过但不稳定、22 个部分可用、18 个三项均失败；连复测合计消耗 0.84532054 元，隔离 Key 已删除并复查剩余 0。正式 Skill、文生图/视频与错误分类修复均纳入同一报告；不修改用户配置、不自动切模、不发布。 |

### 外置更新 2026-08-17
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-829 | 建立并执行上游模型全能力真实兼容矩阵，覆盖渠道托管与用户中转站【用户 Windows 生图/文本回归·2026-08-14】 | 🔨 待办 | — | 待验 | [详情](BACKLOG-details.md#t-829) | 完整任务范围、约束与验收证据见详情。 |

<a id="t-828"></a>
## T-828
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-828 | 诊断行业热点出题不可用、Windows 滚动条异常与 DeepMind/Max 模型报错【用户 Windows 真机截图与加密日志·2026-08-13】 | 🔨 待办 | — | 待验 | [脱敏诊断报告](docs/research/2026-08-13-windows-hotspot-scrollbar-minimax-diagnosis.md) | 已确认三类问题互相独立：左栏“行业热点”是 0 候选即禁用的已有候选筛选器，顶部“基于热点出题”只打开编导并预填、不会自动执行，且真实热点依赖内容雷达信源/登录态或联网搜索；Windows 三根白色粗条来自 sidebar、稿面、Copilot 三个 raw `overflow-y-auto` 容器，暗色主题没有原生 scrollbar 适配；MiniMax 预设端点与当前官方文档一致，但模型 ID 自由输入且未做实时校验。所附 8 月 8 日日志只有 activation-only 启停 16 行、退出码 0，没有模型/热点调用，无法诚实判定本次是模型名、审核、额度、限流或超时；待用户复现后提供当天日志或错误原文再收口唯一根因。 |

### 外置更新 2026-08-17
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-828 | 诊断行业热点出题不可用、Windows 滚动条异常与 DeepMind/Max 模型报错【用户 Windows 真机截图与加密日志·2026-08-13】 | 🔨 待办 | — | 待验 | [脱敏诊断报告](docs/research/2026-08-13-windows-hotspot-scrollbar-minimax-diagnosis.md) | [详情](BACKLOG-details.md#t-828) |

<a id="t-827"></a>
## T-827
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-827 | 根治选题中心来源筛选失效与候选操作按钮无法点击【用户真机截图·2026-08-13】 | 🔨 待办 | — | 待验 | [构建验证](orchestrator/T827-BUILD-VALIDATION.md) · 复用既有选题中心页面与 topic 操作契约 | 根因已锁定并修复：`guardrail` 排序分支原先丢弃 `source`，现透传来源、状态、时间与分页；“手动灵感”在真实页只返回 2 条 idea 候选，清除后恢复 3 条全量。补全选题卡打开 AI 助手会保留当前 `sort + source`，关闭后不再跳丢筛选。左栏 5 个无法一对一映射候选来源的统计项明确标“仅统计”并解释原因，热点/灵感显示候选池真实数量。后端 16/16、前端 25/25、双端类型检查与 1024×768 真页面旅程已通过；不改选题语义、数据归属或用户数据，待用户本地包验收。 |

### 外置更新 2026-08-17
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-827 | 根治选题中心来源筛选失效与候选操作按钮无法点击【用户真机截图·2026-08-13】 | 🔨 待办 | — | 待验 | [构建验证](orchestrator/T827-BUILD-VALIDATION.md) · 复用既有选题中心页面与 topic 操作契约 | [详情](BACKLOG-details.md#t-827) |

<a id="t-826"></a>
## T-826
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-826 | 根治 CreatorOS v1.1 Windows 新安装包安装后无法启动【用户真机日志·2026-08-13】 | 🔨 待办 | — | 待验 | [Windows 首次启动 SPEC](docs/superpowers/specs/2026-07-23-desktop-packaging-first-launch-design.md) · [根因诊断](docs/research/2026-08-13-windows-v1.1-upgrade-startup-failure.md) · [构建验证](orchestrator/T826-BUILD-VALIDATION.md) | 根因已锁定为升级机旧 appData runtime 让启动代码跳过新安装 runtime，安装归档在成功物化后又已删除，最终误报缺 `sidecar.tar.gz`。已改为验证新副本后原子替换、提交失败恢复旧副本；Windows 验收包 run `31766801381` 已在模拟旧 runtime 状态下完成真安装、GUI、sidecar 主页面加载和卸载，安装包 SHA-256 已入构建验证。不触碰项目、数据库、密钥和日志；现只待用户在原故障机器直接安装复验，不创建 tag/Release、不改下载地址、不公开放量。 |

### 外置更新 2026-08-17
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-826 | 根治 CreatorOS v1.1 Windows 新安装包安装后无法启动【用户真机日志·2026-08-13】 | 🔨 待办 | — | 待验 | [详情](BACKLOG-details.md#t-826) | 完整任务范围、约束与验收证据见详情。 |

<a id="t-824"></a>
## T-824
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-824 | 根治昨日文稿 Skill 与内容动效卡片迭代在标准版成品中无明显效果【用户真实验收失败·2026-08-13】 | 🔨 待办 | PASS[REV:18361dc8c3c3] | 待验 | [SPEC](docs/superpowers/specs/2026-08-13-continuous-voiceover-storyboard-pipeline.md) · [根因诊断](docs/research/2026-08-13-standard-package-writing-motion-no-effect-diagnosis.md) · [构建验证](orchestrator/T824-BUILD-VALIDATION.md) | 已实现两段式写稿：第一阶段只生成连续口播，第二阶段只做逐字分镜；冻结口播、输入指纹、Skill 版本和分镜重试预算保存在 server-only 断点，分镜若改动任何口播字符只重做分镜且最多一次。旧账号 `script.draft` 覆盖与升级前排队任务继续走兼容链。自动化与边界检查通过后进入 v1.1 本地包，真实 DeepSeek Harness 稿件质量仍须用户验收，不把单测绿冒充主观效果通过。 |

### 外置更新 2026-08-17
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-824 | 根治昨日文稿 Skill 与内容动效卡片迭代在标准版成品中无明显效果【用户真实验收失败·2026-08-13】 | 🔨 待办 | PASS[REV:18361dc8c3c3] | 待验 | [详情](BACKLOG-details.md#t-824) | 完整任务范围、约束与验收证据见详情。 |

<a id="t-823"></a>
## T-823
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-823 | 根治架构图等主视觉被信息卡遮挡并修正跨段画面切换滞后【成片真机截图·2026-08-13】 | 🔨 待办 | — | 待验 | [构建验证](orchestrator/T823-BUILD-VALIDATION.md) | 当场景已有用户素材或生成的架构图、流程图、界面截图等高信息主视觉时，渲染器必须让主视觉占据可读安全区，信息卡只能作为不遮正文的紧凑标注，禁止把主图降成后方装饰卡；卡片内容必须绑定当前口播/字幕段，模式层结束即切换到可观测层，不能沿用上一段数秒。覆盖主图可读面积、人物避让、文字截断、相邻分段切换边界与当前 DeepSeek Harness 成片关键帧回归，并将本次反馈沉淀进视频编辑自迭代规则。 |

### 外置更新 2026-08-17
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-823 | 根治架构图等主视觉被信息卡遮挡并修正跨段画面切换滞后【成片真机截图·2026-08-13】 | 🔨 待办 | — | 待验 | [构建验证](orchestrator/T823-BUILD-VALIDATION.md) | [详情](BACKLOG-details.md#t-823) |

<a id="t-819"></a>
## T-819
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-819 | 让编导在普通对话中按自然语言定位并改写当前稿单段【用户真实用法·2026-08-13】 | 🔨 待办 | PASS[REV:0425ab7b87b8] | 待验 | [SPEC](docs/superpowers/specs/2026-08-13-natural-language-current-script-section-editing.md) · [构建验证](orchestrator/T816-T819-BUILD-VALIDATION.md) | 用户无需先点特殊按钮，可直接说“改第 7 段”“把项目对照那段缩短”或引用当前稿中的一句话；模型读取带 current artifact/version/hash 和稳定段落引用的结构化当前稿，负责语义定位目标段，代码只做账号/项目归属、current version、唯一命中、并发与候选确认校验。唯一命中后复用既有 `script.patch` 候选与采纳链，多段或零段命中才澄清；按钮入口继续作为快捷确定路径。禁止用关键词正则、字符串相似度或模型自报技术 ID 冒充定位，并补 no-op、换版、整稿意图不被旧锚点劫持及刷新读回回归。 |

### 外置更新 2026-08-17
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-819 | 让编导在普通对话中按自然语言定位并改写当前稿单段【用户真实用法·2026-08-13】 | 🔨 待办 | PASS[REV:0425ab7b87b8] | 待验 | [SPEC](docs/superpowers/specs/2026-08-13-natural-language-current-script-section-editing.md) · [构建验证](orchestrator/T816-T819-BUILD-VALIDATION.md) | [详情](BACKLOG-details.md#t-819) |

<a id="t-820"></a>
## T-820
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-820 | 修复选题补卡到项目与文案的数据丢失并保存生成消费血缘【T-811 审计承接·2026-08-13】 | 📋 待办 | — | — | 待形成 SPEC | 以 T-811 血缘审计为输入，打通补全选题卡到项目统一创作 Brief、可选论点和 `script.draft` 的真实消费：承接受众痛点、核心冲突、钩子方向、内容结构、素材依据与风险；修复 angle 已存任务却未进 runner、项目普通保存覆盖 `contentRadarEvidence/benchmarkRef`、立项 source 误标 manual 与三次写入非事务；让论点与写稿共享同一份 Brief/知识/项目证据，并为每次生成保存来源版本、字段 hash、是否实际消费及未消费原因。评分与定位标签是否进入生成须在 SPEC 中逐项裁决，不能把所有上游字段无脑塞进提示词。 |

### 外置更新 2026-08-17
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-820 | 修复选题补卡到项目与文案的数据丢失并保存生成消费血缘【T-811 审计承接·2026-08-13】 | 📋 待办 | — | — | 待形成 SPEC | [详情](BACKLOG-details.md#t-820) |

<a id="t-816"></a>
## T-816
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-816 | 让当前确认稿成为配图与封面生成的第一内容真相【用户确认·2026-08-13】 | 🔨 待办 | PASS[REV:fb03de3a57d7] | 待验 | [SPEC](docs/superpowers/specs/2026-08-13-current-script-truth-and-natural-language-section-editing.md) · [构建验证](orchestrator/T816-T819-BUILD-VALIDATION.md) | 用户确认视觉生成与稿件问答的上下文优先级：本轮明确要求最高；在事实、安全与版权边界内，当前项目中用户最后确认并正在使用的稿件版本是配图、信息卡、封面、时长与结构判断“这条内容到底在说什么”的第一内容真相，具体生成还须绑定对应分镜/段落；联网原文与项目素材负责事实证据，项目 Brief 只能补充与消歧且不得以“硬约束”覆盖当前稿，定位只调视觉语言与审美，历史对话、旧版本和未采纳 AI 候选不得覆盖当前稿面。当前稿与 Brief/时间码/口播量冲突时必须显式报出而非静默选旧值；需要把 artifact/version/hash、结构化段落、来源引用和覆盖度保存为生成任务快照，并与媒介硬分流、专用封面链和任务状态真值一起形成可回滚 SPEC；不直接沿用“最后生成”字面，避免未采纳候选夺权。 |

### 外置更新 2026-08-17
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-816 | 让当前确认稿成为配图与封面生成的第一内容真相【用户确认·2026-08-13】 | 🔨 待办 | PASS[REV:fb03de3a57d7] | 待验 | [SPEC](docs/superpowers/specs/2026-08-13-current-script-truth-and-natural-language-section-editing.md) · [构建验证](orchestrator/T816-T819-BUILD-VALIDATION.md) | [详情](BACKLOG-details.md#t-816) |

<a id="t-814"></a>
## T-814
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-814 | 统一 CreatorOS 多页面 AI 对话体验并保留场景上下文与自由讨论能力【用户体验方向·2026-08-13】 | 📋 待办 | — | — | 待形成 SPEC | 当前多个 AI 助手、浮层和页面入口给用户造成能力割裂；设计一个账号级连续编导会话与项目级连续创作会话，页面选择只作为当前上下文和快捷动作，不把助手限制为“选题页只能聊选题”；需要支持自由讨论、跨页面续聊、明确显示当前作用对象、切换项目/选题前确认、生成候选后由用户采纳，兼容现有工具、历史对话、内容雷达证据和项目 Brief，不一次性替换运行时或迁移历史数据，并以影子组装、双读校验和可回滚开关降低回归风险。 |

### 外置更新 2026-08-17
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-814 | 统一 CreatorOS 多页面 AI 对话体验并保留场景上下文与自由讨论能力【用户体验方向·2026-08-13】 | 📋 待办 | — | — | 待形成 SPEC | [详情](BACKLOG-details.md#t-814) |

<a id="t-779"></a>
## T-779
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-779 | 根治参考历史作品生成封面时误探本机工具并中断生图【v1.0 回归·用户确认 2026-08-11】 | 🔨 待办 | — | 待验 | 既有 `cover.generate`、`context.publications` 与 Copilot 媒体路由契约 | 当用户要求参考历史作品生成封面时，只从当前账号真实已发布且有封面的近期作品中，由编导模型结合当前内容语义选择“最新且最关联”的一条，相关性优先、发布时间用于同等相关候选裁决；随后必须直接把真实 `coverAssetId` 交给 `cover.generate`，不得用 `local.tools` 探测应用内生图模型、不得把 draft 当已发布作品、不得让用户替系统做 A/B 选择。缺配置、参考图读取或生成失败仍由真实封面任务诚实返回，不改视觉。 |

### 外置更新 2026-08-17
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-779 | 根治参考历史作品生成封面时误探本机工具并中断生图【v1.0 回归·用户确认 2026-08-11】 | 🔨 待办 | — | 待验 | 既有 `cover.generate`、`context.publications` 与 Copilot 媒体路由契约 | [详情](BACKLOG-details.md#t-779) |

<a id="t-773"></a>
## T-773
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-773 | 更新 CreatorOS 1.0 最新使用教程、匿名化截图并新建成交型测试版教程【教程交付·用户 2026-08-11】 | 🔨 待办 | — | 待验 | [完整教程](docs/CreatorOS-新用户0到1标杆路线.md) · [测试版飞书教程](https://my.feishu.cn/wiki/GaHrwmGHHiU8MQkovQZcNjxMnpe) · [发布稿](outputs/T-773/creatoros-v1-test-conversion-guide.md) | 以当前 1.0 产品事实重新核对教程中的入口、流程、模型、视频制作、激活与反馈等变化；逐张检查教程引用的实机截图，将左下角博主头像、昵称、账号名称等身份信息统一遮挡并保留原图可恢复副本；同时面向新引入客资新建“一天跑出真实成果”的测试版飞书教程，写入真实一天体验码，以产品理解、机制信任、快速成果和授权伙伴购买引导完成转化，不公开价格或绕过推荐人的直营入口；验证全部图片链接与文档事实，不修改产品代码。 |

### 外置更新 2026-08-17
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-773 | 更新 CreatorOS 1.0 最新使用教程、匿名化截图并新建成交型测试版教程【教程交付·用户 2026-08-11】 | 🔨 待办 | — | 待验 | [完整教程](docs/CreatorOS-新用户0到1标杆路线.md) · [测试版飞书教程](https://my.feishu.cn/wiki/GaHrwmGHHiU8MQkovQZcNjxMnpe) · [发布稿](outputs/T-773/creatoros-v1-test-conversion-guide.md) | [详情](BACKLOG-details.md#t-773) |

<a id="t-768"></a>
## T-768
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-768 | 任何云端 ASR 故障都必须自动回退本地 Whisper【逐字稿可靠性·用户确认 2026-08-11】 | 🔨 待办 | PASS[REV:3eb18966ea59] | 待验 | [SPEC](docs/superpowers/specs/2026-08-11-asr-universal-local-fallback.md) | 所有云端与渠道语音转文字路径在未配置、未绑定、额度不足、临时授权失败、鉴权、限流、网络、超时、供应商异常或响应不合法时，都必须停止使用当前云端凭据并对同一音频只尝试一次本地 Whisper；不得再用额度或模型配置问题阻断逐字稿。官方包必须包含本地转写所需运行时并验证首用准备链；只有本地 Whisper 自身失败时才显示本地转写失败，不改现有视觉布局。 |

### 外置更新 2026-08-17
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-768 | 任何云端 ASR 故障都必须自动回退本地 Whisper【逐字稿可靠性·用户确认 2026-08-11】 | 🔨 待办 | PASS[REV:3eb18966ea59] | 待验 | [SPEC](docs/superpowers/specs/2026-08-11-asr-universal-local-fallback.md) | [详情](BACKLOG-details.md#t-768) |

<a id="t-762"></a>
## T-762
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-762 | 根因复盘并设计渠道 ASR 密钥的短时租约闭环【正式版受管能力·用户 2026-08-10】 | 🔨 待办 | — | — | [受管模型契约](docs/superpowers/specs/2026-08-02-capability-scoped-channel-model-authority.md) · 既有 T-679/T-735/T-731 证据 | 基于昨天真实渠道 ASR 故障、当前 Activity ticket v3、Growth 受管凭据与本地密钥库实现，区分长期渠道密钥、短时 ASR lease、机器绑定和失败恢复的责任边界，形成不暴露长期密钥、不依赖用户手工配置、可自动续租且 fail-closed 的根治方案；本任务不修改产品代码或生产配置。 |

### 外置更新 2026-08-17
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-762 | 根因复盘并设计渠道 ASR 密钥的短时租约闭环【正式版受管能力·用户 2026-08-10】 | 🔨 待办 | — | — | [受管模型契约](docs/superpowers/specs/2026-08-02-capability-scoped-channel-model-authority.md) · 既有 T-679/T-735/T-731 证据 | [详情](BACKLOG-details.md#t-762) |

<a id="t-754"></a>
## T-754
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-754 | 根治 CreatorOS v1.0 官方包启动无限转圈【正式版启动阻断·用户 2026-08-10】 | 🔨 待办 | — | — | [桌面首次启动 SPEC](docs/superpowers/specs/2026-07-23-desktop-packaging-first-launch-design.md) · 既有 T-747 进展感知软看门狗契约 | 基于当前官方安装包启动状态机与安全日志锁定“持续转圈但既不进入主页面也不进入诊断页”的真实原因；真实进展只允许续期空闲看门狗，整个启动必须受最终收敛上限约束，sidecar 退出、重复无效进展、主页加载失败均及时进入可操作诊断且保全数据；补 macOS/Windows 契约与本地真启动回归，不改视觉、不顺带增加功能，正式重打包另按用户确认执行。 |

### 外置更新 2026-08-17
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-754 | 根治 CreatorOS v1.0 官方包启动无限转圈【正式版启动阻断·用户 2026-08-10】 | 🔨 待办 | — | — | [桌面首次启动 SPEC](docs/superpowers/specs/2026-07-23-desktop-packaging-first-launch-design.md) · 既有 T-747 进展感知软看门狗契约 | [详情](BACKLOG-details.md#t-754) |

<a id="t-748"></a>
## T-748
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-748 | 补齐“重新输入激活码”原生命令 ACL 并重打官方包【正式版回归·用户真机 2026-08-09】 | 🔨 待办 | — | — | [T-746 SPEC](docs/superpowers/specs/2026-08-09-in-product-activation-reset-design.md) | 正式包点击“重新输入激活码”不得再出现 `Command license_reset_local not allowed by ACL`；只为无参数命令 `license_reset_local` 增加最小 remote-sidecar 放行权限，并补齐“前端 invoke ↔ handler ↔ build command ↔ capability”一致性回归，不改 UI、清理边界或发布流程；验证后重跑官方 macOS/Windows 打包。 |

### 外置更新 2026-08-17
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-748 | 补齐“重新输入激活码”原生命令 ACL 并重打官方包【正式版回归·用户真机 2026-08-09】 | 🔨 待办 | — | — | [T-746 SPEC](docs/superpowers/specs/2026-08-09-in-product-activation-reset-design.md) | [详情](BACKLOG-details.md#t-748) |

<a id="t-733"></a>
## T-733
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-733 | 本地模型可用时收起渠道配置误报警并纠正票据不适用状态【模型设置·用户真机 2026-08-09】 | 🔨 待办 | — | 待验 | [渠道模型逐能力契约](docs/superpowers/specs/2026-08-02-capability-scoped-channel-model-authority.md#12-t-733-票据不适用与本地模型提示收口2026-08-09) | 当已保存的本地文本模型可正常使用时，设置页不再显示“渠道配置安全校验未通过”等与当前使用路径无关的红色提示；Activity 明确返回 `CONFIG_TICKET_REQUEST_INVALID` 时按当前激活不适用渠道托管配置处理，不得写成 `authorization_changed` 或 `security_error`，真正的签名、安全或授权变化失败仍保持可见并失败关闭。 |

### 外置更新 2026-08-17
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-733 | 本地模型可用时收起渠道配置误报警并纠正票据不适用状态【模型设置·用户真机 2026-08-09】 | 🔨 待办 | — | 待验 | [渠道模型逐能力契约](docs/superpowers/specs/2026-08-02-capability-scoped-channel-model-authority.md#12-t-733-票据不适用与本地模型提示收口2026-08-09) | [详情](BACKLOG-details.md#t-733) |

<a id="t-732"></a>
## T-732
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-732 | 根治局部改稿锚点失效后阻断全部 Copilot 对话【AI 对话可用性·用户真机 2026-08-09】 | 🔨 待办 | — | 待验 | [T-716 局部改稿规格](docs/superpowers/specs/2026-08-06-copilot-script-editing-and-attachments.md) · [验收审计](docs/research/2026-08-13-t716-t732-acceptance-audit.md) | AI 整稿写入必须持久化稳定段落 ID；存量无 ID 版本由稿面、执行重绑和补丁采纳使用同一兼容锚点并在新版本自愈。“AI 改写本段”只在用户明确发起及围绕该段连续修订时携带段落锚点；当前版本已无法重绑目标段时，必须结束这次局部改稿、清除失效锚点并恢复项目普通对话，不能让后续任意消息继续被 `SCRIPT_SELECTION_STALE` 拦截，也不能提供必然重复失败的“重试”。覆盖整稿换版→点击第 2 段成功→采纳只改该段，以及失败→普通消息成功→重新点段落成功的连续回归。 |

### 外置更新 2026-08-17
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-732 | 根治局部改稿锚点失效后阻断全部 Copilot 对话【AI 对话可用性·用户真机 2026-08-09】 | 🔨 待办 | — | 待验 | [T-716 局部改稿规格](docs/superpowers/specs/2026-08-06-copilot-script-editing-and-attachments.md) · [验收审计](docs/research/2026-08-13-t716-t732-acceptance-audit.md) | [详情](BACKLOG-details.md#t-732) |

<a id="t-730"></a>
## T-730
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-730 | 恢复可选“立论点”UI并增加适用场景引导，不重新变成写稿门槛【创作弹性·用户确认 2026-08-09】 | 🔨 待办 | PASS[REV:aeda30778cf2] | 待验 | [SPEC](docs/superpowers/specs/2026-08-09-optional-thesis-guidance.md) · [退役影响调研](docs/research/2026-08-08-thesis-skeleton-removal-impact.md) | 本次只恢复现有“核心论点/支撑依据/证据/反驳”论点骨架的可见 UI 与真实生成、编辑、保存能力，并明确标为可选辅助：知识讲解、观点评论、测评对比、长内容或需要证据/反驳时可先使用；已有完整逐字稿、简单通知、短口播、纯记录或只需快速成稿时可直接跳过。页面同时提供“先梳理观点”和“跳过，直接写稿”，未生成或未明确采用不得影响脚本；采用后的写稿消费必须在界面可见，不得恢复强制前置、后台隐藏消费、词面相似度选材或对完整逐字稿导入的阻断。本次不做分场景模板、字段改名或任意结构自定义。 |

### 外置更新 2026-08-17
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-730 | 恢复可选“立论点”UI并增加适用场景引导，不重新变成写稿门槛【创作弹性·用户确认 2026-08-09】 | 🔨 待办 | PASS[REV:aeda30778cf2] | 待验 | [SPEC](docs/superpowers/specs/2026-08-09-optional-thesis-guidance.md) · [退役影响调研](docs/research/2026-08-08-thesis-skeleton-removal-impact.md) | [详情](BACKLOG-details.md#t-730) |

<a id="t-726"></a>
## T-726
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-726 | 退役项目“论点骨架”并让写稿直接消费 Brief 与素材【创作链瘦身·用户确认 2026-08-08】 | 🔨 待办 | PASS[REV:2809820bf64a] | 待验 | [SPEC](docs/superpowers/specs/2026-08-08-thesis-skeleton-retirement.md) | 删除稿面论点骨架面板、“立论点”入口及 Copilot `planning.thesis` 新建链，新的写稿、策划、重建与制作不再读取或生成 `thesis_tree`；既有 artifact/version 只读保留且不再暗中影响新结果，项目素材继续通过用料链进入写稿和 B-roll，旧脚本版本与历史数据不删除。 |

### 外置更新 2026-08-17
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-726 | 退役项目“论点骨架”并让写稿直接消费 Brief 与素材【创作链瘦身·用户确认 2026-08-08】 | 🔨 待办 | PASS[REV:2809820bf64a] | 待验 | [SPEC](docs/superpowers/specs/2026-08-08-thesis-skeleton-retirement.md) | [详情](BACKLOG-details.md#t-726) |

<a id="t-874"></a>
## T-874
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-874 | 修复 BACKLOG 归档工具并完成历史积压瘦身【工程维护·用户确认 2026-08-17】 | 🔨 待办 | — | 待验 | `orchestrator/process/backlog-compact.mjs` 及其测试 | 把活动区已完成任务安全迁入只读归档，补齐七列归档契约与幂等 `--squeeze` 详情外置；保留所有未完成状态和历史证据，使主看板通过健康检查。 |

<a id="t-873"></a>
## T-873
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-873 | TC流量中心渠道专属本地包候选（已确认产品名、配色与图标）【渠道打包·用户确认 2026-08-17】 | 🔨 待办 | — | — | [渠道打包流程](.agents/skills/packaging-creatoros-channel/SKILL.md) | 使用已确认的 TC 流量中心品牌资产生成 macOS 本地验收包与 Windows 正式安装包；新包只固化产品名、图标和经校验的 `theme.sidebar`，渠道专属购买/续费/下载/反馈/客服链接统一不填并走官方反馈入口；macOS 完成预检、构建、安装与启动验证，Windows 通过独立 `channel-package` workflow 完成 NSIS 真安装、启动、卸载验证，不触发 CDN/Growth 发布或官方包变更。 |

<a id="t-835"></a>
## T-835
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-835 | 取消制作分镜逐字保真失败对整稿候选的阻断，并给出可诊断恢复【用户真机反馈·2026-08-14】 | 🔨 待办 | — | 待验 | 复用 T-824 连续口播与制作分镜契约 | 用户确认不能再因第二阶段分镜模型未逐字复述冻结口播而阻断整次写稿。继续保留“绝不丢口播”的硬门，但把口播真值收回确定性代码：纯空白漂移按冻结原文重新锚定并保留模型分镜字段；真实增删改或分镜模型失败时，直接从冻结原文生成不引入新事实的基础分镜候选，完整口播照常可采纳，同时记录恢复类型、首个差异位置与脱敏诊断。禁止模糊相似度、禁止让模型改写原口播、禁止把技术失败甩给用户重跑整稿。 |

<a id="t-821"></a>
## T-821
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-821 | 网站内容因未登录或权限不足读取失败时引导用户前往登录保管库【用户截图·2026-08-13】 | 🔨 待办 | — | 待验 | [构建验证](orchestrator/T821-BUILD-VALIDATION.md) | 当联网读取明确返回未登录、需要权限或登录后重试时，把冗长的内部恢复说明改成用户能行动的错误卡：说明当前未拿到原文、不会编造内容，提供“前往网站登录”入口直达「设置 → 网站登录保管库」，并保留登录后重试；普通 404、下架或无替代来源仍按真实原因提示，不得一律伪装成登录问题。覆盖按钮真实接线、返回路径、键盘可用性及没有设置入口时的诚实降级。 |

<a id="t-759"></a>
## T-759
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-759 | 根治已绑定 B-roll 因 inventory 失配显示空白【正式版制作回归·用户 2026-08-10】 | 🔨 待办 | — | 待验 | 既有 video.decisions、production.videoEditingPlan 与项目素材归属契约 | 分镜里的每条 B-roll 绑定必须与同源项目素材快照一起原子保存和恢复；当前素材仍可用时展示真实名称并可换选，素材已删除、归属变化或旧方案缺元数据时明确显示“素材已不可用”并允许移除或从当前项目重新选择，禁止渲染空白下拉、禁止静默改绑、禁止重新调用模型或读取全局/其他项目素材。 |

<a id="t-741"></a>
## T-741
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-741 | 下移知识库“记一条经验”入口到录入操作行【正式版细节·用户 2026-08-09】 | 🔨 待办 | — | 待验 | 既有知识录入与经验捕获契约 | 保留“记一条经验”现有 Copilot 深链与行为，只把入口从知识库页头右侧移动到倾倒场的录入按钮行、紧邻“手动补录”；页面只能保留一个入口，不改按钮风格、录入流程或知识库整体视觉。 |

<a id="t-739"></a>
## T-739
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-739 | 根治制作视频跨项目灌入 B-roll、无证据改稿偏好与超长复盘卡【正式版回归·用户 2026-08-09】 | 🔨 待办 | — | 待验 | 既有项目素材挂载、视频制作与发布复盘契约 | 视频制作的 B-roll 候选只能读取当前项目明确挂载/上传的素材；当前项目没有素材时诚实为空，不得混入全局或其他项目素材。改稿偏好只能由当前项目自身已发布后的评论、指标与用户明确采纳行为派生；项目未制作、未发布或无数据时不得展示跨作品偏好。复盘卡只展示简短、可核验摘要，详细依据按需展开，不得把内部信号、整稿或超长原始文本直接铺满页面；不改全局视觉体系。 |

<a id="t-738"></a>
## T-738
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-738 | 根治发布物料生成成功后无处查看并恢复卡内查看闭环【正式版回归·用户 2026-08-09】 | 🔨 待办 | — | 待验 | 既有发布物料生成与项目稿面契约 | “生成发布物料”成功后，原项目卡片必须显示真实可用的“查看发布物料”，在当前查看界面直接读取并展示已生成的各平台标题、正文等发布内容，支持刷新后回读；不得跳转发布中心，发布中心继续只负责排期管理，不新增发布管理入口、不改导航或视觉结构。 |

<a id="t-731"></a>
## T-731
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-731 | 支持按电商等创作场景生成并自定义创作框架【场景化框架·用户后续 2026-08-09】 | 📋 待办 | — | 待验 | T-730 后续 | 在 T-730 可选论点 UI 稳定后，再把固定四栏升级为场景化创作框架：由 AI 根据本次目标提出结构，支持电商、知识讲解、观点评论、测评等起点，并允许用户新增、删除、改名和排序框架项；不得用固定业务词表替代 AI 语义判断。 |

<a id="t-721"></a>
## T-721
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-721 | 根治素材包导出回流造成递归嵌套并恢复大素材库完整可见性【素材数据安全·用户 2026-08-08】 | 🔨 待办 | — | 待验 | [SPEC](docs/superpowers/specs/2026-08-08-material-export-isolation-and-asset-pagination.md) | 导出素材包必须作为一次性下载产物写入对象存储，不得创建普通素材记录；既有素材包 ZIP 保留但以后导出时自动隔离，防止 ZIP 自嵌套。素材中心和项目素材查询必须完整分页加载，不能因固定 200/100 条上限让旧素材消失。 |

<a id="t-677"></a>
## T-677
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-677 | 优化首页与定位中心切换时整页骨架卡顿 1–2 秒【桌面交互性能·飞书用户 2026-08-03】 | 📋 待办 | — | 待验 | 既有 DashboardQueryService、定位中心页面读取与 App Router loading 契约 | 保留主内容稳定框架，把非首屏数据改为可分区返回/延后加载，对高频路由做可验证预热，并记录 dashboard 与定位各读源耗时；页面切换不得因共享 `(creator)/loading.tsx` 把整个主区替换成骨架，需在 macOS 用户同等数据量下验证体感和实测耗时。 |

<a id="t-662"></a>
## T-662
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-662 | 根治成片把内部结构标签当正文并优化卡片文字重合【视频内容质量·用户 2026-08-02】 | 🔨 待办 | — | 待验 | [视频制作 overhaul SPEC](docs/superpowers/specs/2026-07-13-video-production-overhaul-design.md) | 视频场景标题和卡片正文必须来自观众可读的真实口播主张，`hook/value/新闻钩子` 等内部编导标签只能做控制元数据，不能直接出现在画面；同时按真实画布安全区、文本长度和人物画面占位约束卡片排版，避免文字重合与空黑屏。 |

<a id="t-660"></a>
## T-660
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-660 | 根治雷达预填逐字稿未解锁下一步及已采纳封面仍被判缺失【项目状态回显·用户 2026-08-02】 | 🔨 待办 | — | 待验 | [T-642 编导证据链 SPEC](docs/superpowers/specs/2026-08-01-content-radar-creative-handoff.md) | 项目阶段状态必须从真实已保存逐字稿和项目已采纳封面素材派生，不能依赖用户再敲一次键触发本地脏状态，也不能只认某一种封面生成回写字段；修复首次进入、采纳后即时回显与刷新后回显，并补真实链路回归。 |

<a id="t-655"></a>
## T-655
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-655 | 接通 Seedance 文生视频适配器并修复 `seeddance` 配置报未知 provider【文生视频阻断·用户 2026-08-02】 | 🔨 待办 | — | — | 既有 `video.generate` 与异步多模态 provider 契约 | 核实当前 Seedance 配置实际使用的官方或中转协议，在现有多模态 registry 中新增真实 submit→poll→download 适配器，并兼容已经保存的 `seeddance` provider 拼写；生成失败必须给出可行动原因，禁止把已配置能力误报成不支持。 |

<a id="t-654"></a>
## T-654
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-654 | 新增 Qwen 方言 ASR 适配器并接入设置预设【逐字稿质量·用户 2026-08-02】 | 🔨 待办 | — | 待验 | 既有 `transcribe.audio` 与多模态 provider 适配器契约 | 新增 `qwen-asr` 真实适配器，调用百炼 Qwen3-ASR 的 `chat/completions + input_audio`，复用安全音频分段并在设置页提供 Qwen 预设；用户只需填写模型名和 Key，未配置时仍回退本地 Whisper，普通话及方言走同一条逐字稿落库链。 |

<a id="t-650"></a>
## T-650
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-650 | 知识倾倒输入框支持拖拽文件直接导入【知识录入体验·用户 2026-08-01】 | 🔨 待办 | — | 待验 | 既有知识蒸馏与文件导入契约 | 用户可把当前支持的 PDF、DOCX、Markdown、TXT 文件直接拖进大输入框，获得明确拖入态、上传进度、成功结果与错误提示；拖拽必须复用现有文件导入真链路，不新增第二套解析或假上传。 |

<a id="t-651"></a>
## T-651
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-651 | 内容雷达默认按作品真实发布时间倒序【排序语义·用户 2026-08-01】 | 🔨 待办 | — | 待验 | 内容雷达既有列表排序契约 | 排序项改名为「最新发布」，主排序键必须是来源作品真实 `publishedAt`、且倒序；不得以采集入库、指标快照或最后更新时间冒充发布时间。发布时间相同时再以收录时间和稳定 ID 倒序；缺失发布时间的条目置后并如实显示。 |

<a id="t-644"></a>
## T-644
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-644 | 根治 CreatorOS macOS 客户端持续闪屏【运行态阻断·用户 2026-08-01】 | 🔨 待办 | — | 待验 | 既有桌面启动、sidecar 与 WebView 日志契约 | 基于当前安装包和本机实时日志区分 WebView 重载、前端异常重渲染、窗口重复创建或进程崩溃重启；锁定可复现触发源后修复，并验证页面稳定、数据不丢且不引入启动回归。 |

<a id="t-641"></a>
## T-641
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-641 | 根治发布中心“登录多日仍只有一个采集日、发布趋势不出曲线”【线上数据回流·用户 2026-07-31】 | 🔨 待办 | — | 待验 | 既有发布中心与抖音自动采集契约 | 以真实账号日志和 `metric_snapshots` 为证据，核实定时作品指标采集是否逐日执行、按账号落库并被发布中心查询；多个采集日必须形成真实折线，单日继续诚实显示单点，禁止按登录天数伪造趋势。 |

<a id="t-635"></a>
## T-635
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-635 | 把 CreatorOS 正式构建绑定到 Growth 商品的统一 `projectKey`，禁止运行时覆盖产品身份或关闭严格验签 | 🔨 本地实现待验 | PASS[REV:b8add273a494] | 待验 | [SPEC](docs/superpowers/specs/2026-07-30-growth-product-identity-binding.md) | 可分发包 exact `creatoros`、身份/验签不可运行时覆盖、三仓本地 identity 联调已通过；claim 保持关闭，等待统一提交与生产 J-047 receipt |

<a id="t-633"></a>
## T-633
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-633 | 恢复创作者中心自动扫码登录【线上阻断·用户 2026-07-30】 | 🔨 待办 | — | 待验 | 既有抖音登录契约 | 首次扫码直接打开创作者中心二维码页并复用同一按账号登录态，不再把普通抖音首页当默认入口；内容雷达改写可用性已由 T-1017 单独承接。 |

<a id="t-631"></a>
## T-631
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-631 | 根治大视频上传被 10MB 截断并误报 ffmpeg 缺失【线上阻断·用户 2026-07-30】 | 🔨 待办 | — | 待验 | [既有视频执行 SPEC](docs/superpowers/specs/2026-07-11-execution-layer-video-pipeline-design.md) | 修复桌面本地 blob 大文件上传截断，complete 前校验声明大小与实际大小，并把 `moov atom not found` 等素材损坏错误与二进制缺失严格分流；聚焦回归后产出本地安装包。 |

<a id="t-621"></a>
## T-621
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-621 | 补齐渠道模型 authority snapshot 生产链路回归【非阻断测试增强·T-606 复核】 | 📋 待办 | — | — | [绑定契约](docs/superpowers/specs/2026-07-29-creatoros-channel-model-authority.contract.md) | 补 `createTask → persistence → authority change → cancel/no provider call` 完整链路证据，不改变已确认契约。 |

<a id="t-576"></a>
## T-576
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-576 | 统一跟进尚未关闭的飞书线上用户反馈【线上支持】 | 🔨 免审 | — | — | [反馈表](https://my.feishu.cn/base/S1BRb4i6kaD0bnsViJSco0jxnRg?table=tblIPu0er91yGTwL&view=vewb4HsOUz) | 只负责新反馈分诊、进度同步和邮件闭环；故障实现由各自任务承接，未真机解决不得提前结案。 |

<a id="t-575"></a>
## T-575
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-575 | 接通 CreatorOS 权益领取、渠道配置与问题反馈【跨系统上线闭环】 | 🔨 本地PASS·待生产E2E | — | 待验 | [SPEC](docs/superpowers/specs/2026-07-27-t076-creator-three-system-launch.md) · [Gate](orchestrator/GATE-T575-BUILD.md) | 本地链路已通过；待真实发布材料、live HTTPS 三仓 E2E、双平台凭据后端与正式发布许可。 |

<a id="t-562"></a>
## T-562
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-562 | 根治 CreatorOS 0.2.0 Windows 安装后持续白屏【发布阻断】 | 🔨 免审 | — | 待验 | [SPEC](docs/superpowers/specs/2026-07-23-desktop-packaging-first-launch-design.md) · [复盘](docs/research/2026-07-24-windows-first-launch-white-screen.md) | 待真实启动链取证并修复 sidecar/WebView 导航；新包须通过安装后启动、health ready 与非白屏交互 Gate。 |

<a id="t-548"></a>
## T-548
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-548 | 根治视频渲染重试后成片脱离项目且制作页实时预览消失【发布阻断·用户 2026-07-26】 | 🔨 待安装版真机 | — | 待验 | [既有 T-292/T-254 规格](docs/superpowers/specs/2026-07-13-video-production-overhaul-design.md) | 重试 taskId 回传、项目/output/usage 幂等关联、export、内联预览恢复和图片 B-roll MIME 分流均已实现并通过聚焦测试；仅保留安装版真实渲染、成片回放与素材使用记录验收。 |

<a id="t-538"></a>
## T-538
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-538 | 接通渠道签名上下文的产品问题反馈【跨仓契约·上线闭环】 | 🔨 本地PASS·待生产E2E | — | 待验 | [契约](/Users/zyongzhu/Workbase/Thirdspace-growth/docs/contracts/channel-bound-product-feedback-v1.md) · [Gate](orchestrator/GATE-T538-BUILD.md) | 本地可信提交、失败保留和幂等重试已通过；待正式接口部署、发布 origin、真实激活码三系统 E2E 与独立复核。 |

<a id="t-536"></a>
## T-536
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

| T-536 | 根治“我的收藏”同步错误分类与浏览器档案锁恢复【bug·多账号采集·用户 2026-07-26】 | 🔨 待真实账号只读验收 | — | 待验 | 无 SPEC（既有收藏读取链故障） | 代码已提交 `85312bd2`：跨 chunk 错误按稳定 code 恢复、无活 context 才精准清锁且只重试一次、诊断脱敏、UI 给恢复动作；定向 130 tests、typecheck、build、boundary 通过，待有效登录态做真实收藏只读验收。 |

## t-915-triage-history

T-1014仅迁移原看板说明，状态和验收不变：

用户明确以系统减重、AI 延迟与可靠性、搜索和浏览器自我循环为核心；建议模块化单体、独立执行 Worker、统一工具和持久任务恢复，Pi 负责策略循环，生成保留短路径。先建立耗时/失败基线，接通真实工具并退役重复实现；用户已回复“认可”；架构方向确认见 DEC-RUNTIME-055，具体契约已独立评审通过；已代码接通正式聊天、Pi研究/素材/采集、封面与批量转写Worker；旧聊天流和宿主Agent装配已删除；同条件聊天准备依赖构建减小5.6%。登录资源物理迁移、剩余R-05入口、备用模型切换和运行验收仍未完成。记忆进化和任意脚本修改不在本轮。 用户 2026-09-07 要求优先交付自主规划、搜索/浏览器循环与失败恢复，暂缓自动测试与重复全局对账，由用户实测；未验证不得记为已验收。用户进一步授权破坏式代码更新，删除已替代旧实现并按既定 Worker/后端服务边界拆分，加速落地；要求高内聚低耦合，并通过有界消融对比判断删除收益。

## t-997-triage-description

T-1014仅迁移看板原说明，状态和验收未改：

ai/script-partial-adoption.service.ts 反向 import ai-runtime，打破 ai 与 ai-runtime 分层；依赖下沉或改走端口，不新增跨层穿透。

## t-919-triage-description

T-1014仅迁移看板原说明，状态和验收未改：

读取最新本机日志与运行进程，定位导航阻塞和资源争用；补充切换项目 Tab 丢失在途回复：保留账号/项目隔离的窗口级消息与订阅，避免恢复历史覆盖在途内容。补充素材意图纠偏：以用户当前意图和已提供全文制定检索需求、阅读并关联素材用途；无关结果不算完成，不把改关键词交回用户；与旧复盘请求解耦。补充用户截图与对话：消除普通对话完成通知刷屏、修复搜索来源链接并让独立检索继续读正文；修复有证据的根因，保留用户数据，沿用用户暂缓业务自动测试授权，未验证不得标为通过。

## t-916-triage-description

T-1014仅迁移看板原说明，状态和验收未改：

reconcile 实测 210 errors：模块 write_set/verify、自治声明、旧看板和 receipt 漂移；LED-024 预览缺指定 Playwright 浏览器。按当前事实校准配置和验收环境，不补造历史 PASS，不以降低门槛销账。T-930 收尾另实测 progress 被既有 T-923 write_set 通配路径拒绝，过程步骤未推进。 T-944 收尾复核保留全局对账、7 条边界违规、backend 13 个旧类型错误及雷达 5 项基线失败，证据见 docs/features/t944-director-prompts.md。

## t-917-triage-description

T-1014仅迁移看板原说明，状态和验收未改：

用户明确要求继续重构，数据恢复不再作为 T-915 阻塞；数据未恢复的事实保留。本次聊天测试已移除迁移 API、仅配置隔离数据库和临时媒体根并阻断迁移，整链通过；其余测试是否存在类似真实默认目录访问仍需专项核查，不宣称全项目测试隔离已完成。

## t-908-triage-description

T-1014仅迁移看板原说明，状态和验收未改：

隔离检查用户提供的 Skill 压缩包与当前已安装版本，以公开抖音链接实际验证短链解析、作品元数据、视频直链、下载和转写前置链路；同时审计 CreatorOS 当前实现，区分抖音上游变化、环境安装问题与实现缺陷，只有真实失败证据证明需要时才修改 Skill，并保留可复现测试。

## t-905-triage-description

T-1014仅迁移看板原说明，状态和验收未改：

这是独立于 CreatorOS 的新产品探索，不是 CreatorOS 手机版，也不把核心能力定义为传统数字人：用户首次录入行业、人设与对标，系统持续生成多种文案/风格供选择；有灵感时直接输入或口述，由 AI 协作成稿并进入手机拍摄；另研究用户只实拍“123321”等占位内容后，保留真人机位、身体动作和背景，仅用目标声音重新驱动口型的技术链。同步对照“开拍”等手机口播产品，比较供应商 API、自建云端 GPU 与混合部署，测算文案、音频、口型、包装、存储、渠道抽成、闲置算力和用户用量下的单位成本、毛利与盈亏平衡；方向确认前不进入实现。

## t-884-triage-description

T-1014仅迁移看板原说明，状态和验收未改：

解析用户提供的 `sidecar-2026-08-18.log.enc`，对齐同一次转写任务、输入媒体、ASR provider/模型、配置与错误链，区分密钥/权限、上游连接、媒体格式、运行时依赖、队列状态和回读映射；先只读，不重跑、不改配置、不改用户数据，给出可复现根因和是否属于代码缺陷。

## t-883-triage-description

T-1014仅迁移看板原说明，状态和验收未改：

只提交并发布已通过验收的 B-roll 删除修复候选；冻结检查后将候选安全同步到 `main`，触发 `desktop-release.yml` 的双平台矩阵并跟踪同一 run。不得夹带主工作区未提交渠道配置或 CLI 导出目录，不创建 tag/Release、不修改下载地址或放量配置。

## t-878-triage-description

T-1014仅迁移看板原说明，状态和验收未改：

当前真实生图适配器已把 401 分类为 authentication，但 `settings.models.test` 的 `image.generate` catch 丢弃错误类型，统一记录 `provider_error` 并提示检查网络和接口地址，导致用户无法知道应更换密钥。必须复用现有 `isAuthenticationFailure` 和安全日志 allowlist，让 401/403 显示“密钥无效或无权限”，其他网络、参数和响应错误继续分层且不泄上游正文、Key 或内部实现；先用真实 `MultimodalGenerationError auth_401` 形状补红测，再覆盖设置页读回与脱敏门禁。不调用真实模型、不修改用户配置。

<a id="t-1077"></a>
### T-1077 · 修复采纳与作品素材读取的项目返回值

- 原文档：[SPEC](docs/features/t1077-material-parent-port.md)
- 任务详情：新b640原401保留404项目不存在；真实项目可读，三个MaterialLinks私有适配丢弃Projects返回值。先精确独评、公共链RED→GREEN，保留原事务/归属/文件和原401，不重发生图；继续打包安装恢复，不push发布。 当前仅3产品行修复、正确owner公共RED4/2→GREEN6、原素材真实隔离PG18/0skip和最终类型0，独立实施限定PASS；错误同组账号拒绝断言与旧全局红如实保留。新包、原401保留/放画布和完整功能仍待验，不完成。

<a id="t-1075"></a>
### T-1075 · 修复安装验收发现的素材标签观察与纯组生图证明

- 原文档：[SPEC](docs/features/t1075-installed-ai-observation-gaps.md)
- 任务详情：用户全功能可用性稳定性验证的实际缺陷；真实Pi391缺标签版本观察，画布401纯组NULL被证明读取误拒；先精确独评，再RED→GREEN，沿原任务恢复，不重发生图、不改真实内容。 当前8路径源码独评PASS、真实RED及87私有PG通过保留；b640新DMG实际构建44基本/镜像/签名通过。T1076清理后原完整新鲜备份9步/安装12步均0，Native82283/CLI full；新Pi170真实标签候选→正式采纳→读回、原401证明available/原PNG全解码与剪辑rev5深等通过。原401保留操作404项目不存在，仍pending未放画布、不重发生图；完整功能仍待验，不完成。

<a id="t-1074"></a>
### T-1074 · 全面验收与补齐AI助手系统操作、工具开放性和功能提示词

- 原文档：[SPEC](docs/features/t1074-ai-system-operations.md)
- 任务详情：用户2026-10-08要求深度调研Coze X/Coze Code及优秀开源实践，并落地全功能AI操作，重点画布创建、生图、自然语言剪辑；先核真实工具/权限/提示词与公共调用链，记录具体缺口并补精确范围独评后实现，不以泛称“不支持”结束；保留真实归属、用户采纳、合法任务和原保存导出，不push或发布。  9文件补充复核已获用户明确授权并通过b19144c34cab；四API组登记、原编辑器正式来源桥接/脏稿/新输入保护、选题行锁和有父雷达纯读已实现。真实私有PG最新66通过含3项两连接行锁竞态及7个分页族，来源/host176通过，前端67/LED047167通过，前端/contract/worker/mcp类型通过；后端仅原2测试错误。1366/1024实际输入保留；核心独评原CORE-001分页已修复并复核关闭，原FAIL保留；源码cacf4d26/冻结74883948新DMG实际出包并备份安装0；Native81735/CLI full与409目录、5组3账号/原稿工程深等、旧8.16成片下载解码通过。新安装版真实Pi画布候选→采纳→精确读回/原source幂等/跨组及摘要拒绝通过；Codex右栏、生图、7视频及全功能原生仍待验，不完成任务。 用户追加“全功能可用性稳定性验证”，本轮沿T1074/T1062原完整范围扩展当前安装版中性公共读写、取消/恢复/回放、素材持久化与性能观察；不改真实内容或代签原生验收。 当前安装748新增中性output133真实导入/手工分段裁切删段重排/8秒预览/render195原执行确认/1080p30fps240帧全解码/来源时标核对/历史restore至rev5/同key回放及跨组拒绝通过；这是公共手工链，不代签右侧Codex/七类AI剪辑或原生。b640包随后经原完整新鲜备份已实际安装；最新15类公开读取全通过、工程rev5深等、标签Pi候选采纳/读回及原401证明恢复通过；原图保留404、原生/两引擎全功能仍待验，不完成。 旧748公共手工视频链限定独评PASS/0开放问题，506引用；不代签新包、AI剪辑或全功能。 新b640真实Pi文章/图文局部精调task205完成但工具参数空数组/null填错，最后文章占位候选未采纳；原221/242完整DTO深等不变。9次内存HTTP codec穿透probe未见空值/换行变形，下一步用原typed_patch精调公共链补验，不签模型成功。

<a id="t-1071"></a>
### T-1071 · 修复账号绑定和页面Tab切换卡顿

- 原文档：[SPEC](docs/features/t1071-navigation-latency.md)
- 任务详情：用户2026-10-07反馈点击账号组与绑定账号以及任何Tab都特别卡；优先只读测量当前安装版及当前源的点击、请求、查询和渲染，确定共同慢点后补精确范围独评，保留未保存稿件/剪辑、组隔离和原丰富UI；修复验证后纳入新本地包，不push或发布。 当前四前端窄修真实RED5→GREEN35、LED047162/类型通过；实际native切四Tab与账号管理保持同句柄/X11，六步工程GET12→0，Undo/Redo/保存rev9/5秒MP4解码通过；原生200%按钮、安装版和新冻结包仍待验，后台未改。 源修复a2b803ed已提交；全局实际37错误/1告警与824原ERROR集合完全一致、原T1018/T1015保留；尚不完成任务。 新冻结5e6d025c本地DMG真实exit0、44打包/镜像/双签/1082资源核验通过；新包经dntvfwhr新备份和独评0eb2f安装器实际安装0，CLI恢复full，5组/3账号深等、工程rev6/文章233/图文258及8.16秒原成片下载解码通过；浏览器来源403与桌面自动化权限缺失保留，原生首页/切页待用户实际反馈，不完成任务。

<a id="t-1070"></a>
### T-1070 · 打通Codex执行与编导精调，脚本一键生成文章和图文

- 原文档：[SPEC](docs/features/t1070-director-script-workflow.md)
- 任务详情：用户2026-10-07实际验收反馈：Codex引擎不能执行、编导不能自然语言剪辑；对照ChatCut，用户随后明确不做自动视频初稿；确认脚本后按钮一键生成文章/图文，再用编导持续调整；视频只导入录像并自然语言精剪；移除偏离主链的快剪集成/快速转换入口，保留既有作品和合法保存导出；先只读复现与契约盘点，补精确范围并独评后实现，不push或发布。 2026-10-07核心修复已提交f25c0098及原生纹理版本cdd3b1dc；真实Codex分镜联合5章/5卡和文章/图文指定字段精调、预览/CAS/刷新/HTML或4页ZIP通过；原持久native候选97实际warm首frame24、一次CAS/Undo/Redo/手工保存/切Tab刷新/5秒MP4解码通过，保留原AAC尾minor；53原生回归/710重建/双build独评通过。新本地包及安装版逐项验收继续，不代签字幕/变速/替换真模型或整个任务。

<a id="t-1062"></a>
### T-1062 · 汇总各会话改动统一提交并打包本地客户端，逐项验收含Skill粗剪

- 原文档：[SPEC](docs/features/t1062-consolidated-local-client-acceptance.md) · [测试预算补充](docs/features/t1062-backend-test-harness.md) · [安装渲染修复补充](docs/features/t1062-installed-render-skill-owner.md)
- 任务详情：用户2026-10-05授权汇总提交、本地打包及逐功能验证；盘点账号组、画布模板、文章图文、Codex与剪辑分支，核对ChatCut粗剪流程；不push或公开发布，不代签用户验收。 用户随后确认使用当前 macOS 登录用户与现有 App 直接验收；先备份应用和当前数据，再安装本地候选，只创建中性验收夹具，不重置激活或自动归组真实资料。

<a id="t-1022"></a>
### T-1022 · 按账号组统一多平台工作区、绑定管理、首页与复盘

- 原文档：[SPEC](docs/features/t1022-account-group-workspace.md)
- 任务详情：用户2026-10-04要求先调研并全面设计；全局切换账号组、组内筛选抖音/快手/视频号/公众号/小红书，共享内容分发与数据可见；使用用户提供的oil-ui-pro 0.10.0并纳入页面规范；用户否定A/B并明确保留原版丰富布局，只补总览和多平台切换；用户已认可原版增补，追加要求图表更美观；用户再次指出图表缺坐标；保留布局，补数值/日期轴与单位，缺明细不画日折线，用户已回复ok开始执行；正式接入已评审的显式归组与迁移预览方案，真实库执行先备份校验。2026-10-05正式组工作区及原版页面已接入，1366/1024真实保存/冲突/切组旅程通过；启动/调度及归档执行增量已独立复核关闭；后台362条、真实18检查点再次通过。receipt因混合工作树不能绑定HEAD，真实平台及安装版仍待验。

<a id="t-1015"></a>
### T-1015 · 核实剩余教训失败并校准过期回归断言

- 原文档：[实测清单](docs/verification/t1014-reconcile-triage.md)
- 任务详情：从19条失败命令定位旧版本/源码字符串断言与实际重试、消费、交互差异；保留有效检查，修正后重验。 本轮T-1022收尾reconcile仍15项既有LED失败，日志docs/verification/t1022/logs/reconcile-final.log；新增LED-052及LED-047通过。 本轮T-1063按受支持方式升级至3.27.3后，原对账实测35错误/1警告；完整结果及原失败见[维护证据](docs/verification/t1063/tool-upgrade-result.json)。LED-052缺显式隔离PG环境不得skip，LED-049需按原命令继续核因；范围内问题由T-1062修复验收，未改基线或旧回执。 2026-10-06 T-1067 收尾实际36错误/1告警，完整原始记录见T-1062验收表；T-734旧字符串断言在67b基点同样失败，六输入字节相同，未删断言；T-1067固定8路径之外，全局各失败保留核因。

<a id="t-916"></a>
### T-916 · 修复工程对账与历史任务证据漂移，恢复可信重构基线【T-914 实测根因·2026-09-04】

- 原文档：[审计 A-13](docs/research/2026-09-04-architecture-agent-audit.md)
- 任务详情：reconcile 实测 210 errors：模块 write_set/verify、自治声明、旧看板和 receipt 漂移；LED-0；[原说明](BACKLOG-details.md#t-916-triage-description)。 本轮T-1022收尾对账33错误/1告警，其中17项历史回执/链接漂移，见docs/verification/t1022/logs/reconcile-final.log。

<a id="t-883"></a>
### T-883 · 提交并推送 T-881/T-882 候选，触发 GitHub macOS 与 Windows 官方安装包流水线【用户明确授权·2026-08-18】

- 原文档：复用 [T-881 验收](orchestrator/T881-FRONTEND-VALIDATION.md)、[T-882 本地包验收](orchestrator/T882-BUILD-VALIDATION.md)
- 任务详情：只提交并发布已通过验收的 B-roll 删除修复候选；冻结检查后将候选安全同步到 `main`，触发 `desktop-release.ym；[原说明](BACKLOG-details.md#t-883-triage-description)。

<a id="t-1073"></a>
### T-1073 · 修复全面排查确认的8处资源浪费与内存泄漏

- 原文档：[SPEC](docs/features/t1073-resource-memory-fixes.md)
- 任务详情：8处源码修复已本地整合提交，生命周期301/301及独立复核通过，原任务/幂等/跨页回复和合法输出保留；最终reconcile仍34个既有错误/1告警、逐行无新增，根因T916/T1015/T1018保留；正式安装版与像素未验，不安装/推送/发布。详[修复报告](docs/verification/t1073/REPORT.md)。

<a id="t-1071-resource-audit"></a>
### T-1071-resource-audit · 全系统排查资源浪费与内存泄漏并隔离复现

- 原文档：[排查范围](docs/verification/t1071-resource-memory-audit.md)
- 任务详情：已隔离复现8项资源缺陷并登记6个根因整改任务；成功Whisper线程1→2→3、IPC50MiB回执保留、SSE缓冲及前端/后台重复工作，详[报告](docs/verification/t1071/REPORT.md)；本轮只诊断，未修改产品代码/安装版或真实数据，UI交付验收不适用。 来源workbase原T-1071-resource-audit，历史状态与原回执仅保留来源，不冒称本轮验收。

<a id="t-1068-radar-transcription"></a>
### T-1068-radar-transcription · 隔离复现内容雷达转录 MODEL_RESULT_UNKNOWN 暂停并定位原因

- 原文档：[诊断范围](docs/verification/t1068-radar-transcription.md)
- 任务详情：用户2026-10-07明确不考虑真实账号，直接复现；使用隔离数据与本地HTTP故障服务跑实际Worker/模型链，核对已识别原文、后处理、账本与暂停状态，不重发用户任务，未实证不声称根治。 来源workbase原T-1068-radar-transcription，历史状态与原回执仅保留来源，不冒称本轮验收。

<a id="t-1066-timeout-policy"></a>
### T-1066-timeout-policy · 全系统统一两分钟超时下限、嵌套预算与Skill防复发

- 原文档：[SPEC](docs/features/t1066-timeout-policy.md)
- 任务详情：用户2026-10-06授权按T-1065完整清单修复全部超时策略，单次执行/结果等待最低2分钟，外层预算覆盖内层及清理余量，长任务继承持久任务预算；规范与Skill沉淀并加回归门，不推送发布或改真实数据。 来源workbase原T-1066-timeout-policy，历史状态与原回执仅保留来源，不冒称本轮验收。

<a id="t-1067-skill-verification"></a>
### T-1067-skill-verification · 清理通用产品流程Skill既有公开分发校验债务

- 原文档：[根因证据](docs/verification/t1066/SKILL_VERIFICATION.md)
- 任务详情：本轮实际复测3.27.3与3.27.4均6错误31告警，涉及历史个人路径、宿主旧文字及README安装说明；新增超时规则及selfcheck通过，不删除历史或把旧失败标绿，不属于本轮超时行为整改。 来源workbase原T-1067-skill-verification，历史状态与原回执仅保留来源，不冒称本轮验收。

<a id="t-1018"></a>
### T-1018 · 清理本轮测试暴露的全局类型与边界欠债

- 原文档：[实测证据](docs/verification/t1017-rewrite-first.md)
- 任务详情：后端旧测试 API/类型漂移、contract旧快照/资产/cover断言、live-chat-session SDK 边界与 video-decisions-runner 语义门仍失败；与 T-1015 历史教训对账联动，不混入 T-1017。 本轮T-1022再次实测原12项后端类型、3项契约及边界/语义旧失败，见docs/features/t1022-account-group-workspace/VERIFICATION.md。 本轮T-1066-timeout-policy隔离树再次实测同12个后端类型/3个契约/2个live-chat SDK边界既有失败，详docs/verification/t1066/REPORT.md。 T-1069-completion-json/T-1070-transcript-reliability保留同12类型/2边界旧失败，generation-replay旧断言在HEAD归档基线与当前均9/10通过；见docs/verification/t1069/generation-replay-baseline.log。


<a id="t1080-retained-row-80e4d3ffb5f9172c"></a>

### 本轮保留的 T-1068 完整原行

```text
| T-1068 | 排查并修复本地客户端启动超时，交付可启动测试包 | ✅ 待办 | PASS[REV:8abc34b1f775] | — | [SPEC](docs/features/t1068-local-client-startup.md) | 用户2026-10-06启动超时报错已定位本机probe经过代理502；专用client.no_proxy窄修69b6be8f及17回归独评通过。1.2.0新包实际构建/镜像/深签名/277资源0，新鲜备份7i4su后固定入口自动安装（非planned installer）；安装内容精确核同源，两次原生HTTP首页加载+公开CLI/首页200/粗剪工程及已导出任务资产深等成功；用户已明确已显示正常首页。T734旧合同及全局旧红保留，不代签T1062完整功能。仅宿主逻辑无UI重设计，独评纠正验收类型—；未push或发布。
```

<a id="t1080-retained-row-c9ebcc41ffd59f36"></a>

### 本轮保留的 T-1024 完整原行

```text
| T-1024 | 紧急排查充值50元后Growth受管Omni模型仍报余额不足 | 🔨 待办 | — | 待验 | [排查范围](docs/verification/t1024-managed-credit-diagnosis.md) | 充值及Omni额度同步已实证正常；两份Windows日志定位21:08/21:11/21:15选题聊天约352万粗估且未收敛、约1.5秒报AI_CREDIT_EXHAUSTED；已验证单轮裁剪缺口与图片base64粗估歧义，原始供应商错误/模型/附件类型仍待对齐，不改账、不重发原大请求。 |
```

<a id="t1080-retained-row-32643c4cf546ed76"></a>

### 本轮保留的 T-1069-completion-json 完整原行

```text
| T-1069-completion-json | 修复雷达文本模型完整非流式JSON回执被流式解析误判未知 | ✅ 待办 | PASS[REV:020bbb5c97fa] | — | [SPEC](docs/features/t1069-completion-json-compat.md) | 用户2026-10-07授权根治T-1068-radar-transcription复现缺陷；同一请求完整JSON兼容，保留断流未知与幂等，不重发原任务、不改安装版。 来源workbase原T-1069-completion-json，历史状态与原回执仅保留来源，不冒称本轮验收。 |
```

<a id="t1080-retained-row-e350e6053e05749b"></a>

### 本轮保留的 T-1069 完整原行

```text
| T-1069 | 修复安装版素材导入慢与跨Tab丢失，重设计素材选择并补多平台绑定入口 | 🔨 待办 | PASS[REV:19bad8ef6f93] | 待验 | [SPEC](docs/features/t1069-installed-media-and-binding.md) | 用户2026-10-06实际截图验收；查分段性能和素材持久化；用户追加模板照片选择，同类入口共用缩略图/搜索/预览选择器，保留原版紫色丰富布局并使用oil-ui-pro；核对已装配小红书登录与组绑定，其他平台按真实能力；先只读核因，精确实现补充独评后开工，不push/发布。 |
```

<a id="t1080-retained-row-ef8386b2a0a060cc"></a>

### 本轮保留的 T-1063 完整原行

```text
| T-1063 | 修正流程工具误拒合法字面方括号文件路径 | 🔨 待办 | PASS[REV:4d99824da112] | 待验 | [SPEC](docs/features/t1063-orchestrator-literal-path-boundary.md) | T-1062已准入前端范围含7个Next动态路由文件；3.27.2的progress及candidate校验误将字面方括号当glob，阻断必要整合。保持精确路径及原隔离边界，经独立评审、公共工具回归和受支持技能升级后解除，不扩目录通配符、不公开发布。 |
```

<a id="t1080-retained-row-e05ce3185fe7853c"></a>

### 本轮保留的 T-1070-transcript-reliability 完整原行

```text
| T-1070-transcript-reliability | 修复通用转录整理文本兼容模式缺少schema校验器与保存阻断 | ✅ 待办 | PASS[REV:5b690995d15b] | — | [SPEC](docs/features/t1070-transcript-postprocess-reliability.md) | 用户2026-10-07授权同轮修复；共享validator与实际后端保存回归，确认的原文安全降级，未知账本不伪造成功。 来源workbase原T-1070-transcript-reliability，历史状态与原回执仅保留来源，不冒称本轮验收。 |
```

<a id="t1080-retained-row-ab507299fb3fcd91"></a>

### 本轮保留的 T-878 完整原行

```text
| T-878 | 让生图模型连接测试正确识别并提示 401/403 鉴权失败【T-877 诊断承接·2026-08-17】 | 📋 待办 | — | — | [T-877 脱敏诊断](docs/research/2026-08-17-dudu-image-auth-failure-diagnosis.md) | 当前真实生图适配器已把 401 分类为 authentication，但 `settings.models.test` 的 `image.g；[原说明](BACKLOG-details.md#t-878-triage-description)。 |
```

<a id="t1080-retained-row-15d0c7dabac4150e"></a>

### 本轮保留的 T-884 完整原行

```text
| T-884 | 只读诊断用户加密日志中的 ASR 转写失败【用户日志·2026-08-18】 | ⏸️ 待办 | — | — | 复用 T-768 ASR 通用回退、T-639 MiMo ASR 与 T-676 逐字稿队列契约 | 解析用户提供的 `sidecar-2026-08-18.log.enc`，对齐同一次转写任务、输入媒体、ASR provider/模型、配置；[原说明](BACKLOG-details.md#t-884-triage-description)。 |
```

<a id="t1080-retained-row-916d71382f9f6b24"></a>

### 本轮保留的 T-905 完整原行

```text
| T-905 | 调研独立的极简手机口播创作产品，以人设选稿、灵感写稿、实拍与“123321”真人换口型为核心【产品可能性探索·用户 2026-08-20】 | 📋 待办 | — | — | — | 这是独立于 CreatorOS 的新产品探索，不是 CreatorOS 手机版，也不把核心能力定义为传统数字人：用户首次录入行业、人设与对标；[原说明](BACKLOG-details.md#t-905-triage-description)。 |
```

<a id="t1080-retained-row-0d6e5afae67dc6b3"></a>

### 本轮保留的 T-908 完整原行

```text
| T-908 | 真实复测 douyin-transcribe Skill，并对照 CreatorOS 当前抖音抓取链路判断是否需要兼容修复【用户截图与压缩包·2026-08-23】 | 📋 待办 | — | — | — | 隔离检查用户提供的 Skill 压缩包与当前已安装版本，以公开抖音链接实际验证短链解析、作品元数据、视频直链、下载和转写前置链路；同时审计 ；[原说明](BACKLOG-details.md#t-908-triage-description)。 |
```

<a id="t1080-retained-row-125af640cc5d45f9"></a>

### 本轮保留的 T-919 完整原行

```text
| T-919 | 定位并修复本地包主导航卡顿、助手通知刷屏与搜索停滞【用户运行反馈】 | 🔨 待办 | — | — | 复用 T-912/T-909 导航契约与 [T-915 SPEC](docs/superpowers/specs/2026-09-04-agent-runtime-refactor.md) | 读取最新本机日志与运行进程，定位导航阻塞和资源争用；补充切换项目 Tab 丢失在途回复：保留账号/项目隔离的窗口级消息与订阅，避免恢复历史覆；[原说明](BACKLOG-details.md#t-919-triage-description)。 |
```

<a id="t1080-retained-row-2eb38b106511cdb8"></a>

### 本轮保留的 T-997 完整原行

```text
| T-997 | 修复 ai→ai-runtime 反向依赖边界违反 | 📋 待办 | — | — | [T-914 审计](docs/research/2026-09-04-architecture-agent-audit.md) | ai/script-partial-adoption.service.ts 反向 import ai-runtime，打破 ai 与 ai-；[原说明](BACKLOG-details.md#t-997-triage-description)。 |
```

<a id="t1080-retained-row-43eab6d6e3e39443"></a>

### 本轮保留的 T-906 完整原行

```text
| T-906 | 放大 AI 助手默认窗口并支持拖拽缩放与跨启动尺寸记忆【用户反馈·2026-08-20】 | ⏸️ 待办 | — | 待验 | — | AI 助手默认窗口应明显大于当前尺寸，用户可从右下角手柄拖拽调整大小；每次调整后的宽高保存在本机，下次启动自动恢复，并受最小尺寸与当前屏幕可见范围约束，避免内容不可用或换屏后窗口超出视口。 |
```

<a id="t1080-retained-row-0808de95d80d8a23"></a>

### 本轮保留的 T-1076 完整原行

```text
| T-1076 | 清理旧安装包与本轮临时构建垃圾 | ✅ 待办 | — | — | [SPEC](docs/features/t1076-clean-obsolete-local-packages.md) | 用户明确授权清理旧包/垃圾以释放新包安装空间；只删本会话确认过期的DMG与未占用可重建缓存，保留新b640包、当前App、全部回滚备份/素材/原证据；记录精确SHA清单与实际空间，维护不改产品、不push发布。 |
```

<a id="t1080-retained-row-e5c1f0d53099b701"></a>

### 本轮保留的 T-1064 完整原行

```text
| T-1064 | 只读诊断本机作品升级/提取 AbortError | ✅ 待办 | — | — | [排查记录](docs/verification/t1064-aborterror-diagnosis.md) | 用户2026-10-06提供王温特“做数字人，你到底要不要花钱”卡片截图；对齐最新本机日志、真实版本与原请求，查明中止来源；不重发任务、不改用户数据或安装版，流水线T-1063-release-pipeline仍待推送授权。 |
```

<a id="t1080-retained-row-e2b40696b7cb6d4c"></a>

### 本轮保留的 T-1024-runtime-liveness 完整原行

```text
| T-1024-runtime-liveness | 根治聊天生成占用数据通道与重启后 unknown_result 卡死 | ✅ | — | — | [SPEC](docs/features/t1024-chat-runtime-liveness.md) | 真实安装版生成期间查询被阻塞，重启后原任务停在 unknown_result；释放长调用期间的数据通道，并让 agent loop 沿原任务安全恢复或明确收口。 本地main原任务T-1024的来源别名，原事件/验收证据不改写。 |
```

<a id="t1080-retained-row-d0c6d059440fcd70"></a>

### 本轮保留的 T-1021 完整原行

```text
| T-1021 | CreatorOS封面与小红书图文双模板库、行业分类及私人收藏 | 🔨 待办 | PASS[REV:f0f3fa0ff91b] | 待验 | [SPEC](docs/features/t1021-cover-template-library.md) | 用户认可复用发布链，补充宿主为无限画布；补画板/图文页组、固定工具面板、比例与缩放分离及发布引用方案；当前分支尚未定位画布入口，已询问位置。旧SPEC评审不覆盖本补充，生产未接入。 |
```

<a id="t1080-retained-row-b6ea894360489899"></a>

### 本轮保留的 T-1063-release-pipeline 完整原行

```text
| T-1063-release-pipeline | 取消双端出包人为超时与阻断检查并重跑 Windows 流水线 | ✅ 待办 | PASS[REV:245946205971] | — | [SPEC](docs/features/t1063-release-pipeline.md) | 用户2026-10-06独立委派；先核对“1.12版本”真实失败运行；仅修改流水线和必要打包脚本，生成制品与额外验证分离；重跑Windows并核实安装包，不新增版本/tag/Release，不触碰T-1062与真实用户数据。 |
```

<a id="t1080-retained-row-aed1560bebc24ab1"></a>

### 本轮保留的 T-1072-owned-devices 完整原行

```text
| T-1072-owned-devices | 配合 Growth 轻量手机号账号与正式双设备，补齐新电脑连接与已激活账号入口 | 🔨 待办 | PASS[REV:eb8de221287b] | 待验 | [SPEC](docs/features/t1072-owned-devices.md) | 用户已采纳并授权与Growth T-188一起实施；仅隔离本地改造，原码首台不变，第二电脑本人确认后登记同一授权，不重复期限或额度；保留本机素材与项目，正式包双电脑验收与生产操作尚未授权。 |
```

<a id="t1080-retained-row-f6abe467486ee90c"></a>

### 本轮保留的 T-1072 完整原行

```text
| T-1072 | 修复全局Git钩子误用失效Lefthook路径 | ✅ 待办 | — | — | [SPEC](docs/features/t1072-global-git-hook.md) | 用户2026-10-08授权修复；先备份当前全局钩子并核对归属，按真实仓库配置运行项目钩子，保留检查失败语义；验证CreatorOS真实提交及隔离配置仓库成功/失败，不改客户端、不push、不发布。 |
```

<a id="t1080-retained-row-d6ce9166621c4243"></a>

### 本轮保留的 T-1066 完整原行

```text
| T-1066 | 落实本地客户端优先出包并移除人为构建超时 | ⏸️ 待办 | PASS[REV:0d40d8466937] | — | [SPEC](docs/features/t1066-local-package-build-only.md) | 用户2026-10-06明确Windows和Mac均优先生成安装包；精确移植本地打包8路径，独立执行额外质量验证，保留真实编译、资源、凭证和路径校验；不push、不发布、不改变T-1062粗剪与原18验收。 |
```

<a id="t1080-retained-row-6b5c0536610c48a8"></a>

### 本轮保留的 T-1023-agent-recovery 完整原行

```text
| T-1023-agent-recovery | 根治 AI 助手自动恢复无限卡死并证明后台进展 | ✅ | — | PASS:87c802e61bbe | [SPEC](docs/features/t1023-agent-recovery-liveness.md) | 区分已持久化任务续跑与提交前网络失败；恢复必须有进展证据，持续无进展自动收口为可继续操作的状态，禁止永久转圈。 本地main原任务T-1023的来源别名，原事件/验收证据不改写。 |
```

<a id="t1080-retained-row-00c1555a12c0e894"></a>

### 本轮保留的 T-1017 完整原行

```text
| T-1017 | 简化内容雷达：按账号定位一键生成可编辑改写稿 | 🔨 待办 | PASS[REV:d2fb4541c82d] | 待验 | [SPEC](docs/features/t1017-content-radar-rewrite-first.md) | 把“基于对标文案与当前定位快速改写”作为主结果；拆解、策略和选题卡字段改为可选补充，不得阻断首稿；[自动化实测](docs/verification/t1017-rewrite-first.md)，真实桌面/供应商待验。 |
```

<a id="t1080-retained-row-37095e929dd176d6"></a>

### 本轮保留的 T-1065 完整原行

```text
| T-1065 | 全盘审计系统所有超时限制与固定30秒上限 | ✅ 待办 | — | — | [范围](docs/features/t1065-timeout-audit.md) | 用户2026-10-06要求覆盖全部系统逻辑；只读盘点生产代码、桌面层、模型/浏览器/IPC及构建脚本，统计真实超时策略与30秒上限，不混入延时、轮询或测试，不修改真实任务和安装版。 |
```

<a id="t1080-retained-row-6ad5b71dceb239e1"></a>

### 本轮保留的 T-954 完整原行

```text
| T-954 | 接入抖音流量来源并以专家方法改进编导交互【用户要求小改动】 | 🔨 待办 | — | — | [SPEC](docs/features/t954-director-content-loop.md) | 已落实来源方法、稿面诊断和独立流量队列；1005 条隔离恢复与真实页面 smoke 通过。真实模型效果对照、保留样本迁移和安装版验收待完成；明细失败不阻断基础采集。 |
```

<a id="t1080-retained-row-67204c9b2c9efc87"></a>

### 本轮保留的 T-1026 完整原行

```text
| T-1026 | 补齐新增 Agent 功能的公开 CLI 并逐项验收安装版 | 🔨 | — | — | [SPEC](docs/features/t1026-agent-cli-acceptance.md) | 用户要求所有新增功能通过 CLI 实测；核对计划、工具、文件、命令、浏览器、Skill、产物、恢复与旧功能；修复已实测的取消/跳过步骤被误报完成，再安装版复验。 |
```

<a id="t1080-retained-row-eee9f25319e1abe5"></a>

### 本轮保留的 T-1022-agent-recovery 完整原行

```text
| T-1022-agent-recovery | 禁止模型超时或不完整输出阻断生成，统一由 Agent loop 恢复 | ✅ | — | PASS:06eb90bb86b5 | [SPEC](docs/features/t1022-nonblocking-agent-recovery.md) | 覆盖内容雷达与 AI 助手；仅无可用模型时引导配置，其他可恢复失败沿原任务自动续跑、修复或降级。 本地main原任务T-1022的来源别名，原事件/验收证据不改写。 |
```

<a id="t1080-retained-row-fbe6a3f4e58bcafa"></a>

### 本轮保留的 T-1025 完整原行

```text
| T-1025 | 重新核验 constitution 变更后的历史评审与前端验收回执 | 📋 | — | — | [SPEC](docs/features/t1025-receipt-drift-revalidation.md) | reconcile 已确认运行门全部通过，但 T-703/T-691/T-656/T-645/T-635 的旧评审回执和 T-1022 前端验收回执已因当前真相变化失效；按现状重新评审，禁止补拍历史 PASS。 |
```

<a id="t1080-retained-row-3eba29be37ce0174"></a>

### 本轮保留的 T-1023 完整原行

```text
| T-1023 | 修正既有任务绑定glob导致的progress生成阻断 | 📋 待办 | — | — | [证据](docs/features/t1022-account-group-workspace/VERIFICATION.md) | T-1022注册时progress generate被既有T-1003的非terminal wildcard write_set拒绝；核对安全范围并按真实文件或terminal目录规则校准，不扩大写集，不丢其他任务和lease。 |
```

<a id="t1080-retained-row-25094b544f740169"></a>

### 本轮保留的 T-1067 完整原行

```text
| T-1067 | 落实本地客户端优先出包并移除人为构建超时 | ✅ 待办 | PASS[REV:ebe1b789bc56] | — | [SPEC](docs/features/t1067-local-package-build-only.md) | 用户已授权双端优先出包；并行会话T-1066同号后本地8路径补充单独使用本编号，原本地评审/事件保留；T-1062原18和候选提交后顺序实施，不push、不发布。 |
```

<a id="t1080-retained-row-9b2048cb81450808"></a>

### 本轮保留的 T-934 完整原行

```text
| T-934 | 统一 CLI 与页面的持久聊天工具入口【T-933 真机验收发现】 | 🔨 待办 | — | — | [实现与验收](docs/verification/t934-cli-chat-unification.md) | CLI 仍走通用回复任务，实际没有搜索和正文回执；复用页面持久聊天装配与 Pi 工具循环，保留归属、幂等和历史，真实搜集复验后方可验收。 |
```

<a id="t1080-retained-row-d8c8c522ea52c213"></a>

### 本轮保留的 T-957 完整原行

```text
| T-957 | 排查 AI 失败、全场景验收并优化 Agent 提示词【用户截图】 | 🔨 待办 | — | — | [SPEC](docs/features/t957-ai-real-acceptance.md) | d18b44d2第五包已安装；双账号同站点等待48.5秒后均读全，隔离/数据保留通过；模型计算、数量稳定性和内部参数表达仍待整改，不标完成。 |
```

<a id="t1080-retained-row-e6765fb61ec296f6"></a>

### 本轮保留的 T-1020 完整原行

```text
| T-1020 | 统一可视化推荐、作品承接与科学运营观测 | 📋 待办 | 待审 | 待验 | [SPEC](docs/features/creator-operations/README.md) | 用户2026-10-02补充；依赖T-1019验收，复用采集/analytics/review及独立本地投影后台，不复制UI/调度；逐平台区分发布/草稿，null与未关联保真。 |
```

<a id="t1080-retained-row-e3d09dce7e422bbe"></a>

### 本轮保留的 T-933 完整原行

```text
| T-933 | 安装并验收本轮Agent Runtime桌面版【用户要求自行检查】 | 🔨 待办 | — | — | [T-932交付](docs/verification/t932-runtime-alignment.md) | 核对已安装候选与签名、启动及实际页面/Skill/聊天链路；通过公开CLI操作，未获本次启动授权前不绕过访问；保留真实验收结果。 |
```

<a id="t1080-retained-row-20ca3c0dceb6f8f4"></a>

### 本轮保留的 T-917 完整原行

```text
| T-917 | 记录 T-915 媒体测试事故并防止测试再次访问真实媒体根【用户接受数据清理，解除恢复前置】 | 📋 待办 | — | — | [事故记录](docs/research/evidence/t915/2026-09-06-media-test-incident.md) | 用户明确要求继续重构，数据恢复不再作为 T-915 阻塞；数据未恢复的事实保留；[原说明](BACKLOG-details.md#t-917-triage-description)。 |
```

<a id="t1080-retained-row-6da40b9d211687ae"></a>

### 本轮保留的 T-943 完整原行

```text
| T-943 | 拉取并跑通 JY_IPAgent，调研数字人 API 与 CreatorOS 接入【用户指定仓库】 | ⏸️ 待办 | — | — | [SPEC](docs/features/t943-jy-ipagent-research.md) | 独立部署参考项目，确认数字人实际供应商与本地模型依赖；优先 API 路径，以真实启动和生成证据区分已验证与待凭据。 |
```

<a id="t1080-retained-row-b9b5a6896b2aaf0b"></a>

### 本轮保留的 T-998 完整原行

```text
| T-998 | 收敛业务代码硬编码模型名 | 📋 待办 | — | — | [T-914 审计](docs/research/2026-09-04-architecture-agent-audit.md) | 区分 provider 适配器(合理)与业务逻辑硬编码(抽配置)；cover-runner、channel-model-config、prompt 模板里散落的模型名收敛为可配。 |
```

<a id="t1080-retained-row-e93a45cb55075893"></a>

### 本轮保留的 T-915 完整原行

```text
| T-915 | 根治 AI 卡慢、失败不重试与搜索/浏览器缺少自主循环，收敛架构与执行能力【T-914 审查承接·用户 2026-09-04】 | 🔨 待办 | PASS[REV:692283b8bace] | — | [SPEC](docs/superpowers/specs/2026-09-04-agent-runtime-refactor.md) | 保留原执行/恢复改造任务；剩余登录资源迁移、备用模型和运行验收，详见 [历史说明](BACKLOG-details.md#t-915-triage-history)。 |
```

<a id="t1080-retained-row-5172365e85a2cee2"></a>

### 本轮保留的 T-986 完整原行

```text
| T-986 | 修复新绑定账号默认采集任务系统标记透传 | 📋 待办 | — | — | [SPEC](docs/features/t986-bind-collection-flag.md) | 只读审查发现绑定装配丢失 systemManaged，可能导致流量和内容任务待重启才补齐；本轮不扩大改动，待隔离复现与修复。 |
```

<a id="t1080-retained-row-9f66fc6ba1d2a7e1"></a>

### 本轮保留的 T-979 完整原行

```text
| T-979 | 自动化页面慢轮询与切换对象回写防护 | ⬜ 待办 | — | — | [SPEC](docs/features/t979-automation-polling.md) | T-978 排查发现运行历史、步骤和列表轮询未限制在途请求；补慢网与切换对象回归，修复请求堆积及旧响应覆盖风险。 |
```

<a id="t1080-retained-row-6f28905ece9e4a7b"></a>

### 本轮保留的 T-993 完整原行

```text
| T-993 | 同步 main 分支到最新(落后 origin/main 573 提交) | 📋 待办 | — | — | — | 本地 main=f330473f 落后 origin/main(77eabca3)573 提交；核清原因后同步，保留 codex/t793-local-package 进行中未提交改动。 |
```

<a id="t1080-retained-row-d62221da75f2c693"></a>

### 本轮保留的 T-1071-scheduler 完整原行

```text
| T-1071-scheduler | 修复后台调度重叠并补停止清理与心跳在途防护 | ✅ 待办 | — | — | [同轮修复SPEC](docs/features/t1073-resource-memory-fixes.md) | T-1073已审范围的实现归属；统一在父任务核验8处资源生命周期及兼容性，原T-1071-resource-audit缺陷证据保留。 |
```

<a id="t1080-retained-row-2052423e231a8ccf"></a>

### 本轮保留的 T-1071-polling 完整原行

```text
| T-1071-polling | 修复稿面慢读取叠加、雷达空闲扫描与历史卡终态观察 | ✅ 待办 | — | — | [同轮修复SPEC](docs/features/t1073-resource-memory-fixes.md) | T-1073已审范围的实现归属；统一在父任务核验8处资源生命周期及兼容性，原T-1071-resource-audit缺陷证据保留。 |
```

<a id="t1080-retained-row-9ee728d6794951d7"></a>

### 本轮保留的 T-1071-cache 完整原行

```text
| T-1071-cache | 为完成聊天会话和预览元数据增加安全淘汰 | ✅ 待办 | — | — | [同轮修复SPEC](docs/features/t1073-resource-memory-fixes.md) | T-1073已审范围的实现归属；统一在父任务核验8处资源生命周期及兼容性，原T-1071-resource-audit缺陷证据保留。 |
```

<a id="t1080-retained-row-3e6fddab175311d1"></a>

### 本轮保留的 T-1071-worker-memory 完整原行

```text
| T-1071-worker-memory | 收敛宿主IPC历史回执与音频字节保留 | ✅ 待办 | — | — | [同轮修复SPEC](docs/features/t1073-resource-memory-fixes.md) | T-1073已审范围的实现归属；统一在父任务核验8处资源生命周期及兼容性，原T-1071-resource-audit缺陷证据保留。 |
```

<a id="t1080-retained-row-b61a9e0e1e4b28e3"></a>

### 本轮保留的 T-1071-stream 完整原行

```text
| T-1071-stream | 补齐聊天响应背压与缓冲容量策略 | ✅ 待办 | — | — | [同轮修复SPEC](docs/features/t1073-resource-memory-fixes.md) | T-1073已审范围的实现归属；统一在父任务核验8处资源生命周期及兼容性，原T-1071-resource-audit缺陷证据保留。 |
```

<a id="t1080-retained-row-a99ff608d0b49e76"></a>

### 本轮保留的 T-1071-whisper 完整原行

```text
| T-1071-whisper | 修复本地转录成功后遗留Whisper线程 | ✅ 待办 | — | — | [同轮修复SPEC](docs/features/t1073-resource-memory-fixes.md) | T-1073已审范围的实现归属；统一在父任务核验8处资源生命周期及兼容性，原T-1071-resource-audit缺陷证据保留。 |
```

<a id="t1080-retained-row-0e3dd393b702a707"></a>

### 本轮保留的 T-940 完整原行

```text
| T-940 | 补齐应用内签名远程更新闭环【糯米饭对标待落地】 | 📋 待办 | — | — | [缺口与范围](docs/features/t939-positioning-release.md) | 接通包级签名制品托管、下载验签、安装重启与双端升级验收；不把全量更新称为差分，不擅自公开发布。 |
```

<a id="t1080-retained-row-79f5cc742488451b"></a>

### 本轮保留的 T-1066-tooling 完整原行

```text
| T-1066-tooling | 构建CI及运维工具超时修复 | ✅ 待办 | — | — | [已评审父SPEC](docs/features/t1066-timeout-policy.md) | T-1066-timeout-policy同一确认范围的并行实现分区，不形成分期验收；独立工作树、互斥写集，由主会话集成。 |
```

<a id="t1080-retained-row-00e46835d1567ae8"></a>

### 本轮保留的 T-1066-frontend 完整原行

```text
| T-1066-frontend | 前端与桌面原生层超时修复 | ✅ 待办 | — | — | [已评审父SPEC](docs/features/t1066-timeout-policy.md) | T-1066-timeout-policy同一确认范围的并行实现分区，不形成分期验收；独立工作树、互斥写集，由主会话集成。 |
```

<a id="t1080-retained-row-7ac9ae31a324c3ee"></a>

### 本轮保留的 T-1066-worker 完整原行

```text
| T-1066-worker | 执行Worker及后端超时修复 | ✅ 待办 | — | — | [已评审父SPEC](docs/features/t1066-timeout-policy.md) | T-1066-timeout-policy同一确认范围的并行实现分区，不形成分期验收；独立工作树、互斥写集，由主会话集成。 |
```

<a id="t1080-retained-row-f9f6ea5f8246191a"></a>

### 本轮保留的 T-633 完整原行

```text
| T-633 | 恢复创作者中心自动扫码登录【线上阻断·用户 2026-07-30】 | 🔨 待办 | — | 待验 | [详情](BACKLOG-details.md#t-633) | 内容雷达改写可用性由 T-1017 收口；本任务仅保留首次扫码直达创作者中心二维码页及账号登录态复用。 |
```

## T1062 本地main安装验收续跑（2026-10-08）

用户本轮继续此前全功能验收；沿当前用户/已安装App及本地main新包验收授权，实际包源0480、收尾main0bc810。已完成本地构建和镜像/深签名/内层运行时校验，当前准备使用现有安装函数安装并启动，继续公开CLI和实际页面链路；不重建，不创建构建App/数据备份，不推送或发布。主SPEC原历史备份记录保留，新包本轮行为单独记实证，不冒称原备份/全部Gate通过；用户资料/激活不清理，当前工作区选择保留。仅在原中性验收组/原项目/原任务执行授权验收，不修改真实账号作品，不重新生成原未知图。全局T1081/T1082/T1083失败不影响既有合法安装和验证。

<a id="t-1108"></a>
### T-1108 · 核对画布连线引用保存回读及浏览器短观察窗口

- 原文档：[实际缺陷](docs/features/t1108-canvas-public-observation.md)
- 任务详情：main188c当前Chrome实际1PASS/1FAIL，连线referenceFileId回读undefined且默认poll5秒超时；此前main同产品旅程2PASS保留。先核trace/save/API及LED053真实消费者，规范观察至少120秒后仍失败则修产品；不删保存断言或伪造已有引用。

<a id="t-1103"></a>
### T-1103 · 排查Pi联合提案反复遗漏完整图文参数

- 原文档：[实际缺陷](docs/features/t1103-pi-joint-argument-diagnosis.md)
- 任务详情：T1099安装源码070287真实Pi task272只读成功，3次提案仅digest/文章，图文始终缺失，收到具体错误却重复同参；真实partial、零候选、原稿不变。保原ID/调用/期限；两实验已用尽：完整分片3PASS，截断3PASS/2FAIL；宽容解析保真缺口已复现，task272原wire未知，先兼容设计独评，不放宽schema或新键重发。T1099/T1095仍待实际候选。

<a id="t-1102"></a>
### T-1102 · 排查并恢复本地安装首次运行时展开失败

- 原文档：[诊断与边界](docs/features/t1102-installed-runtime-extraction.md)
- 任务详情：T1099源码070287新DMG校验/签名/安装成功，但首次展开Chrome框架条目失败，落tauri错误页且CLI无连接。原日志已保存，根因未确认；同包一次温和重启已恢复HTTP61596/CLI，首次根因仍UNKNOWN；另立T1104修确定的错误链/清理诊断缺口，不删原runtime/数据、不重发AI。

<a id="t-1094"></a>
### T-1094 · 修复部分完成AI任务公开查询状态合同缺口

- 原文档：[SPEC](docs/features/t1094-public-partial-task-status.md) · [当场诊断](docs/verification/t1093/FOLLOWUP_DIAGNOSIS.md)
- 任务详情：源码e71022ff新包装入当前App，原task200get/list真实partial，正常重启后10原任务/原键/稿件一致。新增公共链/消费者与安装恢复通过；正式相关9+6旧失败登记T1096、全局原42仍保留，不complete，不重发或采纳。

<a id="t-1099"></a>
### T-1099 · 修复工具明确业务拒绝回执缺失与末次失败被算成功

- 原文档：[SPEC](docs/features/t1099-tool-domain-recovery.md) · [实际缺陷](docs/features/t1099-tool-domain-recovery-diagnosis.md)
- 任务详情：070287新包已无备份安装，同包一次恢复首页/CLI、11任务/4DTO/22读取对照通过；真实Pi272 read成功但3次缺图文，partial零候选，原稿不变，taskctl因T1103阻断。源码正式291PASS/原42逐字保留；不完成或盲重发。

<a id="t-1095"></a>
### T-1095 · 验证Pi联合创作必填nullable字段遵循与原任务恢复方法

- 原文档：[SPEC](docs/features/t1095-tool-parameter-recovery.md) · [当场诊断](docs/verification/t1093/FOLLOWUP_DIAGNOSIS.md)
- 任务详情：用户要求问题及时建task修复；原task200三次nullable填参失败。独评后冻结新任务纠错格式，旧回执不变；正式121PASS/类型/架构门通过，完整原42逐字一致及timeout原27保留。68dff新包已安装、首页/10原任务/4对象对照通过；真实Pi task222静态结构纠正后领域来源拒绝且错误被吞/结束假成功，登记T1099。无候选或采纳，不complete。

<a id="t-1091"></a>
### T-1091 · 补齐公开编导消息的Codex选择与文章图文视频目标定位并安装验收

- 原文档：[SPEC](docs/features/t1091-public-director-context.md)
- 任务详情：用户继续全面验证；安装公开消息仅content/attachments，实际owner固定Pi，无法从正式CLI验收已实现的编辑/联合创作。仅加可选引擎及严格已保存目标，保默认Pi和原任务/owner/候选采纳；先独评和真实RED/GREEN，再main无备份出包/公开Codex实测，不绕过本地来源保护。

<a id="t1173-t1018-global-debt-history"></a>

### T1173保留：T-1018全局类型与边界欠债重复行及八列原文

此节仅保留原完整行/各列/SHA及不同时间状态；不迁移审核/完成事件，不签当前业务。

原路径/行：BACKLOG.md:56；原行SHA256 `26444114bde94a4a34082fbce254e3679562cb54f6e2b6241e0162567c5c88af`。

```text
|T-1018|清理本轮测试暴露的全局类型与边界欠债|📋 待办|—|待验|[实测证据](docs/verification/t1017-rewrite-first.md) [详情](BACKLOG-details.md#t-1018)|见详情。|
```

原路径/行：BACKLOG.md:80；原行SHA256 `510ffe14554f53332b4538c241dc9e3af21409845b2009f7c9d3596b032120ad`。

```text
|T-1018|清理本轮测试暴露的全局类型与边界欠债|📋 待办|—|待验|[实测证据](docs/verification/t1017-rewrite-first.md)|后端旧测试 API/类型漂移、contract旧快照/资产/cover断言、live-chat-session SDK 边界与 video-decisions-runner 语义门仍失败；与 T-1015 历史教训对账联动，不混入 T-1017。 本轮T-1022再次实测原12项后端类型、3项契约及边界/语义旧失败，见docs/features/t1022-account-group-workspace/VERIFICATION.md。 2026-10-06 T1068收尾全局37错误/1告警，原36保留，另LED-027稿件并发检查此次失败；相关产品/测试未变，根因待查，原始与比较记录见本地验收根t1068-post-startup-reconcile，T1068启动独立验收不代签此项。|2026-10-07 T1070实测保留原boundary7（含未改live-chat-session旧2）、semantic缺material.match及MAIN缺tools/timeout-policy/verify.mjs；规定命令MODULE_NOT_FOUND，详情docs/verification/t1070/CURRENT_VALIDATION.md，不以其他checkout代签。 2026-10-07 T1070收尾完整对账37错误/1告警，当前原始日志docs/verification/t1070/root-prefreeze-reconcile.log；其它历史receipt与boundary/语义/LED仍失败，未逐项核因，不签全仓通过。|
```

原路径/行：N/t1171-before/BACKLOG.md:121；原行SHA256 `da1a9f8f8aae7354101d0e4a7e7fc2012348129d36e2f06eaa29be27e4def44b`。

```text
| T-1018 | 清理本轮测试暴露的全局类型与边界欠债 | 📋 待办 | — | 待验 | [实测证据](docs/verification/t1017-rewrite-first.md) [详情](BACKLOG-details.md#t-1018) | 见详情。 |
```

原路径/行：N/t1171-before/BACKLOG.md:152；原行SHA256 `16b56fcbae9432475cf43810c9b56e2f97206851d4a481a8b51cb0f69e6065e4`。

```text
| T-1018 | 清理本轮测试暴露的全局类型与边界欠债 | 📋 待办 | — | 待验 | [实测证据](docs/verification/t1017-rewrite-first.md) | 后端旧测试 API/类型漂移、contract旧快照/资产/cover断言、live-chat-session SDK 边界与 video-decisions-runner 语义门仍失败；与 T-1015 历史教训对账联动，不混入 T-1017。 本轮T-1022再次实测原12项后端类型、3项契约及边界/语义旧失败，见docs/features/t1022-account-group-workspace/VERIFICATION.md。 2026-10-06 T1068收尾全局37错误/1告警，原36保留，另LED-027稿件并发检查此次失败；相关产品/测试未变，根因待查，原始与比较记录见本地验收根t1068-post-startup-reconcile，T1068启动独立验收不代签此项。 | 2026-10-07 T1070实测保留原boundary7（含未改live-chat-session旧2）、semantic缺material.match及MAIN缺tools/timeout-policy/verify.mjs；规定命令MODULE_NOT_FOUND，详情docs/verification/t1070/CURRENT_VALIDATION.md，不以其他checkout代签。 2026-10-07 T1070收尾完整对账37错误/1告警，当前原始日志docs/verification/t1070/root-prefreeze-reconcile.log；其它历史receipt与boundary/语义/LED仍失败，未逐项核因，不签全仓通过。 |
```

原行各出现位置（同SHA副本也保留计数，不另判业务状态）：
- `/Users/zyongzhu/.codex/worktrees/t1062-client-integration/Thirdspace-creator/BACKLOG.md:56`；原文件SHA `bf8c9fbd338e2c0d4b019db497a77c234eeaa2ff7bb61e46687030989b742e13`；原行SHA `26444114bde94a4a34082fbce254e3679562cb54f6e2b6241e0162567c5c88af`。
- `/Users/zyongzhu/.codex/worktrees/t1062-client-integration/Thirdspace-creator/BACKLOG.md:80`；原文件SHA `bf8c9fbd338e2c0d4b019db497a77c234eeaa2ff7bb61e46687030989b742e13`；原行SHA `510ffe14554f53332b4538c241dc9e3af21409845b2009f7c9d3596b032120ad`。
- `/Users/zyongzhu/.codex/creatoros-verification/t1117-20261009/t1171-before/BACKLOG.md:121`；原文件SHA `00183b6a057a6e52c7503d61dbeafd0c388d99bc965640a1fa33cb329be76939`；原行SHA `da1a9f8f8aae7354101d0e4a7e7fc2012348129d36e2f06eaa29be27e4def44b`。
- `/Users/zyongzhu/.codex/creatoros-verification/t1117-20261009/t1171-before/BACKLOG.md:152`；原文件SHA `00183b6a057a6e52c7503d61dbeafd0c388d99bc965640a1fa33cb329be76939`；原行SHA `16b56fcbae9432475cf43810c9b56e2f97206851d4a481a8b51cb0f69e6065e4`。

<a id="t1173-t-1017-source-31eb30d3-durable-chat-original"></a>

### T1173保留：T-1017-source-31eb30d3-durable-chat 原ID身份来源

此节仅保留原完整行/各列/SHA及不同时间状态；不迁移审核/完成事件，不签当前业务。

原路径/行：BACKLOG-archive.md:1014；原行SHA256 `43c9b50296ab221a823170b87e2d983a0e203c298556306db25c74df64f3346d`。

```text
| T-1017 | 按持久执行链重建聊天路由回归 | ✅ 待办 | — | — | [核实记录](docs/verification/t1015-lesson-verification.md) | LED-014/017/020 共用旧同步 runChatStream 测试 29/50 失败；按 durable.submit、消息快照、事件订阅和完成事务重建局部改稿、逐字保真及工具门回归，不机械改预期。 |
```

原行各出现位置（同SHA副本也保留计数，不另判业务状态）：
- `/Users/zyongzhu/.codex/worktrees/t1062-client-integration/Thirdspace-creator/BACKLOG-archive.md:1014`；原文件SHA `d7617bd903e42bce0b3104778f7edd91a96bfe103d6759eb4fc894fbe2f853f8`；原行SHA `43c9b50296ab221a823170b87e2d983a0e203c298556306db25c74df64f3346d`。
- `/Users/zyongzhu/.codex/creatoros-verification/t1117-20261009/t1171-before/BACKLOG-archive.md:1014`；原文件SHA `e674a00f1b5622478b4baeed165ffbb81634fdca2080c7dc19ef79b861aa6c40`；原行SHA `43c9b50296ab221a823170b87e2d983a0e203c298556306db25c74df64f3346d`。

<a id="t1173-t-1018-source-31eb30d3-portrait-timeline-original"></a>

### T1173保留：T-1018-source-31eb30d3-portrait-timeline 原ID身份来源

此节仅保留原完整行/各列/SHA及不同时间状态；不迁移审核/完成事件，不签当前业务。

原路径/行：BACKLOG-archive.md:1015；原行SHA256 `e285dd716892d838a1c40697d289d3a870377f0206962fc1db205faff3cecdaa`。

```text
| T-1018 | 核实并修正竖屏动效时间线超出约束 | ✅ 待办 | — | — | [核实记录](docs/verification/t1015-lesson-verification.md) | LED-024 portrait 实际为 15.34 秒而验收约束为 15 秒；查明多出 0.34 秒的来源，按真实契约修正并复测成片，不放宽断言掩盖偏差。 |
```

原行各出现位置（同SHA副本也保留计数，不另判业务状态）：
- `/Users/zyongzhu/.codex/worktrees/t1062-client-integration/Thirdspace-creator/BACKLOG-archive.md:1015`；原文件SHA `d7617bd903e42bce0b3104778f7edd91a96bfe103d6759eb4fc894fbe2f853f8`；原行SHA `e285dd716892d838a1c40697d289d3a870377f0206962fc1db205faff3cecdaa`。
- `/Users/zyongzhu/.codex/creatoros-verification/t1117-20261009/t1171-before/BACKLOG-archive.md:1015`；原文件SHA `e674a00f1b5622478b4baeed165ffbb81634fdca2080c7dc19ef79b861aa6c40`；原行SHA `e285dd716892d838a1c40697d289d3a870377f0206962fc1db205faff3cecdaa`。

<a id="t1173-t-1019-source-31eb30d3-confirm-candidate-original"></a>

### T1173保留：T-1019-source-31eb30d3-confirm-candidate 原ID身份来源

此节仅保留原完整行/各列/SHA及不同时间状态；不迁移审核/完成事件，不签当前业务。

原路径/行：BACKLOG-archive.md:1016；原行SHA256 `a7748448e122ef3d29dea3f80d3f8403e55b8f4763c94767bb6a13547faa5b52`。

```text
| T-1019 | 恢复成功候选确认写入选题池入口 | ✅ 待办 | — | — | [核实记录](docs/verification/t1015-lesson-verification.md) | LED-042 重现 T-900 成功且已有改写初稿时缺“确认写入选题池”按钮；修复状态门并保留归属、来源及幂等校验。 |
```

原行各出现位置（同SHA副本也保留计数，不另判业务状态）：
- `/Users/zyongzhu/.codex/worktrees/t1062-client-integration/Thirdspace-creator/BACKLOG-archive.md:1016`；原文件SHA `d7617bd903e42bce0b3104778f7edd91a96bfe103d6759eb4fc894fbe2f853f8`；原行SHA `a7748448e122ef3d29dea3f80d3f8403e55b8f4763c94767bb6a13547faa5b52`。
- `/Users/zyongzhu/.codex/creatoros-verification/t1117-20261009/t1171-before/BACKLOG-archive.md:1016`；原文件SHA `e674a00f1b5622478b4baeed165ffbb81634fdca2080c7dc19ef79b861aa6c40`；原行SHA `a7748448e122ef3d29dea3f80d3f8403e55b8f4763c94767bb6a13547faa5b52`。

<a id="t1173-t-1020-source-da970ced-guide-fixture-original"></a>

### T1173保留：T-1020-source-da970ced-guide-fixture 原ID身份来源

此节仅保留原完整行/各列/SHA及不同时间状态；不迁移审核/完成事件，不签当前业务。

原路径/行：BACKLOG-archive.md:1017；原行SHA256 `d6d415bc1be07cb03a022ff9cf1d46f2902a1c649ce2317affb3caddac985fa5`。

```text
| T-1020 | 校准租约恢复测试的官方产品说明快照 | ✅ 待办 | — | — | [核实记录](docs/verification/t1020-guide-snapshot-fixture.md) | 扩大后端回归 349/350 中旧 creatoros.guide 夹具硬填 v1 与任意正文，和现行官方版本/正文校验冲突；核实真值后修正夹具，不放宽运行时校验。 |
```

原行各出现位置（同SHA副本也保留计数，不另判业务状态）：
- `/Users/zyongzhu/.codex/worktrees/t1062-client-integration/Thirdspace-creator/BACKLOG-archive.md:1017`；原文件SHA `d7617bd903e42bce0b3104778f7edd91a96bfe103d6759eb4fc894fbe2f853f8`；原行SHA `d6d415bc1be07cb03a022ff9cf1d46f2902a1c649ce2317affb3caddac985fa5`。
- `/Users/zyongzhu/.codex/creatoros-verification/t1117-20261009/t1171-before/BACKLOG-archive.md:1017`；原文件SHA `e674a00f1b5622478b4baeed165ffbb81634fdca2080c7dc19ef79b861aa6c40`；原行SHA `d6d415bc1be07cb03a022ff9cf1d46f2902a1c649ce2317affb3caddac985fa5`。

<a id="t1173-t-1021-source-526070b3-mac-artifact-original"></a>

### T1173保留：T-1021-source-526070b3-mac-artifact 原ID身份来源

此节仅保留原完整行/各列/SHA及不同时间状态；不迁移审核/完成事件，不签当前业务。

原路径/行：BACKLOG-archive.md:1018；原行SHA256 `36fb5325a342276767bcae629b94304cb3392b8e0431cf336737be955426725b`。

```text
| T-1021 | 补齐 T-1009 真实 Mac 产物原子结算验收 | ✅ 待办 | — | — | [SPEC](docs/features/t1003-agent-workbench.md) [跨回合规格](docs/features/t1009-artifact-lineage-proposal.md) | 全量自测发现真实 Mac 组合宿主漏传产物原子端口，且已确认提交会被后置工具卡投影故障反杀；补齐装配、保护已确认回执，并重跑产物版本、预览、导出、恢复与安装包验收。 |
```

原行各出现位置（同SHA副本也保留计数，不另判业务状态）：
- `/Users/zyongzhu/.codex/worktrees/t1062-client-integration/Thirdspace-creator/BACKLOG-archive.md:1018`；原文件SHA `d7617bd903e42bce0b3104778f7edd91a96bfe103d6759eb4fc894fbe2f853f8`；原行SHA `36fb5325a342276767bcae629b94304cb3392b8e0431cf336737be955426725b`。
- `/Users/zyongzhu/.codex/creatoros-verification/t1117-20261009/t1171-before/BACKLOG-archive.md:1018`；原文件SHA `e674a00f1b5622478b4baeed165ffbb81634fdca2080c7dc19ef79b861aa6c40`；原行SHA `36fb5325a342276767bcae629b94304cb3392b8e0431cf336737be955426725b`。

<a id="t1173-t-1016-source-3d5dc732-sdk-boundary-original"></a>

### T1173保留：T-1016-source-3d5dc732-sdk-boundary 原ID身份来源

此节仅保留原完整行/各列/SHA及不同时间状态；不迁移审核/完成事件，不签当前业务。

原路径/行：BACKLOG-archive.md:1013；原行SHA256 `7f0a44f482f7676441c5d2b617f1a1e3359ea112a22d8813d9d7cf487ed6f860`。

```text
| T-1016 | 核对前端聊天会话 SDK 物理边界 | ✅ 待办 | — | — | [根因清单](docs/verification/t1014-reconcile-triage.md) | 核实 live-chat-session.ts 的两个 AI SDK 导入与 R2 架构规则；按真实依赖消除违规，若确需改变边界先补 SPEC 和评审，不直接放宽基线。 |
```

原行各出现位置（同SHA副本也保留计数，不另判业务状态）：
- `/Users/zyongzhu/.codex/worktrees/t1062-client-integration/Thirdspace-creator/BACKLOG-archive.md:1013`；原文件SHA `d7617bd903e42bce0b3104778f7edd91a96bfe103d6759eb4fc894fbe2f853f8`；原行SHA `7f0a44f482f7676441c5d2b617f1a1e3359ea112a22d8813d9d7cf487ed6f860`。
- `/Users/zyongzhu/.codex/creatoros-verification/t1117-20261009/t1171-before/BACKLOG-archive.md:1013`；原文件SHA `e674a00f1b5622478b4baeed165ffbb81634fdca2080c7dc19ef79b861aa6c40`；原行SHA `7f0a44f482f7676441c5d2b617f1a1e3359ea112a22d8813d9d7cf487ed6f860`。

<a id="t1173-t-1004-same-identity-history"></a>

### T1173保留：T-1004 同任务执行与旧完成表示

此节仅保留原完整行/各列/SHA及不同时间状态；不迁移审核/完成事件，不签当前业务。

原路径/行：BACKLOG.md:82；原行SHA256 `261d987b2cb3c5b639756d1ed2ebd38ae7025576d7d974cebaacaa7039a96f09`。

```text
|T-1004|冻结共享能力协议与 NomiFun 迁移依赖|📋 待办|—|—|[SPEC](docs/features/t1003-agent-workbench.md)|T-1003 评审；固定依赖闭包、宿主端口、协议与架构门卫。|
```

原路径/行：BACKLOG-archive.md:1019；原行SHA256 `bb50192e3e4fbc1a60ac226e8ae08ee22a45ef4ae62d53e18022f6cc033df618`。

```text
| T-1004 | 冻结共享能力协议与 NomiFun 迁移依赖 | ✅ 待办 | — | — | [SPEC](docs/features/t1003-agent-workbench.md) | T-1003 评审；固定依赖闭包、宿主端口、协议与架构门卫。 |
```

原路径/行：N/t1171-before/BACKLOG.md:156；原行SHA256 `4a387fe43b832e71766e1383bc3269d3b18753e86b0ff5585c5caf97282f3875`。

```text
| T-1004 | 冻结共享能力协议与 NomiFun 迁移依赖 | 📋 待办 | — | — | [SPEC](docs/features/t1003-agent-workbench.md) | T-1003 评审；固定依赖闭包、宿主端口、协议与架构门卫。 |
```

原行各出现位置（同SHA副本也保留计数，不另判业务状态）：
- `/Users/zyongzhu/.codex/worktrees/t1062-client-integration/Thirdspace-creator/BACKLOG.md:82`；原文件SHA `bf8c9fbd338e2c0d4b019db497a77c234eeaa2ff7bb61e46687030989b742e13`；原行SHA `261d987b2cb3c5b639756d1ed2ebd38ae7025576d7d974cebaacaa7039a96f09`。
- `/Users/zyongzhu/.codex/worktrees/t1062-client-integration/Thirdspace-creator/BACKLOG-archive.md:1019`；原文件SHA `d7617bd903e42bce0b3104778f7edd91a96bfe103d6759eb4fc894fbe2f853f8`；原行SHA `bb50192e3e4fbc1a60ac226e8ae08ee22a45ef4ae62d53e18022f6cc033df618`。
- `/Users/zyongzhu/.codex/creatoros-verification/t1117-20261009/t1171-before/BACKLOG.md:156`；原文件SHA `00183b6a057a6e52c7503d61dbeafd0c388d99bc965640a1fa33cb329be76939`；原行SHA `4a387fe43b832e71766e1383bc3269d3b18753e86b0ff5585c5caf97282f3875`。
- `/Users/zyongzhu/.codex/creatoros-verification/t1117-20261009/t1171-before/BACKLOG-archive.md:1019`；原文件SHA `e674a00f1b5622478b4baeed165ffbb81634fdca2080c7dc19ef79b861aa6c40`；原行SHA `bb50192e3e4fbc1a60ac226e8ae08ee22a45ef4ae62d53e18022f6cc033df618`。

<a id="t1173-t-1006-same-identity-history"></a>

### T1173保留：T-1006 同任务执行与旧完成表示

此节仅保留原完整行/各列/SHA及不同时间状态；不迁移审核/完成事件，不签当前业务。

原路径/行：BACKLOG.md:84；原行SHA256 `481a62b039b27b37172294d2b2796779a326c3a30d329ddb4fee96c9f1f53c07`。

```text
|T-1006|接入统一工具网关与长结果回读|📋 待办|—|—|[SPEC](docs/features/t1003-agent-workbench.md)|依赖 T-1004；工具发现、进度、取消、错误和费用共用原执行链。|
```

原路径/行：BACKLOG-archive.md:1020；原行SHA256 `3d78cf335be30ec803c06528ef94ad06ec642dc4e581e711532fd34f53e5c5b5`。

```text
| T-1006 | 接入统一工具网关与长结果回读 | ✅ 待办 | — | — | [SPEC](docs/features/t1003-agent-workbench.md) | 依赖 T-1004；工具发现、进度、取消、错误和费用共用原执行链。 |
```

原路径/行：N/t1171-before/BACKLOG.md:158；原行SHA256 `f2a0c187810ad2e7c16a86a1c44b3bffe3870f5d6194016616f9a693dc2848e7`。

```text
| T-1006 | 接入统一工具网关与长结果回读 | 📋 待办 | — | — | [SPEC](docs/features/t1003-agent-workbench.md) | 依赖 T-1004；工具发现、进度、取消、错误和费用共用原执行链。 |
```

原行各出现位置（同SHA副本也保留计数，不另判业务状态）：
- `/Users/zyongzhu/.codex/worktrees/t1062-client-integration/Thirdspace-creator/BACKLOG.md:84`；原文件SHA `bf8c9fbd338e2c0d4b019db497a77c234eeaa2ff7bb61e46687030989b742e13`；原行SHA `481a62b039b27b37172294d2b2796779a326c3a30d329ddb4fee96c9f1f53c07`。
- `/Users/zyongzhu/.codex/worktrees/t1062-client-integration/Thirdspace-creator/BACKLOG-archive.md:1020`；原文件SHA `d7617bd903e42bce0b3104778f7edd91a96bfe103d6759eb4fc894fbe2f853f8`；原行SHA `3d78cf335be30ec803c06528ef94ad06ec642dc4e581e711532fd34f53e5c5b5`。
- `/Users/zyongzhu/.codex/creatoros-verification/t1117-20261009/t1171-before/BACKLOG.md:158`；原文件SHA `00183b6a057a6e52c7503d61dbeafd0c388d99bc965640a1fa33cb329be76939`；原行SHA `f2a0c187810ad2e7c16a86a1c44b3bffe3870f5d6194016616f9a693dc2848e7`。
- `/Users/zyongzhu/.codex/creatoros-verification/t1117-20261009/t1171-before/BACKLOG-archive.md:1020`；原文件SHA `e674a00f1b5622478b4baeed165ffbb81634fdca2080c7dc19ef79b861aa6c40`；原行SHA `3d78cf335be30ec803c06528ef94ad06ec642dc4e581e711532fd34f53e5c5b5`。

<a id="t1173-t-1009-same-identity-history"></a>

### T1173保留：T-1009 同任务执行与旧完成表示

此节仅保留原完整行/各列/SHA及不同时间状态；不迁移审核/完成事件，不签当前业务。

原路径/行：BACKLOG.md:87；原行SHA256 `fec3a032fbade48985e8ada56ae14192d56b0e5c2bd495eb2b7a2f24e0375f47`。

```text
|T-1009|实现产物版本、隔离预览与原生导出|📋 待办|—|—|[SPEC](docs/features/t1003-agent-workbench.md)|依赖 T-1006/1007；真实文件交付、HTML/图表预览、图片/PDF及选址导出。|
```

原路径/行：BACKLOG-archive.md:1021；原行SHA256 `11c6cf73ab04c3dc194cc4115c2addc0bb4603402d3c326c447a8f5c3bede96b`。

```text
| T-1009 | 实现产物版本、隔离预览与原生导出 | ✅ 待办 | PASS[REV:a57fadb33099] | — | [SPEC](docs/features/t1003-agent-workbench.md) [跨回合补充规格](docs/features/t1009-artifact-lineage-proposal.md) | 依赖 T-1006/1007；真实文件交付、HTML/图表预览、图片/PDF及选址导出。跨回合修订按 DEC-AW-1009 实施。 |
```

原路径/行：N/t1171-before/BACKLOG.md:161；原行SHA256 `4e89663e74e4f16e5674e1af959555d0ea98dceb32b43b6034c1650db97f09d9`。

```text
| T-1009 | 实现产物版本、隔离预览与原生导出 | 📋 待办 | — | — | [SPEC](docs/features/t1003-agent-workbench.md) | 依赖 T-1006/1007；真实文件交付、HTML/图表预览、图片/PDF及选址导出。 |
```

原行各出现位置（同SHA副本也保留计数，不另判业务状态）：
- `/Users/zyongzhu/.codex/worktrees/t1062-client-integration/Thirdspace-creator/BACKLOG.md:87`；原文件SHA `bf8c9fbd338e2c0d4b019db497a77c234eeaa2ff7bb61e46687030989b742e13`；原行SHA `fec3a032fbade48985e8ada56ae14192d56b0e5c2bd495eb2b7a2f24e0375f47`。
- `/Users/zyongzhu/.codex/worktrees/t1062-client-integration/Thirdspace-creator/BACKLOG-archive.md:1021`；原文件SHA `d7617bd903e42bce0b3104778f7edd91a96bfe103d6759eb4fc894fbe2f853f8`；原行SHA `11c6cf73ab04c3dc194cc4115c2addc0bb4603402d3c326c447a8f5c3bede96b`。
- `/Users/zyongzhu/.codex/creatoros-verification/t1117-20261009/t1171-before/BACKLOG.md:161`；原文件SHA `00183b6a057a6e52c7503d61dbeafd0c388d99bc965640a1fa33cb329be76939`；原行SHA `4e89663e74e4f16e5674e1af959555d0ea98dceb32b43b6034c1650db97f09d9`。
- `/Users/zyongzhu/.codex/creatoros-verification/t1117-20261009/t1171-before/BACKLOG-archive.md:1021`；原文件SHA `e674a00f1b5622478b4baeed165ffbb81634fdca2080c7dc19ef79b861aa6c40`；原行SHA `11c6cf73ab04c3dc194cc4115c2addc0bb4603402d3c326c447a8f5c3bede96b`。

<a id="t1173-t-1015-same-identity-history"></a>

### T1173保留：T-1015 同任务执行与旧完成表示

此节仅保留原完整行/各列/SHA及不同时间状态；不迁移审核/完成事件，不签当前业务。

原路径/行：BACKLOG.md:81；原行SHA256 `edb588cd97f2a646aec26882e05c89afd8677ed2eda5a63f412f84952f3bc357`。

```text
|T-1015|核实剩余教训失败并校准过期回归断言|📋 待办|—|—|[实测清单](docs/verification/t1014-reconcile-triage.md) [详情](BACKLOG-details.md#t-1015)|见详情。|
```

原路径/行：BACKLOG-archive.md:1012；原行SHA256 `43347d16b93026a669bcf0bc5529317dc35e81fb58f1d668e5395225b25257ce`。

```text
| T-1015 | 核实剩余教训失败并校准过期回归断言 | ✅ 待办 | — | — | [实测清单](docs/verification/t1014-reconcile-triage.md) | 从19条失败命令定位旧版本/源码字符串断言与实际重试、消费、交互差异；保留有效检查，修正后重验。 |
```

原路径/行：N/t1171-before/BACKLOG.md:155；原行SHA256 `a410aece14f1985cb5618fdc0aac42943b1d905123e39dd453d551a34fd266cd`。

```text
| T-1015 | 核实剩余教训失败并校准过期回归断言 | 📋 待办 | — | — | [实测清单](docs/verification/t1014-reconcile-triage.md) [详情](BACKLOG-details.md#t-1015) | 见详情。 |
```

原行各出现位置（同SHA副本也保留计数，不另判业务状态）：
- `/Users/zyongzhu/.codex/worktrees/t1062-client-integration/Thirdspace-creator/BACKLOG.md:81`；原文件SHA `bf8c9fbd338e2c0d4b019db497a77c234eeaa2ff7bb61e46687030989b742e13`；原行SHA `edb588cd97f2a646aec26882e05c89afd8677ed2eda5a63f412f84952f3bc357`。
- `/Users/zyongzhu/.codex/worktrees/t1062-client-integration/Thirdspace-creator/BACKLOG-archive.md:1012`；原文件SHA `d7617bd903e42bce0b3104778f7edd91a96bfe103d6759eb4fc894fbe2f853f8`；原行SHA `43347d16b93026a669bcf0bc5529317dc35e81fb58f1d668e5395225b25257ce`。
- `/Users/zyongzhu/.codex/creatoros-verification/t1117-20261009/t1171-before/BACKLOG.md:155`；原文件SHA `00183b6a057a6e52c7503d61dbeafd0c388d99bc965640a1fa33cb329be76939`；原行SHA `a410aece14f1985cb5618fdc0aac42943b1d905123e39dd453d551a34fd266cd`。
- `/Users/zyongzhu/.codex/creatoros-verification/t1117-20261009/t1171-before/BACKLOG-archive.md:1012`；原文件SHA `e674a00f1b5622478b4baeed165ffbb81634fdca2080c7dc19ef79b861aa6c40`；原行SHA `43347d16b93026a669bcf0bc5529317dc35e81fb58f1d668e5395225b25257ce`。

<a id="t1173-t-916-same-identity-history"></a>

### T1173保留：T-916 同任务执行与旧完成表示

此节仅保留原完整行/各列/SHA及不同时间状态；不迁移审核/完成事件，不签当前业务。

原路径/行：BACKLOG.md:116；原行SHA256 `a589df718fc5b8ada6ad363a8d7e3d9b755b9b18bdab80de50245d679cdf3961`。

```text
|T-916|修复工程对账与历史任务证据漂移，恢复可信重构基线|🔨 待办|—|—|[审计 A-13](docs/research/2026-09-04-architecture-agent-audit.md) [详情](BACKLOG-details.md#t-916)|见详情。|
```

原路径/行：BACKLOG-archive.md:1027；原行SHA256 `3c8b7c1cdaea567d4bfc8b8e9b80690adee51dcf83a6f066dfaa7e280595f1cb`。

```text
|T-916|修复工程对账与历史任务证据漂移，恢复可信重构基线|✅|—|—|[审计 A-13](docs/research/2026-09-04-architecture-agent-audit.md) [本轮证据](docs/verification/t916-review-receipt-repair.md)|回执、活动看板和健康门已修复（e4ec21a8、0ae6ca34）；reconcile 0/0。|
```

原路径/行：N/t1171-before/BACKLOG.md:190；原行SHA256 `8ac791308d060dc8a723296f4200634781ffdaa07fb16e495372238a16ab34cb`。

```text
| T-916 | 修复工程对账与历史任务证据漂移，恢复可信重构基线【T-914 实测根因·2026-09-04】 | 🔨 待办 | — | — | [审计 A-13](docs/research/2026-09-04-architecture-agent-audit.md) [详情](BACKLOG-details.md#t-916) | 见详情。 |
```

原行各出现位置（同SHA副本也保留计数，不另判业务状态）：
- `/Users/zyongzhu/.codex/worktrees/t1062-client-integration/Thirdspace-creator/BACKLOG.md:116`；原文件SHA `bf8c9fbd338e2c0d4b019db497a77c234eeaa2ff7bb61e46687030989b742e13`；原行SHA `a589df718fc5b8ada6ad363a8d7e3d9b755b9b18bdab80de50245d679cdf3961`。
- `/Users/zyongzhu/.codex/worktrees/t1062-client-integration/Thirdspace-creator/BACKLOG-archive.md:1027`；原文件SHA `d7617bd903e42bce0b3104778f7edd91a96bfe103d6759eb4fc894fbe2f853f8`；原行SHA `3c8b7c1cdaea567d4bfc8b8e9b80690adee51dcf83a6f066dfaa7e280595f1cb`。
- `/Users/zyongzhu/.codex/creatoros-verification/t1117-20261009/t1171-before/BACKLOG.md:190`；原文件SHA `00183b6a057a6e52c7503d61dbeafd0c388d99bc965640a1fa33cb329be76939`；原行SHA `8ac791308d060dc8a723296f4200634781ffdaa07fb16e495372238a16ab34cb`。
- `/Users/zyongzhu/.codex/creatoros-verification/t1117-20261009/t1171-before/BACKLOG-archive.md:1027`；原文件SHA `e674a00f1b5622478b4baeed165ffbb81634fdca2080c7dc19ef79b861aa6c40`；原行SHA `3c8b7c1cdaea567d4bfc8b8e9b80690adee51dcf83a6f066dfaa7e280595f1cb`。

<a id="t1173-t1014-identical-archive-history"></a>

### T1173保留：T-1014相同归档原行

此节仅保留原完整行/各列/SHA及不同时间状态；不迁移审核/完成事件，不签当前业务。

原路径/行：BACKLOG-archive.md:1011；原行SHA256 `819a57a30efc7d7cdb8881fbc23157359967a42ddd17b8af9455e2cf0d7c897f`。

```text
| T-1014 | 核对并清理233项历史对账失败 | ✅ 待办 | — | — | [范围](docs/verification/t1014-reconcile-triage.md) | 按真实证据关闭过期治理项，保留有效缺陷与历史回执；不修改产品运行时。 |
```

原行各出现位置（同SHA副本也保留计数，不另判业务状态）：
- `/Users/zyongzhu/.codex/worktrees/t1062-client-integration/Thirdspace-creator/BACKLOG-archive.md:1011`；原文件SHA `d7617bd903e42bce0b3104778f7edd91a96bfe103d6759eb4fc894fbe2f853f8`；原行SHA `819a57a30efc7d7cdb8881fbc23157359967a42ddd17b8af9455e2cf0d7c897f`。
- `/Users/zyongzhu/.codex/worktrees/t1062-client-integration/Thirdspace-creator/BACKLOG-archive.md:1107`；原文件SHA `d7617bd903e42bce0b3104778f7edd91a96bfe103d6759eb4fc894fbe2f853f8`；原行SHA `819a57a30efc7d7cdb8881fbc23157359967a42ddd17b8af9455e2cf0d7c897f`。
- `/Users/zyongzhu/.codex/creatoros-verification/t1117-20261009/t1171-before/BACKLOG.md:154`；原文件SHA `00183b6a057a6e52c7503d61dbeafd0c388d99bc965640a1fa33cb329be76939`；原行SHA `819a57a30efc7d7cdb8881fbc23157359967a42ddd17b8af9455e2cf0d7c897f`。
- `/Users/zyongzhu/.codex/creatoros-verification/t1117-20261009/t1171-before/BACKLOG-archive.md:1011`；原文件SHA `e674a00f1b5622478b4baeed165ffbb81634fdca2080c7dc19ef79b861aa6c40`；原行SHA `819a57a30efc7d7cdb8881fbc23157359967a42ddd17b8af9455e2cf0d7c897f`。

<a id="b-43efc28c7f95"></a>

## T-1223 2026-10-11 压缩前完整条目

|T-1223|修复截图总览把历史运行记录当用例数及重复锚点|🔨 待办|—|待验|[范围与验收](docs/features/t1223-verification-gallery-record-identity.md)|3912FAIL与3913PASS同testId实际保留，但generator按每行标cases且同HTML id；只修报告计数/唯一锚点，保全历史状态和原图，待独评。|


<a id="b-7cb36965e02b"></a>

## T-1222 2026-10-11 压缩前完整条目

|T-1222|核对文章图文编导的空态与功能指引脱离当前稿件|📋 待办|—|待验|[截图与范围](docs/features/t1222-director-context-guidance.md)|3911实际文章和图文编导截图仍提示最近评论出选题；当前组件空态/placeholder通用写死。先核正式稿件target与功能目录，按oil原tokens统一上下文指引和实际可用动作，不能只改文案冒签AI工具可用。|


<a id="b-5c5bdde4c800"></a>

## T-1221 2026-10-11 压缩前完整条目

|T-1221|校准双工作区切换端到端旧账号选择器|🔨 待办|—|—|[范围与验收](docs/features/t1221-group-switch-e2e.md)|原T1207 A项目可见后data-account-id超时；仅按T1022真实members/data-group-id/组镜像校准，保两账号原公共创建、跨组无残影与返回刷新回读，不改权限或掩盖兼容缺陷。|


<a id="b-7f8c12919103"></a>

## T-1217 2026-10-11 压缩前完整条目

|T-1217|修复内容雷达来源任务在旧账号和冻结组范围间卡住|🔨 待办|—|—|[诊断与验收](docs/features/t1217-source-sync-workspace.md)|3901公共来源创建后恢复实际OwnershipError，旧source/run的NULL组与execution冻结legacy组不一致；先隔离完整链RED，独评精确写集，保跨组/转组/停控/原ID。|


<a id="b-50cf413f8280"></a>

## T-1207 2026-10-11 压缩前完整条目

|T-1207|用 Playwright/App 自动化对全功能建立逐项验收并留图|🔨 待办|—|待验|[验收范围与路径](docs/features/t1207-full-feature-acceptance.md)|用户要求以需求/验收标准驱动AI编写流程与用例、子Agent实际跑E2E、每个可达页面和场景留截图供明日复核。覆盖现有46个浏览器E2E及全路由截图；桌面原生须按真实Appium/宿主能力单列，报告外部平台/模型动作限制与所有失败，不触碰真实账号或用户数据。|


<a id="b-ba8271fca89d"></a>

## T-1208 2026-10-11 压缩前完整条目

|T-1208|复核T-1207暴露的浏览器功能失败并修复确认缺陷|🔨 待办|—|待验|[复核范围与验收标准](docs/features/t1208-t1207-e2e-failure-triage.md)|T1207基线120例中39失败、8超时；专项修正后T1069/T954/T1159通过。已确认并修复无视频作品剪辑页卡在恢复态，组件与隔离浏览器回归通过；其余定位中心、内容雷达、项目、账号/作品、发布日历、剪辑、画布等继续按逐例索引和截图复现定因。|


<a id="b-577cb0da68f4"></a>

## T-1204 2026-10-11 压缩前完整条目

|T-1204|核对本轮全局对账29项失败及新增触发项|🔨 待办|—|—|[实际诊断](docs/features/t1204-current-reconcile-failures.md)|T1199/T1200本轮完整reconcile --concise实际exit1，29ERROR/0WARN；输出仅保前5项，其余24未打印，不能猜成旧24项。保原日志与统计，核看板过大、旧receipt及LED041/057等真实失败，不修改门卫或洗绿；父任务仍待验。|

<a id="b-331e63446d8d"></a>

|T-1224|校准内容雷达公共旅程的短测试预算与证据输出|🔨 待办|—|待验|[范围与验收](docs/features/t1224-radar-e2e-budget-evidence.md)|原transform等待60秒/导航30秒未被overlay覆盖；窄校准后重跑完整来源到项目旅程，保旧失败和独立证据，不改产品或断言。|

<a id="b-f2fe4887cb75"></a>

|T-1217|修复内容雷达来源任务在旧账号和冻结组范围间卡住|🔨 待办|—|—|[诊断与验收](docs/features/t1217-source-sync-workspace.md)|旧NULL来源与冻结组不一致；30例通过后扩大旧回归暴露取消/防丢保护/删除父闭包，修复中。 [原记录](BACKLOG-details.md#b-7f8c12919103)|

<a id="b-2a871e9f9f38"></a>

|T-1101|修复画布素材选择、生成防重复与连线透传，整合三平台扫码绑定及错峰采集|🔨|PASS[REV:146ff2046c2c]|待验|[SPEC](docs/features/t1101-canvas-binding-collection.md)|用户2026-10-09截图明确要求：素材只显示预览；生成中禁止重复提交、已有结果再生成需确认；图片连线传递默认参考；扫码入口放平台能力表，删除刷新和下方重复框；三平台独立采集错峰执行。来源f97a80da已完成；main重新初审和组合验收，原PASS不代签当前树。不发布、不改真实Cookie。|

<a id="b-da2102ce12ea"></a>
### T-1110 原执行记录

原行 SHA256 `da2102ce12ea3ad08f27af7c5e1adb68303c59cf4e9f55f6bf5edc29bb412a92`；ID、状态、审核、验收、正式文档及顺序保持。

|T-1110|核对浏览器验收开发资源ChunkLoadError与测试状态准备竞态|📋 待办|—|—|[实际缺陷](docs/features/t1110-browser-development-resource-diagnosis.md)|用户要求有问题建task；fa09真实两条旅程0PASS/2FAIL，绑定页ChunkLoadError无法加载，第一例旧状态被仍运行页面自动保存覆盖。原trace/log保留；后者在T1108原范围先离开再准备，前者根因未知，核真实静态响应/开发缓存和并发，不删断言或用旧PASS代签。|

<a id="b-2d26eed11574"></a>
### T-1081 原执行记录

原行 SHA256 `2d26eed11574bc21c19bdc5ac03deaf286eaa35f2e3e7a0df3e3803ecb593ef4`；ID、状态、审核、验收、正式文档及顺序保持。

|T-1081|核对整合后原主线的14处短执行预算与超时扫描误报|📋 待办|—|待验|[根因证据](docs/verification/t1080/timeout-static-dispositions-corrected.json)|完整超时门实际exit1：14条既有短执行/有限观察来自原main/client，另13条为冻结编辑器调度/动画、已取消清理、TTL或已归一消费者；先按真实消费者复核，不改vendor洗绿、不延长取消。来源与原失败留存；本轮优先合并和出包，此任务尚未实施。|

<a id="b-e634c6a1c42a"></a>
### T-1097 原执行记录

原行 SHA256 `e634c6a1c42a608e3efd0a5680fdfc20256098b6b912474cd7a6c0ebecb17205`；ID、状态、审核、验收、正式文档及顺序保持。

|T-1097|修复文章编导参考资料与候选审读保护缺口|📋|—|—|[缺陷诊断](docs/features/t1097-article-director-options-diagnosis.md)|用户要求有问题及时建task修复；T1096确认身份/文档只接不可触达旧generate，当前联合未接；事实替换对照及未请求元数据保护也需当前链实证。核真实来源与审读后独评闭合，不恢复旧快转，不把旧恢复/checkbox测试当新链通过。|

<a id="b-bc5cecd384c8"></a>
### T-1107 原执行记录

原行 SHA256 `bc5cecd384c89bac64fdc110be7f5563b997370e6a525b59b6a334b5b6035477`；ID、状态、审核、验收、正式文档及顺序保持。

|T-1107|核对平台公共接口新增操作与发布归属回归失败|🔨|PASS[REV:9c9181db2c1c]|待验|[实际缺陷](docs/features/t1107-platform-public-regression.md)|全功能验收额外公共真链24例实际22PASS/2FAIL：账号操作数5变6，发布锚冲突首轮200而旧断言期待拒绝；重试又409。先核main合并前基线与真实组/项目归属，再独评修复产品或过期夹具；保原断言/失败/权限，不删除历史洗绿。|

<a id="b-024c8af10ce0"></a>
### T-1092 原执行记录

原行 SHA256 `024c8af10ce08e3566ff632d721646bb5780e333148fc42d034da6e36bce46bf`；ID、状态、审核、验收、正式文档及顺序保持。

|T-1092|核对联合创作旧集成测试未解包可信回执的契约漂移|📋|—|—|[当场基线证据](docs/verification/t1091/CREATION_BASELINE_DIAGNOSIS.md)|T1091扩大回归154PASS/2FAIL，旧main隔离同2FAIL；原第104行严格parse含__creatorosOutcome的展示投影，页面先经原解包器。先独评实际旧断言/回执协议再校准，保可信元数据与两稿内容断言，不改生产schema或洗掉失败。本轮不实施。|

<a id="b-4b6be3609803"></a>
### T-1182 原执行记录

原行 SHA256 `4b6be3609803d0bdb602ca26d9f61a58af271905243335c8c3875d79905edbbc`；ID、状态、审核、验收、正式文档及顺序保持。

|T-1182|区分隐藏文件注入与真实上传按钮的刷新等待|🔨 待办|PASS[REV:456a0d53bb41]|—|[实验SPEC](docs/features/t1182-real-upload-button-control.md) · [研究卡](docs/research/t1182-upload-ui-refresh.md)|T1181两次MP4完成后公开库存有文件而列表等120秒不可见；原探针直接注入隐藏input，可能绕过真实按钮pending。冻结失败，一次已观测加一次真实按钮/filechooser区分实验，不改产品/权限/预算、不盲重跑或代签根因。|

<a id="b-bc11f0a7b5b2"></a>
### T-1196 原执行记录

原行 SHA256 `bc11f0a7b5b2c1496fafa24f75a9a78068080c1eb8bddff27fae86b05e7bbc81`；ID、状态、审核、验收、正式文档及顺序保持。

|T-1196|排查新安装版启动配置同步502与运行摘要拒绝|📋 待办|—|—|[实际诊断](docs/features/t1196-installed-config-sync-502.md)|T1194新包真启动HTTP首页正常、CLI连接正常；同时日志CHANNEL_RUNTIME_DIGEST_MISMATCH、展示副本同步502、config_sync blocked502。保失败和已激活事实，核真实同步消费者/返回来源，不猜网络或绕过摘要/验签，不重置激活。|

<a id="b-3158c3fcebbd"></a>
### T-1093 原执行记录

原行 SHA256 `3158c3fcebbdbefc305f9ee4e5d318c582475093cc8abbb5b2d37c8074473842`；ID、状态、审核、验收、正式文档及顺序保持。

|T-1093|校准编导数字参数、联合首次读取与真实候选失败恢复|🔨|PASS[REV:267bf399a6b1]|—|[SPEC](docs/features/t1093-director-method-recovery.md)|T1091真实安装6候选通过/2失败；Pi整数发字符串被拒后仍称就绪、联合首读猜错可省略digest。只改功能方法提示，不放宽schema/回执/owner/旧任务或重发未知；正式独评后RED/GREEN及新包真实Pi复验，旧失败保留。|

<a id="b-26577d4c923f"></a>
### T-1116 原执行记录

原行 SHA256 `26577d4c923fef3ae591b376df4a1293c4829684c7f15f86b2bfc1b29a3317c9`；ID、状态、审核、验收、正式文档及顺序保持。

|T-1116|核对稿件并发保存回归在本轮完整对账中的再次失败|🔨 待办|—|—|[实际诊断](docs/features/t1116-artifact-cas-global-regression.md)|T1114新增相对失败LED027，原41失败保留；实际全局没有保存内层断言，先原两段命令逐段取得真实失败，核CAS/事务/初始化预算。未确认产品根因，不删除竞争或版本断言，不能称已修或全功能PASS。|

<a id="b-609973ed4950"></a>
### T-1083 原执行记录

原行 SHA256 `609973ed4950823ad8842c1db91fb224ec7e9d56618884fe172b1ff6a5be3f71`；ID、状态、审核、验收、正式文档及顺序保持。

|T-1083|复核流程升级后的旧任务写集通配符兼容缺口|📋 待办|—|—|[根因证据](docs/verification/t1080/post-package-progress-block-failure.json)|progress原block命令实际exit2：T1026的docs/verification/t1026*被3.29路径校验拒绝，未写进度；taskctl已真实记T1080阻断。先盘点旧glob实际允许写集、独立复核等价迁移，不放宽guard或手改状态，本轮未实施。|

<a id="b-19048143f3aa"></a>
### T-1096 原执行记录

原行 SHA256 `19048143f3aa8244da6a89dc75a603d45cc35a5042cf38da5f14f2b14835444f`；ID、状态、审核、验收、正式文档及顺序保持。

|T-1096|核对文章工作流与任务父归属旧回归断言的实际漂移|📋|—|—|[当场基线](docs/verification/t1094/RELATED_BASELINE_DIAGNOSIS.md)|T1094正式回归文章9FAIL/任务6FAIL；原main770037原测试同名同因复现。先核用户确认的联合创作入口、保存回读与组父归属，再独评是否修fixture或真实代码；原断言/owner不洗绿，不恢复已删快转入口。|

<a id="b-32f22df52b82"></a>
### T-1098 原执行记录

原行 SHA256 `32f22df52b820b1f90579369f64feea959430d600ab15f77b24f34046eeab6db`；ID、状态、审核、验收、正式文档及顺序保持。

|T-1098|核对安装重启后的定期同步失败与采集未启动|📋|—|—|[缺陷登记](docs/features/t1098-installed-scheduled-failure-diagnosis.md)|用户要求发现问题及时建task；T1095真启动日志两scheduled.intelligence.sync为failed，另账号定期采集Error。保原ID与真实失败，先核公开归属/原回执/启动前事实后独评修复，不猜关联、清历史或重发。|

## T-1410 机械外置原文

> 主看板 [D] 指向本文件；按任务ID检索。本区是原文快照，不取代主看板的实时状态。

<a id="t1410-t-1411-41efa49041e5"></a>
### T-1411 · 修复文本连接测试鉴权丢失与结果说明

原始七列行（说明与文档链接逐字保留）：

|T-1411|修复文本连接测试鉴权丢失与结果说明|🔨|PASS[REV:40d357fc2e44]|—|[SPEC](docs/features/t1411-model-probe-auth-parity.md)|保留真实解析鉴权方式，以真实IPC和HTTP红绿证明；不将最小探针冒充完整官方聊天通过。|

<a id="t1410-t-1410-8750e91f351a"></a>
### T-1410 · 修复历史审核证据与看板对账

原始七列行（说明与文档链接逐字保留）：

| T-1410 | 修复历史审核证据与看板对账 | 🔨 | PASS[REV:1f4e2a1dd6f2] | — | [SPEC](docs/features/t1410-review-evidence-reconciliation.md) | 沿原规范链保全恢复原件并真实独审，不刷新hash冒PASS；通过后再整理看板。 |

<a id="t1410-t-1409-9b955b6be974"></a>
### T-1428 · 修复官方Pi支付拒绝的安全诊断

原始七列行（说明与文档链接逐字保留）：

| T-1428 | 修复官方Pi支付拒绝的安全诊断 | 🔨 | PASS[REV:04839f8bcbce] | — | [SPEC](docs/features/t1428-managed-pi-payment-diagnostics.md) | T1427拆分的确定性错误提取与持久分类修复；真实原任务恢复与安装总验收仍由T1427闭环。 |

<a id="t1410-t-1408-683359c4567e"></a>
### T-1427 · 修复官方Pi与未通过验收并在通过后推送

原始七列行（说明与文档链接逐字保留）：

|T-1427|修复官方Pi与未通过验收并在通过后推送|🔨|PASS[REV:e780bb81f759]|待验|[SPEC](docs/features/t1427-official-pi-acceptance-and-push.md)|用户明确继续修复官方402、验收失败及真实安装复验，通过后普通推送；先核根因和精确写集，独立审核，不伪造UI或历史审核。|

<a id="t1410-t-1407-cb4ca31c11ed"></a>
### T-1407 · 整理现有修复、安装复验并准备合并推送

原始七列行（说明与文档链接逐字保留）：

|T-1407|整理现有修复、安装复验并准备合并推送|⏸️|PASS[REV:4538b35201d4]|待验|[SPEC](docs/features/t1407-local-integration-install-merge-preparation.md)|用户明确恢复安装并要求处理代码、准备合并推送；保现安装修复与数据，整理本地提交、整合主干、CLI实测并给出真实准备状态，尚不执行push或公开发布。|

<a id="t1410-t-1405-17aea9ed8bdd"></a>
### T-1426 · 修复CLI真实对话的组上下文、模型错误与开销

原始七列行（说明与文档链接逐字保留）：

|T-1426|修复CLI真实对话的组上下文、模型错误与开销|🔨|PASS[REV:2537258f8796]|—|[SPEC](docs/features/t1426-chat-model-combination-fixes.md)|用户要求修复T1424暴露的问题；核真实额度、对话组绑定、路由错误及工具开销，保合法来源与权限，独评后实现并CLI复验。|

<a id="t1410-t-1403-a4d540e822a8"></a>
### T-1424 · 沿用已确认账号并实测CLI对话组合

原始七列行（说明与文档链接逐字保留）：

|T-1424|沿用已确认账号并实测CLI对话组合|⏸️|—|待验|[SPEC](docs/features/t1424-cli-chat-combination-acceptance.md)|用户纠正非阻塞问题不要重复询问；固定月明水清深，修订Agent规则并真实CLI验证模型来源与引擎组合、回复和工具，不以连接探针代签。|

<a id="t1410-t-1402-a2fc1c8e6929"></a>
### T-1423 · 历史激活码无感升级模型权益与原授权恢复

原始七列行（说明与文档链接逐字保留）：

|T-1423|历史激活码无感升级模型权益与原授权恢复|🔨|PASS[REV:523d1050324a]|待验|[SPEC](docs/features/t1423-legacy-license-one-click-upgrade.md)|用户要求面向所有用户自助升级历史永久码；保原许可与钱包，幂等启用，不依赖人工查库；含本机已明确授权恢复及一份失效旧绑定释放，本地实现测试打包安装，发布另列。|

<a id="t1410-t-1401-0f3d947f138f"></a>
### T-1422 · 接入试用设备一次模型权益与明确恢复

原始七列行（说明与文档链接逐字保留）：

|T-1422|接入试用设备一次模型权益与明确恢复|🔨|—|待验|[SPEC](docs/features/t1422-trial-device-model-benefits.md)|用户确认每台试用设备一次5元；消费Activity/Growth试用v2、正式v1保持，复用正常许可核验与明确启用；独立worktree本地验证，不push/部署/实赠。|

<a id="t1410-t-1400-a933983fbe98"></a>
### T-1400 · 修复选题 Copilot 长候选采纳区裁切

原始七列行（说明与文档链接逐字保留）：

|T-1400|修复选题 Copilot 长候选采纳区裁切|⏸️|—|待验|[SPEC](docs/features/t1400-topic-adoption-scroll.md)|四来源 mock 回归、补齐弹窗 flex 高度链；不真实调用、不push，补丁交付。|

<a id="t1410-t-1399-c32fc685bd10"></a>
### T-1399 · 固定侧栏 AI 助手页脚与收拢入口

原始七列行（说明与文档链接逐字保留）：

|T-1399|固定侧栏 AI 助手页脚与收拢入口|⏸️|—|待验|[SPEC](docs/features/t1399-sidebar-assistant-footer.md)|仅调整助手卡片与测试，保留全部导航、折叠及原 Copilot 参数；指定回归、补丁交付，不push。|

<a id="t1410-t-1398-6692603f9b38"></a>
### T-1398 · 修复 Copilot DeepSeek 强制工具请求、失败重试与错误诊断丢失

原始七列行（说明与文档链接逐字保留）：

|T-1398|修复 Copilot DeepSeek 强制工具请求、失败重试与错误诊断丢失|🔨 待办|—|待验|[SPEC](docs/features/t1398-copilot-deepseek-failure.md)|用户授权最小修复、相关测试与补丁交付；不真实调用、不读密钥、不修改许可激活签名、不push。 第四轮补 DeepSeek 推理历史回传与缺失历史关闭思考；第三轮补发送前明确失败结算与日志；当前源码 mocked DeepSeek 定位成功，历史 exact exception 未复现，任务保持未完成。|

<a id="t1410-t-1397-507f13882acb"></a>
### T-1397 · 修复main Verify并核实已知失败

原始七列行（说明与文档链接逐字保留）：

|T-1397|修复main Verify并核实已知失败|⏸️|—|—|[授权与验收](docs/features/t1397-verify-main-green.md)|用户授权契约漏登记、后端CI终止根因、完整本地测试与逐项known清单；6144串行类型检查及各包质量门，HTTPS普通推送并最多2轮追加修复，报告至terminals/ci-green。|

<a id="t1410-t-1380-bfc9f2234a79"></a>
### T-1380 · 解除协作者本地Mac完整构建对作者私钥的依赖

原始七列行（说明与文档链接逐字保留）：

|T-1380|解除协作者本地Mac完整构建对作者私钥的依赖|⏸️|PASS[REV:fade0e6a2c0c]|—|[独立本地构建范围](docs/features/t1380-independent-local-mac-build.md)|用户已明确取消Local方案并要求回退；本任务产品/脚本改动已私有保全后撤回，未产包/安装；原R1仅历史，不冒完成。|

<a id="t1410-t-1378-c28ff2ce652d"></a>
### T-1378 · 诊断每日观测HTTP422与接收端固定清单兼容

原始七列行（说明与文档链接逐字保留）：

|T-1378|诊断每日观测HTTP422与接收端固定清单兼容|🔨|PASS[REV:48c6e24fa806]|—|[原拒收与隔离范围](docs/features/t1378-observability-http-422-registry-diagnosis.md)|10/20原422/待发1563保；合成跨端RED确认两已登记ID不兼容，Growth T248三文件本地39PASS/非作者及补丁实用独审PASS；原stage/body、发布及owner待核，不催传/追签首因，见t1378/RESULT。|

<a id="t1410-t-1385-04aaeac4719d"></a>
### T-1385 · 修复 Verify 的 Node 堆内存耗尽

原始七列行（说明与文档链接逐字保留）：

|T-1385|修复 Verify 的 Node 堆内存耗尽|🔨|—|—|[SPEC](docs/features/t1385-verify-ci-memory.md)|用户授权最小 CI 修复：两个 job 6144 MiB 堆、串行 typecheck；本地全检查及内存测量，不改许可/激活/verdict/签名，不push，交付补丁与本地提交脚本。|

<a id="t1410-t-1393-fe12ba296c75"></a>
### T-1393 · 按真实密度重排内容雷达三栏

原始七列行（说明与文档链接逐字保留）：

|T-1393|按真实密度重排内容雷达三栏|⏸️|—|—|[SPEC](docs/features/ui-fixes-2026-10-21/T-1384.md)|用户授权沿ui-ux-pro-max与MASTER重排11来源/5分类/40作品；1440与1280保留三栏、缩略图、紧凑状态与筛选，保功能及详情唯一升级入口。当前分支本地提交或补丁脚本，不push。|

<a id="t1410-t-1392-38c1716e290a"></a>
### T-1392 · 重新规划内容雷达三栏与来源操作布局

原始七列行（说明与文档链接逐字保留）：

|T-1392|重新规划内容雷达三栏与来源操作布局|⏸️|—|—|[SPEC](docs/features/ui-fixes-2026-10-21/T-1383.md)|用户授权使用ui-ux-pro-max，1440px来源完整、三栏重排与窄窗降级；保留全部功能、详情04唯一升级入口、分组卡片与未知状态。补vitest/typecheck，当前分支本地中文提交或补丁脚本，不push。|

<a id="t1410-t-1387-0c728288b19e"></a>
### T-1387 · 统一主导航宽度并恢复选题页1440px完整布局

原始七列行（说明与文档链接逐字保留）：

|T-1387|统一主导航宽度并恢复选题页1440px完整布局|⏸️|—|—|[SPEC](docs/features/ui-fixes-2026-10-21/T-1378.md)|用户2026-10-21明确：intelligence/topics侧栏统一约224px，选题右侧03/04完整显示；遵守MASTER，补vitest，独立中文commit至当前ui-fixes分支、不push。用户已允许跳过缺失技能；按本项SPEC执行并如实记录验证边界。 实际结果 / RESULT.md [RESULT](docs/features/ui-fixes-2026-10-21/RESULT.md)|

<a id="t1410-t-1388-907722c4855f"></a>
### T-1388 · 修复项目页首开自动滚动到口播脚本

原始七列行（说明与文档链接逐字保留）：

|T-1388|修复项目页首开自动滚动到口播脚本|⏸️|—|—|[SPEC](docs/features/ui-fixes-2026-10-21/T-1379.md)|用户2026-10-21明确：定位autofocus/scrollIntoView/hash根因，首开停顶部项目准备，保留主动去写稿#script；补vitest并独立中文commit。用户已允许跳过缺失技能；按本项SPEC执行并如实记录验证边界。 实际结果 / RESULT.md [RESULT](docs/features/ui-fixes-2026-10-21/RESULT.md)|

<a id="t1410-t-1389-b9a1220be3ad"></a>
### T-1389 · 补全选题来源中文标签与未知值兜底

原始七列行（说明与文档链接逐字保留）：

|T-1389|补全选题来源中文标签与未知值兜底|⏸️|—|—|[SPEC](docs/features/ui-fixes-2026-10-21/T-1380.md)|用户2026-10-21明确：candidateSource的trend/benchmark/demand/idea/favorites全部中文，未知值兜底；补vitest并独立中文commit。用户已允许跳过缺失技能；按本项SPEC执行并如实记录验证边界。 实际结果 / RESULT.md [RESULT](docs/features/ui-fixes-2026-10-21/RESULT.md)|

<a id="t1410-t-1390-59176ff6bc90"></a>
### T-1390 · 移除雷达作品卡片重复的升级为项目按钮

原始七列行（说明与文档链接逐字保留）：

|T-1390|移除雷达作品卡片重复的升级为项目按钮|⏸️|—|—|[SPEC](docs/features/ui-fixes-2026-10-21/T-1381.md)|用户2026-10-21明确：只移除ItemCard入口，保留作品详情04选定方案入口；补vitest并独立中文commit。用户已允许跳过缺失技能；按本项SPEC执行并如实记录验证边界。 实际结果 / RESULT.md [RESULT](docs/features/ui-fixes-2026-10-21/RESULT.md)|

<a id="t1410-t-1391-f2caca91e18d"></a>
### T-1391 · 容错雷达作品未知转写状态避免整页崩溃

原始七列行（说明与文档链接逐字保留）：

|T-1391|容错雷达作品未知转写状态避免整页崩溃|⏸️|—|—|[SPEC](docs/features/ui-fixes-2026-10-21/T-1382.md)|用户授权未知transcript.status显示“状态未知”，避免整页ZodError；五项frontend typecheck/vitest，保留T767失败与既有lint，授权/激活/verdict/签名不变。技能缺失处理、完整原文与实测边界见原SPEC、RESULT及编号映射。|

<a id="t1410-t-1374-09c4345954bd"></a>
### T-1374 · 查明并恢复所有已绑定媒体的既有数据展示

原始七列行（说明与文档链接逐字保留）：

|T-1374|查明并恢复所有已绑定媒体的既有数据展示|⏸️|PASS[REV:16648a3ea984]|待验|[逐平台完整恢复范围](docs/features/t1374-all-bound-platform-data-recovery.md)|本轮仅补三测试/seed，52+3+双窗2通过、prod0改；安装仍旧2d未交付，视频号原EXPORT_FAILED/0页且native0/site-safety受阻，已block不冒全部恢复；full未跑/T1373保。|

<a id="t1410-t-1369-36cf7e778125"></a>
### T-1369 · 修复首页平台筛选后的连续侧栏导航卡死

原始七列行（说明与文档链接逐字保留）：

|T-1369|修复首页平台筛选后的连续侧栏导航卡死|🔨|PASS[REV:01444fedd32f]|待验|[连续导航范围](docs/features/t1369-dashboard-filter-sidebar-navigation.md)|旧R3收据仅绑定6f8114；用户已明确允许本次新夹具单次cycle，真实DEC136909保，正式新cycle尚未记录；production01–03均前置FAIL、03残PG已后清理，04未执行/未证修复，本轮先整合代码。|

<a id="t1410-t-1373-67ecb21adf24"></a>
### T-1373 · 核对完整对账中真实CLI的用户目录与联网副作用

原始七列行（说明与文档链接逐字保留）：

|T-1373|核对完整对账中真实CLI的用户目录与联网副作用|📋|待审|待验|[当前安全阻断](docs/features/t1373-reconcile-cli-side-effect-isolation.md)|102完整对账预检发现LED053原CLI未隔离，存在HOME配置写/更新安装可达；先只读登记，不冒新full、改旧门或补旧receipt。|

<a id="t1410-t-1367-bb963bddc9b7"></a>
### T-1367 · 恢复视频号折叠导航下的报表入口

原始七列行（说明与文档链接逐字保留）：

|T-1367|恢复视频号折叠导航下的报表入口|⏸️|PASS[REV:c7a98f074848]|待验|[事实与候选范围](docs/features/t1367-wechat-video-collapsed-navigation-entry.md)|665受控实现与验证已整合，真实owner/采集恢复UNKNOWN且site-safety受阻已block；T1368后验不代恢复，原full58与旧失败保，不绕行/新collect/打包安装。|

<a id="t1410-t-1366-2372b13fe07f"></a>
### T-1366 · 核对导航诊断新增的旧宽路径收据失配

原始七列行（说明与文档链接逐字保留）：

|T-1366|核对导航诊断新增的旧宽路径收据失配|📋|待审|待验|[收据根因边界](docs/features/t1366-navigation-diagnosis-wide-receipt-drift.md)|2d完整56ERROR含本次T1354/source与T1356/persistence新宽收据漂移，T1294既有身份亦有新增交叉；与旧44、clean候选缺旧产物及两新LED后验环境失败分证，不洗旧PASS。|

<a id="t1410-t-1360-c556e741d821"></a>
### T-1360 · 核对本批绑定首页与切组变更导致的旧宽路径收据失配

原始七列行（说明与文档链接逐字保留）：

|T-1360|核对本批绑定首页与切组变更导致的旧宽路径收据失配|📋|待审|待验|[根因边界](docs/features/t1360-current-binding-dashboard-receipt-drift.md)|最终44ERROR含新增1345/1347及1348/1346/1350宽收据失配，按实际消费者分证；不归旧32项、不洗旧PASS或全量模型重跑。|

<a id="t1410-t-1358-c017b66f386f"></a>
### T-1358 · 核对隔离首页首次装配与组读取长耗时

原始七列行（说明与文档链接逐字保留）：

|T-1358|核对隔离首页首次装配与组读取长耗时|📋|待审|待验|[观察边界](docs/features/t1358-unselected-home-readiness-latency.md)|19d无group首页9.2分钟、1db带group首次导航120秒失败后200约2.5分钟；组query日志139秒与装配分证，首因未证，不冒真实空新用户或旧App回归。|

<a id="t1410-t-1353-35746e30772e"></a>
### T-1353 · 核对本轮工作区与日报接线导致的旧宽路径验收收据失配

原始七列行（说明与文档链接逐字保留）：

|T-1353|核对本轮工作区与日报接线导致的旧宽路径验收收据失配|📋|待审|待验|[新失配根因](docs/features/t1353-current-batch-legacy-receipt-drift.md)|843审计确认1343/1342/1341/1338/1330/1328/1324旧全文件收据失配由本轮新字节触发；与1298/1296等开工旧债分列，按真实消费者影响处理，不冒旧功能全程重验。|

<a id="t1410-t-1351-268268d28423"></a>
### T-1351 · 核对账号管理进入组与驻留视频宿主的离开保护边界

原始七列行（说明与文档链接逐字保留）：

|T-1351|核对账号管理进入组与驻留视频宿主的离开保护边界|📋|待审|待验|[源码风险登记](docs/features/t1351-manager-video-leave-guard-risk.md)|只读审计发现manager进入组不显式requestVideoLeave；宿主保旧scope，不冒丢稿/越权。先隔离公共证明实际用户风险，再定是否需要窄修。|

<a id="t1410-t-1349-18c4ebee7831"></a>
### T-1349 · 修复项目列表窄桌面首列标题归零与右侧动作裁切

原始七列行（说明与文档链接逐字保留）：

|T-1349|修复项目列表窄桌面首列标题归零与右侧动作裁切|📋|待审|待验|[公共失败与基线](docs/features/t1349-project-list-responsive-columns.md)|本轮冻结候选两视口标题可见断言120秒失败；原项目页全文件与88945相同，固定列宽挤掉标题，单独登记不冒本轮已修。|

<a id="t1410-t-1336-c4b2aa18d10f"></a>
### T-1336 · 核对校准结果到经验置信度的既有反馈预留

原始七列行（说明与文档链接逐字保留）：

|T-1336|核对校准结果到经验置信度的既有反馈预留|📋|待审|待验|[当前no-op与旧OQ3事实](docs/features/t1336-calibration-learning-confidence-bridge-observation.md)|自动调整经验置信度仍未接入，现有预留非本轮回归；仅登记调查，不START/不改7f1，手动Learning回流另验。|

<a id="t1410-t-1333-3eb7d9f952b8"></a>
### T-1333 · 明确结构表脚本历史来源读取兼容

原始七列行（说明与文档链接逐字保留）：

|T-1333|明确结构表脚本历史来源读取兼容|📋|待审|待验|[结构表历史来源既有缺口](docs/features/t1333-structured-script-history-source-compatibility.md)|确认稿reader读得到结构表正文，旧workSource schema1历史正文为空且digest原样；无旧成功证据，单列未支持族不扩本轮产品。|

<a id="t1410-t-1321-01d5c300d383"></a>
### T-1321 · 诊断图文重新组织与手动校正未形成可采纳候选

原始七列行（说明与文档链接逐字保留）：

|T-1321|诊断图文重新组织与手动校正未形成可采纳候选|⏸️|PASS[REV:271af53ebf46]|待验|[原U14真实失败待核](docs/features/t1321-graphic-reorganization-candidate-diagnosis.md)|两原终态无结构化可采纳候选，安全日志仅知executeExternalTaskTool冲突；先只读及受控诊断，具体tool/input/断言未知，不猜测修复或重发原任务。|

<a id="t1410-t-1300-e39f51078066"></a>
### T-1300 · 恢复Codex各能力可用性并落实已定位性能优化

原始七列行（说明与文档链接逐字保留）：

|T-1300|恢复Codex各能力可用性并落实已定位性能优化|⏸️|PASS[REV:6094ba8d7ed5]|待验|[本轮实现及分模块验收](docs/features/t1300-codex-functionality-and-performance.md)|用户授权实施T1299建议并重点复验选Codex后的对话/功能；先核真实配置路由与各能力，再窄修及优化，专用隔离数据，不批量销旧账、不安装发布。|

<a id="t1410-t-1297-ddbeb409b497"></a>
### T-1297 · 修复原生时间轴缩放滑块被全局方向键拦截

原始七列行（说明与文档链接逐字保留）：

|T-1297|修复原生时间轴缩放滑块被全局方向键拦截|📋|待审|待验|[T1296追加键盘复验](docs/verification/t1296/REPORT.md)|既有capture热键未避让role=slider，ArrowRight未改缩放；真实鼠标拖动持久化正常。保留失败，单独核修键盘边界。|

<a id="t1410-t-1292-4a5137b93f9a"></a>
### T-1292 · 核对合并后的全局对账失败并逐项归因

原始七列行（说明与文档链接逐字保留）：

|T-1292|核对合并后的全局对账失败并逐项归因|📋|待审|待验|[原32项现场失败](docs/features/t1292-post-integration-global-reconcile-findings.md)|原历史失败保留；T1300本轮32ERROR=原29身份+T1294/1296/1298 frontend收据路径漂移，精确原输出与归因引用见SPEC新增段；不重绑旧PASS、不冒全功能通过，身份相同不代根因相同。|

<a id="t1410-t-1291-0a4c12fc8dc1"></a>
### T-1291 · 核对旧原生编辑器验证器与当前715源码库存

原始七列行（说明与文档链接逐字保留）：

|T-1291|核对旧原生编辑器验证器与当前715源码库存|📋|待审|待验|[原额外验证真实失败](docs/features/t1291-legacy-native-verifier-source-inventory.md)|旧manifest及710模块/合同复制哨兵与715漂移，隔离组合仍FAIL；不补假模块/洗validator，不在固定本地包调用链，保独立欠债。|

<a id="t1410-t-1289-08e47bd0af85"></a>
### T-1289 · 修复原生构建清单随解包目录深度变化

原始七列行（说明与文档链接逐字保留）：

|T-1289|修复原生构建清单随解包目录深度变化|🔨|PASS[REV:92eba9d78497]|待验|[归档重建真实差异](docs/features/t1289-native-build-graph-virtual-module.md)|715源/F0一致，六runtime产物一致，第七清单虚拟module路径随目录深度变化；原FAIL保留，只核机械ID与归档元数据，不只补生成JSON。|

<a id="t1410-t-1288-cefc4a60a277"></a>
### T-1288 · 校准合并剪辑后的两个契约测试库存

原始七列行（说明与文档链接逐字保留）：

|T-1288|校准合并剪辑后的两个契约测试库存|🔨|PASS[REV:cf5a6070b2b5]|待验|[当场43项库存失败](docs/features/t1288-integrated-editing-contract-inventory.md)|R全契约43FAIL/475PASS保留；只核两个原测试427→429与已审script read/propose两路径，不改产品或放松穷尽。|

<a id="t1410-t-1287-957f4e6df109"></a>
### T-1287 · 闭合Growth全量回归的旧夹具与隔离缺项

原始七列行（说明与文档链接逐字保留）：

|T-1287|闭合Growth全量回归的旧夹具与隔离缺项|📋|待审|待验|[真实全量失败与边界](docs/features/t1287-growth-full-regression-fixtures.md)|原Python9FAIL/1189PASS、Node10FAIL/270PASS与对账10ERROR保留；0076启动head已窄修28PASS，余5测试/3hooks和Node实际清单先独审，不改经营安全来洗绿。|

<a id="t1410-t-1286-1b5765bbfb30"></a>
### T-1286 · 校准模型来源接线后的旧前端集成夹具

原始七列行（说明与文档链接逐字保留）：

|T-1286|校准模型来源接线后的旧前端集成夹具|🔨|PASS[REV:be715ef3b46d]|待验|[当场30项测试接线失败](docs/features/t1286-model-routing-frontend-fixtures.md)|全frontend31FAIL保留；仅三原测试30项，忠实legacy GET与固定110库存；旧write真实同步缺陷交T1278，不改产品或吞范围外radar1。|

<a id="t1410-t-1283-990e1c3d352a"></a>
### T-1283 · 核对Codex账号工作区路由预检拒绝并恢复粗剪

原始七列行（说明与文档链接逐字保留）：

|T-1283|核对Codex账号工作区路由预检拒绝并恢复粗剪|📋|待审|—|[真实预检与失败边界](docs/features/t1283-codex-account-routing-preflight.md)|新安全完整预检5RPC成功且两个host退出0；新独立作品真模型粗剪/试听门/采纳刷新PASS，仅删停顿0.96秒。原unknown保留，拒绝根因未复现，不改配置或自动重发。|

<a id="t1410-t-1279-d095198b5ccb"></a>
### T-1279 · 接入模型来源新迁移的真实数据库谱系护栏

原始七列行（说明与文档链接逐字保留）：

|T-1279|接入模型来源新迁移的真实数据库谱系护栏|🔨|PASS[REV:3056f3673e0a]|待验|[当场初始化失败与窄范围](docs/features/t1279-model-routing-migration-lineage.md)|原6FAIL保留；0135固定谱系窄修独评3056通过，W e81f80cf7完整PG/PGlite三组73PASS、退出清理闭合；主任务全功能与全局收尾未完成。|

<a id="t1410-t-1278-0ae2c1428cd6"></a>
### T-1278 · 统一激活授权并允许官方、自配和本地Codex按能力组合

原始七列行（说明与文档链接逐字保留）：

|T-1278|统一激活授权并允许官方、自配和本地Codex按能力组合|🔨|PASS[REV:c23accf0a926]|待验|[用户需求与验收](docs/features/t1278-unified-license-capability-routing.md)|cycle2独评583a通过；W03d60d39/Gbbf225eb已提交，Creator145/91/76、Growth122/销售23通过；设置浏览器15项retry0留图；全frontend原31与新4FAIL保留，新4串行14绿；R四包类型通过、合并回归在验；收尾两项用户已确认，cycle3新审在途；整包/App未验。|

<a id="t1410-t-1276-54c561feb01d"></a>
### T-1276 · 修复原片准备事务内根设置连接自等待

原始七列行（说明与文档链接逐字保留）：

|T-1276|修复原片准备事务内根设置连接自等待|⏸️|PASS[REV:f677c9cdf3ed]|待验|[当场超时与窄范围](docs/features/t1276-production-source-transaction-runtime.md)|cbe8ec195同tx修复、原请求probe/采纳及完整媒体旅程、真实偏好冻结已验；最新build/类型/timeout通过，全局仍原29ERROR；严格回执关联3个共享dirty路径，已登记阻断。|

<a id="t1410-t-1275-3120ebf346d6"></a>
### T-1275 · 排查剪辑验收隔离服务冷编译与数据库初始化超时

原始七列行（说明与文档链接逐字保留）：

|T-1275|排查剪辑验收隔离服务冷编译与数据库初始化超时|⏸️|—|待验|[实际阻断与范围](docs/features/t1275-editing-verification-runtime-timeouts.md)|原两轮超时保留；隔离服务/真实公共媒体旅程已恢复，最新build/类型/timeout通过，全局仍原29ERROR；严格frontend回执关联5个共享dirty路径，已登记阻断，不代签纯HEAD。|

<a id="t1410-t-1274-176244d443d7"></a>
### T-1274 · 参考ChatCut可复用模块重设计CreatorOS剪辑工作区与自然语言剪辑链路

原始七列行（说明与文档链接逐字保留）：

|T-1274|参考ChatCut可复用模块重设计CreatorOS剪辑工作区与自然语言剪辑链路|⏸️|PASS[REV:55a3f14a70a5]|待验|[SPEC](docs/features/t1274-chatcut-editing-redesign.md)|真实模型删除/重排复制、ASR词删、粗剪试听采纳、CLI/MCP/MP4、200%/dirty及T1285原CAS恢复均有证据；最新build通过，严格收尾仍有19个共享dirty路径，未代签纯HEAD或安装App。|

<a id="t1410-t-1277-6b4d51a4ed9e"></a>
### T-1277 · 核对原生AAC首尾有效样本与音画对齐

原始七列行（说明与文档链接逐字保留）：

|T-1277|核对原生AAC首尾有效样本与音画对齐|📋|—|待验|[当场旧内核对照](docs/features/t1277-native-aac-valid-samples.md)|旧83b与新候选AAC真实PCM逐字节相同，48@24画面2秒而AAC2.0898秒；保留原FAIL，先核priming/padding，不裁原音或冒全范围PASS。|

<a id="t1410-t-1273-d6021bc665a5"></a>
### T-1273 · CreatorOS反逆向加固严格零性能损耗

原始七列行（说明与文档链接逐字保留）：

|T-1273|CreatorOS反逆向加固严格零性能损耗|🔨|PASS[REV:f993e9496349]|待验|[SPEC](docs/features/t1273-release-anti-reverse-hardening.md)|仅7基线源码已落地，隔离9c70afc00+c98e7a958；既有Node10/Rust7/打包45通过，末笔新回归未跑；tar减37,607,996B/既有根104B签名；用户10/14暂缓验证，构建中断留缓存，App/200μs/总包未验；见t1273/RESUME。|

<a id="t1410-t-1271-b68fb0fc8ff6"></a>
### T-1271 · CreatorOS Codex调用不保存个人历史会话

原始七列行（说明与文档链接逐字保留）：

|T-1271|CreatorOS Codex调用不保存个人历史会话|🔨 待办|PASS[REV:b5247eee4711]|—|[用户确认与会话边界](docs/features/t1271-codex-ephemeral-sessions.md)| 两源临时会话已应用；共享100/100、owned31/31与类型/build/timeout/边界通过，提交2ab097673；全局对账在途，当前App未换包，原失败与限度见t1271/RESULT。 |

<a id="t1410-t-1265-163cedf5ce03"></a>
### T-1265 · 修复本地Codex结构化输出Schema适配导致真实400

原始七列行（说明与文档链接逐字保留）：

|T-1265|修复本地Codex结构化输出Schema适配导致真实400|🔨 待办|PASS[REV:54a830e5bcfc]|待验|[实际故障与范围](docs/features/t1265-codex-structured-output-schema-compatibility.md)|T1246当前新故障，原证据与失败保留；窄审后集中修复及完整公共链复验，原模型配置/归属与App未验不变。 新R f966公共provider19/Worker114实际PASS，但完整worker typecheck TS5097及异构schema泛型TS2345红已记；只在已审同域回归写集校正导入/泛型，原19断言及生产保持。|

<a id="t1410-t-1264-eec65b57989b"></a>
### T-1264 · 修复协议账本读取前Next元数据恢复顺序

原始七列行（说明与文档链接逐字保留）：

|T-1264|修复协议账本读取前Next元数据恢复顺序|🔨 待办|PASS[REV:363fd9378c93]|待验|[实际故障与范围](docs/features/t1264-protocol-ledger-next-closure-order.md)|T1246当前新故障，原证据与失败保留；窄审后集中修复及完整公共链复验，原模型配置/归属与App未验不变。|

<a id="t1410-t-1263-b448997cd984"></a>
### T-1263 · 修复协议验收替身与隔离临时根的归属校验冲突

原始七列行（说明与文档链接逐字保留）：

|T-1263|修复协议验收替身与隔离临时根的归属校验冲突|🔨 待办|PASS[REV:b4fda4422df6]|待验|[实际冲突与范围](docs/features/t1263-protocol-fixture-owned-temp-root.md)|db4669协议组提交disabled且无task；fixture os.tmpdir与launcher owned tmp前缀冲突，保原七项FAIL/栈缺失，独评后窄修归属守卫并公共链完整重验，不代签真实模型或App。|

<a id="t1410-t-1272-d9d3b550a8be"></a>
### T-1272 · 校准新增观测后的前端回归夹具与迁移库存

原始七列行（说明与文档链接逐字保留）：

|T-1272|校准新增观测后的前端回归夹具与迁移库存|🔨|PASS[REV:57f7140fcca6]|待验|[当场六项夹具红](docs/features/t1272-current-observability-frontend-test-fixtures.md)|当前0134末条及新共享getter使旧frontend6红；只审两原测试，保81设置/4完整冻结Worker回归，Main109与R108分开，不改产品或删错误。|

<a id="t1410-t-1270-bacd9261e4f6"></a>
### T-1270 · 校准当前观测迁移后的原回归库存

原始七列行（说明与文档链接逐字保留）：

|T-1270|校准当前观测迁移后的原回归库存|🔨|PASS[REV:ed99956c0313]|待验|[当场三项库存红](docs/features/t1270-current-observability-migration-test-inventory.md)|当前合法0134使journal109，原三尾库存断言仍108；只审两原测试并保旧迁移/归属/前缀，不删foreign生产，Main与108打包树分开绑定。|

<a id="t1410-t-1268-0c38a3ee9e19"></a>
### T-1268 · 闭合集成契约测试库存与手工保存类型

原始七列行（说明与文档链接逐字保留）：

|T-1268|闭合集成契约测试库存与手工保存类型|🔨|PASS[REV:b9d6a2958cc7]|待验|[当场43失败与类型红](docs/features/t1268-integrated-contract-inventory-and-manual-save-test.md)|只补三原测试：已有日志三operation穷尽登记、428库存与原manual strict parse；不删功能/断言，保当场FAIL，全量正常复验后续新包。|

<a id="t1410-t-1267-cb9d8a12c49a"></a>
### T-1267 · 校准Pi公共聊天验收能力键与HTTP最终审计

原始七列行（说明与文档链接逐字保留）：

|T-1267|校准Pi公共聊天验收能力键与HTTP最终审计|🔨|PASS[REV:cc01d69f8185]|待验|[真实夹具失配与范围](docs/features/t1267-pi-public-fixture-capability-and-http-audit.md)|原Pi任务waiting_user/HTTP数UNKNOWN保；项目主能力topic.generate而夹具配copilot.assist，独评后只修夹具与finally审计，不改产品resolver或旧任务，新公共红绿及新包复验。|

<a id="t1410-t-1266-e938b711ba37"></a>
### T-1266 · 核对并修复设置偏好首载时ASR菜单不可达

原始七列行（说明与文档链接逐字保留）：

|T-1266|核对并修复设置偏好首载时ASR菜单不可达|🔨 待办|PASS[REV:bda5b2a67bbd]|待验|[真实失败与窄范围](docs/features/t1266-asr-menu-preference-layout-race.md)|原93普通Qwen点击120秒失败，异步模型区插入后菜单出屏；保原FAIL，oil局部公共对照复现、独评后最小修复，不猜全局浮层或增加模型配置。|

<a id="t1410-t-1269-7af4945671de"></a>
### T-1269 · 补齐原持久分场失败的可读诊断与原任务重试验收

原始七列行（说明与文档链接逐字保留）：

|T-1269|补齐原持久分场失败的可读诊断与原任务重试验收|🔨|PASS[REV:03376b43b303]|待验|[原14失败与精确范围](docs/features/t1269-managed-video-failure-diagnostic.md)|持久failed在onRuntime后停轮询，只有legacy诊断卡；保原FAIL及旧恢复断言，独评后窄补同ID脱敏错误与公开retry复验，不造新任务或放宽状态。|

<a id="t1410-t-1261-fbb4a8aa9e14"></a>
### T-1261 · 修复开发包验收暴露的运行时缺陷与用例合同

原始七列行（说明与文档链接逐字保留）：

|T-1261|修复开发包验收暴露的运行时缺陷与用例合同|🔨 待办|PASS[REV:cd5f6ec85eda]|待验|[实际故障闭包](docs/features/t1261-runtime-acceptance-defect-closure.md)|T1246后续轮确认native结果/状态ACK/选题确认/Copilot/Doocs缺陷及旧聊天fixture失配；原回执保，独立初评后9源集中修、便携回归、新包全量复验，App未验。 Pi新隔离公共提交前双输入严格定位冲突（0任务/本轮HTTP0）已记，helper按唯一AI助手dialog窄审；不冒目标能力RED。 新Pi同四ID公共聊天实际提交后执行准备failed/CHAT_WORKER_INPUT_UNAVAILABLE、calls0/HTTP0且完整关闭；底层cause未记录，目标能力RED未证，保本轮失败待私有诊断；R整合34源及1测试类型修正clean64ca6ad；开发包45基础/8全绑定/只读挂载实通过，完整浏览器复验待完成。|

<a id="t1410-t-1260-8fd20f43e13f"></a>
### T-1260 · 核对T1255审核绑定生成PROJECT造成收据漂移

原始七列行（说明与文档链接逐字保留）：

|T-1260|核对T1255审核绑定生成PROJECT造成收据漂移|📋|—|—|[实际对账失败](docs/features/t1260-generated-project-review-binding.md)|T1259完整对账26ERROR，25与旧回执逐字一致；另T1255绑定动态PROJECT已过期，保旧审核和事实，不重哈希洗绿，核稳定宪法与真实重新评审。|

<a id="t1410-t-1259-c569feaaa2c4"></a>
### T-1259 · 排查用户1.12版扫码绑定与配置同步异常并修复确认缺陷

原始七列行（说明与文档链接逐字保留）：

|T-1259|排查用户1.12版扫码绑定与配置同步异常并修复确认缺陷|✅ 待办|—|—|[排查与修复范围](docs/features/t1259-user-binding-config-repair.md)|用户确认1.12为当前、1.11为旧版；核版本与实际失败链，缺陷先RED再修，保原账号登录态与校验，不重发真实任务或发布。|

<a id="t1410-t-1258-3dd1e6183781"></a>
### T-1258 · 分析用户2026-10-12四份加密运行日志异常

原始七列行（说明与文档链接逐字保留）：

|T-1258|分析用户2026-10-12四份加密运行日志异常|✅ 待办|—|—|[诊断范围](docs/features/t1258-user-log-diagnosis.md)|仅本地只读解密四份附件，按时间与影响分析失败、恢复及证据缺口，不改产品、不重发用户任务。|

<a id="t1410-t-1257-fa86224da592"></a>
### T-1257 · 将当前已安装版本制作本地签名安装包

原始七列行（说明与文档链接逐字保留）：

|T-1257|将当前已安装版本制作本地签名安装包|✅ 待办|—|—|[范围与验收](docs/features/t1257-installed-local-signed-installer.md)|用户明确只做本地签名、不提交Apple；冻结当前安装1.2.0 arm64副本，保运行时字节，签名封DMG与挂载核验，不重建未提交源码。|

<a id="t1410-t-1255-a88f3dc3cf4c"></a>
### T-1255 · 加密日志直传Growth、异常采集与运行指标观测

原始七列行（说明与文档链接逐字保留）：

|T-1255|加密日志直传Growth、异常采集与运行指标观测|🔨 待办|PASS[REV:ec21be841d64]|待验|[原直传合同](docs/features/t1255-reporting-full-delivery.md) · [观测方案候选](docs/features/t1255-observability-research.md)|10/24公开get成功，仍HTTP422/待发4399、每日排期保持，最近成功仍10/18；原Growth空间缺失，owner/完整解密/指标待核。保10/21观察失败及T1378/Growth T248本地39PASS候选，不追签线上首因、不催传或签完成，见desktop-agent-live/RESULT.md。 |

<a id="t1410-t-1256-48aa36c9f07e"></a>
### T-1256 · 修复Doocs静态原适配三处无用绑定编译失败

原始七列行（说明与文档链接逐字保留）：

|T-1256|修复Doocs静态原适配三处无用绑定编译失败|🔨 待办|PASS[REV:b3d116e19a48]|待验|[真实类型红与精确范围](docs/features/t1256-doocs-static-unused-bindings-build-closure.md)|T1254 V13两根24/slow/types及nativebuild已过，static完整原build三TS6133真失败；仅核并删三无用声明，保模板/原命令/旧FAIL，独评后续原余步骤。|

<a id="t1410-t-1254-3351818a3fa5"></a>
### T-1254 · 闭合内置Doocs两份真实请求30秒默认预算与源码交付一致性

原始七列行（说明与文档链接逐字保留）：

|T-1254|闭合内置Doocs两份真实请求30秒默认预算与源码交付一致性|🔨 待办|PASS[REV:1ebe2f90de0b]|待验|[当场两红与待评边界](docs/features/t1254-doocs-request-budget-and-source-closure.md)|完整Gate剩两真实网络abort；先核共享fetch原源/两包/使用路径与重建来源，独评后修，不扩动画豁免或只改产物洗绿。|

<a id="t1410-t-1253-c11637a88ea3"></a>
### T-1253 · 闭合原Worker夹具可信回执与未知恢复验收

原始七列行（说明与文档链接逐字保留）：

|T-1253|闭合原Worker夹具可信回执与未知恢复验收|🔨 待办|PASS[REV:e890e7d4ffac]|待验|[真实8红与精确范围](docs/features/t1253-worker-fixture-receipt-and-unknown-closure.md)|原9文件46例38PASS8FAIL；仅ports/hooks/draft三原测试，核429 superseded、partial与缺usage unknown，先独评不改生产/洗期望。|

<a id="t1410-t-1246-be0665f51525"></a>
### T-1246 · 整合完成会话并打开发包及浏览器和App逐项验收

原始七列行（说明与文档链接逐字保留）：

|T-1246|整合完成会话并打开发包及浏览器和App逐项验收|🔨 待办|PASS[REV:883f7fe733ba]|待验|[需求与验收标准](docs/features/t1246-integrated-dev-package-acceptance.md)|64ca开发包保留；原浏览器77/170快照71PASS6FAIL，余93UNKNOWN；旧临时根/PID已不存在，不能冒正常关闭，须新隔离复验。缺原素材六项按用户跳过，App未验，不签全绿。|

<a id="t1410-t-1252-410aff084738"></a>
### T-1252 · 闭合CLI/MCP HTTP默认300秒早于合法原生RPC的消费者预算

原始七列行（说明与文档链接逐字保留）：

|T-1252|闭合CLI/MCP HTTP默认300秒早于合法原生RPC的消费者预算|🔨 待办|PASS[REV:5ceaed23e00c]|待验|[真实缺口与待补合同](docs/features/t1252-cli-http-consumer-budget-closure.md)|真实Node25.9/Undici默认300s而Native完整RPC420s；先盘点专用非全局transport、完整串行与取消/unknown，再独评和实际慢公共链，不用父测试预算代签。|

<a id="t1410-t-1250-aca6c77d3d02"></a>
### T-1250 · 闭合真实短执行预算与静态消费者误判

原始七列行（说明与文档链接逐字保留）：

|T-1250|闭合真实短执行预算与静态消费者误判|🔨 待办|PASS[REV:73326e8df3e3]|待验|[精确范围与验收](docs/features/t1250-positive-timeout-consumer-closure.md)|两次完整门真实22FAIL：11正执行/观察、1idle与10vendor误报；先独评，保原deadline/取消/归属/未知与完整库存，再公共链复验。|

<a id="t1410-t-1251-7ab2b2acff3b"></a>
### T-1251 · 保留结构化生成可信失败状态并校准原受控崩溃验收

原始七列行（说明与文档链接逐字保留）：

|T-1251|保留结构化生成可信失败状态并校准原受控崩溃验收|🔨 待办|PASS[REV:41b45f1c67d4]|待验|[实际9红与精确范围](docs/features/t1251-chat-generation-failure-and-fixture-closure.md)|真实原21中9红；429可信retry_wait丢失为unknown生产缺陷，另串行屏障/跨case污染与continuous入口待窄校准，先独评不洗期望。|

<a id="t1410-t-1249-40897db92e17"></a>
### T-1249 · 校准持久聊天原八例的当前受控回执合同

原始七列行（说明与文档链接逐字保留）：

|T-1249|校准持久聊天原八例的当前受控回执合同|🔨 待办|PASS[REV:19cbaf3743b6]|—|[精确合同](docs/features/t1249-durable-chat-current-receipts.md)|真实原8例3PASS5FAIL；只校准五族新读/重放、末失败partial与账本UI投影，不改生产或删除原安全断言。|

<a id="t1410-t-1247-c93d3a1f9aeb"></a>
### T-1247 · 修复超时门完整Git库存读取缓冲区溢出

原始七列行（说明与文档链接逐字保留）：

|T-1247|修复超时门完整Git库存读取缓冲区溢出|🔨 待办|PASS[REV:b75c6d75921d]|—|[精确范围](docs/features/t1247-timeout-git-inventory-buffer.md)|T1246真实Gate在git ls-files的默认1MiB缓冲ENOBUFS；独評只增有界缓冲与120秒命令预算，保原规则/完整扫描/非零失败。|

<a id="t1410-t-1248-a390fbeeb7ae"></a>
### T-1248 · 恢复已知旧冻结系统候选工具的严格合同兼容

原始七列行（说明与文档链接逐字保留）：

|T-1248|恢复已知旧冻结系统候选工具的严格合同兼容|🔨 待办|PASS[REV:2d9887301cb3]|—|[真实失败与精确合同](docs/features/t1248-frozen-system-action-compatibility.md)|真实旧104→当前133原4例1PASS3FAIL，旧preferences action新增引擎字段哈希漂移；只内置可信固定旧schema，完整工具定义/归属/回执保护不降级，先独評。|

<a id="t1410-t-1238-0a47a576e24a"></a>
### T-1238 · 本地Codex统一执行文本与生图并免独立模型配置

原始七列行（说明与文档链接逐字保留）：

|T-1238|本地Codex统一执行文本与生图并免独立模型配置|🔨 待办|PASS[REV:6b70a2a85595]|待验|[用户确认与合同](docs/features/t1238-codex-unified-text-image-engine.md)|用户明确继续实现：Codex承担文本与生图，页面/子任务/后台统一路由，无供应商回退；先独评合同，保旧任务与原失败。 已整合本地源码；独立工作树taskctl严格完成77b939320ddf，共享43项/真实10项通过。他人未提交改动保留，不代签共享HEAD；见GATES。|

<a id="t1410-t-1245-1a9b0cd5bc6a"></a>
### T-1245 · 修复自动化窄窗口筛选挤出与任务查看不便

原始七列行（说明与文档链接逐字保留）：

|T-1245|修复自动化窄窗口筛选挤出与任务查看不便|🔨 待办|—|待验|[原图与范围](docs/features/t1245-automations-narrow-layout.md)|3938操作PASS但390原图账号下拉挤出、快捷标题逐字；保原结果，oil最小响应式独评后修，不删功能或代签窄屏可达。|

<a id="t1410-t-1244-59b0aa432565"></a>
### T-1244 · 验收自动化立即运行的准入与授权等待

原始七列行（说明与文档链接逐字保留）：

|T-1244|验收自动化立即运行的准入与授权等待|🔨 待办|—|待验|[公开链与验收](docs/features/t1244-automation-run-now-login-wait.md)|现四浏览器case仅禁用列表，runNow UI尚未验；fresh无绑定账号一次真点，核同run/AI/execution和授权等待，先独评，不把缺凭据签成采集成功。|

<a id="t1410-t-1243-319afc8be488"></a>
### T-1243 · 复验项目稿面视频素材的真实预览

原始七列行（说明与文档链接逐字保留）：

|T-1243|复验项目稿面视频素材的真实预览|🔨 待办|—|待验|[原失败与精确范围](docs/features/t1243-draft-video-preview-recheck.md)|原视频卡显示点击阅读，旧双击提示断言先失败；先核已确认单击/预览合同和预算，保URL惰性、真实解码、键盘/刷新/视口及原FAIL，不洗产品。|

<a id="t1410-t-1239-bdbb508a0d6a"></a>
### T-1239 · 验证复盘经验采纳与知识库回流并核候选裁决可见性

原始七列行（说明与文档链接逐字保留）：

|T-1239|验证复盘经验采纳与知识库回流并核候选裁决可见性|🔨 待办|—|待验|[范围与验收](docs/features/t1239-review-learning-public-acceptance.md)|旧experience独立页断言已退役；聊天采纳与持久candidate路径不同，先准确候选及独评，再实际UI/公开同ID/知识库只读，保原FAIL，不伪造评论或指标。|

<a id="t1410-t-1241-14d0d9c2e498"></a>
### T-1241 · 排查复盘页浏览器验收时开发编译器崩溃

原始七列行（说明与文档链接逐字保留）：

|T-1241|排查复盘页浏览器验收时开发编译器崩溃|🔨 待办|—|待验|[真实日志与处置边界](docs/features/t1241-review-dev-compiler-panic.md)|3931公开创建四次200后review冷编译Turbopack Rust panic；保自然失败，先核锁定版本、缓存及进程归属，独评可逆处置后同源码另验，不改断言或猜业务坏。|

<a id="t1410-t-1242-488949b1da6f"></a>
### T-1242 · 核对复盘刷新后纯组账号镜像的测试断言

原始七列行（说明与文档链接逐字保留）：

|T-1242|核对复盘刷新后纯组账号镜像的测试断言|🔨 待办|—|待验|[原失败与精确范围](docs/features/t1242-review-pure-group-cookie-assertion.md)|3933已到四张桌面/窄图，刷新后空账号cookie实际被清除，原断言要求空字符串；保FAIL，核真实消费者后独评空或不存在但严格拒绝非空账号，其余断言全留。|

<a id="t1410-t-1240-ba682fe974c4"></a>
### T-1240 · 复验素材选择器全库分页与真实照片操作

原始七列行（说明与文档链接逐字保留）：

|T-1240|复验素材选择器全库分页与真实照片操作|🔨 待办|—|待验|[原失败与范围](docs/features/t1240-asset-picker-public-recheck.md)|原140图上传PUT失败未到选择器；先准确诊断和预算独评，保140分页/错组/预览/取消/焦点/原FAIL，不改断言造绿。|

<a id="t1410-t-1227-cf0551f30f6e"></a>
### T-1227 · 实际核验本地执行引擎全功能及免模型配置落地情况

原始七列行（说明与文档链接逐字保留）：

|T-1227|实际核验本地执行引擎全功能及免模型配置落地情况|⏸️ 待办|—|—|[验收范围](docs/features/t1227-local-engine-full-capability-verification.md)|用户已明确本地Codex；无文本配置仍有34条文本能力不可用，统一路由和全链实测未完成，保真实失败，不代签可用。|

<a id="t1410-t-1228-ca9648887552"></a>
### T-1228 · 核对审核和发布物料子任务的父执行partial结果

原始七列行（说明与文档链接逐字保留）：

|T-1228|核对审核和发布物料子任务的父执行partial结果|📋 待办|—|—|[当场失败](docs/features/t1228-chat-child-partial-verification.md)|T1227前端127PASS2FAIL；按索引定位为审核/发布物料empty空稿拒绝族，正常与准备恢复均PASS；核partial合同与旧父成功断言，不猜Codex或洗绿。|

<a id="t1410-t-1229-32f94252c793"></a>
### T-1229 · 核对内容雷达选题生成持续无效输出及检查点恢复

原始七列行（说明与文档链接逐字保留）：

|T-1229|核对内容雷达选题生成持续无效输出及检查点恢复|🔨 待办|—|—|[当场失败](docs/features/t1229-radar-topic-output-recovery-diagnosis.md)|3914原采集25条成功，选题仍OUTPUT_INVALID；保原任务/失败，先核真实账本、恢复与模型替身，未到项目升级。|

<a id="t1410-t-1231-5145b8509b21"></a>
### T-1231 · 核对雷达升级项目后原账号读取404的范围分歧

原始七列行（说明与文档链接逐字保留）：

|T-1231|核对雷达升级项目后原账号读取404的范围分歧|🔨 待办|—|待验|[当场失败](docs/features/t1231-radar-promoted-project-scope.md)|3918正文生成后已导航新项目，原account header的projects.get却404；保原FAIL/图/trace，先核UI创建与读取真实组，不放宽归属或洗断言。|

<a id="t1410-t-1233-c239d37752ce"></a>
### T-1233 · 校准雷达正文模型替身并验证正文真实贯通

原始七列行（说明与文档链接逐字保留）：

|T-1233|校准雷达正文模型替身并验证正文真实贯通|🔨 待办|—|待验|[当场截图](docs/features/t1233-radar-body-fixture-protocol.md)|3919组内立项全程PASS，但实图正文是旧mock分析JSON；保原PASS/图，先核协议与公开正文/种子，再独评窄校准，不代签真实模型或洗产品。|

<a id="t1410-t-1232-12dc28aea955"></a>
### T-1232 · 验证设置对话框分类交互与公开读回持久性

原始七列行（说明与文档链接逐字保留）：

|T-1232|验证设置对话框分类交互与公开读回持久性|🔨 待办|—|待验|[原失败与范围](docs/features/t1232-settings-dialog-public-verification.md)|原设置整页/八横向tab断言与已确认Dialog冲突；先核获批分类操作、独评窄校准，保T606/原FAIL，不把七项现状当授权或mock当真实上游。|

<a id="t1410-t-1235-fb9509eab801"></a>
### T-1235 · 修复外观密度关闭设置后刷新未恢复

原始七列行（说明与文档链接逐字保留）：

|T-1235|修复外观密度关闭设置后刷新未恢复|🔨 待办|—|待验|[真实失败与修复](docs/features/t1235-density-reload-persistence.md)|3921外观例自然FAIL：紧凑已保存，accounts刷新html丢data-density；保原图/trace/120秒等待，修全局首帧与挂载恢复，不改原用例洗绿。|

<a id="t1410-t-1236-736c161d14eb"></a>
### T-1236 · 修复模型保存并测试成功后界面结果丢失

原始七列行（说明与文档链接逐字保留）：

|T-1236|修复模型保存并测试成功后界面结果丢失|🔨 待办|—|待验|[真实失败与诊断](docs/features/t1236-model-probe-visible-result.md)|3921模型put/probe和单次SSE均成功，界面测试结果却消失；先核保存刷新/组件实例与回执生命周期，不重发探针或改原断言洗绿。|

<a id="t1410-t-1237-b8b2d2f0863e"></a>
### T-1237 · 修复设置窄窗口分类栏挤压内容与裁切

原始七列行（说明与文档链接逐字保留）：

|T-1237|修复设置窄窗口分类栏挤压内容与裁切|🔨 待办|—|待验|[真实截图与范围](docs/features/t1237-settings-narrow-layout.md)|root实际看3921的390px昵称及RedFox图，分类固定宽度挤内容成窄列且裁切；保原操作PASS与原图，沿oil重新适配窄窗口，不用只操作成功代签视觉。|

<a id="t1410-t-1234-99867fa801e3"></a>
### T-1234 · 验证账号组下Skill定制按钮的真实可用性

原始七列行（说明与文档链接逐字保留）：

|T-1234|验证账号组下Skill定制按钮的真实可用性|🔨 待办|—|待验|[静态疑点与验收](docs/features/t1234-group-skill-customize-availability.md)|服务组ctx投影accountId=null/groupId，UI仍按accountId非空允许定制；先核official/用户组覆盖合同并实际UI，不改owner/status或走后台造绿。|

<a id="t1410-t-1230-d1e0c9c12978"></a>
### T-1230 · 修正素材空态仍宣称按抖音号隔离的旧文案

原始七列行（说明与文档链接逐字保留）：

|T-1230|修正素材空态仍宣称按抖音号隔离的旧文案|🔨 待办|—|待验|[实际截图与窄范围](docs/features/t1230-assets-empty-workspace-copy.md)|3915纯组B真实0素材，空态却写抖音号；保原图，窄改账号组文案，等待素材旅程结束后实施。|

<a id="t1410-t-1226-d17c2b20f68a"></a>
### T-1226 · 补齐浏览器上传验收媒体目录隔离

原始七列行（说明与文档链接逐字保留）：

|T-1226|补齐浏览器上传验收媒体目录隔离|🔨 待办|—|—|[诊断与范围](docs/features/t1226-playwright-media-root-isolation.md)|现仅隔离DB/auth，缺配置媒体根仍在用户目录；先独评默认env及测试根，不动HOME/迁移/真实库。|

<a id="t1410-t-1225-5726b468afe5"></a>
### T-1225 · 补齐素材中心有数据画廊与选择详情的真实上传夹具

原始七列行（说明与文档链接逐字保留）：

|T-1225|补齐素材中心有数据画廊与选择详情的真实上传夹具|🔨 待办|—|—|[范围与验收](docs/features/t1225-assets-gallery-real-fixtures.md)|原两例空库无夹具；独评后公开上传四PNG，保原断言/失败，验选取详情、刷新、空态及错组。|

<a id="t1410-t-1224-88af3486ee49"></a>
### T-1224 · 校准内容雷达公共旅程的短测试预算与证据输出

原始七列行（说明与文档链接逐字保留）：

|T-1224|校准内容雷达公共旅程的短测试预算与证据输出|🔨 待办|—|—|[范围与验收](docs/features/t1224-radar-e2e-budget-evidence.md)|独评后仅校准测试预算及证据目录，再跑原公共旅程。 [原记录](BACKLOG-details.md#b-331e63446d8d)|

<a id="t1410-t-1223-a3a1ee5c7e06"></a>
### T-1223 · 修复截图总览把历史运行记录当用例数及重复锚点

原始七列行（说明与文档链接逐字保留）：

|T-1223|修复截图总览把历史运行记录当用例数及重复锚点|🔨 待办|—|—|[范围与验收](docs/features/t1223-verification-gallery-record-identity.md)|真实历史记录误计及重复锚点已独评，报告生成器正在RED/GREEN验证；保全部旧图/结果。 [原记录](BACKLOG-details.md#b-43efc28c7f95)|

<a id="t1410-t-1222-fb22e5f17b3e"></a>
### T-1222 · 核对文章图文编导的空态与功能指引脱离当前稿件

原始七列行（说明与文档链接逐字保留）：

|T-1222|核对文章图文编导的空态与功能指引脱离当前稿件|📋 待办|—|待验|[截图与范围](docs/features/t1222-director-context-guidance.md)|文章图文编导固定全局指引；真实editorTarget会在发送前准备。待核功能目录、独评和候选链。 [原记录](BACKLOG-details.md#b-7cb36965e02b)|

<a id="t1410-t-1221-9b723c0f4141"></a>
### T-1221 · 校准双工作区切换端到端旧账号选择器

原始七列行（说明与文档链接逐字保留）：

|T-1221|校准双工作区切换端到端旧账号选择器|🔨 待办|—|—|[范围与验收](docs/features/t1221-group-switch-e2e.md)|原两账号与项目、A-B-A刷新/镜像、双错组404实际3913通过；独评PASS，全局收尾待复核。 [原记录](BACKLOG-details.md#b-5c5bdde4c800)|

<a id="t1410-t-1217-b26cbbc5c5bd"></a>
### T-1217 · 修复内容雷达来源任务在旧账号和冻结组范围间卡住

原始七列行（说明与文档链接逐字保留）：

|T-1217|修复内容雷达来源任务在旧账号和冻结组范围间卡住|🔨 待办|—|—|[诊断与验收](docs/features/t1217-source-sync-workspace.md)|旧回归76及新增41通过；终审发现拒绝分类和删除绑定，负族修复中。 [原记录](BACKLOG-details.md#b-f2fe4887cb75)|

<a id="t1410-t-1207-3017c397085a"></a>
### T-1207 · 用 Playwright/App 自动化对全功能建立逐项验收并留图

原始七列行（说明与文档链接逐字保留）：

|T-1207|用 Playwright/App 自动化对全功能建立逐项验收并留图|🔨 待办|—|待验|[验收范围与路径](docs/features/t1207-full-feature-acceptance.md)|原全量120例73通过39失败8超时；继续逐功能隔离E2E留图，真人平台/模型及原生App另验。 [原记录](BACKLOG-details.md#b-50cf413f8280)|

<a id="t1410-t-1208-4f0d781683b0"></a>
### T-1208 · 复核T-1207暴露的浏览器功能失败并修复确认缺陷

原始七列行（说明与文档链接逐字保留）：

|T-1208|复核T-1207暴露的浏览器功能失败并修复确认缺陷|🔨 待办|—|待验|[复核范围与验收标准](docs/features/t1208-t1207-e2e-failure-triage.md)|复现原39失败8超时；剪辑恢复/素材Tab等已有窄回归通过，其余逐例定因，历史失败全部保留。 [原记录](BACKLOG-details.md#b-ba8271fca89d)|

<a id="t1410-t-1199-9ef1ed7c20b5"></a>
### T-1199 · 查明并修复账号组内其他已绑定媒体定时任务不可见

原始七列行（说明与文档链接逐字保留）：

|T-1199|查明并修复账号组内其他已绑定媒体定时任务不可见|🔨 待办|—|待验|[SPEC](docs/features/t1199-bound-platform-scheduled-visibility.md)|用户本轮安装验收：其他已绑定媒体定时任务未显示。先公开只读核真实绑定、任务及页面筛选，再限定修复；保账号归属、原任务ID/排期/历史，不重开暂停研究或自动重复采集。|

<a id="t1410-t-1200-57bbc6121988"></a>
### T-1200 · 整体重设计知识库工作区并统一新旧操作入口

原始七列行（说明与文档链接逐字保留）：

|T-1200|整体重设计知识库工作区并统一新旧操作入口|🔨 待办|—|待验|[SPEC](docs/features/t1200-knowledge-workspace-redesign.md)|用户明确拒绝新旧UI拼接、未铺满与当前排版，要求整体重新设计。沿已认可原版品牌及oil-ui-pro，统一资料浏览、检索、阅读、录入、引用与经验入口，真实视觉/操作验证，不迁移或删除现有知识数据。|

<a id="t1410-t-1201-26c05c336c50"></a>
### T-1201 · 核对知识图谱错误提示回归的旧原始异常断言

原始七列行（说明与文档链接逐字保留）：

|T-1201|核对知识图谱错误提示回归的旧原始异常断言|🔨 待办|—|—|[实际诊断](docs/features/t1201-knowledge-graph-error-contract.md)|T1200实际知识回归19文件148例中147PASS、1FAIL；原图谱测试期望原始无LLM凭据字符串，当前组件显示人话错误。保失败，先核真实错误合同，不削弱断言或改产品洗绿。|

<a id="t1410-t-1202-fc9802389322"></a>
### T-1202 · 核对自动化复杂排期编辑的旧术语断言

原始七列行（说明与文档链接逐字保留）：

|T-1202|核对自动化复杂排期编辑的旧术语断言|🔨 待办|—|—|[实际诊断](docs/features/t1202-automation-cadence-error-contract.md)|T1199自动化原回归113PASS6FAIL，五例为本任务多平台文案已授权变化，另复杂cron旧期待无法反解而实际已有用户友好说明。保失败，先核合同，不改时间或删除保存保护。|

<a id="t1410-t-1203-60a3db6190b3"></a>
### T-1203 · 消除自动化既有React编译与effect静态检查欠债

原始七列行（说明与文档链接逐字保留）：

|T-1203|消除自动化既有React编译与effect静态检查欠债|📋 待办|—|待验|[实际诊断](docs/features/t1203-automation-react-lint-debt.md)|T1199实lint触发旧effects/ref等错误，HEAD stdin基线也失败。保真实结果，新增依赖/声明先修，既有静态债单列；不得关闭规则或删切组/轮询保护洗绿。|

<a id="t1410-t-1204-492aa9fc0474"></a>
### T-1204 · 核对本轮全局对账29项失败及新增触发项

原始七列行（说明与文档链接逐字保留）：

|T-1204|核对本轮全局对账29项失败及新增触发项|🔨 待办|—|—|[实际诊断](docs/features/t1204-current-reconcile-failures.md)|多次全局对账失败原日志保留；已机械归档完成行，稳定树仍需完整非concise逐根因核对。 [原记录](BACKLOG-details.md#b-577cb0da68f4) T-1238收尾实测保留22条范围外静态短超时、T-1026 write_set进度生成失败；完整全量对账原回执见docs/verification/t1238/reconcile-final.txt，禁止把本任务通过扩写为全局全绿。 本轮完整非concise55检查实完成29ERROR/自然1且资源全闭，25逐字旧债；新报LED046/048/054/061四门、innercause UNKNOWN，LED053实持守，见docs/verification/t1204/current-20261013-actual-full-29。 独占原四门诊断780通过/5失败/5原skip，4短预算及1握手前置；完整关闭/1694源不变，原全局29仍保，见current-four-original-diagnostic。|

<a id="t1410-t-1197-981e6e25bafa"></a>
### T-1197 · 核对旧外部MCP窄权限配对来源与当前账号组兼容

原始七列行（说明与文档链接逐字保留）：

|T-1197|核对旧外部MCP窄权限配对来源与当前账号组兼容|📋 待办|—|待验|[SPEC](docs/features/t1197-external-agent-pairing-source-convergence.md)|T1080独立分支审计实发现71d2cc77未投用配对源码缺口；原来源与27文件保留，先核授权/账号组/凭据及0101同号迁移，不恢复已淘汰ACP、不假称全CLI等价窄grant。|

<a id="t1410-t-1196-24dc3b708752"></a>
### T-1196 · 排查新安装版启动配置同步502与运行摘要拒绝

原始七列行（说明与文档链接逐字保留）：

|T-1196|排查新安装版启动配置同步502与运行摘要拒绝|📋 待办|—|—|[实际诊断](docs/features/t1196-installed-config-sync-502.md)|完整范围、失败与待验条件见 [原记录](BACKLOG-details.md#b-bc11f0a7b5b2)。|

<a id="t1410-t-1193-54ecf2a7db67"></a>
### T-1193 · 核对结果待确认时的重复发送暗示与恢复状态可读性

原始七列行（说明与文档链接逐字保留）：

|T-1193|核对结果待确认时的重复发送暗示与恢复状态可读性|📋 待办|—|—|[实际诊断](docs/features/t1193-copilot-unknown-request-presentation.md)|fresh视觉及独立receipt确认等待回执时同原话预填、生成disabled=false；POST仍1，未签重复请求。另核真实字号与短高分段阅读，先精确独评，不清新草稿或阻断合法创作。|

<a id="t1410-t-1192-fa4d6b750e19"></a>
### T-1192 · 核对作品精调公共链的消息结果断言

原始七列行（说明与文档链接逐字保留）：

|T-1192|核对作品精调公共链的消息结果断言|📋 待办|—|—|[实际诊断](docs/features/t1192-work-editor-message-outcome-diagnosis.md)|当场公共链11PASS4FAIL；联合两例归T1092，另Pi/Codex精调完整output相等失败。先核可信回执投影与长候选正文，不删除回执/schema/完整性保护洗绿。|

<a id="t1410-t-1191-1bf87b49a7e9"></a>
### T-1191 · 核对编导发送前准备失败与恢复入口

原始七列行（说明与文档链接逐字保留）：

|T-1191|核对编导发送前准备失败与恢复入口|🔨 待办|PASS[REV:ad518ff0cf03]|—|[实际诊断](docs/features/t1191-pre-submit-copilot-recovery-diagnosis.md)|T1187接口校准后原20例14PASS6FAIL；首条消息未发时准备错误提示自动恢复，effect却要求已有消息。核可信准备/提交状态及原任务恢复，不改名宽松化断言。|

<a id="t1410-t-1189-398f2c5a01d7"></a>
### T-1189 · 核对聊天子进程状态与取消的七项当前失败

原始七列行（说明与文档链接逐字保留）：

|T-1189|核对聊天子进程状态与取消的七项当前失败|📋 待办|—|—|[实际诊断](docs/features/t1189-chat-worker-entry-current-state-diagnosis.md)|原LED054前25PASS5条件跳过、Worker30PASS、后66PASS7FAIL；核denied/unknown/revoked/login/pause真实状态和调用次数，不猜单一根因或放宽终态/取消。|

<a id="t1410-t-1188-78c886b4274b"></a>
### T-1188 · 核对雷达活动任务期间的采纳保护断言

原始七列行（说明与文档链接逐字保留）：

|T-1188|核对雷达活动任务期间的采纳保护断言|📋 待办|—|—|[实际诊断](docs/features/t1188-radar-active-task-adoption-test-diagnosis.md)|原LED042合同3/后端4PASS、雷达58PASS3FAIL；旧用例要隐藏采纳按钮，DOM实际disabled。先核已确认呈现与真实活动保护，不宽松断言、不改产品或guard。|

<a id="t1410-t-1182-a5b23c1d93d6"></a>
### T-1182 · 区分隐藏文件注入与真实上传按钮的刷新等待

原始七列行（说明与文档链接逐字保留）：

|T-1182|区分隐藏文件注入与真实上传按钮的刷新等待|🔨 待办|PASS[REV:456a0d53bb41]|—|[实验SPEC](docs/features/t1182-real-upload-button-control.md) · [研究卡](docs/research/t1182-upload-ui-refresh.md)|完整范围、失败与待验条件见 [原记录](BACKLOG-details.md#b-4b6be3609803)。|

<a id="t1410-t-1181-222790f8011b"></a>
### T-1181 · 核对真实素材上传成功后视频列表不可见

原始七列行（说明与文档链接逐字保留）：

|T-1181|核对真实素材上传成功后视频列表不可见|⏸️ 待办|PASS[REV:f8b0038f725b]|—|[实际诊断](docs/features/t1181-uploaded-video-list-visibility.md)|T1180新隔离随包浏览器当场139.349秒exit1；MP4已显示上传完成，精确文件名在素材列表等待120秒仍不可见。保原日志/驱动，先核真实页面、公开列表与刷新，不猜丢失或删除可见性保护。|

<a id="t1410-t-1180-cec9ee9d8eb1"></a>
### T-1180 · 核对真实上传探针的File请求体字节测量失败

原始七列行（说明与文档链接逐字保留）：

|T-1180|核对真实上传探针的File请求体字节测量失败|🔨 待办|PASS[REV:36946ee35804]|—|[实际诊断](docs/features/t1180-upload-probe-file-bytes.md)|T1179真实随包浏览器首轮21.852秒exit1；PNG创建/PUT/完成均200后请求体SHA断言失败，未写最终结果。保原驱动/日志，核SDK是否拿到body与公开下载SHA，不猜文件损坏或删保护。|

<a id="t1410-t-1179-1db8bc98b399"></a>
### T-1179 · 核对素材上传回归未触发完成接口的实际原因

原始七列行（说明与文档链接逐字保留）：

|T-1179|核对素材上传回归未触发完成接口的实际原因|🔨 待办|PASS[REV:13d0145a7fcd]|—|[实际诊断](docs/features/t1179-asset-upload-regression-diagnosis.md)|原LED022当场18PASS/1FAIL；旧E2完成接口0调用，当前上传已走workspace.capture而旧mock只拦全局client；先核真实scope/HTTP/上传与取消，不猜产品缺陷或绕过组权限。|

<a id="t1410-t-1171-9a5bb9ec810b"></a>
### T-1171 · 无损压缩当前超限任务看板

原始七列行（说明与文档链接逐字保留）：

|T-1171|无损压缩当前超限任务看板|🔨 待办|—|—|[实际失败](docs/features/t1171-current-backlog-compaction.md)|当前健康门RUNAWAY；只用原受支持归档/详情外置，任务状态、原文和失败责任保留，原健康复验，不凭归档销审核债。|

<a id="t1410-t-1159-c570b7bdbb5a"></a>
### T-1159 · 在当前main整合微信原生报表、绑定归属与调度闭包

原始七列行（说明与文档链接逐字保留）：

|T-1159|在当前main整合微信原生报表、绑定归属与调度闭包|🔨 待办|PASS[REV:914cad514a19]|待验|[SPEC](docs/features/t1159-current-wechat-native-report-integration.md) · [验收合同](docs/verification/t1159/PAGE_SPEC.md)|T1124剩余56路径，来源293d统计页导航UNKNOWN/0报告/两实验用尽；独评后冻结语义移植、当前隔离公共链验收，保纯组/保存/调度与原研究暂停，不代签真人微信或安装。|

<a id="t1410-t-1155-7f3b58ed2812"></a>
### T-1155 · 核对浏览器导航时本地服务连接中断日志

原始七列行（说明与文档链接逐字保留）：

|T-1155|核对浏览器导航时本地服务连接中断日志|⏸️ 待办|—|—|[实际诊断](docs/features/t1155-browser-navigation-connection-abort.md)|当前三轮原日志aborted/ECONNRESET及uncaughtException，主要断言失败另有原因；保原日志，核请求/进程与后续公开操作，不猜根因或屏蔽错误。|

<a id="t1410-t-1149-2c42e6ff5737"></a>
### T-1149 · 在当前main整合封面用途与图片页组统一画幅

原始七列行（说明与文档链接逐字保留）：

|T-1149|在当前main整合封面用途与图片页组统一画幅|🔨 待办|PASS[REV:0a91f954eb8f]|待验|[SPEC](docs/features/t1149-current-cover-group-aspect.md)|T1124独评确认来源四路径仍缺；保T1141旧任务/有效比例及T1117引用保存，逐段移植用途、用户统一选择和能力交集；单页不支持不阻断其它合法生成，当前独评后RED/GREEN与公开回读。|

<a id="t1410-t-1144-e6f0493f65d8"></a>
### T-1144 · 核对素材旅程完成后测试进程未退出

原始七列行（说明与文档链接逐字保留）：

|T-1144|核对素材旅程完成后测试进程未退出|🔨 待办|—|—|[实际诊断](docs/features/t1144-picker-worker-cleanup.md)|T1140两例PASS但worker停后300秒不退出，整轮371.938秒exit1；保原失败和归属快照，定位实际清理等待，不缩超时/force退出/忽略全局错误。|

<a id="t1410-t-1135-d09c3fdbc659"></a>
### T-1135 · 核对安装版粗剪成片解码画面比原素材偏暗

原始七列行（说明与文档链接逐字保留）：

|T-1135|核对安装版粗剪成片解码画面比原素材偏暗|⏸️ 待办|—|—|[实际诊断](docs/features/t1135-installed-render-color-fidelity.md)|已批准r7中性成片正式exact-file下载/245帧解码通过，但源+6.76秒三处背景RGB17/36/57变为0/19/44；先核原工程与编码色彩/公共渲染路径，根因未知，不重提渲染或改原稿/媒体；修产品前精确SPEC独评。|

<a id="t1410-t-1118-584d9faf5fb7"></a>
### T-1118 · 核对本机验收原始日志目录消失

原始七列行（说明与文档链接逐字保留）：

|T-1118|核对本机验收原始日志目录消失|📋 待办|—|—|[实际诊断](docs/features/t1118-verification-directory-disappearance.md)|T1117实际RED/GREEN后，原验收父目录突然不存在；七次包装命令exit2未执行内层验证。保工具实际结果与已提交工件，原因UNKNOWN；新隔离目录继续验证，不重造旧日志或触用户数据。|

<a id="t1410-t-1116-1515f6892fec"></a>
### T-1116 · 核对稿件并发保存回归在本轮完整对账中的再次失败

原始七列行（说明与文档链接逐字保留）：

|T-1116|核对稿件并发保存回归在本轮完整对账中的再次失败|🔨 待办|—|—|[实际诊断](docs/features/t1116-artifact-cas-global-regression.md)|完整范围、失败与待验条件见 [原记录](BACKLOG-details.md#b-26577d4c923f)。|

<a id="t1410-t-1101-0753804d020f"></a>
### T-1101 · 修复画布素材选择、生成防重复与连线透传，整合三平台扫码绑定及错峰采集

原始七列行（说明与文档链接逐字保留）：

|T-1101|修复画布素材选择、生成防重复与连线透传，整合三平台扫码绑定及错峰采集|🔨|PASS[REV:146ff2046c2c]|待验|[SPEC](docs/features/t1101-canvas-binding-collection.md)|来源改动已在main；当前组合验收待完成，原PASS不代签。不发布、不改真实Cookie。 [原记录](BACKLOG-details.md#b-2a871e9f9f38)|

<a id="t1410-t-1101-global-gates-51caee812a52"></a>
### T-1101-global-gates · 核对独立main工作树全局对账失败及历史收据漂移

原始七列行（说明与文档链接逐字保留）：

|T-1101-global-gates|核对独立main工作树全局对账失败及历史收据漂移|📋 待办|—|—|[根因记录](docs/verification/t1101/global-gates.md)|前置对账76项失败含未装依赖阶段环境、历史审核收据和教训检查；本轮安装依赖后重跑真实Gate。范围外旧类型/契约/短预算仍关联T-1018/T-1081；不得补拍历史PASS。|

<a id="t1410-t-1109-7b13e8026e01"></a>
### T-1109 · 修复超时验证入口默认10秒初始化导致原测试未执行

原始七列行（说明与文档链接逐字保留）：

|T-1109|修复超时验证入口默认10秒初始化导致原测试未执行|🔨|PASS[REV:a85dda74b249]|待验|[SPEC](docs/features/t1109-timeout-verification-default-budget.md)|实际timeout-policy额外backend beforeAll10秒超时，25例skip；原静态27保留。仅明确真实Vitest test/hook至少120秒，保原断言/退出码/更长局部预算，不删除Gate或改构建。先独评再修公共入口。|

<a id="t1410-t-1110-361594a6add6"></a>
### T-1110 · 核对浏览器验收开发资源ChunkLoadError与测试状态准备竞态

原始七列行（说明与文档链接逐字保留）：

|T-1110|核对浏览器验收开发资源ChunkLoadError与测试状态准备竞态|📋 待办|—|—|[实际缺陷](docs/features/t1110-browser-development-resource-diagnosis.md)|完整范围、失败与待验条件见 [原记录](BACKLOG-details.md#b-da2102ce12ea)。|

<a id="t1410-t-1107-3d19a88544be"></a>
### T-1107 · 核对平台公共接口新增操作与发布归属回归失败

原始七列行（说明与文档链接逐字保留）：

|T-1107|核对平台公共接口新增操作与发布归属回归失败|🔨|PASS[REV:9c9181db2c1c]|待验|[实际缺陷](docs/features/t1107-platform-public-regression.md)|完整范围、失败与待验条件见 [原记录](BACKLOG-details.md#b-bc5cecd384c8)。|

<a id="t1410-t-1105-94138be0e8bd"></a>
### T-1105 · 修复共享资源面板失效读取后持续加载

原始七列行（说明与文档链接逐字保留）：

|T-1105|修复共享资源面板失效读取后持续加载|🔨|PASS[REV:675552d2d02f]|待验|[SPEC](docs/features/t1105-shared-resource-loading.md) · [实际缺陷](docs/features/t1105-shared-resource-loading-diagnosis.md)|T1101额外Chrome走查展开共享资源停在加载，console出现组上下文拒绝；原失败保留。先在main复现epoch/单在途/重开，再独评修，不放宽跨组权限或把扫码PASS代签该面板。|

<a id="t1410-t-1103-10275973d78d"></a>
### T-1103 · 排查Pi联合提案反复遗漏完整图文参数

原始七列行（说明与文档链接逐字保留）：

|T-1103|排查Pi联合提案反复遗漏完整图文参数|🔨|—|—|[实际缺陷](docs/features/t1103-pi-joint-argument-diagnosis.md) [详情](BACKLOG-details.md#t-1103)|见详情。|

<a id="t1410-t-1102-488a81293f8b"></a>
### T-1102 · 排查并恢复本地安装首次运行时展开失败

原始七列行（说明与文档链接逐字保留）：

|T-1102|排查并恢复本地安装首次运行时展开失败|🔨|—|—|[诊断与边界](docs/features/t1102-installed-runtime-extraction.md) [详情](BACKLOG-details.md#t-1102)|见详情。|

<a id="t1410-t-1094-c8f94acd5fa6"></a>
### T-1094 · 修复部分完成AI任务公开查询状态合同缺口

原始七列行（说明与文档链接逐字保留）：

|T-1094|修复部分完成AI任务公开查询状态合同缺口|🔨|PASS[REV:5d2c91b81b45]|—|[SPEC](docs/features/t1094-public-partial-task-status.md) · [当场诊断](docs/verification/t1093/FOLLOWUP_DIAGNOSIS.md) [详情](BACKLOG-details.md#t-1094)|见详情。|

<a id="t1410-t-1096-c0a03663cf76"></a>
### T-1096 · 核对文章工作流与任务父归属旧回归断言的实际漂移

原始七列行（说明与文档链接逐字保留）：

|T-1096|核对文章工作流与任务父归属旧回归断言的实际漂移|📋|—|—|[当场基线](docs/verification/t1094/RELATED_BASELINE_DIAGNOSIS.md)|完整范围、失败与待验条件见 [原记录](BACKLOG-details.md#b-19048143f3aa)。|

<a id="t1410-t-1099-dc3105d066b5"></a>
### T-1099 · 修复工具明确业务拒绝回执缺失与末次失败被算成功

原始七列行（说明与文档链接逐字保留）：

|T-1099|修复工具明确业务拒绝回执缺失与末次失败被算成功|⏸️|PASS[REV:b5aa667d8485]|—|[SPEC](docs/features/t1099-tool-domain-recovery.md) · [实际缺陷](docs/features/t1099-tool-domain-recovery-diagnosis.md) [详情](BACKLOG-details.md#t-1099)|见详情。|

<a id="t1410-t-1098-836fbe28671a"></a>
### T-1098 · 核对安装重启后的定期同步失败与采集未启动

原始七列行（说明与文档链接逐字保留）：

|T-1098|核对安装重启后的定期同步失败与采集未启动|📋|—|—|[缺陷登记](docs/features/t1098-installed-scheduled-failure-diagnosis.md)|完整范围、失败与待验条件见 [原记录](BACKLOG-details.md#b-32f22df52b82)。|

<a id="t1410-t-1097-9dc55326942b"></a>
### T-1097 · 修复文章编导参考资料与候选审读保护缺口

原始七列行（说明与文档链接逐字保留）：

|T-1097|修复文章编导参考资料与候选审读保护缺口|🔨|PASS[REV:3f5ea43b69f5]|—|[缺陷诊断](docs/features/t1097-article-director-options-diagnosis.md)|完整范围、失败与待验条件见 [原记录](BACKLOG-details.md#b-e634c6a1c42a)。|

<a id="t1410-t-1095-3e92d32d50fb"></a>
### T-1095 · 验证Pi联合创作必填nullable字段遵循与原任务恢复方法

原始七列行（说明与文档链接逐字保留）：

|T-1095|验证Pi联合创作必填nullable字段遵循与原任务恢复方法|⏸️|PASS[REV:b3b9dda4753e]|—|[SPEC](docs/features/t1095-tool-parameter-recovery.md) · [当场诊断](docs/verification/t1093/FOLLOWUP_DIAGNOSIS.md) [详情](BACKLOG-details.md#t-1095)|见详情。|

<a id="t1410-t-1093-cde9e9596e73"></a>
### T-1093 · 校准编导数字参数、联合首次读取与真实候选失败恢复

原始七列行（说明与文档链接逐字保留）：

|T-1093|校准编导数字参数、联合首次读取与真实候选失败恢复|🔨|PASS[REV:267bf399a6b1]|—|[SPEC](docs/features/t1093-director-method-recovery.md)|完整范围、失败与待验条件见 [原记录](BACKLOG-details.md#b-3158c3fcebbd)。|

<a id="t1410-t-1091-0ec0edebe600"></a>
### T-1091 · 补齐公开编导消息的Codex选择与文章图文视频目标定位并安装验收

原始七列行（说明与文档链接逐字保留）：

|T-1091|补齐公开编导消息的Codex选择与文章图文视频目标定位并安装验收|🔨|PASS[REV:dcd0b932fca7]|—|[SPEC](docs/features/t1091-public-director-context.md) [详情](BACKLOG-details.md#t-1091)|见详情。|

<a id="t1410-t-1092-11b9e3e9d2e8"></a>
### T-1092 · 核对联合创作旧集成测试未解包可信回执的契约漂移

原始七列行（说明与文档链接逐字保留）：

|T-1092|核对联合创作旧集成测试未解包可信回执的契约漂移|📋|—|—|[当场基线证据](docs/verification/t1091/CREATION_BASELINE_DIAGNOSIS.md)|完整范围、失败与待验条件见 [原记录](BACKLOG-details.md#b-024c8af10ce0)。|

<a id="t1410-t-1072-owned-devices-55f431c889f5"></a>
### T-1072-owned-devices · 配合 Growth 轻量手机号账号与正式双设备，补齐新电脑连接与已激活账号入口

原始七列行（说明与文档链接逐字保留）：

|T-1072-owned-devices|配合 Growth 轻量手机号账号与正式双设备，补齐新电脑连接与已激活账号入口|🔨 待办|PASS[REV:eb02b3e28c7b]|待验|[SPEC](docs/features/t1072-owned-devices.md)|原范围和历史证据见[完整记录](BACKLOG-details.md#t1080-retained-row-aed1560bebc24ab1)。|

<a id="t1410-t-1066-timeout-policy-c39211e7191b"></a>
### T-1066-timeout-policy · 全系统统一两分钟超时下限、嵌套预算与Skill防复发

原始七列行（说明与文档链接逐字保留）：

|T-1066-timeout-policy|全系统统一两分钟超时下限、嵌套预算与Skill防复发|⏸️ 待办|PASS[REV:13310516269c]|待验|[SPEC](docs/features/t1066-timeout-policy.md) [详情](BACKLOG-details.md#t-1066-timeout-policy)|见详情。|

<a id="t1410-t-1067-skill-verification-ef957da3c57d"></a>
### T-1067-skill-verification · 清理通用产品流程Skill既有公开分发校验债务

原始七列行（说明与文档链接逐字保留）：

|T-1067-skill-verification|清理通用产品流程Skill既有公开分发校验债务|📋 待办|—|待验|[根因证据](docs/verification/t1066/SKILL_VERIFICATION.md) [详情](BACKLOG-details.md#t-1067-skill-verification)|见详情。|

<a id="t1410-t-1018-39b06fa6e821"></a>
### T-1018 · 清理本轮测试暴露的全局类型与边界欠债

原始七列行（说明与文档链接逐字保留）：

|T-1018|清理本轮测试暴露的全局类型与边界欠债|📋 待办|—|待验|[实测证据](docs/verification/t1017-rewrite-first.md) [详情](BACKLOG-details.md#t-1018) [完整历史](BACKLOG-details.md#t1173-t1018-global-debt-history)|见详情。|

<a id="t1410-t-1083-cc9c8a6605f3"></a>
### T-1083 · 复核流程升级后的旧任务写集通配符兼容缺口

原始七列行（说明与文档链接逐字保留）：

|T-1083|复核流程升级后的旧任务写集通配符兼容缺口|📋 待办|—|—|[根因证据](docs/verification/t1080/post-package-progress-block-failure.json)|完整范围、失败与待验条件见 [原记录](BACKLOG-details.md#b-609973ed4950)。|

<a id="t1410-t-1082-cf052d3de33b"></a>
### T-1082 · 复核合并来源任务的当前评审与UI验收记录归属

原始七列行（说明与文档链接逐字保留）：

|T-1082|复核合并来源任务的当前评审与UI验收记录归属|📋 待办|—|—|[SPEC](docs/features/t1082-source-receipt-revalidation.md)|本地main真实出包后对账新增7项：5个source/alias缺当前review链event、2个agent-recovery alias缺completion；原来源链/报告保留不代签当前验收，按真实独立审核和UI旅程闭环，不重哈希旧链、不复制PASS。|

<a id="t1410-t-1081-53425b396370"></a>
### T-1081 · 核对整合后原主线的14处短执行预算与超时扫描误报

原始七列行（说明与文档链接逐字保留）：

|T-1081|核对整合后原主线的14处短执行预算与超时扫描误报|📋 待办|—|待验|[根因证据](docs/verification/t1080/timeout-static-dispositions-corrected.json)|完整范围、失败与待验条件见 [原记录](BACKLOG-details.md#b-2d26eed11574)。|

<a id="t1410-t-1026-fa19616a44f8"></a>
### T-1026 · 补齐新增 Agent 功能的公开 CLI 并逐项验收安装版

原始七列行（说明与文档链接逐字保留）：

|T-1026|补齐新增 Agent 功能的公开 CLI 并逐项验收安装版|🔨|—|—|[SPEC](docs/features/t1026-agent-cli-acceptance.md)|原范围和历史证据见[完整记录](BACKLOG-details.md#t1080-retained-row-67204c9b2c9efc87)。|

<a id="t1410-t-1027-f14004bf6717"></a>
### T-1027 · 修复评论采集完成统计与失败诊断

原始七列行（说明与文档链接逐字保留）：

|T-1027|修复评论采集完成统计与失败诊断|🔨|—|—|[SPEC](docs/features/t1027-comment-collection-evidence.md)|T1026真实评论回归failed却提示全量完成；统一完成统计并补公开未完成原因，不把零新增冒充成功。|

<a id="t1410-t-1025-d29b71e5af03"></a>
### T-1025 · 重新核验 constitution 变更后的历史评审与前端验收回执

原始七列行（说明与文档链接逐字保留）：

|T-1025|重新核验 constitution 变更后的历史评审与前端验收回执|📋|—|—|[SPEC](docs/features/t1025-receipt-drift-revalidation.md)|原范围和历史证据见[完整记录](BACKLOG-details.md#t1080-retained-row-fbe6a3f4e58bcafa)。|

<a id="t1410-t-1077-c1b5a6c4cefd"></a>
### T-1077 · 修复采纳与作品素材读取的项目返回值

原始七列行（说明与文档链接逐字保留）：

|T-1077|修复采纳与作品素材读取的项目返回值|🔨 待办|PASS[REV:a36209c19783]|待验|[SPEC](docs/features/t1077-material-parent-port.md) [详情](BACKLOG-details.md#t-1077)|见详情。|

<a id="t1410-t-1075-68ede01dde90"></a>
### T-1075 · 修复安装验收发现的素材标签观察与纯组生图证明

原始七列行（说明与文档链接逐字保留）：

|T-1075|修复安装验收发现的素材标签观察与纯组生图证明|🔨 待办|PASS[REV:73a6052db08f]|—|[SPEC](docs/features/t1075-installed-ai-observation-gaps.md) [详情](BACKLOG-details.md#t-1075)|见详情。|

<a id="t1410-t-1074-422f7f174e4e"></a>
### T-1074 · 全面验收与补齐AI助手系统操作、工具开放性和功能提示词

原始七列行（说明与文档链接逐字保留）：

|T-1074|全面验收与补齐AI助手系统操作、工具开放性和功能提示词|🔨 待办|PASS[REV:b19144c34cab]|待验|[SPEC](docs/features/t1074-ai-system-operations.md) [详情](BACKLOG-details.md#t-1074)|见详情。|

<a id="t1410-t-1071-96f3cb7e4869"></a>
### T-1071 · 修复账号绑定和页面Tab切换卡顿

原始七列行（说明与文档链接逐字保留）：

|T-1071|修复账号绑定和页面Tab切换卡顿|🔨 待办|PASS[REV:a53e25bf48df]|待验|[SPEC](docs/features/t1071-navigation-latency.md) [详情](BACKLOG-details.md#t-1071)|2026-10-24用户再次反馈Tab卡顿，本轮按当前源码分析导航、首屏读取、编辑器重建及后台争用；分析不代签安装版根因与修复验收，见[源码研究](docs/research/2026-10-24-tab-switch-performance.md)。|

<a id="t1410-t-1070-76e980f385b6"></a>
### T-1070 · 打通Codex执行与编导精调，脚本一键生成文章和图文

原始七列行（说明与文档链接逐字保留）：

|T-1070|打通Codex执行与编导精调，脚本一键生成文章和图文|🔨 待办|PASS[REV:b195ac203ec0]|待验|[SPEC](docs/features/t1070-director-script-workflow.md) [详情](BACKLOG-details.md#t-1070)|见详情。|

<a id="t1410-t-1069-5fd9bd5fa2fa"></a>
### T-1069 · 修复安装版素材导入慢与跨Tab丢失，重设计素材选择并补多平台绑定入口

原始七列行（说明与文档链接逐字保留）：

|T-1069|修复安装版素材导入慢与跨Tab丢失，重设计素材选择并补多平台绑定入口|🔨 待办|PASS[REV:19bad8ef6f93]|待验|[SPEC](docs/features/t1069-installed-media-and-binding.md)|原范围和历史证据见[完整记录](BACKLOG-details.md#t1080-retained-row-e350e6053e05749b)。|

<a id="t1410-t-1066-767f17a17e1c"></a>
### T-1066 · 落实本地客户端优先出包并移除人为构建超时

原始七列行（说明与文档链接逐字保留）：

|T-1066|落实本地客户端优先出包并移除人为构建超时|⏸️ 待办|PASS[REV:0d40d8466937]|—|[SPEC](docs/features/t1066-local-package-build-only.md)|原范围和历史证据见[完整记录](BACKLOG-details.md#t1080-retained-row-d6ce9166621c4243)。|

<a id="t1410-t-1062-75410be2f5e8"></a>
### T-1062 · 汇总各会话改动统一提交并打包本地客户端，逐项验收含Skill粗剪

原始七列行（说明与文档链接逐字保留）：

| T-1062 | 汇总各会话改动统一提交并打包本地客户端，逐项验收含Skill粗剪 | 🔨 待办 | PASS[REV:5912ba60da16] | 待验 | [SPEC](docs/features/t1062-consolidated-local-client-acceptance.md) · [完整范围](BACKLOG-details.md#t-1062) | 见详情。 |

<a id="t1410-t-1063-ef7e176c4633"></a>
### T-1063 · 修正流程工具误拒合法字面方括号文件路径

原始七列行（说明与文档链接逐字保留）：

|T-1063|修正流程工具误拒合法字面方括号文件路径|🔨 待办|PASS[REV:4d99824da112]|待验|[SPEC](docs/features/t1063-orchestrator-literal-path-boundary.md)|原范围和历史证据见[完整记录](BACKLOG-details.md#t1080-retained-row-ef8386b2a0a060cc)。|

<a id="t1410-t-1024-9c43fc674ee6"></a>
### T-1024 · 紧急排查充值50元后Growth受管Omni模型仍报余额不足

原始七列行（说明与文档链接逐字保留）：

|T-1024|紧急排查充值50元后Growth受管Omni模型仍报余额不足|🔨 待办|—|待验|[排查范围](docs/verification/t1024-managed-credit-diagnosis.md)|原范围和历史证据见[完整记录](BACKLOG-details.md#t1080-retained-row-c9ebcc41ffd59f36)。|

<a id="t1410-t-1022-ec9be494801c"></a>
### T-1022 · 按账号组统一多平台工作区、绑定管理、首页与复盘

原始七列行（说明与文档链接逐字保留）：

|T-1022|按账号组统一多平台工作区、绑定管理、首页与复盘|⏸️ 待办|PASS[REV:2f179f8d9380]|待验|[SPEC](docs/features/t1022-account-group-workspace.md) [详情](BACKLOG-details.md#t-1022)|见详情。|

<a id="t1410-t-1023-52e6425edd57"></a>
### T-1023 · 修正既有任务绑定glob导致的progress生成阻断

原始七列行（说明与文档链接逐字保留）：

|T-1023|修正既有任务绑定glob导致的progress生成阻断|📋 待办|—|—|[证据](docs/features/t1022-account-group-workspace/VERIFICATION.md)|原范围和历史证据见[完整记录](BACKLOG-details.md#t1080-retained-row-3eba29be37ce0174)。|

<a id="t1410-t-1021-b40f4b370e16"></a>
### T-1021 · CreatorOS封面与小红书图文双模板库、行业分类及私人收藏

原始七列行（说明与文档链接逐字保留）：

|T-1021|CreatorOS封面与小红书图文双模板库、行业分类及私人收藏|🔨 待办|PASS[REV:475a70aef2e0]|待验|[SPEC](docs/features/t1021-cover-template-library.md)|原范围和历史证据见[完整记录](BACKLOG-details.md#t1080-retained-row-d0c6d059440fcd70)。|

<a id="t1410-t-1019-2c37a76586d9"></a>
### T-1019 · 按观众具体任务与双九宫格持续生成可实测选题

原始七列行（说明与文档链接逐字保留）：

|T-1019|按观众具体任务与双九宫格持续生成可实测选题|⏸️ 待办|PASS[REV:3a0362412b23]|待验|[SPEC](docs/features/audience-task-topics/README.md)|用户委派；复用定位/雷达/候选/反馈，观众入口与作者实测分流，保留 T-1017 首稿；不发布或 push。|

<a id="t1410-t-1020-afe3fe587d0a"></a>
### T-1020 · 统一可视化推荐、作品承接与科学运营观测

原始七列行（说明与文档链接逐字保留）：

|T-1020|统一可视化推荐、作品承接与科学运营观测|📋 待办|待审|待验|[SPEC](docs/features/creator-operations/README.md)|原范围和历史证据见[完整记录](BACKLOG-details.md#t1080-retained-row-e6765fb61ec296f6)。|

<a id="t1410-t-1017-5d76c62ceb95"></a>
### T-1017 · 简化内容雷达：按账号定位一键生成可编辑改写稿

原始七列行（说明与文档链接逐字保留）：

|T-1017|简化内容雷达：按账号定位一键生成可编辑改写稿|🔨 待办|PASS[REV:d2fb4541c82d]|待验|[SPEC](docs/features/t1017-content-radar-rewrite-first.md)|原范围和历史证据见[完整记录](BACKLOG-details.md#t1080-retained-row-00c1555a12c0e894)。|

<a id="t1410-t-1015-f14e4fc4dec6"></a>
### T-1015 · 核实剩余教训失败并校准过期回归断言

原始七列行（说明与文档链接逐字保留）：

|T-1015|核实剩余教训失败并校准过期回归断言|🔨 待办|—|—|[实测清单](docs/verification/t1014-reconcile-triage.md) [详情](BACKLOG-details.md#t-1015) [状态与原审核历史](BACKLOG-details.md#t1173-t-1015-same-identity-history)|见详情。|

<a id="t1410-t-1004-4143dee476ea"></a>
### T-1004 · 冻结共享能力协议与 NomiFun 迁移依赖

原始七列行（说明与文档链接逐字保留）：

|T-1004|冻结共享能力协议与 NomiFun 迁移依赖|📋 待办|—|—|[SPEC](docs/features/t1003-agent-workbench.md) [状态与原审核历史](BACKLOG-details.md#t1173-t-1004-same-identity-history)|T-1003 评审；固定依赖闭包、宿主端口、协议与架构门卫。|

<a id="t1410-t-1005-19be6345a302"></a>
### T-1005 · 实现多步计划、连续执行与原任务续跑

原始七列行（说明与文档链接逐字保留）：

|T-1005|实现多步计划、连续执行与原任务续跑|📋 待办|—|—|[SPEC](docs/features/t1003-agent-workbench.md)|依赖 T-1004；模型规划与重规划，保留回执和成本，停止恢复可核验。|

<a id="t1410-t-1006-dba453c94745"></a>
### T-1006 · 接入统一工具网关与长结果回读

原始七列行（说明与文档链接逐字保留）：

|T-1006|接入统一工具网关与长结果回读|📋 待办|—|—|[SPEC](docs/features/t1003-agent-workbench.md) [状态与原审核历史](BACKLOG-details.md#t1173-t-1006-same-identity-history)|依赖 T-1004；工具发现、进度、取消、错误和费用共用原执行链。|

<a id="t1410-t-1007-8febd4555cd8"></a>
### T-1007 · 补齐任务文件空间与受控命令执行

原始七列行（说明与文档链接逐字保留）：

|T-1007|补齐任务文件空间与受控命令执行|📋 待办|—|—|[SPEC](docs/features/t1003-agent-workbench.md)|依赖 T-1004；文件读写编辑、版本冲突、跨平台运行和进程树取消。|

<a id="t1410-t-1008-d06b187e3850"></a>
### T-1008 · 迁移 NomiFun 浏览器能力并协调既有采集

原始七列行（说明与文档链接逐字保留）：

|T-1008|迁移 NomiFun 浏览器能力并协调既有采集|📋 待办|—|—|[SPEC](docs/features/t1003-agent-workbench.md)|依赖 T-1004/1006；唯一profile所有者、多任务并发、跨账号隔离和原采集回归。|

<a id="t1410-t-1009-00aa299fa505"></a>
### T-1009 · 实现产物版本、隔离预览与原生导出

原始七列行（说明与文档链接逐字保留）：

|T-1009|实现产物版本、隔离预览与原生导出|📋 待办|—|—|[SPEC](docs/features/t1003-agent-workbench.md) [状态与原审核历史](BACKLOG-details.md#t1173-t-1009-same-identity-history)|依赖 T-1006/1007；真实文件交付、HTML/图表预览、图片/PDF及选址导出。|

<a id="t1410-t-1010-4a100efdc42a"></a>
### T-1010 · 装配研究创作报告 Skill 与兼容扩展

原始七列行（说明与文档链接逐字保留）：

|T-1010|装配研究创作报告 Skill 与兼容扩展|📋 待办|—|—|[SPEC](docs/features/t1003-agent-workbench.md)|依赖 T-1005/1006/1007/1008/1009；按需方法包、锁定版本，自主选工具完成目标。|

<a id="t1410-t-1011-a4049ea453cc"></a>
### T-1011 · 实现对话内计划进度与文件交付交互

原始七列行（说明与文档链接逐字保留）：

|T-1011|实现对话内计划进度与文件交付交互|📋 待办|—|—|[SPEC](docs/features/t1003-agent-workbench.md)|依赖 T-1005/1006/1009；同对话查看修改导出，停止/恢复与性能防复发。|

<a id="t1410-t-1012-632204111b1a"></a>
### T-1012 · 验收完整多步 Agent 与旧功能兼容

原始七列行（说明与文档链接逐字保留）：

|T-1012|验收完整多步 Agent 与旧功能兼容|📋 待办|—|—|[SPEC](docs/features/t1003-agent-workbench.md)|依赖 T-1008/1010/1011；真实模型工具文件全链路、故障恢复、采集及性能。|

<a id="t1410-t-1013-0c0d72e6b870"></a>
### T-1013 · 验证双端安装包多步 Agent 与升级兼容

原始七列行（说明与文档链接逐字保留）：

|T-1013|验证双端安装包多步 Agent 与升级兼容|📋 待办|—|—|[SPEC](docs/features/t1003-agent-workbench.md)|依赖 T-1012；Mac/Windows安装实测，无NomiFun前置，数据升级保留。|

<a id="t1410-t-998-03c947db7d15"></a>
### T-998 · 收敛业务代码硬编码模型名

原始七列行（说明与文档链接逐字保留）：

|T-998|收敛业务代码硬编码模型名|📋 待办|—|—|[T-914 审计](docs/research/2026-09-04-architecture-agent-audit.md)|原范围和历史证据见[完整记录](BACKLOG-details.md#t1080-retained-row-b9b5a6896b2aaf0b)。|

<a id="t1410-t-997-dc0718cb08d1"></a>
### T-997 · 修复 ai→ai-runtime 反向依赖边界违反

原始七列行（说明与文档链接逐字保留）：

|T-997|修复 ai→ai-runtime 反向依赖边界违反|📋 待办|—|—|[T-914 审计](docs/research/2026-09-04-architecture-agent-audit.md)|原范围和历史证据见[完整记录](BACKLOG-details.md#t1080-retained-row-2eb38b106511cdb8)。|

<a id="t1410-t-996-b3a83d825a0b"></a>
### T-996 · 消除 review/reviews 双模块命名混淆

原始七列行（说明与文档链接逐字保留）：

|T-996|消除 review/reviews 双模块命名混淆|📋 待办|—|—|[T-914 审计](docs/research/2026-09-04-architecture-agent-audit.md)|review/(review-gate 审核门)与 reviews/(复盘评论领域)职责不同但命名极易混；重命名对齐并更新跨模块引用。|

<a id="t1410-t-993-24a617127e99"></a>
### T-993 · 同步 main 分支到最新(落后 origin/main 573 提交)

原始七列行（说明与文档链接逐字保留）：

|T-993|同步 main 分支到最新(落后 origin/main 573 提交)|📋 待办|—|—|—|原范围和历史证据见[完整记录](BACKLOG-details.md#t1080-retained-row-6f28905ece9e4a7b)。|

<a id="t1410-t-992-a7f47908a50f"></a>
### T-992 · 修复 Windows 升级启动运行环境切换拒绝访问

原始七列行（说明与文档链接逐字保留）：

|T-992|修复 Windows 升级启动运行环境切换拒绝访问|🔨 待办|—|—|[SPEC](docs/features/t992-windows-runtime-upgrade.md)|用户启动日志os error5；检查旧运行目录、安装指针与升级迁移，保留数据，补既有安装升级验证。|

<a id="t1410-t-989-93825516c0c3"></a>
### T-989 · 校正知识图谱错误提示的既有回归断言

原始七列行（说明与文档链接逐字保留）：

|T-989|校正知识图谱错误提示的既有回归断言|📋 待办|—|—|[SPEC](docs/features/t989-knowledge-error-test.md)|T988扩展验证发现原af62ddda及当前均1/9失败；核对错误提示契约后修正，未改该行为。|

<a id="t1410-t-984-cd8aa645b881"></a>
### T-984 · 本地打包并实测拆分采集修复

原始七列行（说明与文档链接逐字保留）：

|T-984|本地打包并实测拆分采集修复|⏸️ 待办|—|—|[SPEC](docs/verification/t984-local-collection.md)|用户明确冻结改动范围；以66264111本地打包、安装、真实采集验证，不扩展恢复架构、不公开发布。|

<a id="t1410-t-986-8501fbc1bc03"></a>
### T-986 · 修复新绑定账号默认采集任务系统标记透传

原始七列行（说明与文档链接逐字保留）：

|T-986|修复新绑定账号默认采集任务系统标记透传|📋 待办|—|—|[SPEC](docs/features/t986-bind-collection-flag.md)|原范围和历史证据见[完整记录](BACKLOG-details.md#t1080-retained-row-5172365e85a2cee2)。|

<a id="t1410-t-980-3eed5eeb3f09"></a>
### T-980 · 纳入助手修复重新运行 V1.2 双端流水线

原始七列行（说明与文档链接逐字保留）：

|T-980|纳入助手修复重新运行 V1.2 双端流水线|🔨 待办|—|—|[SPEC](docs/features/t980-release-rerun.md)|冻结已提交 T-976至T-978 修复，合并发布分支，预检后运行 Mac/Windows 正式构建并核验产物。|

<a id="t1410-t-979-2563b5a37575"></a>
### T-979 · 自动化页面慢轮询与切换对象回写防护

原始七列行（说明与文档链接逐字保留）：

|T-979|自动化页面慢轮询与切换对象回写防护|⬜ 待办|—|—|[SPEC](docs/features/t979-automation-polling.md)|原范围和历史证据见[完整记录](BACKLOG-details.md#t1080-retained-row-9f66fc6ba1d2a7e1)。|

<a id="t1410-t-976-64afb7568923"></a>
### T-976 · 修复安装版 AI 助手 RedFox 再次失败与脱离对话的任务交互

原始七列行（说明与文档链接逐字保留）：

|T-976|修复安装版 AI 助手 RedFox 再次失败与脱离对话的任务交互|🔨 待办|—|—|[SPEC](docs/features/t976-chat-inline-redfox.md)|定位本次原始错误；当前对话持续执行返回结果，不让用户刷新核对；真实链路验收。|

<a id="t1410-t-957-10f92796d4a6"></a>
### T-957 · 排查 AI 失败、全场景验收并优化 Agent 提示词

原始七列行（说明与文档链接逐字保留）：

|T-957|排查 AI 失败、全场景验收并优化 Agent 提示词|🔨 待办|—|—|[SPEC](docs/features/t957-ai-real-acceptance.md)|原范围和历史证据见[完整记录](BACKLOG-details.md#t1080-retained-row-d8c8c522ea52c213)。|

<a id="t1410-t-956-f94704aad4c9"></a>
### T-956 · 修复安装版点击采集一直抓取中

原始七列行（说明与文档链接逐字保留）：

|T-956|修复安装版点击采集一直抓取中|🔨 待办|—|—|[SPEC](docs/features/t956-installed-collection-stuck.md)|对照真实任务、日志与调度恢复定位阻断，修复后沿实际入口验证终态和结果，保护旧数据。|

<a id="t1410-t-954-cbbca537e570"></a>
### T-954 · 接入抖音流量来源并以专家方法改进编导交互

原始七列行（说明与文档链接逐字保留）：

|T-954|接入抖音流量来源并以专家方法改进编导交互|🔨 待办|—|—|[SPEC](docs/features/t954-director-content-loop.md)|原范围和历史证据见[完整记录](BACKLOG-details.md#t1080-retained-row-6ad5b71dceb239e1)。|

<a id="t1410-t-951-59f6a579e2d1"></a>
### T-951 · 修复自动化采集缺 jobRunId 与千条作品采集失败

原始七列行（说明与文档链接逐字保留）：

|T-951|修复自动化采集缺 jobRunId 与千条作品采集失败|⏸️ 待办|—|—|[SPEC](docs/features/t951-collection-reliability.md)|查明原调度绑定、分页和超时恢复，验证公共链路与千条规模，不以吞错冒充成功。|

<a id="t1410-t-950-903f29bbbaf5"></a>
### T-950 · 排查并恢复当前产品缺失历史数据

原始七列行（说明与文档链接逐字保留）：

|T-950|排查并恢复当前产品缺失历史数据|⏸️ 待办|—|—|[记录](docs/verification/t950-data-recovery.md)|先核对账号、数据路径和备份；保留现状后恢复可验证的数据，不覆盖新内容。|

<a id="t1410-t-945-34b5ed4f47f6"></a>
### T-945 · 排查并修复当前视频渲染再次失败

原始七列行（说明与文档链接逐字保留）：

|T-945|排查并修复当前视频渲染再次失败|⏸️ 待办|—|—|[诊断](docs/verification/t945-render-failure.md)|对齐最新原任务与安装版日志，定位真实失败点并验证修复，不凭历史错误猜测。|

<a id="t1410-t-943-ad96febf3d6a"></a>
### T-943 · 拉取并跑通 JY_IPAgent，调研数字人 API 与 CreatorOS 接入

原始七列行（说明与文档链接逐字保留）：

|T-943|拉取并跑通 JY_IPAgent，调研数字人 API 与 CreatorOS 接入|⏸️ 待办|—|—|[SPEC](docs/features/t943-jy-ipagent-research.md)|原范围和历史证据见[完整记录](BACKLOG-details.md#t1080-retained-row-6da40b9d211687ae)。|

<a id="t1410-t-940-466de02aeb63"></a>
### T-940 · 补齐应用内签名远程更新闭环

原始七列行（说明与文档链接逐字保留）：

|T-940|补齐应用内签名远程更新闭环|📋 待办|—|—|[缺口与范围](docs/features/t939-positioning-release.md)|原范围和历史证据见[完整记录](BACKLOG-details.md#t1080-retained-row-0e3dd393b702a707)。|

<a id="t1410-t-935-4b5ca1d6dacf"></a>
### T-935 · 修复整稿子任务长时间排队无执行

原始七列行（说明与文档链接逐字保留）：

|T-935|修复整稿子任务长时间排队无执行|🔨 待办|—|—|[排查记录](docs/verification/t935-script-queue.md)|查真实任务排队与唤醒，恢复原任务，不用新任务掩盖卡住；并完成 T-934 聊天复验。|

<a id="t1410-t-934-649dccd073f7"></a>
### T-934 · 统一 CLI 与页面的持久聊天工具入口

原始七列行（说明与文档链接逐字保留）：

|T-934|统一 CLI 与页面的持久聊天工具入口|🔨 待办|—|—|[实现与验收](docs/verification/t934-cli-chat-unification.md)|原范围和历史证据见[完整记录](BACKLOG-details.md#t1080-retained-row-9b2048cb81450808)。|

<a id="t1410-t-933-9b3b65861510"></a>
### T-933 · 安装并验收本轮Agent Runtime桌面版

原始七列行（说明与文档链接逐字保留）：

|T-933|安装并验收本轮Agent Runtime桌面版|🔨 待办|—|—|[T-932交付](docs/verification/t932-runtime-alignment.md)|原范围和历史证据见[完整记录](BACKLOG-details.md#t1080-retained-row-e3d09dce7e422bbe)。|

<a id="t1410-t-919-f3a6e18d82c9"></a>
### T-919 · 定位并修复本地包主导航卡顿、助手通知刷屏与搜索停滞

原始七列行（说明与文档链接逐字保留）：

|T-919|定位并修复本地包主导航卡顿、助手通知刷屏与搜索停滞|🔨 待办|—|—|复用 T-912/T-909 导航契约与 [T-915 SPEC](docs/superpowers/specs/2026-09-04-agent-runtime-refactor.md)|原范围和历史证据见[完整记录](BACKLOG-details.md#t1080-retained-row-125af640cc5d45f9)。|

<a id="t1410-t-915-6ea3f272115e"></a>
### T-915 · 根治 AI 卡慢、失败不重试与搜索/浏览器缺少自主循环，收敛架构与执行能力

原始七列行（说明与文档链接逐字保留）：

|T-915|根治 AI 卡慢、失败不重试与搜索/浏览器缺少自主循环，收敛架构与执行能力|🔨 待办|PASS[REV:78ed5d428e7a]|—|[SPEC](docs/superpowers/specs/2026-09-04-agent-runtime-refactor.md)|原范围和历史证据见[完整记录](BACKLOG-details.md#t1080-retained-row-e93a45cb55075893)。|

<a id="t1410-t-916-fc12bbea5877"></a>
### T-916 · 修复工程对账与历史任务证据漂移，恢复可信重构基线

原始七列行（说明与文档链接逐字保留）：

|T-916|修复工程对账与历史任务证据漂移，恢复可信重构基线|🔨 待办|—|—|[审计 A-13](docs/research/2026-09-04-architecture-agent-audit.md) [详情](BACKLOG-details.md#t-916) [状态与原审核历史](BACKLOG-details.md#t1173-t-916-same-identity-history)|见详情。|

<a id="t1410-t-917-c4ecb19759a9"></a>
### T-917 · 记录 T-915 媒体测试事故并防止测试再次访问真实媒体根

原始七列行（说明与文档链接逐字保留）：

|T-917|记录 T-915 媒体测试事故并防止测试再次访问真实媒体根|📋 待办|—|—|[事故记录](docs/research/evidence/t915/2026-09-06-media-test-incident.md)|原范围和历史证据见[完整记录](BACKLOG-details.md#t1080-retained-row-20ca3c0dceb6f8f4)。|

<a id="t1410-t-908-93732c4f6af2"></a>
### T-908 · 真实复测 douyin-transcribe Skill，并对照 CreatorOS 当前抖音抓取链路判断是否需要兼容修复

原始七列行（说明与文档链接逐字保留）：

|T-908|真实复测 douyin-transcribe Skill，并对照 CreatorOS 当前抖音抓取链路判断是否需要兼容修复|📋 待办|—|—|—|原范围和历史证据见[完整记录](BACKLOG-details.md#t1080-retained-row-0d6e5afae67dc6b3)。|

<a id="t1410-t-906-a00709c39411"></a>
### T-906 · 放大 AI 助手默认窗口并支持拖拽缩放与跨启动尺寸记忆

原始七列行（说明与文档链接逐字保留）：

|T-906|放大 AI 助手默认窗口并支持拖拽缩放与跨启动尺寸记忆|⏸️ 待办|—|待验|—|原范围和历史证据见[完整记录](BACKLOG-details.md#t1080-retained-row-43eab6d6e3e39443)。|

<a id="t1410-t-905-6f31c3ba5615"></a>
### T-905 · 调研独立的极简手机口播创作产品，以人设选稿、灵感写稿、实拍与“123321”真人换口型为核心

原始七列行（说明与文档链接逐字保留）：

|T-905|调研独立的极简手机口播创作产品，以人设选稿、灵感写稿、实拍与“123321”真人换口型为核心|📋 待办|—|—|—|原范围和历史证据见[完整记录](BACKLOG-details.md#t1080-retained-row-916d71382f9f6b24)。|

<a id="t1410-t-884-ceb51933fcf1"></a>
### T-884 · 只读诊断用户加密日志中的 ASR 转写失败

原始七列行（说明与文档链接逐字保留）：

|T-884|只读诊断用户加密日志中的 ASR 转写失败|⏸️ 待办|—|—|复用 T-768 ASR 通用回退、T-639 MiMo ASR 与 T-676 逐字稿队列契约|原范围和历史证据见[完整记录](BACKLOG-details.md#t1080-retained-row-15d0c7dabac4150e)。|

<a id="t1410-t-883-e362784ae8f9"></a>
### T-883 · 提交并推送 T-881/T-882 候选，触发 GitHub macOS 与 Windows 官方安装包流水线

原始七列行（说明与文档链接逐字保留）：

|T-883|提交并推送 T-881/T-882 候选，触发 GitHub macOS 与 Windows 官方安装包流水线|⏸️ 待办|—|—|复用 [T-881 验收](orchestrator/T881-FRONTEND-VALIDATION.md)、[T-882 本地包验收](orchestrator/T882-BUILD-VALIDATION.md) [详情](BACKLOG-details.md#t-883)|见详情。|

<a id="t1410-t-878-5744a545aca5"></a>
### T-878 · 让生图模型连接测试正确识别并提示 401/403 鉴权失败

原始七列行（说明与文档链接逐字保留）：

|T-878|让生图模型连接测试正确识别并提示 401/403 鉴权失败|📋 待办|—|—|[T-877 脱敏诊断](docs/research/2026-08-17-dudu-image-auth-failure-diagnosis.md)|原范围和历史证据见[完整记录](BACKLOG-details.md#t1080-retained-row-ab507299fb3fcd91)。|

<a id="t1410-t-867-ce4e765a844f"></a>
### T-867 · 恢复 AI 对项目素材与分镜场景的自动语义匹配

原始七列行（说明与文档链接逐字保留）：

|T-867|恢复 AI 对项目素材与分镜场景的自动语义匹配|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-867)|详情见外置记录。|

<a id="t1410-t-860-632e4d4699df"></a>
### T-860 · 修复竖屏素材底边与左下人物框边界重合

原始七列行（说明与文档链接逐字保留）：

|T-860|修复竖屏素材底边与左下人物框边界重合|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-860)|详情见外置记录。|

<a id="t1410-t-859-6de3097acb36"></a>
### T-859 · 竖屏素材段人物收进左下角，并消除切换白闪

原始七列行（说明与文档链接逐字保留）：

|T-859|竖屏素材段人物收进左下角，并消除切换白闪|🔨 待办|PASS[REV:2f586e24d5d0]|待验|[详情](BACKLOG-details.md#t-859)  [SPEC](docs/superpowers/specs/2026-08-16-portrait-material-pip-smooth-transition.md)|详情见外置记录。|

<a id="t1410-t-858-6481564fcdbd"></a>
### T-858 · 把剪辑方法真正落到 CreatorOS，根治竖屏统一舞台、字幕重点词与动态 PPT

原始七列行（说明与文档链接逐字保留）：

|T-858|把剪辑方法真正落到 CreatorOS，根治竖屏统一舞台、字幕重点词与动态 PPT|🔨 待办|PASS[REV:2798870c87f4]|待验|[详情](BACKLOG-details.md#t-858)  [SPEC](docs/superpowers/specs/2026-08-16-video-direction-stage-and-caption-emphasis.md)|详情见外置记录。|

<a id="t1410-t-857-30a4d6e5b451"></a>
### T-857 · 构建当前已提交候选的 CreatorOS 1.1.0 Windows 安装包

原始七列行（说明与文档链接逐字保留）：

|T-857|构建当前已提交候选的 CreatorOS 1.1.0 Windows 安装包|⏸️ 待办|—|待验|[详情](BACKLOG-details.md#t-857)|详情见外置记录。|

<a id="t1410-t-856-2848f5bf6fac"></a>
### T-856 · 重做竖屏成片的统一舞台、字幕可读性与重点词强调

原始七列行（说明与文档链接逐字保留）：

|T-856|重做竖屏成片的统一舞台、字幕可读性与重点词强调|⏸️ 待办|—|待验|[详情](BACKLOG-details.md#t-856)|详情见外置记录。|

<a id="t1410-t-855-cbc7d15eb5cf"></a>
### T-855 · 构建包含 T-854 与当前已提交修复的 CreatorOS macOS 本地安装包

原始七列行（说明与文档链接逐字保留）：

|T-855|构建包含 T-854 与当前已提交修复的 CreatorOS macOS 本地安装包|⏸️ 待办|—|—|[详情](BACKLOG-details.md#t-855)|详情见外置记录。|

<a id="t1410-t-851-6bc79a13d8a4"></a>
### T-851 · 支持录制“123”短视频生成本人授权的 AI 数字人口播

原始七列行（说明与文档链接逐字保留）：

|T-851|支持录制“123”短视频生成本人授权的 AI 数字人口播|📋 待办|待审|待验|[详情](BACKLOG-details.md#t-851)|详情见外置记录。|

<a id="t1410-t-850-2753dd718185"></a>
### T-850 · 支持只上传未粗剪口播录像，由 AI 理解实拍语义并生成可确认粗剪

原始七列行（说明与文档链接逐字保留）：

|T-850|支持只上传未粗剪口播录像，由 AI 理解实拍语义并生成可确认粗剪|📋 待办|待审|待验|[详情](BACKLOG-details.md#t-850)|详情见外置记录。|

<a id="t1410-t-847-56f2d3187c5f"></a>
### T-847 · 补齐 Windows 正式包的 CreatorOS CLI runtime 并重跑 1.1.0 双端流水线

原始七列行（说明与文档链接逐字保留）：

|T-847|补齐 Windows 正式包的 CreatorOS CLI runtime 并重跑 1.1.0 双端流水线|⏸️ 待办|—|—|[详情](BACKLOG-details.md#t-847)|详情见外置记录。|

<a id="t1410-t-846-00a2495b3325"></a>
### T-846 · 提交当前批准候选并运行 CreatorOS 1.1.0 macOS/Windows 官方双端构建

原始七列行（说明与文档链接逐字保留）：

|T-846|提交当前批准候选并运行 CreatorOS 1.1.0 macOS/Windows 官方双端构建|⏸️ 待办|—|—|[详情](BACKLOG-details.md#t-846)|详情见外置记录。|

<a id="t1410-t-845-fdc5cd8ab787"></a>
### T-845 · 根治 Windows 用户机成片在 HyperFrames 启动阶段缺失分层模块解析器

原始七列行（说明与文档链接逐字保留）：

|T-845|根治 Windows 用户机成片在 HyperFrames 启动阶段缺失分层模块解析器|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-845)|详情见外置记录。|

<a id="t1410-t-843-c05f2f464c8b"></a>
### T-843 · 为 CreatorOS 建立可由 Codex 完整操作的官方 CLI，并复用现有全部业务能力

原始七列行（说明与文档链接逐字保留）：

|T-843|为 CreatorOS 建立可由 Codex 完整操作的官方 CLI，并复用现有全部业务能力|🔨 待办|PASS[REV:ea17774db868]|—|[详情](BACKLOG-details.md#t-843)  [SPEC](docs/superpowers/specs/2026-08-15-creatoros-codex-cli.md)|详情见外置记录。|

<a id="t1410-t-835-274e76adf9ee"></a>
### T-835 · 取消制作分镜逐字保真失败对整稿候选的阻断，并给出可诊断恢复

原始七列行（说明与文档链接逐字保留）：

|T-835|取消制作分镜逐字保真失败对整稿候选的阻断，并给出可诊断恢复|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-835)|详情见外置记录。|

<a id="t1410-t-833-b7136c89be8f"></a>
### T-833 · 根治结构化节点 schema 兼容报错与多张局部改稿卡无法连续采纳

原始七列行（说明与文档链接逐字保留）：

|T-833|根治结构化节点 schema 兼容报错与多张局部改稿卡无法连续采纳|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-833)|详情见外置记录。|

<a id="t1410-t-831-04eaeab6e719"></a>
### T-831 · 重排官方渠道模型配置并复核上游图生图能力

原始七列行（说明与文档链接逐字保留）：

|T-831|重排官方渠道模型配置并复核上游图生图能力|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-831)|详情见外置记录。|

<a id="t1410-t-829-d7e2b1a2305e"></a>
### T-829 · 建立并执行上游模型全能力真实兼容矩阵，覆盖渠道托管与用户中转站

原始七列行（说明与文档链接逐字保留）：

|T-829|建立并执行上游模型全能力真实兼容矩阵，覆盖渠道托管与用户中转站|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-829)|详情见外置记录。|

<a id="t1410-t-828-6e4d9205a76f"></a>
### T-828 · 诊断行业热点出题不可用、Windows 滚动条异常与 DeepMind/Max 模型报错

原始七列行（说明与文档链接逐字保留）：

|T-828|诊断行业热点出题不可用、Windows 滚动条异常与 DeepMind/Max 模型报错|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-828)|详情见外置记录。|

<a id="t1410-t-827-3cb3b14c6e1a"></a>
### T-827 · 根治选题中心来源筛选失效与候选操作按钮无法点击

原始七列行（说明与文档链接逐字保留）：

|T-827|根治选题中心来源筛选失效与候选操作按钮无法点击|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-827)|详情见外置记录。|

<a id="t1410-t-826-ab40ec4de67f"></a>
### T-826 · 根治 CreatorOS v1.1 Windows 新安装包安装后无法启动

原始七列行（说明与文档链接逐字保留）：

|T-826|根治 CreatorOS v1.1 Windows 新安装包安装后无法启动|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-826)|详情见外置记录。|

<a id="t1410-t-824-e8c34a69e800"></a>
### T-824 · 根治昨日文稿 Skill 与内容动效卡片迭代在标准版成品中无明显效果

原始七列行（说明与文档链接逐字保留）：

|T-824|根治昨日文稿 Skill 与内容动效卡片迭代在标准版成品中无明显效果|🔨 待办|PASS[REV:853ab9b0f7ea]|待验|[详情](BACKLOG-details.md#t-824)  [SPEC](docs/superpowers/specs/2026-08-13-continuous-voiceover-storyboard-pipeline.md)|详情见外置记录。|

<a id="t1410-t-823-21e938876e2f"></a>
### T-823 · 根治架构图等主视觉被信息卡遮挡并修正跨段画面切换滞后

原始七列行（说明与文档链接逐字保留）：

|T-823|根治架构图等主视觉被信息卡遮挡并修正跨段画面切换滞后|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-823)|详情见外置记录。|

<a id="t1410-t-821-d2f0fd755089"></a>
### T-821 · 网站内容因未登录或权限不足读取失败时引导用户前往登录保管库

原始七列行（说明与文档链接逐字保留）：

|T-821|网站内容因未登录或权限不足读取失败时引导用户前往登录保管库|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-821)|详情见外置记录。|

<a id="t1410-t-819-15aea2aaa8ec"></a>
### T-819 · 让编导在普通对话中按自然语言定位并改写当前稿单段

原始七列行（说明与文档链接逐字保留）：

|T-819|让编导在普通对话中按自然语言定位并改写当前稿单段|🔨 待办|PASS[REV:20281a3415d4]|待验|[详情](BACKLOG-details.md#t-819)  [SPEC](docs/superpowers/specs/2026-08-13-natural-language-current-script-section-editing.md)|详情见外置记录。|

<a id="t1410-t-820-ab0cf55ea654"></a>
### T-820 · 修复选题补卡到项目与文案的数据丢失并保存生成消费血缘

原始七列行（说明与文档链接逐字保留）：

|T-820|修复选题补卡到项目与文案的数据丢失并保存生成消费血缘|📋 待办|—|—|[详情](BACKLOG-details.md#t-820)|详情见外置记录。|

<a id="t1410-t-816-070853c6a738"></a>
### T-816 · 让当前确认稿成为配图与封面生成的第一内容真相

原始七列行（说明与文档链接逐字保留）：

|T-816|让当前确认稿成为配图与封面生成的第一内容真相|🔨 待办|PASS[REV:de532b22b58b]|待验|[详情](BACKLOG-details.md#t-816)  [SPEC](docs/superpowers/specs/2026-08-13-current-script-truth-and-natural-language-section-editing.md)|详情见外置记录。|

<a id="t1410-t-814-b39a99e022c1"></a>
### T-814 · 统一 CreatorOS 多页面 AI 对话体验并保留场景上下文与自由讨论能力

原始七列行（说明与文档链接逐字保留）：

|T-814|统一 CreatorOS 多页面 AI 对话体验并保留场景上下文与自由讨论能力|📋 待办|—|—|[详情](BACKLOG-details.md#t-814)|详情见外置记录。|

<a id="t1410-t-779-dde5cd9732d2"></a>
### T-779 · 根治参考历史作品生成封面时误探本机工具并中断生图

原始七列行（说明与文档链接逐字保留）：

|T-779|根治参考历史作品生成封面时误探本机工具并中断生图|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-779)|详情见外置记录。|

<a id="t1410-t-773-5d32f5737b6b"></a>
### T-773 · 更新 CreatorOS 1.0 最新使用教程、匿名化截图并新建成交型测试版教程

原始七列行（说明与文档链接逐字保留）：

|T-773|更新 CreatorOS 1.0 最新使用教程、匿名化截图并新建成交型测试版教程|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-773)|详情见外置记录。|

<a id="t1410-t-768-e5e430aaf7e5"></a>
### T-768 · 任何云端 ASR 故障都必须自动回退本地 Whisper

原始七列行（说明与文档链接逐字保留）：

|T-768|任何云端 ASR 故障都必须自动回退本地 Whisper|🔨 待办|PASS[REV:3a5532adc550]|待验|[详情](BACKLOG-details.md#t-768)  [SPEC](docs/superpowers/specs/2026-08-11-asr-universal-local-fallback.md)|详情见外置记录。|

<a id="t1410-t-762-b890e9c6b29d"></a>
### T-762 · 根因复盘并设计渠道 ASR 密钥的短时租约闭环

原始七列行（说明与文档链接逐字保留）：

|T-762|根因复盘并设计渠道 ASR 密钥的短时租约闭环|🔨 待办|—|—|[详情](BACKLOG-details.md#t-762)|详情见外置记录。|

<a id="t1410-t-759-1af9f1290f53"></a>
### T-759 · 根治已绑定 B-roll 因 inventory 失配显示空白

原始七列行（说明与文档链接逐字保留）：

|T-759|根治已绑定 B-roll 因 inventory 失配显示空白|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-759)|详情见外置记录。|

<a id="t1410-t-754-15fcf88ff916"></a>
### T-754 · 根治 CreatorOS v1.0 官方包启动无限转圈

原始七列行（说明与文档链接逐字保留）：

|T-754|根治 CreatorOS v1.0 官方包启动无限转圈|🔨 待办|—|—|[详情](BACKLOG-details.md#t-754)|详情见外置记录。|

<a id="t1410-t-748-03cbecb6d545"></a>
### T-748 · 补齐“重新输入激活码”原生命令 ACL 并重打官方包

原始七列行（说明与文档链接逐字保留）：

|T-748|补齐“重新输入激活码”原生命令 ACL 并重打官方包|🔨 待办|—|—|[详情](BACKLOG-details.md#t-748)|详情见外置记录。|

<a id="t1410-t-741-a18310b4e87e"></a>
### T-741 · 下移知识库“记一条经验”入口到录入操作行

原始七列行（说明与文档链接逐字保留）：

|T-741|下移知识库“记一条经验”入口到录入操作行|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-741)|详情见外置记录。|

<a id="t1410-t-739-c4c35daefd3b"></a>
### T-739 · 根治制作视频跨项目灌入 B-roll、无证据改稿偏好与超长复盘卡

原始七列行（说明与文档链接逐字保留）：

|T-739|根治制作视频跨项目灌入 B-roll、无证据改稿偏好与超长复盘卡|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-739)|详情见外置记录。|

<a id="t1410-t-738-e19849de070d"></a>
### T-738 · 根治发布物料生成成功后无处查看并恢复卡内查看闭环

原始七列行（说明与文档链接逐字保留）：

|T-738|根治发布物料生成成功后无处查看并恢复卡内查看闭环|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-738)|详情见外置记录。|

<a id="t1410-t-735-db738286c73c"></a>
### T-735 · 根治渠道受管模型成功产物被误判失败并建立 C 端稳定性闭环

原始七列行（说明与文档链接逐字保留）：

|T-735|根治渠道受管模型成功产物被误判失败并建立 C 端稳定性闭环|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-735)|详情见外置记录。|

<a id="t1410-t-734-24808aca84b0"></a>
### T-734 · 根治 Windows 扫码绑定在启动前误依赖缺失 Playwright CLI

原始七列行（说明与文档链接逐字保留）：

|T-734|根治 Windows 扫码绑定在启动前误依赖缺失 Playwright CLI|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-734)|详情见外置记录。|

<a id="t1410-t-733-68487c39e6f5"></a>
### T-733 · 本地模型可用时收起渠道配置误报警并纠正票据不适用状态

原始七列行（说明与文档链接逐字保留）：

|T-733|本地模型可用时收起渠道配置误报警并纠正票据不适用状态|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-733)|详情见外置记录。|

<a id="t1410-t-732-267e4b61cb47"></a>
### T-732 · 根治局部改稿锚点失效后阻断全部 Copilot 对话

原始七列行（说明与文档链接逐字保留）：

|T-732|根治局部改稿锚点失效后阻断全部 Copilot 对话|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-732)|详情见外置记录。|

<a id="t1410-t-730-68ad882a4f6d"></a>
### T-730 · 恢复可选“立论点”UI并增加适用场景引导，不重新变成写稿门槛

原始七列行（说明与文档链接逐字保留）：

|T-730|恢复可选“立论点”UI并增加适用场景引导，不重新变成写稿门槛|🔨 待办|PASS[REV:aeda30778cf2]|待验|[详情](BACKLOG-details.md#t-730)  [SPEC](docs/superpowers/specs/2026-08-09-optional-thesis-guidance.md)|详情见外置记录。|

<a id="t1410-t-731-e0956dae9c02"></a>
### T-731 · 支持按电商等创作场景生成并自定义创作框架

原始七列行（说明与文档链接逐字保留）：

|T-731|支持按电商等创作场景生成并自定义创作框架|📋 待办|—|待验|[详情](BACKLOG-details.md#t-731)|详情见外置记录。|

<a id="t1410-t-729-dbb2952da3ee"></a>
### T-729 · 根治渠道专属包仍跳官方入口并拆分官网、下载、人工反馈与反馈 API

原始七列行（说明与文档链接逐字保留）：

|T-729|根治渠道专属包仍跳官方入口并拆分官网、下载、人工反馈与反馈 API|📋 待办|—|待验|[详情](BACKLOG-details.md#t-729)|详情见外置记录。|

<a id="t1410-t-726-870029288738"></a>
### T-726 · 退役项目“论点骨架”并让写稿直接消费 Brief 与素材

原始七列行（说明与文档链接逐字保留）：

|T-726|退役项目“论点骨架”并让写稿直接消费 Brief 与素材|🔨 待办|PASS[REV:a9cb8ebdc520]|待验|[详情](BACKLOG-details.md#t-726)  [SPEC](docs/superpowers/specs/2026-08-08-thesis-skeleton-retirement.md)|详情见外置记录。|

<a id="t1410-t-721-1befb41f5352"></a>
### T-721 · 根治素材包导出回流造成递归嵌套并恢复大素材库完整可见性

原始七列行（说明与文档链接逐字保留）：

|T-721|根治素材包导出回流造成递归嵌套并恢复大素材库完整可见性|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-721)|详情见外置记录。|

<a id="t1410-t-720-eed05b43484e"></a>
### T-720 · 根治特定 Windows 设备抖音内置浏览器页面崩溃导致内容雷达主页验证失败

原始七列行（说明与文档链接逐字保留）：

|T-720|根治特定 Windows 设备抖音内置浏览器页面崩溃导致内容雷达主页验证失败|📋 待办|—|待验|[详情](BACKLOG-details.md#t-720)|详情见外置记录。|

<a id="t1410-t-719-fe24ac134190"></a>
### T-719 · 根治桌面端启动后二次白屏闪烁与首页排期提醒不可用

原始七列行（说明与文档链接逐字保留）：

|T-719|根治桌面端启动后二次白屏闪烁与首页排期提醒不可用|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-719)|详情见外置记录。|

<a id="t1410-t-718-524385946410"></a>
### T-718 · 补齐智溯AI包内品牌并交付完整 Growth 配置后重打本地包

原始七列行（说明与文档链接逐字保留）：

|T-718|补齐智溯AI包内品牌并交付完整 Growth 配置后重打本地包|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-718)|详情见外置记录。|

<a id="t1410-t-716-d9030716b87b"></a>
### T-716 · 完善 Copilot 局部改稿、脚本版本回退、附件上下文与素材中心稳定排序

原始七列行（说明与文档链接逐字保留）：

|T-716|完善 Copilot 局部改稿、脚本版本回退、附件上下文与素材中心稳定排序|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-716)|详情见外置记录。|

<a id="t1410-t-715-dd9b0eeb399e"></a>
### T-715 · 在 CreatorOS 增加 Growth AI 额度账户连接、查看与充值入口

原始七列行（说明与文档链接逐字保留）：

|T-715|在 CreatorOS 增加 Growth AI 额度账户连接、查看与充值入口|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-715)|详情见外置记录。|

<a id="t1410-t-714-87fa67b717d2"></a>
### T-714 · 接入工程教训闭环并迁移旧账本，确保真实踩坑可被后续任务自动复用

原始七列行（说明与文档链接逐字保留）：

|T-714|接入工程教训闭环并迁移旧账本，确保真实踩坑可被后续任务自动复用|📋 待办|—|待验|[详情](BACKLOG-details.md#t-714)|详情见外置记录。|

<a id="t1410-t-713-43545d2c9c9d"></a>
### T-713 · 构建包含通用智能体语义边界与当前制作修复的 macOS 0.3.0 本地测试包

原始七列行（说明与文档链接逐字保留）：

|T-713|构建包含通用智能体语义边界与当前制作修复的 macOS 0.3.0 本地测试包|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-713)|详情见外置记录。|

<a id="t1410-t-712-badf714282f3"></a>
### T-712 · 优先采用用户上传素材进入 B-roll 时间线、恢复成片预览并收回渠道同步常驻提示

原始七列行（说明与文档链接逐字保留）：

|T-712|优先采用用户上传素材进入 B-roll 时间线、恢复成片预览并收回渠道同步常驻提示|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-712)|详情见外置记录。|

<a id="t1410-t-709-37fd2e902a86"></a>
### T-709 · 将 macOS Developer ID 签名与 Apple 公证凭据接入 GitHub 正式发布流水线

原始七列行（说明与文档链接逐字保留）：

|T-709|将 macOS Developer ID 签名与 Apple 公证凭据接入 GitHub 正式发布流水线|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-709)|详情见外置记录。|

<a id="t1410-t-708-252c96d64706"></a>
### T-708 · 全局审计并软化 AI 工具中不合理的创作完整度门禁

原始七列行（说明与文档链接逐字保留）：

|T-708|全局审计并软化 AI 工具中不合理的创作完整度门禁|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-708)|详情见外置记录。|

<a id="t1410-t-707-8a241ec5df8f"></a>
### T-707 · 将定位前采收敛为 Copilot 主导的自适应编导访谈并直接闭环定位中心

原始七列行（说明与文档链接逐字保留）：

|T-707|将定位前采收敛为 Copilot 主导的自适应编导访谈并直接闭环定位中心|🔨 待办|PASS[REV:3a3d3862a60b]|待验|[详情](BACKLOG-details.md#t-707)  [SPEC](docs/superpowers/specs/2026-08-01-positioning-pre-interview-workflow.md)|详情见外置记录。|

<a id="t1410-t-705-e29c33c02e5e"></a>
### T-705 · 根治 macOS 本地包启动后落入 Page Not Found

原始七列行（说明与文档链接逐字保留）：

|T-705|根治 macOS 本地包启动后落入 Page Not Found|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-705)|详情见外置记录。|

<a id="t1410-t-703-ac13f165c710"></a>
### T-703 · 根治视频制作从分镜到预览、对话调剪、采纳与再制作的多处断裂并重打本地包

原始七列行（说明与文档链接逐字保留）：

|T-703|根治视频制作从分镜到预览、对话调剪、采纳与再制作的多处断裂并重打本地包|🔨 待办|PASS[REV:7146b662ddb2]|待验|[详情](BACKLOG-details.md#t-703)  [SPEC](docs/superpowers/specs/2026-08-05-video-production-editing-loop.md)|详情见外置记录。|

<a id="t1410-t-702-879bf45934dd"></a>
### T-702 · 根治审核“应用改写”后分镜稿格式坍缩为 Markdown 表格源码

原始七列行（说明与文档链接逐字保留）：

|T-702|根治审核“应用改写”后分镜稿格式坍缩为 Markdown 表格源码|📋 待办|—|待验|[详情](BACKLOG-details.md#t-702)|详情见外置记录。|

<a id="t1410-t-695-ac298f778f52"></a>
### T-695 · 清理应用内硬编码品牌并让白标用户表面保持中性

原始七列行（说明与文档链接逐字保留）：

|T-695|清理应用内硬编码品牌并让白标用户表面保持中性|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-695)|详情见外置记录。|

<a id="t1410-t-691-619009dd3a6b"></a>
### T-691 · 补齐 Copilot 单项目全生命周期、跨项目历史与审核改稿工具闭环

原始七列行（说明与文档链接逐字保留）：

|T-691|补齐 Copilot 单项目全生命周期、跨项目历史与审核改稿工具闭环|🔨 待办|PASS[REV:702e78ce0ae0]|待验|[详情](BACKLOG-details.md#t-691)  [SPEC](docs/superpowers/specs/2026-08-04-copilot-project-lifecycle-tool-closure.md)|详情见外置记录。|

<a id="t1410-t-694-5b4ca5337ca0"></a>
### T-694 · 建立多渠道专属包工厂、项目级出包 Skill 与安全增量更新闭环

原始七列行（说明与文档链接逐字保留）：

|T-694|建立多渠道专属包工厂、项目级出包 Skill 与安全增量更新闭环|🔨 待办|PASS[REV:96e12f85f1b3]|待验|[详情](BACKLOG-details.md#t-694)  [SPEC](docs/superpowers/specs/2026-08-04-channel-package-factory-and-incremental-update.md)|详情见外置记录。|

<a id="t1410-t-686-b695d6e03641"></a>
### T-686 · 根治定位前采联网补充直接报错并恢复国内中文公开检索

原始七列行（说明与文档链接逐字保留）：

|T-686|根治定位前采联网补充直接报错并恢复国内中文公开检索|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-686)|详情见外置记录。|

<a id="t1410-t-687-88bf698d49c4"></a>
### T-687 · 建立口播联想画面 Skill 并打通图序号引用、项目 B-roll 与成片渲染

原始七列行（说明与文档链接逐字保留）：

|T-687|建立口播联想画面 Skill 并打通图序号引用、项目 B-roll 与成片渲染|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-687)|详情见外置记录。|

<a id="t1410-t-685-94a8cbf855f9"></a>
### T-685 · 排查并根治全流程写稿长度失控及审核不识别已采纳文案卡

原始七列行（说明与文档链接逐字保留）：

|T-685|排查并根治全流程写稿长度失控及审核不识别已采纳文案卡|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-685)|详情见外置记录。|

<a id="t1410-t-684-aa25cd834b1b"></a>
### T-684 · 根治 Copilot 联网搜素材失败后回退模型记忆并误导配置搜索模型

原始七列行（说明与文档链接逐字保留）：

|T-684|根治 Copilot 联网搜素材失败后回退模型记忆并误导配置搜索模型|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-684)|详情见外置记录。|

<a id="t1410-t-683-3da2b36a063b"></a>
### T-683 · 修复 Copilot 在 Windows 无法读取盘符绝对路径与目录授权失效

原始七列行（说明与文档链接逐字保留）：

|T-683|修复 Copilot 在 Windows 无法读取盘符绝对路径与目录授权失效|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-683)|详情见外置记录。|

<a id="t1410-t-679-eeec7b544582"></a>
### T-679 · 接入 Growth 按激活权益签发的受管模型凭据、真实模型白名单与用户选择

原始七列行（说明与文档链接逐字保留）：

|T-679|接入 Growth 按激活权益签发的受管模型凭据、真实模型白名单与用户选择|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-679)|详情见外置记录。|

<a id="t1410-t-678-c1c3071def54"></a>
### T-678 · 根治内容雷达生成选题继续读取旧定位

原始七列行（说明与文档链接逐字保留）：

|T-678|根治内容雷达生成选题继续读取旧定位|📋 待办|—|待验|[详情](BACKLOG-details.md#t-678)|详情见外置记录。|

<a id="t1410-t-677-f41c621a75ea"></a>
### T-677 · 优化首页与定位中心切换时整页骨架卡顿 1–2 秒

原始七列行（说明与文档链接逐字保留）：

|T-677|优化首页与定位中心切换时整页骨架卡顿 1–2 秒|📋 待办|—|待验|[详情](BACKLOG-details.md#t-677)|详情见外置记录。|

<a id="t1410-t-676-4828ccad4a2f"></a>
### T-676 · 根治云端 ASR 测试假阳性并接通 StepFun，同时修复 Windows 本地 Whisper 回退

原始七列行（说明与文档链接逐字保留）：

|T-676|根治云端 ASR 测试假阳性并接通 StepFun，同时修复 Windows 本地 Whisper 回退|📋 待办|—|待验|[详情](BACKLOG-details.md#t-676)|详情见外置记录。|

<a id="t1410-t-671-1c654321f5c0"></a>
### T-671 · 确定 CreatorOS 代理商业模式与官网价格边界

原始七列行（说明与文档链接逐字保留）：

|T-671|确定 CreatorOS 代理商业模式与官网价格边界|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-671)|详情见外置记录。|

<a id="t1410-t-670-27b995d191c1"></a>
### T-670 · 恢复 CreatorOS 部署前真实官网并收口公开商业信息

原始七列行（说明与文档链接逐字保留）：

|T-670|恢复 CreatorOS 部署前真实官网并收口公开商业信息|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-670)|详情见外置记录。|

<a id="t1410-t-666-e7e096b028b7"></a>
### T-666 · 根治定位前采误清空既有定位并改为非破坏草稿切换

原始七列行（说明与文档链接逐字保留）：

|T-666|根治定位前采误清空既有定位并改为非破坏草稿切换|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-666)|详情见外置记录。|

<a id="t1410-t-665-23a1e4ca2ff3"></a>
### T-665 · 支持彻底删除内容雷达信源及其全部归属数据

原始七列行（说明与文档链接逐字保留）：

|T-665|支持彻底删除内容雷达信源及其全部归属数据|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-665)|详情见外置记录。|

<a id="t1410-t-662-a0df4d644a86"></a>
### T-662 · 根治成片把内部结构标签当正文并优化卡片文字重合

原始七列行（说明与文档链接逐字保留）：

|T-662|根治成片把内部结构标签当正文并优化卡片文字重合|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-662)|详情见外置记录。|

<a id="t1410-t-661-44130e3b9c8f"></a>
### T-661 · 根治项目素材未进入制作、采纳后仍转圈及素材包图片无扩展名

原始七列行（说明与文档链接逐字保留）：

|T-661|根治项目素材未进入制作、采纳后仍转圈及素材包图片无扩展名|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-661)|详情见外置记录。|

<a id="t1410-t-660-0c7f6f637612"></a>
### T-660 · 根治雷达预填逐字稿未解锁下一步及已采纳封面仍被判缺失

原始七列行（说明与文档链接逐字保留）：

|T-660|根治雷达预填逐字稿未解锁下一步及已采纳封面仍被判缺失|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-660)|详情见外置记录。|

<a id="t1410-t-656-3ba4f12a34bc"></a>
### T-656 · 收紧桌面授权本地信任链，移除生产冒烟旁路并消除 verdict 私钥明文靶点

原始七列行（说明与文档链接逐字保留）：

|T-656|收紧桌面授权本地信任链，移除生产冒烟旁路并消除 verdict 私钥明文靶点|🔨 待办|PASS[REV:0ee97952c9a3]|待验|[详情](BACKLOG-details.md#t-656)  [SPEC](docs/superpowers/specs/2026-08-02-desktop-verdict-basic-hardening.md)|详情见外置记录。|

<a id="t1410-t-655-58b5a4902b9d"></a>
### T-655 · 接通 Seedance 文生视频适配器并修复 `seeddance` 配置报未知 provider

原始七列行（说明与文档链接逐字保留）：

|T-655|接通 Seedance 文生视频适配器并修复 `seeddance` 配置报未知 provider|🔨 待办|—|—|[详情](BACKLOG-details.md#t-655)|详情见外置记录。|

<a id="t1410-t-654-a7e8fc757a1b"></a>
### T-654 · 新增 Qwen 方言 ASR 适配器并接入设置预设

原始七列行（说明与文档链接逐字保留）：

|T-654|新增 Qwen 方言 ASR 适配器并接入设置预设|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-654)|详情见外置记录。|

<a id="t1410-t-653-30d59deb2d96"></a>
### T-653 · 支持本地自配与渠道子 Key 托管双模式模型供给

原始七列行（说明与文档链接逐字保留）：

|T-653|支持本地自配与渠道子 Key 托管双模式模型供给|📋 待办|待审|待验|[详情](BACKLOG-details.md#t-653)|详情见外置记录。|

<a id="t1410-t-652-98d2b3aa167f"></a>
### T-652 · 重构定位前采为必经的编导式访谈与证据辅助工作流

原始七列行（说明与文档链接逐字保留）：

|T-652|重构定位前采为必经的编导式访谈与证据辅助工作流|🔨 待办|PASS[REV:6a06cf4f57d9]|待验|[SPEC](docs/superpowers/specs/2026-08-01-positioning-pre-interview-workflow.md) · [详情](BACKLOG-details.md#t-652)|详情见外置记录。|

<a id="t1410-t-650-ee680ec3d8a4"></a>
### T-650 · 知识倾倒输入框支持拖拽文件直接导入

原始七列行（说明与文档链接逐字保留）：

|T-650|知识倾倒输入框支持拖拽文件直接导入|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-650)|详情见外置记录。|

<a id="t1410-t-651-886a170a9fc0"></a>
### T-651 · 内容雷达默认按作品真实发布时间倒序

原始七列行（说明与文档链接逐字保留）：

|T-651|内容雷达默认按作品真实发布时间倒序|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-651)|详情见外置记录。|

<a id="t1410-t-649-c41297608ccb"></a>
### T-649 · 调研并设计激活后渠道白标：品牌名、应用内 Logo 与系统级图标边界

原始七列行（说明与文档链接逐字保留）：

|T-649|调研并设计激活后渠道白标：品牌名、应用内 Logo 与系统级图标边界|📋 待办|—|待验|[详情](BACKLOG-details.md#t-649)|详情见外置记录。|

<a id="t1410-t-646-b516de59078d"></a>
### T-646 · 统一优化结构化 AI 工具为结果优先、分段生成与局部修复

原始七列行（说明与文档链接逐字保留）：

|T-646|统一优化结构化 AI 工具为结果优先、分段生成与局部修复|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-646)|详情见外置记录。|

<a id="t1410-t-645-2b951868243c"></a>
### T-645 · 收敛模型配置项并同步精简 Growth 渠道模板

原始七列行（说明与文档链接逐字保留）：

|T-645|收敛模型配置项并同步精简 Growth 渠道模板|🔨 待办|PASS[REV:21e54e5382a4]|待验|[详情](BACKLOG-details.md#t-645)  [SPEC](docs/superpowers/specs/2026-08-02-capability-scoped-channel-model-authority.md)|详情见外置记录。|

<a id="t1410-t-644-2f951f57e13f"></a>
### T-644 · 根治 CreatorOS macOS 客户端持续闪屏

原始七列行（说明与文档链接逐字保留）：

|T-644|根治 CreatorOS macOS 客户端持续闪屏|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-644)|详情见外置记录。|

<a id="t1410-t-643-d944f8512409"></a>
### T-643 · 收口 CreatorOS 为输入 Activity 激活码后直接授权，隐藏当前权益领取入口

原始七列行（说明与文档链接逐字保留）：

|T-643|收口 CreatorOS 为输入 Activity 激活码后直接授权，隐藏当前权益领取入口|📋 待办|—|待验|[详情](BACKLOG-details.md#t-643)|详情见外置记录。|

<a id="t1410-t-642-c9b4512eb7ab"></a>
### T-642 · 打通内容雷达对标文案→改写策略→选题卡→项目写稿的编导证据链

原始七列行（说明与文档链接逐字保留）：

|T-642|打通内容雷达对标文案→改写策略→选题卡→项目写稿的编导证据链|🔨 待办|PASS[REV:ded8361cdf11]|待验|[SPEC](docs/superpowers/specs/2026-08-01-content-radar-creative-handoff.md) · [详情](BACKLOG-details.md#t-642)|详情见外置记录。|

<a id="t1410-t-641-9ffe57e433bd"></a>
### T-641 · 根治发布中心“登录多日仍只有一个采集日、发布趋势不出曲线”

原始七列行（说明与文档链接逐字保留）：

|T-641|根治发布中心“登录多日仍只有一个采集日、发布趋势不出曲线”|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-641)|详情见外置记录。|

<a id="t1410-t-640-ac15d2c14bd5"></a>
### T-640 · 配置 Apple Developer ID 签名与公证，并在前序修复全部闭环后统一产出本地安装包

原始七列行（说明与文档链接逐字保留）：

|T-640|配置 Apple Developer ID 签名与公证，并在前序修复全部闭环后统一产出本地安装包|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-640)|详情见外置记录。|

<a id="t1410-t-635-188b02fdcdb9"></a>
### T-635 · 把 CreatorOS 正式构建绑定到 Growth 商品的统一 `projectKey`，禁止运行时覆盖产品身份或关闭严格验签

原始七列行（说明与文档链接逐字保留）：

|T-635|把 CreatorOS 正式构建绑定到 Growth 商品的统一 `projectKey`，禁止运行时覆盖产品身份或关闭严格验签|🔨 本地实现待验|PASS[REV:263c231fa57c]|待验|[详情](BACKLOG-details.md#t-635)  [SPEC](docs/superpowers/specs/2026-07-30-growth-product-identity-binding.md)|详情见外置记录。|

<a id="t1410-t-633-d77bac2eb8cb"></a>
### T-633 · 恢复创作者中心自动扫码登录

原始七列行（说明与文档链接逐字保留）：

|T-633|恢复创作者中心自动扫码登录|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-633)|原范围和历史证据见[完整记录](BACKLOG-details.md#t1080-retained-row-f9f6ea5f8246191a)。|

<a id="t1410-t-632-517e117e3f70"></a>
### T-632 · 根治“新建定位母版”无效、历史母版无法恢复与逐字稿提取长时间无结果

原始七列行（说明与文档链接逐字保留）：

|T-632|根治“新建定位母版”无效、历史母版无法恢复与逐字稿提取长时间无结果|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-632)|详情见外置记录。|

<a id="t1410-t-631-3e254430b7e5"></a>
### T-631 · 根治大视频上传被 10MB 截断并误报 ffmpeg 缺失

原始七列行（说明与文档链接逐字保留）：

|T-631|根治大视频上传被 10MB 截断并误报 ffmpeg 缺失|🔨 待办|—|待验|[详情](BACKLOG-details.md#t-631)|详情见外置记录。|

<a id="t1410-t-621-837ecd0465d4"></a>
### T-621 · 补齐渠道模型 authority snapshot 生产链路回归

原始七列行（说明与文档链接逐字保留）：

|T-621|补齐渠道模型 authority snapshot 生产链路回归|📋 待办|—|—|[详情](BACKLOG-details.md#t-621)|详情见外置记录。|

<a id="t1410-t-576-20adaa4a861a"></a>
### T-576 · 统一跟进尚未关闭的飞书线上用户反馈

原始七列行（说明与文档链接逐字保留）：

|T-576|统一跟进尚未关闭的飞书线上用户反馈|🔨 免审|—|—|[详情](BACKLOG-details.md#t-576)|详情见外置记录。|

<a id="t1410-t-575-e4638250d7c3"></a>
### T-575 · 接通 CreatorOS 权益领取、渠道配置与问题反馈

原始七列行（说明与文档链接逐字保留）：

|T-575|接通 CreatorOS 权益领取、渠道配置与问题反馈|🔨 本地PASS·待生产E2E|—|待验|[详情](BACKLOG-details.md#t-575)|详情见外置记录。|

<a id="t1410-t-562-9c69303f6644"></a>
### T-562 · 根治 CreatorOS 0.2.0 Windows 安装后持续白屏

原始七列行（说明与文档链接逐字保留）：

|T-562|根治 CreatorOS 0.2.0 Windows 安装后持续白屏|🔨 免审|—|待验|[详情](BACKLOG-details.md#t-562)|详情见外置记录。|

<a id="t1410-t-548-ae8113be7940"></a>
### T-548 · 根治视频渲染重试后成片脱离项目且制作页实时预览消失

原始七列行（说明与文档链接逐字保留）：

|T-548|根治视频渲染重试后成片脱离项目且制作页实时预览消失|🔨 待安装版真机|—|待验|[详情](BACKLOG-details.md#t-548)|详情见外置记录。|

<a id="t1410-t-538-4d01637aa6e6"></a>
### T-538 · 接通渠道签名上下文的产品问题反馈

原始七列行（说明与文档链接逐字保留）：

|T-538|接通渠道签名上下文的产品问题反馈|🔨 本地PASS·待生产E2E|—|待验|[详情](BACKLOG-details.md#t-538)|详情见外置记录。|

<a id="t1410-t-536-70030b7d53ac"></a>
### T-536 · 根治“我的收藏”同步错误分类与浏览器档案锁恢复

原始七列行（说明与文档链接逐字保留）：

|T-536|根治“我的收藏”同步错误分类与浏览器档案锁恢复|🔨 待真实账号只读验收|—|待验|[详情](BACKLOG-details.md#t-536)|详情见外置记录。|

<a id="preserved-f931cc3bbeff05dc"></a>
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

|T-1397|修复main Verify并核实已知失败|🔨|—|—|[授权与验收](docs/features/t1397-verify-main-green.md)|用户授权契约漏登记、后端CI终止根因、完整本地测试与逐项known清单；6144串行类型检查及各包质量门，HTTPS普通推送并最多2轮追加修复，报告至terminals/ci-green。|

<a id="preserved-05c328bb05e870c2"></a>
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

|T-1369|修复首页平台筛选后的连续侧栏导航卡死|🔨|PASS[REV:bcb32fe90d8b]|待验|[连续导航范围](docs/features/t1369-dashboard-filter-sidebar-navigation.md)|旧R3收据仅绑定6f8114；用户已明确允许本次新夹具单次cycle，真实DEC136909保，正式新cycle尚未记录；production01–03均前置FAIL、03残PG已后清理，04未执行/未证修复，本轮先整合代码。|

<a id="preserved-5952855faab522c9"></a>
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

|T-1255|加密日志直传Growth、异常采集与运行指标观测|🔨 待办|PASS[REV:9700ff342ac4]|待验|[原直传合同](docs/features/t1255-reporting-full-delivery.md) · [观测方案候选](docs/features/t1255-observability-research.md)|10/21公开get原观察超600秒未取回执、仅停自有CLI，今日上传状态未知；保10/18真回执、10/20所见422及T1378/Growth T248本地39PASS候选，owner/完整解密/指标待核，不催传或签完成，见desktop-agent-live/RESULT.md。 |

<a id="preserved-2bfb71eb56ee60ff"></a>
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

|T-1072-owned-devices|配合 Growth 轻量手机号账号与正式双设备，补齐新电脑连接与已激活账号入口|🔨 待办|PASS[REV:351f7db55691]|待验|[SPEC](docs/features/t1072-owned-devices.md)|原范围和历史证据见[完整记录](BACKLOG-details.md#t1080-retained-row-aed1560bebc24ab1)。|

<a id="preserved-950b8fdc976f8a08"></a>
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

|T-1071|修复账号绑定和页面Tab切换卡顿|🔨 待办|PASS[REV:a53e25bf48df]|待验|[SPEC](docs/features/t1071-navigation-latency.md) [详情](BACKLOG-details.md#t-1071)|见详情。|

<a id="preserved-d0c63987467f6c90"></a>
原始表头：ID | 任务 | 状态 | 审核 | 验收 | 文档 | 一句话

|T-1021|CreatorOS封面与小红书图文双模板库、行业分类及私人收藏|🔨 待办|PASS[REV:a6345304472d]|待验|[SPEC](docs/features/t1021-cover-template-library.md)|原范围和历史证据见[完整记录](BACKLOG-details.md#t1080-retained-row-d0c6d059440fcd70)。|

<a id="t-1418"></a>

<a id="m-b390e375"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1418",
  "title": "修复创作者总览筛选读取慢与等待路径",
  "narrative": "按真实月明水清深数据定位重复/串行读取，保留账号隔离与正确筛选结果。",
  "documents": "[SPEC](docs/features/t1418-creator-overview-read-performance.md)",
  "source_line": "|T-1418|修复创作者总览筛选读取慢与等待路径|🔨|PASS[REV:8fc500f6763a]|待验|[SPEC](docs/features/t1418-creator-overview-read-performance.md)|按真实月明水清深数据定位重复/串行读取，保留账号隔离与正确筛选结果。|",
  "source_sha256": "f7c3d490d9881d2d6bb3be5de317219b07d1fb4f271bd23b758acf9f21f7222f",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1419"></a>

<a id="m-ea2c717e"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1419",
  "title": "简化文章工作台并恢复公众号排版风格切换",
  "narrative": "移除创作流程里的来源许可说明，从历史恢复可保存、预览、导出的多风格切换。",
  "documents": "[SPEC](docs/features/t1419-article-workbench-style-restoration.md)",
  "source_line": "|T-1419|简化文章工作台并恢复公众号排版风格切换|🔨|PASS[REV:66d05b52db53]|待验|[SPEC](docs/features/t1419-article-workbench-style-restoration.md)|移除创作流程里的来源许可说明，从历史恢复可保存、预览、导出的多风格切换。|",
  "source_sha256": "0cd0b76d0431dfe20904ea56bffac7247d3a2c32329b9d31478cbd580aa06d12",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1420"></a>

<a id="m-f9e9b2dc"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1420",
  "title": "以文生图生成小红书逐页配图与独立配文",
  "narrative": "用户2026-10-26再次明确：逐页图片必须调用AI文生图，不能用文字排版卡片冒充；复用已有组图生成、预览采纳与真实图片导出链。 接手检查与阻塞：[2026-10-28证据](docs/verification/t1420/handoff-20261028/README.md)。 本机账号组1经用户确认正确；独立验收两张真实图已生成采纳并精确回读，正文、旧安装界面与ZIP未通过，详见[重新验收](docs/verification/t1420/handoff-20261028/reverify-report.md)。 两个旧稿兼容原始样本已按用户提供的下载文件原样补回，兼容回归52/52通过。 测试文件仅去掉末尾多余空行以通过diff检查，断言未变。",
  "documents": "[SPEC](docs/features/t1420-graphic-post-content-structure.md)",
  "source_line": "|T-1420|以文生图生成小红书逐页配图与独立配文|⏸️|PASS[REV:a66a51f4d977]|待验|[SPEC](docs/features/t1420-graphic-post-content-structure.md)|用户2026-10-26再次明确：逐页图片必须调用AI文生图，不能用文字排版卡片冒充；复用已有组图生成、预览采纳与真实图片导出链。 接手检查与阻塞：[2026-10-28证据](docs/verification/t1420/handoff-20261028/README.md)。 本机账号组1经用户确认正确；独立验收两张真实图已生成采纳并精确回读，正文、旧安装界面与ZIP未通过，详见[重新验收](docs/verification/t1420/handoff-20261028/reverify-report.md)。 两个旧稿兼容原始样本已按用户提供的下载文件原样补回，兼容回归52/52通过。 测试文件仅去掉末尾多余空行以通过diff检查，断言未变。|",
  "source_sha256": "03732ea9876d9d8e181e3887315c70304b4b67893fc1b6dcb7da64081cb53ff0",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1413"></a>

<a id="m-19dc128e"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1413",
  "title": "恢复重构后六项lesson正式链语义覆盖",
  "narrative": "修复3个已删除测试文件的6处守卫引用；补齐当前链语义与严格封面参考约束，官方图片恢复须先证明幂等资格。",
  "documents": "[SPEC](docs/features/t1413-lesson-semantic-coverage.md)",
  "source_line": "|T-1413|恢复重构后六项lesson正式链语义覆盖|⏸️|PASS[REV:c1d93ff9d0e3]|—|[SPEC](docs/features/t1413-lesson-semantic-coverage.md)|修复3个已删除测试文件的6处守卫引用；补齐当前链语义与严格封面参考约束，官方图片恢复须先证明幂等资格。|",
  "source_sha256": "a28525644aa5bb32dec1e9c9975e68a3d44b30df4c7962d48e12f743c77bf8c5",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1407"></a>

<a id="m-8782f861"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1407",
  "title": "整理现有修复、安装复验并准备合并推送",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1407-local-integration-install-merge-preparation.md)",
  "source_line": "|T-1407|整理现有修复、安装复验并准备合并推送|⏸️|PASS[REV:9e869f1d693f]|待验|[SPEC](docs/features/t1407-local-integration-install-merge-preparation.md)|[D]|",
  "source_sha256": "3d9d29f04a0f4cb0b7c9ecc63c9d96f088e05a8fc40d5a6f5ff52ae395dcc294",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1400"></a>

<a id="m-13a5c831"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1400",
  "title": "修复选题 Copilot 长候选采纳区裁切",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1400-topic-adoption-scroll.md)",
  "source_line": "|T-1400|修复选题 Copilot 长候选采纳区裁切|⏸️|—|待验|[SPEC](docs/features/t1400-topic-adoption-scroll.md)|[D]|",
  "source_sha256": "584f19cdd8fdb42af968124311616a2f6c762852df0651097f88728c3f17ea8b",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1399"></a>

<a id="m-f5da2329"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1399",
  "title": "固定侧栏 AI 助手页脚与收拢入口",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1399-sidebar-assistant-footer.md)",
  "source_line": "|T-1399|固定侧栏 AI 助手页脚与收拢入口|⏸️|—|待验|[SPEC](docs/features/t1399-sidebar-assistant-footer.md)|[D]|",
  "source_sha256": "767e9bfca5e2e673a89ce684a945fc34e1633551b7ac1a77c6aae32243e3f31f",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1398"></a>

<a id="m-62b0a1bf"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1398",
  "title": "修复 Copilot DeepSeek 强制工具请求、失败重试与错误诊断丢失",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1398-copilot-deepseek-failure.md)",
  "source_line": "|T-1398|修复 Copilot DeepSeek 强制工具请求、失败重试与错误诊断丢失|🔨|—|待验|[SPEC](docs/features/t1398-copilot-deepseek-failure.md)|[D]|",
  "source_sha256": "e5216404d017db1c28078ac4158ae77f35a0e556dd1bf158da06120bcd06cf92",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1397"></a>

<a id="m-f7d02044"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1397",
  "title": "修复main Verify并核实已知失败",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1397-verify-main-green.md)",
  "source_line": "|T-1397|修复main Verify并核实已知失败|⏸️|—|—|[SPEC](docs/features/t1397-verify-main-green.md)|[D]|",
  "source_sha256": "f0f11f81548707bebb266e5694e62a5cb9af48644d1ae37aef28381c36085da1",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1380"></a>

<a id="m-37b1d9e4"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1380",
  "title": "解除协作者本地Mac完整构建对作者私钥的依赖",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1380-independent-local-mac-build.md)",
  "source_line": "|T-1380|解除协作者本地Mac完整构建对作者私钥的依赖|⏸️|PASS[REV:fade0e6a2c0c]|—|[SPEC](docs/features/t1380-independent-local-mac-build.md)|[D]|",
  "source_sha256": "c29f5eb9b3c94a34325c0acfcb3f731248ac1d28bb2c2abe40e1cc4aaef28f60",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1378"></a>

<a id="m-09c149db"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1378",
  "title": "诊断每日观测HTTP422与接收端固定清单兼容",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1378-observability-http-422-registry-diagnosis.md)",
  "source_line": "|T-1378|诊断每日观测HTTP422与接收端固定清单兼容|🔨|PASS[REV:48c6e24fa806]|—|[SPEC](docs/features/t1378-observability-http-422-registry-diagnosis.md)|[D]|",
  "source_sha256": "54727545b52045af978a48b659e5c5b6d9d44cb317f60b2d9a49940b5659f875",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1385"></a>

<a id="m-9fb8f94c"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1385",
  "title": "修复 Verify 的 Node 堆内存耗尽",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1385-verify-ci-memory.md)",
  "source_line": "|T-1385|修复 Verify 的 Node 堆内存耗尽|🔨|—|—|[SPEC](docs/features/t1385-verify-ci-memory.md)|[D]|",
  "source_sha256": "f796e2fbce82c31b39f21dedd2f72e120849ed387ba0785186c8c3d75ee344c1",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1393"></a>

<a id="m-bc2110ff"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1393",
  "title": "按真实密度重排内容雷达三栏",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/ui-fixes-2026-10-21/T-1384.md)",
  "source_line": "|T-1393|按真实密度重排内容雷达三栏|⏸️|—|—|[SPEC](docs/features/ui-fixes-2026-10-21/T-1384.md)|[D]|",
  "source_sha256": "ac858e85c6c665ec0f109409a7a7ce2155d433934959e07d063b0224569f5084",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1392"></a>

<a id="m-8a269a7e"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1392",
  "title": "重新规划内容雷达三栏与来源操作布局",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/ui-fixes-2026-10-21/T-1383.md)",
  "source_line": "|T-1392|重新规划内容雷达三栏与来源操作布局|⏸️|—|—|[SPEC](docs/features/ui-fixes-2026-10-21/T-1383.md)|[D]|",
  "source_sha256": "8d27eea6b2b1b3abe037177d35a8c5189d6032bf7ea7151b7d983be379d2542c",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1387"></a>

<a id="m-ddee5cf9"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1387",
  "title": "统一主导航宽度并恢复选题页1440px完整布局",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/ui-fixes-2026-10-21/T-1378.md)",
  "source_line": "|T-1387|统一主导航宽度并恢复选题页1440px完整布局|⏸️|—|—|[SPEC](docs/features/ui-fixes-2026-10-21/T-1378.md)|[D]|",
  "source_sha256": "cd77f929705a090dedfb3c97070659c22478c13fa89e139c287c7e06b283e60a",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1388"></a>

<a id="m-6f6280ef"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1388",
  "title": "修复项目页首开自动滚动到口播脚本",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/ui-fixes-2026-10-21/T-1379.md)",
  "source_line": "|T-1388|修复项目页首开自动滚动到口播脚本|⏸️|—|—|[SPEC](docs/features/ui-fixes-2026-10-21/T-1379.md)|[D]|",
  "source_sha256": "563cae8eb32881030c77087f3ad8bd82201761cecc99f38f1c9b0123533305c5",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1389"></a>

<a id="m-db829267"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1389",
  "title": "补全选题来源中文标签与未知值兜底",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/ui-fixes-2026-10-21/T-1380.md)",
  "source_line": "|T-1389|补全选题来源中文标签与未知值兜底|⏸️|—|—|[SPEC](docs/features/ui-fixes-2026-10-21/T-1380.md)|[D]|",
  "source_sha256": "7071d6fe348be4c321adf67b0a1f2c462f31eaf22f126ec1f4084fbee2e6e298",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1390"></a>

<a id="m-1b596f8e"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1390",
  "title": "移除雷达作品卡片重复的升级为项目按钮",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/ui-fixes-2026-10-21/T-1381.md)",
  "source_line": "|T-1390|移除雷达作品卡片重复的升级为项目按钮|⏸️|—|—|[SPEC](docs/features/ui-fixes-2026-10-21/T-1381.md)|[D]|",
  "source_sha256": "5ebe7c795ed252e56f0cb53261aa5e52614e91d5fc508c7c2b72141899446949",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1391"></a>

<a id="m-b04550de"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1391",
  "title": "容错雷达作品未知转写状态避免整页崩溃",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/ui-fixes-2026-10-21/T-1382.md)",
  "source_line": "|T-1391|容错雷达作品未知转写状态避免整页崩溃|⏸️|—|—|[SPEC](docs/features/ui-fixes-2026-10-21/T-1382.md)|[D]|",
  "source_sha256": "cc61e246518a40adba3f795fecc4b24d4ac78fa476e53ec7b3c555fcda878650",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1374"></a>

<a id="m-b4aa8fc1"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1374",
  "title": "查明并恢复所有已绑定媒体的既有数据展示",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1374-all-bound-platform-data-recovery.md)",
  "source_line": "|T-1374|查明并恢复所有已绑定媒体的既有数据展示|⏸️|PASS[REV:16648a3ea984]|待验|[SPEC](docs/features/t1374-all-bound-platform-data-recovery.md)|[D]|",
  "source_sha256": "fd4f1af3f96e15e5d2d9f47fe01abf6fa6ae5902660fc88ee28dcb8eff8bdf1a",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1369"></a>

<a id="m-24dd95fa"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1369",
  "title": "修复首页平台筛选后的连续侧栏导航卡死",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1369-dashboard-filter-sidebar-navigation.md)",
  "source_line": "|T-1369|修复首页平台筛选后的连续侧栏导航卡死|🔨|PASS[REV:bcb32fe90d8b]|待验|[SPEC](docs/features/t1369-dashboard-filter-sidebar-navigation.md)|[D]|",
  "source_sha256": "673f079d62a97382323c74b58cbd17ae772910077dff815a463cd236754ebca3",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1373"></a>

<a id="m-32804d56"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1373",
  "title": "核对完整对账中真实CLI的用户目录与联网副作用",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1373-reconcile-cli-side-effect-isolation.md)",
  "source_line": "|T-1373|核对完整对账中真实CLI的用户目录与联网副作用|📋|待审|待验|[SPEC](docs/features/t1373-reconcile-cli-side-effect-isolation.md)|[D]|",
  "source_sha256": "29167d625da1ded3ee4762839b2b50f6bfef88be5d51c13d0fa5678c34f7e394",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1367"></a>

<a id="m-a494bc84"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1367",
  "title": "恢复视频号折叠导航下的报表入口",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1367-wechat-video-collapsed-navigation-entry.md)",
  "source_line": "|T-1367|恢复视频号折叠导航下的报表入口|⏸️|PASS[REV:c7a98f074848]|待验|[SPEC](docs/features/t1367-wechat-video-collapsed-navigation-entry.md)|[D]|",
  "source_sha256": "7b4623f50123239d2d111319f2d937d83c4abad897c7cb06dbe4753bb625e76e",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1366"></a>

<a id="m-e283ec32"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1366",
  "title": "核对导航诊断新增的旧宽路径收据失配",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1366-navigation-diagnosis-wide-receipt-drift.md)",
  "source_line": "|T-1366|核对导航诊断新增的旧宽路径收据失配|📋|待审|待验|[SPEC](docs/features/t1366-navigation-diagnosis-wide-receipt-drift.md)|[D]|",
  "source_sha256": "d6118da6999379b8d392323f225fefd382665c39b3e647658b9981ae1e266d7c",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1360"></a>

<a id="m-d013cd95"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1360",
  "title": "核对本批绑定首页与切组变更导致的旧宽路径收据失配",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1360-current-binding-dashboard-receipt-drift.md)",
  "source_line": "|T-1360|核对本批绑定首页与切组变更导致的旧宽路径收据失配|📋|待审|待验|[SPEC](docs/features/t1360-current-binding-dashboard-receipt-drift.md)|[D]|",
  "source_sha256": "a0218919b5593e18d90acfc244071eb32f5cd5de20d089b48604d51239f79b69",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1358"></a>

<a id="m-eb418a01"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1358",
  "title": "核对隔离首页首次装配与组读取长耗时",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1358-unselected-home-readiness-latency.md)",
  "source_line": "|T-1358|核对隔离首页首次装配与组读取长耗时|📋|待审|待验|[SPEC](docs/features/t1358-unselected-home-readiness-latency.md)|[D]|",
  "source_sha256": "0b08580d9dbc73b37731f6c923ca35653b6c1b303318eca7f5af8efaf37557ba",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1353"></a>

<a id="m-62fa9788"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1353",
  "title": "核对本轮工作区与日报接线导致的旧宽路径验收收据失配",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1353-current-batch-legacy-receipt-drift.md)",
  "source_line": "|T-1353|核对本轮工作区与日报接线导致的旧宽路径验收收据失配|📋|待审|待验|[SPEC](docs/features/t1353-current-batch-legacy-receipt-drift.md)|[D]|",
  "source_sha256": "8fc2d053c849a3246ca50d4be27180ae06408b55fa04b7492c5478b09787c76a",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1351"></a>

<a id="m-1176794c"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1351",
  "title": "核对账号管理进入组与驻留视频宿主的离开保护边界",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1351-manager-video-leave-guard-risk.md)",
  "source_line": "|T-1351|核对账号管理进入组与驻留视频宿主的离开保护边界|📋|待审|待验|[SPEC](docs/features/t1351-manager-video-leave-guard-risk.md)|[D]|",
  "source_sha256": "f3221350b53cebfab4c73336beb3fb7d9b93a4275e498f740cc7648fcec5fe65",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1349"></a>

<a id="m-e5a074ad"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1349",
  "title": "修复项目列表窄桌面首列标题归零与右侧动作裁切",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1349-project-list-responsive-columns.md)",
  "source_line": "|T-1349|修复项目列表窄桌面首列标题归零与右侧动作裁切|📋|待审|待验|[SPEC](docs/features/t1349-project-list-responsive-columns.md)|[D]|",
  "source_sha256": "1f091bf1e3c2e11b45bcc0f6eb76527374d4320437cf4eab3951c64fa9dc1fb3",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1336"></a>

<a id="m-ea6e0f16"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1336",
  "title": "核对校准结果到经验置信度的既有反馈预留",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1336-calibration-learning-confidence-bridge-observation.md)",
  "source_line": "|T-1336|核对校准结果到经验置信度的既有反馈预留|📋|待审|待验|[SPEC](docs/features/t1336-calibration-learning-confidence-bridge-observation.md)|[D]|",
  "source_sha256": "bf585bae676769aa8f94befb2161353bf7b96d4af7dd6fb273da977af49b32e6",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1333"></a>

<a id="m-f87b4fb6"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1333",
  "title": "明确结构表脚本历史来源读取兼容",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1333-structured-script-history-source-compatibility.md)",
  "source_line": "|T-1333|明确结构表脚本历史来源读取兼容|📋|待审|待验|[SPEC](docs/features/t1333-structured-script-history-source-compatibility.md)|[D]|",
  "source_sha256": "f2a59519c85c199d1ddffc5394603caa3b2bf5393509b038b4f1dfc034a6b72a",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1321"></a>

<a id="m-03cb3f92"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1321",
  "title": "诊断图文重新组织与手动校正未形成可采纳候选",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1321-graphic-reorganization-candidate-diagnosis.md)",
  "source_line": "|T-1321|诊断图文重新组织与手动校正未形成可采纳候选|⏸️|PASS[REV:271af53ebf46]|待验|[SPEC](docs/features/t1321-graphic-reorganization-candidate-diagnosis.md)|[D]|",
  "source_sha256": "174bb617f3466a726d4f8b393ae7a8b072ab1342fb6c5ef5309cfcaae0c1627f",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1300"></a>

<a id="m-50c111b9"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1300",
  "title": "恢复Codex各能力可用性并落实已定位性能优化",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1300-codex-functionality-and-performance.md)",
  "source_line": "|T-1300|恢复Codex各能力可用性并落实已定位性能优化|⏸️|PASS[REV:6094ba8d7ed5]|待验|[SPEC](docs/features/t1300-codex-functionality-and-performance.md)|[D]|",
  "source_sha256": "da0d7a691984c3ce00dd0949e2f2abd4d53ba3c7deb5f39a68e34aaf6e1f2372",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1297"></a>

<a id="m-ffd4a614"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1297",
  "title": "修复原生时间轴缩放滑块被全局方向键拦截",
  "narrative": "[D]",
  "documents": "[SPEC](docs/verification/t1296/REPORT.md)",
  "source_line": "|T-1297|修复原生时间轴缩放滑块被全局方向键拦截|📋|待审|待验|[SPEC](docs/verification/t1296/REPORT.md)|[D]|",
  "source_sha256": "b0025302329e2bee3480944a6e06d2957789fc40de8fa8fe94f6ab2930c7a72b",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1292"></a>

<a id="m-a0dfe779"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1292",
  "title": "核对合并后的全局对账失败并逐项归因",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1292-post-integration-global-reconcile-findings.md)",
  "source_line": "|T-1292|核对合并后的全局对账失败并逐项归因|📋|待审|待验|[SPEC](docs/features/t1292-post-integration-global-reconcile-findings.md)|[D]|",
  "source_sha256": "3b44c96beb4abc42806806a67764cd89581da91d8bd6790fd4489e3d582d343a",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1291"></a>

<a id="m-311d1f24"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1291",
  "title": "核对旧原生编辑器验证器与当前715源码库存",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1291-legacy-native-verifier-source-inventory.md)",
  "source_line": "|T-1291|核对旧原生编辑器验证器与当前715源码库存|📋|待审|待验|[SPEC](docs/features/t1291-legacy-native-verifier-source-inventory.md)|[D]|",
  "source_sha256": "6acf3048c51197b94ece19722122956664ca56739fa7f7464fd1a471b2e0b1f1",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1289"></a>

<a id="m-2b9c4a05"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1289",
  "title": "修复原生构建清单随解包目录深度变化",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1289-native-build-graph-virtual-module.md)",
  "source_line": "|T-1289|修复原生构建清单随解包目录深度变化|🔨|PASS[REV:92eba9d78497]|待验|[SPEC](docs/features/t1289-native-build-graph-virtual-module.md)|[D]|",
  "source_sha256": "010e08af384fe5fd9d918a2919ab19470d41b020952f61da42f17cb476d579e8",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1288"></a>

<a id="m-9857caa3"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1288",
  "title": "校准合并剪辑后的两个契约测试库存",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1288-integrated-editing-contract-inventory.md)",
  "source_line": "|T-1288|校准合并剪辑后的两个契约测试库存|🔨|PASS[REV:cf5a6070b2b5]|待验|[SPEC](docs/features/t1288-integrated-editing-contract-inventory.md)|[D]|",
  "source_sha256": "de2e47d49426c9849a129f0766e3dc56154f7d51c0229ecbeec8617e261909ad",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1287"></a>

<a id="m-2774b136"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1287",
  "title": "闭合Growth全量回归的旧夹具与隔离缺项",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1287-growth-full-regression-fixtures.md)",
  "source_line": "|T-1287|闭合Growth全量回归的旧夹具与隔离缺项|📋|待审|待验|[SPEC](docs/features/t1287-growth-full-regression-fixtures.md)|[D]|",
  "source_sha256": "a7a56e6c9a4cafb44d8945b3dafb988d5aaab43df6eaaa24f1408e978b51389f",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1286"></a>

<a id="m-97198cf6"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1286",
  "title": "校准模型来源接线后的旧前端集成夹具",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1286-model-routing-frontend-fixtures.md)",
  "source_line": "|T-1286|校准模型来源接线后的旧前端集成夹具|🔨|PASS[REV:be715ef3b46d]|待验|[SPEC](docs/features/t1286-model-routing-frontend-fixtures.md)|[D]|",
  "source_sha256": "4dd9a64342b6aa5714bcaea30a210647564e52e672dd44a7ad3ff3e55ff33daa",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1283"></a>

<a id="m-c06d83c5"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1283",
  "title": "核对Codex账号工作区路由预检拒绝并恢复粗剪",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1283-codex-account-routing-preflight.md)",
  "source_line": "|T-1283|核对Codex账号工作区路由预检拒绝并恢复粗剪|📋|待审|—|[SPEC](docs/features/t1283-codex-account-routing-preflight.md)|[D]|",
  "source_sha256": "dcbe43391f19e94b257e51355713b9220aa837ca898d7266a6f91c04211319c2",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1279"></a>

<a id="m-9e54ec7d"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1279",
  "title": "接入模型来源新迁移的真实数据库谱系护栏",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1279-model-routing-migration-lineage.md)",
  "source_line": "|T-1279|接入模型来源新迁移的真实数据库谱系护栏|🔨|PASS[REV:3056f3673e0a]|待验|[SPEC](docs/features/t1279-model-routing-migration-lineage.md)|[D]|",
  "source_sha256": "6e4a6777595c0338049652d1bc3c5e3d244279ade6c5bf0da841b148e337e703",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1278"></a>

<a id="m-913dd54c"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1278",
  "title": "统一激活授权并允许官方、自配和本地Codex按能力组合",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1278-unified-license-capability-routing.md)",
  "source_line": "|T-1278|统一激活授权并允许官方、自配和本地Codex按能力组合|🔨|PASS[REV:c23accf0a926]|待验|[SPEC](docs/features/t1278-unified-license-capability-routing.md)|[D]|",
  "source_sha256": "5afb21c84ee806a14723ae1a86325ce7436fe23a5114486e5a8d2b53e827eeba",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1276"></a>

<a id="m-99f7b9ca"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1276",
  "title": "修复原片准备事务内根设置连接自等待",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1276-production-source-transaction-runtime.md)",
  "source_line": "|T-1276|修复原片准备事务内根设置连接自等待|⏸️|PASS[REV:f677c9cdf3ed]|待验|[SPEC](docs/features/t1276-production-source-transaction-runtime.md)|[D]|",
  "source_sha256": "aaff5e850fa8c0130894b41fab1042c37d8cb2d4487e957b3cd106ec0d00ea65",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1275"></a>

<a id="m-4fa94d58"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1275",
  "title": "排查剪辑验收隔离服务冷编译与数据库初始化超时",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1275-editing-verification-runtime-timeouts.md)",
  "source_line": "|T-1275|排查剪辑验收隔离服务冷编译与数据库初始化超时|⏸️|—|待验|[SPEC](docs/features/t1275-editing-verification-runtime-timeouts.md)|[D]|",
  "source_sha256": "59222c28d041fcae421118dffc0d663b416bc882dcff64868a369735fae06d26",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1274"></a>

<a id="m-d5cc524b"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1274",
  "title": "参考ChatCut可复用模块重设计CreatorOS剪辑工作区与自然语言剪辑链路",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1274-chatcut-editing-redesign.md)",
  "source_line": "|T-1274|参考ChatCut可复用模块重设计CreatorOS剪辑工作区与自然语言剪辑链路|⏸️|PASS[REV:55a3f14a70a5]|待验|[SPEC](docs/features/t1274-chatcut-editing-redesign.md)|[D]|",
  "source_sha256": "b2e2506b958f59a7f8a02a36dfcec15d99dcb06ad1d55e844f0613fe13afb25a",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1277"></a>

<a id="m-70f658e4"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1277",
  "title": "核对原生AAC首尾有效样本与音画对齐",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1277-native-aac-valid-samples.md)",
  "source_line": "|T-1277|核对原生AAC首尾有效样本与音画对齐|📋|—|待验|[SPEC](docs/features/t1277-native-aac-valid-samples.md)|[D]|",
  "source_sha256": "82d7282e5cfce028f9440ff8861793c0d9d09b3e5e671605e1fbf337bd198f5c",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1273"></a>

<a id="m-83cbce42"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1273",
  "title": "CreatorOS反逆向加固严格零性能损耗",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1273-release-anti-reverse-hardening.md)",
  "source_line": "|T-1273|CreatorOS反逆向加固严格零性能损耗|🔨|PASS[REV:f993e9496349]|待验|[SPEC](docs/features/t1273-release-anti-reverse-hardening.md)|[D]|",
  "source_sha256": "33cdf7f99ad48db8cd2a42da2081a209021bf900f6f0bdc175ef2612b57cdd37",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1271"></a>

<a id="m-b13acd3a"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1271",
  "title": "CreatorOS Codex调用不保存个人历史会话",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1271-codex-ephemeral-sessions.md)",
  "source_line": "|T-1271|CreatorOS Codex调用不保存个人历史会话|🔨|PASS[REV:b5247eee4711]|—|[SPEC](docs/features/t1271-codex-ephemeral-sessions.md)|[D]|",
  "source_sha256": "c7de4ce3baf3023a18ef6be61612910eff8519463da488d9224b456459c787ff",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1265"></a>

<a id="m-d2074ad4"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1265",
  "title": "修复本地Codex结构化输出Schema适配导致真实400",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1265-codex-structured-output-schema-compatibility.md)",
  "source_line": "|T-1265|修复本地Codex结构化输出Schema适配导致真实400|🔨|PASS[REV:54a830e5bcfc]|待验|[SPEC](docs/features/t1265-codex-structured-output-schema-compatibility.md)|[D]|",
  "source_sha256": "c703fc011be53c7ba84e7978f4d3994838ed81094249959e9e0b75e8935b3118",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1264"></a>

<a id="m-bcc96cf6"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1264",
  "title": "修复协议账本读取前Next元数据恢复顺序",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1264-protocol-ledger-next-closure-order.md)",
  "source_line": "|T-1264|修复协议账本读取前Next元数据恢复顺序|🔨|PASS[REV:363fd9378c93]|待验|[SPEC](docs/features/t1264-protocol-ledger-next-closure-order.md)|[D]|",
  "source_sha256": "8c96688390e27c42932c8ceecc39e4da79e13199cf417ebe26f2f08141b3cde9",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1263"></a>

<a id="m-a1c7232c"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1263",
  "title": "修复协议验收替身与隔离临时根的归属校验冲突",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1263-protocol-fixture-owned-temp-root.md)",
  "source_line": "|T-1263|修复协议验收替身与隔离临时根的归属校验冲突|🔨|PASS[REV:b4fda4422df6]|待验|[SPEC](docs/features/t1263-protocol-fixture-owned-temp-root.md)|[D]|",
  "source_sha256": "2edccb41959b5cb0c2ffa19ea508c016481c1e36534bdf5773f41eb5f245fea2",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1272"></a>

<a id="m-e6b244c2"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1272",
  "title": "校准新增观测后的前端回归夹具与迁移库存",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1272-current-observability-frontend-test-fixtures.md)",
  "source_line": "|T-1272|校准新增观测后的前端回归夹具与迁移库存|🔨|PASS[REV:57f7140fcca6]|待验|[SPEC](docs/features/t1272-current-observability-frontend-test-fixtures.md)|[D]|",
  "source_sha256": "07241359222e82bc768181d3c037891bf81775d9c885cee997c3457f44074732",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1270"></a>

<a id="m-d5b78700"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1270",
  "title": "校准当前观测迁移后的原回归库存",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1270-current-observability-migration-test-inventory.md)",
  "source_line": "|T-1270|校准当前观测迁移后的原回归库存|🔨|PASS[REV:ed99956c0313]|待验|[SPEC](docs/features/t1270-current-observability-migration-test-inventory.md)|[D]|",
  "source_sha256": "32f76bff448d55a2ed76b5f30240b57a1c04cacb4c4a46c9056493e904414473",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1268"></a>

<a id="m-89cf7000"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1268",
  "title": "闭合集成契约测试库存与手工保存类型",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1268-integrated-contract-inventory-and-manual-save-test.md)",
  "source_line": "|T-1268|闭合集成契约测试库存与手工保存类型|🔨|PASS[REV:b9d6a2958cc7]|待验|[SPEC](docs/features/t1268-integrated-contract-inventory-and-manual-save-test.md)|[D]|",
  "source_sha256": "2cf7bca28a8f5ce5e7139afcbea1db282121aad5d0f40e7a93276776816795d3",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1267"></a>

<a id="m-c2349ade"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1267",
  "title": "校准Pi公共聊天验收能力键与HTTP最终审计",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1267-pi-public-fixture-capability-and-http-audit.md)",
  "source_line": "|T-1267|校准Pi公共聊天验收能力键与HTTP最终审计|🔨|PASS[REV:cc01d69f8185]|待验|[SPEC](docs/features/t1267-pi-public-fixture-capability-and-http-audit.md)|[D]|",
  "source_sha256": "91c08e91226c39442ab39da845558f84499875079732a930dcf7f57449be1742",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1266"></a>

<a id="m-882f4088"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1266",
  "title": "核对并修复设置偏好首载时ASR菜单不可达",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1266-asr-menu-preference-layout-race.md)",
  "source_line": "|T-1266|核对并修复设置偏好首载时ASR菜单不可达|🔨|PASS[REV:bda5b2a67bbd]|待验|[SPEC](docs/features/t1266-asr-menu-preference-layout-race.md)|[D]|",
  "source_sha256": "a767265756b23b52891ab855a24c4f77e9ce0935c31cb08761c2897ccf9ad7c8",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1269"></a>

<a id="m-dc5ecc8c"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1269",
  "title": "补齐原持久分场失败的可读诊断与原任务重试验收",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1269-managed-video-failure-diagnostic.md)",
  "source_line": "|T-1269|补齐原持久分场失败的可读诊断与原任务重试验收|🔨|PASS[REV:03376b43b303]|待验|[SPEC](docs/features/t1269-managed-video-failure-diagnostic.md)|[D]|",
  "source_sha256": "b9e00673d73dbc111f4cd036014a6c2457083341f8f2399b8057d968b51f98f2",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1261"></a>

<a id="m-edc2bdf1"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1261",
  "title": "修复开发包验收暴露的运行时缺陷与用例合同",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1261-runtime-acceptance-defect-closure.md)",
  "source_line": "|T-1261|修复开发包验收暴露的运行时缺陷与用例合同|🔨|PASS[REV:cd5f6ec85eda]|待验|[SPEC](docs/features/t1261-runtime-acceptance-defect-closure.md)|[D]|",
  "source_sha256": "3d77327028b12dfe1cd506d9404470fca73a0d50d126ea00709bb041fe102251",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1260"></a>

<a id="m-99d855a5"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1260",
  "title": "核对T1255审核绑定生成PROJECT造成收据漂移",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1260-generated-project-review-binding.md)",
  "source_line": "|T-1260|核对T1255审核绑定生成PROJECT造成收据漂移|📋|—|—|[SPEC](docs/features/t1260-generated-project-review-binding.md)|[D]|",
  "source_sha256": "b3223106ae396500866c8f668b6485a484764dae3a31079c0846c3086efb54cf",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1255"></a>

<a id="m-387aa755"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1255",
  "title": "加密日志直传Growth、异常采集与运行指标观测",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1255-reporting-full-delivery.md) · [SPEC](docs/features/t1255-observability-research.md)",
  "source_line": "|T-1255|加密日志直传Growth、异常采集与运行指标观测|🔨|PASS[REV:9700ff342ac4]|待验|[SPEC](docs/features/t1255-reporting-full-delivery.md) · [SPEC](docs/features/t1255-observability-research.md)|[D]|",
  "source_sha256": "86f37c6dabdafc6c1d5ca584cf02b00b543d267b6e970d13329b9aacef88fb71",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1256"></a>

<a id="m-b58d65d7"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1256",
  "title": "修复Doocs静态原适配三处无用绑定编译失败",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1256-doocs-static-unused-bindings-build-closure.md)",
  "source_line": "|T-1256|修复Doocs静态原适配三处无用绑定编译失败|🔨|PASS[REV:b3d116e19a48]|待验|[SPEC](docs/features/t1256-doocs-static-unused-bindings-build-closure.md)|[D]|",
  "source_sha256": "10e81c062907a5b887cf5f3030ab2f485e2133349a49fa36924e6680716aa6be",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1254"></a>

<a id="m-a94ccfc5"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1254",
  "title": "闭合内置Doocs两份真实请求30秒默认预算与源码交付一致性",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1254-doocs-request-budget-and-source-closure.md)",
  "source_line": "|T-1254|闭合内置Doocs两份真实请求30秒默认预算与源码交付一致性|🔨|PASS[REV:1ebe2f90de0b]|待验|[SPEC](docs/features/t1254-doocs-request-budget-and-source-closure.md)|[D]|",
  "source_sha256": "9f0c0047ae64e900923dbfaed01129e061d3793475d4f487590f52edb54b3843",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1253"></a>

<a id="m-fba3dca3"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1253",
  "title": "闭合原Worker夹具可信回执与未知恢复验收",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1253-worker-fixture-receipt-and-unknown-closure.md)",
  "source_line": "|T-1253|闭合原Worker夹具可信回执与未知恢复验收|🔨|PASS[REV:e890e7d4ffac]|待验|[SPEC](docs/features/t1253-worker-fixture-receipt-and-unknown-closure.md)|[D]|",
  "source_sha256": "a03814819c573555e6bc1f336a9b0e7c213c040d29d1eff22e15463c42c92653",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1246"></a>

<a id="m-e9a70308"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1246",
  "title": "整合完成会话并打开发包及浏览器和App逐项验收",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1246-integrated-dev-package-acceptance.md)",
  "source_line": "|T-1246|整合完成会话并打开发包及浏览器和App逐项验收|🔨|PASS[REV:883f7fe733ba]|待验|[SPEC](docs/features/t1246-integrated-dev-package-acceptance.md)|[D]|",
  "source_sha256": "4cbd6756491eda2fb350500bb51754d6cee9290a8e239650a9ae1156c519f6b2",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1252"></a>

<a id="m-c36e89af"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1252",
  "title": "闭合CLI/MCP HTTP默认300秒早于合法原生RPC的消费者预算",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1252-cli-http-consumer-budget-closure.md)",
  "source_line": "|T-1252|闭合CLI/MCP HTTP默认300秒早于合法原生RPC的消费者预算|🔨|PASS[REV:5ceaed23e00c]|待验|[SPEC](docs/features/t1252-cli-http-consumer-budget-closure.md)|[D]|",
  "source_sha256": "37524012e59270e97495cfaec80deab15fa34c3611440a63c552d87502799887",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1250"></a>

<a id="m-73b1b765"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1250",
  "title": "闭合真实短执行预算与静态消费者误判",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1250-positive-timeout-consumer-closure.md)",
  "source_line": "|T-1250|闭合真实短执行预算与静态消费者误判|🔨|PASS[REV:73326e8df3e3]|待验|[SPEC](docs/features/t1250-positive-timeout-consumer-closure.md)|[D]|",
  "source_sha256": "706706ed74eec3ad4c73c1bbd97395c6eaf66a8f61dfbc235684a3447b4376e0",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1251"></a>

<a id="m-2867bfb1"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1251",
  "title": "保留结构化生成可信失败状态并校准原受控崩溃验收",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1251-chat-generation-failure-and-fixture-closure.md)",
  "source_line": "|T-1251|保留结构化生成可信失败状态并校准原受控崩溃验收|🔨|PASS[REV:41b45f1c67d4]|待验|[SPEC](docs/features/t1251-chat-generation-failure-and-fixture-closure.md)|[D]|",
  "source_sha256": "0ebfdf9d040a76aad547550f98e19e768a2fc9b710b797ab5e1757ac275e8193",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1249"></a>

<a id="m-020b7467"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1249",
  "title": "校准持久聊天原八例的当前受控回执合同",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1249-durable-chat-current-receipts.md)",
  "source_line": "|T-1249|校准持久聊天原八例的当前受控回执合同|🔨|PASS[REV:19cbaf3743b6]|—|[SPEC](docs/features/t1249-durable-chat-current-receipts.md)|[D]|",
  "source_sha256": "f1904cc9f8fdc8f34445b821c94329bf097dad0da8415e6849bf8bee142f3edf",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1247"></a>

<a id="m-13379c64"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1247",
  "title": "修复超时门完整Git库存读取缓冲区溢出",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1247-timeout-git-inventory-buffer.md)",
  "source_line": "|T-1247|修复超时门完整Git库存读取缓冲区溢出|🔨|PASS[REV:b75c6d75921d]|—|[SPEC](docs/features/t1247-timeout-git-inventory-buffer.md)|[D]|",
  "source_sha256": "11ee394c8d9213b237232bca6ae533303c612229d2194048fb2745c3164579e2",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1248"></a>

<a id="m-537a47a6"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1248",
  "title": "恢复已知旧冻结系统候选工具的严格合同兼容",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1248-frozen-system-action-compatibility.md)",
  "source_line": "|T-1248|恢复已知旧冻结系统候选工具的严格合同兼容|🔨|PASS[REV:2d9887301cb3]|—|[SPEC](docs/features/t1248-frozen-system-action-compatibility.md)|[D]|",
  "source_sha256": "2785ccb9ea109250851aaa4bf50e532f6ad48fccb3399581d59a01b4db6ce638",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1238"></a>

<a id="m-39596a96"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1238",
  "title": "本地Codex统一执行文本与生图并免独立模型配置",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1238-codex-unified-text-image-engine.md)",
  "source_line": "|T-1238|本地Codex统一执行文本与生图并免独立模型配置|🔨|PASS[REV:6b70a2a85595]|待验|[SPEC](docs/features/t1238-codex-unified-text-image-engine.md)|[D]|",
  "source_sha256": "9d67ead00771b37bb5cb2bfc55f155e449f6748d4ea955c66941a858fdc32afb",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1245"></a>

<a id="m-2d27b28f"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1245",
  "title": "修复自动化窄窗口筛选挤出与任务查看不便",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1245-automations-narrow-layout.md)",
  "source_line": "|T-1245|修复自动化窄窗口筛选挤出与任务查看不便|🔨|—|待验|[SPEC](docs/features/t1245-automations-narrow-layout.md)|[D]|",
  "source_sha256": "640f0f202abb8d455741859cbc9796c5b87822b40e38c7251b033a48182cba70",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1244"></a>

<a id="m-ef74b92c"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1244",
  "title": "验收自动化立即运行的准入与授权等待",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1244-automation-run-now-login-wait.md)",
  "source_line": "|T-1244|验收自动化立即运行的准入与授权等待|🔨|—|待验|[SPEC](docs/features/t1244-automation-run-now-login-wait.md)|[D]|",
  "source_sha256": "f5975f900e97b56e0d5045d1c117801aa28c5e83a99ac5ed3fe751791ec324c1",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1243"></a>

<a id="m-955ea8bd"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1243",
  "title": "复验项目稿面视频素材的真实预览",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1243-draft-video-preview-recheck.md)",
  "source_line": "|T-1243|复验项目稿面视频素材的真实预览|🔨|—|待验|[SPEC](docs/features/t1243-draft-video-preview-recheck.md)|[D]|",
  "source_sha256": "e7c8c1b06b08f468eb811698ab7a6b3f1f569d42af1d2e5982e523fe96204f5e",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1239"></a>

<a id="m-91c36668"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1239",
  "title": "验证复盘经验采纳与知识库回流并核候选裁决可见性",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1239-review-learning-public-acceptance.md)",
  "source_line": "|T-1239|验证复盘经验采纳与知识库回流并核候选裁决可见性|🔨|—|待验|[SPEC](docs/features/t1239-review-learning-public-acceptance.md)|[D]|",
  "source_sha256": "da1efa0695bc07cb8a9b8caafb160b9d2d9d998ae4119580dc7abd0c85430ee8",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1241"></a>

<a id="m-85eb6d21"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1241",
  "title": "排查复盘页浏览器验收时开发编译器崩溃",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1241-review-dev-compiler-panic.md)",
  "source_line": "|T-1241|排查复盘页浏览器验收时开发编译器崩溃|🔨|—|待验|[SPEC](docs/features/t1241-review-dev-compiler-panic.md)|[D]|",
  "source_sha256": "fb749ea9dc633d2fef781206fed059ea12043e77e47f4a0b741b2cc823a329fc",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1242"></a>

<a id="m-c2a2351d"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1242",
  "title": "核对复盘刷新后纯组账号镜像的测试断言",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1242-review-pure-group-cookie-assertion.md)",
  "source_line": "|T-1242|核对复盘刷新后纯组账号镜像的测试断言|🔨|—|待验|[SPEC](docs/features/t1242-review-pure-group-cookie-assertion.md)|[D]|",
  "source_sha256": "d7c25f1047acac7c2eaeb055ce48db93e24c93895a9fd4e1d8d4dedd07280b88",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1240"></a>

<a id="m-4e2d601b"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1240",
  "title": "复验素材选择器全库分页与真实照片操作",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1240-asset-picker-public-recheck.md)",
  "source_line": "|T-1240|复验素材选择器全库分页与真实照片操作|🔨|—|待验|[SPEC](docs/features/t1240-asset-picker-public-recheck.md)|[D]|",
  "source_sha256": "fb9313fa330a89abe796c5626c8ab3494163e069ad23e9fee30673a865fc02c7",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1227"></a>

<a id="m-f94e51bd"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1227",
  "title": "实际核验本地执行引擎全功能及免模型配置落地情况",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1227-local-engine-full-capability-verification.md)",
  "source_line": "|T-1227|实际核验本地执行引擎全功能及免模型配置落地情况|⏸️|—|—|[SPEC](docs/features/t1227-local-engine-full-capability-verification.md)|[D]|",
  "source_sha256": "81551e281508119a7420554365a15ef6a6f80d9b708c22e198566a1e4e129ec0",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1228"></a>

<a id="m-6b851fdf"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1228",
  "title": "核对审核和发布物料子任务的父执行partial结果",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1228-chat-child-partial-verification.md)",
  "source_line": "|T-1228|核对审核和发布物料子任务的父执行partial结果|📋 待办|—|—|[SPEC](docs/features/t1228-chat-child-partial-verification.md)|[D]|",
  "source_sha256": "462f0b187c164a8868fca86550af6c9110c89f939364611be5b31985327459d1",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1229"></a>

<a id="m-c77e1638"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1229",
  "title": "核对内容雷达选题生成持续无效输出及检查点恢复",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1229-radar-topic-output-recovery-diagnosis.md)",
  "source_line": "|T-1229|核对内容雷达选题生成持续无效输出及检查点恢复|🔨|—|—|[SPEC](docs/features/t1229-radar-topic-output-recovery-diagnosis.md)|[D]|",
  "source_sha256": "0360fa6afa4a5a8848d98615354a6b3ce58cfac6e87477e13cb905f940def81d",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1231"></a>

<a id="m-90213354"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1231",
  "title": "核对雷达升级项目后原账号读取404的范围分歧",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1231-radar-promoted-project-scope.md)",
  "source_line": "|T-1231|核对雷达升级项目后原账号读取404的范围分歧|🔨|—|待验|[SPEC](docs/features/t1231-radar-promoted-project-scope.md)|[D]|",
  "source_sha256": "b6fcd43c03e179c266fdd052a6236f57092d1d02f6022bfb0233ab6166015fbe",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1233"></a>

<a id="m-738c84c5"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1233",
  "title": "校准雷达正文模型替身并验证正文真实贯通",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1233-radar-body-fixture-protocol.md)",
  "source_line": "|T-1233|校准雷达正文模型替身并验证正文真实贯通|🔨|—|待验|[SPEC](docs/features/t1233-radar-body-fixture-protocol.md)|[D]|",
  "source_sha256": "ad428b3a7c1bfc72a9fee8b1a62658480f137e9612e5b27fbe845883b6b77530",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1232"></a>

<a id="m-fc4637ac"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1232",
  "title": "验证设置对话框分类交互与公开读回持久性",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1232-settings-dialog-public-verification.md)",
  "source_line": "|T-1232|验证设置对话框分类交互与公开读回持久性|🔨|—|待验|[SPEC](docs/features/t1232-settings-dialog-public-verification.md)|[D]|",
  "source_sha256": "d1bef9cd2b129396b9dc90ce9ed28a3fef89a23c3c8608d66d993b61698ad2a0",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1235"></a>

<a id="m-e7510971"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1235",
  "title": "修复外观密度关闭设置后刷新未恢复",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1235-density-reload-persistence.md)",
  "source_line": "|T-1235|修复外观密度关闭设置后刷新未恢复|🔨|—|待验|[SPEC](docs/features/t1235-density-reload-persistence.md)|[D]|",
  "source_sha256": "8d9c2ca3820ff81b860c8de23e86e7feda30bd6a831bf3dfcbd58ee39440eba8",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1236"></a>

<a id="m-87685ec9"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1236",
  "title": "修复模型保存并测试成功后界面结果丢失",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1236-model-probe-visible-result.md)",
  "source_line": "|T-1236|修复模型保存并测试成功后界面结果丢失|🔨|—|待验|[SPEC](docs/features/t1236-model-probe-visible-result.md)|[D]|",
  "source_sha256": "1a2983c8ded4d2f29a20f71f23e11c4ef8ac257abd8a4865847c6e326b727a2b",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1237"></a>

<a id="m-04d6b95d"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1237",
  "title": "修复设置窄窗口分类栏挤压内容与裁切",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1237-settings-narrow-layout.md)",
  "source_line": "|T-1237|修复设置窄窗口分类栏挤压内容与裁切|🔨|—|待验|[SPEC](docs/features/t1237-settings-narrow-layout.md)|[D]|",
  "source_sha256": "98310ddef5e6d4cbe6265969ada0225e4dfc07ad293deffe3750a95879772974",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1234"></a>

<a id="m-47e48a1e"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1234",
  "title": "验证账号组下Skill定制按钮的真实可用性",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1234-group-skill-customize-availability.md)",
  "source_line": "|T-1234|验证账号组下Skill定制按钮的真实可用性|🔨|—|待验|[SPEC](docs/features/t1234-group-skill-customize-availability.md)|[D]|",
  "source_sha256": "6c0c4f00419b4a1110d44218bc9d7618f839a2a6595457cb4ea6a65fea4b3ce7",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1230"></a>

<a id="m-bcc0fc51"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1230",
  "title": "修正素材空态仍宣称按抖音号隔离的旧文案",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1230-assets-empty-workspace-copy.md)",
  "source_line": "|T-1230|修正素材空态仍宣称按抖音号隔离的旧文案|🔨|—|待验|[SPEC](docs/features/t1230-assets-empty-workspace-copy.md)|[D]|",
  "source_sha256": "6cca98d383cd72ff127307968f67abf44210bce4ee52f08787b38ae6dde67058",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1226"></a>

<a id="m-b2eb84b2"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1226",
  "title": "补齐浏览器上传验收媒体目录隔离",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1226-playwright-media-root-isolation.md)",
  "source_line": "|T-1226|补齐浏览器上传验收媒体目录隔离|🔨|—|—|[SPEC](docs/features/t1226-playwright-media-root-isolation.md)|[D]|",
  "source_sha256": "f13667142c1172d408785afc6e9793ade09e31c2a03ead1526d6f7fc44865f03",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1225"></a>

<a id="m-9706a351"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1225",
  "title": "补齐素材中心有数据画廊与选择详情的真实上传夹具",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1225-assets-gallery-real-fixtures.md)",
  "source_line": "|T-1225|补齐素材中心有数据画廊与选择详情的真实上传夹具|🔨|—|—|[SPEC](docs/features/t1225-assets-gallery-real-fixtures.md)|[D]|",
  "source_sha256": "8637d87d76804a7f031384f6ace0a07c6814e90dbe3d2cff87fbe60fbb2bd444",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1224"></a>

<a id="m-3c7b87f3"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1224",
  "title": "校准内容雷达公共旅程的短测试预算与证据输出",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1224-radar-e2e-budget-evidence.md)",
  "source_line": "|T-1224|校准内容雷达公共旅程的短测试预算与证据输出|🔨|—|—|[SPEC](docs/features/t1224-radar-e2e-budget-evidence.md)|[D]|",
  "source_sha256": "db96b87d9aa4a843a69498c456d9f18ffcd7d9f9849a8d9b7a00351e342ea2f8",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1223"></a>

<a id="m-92328205"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1223",
  "title": "修复截图总览把历史运行记录当用例数及重复锚点",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1223-verification-gallery-record-identity.md)",
  "source_line": "|T-1223|修复截图总览把历史运行记录当用例数及重复锚点|🔨|—|—|[SPEC](docs/features/t1223-verification-gallery-record-identity.md)|[D]|",
  "source_sha256": "c0119f33f014338f5b13d636d003e391c0375671c4235f00609908d267550d4c",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1222"></a>

<a id="m-e260ed0c"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1222",
  "title": "核对文章图文编导的空态与功能指引脱离当前稿件",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1222-director-context-guidance.md)",
  "source_line": "|T-1222|核对文章图文编导的空态与功能指引脱离当前稿件|📋 待办|—|待验|[SPEC](docs/features/t1222-director-context-guidance.md)|[D]|",
  "source_sha256": "dba55c076f20eb4b7a925cddff03d33ca202998bf6946d925cedf37c9f839332",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1221"></a>

<a id="m-3e449818"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1221",
  "title": "校准双工作区切换端到端旧账号选择器",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1221-group-switch-e2e.md)",
  "source_line": "|T-1221|校准双工作区切换端到端旧账号选择器|🔨|—|—|[SPEC](docs/features/t1221-group-switch-e2e.md)|[D]|",
  "source_sha256": "9e26c5d7df0ee553100640806aad9e88b6d00483d1e7b7538232cf1afc7b2c4a",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1217"></a>

<a id="m-987d2974"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1217",
  "title": "修复内容雷达来源任务在旧账号和冻结组范围间卡住",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1217-source-sync-workspace.md)",
  "source_line": "|T-1217|修复内容雷达来源任务在旧账号和冻结组范围间卡住|🔨|—|—|[SPEC](docs/features/t1217-source-sync-workspace.md)|[D]|",
  "source_sha256": "8246973660f37df0289e1a6a300bb355c18ae32f284b790d6c3ed30532f2c40b",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1207"></a>

<a id="m-a6b60827"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1207",
  "title": "用 Playwright/App 自动化对全功能建立逐项验收并留图",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1207-full-feature-acceptance.md)",
  "source_line": "|T-1207|用 Playwright/App 自动化对全功能建立逐项验收并留图|🔨|—|待验|[SPEC](docs/features/t1207-full-feature-acceptance.md)|[D]|",
  "source_sha256": "6c465839aea930b4861a5a303c039269474eaf62d2f4ff7e94a560ffe79e55f1",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1208"></a>

<a id="m-a4507f94"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1208",
  "title": "复核T-1207暴露的浏览器功能失败并修复确认缺陷",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1208-t1207-e2e-failure-triage.md)",
  "source_line": "|T-1208|复核T-1207暴露的浏览器功能失败并修复确认缺陷|🔨|—|待验|[SPEC](docs/features/t1208-t1207-e2e-failure-triage.md)|[D]|",
  "source_sha256": "07c8dd5b337c1e61df24b26e06baf1c9685c5c224c2e2aa42e65faa31077a7f4",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1199"></a>

<a id="m-eee010b3"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1199",
  "title": "查明并修复账号组内其他已绑定媒体定时任务不可见",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1199-bound-platform-scheduled-visibility.md)",
  "source_line": "|T-1199|查明并修复账号组内其他已绑定媒体定时任务不可见|🔨|—|待验|[SPEC](docs/features/t1199-bound-platform-scheduled-visibility.md)|[D]|",
  "source_sha256": "4ab1fc8b72155548a7c81105c4d9f3e7d600d54234484d62542ba018678c3a88",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1200"></a>

<a id="m-5924199c"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1200",
  "title": "整体重设计知识库工作区并统一新旧操作入口",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1200-knowledge-workspace-redesign.md)",
  "source_line": "|T-1200|整体重设计知识库工作区并统一新旧操作入口|🔨|—|待验|[SPEC](docs/features/t1200-knowledge-workspace-redesign.md)|[D]|",
  "source_sha256": "51c7a8f85c4cc7aee2adc8f653a328935dbb35a2f80b6447b6001f8422f78c0c",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1201"></a>

<a id="m-24204ec4"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1201",
  "title": "核对知识图谱错误提示回归的旧原始异常断言",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1201-knowledge-graph-error-contract.md)",
  "source_line": "|T-1201|核对知识图谱错误提示回归的旧原始异常断言|🔨|—|—|[SPEC](docs/features/t1201-knowledge-graph-error-contract.md)|[D]|",
  "source_sha256": "4f9f58d6bc36038cbed26bf4995de31591dd77d0a0bdff04074012ccd668bc0a",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1202"></a>

<a id="m-a4672419"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1202",
  "title": "核对自动化复杂排期编辑的旧术语断言",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1202-automation-cadence-error-contract.md)",
  "source_line": "|T-1202|核对自动化复杂排期编辑的旧术语断言|🔨|—|—|[SPEC](docs/features/t1202-automation-cadence-error-contract.md)|[D]|",
  "source_sha256": "7d1a4a575bd9a472afad94c77a0f6eee858ee5b34a77828fe42ba28ca946de03",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1203"></a>

<a id="m-48e5167b"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1203",
  "title": "消除自动化既有React编译与effect静态检查欠债",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1203-automation-react-lint-debt.md)",
  "source_line": "|T-1203|消除自动化既有React编译与effect静态检查欠债|📋 待办|—|待验|[SPEC](docs/features/t1203-automation-react-lint-debt.md)|[D]|",
  "source_sha256": "7a2198922020eaae9fe2eedccceb290cd44185224d04e42fe9cd7c4a1887de95",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1204"></a>

<a id="m-6ee6d9e7"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1204",
  "title": "核对本轮全局对账29项失败及新增触发项",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1204-current-reconcile-failures.md)",
  "source_line": "|T-1204|核对本轮全局对账29项失败及新增触发项|🔨|—|—|[SPEC](docs/features/t1204-current-reconcile-failures.md)|[D]|",
  "source_sha256": "774176bd2e712fb4d093ea4cc98fd5779fae91038feed219f02cddabad4c6ff3",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1197"></a>

<a id="m-aabf90a0"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1197",
  "title": "核对旧外部MCP窄权限配对来源与当前账号组兼容",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1197-external-agent-pairing-source-convergence.md)",
  "source_line": "|T-1197|核对旧外部MCP窄权限配对来源与当前账号组兼容|📋 待办|—|待验|[SPEC](docs/features/t1197-external-agent-pairing-source-convergence.md)|[D]|",
  "source_sha256": "4c14bf96562dfbdba396f64bdf6feee4b47eb841fcd554ca9bf9d6b7c993e6cb",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1196"></a>

<a id="m-c48cd94b"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1196",
  "title": "排查新安装版启动配置同步502与运行摘要拒绝",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1196-installed-config-sync-502.md)",
  "source_line": "|T-1196|排查新安装版启动配置同步502与运行摘要拒绝|📋 待办|—|—|[SPEC](docs/features/t1196-installed-config-sync-502.md)|[D]|",
  "source_sha256": "b4f59fc6af607c90e38c845d2bb198c63e102232f879a6be44de341164b8c03b",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1193"></a>

<a id="m-7c18ad0e"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1193",
  "title": "核对结果待确认时的重复发送暗示与恢复状态可读性",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1193-copilot-unknown-request-presentation.md)",
  "source_line": "|T-1193|核对结果待确认时的重复发送暗示与恢复状态可读性|📋 待办|—|—|[SPEC](docs/features/t1193-copilot-unknown-request-presentation.md)|[D]|",
  "source_sha256": "1c615284433316034c224933f097807a59aad9ccf402c71ae4a74ceb8ec2d7b1",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1192"></a>

<a id="m-9b62b07b"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1192",
  "title": "核对作品精调公共链的消息结果断言",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1192-work-editor-message-outcome-diagnosis.md)",
  "source_line": "|T-1192|核对作品精调公共链的消息结果断言|📋 待办|—|—|[SPEC](docs/features/t1192-work-editor-message-outcome-diagnosis.md)|[D]|",
  "source_sha256": "137efd0a5252e357fa85ba24defb3a42e0bcad48dfaa3816a59f2fb1de104a48",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1191"></a>

<a id="m-76ed0b8e"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1191",
  "title": "核对编导发送前准备失败与恢复入口",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1191-pre-submit-copilot-recovery-diagnosis.md)",
  "source_line": "|T-1191|核对编导发送前准备失败与恢复入口|🔨|PASS[REV:ad518ff0cf03]|—|[SPEC](docs/features/t1191-pre-submit-copilot-recovery-diagnosis.md)|[D]|",
  "source_sha256": "f717a1f4ae620480373e488417b73cae284dda86e0d59e96480e29af091a0773",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1189"></a>

<a id="m-0b90c531"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1189",
  "title": "核对聊天子进程状态与取消的七项当前失败",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1189-chat-worker-entry-current-state-diagnosis.md)",
  "source_line": "|T-1189|核对聊天子进程状态与取消的七项当前失败|📋 待办|—|—|[SPEC](docs/features/t1189-chat-worker-entry-current-state-diagnosis.md)|[D]|",
  "source_sha256": "673aff9f71de95d5cf2fa64a46ed2b6c7bb627a479333330b6b8b0047f66b348",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1188"></a>

<a id="m-a906fd8b"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1188",
  "title": "核对雷达活动任务期间的采纳保护断言",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1188-radar-active-task-adoption-test-diagnosis.md)",
  "source_line": "|T-1188|核对雷达活动任务期间的采纳保护断言|📋 待办|—|—|[SPEC](docs/features/t1188-radar-active-task-adoption-test-diagnosis.md)|[D]|",
  "source_sha256": "a6afa0c0cc73a8cabbc6ef3e11a1599063f04f0f0bcf17b9191667a37098a17e",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1182"></a>

<a id="m-ad895a7f"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1182",
  "title": "区分隐藏文件注入与真实上传按钮的刷新等待",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1182-real-upload-button-control.md) · [SPEC](docs/research/t1182-upload-ui-refresh.md)",
  "source_line": "|T-1182|区分隐藏文件注入与真实上传按钮的刷新等待|🔨|PASS[REV:456a0d53bb41]|—|[SPEC](docs/features/t1182-real-upload-button-control.md) · [SPEC](docs/research/t1182-upload-ui-refresh.md)|[D]|",
  "source_sha256": "8157df6d534381f9fe76374869d67017753d1c053d48ff243aedd5eb51a257e4",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1181"></a>

<a id="m-e38ee77e"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1181",
  "title": "核对真实素材上传成功后视频列表不可见",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1181-uploaded-video-list-visibility.md)",
  "source_line": "|T-1181|核对真实素材上传成功后视频列表不可见|⏸️|PASS[REV:f8b0038f725b]|—|[SPEC](docs/features/t1181-uploaded-video-list-visibility.md)|[D]|",
  "source_sha256": "f3b14a828301ad81db28a87df9f37c25dce3b090511886e4f11e3f992028fc75",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1180"></a>

<a id="m-6ed2b07e"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1180",
  "title": "核对真实上传探针的File请求体字节测量失败",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1180-upload-probe-file-bytes.md)",
  "source_line": "|T-1180|核对真实上传探针的File请求体字节测量失败|🔨|PASS[REV:36946ee35804]|—|[SPEC](docs/features/t1180-upload-probe-file-bytes.md)|[D]|",
  "source_sha256": "8e2d9ed00174513353b359336779b88864839ca1467a973e1897c9337f7fd8de",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1179"></a>

<a id="m-8a84804a"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1179",
  "title": "核对素材上传回归未触发完成接口的实际原因",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1179-asset-upload-regression-diagnosis.md)",
  "source_line": "|T-1179|核对素材上传回归未触发完成接口的实际原因|🔨|PASS[REV:13d0145a7fcd]|—|[SPEC](docs/features/t1179-asset-upload-regression-diagnosis.md)|[D]|",
  "source_sha256": "b4d33e64fb9b1ecaffe0d7f518939a1da673e7a974bb35c98c082776de3ce973",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1171"></a>

<a id="m-856a81f8"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1171",
  "title": "无损压缩当前超限任务看板",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1171-current-backlog-compaction.md)",
  "source_line": "|T-1171|无损压缩当前超限任务看板|🔨|—|—|[SPEC](docs/features/t1171-current-backlog-compaction.md)|[D]|",
  "source_sha256": "de327d2357acedc6254fc215d9cd25a24c6292ff11cc2b813d2ee5bdab5f0c82",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1159"></a>

<a id="m-ef759510"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1159",
  "title": "在当前main整合微信原生报表、绑定归属与调度闭包",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1159-current-wechat-native-report-integration.md) · [SPEC](docs/verification/t1159/PAGE_SPEC.md)",
  "source_line": "|T-1159|在当前main整合微信原生报表、绑定归属与调度闭包|🔨|PASS[REV:914cad514a19]|待验|[SPEC](docs/features/t1159-current-wechat-native-report-integration.md) · [SPEC](docs/verification/t1159/PAGE_SPEC.md)|[D]|",
  "source_sha256": "ed6f91cd4788cd74c224ee7e6fee06c501647e1c9299a12b587007b60cba12e6",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1155"></a>

<a id="m-62a4500d"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1155",
  "title": "核对浏览器导航时本地服务连接中断日志",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1155-browser-navigation-connection-abort.md)",
  "source_line": "|T-1155|核对浏览器导航时本地服务连接中断日志|⏸️|—|—|[SPEC](docs/features/t1155-browser-navigation-connection-abort.md)|[D]|",
  "source_sha256": "2044a7657575638e4eda23e4cd7bb013565422ddedbbd2a4c45527ea17f8d038",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1149"></a>

<a id="m-9d678893"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1149",
  "title": "在当前main整合封面用途与图片页组统一画幅",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1149-current-cover-group-aspect.md)",
  "source_line": "|T-1149|在当前main整合封面用途与图片页组统一画幅|🔨|PASS[REV:0a91f954eb8f]|待验|[SPEC](docs/features/t1149-current-cover-group-aspect.md)|[D]|",
  "source_sha256": "6f3e013e48c0b6d9cf172e8f69b1ae2ea413a46f64beebe9b5eeb88b90d25464",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1144"></a>

<a id="m-72c7f8fb"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1144",
  "title": "核对素材旅程完成后测试进程未退出",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1144-picker-worker-cleanup.md)",
  "source_line": "|T-1144|核对素材旅程完成后测试进程未退出|🔨|—|—|[SPEC](docs/features/t1144-picker-worker-cleanup.md)|[D]|",
  "source_sha256": "0bdaafeca091059735afa4fe212ecac055f318deb98de2f8dae1b731df701349",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1135"></a>

<a id="m-286f66bf"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1135",
  "title": "核对安装版粗剪成片解码画面比原素材偏暗",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1135-installed-render-color-fidelity.md)",
  "source_line": "|T-1135|核对安装版粗剪成片解码画面比原素材偏暗|⏸️|—|—|[SPEC](docs/features/t1135-installed-render-color-fidelity.md)|[D]|",
  "source_sha256": "9beecc73d9c1f658631ff7c94fbe8db5a86c86d5558e4f1df698bb00f5ca9101",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1118"></a>

<a id="m-c79646ce"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1118",
  "title": "核对本机验收原始日志目录消失",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1118-verification-directory-disappearance.md)",
  "source_line": "|T-1118|核对本机验收原始日志目录消失|📋 待办|—|—|[SPEC](docs/features/t1118-verification-directory-disappearance.md)|[D]|",
  "source_sha256": "068faba7300b832fedcfb17fdf2e0f26d3e61c8b21d9e097573e219cdf9e8f60",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1116"></a>

<a id="m-e8001199"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1116",
  "title": "核对稿件并发保存回归在本轮完整对账中的再次失败",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1116-artifact-cas-global-regression.md)",
  "source_line": "|T-1116|核对稿件并发保存回归在本轮完整对账中的再次失败|🔨|—|—|[SPEC](docs/features/t1116-artifact-cas-global-regression.md)|[D]|",
  "source_sha256": "a10297e72385c849c21768fe4ec4fa3f1a9ebf67b256000d411cdf8fa99914ad",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1101"></a>

<a id="m-3594c1aa"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1101",
  "title": "修复画布素材选择、生成防重复与连线透传，整合三平台扫码绑定及错峰采集",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1101-canvas-binding-collection.md)",
  "source_line": "|T-1101|修复画布素材选择、生成防重复与连线透传，整合三平台扫码绑定及错峰采集|🔨|PASS[REV:146ff2046c2c]|待验|[SPEC](docs/features/t1101-canvas-binding-collection.md)|[D]|",
  "source_sha256": "df0480c316c86c94d260c926c237fd3c10963c1c6492cf10dd22d24701475977",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1101-global-gates"></a>

<a id="m-9fe6987c"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1101-global-gates",
  "title": "核对独立main工作树全局对账失败及历史收据漂移",
  "narrative": "[D]",
  "documents": "[SPEC](docs/verification/t1101/global-gates.md)",
  "source_line": "|T-1101-global-gates|核对独立main工作树全局对账失败及历史收据漂移|📋 待办|—|—|[SPEC](docs/verification/t1101/global-gates.md)|[D]|",
  "source_sha256": "c0548a6a44e1413d03b68722ece5fa97e85ef08b14ebe9e820d5440b4e864ce4",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1109"></a>

<a id="m-2ecf48fa"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1109",
  "title": "修复超时验证入口默认10秒初始化导致原测试未执行",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1109-timeout-verification-default-budget.md)",
  "source_line": "|T-1109|修复超时验证入口默认10秒初始化导致原测试未执行|🔨|PASS[REV:a85dda74b249]|待验|[SPEC](docs/features/t1109-timeout-verification-default-budget.md)|[D]|",
  "source_sha256": "f471a2a0fb8b26c7005156422f279af90c3339c6071cc66e0d1f46e8fe2fcd35",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1110"></a>

<a id="m-91bb9980"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1110",
  "title": "核对浏览器验收开发资源ChunkLoadError与测试状态准备竞态",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1110-browser-development-resource-diagnosis.md)",
  "source_line": "|T-1110|核对浏览器验收开发资源ChunkLoadError与测试状态准备竞态|📋 待办|—|—|[SPEC](docs/features/t1110-browser-development-resource-diagnosis.md)|[D]|",
  "source_sha256": "aac0f16b62cae1626226fe44fcf326554da838f986cac5a528d018d33b143452",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1107"></a>

<a id="m-a11efcb1"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1107",
  "title": "核对平台公共接口新增操作与发布归属回归失败",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1107-platform-public-regression.md)",
  "source_line": "|T-1107|核对平台公共接口新增操作与发布归属回归失败|🔨|PASS[REV:9c9181db2c1c]|待验|[SPEC](docs/features/t1107-platform-public-regression.md)|[D]|",
  "source_sha256": "1533acc6f8379f979d7461be2b796d8653956147c99c765f2b5a2eeb1f58d409",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1105"></a>

<a id="m-7dfc95ec"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1105",
  "title": "修复共享资源面板失效读取后持续加载",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1105-shared-resource-loading.md) · [SPEC](docs/features/t1105-shared-resource-loading-diagnosis.md)",
  "source_line": "|T-1105|修复共享资源面板失效读取后持续加载|🔨|PASS[REV:675552d2d02f]|待验|[SPEC](docs/features/t1105-shared-resource-loading.md) · [SPEC](docs/features/t1105-shared-resource-loading-diagnosis.md)|[D]|",
  "source_sha256": "1597e99a140e558836e2db4194118f28ab8c52d44b3cf920dc99932b41bb51c8",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-c781ff51"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1103",
  "title": "排查Pi联合提案反复遗漏完整图文参数",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1103-pi-joint-argument-diagnosis.md) [SPEC](BACKLOG-details.md#t-1103)",
  "source_line": "|T-1103|排查Pi联合提案反复遗漏完整图文参数|🔨|—|—|[SPEC](docs/features/t1103-pi-joint-argument-diagnosis.md) [SPEC](BACKLOG-details.md#t-1103)|[D]|",
  "source_sha256": "22372d74984fe1200a791d73b9bdfbec207f424e0237c61f09562e08c6dfe24b",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-316d9abd"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1102",
  "title": "排查并恢复本地安装首次运行时展开失败",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1102-installed-runtime-extraction.md) [SPEC](BACKLOG-details.md#t-1102)",
  "source_line": "|T-1102|排查并恢复本地安装首次运行时展开失败|🔨|—|—|[SPEC](docs/features/t1102-installed-runtime-extraction.md) [SPEC](BACKLOG-details.md#t-1102)|[D]|",
  "source_sha256": "4be3277a2bf1e6f36f734e2a0a80c6faeeaf9b66833f606343b914ec64437fcd",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-346d9037"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1094",
  "title": "修复部分完成AI任务公开查询状态合同缺口",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1094-public-partial-task-status.md) · [SPEC](docs/verification/t1093/FOLLOWUP_DIAGNOSIS.md) [SPEC](BACKLOG-details.md#t-1094)",
  "source_line": "|T-1094|修复部分完成AI任务公开查询状态合同缺口|🔨|PASS[REV:5d2c91b81b45]|—|[SPEC](docs/features/t1094-public-partial-task-status.md) · [SPEC](docs/verification/t1093/FOLLOWUP_DIAGNOSIS.md) [SPEC](BACKLOG-details.md#t-1094)|[D]|",
  "source_sha256": "3a77705dbf7c253174c12bbbc8c6708f5eef1f0e988db3633dd15a26ed96bd32",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1096"></a>

<a id="m-a558cacd"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1096",
  "title": "核对文章工作流与任务父归属旧回归断言的实际漂移",
  "narrative": "[D]",
  "documents": "[SPEC](docs/verification/t1094/RELATED_BASELINE_DIAGNOSIS.md)",
  "source_line": "|T-1096|核对文章工作流与任务父归属旧回归断言的实际漂移|📋|—|—|[SPEC](docs/verification/t1094/RELATED_BASELINE_DIAGNOSIS.md)|[D]|",
  "source_sha256": "bb95f1f87063f638111a1c63569e12db4aef67d11ce7bbd97b86f2a348cad29b",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-816fa3c8"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1099",
  "title": "修复工具明确业务拒绝回执缺失与末次失败被算成功",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1099-tool-domain-recovery.md) · [SPEC](docs/features/t1099-tool-domain-recovery-diagnosis.md) [SPEC](BACKLOG-details.md#t-1099)",
  "source_line": "|T-1099|修复工具明确业务拒绝回执缺失与末次失败被算成功|⏸️|PASS[REV:b5aa667d8485]|—|[SPEC](docs/features/t1099-tool-domain-recovery.md) · [SPEC](docs/features/t1099-tool-domain-recovery-diagnosis.md) [SPEC](BACKLOG-details.md#t-1099)|[D]|",
  "source_sha256": "0d88cbb4ebc795a1175d062b6bbfc74055e03bc140302b6f30cfcaff07b07b86",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1098"></a>

<a id="m-20530c4a"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1098",
  "title": "核对安装重启后的定期同步失败与采集未启动",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1098-installed-scheduled-failure-diagnosis.md)",
  "source_line": "|T-1098|核对安装重启后的定期同步失败与采集未启动|📋|—|—|[SPEC](docs/features/t1098-installed-scheduled-failure-diagnosis.md)|[D]|",
  "source_sha256": "bab27eb342112e66fccfec84c6b73bbb4120af2156eb5f5bac7c68bc5bffdac6",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1097"></a>

<a id="m-125f0b15"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1097",
  "title": "修复文章编导参考资料与候选审读保护缺口",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1097-article-director-options-diagnosis.md)",
  "source_line": "|T-1097|修复文章编导参考资料与候选审读保护缺口|🔨|PASS[REV:3f5ea43b69f5]|—|[SPEC](docs/features/t1097-article-director-options-diagnosis.md)|[D]|",
  "source_sha256": "3a4f084377c402168611c5cd58a55504a99ec4fada78bfd2b2e7eccf1aeefee0",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-443f658f"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1095",
  "title": "验证Pi联合创作必填nullable字段遵循与原任务恢复方法",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1095-tool-parameter-recovery.md) · [SPEC](docs/verification/t1093/FOLLOWUP_DIAGNOSIS.md) [SPEC](BACKLOG-details.md#t-1095)",
  "source_line": "|T-1095|验证Pi联合创作必填nullable字段遵循与原任务恢复方法|⏸️|PASS[REV:b3b9dda4753e]|—|[SPEC](docs/features/t1095-tool-parameter-recovery.md) · [SPEC](docs/verification/t1093/FOLLOWUP_DIAGNOSIS.md) [SPEC](BACKLOG-details.md#t-1095)|[D]|",
  "source_sha256": "33b3170aa6e8d970d0b2fda6698d99892c010642f3083018f57861c7f0829a05",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1093"></a>

<a id="m-191e9af4"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1093",
  "title": "校准编导数字参数、联合首次读取与真实候选失败恢复",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1093-director-method-recovery.md)",
  "source_line": "|T-1093|校准编导数字参数、联合首次读取与真实候选失败恢复|🔨|PASS[REV:267bf399a6b1]|—|[SPEC](docs/features/t1093-director-method-recovery.md)|[D]|",
  "source_sha256": "fe90ce8307da7179bcd90d7d2feaed9b7781319df693b5df9400154033f0a2b7",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-f69b5184"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1091",
  "title": "补齐公开编导消息的Codex选择与文章图文视频目标定位并安装验收",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1091-public-director-context.md) [SPEC](BACKLOG-details.md#t-1091)",
  "source_line": "|T-1091|补齐公开编导消息的Codex选择与文章图文视频目标定位并安装验收|🔨|PASS[REV:dcd0b932fca7]|—|[SPEC](docs/features/t1091-public-director-context.md) [SPEC](BACKLOG-details.md#t-1091)|[D]|",
  "source_sha256": "376637ff6f72beed52a371da6c1fe74f1862f5292f4bb5a4c0fe1c55172de723",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1092"></a>

<a id="m-d0502122"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1092",
  "title": "核对联合创作旧集成测试未解包可信回执的契约漂移",
  "narrative": "[D]",
  "documents": "[SPEC](docs/verification/t1091/CREATION_BASELINE_DIAGNOSIS.md)",
  "source_line": "|T-1092|核对联合创作旧集成测试未解包可信回执的契约漂移|📋|—|—|[SPEC](docs/verification/t1091/CREATION_BASELINE_DIAGNOSIS.md)|[D]|",
  "source_sha256": "47c66c17a4f36ea416b126f5f952978c151a241604eb0220c31ee2587342320a",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1072-owned-devices"></a>

<a id="m-08b31664"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1072-owned-devices",
  "title": "配合 Growth 轻量手机号账号与正式双设备，补齐新电脑连接与已激活账号入口",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1072-owned-devices.md)",
  "source_line": "|T-1072-owned-devices|配合 Growth 轻量手机号账号与正式双设备，补齐新电脑连接与已激活账号入口|🔨|PASS[REV:351f7db55691]|待验|[SPEC](docs/features/t1072-owned-devices.md)|[D]|",
  "source_sha256": "a9283c60b2db5b6e3e60e770e6372ec93e02c38aa6bf83ab97d9d1c7d3663973",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-38eb5147"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1066-timeout-policy",
  "title": "全系统统一两分钟超时下限、嵌套预算与Skill防复发",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1066-timeout-policy.md) [SPEC](BACKLOG-details.md#t-1066-timeout-policy)",
  "source_line": "|T-1066-timeout-policy|全系统统一两分钟超时下限、嵌套预算与Skill防复发|⏸️|PASS[REV:13310516269c]|待验|[SPEC](docs/features/t1066-timeout-policy.md) [SPEC](BACKLOG-details.md#t-1066-timeout-policy)|[D]|",
  "source_sha256": "36d067b1e19836faaeed332e3e96acb8fda956c4f284021c4f3c701f5df7c4d0",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-db46bdf4"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1067-skill-verification",
  "title": "清理通用产品流程Skill既有公开分发校验债务",
  "narrative": "[D]",
  "documents": "[SPEC](docs/verification/t1066/SKILL_VERIFICATION.md) [SPEC](BACKLOG-details.md#t-1067-skill-verification)",
  "source_line": "|T-1067-skill-verification|清理通用产品流程Skill既有公开分发校验债务|📋 待办|—|待验|[SPEC](docs/verification/t1066/SKILL_VERIFICATION.md) [SPEC](BACKLOG-details.md#t-1067-skill-verification)|[D]|",
  "source_sha256": "35440f1c73dd4115c21c120f5400faed400a455afdee95fe4dafc6d1a8f9fc6d",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-e40b307e"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1018",
  "title": "清理本轮测试暴露的全局类型与边界欠债",
  "narrative": "[D]",
  "documents": "[SPEC](docs/verification/t1017-rewrite-first.md) [SPEC](BACKLOG-details.md#t-1018) [SPEC](BACKLOG-details.md#t1173-t1018-global-debt-history)",
  "source_line": "|T-1018|清理本轮测试暴露的全局类型与边界欠债|📋 待办|—|待验|[SPEC](docs/verification/t1017-rewrite-first.md) [SPEC](BACKLOG-details.md#t-1018) [SPEC](BACKLOG-details.md#t1173-t1018-global-debt-history)|[D]|",
  "source_sha256": "37b9ccdfa3fa350dbf84d877a038c8a3c7419b320e17bae601aa5b14b49403b5",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1083"></a>

<a id="m-8d6c5909"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1083",
  "title": "复核流程升级后的旧任务写集通配符兼容缺口",
  "narrative": "[D]",
  "documents": "[SPEC](docs/verification/t1080/post-package-progress-block-failure.json)",
  "source_line": "|T-1083|复核流程升级后的旧任务写集通配符兼容缺口|📋 待办|—|—|[SPEC](docs/verification/t1080/post-package-progress-block-failure.json)|[D]|",
  "source_sha256": "5de2d648d9b29ff57dbae44b0d300cf8b25565a5a88a506cf791145409fe4451",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1082"></a>

<a id="m-38403201"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1082",
  "title": "复核合并来源任务的当前评审与UI验收记录归属",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1082-source-receipt-revalidation.md)",
  "source_line": "|T-1082|复核合并来源任务的当前评审与UI验收记录归属|📋 待办|—|—|[SPEC](docs/features/t1082-source-receipt-revalidation.md)|[D]|",
  "source_sha256": "4ec9e51c16ba9deb05cee707cc15645bbb41f35241e1dd111f6defdf2d09811b",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1081"></a>

<a id="m-d3a32784"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1081",
  "title": "核对整合后原主线的14处短执行预算与超时扫描误报",
  "narrative": "[D]",
  "documents": "[SPEC](docs/verification/t1080/timeout-static-dispositions-corrected.json)",
  "source_line": "|T-1081|核对整合后原主线的14处短执行预算与超时扫描误报|📋 待办|—|待验|[SPEC](docs/verification/t1080/timeout-static-dispositions-corrected.json)|[D]|",
  "source_sha256": "ee45e5c32612c1d3aea3441afa546a4dda00279aaa96d6f468d567ad7269bf67",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1026"></a>

<a id="m-30a0b917"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1026",
  "title": "补齐新增 Agent 功能的公开 CLI 并逐项验收安装版",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1026-agent-cli-acceptance.md)",
  "source_line": "|T-1026|补齐新增 Agent 功能的公开 CLI 并逐项验收安装版|🔨|—|—|[SPEC](docs/features/t1026-agent-cli-acceptance.md)|[D]|",
  "source_sha256": "1b24b75385a347b3dbaa6b7a74b59dabc7dd108e69cb81ceebaed174d9dcae16",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1027"></a>

<a id="m-c1a64c2d"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1027",
  "title": "修复评论采集完成统计与失败诊断",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1027-comment-collection-evidence.md)",
  "source_line": "|T-1027|修复评论采集完成统计与失败诊断|🔨|—|—|[SPEC](docs/features/t1027-comment-collection-evidence.md)|[D]|",
  "source_sha256": "8380b64261a497dcceb4dd2bef3061d367f7eac325bd4450dd25fda160768ab2",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1025"></a>

<a id="m-a1865f26"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1025",
  "title": "重新核验 constitution 变更后的历史评审与前端验收回执",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1025-receipt-drift-revalidation.md)",
  "source_line": "|T-1025|重新核验 constitution 变更后的历史评审与前端验收回执|📋|—|—|[SPEC](docs/features/t1025-receipt-drift-revalidation.md)|[D]|",
  "source_sha256": "0091c8db9f41d3ae422aeb84e410591ba2819f0aaf5521f905a091896a0b0310",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-59ca53cf"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1077",
  "title": "修复采纳与作品素材读取的项目返回值",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1077-material-parent-port.md) [SPEC](BACKLOG-details.md#t-1077)",
  "source_line": "|T-1077|修复采纳与作品素材读取的项目返回值|🔨|PASS[REV:a36209c19783]|待验|[SPEC](docs/features/t1077-material-parent-port.md) [SPEC](BACKLOG-details.md#t-1077)|[D]|",
  "source_sha256": "a9154f1dab2b8da8a0876bd7e999e7fec50617fae5fc1f5199d86f014546d878",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-591fbfcc"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1075",
  "title": "修复安装验收发现的素材标签观察与纯组生图证明",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1075-installed-ai-observation-gaps.md) [SPEC](BACKLOG-details.md#t-1075)",
  "source_line": "|T-1075|修复安装验收发现的素材标签观察与纯组生图证明|🔨|PASS[REV:73a6052db08f]|—|[SPEC](docs/features/t1075-installed-ai-observation-gaps.md) [SPEC](BACKLOG-details.md#t-1075)|[D]|",
  "source_sha256": "a662e05d3187e13cbdfaf3df3c5b74ada58478f64e610e791c2624022bf3909d",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-057bfb70"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1074",
  "title": "全面验收与补齐AI助手系统操作、工具开放性和功能提示词",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1074-ai-system-operations.md) [SPEC](BACKLOG-details.md#t-1074)",
  "source_line": "|T-1074|全面验收与补齐AI助手系统操作、工具开放性和功能提示词|🔨|PASS[REV:b19144c34cab]|待验|[SPEC](docs/features/t1074-ai-system-operations.md) [SPEC](BACKLOG-details.md#t-1074)|[D]|",
  "source_sha256": "1d1d724c66d7f7c2201b69bd5cc10e2f48cee59bddb4918635197505ddeaabac",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-f701f923"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1071",
  "title": "修复账号绑定和页面Tab切换卡顿",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1071-navigation-latency.md) [SPEC](BACKLOG-details.md#t-1071)",
  "source_line": "|T-1071|修复账号绑定和页面Tab切换卡顿|🔨|PASS[REV:a53e25bf48df]|待验|[SPEC](docs/features/t1071-navigation-latency.md) [SPEC](BACKLOG-details.md#t-1071)|[D]|",
  "source_sha256": "5054bd2c6def527445df856264d3e3e922ad3ab5970bc1d6642f753eb1b0bb47",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-b4343ac4"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1070",
  "title": "打通Codex执行与编导精调，脚本一键生成文章和图文",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1070-director-script-workflow.md) [SPEC](BACKLOG-details.md#t-1070)",
  "source_line": "|T-1070|打通Codex执行与编导精调，脚本一键生成文章和图文|🔨|PASS[REV:b195ac203ec0]|待验|[SPEC](docs/features/t1070-director-script-workflow.md) [SPEC](BACKLOG-details.md#t-1070)|[D]|",
  "source_sha256": "69e0fa0aa96aa571c11e56ecb389388a50de5d9bc7d934bf82159c43ac54d06f",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1069"></a>

<a id="m-0402a772"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1069",
  "title": "修复安装版素材导入慢与跨Tab丢失，重设计素材选择并补多平台绑定入口",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1069-installed-media-and-binding.md)",
  "source_line": "|T-1069|修复安装版素材导入慢与跨Tab丢失，重设计素材选择并补多平台绑定入口|🔨|PASS[REV:19bad8ef6f93]|待验|[SPEC](docs/features/t1069-installed-media-and-binding.md)|[D]|",
  "source_sha256": "db3a91d4cbde8d3cf8eeb047b5a6b20209b16e7896486957ec04cae344c16356",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1066"></a>

<a id="m-23dfb658"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1066",
  "title": "落实本地客户端优先出包并移除人为构建超时",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1066-local-package-build-only.md)",
  "source_line": "|T-1066|落实本地客户端优先出包并移除人为构建超时|⏸️|PASS[REV:0d40d8466937]|—|[SPEC](docs/features/t1066-local-package-build-only.md)|[D]|",
  "source_sha256": "070df936cb981b2755d2f016cac7ac03528eded88d92b781fc1eb2f55b4d7194",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-aa899265"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1062",
  "title": "汇总各会话改动统一提交并打包本地客户端，逐项验收含Skill粗剪",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1062-consolidated-local-client-acceptance.md) · [SPEC](BACKLOG-details.md#t-1062)",
  "source_line": "|T-1062|汇总各会话改动统一提交并打包本地客户端，逐项验收含Skill粗剪|🔨|PASS[REV:5912ba60da16]|待验|[SPEC](docs/features/t1062-consolidated-local-client-acceptance.md) · [SPEC](BACKLOG-details.md#t-1062)|[D]|",
  "source_sha256": "d764e9541bfefd9b02db60dee34d8442408d8c958bd30f23efc1fe13c6d4b1de",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1063"></a>

<a id="m-6ee8ad24"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1063",
  "title": "修正流程工具误拒合法字面方括号文件路径",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1063-orchestrator-literal-path-boundary.md)",
  "source_line": "|T-1063|修正流程工具误拒合法字面方括号文件路径|🔨|PASS[REV:4d99824da112]|待验|[SPEC](docs/features/t1063-orchestrator-literal-path-boundary.md)|[D]|",
  "source_sha256": "bbb29dac8688cccdb41683c623e668a641267f3e244e0936e7a8013e758a0589",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1024"></a>

<a id="m-f2e73100"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1024",
  "title": "紧急排查充值50元后Growth受管Omni模型仍报余额不足",
  "narrative": "[D]",
  "documents": "[SPEC](docs/verification/t1024-managed-credit-diagnosis.md)",
  "source_line": "|T-1024|紧急排查充值50元后Growth受管Omni模型仍报余额不足|🔨|—|待验|[SPEC](docs/verification/t1024-managed-credit-diagnosis.md)|[D]|",
  "source_sha256": "59f7e04c86bd8943f48fa290807e2acc60754fad40ab90f76286634df38104c5",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-80a9a21e"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1022",
  "title": "按账号组统一多平台工作区、绑定管理、首页与复盘",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1022-account-group-workspace.md) [SPEC](BACKLOG-details.md#t-1022)",
  "source_line": "|T-1022|按账号组统一多平台工作区、绑定管理、首页与复盘|⏸️|PASS[REV:2f179f8d9380]|待验|[SPEC](docs/features/t1022-account-group-workspace.md) [SPEC](BACKLOG-details.md#t-1022)|[D]|",
  "source_sha256": "6b57fe60c04d8b367a4f6c6cb605d80d87b714ee4d0c843e0e04fdfb2b93b513",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1023"></a>

<a id="m-c6906c46"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1023",
  "title": "修正既有任务绑定glob导致的progress生成阻断",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1022-account-group-workspace/VERIFICATION.md)",
  "source_line": "|T-1023|修正既有任务绑定glob导致的progress生成阻断|📋 待办|—|—|[SPEC](docs/features/t1022-account-group-workspace/VERIFICATION.md)|[D]|",
  "source_sha256": "b354627373ffb31c3d2802a3fddb62e3b52d79ce073b66c806c249f520e64d49",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1021"></a>

<a id="m-1e11076b"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1021",
  "title": "CreatorOS封面与小红书图文双模板库、行业分类及私人收藏",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1021-cover-template-library.md)",
  "source_line": "|T-1021|CreatorOS封面与小红书图文双模板库、行业分类及私人收藏|🔨|PASS[REV:a6345304472d]|待验|[SPEC](docs/features/t1021-cover-template-library.md)|[D]|",
  "source_sha256": "95fddf7f677cd9022d7935eb425dc894beee30ebfcc69b13cf0e301457831656",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1019"></a>

<a id="m-af4ab433"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1019",
  "title": "按观众具体任务与双九宫格持续生成可实测选题",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/audience-task-topics/README.md)",
  "source_line": "|T-1019|按观众具体任务与双九宫格持续生成可实测选题|⏸️|PASS[REV:3a0362412b23]|待验|[SPEC](docs/features/audience-task-topics/README.md)|[D]|",
  "source_sha256": "9fce4295b478635ce7f1b1dc6a6c3e2d67e5a116d3e76804dc8e8b2fc05d4a6e",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1020"></a>

<a id="m-647d1b28"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1020",
  "title": "统一可视化推荐、作品承接与科学运营观测",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/creator-operations/README.md)",
  "source_line": "|T-1020|统一可视化推荐、作品承接与科学运营观测|📋 待办|待审|待验|[SPEC](docs/features/creator-operations/README.md)|[D]|",
  "source_sha256": "267dccc8baad140677bdd50c212caf189820df1ae910cdfd92608ff6dcbcde8c",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1017"></a>

<a id="m-02b018a1"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1017",
  "title": "简化内容雷达：按账号定位一键生成可编辑改写稿",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1017-content-radar-rewrite-first.md)",
  "source_line": "|T-1017|简化内容雷达：按账号定位一键生成可编辑改写稿|🔨|PASS[REV:d2fb4541c82d]|待验|[SPEC](docs/features/t1017-content-radar-rewrite-first.md)|[D]|",
  "source_sha256": "57a817684c6755bd725fa078ecfb4c11c7d010511034762aacc425db6498645e",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1409"></a>

<a id="m-0badad0a"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1409",
  "title": "Windows扫码目录归位与免登录主页、转写",
  "narrative": "登录目录rename遇Windows占用重试并复制回退；未登录可先存博主主页、登录后关联同步；转写先走游客作品页详情再回落登录。源码测试通过，Windows真机待验。",
  "documents": "[SPEC](docs/features/t1409-douyin-login-free-and-windows-staging.md)",
  "source_line": "|T-1409|Windows扫码目录归位与免登录主页、转写|📋|—|待验|[SPEC](docs/features/t1409-douyin-login-free-and-windows-staging.md)|登录目录rename遇Windows占用重试并复制回退；未登录可先存博主主页、登录后关联同步；转写先走游客作品页详情再回落登录。源码测试通过，Windows真机待验。|",
  "source_sha256": "a70d34dfee849611c675059c9a652b8009ed05ad03d85651686360456b8850ad",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1405"></a>

<a id="m-3c558c2e"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1405",
  "title": "新版安装后全功能实测",
  "narrative": "当前Windows修复包逐模块真实验证；独立验收组、原资料保全，源码/UI/API/真实模型证据分开，不把外部受阻或已知欠债标通过。",
  "documents": "[SPEC](docs/features/t1405-installed-functional-validation.md)",
  "source_line": "|T-1405|新版安装后全功能实测|🔨|—|待验|[SPEC](docs/features/t1405-installed-functional-validation.md)|当前Windows修复包逐模块真实验证；独立验收组、原资料保全，源码/UI/API/真实模型证据分开，不把外部受阻或已知欠债标通过。|",
  "source_sha256": "3a47b340fb85cad37efe0077860d6f3a7d31e2bac1cf1f0950908657decf4d46",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1404"></a>

<a id="m-93c8a8ac"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1404",
  "title": "使用既有更新根与 Actions 构建新版 Windows 包",
  "narrative": "用户已提供既有更新根并确认 CI verdict 密钥；本机根签名、CI 原密钥编壳，仅构建分支 artifact，不合并/发版，原安装数据保全。",
  "documents": "[SPEC](docs/features/t1404-windows-local-root-ci-package.md)",
  "source_line": "|T-1404|使用既有更新根与 Actions 构建新版 Windows 包|🔨|—|待验|[SPEC](docs/features/t1404-windows-local-root-ci-package.md)|用户已提供既有更新根并确认 CI verdict 密钥；本机根签名、CI 原密钥编壳，仅构建分支 artifact，不合并/发版，原安装数据保全。|",
  "source_sha256": "0b0155def1cd9fc279441390e73caadc87b0dba20dfc6896f59d3da3e290b39e",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-b6004b1c"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1015",
  "title": "核实剩余教训失败并校准过期回归断言",
  "narrative": "[D]",
  "documents": "[SPEC](docs/verification/t1014-reconcile-triage.md) [SPEC](BACKLOG-details.md#t-1015) [SPEC](BACKLOG-details.md#t1173-t-1015-same-identity-history)",
  "source_line": "|T-1015|核实剩余教训失败并校准过期回归断言|🔨|—|—|[SPEC](docs/verification/t1014-reconcile-triage.md) [SPEC](BACKLOG-details.md#t-1015) [SPEC](BACKLOG-details.md#t1173-t-1015-same-identity-history)|[D]|",
  "source_sha256": "203fd3a4d75dffc1bbf5026da3f56e169f18f56bf192a5748aa1d8615ad8c83c",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1004"></a>

<a id="m-17f5c5a3"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1004",
  "title": "冻结共享能力协议与 NomiFun 迁移依赖",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1003-agent-workbench.md) [SPEC](BACKLOG-details.md#t1173-t-1004-same-identity-history)",
  "source_line": "|T-1004|冻结共享能力协议与 NomiFun 迁移依赖|📋 待办|—|—|[SPEC](docs/features/t1003-agent-workbench.md) [SPEC](BACKLOG-details.md#t1173-t-1004-same-identity-history)|[D]|",
  "source_sha256": "6167a4a3e7b6943682bb7cbb5e0018901ccc853be0fbee775ea7c2fe92bc590f",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1005"></a>

<a id="m-e1e63c81"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1005",
  "title": "实现多步计划、连续执行与原任务续跑",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1003-agent-workbench.md)",
  "source_line": "|T-1005|实现多步计划、连续执行与原任务续跑|📋 待办|—|—|[SPEC](docs/features/t1003-agent-workbench.md)|[D]|",
  "source_sha256": "da01b9839365b3133c20293ca401d65e42f63828035cabf3946485b0182a4a6a",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1006"></a>

<a id="m-6ba1d49e"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1006",
  "title": "接入统一工具网关与长结果回读",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1003-agent-workbench.md) [SPEC](BACKLOG-details.md#t1173-t-1006-same-identity-history)",
  "source_line": "|T-1006|接入统一工具网关与长结果回读|📋 待办|—|—|[SPEC](docs/features/t1003-agent-workbench.md) [SPEC](BACKLOG-details.md#t1173-t-1006-same-identity-history)|[D]|",
  "source_sha256": "ed21b4ac91f360d742fcdd1d9bd18a72b44c67dd2d063b5817bd58f2088ee328",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1007"></a>

<a id="m-86da3392"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1007",
  "title": "补齐任务文件空间与受控命令执行",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1003-agent-workbench.md)",
  "source_line": "|T-1007|补齐任务文件空间与受控命令执行|📋 待办|—|—|[SPEC](docs/features/t1003-agent-workbench.md)|[D]|",
  "source_sha256": "ef0d6f5eac44fe411c1881e7d03cfff12d27bb81f9219c4866a300bc1d85f55e",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1008"></a>

<a id="m-5e9b8c31"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1008",
  "title": "迁移 NomiFun 浏览器能力并协调既有采集",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1003-agent-workbench.md)",
  "source_line": "|T-1008|迁移 NomiFun 浏览器能力并协调既有采集|📋 待办|—|—|[SPEC](docs/features/t1003-agent-workbench.md)|[D]|",
  "source_sha256": "a4df214006112fda39c3fbe0ed27d196df6aa7e8356f411eea4efb683e0a033b",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1009"></a>

<a id="m-7707f470"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1009",
  "title": "实现产物版本、隔离预览与原生导出",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1003-agent-workbench.md) [SPEC](BACKLOG-details.md#t1173-t-1009-same-identity-history)",
  "source_line": "|T-1009|实现产物版本、隔离预览与原生导出|📋 待办|—|—|[SPEC](docs/features/t1003-agent-workbench.md) [SPEC](BACKLOG-details.md#t1173-t-1009-same-identity-history)|[D]|",
  "source_sha256": "b937264f49c5f23c10871655f183c6cf58c88d392b4d1f4a406f715bb07cd65f",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1010"></a>

<a id="m-ace3bbbe"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1010",
  "title": "装配研究创作报告 Skill 与兼容扩展",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1003-agent-workbench.md)",
  "source_line": "|T-1010|装配研究创作报告 Skill 与兼容扩展|📋 待办|—|—|[SPEC](docs/features/t1003-agent-workbench.md)|[D]|",
  "source_sha256": "e08f011141ab64252eb428834b78e7502b58f31b8219ee5d2d365e80bdb2e598",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1011"></a>

<a id="m-867c0205"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1011",
  "title": "实现对话内计划进度与文件交付交互",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1003-agent-workbench.md)",
  "source_line": "|T-1011|实现对话内计划进度与文件交付交互|📋 待办|—|—|[SPEC](docs/features/t1003-agent-workbench.md)|[D]|",
  "source_sha256": "6ee321f0d6fee04e81b94ac7e1bee53f7a2334a3cbe07a77a47f694e93aafe97",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1012"></a>

<a id="m-5bb58776"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1012",
  "title": "验收完整多步 Agent 与旧功能兼容",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1003-agent-workbench.md)",
  "source_line": "|T-1012|验收完整多步 Agent 与旧功能兼容|📋 待办|—|—|[SPEC](docs/features/t1003-agent-workbench.md)|[D]|",
  "source_sha256": "05ab8c87b9a55a9e2f4a96bee0ff80e851596d54cb05f69c34fba75e34a1416e",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-1013"></a>

<a id="m-bbf99c83"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-1013",
  "title": "验证双端安装包多步 Agent 与升级兼容",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t1003-agent-workbench.md)",
  "source_line": "|T-1013|验证双端安装包多步 Agent 与升级兼容|📋 待办|—|—|[SPEC](docs/features/t1003-agent-workbench.md)|[D]|",
  "source_sha256": "5435d70d186b4084f11bafb79cf7971bc656f3e3292a8a10d7634de5d3a796c7",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-998"></a>

<a id="m-bee6903b"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-998",
  "title": "收敛业务代码硬编码模型名",
  "narrative": "[D]",
  "documents": "[SPEC](docs/research/2026-09-04-architecture-agent-audit.md)",
  "source_line": "|T-998|收敛业务代码硬编码模型名|📋 待办|—|—|[SPEC](docs/research/2026-09-04-architecture-agent-audit.md)|[D]|",
  "source_sha256": "196f181d6ec914e36e34f8b4c7072480c177fe09d208ce6866819519c2e2df72",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-997"></a>

<a id="m-f71fee3a"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-997",
  "title": "修复 ai→ai-runtime 反向依赖边界违反",
  "narrative": "[D]",
  "documents": "[SPEC](docs/research/2026-09-04-architecture-agent-audit.md)",
  "source_line": "|T-997|修复 ai→ai-runtime 反向依赖边界违反|📋 待办|—|—|[SPEC](docs/research/2026-09-04-architecture-agent-audit.md)|[D]|",
  "source_sha256": "faf61bc8e68f0d7b113f6e09eb461197a4865942e6b2066c45cc1620367e02e6",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-996"></a>

<a id="m-59050096"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-996",
  "title": "消除 review/reviews 双模块命名混淆",
  "narrative": "[D]",
  "documents": "[SPEC](docs/research/2026-09-04-architecture-agent-audit.md)",
  "source_line": "|T-996|消除 review/reviews 双模块命名混淆|📋 待办|—|—|[SPEC](docs/research/2026-09-04-architecture-agent-audit.md)|[D]|",
  "source_sha256": "eb8751feb2530748cbacb603f051834bff1a4c40791a1cd8d4d0db983eb43d00",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-993"></a>

<a id="m-594ce62d"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-993",
  "title": "同步 main 分支到最新(落后 origin/main 573 提交)",
  "narrative": "[D]",
  "documents": "—",
  "source_line": "|T-993|同步 main 分支到最新(落后 origin/main 573 提交)|📋 待办|—|—|—|[D]|",
  "source_sha256": "2a0a294f2e8ba2a121310e03be436c73d5e1c56573c93283dc336183486d5c14",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-992"></a>

<a id="m-3380d1d5"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-992",
  "title": "修复 Windows 升级启动运行环境切换拒绝访问",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t992-windows-runtime-upgrade.md)",
  "source_line": "|T-992|修复 Windows 升级启动运行环境切换拒绝访问|🔨|—|—|[SPEC](docs/features/t992-windows-runtime-upgrade.md)|[D]|",
  "source_sha256": "54c9577a2c92febf8e640cfea0a69ffedf233d4c9573c9ceb3da0a36ea9b51ab",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-989"></a>

<a id="m-72bedd52"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-989",
  "title": "校正知识图谱错误提示的既有回归断言",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t989-knowledge-error-test.md)",
  "source_line": "|T-989|校正知识图谱错误提示的既有回归断言|📋 待办|—|—|[SPEC](docs/features/t989-knowledge-error-test.md)|[D]|",
  "source_sha256": "5acd8d478a0645b27d5729d21805336299b2cf1ce61fb4d94358bd4cefed9133",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-984"></a>

<a id="m-d987fbde"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-984",
  "title": "本地打包并实测拆分采集修复",
  "narrative": "[D]",
  "documents": "[SPEC](docs/verification/t984-local-collection.md)",
  "source_line": "|T-984|本地打包并实测拆分采集修复|⏸️|—|—|[SPEC](docs/verification/t984-local-collection.md)|[D]|",
  "source_sha256": "fab435b69f563a5be82a1ecdae79ba39ba5cd5b9fa020500f5da485cc612d03d",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-986"></a>

<a id="m-fa13b1f5"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-986",
  "title": "修复新绑定账号默认采集任务系统标记透传",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t986-bind-collection-flag.md)",
  "source_line": "|T-986|修复新绑定账号默认采集任务系统标记透传|📋 待办|—|—|[SPEC](docs/features/t986-bind-collection-flag.md)|[D]|",
  "source_sha256": "d2a0d4bec969bf7169ab644651a6b00179ca06b5d0b5179daca66ae35c0be822",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-980"></a>

<a id="m-3a9ef56a"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-980",
  "title": "纳入助手修复重新运行 V1.2 双端流水线",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t980-release-rerun.md)",
  "source_line": "|T-980|纳入助手修复重新运行 V1.2 双端流水线|🔨|—|—|[SPEC](docs/features/t980-release-rerun.md)|[D]|",
  "source_sha256": "da8c8844b603d6a84f113e0a3afbb4300b04af167e66b571fa6a34657fb4aef1",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-979"></a>

<a id="m-69fba1b6"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-979",
  "title": "自动化页面慢轮询与切换对象回写防护",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t979-automation-polling.md)",
  "source_line": "|T-979|自动化页面慢轮询与切换对象回写防护|⬜ 待办|—|—|[SPEC](docs/features/t979-automation-polling.md)|[D]|",
  "source_sha256": "b2beb3ea24d1fb34c641cc85884f68d503cc80dcc1101872afbdfa185b3e3682",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-976"></a>

<a id="m-d90bd622"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-976",
  "title": "修复安装版 AI 助手 RedFox 再次失败与脱离对话的任务交互",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t976-chat-inline-redfox.md)",
  "source_line": "|T-976|修复安装版 AI 助手 RedFox 再次失败与脱离对话的任务交互|🔨|—|—|[SPEC](docs/features/t976-chat-inline-redfox.md)|[D]|",
  "source_sha256": "443a3ab8d9b7faffe1b158564ec78d0c672e219cca9e32dcf9e79ce95637d6c0",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-957"></a>

<a id="m-331ca12a"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-957",
  "title": "排查 AI 失败、全场景验收并优化 Agent 提示词",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t957-ai-real-acceptance.md)",
  "source_line": "|T-957|排查 AI 失败、全场景验收并优化 Agent 提示词|🔨|—|—|[SPEC](docs/features/t957-ai-real-acceptance.md)|[D]|",
  "source_sha256": "e5e8182022bc77d45c281ec9f48946c5cba514f129e84b6d140aa699372dd217",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-956"></a>

<a id="m-7fd8daab"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-956",
  "title": "修复安装版点击采集一直抓取中",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t956-installed-collection-stuck.md)",
  "source_line": "|T-956|修复安装版点击采集一直抓取中|🔨|—|—|[SPEC](docs/features/t956-installed-collection-stuck.md)|[D]|",
  "source_sha256": "a7745ca11bbc953bd1acf19586818bb4dc6886282cd3be6faee66b7a3530d4f1",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-954"></a>

<a id="m-83863d46"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-954",
  "title": "接入抖音流量来源并以专家方法改进编导交互",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t954-director-content-loop.md)",
  "source_line": "|T-954|接入抖音流量来源并以专家方法改进编导交互|🔨|—|—|[SPEC](docs/features/t954-director-content-loop.md)|[D]|",
  "source_sha256": "2d51264360d6007472946c8a4f92f55cd73dc4ace4a929f511735f549fb90d34",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-951"></a>

<a id="m-b94ee2e1"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-951",
  "title": "修复自动化采集缺 jobRunId 与千条作品采集失败",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t951-collection-reliability.md)",
  "source_line": "|T-951|修复自动化采集缺 jobRunId 与千条作品采集失败|⏸️|—|—|[SPEC](docs/features/t951-collection-reliability.md)|[D]|",
  "source_sha256": "59fc9ab020e79fd3b1c9e965b30ed5ed618d879d6ba308b7c07564d712440145",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-950"></a>

<a id="m-3290f96a"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-950",
  "title": "排查并恢复当前产品缺失历史数据",
  "narrative": "[D]",
  "documents": "[SPEC](docs/verification/t950-data-recovery.md)",
  "source_line": "|T-950|排查并恢复当前产品缺失历史数据|⏸️|—|—|[SPEC](docs/verification/t950-data-recovery.md)|[D]|",
  "source_sha256": "a5e518cc667b5425d0e86aa21c18fd30fe0666a43c5de4073ef680202f89391c",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-945"></a>

<a id="m-8fd7e1cd"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-945",
  "title": "排查并修复当前视频渲染再次失败",
  "narrative": "[D]",
  "documents": "[SPEC](docs/verification/t945-render-failure.md)",
  "source_line": "|T-945|排查并修复当前视频渲染再次失败|⏸️|—|—|[SPEC](docs/verification/t945-render-failure.md)|[D]|",
  "source_sha256": "6ed7634049cec9febc0bfe16486d508cf44b614723ef137571670efc8fa57ba4",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-943"></a>

<a id="m-8de8f5a0"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-943",
  "title": "拉取并跑通 JY_IPAgent，调研数字人 API 与 CreatorOS 接入",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t943-jy-ipagent-research.md)",
  "source_line": "|T-943|拉取并跑通 JY_IPAgent，调研数字人 API 与 CreatorOS 接入|⏸️|—|—|[SPEC](docs/features/t943-jy-ipagent-research.md)|[D]|",
  "source_sha256": "cca42d5b8428550a7a204cd05f59346026d95e388774b383cffb03fee7b3d2a3",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-940"></a>

<a id="m-527b6398"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-940",
  "title": "补齐应用内签名远程更新闭环",
  "narrative": "[D]",
  "documents": "[SPEC](docs/features/t939-positioning-release.md)",
  "source_line": "|T-940|补齐应用内签名远程更新闭环|📋 待办|—|—|[SPEC](docs/features/t939-positioning-release.md)|[D]|",
  "source_sha256": "d96a4811bd1c3496eb127db7868b7c1e5ae913e63217d2d0774f8c56ec5e42b1",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-935"></a>

<a id="m-ebae04c0"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-935",
  "title": "修复整稿子任务长时间排队无执行",
  "narrative": "[D]",
  "documents": "[SPEC](docs/verification/t935-script-queue.md)",
  "source_line": "|T-935|修复整稿子任务长时间排队无执行|🔨|—|—|[SPEC](docs/verification/t935-script-queue.md)|[D]|",
  "source_sha256": "e66a43a5c31a85d1c1b429b7052ce4cb681963c12260a78127faf41e280c757d",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-934"></a>

<a id="m-be5028fd"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-934",
  "title": "统一 CLI 与页面的持久聊天工具入口",
  "narrative": "[D]",
  "documents": "[SPEC](docs/verification/t934-cli-chat-unification.md)",
  "source_line": "|T-934|统一 CLI 与页面的持久聊天工具入口|🔨|—|—|[SPEC](docs/verification/t934-cli-chat-unification.md)|[D]|",
  "source_sha256": "4e3992960cc863c9917010a4508476bbaf29c2c9a9fdc03bc0051308d05def93",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-933"></a>

<a id="m-ab0740e5"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-933",
  "title": "安装并验收本轮Agent Runtime桌面版",
  "narrative": "[D]",
  "documents": "[SPEC](docs/verification/t932-runtime-alignment.md)",
  "source_line": "|T-933|安装并验收本轮Agent Runtime桌面版|🔨|—|—|[SPEC](docs/verification/t932-runtime-alignment.md)|[D]|",
  "source_sha256": "fb9234f2cdd597baf4fc405a54e00c9339cfedaa21bfdb304c844cd8e22cc7d4",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-919"></a>

<a id="m-593cc62b"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-919",
  "title": "定位并修复本地包主导航卡顿、助手通知刷屏与搜索停滞",
  "narrative": "[D]",
  "documents": "复用 T-912/T-909 导航契约与 [SPEC](docs/superpowers/specs/2026-09-04-agent-runtime-refactor.md)",
  "source_line": "|T-919|定位并修复本地包主导航卡顿、助手通知刷屏与搜索停滞|🔨|—|—|复用 T-912/T-909 导航契约与 [SPEC](docs/superpowers/specs/2026-09-04-agent-runtime-refactor.md)|[D]|",
  "source_sha256": "e4481b96911b2778b6f41c5c4c8ca2912806f4308db8a048b1d319ef4a974624",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-915"></a>

<a id="m-951c70ee"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-915",
  "title": "根治 AI 卡慢、失败不重试与搜索/浏览器缺少自主循环，收敛架构与执行能力",
  "narrative": "[D]",
  "documents": "[SPEC](docs/superpowers/specs/2026-09-04-agent-runtime-refactor.md)",
  "source_line": "|T-915|根治 AI 卡慢、失败不重试与搜索/浏览器缺少自主循环，收敛架构与执行能力|🔨|PASS[REV:6048196960a2]|—|[SPEC](docs/superpowers/specs/2026-09-04-agent-runtime-refactor.md)|[D]|",
  "source_sha256": "97dbfa2a470f0d2a508ab74265c14a6c2ed06384655b0f0afa6d2016a8d3f994",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-36370655"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-916",
  "title": "修复工程对账与历史任务证据漂移，恢复可信重构基线",
  "narrative": "[D]",
  "documents": "[SPEC](docs/research/2026-09-04-architecture-agent-audit.md) [SPEC](BACKLOG-details.md#t-916) [SPEC](BACKLOG-details.md#t1173-t-916-same-identity-history)",
  "source_line": "|T-916|修复工程对账与历史任务证据漂移，恢复可信重构基线|🔨|—|—|[SPEC](docs/research/2026-09-04-architecture-agent-audit.md) [SPEC](BACKLOG-details.md#t-916) [SPEC](BACKLOG-details.md#t1173-t-916-same-identity-history)|[D]|",
  "source_sha256": "78c82818b5b31778e4f28190440ab53d9313d0179e791829a84ed79224830d64",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-917"></a>

<a id="m-b98f70b0"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-917",
  "title": "记录 T-915 媒体测试事故并防止测试再次访问真实媒体根",
  "narrative": "[D]",
  "documents": "[SPEC](docs/research/evidence/t915/2026-09-06-media-test-incident.md)",
  "source_line": "|T-917|记录 T-915 媒体测试事故并防止测试再次访问真实媒体根|📋 待办|—|—|[SPEC](docs/research/evidence/t915/2026-09-06-media-test-incident.md)|[D]|",
  "source_sha256": "0a82dee14c011fa7e0a54114abf511994b898113c9ea4392ffb4e7e75bd87601",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-908"></a>

<a id="m-48992361"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-908",
  "title": "真实复测 douyin-transcribe Skill，并对照 CreatorOS 当前抖音抓取链路判断是否需要兼容修复",
  "narrative": "[D]",
  "documents": "—",
  "source_line": "|T-908|真实复测 douyin-transcribe Skill，并对照 CreatorOS 当前抖音抓取链路判断是否需要兼容修复|📋 待办|—|—|—|[D]|",
  "source_sha256": "5372e48769d5a4832e6bdab18d0e4edf717180884acea76433ffcc2f23ad3616",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-906"></a>

<a id="m-cebce0f5"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-906",
  "title": "放大 AI 助手默认窗口并支持拖拽缩放与跨启动尺寸记忆",
  "narrative": "[D]",
  "documents": "—",
  "source_line": "|T-906|放大 AI 助手默认窗口并支持拖拽缩放与跨启动尺寸记忆|⏸️|—|待验|—|[D]|",
  "source_sha256": "a019d4f1eadd23cdecbe67eca17a029eb7123c125c1deaa746e66b015c14ac92",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-905"></a>

<a id="m-a80ab15c"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-905",
  "title": "调研独立的极简手机口播创作产品，以人设选稿、灵感写稿、实拍与“123321”真人换口型为核心",
  "narrative": "[D]",
  "documents": "—",
  "source_line": "|T-905|调研独立的极简手机口播创作产品，以人设选稿、灵感写稿、实拍与“123321”真人换口型为核心|📋 待办|—|—|—|[D]|",
  "source_sha256": "f2ca877b11ec235409d51a9cf88bc8aa54b51b67aa9eb9cca80c60d4dc531d0b",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-884"></a>

<a id="m-93ab0cbf"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-884",
  "title": "只读诊断用户加密日志中的 ASR 转写失败",
  "narrative": "[D]",
  "documents": "复用 T-768 ASR 通用回退、T-639 MiMo ASR 与 T-676 逐字稿队列契约",
  "source_line": "|T-884|只读诊断用户加密日志中的 ASR 转写失败|⏸️|—|—|复用 T-768 ASR 通用回退、T-639 MiMo ASR 与 T-676 逐字稿队列契约|[D]|",
  "source_sha256": "8d83744bbaddfe5c17e57a2aed95c4b086c4ab9d01995c9c4b147eb3fc8fbc6c",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-15ba3824"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-883",
  "title": "提交并推送 T-881/T-882 候选，触发 GitHub macOS 与 Windows 官方安装包流水线",
  "narrative": "[D]",
  "documents": "复用 [SPEC](orchestrator/T881-FRONTEND-VALIDATION.md)、[SPEC](orchestrator/T882-BUILD-VALIDATION.md) [SPEC](BACKLOG-details.md#t-883)",
  "source_line": "|T-883|提交并推送 T-881/T-882 候选，触发 GitHub macOS 与 Windows 官方安装包流水线|⏸️|—|—|复用 [SPEC](orchestrator/T881-FRONTEND-VALIDATION.md)、[SPEC](orchestrator/T882-BUILD-VALIDATION.md) [SPEC](BACKLOG-details.md#t-883)|[D]|",
  "source_sha256": "b619f05d30a95c466c58468055e109711e8b7b0ad1e280e195609de19c193520",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="t-878"></a>

<a id="m-de897f16"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-878",
  "title": "让生图模型连接测试正确识别并提示 401/403 鉴权失败",
  "narrative": "[D]",
  "documents": "[SPEC](docs/research/2026-08-17-dudu-image-auth-failure-diagnosis.md)",
  "source_line": "|T-878|让生图模型连接测试正确识别并提示 401/403 鉴权失败|📋 待办|—|—|[SPEC](docs/research/2026-08-17-dudu-image-auth-failure-diagnosis.md)|[D]|",
  "source_sha256": "d599f51bd5cb8cc8d7473d6e932721d4a178d01605307c5edc67888a63ac84e8",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-6f0f133d"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-867",
  "title": "恢复 AI 对项目素材与分镜场景的自动语义匹配",
  "narrative": "用户在最新本地包的“AI 分场决策”中看到 8 个项目素材全部落成“可选补充素材”，每个都要求人工选择场景；用户明确纠偏：这些素材本应由 AI 根据确认稿、素材内容和场景语义自动匹配，人工只检查和少量改绑。必须先锁定素材从项目库存进入 `video.decisions` 输入、模型输出绑定、候选归一与前端回显的首个丢失点；正式方案默认自动编排可用素材到合理场景并显示匹配结果/理由，只有确实不适合或语义证据不足的素材才留在可选区，禁止代码用文件名词表或字符串相似度冒充匹配。用户无需逐条选择即可确认成片，手工场景选择只保留为纠正入口；已有人工绑定必须完整回显、可改可清。补真实失败形状红测、模型输入/输出与前端正常及最小窗口回归；不自动采纳、不修改用户当前项目或已确认方案。",
  "documents": "用户截图 + 复用既有 `video.decisions` 候选确认契约",
  "source_line": "|T-867|恢复 AI 对项目素材与分镜场景的自动语义匹配|🔨|—|待验|用户截图 + 复用既有 `video.decisions` 候选确认契约|用户在最新本地包的“AI 分场决策”中看到 8 个项目素材全部落成“可选补充素材”，每个都要求人工选择场景；用户明确纠偏：这些素材本应由 AI 根据确认稿、素材内容和场景语义自动匹配，人工只检查和少量改绑。必须先锁定素材从项目库存进入 `video.decisions` 输入、模型输出绑定、候选归一与前端回显的首个丢失点；正式方案默认自动编排可用素材到合理场景并显示匹配结果/理由，只有确实不适合或语义证据不足的素材才留在可选区，禁止代码用文件名词表或字符串相似度冒充匹配。用户无需逐条选择即可确认成片，手工场景选择只保留为纠正入口；已有人工绑定必须完整回显、可改可清。补真实失败形状红测、模型输入/输出与前端正常及最小窗口回归；不自动采纳、不修改用户当前项目或已确认方案。|",
  "source_sha256": "2338b3b64e4a70fdc553b100a5967e5f9c7673a88f9c99ec2e9a2036decc2eb5",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-02756b5a"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-860",
  "title": "修复竖屏素材底边与左下人物框边界重合",
  "narrative": "用户在 v6 预览中指出横版录屏的下边界与左下角人物 PiP 上边界发生视觉重合。必须以真实 1080×1920 几何补红测：人物框下移并适度缩小，在素材完整 `contain` 的可见底边下方保留明确空隙，同时仍停在双语字幕安全区上方；渲染器安全门须同时拒绝人物压素材、人物压字幕两类布局。重做 v7 短样片、对应稳定帧与转场密集接触表，用户确认前不重渲整片。",
  "documents": "复用 [T-859 SPEC](docs/superpowers/specs/2026-08-16-portrait-material-pip-smooth-transition.md) AC-859-1 与用户截图",
  "source_line": "|T-860|修复竖屏素材底边与左下人物框边界重合|🔨|—|待验|复用 [T-859 SPEC](docs/superpowers/specs/2026-08-16-portrait-material-pip-smooth-transition.md) AC-859-1 与用户截图|用户在 v6 预览中指出横版录屏的下边界与左下角人物 PiP 上边界发生视觉重合。必须以真实 1080×1920 几何补红测：人物框下移并适度缩小，在素材完整 `contain` 的可见底边下方保留明确空隙，同时仍停在双语字幕安全区上方；渲染器安全门须同时拒绝人物压素材、人物压字幕两类布局。重做 v7 短样片、对应稳定帧与转场密集接触表，用户确认前不重渲整片。|",
  "source_sha256": "674d339514cabbfe09541bed9742b85ea8d212be3fad45958391c74a2bea1802",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-5c11dc00"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-859",
  "title": "竖屏素材段人物收进左下角，并消除切换白闪",
  "narrative": "[D]",
  "documents": "[SPEC](BACKLOG-details.md#t-859)  [SPEC](docs/superpowers/specs/2026-08-16-portrait-material-pip-smooth-transition.md)",
  "source_line": "|T-859|竖屏素材段人物收进左下角，并消除切换白闪|🔨|PASS[REV:eea836a09361]|待验|[SPEC](BACKLOG-details.md#t-859)  [SPEC](docs/superpowers/specs/2026-08-16-portrait-material-pip-smooth-transition.md)|[D]|",
  "source_sha256": "414ddc25e5a69bddb85425015dc48d01fff88693e240a21336b96600a0dcb057",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-e4e027a0"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-858",
  "title": "把剪辑方法真正落到 CreatorOS，根治竖屏统一舞台、字幕重点词与动态 PPT",
  "narrative": "[D]",
  "documents": "[SPEC](BACKLOG-details.md#t-858)  [SPEC](docs/superpowers/specs/2026-08-16-video-direction-stage-and-caption-emphasis.md)",
  "source_line": "|T-858|把剪辑方法真正落到 CreatorOS，根治竖屏统一舞台、字幕重点词与动态 PPT|🔨|PASS[REV:248be748b943]|待验|[SPEC](BACKLOG-details.md#t-858)  [SPEC](docs/superpowers/specs/2026-08-16-video-direction-stage-and-caption-emphasis.md)|[D]|",
  "source_sha256": "db414b4fcce6cb04dc68143b0d3f29540dc0caeb3f3cb288687bc4ce51c81cd2",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-666b0a91"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-857",
  "title": "构建当前已提交候选的 CreatorOS 1.1.0 Windows 安装包",
  "narrative": "暂停 T-856 且不带入任何竖屏剪辑代码改动；先提交本次任务状态记录并冻结当前候选，证明产品代码、版本号、工作树、候选提交范围与四项打包预检干净，再通过现有 Windows 云端候选包入口构建真实 NSIS `setup.exe`，验证生产闭包、真安装、主页面、CLI 与卸载并下载计算 SHA-256。只交付 Windows 安装包，不安装到当前 Mac，不创建 tag、GitHub Release，不公开分发，不改 Activity/Growth 或真实用户配置；如候选分支推送与云端构建尚未获明确授权，则在该外部动作前停下确认。",
  "documents": "复用官方 `desktop-release.yml` Windows 候选包入口与 T-848 Windows 真安装验收",
  "source_line": "|T-857|构建当前已提交候选的 CreatorOS 1.1.0 Windows 安装包|⏸️|—|待验|复用官方 `desktop-release.yml` Windows 候选包入口与 T-848 Windows 真安装验收|暂停 T-856 且不带入任何竖屏剪辑代码改动；先提交本次任务状态记录并冻结当前候选，证明产品代码、版本号、工作树、候选提交范围与四项打包预检干净，再通过现有 Windows 云端候选包入口构建真实 NSIS `setup.exe`，验证生产闭包、真安装、主页面、CLI 与卸载并下载计算 SHA-256。只交付 Windows 安装包，不安装到当前 Mac，不创建 tag、GitHub Release，不公开分发，不改 Activity/Growth 或真实用户配置；如候选分支推送与云端构建尚未获明确授权，则在该外部动作前停下确认。|",
  "source_sha256": "67448686f5038a60652c135b3ae3395bb7f20a1d585a2ea1a953f382d823c238",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-c237da79"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-856",
  "title": "重做竖屏成片的统一舞台、字幕可读性与重点词强调",
  "narrative": "用户真实竖屏成片出现纯黑底、横版主视觉堆在上方而竖版人物孤立在右下、大片空区和硬分割，整体像两张互不相关的卡片；中英文字幕过小、英文辨识困难且没有重点词强调。必须把竖屏口播改为一套连续舞台：先由 AI 编导输出 motion thesis 与 beat graph，逐拍声明视觉主语、起止状态、运动动词、舞台形态、转场和回位；竖版人物默认作为完整基底，主视觉按语义使用全屏切走或不遮脸的统一叠层/PiP，横版素材用可见的静态氛围承接而非纯黑或巨大留空，回到人物时布局自然复位；字幕扩大并提高描边/阴影、行距和中英文断行可读性，重点词由 AI 编导在真实字幕语义中显式给出，渲染器只落实有效时间段与强调范围，禁止代码用关键词词表猜重点。先以用户截图对应的竖屏几何补红测，再输出含人物、横版主视觉、中英文字幕和重点词的实际关键帧/接触表与真实生产时间线短样片验收；接触表必须看出状态推进而非海报墙，不得拉伸、裁掉用户素材或用动态全片背景增加渲染成本，未经用户预览确认不重渲整片。",
  "documents": "[外部视频 Skill 学习与吸收结论](docs/research/2026-08-16-video-production-skills-method-study.md) · 复用 T-823/T-824/T-839 竖屏制作、主视觉与内容动效契约 · 待补构建验证",
  "source_line": "|T-856|重做竖屏成片的统一舞台、字幕可读性与重点词强调|⏸️|—|待验|[外部视频 Skill 学习与吸收结论](docs/research/2026-08-16-video-production-skills-method-study.md) · 复用 T-823/T-824/T-839 竖屏制作、主视觉与内容动效契约 · 待补构建验证|用户真实竖屏成片出现纯黑底、横版主视觉堆在上方而竖版人物孤立在右下、大片空区和硬分割，整体像两张互不相关的卡片；中英文字幕过小、英文辨识困难且没有重点词强调。必须把竖屏口播改为一套连续舞台：先由 AI 编导输出 motion thesis 与 beat graph，逐拍声明视觉主语、起止状态、运动动词、舞台形态、转场和回位；竖版人物默认作为完整基底，主视觉按语义使用全屏切走或不遮脸的统一叠层/PiP，横版素材用可见的静态氛围承接而非纯黑或巨大留空，回到人物时布局自然复位；字幕扩大并提高描边/阴影、行距和中英文断行可读性，重点词由 AI 编导在真实字幕语义中显式给出，渲染器只落实有效时间段与强调范围，禁止代码用关键词词表猜重点。先以用户截图对应的竖屏几何补红测，再输出含人物、横版主视觉、中英文字幕和重点词的实际关键帧/接触表与真实生产时间线短样片验收；接触表必须看出状态推进而非海报墙，不得拉伸、裁掉用户素材或用动态全片背景增加渲染成本，未经用户预览确认不重渲整片。|",
  "source_sha256": "1fccdef01cb1d6f6fb935fa6542cb1b545bcfcb99d54dd701ba139b5a816816e",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-41c5cf50"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-855",
  "title": "构建包含 T-854 与当前已提交修复的 CreatorOS macOS 本地安装包",
  "narrative": "待 T-854 完成并提交后冻结工作树，核对四处版本、候选提交范围、敏感信息与官方四项打包测试，只运行仓库固定 `desktop:package-local` 入口生成本地 macOS DMG；报告候选 SHA、产物路径、SHA-256 与 `hdiutil verify`。按用户要求只打包，不安装、不启动、不覆盖当前已安装应用；不创建 tag、GitHub Release，不推送、不公开分发、不改 Activity/Growth 或真实用户配置。",
  "documents": "复用 T-854 构建证据与官方本地打包入口",
  "source_line": "|T-855|构建包含 T-854 与当前已提交修复的 CreatorOS macOS 本地安装包|⏸️|—|—|复用 T-854 构建证据与官方本地打包入口|待 T-854 完成并提交后冻结工作树，核对四处版本、候选提交范围、敏感信息与官方四项打包测试，只运行仓库固定 `desktop:package-local` 入口生成本地 macOS DMG；报告候选 SHA、产物路径、SHA-256 与 `hdiutil verify`。按用户要求只打包，不安装、不启动、不覆盖当前已安装应用；不创建 tag、GitHub Release，不推送、不公开分发、不改 Activity/Growth 或真实用户配置。|",
  "source_sha256": "0a815e71a7a7045b4cdc43265d45d1a3f92e67f72d6bce4443729701e6adf024",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-80805636"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-851",
  "title": "支持录制“123”短视频生成本人授权的 AI 数字人口播",
  "narrative": "用户录制一段正对镜头说“1231234567”等中性占位内容的短视频，系统把它作为本人数字人形象素材；用户选择目标口播稿和本人已授权音色后，由可配置的声音克隆/TTS 与口型驱动模型生成新的口播候选，用户无需完整背稿。形象样本与声音样本必须分开说明真实最低时长和质量要求，禁止承诺只说六个数字即可同时完成可靠声音复刻；仅允许本人或有可验证授权的肖像与声音，首次生成前必须明确同意用途，支持撤销和删除，生成结果保留 AI 来源标识，不自动对外发布。AI 只产候选，用户确认后才能进入现有制作时间线；原始样本永久保留且不得被生成结果覆盖，覆盖录制引导、授权、目标稿/音色选择、异步生成、失败恢复、预览确认、刷新回读、删除与 macOS/Windows 有效成片验收。",
  "documents": "待补独立 SPEC（与 T-850 真人原声粗剪并列，共用受控成片链）",
  "source_line": "|T-851|支持录制“123”短视频生成本人授权的 AI 数字人口播|📋 待办|待审|待验|待补独立 SPEC（与 T-850 真人原声粗剪并列，共用受控成片链）|用户录制一段正对镜头说“1231234567”等中性占位内容的短视频，系统把它作为本人数字人形象素材；用户选择目标口播稿和本人已授权音色后，由可配置的声音克隆/TTS 与口型驱动模型生成新的口播候选，用户无需完整背稿。形象样本与声音样本必须分开说明真实最低时长和质量要求，禁止承诺只说六个数字即可同时完成可靠声音复刻；仅允许本人或有可验证授权的肖像与声音，首次生成前必须明确同意用途，支持撤销和删除，生成结果保留 AI 来源标识，不自动对外发布。AI 只产候选，用户确认后才能进入现有制作时间线；原始样本永久保留且不得被生成结果覆盖，覆盖录制引导、授权、目标稿/音色选择、异步生成、失败恢复、预览确认、刷新回读、删除与 macOS/Windows 有效成片验收。|",
  "source_sha256": "415a41b836dafdba3ae679f4d4766129c304a6b7d4ec887f1d16cf725242aacc",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-13e40ea0"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-850",
  "title": "支持只上传未粗剪口播录像，由 AI 理解实拍语义并生成可确认粗剪",
  "narrative": "用户只上传保留口误、停顿和重复录制的原始口播视频；系统自动提取带时间码逐字稿/SRT，由可配置 AI/Skill 对照权威口播稿和真实上下文理解哪些是正常临场微调、刻意强调、说错后重讲或废弃试讲，再产出不改原片的粗剪候选及逐段删留理由、前后预览和可恢复时间线。严禁用字符串相似度、关键词、固定词表或“与原稿不同即删除”冒充语义判断；确定性代码只负责音视频时间边界、真实 ID/权限/安全校验，以及用户确认后的裁切和 SRT、B-roll、信息卡时间码重排。无法确认时默认保留，原始视频永久保留；覆盖上传、转写、AI 语义对齐、候选确认、裁切、刷新恢复、小窗口与有效成片回读。",
  "documents": "待补独立 SPEC（复用现有口播稿、ASR/SRT、制作决策与受控渲染链）",
  "source_line": "|T-850|支持只上传未粗剪口播录像，由 AI 理解实拍语义并生成可确认粗剪|📋 待办|待审|待验|待补独立 SPEC（复用现有口播稿、ASR/SRT、制作决策与受控渲染链）|用户只上传保留口误、停顿和重复录制的原始口播视频；系统自动提取带时间码逐字稿/SRT，由可配置 AI/Skill 对照权威口播稿和真实上下文理解哪些是正常临场微调、刻意强调、说错后重讲或废弃试讲，再产出不改原片的粗剪候选及逐段删留理由、前后预览和可恢复时间线。严禁用字符串相似度、关键词、固定词表或“与原稿不同即删除”冒充语义判断；确定性代码只负责音视频时间边界、真实 ID/权限/安全校验，以及用户确认后的裁切和 SRT、B-roll、信息卡时间码重排。无法确认时默认保留，原始视频永久保留；覆盖上传、转写、AI 语义对齐、候选确认、裁切、刷新恢复、小窗口与有效成片回读。|",
  "source_sha256": "b92c60645a38f1d5ab4527bcc98ab4ac393b30f8533a5e841517f4465d4d0e7b",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-6eb90da5"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-847",
  "title": "补齐 Windows 正式包的 CreatorOS CLI runtime 并重跑 1.1.0 双端流水线",
  "narrative": "修复 run `31942889066` 暴露的 Windows production closure 缺 `frontend/cli/creatoros.cjs` 与 `cli/node.exe`：让 CLI runtime 在 production closure 构建和 Tauri `beforeBuildCommand` 二次执行之间保持完整、目标平台 Node 正确且无开发机路径依赖；补先红后绿的打包顺序、随包文件与幂等重入测试，验证现有 macOS 路径不回归。提交修复并重新冻结后运行官方 macOS/Windows 双端流水线，必须同时通过 macOS 签名/公证/真启动和 Windows NSIS 真安装/主页面/卸载，下载两个安装包并计算 SHA-256；仍不创建 tag、Release，不改 Activity/Growth 或公开分发。",
  "documents": "[构建验证](orchestrator/T847-BUILD-VALIDATION.md)",
  "source_line": "|T-847|补齐 Windows 正式包的 CreatorOS CLI runtime 并重跑 1.1.0 双端流水线|⏸️|—|—|[构建验证](orchestrator/T847-BUILD-VALIDATION.md)|修复 run `31942889066` 暴露的 Windows production closure 缺 `frontend/cli/creatoros.cjs` 与 `cli/node.exe`：让 CLI runtime 在 production closure 构建和 Tauri `beforeBuildCommand` 二次执行之间保持完整、目标平台 Node 正确且无开发机路径依赖；补先红后绿的打包顺序、随包文件与幂等重入测试，验证现有 macOS 路径不回归。提交修复并重新冻结后运行官方 macOS/Windows 双端流水线，必须同时通过 macOS 签名/公证/真启动和 Windows NSIS 真安装/主页面/卸载，下载两个安装包并计算 SHA-256；仍不创建 tag、Release，不改 Activity/Growth 或公开分发。|",
  "source_sha256": "634a9b3728c1dbf21919483741f83212a83f39b2e3653478a6cf184ba363f138",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-ed921209"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-846",
  "title": "提交当前批准候选并运行 CreatorOS 1.1.0 macOS/Windows 官方双端构建",
  "narrative": "冻结并提交当前工作树中已批准的 CLI/项目回显、视频开场、渲染超时与视觉修复、发布物料解析、Windows HyperFrames 模块解析、诊断和编排引擎同步；运行官方四项打包预检、版本/密钥扫描与候选差异审计，以非强推方式同步到 `main` 并触发 `desktop-release.yml only=all`，持续跟踪同一 run，成功后下载 macOS DMG 与 Windows setup、核验 Developer ID/公证/staple/Gatekeeper、Windows 真安装启动卸载及 SHA-256。授权不包含 tag、GitHub Release、下载地址/Activity/Growth 更新、公开分发或真实用户放量。",
  "documents": "待形成发布验证",
  "source_line": "|T-846|提交当前批准候选并运行 CreatorOS 1.1.0 macOS/Windows 官方双端构建|⏸️|—|—|待形成发布验证|冻结并提交当前工作树中已批准的 CLI/项目回显、视频开场、渲染超时与视觉修复、发布物料解析、Windows HyperFrames 模块解析、诊断和编排引擎同步；运行官方四项打包预检、版本/密钥扫描与候选差异审计，以非强推方式同步到 `main` 并触发 `desktop-release.yml only=all`，持续跟踪同一 run，成功后下载 macOS DMG 与 Windows setup、核验 Developer ID/公证/staple/Gatekeeper、Windows 真安装启动卸载及 SHA-256。授权不包含 tag、GitHub Release、下载地址/Activity/Growth 更新、公开分发或真实用户放量。|",
  "source_sha256": "5f7aafe99b6c519a4ce7de8d2048326ea4ace2a2139b95d78bbcd26e776dd57d",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-5530efbd"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-845",
  "title": "根治 Windows 用户机成片在 HyperFrames 启动阶段缺失分层模块解析器",
  "narrative": "已修复正式 `exec.video.render` 与 Windows 少文件 runtime 的消费契约：分层 HyperFrames 子进程显式按绝对路径 `--require` 同一解析器，缺失时前置报重装，开发/传统路径不变；仍禁止 `NODE_OPTIONS` 并保持密钥环境收窄。错误现保留脱敏首尾、具体包名和错误码。先红后绿后 backend 26/26、Windows closure 14/14、双包 typecheck、boundary、semantic 与 diff-check 通过；当前 macOS 不能伪造 Windows 安装包真渲染，需下一份 Windows 包安装后完成短视频捕帧、编码与有效 MP4 验收，旧包重复重试无效。",
  "documents": "[构建验证](orchestrator/T845-BUILD-VALIDATION.md) · [根因诊断](docs/research/2026-08-16-windows-video-render-module-resolution-diagnosis.md)",
  "source_line": "|T-845|根治 Windows 用户机成片在 HyperFrames 启动阶段缺失分层模块解析器|🔨|—|待验|[构建验证](orchestrator/T845-BUILD-VALIDATION.md) · [根因诊断](docs/research/2026-08-16-windows-video-render-module-resolution-diagnosis.md)|已修复正式 `exec.video.render` 与 Windows 少文件 runtime 的消费契约：分层 HyperFrames 子进程显式按绝对路径 `--require` 同一解析器，缺失时前置报重装，开发/传统路径不变；仍禁止 `NODE_OPTIONS` 并保持密钥环境收窄。错误现保留脱敏首尾、具体包名和错误码。先红后绿后 backend 26/26、Windows closure 14/14、双包 typecheck、boundary、semantic 与 diff-check 通过；当前 macOS 不能伪造 Windows 安装包真渲染，需下一份 Windows 包安装后完成短视频捕帧、编码与有效 MP4 验收，旧包重复重试无效。|",
  "source_sha256": "f3b139161d35382a53d1ce6fb7cc44065696924fadabc898b65f0da7d356e07b",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-8e800313"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-843",
  "title": "为 CreatorOS 建立可由 Codex 完整操作的官方 CLI，并复用现有全部业务能力",
  "narrative": "[D]",
  "documents": "[SPEC](BACKLOG-details.md#t-843)  [SPEC](docs/superpowers/specs/2026-08-15-creatoros-codex-cli.md)",
  "source_line": "|T-843|为 CreatorOS 建立可由 Codex 完整操作的官方 CLI，并复用现有全部业务能力|🔨|PASS[REV:ea17774db868]|—|[SPEC](BACKLOG-details.md#t-843)  [SPEC](docs/superpowers/specs/2026-08-15-creatoros-codex-cli.md)|[D]|",
  "source_sha256": "4acab37ddafcd091cc98b3f647dd65aac7115511c3784904eee42b4f6b1bb3cd",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-a989439f"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-835",
  "title": "取消制作分镜逐字保真失败对整稿候选的阻断，并给出可诊断恢复",
  "narrative": "用户确认不能再因第二阶段分镜模型未逐字复述冻结口播而阻断整次写稿。继续保留“绝不丢口播”的硬门，但把口播真值收回确定性代码：纯空白漂移按冻结原文重新锚定并保留模型分镜字段；真实增删改或分镜模型失败时，直接从冻结原文生成不引入新事实的基础分镜候选，完整口播照常可采纳，同时记录恢复类型、首个差异位置与脱敏诊断。禁止模糊相似度、禁止让模型改写原口播、禁止把技术失败甩给用户重跑整稿。",
  "documents": "复用 T-824 连续口播与制作分镜契约",
  "source_line": "|T-835|取消制作分镜逐字保真失败对整稿候选的阻断，并给出可诊断恢复|🔨|—|待验|复用 T-824 连续口播与制作分镜契约|用户确认不能再因第二阶段分镜模型未逐字复述冻结口播而阻断整次写稿。继续保留“绝不丢口播”的硬门，但把口播真值收回确定性代码：纯空白漂移按冻结原文重新锚定并保留模型分镜字段；真实增删改或分镜模型失败时，直接从冻结原文生成不引入新事实的基础分镜候选，完整口播照常可采纳，同时记录恢复类型、首个差异位置与脱敏诊断。禁止模糊相似度、禁止让模型改写原口播、禁止把技术失败甩给用户重跑整稿。|",
  "source_sha256": "5d06c370f40ec084365837db01820c5131b008a6fe70bd92ca017fcb718e9cd8",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-fba359c6"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-833",
  "title": "根治结构化节点 schema 兼容报错与多张局部改稿卡无法连续采纳",
  "narrative": "高频出现 `generateObject` 返回对象含 effective outputSchema 明确禁止的额外字段，文本兜底仍被同一严格校验拒绝；同一回复产生多张局部改稿候选时，采纳第一张会生成新稿版本，第二张仍绑定旧 base version/hash 而无法继续采纳。必须先以真实调用链和红测锁定根因，再只清理 schema 明确禁止的协议外字段且保持必填/类型约束 fail-closed，并让未采纳卡基于权威当前稿安全重放或明确检测同段冲突，支持按顺序全部采纳且不覆盖并发编辑、不伪造成功。",
  "documents": "复用既有结构化节点可靠性契约、`script.patch` 候选确认链与 T-819 当前稿定位契约",
  "source_line": "|T-833|根治结构化节点 schema 兼容报错与多张局部改稿卡无法连续采纳|🔨|—|待验|复用既有结构化节点可靠性契约、`script.patch` 候选确认链与 T-819 当前稿定位契约|高频出现 `generateObject` 返回对象含 effective outputSchema 明确禁止的额外字段，文本兜底仍被同一严格校验拒绝；同一回复产生多张局部改稿候选时，采纳第一张会生成新稿版本，第二张仍绑定旧 base version/hash 而无法继续采纳。必须先以真实调用链和红测锁定根因，再只清理 schema 明确禁止的协议外字段且保持必填/类型约束 fail-closed，并让未采纳卡基于权威当前稿安全重放或明确检测同段冲突，支持按顺序全部采纳且不覆盖并发编辑、不伪造成功。|",
  "source_sha256": "e717a7099e6057fc6e752577e4d02d1567733fd264c411a9a02aa095056bfaf3",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-58ac8288"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-831",
  "title": "重排官方渠道模型配置并复核上游图生图能力",
  "narrative": "用户确认官方 OmniHi 与本地中转站采用兼容双路径：官方托管参考图只认独立 `image.edit`，本地 Dudu/OpenAI-compatible 未单配 `image.edit` 时继续复用既有 `image.generate`；禁止按供应商名猜路由。CreatorOS 聚焦测试及三端类型检查通过。生产仍为 v2；后续保存 v3 并权威回读，不影响本地包继续使用本地自配图生图。",
  "documents": "[官方配置确认稿](orchestrator/T831-OFFICIAL-MODEL-CONFIG-PROPOSAL.md) · [构建验证](orchestrator/T831-BUILD-VALIDATION.md) · [全模型返佣收益测算](docs/research/2026-08-14-omnihi-all-model-profit-analysis.md) · [全模型兼容矩阵](orchestrator/T829-MODEL-COMPATIBILITY-VALIDATION.md) · [逐能力模型契约](docs/superpowers/specs/2026-08-02-capability-scoped-channel-model-authority.md)",
  "source_line": "|T-831|重排官方渠道模型配置并复核上游图生图能力|🔨|—|待验|[官方配置确认稿](orchestrator/T831-OFFICIAL-MODEL-CONFIG-PROPOSAL.md) · [构建验证](orchestrator/T831-BUILD-VALIDATION.md) · [全模型返佣收益测算](docs/research/2026-08-14-omnihi-all-model-profit-analysis.md) · [全模型兼容矩阵](orchestrator/T829-MODEL-COMPATIBILITY-VALIDATION.md) · [逐能力模型契约](docs/superpowers/specs/2026-08-02-capability-scoped-channel-model-authority.md)|用户确认官方 OmniHi 与本地中转站采用兼容双路径：官方托管参考图只认独立 `image.edit`，本地 Dudu/OpenAI-compatible 未单配 `image.edit` 时继续复用既有 `image.generate`；禁止按供应商名猜路由。CreatorOS 聚焦测试及三端类型检查通过。生产仍为 v2；后续保存 v3 并权威回读，不影响本地包继续使用本地自配图生图。|",
  "source_sha256": "c4ddf49152bf1d55818b37d56354b71a61baf27cb7e0399bb48ed4d85e7b1b95",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-7e26c87e"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-829",
  "title": "建立并执行上游模型全能力真实兼容矩阵，覆盖渠道托管与用户中转站",
  "narrative": "三份 Windows 日志确认模型请求前即被渠道配置 `security_error` 拦截；当前配置 13 模型已完成双接入验证。扩展轮又对中转站 `/models` 实时返回的 79 个模型逐个真跑流式/工具/结构化：首轮 153/237 请求通过，36 个首轮全过、3 个 60s 复测全过但不稳定、22 个部分可用、18 个三项均失败；连复测合计消耗 0.84532054 元，隔离 Key 已删除并复查剩余 0。正式 Skill、文生图/视频与错误分类修复均纳入同一报告；不修改用户配置、不自动切模、不发布。",
  "documents": "[真实兼容矩阵](orchestrator/T829-MODEL-COMPATIBILITY-VALIDATION.md) · [逐能力模型契约](docs/superpowers/specs/2026-08-02-capability-scoped-channel-model-authority.md) · [模型配置体验契约](docs/superpowers/specs/2026-07-24-model-configuration-experience-redesign.contract.md)",
  "source_line": "|T-829|建立并执行上游模型全能力真实兼容矩阵，覆盖渠道托管与用户中转站|🔨|—|待验|[真实兼容矩阵](orchestrator/T829-MODEL-COMPATIBILITY-VALIDATION.md) · [逐能力模型契约](docs/superpowers/specs/2026-08-02-capability-scoped-channel-model-authority.md) · [模型配置体验契约](docs/superpowers/specs/2026-07-24-model-configuration-experience-redesign.contract.md)|三份 Windows 日志确认模型请求前即被渠道配置 `security_error` 拦截；当前配置 13 模型已完成双接入验证。扩展轮又对中转站 `/models` 实时返回的 79 个模型逐个真跑流式/工具/结构化：首轮 153/237 请求通过，36 个首轮全过、3 个 60s 复测全过但不稳定、22 个部分可用、18 个三项均失败；连复测合计消耗 0.84532054 元，隔离 Key 已删除并复查剩余 0。正式 Skill、文生图/视频与错误分类修复均纳入同一报告；不修改用户配置、不自动切模、不发布。|",
  "source_sha256": "04f9a40604395d04de399a99d3349fe0079f47338afacfbc4c2698730e7cc216",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-a3a19b58"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-828",
  "title": "诊断行业热点出题不可用、Windows 滚动条异常与 DeepMind/Max 模型报错",
  "narrative": "已确认三类问题互相独立：左栏“行业热点”是 0 候选即禁用的已有候选筛选器，顶部“基于热点出题”只打开编导并预填、不会自动执行，且真实热点依赖内容雷达信源/登录态或联网搜索；Windows 三根白色粗条来自 sidebar、稿面、Copilot 三个 raw `overflow-y-auto` 容器，暗色主题没有原生 scrollbar 适配；MiniMax 预设端点与当前官方文档一致，但模型 ID 自由输入且未做实时校验。所附 8 月 8 日日志只有 activation-only 启停 16 行、退出码 0，没有模型/热点调用，无法诚实判定本次是模型名、审核、额度、限流或超时；待用户复现后提供当天日志或错误原文再收口唯一根因。",
  "documents": "[脱敏诊断报告](docs/research/2026-08-13-windows-hotspot-scrollbar-minimax-diagnosis.md)",
  "source_line": "|T-828|诊断行业热点出题不可用、Windows 滚动条异常与 DeepMind/Max 模型报错|🔨|—|待验|[脱敏诊断报告](docs/research/2026-08-13-windows-hotspot-scrollbar-minimax-diagnosis.md)|已确认三类问题互相独立：左栏“行业热点”是 0 候选即禁用的已有候选筛选器，顶部“基于热点出题”只打开编导并预填、不会自动执行，且真实热点依赖内容雷达信源/登录态或联网搜索；Windows 三根白色粗条来自 sidebar、稿面、Copilot 三个 raw `overflow-y-auto` 容器，暗色主题没有原生 scrollbar 适配；MiniMax 预设端点与当前官方文档一致，但模型 ID 自由输入且未做实时校验。所附 8 月 8 日日志只有 activation-only 启停 16 行、退出码 0，没有模型/热点调用，无法诚实判定本次是模型名、审核、额度、限流或超时；待用户复现后提供当天日志或错误原文再收口唯一根因。|",
  "source_sha256": "fb0dfd082613ef1b1006ce3098a405a3a3f9e42791afa1187a93f34eee78ffe0",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-6ce3156b"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-827",
  "title": "根治选题中心来源筛选失效与候选操作按钮无法点击",
  "narrative": "根因已锁定并修复：`guardrail` 排序分支原先丢弃 `source`，现透传来源、状态、时间与分页；“手动灵感”在真实页只返回 2 条 idea 候选，清除后恢复 3 条全量。补全选题卡打开 AI 助手会保留当前 `sort + source`，关闭后不再跳丢筛选。左栏 5 个无法一对一映射候选来源的统计项明确标“仅统计”并解释原因，热点/灵感显示候选池真实数量。后端 16/16、前端 25/25、双端类型检查与 1024×768 真页面旅程已通过；不改选题语义、数据归属或用户数据，待用户本地包验收。",
  "documents": "[构建验证](orchestrator/T827-BUILD-VALIDATION.md) · 复用既有选题中心页面与 topic 操作契约",
  "source_line": "|T-827|根治选题中心来源筛选失效与候选操作按钮无法点击|🔨|—|待验|[构建验证](orchestrator/T827-BUILD-VALIDATION.md) · 复用既有选题中心页面与 topic 操作契约|根因已锁定并修复：`guardrail` 排序分支原先丢弃 `source`，现透传来源、状态、时间与分页；“手动灵感”在真实页只返回 2 条 idea 候选，清除后恢复 3 条全量。补全选题卡打开 AI 助手会保留当前 `sort + source`，关闭后不再跳丢筛选。左栏 5 个无法一对一映射候选来源的统计项明确标“仅统计”并解释原因，热点/灵感显示候选池真实数量。后端 16/16、前端 25/25、双端类型检查与 1024×768 真页面旅程已通过；不改选题语义、数据归属或用户数据，待用户本地包验收。|",
  "source_sha256": "b21454b361b4937c990cd3ec24eb7b0dbe605ec911c7931483f816de2f7c305d",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-f86fc8da"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-826",
  "title": "根治 CreatorOS v1.1 Windows 新安装包安装后无法启动",
  "narrative": "根因已锁定为升级机旧 appData runtime 让启动代码跳过新安装 runtime，安装归档在成功物化后又已删除，最终误报缺 `sidecar.tar.gz`。已改为验证新副本后原子替换、提交失败恢复旧副本；Windows 验收包 run `31766801381` 已在模拟旧 runtime 状态下完成真安装、GUI、sidecar 主页面加载和卸载，安装包 SHA-256 已入构建验证。不触碰项目、数据库、密钥和日志；现只待用户在原故障机器直接安装复验，不创建 tag/Release、不改下载地址、不公开放量。",
  "documents": "[Windows 首次启动 SPEC](docs/superpowers/specs/2026-07-23-desktop-packaging-first-launch-design.md) · [根因诊断](docs/research/2026-08-13-windows-v1.1-upgrade-startup-failure.md) · [构建验证](orchestrator/T826-BUILD-VALIDATION.md)",
  "source_line": "|T-826|根治 CreatorOS v1.1 Windows 新安装包安装后无法启动|🔨|—|待验|[Windows 首次启动 SPEC](docs/superpowers/specs/2026-07-23-desktop-packaging-first-launch-design.md) · [根因诊断](docs/research/2026-08-13-windows-v1.1-upgrade-startup-failure.md) · [构建验证](orchestrator/T826-BUILD-VALIDATION.md)|根因已锁定为升级机旧 appData runtime 让启动代码跳过新安装 runtime，安装归档在成功物化后又已删除，最终误报缺 `sidecar.tar.gz`。已改为验证新副本后原子替换、提交失败恢复旧副本；Windows 验收包 run `31766801381` 已在模拟旧 runtime 状态下完成真安装、GUI、sidecar 主页面加载和卸载，安装包 SHA-256 已入构建验证。不触碰项目、数据库、密钥和日志；现只待用户在原故障机器直接安装复验，不创建 tag/Release、不改下载地址、不公开放量。|",
  "source_sha256": "4f28285a0980fbed752c5b2ddaa7667cb6720c90485e68473a15f9226f2d8b51",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-c24423d2"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-824",
  "title": "根治昨日文稿 Skill 与内容动效卡片迭代在标准版成品中无明显效果",
  "narrative": "[D]",
  "documents": "[SPEC](BACKLOG-details.md#t-824)  [SPEC](docs/superpowers/specs/2026-08-13-continuous-voiceover-storyboard-pipeline.md)",
  "source_line": "|T-824|根治昨日文稿 Skill 与内容动效卡片迭代在标准版成品中无明显效果|🔨|PASS[REV:75ad91fe7654]|待验|[SPEC](BACKLOG-details.md#t-824)  [SPEC](docs/superpowers/specs/2026-08-13-continuous-voiceover-storyboard-pipeline.md)|[D]|",
  "source_sha256": "b55b7e9d6db584f0ccecaaac0f6ab3e070085531b87f414a95fc0c43af11c1aa",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-aec05942"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-823",
  "title": "根治架构图等主视觉被信息卡遮挡并修正跨段画面切换滞后",
  "narrative": "当场景已有用户素材或生成的架构图、流程图、界面截图等高信息主视觉时，渲染器必须让主视觉占据可读安全区，信息卡只能作为不遮正文的紧凑标注，禁止把主图降成后方装饰卡；卡片内容必须绑定当前口播/字幕段，模式层结束即切换到可观测层，不能沿用上一段数秒。覆盖主图可读面积、人物避让、文字截断、相邻分段切换边界与当前 DeepSeek Harness 成片关键帧回归，并将本次反馈沉淀进视频编辑自迭代规则。",
  "documents": "[构建验证](orchestrator/T823-BUILD-VALIDATION.md)",
  "source_line": "|T-823|根治架构图等主视觉被信息卡遮挡并修正跨段画面切换滞后|🔨|—|待验|[构建验证](orchestrator/T823-BUILD-VALIDATION.md)|当场景已有用户素材或生成的架构图、流程图、界面截图等高信息主视觉时，渲染器必须让主视觉占据可读安全区，信息卡只能作为不遮正文的紧凑标注，禁止把主图降成后方装饰卡；卡片内容必须绑定当前口播/字幕段，模式层结束即切换到可观测层，不能沿用上一段数秒。覆盖主图可读面积、人物避让、文字截断、相邻分段切换边界与当前 DeepSeek Harness 成片关键帧回归，并将本次反馈沉淀进视频编辑自迭代规则。|",
  "source_sha256": "484abb8f881fced8c378709a40d9994c39fdb1936fda51a4602d6b31391e912f",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-2c0b55c0"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-821",
  "title": "网站内容因未登录或权限不足读取失败时引导用户前往登录保管库",
  "narrative": "当联网读取明确返回未登录、需要权限或登录后重试时，把冗长的内部恢复说明改成用户能行动的错误卡：说明当前未拿到原文、不会编造内容，提供“前往网站登录”入口直达「设置 → 网站登录保管库」，并保留登录后重试；普通 404、下架或无替代来源仍按真实原因提示，不得一律伪装成登录问题。覆盖按钮真实接线、返回路径、键盘可用性及没有设置入口时的诚实降级。",
  "documents": "[构建验证](orchestrator/T821-BUILD-VALIDATION.md)",
  "source_line": "|T-821|网站内容因未登录或权限不足读取失败时引导用户前往登录保管库|🔨|—|待验|[构建验证](orchestrator/T821-BUILD-VALIDATION.md)|当联网读取明确返回未登录、需要权限或登录后重试时，把冗长的内部恢复说明改成用户能行动的错误卡：说明当前未拿到原文、不会编造内容，提供“前往网站登录”入口直达「设置 → 网站登录保管库」，并保留登录后重试；普通 404、下架或无替代来源仍按真实原因提示，不得一律伪装成登录问题。覆盖按钮真实接线、返回路径、键盘可用性及没有设置入口时的诚实降级。|",
  "source_sha256": "4931c99a883f287a082c349dd8e02b7534807beb66178af6a10e5e3b69b4a435",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-c2b8c596"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-819",
  "title": "让编导在普通对话中按自然语言定位并改写当前稿单段",
  "narrative": "[D]",
  "documents": "[SPEC](BACKLOG-details.md#t-819)  [SPEC](docs/superpowers/specs/2026-08-13-natural-language-current-script-section-editing.md)",
  "source_line": "|T-819|让编导在普通对话中按自然语言定位并改写当前稿单段|🔨|PASS[REV:e6f5293361af]|待验|[SPEC](BACKLOG-details.md#t-819)  [SPEC](docs/superpowers/specs/2026-08-13-natural-language-current-script-section-editing.md)|[D]|",
  "source_sha256": "81902f81e4248002bd800cdd0c6ce92afdd496422de5c995b49fb9ecb2c54739",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-25b9fb5e"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-820",
  "title": "修复选题补卡到项目与文案的数据丢失并保存生成消费血缘",
  "narrative": "以 T-811 血缘审计为输入，打通补全选题卡到项目统一创作 Brief、可选论点和 `script.draft` 的真实消费：承接受众痛点、核心冲突、钩子方向、内容结构、素材依据与风险；修复 angle 已存任务却未进 runner、项目普通保存覆盖 `contentRadarEvidence/benchmarkRef`、立项 source 误标 manual 与三次写入非事务；让论点与写稿共享同一份 Brief/知识/项目证据，并为每次生成保存来源版本、字段 hash、是否实际消费及未消费原因。评分与定位标签是否进入生成须在 SPEC 中逐项裁决，不能把所有上游字段无脑塞进提示词。",
  "documents": "待形成 SPEC",
  "source_line": "|T-820|修复选题补卡到项目与文案的数据丢失并保存生成消费血缘|📋 待办|—|—|待形成 SPEC|以 T-811 血缘审计为输入，打通补全选题卡到项目统一创作 Brief、可选论点和 `script.draft` 的真实消费：承接受众痛点、核心冲突、钩子方向、内容结构、素材依据与风险；修复 angle 已存任务却未进 runner、项目普通保存覆盖 `contentRadarEvidence/benchmarkRef`、立项 source 误标 manual 与三次写入非事务；让论点与写稿共享同一份 Brief/知识/项目证据，并为每次生成保存来源版本、字段 hash、是否实际消费及未消费原因。评分与定位标签是否进入生成须在 SPEC 中逐项裁决，不能把所有上游字段无脑塞进提示词。|",
  "source_sha256": "468e452cf737eb79b282a708e2185ec28c749418dde2f932f06273bd5b0ffa63",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-09f475c2"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-816",
  "title": "让当前确认稿成为配图与封面生成的第一内容真相",
  "narrative": "[D]",
  "documents": "[SPEC](BACKLOG-details.md#t-816)  [SPEC](docs/superpowers/specs/2026-08-13-current-script-truth-and-natural-language-section-editing.md)",
  "source_line": "|T-816|让当前确认稿成为配图与封面生成的第一内容真相|🔨|PASS[REV:ae495e3cb84f]|待验|[SPEC](BACKLOG-details.md#t-816)  [SPEC](docs/superpowers/specs/2026-08-13-current-script-truth-and-natural-language-section-editing.md)|[D]|",
  "source_sha256": "1625ad61c92e605491ae316bf4e74b31001121ac29c85bdf4db5f43a54f3d099",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-e43c459e"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-814",
  "title": "统一 CreatorOS 多页面 AI 对话体验并保留场景上下文与自由讨论能力",
  "narrative": "当前多个 AI 助手、浮层和页面入口给用户造成能力割裂；设计一个账号级连续编导会话与项目级连续创作会话，页面选择只作为当前上下文和快捷动作，不把助手限制为“选题页只能聊选题”；需要支持自由讨论、跨页面续聊、明确显示当前作用对象、切换项目/选题前确认、生成候选后由用户采纳，兼容现有工具、历史对话、内容雷达证据和项目 Brief，不一次性替换运行时或迁移历史数据，并以影子组装、双读校验和可回滚开关降低回归风险。",
  "documents": "待形成 SPEC",
  "source_line": "|T-814|统一 CreatorOS 多页面 AI 对话体验并保留场景上下文与自由讨论能力|📋 待办|—|—|待形成 SPEC|当前多个 AI 助手、浮层和页面入口给用户造成能力割裂；设计一个账号级连续编导会话与项目级连续创作会话，页面选择只作为当前上下文和快捷动作，不把助手限制为“选题页只能聊选题”；需要支持自由讨论、跨页面续聊、明确显示当前作用对象、切换项目/选题前确认、生成候选后由用户采纳，兼容现有工具、历史对话、内容雷达证据和项目 Brief，不一次性替换运行时或迁移历史数据，并以影子组装、双读校验和可回滚开关降低回归风险。|",
  "source_sha256": "a21b85bef3f0eb02d57f3798006642fda1f9bad8dbfb1a779f448ef587dd4047",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-3233c1e9"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-779",
  "title": "根治参考历史作品生成封面时误探本机工具并中断生图",
  "narrative": "当用户要求参考历史作品生成封面时，只从当前账号真实已发布且有封面的近期作品中，由编导模型结合当前内容语义选择“最新且最关联”的一条，相关性优先、发布时间用于同等相关候选裁决；随后必须直接把真实 `coverAssetId` 交给 `cover.generate`，不得用 `local.tools` 探测应用内生图模型、不得把 draft 当已发布作品、不得让用户替系统做 A/B 选择。缺配置、参考图读取或生成失败仍由真实封面任务诚实返回，不改视觉。",
  "documents": "既有 `cover.generate`、`context.publications` 与 Copilot 媒体路由契约",
  "source_line": "|T-779|根治参考历史作品生成封面时误探本机工具并中断生图|🔨|—|待验|既有 `cover.generate`、`context.publications` 与 Copilot 媒体路由契约|当用户要求参考历史作品生成封面时，只从当前账号真实已发布且有封面的近期作品中，由编导模型结合当前内容语义选择“最新且最关联”的一条，相关性优先、发布时间用于同等相关候选裁决；随后必须直接把真实 `coverAssetId` 交给 `cover.generate`，不得用 `local.tools` 探测应用内生图模型、不得把 draft 当已发布作品、不得让用户替系统做 A/B 选择。缺配置、参考图读取或生成失败仍由真实封面任务诚实返回，不改视觉。|",
  "source_sha256": "b1f33eb8eed0f9024bb8591af04232380e7c86cd28634d583ae420683968d700",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-d011cd32"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-773",
  "title": "更新 CreatorOS 1.0 最新使用教程、匿名化截图并新建成交型测试版教程",
  "narrative": "以当前 1.0 产品事实重新核对教程中的入口、流程、模型、视频制作、激活与反馈等变化；逐张检查教程引用的实机截图，将左下角博主头像、昵称、账号名称等身份信息统一遮挡并保留原图可恢复副本；同时面向新引入客资新建“一天跑出真实成果”的测试版飞书教程，写入真实一天体验码，以产品理解、机制信任、快速成果和授权伙伴购买引导完成转化，不公开价格或绕过推荐人的直营入口；验证全部图片链接与文档事实，不修改产品代码。",
  "documents": "[完整教程](docs/CreatorOS-新用户0到1标杆路线.md) · [测试版飞书教程](https://my.feishu.cn/wiki/GaHrwmGHHiU8MQkovQZcNjxMnpe) · [发布稿](outputs/T-773/creatoros-v1-test-conversion-guide.md)",
  "source_line": "|T-773|更新 CreatorOS 1.0 最新使用教程、匿名化截图并新建成交型测试版教程|🔨|—|待验|[完整教程](docs/CreatorOS-新用户0到1标杆路线.md) · [测试版飞书教程](https://my.feishu.cn/wiki/GaHrwmGHHiU8MQkovQZcNjxMnpe) · [发布稿](outputs/T-773/creatoros-v1-test-conversion-guide.md)|以当前 1.0 产品事实重新核对教程中的入口、流程、模型、视频制作、激活与反馈等变化；逐张检查教程引用的实机截图，将左下角博主头像、昵称、账号名称等身份信息统一遮挡并保留原图可恢复副本；同时面向新引入客资新建“一天跑出真实成果”的测试版飞书教程，写入真实一天体验码，以产品理解、机制信任、快速成果和授权伙伴购买引导完成转化，不公开价格或绕过推荐人的直营入口；验证全部图片链接与文档事实，不修改产品代码。|",
  "source_sha256": "f46c42403058ca2b6b2a032a0774ec8663235aef79ad9499cbb46bcd821bdca8",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-6b6ce0ca"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-768",
  "title": "任何云端 ASR 故障都必须自动回退本地 Whisper",
  "narrative": "[D]",
  "documents": "[SPEC](BACKLOG-details.md#t-768)  [SPEC](docs/superpowers/specs/2026-08-11-asr-universal-local-fallback.md)",
  "source_line": "|T-768|任何云端 ASR 故障都必须自动回退本地 Whisper|🔨|PASS[REV:62cbba60bcd7]|待验|[SPEC](BACKLOG-details.md#t-768)  [SPEC](docs/superpowers/specs/2026-08-11-asr-universal-local-fallback.md)|[D]|",
  "source_sha256": "9291705a1fad1f0285081e0fa5106deed0e6f7bd2f68a50bcaaa58e1730f94e2",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-f0a2ead2"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-762",
  "title": "根因复盘并设计渠道 ASR 密钥的短时租约闭环",
  "narrative": "基于昨天真实渠道 ASR 故障、当前 Activity ticket v3、Growth 受管凭据与本地密钥库实现，区分长期渠道密钥、短时 ASR lease、机器绑定和失败恢复的责任边界，形成不暴露长期密钥、不依赖用户手工配置、可自动续租且 fail-closed 的根治方案；本任务不修改产品代码或生产配置。",
  "documents": "[受管模型契约](docs/superpowers/specs/2026-08-02-capability-scoped-channel-model-authority.md) · 既有 T-679/T-735/T-731 证据",
  "source_line": "|T-762|根因复盘并设计渠道 ASR 密钥的短时租约闭环|🔨|—|—|[受管模型契约](docs/superpowers/specs/2026-08-02-capability-scoped-channel-model-authority.md) · 既有 T-679/T-735/T-731 证据|基于昨天真实渠道 ASR 故障、当前 Activity ticket v3、Growth 受管凭据与本地密钥库实现，区分长期渠道密钥、短时 ASR lease、机器绑定和失败恢复的责任边界，形成不暴露长期密钥、不依赖用户手工配置、可自动续租且 fail-closed 的根治方案；本任务不修改产品代码或生产配置。|",
  "source_sha256": "dea18c8a454048d97f6d37b153286e94ac685e1b64ec1c6e5588892eab76bbbc",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-30a69f57"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-759",
  "title": "根治已绑定 B-roll 因 inventory 失配显示空白",
  "narrative": "分镜里的每条 B-roll 绑定必须与同源项目素材快照一起原子保存和恢复；当前素材仍可用时展示真实名称并可换选，素材已删除、归属变化或旧方案缺元数据时明确显示“素材已不可用”并允许移除或从当前项目重新选择，禁止渲染空白下拉、禁止静默改绑、禁止重新调用模型或读取全局/其他项目素材。",
  "documents": "既有 video.decisions、production.videoEditingPlan 与项目素材归属契约",
  "source_line": "|T-759|根治已绑定 B-roll 因 inventory 失配显示空白|🔨|—|待验|既有 video.decisions、production.videoEditingPlan 与项目素材归属契约|分镜里的每条 B-roll 绑定必须与同源项目素材快照一起原子保存和恢复；当前素材仍可用时展示真实名称并可换选，素材已删除、归属变化或旧方案缺元数据时明确显示“素材已不可用”并允许移除或从当前项目重新选择，禁止渲染空白下拉、禁止静默改绑、禁止重新调用模型或读取全局/其他项目素材。|",
  "source_sha256": "2302a533cf1cafc522a25d50fdc9fb01a8d1a578fd99ad295570ac36d79a20c4",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-3dc6d151"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-754",
  "title": "根治 CreatorOS v1.0 官方包启动无限转圈",
  "narrative": "基于当前官方安装包启动状态机与安全日志锁定“持续转圈但既不进入主页面也不进入诊断页”的真实原因；真实进展只允许续期空闲看门狗，整个启动必须受最终收敛上限约束，sidecar 退出、重复无效进展、主页加载失败均及时进入可操作诊断且保全数据；补 macOS/Windows 契约与本地真启动回归，不改视觉、不顺带增加功能，正式重打包另按用户确认执行。",
  "documents": "[桌面首次启动 SPEC](docs/superpowers/specs/2026-07-23-desktop-packaging-first-launch-design.md) · 既有 T-747 进展感知软看门狗契约",
  "source_line": "|T-754|根治 CreatorOS v1.0 官方包启动无限转圈|🔨|—|—|[桌面首次启动 SPEC](docs/superpowers/specs/2026-07-23-desktop-packaging-first-launch-design.md) · 既有 T-747 进展感知软看门狗契约|基于当前官方安装包启动状态机与安全日志锁定“持续转圈但既不进入主页面也不进入诊断页”的真实原因；真实进展只允许续期空闲看门狗，整个启动必须受最终收敛上限约束，sidecar 退出、重复无效进展、主页加载失败均及时进入可操作诊断且保全数据；补 macOS/Windows 契约与本地真启动回归，不改视觉、不顺带增加功能，正式重打包另按用户确认执行。|",
  "source_sha256": "7aee1c1498c75a69ad74e9d0d4d2478a891eb8ad65264e53b90cbbdb0499e209",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-d6351aff"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-748",
  "title": "补齐“重新输入激活码”原生命令 ACL 并重打官方包",
  "narrative": "正式包点击“重新输入激活码”不得再出现 `Command license_reset_local not allowed by ACL`；只为无参数命令 `license_reset_local` 增加最小 remote-sidecar 放行权限，并补齐“前端 invoke ↔ handler ↔ build command ↔ capability”一致性回归，不改 UI、清理边界或发布流程；验证后重跑官方 macOS/Windows 打包。",
  "documents": "[T-746 SPEC](docs/superpowers/specs/2026-08-09-in-product-activation-reset-design.md)",
  "source_line": "|T-748|补齐“重新输入激活码”原生命令 ACL 并重打官方包|🔨|—|—|[T-746 SPEC](docs/superpowers/specs/2026-08-09-in-product-activation-reset-design.md)|正式包点击“重新输入激活码”不得再出现 `Command license_reset_local not allowed by ACL`；只为无参数命令 `license_reset_local` 增加最小 remote-sidecar 放行权限，并补齐“前端 invoke ↔ handler ↔ build command ↔ capability”一致性回归，不改 UI、清理边界或发布流程；验证后重跑官方 macOS/Windows 打包。|",
  "source_sha256": "7f88d0b0818014e29765d49b7f2fe89d0c62fadfea448eeac30a1c00e9296a48",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-75df17a2"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-741",
  "title": "下移知识库“记一条经验”入口到录入操作行",
  "narrative": "保留“记一条经验”现有 Copilot 深链与行为，只把入口从知识库页头右侧移动到倾倒场的录入按钮行、紧邻“手动补录”；页面只能保留一个入口，不改按钮风格、录入流程或知识库整体视觉。",
  "documents": "既有知识录入与经验捕获契约",
  "source_line": "|T-741|下移知识库“记一条经验”入口到录入操作行|🔨|—|待验|既有知识录入与经验捕获契约|保留“记一条经验”现有 Copilot 深链与行为，只把入口从知识库页头右侧移动到倾倒场的录入按钮行、紧邻“手动补录”；页面只能保留一个入口，不改按钮风格、录入流程或知识库整体视觉。|",
  "source_sha256": "327cf2d0125c84573e29f028e0b09b43b73d0774c2f73dfb8ea5a0288b6e0509",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-6128224e"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-739",
  "title": "根治制作视频跨项目灌入 B-roll、无证据改稿偏好与超长复盘卡",
  "narrative": "视频制作的 B-roll 候选只能读取当前项目明确挂载/上传的素材；当前项目没有素材时诚实为空，不得混入全局或其他项目素材。改稿偏好只能由当前项目自身已发布后的评论、指标与用户明确采纳行为派生；项目未制作、未发布或无数据时不得展示跨作品偏好。复盘卡只展示简短、可核验摘要，详细依据按需展开，不得把内部信号、整稿或超长原始文本直接铺满页面；不改全局视觉体系。",
  "documents": "既有项目素材挂载、视频制作与发布复盘契约",
  "source_line": "|T-739|根治制作视频跨项目灌入 B-roll、无证据改稿偏好与超长复盘卡|🔨|—|待验|既有项目素材挂载、视频制作与发布复盘契约|视频制作的 B-roll 候选只能读取当前项目明确挂载/上传的素材；当前项目没有素材时诚实为空，不得混入全局或其他项目素材。改稿偏好只能由当前项目自身已发布后的评论、指标与用户明确采纳行为派生；项目未制作、未发布或无数据时不得展示跨作品偏好。复盘卡只展示简短、可核验摘要，详细依据按需展开，不得把内部信号、整稿或超长原始文本直接铺满页面；不改全局视觉体系。|",
  "source_sha256": "bf4cf77ef37844137175b265b2c6fbad1974af9b61774d48ee6d130dce6d1ed4",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-4c755929"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-738",
  "title": "根治发布物料生成成功后无处查看并恢复卡内查看闭环",
  "narrative": "“生成发布物料”成功后，原项目卡片必须显示真实可用的“查看发布物料”，在当前查看界面直接读取并展示已生成的各平台标题、正文等发布内容，支持刷新后回读；不得跳转发布中心，发布中心继续只负责排期管理，不新增发布管理入口、不改导航或视觉结构。",
  "documents": "既有发布物料生成与项目稿面契约",
  "source_line": "|T-738|根治发布物料生成成功后无处查看并恢复卡内查看闭环|🔨|—|待验|既有发布物料生成与项目稿面契约|“生成发布物料”成功后，原项目卡片必须显示真实可用的“查看发布物料”，在当前查看界面直接读取并展示已生成的各平台标题、正文等发布内容，支持刷新后回读；不得跳转发布中心，发布中心继续只负责排期管理，不新增发布管理入口、不改导航或视觉结构。|",
  "source_sha256": "e193edec529a7862ec6403051bcafc815f2b2360107e6d7c3a75da2e03e5ae59",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-3f860f8b"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-735",
  "title": "根治渠道受管模型成功产物被误判失败并建立 C 端稳定性闭环",
  "narrative": "以智溯AI真实 C 端日志和 OmniHi 任务事实为验收基线：2026-08-10 01:07:55 提交的 `seedance/seedance-2.0-fast` 视频在上游 01:09:56 已 `succeeded` 并产出可下载 MP4，CreatorOS 却于 01:09:57 将本地任务取消；同日生图也在上游成功并产生可下载 PNG，但客户端报错。根治图片与视频对真实 `result.data[0].url`、OpenAI 兼容顶层 `data[0]` 及已签约历史形状的解析差异，成功产物必须落为可预览候选，禁止把已生成且已计费的结果丢掉。对提交、轮询、下载和本地落库分别建立稳定状态与脱敏关联号；网络抖动只允许有界重试，未证明提交未被受理时不得重复发起计费生成；上游已成功而本地失败时必须按 provider job id 幂等恢复产物，过期或确实不可恢复时给出明确状态与人工处理入口。渠道错误包装必须保留可行动分类、HTTP/任务阶段和脱敏 reference，不得再把鉴权、额度、限流、上游失败、响应契约漂移、下载失败全部压成 `ChannelManagedProviderError reason=unknown`，同时不得向 C 端暴露中转站、子 Key、Base URL 或内部 provider。补真实响应合同 fixture、单元/集成测试、故障注入、重复提交与恢复测试，以及 Growth→CreatorOS→中转端的并发/背压、限流、超时和熔断验收；明确 Growth 控制面与直连数据面的并发责任，保证单用户并发不会重复计费、吞掉成功产物或拖垮客户端。以智溯AI渠道包完成文本、ASR、生图、生视频连续与并发真机回归，记录成功率、P95、错误分类和账单一致性；不得用测试连接或上游成功记录冒充 CreatorOS 端到端成功。本任务不授权部署或发布。",
  "documents": "[受管模型契约](docs/superpowers/specs/2026-08-02-capability-scoped-channel-model-authority.md) · [Growth 持久凭据契约](/Users/zyongzhu/Workbase/Thirdspace-growth/docs/contracts/T-133-activation-managed-model-subkey.md) · T-679/T-655 既有实现",
  "source_line": "|T-735|根治渠道受管模型成功产物被误判失败并建立 C 端稳定性闭环|🔨|—|待验|[受管模型契约](docs/superpowers/specs/2026-08-02-capability-scoped-channel-model-authority.md) · [Growth 持久凭据契约](/Users/zyongzhu/Workbase/Thirdspace-growth/docs/contracts/T-133-activation-managed-model-subkey.md) · T-679/T-655 既有实现|以智溯AI真实 C 端日志和 OmniHi 任务事实为验收基线：2026-08-10 01:07:55 提交的 `seedance/seedance-2.0-fast` 视频在上游 01:09:56 已 `succeeded` 并产出可下载 MP4，CreatorOS 却于 01:09:57 将本地任务取消；同日生图也在上游成功并产生可下载 PNG，但客户端报错。根治图片与视频对真实 `result.data[0].url`、OpenAI 兼容顶层 `data[0]` 及已签约历史形状的解析差异，成功产物必须落为可预览候选，禁止把已生成且已计费的结果丢掉。对提交、轮询、下载和本地落库分别建立稳定状态与脱敏关联号；网络抖动只允许有界重试，未证明提交未被受理时不得重复发起计费生成；上游已成功而本地失败时必须按 provider job id 幂等恢复产物，过期或确实不可恢复时给出明确状态与人工处理入口。渠道错误包装必须保留可行动分类、HTTP/任务阶段和脱敏 reference，不得再把鉴权、额度、限流、上游失败、响应契约漂移、下载失败全部压成 `ChannelManagedProviderError reason=unknown`，同时不得向 C 端暴露中转站、子 Key、Base URL 或内部 provider。补真实响应合同 fixture、单元/集成测试、故障注入、重复提交与恢复测试，以及 Growth→CreatorOS→中转端的并发/背压、限流、超时和熔断验收；明确 Growth 控制面与直连数据面的并发责任，保证单用户并发不会重复计费、吞掉成功产物或拖垮客户端。以智溯AI渠道包完成文本、ASR、生图、生视频连续与并发真机回归，记录成功率、P95、错误分类和账单一致性；不得用测试连接或上游成功记录冒充 CreatorOS 端到端成功。本任务不授权部署或发布。|",
  "source_sha256": "11508c7128c55b5af3d6d27b10750b36c902e7f53c162cdbe91bb97a6ae9354a",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-6bda1d6d"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-734",
  "title": "根治 Windows 扫码绑定在启动前误依赖缺失 Playwright CLI",
  "narrative": "`v0.2.1-beta.3` Windows 真机点击“扫码绑定新抖音号”时，在任何浏览器启动前报“Playwright CLI 未找到”；根因边界与 T-720 的浏览器页面崩溃不同。当前抖音 `openContext` 无条件先跑旧的 `ensureChromiumInstalled`，使已经承诺的本机 Chrome 优先和随包 Chromium 回落都被 CLI 下载前置条件截断；打包器又允许静默跳过 Chromium，并未验证 Windows 最终 runtime 中浏览器可执行文件或离线回落能力。修复后账号绑定必须先按统一浏览器选择器尝试本机 Chrome，失败才使用壳层注入且经文件验证的随包 Chromium；正式 Windows runtime 不得把 Playwright CLI、全局 Node/npm 或联网下载当成启动前提。正式构建缺随包 Chromium 必须 fail-closed，只有显式开发/诊断构建可允许下载兜底；CLI 定位须支持实际 `runtime-images/<id>/sidecar` 与分层布局。用户可见错误须说明“本机 Chrome/内置浏览器均不可用”、影响与重装/导出日志动作，原始路径只留诊断日志。补单元测试、打包合同测试和 Windows 最终 runtime 布局检查，覆盖本机 Chrome 成功、Chrome 失败→随包 Chromium 成功、两者均缺失、路径含空格/非 ASCII、离线环境和旧 runtime 兼容；本任务不发布、不删除登录态。",
  "documents": "[Windows 生产闭环](docs/superpowers/specs/2026-08-03-windows-production-closure-default-release.md) · 既有 T-284 随包 Chromium、T-307 浏览器回落与 T-469 CLI 定位契约",
  "source_line": "|T-734|根治 Windows 扫码绑定在启动前误依赖缺失 Playwright CLI|🔨|—|待验|[Windows 生产闭环](docs/superpowers/specs/2026-08-03-windows-production-closure-default-release.md) · 既有 T-284 随包 Chromium、T-307 浏览器回落与 T-469 CLI 定位契约|`v0.2.1-beta.3` Windows 真机点击“扫码绑定新抖音号”时，在任何浏览器启动前报“Playwright CLI 未找到”；根因边界与 T-720 的浏览器页面崩溃不同。当前抖音 `openContext` 无条件先跑旧的 `ensureChromiumInstalled`，使已经承诺的本机 Chrome 优先和随包 Chromium 回落都被 CLI 下载前置条件截断；打包器又允许静默跳过 Chromium，并未验证 Windows 最终 runtime 中浏览器可执行文件或离线回落能力。修复后账号绑定必须先按统一浏览器选择器尝试本机 Chrome，失败才使用壳层注入且经文件验证的随包 Chromium；正式 Windows runtime 不得把 Playwright CLI、全局 Node/npm 或联网下载当成启动前提。正式构建缺随包 Chromium 必须 fail-closed，只有显式开发/诊断构建可允许下载兜底；CLI 定位须支持实际 `runtime-images/<id>/sidecar` 与分层布局。用户可见错误须说明“本机 Chrome/内置浏览器均不可用”、影响与重装/导出日志动作，原始路径只留诊断日志。补单元测试、打包合同测试和 Windows 最终 runtime 布局检查，覆盖本机 Chrome 成功、Chrome 失败→随包 Chromium 成功、两者均缺失、路径含空格/非 ASCII、离线环境和旧 runtime 兼容；本任务不发布、不删除登录态。|",
  "source_sha256": "44245595d539df48bf67eba1e70e9b304c837ef4ba7fd33c01331e7ff4fcab90",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-25eb2410"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-733",
  "title": "本地模型可用时收起渠道配置误报警并纠正票据不适用状态",
  "narrative": "当已保存的本地文本模型可正常使用时，设置页不再显示“渠道配置安全校验未通过”等与当前使用路径无关的红色提示；Activity 明确返回 `CONFIG_TICKET_REQUEST_INVALID` 时按当前激活不适用渠道托管配置处理，不得写成 `authorization_changed` 或 `security_error`，真正的签名、安全或授权变化失败仍保持可见并失败关闭。",
  "documents": "[渠道模型逐能力契约](docs/superpowers/specs/2026-08-02-capability-scoped-channel-model-authority.md#12-t-733-票据不适用与本地模型提示收口2026-08-09)",
  "source_line": "|T-733|本地模型可用时收起渠道配置误报警并纠正票据不适用状态|🔨|—|待验|[渠道模型逐能力契约](docs/superpowers/specs/2026-08-02-capability-scoped-channel-model-authority.md#12-t-733-票据不适用与本地模型提示收口2026-08-09)|当已保存的本地文本模型可正常使用时，设置页不再显示“渠道配置安全校验未通过”等与当前使用路径无关的红色提示；Activity 明确返回 `CONFIG_TICKET_REQUEST_INVALID` 时按当前激活不适用渠道托管配置处理，不得写成 `authorization_changed` 或 `security_error`，真正的签名、安全或授权变化失败仍保持可见并失败关闭。|",
  "source_sha256": "7c7aa254dc1956ab1426c2f90eac79e9d625b51109b87d9828e6c11730a91beb",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-f16a3a9f"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-732",
  "title": "根治局部改稿锚点失效后阻断全部 Copilot 对话",
  "narrative": "AI 整稿写入必须持久化稳定段落 ID；存量无 ID 版本由稿面、执行重绑和补丁采纳使用同一兼容锚点并在新版本自愈。“AI 改写本段”只在用户明确发起及围绕该段连续修订时携带段落锚点；当前版本已无法重绑目标段时，必须结束这次局部改稿、清除失效锚点并恢复项目普通对话，不能让后续任意消息继续被 `SCRIPT_SELECTION_STALE` 拦截，也不能提供必然重复失败的“重试”。覆盖整稿换版→点击第 2 段成功→采纳只改该段，以及失败→普通消息成功→重新点段落成功的连续回归。",
  "documents": "[T-716 局部改稿规格](docs/superpowers/specs/2026-08-06-copilot-script-editing-and-attachments.md) · [验收审计](docs/research/2026-08-13-t716-t732-acceptance-audit.md)",
  "source_line": "|T-732|根治局部改稿锚点失效后阻断全部 Copilot 对话|🔨|—|待验|[T-716 局部改稿规格](docs/superpowers/specs/2026-08-06-copilot-script-editing-and-attachments.md) · [验收审计](docs/research/2026-08-13-t716-t732-acceptance-audit.md)|AI 整稿写入必须持久化稳定段落 ID；存量无 ID 版本由稿面、执行重绑和补丁采纳使用同一兼容锚点并在新版本自愈。“AI 改写本段”只在用户明确发起及围绕该段连续修订时携带段落锚点；当前版本已无法重绑目标段时，必须结束这次局部改稿、清除失效锚点并恢复项目普通对话，不能让后续任意消息继续被 `SCRIPT_SELECTION_STALE` 拦截，也不能提供必然重复失败的“重试”。覆盖整稿换版→点击第 2 段成功→采纳只改该段，以及失败→普通消息成功→重新点段落成功的连续回归。|",
  "source_sha256": "41fad197924b93271c7b86070127049670e893e7916c41620c5367077e255b0e",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-ac306275"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-730",
  "title": "恢复可选“立论点”UI并增加适用场景引导，不重新变成写稿门槛",
  "narrative": "[D]",
  "documents": "[SPEC](BACKLOG-details.md#t-730)  [SPEC](docs/superpowers/specs/2026-08-09-optional-thesis-guidance.md)",
  "source_line": "|T-730|恢复可选“立论点”UI并增加适用场景引导，不重新变成写稿门槛|🔨|PASS[REV:aeda30778cf2]|待验|[SPEC](BACKLOG-details.md#t-730)  [SPEC](docs/superpowers/specs/2026-08-09-optional-thesis-guidance.md)|[D]|",
  "source_sha256": "d56182a3416d964246cde8c3be2237a5129a5111c7439105f2a02f25c034dabf",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-7114035c"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-731",
  "title": "支持按电商等创作场景生成并自定义创作框架",
  "narrative": "在 T-730 可选论点 UI 稳定后，再把固定四栏升级为场景化创作框架：由 AI 根据本次目标提出结构，支持电商、知识讲解、观点评论、测评等起点，并允许用户新增、删除、改名和排序框架项；不得用固定业务词表替代 AI 语义判断。",
  "documents": "T-730 后续",
  "source_line": "|T-731|支持按电商等创作场景生成并自定义创作框架|📋 待办|—|待验|T-730 后续|在 T-730 可选论点 UI 稳定后，再把固定四栏升级为场景化创作框架：由 AI 根据本次目标提出结构，支持电商、知识讲解、观点评论、测评等起点，并允许用户新增、删除、改名和排序框架项；不得用固定业务词表替代 AI 语义判断。|",
  "source_sha256": "60915cc14fa80611ed67ae258ab6ab74f43c580d1bfc2a3d26aabc00dba9dd31",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-1c97ecf4"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-729",
  "title": "根治渠道专属包仍跳官方入口并拆分官网、下载、人工反馈与反馈 API",
  "narrative": "以智溯AI `v0.3.0` 真机为失败事实：渠道模型 bundle `v5` 与受管凭据已经 `configured`，但软件更新仍固定打开 `creatoros.aitongban.cloud`；问题反馈在 `channelRuntime` 缺值或异常时回退 CreatorOS 官方飞书；自动反馈提交又把面向人的 `bugFeedbackUrl` origin 当成 Growth API authority。一次性收口 CreatorOS 多渠道外部入口：在受签名 `PackageManifest` 中明确区分包官网、下载页、人工反馈页与更新 manifest locator，并与激活后的购买、续费、支持、问题反馈运行时投影以及固定的 Growth feedback API authority 分离；用户可见链接只读取当前包或当前渠道的受信值，渠道包不得跨跳 CreatorOS 官方或其他渠道，远端 manifest 不得形成开放重定向，未激活、离线或快照延迟时必须按字段契约诚实降级，不能偷回官方默认值。修复更新卡、检查更新、购买、续费、支持、下载、问题反馈打开及自动提交完整链路，清除官方 URL 常量和飞书 fallback 对渠道包的渗漏；如涉及 manifest schema、Activity runtime 或反馈服务契约，开工前同步修订并审核上游 SPEC/合同。补源码扫描、合同测试、单元测试和 macOS 安装包真机点击回归，至少覆盖 CreatorOS 官方包与智溯AI包、激活与未激活、在线与离线、运行时新鲜与陈旧、反馈 API 成功与拒绝，并继续保证只接受 allowlist/签名 URL、日志不泄露激活码或密钥。完成后重打本地智溯AI安装包供用户验证；本任务不授权部署、发布或改动线上 Growth。",
  "documents": "[渠道包工厂 SPEC](docs/superpowers/specs/2026-08-04-channel-package-factory-and-incremental-update.md) · [T-718 真机构建证据](orchestrator/GATE-T718-BUILD.md) · [白标边界调研](docs/research/2026-08-04-white-label-runtime-vs-package-boundary.md)",
  "source_line": "|T-729|根治渠道专属包仍跳官方入口并拆分官网、下载、人工反馈与反馈 API|📋 待办|—|待验|[渠道包工厂 SPEC](docs/superpowers/specs/2026-08-04-channel-package-factory-and-incremental-update.md) · [T-718 真机构建证据](orchestrator/GATE-T718-BUILD.md) · [白标边界调研](docs/research/2026-08-04-white-label-runtime-vs-package-boundary.md)|以智溯AI `v0.3.0` 真机为失败事实：渠道模型 bundle `v5` 与受管凭据已经 `configured`，但软件更新仍固定打开 `creatoros.aitongban.cloud`；问题反馈在 `channelRuntime` 缺值或异常时回退 CreatorOS 官方飞书；自动反馈提交又把面向人的 `bugFeedbackUrl` origin 当成 Growth API authority。一次性收口 CreatorOS 多渠道外部入口：在受签名 `PackageManifest` 中明确区分包官网、下载页、人工反馈页与更新 manifest locator，并与激活后的购买、续费、支持、问题反馈运行时投影以及固定的 Growth feedback API authority 分离；用户可见链接只读取当前包或当前渠道的受信值，渠道包不得跨跳 CreatorOS 官方或其他渠道，远端 manifest 不得形成开放重定向，未激活、离线或快照延迟时必须按字段契约诚实降级，不能偷回官方默认值。修复更新卡、检查更新、购买、续费、支持、下载、问题反馈打开及自动提交完整链路，清除官方 URL 常量和飞书 fallback 对渠道包的渗漏；如涉及 manifest schema、Activity runtime 或反馈服务契约，开工前同步修订并审核上游 SPEC/合同。补源码扫描、合同测试、单元测试和 macOS 安装包真机点击回归，至少覆盖 CreatorOS 官方包与智溯AI包、激活与未激活、在线与离线、运行时新鲜与陈旧、反馈 API 成功与拒绝，并继续保证只接受 allowlist/签名 URL、日志不泄露激活码或密钥。完成后重打本地智溯AI安装包供用户验证；本任务不授权部署、发布或改动线上 Growth。|",
  "source_sha256": "9b502a4d14dbcef0887675383204d4782007ef6ced227406c6b76a0439bb08f9",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-5ab0716e"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-726",
  "title": "退役项目“论点骨架”并让写稿直接消费 Brief 与素材",
  "narrative": "[D]",
  "documents": "[SPEC](BACKLOG-details.md#t-726)  [SPEC](docs/superpowers/specs/2026-08-08-thesis-skeleton-retirement.md)",
  "source_line": "|T-726|退役项目“论点骨架”并让写稿直接消费 Brief 与素材|🔨|PASS[REV:6c2611e23cf5]|待验|[SPEC](BACKLOG-details.md#t-726)  [SPEC](docs/superpowers/specs/2026-08-08-thesis-skeleton-retirement.md)|[D]|",
  "source_sha256": "86094005443c70f507e844bb5446b9588d37a41980263c17f2c9a1045268f239",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-da372731"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-721",
  "title": "根治素材包导出回流造成递归嵌套并恢复大素材库完整可见性",
  "narrative": "导出素材包必须作为一次性下载产物写入对象存储，不得创建普通素材记录；既有素材包 ZIP 保留但以后导出时自动隔离，防止 ZIP 自嵌套。素材中心和项目素材查询必须完整分页加载，不能因固定 200/100 条上限让旧素材消失。",
  "documents": "[SPEC](docs/superpowers/specs/2026-08-08-material-export-isolation-and-asset-pagination.md)",
  "source_line": "|T-721|根治素材包导出回流造成递归嵌套并恢复大素材库完整可见性|🔨|—|待验|[SPEC](docs/superpowers/specs/2026-08-08-material-export-isolation-and-asset-pagination.md)|导出素材包必须作为一次性下载产物写入对象存储，不得创建普通素材记录；既有素材包 ZIP 保留但以后导出时自动隔离，防止 ZIP 自嵌套。素材中心和项目素材查询必须完整分页加载，不能因固定 200/100 条上限让旧素材消失。|",
  "source_sha256": "5430f90218499012a40502930cd1d65932859f24c93a7f7fd888c8a4d8c402f6",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-a80ddfed"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-720",
  "title": "根治特定 Windows 设备抖音内置浏览器页面崩溃导致内容雷达主页验证失败",
  "narrative": "该问题目前只在飞书记录 `rec27WFKVrkvAY` 对应的一台 Windows 设备出现，不得扩大表述为 Windows 普遍故障。用户链接本身是完整 `douyin.com/user/...`；该机 `v0.2.1-beta.3` 日志显示从作品同步、单条导入到对标主页预览连续多日全部失败于 `page.goto: Page crashed`，更符合随包 Chromium 与该机运行环境、显卡/沙箱、安全软件、资源或运行时完整性的兼容异常。当前 main 仍只在同一崩溃 page 上退避重试，并把未知错误误译成“请确认登录/完整链接”，因此缺少单机异常恢复与诊断。须统一识别 page/context/browser crash，先新建 page、仍失败再关闭失效 context 并基于同一账号 profile 做一次有界重建与浏览器回落；作品采集和主页预览复用同一恢复能力。仍失败时返回“本机内置浏览器异常”的可行动提示，记录脱敏的浏览器版本、可执行路径、OS/arch、启动参数、page/context crash 与资源线索，禁止误报链接或登录。补 Windows 打包后真导航回归和兼容性样本，且不得清空 Cookie 或伪造验证成功。",
  "documents": "[飞书反馈记录](https://my.feishu.cn/base/S1BRb4i6kaD0bnsViJSco0jxnRg?table=tblIPu0er91yGTwL&view=vewb4HsOUz) · 既有 Chromium guard 与抖音采集契约",
  "source_line": "|T-720|根治特定 Windows 设备抖音内置浏览器页面崩溃导致内容雷达主页验证失败|📋 待办|—|待验|[飞书反馈记录](https://my.feishu.cn/base/S1BRb4i6kaD0bnsViJSco0jxnRg?table=tblIPu0er91yGTwL&view=vewb4HsOUz) · 既有 Chromium guard 与抖音采集契约|该问题目前只在飞书记录 `rec27WFKVrkvAY` 对应的一台 Windows 设备出现，不得扩大表述为 Windows 普遍故障。用户链接本身是完整 `douyin.com/user/...`；该机 `v0.2.1-beta.3` 日志显示从作品同步、单条导入到对标主页预览连续多日全部失败于 `page.goto: Page crashed`，更符合随包 Chromium 与该机运行环境、显卡/沙箱、安全软件、资源或运行时完整性的兼容异常。当前 main 仍只在同一崩溃 page 上退避重试，并把未知错误误译成“请确认登录/完整链接”，因此缺少单机异常恢复与诊断。须统一识别 page/context/browser crash，先新建 page、仍失败再关闭失效 context 并基于同一账号 profile 做一次有界重建与浏览器回落；作品采集和主页预览复用同一恢复能力。仍失败时返回“本机内置浏览器异常”的可行动提示，记录脱敏的浏览器版本、可执行路径、OS/arch、启动参数、page/context crash 与资源线索，禁止误报链接或登录。补 Windows 打包后真导航回归和兼容性样本，且不得清空 Cookie 或伪造验证成功。|",
  "source_sha256": "6437f1dda85a87d34ed3bbb7dab4833951e5faef8dd5d9ca70fdaffabbed507e",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-175b60d1"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-719",
  "title": "根治桌面端启动后二次白屏闪烁与首页排期提醒不可用",
  "narrative": "基于用户 7.36 秒录屏排查“页面已完整渲染后又被整页白屏覆盖/重复刷新”的启动时序，统一检查桌面壳、sidecar 就绪、导航、onboarding 与前端 hydration，禁止用循环刷新掩盖启动失败；首页排期提醒必须读取当前账号真实排期，未绑定账号或无排期时显示真实 0/空态，只有真实服务异常才显示可重试错误，并留下完整脱敏诊断日志。补跨层回归后交付，不把 macOS 录屏或 fixture 冒充 Windows 真机回执。",
  "documents": "[Windows 生产闭环](docs/superpowers/specs/2026-08-03-windows-production-closure-default-release.md) · [T-599 排期提醒契约](docs/superpowers/specs/2026-07-29-project-publishing-schedule.contract.md)",
  "source_line": "|T-719|根治桌面端启动后二次白屏闪烁与首页排期提醒不可用|🔨|—|待验|[Windows 生产闭环](docs/superpowers/specs/2026-08-03-windows-production-closure-default-release.md) · [T-599 排期提醒契约](docs/superpowers/specs/2026-07-29-project-publishing-schedule.contract.md)|基于用户 7.36 秒录屏排查“页面已完整渲染后又被整页白屏覆盖/重复刷新”的启动时序，统一检查桌面壳、sidecar 就绪、导航、onboarding 与前端 hydration，禁止用循环刷新掩盖启动失败；首页排期提醒必须读取当前账号真实排期，未绑定账号或无排期时显示真实 0/空态，只有真实服务异常才显示可重试错误，并留下完整脱敏诊断日志。补跨层回归后交付，不把 macOS 录屏或 fixture 冒充 Windows 真机回执。|",
  "source_sha256": "f377e26b44df4cf376cc8268bba8ba92016e8be165deb56b8f81333d908aa713",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-aaa241bf"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-718",
  "title": "补齐智溯AI包内品牌并交付完整 Growth 配置后重打本地包",
  "narrative": "修复 T-717 仅替换系统应用名与图标、应用内部窗口标题和侧边栏仍显示 CreatorOS 的白标缺口：包级身份必须在激活前提供智溯AI品牌，激活后由受信任 Growth 配置继续作为运行时品牌与业务链接权威；侧边栏品牌名和品牌图标、页面标题等用户可见壳层不得残留 CreatorOS。把包含 channelService 与 productConfig 的完整 Growth JSON 固化进智溯科技交付目录，完成测试、重构建、唯一安装、真实启动和界面截图验收；同步升级项目级 `packaging-creatoros-channel` Skill，把窗口标题、侧边栏名称/图标、完整 Growth 配置与真机截图列为后续白标包强制 Gate，不上传、不发布、不修改线上 Growth。",
  "documents": "[渠道包工厂 SPEC](docs/superpowers/specs/2026-08-04-channel-package-factory-and-incremental-update.md) · [智溯AI文件矩阵](docs/research/2026-08-04-zhisu-ai-package-file-change-matrix.md) · [本机构建证据](orchestrator/GATE-T718-BUILD.md)",
  "source_line": "|T-718|补齐智溯AI包内品牌并交付完整 Growth 配置后重打本地包|🔨|—|待验|[渠道包工厂 SPEC](docs/superpowers/specs/2026-08-04-channel-package-factory-and-incremental-update.md) · [智溯AI文件矩阵](docs/research/2026-08-04-zhisu-ai-package-file-change-matrix.md) · [本机构建证据](orchestrator/GATE-T718-BUILD.md)|修复 T-717 仅替换系统应用名与图标、应用内部窗口标题和侧边栏仍显示 CreatorOS 的白标缺口：包级身份必须在激活前提供智溯AI品牌，激活后由受信任 Growth 配置继续作为运行时品牌与业务链接权威；侧边栏品牌名和品牌图标、页面标题等用户可见壳层不得残留 CreatorOS。把包含 channelService 与 productConfig 的完整 Growth JSON 固化进智溯科技交付目录，完成测试、重构建、唯一安装、真实启动和界面截图验收；同步升级项目级 `packaging-creatoros-channel` Skill，把窗口标题、侧边栏名称/图标、完整 Growth 配置与真机截图列为后续白标包强制 Gate，不上传、不发布、不修改线上 Growth。|",
  "source_sha256": "c9fe491c7ff13f6b3618a9a7aa039190fdc14d981fdd12992139215ae586c63f",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-7ae2f693"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-716",
  "title": "完善 Copilot 局部改稿、脚本版本回退、附件上下文与素材中心稳定排序",
  "narrative": "素材中心统一按真实 `createdAt DESC` 稳定排序，最新素材始终在前；稿面段落支持把明确选区/段落锚点交给 Copilot 定点改写，AI 只产局部补丁候选，用户确认后合并为新的完整脚本版本，不再默认整稿重生成；口播脚本提供版本下拉、预览与恢复，恢复只切换到既有不可变版本、不制造重复版本；所有工具在执行前重读服务端当下真值，不使用对话或客户端旧快照；分镜“点名素材”展示真实文件名/标题而非裸 `assetId`；Copilot 输入框支持拖拽或选择文件与图片，复用项目素材上传和安全读取链形成显式上下文，支持视觉的模型可读图片，不支持时给出清晰能力提示且不得假装已识别。全部闭环后按 T-713 统一生成 CreatorOS 0.3.0 macOS 本地测试包。",
  "documents": "[实现规格](docs/superpowers/specs/2026-08-06-copilot-script-editing-and-attachments.md) · [验收审计](docs/research/2026-08-13-t716-t732-acceptance-audit.md) · [T-691 Copilot 生命周期](docs/superpowers/specs/2026-08-04-copilot-project-lifecycle-tool-closure.md)",
  "source_line": "|T-716|完善 Copilot 局部改稿、脚本版本回退、附件上下文与素材中心稳定排序|🔨|—|待验|[实现规格](docs/superpowers/specs/2026-08-06-copilot-script-editing-and-attachments.md) · [验收审计](docs/research/2026-08-13-t716-t732-acceptance-audit.md) · [T-691 Copilot 生命周期](docs/superpowers/specs/2026-08-04-copilot-project-lifecycle-tool-closure.md)|素材中心统一按真实 `createdAt DESC` 稳定排序，最新素材始终在前；稿面段落支持把明确选区/段落锚点交给 Copilot 定点改写，AI 只产局部补丁候选，用户确认后合并为新的完整脚本版本，不再默认整稿重生成；口播脚本提供版本下拉、预览与恢复，恢复只切换到既有不可变版本、不制造重复版本；所有工具在执行前重读服务端当下真值，不使用对话或客户端旧快照；分镜“点名素材”展示真实文件名/标题而非裸 `assetId`；Copilot 输入框支持拖拽或选择文件与图片，复用项目素材上传和安全读取链形成显式上下文，支持视觉的模型可读图片，不支持时给出清晰能力提示且不得假装已识别。全部闭环后按 T-713 统一生成 CreatorOS 0.3.0 macOS 本地测试包。|",
  "source_sha256": "0e2d19716bb789db73acb7a5891693edd1cef9a4f14d51f362bd5465def51f43",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-c494e7a8"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-715",
  "title": "在 CreatorOS 增加 Growth AI 额度账户连接、查看与充值入口",
  "narrative": "复用当前激活权益申请全新 config access ticket，调用 Growth 创建一次性额度会话；CreatorOS 只提供“查看 AI 额度与消耗”入口，首次固定打开 Growth 用户端 `/credits/connect#<one-time-code>` 完成登录/注册与绑定，已绑定时固定打开用户端 `/credits/launch#<one-time-code>`，不得出现端选择，也不得因 partner/channel/admin 角色转去管理端或渠道端。票据、一次性码、激活码、充值码和受管子 Key 不得进入 URL query、日志或普通缓存。受管 AI 额度耗尽时，Copilot 与异步任务必须显示“AI 额度不足”并提供同一安全用户端充值入口，不得冒充模型故障或暴露模型、服务商和中转实现；用户自配模型的余额错误仍按本地模型配置处理。CreatorOS 只负责安全入口和本地激活状态，额度汇总、刷新、充值和账本归 Growth；本任务不修改 Activity。2026-08-06 真机已到达 Growth 用户端且 fragment 被移除，但生产兑换失败（脱敏参考号见 Gate），因此保持待验，不能把打开页面冒充额度闭环。",
  "documents": "[真实联调 Gate](orchestrator/GATE-T715-BUILD.md) · [Growth T-137 充值契约](../Thirdspace-growth/docs/contracts/T-137-ai-credit-recharge.md) · [T-679 受管模型契约](docs/superpowers/specs/2026-08-02-capability-scoped-channel-model-authority.md)",
  "source_line": "|T-715|在 CreatorOS 增加 Growth AI 额度账户连接、查看与充值入口|🔨|—|待验|[真实联调 Gate](orchestrator/GATE-T715-BUILD.md) · [Growth T-137 充值契约](../Thirdspace-growth/docs/contracts/T-137-ai-credit-recharge.md) · [T-679 受管模型契约](docs/superpowers/specs/2026-08-02-capability-scoped-channel-model-authority.md)|复用当前激活权益申请全新 config access ticket，调用 Growth 创建一次性额度会话；CreatorOS 只提供“查看 AI 额度与消耗”入口，首次固定打开 Growth 用户端 `/credits/connect#<one-time-code>` 完成登录/注册与绑定，已绑定时固定打开用户端 `/credits/launch#<one-time-code>`，不得出现端选择，也不得因 partner/channel/admin 角色转去管理端或渠道端。票据、一次性码、激活码、充值码和受管子 Key 不得进入 URL query、日志或普通缓存。受管 AI 额度耗尽时，Copilot 与异步任务必须显示“AI 额度不足”并提供同一安全用户端充值入口，不得冒充模型故障或暴露模型、服务商和中转实现；用户自配模型的余额错误仍按本地模型配置处理。CreatorOS 只负责安全入口和本地激活状态，额度汇总、刷新、充值和账本归 Growth；本任务不修改 Activity。2026-08-06 真机已到达 Growth 用户端且 fragment 被移除，但生产兑换失败（脱敏参考号见 Gate），因此保持待验，不能把打开页面冒充额度闭环。|",
  "source_sha256": "ede28745a84ec5765114c1512b899c3b3799ad44a1cdd6f50c071a5ee2024665",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-afd31fc0"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-714",
  "title": "接入工程教训闭环并迁移旧账本，确保真实踩坑可被后续任务自动复用",
  "narrative": "升级并接入 `product-to-code-orchestrator` 最新教训闭环：`eval_red` 必须幂等进入 observation 收件箱，完整事件流不得因过滤后错位归档而丢失；把旧 `active/promoted` 账本显式审计和迁移，只有同 ID 可执行守卫或通过注入门的 `candidate/rule` 才能进入阶段上下文；为 BUILD/SHIP 提供可重复的 `lessonctl audit/context` 验证，持续完善通用 Skill 与项目守卫。该任务只管工程流程，不替代产品运行时 Skill 迭代任务 T-087。",
  "documents": "[`product-to-code-orchestrator`](orchestrator/process/.skill-version) · [教训账本](orchestrator/LESSON_LEDGER.md) · [注入门](orchestrator/gates/lessons-injection-gate.md)",
  "source_line": "|T-714|接入工程教训闭环并迁移旧账本，确保真实踩坑可被后续任务自动复用|📋 待办|—|待验|[`product-to-code-orchestrator`](orchestrator/process/.skill-version) · [教训账本](orchestrator/LESSON_LEDGER.md) · [注入门](orchestrator/gates/lessons-injection-gate.md)|升级并接入 `product-to-code-orchestrator` 最新教训闭环：`eval_red` 必须幂等进入 observation 收件箱，完整事件流不得因过滤后错位归档而丢失；把旧 `active/promoted` 账本显式审计和迁移，只有同 ID 可执行守卫或通过注入门的 `candidate/rule` 才能进入阶段上下文；为 BUILD/SHIP 提供可重复的 `lessonctl audit/context` 验证，持续完善通用 Skill 与项目守卫。该任务只管工程流程，不替代产品运行时 Skill 迭代任务 T-087。|",
  "source_sha256": "1b2f7bcd19cc9782ad495fdbf79f14e61d3f046a4a5bf92d49b54cc93e6ad6ac",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-386f260d"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-713",
  "title": "构建包含通用智能体语义边界与当前制作修复的 macOS 0.3.0 本地测试包",
  "narrative": "基于当前 main 脏工作区完整构建 CreatorOS 0.3.0 macOS 本地测试包，复用统一 Node 25 + `release-fast` 流水线，包含 `material.match` 语义匹配、成片预览与项目级语义边界门卫；不清理或覆盖并行改动，不走 Developer ID、公证、上传或远端发布。构建成功后必须自动替换唯一 `/Applications/CreatorOS.app`、启动应用并确认真实进程，禁止只交付包路径；最终回报 DMG 绝对路径、大小、SHA-256、签名状态与真实启动自检证据。",
  "documents": "[发布流程](docs/RELEASING.md) · [T-712 制作体验](docs/superpowers/specs/2026-08-05-video-production-editing-loop.md)",
  "source_line": "|T-713|构建包含通用智能体语义边界与当前制作修复的 macOS 0.3.0 本地测试包|🔨|—|待验|[发布流程](docs/RELEASING.md) · [T-712 制作体验](docs/superpowers/specs/2026-08-05-video-production-editing-loop.md)|基于当前 main 脏工作区完整构建 CreatorOS 0.3.0 macOS 本地测试包，复用统一 Node 25 + `release-fast` 流水线，包含 `material.match` 语义匹配、成片预览与项目级语义边界门卫；不清理或覆盖并行改动，不走 Developer ID、公证、上传或远端发布。构建成功后必须自动替换唯一 `/Applications/CreatorOS.app`、启动应用并确认真实进程，禁止只交付包路径；最终回报 DMG 绝对路径、大小、SHA-256、签名状态与真实启动自检证据。|",
  "source_sha256": "842a528c491cdcc2c108930850eef61266bb2ea66ccf0b2b049d562a304d8652",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-d65c2773"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-712",
  "title": "优先采用用户上传素材进入 B-roll 时间线、恢复成片预览并收回渠道同步常驻提示",
  "narrative": "项目上传/挂载的视频和图片进入候选后，`video.broll` 只产画面需求，统一由现有 `material.match` Skill 结合口播、场景、画面需求、原始文件名、尺寸/时长与真实素材清单做 AI 语义匹配；代码只校验真实 assetId、场景和时间边界，禁止写死词表或用字符串相似度替 AI 选素材。首轮进入时间线的素材即视为已绑定；人工只改一处时也必须把全部既有绑定作为硬约束继承，并在当前方案上重算插点和展示时长，禁止新一轮洗掉旧绑定。AI 必须显式判断素材为录屏、静态图片、普通实拍或封面，并同时决定主视觉、镜头运动与有效展示时长；只有需要阅读或观察操作的录屏才能真正 `full_frame`，全屏录屏期间人物保留为左下角画中画；静态图片和普通实拍保持原始比例进入独立安全舞台，永不强行全屏，封面永不进入时间线。任意时刻只允许一个非 overlay 主素材，下一主素材进场必须结束上一主素材并清空旧信息卡，禁止横图、竖图和标题多层叠放。竖图/竖视频保持原始比例和竖版舞台，主视觉不得遮脸。本轮不更换 CreatorOS 既有视觉风格，只修复横竖屏素材呈现与时间线回归。竖版无主视觉时人物铺满手机画布；普通信息卡不得把人物降成角落小窗；横图/横录屏在保留完整原图的同时用同源氛围层或上下分区填充竖屏，禁止中央窄条加巨幅黑边；新生成素材必须按本次交付画幅构图。场景名、`SCENE/分镜序号` 与整段口播摘要只属于编辑层，不得烧进成片；上屏文字只保留经 AI 编导筛选的短标题、数字、对比、清单和金句，并用渐进式动画表达，禁止做成干巴巴的 PPT 复述。成片抽帧先跑确定性遮挡/可读性门；配置视觉模型时再做非阻断视觉审核。分场、信息卡、真人主画面、用户素材/B-roll 与字幕必须先各自通过结构契约审核，再由唯一 `video.director` 读入完整候选时间线统筹审片。总导演内部只有“修到可渲染”：发现视觉空档、素材时长/语义承接或字幕时间问题时，必须保留已绑定素材，在原方案内自动收口时长、做素材接力并用口播原文信息卡补位，再执行有界复审；不得把“缺素材/阻断/重新配分镜”退给用户。审片模型不可用时由确定性修片层补齐并交用户最终过目，禁止无限重试或编造事实。以本机真实成片和完整项目素材包建立可重复回归 loop，必须由 CreatorOS 当前配置模型真实跑素材语义和分镜，每轮落模型决策、render props、确定性 Gate、成片和抽帧证据，直到静态图不全屏、全屏录屏保留左下画中画、封面不入时间线、主视觉无重叠。已生成的 `final.mp4` 必须通过受控临时预览 URL 在桌面 WebView 可播放并支持 Range。右下角渠道同步提示只在设置页展示。",
  "documents": "[T-687 口播联想画面 Skill](docs/superpowers/specs/2026-08-04-voiceover-associative-visual-skill.md) · [T-703 视频制作闭环](docs/superpowers/specs/2026-08-05-video-production-editing-loop.md)",
  "source_line": "|T-712|优先采用用户上传素材进入 B-roll 时间线、恢复成片预览并收回渠道同步常驻提示|🔨|—|待验|[T-687 口播联想画面 Skill](docs/superpowers/specs/2026-08-04-voiceover-associative-visual-skill.md) · [T-703 视频制作闭环](docs/superpowers/specs/2026-08-05-video-production-editing-loop.md)|项目上传/挂载的视频和图片进入候选后，`video.broll` 只产画面需求，统一由现有 `material.match` Skill 结合口播、场景、画面需求、原始文件名、尺寸/时长与真实素材清单做 AI 语义匹配；代码只校验真实 assetId、场景和时间边界，禁止写死词表或用字符串相似度替 AI 选素材。首轮进入时间线的素材即视为已绑定；人工只改一处时也必须把全部既有绑定作为硬约束继承，并在当前方案上重算插点和展示时长，禁止新一轮洗掉旧绑定。AI 必须显式判断素材为录屏、静态图片、普通实拍或封面，并同时决定主视觉、镜头运动与有效展示时长；只有需要阅读或观察操作的录屏才能真正 `full_frame`，全屏录屏期间人物保留为左下角画中画；静态图片和普通实拍保持原始比例进入独立安全舞台，永不强行全屏，封面永不进入时间线。任意时刻只允许一个非 overlay 主素材，下一主素材进场必须结束上一主素材并清空旧信息卡，禁止横图、竖图和标题多层叠放。竖图/竖视频保持原始比例和竖版舞台，主视觉不得遮脸。本轮不更换 CreatorOS 既有视觉风格，只修复横竖屏素材呈现与时间线回归。竖版无主视觉时人物铺满手机画布；普通信息卡不得把人物降成角落小窗；横图/横录屏在保留完整原图的同时用同源氛围层或上下分区填充竖屏，禁止中央窄条加巨幅黑边；新生成素材必须按本次交付画幅构图。场景名、`SCENE/分镜序号` 与整段口播摘要只属于编辑层，不得烧进成片；上屏文字只保留经 AI 编导筛选的短标题、数字、对比、清单和金句，并用渐进式动画表达，禁止做成干巴巴的 PPT 复述。成片抽帧先跑确定性遮挡/可读性门；配置视觉模型时再做非阻断视觉审核。分场、信息卡、真人主画面、用户素材/B-roll 与字幕必须先各自通过结构契约审核，再由唯一 `video.director` 读入完整候选时间线统筹审片。总导演内部只有“修到可渲染”：发现视觉空档、素材时长/语义承接或字幕时间问题时，必须保留已绑定素材，在原方案内自动收口时长、做素材接力并用口播原文信息卡补位，再执行有界复审；不得把“缺素材/阻断/重新配分镜”退给用户。审片模型不可用时由确定性修片层补齐并交用户最终过目，禁止无限重试或编造事实。以本机真实成片和完整项目素材包建立可重复回归 loop，必须由 CreatorOS 当前配置模型真实跑素材语义和分镜，每轮落模型决策、render props、确定性 Gate、成片和抽帧证据，直到静态图不全屏、全屏录屏保留左下画中画、封面不入时间线、主视觉无重叠。已生成的 `final.mp4` 必须通过受控临时预览 URL 在桌面 WebView 可播放并支持 Range。右下角渠道同步提示只在设置页展示。|",
  "source_sha256": "e22757540e21acb5935b2c51f256c3e54cec205ef54e56754d7cc6cb847c3364",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-03d46609"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-709",
  "title": "将 macOS Developer ID 签名与 Apple 公证凭据接入 GitHub 正式发布流水线",
  "narrative": "`desktop-release` 的 macOS job 必须从 GitHub Secrets 导入 Developer ID P12 到一次性钥匙串，使用同一身份签入 sidecar、Tauri App 与 DMG，再通过临时 `notarytool` profile 完成 submit、staple、Gatekeeper 和真启动验收；缺任一凭据必须 fail-closed，证书、密码、私钥不得写入仓库、artifact 或日志。本轮只改代码与文档，不触发远端流水线。",
  "documents": "[发布流程](docs/RELEASING.md) · [T-640 Gate](orchestrator/GATE-T640-BUILD.md)",
  "source_line": "|T-709|将 macOS Developer ID 签名与 Apple 公证凭据接入 GitHub 正式发布流水线|🔨|—|待验|[发布流程](docs/RELEASING.md) · [T-640 Gate](orchestrator/GATE-T640-BUILD.md)|`desktop-release` 的 macOS job 必须从 GitHub Secrets 导入 Developer ID P12 到一次性钥匙串，使用同一身份签入 sidecar、Tauri App 与 DMG，再通过临时 `notarytool` profile 完成 submit、staple、Gatekeeper 和真启动验收；缺任一凭据必须 fail-closed，证书、密码、私钥不得写入仓库、artifact 或日志。本轮只改代码与文档，不触发远端流水线。|",
  "source_sha256": "a0803b2b2b8dfb99969269132a3911043def97d2916ea1f6d9d9face11920d9f",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-9d134362"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-708",
  "title": "全局审计并软化 AI 工具中不合理的创作完整度门禁",
  "narrative": "全局检查工具描述、系统提示、UI 禁用态和执行层校验：只保留鉴权/归属/隐私安全/破坏性操作/幂等冲突/真实事实不可伪造等硬门；六问完成、先选多个方向、先联网、素材齐全、格式或长度完整等质量条件改为软提示，用户明确要求时先返回可编辑候选并标注假设、缺口和风险，禁止因增强步骤失败清空已有结果。",
  "documents": "[门禁全局审计](docs/research/2026-08-05-ai-tool-hard-gate-audit.md) · [T-707 定位 Copilot SPEC](docs/superpowers/specs/2026-08-01-positioning-pre-interview-workflow.md#101-工具门禁统一规则) · [T-646 结构化工具可靠性](docs/research/2026-08-01-structured-ai-tool-reliability-audit.md)",
  "source_line": "|T-708|全局审计并软化 AI 工具中不合理的创作完整度门禁|🔨|—|待验|[门禁全局审计](docs/research/2026-08-05-ai-tool-hard-gate-audit.md) · [T-707 定位 Copilot SPEC](docs/superpowers/specs/2026-08-01-positioning-pre-interview-workflow.md#101-工具门禁统一规则) · [T-646 结构化工具可靠性](docs/research/2026-08-01-structured-ai-tool-reliability-audit.md)|全局检查工具描述、系统提示、UI 禁用态和执行层校验：只保留鉴权/归属/隐私安全/破坏性操作/幂等冲突/真实事实不可伪造等硬门；六问完成、先选多个方向、先联网、素材齐全、格式或长度完整等质量条件改为软提示，用户明确要求时先返回可编辑候选并标注假设、缺口和风险，禁止因增强步骤失败清空已有结果。|",
  "source_sha256": "c1dd969eedae05a77b8a196eb5d10d5d4d16d9d4632a4dfcaec4c05ed4bcde0f",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-2e49c25c"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-707",
  "title": "将定位前采收敛为 Copilot 主导的自适应编导访谈并直接闭环定位中心",
  "narrative": "[D]",
  "documents": "[SPEC](BACKLOG-details.md#t-707)  [SPEC](docs/superpowers/specs/2026-08-01-positioning-pre-interview-workflow.md)",
  "source_line": "|T-707|将定位前采收敛为 Copilot 主导的自适应编导访谈并直接闭环定位中心|🔨|PASS[REV:ad527fa6490f]|待验|[SPEC](BACKLOG-details.md#t-707)  [SPEC](docs/superpowers/specs/2026-08-01-positioning-pre-interview-workflow.md)|[D]|",
  "source_sha256": "cbb60b9aab5efb0449a6b979fbee3f55742537e9aa0ac62508c20983be6a1ab9",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-c302d6d9"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-705",
  "title": "根治 macOS 本地包启动后落入 Page Not Found",
  "narrative": "新构建的 CreatorOS 0.3.0 DMG 安装后，sidecar 已 Ready 但 WebView 显示 Page Not Found；须从壳层启动 URL、授权重定向、Next standalone 路由与首次导航链定位根因并修复，补真实打包产物启动回归，确保首页或激活页返回真实 200 且不可再用“sidecar 进程存活”冒充页面可用。",
  "documents": "[发布流程](docs/RELEASING.md) · [T-703 SPEC](docs/superpowers/specs/2026-08-05-video-production-editing-loop.md)",
  "source_line": "|T-705|根治 macOS 本地包启动后落入 Page Not Found|🔨|—|待验|[发布流程](docs/RELEASING.md) · [T-703 SPEC](docs/superpowers/specs/2026-08-05-video-production-editing-loop.md)|新构建的 CreatorOS 0.3.0 DMG 安装后，sidecar 已 Ready 但 WebView 显示 Page Not Found；须从壳层启动 URL、授权重定向、Next standalone 路由与首次导航链定位根因并修复，补真实打包产物启动回归，确保首页或激活页返回真实 200 且不可再用“sidecar 进程存活”冒充页面可用。|",
  "source_sha256": "eb337b11dc6fb34a0cef93885d18817d8f415da355cf8317a4e56f367ce830a4",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-d67032d7"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-703",
  "title": "根治视频制作从分镜到预览、对话调剪、采纳与再制作的多处断裂并重打本地包",
  "narrative": "[D]",
  "documents": "[SPEC](BACKLOG-details.md#t-703)  [SPEC](docs/superpowers/specs/2026-08-05-video-production-editing-loop.md)",
  "source_line": "|T-703|根治视频制作从分镜到预览、对话调剪、采纳与再制作的多处断裂并重打本地包|🔨|PASS[REV:66d1b5828813]|待验|[SPEC](BACKLOG-details.md#t-703)  [SPEC](docs/superpowers/specs/2026-08-05-video-production-editing-loop.md)|[D]|",
  "source_sha256": "6f9aeeff5d481ba99771cab496113095a368bc9f9349949c407db5f8a46a8edd",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-9771ee58"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-702",
  "title": "根治审核“应用改写”后分镜稿格式坍缩为 Markdown 表格源码",
  "narrative": "“应用改写”只能替换用户确认的命中片段，必须完整保留当前脚本的 `contentData`、富文本 HTML、分镜 sections、画面/字幕/时长等结构与当前视图；禁止把 sections 临时拼成 `heading + body` 的纯文本后覆盖 canonical `contentText`，也禁止在命中只存在于全文时创建一个丢失 `contentData` 的新版本。统一稿面审核卡与 Copilot 审核卡的单一替换函数，覆盖 Markdown 表格、纯文本稿、结构化分镜稿、连续应用多条建议、刷新及撤销回滚测试；写后页面仍按原格式显示，只改变目标文案。",
  "documents": "既有稿面审核门与脚本 artifact 版本契约",
  "source_line": "|T-702|根治审核“应用改写”后分镜稿格式坍缩为 Markdown 表格源码|📋 待办|—|待验|既有稿面审核门与脚本 artifact 版本契约|“应用改写”只能替换用户确认的命中片段，必须完整保留当前脚本的 `contentData`、富文本 HTML、分镜 sections、画面/字幕/时长等结构与当前视图；禁止把 sections 临时拼成 `heading + body` 的纯文本后覆盖 canonical `contentText`，也禁止在命中只存在于全文时创建一个丢失 `contentData` 的新版本。统一稿面审核卡与 Copilot 审核卡的单一替换函数，覆盖 Markdown 表格、纯文本稿、结构化分镜稿、连续应用多条建议、刷新及撤销回滚测试；写后页面仍按原格式显示，只改变目标文案。|",
  "source_sha256": "234b42ecbf486ef7179c39cc44b3278bda383b3080fcbaa456c7ce7ce4f88254",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-53d6b38a"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-695",
  "title": "清理应用内硬编码品牌并让白标用户表面保持中性",
  "narrative": "全局审计用户可见文案中的 `CreatorOS` 等固定品牌：产品身份确实需要展示时统一读取渠道运行时品牌并保留官方默认值，课程标题、课程角标、课程说明、引导语和示例等不需要品牌背书的位置统一改成中性文案；本轮至少将“CreatorOS IP 创作实战课”收敛为“创作实战课”，不得改动包标识、协议名、环境变量、数据目录、内部 schema 或日志诊断标识。补课程清单与关键用户表面回归测试及可见文案扫描。",
  "documents": "[白标边界](docs/research/2026-08-04-white-label-runtime-vs-package-boundary.md) · [课程架构](docs/superpowers/specs/2026-08-03-built-in-ip-course-architecture.md)",
  "source_line": "|T-695|清理应用内硬编码品牌并让白标用户表面保持中性|🔨|—|待验|[白标边界](docs/research/2026-08-04-white-label-runtime-vs-package-boundary.md) · [课程架构](docs/superpowers/specs/2026-08-03-built-in-ip-course-architecture.md)|全局审计用户可见文案中的 `CreatorOS` 等固定品牌：产品身份确实需要展示时统一读取渠道运行时品牌并保留官方默认值，课程标题、课程角标、课程说明、引导语和示例等不需要品牌背书的位置统一改成中性文案；本轮至少将“CreatorOS IP 创作实战课”收敛为“创作实战课”，不得改动包标识、协议名、环境变量、数据目录、内部 schema 或日志诊断标识。补课程清单与关键用户表面回归测试及可见文案扫描。|",
  "source_sha256": "9194ac6c770c305c7936ff9a4838fbc2c6978d18d397833d85c104db1675b668",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-76abcd4e"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-691",
  "title": "补齐 Copilot 单项目全生命周期、跨项目历史与审核改稿工具闭环",
  "narrative": "[D]",
  "documents": "[SPEC](BACKLOG-details.md#t-691)  [SPEC](docs/superpowers/specs/2026-08-04-copilot-project-lifecycle-tool-closure.md)",
  "source_line": "|T-691|补齐 Copilot 单项目全生命周期、跨项目历史与审核改稿工具闭环|🔨|PASS[REV:08fce87b6b59]|待验|[SPEC](BACKLOG-details.md#t-691)  [SPEC](docs/superpowers/specs/2026-08-04-copilot-project-lifecycle-tool-closure.md)|[D]|",
  "source_sha256": "f9f7a2146b1945626c03f6e781856f4d6112a296271746edd4aff69d020c0a04",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-558ad093"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-694",
  "title": "建立多渠道专属包工厂、项目级出包 Skill 与安全增量更新闭环",
  "narrative": "[D]",
  "documents": "[SPEC](BACKLOG-details.md#t-694)  [SPEC](docs/superpowers/specs/2026-08-04-channel-package-factory-and-incremental-update.md)",
  "source_line": "|T-694|建立多渠道专属包工厂、项目级出包 Skill 与安全增量更新闭环|🔨|PASS[REV:e589af9ef3ce]|待验|[SPEC](BACKLOG-details.md#t-694)  [SPEC](docs/superpowers/specs/2026-08-04-channel-package-factory-and-incremental-update.md)|[D]|",
  "source_sha256": "6db6eb95a918c19bdd0954c5431d025565c5cbcae905bbed40ed92b81324206c",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-ef268ff6"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-686",
  "title": "根治定位前采联网补充直接报错并恢复国内中文公开检索",
  "narrative": "**范围已被用户 2026-08-05 决策覆盖：联网搜索退出定位前采主链，T-707 不调用本能力。** 若该任务继续，只能作为通用浏览器检索可靠性修复或方向生成后的用户主动可选参考，失败不得影响前采、生成方向或采纳定位，也不得把模型记忆冒充搜索结果；开始实现前须先按新范围收口任务状态，禁止继续把 `positioning.discovery.research` 接回前采页面。",
  "documents": "[T-652 前采工作流](docs/superpowers/specs/2026-08-01-positioning-pre-interview-workflow.md) · [真实浏览器旅程](orchestrator/T686-FRONTEND-JOURNEY.md) · T-684 浏览器检索",
  "source_line": "|T-686|根治定位前采联网补充直接报错并恢复国内中文公开检索|🔨|—|待验|[T-652 前采工作流](docs/superpowers/specs/2026-08-01-positioning-pre-interview-workflow.md) · [真实浏览器旅程](orchestrator/T686-FRONTEND-JOURNEY.md) · T-684 浏览器检索|**范围已被用户 2026-08-05 决策覆盖：联网搜索退出定位前采主链，T-707 不调用本能力。** 若该任务继续，只能作为通用浏览器检索可靠性修复或方向生成后的用户主动可选参考，失败不得影响前采、生成方向或采纳定位，也不得把模型记忆冒充搜索结果；开始实现前须先按新范围收口任务状态，禁止继续把 `positioning.discovery.research` 接回前采页面。|",
  "source_sha256": "c8b9b63d36f225f06189678949f311eb9b4f1eac4dd159a0f6780bf3bb3197f0",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-5217c5b9"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-687",
  "title": "建立口播联想画面 Skill 并打通图序号引用、项目 B-roll 与成片渲染",
  "narrative": "从口播语义节拍生成“观众能联想到什么”的画面计划，区分事实证据、类比联想、过程示意、情绪氛围与信息卡，禁止只复述口播或批量生成通用图库图；支持 `image2`、`图2`、`第二张`、`刚才那组第二张`等会话别名确定性解析到真实候选或素材，不能再靠标题模糊搜索；用户采纳后必须原子绑定当前项目 `broll` 并刷新制作候选，视频决策只引用真实已采纳素材，成片前验证所选素材已成功解析和进入画面，缺失时明确报错而不是静默出无素材成片。Skill 只承载编导判断，别名、项目绑定、刷新和渲染校验必须由确定性代码与契约保证；按 Skill 规则先补失败基线测试再实现。",
  "documents": "[口播联想画面 Skill SPEC](docs/superpowers/specs/2026-08-04-voiceover-associative-visual-skill.md) · [T-642 编导证据链 SPEC](docs/superpowers/specs/2026-08-01-content-radar-creative-handoff.md) · T-661 项目素材制作闭环",
  "source_line": "|T-687|建立口播联想画面 Skill 并打通图序号引用、项目 B-roll 与成片渲染|🔨|—|待验|[口播联想画面 Skill SPEC](docs/superpowers/specs/2026-08-04-voiceover-associative-visual-skill.md) · [T-642 编导证据链 SPEC](docs/superpowers/specs/2026-08-01-content-radar-creative-handoff.md) · T-661 项目素材制作闭环|从口播语义节拍生成“观众能联想到什么”的画面计划，区分事实证据、类比联想、过程示意、情绪氛围与信息卡，禁止只复述口播或批量生成通用图库图；支持 `image2`、`图2`、`第二张`、`刚才那组第二张`等会话别名确定性解析到真实候选或素材，不能再靠标题模糊搜索；用户采纳后必须原子绑定当前项目 `broll` 并刷新制作候选，视频决策只引用真实已采纳素材，成片前验证所选素材已成功解析和进入画面，缺失时明确报错而不是静默出无素材成片。Skill 只承载编导判断，别名、项目绑定、刷新和渲染校验必须由确定性代码与契约保证；按 Skill 规则先补失败基线测试再实现。|",
  "source_sha256": "c167605342acb21c2d52988d55901f55dde7a019bee8bfae1f2678a05c1cc4c9",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-8219c73e"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-685",
  "title": "排查并根治全流程写稿长度失控及审核不识别已采纳文案卡",
  "narrative": "以本机最新完整日志和真实项目状态串起 `script.draft` 请求、异步任务、脚本候选卡、用户采纳、正式 `output_script` 产物与 `review.script` 读取；定位文案反复过短/过长的长度约束、重试与部分结果处理问题，以及审核为何持续误判“没有采纳文案卡”。修复后目标时长只做合理区间约束，不因轻微偏差整稿失败或无效重试；采纳成功必须原子落成审核唯一读取的正式脚本并刷新回显，审核不得读取旧项目快照、聊天卡或空产物清单。",
  "documents": "[T-642 编导证据链 SPEC](docs/superpowers/specs/2026-08-01-content-radar-creative-handoff.md) · T-680 写稿可靠性",
  "source_line": "|T-685|排查并根治全流程写稿长度失控及审核不识别已采纳文案卡|🔨|—|待验|[T-642 编导证据链 SPEC](docs/superpowers/specs/2026-08-01-content-radar-creative-handoff.md) · T-680 写稿可靠性|以本机最新完整日志和真实项目状态串起 `script.draft` 请求、异步任务、脚本候选卡、用户采纳、正式 `output_script` 产物与 `review.script` 读取；定位文案反复过短/过长的长度约束、重试与部分结果处理问题，以及审核为何持续误判“没有采纳文案卡”。修复后目标时长只做合理区间约束，不因轻微偏差整稿失败或无效重试；采纳成功必须原子落成审核唯一读取的正式脚本并刷新回显，审核不得读取旧项目快照、聊天卡或空产物清单。|",
  "source_sha256": "0db6150effb3986fbf92be9970f81d5b708e231aca9fb06bff3c8a517f34eaf8",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-7d25e916"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-684",
  "title": "根治 Copilot 联网搜素材失败后回退模型记忆并误导配置搜索模型",
  "narrative": "普通用户发起联网搜素材时须直接走随包浏览器检索，不依赖或暴露已隐藏的搜索模型配置；默认引擎导航、反爬或 SERP 解析失败/返回 0 条时，按国内中文来源优先切换备用搜索引擎并记录可诊断失败原因，全部真实检索失败则返回明确空态和可重试动作，禁止继续调用模型生成并用 `grounding=model_memory` 凑出无 URL 的“搜索结果”；清理 system prompt、工具说明和错误文案里“设置→模型→联网搜索”的旧指引。",
  "documents": "既有 `material.gather`、`web.search` 浏览器适配器与 T-645 隐藏模型配置契约",
  "source_line": "|T-684|根治 Copilot 联网搜素材失败后回退模型记忆并误导配置搜索模型|🔨|—|待验|既有 `material.gather`、`web.search` 浏览器适配器与 T-645 隐藏模型配置契约|普通用户发起联网搜素材时须直接走随包浏览器检索，不依赖或暴露已隐藏的搜索模型配置；默认引擎导航、反爬或 SERP 解析失败/返回 0 条时，按国内中文来源优先切换备用搜索引擎并记录可诊断失败原因，全部真实检索失败则返回明确空态和可重试动作，禁止继续调用模型生成并用 `grounding=model_memory` 凑出无 URL 的“搜索结果”；清理 system prompt、工具说明和错误文案里“设置→模型→联网搜索”的旧指引。|",
  "source_sha256": "8019ec6bfa991e9dc297e2cebd67ddd0c72f32fc3c15a2cf7ce97b71a6a002a3",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-39d1c63b"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-683",
  "title": "修复 Copilot 在 Windows 无法读取盘符绝对路径与目录授权失效",
  "narrative": "`local.read` 必须按当前运行平台接受 Windows 盘符路径、UNC 路径和 `~` 家目录，同时继续接受 macOS/POSIX 路径；读取、授权判定、授权写入和目录长期授权必须共用同一规范化与包含关系，不能把 `E:\\\\...` 判为相对路径，也不能因分隔符不同导致子文件反复弹授权；工具说明须展示当前平台正确示例，模型不得再声称 Windows 文件不可读。",
  "documents": "既有 `local.read` 安全归一、HITL 授权和本地工作区契约",
  "source_line": "|T-683|修复 Copilot 在 Windows 无法读取盘符绝对路径与目录授权失效|🔨|—|待验|既有 `local.read` 安全归一、HITL 授权和本地工作区契约|`local.read` 必须按当前运行平台接受 Windows 盘符路径、UNC 路径和 `~` 家目录，同时继续接受 macOS/POSIX 路径；读取、授权判定、授权写入和目录长期授权必须共用同一规范化与包含关系，不能把 `E:\\\\...` 判为相对路径，也不能因分隔符不同导致子文件反复弹授权；工具说明须展示当前平台正确示例，模型不得再声称 Windows 文件不可读。|",
  "source_sha256": "34025a58dddec5b91de374619b29de09f35fef361cb55776b08351375926c5e7",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-d3abe12b"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-679",
  "title": "接入 Growth 按激活权益签发的受管模型凭据、真实模型白名单与用户选择",
  "narrative": "CreatorOS 在 Activity 激活并取得 `config-access-ticket-v2` 后，为文本/图片/视频同步同一权益的 persistent 受管子 Key并安全写入系统密钥库；从已签名配置动态渲染真实模型并持久化白名单内选择。语音转文字作为同一任务的 per_request 增量：兼容旧 bundle 缺 lifecycle，新 bundle 只接受精确双 service；客户端已按稳定的 API-282 合同完成文件先验、稳定幂等、单次内存临时授权、精确直连与 Whisper 单次回退，provider_unknown/expired 不换 key、不重复申请。T-768 已覆盖旧的 ASR 阻断语义：未绑定、额度不足及任何云端异常均只尝试一次本地 Whisper；T-715 额度入口可保留为提示，但不得阻断转写。用户侧不得出现中转站、provider、Base URL、serviceId、长期 Key、临时 token 或 ticket。聚焦测试已通过；非 fixture 的 Activity ticket → Growth bundle → lease → 直连转写 → 总额度减少 25,000 回执仍待真机验证，因此不得宣称 E2E 完成；Activity 不修改。",
  "documents": "[Growth 持久凭据契约](/Users/zyongzhu/Workbase/Thirdspace-growth/docs/contracts/T-133-activation-managed-model-subkey.md) · [Growth ASR 临时授权契约](/Users/zyongzhu/Workbase/Thirdspace-growth/docs/contracts/T-135-qwen-asr-direct-client.md)",
  "source_line": "|T-679|接入 Growth 按激活权益签发的受管模型凭据、真实模型白名单与用户选择|🔨|—|待验|[Growth 持久凭据契约](/Users/zyongzhu/Workbase/Thirdspace-growth/docs/contracts/T-133-activation-managed-model-subkey.md) · [Growth ASR 临时授权契约](/Users/zyongzhu/Workbase/Thirdspace-growth/docs/contracts/T-135-qwen-asr-direct-client.md)|CreatorOS 在 Activity 激活并取得 `config-access-ticket-v2` 后，为文本/图片/视频同步同一权益的 persistent 受管子 Key并安全写入系统密钥库；从已签名配置动态渲染真实模型并持久化白名单内选择。语音转文字作为同一任务的 per_request 增量：兼容旧 bundle 缺 lifecycle，新 bundle 只接受精确双 service；客户端已按稳定的 API-282 合同完成文件先验、稳定幂等、单次内存临时授权、精确直连与 Whisper 单次回退，provider_unknown/expired 不换 key、不重复申请。T-768 已覆盖旧的 ASR 阻断语义：未绑定、额度不足及任何云端异常均只尝试一次本地 Whisper；T-715 额度入口可保留为提示，但不得阻断转写。用户侧不得出现中转站、provider、Base URL、serviceId、长期 Key、临时 token 或 ticket。聚焦测试已通过；非 fixture 的 Activity ticket → Growth bundle → lease → 直连转写 → 总额度减少 25,000 回执仍待真机验证，因此不得宣称 E2E 完成；Activity 不修改。|",
  "source_sha256": "f84e16bd74a4a0733f31a58183964b3b5b246ce152f1c5df5ac988c22938b4ad",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-ebca3889"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-678",
  "title": "根治内容雷达生成选题继续读取旧定位",
  "narrative": "用户保存新定位后，内容雷达新建选题必须读取当前正式定位，并在任务创建时冻结完整定位母版快照（陈述、关键词、画像、规则与版本），结果明确显示所用版本；禁止只透传旧 `positioningVersionId` 的陈述/关键词，或因路由缓存继续携带修改前内容。",
  "documents": "[T-652 定位前采 SPEC](docs/superpowers/specs/2026-08-01-positioning-pre-interview-workflow.md) · [T-642 编导证据链 SPEC](docs/superpowers/specs/2026-08-01-content-radar-creative-handoff.md)",
  "source_line": "|T-678|根治内容雷达生成选题继续读取旧定位|📋 待办|—|待验|[T-652 定位前采 SPEC](docs/superpowers/specs/2026-08-01-positioning-pre-interview-workflow.md) · [T-642 编导证据链 SPEC](docs/superpowers/specs/2026-08-01-content-radar-creative-handoff.md)|用户保存新定位后，内容雷达新建选题必须读取当前正式定位，并在任务创建时冻结完整定位母版快照（陈述、关键词、画像、规则与版本），结果明确显示所用版本；禁止只透传旧 `positioningVersionId` 的陈述/关键词，或因路由缓存继续携带修改前内容。|",
  "source_sha256": "0965b79e7c3d4cb121748bc9d08dd691b430b53685efce63a21cece0c476ef03",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-37381c84"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-677",
  "title": "优化首页与定位中心切换时整页骨架卡顿 1–2 秒",
  "narrative": "保留主内容稳定框架，把非首屏数据改为可分区返回/延后加载，对高频路由做可验证预热，并记录 dashboard 与定位各读源耗时；页面切换不得因共享 `(creator)/loading.tsx` 把整个主区替换成骨架，需在 macOS 用户同等数据量下验证体感和实测耗时。",
  "documents": "既有 DashboardQueryService、定位中心页面读取与 App Router loading 契约",
  "source_line": "|T-677|优化首页与定位中心切换时整页骨架卡顿 1–2 秒|📋 待办|—|待验|既有 DashboardQueryService、定位中心页面读取与 App Router loading 契约|保留主内容稳定框架，把非首屏数据改为可分区返回/延后加载，对高频路由做可验证预热，并记录 dashboard 与定位各读源耗时；页面切换不得因共享 `(creator)/loading.tsx` 把整个主区替换成骨架，需在 macOS 用户同等数据量下验证体感和实测耗时。|",
  "source_sha256": "844aa1dbc9ba3c9af683aaaa36c76d3b6d9d30ae8375d798de8ea094db11f2b0",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-be8b05d0"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-676",
  "title": "根治云端 ASR 测试假阳性并接通 StepFun，同时修复 Windows 本地 Whisper 回退",
  "narrative": "`transcribe.audio` 只能保存客户端真实支持的供应商，或提供与其协议一致的专用适配器；为 `stepaudio-2.5-asr` 接入 StepFun JSON/base64/SSE 转写链，连接测试必须走同一适配器能力而非只测 `/v1/models`。同时以用户 Windows 日志复现并根治本地 Whisper 的独立 worker/GLib 失败，确保云端配置不可用时回退不再二次失败。",
  "documents": "既有 `transcribe.audio` 多模态适配器与设置连接测试契约",
  "source_line": "|T-676|根治云端 ASR 测试假阳性并接通 StepFun，同时修复 Windows 本地 Whisper 回退|📋 待办|—|待验|既有 `transcribe.audio` 多模态适配器与设置连接测试契约|`transcribe.audio` 只能保存客户端真实支持的供应商，或提供与其协议一致的专用适配器；为 `stepaudio-2.5-asr` 接入 StepFun JSON/base64/SSE 转写链，连接测试必须走同一适配器能力而非只测 `/v1/models`。同时以用户 Windows 日志复现并根治本地 Whisper 的独立 worker/GLib 失败，确保云端配置不可用时回退不再二次失败。|",
  "source_sha256": "791dfdb7ad57b486ee75774fee3959c0dd2bc7d29527f83d19d9fdf61cfa162f",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-18166bf0"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-671",
  "title": "确定 CreatorOS 代理商业模式与官网价格边界",
  "narrative": "代理价盘与资格仍是内部经营规则，不再作为官网公开内容；官网不展示任何价格、利润、个人联系方式或直营购买入口，只引导访问者联系向其推荐 CreatorOS 的授权合作伙伴，保护代理线索和成交空间。",
  "documents": "[代理合作口径](docs/superpowers/specs/2026-08-02-creatoros-agent-channel-policy.md) · [公开信息收口](docs/superpowers/specs/2026-08-03-creatoros-public-price-contact-withdrawal.md) · [渠道白标调研](docs/research/2026-08-01-channel-white-label-runtime-branding-audit.md)",
  "source_line": "|T-671|确定 CreatorOS 代理商业模式与官网价格边界|🔨|—|待验|[代理合作口径](docs/superpowers/specs/2026-08-02-creatoros-agent-channel-policy.md) · [公开信息收口](docs/superpowers/specs/2026-08-03-creatoros-public-price-contact-withdrawal.md) · [渠道白标调研](docs/research/2026-08-01-channel-white-label-runtime-branding-audit.md)|代理价盘与资格仍是内部经营规则，不再作为官网公开内容；官网不展示任何价格、利润、个人联系方式或直营购买入口，只引导访问者联系向其推荐 CreatorOS 的授权合作伙伴，保护代理线索和成交空间。|",
  "source_sha256": "8e5772c8eb1d6540a8f8c6a88d3ebb3ea8b1286bb2e22e333e2ed308729baff6",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-c57fd2fa"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-670",
  "title": "恢复 CreatorOS 部署前真实官网并收口公开商业信息",
  "narrative": "在恢复部署前真实官网视觉和产品结构的基础上，按 T-672 删除全部公开价格、利润、个人联系方式、个人二维码与直营购买入口；保留产品能力、飞轮、设备支持和更新日志。2026-08-02 已补齐真实产品图片并修正静态资源 404 语义。",
  "documents": "[T-668 历史定价口径](docs/superpowers/specs/2026-08-02-creatoros-website-pricing.md) · [T-672 当前公开边界](docs/superpowers/specs/2026-08-03-creatoros-public-price-contact-withdrawal.md)",
  "source_line": "|T-670|恢复 CreatorOS 部署前真实官网并收口公开商业信息|🔨|—|待验|[T-668 历史定价口径](docs/superpowers/specs/2026-08-02-creatoros-website-pricing.md) · [T-672 当前公开边界](docs/superpowers/specs/2026-08-03-creatoros-public-price-contact-withdrawal.md)|在恢复部署前真实官网视觉和产品结构的基础上，按 T-672 删除全部公开价格、利润、个人联系方式、个人二维码与直营购买入口；保留产品能力、飞轮、设备支持和更新日志。2026-08-02 已补齐真实产品图片并修正静态资源 404 语义。|",
  "source_sha256": "12162bbaaba566214a25953d2ef83b5e0487fd93812ea68153e7a06fc917b8d7",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-0180797b"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-666",
  "title": "根治定位前采误清空既有定位并改为非破坏草稿切换",
  "narrative": "只要账号存在正式定位，进入“完全从零开始”、中途退出、刷新或访谈未完成都不得清空、替换或隐藏当前母版与历史版本；前采只写可恢复草稿，只有新定位完整生成且用户明确采纳后才新增正式版本并切换，旧版本始终可见可恢复。",
  "documents": "[定位非破坏草稿 SPEC](docs/superpowers/specs/2026-08-02-positioning-non-destructive-draft.md) · [真实浏览器旅程](orchestrator/T666-FRONTEND-JOURNEY.md) · [T-652 前采主流程](docs/superpowers/specs/2026-08-01-positioning-pre-interview-workflow.md)",
  "source_line": "|T-666|根治定位前采误清空既有定位并改为非破坏草稿切换|🔨|—|待验|[定位非破坏草稿 SPEC](docs/superpowers/specs/2026-08-02-positioning-non-destructive-draft.md) · [真实浏览器旅程](orchestrator/T666-FRONTEND-JOURNEY.md) · [T-652 前采主流程](docs/superpowers/specs/2026-08-01-positioning-pre-interview-workflow.md)|只要账号存在正式定位，进入“完全从零开始”、中途退出、刷新或访谈未完成都不得清空、替换或隐藏当前母版与历史版本；前采只写可恢复草稿，只有新定位完整生成且用户明确采纳后才新增正式版本并切换，旧版本始终可见可恢复。|",
  "source_sha256": "ea60b56f204fc40e0e109635091854256ad6deb18e1a27fdb56499dae4f897f2",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-2068aa95"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-665",
  "title": "支持彻底删除内容雷达信源及其全部归属数据",
  "narrative": "信源卡提供明确的“删除信源与内容”动作，二次确认后由 intelligence backend service 在所有权校验和事务内删除该信源、仅归属于它的内容/逐字稿/快照/运行与任务状态；被其他信源或正式项目引用的数据按契约保留或解除关联，UI 不再继续显示已删除信源。",
  "documents": "[信源彻底删除 SPEC](docs/superpowers/specs/2026-08-02-intelligence-source-hard-delete.md) · [真实浏览器旅程](orchestrator/T665-FRONTEND-JOURNEY.md) · [内容雷达服务契约](docs/superpowers/specs/2026-07-23-content-radar-service-contract.md)",
  "source_line": "|T-665|支持彻底删除内容雷达信源及其全部归属数据|🔨|—|待验|[信源彻底删除 SPEC](docs/superpowers/specs/2026-08-02-intelligence-source-hard-delete.md) · [真实浏览器旅程](orchestrator/T665-FRONTEND-JOURNEY.md) · [内容雷达服务契约](docs/superpowers/specs/2026-07-23-content-radar-service-contract.md)|信源卡提供明确的“删除信源与内容”动作，二次确认后由 intelligence backend service 在所有权校验和事务内删除该信源、仅归属于它的内容/逐字稿/快照/运行与任务状态；被其他信源或正式项目引用的数据按契约保留或解除关联，UI 不再继续显示已删除信源。|",
  "source_sha256": "5ebaafa6aeeb90c19895c1744b8ccda2850e365811fbbafb40b2f87afcd52505",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-08306c91"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-662",
  "title": "根治成片把内部结构标签当正文并优化卡片文字重合",
  "narrative": "视频场景标题和卡片正文必须来自观众可读的真实口播主张，`hook/value/新闻钩子` 等内部编导标签只能做控制元数据，不能直接出现在画面；同时按真实画布安全区、文本长度和人物画面占位约束卡片排版，避免文字重合与空黑屏。",
  "documents": "[视频制作 overhaul SPEC](docs/superpowers/specs/2026-07-13-video-production-overhaul-design.md)",
  "source_line": "|T-662|根治成片把内部结构标签当正文并优化卡片文字重合|🔨|—|待验|[视频制作 overhaul SPEC](docs/superpowers/specs/2026-07-13-video-production-overhaul-design.md)|视频场景标题和卡片正文必须来自观众可读的真实口播主张，`hook/value/新闻钩子` 等内部编导标签只能做控制元数据，不能直接出现在画面；同时按真实画布安全区、文本长度和人物画面占位约束卡片排版，避免文字重合与空黑屏。|",
  "source_sha256": "4b2873c721756b502896eb54fda785dbadf015f6f8eacdcbd3d57ddc369a2f7d",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-e250b4f6"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-661",
  "title": "根治项目素材未进入制作、采纳后仍转圈及素材包图片无扩展名",
  "narrative": "项目中已采纳或上传的截图、录屏和生成图必须从统一用料链自动进入制作候选；任务卡刷新后按持久终态停止转圈；素材包必须按真实 MIME/素材类型补安全扩展名，禁止把图片导成 Finder 识别为文稿的无后缀文件。",
  "documents": "[结构/脚本/分镜一致性 SPEC](docs/superpowers/specs/2026-07-17-structure-script-storyboard-consistency-design.md) · [素材包 SPEC](docs/superpowers/specs/2026-07-17-video-stage-three-paths-and-material-export-design.md)",
  "source_line": "|T-661|根治项目素材未进入制作、采纳后仍转圈及素材包图片无扩展名|🔨|—|待验|[结构/脚本/分镜一致性 SPEC](docs/superpowers/specs/2026-07-17-structure-script-storyboard-consistency-design.md) · [素材包 SPEC](docs/superpowers/specs/2026-07-17-video-stage-three-paths-and-material-export-design.md)|项目中已采纳或上传的截图、录屏和生成图必须从统一用料链自动进入制作候选；任务卡刷新后按持久终态停止转圈；素材包必须按真实 MIME/素材类型补安全扩展名，禁止把图片导成 Finder 识别为文稿的无后缀文件。|",
  "source_sha256": "e4f6c0f620f51f12b489d55ce41a17aa14f319a7ee264bcdbb9d9e4023d8e964",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-f3b9e236"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-660",
  "title": "根治雷达预填逐字稿未解锁下一步及已采纳封面仍被判缺失",
  "narrative": "项目阶段状态必须从真实已保存逐字稿和项目已采纳封面素材派生，不能依赖用户再敲一次键触发本地脏状态，也不能只认某一种封面生成回写字段；修复首次进入、采纳后即时回显与刷新后回显，并补真实链路回归。",
  "documents": "[T-642 编导证据链 SPEC](docs/superpowers/specs/2026-08-01-content-radar-creative-handoff.md)",
  "source_line": "|T-660|根治雷达预填逐字稿未解锁下一步及已采纳封面仍被判缺失|🔨|—|待验|[T-642 编导证据链 SPEC](docs/superpowers/specs/2026-08-01-content-radar-creative-handoff.md)|项目阶段状态必须从真实已保存逐字稿和项目已采纳封面素材派生，不能依赖用户再敲一次键触发本地脏状态，也不能只认某一种封面生成回写字段；修复首次进入、采纳后即时回显与刷新后回显，并补真实链路回归。|",
  "source_sha256": "38d09e6fadd3a26ca425ab70c056792ebf43d678eb0483876ee8e12b938ce5e4",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-d495246d"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-656",
  "title": "收紧桌面授权本地信任链，移除生产冒烟旁路并消除 verdict 私钥明文靶点",
  "narrative": "[D]",
  "documents": "[SPEC](BACKLOG-details.md#t-656)  [SPEC](docs/superpowers/specs/2026-08-02-desktop-verdict-basic-hardening.md)",
  "source_line": "|T-656|收紧桌面授权本地信任链，移除生产冒烟旁路并消除 verdict 私钥明文靶点|🔨|PASS[REV:12cb549493b0]|待验|[SPEC](BACKLOG-details.md#t-656)  [SPEC](docs/superpowers/specs/2026-08-02-desktop-verdict-basic-hardening.md)|[D]|",
  "source_sha256": "6da29876e27f5518e7a55f51382cda77f6aeac23c137dd3abfb6bfd3bf33d856",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-b8190b94"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-655",
  "title": "接通 Seedance 文生视频适配器并修复 `seeddance` 配置报未知 provider",
  "narrative": "核实当前 Seedance 配置实际使用的官方或中转协议，在现有多模态 registry 中新增真实 submit→poll→download 适配器，并兼容已经保存的 `seeddance` provider 拼写；生成失败必须给出可行动原因，禁止把已配置能力误报成不支持。",
  "documents": "既有 `video.generate` 与异步多模态 provider 契约",
  "source_line": "|T-655|接通 Seedance 文生视频适配器并修复 `seeddance` 配置报未知 provider|🔨|—|—|既有 `video.generate` 与异步多模态 provider 契约|核实当前 Seedance 配置实际使用的官方或中转协议，在现有多模态 registry 中新增真实 submit→poll→download 适配器，并兼容已经保存的 `seeddance` provider 拼写；生成失败必须给出可行动原因，禁止把已配置能力误报成不支持。|",
  "source_sha256": "9402cdbe073aff6723a9bb9a9ee8bee064db04963c80525b2d775837ff14f688",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-58f76222"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-654",
  "title": "新增 Qwen 方言 ASR 适配器并接入设置预设",
  "narrative": "新增 `qwen-asr` 真实适配器，调用百炼 Qwen3-ASR 的 `chat/completions + input_audio`，复用安全音频分段并在设置页提供 Qwen 预设；用户只需填写模型名和 Key，未配置时仍回退本地 Whisper，普通话及方言走同一条逐字稿落库链。",
  "documents": "既有 `transcribe.audio` 与多模态 provider 适配器契约",
  "source_line": "|T-654|新增 Qwen 方言 ASR 适配器并接入设置预设|🔨|—|待验|既有 `transcribe.audio` 与多模态 provider 适配器契约|新增 `qwen-asr` 真实适配器，调用百炼 Qwen3-ASR 的 `chat/completions + input_audio`，复用安全音频分段并在设置页提供 Qwen 预设；用户只需填写模型名和 Key，未配置时仍回退本地 Whisper，普通话及方言走同一条逐字稿落库链。|",
  "source_sha256": "83635d02e86fb72e1e4d9424f389bc83377538135c2012a363b88162bc486a42",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-2c0ff79b"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-653",
  "title": "支持本地自配与渠道子 Key 托管双模式模型供给",
  "narrative": "当前版本不实现托管子 Key：先支持“渠道下发公开模型/连接配置，用户在 CreatorOS 本机按服务填写 Key”；等中转站的建子 Key、充值、额度、用量、停用与对账协议确定后，再恢复 entitlement→受限子 Key→Growth 充值履约方案，母 Key始终不得进入客户端。",
  "documents": "[已确认方向与后置条件](docs/research/2026-08-02-activation-managed-relay-subkey-design.md)",
  "source_line": "|T-653|支持本地自配与渠道子 Key 托管双模式模型供给|📋 待办|待审|待验|[已确认方向与后置条件](docs/research/2026-08-02-activation-managed-relay-subkey-design.md)|当前版本不实现托管子 Key：先支持“渠道下发公开模型/连接配置，用户在 CreatorOS 本机按服务填写 Key”；等中转站的建子 Key、充值、额度、用量、停用与对账协议确定后，再恢复 entitlement→受限子 Key→Growth 充值履约方案，母 Key始终不得进入客户端。|",
  "source_sha256": "e0f8cdaaec0d3cbd191629de4e3e0231251e3595b79b433e416dc374d16ea29c",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-8cb3334c"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-652",
  "title": "重构定位前采为必经的编导式访谈与证据辅助工作流",
  "narrative": "[D]",
  "documents": "[SPEC](docs/superpowers/specs/2026-08-01-positioning-pre-interview-workflow.md) · [SPEC](BACKLOG-details.md#t-652)",
  "source_line": "|T-652|重构定位前采为必经的编导式访谈与证据辅助工作流|🔨|PASS[REV:01c2e5babfb4]|待验|[SPEC](docs/superpowers/specs/2026-08-01-positioning-pre-interview-workflow.md) · [SPEC](BACKLOG-details.md#t-652)|[D]|",
  "source_sha256": "e7692a7858a85cf78fbe4d5b66259fb73e67133abb6d08f9aa004be596c7139c",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-0e677e1f"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-650",
  "title": "知识倾倒输入框支持拖拽文件直接导入",
  "narrative": "用户可把当前支持的 PDF、DOCX、Markdown、TXT 文件直接拖进大输入框，获得明确拖入态、上传进度、成功结果与错误提示；拖拽必须复用现有文件导入真链路，不新增第二套解析或假上传。",
  "documents": "既有知识蒸馏与文件导入契约",
  "source_line": "|T-650|知识倾倒输入框支持拖拽文件直接导入|🔨|—|待验|既有知识蒸馏与文件导入契约|用户可把当前支持的 PDF、DOCX、Markdown、TXT 文件直接拖进大输入框，获得明确拖入态、上传进度、成功结果与错误提示；拖拽必须复用现有文件导入真链路，不新增第二套解析或假上传。|",
  "source_sha256": "689eb0197a55e30cd655b88e48fb20c2db2f8808855e94e426ff47a3ada1c934",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-85ec11a7"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-651",
  "title": "内容雷达默认按作品真实发布时间倒序",
  "narrative": "排序项改名为「最新发布」，主排序键必须是来源作品真实 `publishedAt`、且倒序；不得以采集入库、指标快照或最后更新时间冒充发布时间。发布时间相同时再以收录时间和稳定 ID 倒序；缺失发布时间的条目置后并如实显示。",
  "documents": "内容雷达既有列表排序契约",
  "source_line": "|T-651|内容雷达默认按作品真实发布时间倒序|🔨|—|待验|内容雷达既有列表排序契约|排序项改名为「最新发布」，主排序键必须是来源作品真实 `publishedAt`、且倒序；不得以采集入库、指标快照或最后更新时间冒充发布时间。发布时间相同时再以收录时间和稳定 ID 倒序；缺失发布时间的条目置后并如实显示。|",
  "source_sha256": "8ba1d2bc0e6ead7297980addff400fafb0cd49c3709de7eb3e646fe182ca31a3",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-9a83208d"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-649",
  "title": "调研并设计激活后渠道白标：品牌名、应用内 Logo 与系统级图标边界",
  "narrative": "核对 Growth 已发布渠道配置与 CreatorOS 激活消费链，区分可在激活后运行时替换的应用内品牌、窗口标题与帮助入口，以及受 macOS/Windows 包签名、安装元数据、Dock/任务栏缓存约束而必须构建期固定的系统级应用名/图标；给出单一安装包可实现范围、需要独立渠道包的范围及最小可信扩展契约。",
  "documents": "[调研结论](docs/research/2026-08-01-channel-white-label-runtime-branding-audit.md)",
  "source_line": "|T-649|调研并设计激活后渠道白标：品牌名、应用内 Logo 与系统级图标边界|📋 待办|—|待验|[调研结论](docs/research/2026-08-01-channel-white-label-runtime-branding-audit.md)|核对 Growth 已发布渠道配置与 CreatorOS 激活消费链，区分可在激活后运行时替换的应用内品牌、窗口标题与帮助入口，以及受 macOS/Windows 包签名、安装元数据、Dock/任务栏缓存约束而必须构建期固定的系统级应用名/图标；给出单一安装包可实现范围、需要独立渠道包的范围及最小可信扩展契约。|",
  "source_sha256": "bedba13bdbc4646e6b4f6d18a07a99af02fe798539d181182d6ed02869fc645a",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-65680e2e"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-646",
  "title": "统一优化结构化 AI 工具为结果优先、分段生成与局部修复",
  "narrative": "逐个审计结构化 AI 工具的 schema 复杂度、单次模型职责、重试放大与失败语义；创作内容应先产出可用结果，再补全、校验和优化，非关键字段或增强步骤失败不得清空已有结果或触发整轮疯狂重试。内容雷达部分阶段失败时必须保留检查点并提供「重试生成选题卡」入口，复用已完成阶段，只重跑失败及后续步骤，成功后自动回显。",
  "documents": "[审计待补](docs/research/2026-08-01-structured-ai-tool-reliability-audit.md)",
  "source_line": "|T-646|统一优化结构化 AI 工具为结果优先、分段生成与局部修复|🔨|—|待验|[审计待补](docs/research/2026-08-01-structured-ai-tool-reliability-audit.md)|逐个审计结构化 AI 工具的 schema 复杂度、单次模型职责、重试放大与失败语义；创作内容应先产出可用结果，再补全、校验和优化，非关键字段或增强步骤失败不得清空已有结果或触发整轮疯狂重试。内容雷达部分阶段失败时必须保留检查点并提供「重试生成选题卡」入口，复用已完成阶段，只重跑失败及后续步骤，成功后自动回显。|",
  "source_sha256": "85727ebeeeeb98d563c6f7a3264501111dfab934b34df4892430cab4df442259",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-d93f730a"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-645",
  "title": "收敛模型配置项并同步精简 Growth 渠道模板",
  "narrative": "[D]",
  "documents": "[SPEC](BACKLOG-details.md#t-645)  [SPEC](docs/superpowers/specs/2026-08-02-capability-scoped-channel-model-authority.md)",
  "source_line": "|T-645|收敛模型配置项并同步精简 Growth 渠道模板|🔨|PASS[REV:3367f027528e]|待验|[SPEC](BACKLOG-details.md#t-645)  [SPEC](docs/superpowers/specs/2026-08-02-capability-scoped-channel-model-authority.md)|[D]|",
  "source_sha256": "845d53c624b27c17e2c6fe45a49272a6aa0770cf05ab8a98d4d2e06669b4ac15",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-70b615a8"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-644",
  "title": "根治 CreatorOS macOS 客户端持续闪屏",
  "narrative": "基于当前安装包和本机实时日志区分 WebView 重载、前端异常重渲染、窗口重复创建或进程崩溃重启；锁定可复现触发源后修复，并验证页面稳定、数据不丢且不引入启动回归。",
  "documents": "既有桌面启动、sidecar 与 WebView 日志契约",
  "source_line": "|T-644|根治 CreatorOS macOS 客户端持续闪屏|🔨|—|待验|既有桌面启动、sidecar 与 WebView 日志契约|基于当前安装包和本机实时日志区分 WebView 重载、前端异常重渲染、窗口重复创建或进程崩溃重启；锁定可复现触发源后修复，并验证页面稳定、数据不丢且不引入启动回归。|",
  "source_sha256": "9dc7c8d6a28ac1a461111146c7beb298b2330867bb73799a953220b43f8fac09",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-8a738e74"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-643",
  "title": "收口 CreatorOS 为输入 Activity 激活码后直接授权，隐藏当前权益领取入口",
  "narrative": "当前只保留“输入激活码→Activity 校验/绑定/签名授权→本机保存→按 channelRef 拉配置”；不得要求用户登录 Growth、兑换商品或手动领取权益，既有 entitlement claim 代码暂不删除但退出导航、页面和当前发布验收。",
  "documents": "[跨仓唯一链路](/Users/zyongzhu/Workbase/Thirdspace-growth/docs/contracts/T-129-activation-code-single-flow.md)",
  "source_line": "|T-643|收口 CreatorOS 为输入 Activity 激活码后直接授权，隐藏当前权益领取入口|📋 待办|—|待验|[跨仓唯一链路](/Users/zyongzhu/Workbase/Thirdspace-growth/docs/contracts/T-129-activation-code-single-flow.md)|当前只保留“输入激活码→Activity 校验/绑定/签名授权→本机保存→按 channelRef 拉配置”；不得要求用户登录 Growth、兑换商品或手动领取权益，既有 entitlement claim 代码暂不删除但退出导航、页面和当前发布验收。|",
  "source_sha256": "d837729e349c4e3d303171f50d99251fe2c98a13f0068266aad39d36d72eafc2",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-263e8388"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-642",
  "title": "打通内容雷达对标文案→改写策略→选题卡→项目写稿的编导证据链",
  "narrative": "[D]",
  "documents": "[SPEC](docs/superpowers/specs/2026-08-01-content-radar-creative-handoff.md) · [SPEC](BACKLOG-details.md#t-642)",
  "source_line": "|T-642|打通内容雷达对标文案→改写策略→选题卡→项目写稿的编导证据链|🔨|PASS[REV:4ccb2dd450a1]|待验|[SPEC](docs/superpowers/specs/2026-08-01-content-radar-creative-handoff.md) · [SPEC](BACKLOG-details.md#t-642)|[D]|",
  "source_sha256": "5ada7b251760ea72798e74c5854bdfe0ea48a9627be3d20d5a17ad055b4b28e3",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-773cf294"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-641",
  "title": "根治发布中心“登录多日仍只有一个采集日、发布趋势不出曲线”",
  "narrative": "以真实账号日志和 `metric_snapshots` 为证据，核实定时作品指标采集是否逐日执行、按账号落库并被发布中心查询；多个采集日必须形成真实折线，单日继续诚实显示单点，禁止按登录天数伪造趋势。",
  "documents": "既有发布中心与抖音自动采集契约",
  "source_line": "|T-641|根治发布中心“登录多日仍只有一个采集日、发布趋势不出曲线”|🔨|—|待验|既有发布中心与抖音自动采集契约|以真实账号日志和 `metric_snapshots` 为证据，核实定时作品指标采集是否逐日执行、按账号落库并被发布中心查询；多个采集日必须形成真实折线，单日继续诚实显示单点，禁止按登录天数伪造趋势。|",
  "source_sha256": "30bf740515bb4bb4caf560a71bf04324c3ed2bad3c50f24ba7b0a02661d0fcd1",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-9588f3b0"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-640",
  "title": "配置 Apple Developer ID 签名与公证，并在前序修复全部闭环后统一产出本地安装包",
  "narrative": "Developer ID Application 私钥只存本机登录钥匙串，公证凭据只存 notarytool 钥匙串 profile；先完成 T-637/T-638/T-639 与既有安装包 Gate，再产出签名、公证、staple 且可通过 Gatekeeper 验证的 DMG，不把证书私钥、密码或 API Key 写进仓库和日志。",
  "documents": "[本次打包证据](orchestrator/GATE-T640-BUILD.md) · [T-575 测试发行与回滚](docs/handoffs/T-575-CreatorOS测试发行与回滚.md)",
  "source_line": "|T-640|配置 Apple Developer ID 签名与公证，并在前序修复全部闭环后统一产出本地安装包|🔨|—|待验|[本次打包证据](orchestrator/GATE-T640-BUILD.md) · [T-575 测试发行与回滚](docs/handoffs/T-575-CreatorOS测试发行与回滚.md)|Developer ID Application 私钥只存本机登录钥匙串，公证凭据只存 notarytool 钥匙串 profile；先完成 T-637/T-638/T-639 与既有安装包 Gate，再产出签名、公证、staple 且可通过 Gatekeeper 验证的 DMG，不把证书私钥、密码或 API Key 写进仓库和日志。|",
  "source_sha256": "40e83598264bfb1429e971011c2653295ec4ecf2f59071eb5a376219b2f06da7",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-42bfde45"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-635",
  "title": "把 CreatorOS 正式构建绑定到 Growth 商品的统一 `projectKey`，禁止运行时覆盖产品身份或关闭严格验签",
  "narrative": "[D]",
  "documents": "[SPEC](BACKLOG-details.md#t-635)  [SPEC](docs/superpowers/specs/2026-07-30-growth-product-identity-binding.md)",
  "source_line": "|T-635|把 CreatorOS 正式构建绑定到 Growth 商品的统一 `projectKey`，禁止运行时覆盖产品身份或关闭严格验签|🔨 本地实现待验|PASS[REV:80491a56d447]|待验|[SPEC](BACKLOG-details.md#t-635)  [SPEC](docs/superpowers/specs/2026-07-30-growth-product-identity-binding.md)|[D]|",
  "source_sha256": "2244d16bb072ccb09ddd8652d58f68f2f227677e77539dfc2cbf7019039ae1bd",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-c265ea13"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-633",
  "title": "恢复创作者中心自动扫码登录",
  "narrative": "首次扫码直接打开创作者中心二维码页并复用同一按账号登录态，不再把普通抖音首页当默认入口；内容雷达改写可用性已由 T-1017 单独承接。",
  "documents": "既有抖音登录契约",
  "source_line": "|T-633|恢复创作者中心自动扫码登录|🔨|—|待验|既有抖音登录契约|首次扫码直接打开创作者中心二维码页并复用同一按账号登录态，不再把普通抖音首页当默认入口；内容雷达改写可用性已由 T-1017 单独承接。|",
  "source_sha256": "63cb9276745da4df58ad2253109a3718fd479f9d5be193408f9b5cf0d1f8b39e",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-cc94857a"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-632",
  "title": "根治“新建定位母版”无效、历史母版无法恢复与逐字稿提取长时间无结果",
  "narrative": "新建定位母版须确认后直接清空当前定位并进入空白母版；重置前完整母版（画像、facets、五类规则、定位陈述）须形成不可变快照，历史恢复以追加新版本方式真实回写并刷新可读，绝不修改旧历史；旧版只留陈述、确实缺少画像快照的记录须诚实降级为“复制定位陈述”，不得假装完整恢复。按真实日志拆解逐字稿任务排队、媒体处理与模型调用耗时，修复阻塞且呈现诚实反馈。",
  "documents": "[GATE](orchestrator/GATE-T632-BUILD.md)",
  "source_line": "|T-632|根治“新建定位母版”无效、历史母版无法恢复与逐字稿提取长时间无结果|🔨|—|待验|[GATE](orchestrator/GATE-T632-BUILD.md)|新建定位母版须确认后直接清空当前定位并进入空白母版；重置前完整母版（画像、facets、五类规则、定位陈述）须形成不可变快照，历史恢复以追加新版本方式真实回写并刷新可读，绝不修改旧历史；旧版只留陈述、确实缺少画像快照的记录须诚实降级为“复制定位陈述”，不得假装完整恢复。按真实日志拆解逐字稿任务排队、媒体处理与模型调用耗时，修复阻塞且呈现诚实反馈。|",
  "source_sha256": "5f2dc35728ddedefe8e5d4608b1996fd18c778a30d37ad55c5caf31e9a45f0f1",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-8a39e97c"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-631",
  "title": "根治大视频上传被 10MB 截断并误报 ffmpeg 缺失",
  "narrative": "修复桌面本地 blob 大文件上传截断，complete 前校验声明大小与实际大小，并把 `moov atom not found` 等素材损坏错误与二进制缺失严格分流；聚焦回归后产出本地安装包。",
  "documents": "[既有视频执行 SPEC](docs/superpowers/specs/2026-07-11-execution-layer-video-pipeline-design.md)",
  "source_line": "|T-631|根治大视频上传被 10MB 截断并误报 ffmpeg 缺失|🔨|—|待验|[既有视频执行 SPEC](docs/superpowers/specs/2026-07-11-execution-layer-video-pipeline-design.md)|修复桌面本地 blob 大文件上传截断，complete 前校验声明大小与实际大小，并把 `moov atom not found` 等素材损坏错误与二进制缺失严格分流；聚焦回归后产出本地安装包。|",
  "source_sha256": "68b0be4100aee592c109538cc20f264a3236d503a65ebbe5a7d77d38d8ee15d4",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-ae067ea8"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-621",
  "title": "补齐渠道模型 authority snapshot 生产链路回归",
  "narrative": "补 `createTask → persistence → authority change → cancel/no provider call` 完整链路证据，不改变已确认契约。",
  "documents": "[绑定契约](docs/superpowers/specs/2026-07-29-creatoros-channel-model-authority.contract.md)",
  "source_line": "|T-621|补齐渠道模型 authority snapshot 生产链路回归|📋 待办|—|—|[绑定契约](docs/superpowers/specs/2026-07-29-creatoros-channel-model-authority.contract.md)|补 `createTask → persistence → authority change → cancel/no provider call` 完整链路证据，不改变已确认契约。|",
  "source_sha256": "407f58ea24d4fbe835433063e3dc09070b0a41156aba022a9b852f7578d0f3ed",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-f42ecf5a"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-576",
  "title": "统一跟进尚未关闭的飞书线上用户反馈",
  "narrative": "只负责新反馈分诊、进度同步和邮件闭环；故障实现由各自任务承接，未真机解决不得提前结案。",
  "documents": "[反馈表](https://my.feishu.cn/base/S1BRb4i6kaD0bnsViJSco0jxnRg?table=tblIPu0er91yGTwL&view=vewb4HsOUz)",
  "source_line": "|T-576|统一跟进尚未关闭的飞书线上用户反馈|🔨 免审|—|—|[反馈表](https://my.feishu.cn/base/S1BRb4i6kaD0bnsViJSco0jxnRg?table=tblIPu0er91yGTwL&view=vewb4HsOUz)|只负责新反馈分诊、进度同步和邮件闭环；故障实现由各自任务承接，未真机解决不得提前结案。|",
  "source_sha256": "e8aac499ecb5a0aedc479304db02159b85cc08bc0aee76987e9afe51f0cf2aad",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-d89f0b24"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-575",
  "title": "接通 CreatorOS 权益领取、渠道配置与问题反馈",
  "narrative": "本地链路已通过；待真实发布材料、live HTTPS 三仓 E2E、双平台凭据后端与正式发布许可。",
  "documents": "[SPEC](docs/superpowers/specs/2026-07-27-t076-creator-three-system-launch.md) · [Gate](orchestrator/GATE-T575-BUILD.md)",
  "source_line": "|T-575|接通 CreatorOS 权益领取、渠道配置与问题反馈|🔨 本地PASS·待生产E2E|—|待验|[SPEC](docs/superpowers/specs/2026-07-27-t076-creator-three-system-launch.md) · [Gate](orchestrator/GATE-T575-BUILD.md)|本地链路已通过；待真实发布材料、live HTTPS 三仓 E2E、双平台凭据后端与正式发布许可。|",
  "source_sha256": "5488cbf99829276ad4d3422cd7d1969955e23191b4b54d29b9357830e0db80b2",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-47b98654"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-562",
  "title": "根治 CreatorOS 0.2.0 Windows 安装后持续白屏",
  "narrative": "待真实启动链取证并修复 sidecar/WebView 导航；新包须通过安装后启动、health ready 与非白屏交互 Gate。",
  "documents": "[SPEC](docs/superpowers/specs/2026-07-23-desktop-packaging-first-launch-design.md) · [复盘](docs/research/2026-07-24-windows-first-launch-white-screen.md)",
  "source_line": "|T-562|根治 CreatorOS 0.2.0 Windows 安装后持续白屏|🔨 免审|—|待验|[SPEC](docs/superpowers/specs/2026-07-23-desktop-packaging-first-launch-design.md) · [复盘](docs/research/2026-07-24-windows-first-launch-white-screen.md)|待真实启动链取证并修复 sidecar/WebView 导航；新包须通过安装后启动、health ready 与非白屏交互 Gate。|",
  "source_sha256": "ab4b22690c4e67ed9a8a3937c6bf2be103a03a80504441e0f258340dc5d2c0f4",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-543820d1"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-548",
  "title": "根治视频渲染重试后成片脱离项目且制作页实时预览消失",
  "narrative": "重试 taskId 回传、项目/output/usage 幂等关联、export、内联预览恢复和图片 B-roll MIME 分流均已实现并通过聚焦测试；仅保留安装版真实渲染、成片回放与素材使用记录验收。",
  "documents": "[既有 T-292/T-254 规格](docs/superpowers/specs/2026-07-13-video-production-overhaul-design.md)",
  "source_line": "|T-548|根治视频渲染重试后成片脱离项目且制作页实时预览消失|🔨 待安装版真机|—|待验|[既有 T-292/T-254 规格](docs/superpowers/specs/2026-07-13-video-production-overhaul-design.md)|重试 taskId 回传、项目/output/usage 幂等关联、export、内联预览恢复和图片 B-roll MIME 分流均已实现并通过聚焦测试；仅保留安装版真实渲染、成片回放与素材使用记录验收。|",
  "source_sha256": "f2cca0596aaf879f19eeaec7020ec403bc4300ae9833eb758de224a006740296",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-23b9a3ec"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-538",
  "title": "接通渠道签名上下文的产品问题反馈",
  "narrative": "本地可信提交、失败保留和幂等重试已通过；待正式接口部署、发布 origin、真实激活码三系统 E2E 与独立复核。",
  "documents": "[契约](/Users/zyongzhu/Workbase/Thirdspace-growth/docs/contracts/channel-bound-product-feedback-v1.md) · [Gate](orchestrator/GATE-T538-BUILD.md)",
  "source_line": "|T-538|接通渠道签名上下文的产品问题反馈|🔨 本地PASS·待生产E2E|—|待验|[契约](/Users/zyongzhu/Workbase/Thirdspace-growth/docs/contracts/channel-bound-product-feedback-v1.md) · [Gate](orchestrator/GATE-T538-BUILD.md)|本地可信提交、失败保留和幂等重试已通过；待正式接口部署、发布 origin、真实激活码三系统 E2E 与独立复核。|",
  "source_sha256": "bd2f9d064bfb373f08a071fb24b3fdf1f724deea4a9f57d983fa19c1f75ba3cb",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-b695e745"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-536",
  "title": "根治“我的收藏”同步错误分类与浏览器档案锁恢复",
  "narrative": "代码已提交 `85312bd2`：跨 chunk 错误按稳定 code 恢复、无活 context 才精准清锁且只重试一次、诊断脱敏、UI 给恢复动作；定向 130 tests、typecheck、build、boundary 通过，待有效登录态做真实收藏只读验收。",
  "documents": "无 SPEC（既有收藏读取链故障）",
  "source_line": "|T-536|根治“我的收藏”同步错误分类与浏览器档案锁恢复|🔨 待真实账号只读验收|—|待验|无 SPEC（既有收藏读取链故障）|代码已提交 `85312bd2`：跨 chunk 错误按稳定 code 恢复、无活 context 才精准清锁且只重试一次、诊断脱敏、UI 给恢复动作；定向 130 tests、typecheck、build、boundary 通过，待有效登录态做真实收藏只读验收。|",
  "source_sha256": "5a64eb2ab73c8954d5d30fc1998998137363659d88b20d222ce5dc1a69bf8baf",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-d349f204"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-626",
  "title": "CreatorOS 多模型数组与 9 类能力选择【用户明确延期】",
  "narrative": "用户明确重启后再进入客户端消费与真调用 E2E。",
  "documents": "[绑定契约](docs/superpowers/specs/2026-07-29-creatoros-channel-model-authority.contract.md)",
  "source_line": "|T-626|CreatorOS 多模型数组与 9 类能力选择【用户明确延期】|⏸️|—|待验|[绑定契约](docs/superpowers/specs/2026-07-29-creatoros-channel-model-authority.contract.md)|用户明确重启后再进入客户端消费与真调用 E2E。|",
  "source_sha256": "4f871f422c6ccb147286e4f50b7732e12b16c3e060b41689007ab5b1ee9627eb",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-ac9ccee7"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-577",
  "title": "安装包缺 `sidecar.tar.gz`【用户明确忽略】",
  "narrative": "取得系统、版本与下载来源后重启。",
  "documents": "[反馈表](https://my.feishu.cn/base/S1BRb4i6kaD0bnsViJSco0jxnRg?table=tblIPu0er91yGTwL&view=vewb4HsOUz)",
  "source_line": "|T-577|安装包缺 `sidecar.tar.gz`【用户明确忽略】|⏸️|—|待验|[反馈表](https://my.feishu.cn/base/S1BRb4i6kaD0bnsViJSco0jxnRg?table=tblIPu0er91yGTwL&view=vewb4HsOUz)|取得系统、版本与下载来源后重启。|",
  "source_sha256": "1f40122956b3b447b0ae1a2b019baa563b5e1af5c2dd10b64c3b833d11eabedb",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-a5980cd9"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-565",
  "title": "Windows Runtime 原生 Burn/事务交付",
  "narrative": "原生 RAT 已通过；待 Round 2 复审、BUILD 与安装版 E2E。",
  "documents": "[SPEC](docs/superpowers/specs/2026-07-27-windows-runtime-delivery-burn-transaction.md) · [RAT](docs/research/2026-07-27-windows-native-burn-transaction-rat-evidence.md)",
  "source_line": "|T-565|Windows Runtime 原生 Burn/事务交付|⏸️|—|待验|[SPEC](docs/superpowers/specs/2026-07-27-windows-runtime-delivery-burn-transaction.md) · [RAT](docs/research/2026-07-27-windows-native-burn-transaction-rat-evidence.md)|原生 RAT 已通过；待 Round 2 复审、BUILD 与安装版 E2E。|",
  "source_sha256": "029d198611f1849cde5025d9fee91de842e922e4e5b3c9b17f2d4ad2072e2837",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-4ac7cc93"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-524",
  "title": "自媒体方法随包内置知识库",
  "narrative": "确认第三方内容商业改编和分发权。",
  "documents": "[详情](docs/tasks/T484.md#t-524)",
  "source_line": "|T-524|自媒体方法随包内置知识库|⏸️|—|待验|[详情](docs/tasks/T484.md#t-524)|确认第三方内容商业改编和分发权。|",
  "source_sha256": "93a3ccc67007e3ef362eb68d10c853b211f10c32f41d6fec4ea833bd70c64668",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-86960a9b"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-519",
  "title": "知识库文件工作区与用户知识底座",
  "narrative": "Round 3 major 清零并通过正式 Gate。",
  "documents": "[PLAN](docs/superpowers/specs/2026-07-26-knowledge-workspace-lean.md)",
  "source_line": "|T-519|知识库文件工作区与用户知识底座|⏸️|—|待验|[PLAN](docs/superpowers/specs/2026-07-26-knowledge-workspace-lean.md)|Round 3 major 清零并通过正式 Gate。|",
  "source_sha256": "49ef5eef6504bd079265013b2106663cd8c431e45e1ac674aacd16ea1d3d13dd",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-25bdaac4"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-525",
  "title": "旧 `.doc` 与扫描 PDF OCR",
  "narrative": "补足 20 份 `.doc`、OCR 语料和独立评审。",
  "documents": "[详情](docs/tasks/T484.md#t-525)",
  "source_line": "|T-525|旧 `.doc` 与扫描 PDF OCR|⏸️|—|待验|[详情](docs/tasks/T484.md#t-525)|补足 20 份 `.doc`、OCR 语料和独立评审。|",
  "source_sha256": "f1a0c25c90a18cd53ea07b358887a569c162e4ec08f8c6118df6d8d020db3660",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-f07f0403"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-517",
  "title": "CreatorOS 生产预设自动化底座",
  "narrative": "用户恢复范围并通过契约 Gate。",
  "documents": "[PLAN](docs/superpowers/specs/2026-07-26-creatoros-automation-kernel-minimal.md)",
  "source_line": "|T-517|CreatorOS 生产预设自动化底座|⏸️|—|待验|[PLAN](docs/superpowers/specs/2026-07-26-creatoros-automation-kernel-minimal.md)|用户恢复范围并通过契约 Gate。|",
  "source_sha256": "b41b7db2a64f5b8d8356f6defd45b1cde4d4c2009069b5544568bcb6ebd8614d",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-41f44984"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-516",
  "title": "设置内“AI 对我的理解”与账号健康检查【产品+架构·用户 2026-07-25/26】",
  "narrative": "自动扫描只做可证明的确定性问题；保留 AI 起草、用户确认/调整后经现有定位链保存，依赖 T-517 新 CONTRACT。",
  "documents": "[纠偏 PLAN](docs/superpowers/specs/2026-07-26-copilot-context-health-minimal.md) · [最终审计](docs/superpowers/specs/2026-07-26-overdesign-scope-reset.review.md)",
  "source_line": "|T-516|设置内“AI 对我的理解”与账号健康检查【产品+架构·用户 2026-07-25/26】|⏸️|—|待验|[纠偏 PLAN](docs/superpowers/specs/2026-07-26-copilot-context-health-minimal.md) · [最终审计](docs/superpowers/specs/2026-07-26-overdesign-scope-reset.review.md)|自动扫描只做可证明的确定性问题；保留 AI 起草、用户确认/调整后经现有定位链保存，依赖 T-517 新 CONTRACT。|",
  "source_sha256": "d181aa029037a4c99a578dc61a8b65eed93600a8bc35c7fe875200fbf39d120a",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-afbd216a"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-510",
  "title": "优化 Copilot 媒体工具编排",
  "narrative": "通过现有契约评审并恢复 BUILD。",
  "documents": "[PLAN](docs/superpowers/specs/2026-07-25-copilot-media-orchestration-replacement.md)",
  "source_line": "|T-510|优化 Copilot 媒体工具编排|⏸️|—|待验|[PLAN](docs/superpowers/specs/2026-07-25-copilot-media-orchestration-replacement.md)|通过现有契约评审并恢复 BUILD。|",
  "source_sha256": "b5dd5ff1ba5396b8a11f21a42758544346ccac2481e11026e97e089d4a366c02",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-1abded37"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-506",
  "title": "接入 growth 年卡购买与次年续费【商业化·用户 2026-0…",
  "narrative": "—",
  "documents": "[SPEC](docs/superpowers/specs/2026-07-24-annual-renewal-growth-integration.md) · [契约](docs/superpowers/specs/2026-07-24-annual-renewal-growth-integration.contract.md)",
  "source_line": "|T-506|接入 growth 年卡购买与次年续费【商业化·用户 2026-0…|⏸️|—|待验|[SPEC](docs/superpowers/specs/2026-07-24-annual-renewal-growth-integration.md) · [契约](docs/superpowers/specs/2026-07-24-annual-renewal-growth-integration.contract.md)|—|",
  "source_sha256": "e362d046f330e7d1061b0e0ee1cbd791c103bcd98dbdd9c9fb145765c0fc9ec1",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-ae5ef17d"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-502",
  "title": "T-496 退回 PLAN 重做：收藏来源自由选择任一已绑定账号 + 双账号只读 RAT【产品+验证·用户授权 2026-07-24】",
  "narrative": "—",
  "documents": "上游为 [T-496 FAIL SPEC](../superpowers/specs/2026-07-24-favorites-collector-account-selector-design.md) 与 [三轮评审](../superpowers/specs/2026-07-24-favorites-collector-account-selector-design.review.md)；[只读 RAT](../research/2026-07-24-favorites-dual-account-readonly-rat.md) 通过后创建 replacement PLAN SPEC，不能继续原地磨第三轮失败工件",
  "source_line": "|T-502|T-496 退回 PLAN 重做：收藏来源自由选择任一已绑定账号 + 双账号只读 RAT【产品+验证·用户授权 2026-07-24】|⏸️|—|待验|上游为 [T-496 FAIL SPEC](../superpowers/specs/2026-07-24-favorites-collector-account-selector-design.md) 与 [三轮评审](../superpowers/specs/2026-07-24-favorites-collector-account-selector-design.review.md)；[只读 RAT](../research/2026-07-24-favorites-dual-account-readonly-rat.md) 通过后创建 replacement PLAN SPEC，不能继续原地磨第三轮失败工件|—|",
  "source_sha256": "de9c5ca2bba778b731fcf29fc6e80d7f71390fd9db30c89527e5ef13ec807829",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-7b9ec376"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-497",
  "title": "用户知识库受控检索与脚本引用设计：大语料、质量差异、权威资料支配风险【产品设计·用户 2026-07-24】",
  "narrative": "—",
  "documents": "[SPEC](../superpowers/specs/2026-07-24-controlled-knowledge-retrieval-design.md) · [REVIEW](../superpowers/specs/2026-07-24-controlled-knowledge-retrieval-design.review.md)",
  "source_line": "|T-497|用户知识库受控检索与脚本引用设计：大语料、质量差异、权威资料支配风险【产品设计·用户 2026-07-24】|⏸️|—|待验|[SPEC](../superpowers/specs/2026-07-24-controlled-knowledge-retrieval-design.md) · [REVIEW](../superpowers/specs/2026-07-24-controlled-knowledge-retrieval-design.review.md)|—|",
  "source_sha256": "ab3017a8048b42e12c0db8997c871fb8cfbaf2949b9d3ce2376a81a4ce4ee13b",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-1c9e62c1"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-451",
  "title": "【防逆向优化 D-④·战略层·合并 T-447】把 license verdict 判定+启动 magic 一起搬进 Rust:壳启动跑 verdict → 仅 allowed=true 才 Ed25519 签 verdict-bound handshake token(machineId+expiresAt+port+nonce)→ sidecar 校验通过才 listen【安全·用户 2026-07-21 拍板 D. 全上,方案 B】",
  "narrative": "—",
  "documents": "[SPEC](docs/superpowers/specs/2026-07-21-license-verdict-native-verdict-design.md) · [review](docs/superpowers/specs/2026-07-21-license-verdict-native-verdict-design.review.md)",
  "source_line": "|T-451|【防逆向优化 D-④·战略层·合并 T-447】把 license verdict 判定+启动 magic 一起搬进 Rust:壳启动跑 verdict → 仅 allowed=true 才 Ed25519 签 verdict-bound handshake token(machineId+expiresAt+port+nonce)→ sidecar 校验通过才 listen【安全·用户 2026-07-21 拍板 D. 全上,方案 B】|⏸️|—|待验|[SPEC](docs/superpowers/specs/2026-07-21-license-verdict-native-verdict-design.md) · [review](docs/superpowers/specs/2026-07-21-license-verdict-native-verdict-design.review.md)|—|",
  "source_sha256": "c57d33e638bfbaf28cd77df3f0d7447af2c9f01b1342caf17210b281dc1f83ba",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-549fd118"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-449",
  "title": "~~【防逆向优化 D-②】Windows 直装 sidecar 目录 ACL 收紧~~ **调研结论=撤销:施工无收益**",
  "narrative": "—",
  "documents": "[调研归档](docs/research/2026-07-21-t449-windows-acl-hardening-research.md)(重要发现留存,若未来切 `perMachine` 时立即启用)",
  "source_line": "|T-449|~~【防逆向优化 D-②】Windows 直装 sidecar 目录 ACL 收紧~~ **调研结论=撤销:施工无收益**|⏸️|—|待验|[调研归档](docs/research/2026-07-21-t449-windows-acl-hardening-research.md)(重要发现留存,若未来切 `perMachine` 时立即启用)|—|",
  "source_sha256": "1a9478e3ad19d4f1c2442934c9513fe14af0ddd83d384bea5acf695978314f1d",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-f97798bb"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-448",
  "title": "【防逆向优化 D-①-b】sidecar 内父进程/magic 自检",
  "narrative": "—",
  "documents": "[调研·打包与防逆向优化](docs/research/2026-07-21-packaging-and-anti-reversing-optimization-research.md) §4.1 (c)",
  "source_line": "|T-448|【防逆向优化 D-①-b】sidecar 内父进程/magic 自检|⏸️|—|待验|[调研·打包与防逆向优化](docs/research/2026-07-21-packaging-and-anti-reversing-optimization-research.md) §4.1 (c)|—|",
  "source_sha256": "fd3f27c145a540dff31528c487cd965d78d85707264717181ebfe26134e80e70",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-f7451a90"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-433 S2",
  "title": "gate-F5 升两级优先串行闸(并发仍=1):明细类(self.metrics/self.detail)高优 > 封面/逐字稿/重建低优;封面等从 self.detail 尾内联拆独立低优 run【T-433 切片·SPEC §2.2】",
  "narrative": "—",
  "documents": "[SPEC §2.2](docs/superpowers/specs/2026-07-19-multi-account-collection-speedup-design.md)",
  "source_line": "|T-433 S2|gate-F5 升两级优先串行闸(并发仍=1):明细类(self.metrics/self.detail)高优 > 封面/逐字稿/重建低优;封面等从 self.detail 尾内联拆独立低优 run【T-433 切片·SPEC §2.2】|⏸️|—|待验|[SPEC §2.2](docs/superpowers/specs/2026-07-19-multi-account-collection-speedup-design.md)|—|",
  "source_sha256": "83c1a0995a34869c893578643fdea9d555804f8cd89e0d6fff1bdf354d7c7d28",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-6dd2d96f"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-433 S4",
  "title": "排队进度可见:job_run 加真 `queued` 态(createRun 落 queued,runner markRunning 转 running)+ 任务中心显「排队 N/当前 X/限流剩 Ys」+ 限流横幅按真 channel 归类(iesdouyin 也显)+ sweep 兼容 queued 超时【T-433 切片·SPEC §2.4】",
  "narrative": "—",
  "documents": "[SPEC §2.4](docs/superpowers/specs/2026-07-19-multi-account-collection-speedup-design.md)",
  "source_line": "|T-433 S4|排队进度可见:job_run 加真 `queued` 态(createRun 落 queued,runner markRunning 转 running)+ 任务中心显「排队 N/当前 X/限流剩 Ys」+ 限流横幅按真 channel 归类(iesdouyin 也显)+ sweep 兼容 queued 超时【T-433 切片·SPEC §2.4】|⏸️|—|待验|[SPEC §2.4](docs/superpowers/specs/2026-07-19-multi-account-collection-speedup-design.md)|—|",
  "source_sha256": "2693461c9ddbbb4e201c69ba9a5f6ef9b452e1ad8d6d8e956559d60246866453",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-8bec4b55"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-433 S5",
  "title": "(可选)benchmark/darkhorse 加已知 awemeId early-stop 增量(同 self.metrics T-177);**self.detail 不做**(整表 xlsx 单次导出增量收益低)【T-433 切片·SPEC §2.5】",
  "narrative": "—",
  "documents": "[SPEC §2.5](docs/superpowers/specs/2026-07-19-multi-account-collection-speedup-design.md)",
  "source_line": "|T-433 S5|(可选)benchmark/darkhorse 加已知 awemeId early-stop 增量(同 self.metrics T-177);**self.detail 不做**(整表 xlsx 单次导出增量收益低)【T-433 切片·SPEC §2.5】|⏸️|—|待验|[SPEC §2.5](docs/superpowers/specs/2026-07-19-multi-account-collection-speedup-design.md)|—|",
  "source_sha256": "c36e3bab65acbc350fd248cd49a6e674c0aab58f68b3fb3486ccbc27199de81e",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-ef5ea230"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-426",
  "title": "Windows 真机装完打开白屏「127.0.0.1 拒绝连接 / ERR_CONNECTION_REFUSED」= sidecar server 未监听端口【bug·真机·阻断·用户 2026-07-19 阿里云无影 Win】",
  "narrative": "—",
  "documents": "[SPEC §10/§12](docs/superpowers/specs/2026-07-17-license-hardening-and-dual-platform-design.md)",
  "source_line": "|T-426|Windows 真机装完打开白屏「127.0.0.1 拒绝连接 / ERR_CONNECTION_REFUSED」= sidecar server 未监听端口【bug·真机·阻断·用户 2026-07-19 阿里云无影 Win】|⏸️|—|待验|[SPEC §10/§12](docs/superpowers/specs/2026-07-17-license-hardening-and-dual-platform-design.md)|—|",
  "source_sha256": "3d24f3590e89a214600cd3a2fe7de958447bda5a062e9e73c12558e4bd97d63f",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-4e877f7a"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-425W",
  "title": "Windows 安装器 WebView2 离线化:`tauri.w…",
  "narrative": "—",
  "documents": "[D](docs/tasks/T484.md#t-425w)",
  "source_line": "|T-425W|Windows 安装器 WebView2 离线化:`tauri.w…|⏸️|—|待验|[D](docs/tasks/T484.md#t-425w)|—|",
  "source_sha256": "8a5d5fa67c8e2beba5841ccf2078458cb061d7e610c878a8298d22cb79be47e9",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-25e9d319"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-413",
  "title": "上线前防逆向/防盗版落地(两新方案文档落地 + 现有 T-391/T-399/T-392 对账去重)【安全·用户 2026-07-18 /goal】",
  "narrative": "—",
  "documents": "[defense-ladder](docs/research/2026-07-18-anti-reversing-defense-ladder-design.md) · [t399-deception](docs/research/2026-07-18-t399-ai-targeted-deception-design.md)",
  "source_line": "|T-413|上线前防逆向/防盗版落地(两新方案文档落地 + 现有 T-391/T-399/T-392 对账去重)【安全·用户 2026-07-18 /goal】|⏸️|—|待验|[defense-ladder](docs/research/2026-07-18-anti-reversing-defense-ladder-design.md) · [t399-deception](docs/research/2026-07-18-t399-ai-targeted-deception-design.md)|—|",
  "source_sha256": "e4c52de02637e03d038172d575b2df658b68dc78489ba6b71db7f4b58076a3ff",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-a3deeebb"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-417",
  "title": "L1 字符串加密补齐:chunks/ 的 prompt/端点 rc4 stringArray(**turbopack 白名单排除·必真机冒烟**)+ chunk 名哈希 + manifest/CI 绝对路径脱敏 + 热点函数 opaque predicate(吸收旧 T-399c)",
  "narrative": "—",
  "documents": "[ladder §3 L1](docs/research/2026-07-18-anti-reversing-defense-ladder-design.md)",
  "source_line": "|T-417|L1 字符串加密补齐:chunks/ 的 prompt/端点 rc4 stringArray(**turbopack 白名单排除·必真机冒烟**)+ chunk 名哈希 + manifest/CI 绝对路径脱敏 + 热点函数 opaque predicate(吸收旧 T-399c)|⏸️|—|待验|[ladder §3 L1](docs/research/2026-07-18-anti-reversing-defense-ladder-design.md)|—|",
  "source_sha256": "33eb19bd662e65584e56795370dd496bef61d6693191b85874c8a37290963604",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-40cc239f"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-418",
  "title": "L2 sidecar 加密落盘:tar AES-256-GCM(build 时)+ Rust 运行时解密到 RAM disk 拉起(key 走 keychain 派生绝不落盘)",
  "narrative": "—",
  "documents": "[ladder §4 L2](docs/research/2026-07-18-anti-reversing-defense-ladder-design.md)",
  "source_line": "|T-418|L2 sidecar 加密落盘:tar AES-256-GCM(build 时)+ Rust 运行时解密到 RAM disk 拉起(key 走 keychain 派生绝不落盘)|⏸️|—|待验|[ladder §4 L2](docs/research/2026-07-18-anti-reversing-defense-ladder-design.md)|—|",
  "source_sha256": "36df613eee4e68bcaccd71fe3451dc375a62489bbe8c253dae0b638a36c68a85",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-938539f8"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-420",
  "title": "L4 皇冠函数 napi-rs 原生化(2-3 个;**授权终判已在 Rust 无需重做,半个 L4 已做**)",
  "narrative": "—",
  "documents": "[ladder §6 L4](docs/research/2026-07-18-anti-reversing-defense-ladder-design.md)",
  "source_line": "|T-420|L4 皇冠函数 napi-rs 原生化(2-3 个;**授权终判已在 Rust 无需重做,半个 L4 已做**)|⏸️|—|待验|[ladder §6 L4](docs/research/2026-07-18-anti-reversing-defense-ladder-design.md)|—|",
  "source_sha256": "0960dc83a8689505b579c6ea467e041c93cb074da1e93ac506583518968a02d6",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-67524619"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-399",
  "title": "反 AI 破解欺骗层调研+方案【调研·防逆向下一层·用户 2026-07-18 口述】",
  "narrative": "—",
  "documents": "[research](docs/research/2026-07-18-anti-ai-cracking-deception-research.md)",
  "source_line": "|T-399|反 AI 破解欺骗层调研+方案【调研·防逆向下一层·用户 2026-07-18 口述】|⏸️|—|待验|[research](docs/research/2026-07-18-anti-ai-cracking-deception-research.md)|—|",
  "source_sha256": "670202de7c7d278922f90dc8b23dc800f75cd95bd08e08afe5c8c21bf3fffed4",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-b5bba456"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-399c",
  "title": "反破解欺骗片3:D3 严格不可达迷宫 + D4 量化污染(诱饵占比≥40%)+ §4.2 性能预算基线(运行时误差内无退化+包体≤+5%)+ §4.3 盲测有效性框架(control/decoy 各≥8轮·真门定位+≥50%·Mann-Whitney p<0.05·必测 chunk 整排除·裁 Class A 存活+校准X/Y)【安全·SPEC §7 拆片】",
  "narrative": "—",
  "documents": "[SPEC §4](docs/superpowers/specs/2026-07-18-anti-ai-deception-maze-design.md)",
  "source_line": "|T-399c|反破解欺骗片3:D3 严格不可达迷宫 + D4 量化污染(诱饵占比≥40%)+ §4.2 性能预算基线(运行时误差内无退化+包体≤+5%)+ §4.3 盲测有效性框架(control/decoy 各≥8轮·真门定位+≥50%·Mann-Whitney p<0.05·必测 chunk 整排除·裁 Class A 存活+校准X/Y)【安全·SPEC §7 拆片】|⏸️|—|待验|[SPEC §4](docs/superpowers/specs/2026-07-18-anti-ai-deception-maze-design.md)|—|",
  "source_sha256": "bee512ecdab7957f4122f9126b9d61d24b6495c90cf60c5eb1557345d2f20c15",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-c46b1f56"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-409",
  "title": "创作包只读导出端点(供 ArticleOS 拉取)【跨仓需求·ArticleOS 2026-07-18 立项,用户已签核 DEC-012/020】",
  "narrative": "—",
  "documents": "契约:`~/Workbase/Thirdspace-article/docs/specs/2026-07-18-creation-packet-contract-v0.2.md`",
  "source_line": "|T-409|创作包只读导出端点(供 ArticleOS 拉取)【跨仓需求·ArticleOS 2026-07-18 立项,用户已签核 DEC-012/020】|⏸️|—|待验|契约:`~/Workbase/Thirdspace-article/docs/specs/2026-07-18-creation-packet-contract-v0.2.md`|—|",
  "source_sha256": "8b3168ba2c52f829d3ed890ae666c751e714055ee8d2c1835578e6b262fd3c7c",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-d57fcc45"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-372 W-spike",
  "title": "双端地基 spike(先行):Win 系统 tar.exe(bsdtar)对 pnpm symlink/junction 打包-解压保真 + cpSync(verbatimSymlinks) junction 行为 + obfuscate isSymlinkEscape junction 判定,出 spike 报告归 docs/research/",
  "narrative": "—",
  "documents": "[SPEC §11.2](docs/superpowers/specs/2026-07-17-license-hardening-and-dual-platform-design.md)",
  "source_line": "|T-372 W-spike|双端地基 spike(先行):Win 系统 tar.exe(bsdtar)对 pnpm symlink/junction 打包-解压保真 + cpSync(verbatimSymlinks) junction 行为 + obfuscate isSymlinkEscape junction 判定,出 spike 报告归 docs/research/|⏸️|—|待验|[SPEC §11.2](docs/superpowers/specs/2026-07-17-license-hardening-and-dual-platform-design.md)|—|",
  "source_sha256": "def10e6e490b3ef636c65fcf01dfe6ea1d3635569f7662eaba9e84be04396030",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-2180e53c"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-372 W-ci",
  "title": "GitHub Actions matrix(macos-latest+windows-latest)跑 tauri-action `tauri build` 出双端安装包 + updater artifact 双端 latest.json 合并 + 内测不签名如实标 signed:false + Windows 真机四主链(扫码/转录/渲染/更新)回归 + DEC-W 退出后同步宪法 §2.3/§16/§17+R-DESKTOP",
  "narrative": "—",
  "documents": "[SPEC §10/§12](docs/superpowers/specs/2026-07-17-license-hardening-and-dual-platform-design.md)",
  "source_line": "|T-372 W-ci|GitHub Actions matrix(macos-latest+windows-latest)跑 tauri-action `tauri build` 出双端安装包 + updater artifact 双端 latest.json 合并 + 内测不签名如实标 signed:false + Windows 真机四主链(扫码/转录/渲染/更新)回归 + DEC-W 退出后同步宪法 §2.3/§16/§17+R-DESKTOP|⏸️|—|待验|[SPEC §10/§12](docs/superpowers/specs/2026-07-17-license-hardening-and-dual-platform-design.md)|—|",
  "source_sha256": "182dbe4ba839dfd790b5bc2810f4cb5dd98e6e724b8d0ca37a4781c07a6208c8",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-eeeb53ba"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-391 H-econ",
  "title": "破解经济学(短板兜底·**后续波次·依赖 L1s 服务端·非本仓·不阻塞内测**):更新强绑授权(过期/吊销拒发更新→patch 版冻结)+ 服务端异常激活遥测(同码多机/指纹漂移/时钟回拨/心跳缺失)→吊销 + 周期复验降级而非 kill。契约复用 T-372 L1s(SPEC §10.5)。",
  "narrative": "—",
  "documents": "[SPEC §10/§10.5/§15](docs/superpowers/specs/2026-07-17-native-hardening-and-encrypted-logging-design.md)",
  "source_line": "|T-391 H-econ|破解经济学(短板兜底·**后续波次·依赖 L1s 服务端·非本仓·不阻塞内测**):更新强绑授权(过期/吊销拒发更新→patch 版冻结)+ 服务端异常激活遥测(同码多机/指纹漂移/时钟回拨/心跳缺失)→吊销 + 周期复验降级而非 kill。契约复用 T-372 L1s(SPEC §10.5)。|⏸️|—|待验|[SPEC §10/§10.5/§15](docs/superpowers/specs/2026-07-17-native-hardening-and-encrypted-logging-design.md)|—|",
  "source_sha256": "31842044b0b488a4806392467253e863a65fe3a6fc9c2a62927782f48378c40d",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-bf83cf8b"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-393",
  "title": "稿面审核状态不刷新:脚本改后重新审核完成,横幅仍说「脚本已改动,当前稿未重新审核」;「先去审核」跳到文案编辑框而非审核卡【bug·真机·用户 2026-07-18】",
  "narrative": "—",
  "documents": "—",
  "source_line": "|T-393|稿面审核状态不刷新:脚本改后重新审核完成,横幅仍说「脚本已改动,当前稿未重新审核」;「先去审核」跳到文案编辑框而非审核卡【bug·真机·用户 2026-07-18】|⏸️|—|待验|—|—|",
  "source_sha256": "a86336ce63cab59666c80ad20a8609ddfafbbb57dba07d26a417f970fc3bc693",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-7acbd0e1"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-401",
  "title": "配置备份导出/导入报 `forbidden: request must originate from the local application`【bug·真机·用户 2026-07-18】",
  "narrative": "—",
  "documents": "—",
  "source_line": "|T-401|配置备份导出/导入报 `forbidden: request must originate from the local application`【bug·真机·用户 2026-07-18】|⏸️|—|待验|—|—|",
  "source_sha256": "07b0aacb9e7582c8b802d5ac7b32744e1adfa770d059d7f640524c0ae4381928",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-8298d6d7"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-406",
  "title": "腾讯云 CDN 藏源站 IP + 挡 DDoS + WAF/限流(license.aitongban.cloud / creatoros.aitongban.cloud)【运维·安全·用户 2026-07-18 认可】",
  "narrative": "—",
  "documents": "—",
  "source_line": "|T-406|腾讯云 CDN 藏源站 IP + 挡 DDoS + WAF/限流(license.aitongban.cloud / creatoros.aitongban.cloud)【运维·安全·用户 2026-07-18 认可】|⏸️|—|待验|—|—|",
  "source_sha256": "8614c89212fcce85782581bd928f58d908a59527ac413a374c54f345d7ba1a56",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-79fcf529"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-407",
  "title": "盲预测深结合历史战绩:建「历史战绩画像」(完播/CTR/播放中位数分布+爆款vs哑弹模式蒸馏)喂进预测 grounding + 飞轮做实(发布后复盘拉真数据→偏差回流精炼画像/校准 rubric)【功能·设计·用户 2026-07-18】",
  "narrative": "—",
  "documents": "—",
  "source_line": "|T-407|盲预测深结合历史战绩:建「历史战绩画像」(完播/CTR/播放中位数分布+爆款vs哑弹模式蒸馏)喂进预测 grounding + 飞轮做实(发布后复盘拉真数据→偏差回流精炼画像/校准 rubric)【功能·设计·用户 2026-07-18】|⏸️|—|待验|—|—|",
  "source_sha256": "652995c98ed5c87898d1ff9d71e9b878c9c17372e06859f7675beac0452487df",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-ddc0199c"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-396",
  "title": "渠道化(代理白标)链接 + 更新分发改造【需求·商业模型·用户 2026-07-18 口述,方案当日认可,开工认可 2026-07-18】",
  "narrative": "—",
  "documents": "[SPEC](docs/superpowers/specs/2026-07-18-channel-links-and-update-distribution-design.md)",
  "source_line": "|T-396|渠道化(代理白标)链接 + 更新分发改造【需求·商业模型·用户 2026-07-18 口述,方案当日认可,开工认可 2026-07-18】|⏸️|—|待验|[SPEC](docs/superpowers/specs/2026-07-18-channel-links-and-update-distribution-design.md)|—|",
  "source_sha256": "0fba41c339d49acb28625401bbefcba1d82a03eab3411953bddabb8cc62d3ac7",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-14a9da1d"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-398",
  "title": "scheduler 启动清僵尸 ai_task 报 AccountRequiredError(ai.markFailed 需 ctx.accountId,后台调度无账号上下文)【bug·账号隔离回归·日志实证 2026-07-18】",
  "narrative": "—",
  "documents": "—",
  "source_line": "|T-398|scheduler 启动清僵尸 ai_task 报 AccountRequiredError(ai.markFailed 需 ctx.accountId,后台调度无账号上下文)【bug·账号隔离回归·日志实证 2026-07-18】|⏸️|—|待验|—|—|",
  "source_sha256": "2cc05c19c159c3937c77f7633ef697fb96dd4723fc837a0bafbd514c4b68ff7b",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-d6bb6819"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-366c",
  "title": "G3 · 真机验收:上传成品→发布走通;导出 zip 解开含全素材+可读编导说明+诚实标注非剪映工程,与其他批次同批重打包验",
  "narrative": "—",
  "documents": "[SPEC §7](docs/superpowers/specs/2026-07-17-video-stage-three-paths-and-material-export-design.md)",
  "source_line": "|T-366c|G3 · 真机验收:上传成品→发布走通;导出 zip 解开含全素材+可读编导说明+诚实标注非剪映工程,与其他批次同批重打包验|⏸️|—|待验|[SPEC §7](docs/superpowers/specs/2026-07-17-video-stage-three-paths-and-material-export-design.md)|—|",
  "source_sha256": "bceda24d6a7c4454344fb879516e1c9c433c399daa199a53c127f300c4f5625a",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-e6602149"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-361",
  "title": "素材视觉模型自动打标签:接 model-config 视觉 capability,上传/采集后自动识别画面内容打标(替代现文件名启发式的增强层)【功能·素材·用户 2026-07-16 提出】",
  "narrative": "—",
  "documents": "—",
  "source_line": "|T-361|素材视觉模型自动打标签:接 model-config 视觉 capability,上传/采集后自动识别画面内容打标(替代现文件名启发式的增强层)【功能·素材·用户 2026-07-16 提出】|⏸️|—|待验|—|—|",
  "source_sha256": "481f4053910eee3756d9058417ce3e9d876aa0c461324aecf26545eb3e229694",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-4d277a38"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-352",
  "title": "Windows 双端打包(独立工程)【发布·用户 2026-07-16】",
  "narrative": "用户 2026-07-16 拍板单立;曾问「买云主机当构建机是否可行」=可行且是第一步,但非全部(还需打包链移植+证书)。",
  "documents": "—",
  "source_line": "|T-352|Windows 双端打包(独立工程)【发布·用户 2026-07-16】|⏸️|—|待验|—|用户 2026-07-16 拍板单立;曾问「买云主机当构建机是否可行」=可行且是第一步,但非全部(还需打包链移植+证书)。|",
  "source_sha256": "0532f5f428a103b0b1fbd76c9784dbbbe1bafc1250f09011936429d69353d0b4",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-7c7a1f9b"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-320c",
  "title": "剪辑质量:视频信息卡避让底部字幕带(place() 纵向溢出策略)【T-320b 残留·独立】",
  "narrative": "—",
  "documents": "[剪辑管线报告](docs/research/2026-07-14-video-editing-pipeline-gaps-research.md)",
  "source_line": "|T-320c|剪辑质量:视频信息卡避让底部字幕带(place() 纵向溢出策略)【T-320b 残留·独立】|⏸️|—|待验|[剪辑管线报告](docs/research/2026-07-14-video-editing-pipeline-gaps-research.md)|—|",
  "source_sha256": "5b996c4f9334130a78e5df31b5db8329d1e2fc157c58eb2ea47061bf65c1aacb",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-4397061b"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-350c",
  "title": "S3 · 真机验收:重打包/dev 真跑 AC-1~5(MiniMax 下走通不 cancelled、含营销词自动改合规、采纳后 publishPack 出真物料+publications 出 douyin 行),诚实记残留(真封面图缺口)",
  "narrative": "—",
  "documents": "[SPEC §6](docs/superpowers/specs/2026-07-15-publish-package-in-script-tab-design.md)",
  "source_line": "|T-350c|S3 · 真机验收:重打包/dev 真跑 AC-1~5(MiniMax 下走通不 cancelled、含营销词自动改合规、采纳后 publishPack 出真物料+publications 出 douyin 行),诚实记残留(真封面图缺口)|⏸️|—|待验|[SPEC §6](docs/superpowers/specs/2026-07-15-publish-package-in-script-tab-design.md)|—|",
  "source_sha256": "a3a015cd9fb27f74a9ea5ebaa87903bdc1774f15dd3443a91ef66625bfc1453c",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-c7bbfa83"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-351",
  "title": "审核能力单一真值化:审核 SOP 从各生成模板抽出→收进**产品级数据**(review_rules 或产品知识库,**非个人 ThirdSpace**)+ 审核做成独立可复用 skill 读它【重构·正交·用户 2026-07-15】",
  "narrative": "—",
  "documents": "—",
  "source_line": "|T-351|审核能力单一真值化:审核 SOP 从各生成模板抽出→收进**产品级数据**(review_rules 或产品知识库,**非个人 ThirdSpace**)+ 审核做成独立可复用 skill 读它【重构·正交·用户 2026-07-15】|⏸️|—|待验|—|—|",
  "source_sha256": "d9791ac55c8125f3b882f61c4a73b74a65bf7a7abb6668a5395464cf0e0d844e",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-f821f784"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-349d",
  "title": "S4 · 真机验收:AC-1~5(对标抓稿+幂等复用/图集 skip 诚实/已发布关已有 artifact 展示/纯发布记录抓取/无批量入口·单条失败不连坐),与 T-350c 可同批重打包验",
  "narrative": "—",
  "documents": "[SPEC §5](docs/superpowers/specs/2026-07-15-transcript-fetch-two-surfaces-design.md)",
  "source_line": "|T-349d|S4 · 真机验收:AC-1~5(对标抓稿+幂等复用/图集 skip 诚实/已发布关已有 artifact 展示/纯发布记录抓取/无批量入口·单条失败不连坐),与 T-350c 可同批重打包验|⏸️|—|待验|[SPEC §5](docs/superpowers/specs/2026-07-15-transcript-fetch-two-surfaces-design.md)|—|",
  "source_sha256": "d1357ebb76cb6255e1b75cd0133726ebb183e3b1a1e37a9ee143f2c9232c2ad6",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-5a63297f"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-339",
  "title": "frontend lint 债务清零:全仓 eslint 2461 errors(历史累积),分簇清完后把 verify.yml 的 lint 步骤从 continue-on-error 改回硬门",
  "narrative": "—",
  "documents": ".github/workflows/verify.yml lint 步",
  "source_line": "|T-339|frontend lint 债务清零:全仓 eslint 2461 errors(历史累积),分簇清完后把 verify.yml 的 lint 步骤从 continue-on-error 改回硬门|⏸️|—|待验|.github/workflows/verify.yml lint 步|—|",
  "source_sha256": "888fe8ebbbded62689285fbff05f9cd8e43a06d6c46133c1f1752af9ca3392da",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-dbd6a414"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-328",
  "title": "修 T-326 上线审计 bug(4 Blocker/26 High/22 Medium/1 Low)→ 重打包【用户 /goal·2026-07-15】",
  "narrative": "—",
  "documents": "[审计报告](docs/research/2026-07-15-prelaunch-full-engineering-data-audit-research.md)",
  "source_line": "|T-328|修 T-326 上线审计 bug(4 Blocker/26 High/22 Medium/1 Low)→ 重打包【用户 /goal·2026-07-15】|⏸️|—|待验|[审计报告](docs/research/2026-07-15-prelaunch-full-engineering-data-audit-research.md)|—|",
  "source_sha256": "b3777c41a0338b3ce2beb93e8ef35f057e019c48ce8e207546a34dd4808d09cb",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-4265f429"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-332R",
  "title": "追溯登记补账:API-*/TEST-* 回登 ID_REGISTR…",
  "narrative": "—",
  "documents": "[D](docs/tasks/T484.md#t-332r)",
  "source_line": "|T-332R|追溯登记补账:API-*/TEST-* 回登 ID_REGISTR…|⏸️|—|待验|[D](docs/tasks/T484.md#t-332r)|—|",
  "source_sha256": "21a0900076e9e54ac66c239669771d1be2f19ce0f7f48455eb5fd2dde5badb18",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-aeab217d"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-336",
  "title": "技能配置页诚实化 + 「我的叮嘱」可视化:①下架/弃用僵尸 skill `knowledge.classify`(runner+route 活着但全仓零 UI 调用,distill 已替代,用户改它永不生效)②补 9 个缺中文词表的活 skill(benchmark.teardown/favorites.triage/topic.preference/topic.attribution/trend.extract/video.broll·cards·scenes·subtitles,现裸显英文 id+用途空白)③已定制 skill 给「出厂版↔我的版」diff 视图 ④用户定制条目化成「我的叮嘱」列表(每条:内容/来源对话/作用域/单条启停删)+版本时间线回滚 ⑤产物侧「本次应用了你的 N 条叮嘱」生效证明 ⑥修 skill-config-overrides.ts 过时「18 个」注释(实 34)【检查报告已出·用户 2026-07-15·先不写代码】",
  "narrative": "—",
  "documents": "—",
  "source_line": "|T-336|技能配置页诚实化 + 「我的叮嘱」可视化:①下架/弃用僵尸 skill `knowledge.classify`(runner+route 活着但全仓零 UI 调用,distill 已替代,用户改它永不生效)②补 9 个缺中文词表的活 skill(benchmark.teardown/favorites.triage/topic.preference/topic.attribution/trend.extract/video.broll·cards·scenes·subtitles,现裸显英文 id+用途空白)③已定制 skill 给「出厂版↔我的版」diff 视图 ④用户定制条目化成「我的叮嘱」列表(每条:内容/来源对话/作用域/单条启停删)+版本时间线回滚 ⑤产物侧「本次应用了你的 N 条叮嘱」生效证明 ⑥修 skill-config-overrides.ts 过时「18 个」注释(实 34)【检查报告已出·用户 2026-07-15·先不写代码】|⏸️|—|待验|—|—|",
  "source_sha256": "a1f12e3e9d914d4b0529e14bd59b965a06d4c7a8ca9b5abca3912976600da436",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-1c8c0b1e"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-335",
  "title": "用户自定义 skill 体系(L2):三层 skill(L0 出厂只读基线 / L1 覆写层=T-318 / L2 用户新建扩展 skill 挂前置注入槽)+ Pi 三角色(教练=对话蒸馏 diff·作者=历史作品蒸馏风格 DNA 起草·科学家=复盘数据回流裁判 skill 版本/A-B)+ skill 导出导入(团队/矩阵账号共享)【产品主轴·用户 2026-07-15 拍板「一定要这样设计」】",
  "narrative": "—",
  "documents": "[Pi SPEC §6](docs/superpowers/specs/2026-07-14-pi-runtime-full-integration-design.md) · [skill-evolution-loop](docs/superpowers/specs/2026-07-03-skill-evolution-loop.md)",
  "source_line": "|T-335|用户自定义 skill 体系(L2):三层 skill(L0 出厂只读基线 / L1 覆写层=T-318 / L2 用户新建扩展 skill 挂前置注入槽)+ Pi 三角色(教练=对话蒸馏 diff·作者=历史作品蒸馏风格 DNA 起草·科学家=复盘数据回流裁判 skill 版本/A-B)+ skill 导出导入(团队/矩阵账号共享)【产品主轴·用户 2026-07-15 拍板「一定要这样设计」】|⏸️|—|待验|[Pi SPEC §6](docs/superpowers/specs/2026-07-14-pi-runtime-full-integration-design.md) · [skill-evolution-loop](docs/superpowers/specs/2026-07-03-skill-evolution-loop.md)|—|",
  "source_sha256": "de7d95e041ec7b7b5176252223562122c19dcaed617c22b60eb6ac70b044472c",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-73699bdc"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-337",
  "title": "日志与 AI 可观测性层:①轻量 logger 封装(级别/命名空间/traceId,stdout 天然进 sidecar.log;级别用户可切 debug)②requestId 真生成并贯穿日志行+ai_tasks/job_run(字段名对齐 OTel GenAI 语义约定)③**AI 黑匣子表**:每次 LLM 调用记 capability/model/耗时/token/主路 or fallback/错误分类码/**装配后 prompt+原始响应全文**(本地库+总量上限,数据不出机器;优先接 Vercel AI SDK experimental_telemetry)④错误分类码枚举统一(与 T-334 重试层共享地基)⑤webview 错误落盘(root global-error.tsx+window.onerror→local/client-log)⑥sidecar.log 改按大小/天数轮转+一键诊断包(zip:日志+版本+OS+近期失败摘要)⑦token/成本真算+按 capability/模型/日聚合的「AI 用量」面板 ⑧Pi 会话转录落盘 ⑨publishing.service.ts 五处静默 catch 补日志(可提前并进 T-328 小修)【审计报告已出·用户 2026-07-15;SPEC 已写并拆片 2026-07-15】",
  "narrative": "—",
  "documents": "[SPEC](docs/superpowers/specs/2026-07-15-logging-observability-layer-design.md) · [审计报告](docs/research/2026-07-15-logging-observability-audit-research.md)",
  "source_line": "|T-337|日志与 AI 可观测性层:①轻量 logger 封装(级别/命名空间/traceId,stdout 天然进 sidecar.log;级别用户可切 debug)②requestId 真生成并贯穿日志行+ai_tasks/job_run(字段名对齐 OTel GenAI 语义约定)③**AI 黑匣子表**:每次 LLM 调用记 capability/model/耗时/token/主路 or fallback/错误分类码/**装配后 prompt+原始响应全文**(本地库+总量上限,数据不出机器;优先接 Vercel AI SDK experimental_telemetry)④错误分类码枚举统一(与 T-334 重试层共享地基)⑤webview 错误落盘(root global-error.tsx+window.onerror→local/client-log)⑥sidecar.log 改按大小/天数轮转+一键诊断包(zip:日志+版本+OS+近期失败摘要)⑦token/成本真算+按 capability/模型/日聚合的「AI 用量」面板 ⑧Pi 会话转录落盘 ⑨publishing.service.ts 五处静默 catch 补日志(可提前并进 T-328 小修)【审计报告已出·用户 2026-07-15;SPEC 已写并拆片 2026-07-15】|⏸️|—|待验|[SPEC](docs/superpowers/specs/2026-07-15-logging-observability-layer-design.md) · [审计报告](docs/research/2026-07-15-logging-observability-audit-research.md)|—|",
  "source_sha256": "6ae2f5a357c57b5788ac56e09b0f747daccca895d7a5eb9d70aba372d19ba5ae",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-94c539d1"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-337a",
  "title": "contract 零依赖 logger(级别/ns/traceId 单行结构化,stdout→sidecar.log 复用 T-259 管道)+ 错误分类码枚举 + `classifyError` 收编三处散装分类(transcribe 5 类/NEEDS_RECONNECT/chat 恢复层)+ 设置页 log_level 开关(热生效)+ 咽喉 console 替换(runner/route/service catch)【SPEC §3.1/§3.4】",
  "narrative": "—",
  "documents": "[SPEC](docs/superpowers/specs/2026-07-15-logging-observability-layer-design.md)",
  "source_line": "|T-337a|contract 零依赖 logger(级别/ns/traceId 单行结构化,stdout→sidecar.log 复用 T-259 管道)+ 错误分类码枚举 + `classifyError` 收编三处散装分类(transcribe 5 类/NEEDS_RECONNECT/chat 恢复层)+ 设置页 log_level 开关(热生效)+ 咽喉 console 替换(runner/route/service catch)【SPEC §3.1/§3.4】|⏸️|—|待验|[SPEC](docs/superpowers/specs/2026-07-15-logging-observability-layer-design.md)|—|",
  "source_sha256": "fa3fe46e64d51add113f8ed57513931eff632a1395f351dbb81257119f4e3203",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-7b28d5e9"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-337b",
  "title": "traceId 贯穿:requestId 真 uuid(chat route/任务派发/定时 tick 三入口铸造+派生继承)+ ai_tasks.trace_id/job_run.trace_id 新列 + 修 persistence-transport.ts:15 硬编码 `\"persistence\"`【SPEC §3.2】",
  "narrative": "—",
  "documents": "[SPEC](docs/superpowers/specs/2026-07-15-logging-observability-layer-design.md)",
  "source_line": "|T-337b|traceId 贯穿:requestId 真 uuid(chat route/任务派发/定时 tick 三入口铸造+派生继承)+ ai_tasks.trace_id/job_run.trace_id 新列 + 修 persistence-transport.ts:15 硬编码 `\"persistence\"`【SPEC §3.2】|⏸️|—|待验|[SPEC](docs/superpowers/specs/2026-07-15-logging-observability-layer-design.md)|—|",
  "source_sha256": "d544a952f6fa67326f69082620d186c1967fbff834e08893e424192348a6686d",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-406b1376"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-337c",
  "title": "AI 黑匣子 `ai_call_log` 表(trace/task/会话关联+capability/model/耗时/token/route 主路 or 兜底/error_code/**装配后 prompt+原始响应全文** 各截 256KB)+ 三收口埋点(runStructuredNode 写端口范式/chat-runner onFinish/pi-engine turn_end)+ 容量治理(2 万行/512MB 最旧先删+设置页占用与清空)+ 任务详情「查看调用记录」【SPEC §3.3】",
  "narrative": "—",
  "documents": "[SPEC](docs/superpowers/specs/2026-07-15-logging-observability-layer-design.md)",
  "source_line": "|T-337c|AI 黑匣子 `ai_call_log` 表(trace/task/会话关联+capability/model/耗时/token/route 主路 or 兜底/error_code/**装配后 prompt+原始响应全文** 各截 256KB)+ 三收口埋点(runStructuredNode 写端口范式/chat-runner onFinish/pi-engine turn_end)+ 容量治理(2 万行/512MB 最旧先删+设置页占用与清空)+ 任务详情「查看调用记录」【SPEC §3.3】|⏸️|—|待验|[SPEC](docs/superpowers/specs/2026-07-15-logging-observability-layer-design.md)|—|",
  "source_sha256": "4949511ce4b8c41d159377fcbe73275ee2ace6b6f11030f71fd39371f067a0bb",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-17526bc5"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-337d",
  "title": "webview 错误落盘:root `global-error.tsx`(现只有 segment 级)+ window.onerror/unhandledrejection → POST /api/v1/local/client-log(loopback 门+60s 去重节流)→ logger → sidecar.log【SPEC §3.5】",
  "narrative": "—",
  "documents": "[SPEC](docs/superpowers/specs/2026-07-15-logging-observability-layer-design.md)",
  "source_line": "|T-337d|webview 错误落盘:root `global-error.tsx`(现只有 segment 级)+ window.onerror/unhandledrejection → POST /api/v1/local/client-log(loopback 门+60s 去重节流)→ logger → sidecar.log【SPEC §3.5】|⏸️|—|待验|[SPEC](docs/superpowers/specs/2026-07-15-logging-observability-layer-design.md)|—|",
  "source_sha256": "93eadd8b7c9f1f1e62e906f705036403283ceab02211802373a174e199b653d0",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-93bba5f5"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-337e",
  "title": "logging.rs 轮转改大小制(10MB×5 份+现役,启动不再覆盖 prev)+ 一键诊断包(Rust zip:全份日志+diagnostics.json 版本/OS/模型配置摘要不含密钥/近 50 条失败摘要;默认不含 prompt 正文,勾选附带需明示)【SPEC §3.6】",
  "narrative": "—",
  "documents": "[SPEC](docs/superpowers/specs/2026-07-15-logging-observability-layer-design.md)",
  "source_line": "|T-337e|logging.rs 轮转改大小制(10MB×5 份+现役,启动不再覆盖 prev)+ 一键诊断包(Rust zip:全份日志+diagnostics.json 版本/OS/模型配置摘要不含密钥/近 50 条失败摘要;默认不含 prompt 正文,勾选附带需明示)【SPEC §3.6】|⏸️|—|待验|[SPEC](docs/superpowers/specs/2026-07-15-logging-observability-layer-design.md)|—|",
  "source_sha256": "d4a5a6b1ced51c8276150cb8555ac187b8a24a89840bf3ea0190c5e5ef8b18e3",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-9a8c49a7"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-337f",
  "title": "成本可观测:provider 预设附 pricing(自定义可填,不填只显 token)+ 收口处 cost_usd 真算 + 设置页「AI 用量」面板(按日/capability/模型聚合:调用数/token/成本/失败率)【SPEC §3.7】",
  "narrative": "—",
  "documents": "[SPEC](docs/superpowers/specs/2026-07-15-logging-observability-layer-design.md)",
  "source_line": "|T-337f|成本可观测:provider 预设附 pricing(自定义可填,不填只显 token)+ 收口处 cost_usd 真算 + 设置页「AI 用量」面板(按日/capability/模型聚合:调用数/token/成本/失败率)【SPEC §3.7】|⏸️|—|待验|[SPEC](docs/superpowers/specs/2026-07-15-logging-observability-layer-design.md)|—|",
  "source_sha256": "e2f35b3d7fcdc782a07b5c7b11c2f4e352f832e943a10108b2dc86fc864e7b13",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-bb2199bc"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-337g",
  "title": "Pi 会话转录落盘:SessionManager.inMemory → 文件版(appDataDir/pi-sessions/<aiTaskId>/ JSONL)+ 纳入容量治理;与 T-316 目录约定协同(T-316 管续、本片管留证)【SPEC §3.8】",
  "narrative": "—",
  "documents": "[SPEC](docs/superpowers/specs/2026-07-15-logging-observability-layer-design.md)",
  "source_line": "|T-337g|Pi 会话转录落盘:SessionManager.inMemory → 文件版(appDataDir/pi-sessions/<aiTaskId>/ JSONL)+ 纳入容量治理;与 T-316 目录约定协同(T-316 管续、本片管留证)【SPEC §3.8】|⏸️|—|待验|[SPEC](docs/superpowers/specs/2026-07-15-logging-observability-layer-design.md)|—|",
  "source_sha256": "39be47575427a79ee8d7730e4ffd3136411b014a2929518dd59104732137ae15",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-f409559c"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-334",
  "title": "ai_tasks 任务可靠性层:错误分类(配置错误→引导去设置不重试 / 瞬态→自动退避重试 2-3 次 / 永久→诚实失败)+ 断点续跑 + 失败卡人话原因与一键重试【功能·任务运行时·用户 2026-07-15】",
  "narrative": "—",
  "documents": "—",
  "source_line": "|T-334|ai_tasks 任务可靠性层:错误分类(配置错误→引导去设置不重试 / 瞬态→自动退避重试 2-3 次 / 永久→诚实失败)+ 断点续跑 + 失败卡人话原因与一键重试【功能·任务运行时·用户 2026-07-15】|⏸️|—|待验|—|—|",
  "source_sha256": "519ec605ba8a80840517e8c837504c899700bb37bc1e5cc4cc16da25951ec29e",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-40a3d285"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-324",
  "title": "Pi 全面接管:抓取网页/截图/自动化任务/剪辑切到 Pi 引擎;自动化任务=模板脚本 + 沙箱模式,Pi 自纠错调试到跑通【设计·SPEC+gate·母于 T-314·用户 2026-07-15】",
  "narrative": "—",
  "documents": "[Pi SPEC](docs/superpowers/specs/2026-07-14-pi-runtime-full-integration-design.md)",
  "source_line": "|T-324|Pi 全面接管:抓取网页/截图/自动化任务/剪辑切到 Pi 引擎;自动化任务=模板脚本 + 沙箱模式,Pi 自纠错调试到跑通【设计·SPEC+gate·母于 T-314·用户 2026-07-15】|⏸️|—|待验|[Pi SPEC](docs/superpowers/specs/2026-07-14-pi-runtime-full-integration-design.md)|—|",
  "source_sha256": "355efc79962b0c1dfb11af17ff17ec852a7d20658ddeb0f5243ca3eb32a1b88a",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-492a18a7"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-340",
  "title": "agentic.research 三端口真接线(gate-M2 硬前提):web.search 复用编导检索层 + web.read 复用 T-217 Vault+Reader + knowledge.write 复用知识 pending 写入确认门——替换 persistence-client.ts:7023-7033 的诚实 501 throw(RT-H07 修复留下的形状,端口签名不变,executor/框架零改动);接完立即真跑 gate-M2(用户 MiniMax-M3,判据 SPEC §11:多步不崩/不无限绕/产出可用候选)收官 T-313【用户 2026-07-15·gate-M2 提上日程】",
  "narrative": "—",
  "documents": "[Pi SPEC §11](docs/superpowers/specs/2026-07-14-pi-runtime-full-integration-design.md)",
  "source_line": "|T-340|agentic.research 三端口真接线(gate-M2 硬前提):web.search 复用编导检索层 + web.read 复用 T-217 Vault+Reader + knowledge.write 复用知识 pending 写入确认门——替换 persistence-client.ts:7023-7033 的诚实 501 throw(RT-H07 修复留下的形状,端口签名不变,executor/框架零改动);接完立即真跑 gate-M2(用户 MiniMax-M3,判据 SPEC §11:多步不崩/不无限绕/产出可用候选)收官 T-313【用户 2026-07-15·gate-M2 提上日程】|⏸️|—|待验|[Pi SPEC §11](docs/superpowers/specs/2026-07-14-pi-runtime-full-integration-design.md)|—|",
  "source_sha256": "ab3f35b669dbff0045e82ee5b7043764d4288083bb8c85b1d4d7d859d4d28f91",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-0aaad48b"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-315",
  "title": "Pi 记忆层·memory-tool(读):现有 14 表经 Context 层包成 Pi 记忆检索工具 + 作用域收窄防串味【SPEC §5.2】",
  "narrative": "—",
  "documents": "[SPEC §5](docs/superpowers/specs/2026-07-14-pi-runtime-full-integration-design.md)",
  "source_line": "|T-315|Pi 记忆层·memory-tool(读):现有 14 表经 Context 层包成 Pi 记忆检索工具 + 作用域收窄防串味【SPEC §5.2】|⏸️|—|待验|[SPEC §5](docs/superpowers/specs/2026-07-14-pi-runtime-full-integration-design.md)|—|",
  "source_sha256": "eb808cb2ddf61343a1f94824d1959eab0c6c779853241f18b54edc96946a435f",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-b2e7a6ec"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-316",
  "title": "Pi 会话续(受控):pi-coding-agent JSONL SessionManager → appDataDir/pi-sessions,**默认每项目一会话**防跨项目串味【SPEC §5.2】",
  "narrative": "—",
  "documents": "[SPEC §5](docs/superpowers/specs/2026-07-14-pi-runtime-full-integration-design.md)",
  "source_line": "|T-316|Pi 会话续(受控):pi-coding-agent JSONL SessionManager → appDataDir/pi-sessions,**默认每项目一会话**防跨项目串味【SPEC §5.2】|⏸️|—|待验|[SPEC §5](docs/superpowers/specs/2026-07-14-pi-runtime-full-integration-design.md)|—|",
  "source_sha256": "30957c8adcc8a760c1eabf8f4d33c9572fc70b7928aa20d87b5fcc0e58e7d148",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-4c2f4b6a"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-317",
  "title": "跨会话偏好捕捉:对话里偏好/纠正经采纳门 → creator_profiles.downstreamRules/learnings/topic_preferences,新会话经 brief 带回【SPEC §5.2】",
  "narrative": "—",
  "documents": "[SPEC §5](docs/superpowers/specs/2026-07-14-pi-runtime-full-integration-design.md)",
  "source_line": "|T-317|跨会话偏好捕捉:对话里偏好/纠正经采纳门 → creator_profiles.downstreamRules/learnings/topic_preferences,新会话经 brief 带回【SPEC §5.2】|⏸️|—|待验|[SPEC §5](docs/superpowers/specs/2026-07-14-pi-runtime-full-integration-design.md)|—|",
  "source_sha256": "1ff604b42d7962a4042368f4adc03bb2c43286dde52ebdad95725123b179e1b7",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-a53ef65b"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-318",
  "title": "对话式 skill/记忆进化(飞轮,复活 T-087 skill.evolve diff 卡)+ §6 护栏全套【SPEC §6】",
  "narrative": "—",
  "documents": "[SPEC §6](docs/superpowers/specs/2026-07-14-pi-runtime-full-integration-design.md)",
  "source_line": "|T-318|对话式 skill/记忆进化(飞轮,复活 T-087 skill.evolve diff 卡)+ §6 护栏全套【SPEC §6】|⏸️|—|待验|[SPEC §6](docs/superpowers/specs/2026-07-14-pi-runtime-full-integration-design.md)|—|",
  "source_sha256": "40ac1ea6f4139e26a709e4d68c28701fd2adae418070c53e0df8859e7847590e",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-f63119cb"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-319",
  "title": "Pi 接 MCP client(装 pi-mcp-adapter,复用现有 MCP 工具;可选按需)【SPEC §10】",
  "narrative": "—",
  "documents": "[SPEC §10](docs/superpowers/specs/2026-07-14-pi-runtime-full-integration-design.md)",
  "source_line": "|T-319|Pi 接 MCP client(装 pi-mcp-adapter,复用现有 MCP 工具;可选按需)【SPEC §10】|⏸️|—|待验|[SPEC §10](docs/superpowers/specs/2026-07-14-pi-runtime-full-integration-design.md)|—|",
  "source_sha256": "ca114b80ad22e298230d9e684d37fe246ee9fa5398824e6f4a2617f847a7f43e",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-1e695591"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-312",
  "title": "编导式/对话式剪辑 + ChatCut(SPEC track·母任务)【用户 2026-07-14 拍板】",
  "narrative": "—",
  "documents": "[T-256 SPEC](docs/superpowers/specs/2026-07-12-controlled-agentic-runtime-design.md)",
  "source_line": "|T-312|编导式/对话式剪辑 + ChatCut(SPEC track·母任务)【用户 2026-07-14 拍板】|⏸️|—|待验|[T-256 SPEC](docs/superpowers/specs/2026-07-12-controlled-agentic-runtime-design.md)|—|",
  "source_sha256": "4ddd8d05079b19135456f796192040828f5145fa68ffebb517f16d4e85c3a2f3",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-f772103e"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-307",
  "title": "playwright 启动点统一浏览器选择(截图崩 chrome-headless-shell + GitHub 登录读不到)【bug·阻断·T-299 收尾】",
  "narrative": "—",
  "documents": "—",
  "source_line": "|T-307|playwright 启动点统一浏览器选择(截图崩 chrome-headless-shell + GitHub 登录读不到)【bug·阻断·T-299 收尾】|⏸️|—|待验|—|—|",
  "source_sha256": "1bb25e5382602c7c004c314c583adbda2a2cd10b8579236984f42ed570b60a17",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-6cb4c8e3"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-306",
  "title": "首页「页面加载失败,请稍后重试」【bug·待复现·疑似瞬时】",
  "narrative": "—",
  "documents": "—",
  "source_line": "|T-306|首页「页面加载失败,请稍后重试」【bug·待复现·疑似瞬时】|⏸️|—|待验|—|—|",
  "source_sha256": "ebc1b670f82ae2d496e9024f79c72ce0e09c6ed885a144c70d856c6b73c84606",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-6a8b7fdf"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-301",
  "title": "首页 4 个空 widget 规划:待办事项/热门选题热度/数据概览/创作建议【产品·设计·调研已完成】",
  "narrative": "—",
  "documents": "—",
  "source_line": "|T-301|首页 4 个空 widget 规划:待办事项/热门选题热度/数据概览/创作建议【产品·设计·调研已完成】|⏸️|—|待验|—|—|",
  "source_sha256": "f9ccd686ef572d2dfb41a836873cc3284690300cd0510a495eae6d556eed3cad",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-e1f0216a"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-302",
  "title": "首页待办事项接生产者——派生 actionable 待办(待确认渲染/待复盘)【bug·首页·T-301 拆】",
  "narrative": "—",
  "documents": "—",
  "source_line": "|T-302|首页待办事项接生产者——派生 actionable 待办(待确认渲染/待复盘)【bug·首页·T-301 拆】|⏸️|—|待验|—|—|",
  "source_sha256": "8a982de6fb0db053e2647c8f7c077d3cd68a24a5f3e45b6b1f28adcae82fd706",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-acd74fe0"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-261",
  "title": "AI 关联飞轮(自动建网)",
  "narrative": "—",
  "documents": "[SPEC §3.2剔出](docs/superpowers/specs/2026-07-12-knowledge-graph-ai-relations-design.md)",
  "source_line": "|T-261|AI 关联飞轮(自动建网)|⏸️|—|待验|[SPEC §3.2剔出](docs/superpowers/specs/2026-07-12-knowledge-graph-ai-relations-design.md)|—|",
  "source_sha256": "2af5a4ca2e20774dc1d64d1582b58c46ff21172156ef786c61b4fd516412b93e",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-2ea579f8"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-249",
  "title": "统一真机验证清单(考古跨任务残留承接)",
  "narrative": "—",
  "documents": "—",
  "source_line": "|T-249|统一真机验证清单(考古跨任务残留承接)|⏸️|—|待验|—|—|",
  "source_sha256": "13833a9c346b8ec046f777b825c9af9c651814e079f73d1bed0f8e353405c483",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-b4a341aa"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-250",
  "title": "工程健康批(T-145 残留收编,低优)",
  "narrative": "—",
  "documents": "—",
  "source_line": "|T-250|工程健康批(T-145 残留收编,低优)|⏸️|—|待验|—|—|",
  "source_sha256": "51c3b5963bc2bf2c624c7fc5d7f5f64c8785d6a34ee0e3b78b4b65d64ad25c0e",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-72eaa634"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-255b",
  "title": "~~agent 引擎 executor 集成~~ **已并入 T-256b/d**",
  "narrative": "—",
  "documents": "[SPEC](docs/superpowers/specs/2026-07-12-controlled-agentic-runtime-design.md)",
  "source_line": "|T-255b|~~agent 引擎 executor 集成~~ **已并入 T-256b/d**|⏸️|—|待验|[SPEC](docs/superpowers/specs/2026-07-12-controlled-agentic-runtime-design.md)|—|",
  "source_sha256": "bc7a6afdeab747b990eee9e7a8a7964604eda785d35699f617e2968da8a55e53",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-237c2299"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-185R",
  "title": "访谈后替用户起草 custom skill(考古收敛自 T-185;elicitation 机制已被 T-210 落地证明)",
  "narrative": "—",
  "documents": "—",
  "source_line": "|T-185R|访谈后替用户起草 custom skill(考古收敛自 T-185;elicitation 机制已被 T-210 落地证明)|⏸️|—|待验|—|—|",
  "source_sha256": "56a1621e3ebc68c7625d46acd757447f1a3f85592db75b057eb7f62046d949f1",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-ed827cf0"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-136R",
  "title": "多账号残留两点(考古收敛自 T-136):①多号并存时定时 job 精确 targeting ②双号真机端到端(切号数据真隔离)",
  "narrative": "—",
  "documents": "—",
  "source_line": "|T-136R|多账号残留两点(考古收敛自 T-136):①多号并存时定时 job 精确 targeting ②双号真机端到端(切号数据真隔离)|⏸️|—|待验|—|—|",
  "source_sha256": "609a6f71124e72690c4b45aa92f454a1bf5ecebb9cf9db5ff7c2f3a4755ec7e8",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-ca7145d8"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-100",
  "title": "单视频分析页(观众/来源/留存维度)",
  "narrative": "—",
  "documents": "—",
  "source_line": "|T-100|单视频分析页(观众/来源/留存维度)|⏸️|—|待验|—|—|",
  "source_sha256": "5c2b3cfcf99cc04232cc749df715f58cfe40346b72a997ef130d7dbd394df849",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-2c056853"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-087",
  "title": "Skill 迭代循环机制(经验回流进化,防污染设计)",
  "narrative": "—",
  "documents": "[skill-evolution-loop](docs/superpowers/specs/2026-07-03-skill-evolution-loop.md) ✅PASS",
  "source_line": "|T-087|Skill 迭代循环机制(经验回流进化,防污染设计)|⏸️|—|待验|[skill-evolution-loop](docs/superpowers/specs/2026-07-03-skill-evolution-loop.md) ✅PASS|—|",
  "source_sha256": "9780fdb4f292c6ab1347af06b62db4bf3ef464bb88432ca59ae4a224dfb11e30",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-e955ab4b"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-045",
  "title": "激活码授权 + 本机单用户模式(完整方案)",
  "narrative": "—",
  "documents": "[activation-single-user](docs/superpowers/specs/2026-07-02-activation-single-user-design.md) + [REVIEW_LEDGER](docs/superpowers/specs/REVIEW_LEDGER.md)",
  "source_line": "|T-045|激活码授权 + 本机单用户模式(完整方案)|⏸️|—|待验|[activation-single-user](docs/superpowers/specs/2026-07-02-activation-single-user-design.md) + [REVIEW_LEDGER](docs/superpowers/specs/REVIEW_LEDGER.md)|—|",
  "source_sha256": "185d9c48dbc1d6dfcf2036b2d05f708ec0a76872aba4a213af0408623909f273",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-8845537c"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-715",
  "title": "在 CreatorOS 增加 Growth AI 额度账户连接、查看与充值入口",
  "narrative": "复用当前激活权益申请全新 config access ticket，调用 Growth 创建一次性额度会话；CreatorOS 只提供“查看 AI 额度与消耗”入口，首次固定打开 Growth 用户端 `/credits/connect#<one-time-code>` 完成登录/注册与绑定，已绑定时固定打开用户端 `/credits/launch#<one-time-code>`，不得出现端选择，也不得因 partner/channel/admin 角色转去管理端或渠道端。票据、一次性码、激活码、充值码和受管子 Key 不得进入 URL query、日志或普通缓存。受管 AI 额度耗尽时，Copilot 与异步任务必须显示“AI 额度不足”并提供同一安全用户端充值入口，不得冒充模型故障或暴露模型、服务商和中转实现；用户自配模型的余额错误仍按本地模型配置处理。CreatorOS 只负责安全入口和本地激活状态，额度汇总、刷新、充值和账本归 Growth；本任务不修改 Activity。2026-08-06 真机已到达 Growth 用户端且 fragment 被移除，但生产兑换失败（脱敏参考号见 Gate），因此保持待验，不能把打开页面冒充额度闭环。",
  "documents": "[真实联调 Gate](orchestrator/GATE-T715-BUILD.md) · [Growth T-137 充值契约](/Users/masx/Projects/Thirdspace-growth/docs/contracts/T-137-ai-credit-recharge.md) · [T-679 受管模型契约](docs/superpowers/specs/2026-08-02-capability-scoped-channel-model-authority.md)",
  "source_line": "|T-715|在 CreatorOS 增加 Growth AI 额度账户连接、查看与充值入口|🔨|—|待验|[真实联调 Gate](orchestrator/GATE-T715-BUILD.md) · [Growth T-137 充值契约](/Users/masx/Projects/Thirdspace-growth/docs/contracts/T-137-ai-credit-recharge.md) · [T-679 受管模型契约](docs/superpowers/specs/2026-08-02-capability-scoped-channel-model-authority.md)|复用当前激活权益申请全新 config access ticket，调用 Growth 创建一次性额度会话；CreatorOS 只提供“查看 AI 额度与消耗”入口，首次固定打开 Growth 用户端 `/credits/connect#<one-time-code>` 完成登录/注册与绑定，已绑定时固定打开用户端 `/credits/launch#<one-time-code>`，不得出现端选择，也不得因 partner/channel/admin 角色转去管理端或渠道端。票据、一次性码、激活码、充值码和受管子 Key 不得进入 URL query、日志或普通缓存。受管 AI 额度耗尽时，Copilot 与异步任务必须显示“AI 额度不足”并提供同一安全用户端充值入口，不得冒充模型故障或暴露模型、服务商和中转实现；用户自配模型的余额错误仍按本地模型配置处理。CreatorOS 只负责安全入口和本地激活状态，额度汇总、刷新、充值和账本归 Growth；本任务不修改 Activity。2026-08-06 真机已到达 Growth 用户端且 fragment 被移除，但生产兑换失败（脱敏参考号见 Gate），因此保持待验，不能把打开页面冒充额度闭环。|",
  "source_sha256": "9dc97263ae3abb43d97cd5d17efcef2c58f6cb1a18338ec7f40312f0d3b71ff4",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-e5553279"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-502",
  "title": "T-496 退回 PLAN 重做：收藏来源自由选择任一已绑定账号 + 双账号只读 RAT【产品+验证·用户授权 2026-07-24】",
  "narrative": "RAT 只读取账号状态、登录 profile 与收藏夹列表，不点赞、不收藏、不发布；证据脱敏。新 SPEC 必须定义 `ownerAccountId=当前工作区`、`collectorAccountId=用户当次所选任一账号`，默认当前账号但可切换，绝不按“大号/小号”标签硬编码。",
  "documents": "上游为 [T-496 FAIL SPEC](docs/superpowers/specs/2026-07-24-favorites-collector-account-selector-design.md) 与 [三轮评审](docs/superpowers/specs/2026-07-24-favorites-collector-account-selector-design.review.md)；[只读 RAT](docs/research/2026-07-24-favorites-dual-account-readonly-rat.md) 通过后创建 replacement PLAN SPEC，不能继续原地磨第三轮失败工件",
  "source_line": "|T-502|T-496 退回 PLAN 重做：收藏来源自由选择任一已绑定账号 + 双账号只读 RAT【产品+验证·用户授权 2026-07-24】|⏸️|—|待验|上游为 [T-496 FAIL SPEC](docs/superpowers/specs/2026-07-24-favorites-collector-account-selector-design.md) 与 [三轮评审](docs/superpowers/specs/2026-07-24-favorites-collector-account-selector-design.review.md)；[只读 RAT](docs/research/2026-07-24-favorites-dual-account-readonly-rat.md) 通过后创建 replacement PLAN SPEC，不能继续原地磨第三轮失败工件|RAT 只读取账号状态、登录 profile 与收藏夹列表，不点赞、不收藏、不发布；证据脱敏。新 SPEC 必须定义 `ownerAccountId=当前工作区`、`collectorAccountId=用户当次所选任一账号`，默认当前账号但可切换，绝不按“大号/小号”标签硬编码。|",
  "source_sha256": "9829b339216b63fef98274bce0d081dabeb84b543c4592a23ed8c107b255d2a9",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-bdf081af"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-497",
  "title": "用户知识库受控检索与脚本引用设计：大语料、质量差异、权威资料支配风险【产品设计·用户 2026-07-24】",
  "narrative": "推荐骨架保留：检索≠注入≠引用；多维角色而非质量总分；8k token/12 chunks/单源 30%；零命中不 dump；Context Manifest；法律候选人工确认。恢复条件：用户确认默认模式，并定义模型调用前可确定的法律/监管资料风险下限。",
  "documents": "[SPEC](docs/superpowers/specs/2026-07-24-controlled-knowledge-retrieval-design.md) · [REVIEW](docs/superpowers/specs/2026-07-24-controlled-knowledge-retrieval-design.review.md)",
  "source_line": "|T-497|用户知识库受控检索与脚本引用设计：大语料、质量差异、权威资料支配风险【产品设计·用户 2026-07-24】|⏸️|—|待验|[SPEC](docs/superpowers/specs/2026-07-24-controlled-knowledge-retrieval-design.md) · [REVIEW](docs/superpowers/specs/2026-07-24-controlled-knowledge-retrieval-design.review.md)|推荐骨架保留：检索≠注入≠引用；多维角色而非质量总分；8k token/12 chunks/单源 30%；零命中不 dump；Context Manifest；法律候选人工确认。恢复条件：用户确认默认模式，并定义模型调用前可确定的法律/监管资料风险下限。|",
  "source_sha256": "322fcd7e37e7ffa7e3a7eaad7b38b979dbfb22bd0b84de127043dcb0475296c9",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-dae68b9b"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-451",
  "title": "【防逆向优化 D-④·战略层·合并 T-447】把 license verdict 判定+启动 magic 一起搬进 Rust:壳启动跑 verdict → 仅 allowed=true 才 Ed25519 签 verdict-bound handshake token(machineId+expiresAt+port+nonce)→ sidecar 校验通过才 listen【安全·用户 2026-07-21 拍板 D. 全上,方案 B】",
  "narrative": "现状 activation-gate.server.ts:44 一行 `verdict.allowed===true` 是 JS 判定,bytenode 拦不住 patch;`isDesktopRuntime` web 短路(F1)让攻击者不设 `CREATOROS_DESKTOP=1` 就绕整个门。SPEC 收紧成 `CREATOROS_DEV_MODE=1 && NODE_ENV!=production` 二合一(打包版永不出现该 marker),打包态强制 verdict-token verify 通过。改点 9 处 file:line 见 SPEC §5。**未过 gate 前禁写实现**——现已过审,可开工。",
  "documents": "[SPEC](docs/superpowers/specs/2026-07-21-license-verdict-native-verdict-design.md) · [review](docs/superpowers/specs/2026-07-21-license-verdict-native-verdict-design.review.md)",
  "source_line": "|T-451|【防逆向优化 D-④·战略层·合并 T-447】把 license verdict 判定+启动 magic 一起搬进 Rust:壳启动跑 verdict → 仅 allowed=true 才 Ed25519 签 verdict-bound handshake token(machineId+expiresAt+port+nonce)→ sidecar 校验通过才 listen【安全·用户 2026-07-21 拍板 D. 全上,方案 B】|⏸️|—|待验|[SPEC](docs/superpowers/specs/2026-07-21-license-verdict-native-verdict-design.md) · [review](docs/superpowers/specs/2026-07-21-license-verdict-native-verdict-design.review.md)|现状 activation-gate.server.ts:44 一行 `verdict.allowed===true` 是 JS 判定,bytenode 拦不住 patch;`isDesktopRuntime` web 短路(F1)让攻击者不设 `CREATOROS_DESKTOP=1` 就绕整个门。SPEC 收紧成 `CREATOROS_DEV_MODE=1 && NODE_ENV!=production` 二合一(打包版永不出现该 marker),打包态强制 verdict-token verify 通过。改点 9 处 file:line 见 SPEC §5。**未过 gate 前禁写实现**——现已过审,可开工。|",
  "source_sha256": "453a0ad953d5d0a237c2fcaedad4c361fa42e95a9b9073d6faf1d5454f1719c3",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-fdafab42"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-449",
  "title": "~~【防逆向优化 D-②】Windows 直装 sidecar 目录 ACL 收紧~~ **调研结论=撤销:施工无收益**",
  "narrative": "结论:currentUser 模式下无事可做。**未来若为企业/多用户场景切 `perMachine` 装到 `C:\\Program Files\\`,才需要 ACL 收紧**(此时 icacls + WMIC 探测真实交互用户是必需)。归档已列施工点、UAC 陷阱、updater 兼容性。",
  "documents": "[调研归档](docs/research/2026-07-21-t449-windows-acl-hardening-research.md)(重要发现留存,若未来切 `perMachine` 时立即启用)",
  "source_line": "|T-449|~~【防逆向优化 D-②】Windows 直装 sidecar 目录 ACL 收紧~~ **调研结论=撤销:施工无收益**|⏸️|—|待验|[调研归档](docs/research/2026-07-21-t449-windows-acl-hardening-research.md)(重要发现留存,若未来切 `perMachine` 时立即启用)|结论:currentUser 模式下无事可做。**未来若为企业/多用户场景切 `perMachine` 装到 `C:\\Program Files\\`,才需要 ACL 收紧**(此时 icacls + WMIC 探测真实交互用户是必需)。归档已列施工点、UAC 陷阱、updater 兼容性。|",
  "source_sha256": "f421ea09360e6251c42adf7fc4b7d8cb0b6454e0f4ffb0a4464dbd970efda77d",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-bfcce871"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-448",
  "title": "【防逆向优化 D-①-b】sidecar 内父进程/magic 自检",
  "narrative": "verdict-token 是硬闸(签名不可伪造),T-448 是软纵深(patch 敏感)。评审 F1 处理已在 sidecar instrumentation 加了 dev-mode marker 校验,已覆盖 T-448 大部分意图。",
  "documents": "[调研·打包与防逆向优化](docs/research/2026-07-21-packaging-and-anti-reversing-optimization-research.md) §4.1 (c)",
  "source_line": "|T-448|【防逆向优化 D-①-b】sidecar 内父进程/magic 自检|⏸️|—|待验|[调研·打包与防逆向优化](docs/research/2026-07-21-packaging-and-anti-reversing-optimization-research.md) §4.1 (c)|verdict-token 是硬闸(签名不可伪造),T-448 是软纵深(patch 敏感)。评审 F1 处理已在 sidecar instrumentation 加了 dev-mode marker 校验,已覆盖 T-448 大部分意图。|",
  "source_sha256": "ff842a35e200344c53ec84b3469e8bdc8a75c3e90ceabd033ae890a384eab382",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-4569f744"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-433 S2",
  "title": "gate-F5 升两级优先串行闸(并发仍=1):明细类(self.metrics/self.detail)高优 > 封面/逐字稿/重建低优;封面等从 self.detail 尾内联拆独立低优 run【T-433 切片·SPEC §2.2】",
  "narrative": "多账号:所有号明细 done 才跑封面。改点 `enqueueCollectionRun`(persistence-client.ts:1544)加 priority + 两 tail;`douyin-heavy-backfill.ts` 封面标 low。防封不变(只重排顺序不加并发)。",
  "documents": "[SPEC §2.2](docs/superpowers/specs/2026-07-19-multi-account-collection-speedup-design.md)",
  "source_line": "|T-433 S2|gate-F5 升两级优先串行闸(并发仍=1):明细类(self.metrics/self.detail)高优 > 封面/逐字稿/重建低优;封面等从 self.detail 尾内联拆独立低优 run【T-433 切片·SPEC §2.2】|⏸️|—|待验|[SPEC §2.2](docs/superpowers/specs/2026-07-19-multi-account-collection-speedup-design.md)|多账号:所有号明细 done 才跑封面。改点 `enqueueCollectionRun`(persistence-client.ts:1544)加 priority + 两 tail;`douyin-heavy-backfill.ts` 封面标 low。防封不变(只重排顺序不加并发)。|",
  "source_sha256": "1ab07a0fa0f3a39772935f84d1c6ea02935eb537c689b85b17da6803bba23484",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-85978790"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-433 S4",
  "title": "排队进度可见:job_run 加真 `queued` 态(createRun 落 queued,runner markRunning 转 running)+ 任务中心显「排队 N/当前 X/限流剩 Ys」+ 限流横幅按真 channel 归类(iesdouyin 也显)+ sweep 兼容 queued 超时【T-433 切片·SPEC §2.4】",
  "narrative": "现 createRun 即 running,等闸的也 running→分不清真采 vs 排队。改 `scheduler:186-191`+runner`:234`+前端 RunStatus 枚举+`automations-island.tsx:319-325` channel 口径。",
  "documents": "[SPEC §2.4](docs/superpowers/specs/2026-07-19-multi-account-collection-speedup-design.md)",
  "source_line": "|T-433 S4|排队进度可见:job_run 加真 `queued` 态(createRun 落 queued,runner markRunning 转 running)+ 任务中心显「排队 N/当前 X/限流剩 Ys」+ 限流横幅按真 channel 归类(iesdouyin 也显)+ sweep 兼容 queued 超时【T-433 切片·SPEC §2.4】|⏸️|—|待验|[SPEC §2.4](docs/superpowers/specs/2026-07-19-multi-account-collection-speedup-design.md)|现 createRun 即 running,等闸的也 running→分不清真采 vs 排队。改 `scheduler:186-191`+runner`:234`+前端 RunStatus 枚举+`automations-island.tsx:319-325` channel 口径。|",
  "source_sha256": "a374b448e780c4a85ebd5f9678a598a7f4fe2b5e34e8f5ee2b5c76b519fb530f",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-6a1c6872"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-433 S5",
  "title": "(可选)benchmark/darkhorse 加已知 awemeId early-stop 增量(同 self.metrics T-177);**self.detail 不做**(整表 xlsx 单次导出增量收益低)【T-433 切片·SPEC §2.5】",
  "narrative": "收益中等、独立,不阻塞主线。改 `benchmark-collector.ts`+`douyin-cdp.ts:1146`。",
  "documents": "[SPEC §2.5](docs/superpowers/specs/2026-07-19-multi-account-collection-speedup-design.md)",
  "source_line": "|T-433 S5|(可选)benchmark/darkhorse 加已知 awemeId early-stop 增量(同 self.metrics T-177);**self.detail 不做**(整表 xlsx 单次导出增量收益低)【T-433 切片·SPEC §2.5】|⏸️|—|待验|[SPEC §2.5](docs/superpowers/specs/2026-07-19-multi-account-collection-speedup-design.md)|收益中等、独立,不阻塞主线。改 `benchmark-collector.ts`+`douyin-cdp.ts:1146`。|",
  "source_sha256": "27b9a21902faaa5d30f46e7994f6af25a42d44bf530fcf422cc861e15c1a4a71",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-49ef2f42"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-426",
  "title": "Windows 真机装完打开白屏「127.0.0.1 拒绝连接 / ERR_CONNECTION_REFUSED」= sidecar server 未监听端口【bug·真机·阻断·用户 2026-07-19 阿里云无影 Win】",
  "narrative": "Tauri 壳起来了(窗口出),加载 sidecar `http://127.0.0.1:<端口>` 但 server 未监听→拒连。**这是 T-372 W-ci 从未真机验证的 Windows sidecar 启动环节首次暴露**(记录明载「未在 Win 实机验证任何行为」)。最可能:首启把 `sidecar.tar.gz`(366MB)解压到 `%APPDATA%\\cloud.aitongban.creatoros\\runtime\\<ver>\\sidecar`(lib.rs:507/542)时 **Windows symlink/junction 断链**(W-ci 整段 junction 地狱)→ `server.js` 起不来;次疑 master key stdin fd 注入(T-391 H-key)Win 行为异常、或解压未完成即加载。诊断三步:①任务管理器看 `creatoros-server.exe` 进程在不在 ②查解压目录是否完整含 server.js/node_modules ③命令行跑 `CreatorOS.exe` 捕获 stderr + 解密 `logs\\sidecar.log.enc`。",
  "documents": "[SPEC §10/§12](docs/superpowers/specs/2026-07-17-license-hardening-and-dual-platform-design.md)",
  "source_line": "|T-426|Windows 真机装完打开白屏「127.0.0.1 拒绝连接 / ERR_CONNECTION_REFUSED」= sidecar server 未监听端口【bug·真机·阻断·用户 2026-07-19 阿里云无影 Win】|⏸️|—|待验|[SPEC §10/§12](docs/superpowers/specs/2026-07-17-license-hardening-and-dual-platform-design.md)|Tauri 壳起来了(窗口出),加载 sidecar `http://127.0.0.1:<端口>` 但 server 未监听→拒连。**这是 T-372 W-ci 从未真机验证的 Windows sidecar 启动环节首次暴露**(记录明载「未在 Win 实机验证任何行为」)。最可能:首启把 `sidecar.tar.gz`(366MB)解压到 `%APPDATA%\\cloud.aitongban.creatoros\\runtime\\<ver>\\sidecar`(lib.rs:507/542)时 **Windows symlink/junction 断链**(W-ci 整段 junction 地狱)→ `server.js` 起不来;次疑 master key stdin fd 注入(T-391 H-key)Win 行为异常、或解压未完成即加载。诊断三步:①任务管理器看 `creatoros-server.exe` 进程在不在 ②查解压目录是否完整含 server.js/node_modules ③命令行跑 `CreatorOS.exe` 捕获 stderr + 解密 `logs\\sidecar.log.enc`。|",
  "source_sha256": "33a10b0893fcf186406c4ae53c5bf42df61ebff42a1072287f39292fc456043f",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-16259192"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-413",
  "title": "上线前防逆向/防盗版落地(两新方案文档落地 + 现有 T-391/T-399/T-392 对账去重)【安全·用户 2026-07-18 /goal】",
  "narrative": "**母任务·已评估拆片(子代理本地对账,不出仓)**。核实结论:**防盗版层(机器绑定/在线激活/吊销)已做完(T-372L2/L3+T-408✅),唯一缺 P0-B 白嫖门**;P0-A 做一半(master key 已 v2 混淆+fd 通道,剩去 dev-fallback);L1 prompt/端点仍明文可 grep(主 IP 缺口)。攻击链:链2(`node server.js` fail-open)+链3(绕Rust壳)仍成立。拆 T-415~T-420。",
  "documents": "[defense-ladder](docs/research/2026-07-18-anti-reversing-defense-ladder-design.md) · [t399-deception](docs/research/2026-07-18-t399-ai-targeted-deception-design.md)",
  "source_line": "|T-413|上线前防逆向/防盗版落地(两新方案文档落地 + 现有 T-391/T-399/T-392 对账去重)【安全·用户 2026-07-18 /goal】|⏸️|—|待验|[defense-ladder](docs/research/2026-07-18-anti-reversing-defense-ladder-design.md) · [t399-deception](docs/research/2026-07-18-t399-ai-targeted-deception-design.md)|**母任务·已评估拆片(子代理本地对账,不出仓)**。核实结论:**防盗版层(机器绑定/在线激活/吊销)已做完(T-372L2/L3+T-408✅),唯一缺 P0-B 白嫖门**;P0-A 做一半(master key 已 v2 混淆+fd 通道,剩去 dev-fallback);L1 prompt/端点仍明文可 grep(主 IP 缺口)。攻击链:链2(`node server.js` fail-open)+链3(绕Rust壳)仍成立。拆 T-415~T-420。|",
  "source_sha256": "a7d24ef3d771947e176002f92bd722c0fddddf9a465fa00d0d4c423d86690fa1",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-88f11e51"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-417",
  "title": "L1 字符串加密补齐:chunks/ 的 prompt/端点 rc4 stringArray(**turbopack 白名单排除·必真机冒烟**)+ chunk 名哈希 + manifest/CI 绝对路径脱敏 + 热点函数 opaque predicate(吸收旧 T-399c)",
  "narrative": "建议扩 T-164 P6;prompt IP+端点当前明文可 grep。冒烟不稳即推后。",
  "documents": "[ladder §3 L1](docs/research/2026-07-18-anti-reversing-defense-ladder-design.md)",
  "source_line": "|T-417|L1 字符串加密补齐:chunks/ 的 prompt/端点 rc4 stringArray(**turbopack 白名单排除·必真机冒烟**)+ chunk 名哈希 + manifest/CI 绝对路径脱敏 + 热点函数 opaque predicate(吸收旧 T-399c)|⏸️|—|待验|[ladder §3 L1](docs/research/2026-07-18-anti-reversing-defense-ladder-design.md)|建议扩 T-164 P6;prompt IP+端点当前明文可 grep。冒烟不稳即推后。|",
  "source_sha256": "7e69ac9f60b5ab806166b6649ad9724958d5b3dfe1a92d7668a16cd0dfabc587",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-0519ef14"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-418",
  "title": "L2 sidecar 加密落盘:tar AES-256-GCM(build 时)+ Rust 运行时解密到 RAM disk 拉起(key 走 keychain 派生绝不落盘)",
  "narrative": "打掉 `tar xzf` 读 JS;sidecar.tar.gz 当前明文 gzip 仅 size 指纹校验。",
  "documents": "[ladder §4 L2](docs/research/2026-07-18-anti-reversing-defense-ladder-design.md)",
  "source_line": "|T-418|L2 sidecar 加密落盘:tar AES-256-GCM(build 时)+ Rust 运行时解密到 RAM disk 拉起(key 走 keychain 派生绝不落盘)|⏸️|—|待验|[ladder §4 L2](docs/research/2026-07-18-anti-reversing-defense-ladder-design.md)|打掉 `tar xzf` 读 JS;sidecar.tar.gz 当前明文 gzip 仅 size 指纹校验。|",
  "source_sha256": "61882a2d7daf5f8a08cd28107436bbdc1ad81f5a38cf42a31a05ced3e193ea64",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-d16c9df4"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-420",
  "title": "L4 皇冠函数 napi-rs 原生化(2-3 个;**授权终判已在 Rust 无需重做,半个 L4 已做**)",
  "narrative": "抬到机器码层无源码可还原;剩余纯选择性。",
  "documents": "[ladder §6 L4](docs/research/2026-07-18-anti-reversing-defense-ladder-design.md)",
  "source_line": "|T-420|L4 皇冠函数 napi-rs 原生化(2-3 个;**授权终判已在 Rust 无需重做,半个 L4 已做**)|⏸️|—|待验|[ladder §6 L4](docs/research/2026-07-18-anti-reversing-defense-ladder-design.md)|抬到机器码层无源码可还原;剩余纯选择性。|",
  "source_sha256": "7b35e324f8979d4c981a008ce7eefc2dcdc211a99bf3514296c3d4c4daccc620",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-578fa058"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-399",
  "title": "反 AI 破解欺骗层调研+方案【调研·防逆向下一层·用户 2026-07-18 口述】",
  "narrative": "用户洞察:破解主力转 AI agent。诚实边界:客户端无绝对不可破,唯一治本=服务端信任根;损坏级响应只在密码学确证被 patch 时触发(误伤正版=灾难)。母于 T-391。**欺骗层硬前提=T-415(P0-B)+T-418(L2)+T-419(L3),单独上线=白修;旧 research 期切片已删,由 maze SPEC 新套 T-399a/b/c 取代。**",
  "documents": "[research](docs/research/2026-07-18-anti-ai-cracking-deception-research.md)",
  "source_line": "|T-399|反 AI 破解欺骗层调研+方案【调研·防逆向下一层·用户 2026-07-18 口述】|⏸️|—|待验|[research](docs/research/2026-07-18-anti-ai-cracking-deception-research.md)|用户洞察:破解主力转 AI agent。诚实边界:客户端无绝对不可破,唯一治本=服务端信任根;损坏级响应只在密码学确证被 patch 时触发(误伤正版=灾难)。母于 T-391。**欺骗层硬前提=T-415(P0-B)+T-418(L2)+T-419(L3),单独上线=白修;旧 research 期切片已删,由 maze SPEC 新套 T-399a/b/c 取代。**|",
  "source_sha256": "a44049ae0d414ba496d62f3766c8b4ac8aec36062303852b95db281e80188707",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-65ae9398"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-399c",
  "title": "反破解欺骗片3:D3 严格不可达迷宫 + D4 量化污染(诱饵占比≥40%)+ §4.2 性能预算基线(运行时误差内无退化+包体≤+5%)+ §4.3 盲测有效性框架(control/decoy 各≥8轮·真门定位+≥50%·Mann-Whitney p<0.05·必测 chunk 整排除·裁 Class A 存活+校准X/Y)【安全·SPEC §7 拆片】",
  "narrative": "盲测是\"证有效非自欺\"的关键门;不达标该维度淘汰。",
  "documents": "[SPEC §4](docs/superpowers/specs/2026-07-18-anti-ai-deception-maze-design.md)",
  "source_line": "|T-399c|反破解欺骗片3:D3 严格不可达迷宫 + D4 量化污染(诱饵占比≥40%)+ §4.2 性能预算基线(运行时误差内无退化+包体≤+5%)+ §4.3 盲测有效性框架(control/decoy 各≥8轮·真门定位+≥50%·Mann-Whitney p<0.05·必测 chunk 整排除·裁 Class A 存活+校准X/Y)【安全·SPEC §7 拆片】|⏸️|—|待验|[SPEC §4](docs/superpowers/specs/2026-07-18-anti-ai-deception-maze-design.md)|盲测是\"证有效非自欺\"的关键门;不达标该维度淘汰。|",
  "source_sha256": "fd3a8a978b130cf60169af916185930a6caa434989e454492706e0d4ba8620d5",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-f35672b6"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-409",
  "title": "创作包只读导出端点(供 ArticleOS 拉取)【跨仓需求·ArticleOS 2026-07-18 立项,用户已签核 DEC-012/020】",
  "narrative": "三端点只读幂等:`GET /export/packets?since=<cursor>`(游标列表)/`GET /export/packets/:id`(packet.json v0.2:sourceContent+materials[] 强 schema+contentHash)/`GET /export/packets/:id/assets/<path>`(素材文件+X-Content-SHA256);loopback+token 鉴权;单资产≤50MB;导出即冻结快照。属互通调研 B 档小改,不碰主线;阻塞 ArticleOS SLICE-8(其 CreatorOS 自动进队入口)。fixture 双向测试真值共用 contract/fixtures/packet-v0.2/",
  "documents": "契约:`~/Workbase/Thirdspace-article/docs/specs/2026-07-18-creation-packet-contract-v0.2.md`",
  "source_line": "|T-409|创作包只读导出端点(供 ArticleOS 拉取)【跨仓需求·ArticleOS 2026-07-18 立项,用户已签核 DEC-012/020】|⏸️|—|待验|契约:`~/Workbase/Thirdspace-article/docs/specs/2026-07-18-creation-packet-contract-v0.2.md`|三端点只读幂等:`GET /export/packets?since=<cursor>`(游标列表)/`GET /export/packets/:id`(packet.json v0.2:sourceContent+materials[] 强 schema+contentHash)/`GET /export/packets/:id/assets/<path>`(素材文件+X-Content-SHA256);loopback+token 鉴权;单资产≤50MB;导出即冻结快照。属互通调研 B 档小改,不碰主线;阻塞 ArticleOS SLICE-8(其 CreatorOS 自动进队入口)。fixture 双向测试真值共用 contract/fixtures/packet-v0.2/|",
  "source_sha256": "c3864ed5e904c55a548742bbc8272d7deff18001274233af37a1f41db69ede4e",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-ceb35438"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-372 W-spike",
  "title": "双端地基 spike(先行):Win 系统 tar.exe(bsdtar)对 pnpm symlink/junction 打包-解压保真 + cpSync(verbatimSymlinks) junction 行为 + obfuscate isSymlinkEscape junction 判定,出 spike 报告归 docs/research/",
  "narrative": "sidecar 方案在 Win 的地基,两大风险最先探;需 Windows 实机。",
  "documents": "[SPEC §11.2](docs/superpowers/specs/2026-07-17-license-hardening-and-dual-platform-design.md)",
  "source_line": "|T-372 W-spike|双端地基 spike(先行):Win 系统 tar.exe(bsdtar)对 pnpm symlink/junction 打包-解压保真 + cpSync(verbatimSymlinks) junction 行为 + obfuscate isSymlinkEscape junction 判定,出 spike 报告归 docs/research/|⏸️|—|待验|[SPEC §11.2](docs/superpowers/specs/2026-07-17-license-hardening-and-dual-platform-design.md)|sidecar 方案在 Win 的地基,两大风险最先探;需 Windows 实机。|",
  "source_sha256": "aff90f19f72cfb4f1371a0baca438bfec19748d78e502505377e9f7b23e02539",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-eceb5737"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-372 W-ci",
  "title": "GitHub Actions matrix(macos-latest+windows-latest)跑 tauri-action `tauri build` 出双端安装包 + updater artifact 双端 latest.json 合并 + 内测不签名如实标 signed:false + Windows 真机四主链(扫码/转录/渲染/更新)回归 + DEC-W 退出后同步宪法 §2.3/§16/§17+R-DESKTOP",
  "narrative": "DEC-W:Windows 入正式分发的宪法修正,退出条件达成前对外口径不变;证书公测前采购(遗留项)。**W-ci 前清单(W-core 实现中发现的 Win 功能缺口,非崩溃项)**:①detectTools 探测硬编码 `which`(Win 应 `where`)②素材定位 reveal/route.ts 硬编码 mac `open`(Win 会 ENOENT)。**前置**:repo 领先 origin 120+ commit 未推送,跑 CI 需用户决定推送。",
  "documents": "[SPEC §10/§12](docs/superpowers/specs/2026-07-17-license-hardening-and-dual-platform-design.md)",
  "source_line": "|T-372 W-ci|GitHub Actions matrix(macos-latest+windows-latest)跑 tauri-action `tauri build` 出双端安装包 + updater artifact 双端 latest.json 合并 + 内测不签名如实标 signed:false + Windows 真机四主链(扫码/转录/渲染/更新)回归 + DEC-W 退出后同步宪法 §2.3/§16/§17+R-DESKTOP|⏸️|—|待验|[SPEC §10/§12](docs/superpowers/specs/2026-07-17-license-hardening-and-dual-platform-design.md)|DEC-W:Windows 入正式分发的宪法修正,退出条件达成前对外口径不变;证书公测前采购(遗留项)。**W-ci 前清单(W-core 实现中发现的 Win 功能缺口,非崩溃项)**:①detectTools 探测硬编码 `which`(Win 应 `where`)②素材定位 reveal/route.ts 硬编码 mac `open`(Win 会 ENOENT)。**前置**:repo 领先 origin 120+ commit 未推送,跑 CI 需用户决定推送。|",
  "source_sha256": "a1d3fbbf5987b0d233b06f893ae19b84f4c5fa77eaeebfdfc044257136cb2a37",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-13951026"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-391 H-econ",
  "title": "破解经济学(短板兜底·**后续波次·依赖 L1s 服务端·非本仓·不阻塞内测**):更新强绑授权(过期/吊销拒发更新→patch 版冻结)+ 服务端异常激活遥测(同码多机/指纹漂移/时钟回拨/心跳缺失)→吊销 + 周期复验降级而非 kill。契约复用 T-372 L1s(SPEC §10.5)。",
  "narrative": "对付 native patch 的唯一现实手段(客户端硬防挡不住→服务端看见滥用关掉激活);fail-open 友好不误伤离线用户。",
  "documents": "[SPEC §10/§10.5/§15](docs/superpowers/specs/2026-07-17-native-hardening-and-encrypted-logging-design.md)",
  "source_line": "|T-391 H-econ|破解经济学(短板兜底·**后续波次·依赖 L1s 服务端·非本仓·不阻塞内测**):更新强绑授权(过期/吊销拒发更新→patch 版冻结)+ 服务端异常激活遥测(同码多机/指纹漂移/时钟回拨/心跳缺失)→吊销 + 周期复验降级而非 kill。契约复用 T-372 L1s(SPEC §10.5)。|⏸️|—|待验|[SPEC §10/§10.5/§15](docs/superpowers/specs/2026-07-17-native-hardening-and-encrypted-logging-design.md)|对付 native patch 的唯一现实手段(客户端硬防挡不住→服务端看见滥用关掉激活);fail-open 友好不误伤离线用户。|",
  "source_sha256": "122ece0b009432a5ded6b38d1755655433303a096a735fc0a7e205e6c68b6fd2",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-e322f0f7"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-393",
  "title": "稿面审核状态不刷新:脚本改后重新审核完成,横幅仍说「脚本已改动,当前稿未重新审核」;「先去审核」跳到文案编辑框而非审核卡【bug·真机·用户 2026-07-18】",
  "narrative": "用户拍板:只要脚本改后用户重新审核了(无论采纳与否)横幅即消、允许通过。",
  "documents": "—",
  "source_line": "|T-393|稿面审核状态不刷新:脚本改后重新审核完成,横幅仍说「脚本已改动,当前稿未重新审核」;「先去审核」跳到文案编辑框而非审核卡【bug·真机·用户 2026-07-18】|⏸️|—|待验|—|用户拍板:只要脚本改后用户重新审核了(无论采纳与否)横幅即消、允许通过。|",
  "source_sha256": "24931e4e29cf1f5b8b9000d018bbd456eaa1c2d425bae3062b67d2fa5314536c",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-54ef4a48"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-401",
  "title": "配置备份导出/导入报 `forbidden: request must originate from the local application`【bug·真机·用户 2026-07-18】",
  "narrative": "反查:配置备份=T-363 新加,建卡时漏接 T-372 L2 握手层(L2 晚于 T-363)纯遗漏;封面非本 agent 新加(T-084b/T-271/T-380 早有)。",
  "documents": "—",
  "source_line": "|T-401|配置备份导出/导入报 `forbidden: request must originate from the local application`【bug·真机·用户 2026-07-18】|⏸️|—|待验|—|反查:配置备份=T-363 新加,建卡时漏接 T-372 L2 握手层(L2 晚于 T-363)纯遗漏;封面非本 agent 新加(T-084b/T-271/T-380 早有)。|",
  "source_sha256": "ef17a1887dec096055dae832e815aed8c6370bab902ef52fff209e7a6605a136",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-59a23ad1"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-406",
  "title": "腾讯云 CDN 藏源站 IP + 挡 DDoS + WAF/限流(license.aitongban.cloud / creatoros.aitongban.cloud)【运维·安全·用户 2026-07-18 认可】",
  "narrative": "用户腾讯云服务器,用腾讯云 CDN/EdgeOne;签名体系让 CDN 纯 DDoS/藏 IP 不进信任链。",
  "documents": "—",
  "source_line": "|T-406|腾讯云 CDN 藏源站 IP + 挡 DDoS + WAF/限流(license.aitongban.cloud / creatoros.aitongban.cloud)【运维·安全·用户 2026-07-18 认可】|⏸️|—|待验|—|用户腾讯云服务器,用腾讯云 CDN/EdgeOne;签名体系让 CDN 纯 DDoS/藏 IP 不进信任链。|",
  "source_sha256": "78f5261841f4af3fc0d66fb51720c0fb3071c2ffdd3d34e1f3afb159d907b8e1",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-9468c353"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-407",
  "title": "盲预测深结合历史战绩:建「历史战绩画像」(完播/CTR/播放中位数分布+爆款vs哑弹模式蒸馏)喂进预测 grounding + 飞轮做实(发布后复盘拉真数据→偏差回流精炼画像/校准 rubric)【功能·设计·用户 2026-07-18】",
  "narrative": "用户:借鉴 cheat 但重点是我们自己的品味设计;现盲预测只喂 positioning+learnings+rubric,没深结合原始历史战绩。",
  "documents": "—",
  "source_line": "|T-407|盲预测深结合历史战绩:建「历史战绩画像」(完播/CTR/播放中位数分布+爆款vs哑弹模式蒸馏)喂进预测 grounding + 飞轮做实(发布后复盘拉真数据→偏差回流精炼画像/校准 rubric)【功能·设计·用户 2026-07-18】|⏸️|—|待验|—|用户:借鉴 cheat 但重点是我们自己的品味设计;现盲预测只喂 positioning+learnings+rubric,没深结合原始历史战绩。|",
  "source_sha256": "0661a6b4515e1f44ba26c583bdfb37284fa9d81798399a07e82a8fb30099ff44",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-88c5b056"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-396",
  "title": "渠道化(代理白标)链接 + 更新分发改造【需求·商业模型·用户 2026-07-18 口述,方案当日认可,开工认可 2026-07-18】",
  "narrative": "用户两拍板:①代理不能看到官方定价,链接跟激活码走、后台一次配置、单一安装包;②安装包不进自己 CDN,检查+跳渠道链接,分发成本转飞书/网盘。**交接单**(含:服务端归属=仅 activation-manager,agent-hub/creatoros站/DNS 不改 · 单一安装包绝不分包 · 链接仅作用于激活后、首次下载+发码走代理私域 · 跨仓分工 · 运维坑):`docs/tasks/20260719_T-396_白标渠道链接落地_交接单.md`。**用户 2026-07-19 认可 creatoros 会话接手客户端 T-396b/c**。",
  "documents": "[SPEC](docs/superpowers/specs/2026-07-18-channel-links-and-update-distribution-design.md)",
  "source_line": "|T-396|渠道化(代理白标)链接 + 更新分发改造【需求·商业模型·用户 2026-07-18 口述,方案当日认可,开工认可 2026-07-18】|⏸️|—|待验|[SPEC](docs/superpowers/specs/2026-07-18-channel-links-and-update-distribution-design.md)|用户两拍板:①代理不能看到官方定价,链接跟激活码走、后台一次配置、单一安装包;②安装包不进自己 CDN,检查+跳渠道链接,分发成本转飞书/网盘。**交接单**(含:服务端归属=仅 activation-manager,agent-hub/creatoros站/DNS 不改 · 单一安装包绝不分包 · 链接仅作用于激活后、首次下载+发码走代理私域 · 跨仓分工 · 运维坑):`docs/tasks/20260719_T-396_白标渠道链接落地_交接单.md`。**用户 2026-07-19 认可 creatoros 会话接手客户端 T-396b/c**。|",
  "source_sha256": "6127600c3ed1e03a48d01d26f5b8d5549205af978cb4356000478e41591688a1",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-4f7f60a6"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-398",
  "title": "scheduler 启动清僵尸 ai_task 报 AccountRequiredError(ai.markFailed 需 ctx.accountId,后台调度无账号上下文)【bug·账号隔离回归·日志实证 2026-07-18】",
  "narrative": "T-370 账号全域隔离后,无账号上下文的后台路径调需账号 op 即抛;僵尸清理失败仅报错不崩,但任务残留。修法方向:清理路径带任务所属账号或走系统上下文。",
  "documents": "—",
  "source_line": "|T-398|scheduler 启动清僵尸 ai_task 报 AccountRequiredError(ai.markFailed 需 ctx.accountId,后台调度无账号上下文)【bug·账号隔离回归·日志实证 2026-07-18】|⏸️|—|待验|—|T-370 账号全域隔离后,无账号上下文的后台路径调需账号 op 即抛;僵尸清理失败仅报错不崩,但任务残留。修法方向:清理路径带任务所属账号或走系统上下文。|",
  "source_sha256": "8ae079307df612e926a4bab0312a7f8cae4eafb775db7447e6533a5e6b8986af",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-efdedfc8"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-361",
  "title": "素材视觉模型自动打标签:接 model-config 视觉 capability,上传/采集后自动识别画面内容打标(替代现文件名启发式的增强层)【功能·素材·用户 2026-07-16 提出】",
  "narrative": "现状=classify-asset.ts 文件名规则(录屏/B-roll/实拍);用户已配生图/多模态模型,可复用 multimodal registry;需 SPEC 定触发时机(上传即打 vs 批量补)与成本护栏。",
  "documents": "—",
  "source_line": "|T-361|素材视觉模型自动打标签:接 model-config 视觉 capability,上传/采集后自动识别画面内容打标(替代现文件名启发式的增强层)【功能·素材·用户 2026-07-16 提出】|⏸️|—|待验|—|现状=classify-asset.ts 文件名规则(录屏/B-roll/实拍);用户已配生图/多模态模型,可复用 multimodal registry;需 SPEC 定触发时机(上传即打 vs 批量补)与成本护栏。|",
  "source_sha256": "e496611d06c53d9f59852190a6b70044200eaefa425716df823ad76d49b3f64c",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-934282e0"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-320c",
  "title": "剪辑质量:视频信息卡避让底部字幕带(place() 纵向溢出策略)【T-320b 残留·独立】",
  "narrative": "T-320b 已根治高度低估(文字重合主因);次因=place()(template.ts:690-709)只避让 PiP 口播头安全区、不避让底部字幕带(固定 bottom:56px,:774),竖版卡片多时 py 一路增长侵入字幕区→卡片压字幕。需先给 place() 定义纵向溢出/缩放策略(牵扯 overflow 重设计)再谈避让,故 T-320b 缓做单列。",
  "documents": "[剪辑管线报告](docs/research/2026-07-14-video-editing-pipeline-gaps-research.md)",
  "source_line": "|T-320c|剪辑质量:视频信息卡避让底部字幕带(place() 纵向溢出策略)【T-320b 残留·独立】|⏸️|—|待验|[剪辑管线报告](docs/research/2026-07-14-video-editing-pipeline-gaps-research.md)|T-320b 已根治高度低估(文字重合主因);次因=place()(template.ts:690-709)只避让 PiP 口播头安全区、不避让底部字幕带(固定 bottom:56px,:774),竖版卡片多时 py 一路增长侵入字幕区→卡片压字幕。需先给 place() 定义纵向溢出/缩放策略(牵扯 overflow 重设计)再谈避让,故 T-320b 缓做单列。|",
  "source_sha256": "78415578ddbafb292c034b7568015af3f77e5d177d122a2bda0c84a34d1790f3",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-b8e2ce99"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-350c",
  "title": "S3 · 真机验收:重打包/dev 真跑 AC-1~5(MiniMax 下走通不 cancelled、含营销词自动改合规、采纳后 publishPack 出真物料+publications 出 douyin 行),诚实记残留(真封面图缺口)",
  "narrative": "AI 行为须重启+真机复测(dev-server-restart 铁律);封面图缺口单列不阻塞。**批量包已出**(2026-07-17 20:10,见 T-366c 行)。",
  "documents": "[SPEC §6](docs/superpowers/specs/2026-07-15-publish-package-in-script-tab-design.md)",
  "source_line": "|T-350c|S3 · 真机验收:重打包/dev 真跑 AC-1~5(MiniMax 下走通不 cancelled、含营销词自动改合规、采纳后 publishPack 出真物料+publications 出 douyin 行),诚实记残留(真封面图缺口)|⏸️|—|待验|[SPEC §6](docs/superpowers/specs/2026-07-15-publish-package-in-script-tab-design.md)|AI 行为须重启+真机复测(dev-server-restart 铁律);封面图缺口单列不阻塞。**批量包已出**(2026-07-17 20:10,见 T-366c 行)。|",
  "source_sha256": "2a6ae89a53f819abb3c20fced8fb1dc072b60599658e96940d4d5b403d083d8e",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-914a97c0"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-351",
  "title": "审核能力单一真值化:审核 SOP 从各生成模板抽出→收进**产品级数据**(review_rules 或产品知识库,**非个人 ThirdSpace**)+ 审核做成独立可复用 skill 读它【重构·正交·用户 2026-07-15】",
  "narrative": "用户诉求「审核做成 skill + SOP 进(**产品的**)知识库」。**现状**:①审核 SOP **散且部分硬编码**——platform.adapt 的发布物料审核 SOP 硬写在 prompt(platform-adapt.ts:68-88);script.review 走 L1 review_rules 词表 lint + L2 语义审(script-review-runner.ts)。②`review_rules` 表已是产品级审核数据源(出厂 seed review-rules.seed.ts,三 tier official_hard/empirical/doudplus,复盘回流强制 candidate 人采纳才 active)——**这才是「产品审核 SOP 作为数据」的现成落点**。③产品知识库 knowledge_items 是**按账号隔离**(每号自有,不适合装产品级统一 SOP)。**目标重构**:把审核 SOP 从 platform.adapt/script.review 的硬编码 prompt 里抽出→统一收进产品级数据(**SPEC 定 review_rules vs 新建产品级 knowledge_items 类型**)→审核做成独立 audit skill(仿 favorites.triage 三位一体)通过 reader 读 SOP,替代硬编码→发布物料生成(T-350)与脚本审核共用同一审核 skill。**接入点**:模板+registry+runner+capability 4 处(见调研报告)。**红线**:改数据归属,过 spec-review gate 才开工。",
  "documents": "—",
  "source_line": "|T-351|审核能力单一真值化:审核 SOP 从各生成模板抽出→收进**产品级数据**(review_rules 或产品知识库,**非个人 ThirdSpace**)+ 审核做成独立可复用 skill 读它【重构·正交·用户 2026-07-15】|⏸️|—|待验|—|用户诉求「审核做成 skill + SOP 进(**产品的**)知识库」。**现状**:①审核 SOP **散且部分硬编码**——platform.adapt 的发布物料审核 SOP 硬写在 prompt(platform-adapt.ts:68-88);script.review 走 L1 review_rules 词表 lint + L2 语义审(script-review-runner.ts)。②`review_rules` 表已是产品级审核数据源(出厂 seed review-rules.seed.ts,三 tier official_hard/empirical/doudplus,复盘回流强制 candidate 人采纳才 active)——**这才是「产品审核 SOP 作为数据」的现成落点**。③产品知识库 knowledge_items 是**按账号隔离**(每号自有,不适合装产品级统一 SOP)。**目标重构**:把审核 SOP 从 platform.adapt/script.review 的硬编码 prompt 里抽出→统一收进产品级数据(**SPEC 定 review_rules vs 新建产品级 knowledge_items 类型**)→审核做成独立 audit skill(仿 favorites.triage 三位一体)通过 reader 读 SOP,替代硬编码→发布物料生成(T-350)与脚本审核共用同一审核 skill。**接入点**:模板+registry+runner+capability 4 处(见调研报告)。**红线**:改数据归属,过 spec-review gate 才开工。|",
  "source_sha256": "9ac77b8420cd5f49706758ea2243413e86e9943eabdd175b0557af218ace460f",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-bd291c59"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-349d",
  "title": "S4 · 真机验收:AC-1~5(对标抓稿+幂等复用/图集 skip 诚实/已发布关已有 artifact 展示/纯发布记录抓取/无批量入口·单条失败不连坐),与 T-350c 可同批重打包验",
  "narrative": "含风控失败诚实态;AI/抓取行为须真机复测(dev-server-restart 铁律)。",
  "documents": "[SPEC §5](docs/superpowers/specs/2026-07-15-transcript-fetch-two-surfaces-design.md)",
  "source_line": "|T-349d|S4 · 真机验收:AC-1~5(对标抓稿+幂等复用/图集 skip 诚实/已发布关已有 artifact 展示/纯发布记录抓取/无批量入口·单条失败不连坐),与 T-350c 可同批重打包验|⏸️|—|待验|[SPEC §5](docs/superpowers/specs/2026-07-15-transcript-fetch-two-surfaces-design.md)|含风控失败诚实态;AI/抓取行为须真机复测(dev-server-restart 铁律)。|",
  "source_sha256": "6817e93880d0ef95bb6d1a00339bb3533b58ae86495c0072df5f98b5ae131277",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-3f5789d3"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-339",
  "title": "frontend lint 债务清零:全仓 eslint 2461 errors(历史累积),分簇清完后把 verify.yml 的 lint 步骤从 continue-on-error 改回硬门",
  "narrative": "2026-07-15 ENG-H01 落 CI 时发现;typecheck/test/build 已是硬门",
  "documents": ".github/workflows/verify.yml lint 步",
  "source_line": "|T-339|frontend lint 债务清零:全仓 eslint 2461 errors(历史累积),分簇清完后把 verify.yml 的 lint 步骤从 continue-on-error 改回硬门|⏸️|—|待验|.github/workflows/verify.yml lint 步|2026-07-15 ENG-H01 落 CI 时发现;typecheck/test/build 已是硬门|",
  "source_sha256": "2668bf7138b0693cb3914fcc289062559efed7c2093b3fe1754fe63033660dfb",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-326bb9e3"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-328",
  "title": "修 T-326 上线审计 bug(4 Blocker/26 High/22 Medium/1 Low)→ 重打包【用户 /goal·2026-07-15】",
  "narrative": "架构师审计 NO-GO。按文件簇分工避冲突、按咽喉串行;风险巨大项(账号隔离/事务化)按簇稳做+诚实标残留,不临发布硬塞。",
  "documents": "[审计报告](docs/research/2026-07-15-prelaunch-full-engineering-data-audit-research.md)",
  "source_line": "|T-328|修 T-326 上线审计 bug(4 Blocker/26 High/22 Medium/1 Low)→ 重打包【用户 /goal·2026-07-15】|⏸️|—|待验|[审计报告](docs/research/2026-07-15-prelaunch-full-engineering-data-audit-research.md)|架构师审计 NO-GO。按文件簇分工避冲突、按咽喉串行;风险巨大项(账号隔离/事务化)按簇稳做+诚实标残留,不临发布硬塞。|",
  "source_sha256": "c99017017b6a794a05a6333e3a0164f423c457af2aedd5d1c3da0ac0c209a10b",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-44780d16"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-336",
  "title": "技能配置页诚实化 + 「我的叮嘱」可视化:①下架/弃用僵尸 skill `knowledge.classify`(runner+route 活着但全仓零 UI 调用,distill 已替代,用户改它永不生效)②补 9 个缺中文词表的活 skill(benchmark.teardown/favorites.triage/topic.preference/topic.attribution/trend.extract/video.broll·cards·scenes·subtitles,现裸显英文 id+用途空白)③已定制 skill 给「出厂版↔我的版」diff 视图 ④用户定制条目化成「我的叮嘱」列表(每条:内容/来源对话/作用域/单条启停删)+版本时间线回滚 ⑤产物侧「本次应用了你的 N 条叮嘱」生效证明 ⑥修 skill-config-overrides.ts 过时「18 个」注释(实 34)【检查报告已出·用户 2026-07-15·先不写代码】",
  "narrative": "扫描实证:REGISTRY 34 模板全量列在设置页;33 活 1 僵尸;现 UI 只有「已定制」徽章+生效终值,用户看不出哪里是自己改的、叮嘱被摊平成大文本。叮嘱条目化是 T-318 diff 提案卡的落库形态,先把「看」做好,「改」(T-318)接上就顺。",
  "documents": "—",
  "source_line": "|T-336|技能配置页诚实化 + 「我的叮嘱」可视化:①下架/弃用僵尸 skill `knowledge.classify`(runner+route 活着但全仓零 UI 调用,distill 已替代,用户改它永不生效)②补 9 个缺中文词表的活 skill(benchmark.teardown/favorites.triage/topic.preference/topic.attribution/trend.extract/video.broll·cards·scenes·subtitles,现裸显英文 id+用途空白)③已定制 skill 给「出厂版↔我的版」diff 视图 ④用户定制条目化成「我的叮嘱」列表(每条:内容/来源对话/作用域/单条启停删)+版本时间线回滚 ⑤产物侧「本次应用了你的 N 条叮嘱」生效证明 ⑥修 skill-config-overrides.ts 过时「18 个」注释(实 34)【检查报告已出·用户 2026-07-15·先不写代码】|⏸️|—|待验|—|扫描实证:REGISTRY 34 模板全量列在设置页;33 活 1 僵尸;现 UI 只有「已定制」徽章+生效终值,用户看不出哪里是自己改的、叮嘱被摊平成大文本。叮嘱条目化是 T-318 diff 提案卡的落库形态,先把「看」做好,「改」(T-318)接上就顺。|",
  "source_sha256": "28b41274e98498c4cce3c9d7df8a185c3f0742747e1ec57dcb4ac13a01cbf8b6",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-9bd15bc5"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-335",
  "title": "用户自定义 skill 体系(L2):三层 skill(L0 出厂只读基线 / L1 覆写层=T-318 / L2 用户新建扩展 skill 挂前置注入槽)+ Pi 三角色(教练=对话蒸馏 diff·作者=历史作品蒸馏风格 DNA 起草·科学家=复盘数据回流裁判 skill 版本/A-B)+ skill 导出导入(团队/矩阵账号共享)【产品主轴·用户 2026-07-15 拍板「一定要这样设计」】",
  "narrative": "用户愿景:改文案等创作偏好可内置成用户自己的 skill 扩展,Pi 负责起草/进化,让用户定义自己的创作特性——护城河=「模型是租的,skill 是用户的」,与品味对齐飞轮同轴。红线:系统 skill 永不直改(overlay 可回滚)、进化显式采纳不静默、导入第三方 skill 过注入审查门。顺序:T-328 收口 → T-313 点亮 Pi → T-318(已过审)→ 本任务。",
  "documents": "[Pi SPEC §6](docs/superpowers/specs/2026-07-14-pi-runtime-full-integration-design.md) · [skill-evolution-loop](docs/superpowers/specs/2026-07-03-skill-evolution-loop.md)",
  "source_line": "|T-335|用户自定义 skill 体系(L2):三层 skill(L0 出厂只读基线 / L1 覆写层=T-318 / L2 用户新建扩展 skill 挂前置注入槽)+ Pi 三角色(教练=对话蒸馏 diff·作者=历史作品蒸馏风格 DNA 起草·科学家=复盘数据回流裁判 skill 版本/A-B)+ skill 导出导入(团队/矩阵账号共享)【产品主轴·用户 2026-07-15 拍板「一定要这样设计」】|⏸️|—|待验|[Pi SPEC §6](docs/superpowers/specs/2026-07-14-pi-runtime-full-integration-design.md) · [skill-evolution-loop](docs/superpowers/specs/2026-07-03-skill-evolution-loop.md)|用户愿景:改文案等创作偏好可内置成用户自己的 skill 扩展,Pi 负责起草/进化,让用户定义自己的创作特性——护城河=「模型是租的,skill 是用户的」,与品味对齐飞轮同轴。红线:系统 skill 永不直改(overlay 可回滚)、进化显式采纳不静默、导入第三方 skill 过注入审查门。顺序:T-328 收口 → T-313 点亮 Pi → T-318(已过审)→ 本任务。|",
  "source_sha256": "b5c2f955b111482198bf91fcb50f17ae93cc4fd7ea61bd6d53cb6e4befb047ae",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-20ba43ac"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-337",
  "title": "日志与 AI 可观测性层:①轻量 logger 封装(级别/命名空间/traceId,stdout 天然进 sidecar.log;级别用户可切 debug)②requestId 真生成并贯穿日志行+ai_tasks/job_run(字段名对齐 OTel GenAI 语义约定)③**AI 黑匣子表**:每次 LLM 调用记 capability/model/耗时/token/主路 or fallback/错误分类码/**装配后 prompt+原始响应全文**(本地库+总量上限,数据不出机器;优先接 Vercel AI SDK experimental_telemetry)④错误分类码枚举统一(与 T-334 重试层共享地基)⑤webview 错误落盘(root global-error.tsx+window.onerror→local/client-log)⑥sidecar.log 改按大小/天数轮转+一键诊断包(zip:日志+版本+OS+近期失败摘要)⑦token/成本真算+按 capability/模型/日聚合的「AI 用量」面板 ⑧Pi 会话转录落盘 ⑨publishing.service.ts 五处静默 catch 补日志(可提前并进 T-328 小修)【审计报告已出·用户 2026-07-15;SPEC 已写并拆片 2026-07-15】",
  "narrative": "客户问题复现+产品优化的地基:本地优先是独特优势——prompt/响应全文可放心落本地,黑匣子成本比云产品低;业界对照(OTel GenAI/Langfuse trace-span-generation/pino/桌面端诊断包)全在报告 §3。",
  "documents": "[SPEC](docs/superpowers/specs/2026-07-15-logging-observability-layer-design.md) · [审计报告](docs/research/2026-07-15-logging-observability-audit-research.md)",
  "source_line": "|T-337|日志与 AI 可观测性层:①轻量 logger 封装(级别/命名空间/traceId,stdout 天然进 sidecar.log;级别用户可切 debug)②requestId 真生成并贯穿日志行+ai_tasks/job_run(字段名对齐 OTel GenAI 语义约定)③**AI 黑匣子表**:每次 LLM 调用记 capability/model/耗时/token/主路 or fallback/错误分类码/**装配后 prompt+原始响应全文**(本地库+总量上限,数据不出机器;优先接 Vercel AI SDK experimental_telemetry)④错误分类码枚举统一(与 T-334 重试层共享地基)⑤webview 错误落盘(root global-error.tsx+window.onerror→local/client-log)⑥sidecar.log 改按大小/天数轮转+一键诊断包(zip:日志+版本+OS+近期失败摘要)⑦token/成本真算+按 capability/模型/日聚合的「AI 用量」面板 ⑧Pi 会话转录落盘 ⑨publishing.service.ts 五处静默 catch 补日志(可提前并进 T-328 小修)【审计报告已出·用户 2026-07-15;SPEC 已写并拆片 2026-07-15】|⏸️|—|待验|[SPEC](docs/superpowers/specs/2026-07-15-logging-observability-layer-design.md) · [审计报告](docs/research/2026-07-15-logging-observability-audit-research.md)|客户问题复现+产品优化的地基:本地优先是独特优势——prompt/响应全文可放心落本地,黑匣子成本比云产品低;业界对照(OTel GenAI/Langfuse trace-span-generation/pino/桌面端诊断包)全在报告 §3。|",
  "source_sha256": "1db0d7bbe62ce7c11b29d974f502ab8a23670a5fffc2728ee4ca7da43f9de4c8",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-32c1e32f"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-337a",
  "title": "contract 零依赖 logger(级别/ns/traceId 单行结构化,stdout→sidecar.log 复用 T-259 管道)+ 错误分类码枚举 + `classifyError` 收编三处散装分类(transcribe 5 类/NEEDS_RECONNECT/chat 恢复层)+ 设置页 log_level 开关(热生效)+ 咽喉 console 替换(runner/route/service catch)【SPEC §3.1/§3.4】",
  "narrative": "只换咽喉不动全部 206 处 console;观测 best-effort 永不 throw 主链路。",
  "documents": "[SPEC](docs/superpowers/specs/2026-07-15-logging-observability-layer-design.md)",
  "source_line": "|T-337a|contract 零依赖 logger(级别/ns/traceId 单行结构化,stdout→sidecar.log 复用 T-259 管道)+ 错误分类码枚举 + `classifyError` 收编三处散装分类(transcribe 5 类/NEEDS_RECONNECT/chat 恢复层)+ 设置页 log_level 开关(热生效)+ 咽喉 console 替换(runner/route/service catch)【SPEC §3.1/§3.4】|⏸️|—|待验|[SPEC](docs/superpowers/specs/2026-07-15-logging-observability-layer-design.md)|只换咽喉不动全部 206 处 console;观测 best-effort 永不 throw 主链路。|",
  "source_sha256": "bd7f8811222c15d8ab90319dccad4ff7e2056f91f34325ab2b8f9d036e773433",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-6a762b20"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-337b",
  "title": "traceId 贯穿:requestId 真 uuid(chat route/任务派发/定时 tick 三入口铸造+派生继承)+ ai_tasks.trace_id/job_run.trace_id 新列 + 修 persistence-transport.ts:15 硬编码 `\"persistence\"`【SPEC §3.2】",
  "narrative": "倾向显式传参不引 AsyncLocalStorage,与 ctx 风格一致。",
  "documents": "[SPEC](docs/superpowers/specs/2026-07-15-logging-observability-layer-design.md)",
  "source_line": "|T-337b|traceId 贯穿:requestId 真 uuid(chat route/任务派发/定时 tick 三入口铸造+派生继承)+ ai_tasks.trace_id/job_run.trace_id 新列 + 修 persistence-transport.ts:15 硬编码 `\"persistence\"`【SPEC §3.2】|⏸️|—|待验|[SPEC](docs/superpowers/specs/2026-07-15-logging-observability-layer-design.md)|倾向显式传参不引 AsyncLocalStorage,与 ctx 风格一致。|",
  "source_sha256": "6898545e91f44fd25ae1bfb7ab78b5ef7095e8251b5bd2ddeda2f826df9dceb1",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-98c9aba5"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-337c",
  "title": "AI 黑匣子 `ai_call_log` 表(trace/task/会话关联+capability/model/耗时/token/route 主路 or 兜底/error_code/**装配后 prompt+原始响应全文** 各截 256KB)+ 三收口埋点(runStructuredNode 写端口范式/chat-runner onFinish/pi-engine turn_end)+ 容量治理(2 万行/512MB 最旧先删+设置页占用与清空)+ 任务详情「查看调用记录」【SPEC §3.3】",
  "narrative": "核心切片:治「26+ 节点零记录+fallback 静默+prompt 不落盘」;本地存全文是本地优先产品独有优势。",
  "documents": "[SPEC](docs/superpowers/specs/2026-07-15-logging-observability-layer-design.md)",
  "source_line": "|T-337c|AI 黑匣子 `ai_call_log` 表(trace/task/会话关联+capability/model/耗时/token/route 主路 or 兜底/error_code/**装配后 prompt+原始响应全文** 各截 256KB)+ 三收口埋点(runStructuredNode 写端口范式/chat-runner onFinish/pi-engine turn_end)+ 容量治理(2 万行/512MB 最旧先删+设置页占用与清空)+ 任务详情「查看调用记录」【SPEC §3.3】|⏸️|—|待验|[SPEC](docs/superpowers/specs/2026-07-15-logging-observability-layer-design.md)|核心切片:治「26+ 节点零记录+fallback 静默+prompt 不落盘」;本地存全文是本地优先产品独有优势。|",
  "source_sha256": "8011531afba2f1e8be0a5ca70455fd00836fdc8f4fa3de47aa3809393578f2ca",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-1701b8f2"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-337d",
  "title": "webview 错误落盘:root `global-error.tsx`(现只有 segment 级)+ window.onerror/unhandledrejection → POST /api/v1/local/client-log(loopback 门+60s 去重节流)→ logger → sidecar.log【SPEC §3.5】",
  "narrative": "治「白屏磁盘零痕迹」。",
  "documents": "[SPEC](docs/superpowers/specs/2026-07-15-logging-observability-layer-design.md)",
  "source_line": "|T-337d|webview 错误落盘:root `global-error.tsx`(现只有 segment 级)+ window.onerror/unhandledrejection → POST /api/v1/local/client-log(loopback 门+60s 去重节流)→ logger → sidecar.log【SPEC §3.5】|⏸️|—|待验|[SPEC](docs/superpowers/specs/2026-07-15-logging-observability-layer-design.md)|治「白屏磁盘零痕迹」。|",
  "source_sha256": "a80b5af63ea05e7b626c23248fe97096c17183547b31fc68683efb6ed9bda2f7",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-360f8469"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-337e",
  "title": "logging.rs 轮转改大小制(10MB×5 份+现役,启动不再覆盖 prev)+ 一键诊断包(Rust zip:全份日志+diagnostics.json 版本/OS/模型配置摘要不含密钥/近 50 条失败摘要;默认不含 prompt 正文,勾选附带需明示)【SPEC §3.6】",
  "narrative": "治「按会话留 2 份→隔天反馈即丢」+「导出=让用户手动翻文件夹」。",
  "documents": "[SPEC](docs/superpowers/specs/2026-07-15-logging-observability-layer-design.md)",
  "source_line": "|T-337e|logging.rs 轮转改大小制(10MB×5 份+现役,启动不再覆盖 prev)+ 一键诊断包(Rust zip:全份日志+diagnostics.json 版本/OS/模型配置摘要不含密钥/近 50 条失败摘要;默认不含 prompt 正文,勾选附带需明示)【SPEC §3.6】|⏸️|—|待验|[SPEC](docs/superpowers/specs/2026-07-15-logging-observability-layer-design.md)|治「按会话留 2 份→隔天反馈即丢」+「导出=让用户手动翻文件夹」。|",
  "source_sha256": "febb5a95d4e39d1ee1df170ae2f59434718df1fa6f416e379d65ba0c6b3a200d",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-33a4eeca"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-337f",
  "title": "成本可观测:provider 预设附 pricing(自定义可填,不填只显 token)+ 收口处 cost_usd 真算 + 设置页「AI 用量」面板(按日/capability/模型聚合:调用数/token/成本/失败率)【SPEC §3.7】",
  "narrative": "同时是产品优化数据源:哪些节点贵、哪些能力常失败一屏可见。",
  "documents": "[SPEC](docs/superpowers/specs/2026-07-15-logging-observability-layer-design.md)",
  "source_line": "|T-337f|成本可观测:provider 预设附 pricing(自定义可填,不填只显 token)+ 收口处 cost_usd 真算 + 设置页「AI 用量」面板(按日/capability/模型聚合:调用数/token/成本/失败率)【SPEC §3.7】|⏸️|—|待验|[SPEC](docs/superpowers/specs/2026-07-15-logging-observability-layer-design.md)|同时是产品优化数据源:哪些节点贵、哪些能力常失败一屏可见。|",
  "source_sha256": "affa9dca425892440c7980e360b5dfea481f09d3a602fd8bab8a3f6158a5a961",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-19a74d69"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-337g",
  "title": "Pi 会话转录落盘:SessionManager.inMemory → 文件版(appDataDir/pi-sessions/<aiTaskId>/ JSONL)+ 纳入容量治理;与 T-316 目录约定协同(T-316 管续、本片管留证)【SPEC §3.8】",
  "narrative": "治「agentic 异常内存即焚只剩人话叙述」。",
  "documents": "[SPEC](docs/superpowers/specs/2026-07-15-logging-observability-layer-design.md)",
  "source_line": "|T-337g|Pi 会话转录落盘:SessionManager.inMemory → 文件版(appDataDir/pi-sessions/<aiTaskId>/ JSONL)+ 纳入容量治理;与 T-316 目录约定协同(T-316 管续、本片管留证)【SPEC §3.8】|⏸️|—|待验|[SPEC](docs/superpowers/specs/2026-07-15-logging-observability-layer-design.md)|治「agentic 异常内存即焚只剩人话叙述」。|",
  "source_sha256": "bc71b1722e5b0e1ff2bae4ae21e3dd08ed6f76961623440305c0a0dca79aa7a0",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-6fd6d325"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-334",
  "title": "ai_tasks 任务可靠性层:错误分类(配置错误→引导去设置不重试 / 瞬态→自动退避重试 2-3 次 / 永久→诚实失败)+ 断点续跑 + 失败卡人话原因与一键重试【功能·任务运行时·用户 2026-07-15】",
  "narrative": "用户痛点:自动化/选题生成/爬对标/转录经常失败且失败后不自动重试,体验差。现状实证:chat-runner 已有分类重试+退避+fallback 恢复层(chat-runner.ts:1679),但后台 ai_tasks 全线零重试(transcribe markFailed 即停、benchmark 单源 catch 跳过、topic cancelled)。方案:给任务层做对等的确定性可靠性层,瞬态故障(网络/接口超时/LLM 5xx)自愈,配置错误照旧诚实引导。**分层预留**:确定性重试耗尽 → 未来可升级 Pi 自愈(承 T-324 解冻后,爬取类开放故障归 Pi;两者不冲突)。排在 T-328 发布收口之后。",
  "documents": "—",
  "source_line": "|T-334|ai_tasks 任务可靠性层:错误分类(配置错误→引导去设置不重试 / 瞬态→自动退避重试 2-3 次 / 永久→诚实失败)+ 断点续跑 + 失败卡人话原因与一键重试【功能·任务运行时·用户 2026-07-15】|⏸️|—|待验|—|用户痛点:自动化/选题生成/爬对标/转录经常失败且失败后不自动重试,体验差。现状实证:chat-runner 已有分类重试+退避+fallback 恢复层(chat-runner.ts:1679),但后台 ai_tasks 全线零重试(transcribe markFailed 即停、benchmark 单源 catch 跳过、topic cancelled)。方案:给任务层做对等的确定性可靠性层,瞬态故障(网络/接口超时/LLM 5xx)自愈,配置错误照旧诚实引导。**分层预留**:确定性重试耗尽 → 未来可升级 Pi 自愈(承 T-324 解冻后,爬取类开放故障归 Pi;两者不冲突)。排在 T-328 发布收口之后。|",
  "source_sha256": "c22d7ba2256506d123cc4eedea81d3ff3164f6e063b9eece6a771f6926bf21ff",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-151526ff"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-324",
  "title": "Pi 全面接管:抓取网页/截图/自动化任务/剪辑切到 Pi 引擎;自动化任务=模板脚本 + 沙箱模式,Pi 自纠错调试到跑通【设计·SPEC+gate·母于 T-314·用户 2026-07-15】",
  "narrative": "用户 2026-07-15:把 web-capture 抓取/截图、自动化任务(定时采集/发布)、剪辑都切到 Pi 引擎;**自动化任务尤其**——用**模板脚本**起、启动**沙箱模式**让 Pi「先跑脚本、遇错自纠、尽情调试」直到保证跑通(用户看重 Pi 自愈能力)。**crux 已拍板:给 Pi 真 bash/fs 隔离沙箱**(重开 T-313 已物理排除的 bash/edit/write,但限死在隔离沙箱内;app 源码/`~/.creatoros` 密钥/用户 DB 必须在沙箱外)。范围:①web 抓取/截图落 Pi ②自动化任务模板脚本化 + Pi 真沙箱自调试到跑通 ③剪辑接 Pi(承 T-312/T-320)。母于 T-314 落点地图,不与 L1 自愈(research/material/collect)重复。**流程:研究(Pi 原生沙箱/exec + macOS 沙箱可选项 + 隔离边界,归档 docs/research/2026-07-15-pi-sandbox-automation-research.md)→ SPEC → gate → 拆片**。",
  "documents": "[Pi SPEC](docs/superpowers/specs/2026-07-14-pi-runtime-full-integration-design.md)",
  "source_line": "|T-324|Pi 全面接管:抓取网页/截图/自动化任务/剪辑切到 Pi 引擎;自动化任务=模板脚本 + 沙箱模式,Pi 自纠错调试到跑通【设计·SPEC+gate·母于 T-314·用户 2026-07-15】|⏸️|—|待验|[Pi SPEC](docs/superpowers/specs/2026-07-14-pi-runtime-full-integration-design.md)|用户 2026-07-15:把 web-capture 抓取/截图、自动化任务(定时采集/发布)、剪辑都切到 Pi 引擎;**自动化任务尤其**——用**模板脚本**起、启动**沙箱模式**让 Pi「先跑脚本、遇错自纠、尽情调试」直到保证跑通(用户看重 Pi 自愈能力)。**crux 已拍板:给 Pi 真 bash/fs 隔离沙箱**(重开 T-313 已物理排除的 bash/edit/write,但限死在隔离沙箱内;app 源码/`~/.creatoros` 密钥/用户 DB 必须在沙箱外)。范围:①web 抓取/截图落 Pi ②自动化任务模板脚本化 + Pi 真沙箱自调试到跑通 ③剪辑接 Pi(承 T-312/T-320)。母于 T-314 落点地图,不与 L1 自愈(research/material/collect)重复。**流程:研究(Pi 原生沙箱/exec + macOS 沙箱可选项 + 隔离边界,归档 docs/research/2026-07-15-pi-sandbox-automation-research.md)→ SPEC → gate → 拆片**。|",
  "source_sha256": "028e1121e0db50340959ae5ff0c32db0bd685244e08fb60e13e0eb4ca922623c",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-e981a803"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-340",
  "title": "agentic.research 三端口真接线(gate-M2 硬前提):web.search 复用编导检索层 + web.read 复用 T-217 Vault+Reader + knowledge.write 复用知识 pending 写入确认门——替换 persistence-client.ts:7023-7033 的诚实 501 throw(RT-H07 修复留下的形状,端口签名不变,executor/框架零改动);接完立即真跑 gate-M2(用户 MiniMax-M3,判据 SPEC §11:多步不崩/不无限绕/产出可用候选)收官 T-313【用户 2026-07-15·gate-M2 提上日程】",
  "narrative": "完整 gate-M2 现在跑不通不是模型问题:三端口被 RT-H07 修成诚实 501(防幻觉,方向对),循环首次调工具即诚实失败。三端口全是复用现成能力非新造。gate-M2 达标 = T-313 收官 + T-324 解冻条件之一。",
  "documents": "[Pi SPEC §11](docs/superpowers/specs/2026-07-14-pi-runtime-full-integration-design.md)",
  "source_line": "|T-340|agentic.research 三端口真接线(gate-M2 硬前提):web.search 复用编导检索层 + web.read 复用 T-217 Vault+Reader + knowledge.write 复用知识 pending 写入确认门——替换 persistence-client.ts:7023-7033 的诚实 501 throw(RT-H07 修复留下的形状,端口签名不变,executor/框架零改动);接完立即真跑 gate-M2(用户 MiniMax-M3,判据 SPEC §11:多步不崩/不无限绕/产出可用候选)收官 T-313【用户 2026-07-15·gate-M2 提上日程】|⏸️|—|待验|[Pi SPEC §11](docs/superpowers/specs/2026-07-14-pi-runtime-full-integration-design.md)|完整 gate-M2 现在跑不通不是模型问题:三端口被 RT-H07 修成诚实 501(防幻觉,方向对),循环首次调工具即诚实失败。三端口全是复用现成能力非新造。gate-M2 达标 = T-313 收官 + T-324 解冻条件之一。|",
  "source_sha256": "8d33527ef3b5262c267ebfddc1071c6752d11c0392cd28585c750f874b80b8c9",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-b2ea5704"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-315",
  "title": "Pi 记忆层·memory-tool(读):现有 14 表经 Context 层包成 Pi 记忆检索工具 + 作用域收窄防串味【SPEC §5.2】",
  "narrative": "复用 chat-context/creative-context 的 reader 组合,不新建 store;Pi 循环内可查定位/爆款要素/learnings/选题偏好。",
  "documents": "[SPEC §5](docs/superpowers/specs/2026-07-14-pi-runtime-full-integration-design.md)",
  "source_line": "|T-315|Pi 记忆层·memory-tool(读):现有 14 表经 Context 层包成 Pi 记忆检索工具 + 作用域收窄防串味【SPEC §5.2】|⏸️|—|待验|[SPEC §5](docs/superpowers/specs/2026-07-14-pi-runtime-full-integration-design.md)|复用 chat-context/creative-context 的 reader 组合,不新建 store;Pi 循环内可查定位/爆款要素/learnings/选题偏好。|",
  "source_sha256": "e11a4fdb0103b079c9e1d24020382d19e2a0802984d6f4fe2b55c22e1fa37690",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-9e003f50"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-316",
  "title": "Pi 会话续(受控):pi-coding-agent JSONL SessionManager → appDataDir/pi-sessions,**默认每项目一会话**防跨项目串味【SPEC §5.2】",
  "narrative": "用户点出会话续有风险;auto-compaction 内置白拿;会话文件本地、随项目删。",
  "documents": "[SPEC §5](docs/superpowers/specs/2026-07-14-pi-runtime-full-integration-design.md)",
  "source_line": "|T-316|Pi 会话续(受控):pi-coding-agent JSONL SessionManager → appDataDir/pi-sessions,**默认每项目一会话**防跨项目串味【SPEC §5.2】|⏸️|—|待验|[SPEC §5](docs/superpowers/specs/2026-07-14-pi-runtime-full-integration-design.md)|用户点出会话续有风险;auto-compaction 内置白拿;会话文件本地、随项目删。|",
  "source_sha256": "0b0b3cbb16b75f39592c294d3fda4085d72725803ec0293f71f34d2b41dc3efe",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-b3eb3c4b"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-317",
  "title": "跨会话偏好捕捉:对话里偏好/纠正经采纳门 → creator_profiles.downstreamRules/learnings/topic_preferences,新会话经 brief 带回【SPEC §5.2】",
  "narrative": "补「纯聊天偏好留不住」缺口;不做整段聊天无差别喂回(噪声+隐私)。",
  "documents": "[SPEC §5](docs/superpowers/specs/2026-07-14-pi-runtime-full-integration-design.md)",
  "source_line": "|T-317|跨会话偏好捕捉:对话里偏好/纠正经采纳门 → creator_profiles.downstreamRules/learnings/topic_preferences,新会话经 brief 带回【SPEC §5.2】|⏸️|—|待验|[SPEC §5](docs/superpowers/specs/2026-07-14-pi-runtime-full-integration-design.md)|补「纯聊天偏好留不住」缺口;不做整段聊天无差别喂回(噪声+隐私)。|",
  "source_sha256": "85d175948c978add088ef22007a93a8d0877b929a386992ea0de48a42be5222f",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-6a76af4e"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-318",
  "title": "对话式 skill/记忆进化(飞轮,复活 T-087 skill.evolve diff 卡)+ §6 护栏全套【SPEC §6】",
  "narrative": "采纳门零直写+版本回滚+**范围收窄(只 system/template,tools/schema 禁改)**+注入防护(local-env-probe 范式)+干跑门+作用域绑定。skill=prompt 非代码。",
  "documents": "[SPEC §6](docs/superpowers/specs/2026-07-14-pi-runtime-full-integration-design.md)",
  "source_line": "|T-318|对话式 skill/记忆进化(飞轮,复活 T-087 skill.evolve diff 卡)+ §6 护栏全套【SPEC §6】|⏸️|—|待验|[SPEC §6](docs/superpowers/specs/2026-07-14-pi-runtime-full-integration-design.md)|采纳门零直写+版本回滚+**范围收窄(只 system/template,tools/schema 禁改)**+注入防护(local-env-probe 范式)+干跑门+作用域绑定。skill=prompt 非代码。|",
  "source_sha256": "232a17198fc11cf4bd76aac362ec5b119455d0b8f6a5026a11001130dcae5d59",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-92c7b86e"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-319",
  "title": "Pi 接 MCP client(装 pi-mcp-adapter,复用现有 MCP 工具;可选按需)【SPEC §10】",
  "narrative": "pi-mcp-adapter 读 Claude Code 同款 mcp.json,现有 MCP 工具直接喂 Pi。",
  "documents": "[SPEC §10](docs/superpowers/specs/2026-07-14-pi-runtime-full-integration-design.md)",
  "source_line": "|T-319|Pi 接 MCP client(装 pi-mcp-adapter,复用现有 MCP 工具;可选按需)【SPEC §10】|⏸️|—|待验|[SPEC §10](docs/superpowers/specs/2026-07-14-pi-runtime-full-integration-design.md)|pi-mcp-adapter 读 Claude Code 同款 mcp.json,现有 MCP 工具直接喂 Pi。|",
  "source_sha256": "851dec92ffe276f7c95e1047ae0e75f2e66cb5f1221b34684d5044ac67fc7bcb",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-91e6e13a"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-312",
  "title": "编导式/对话式剪辑 + ChatCut(SPEC track·母任务)【用户 2026-07-14 拍板】",
  "narrative": "三报告:[Pi](docs/research/2026-07-14-pi-runtime-integration-research.md)/[ChatCut](docs/research/2026-07-14-chatcut-integration-research.md)/[剪辑管线](docs/research/2026-07-14-video-editing-pipeline-gaps-research.md)。用户拍板:①**不接 ChatCut**(闭源云、素材上云、破「本地优先·数据归属」宪法);②**先点亮 Pi**(T-313),剪辑/字幕校正做成 **Pi 能调的 skill**;③**字幕修正=文本校正非时间回锚**——用户澄清 SRT 时间轴本身对齐,问题是 ASR 把某些字识别错(和口播稿对不上),要在 skill 里校正文本(推翻 R3「回锚音频」判断,WhisperX 时间对齐非所需)。剩余子任务(对话式剪辑数据模型:稳定 id/持久决策文档/位置+字幕文本覆盖/patch 原语+增量重渲;文字重合真测高;字幕文本校正 skill)Pi 点亮后写 SPEC 过审再拆。",
  "documents": "[T-256 SPEC](docs/superpowers/specs/2026-07-12-controlled-agentic-runtime-design.md)",
  "source_line": "|T-312|编导式/对话式剪辑 + ChatCut(SPEC track·母任务)【用户 2026-07-14 拍板】|⏸️|—|待验|[T-256 SPEC](docs/superpowers/specs/2026-07-12-controlled-agentic-runtime-design.md)|三报告:[Pi](docs/research/2026-07-14-pi-runtime-integration-research.md)/[ChatCut](docs/research/2026-07-14-chatcut-integration-research.md)/[剪辑管线](docs/research/2026-07-14-video-editing-pipeline-gaps-research.md)。用户拍板:①**不接 ChatCut**(闭源云、素材上云、破「本地优先·数据归属」宪法);②**先点亮 Pi**(T-313),剪辑/字幕校正做成 **Pi 能调的 skill**;③**字幕修正=文本校正非时间回锚**——用户澄清 SRT 时间轴本身对齐,问题是 ASR 把某些字识别错(和口播稿对不上),要在 skill 里校正文本(推翻 R3「回锚音频」判断,WhisperX 时间对齐非所需)。剩余子任务(对话式剪辑数据模型:稳定 id/持久决策文档/位置+字幕文本覆盖/patch 原语+增量重渲;文字重合真测高;字幕文本校正 skill)Pi 点亮后写 SPEC 过审再拆。|",
  "source_sha256": "1b50ea706ee5effb4c308b03fffe32581ca94a4a9264297f7588bcff2c350c3f",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-24dc64b7"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-307",
  "title": "playwright 启动点统一浏览器选择(截图崩 chrome-headless-shell + GitHub 登录读不到)【bug·阻断·T-299 收尾】",
  "narrative": "两个 bug 同源=浏览器选择不统一:①**截图**(web-capture.ts:90 `chromium.launch` 没传 executablePath)→ headless 找 chrome-headless-shell(打包没打)崩,同 T-299 漏网点。②**GitHub 登录**:登录(web-session `channel:\"chrome\"` 系统 Chrome)存 `.auth/web/github.com`,但读取(web-reader T-299 用打包 Chromium-for-Testing)是**不同浏览器**——Chrome 用系统钥匙串加密 cookie,Chromium-for-Testing 解不开→读不到登录态→报\"未登录\"。修:抽统一 `launchWithBrowser`(优先 channel:chrome→回落打包 chromium executablePath),web-session/web-reader/web-capture 全用它→登录与读取同浏览器、profile 互通,顺带根治 headless-shell。",
  "documents": "—",
  "source_line": "|T-307|playwright 启动点统一浏览器选择(截图崩 chrome-headless-shell + GitHub 登录读不到)【bug·阻断·T-299 收尾】|⏸️|—|待验|—|两个 bug 同源=浏览器选择不统一:①**截图**(web-capture.ts:90 `chromium.launch` 没传 executablePath)→ headless 找 chrome-headless-shell(打包没打)崩,同 T-299 漏网点。②**GitHub 登录**:登录(web-session `channel:\"chrome\"` 系统 Chrome)存 `.auth/web/github.com`,但读取(web-reader T-299 用打包 Chromium-for-Testing)是**不同浏览器**——Chrome 用系统钥匙串加密 cookie,Chromium-for-Testing 解不开→读不到登录态→报\"未登录\"。修:抽统一 `launchWithBrowser`(优先 channel:chrome→回落打包 chromium executablePath),web-session/web-reader/web-capture 全用它→登录与读取同浏览器、profile 互通,顺带根治 headless-shell。|",
  "source_sha256": "453b574ccbb783237ebd2db91eeff56afd7f624fa5d32732762c869a7d6675f2",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-688691d3"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-306",
  "title": "首页「页面加载失败,请稍后重试」【bug·待复现·疑似瞬时】",
  "narrative": "用户实测点首页报错误边界「页面加载失败」。实测 `pages.dashboard.get` 后端**返回正常**(error:null,数据全在);且更早截图首页 4 widget 渲染正常。疑似**瞬时**:排障期我连开 3 次后台重打包吃满 CPU → 首页 SSR 自调 sidecar 超时 → 错误边界。**重装(无重打包 CPU 负载)后复测**;若仍稳定复现再查客户端渲染/session。",
  "documents": "—",
  "source_line": "|T-306|首页「页面加载失败,请稍后重试」【bug·待复现·疑似瞬时】|⏸️|—|待验|—|用户实测点首页报错误边界「页面加载失败」。实测 `pages.dashboard.get` 后端**返回正常**(error:null,数据全在);且更早截图首页 4 widget 渲染正常。疑似**瞬时**:排障期我连开 3 次后台重打包吃满 CPU → 首页 SSR 自调 sidecar 超时 → 错误边界。**重装(无重打包 CPU 负载)后复测**;若仍稳定复现再查客户端渲染/session。|",
  "source_sha256": "b7066e800bb4cf43c015cd591fbde611509d83906eb34b9a70267f4bdc40fdef",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-1a73cd6f"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-301",
  "title": "首页 4 个空 widget 规划:待办事项/热门选题热度/数据概览/创作建议【产品·设计·调研已完成】",
  "narrative": "调研定论(query-services→persistence-client→dashboard-page):**2 块真坏(半接线 bug)+2 块真空态(正常)**。①**待办事项**=半接线 bug:读侧(getDashboardSummary→listTasks)+完成侧(patchTask)都接了,但**写侧全仓没人调 `projects.tasks.create`**(ai-runtime 的 createTask 是另一张 ai_tasks 表)→ 结构性永远 0。修:接生产者(立项/阶段推进/待复盘作品/待确认渲染→自动生成待办)。②**热门选题热度**=半接线 bug:选题是真数据,但 `predictedScore` 从不落库(candidate.service.ts:440 createCandidate 硬编码 null;topic-daily-collector 算了 baseScore/adjustedScore 却在 :258 落库时丢弃)→ 热度死列恒 0。修:把算出的分写库 / 加评分回填 op。③**数据概览**=真空态正常(persistence-client:6352 要求 ≥2 天快照才出 trend,单日不画假平线)。④**创作建议**=真空态正常(learnings getSuggestions 只读 validated,需 review→learnings 闭环)。→ 拆:待办生产者 + 热度落库两条真做;数据概览/创作建议不动(有数据自然就有)。",
  "documents": "—",
  "source_line": "|T-301|首页 4 个空 widget 规划:待办事项/热门选题热度/数据概览/创作建议【产品·设计·调研已完成】|⏸️|—|待验|—|调研定论(query-services→persistence-client→dashboard-page):**2 块真坏(半接线 bug)+2 块真空态(正常)**。①**待办事项**=半接线 bug:读侧(getDashboardSummary→listTasks)+完成侧(patchTask)都接了,但**写侧全仓没人调 `projects.tasks.create`**(ai-runtime 的 createTask 是另一张 ai_tasks 表)→ 结构性永远 0。修:接生产者(立项/阶段推进/待复盘作品/待确认渲染→自动生成待办)。②**热门选题热度**=半接线 bug:选题是真数据,但 `predictedScore` 从不落库(candidate.service.ts:440 createCandidate 硬编码 null;topic-daily-collector 算了 baseScore/adjustedScore 却在 :258 落库时丢弃)→ 热度死列恒 0。修:把算出的分写库 / 加评分回填 op。③**数据概览**=真空态正常(persistence-client:6352 要求 ≥2 天快照才出 trend,单日不画假平线)。④**创作建议**=真空态正常(learnings getSuggestions 只读 validated,需 review→learnings 闭环)。→ 拆:待办生产者 + 热度落库两条真做;数据概览/创作建议不动(有数据自然就有)。|",
  "source_sha256": "ea7a8bb2a309dcebbf135268fbb27516fc2e6b39cab9ca575bf342ae829ff185",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-1bef533c"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-302",
  "title": "首页待办事项接生产者——派生 actionable 待办(待确认渲染/待复盘)【bug·首页·T-301 拆】",
  "narrative": "待办死卡(恒 0)根因:读侧(getDashboardSummary→listTasks)+完成侧(patchTask)都接了,写侧全仓没人调 projects.tasks.create。修:getDashboardSummary.todos 改为**读时派生**当前状态的 actionable 待办——①待确认渲染(exec.video.render 处 awaiting_confirmation→采纳成片)②待复盘(已发布 output 无复盘)③(可选)进行中项目待继续。派生项渲染成可点跳转(去对应页),状态变了自动消失;不再依赖没人写的 stored task。",
  "documents": "—",
  "source_line": "|T-302|首页待办事项接生产者——派生 actionable 待办(待确认渲染/待复盘)【bug·首页·T-301 拆】|⏸️|—|待验|—|待办死卡(恒 0)根因:读侧(getDashboardSummary→listTasks)+完成侧(patchTask)都接了,写侧全仓没人调 projects.tasks.create。修:getDashboardSummary.todos 改为**读时派生**当前状态的 actionable 待办——①待确认渲染(exec.video.render 处 awaiting_confirmation→采纳成片)②待复盘(已发布 output 无复盘)③(可选)进行中项目待继续。派生项渲染成可点跳转(去对应页),状态变了自动消失;不再依赖没人写的 stored task。|",
  "source_sha256": "87c178873f079513528e5c5c2f3adcfeb87a4f40e718cb57e26f245660c1ceba",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-9f9614fc"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-261",
  "title": "AI 关联飞轮(自动建网)",
  "narrative": "T-260 gate剔出(违铁律④):AI关联从on-demand升级飞轮——新增蒸馏/累积阈值自动跑runKnowledgeRelate产候选(仍走确认门)。需单独定触发策略+去重+别打扰,SPEC先行。",
  "documents": "[SPEC §3.2剔出](docs/superpowers/specs/2026-07-12-knowledge-graph-ai-relations-design.md)",
  "source_line": "|T-261|AI 关联飞轮(自动建网)|⏸️|—|待验|[SPEC §3.2剔出](docs/superpowers/specs/2026-07-12-knowledge-graph-ai-relations-design.md)|T-260 gate剔出(违铁律④):AI关联从on-demand升级飞轮——新增蒸馏/累积阈值自动跑runKnowledgeRelate产候选(仍走确认门)。需单独定触发策略+去重+别打扰,SPEC先行。|",
  "source_sha256": "a3e3827c54726bb174631cb19527ed4c3f5a04f751dc228af7d55ce5a2781016",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-d135e45b"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-249",
  "title": "统一真机验证清单(考古跨任务残留承接)",
  "narrative": "一次真机会话打勾:①topic.enrich 富卡真渲染(T-117)②上传 PDF/Word→弹药→文案紧扣事实端到端(T-146)③keychain 持久+真激活码+updater 端到端(T-147)④配 image/video key 后生图生视频链路(T-020 M5)⑤T-243 覆盖率数字。",
  "documents": "—",
  "source_line": "|T-249|统一真机验证清单(考古跨任务残留承接)|⏸️|—|待验|—|一次真机会话打勾:①topic.enrich 富卡真渲染(T-117)②上传 PDF/Word→弹药→文案紧扣事实端到端(T-146)③keychain 持久+真激活码+updater 端到端(T-147)④配 image/video key 后生图生视频链路(T-020 M5)⑤T-243 覆盖率数字。|",
  "source_sha256": "167c5326ce4d3d4eee43a9ef6590ba0978173bca75fddf2609058eef75efcfb2",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-4501cdb3"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-250",
  "title": "工程健康批(T-145 残留收编,低优)",
  "narrative": "A7-9 大 service 拆分/A5-6 review·reviews 改名/C30 spec frontmatter/E44 CI 门禁/E41 硬门 + T-012 残留(reviewer 自动化+PreToolUse 拦未过审)。宣发后做。",
  "documents": "—",
  "source_line": "|T-250|工程健康批(T-145 残留收编,低优)|⏸️|—|待验|—|A7-9 大 service 拆分/A5-6 review·reviews 改名/C30 spec frontmatter/E44 CI 门禁/E41 硬门 + T-012 残留(reviewer 自动化+PreToolUse 拦未过审)。宣发后做。|",
  "source_sha256": "8fc0f9db90b7a6f7574d59c92487c05f9c625aadcf5165440af9ed51311861d8",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-357d19b3"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-255b",
  "title": "~~agent 引擎 executor 集成~~ **已并入 T-256b/d**",
  "narrative": "升级为「受控自主运行时」(T-256),Pi vs OpenCode 实测归 T-256d;本行保留防悬挂。",
  "documents": "[SPEC](docs/superpowers/specs/2026-07-12-controlled-agentic-runtime-design.md)",
  "source_line": "|T-255b|~~agent 引擎 executor 集成~~ **已并入 T-256b/d**|⏸️|—|待验|[SPEC](docs/superpowers/specs/2026-07-12-controlled-agentic-runtime-design.md)|升级为「受控自主运行时」(T-256),Pi vs OpenCode 实测归 T-256d;本行保留防悬挂。|",
  "source_sha256": "660b5b157fa993db93eab98ca76ef2e4d60b89677d7c6e90afe21e68c6357d1c",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-6ae8a118"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-185R",
  "title": "访谈后替用户起草 custom skill(考古收敛自 T-185;elicitation 机制已被 T-210 落地证明)",
  "narrative": "恢复 T-087 时一并。",
  "documents": "—",
  "source_line": "|T-185R|访谈后替用户起草 custom skill(考古收敛自 T-185;elicitation 机制已被 T-210 落地证明)|⏸️|—|待验|—|恢复 T-087 时一并。|",
  "source_sha256": "57ab93767714697c6692740e1106935e4031bf5ce96daf2eca9d3ecef47a04e6",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-2cec6296"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-136R",
  "title": "多账号残留两点(考古收敛自 T-136):①多号并存时定时 job 精确 targeting ②双号真机端到端(切号数据真隔离)",
  "narrative": "T-201/214/220/227 已覆盖单号全链;此两点等真有第二个号再做。",
  "documents": "—",
  "source_line": "|T-136R|多账号残留两点(考古收敛自 T-136):①多号并存时定时 job 精确 targeting ②双号真机端到端(切号数据真隔离)|⏸️|—|待验|—|T-201/214/220/227 已覆盖单号全链;此两点等真有第二个号再做。|",
  "source_sha256": "a52dd7bc33955c15f649eb5f9d97f46bffa8abd412159f09fd94114349d60e13",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-6fbf95ad"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-100",
  "title": "单视频分析页(观众/来源/留存维度)",
  "narrative": "考古合并 D8b/T-030-D8b 三行为此一行。",
  "documents": "—",
  "source_line": "|T-100|单视频分析页(观众/来源/留存维度)|⏸️|—|待验|—|考古合并 D8b/T-030-D8b 三行为此一行。|",
  "source_sha256": "9226ee5216a1b6996326eb48ea1c06b3a2991414288559937b4cb01a3b90d65b",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-894b4b71"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-087",
  "title": "Skill 迭代循环机制(经验回流进化,防污染设计)",
  "narrative": "用户场景:审核通过但实际违规→复盘时告诉 Agent 触发了什么违禁词→Skill 进化;方向:每 Skill 挂经验/迭代库 或 统一经验池+Skill 引用;用户红线「一定要好好设计,随意引用经验污染 Skill 很麻烦」——必须 SPEC 先行+过审,设计引用门槛/生效确认门/可回滚;切片 a 经验作用域 appliesToSkills/b skill.evolve diff 确认门/c 污染检测归因;防污染四道闸",
  "documents": "[skill-evolution-loop](docs/superpowers/specs/2026-07-03-skill-evolution-loop.md) ✅PASS",
  "source_line": "|T-087|Skill 迭代循环机制(经验回流进化,防污染设计)|⏸️|—|待验|[skill-evolution-loop](docs/superpowers/specs/2026-07-03-skill-evolution-loop.md) ✅PASS|用户场景:审核通过但实际违规→复盘时告诉 Agent 触发了什么违禁词→Skill 进化;方向:每 Skill 挂经验/迭代库 或 统一经验池+Skill 引用;用户红线「一定要好好设计,随意引用经验污染 Skill 很麻烦」——必须 SPEC 先行+过审,设计引用门槛/生效确认门/可回滚;切片 a 经验作用域 appliesToSkills/b skill.evolve diff 确认门/c 污染检测归因;防污染四道闸|",
  "source_sha256": "72eb797a49cb17ed7477fb0552ad57cebcb37388e3b97d69ecef49f451908929",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-b16b9f75"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-045",
  "title": "激活码授权 + 本机单用户模式(完整方案)",
  "narrative": "用户暂缓。reviewer CONCERNS(3 major:middleware 现状描述错/seed 用户交互未定义/activate-setup 时序矛盾,详见 SPEC 顶部裁决注);恢复时先处置再在 T-046 直通层上叠激活码/向导",
  "documents": "[activation-single-user](docs/superpowers/specs/2026-07-02-activation-single-user-design.md) + [REVIEW_LEDGER](docs/superpowers/specs/REVIEW_LEDGER.md)",
  "source_line": "|T-045|激活码授权 + 本机单用户模式(完整方案)|⏸️|—|待验|[activation-single-user](docs/superpowers/specs/2026-07-02-activation-single-user-design.md) + [REVIEW_LEDGER](docs/superpowers/specs/REVIEW_LEDGER.md)|用户暂缓。reviewer CONCERNS(3 major:middleware 现状描述错/seed 用户交互未定义/activate-setup 时序矛盾,详见 SPEC 顶部裁决注);恢复时先处置再在 T-046 直通层上叠激活码/向导|",
  "source_sha256": "a5445762e2abe6df3e0960c6450df20289e0378b3f0dd10f2c2aeb8c0a590de8",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```


<!-- backlog-archive-provenance: docs/verification/t1432/historical-id-provenance.json -->

<a id="m-a9a9b9cf"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-867",
  "title": "恢复 AI 对项目素材与分镜场景的自动语义匹配【用户真机截图·2026-08-17】",
  "narrative": "用户在最新本地包的“AI 分场决策”中看到 8 个项目素材全部落成“可选补充素材”，每个都要求人工选择场景；用户明确纠偏：这些素材本应由 AI 根据确认稿、素材内容和场景语义自动匹配，人工只检查和少量改绑。必须先锁定素材从项目库存进入 `video.decisions` 输入、模型输出绑定、候选归一与前端回显的首个丢失点；正式方案默认自动编排可用素材到合理场景并显示匹配结果/理由，只有确实不适合或语义证据不足的素材才留在可选区，禁止代码用文件名词表或字符串相似度冒充匹配。用户无需逐条选择即可确认成片，手工场景选择只保留为纠正入口；已有人工绑定必须完整回显、可改可清。补真实失败形状红测、模型输入/输出与前端正常及最小窗口回归；不自动采纳、不修改用户当前项目或已确认方案。",
  "documents": "用户截图 + 复用既有 `video.decisions` 候选确认契约",
  "source_line": "|T-867|恢复 AI 对项目素材与分镜场景的自动语义匹配【用户真机截图·2026-08-17】|🔨|—|待验|用户截图 + 复用既有 `video.decisions` 候选确认契约|用户在最新本地包的“AI 分场决策”中看到 8 个项目素材全部落成“可选补充素材”，每个都要求人工选择场景；用户明确纠偏：这些素材本应由 AI 根据确认稿、素材内容和场景语义自动匹配，人工只检查和少量改绑。必须先锁定素材从项目库存进入 `video.decisions` 输入、模型输出绑定、候选归一与前端回显的首个丢失点；正式方案默认自动编排可用素材到合理场景并显示匹配结果/理由，只有确实不适合或语义证据不足的素材才留在可选区，禁止代码用文件名词表或字符串相似度冒充匹配。用户无需逐条选择即可确认成片，手工场景选择只保留为纠正入口；已有人工绑定必须完整回显、可改可清。补真实失败形状红测、模型输入/输出与前端正常及最小窗口回归；不自动采纳、不修改用户当前项目或已确认方案。|",
  "source_sha256": "ab08a85a0291eba86e581620f588df181f0f3ef66304cc4d18914cdf706ebddf",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-32db98ff"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-860",
  "title": "修复竖屏素材底边与左下人物框边界重合【用户截图·2026-08-16】",
  "narrative": "用户在 v6 预览中指出横版录屏的下边界与左下角人物 PiP 上边界发生视觉重合。必须以真实 1080×1920 几何补红测：人物框下移并适度缩小，在素材完整 `contain` 的可见底边下方保留明确空隙，同时仍停在双语字幕安全区上方；渲染器安全门须同时拒绝人物压素材、人物压字幕两类布局。重做 v7 短样片、对应稳定帧与转场密集接触表，用户确认前不重渲整片。",
  "documents": "复用 [T-859 SPEC](docs/superpowers/specs/2026-08-16-portrait-material-pip-smooth-transition.md) AC-859-1 与用户截图",
  "source_line": "|T-860|修复竖屏素材底边与左下人物框边界重合【用户截图·2026-08-16】|🔨|—|待验|复用 [T-859 SPEC](docs/superpowers/specs/2026-08-16-portrait-material-pip-smooth-transition.md) AC-859-1 与用户截图|用户在 v6 预览中指出横版录屏的下边界与左下角人物 PiP 上边界发生视觉重合。必须以真实 1080×1920 几何补红测：人物框下移并适度缩小，在素材完整 `contain` 的可见底边下方保留明确空隙，同时仍停在双语字幕安全区上方；渲染器安全门须同时拒绝人物压素材、人物压字幕两类布局。重做 v7 短样片、对应稳定帧与转场密集接触表，用户确认前不重渲整片。|",
  "source_sha256": "b653fa7562f7d94e324626cc5e6e3b84e81612e42c9b571eb9f7e36962fde9c0",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-848b33f0"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-857",
  "title": "构建当前已提交候选的 CreatorOS 1.1.0 Windows 安装包【用户明确要求·2026-08-16】",
  "narrative": "暂停 T-856 且不带入任何竖屏剪辑代码改动；先提交本次任务状态记录并冻结当前候选，证明产品代码、版本号、工作树、候选提交范围与四项打包预检干净，再通过现有 Windows 云端候选包入口构建真实 NSIS `setup.exe`，验证生产闭包、真安装、主页面、CLI 与卸载并下载计算 SHA-256。只交付 Windows 安装包，不安装到当前 Mac，不创建 tag、GitHub Release，不公开分发，不改 Activity/Growth 或真实用户配置；如候选分支推送与云端构建尚未获明确授权，则在该外部动作前停下确认。",
  "documents": "复用官方 `desktop-release.yml` Windows 候选包入口与 T-848 Windows 真安装验收",
  "source_line": "|T-857|构建当前已提交候选的 CreatorOS 1.1.0 Windows 安装包【用户明确要求·2026-08-16】|⏸️|—|待验|复用官方 `desktop-release.yml` Windows 候选包入口与 T-848 Windows 真安装验收|暂停 T-856 且不带入任何竖屏剪辑代码改动；先提交本次任务状态记录并冻结当前候选，证明产品代码、版本号、工作树、候选提交范围与四项打包预检干净，再通过现有 Windows 云端候选包入口构建真实 NSIS `setup.exe`，验证生产闭包、真安装、主页面、CLI 与卸载并下载计算 SHA-256。只交付 Windows 安装包，不安装到当前 Mac，不创建 tag、GitHub Release，不公开分发，不改 Activity/Growth 或真实用户配置；如候选分支推送与云端构建尚未获明确授权，则在该外部动作前停下确认。|",
  "source_sha256": "b932081fbb3a408c6732ed429cd09bdc02689be1e3d01a9b2c1cf4cb623b5e7d",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-8c1f2625"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-856",
  "title": "重做竖屏成片的统一舞台、字幕可读性与重点词强调【用户成片截图·2026-08-16】",
  "narrative": "用户真实竖屏成片出现纯黑底、横版主视觉堆在上方而竖版人物孤立在右下、大片空区和硬分割，整体像两张互不相关的卡片；中英文字幕过小、英文辨识困难且没有重点词强调。必须把竖屏口播改为一套连续舞台：先由 AI 编导输出 motion thesis 与 beat graph，逐拍声明视觉主语、起止状态、运动动词、舞台形态、转场和回位；竖版人物默认作为完整基底，主视觉按语义使用全屏切走或不遮脸的统一叠层/PiP，横版素材用可见的静态氛围承接而非纯黑或巨大留空，回到人物时布局自然复位；字幕扩大并提高描边/阴影、行距和中英文断行可读性，重点词由 AI 编导在真实字幕语义中显式给出，渲染器只落实有效时间段与强调范围，禁止代码用关键词词表猜重点。先以用户截图对应的竖屏几何补红测，再输出含人物、横版主视觉、中英文字幕和重点词的实际关键帧/接触表与真实生产时间线短样片验收；接触表必须看出状态推进而非海报墙，不得拉伸、裁掉用户素材或用动态全片背景增加渲染成本，未经用户预览确认不重渲整片。",
  "documents": "[外部视频 Skill 学习与吸收结论](docs/research/2026-08-16-video-production-skills-method-study.md) · 复用 T-823/T-824/T-839 竖屏制作、主视觉与内容动效契约 · 待补构建验证",
  "source_line": "|T-856|重做竖屏成片的统一舞台、字幕可读性与重点词强调【用户成片截图·2026-08-16】|⏸️|—|待验|[外部视频 Skill 学习与吸收结论](docs/research/2026-08-16-video-production-skills-method-study.md) · 复用 T-823/T-824/T-839 竖屏制作、主视觉与内容动效契约 · 待补构建验证|用户真实竖屏成片出现纯黑底、横版主视觉堆在上方而竖版人物孤立在右下、大片空区和硬分割，整体像两张互不相关的卡片；中英文字幕过小、英文辨识困难且没有重点词强调。必须把竖屏口播改为一套连续舞台：先由 AI 编导输出 motion thesis 与 beat graph，逐拍声明视觉主语、起止状态、运动动词、舞台形态、转场和回位；竖版人物默认作为完整基底，主视觉按语义使用全屏切走或不遮脸的统一叠层/PiP，横版素材用可见的静态氛围承接而非纯黑或巨大留空，回到人物时布局自然复位；字幕扩大并提高描边/阴影、行距和中英文断行可读性，重点词由 AI 编导在真实字幕语义中显式给出，渲染器只落实有效时间段与强调范围，禁止代码用关键词词表猜重点。先以用户截图对应的竖屏几何补红测，再输出含人物、横版主视觉、中英文字幕和重点词的实际关键帧/接触表与真实生产时间线短样片验收；接触表必须看出状态推进而非海报墙，不得拉伸、裁掉用户素材或用动态全片背景增加渲染成本，未经用户预览确认不重渲整片。|",
  "source_sha256": "893b9a7f7e93c95c5b6e09105193d72c17a036795e8db4089cb92d27b3fedb59",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-be767ff5"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-855",
  "title": "构建包含 T-854 与当前已提交修复的 CreatorOS macOS 本地安装包【用户明确授权·2026-08-16】",
  "narrative": "待 T-854 完成并提交后冻结工作树，核对四处版本、候选提交范围、敏感信息与官方四项打包测试，只运行仓库固定 `desktop:package-local` 入口生成本地 macOS DMG；报告候选 SHA、产物路径、SHA-256 与 `hdiutil verify`。按用户要求只打包，不安装、不启动、不覆盖当前已安装应用；不创建 tag、GitHub Release，不推送、不公开分发、不改 Activity/Growth 或真实用户配置。",
  "documents": "复用 T-854 构建证据与官方本地打包入口",
  "source_line": "|T-855|构建包含 T-854 与当前已提交修复的 CreatorOS macOS 本地安装包【用户明确授权·2026-08-16】|⏸️|—|—|复用 T-854 构建证据与官方本地打包入口|待 T-854 完成并提交后冻结工作树，核对四处版本、候选提交范围、敏感信息与官方四项打包测试，只运行仓库固定 `desktop:package-local` 入口生成本地 macOS DMG；报告候选 SHA、产物路径、SHA-256 与 `hdiutil verify`。按用户要求只打包，不安装、不启动、不覆盖当前已安装应用；不创建 tag、GitHub Release，不推送、不公开分发、不改 Activity/Growth 或真实用户配置。|",
  "source_sha256": "f684f198efb5227ce8d45a1ee723c61fba299a30b30d1dd6f2e477c00f02f8da",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-d9df93f5"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-851",
  "title": "支持录制“123”短视频生成本人授权的 AI 数字人口播【数字人制作·用户 2026-08-16】",
  "narrative": "用户录制一段正对镜头说“1231234567”等中性占位内容的短视频，系统把它作为本人数字人形象素材；用户选择目标口播稿和本人已授权音色后，由可配置的声音克隆/TTS 与口型驱动模型生成新的口播候选，用户无需完整背稿。形象样本与声音样本必须分开说明真实最低时长和质量要求，禁止承诺只说六个数字即可同时完成可靠声音复刻；仅允许本人或有可验证授权的肖像与声音，首次生成前必须明确同意用途，支持撤销和删除，生成结果保留 AI 来源标识，不自动对外发布。AI 只产候选，用户确认后才能进入现有制作时间线；原始样本永久保留且不得被生成结果覆盖，覆盖录制引导、授权、目标稿/音色选择、异步生成、失败恢复、预览确认、刷新回读、删除与 macOS/Windows 有效成片验收。",
  "documents": "待补独立 SPEC（与 T-850 真人原声粗剪并列，共用受控成片链）",
  "source_line": "|T-851|支持录制“123”短视频生成本人授权的 AI 数字人口播【数字人制作·用户 2026-08-16】|📋 待办|待审|待验|待补独立 SPEC（与 T-850 真人原声粗剪并列，共用受控成片链）|用户录制一段正对镜头说“1231234567”等中性占位内容的短视频，系统把它作为本人数字人形象素材；用户选择目标口播稿和本人已授权音色后，由可配置的声音克隆/TTS 与口型驱动模型生成新的口播候选，用户无需完整背稿。形象样本与声音样本必须分开说明真实最低时长和质量要求，禁止承诺只说六个数字即可同时完成可靠声音复刻；仅允许本人或有可验证授权的肖像与声音，首次生成前必须明确同意用途，支持撤销和删除，生成结果保留 AI 来源标识，不自动对外发布。AI 只产候选，用户确认后才能进入现有制作时间线；原始样本永久保留且不得被生成结果覆盖，覆盖录制引导、授权、目标稿/音色选择、异步生成、失败恢复、预览确认、刷新回读、删除与 macOS/Windows 有效成片验收。|",
  "source_sha256": "d5b8c048aa4776c3f354f59d4794f1be29d3fba3ee137cbc8b594d7770af308c",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-64ffedcc"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-850",
  "title": "支持只上传未粗剪口播录像，由 AI 理解实拍语义并生成可确认粗剪【制作输入简化·用户 2026-08-16】",
  "narrative": "用户只上传保留口误、停顿和重复录制的原始口播视频；系统自动提取带时间码逐字稿/SRT，由可配置 AI/Skill 对照权威口播稿和真实上下文理解哪些是正常临场微调、刻意强调、说错后重讲或废弃试讲，再产出不改原片的粗剪候选及逐段删留理由、前后预览和可恢复时间线。严禁用字符串相似度、关键词、固定词表或“与原稿不同即删除”冒充语义判断；确定性代码只负责音视频时间边界、真实 ID/权限/安全校验，以及用户确认后的裁切和 SRT、B-roll、信息卡时间码重排。无法确认时默认保留，原始视频永久保留；覆盖上传、转写、AI 语义对齐、候选确认、裁切、刷新恢复、小窗口与有效成片回读。",
  "documents": "待补独立 SPEC（复用现有口播稿、ASR/SRT、制作决策与受控渲染链）",
  "source_line": "|T-850|支持只上传未粗剪口播录像，由 AI 理解实拍语义并生成可确认粗剪【制作输入简化·用户 2026-08-16】|📋 待办|待审|待验|待补独立 SPEC（复用现有口播稿、ASR/SRT、制作决策与受控渲染链）|用户只上传保留口误、停顿和重复录制的原始口播视频；系统自动提取带时间码逐字稿/SRT，由可配置 AI/Skill 对照权威口播稿和真实上下文理解哪些是正常临场微调、刻意强调、说错后重讲或废弃试讲，再产出不改原片的粗剪候选及逐段删留理由、前后预览和可恢复时间线。严禁用字符串相似度、关键词、固定词表或“与原稿不同即删除”冒充语义判断；确定性代码只负责音视频时间边界、真实 ID/权限/安全校验，以及用户确认后的裁切和 SRT、B-roll、信息卡时间码重排。无法确认时默认保留，原始视频永久保留；覆盖上传、转写、AI 语义对齐、候选确认、裁切、刷新恢复、小窗口与有效成片回读。|",
  "source_sha256": "9294a9c0cf41b0433aeb0ec4f56f297fd75f65b570b2c56678f1452e806698f3",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-26d594af"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-847",
  "title": "补齐 Windows 正式包的 CreatorOS CLI runtime 并重跑 1.1.0 双端流水线【T-846 阻断承接·用户认可 2026-08-16】",
  "narrative": "修复 run `31942889066` 暴露的 Windows production closure 缺 `frontend/cli/creatoros.cjs` 与 `cli/node.exe`：让 CLI runtime 在 production closure 构建和 Tauri `beforeBuildCommand` 二次执行之间保持完整、目标平台 Node 正确且无开发机路径依赖；补先红后绿的打包顺序、随包文件与幂等重入测试，验证现有 macOS 路径不回归。提交修复并重新冻结后运行官方 macOS/Windows 双端流水线，必须同时通过 macOS 签名/公证/真启动和 Windows NSIS 真安装/主页面/卸载，下载两个安装包并计算 SHA-256；仍不创建 tag、Release，不改 Activity/Growth 或公开分发。",
  "documents": "[构建验证](orchestrator/T847-BUILD-VALIDATION.md)",
  "source_line": "|T-847|补齐 Windows 正式包的 CreatorOS CLI runtime 并重跑 1.1.0 双端流水线【T-846 阻断承接·用户认可 2026-08-16】|⏸️|—|—|[构建验证](orchestrator/T847-BUILD-VALIDATION.md)|修复 run `31942889066` 暴露的 Windows production closure 缺 `frontend/cli/creatoros.cjs` 与 `cli/node.exe`：让 CLI runtime 在 production closure 构建和 Tauri `beforeBuildCommand` 二次执行之间保持完整、目标平台 Node 正确且无开发机路径依赖；补先红后绿的打包顺序、随包文件与幂等重入测试，验证现有 macOS 路径不回归。提交修复并重新冻结后运行官方 macOS/Windows 双端流水线，必须同时通过 macOS 签名/公证/真启动和 Windows NSIS 真安装/主页面/卸载，下载两个安装包并计算 SHA-256；仍不创建 tag、Release，不改 Activity/Growth 或公开分发。|",
  "source_sha256": "c5339f5d32db294c21b98a0475f52de9ce23123e2a77de7c1376c5564e8f83a2",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-f61303f5"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-846",
  "title": "提交当前批准候选并运行 CreatorOS 1.1.0 macOS/Windows 官方双端构建【用户明确授权·2026-08-16】",
  "narrative": "冻结并提交当前工作树中已批准的 CLI/项目回显、视频开场、渲染超时与视觉修复、发布物料解析、Windows HyperFrames 模块解析、诊断和编排引擎同步；运行官方四项打包预检、版本/密钥扫描与候选差异审计，以非强推方式同步到 `main` 并触发 `desktop-release.yml only=all`，持续跟踪同一 run，成功后下载 macOS DMG 与 Windows setup、核验 Developer ID/公证/staple/Gatekeeper、Windows 真安装启动卸载及 SHA-256。授权不包含 tag、GitHub Release、下载地址/Activity/Growth 更新、公开分发或真实用户放量。",
  "documents": "待形成发布验证",
  "source_line": "|T-846|提交当前批准候选并运行 CreatorOS 1.1.0 macOS/Windows 官方双端构建【用户明确授权·2026-08-16】|⏸️|—|—|待形成发布验证|冻结并提交当前工作树中已批准的 CLI/项目回显、视频开场、渲染超时与视觉修复、发布物料解析、Windows HyperFrames 模块解析、诊断和编排引擎同步；运行官方四项打包预检、版本/密钥扫描与候选差异审计，以非强推方式同步到 `main` 并触发 `desktop-release.yml only=all`，持续跟踪同一 run，成功后下载 macOS DMG 与 Windows setup、核验 Developer ID/公证/staple/Gatekeeper、Windows 真安装启动卸载及 SHA-256。授权不包含 tag、GitHub Release、下载地址/Activity/Growth 更新、公开分发或真实用户放量。|",
  "source_sha256": "244b0caa7c013598a2c408d19b92dea6e8d037306177191f5aae7d21cadcb1ff",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-89e30cbc"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-845",
  "title": "根治 Windows 用户机成片在 HyperFrames 启动阶段缺失分层模块解析器【T-844 根因修复·用户 2026-08-16】",
  "narrative": "已修复正式 `exec.video.render` 与 Windows 少文件 runtime 的消费契约：分层 HyperFrames 子进程显式按绝对路径 `--require` 同一解析器，缺失时前置报重装，开发/传统路径不变；仍禁止 `NODE_OPTIONS` 并保持密钥环境收窄。错误现保留脱敏首尾、具体包名和错误码。先红后绿后 backend 26/26、Windows closure 14/14、双包 typecheck、boundary、semantic 与 diff-check 通过；当前 macOS 不能伪造 Windows 安装包真渲染，需下一份 Windows 包安装后完成短视频捕帧、编码与有效 MP4 验收，旧包重复重试无效。",
  "documents": "[构建验证](orchestrator/T845-BUILD-VALIDATION.md) · [根因诊断](docs/research/2026-08-16-windows-video-render-module-resolution-diagnosis.md)",
  "source_line": "|T-845|根治 Windows 用户机成片在 HyperFrames 启动阶段缺失分层模块解析器【T-844 根因修复·用户 2026-08-16】|🔨|—|待验|[构建验证](orchestrator/T845-BUILD-VALIDATION.md) · [根因诊断](docs/research/2026-08-16-windows-video-render-module-resolution-diagnosis.md)|已修复正式 `exec.video.render` 与 Windows 少文件 runtime 的消费契约：分层 HyperFrames 子进程显式按绝对路径 `--require` 同一解析器，缺失时前置报重装，开发/传统路径不变；仍禁止 `NODE_OPTIONS` 并保持密钥环境收窄。错误现保留脱敏首尾、具体包名和错误码。先红后绿后 backend 26/26、Windows closure 14/14、双包 typecheck、boundary、semantic 与 diff-check 通过；当前 macOS 不能伪造 Windows 安装包真渲染，需下一份 Windows 包安装后完成短视频捕帧、编码与有效 MP4 验收，旧包重复重试无效。|",
  "source_sha256": "3b366e0e6d4fe2488cf75abb317401d92aa1d6273042f189a7184d215b05d542",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-8b02f443"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-835",
  "title": "取消制作分镜逐字保真失败对整稿候选的阻断，并给出可诊断恢复【用户真机反馈·2026-08-14】",
  "narrative": "用户确认不能再因第二阶段分镜模型未逐字复述冻结口播而阻断整次写稿。继续保留“绝不丢口播”的硬门，但把口播真值收回确定性代码：纯空白漂移按冻结原文重新锚定并保留模型分镜字段；真实增删改或分镜模型失败时，直接从冻结原文生成不引入新事实的基础分镜候选，完整口播照常可采纳，同时记录恢复类型、首个差异位置与脱敏诊断。禁止模糊相似度、禁止让模型改写原口播、禁止把技术失败甩给用户重跑整稿。",
  "documents": "复用 T-824 连续口播与制作分镜契约",
  "source_line": "|T-835|取消制作分镜逐字保真失败对整稿候选的阻断，并给出可诊断恢复【用户真机反馈·2026-08-14】|🔨|—|待验|复用 T-824 连续口播与制作分镜契约|用户确认不能再因第二阶段分镜模型未逐字复述冻结口播而阻断整次写稿。继续保留“绝不丢口播”的硬门，但把口播真值收回确定性代码：纯空白漂移按冻结原文重新锚定并保留模型分镜字段；真实增删改或分镜模型失败时，直接从冻结原文生成不引入新事实的基础分镜候选，完整口播照常可采纳，同时记录恢复类型、首个差异位置与脱敏诊断。禁止模糊相似度、禁止让模型改写原口播、禁止把技术失败甩给用户重跑整稿。|",
  "source_sha256": "c1c0cbc946e73b3cfdaafd1584ed4db5f2a3d4a70dd8c1903248f06c6284e4ab",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-07e1f079"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-833",
  "title": "根治结构化节点 schema 兼容报错与多张局部改稿卡无法连续采纳【用户高频真机反馈·2026-08-14】",
  "narrative": "高频出现 `generateObject` 返回对象含 effective outputSchema 明确禁止的额外字段，文本兜底仍被同一严格校验拒绝；同一回复产生多张局部改稿候选时，采纳第一张会生成新稿版本，第二张仍绑定旧 base version/hash 而无法继续采纳。必须先以真实调用链和红测锁定根因，再只清理 schema 明确禁止的协议外字段且保持必填/类型约束 fail-closed，并让未采纳卡基于权威当前稿安全重放或明确检测同段冲突，支持按顺序全部采纳且不覆盖并发编辑、不伪造成功。",
  "documents": "复用既有结构化节点可靠性契约、`script.patch` 候选确认链与 T-819 当前稿定位契约",
  "source_line": "|T-833|根治结构化节点 schema 兼容报错与多张局部改稿卡无法连续采纳【用户高频真机反馈·2026-08-14】|🔨|—|待验|复用既有结构化节点可靠性契约、`script.patch` 候选确认链与 T-819 当前稿定位契约|高频出现 `generateObject` 返回对象含 effective outputSchema 明确禁止的额外字段，文本兜底仍被同一严格校验拒绝；同一回复产生多张局部改稿候选时，采纳第一张会生成新稿版本，第二张仍绑定旧 base version/hash 而无法继续采纳。必须先以真实调用链和红测锁定根因，再只清理 schema 明确禁止的协议外字段且保持必填/类型约束 fail-closed，并让未采纳卡基于权威当前稿安全重放或明确检测同段冲突，支持按顺序全部采纳且不覆盖并发编辑、不伪造成功。|",
  "source_sha256": "527e9e90857b9478a2f2eb26a9ec614cd96f01f0c1e38798cae445c7f787caa6",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-2d485019"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-831",
  "title": "重排官方渠道模型配置并复核上游图生图能力【官方渠道配置·用户 2026-08-14】",
  "narrative": "用户确认官方 OmniHi 与本地中转站采用兼容双路径：官方托管参考图只认独立 `image.edit`，本地 Dudu/OpenAI-compatible 未单配 `image.edit` 时继续复用既有 `image.generate`；禁止按供应商名猜路由。CreatorOS 聚焦测试及三端类型检查通过。生产仍为 v2；后续保存 v3 并权威回读，不影响本地包继续使用本地自配图生图。",
  "documents": "[官方配置确认稿](orchestrator/T831-OFFICIAL-MODEL-CONFIG-PROPOSAL.md) · [构建验证](orchestrator/T831-BUILD-VALIDATION.md) · [全模型返佣收益测算](docs/research/2026-08-14-omnihi-all-model-profit-analysis.md) · [全模型兼容矩阵](orchestrator/T829-MODEL-COMPATIBILITY-VALIDATION.md) · [逐能力模型契约](docs/superpowers/specs/2026-08-02-capability-scoped-channel-model-authority.md)",
  "source_line": "|T-831|重排官方渠道模型配置并复核上游图生图能力【官方渠道配置·用户 2026-08-14】|🔨|—|待验|[官方配置确认稿](orchestrator/T831-OFFICIAL-MODEL-CONFIG-PROPOSAL.md) · [构建验证](orchestrator/T831-BUILD-VALIDATION.md) · [全模型返佣收益测算](docs/research/2026-08-14-omnihi-all-model-profit-analysis.md) · [全模型兼容矩阵](orchestrator/T829-MODEL-COMPATIBILITY-VALIDATION.md) · [逐能力模型契约](docs/superpowers/specs/2026-08-02-capability-scoped-channel-model-authority.md)|用户确认官方 OmniHi 与本地中转站采用兼容双路径：官方托管参考图只认独立 `image.edit`，本地 Dudu/OpenAI-compatible 未单配 `image.edit` 时继续复用既有 `image.generate`；禁止按供应商名猜路由。CreatorOS 聚焦测试及三端类型检查通过。生产仍为 v2；后续保存 v3 并权威回读，不影响本地包继续使用本地自配图生图。|",
  "source_sha256": "b1ee4d8b522d09a0df84c0a25eb41a0550c9e48d4b6ce86da780b8c49704e0e5",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-2206002e"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-829",
  "title": "建立并执行上游模型全能力真实兼容矩阵，覆盖渠道托管与用户中转站【用户 Windows 生图/文本回归·2026-08-14】",
  "narrative": "三份 Windows 日志确认模型请求前即被渠道配置 `security_error` 拦截；当前配置 13 模型已完成双接入验证。扩展轮又对中转站 `/models` 实时返回的 79 个模型逐个真跑流式/工具/结构化：首轮 153/237 请求通过，36 个首轮全过、3 个 60s 复测全过但不稳定、22 个部分可用、18 个三项均失败；连复测合计消耗 0.84532054 元，隔离 Key 已删除并复查剩余 0。正式 Skill、文生图/视频与错误分类修复均纳入同一报告；不修改用户配置、不自动切模、不发布。",
  "documents": "[真实兼容矩阵](orchestrator/T829-MODEL-COMPATIBILITY-VALIDATION.md) · [逐能力模型契约](docs/superpowers/specs/2026-08-02-capability-scoped-channel-model-authority.md) · [模型配置体验契约](docs/superpowers/specs/2026-07-24-model-configuration-experience-redesign.contract.md)",
  "source_line": "|T-829|建立并执行上游模型全能力真实兼容矩阵，覆盖渠道托管与用户中转站【用户 Windows 生图/文本回归·2026-08-14】|🔨|—|待验|[真实兼容矩阵](orchestrator/T829-MODEL-COMPATIBILITY-VALIDATION.md) · [逐能力模型契约](docs/superpowers/specs/2026-08-02-capability-scoped-channel-model-authority.md) · [模型配置体验契约](docs/superpowers/specs/2026-07-24-model-configuration-experience-redesign.contract.md)|三份 Windows 日志确认模型请求前即被渠道配置 `security_error` 拦截；当前配置 13 模型已完成双接入验证。扩展轮又对中转站 `/models` 实时返回的 79 个模型逐个真跑流式/工具/结构化：首轮 153/237 请求通过，36 个首轮全过、3 个 60s 复测全过但不稳定、22 个部分可用、18 个三项均失败；连复测合计消耗 0.84532054 元，隔离 Key 已删除并复查剩余 0。正式 Skill、文生图/视频与错误分类修复均纳入同一报告；不修改用户配置、不自动切模、不发布。|",
  "source_sha256": "78f7b71eadadd25bb39f181620ce745cbc747ac33d97960644f9dc27acbf4770",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-9444a8cf"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-828",
  "title": "诊断行业热点出题不可用、Windows 滚动条异常与 DeepMind/Max 模型报错【用户 Windows 真机截图与加密日志·2026-08-13】",
  "narrative": "已确认三类问题互相独立：左栏“行业热点”是 0 候选即禁用的已有候选筛选器，顶部“基于热点出题”只打开编导并预填、不会自动执行，且真实热点依赖内容雷达信源/登录态或联网搜索；Windows 三根白色粗条来自 sidebar、稿面、Copilot 三个 raw `overflow-y-auto` 容器，暗色主题没有原生 scrollbar 适配；MiniMax 预设端点与当前官方文档一致，但模型 ID 自由输入且未做实时校验。所附 8 月 8 日日志只有 activation-only 启停 16 行、退出码 0，没有模型/热点调用，无法诚实判定本次是模型名、审核、额度、限流或超时；待用户复现后提供当天日志或错误原文再收口唯一根因。",
  "documents": "[脱敏诊断报告](docs/research/2026-08-13-windows-hotspot-scrollbar-minimax-diagnosis.md)",
  "source_line": "|T-828|诊断行业热点出题不可用、Windows 滚动条异常与 DeepMind/Max 模型报错【用户 Windows 真机截图与加密日志·2026-08-13】|🔨|—|待验|[脱敏诊断报告](docs/research/2026-08-13-windows-hotspot-scrollbar-minimax-diagnosis.md)|已确认三类问题互相独立：左栏“行业热点”是 0 候选即禁用的已有候选筛选器，顶部“基于热点出题”只打开编导并预填、不会自动执行，且真实热点依赖内容雷达信源/登录态或联网搜索；Windows 三根白色粗条来自 sidebar、稿面、Copilot 三个 raw `overflow-y-auto` 容器，暗色主题没有原生 scrollbar 适配；MiniMax 预设端点与当前官方文档一致，但模型 ID 自由输入且未做实时校验。所附 8 月 8 日日志只有 activation-only 启停 16 行、退出码 0，没有模型/热点调用，无法诚实判定本次是模型名、审核、额度、限流或超时；待用户复现后提供当天日志或错误原文再收口唯一根因。|",
  "source_sha256": "ed56d22d30b57e2616a047ec7b55d9e9f87a149c204849f5af9eaceef69a7051",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-45c1770c"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-827",
  "title": "根治选题中心来源筛选失效与候选操作按钮无法点击【用户真机截图·2026-08-13】",
  "narrative": "根因已锁定并修复：`guardrail` 排序分支原先丢弃 `source`，现透传来源、状态、时间与分页；“手动灵感”在真实页只返回 2 条 idea 候选，清除后恢复 3 条全量。补全选题卡打开 AI 助手会保留当前 `sort + source`，关闭后不再跳丢筛选。左栏 5 个无法一对一映射候选来源的统计项明确标“仅统计”并解释原因，热点/灵感显示候选池真实数量。后端 16/16、前端 25/25、双端类型检查与 1024×768 真页面旅程已通过；不改选题语义、数据归属或用户数据，待用户本地包验收。",
  "documents": "[构建验证](orchestrator/T827-BUILD-VALIDATION.md) · 复用既有选题中心页面与 topic 操作契约",
  "source_line": "|T-827|根治选题中心来源筛选失效与候选操作按钮无法点击【用户真机截图·2026-08-13】|🔨|—|待验|[构建验证](orchestrator/T827-BUILD-VALIDATION.md) · 复用既有选题中心页面与 topic 操作契约|根因已锁定并修复：`guardrail` 排序分支原先丢弃 `source`，现透传来源、状态、时间与分页；“手动灵感”在真实页只返回 2 条 idea 候选，清除后恢复 3 条全量。补全选题卡打开 AI 助手会保留当前 `sort + source`，关闭后不再跳丢筛选。左栏 5 个无法一对一映射候选来源的统计项明确标“仅统计”并解释原因，热点/灵感显示候选池真实数量。后端 16/16、前端 25/25、双端类型检查与 1024×768 真页面旅程已通过；不改选题语义、数据归属或用户数据，待用户本地包验收。|",
  "source_sha256": "15afd22770d6de224a86ef917941a2e0607fc669fdae5101da447774891e96e0",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-458ca763"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-826",
  "title": "根治 CreatorOS v1.1 Windows 新安装包安装后无法启动【用户真机日志·2026-08-13】",
  "narrative": "根因已锁定为升级机旧 appData runtime 让启动代码跳过新安装 runtime，安装归档在成功物化后又已删除，最终误报缺 `sidecar.tar.gz`。已改为验证新副本后原子替换、提交失败恢复旧副本；Windows 验收包 run `31766801381` 已在模拟旧 runtime 状态下完成真安装、GUI、sidecar 主页面加载和卸载，安装包 SHA-256 已入构建验证。不触碰项目、数据库、密钥和日志；现只待用户在原故障机器直接安装复验，不创建 tag/Release、不改下载地址、不公开放量。",
  "documents": "[Windows 首次启动 SPEC](docs/superpowers/specs/2026-07-23-desktop-packaging-first-launch-design.md) · [根因诊断](docs/research/2026-08-13-windows-v1.1-upgrade-startup-failure.md) · [构建验证](orchestrator/T826-BUILD-VALIDATION.md)",
  "source_line": "|T-826|根治 CreatorOS v1.1 Windows 新安装包安装后无法启动【用户真机日志·2026-08-13】|🔨|—|待验|[Windows 首次启动 SPEC](docs/superpowers/specs/2026-07-23-desktop-packaging-first-launch-design.md) · [根因诊断](docs/research/2026-08-13-windows-v1.1-upgrade-startup-failure.md) · [构建验证](orchestrator/T826-BUILD-VALIDATION.md)|根因已锁定为升级机旧 appData runtime 让启动代码跳过新安装 runtime，安装归档在成功物化后又已删除，最终误报缺 `sidecar.tar.gz`。已改为验证新副本后原子替换、提交失败恢复旧副本；Windows 验收包 run `31766801381` 已在模拟旧 runtime 状态下完成真安装、GUI、sidecar 主页面加载和卸载，安装包 SHA-256 已入构建验证。不触碰项目、数据库、密钥和日志；现只待用户在原故障机器直接安装复验，不创建 tag/Release、不改下载地址、不公开放量。|",
  "source_sha256": "ad7d66bae1acf2d730c729d6dfba767e450a588be9042b3419ec4a8f51f259d8",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-18a3bcff"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-823",
  "title": "根治架构图等主视觉被信息卡遮挡并修正跨段画面切换滞后【成片真机截图·2026-08-13】",
  "narrative": "当场景已有用户素材或生成的架构图、流程图、界面截图等高信息主视觉时，渲染器必须让主视觉占据可读安全区，信息卡只能作为不遮正文的紧凑标注，禁止把主图降成后方装饰卡；卡片内容必须绑定当前口播/字幕段，模式层结束即切换到可观测层，不能沿用上一段数秒。覆盖主图可读面积、人物避让、文字截断、相邻分段切换边界与当前 DeepSeek Harness 成片关键帧回归，并将本次反馈沉淀进视频编辑自迭代规则。",
  "documents": "[构建验证](orchestrator/T823-BUILD-VALIDATION.md)",
  "source_line": "|T-823|根治架构图等主视觉被信息卡遮挡并修正跨段画面切换滞后【成片真机截图·2026-08-13】|🔨|—|待验|[构建验证](orchestrator/T823-BUILD-VALIDATION.md)|当场景已有用户素材或生成的架构图、流程图、界面截图等高信息主视觉时，渲染器必须让主视觉占据可读安全区，信息卡只能作为不遮正文的紧凑标注，禁止把主图降成后方装饰卡；卡片内容必须绑定当前口播/字幕段，模式层结束即切换到可观测层，不能沿用上一段数秒。覆盖主图可读面积、人物避让、文字截断、相邻分段切换边界与当前 DeepSeek Harness 成片关键帧回归，并将本次反馈沉淀进视频编辑自迭代规则。|",
  "source_sha256": "f8f8a76b18070c2caeb62631cee95bd396027a4b77e6e5d826a7e1ed63b7a5b3",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-d5ae9cde"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-821",
  "title": "网站内容因未登录或权限不足读取失败时引导用户前往登录保管库【用户截图·2026-08-13】",
  "narrative": "当联网读取明确返回未登录、需要权限或登录后重试时，把冗长的内部恢复说明改成用户能行动的错误卡：说明当前未拿到原文、不会编造内容，提供“前往网站登录”入口直达「设置 → 网站登录保管库」，并保留登录后重试；普通 404、下架或无替代来源仍按真实原因提示，不得一律伪装成登录问题。覆盖按钮真实接线、返回路径、键盘可用性及没有设置入口时的诚实降级。",
  "documents": "[构建验证](orchestrator/T821-BUILD-VALIDATION.md)",
  "source_line": "|T-821|网站内容因未登录或权限不足读取失败时引导用户前往登录保管库【用户截图·2026-08-13】|🔨|—|待验|[构建验证](orchestrator/T821-BUILD-VALIDATION.md)|当联网读取明确返回未登录、需要权限或登录后重试时，把冗长的内部恢复说明改成用户能行动的错误卡：说明当前未拿到原文、不会编造内容，提供“前往网站登录”入口直达「设置 → 网站登录保管库」，并保留登录后重试；普通 404、下架或无替代来源仍按真实原因提示，不得一律伪装成登录问题。覆盖按钮真实接线、返回路径、键盘可用性及没有设置入口时的诚实降级。|",
  "source_sha256": "48b64d309e5a16cc89faa7f2f7c91e47c9e8561f71690e154c47475366b643fd",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-6656f61e"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-820",
  "title": "修复选题补卡到项目与文案的数据丢失并保存生成消费血缘【T-811 审计承接·2026-08-13】",
  "narrative": "以 T-811 血缘审计为输入，打通补全选题卡到项目统一创作 Brief、可选论点和 `script.draft` 的真实消费：承接受众痛点、核心冲突、钩子方向、内容结构、素材依据与风险；修复 angle 已存任务却未进 runner、项目普通保存覆盖 `contentRadarEvidence/benchmarkRef`、立项 source 误标 manual 与三次写入非事务；让论点与写稿共享同一份 Brief/知识/项目证据，并为每次生成保存来源版本、字段 hash、是否实际消费及未消费原因。评分与定位标签是否进入生成须在 SPEC 中逐项裁决，不能把所有上游字段无脑塞进提示词。",
  "documents": "待形成 SPEC",
  "source_line": "|T-820|修复选题补卡到项目与文案的数据丢失并保存生成消费血缘【T-811 审计承接·2026-08-13】|📋 待办|—|—|待形成 SPEC|以 T-811 血缘审计为输入，打通补全选题卡到项目统一创作 Brief、可选论点和 `script.draft` 的真实消费：承接受众痛点、核心冲突、钩子方向、内容结构、素材依据与风险；修复 angle 已存任务却未进 runner、项目普通保存覆盖 `contentRadarEvidence/benchmarkRef`、立项 source 误标 manual 与三次写入非事务；让论点与写稿共享同一份 Brief/知识/项目证据，并为每次生成保存来源版本、字段 hash、是否实际消费及未消费原因。评分与定位标签是否进入生成须在 SPEC 中逐项裁决，不能把所有上游字段无脑塞进提示词。|",
  "source_sha256": "d2078f6a0487d1596281ca3cd93c5e7211578962b7d9c862ed3e658600e31bc0",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-43ce1d78"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-814",
  "title": "统一 CreatorOS 多页面 AI 对话体验并保留场景上下文与自由讨论能力【用户体验方向·2026-08-13】",
  "narrative": "当前多个 AI 助手、浮层和页面入口给用户造成能力割裂；设计一个账号级连续编导会话与项目级连续创作会话，页面选择只作为当前上下文和快捷动作，不把助手限制为“选题页只能聊选题”；需要支持自由讨论、跨页面续聊、明确显示当前作用对象、切换项目/选题前确认、生成候选后由用户采纳，兼容现有工具、历史对话、内容雷达证据和项目 Brief，不一次性替换运行时或迁移历史数据，并以影子组装、双读校验和可回滚开关降低回归风险。",
  "documents": "待形成 SPEC",
  "source_line": "|T-814|统一 CreatorOS 多页面 AI 对话体验并保留场景上下文与自由讨论能力【用户体验方向·2026-08-13】|📋 待办|—|—|待形成 SPEC|当前多个 AI 助手、浮层和页面入口给用户造成能力割裂；设计一个账号级连续编导会话与项目级连续创作会话，页面选择只作为当前上下文和快捷动作，不把助手限制为“选题页只能聊选题”；需要支持自由讨论、跨页面续聊、明确显示当前作用对象、切换项目/选题前确认、生成候选后由用户采纳，兼容现有工具、历史对话、内容雷达证据和项目 Brief，不一次性替换运行时或迁移历史数据，并以影子组装、双读校验和可回滚开关降低回归风险。|",
  "source_sha256": "fb4308b28d39b38044e856ce6b14ac8b7e90afcc31139890dcfa02737c2682d5",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-0da0f08a"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-779",
  "title": "根治参考历史作品生成封面时误探本机工具并中断生图【v1.0 回归·用户确认 2026-08-11】",
  "narrative": "当用户要求参考历史作品生成封面时，只从当前账号真实已发布且有封面的近期作品中，由编导模型结合当前内容语义选择“最新且最关联”的一条，相关性优先、发布时间用于同等相关候选裁决；随后必须直接把真实 `coverAssetId` 交给 `cover.generate`，不得用 `local.tools` 探测应用内生图模型、不得把 draft 当已发布作品、不得让用户替系统做 A/B 选择。缺配置、参考图读取或生成失败仍由真实封面任务诚实返回，不改视觉。",
  "documents": "既有 `cover.generate`、`context.publications` 与 Copilot 媒体路由契约",
  "source_line": "|T-779|根治参考历史作品生成封面时误探本机工具并中断生图【v1.0 回归·用户确认 2026-08-11】|🔨|—|待验|既有 `cover.generate`、`context.publications` 与 Copilot 媒体路由契约|当用户要求参考历史作品生成封面时，只从当前账号真实已发布且有封面的近期作品中，由编导模型结合当前内容语义选择“最新且最关联”的一条，相关性优先、发布时间用于同等相关候选裁决；随后必须直接把真实 `coverAssetId` 交给 `cover.generate`，不得用 `local.tools` 探测应用内生图模型、不得把 draft 当已发布作品、不得让用户替系统做 A/B 选择。缺配置、参考图读取或生成失败仍由真实封面任务诚实返回，不改视觉。|",
  "source_sha256": "e747fe2a287723611d31c202bb64edfafdd102707c30441af91a1faf9bedf5e6",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-8ac14796"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-773",
  "title": "更新 CreatorOS 1.0 最新使用教程、匿名化截图并新建成交型测试版教程【教程交付·用户 2026-08-11】",
  "narrative": "以当前 1.0 产品事实重新核对教程中的入口、流程、模型、视频制作、激活与反馈等变化；逐张检查教程引用的实机截图，将左下角博主头像、昵称、账号名称等身份信息统一遮挡并保留原图可恢复副本；同时面向新引入客资新建“一天跑出真实成果”的测试版飞书教程，写入真实一天体验码，以产品理解、机制信任、快速成果和授权伙伴购买引导完成转化，不公开价格或绕过推荐人的直营入口；验证全部图片链接与文档事实，不修改产品代码。",
  "documents": "[完整教程](docs/CreatorOS-新用户0到1标杆路线.md) · [测试版飞书教程](https://my.feishu.cn/wiki/GaHrwmGHHiU8MQkovQZcNjxMnpe) · [发布稿](outputs/T-773/creatoros-v1-test-conversion-guide.md)",
  "source_line": "|T-773|更新 CreatorOS 1.0 最新使用教程、匿名化截图并新建成交型测试版教程【教程交付·用户 2026-08-11】|🔨|—|待验|[完整教程](docs/CreatorOS-新用户0到1标杆路线.md) · [测试版飞书教程](https://my.feishu.cn/wiki/GaHrwmGHHiU8MQkovQZcNjxMnpe) · [发布稿](outputs/T-773/creatoros-v1-test-conversion-guide.md)|以当前 1.0 产品事实重新核对教程中的入口、流程、模型、视频制作、激活与反馈等变化；逐张检查教程引用的实机截图，将左下角博主头像、昵称、账号名称等身份信息统一遮挡并保留原图可恢复副本；同时面向新引入客资新建“一天跑出真实成果”的测试版飞书教程，写入真实一天体验码，以产品理解、机制信任、快速成果和授权伙伴购买引导完成转化，不公开价格或绕过推荐人的直营入口；验证全部图片链接与文档事实，不修改产品代码。|",
  "source_sha256": "d461d710c2fa23e4595482ca945162dfe0f290ba8611d10963d67f61f4189695",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-8917492a"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-762",
  "title": "根因复盘并设计渠道 ASR 密钥的短时租约闭环【正式版受管能力·用户 2026-08-10】",
  "narrative": "基于昨天真实渠道 ASR 故障、当前 Activity ticket v3、Growth 受管凭据与本地密钥库实现，区分长期渠道密钥、短时 ASR lease、机器绑定和失败恢复的责任边界，形成不暴露长期密钥、不依赖用户手工配置、可自动续租且 fail-closed 的根治方案；本任务不修改产品代码或生产配置。",
  "documents": "[受管模型契约](docs/superpowers/specs/2026-08-02-capability-scoped-channel-model-authority.md) · 既有 T-679/T-735/T-731 证据",
  "source_line": "|T-762|根因复盘并设计渠道 ASR 密钥的短时租约闭环【正式版受管能力·用户 2026-08-10】|🔨|—|—|[受管模型契约](docs/superpowers/specs/2026-08-02-capability-scoped-channel-model-authority.md) · 既有 T-679/T-735/T-731 证据|基于昨天真实渠道 ASR 故障、当前 Activity ticket v3、Growth 受管凭据与本地密钥库实现，区分长期渠道密钥、短时 ASR lease、机器绑定和失败恢复的责任边界，形成不暴露长期密钥、不依赖用户手工配置、可自动续租且 fail-closed 的根治方案；本任务不修改产品代码或生产配置。|",
  "source_sha256": "a625efc8f48dbe1223d6d07b0fa26dfb311f78ef1bcd5693c420421321626c90",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-1ac61723"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-759",
  "title": "根治已绑定 B-roll 因 inventory 失配显示空白【正式版制作回归·用户 2026-08-10】",
  "narrative": "分镜里的每条 B-roll 绑定必须与同源项目素材快照一起原子保存和恢复；当前素材仍可用时展示真实名称并可换选，素材已删除、归属变化或旧方案缺元数据时明确显示“素材已不可用”并允许移除或从当前项目重新选择，禁止渲染空白下拉、禁止静默改绑、禁止重新调用模型或读取全局/其他项目素材。",
  "documents": "既有 video.decisions、production.videoEditingPlan 与项目素材归属契约",
  "source_line": "|T-759|根治已绑定 B-roll 因 inventory 失配显示空白【正式版制作回归·用户 2026-08-10】|🔨|—|待验|既有 video.decisions、production.videoEditingPlan 与项目素材归属契约|分镜里的每条 B-roll 绑定必须与同源项目素材快照一起原子保存和恢复；当前素材仍可用时展示真实名称并可换选，素材已删除、归属变化或旧方案缺元数据时明确显示“素材已不可用”并允许移除或从当前项目重新选择，禁止渲染空白下拉、禁止静默改绑、禁止重新调用模型或读取全局/其他项目素材。|",
  "source_sha256": "ce3a63e71d0e3062f420cfaab8f0e3e953ea131b5adf74bf43317b4f1dd70266",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-affd3a14"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-754",
  "title": "根治 CreatorOS v1.0 官方包启动无限转圈【正式版启动阻断·用户 2026-08-10】",
  "narrative": "基于当前官方安装包启动状态机与安全日志锁定“持续转圈但既不进入主页面也不进入诊断页”的真实原因；真实进展只允许续期空闲看门狗，整个启动必须受最终收敛上限约束，sidecar 退出、重复无效进展、主页加载失败均及时进入可操作诊断且保全数据；补 macOS/Windows 契约与本地真启动回归，不改视觉、不顺带增加功能，正式重打包另按用户确认执行。",
  "documents": "[桌面首次启动 SPEC](docs/superpowers/specs/2026-07-23-desktop-packaging-first-launch-design.md) · 既有 T-747 进展感知软看门狗契约",
  "source_line": "|T-754|根治 CreatorOS v1.0 官方包启动无限转圈【正式版启动阻断·用户 2026-08-10】|🔨|—|—|[桌面首次启动 SPEC](docs/superpowers/specs/2026-07-23-desktop-packaging-first-launch-design.md) · 既有 T-747 进展感知软看门狗契约|基于当前官方安装包启动状态机与安全日志锁定“持续转圈但既不进入主页面也不进入诊断页”的真实原因；真实进展只允许续期空闲看门狗，整个启动必须受最终收敛上限约束，sidecar 退出、重复无效进展、主页加载失败均及时进入可操作诊断且保全数据；补 macOS/Windows 契约与本地真启动回归，不改视觉、不顺带增加功能，正式重打包另按用户确认执行。|",
  "source_sha256": "1fd6859e74f74df3d02135d1f47efcc34271cfaff3457b623998389c18e83dec",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-b78689f4"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-748",
  "title": "补齐“重新输入激活码”原生命令 ACL 并重打官方包【正式版回归·用户真机 2026-08-09】",
  "narrative": "正式包点击“重新输入激活码”不得再出现 `Command license_reset_local not allowed by ACL`；只为无参数命令 `license_reset_local` 增加最小 remote-sidecar 放行权限，并补齐“前端 invoke ↔ handler ↔ build command ↔ capability”一致性回归，不改 UI、清理边界或发布流程；验证后重跑官方 macOS/Windows 打包。",
  "documents": "[T-746 SPEC](docs/superpowers/specs/2026-08-09-in-product-activation-reset-design.md)",
  "source_line": "|T-748|补齐“重新输入激活码”原生命令 ACL 并重打官方包【正式版回归·用户真机 2026-08-09】|🔨|—|—|[T-746 SPEC](docs/superpowers/specs/2026-08-09-in-product-activation-reset-design.md)|正式包点击“重新输入激活码”不得再出现 `Command license_reset_local not allowed by ACL`；只为无参数命令 `license_reset_local` 增加最小 remote-sidecar 放行权限，并补齐“前端 invoke ↔ handler ↔ build command ↔ capability”一致性回归，不改 UI、清理边界或发布流程；验证后重跑官方 macOS/Windows 打包。|",
  "source_sha256": "4fc63f4d9fdd6e0b2108de7624d4da75b0bd9e403a4c41f8b83ac64a631d4d9b",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-d01d7b87"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-741",
  "title": "下移知识库“记一条经验”入口到录入操作行【正式版细节·用户 2026-08-09】",
  "narrative": "保留“记一条经验”现有 Copilot 深链与行为，只把入口从知识库页头右侧移动到倾倒场的录入按钮行、紧邻“手动补录”；页面只能保留一个入口，不改按钮风格、录入流程或知识库整体视觉。",
  "documents": "既有知识录入与经验捕获契约",
  "source_line": "|T-741|下移知识库“记一条经验”入口到录入操作行【正式版细节·用户 2026-08-09】|🔨|—|待验|既有知识录入与经验捕获契约|保留“记一条经验”现有 Copilot 深链与行为，只把入口从知识库页头右侧移动到倾倒场的录入按钮行、紧邻“手动补录”；页面只能保留一个入口，不改按钮风格、录入流程或知识库整体视觉。|",
  "source_sha256": "5704dae9a9cc8e993657e2f88d18818671132ad9cc7af3964f9f7e18f0ae2856",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-c5d8d48a"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-739",
  "title": "根治制作视频跨项目灌入 B-roll、无证据改稿偏好与超长复盘卡【正式版回归·用户 2026-08-09】",
  "narrative": "视频制作的 B-roll 候选只能读取当前项目明确挂载/上传的素材；当前项目没有素材时诚实为空，不得混入全局或其他项目素材。改稿偏好只能由当前项目自身已发布后的评论、指标与用户明确采纳行为派生；项目未制作、未发布或无数据时不得展示跨作品偏好。复盘卡只展示简短、可核验摘要，详细依据按需展开，不得把内部信号、整稿或超长原始文本直接铺满页面；不改全局视觉体系。",
  "documents": "既有项目素材挂载、视频制作与发布复盘契约",
  "source_line": "|T-739|根治制作视频跨项目灌入 B-roll、无证据改稿偏好与超长复盘卡【正式版回归·用户 2026-08-09】|🔨|—|待验|既有项目素材挂载、视频制作与发布复盘契约|视频制作的 B-roll 候选只能读取当前项目明确挂载/上传的素材；当前项目没有素材时诚实为空，不得混入全局或其他项目素材。改稿偏好只能由当前项目自身已发布后的评论、指标与用户明确采纳行为派生；项目未制作、未发布或无数据时不得展示跨作品偏好。复盘卡只展示简短、可核验摘要，详细依据按需展开，不得把内部信号、整稿或超长原始文本直接铺满页面；不改全局视觉体系。|",
  "source_sha256": "b104dba07c24d0d38fcdafcdf523c7df2a636915403fa2d952c570b8886c00f2",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-b1070960"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-738",
  "title": "根治发布物料生成成功后无处查看并恢复卡内查看闭环【正式版回归·用户 2026-08-09】",
  "narrative": "“生成发布物料”成功后，原项目卡片必须显示真实可用的“查看发布物料”，在当前查看界面直接读取并展示已生成的各平台标题、正文等发布内容，支持刷新后回读；不得跳转发布中心，发布中心继续只负责排期管理，不新增发布管理入口、不改导航或视觉结构。",
  "documents": "既有发布物料生成与项目稿面契约",
  "source_line": "|T-738|根治发布物料生成成功后无处查看并恢复卡内查看闭环【正式版回归·用户 2026-08-09】|🔨|—|待验|既有发布物料生成与项目稿面契约|“生成发布物料”成功后，原项目卡片必须显示真实可用的“查看发布物料”，在当前查看界面直接读取并展示已生成的各平台标题、正文等发布内容，支持刷新后回读；不得跳转发布中心，发布中心继续只负责排期管理，不新增发布管理入口、不改导航或视觉结构。|",
  "source_sha256": "a8e6df2a80cdd3f307d521c3d4aec256947381929675f1186cd21fa2e90c7c4d",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-da6ec947"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-735",
  "title": "根治渠道受管模型成功产物被误判失败并建立 C 端稳定性闭环【智溯AI真机 2026-08-09】",
  "narrative": "以智溯AI真实 C 端日志和 OmniHi 任务事实为验收基线：2026-08-10 01:07:55 提交的 `seedance/seedance-2.0-fast` 视频在上游 01:09:56 已 `succeeded` 并产出可下载 MP4，CreatorOS 却于 01:09:57 将本地任务取消；同日生图也在上游成功并产生可下载 PNG，但客户端报错。根治图片与视频对真实 `result.data[0].url`、OpenAI 兼容顶层 `data[0]` 及已签约历史形状的解析差异，成功产物必须落为可预览候选，禁止把已生成且已计费的结果丢掉。对提交、轮询、下载和本地落库分别建立稳定状态与脱敏关联号；网络抖动只允许有界重试，未证明提交未被受理时不得重复发起计费生成；上游已成功而本地失败时必须按 provider job id 幂等恢复产物，过期或确实不可恢复时给出明确状态与人工处理入口。渠道错误包装必须保留可行动分类、HTTP/任务阶段和脱敏 reference，不得再把鉴权、额度、限流、上游失败、响应契约漂移、下载失败全部压成 `ChannelManagedProviderError reason=unknown`，同时不得向 C 端暴露中转站、子 Key、Base URL 或内部 provider。补真实响应合同 fixture、单元/集成测试、故障注入、重复提交与恢复测试，以及 Growth→CreatorOS→中转端的并发/背压、限流、超时和熔断验收；明确 Growth 控制面与直连数据面的并发责任，保证单用户并发不会重复计费、吞掉成功产物或拖垮客户端。以智溯AI渠道包完成文本、ASR、生图、生视频连续与并发真机回归，记录成功率、P95、错误分类和账单一致性；不得用测试连接或上游成功记录冒充 CreatorOS 端到端成功。本任务不授权部署或发布。",
  "documents": "[受管模型契约](docs/superpowers/specs/2026-08-02-capability-scoped-channel-model-authority.md) · [Growth 持久凭据契约](/Users/zyongzhu/Workbase/Thirdspace-growth/docs/contracts/T-133-activation-managed-model-subkey.md) · T-679/T-655 既有实现",
  "source_line": "|T-735|根治渠道受管模型成功产物被误判失败并建立 C 端稳定性闭环【智溯AI真机 2026-08-09】|🔨|—|待验|[受管模型契约](docs/superpowers/specs/2026-08-02-capability-scoped-channel-model-authority.md) · [Growth 持久凭据契约](/Users/zyongzhu/Workbase/Thirdspace-growth/docs/contracts/T-133-activation-managed-model-subkey.md) · T-679/T-655 既有实现|以智溯AI真实 C 端日志和 OmniHi 任务事实为验收基线：2026-08-10 01:07:55 提交的 `seedance/seedance-2.0-fast` 视频在上游 01:09:56 已 `succeeded` 并产出可下载 MP4，CreatorOS 却于 01:09:57 将本地任务取消；同日生图也在上游成功并产生可下载 PNG，但客户端报错。根治图片与视频对真实 `result.data[0].url`、OpenAI 兼容顶层 `data[0]` 及已签约历史形状的解析差异，成功产物必须落为可预览候选，禁止把已生成且已计费的结果丢掉。对提交、轮询、下载和本地落库分别建立稳定状态与脱敏关联号；网络抖动只允许有界重试，未证明提交未被受理时不得重复发起计费生成；上游已成功而本地失败时必须按 provider job id 幂等恢复产物，过期或确实不可恢复时给出明确状态与人工处理入口。渠道错误包装必须保留可行动分类、HTTP/任务阶段和脱敏 reference，不得再把鉴权、额度、限流、上游失败、响应契约漂移、下载失败全部压成 `ChannelManagedProviderError reason=unknown`，同时不得向 C 端暴露中转站、子 Key、Base URL 或内部 provider。补真实响应合同 fixture、单元/集成测试、故障注入、重复提交与恢复测试，以及 Growth→CreatorOS→中转端的并发/背压、限流、超时和熔断验收；明确 Growth 控制面与直连数据面的并发责任，保证单用户并发不会重复计费、吞掉成功产物或拖垮客户端。以智溯AI渠道包完成文本、ASR、生图、生视频连续与并发真机回归，记录成功率、P95、错误分类和账单一致性；不得用测试连接或上游成功记录冒充 CreatorOS 端到端成功。本任务不授权部署或发布。|",
  "source_sha256": "129eeed77095229d657c6fc52440b04d6289f21df8f33eea255b7d818e2c1357",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-f09d3b9a"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-734",
  "title": "根治 Windows 扫码绑定在启动前误依赖缺失 Playwright CLI【抖音账号绑定·用户真机 2026-08-09】",
  "narrative": "`v0.2.1-beta.3` Windows 真机点击“扫码绑定新抖音号”时，在任何浏览器启动前报“Playwright CLI 未找到”；根因边界与 T-720 的浏览器页面崩溃不同。当前抖音 `openContext` 无条件先跑旧的 `ensureChromiumInstalled`，使已经承诺的本机 Chrome 优先和随包 Chromium 回落都被 CLI 下载前置条件截断；打包器又允许静默跳过 Chromium，并未验证 Windows 最终 runtime 中浏览器可执行文件或离线回落能力。修复后账号绑定必须先按统一浏览器选择器尝试本机 Chrome，失败才使用壳层注入且经文件验证的随包 Chromium；正式 Windows runtime 不得把 Playwright CLI、全局 Node/npm 或联网下载当成启动前提。正式构建缺随包 Chromium 必须 fail-closed，只有显式开发/诊断构建可允许下载兜底；CLI 定位须支持实际 `runtime-images/<id>/sidecar` 与分层布局。用户可见错误须说明“本机 Chrome/内置浏览器均不可用”、影响与重装/导出日志动作，原始路径只留诊断日志。补单元测试、打包合同测试和 Windows 最终 runtime 布局检查，覆盖本机 Chrome 成功、Chrome 失败→随包 Chromium 成功、两者均缺失、路径含空格/非 ASCII、离线环境和旧 runtime 兼容；本任务不发布、不删除登录态。",
  "documents": "[Windows 生产闭环](docs/superpowers/specs/2026-08-03-windows-production-closure-default-release.md) · 既有 T-284 随包 Chromium、T-307 浏览器回落与 T-469 CLI 定位契约",
  "source_line": "|T-734|根治 Windows 扫码绑定在启动前误依赖缺失 Playwright CLI【抖音账号绑定·用户真机 2026-08-09】|🔨|—|待验|[Windows 生产闭环](docs/superpowers/specs/2026-08-03-windows-production-closure-default-release.md) · 既有 T-284 随包 Chromium、T-307 浏览器回落与 T-469 CLI 定位契约|`v0.2.1-beta.3` Windows 真机点击“扫码绑定新抖音号”时，在任何浏览器启动前报“Playwright CLI 未找到”；根因边界与 T-720 的浏览器页面崩溃不同。当前抖音 `openContext` 无条件先跑旧的 `ensureChromiumInstalled`，使已经承诺的本机 Chrome 优先和随包 Chromium 回落都被 CLI 下载前置条件截断；打包器又允许静默跳过 Chromium，并未验证 Windows 最终 runtime 中浏览器可执行文件或离线回落能力。修复后账号绑定必须先按统一浏览器选择器尝试本机 Chrome，失败才使用壳层注入且经文件验证的随包 Chromium；正式 Windows runtime 不得把 Playwright CLI、全局 Node/npm 或联网下载当成启动前提。正式构建缺随包 Chromium 必须 fail-closed，只有显式开发/诊断构建可允许下载兜底；CLI 定位须支持实际 `runtime-images/<id>/sidecar` 与分层布局。用户可见错误须说明“本机 Chrome/内置浏览器均不可用”、影响与重装/导出日志动作，原始路径只留诊断日志。补单元测试、打包合同测试和 Windows 最终 runtime 布局检查，覆盖本机 Chrome 成功、Chrome 失败→随包 Chromium 成功、两者均缺失、路径含空格/非 ASCII、离线环境和旧 runtime 兼容；本任务不发布、不删除登录态。|",
  "source_sha256": "0aa1df0b930babc1f41e6a349f9b4e353ccc5c2b9b9372dfe5f2e0dd7d50c9e9",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-69942b8f"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-733",
  "title": "本地模型可用时收起渠道配置误报警并纠正票据不适用状态【模型设置·用户真机 2026-08-09】",
  "narrative": "当已保存的本地文本模型可正常使用时，设置页不再显示“渠道配置安全校验未通过”等与当前使用路径无关的红色提示；Activity 明确返回 `CONFIG_TICKET_REQUEST_INVALID` 时按当前激活不适用渠道托管配置处理，不得写成 `authorization_changed` 或 `security_error`，真正的签名、安全或授权变化失败仍保持可见并失败关闭。",
  "documents": "[渠道模型逐能力契约](docs/superpowers/specs/2026-08-02-capability-scoped-channel-model-authority.md#12-t-733-票据不适用与本地模型提示收口2026-08-09)",
  "source_line": "|T-733|本地模型可用时收起渠道配置误报警并纠正票据不适用状态【模型设置·用户真机 2026-08-09】|🔨|—|待验|[渠道模型逐能力契约](docs/superpowers/specs/2026-08-02-capability-scoped-channel-model-authority.md#12-t-733-票据不适用与本地模型提示收口2026-08-09)|当已保存的本地文本模型可正常使用时，设置页不再显示“渠道配置安全校验未通过”等与当前使用路径无关的红色提示；Activity 明确返回 `CONFIG_TICKET_REQUEST_INVALID` 时按当前激活不适用渠道托管配置处理，不得写成 `authorization_changed` 或 `security_error`，真正的签名、安全或授权变化失败仍保持可见并失败关闭。|",
  "source_sha256": "cc135e7e8becbf8253ee60e0b46497314d0ca3172591da43b029334f1b245192",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-0a25ecec"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-732",
  "title": "根治局部改稿锚点失效后阻断全部 Copilot 对话【AI 对话可用性·用户真机 2026-08-09】",
  "narrative": "AI 整稿写入必须持久化稳定段落 ID；存量无 ID 版本由稿面、执行重绑和补丁采纳使用同一兼容锚点并在新版本自愈。“AI 改写本段”只在用户明确发起及围绕该段连续修订时携带段落锚点；当前版本已无法重绑目标段时，必须结束这次局部改稿、清除失效锚点并恢复项目普通对话，不能让后续任意消息继续被 `SCRIPT_SELECTION_STALE` 拦截，也不能提供必然重复失败的“重试”。覆盖整稿换版→点击第 2 段成功→采纳只改该段，以及失败→普通消息成功→重新点段落成功的连续回归。",
  "documents": "[T-716 局部改稿规格](docs/superpowers/specs/2026-08-06-copilot-script-editing-and-attachments.md) · [验收审计](docs/research/2026-08-13-t716-t732-acceptance-audit.md)",
  "source_line": "|T-732|根治局部改稿锚点失效后阻断全部 Copilot 对话【AI 对话可用性·用户真机 2026-08-09】|🔨|—|待验|[T-716 局部改稿规格](docs/superpowers/specs/2026-08-06-copilot-script-editing-and-attachments.md) · [验收审计](docs/research/2026-08-13-t716-t732-acceptance-audit.md)|AI 整稿写入必须持久化稳定段落 ID；存量无 ID 版本由稿面、执行重绑和补丁采纳使用同一兼容锚点并在新版本自愈。“AI 改写本段”只在用户明确发起及围绕该段连续修订时携带段落锚点；当前版本已无法重绑目标段时，必须结束这次局部改稿、清除失效锚点并恢复项目普通对话，不能让后续任意消息继续被 `SCRIPT_SELECTION_STALE` 拦截，也不能提供必然重复失败的“重试”。覆盖整稿换版→点击第 2 段成功→采纳只改该段，以及失败→普通消息成功→重新点段落成功的连续回归。|",
  "source_sha256": "0af9fcd6010b7214ec57971cac0fca6d9ea15aaa017575714353821e50c54cc3",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-669fe425"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-731",
  "title": "支持按电商等创作场景生成并自定义创作框架【场景化框架·用户后续 2026-08-09】",
  "narrative": "在 T-730 可选论点 UI 稳定后，再把固定四栏升级为场景化创作框架：由 AI 根据本次目标提出结构，支持电商、知识讲解、观点评论、测评等起点，并允许用户新增、删除、改名和排序框架项；不得用固定业务词表替代 AI 语义判断。",
  "documents": "T-730 后续",
  "source_line": "|T-731|支持按电商等创作场景生成并自定义创作框架【场景化框架·用户后续 2026-08-09】|📋 待办|—|待验|T-730 后续|在 T-730 可选论点 UI 稳定后，再把固定四栏升级为场景化创作框架：由 AI 根据本次目标提出结构，支持电商、知识讲解、观点评论、测评等起点，并允许用户新增、删除、改名和排序框架项；不得用固定业务词表替代 AI 语义判断。|",
  "source_sha256": "a9a078517af7b70ecb2a5dfae102b08c56a4c7d645207f2c394aa37a5843821d",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-4fed1462"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-729",
  "title": "根治渠道专属包仍跳官方入口并拆分官网、下载、人工反馈与反馈 API【白标完整性·智溯AI真机 2026-08-08】",
  "narrative": "以智溯AI `v0.3.0` 真机为失败事实：渠道模型 bundle `v5` 与受管凭据已经 `configured`，但软件更新仍固定打开 `creatoros.aitongban.cloud`；问题反馈在 `channelRuntime` 缺值或异常时回退 CreatorOS 官方飞书；自动反馈提交又把面向人的 `bugFeedbackUrl` origin 当成 Growth API authority。一次性收口 CreatorOS 多渠道外部入口：在受签名 `PackageManifest` 中明确区分包官网、下载页、人工反馈页与更新 manifest locator，并与激活后的购买、续费、支持、问题反馈运行时投影以及固定的 Growth feedback API authority 分离；用户可见链接只读取当前包或当前渠道的受信值，渠道包不得跨跳 CreatorOS 官方或其他渠道，远端 manifest 不得形成开放重定向，未激活、离线或快照延迟时必须按字段契约诚实降级，不能偷回官方默认值。修复更新卡、检查更新、购买、续费、支持、下载、问题反馈打开及自动提交完整链路，清除官方 URL 常量和飞书 fallback 对渠道包的渗漏；如涉及 manifest schema、Activity runtime 或反馈服务契约，开工前同步修订并审核上游 SPEC/合同。补源码扫描、合同测试、单元测试和 macOS 安装包真机点击回归，至少覆盖 CreatorOS 官方包与智溯AI包、激活与未激活、在线与离线、运行时新鲜与陈旧、反馈 API 成功与拒绝，并继续保证只接受 allowlist/签名 URL、日志不泄露激活码或密钥。完成后重打本地智溯AI安装包供用户验证；本任务不授权部署、发布或改动线上 Growth。",
  "documents": "[渠道包工厂 SPEC](docs/superpowers/specs/2026-08-04-channel-package-factory-and-incremental-update.md) · [T-718 真机构建证据](orchestrator/GATE-T718-BUILD.md) · [白标边界调研](docs/research/2026-08-04-white-label-runtime-vs-package-boundary.md)",
  "source_line": "|T-729|根治渠道专属包仍跳官方入口并拆分官网、下载、人工反馈与反馈 API【白标完整性·智溯AI真机 2026-08-08】|📋 待办|—|待验|[渠道包工厂 SPEC](docs/superpowers/specs/2026-08-04-channel-package-factory-and-incremental-update.md) · [T-718 真机构建证据](orchestrator/GATE-T718-BUILD.md) · [白标边界调研](docs/research/2026-08-04-white-label-runtime-vs-package-boundary.md)|以智溯AI `v0.3.0` 真机为失败事实：渠道模型 bundle `v5` 与受管凭据已经 `configured`，但软件更新仍固定打开 `creatoros.aitongban.cloud`；问题反馈在 `channelRuntime` 缺值或异常时回退 CreatorOS 官方飞书；自动反馈提交又把面向人的 `bugFeedbackUrl` origin 当成 Growth API authority。一次性收口 CreatorOS 多渠道外部入口：在受签名 `PackageManifest` 中明确区分包官网、下载页、人工反馈页与更新 manifest locator，并与激活后的购买、续费、支持、问题反馈运行时投影以及固定的 Growth feedback API authority 分离；用户可见链接只读取当前包或当前渠道的受信值，渠道包不得跨跳 CreatorOS 官方或其他渠道，远端 manifest 不得形成开放重定向，未激活、离线或快照延迟时必须按字段契约诚实降级，不能偷回官方默认值。修复更新卡、检查更新、购买、续费、支持、下载、问题反馈打开及自动提交完整链路，清除官方 URL 常量和飞书 fallback 对渠道包的渗漏；如涉及 manifest schema、Activity runtime 或反馈服务契约，开工前同步修订并审核上游 SPEC/合同。补源码扫描、合同测试、单元测试和 macOS 安装包真机点击回归，至少覆盖 CreatorOS 官方包与智溯AI包、激活与未激活、在线与离线、运行时新鲜与陈旧、反馈 API 成功与拒绝，并继续保证只接受 allowlist/签名 URL、日志不泄露激活码或密钥。完成后重打本地智溯AI安装包供用户验证；本任务不授权部署、发布或改动线上 Growth。|",
  "source_sha256": "da4188541dd8a0c509498e0cd30b457ffc5ea07cc28cbb9d62614cb4c42df346",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-b2c8f5de"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-721",
  "title": "根治素材包导出回流造成递归嵌套并恢复大素材库完整可见性【素材数据安全·用户 2026-08-08】",
  "narrative": "导出素材包必须作为一次性下载产物写入对象存储，不得创建普通素材记录；既有素材包 ZIP 保留但以后导出时自动隔离，防止 ZIP 自嵌套。素材中心和项目素材查询必须完整分页加载，不能因固定 200/100 条上限让旧素材消失。",
  "documents": "[SPEC](docs/superpowers/specs/2026-08-08-material-export-isolation-and-asset-pagination.md)",
  "source_line": "|T-721|根治素材包导出回流造成递归嵌套并恢复大素材库完整可见性【素材数据安全·用户 2026-08-08】|🔨|—|待验|[SPEC](docs/superpowers/specs/2026-08-08-material-export-isolation-and-asset-pagination.md)|导出素材包必须作为一次性下载产物写入对象存储，不得创建普通素材记录；既有素材包 ZIP 保留但以后导出时自动隔离，防止 ZIP 自嵌套。素材中心和项目素材查询必须完整分页加载，不能因固定 200/100 条上限让旧素材消失。|",
  "source_sha256": "689e5e836886ec16d962c0731e9c3344b365517953409b5f91798fd8aa07f246",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-1ed8f53f"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-720",
  "title": "根治特定 Windows 设备抖音内置浏览器页面崩溃导致内容雷达主页验证失败【飞书用户日志·2026-08-08】",
  "narrative": "该问题目前只在飞书记录 `rec27WFKVrkvAY` 对应的一台 Windows 设备出现，不得扩大表述为 Windows 普遍故障。用户链接本身是完整 `douyin.com/user/...`；该机 `v0.2.1-beta.3` 日志显示从作品同步、单条导入到对标主页预览连续多日全部失败于 `page.goto: Page crashed`，更符合随包 Chromium 与该机运行环境、显卡/沙箱、安全软件、资源或运行时完整性的兼容异常。当前 main 仍只在同一崩溃 page 上退避重试，并把未知错误误译成“请确认登录/完整链接”，因此缺少单机异常恢复与诊断。须统一识别 page/context/browser crash，先新建 page、仍失败再关闭失效 context 并基于同一账号 profile 做一次有界重建与浏览器回落；作品采集和主页预览复用同一恢复能力。仍失败时返回“本机内置浏览器异常”的可行动提示，记录脱敏的浏览器版本、可执行路径、OS/arch、启动参数、page/context crash 与资源线索，禁止误报链接或登录。补 Windows 打包后真导航回归和兼容性样本，且不得清空 Cookie 或伪造验证成功。",
  "documents": "[飞书反馈记录](https://my.feishu.cn/base/S1BRb4i6kaD0bnsViJSco0jxnRg?table=tblIPu0er91yGTwL&view=vewb4HsOUz) · 既有 Chromium guard 与抖音采集契约",
  "source_line": "|T-720|根治特定 Windows 设备抖音内置浏览器页面崩溃导致内容雷达主页验证失败【飞书用户日志·2026-08-08】|📋 待办|—|待验|[飞书反馈记录](https://my.feishu.cn/base/S1BRb4i6kaD0bnsViJSco0jxnRg?table=tblIPu0er91yGTwL&view=vewb4HsOUz) · 既有 Chromium guard 与抖音采集契约|该问题目前只在飞书记录 `rec27WFKVrkvAY` 对应的一台 Windows 设备出现，不得扩大表述为 Windows 普遍故障。用户链接本身是完整 `douyin.com/user/...`；该机 `v0.2.1-beta.3` 日志显示从作品同步、单条导入到对标主页预览连续多日全部失败于 `page.goto: Page crashed`，更符合随包 Chromium 与该机运行环境、显卡/沙箱、安全软件、资源或运行时完整性的兼容异常。当前 main 仍只在同一崩溃 page 上退避重试，并把未知错误误译成“请确认登录/完整链接”，因此缺少单机异常恢复与诊断。须统一识别 page/context/browser crash，先新建 page、仍失败再关闭失效 context 并基于同一账号 profile 做一次有界重建与浏览器回落；作品采集和主页预览复用同一恢复能力。仍失败时返回“本机内置浏览器异常”的可行动提示，记录脱敏的浏览器版本、可执行路径、OS/arch、启动参数、page/context crash 与资源线索，禁止误报链接或登录。补 Windows 打包后真导航回归和兼容性样本，且不得清空 Cookie 或伪造验证成功。|",
  "source_sha256": "88b2d7e98c3e3bc7c0a6494097f067d0060fb72dad38e2964f89742de2c5d5f6",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-962af3d4"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-719",
  "title": "根治桌面端启动后二次白屏闪烁与首页排期提醒不可用【启动稳定性·用户录屏 2026-08-07】",
  "narrative": "基于用户 7.36 秒录屏排查“页面已完整渲染后又被整页白屏覆盖/重复刷新”的启动时序，统一检查桌面壳、sidecar 就绪、导航、onboarding 与前端 hydration，禁止用循环刷新掩盖启动失败；首页排期提醒必须读取当前账号真实排期，未绑定账号或无排期时显示真实 0/空态，只有真实服务异常才显示可重试错误，并留下完整脱敏诊断日志。补跨层回归后交付，不把 macOS 录屏或 fixture 冒充 Windows 真机回执。",
  "documents": "[Windows 生产闭环](docs/superpowers/specs/2026-08-03-windows-production-closure-default-release.md) · [T-599 排期提醒契约](docs/superpowers/specs/2026-07-29-project-publishing-schedule.contract.md)",
  "source_line": "|T-719|根治桌面端启动后二次白屏闪烁与首页排期提醒不可用【启动稳定性·用户录屏 2026-08-07】|🔨|—|待验|[Windows 生产闭环](docs/superpowers/specs/2026-08-03-windows-production-closure-default-release.md) · [T-599 排期提醒契约](docs/superpowers/specs/2026-07-29-project-publishing-schedule.contract.md)|基于用户 7.36 秒录屏排查“页面已完整渲染后又被整页白屏覆盖/重复刷新”的启动时序，统一检查桌面壳、sidecar 就绪、导航、onboarding 与前端 hydration，禁止用循环刷新掩盖启动失败；首页排期提醒必须读取当前账号真实排期，未绑定账号或无排期时显示真实 0/空态，只有真实服务异常才显示可重试错误，并留下完整脱敏诊断日志。补跨层回归后交付，不把 macOS 录屏或 fixture 冒充 Windows 真机回执。|",
  "source_sha256": "b0d59f50c1f5bb94cafc3e0b6c8c71d6a14feeecbfbdb6064e45d0f24d198b80",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-11705d22"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-718",
  "title": "补齐智溯AI包内品牌并交付完整 Growth 配置后重打本地包【渠道验收失败·用户 2026-08-07】",
  "narrative": "修复 T-717 仅替换系统应用名与图标、应用内部窗口标题和侧边栏仍显示 CreatorOS 的白标缺口：包级身份必须在激活前提供智溯AI品牌，激活后由受信任 Growth 配置继续作为运行时品牌与业务链接权威；侧边栏品牌名和品牌图标、页面标题等用户可见壳层不得残留 CreatorOS。把包含 channelService 与 productConfig 的完整 Growth JSON 固化进智溯科技交付目录，完成测试、重构建、唯一安装、真实启动和界面截图验收；同步升级项目级 `packaging-creatoros-channel` Skill，把窗口标题、侧边栏名称/图标、完整 Growth 配置与真机截图列为后续白标包强制 Gate，不上传、不发布、不修改线上 Growth。",
  "documents": "[渠道包工厂 SPEC](docs/superpowers/specs/2026-08-04-channel-package-factory-and-incremental-update.md) · [智溯AI文件矩阵](docs/research/2026-08-04-zhisu-ai-package-file-change-matrix.md) · [本机构建证据](orchestrator/GATE-T718-BUILD.md)",
  "source_line": "|T-718|补齐智溯AI包内品牌并交付完整 Growth 配置后重打本地包【渠道验收失败·用户 2026-08-07】|🔨|—|待验|[渠道包工厂 SPEC](docs/superpowers/specs/2026-08-04-channel-package-factory-and-incremental-update.md) · [智溯AI文件矩阵](docs/research/2026-08-04-zhisu-ai-package-file-change-matrix.md) · [本机构建证据](orchestrator/GATE-T718-BUILD.md)|修复 T-717 仅替换系统应用名与图标、应用内部窗口标题和侧边栏仍显示 CreatorOS 的白标缺口：包级身份必须在激活前提供智溯AI品牌，激活后由受信任 Growth 配置继续作为运行时品牌与业务链接权威；侧边栏品牌名和品牌图标、页面标题等用户可见壳层不得残留 CreatorOS。把包含 channelService 与 productConfig 的完整 Growth JSON 固化进智溯科技交付目录，完成测试、重构建、唯一安装、真实启动和界面截图验收；同步升级项目级 `packaging-creatoros-channel` Skill，把窗口标题、侧边栏名称/图标、完整 Growth 配置与真机截图列为后续白标包强制 Gate，不上传、不发布、不修改线上 Growth。|",
  "source_sha256": "6501e7fdd9f0b11885d7246ca5323730ecbb44819e3b319107551bf96f1dd502",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-28cee261"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-716",
  "title": "完善 Copilot 局部改稿、脚本版本回退、附件上下文与素材中心稳定排序【创作编辑闭环·用户 2026-08-06】",
  "narrative": "素材中心统一按真实 `createdAt DESC` 稳定排序，最新素材始终在前；稿面段落支持把明确选区/段落锚点交给 Copilot 定点改写，AI 只产局部补丁候选，用户确认后合并为新的完整脚本版本，不再默认整稿重生成；口播脚本提供版本下拉、预览与恢复，恢复只切换到既有不可变版本、不制造重复版本；所有工具在执行前重读服务端当下真值，不使用对话或客户端旧快照；分镜“点名素材”展示真实文件名/标题而非裸 `assetId`；Copilot 输入框支持拖拽或选择文件与图片，复用项目素材上传和安全读取链形成显式上下文，支持视觉的模型可读图片，不支持时给出清晰能力提示且不得假装已识别。全部闭环后按 T-713 统一生成 CreatorOS 0.3.0 macOS 本地测试包。",
  "documents": "[实现规格](docs/superpowers/specs/2026-08-06-copilot-script-editing-and-attachments.md) · [验收审计](docs/research/2026-08-13-t716-t732-acceptance-audit.md) · [T-691 Copilot 生命周期](docs/superpowers/specs/2026-08-04-copilot-project-lifecycle-tool-closure.md)",
  "source_line": "|T-716|完善 Copilot 局部改稿、脚本版本回退、附件上下文与素材中心稳定排序【创作编辑闭环·用户 2026-08-06】|🔨|—|待验|[实现规格](docs/superpowers/specs/2026-08-06-copilot-script-editing-and-attachments.md) · [验收审计](docs/research/2026-08-13-t716-t732-acceptance-audit.md) · [T-691 Copilot 生命周期](docs/superpowers/specs/2026-08-04-copilot-project-lifecycle-tool-closure.md)|素材中心统一按真实 `createdAt DESC` 稳定排序，最新素材始终在前；稿面段落支持把明确选区/段落锚点交给 Copilot 定点改写，AI 只产局部补丁候选，用户确认后合并为新的完整脚本版本，不再默认整稿重生成；口播脚本提供版本下拉、预览与恢复，恢复只切换到既有不可变版本、不制造重复版本；所有工具在执行前重读服务端当下真值，不使用对话或客户端旧快照；分镜“点名素材”展示真实文件名/标题而非裸 `assetId`；Copilot 输入框支持拖拽或选择文件与图片，复用项目素材上传和安全读取链形成显式上下文，支持视觉的模型可读图片，不支持时给出清晰能力提示且不得假装已识别。全部闭环后按 T-713 统一生成 CreatorOS 0.3.0 macOS 本地测试包。|",
  "source_sha256": "a678baed257d2bb45498d02175cc0d250407b1a3715b52e708298714d528485f",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-e3a6572c"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-715",
  "title": "在 CreatorOS 增加 Growth AI 额度账户连接、查看与充值入口【额度闭环·用户 2026-08-06】",
  "narrative": "复用当前激活权益申请全新 config access ticket，调用 Growth 创建一次性额度会话；CreatorOS 只提供“查看 AI 额度与消耗”入口，首次固定打开 Growth 用户端 `/credits/connect#<one-time-code>` 完成登录/注册与绑定，已绑定时固定打开用户端 `/credits/launch#<one-time-code>`，不得出现端选择，也不得因 partner/channel/admin 角色转去管理端或渠道端。票据、一次性码、激活码、充值码和受管子 Key 不得进入 URL query、日志或普通缓存。受管 AI 额度耗尽时，Copilot 与异步任务必须显示“AI 额度不足”并提供同一安全用户端充值入口，不得冒充模型故障或暴露模型、服务商和中转实现；用户自配模型的余额错误仍按本地模型配置处理。CreatorOS 只负责安全入口和本地激活状态，额度汇总、刷新、充值和账本归 Growth；本任务不修改 Activity。2026-08-06 真机已到达 Growth 用户端且 fragment 被移除，但生产兑换失败（脱敏参考号见 Gate），因此保持待验，不能把打开页面冒充额度闭环。",
  "documents": "[真实联调 Gate](orchestrator/GATE-T715-BUILD.md) · [Growth T-137 充值契约](/Users/masx/Projects/Thirdspace-growth/docs/contracts/T-137-ai-credit-recharge.md) · [T-679 受管模型契约](docs/superpowers/specs/2026-08-02-capability-scoped-channel-model-authority.md)",
  "source_line": "|T-715|在 CreatorOS 增加 Growth AI 额度账户连接、查看与充值入口【额度闭环·用户 2026-08-06】|🔨|—|待验|[真实联调 Gate](orchestrator/GATE-T715-BUILD.md) · [Growth T-137 充值契约](/Users/masx/Projects/Thirdspace-growth/docs/contracts/T-137-ai-credit-recharge.md) · [T-679 受管模型契约](docs/superpowers/specs/2026-08-02-capability-scoped-channel-model-authority.md)|复用当前激活权益申请全新 config access ticket，调用 Growth 创建一次性额度会话；CreatorOS 只提供“查看 AI 额度与消耗”入口，首次固定打开 Growth 用户端 `/credits/connect#<one-time-code>` 完成登录/注册与绑定，已绑定时固定打开用户端 `/credits/launch#<one-time-code>`，不得出现端选择，也不得因 partner/channel/admin 角色转去管理端或渠道端。票据、一次性码、激活码、充值码和受管子 Key 不得进入 URL query、日志或普通缓存。受管 AI 额度耗尽时，Copilot 与异步任务必须显示“AI 额度不足”并提供同一安全用户端充值入口，不得冒充模型故障或暴露模型、服务商和中转实现；用户自配模型的余额错误仍按本地模型配置处理。CreatorOS 只负责安全入口和本地激活状态，额度汇总、刷新、充值和账本归 Growth；本任务不修改 Activity。2026-08-06 真机已到达 Growth 用户端且 fragment 被移除，但生产兑换失败（脱敏参考号见 Gate），因此保持待验，不能把打开页面冒充额度闭环。|",
  "source_sha256": "472b6f79438619b653f94328c16986b2fffe117a1b6d64b334224e23da3e827b",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-1b3f9ab2"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-714",
  "title": "接入工程教训闭环并迁移旧账本，确保真实踩坑可被后续任务自动复用【工程进化·用户 2026-08-06】",
  "narrative": "升级并接入 `product-to-code-orchestrator` 最新教训闭环：`eval_red` 必须幂等进入 observation 收件箱，完整事件流不得因过滤后错位归档而丢失；把旧 `active/promoted` 账本显式审计和迁移，只有同 ID 可执行守卫或通过注入门的 `candidate/rule` 才能进入阶段上下文；为 BUILD/SHIP 提供可重复的 `lessonctl audit/context` 验证，持续完善通用 Skill 与项目守卫。该任务只管工程流程，不替代产品运行时 Skill 迭代任务 T-087。",
  "documents": "[`product-to-code-orchestrator`](orchestrator/process/.skill-version) · [教训账本](orchestrator/LESSON_LEDGER.md) · [注入门](orchestrator/gates/lessons-injection-gate.md)",
  "source_line": "|T-714|接入工程教训闭环并迁移旧账本，确保真实踩坑可被后续任务自动复用【工程进化·用户 2026-08-06】|📋 待办|—|待验|[`product-to-code-orchestrator`](orchestrator/process/.skill-version) · [教训账本](orchestrator/LESSON_LEDGER.md) · [注入门](orchestrator/gates/lessons-injection-gate.md)|升级并接入 `product-to-code-orchestrator` 最新教训闭环：`eval_red` 必须幂等进入 observation 收件箱，完整事件流不得因过滤后错位归档而丢失；把旧 `active/promoted` 账本显式审计和迁移，只有同 ID 可执行守卫或通过注入门的 `candidate/rule` 才能进入阶段上下文；为 BUILD/SHIP 提供可重复的 `lessonctl audit/context` 验证，持续完善通用 Skill 与项目守卫。该任务只管工程流程，不替代产品运行时 Skill 迭代任务 T-087。|",
  "source_sha256": "5b83187fe20ea158eef96c36c1210ccc341c5c76bca36846dd5bd9e95401b812",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-bcc08c2f"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-713",
  "title": "构建包含通用智能体语义边界与当前制作修复的 macOS 0.3.0 本地测试包【本地验收·用户 2026-08-06】",
  "narrative": "基于当前 main 脏工作区完整构建 CreatorOS 0.3.0 macOS 本地测试包，复用统一 Node 25 + `release-fast` 流水线，包含 `material.match` 语义匹配、成片预览与项目级语义边界门卫；不清理或覆盖并行改动，不走 Developer ID、公证、上传或远端发布。构建成功后必须自动替换唯一 `/Applications/CreatorOS.app`、启动应用并确认真实进程，禁止只交付包路径；最终回报 DMG 绝对路径、大小、SHA-256、签名状态与真实启动自检证据。",
  "documents": "[发布流程](docs/RELEASING.md) · [T-712 制作体验](docs/superpowers/specs/2026-08-05-video-production-editing-loop.md)",
  "source_line": "|T-713|构建包含通用智能体语义边界与当前制作修复的 macOS 0.3.0 本地测试包【本地验收·用户 2026-08-06】|🔨|—|待验|[发布流程](docs/RELEASING.md) · [T-712 制作体验](docs/superpowers/specs/2026-08-05-video-production-editing-loop.md)|基于当前 main 脏工作区完整构建 CreatorOS 0.3.0 macOS 本地测试包，复用统一 Node 25 + `release-fast` 流水线，包含 `material.match` 语义匹配、成片预览与项目级语义边界门卫；不清理或覆盖并行改动，不走 Developer ID、公证、上传或远端发布。构建成功后必须自动替换唯一 `/Applications/CreatorOS.app`、启动应用并确认真实进程，禁止只交付包路径；最终回报 DMG 绝对路径、大小、SHA-256、签名状态与真实启动自检证据。|",
  "source_sha256": "a0858fbf424c928c4edc9ca498d908d18eccb52c79c0b4614ebbbb1066bffaf6",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-fc647419"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-712",
  "title": "优先采用用户上传素材进入 B-roll 时间线、恢复成片预览并收回渠道同步常驻提示【制作体验·本机实测 2026-08-05】",
  "narrative": "项目上传/挂载的视频和图片进入候选后，`video.broll` 只产画面需求，统一由现有 `material.match` Skill 结合口播、场景、画面需求、原始文件名、尺寸/时长与真实素材清单做 AI 语义匹配；代码只校验真实 assetId、场景和时间边界，禁止写死词表或用字符串相似度替 AI 选素材。首轮进入时间线的素材即视为已绑定；人工只改一处时也必须把全部既有绑定作为硬约束继承，并在当前方案上重算插点和展示时长，禁止新一轮洗掉旧绑定。AI 必须显式判断素材为录屏、静态图片、普通实拍或封面，并同时决定主视觉、镜头运动与有效展示时长；只有需要阅读或观察操作的录屏才能真正 `full_frame`，全屏录屏期间人物保留为左下角画中画；静态图片和普通实拍保持原始比例进入独立安全舞台，永不强行全屏，封面永不进入时间线。任意时刻只允许一个非 overlay 主素材，下一主素材进场必须结束上一主素材并清空旧信息卡，禁止横图、竖图和标题多层叠放。竖图/竖视频保持原始比例和竖版舞台，主视觉不得遮脸。本轮不更换 CreatorOS 既有视觉风格，只修复横竖屏素材呈现与时间线回归。竖版无主视觉时人物铺满手机画布；普通信息卡不得把人物降成角落小窗；横图/横录屏在保留完整原图的同时用同源氛围层或上下分区填充竖屏，禁止中央窄条加巨幅黑边；新生成素材必须按本次交付画幅构图。场景名、`SCENE/分镜序号` 与整段口播摘要只属于编辑层，不得烧进成片；上屏文字只保留经 AI 编导筛选的短标题、数字、对比、清单和金句，并用渐进式动画表达，禁止做成干巴巴的 PPT 复述。成片抽帧先跑确定性遮挡/可读性门；配置视觉模型时再做非阻断视觉审核。分场、信息卡、真人主画面、用户素材/B-roll 与字幕必须先各自通过结构契约审核，再由唯一 `video.director` 读入完整候选时间线统筹审片。总导演内部只有“修到可渲染”：发现视觉空档、素材时长/语义承接或字幕时间问题时，必须保留已绑定素材，在原方案内自动收口时长、做素材接力并用口播原文信息卡补位，再执行有界复审；不得把“缺素材/阻断/重新配分镜”退给用户。审片模型不可用时由确定性修片层补齐并交用户最终过目，禁止无限重试或编造事实。以本机真实成片和完整项目素材包建立可重复回归 loop，必须由 CreatorOS 当前配置模型真实跑素材语义和分镜，每轮落模型决策、render props、确定性 Gate、成片和抽帧证据，直到静态图不全屏、全屏录屏保留左下画中画、封面不入时间线、主视觉无重叠。已生成的 `final.mp4` 必须通过受控临时预览 URL 在桌面 WebView 可播放并支持 Range。右下角渠道同步提示只在设置页展示。",
  "documents": "[T-687 口播联想画面 Skill](docs/superpowers/specs/2026-08-04-voiceover-associative-visual-skill.md) · [T-703 视频制作闭环](docs/superpowers/specs/2026-08-05-video-production-editing-loop.md)",
  "source_line": "|T-712|优先采用用户上传素材进入 B-roll 时间线、恢复成片预览并收回渠道同步常驻提示【制作体验·本机实测 2026-08-05】|🔨|—|待验|[T-687 口播联想画面 Skill](docs/superpowers/specs/2026-08-04-voiceover-associative-visual-skill.md) · [T-703 视频制作闭环](docs/superpowers/specs/2026-08-05-video-production-editing-loop.md)|项目上传/挂载的视频和图片进入候选后，`video.broll` 只产画面需求，统一由现有 `material.match` Skill 结合口播、场景、画面需求、原始文件名、尺寸/时长与真实素材清单做 AI 语义匹配；代码只校验真实 assetId、场景和时间边界，禁止写死词表或用字符串相似度替 AI 选素材。首轮进入时间线的素材即视为已绑定；人工只改一处时也必须把全部既有绑定作为硬约束继承，并在当前方案上重算插点和展示时长，禁止新一轮洗掉旧绑定。AI 必须显式判断素材为录屏、静态图片、普通实拍或封面，并同时决定主视觉、镜头运动与有效展示时长；只有需要阅读或观察操作的录屏才能真正 `full_frame`，全屏录屏期间人物保留为左下角画中画；静态图片和普通实拍保持原始比例进入独立安全舞台，永不强行全屏，封面永不进入时间线。任意时刻只允许一个非 overlay 主素材，下一主素材进场必须结束上一主素材并清空旧信息卡，禁止横图、竖图和标题多层叠放。竖图/竖视频保持原始比例和竖版舞台，主视觉不得遮脸。本轮不更换 CreatorOS 既有视觉风格，只修复横竖屏素材呈现与时间线回归。竖版无主视觉时人物铺满手机画布；普通信息卡不得把人物降成角落小窗；横图/横录屏在保留完整原图的同时用同源氛围层或上下分区填充竖屏，禁止中央窄条加巨幅黑边；新生成素材必须按本次交付画幅构图。场景名、`SCENE/分镜序号` 与整段口播摘要只属于编辑层，不得烧进成片；上屏文字只保留经 AI 编导筛选的短标题、数字、对比、清单和金句，并用渐进式动画表达，禁止做成干巴巴的 PPT 复述。成片抽帧先跑确定性遮挡/可读性门；配置视觉模型时再做非阻断视觉审核。分场、信息卡、真人主画面、用户素材/B-roll 与字幕必须先各自通过结构契约审核，再由唯一 `video.director` 读入完整候选时间线统筹审片。总导演内部只有“修到可渲染”：发现视觉空档、素材时长/语义承接或字幕时间问题时，必须保留已绑定素材，在原方案内自动收口时长、做素材接力并用口播原文信息卡补位，再执行有界复审；不得把“缺素材/阻断/重新配分镜”退给用户。审片模型不可用时由确定性修片层补齐并交用户最终过目，禁止无限重试或编造事实。以本机真实成片和完整项目素材包建立可重复回归 loop，必须由 CreatorOS 当前配置模型真实跑素材语义和分镜，每轮落模型决策、render props、确定性 Gate、成片和抽帧证据，直到静态图不全屏、全屏录屏保留左下画中画、封面不入时间线、主视觉无重叠。已生成的 `final.mp4` 必须通过受控临时预览 URL 在桌面 WebView 可播放并支持 Range。右下角渠道同步提示只在设置页展示。|",
  "source_sha256": "f6172a471c829b233b1dfe3d8f7ca18ff900738a8f5d24baa8065df191c207b6",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-43f5cbb4"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-709",
  "title": "将 macOS Developer ID 签名与 Apple 公证凭据接入 GitHub 正式发布流水线【发布安全·用户 2026-08-05】",
  "narrative": "`desktop-release` 的 macOS job 必须从 GitHub Secrets 导入 Developer ID P12 到一次性钥匙串，使用同一身份签入 sidecar、Tauri App 与 DMG，再通过临时 `notarytool` profile 完成 submit、staple、Gatekeeper 和真启动验收；缺任一凭据必须 fail-closed，证书、密码、私钥不得写入仓库、artifact 或日志。本轮只改代码与文档，不触发远端流水线。",
  "documents": "[发布流程](docs/RELEASING.md) · [T-640 Gate](orchestrator/GATE-T640-BUILD.md)",
  "source_line": "|T-709|将 macOS Developer ID 签名与 Apple 公证凭据接入 GitHub 正式发布流水线【发布安全·用户 2026-08-05】|🔨|—|待验|[发布流程](docs/RELEASING.md) · [T-640 Gate](orchestrator/GATE-T640-BUILD.md)|`desktop-release` 的 macOS job 必须从 GitHub Secrets 导入 Developer ID P12 到一次性钥匙串，使用同一身份签入 sidecar、Tauri App 与 DMG，再通过临时 `notarytool` profile 完成 submit、staple、Gatekeeper 和真启动验收；缺任一凭据必须 fail-closed，证书、密码、私钥不得写入仓库、artifact 或日志。本轮只改代码与文档，不触发远端流水线。|",
  "source_sha256": "8a1472bf286c69b5d4f996dee2761630000c69230837221fa2309cfb496b9ffe",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-ed1e724c"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-708",
  "title": "全局审计并软化 AI 工具中不合理的创作完整度门禁【工具灵活性·用户 2026-08-05】",
  "narrative": "全局检查工具描述、系统提示、UI 禁用态和执行层校验：只保留鉴权/归属/隐私安全/破坏性操作/幂等冲突/真实事实不可伪造等硬门；六问完成、先选多个方向、先联网、素材齐全、格式或长度完整等质量条件改为软提示，用户明确要求时先返回可编辑候选并标注假设、缺口和风险，禁止因增强步骤失败清空已有结果。",
  "documents": "[门禁全局审计](docs/research/2026-08-05-ai-tool-hard-gate-audit.md) · [T-707 定位 Copilot SPEC](docs/superpowers/specs/2026-08-01-positioning-pre-interview-workflow.md#101-工具门禁统一规则) · [T-646 结构化工具可靠性](docs/research/2026-08-01-structured-ai-tool-reliability-audit.md)",
  "source_line": "|T-708|全局审计并软化 AI 工具中不合理的创作完整度门禁【工具灵活性·用户 2026-08-05】|🔨|—|待验|[门禁全局审计](docs/research/2026-08-05-ai-tool-hard-gate-audit.md) · [T-707 定位 Copilot SPEC](docs/superpowers/specs/2026-08-01-positioning-pre-interview-workflow.md#101-工具门禁统一规则) · [T-646 结构化工具可靠性](docs/research/2026-08-01-structured-ai-tool-reliability-audit.md)|全局检查工具描述、系统提示、UI 禁用态和执行层校验：只保留鉴权/归属/隐私安全/破坏性操作/幂等冲突/真实事实不可伪造等硬门；六问完成、先选多个方向、先联网、素材齐全、格式或长度完整等质量条件改为软提示，用户明确要求时先返回可编辑候选并标注假设、缺口和风险，禁止因增强步骤失败清空已有结果。|",
  "source_sha256": "b667a7be4ed068a72a5faa4aa34dbcf757482f1b6ba19ba0dc9404f40cd711d3",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-accce142"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-705",
  "title": "根治 macOS 本地包启动后落入 Page Not Found【发布阻断·本机实测 2026-08-05】",
  "narrative": "新构建的 CreatorOS 0.3.0 DMG 安装后，sidecar 已 Ready 但 WebView 显示 Page Not Found；须从壳层启动 URL、授权重定向、Next standalone 路由与首次导航链定位根因并修复，补真实打包产物启动回归，确保首页或激活页返回真实 200 且不可再用“sidecar 进程存活”冒充页面可用。",
  "documents": "[发布流程](docs/RELEASING.md) · [T-703 SPEC](docs/superpowers/specs/2026-08-05-video-production-editing-loop.md)",
  "source_line": "|T-705|根治 macOS 本地包启动后落入 Page Not Found【发布阻断·本机实测 2026-08-05】|🔨|—|待验|[发布流程](docs/RELEASING.md) · [T-703 SPEC](docs/superpowers/specs/2026-08-05-video-production-editing-loop.md)|新构建的 CreatorOS 0.3.0 DMG 安装后，sidecar 已 Ready 但 WebView 显示 Page Not Found；须从壳层启动 URL、授权重定向、Next standalone 路由与首次导航链定位根因并修复，补真实打包产物启动回归，确保首页或激活页返回真实 200 且不可再用“sidecar 进程存活”冒充页面可用。|",
  "source_sha256": "80aa4e705ea1010e4670dde6ccec72709481059f835272edfad3c0d11164e623",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-c3bc1f79"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-702",
  "title": "根治审核“应用改写”后分镜稿格式坍缩为 Markdown 表格源码【稿面编辑·用户 2026-08-05】",
  "narrative": "“应用改写”只能替换用户确认的命中片段，必须完整保留当前脚本的 `contentData`、富文本 HTML、分镜 sections、画面/字幕/时长等结构与当前视图；禁止把 sections 临时拼成 `heading + body` 的纯文本后覆盖 canonical `contentText`，也禁止在命中只存在于全文时创建一个丢失 `contentData` 的新版本。统一稿面审核卡与 Copilot 审核卡的单一替换函数，覆盖 Markdown 表格、纯文本稿、结构化分镜稿、连续应用多条建议、刷新及撤销回滚测试；写后页面仍按原格式显示，只改变目标文案。",
  "documents": "既有稿面审核门与脚本 artifact 版本契约",
  "source_line": "|T-702|根治审核“应用改写”后分镜稿格式坍缩为 Markdown 表格源码【稿面编辑·用户 2026-08-05】|📋 待办|—|待验|既有稿面审核门与脚本 artifact 版本契约|“应用改写”只能替换用户确认的命中片段，必须完整保留当前脚本的 `contentData`、富文本 HTML、分镜 sections、画面/字幕/时长等结构与当前视图；禁止把 sections 临时拼成 `heading + body` 的纯文本后覆盖 canonical `contentText`，也禁止在命中只存在于全文时创建一个丢失 `contentData` 的新版本。统一稿面审核卡与 Copilot 审核卡的单一替换函数，覆盖 Markdown 表格、纯文本稿、结构化分镜稿、连续应用多条建议、刷新及撤销回滚测试；写后页面仍按原格式显示，只改变目标文案。|",
  "source_sha256": "514157e1e1d3146a0a42b43223ec5f61ca1533f72fcead83f7aa54e9321c5be9",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-7cf0adb8"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-695",
  "title": "清理应用内硬编码品牌并让白标用户表面保持中性【白标体验·用户 2026-08-04】",
  "narrative": "全局审计用户可见文案中的 `CreatorOS` 等固定品牌：产品身份确实需要展示时统一读取渠道运行时品牌并保留官方默认值，课程标题、课程角标、课程说明、引导语和示例等不需要品牌背书的位置统一改成中性文案；本轮至少将“CreatorOS IP 创作实战课”收敛为“创作实战课”，不得改动包标识、协议名、环境变量、数据目录、内部 schema 或日志诊断标识。补课程清单与关键用户表面回归测试及可见文案扫描。",
  "documents": "[白标边界](docs/research/2026-08-04-white-label-runtime-vs-package-boundary.md) · [课程架构](docs/superpowers/specs/2026-08-03-built-in-ip-course-architecture.md)",
  "source_line": "|T-695|清理应用内硬编码品牌并让白标用户表面保持中性【白标体验·用户 2026-08-04】|🔨|—|待验|[白标边界](docs/research/2026-08-04-white-label-runtime-vs-package-boundary.md) · [课程架构](docs/superpowers/specs/2026-08-03-built-in-ip-course-architecture.md)|全局审计用户可见文案中的 `CreatorOS` 等固定品牌：产品身份确实需要展示时统一读取渠道运行时品牌并保留官方默认值，课程标题、课程角标、课程说明、引导语和示例等不需要品牌背书的位置统一改成中性文案；本轮至少将“CreatorOS IP 创作实战课”收敛为“创作实战课”，不得改动包标识、协议名、环境变量、数据目录、内部 schema 或日志诊断标识。补课程清单与关键用户表面回归测试及可见文案扫描。|",
  "source_sha256": "fe51ef3073b52ca2219b52bc5fa77438b5d544c02133b8c15d1146130b796658",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-05b05bb2"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-686",
  "title": "根治定位前采联网补充直接报错并恢复国内中文公开检索【定位前采·本机实测 2026-08-04】",
  "narrative": "**范围已被用户 2026-08-05 决策覆盖：联网搜索退出定位前采主链，T-707 不调用本能力。** 若该任务继续，只能作为通用浏览器检索可靠性修复或方向生成后的用户主动可选参考，失败不得影响前采、生成方向或采纳定位，也不得把模型记忆冒充搜索结果；开始实现前须先按新范围收口任务状态，禁止继续把 `positioning.discovery.research` 接回前采页面。",
  "documents": "[T-652 前采工作流](docs/superpowers/specs/2026-08-01-positioning-pre-interview-workflow.md) · [真实浏览器旅程](orchestrator/T686-FRONTEND-JOURNEY.md) · T-684 浏览器检索",
  "source_line": "|T-686|根治定位前采联网补充直接报错并恢复国内中文公开检索【定位前采·本机实测 2026-08-04】|🔨|—|待验|[T-652 前采工作流](docs/superpowers/specs/2026-08-01-positioning-pre-interview-workflow.md) · [真实浏览器旅程](orchestrator/T686-FRONTEND-JOURNEY.md) · T-684 浏览器检索|**范围已被用户 2026-08-05 决策覆盖：联网搜索退出定位前采主链，T-707 不调用本能力。** 若该任务继续，只能作为通用浏览器检索可靠性修复或方向生成后的用户主动可选参考，失败不得影响前采、生成方向或采纳定位，也不得把模型记忆冒充搜索结果；开始实现前须先按新范围收口任务状态，禁止继续把 `positioning.discovery.research` 接回前采页面。|",
  "source_sha256": "3356ecd24fb352de630fd351fef37f035d9291e49e8bebbca09f47ac5419e8b3",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-6f478c03"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-687",
  "title": "建立口播联想画面 Skill 并打通图序号引用、项目 B-roll 与成片渲染【视觉创作主链·本机日志 2026-08-04】",
  "narrative": "从口播语义节拍生成“观众能联想到什么”的画面计划，区分事实证据、类比联想、过程示意、情绪氛围与信息卡，禁止只复述口播或批量生成通用图库图；支持 `image2`、`图2`、`第二张`、`刚才那组第二张`等会话别名确定性解析到真实候选或素材，不能再靠标题模糊搜索；用户采纳后必须原子绑定当前项目 `broll` 并刷新制作候选，视频决策只引用真实已采纳素材，成片前验证所选素材已成功解析和进入画面，缺失时明确报错而不是静默出无素材成片。Skill 只承载编导判断，别名、项目绑定、刷新和渲染校验必须由确定性代码与契约保证；按 Skill 规则先补失败基线测试再实现。",
  "documents": "[口播联想画面 Skill SPEC](docs/superpowers/specs/2026-08-04-voiceover-associative-visual-skill.md) · [T-642 编导证据链 SPEC](docs/superpowers/specs/2026-08-01-content-radar-creative-handoff.md) · T-661 项目素材制作闭环",
  "source_line": "|T-687|建立口播联想画面 Skill 并打通图序号引用、项目 B-roll 与成片渲染【视觉创作主链·本机日志 2026-08-04】|🔨|—|待验|[口播联想画面 Skill SPEC](docs/superpowers/specs/2026-08-04-voiceover-associative-visual-skill.md) · [T-642 编导证据链 SPEC](docs/superpowers/specs/2026-08-01-content-radar-creative-handoff.md) · T-661 项目素材制作闭环|从口播语义节拍生成“观众能联想到什么”的画面计划，区分事实证据、类比联想、过程示意、情绪氛围与信息卡，禁止只复述口播或批量生成通用图库图；支持 `image2`、`图2`、`第二张`、`刚才那组第二张`等会话别名确定性解析到真实候选或素材，不能再靠标题模糊搜索；用户采纳后必须原子绑定当前项目 `broll` 并刷新制作候选，视频决策只引用真实已采纳素材，成片前验证所选素材已成功解析和进入画面，缺失时明确报错而不是静默出无素材成片。Skill 只承载编导判断，别名、项目绑定、刷新和渲染校验必须由确定性代码与契约保证；按 Skill 规则先补失败基线测试再实现。|",
  "source_sha256": "ab75bae2dfa900f34c8ffca0dedb1f2ebab20d7af1be2d47c49be108cd64573f",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-dec9af38"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-685",
  "title": "排查并根治全流程写稿长度失控及审核不识别已采纳文案卡【创作主链·本机日志 2026-08-04】",
  "narrative": "以本机最新完整日志和真实项目状态串起 `script.draft` 请求、异步任务、脚本候选卡、用户采纳、正式 `output_script` 产物与 `review.script` 读取；定位文案反复过短/过长的长度约束、重试与部分结果处理问题，以及审核为何持续误判“没有采纳文案卡”。修复后目标时长只做合理区间约束，不因轻微偏差整稿失败或无效重试；采纳成功必须原子落成审核唯一读取的正式脚本并刷新回显，审核不得读取旧项目快照、聊天卡或空产物清单。",
  "documents": "[T-642 编导证据链 SPEC](docs/superpowers/specs/2026-08-01-content-radar-creative-handoff.md) · T-680 写稿可靠性",
  "source_line": "|T-685|排查并根治全流程写稿长度失控及审核不识别已采纳文案卡【创作主链·本机日志 2026-08-04】|🔨|—|待验|[T-642 编导证据链 SPEC](docs/superpowers/specs/2026-08-01-content-radar-creative-handoff.md) · T-680 写稿可靠性|以本机最新完整日志和真实项目状态串起 `script.draft` 请求、异步任务、脚本候选卡、用户采纳、正式 `output_script` 产物与 `review.script` 读取；定位文案反复过短/过长的长度约束、重试与部分结果处理问题，以及审核为何持续误判“没有采纳文案卡”。修复后目标时长只做合理区间约束，不因轻微偏差整稿失败或无效重试；采纳成功必须原子落成审核唯一读取的正式脚本并刷新回显，审核不得读取旧项目快照、聊天卡或空产物清单。|",
  "source_sha256": "a86c2f8194c489d682bd0cd40594fa8e0dac4c2405c9d554caf30001a907b784",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-66416cb0"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-684",
  "title": "根治 Copilot 联网搜素材失败后回退模型记忆并误导配置搜索模型【浏览器检索·用户截图 2026-08-04】",
  "narrative": "普通用户发起联网搜素材时须直接走随包浏览器检索，不依赖或暴露已隐藏的搜索模型配置；默认引擎导航、反爬或 SERP 解析失败/返回 0 条时，按国内中文来源优先切换备用搜索引擎并记录可诊断失败原因，全部真实检索失败则返回明确空态和可重试动作，禁止继续调用模型生成并用 `grounding=model_memory` 凑出无 URL 的“搜索结果”；清理 system prompt、工具说明和错误文案里“设置→模型→联网搜索”的旧指引。",
  "documents": "既有 `material.gather`、`web.search` 浏览器适配器与 T-645 隐藏模型配置契约",
  "source_line": "|T-684|根治 Copilot 联网搜素材失败后回退模型记忆并误导配置搜索模型【浏览器检索·用户截图 2026-08-04】|🔨|—|待验|既有 `material.gather`、`web.search` 浏览器适配器与 T-645 隐藏模型配置契约|普通用户发起联网搜素材时须直接走随包浏览器检索，不依赖或暴露已隐藏的搜索模型配置；默认引擎导航、反爬或 SERP 解析失败/返回 0 条时，按国内中文来源优先切换备用搜索引擎并记录可诊断失败原因，全部真实检索失败则返回明确空态和可重试动作，禁止继续调用模型生成并用 `grounding=model_memory` 凑出无 URL 的“搜索结果”；清理 system prompt、工具说明和错误文案里“设置→模型→联网搜索”的旧指引。|",
  "source_sha256": "6cab5dd03842e71f98ce20e412247ef52e967a8bf728ca12d26e63ea2cc36ffc",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-2899179a"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-683",
  "title": "修复 Copilot 在 Windows 无法读取盘符绝对路径与目录授权失效【本地文件读取·用户截图 2026-08-04】",
  "narrative": "`local.read` 必须按当前运行平台接受 Windows 盘符路径、UNC 路径和 `~` 家目录，同时继续接受 macOS/POSIX 路径；读取、授权判定、授权写入和目录长期授权必须共用同一规范化与包含关系，不能把 `E:\\\\...` 判为相对路径，也不能因分隔符不同导致子文件反复弹授权；工具说明须展示当前平台正确示例，模型不得再声称 Windows 文件不可读。",
  "documents": "既有 `local.read` 安全归一、HITL 授权和本地工作区契约",
  "source_line": "|T-683|修复 Copilot 在 Windows 无法读取盘符绝对路径与目录授权失效【本地文件读取·用户截图 2026-08-04】|🔨|—|待验|既有 `local.read` 安全归一、HITL 授权和本地工作区契约|`local.read` 必须按当前运行平台接受 Windows 盘符路径、UNC 路径和 `~` 家目录，同时继续接受 macOS/POSIX 路径；读取、授权判定、授权写入和目录长期授权必须共用同一规范化与包含关系，不能把 `E:\\\\...` 判为相对路径，也不能因分隔符不同导致子文件反复弹授权；工具说明须展示当前平台正确示例，模型不得再声称 Windows 文件不可读。|",
  "source_sha256": "0d563abbb2cfd95f050a3fd28774f6bcec1ff3def2ea8b81ffa8ec85e49c1cb4",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-b4a4fc97"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-679",
  "title": "接入 Growth 按激活权益签发的受管模型凭据、真实模型白名单与用户选择【模型服务最小闭环·用户 2026-08-04】",
  "narrative": "CreatorOS 在 Activity 激活并取得 `config-access-ticket-v2` 后，为文本/图片/视频同步同一权益的 persistent 受管子 Key并安全写入系统密钥库；从已签名配置动态渲染真实模型并持久化白名单内选择。语音转文字作为同一任务的 per_request 增量：兼容旧 bundle 缺 lifecycle，新 bundle 只接受精确双 service；客户端已按稳定的 API-282 合同完成文件先验、稳定幂等、单次内存临时授权、精确直连与 Whisper 单次回退，provider_unknown/expired 不换 key、不重复申请。T-768 已覆盖旧的 ASR 阻断语义：未绑定、额度不足及任何云端异常均只尝试一次本地 Whisper；T-715 额度入口可保留为提示，但不得阻断转写。用户侧不得出现中转站、provider、Base URL、serviceId、长期 Key、临时 token 或 ticket。聚焦测试已通过；非 fixture 的 Activity ticket → Growth bundle → lease → 直连转写 → 总额度减少 25,000 回执仍待真机验证，因此不得宣称 E2E 完成；Activity 不修改。",
  "documents": "[Growth 持久凭据契约](/Users/zyongzhu/Workbase/Thirdspace-growth/docs/contracts/T-133-activation-managed-model-subkey.md) · [Growth ASR 临时授权契约](/Users/zyongzhu/Workbase/Thirdspace-growth/docs/contracts/T-135-qwen-asr-direct-client.md)",
  "source_line": "|T-679|接入 Growth 按激活权益签发的受管模型凭据、真实模型白名单与用户选择【模型服务最小闭环·用户 2026-08-04】|🔨|—|待验|[Growth 持久凭据契约](/Users/zyongzhu/Workbase/Thirdspace-growth/docs/contracts/T-133-activation-managed-model-subkey.md) · [Growth ASR 临时授权契约](/Users/zyongzhu/Workbase/Thirdspace-growth/docs/contracts/T-135-qwen-asr-direct-client.md)|CreatorOS 在 Activity 激活并取得 `config-access-ticket-v2` 后，为文本/图片/视频同步同一权益的 persistent 受管子 Key并安全写入系统密钥库；从已签名配置动态渲染真实模型并持久化白名单内选择。语音转文字作为同一任务的 per_request 增量：兼容旧 bundle 缺 lifecycle，新 bundle 只接受精确双 service；客户端已按稳定的 API-282 合同完成文件先验、稳定幂等、单次内存临时授权、精确直连与 Whisper 单次回退，provider_unknown/expired 不换 key、不重复申请。T-768 已覆盖旧的 ASR 阻断语义：未绑定、额度不足及任何云端异常均只尝试一次本地 Whisper；T-715 额度入口可保留为提示，但不得阻断转写。用户侧不得出现中转站、provider、Base URL、serviceId、长期 Key、临时 token 或 ticket。聚焦测试已通过；非 fixture 的 Activity ticket → Growth bundle → lease → 直连转写 → 总额度减少 25,000 回执仍待真机验证，因此不得宣称 E2E 完成；Activity 不修改。|",
  "source_sha256": "bd7af7cc9a2174bbeea3523320aae2cd4de10e561bf9b1768bb11c10682feb2c",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-12827a62"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-678",
  "title": "根治内容雷达生成选题继续读取旧定位【定位消费一致性·飞书用户 2026-08-04】",
  "narrative": "用户保存新定位后，内容雷达新建选题必须读取当前正式定位，并在任务创建时冻结完整定位母版快照（陈述、关键词、画像、规则与版本），结果明确显示所用版本；禁止只透传旧 `positioningVersionId` 的陈述/关键词，或因路由缓存继续携带修改前内容。",
  "documents": "[T-652 定位前采 SPEC](docs/superpowers/specs/2026-08-01-positioning-pre-interview-workflow.md) · [T-642 编导证据链 SPEC](docs/superpowers/specs/2026-08-01-content-radar-creative-handoff.md)",
  "source_line": "|T-678|根治内容雷达生成选题继续读取旧定位【定位消费一致性·飞书用户 2026-08-04】|📋 待办|—|待验|[T-652 定位前采 SPEC](docs/superpowers/specs/2026-08-01-positioning-pre-interview-workflow.md) · [T-642 编导证据链 SPEC](docs/superpowers/specs/2026-08-01-content-radar-creative-handoff.md)|用户保存新定位后，内容雷达新建选题必须读取当前正式定位，并在任务创建时冻结完整定位母版快照（陈述、关键词、画像、规则与版本），结果明确显示所用版本；禁止只透传旧 `positioningVersionId` 的陈述/关键词，或因路由缓存继续携带修改前内容。|",
  "source_sha256": "1f5041748d02a76de0d1dfcab5d2c73dbf7b7fd4cd90a15bce2db78c8731b70f",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-c3d85bc7"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-677",
  "title": "优化首页与定位中心切换时整页骨架卡顿 1–2 秒【桌面交互性能·飞书用户 2026-08-03】",
  "narrative": "保留主内容稳定框架，把非首屏数据改为可分区返回/延后加载，对高频路由做可验证预热，并记录 dashboard 与定位各读源耗时；页面切换不得因共享 `(creator)/loading.tsx` 把整个主区替换成骨架，需在 macOS 用户同等数据量下验证体感和实测耗时。",
  "documents": "既有 DashboardQueryService、定位中心页面读取与 App Router loading 契约",
  "source_line": "|T-677|优化首页与定位中心切换时整页骨架卡顿 1–2 秒【桌面交互性能·飞书用户 2026-08-03】|📋 待办|—|待验|既有 DashboardQueryService、定位中心页面读取与 App Router loading 契约|保留主内容稳定框架，把非首屏数据改为可分区返回/延后加载，对高频路由做可验证预热，并记录 dashboard 与定位各读源耗时；页面切换不得因共享 `(creator)/loading.tsx` 把整个主区替换成骨架，需在 macOS 用户同等数据量下验证体感和实测耗时。|",
  "source_sha256": "1462b7035df39c2918eb8e63a2741e858be9a1c493038effcd9418eddcf3fe77",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-b6b3c6f0"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-676",
  "title": "根治云端 ASR 测试假阳性并接通 StepFun，同时修复 Windows 本地 Whisper 回退【逐字稿阻断·飞书用户 2026-08-03】",
  "narrative": "`transcribe.audio` 只能保存客户端真实支持的供应商，或提供与其协议一致的专用适配器；为 `stepaudio-2.5-asr` 接入 StepFun JSON/base64/SSE 转写链，连接测试必须走同一适配器能力而非只测 `/v1/models`。同时以用户 Windows 日志复现并根治本地 Whisper 的独立 worker/GLib 失败，确保云端配置不可用时回退不再二次失败。",
  "documents": "既有 `transcribe.audio` 多模态适配器与设置连接测试契约",
  "source_line": "|T-676|根治云端 ASR 测试假阳性并接通 StepFun，同时修复 Windows 本地 Whisper 回退【逐字稿阻断·飞书用户 2026-08-03】|📋 待办|—|待验|既有 `transcribe.audio` 多模态适配器与设置连接测试契约|`transcribe.audio` 只能保存客户端真实支持的供应商，或提供与其协议一致的专用适配器；为 `stepaudio-2.5-asr` 接入 StepFun JSON/base64/SSE 转写链，连接测试必须走同一适配器能力而非只测 `/v1/models`。同时以用户 Windows 日志复现并根治本地 Whisper 的独立 worker/GLib 失败，确保云端配置不可用时回退不再二次失败。|",
  "source_sha256": "cc4347cf65a05a5da440e859934d5bca4b6358bed85c30c700512106a1b7b50d",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-ff67d8a5"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-671",
  "title": "确定 CreatorOS 代理商业模式与官网价格边界【渠道商业化·用户 2026-08-02/03】",
  "narrative": "代理价盘与资格仍是内部经营规则，不再作为官网公开内容；官网不展示任何价格、利润、个人联系方式或直营购买入口，只引导访问者联系向其推荐 CreatorOS 的授权合作伙伴，保护代理线索和成交空间。",
  "documents": "[代理合作口径](docs/superpowers/specs/2026-08-02-creatoros-agent-channel-policy.md) · [公开信息收口](docs/superpowers/specs/2026-08-03-creatoros-public-price-contact-withdrawal.md) · [渠道白标调研](docs/research/2026-08-01-channel-white-label-runtime-branding-audit.md)",
  "source_line": "|T-671|确定 CreatorOS 代理商业模式与官网价格边界【渠道商业化·用户 2026-08-02/03】|🔨|—|待验|[代理合作口径](docs/superpowers/specs/2026-08-02-creatoros-agent-channel-policy.md) · [公开信息收口](docs/superpowers/specs/2026-08-03-creatoros-public-price-contact-withdrawal.md) · [渠道白标调研](docs/research/2026-08-01-channel-white-label-runtime-branding-audit.md)|代理价盘与资格仍是内部经营规则，不再作为官网公开内容；官网不展示任何价格、利润、个人联系方式或直营购买入口，只引导访问者联系向其推荐 CreatorOS 的授权合作伙伴，保护代理线索和成交空间。|",
  "source_sha256": "833653e90b79230d790100e90a0a46167d959f91a3b869e7d8cbd30d54bd529e",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-46779fc2"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-670",
  "title": "恢复 CreatorOS 部署前真实官网并收口公开商业信息【官网回滚纠偏·用户 2026-08-02/03】",
  "narrative": "在恢复部署前真实官网视觉和产品结构的基础上，按 T-672 删除全部公开价格、利润、个人联系方式、个人二维码与直营购买入口；保留产品能力、飞轮、设备支持和更新日志。2026-08-02 已补齐真实产品图片并修正静态资源 404 语义。",
  "documents": "[T-668 历史定价口径](docs/superpowers/specs/2026-08-02-creatoros-website-pricing.md) · [T-672 当前公开边界](docs/superpowers/specs/2026-08-03-creatoros-public-price-contact-withdrawal.md)",
  "source_line": "|T-670|恢复 CreatorOS 部署前真实官网并收口公开商业信息【官网回滚纠偏·用户 2026-08-02/03】|🔨|—|待验|[T-668 历史定价口径](docs/superpowers/specs/2026-08-02-creatoros-website-pricing.md) · [T-672 当前公开边界](docs/superpowers/specs/2026-08-03-creatoros-public-price-contact-withdrawal.md)|在恢复部署前真实官网视觉和产品结构的基础上，按 T-672 删除全部公开价格、利润、个人联系方式、个人二维码与直营购买入口；保留产品能力、飞轮、设备支持和更新日志。2026-08-02 已补齐真实产品图片并修正静态资源 404 语义。|",
  "source_sha256": "4782e0d441caa5288d26c3efd426b55fc82668e99b004f0dadba2db47d11e6ba",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-56f8de09"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-666",
  "title": "根治定位前采误清空既有定位并改为非破坏草稿切换【定位数据安全·用户 2026-08-02】",
  "narrative": "只要账号存在正式定位，进入“完全从零开始”、中途退出、刷新或访谈未完成都不得清空、替换或隐藏当前母版与历史版本；前采只写可恢复草稿，只有新定位完整生成且用户明确采纳后才新增正式版本并切换，旧版本始终可见可恢复。",
  "documents": "[定位非破坏草稿 SPEC](docs/superpowers/specs/2026-08-02-positioning-non-destructive-draft.md) · [真实浏览器旅程](orchestrator/T666-FRONTEND-JOURNEY.md) · [T-652 前采主流程](docs/superpowers/specs/2026-08-01-positioning-pre-interview-workflow.md)",
  "source_line": "|T-666|根治定位前采误清空既有定位并改为非破坏草稿切换【定位数据安全·用户 2026-08-02】|🔨|—|待验|[定位非破坏草稿 SPEC](docs/superpowers/specs/2026-08-02-positioning-non-destructive-draft.md) · [真实浏览器旅程](orchestrator/T666-FRONTEND-JOURNEY.md) · [T-652 前采主流程](docs/superpowers/specs/2026-08-01-positioning-pre-interview-workflow.md)|只要账号存在正式定位，进入“完全从零开始”、中途退出、刷新或访谈未完成都不得清空、替换或隐藏当前母版与历史版本；前采只写可恢复草稿，只有新定位完整生成且用户明确采纳后才新增正式版本并切换，旧版本始终可见可恢复。|",
  "source_sha256": "ed1d4856364368df4a821757646f80a29ff50c9df04c02f06710a146a4d58cc0",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-2a74fc1f"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-665",
  "title": "支持彻底删除内容雷达信源及其全部归属数据【信源生命周期·用户 2026-08-02】",
  "narrative": "信源卡提供明确的“删除信源与内容”动作，二次确认后由 intelligence backend service 在所有权校验和事务内删除该信源、仅归属于它的内容/逐字稿/快照/运行与任务状态；被其他信源或正式项目引用的数据按契约保留或解除关联，UI 不再继续显示已删除信源。",
  "documents": "[信源彻底删除 SPEC](docs/superpowers/specs/2026-08-02-intelligence-source-hard-delete.md) · [真实浏览器旅程](orchestrator/T665-FRONTEND-JOURNEY.md) · [内容雷达服务契约](docs/superpowers/specs/2026-07-23-content-radar-service-contract.md)",
  "source_line": "|T-665|支持彻底删除内容雷达信源及其全部归属数据【信源生命周期·用户 2026-08-02】|🔨|—|待验|[信源彻底删除 SPEC](docs/superpowers/specs/2026-08-02-intelligence-source-hard-delete.md) · [真实浏览器旅程](orchestrator/T665-FRONTEND-JOURNEY.md) · [内容雷达服务契约](docs/superpowers/specs/2026-07-23-content-radar-service-contract.md)|信源卡提供明确的“删除信源与内容”动作，二次确认后由 intelligence backend service 在所有权校验和事务内删除该信源、仅归属于它的内容/逐字稿/快照/运行与任务状态；被其他信源或正式项目引用的数据按契约保留或解除关联，UI 不再继续显示已删除信源。|",
  "source_sha256": "118f81722b6dcdadb240cac617aeb921faa3e6dc7a7783f044c09566f4b31584",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-58e4259a"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-662",
  "title": "根治成片把内部结构标签当正文并优化卡片文字重合【视频内容质量·用户 2026-08-02】",
  "narrative": "视频场景标题和卡片正文必须来自观众可读的真实口播主张，`hook/value/新闻钩子` 等内部编导标签只能做控制元数据，不能直接出现在画面；同时按真实画布安全区、文本长度和人物画面占位约束卡片排版，避免文字重合与空黑屏。",
  "documents": "[视频制作 overhaul SPEC](docs/superpowers/specs/2026-07-13-video-production-overhaul-design.md)",
  "source_line": "|T-662|根治成片把内部结构标签当正文并优化卡片文字重合【视频内容质量·用户 2026-08-02】|🔨|—|待验|[视频制作 overhaul SPEC](docs/superpowers/specs/2026-07-13-video-production-overhaul-design.md)|视频场景标题和卡片正文必须来自观众可读的真实口播主张，`hook/value/新闻钩子` 等内部编导标签只能做控制元数据，不能直接出现在画面；同时按真实画布安全区、文本长度和人物画面占位约束卡片排版，避免文字重合与空黑屏。|",
  "source_sha256": "c5dcb653591161e04d9ad3826d75d1a5515233c6c3ccac0b3425802cf2261044",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-5045e4a3"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-661",
  "title": "根治项目素材未进入制作、采纳后仍转圈及素材包图片无扩展名【制作闭环·用户 2026-08-02】",
  "narrative": "项目中已采纳或上传的截图、录屏和生成图必须从统一用料链自动进入制作候选；任务卡刷新后按持久终态停止转圈；素材包必须按真实 MIME/素材类型补安全扩展名，禁止把图片导成 Finder 识别为文稿的无后缀文件。",
  "documents": "[结构/脚本/分镜一致性 SPEC](docs/superpowers/specs/2026-07-17-structure-script-storyboard-consistency-design.md) · [素材包 SPEC](docs/superpowers/specs/2026-07-17-video-stage-three-paths-and-material-export-design.md)",
  "source_line": "|T-661|根治项目素材未进入制作、采纳后仍转圈及素材包图片无扩展名【制作闭环·用户 2026-08-02】|🔨|—|待验|[结构/脚本/分镜一致性 SPEC](docs/superpowers/specs/2026-07-17-structure-script-storyboard-consistency-design.md) · [素材包 SPEC](docs/superpowers/specs/2026-07-17-video-stage-three-paths-and-material-export-design.md)|项目中已采纳或上传的截图、录屏和生成图必须从统一用料链自动进入制作候选；任务卡刷新后按持久终态停止转圈；素材包必须按真实 MIME/素材类型补安全扩展名，禁止把图片导成 Finder 识别为文稿的无后缀文件。|",
  "source_sha256": "cecdd5e497e989605da4e2cfa5cafb744a2c2bbc966ed59ae25df330ab8d2359",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-b81f3b37"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-660",
  "title": "根治雷达预填逐字稿未解锁下一步及已采纳封面仍被判缺失【项目状态回显·用户 2026-08-02】",
  "narrative": "项目阶段状态必须从真实已保存逐字稿和项目已采纳封面素材派生，不能依赖用户再敲一次键触发本地脏状态，也不能只认某一种封面生成回写字段；修复首次进入、采纳后即时回显与刷新后回显，并补真实链路回归。",
  "documents": "[T-642 编导证据链 SPEC](docs/superpowers/specs/2026-08-01-content-radar-creative-handoff.md)",
  "source_line": "|T-660|根治雷达预填逐字稿未解锁下一步及已采纳封面仍被判缺失【项目状态回显·用户 2026-08-02】|🔨|—|待验|[T-642 编导证据链 SPEC](docs/superpowers/specs/2026-08-01-content-radar-creative-handoff.md)|项目阶段状态必须从真实已保存逐字稿和项目已采纳封面素材派生，不能依赖用户再敲一次键触发本地脏状态，也不能只认某一种封面生成回写字段；修复首次进入、采纳后即时回显与刷新后回显，并补真实链路回归。|",
  "source_sha256": "4d64817fed43e6c9965cc4eeb8f8888480d0c33b191936fbeabb1c63e4714cd1",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-aea2f729"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-655",
  "title": "接通 Seedance 文生视频适配器并修复 `seeddance` 配置报未知 provider【文生视频阻断·用户 2026-08-02】",
  "narrative": "核实当前 Seedance 配置实际使用的官方或中转协议，在现有多模态 registry 中新增真实 submit→poll→download 适配器，并兼容已经保存的 `seeddance` provider 拼写；生成失败必须给出可行动原因，禁止把已配置能力误报成不支持。",
  "documents": "既有 `video.generate` 与异步多模态 provider 契约",
  "source_line": "|T-655|接通 Seedance 文生视频适配器并修复 `seeddance` 配置报未知 provider【文生视频阻断·用户 2026-08-02】|🔨|—|—|既有 `video.generate` 与异步多模态 provider 契约|核实当前 Seedance 配置实际使用的官方或中转协议，在现有多模态 registry 中新增真实 submit→poll→download 适配器，并兼容已经保存的 `seeddance` provider 拼写；生成失败必须给出可行动原因，禁止把已配置能力误报成不支持。|",
  "source_sha256": "12ef19b83efa9a1d163e817d8d7cf8134f2954baaee2609d445470c80aa7d385",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-78b1eccf"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-654",
  "title": "新增 Qwen 方言 ASR 适配器并接入设置预设【逐字稿质量·用户 2026-08-02】",
  "narrative": "新增 `qwen-asr` 真实适配器，调用百炼 Qwen3-ASR 的 `chat/completions + input_audio`，复用安全音频分段并在设置页提供 Qwen 预设；用户只需填写模型名和 Key，未配置时仍回退本地 Whisper，普通话及方言走同一条逐字稿落库链。",
  "documents": "既有 `transcribe.audio` 与多模态 provider 适配器契约",
  "source_line": "|T-654|新增 Qwen 方言 ASR 适配器并接入设置预设【逐字稿质量·用户 2026-08-02】|🔨|—|待验|既有 `transcribe.audio` 与多模态 provider 适配器契约|新增 `qwen-asr` 真实适配器，调用百炼 Qwen3-ASR 的 `chat/completions + input_audio`，复用安全音频分段并在设置页提供 Qwen 预设；用户只需填写模型名和 Key，未配置时仍回退本地 Whisper，普通话及方言走同一条逐字稿落库链。|",
  "source_sha256": "8af814acea4140fdfdb333cbce39c49b9c0526a074f8192d4027e320fde3db5f",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-6350533d"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-653",
  "title": "支持本地自配与渠道子 Key 托管双模式模型供给【模型商业化·跨仓·用户 2026-08-02】",
  "narrative": "当前版本不实现托管子 Key：先支持“渠道下发公开模型/连接配置，用户在 CreatorOS 本机按服务填写 Key”；等中转站的建子 Key、充值、额度、用量、停用与对账协议确定后，再恢复 entitlement→受限子 Key→Growth 充值履约方案，母 Key始终不得进入客户端。",
  "documents": "[已确认方向与后置条件](docs/research/2026-08-02-activation-managed-relay-subkey-design.md)",
  "source_line": "|T-653|支持本地自配与渠道子 Key 托管双模式模型供给【模型商业化·跨仓·用户 2026-08-02】|📋 待办|待审|待验|[已确认方向与后置条件](docs/research/2026-08-02-activation-managed-relay-subkey-design.md)|当前版本不实现托管子 Key：先支持“渠道下发公开模型/连接配置，用户在 CreatorOS 本机按服务填写 Key”；等中转站的建子 Key、充值、额度、用量、停用与对账协议确定后，再恢复 entitlement→受限子 Key→Growth 充值履约方案，母 Key始终不得进入客户端。|",
  "source_sha256": "7d643ff61837e24b6bcc280bfec35657a33c05d07289298072143c55dc0506e9",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-9dfbe90f"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-650",
  "title": "知识倾倒输入框支持拖拽文件直接导入【知识录入体验·用户 2026-08-01】",
  "narrative": "用户可把当前支持的 PDF、DOCX、Markdown、TXT 文件直接拖进大输入框，获得明确拖入态、上传进度、成功结果与错误提示；拖拽必须复用现有文件导入真链路，不新增第二套解析或假上传。",
  "documents": "既有知识蒸馏与文件导入契约",
  "source_line": "|T-650|知识倾倒输入框支持拖拽文件直接导入【知识录入体验·用户 2026-08-01】|🔨|—|待验|既有知识蒸馏与文件导入契约|用户可把当前支持的 PDF、DOCX、Markdown、TXT 文件直接拖进大输入框，获得明确拖入态、上传进度、成功结果与错误提示；拖拽必须复用现有文件导入真链路，不新增第二套解析或假上传。|",
  "source_sha256": "af798c87b6d718bc3c3afd283cb119902c583ba1c1cc86c9d00fafc740d85cb3",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-da182273"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-651",
  "title": "内容雷达默认按作品真实发布时间倒序【排序语义·用户 2026-08-01】",
  "narrative": "排序项改名为「最新发布」，主排序键必须是来源作品真实 `publishedAt`、且倒序；不得以采集入库、指标快照或最后更新时间冒充发布时间。发布时间相同时再以收录时间和稳定 ID 倒序；缺失发布时间的条目置后并如实显示。",
  "documents": "内容雷达既有列表排序契约",
  "source_line": "|T-651|内容雷达默认按作品真实发布时间倒序【排序语义·用户 2026-08-01】|🔨|—|待验|内容雷达既有列表排序契约|排序项改名为「最新发布」，主排序键必须是来源作品真实 `publishedAt`、且倒序；不得以采集入库、指标快照或最后更新时间冒充发布时间。发布时间相同时再以收录时间和稳定 ID 倒序；缺失发布时间的条目置后并如实显示。|",
  "source_sha256": "8804de69bedef469a9bf71c30ccbc8c804c6d30e2fc98e6b0750e2ae813ac235",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-0e3c9c68"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-649",
  "title": "调研并设计激活后渠道白标：品牌名、应用内 Logo 与系统级图标边界【商业渠道·跨仓·用户 2026-08-01】",
  "narrative": "核对 Growth 已发布渠道配置与 CreatorOS 激活消费链，区分可在激活后运行时替换的应用内品牌、窗口标题与帮助入口，以及受 macOS/Windows 包签名、安装元数据、Dock/任务栏缓存约束而必须构建期固定的系统级应用名/图标；给出单一安装包可实现范围、需要独立渠道包的范围及最小可信扩展契约。",
  "documents": "[调研结论](docs/research/2026-08-01-channel-white-label-runtime-branding-audit.md)",
  "source_line": "|T-649|调研并设计激活后渠道白标：品牌名、应用内 Logo 与系统级图标边界【商业渠道·跨仓·用户 2026-08-01】|📋 待办|—|待验|[调研结论](docs/research/2026-08-01-channel-white-label-runtime-branding-audit.md)|核对 Growth 已发布渠道配置与 CreatorOS 激活消费链，区分可在激活后运行时替换的应用内品牌、窗口标题与帮助入口，以及受 macOS/Windows 包签名、安装元数据、Dock/任务栏缓存约束而必须构建期固定的系统级应用名/图标；给出单一安装包可实现范围、需要独立渠道包的范围及最小可信扩展契约。|",
  "source_sha256": "77f4c8319cca6104ce78f2a1ff5a93700a49a1e84130960dfb6576e51e6efc21",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-4263bc00"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-646",
  "title": "统一优化结构化 AI 工具为结果优先、分段生成与局部修复【性能与可靠性·用户 2026-08-01】",
  "narrative": "逐个审计结构化 AI 工具的 schema 复杂度、单次模型职责、重试放大与失败语义；创作内容应先产出可用结果，再补全、校验和优化，非关键字段或增强步骤失败不得清空已有结果或触发整轮疯狂重试。内容雷达部分阶段失败时必须保留检查点并提供「重试生成选题卡」入口，复用已完成阶段，只重跑失败及后续步骤，成功后自动回显。",
  "documents": "[审计待补](docs/research/2026-08-01-structured-ai-tool-reliability-audit.md)",
  "source_line": "|T-646|统一优化结构化 AI 工具为结果优先、分段生成与局部修复【性能与可靠性·用户 2026-08-01】|🔨|—|待验|[审计待补](docs/research/2026-08-01-structured-ai-tool-reliability-audit.md)|逐个审计结构化 AI 工具的 schema 复杂度、单次模型职责、重试放大与失败语义；创作内容应先产出可用结果，再补全、校验和优化，非关键字段或增强步骤失败不得清空已有结果或触发整轮疯狂重试。内容雷达部分阶段失败时必须保留检查点并提供「重试生成选题卡」入口，复用已完成阶段，只重跑失败及后续步骤，成功后自动回显。|",
  "source_sha256": "4dbbd2989a57e23f9caf1e87fb47013b2aa69b480023fde594880a03137d5dcd",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-6c31515f"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-644",
  "title": "根治 CreatorOS macOS 客户端持续闪屏【运行态阻断·用户 2026-08-01】",
  "narrative": "基于当前安装包和本机实时日志区分 WebView 重载、前端异常重渲染、窗口重复创建或进程崩溃重启；锁定可复现触发源后修复，并验证页面稳定、数据不丢且不引入启动回归。",
  "documents": "既有桌面启动、sidecar 与 WebView 日志契约",
  "source_line": "|T-644|根治 CreatorOS macOS 客户端持续闪屏【运行态阻断·用户 2026-08-01】|🔨|—|待验|既有桌面启动、sidecar 与 WebView 日志契约|基于当前安装包和本机实时日志区分 WebView 重载、前端异常重渲染、窗口重复创建或进程崩溃重启；锁定可复现触发源后修复，并验证页面稳定、数据不丢且不引入启动回归。|",
  "source_sha256": "144cd96fe85b5bb727e62dd0923551c68c3bfc42f295343fcf65f8dee1b62c46",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-a336ad57"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-643",
  "title": "收口 CreatorOS 为输入 Activity 激活码后直接授权，隐藏当前权益领取入口【商业激活主线·用户 2026-08-01】",
  "narrative": "当前只保留“输入激活码→Activity 校验/绑定/签名授权→本机保存→按 channelRef 拉配置”；不得要求用户登录 Growth、兑换商品或手动领取权益，既有 entitlement claim 代码暂不删除但退出导航、页面和当前发布验收。",
  "documents": "[跨仓唯一链路](/Users/zyongzhu/Workbase/Thirdspace-growth/docs/contracts/T-129-activation-code-single-flow.md)",
  "source_line": "|T-643|收口 CreatorOS 为输入 Activity 激活码后直接授权，隐藏当前权益领取入口【商业激活主线·用户 2026-08-01】|📋 待办|—|待验|[跨仓唯一链路](/Users/zyongzhu/Workbase/Thirdspace-growth/docs/contracts/T-129-activation-code-single-flow.md)|当前只保留“输入激活码→Activity 校验/绑定/签名授权→本机保存→按 channelRef 拉配置”；不得要求用户登录 Growth、兑换商品或手动领取权益，既有 entitlement claim 代码暂不删除但退出导航、页面和当前发布验收。|",
  "source_sha256": "ab0e068db5e2fb1635184a9874ae18a0d62a1ecf9c46c078ffdb8a062dfd2c00",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-c53f639b"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-641",
  "title": "根治发布中心“登录多日仍只有一个采集日、发布趋势不出曲线”【线上数据回流·用户 2026-07-31】",
  "narrative": "以真实账号日志和 `metric_snapshots` 为证据，核实定时作品指标采集是否逐日执行、按账号落库并被发布中心查询；多个采集日必须形成真实折线，单日继续诚实显示单点，禁止按登录天数伪造趋势。",
  "documents": "既有发布中心与抖音自动采集契约",
  "source_line": "|T-641|根治发布中心“登录多日仍只有一个采集日、发布趋势不出曲线”【线上数据回流·用户 2026-07-31】|🔨|—|待验|既有发布中心与抖音自动采集契约|以真实账号日志和 `metric_snapshots` 为证据，核实定时作品指标采集是否逐日执行、按账号落库并被发布中心查询；多个采集日必须形成真实折线，单日继续诚实显示单点，禁止按登录天数伪造趋势。|",
  "source_sha256": "864365215838005aa2eb02b561c178fcae9fd6d98ac7cf976524fb2bfa9556e8",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-e72f9443"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-640",
  "title": "配置 Apple Developer ID 签名与公证，并在前序修复全部闭环后统一产出本地安装包【发布·用户 2026-07-31】",
  "narrative": "Developer ID Application 私钥只存本机登录钥匙串，公证凭据只存 notarytool 钥匙串 profile；先完成 T-637/T-638/T-639 与既有安装包 Gate，再产出签名、公证、staple 且可通过 Gatekeeper 验证的 DMG，不把证书私钥、密码或 API Key 写进仓库和日志。",
  "documents": "[本次打包证据](orchestrator/GATE-T640-BUILD.md) · [T-575 测试发行与回滚](docs/handoffs/T-575-CreatorOS测试发行与回滚.md)",
  "source_line": "|T-640|配置 Apple Developer ID 签名与公证，并在前序修复全部闭环后统一产出本地安装包【发布·用户 2026-07-31】|🔨|—|待验|[本次打包证据](orchestrator/GATE-T640-BUILD.md) · [T-575 测试发行与回滚](docs/handoffs/T-575-CreatorOS测试发行与回滚.md)|Developer ID Application 私钥只存本机登录钥匙串，公证凭据只存 notarytool 钥匙串 profile；先完成 T-637/T-638/T-639 与既有安装包 Gate，再产出签名、公证、staple 且可通过 Gatekeeper 验证的 DMG，不把证书私钥、密码或 API Key 写进仓库和日志。|",
  "source_sha256": "a40b1eec636cc7d5b534df8e4aab256de140f663dfc18153d1b3eb64e48efc21",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-025565c5"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-633",
  "title": "恢复创作者中心自动扫码登录【线上阻断·用户 2026-07-30】",
  "narrative": "首次扫码直接打开创作者中心二维码页并复用同一按账号登录态，不再把普通抖音首页当默认入口；内容雷达改写可用性已由 T-1017 单独承接。",
  "documents": "既有抖音登录契约",
  "source_line": "|T-633|恢复创作者中心自动扫码登录【线上阻断·用户 2026-07-30】|🔨|—|待验|既有抖音登录契约|首次扫码直接打开创作者中心二维码页并复用同一按账号登录态，不再把普通抖音首页当默认入口；内容雷达改写可用性已由 T-1017 单独承接。|",
  "source_sha256": "f46f15a3f6f3a8d4dcf44ea4ac9adf3b0ee08dd41f2a660457aef9694a8b96eb",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-dcf4ee4a"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-632",
  "title": "根治“新建定位母版”无效、历史母版无法恢复与逐字稿提取长时间无结果【线上阻断·用户 2026-07-30/31】",
  "narrative": "新建定位母版须确认后直接清空当前定位并进入空白母版；重置前完整母版（画像、facets、五类规则、定位陈述）须形成不可变快照，历史恢复以追加新版本方式真实回写并刷新可读，绝不修改旧历史；旧版只留陈述、确实缺少画像快照的记录须诚实降级为“复制定位陈述”，不得假装完整恢复。按真实日志拆解逐字稿任务排队、媒体处理与模型调用耗时，修复阻塞且呈现诚实反馈。",
  "documents": "[GATE](orchestrator/GATE-T632-BUILD.md)",
  "source_line": "|T-632|根治“新建定位母版”无效、历史母版无法恢复与逐字稿提取长时间无结果【线上阻断·用户 2026-07-30/31】|🔨|—|待验|[GATE](orchestrator/GATE-T632-BUILD.md)|新建定位母版须确认后直接清空当前定位并进入空白母版；重置前完整母版（画像、facets、五类规则、定位陈述）须形成不可变快照，历史恢复以追加新版本方式真实回写并刷新可读，绝不修改旧历史；旧版只留陈述、确实缺少画像快照的记录须诚实降级为“复制定位陈述”，不得假装完整恢复。按真实日志拆解逐字稿任务排队、媒体处理与模型调用耗时，修复阻塞且呈现诚实反馈。|",
  "source_sha256": "37bb13b84d8683ecbd5bf901f595f6762fa911f5c24b993ba18f7721200e3c2b",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-f2d5f891"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-631",
  "title": "根治大视频上传被 10MB 截断并误报 ffmpeg 缺失【线上阻断·用户 2026-07-30】",
  "narrative": "修复桌面本地 blob 大文件上传截断，complete 前校验声明大小与实际大小，并把 `moov atom not found` 等素材损坏错误与二进制缺失严格分流；聚焦回归后产出本地安装包。",
  "documents": "[既有视频执行 SPEC](docs/superpowers/specs/2026-07-11-execution-layer-video-pipeline-design.md)",
  "source_line": "|T-631|根治大视频上传被 10MB 截断并误报 ffmpeg 缺失【线上阻断·用户 2026-07-30】|🔨|—|待验|[既有视频执行 SPEC](docs/superpowers/specs/2026-07-11-execution-layer-video-pipeline-design.md)|修复桌面本地 blob 大文件上传截断，complete 前校验声明大小与实际大小，并把 `moov atom not found` 等素材损坏错误与二进制缺失严格分流；聚焦回归后产出本地安装包。|",
  "source_sha256": "9f3c7d1bc2f18dac9f89e9f011af63734c95294ada4c1312849adb8a85fc535a",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-d8014cab"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-621",
  "title": "补齐渠道模型 authority snapshot 生产链路回归【非阻断测试增强·T-606 复核】",
  "narrative": "补 `createTask → persistence → authority change → cancel/no provider call` 完整链路证据，不改变已确认契约。",
  "documents": "[绑定契约](docs/superpowers/specs/2026-07-29-creatoros-channel-model-authority.contract.md)",
  "source_line": "|T-621|补齐渠道模型 authority snapshot 生产链路回归【非阻断测试增强·T-606 复核】|📋 待办|—|—|[绑定契约](docs/superpowers/specs/2026-07-29-creatoros-channel-model-authority.contract.md)|补 `createTask → persistence → authority change → cancel/no provider call` 完整链路证据，不改变已确认契约。|",
  "source_sha256": "4e5d59ce5ee6fba58e2c46f08f7b2926051c3481d55e5427c786c57f9c87d969",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-ccfd0b0b"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-576",
  "title": "统一跟进尚未关闭的飞书线上用户反馈【线上支持】",
  "narrative": "只负责新反馈分诊、进度同步和邮件闭环；故障实现由各自任务承接，未真机解决不得提前结案。",
  "documents": "[反馈表](https://my.feishu.cn/base/S1BRb4i6kaD0bnsViJSco0jxnRg?table=tblIPu0er91yGTwL&view=vewb4HsOUz)",
  "source_line": "|T-576|统一跟进尚未关闭的飞书线上用户反馈【线上支持】|🔨 免审|—|—|[反馈表](https://my.feishu.cn/base/S1BRb4i6kaD0bnsViJSco0jxnRg?table=tblIPu0er91yGTwL&view=vewb4HsOUz)|只负责新反馈分诊、进度同步和邮件闭环；故障实现由各自任务承接，未真机解决不得提前结案。|",
  "source_sha256": "e03e33600e051095794a2840914428dece8d52ae594272f68495585a2ca8f325",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-df42b3ef"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-575",
  "title": "接通 CreatorOS 权益领取、渠道配置与问题反馈【跨系统上线闭环】",
  "narrative": "本地链路已通过；待真实发布材料、live HTTPS 三仓 E2E、双平台凭据后端与正式发布许可。",
  "documents": "[SPEC](docs/superpowers/specs/2026-07-27-t076-creator-three-system-launch.md) · [Gate](orchestrator/GATE-T575-BUILD.md)",
  "source_line": "|T-575|接通 CreatorOS 权益领取、渠道配置与问题反馈【跨系统上线闭环】|🔨 本地PASS·待生产E2E|—|待验|[SPEC](docs/superpowers/specs/2026-07-27-t076-creator-three-system-launch.md) · [Gate](orchestrator/GATE-T575-BUILD.md)|本地链路已通过；待真实发布材料、live HTTPS 三仓 E2E、双平台凭据后端与正式发布许可。|",
  "source_sha256": "7e4cde6cc687bfa6ba1b35d49e9f6e0c923c15ee09f069bbf9b1061e9bf30b05",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-5e843517"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-562",
  "title": "根治 CreatorOS 0.2.0 Windows 安装后持续白屏【发布阻断】",
  "narrative": "待真实启动链取证并修复 sidecar/WebView 导航；新包须通过安装后启动、health ready 与非白屏交互 Gate。",
  "documents": "[SPEC](docs/superpowers/specs/2026-07-23-desktop-packaging-first-launch-design.md) · [复盘](docs/research/2026-07-24-windows-first-launch-white-screen.md)",
  "source_line": "|T-562|根治 CreatorOS 0.2.0 Windows 安装后持续白屏【发布阻断】|🔨 免审|—|待验|[SPEC](docs/superpowers/specs/2026-07-23-desktop-packaging-first-launch-design.md) · [复盘](docs/research/2026-07-24-windows-first-launch-white-screen.md)|待真实启动链取证并修复 sidecar/WebView 导航；新包须通过安装后启动、health ready 与非白屏交互 Gate。|",
  "source_sha256": "6a01b7bfa9033eccb17be79777ef9830b08dfa83dacfa9684a5eb481f34fe8e6",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-ac33acfc"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-548",
  "title": "根治视频渲染重试后成片脱离项目且制作页实时预览消失【发布阻断·用户 2026-07-26】",
  "narrative": "重试 taskId 回传、项目/output/usage 幂等关联、export、内联预览恢复和图片 B-roll MIME 分流均已实现并通过聚焦测试；仅保留安装版真实渲染、成片回放与素材使用记录验收。",
  "documents": "[既有 T-292/T-254 规格](docs/superpowers/specs/2026-07-13-video-production-overhaul-design.md)",
  "source_line": "|T-548|根治视频渲染重试后成片脱离项目且制作页实时预览消失【发布阻断·用户 2026-07-26】|🔨 待安装版真机|—|待验|[既有 T-292/T-254 规格](docs/superpowers/specs/2026-07-13-video-production-overhaul-design.md)|重试 taskId 回传、项目/output/usage 幂等关联、export、内联预览恢复和图片 B-roll MIME 分流均已实现并通过聚焦测试；仅保留安装版真实渲染、成片回放与素材使用记录验收。|",
  "source_sha256": "ba0ae255bbc521729501a4862eb6ef05eb67c3de699d0e918f91fdbc7abbacb6",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-c5675e28"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-538",
  "title": "接通渠道签名上下文的产品问题反馈【跨仓契约·上线闭环】",
  "narrative": "本地可信提交、失败保留和幂等重试已通过；待正式接口部署、发布 origin、真实激活码三系统 E2E 与独立复核。",
  "documents": "[契约](/Users/zyongzhu/Workbase/Thirdspace-growth/docs/contracts/channel-bound-product-feedback-v1.md) · [Gate](orchestrator/GATE-T538-BUILD.md)",
  "source_line": "|T-538|接通渠道签名上下文的产品问题反馈【跨仓契约·上线闭环】|🔨 本地PASS·待生产E2E|—|待验|[契约](/Users/zyongzhu/Workbase/Thirdspace-growth/docs/contracts/channel-bound-product-feedback-v1.md) · [Gate](orchestrator/GATE-T538-BUILD.md)|本地可信提交、失败保留和幂等重试已通过；待正式接口部署、发布 origin、真实激活码三系统 E2E 与独立复核。|",
  "source_sha256": "f491aec2ad5b16e7f69bc28613b8780f1bc085179e794d0c61dbce737869642d",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```

<a id="m-71a0f48e"></a>
```backlog-task-metadata
{
  "schema": "backlog-task-metadata/v1",
  "id": "T-536",
  "title": "根治“我的收藏”同步错误分类与浏览器档案锁恢复【bug·多账号采集·用户 2026-07-26】",
  "narrative": "代码已提交 `85312bd2`：跨 chunk 错误按稳定 code 恢复、无活 context 才精准清锁且只重试一次、诊断脱敏、UI 给恢复动作；定向 130 tests、typecheck、build、boundary 通过，待有效登录态做真实收藏只读验收。",
  "documents": "无 SPEC（既有收藏读取链故障）",
  "source_line": "|T-536|根治“我的收藏”同步错误分类与浏览器档案锁恢复【bug·多账号采集·用户 2026-07-26】|🔨 待真实账号只读验收|—|待验|无 SPEC（既有收藏读取链故障）|代码已提交 `85312bd2`：跨 chunk 错误按稳定 code 恢复、无活 context 才精准清锁且只重试一次、诊断脱敏、UI 给恢复动作；定向 130 tests、typecheck、build、boundary 通过，待有效登录态做真实收藏只读验收。|",
  "source_sha256": "5483c9fadb3b6ca266f9ef5baa3efe2e5afd89b7027b84fde3c670416e37e62f",
  "source_columns": [
    "ID",
    "任务",
    "状态",
    "审核",
    "验收",
    "文档",
    "一句话"
  ]
}
```
