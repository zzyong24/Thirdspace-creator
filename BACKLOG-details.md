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

| T-633 | 根治内容雷达生成选题卡失败并恢复创作者中心自动扫码【线上阻断·用户 2026-07-30】 | 🔨 待办 | — | 待验 | 既有内容雷达与抖音登录契约 | 按最新日志修复 `topic_preview` 真实失败链；首次扫码直接打开创作者中心二维码页并复用同一按账号登录态，不再把普通抖音首页当默认入口。 |

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
